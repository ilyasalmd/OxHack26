import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { now } from "./clock";

/**
 * Live updates without the phone asking every second and a half.
 *
 * The app sends the fingerprint (etag) of what it already has. If nothing has changed, the server
 * holds the request open and re-checks on its side, so the phone downloads nothing until there is
 * something new (or about 20s pass, when it gets a few bytes saying "unchanged"). New messages and
 * typing wake waiting requests at once; anything else (a trade, a bot, a vote) is noticed by the
 * server's own re-check within a second.
 *
 * One server process is enough for the demo, like "typing…"; several instances would move the
 * wake-ups into Postgres LISTEN/NOTIFY or Redis.
 */
type Waiter = () => void;
const g = globalThis as unknown as { __fsLive?: Map<string, Set<Waiter>> };
const topics = (g.__fsLive ??= new Map());

/** Wakes every request waiting on this chat (and anything waiting on all chats). */
export function notifyChat(groupId: number) {
  for (const t of [`g:${groupId}`, "*"]) {
    const set = topics.get(t);
    if (!set) continue;
    topics.delete(t);
    for (const w of set) w();
  }
}

function nextWake(keys: string[], ms: number, signal: AbortSignal) {
  return new Promise<void>((res) => {
    const done = () => {
      clearTimeout(timer);
      for (const k of keys) topics.get(k)?.delete(done);
      signal.removeEventListener("abort", done);
      res();
    };
    const timer = setTimeout(done, ms);
    for (const k of keys) {
      const set = topics.get(k) ?? new Set<Waiter>();
      set.add(done);
      topics.set(k, set);
    }
    signal.addEventListener("abort", done);
  });
}

/** A short, stable fingerprint of a JSON-able value. */
export const fingerprint = (v: unknown) => crypto.createHash("sha1").update(JSON.stringify(v)).digest("base64url").slice(0, 16);

const HOLD_MS = 20_000;
const RECHECK_MS = 1_000;

/**
 * Builds the response, and if the caller already has it (same etag) and asked to wait, holds on
 * until it changes. `fresh` says the build carries something new regardless of the fingerprint
 * (new messages). Returns the full body with its etag, or `{ unchanged: true }`.
 */
export async function answerWhenChanged<T extends object>(
  req: NextRequest,
  build: () => Promise<{ body: T; tag: string; fresh?: boolean }>,
  wake: string[]
): Promise<(T & { etag: string }) | { unchanged: true; etag: string; now: Date }> {
  const have = req.nextUrl.searchParams.get("etag");
  const wait = req.nextUrl.searchParams.get("wait") === "1";
  const until = Date.now() + HOLD_MS;
  let out = await build();
  while (wait && have === out.tag && !out.fresh && Date.now() < until && !req.signal.aborted) {
    await nextWake(wake, Math.min(RECHECK_MS, until - Date.now()), req.signal);
    if (req.signal.aborted) break;
    out = await build();
  }
  if (have === out.tag && !out.fresh) return { unchanged: true, etag: out.tag, now: now() };
  return { ...out.body, etag: out.tag };
}
