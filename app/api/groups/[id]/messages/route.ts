import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { now } from "@/lib/clock";
import { limit } from "@/lib/ratelimit";
import { setTyping } from "@/lib/chat";
import { notifyChat } from "@/lib/live";
import { startBotReply } from "@/lib/bots";

const g = globalThis as unknown as { __fsSent?: Map<string, Promise<{ id: number }>> };
const recent = (g.__fsSent ??= new Map());

// The server only ever receives AES-GCM ciphertext for chat messages.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  limit(`msg:${user.id}`, 30, 60);
  // `nonce`: a random tag the app picks per message, so a retry after a timeout returns the first
  // copy instead of posting it twice.
  const b = await body(req, z.object({ ciphertext: z.string().min(8).max(20000), iv: z.string().min(8).max(64), nonce: z.string().max(32).optional() }));
  const seenKey = b.nonce ? `${user.id}:${b.nonce}` : null;
  const seen = seenKey ? recent.get(seenKey) : undefined;
  if (seen) return seen;
  const db = await getDb();
  const saving = db
    .query<{ id: number }>(
      `INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5) RETURNING id::int`,
      [id, user.id, b.ciphertext, b.iv, now()]
    )
    .then(([row]) => row);
  // A retry that arrives while the first copy is still saving waits for that copy.
  if (seenKey) {
    recent.set(seenKey, saving);
    saving.catch(() => recent.delete(seenKey));
    if (recent.size > 2000) recent.delete(recent.keys().next().value!);
  }
  const m = await saving;
  setTyping(id, user.id, null);
  // Wake everyone waiting on this chat now, typing or not.
  notifyChat(id);
  // Your own message is delivered to and read by you. The sender doesn't wait for this.
  db.query(`UPDATE group_members SET delivered_upto = GREATEST(delivered_upto, $3::bigint), read_upto = GREATEST(read_upto, $3::bigint) WHERE group_id = $1 AND user_id = $2`, [id, user.id, m.id]).catch(() => {});
  // Demo only: in a sample chat, a sample person reads it and answers.
  startBotReply(id, user.id);
  return m;
});
