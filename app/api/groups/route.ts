import crypto from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { now } from "@/lib/clock";

const Schema = z.object({
  name: z.string().min(1).max(40),
  emoji: z.string().max(8).optional(),
  // Usernames to add, each with the group key already wrapped for them in the creator's browser.
  keys: z.array(z.object({ username: z.string(), wrappedKey: z.string() })).min(1),
});

export const POST = route(async (req, user) => {
  const b = await body(req, Schema);
  const db = await getDb();
  const id = await db.tx(async (q) => {
    const [g] = await q.query<{ id: number }>(
      `INSERT INTO groups (name, emoji, invite_code, created_by, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [b.name, b.emoji ?? "", crypto.randomBytes(5).toString("base64url"), user.id, now()]
    );
    for (const k of b.keys) {
      const [u] = await q.query<{ id: number }>(`SELECT id FROM users WHERE username = $1`, [k.username.replace(/^@/, "").toLowerCase()]);
      if (!u) throw new HttpError(400, `No one called @${k.username}`);
      await q.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [g.id, u.id, now()]);
      await q.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [g.id, u.id, k.wrappedKey, user.id]);
    }
    const [self] = await q.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [g.id, user.id]);
    if (!self) throw new HttpError(400, "Include your own wrapped key");
    await q.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [g.id, user.id, `created ${b.name}`, now()]);
    return g.id;
  });
  return { id };
});
