import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { route, sessionId } from "@/lib/auth";
import { body } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { checkAuthKey } from "@/lib/accounts";
import { revokeSessions } from "@/lib/sessions";

// New password: the browser re-sealed the same identity key under it, so chats keep working.
// Every other device is signed out.
export const POST = route(async (req, user) => {
  limit(`account-change:${user.id}`, 5, 3600);
  const b = await body(
    req,
    z.object({ oldAuthKey: z.string().length(64), newAuthKey: z.string().length(64), newEncPrivateKey: z.string().min(20), newKeySalt: z.string().min(8) })
  );
  const db = await getDb();
  await checkAuthKey(db, user.id, b.oldAuthKey);
  const hash = await bcrypt.hash(b.newAuthKey, 10);
  const signedOut = await db.tx(async (q) => {
    await q.query(`UPDATE users SET auth_hash = $2, enc_private_key = $3, key_salt = $4 WHERE id = $1`, [user.id, hash, b.newEncPrivateKey, b.newKeySalt]);
    return revokeSessions(q, user.id, sessionId(req));
  });
  return { ok: true, signedOut };
});
