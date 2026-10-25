import { test } from "node:test";
import assert from "node:assert/strict";
import { openingMaths } from "../lib/pricing-record";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("with nothing to go on, the AI's answer is pulled halfway to 50/50 and flagged low data", () => {
  const m = openingMaths(0.9, null, 0);
  close(m.openProb, 0.7);
  assert.equal(m.lowData, true);
  close(openingMaths(0.1, null, 0).openProb, 0.3);
});

test("profile answers or shared chat count as evidence and earn more trust", () => {
  const withProfile = openingMaths(0.9, null, 0, { profile: true, chat: 0 });
  assert.equal(withProfile.lowData, false);
  assert.ok(withProfile.openProb > 0.7 && withProfile.openProb < 0.9);
  const withChat = openingMaths(0.9, null, 0, { profile: false, chat: 3 });
  close(withChat.openProb, withProfile.openProb);
});

test("with enough history the AI is trusted in full and the base rate gets its 30% vote", () => {
  const m = openingMaths(0.8, 0.5, 3);
  close(m.trust, 1);
  close(m.openProb, 0.7 * 0.8 + 0.3 * 0.5);
});
