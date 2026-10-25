import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { explorer, solanaConfig } from "@/lib/solana";
import { describeTx } from "@/lib/chain";
import { isAdminUsername } from "@/lib/config";

// One transaction, read from the RPC, plus the app event our queue recorded for it (which bet,
// which fee) when there is one. Only people in the viewer's chats are named.
type SigCtx = { params: Promise<{ sig: string }> };
export const GET = route<SigCtx>(async (_req, user, ctx) => {
  if (!isAdminUsername(user.username)) throw new HttpError(403, "The chain view is for the app\'s admin");
  const { sig } = await ctx.params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(sig)) throw new HttpError(400, "That isn't a Solana signature.");
  const cfg = solanaConfig();
  if (!cfg) throw new HttpError(404, "Chain sync is off on this server.");
  const conn = cfg.connection;
  const [tx, statuses, supply] = await Promise.all([
    // A well-formed but unknown signature comes back null; a malformed one makes the RPC throw.
    conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 }).catch(() => null),
    conn.getSignatureStatuses([sig], { searchTransactionHistory: true }).catch(() => ({ value: [null] })),
    conn.getTokenSupply(cfg.mint),
  ]);
  if (!tx) throw new HttpError(404, "No transaction with that signature on this chain.");
  const st = statuses.value[0];
  const mint = cfg.mint.toBase58();
  const t = describeTx({ signature: sig, slot: tx.slot, blockTime: tx.blockTime ?? null, err: tx.meta?.err ?? null }, tx, mint, supply.value.decimals, cfg.payer.publicKey.toBase58());

  const db = await getDb();
  const [op] = await db.query<{ kind: string; amount: number | null; memo: string | null; created_at: string; market_id: number | null; title: string | null; mkind: string | null; status: string | null; user_id: number | null; devnet_signature: string | null }>(
    `SELECT c.kind, c.amount, c.memo, c.created_at, c.devnet_signature, c.market_id, m.title, m.kind AS mkind, m.status, c.user_id
     FROM chain_ops c LEFT JOIN markets m ON m.id = c.market_id WHERE c.signature = $1 LIMIT 1`,
    [sig]
  );
  let who: { name: string; color: string } | null = null;
  if (t.owner) {
    const [p] = await db.query<{ display_name: string; color: string }>(
      `SELECT u.display_name, u.color FROM users u WHERE u.wallet_pubkey = $1 AND u.id IN (
         SELECT gm.user_id FROM group_members gm WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = $2))`,
      [t.owner, user.id]
    );
    if (p) who = { name: p.display_name, color: p.color };
  }

  return {
    ...t,
    who,
    confirmations: st?.confirmationStatus ?? (t.ok ? "confirmed" : null),
    blockhash: tx.transaction.message.recentBlockhash,
    payer: tx.transaction.message.accountKeys[0]?.pubkey.toBase58() ?? null,
    programs: Array.from(new Set(tx.transaction.message.instructions.map((ix) => ("program" in ix && ix.program ? ix.program : ix.programId.toBase58())))),
    token: { mint, decimals: supply.value.decimals },
    network: cfg.cluster,
    event: op
      ? {
          kind: op.kind,
          memo: op.memo,
          queuedAt: op.created_at,
          devnetUrl: op.devnet_signature ? explorer(op.devnet_signature, "tx", "devnet") : null,
          market: op.market_id ? { id: op.market_id, title: op.title, kind: op.mkind, status: op.status } : null,
        }
      : null,
  };
});
