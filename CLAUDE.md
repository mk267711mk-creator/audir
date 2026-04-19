# Audir — Claude instructions

## Project
Foreign language listening skills training app (English, Spanish, Ukrainian, Russian). Video or audio plays with subtitles, words are blanked out, user picks from multiple choice options.

## Stack
- **Backend:** Node.js (v25.8.1) + Express + `node:sqlite` (built-in)
- **Frontend:** React + Vite + TypeScript + Tailwind + Zustand + react-i18next
- **Desktop:** Electron (Windows .exe installer)
- **Auth:** JWT (bcryptjs + jsonwebtoken)

## Start commands
```bash
# Dev — server (port 3001)
cd server
node --experimental-sqlite src/index.js

# Dev — client (port 5173)
cd client
npm run dev

# Electron desktop (dev mode)
cd client && npm run build:electron
cd ../electron && npm start

# Build Windows .exe installer (from root)
npm run build:win
# Output: dist-electron/Audir Setup 1.0.0.exe
```

## Key paths
- Server entry: `server/src/index.js`
- Routes: `server/src/routes/`
- DB file: `server/data/audir.db`
- Client: `client/src/`
- Components: `client/src/components/`
- Electron: `electron/main.js`, `electron/package.json`
- Electron resources: `electron/resources/yt-dlp.exe`
- Electron output: `dist-electron/`

## Architecture notes
- **Client is fully offline** — all data in localStorage (videos, exercises, progress, stats)
- **Backend is NOT used by the client** for storage — it's a separate system
- YouTube subtitle fetching: client calls `/api/subtitles?v=ID` on the backend first (via yt-dlp), then falls back to client-side methods
- For Electron: use `npm run build:electron` (not `npm run build`) — uses `client/.env.electron` which sets `VITE_BACKEND_URL=` (empty) so API calls go to relative localhost:3001
- `client/.env` contains `VITE_BACKEND_URL=http://192.168.100.178:3001` — only used for dev/testing, NOT for Electron builds

## Media sources (Video.source field)
- `'youtube'` — YouTube video, playback via YT Iframe API
- `'upload'` — local video file (MP4/MKV/WebM), playback via `<video>` element
- `'audio'`  — local audio file (MP3/WAV/M4A/OGG/FLAC/AAC), playback via `<audio>` element
- Audio upload: `POST /api/transcribe` accepts field `audio` (in addition to `video`) — ffmpeg converts to WAV, Whisper transcribes
- Audio player UI: compact panel with music icon (no 16:9 container); container grows to 380px when quiz is active

## Electron desktop notes
- Electron main process (`electron/main.js`) spawns the Express server as a child process using system `node`
- Server env vars passed by Electron: `PORT`, `CLIENT_DIST_PATH`, `YTDLP_PATH`, `DB_PATH`
- In packaged app: server files are in `resources/server/`, React build in `resources/client-dist/`, yt-dlp.exe in `resources/yt-dlp.exe`
- DB stored in `app.getPath('userData')` (e.g. AppData/Roaming/Audir/) in packaged mode
- To bundle yt-dlp: download `yt-dlp.exe` and place in `electron/resources/yt-dlp.exe` before building
- Right-click context menu (copy/paste) is enabled via `webContents.on('context-menu', ...)`

## Critical import fix
`youtube-transcript` package has broken exports — import directly:
```js
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
```
