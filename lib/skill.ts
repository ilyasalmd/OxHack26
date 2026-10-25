import type { Q } from "./db";
import { now } from "./clock";

// Forecasting skill: how much cheaper than they turned out to be worth you bought things.
//
// Every call is scored against the price you traded at (on a new stake, the AI's opening price):
// buying YES at p scores (1 − p) if it happened and −p if not; buying NO is the mirror. Over many
// calls that averages to your edge over the market, whatever size you bet, so bold players get no
// head start. Read-only: it scores calls on stakes that already settled and changes nothing.
//
// Fairness rules (all tested in tests/skill.test.ts):
// - A call counts fully while at least half the stake's time is left, then fades to nothing at the
//   deadline, so buying once the answer is obvious earns almost nothing.
// - One score per stake (the average of your calls on it), so spamming trades earns nothing.
// - Stakes about yourself, demo-bot trades, and stakes with fewer than SKILL.minTraders different
//   traders don't count. Voided stakes never settle, so they count for nobody.
// - Skill = 100 × (sum of stake scores) / (stakes + SKILL.shrink): everyone starts at 0 (level with
//   the market) and one lucky call only nudges you. Ranked from the first settled stake, tagged
//   early until SKILL.earlyUntil. Nothing about voting on results ever touches it.

export const SKILL = {
  shrink: 5,
  earlyUntil: 5,
  minTraders: 3,
  /** A player with no calls in a group for this long shows as quiet (they keep their rank). */
  quietAfterMs: 30 * 86_400_000,
  /** Settled stakes about a friend before your read on them shows in your wallet. */
  readsMin: 5,
};

export type Call = {
  user_id: number;
  market_id: number;
  group_id: number;
  subject_id: number | null;
  side: string;
  action: string;
  price_before: number;
  created_at: Date | string;
  market_created_at: Date | string;
  resolves_at: Date | string;
  outcome: boolean;
  bot?: boolean;
};

const ms = (d: Date | string) => new Date(d).getTime();

/** How much a call counts: 1 while at least half the stake's time is left, falling to 0 at the deadline. */
export function timeWeight(c: Pick<Call, "created_at" | "market_created_at" | "resolves_at">) {
  const span = ms(c.resolves_at) - ms(c.market_created_at);
  if (!(span > 0)) return 1;
  const left = (ms(c.resolves_at) - ms(c.created_at)) / span;
  return Math.max(0, Math.min(1, 2 * left));
}

/** A call's edge before weighting: buying YES (or selling NO) pushes the price up. */
export function edge(c: Pick<Call, "side" | "action" | "price_before" | "outcome">) {
  const y = c.outcome ? 1 : 0;
  const up = (c.side === "yes") === (c.action === "buy");
  return up ? y - c.price_before : c.price_before - y;
}

export type StakeScore = { user_id: number; market_id: number; group_id: number; subject_id: number | null; score: number; last: number };

/** One score per person per settled stake, after the exclusions above. */
export function stakeScores(calls: Call[]): StakeScore[] {
  const traders = new Map<number, Set<number>>();
  for (const c of calls) {
    if (c.bot) continue;
    const s = traders.get(c.market_id) ?? new Set<number>();
    s.add(c.user_id);
    traders.set(c.market_id, s);
  }
  const per = new Map<string, StakeScore & { n: number }>();
  for (const c of calls) {
    if (c.bot || c.subject_id === c.user_id) continue;
    if ((traders.get(c.market_id)?.size ?? 0) < SKILL.minTraders) continue;
    const key = `${c.user_id}:${c.market_id}`;
    const e = timeWeight(c) * edge(c);
    const cur = per.get(key);
    if (cur) {
      cur.score += e;
      cur.n++;
      cur.last = Math.max(cur.last, ms(c.created_at));
    } else per.set(key, { user_id: c.user_id, market_id: c.market_id, group_id: c.group_id, subject_id: c.subject_id, score: e, n: 1, last: ms(c.created_at) });
  }
  return [...per.values()].map(({ n, ...s }) => ({ ...s, score: s.score / n }));
}

export type Skill = {
  /** Points: 0 = level with the market, +10 = buys things 10 points cheaper than they turn out to be worth. */
  skill: number;
  stakes: number;
  early: boolean;
  tier: string | null;
  /** A rough likely range for the true skill (about 90%). */
  low: number;
  high: number;
};

/** Judged on the whole number people see, so "+15" never reads as the tier above. */
export function tierOf(raw: number) {
  const skill = Math.round(raw);
  if (skill > 15) return "Reads the room";
  if (skill > 5) return "Sharp";
  if (skill >= -5) return "Level";
  return "Still learning";
}

/** Shrunk average of stake scores, in points. */
export function summarise(scores: number[]): Skill {
  const n = scores.length;
  const sum = scores.reduce((a, b) => a + b, 0);
  const skill = (100 * sum) / (n + SKILL.shrink);
  const mean = n ? sum / n : 0;
  // Spread of a single stake's score; with few stakes assume the typical spread (about 0.45).
  const sd = n > 2 ? Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0.45;
  const half = (100 * 1.64 * sd * Math.sqrt(n)) / (n + SKILL.shrink);
  return { skill, stakes: n, early: n < SKILL.earlyUntil, tier: n ? tierOf(skill) : null, low: skill - half, high: skill + half };
}

const CALLS_SQL = `SELECT t.user_id, t.market_id, m.group_id, m.subject_id, t.side, t.action, t.price_before, t.created_at,
       m.created_at AS market_created_at, m.resolves_at, m.outcome, t.bot
     FROM trades t JOIN markets m ON m.id = t.market_id
     WHERE m.status = 'resolved' AND m.outcome IS NOT NULL`;

/** Settled calls in one group. */
export async function groupCalls(q: Q, groupId: number) {
  return q.query<Call>(`${CALLS_SQL} AND m.group_id = $1`, [groupId]);
}

/** Settled calls in every chat this user is in (so friends' scores only use chats you share). */
export async function sharedCalls(q: Q, userId: number) {
  return q.query<Call>(`${CALLS_SQL} AND m.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)`, [userId]);
}

/** Each person's skill from a set of stake scores, plus when they last made a call. */
export function skillByUser(scores: StakeScore[]) {
  const by = new Map<number, { xs: number[]; last: number }>();
  for (const s of scores) {
    const b = by.get(s.user_id) ?? { xs: [], last: 0 };
    b.xs.push(s.score);
    b.last = Math.max(b.last, s.last);
    by.set(s.user_id, b);
  }
  return new Map([...by].map(([id, b]) => [id, { ...summarise(b.xs), last: b.last }]));
}

export function isQuiet(lastCall: number | null | undefined) {
  return lastCall != null && lastCall > 0 && now().getTime() - lastCall > SKILL.quietAfterMs;
}

/** The wallet card: your overall skill, where you sit among friends, per group, and your reads on friends. */
export async function walletSkill(q: Q, userId: number) {
  const calls = await sharedCalls(q, userId);
  const scores = stakeScores(calls);
  const byUser = skillByUser(scores);
  const friends = await q.query<{ id: number; username: string; display_name: string; color: string }>(
    `SELECT DISTINCT u.id, u.username, u.display_name, u.color FROM users u JOIN group_members gm ON gm.user_id = u.id
     WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1) AND NOT gm.guest AND u.id <> $1`,
    [userId]
  );
  const groups = await q.query<{ id: number; name: string; emoji: string }>(
    `SELECT g.id, g.name, g.emoji FROM groups g JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.user_id = $1 AND NOT g.is_dm ORDER BY g.name`,
    [userId]
  );

  const mine = scores.filter((s) => s.user_id === userId);
  const me = byUser.get(userId) ?? null;
  const field = friends.map((f) => byUser.get(f.id)).filter((s) => s && s.stakes > 0).map((s) => s!.skill);
  const beat = me ? field.filter((s) => s < me.skill).length : 0;
  const avg = field.length ? field.reduce((a, b) => a + b, 0) / field.length : null;
  const vsMarket = mine.length ? mine.filter((s) => s.score > 0).length / mine.length : null;

  const perGroup = groups
    .map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, ...summarise(mine.filter((s) => s.group_id === g.id).map((s) => s.score)) }))
    .filter((g) => g.stakes > 0)
    .sort((a, b) => b.skill - a.skill);

  // Your read on each friend: your stake scores on stakes about them. Private to you.
  const reads = friends
    .map((f) => {
      const about = mine.filter((s) => s.subject_id === f.id).map((s) => s.score);
      return { id: f.id, username: f.username, display_name: f.display_name, color: f.color, stakes: about.length, score: summarise(about).skill };
    })
    .filter((r) => r.stakes >= SKILL.readsMin)
    .sort((a, b) => b.score - a.score);

  return {
    me: me && me.stakes > 0 ? { skill: me.skill, stakes: me.stakes, early: me.early, tier: me.tier, low: me.low, high: me.high } : null,
    vsMarket,
    earlyUntil: SKILL.earlyUntil,
    friendsScored: field.length,
    beat,
    friendsAvg: avg,
    field: field.sort((a, b) => a - b),
    groups: perGroup,
    reads: reads.slice(0, 5),
    readsMin: SKILL.readsMin,
    readsPending: friends.length - reads.length,
  };
}
