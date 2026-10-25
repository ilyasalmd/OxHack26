import { z } from "zod";
import { getDb } from "@/lib/db";
import { route } from "@/lib/auth";
import { body } from "@/lib/http";
import { now } from "@/lib/clock";
import { PROFILE_MAX, PROFILE_QUESTIONS } from "@/lib/profile-questions";

// Your own "about you" answers. Only you can read or change them; the AI reads them as context
// for odds about you, and no other member ever sees them.

export const GET = route(async (_req, user) => {
  const db = await getDb();
  const [p] = await db.query<{ answers: Record<string, string>; done: boolean }>(`SELECT answers, done FROM profiles WHERE user_id = $1`, [user.id]);
  return { answers: p?.answers ?? {}, done: p?.done ?? true };
});

const ids = new Set(PROFILE_QUESTIONS.map((q) => q.id));
// A partial record: any subset of the known question ids.
const Answers = z.record(z.string(), z.string().max(PROFILE_MAX)).refine((a) => Object.keys(a).every((k) => ids.has(k)), "Unknown question");

export const PUT = route(async (req, user) => {
  const b = await body(req, z.object({ answers: Answers.optional(), done: z.boolean().optional() }));
  const db = await getDb();
  const [cur] = await db.query<{ answers: Record<string, string> }>(`SELECT answers FROM profiles WHERE user_id = $1`, [user.id]);
  const merged: Record<string, string> = { ...(cur?.answers ?? {}) };
  for (const [k, v] of Object.entries(b.answers ?? {})) {
    const t = (v ?? "").trim();
    if (t) merged[k] = t;
    else delete merged[k];
  }
  await db.query(
    `INSERT INTO profiles (user_id, answers, done, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET answers = $2, done = COALESCE($5, profiles.done), updated_at = $4`,
    [user.id, JSON.stringify(merged), b.done ?? false, now(), b.done ?? null]
  );
  return { answers: merged };
});

export const DELETE = route(async (_req, user) => {
  const db = await getDb();
  await db.query(`UPDATE profiles SET answers = '{}'::jsonb, updated_at = $2 WHERE user_id = $1`, [user.id, now()]);
  return { answers: {} };
});
