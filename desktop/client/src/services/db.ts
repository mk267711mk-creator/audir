/**
 * Local database — all data stored in localStorage.
 * No server needed.
 */
import { storage } from './storage';
import type { Video, Exercise, Difficulty } from '../types';
import { calcLevel } from './quiz';
import { deleteFile } from './fileStorage';

// ── Videos ──────────────────────────────────────────────────────────────────

export function getVideos(): Video[] {
  return storage.get<Video[]>('audir_videos', []);
}

export function saveVideo(video: Video): void {
  const videos = getVideos();
  const idx = videos.findIndex(v => v.id === video.id);
  if (idx !== -1) videos[idx] = video;
  else videos.unshift(video);
  storage.set('audir_videos', videos);
}

export function getVideoById(id: string): Video | null {
  return getVideos().find(v => v.id === id) ?? null;
}

export function deleteVideo(id: string): void {
  const videos = getVideos().filter(v => v.id !== id);
  storage.set('audir_videos', videos);
  for (const diff of ['easy', 'medium', 'hard']) {
    storage.remove(`audir_ex_${id}_${diff}`);
  }
  storage.remove(`audir_prog_${id}`);
  deleteFile(id).catch(() => {}); // cleanup IndexedDB file if exists
}

// ── Exercises ────────────────────────────────────────────────────────────────

function exercisesKey(videoId: string, difficulty: Difficulty) {
  return `audir_ex_${videoId}_${difficulty}`;
}

export function saveExercises(videoId: string, difficulty: Difficulty, exercises: Exercise[]): void {
  storage.set(exercisesKey(videoId, difficulty), exercises);
}

export function getExercises(videoId: string, difficulty: Difficulty): Exercise[] {
  return storage.get<Exercise[]>(exercisesKey(videoId, difficulty), []);
}

// ── User stats ───────────────────────────────────────────────────────────────

export interface Stats {
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity: number; // epoch day (Math.floor(Date.now() / 86400000))
  badges: string[];
}

const DEFAULT_STATS: Stats = {
  total_xp: 0, current_streak: 0, longest_streak: 0,
  last_activity: 0, badges: [],
};

export function getStats(): Stats {
  return storage.get<Stats>('audir_stats', DEFAULT_STATS);
}

export function addXp(xp: number, difficulty: Difficulty): { newBadges: string[]; stats: Stats } {
  const stats = getStats();
  const today = Math.floor(Date.now() / 86400000);

  // Update streak
  let streak = stats.current_streak;
  if (today === stats.last_activity + 1) streak += 1;
  else if (today !== stats.last_activity) streak = 1;

  const newXp = stats.total_xp + xp;
  const oldBadges = new Set(stats.badges);
  const newBadges: string[] = [];

  const check = (id: string, cond: boolean) => {
    if (cond && !oldBadges.has(id)) { oldBadges.add(id); newBadges.push(id); }
  };

  check('first_100', newXp >= 100);
  check('xp_1000', newXp >= 1000);
  check('streak_3', streak >= 3);
  check('streak_7', streak >= 7);
  check('streak_30', streak >= 30);

  const updated: Stats = {
    total_xp: newXp,
    current_streak: streak,
    longest_streak: Math.max(stats.longest_streak, streak),
    last_activity: today,
    badges: [...oldBadges],
  };

  storage.set('audir_stats', updated);
  return { newBadges, stats: updated };
}

// ── Video progress ───────────────────────────────────────────────────────────

export interface VideoProgress {
  correct_answers: number;
  total_exercises: number;
  xp: number;
  completed: boolean;
}

function progressKey(videoId: string) {
  return `audir_prog_${videoId}`;
}

export function getVideoProgress(videoId: string): VideoProgress {
  return storage.get<VideoProgress>(progressKey(videoId), {
    correct_answers: 0, total_exercises: 0, xp: 0, completed: false,
  });
}

export function recordAttempt(videoId: string, correct: boolean, xpEarned: number): void {
  const p = getVideoProgress(videoId);
  storage.set(progressKey(videoId), {
    ...p,
    total_exercises: p.total_exercises + 1,
    correct_answers: p.correct_answers + (correct ? 1 : 0),
    xp: p.xp + xpEarned,
  });
}

export function markCompleted(videoId: string): void {
  const p = getVideoProgress(videoId);
  storage.set(progressKey(videoId), { ...p, completed: true });
}

export function getAllProgress(): Record<string, VideoProgress> {
  const videos = getVideos();
  const result: Record<string, VideoProgress> = {};
  for (const v of videos) {
    result[v.id] = getVideoProgress(v.id);
  }
  return result;
}

// ── Full stats for dashboard ─────────────────────────────────────────────────

export function getDashboardData() {
  const stats = getStats();
  const { level, title } = calcLevel(stats.total_xp);
  const videos = getVideos();
  const progress = videos.map(v => ({ ...v, ...getVideoProgress(v.id) }));

  return {
    stats: { ...stats, level, levelTitle: title },
    videoProgress: progress,
  };
}
