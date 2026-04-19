import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);
const router = Router();

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

const uploadFields = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

function parseVTT(content) {
  const lines = content.split('\n');
  const raw = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->') && !line.startsWith('NOTE')) {
      const [a, b] = line.split('-->').map(s => s.trim().split(' ')[0]);
      const textLines = [];
      i++;
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i].trim());
        i++;
      }
      const text = textLines.join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();
      if (text && a && b) raw.push({ start: vttSec(a), duration: vttSec(b) - vttSec(a), text });
    }
    i++;
  }
  const best = new Map();
  for (const seg of raw) {
    if (seg.duration < 0.1) continue;
    const key = `${seg.start.toFixed(2)}|${seg.text}`;
    if (!best.has(key) || seg.duration > best.get(key).duration) best.set(key, seg);
  }
  return [...best.values()].sort((a, b) => a.start - b.start);
}

function vttSec(t) {
  const p = t.split(':');
  return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + parseFloat(p[2]) : +p[0] * 60 + parseFloat(p[1]);
}

// GET /api/transcribe/check
router.get('/check', async (req, res) => {
  const results = {};
  try {
    const { stdout } = await execAsync('python3 -c "import whisper; print(\'ok\')"');
    results.python3 = stdout.trim();
    return res.json({ available: true, debug: results });
  } catch (e) {
    results.python3_error = e.message?.slice(0, 200);
  }
  try {
    const { stdout } = await execAsync('python -c "import whisper; print(\'ok\')"');
    results.python = stdout.trim();
    return res.json({ available: true, debug: results });
  } catch (e) {
    results.python_error = e.message?.slice(0, 200);
  }
  res.json({ available: false, debug: results });
});

// POST /api/transcribe — upload video or audio, transcribe with Whisper
router.post('/', uploadFields, async (req, res) => {
  const file = req.files?.video?.[0] || req.files?.audio?.[0];
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const isAudio = !req.files?.video?.[0];
  const inputPath = file.path;
  const audioPath = inputPath + '.wav';
  const outDir = os.tmpdir();

  function cleanup() {
    for (const f of [inputPath, audioPath]) {
      try { fs.unlinkSync(f); } catch {}
    }
    // Clean whisper output files
    try {
      fs.readdirSync(outDir)
        .filter(f => f.startsWith(path.basename(inputPath)))
        .forEach(f => { try { fs.unlinkSync(path.join(outDir, f)); } catch {} });
    } catch {}
  }

  try {
    const lang = req.body.lang || 'en';

    // Step 1: extract/convert audio with ffmpeg
    // For audio files: just convert to WAV (no -vn needed but harmless)
    // For video files: -vn strips video stream
    const ffmpegFlags = isAudio ? '' : '-vn';
    await execAsync(
      `"${FFMPEG}" -i "${inputPath}" ${ffmpegFlags} -ar 16000 -ac 1 -c:a pcm_s16le "${audioPath}" -y`,
      { timeout: 120000 }
    );

    if (!fs.existsSync(audioPath)) {
      cleanup();
      return res.status(500).json({ error: isAudio ? 'Failed to convert audio file' : 'Failed to extract audio from video' });
    }

    // Step 2: transcribe with Whisper via Python
    const scriptPath = path.join(outDir, 'whisper_run.py');
    const outVttPath = path.join(outDir, path.basename(audioPath).replace('.wav', '') + '.vtt');

    const pyScript = `
import whisper, json, sys
model = whisper.load_model("base")
result = model.transcribe(r"${audioPath.replace(/\\/g, '\\\\')}", language="${lang}", task="transcribe")

# Write VTT
def fmt(s):
    h,r = divmod(int(s*1000),3600000); m,r = divmod(r,60000); sec,ms = divmod(r,1000)
    return f"{h:02}:{m:02}:{sec:02}.{ms:03}"

lines = ["WEBVTT",""]
for i,seg in enumerate(result["segments"],1):
    lines += [str(i), f"{fmt(seg['start'])} --> {fmt(seg['end'])}", seg['text'].strip(), ""]

with open(r"${outVttPath.replace(/\\/g, '\\\\')}", "w", encoding="utf-8") as f:
    f.write("\\n".join(lines))
print("done")
`;

    fs.writeFileSync(scriptPath, pyScript, 'utf-8');

    const pythonBin = await execAsync('which python3').then(() => 'python3').catch(() => 'python');
    await execAsync(`${pythonBin} "${scriptPath}"`, { timeout: 600000 });

    let vttContent = '';
    if (fs.existsSync(outVttPath)) {
      vttContent = fs.readFileSync(outVttPath, 'utf-8');
    } else {
      // Search for any new vtt in tmpdir as fallback
      const files = fs.readdirSync(outDir).filter(f => f.endsWith('.vtt') && f !== 'whisper_run.vtt');
      if (files.length) vttContent = fs.readFileSync(path.join(outDir, files[0]), 'utf-8');
    }

    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(outVttPath); } catch {}

    cleanup();

    if (!vttContent) {
      res.write(JSON.stringify({ error: 'Transcription produced no output' }) + '\n');
      return res.end();
    }

    const segments = parseVTT(vttContent);
    if (!segments.length) {
      res.write(JSON.stringify({ error: 'Could not parse transcription output' }) + '\n');
      return res.end();
    }

    res.write(JSON.stringify({ segments, lang }) + '\n');
    res.end();

  } catch (e) {
    cleanup();
    res.write(JSON.stringify({ error: e.message?.split('\n')[0] ?? 'Transcription failed' }) + '\n');
    res.end();
  }
});

export default router;
