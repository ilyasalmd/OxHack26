import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { PROPOSE_GRACE_MS, callableBy, getMarket, isClosed, price } from "@/lib/markets";
import { maxStake } from "@/lib/economy";
import { tradeFee } from "@/lib/markets";
import { findSimilar } from "@/lib/memory";
import { now } from "@/lib/clock";
import { SETTLE_WINDOW_MS } from "@/lib/safety";
import { isAdminUsername } from "@/lib/config";
import { PRICE_SERIES, chartPoints } from "@/lib/series";

export const GET = route<IdCtx>(async (_req, user, ctx) => {
  const id = await idParam(ctx);
  const db = await getDb();
  const m = await getMarket(db, id);
  await requireMember(m.group_id, user.id);
  const ticks = await chartPoints<{ ts: Date; price: number; source: string }>(db, PRICE_SERIES, id);
  // Hourly candles: a Timescale continuous aggregate on Tiger Cloud, date_bin elsewhere.
  const priceCandles = db.timescale
    ? await db.query(`SELECT bucket, open, high, low, close FROM price_candles_1h WHERE market_id = $1 ORDER BY bucket`, [id])
    : await db.query(
        `SELECT date_bin(INTERVAL '1 hour', ts, TIMESTAMPTZ '2000-01-01') AS bucket,
           (array_agg(price ORDER BY ts))[1] AS open, max(price) AS high, min(price) AS low,
           (array_agg(price ORDER BY ts DESC))[1] AS close
         FROM price_ticks WHERE market_id = $1 GROUP BY bucket ORDER BY bucket`,
        [id]
      );
  // Traded volume per hour, merged onto the price candles by bucket time.
  const volumes = await db.query<{ bucket: Date; volume: number | string; n: number }>(
    `SELECT date_bin(INTERVAL '1 hour', created_at, TIMESTAMPTZ '2000-01-01') AS bucket, sum(coins) AS volume, count(*)::int AS n
     FROM trades WHERE market_id = $1 GROUP BY bucket`,
    [id]
  );
  const volByBucket = new Map(volumes.map((v) => [new Date(v.bucket).getTime(), v]));
  // Each candle opens where the last one closed, as on an exchange, so a single trade in an hour
  // still draws a body from the previous price to the new one instead of a flat dash.
  let prevClose: number | null = null;
  const candles = (priceCandles as { bucket: Date; open: number; high: number; low: number; close: number }[]).map((c) => {
    const v = volByBucket.get(new Date(c.bucket).getTime());
    const open = prevClose ?? Number(c.open);
    const close = Number(c.close);
    prevClose = close;
    return { ...c, open, close, high: Math.max(Number(c.high), open), low: Math.min(Number(c.low), open), volume: v ? Number(v.volume) : 0, n: v ? Number(v.n) : 0 };
  });
  const trades = await db.query(
    // Only the admin is told which trades the demo bots made.
    `SELECT t.id, t.side, t.action, t.shares, t.coins, t.price_after, t.created_at, u.display_name, u.color, (t.bot AND $2) AS bot
     FROM trades t JOIN users u ON u.id = t.user_id WHERE t.market_id = $1 ORDER BY t.created_at DESC LIMIT 30`,
    [id, isAdminUsername(user.username)]
  );
  const [position] = await db.query(`SELECT yes_shares, no_shares, spent FROM positions WHERE market_id = $1 AND user_id = $2`, [id, user.id]);
  const people = await db.query<{ id: number; display_name: string; username: string; color: string }>(
    `SELECT id, display_name, username, color FROM users WHERE id = ANY($1::int[])`,
    [[m.creator_id, m.subject_id, m.proposed_by].filter(Boolean)]
  );
  const { similar } = await findSimilar(db, m.group_id, m.title, m.subject_id);
  const [u] = await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [user.id]);
  const closed = isClosed(m);
  const callable = await callableBy(db, m, user.id);
  const isSubject = m.subject_id === user.id;
  const open = m.status === "open";
  const proposed = open && m.proposed_outcome != null;
  const [mine] = await db.query(`SELECT 1 FROM reports WHERE market_id = $1 AND reporter_id = $2`, [id, user.id]);
  const [myKey] = await db.query<{ wrapped_key: string; wrapper_public_key: string }>(
    `SELECT k.wrapped_key, w.public_key AS wrapper_public_key FROM group_keys k JOIN users w ON w.id = k.wrapped_by WHERE k.group_id = $1 AND k.user_id = $2`,
    [m.group_id, user.id]
  );
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
          // An early "it already happened" waits for a confirmation until the deadline, then for the usual timer.
          early: m.proposed_early && new Date(m.resolves_at) > now(),
          evidenceId: m.proposed_evidence,
          settlesAt: new Date(Math.max(new Date(m.proposed_at as Date).getTime(), new Date(m.resolves_at).getTime()) + SETTLE_WINDOW_MS),
        }
      : null,
    // This member's copy of the chat key, to open (or encrypt) a photo of evidence on this page.
    myKey: myKey ?? null,
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
      // Bets are locked once placed; stocks pay a small fee after the first free trade.
      canSell: m.kind === "stock",
      fee: await tradeFee(db, m, user.id),
      // Before the deadline anyone can say it already happened (with evidence); after it, the
      // poster calls it, and anyone can a day later.
      canResolve:
        open && !proposed && !isSubject && (new Date(m.resolves_at) > now() || m.creator_id === user.id || now().getTime() >= new Date(m.resolves_at).getTime() + PROPOSE_GRACE_MS),
      early: open && new Date(m.resolves_at) > now(),
      canConfirm: proposed && !isSubject && m.proposed_by !== user.id,
      canVeto: open && isSubject,
      canReport: m.creator_id !== user.id || isSubject,
      reported: !!mine,
      // You can't call it the way that pays you.
      canResolveYes: callable.yes,
      // NO/Under can't be known before the deadline.
      canResolveNo: callable.no && new Date(m.resolves_at) <= now(),
      isSubject,
    },
  };
});
