import type { Q } from "./db";
import { netWorth } from "./economy";
import { priceYes } from "./lmsr";
import { groupCalls, isQuiet, skillByUser, stakeScores } from "./skill";
import { now } from "./clock";

const brier = (p: number, y: boolean) => (p - (y ? 1 : 0)) ** 2;

/**
 * Leaderboard: one per group, ranked by forecasting skill in this group's stakes (see lib/skill.ts).
 * Everyone with a settled stake is ranked; people with none are listed after. Coins (net worth, one
 * wallet across all your groups) and this group's P&L ride along but never decide the order.
 */
export async function leaderboard(q: Q, groupId: number, viewerId: number) {
  const members = await q.query<{ id: number; username: string; display_name: string; color: string }>(
    `SELECT u.id, u.username, u.display_name, u.color FROM users u JOIN group_members gm ON gm.user_id = u.id
     WHERE gm.group_id = $1 AND (NOT gm.guest OR gm.user_id = $2)`,
    [groupId, viewerId]
  );
  const skills = skillByUser(stakeScores(await groupCalls(q, groupId)));
  // P&L from this group's markets only (balances are one wallet across all your groups).
  const pos = await q.query<{ user_id: number; yes_shares: number; no_shares: number; spent: number; status: string; outcome: boolean | null; b: number; q_yes: number; q_no: number }>(
    `SELECT p.user_id, p.yes_shares, p.no_shares, p.spent, m.status, m.outcome, m.b, m.q_yes, m.q_no
     FROM positions p JOIN markets m ON m.id = p.market_id WHERE m.group_id = $1 AND m.status <> 'void'`,
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
    const sk = skills.get(u.id);
    rows.push({
      ...u,
      balance: nw.balance,
      netWorth: nw.total,
      groupPnl,
      skill: sk && sk.stakes ? sk.skill : null,
      stakes: sk?.stakes ?? 0,
      early: sk ? sk.early : true,
      tier: sk?.tier ?? null,
      quiet: isQuiet(sk?.last),
      // Whole weeks since their last call here (on the demo clock, so the browser needn't know it).
      weeksSinceCall: sk?.last ? Math.floor((now().getTime() - sk.last) / (7 * 86_400_000)) : null,
    });
  }
  return rows.sort((a, b) => (a.skill == null ? 1 : 0) - (b.skill == null ? 1 : 0) || (b.skill ?? 0) - (a.skill ?? 0) || a.display_name.localeCompare(b.display_name));
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
