import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The AI's past data, its one-line reason, and the one odds dispute each stake allows. Past stakes
// worded the other way round must count reversed; the line everyone sees must never quote the chat;
// and a dispute must be once per stake, closed to anyone holding a position, and capped. Runs the
// real engine against a throwaway embedded Postgres, with no AI and no chain.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-dispute-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";
process.env.SOLANA_RPC_URL = "";

type User = import("../lib/auth").User;
let mk: typeof import("../lib/markets");
let mem: typeof import("../lib/memory");
let ai: typeof import("../lib/ai");
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>;
const people: Record<string, User> = {};
let chat = 0;

const DAY = 24 * 3600_000;
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));

before(async () => {
  db = await (await import("../lib/db")).getDb();
  mk = await import("../lib/markets");
  mem = await import("../lib/memory");
  ai = await import("../lib/ai");
  for (const name of ["alice", "bob", "cara", "ruby", "eve"]) {
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
       VALUES ($1,initcap($1),'x','#fff',2000,now(),now(),'k','k','s') RETURNING id`,
      [name]
    );
    people[name] = { id: u.id, username: name, display_name: name[0].toUpperCase() + name.slice(1), color: "#fff", public_key: "k", wallet_pubkey: null } as User;
  }
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('g', 'dispute-test', $1, now()) RETURNING id`, [people.alice.id]);
  // Eve isn't in the chat.
  for (const n of ["alice", "bob", "cara", "ruby"]) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,now())`, [g.id, people[n].id]);
  chat = g.id;
  // Ruby makes the last train home every time.
  for (let i = 0; i < 4; i++)
    await db.query(
      `INSERT INTO memories (group_id, subject_id, category, title, outcome, summary, created_at) VALUES ($1,$2,'travel','Ruby makes the last train home',true,'Happened.',now())`,
      [chat, people.ruby.id]
    );
});

test("opposite wordings are spotted, and the same wording isn't", () => {
  assert.ok(mem.opposite("Ruby misses the last train home", "Ruby makes the last train home"));
  assert.ok(mem.opposite("Zara is late to the meeting", "Zara starts the meeting on time"));
  assert.ok(mem.opposite("Nadia falls asleep during the film", "Nadia stays awake for the whole film"));
  assert.ok(mem.opposite("Theo cancels on Saturday", "Theo turns up to the group call"));
  assert.ok(mem.opposite("Maya runs a sub-23 parkrun", "Maya's parkrun time is over 24 minutes"));
  assert.ok(mem.opposite("Jake doesn't turn up", "Jake turns up to football"), "a negation flips it");
  assert.ok(!mem.opposite("Jake is late to dinner tonight", "Jake is more than 15 minutes late to Friday dinner"));
  assert.ok(!mem.opposite("Omar scores on Sunday", "Omar scores in Sunday's five-a-side"));
});

test("different words for the same thing match", () => {
  const shared = (a: string, b: string) => [...mem.tokens(a)].filter((t) => mem.tokens(b).has(t));
  assert.ok(shared("Theo cancels on Saturday", "Theo turns up to the group call").includes("attend"));
  assert.ok(shared("Dad nods off during the film", "Dad falls asleep in front of the telly").includes("sleep"));
  assert.ok(shared("Sam takes the bins out", "Sam took the bin out").includes("bin"));
});

test("a past stake worded the other way round counts reversed in the base rate", async () => {
  const { history, similar } = await mem.evidenceFor(db, chat, "Ruby misses the last train home", people.ruby.id);
  assert.ok(similar.length > 0 && similar.every((s) => s.flipped), "it found her train record, flagged as reversed");
  assert.ok(history.baseRate! < 0.3, `she always makes it, so missing it is unlikely (got ${history.baseRate})`);
  assert.match(history.examples[0] ? JSON.stringify(history.examples[0]) : "", /"flipped":true/);
  assert.match(history.subjectCategoryRecord ?? "", /^0 of 4 came true/);
  const same = await mem.evidenceFor(db, chat, "Ruby makes the last train on Friday", people.ruby.id);
  assert.ok(same.history.baseRate! > 0.7, "worded the same way, it counts as it was");
});

test("the same person's record on the same kind of stake counts even in different words", async () => {
  await db.query(`INSERT INTO memories (group_id, subject_id, category, title, outcome, summary, created_at) VALUES ($1,$2,'punctuality','Cara is late to the lecture',true,'Happened.',now())`, [chat, people.cara.id]);
  const { similar } = await mem.findSimilar(db, chat, "Cara arrives after kick-off", people.cara.id);
  assert.equal(similar.length, 1, "her lateness record is kept, not dropped for sharing no words");
});

test("the line everyone sees never quotes the chat or the private answers", () => {
  const snippets = [{ who: "[SUBJECT]", text: "I will be there at 7:30 on the dot", age: "2d ago" }];
  assert.equal(ai.plainSummary("He's been late to most dinners here, so it leans yes.", snippets), "He's been late to most dinners here, so it leans yes.");
  assert.equal(ai.plainSummary('He said "on the dot" again.', snippets), null, "quotes are out");
  assert.equal(ai.plainSummary("He says he will be there at 7:30 tonight.", snippets), null, "so is retelling a message");
  assert.equal(ai.plainSummary("Friend A thinks he'll be late.", snippets), null, "and the chat's stand-in names");
  assert.equal(ai.plainSummary("His sleep is around 2am with four alarms.", [], "- When do you usually sleep and get up? around 2am with four alarms"), null, "and the profile");
  assert.equal(ai.plainSummary("x".repeat(200), snippets), null, "and long essays");
});

test("a new stake gets a one-line reason built from the numbers when the AI is off", async () => {
  const id = await mk.createMarket(people.alice, chat, { title: "Ruby misses the last train home", resolvesAt: new Date(Date.now() + 2 * DAY).toISOString(), subjectUsername: "ruby" });
  const m = await mk.getMarket(db, id);
  assert.match(m.ai_summary, /came true about \d+% of the time/);
  assert.ok(!/["“]/.test(m.ai_summary));
});

async function bet(title: string, subject: string | null = "ruby") {
  return mk.createMarket(people.alice, chat, { title, resolvesAt: new Date(Date.now() + 3 * DAY).toISOString(), subjectUsername: subject });
}

test("one dispute per stake: the AI looks again once, then nobody can ask again", async () => {
  const id = await bet("Ruby makes the last train on Friday");
  const out = await mk.disputeOdds(people.bob, id);
  assert.equal(typeof out.changed, "boolean");
  const m = await mk.getMarket(db, id);
  assert.equal(m.odds_disputed_by, people.bob.id);
  assert.ok(m.odds_dispute?.note, "the AI's new reason is kept for the stake page");
  await rejects(mk.disputeOdds(people.cara, id), /already been disputed/);
  await rejects(mk.disputeOdds(people.bob, id), /already been disputed/);
  const [rec] = await db.query<{ record: string }>(`SELECT record FROM pricing_records WHERE $1 = ANY(market_ids) AND kind = 'reprice'`, [id]);
  assert.match(rec.record, /"dispute"/, "the admin's pricing record shows the second look");
  const [msg] = await db.query<{ body: string }>(`SELECT body FROM messages WHERE market_id = $1 AND kind = 'system'`, [id]);
  assert.match(msg.body, /^disputed the odds on/);
});

test("nobody can dispute odds they hold a position in, or a chat they aren't in", async () => {
  const id = await bet("Ruby hands her essay in on time");
  await mk.trade(people.bob, id, { side: "yes", action: "buy", amount: 20 });
  await rejects(mk.disputeOdds(people.bob, id), /You have a stake in this one/);
  await rejects(mk.disputeOdds(people.eve, id), /not in this group/);
  assert.equal((await mk.getMarket(db, id)).odds_disputed_at, null, "a refused dispute doesn't use up the stake's one go");
});

test("the AI's second look moves the price at most 15 points, and the disputer waits before trading", async () => {
  const id = await bet("Ruby misses the 23:52 from Paddington");
  // Push the quote far from what the history says (Ruby nearly always makes it), as if the opening went wrong.
  const m0 = await mk.getMarket(db, id);
  const { recenter } = await import("../lib/lmsr");
  await db.query(`UPDATE markets SET q_yes = $2 WHERE id = $1`, [id, recenter(mk.book(m0), 0.9).qYes]);
  const out = await mk.disputeOdds(people.cara, id);
  assert.ok(out.changed, "it moved");
  assert.ok(Math.abs(out.from - 0.9) < 0.01);
  assert.ok(Math.abs(out.to - 0.75) < 0.01, `capped at 15 points (got ${out.to})`);
  assert.ok(Math.abs(mk.price(await mk.getMarket(db, id)) - out.to) < 0.001, "the book is at the new price");
  await rejects(mk.trade(people.cara, id, { side: "no", action: "buy", amount: 20 }), /You disputed these odds/);
  await mk.trade(people.bob, id, { side: "no", action: "buy", amount: 20 });
});

test("no disputes once trading has closed", async () => {
  const id = await bet("Ruby is home by midnight");
  await db.query(`UPDATE markets SET resolves_at = now() - interval '1 minute' WHERE id = $1`, [id]);
  await rejects(mk.disputeOdds(people.bob, id), /Trading has closed/);
});
