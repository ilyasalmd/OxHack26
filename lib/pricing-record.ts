import crypto from "node:crypto";
import type { Q } from "./db";
import type { Trace } from "./ai";
import { MARKET } from "./config";
import { mac } from "./secret";

// A pricing record is plain JSON text plus its SHA-256. The text is stored exactly as hashed, so
// anyone holding it can recompute the hash and compare it with the copy in the on-chain memo.
// The subject's profile answers never go in: the prompt has them blanked, and the record keeps
// only a keyed digest, which proves later which answers were used without revealing them.

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function profileCommitment(profile: string | undefined) {
  if (!profile) return null;
  return { answers: profile.split("\n").length, digest: mac(`profile:${profile}`) };
}

/** What the AI had to go on besides general knowledge. */
export type Signals = { profile: boolean; chat: number };

/** How the opening price follows from the AI's answer, the group's history and how much evidence there was. */
export function openingMaths(aiProb: number, baseRate: number | null, n: number, signals: Signals = { profile: false, chat: 0 }) {
  const evidence = n + (signals.profile ? 1 : 0) + Math.min(1, signals.chat / 3);
  const trust = MARKET.coldTrust + (1 - MARKET.coldTrust) * Math.min(1, evidence / MARKET.fullEvidence);
  const aiShrunk = 0.5 + trust * (aiProb - 0.5);
  const weight = baseRate == null ? 0 : MARKET.historyWeight * Math.min(1, n / 3);
  const raw = (1 - weight) * aiShrunk + weight * (baseRate ?? 0);
  const openProb = Math.min(MARKET.maxProb, Math.max(MARKET.minProb, raw));
  return {
    rule: `evidence = similar past situations + 1 for profile answers + up to 1 for chat; trust = ${MARKET.coldTrust} + ${1 - MARKET.coldTrust} x min(1, evidence / ${MARKET.fullEvidence}); AI' = 0.5 + trust x (AI - 0.5); weight = ${MARKET.historyWeight} x min(1, n / 3) when there is a base rate, else 0; open = (1 - weight) x AI' + weight x base rate, clamped to ${MARKET.minProb}..${MARKET.maxProb}`,
    aiProb,
    evidence: +evidence.toFixed(2),
    trust: +trust.toFixed(3),
    aiShrunk,
    lowData: evidence < 1,
    baseRate,
    effectiveSamples: n,
    weight,
    openProb,
  };
}

export function traceFields(t: Trace | undefined) {
  return {
    provider: t?.provider && t.provider !== "none" ? t.provider : "heuristic",
    model: t?.model || null,
    ms: t?.ms ?? 0,
    prompt: t?.prompt ?? null,
    rawOutput: t?.raw ?? null,
    error: t?.error ?? null,
  };
}

export async function saveRecord(q: Q, groupId: number, marketIds: number[], kind: "open" | "reprice", body: object, at: Date) {
  const record = JSON.stringify({ v: 1, kind, at: at.toISOString(), group: groupId, ...body }, null, 2);
  const hash = sha256(record);
  await q.query(`INSERT INTO pricing_records (group_id, market_ids, kind, record, sha256, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
    groupId,
    marketIds,
    kind,
    record,
    hash,
    at,
  ]);
  return hash;
}
