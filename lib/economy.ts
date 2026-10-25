import type { Q } from "./db";
import { ECONOMY, MARKET } from "./config";
import { now } from "./clock";
import { holdingValue } from "./lmsr";

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
  // Coins for a stake go into that stake's vault on chain and come back out of it; coins outside
  // any stake (allowance, friend bets) are minted or burned.
  const kind = marketId != null ? (delta > 0 ? "payout" : "stake") : delta > 0 ? "mint" : "burn";
  await q.query(`INSERT INTO chain_ops (kind, user_id, market_id, amount, memo, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
    kind,
    userId,
    marketId,
    Math.abs(delta),
    reason,
    ts,
  ]);
  await recordNetWorth(q, userId);
}

/** The stake is finished: after its payouts, the chain burns what is left in its vault (the house's share) and closes it. */
export async function closeVault(q: Q, marketId: number, why: string) {
  await q.query(`INSERT INTO chain_ops (kind, market_id, memo, created_at) VALUES ('close', $1, $2, $3)`, [marketId, why, now()]);
}

export async function netWorth(q: Q, userId: number) {
  const [[u], rows, bets] = await Promise.all([
    q.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [userId]),
    q.query<{ yes_shares: number; no_shares: number; b: number; q_yes: number; q_no: number; t_yes: number | null; t_no: number | null }>(
      `SELECT p.yes_shares, p.no_shares, m.b, m.q_yes, m.q_no, m.t_yes, m.t_no
       FROM positions p JOIN markets m ON m.id = p.market_id
       WHERE p.user_id = $1 AND m.status = 'open'`,
      [userId]
    ),
    // Coins in friend bets count at what was put in until the bet finishes.
    import("./friend-bet").then((f) => f.lockedInFriendBetsFor(q, userId)),
  ]);
  // Open positions count at what cashing out would pay now, never at the last price: your own
  // buy can't make you look richer.
  const held = rows.reduce((s, r) => s + holdingValue({ b: r.b, qYes: r.q_yes, qNo: r.q_no }, r, MARKET.vig, { b: r.b, qYes: r.t_yes ?? r.q_yes, qNo: r.t_no ?? r.q_no }), 0);
  return { balance: u.balance, positions: round2(held + bets), total: round2(u.balance + held + bets) };
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
/** Whether at least one weekly allowance is waiting to be paid. */
export const allowanceDue = (last: Date) => now().getTime() - new Date(last).getTime() >= ECONOMY.allowancePeriodMs;

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
