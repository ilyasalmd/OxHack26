import { GoogleGenAI } from "@google/genai";
import { AI, MARKET } from "./config";
import { guessCategory } from "./text";
import { lexiconScore } from "./mood";
import type { Snippet } from "./chat-context";

export { guessCategory };

// Privacy rule: Gemini sees the situation itself, resolved-history stats, the
// group's "AI context" (term dates etc.) and an optional on-device mood score.
// Chat text only arrives if the group has switched on "AI reads relevant chat":
// then members' browsers send at most 20 snippets they picked as relevant, with
// names replaced by roles and contact details removed (lib/chat-context.ts).

let client: GoogleGenAI | null = null;
// After a quota or billing refusal, stop asking for a while and use the fallbacks, so
// the log carries one line instead of one per request.
let pausedUntil = 0;
function gemini() {
  if (!AI.enabled || Date.now() < pausedUntil) return null;
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return client;
}
function failed(what: string, e: unknown) {
  const msg = (e as Error).message;
  if (/"code":\s*(402|403|429)|RESOURCE_EXHAUSTED|PERMISSION_DENIED/.test(msg)) {
    pausedUntil = Date.now() + 10 * 60_000;
    console.warn(`[ai] Gemini refused (${msg.match(/"code":\s*(\d+)/)?.[1] ?? "quota"}); using fallbacks for 10 minutes`);
  } else console.warn(`[ai] ${what}:`, msg);
}

async function askJson<T>(prompt: string, schema: object, timeoutMs = 12000): Promise<T | null> {
  const ai = gemini();
  if (!ai) return null;
  try {
    const res = await Promise.race([
      ai.models.generateContent({
        model: AI.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature: 0.3,
          ...(AI.model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Gemini timeout")), timeoutMs)),
    ]);
    return JSON.parse(res.text ?? "null") as T;
  } catch (e) {
    failed("Gemini call failed, using fallback", e);
    return null;
  }
}

export async function embed(text: string): Promise<number[] | null> {
  const ai = gemini();
  if (!ai) return null;
  try {
    const res = await ai.models.embedContent({
      model: AI.embeddingModel,
      contents: text,
      config: { outputDimensionality: 256 },
    });
    return res.embeddings?.[0]?.values ?? null;
  } catch (e) {
    failed("embedding failed", e);
    return null;
  }
}

export type HistoryEvidence = {
  baseRate: number | null;
  n: number;
  subjectRecord?: string;
  examples: { title: string; outcome: boolean; summary: string }[];
};

export type Analysis = {
  title: string;
  kind: "bet" | "stock";
  decay: "none" | "hazard";
  category: string;
  probability: number;
  rationale: string;
  resolutionRule: string;
  source: "gemini" | "heuristic";
  /** Snippets the AI kept as relevant, with its reason. Everything else was ignored. */
  chatUsed: (Snippet & { why: string })[];
};

export const CATEGORIES = ["punctuality", "football", "sport", "work", "uni", "relationships", "friendship", "fitness", "social", "other"];

const clampP = (p: number) => Math.min(MARKET.maxProb, Math.max(MARKET.minProb, p));

export async function analyzeSituation(input: {
  title: string;
  description: string;
  resolvesAt: Date;
  now: Date;
  subjectName: string | null;
  groupContext: string;
  mood: number | null;
  history: HistoryEvidence;
  snippets?: Snippet[];
}): Promise<Analysis> {
  const snippets = input.snippets ?? [];
  const days = (input.resolvesAt.getTime() - input.now.getTime()) / 86400000;
  const prompt = `You are the pricing desk of "Friend Stocks", a play-money prediction market inside a friends' group chat.
Friends post situations about each other. Decide how to list this one and its fair probability.

Situation: "${input.title}"
Details: ${input.description || "(none)"}
About: ${input.subjectName ?? "nobody specific"}
Today: ${input.now.toISOString().slice(0, 10)}; resolves on ${input.resolvesAt.toISOString().slice(0, 10)} (${days.toFixed(1)} days away).
Group context the friends chose to share (term dates, fixtures, deadlines): ${input.groupContext || "(none)"}
${input.mood != null ? `Aggregate chat mood about the subject, computed on-device (-1 negative .. +1 positive): ${input.mood.toFixed(2)}` : ""}
Past resolved situations in this group that look similar (${input.history.n.toFixed(1)} effective samples, base rate ${input.history.baseRate == null ? "n/a" : (input.history.baseRate * 100).toFixed(0) + "%"}):
${input.history.examples.map((e) => `- "${e.title}" → ${e.outcome ? "YES" : "NO"}. ${e.summary}`).join("\n") || "- none yet"}
${input.history.subjectRecord ? `Subject's record: ${input.history.subjectRecord}` : ""}
${snippets.length ? `Recent group-chat snippets the friends chose to share (names replaced: [SUBJECT] is who it's about, Friend A/B are others). Many may be noise:
${snippets.map((s, i) => `[${i}] ${s.age}, ${s.who}: ${s.text}`).join("\n")}` : ""}

Rules:
- kind "bet" = short-term yes/no with a deadline (lateness, a match result, a night out). kind "stock" = long-term outcome that trades like a maturing bond until its date (relationships, grades, promotions, fitness goals). Anything > ${MARKET.stockThresholdDays} days away is usually a stock.
- decay "hazard" if the question is "does X happen at any point before the date" (its price should drift down as time runs out with no news). decay "none" if the outcome is only known on the date (a final grade, a match result).
- probability: your honest calibrated estimate from the evidence, between ${MARKET.minProb} and ${MARKET.maxProb}. Anchor on the base rate when there are several similar past cases; move away only for clear reasons.
- resolutionRule: one precise sentence saying exactly what counts as YES, so nobody argues later.
- title: tidy the situation into a short market question (max 70 chars).
- rationale: one or two friendly sentences citing the evidence used.
- usefulSnippets: only the chat snippets that genuinely change the odds (plans, excuses, admissions, schedules, track record), each with a short reason. Ignore banter, jokes and anything off-topic. Empty if none.`;

  const out = await askJson<Omit<Analysis, "source">>(prompt, {
    type: "object",
    properties: {
      title: { type: "string" },
      kind: { type: "string", enum: ["bet", "stock"] },
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
    required: ["title", "kind", "decay", "category", "probability", "rationale", "resolutionRule", "usefulSnippets"],
  });
  if (out && Number.isFinite(out.probability)) {
    const { usefulSnippets, ...rest } = out as typeof out & { usefulSnippets?: { i: number; why: string }[] };
    const chatUsed = (usefulSnippets ?? []).filter((u) => snippets[u.i]).slice(0, 8).map((u) => ({ ...snippets[u.i], why: u.why }));
    return { ...rest, probability: clampP(out.probability), source: "gemini", chatUsed };
  }
  const h = heuristicAnalysis(input.title, days, input.history);
  return snippets.length ? applySnippetTilt(h, snippets) : h;
}

/** No API key (or Gemini down): still produce sensible odds from history alone. */
export function heuristicAnalysis(title: string, days: number, history: HistoryEvidence): Analysis {
  const category = guessCategory(title);
  const kind = days > MARKET.stockThresholdDays || /girlfriend|boyfriend|first|degree|promot|marathon/i.test(title) ? "stock" : "bet";
  const outcomeOnDate = /\bpass|grade|first\b|2:1|win|score|beat|result/i.test(title);
  const prior = category === "punctuality" ? 0.55 : kind === "stock" ? 0.35 : 0.5;
  const p = history.baseRate == null ? prior : (history.baseRate * history.n + prior * 2) / (history.n + 2);
  return {
    title: title.slice(0, 70),
    kind,
    decay: kind === "stock" && !outcomeOnDate ? "hazard" : "none",
    category,
    probability: clampP(p),
    rationale:
      history.n > 0
        ? `Based on ${history.n.toFixed(0)} similar past situation(s) here, which came true ${((history.baseRate ?? 0) * 100).toFixed(0)}% of the time.`
        : `No history yet, so this opens near a neutral ${(prior * 100).toFixed(0)}% for ${category} situations.`,
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
  price: number;
  daysLeft: number;
  subjectName: string | null;
  mood: number | null;
  history: string;
  snippets?: Snippet[];
};

export async function repriceStocks(input: { today: Date; groupContext: string; stocks: RepriceInput[] }) {
  if (!input.stocks.length) return [];
  const out = await askJson<{ updates: { id: number; probability: number; reason: string }[] }>(
    `You re-mark long-term "stocks" in a friends' play-money prediction market. Each pays out if the outcome happens by maturity.
Today: ${input.today.toISOString().slice(0, 10)}
Group context (term dates, fixtures, deadlines): ${input.groupContext || "(none)"}
For each stock, give a fair probability. Consider time left, upcoming dates from the context, the on-device chat mood about the subject (-1..+1, null = not shared) and history. Only move a price for a concrete reason; otherwise keep it close to the current price.
${input.stocks
  .map(
    (s) =>
      `- id ${s.id}: "${s.title}" | current ${(s.price * 100).toFixed(1)}% | ${s.daysLeft.toFixed(0)} days left | subject ${s.subjectName ?? "n/a"} | mood ${s.mood == null ? "null" : s.mood.toFixed(2)} | history: ${s.history || "none"}` +
        (s.snippets?.length ? `\n  shared chat snippets ([SUBJECT] = the subject; ignore anything off-topic):\n${s.snippets.map((c) => `  · ${c.age}, ${c.who}: ${c.text}`).join("\n")}` : "")
  )
  .join("\n")}
Give each reason in under 15 words.`,
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
    }
  );
  if (out?.updates) return out.updates.map((u) => ({ ...u, probability: clampP(u.probability), source: "gemini" as const }));
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
