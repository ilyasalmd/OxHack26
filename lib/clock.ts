import { AsyncLocalStorage } from "node:async_hooks";
import type { Q } from "./db";

// Everyone runs on real time. The admin account alone can fast-forward a demo clock: its own
// requests run inside withClock() at the saved offset, so weekly allowances, closing bets and
// maturing stocks can be shown in seconds, while every other account keeps the real date.
const g = globalThis as unknown as { __fsClockOffset?: number };
const scope = new AsyncLocalStorage<{ offset: number; userId: number }>();

export function now() {
  return new Date(Date.now() + (scope.getStore()?.offset ?? 0));
}

/** The offset this request runs on: the demo offset for the admin, 0 for everyone else. */
export function clockOffset() {
  return scope.getStore()?.offset ?? 0;
}

/** Set while the admin is running ahead of real time, so shared sweeps stay inside their own groups. */
export function aheadOfRealTime() {
  const s = scope.getStore();
  return s && s.offset !== 0 ? s : null;
}

/** The admin's saved demo offset. */
export function demoOffset() {
  return g.__fsClockOffset ?? 0;
}

export function withClock<T>(offset: number, userId: number, fn: () => T): T {
  return scope.run({ offset, userId }, fn);
}

export async function loadClock(q: Q) {
  const [row] = await q.query<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'clock_offset_ms'`);
  g.__fsClockOffset = row ? Number(row.value) : 0;
}

export async function setDemoOffset(q: Q, ms: number) {
  g.__fsClockOffset = ms;
  await q.query(
    `INSERT INTO app_settings (key, value) VALUES ('clock_offset_ms', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(ms)]
  );
}
