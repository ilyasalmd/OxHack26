import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { isClosed, price, voteState, type MarketRow } from "@/lib/markets";
import { friendBetsForChat } from "@/lib/friend-bet";
import { now } from "@/lib/clock";

// One chat's stakes for its Stakes list: every market and friend bet ever posted in it, with
// the 24h move, the vote on any proposed result, and what the viewer has in each. No messages,
// so opening the list never moves anyone's read ticks.
export const GET = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idParam(ctx);
  await requireMember(id, user.id);
  const db = await getDb();
  const t = now();
  const dayAgo = new Date(t.getTime() - 86_400_000);
  const [markets, friendBets, members] = await Promise.all([
    db.query<MarketRow & { price_day_ago: number | null; traders: number; yes_shares: number | null; no_shares: number | null; spent: number | null }>(
      `SELECT m.*,
         (SELECT price FROM price_ticks p WHERE p.market_id = m.id AND p.ts <= $3 ORDER BY p.ts DESC LIMIT 1) AS price_day_ago,
         (SELECT count(DISTINCT user_id) FROM trades x WHERE x.market_id = m.id)::int AS traders,
         p.yes_shares, p.no_shares, p.spent
       FROM markets m LEFT JOIN positions p ON p.market_id = m.id AND p.user_id = $2
       WHERE m.group_id = $1 ORDER BY m.created_at DESC`,
      [id, user.id, dayAgo]
    ),
    friendBetsForChat(db, id),
    db.query<{ id: number; display_name: string; color: string }>(
      `SELECT u.id, u.display_name, u.color FROM group_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND (NOT gm.guest OR gm.user_id = $2)`,
      [id, user.id]
    ),
  ]);
  const proposed = markets.filter((m) => m.status === "open" && m.proposed_outcome != null);
  const tallies = await Promise.all(proposed.map((m) => voteState(db, m)));
  const votes = new Map(proposed.map((m, i) => [m.id, tallies[i]]));
  return {
    now: t,
    members,
    markets: markets.map((m) => {
      const p = price(m);
      const v = votes.get(m.id);
      // Settled: paid out minus spent. Called off: refunded, so nothing either way.
      const paid = m.status === "resolved" ? (m.outcome ? m.yes_shares ?? 0 : m.no_shares ?? 0) : (m.spent ?? 0);
      return {
        id: m.id,
        title: m.title,
        kind: m.kind,
        answer: m.answer,
        line: m.line,
        unit: m.unit,
        subject_id: m.subject_id,
        status: m.status,
        outcome: m.outcome,
        proposed_outcome: m.proposed_outcome,
        void_reason: m.void_reason,
        closed: isClosed(m),
        price: p,
        change: m.status !== "open" || m.price_day_ago == null ? 0 : p - m.price_day_ago,
        volume: m.volume,
        traders: m.traders,
        created_at: m.created_at,
        resolves_at: m.resolves_at,
        resolved_at: m.resolved_at,
        votes: v ? { needed: v.needed, confirms: v.confirms.length, canVote: v.eligible.includes(user.id), mine: v.confirms.includes(user.id) ? true : v.rejects.includes(user.id) ? false : null } : null,
        holding: (m.spent ?? 0) > 0,
        pnl: m.status === "open" || m.spent == null || m.spent <= 0 ? null : paid - m.spent,
      };
    }),
    friendBets,
  };
});
