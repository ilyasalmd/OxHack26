import { z } from "zod";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { body } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { checkAuthKey } from "@/lib/accounts";

// For a signed-in device that needs the sealed key (unlock prompt, password change,
// new recovery code). Proves the password without opening another session.
export const POST = route(async (req, user) => {
  limit(`unlock:${user.id}`, 10, 600);
  const b = await body(req, z.object({ authKey: z.string().length(64) }));
  const db = await getDb();
  await checkAuthKey(db, user.id, b.authKey);
  const [u] = await db.query<{ enc_private_key: string; key_salt: string }>(`SELECT enc_private_key, key_salt FROM users WHERE id = $1`, [user.id]);
  return { encPrivateKey: u.enc_private_key, keySalt: u.key_salt };
});
