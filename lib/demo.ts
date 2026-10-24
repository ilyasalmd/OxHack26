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

/** A sample account's identity key, unlocked once per process. Null if it isn't a sample account. */
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

/** The seeded sample chats from `npm run seed` and the admin's `seed-demo` chat. */
export const SAMPLE_GROUPS = `(gr.invite_code LIKE '%-demo' OR gr.invite_code LIKE 'demo-punctuality-%')`;

/** Adds the user to every sample group they aren't in yet. Returns how many they joined. */
export async function joinSampleGroups(userId: number, q?: Q) {
  if (!DEMO_MODE) return 0;
  const db = q ?? (await getDb());
  const [me] = await db.query<{ public_key: string | null }>(`SELECT public_key FROM users WHERE id = $1`, [userId]);
  if (!me?.public_key) return 0;
  // Anyone in the chat whose identity opens with the sample password can hand out the key:
  // the creator in the seeded chats, one of the sample people in the admin's demo chat.
  const holders = await db.query<Creator & { group_id: number; wrapped_key: string; wrapper_public_key: string }>(
    `SELECT gr.id AS group_id, gk.wrapped_key, w.public_key AS wrapper_public_key, u.id, u.username, u.key_salt, u.enc_private_key, u.public_key
       FROM groups gr
       JOIN group_keys gk ON gk.group_id = gr.id
       JOIN users u ON u.id = gk.user_id AND u.deleted_at IS NULL
       JOIN users w ON w.id = gk.wrapped_by
      WHERE ${SAMPLE_GROUPS}
        AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = gr.id AND gm.user_id = $1)
      ORDER BY gr.id, (gk.user_id = gr.created_by) DESC, gk.user_id`,
    [userId]
  );
  let joined = 0;
  const done = new Set<number>();
  for (const h of holders) {
    if (done.has(h.group_id)) continue;
    const priv = await creatorKey(h);
    if (!priv) continue;
    const raw = await unwrapGroupKey(h.wrapped_key, priv, h.wrapper_public_key).catch(() => null);
    if (!raw) continue;
    done.add(h.group_id);
    const wrapped = await wrapGroupKey(raw, priv, me.public_key);
    const added = await db.query(
      `INSERT INTO group_members (group_id, user_id, joined_at, guest) VALUES ($1,$2,$3,true) ON CONFLICT DO NOTHING RETURNING user_id`,
      [h.group_id, userId, now()]
    );
    if (!added.length) continue;
    await db.query(
      `INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [h.group_id, userId, wrapped, h.id]
    );
    joined++;
  }
  return joined;
}
