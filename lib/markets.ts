import crypto from "node:crypto";
import { getDb, type Q } from "./db";
import { aheadOfRealTime, now } from "./clock";
import { SAMPLE_GROUPS } from "./demo";

// On the admin's demo clock, deadlines only move in the sample chats the admin is in. Real chats,
// even ones the admin belongs to, stay on real time.
const demoClockGroups = (userParam: string) =>
  `group_id IN (SELECT gm.group_id FROM group_members gm JOIN groups gr ON gr.id = gm.group_id WHERE gm.user_id = ${userParam} AND ${SAMPLE_GROUPS})`;
import { ECONOMY, MARKET } from "./config";
import { sides } from "./labels";
import { analyzeSituation, repriceStocks, summarizeOutcome, embed, type Analysis } from "./ai";
import { evidenceFor, type Similar } from "./memory";
import { profileForPrompt, type ProfileAnswers } from "./profile-questions";
import { openingMaths, profileCommitment, saveRecord, sha256, traceFields } from "./pricing-record";
import type { Trace } from "./ai";
import { applyShares, bookAt, buyQuote, cashOutValue, hazardDecay, houseWorstLoss, marginFor, priceYes, recenter, type Book, type Side } from "./lmsr";
import { closeVault, credit, maxStake, recordNetWorth, mayCall } from "./economy";
import { HttpError, type User } from "./auth";
import { MAX_SNIPPETS, type Snippet } from "./chat-context";
import { STOCK_SNIPPETS } from "./ai-disclosure";
import { MATURITY_FALLBACK_HOURS, MATURITY_FALLBACK_MS, SETTLE_WINDOW_HOURS, SETTLE_WINDOW_MS, topicProblem, votesNeeded } from "./safety";

export type MarketRow = {
  id: number;
  group_id: number;
  creator_id: number;
  subject_id: number | null;
  kind: "bet" | "stock";
  answer: "yesno" | "number";
  line: number | null;
  unit: string;
  actual: number | null;
  decay: "none" | "hazard";
  fees_held: number;
  title: string;
  description: string;
  category: string;
  resolution_rule: string;
  ai_prob: number;
  base_rate: number | null;
  base_rate_n: number;
  open_prob: number;
  ai_rationale: string;
  /** The one-line reason everyone sees under the odds ('' on stakes from before it existed). */
  ai_summary: string;
  ai_source: string;
  b: number;
  q_yes: number;
  q_no: number;
  status: "open" | "resolved" | "void";
  outcome: boolean | null;
  /** A result someone has put forward; it settles once another member confirms or 24h pass. */
  proposed_outcome: boolean | null;
  proposed_by: number | null;
  proposed_at: Date | null;
  proposed_note: string;
  /** Put forward before the deadline with evidence: only a confirmation settles it, never the 24h timer. */
  proposed_early: boolean;
  /** A photo attached as evidence (encrypted with the chat's key). */
  proposed_evidence: number | null;
  /** Seeded demo history (scripts/seed-rich.ts); shown to the admin only. */
  sample: boolean;
  void_reason: "veto" | "dispute" | "reports" | "unclaimed" | null;
  created_at: Date;
  resolves_at: Date;
  resolved_at: Date | null;
  last_decay_at: Date;
  /** When the chat was told the deadline had arrived (null until then). */
  matured_notified_at: Date | null;
  volume: number;
  chat_context: { shared: number; used: (Snippet & { why: string })[] } | null;
  /** The book as real trades alone left it (null: same as q_yes/q_no). See schema-93-trade-book.sql. */
  t_yes: number | null;
  t_no: number | null;
  /** The one odds dispute a stake allows (schema-94-odds-dispute.sql): who, when, and what the AI said. */
  odds_disputed_by: number | null;
  odds_disputed_at: Date | null;
  odds_dispute: OddsDispute | null;
};

export type OddsDispute = { from: number; to: number; changed: boolean; note: string; aiProb: number; source: string };

export const book = (m: MarketRow): Book => ({ b: m.b, qYes: m.q_yes, qNo: m.q_no });
/** The book only real trades have moved: what cash-outs are capped by (decay and AI re-marks never touch it). */
export const tradeBook = (m: Pick<MarketRow, "b" | "q_yes" | "q_no" | "t_yes" | "t_no">): Book => ({ b: m.b, qYes: m.t_yes ?? m.q_yes, qNo: m.t_no ?? m.q_no });
export const price = (m: MarketRow) => (m.status === "resolved" ? (m.outcome ? 1 : 0) : priceYes(book(m)));
/** Trading stops at the resolve date, when a result is proposed, and for good once settled or voided. */
export const isClosed = (m: MarketRow) => m.status !== "open" || m.proposed_outcome != null || new Date(m.resolves_at) <= now();

export type SituationInput = {
  title: string;
  description?: string;
  resolvesAt: string;
  subjectUsername?: string | null;
  mood?: number | null;
  chatSnippets?: Snippet[];
  kind?: "auto" | "bet" | "stock";
  answer?: "auto" | "yesno" | "number";
  line?: number;
};

async function subjectFor(q: Q, groupId: number, username?: string | null, creatorId?: number) {
  if (!username) return null;
  // A guest in a sample chat isn't one of its people, so situations there can only be about them if they post them.
  const [u] = await q.query<{ id: number; display_name: string; username: string; subject_policy: string }>(
    `SELECT u.id, u.display_name, u.username, u.subject_policy FROM users u JOIN group_members gm ON gm.user_id = u.id
     WHERE gm.group_id = $1 AND u.username = $2 AND (NOT gm.guest OR u.id = $3)`,
    [groupId, username.replace(/^@/, "").toLowerCase(), creatorId ?? null]
  );
  if (!u) throw new HttpError(400, `@${username} isn't in this group`);
  return u;
}

/** The subject, after checking they're in the group and haven't opted out (people can always post about themselves). */
async function consentedSubject(q: Q, groupId: number, username: string | null | undefined, creatorId?: number) {
  const u = await subjectFor(q, groupId, username, creatorId);
  if (u && u.subject_policy === "nobody" && u.id !== creatorId) throw new HttpError(400, `${u.display_name} has turned off stakes about them`);
  return u ? { id: u.id, display_name: u.display_name, username: u.username } : null;
}

// Preview and create share one Gemma call: the analysis is cached briefly by input.
const g = globalThis as unknown as { __fsPreview?: Map<string, { at: number; value: Preview }> };
const previewCache = (g.__fsPreview ??= new Map());

export type Preview = {
  analysis: Analysis;
  openProb: number;
  baseRate: number | null;
  baseRateN: number;
  /** What the AI had besides general knowledge, and how much of it (below 1 is a cold start). */
  signals: { profile: boolean; chat: number };
  evidence: number;
  similar: Pick<Similar, "id" | "title" | "outcome" | "summary" | "similarity" | "flipped" | "ai_prob" | "crowd_prob" | "created_at">[];
  subject: { id: number; display_name: string; username: string } | null;
  vector: number[] | null;
  /** Exactly what this request sent to the AI from the chat, as picked and redacted on the poster's phone. */
  chatShared: Snippet[];
  /** Everything else the AI was given, for the pricing record. */
  inputs: { groupContext: string; mood: number | null; subjectRecord: string | null; profile: ReturnType<typeof profileCommitment> };
};

export async function previewSituation(groupId: number, input: SituationInput, creatorId?: number): Promise<Preview> {
  const title = input.title.trim();
  if (title.length < 4) throw new HttpError(400, "Describe the stake in a few words");
  const banned = topicProblem(title, input.description);
  if (banned) throw new HttpError(400, banned);
  const resolvesAt = new Date(input.resolvesAt);
  if (!(resolvesAt.getTime() > now().getTime())) throw new HttpError(400, "Resolve date must be in the future");
  // Consent is checked on every call, including cache hits: the subject may have opted out since.
  const db = await getDb();
  const subject = await consentedSubject(db, groupId, input.subjectUsername, creatorId);
  const key = crypto.createHash("sha1").update(JSON.stringify([groupId, title, input.description, input.resolvesAt, input.subjectUsername, input.mood, input.chatSnippets, input.kind, input.answer, input.line])).digest("hex");
  const hit = previewCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;

  const [grp] = await db.query<{ ai_context: string }>(`SELECT ai_context FROM groups WHERE id = $1`, [groupId]);
  // Chat reading is always on (lib/ai-disclosure.ts says so to users); the cap is enforced here too.
  const chatShared = (input.chatSnippets ?? []).slice(0, MAX_SNIPPETS);
  const { history, similar, vector } = await evidenceFor(db, groupId, title, subject?.id ?? null);
  const [prof] = subject ? await db.query<{ answers: ProfileAnswers }>(`SELECT answers FROM profiles WHERE user_id = $1`, [subject.id]) : [];
  const subjectProfile = profileForPrompt(prof?.answers);
  const analysis = await analyzeSituation({
    title,
    description: input.description ?? "",
    resolvesAt,
    now: now(),
    subjectName: subject?.display_name ?? null,
    subjectProfile,
    groupContext: grp?.ai_context ?? "",
    mood: input.mood ?? null,
    history,
    snippets: chatShared,
    want: { kind: input.kind, answer: input.answer, line: input.line },
  });
  // The poster asked for a number but nothing numeric came back: say so instead of quietly listing a yes/no.
  if (input.answer === "number" && analysis.answer !== "number") throw new HttpError(400, "Couldn't work out a line for that. Type one under \"The line\" and try again.");
  // The AI already saw the base rate; we still blend a little so history keeps a direct vote.
  const signals = { profile: !!subjectProfile, chat: chatShared.length };
  const { openProb, evidence } = openingMaths(analysis.probability, history.baseRate, history.n, signals);
  const value: Preview = {
    analysis,
    openProb,
    signals,
    evidence,
    baseRate: history.baseRate,
    baseRateN: history.n,
    similar: similar.map(({ id, title, outcome, summary, similarity, flipped, ai_prob, crowd_prob, created_at }) => ({ id, title, outcome, summary, similarity, flipped, ai_prob, crowd_prob, created_at })),
    subject,
    vector,
    chatShared,
    inputs: { groupContext: grp?.ai_context ?? "", mood: input.mood ?? null, subjectRecord: history.subjectRecord ?? null, profile: profileCommitment(subjectProfile) },
  };
  previewCache.set(key, { at: Date.now(), value });
  return value;
}

async function systemMessage(q: Q, groupId: number, kind: string, body: string, marketId: number | null, userId: number | null) {
  await q.query(`INSERT INTO messages (group_id, user_id, kind, body, market_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
    groupId,
    userId,
    kind,
    body,
    marketId,
    now(),
  ]);
}

export async function createMarket(user: User, groupId: number, input: SituationInput) {
  const p = await previewSituation(groupId, input, user.id);
  const db = await getDb();
  const a = p.analysis;
  // Little to go on: a thinner book, so the first few trades can correct the opening price.
  const b = (a.kind === "stock" ? MARKET.stockLiquidity : MARKET.betLiquidity) * (p.evidence < 1 ? MARKET.lowDataLiquidity : 1);
  const bk = bookAt(b, p.openProb);
  const ts = now();
  const id = await db.tx(async (q) => {
    const [m] = await q.query<{ id: number }>(
      `INSERT INTO markets (group_id, creator_id, subject_id, kind, decay, title, description, category, resolution_rule,
        ai_prob, base_rate, base_rate_n, open_prob, ai_rationale, ai_source, b, q_yes, q_no, created_at, resolves_at, last_decay_at, chat_context, answer, line, unit, evidence, ai_summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$19,$21,$22,$23,$24,$25,$26) RETURNING id`,
      [groupId, user.id, p.subject?.id ?? null, a.kind, a.decay, a.title, input.description ?? "", a.category, a.resolutionRule,
        a.probability, p.baseRate, p.baseRateN, p.openProb, a.rationale, a.source, b, bk.qYes, bk.qNo, ts, new Date(input.resolvesAt),
        p.chatShared.length ? JSON.stringify({ shared: p.chatShared.length, used: a.chatUsed }) : null, a.answer, a.line, a.unit, p.evidence, a.summary]
    );
    await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'open')`, [m.id, ts, p.openProb]);
    const { trace: _trace, ...parsed } = a;
    const hash = await saveRecord(q, groupId, [m.id], "open", {
      market: m.id,
      ...traceFields(a.trace),
      inputs: {
        situation: input.title,
        details: input.description ?? "",
        resolvesAt: input.resolvesAt,
        subject: p.subject ? `@${p.subject.username}` : null,
        posterAsked: { kind: input.kind ?? "auto", answer: input.answer ?? "auto", line: input.line ?? null },
        groupContext: p.inputs.groupContext,
        chatMood: p.inputs.mood,
        chatSnippets: p.chatShared,
        history: { baseRate: p.baseRate, effectiveSamples: p.baseRateN, subjectRecord: p.inputs.subjectRecord, similar: p.similar.map((x) => ({ title: x.title, outcome: x.outcome, similarity: +x.similarity.toFixed(3), ...(x.flipped ? { flipped: true } : {}) })) },
        subjectProfile: p.inputs.profile,
      },
      parsed,
      maths: { ...openingMaths(a.probability, p.baseRate, p.baseRateN, p.signals), liquidity: b },
    }, ts);
    await systemMessage(q, groupId, "market", `${a.kind === "stock" ? "listed a stock" : "opened a bet"}: ${a.title}`, m.id, user.id);
    await q.query(`INSERT INTO chain_ops (kind, market_id, memo, created_at) VALUES ('memo', $1, $2, $3)`, [
      m.id,
      // h: the full pricing record. t: just the terms anyone in the chat can check against the stake page.
      JSON.stringify({ app: "friendstakes", v: 1, ev: "open", market: m.id, group: groupId, kind: a.kind, p: +p.openProb.toFixed(4), resolves: input.resolvesAt.slice(0, 10), h: hash, t: termsHash({ id: m.id, title: a.title, resolution_rule: a.resolutionRule, resolves_at: new Date(input.resolvesAt), kind: a.kind, answer: a.answer, line: a.line, unit: a.unit, creator_id: user.id, subject_id: p.subject?.id ?? null }) }),
      ts,
    ]);
    return m.id;
  });
  return id;
}

export async function getMarket(q: Q, id: number) {
  const [m] = await q.query<MarketRow>(`SELECT * FROM markets WHERE id = $1`, [id]);
  if (!m) throw new HttpError(404, "Market not found");
  return m;
}

export async function trade(user: User, marketId: number, input: { side: Side; action: "buy" | "sell"; amount: number }, opts: { bot?: boolean } = {}) {
  const db = await getDb();
  const result = await db.tx(async (q) => {
    const [m] = await q.query<MarketRow>(`SELECT * FROM markets WHERE id = $1 FOR UPDATE`, [marketId]);
    if (!m) throw new HttpError(404, "Market not found");
    const [member] = await q.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [m.group_id, user.id]);
    if (!member) throw new HttpError(403, "You're not in this group");
    if (m.status === "void") throw new HttpError(400, "This stake was called off");
    if (m.status === "open" && m.proposed_outcome != null) throw new HttpError(400, "A result has been proposed, so trading is closed");
    if (isClosed(m)) throw new HttpError(400, "Trading has closed on this one");
    if (m.subject_id === user.id) {
      if (m.kind === "bet") throw new HttpError(400, "You can't bet on a stake about yourself");
      if (input.side === "no" && input.action === "buy") throw new HttpError(400, "You can only go long on yourself. Invest in yourself!");
    }
    // Whoever posted it chose the question, so they may know the answer before the AI's price does.
    // They can join in once a friend has traded it, which also means a friend is on the other end.
    if (m.creator_id === user.id && input.action === "buy") {
      const [other] = await q.query(`SELECT 1 FROM trades WHERE market_id = $1 AND user_id <> $2 LIMIT 1`, [marketId, user.id]);
      if (!other) throw new HttpError(400, "You posted this one, so let a friend trade it first. You can join in after.");
    }
    // A bet is a bet: once placed it rides to the result. Stocks can be traded until maturity.
    if (m.kind === "bet" && input.action === "sell") throw new HttpError(400, "A bet is locked once placed. It pays out when the result is in.");
    if (m.kind === "bet") {
      const [held] = await q.query<{ yes_shares: number; no_shares: number }>(`SELECT yes_shares, no_shares FROM positions WHERE market_id = $1 AND user_id = $2`, [marketId, user.id]);
      const other = input.side === "yes" ? held?.no_shares : held?.yes_shares;
      if (other && other > 1e-6) throw new HttpError(400, `You're already on ${input.side === "yes" ? sides(m).no : sides(m).yes}. A bet is locked once placed, so you can't switch sides.`);
    }
    // Whoever disputed the odds waits a little before trading them, so a dispute can't be used to
    // move the price and then trade straight into the move.
    if (m.odds_disputed_by === user.id && m.odds_disputed_at && now().getTime() - new Date(m.odds_disputed_at).getTime() < ODDS_DISPUTE_TRADE_WAIT_MS) {
      const from = new Date(new Date(m.odds_disputed_at).getTime() + ODDS_DISPUTE_TRADE_WAIT_MS);
      throw new HttpError(400, `You disputed these odds, so you can trade this one from ${from.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}.`);
    }
    const [paused] = await q.query(`SELECT 1 FROM groups WHERE id = $1 AND repricing_until > now()`, [m.group_id]);
    if (paused) throw new HttpError(409, "The AI is re-marking this chat's stocks. Try again in a moment.");
    const [u] = await q.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
    const fee = await tradeFee(q, m, user.id);
    const vig = await tradeMargin(q, m, user.id);
    const before = priceYes(book(m));
    let bk = book(m);
    let shares: number, coins: number;
    if (input.action === "buy") {
      coins = Math.round(input.amount * 100) / 100;
      const cap = maxStake(u.balance);
      if (!(coins >= ECONOMY.minTrade)) throw new HttpError(400, `Minimum trade is ${ECONOMY.minTrade}`);
      if (coins > cap + 1e-9)
        throw new HttpError(400, `Max trade right now is ${cap.toFixed(2)} (${ECONOMY.maxStakeFraction * 100}% of balance, keeping ${ECONOMY.balanceFloor} safe)`);
      if (fee > 0 && u.balance - coins - fee < ECONOMY.balanceFloor - 1e-9) throw new HttpError(400, `That plus the ${fee} fee would take you under the ${ECONOMY.balanceFloor} safety floor`);
      // The AI bookmaker keeps its margin: only the rest of the stake buys shares.
      shares = buyQuote(bk, input.side, coins, vig).shares;
      // And it stops taking a side once it could lose more than its limit on this market.
      const [house] = await q.query<{ yes: number; no: number; collected: number }>(
        `SELECT coalesce(sum(yes_shares), 0)::float8 AS yes, coalesce(sum(no_shares), 0)::float8 AS no, coalesce(sum(spent), 0)::float8 AS collected
         FROM positions WHERE market_id = $1`,
        [marketId]
      );
      const worst = houseWorstLoss(house.yes + (input.side === "yes" ? shares : 0), house.no + (input.side === "no" ? shares : 0), house.collected + coins);
      if (worst > MARKET.houseRisk * m.b + 1e-9)
        throw new HttpError(400, `The AI bookmaker has taken all it will on ${input.side === "yes" ? sides(m).yes : sides(m).no} here. Try a smaller stake or the other side.`);
      bk = applyShares(bk, input.side, shares);
    } else {
      const [pos] = await q.query<{ yes_shares: number; no_shares: number }>(
        `SELECT yes_shares, no_shares FROM positions WHERE market_id = $1 AND user_id = $2`,
        [marketId, user.id]
      );
      const held = pos ? (input.side === "yes" ? pos.yes_shares : pos.no_shares) : 0;
      shares = Math.min(input.amount, held);
      if (!(shares > 1e-6)) throw new HttpError(400, "No shares to sell");
      // Cashing out pays the bookmaker's buy-back price less its margin.
      // Capped by the trade book, so a price move made by decay or the AI can't be cashed out.
      coins = Math.floor(cashOutValue(bk, tradeBook(m), input.side, shares, vig) * 100) / 100;
      // Without this, tiny sells that return almost nothing still pay the fee and push you under the floor.
      if (fee > 0 && u.balance + coins - fee < ECONOMY.balanceFloor - 1e-9) throw new HttpError(400, `That sale doesn't cover the ${fee} fee without taking you under the ${ECONOMY.balanceFloor} safety floor`);
      bk = applyShares(bk, input.side, -shares);
    }
    const after = priceYes(bk);
    const ts = now();
    // Real trades move both books by the same shares.
    const tb = applyShares(tradeBook(m), input.side, input.action === "buy" ? shares : -shares);
    await q.query(`UPDATE markets SET q_yes = $2, q_no = $3, t_yes = $5, t_no = $6, volume = volume + $4 WHERE id = $1`, [marketId, bk.qYes, bk.qNo, coins, tb.qYes, tb.qNo]);
    const sign = input.action === "buy" ? 1 : -1;
    await q.query(
      `INSERT INTO positions (market_id, user_id, yes_shares, no_shares, spent) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (market_id, user_id) DO UPDATE SET yes_shares = positions.yes_shares + EXCLUDED.yes_shares,
         no_shares = positions.no_shares + EXCLUDED.no_shares, spent = positions.spent + EXCLUDED.spent`,
      [marketId, user.id, input.side === "yes" ? sign * shares : 0, input.side === "no" ? sign * shares : 0, sign * coins]
    );
    await q.query(
      `INSERT INTO trades (market_id, user_id, side, action, shares, coins, price_before, price_after, created_at, bot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [marketId, user.id, input.side, input.action, shares, coins, before, after, ts, !!opts.bot]
    );
    await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'trade')`, [marketId, ts, after]);
    await credit(q, user.id, input.action === "buy" ? -coins : coins, `${input.action} ${input.side === "yes" ? "long" : "short"} · ${m.title}`, marketId);
    if (fee > 0) {
      await credit(q, user.id, -fee, `Trading fee · ${m.title}`, marketId);
      await q.query(`UPDATE markets SET fees_held = fees_held + $2 WHERE id = $1`, [marketId, fee]);
      await q.query(`UPDATE positions SET fees_paid = fees_paid + $3 WHERE market_id = $1 AND user_id = $2`, [marketId, user.id, fee]);
    }
    const verb = input.action === "buy" ? (input.side === "yes" ? "went long" : "went short") : `sold ${input.side === "yes" ? "long" : "short"}`;
    await systemMessage(q, m.group_id, "trade", `${verb} ${coins.toFixed(0)} · ${(before * 100).toFixed(0)}% → ${(after * 100).toFixed(0)}%`, marketId, user.id);
    return { shares, coins, before, after, fee, vig };
  });
  return result;
}

/** The bookmaker's margin on this trader's next trade: none on their first trade on a stock, MARKET.vig after that and on bets. */
export async function tradeMargin(q: Q, m: MarketRow, userId: number) {
  const [{ n }] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM trades WHERE market_id = $1 AND user_id = $2`, [m.id, userId]);
  return marginFor(m.kind, n, MARKET.vig, ECONOMY.freeTrades);
}

/** The fee this trader's next trade on the market pays: nothing on bets, nothing for the lister, nothing for the first free trades. */
export async function tradeFee(q: Q, m: MarketRow, userId: number) {
  if (m.kind !== "stock" || m.creator_id === userId) return 0;
  const [{ n }] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM trades WHERE market_id = $1 AND user_id = $2`, [m.id, userId]);
  return n >= ECONOMY.freeTrades ? ECONOMY.stockFee : 0;
}

/** An early "it happened", or a result nobody would lose to, needs evidence: a photo, or a note at least this long. */
export const EVIDENCE_MIN_CHARS = 10;

/**
 * Who may put a result forward: anyone in the chat, including the person it's about and people who
 * bet on it. Whoever knows what happened says so; the protection is in who has to agree (voteState).
 * Before the deadline only "it already happened" (YES) can be known, and it needs evidence.
 */
export function assertCanPropose(m: MarketRow, user: User, outcome?: boolean, evidence = false) {
  const past = new Date(m.resolves_at) <= now();
  if (past) return;
  if (outcome === false) throw new HttpError(400, `Before the deadline it can only be called ${sides(m).yes}. ${sides(m).no} isn't known until it closes.`);
  if (!evidence) throw new HttpError(400, "Before the deadline you need evidence: say what happened, or add a photo, so the others can check it");
}

async function assertMember(q: Q, groupId: number, userId: number) {
  const [member] = await q.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
  if (!member) throw new HttpError(403, "You're not in this group");
}

function assertOpen(m: MarketRow) {
  if (m.status === "void") throw new HttpError(400, "This stake was called off");
  if (m.status !== "open") throw new HttpError(400, "Already resolved");
}

/**
 * Finalises a result immediately. The API no longer calls this directly (results are proposed and
 * confirmed by a second member); it stays as the finaliser for the confirm path, the 24-hour timer
 * and the seed script.
 */
export async function resolveMarket(user: User, marketId: number, outcome: boolean, note = "", opts: { waitForMemory?: boolean } = {}) {
  const db = await getDb();
  const m = await getMarket(db, marketId);
  assertOpen(m);
  assertCanPropose(m, user, outcome);
  await assertMember(db, m.group_id, user.id);
  return settle(m, outcome, note, user.id, { ...opts, caller: user.id });
}

/** `caller`, when set, is the person whose say-so settles it now; they mustn't gain from this outcome (see callableBy). */
async function settle(m: MarketRow, outcome: boolean, note: string, actorId: number | null, opts: { waitForMemory?: boolean; suffix?: string; caller?: number; votes?: VoteState } = {}) {
  const marketId = m.id;
  const db = await getDb();
  const crowd = priceYes(book(m));
  const payouts = await db.tx(async (q) => {
    const done = await q.query(
      `UPDATE markets SET status = 'resolved', outcome = $2, resolved_at = $3 WHERE id = $1 AND status = 'open' RETURNING id`,
      [marketId, outcome, now()]
    );
    if (!done.length) throw new HttpError(400, "Already resolved");
    const positions = await q.query<{ user_id: number; yes_shares: number; no_shares: number; spent: number }>(
      `SELECT user_id, yes_shares, no_shares, spent FROM positions WHERE market_id = $1`,
      [marketId]
    );
    // Checked under the market row lock, so nobody can buy in between and then resolve their own way.
    if (opts.caller != null) assertMayCall(await callableBy(q, m, opts.caller), outcome);
    // One person alone was only ever betting against the house on a result their friends decide,
    // so it pays nothing: they get their stake back. (Murat's rule from fair-settling-group-wallets.)
    const [{ n: traders }] = await q.query<{ n: number }>(`SELECT count(DISTINCT user_id)::int AS n FROM trades WHERE market_id = $1`, [marketId]);
    const lonely = traders > 0 && traders < 2;
    const out: { user_id: number; payout: number; pnl: number }[] = [];
    for (const p of positions) {
      const payout = lonely ? Math.max(0, p.spent) : outcome ? p.yes_shares : p.no_shares;
      if (payout > 0.005) await credit(q, p.user_id, payout, `${lonely ? "Refund (only one trader)" : "Payout"} · ${m.title}`, marketId);
      else await recordNetWorth(q, p.user_id);
      out.push({ user_id: p.user_id, payout, pnl: payout - p.spent });
    }
    // Trading fees held on a stock go to whoever listed it, now that it has matured.
    const [held] = await q.query<{ fees_held: number }>(`UPDATE markets SET fees_held = 0 WHERE id = $1 AND fees_held > 0 RETURNING fees_held`, [marketId]);
    if (held && m.fees_held >= 0.01) await credit(q, m.creator_id, m.fees_held, `Listing fees · ${m.title}`, marketId);
    await closeVault(q, marketId, `Stake settled · #${marketId}`);
    await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'resolve')`, [marketId, now(), outcome ? 1 : 0]);
    // The settlement goes on the chain as a hash of who called it, who confirmed it, how, and the evidence's encrypted bytes.
    const [proof] = m.proposed_evidence ? await q.query<{ data: Uint8Array }>(`SELECT data FROM attachments WHERE id = $1`, [m.proposed_evidence]) : [];
    const settled = await saveRecord(q, m.group_id, [marketId], "settle", {
      market: marketId,
      outcome,
      how: opts.suffix ?? "settled",
      note,
      proposedBy: m.proposed_by,
      calledBy: opts.caller ?? null,
      // Account numbers only. On the chain this whole record is just its hash.
      votes: opts.votes ? { confirmedBy: opts.votes.confirms, rejectedBy: opts.votes.rejects, eligible: opts.votes.eligible.length, needed: opts.votes.needed } : null,
      evidence: proof ? sha256(Buffer.from(proof.data).toString("base64")) : null,
      crowd: +crowd.toFixed(4),
      terms: termsHash(m),
    }, now());
    const extra = [note, opts.suffix, lonely ? "only one person traded it, so everyone got their money back" : ""].filter(Boolean).join(" · ");
    await systemMessage(q, m.group_id, "resolution", `resolved ${(outcome ? sides(m).yes : sides(m).no).toUpperCase()}: ${m.title}${extra ? ` (${extra})` : ""}`, marketId, actorId);
    await q.query(`INSERT INTO chain_ops (kind, market_id, memo, created_at) VALUES ('memo', $1, $2, $3)`, [
      marketId,
      JSON.stringify({ app: "friendstakes", v: 1, ev: "resolve", market: marketId, outcome, crowd: +crowd.toFixed(4), ...(opts.votes ? { votes: `${opts.votes.confirms.length}/${opts.votes.eligible.length}` } : {}), h: settled }),
      now(),
    ]);
    return out;
  });

  // Write the memory outside the transaction: Gemma can take a second.
  const memory = rememberOutcome(m, outcome, crowd, payouts, note).catch((e) => console.warn("[memory]", e));
  if (opts.waitForMemory) await memory;
  return { payouts };
}

/**
 * A stake's terms as a hash: the question, how it settles, the deadline, its type and line, who
 * posted it and who it's about (as account numbers). The opening memo carries it, and so do the
 * settlement and void records, so the chain shows a stake settled on the terms it opened with.
 */
export function termsHash(m: Pick<MarketRow, "id" | "title" | "resolution_rule" | "resolves_at" | "kind" | "answer" | "line" | "unit" | "creator_id" | "subject_id">) {
  return sha256(JSON.stringify({ market: m.id, title: m.title, rule: m.resolution_rule, resolves: new Date(m.resolves_at).toISOString(), kind: m.kind, answer: m.answer, line: m.line ?? null, unit: m.unit ?? "", creator: m.creator_id, subject: m.subject_id ?? null }));
}

/** Step one of fair settling: put a result forward. It settles when another member confirms, or after 24 hours. */
export async function proposeResult(user: User, marketId: number, result: boolean | { value: number }, note = "", evidenceId: number | null = null) {
  const db = await getDb();
  return db.tx(async (q) => {
    const [m] = await q.query<MarketRow>(`SELECT * FROM markets WHERE id = $1 FOR UPDATE`, [marketId]);
    if (!m) throw new HttpError(404, "Market not found");
    assertOpen(m);
    // What the proposer wrote themselves: only this counts as evidence, not the "Actual: …" line added below.
    const said = note.trim();
    // A number question is settled by the number itself; "over the line" is the YES side.
    let outcome: boolean;
    if (typeof result === "boolean") {
      if (m.answer === "number") throw new HttpError(400, "This one settles on a number. Enter what it actually was.");
      outcome = result;
    } else {
      if (m.answer !== "number" || m.line == null) throw new HttpError(400, "This one settles yes or no");
      outcome = result.value > m.line;
      note = [`Actual: ${result.value}${m.unit ? ` ${m.unit}` : ""}`, note].filter(Boolean).join(" · ");
      await q.query(`UPDATE markets SET actual = $2 WHERE id = $1`, [marketId, result.value]);
    }
    if (m.proposed_outcome != null) throw new HttpError(400, "A result has already been proposed. Another member needs to confirm or dispute it.");
    if (evidenceId != null) {
      const [photo] = await q.query(`SELECT 1 FROM attachments WHERE id = $1 AND group_id = $2 AND owner_id = $3 AND kind = 'image'`, [evidenceId, m.group_id, user.id]);
      if (!photo) throw new HttpError(400, "Upload the photo to this chat first");
    }
    const early = new Date(m.resolves_at) > now();
    const evidence = evidenceId != null || said.length >= EVIDENCE_MIN_CHARS;
    assertCanPropose(m, user, outcome, evidence);
    await assertMember(q, m.group_id, user.id);
    // When nobody who bet would lose to this result (everyone backed it), there's nobody with a
    // reason to object, so the claim has to come with evidence, early or not.
    if (!evidence && !(await hasLosers(q, m.id, outcome)))
      throw new HttpError(400, "Everyone who bet backed this result, so add evidence: say what happened, or add a photo");
    await q.query(
      `UPDATE markets SET proposed_outcome = $2, proposed_by = $3, proposed_at = $4, proposed_note = $5, proposed_early = $6, proposed_evidence = $7 WHERE id = $1`,
      [marketId, outcome, user.id, now(), note.slice(0, 200), early, evidenceId]
    );
    await q.query(`DELETE FROM stake_votes WHERE market_id = $1`, [marketId]);
    await systemMessage(
      q,
      m.group_id,
      "system",
      early
        ? `says “${m.title}” already happened${evidenceId != null ? " and added a photo" : ""}. It settles once most of the group checks the evidence and confirms it`
        : `proposed ${(outcome ? sides(m).yes : sides(m).no).toUpperCase()} for “${m.title}”. Anyone it doesn't pay can confirm or dispute it; it needs a confirmation within 24 hours, or it lapses as if nobody called it`,
      marketId,
      user.id
    );
    return { proposed: outcome, early };
  });
}

export type VoteState = { eligible: number[]; losers: number[]; needed: number; confirms: number[]; rejects: number[] };

/** How much more a position pays if the market settles this way rather than the other. */
const edge = (p: { yes_shares: number | null; no_shares: number | null }, outcome: boolean) => {
  const d = (p.yes_shares ?? 0) - (p.no_shares ?? 0);
  return outcome ? d : -d;
};

/** Whether anyone holding a position would lose if the market settled this way. */
async function hasLosers(q: Q, marketId: number, outcome: boolean) {
  const rows = await q.query<{ yes_shares: number; no_shares: number }>(`SELECT yes_shares, no_shares FROM positions WHERE market_id = $1`, [marketId]);
  return rows.some((p) => edge(p, outcome) < -0.005);
}

/**
 * Who may vote on the proposed result and how the vote stands. Voters are the chat's own members
 * (not quiet guests) other than the proposer whom the result wouldn't pay; that includes the person
 * it's about. `losers` are the voters it would cost: one of them agreeing settles it at once.
 */
export async function voteState(q: Q, m: MarketRow): Promise<VoteState> {
  if (m.proposed_outcome == null) return { eligible: [], losers: [], needed: 0, confirms: [], rejects: [] };
  const rows = await q.query<{ user_id: number; guest: boolean; yes_shares: number | null; no_shares: number | null }>(
    `SELECT gm.user_id, gm.guest, p.yes_shares, p.no_shares FROM group_members gm
     LEFT JOIN positions p ON p.market_id = $2 AND p.user_id = gm.user_id WHERE gm.group_id = $1`,
    [m.group_id, m.id]
  );
  const voters = rows.filter((r) => !r.guest && r.user_id !== m.proposed_by && edge(r, m.proposed_outcome!) <= 0.005);
  const eligible = voters.map((r) => r.user_id);
  const losers = voters.filter((r) => edge(r, m.proposed_outcome!) < -0.005).map((r) => r.user_id);
  const votes = await q.query<{ user_id: number; confirm: boolean }>(`SELECT user_id, confirm FROM stake_votes WHERE market_id = $1 ORDER BY created_at`, [m.id]);
  const counted = votes.filter((v) => eligible.includes(v.user_id));
  return {
    eligible,
    losers,
    needed: votesNeeded(eligible.length),
    confirms: counted.filter((v) => v.confirm).map((v) => v.user_id),
    rejects: counted.filter((v) => !v.confirm).map((v) => v.user_id),
  };
}

/** Drops a proposed result: its votes go, and trading opens again if the deadline hasn't passed. */
async function clearProposal(q: Q, m: MarketRow, text: string, actorId: number | null) {
  const [cleared] = await q.query(
    `UPDATE markets SET proposed_outcome = NULL, proposed_by = NULL, proposed_at = NULL, proposed_note = '', proposed_early = false, proposed_evidence = NULL
      WHERE id = $1 AND status = 'open' AND proposed_outcome IS NOT NULL RETURNING id`,
    [m.id]
  );
  if (!cleared) return false;
  await q.query(`DELETE FROM stake_votes WHERE market_id = $1`, [m.id]);
  await systemMessage(q, m.group_id, "system", text, m.id, actorId);
  return true;
}

const tally = (v: VoteState) => ({ confirm: v.confirms.length, reject: v.rejects.length, eligible: v.eligible.length, needed: v.needed });

/**
 * One member's vote on the proposed result. It settles at once if someone it costs confirms it (the
 * strongest proof there is), or once most of the voters do; once most reject it, the claim is
 * dropped (and trading opens again if the deadline hasn't passed). With no confirmation by the time the
 * window ends, the claim lapses as if nobody called it (finaliseProposals). A member can change their vote until it's decided.
 */
export async function voteOnResult(user: User, marketId: number, confirm: boolean) {
  const db = await getDb();
  const out = await db.tx(async (q) => {
    const [m] = await q.query<MarketRow>(`SELECT * FROM markets WHERE id = $1 FOR UPDATE`, [marketId]);
    if (!m) throw new HttpError(404, "Market not found");
    assertOpen(m);
    if (m.proposed_outcome == null) throw new HttpError(400, "Nobody has proposed a result yet");
    if (m.proposed_by === user.id) throw new HttpError(403, "You proposed this result, so another member has to review it");
    await assertMember(q, m.group_id, user.id);
    const before = await voteState(q, m);
    if (!before.eligible.includes(user.id)) {
      const [g] = await q.query<{ guest: boolean }>(`SELECT guest FROM group_members WHERE group_id = $1 AND user_id = $2`, [m.group_id, user.id]);
      if (g?.guest) throw new HttpError(403, "Only the chat's own members vote on results");
      throw new HttpError(403, "You'd gain from this result, so the friends who wouldn't gain vote on it");
    }
    await q.query(
      `INSERT INTO stake_votes (market_id, user_id, confirm, created_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (market_id, user_id) DO UPDATE SET confirm = EXCLUDED.confirm, created_at = EXCLUDED.created_at`,
      [marketId, user.id, confirm, now()]
    );
    const v = await voteState(q, m);
    if (v.rejects.length >= v.needed) {
      const reopen = new Date(m.resolves_at) > now();
      await clearProposal(q, m, `Most of the group rejected that “${m.title}” ${m.proposed_early && reopen ? "has happened yet" : `went ${(m.proposed_outcome ? sides(m).yes : sides(m).no).toUpperCase()}`} (${v.rejects.length} of ${v.eligible.length}), so the claim was dropped${reopen ? " and trading is open again" : ""}`, null);
      return { m, v, decided: "dropped" as const };
    }
    await systemMessage(q, m.group_id, "system", `${confirm ? "confirmed" : "rejected"} the result: ${v.confirms.length} of ${v.needed} confirmations needed`, marketId, user.id);
    const conceded = confirm && v.losers.includes(user.id);
    return { m, v, decided: conceded || v.confirms.length >= v.needed ? ("settle" as const) : null };
  });
  if (out.decided === "settle")
    await settle(out.m, out.m.proposed_outcome!, out.m.proposed_note, null, { suffix: `${out.v.confirms.length} of ${out.v.eligible.length} confirmed`, votes: out.v }).catch((e) => {
      if (!(e instanceof HttpError)) throw e;
    });
  return { ...tally(out.v), decided: out.decided === "settle" ? "settled" : out.decided };
}

export const confirmResult = (user: User, marketId: number) => voteOnResult(user, marketId, true);
export const disputeResult = (user: User, marketId: number) => voteOnResult(user, marketId, false);

/** The person a situation is about can call it off any time before it settles. Idempotent. */
export async function vetoMarket(user: User, marketId: number) {
  const db = await getDb();
  const m = await getMarket(db, marketId);
  if (m.subject_id !== user.id) throw new HttpError(403, "Only the person it's about can call it off");
  if (m.status === "void") return { voided: false, already: true };
  if (m.status !== "open") throw new HttpError(400, "It's already settled, so it's too late to call it off");
  return voidMarket(marketId, { reason: "veto", actorId: user.id, text: `called this one off: “${m.title}”. Everyone was refunded` });
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Voids an open situation and gives every holder back exactly what they net spent (buys minus
 * sells), through credit() so the Solana mirror stays in step. Positions are zeroed. Safe to call
 * twice: only the call that flips the status refunds anyone.
 */
export async function voidMarket(marketId: number, opts: { reason: "veto" | "dispute" | "reports" | "unclaimed"; actorId: number | null; text: string }) {
  const db = await getDb();
  return db.tx(async (q) => {
    const [m] = await q.query<MarketRow>(`SELECT * FROM markets WHERE id = $1 FOR UPDATE`, [marketId]);
    if (!m) throw new HttpError(404, "Market not found");
    if (m.status !== "open") return { voided: false, refunded: 0 };
    const ts = now();
    await q.query(`UPDATE markets SET status = 'void', void_reason = $2, resolved_at = $3 WHERE id = $1`, [marketId, opts.reason, ts]);
    const positions = await q.query<{ user_id: number; spent: number; fees_paid: number }>(`SELECT user_id, spent, fees_paid FROM positions WHERE market_id = $1 ORDER BY user_id`, [marketId]);
    let refunded = 0;
    for (const p of positions) {
      // Fees come back too: nothing matured, so the lister earned nothing.
      const refund = round2(p.spent + p.fees_paid);
      if (Math.abs(refund) >= 0.01) {
        await credit(q, p.user_id, refund, `Refund · ${m.title}`, marketId);
        refunded++;
      } else await recordNetWorth(q, p.user_id);
    }
    await q.query(`UPDATE positions SET yes_shares = 0, no_shares = 0, spent = 0, fees_paid = 0 WHERE market_id = $1`, [marketId]);
    await q.query(`UPDATE markets SET fees_held = 0 WHERE id = $1`, [marketId]);
    await closeVault(q, marketId, `Stake called off · #${marketId}`);
    await systemMessage(q, m.group_id, "system", opts.text, marketId, opts.actorId);
    const voided = await saveRecord(q, m.group_id, [marketId], "void", { market: marketId, reason: opts.reason, by: opts.actorId, refunded, terms: termsHash(m) }, ts);
    await q.query(`INSERT INTO chain_ops (kind, market_id, memo, created_at) VALUES ('memo', $1, $2, $3)`, [
      marketId,
      JSON.stringify({ app: "friendstakes", v: 1, ev: "void", market: marketId, reason: opts.reason, h: voided }),
      ts,
    ]);
    return { voided: true, refunded };
  });
}

/**
 * Calls off every open situation about a person, in one group or (groupId null) in all of them. Used when
 * they leave a group or delete their account, since from then on they can't use their veto.
 */
export async function callOffSituationsAbout(userId: number, displayName: string, groupId: number | null = null) {
  const db = await getDb();
  const open = await db.query<{ id: number; title: string }>(
    `SELECT id, title FROM markets WHERE subject_id = $1 AND status = 'open' AND ($2::int IS NULL OR group_id = $2)`,
    [userId, groupId]
  );
  for (const m of open)
    await voidMarket(m.id, { reason: "veto", actorId: null, text: `${displayName} left, so “${m.title}” was called off and everyone was refunded` });
  return open.length;
}

/** When the 24-hour window (app clock) ends undecided, a proposal settles only if it was approved. Called by the worker.
 * An early "it happened" can't settle this way before the deadline: until then it needs another
 * member to confirm it. If it's still waiting at the deadline, it's an ordinary proposal from then. */
export async function finaliseProposals(q: Q) {
  // On the admin's demo clock, only the admin's own groups move forward.
  const ahead = aheadOfRealTime();
  const due = await q.query<MarketRow>(
    `SELECT * FROM markets WHERE status = 'open' AND proposed_outcome IS NOT NULL AND GREATEST(proposed_at, resolves_at) <= $1
       AND ($2::int IS NULL OR ${demoClockGroups("$2")}) ORDER BY proposed_at`,
    [new Date(now().getTime() - SETTLE_WINDOW_MS), ahead?.userId ?? null]
  );
  for (const m of due) {
    try {
      // The vote ran out of time. A result needs approval: with at least one confirmation and more
      // confirmations than rejections it stands; otherwise it lapses as if nobody had called it.
      const v = await voteState(q, m);
      if (!v.confirms.length || v.rejects.length >= v.confirms.length) {
        const why = v.confirms.length || v.rejects.length
          ? `ran out ${v.confirms.length}-${v.rejects.length} without enough approval`
          : `got no confirmations in ${SETTLE_WINDOW_HOURS} hours`;
        await clearProposal(q, m, `The claim on “${m.title}” ${why}, so it lapsed as if nobody had called it. Anyone can call it again`, null);
        continue;
      }
      await settle(m, m.proposed_outcome!, m.proposed_note, m.proposed_by, { suffix: `vote ran out ${v.confirms.length}-${v.rejects.length}, so it stands`, votes: v });
    } catch (e) {
      // Someone else (a confirm, a veto) got there first.
      if (!(e instanceof HttpError)) console.warn("[finalise]", (e as Error).message);
    }
  }
}

/**
 * The day a stake's deadline arrives, everyone in the chat is told once, so somebody can call the
 * result (the message counts as unread for every member). Called by the worker.
 */
export async function announceMaturities(q: Q) {
  const ahead = aheadOfRealTime();
  const t = now();
  const due = await q.query<MarketRow>(
    `SELECT * FROM markets WHERE status = 'open' AND proposed_outcome IS NULL AND matured_notified_at IS NULL AND resolves_at <= $1
       AND ($2::int IS NULL OR ${demoClockGroups("$2")}) ORDER BY resolves_at`,
    [t, ahead?.userId ?? null]
  );
  const days = MATURITY_FALLBACK_HOURS / 24;
  for (const m of due) {
    // Claim it first so two sweeps running at once can't post the notice twice.
    const [mine] = await q.query(`UPDATE markets SET matured_notified_at = $2 WHERE id = $1 AND matured_notified_at IS NULL RETURNING id`, [m.id, t]);
    if (!mine) continue;
    const [poster] = await q.query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [m.creator_id]);
    await systemMessage(
      q,
      m.group_id,
      "due",
      `“${m.title}” has reached its deadline. What happened? ${poster?.display_name ?? "Whoever posted it"} can call the result now and anyone can from tomorrow. If nobody confirms it within ${days} days, it's called off and everyone is refunded.`,
      m.id,
      null
    );
  }
}

/**
 * Every situation reaches an end once it matures. If nobody has put a result forward within
 * MATURITY_FALLBACK_HOURS of the deadline, the stake is called off and everyone gets back what they
 * put in. The market's price is never used as the answer: it says what people expected, not what
 * happened, and an unverified outcome must never pay out or enter the history used for pricing.
 * Called by the worker.
 */
export async function settleUnclaimed(q: Q) {
  const ahead = aheadOfRealTime();
  const due = await q.query<MarketRow>(
    `SELECT * FROM markets WHERE status = 'open' AND proposed_outcome IS NULL AND resolves_at <= $1
       AND ($2::int IS NULL OR ${demoClockGroups("$2")}) ORDER BY resolves_at`,
    [new Date(now().getTime() - MATURITY_FALLBACK_MS), ahead?.userId ?? null]
  );
  const days = MATURITY_FALLBACK_HOURS / 24;
  for (const m of due) {
    const p = priceYes(book(m));
    try {
      await voidMarket(m.id, {
        reason: "unclaimed",
        actorId: null,
        text: `nobody confirmed what happened with “${m.title}” within ${days} days of the deadline, so it was called off and everyone was refunded. The market's ${Math.round(p * 100)}% was a prediction, not a result`,
      });
    } catch (e) {
      if (!(e instanceof HttpError)) console.warn("[unclaimed]", (e as Error).message);
    }
  }
}

function assertMayCall(callable: { yes: boolean; no: boolean }, outcome: boolean) {
  if (!callable[outcome ? "yes" : "no"])
    throw new HttpError(403, `You'd gain from calling it ${outcome ? "that way" : "the other way"}, so a friend who wouldn't gain has to call it`);
}

/** Which way this user may call the market, given everyone's positions (see mayCall). */
export async function callableBy(q: Q, m: MarketRow, userId: number) {
  const rows = await q.query<{ user_id: number; yes_shares: number | null; no_shares: number | null }>(
    `SELECT gm.user_id, p.yes_shares, p.no_shares FROM group_members gm
     LEFT JOIN positions p ON p.market_id = $2 AND p.user_id = gm.user_id WHERE gm.group_id = $1`,
    [m.group_id, m.id]
  );
  const holding = (r?: (typeof rows)[number]) => (r && r.yes_shares != null ? { yes_shares: r.yes_shares, no_shares: r.no_shares ?? 0 } : null);
  const mine = holding(rows.find((r) => r.user_id === userId));
  const others = rows.filter((r) => r.user_id !== userId && r.user_id !== m.subject_id).map(holding);
  const past = new Date(m.resolves_at) <= now();
  return { yes: mayCall(true, mine, others, past), no: mayCall(false, mine, others, past) };
}

async function rememberOutcome(m: MarketRow, outcome: boolean, crowd: number, payouts: { user_id: number; pnl: number }[], note: string) {
  const db = await getDb();
  const [subject] = m.subject_id ? await db.query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [m.subject_id]) : [];
  const best = payouts.sort((a, b) => b.pnl - a.pnl)[0];
  const [winner] = best && best.pnl > 0 ? await db.query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [best.user_id]) : [];
  const summary = await summarizeOutcome({
    title: m.title,
    outcome,
    subjectName: subject?.display_name ?? null,
    aiProb: m.ai_prob,
    crowdProb: crowd,
    openProb: m.open_prob,
    traders: payouts.length,
    volume: m.volume,
    biggestWinner: winner?.display_name ?? null,
    note,
  });
  const vector = await embed(m.title);
  await db.query(
    `INSERT INTO memories (group_id, market_id, subject_id, category, title, outcome, ai_prob, crowd_prob, summary, embedding, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [m.group_id, m.id, m.subject_id, m.category, m.title, outcome, m.ai_prob, crowd, summary, vector ? JSON.stringify(vector) : null, now()]
  );
}

/**
 * Time decay for one long-dated stock, from its last decay to `t`. Returns the book after decay (or
 * unchanged when none was due). Called under the market's row lock by whoever is about to write the
 * book, so decay and the write land together. Skips tiny intervals unless `force`.
 */
async function decayOne(q: Q, m: MarketRow, t: Date, force = false): Promise<Book> {
  const bk0 = book(m);
  if (m.decay !== "hazard" || m.status !== "open") return bk0;
  const end = new Date(m.resolves_at).getTime();
  const last = new Date(m.last_decay_at).getTime();
  const before = end - last;
  const after = end - t.getTime();
  if (before <= 0 || t.getTime() <= last || (!force && t.getTime() - last < 60_000)) return bk0;
  const p0 = priceYes(bk0);
  const p1 = Math.max(0.005, hazardDecay(p0, before, after));
  const bk = recenter(bk0, p1);
  // The trade book keeps where trades left it (filled in from the old quote the first time).
  await q.query(`UPDATE markets SET t_yes = COALESCE(t_yes, q_yes), t_no = COALESCE(t_no, q_no), q_yes = $2, last_decay_at = $3 WHERE id = $1`, [m.id, bk.qYes, t]);
  if (Math.abs(p1 - p0) > 0.0005) await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'decay')`, [m.id, t, p1]);
  return bk;
}

/** Long-dated "by date X" stocks lose value as time passes with no news. Also runs the maturity sweeps. */
export async function runDecay(q: Q) {
  await announceMaturities(q);
  await finaliseProposals(q);
  await settleUnclaimed(q);
  const ahead = aheadOfRealTime();
  const rows = await q.query<{ id: number }>(
    `SELECT id FROM markets WHERE status = 'open' AND decay = 'hazard'
       AND ($1::int IS NULL OR ${demoClockGroups("$1")})`,
    [ahead?.userId ?? null]
  );
  const t = now();
  const db = await getDb();
  // Each stock is locked and re-read before its decay is written, so a trade that landed since the
  // list above was read is never overwritten by a book computed from the old row.
  for (const { id } of rows)
    await db.tx(async (tq) => {
      const [m] = await tq.query<MarketRow>(`SELECT * FROM markets WHERE id = $1 FOR UPDATE`, [id]);
      if (m) await decayOne(tq, m, t);
    });
}

/** The cap on any single AI move, so the house can't be gamed through the mood signal. */
export const AI_MOVE_CAP = 0.15;

export type RemarkSnapshot = { stocks: (MarketRow & { subject_name: string | null })[]; inputs: Parameters<typeof repriceStocks>[0]; at: Date };

/**
 * What the AI gets to see: every open stock in the group, as it stands right now. The snapshot
 * remembers each stock's volume, which is how applyRemarks later tells whether anyone traded while
 * the AI was thinking.
 *
 * Moods and chat snippets come from the requester's browser and can't be checked, so for any stock
 * the requester holds, they're dropped: nobody can feed the AI made-up signals about their own bet.
 */
export async function snapshotForRemark(q: Q, groupId: number, moods: Record<string, number> | null, chat: Record<string, Snippet[]> | null, requesterId: number | null = null): Promise<RemarkSnapshot> {
  const [grp] = await q.query<{ ai_context: string }>(`SELECT ai_context FROM groups WHERE id = $1`, [groupId]);
  const at = now();
  const stocks = await q.query<MarketRow & { subject_name: string | null }>(
    `SELECT m.*, u.display_name AS subject_name FROM markets m LEFT JOIN users u ON u.id = m.subject_id
     WHERE m.group_id = $1 AND m.kind = 'stock' AND m.status = 'open' AND m.proposed_outcome IS NULL AND m.resolves_at > $2`,
    [groupId, at]
  );
  const held = new Set(
    requesterId == null
      ? []
      : (
          await q.query<{ market_id: number }>(
            `SELECT market_id FROM positions WHERE user_id = $1 AND market_id = ANY($2::int[]) AND (yes_shares > 1e-6 OR no_shares > 1e-6)`,
            [requesterId, stocks.map((m) => m.id)]
          )
        ).map((r) => r.market_id)
  );
  const trusted = (m: MarketRow) => !held.has(m.id);
  return {
    at,
    stocks,
    inputs: {
      today: at,
      groupContext: grp?.ai_context ?? "",
      stocks: stocks.map((m) => ({
        id: m.id,
        title: m.title,
        category: m.category,
        price: price(m),
        daysLeft: (new Date(m.resolves_at).getTime() - at.getTime()) / 86400000,
        subjectName: m.subject_name,
        mood: m.subject_id && moods && trusted(m) ? (moods[m.subject_id] ?? null) : null,
        history: m.ai_rationale,
        snippets: trusted(m) ? chat?.[m.id]?.slice(0, STOCK_SNIPPETS) : undefined,
      })),
    },
  };
}

export type Remark = { id: number; probability: number; reason: string; source?: string };
export type RemarkOutcome =
  | { id: number; title: string; from: number; to: number; reason: string; applied: true }
  | { id: number; title: string; from: number; to: number; reason: string; applied: false; skipped: string };

/**
 * Writes the AI's re-marks, one short transaction per stock, after the AI has finished thinking
 * (which can take a while, and must never hold a lock). Under each row lock the stock is read
 * again: if anyone traded it since the snapshot, the trade carries fresher information than the
 * price the AI priced from, so that re-mark is skipped rather than written over the trade. Time
 * decay owed since the last sweep is applied under the same lock, so the write lands on a current
 * book. A stock that has since closed, settled or had a result proposed is left alone.
 */
export async function applyRemarks(groupId: number, snap: RemarkSnapshot, updates: Remark[], trace: Trace) {
  const db = await getDb();
  const outcomes: RemarkOutcome[] = [];
  for (const u of updates) {
    const seen = snap.stocks.find((s) => s.id === u.id);
    if (!seen || seen.group_id !== groupId) continue;
    const from = price(seen);
    const to = Math.min(from + AI_MOVE_CAP, Math.max(from - AI_MOVE_CAP, u.probability));
    if (Math.abs(to - from) < 0.005) continue;
    const base = { id: seen.id, title: seen.title, from, to, reason: u.reason };
    const outcome = await db.tx(async (q): Promise<RemarkOutcome> => {
      const [m] = await q.query<MarketRow>(`SELECT * FROM markets WHERE id = $1 FOR UPDATE`, [u.id]);
      if (!m || m.status !== "open" || m.proposed_outcome != null || new Date(m.resolves_at) <= now())
        return { ...base, applied: false, skipped: "it closed while the AI was thinking" };
      if (m.volume !== seen.volume) {
        const nowPrice = priceYes(book(m));
        return { ...base, applied: false, skipped: `trading moved it from ${(from * 100).toFixed(0)}% to ${(nowPrice * 100).toFixed(0)}% while the AI was thinking, so the trade stands` };
      }
      const t = now();
      // Decay owed since the snapshot lands first, then the AI's move is applied to the current book.
      const decayed = await decayOne(q, m, t, true);
      const bk = recenter(decayed, to);
      await q.query(`UPDATE markets SET t_yes = COALESCE(t_yes, q_yes), t_no = COALESCE(t_no, q_no), q_yes = $2 WHERE id = $1`, [m.id, bk.qYes]);
      await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'ai')`, [m.id, t, to]);
      return { ...base, applied: true };
    });
    outcomes.push(outcome);
  }
  const applied = outcomes.filter((o) => o.applied);
  const skipped = outcomes.filter((o) => !o.applied);
  if (snap.stocks.length)
    await saveRecord(db, groupId, snap.stocks.map((m) => m.id), "reprice", {
      ...traceFields(trace),
      inputs: { groupContext: snap.inputs.groupContext, stocks: snap.inputs.stocks, snapshotAt: snap.at.toISOString() },
      parsed: updates,
      maths: {
        rule: `Each stock moves to the AI's probability, capped at ${AI_MOVE_CAP * 100} points per re-mark; moves under half a point are skipped. The AI thinks with no lock held; each stock is then locked, re-read and decayed, and its re-mark is skipped if anyone traded it meanwhile`,
        applied,
        skipped,
      },
    }, now());
  if (applied.length)
    await systemMessage(
      db,
      groupId,
      "system",
      `AI re-marked ${applied.length} stock(s): ${applied.map((a) => `${a.title} ${(a.from * 100).toFixed(0)}→${(a.to * 100).toFixed(0)}% (${a.reason})`).join("; ")}`,
      null,
      null
    );
  return { applied, skipped };
}

/** AI re-marks every open stock in a group (term dates, mood, time left). */
export async function repriceGroup(user: User, groupId: number, moods: Record<string, number> | null, chat: Record<string, Snippet[]> | null = null) {
  const db = await getDb();
  // Claim the slot atomically: one re-mark per group per cooldown, however many people press the button.
  const t = now();
  const claimed = await db.query(
    `UPDATE groups SET last_reprice_at = $2 WHERE id = $1 AND (last_reprice_at IS NULL OR last_reprice_at <= $3) RETURNING id`,
    [groupId, t, new Date(t.getTime() - MARKET.repriceCooldownMs)]
  );
  if (!claimed.length) {
    const [g] = await db.query<{ last_reprice_at: Date }>(`SELECT last_reprice_at FROM groups WHERE id = $1`, [groupId]);
    const mins = Math.ceil((new Date(g.last_reprice_at).getTime() + MARKET.repriceCooldownMs - t.getTime()) / 60_000);
    throw new HttpError(429, `Stocks were re-marked recently. Try again in ${mins >= 60 ? `${Math.ceil(mins / 60)}h` : `${mins} min`}.`);
  }
  // Nobody trades this chat's markets while the AI works out new quotes (the timeout covers a crash).
  await db.query(`UPDATE groups SET repricing_until = now() + interval '2 minutes' WHERE id = $1`, [groupId]);
  try {
    return await remark(db, groupId, moods, chat, user.id);
  } finally {
    await db.query(`UPDATE groups SET repricing_until = NULL WHERE id = $1`, [groupId]);
  }
}

async function remark(db: Awaited<ReturnType<typeof getDb>>, groupId: number, moods: Record<string, number> | null, chat: Record<string, Snippet[]> | null, requesterId: number) {
  await runDecay(db);
  const snap = await snapshotForRemark(db, groupId, moods, chat, requesterId);
  const trace: Trace = { provider: "none", model: "", prompt: "", raw: null, ms: 0 };
  // The slow part. No transaction is open and nothing is locked, so people keep trading meanwhile.
  const updates = await repriceStocks(snap.inputs, trace);
  const { applied, skipped } = await applyRemarks(groupId, snap, updates, trace);
  return { applied, skipped, source: updates[0]?.source ?? "none" };
}

/** How long whoever disputed a stake's odds waits before they can trade it. */
export const ODDS_DISPUTE_TRADE_WAIT_MS = 15 * 60_000;

/** Who may dispute the odds right now, and if not, why not (shown on the stake page). */
export async function oddsDisputeBlock(q: Q, m: MarketRow, userId: number): Promise<string | null> {
  if (m.odds_disputed_at) return "These odds have already been disputed once";
  if (m.status !== "open" || isClosed(m)) return "Trading has closed on this one";
  const [held] = await q.query(`SELECT 1 FROM positions WHERE market_id = $1 AND user_id = $2 AND (yes_shares > 1e-6 OR no_shares > 1e-6)`, [m.id, userId]);
  if (held) return "You have a stake in this one, so someone without one has to dispute it";
  return null;
}

/**
 * A member thinks the AI got the odds wrong: it looks at the evidence once more. Each stake gets one
 * dispute in total, whatever the answer, so nobody can keep asking until they like the number.
 *
 * The same safeguards as an AI re-mark (applyRemarks): only members holding nothing on it may ask
 * (nobody can talk up a price they own), nothing new from the caller's phone goes in (the AI sees
 * the chat snippets it was priced from, and the history and profile from the server), the move is
 * capped at AI_MOVE_CAP, and the AI thinks with no lock held: if anyone trades meanwhile, the trade
 * stands and the dispute is handed back. The terms (title, rule, line) never change.
 */
export async function disputeOdds(user: User, marketId: number) {
  const db = await getDb();
  const m0 = await getMarket(db, marketId);
  const [member] = await db.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [m0.group_id, user.id]);
  if (!member) throw new HttpError(403, "You're not in this group");
  const blocked = await oddsDisputeBlock(db, m0, user.id);
  if (blocked) throw new HttpError(400, blocked);
  // Claim the stake's one dispute, re-checking under the same statement that nobody claimed it and
  // that the caller still holds nothing.
  const t0 = now();
  const claimed = await db.query(
    `UPDATE markets SET odds_disputed_by = $2, odds_disputed_at = $3 WHERE id = $1 AND odds_disputed_at IS NULL AND status = 'open'
       AND NOT EXISTS (SELECT 1 FROM positions WHERE market_id = $1 AND user_id = $2 AND (yes_shares > 1e-6 OR no_shares > 1e-6)) RETURNING id`,
    [marketId, user.id, t0]
  );
  if (!claimed.length) throw new HttpError(409, "Someone else just disputed these odds");
  const release = () => db.query(`UPDATE markets SET odds_disputed_by = NULL, odds_disputed_at = NULL, odds_dispute = NULL WHERE id = $1`, [marketId]);
  try {
    await runDecay(db);
    const seen = await getMarket(db, marketId);
    const from = price(seen);
    const [grp] = await db.query<{ ai_context: string }>(`SELECT ai_context FROM groups WHERE id = $1`, [seen.group_id]);
    const [subject] = seen.subject_id ? await db.query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [seen.subject_id]) : [];
    const [prof] = seen.subject_id ? await db.query<{ answers: ProfileAnswers }>(`SELECT answers FROM profiles WHERE user_id = $1`, [seen.subject_id]) : [];
    const subjectProfile = profileForPrompt(prof?.answers);
    // The chat it was priced from: what the poster's phone shared at opening, nothing new.
    const [rec] = await db.query<{ record: string }>(`SELECT record FROM pricing_records WHERE $1 = ANY(market_ids) AND kind = 'open' ORDER BY id LIMIT 1`, [marketId]);
    let snippets: Snippet[] = [];
    try {
      snippets = (rec ? (JSON.parse(rec.record).inputs?.chatSnippets as Snippet[]) : null) ?? [];
    } catch {}
    const { history, similar } = await evidenceFor(db, seen.group_id, seen.title, seen.subject_id);
    const a = await analyzeSituation({
      title: seen.title,
      description: seen.description,
      resolvesAt: new Date(seen.resolves_at),
      now: now(),
      subjectName: subject?.display_name ?? null,
      subjectProfile,
      groupContext: grp?.ai_context ?? "",
      mood: null,
      history,
      snippets,
      want: { kind: seen.kind, answer: seen.answer, line: seen.line ?? undefined },
      dispute: { price: from, aiProb: seen.ai_prob, rationale: seen.ai_rationale },
    });
    const signals = { profile: !!subjectProfile, chat: snippets.length };
    const maths = openingMaths(a.probability, history.baseRate, history.n, signals);
    const to = Math.min(from + AI_MOVE_CAP, Math.max(from - AI_MOVE_CAP, maths.openProb));
    const changed = Math.abs(to - from) >= 0.005;
    const pctOf = (p: number) => `${Math.round(p * 100)}%`;
    const result: OddsDispute = {
      from,
      to: changed ? to : from,
      changed,
      note: a.summary,
      aiProb: a.probability,
      source: a.source,
    };
    const t = now();
    await db.tx(async (q) => {
      const [m] = await q.query<MarketRow>(`SELECT * FROM markets WHERE id = $1 FOR UPDATE`, [marketId]);
      if (!m || m.status !== "open" || isClosed(m)) throw new HttpError(409, "Trading closed while the AI was thinking, so the odds stay as they are.");
      if (m.volume !== seen.volume) throw new HttpError(409, "Someone traded while the AI was thinking, so the trade stands. You can dispute the new odds.");
      if (changed) {
        const bk = recenter(await decayOne(q, m, t, true), to);
        await q.query(`UPDATE markets SET t_yes = COALESCE(t_yes, q_yes), t_no = COALESCE(t_no, q_no), q_yes = $2 WHERE id = $1`, [m.id, bk.qYes]);
        await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'ai')`, [m.id, t, to]);
      }
      await q.query(`UPDATE markets SET odds_dispute = $2 WHERE id = $1`, [m.id, JSON.stringify(result)]);
      const { trace: _t, ...parsed } = a;
      await saveRecord(q, m.group_id, [m.id], "reprice", {
        ...traceFields(a.trace),
        dispute: { by: `@${user.username}`, at: t0.toISOString() },
        inputs: {
          groupContext: grp?.ai_context ?? "",
          chatSnippets: snippets,
          history: { baseRate: history.baseRate, effectiveSamples: history.n, subjectRecord: history.subjectRecord ?? null, similar: similar.map((x) => ({ title: x.title, outcome: x.outcome, similarity: +x.similarity.toFixed(3), ...(x.flipped ? { flipped: true } : {}) })) },
          subjectProfile: profileCommitment(subjectProfile),
        },
        parsed,
        maths: {
          rule: `A member disputed the odds, so the AI looked again with the same evidence. Its answer goes through the opening maths, then the move from the current price is capped at ${AI_MOVE_CAP * 100} points; moves under half a point are skipped. One dispute per stake.`,
          opening: maths,
          applied: changed ? [{ id: m.id, title: m.title, from, to, reason: a.summary }] : [],
          kept: changed ? null : { id: m.id, title: m.title, at: from, reason: a.summary },
        },
      }, t);
      await systemMessage(
        q,
        m.group_id,
        "system",
        changed
          ? `disputed the odds on “${m.title}”. The AI looked again and moved them from ${pctOf(from)} to ${pctOf(to)}.`
          : `disputed the odds on “${m.title}”. The AI looked again and kept them at ${pctOf(from)}.`,
        m.id,
        user.id
      );
    });
    return result;
  } catch (e) {
    // Nothing changed, so the stake keeps its one dispute.
    await release();
    throw e;
  }
}
