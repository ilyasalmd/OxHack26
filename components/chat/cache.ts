import { api } from "@/components/api";
import { groupKey } from "@/components/groupkeys";
import { registerPhotos } from "@/components/media";
import { decryptPayload } from "@/lib/e2ee";
import type { Feed, Msg } from "@/app/g/[id]/page";
import { chatKey, readCache, writeCache } from "./store";

export type ChatKey = { key: CryptoKey; raw: Uint8Array };

export async function decryptWith(k: ChatKey | null, msgs: Msg[]) {
  return Promise.all(
    msgs.map(async (m) => {
      if (m.kind !== "chat" || !k || !m.ciphertext || !m.iv) return m;
      const payload = await decryptPayload(k.key, m.iv, m.ciphertext);
      return { ...m, payload, text: payload?.t ?? null };
    })
  );
}

// Chats this tab has opened or fetched ahead, so switching chats draws the new one at once
// instead of an empty wall while it loads. The live poll takes over from there.
export type Cached = { feed: Omit<Feed, "messages">; messages: Msg[]; lastId: number; key: ChatKey | null };
const chatCache = new Map<number, Cached>();
/** What goes to the device cache: the chat as the server holds it (ciphertext), never decrypted text. */
type Stored = { feed: Omit<Feed, "messages">; messages: Msg[]; lastId: number };
const KEEP = 200;
const fetching = new Set<number>();
let cacheOwner = 0;
/** The cache belongs to one account: logging in as someone else in this tab starts it afresh. */
export function cacheFor(userId: number) {
  if (cacheOwner !== userId) {
    chatCache.clear();
    cacheOwner = userId;
  }
  return chatCache;
}

/** Fetches a chat in the background (feed, key and decrypted history) for an instant open. */
export async function prefetchChat(userId: number, id: number, identity: CryptoKey | null) {
  const chatCache = cacheFor(userId);
  if (chatCache.has(id) || fetching.has(id)) return;
  fetching.add(id);
  try {
    const { messages, ...feed } = await api<Feed>(`/api/groups/${id}?after=0&read=0`);
    registerPhotos(feed.members);
    const key = identity && feed.myKey ? await groupKey(id, identity, feed.myKey).catch(() => null) : null;
    if (cacheOwner === userId && !chatCache.has(id)) {
      const entry = { feed, messages: sortMsgs(await decryptWith(key, messages)), lastId: messages.at(-1)?.id ?? 0, key };
      chatCache.set(id, entry);
      persistChat(userId, id, entry);
    }
  } catch {
    // Prefetching is a nicety: the chat still loads normally when opened.
  } finally {
    fetching.delete(id);
  }
}

export function sortMsgs(msgs: Msg[]) {
  const done = msgs.filter((m) => !m.pending).sort((a, b) => a.id - b.id);
  return [...done, ...msgs.filter((m) => m.pending)];
}

/** Loads a chat you're about to open (a new chat or DM), waiting at most 1.5s, so it opens already drawn. */
export function warmChat(userId: number, id: number, identity: CryptoKey | null) {
  return Promise.race([prefetchChat(userId, id, identity), new Promise((r) => setTimeout(r, 1500))]);
}

/** Saves a chat to the device so the next open (even after a reload) draws without waiting for the server. */
export function persistChat(userId: number, id: number, c: Cached) {
  if (cacheOwner !== userId) return;
  const messages = c.messages
    .filter((m) => !m.pending)
    .slice(-KEEP)
    // Decrypted text, your own plaintext payload and local blob URLs stay in memory only.
    .map(({ text: _t, payload: _p, local: _l, ck: _c, ...m }) => m);
  const { typing: _typing, ...feed } = c.feed;
  void writeCache(chatKey(userId, id), { feed, messages, lastId: c.lastId } satisfies Stored);
}

/**
 * The chat as this device last saw it: from memory if this tab has had it open, else from the
 * device cache (decrypted now, in memory). null when this device has never opened it.
 */
export async function restoreChat(userId: number, id: number, identity: CryptoKey | null): Promise<Cached | null> {
  const chatCache = cacheFor(userId);
  const hit = chatCache.get(id);
  if (hit) return hit;
  const stored = await readCache<Stored>(chatKey(userId, id));
  if (!stored || cacheOwner !== userId) return null;
  const key = identity && stored.feed.myKey ? await groupKey(id, identity, stored.feed.myKey).catch(() => null) : null;
  registerPhotos(stored.feed.members);
  const entry: Cached = {
    // "now" and who's typing are live facts; the first poll replaces them within a second.
    feed: { ...stored.feed, typing: [], now: new Date().toISOString() },
    messages: sortMsgs(await decryptWith(key, stored.messages)),
    lastId: stored.lastId,
    key,
  };
  if (!chatCache.has(id)) chatCache.set(id, entry);
  return chatCache.get(id)!;
}
