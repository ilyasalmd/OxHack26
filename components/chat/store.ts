/**
 * A small on-device cache (IndexedDB) so the app draws from the last thing it saw and then
 * catches up, instead of showing grey boxes while the first requests are in flight.
 *
 * Privacy: only what the server already holds goes in here, exactly as the server holds it:
 * chat messages as ciphertext, never decrypted text. Decryption happens in memory when a chat
 * opens, as before. The cache belongs to one account and is wiped on log out.
 */
const DB = "fs-cache";
const STORE = "kv";

let opening: Promise<IDBDatabase | null> | null = null;
function idb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return (opening ??= new Promise<IDBDatabase | null>((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch {
      res(null);
    }
  }));
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const db = await idb();
    if (!db) return null;
    return await new Promise<T | null>((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res((r.result as T) ?? null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown) {
  try {
    const db = await idb();
    if (!db) return;
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
  } catch {
    // The cache is a nicety; the app works without it.
  }
}

/** Everything cached on this device: called on log out and when the account changes. */
export async function clearCache() {
  try {
    localStorage.removeItem(LAST_USER);
  } catch {}
  try {
    const db = await idb();
    if (!db) return;
    db.transaction(STORE, "readwrite").objectStore(STORE).clear();
  } catch {}
}

const LAST_USER = "fs:last-user";
/** The account that last used this tab, so its chat list can be drawn before the server answers. */
export function lastUser(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_USER));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}
export function rememberUser(id: number) {
  try {
    localStorage.setItem(LAST_USER, String(id));
  } catch {}
}

export const meKey = (userId: number) => `me:${userId}`;
export const chatKey = (userId: number, groupId: number) => `chat:${userId}:${groupId}`;
