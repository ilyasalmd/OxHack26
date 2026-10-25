import type { Q } from "./db";
import { embed, type HistoryEvidence } from "./ai";
import { guessCategory } from "./text";

export type Memory = {
  id: number;
  market_id: number | null;
  subject_id: number | null;
  category: string;
  title: string;
  outcome: boolean;
  ai_prob: number | null;
  crowd_prob: number | null;
  summary: string;
  embedding: number[] | null;
  created_at: Date;
};

const STOP = new Set("the a an is be will to of in on at by for and or does do did get gets before after this that it his her their than".split(" "));

// Different words for the same thing, folded together so "Theo cancels" finds "Theo turns up to the
// group call" and "Dad nods off" finds "Dad falls asleep". Which way round each one is worded is
// worked out separately (polarity below), so opposites can share a token here.
const SAME: [RegExp, string][] = [
  [/^(cancel(s|led|ed|ling|ing)?|bail(s|ed)?|flake[sd]?|attend(s|ed|ing)?|show(s|ed)?|turn(s|ed)?|comes?|came|coming|join(s|ed)?|visit(s|ed)?|skip(s|ped)?|miss(es|ed)?|no-?show)$/, "attend"],
  [/^(late|lateness|early|punctual)$/, "late"],
  [/^(asleep|awake|sleep(s|ing)?|slept|naps?|nod(s|ding)?)$/, "sleep"],
  [/^(fail(s|ed)?|pass(es|ed)?)$/, "pass"],
  [/^(lose|loses|lost|wins?|won|beats?)$/, "win"],
  [/^(forget(s)?|forgot|remember(s|ed)?)$/, "remember"],
  [/^(paid|pays?|repays?)$/, "pay"],
  [/^(repl(y|ies|ied)|respond(s|ed)?)$/, "reply"],
  [/^(gym|workouts?)$/, "gym"],
];

/** A rough stem, the same for every form of a word ("makes", "making" and "make" all give "mak"). */
function stem(w: string) {
  if (w.length <= 3) return w;
  return w
    .replace(/(ing|ed)$/, (x) => (w.length > 5 ? "" : x))
    .replace(/ies$/, "y")
    .replace(/([^s])s$/, "$1")
    .replace(/e$/, "");
}

export function tokens(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/\bon time\b/g, " late ")
      .replace(/[^a-z0-9@ -]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length > 1 && !STOP.has(w))
      .map((w) => SAME.find(([re]) => re.test(w))?.[1] ?? stem(w))
  );
}

// Which way a stake is worded, per idea: "Ruby makes the last train" and "Ruby misses the last
// train" are the same question asked the opposite way round, so one's YES is the other's NO.
const POLES: [concept: string, plus: RegExp, minus: RegExp][] = [
  ["late", /\bon time\b|\bearly\b|\bpunctual\b/, /\blate\b/],
  ["attend", /\bmakes? (it|the|his|her|their)\b|\bmade it\b|\bcatch(es)? the\b|\b(shows?|turns?) up\b|\bcomes?\b|\bgo(es)? to\b|\battends?\b|\bjoins?\b|\bvisits?\b/, /\bcancel|\bbails?\b|\bflakes?\b|\bmiss(es|ed)?\b|\bskips?\b|\bsleeps? through\b|\bpulls? out\b|\bno-?show/],
  ["awake", /\bstays? awake\b|\bwithout (falling|nodding)\b/, /\bfall(s|ing)? asleep\b|\bnods? off\b/],
  ["pass", /\bpass(es|ed)?\b/, /\bfail(s|ed)?\b/],
  ["win", /\bwins?\b|\bbeats?\b/, /\blos(e|es|t)\b/],
  ["remember", /\bremembers?\b/, /\bforgets?\b|\bforgot\b/],
  ["over", /\bmore than\b|\bover\b|\bor more\b|\bat least\b|\babove\b/, /\bunder\b|\bless than\b|\bfewer than\b|\bsub-?\d|\bbelow\b/],
];
const NEGATED = /\b(doesn'?t|does not|won'?t|will not|isn'?t|never|not|no longer)\b/;

export function polarity(title: string) {
  const t = title.toLowerCase();
  const neg = NEGATED.test(t) ? -1 : 1;
  const out = new Map<string, number>();
  for (const [concept, plus, minus] of POLES) {
    if (plus.test(t)) out.set(concept, neg);
    else if (minus.test(t)) out.set(concept, -neg);
  }
  return out;
}

/** True when two stakes ask about the same thing worded the opposite way round. */
export function opposite(a: string, b: string) {
  const pa = polarity(a), pb = polarity(b);
  let agree = 0, disagree = 0;
  for (const [k, v] of pa) {
    const w = pb.get(k);
    if (w == null) continue;
    if (w === v) agree++;
    else disagree++;
  }
  return disagree > agree;
}

function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

/** flipped: worded the opposite way round to the new question, so its outcome counts reversed. */
export type Similar = Memory & { similarity: number; flipped: boolean };

/** Whether a past stake came true in the new question's terms. */
export const sameWayOutcome = (m: Pick<Similar, "outcome" | "flipped">) => m.outcome !== m.flipped;

/** Rank this group's past outcomes by how much they resemble a new question.
 * Embedding cosine when Gemma is on, keyword overlap otherwise, with a boost
 * for the same person and the same category. */
export async function findSimilar(q: Q, groupId: number, text: string, subjectId: number | null, limit = 6) {
  const rows = await q.query<Memory>(`SELECT * FROM memories WHERE group_id = $1 ORDER BY created_at DESC LIMIT 500`, [groupId]);
  if (!rows.length) return { similar: [] as Similar[], vector: null as number[] | null };
  const vector = await embed(text);
  const qt = tokens(text);
  const cat = guessCategory(text);
  const scored = rows.map((m) => {
    const lexical = jaccard(qt, tokens(m.title));
    // Only compare vectors from the same embedding model (switching AI changes the length).
    const semantic = vector && m.embedding?.length === vector.length ? Math.max(0, (cosine(vector, m.embedding) - 0.5) * 2) : lexical;
    const flipped = opposite(text, m.title);
    // The same person and the same kind of stake is worth a little even in different words: it is
    // that person's own record (Jake late to the cinema, given Jake late to dinner).
    const ownRecord = !!subjectId && m.subject_id === subjectId && m.category === cat && cat !== "other";
    if (semantic < 0.1 && lexical < 0.1) return { ...m, flipped, similarity: ownRecord ? 0.3 : 0 };
    let s = 0.7 * semantic + 0.3 * lexical;
    // Per-person base rates: the same question about someone else counts for much less.
    if (subjectId && m.subject_id === subjectId) s += 0.25;
    else if (subjectId && m.subject_id && m.subject_id !== subjectId) s -= 0.3;
    if (m.category === cat) s += 0.15;
    return { ...m, flipped, similarity: Math.min(1, s) };
  });
  const similar = scored.filter((m) => m.similarity >= 0.25).sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  return { similar, vector };
}

/** Similarity-weighted Beta(1,1) base rate, in the new question's terms. n is the effective sample size. */
export function baseRate(similar: Similar[]): { rate: number | null; n: number } {
  const w = similar.reduce((s, m) => s + m.similarity, 0);
  if (w < 0.5) return { rate: null, n: w };
  const yes = similar.reduce((s, m) => s + m.similarity * (sameWayOutcome(m) ? 1 : 0), 0);
  return { rate: (1 + yes) / (2 + w), n: w };
}

/** "7 of 9 came true", counting each past stake the way the new question is worded. */
function record(rows: Memory[], text: string) {
  if (!rows.length) return undefined;
  const flips = rows.filter((m) => opposite(text, m.title)).length;
  const yes = rows.filter((m) => m.outcome !== opposite(text, m.title)).length;
  return `${yes} of ${rows.length} came true${flips ? ` (counting ${flips} worded the other way round as the opposite)` : ""}`;
}

export async function evidenceFor(q: Q, groupId: number, text: string, subjectId: number | null) {
  const { similar, vector } = await findSimilar(q, groupId, text, subjectId);
  const { rate, n } = baseRate(similar);
  let subjectRecord: string | undefined;
  if (subjectId) {
    const [r] = await q.query<{ total: string; yes: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE outcome) AS yes FROM memories WHERE group_id = $1 AND subject_id = $2`,
      [groupId, subjectId]
    );
    if (Number(r.total) > 0) subjectRecord = `${r.yes} of ${r.total} past situations about them came true`;
  }
  // The same kind of stake: this group's record on it, and the subject's own.
  const cat = guessCategory(text);
  let categoryRecord: string | undefined, subjectCategoryRecord: string | undefined;
  if (cat !== "other") {
    const rows = await q.query<Memory>(`SELECT id, subject_id, title, outcome FROM memories WHERE group_id = $1 AND category = $2`, [groupId, cat]);
    categoryRecord = record(rows, text);
    if (subjectId) subjectCategoryRecord = record(rows.filter((m) => m.subject_id === subjectId), text);
  }
  const history: HistoryEvidence = {
    baseRate: rate,
    n,
    subjectRecord,
    categoryRecord,
    subjectCategoryRecord,
    examples: similar.slice(0, 5).map((m) => ({ title: m.title, outcome: m.outcome, summary: m.summary, flipped: m.flipped })),
  };
  return { history, similar, vector };
}
