/**
 * Keeps a slow answer that rarely changes (skill boards: they only move when a stake settles) for
 * a short while, so the app asking again doesn't re-read every call over a far-away database.
 * Callers asking at the same moment share one read. In memory, like typing: one server process.
 */
type Entry = { at: number; value: Promise<unknown> };
const g = globalThis as unknown as { __fsCache?: Map<string, Entry> };
const store = (g.__fsCache ??= new Map());

export function cached<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value as Promise<T>;
  const value = fn();
  store.set(key, { at: Date.now(), value });
  value.catch(() => store.delete(key));
  if (store.size > 5000) store.delete(store.keys().next().value!);
  return value;
}
