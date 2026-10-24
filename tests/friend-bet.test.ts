import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Bet a friend against a throwaway embedded Postgres, with no AI and no chain.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-friend-bet-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";
process.env.SOLANA_RPC_URL = "";
process.env.DEMO_BOTS = "false";

type User = import("../lib/auth").User;
let fb: typeof import("../lib/friend-bet");
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>;
const people: Record<string, User> = {};
let chat = 0;

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const balance = async (u: User) => (await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [u.id]))[0].balance;
const everyone = async () => (await db.query<{ s: number }>(`SELECT sum(balance)::float8 AS s FROM users`))[0].s;
const status = async (id: number) => (await db.query<{ status: string }>(`SELECT status FROM friend_bets WHERE id = $1`, [id]))[0].status;
const close = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.011, `${msg ?? ""} ${a} != ${b}`);
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));

before(async () => {
  db = await (await import("../lib/db")).getDb();
  fb = await import("../lib/friend-bet");
  for (const name of ["jake", "sam", "maya"]) {
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
       VALUES ($1,$1,'x','#fff',500,now(),now(),'k','k','s') RETURNING id`,
      [name]
    );
    people[name] = { id: u.id, username: name, display_name: name, color: "#fff", balance: 500, public_key: "k", wallet_pubkey: null } as User;
  }
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('g', 'fbet', $1, now()) RETURNING id`, [people.jake.id]);
  for (const m of ["jake", "sam", "maya"]) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,now())`, [g.id, people[m].id]);
  chat = g.id;
});

const post = (title: string, stake = 30, theirStake = 20, side: "yes" | "no" = "yes") =>
  fb.createFriendBet(people.jake, chat, { title, resolvesAt: new Date(Date.now() + DAY).toISOString(), side, stake, theirStake }).then((r) => r.id);
const act = (u: string, id: number, a: Parameters<typeof fb.actOnFriendBet>[2]) => fb.actOnFriendBet(people[u], id, a);
const endIt = (id: number, hoursAgo: number) => db.query(`UPDATE friend_bets SET resolves_at = now() - make_interval(hours => $2) WHERE id = $1`, [id, hoursAgo]);

test("30 against 20: the loser says so and the winner takes 50, nothing appears or vanishes", async () => {
  const total = await everyone();
  const jake0 = await balance(people.jake);
  const sam0 = await balance(people.sam);
  const id = await post("Sam is late on Friday");
  close(await balance(people.jake), jake0 - 30);
  await act("sam", id, { action: "take" });
  close(await balance(people.sam), sam0 - 20);
  await act("sam", id, { action: "lost" });
  assert.equal(await status(id), "settled");
  close(await balance(people.jake), jake0 + 20);
  close(await balance(people.sam), sam0 - 20);
  close(await everyone(), total);
});

test("saying you won needs the other person to confirm; a dispute calls it off and refunds both", async () => {
  const jake0 = await balance(people.jake);
  const sam0 = await balance(people.sam);
  const a = await post("Jake finishes the essay tonight");
  await act("sam", a, { action: "take" });
  await act("jake", a, { action: "won" });
  await rejects(act("jake", a, { action: "confirm" }), /other person/);
  await rejects(act("maya", a, { action: "confirm" }), /other person/);
  await act("sam", a, { action: "confirm" });
  close(await balance(people.jake), jake0 + 20);

  const b = await post("Sam goes to the gym");
  await act("sam", b, { action: "take" });
  await act("sam", b, { action: "won" });
  await act("jake", b, { action: "dispute" });
  assert.equal(await status(b), "refunded");
  close(await balance(people.jake), jake0 + 20, "the disputed bet changed nothing");
  close(await balance(people.sam), sam0 - 20);
});

test("a counter-offer changes what the friend puts in once the poster accepts it", async () => {
  const id = await post("Maya runs 5k this week");
  const maya0 = await balance(people.maya);
  await act("maya", id, { action: "counter", theirStake: 10 });
  await rejects(act("maya", id, { action: "accept", counterId: 1 }), /posted the bet/);
  const [c] = await db.query<{ id: number }>(`SELECT id FROM friend_bet_counters WHERE bet_id = $1 AND status = 'open'`, [id]);
  await act("jake", id, { action: "accept", counterId: c.id });
  close(await balance(people.maya), maya0 - 10);
  const [b] = await db.query<{ taker_id: number; taker_stake: number; status: string }>(`SELECT taker_id, taker_stake, status FROM friend_bets WHERE id = $1`, [id]);
  assert.equal(b.taker_id, people.maya.id);
  assert.equal(b.status, "live");
  close(b.taker_stake, 10);
  await rejects(act("sam", id, { action: "take" }), /already took/);
});

test("only one friend can take it, never the poster, and only the two of them settle it", async () => {
  const id = await post("It snows on Sunday");
  await rejects(act("jake", id, { action: "take" }), /your own bet/);
  await act("sam", id, { action: "take" });
  await rejects(act("maya", id, { action: "take" }), /already took/);
  await rejects(act("maya", id, { action: "won" }), /two people/);
  await rejects(act("jake", id, { action: "cancel" }), /can't be cancelled/);
});

test("the usual caps apply: at most a quarter of your balance", async () => {
  await rejects(post("Jake buys a car", 400), /at most/);
});

test("cancelling an untaken bet, or nobody taking it by the end, gives the stake back", async () => {
  const jake0 = await balance(people.jake);
  const a = await post("Jake cooks on Monday");
  await act("jake", a, { action: "cancel" });
  close(await balance(people.jake), jake0);
  const b = await post("Jake reads a book");
  await endIt(b, 1);
  await fb.finaliseFriendBets(db);
  assert.equal(await status(b), "cancelled");
  close(await balance(people.jake), jake0);
});

test("an unanswered claim stands a day after the end; a bet nobody settles is refunded after 3 days", async () => {
  const jake0 = await balance(people.jake);
  const sam0 = await balance(people.sam);
  const a = await post("Sam texts back within an hour");
  await act("sam", a, { action: "take" });
  await act("jake", a, { action: "won" });
  await endIt(a, 23);
  await db.query(`UPDATE friend_bets SET claimed_at = now() - interval '30 hours' WHERE id = $1`, [a]);
  await fb.finaliseFriendBets(db);
  assert.equal(await status(a), "claimed", "still inside the day after the end");
  await endIt(a, 25);
  await fb.finaliseFriendBets(db);
  assert.equal(await status(a), "settled");
  close(await balance(people.jake), jake0 + 20);

  const b = await post("Maya wins the raffle");
  await act("sam", b, { action: "take" });
  await endIt(b, 71);
  await fb.finaliseFriendBets(db);
  assert.equal(await status(b), "live");
  await endIt(b, 73);
  await fb.finaliseFriendBets(db);
  assert.equal(await status(b), "refunded");
  close(await balance(people.sam), sam0 - 20, "sam only lost the first bet");
});

test("while a bet is on, it counts at what you put in: no paper profit", async () => {
  const { netWorth } = await import("../lib/economy");
  const before = (await netWorth(db, people.sam.id)).total;
  const id = await post("Jake is early to the lecture", 10, 40);
  await act("sam", id, { action: "take" });
  close((await netWorth(db, people.sam.id)).total, before);
});

test("banned topics are blocked here too", async () => {
  await rejects(post("Sam gets pregnant this year"), /aren't allowed/);
});
