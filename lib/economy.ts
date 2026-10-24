import type { Q } from "./db";
import { ECONOMY } from "./config";
import { now } from "./clock";
import { priceYes } from "./lmsr";

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Change a balance, write the ledger + time series, and queue the matching Solana mint/burn. */
export async function credit(q: Q, userId: number, delta: number, reason: string, marketId: number | null = null) {
  delta = round2(delta);
  if (delta === 0) return;
  const ts = now();
  const [u] = await q.query<{ balance: number }>(
    `UPDATE users SET balance = round((balance + $2)::numeric, 2)::float8 WHERE id = $1 RETURNING balance`,
    [userId, delta]
  );
  await q.query(
    `INSERT INTO ledger (user_id, ts, delta, balance_after, reason, market_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, ts, delta, u.balance, reason, marketId]
  );
  await q.query(`INSERT INTO chain_ops (kind, user_id, market_id, amount, memo, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
    delta > 0 ? "mint" : "burn",
    userId,
    marketId,
    Math.abs(delta),
    reason,
    ts,
  ]);
  await recordNetWorth(q, userId);
}

export async function netWorth(q: Q, userId: number) {
  const [u] = await q.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [userId]);
  const rows = await q.query<{ yes_shares: number; no_shares: number; b: number; q_yes: number; q_no: number }>(
    `SELECT p.yes_shares, p.no_shares, m.b, m.q_yes, m.q_no
     FROM positions p JOIN markets m ON m.id = p.market_id
     WHERE p.user_id = $1 AND m.status = 'open'`,
    [userId]
  );
  const held = rows.reduce((s, r) => {
    const p = priceYes({ b: r.b, qYes: r.q_yes, qNo: r.q_no });
    return s + r.yes_shares * p + r.no_shares * (1 - p);
  }, 0);
  return { balance: u.balance, positions: round2(held), total: round2(u.balance + held) };
}

export async function recordNetWorth(q: Q, userId: number) {
  const nw = await netWorth(q, userId);
  await q.query(`INSERT INTO balance_ticks (user_id, ts, balance, net_worth) VALUES ($1,$2,$3,$4)`, [
    userId,
    now(),
    nw.balance,
    nw.total,
  ]);
}

/** +50 every week, paid lazily whenever the user next shows up. */
export async function applyAllowance(q: Q, userId: number) {
  const [u] = await q.query<{ last_allowance_at: Date }>(`SELECT last_allowance_at FROM users WHERE id = $1`, [userId]);
  if (!u) return 0;
  const elapsed = now().getTime() - new Date(u.last_allowance_at).getTime();
  const weeks = Math.floor(elapsed / ECONOMY.allowancePeriodMs);
  if (weeks <= 0) return 0;
  const next = new Date(new Date(u.last_allowance_at).getTime() + weeks * ECONOMY.allowancePeriodMs);
  // Guard against two concurrent requests both paying out.
  const claimed = await q.query(
    `UPDATE users SET last_allowance_at = $2 WHERE id = $1 AND last_allowance_at = $3 RETURNING id`,
    [userId, next, u.last_allowance_at]
  );
  if (!claimed.length) return 0;
  await credit(q, userId, weeks * ECONOMY.weeklyAllowance, `Weekly allowance ×${weeks}`);
  return weeks;
}

/** How much a user may put into one trade right now. */
export function maxStake(balance: number) {
  return Math.max(0, round2(Math.min(balance * ECONOMY.maxStakeFraction, balance - ECONOMY.balanceFloor)));
}

type Holding = { yes_shares: number; no_shares: number } | null | undefined;

/** How much more this position pays if the market resolves this way rather than the other. */
export function edgeInOutcome(pos: Holding, outcome: boolean) {
  if (!pos) return 0;
  const d = pos.yes_shares - pos.no_shares;
  return outcome ? d : -d;
}

/** Nobody calls a market the way that pays them. Before the deadline that's strict; after it, someone with a
 * stake may call it only if every other eligible friend has the same stake, so a market can't get stuck. */
export function mayCall(outcome: boolean, mine: Holding, others: Holding[], pastDeadline: boolean) {
  const free = (p: Holding) => edgeInOutcome(p, outcome) <= 0.005;
  return free(mine) || (pastDeadline && !others.some(free));
}
