/**
 * Gives the sample people their profile photos on a database that already has them (seed.ts does
 * this for a fresh seed). Skips anyone who already has a photo, then hands every real account in
 * the sample chats the keys to see them:
 *
 *   npx tsx --env-file=.env.local scripts/apply-avatars.ts
 */
import { getDb } from "../lib/db";
import { creatorKey, shareSamplePhotos } from "../lib/demo";
import { PEOPLE } from "./seed-content";
import { seedAvatars } from "./seed-avatars";

async function main() {
  const db = await getDb();
  type U = { id: number; username: string; key_salt: string; enc_private_key: string; public_key: string; avatar_id: number | null };
  const rows = await db.query<U>(`SELECT id, username, key_salt, enc_private_key, public_key, avatar_id FROM users WHERE username = ANY($1::text[]) AND deleted_at IS NULL`, [PEOPLE.map((p) => p.username)]);
  const people: Record<string, { id: number; public_key: string; priv: CryptoKey }> = {};
  for (const u of rows) {
    if (u.avatar_id) continue;
    const priv = await creatorKey(u);
    if (priv) people[u.username] = { id: u.id, public_key: u.public_key, priv };
  }
  // Who shares a chat with whom, from the sample chats as they are now.
  const groups = await db.query<{ group_id: number; members: string[] }>(
    `SELECT gm.group_id, array_agg(u.username) AS members FROM group_members gm JOIN users u ON u.id = gm.user_id
      WHERE NOT gm.guest AND u.username = ANY($1::text[]) GROUP BY gm.group_id`,
    [PEOPLE.map((p) => p.username)]
  );
  const n = await seedAvatars(db, people, groups, new Date());
  // Everyone else in the sample chats (real accounts, guests) gets the keys too.
  const others = await db.query<{ id: number; public_key: string }>(
    `SELECT DISTINCT u.id, u.public_key FROM users u JOIN group_members gm ON gm.user_id = u.id
      WHERE u.deleted_at IS NULL AND NOT (u.username = ANY($1::text[]))`,
    [PEOPLE.map((p) => p.username)]
  );
  for (const o of others) await shareSamplePhotos(db, o.id, o.public_key);
  console.log(`Photos for ${n} sample people; keys shared with ${others.length} other accounts.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
