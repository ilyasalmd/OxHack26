import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { clientIp, limit } from "@/lib/ratelimit";
import { cleanUsername, recoveryTicket } from "@/lib/accounts";

// Step 1 of "forgot password": prove the recovery code. Only then does the browser get the
// copy of the identity key sealed with that code, plus a short-lived ticket for step 2.
export const POST = route(
  async (req) => {
    const b = await body(req, z.object({ username: z.string().max(40), recoveryAuthKey: z.string().length(64) }));
    const username = cleanUsername(b.username);
    limit(`recover:ip:${clientIp(req)}`, 5, 3600);
    limit(`recover:user:${username}`, 5, 3600);
    const db = await getDb();
    const [u] = await db.query<{ id: number; username: string; recovery_hash: string | null; enc_private_key_recovery: string | null }>(
      `SELECT id, username, recovery_hash, enc_private_key_recovery FROM users WHERE username = $1 AND deleted_at IS NULL`,
      [username]
    );
    if (!u?.recovery_hash || !u.enc_private_key_recovery || !(await bcrypt.compare(b.recoveryAuthKey, u.recovery_hash)))
      throw new HttpError(401, "That username and recovery code don't match");
    return { username: u.username, ticket: recoveryTicket(u.id, u.recovery_hash), encPrivateKeyRecovery: u.enc_private_key_recovery };
  },
  { auth: false }
);
