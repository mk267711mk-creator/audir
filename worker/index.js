const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const HEADERS_BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Cookie': 'CONSENT=YES+42; SOCS=CAESEwgDEgk0OTI5MDE0NzIaAmVuIAEaBgiAkOWlBg',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

// Public Invidious instances (no API key needed)
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://inv.tux.pizza',
  'https://yt.cdaut.de',
  'https://invidious.privacyredirect.com',
  'https://invidious.io.lol',
];

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('v');
    if (!videoId) return json({ error: 'Missing ?v=VIDEO_ID' }, 400);

    const errors = [];

    // ── Method 1: Invidious API (open source YouTube mirror) ──
    for (const base of INVIDIOUS_INSTANCES) {
      try {
        const segs = await fetchViaInvidious(videoId, base);
        if (segs.length > 0) return json({ events: segsToEvents(segs) });
        errors.push(`inv(${base}): empty`);
      } catch (e) {
        errors.push(`inv(${base}): ${e.message.slice(0, 60)}`);
      }
    }

    // ── Method 2: scrape YouTube page ──
    try {
      const segs = await fetchViaPage(videoId);
      if (segs.length > 0) return json({ events: segsToEvents(segs) });
    } catch (e) {
      errors.push(`page: ${e.message}`);
    }

    // ── Method 3: InnerTube TV embedded client ──
    try {
      const segs = await fetchViaInnerTube(videoId, 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', '2.0', {
        clientScreen: 'EMBED',
      }, '85');
      if (segs.length > 0) return json({ events: segsToEvents(segs) });
    } catch (e) {
      errors.push(`tv: ${e.message}`);
    }

    // ── Method 4: InnerTube ANDROID ──
    try {
      const segs = await fetchViaInnerTube(videoId, 'ANDROID', '19.09.37', {
        androidSdkVersion: 30,
        userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip',
      }, '3');
      if (segs.length > 0) return json({ events: segsToEvents(segs) });
    } catch (e) {
      errors.push(`android: ${e.message}`);
    }

    // ── Method 5: InnerTube WEB ──
    try {
      const segs = await fetchViaInnerTube(videoId, 'WEB', '2.20240101.00.00', {}, '1');
      if (segs.length > 0) return json({ events: segsToEvents(segs) });
    } catch (e) {
      errors.push(`web: ${e.message}`);
    }

    // ── Method 6: timedtext API ──
    for (const qs of [
      `v=${videoId}&lang=en&kind=asr&fmt=json3`,
      `v=${videoId}&lang=en&fmt=json3`,
      `v=${videoId}&lang=en-US&kind=asr&fmt=json3`,
    ]) {
      try {
        const r = await fetch(`https://www.youtube.com/api/timedtext?${qs}`, { headers: HEADERS_BROWSER });
        const text = await r.text();
        if (text && text.length > 10) {
          const data = JSON.parse(text);
          if ((data.events ?? []).some(e => e.segs)) return json(data);
        }
        errors.push(`timedtext(${qs.split('&').slice(1).join(',')}): empty`);
      } catch (e) {
        errors.push(`timedtext: ${e.message}`);
      }
    }

    return json({ error: 'No subtitles found. Video may not have CC/subtitles.', details: errors }, 404);
  },
};

// ── Fetch via Invidious API ───────────────────────────────────────────────────

async function fetchViaInvidious(videoId, baseUrl) {
  // Get caption list
  const listResp = await fetch(`${baseUrl}/api/v1/captions/${videoId}?local=true`, {
    headers: { 'User-Agent': HEADERS_BROWSER['User-Agent'] },
    signal: AbortSignal.timeout(8000),
  });
  if (!listResp.ok) throw new Error(`HTTP ${listResp.status}`);
  const listData = await listResp.json();

  const captions = listData?.captions ?? [];
  if (!captions.length) throw new Error('no captions in invidious response');

  // Prefer English, then any
  const cap =
    captions.find(c => c.language_code?.startsWith('en') && c.label?.includes('auto')) ??
    captions.find(c => c.language_code?.startsWith('en')) ??
    captions[0];

  // Invidious caption URL is relative to the instance
  const capUrl = cap.url.startsWith('http') ? cap.url : `${baseUrl}${cap.url}`;
  const capResp = await fetch(capUrl + '&fmt=vtt', {
    headers: { 'User-Agent': HEADERS_BROWSER['User-Agent'] },
    signal: AbortSignal.timeout(8000),
  });
  if (!capResp.ok) throw new Error(`caption fetch HTTP ${capResp.status}`);
  const text = await capResp.text();

  if (text.trim().startsWith('{')) {
    return parseJson3(JSON.parse(text));
  }
  return parseVTT(text);
}

// ── Fetch via YouTube page scrape ─────────────────────────────────────────────

async function fetchViaPage(videoId) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: HEADERS_BROWSER,
    redirect: 'follow',
  });
  const html = await resp.text();

  if (html.includes('consent.youtube.com') || html.includes('"consentBump"') || html.includes('before-you-continue')) {
    throw new Error('YouTube consent/bot page');
  }

  const playerJson = extractJson(html, 'ytInitialPlayerResponse');
  if (!playerJson) throw new Error('ytInitialPlayerResponse not found');

  const data = JSON.parse(playerJson);
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) throw new Error('no tracks');

  const track =
    tracks.find(t => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
    tracks.find(t => t.languageCode?.startsWith('en')) ??
    tracks.find(t => t.kind === 'asr') ??
    tracks[0];

  const captResp = await fetch(track.baseUrl + '&fmt=json3', { headers: HEADERS_BROWSER });
  const capt = await captResp.json();
  return parseJson3(capt);
}

// ── Fetch via InnerTube API ───────────────────────────────────────────────────

async function fetchViaInnerTube(videoId, clientName, clientVersion, extra, clientId) {
  const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': clientId ?? '1',
      'X-YouTube-Client-Version': clientVersion,
      'Cookie': HEADERS_BROWSER.Cookie,
      'Origin': 'https://www.youtube.com',
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
      'User-Agent': HEADERS_BROWSER['User-Agent'],
    },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName,
          clientVersion,
          hl: 'en',
          gl: 'US',
          visitorData: 'CgtiMkVyMnRGOXZ5ZyiI2pq2BjIICgJVUxIAGgA%3D',
          ...extra,
        },
      },
    }),
  });

  const data = await resp.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    const reason = data?.playabilityStatus?.reason ?? '';
    throw new Error(`no tracks${reason ? ': ' + reason : ''}`);
  }

  const track =
    tracks.find(t => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
    tracks.find(t => t.languageCode?.startsWith('en')) ??
    tracks.find(t => t.kind === 'asr') ??
    tracks[0];

  const captResp = await fetch(track.baseUrl + '&fmt=json3', { headers: HEADERS_BROWSER });
  const capt = await captResp.json();
  return parseJson3(capt);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJson(html, varName) {
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

function parseJson3(data) {
  return (data?.events ?? [])
    .filter(ev => ev.segs)
    .map(ev => ({
      start: (ev.tStartMs ?? 0) / 1000,
      duration: (ev.dDurationMs ?? 2000) / 1000,
      text: ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim(),
    }))
    .filter(s => s.text);
}

function parseVTT(content) {
  const lines = content.split('\n');
  const segments = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->') && !line.startsWith('NOTE')) {
      const [a, b] = line.split('-->').map(s => s.trim().split(' ')[0]);
      const textLines = [];
      i++;
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i].trim().replace(/<[^>]+>/g, ''));
        i++;
      }
      const text = textLines.join(' ').trim();
      if (text && a && b) {
        segments.push({ start: vttSec(a), duration: vttSec(b) - vttSec(a), text });
      }
    }
    i++;
  }
  return segments;
}

function vttSec(t) {
  const p = t.split(':');
  return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + parseFloat(p[2]) : +p[0] * 60 + parseFloat(p[1]);
}

function segsToEvents(segs) {
  return segs.map(s => ({
    tStartMs: s.start * 1000,
    dDurationMs: s.duration * 1000,
    segs: [{ utf8: s.text }],
  }));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
