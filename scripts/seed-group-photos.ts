/**
 * Group pictures for the sample chats (painted by scripts/avatars/make.py into
 * scripts/avatars/groups/), and the admin's profile photo. Each group picture is encrypted with
 * that chat's key, opened through a sample member as the server does for newcomers, so it shows
 * like one a member uploaded. Skips a chat that already has a picture. Safe to run again:
 *
 *   npx tsx --env-file=.env.local scripts/seed-group-photos.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../lib/db";
import { creatorKey, SAMPLE_GROUPS } from "../lib/demo";
import { deriveKeys, encryptBytes, importGroupKey, newGroupKey, unlockIdentity, unwrapGroupKey, wrapGroupKey } from "../lib/e2ee";

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "avatars");
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/^-+|-+$/g, "").replace(/--/g, "-");

async function main() {
  const db = await getDb();
  const groups = await db.query<{ id: number; name: string }>(`SELECT gr.id, gr.name FROM groups gr WHERE ${SAMPLE_GROUPS} AND gr.photo_id IS NULL ORDER BY gr.id`);
  for (const g of groups) {
    const jpeg = await readFile(path.join(DIR, "groups", `${slug(g.name)}.jpg`)).catch(() => null);
    if (!jpeg) {
      console.log(`${g.name}: no picture painted`);
      continue;
    }
    // Any member whose identity opens with the sample password can open the chat key.
    const holders = await db.query<{ id: number; username: string; key_salt: string; enc_private_key: string; public_key: string; wrapped_key: string; wrapper_public_key: string }>(
      `SELECT u.id, u.username, u.key_salt, u.enc_private_key, u.public_key, gk.wrapped_key, w.public_key AS wrapper_public_key
         FROM group_keys gk JOIN users u ON u.id = gk.user_id AND u.deleted_at IS NULL JOIN users w ON w.id = gk.wrapped_by
         JOIN group_members gm ON gm.group_id = gk.group_id AND gm.user_id = u.id AND NOT gm.guest
        WHERE gk.group_id = $1 ORDER BY u.id`,
      [g.id]
    );
    let done = false;
    for (const h of holders) {
      const priv = await creatorKey(h);
      const raw = priv && (await unwrapGroupKey(h.wrapped_key, priv, h.wrapper_public_key).catch(() => null));
      if (!raw) continue;
      const sealed = await encryptBytes(await importGroupKey(raw), new Uint8Array(jpeg));
      const [a] = await db.query<{ id: number }>(
        `INSERT INTO attachments (owner_id, group_id, kind, data, size, created_at) VALUES ($1,$2,'group_photo',$3,$4,now()) RETURNING id::int`,
        [h.id, g.id, sealed, sealed.length]
      );
      await db.query(`UPDATE groups SET photo_id = $2 WHERE id = $1`, [g.id, a.id]);
      console.log(`${g.name}: picture set (via @${h.username})`);
      done = true;
      break;
    }
    if (!done) console.log(`${g.name}: no member could open the chat key`);
  }

  // The admin's photo, opened with the admin password from .env.local (never printed).
  const pw = process.env.ADMIN_PASSWORD;
  const [admin] = await db.query<{ id: number; username: string; key_salt: string; enc_private_key: string; avatar_id: number | null }>(
    `SELECT id, username, key_salt, enc_private_key, avatar_id FROM users WHERE username = 'stakesadmin' AND deleted_at IS NULL`
  );
  const jpeg = await readFile(path.join(DIR, "stakesadmin.jpg")).catch(() => null);
  if (admin && !admin.avatar_id && pw && jpeg) {
    const priv = await deriveKeys(pw, admin.username, admin.key_salt).then(({ encKey }) => unlockIdentity(admin.enc_private_key, encKey)).catch(() => null);
    if (!priv) console.log("Admin photo: the admin password didn't open the admin's key");
    else {
      const key = newGroupKey();
      const sealed = await encryptBytes(await importGroupKey(key), new Uint8Array(jpeg));
      const [a] = await db.query<{ id: number }>(`INSERT INTO attachments (owner_id, group_id, kind, data, size, created_at) VALUES ($1,NULL,'avatar',$2,$3,now()) RETURNING id::int`, [admin.id, sealed, sealed.length]);
      await db.query(`UPDATE users SET avatar_id = $2 WHERE id = $1`, [admin.id, a.id]);
      const viewers = await db.query<{ id: number; public_key: string }>(
        `SELECT DISTINCT v.id, v.public_key FROM group_members mine JOIN group_members o ON o.group_id = mine.group_id
           JOIN users v ON v.id = o.user_id AND v.deleted_at IS NULL AND v.public_key IS NOT NULL WHERE mine.user_id = $1
         UNION SELECT id, public_key FROM users WHERE id = $1`,
        [admin.id]
      );
      for (const v of viewers) await db.query(`INSERT INTO profile_keys (owner_id, viewer_id, wrapped) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [admin.id, v.id, await wrapGroupKey(key, priv, v.public_key)]);
      console.log(`Admin photo set, shown to ${viewers.length} people`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
