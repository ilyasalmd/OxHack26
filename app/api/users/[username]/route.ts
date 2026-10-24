import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";

export const GET = route<{ params: Promise<{ username: string }> }>(async (_req, _user, ctx) => {
  const username = (await ctx.params).username.replace(/^@/, "").toLowerCase();
  const db = await getDb();
  const [u] = await db.query(`SELECT id, username, display_name, color, public_key FROM users WHERE username = $1`, [username]);
  if (!u) throw new HttpError(404, `No one called @${username}`);
  return u;
});
