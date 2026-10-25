/**
 * Gives every stored outcome an embedding, so "similar past situations" are matched by meaning
 * rather than shared words. Safe to rerun: it only fills rows that have none, or vectors from a
 * different embedding model (a different length).
 *
 *   npx tsx --env-file=.env.local scripts/embed-memories.ts
 */
import { getDb } from "../lib/db";
import { embed } from "../lib/ai";

async function main() {
  const db = await getDb();
  const probe = await embed("probe");
  if (!probe) throw new Error("The embedding model didn't answer. Is Ollama running?");
  const rows = await db.query<{ id: number; title: string; n: number | null }>(
    `SELECT id, title, jsonb_array_length(embedding) AS n FROM memories WHERE embedding IS NULL OR jsonb_typeof(embedding) <> 'array' OR jsonb_array_length(embedding) <> $1`,
    [probe.length]
  );
  let done = 0;
  for (const r of rows) {
    const v = await embed(r.title);
    if (!v) continue;
    await db.query(`UPDATE memories SET embedding = $2 WHERE id = $1`, [r.id, JSON.stringify(v)]);
    done++;
  }
  console.log(`Embedded ${done} of ${rows.length} stored outcomes (${probe.length} dimensions)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
