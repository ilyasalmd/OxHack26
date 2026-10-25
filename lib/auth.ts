import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "./db";
import { verify } from "./secret";
import { allowanceDue, applyAllowance } from "./economy";
import { demoOffset, withClock } from "./clock";
import { isAdminUsername } from "./config";

export const COOKIE = "fs_session";
export const MAX_AGE = 60 * 60 * 24 * 30;

export type User = {
  id: number;
  username: string;
  display_name: string;
  color: string;
  balance: number;
  public_key: string;
  wallet_pubkey: string | null;
};

/** The session token in the cookie, if it is a validly signed one. Old `userId:exp` cookies read as signed out. */
function sessionToken(req: NextRequest) {
  const v = verify(req.cookies.get(COOKIE)?.value);
  return v?.startsWith("s:") ? v.slice(2) : null;
}
/** Sessions are stored under the token's hash, never the token itself. */
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("base64url");
export function sessionId(req: NextRequest) {
  const t = sessionToken(req);
  return t ? hashToken(t) : null;
}

export async function currentUser(req: NextRequest): Promise<User | null> {
  const sid = sessionId(req);
  if (!sid) return null;
  const db = await getDb();
  // Security times run on the real clock, not the demo time machine. The session and the person
  // come back in one round trip, since every request pays for it.
  const [s] = await db.query<User & { last_seen_at: Date; last_allowance_at: Date }>(
    `SELECT s.last_seen_at, u.last_allowance_at, u.id, u.username, u.display_name, u.color, u.balance, u.public_key, u.wallet_pubkey
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.revoked_at IS NULL AND s.created_at > $2 AND u.deleted_at IS NULL`,
    [sid, new Date(Date.now() - MAX_AGE * 1000)]
  );
  if (!s) return null;
  if (Date.now() - new Date(s.last_seen_at).getTime() > 60_000)
    db.query(`UPDATE sessions SET last_seen_at = $2 WHERE id = $1`, [sid, new Date()]).catch(() => {});
  const { last_seen_at: _seen, last_allowance_at, ...user } = s;
  // Only a week's allowance being due costs more queries (and changes the balance).
  if (!allowanceDue(last_allowance_at)) return user;
  await applyAllowance(db, s.id);
  const [u] = await db.query<User>(
    `SELECT id, username, display_name, color, balance, public_key, wallet_pubkey FROM users WHERE id = $1`,
    [s.id]
  );
  return u ?? null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a route handler with auth + uniform JSON errors. */
export function route<C = unknown>(
  fn: (req: NextRequest, user: User, ctx: C) => Promise<unknown>,
  opts: { auth?: boolean } = { auth: true }
) {
  return async (req: NextRequest, ctx: C) => {
    try {
      const user = await currentUser(req);
      if (opts.auth !== false && !user) throw new HttpError(401, "Not signed in");
      // Only the admin's own requests run on the demo clock; everyone else is on real time.
      const out = user && isAdminUsername(user.username) && demoOffset() !== 0
        ? await withClock(demoOffset(), user.id, () => fn(req, user, ctx))
        : await fn(req, user as User, ctx);
      return out instanceof NextResponse ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return NextResponse.json({ error: (e as Error).message }, { status });
    }
  };
}

export async function requireMember(groupId: number, userId: number) {
  const db = await getDb();
  const [m] = await db.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
  if (!m) throw new HttpError(403, "You're not in this group");
}
