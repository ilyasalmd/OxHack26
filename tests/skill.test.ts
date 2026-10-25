import { test } from "node:test";
import assert from "node:assert/strict";
import { edge, stakeScores, summarise, timeWeight, tierOf, type Call } from "../lib/skill";

// A 5-day stake about Jake (user 9), settled YES, opening on 1 Oct.
const open = new Date("2026-10-01T00:00:00Z");
const close = new Date("2026-10-06T00:00:00Z");
const at = (daysIn: number) => new Date(open.getTime() + daysIn * 86_400_000);
const call = (o: Partial<Call>): Call => ({
  user_id: 1, market_id: 1, group_id: 1, subject_id: 9, side: "yes", action: "buy", price_before: 0.4,
  created_at: at(1), market_created_at: open, resolves_at: close, outcome: true, ...o,
});
// Three other people traded too, so the stake counts.
const crowd = [call({ user_id: 2 }), call({ user_id: 3, side: "no" }), call({ user_id: 4 })];
const scoreOf = (calls: Call[], user = 1) => stakeScores([...crowd, ...calls]).find((s) => s.user_id === user)?.score;

test("buying YES at 40% scores +60 if it happens and −40 if not; NO is the mirror", () => {
  assert.equal(edge(call({})).toFixed(2), "0.60");
  assert.equal(edge(call({ outcome: false })).toFixed(2), "-0.40");
  assert.equal(edge(call({ side: "no", price_before: 0.55 })).toFixed(2), "-0.45");
  // Selling YES pushes the price down, like buying NO.
  assert.equal(edge(call({ side: "yes", action: "sell", price_before: 0.7, outcome: false })).toFixed(2), "0.70");
});

test("calls count fully until half the time is left, then fade to nothing at the deadline", () => {
  assert.equal(timeWeight(call({ created_at: at(1) })), 1);
  assert.equal(timeWeight(call({ created_at: at(2.5) })), 1);
  assert.equal(timeWeight(call({ created_at: at(4) })).toFixed(2), "0.40");
  assert.equal(timeWeight(call({ created_at: at(5) })), 0);
  assert.equal(timeWeight(call({ created_at: at(6) })), 0);
});

test("a late sniper who buys once the answer is obvious earns almost nothing", () => {
  const s = scoreOf([call({ created_at: at(4.98), price_before: 0.6 })])!;
  assert.ok(s < 0.01, `late snipe scored ${s}`);
});

test("stakes about yourself don't count", () => {
  assert.equal(scoreOf([call({ user_id: 9 })], 9), undefined);
});

test("stakes with fewer than three different traders don't count, and bots don't make up the numbers", () => {
  const two = stakeScores([call({ user_id: 1 }), call({ user_id: 2 })]);
  assert.equal(two.length, 0);
  const withBot = stakeScores([call({ user_id: 1 }), call({ user_id: 2 }), call({ user_id: 5, bot: true })]);
  assert.equal(withBot.length, 0);
});

test("twenty trades on one stake count as one stake", () => {
  const spam = Array.from({ length: 20 }, () => call({}));
  const mine = stakeScores([...crowd, ...spam]).filter((s) => s.user_id === 1);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].score.toFixed(2), "0.60");
});

test("one perfect first call shows as +10, not +60; an early tag until five stakes", () => {
  const one = summarise([0.6]);
  assert.equal(Math.round(one.skill), 10);
  assert.equal(one.early, true);
  assert.equal(one.tier, "Sharp");
  const five = summarise([0.1, 0.2, -0.1, 0.3, 0.1]);
  assert.equal(five.early, false);
  assert.equal(summarise([]).skill, 0);
  assert.equal(summarise([]).tier, null);
});

test("a 1-coin trade on the favourite that barely moves anything stays near zero on average", () => {
  // Buying the 90% favourite: +10 when it happens, −90 when it doesn't; nine of ten happen.
  const xs = [...Array(9).fill(0.1), -0.9];
  assert.ok(Math.abs(summarise(xs).skill) < 0.5);
});

test("tier words", () => {
  assert.equal(tierOf(20), "Reads the room");
  assert.equal(tierOf(10), "Sharp");
  assert.equal(tierOf(0), "Level");
  assert.equal(tierOf(-10), "Still learning");
});
