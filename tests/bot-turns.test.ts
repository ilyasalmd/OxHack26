import { test } from "node:test";
import assert from "node:assert/strict";
import { addressScore, pickTurns as pick, type TurnMember } from "../lib/bot-turns";
import { cannedReply, intentOf, quickReaction, voiceOf } from "../lib/bot-lines";

// Who answers and why; which of them only react is checked separately.
const pickTurns = (a: Parameters<typeof pick>[0]) => {
  const { order, why } = pick(a);
  return { order, why };
};

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

test("nobody addressed: one picks it up, a second sometimes chips in", () => {
  const recent = [msg(3, "old news", 600), msg(1, "anyone up?")];
  assert.equal(pickTurns({ members: family, recent, senderId: 1, now: T, rand: never }).order.length, 1);
  let two = 0;
  for (let k = 0; k < 2000; k++) two += pickTurns({ members: family, recent, senderId: 1, now: T }).order.length === 2 ? 1 : 0;
  assert.ok(two > 400 && two < 800, `chimed in ${two}/2000`);
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

test("nobody addressed: usually someone answers, sometimes nobody, and not always the same person", () => {
  const recent = [msg(3, "old news", 600), msg(1, "anyone up?")];
  const firsts = new Map<number, number>();
  let quiet = 0;
  for (let k = 0; k < 2000; k++) {
    const t = pickTurns({ members: family, recent, senderId: 1, now: T });
    if (!t.order.length) quiet++;
    else firsts.set(t.order[0], (firsts.get(t.order[0]) ?? 0) + 1);
  }
  assert.ok(quiet > 150 && quiet < 450, `quiet ${quiet}/2000`);
  assert.equal(firsts.size, 3);
  // Dad spoke last, so the others pick it up more often.
  assert.ok(firsts.get(3)! < firsts.get(2)!, JSON.stringify([...firsts]));
});

test("a bare 'lol' often gets no answer; a question to someone always does", () => {
  const lol = [msg(3, "shed's done", 1), msg(1, "lol")];
  let quiet = 0;
  for (let k = 0; k < 1000; k++) quiet += pickTurns({ members: family, recent: lol, senderId: 1, now: T }).order.length ? 0 : 1;
  assert.ok(quiet > 400 && quiet < 700, `quiet ${quiet}/1000`);
  const q = [msg(3, "shed's done", 1), msg(1, "how long did it take?")];
  for (let k = 0; k < 200; k++) assert.equal(pickTurns({ members: family, recent: q, senderId: 1, now: T }).order[0], 3);
});

test("a one-to-one chat always gets an answer", () => {
  const pair: TurnMember[] = [family[0], { id: 7, username: "nadia", display_name: "Nadia", bot: true }];
  for (let k = 0; k < 200; k++) assert.deepEqual(pickTurns({ members: pair, recent: [msg(1, "ok")], senderId: 1, now: T }).order, [7]);
});

test("whoever chips in mostly just reacts; the one addressed always answers properly", () => {
  const recent = [msg(3, "hello son, you alright?", 1), msg(1, "im good how r u")];
  let quick = 0, chimes = 0;
  for (let k = 0; k < 2000; k++) {
    const t = pick({ members: family, recent, senderId: 1, now: T });
    assert.ok(!t.quick.includes(3));
    if (t.order.length > 1) chimes++;
    quick += t.quick.length;
  }
  assert.ok(chimes > 350 && chimes < 650, `chimes ${chimes}`);
  assert.ok(quick > chimes * 0.45 && quick < chimes * 0.75, `quick ${quick}/${chimes}`);
});

test("without the AI, replies still fit the message and the person", () => {
  assert.equal(intentOf("im good how r u"), "how-are-you");
  assert.equal(intentOf("hiya"), "greeting");
  assert.equal(intentOf("anyone fancy the pub later"), "plan");
  assert.equal(intentOf("what time is dinner?"), "when");
  assert.equal(intentOf("lmao"), "laugh");
  assert.equal(intentOf("is the shed finished?"), "yes-no");
  assert.equal(intentOf("I got the offer!"), "good-news");
  assert.equal(intentOf("so tired today"), "bad-news");
  assert.equal(voiceOf("mum"), "parent");
  assert.equal(voiceOf("jake"), "friend");
  const r = () => 0;
  assert.match(cannedReply("dad", "im good how r u", { rand: r }), /\?|fine|good/);
  assert.match(cannedReply("mum", "love you mum", { rand: r }), /love you/);
  assert.notEqual(cannedReply("jake", "hey", { rand: r, avoid: ["yo"] }), "yo");
  assert.ok(["100%", "lol", "facts", "true", "fr", "haha", "same"].includes(quickReaction("jake")));
});
