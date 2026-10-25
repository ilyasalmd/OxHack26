import { test } from "node:test";
import assert from "node:assert/strict";
import { addressScore, pickTurns, type TurnMember } from "../lib/bot-turns";

const family: TurnMember[] = [
  { id: 1, username: "ilyas", display_name: "Ilyas", bot: false },
  { id: 2, username: "mum", display_name: "Mum", bot: true },
  { id: 3, username: "dad", display_name: "Dad", bot: true },
  { id: 4, username: "yasmin", display_name: "Yasmin", bot: true },
];
const T = Date.parse("2026-10-25T09:11:00Z");
const msg = (userId: number, text: string, minsAgo = 0) => ({ userId, text, at: T - minsAgo * 60e3 });
const never = () => 0.99; // no one chips in
const always = () => 0;

test("answering Dad's message gets Dad, not Mum (the reported bug)", () => {
  const recent = [msg(2, "Sunday lunch at 2, don't be late", 30), msg(1, "hello", 1), msg(3, "hello son, you alright?", 1), msg(1, "im good how r u")];
  for (let k = 0; k < 20; k++) assert.deepEqual(pickTurns({ members: family, recent, senderId: 1, now: T }).order.slice(0, 1), [3]);
  assert.deepEqual(pickTurns({ members: family, recent, senderId: 1, now: T, rand: never }), { order: [3], why: "reply" });
});

test("naming someone beats whoever spoke last", () => {
  const recent = [msg(3, "shed roof is on", 2), msg(1, "nice"), msg(1, "mum what's for dinner")];
  assert.deepEqual(pickTurns({ members: family, recent, senderId: 1, now: T, rand: never }), { order: [2], why: "named" });
  const r2 = [msg(2, "are you eating properly", 2), msg(1, "how's the shed going dad?")];
  assert.deepEqual(pickTurns({ members: family, recent: r2, senderId: 1, now: T, rand: never }).order, [3]);
  const r3 = [msg(2, "x", 2), msg(1, "@yasmin good luck in your mocks")];
  assert.deepEqual(pickTurns({ members: family, recent: r3, senderId: 1, now: T, rand: never }).order, [4]);
});

test("'mom' and 'hi dad' find the right parent", () => {
  assert.equal(addressScore("hi dad", family[2]), 2);
  assert.equal(addressScore("love you mom x", family[1]), 2);
  assert.equal(addressScore("tell dad the train's late", family[2]), 1);
  assert.equal(addressScore("tell dad the train's late", family[1]), 0);
  assert.equal(addressScore("damascus", family[2]), 0);
});

test("a direct call outranks a passing mention", () => {
  const recent = [msg(4, "lol", 5), msg(1, "mum can you tell dad the train's late")];
  assert.deepEqual(pickTurns({ members: family, recent, senderId: 1, now: T, rand: never }).order, [2]);
});

test("greeting two people gets both, and nobody else", () => {
  const recent = [msg(1, "hi mum, hi dad")];
  const t = pickTurns({ members: family, recent, senderId: 1, now: T, rand: always });
  assert.deepEqual([...t.order].sort(), [2, 3]);
});

test("nobody addressed: exactly one picks it up, others only sometimes", () => {
  const recent = [msg(3, "old news", 600), msg(1, "anyone up?")];
  assert.equal(pickTurns({ members: family, recent, senderId: 1, now: T, rand: never }).order.length, 1);
  let two = 0;
  for (let k = 0; k < 2000; k++) two += pickTurns({ members: family, recent, senderId: 1, now: T }).order.length === 2 ? 1 : 0;
  assert.ok(two > 250 && two < 550, `chimed in ${two}/2000`);
});

test("a cold conversation isn't a reply to the last speaker", () => {
  const recent = [msg(3, "night all", 300), msg(1, "morning")];
  assert.equal(pickTurns({ members: family, recent, senderId: 1, now: T, rand: never }).why, "open");
});

test("talking to a real person leaves the sample people mostly quiet", () => {
  const crew: TurnMember[] = [...family, { id: 9, username: "aariz", display_name: "Aariz", bot: false }];
  const recent = [msg(9, "you coming tonight?", 1), msg(1, "yeah")];
  assert.deepEqual(pickTurns({ members: crew, recent, senderId: 1, now: T, rand: never }), { order: [], why: "someone-else" });
  const named = [msg(2, "x", 1), msg(1, "aariz you coming?")];
  assert.deepEqual(pickTurns({ members: crew, recent: named, senderId: 1, now: T, rand: never }).order, []);
});

test("several messages in a row are read together", () => {
  const recent = [msg(2, "dinner's at 7", 3), msg(1, "ok"), msg(1, "dad can you pick me up from the station")];
  assert.deepEqual(pickTurns({ members: family, recent, senderId: 1, now: T, rand: never }).order, [3]);
});

test("Friday Dinner Crew: replying to Jake gets Jake", () => {
  const crew: TurnMember[] = [
    { id: 1, username: "ilyas", display_name: "Ilyas", bot: false },
    ...["priya", "jake", "sam", "maya", "omar"].map((u, i) => ({ id: 10 + i, username: u, display_name: u[0].toUpperCase() + u.slice(1), bot: true })),
  ];
  const recent = [msg(10, "table's booked for 8", 20), msg(11, "might be a bit late lads", 2), msg(1, "how late is a bit")];
  assert.deepEqual(pickTurns({ members: crew, recent, senderId: 1, now: T, rand: never }), { order: [11], why: "reply" });
  const r2 = [msg(11, "might be a bit late lads", 2), msg(1, "priya did you book for 6 or 7")];
  assert.deepEqual(pickTurns({ members: crew, recent: r2, senderId: 1, now: T, rand: never }).order, [10]);
});
