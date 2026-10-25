import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Invite rewards against a throwaway embedded Postgres, with no AI and no chain.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-referrals-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";
process.env.SOLANA_RPC_URL = "";
process.env.DEMO_BOTS = "false";

let r: typeof import("../lib/referrals");
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>;
let n = 0;

const balance = async (id: number) => (await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [id]))[0].balance;
const rewards = async (id: number) => (await db.query(`SELECT 1 FROM ledger WHERE user_id = $1 AND reason LIKE 'Invited%'`, [id])).length;

async function person(name = `p${++n}`) {
  const [u] = await db.query<{ id: number }>(
    `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt)
     VALUES ($1,$1,'x','#fff',500,now(),now(),'k','k','s') RETURNING id`,
    [name]
  );
  return u.id;
}
async function session(userId: number, device: string) {
  await db.query(`INSERT INTO sessions (id, user_id, created_at, last_seen_at, device_hash) VALUES ($1,$2,now(),now(),$3)`, [`s${++n}`, userId, device]);
}
/** A new account that signed up with `code` on `device`. */
async function signUp(code: string, device: string | null = `dev${++n}`) {
  const id = await person();
  const out = await db.tx((q) => r.attachReferral(q, id, code, device));
  return { id, blocked: out?.blocked ?? null, attached: !!out };
}
async function chat(members: number[], opts: { guest?: number[]; dm?: boolean; sample?: boolean } = {}) {
  const [g] = await db.query<{ id: number }>(
    `INSERT INTO groups (name, invite_code, created_by, created_at, is_dm) VALUES ('g', $1, $2, now(), $3) RETURNING id`,
    [opts.sample ? `c${++n}-demo` : `c${++n}`, members[0], !!opts.dm]
  );
  for (const m of members) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at, guest) VALUES ($1,$2,now(),$3)`, [g.id, m, !!opts.guest?.includes(m)]);
  return g.id;
}
async function stake(userId: number, groupId: number) {
  const [m] = await db.query<{ id: number }>(
    `INSERT INTO markets (group_id, creator_id, kind, decay, title, category, resolution_rule, ai_prob, open_prob, ai_rationale, ai_source, b, q_yes, q_no, created_at, resolves_at, last_decay_at)
     VALUES ($1,$2,'bet','none','t','other','r',0.5,0.5,'x','heuristic',100,0,0,now(),now() + interval '1 day',now()) RETURNING id`,
    [groupId, userId]
  );
  await db.query(`INSERT INTO trades (market_id, user_id, side, action, shares, coins, price_before, price_after, created_at) VALUES ($1,$2,'yes','buy',1,1,0.5,0.5,now())`, [m.id, userId]);
}
const settle = (id: number) => db.tx((q) => r.settleReferrals(q, id));
const status = (id: number) => db.tx((q) => r.inviteStatus(q, id));

before(async () => {
  db = await (await import("../lib/db")).getDb();
  r = await import("../lib/referrals");
});

test("each user gets one stable invite code", async () => {
  const a = await person();
  const code = await r.referralCode(db, a);
  assert.match(code, r.REFERRAL_CODE);
  assert.equal(await r.referralCode(db, a), code);
  assert.notEqual(await r.referralCode(db, await person()), code);
});

test("200 is paid once, only after 3 friends have each joined a chat or made a stake", async () => {
  const inviter = await person();
  const code = await r.referralCode(db, inviter);
  const start = await balance(inviter);
  const [a, b, c, d] = [await signUp(code), await signUp(code), await signUp(code), await signUp(code)];
  assert.ok([a, b, c, d].every((f) => f.attached && !f.blocked));

  // Signing up alone doesn't count.
  assert.equal(await settle(inviter), false);
  assert.equal((await status(inviter)).done, 0);

  // Landing in the sample chats as a guest, a DM, or a chat on your own doesn't count either.
  const sample = await chat([await person(), a.id], { guest: [a.id], sample: true });
  await chat([a.id, inviter], { dm: true });
  await chat([a.id]);
  await settle(inviter);
  assert.equal((await status(inviter)).done, 0);

  // Joining a real chat with someone counts, and so does a stake (even in a sample chat) or a friend bet.
  await chat([inviter, a.id]);
  await stake(b.id, sample);
  await settle(inviter);
  const two = await status(inviter);
  assert.equal(two.done, 2);
  assert.equal(two.paid, false);
  assert.deepEqual(two.friends.map((f) => f.status), ["counted", "counted", "waiting", "waiting"]);
  assert.equal(await balance(inviter), start);

  const g = await chat([d.id, await person()]);
  await db.query(
    `INSERT INTO friend_bets (group_id, creator_id, title, resolves_at, side, stake, taker_stake, created_at) VALUES ($1,$2,'x',now() + interval '1 day','yes',10,10,now())`,
    [g, c.id]
  );
  assert.equal(await settle(inviter), true);
  const done = await status(inviter);
  assert.equal(done.done, 3);
  assert.equal(done.paid, true);
  assert.equal(await balance(inviter), start + 200);

  // The 4th friend and any later visit never pay again, and the payout is mirrored on chain like any credit.
  assert.equal(await settle(inviter), false);
  assert.equal(await rewards(inviter), 1);
  const [op] = await db.query<{ kind: string; amount: number }>(`SELECT kind, amount FROM chain_ops WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [inviter]);
  assert.deepEqual(op, { kind: "mint", amount: 200 });
});

test("the invitee's own visit pays their inviter too", async () => {
  const inviter = await person();
  const code = await r.referralCode(db, inviter);
  const friends = [await signUp(code), await signUp(code), await signUp(code)];
  for (const f of friends) await chat([f.id, await person()]);
  await db.tx((q) => r.settleReferralsAround(q, friends[2].id));
  assert.equal(await rewards(inviter), 1);
});

test("two visits at once pay only once", async () => {
  const inviter = await person();
  const code = await r.referralCode(db, inviter);
  for (let i = 0; i < 3; i++) await chat([(await signUp(code)).id, inviter]);
  const paid = await Promise.all([settle(inviter), settle(inviter), settle(inviter)]);
  assert.equal(paid.filter(Boolean).length, 1);
  assert.equal(await rewards(inviter), 1);
});

test("sign-ups from the inviter's own device, or a device a friend already used, never count", async () => {
  const inviter = await person();
  await session(inviter, "phone-of-inviter");
  const code = await r.referralCode(db, inviter);
  const own = await signUp(code, "phone-of-inviter");
  assert.equal(own.blocked, "same_device");
  const first = await signUp(code, "laptop");
  const again = await signUp(code, "laptop");
  assert.equal(first.blocked, null);
  assert.equal(again.blocked, "device_reused");
  for (const f of [own, first, again]) await chat([f.id, inviter]);
  await settle(inviter);
  const s = await status(inviter);
  assert.equal(s.done, 1);
  assert.deepEqual(s.friends.map((f) => f.status), ["not_counted", "counted", "not_counted"]);
});

test("one link counts at most 5 sign-ups a day", async () => {
  const inviter = await person();
  const code = await r.referralCode(db, inviter);
  const out = [];
  for (let i = 0; i < 7; i++) out.push((await signUp(code)).blocked);
  assert.deepEqual(out, [null, null, null, null, null, "too_many", "too_many"]);
});

test("unknown, malformed or your own code is ignored, and an account is only ever invited once", async () => {
  const inviter = await person();
  const code = await r.referralCode(db, inviter);
  assert.equal((await signUp("nobody-has-this")).attached, false);
  assert.equal((await signUp("'; DROP TABLE users; --")).attached, false);
  assert.equal(await db.tx((q) => r.attachReferral(q, inviter, code, null)), null);

  const other = await r.referralCode(db, await person());
  const f = await signUp(code);
  await db.tx((q) => r.attachReferral(q, f.id, other, null));
  const [row] = await db.query<{ inviter_id: number }>(`SELECT inviter_id FROM referrals WHERE invitee_id = $1`, [f.id]);
  assert.equal(row.inviter_id, inviter);
});

test("a friend who deletes their account stops counting before the payout", async () => {
  const inviter = await person();
  const code = await r.referralCode(db, inviter);
  const friends = [await signUp(code), await signUp(code), await signUp(code)];
  await db.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [friends[0].id]);
  for (const f of friends) await chat([f.id, inviter]);
  assert.equal(await settle(inviter), false);
  assert.equal((await status(inviter)).done, 2);
});
