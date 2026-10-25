// A chat's own stakes list (app/g/[id]/stakes): what needs you first, then what ends soonest,
// then what just finished. Pure, so the page and the tests share it.

/** A finished stake leaves the main list once this many newer stakes have been posted after it. */
export const PAST_AFTER_NEW_STAKES = 2;
/** "Closing soon": a bet inside two days of its deadline, a stock inside a week of maturing. */
export const SOON_MS = { bet: 2 * 864e5, stock: 7 * 864e5 } as const;

export type StakeKind = "stock" | "bet" | "friend";
/** Where a stake sits in the list, in this order. */
export type Attention = "you" | "result" | "soon" | "live" | "done";
export const SECTIONS: Record<Attention, string> = {
  you: "Needs you",
  result: "Waiting on a result",
  soon: "Closing soon",
  live: "Live",
  done: "Just finished",
};

export type Placed = {
  kind: StakeKind;
  attention: Attention;
  /** When it was posted, when it ends (deadline or maturity), and when it finished (null while live). */
  created: number;
  ends: number;
  finished: number | null;
};

/**
 * How many stakes were posted after each finished one. At `PAST_AFTER_NEW_STAKES` or more it is
 * past: it drops out of the main list and stays under Settled.
 */
export function isPast(x: Placed, all: Placed[], after = PAST_AFTER_NEW_STAKES) {
  if (x.finished == null) return false;
  let newer = 0;
  for (const y of all) if (y.created > x.finished && ++newer >= after) return true;
  return false;
}

const RANK: Record<Attention, number> = { you: 0, result: 1, soon: 2, live: 3, done: 4 };

/** Needs-you first, then results owed, then by deadline; finished ones newest first. */
export function byAttention(a: Placed, b: Placed) {
  if (a.attention !== b.attention) return RANK[a.attention] - RANK[b.attention];
  if (a.attention === "done") return (b.finished ?? 0) - (a.finished ?? 0);
  return a.ends - b.ends;
}

export function closingSoon(kind: "bet" | "stock", ends: number, now: number) {
  return ends > now && ends - now <= SOON_MS[kind];
}
