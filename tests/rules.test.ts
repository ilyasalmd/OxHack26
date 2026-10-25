import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Runs the real market engine against a throwaway embedded Postgres, with no AI and no chain.
// Adapted from Murat's tests on fair-settling-group-wallets, for the one-wallet-per-person model.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-rules-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";
process.env.SOLANA_RPC_URL = "";

type Engine = typeof import("../lib/markets");
type User = import("../lib/auth").User;
let mk: Engine;
let clock: typeof import("../lib/clock");
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>;
const people: Record<string, User> = {};
let chat = 0;

const DAY = 24 * 3600_000;
const PROOF = "saw it happen, photo in the chat";
const balance = async (u: User) => (await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [u.id]))[0].balance;
const status = async (id: number) => (await mk.getMarket(db, id)).status;
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));

before(async () => {
  db = await (await import("../lib/db")).getDb();
  mk = await import("../lib/markets");
  clock = await import("../lib/clock");
  for (const name of ["alice", "bob", "cara"]) {
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
       VALUES ($1,$1,'x','#fff',500,now(),now(),'k','k','s') RETURNING id`,
      [name]
    );
    people[name] = { id: u.id, username: name, display_name: name, color: "#fff", balance: 500, public_key: "k", wallet_pubkey: null } as User;
  }
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('g', 'rules-test', $1, now()) RETURNING id`, [people.alice.id]);
  for (const m of ["alice", "bob", "cara"]) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,now())`, [g.id, people[m].id]);
  chat = g.id;
});

const open = (title: string, subject: string | null = null, days = 2) =>
  mk.createMarket(people.alice, chat, { title, resolvesAt: new Date(Date.now() + days * DAY).toISOString(), subjectUsername: subject });

test("an early number result needs the proposer's own evidence, not just the number", async () => {
  const id = await mk.createMarket(people.alice, chat, { title: "Bob's exam mark", resolvesAt: new Date(Date.now() + 2 * DAY).toISOString(), kind: "stock", answer: "number", line: 65 });
  await rejects(mk.proposeResult(people.cara, id, { value: 70 }), /evidence/);
  await mk.proposeResult(people.cara, id, { value: 70 }, PROOF);
  assert.equal((await mk.getMarket(db, id)).proposed_outcome, true);
});

test("nobody settles alone: the proposer can't confirm, someone else can", async () => {
  const id = await open("It snows in Oxford this week");
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 40 });
  await mk.trade(people.cara, id, { side: "no", action: "buy", amount: 20 });
  await mk.proposeResult(people.alice, id, true, PROOF);
  assert.equal(await status(id), "open");
  await rejects(mk.confirmResult(people.alice, id), /another member/);
  await mk.confirmResult(people.cara, id);
  assert.equal(await status(id), "resolved");
});

test("before the deadline anyone can say it happened, but only with evidence, and never NO", async () => {
  const id = await open("Bob finishes the essay early");
  await rejects(mk.proposeResult(people.cara, id, true), /evidence/);
  await rejects(mk.proposeResult(people.cara, id, false, PROOF), /only be called/);
  await mk.proposeResult(people.cara, id, true, PROOF);
  const m = await mk.getMarket(db, id);
  assert.equal(m.status, "open");
  assert.equal(m.proposed_early, true);
});

test("an early claim never settles by itself, and a majority rejecting it opens trading again", async () => {
  const id = await open("Alice books the flights this week");
  await mk.proposeResult(people.bob, id, true, PROOF);
  await db.query(`UPDATE markets SET proposed_at = proposed_at - interval '3 days' WHERE id = $1`, [id]);
  await mk.finaliseProposals(db);
  assert.equal(await status(id), "open", "no confirmation, no settlement");
  await rejects(mk.trade(people.cara, id, { side: "no", action: "buy", amount: 10 }), /proposed/);
  await mk.disputeResult(people.cara, id);
  assert.notEqual((await mk.getMarket(db, id)).proposed_outcome, null, "one rejection of two isn't a majority");
  await mk.disputeResult(people.alice, id);
  const m = await mk.getMarket(db, id);
  assert.equal(m.status, "open");
  assert.equal(m.proposed_outcome, null);
  await mk.trade(people.cara, id, { side: "no", action: "buy", amount: 10 });
});

test("someone the result would pay can't confirm it", async () => {
  const id = await open("Cara runs 10k before Sunday");
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 30 });
  await mk.proposeResult(people.alice, id, true, PROOF);
  await rejects(mk.confirmResult(people.bob, id), /gain/);
  await rejects(mk.confirmResult(people.alice, id), /another member/);
  assert.equal(await status(id), "open");
});

const ageDeadline = (id: number, hours: number) =>
  db.query(`UPDATE markets SET resolves_at = now() - make_interval(hours => $2) WHERE id = $1`, [id, hours]);

test("the day the deadline arrives, the whole chat is told once, and the notice counts as unread for everyone", async () => {
  const id = await open("Bob makes it to the 9am");
  await mk.runDecay(db);
  const notices = async () => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM messages WHERE market_id = $1 AND kind = 'due'`, [id]))[0].n;
  assert.equal(await notices(), 0, "nothing before the deadline");
  await ageDeadline(id, 1);
  await mk.runDecay(db);
  await mk.runDecay(db);
  assert.equal(await notices(), 1, "one notice, however often the sweep runs");
  const [msg] = await db.query<{ body: string; user_id: number | null }>(`SELECT body, user_id FROM messages WHERE market_id = $1 AND kind = 'due'`, [id]);
  assert.match(msg.body, /reached its deadline/);
  assert.match(msg.body, /refunded/);
  assert.equal(msg.user_id, null, "from nobody, so it's unread for every member");
});

test("nobody confirms what happened: the stake is called off and refunded, however the market leaned", async () => {
  const id = await open("Bob makes it to the 9am lecture");
  const bob0 = await balance(people.bob);
  const cara0 = await balance(people.cara);
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 80 });
  await mk.trade(people.cara, id, { side: "no", action: "buy", amount: 10 });
  assert.ok(mk.price(await mk.getMarket(db, id)) > 0.7, "the market leans strongly YES");
  await ageDeadline(id, 71);
  await mk.settleUnclaimed(db);
  assert.equal(await status(id), "open", "still inside the 3 days");
  await ageDeadline(id, 73);
  await mk.settleUnclaimed(db);
  const m = await mk.getMarket(db, id);
  assert.equal(m.status, "void", "a price is a prediction, not a result");
  assert.equal(m.void_reason, "unclaimed");
  assert.equal(m.outcome, null);
  assert.ok(Math.abs((await balance(people.bob)) - bob0) < 0.01, "the YES holder is not paid, just refunded");
  assert.ok(Math.abs((await balance(people.cara)) - cara0) < 0.01, "the NO holder gets their stake back");
  const [mem] = await db.query(`SELECT 1 FROM memories WHERE market_id = $1`, [id]);
  assert.equal(mem, undefined, "an unverified outcome never enters the history used for pricing");
  const [tick] = await db.query(`SELECT 1 FROM price_ticks WHERE market_id = $1 AND source = 'resolve'`, [id]);
  assert.equal(tick, undefined, "and never becomes a settled price");
});

test("unclaimed with nobody trading, it's called off too, and stock fees come back with the stake", async () => {
  const quiet = await open("Nobody trades this");
  await ageDeadline(quiet, 73);
  await mk.settleUnclaimed(db);
  assert.equal(await status(quiet), "void");
  const id = await mk.createMarket(people.alice, chat, { title: "Cara finishes the dissertation draft", resolvesAt: new Date(Date.now() + 2 * DAY).toISOString(), kind: "stock" });
  const bob0 = await balance(people.bob);
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 10 });
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 10 });
  await mk.trade(people.cara, id, { side: "no", action: "buy", amount: 5 });
  assert.ok((await mk.getMarket(db, id)).fees_held > 0, "bob's second trade paid a fee");
  await ageDeadline(id, 73);
  await mk.settleUnclaimed(db);
  assert.equal((await mk.getMarket(db, id)).void_reason, "unclaimed");
  assert.ok(Math.abs((await balance(people.bob)) - bob0) < 0.01, "stake and fee both come back");
});

test("an early claim nobody confirmed by the deadline settles a day after it, like any proposal", async () => {
  const id = await open("Alice hands in the form");
  await mk.proposeResult(people.bob, id, true, PROOF);
  await db.query(`UPDATE markets SET proposed_at = now() - interval '2 days' WHERE id = $1`, [id]);
  await ageDeadline(id, 23);
  await mk.finaliseProposals(db);
  assert.equal(await status(id), "open");
  await ageDeadline(id, 25);
  await mk.finaliseProposals(db);
  assert.equal(await status(id), "resolved");
});

test("the subject can't confirm a result about themselves", async () => {
  const id = await open("Bob gets to the gym three times", "bob");
  await mk.proposeResult(people.alice, id, true, PROOF);
  await rejects(mk.confirmResult(people.bob, id), /can't confirm/);
});

test("a market only one person traded pays nothing: the stake comes back", async () => {
  const id = await open("Alice goes for a run before work");
  const start = await balance(people.bob);
  await mk.trade(people.bob, id, { side: "no", action: "buy", amount: 60 });
  assert.ok((await balance(people.bob)) < start);
  await mk.proposeResult(people.alice, id, true, PROOF);
  await mk.confirmResult(people.cara, id);
  await mk.confirmResult(people.bob, id);
  assert.equal(await status(id), "resolved");
  assert.ok(Math.abs((await balance(people.bob)) - start) < 0.01, "the lone trader gets their stake back");
});

test("with two traders the winner is paid and the loser isn't refunded", async () => {
  const id = await open("Cara is late to the lecture");
  const bob0 = await balance(people.bob);
  const cara0 = await balance(people.cara);
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 30 });
  await mk.trade(people.cara, id, { side: "no", action: "buy", amount: 30 });
  await mk.proposeResult(people.alice, id, true, PROOF);
  await mk.confirmResult(people.cara, id).catch(() => mk.confirmResult(people.bob, id));
  assert.ok((await balance(people.bob)) > bob0);
  assert.ok((await balance(people.cara)) < cara0);
});

test("the demo clock only moves the admin's own requests", async () => {
  const real = Date.now();
  assert.ok(Math.abs(clock.now().getTime() - real) < 5000);
  const ahead = clock.withClock(7 * DAY, people.alice.id, () => clock.now().getTime());
  assert.ok(Math.abs(ahead - real - 7 * DAY) < 5000);
  assert.ok(Math.abs(clock.now().getTime() - real) < 5000, "outside the admin's request, time is real");
});

test("joining a chat gives no coins", async () => {
  const [u] = await db.query<{ id: number }>(
    `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
     VALUES ('dave','dave','x','#fff',500,now(),now(),'k','k','s') RETURNING id`
  );
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('h', 'join-test', $1, now()) RETURNING id`, [people.alice.id]);
  const ledger = async () => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ledger WHERE user_id = $1`, [u.id]))[0].n;
  const before = await ledger();
  await (await import("../lib/groups")).joinByInvite(db, u.id, "join-test");
  await (await import("../lib/groups")).joinByInvite(db, u.id, "join-test");
  const [m] = await db.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [g.id, u.id]);
  assert.ok(m, "dave is in the chat");
  assert.equal((await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [u.id]))[0].balance, 500);
  assert.equal(await ledger(), before);
});

test("the +50 allowance comes once per full week, never twice", async () => {
  const { applyAllowance } = await import("../lib/economy");
  const [u] = await db.query<{ id: number }>(
    `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
     VALUES ('erin','erin','x','#fff',500,now(),now(),'k','k','s') RETURNING id`
  );
  const bal = async () => (await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [u.id]))[0].balance;
  const at = (days: number) => (fn: () => Promise<unknown>) => clock.withClock(days * DAY, u.id, fn);
  await applyAllowance(db, u.id);
  assert.equal(await bal(), 500, "nothing before a week has passed");
  await at(6.9)(() => applyAllowance(db, u.id));
  assert.equal(await bal(), 500);
  await at(7.1)(() => applyAllowance(db, u.id));
  await at(7.2)(() => applyAllowance(db, u.id));
  assert.equal(await bal(), 550, "one +50 after a week, however often you show up");
  await at(13)(() => applyAllowance(db, u.id));
  assert.equal(await bal(), 550);
  await at(14.1)(() => applyAllowance(db, u.id));
  assert.equal(await bal(), 600);
});

test("the chain gets a stake's terms when it opens and a hash of how it settled", async () => {
  const { sha256 } = await import("../lib/pricing-record");
  const id = await open("Cara gets the 8am train");
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 20 });
  await mk.proposeResult(people.alice, id, true, PROOF);
  await mk.confirmResult(people.cara, id);
  const memos = (await db.query<{ memo: string }>(`SELECT memo FROM chain_ops WHERE market_id = $1 AND kind = 'memo' ORDER BY id`, [id])).map((r) => JSON.parse(r.memo));
  const opened = memos.find((m) => m.ev === "open");
  const resolved = memos.find((m) => m.ev === "resolve");
  assert.equal(opened.t, mk.termsHash(await mk.getMarket(db, id)), "the terms hash matches the stake as it stands");
  const [rec] = await db.query<{ record: string; sha256: string }>(`SELECT record, sha256 FROM pricing_records WHERE $1 = ANY(market_ids) AND kind = 'settle'`, [id]);
  assert.equal(resolved.h, rec.sha256);
  assert.equal(sha256(rec.record), rec.sha256, "anyone holding the record can recompute the hash");
  const body = JSON.parse(rec.record);
  assert.equal(body.terms, opened.t);
  assert.equal(body.proposedBy, people.alice.id);
  assert.deepEqual(body.votes.confirmedBy, [people.cara.id]);
  assert.equal(resolved.votes, "1/1", "bob would gain from YES, so cara is the only voter");
  assert.ok(!JSON.stringify(memos).includes("Cara gets"), "no words from the stake go on the chain");
});

// Majority voting: everyone in a fresh chat, so the sizes are exact.
let made = 0;
async function chatOf(n: number) {
  const users: User[] = [];
  for (let i = 0; i < n; i++) {
    const name = `v${++made}`;
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
       VALUES ($1,$1,'x','#fff',500,now(),now(),'k','k','s') RETURNING id`,
      [name]
    );
    users.push({ id: u.id, username: name, display_name: name, color: "#fff", balance: 500, public_key: "k", wallet_pubkey: null } as User);
  }
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('vote', $1, $2, now()) RETURNING id`, [`vote-${made}`, users[0].id]);
  for (const u of users) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,now())`, [g.id, u.id]);
  const id = await mk.createMarket(users[0], g.id, { title: `Vote test ${made}`, resolvesAt: new Date(Date.now() + 2 * DAY).toISOString(), subjectUsername: null });
  return { users, id };
}

test("votes needed: one voter decides alone, then two, then more than half", async () => {
  const { votesNeeded } = await import("../lib/safety");
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(votesNeeded), [0, 1, 2, 2, 3, 3, 4, 4]);
});

test("a chat of two: the other person's confirmation settles it", async () => {
  const { users: [a, b], id } = await chatOf(2);
  await mk.proposeResult(a, id, true, PROOF);
  await mk.confirmResult(b, id);
  assert.equal(await status(id), "resolved");
});

test("a chat of three: both others must confirm, one alone isn't enough", async () => {
  const { users: [a, b, c], id } = await chatOf(3);
  await mk.proposeResult(a, id, true, PROOF);
  const first = await mk.confirmResult(b, id);
  assert.equal(first.decided, null);
  assert.equal(await status(id), "open");
  await mk.confirmResult(c, id);
  assert.equal(await status(id), "resolved");
});

test("a chat of five: three of the four voters settle it, a tie doesn't", async () => {
  const { users: [a, b, c, d, e], id } = await chatOf(5);
  await mk.proposeResult(a, id, true, PROOF);
  await mk.confirmResult(b, id);
  await mk.confirmResult(c, id);
  await mk.disputeResult(d, id);
  await mk.disputeResult(e, id);
  assert.equal(await status(id), "open", "two each is a tie");
  const v = await mk.voteState(db, await mk.getMarket(db, id));
  assert.equal(v.needed, 3);
  await mk.confirmResult(d, id);
  assert.equal(await status(id), "resolved", "changing a vote can decide it");
});

test("a chat of five: three rejections drop the claim and reopen trading", async () => {
  const { users: [a, b, c, d], id } = await chatOf(5);
  await mk.proposeResult(a, id, true, PROOF);
  for (const u of [b, c, d]) await mk.disputeResult(u, id);
  const m = await mk.getMarket(db, id);
  assert.equal(m.status, "open");
  assert.equal(m.proposed_outcome, null);
  await mk.trade(b, id, { side: "no", action: "buy", amount: 5 });
});

test("cheating: the proposer can't vote, and friends on the winning side don't count", async () => {
  const { users: [a, b, c, d, e], id } = await chatOf(5);
  // b, c and d all bet YES, then a (who didn't) proposes YES.
  for (const u of [b, c, d]) await mk.trade(u, id, { side: "yes", action: "buy", amount: 20 });
  await mk.trade(e, id, { side: "no", action: "buy", amount: 20 });
  await mk.proposeResult(a, id, true, PROOF);
  await rejects(mk.confirmResult(a, id), /another member/);
  for (const u of [b, c, d]) await rejects(mk.confirmResult(u, id), /gain/);
  const v = await mk.voteState(db, await mk.getMarket(db, id));
  assert.deepEqual(v.eligible, [e.id], "only the person it would cost gets a say");
  await mk.disputeResult(e, id);
  assert.equal((await mk.getMarket(db, id)).proposed_outcome, null, "and their rejection drops it");
});

test("the vote running out: an unopposed claim stands, a rejected one is dropped", async () => {
  const late = async () => {
    const c = await chatOf(5);
    await db.query(`UPDATE markets SET resolves_at = now() - interval '2 hours' WHERE id = $1`, [c.id]);
    await mk.proposeResult(c.users[0], c.id, true, PROOF);
    await db.query(`UPDATE markets SET proposed_at = now() - interval '25 hours' WHERE id = $1`, [c.id]);
    return c;
  };
  const quiet = await late();
  await db.query(`UPDATE markets SET resolves_at = now() - interval '26 hours' WHERE id = $1`, [quiet.id]);
  await mk.finaliseProposals(db);
  assert.equal(await status(quiet.id), "resolved");

  const opposed = await late();
  await db.query(`UPDATE markets SET resolves_at = now() - interval '3 hours' WHERE id = $1`, [opposed.id]);
  await mk.disputeResult(opposed.users[1], opposed.id);
  await db.query(`UPDATE markets SET proposed_at = now() - interval '25 hours', resolves_at = now() - interval '26 hours' WHERE id = $1`, [opposed.id]);
  await mk.finaliseProposals(db);
  const m = await mk.getMarket(db, opposed.id);
  assert.equal(m.status, "open");
  assert.equal(m.proposed_outcome, null);
});

// AI re-marks: the AI thinks with nothing locked, and its write never lands on top of a trade.
const stockFor = (title: string, subject: string) =>
  mk.createMarket(people.alice, chat, { title, resolvesAt: new Date(Date.now() + 40 * DAY).toISOString(), subjectUsername: subject, kind: "stock" });
const trace = () => ({ provider: "none" as const, model: "", prompt: "", raw: null, ms: 0 });
const nearly = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("a trade made while the AI is thinking stands: the stale re-mark is skipped, not written over it", async () => {
  const id = await stockFor("Bob gets a first in econometrics", "bob");
  const seen = mk.price(await mk.getMarket(db, id));
  const snap = await mk.snapshotForRemark(db, chat, null, null);
  assert.ok(snap.stocks.some((s) => s.id === id));
  // The AI is "thinking". Meanwhile cara buys NO and moves the price.
  const t = await mk.trade(people.cara, id, { side: "no", action: "buy", amount: 60 });
  const afterTrade = await mk.getMarket(db, id);
  assert.ok(t.after < seen - 0.02, "the trade moved the price");
  // The AI comes back with a view based on the price it saw.
  const out = await mk.applyRemarks(chat, snap, [{ id, probability: seen + 0.1, reason: "term dates look good" }], trace());
  assert.equal(out.applied.length, 0);
  assert.equal(out.skipped.length, 1);
  assert.match(out.skipped[0].skipped, /trading moved it/);
  const m = await mk.getMarket(db, id);
  nearly(m.q_yes, afterTrade.q_yes);
  nearly(m.q_no, afterTrade.q_no);
  nearly(mk.price(m), t.after);
  const [ai] = await db.query(`SELECT 1 FROM price_ticks WHERE market_id = $1 AND source = 'ai'`, [id]);
  assert.equal(ai, undefined, "no AI tick was written");
  const [rec] = await db.query<{ record: string }>(`SELECT record FROM pricing_records WHERE $1 = ANY(market_ids) AND kind = 'reprice' ORDER BY id DESC LIMIT 1`, [id]);
  assert.equal(JSON.parse(rec.record).maths.skipped.length, 1, "the pricing record says why it was skipped");
});

test("with no trade in between, the re-mark is applied to the current book and earlier trades keep their shares", async () => {
  const id = await stockFor("Cara runs the half marathon in under two hours", "cara");
  await mk.trade(people.bob, id, { side: "no", action: "buy", amount: 30 });
  const before = await mk.getMarket(db, id);
  const seen = mk.price(before);
  const snap = await mk.snapshotForRemark(db, chat, null, null);
  const out = await mk.applyRemarks(chat, snap, [{ id, probability: seen + 0.3, reason: "training is going well" }], trace());
  assert.equal(out.applied.length, 1);
  const m = await mk.getMarket(db, id);
  nearly(mk.price(m), seen + mk.AI_MOVE_CAP, 1e-6);
  nearly(m.q_no, before.q_no, 1e-9);
  const [pos] = await db.query<{ no_shares: number }>(`SELECT no_shares FROM positions WHERE market_id = $1 AND user_id = $2`, [id, people.bob.id]);
  assert.ok(pos.no_shares > 0, "bob's shares are untouched: only the quote moved");
  assert.ok(Math.abs(Math.abs(mk.price(await mk.getMarket(db, id)) - seen) - mk.AI_MOVE_CAP) < 1e-6, "capped at 15 points");
});

test("a stock that closed or got a result proposed while the AI was thinking is left alone", async () => {
  const id = await stockFor("Bob learns to drive before summer", "bob");
  const seen = mk.price(await mk.getMarket(db, id));
  const snap = await mk.snapshotForRemark(db, chat, null, null);
  await mk.proposeResult(people.cara, id, true, PROOF);
  const out = await mk.applyRemarks(chat, snap, [{ id, probability: seen - 0.1, reason: "no lessons booked" }], trace());
  assert.equal(out.applied.length, 0);
  assert.match(out.skipped[0].skipped, /closed/);
  nearly(mk.price(await mk.getMarket(db, id)), seen);
});

test("time decay owed since the snapshot is applied under the same lock as the re-mark", async () => {
  const id = await stockFor("Cara books the summer trip", "cara");
  const m0 = await mk.getMarket(db, id);
  assert.equal(m0.decay, "hazard", "a 'by date X' stock decays");
  const seen = mk.price(m0);
  // Pretend the last decay was ten days ago, so some is owed.
  await db.query(`UPDATE markets SET last_decay_at = now() - interval '10 days' WHERE id = $1`, [id]);
  const snap = await mk.snapshotForRemark(db, chat, null, null);
  const out = await mk.applyRemarks(chat, snap, [{ id, probability: seen + 0.05, reason: "flights are cheap this week" }], trace());
  assert.equal(out.applied.length, 1);
  const m = await mk.getMarket(db, id);
  nearly(mk.price(m), seen + 0.05, 1e-6);
  assert.ok(new Date(m.last_decay_at).getTime() > Date.now() - 60_000, "decay was brought up to date in the same write");
  const ticks = (await db.query<{ source: string }>(`SELECT source FROM price_ticks WHERE market_id = $1 ORDER BY ts, source`, [id])).map((r) => r.source);
  assert.equal(ticks.filter((x) => x === "decay").length, 1, "one decay tick for the time owed");
  assert.equal(ticks.filter((x) => x === "ai").length, 1, "and one AI tick, written together");
});

test("the decay sweep decays from the price after the latest trade", async () => {
  const id = await stockFor("Bob finishes the marathon training plan", "bob");
  await db.query(`UPDATE markets SET last_decay_at = now() - interval '5 days' WHERE id = $1`, [id]);
  const t = await mk.trade(people.cara, id, { side: "yes", action: "buy", amount: 40 });
  await mk.runDecay(db);
  const m = await mk.getMarket(db, id);
  assert.ok(mk.price(m) < t.after, "decay moved it down");
  assert.ok(mk.price(m) > t.after - 0.1, "from the post-trade price, not from the old one");
  const [pos] = await db.query<{ yes_shares: number }>(`SELECT yes_shares FROM positions WHERE market_id = $1 AND user_id = $2`, [id, people.cara.id]);
  assert.ok(pos.yes_shares > 0);
});
