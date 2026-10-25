import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { isAdminUsername } from "@/lib/config";
import { getMarket } from "@/lib/markets";
import { explorer } from "@/lib/solana";

// Admin only: every AI pricing decision behind one market, as the exact JSON text that was hashed,
// plus the on-chain memo that carries the opening record's hash.
export const GET = route<IdCtx>(async (_req, user, ctx) => {
  if (!isAdminUsername(user.username)) throw new HttpError(403, "Pricing records are for the app's admin");
  const id = await idParam(ctx);
  const db = await getDb();
  const m = await getMarket(db, id);
  const [g] = await db.query<{ name: string }>(`SELECT name FROM groups WHERE id = $1`, [m.group_id]);
  const records = await db.query<{ id: number; kind: string; record: string; sha256: string; created_at: Date }>(
    `SELECT id, kind, record, sha256, created_at FROM pricing_records WHERE $1 = ANY(market_ids) ORDER BY created_at, id`,
    [id]
  );
  const [op] = await db.query<{ status: string; signature: string | null; memo: string; devnet_signature: string | null }>(
    `SELECT status, signature, memo, devnet_signature FROM chain_ops WHERE market_id = $1 AND kind = 'memo' AND memo LIKE '%"ev":"open"%' ORDER BY id LIMIT 1`,
    [id]
  );
  // The settlement (or call-off) memo, which carries the hash of its own record.
  const [end] = await db.query<{ status: string; signature: string | null; memo: string }>(
    `SELECT status, signature, memo FROM chain_ops WHERE market_id = $1 AND kind = 'memo' AND (memo LIKE '%"ev":"resolve"%' OR memo LIKE '%"ev":"void"%') ORDER BY id DESC LIMIT 1`,
    [id]
  );
  let memoHash: string | null = null;
  try {
    memoHash = op ? (JSON.parse(op.memo).h ?? null) : null;
  } catch {}
  return {
    market: { id: m.id, title: m.title, kind: m.kind, group: g?.name ?? "", aiProb: m.ai_prob, openProb: m.open_prob, source: m.ai_source, createdAt: m.created_at },
    records: records.map((r) => ({ id: r.id, kind: r.kind, sha256: r.sha256, createdAt: r.created_at, record: r.record })),
    settlement: end ? { status: end.status, signature: end.signature, memo: end.memo } : null,
    anchor: op ? { status: op.status, signature: op.signature, memoHash, devnetUrl: op.devnet_signature ? explorer(op.devnet_signature, "tx", "devnet") : null } : null,
  };
});
