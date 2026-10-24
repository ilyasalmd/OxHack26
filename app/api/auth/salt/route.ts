import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { clientIp, limit } from "@/lib/ratelimit";
import { cleanUsername, fakeSalt } from "@/lib/accounts";

// The salts are needed before login so the browser can derive its keys. Unknown names get
// stable stand-in salts, so this can't be used to find out who has an account.
export const GET = route(
  async (req) => {
    limit(`salt:ip:${clientIp(req)}`, 30, 60);
    const username = cleanUsername(req.nextUrl.searchParams.get("username") ?? "").slice(0, 40);
    const db = await getDb();
    const [u] = await db.query<{ key_salt: string; recovery_salt: string | null }>(
      `SELECT key_salt, recovery_salt FROM users WHERE username = $1 AND deleted_at IS NULL`,
      [username]
    );
    return { salt: u?.key_salt ?? fakeSalt("key", username), recoverySalt: u?.recovery_salt ?? fakeSalt("recovery", username) };
  },
  { auth: false }
);
