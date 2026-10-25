/**
 * Adds twelve weeks of settled stakes across every kind (lateness, dating, exams, jobs, football,
 * fitness, money, family, trips, nights out, habits) to the sample chats, so the AI has a record
 * per person and per kind to price from, and the stats pages have something to show:
 *
 *   npx tsx --env-file=.env.local scripts/seed-rich.ts
 *
 * Additive and safe to run on the live database: it inserts resolved markets with price history,
 * memories, the chat lines around each result and nothing else. No trades, ledger entries or
 * chain operations, so nobody's balance or wallet changes. Every stake is flagged `sample`, which
 * only the admin sees. It stops if it has already run, and `--undo` removes exactly what it added
 * (the ids are kept in .data/seed-rich-ids.json). The words live in seed-rich-content.ts.
 */
import fs from "node:fs";
import { getDb } from "../lib/db";
import { embed } from "../lib/ai";
import { MARKET } from "../lib/config";
import { bookAt } from "../lib/lmsr";
import { creatorKey } from "../lib/demo";
import { guessCategory, playbook } from "../lib/categories";
import { encryptMessage, importGroupKey, unwrapGroupKey } from "../lib/e2ee";
import { PEOPLE } from "./seed-content";
import { STORIES, type RichLine, type Story } from "./seed-rich-content";

const HOUR = 36e5;
const DAY = 24 * HOUR;
const WINDOW = 84 * DAY;

let seed = 7042;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const clamp = (p: number, lo = 0.04, hi = 0.96) => Math.min(hi, Math.max(lo, p));
const pct = (p: number) => `${Math.round(p * 100)}%`;

type U = { id: number; username: string; display_name: string; key_salt: string; enc_private_key: string; public_key: string };
type Chat = { id: number; key: CryptoKey; members: U[] };

const IDS_FILE = ".data/seed-rich-ids.json";
const added = { markets: [] as number[], messages: [] as number[], memories: [] as number[] };

async function undo() {
  const db = await getDb();
  const ids = JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) as typeof added;
  // Each run appends to the file, so undo takes everything every run added.
  await db.query(`DELETE FROM memories WHERE id = ANY($1::int[])`, [ids.memories]);
  await db.query(`DELETE FROM messages WHERE id = ANY($1::int[])`, [ids.messages]);
  await db.query(`DELETE FROM price_ticks WHERE market_id = ANY($1::int[])`, [ids.markets]);
  await db.query(`DELETE FROM markets WHERE id = ANY($1::int[]) AND sample`, [ids.markets]);
  console.log(`Removed ${ids.markets.length} sample stakes, ${ids.messages.length} messages and ${ids.memories.length} memories.`);
  process.exit(0);
}

async function main() {
  if (process.argv.includes("--undo")) return undo();
  const db = await getDb();
  // Chats that already have their history keep it; only new ones are filled.
  const done = new Set((await db.query<{ name: string }>(`SELECT DISTINCT g.name FROM markets m JOIN groups g ON g.id = m.group_id WHERE m.sample`)).map((r) => r.name));
  const stories = STORIES.filter((s) => !done.has(s.group));
  if (!stories.length) throw new Error(`Already seeded (${[...done].join(", ")})`);

  const chats = new Map<string, Chat>();
  const sampleNames = new Set(PEOPLE.map((p) => p.username));
  for (const name of new Set(stories.map((s) => s.group))) {
    const [g] = await db.query<{ id: number }>(`SELECT id FROM groups WHERE name = $1 ORDER BY id LIMIT 1`, [name]);
    if (!g) throw new Error(`Chat "${name}" doesn't exist; run npm run seed and seed-demo first`);
    const members = (
      await db.query<U & { wrapped_key: string; wrapper_public_key: string }>(
        `SELECT u.id, u.username, u.display_name, u.key_salt, u.enc_private_key, u.public_key, gk.wrapped_key, w.public_key AS wrapper_public_key
           FROM group_members gm JOIN users u ON u.id = gm.user_id AND u.deleted_at IS NULL
           JOIN group_keys gk ON gk.group_id = gm.group_id AND gk.user_id = u.id JOIN users w ON w.id = gk.wrapped_by
          WHERE gm.group_id = $1 AND NOT gm.guest`,
        [g.id]
      )
    ).filter((u) => sampleNames.has(u.username));
    // Any sample person's identity opens the chat key, the way their browser would.
    let key: CryptoKey | null = null;
    for (const u of members.filter((m) => m.username !== "ilyas")) {
      const priv = await creatorKey(u);
      if (!priv) continue;
      key = await importGroupKey(await unwrapGroupKey(u.wrapped_key, priv, u.wrapper_public_key));
      break;
    }
    if (!key) throw new Error(`Couldn't open the chat key for "${name}"`);
    chats.set(name, { id: g.id, key, members });
  }

  const T = Date.now();
  let made = 0, yes = 0;
  const byCat: Record<string, number> = {};

  async function say(c: Chat, who: U, text: string, at: number) {
    const e = await encryptMessage(c.key, text);
    const [r] = await db.query<{ id: number }>(`INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5) RETURNING id`, [c.id, who.id, e.ciphertext, e.iv, new Date(at)]);
    added.messages.push(r.id);
  }

  async function one(s: Story, c: Chat, createdAt: number, resolvesAt: number) {
    const subject = s.subject ? c.members.find((m) => m.username === s.subject) : null;
    if (s.subject && !subject) return;
    const others = c.members.filter((m) => m.id !== subject?.id);
    const by = pick(others);
    const title = s.title.replace("{s}", subject?.display_name ?? "");
    const number = s.line != null;
    const outcome = rnd() < s.p;
    const actual = number ? +(s.numbers![outcome ? 1 : 0][0] + rnd() * (s.numbers![outcome ? 1 : 0][1] - s.numbers![outcome ? 1 : 0][0])).toFixed(s.unit === "minutes" && s.line! < 30 ? 0 : s.unit === "minutes" ? 1 : 0) : null;
    // The AI sees the truth through noise; the crowd then learns in the direction of what happens.
    const ai = clamp(s.p + gauss() * 0.07, MARKET.minProb, MARKET.maxProb);
    const b = s.kind === "stock" ? MARKET.stockLiquidity : MARKET.betLiquidity;
    const ticks: { t: number; p: number; source: string }[] = [{ t: createdAt, p: ai, source: "open" }];
    const steps = s.kind === "stock" ? 10 + Math.floor(rnd() * 14) : 3 + Math.floor(rnd() * 8);
    const target = clamp(outcome ? 0.55 + rnd() * 0.35 : 0.45 - rnd() * 0.35);
    let p = ai, volume = 0;
    for (let k = 1; k <= steps; k++) {
      const t = createdAt + ((k - 0.3 + rnd() * 0.6) / (steps + 1)) * (resolvesAt - createdAt);
      p = clamp(p + (target - p) * 0.3 * rnd() + gauss() * 0.04);
      ticks.push({ t, p, source: s.kind === "stock" && k % 5 === 0 ? "ai" : "trade" });
      volume += 8 + rnd() * 45;
    }
    const crowd = p;
    const resolvedAt = resolvesAt + (0.5 + rnd() * 4) * HOUR;
    const bk = bookAt(b, crowd);
    const pb = playbook(s.category);
    const [m] = await db.query<{ id: number }>(
      `INSERT INTO markets (group_id, creator_id, subject_id, kind, decay, title, description, category, resolution_rule, ai_prob, base_rate, base_rate_n,
         open_prob, ai_rationale, ai_source, b, q_yes, q_no, status, outcome, created_at, resolves_at, resolved_at, last_decay_at, volume, answer, line, unit, actual, evidence, sample)
       VALUES ($1,$2,$3,$4,$5,$6,'',$7,$8,$9,NULL,0,$9,$10,'heuristic',$11,$12,$13,'resolved',$14,$15,$16,$17,$15,$18,$19,$20,$21,$22,1.5,true) RETURNING id`,
      [c.id, by.id, subject?.id ?? null, s.kind, s.kind === "stock" && /before|by /i.test(title) ? "hazard" : "none", title, s.category, s.rule, ai,
        `Opened from the usual odds for ${pb.label.toLowerCase()} stakes and ${subject ? `${subject.display_name}'s` : "this chat's"} earlier record.`,
        b, bk.qYes, bk.qNo, outcome, new Date(createdAt), new Date(resolvesAt), new Date(resolvedAt), Math.round(volume), number ? "number" : "yesno", s.line ?? null, s.unit ?? "", actual]
    );
    const rows: unknown[] = [];
    for (const tk of [...ticks, { t: resolvedAt, p: outcome ? 1 : 0, source: "resolve" }]) rows.push(m.id, new Date(tk.t), +tk.p.toFixed(4), tk.source);
    await db.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ${ticks.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(",")},($${ticks.length * 4 + 1},$${ticks.length * 4 + 2},$${ticks.length * 4 + 3},$${ticks.length * 4 + 4})`, rows);
    added.markets.push(m.id);
    const [m1] = await db.query<{ id: number }>(`INSERT INTO messages (group_id, user_id, kind, body, market_id, created_at) VALUES ($1,$2,'market',$3,$4,$5) RETURNING id`, [c.id, by.id, `${s.kind === "stock" ? "listed a stock" : "opened a bet"}: ${title}`, m.id, new Date(createdAt)]);
    added.messages.push(m1.id);
    const word = number ? (outcome ? "OVER" : "UNDER") : outcome ? "YES" : "NO";
    const [m2] = await db.query<{ id: number }>(`INSERT INTO messages (group_id, user_id, kind, body, market_id, created_at) VALUES ($1,$2,'resolution',$3,$4,$5) RETURNING id`, [c.id, by.id, `resolved ${word}: ${title}${number ? ` (${actual} ${s.unit})` : ""}`, m.id, new Date(resolvedAt)]);
    added.messages.push(m2.id);

    // The chat around the result, as the friends would have typed it.
    const lines: RichLine[] = pick(outcome ? s.yes : s.no);
    const roles: Record<string, U> = { $s: subject ?? others[0], $a: others[0], $b: others[1] ?? others[0] };
    let t = resolvedAt - (5 + rnd() * 40) * 60e3;
    for (const [who, text] of lines) {
      const u = roles[who] ?? c.members.find((m) => m.username === who);
      if (!u) continue;
      await say(c, u, text, t);
      t += (20 + rnd() * 200) * 1000;
    }
    const what = lines[0]?.[1] ? ` "${lines[0][1]}"` : "";
    const summary = number
      ? `Settled at ${actual} ${s.unit}, ${outcome ? "over" : "under"} the line of ${s.line}.${what} Opened at ${pct(ai)}, crowd closed at ${pct(crowd)}.`
      : `${outcome ? "Happened" : "Didn't happen"}.${what} Opened at ${pct(ai)}, crowd closed at ${pct(crowd)}.`;
    const vector = await embed(title);
    const [mem] = await db.query<{ id: number }>(
      `INSERT INTO memories (group_id, market_id, subject_id, category, title, outcome, ai_prob, crowd_prob, summary, embedding, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [c.id, m.id, subject?.id ?? null, s.category, title, outcome, ai, crowd, summary, vector ? JSON.stringify(vector) : null, new Date(resolvedAt)]
    );
    added.memories.push(mem.id);
    made++;
    if (outcome) yes++;
    byCat[s.category] = (byCat[s.category] ?? 0) + 1;
  }

  const before = await db.query<{ group_id: number; m: number }>(`SELECT group_id, max(id)::int AS m FROM messages GROUP BY group_id`);
  for (const s of stories) {
    const c = chats.get(s.group)!;
    if (s.kind === "stock") {
      const resolvesAt = T - (2 + rnd() * 12) * DAY;
      await one(s, c, resolvesAt - s.span * DAY, resolvesAt);
      continue;
    }
    for (let k = 0; k < s.times; k++) {
      const slot = WINDOW / s.times;
      const createdAt = T - WINDOW + (k + 0.2 + rnd() * 0.6) * slot;
      const resolvesAt = createdAt + s.span * HOUR;
      if (resolvesAt + 5 * HOUR > T - 3 * HOUR) continue;
      await one(s, c, createdAt, resolvesAt);
    }
  }

  // Older stakes filed under "other" get the kind the playbook now recognises.
  const re = await db.query<{ id: number; title: string; category: string }>(`SELECT id, title, category FROM markets WHERE category = 'other'`);
  let refiled = 0;
  for (const m of re) {
    const cat = guessCategory(m.title);
    if (cat === "other") continue;
    await db.query(`UPDATE markets SET category = $2 WHERE id = $1`, [m.id, cat]);
    await db.query(`UPDATE memories SET category = $2 WHERE market_id = $1`, [m.id, cat]);
    refiled++;
  }

  // History that landed in the past shouldn't light up unread badges for people who were caught up.
  for (const g of before) {
    await db.query(
      `UPDATE group_members gm SET read_upto = x.m, delivered_upto = x.m FROM (SELECT max(id)::int AS m FROM messages WHERE group_id = $1) x
        WHERE gm.group_id = $1 AND gm.read_upto >= $2`,
      [g.group_id, g.m]
    );
  }

  fs.mkdirSync(".data", { recursive: true });
  const old = fs.existsSync(IDS_FILE) ? (JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) as typeof added) : { markets: [], messages: [], memories: [] };
  fs.writeFileSync(IDS_FILE, JSON.stringify({ markets: [...old.markets, ...added.markets], messages: [...old.messages, ...added.messages], memories: [...old.memories, ...added.memories] }));
  console.log(`Added ${made} settled stakes (${yes} happened) across ${chats.size} chats: ${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(", ")}. Refiled ${refiled} older stakes out of "other".`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
