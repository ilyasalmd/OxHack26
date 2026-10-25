import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { body } from "@/lib/http";
import { clientIp, limit } from "@/lib/ratelimit";
import { readRecoveryTicket } from "@/lib/accounts";
import { revokeSessions, startSession } from "@/lib/sessions";

const Schema = z.object({
  ticket: z.string().min(10),
  newAuthKey: z.string().length(64),
  newEncPrivateKey: z.string().min(20),
  newKeySalt: z.string().min(8),
  // A replacement recovery code, made in the same step; the old one is used up either way.
  recovery: z.object({ recoveryAuthKey: z.string().length(64), recoverySalt: z.string().min(8), encPrivateKeyRecovery: z.string().min(20) }).optional(),
});

// Step 2: set the new password. Signs out every device and uses up the recovery code.
export const POST = route(
  async (req) => {
    limit(`recover-reset:ip:${clientIp(req)}`, 10, 3600);
    const b = await body(req, Schema);
    const db = await getDb();
    const u = await readRecoveryTicket(db, b.ticket);
    const [hash, recoveryHash] = await Promise.all([bcrypt.hash(b.newAuthKey, 10), b.recovery ? bcrypt.hash(b.recovery.recoveryAuthKey, 10) : null]);
    const res = NextResponse.json({ id: u.id, username: u.username, hasRecovery: !!b.recovery });
    await db.tx(async (q) => {
      // Matching on the old recovery hash makes the ticket single-use even if two arrive at once.
      const done = await q.query(
        `UPDATE users SET auth_hash = $3, enc_private_key = $4, key_salt = $5, recovery_hash = $6, recovery_salt = $7, enc_private_key_recovery = $8
         WHERE id = $1 AND recovery_hash = $2 AND deleted_at IS NULL RETURNING id`,
        [u.id, u.recovery_hash, hash, b.newEncPrivateKey, b.newKeySalt, recoveryHash, b.recovery?.recoverySalt ?? null, b.recovery?.encPrivateKeyRecovery ?? null]
      );
      if (!done.length) throw new HttpError(401, "This recovery code has already been used. Start again.");
      await revokeSessions(q, u.id);
      await startSession(req, res, u.id, q);
    });
    return res;
  },
  { auth: false }
);
