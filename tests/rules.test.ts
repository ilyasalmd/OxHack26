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
  await mk.proposeResult(people.alice, id, true);
  assert.equal(await status(id), "open");
  await rejects(mk.confirmResult(people.alice, id), /another member/);
  await mk.confirmResult(people.cara, id);
  assert.equal(await status(id), "resolved");
});

test("before the deadline only the poster can propose, and only YES", async () => {
  const id = await open("Bob finishes the essay early");
  await rejects(mk.proposeResult(people.bob, id, true), /.+/);
  await rejects(mk.proposeResult(people.alice, id, false), /.+/);
  await mk.proposeResult(people.alice, id, true);
});

test("the subject can't confirm a result about themselves", async () => {
  const id = await open("Bob gets to the gym three times", "bob");
  await mk.proposeResult(people.alice, id, true);
  await rejects(mk.confirmResult(people.bob, id), /can't confirm/);
});

test("a market only one person traded pays nothing: the stake comes back", async () => {
  const id = await open("Alice goes for a run before work");
  const start = await balance(people.bob);
  await mk.trade(people.bob, id, { side: "no", action: "buy", amount: 60 });
  assert.ok((await balance(people.bob)) < start);
  await mk.proposeResult(people.alice, id, true);
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
  await mk.proposeResult(people.alice, id, true);
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
