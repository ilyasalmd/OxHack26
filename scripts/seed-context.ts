/**
 * Gives the AI something real to price from in every sample chat:
 *
 *  - each sample person's private profile answers (what a real person fills in at sign-up),
 *  - the habits each chat knows about its people, added to the chat's AI context,
 *  - settled stakes, with the chat lines around each result and a memory each, for the habits the
 *    example stakes in docs/DEMO_STAKES.md are about.
 *
 *   npx tsx --env-file=.env.local scripts/seed-context.ts
 *
 * Additive and safe on the live database. Only the sample people get profile answers, and only when
 * theirs are still empty. The habits are appended once, after anything the chat wrote itself. Each
 * settled stake is added once (a chat that already has a sample stake with that title is skipped).
 * No trades, ledger entries or chain operations, so nobody's balance changes, and every stake is
 * flagged `sample`, which only the admin sees. The words live in seed-context-content.ts.
 */
import { getDb } from "../lib/db";
import { embed } from "../lib/ai";
import { MARKET } from "../lib/config";
import { bookAt } from "../lib/lmsr";
import { creatorKey } from "../lib/demo";
import { encryptMessage, importGroupKey, unwrapGroupKey } from "../lib/e2ee";
import { PEOPLE } from "./seed-content";
import { CONTEXT_STORIES, HABITS, HABITS_MARK, PROFILES, type ContextStory } from "./seed-context-content";
import type { RichLine } from "./seed-rich-content";

const HOUR = 36e5;
const DAY = 24 * HOUR;
const WINDOW = 84 * DAY;
const SAMPLE = `(invite_code LIKE '%-demo' OR invite_code LIKE 'demo-punctuality-%')`;

let seed = 9311;
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

type U = { id: number; username: string; display_name: string; key_salt: string; enc_private_key: string; public_key: string; wrapped_key: string; wrapper_public_key: string };
type Chat = { id: number; key: CryptoKey; members: U[] };

/** Exactly round(p x n) of n come true, in a shuffled order. */
export function outcomes(p: number, n: number, r: () => number = rnd) {
  const yes = Math.round(p * n);
  const out = Array.from({ length: n }, (_, i) => i < yes);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  const db = await getDb();
  const sampleNames = new Set(PEOPLE.map((p) => p.username));

  // 1. Profile answers, only for sample people whose answers are still empty.
  let profiles = 0;
  for (const [username, answers] of Object.entries(PROFILES)) {
    if (!sampleNames.has(username) || username === "ilyas") continue;
    const rows = await db.query(
      `INSERT INTO profiles (user_id, answers, done, updated_at)
       SELECT id, $2::jsonb, true, now() FROM users WHERE username = $1 AND deleted_at IS NULL
       ON CONFLICT (user_id) DO UPDATE SET answers = EXCLUDED.answers, done = true, updated_at = now() WHERE profiles.answers = '{}'::jsonb
       RETURNING user_id`,
      [username, JSON.stringify(answers)]
    );
    profiles += rows.length;
  }

  // 2. Habits, appended once to each sample chat's AI context.
  let habits = 0;
  for (const [name, text] of Object.entries(HABITS)) {
    const rows = await db.query(
      `UPDATE groups SET ai_context = trim(ai_context || ' ' || $2) WHERE name = $1 AND ${SAMPLE} AND position($3 in ai_context) = 0 RETURNING id`,
      [name, `${HABITS_MARK} ${text}`, HABITS_MARK]
    );
    habits += rows.length;
  }

  // 3. Settled stakes, each title once per chat.
  const chats = new Map<string, Chat | null>();
  async function chat(name: string) {
    if (chats.has(name)) return chats.get(name)!;
    const [g] = await db.query<{ id: number }>(`SELECT id FROM groups WHERE name = $1 AND ${SAMPLE} ORDER BY id LIMIT 1`, [name]);
    let c: Chat | null = null;
    if (g) {
      const members = (
        await db.query<U>(
          `SELECT u.id, u.username, u.display_name, u.key_salt, u.enc_private_key, u.public_key, gk.wrapped_key, w.public_key AS wrapper_public_key
             FROM group_members gm JOIN users u ON u.id = gm.user_id AND u.deleted_at IS NULL
             JOIN group_keys gk ON gk.group_id = gm.group_id AND gk.user_id = u.id JOIN users w ON w.id = gk.wrapped_by
            WHERE gm.group_id = $1 AND NOT gm.guest`,
          [g.id]
        )
      ).filter((u) => sampleNames.has(u.username));
      // Any sample person's identity opens the chat key, the way their browser would.
      for (const u of members.filter((m) => m.username !== "ilyas")) {
        const priv = await creatorKey(u);
        if (!priv) continue;
        c = { id: g.id, members, key: await importGroupKey(await unwrapGroupKey(u.wrapped_key, priv, u.wrapper_public_key)) };
        break;
      }
    }
    if (!c) console.log(`  skipped "${name}": no such sample chat, or its key couldn't be opened`);
    chats.set(name, c);
    return c;
  }

  const T = Date.now();
  const before = await db.query<{ group_id: number; m: number }>(`SELECT group_id, max(id)::int AS m FROM messages GROUP BY group_id`);
  let made = 0, stories = 0;

  async function say(c: Chat, who: U, text: string, at: number) {
    const e = await encryptMessage(c.key, text);
    await db.query(`INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5)`, [c.id, who.id, e.ciphertext, e.iv, new Date(at)]);
  }

  async function one(s: ContextStory, c: Chat, subject: U | null, title: string, outcome: boolean, createdAt: number) {
    const resolvesAt = createdAt + s.span * HOUR;
    const others = c.members.filter((m) => m.id !== subject?.id);
    const by = pick(others);
    // The AI saw the truth through noise; the crowd then learned in the direction of what happened.
    const ai = clamp(s.p + gauss() * 0.07, MARKET.minProb, MARKET.maxProb);
    const b = MARKET.betLiquidity;
    const ticks: { t: number; p: number; source: string }[] = [{ t: createdAt, p: ai, source: "open" }];
    const steps = 3 + Math.floor(rnd() * 6);
    const target = clamp(outcome ? 0.55 + rnd() * 0.35 : 0.45 - rnd() * 0.35);
    let p = ai, volume = 0;
    for (let k = 1; k <= steps; k++) {
      p = clamp(p + (target - p) * 0.3 * rnd() + gauss() * 0.04);
      ticks.push({ t: createdAt + ((k - 0.3 + rnd() * 0.6) / (steps + 1)) * (resolvesAt - createdAt), p, source: "trade" });
      volume += 8 + rnd() * 45;
    }
    const resolvedAt = resolvesAt + (0.5 + rnd() * 3) * HOUR;
    const bk = bookAt(b, p);
    const [m] = await db.query<{ id: number }>(
      `INSERT INTO markets (group_id, creator_id, subject_id, kind, decay, title, description, category, resolution_rule, ai_prob, base_rate, base_rate_n,
         open_prob, ai_rationale, ai_summary, ai_source, b, q_yes, q_no, status, outcome, created_at, resolves_at, resolved_at, last_decay_at, volume, answer, evidence, sample)
       VALUES ($1,$2,$3,'bet','none',$4,'',$5,$6,$7,NULL,0,$7,$8,$8,'heuristic',$9,$10,$11,'resolved',$12,$13,$14,$15,$13,$16,'yesno',1.5,true) RETURNING id`,
      [c.id, by.id, subject?.id ?? null, title, s.category, s.rule, ai,
        `Opened from ${subject ? `${subject.display_name}'s` : "this chat's"} earlier record on stakes like this.`,
        b, bk.qYes, bk.qNo, outcome, new Date(createdAt), new Date(resolvesAt), new Date(resolvedAt), Math.round(volume)]
    );
    const rows: unknown[] = [];
    const all = [...ticks, { t: resolvedAt, p: outcome ? 1 : 0, source: "resolve" }];
    for (const tk of all) rows.push(m.id, new Date(tk.t), +tk.p.toFixed(4), tk.source);
    await db.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ${all.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(",")}`, rows);
    await db.query(`INSERT INTO messages (group_id, user_id, kind, body, market_id, created_at) VALUES ($1,$2,'market',$3,$4,$5)`, [c.id, by.id, `opened a bet: ${title}`, m.id, new Date(createdAt)]);
    await db.query(`INSERT INTO messages (group_id, user_id, kind, body, market_id, created_at) VALUES ($1,$2,'resolution',$3,$4,$5)`, [c.id, by.id, `resolved ${outcome ? "YES" : "NO"}: ${title}`, m.id, new Date(resolvedAt)]);

    // The chat around the result, as the friends would have typed it.
    const lines: RichLine[] = pick(outcome ? s.yes : s.no);
    const roles: Record<string, U> = { $s: subject ?? others[0], $a: others[0], $b: others[1] ?? others[0] };
    let t = resolvedAt - (5 + rnd() * 40) * 60e3;
    for (const [who, text] of lines) {
      const u = roles[who] ?? c.members.find((x) => x.username === who);
      if (!u) continue;
      await say(c, u, text, t);
      t += (20 + rnd() * 200) * 1000;
    }
    const what = lines[0]?.[1] ? ` "${lines[0][1]}"` : "";
    const vector = await embed(title);
    await db.query(
      `INSERT INTO memories (group_id, market_id, subject_id, category, title, outcome, ai_prob, crowd_prob, summary, embedding, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [c.id, m.id, subject?.id ?? null, s.category, title, outcome, ai, p, `${outcome ? "Happened" : "Didn't happen"}.${what} Opened at ${pct(ai)}, crowd closed at ${pct(p)}.`, vector ? JSON.stringify(vector) : null, new Date(resolvedAt)]
    );
    made++;
  }

  for (const s of CONTEXT_STORIES) {
    const c = await chat(s.group);
    if (!c) continue;
    const subject = s.subject ? (c.members.find((m) => m.username === s.subject) ?? null) : null;
    if (s.subject && !subject) continue;
    const title = s.title.replace("{s}", subject?.display_name ?? "");
    const [had] = await db.query(`SELECT 1 FROM markets WHERE group_id = $1 AND sample AND title = $2 LIMIT 1`, [c.id, title]);
    if (had) continue;
    const results = outcomes(s.p, s.times);
    for (let k = 0; k < s.times; k++) {
      const slot = WINDOW / s.times;
      const createdAt = T - WINDOW + (k + 0.2 + rnd() * 0.5) * slot;
      if (createdAt + s.span * HOUR + 5 * HOUR > T - 3 * HOUR) continue;
      await one(s, c, subject, title, results[k], createdAt);
    }
    stories++;
  }

  // History that landed in the past shouldn't light up unread badges for people who were caught up.
  if (made)
    for (const g of before)
      await db.query(
        `UPDATE group_members gm SET read_upto = x.m, delivered_upto = x.m FROM (SELECT max(id)::int AS m FROM messages WHERE group_id = $1) x
          WHERE gm.group_id = $1 AND gm.read_upto >= $2`,
        [g.group_id, g.m]
      );

  if (!profiles && !habits && !made) console.log("Sample context is already in place");
  else console.log(`Wrote ${profiles} profiles and habits for ${habits} chats; added ${made} settled stakes for ${stories} habits`);
  process.exit(0);
}

if (process.argv[1]?.endsWith("seed-context.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
