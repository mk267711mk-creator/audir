/**
 * Thin wrapper around localStorage (works in browser + Capacitor WebView).
 * Capacitor Preferences is async and overkill for small JSON blobs.
 */

function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function remove(key: string): void {
  localStorage.removeItem(key);
}

export const storage = { get, set, remove };
