# Audir — Claude instructions

## Project
English listening skills training app. Video plays with subtitles, words are blanked out, user picks from multiple choice options.

## Stack
- **Backend:** Node.js (v25.8.1) + Express + `node:sqlite` (built-in)
- **Frontend:** React + Vite + TypeScript + Tailwind + Zustand + react-i18next
- **Mobile:** Capacitor (Android APK)
- **Auth:** JWT (bcryptjs + jsonwebtoken)

## Start commands
```bash
# Server (port 3001)
cd server
node --experimental-sqlite src/index.js

# Client dev (port 5173)
cd client
npm run dev

# Build Android APK
cd client
npm run build:android
npx cap sync android
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## Key paths
- Server entry: `server/src/index.js`
- Routes: `server/src/routes/`
- Services: `server/src/services/`
- DB file: `server/data/audir.db`
- Uploads: `server/uploads/`
- Client: `client/src/`
- Components: `client/src/components/`

## Architecture notes
- **Client is fully offline** — all data in localStorage (videos, exercises, progress, stats)
- **Backend is NOT used by the client** for storage — it's a separate system
- YouTube subtitle fetching: client calls `/api/subtitles?v=ID` on the backend first (via yt-dlp), then falls back to client-side methods
- `yt-dlp` must be installed on the server machine: `pip install yt-dlp`
- For mobile: set `VITE_BACKEND_URL=http://192.168.100.178:3001` in `client/.env` (phone and PC must be on same WiFi)

## Critical import fix
`youtube-transcript` package has broken exports — import directly:
```js
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
```

## Mobile build notes
- Debug APK is built with `./gradlew assembleDebug` from `client/android/`
- Backend URL is baked into the APK at build time via `VITE_BACKEND_URL` env var
- CORS is open (allows all origins) so Capacitor requests work
