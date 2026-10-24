import { HttpError } from "./auth";
import type { Q } from "./db";

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
  if (mode) m.set(userId, { until: Date.now() + TYPING_MS, mode });
  else m.delete(userId);
  typing.set(groupId, m);
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
