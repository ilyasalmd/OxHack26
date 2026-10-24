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
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9@ ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w))
  );

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

export type Similar = Memory & { similarity: number };

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
    if (semantic < 0.1 && lexical < 0.1) return { ...m, similarity: 0 };
    let s = 0.7 * semantic + 0.3 * lexical;
    // Per-person base rates: the same question about someone else counts for much less.
    if (subjectId && m.subject_id === subjectId) s += 0.25;
    else if (subjectId && m.subject_id && m.subject_id !== subjectId) s -= 0.3;
    if (m.category === cat) s += 0.15;
    return { ...m, similarity: Math.min(1, s) };
  });
  const similar = scored.filter((m) => m.similarity >= 0.25).sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  return { similar, vector };
}

/** Similarity-weighted Beta(1,1) base rate. n is the effective sample size. */
export function baseRate(similar: Similar[]): { rate: number | null; n: number } {
  const w = similar.reduce((s, m) => s + m.similarity, 0);
  if (w < 0.5) return { rate: null, n: w };
  const yes = similar.reduce((s, m) => s + m.similarity * (m.outcome ? 1 : 0), 0);
  return { rate: (1 + yes) / (2 + w), n: w };
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
  const history: HistoryEvidence = {
    baseRate: rate,
    n,
    subjectRecord,
    examples: similar.slice(0, 5).map((m) => ({ title: m.title, outcome: m.outcome, summary: m.summary })),
  };
  return { history, similar, vector };
}
