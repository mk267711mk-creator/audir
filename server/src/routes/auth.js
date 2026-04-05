import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { signToken, authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, email, password, lang } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = db.prepare(
      'INSERT INTO users (username, email, password_hash, preferred_lang) VALUES (?, ?, ?, ?) RETURNING id, username, email, preferred_lang'
    ).get(username, email, hash, lang || 'en');

    db.prepare('INSERT INTO user_stats (user_id) VALUES (?)').run(user.id);

    const token = signToken({ id: user.id, username: user.username });
    res.json({ token, user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken({ id: user.id, username: user.username });
  const safeUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    preferred_lang: user.preferred_lang,
    created_at: user.created_at,
  };
  res.json({ token, user: safeUser });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, email, preferred_lang, created_at FROM users WHERE id = ?').get(req.user.id);
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.user.id);
  res.json({ user, stats });
});

router.patch('/me/lang', authenticate, (req, res) => {
  const { lang } = req.body;
  db.prepare('UPDATE users SET preferred_lang = ? WHERE id = ?').run(lang, req.user.id);
  res.json({ ok: true });
});

export default router;
