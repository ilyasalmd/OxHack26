import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { clientIp, limit } from "@/lib/ratelimit";
import { RENAME_COOLDOWN_MS, checkAuthKey, cleanUsername, usernameProblem } from "@/lib/accounts";

// Live availability check, for the settings page and the sign-up form (no sign-in needed).
//   GET /api/account/username?check=jake  ->  { username, available, reason? }
export const GET = route(
  async (req, user) => {
    limit(`username-check:${user?.id ?? clientIp(req)}`, 60, 60);
    const username = cleanUsername(req.nextUrl.searchParams.get("check") ?? "").slice(0, 40);
    if (user && username === user.username) return { username, available: false, reason: "That's your username now" };
    const reason = await usernameProblem(await getDb(), username, user?.id ?? null);
    return reason ? { username, available: false, reason } : { username, available: true };
  },
  { auth: false }
);

// Rename. The login key is derived from the username, so the browser proves the password
// with the old one and sends the new one alongside.
export const POST = route(async (req, user) => {
  limit(`account-change:${user.id}`, 5, 3600);
  const b = await body(req, z.object({ username: z.string().max(40), oldAuthKey: z.string().length(64), newAuthKey: z.string().length(64) }));
  const username = cleanUsername(b.username);
  if (username === user.username) throw new HttpError(400, "That's already your username");
  const db = await getDb();
  await checkAuthKey(db, user.id, b.oldAuthKey);
  const hash = await bcrypt.hash(b.newAuthKey, 10);
  const t = new Date();
  await db
    .tx(async (q) => {
      const [u] = await q.query<{ username_changed_at: Date | null }>(`SELECT username_changed_at FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
      const next = u.username_changed_at ? new Date(u.username_changed_at).getTime() + RENAME_COOLDOWN_MS : 0;
      if (next > t.getTime())
        throw new HttpError(429, `You can change your username once a week. Next change: ${new Date(next).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.`);
      const problem = await usernameProblem(q, username, user.id);
      if (problem) throw new HttpError(409, problem);
      await q.query(`INSERT INTO username_history (user_id, old_username, changed_at) VALUES ($1,$2,$3)`, [user.id, user.username, t]);
      await q.query(`UPDATE users SET username = $2, auth_hash = $3, username_changed_at = $4 WHERE id = $1`, [user.id, username, hash, t]);
    })
    .catch((e) => {
      if (/unique|duplicate/i.test((e as Error).message)) throw new HttpError(409, "That username is taken");
      throw e;
    });
  return { username };
});
