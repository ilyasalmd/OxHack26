/**
 * Copies a seeded local PGlite database into DATABASE_URL in bulk.
 *
 *   npm run seed:fast
 *
 * The seed replays three months through the market engine, which is thousands of small
 * queries: seconds against embedded PGlite, most of an hour across the Atlantic to Tiger
 * Cloud. So seed locally, then ship the finished rows over in a few big inserts. The
 * Timescale hypertables, candles and compression policies are created by the app's own
 * migration before the rows go in.
 */
import { PGlite } from "@electric-sql/pglite";
import { getDb } from "../lib/db";

const SOURCE = process.env.SEED_PGLITE_DIR ?? ".data/seed-pglite";
// Parents before children, so foreign keys hold on every insert.
const TABLES = ["app_settings", "users", "groups", "group_members", "group_keys", "markets", "messages", "positions", "trades", "price_ticks", "balance_ticks", "ledger", "memories", "chain_ops"];
const g = globalThis as unknown as { __fsDb?: unknown };

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set: nothing to copy into");
  const src = await PGlite.create(SOURCE);
  let db = await getDb();
  await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  g.__fsDb = undefined;
  db = await getDb();

  for (const t of TABLES) {
    const rows = (await src.query<Record<string, unknown>>(`SELECT * FROM ${t}`)).rows;
    if (!rows.length) continue;
    const json = new Set(
      (await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND data_type IN ('json', 'jsonb')`, [t])).map((c) => c.column_name)
    );
    const cols = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += 400) {
      const batch = rows.slice(i, i + 400);
      const params: unknown[] = [];
      const values = batch.map((r) => `(${cols.map((c) => (params.push(json.has(c) && r[c] != null ? JSON.stringify(r[c]) : r[c]), `$${params.length}`)).join(",")})`);
      await db.query(`INSERT INTO ${t} (${cols.join(",")}) VALUES ${values.join(",")}`, params);
    }
    if (cols.includes("id")) await db.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT max(id) FROM ${t}))`);
    console.log(`${t}: ${rows.length}`);
  }
  if (db.timescale) await db.exec(`CALL refresh_continuous_aggregate('price_candles_1h', NULL, NULL)`);
  console.log(`Copied into ${db.timescale ? "Timescale" : "Postgres"}.`);
  await src.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
