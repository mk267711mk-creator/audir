import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

function decodeHtml(text) {
  return text
    .replace(/\n/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function mapTranscript(transcript) {
  return transcript.map(item => ({
    start: item.offset / 1000,
    duration: item.duration / 1000,
    text: decodeHtml(item.text),
  }));
}

// Try to fetch subtitles for a YouTube video ID.
// Tries requested lang first, then falls back to 'en'.
// Returns array of { start, duration, text } or throws.
export async function fetchSubtitles(videoId, lang = 'en') {
  // Try requested language
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
    if (transcript && transcript.length > 0) {
      return { segments: mapTranscript(transcript), lang };
    }
  } catch {}

  // Fallback to English
  if (lang !== 'en') {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
      if (transcript && transcript.length > 0) {
        return { segments: mapTranscript(transcript), lang: 'en' };
      }
    } catch {}
  }

  throw new Error('Субтитры не найдены. Убедись, что у видео есть субтитры на YouTube.');
}
