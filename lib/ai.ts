import { GoogleGenAI } from "@google/genai";
import { AI, MARKET } from "./config";

// Privacy rule: nothing in this file ever receives chat messages. Gemini sees the
// situation itself, resolved-history stats, the group's opt-in "AI context"
// (term dates etc.) and, if the group enables it, an aggregate mood score that
// members' browsers compute locally from the encrypted chat.

let client: GoogleGenAI | null = null;
function gemini() {
  if (!AI.enabled) return null;
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return client;
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
    console.warn("[ai] Gemini call failed, using fallback:", (e as Error).message);
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
    console.warn("[ai] embedding failed:", (e as Error).message);
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
}): Promise<Analysis> {
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

Rules:
- kind "bet" = short-term yes/no with a deadline (lateness, a match result, a night out). kind "stock" = long-term outcome that trades like a maturing bond until its date (relationships, grades, promotions, fitness goals). Anything > ${MARKET.stockThresholdDays} days away is usually a stock.
- decay "hazard" if the question is "does X happen at any point before the date" (its price should drift down as time runs out with no news). decay "none" if the outcome is only known on the date (a final grade, a match result).
- probability: your honest calibrated estimate from the evidence, between ${MARKET.minProb} and ${MARKET.maxProb}. Anchor on the base rate when there are several similar past cases; move away only for clear reasons.
- resolutionRule: one precise sentence saying exactly what counts as YES, so nobody argues later.
- title: tidy the situation into a short market question (max 70 chars).
- rationale: one or two friendly sentences citing the evidence used.`;

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
    },
    required: ["title", "kind", "decay", "category", "probability", "rationale", "resolutionRule"],
  });
  if (out && Number.isFinite(out.probability)) {
    return { ...out, probability: clampP(out.probability), source: "gemini" };
  }
  return heuristicAnalysis(input.title, days, input.history);
}

const CATEGORY_WORDS: Record<string, RegExp> = {
  punctuality: /\blate|on time|early|show up|turn up|arrive/i,
  football: /football|goal|match|league|arsenal|chelsea|united|city|liverpool|spurs|fc\b/i,
  sport: /tennis|f1|race|cricket|rugby|boxing|fight|game\b/i,
  uni: /\bfirst\b|2:1|exam|grade|module|dissertation|uni|degree|coursework|lecture/i,
  work: /intern|job|offer|promot|boss|shift|work|spring week|interview/i,
  relationships: /girlfriend|boyfriend|date|dating|crush|single|relationship|text back/i,
  fitness: /gym|run|marathon|weight|kg|steps|bench|lift/i,
  social: /party|club|pres|night out|drink|holiday|trip/i,
  friendship: /friend|fall out|argue|reply|call/i,
};

export function guessCategory(text: string) {
  for (const [c, re] of Object.entries(CATEGORY_WORDS)) if (re.test(text)) return c;
  return "other";
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
      `- id ${s.id}: "${s.title}" | current ${(s.price * 100).toFixed(1)}% | ${s.daysLeft.toFixed(0)} days left | subject ${s.subjectName ?? "n/a"} | mood ${s.mood == null ? "null" : s.mood.toFixed(2)} | history: ${s.history || "none"}`
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
