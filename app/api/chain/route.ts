import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { devnetConfig, explorer, solanaConfig } from "@/lib/solana";
import { describeTx } from "@/lib/chain";
import { chainNamespace, vaultFor } from "@/lib/outbox";
import { isAdminUsername } from "@/lib/config";

// A small block explorer for the app's token, read straight from the Solana RPC (not our
// database), so what it shows is what the chain itself recorded.
export const GET = route(async (_req, user) => {
  if (!isAdminUsername(user.username)) throw new HttpError(403, "The chain view is for the app\'s admin");
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
    const t = describeTx(s, parsed[i], cfg.mint.toBase58(), supply.value.decimals ?? 0, cfg.payer.publicKey.toBase58());
    const who = t.owner ? byWallet.get(t.owner) : undefined;
    return { ...t, who: who ? { name: who.display_name, color: who.color } : null };
  });

  // Coins locked in open stakes: what each vault holds on chain, against what the app's ledger
  // says went in and came out. They match once the outbox has caught up.
  const open = await db.query<{ market_id: number; held: number }>(
    `SELECT c.market_id, sum(CASE WHEN c.kind = 'stake' THEN c.amount ELSE -c.amount END)::float8 AS held
     FROM chain_ops c JOIN markets m ON m.id = c.market_id
     WHERE m.status = 'open' AND c.kind IN ('stake', 'payout') AND c.status = 'confirmed'
     GROUP BY c.market_id LIMIT 100`
  );
  const ns = await chainNamespace(db);
  const vaults = await Promise.all(open.map((o) => vaultFor(cfg, ns, o.market_id)));
  const accounts = vaults.length ? await conn.getMultipleParsedAccounts(vaults) : { value: [] };
  const onChain = accounts.value.reduce((s, a) => {
    const data = a?.data as { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } } | undefined;
    return s + (data?.parsed?.info?.tokenAmount?.uiAmount ?? 0);
  }, 0);
  const escrow = { stakes: open.length, onChain: Math.round(onChain * 100) / 100, ledger: Math.round(open.reduce((s, o) => s + o.held, 0) * 100) / 100 };

  // The public devnet copy from `npm run solana:devnet`, when this server has published one.
  const dev = cfg.cluster === "devnet" ? null : devnetConfig();
  const [copied] = dev?.mint
    ? await db.query<{ done: number; total: number }>(`SELECT count(devnet_signature)::int AS done, count(*)::int AS total FROM chain_ops WHERE status = 'confirmed'`)
    : [];

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
    escrow,
    devnet: dev?.mint && copied ? { mintUrl: explorer(dev.mint.toBase58(), "address", "devnet"), published: copied.done, total: copied.total } : null,
  };
});
