// Pure safety rules shared by the server and the browser: what a situation may be about,
// the report reasons, and how long a proposed result waits before it finalises.

/** A proposed result finalises on its own this long (app clock) after it was proposed. */
export const SETTLE_WINDOW_HOURS = 24;
export const SETTLE_WINDOW_MS = SETTLE_WINDOW_HOURS * 3600_000;

/** Every situation gets an answer: if nobody has put a result forward this long after the deadline,
 * it settles the way the market leans. */
export const MATURITY_FALLBACK_HOURS = 72;
export const MATURITY_FALLBACK_MS = MATURITY_FALLBACK_HOURS * 3600_000;
/** Within this many points of 50%, or with nobody trading, it's too close to call: void and refund. */
export const TOO_CLOSE_TO_CALL = 0.05;

/** What happens at maturity, in words, for the rules card and the terms. */
export function maturityRule(yes = "YES", no = "NO") {
  return `After the deadline, whoever posted it calls the result, and a day later anyone can (never the person it's about). It settles when another member confirms it, or after ${SETTLE_WINDOW_HOURS} hours with no dispute. A dispute calls it off and refunds everyone. If nobody calls it within ${MATURITY_FALLBACK_HOURS / 24} days of the deadline, it settles the way the market leans: above 50% the ${yes} side wins, below 50% the ${no} side does; if the market is within ${TOO_CLOSE_TO_CALL * 100} points of 50% or nobody traded, it's called off and everyone is refunded.`;
}

/** This many distinct members reporting a situation voids it (its subject alone is enough). */
export const REPORTS_TO_VOID = 2;

export const REPORT_REASONS = [
  { id: "mean", label: "Mean or humiliating", hint: "Picks on someone" },
  { id: "private", label: "Private or sensitive", hint: "Shares something personal" },
  { id: "unsafe", label: "Unsafe", hint: "Could put someone at risk" },
  { id: "spam", label: "Spam", hint: "Not a real stake" },
  { id: "other", label: "Something else", hint: "" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as [ReportReason, ...ReportReason[]];

export const KIND_TOPIC_MESSAGE = "Keep it to things people choose to do";

// Each entry is a whole word or phrase. Matching is on word boundaries, so "assess" never trips
// "ass" and "deadline" never trips "dead". Phrases use \\s+ so spacing doesn't matter. This is a
// starting list that favours precision: the Report button covers whatever it misses.
const TOPICS: { label: string; words: string[] }[] = [
  {
    label: "health conditions",
    words: [
      "cancer", "tumou?r", "diagnos(?:ed|is|es)", "illness(?:es)?", "disabilit(?:y|ies)", "diabet(?:es|ic)", "epilep(?:sy|tic)", "asthma", "autis(?:m|tic)",
      "adhd", "dyslex(?:ia|ic)", "depress(?:ed|ion)", "anxiety", "bipolar", "schizophreni\\w*", "ocd", "ptsd", "panic\\s+attacks?",
      "mental\\s+(?:health|illness|breakdown)", "therap(?:y|ist)", "psychiatr\\w*", "rehab", "addict(?:ed|ion)?", "alcoholism", "hiv", "aids",
      "stds?", "stis?", "herpes", "chlamydia", "covid", "hospitali[sz]ed", "surgery", "medication", "acne", "pimples?",
    ],
  },
  {
    label: "pregnancy",
    words: ["pregnan(?:t|cy)", "expecting\\s+a\\s+baby", "baby\\s+bump", "knocked\\s+up", "miscarriage", "miscarried", "abortion", "fertility", "ivf"],
  },
  {
    label: "death or self-harm",
    words: [
      "die[sd]?", "dying", "dead", "death", "deaths", "suicid(?:e|al)", "self[\\s-]*harm(?:s|ed|ing)?", "kys",
      "(?:kill|kills|killed|killing|hang|hangs|cut|cuts|cutting)\\s+(?:him|her|them|my|your|it)?self",
      "(?:kill|kills|killed|killing)\\s+(?:them|our|your)selves", "end\\s+it\\s+all", "overdos(?:e|es|ed|ing)", "funeral", "passes\\s+away", "passed\\s+away",
    ],
  },
  {
    label: "sexuality",
    words: [
      "gay", "lesbian", "bisexual", "queer", "homosexual", "heterosexual", "transgender", "trans", "non[\\s-]?binary", "sexuality", "sexual\\s+orientation",
      "gender\\s+identity", "(?:comes?|coming|came)\\s+out\\s+as", "sex", "sexual(?:ly)?", "sext(?:s|ing)?", "virgin(?:ity)?", "nudes?", "porn\\w*",
      "one[\\s-]*night[\\s-]*stand", "hook(?:s|ed|ing)?[\\s-]*up\\s+with",
    ],
  },
  {
    label: "weight or body",
    words: [
      "weigh(?:s|ed|ing)?", "weight\\s+(?:loss|gain)", "(?:lose|loses|lost|losing|gain|gains|gained|gaining|put|puts|putting)\\s+(?:on\\s+)?(?:any\\s+|more\\s+|some\\s+)?weight",
      "fat", "obes(?:e|ity)", "overweight", "underweight", "skinny", "chubby", "bmi", "body\\s+(?:fat|count|shape|type|image)", "anorexi(?:a|c)", "bulimi(?:a|c)",
      "eating\\s+disorders?", "bald(?:ing)?", "plastic\\s+surgery",
    ],
  },
  {
    label: "religion",
    words: [
      "relig(?:ion|ious|ions)", "allah", "christianity", "christians", "muslims?", "islam(?:ic)?", "jew(?:s|ish)?", "judaism", "hindu(?:s|ism)?", "sikh(?:s|ism)?",
      "buddhis(?:t|ts|m)", "atheis(?:t|ts|m)", "agnostic", "catholic(?:s|ism)?", "protestants?", "church", "mosque", "synagogue", "gurdwara", "prayers?",
      "ramadan", "eid", "hijab", "burka", "niqab", "turban", "kippah", "bible", "qur'?an", "koran", "baptis(?:ed|m)", "baptiz(?:ed|m)",
    ],
  },
  {
    label: "ethnicity",
    words: [
      "ethnic(?:ity|ities)?", "racial(?:ly)?", "racis(?:t|ts|m)", "skin\\s+colou?r", "(?:his|her|their|my|your|what|which)\\s+race", "immigrants?", "refugees?",
      "asylum\\s+seekers?", "people\\s+of\\s+colou?r",
    ],
  },
];

// Everyday phrases that contain a banned word but aren't about a person's body, health or faith.
const SAFE_PHRASES = [
  /\b(?:phone|battery|laptop|car|engine|tablet|speaker|watch|controller|mic|vape|charger|torch)\s+(?:\w+\s+){0,2}(?:die[sd]?|dead|dying)\b/g,
  /\b(?:die|dies|died)\s+hard\b|\bdie[\s-]?hard\b|\bto\s+die\s+for\b|\bdead\s+(?:heat|on\s+time|centre|center|good|set)\b|\bdead\s*lift\w*\b/g,
  /\bfat\s+chance\b|\bfat\s+finger\w*\b|\bfat\s+tuesday\b/g,
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

/** Lower-case, strip accents and zero-width characters, and undo simple letter-for-symbol swaps. */
function normalise(s: string) {
  const plain = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u200b-\u200f\u2060\ufeff]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  const leet = plain
    .split(/(\s+)/)
    .map((w) => (/[a-z]/.test(w) ? w.replace(/[013457@$!]/g, (c) => LEET[c]) : w))
    .join("");
  return [plain, leet].map((v) => SAFE_PHRASES.reduce((t, re) => t.replace(re, " "), v));
}

let compiled: { label: string; re: RegExp }[] | null = null;
// Built on first use, so pages that only need the report reasons never compile these.
const patterns = () =>
  (compiled ??= TOPICS.map((t) => ({ label: t.label, re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${t.words.join("|")})(?![\\p{L}\\p{N}])`, "u") })));

/** The topic a piece of text falls under, or null when it is fine. */
export function bannedTopic(...texts: (string | null | undefined)[]): string | null {
  for (const raw of texts) {
    if (!raw) continue;
    for (const variant of normalise(raw)) for (const t of patterns()) if (t.re.test(variant)) return t.label;
  }
  return null;
}

/** The kind 400 message for a rejected situation, or null when the text is allowed. */
export function topicProblem(title: string, description?: string | null): string | null {
  const topic = bannedTopic(title, description);
  return topic ? `${KIND_TOPIC_MESSAGE}. Stakes about ${topic} aren't allowed here.` : null;
}
