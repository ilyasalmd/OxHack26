import type { Q } from "./db";

// "How well do you know your friends?" for the wallet. Read-only: it scores calls that already settled
// and changes nothing. The score is the same one the group leaderboards use: a Brier skill score against
// always saying 50%, where a trade's forecast is where it left the price. 0 is a coin flip, 1 is perfect,
// below 0 is worse than guessing. It rewards being confidently right, not just picking the winning side.

const brier = (p: number, y: boolean) => (p - (y ? 1 : 0)) ** 2;
const skillOf = (xs: { p: number; y: boolean }[]) => (xs.length ? 1 - xs.reduce((s, x) => s + brier(x.p, x.y), 0) / xs.length / 0.25 : null);

/** Settled calls needed before you get a score, and settled stakes about a friend before they count as a read. */
export const SKILL_MIN_CALLS = 5;
export const READ_MIN_STAKES = 3;

export async function walletSkill(q: Q, userId: number) {
  // Every buy on a settled stake in any chat you're in, by anyone in those chats.
  const rows = await q.query<{ user_id: number; market_id: number; price_after: number; outcome: boolean; subject_id: number | null }>(
    `SELECT t.user_id, t.market_id, t.price_after, m.outcome, m.subject_id
     FROM trades t JOIN markets m ON m.id = t.market_id
     WHERE m.status = 'resolved' AND m.outcome IS NOT NULL AND t.action = 'buy'
       AND m.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)`,
    [userId]
  );
  const friends = await q.query<{ id: number; username: string; display_name: string; color: string }>(
    `SELECT DISTINCT u.id, u.username, u.display_name, u.color FROM users u JOIN group_members gm ON gm.user_id = u.id
     WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1) AND NOT gm.guest AND u.id <> $1`,
    [userId]
  );

  const byUser = new Map<number, { p: number; y: boolean }[]>();
  for (const r of rows) {
    const xs = byUser.get(r.user_id) ?? [];
    xs.push({ p: r.price_after, y: r.outcome });
    byUser.set(r.user_id, xs);
  }
  const mine = rows.filter((r) => r.user_id === userId);
  const score = mine.length >= SKILL_MIN_CALLS ? skillOf(mine.map((r) => ({ p: r.price_after, y: r.outcome }))) : null;
  const hits = mine.filter((r) => (r.price_after >= 0.5) === r.outcome).length;

  // Where you sit among friends who also have enough settled calls.
  const field = friends
    .map((f) => ({ id: f.id, xs: byUser.get(f.id) ?? [] }))
    .filter((f) => f.xs.length >= SKILL_MIN_CALLS)
    .map((f) => skillOf(f.xs)!);
  const beat = score == null ? 0 : field.filter((s) => s < score).length;
  const avg = field.length ? field.reduce((a, b) => a + b, 0) / field.length : null;

  // Your reads on each friend: your calls on stakes about them, once enough of those have settled.
  const reads = friends
    .map((f) => {
      const about = mine.filter((r) => r.subject_id === f.id);
      const stakes = new Set(about.map((r) => r.market_id)).size;
      return { id: f.id, username: f.username, display_name: f.display_name, color: f.color, stakes, calls: about.length, score: skillOf(about.map((r) => ({ p: r.price_after, y: r.outcome }))) };
    })
    .filter((r) => r.stakes >= READ_MIN_STAKES && r.score != null)
    .sort((a, b) => b.score! - a.score!);

  return {
    score,
    calls: mine.length,
    settled: new Set(mine.map((r) => r.market_id)).size,
    rightSide: mine.length ? hits / mine.length : null,
    minCalls: SKILL_MIN_CALLS,
    friendsScored: field.length,
    beat,
    friendsAvg: avg,
    field: field.sort((a, b) => a - b),
    reads: reads.slice(0, 5),
    readsMin: READ_MIN_STAKES,
    readsPending: friends.length - reads.length,
  };
}
