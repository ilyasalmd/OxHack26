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
    `SELECT m.id, m.title, m.kind, m.answer, m.line, m.unit, m.category, m.b, m.q_yes, m.q_no, m.resolves_at, m.volume, m.group_id,
       g.name AS group_name, u.username AS creator,
       (SELECT price FROM price_ticks p WHERE p.market_id = m.id AND p.ts <= $2 ORDER BY p.ts DESC LIMIT 1) AS price_day_ago,
       (SELECT count(DISTINCT user_id) FROM trades x WHERE x.market_id = m.id)::int AS traders
     FROM markets m JOIN groups g ON g.id = m.group_id JOIN users u ON u.id = m.creator_id
     WHERE m.status = 'open' AND m.resolves_at > $3
       AND m.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)
     ORDER BY m.volume DESC, m.resolves_at LIMIT 60`,
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
                    WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1) AND (NOT gm.guest OR gm.user_id = $1))
     ORDER BY net_worth DESC LIMIT 6`,
    [user.id]
  );
  // One-on-one bets between friends in your chats (the Stakes tab's "Friend bets"), newest first.
  const friendBets = await db.query<any>(
    `SELECT fb.id, fb.title, fb.side, fb.stake, fb.taker_stake, fb.status, fb.resolves_at, fb.created_at, fb.settled_at, fb.group_id,
       g.name AS group_name, c.display_name AS creator, c.id AS creator_id, t.display_name AS taker, t.id AS taker_id, w.display_name AS winner, fb.winner_id
     FROM friend_bets fb JOIN groups g ON g.id = fb.group_id JOIN users c ON c.id = fb.creator_id
       LEFT JOIN users t ON t.id = fb.taker_id LEFT JOIN users w ON w.id = fb.winner_id
     WHERE fb.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)
     ORDER BY (fb.status IN ('open', 'live', 'claimed')) DESC, fb.created_at DESC LIMIT 40`,
    [user.id]
  );
  // Stakes that have finished, with what happened and how much the viewer made or lost on each.
  const settled = await db.query<any>(
    `SELECT m.id, m.title, m.kind, m.status, m.outcome, m.resolved_at, m.resolves_at, m.volume, m.group_id, g.name AS group_name,
       p.yes_shares, p.no_shares, p.spent
     FROM markets m JOIN groups g ON g.id = m.group_id
       LEFT JOIN positions p ON p.market_id = m.id AND p.user_id = $1
     WHERE m.status IN ('resolved', 'void') AND m.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)
     ORDER BY coalesce(m.resolved_at, m.resolves_at) DESC LIMIT 30`,
    [user.id]
  );
  return {
    friendBets: friendBets.map((b) => ({
      id: b.id, title: b.title, side: b.side, stake: b.stake, theirStake: b.taker_stake, status: b.status,
      resolves_at: b.resolves_at, created_at: b.created_at, settled_at: b.settled_at, group: b.group_name, group_id: b.group_id,
      creator: b.creator, creator_id: b.creator_id, taker: b.taker, taker_id: b.taker_id, winner: b.winner, winner_id: b.winner_id,
    })),
    settled: settled.map((m) => {
      const paid = m.status === "resolved" ? (m.outcome ? m.yes_shares ?? 0 : m.no_shares ?? 0) : (m.spent ?? 0);
      return {
        id: m.id, title: m.title, kind: m.kind, status: m.status, outcome: m.outcome, at: m.resolved_at ?? m.resolves_at,
        volume: m.volume, group: m.group_name, group_id: m.group_id, mine: m.spent == null ? null : paid - m.spent,
      };
    }),
    markets: markets.map((m) => {
      const price = priceYes({ b: m.b, qYes: m.q_yes, qNo: m.q_no });
      return {
        id: m.id,
        title: m.title,
        kind: m.kind,
        answer: m.answer,
        line: m.line,
        unit: m.unit,
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
