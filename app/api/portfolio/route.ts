import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { isAdminUsername, MARKET } from "@/lib/config";
import { BALANCE_SERIES, chartPoints } from "@/lib/series";
import { netWorth } from "@/lib/economy";
import { holdingValue, priceYes } from "@/lib/lmsr";
import { explorer, onChainBalance, solanaConfig } from "@/lib/solana";
import { walletSkill } from "@/lib/skill";
import { cached } from "@/lib/cache";
import { lockedInFriendBetsFor } from "@/lib/friend-bet";

export const GET = route(async (_req, user) => {
  const db = await getDb();
  // The chain side (wallet address, mints, burns, signatures) is shown to the admin only.
  const admin = isAdminUsername(user.username);
  // None of these depend on each other, so they go to the database together.
  const [series, positions, ledger, chain, nw, friendBets, skill] = await Promise.all([
    chartPoints(db, BALANCE_SERIES, user.id),
    db.query<any>(
      `SELECT p.*, m.title, m.kind, m.status, m.outcome, m.b, m.q_yes, m.q_no, m.t_yes, m.t_no, m.resolves_at, m.group_id, g.name AS group_name, g.emoji
       FROM positions p JOIN markets m ON m.id = p.market_id JOIN groups g ON g.id = m.group_id
       WHERE p.user_id = $1 AND (p.yes_shares > 0.001 OR p.no_shares > 0.001) ORDER BY m.status, m.resolves_at`,
      [user.id]
    ),
    db.query(`SELECT ts, delta, balance_after, reason, market_id FROM ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 40`, [user.id]),
    !admin
      ? []
      : db.query<{ id: number; kind: string; amount: number; status: string; signature: string | null; error: string | null; created_at: Date }>(
          `SELECT id, kind, amount, status, signature, error, created_at FROM chain_ops WHERE user_id = $1 ORDER BY id DESC LIMIT 20`,
          [user.id]
        ),
    netWorth(db, user.id),
    lockedInFriendBetsFor(db, user.id),
    cached(`wallet-skill:${user.id}`, 30_000, () => walletSkill(db, user.id)),
  ]);
  const cfg = solanaConfig();
  return {
    netWorth: nw,
    friendBets,
    skill,
    series,
    positions: positions.map((p) => {
      const pr = p.status === "resolved" ? (p.outcome ? 1 : 0) : priceYes({ b: p.b, qYes: p.q_yes, qNo: p.q_no });
      return {
        market_id: p.market_id,
        title: p.title,
        kind: p.kind,
        status: p.status,
        group: p.group_name,
        group_id: p.group_id,
        yes: p.yes_shares,
        no: p.no_shares,
        spent: p.spent,
        price: pr,
        // Open positions are worth what cashing out pays now.
        value: p.status === "resolved" ? (p.outcome ? p.yes_shares : p.no_shares) : p.status === "open" ? holdingValue({ b: p.b, qYes: p.q_yes, qNo: p.q_no }, p, MARKET.vig, { b: p.b, qYes: p.t_yes ?? p.q_yes, qNo: p.t_no ?? p.q_no }) : 0,
      };
    }),
    ledger,
    wallet: admin && user.wallet_pubkey
      ? {
          address: user.wallet_pubkey,
          url: explorer(user.wallet_pubkey, "address"),
          mint: cfg?.mint.toBase58() ?? null,
          onChain: cfg ? await onChainBalance(user.wallet_pubkey) : null,
          enabled: !!cfg,
          network: cfg ? (cfg.cluster === "localnet" ? "local validator" : cfg.cluster) : null,
        }
      : null,
    chain: chain.map((c) => ({ ...c, url: c.signature ? explorer(c.signature) : null })),
  };
});
