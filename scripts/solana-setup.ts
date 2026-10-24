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
import { explorer } from "../lib/solana";

const rpc = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const conn = new Connection(rpc, "confirmed");

async function main() {
  const secret = process.env.SOLANA_PAYER_SECRET;
  const payer = secret ? Keypair.fromSecretKey(secret.trim().startsWith("[") ? Uint8Array.from(JSON.parse(secret)) : bs58.decode(secret.trim())) : Keypair.generate();
  console.log("Payer:", payer.publicKey.toBase58());
  // Save a new payer straight away, so a rerun after funding it from the web faucet reuses it.
  if (!secret) fs.appendFileSync(".env.local", `\n# Solana devnet payer (generated ${new Date().toISOString()})\nSOLANA_PAYER_SECRET=${bs58.encode(payer.secretKey)}\n`);
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
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    console.log(`\nFund ${payer.publicKey.toBase58()} at https://faucet.solana.com (devnet), then rerun. The payer is saved in .env.local.`);
    process.exit(1);
  }
  const mint = await createMint(conn, payer, payer.publicKey, null, 2);
  console.log(`\nMint: ${explorer(mint.toBase58(), "address")}`);
  fs.appendFileSync(".env.local", `\n# Solana devnet mint (generated ${new Date().toISOString()})\nSOLANA_MINT=${mint.toBase58()}\n`);
  console.log("Appended SOLANA_PAYER_SECRET and SOLANA_MINT to .env.local (git-ignored). Restart the dev server.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
