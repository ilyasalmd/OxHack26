import { AI, MARKET, type AiProvider } from "./config";
import { CATEGORIES, guessCategory, playbook } from "./categories";
import { lexiconScore } from "./mood";
import type { Snippet } from "./chat-context";

export { CATEGORIES, guessCategory };

// Privacy rule: the AI sees the situation itself, resolved-history stats, the group's "AI context"
// (term dates etc.) and an optional on-device mood score. With Ollama the model runs on the server's
// own machine and nothing leaves it. With the Gemini API (a teammate without Ollama) the same prompts
// go to Google's hosted Gemma instead, and lib/ai-disclosure.ts says so from the same setting.
// Chat text arrives only as the snippets a member's browser picked as relevant (at most
// 20 per stake, 8 per stock), with names replaced by roles and contact details removed
// (lib/chat-context.ts). That is always on and described to users in lib/ai-disclosure.ts.

// A provider that can't answer for a while (Ollama not running, a refused key, Google's free-tier
// limit) is skipped until it should be back, and the next one or the stats fallback is used, so the
// log carries one line instead of one per request. Kept per task: chat and embeddings have separate quotas.
type Task = "chat" | "embed";
const pausedUntil = new Map<string, number>();
const live = (task: Task) => AI.chain.filter((p) => Date.now() >= (pausedUntil.get(`${p}:${task}`) ?? 0));
function pause(p: AiProvider, task: Task, e: Unavailable) {
  pausedUntil.set(`${p}:${task}`, Date.now() + e.retryMs);
  console.warn(`[ai] ${p === "ollama" ? "Ollama" : "Gemini API"} ${task === "embed" ? "embeddings " : ""}unavailable: ${e.message}. Skipping it for ${Math.round(e.retryMs / 1000)}s`);
}

/** The provider is down for a while (unreachable, refused, out of quota), as opposed to one bad answer. */
export class Unavailable extends Error {
  constructor(message: string, readonly retryMs: number) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The JSON object in a reply, without any code fences or chatter around it. */
const jsonPart = (text: string) => text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
const schemaNote = (schema: object) => `\n\nReply with only a JSON object that matches this JSON Schema, with no code fences or other text:\n${JSON.stringify(schema)}`;

/** Ollama's REST API on this machine (or OLLAMA_URL). */
async function ollama<T>(path: string, body: object, timeoutMs: number): Promise<T> {
  const res = await fetch(`${AI.ollamaUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(AI.ollamaKey ? { authorization: `Bearer ${AI.ollamaKey}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e: Error) => {
    throw /ECONNREFUSED|fetch failed/i.test(e.message) ? new Unavailable(`not running at ${AI.ollamaUrl}`, 60_000) : e;
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: string }).error ?? `Ollama HTTP ${res.status}`;
    throw /not found, try pulling/i.test(msg) ? new Unavailable(msg, 60_000) : new Error(msg);
  }
  return json as T;
}

// Models whose Ollama build has no constrained decoding (e.g. Gemma 4): they get the schema in the prompt instead.
const noFormat = new Set<string>();

/** What one model call actually saw and said, kept for the pricing record. */
export type Trace = { provider: string; model: string; prompt: string; raw: string | null; ms: number; error?: string };

async function askOllama<T>(prompt: string, schema: object, timeoutMs: number, trace?: Trace): Promise<T> {
  const model = AI.model;
  const constrained = !noFormat.has(model);
  const content = constrained ? prompt : prompt + schemaNote(schema);
  try {
    // Thinking off for speed; the questions are short judgement calls.
    const res = await ollama<{ message: { content: string } }>(
      "/api/chat",
      { model, messages: [{ role: "user", content }], ...(constrained ? { format: schema } : {}), stream: false, think: false, keep_alive: "30m", options: { temperature: 0.3, num_predict: 1200, num_ctx: 8192 } },
      timeoutMs
    );
    const text = res.message.content;
    if (trace) trace.raw = text;
    return JSON.parse(constrained ? text : jsonPart(text)) as T;
  } catch (e) {
    if (constrained && /structured output is unavailable/i.test((e as Error).message)) {
      noFormat.add(model);
      return askOllama<T>(prompt, schema, timeoutMs, trace);
    }
    throw e;
  }
}

// One short wait is worth it for a per-minute limit; anything longer and the caller is better off
// with the stats model now than with Gemma in half a minute.
const RATE_LIMIT_WAIT_MS = 8000;

class GoogleHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type GoogleError = { error?: { code?: number; message?: string; status?: string; details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] } };

/** How long Google says to wait after a 429, and whether it was the daily quota (which no short wait fixes). */
export function rateLimit(err: NonNullable<GoogleError["error"]>) {
  const details = err.details ?? [];
  const delay = details.find((d) => d.retryDelay)?.retryDelay;
  const quotas = details.flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? "").join(" ");
  return { waitMs: delay ? Math.ceil(parseFloat(delay) * 1000) : 5000, daily: /PerDay/i.test(`${quotas} ${err.message ?? ""}`) };
}

/** The Gemini API (Google AI Studio), authenticated with GEMMA_API_KEY. */
async function google<T>(path: string, body: object, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (let retried = false; ; retried = true) {
    const res = await fetch(`${AI.googleUrl}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": AI.googleKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
    }).catch((e: Error) => {
      throw /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(e.message) ? new Unavailable(`can't reach ${AI.googleUrl}`, 60_000) : e;
    });
    const json = (await res.json().catch(() => ({}))) as T & GoogleError;
    if (res.ok) return json;
    const err = json.error ?? {};
    const msg = err.message ?? `HTTP ${res.status}`;
    if (res.status === 429) {
      const { waitMs, daily } = rateLimit(err);
      if (!daily && !retried && waitMs <= Math.min(RATE_LIMIT_WAIT_MS, deadline - Date.now() - 2000)) {
        await sleep(waitMs);
        continue;
      }
      throw new Unavailable(
        daily
          ? "the free tier's daily limit for this key's Google project is used up (it resets at midnight Pacific time). Use a key from your own project, or Ollama, until then"
          : `the free tier's per-minute limit for this key's Google project was hit; Google asked for ${Math.round(waitMs / 1000)}s`,
        daily ? 15 * 60_000 : Math.max(waitMs, 10_000)
      );
    }
    if (res.status === 402)
      throw new Unavailable(
        `the Google project behind GEMMA_API_KEY has no prepaid credit left (${msg}). Top it up in AI Studio, or use a key from a project without billing, which gets the free tier`,
        15 * 60_000
      );
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(msg))) throw new Unavailable(`GEMMA_API_KEY was refused (${msg})`, 10 * 60_000);
    if (res.status === 404) throw new Unavailable(`${msg} Check GEMMA_API_MODEL`, 10 * 60_000);
    throw new GoogleHttpError(`Gemini API HTTP ${res.status}: ${msg}`, res.status);
  }
}

// Per model, how much of the optional request Google accepted: 0 = JSON mode and thinking off,
// 1 = thinking off only, 2 = plain prompt. Not every Gemma on the API takes both, and a refusal is a 400.
const googleLevel = new Map<string, number>();
type GoogleReply = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };

async function askGoogle<T>(prompt: string, schema: object, timeoutMs: number, trace?: Trace): Promise<T> {
  const model = AI.googleModel;
  const level = googleLevel.get(model) ?? 0;
  const generationConfig = {
    temperature: 0.3,
    maxOutputTokens: 1200,
    ...(level === 0 ? { responseMimeType: "application/json", responseJsonSchema: schema } : {}),
    ...(level <= 1 ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
  };
  const t0 = Date.now();
  try {
    const res = await google<GoogleReply>(
      `models/${model}:generateContent`,
      { contents: [{ role: "user", parts: [{ text: level === 0 ? prompt : prompt + schemaNote(schema) }] }], generationConfig },
      timeoutMs
    );
    const c = res.candidates?.[0];
    const text = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    if (trace) trace.raw = text;
    if (!text.includes("{")) throw new Error(`Gemini API gave no answer (${c?.finishReason ?? res.promptFeedback?.blockReason ?? "empty"})`);
    return JSON.parse(jsonPart(text)) as T;
  } catch (e) {
    if (e instanceof GoogleHttpError && e.status === 400 && level < 2) {
      googleLevel.set(model, level + 1);
      return askGoogle<T>(prompt, schema, timeoutMs - (Date.now() - t0), trace);
    }
    throw e;
  }
}

/**
 * The prompt's answer as JSON matching `schema`, or null so the caller can fall back.
 * `localOnly` keeps it on this machine (Ollama), for prompts that carry unredacted chat.
 */
export async function askJson<T>(prompt: string, schema: object, timeoutMs = 45000, trace?: Trace, opts: { localOnly?: boolean } = {}): Promise<T | null> {
  const t0 = Date.now();
  for (const p of live("chat")) {
    if (opts.localOnly && p !== "ollama") continue;
    if (trace) Object.assign(trace, { provider: p, model: p === "ollama" ? AI.model : AI.googleModel, raw: null, error: undefined });
    try {
      const out = p === "ollama" ? await askOllama<T>(prompt, schema, timeoutMs, trace) : await askGoogle<T>(prompt, schema, timeoutMs - (Date.now() - t0), trace);
      if (trace) trace.ms = Date.now() - t0;
      return out;
    } catch (e) {
      if (trace) Object.assign(trace, { ms: Date.now() - t0, error: (e as Error).message.slice(0, 200) });
      if (e instanceof Unavailable) {
        pause(p, "chat", e);
        continue;
      }
      console.warn(`[ai] ${p} call failed, using fallback:`, (e as Error).message);
      return null;
    }
  }
  return null;
}

export async function embed(text: string): Promise<number[] | null> {
  for (const p of live("embed")) {
    try {
      if (p === "ollama") {
        const res = await ollama<{ embeddings: number[][] }>("/api/embed", { model: AI.embeddingModel, input: text, keep_alive: "30m" }, 15000);
        return res.embeddings?.[0] ?? null;
      }
      if (AI.googleEmbeddingModel === "none") return null;
      // Google's vectors are a different length from EmbeddingGemma's, so lib/memory.ts never compares the two.
      const res = await google<{ embedding?: { values?: number[] } }>(`models/${AI.googleEmbeddingModel}:embedContent`, { content: { parts: [{ text }] } }, 15000);
      return res.embedding?.values ?? null;
    } catch (e) {
      if (e instanceof Unavailable) {
        pause(p, "embed", e);
        continue;
      }
      console.warn("[ai] embedding failed:", (e as Error).message);
      return null;
    }
  }
  return null;
}

export type HistoryEvidence = {
  baseRate: number | null;
  n: number;
  subjectRecord?: string;
  /** This group's record on this kind of stake, and the subject's own record on it. */
  categoryRecord?: string;
  subjectCategoryRecord?: string;
  examples: { title: string; outcome: boolean; summary: string }[];
};

export type Analysis = {
  title: string;
  kind: "bet" | "stock";
  /** "number" questions settle on a value and trade as over/under `line`; probability is P(over). */
  answer: "yesno" | "number";
  line: number | null;
  unit: string;
  decay: "none" | "hazard";
  category: string;
  probability: number;
  rationale: string;
  resolutionRule: string;
  /** Which AI answered: "ollama" (Gemma on this machine), "google" (Gemma on the Gemini API) or the stats model. */
  source: AiProvider | "heuristic";
  /** Snippets the AI kept as relevant, with its reason. Everything else was ignored. */
  chatUsed: (Snippet & { why: string })[];
  /** The exact model call, with the subject's private profile answers blanked out of the prompt. */
  trace?: Trace;
};

const clampP = (p: number) => Math.min(MARKET.maxProb, Math.max(MARKET.minProb, p));

export async function analyzeSituation(input: {
  title: string;
  description: string;
  resolvesAt: Date;
  now: Date;
  subjectName: string | null;
  /** What the subject told the app about themselves (self-reported, private to the AI). */
  subjectProfile?: string;
  groupContext: string;
  mood: number | null;
  history: HistoryEvidence;
  snippets?: Snippet[];
  /** What the poster asked for; "auto" leaves it to the AI. */
  want?: { kind?: "auto" | "bet" | "stock"; answer?: "auto" | "yesno" | "number"; line?: number };
}): Promise<Analysis> {
  const snippets = input.snippets ?? [];
  const want = input.want ?? {};
  const days = (input.resolvesAt.getTime() - input.now.getTime()) / 86400000;
  // The profile goes in through a placeholder so the stored copy of the prompt can leave it out.
  const PROFILE_SLOT = "\u0000PROFILE\u0000";
  const profileBlock = input.subjectProfile
    ? `What ${input.subjectName ?? "they"} told the app about themselves (self-reported, may be optimistic; private, so never quote or mention it in the rationale, just let it inform the probability):\n${input.subjectProfile}\n`
    : "";
  const pb = playbook(guessCategory(`${input.title} ${input.description}`));
  const template = `You are the pricing desk of "FriendStakes", a play-money prediction market inside a friends' group chat.
Friends post situations about each other. Decide how to list this one and its fair probability.
${want.answer === "number" ? `
THE POSTER WANTS A NUMBER QUESTION. Turn the situation into "how much / how many" (minutes late, pints, hours, marks, messages, times it happens...), set "answer" to "number", "unit" to that quantity's unit and "line" to ${want.line != null ? `exactly ${want.line}` : "your median guess as a round number"}. "line" must be a number, never null.
` : want.answer === "yesno" ? `
THE POSTER WANTS A PLAIN YES/NO QUESTION: "answer" is "yesno" and "line" is null.
` : ""}${want.kind && want.kind !== "auto" ? `THE POSTER WANTS "kind" = "${want.kind}".
` : ""}
Situation: "${input.title}"
Details: ${input.description || "(none)"}
About: ${input.subjectName ?? "nobody specific"}
${PROFILE_SLOT}Today: ${day(input.now)}; resolves on ${day(input.resolvesAt)} (${days.toFixed(1)} days away).
Group context the friends chose to share (term dates, fixtures, deadlines): ${input.groupContext || "(none)"}
${input.mood != null ? `Aggregate chat mood about the subject, computed on-device (-1 negative .. +1 positive): ${input.mood.toFixed(2)}` : ""}
Past resolved situations in this group that look similar (${input.history.n.toFixed(1)} effective samples, base rate ${input.history.baseRate == null ? "n/a" : (input.history.baseRate * 100).toFixed(0) + "%"}):
${input.history.examples.map((e) => `- "${e.title}" → ${e.outcome ? "YES" : "NO"}. ${e.summary}`).join("\n") || "- none yet"}
${input.history.subjectRecord ? `Subject's record: ${input.history.subjectRecord}` : ""}
${input.history.subjectCategoryRecord ? `Subject's record on ${pb.label.toLowerCase()} stakes: ${input.history.subjectCategoryRecord}` : ""}
${input.history.categoryRecord ? `This group's record on ${pb.label.toLowerCase()} stakes: ${input.history.categoryRecord}` : ""}
${pb.id === "other" ? `This doesn't match a usual kind of stake. ${pb.weigh}` : `This looks like a ${pb.label.toLowerCase()} stake (if it isn't, pick the right category and use your own judgement).
What matters for it: ${pb.weigh}
Rough everyday odds for a typical UK student or young professional, before any history (general priors, not facts about these people): ${pb.everyday}`}
${snippets.length ? `Recent group-chat snippets the friends chose to share (names replaced: [SUBJECT] is who it's about, Friend A/B are others). Many may be noise:
${snippets.map((s, i) => `[${i}] ${s.age}, ${s.who}: ${s.text}`).join("\n")}` : ""}

Rules:
- answer "yesno" when the situation is something that happens or doesn't. answer "number" when it asks HOW MUCH or HOW MANY (minutes late, a grade, a time, a count): then pick a sensible "line" (your median guess, a round number) and a short "unit" (minutes, %, km, pints); the market becomes "over the line or not", and probability is the chance the real number ends up OVER the line (near 50% if the line is your median).${want.line != null ? ` The poster set the line to ${want.line}: keep it and give the honest chance of going over it.` : ""}
- kind "bet" = short-term yes/no with a deadline (lateness, a match result, a night out). kind "stock" = long-term outcome that trades like a maturing bond until its date (relationships, grades, promotions, fitness goals). Anything > ${MARKET.stockThresholdDays} days away is usually a stock.
- decay "hazard" if the question is "does X happen at any point before the date" (its price should drift down as time runs out with no news). decay "none" if the outcome is only known on the date (a final grade, a match result).
- probability: your honest calibrated estimate from the evidence, between ${MARKET.minProb} and ${MARKET.maxProb}. Weigh it in this order: the subject's own record on this kind of stake, this group's similar past cases, what the subject told the app, concrete details and chat, then the everyday odds. Anchor on the base rate when there are several similar past cases; move away only for clear reasons. Match the everyday odds to the exact question (a stricter line or a shorter deadline means lower odds).
- category: one of ${CATEGORIES.join(", ")}.
- resolutionRule: one precise sentence saying exactly what counts as YES, so nobody argues later.
- title: tidy the situation into a short market question (max 70 chars). For a number question, phrase the over/under in it, e.g. "Jake is more than 15 minutes late to dinner".
- rationale: one or two friendly sentences citing the evidence used.
- usefulSnippets: only the chat snippets that genuinely change the odds (plans, excuses, admissions, schedules, track record), each with a short reason. Ignore banter, jokes and anything off-topic. Empty if none.`;
  const prompt = template.replace(PROFILE_SLOT, profileBlock);
  const lines = input.subjectProfile ? input.subjectProfile.split("\n").length : 0;
  const trace: Trace = {
    provider: "none",
    model: "",
    prompt: template.replace(PROFILE_SLOT, lines ? `[${lines} private answer${lines === 1 ? "" : "s"} from ${input.subjectName ?? "the subject"}'s own profile went here. Only the AI sees them.]\n` : ""),
    raw: null,
    ms: 0,
  };

  const out = await askJson<Omit<Analysis, "source">>(prompt, {
    type: "object",
    properties: {
      title: { type: "string" },
      kind: { type: "string", enum: ["bet", "stock"] },
      answer: { type: "string", enum: want.answer === "number" ? ["number"] : want.answer === "yesno" ? ["yesno"] : ["yesno", "number"] },
      line: want.answer === "number" ? { type: "number" } : { type: ["number", "null"] },
      unit: { type: "string" },
      decay: { type: "string", enum: ["none", "hazard"] },
      category: { type: "string", enum: CATEGORIES },
      probability: { type: "number" },
      rationale: { type: "string" },
      resolutionRule: { type: "string" },
      usefulSnippets: {
        type: "array",
        items: { type: "object", properties: { i: { type: "integer" }, why: { type: "string" } }, required: ["i", "why"] },
      },
    },
    required: ["title", "kind", "answer", "line", "unit", "decay", "category", "probability", "rationale", "resolutionRule", "usefulSnippets"],
  }, undefined, trace);
  if (out && Number.isFinite(out.probability)) {
    const { usefulSnippets, ...rest } = out as typeof out & { usefulSnippets?: { i: number; why: string }[] };
    const chatUsed = (usefulSnippets ?? []).filter((u) => snippets[u.i]).slice(0, 8).map((u) => ({ ...snippets[u.i], why: u.why }));
    return applyWants({ ...rest, probability: clampP(out.probability), source: trace.provider as AiProvider, chatUsed, trace }, want);
  }
  const h = heuristicAnalysis(input.title, days, input.history);
  return applyWants({ ...(snippets.length ? applySnippetTilt(h, snippets) : h), trace }, want);
}

/** The poster's choices win over the AI's, whatever the model answered. */
function applyWants(a: Analysis, want: NonNullable<Parameters<typeof analyzeSituation>[0]["want"]>): Analysis {
  const out = { ...a };
  if (want.kind && want.kind !== "auto") out.kind = want.kind;
  if (want.answer && want.answer !== "auto") out.answer = want.answer;
  if (want.line != null) out.line = want.line;
  if (out.answer !== "number") {
    out.line = null;
    out.unit = "";
  } else if (out.line == null || !Number.isFinite(out.line)) {
    // Asked for a number but the model gave no line: fall back to a plain yes/no rather than a broken market.
    out.answer = "yesno";
    out.unit = "";
  }
  if (out.kind === "bet" && a.kind === "stock") out.decay = "none";
  return out;
}

/** No AI configured (or it is down): still produce sensible odds from history alone. */
export function heuristicAnalysis(title: string, days: number, history: HistoryEvidence): Analysis {
  const category = guessCategory(title);
  const kind = days > MARKET.stockThresholdDays || /girlfriend|boyfriend|first|degree|promot|marathon/i.test(title) ? "stock" : "bet";
  const outcomeOnDate = /\bpass|grade|first\b|2:1|win|score|beat|result/i.test(title);
  const prior = playbook(category).prior[kind];
  const p = history.baseRate == null ? prior : (history.baseRate * history.n + prior * 2) / (history.n + 2);
  return {
    title: title.slice(0, 70),
    kind,
    answer: "yesno",
    line: null,
    unit: "",
    decay: kind === "stock" && !outcomeOnDate ? "hazard" : "none",
    category,
    probability: clampP(p),
    rationale:
      history.n > 0
        ? `Based on ${history.n.toFixed(0)} similar past stake(s) here, which came true ${((history.baseRate ?? 0) * 100).toFixed(0)}% of the time.`
        : `No history yet, so this opens at the usual ${(prior * 100).toFixed(0)}% for ${playbook(category).label.toLowerCase()} stakes.`,
    resolutionRule: `Resolves YES if "${title}" is true by ${days > 0 ? `the resolve date` : "now"}, as agreed by the group; otherwise NO.`,
    source: "heuristic",
    chatUsed: [],
  };
}

/** Offline fallback: nudge odds a little by the tone of snippets about the subject. */
function applySnippetTilt(a: Analysis, snippets: Snippet[]): Analysis {
  const scored = snippets.map((s) => ({ s, v: lexiconScore(s.text) })).filter((x) => x.v !== 0 && /\[SUBJECT\]/.test(x.s.who + x.s.text));
  if (!scored.length) return a;
  const tone = scored.reduce((t, x) => t + Math.sign(x.v), 0) / (scored.length + 2);
  // For bad-news questions (late, fail, single...) negative chat means MORE likely.
  const badNews = /late|fail|miss|skip|dump|single|lose|lost|quit/i.test(a.title) ? -1 : 1;
  return {
    ...a,
    probability: clampP(a.probability + 0.06 * tone * badNews),
    rationale: `${a.rationale} Adjusted slightly for the tone of ${scored.length} shared chat snippet(s).`,
    chatUsed: scored.slice(0, 8).map((x) => ({ ...x.s, why: x.v > 0 ? "positive about them" : "negative about them" })),
  };
}

export async function summarizeOutcome(m: {
  title: string;
  outcome: boolean;
  subjectName: string | null;
  aiProb: number;
  crowdProb: number;
  openProb: number;
  traders: number;
  volume: number;
  biggestWinner: string | null;
  note: string;
}): Promise<string> {
  const fallback = `${m.outcome ? "Happened" : "Didn't happen"}${m.subjectName ? ` (${m.subjectName})` : ""}. Opened at ${(m.openProb * 100).toFixed(0)}%, crowd closed at ${(m.crowdProb * 100).toFixed(0)}%, AI said ${(m.aiProb * 100).toFixed(0)}%. ${m.traders} trader(s), ${m.volume.toFixed(0)} traded.${m.note ? ` Note: ${m.note}` : ""}`;
  const out = await askJson<{ summary: string }>(
    `Summarise this resolved friend-group prediction market in at most 2 short sentences, as a reusable record for pricing similar future questions. Mention the outcome, how surprising it was versus the odds, and any resolver note. No emojis.
Market: "${m.title}" | outcome: ${m.outcome ? "YES" : "NO"} | subject: ${m.subjectName ?? "n/a"} | opened ${(m.openProb * 100).toFixed(0)}% | crowd final ${(m.crowdProb * 100).toFixed(0)}% | AI ${(m.aiProb * 100).toFixed(0)}% | traders ${m.traders} | volume ${m.volume.toFixed(0)} | top winner ${m.biggestWinner ?? "none"} | resolver note: ${m.note || "none"}`,
    { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] }
  );
  return out?.summary ?? fallback;
}

export type RepriceInput = {
  id: number;
  title: string;
  category: string;
  price: number;
  daysLeft: number;
  subjectName: string | null;
  mood: number | null;
  history: string;
  snippets?: Snippet[];
};

/** "Saturday 2026-10-24": small models get weekdays wrong when left to work them out. */
// Spelled out as well, so the model doesn't mis-convert the ISO date when it writes a rule.
const day = (d: Date) => `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} (${d.toISOString().slice(0, 10)})`;

export async function repriceStocks(input: { today: Date; groupContext: string; stocks: RepriceInput[] }, trace?: Trace) {
  if (!input.stocks.length) return [];
  const prompt =
    `You re-mark long-term "stocks" in a friends' play-money prediction market. Each pays out if the outcome happens by maturity.
Today: ${day(input.today)}
Group context (term dates, fixtures, deadlines): ${input.groupContext || "(none)"}
For each stock, give a fair probability. Consider time left, upcoming dates from the context, the on-device chat mood about the subject (-1..+1, null = not shared) and history. Only move a price for a concrete reason; otherwise keep it close to the current price.
${input.stocks
  .map(
    (s) =>
      `- id ${s.id}: "${s.title}" | ${playbook(s.category).label.toLowerCase()}: ${playbook(s.category).weigh.split(". ")[0]} | current ${(s.price * 100).toFixed(1)}% | ${s.daysLeft.toFixed(0)} days left | subject ${s.subjectName ?? "n/a"} | mood ${s.mood == null ? "null" : s.mood.toFixed(2)} | history: ${s.history || "none"}` +
        (s.snippets?.length ? `\n  shared chat snippets ([SUBJECT] = the subject; ignore anything off-topic):\n${s.snippets.map((c) => `  · ${c.age}, ${c.who}: ${c.text}`).join("\n")}` : "")
  )
  .join("\n")}
Give each reason in under 15 words.`;
  const t: Trace = trace ?? { provider: "none", model: "", prompt: "", raw: null, ms: 0 };
  t.prompt = prompt;
  const out = await askJson<{ updates: { id: number; probability: number; reason: string }[] }>(
    prompt,
    {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer" }, probability: { type: "number" }, reason: { type: "string" } },
            required: ["id", "probability", "reason"],
          },
        },
      },
      required: ["updates"],
    },
    undefined,
    t
  );
  if (out?.updates) return out.updates.map((u) => ({ ...u, probability: clampP(u.probability), source: t.provider as AiProvider }));
  // Fallback: nudge by mood only.
  return input.stocks
    .filter((s) => s.mood != null && Math.abs(s.mood) > 0.15)
    .map((s) => ({
      id: s.id,
      probability: clampP(s.price + s.mood! * 0.05),
      reason: `Chat mood ${s.mood! > 0 ? "positive" : "negative"} (${s.mood!.toFixed(2)})`,
      source: "heuristic" as const,
    }));
}
