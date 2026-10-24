/**
 * Demo data: five friends, two group chats, ~8 weeks of settled history (so the
 * AI has past data and the insights page has calibration), plus live bets and
 * long-term stocks with real price history. Chat messages are really encrypted.
 *
 *   npm run seed            (stop the dev server first when using embedded PGlite)
 *
 * Runs through the same market engine as the app by moving the app clock.
 */
delete process.env.GEMINI_API_KEY; // deterministic + fast; live Gemini is used in the app itself
process.env.DEMO_MODE ??= "true";

import bcrypt from "bcryptjs";
import { getDb } from "../lib/db";
import { now } from "../lib/clock";
import { credit, applyAllowance } from "../lib/economy";
import { createMarket, resolveMarket, runDecay, trade, getMarket, price } from "../lib/markets";
import { newWallet } from "../lib/solana";
import { createIdentity, deriveKeys, encryptMessage, importGroupKey, newGroupKey, randomSalt, wrapGroupKey } from "../lib/e2ee";
import type { User } from "../lib/auth";

const g = globalThis as unknown as { __fsClockOffset?: number; __fsDb?: unknown };
const DAY = 864e5;
const T0 = Date.now();
const at = (t: number) => (g.__fsClockOffset = t - Date.now());

let seed = 42;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const clamp = (p: number) => Math.min(0.95, Math.max(0.05, p));

const PEOPLE = [
  ["ilyas", "Ilyas", "#c6ff3d"],
  ["jake", "Jake", "#4f8cff"],
  ["priya", "Priya", "#ff7ac6"],
  ["sam", "Sam", "#ffb020"],
  ["maya", "Maya", "#00c2d1"],
] as const;
const PASSWORD = "demo1234";

async function main() {
  let db = await getDb();
  await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  g.__fsDb = undefined;
  db = await getDb();
  at(T0 - 56 * DAY);

  // Users with real E2EE identities.
  const users: Record<string, User & { priv: CryptoKey }> = {};
  for (const [username, name, color] of PEOPLE) {
    const salt = randomSalt();
    const { authKey, encKey } = await deriveKeys(PASSWORD, username, salt);
    const id = await createIdentity(encKey);
    const w = newWallet();
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc)
       VALUES ($1,$2,$3,$4,0,$5,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [username, name, await bcrypt.hash(authKey, 10), color, now(), id.publicKey, id.encPrivateKey, salt, w.pubkey, w.secretEnc]
    );
    await credit(db, u.id, 500, "Welcome bonus");
    users[username] = { id: u.id, username, display_name: name, color, balance: 500, public_key: id.publicKey, wallet_pubkey: w.pubkey, priv: id.privateKey };
  }

  async function makeGroup(name: string, emoji: string, members: string[], aiContext: string) {
    const raw = newGroupKey();
    const creator = users[members[0]];
    const [grp] = await db.query<{ id: number }>(
      `INSERT INTO groups (name, emoji, invite_code, ai_context, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, emoji, `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}-demo`, aiContext, creator.id, now()]
    );
    for (const m of members) {
      await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3)`, [grp.id, users[m].id, now()]);
      await db.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4)`, [grp.id, users[m].id, await wrapGroupKey(raw, creator.priv, users[m].public_key), creator.id]);
    }
    await db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [grp.id, creator.id, `created ${name}`, now()]);
    return { id: grp.id, key: await importGroupKey(raw), members };
  }

  const flat = await makeGroup("Flat 4B", "🏠", ["ilyas", "jake", "priya", "sam", "maya"], "Imperial autumn term ends 12 Dec 2026. January exams 5–16 Jan 2027. Spring week applications mostly close end of Jan. Final results out 1 Jul 2027. Friday dinners at 7:30pm.");
  const footy = await makeGroup("Sunday League", "⚽", ["jake", "ilyas", "sam"], "5-a-side every Sunday 11am at Hyde Park. Arsenal v Spurs on 1 Nov 2026.");

  async function say(grp: { id: number; key: CryptoKey }, who: string, text: string) {
    const e = await encryptMessage(grp.key, text);
    await db.query(`INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5)`, [grp.id, users[who].id, e.ciphertext, e.iv, now()]);
  }

  // Recurring situations with each person's "true" tendency, so history is learnable.
  const templates: { grp: typeof flat; title: (s: string) => string; subject: string | null; p: number; hours: number }[] = [
    { grp: flat, title: (s) => `${s} is late to Friday dinner`, subject: "jake", p: 0.75, hours: 30 },
    { grp: flat, title: (s) => `${s} is late to Friday dinner`, subject: "priya", p: 0.2, hours: 30 },
    { grp: flat, title: (s) => `${s} makes the 9am lecture`, subject: "sam", p: 0.35, hours: 20 },
    { grp: flat, title: (s) => `${s} goes to the gym 3 times this week`, subject: "maya", p: 0.7, hours: 120 },
    { grp: flat, title: (s) => `${s} goes to the gym 3 times this week`, subject: "sam", p: 0.3, hours: 120 },
    { grp: flat, title: (s) => `${s} replies in the chat within an hour`, subject: "jake", p: 0.4, hours: 6 },
    { grp: flat, title: (s) => `${s} submits coursework a day early`, subject: "priya", p: 0.8, hours: 72 },
    { grp: flat, title: () => `Flat does the big Tesco shop this weekend`, subject: null, p: 0.5, hours: 60 },
    { grp: footy, title: () => `Arsenal win this weekend`, subject: null, p: 0.6, hours: 70 },
    { grp: footy, title: (s) => `${s} scores at 5-a-side on Sunday`, subject: "sam", p: 0.45, hours: 50 },
    { grp: footy, title: (s) => `${s} turns up late to 5-a-side`, subject: "jake", p: 0.7, hours: 50 },
  ];
  const chatter: Record<string, string[]> = {
    late: ["@jake where are you 😭", "omw 5 mins", "he said 5 mins 20 mins ago", "classic jake", "starting without you"],
    gym: ["gym at 7 anyone?", "smashed legs today", "skipped again, tired", "proud of myself ngl"],
    general: ["who's cooking tonight", "lets do pasta", "can someone buy milk", "exam stress is real", "congrats on the offer!!", "tesco run at 6?", "the bin is FULL", "who finished the hummus"],
  };

  const allUsers = Object.keys(users);
  for (let week = 0; week < 8; week++) {
    for (let k = 0; k < 4; k++) {
      const t = T0 - (56 - week * 7 - k * 1.6) * DAY;
      at(t);
      for (const u of allUsers) await applyAllowance(db, users[u].id);
      await runDecay(db);
      const tpl = pick(templates);
      const subjectName = tpl.subject ? users[tpl.subject].display_name : "";
      const creatorName = pick(tpl.grp.members.filter((m) => m !== tpl.subject));
      const creator = users[creatorName];
      await say(tpl.grp, pick(tpl.grp.members), pick(tpl.title("").includes("late") ? chatter.late : tpl.title("").includes("gym") ? chatter.gym : chatter.general));
      const id = await createMarket(creator, tpl.grp.id, {
        title: tpl.title(subjectName),
        resolvesAt: new Date(t + tpl.hours * 3600e3).toISOString(),
        subjectUsername: tpl.subject,
      });
      // Friends trade on noisy beliefs around the truth.
      const traders = tpl.grp.members.filter((m) => m !== tpl.subject).sort(() => rnd() - 0.5).slice(0, 2 + Math.floor(rnd() * 3));
      for (let i = 0; i < traders.length; i++) {
        at(t + ((i + 1) / (traders.length + 1)) * tpl.hours * 3600e3 * 0.8);
        const belief = clamp(tpl.p + gauss() * 0.15);
        const m = await getMarket(db, id);
        const p = price(m);
        if (Math.abs(belief - p) < 0.04) continue;
        const [u] = await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [users[traders[i]].id]);
        const amount = Math.min(Math.floor(u.balance * 0.25 - 1), 8 + Math.floor(rnd() * 30));
        if (amount < 2) continue;
        await trade(users[traders[i]], id, { side: belief > p ? "yes" : "no", action: "buy", amount }).catch(() => {});
      }
      at(t + tpl.hours * 3600e3 + 3600e3);
      const outcome = rnd() < tpl.p;
      await resolveMarket(creator, id, outcome, "", { waitForMemory: true });
    }
  }

  // Live situations around "today".
  at(T0 - 21 * DAY);
  const stocks = [
    { grp: flat, by: "priya", title: "Jake gets a girlfriend before summer", subject: "jake", end: T0 + 240 * DAY, p0: 0.4, drift: -0.1 },
    { grp: flat, by: "maya", title: "Priya graduates with a First", subject: "priya", end: T0 + 250 * DAY, p0: 0.55, drift: 0.1 },
    { grp: flat, by: "jake", title: "Ilyas lands a spring week offer by March", subject: "ilyas", end: T0 + 130 * DAY, p0: 0.45, drift: 0.15 },
    { grp: footy, by: "jake", title: "Sam runs a sub-25 minute 5k before Christmas", subject: "sam", end: T0 + 60 * DAY, p0: 0.3, drift: 0 },
  ];
  const ids: number[] = [];
  for (const s of stocks) {
    const id = await createMarket(users[s.by], s.grp.id, { title: s.title, resolvesAt: new Date(s.end).toISOString(), subjectUsername: s.subject });
    ids.push(id);
  }
  for (let day = 20; day >= 0; day--) {
    at(T0 - day * DAY - 3 * 3600e3);
    for (const u of allUsers) await applyAllowance(db, users[u].id);
    await runDecay(db);
    for (let i = 0; i < stocks.length; i++) {
      if (rnd() > 0.45) continue;
      const s = stocks[i];
      const m = await getMarket(db, ids[i]);
      const p = price(m);
      const target = clamp(s.p0 + s.drift * (1 - day / 20) + gauss() * 0.08);
      const traderPool = s.grp.members.filter((x) => x !== s.subject || target > p);
      const who = pick(traderPool);
      const side = target > p ? "yes" : "no";
      if (who === s.subject && side === "no") continue;
      await trade(users[who], ids[i], { side, action: "buy", amount: 10 + Math.floor(rnd() * 25) }).catch(() => {});
    }
    if (day % 3 === 0) await say(flat, pick(flat.members), pick(chatter.general));
  }

  at(T0 - 2 * 3600e3);
  const bets = [
    { grp: flat, by: "maya", title: "Jake is late to Friday dinner", subject: "jake", hours: 30 },
    { grp: flat, by: "ilyas", title: "Sam makes the 9am lecture on Monday", subject: "sam", hours: 64 },
    { grp: footy, by: "ilyas", title: "Arsenal beat Spurs on Sunday", subject: null, hours: 8 * 24 },
  ];
  for (const b of bets) {
    const id = await createMarket(users[b.by], b.grp.id, { title: b.title, resolvesAt: new Date(T0 + b.hours * 3600e3).toISOString(), subjectUsername: b.subject });
    for (const who of b.grp.members.filter((x) => x !== b.subject && x !== b.by).slice(0, 2)) {
      at(now().getTime() + 15 * 60e3);
      await trade(users[who], id, { side: rnd() < 0.6 ? "yes" : "no", action: "buy", amount: 10 + Math.floor(rnd() * 20) }).catch(() => {});
    }
  }
  at(T0 - 30 * 60e3);
  await say(flat, "ilyas", "new bet on jake for friday 👀");
  await say(flat, "jake", "I will be on time this week I promise");
  await say(flat, "priya", "he said that last week");
  await say(footy, "sam", "sunday 11am, bring a ball");

  g.__fsClockOffset = 0;
  // Don't hand the demo a backlog of thousands of devnet transactions.
  await db.query(`UPDATE chain_ops SET status = 'skipped' WHERE status = 'pending'`);
  const [{ n }] = await db.query<{ n: string }>(`SELECT count(*) AS n FROM markets`);
  console.log(`Seeded ${n} markets. Log in as any of ${allUsers.map((u) => "@" + u).join(", ")} with password "${PASSWORD}".`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
