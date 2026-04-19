import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
import SrtParser from 'srt-parser-2';
import fs from 'fs';

/**
 * Fetch subtitles from YouTube video ID
 * Returns array of { start, duration, text }
 */
export async function fetchYouTubeSubtitles(videoId) {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
  return transcript.map(item => ({
    start: item.offset / 1000,
    duration: item.duration / 1000,
    text: item.text.replace(/\n/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'"),
  }));
}

/**
 * Parse SRT file content into subtitle segments
 */
export function parseSRT(content) {
  const parser = new SrtParser();
  const items = parser.fromSrt(content);
  return items.map(item => ({
    start: item.startSeconds,
    duration: item.endSeconds - item.startSeconds,
    text: item.text.replace(/<[^>]+>/g, '').replace(/\n/g, ' '),
  }));
}

/**
 * Parse VTT file content
 */
export function parseVTT(content) {
  const lines = content.split('\n');
  const segments = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->').map(s => s.trim());
      const start = vttTimeToSeconds(startStr);
      const end = vttTimeToSeconds(endStr);
      const textLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim().replace(/<[^>]+>/g, ''));
        i++;
      }
      const text = textLines.join(' ');
      if (text) {
        segments.push({ start, duration: end - start, text });
      }
    }
    i++;
  }
  return segments;
}

function vttTimeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

/**
 * Extract YouTube video ID from URL
 */
export function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
