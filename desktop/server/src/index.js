import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import authRoutes from './routes/auth.js';
import videoRoutes from './routes/videos.js';
import progressRoutes from './routes/progress.js';
import subtitlesRoutes from './routes/subtitles.js';
import extractSubsRoutes from './routes/extract-subs.js';
import transcribeRoutes from './routes/transcribe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all origins (local app)
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/subtitles', subtitlesRoutes);
app.use('/api/extract-subs', extractSubsRoutes);
app.use('/api/transcribe', transcribeRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Serve React build in Electron desktop mode
if (process.env.CLIENT_DIST_PATH) {
  app.use(express.static(process.env.CLIENT_DIST_PATH));
  app.get('*', (req, res) => {
    res.sendFile(path.join(process.env.CLIENT_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Audir server running on :${PORT}`));
