import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Price moves the app makes itself (time decay, AI re-marks) are the house's money: they can't be
// cashed out early, and nobody can feed the AI made-up signals about their own stock. Runs the real
// engine against a throwaway embedded Postgres, with no AI and no chain.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-fair-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";
process.env.SOLANA_RPC_URL = "";

type User = import("../lib/auth").User;
let mk: typeof import("../lib/markets");
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>;
const people: Record<string, User> = {};
let chat = 0;

const DAY = 24 * 3600_000;
const balance = async (u: User) => (await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [u.id]))[0].balance;
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));
const trace = () => ({ provider: "none" as const, model: "", prompt: "", raw: null, ms: 0 });

before(async () => {
  db = await (await import("../lib/db")).getDb();
  mk = await import("../lib/markets");
  for (const name of ["alice", "bob", "cara", "dan"]) {
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
       VALUES ($1,$1,'x','#fff',2000,now(),now(),'k','k','s') RETURNING id`,
      [name]
    );
    people[name] = { id: u.id, username: name, display_name: name, color: "#fff", public_key: "k", wallet_pubkey: null } as User;
  }
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('g', 'fair-test', $1, now()) RETURNING id`, [people.alice.id]);
  for (const m of Object.values(people)) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,now())`, [g.id, m.id]);
  chat = g.id;
});

/** A long "by date X" stock posted by alice, about `subject`. */
async function stock(title: string, subject: string | null = "dan") {
  const id = await mk.createMarket(people.alice, chat, { title, resolvesAt: new Date(Date.now() + 120 * DAY).toISOString(), subjectUsername: subject, kind: "stock" });
  return id;
}

/** Pretend `days` passed since the last decay, then run the decay sweep. */
async function decay(id: number, days: number) {
  await db.query(`UPDATE markets SET last_decay_at = last_decay_at - make_interval(days => $2) WHERE id = $1`, [id, days]);
  await mk.runDecay(db);
}

/** What selling everything on one side would pay on the quote alone, ignoring the trade-book cap. */
async function uncapped(id: number, side: "yes" | "no", shares: number) {
  const { cashOutQuote } = await import("../lib/lmsr");
  return cashOutQuote(mk.book(await mk.getMarket(db, id)), side, shares, (await import("../lib/config")).MARKET.vig);
}

test("time decay can't be cashed out: a short sold after months of no news gets back at most its stake", async () => {
  const id = await stock("Dan books the summer trip");
  assert.equal((await mk.getMarket(db, id)).decay, "hazard", "a 'by date X' stock decays");
  const start = await balance(people.bob);
  const { shares } = await mk.trade(people.bob, id, { side: "no", action: "buy", amount: 100 });
  const p0 = mk.price(await mk.getMarket(db, id));
  await decay(id, 60);
  assert.ok(mk.price(await mk.getMarket(db, id)) < p0 - 0.05, "decay moved the price towards NO");
  assert.ok((await uncapped(id, "no", shares)) > 105, "without the cap, selling would pay out the house's move");
  await mk.trade(people.bob, id, { side: "no", action: "sell", amount: shares });
  assert.ok((await balance(people.bob)) <= start + 0.01, "no profit from a move the app made");
});

test("a friend's 1-coin trade after the decay doesn't unlock it", async () => {
  const id = await stock("Dan learns to drive before summer");
  const start = await balance(people.bob);
  const { shares } = await mk.trade(people.bob, id, { side: "no", action: "buy", amount: 100 });
  await decay(id, 60);
  await mk.trade(people.cara, id, { side: "yes", action: "buy", amount: 1 });
  await mk.trade(people.bob, id, { side: "no", action: "sell", amount: shares });
  assert.ok((await balance(people.bob)) - start < 1, "a token trade can't launder the house's move");
});

test("an AI re-mark can't be cashed out either", async () => {
  const id = await stock("Dan runs a sub-25 5k before the summer");
  const start = await balance(people.bob);
  const { shares } = await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 100 });
  const seen = mk.price(await mk.getMarket(db, id));
  const snap = await mk.snapshotForRemark(db, chat, null, null);
  const out = await mk.applyRemarks(chat, snap, [{ id, probability: seen + 0.3, reason: "training is going well" }], trace());
  assert.equal(out.applied.length, 1, "the AI moved it");
  assert.ok((await uncapped(id, "yes", shares)) > 115, "without the cap, the AI's move would pay out");
  await mk.trade(people.bob, id, { side: "yes", action: "sell", amount: shares });
  assert.ok((await balance(people.bob)) <= start + 0.01);
});

test("moves made by real trades still pay: being right before your friends is the game", async () => {
  const id = await stock("Dan gets the internship by spring");
  const start = await balance(people.bob);
  const { shares } = await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 50 });
  for (const who of ["cara", "dan"]) await mk.trade(people[who], id, { side: "yes", action: "buy", amount: 150 });
  await mk.trade(people.bob, id, { side: "yes", action: "sell", amount: shares });
  assert.ok((await balance(people.bob)) > start + 10, "friends buying after bob moved the price his way");
});

test("the AI ignores moods and chat sent by someone holding that stock", async () => {
  const held = await stock("Dan finishes the marathon in under four hours");
  const other = await stock("Cara moves flat before Christmas", "cara");
  await mk.trade(people.bob, held, { side: "yes", action: "buy", amount: 20 });
  const moods = { [people.dan.id]: 1, [people.cara.id]: -1 };
  const chatSnips = { [held]: [{ who: "Friend A", text: "he's flying in training", age: "2d" }], [other]: [{ who: "Friend B", text: "still flat hunting", age: "1d" }] };
  const snap = await mk.snapshotForRemark(db, chat, moods, chatSnips, people.bob.id);
  const inputs = (id: number) => snap.inputs.stocks.find((s) => s.id === id)!;
  assert.equal(inputs(held).mood, null, "bob holds it, so his mood score is dropped");
  assert.equal(inputs(held).snippets, undefined, "and so are his snippets");
  assert.equal(inputs(other).mood, -1, "a stock he doesn't hold still gets his input");
  assert.equal(inputs(other).snippets?.length, 1);
  const fromCara = await mk.snapshotForRemark(db, chat, moods, chatSnips, people.cara.id);
  assert.equal(fromCara.inputs.stocks.find((s) => s.id === held)!.mood, 1, "someone without a stake can still send it");
});

test("whoever posted a stake trades it only after a friend has", async () => {
  const id = await mk.createMarket(people.alice, chat, { title: "Cara is late to the lecture", resolvesAt: new Date(Date.now() + 2 * DAY).toISOString(), subjectUsername: "cara" });
  await rejects(mk.trade(people.alice, id, { side: "yes", action: "buy", amount: 20 }), /friend trade it first/);
  await mk.trade(people.bob, id, { side: "no", action: "buy", amount: 20 });
  await mk.trade(people.alice, id, { side: "yes", action: "buy", amount: 20 });
});
