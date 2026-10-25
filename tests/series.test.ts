import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Charts on a busy stake used to load only the oldest rows, so the line stopped days before today.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-series-"));
delete process.env.DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.SOLANA_MINT = "";
process.env.SOLANA_RPC_URL = "";

let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>;
let series: typeof import("../lib/series");

before(async () => {
  db = await (await import("../lib/db")).getDb();
  series = await import("../lib/series");
});

test("a busy price chart keeps its first point and reaches the newest one", async () => {
  const start = Date.UTC(2026, 8, 1);
  const n = 5000;
  // 5,000 ticks over 30 days for one stake (market_id 777: price_ticks has no foreign key to check).
  const values = Array.from({ length: n }, (_, i) => `(777, '${new Date(start + i * 9 * 60_000).toISOString()}', ${(0.3 + (i / n) * 0.5).toFixed(4)}, 'trade')`);
  for (let i = 0; i < n; i += 1000) await db.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ${values.slice(i, i + 1000).join(",")}`);
  const points = await series.chartPoints<{ ts: Date; price: number }>(db, series.PRICE_SERIES, 777, 1500);
  assert.ok(points.length <= 1501, `kept ${points.length}`);
  assert.ok(points.length > 1000, "still detailed");
  assert.equal(+new Date(points[0].ts), start);
  assert.equal(+new Date(points[points.length - 1].ts), start + (n - 1) * 9 * 60_000, "ends at the newest point");
  assert.ok(points.every((p, i) => i === 0 || +new Date(p.ts) > +new Date(points[i - 1].ts)), "in time order, no repeats");
});

test("a quiet chart comes back whole", async () => {
  await db.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES (778, now() - interval '1 hour', 0.5, 'open'), (778, now(), 0.6, 'trade')`);
  const points = await series.chartPoints<{ price: number; ts: Date }>(db, series.PRICE_SERIES, 778);
  assert.deepEqual(points.map((p) => Number(p.price)), [0.5, 0.6]);
});
