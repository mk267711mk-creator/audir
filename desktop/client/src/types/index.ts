export interface User {
  id: string;
  username: string;
  preferred_lang: string;
  created_at: number;
}

export interface UserStats {
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  level: number;
  levelTitle: string;
  badges: string[];
}

export interface Video {
  id: string;
  title: string;
  source: 'youtube' | 'upload' | 'audio';
  url?: string;
  file_path?: string;
  thumbnail?: string;
  language: string;
  exercises_easy: number;
  exercises_medium: number;
  exercises_hard: number;
}

export interface Exercise {
  id: string;
  video_id: string;
  time_start: number;
  time_end: number;
  subtitle_text: string;
  missing_word: string;
  word_index: number;
  options: string[];
  difficulty: Difficulty;
}

export interface AttemptResult {
  correct: boolean;
  correct_answer: string;
  xp_earned: number;
  new_badges: string[];
}

export type Difficulty = 'easy' | 'medium' | 'hard';
