import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { maxStake, netWorth } from "@/lib/economy";
import { clockOffset, now } from "@/lib/clock";
import { CURRENCY, DEMO_MODE, ECONOMY, AI, isAdminUsername } from "@/lib/config";
import { solanaConfig } from "@/lib/solana";
import { ensureWorker } from "@/lib/worker";
import { AVATAR_COLS } from "@/lib/chat";

export const GET = route(async (_req, user) => {
  ensureWorker();
  const db = await getDb();
  // Your app has fetched the chat list, so the newest message in each chat counts as delivered.
  await db.query(
    `UPDATE group_members gm SET delivered_upto = x.top
     FROM (SELECT group_id, max(id) AS top FROM messages WHERE group_id IN (SELECT group_id FROM group_members WHERE user_id = $1) GROUP BY group_id) x
     WHERE gm.group_id = x.group_id AND gm.user_id = $1 AND gm.delivered_upto < x.top`,
    [user.id]
  );
  const groups = await db.query(
    `SELECT g.id, g.name, g.emoji, g.invite_code, g.is_dm, g.photo_id::int AS photo_id, gm.muted,
       (SELECT row_to_json(p) FROM (SELECT u.id, u.username, u.display_name, u.color, u.public_key, ${AVATAR_COLS("u", "$1")}
         FROM group_members o JOIN users u ON u.id = o.user_id WHERE g.is_dm AND o.group_id = g.id AND o.user_id <> $1 LIMIT 1) p) AS peer,
       (SELECT count(*) FROM group_members x WHERE x.group_id = g.id AND (NOT x.guest OR x.user_id = $1))::int AS members,
       (SELECT count(*) FROM markets m WHERE m.group_id = g.id AND m.status = 'open')::int AS open_markets,
       -- Unread: other people's messages and new bets since you last had the chat open (not history from before you joined).
       (SELECT count(*) FROM messages x WHERE x.group_id = g.id AND x.id > gm.read_upto AND x.created_at > gm.joined_at
          AND x.kind IN ('chat', 'market') AND x.user_id IS DISTINCT FROM $1)::int AS unread,
       (SELECT row_to_json(t) FROM (SELECT x.kind, x.body, x.created_at, x.user_id, x.ciphertext, x.iv, u.display_name AS author
         FROM messages x LEFT JOIN users u ON u.id = x.user_id WHERE x.group_id = g.id ORDER BY x.id DESC LIMIT 1) t) AS last,
       (SELECT row_to_json(k) FROM (SELECT gk.wrapped_key, w.public_key AS wrapper_public_key
         FROM group_keys gk JOIN users w ON w.id = gk.wrapped_by WHERE gk.group_id = g.id AND gk.user_id = $1) k) AS my_key
     FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = $1
     ORDER BY (SELECT max(id) FROM messages WHERE group_id = g.id) DESC NULLS LAST`,
    [user.id]
  );
  // Groups where someone joined by link and still needs the chat key; any member's
  // open app (on any screen) wraps it for them.
  const pendingKeys = await db.query(
    `SELECT k.group_id, k.wrapped_key, w.public_key AS wrapper_public_key,
       json_agg(json_build_object('id', u.id, 'public_key', u.public_key, 'has_key', false)) AS members
     FROM group_keys k JOIN users w ON w.id = k.wrapped_by
     JOIN group_members gm ON gm.group_id = k.group_id
     JOIN users u ON u.id = gm.user_id
     WHERE k.user_id = $1 AND NOT EXISTS (SELECT 1 FROM group_keys x WHERE x.group_id = gm.group_id AND x.user_id = gm.user_id)
     GROUP BY k.group_id, k.wrapped_key, w.public_key`,
    [user.id]
  );
  const [u] = await db.query<{ last_allowance_at: Date; has_recovery: boolean }>(
    `SELECT last_allowance_at, recovery_hash IS NOT NULL AS has_recovery FROM users WHERE id = $1`,
    [user.id]
  );
  const [prof] = await db.query<{ done: boolean }>(`SELECT done FROM profiles WHERE user_id = $1`, [user.id]);
  // Your profile photo key, wrapped for you, and the people you share a chat with who don't have it yet.
  const [photo] = await db.query<{ avatar_id: number | null; avatar_key: string | null }>(`SELECT ${AVATAR_COLS("u", "$1")} FROM users u WHERE u.id = $1`, [user.id]);
  const photoMissing = photo.avatar_key
    ? await db.query(
        `SELECT DISTINCT u.id, u.public_key FROM group_members mine JOIN group_members o ON o.group_id = mine.group_id JOIN users u ON u.id = o.user_id
         WHERE mine.user_id = $1 AND u.id <> $1 AND u.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM profile_keys pk WHERE pk.owner_id = $1 AND pk.viewer_id = u.id) LIMIT 50`,
        [user.id]
      )
    : [];
  // Wallet addresses and anything else about the chain are for the admin only.
  const admin = isAdminUsername(user.username);
  return {
    user: admin ? user : { ...user, wallet_pubkey: null },
    netWorth: await netWorth(db, user.id),
    maxStake: maxStake(user.balance),
    nextAllowanceAt: new Date(new Date(u.last_allowance_at).getTime() + ECONOMY.allowancePeriodMs),
    groups,
    pendingKeys,
    photo: { avatarId: photo.avatar_id, key: photo.avatar_key, missing: photoMissing },
    account: { hasRecovery: u.has_recovery, isAdmin: admin, profilePending: !!prof && !prof.done },
    clock: { now: now(), offsetMs: clockOffset() },
    config: {
      currency: CURRENCY,
      economy: ECONOMY,
      demo: DEMO_MODE,
      ai: AI.enabled,
      solana: admin && !!solanaConfig(),
      timescale: db.timescale,
      db: db.driver,
    },
  };
});
