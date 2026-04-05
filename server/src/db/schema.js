export const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    preferred_lang TEXT DEFAULT 'en',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('youtube', 'upload')),
    url TEXT,
    file_path TEXT,
    subtitle_path TEXT,
    language TEXT DEFAULT 'en',
    thumbnail TEXT,
    duration INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    time_start REAL NOT NULL,
    time_end REAL NOT NULL,
    subtitle_text TEXT NOT NULL,
    missing_word TEXT NOT NULL,
    word_index INTEGER NOT NULL,
    options TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard'))
  );

  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    total_exercises INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    last_played INTEGER DEFAULT (unixepoch()),
    UNIQUE(user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    selected_answer TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    total_xp INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity INTEGER DEFAULT (unixepoch()),
    level INTEGER DEFAULT 1,
    badges TEXT DEFAULT '[]'
  );
`;
