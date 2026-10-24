import { api } from "@/components/api";
import { groupKey } from "@/components/groupkeys";
import { registerPhotos } from "@/components/media";
import { decryptPayload } from "@/lib/e2ee";
import type { Feed, Msg } from "@/app/g/[id]/page";

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
type Cached = { feed: Omit<Feed, "messages">; messages: Msg[]; lastId: number; key: ChatKey | null };
const chatCache = new Map<number, Cached>();
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
    if (cacheOwner === userId && !chatCache.has(id)) chatCache.set(id, { feed, messages: sortMsgs(await decryptWith(key, messages)), lastId: messages.at(-1)?.id ?? 0, key });
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
