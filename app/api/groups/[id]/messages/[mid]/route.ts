import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, requireMember, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { now } from "@/lib/clock";
import { limit } from "@/lib/ratelimit";
import { notifyChat } from "@/lib/live";

type Ctx = { params: Promise<{ id: string; mid: string }> };

async function ids(ctx: Ctx) {
  const p = await ctx.params;
  const id = Number(p.id), mid = Number(p.mid);
  if (!Number.isInteger(id) || !Number.isInteger(mid)) throw new HttpError(400, "Bad id");
  return { id, mid };
}

/** Your own chat message, still there. Stake cards, bet cards and system lines are never editable. */
async function ownMessage(groupId: number, messageId: number, userId: number) {
  const db = await getDb();
  const [m] = await db.query<{ user_id: number; kind: string; deleted_at: Date | null }>(
    `SELECT user_id, kind, deleted_at FROM messages WHERE id = $1 AND group_id = $2`,
    [messageId, groupId]
  );
  if (!m) throw new HttpError(404, "Message not found");
  if (m.user_id !== userId) throw new HttpError(403, "You can only change your own messages");
  if (m.kind !== "chat") throw new HttpError(400, "Only chat messages can be changed");
  if (m.deleted_at) throw new HttpError(400, "That message was deleted");
  return db;
}

// An edit arrives already re-encrypted with the chat key; the server never sees the text.
export const PATCH = route<Ctx>(async (req, user, ctx) => {
  const { id, mid } = await ids(ctx);
  await requireMember(id, user.id);
  limit(`msg-edit:${user.id}`, 30, 60);
  const b = await body(req, z.object({ ciphertext: z.string().min(8).max(20000), iv: z.string().min(8).max(64) }));
  const db = await ownMessage(id, mid, user.id);
  const at = now();
  await db.query(`UPDATE messages SET ciphertext = $2, iv = $3, edited_at = $4 WHERE id = $1`, [mid, b.ciphertext, b.iv, at]);
  notifyChat(id);
  return { ok: true, edited_at: at };
});

// Deleted for everyone: the ciphertext goes, so no member's app (and no AI context) can read it again.
export const DELETE = route<Ctx>(async (_req, user, ctx) => {
  const { id, mid } = await ids(ctx);
  await requireMember(id, user.id);
  limit(`msg-edit:${user.id}`, 30, 60);
  const db = await ownMessage(id, mid, user.id);
  const at = now();
  await db.query(`UPDATE messages SET ciphertext = NULL, iv = NULL, deleted_at = $2 WHERE id = $1`, [mid, at]);
  notifyChat(id);
  return { ok: true, deleted_at: at };
});
