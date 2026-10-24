import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { now } from "@/lib/clock";
import { priceYes } from "@/lib/lmsr";

// Everything live across the user's chats, for the overview: open situations with their
// 24h move, the latest calls friends made, and who is ahead.
export const GET = route(async (_req, user) => {
  const db = await getDb();
  const t = now();
  const dayAgo = new Date(t.getTime() - 86_400_000);
  const markets = await db.query<any>(
    `SELECT m.id, m.title, m.kind, m.category, m.b, m.q_yes, m.q_no, m.resolves_at, m.volume, m.group_id,
       g.name AS group_name, u.username AS creator,
       (SELECT price FROM price_ticks p WHERE p.market_id = m.id AND p.ts <= $2 ORDER BY p.ts DESC LIMIT 1) AS price_day_ago,
       (SELECT count(DISTINCT user_id) FROM trades x WHERE x.market_id = m.id)::int AS traders
     FROM markets m JOIN groups g ON g.id = m.group_id JOIN users u ON u.id = m.creator_id
     WHERE m.status = 'open' AND m.resolves_at > $3
       AND m.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)
     ORDER BY m.volume DESC, m.resolves_at LIMIT 24`,
    [user.id, dayAgo, t]
  );
  const calls = await db.query<any>(
    `SELECT tr.id, tr.side, tr.action, tr.coins, tr.price_after, tr.created_at, tr.market_id,
       m.title, m.kind, u.display_name, u.username, u.color
     FROM trades tr JOIN markets m ON m.id = tr.market_id JOIN users u ON u.id = tr.user_id
     WHERE m.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)
     ORDER BY tr.created_at DESC, tr.id DESC LIMIT 8`,
    [user.id]
  );
  const leaders = await db.query<any>(
    `SELECT u.id, u.display_name, u.username, u.color,
       coalesce((SELECT net_worth FROM balance_ticks b WHERE b.user_id = u.id ORDER BY b.ts DESC LIMIT 1), u.balance) AS net_worth
     FROM users u
     WHERE u.id IN (SELECT gm.user_id FROM group_members gm
                    WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1))
     ORDER BY net_worth DESC LIMIT 6`,
    [user.id]
  );
  return {
    markets: markets.map((m) => {
      const price = priceYes({ b: m.b, qYes: m.q_yes, qNo: m.q_no });
      return {
        id: m.id,
        title: m.title,
        kind: m.kind,
        category: m.category,
        group: m.group_name,
        group_id: m.group_id,
        creator: m.creator,
        resolves_at: m.resolves_at,
        volume: m.volume,
        traders: m.traders,
        price,
        change: m.price_day_ago == null ? 0 : price - m.price_day_ago,
      };
    }),
    calls,
    leaders: leaders.map((l) => ({ ...l, me: l.id === user.id })),
  };
});
