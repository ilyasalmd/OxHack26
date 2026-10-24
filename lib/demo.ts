import { getDb, type Q } from "./db";
import { DEMO_MODE } from "./config";
import { now } from "./clock";
import { deriveKeys, unlockIdentity, unwrapGroupKey, wrapGroupKey } from "./e2ee";

/**
 * Demo only: drops a new account into the sample chats from `npm run seed`, so whoever
 * signs up at the event sees three months of use instead of an empty app.
 *
 * Sample groups are the seeded ones (invite codes ending "-demo"). Their creators are
 * seeded accounts with the published demo password, so the server can open the chat key
 * the same way their browser would and wrap a copy for the newcomer. That makes the
 * sample chats readable by the server, which is fine for public demo data and never
 * touches a group a real person created.
 */
const SAMPLE_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? "demo1234";

type Creator = { id: number; username: string; key_salt: string; enc_private_key: string; public_key: string };
const g = globalThis as unknown as { __fsSampleKeys?: Map<number, Promise<CryptoKey | null>> };
const identities = (g.__fsSampleKeys ??= new Map());

/** A seeded creator's identity key, unlocked once per process. Null if their password changed. */
function creatorKey(c: Creator) {
  let k = identities.get(c.id);
  if (!k) {
    k = deriveKeys(SAMPLE_PASSWORD, c.username, c.key_salt)
      .then(({ encKey }) => unlockIdentity(c.enc_private_key, encKey))
      .catch(() => null);
    identities.set(c.id, k);
  }
  return k;
}

/** Adds the user to every sample group they aren't in yet. Returns how many they joined. */
export async function joinSampleGroups(userId: number, q?: Q) {
  if (!DEMO_MODE) return 0;
  const db = q ?? (await getDb());
  const [me] = await db.query<{ public_key: string | null }>(`SELECT public_key FROM users WHERE id = $1`, [userId]);
  if (!me?.public_key) return 0;
  const groups = await db.query<Creator & { group_id: number; wrapped_key: string }>(
    `SELECT gr.id AS group_id, gk.wrapped_key, u.id, u.username, u.key_salt, u.enc_private_key, u.public_key
       FROM groups gr
       JOIN group_keys gk ON gk.group_id = gr.id AND gk.user_id = gr.created_by AND gk.wrapped_by = gr.created_by
       JOIN users u ON u.id = gr.created_by
      WHERE gr.invite_code LIKE '%-demo'
        AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = gr.id AND gm.user_id = $1)
      ORDER BY gr.id`,
    [userId]
  );
  let joined = 0;
  for (const grp of groups) {
    const priv = await creatorKey(grp);
    if (!priv) continue;
    const raw = await unwrapGroupKey(grp.wrapped_key, priv, grp.public_key);
    const wrapped = await wrapGroupKey(raw, priv, me.public_key);
    const added = await db.query(
      `INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id`,
      [grp.group_id, userId, now()]
    );
    if (!added.length) continue;
    await db.query(
      `INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [grp.group_id, userId, wrapped, grp.id]
    );
    joined++;
  }
  return joined;
}
