import { CapacitorHttp } from '@capacitor/core';

export interface SubtitleSegment {
  start: number;
  duration: number;
  text: string;
}

// Backend server URL — empty string means same origin (works via Vite proxy in browser)
// For mobile/Capacitor set VITE_BACKEND_URL=http://192.168.x.x:3001 in .env
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || '';

const WORKER_URL = 'https://audir-subs.audir-app.workers.dev';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';
const YT_COOKIE = 'CONSENT=YES+42; SOCS=CAESEwgDEgk0OTI5MDE0NzIaAmVuIAEaBgiAkOWlBg';

const BROWSER_HEADERS = {
  'User-Agent': UA_DESKTOP,
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Cookie': YT_COOKIE,
};

export function extractYouTubeId(input: string): string | null {
  const url = input.trim().replace(/\s+/g, '');
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

export async function fetchYouTubeTranscript(videoId: string, lang = 'en'): Promise<SubtitleSegment[]> {
  const errors: string[] = [];

  // ── Method 0: backend server via yt-dlp (most reliable) ─────────────────────
  try {
    const resp = await fetch(`${BACKEND_URL}/api/subtitles?v=${videoId}&lang=${lang}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.segments?.length > 0) {
        // Attach actualLang so the caller can store the real subtitle language
        const result = data.segments as SubtitleSegment[];
        (result as any).actualLang = data.lang ?? lang;
        return result;
      }
      errors.push('backend: 0 segments');
    } else {
      const data = await resp.json().catch(() => ({}));
      errors.push(`backend: ${data.error || resp.statusText}`);
    }
  } catch (e: any) {
    errors.push(`backend: ${e.message}`);
  }

  // ── Method 1: scrape YouTube watch page (desktop UA) ────────────────────────
  try {
    const segs = await fetchViaPageNative(videoId, UA_DESKTOP);
    if (segs.length > 0) return segs;
    errors.push('page-desktop: 0 segments');
  } catch (e: any) {
    errors.push(`page-desktop: ${e.message}`);
  }

  // ── Method 2: scrape YouTube watch page (mobile UA) ──────────────────────────
  try {
    const segs = await fetchViaPageNative(videoId, UA_MOBILE);
    if (segs.length > 0) return segs;
    errors.push('page-mobile: 0 segments');
  } catch (e: any) {
    errors.push(`page-mobile: ${e.message}`);
  }

  // ── Method 3: InnerTube ANDROID client ──────────────────────────────────────
  try {
    const segs = await fetchViaInnerTubeNative(videoId, 'ANDROID', '19.09.37', '3', {
      androidSdkVersion: 30,
      userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip',
    });
    if (segs.length > 0) return segs;
    errors.push('android: 0 segments');
  } catch (e: any) {
    errors.push(`android: ${e.message}`);
  }

  // ── Method 4: InnerTube IOS client ──────────────────────────────────────────
  try {
    const segs = await fetchViaInnerTubeNative(videoId, 'IOS', '19.09.3', '5', {
      deviceModel: 'iPhone16,2',
    });
    if (segs.length > 0) return segs;
    errors.push('ios: 0 segments');
  } catch (e: any) {
    errors.push(`ios: ${e.message}`);
  }

  // ── Method 5: timedtext XML (not JSON) ──────────────────────────────────────
  try {
    const segs = await fetchViaTimedtextXml(videoId);
    if (segs.length > 0) return segs;
    errors.push('timedtext-xml: 0 segments');
  } catch (e: any) {
    errors.push(`timedtext-xml: ${e.message}`);
  }

  // ── Method 6: Cloudflare Worker (last resort) ────────────────────────────────
  try {
    const data = await nativeGetJson(`${WORKER_URL}?v=${videoId}`);
    if (data?.error) throw new Error(data.error);
    const segs = parseJson3(data);
    if (segs.length > 0) return segs;
    errors.push('worker: 0 segments');
  } catch (e: any) {
    errors.push(`worker: ${e.message}`);
  }

  throw new Error(errors.join('\n'));
}

// ── Scrape YouTube watch page from device ─────────────────────────────────────

async function fetchViaPageNative(videoId: string, userAgent: string): Promise<SubtitleSegment[]> {
  const headers = { ...BROWSER_HEADERS, 'User-Agent': userAgent };
  let html: string;
  try {
    const resp = await Promise.race([
      CapacitorHttp.get({ url: `https://www.youtube.com/watch?v=${videoId}&hl=en`, headers, responseType: 'text' }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]) as any;
    html = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
  } catch {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { headers, signal: ctrl.signal });
      html = await r.text();
    } finally {
      clearTimeout(t);
    }
  }

  if (html.includes('consent.youtube.com') || html.includes('before-you-continue')) {
    throw new Error('consent/bot page, html len=' + html.length);
  }
  if (!html.includes('ytInitialPlayerResponse') && html.length < 5000) {
    throw new Error('short page, len=' + html.length + ' start=' + html.slice(0, 200));
  }

  const playerJson = extractJsonFromPage(html, 'ytInitialPlayerResponse');
  if (!playerJson) throw new Error('ytInitialPlayerResponse not found');

  const data = JSON.parse(playerJson);
  const tracks: any[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) throw new Error('no caption tracks');

  // Prefer manual English > auto English > any auto > first
  const track =
    tracks.find(t => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
    tracks.find(t => t.languageCode?.startsWith('en')) ??
    tracks.find(t => t.kind === 'asr') ??
    tracks[0];

  const captData = await nativeGetJson(track.baseUrl + '&fmt=json3');
  return parseJson3(captData);
}

// ── InnerTube POST via CapacitorHttp ──────────────────────────────────────────

async function fetchViaInnerTubeNative(
  videoId: string,
  clientName: string,
  clientVersion: string,
  clientId: string,
  extra: Record<string, unknown>
): Promise<SubtitleSegment[]> {
  const payload = {
    videoId,
    context: {
      client: { clientName, clientVersion, hl: 'en', gl: 'US', ...extra },
    },
  };

  let data: any;
  try {
    const resp = await CapacitorHttp.post({
      url: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': clientId,
        'X-YouTube-Client-Version': clientVersion,
        'Origin': 'https://www.youtube.com',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`,
        ...BROWSER_HEADERS,
      },
      data: payload,
    });
    data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
  } catch {
    const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': clientId,
        'X-YouTube-Client-Version': clientVersion,
        ...BROWSER_HEADERS,
      },
      body: JSON.stringify(payload),
    });
    data = await r.json();
  }

  const tracks: any[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    const reason = data?.playabilityStatus?.reason ?? '';
    throw new Error(`no tracks${reason ? ': ' + reason : ''}`);
  }

  const track =
    tracks.find(t => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
    tracks.find(t => t.languageCode?.startsWith('en')) ??
    tracks.find(t => t.kind === 'asr') ??
    tracks[0];

  const captData = await nativeGetJson(track.baseUrl + '&fmt=json3');
  return parseJson3(captData);
}

// ── Fetch via timedtext XML ───────────────────────────────────────────────────

async function fetchViaTimedtextXml(videoId: string): Promise<SubtitleSegment[]> {
  const queries = [
    `v=${videoId}&lang=en&kind=asr`,
    `v=${videoId}&lang=en`,
    `v=${videoId}&lang=en-US&kind=asr`,
  ];
  for (const qs of queries) {
    try {
      let text = '';
      try {
        const resp = await Promise.race([
          CapacitorHttp.get({ url: `https://www.youtube.com/api/timedtext?${qs}`, headers: BROWSER_HEADERS, responseType: 'text' }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]) as any;
        text = typeof resp.data === 'string' ? resp.data : '';
      } catch {
        const r = await fetch(`https://www.youtube.com/api/timedtext?${qs}`);
        text = await r.text();
      }
      if (!text || text.length < 20) continue;
      // XML format: <text start="0.5" dur="2.0">hello world</text>
      const segs: SubtitleSegment[] = [];
      const re = /<text[^>]+start="([^"]+)"[^>]*(?:dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const start = parseFloat(m[1]);
        const duration = parseFloat(m[2] ?? '2');
        const raw = m[3].replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\n/g,' ').trim();
        if (raw) segs.push({ start, duration, text: raw });
      }
      if (segs.length > 0) return segs;
    } catch { continue; }
  }
  throw new Error('no xml captions');
}

// ── Native GET (CapacitorHttp with fallback to fetch) ─────────────────────────

async function nativeGetJson(url: string): Promise<any> {
  try {
    const resp = await CapacitorHttp.get({
      url,
      headers: BROWSER_HEADERS,
      responseType: 'json',
    });
    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
  } catch {
    const r = await fetch(url);
    return r.json();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJsonFromPage(html: string, varName: string): string | null {
  const prefix = `var ${varName} = `;
  const idx = html.indexOf(prefix);
  if (idx === -1) return null;
  let depth = 0, i = idx + prefix.length;
  const begin = i;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(begin, i + 1);
  }
  return null;
}

function parseJson3(data: any): SubtitleSegment[] {
  return (data?.events ?? [])
    .filter((ev: any) => ev.segs)
    .map((ev: any) => ({
      start: (ev.tStartMs ?? 0) / 1000,
      duration: (ev.dDurationMs ?? 2000) / 1000,
      text: decodeEntities(
        ev.segs.map((s: any) => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
      ),
    }))
    .filter((s: SubtitleSegment) => s.text);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

export function parseSRT(content: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
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

export function parseVTT(content: string): SubtitleSegment[] {
  const lines = content.split('\n');
  const segments: SubtitleSegment[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->') && !line.startsWith('NOTE')) {
      const [a, b] = line.split('-->').map(s => s.trim().split(' ')[0]);
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i].trim().replace(/<[^>]+>/g, ''));
        i++;
      }
      const text = textLines.join(' ').trim();
      if (text && a && b) segments.push({ start: vttSec(a), duration: vttSec(b) - vttSec(a), text });
    }
    i++;
  }
  return segments;
}

function srtSec(t: string): number {
  const [h, m, s] = t.replace(',', '.').split(':');
  return +h * 3600 + +m * 60 + parseFloat(s);
}
function vttSec(t: string): number {
  const p = t.split(':');
  return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + parseFloat(p[2]) : +p[0] * 60 + parseFloat(p[1]);
}
