import { firstSentence } from "@/lib/text";
import { getDb } from "@/lib/db";
import { requireMember, route } from "@/lib/auth";
import { idParam, type IdCtx } from "@/lib/http";
import { book, getMarket, isClosed, price, tradeBook, voteState } from "@/lib/markets";
import { askPrice, bidPrice, cashOutValue } from "@/lib/lmsr";
import { maxStake } from "@/lib/economy";
import { tradeFee, tradeMargin } from "@/lib/markets";
import { findSimilar } from "@/lib/memory";
import { now } from "@/lib/clock";
import { SETTLE_WINDOW_MS } from "@/lib/safety";
import { isAdminUsername, MARKET } from "@/lib/config";
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
  // What the AI bookmaker pays to cash each side out right now.
  // Capped by the trade book: price moves from decay or the AI can't be cashed out.
  const bk = book(m);
  const tb = tradeBook(m);
  const cashOut = position
    ? {
        yes: position.yes_shares > 1e-6 ? cashOutValue(bk, tb, "yes", position.yes_shares, MARKET.vig) : null,
        no: position.no_shares > 1e-6 ? cashOutValue(bk, tb, "no", position.no_shares, MARKET.vig) : null,
      }
    : null;
  const people = await db.query<{ id: number; display_name: string; username: string; color: string }>(
    `SELECT id, display_name, username, color FROM users WHERE id = ANY($1::int[])`,
    [[m.creator_id, m.subject_id, m.proposed_by].filter(Boolean)]
  );
  const admin = isAdminUsername(user.username);
  const lockedSide: "yes" | "no" | null =
    m.kind === "bet" && position ? (position.yes_shares > 1e-6 ? "yes" : position.no_shares > 1e-6 ? "no" : null) : null;
  const { similar } = admin ? await findSimilar(db, m.group_id, m.title, m.subject_id) : { similar: [] };
  const [u] = await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [user.id]);
  const closed = isClosed(m);
  const buyVig = await tradeMargin(db, m, user.id);
  const vote = m.status === "open" && m.proposed_outcome != null ? await voteState(db, m) : null;
  const voters = vote ? await db.query<{ id: number; display_name: string; color: string }>(`SELECT id, display_name, color FROM users WHERE id = ANY($1::int[])`, [[...vote.confirms, ...vote.rejects]]) : [];
  const named = (ids: number[]) => ids.map((i) => voters.find((v) => v.id === i)).filter(Boolean);
  const isSubject = m.subject_id === user.id;
  const listerWaits = m.creator_id === user.id && !(await db.query(`SELECT 1 FROM trades WHERE market_id = $1 AND user_id <> $2 LIMIT 1`, [id, user.id])).length;
  const open = m.status === "open";
  const proposed = open && m.proposed_outcome != null;
  const [mine] = await db.query(`SELECT 1 FROM reports WHERE market_id = $1 AND reporter_id = $2`, [id, user.id]);
  const [myKey] = await db.query<{ wrapped_key: string; wrapper_public_key: string }>(
    `SELECT k.wrapped_key, w.public_key AS wrapper_public_key FROM group_keys k JOIN users w ON w.id = k.wrapped_by WHERE k.group_id = $1 AND k.user_id = $2`,
    [m.group_id, user.id]
  );
  return {
    // Only the admin is told which stakes are seeded demo history.
    // Only the admin gets the AI's full reasoning and the past results it was priced from.
    market: { ...m, sample: m.sample && isAdminUsername(user.username), price: price(m), closed, ai_rationale: admin ? m.ai_rationale : firstSentence(m.ai_rationale) },
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
          // The group's vote: it settles at `needed` confirmations and is dropped at `needed` rejections.
          votes: vote ? { needed: vote.needed, eligible: vote.eligible.length, confirms: named(vote.confirms), rejects: named(vote.rejects) } : null,
        }
      : null,
    // This member's copy of the chat key, to open (or encrypt) a photo of evidence on this page.
    myKey: myKey ?? null,
    ticks,
    candles,
    trades,
    position: position ? { ...position, cashOut } : null,
    // The AI bookmaker's two-way quote: what a share costs to buy and what it pays to sell, per side.
    // buyVig is this person's margin on their next buy: nothing on their first trade on a stock.
    quotes: { vig: MARKET.vig, buyVig, ask: { yes: askPrice(bk, "yes", buyVig), no: askPrice(bk, "no", buyVig) }, bid: { yes: bidPrice(bk, "yes", MARKET.vig), no: bidPrice(bk, "no", MARKET.vig) } },
    similar: admin ? similar.filter((s) => s.market_id !== m.id).map(({ embedding: _e, ...s }) => s) : [],
    me: {
      balance: u.balance,
      maxStake: maxStake(u.balance),
      canTrade: !closed && !(isSubject && m.kind === "bet") && !listerWaits,
      // Whoever posted it trades only once a friend has.
      listerWaits,
      // Bets are locked once placed, so you can add to your side but never switch or sell;
      // stocks can be bought and sold, with the margin after the first free trade.
      lockedSide,
      canLong: lockedSide !== "no",
      canShort: !isSubject && lockedSide !== "yes",
      canSell: m.kind === "stock",
      fee: await tradeFee(db, m, user.id),
      // Anyone in the chat can say what happened: early (YES, with evidence) or once the deadline passes.
      canResolve: open && !proposed,
      early: open && new Date(m.resolves_at) > now(),
      canConfirm: !!vote?.eligible.includes(user.id),
      myVote: vote?.confirms.includes(user.id) ? true : vote?.rejects.includes(user.id) ? false : null,
      canVeto: open && isSubject,
      canReport: m.creator_id !== user.id || isSubject,
      reported: !!mine,
      canResolveYes: true,
      // NO/Under can't be known before the deadline.
      canResolveNo: new Date(m.resolves_at) <= now(),
      // Confirming settles it at once when this result would cost you.
      wouldLose: !!vote?.losers.includes(user.id),
      isSubject,
    },
  };
});
