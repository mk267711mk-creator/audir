import { storage } from './storage';

export interface LocalUser {
  id: string;
  username: string;
  preferred_lang: string;
  created_at: number;
}

const SESSION_KEY = 'audir_session';

export async function loginSimple(username: string): Promise<LocalUser> {
  const trimmed = username.trim();
  if (!trimmed) throw new Error('Enter your name');

  // Reuse existing user with same name, or create new
  const existing = getSession();
  if (existing && existing.username.toLowerCase() === trimmed.toLowerCase()) {
    return existing;
  }

  const user: LocalUser = {
    id: existing?.username.toLowerCase() === trimmed.toLowerCase()
      ? existing.id
      : crypto.randomUUID(),
    username: trimmed,
    preferred_lang: 'en',
    created_at: Date.now(),
  };

  storage.set(SESSION_KEY, user);
  return user;
}

export function getSession(): LocalUser | null {
  return storage.get<LocalUser | null>(SESSION_KEY, null);
}

export function logout(): void {
  storage.remove(SESSION_KEY);
}

export function updateLang(userId: string, lang: string): void {
  const session = getSession();
  if (session && session.id === userId) {
    storage.set(SESSION_KEY, { ...session, preferred_lang: lang });
  }
}
