import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { fakeChain } from "./fake-chain";

// The Solana outbox against a simulated chain that can lose answers, drop transactions and forget
// signatures. The rule under test: whatever the network does, each operation lands at most once.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-outbox-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";
process.env.SOLANA_RPC_URL = "";

type Outbox = typeof import("../lib/outbox");
type User = import("../lib/auth").User;
let ob: Outbox;
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>;
let mk: typeof import("../lib/markets");
const people: Record<string, User & { wallet_pubkey: string }> = {};
let chat = 0;

before(async () => {
  db = await (await import("../lib/db")).getDb();
  ob = await import("../lib/outbox");
  mk = await import("../lib/markets");
  const { newWallet } = await import("../lib/solana");
  for (const name of ["ana", "ben", "cat", "dev"]) {
    const w = newWallet();
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc)
       VALUES ($1,$1,'x','#fff',500,now(),now(),'k','k','s',$2,$3) RETURNING id`,
      [name, w.pubkey, w.secretEnc]
    );
    people[name] = { id: u.id, username: name, display_name: name, color: "#fff", balance: 500, public_key: "k", wallet_pubkey: w.pubkey } as User & { wallet_pubkey: string };
  }
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('g', 'outbox-test', $1, now()) RETURNING id`, [people.ana.id]);
  for (const m of Object.values(people)) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,now())`, [g.id, m.id]);
  chat = g.id;
});

async function queue(kind: string, user: User, amount: number, memo = "test") {
  const [r] = await db.query<{ id: number }>(`INSERT INTO chain_ops (kind, user_id, amount, memo, created_at) VALUES ($1,$2,$3,$4,now()) RETURNING id`, [kind, user.id, amount, memo]);
  return r.id;
}
const row = async (id: number) =>
  (await db.query<{ status: string; signature: string | null; error: string | null; attempts: number; tx_raw: string | null }>(`SELECT status, signature, error, attempts, tx_raw FROM chain_ops WHERE id = $1`, [id]))[0];
const tokens = (chain: ReturnType<typeof fakeChain>["chain"], cfgMint: PublicKey, owner: string) => chain.balanceOf(getAssociatedTokenAddressSync(cfgMint, new PublicKey(owner))) / 100;
// Only this test's ops: earlier tests leave rows from other fake chains in the shared table.
async function only<T>(ids: number[], fn: () => Promise<T>) {
  await db.query(`UPDATE chain_ops SET status = 'parked' WHERE status IN ('pending', 'sent') AND NOT (id = ANY($1))`, [ids]);
  return fn();
}

test("a payment whose confirmation is lost is checked, not sent again", async () => {
  const { chain, cfg } = fakeChain();
  const id = await queue("mint", people.ana, 50);
  chain.nextSend = "land-then-throw";
  await only([id], () => ob.drainChainOps({ cfg, confirmMs: 0 }));
  let r = await row(id);
  assert.equal(r.status, "sent", "unknown result: not confirmed, not retried");
  assert.ok(r.signature && r.tx_raw, "the signed transaction was saved before sending");
  assert.equal(tokens(chain, cfg.mint, people.ana.wallet_pubkey), 50);

  await ob.drainChainOps({ cfg, confirmMs: 0 });
  r = await row(id);
  assert.equal(r.status, "confirmed");
  assert.equal(tokens(chain, cfg.mint, people.ana.wallet_pubkey), 50, "Ana got her 50 once, not 100");
  assert.equal(chain.landed.length, 1);
  assert.equal(r.attempts, 1, "one transaction was ever built");
});

test("a transaction lost on the way is resent byte for byte while its blockhash is valid", async () => {
  const { chain, cfg } = fakeChain();
  const id = await queue("mint", people.ben, 30);
  chain.nextSend = "drop";
  await only([id], () => ob.drainChainOps({ cfg, confirmMs: 0 }));
  const first = await row(id);
  assert.equal(first.status, "sent");
  assert.equal(chain.landed.length, 0);

  await ob.drainChainOps({ cfg, confirmMs: 0 });
  const r = await row(id);
  assert.equal(r.status, "confirmed");
  assert.equal(r.signature, first.signature, "the same transaction, not a new one");
  assert.equal(tokens(chain, cfg.mint, people.ben.wallet_pubkey), 30);
});

test("only once the blockhash has expired, unseen, is a replacement built, and the old one can't land after", async () => {
  const { chain, cfg } = fakeChain();
  const id = await queue("mint", people.cat, 20);
  chain.nextSend = "drop";
  await only([id], () => ob.drainChainOps({ cfg, confirmMs: 0 }));
  const first = await row(id);
  const oldRaw = Buffer.from(first.tx_raw!, "base64");
  chain.advance(151);

  await ob.drainChainOps({ cfg, confirmMs: 0 });
  const r = await row(id);
  assert.equal(r.status, "confirmed");
  assert.notEqual(r.signature, first.signature, "a fresh transaction after expiry");
  // A delayed copy of the first transaction turning up now is refused.
  await assert.rejects(cfg.connection.sendRawTransaction(oldRaw, { skipPreflight: true }), /Blockhash not found/);
  assert.equal(tokens(chain, cfg.mint, people.cat.wallet_pubkey), 20);
});

test("if the RPC forgets a landed transaction, the operation's receipt on chain still stops a second payment", async () => {
  const { chain, cfg } = fakeChain();
  const id = await queue("mint", people.dev, 40);
  chain.nextSend = "land-then-throw";
  await only([id], () => ob.drainChainOps({ cfg, confirmMs: 0 }));
  chain.forgetStatuses = true;
  chain.advance(151);

  await ob.drainChainOps({ cfg, confirmMs: 0 });
  const r = await row(id);
  assert.equal(r.status, "confirmed");
  assert.match(r.error ?? "", /receipt/);
  assert.equal(tokens(chain, cfg.mint, people.dev.wallet_pubkey), 40);
  assert.equal(chain.landed.length, 1);

  // Even a worker that skipped every check and sent a second transaction for the same op can't pay twice.
  const [op] = await db.query<import("../lib/outbox").Op>(
    `SELECT c.id, c.kind, c.amount, c.memo, c.market_id, u.wallet_pubkey, u.wallet_secret_enc FROM chain_ops c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [id]
  );
  const again = await ob.signOp(cfg, op, await ob.chainNamespace(db));
  await assert.rejects(cfg.connection.sendRawTransaction(again.raw), /already in use/);
  await cfg.connection.sendRawTransaction(again.raw, { skipPreflight: true });
  chain.forgetStatuses = false;
  assert.ok((await ob.fateOf(cfg.connection, again.signature, again.lastValidBlockHeight)).fate === "failed", "it lands as a failure");
  assert.equal(tokens(chain, cfg.mint, people.dev.wallet_pubkey), 40, "and moves nothing");
});

test("a transaction the node refuses up front was never sent, so it is rebuilt, and gives up after three tries", async () => {
  const { chain, cfg } = fakeChain();
  const id = await queue("burn", people.ana, 999); // Ana has nothing on this chain
  for (let i = 0; i < 3; i++) await only([id], () => ob.drainChainOps({ cfg, confirmMs: 0 }));
  const r = await row(id);
  assert.equal(r.status, "failed");
  assert.equal(r.attempts, 3);
  assert.equal(chain.landed.length, 0);
});

test("a stake's coins sit in its own vault on chain until it settles, then the vault pays out and closes", async () => {
  const { chain, cfg } = fakeChain();
  const users = Object.values(people);
  // Opening balances on this chain, as the seed does.
  await db.query(`UPDATE chain_ops SET status = 'parked' WHERE status IN ('pending', 'sent')`);
  for (const u of users) {
    const [b] = await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [u.id]);
    await queue("mint", u, b.balance, "Opening balance");
  }
  const drainAll = async () => {
    for (let i = 0; i < 20; i++) {
      await ob.drainChainOps({ cfg, confirmMs: 0, limit: 50 });
      const [{ n }] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM chain_ops WHERE status IN ('pending', 'sent')`);
      if (!n) return;
    }
    assert.fail("outbox did not drain");
  };

  const id = await mk.createMarket(people.ana, chat, { title: "Ben makes the 9am lecture", resolvesAt: new Date(Date.now() + 20 * 86400_000).toISOString(), subjectUsername: null, kind: "stock" });
  await mk.trade(people.ben, id, { side: "yes", action: "buy", amount: 40 });
  await mk.trade(people.cat, id, { side: "no", action: "buy", amount: 25 });
  await mk.trade(people.cat, id, { side: "no", action: "sell", amount: 5 });
  await drainAll();

  const ns = await ob.chainNamespace(db);
  const vault = await ob.vaultFor(cfg, ns, id);
  const [{ held }] = await db.query<{ held: number }>(
    `SELECT sum(CASE WHEN kind = 'stake' THEN amount ELSE -amount END)::float8 AS held FROM chain_ops WHERE market_id = $1 AND kind IN ('stake','payout')`,
    [id]
  );
  assert.ok(held > 50);
  assert.equal(chain.balanceOf(vault) / 100, Math.round(held * 100) / 100, "the vault holds exactly what the ledger says is in the stake");

  await mk.proposeResult(people.ana, id, true, "saw him there");
  await mk.confirmResult(people.dev, id);
  await mk.confirmResult(people.cat, id);
  assert.equal((await mk.getMarket(db, id)).status, "resolved");
  await drainAll();

  assert.equal(chain.accounts.has(vault.toBase58()), false, "the vault is closed once the stake is finished");
  for (const u of users) {
    const [b] = await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [u.id]);
    assert.equal(tokens(chain, cfg.mint, u.wallet_pubkey), b.balance, `${u.username}'s wallet on chain matches the app`);
  }
  const total = (await db.query<{ t: number }>(`SELECT sum(balance)::float8 AS t FROM users WHERE id = ANY($1)`, [users.map((u) => u.id)]))[0].t;
  assert.equal(Number(chain.supply) / 100, Math.round(total * 100) / 100, "every coin in existence is in someone's wallet");

  const memos = await db.query<{ memo: string }>(`SELECT memo FROM chain_ops WHERE market_id = $1`, [id]);
  for (const m of memos) assert.ok(!ob.chainMemo({ memo: m.memo, market_id: id }).includes("Ben makes"), "the stake's words stay off the chain");
});
