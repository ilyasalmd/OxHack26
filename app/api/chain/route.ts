import type { ParsedInstruction, PartiallyDecodedInstruction } from "@solana/web3.js";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { explorer, solanaConfig } from "@/lib/solana";

// A small block explorer for the app's token, read straight from the Solana RPC (not our
// database), so what it shows is what the chain itself recorded.
export const GET = route(async (_req, user) => {
  const cfg = solanaConfig();
  if (!cfg) return { enabled: false as const };
  const conn = cfg.connection;
  const [version, slot, epoch, perf, supply, sigs] = await Promise.all([
    conn.getVersion(),
    conn.getSlot(),
    conn.getEpochInfo(),
    conn.getRecentPerformanceSamples(1),
    conn.getTokenSupply(cfg.mint),
    conn.getSignaturesForAddress(cfg.mint, { limit: 30 }),
  ]);
  const parsed = sigs.length ? await conn.getParsedTransactions(sigs.map((s) => s.signature), { maxSupportedTransactionVersion: 0 }) : [];

  // Name only the people this user shares a chat with; everyone else stays an address.
  const db = await getDb();
  const people = await db.query<{ wallet_pubkey: string; display_name: string; color: string }>(
    `SELECT u.wallet_pubkey, u.display_name, u.color FROM users u
     WHERE u.wallet_pubkey IS NOT NULL AND u.id IN (
       SELECT gm.user_id FROM group_members gm WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1))`,
    [user.id]
  );
  const byWallet = new Map(people.map((p) => [p.wallet_pubkey, p]));

  const txs = sigs.map((s, i) => {
    const tx = parsed[i];
    const ixs = (tx?.transaction.message.instructions ?? []) as (ParsedInstruction | PartiallyDecodedInstruction)[];
    let kind = "other";
    let amount: number | null = null;
    let memo: string | null = null;
    for (const ix of ixs) {
      if (!("parsed" in ix)) continue;
      if (ix.program === "spl-memo") memo = String(ix.parsed);
      if (ix.program === "spl-token" && ["mintTo", "mintToChecked", "burn", "burnChecked"].includes(ix.parsed?.type)) {
        kind = ix.parsed.type.startsWith("mint") ? "mint" : "burn";
        const info = ix.parsed.info;
        amount = Number(info.tokenAmount?.uiAmount ?? Number(info.amount) / 10 ** (supply.value.decimals ?? 0));
      }
      if (ix.program === "spl-token" && ix.parsed?.type === "initializeMint") kind = "create";
    }
    const owner = tx?.meta?.postTokenBalances?.find((b) => b.mint === cfg.mint.toBase58())?.owner ?? null;
    const who = owner ? byWallet.get(owner) : undefined;
    return {
      signature: s.signature,
      url: explorer(s.signature),
      slot: s.slot,
      time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
      ok: !s.err,
      kind,
      amount,
      memo: memo?.replace(/^(friendstakes|friend-stocks): /, "") ?? null,
      fee: tx?.meta ? tx.meta.fee / 1e9 : null,
      owner,
      who: who ? { name: who.display_name, color: who.color } : null,
    };
  });

  const cluster = cfg.cluster;
  return {
    enabled: true as const,
    network: {
      cluster,
      label: cluster === "localnet" ? "Local validator" : cluster === "mainnet-beta" ? "Mainnet" : cluster.charAt(0).toUpperCase() + cluster.slice(1),
      version: version["solana-core"],
      slot,
      epoch: epoch.epoch,
      tps: perf[0] ? Math.round(perf[0].numTransactions / perf[0].samplePeriodSecs) : null,
    },
    token: {
      mint: cfg.mint.toBase58(),
      url: explorer(cfg.mint.toBase58(), "address"),
      supply: supply.value.uiAmount ?? 0,
      decimals: supply.value.decimals,
      authority: cfg.payer.publicKey.toBase58(),
    },
    txs,
  };
});
