import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bookAt, buyQuote, houseLimit, houseRoom, houseWorstLoss } from "../lib/lmsr";

// Long shots: the bookmaker's limit used to be a flat b, which a 5% bet passes after about 12 coins in
// total. It now allows what a plain book opened at that price is built to lose, b·ln(1/p). With the 3%
// margin a fresh book never gets there (its worst case rises, peaks below it, then falls), so the
// limit only bites once AI re-marks or decay have moved the book: a safety net, not a wall.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-longshot-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";
process.env.SOLANA_RPC_URL = "";

const vig = 0.03;
const empty = { yes: 0, no: 0, collected: 0 };

test("after the AI moves a long shot's book, the limit still stops the bookmaker", async () => {
  const id = await longShot(0.05);
  await mk.trade(P.bob, id, { side: "yes", action: "buy", amount: 40 });
  // An AI re-mark (or decay) can move the quote without anyone's shares changing: here, down to 1%.
  const m = await mk.getMarket(db, id);
  const moved = bookAt(m.b, 0.01);
  await db.query(`UPDATE markets SET q_yes = $2::float8 WHERE id = $1`, [id, m.q_no + moved.qYes]);
  let refused = "";
  for (let i = 0; i < 60 && !refused; i++) await mk.trade(P[["cara", "dan"][i % 2]], id, { side: "yes", action: "buy", amount: 40 }).catch((e) => (refused = e.message));
  assert.match(refused, /taken all it will/);
});

test("an even bet keeps the old limit of b; a long shot gets b·ln(1/p)", () => {
  assert.equal(houseLimit(120, 0.5, "yes", 1), 120);
  assert.ok(Math.abs(houseLimit(120, 0.05, "yes", 1) - 120 * Math.log(20)) < 1e-9);
  assert.equal(houseLimit(120, 0.95, "yes", 1), 120, "the favourite side keeps b");
  assert.ok(Math.abs(houseLimit(120, 0.95, "no", 1) - 120 * Math.log(20)) < 1e-9, "the other side of a favourite is the long shot");
});

test("the first stake a fresh long shot takes goes from a handful of coins to a real bet", () => {
  for (const [p, before, atLeast] of [[0.03, 8, 100], [0.05, 13, 150], [0.1, 28, 400]] as const) {
    const book = bookAt(120, p);
    const old = houseRoom(book, "yes", vig, empty, 120, 5000);
    const now = houseRoom(book, "yes", vig, empty, houseLimit(120, p, "yes", 1), 5000);
    assert.ok(old < before, `${p * 100}% used to take ${old.toFixed(0)}`);
    assert.ok(now > atLeast, `${p * 100}% now takes ${now.toFixed(0)}`);
  }
});

test("houseRoom stops where the worst case first passes the limit, even though huge stakes fit again", () => {
  const book = bookAt(120, 0.05);
  const at = (c: number) => houseWorstLoss(buyQuote(book, "yes", c, vig).shares, 0, c);
  // The old flat limit b: the worst case passes it after a few coins, then falls back under it.
  const room = houseRoom(book, "yes", vig, empty, 120, 5000);
  assert.ok(room > 1 && room < 13);
  assert.ok(at(room) <= 120 + 1e-6);
  assert.ok(at(room + 1) > 120, "one coin more would pass it");
  assert.ok(at(5000) < at(500), "past its peak the worst case falls again, which is why it searches from the bottom");
  assert.equal(houseRoom(book, "yes", vig, empty, houseLimit(120, 0.05, "yes", 1), 25), 25, "capped by what the person may stake");
});

type User = import("../lib/auth").User;
let mk: typeof import("../lib/markets");
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>;
const P: Record<string, User> = {};
let chat = 0;

before(async () => {
  db = await (await import("../lib/db")).getDb();
  mk = await import("../lib/markets");
  for (const name of ["alice", "bob", "cara", "dan"]) {
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
       VALUES ($1,$1,'x','#fff',2000,now(),now(),'k','k','s') RETURNING id`,
      [name]
    );
    P[name] = { id: u.id, username: name, display_name: name, color: "#fff", public_key: "k", wallet_pubkey: null } as User;
  }
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('g', 'longshot', $1, now()) RETURNING id`, [P.alice.id]);
  for (const u of Object.values(P)) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,now())`, [g.id, u.id]);
  chat = g.id;
});

/** A bet whose book (and opening price) sits at p, like a long shot the AI priced low. */
async function longShot(p: number) {
  const id = await mk.createMarket(P.alice, chat, { title: `Jake is on time ${p}`, resolvesAt: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(), subjectUsername: null });
  const m = await mk.getMarket(db, id);
  const bk = bookAt(m.b, p);
  await db.query(`UPDATE markets SET q_yes = $2, q_no = $3, open_prob = $4 WHERE id = $1`, [id, bk.qYes, bk.qNo, p]);
  return id;
}

test("friends can back a 5% long shot with real stakes, and the bookmaker's worst case stays inside b·ln(1/p)", async () => {
  const id = await longShot(0.05);
  // 30 stakes of 40 (1,200 coins) on the long shot: the old limit refused the very first one.
  for (let i = 0; i < 30; i++) await mk.trade(P[["bob", "cara", "dan"][i % 3]], id, { side: "yes", action: "buy", amount: 40 });
  const m = await mk.getMarket(db, id);
  const [h] = await db.query<{ yes: number; no: number; collected: number }>(
    `SELECT sum(yes_shares)::float8 AS yes, sum(no_shares)::float8 AS no, sum(spent)::float8 AS collected FROM positions WHERE market_id = $1`, [id]);
  assert.ok(houseWorstLoss(h.yes, h.no, h.collected) <= houseLimit(m.b, m.open_prob, "yes", 1) + 1e-6, "never past b·ln(1/p)");
});
