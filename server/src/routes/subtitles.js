import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

const execAsync = promisify(exec);
const router = Router();

// Sanitize videoId — only allow YouTube-safe chars
function isValidVideoId(id) {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

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
      // Remove all XML/VTT tags (including yt-dlp <c>, <00:00:01.000>, etc.)
      const text = textLines.join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ').trim();
      if (text && a && b) {
        raw.push({ start: vttSec(a), duration: vttSec(b) - vttSec(a), text });
      }
    }
    i++;
  }

  // yt-dlp auto-subs repeat each cue twice with same text but different duration.
  // Keep the version with the LONGEST duration for each (start, text) pair.
  const best = new Map();
  for (const seg of raw) {
    if (seg.duration < 0.1) continue; // skip near-zero duration cues
    const key = `${seg.start.toFixed(2)}|${seg.text}`;
    if (!best.has(key) || seg.duration > best.get(key).duration) {
      best.set(key, seg);
    }
  }
  return [...best.values()].sort((a, b) => a.start - b.start);
}

function vttSec(t) {
  const p = t.split(':');
  return p.length === 3
    ? +p[0] * 3600 + +p[1] * 60 + parseFloat(p[2])
    : +p[0] * 60 + parseFloat(p[1]);
}

// GET /api/subtitles?v=<videoId>&lang=en
router.get('/', async (req, res) => {
  const { v: videoId, lang = 'en' } = req.query;

  if (!videoId || !isValidVideoId(videoId)) {
    return res.status(400).json({ error: 'Invalid or missing video ID' });
  }

  // Only allow safe lang codes
  const safeLang = String(lang).replace(/[^a-z-]/g, '').slice(0, 10) || 'en';

  // Attempt 0: youtube-transcript library (works when yt-dlp is blocked by cloud IP)
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: safeLang });
    if (transcript && transcript.length) {
      const segments = transcript.map(item => ({
        start: item.offset / 1000,
        duration: item.duration / 1000,
        text: item.text.replace(/\n/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
      }));
      return res.json({ segments, lang: safeLang });
    }
  } catch {}

  // Fallback to en if requested lang failed
  if (safeLang !== 'en') {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
      if (transcript && transcript.length) {
        const segments = transcript.map(item => ({
          start: item.offset / 1000,
          duration: item.duration / 1000,
          text: item.text.replace(/\n/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
        }));
        return res.json({ segments, lang: 'en', requestedLang: safeLang });
      }
    } catch {}
  }

  const tmpDir = os.tmpdir();
  const tmpBase = path.join(tmpDir, `audir_${videoId}_${Date.now()}`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  function findVttFile() {
    const files = fs.readdirSync(tmpDir).filter(
      f => f.startsWith(path.basename(tmpBase)) && f.endsWith('.vtt')
    );
    return files.length ? path.join(tmpDir, files[0]) : null;
  }

  function cleanup() {
    try {
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(path.basename(tmpBase)));
      files.forEach(f => { try { fs.unlinkSync(path.join(tmpDir, f)); } catch {} });
    } catch {}
  }

  const errors = [];

  // Helper: try to download subtitles for given lang codes, returns {segments, actualLang} or null
  async function tryDownload(langCodes, autoSubs) {
    const flag = autoSubs ? '--write-auto-subs' : '--write-subs';
    const subLangs = langCodes.join(',');
    try {
      await execAsync(
        `yt-dlp --skip-download ${flag} --sub-langs "${subLangs}" --sub-format vtt -o "${tmpBase}" "${url}"`,
        { timeout: 30000 }
      );
      const vttFile = findVttFile();
      if (!vttFile) return null;
      const content = fs.readFileSync(vttFile, 'utf-8');
      // Detect actual lang from filename e.g. "audir_xxx.es.vtt"
      const actualLang = vttFile.match(/\.([a-z]{2,5})\.vtt$/i)?.[1] ?? safeLang;
      const segments = parseVTT(content);
      return segments.length ? { segments, actualLang } : null;
    } catch {
      return null;
    }
  }

  // Attempt 1: requested language auto-subs (works for native-language videos)
  const langVariants = [...new Set([safeLang, `${safeLang}-419`, `${safeLang}-${safeLang.toUpperCase()}`])];
  let result = await tryDownload(langVariants, true);
  if (result) { cleanup(); return res.json({ segments: result.segments, lang: result.actualLang }); }
  errors.push(`auto-subs (${safeLang}): no result`);

  // Attempt 2: requested language manual subs
  result = await tryDownload(langVariants, false);
  if (result) { cleanup(); return res.json({ segments: result.segments, lang: result.actualLang }); }
  errors.push(`manual-subs (${safeLang}): no result`);

  // Attempt 3: fallback — any auto-subs available (usually video's native language)
  // This handles case where requested lang is unavailable (e.g. translated subs blocked by YT)
  result = await tryDownload(['en', 'en-orig'], true);
  if (result) { cleanup(); return res.json({ segments: result.segments, lang: result.actualLang, requestedLang: safeLang }); }

  result = await tryDownload(['es', 'es-419'], true);
  if (result) { cleanup(); return res.json({ segments: result.segments, lang: result.actualLang, requestedLang: safeLang }); }

  // Last resort: download whatever language is available
  try {
    await execAsync(
      `yt-dlp --skip-download --write-auto-subs --sub-format vtt -o "${tmpBase}" "${url}"`,
      { timeout: 30000 }
    );
    const vttFile = findVttFile();
    if (vttFile) {
      const content = fs.readFileSync(vttFile, 'utf-8');
      const actualLang = vttFile.match(/\.([a-z]{2,5})\.vtt$/i)?.[1] ?? 'en';
      cleanup();
      const segments = parseVTT(content);
      if (segments.length) return res.json({ segments, lang: actualLang, requestedLang: safeLang });
      errors.push('any-auto-subs: 0 segments');
    } else {
      errors.push('any-auto-subs: no vtt file');
    }
  } catch (e) {
    errors.push(`any-auto-subs: ${e.message?.split('\n')[0]}`);
  }

  cleanup();
  res.status(404).json({ error: 'No subtitles found', details: errors.join('\n') });
});

export default router;
