/**
 * Publishes the app's on-chain record to public Solana devnet, so anyone can check it on
 * explorer.solana.com. The app itself keeps using its usual chain (the local validator by default).
 *
 *   npm run solana:devnet            # every op the usual chain confirmed, oldest first
 *   npm run solana:devnet -- 40      # at most 40 of them
 *
 * First run: makes a devnet fee payer (saved to .env.local), tries the free airdrop, and if the
 * faucet is dry prints the address to fund at https://faucet.solana.com. Once funded it creates
 * the token on devnet, then sends each mint, burn and memo (pricing-record hashes included) with
 * the same amounts and memos, and stores the devnet signature next to the original.
 */
import fs from "node:fs";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import bs58 from "bs58";
import { getDb } from "../lib/db";
import { CURRENCY } from "../lib/config";
import { devnetConfig, explorer } from "../lib/solana";
import { chainNamespace, sendOpNow, type Op } from "../lib/outbox";

const save = (line: string, note: string) => fs.appendFileSync(".env.local", `\n# ${note} (generated ${new Date().toISOString()})\n${line}\n`);

async function main() {
  const limit = Number(process.argv[2]) || 10_000;
  if (!process.env.SOLANA_DEVNET_PAYER_SECRET) {
    const kp = Keypair.generate();
    save(`SOLANA_DEVNET_PAYER_SECRET=${bs58.encode(kp.secretKey)}`, "Public Solana devnet fee payer and mint authority");
    process.env.SOLANA_DEVNET_PAYER_SECRET = bs58.encode(kp.secretKey);
  }
  const cfg = devnetConfig()!;
  const conn = cfg.connection;
  const payer = cfg.payer.publicKey.toBase58();
  console.log("Devnet payer:", payer);
  let bal = await conn.getBalance(cfg.payer.publicKey);
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    try {
      const sig = await conn.requestAirdrop(cfg.payer.publicKey, 1 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      bal = await conn.getBalance(cfg.payer.publicKey);
    } catch (e) {
      console.warn("Free airdrop refused:", (e as Error).message.split("\n")[0].slice(0, 120));
    }
  }
  console.log("Balance:", bal / LAMPORTS_PER_SOL, "SOL");
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    console.log(`\nSend 1 devnet SOL to ${payer} at https://faucet.solana.com (choose devnet), then run this again.`);
    process.exit(1);
  }

  let mint = cfg.mint;
  if (!mint) {
    mint = await createMint(conn, cfg.payer, cfg.payer.publicKey, null, CURRENCY.decimals);
    save(`SOLANA_DEVNET_MINT=${mint.toBase58()}`, "Public Solana devnet token");
    console.log("Created the token:", explorer(mint.toBase58(), "address", "devnet"));
  }
  const chain = { ...cfg, mint: mint as PublicKey };

  const db = await getDb();
  const ops = await db.query<Op>(
    `SELECT c.id, c.kind, c.amount, c.memo, c.market_id, u.wallet_pubkey, u.wallet_secret_enc
       FROM chain_ops c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.status = 'confirmed' AND c.devnet_signature IS NULL ORDER BY c.id LIMIT $1`,
    [limit]
  );
  console.log(`Publishing ${ops.length} ops to devnet`);
  const ns = await chainNamespace(db);
  // Receipt accounts cost rent (about 0.0009 SOL each), which a faucet-funded devnet payer can't
  // spare for every op. The copy is a manual script that saves each signature straight away, so
  // it goes without them unless SOLANA_OP_RECEIPTS=true.
  const receipts = process.env.SOLANA_OP_RECEIPTS === "true";
  let sent = 0;
  for (const op of ops) {
    try {
      const sig = await sendOpNow(chain, op, ns, { receipts });
      await db.query(`UPDATE chain_ops SET devnet_signature = $2 WHERE id = $1`, [op.id, sig]);
      console.log(`#${op.id} ${op.kind.padEnd(4)} ${explorer(sig, "tx", "devnet")}`);
      sent++;
    } catch (e) {
      console.warn(`#${op.id} ${op.kind} not sent: ${(e as Error).message.split("\n")[0].slice(0, 140)}`);
    }
  }
  const left = await conn.getBalance(cfg.payer.publicKey);
  console.log(`\nSent ${sent} of ${ops.length}. Token: ${explorer(mint.toBase58(), "address", "devnet")}. Payer has ${left / LAMPORTS_PER_SOL} SOL left.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
