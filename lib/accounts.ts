import bcrypt from "bcryptjs";
import type { Q } from "./db";
import { HttpError } from "./auth";
import { mac, sign, verify } from "./secret";

export const USERNAME = /^[a-z0-9_]{3,20}$/;
export const RESERVED = new Set(["admin", "support", "friendstocks", "root", "system", "null", "undefined", "me", "settings", "api"]);
export const RENAME_COOLDOWN_MS = 7 * 86_400_000;
/** How long an old username stays reserved (and redirects) after a rename or deletion. */
export const NAME_HOLD_MS = 30 * 86_400_000;

export const cleanUsername = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

/** Why `username` can't be used by `selfId` (or by a new account), or null when it's free. */
export async function usernameProblem(q: Q, username: string, selfId: number | null = null) {
  if (!USERNAME.test(username)) return "3 to 20 letters, numbers or underscores";
  if (RESERVED.has(username)) return "That username is reserved";
  const [taken] = await q.query(`SELECT 1 FROM users WHERE lower(username) = $1 AND ($2::int IS NULL OR id <> $2)`, [username, selfId]);
  if (taken) return "That username is taken";
  // Recently given up by someone else: held so nobody can pose as them straight after.
  const [held] = await q.query(
    `SELECT 1 FROM username_history WHERE old_username = $1 AND changed_at > $2 AND ($3::int IS NULL OR user_id <> $3)`,
    [username, new Date(Date.now() - NAME_HOLD_MS), selfId]
  );
  if (held) return "That username is taken";
  return null;
}

/** Checks a password-derived auth key against the stored hash. */
export async function checkAuthKey(q: Q, userId: number, authKey: string, message = "That password is not right") {
  const [u] = await q.query<{ auth_hash: string }>(`SELECT auth_hash FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
  if (!u || !(await bcrypt.compare(authKey, u.auth_hash))) throw new HttpError(401, message);
}

/** A stand-in salt for names with no account, so the salt lookup can't be used to list users. */
export const fakeSalt = (kind: string, username: string) => Buffer.from(mac(`${kind}:${username}`), "base64url").subarray(0, 16).toString("base64");

// A short-lived pass between "recovery code checked" and "new password set". It is tied
// to the current recovery hash, so it stops working the moment the code is used.
const TICKET_MS = 15 * 60_000;
const fingerprint = (recoveryHash: string) => mac(`recovery:${recoveryHash}`).slice(0, 16);
export const recoveryTicket = (userId: number, recoveryHash: string) => sign(`rec:${userId}:${Date.now() + TICKET_MS}:${fingerprint(recoveryHash)}`);
export async function readRecoveryTicket(q: Q, ticket: string) {
  const v = verify(ticket);
  const [kind, id, exp, fp] = v?.split(":") ?? [];
  if (kind !== "rec" || Number(exp) < Date.now()) throw new HttpError(401, "This reset has expired. Start again.");
  const [u] = await q.query<{ id: number; username: string; recovery_hash: string | null }>(
    `SELECT id, username, recovery_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [Number(id)]
  );
  if (!u?.recovery_hash || fingerprint(u.recovery_hash) !== fp) throw new HttpError(401, "This recovery code has already been used. Start again.");
  return u;
}
