import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { now } from "@/lib/clock";

// Joining by invite code: you're in straight away, and the next member who has
// the app open wraps the chat key for you (you'll see "waiting for key" until then).
export const POST = route(async (req, user) => {
  const { code } = await body(req, z.object({ code: z.string().min(3) }));
  const db = await getDb();
  const [g] = await db.query<{ id: number }>(`SELECT id FROM groups WHERE invite_code = $1`, [code.trim()]);
  if (!g) throw new HttpError(404, "Invite code not found");
  const added = await db.query(
    `INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id`,
    [g.id, user.id, now()]
  );
  if (added.length) await db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system','joined with an invite link',$3)`, [g.id, user.id, now()]);
  return { id: g.id };
});
