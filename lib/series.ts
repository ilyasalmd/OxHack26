import type { Q } from "./db";

type Series = { table: "price_ticks" | "balance_ticks"; key: "market_id" | "user_id"; cols: string };
export const PRICE_SERIES: Series = { table: "price_ticks", key: "market_id", cols: "ts, price, source" };
export const BALANCE_SERIES: Series = { table: "balance_ticks", key: "user_id", cols: "ts, balance, net_worth" };

/**
 * A chart's points, at most about `max` of them, always running from the first point to the newest.
 * A busy series is cut into equal time slices and keeps the last point of each (plus the very first),
 * so the line still ends where the price or balance is now. Taking the first `max` rows instead
 * stopped busy charts days before today.
 */
export async function chartPoints<T extends { ts: Date | string }>(q: Q, s: Series, id: number, max = 1500): Promise<T[]> {
  const [span] = await q.query<{ a: Date | null; z: Date | null; n: number }>(
    `SELECT min(ts) AS a, max(ts) AS z, count(*)::int AS n FROM ${s.table} WHERE ${s.key} = $1`,
    [id]
  );
  if (!span?.n || span.n <= max) return q.query<T>(`SELECT ${s.cols} FROM ${s.table} WHERE ${s.key} = $1 ORDER BY ts`, [id]);
  const a = new Date(span.a!), z = new Date(span.z!);
  const secs = Math.max(1, (z.getTime() - a.getTime()) / 1000 / (max - 1));
  const rows = await q.query<T>(
    `(SELECT ${s.cols} FROM ${s.table} WHERE ${s.key} = $1 ORDER BY ts LIMIT 1)
     UNION ALL
     (SELECT ${s.cols} FROM (
        SELECT DISTINCT ON (b) ${s.cols}, b FROM (
          SELECT ${s.cols}, date_bin(make_interval(secs => $2), ts, $3::timestamptz) AS b FROM ${s.table} WHERE ${s.key} = $1
        ) x ORDER BY b, ts DESC
      ) y)
     ORDER BY ts`,
    [id, secs, a]
  );
  // The first slice can end on the very first point, which is already in.
  return rows.filter((r, i) => i === 0 || +new Date(r.ts) !== +new Date(rows[i - 1].ts));
}
