import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";

// Key handshake: a member who holds the chat key wraps it for members who don't yet.
export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const b = await body(req, z.object({ keys: z.array(z.object({ userId: z.number().int(), wrappedKey: z.string() })).max(50) }));
  const db = await getDb();
  const [mine] = await db.query(`SELECT 1 FROM group_keys WHERE group_id = $1 AND user_id = $2`, [id, user.id]);
  if (!mine) return { added: 0 };
  let added = 0;
  for (const k of b.keys) {
    const r = await db.query(
      `INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by)
       SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [id, k.userId, k.wrappedKey, user.id]
    );
    added += r.length;
  }
  return { added };
});
