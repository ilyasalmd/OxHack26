import type { Q } from "./db";

// The app runs on its own clock so the demo can fast-forward time: weekly
// allowances, bets closing and long-term stocks maturing all key off now().
const g = globalThis as unknown as { __fsClockOffset?: number };

export function now() {
  return new Date(Date.now() + (g.__fsClockOffset ?? 0));
}

export function clockOffset() {
  return g.__fsClockOffset ?? 0;
}

export async function loadClock(q: Q) {
  const [row] = await q.query<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'clock_offset_ms'`);
  g.__fsClockOffset = row ? Number(row.value) : 0;
}

export async function advanceClock(q: Q, ms: number) {
  g.__fsClockOffset = clockOffset() + ms;
  await q.query(
    `INSERT INTO app_settings (key, value) VALUES ('clock_offset_ms', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(g.__fsClockOffset)]
  );
}
