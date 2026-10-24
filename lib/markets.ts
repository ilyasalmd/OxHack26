import crypto from "node:crypto";
import { getDb, type Q } from "./db";
import { now } from "./clock";
import { ECONOMY, MARKET } from "./config";
import { analyzeSituation, repriceStocks, summarizeOutcome, embed, type Analysis } from "./ai";
import { evidenceFor, type Similar } from "./memory";
import { applyShares, bookAt, hazardDecay, priceYes, proceedsForShares, recenter, sharesForAmount, type Book, type Side } from "./lmsr";
import { credit, maxStake, recordNetWorth } from "./economy";
import { HttpError, type User } from "./auth";
import type { Snippet } from "./chat-context";

export type MarketRow = {
  id: number;
  group_id: number;
  creator_id: number;
  subject_id: number | null;
  kind: "bet" | "stock";
  decay: "none" | "hazard";
  title: string;
  description: string;
  category: string;
  resolution_rule: string;
  ai_prob: number;
  base_rate: number | null;
  base_rate_n: number;
  open_prob: number;
  ai_rationale: string;
  ai_source: string;
  b: number;
  q_yes: number;
  q_no: number;
  status: "open" | "resolved";
  outcome: boolean | null;
  created_at: Date;
  resolves_at: Date;
  resolved_at: Date | null;
  last_decay_at: Date;
  volume: number;
  chat_context: { shared: number; used: (Snippet & { why: string })[] } | null;
};

export const book = (m: MarketRow): Book => ({ b: m.b, qYes: m.q_yes, qNo: m.q_no });
export const price = (m: MarketRow) => (m.status === "resolved" ? (m.outcome ? 1 : 0) : priceYes(book(m)));
export const isClosed = (m: MarketRow) => m.status !== "open" || new Date(m.resolves_at) <= now();

export type SituationInput = {
  title: string;
  description?: string;
  resolvesAt: string;
  subjectUsername?: string | null;
  mood?: number | null;
  chatSnippets?: Snippet[];
};

async function subjectFor(q: Q, groupId: number, username?: string | null) {
  if (!username) return null;
  const [u] = await q.query<{ id: number; display_name: string; username: string }>(
    `SELECT u.id, u.display_name, u.username FROM users u JOIN group_members gm ON gm.user_id = u.id
     WHERE gm.group_id = $1 AND u.username = $2`,
    [groupId, username.replace(/^@/, "").toLowerCase()]
  );
  if (!u) throw new HttpError(400, `@${username} isn't in this group`);
  return u;
}

// Preview and create share one Gemini call: the analysis is cached briefly by input.
const g = globalThis as unknown as { __fsPreview?: Map<string, { at: number; value: Preview }> };
const previewCache = (g.__fsPreview ??= new Map());

export type Preview = {
  analysis: Analysis;
  openProb: number;
  baseRate: number | null;
  baseRateN: number;
  similar: Pick<Similar, "id" | "title" | "outcome" | "summary" | "similarity" | "ai_prob" | "crowd_prob" | "created_at">[];
  subject: { id: number; display_name: string; username: string } | null;
  vector: number[] | null;
  /** Exactly what this request sent to the AI from the chat (empty unless the group opted in). */
  chatShared: Snippet[];
};

export async function previewSituation(groupId: number, input: SituationInput): Promise<Preview> {
  const title = input.title.trim();
  if (title.length < 4) throw new HttpError(400, "Describe the situation in a few words");
  const resolvesAt = new Date(input.resolvesAt);
  if (!(resolvesAt.getTime() > now().getTime())) throw new HttpError(400, "Resolve date must be in the future");
  const key = crypto.createHash("sha1").update(JSON.stringify([groupId, title, input.description, input.resolvesAt, input.subjectUsername, input.mood, input.chatSnippets])).digest("hex");
  const hit = previewCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;

  const db = await getDb();
  const subject = await subjectFor(db, groupId, input.subjectUsername);
  const [grp] = await db.query<{ ai_context: string; ai_reads_chat: boolean }>(`SELECT ai_context, ai_reads_chat FROM groups WHERE id = $1`, [groupId]);
  // Chat snippets are only ever forwarded when the whole group has opted in.
  const chatShared = grp?.ai_reads_chat ? (input.chatSnippets ?? []).slice(0, 20) : [];
  const { history, similar, vector } = await evidenceFor(db, groupId, title, subject?.id ?? null);
  const analysis = await analyzeSituation({
    title,
    description: input.description ?? "",
    resolvesAt,
    now: now(),
    subjectName: subject?.display_name ?? null,
    groupContext: grp?.ai_context ?? "",
    mood: input.mood ?? null,
    history,
    snippets: chatShared,
  });
  // The AI already saw the base rate; we still blend a little so history keeps a direct vote.
  const w = history.baseRate == null ? 0 : MARKET.historyWeight * Math.min(1, history.n / 3);
  const openProb = Math.min(MARKET.maxProb, Math.max(MARKET.minProb, (1 - w) * analysis.probability + w * (history.baseRate ?? 0)));
  const value: Preview = {
    analysis,
    openProb,
    baseRate: history.baseRate,
    baseRateN: history.n,
    similar: similar.map(({ id, title, outcome, summary, similarity, ai_prob, crowd_prob, created_at }) => ({ id, title, outcome, summary, similarity, ai_prob, crowd_prob, created_at })),
    subject,
    vector,
    chatShared,
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
  const p = await previewSituation(groupId, input);
  const db = await getDb();
  const a = p.analysis;
  const b = a.kind === "stock" ? MARKET.stockLiquidity : MARKET.betLiquidity;
  const bk = bookAt(b, p.openProb);
  const ts = now();
  const id = await db.tx(async (q) => {
    const [m] = await q.query<{ id: number }>(
      `INSERT INTO markets (group_id, creator_id, subject_id, kind, decay, title, description, category, resolution_rule,
        ai_prob, base_rate, base_rate_n, open_prob, ai_rationale, ai_source, b, q_yes, q_no, created_at, resolves_at, last_decay_at, chat_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$19,$21) RETURNING id`,
      [groupId, user.id, p.subject?.id ?? null, a.kind, a.decay, a.title, input.description ?? "", a.category, a.resolutionRule,
        a.probability, p.baseRate, p.baseRateN, p.openProb, a.rationale, a.source, b, bk.qYes, bk.qNo, ts, new Date(input.resolvesAt),
        p.chatShared.length ? JSON.stringify({ shared: p.chatShared.length, used: a.chatUsed }) : null]
    );
    await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'open')`, [m.id, ts, p.openProb]);
    await systemMessage(q, groupId, "market", `${a.kind === "stock" ? "listed a stock" : "opened a bet"}: ${a.title}`, m.id, user.id);
    await q.query(`INSERT INTO chain_ops (kind, market_id, memo, created_at) VALUES ('memo', $1, $2, $3)`, [
      m.id,
      JSON.stringify({ app: "friend-stocks", v: 1, ev: "open", market: m.id, group: groupId, kind: a.kind, p: +p.openProb.toFixed(4), resolves: input.resolvesAt.slice(0, 10) }),
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

export async function trade(user: User, marketId: number, input: { side: Side; action: "buy" | "sell"; amount: number }) {
  const db = await getDb();
  const result = await db.tx(async (q) => {
    const [m] = await q.query<MarketRow>(`SELECT * FROM markets WHERE id = $1 FOR UPDATE`, [marketId]);
    if (!m) throw new HttpError(404, "Market not found");
    const [member] = await q.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [m.group_id, user.id]);
    if (!member) throw new HttpError(403, "You're not in this group");
    if (isClosed(m)) throw new HttpError(400, "Trading has closed on this one");
    if (m.subject_id === user.id) {
      if (m.kind === "bet") throw new HttpError(400, "You can't bet on a situation about yourself");
      if (input.side === "no" && input.action === "buy") throw new HttpError(400, "You can only go long on yourself. Invest in yourself!");
    }
    const [u] = await q.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
    const before = priceYes(book(m));
    let bk = book(m);
    let shares: number, coins: number;
    if (input.action === "buy") {
      coins = Math.round(input.amount * 100) / 100;
      const cap = maxStake(u.balance);
      if (!(coins >= ECONOMY.minTrade)) throw new HttpError(400, `Minimum trade is ${ECONOMY.minTrade}`);
      if (coins > cap + 1e-9)
        throw new HttpError(400, `Max stake right now is ${cap.toFixed(2)} (${ECONOMY.maxStakeFraction * 100}% of balance, keeping ${ECONOMY.balanceFloor} safe)`);
      shares = sharesForAmount(bk, input.side, coins);
      bk = applyShares(bk, input.side, shares);
    } else {
      const [pos] = await q.query<{ yes_shares: number; no_shares: number }>(
        `SELECT yes_shares, no_shares FROM positions WHERE market_id = $1 AND user_id = $2`,
        [marketId, user.id]
      );
      const held = pos ? (input.side === "yes" ? pos.yes_shares : pos.no_shares) : 0;
      shares = Math.min(input.amount, held);
      if (!(shares > 1e-6)) throw new HttpError(400, "No shares to sell");
      coins = proceedsForShares(bk, input.side, shares);
      bk = applyShares(bk, input.side, -shares);
    }
    const after = priceYes(bk);
    const ts = now();
    await q.query(`UPDATE markets SET q_yes = $2, q_no = $3, volume = volume + $4 WHERE id = $1`, [marketId, bk.qYes, bk.qNo, coins]);
    const sign = input.action === "buy" ? 1 : -1;
    await q.query(
      `INSERT INTO positions (market_id, user_id, yes_shares, no_shares, spent) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (market_id, user_id) DO UPDATE SET yes_shares = positions.yes_shares + EXCLUDED.yes_shares,
         no_shares = positions.no_shares + EXCLUDED.no_shares, spent = positions.spent + EXCLUDED.spent`,
      [marketId, user.id, input.side === "yes" ? sign * shares : 0, input.side === "no" ? sign * shares : 0, sign * coins]
    );
    await q.query(
      `INSERT INTO trades (market_id, user_id, side, action, shares, coins, price_before, price_after, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [marketId, user.id, input.side, input.action, shares, coins, before, after, ts]
    );
    await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'trade')`, [marketId, ts, after]);
    await credit(q, user.id, input.action === "buy" ? -coins : coins, `${input.action} ${input.side === "yes" ? "long" : "short"} · ${m.title}`, marketId);
    const verb = input.action === "buy" ? (input.side === "yes" ? "went long" : "went short") : `sold ${input.side === "yes" ? "long" : "short"}`;
    await systemMessage(q, m.group_id, "trade", `${verb} ${coins.toFixed(0)} · ${(before * 100).toFixed(0)}% → ${(after * 100).toFixed(0)}%`, marketId, user.id);
    return { shares, coins, before, after };
  });
  return result;
}

export async function resolveMarket(user: User, marketId: number, outcome: boolean, note = "", opts: { waitForMemory?: boolean } = {}) {
  const db = await getDb();
  const m = await getMarket(db, marketId);
  if (m.status !== "open") throw new HttpError(400, "Already resolved");
  if (m.subject_id === user.id) throw new HttpError(403, "The person it's about can't resolve it");
  const creatorCanResolve = m.creator_id === user.id;
  if (!creatorCanResolve && new Date(m.resolves_at) > now())
    throw new HttpError(403, "Only the creator can resolve before the resolve date");
  const [member] = await db.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [m.group_id, user.id]);
  if (!member) throw new HttpError(403, "You're not in this group");

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
    const out: { user_id: number; payout: number; pnl: number }[] = [];
    for (const p of positions) {
      const payout = outcome ? p.yes_shares : p.no_shares;
      if (payout > 0.005) await credit(q, p.user_id, payout, `Payout · ${m.title}`, marketId);
      else await recordNetWorth(q, p.user_id);
      out.push({ user_id: p.user_id, payout, pnl: payout - p.spent });
    }
    await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'resolve')`, [marketId, now(), outcome ? 1 : 0]);
    await systemMessage(q, m.group_id, "resolution", `resolved ${outcome ? "YES" : "NO"}: ${m.title}${note ? ` (${note})` : ""}`, marketId, user.id);
    await q.query(`INSERT INTO chain_ops (kind, market_id, memo, created_at) VALUES ('memo', $1, $2, $3)`, [
      marketId,
      JSON.stringify({ app: "friend-stocks", v: 1, ev: "resolve", market: marketId, outcome, crowd: +crowd.toFixed(4) }),
      now(),
    ]);
    return out;
  });

  // Write the memory outside the transaction: Gemini can take a second.
  const memory = rememberOutcome(m, outcome, crowd, payouts, note).catch((e) => console.warn("[memory]", e));
  if (opts.waitForMemory) await memory;
  return { payouts };
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

/** Long-dated "by date X" stocks lose value as time passes with no news. */
export async function runDecay(q: Q) {
  const rows = await q.query<MarketRow>(`SELECT * FROM markets WHERE status = 'open' AND decay = 'hazard'`);
  const t = now();
  for (const m of rows) {
    const end = new Date(m.resolves_at).getTime();
    const before = end - new Date(m.last_decay_at).getTime();
    const after = end - t.getTime();
    if (before <= 0 || t.getTime() - new Date(m.last_decay_at).getTime() < 60_000) continue;
    const p0 = priceYes(book(m));
    const p1 = Math.max(0.005, hazardDecay(p0, before, after));
    const bk = recenter(book(m), p1);
    await q.query(`UPDATE markets SET q_yes = $2, last_decay_at = $3 WHERE id = $1`, [m.id, bk.qYes, t]);
    if (Math.abs(p1 - p0) > 0.0005) await q.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'decay')`, [m.id, t, p1]);
  }
}

/** AI re-marks every open stock in a group (term dates, mood, time left). */
export async function repriceGroup(user: User, groupId: number, moods: Record<string, number> | null, chat: Record<string, Snippet[]> | null = null) {
  const db = await getDb();
  await runDecay(db);
  const [grp] = await db.query<{ ai_context: string; ai_reads_chat: boolean }>(`SELECT ai_context, ai_reads_chat FROM groups WHERE id = $1`, [groupId]);
  if (!grp?.ai_reads_chat) chat = null;
  const stocks = await db.query<MarketRow & { subject_name: string | null }>(
    `SELECT m.*, u.display_name AS subject_name FROM markets m LEFT JOIN users u ON u.id = m.subject_id
     WHERE m.group_id = $1 AND m.kind = 'stock' AND m.status = 'open' AND m.resolves_at > $2`,
    [groupId, now()]
  );
  const updates = await repriceStocks({
    today: now(),
    groupContext: grp?.ai_context ?? "",
    stocks: stocks.map((m) => ({
      id: m.id,
      title: m.title,
      price: price(m),
      daysLeft: (new Date(m.resolves_at).getTime() - now().getTime()) / 86400000,
      subjectName: m.subject_name,
      mood: m.subject_id && moods ? (moods[m.subject_id] ?? null) : null,
      history: m.ai_rationale,
      snippets: chat?.[m.id]?.slice(0, 8),
    })),
  });
  const applied: { id: number; title: string; from: number; to: number; reason: string }[] = [];
  for (const u of updates) {
    const m = stocks.find((s) => s.id === u.id);
    if (!m) continue;
    const from = price(m);
    // Cap any single AI move so the house can't be gamed through the mood signal.
    const to = Math.min(from + 0.15, Math.max(from - 0.15, u.probability));
    if (Math.abs(to - from) < 0.005) continue;
    const bk = recenter(book(m), to);
    await db.query(`UPDATE markets SET q_yes = $2 WHERE id = $1`, [m.id, bk.qYes]);
    await db.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'ai')`, [m.id, now(), to]);
    applied.push({ id: m.id, title: m.title, from, to, reason: u.reason });
  }
  if (applied.length)
    await systemMessage(
      db,
      groupId,
      "system",
      `AI re-marked ${applied.length} stock(s): ${applied.map((a) => `${a.title} ${(a.from * 100).toFixed(0)}→${(a.to * 100).toFixed(0)}% (${a.reason})`).join("; ")}`,
      null,
      null
    );
  return { applied, source: updates[0]?.source ?? "none" };
}
