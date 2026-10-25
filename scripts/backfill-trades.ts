/**
 * The skill board needs at least three people trading a stake before it counts. The settled
 * stakes added by seed-rich.ts have prices but few or no trades, so this gives each of them three
 * to five early calls from the people in that chat, sharper people calling it right more often.
 * Only the trades table is written (the history it already shows doesn't change anyone's coins).
 * Additive and safe to run again; `--undo` removes what it added:
 *
 *   npx tsx --env-file=.env.local scripts/backfill-trades.ts
 */
import fs from "node:fs";
import { getDb } from "../lib/db";
import { PEOPLE } from "./seed-content";

const IDS_FILE = ".data/backfill-trades-ids.json";
const SKILL = new Map(PEOPLE.map((p) => [p.username, p.skill]));

let seed = 4242;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const shuffle = <T,>(xs: T[]) => xs.map((x) => [rnd(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
const clamp = (p: number) => Math.min(0.97, Math.max(0.03, p));

async function main() {
  const db = await getDb();
  if (process.argv.includes("--undo")) {
    const ids = JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) as number[];
    await db.query(`DELETE FROM trades WHERE id = ANY($1::int[])`, [ids]);
    fs.rmSync(IDS_FILE);
    console.log(`Removed ${ids.length} trades`);
    process.exit(0);
  }
  const markets = await db.query<{ id: number; group_id: number; subject_id: number | null; creator_id: number; outcome: boolean; created_at: Date; resolves_at: Date; traders: number }>(
    `SELECT m.id, m.group_id, m.subject_id, m.creator_id, m.outcome, m.created_at, m.resolves_at,
            (SELECT count(DISTINCT t.user_id)::int FROM trades t WHERE t.market_id = m.id) AS traders
       FROM markets m JOIN groups gr ON gr.id = m.group_id
      WHERE m.status = 'resolved' AND m.outcome IS NOT NULL AND (gr.invite_code LIKE '%-demo' OR gr.invite_code LIKE 'demo-punctuality-%')`
  );
  // Who was in each chat from the start: sample people plus Ilyas, not today's new accounts.
  const members = new Map<number, { id: number; username: string }[]>();
  for (const r of await db.query<{ group_id: number; id: number; username: string }>(
    `SELECT gm.group_id, u.id, u.username FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE NOT gm.guest AND u.username = ANY($1::text[])`,
    [PEOPLE.map((p) => p.username)]
  ))
    members.set(r.group_id, [...(members.get(r.group_id) ?? []), { id: r.id, username: r.username }]);

  const added: number[] = [];
  for (const m of markets) {
    if (m.traders >= 3) continue;
    const ticks = await db.query<{ ts: Date; price: number }>(`SELECT ts, price FROM price_ticks WHERE market_id = $1 ORDER BY ts`, [m.id]);
    if (!ticks.length) continue;
    const already = new Set((await db.query<{ user_id: number }>(`SELECT DISTINCT user_id FROM trades WHERE market_id = $1`, [m.id])).map((r) => r.user_id));
    const pool = shuffle((members.get(m.group_id) ?? []).filter((u) => u.id !== m.subject_id && !already.has(u.id)));
    const want = 3 + Math.floor(rnd() * 3) - already.size;
    const start = new Date(m.created_at).getTime();
    const span = new Date(m.resolves_at).getTime() - start;
    for (const [i, u] of pool.slice(0, Math.max(0, want)).entries()) {
      // Early in the stake's life, so the call counts in full.
      const at = new Date(start + span * (0.05 + 0.4 * ((i + rnd()) / Math.max(1, want))));
      const before = [...ticks].reverse().find((t) => new Date(t.ts) <= at) ?? ticks[0];
      const p = clamp(Number(before.price));
      // A noisy read of what really happened: the sharper the person, the less noise.
      const skill = SKILL.get(u.username) ?? 0.5;
      const belief = clamp((m.outcome ? 1 : 0) * skill + p * (1 - skill) + (rnd() - 0.5) * 0.6 * (1.1 - skill));
      const side = belief >= p ? "yes" : "no";
      const coins = Math.round(8 + rnd() * 32);
      const sidePrice = side === "yes" ? p : 1 - p;
      const after = clamp(p + (side === "yes" ? 1 : -1) * coins * 0.0008);
      const [t] = await db.query<{ id: number }>(
        `INSERT INTO trades (market_id, user_id, side, action, shares, coins, price_before, price_after, created_at) VALUES ($1,$2,$3,'buy',$4,$5,$6,$7,$8) RETURNING id`,
        [m.id, u.id, side, coins / sidePrice, coins, p, after, at]
      );
      added.push(t.id);
    }
  }
  const prev = fs.existsSync(IDS_FILE) ? (JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) as number[]) : [];
  fs.writeFileSync(IDS_FILE, JSON.stringify([...prev, ...added]));
  console.log(`Added ${added.length} early calls across ${markets.filter((m) => m.traders < 3).length} settled stakes`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
