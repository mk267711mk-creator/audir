import { Router } from 'express';
import db from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { XP_MAP, calcLevel, checkBadges } from '../services/quiz.js';

const router = Router();

// Submit quiz answer
router.post('/attempt', authenticate, (req, res) => {
  const { exercise_id, selected_answer, difficulty } = req.body;
  const userId = req.user.id;

  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(exercise_id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

  const isCorrect = selected_answer.toLowerCase() === exercise.missing_word.toLowerCase() ? 1 : 0;
  const xpEarned = isCorrect ? (XP_MAP[difficulty] || XP_MAP[exercise.difficulty]) : 0;

  // Record attempt
  db.prepare(`
    INSERT INTO quiz_attempts (user_id, exercise_id, selected_answer, is_correct)
    VALUES (?, ?, ?, ?)
  `).run(userId, exercise_id, selected_answer, isCorrect);

  // Upsert video progress
  db.prepare(`
    INSERT INTO user_progress (user_id, video_id, total_exercises, correct_answers, xp, last_played)
    VALUES (?, ?, 1, ?, ?, unixepoch())
    ON CONFLICT(user_id, video_id) DO UPDATE SET
      total_exercises = total_exercises + 1,
      correct_answers = correct_answers + ?,
      xp = xp + ?,
      last_played = unixepoch()
  `).run(userId, exercise.video_id, isCorrect, xpEarned, isCorrect, xpEarned);

  // Update global stats + streak
  const today = Math.floor(Date.now() / 86400000);
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  const lastDay = stats ? Math.floor(stats.last_activity / 86400) : 0;

  let newStreak = stats?.current_streak || 0;
  if (today === lastDay) {
    // Same day, no streak change
  } else if (today === lastDay + 1) {
    newStreak += 1;
  } else {
    newStreak = 1;
  }

  const newXp = (stats?.total_xp || 0) + xpEarned;
  const { level } = calcLevel(newXp);
  const existingBadges = JSON.parse(stats?.badges || '[]');
  const newBadges = checkBadges(
    { total_xp: newXp, current_streak: newStreak },
    existingBadges
  );

  db.prepare(`
    INSERT INTO user_stats (user_id, total_xp, current_streak, longest_streak, last_activity, level, badges)
    VALUES (?, ?, ?, ?, unixepoch(), ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      total_xp = total_xp + ?,
      current_streak = ?,
      longest_streak = MAX(longest_streak, ?),
      last_activity = unixepoch(),
      level = ?,
      badges = ?
  `).run(
    userId, xpEarned, newStreak, newStreak, level, JSON.stringify(newBadges),
    xpEarned, newStreak, newStreak, level, JSON.stringify(newBadges)
  );

  res.json({
    correct: !!isCorrect,
    correct_answer: exercise.missing_word,
    xp_earned: xpEarned,
    new_badges: newBadges.filter(b => !existingBadges.includes(b)),
  });
});

// Get user stats
router.get('/stats', authenticate, (req, res) => {
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.user.id);
  const videoProgress = db.prepare(`
    SELECT vp.*, v.title, v.thumbnail, v.source
    FROM user_progress vp
    JOIN videos v ON v.id = vp.video_id
    WHERE vp.user_id = ?
    ORDER BY vp.last_played DESC
  `).all(req.user.id);

  if (!stats) return res.json({ stats: null, videoProgress: [] });

  const { level, title } = calcLevel(stats.total_xp);
  res.json({
    stats: { ...stats, badges: JSON.parse(stats.badges || '[]'), level, levelTitle: title },
    videoProgress,
  });
});

// Mark video as completed
router.post('/complete/:videoId', authenticate, (req, res) => {
  db.prepare(`
    UPDATE user_progress SET completed = 1 WHERE user_id = ? AND video_id = ?
  `).run(req.user.id, req.params.videoId);
  res.json({ ok: true });
});

export default router;
