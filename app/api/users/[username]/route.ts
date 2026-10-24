import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { NAME_HOLD_MS, cleanUsername } from "@/lib/accounts";

// Looks someone up by username. A name given up in the last 30 days still finds the person
// who had it, with `renamedFrom` set, so old profile links and invites keep working.
export const GET = route<{ params: Promise<{ username: string }> }>(async (_req, _user, ctx) => {
  const username = cleanUsername(decodeURIComponent((await ctx.params).username));
  const db = await getDb();
  const cols = `u.id, u.username, u.display_name, u.color, u.public_key`;
  const [u] = await db.query(`SELECT ${cols} FROM users u WHERE u.username = $1 AND u.deleted_at IS NULL`, [username]);
  if (u) return u;
  const [moved] = await db.query(
    `SELECT ${cols} FROM username_history h JOIN users u ON u.id = h.user_id
     WHERE h.old_username = $1 AND h.changed_at > $2 AND u.deleted_at IS NULL ORDER BY h.changed_at DESC LIMIT 1`,
    [username, new Date(Date.now() - NAME_HOLD_MS)]
  );
  if (moved) return { ...moved, renamedFrom: username };
  throw new HttpError(404, `No one called @${username}`);
});
