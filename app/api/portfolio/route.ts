import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { netWorth } from "@/lib/economy";
import { priceYes } from "@/lib/lmsr";
import { explorer, onChainBalance, solanaConfig } from "@/lib/solana";

export const GET = route(async (_req, user) => {
  const db = await getDb();
  const series = await db.query(`SELECT ts, balance, net_worth FROM balance_ticks WHERE user_id = $1 ORDER BY ts LIMIT 3000`, [user.id]);
  const positions = await db.query<any>(
    `SELECT p.*, m.title, m.kind, m.status, m.outcome, m.b, m.q_yes, m.q_no, m.resolves_at, m.group_id, g.name AS group_name, g.emoji
     FROM positions p JOIN markets m ON m.id = p.market_id JOIN groups g ON g.id = m.group_id
     WHERE p.user_id = $1 AND (p.yes_shares > 0.001 OR p.no_shares > 0.001) ORDER BY m.status, m.resolves_at`,
    [user.id]
  );
  const ledger = await db.query(`SELECT ts, delta, balance_after, reason, market_id FROM ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 40`, [user.id]);
  const chain = await db.query<{ id: number; kind: string; amount: number; status: string; signature: string | null; error: string | null; created_at: Date }>(
    `SELECT id, kind, amount, status, signature, error, created_at FROM chain_ops WHERE user_id = $1 ORDER BY id DESC LIMIT 20`,
    [user.id]
  );
  const cfg = solanaConfig();
  return {
    netWorth: await netWorth(db, user.id),
    series,
    positions: positions.map((p) => {
      const pr = p.status === "resolved" ? (p.outcome ? 1 : 0) : priceYes({ b: p.b, qYes: p.q_yes, qNo: p.q_no });
      return {
        market_id: p.market_id,
        title: p.title,
        kind: p.kind,
        status: p.status,
        group: `${p.emoji} ${p.group_name}`,
        group_id: p.group_id,
        yes: p.yes_shares,
        no: p.no_shares,
        spent: p.spent,
        price: pr,
        value: p.yes_shares * pr + p.no_shares * (1 - pr),
      };
    }),
    ledger,
    wallet: user.wallet_pubkey
      ? {
          address: user.wallet_pubkey,
          url: explorer(user.wallet_pubkey, "address"),
          mint: cfg?.mint.toBase58() ?? null,
          onChain: cfg ? await onChainBalance(user.wallet_pubkey) : null,
          enabled: !!cfg,
        }
      : null,
    chain: chain.map((c) => ({ ...c, url: c.signature ? explorer(c.signature) : null })),
  };
});
