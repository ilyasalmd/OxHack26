import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { now } from "@/lib/clock";
import { limit } from "@/lib/ratelimit";
import { setTyping } from "@/lib/chat";
import { notifyChat } from "@/lib/live";
import { startBotReply } from "@/lib/bots";

// The server only ever receives AES-GCM ciphertext for chat messages.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  limit(`msg:${user.id}`, 30, 60);
  const b = await body(req, z.object({ ciphertext: z.string().min(8).max(20000), iv: z.string().min(8).max(64) }));
  const db = await getDb();
  const [m] = await db.query(
    `INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5) RETURNING id::int`,
    [id, user.id, b.ciphertext, b.iv, now()]
  );
  setTyping(id, user.id, null);
  // Wake everyone waiting on this chat now, typing or not.
  notifyChat(id);
  // Your own message is delivered to and read by you.
  await db.query(`UPDATE group_members SET delivered_upto = GREATEST(delivered_upto, $3::bigint), read_upto = GREATEST(read_upto, $3::bigint) WHERE group_id = $1 AND user_id = $2`, [id, user.id, m.id]);
  // Demo only: in a sample chat, a sample person reads it and answers.
  startBotReply(id, user.id);
  return m;
});
