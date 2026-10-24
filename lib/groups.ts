import type { Q } from "./db";
import { HttpError } from "./auth";
import { now } from "./clock";

/**
 * Joins a chat by invite code. Membership only: no coins change hands. Everyone's coins come
 * from the 500 at sign-up and the weekly +50, never from joining or creating chats.
 */
export async function joinByInvite(q: Q, userId: number, code: string) {
  const [g] = await q.query<{ id: number }>(`SELECT id FROM groups WHERE invite_code = $1`, [code.trim()]);
  if (!g) throw new HttpError(404, "Invite code not found");
  const added = await q.query(
    `INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id`,
    [g.id, userId, now()]
  );
  if (added.length) await q.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system','joined with an invite link',$3)`, [g.id, userId, now()]);
  return g.id;
}
