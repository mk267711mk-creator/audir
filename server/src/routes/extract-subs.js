import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);
const router = Router();

// ffmpeg may not be in PATH — check common locations
const FFMPEG_CANDIDATES = [
  'ffmpeg',
  'ffprobe',
  String.raw`C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe`,
];
const FFPROBE_CANDIDATES = [
  'ffprobe',
  String.raw`C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffprobe.exe`,
];

async function findBin(candidates) {
  for (const bin of candidates) {
    try { await execAsync(`"${bin}" -version`); return bin; } catch {}
  }
  return null;
}

let FFMPEG = null;
let FFPROBE = null;

async function ensureBins() {
  if (!FFMPEG) FFMPEG = await findBin(FFMPEG_CANDIDATES);
  if (!FFPROBE) FFPROBE = await findBin(FFPROBE_CANDIDATES);
  return FFMPEG && FFPROBE;
}

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

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
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ').trim();
      if (text && a && b) raw.push({ start: vttSec(a), duration: vttSec(b) - vttSec(a), text });
    }
    i++;
  }
  // Deduplicate
  const best = new Map();
  for (const seg of raw) {
    if (seg.duration < 0.1) continue;
    const key = `${seg.start.toFixed(2)}|${seg.text}`;
    if (!best.has(key) || seg.duration > best.get(key).duration) best.set(key, seg);
  }
  return [...best.values()].sort((a, b) => a.start - b.start);
}

function parseSRT(content) {
  const segments = [];
  for (const block of content.trim().split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;
    const [a, b] = timeLine.split('-->').map(s => s.trim());
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) segments.push({ start: srtSec(a), duration: srtSec(b) - srtSec(a), text });
  }
  return segments;
}

function vttSec(t) {
  const p = t.split(':');
  return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + parseFloat(p[2]) : +p[0] * 60 + parseFloat(p[1]);
}
function srtSec(t) {
  return vttSec(t.replace(',', '.'));
}

// GET /api/extract-subs/check — check if ffmpeg is available
router.get('/check', async (req, res) => {
  const ok = await ensureBins();
  res.json({ available: !!ok });
});

// POST /api/extract-subs — upload video, extract embedded subtitles
router.post('/', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file' });

  const inputPath = req.file.path;
  const outBase = inputPath + '_subs';

  function cleanup() {
    try { fs.unlinkSync(inputPath); } catch {}
    try {
      const files = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(path.basename(outBase)));
      files.forEach(f => { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {}});
    } catch {}
  }

  try {
    if (!await ensureBins()) {
      cleanup();
      return res.status(500).json({ error: 'ffmpeg not found on server' });
    }

    // First: list subtitle streams in the video
    const { stdout: probeOut } = await execAsync(
      `"${FFPROBE}" -v quiet -print_format json -show_streams "${inputPath}"`,
      { timeout: 15000 }
    );
    const info = JSON.parse(probeOut);
    const subStreams = (info.streams || []).filter(s => s.codec_type === 'subtitle');

    if (!subStreams.length) {
      cleanup();
      return res.status(404).json({ error: 'No embedded subtitle tracks found in this video' });
    }

    // Pick best subtitle stream: prefer English, then first available
    const preferred = subStreams.find(s => s.tags?.language?.startsWith('en'))
      ?? subStreams.find(s => !s.tags?.language)
      ?? subStreams[0];

    const streamIndex = preferred.index;
    const lang = preferred.tags?.language ?? 'en';

    // Extract to VTT
    const outVtt = outBase + '.vtt';
    try {
      await execAsync(
        `"${FFMPEG}" -i "${inputPath}" -map 0:${streamIndex} "${outVtt}" -y`,
        { timeout: 60000 }
      );
      if (fs.existsSync(outVtt)) {
        const content = fs.readFileSync(outVtt, 'utf-8');
        const segments = parseVTT(content);
        cleanup();
        if (segments.length) return res.json({ segments, lang });
      }
    } catch {}

    // Fallback: extract to SRT
    const outSrt = outBase + '.srt';
    await execAsync(
      `"${FFMPEG}" -i "${inputPath}" -map 0:${streamIndex} "${outSrt}" -y`,
      { timeout: 60000 }
    );
    const content = fs.readFileSync(outSrt, 'utf-8');
    const segments = parseSRT(content);
    cleanup();

    if (!segments.length) return res.status(404).json({ error: 'Subtitle track is empty' });
    res.json({ segments, lang });

  } catch (e) {
    cleanup();
    res.status(500).json({ error: e.message?.split('\n')[0] ?? 'Extraction failed' });
  }
});

export default router;
