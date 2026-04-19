import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import {
  fetchYouTubeSubtitles,
  parseSRT,
  parseVTT,
  extractYouTubeId,
} from '../services/subtitles.js';
import { selectTargetWords, generateOptions } from '../services/quiz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

const router = Router();

// List all videos
router.get('/', authenticate, (req, res) => {
  const videos = db.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM exercises WHERE video_id = v.id AND difficulty = 'easy') as exercises_easy,
      (SELECT COUNT(*) FROM exercises WHERE video_id = v.id AND difficulty = 'medium') as exercises_medium,
      (SELECT COUNT(*) FROM exercises WHERE video_id = v.id AND difficulty = 'hard') as exercises_hard,
      up.correct_answers, up.total_exercises, up.xp as user_xp, up.completed
    FROM videos v
    LEFT JOIN user_progress up ON up.video_id = v.id AND up.user_id = ?
    ORDER BY v.created_at DESC
  `).all(req.user.id);
  res.json(videos);
});

// Get single video with exercises for difficulty
router.get('/:id/exercises', authenticate, (req, res) => {
  const { difficulty = 'medium' } = req.query;
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const exercises = db.prepare(
    'SELECT * FROM exercises WHERE video_id = ? AND difficulty = ? ORDER BY time_start'
  ).all(req.params.id, difficulty);

  res.json({ video, exercises: exercises.map(e => ({ ...e, options: JSON.parse(e.options) })) });
});

// Add YouTube video
router.post('/youtube', authenticate, async (req, res) => {
  const { url, title, difficulty = 'medium' } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const videoId = extractYouTubeId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  try {
    const segments = await fetchYouTubeSubtitles(videoId);
    if (!segments.length) return res.status(400).json({ error: 'No subtitles found for this video' });

    const videoTitle = title || `YouTube: ${videoId}`;
    const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

    const video = db.prepare(`
      INSERT INTO videos (title, source, url, thumbnail, language, created_by)
      VALUES (?, 'youtube', ?, ?, 'en', ?) RETURNING *
    `).get(videoTitle, url, thumbnail, req.user.id);

    await generateExercises(video.id, segments, difficulty);

    res.json({ video, segmentCount: segments.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload video file + subtitles
router.post('/upload', authenticate, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'subtitle', maxCount: 1 },
]), async (req, res) => {
  const videoFile = req.files?.video?.[0];
  const subtitleFile = req.files?.subtitle?.[0];
  const { title, difficulty = 'medium' } = req.body;

  if (!videoFile) return res.status(400).json({ error: 'Video file required' });
  if (!subtitleFile) return res.status(400).json({ error: 'Subtitle file required (SRT or VTT)' });

  try {
    const subtitleContent = fs.readFileSync(subtitleFile.path, 'utf-8');
    const ext = path.extname(subtitleFile.originalname).toLowerCase();
    const segments = ext === '.vtt' ? parseVTT(subtitleContent) : parseSRT(subtitleContent);

    if (!segments.length) return res.status(400).json({ error: 'Could not parse subtitles' });

    const videoPath = `/uploads/${path.basename(videoFile.path)}`;
    const subtitlePath = `/uploads/${path.basename(subtitleFile.path)}`;

    const video = db.prepare(`
      INSERT INTO videos (title, source, file_path, subtitle_path, language, created_by)
      VALUES (?, 'upload', ?, ?, 'en', ?) RETURNING *
    `).get(title || videoFile.originalname, videoPath, subtitlePath, req.user.id);

    await generateExercises(video.id, segments, difficulty);

    res.json({ video, segmentCount: segments.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function generateExercises(videoId, segments, difficulty) {
  // Generate exercises for all 3 difficulties
  const difficulties = difficulty === 'all' ? ['easy', 'medium', 'hard'] : ['easy', 'medium', 'hard'];

  for (const diff of difficulties) {
    // Select every ~5th segment to quiz on (not every segment)
    const step = diff === 'easy' ? 6 : diff === 'medium' ? 4 : 3;
    const selected = segments.filter((_, i) => i % step === 0);
    const targets = selectTargetWords(selected, diff);

    const insert = db.prepare(`
      INSERT INTO exercises (video_id, time_start, time_end, subtitle_text, missing_word, word_index, options, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const { segment, target } of targets) {
      const options = generateOptions(target.word, segments, diff);
      insert.run(
        videoId,
        segment.start,
        segment.start + segment.duration,
        segment.text,
        target.word,
        target.index,
        JSON.stringify(options),
        diff
      );
    }
  }
}

export default router;
