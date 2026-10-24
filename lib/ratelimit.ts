import type { NextRequest } from "next/server";
import { HttpError } from "./auth";

// Fixed-window counters in memory. Enough for one server process; a multi-instance
// deployment would move these into Postgres or Redis.
const g = globalThis as unknown as { __fsLimits?: Map<string, { n: number; reset: number }> };
const hits = (g.__fsLimits ??= new Map());

/** The caller's address, as seen through a proxy or tunnel when there is one. */
export function clientIp(req: NextRequest) {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

/**
 * Throws 429 once `key` has been used `max` times inside `windowSec`.
 *   limit(`login:${clientIp(req)}`, 10, 60)
 */
export function limit(key: string, max: number, windowSec: number) {
  const t = Date.now();
  const h = hits.get(key);
  if (!h || h.reset <= t) {
    hits.set(key, { n: 1, reset: t + windowSec * 1000 });
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
    return;
  }
  if (++h.n > max) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil((h.reset - t) / 1000)}s.`);
}
