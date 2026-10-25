import crypto from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { now } from "@/lib/clock";
import { dmPair } from "@/lib/chat";

// A private chat with one person. Opening it again finds the same chat; the key is made and
// wrapped for both of you in the browser, like any group.
//   POST { username }                      → { id } when the chat exists, else { id: null }
//   POST { username, keys: [{username, wrappedKey}] } → creates it
const Schema = z.object({
  username: z.string().min(1),
  keys: z.array(z.object({ username: z.string(), wrappedKey: z.string() })).length(2).optional(),
});

export const POST = route(async (req, user) => {
  const b = await body(req, Schema);
  const db = await getDb();
  const uname = b.username.replace(/^@/, "").toLowerCase();
  const [them] = await db.query<{ id: number; username: string; display_name: string }>(`SELECT id, username, display_name FROM users WHERE username = $1 AND deleted_at IS NULL`, [uname]);
  if (!them) throw new HttpError(404, `No one called @${uname}`);
  if (them.id === user.id) throw new HttpError(400, "That's you");
  const pair = dmPair(user.id, them.id);
  const [existing] = await db.query<{ id: number }>(`SELECT id FROM groups WHERE dm_pair = $1`, [pair]);
  if (existing) {
    // Rejoin a private chat you left (the other person keeps it); the key comes from their app.
    await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [existing.id, user.id, now()]);
    return { id: existing.id };
  }
  if (!b.keys) return { id: null };
  const byName = new Map([[user.username, user.id], [them.username, them.id]]);
  if (!b.keys.every((k) => byName.has(k.username.replace(/^@/, "").toLowerCase()))) throw new HttpError(400, "Wrap the key for both of you");
  const id = await db.tx(async (q) => {
    const [g] = await q.query<{ id: number }>(
      `INSERT INTO groups (name, emoji, invite_code, created_by, created_at, is_dm, dm_pair) VALUES ($1,'',$2,$3,$4,true,$5) RETURNING id`,
      [`${user.display_name} & ${them.display_name}`, crypto.randomBytes(9).toString("base64url"), user.id, now(), pair]
    );
    for (const k of b.keys!) {
      const uid = byName.get(k.username.replace(/^@/, "").toLowerCase())!;
      await q.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3)`, [g.id, uid, now()]);
      await q.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4)`, [g.id, uid, k.wrappedKey, user.id]);
    }
    await q.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system','started a private chat',$3)`, [g.id, user.id, now()]);
    return g.id;
  });
  return { id };
});
