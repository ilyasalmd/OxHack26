import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { explorer, solanaConfig } from "@/lib/solana";
import { describeTx } from "@/lib/chain";

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
    const t = describeTx(s, parsed[i], cfg.mint.toBase58(), supply.value.decimals ?? 0);
    const who = t.owner ? byWallet.get(t.owner) : undefined;
    return { ...t, who: who ? { name: who.display_name, color: who.color } : null };
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
