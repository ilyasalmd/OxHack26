/**
 * The stake-vault round trip against a real Solana node (the local validator by default), on a
 * throwaway database and a throwaway mint, so the app's own data and coin are never touched:
 *
 *   npx tsx scripts/vault-check.ts            # needs solana-test-validator running on :8899
 *
 * Three people trade a stock, the outbox sends it all, and the stake's vault must hold exactly what
 * the ledger says. Then it settles, and the vault must be closed, every wallet must equal its app
 * balance, and the supply must equal all balances.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-vault-check-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";

async function main() {
  const { Connection, Keypair, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
  const { createMint, getAccount, getAssociatedTokenAddressSync, getMint } = await import("@solana/spl-token");
  const { CURRENCY } = await import("../lib/config");
  const { newWallet, setChainForTests } = await import("../lib/solana");
  const db = await (await import("../lib/db")).getDb();
  const ob = await import("../lib/outbox");
  const mk = await import("../lib/markets");

  const connection = new Connection(process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899", "confirmed");
  const payer = Keypair.generate();
  await connection.confirmTransaction(await connection.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL), "confirmed");
  const mint = await createMint(connection, payer, payer.publicKey, null, CURRENCY.decimals);
  const cfg = { connection, payer, mint, cluster: "localnet" };
  setChainForTests(cfg);
  console.log(`Throwaway mint ${mint.toBase58()} on ${connection.rpcEndpoint}`);

  type P = { id: number; username: string; display_name: string; wallet_pubkey: string };
  const people: Record<string, P> = {};
  for (const name of ["ana", "ben", "cat", "dev"]) {
    const w = newWallet();
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc)
       VALUES ($1,$1,'x','#fff',500,now(),now(),'k','k','s',$2,$3) RETURNING id`,
      [name, w.pubkey, w.secretEnc]
    );
    people[name] = { id: u.id, username: name, display_name: name, wallet_pubkey: w.pubkey };
    await db.query(`INSERT INTO chain_ops (kind, user_id, amount, memo, created_at) VALUES ('mint',$1,500,'Opening balance',now())`, [u.id]);
  }
  const [g] = await db.query<{ id: number }>(`INSERT INTO groups (name, invite_code, created_by, created_at) VALUES ('g', 'vault-check', $1, now()) RETURNING id`, [people.ana.id]);
  for (const m of Object.values(people)) await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,now())`, [g.id, m.id]);

  const drain = async () => {
    for (let i = 0; i < 40; i++) {
      await ob.drainChainOps({ cfg, limit: 50 });
      const [{ n }] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM chain_ops WHERE status IN ('pending', 'sent')`);
      if (!n) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("The outbox did not drain");
  };
  const failed = async () => db.query<{ id: number; kind: string; error: string }>(`SELECT id, kind, error FROM chain_ops WHERE status = 'failed'`);
  const tokens = async (owner: string) => {
    try {
      return Number((await getAccount(connection, getAssociatedTokenAddressSync(mint, new (await import("@solana/web3.js")).PublicKey(owner)))).amount) / 10 ** CURRENCY.decimals;
    } catch {
      return 0;
    }
  };
  const check = (ok: boolean, what: string) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) process.exitCode = 1;
  };

  const as = (p: P) => ({ ...p, color: "#fff", balance: 0, public_key: "k" }) as never;
  const id = await mk.createMarket(as(people.ana), g.id, { title: "Ben makes the 9am lecture", resolvesAt: new Date(Date.now() + 20 * 86400_000).toISOString(), subjectUsername: null, kind: "stock" });
  await mk.trade(as(people.ben), id, { side: "yes", action: "buy", amount: 40 });
  await mk.trade(as(people.cat), id, { side: "no", action: "buy", amount: 25 });
  await mk.trade(as(people.cat), id, { side: "no", action: "sell", amount: 5 });
  await drain();
  check(!(await failed()).length, `every op landed ${JSON.stringify(await failed())}`);

  const ns = await ob.chainNamespace(db);
  const vault = await ob.vaultFor(cfg, ns, id);
  const [{ held }] = await db.query<{ held: number }>(
    `SELECT coalesce(sum(CASE WHEN kind = 'stake' THEN amount ELSE -amount END), 0)::float8 AS held FROM chain_ops WHERE market_id = $1 AND kind IN ('stake','payout')`,
    [id]
  );
  const onChain = Number((await getAccount(connection, vault)).amount) / 10 ** CURRENCY.decimals;
  check(Math.abs(onChain - held) < 0.005, `open stake: vault holds ${onChain}, ledger says ${held.toFixed(2)}`);

  await mk.proposeResult(as(people.ana), id, true, "saw him there");
  await mk.confirmResult(as(people.dev), id);
  await mk.confirmResult(as(people.cat), id);
  await drain();
  check(!(await failed()).length, "settlement ops landed");
  check(!(await connection.getAccountInfo(vault)), "vault closed after settlement");

  let total = 0;
  for (const p of Object.values(people)) {
    const [b] = await db.query<{ balance: number }>(`SELECT balance::float8 AS balance FROM users WHERE id = $1`, [p.id]);
    total += b.balance;
    const t = await tokens(p.wallet_pubkey);
    check(Math.abs(t - b.balance) < 0.005, `${p.username}: wallet ${t}, app ${b.balance.toFixed(2)}`);
  }
  const supply = Number((await getMint(connection, mint)).supply) / 10 ** CURRENCY.decimals;
  check(Math.abs(supply - total) < 0.005, `supply ${supply} equals all balances ${total.toFixed(2)}`);
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
