import { NextRequest, NextResponse } from "next/server";
import { getDb } from "./db";
import { sign, verify } from "./secret";
import { applyAllowance } from "./economy";

export const COOKIE = "fs_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export type User = {
  id: number;
  username: string;
  display_name: string;
  color: string;
  balance: number;
  public_key: string;
  wallet_pubkey: string | null;
};

export function setSession(res: NextResponse, userId: number) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  res.cookies.set(COOKIE, sign(`${userId}:${exp}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function currentUser(req: NextRequest): Promise<User | null> {
  const v = verify(req.cookies.get(COOKIE)?.value);
  if (!v) return null;
  const [id, exp] = v.split(":").map(Number);
  if (!id || exp * 1000 < Date.now()) return null;
  const db = await getDb();
  await applyAllowance(db, id);
  const [u] = await db.query<User>(
    `SELECT id, username, display_name, color, balance, public_key, wallet_pubkey FROM users WHERE id = $1`,
    [id]
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
      const out = await fn(req, user as User, ctx);
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
