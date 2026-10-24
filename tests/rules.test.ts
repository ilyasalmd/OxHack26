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

test("an early claim never settles by itself, and a dispute opens trading again", async () => {
  const id = await open("Alice books the flights this week");
  await mk.proposeResult(people.bob, id, true, PROOF);
  await db.query(`UPDATE markets SET proposed_at = proposed_at - interval '3 days' WHERE id = $1`, [id]);
  await mk.finaliseProposals(db);
  assert.equal(await status(id), "open", "no confirmation, no settlement");
  await rejects(mk.trade(people.cara, id, { side: "no", action: "buy", amount: 10 }), /proposed/);
  await mk.disputeResult(people.cara, id);
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

test("every situation gets an answer: unclaimed for 3 days, it settles the way the market leans", async () => {
  const id = await open("Bob makes it to the 9am");
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 80 });
  await mk.trade(people.cara, id, { side: "no", action: "buy", amount: 10 });
  await ageDeadline(id, 71);
  await mk.settleUnclaimed(db);
  assert.equal(await status(id), "open", "still inside the 3 days");
  await ageDeadline(id, 73);
  await mk.settleUnclaimed(db);
  const m = await mk.getMarket(db, id);
  assert.equal(m.status, "resolved");
  assert.equal(m.outcome, true);
});

test("unclaimed and too close to call, or never traded, it's called off and refunded", async () => {
  const id = await open("Cara finds her keys");
  const start = await balance(people.bob);
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 1 });
  await ageDeadline(id, 73);
  await mk.settleUnclaimed(db);
  const m = await mk.getMarket(db, id);
  assert.equal(m.status, "void");
  assert.equal(m.void_reason, "unclaimed");
  assert.ok(Math.abs((await balance(people.bob)) - start) < 0.01, "the stake comes back");
  const quiet = await open("Nobody trades this");
  await ageDeadline(quiet, 73);
  await mk.settleUnclaimed(db);
  assert.equal(await status(quiet), "void");
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
  assert.equal(body.confirmedBy, people.cara.id);
  assert.ok(!JSON.stringify(memos).includes("Cara gets"), "no words from the stake go on the chain");
});
