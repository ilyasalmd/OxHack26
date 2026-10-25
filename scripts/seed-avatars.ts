/**
 * Gives each sample person the profile photo in scripts/avatars/<username>.jpg, the way their
 * own browser would: the picture is encrypted with a fresh profile key, and that key is wrapped
 * for them and for everyone they share a chat with, so the server only ever holds ciphertext.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Q } from "../lib/db";
import { encryptBytes, importGroupKey, newGroupKey, wrapGroupKey } from "../lib/e2ee";

type Person = { id: number; public_key: string; priv: CryptoKey };

export async function seedAvatars(db: Q, people: Record<string, Person>, chats: { members: string[] }[], at: Date) {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "avatars");
  let n = 0;
  for (const [username, me] of Object.entries(people)) {
    const jpeg = await readFile(path.join(dir, `${username}.jpg`)).catch(() => null);
    if (!jpeg) continue;
    const raw = newGroupKey();
    const sealed = await encryptBytes(await importGroupKey(raw), new Uint8Array(jpeg));
    const [a] = await db.query<{ id: number }>(
      `INSERT INTO attachments (owner_id, group_id, kind, data, size, created_at) VALUES ($1,NULL,'avatar',$2,$3,$4) RETURNING id::int`,
      [me.id, sealed, sealed.length, at]
    );
    await db.query(`UPDATE users SET avatar_id = $2 WHERE id = $1`, [me.id, a.id]);
    const viewers = new Set([username, ...chats.filter((c) => c.members.includes(username)).flatMap((c) => c.members)]);
    for (const v of viewers) {
      const them = people[v];
      if (!them) continue;
      await db.query(`INSERT INTO profile_keys (owner_id, viewer_id, wrapped) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [me.id, them.id, await wrapGroupKey(raw, me.priv, them.public_key)]);
    }
    n++;
  }
  return n;
}
