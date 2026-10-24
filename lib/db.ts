import fs from "node:fs";
import path from "node:path";

// One tiny interface over two drivers: real Postgres (local, Timescale or Tiger
// Cloud) when DATABASE_URL is set, otherwise embedded PGlite so the demo runs
// with zero setup.
export interface Q {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}
interface Db extends Q {
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  driver: "postgres" | "pglite";
  timescale: boolean;
}

const g = globalThis as unknown as { __fsDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const tls = /sslmode=require|tsdb\.cloud|timescale\.com/.test(url);
    const pool = new Pool({
      // pg lets ?sslmode= in the URL override the ssl option below (and treats "require" as
      // verify-full), so drop it and keep the TLS setting in one place.
      connectionString: tls ? url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "") : url,
      ssl: tls ? { rejectUnauthorized: false } : undefined,
      max: 8,
    });
    return {
      driver: "postgres",
      timescale: false,
      async query(sql, params) {
        return (await pool.query(sql, params as any[])).rows;
      },
      async exec(sql) {
        await pool.query(sql);
      },
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const out = await fn({ query: async (s, p) => (await client.query(s, p as any[])).rows });
          await client.query("COMMIT");
          return out;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const pg = await PGlite.create(dir);
  return {
    driver: "pglite",
    timescale: false,
    async query(sql, params) {
      return (await pg.query(sql, params as any[])).rows as any[];
    },
    async exec(sql) {
      await pg.exec(sql);
    },
    async tx(fn) {
      return pg.transaction(async (t) => fn({ query: async (s, p) => (await t.query(s, p as any[])).rows as any[] }));
    },
  };
}

async function migrate(db: Db) {
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");
  await db.exec(schema);
  if (db.driver !== "postgres") return;
  const [ext] = await db.query(`SELECT 1 AS ok FROM pg_available_extensions WHERE name = 'timescaledb'`);
  if (!ext) return;
  // Each step is idempotent and isolated, so a re-run (or an older Timescale) never blocks startup.
  const step = async (sql: string, params?: unknown[]) => {
    try {
      await (params ? db.query(sql, params) : db.exec(sql));
      return true;
    } catch (e) {
      console.warn("[db] Timescale step skipped:", (e as Error).message.split("\n")[0]);
      return false;
    }
  };
  if (!(await step(`CREATE EXTENSION IF NOT EXISTS timescaledb`))) return;
  for (const t of ["price_ticks", "balance_ticks"]) {
    await step(`SELECT create_hypertable($1::regclass, 'ts', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE, migrate_data => TRUE)`, [t]);
  }
  // Hourly OHLC candles, kept fresh in the background by Timescale.
  const candles = await step(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS price_candles_1h
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
    SELECT market_id, time_bucket(INTERVAL '1 hour', ts) AS bucket,
           first(price, ts) AS open, max(price) AS high, min(price) AS low,
           last(price, ts) AS close, count(*) AS ticks
    FROM price_ticks GROUP BY market_id, bucket WITH NO DATA`);
  await step(`SELECT add_continuous_aggregate_policy('price_candles_1h',
      start_offset => INTERVAL '90 days', end_offset => INTERVAL '1 minute',
      schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE)`);
  await step(`ALTER TABLE price_ticks SET (timescaledb.compress, timescaledb.compress_segmentby = 'market_id')`);
  await step(`SELECT add_compression_policy('price_ticks', INTERVAL '30 days', if_not_exists => TRUE)`);
  await step(`ALTER TABLE balance_ticks SET (timescaledb.compress, timescaledb.compress_segmentby = 'user_id')`);
  await step(`SELECT add_compression_policy('balance_ticks', INTERVAL '30 days', if_not_exists => TRUE)`);
  db.timescale = candles;
}

export function getDb(): Promise<Db> {
  if (!g.__fsDb) {
    g.__fsDb = connect().then(async (db) => {
      await migrate(db);
      const { loadClock } = await import("./clock");
      await loadClock(db);
      return db;
    });
    g.__fsDb.catch(() => (g.__fsDb = undefined));
  }
  return g.__fsDb;
}
