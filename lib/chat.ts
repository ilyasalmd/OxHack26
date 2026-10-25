import { HttpError } from "./auth";
import type { Q } from "./db";
import { notifyChat } from "./live";

// Encrypted file sizes the server accepts. The browser shrinks photos and caps voice notes well
// under these, so they only stop abuse.
export const ATTACHMENT_LIMITS = {
  voice: 2_500_000,
  image: 3_000_000,
  group_photo: 600_000,
  avatar: 400_000,
  // A chat background from your own photos: only you can download it.
  wallpaper: 900_000,
} as const;
export type AttachmentKind = keyof typeof ATTACHMENT_LIMITS;
export const isAttachmentKind = (k: string | null): k is AttachmentKind => !!k && k in ATTACHMENT_LIMITS;

// "Typing…" lives in memory for a few seconds and is never stored. One server process is enough
// for the demo; several instances would move this into Postgres LISTEN/NOTIFY or Redis.
const TYPING_MS = 5000;
export type TypingMode = "text" | "voice";
const g = globalThis as unknown as { __fsTyping?: Map<number, Map<number, { until: number; mode: TypingMode }>> };
const typing = (g.__fsTyping ??= new Map());

export function setTyping(groupId: number, userId: number, mode: TypingMode | null) {
  const m = typing.get(groupId) ?? new Map();
  const was = m.get(userId)?.mode ?? null;
  if (mode) m.set(userId, { until: Date.now() + TYPING_MS, mode });
  else m.delete(userId);
  typing.set(groupId, m);
  // Everyone else's open chat hears it straight away (a refresh of the same state stays quiet).
  if (was !== mode) notifyChat(groupId);
}

/** Everyone else in the chat who is typing or recording a voice note right now. */
export function whoIsTyping(groupId: number, exceptUserId: number) {
  const m = typing.get(groupId);
  if (!m) return [];
  const t = Date.now();
  const out: { id: number; mode: TypingMode }[] = [];
  for (const [u, v] of m) {
    if (v.until <= t) m.delete(u);
    else if (u !== exceptUserId) out.push({ id: u, mode: v.mode });
  }
  return out;
}

/** A private chat has exactly two members and nobody else can be added to it. */
export async function refuseIfDm(q: Q, groupId: number) {
  const [g] = await q.query<{ is_dm: boolean }>(`SELECT is_dm FROM groups WHERE id = $1`, [groupId]);
  if (g?.is_dm) throw new HttpError(400, "This is a private chat. Start a group to add more people.");
}

export const dmPair = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Profile photo fields for people `viewerId` can see: the photo id and the profile key wrapped for them. */
export const AVATAR_COLS = (u: string, viewerParam: string) =>
  `${u}.avatar_id::int AS avatar_id, (SELECT pk.wrapped FROM profile_keys pk WHERE pk.owner_id = ${u}.id AND pk.viewer_id = ${viewerParam}) AS avatar_key`;

/**
 * Marks a chat read (and delivered) by `userId` up to its newest message, the same as their app
 * would by having the chat on screen, and wakes everyone's open chat so the sender's tick turns
 * into the app's mark at once. For server-side actors such as the demo bots; people's apps do
 * this through GET /api/groups/:id?read=… instead.
 */
export async function markRead(q: Q, groupId: number, userId: number) {
  const moved = await q.query(
    `UPDATE group_members gm SET read_upto = x.top, delivered_upto = GREATEST(gm.delivered_upto, x.top)
       FROM (SELECT coalesce(max(id), 0) AS top FROM messages WHERE group_id = $1) x
      WHERE gm.group_id = $1 AND gm.user_id = $2 AND gm.read_upto < x.top RETURNING gm.user_id`,
    [groupId, userId]
  );
  if (moved.length) notifyChat(groupId);
  return moved.length > 0;
}
