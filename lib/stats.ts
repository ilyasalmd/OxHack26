import type { Q } from "./db";
import { netWorth } from "./economy";
import { priceYes } from "./lmsr";

const brier = (p: number, y: boolean) => (p - (y ? 1 : 0)) ** 2;

/** Leaderboard: balance, net worth and forecasting skill (Brier skill score vs always saying 50%). */
export async function leaderboard(q: Q, groupId: number, viewerId: number) {
  const members = await q.query<{ id: number; username: string; display_name: string; color: string }>(
    `SELECT u.id, u.username, u.display_name, u.color FROM users u JOIN group_members gm ON gm.user_id = u.id
     WHERE gm.group_id = $1 AND (NOT gm.guest OR gm.user_id = $2)`,
    [groupId, viewerId]
  );
  // A trader's forecast is where they left the price; scored against what happened.
  const trades = await q.query<{ user_id: number; price_after: number; outcome: boolean; pnl_side: string }>(
    `SELECT t.user_id, t.price_after, m.outcome, t.side AS pnl_side FROM trades t JOIN markets m ON m.id = t.market_id
     WHERE m.group_id = $1 AND m.status = 'resolved' AND t.action = 'buy'`,
    [groupId]
  );
  // P&L from this group's markets only (balances are one wallet across all your groups).
  const pos = await q.query<{ user_id: number; yes_shares: number; no_shares: number; spent: number; status: string; outcome: boolean | null; b: number; q_yes: number; q_no: number }>(
    `SELECT p.user_id, p.yes_shares, p.no_shares, p.spent, m.status, m.outcome, m.b, m.q_yes, m.q_no
     FROM positions p JOIN markets m ON m.id = p.market_id WHERE m.group_id = $1`,
    [groupId]
  );
  const rows = [];
  for (const u of members) {
    const groupPnl = pos
      .filter((p) => p.user_id === u.id)
      .reduce((s, p) => {
        const pr = p.status === "resolved" ? (p.outcome ? 1 : 0) : priceYes({ b: p.b, qYes: p.q_yes, qNo: p.q_no });
        return s + p.yes_shares * pr + p.no_shares * (1 - pr) - p.spent;
      }, 0);
    const nw = await netWorth(q, u.id);
    const mine = trades.filter((t) => t.user_id === u.id);
    const b = mine.length ? mine.reduce((s, t) => s + brier(t.price_after, t.outcome), 0) / mine.length : null;
    const hits = mine.filter((t) => (t.pnl_side === "yes") === t.outcome).length;
    rows.push({
      ...u,
      balance: nw.balance,
      netWorth: nw.total,
      groupPnl,
      resolvedTrades: mine.length,
      hitRate: mine.length ? hits / mine.length : null,
      brier: b,
      skill: b == null ? null : 1 - b / 0.25,
    });
  }
  return rows.sort((a, b) => b.netWorth - a.netWorth);
}

/** AI vs crowd vs coin-flip on everything this group has resolved, plus calibration bins. */
export async function insights(q: Q, groupId: number) {
  const rows = await q.query<{ id: number; title: string; outcome: boolean; ai_prob: number; open_prob: number; crowd: number | null; kind: string; category: string }>(
    `SELECT m.id, m.title, m.outcome, m.ai_prob, m.open_prob, m.kind, m.category,
       (SELECT price FROM price_ticks pt WHERE pt.market_id = m.id AND pt.source <> 'resolve' ORDER BY ts DESC LIMIT 1) AS crowd
     FROM markets m WHERE m.group_id = $1 AND m.status = 'resolved' ORDER BY m.resolved_at`,
    [groupId]
  );
  const n = rows.length;
  const score = (f: (r: (typeof rows)[number]) => number) => (n ? rows.reduce((s, r) => s + brier(f(r), r.outcome), 0) / n : null);
  const bins = Array.from({ length: 5 }, (_, i) => ({ lo: i * 0.2, hi: (i + 1) * 0.2, ai: [0, 0], crowd: [0, 0] }));
  for (const r of rows) {
    const crowd = r.crowd ?? r.open_prob;
    const ai = bins[Math.min(4, Math.floor(r.ai_prob * 5))];
    ai.ai[0]++;
    ai.ai[1] += r.outcome ? 1 : 0;
    const cr = bins[Math.min(4, Math.floor(crowd * 5))];
    cr.crowd[0]++;
    cr.crowd[1] += r.outcome ? 1 : 0;
  }
  const byCategory: Record<string, { n: number; yes: number }> = {};
  for (const r of rows) {
    byCategory[r.category] ??= { n: 0, yes: 0 };
    byCategory[r.category].n++;
    byCategory[r.category].yes += r.outcome ? 1 : 0;
  }
  return {
    n,
    brier: { ai: score((r) => r.ai_prob), crowd: score((r) => r.crowd ?? r.open_prob), opening: score((r) => r.open_prob), baseline: n ? 0.25 : null },
    calibration: bins.map((b) => ({
      bin: `${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%`,
      mid: (b.lo + b.hi) / 2,
      aiN: b.ai[0],
      aiRate: b.ai[0] ? b.ai[1] / b.ai[0] : null,
      crowdN: b.crowd[0],
      crowdRate: b.crowd[0] ? b.crowd[1] / b.crowd[0] : null,
    })),
    byCategory,
  };
}
