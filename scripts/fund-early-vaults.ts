/**
 * One-off for the switch to stake vaults: buy-ins the old worker handled before the new one was
 * running were burned from the wallet instead of moved into the stake's vault. This mints those
 * coins into each open stake's vault, so the vault holds what the ledger says and the Chain page's
 * "locked in open stakes" box matches. Old-worker ops are the ones with no sent_at. Safe to run
 * again: it only adds what a vault is still short of.
 *
 *   npx tsx --env-file=.env.local scripts/fund-early-vaults.ts
 */
import { SystemProgram, Transaction, TransactionInstruction, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID, createInitializeAccount3Instruction, createMintToInstruction } from "@solana/spl-token";
import { getDb } from "../lib/db";
import { CURRENCY } from "../lib/config";
import { solanaConfig } from "../lib/solana";
import { chainNamespace, vaultFor, vaultSeed } from "../lib/outbox";

const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

async function main() {
  const cfg = solanaConfig();
  if (!cfg) throw new Error("Solana isn't configured");
  const db = await getDb();
  const ns = await chainNamespace(db);
  const rows = await db.query<{ market_id: number; held: number; early: number }>(
    `SELECT c.market_id,
            sum(CASE WHEN c.kind = 'stake' THEN c.amount ELSE -c.amount END)::float8 AS held,
            sum(CASE WHEN c.sent_at IS NOT NULL THEN 0 WHEN c.kind = 'stake' THEN c.amount ELSE -c.amount END)::float8 AS early
       FROM chain_ops c JOIN markets m ON m.id = c.market_id
      WHERE m.status = 'open' AND c.kind IN ('stake', 'payout') AND c.status = 'confirmed'
      GROUP BY c.market_id HAVING sum(CASE WHEN c.sent_at IS NULL THEN 1 ELSE 0 END) > 0`
  );
  const house = cfg.payer.publicKey;
  for (const r of rows) {
    const vault = await vaultFor(cfg, ns, r.market_id);
    const info = await cfg.connection.getAccountInfo(vault);
    const have = info ? Number((await cfg.connection.getTokenAccountBalance(vault)).value.uiAmount ?? 0) : 0;
    const short = Math.round((r.held - have) * 100) / 100;
    if (short <= 0) {
      console.log(`#${r.market_id}: vault already holds ${have}`);
      continue;
    }
    const tx = new Transaction();
    if (!info)
      tx.add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: house,
          basePubkey: house,
          seed: vaultSeed(ns, r.market_id),
          newAccountPubkey: vault,
          lamports: await cfg.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE),
          space: ACCOUNT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeAccount3Instruction(vault, cfg.mint, house)
      );
    tx.add(createMintToInstruction(cfg.mint, vault, house, BigInt(Math.round(short * 10 ** CURRENCY.decimals))));
    tx.add(new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: house, isSigner: true, isWritable: false }], data: Buffer.from(`friendstakes: vault top-up for buy-ins burned before vaults · #${r.market_id}`) }));
    const sig = await sendAndConfirmTransaction(cfg.connection, tx, [cfg.payer], { commitment: "confirmed" });
    console.log(`#${r.market_id}: minted ${short} into its vault (${sig.slice(0, 12)}…)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
