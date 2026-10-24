import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { maxStake, netWorth } from "@/lib/economy";
import { clockOffset, now } from "@/lib/clock";
import { CURRENCY, DEMO_MODE, ECONOMY, AI } from "@/lib/config";
import { solanaConfig } from "@/lib/solana";
import { ensureWorker } from "@/lib/worker";

export const GET = route(async (_req, user) => {
  ensureWorker();
  const db = await getDb();
  const groups = await db.query(
    `SELECT g.id, g.name, g.emoji, g.invite_code,
       (SELECT count(*) FROM group_members x WHERE x.group_id = g.id)::int AS members,
       (SELECT count(*) FROM markets m WHERE m.group_id = g.id AND m.status = 'open')::int AS open_markets,
       (SELECT row_to_json(t) FROM (SELECT kind, body, created_at, user_id FROM messages WHERE group_id = g.id ORDER BY id DESC LIMIT 1) t) AS last
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
  const [u] = await db.query<{ last_allowance_at: Date }>(`SELECT last_allowance_at FROM users WHERE id = $1`, [user.id]);
  return {
    user,
    netWorth: await netWorth(db, user.id),
    maxStake: maxStake(user.balance),
    nextAllowanceAt: new Date(new Date(u.last_allowance_at).getTime() + ECONOMY.allowancePeriodMs),
    groups,
    pendingKeys,
    clock: { now: now(), offsetMs: clockOffset() },
    config: {
      currency: CURRENCY,
      economy: ECONOMY,
      demo: DEMO_MODE,
      gemini: AI.enabled,
      solana: !!solanaConfig(),
      timescale: db.timescale,
      db: db.driver,
      voice: !!process.env.ELEVENLABS_API_KEY,
    },
  };
});
