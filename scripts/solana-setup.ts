/**
 * One-off: create the in-game SPL token on Solana devnet and print the env vars.
 *
 *   npm run solana:setup
 *
 * Reuses SOLANA_PAYER_SECRET if set, otherwise generates a payer keypair. The
 * payer pays fees and is the mint authority. If the faucet airdrop is rate
 * limited, fund the printed address at https://faucet.solana.com and rerun.
 */
import fs from "node:fs";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import bs58 from "bs58";

const rpc = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const conn = new Connection(rpc, "confirmed");

async function main() {
  const secret = process.env.SOLANA_PAYER_SECRET;
  const payer = secret ? Keypair.fromSecretKey(secret.trim().startsWith("[") ? Uint8Array.from(JSON.parse(secret)) : bs58.decode(secret.trim())) : Keypair.generate();
  console.log("Payer:", payer.publicKey.toBase58());
  let bal = await conn.getBalance(payer.publicKey);
  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    try {
      const sig = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      bal = await conn.getBalance(payer.publicKey);
    } catch (e) {
      console.warn("Airdrop failed (devnet faucet is rate limited):", (e as Error).message);
    }
  }
  console.log("Balance:", bal / LAMPORTS_PER_SOL, "SOL");
  const lines = [`SOLANA_PAYER_SECRET=${bs58.encode(payer.secretKey)}`];
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    console.log(`\nFund ${payer.publicKey.toBase58()} at https://faucet.solana.com (devnet), then rerun with:\n  ${lines[0]}`);
    process.exit(1);
  }
  const mint = await createMint(conn, payer, payer.publicKey, null, 2);
  lines.push(`SOLANA_MINT=${mint.toBase58()}`);
  console.log(`\nMint: https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);
  fs.appendFileSync(".env.local", `\n# Solana devnet (generated ${new Date().toISOString()})\n${lines.join("\n")}\n`);
  console.log("Appended SOLANA_PAYER_SECRET and SOLANA_MINT to .env.local (git-ignored). Restart the dev server.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
