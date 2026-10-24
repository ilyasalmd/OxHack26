import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getDb } from "./db";
import { seal, unseal } from "./secret";
import { CURRENCY } from "./config";

// Every balance change in the app is mirrored to an SPL token on Solana (a local validator by
// default, or public devnet with SOLANA_CLUSTER=devnet):
// stakes burn tokens, payouts and allowances mint them, and market opens and
// resolutions are written as memos. The database stays the source of truth so
// the app never waits on the chain; a background worker drains the outbox.

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function parseKey(s: string) {
  const t = s.trim();
  return Keypair.fromSecretKey(t.startsWith("[") ? Uint8Array.from(JSON.parse(t)) : bs58.decode(t));
}

const RPC: Record<string, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};
const clusterName = () => process.env.SOLANA_CLUSTER || "localnet";
export const rpcUrl = () => process.env.SOLANA_RPC_URL || RPC[clusterName()] || RPC.localnet;

export type ChainConfig = { connection: Connection; payer: Keypair; mint: PublicKey; cluster: string };

export function solanaConfig(): ChainConfig | null {
  const secret = process.env.SOLANA_PAYER_SECRET;
  const mint = process.env.SOLANA_MINT;
  if (!secret || !mint) return null;
  return { connection: new Connection(rpcUrl(), "confirmed"), payer: parseKey(secret), mint: new PublicKey(mint), cluster: clusterName() };
}

/**
 * The public devnet copy, published by `npm run solana:devnet` next to whichever chain the app
 * runs on. Its payer and mint are separate settings so the local demo keeps working unchanged.
 */
export function devnetConfig(): Omit<ChainConfig, "mint"> & { mint: PublicKey | null } | null {
  const secret = process.env.SOLANA_DEVNET_PAYER_SECRET;
  if (!secret) return null;
  const mint = process.env.SOLANA_DEVNET_MINT;
  return {
    connection: new Connection(process.env.SOLANA_DEVNET_RPC_URL || RPC.devnet, "confirmed"),
    payer: parseKey(secret),
    mint: mint ? new PublicKey(mint) : null,
    cluster: "devnet",
  };
}

// A local validator (SOLANA_CLUSTER=localnet) shows in the same explorer as a custom cluster.
export const explorer = (sigOrAddr: string, type: "tx" | "address" = "tx", cluster = clusterName()) => {
  const q = cluster === "localnet" ? `cluster=custom&customUrl=${encodeURIComponent(rpcUrl())}` : cluster === "mainnet-beta" ? "" : `cluster=${cluster}`;
  return `https://explorer.solana.com/${type}/${sigOrAddr}${q ? `?${q}` : ""}`;
};

/** Custodial devnet wallet per user. In production you'd connect Phantom instead. */
export function newWallet() {
  const kp = Keypair.generate();
  return { pubkey: kp.publicKey.toBase58(), secretEnc: seal(kp.secretKey) };
}

const toUnits = (amount: number) => BigInt(Math.round(amount * 10 ** CURRENCY.decimals));
const memoIx = (text: string, signer: PublicKey) =>
  new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: signer, isSigner: true, isWritable: false }], data: Buffer.from(text.slice(0, 500), "utf8") });

export type Op = { id: number; kind: "mint" | "burn" | "memo"; amount: number | null; memo: string | null; wallet_pubkey: string | null; wallet_secret_enc: string | null };

/** Sends one queued op to the given chain and returns its signature. */
export async function sendOp(cfg: ChainConfig, op: Op) {
  const tx = new Transaction();
  const signers = [cfg.payer];
  if (op.kind === "memo") {
    tx.add(memoIx(op.memo ?? "", cfg.payer.publicKey));
  } else {
    if (!op.wallet_pubkey || !op.wallet_secret_enc) throw new Error("user has no wallet");
    const owner = new PublicKey(op.wallet_pubkey);
    const ata = getAssociatedTokenAddressSync(cfg.mint, owner);
    tx.add(createAssociatedTokenAccountIdempotentInstruction(cfg.payer.publicKey, ata, owner, cfg.mint));
    if (op.kind === "mint") {
      tx.add(createMintToInstruction(cfg.mint, ata, cfg.payer.publicKey, toUnits(op.amount!)));
    } else {
      const ownerKp = Keypair.fromSecretKey(unseal(op.wallet_secret_enc));
      tx.add(createBurnInstruction(ata, cfg.mint, owner, toUnits(op.amount!)));
      signers.push(ownerKp);
    }
    if (op.memo) tx.add(memoIx(`friendstakes: ${op.memo}`, cfg.payer.publicKey));
  }
  return sendAndConfirmTransaction(cfg.connection, tx, signers, { commitment: "confirmed" });
}

let running = false;
export async function drainChainOps(limit = 10) {
  if (running || !solanaConfig()) return;
  running = true;
  try {
    const db = await getDb();
    const ops = await db.query<Op>(
      `SELECT c.id, c.kind, c.amount, c.memo, u.wallet_pubkey, u.wallet_secret_enc
       FROM chain_ops c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending' ORDER BY c.id LIMIT $1`,
      [limit]
    );
    for (const op of ops) {
      try {
        const sig = await sendOp(solanaConfig()!, op);
        await db.query(`UPDATE chain_ops SET status = 'confirmed', signature = $2, attempts = attempts + 1 WHERE id = $1`, [op.id, sig]);
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        await db.query(
          `UPDATE chain_ops SET attempts = attempts + 1, error = $2, status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END WHERE id = $1`,
          [op.id, msg]
        );
        // A failure is usually the payer running out of devnet SOL; don't hammer the RPC.
        break;
      }
    }
  } finally {
    running = false;
  }
}

export async function onChainBalance(walletPubkey: string) {
  const cfg = solanaConfig();
  if (!cfg) return null;
  try {
    const ata = getAssociatedTokenAddressSync(cfg.mint, new PublicKey(walletPubkey));
    const bal = await cfg.connection.getTokenAccountBalance(ata);
    return bal.value.uiAmount ?? 0;
  } catch {
    return 0;
  }
}
