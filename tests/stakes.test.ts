import { test } from "node:test";
import assert from "node:assert/strict";
import { PAST_AFTER_NEW_STAKES, byAttention, closingSoon, isPast, type Placed } from "../lib/stakes";

const live = (created: number, ends: number, attention: Placed["attention"] = "live"): Placed => ({ kind: "bet", attention, created, ends, finished: null });
const done = (created: number, finished: number): Placed => ({ kind: "bet", attention: "done", created, ends: finished, finished });

test("a finished stake stays in the list until two newer stakes are posted after it", () => {
  assert.equal(PAST_AFTER_NEW_STAKES, 2);
  const old = done(0, 10);
  // Posted before it finished: doesn't count.
  assert.equal(isPast(old, [old, live(5, 100)]), false);
  const one = live(11, 100);
  assert.equal(isPast(old, [old, one]), false);
  assert.equal(isPast(old, [old, one, live(12, 100)]), true);
  // The threshold can change.
  assert.equal(isPast(old, [old, one], 1), true);
  // Live stakes are never past.
  assert.equal(isPast(one, [one, live(20, 100), live(21, 100)]), false);
});

test("needs-you first, then results owed, then by deadline, finished newest first", () => {
  const rows = [done(0, 5), live(0, 50), live(0, 30, "soon"), live(0, 90, "result"), live(0, 99, "you"), done(0, 8), live(0, 40)];
  const order = [...rows].sort(byAttention).map((r) => `${r.attention}:${r.finished ?? r.ends}`);
  assert.deepEqual(order, ["you:99", "result:90", "soon:30", "live:40", "live:50", "done:8", "done:5"]);
});

test("closing soon: two days for a bet, a week for a stock", () => {
  const day = 864e5;
  assert.equal(closingSoon("bet", 1.5 * day, 0), true);
  assert.equal(closingSoon("bet", 3 * day, 0), false);
  assert.equal(closingSoon("stock", 6 * day, 0), true);
  assert.equal(closingSoon("stock", -1, 0), false);
});
