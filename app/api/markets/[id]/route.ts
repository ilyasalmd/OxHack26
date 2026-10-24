import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { getMarket, isClosed, price } from "@/lib/markets";
import { maxStake } from "@/lib/economy";
import { findSimilar } from "@/lib/memory";
import { now } from "@/lib/clock";
import { SETTLE_WINDOW_MS } from "@/lib/safety";

export const GET = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idParam(ctx);
  const db = await getDb();
  const m = await getMarket(db, id);
  await requireMember(m.group_id, user.id);
  const ticks = await db.query<{ ts: Date; price: number; source: string }>(
    `SELECT ts, price, source FROM price_ticks WHERE market_id = $1 ORDER BY ts LIMIT 2000`,
    [id]
  );
  // Hourly candles: a Timescale continuous aggregate on Tiger Cloud, date_bin elsewhere.
  const candles = db.timescale
    ? await db.query(`SELECT bucket, open, high, low, close FROM price_candles_1h WHERE market_id = $1 ORDER BY bucket`, [id])
    : await db.query(
        `SELECT date_bin(INTERVAL '1 hour', ts, TIMESTAMPTZ '2000-01-01') AS bucket,
           (array_agg(price ORDER BY ts))[1] AS open, max(price) AS high, min(price) AS low,
           (array_agg(price ORDER BY ts DESC))[1] AS close
         FROM price_ticks WHERE market_id = $1 GROUP BY bucket ORDER BY bucket`,
        [id]
      );
  const trades = await db.query(
    `SELECT t.id, t.side, t.action, t.shares, t.coins, t.price_after, t.created_at, u.display_name, u.color
     FROM trades t JOIN users u ON u.id = t.user_id WHERE t.market_id = $1 ORDER BY t.created_at DESC LIMIT 30`,
    [id]
  );
  const [position] = await db.query(`SELECT yes_shares, no_shares, spent FROM positions WHERE market_id = $1 AND user_id = $2`, [id, user.id]);
  const people = await db.query<{ id: number; display_name: string; username: string; color: string }>(
    `SELECT id, display_name, username, color FROM users WHERE id = ANY($1::int[])`,
    [[m.creator_id, m.subject_id, m.proposed_by].filter(Boolean)]
  );
  const { similar } = await findSimilar(db, m.group_id, m.title, m.subject_id);
  const [u] = await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [user.id]);
  const closed = isClosed(m);
  const isSubject = m.subject_id === user.id;
  const open = m.status === "open";
  const proposed = open && m.proposed_outcome != null;
  const [mine] = await db.query(`SELECT 1 FROM reports WHERE market_id = $1 AND reporter_id = $2`, [id, user.id]);
  return {
    market: { ...m, price: price(m), closed },
    creator: people.find((p) => p.id === m.creator_id),
    subject: people.find((p) => p.id === m.subject_id) ?? null,
    // A result somebody has put forward and the group hasn't yet confirmed or disputed.
    proposal: proposed
      ? {
          outcome: m.proposed_outcome,
          note: m.proposed_note,
          by: people.find((p) => p.id === m.proposed_by) ?? null,
          at: m.proposed_at,
          settlesAt: new Date(new Date(m.proposed_at as Date).getTime() + SETTLE_WINDOW_MS),
        }
      : null,
    ticks,
    candles,
    trades,
    position: position ?? null,
    similar: similar.filter((s) => s.market_id !== m.id).map(({ embedding: _e, ...s }) => s),
    me: {
      balance: u.balance,
      maxStake: maxStake(u.balance),
      canTrade: !closed && !(isSubject && m.kind === "bet"),
      canShort: !isSubject,
      canResolve: open && !proposed && !isSubject && (m.creator_id === user.id || new Date(m.resolves_at) <= now()),
      canConfirm: proposed && !isSubject && m.proposed_by !== user.id,
      canVeto: open && isSubject,
      canReport: m.creator_id !== user.id || isSubject,
      reported: !!mine,
      isSubject,
    },
  };
});
