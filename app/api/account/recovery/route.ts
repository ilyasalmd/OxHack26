import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { body } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { checkAuthKey } from "@/lib/accounts";

// A new recovery code replaces the old one. The password is checked so a stolen session
// can't swap in a code of its own.
export const POST = route(async (req, user) => {
  limit(`recovery-new:${user.id}`, 5, 3600);
  const b = await body(
    req,
    z.object({ authKey: z.string().length(64), recoveryAuthKey: z.string().length(64), recoverySalt: z.string().min(8), encPrivateKeyRecovery: z.string().min(20) })
  );
  const db = await getDb();
  await checkAuthKey(db, user.id, b.authKey);
  await db.query(`UPDATE users SET recovery_hash = $2, recovery_salt = $3, enc_private_key_recovery = $4 WHERE id = $1`, [
    user.id,
    await bcrypt.hash(b.recoveryAuthKey, 10),
    b.recoverySalt,
    b.encPrivateKeyRecovery,
  ]);
  return { ok: true };
});
