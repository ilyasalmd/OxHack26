import { test } from "node:test";
import assert from "node:assert/strict";
import { applyShares, askPrice, bidPrice, bookAt, buyQuote, cashOutQuote, cost, hazardDecay, holdingValue, priceYes, proceedsForShares, recenter, sharesForAmount } from "../lib/lmsr";
import { maxStake, mayCall } from "../lib/economy";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("book opens at the requested probability", () => {
  for (const p of [0.03, 0.25, 0.5, 0.8, 0.97]) close(priceYes(bookAt(80, p)), p);
});

test("buying spends exactly the amount and moves the price the right way", () => {
  const b = bookAt(80, 0.4);
  for (const side of ["yes", "no"] as const) {
    const x = sharesForAmount(b, side, 25);
    const after = applyShares(b, side, x);
    close(cost(after) - cost(b), 25);
    if (side === "yes") assert.ok(priceYes(after) > 0.4);
    else assert.ok(priceYes(after) < 0.4);
  }
});

test("buy then sell round-trips with no free money", () => {
  const b = bookAt(150, 0.62);
  const x = sharesForAmount(b, "no", 40);
  const after = applyShares(b, "no", x);
  close(proceedsForShares(after, "no", x), 40);
});

test("worst-case loss for the market maker is b ln 2 at 50%", () => {
  const b = bookAt(100, 0.5);
  const x = sharesForAmount(b, "yes", 1e6);
  assert.ok(x - 1e6 <= 100 * Math.log(2) + 1e-6);
});

test("recenter moves the quote without touching other side", () => {
  const b = recenter(bookAt(80, 0.3), 0.7);
  close(priceYes(b), 0.7);
});

test("hazard decay: no news means lower price, and halfway keeps the right share", () => {
  const p = 0.5;
  const half = hazardDecay(p, 100, 50);
  assert.ok(half < p);
  close(half, 1 - Math.sqrt(0.5));
  close(hazardDecay(p, 100, 0), 0);
});

test("stake cap keeps a floor so nobody is wiped out", () => {
  assert.equal(maxStake(500), 125);
  assert.equal(maxStake(60), 10);
  assert.equal(maxStake(40), 0);
});

test("nobody can resolve a market the way that pays them", () => {
  const long = { yes_shares: 40, no_shares: 0 };
  const mostlyShort = { yes_shares: 10, no_shares: 30 };
  // Before the deadline: strictly no calling your own way.
  assert.equal(mayCall(true, long, [null], false), false);
  assert.equal(mayCall(false, long, [null], false), true);
  // Net position counts: mostly short can call YES.
  assert.equal(mayCall(true, mostlyShort, [], false), true);
  // After the deadline a friend with no stake exists, so the long holder still can't call YES...
  assert.equal(mayCall(true, long, [null, long], true), false);
  // ...but if every friend is long too, someone has to be able to settle it.
  assert.equal(mayCall(true, long, [long, long], true), true);
  assert.equal(mayCall(true, long, [long, long], false), false);
});

test("bookmaker: buying and cashing straight out loses the margin, never gains", () => {
  const b = bookAt(250, 0.5);
  const { shares } = buyQuote(b, "yes", 100, 0.03);
  const out = cashOutQuote(applyShares(b, "yes", shares), "yes", shares, 0.03);
  assert.ok(out < 100 && out > 90, `cash-out ${out}`);
});

test("bookmaker: a position is valued at its cash-out, so buying never shows a profit", () => {
  const b = bookAt(250, 0.5);
  const { shares } = buyQuote(b, "yes", 100, 0.03);
  const v = holdingValue(applyShares(b, "yes", shares), { yes_shares: shares, no_shares: 0 }, 0.03);
  assert.ok(v < 100, `value ${v}`);
});

test("bookmaker: the ask is above the AI's probability and the bid below it", () => {
  const b = bookAt(250, 0.62);
  assert.ok(askPrice(b, "yes", 0.03) > 0.62 && bidPrice(b, "yes", 0.03) < 0.62);
  assert.ok(askPrice(b, "no", 0.03) > 0.38 && bidPrice(b, "no", 0.03) < 0.38);
});
