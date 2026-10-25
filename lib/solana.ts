import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import { seal } from "./secret";

// Every balance change in the app is mirrored to an SPL token on Solana (a local validator by
// default, or public devnet with SOLANA_CLUSTER=devnet). Coins put into a stake move into that
// stake's own vault account on chain and are paid out of it when it settles; allowances and
// opening balances are minted. The database stays the source of truth so the app never waits on
// the chain: lib/outbox.ts sends the queued operations in the background, exactly once each.

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

// Tests point the outbox at a simulated chain instead of a real RPC.
const g = globalThis as unknown as { __fsChain?: ChainConfig | null };
export function setChainForTests(cfg: ChainConfig | null | undefined) {
  g.__fsChain = cfg;
}

export function solanaConfig(): ChainConfig | null {
  if (g.__fsChain !== undefined) return g.__fsChain;
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
