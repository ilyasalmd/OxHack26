/**
 * Adds one data-rich chat for the admin's demos, without touching anything else:
 *
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts
 *
 * "Friday Dinner Crew" has the admin and five of the sample people, eight weeks of settled
 * lateness bets (Friday dinners and Sunday football) with their outcomes stored as the group's
 * memory, and real end-to-end encrypted chat about it, including this week's messages. Post a
 * new situation there as the admin (for example "Jake is late to Friday dinner") to watch the
 * AI weigh the history and the chat, then open its pricing record on the Chain page.
 *
 * It stops if the chat already exists. Needs the sample people from `npm run seed`.
 */
import { getDb } from "../lib/db";
import { embed } from "../lib/ai";
import { MARKET } from "../lib/config";
import { bookAt } from "../lib/lmsr";
import { deriveKeys, encryptMessage, importGroupKey, newGroupKey, unlockIdentity, wrapGroupKey } from "../lib/e2ee";
import { PASSWORD } from "./seed-content";

const NAME = "Friday Dinner Crew";
const HOUR = 36e5;
const DAY = 24 * HOUR;
const MEMBERS = ["priya", "jake", "sam", "maya", "omar"];

let seed = 1030;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

// Who tends to be late to what. These are the "truth" the outcomes are drawn from.
const HABITS: { who: string; event: "dinner" | "football"; p: number }[] = [
  { who: "jake", event: "dinner", p: 0.82 },
  { who: "omar", event: "dinner", p: 0.3 },
  { who: "maya", event: "dinner", p: 0.12 },
  { who: "sam", event: "football", p: 0.55 },
  { who: "jake", event: "football", p: 0.6 },
];
const LATE: Record<string, string[]> = {
  jake: ["arrived 25 minutes late and blamed the Northern line", "said '5 mins away' at 7:25 and walked in at 7:58", "left the office at 7:20 for a 7:30 start", "turned up 40 minutes late with no excuse", "was 15 minutes late after a client call overran"],
  omar: ["got a puncture on the way and was 20 minutes late", "was 10 minutes late after a lab ran over"],
  maya: ["was late to her own dinner after the shop queue"],
  sam: ["overslept and missed the first 20 minutes", "turned up at half time"],
};
const ONTIME: Record<string, string[]> = {
  jake: ["was early for once, everyone was shocked", "was there at 7:28 and made a big deal of it"],
  omar: ["cycled over and was first there", "was on time as usual"],
  maya: ["was on time, it was at hers"],
  sam: ["was there for kick-off", "set two alarms and made it"],
};

async function main() {
  const db = await getDb();
  const admin = (process.env.ADMIN_USERNAMES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)[0];
  if (!admin) throw new Error("Set ADMIN_USERNAMES first");
  const [exists] = await db.query(`SELECT id FROM groups WHERE name = $1`, [NAME]);
  if (exists) throw new Error(`"${NAME}" already exists`);

  type U = { id: number; username: string; display_name: string; public_key: string; enc_private_key: string; key_salt: string };
  const users: Record<string, U> = {};
  for (const name of [admin, ...MEMBERS]) {
    const [u] = await db.query<U>(`SELECT id, username, display_name, public_key, enc_private_key, key_salt FROM users WHERE username = $1 AND deleted_at IS NULL`, [name]);
    if (!u) throw new Error(`@${name} doesn't exist`);
    users[name] = u;
  }
  // Priya hands out the chat key (her identity unlocks with the sample password); the admin owns the chat.
  const { encKey } = await deriveKeys(PASSWORD, "priya", users.priya.key_salt);
  const priyaKey = await unlockIdentity(users.priya.enc_private_key, encKey);
  const raw = newGroupKey();
  const key = await importGroupKey(raw);

  const T = Date.now();
  const start = new Date(T - 58 * DAY);
  const [grp] = await db.query<{ id: number }>(
    `INSERT INTO groups (name, emoji, invite_code, ai_context, created_by, created_at, ai_reads_chat) VALUES ($1,'',$2,$3,$4,$5,true) RETURNING id`,
    [
      NAME,
      `demo-punctuality-${Math.random().toString(36).slice(2, 8)}`,
      "Six friends. Friday dinner is 7:30pm at Maya's flat in Clapham every week. Sunday five-a-side kicks off at 10am in Battersea Park. Jake works in the City and usually takes the Northern line. Omar cycles everywhere. Sam lives furthest out, in Croydon.",
      users[admin].id,
      start,
    ]
  );
  for (const u of Object.values(users)) {
    await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3)`, [grp.id, u.id, start]);
    await db.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4)`, [grp.id, u.id, await wrapGroupKey(raw, priyaKey, u.public_key), users.priya.id]);
  }
  await db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [grp.id, users[admin].id, `created ${NAME}`, start]);

  async function say(who: string, text: string, at: number) {
    const e = await encryptMessage(key, text);
    await db.query(`INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5)`, [grp.id, users[who].id, e.ciphertext, e.iv, new Date(at)]);
  }

  // Eight weeks of Fridays and Sundays before today.
  const friday = (w: number) => {
    const d = new Date(T - w * 7 * DAY);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 2) % 7)); // back to Friday
    d.setUTCHours(18, 30, 0, 0); // 7:30pm UK summer time
    return d.getTime();
  };
  const tally: Record<string, { n: number; yes: number }> = {};
  let made = 0;
  for (let w = 8; w >= 1; w--) {
    for (const h of HABITS) {
      const eventAt = h.event === "dinner" ? friday(w) : friday(w) + 2 * DAY - 9.5 * HOUR; // Sunday 10am
      if (eventAt > T - 3 * HOUR) continue;
      if (h.who === "maya" && rnd() < 0.5) continue; // nobody bets on Maya every week
      const by = pick(MEMBERS.filter((m) => m !== h.who));
      const title = `${users[h.who].display_name} is late to ${h.event === "dinner" ? "Friday dinner" : "Sunday football"}`;
      const k = `${h.who}:${h.event}`;
      const past = tally[k] ?? { n: 0, yes: 0 };
      const aiProb = Math.min(0.9, Math.max(0.1, (1 + past.yes) / (2 + past.n)));
      const outcome = rnd() < h.p;
      const crowd = Math.min(0.95, Math.max(0.05, aiProb + (outcome ? 0.12 : -0.12) * (0.5 + rnd())));
      const created = new Date(eventAt - (1 + rnd()) * DAY);
      const resolvesAt = new Date(eventAt + HOUR);
      const resolved = new Date(eventAt + 2.5 * HOUR);
      const bk = bookAt(MARKET.betLiquidity, aiProb);
      const [m] = await db.query<{ id: number }>(
        `INSERT INTO markets (group_id, creator_id, subject_id, kind, decay, title, description, category, resolution_rule, ai_prob, base_rate, base_rate_n,
           open_prob, ai_rationale, ai_source, b, q_yes, q_no, status, outcome, created_at, resolves_at, resolved_at, last_decay_at, volume)
         VALUES ($1,$2,$3,'bet','none',$4,'','punctuality',$5,$6,$7,$8,$6,$9,'heuristic',$10,$11,$12,'resolved',$13,$14,$15,$16,$14,$17) RETURNING id`,
        [grp.id, users[by].id, users[h.who].id, title, `YES if ${users[h.who].display_name} arrives after ${h.event === "dinner" ? "7:30pm" : "10am"}.`,
          aiProb, past.n ? past.yes / past.n : null, past.n, `Based on ${past.n} earlier ${h.event} bets about them.`, MARKET.betLiquidity, bk.qYes, bk.qNo,
          outcome, created, resolvesAt, resolved, Math.round(20 + rnd() * 140)]
      );
      await db.query(`INSERT INTO price_ticks (market_id, ts, price, source) VALUES ($1,$2,$3,'open')`, [m.id, created, aiProb]);
      await db.query(`INSERT INTO messages (group_id, user_id, kind, body, market_id, created_at) VALUES ($1,$2,'market',$3,$4,$5)`, [grp.id, users[by].id, `opened a bet: ${title}`, m.id, created]);
      const what = pick((outcome ? LATE : ONTIME)[h.who]);
      const summary = `${outcome ? "Happened" : "Didn't happen"}: ${users[h.who].display_name} ${what}. Opened at ${(aiProb * 100).toFixed(0)}%, crowd closed at ${(crowd * 100).toFixed(0)}%.`;
      const vector = await embed(title);
      await db.query(
        `INSERT INTO memories (group_id, market_id, subject_id, category, title, outcome, ai_prob, crowd_prob, summary, embedding, created_at) VALUES ($1,$2,$3,'punctuality',$4,$5,$6,$7,$8,$9,$10)`,
        [grp.id, m.id, users[h.who].id, title, outcome, aiProb, crowd, summary, vector ? JSON.stringify(vector) : null, resolved]
      );
      tally[k] = { n: past.n + 1, yes: past.yes + (outcome ? 1 : 0) };
      made++;
      // A little chat around each event.
      if (outcome && rnd() < 0.6) await say(pick(MEMBERS.filter((x) => x !== h.who)), pick([`${users[h.who].display_name} where are you`, `classic ${users[h.who].display_name}`, `starting without ${users[h.who].display_name}`]), eventAt + 15 * 60e3);
      if (outcome && rnd() < 0.5) await say(h.who, pick(["5 mins away", "sorry sorry on my way", "the train just stopped in a tunnel", "don't start without me"]), eventAt + 20 * 60e3);
      if (!outcome && h.who === "jake" && rnd() < 0.7) await say("maya", "Jake on time?? screenshot this", eventAt + 2 * 60e3);
    }
  }

  // This week, before the next Friday dinner: one message that should actually change the odds.
  const lines: [string, string, number][] = [
    ["maya", "dinner friday 7:30 as usual, I'm doing a curry", 2.2],
    ["sam", "bet jake's late again", 2.1],
    ["jake", "not this time. I'm working from home on friday, I'll be round by 7", 2.0],
    ["omar", "wfh jake is a different person", 1.9],
    ["priya", "the northern line is part closed this weekend btw", 1.2],
    ["sam", "I might be late to football sunday, engineering works on my line", 0.8],
    ["maya", "who's bringing drinks", 0.4],
    ["omar", "I'll bring some", 0.35],
  ];
  for (const [who, text, daysAgo] of lines) await say(who, text, T - daysAgo * DAY);

  console.log(`Made "${NAME}" (group ${grp.id}) with ${made} settled bets, ${Object.entries(tally).map(([k, v]) => `${k} ${v.yes}/${v.n}`).join(", ")}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
