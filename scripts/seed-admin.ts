/**
 * The admin account (the first name in ADMIN_USERNAMES, stakesadmin by default), made the way a
 * sign-up would make it, with the password from ADMIN_PASSWORD in .env.local. The password is
 * never written anywhere else. Skips an admin that already exists. Safe to run again:
 *
 *   npx tsx --env-file=.env.local scripts/seed-admin.ts
 */
import bcrypt from "bcryptjs";
import { getDb } from "../lib/db";
import { now } from "../lib/clock";
import { credit } from "../lib/economy";
import { ECONOMY } from "../lib/config";
import { newWallet } from "../lib/solana";
import { createIdentity, deriveKeys, randomSalt } from "../lib/e2ee";

async function main() {
  const username = (process.env.ADMIN_USERNAMES || "stakesadmin").toLowerCase().split(/[,\s]+/).filter(Boolean)[0];
  const db = await getDb();
  const [exists] = await db.query(`SELECT 1 FROM users WHERE username = $1 AND deleted_at IS NULL`, [username]);
  if (exists) {
    console.log(`@${username} already exists`);
    return process.exit(0);
  }
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    console.log(`No ADMIN_PASSWORD in .env.local, so @${username} wasn't made. Add one and run npm run setup again.`);
    return process.exit(0);
  }
  const salt = randomSalt();
  const { authKey, encKey } = await deriveKeys(pw, username, salt);
  const id = await createIdentity(encKey);
  const w = newWallet();
  const [u] = await db.query<{ id: number }>(
    `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc, terms_accepted_at)
     VALUES ($1,'Admin',$2,'#00c2d1',0,$3,$3,$4,$5,$6,$7,$8,$3) RETURNING id`,
    [username, await bcrypt.hash(authKey, 10), now(), id.publicKey, id.encPrivateKey, salt, w.pubkey, w.secretEnc]
  );
  await credit(db, u.id, ECONOMY.startingBalance, "Welcome bonus");
  await db.query(`INSERT INTO profiles (user_id, answers, done, updated_at) VALUES ($1, '{}'::jsonb, true, $2) ON CONFLICT DO NOTHING`, [u.id, now()]);
  console.log(`@${username} made with the password from ADMIN_PASSWORD`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
