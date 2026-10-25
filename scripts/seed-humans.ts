/**
 * The demo's real people: Aariz, Durukan and Barkin get ordinary accounts (not bots, not admin)
 * and become full members of the group chats Ilyas is in, with profile photos, the way they
 * would if Ilyas had added them. The family, couple and sibling chats they only see as guests,
 * like any other account. Safe to run again:
 *
 *   npx tsx --env-file=.env.local scripts/seed-humans.ts
 */
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../lib/db";
import { credit } from "../lib/economy";
import { newWallet } from "../lib/solana";
import { creatorKey, joinSampleGroups, shareSamplePhotos } from "../lib/demo";
import { createIdentity, deriveKeys, encryptBytes, importGroupKey, newGroupKey, randomSalt, unwrapGroupKey, wrapGroupKey } from "../lib/e2ee";
import { PASSWORD } from "./seed-content";

const HUMANS = [
  { username: "aariz", name: "Aariz", color: "#ffd166" },
  { username: "durukan", name: "Durukan", color: "#06d6a0" },
  { username: "barkin", name: "Barkin", color: "#ef476f" },
];
// The friends, course, football, careers, running and society chats.
const GROUP_CHATS = ["Flat 4B", "Maths & Econ Y2", "Sunday League", "Spring Week Grind", "Run Club", "Finance Soc Committee"];

type U = { id: number; username: string; display_name: string; public_key: string; enc_private_key: string; key_salt: string; avatar_id: number | null };

async function main() {
  const db = await getDb();
  const load = async (name: string) =>
    (await db.query<U>(`SELECT id, username, display_name, public_key, enc_private_key, key_salt, avatar_id FROM users WHERE username = $1 AND deleted_at IS NULL`, [name]))[0];

  const made: U[] = [];
  for (const h of HUMANS) {
    let u = await load(h.username);
    if (!u) {
      const salt = randomSalt();
      const { authKey, encKey } = await deriveKeys(PASSWORD, h.username, salt);
      const id = await createIdentity(encKey);
      const w = newWallet();
      const [row] = await db.query<{ id: number }>(
        `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc)
         VALUES ($1,$2,$3,$4,0,now(),now(),$5,$6,$7,$8,$9) RETURNING id`,
        [h.username, h.name, await bcrypt.hash(authKey, 10), h.color, id.publicKey, id.encPrivateKey, salt, w.pubkey, w.secretEnc]
      );
      await credit(db, row.id, 500, "Welcome bonus");
      await db.query(`INSERT INTO profiles (user_id, answers, done, updated_at) VALUES ($1, '{}'::jsonb, false, now()) ON CONFLICT DO NOTHING`, [row.id]);
      console.log(`Made @${h.username}`);
      u = await load(h.username);
    }
    made.push(u);
  }

  // Full members of the group chats, with the chat key wrapped for them by someone already in it.
  for (const name of GROUP_CHATS) {
    const holders = await db.query<U & { group_id: number; wrapped_key: string; wrapper_public_key: string; created_at: string }>(
      `SELECT g.id AS group_id, g.created_at, gk.wrapped_key, w.public_key AS wrapper_public_key, u.id, u.username, u.key_salt, u.enc_private_key, u.public_key
         FROM groups g JOIN group_keys gk ON gk.group_id = g.id JOIN users u ON u.id = gk.user_id JOIN users w ON w.id = gk.wrapped_by
        WHERE g.name = $1 AND g.invite_code LIKE '%-demo' ORDER BY (u.username = 'ilyas') DESC, (gk.user_id = g.created_by) DESC`,
      [name]
    );
    let raw: Uint8Array | null = null;
    let holder: (typeof holders)[number] | null = null;
    for (const h of holders) {
      const priv = await creatorKey(h);
      raw = priv ? await unwrapGroupKey(h.wrapped_key, priv, h.wrapper_public_key).catch(() => null) : null;
      if (raw) {
        holder = h;
        break;
      }
    }
    if (!raw || !holder) throw new Error(`Couldn't open the key for ${name}`);
    const priv = (await creatorKey(holder))!;
    for (const u of made) {
      await db.query(
        `INSERT INTO group_members (group_id, user_id, joined_at, guest) VALUES ($1,$2,now(),false)
         ON CONFLICT (group_id, user_id) DO UPDATE SET guest = false`,
        [holder.group_id, u.id]
      );
      await db.query(
        `INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [holder.group_id, u.id, await wrapGroupKey(raw, priv, u.public_key), holder.id]
      );
      // Caught up on the chat's history, as if they'd scrolled through it.
      await db.query(
        `UPDATE group_members SET read_upto = GREATEST(read_upto, x.m), delivered_upto = GREATEST(delivered_upto, x.m)
           FROM (SELECT max(id) AS m FROM messages WHERE group_id = $1) x WHERE group_id = $1 AND user_id = $2`,
        [holder.group_id, u.id]
      );
    }
    console.log(`${name}: ${made.map((u) => u.display_name).join(", ")} are members`);
  }

  // Their photos, visible to everyone who shares a chat with them.
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "avatars");
  for (const u of made) {
    if (u.avatar_id) continue;
    const priv = await creatorKey(u);
    const jpeg = await readFile(path.join(dir, `${u.username}.jpg`)).catch(() => null);
    if (!priv || !jpeg) continue;
    const key = newGroupKey();
    const sealed = await encryptBytes(await importGroupKey(key), new Uint8Array(jpeg));
    const [a] = await db.query<{ id: number }>(`INSERT INTO attachments (owner_id, group_id, kind, data, size, created_at) VALUES ($1,NULL,'avatar',$2,$3,now()) RETURNING id::int`, [u.id, sealed, sealed.length]);
    await db.query(`UPDATE users SET avatar_id = $2 WHERE id = $1`, [u.id, a.id]);
    const viewers = await db.query<{ id: number; public_key: string }>(
      `SELECT DISTINCT v.id, v.public_key FROM group_members mine JOIN group_members o ON o.group_id = mine.group_id
         JOIN users v ON v.id = o.user_id AND v.deleted_at IS NULL AND v.public_key IS NOT NULL WHERE mine.user_id = $1`,
      [u.id]
    );
    for (const v of viewers) await db.query(`INSERT INTO profile_keys (owner_id, viewer_id, wrapped) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [u.id, v.id, await wrapGroupKey(key, priv, v.public_key)]);
    console.log(`Photo for @${u.username}, shown to ${viewers.length} people`);
  }

  // The other sample chats as guests, like every account, and everyone else's photos.
  for (const u of made) {
    const n = await joinSampleGroups(u.id);
    await shareSamplePhotos(db, u.id, u.public_key);
    if (n) console.log(`@${u.username}: sees ${n} more sample chats as a guest`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
