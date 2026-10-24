import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, requireMember, route } from "@/lib/auth";
import { body, idParam, type IdCtx } from "@/lib/http";
import { now } from "@/lib/clock";
import { refuseIfDm } from "@/lib/chat";

export const POST = route<IdCtx>(async (req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const b = await body(req, z.object({ username: z.string(), wrappedKey: z.string() }));
  const db = await getDb();
  await refuseIfDm(db, id);
  const [u] = await db.query<{ id: number; display_name: string }>(`SELECT id, display_name FROM users WHERE username = $1`, [b.username.replace(/^@/, "").toLowerCase()]);
  if (!u) throw new HttpError(404, `No one called @${b.username}`);
  await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [id, u.id, now()]);
  await db.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [id, u.id, b.wrappedKey, user.id]);
  await db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [id, user.id, `added ${u.display_name}`, now()]);
  return { ok: true };
});
