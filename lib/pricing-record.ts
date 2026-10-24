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

/** How the opening price follows from the AI's answer and the group's history. */
export function openingMaths(aiProb: number, baseRate: number | null, n: number) {
  const weight = baseRate == null ? 0 : MARKET.historyWeight * Math.min(1, n / 3);
  const raw = (1 - weight) * aiProb + weight * (baseRate ?? 0);
  const openProb = Math.min(MARKET.maxProb, Math.max(MARKET.minProb, raw));
  return {
    rule: `weight = ${MARKET.historyWeight} x min(1, n / 3) when there is a base rate, else 0; open = (1 - weight) x AI + weight x base rate, clamped to ${MARKET.minProb}..${MARKET.maxProb}`,
    aiProb,
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
