/**
 * Demo data that looks like three months of real use: fifteen people across six group
 * chats (flatmates, a uni course, five-a-side, spring week applications, family, a run
 * club), daily chat, ~120 settled bets with trades, long-term stocks with price history,
 * weekly allowances, and today's live situations. Chat messages are really encrypted.
 * The words people say live in scripts/seed-content.ts; this file only runs the clock.
 *
 *   npm run seed            (stop the dev server first when using embedded PGlite)
 *
 * Runs through the same market engine as the app by moving the app clock.
 */
// Deterministic and fast: the stats model prices the history; the live AI is used in the app itself.
process.env.AI_PROVIDER = "none";
process.env.DEMO_MODE ??= "true";

import bcrypt from "bcryptjs";
import { getDb } from "../lib/db";
import { now } from "../lib/clock";
import { credit, applyAllowance } from "../lib/economy";
import { createMarket, resolveMarket, runDecay, trade, getMarket, price } from "../lib/markets";
import { newWallet } from "../lib/solana";
import { createIdentity, deriveKeys, encryptMessage, importGroupKey, newGroupKey, randomSalt, wrapGroupKey } from "../lib/e2ee";
import type { User } from "../lib/auth";
import { GROUPS, PASSWORD, PEOPLE, type Group, type Line } from "./seed-content";

const g = globalThis as unknown as { __fsClockOffset?: number; __fsDb?: unknown };
const HOUR = 36e5;
const DAY = 24 * HOUR;
const DAYS = 91;
const T0 = Date.now();
const START = T0 - DAYS * DAY;
const at = (t: number) => (g.__fsClockOffset = t - Date.now());
// Aim for this many settled bets in total, however often the content says things come up.
const TARGET_SETTLED = 120;

let seed = 2026;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const shuffle = <T,>(xs: T[]) => [...xs].sort(() => rnd() - 0.5);
const clamp = (p: number, lo = 0.04, hi = 0.96) => Math.min(hi, Math.max(lo, p));
/** A plausible time of day for people to be on their phones (8am to 1am, busiest in the evening). */
const awake = (day: number) => day + (8 + Math.min(16.9, Math.abs(gauss()) * 6 + rnd() * 8)) * HOUR;

type Seeded = User & { priv: CryptoKey; skill: number; boldness: number };
type Chat = { id: number; key: CryptoKey; spec: Group };
type Event = { t: number; run: () => Promise<void> };

async function main() {
  let db = await getDb();
  await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  g.__fsDb = undefined;
  db = await getDb();
  at(START - 2 * DAY);
  const t1 = Date.now();

  // People, with real E2EE identities and custodial wallets.
  const users: Record<string, Seeded> = {};
  for (const p of PEOPLE) {
    const salt = randomSalt();
    const { authKey, encKey } = await deriveKeys(PASSWORD, p.username, salt);
    const id = await createIdentity(encKey);
    const w = newWallet();
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc)
       VALUES ($1,$2,$3,$4,0,$5,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [p.username, p.name, await bcrypt.hash(authKey, 10), p.color, now(), id.publicKey, id.encPrivateKey, salt, w.pubkey, w.secretEnc]
    );
    await credit(db, u.id, 500, "Welcome bonus");
    users[p.username] = { id: u.id, username: p.username, display_name: p.name, color: p.color, balance: 500, public_key: id.publicKey, wallet_pubkey: w.pubkey, priv: id.privateKey, skill: p.skill, boldness: p.boldness };
  }
  const name = (u: string | null) => (u && users[u] ? users[u].display_name : "");
  console.log(`People ready (${((Date.now() - t1) / 1000).toFixed(0)}s)`);

  // Chats, created a few days apart as the app spread through the friend groups.
  const chats: Chat[] = [];
  for (let i = 0; i < GROUPS.length; i++) {
    const spec = GROUPS[i];
    at(START + i * 1.7 * DAY + 19 * HOUR);
    const raw = newGroupKey();
    const creator = users[spec.members[0]];
    const [grp] = await db.query<{ id: number }>(
      `INSERT INTO groups (name, emoji, invite_code, ai_context, created_by, created_at) VALUES ($1,'',$2,$3,$4,$5) RETURNING id`,
      [spec.name, `${spec.name.toLowerCase().replace(/[^a-z0-9]/g, "")}-demo`, spec.aiContext, creator.id, now()]
    );
    for (const m of spec.members) {
      await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3)`, [grp.id, users[m].id, now()]);
      await db.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4)`, [grp.id, users[m].id, await wrapGroupKey(raw, creator.priv, users[m].public_key), creator.id]);
    }
    await db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [grp.id, creator.id, `created ${spec.name}`, now()]);
    chats.push({ id: grp.id, key: await importGroupKey(raw), spec });
  }
  const born = (c: Chat) => START + chats.indexOf(c) * 1.7 * DAY + 20 * HOUR;

  /** Post one snippet of conversation starting at time t, one bulk insert. */
  async function speak(c: Chat, lines: Line[], t: number, subject: string | null = null) {
    const others = shuffle(c.spec.members.filter((m) => m !== subject));
    const roles: Record<string, string> = { $a: others[0], $b: others[1] ?? others[0], $c: others[2] ?? others[0], $s: subject ?? others[3] ?? others[0] };
    const rows: unknown[] = [];
    let ts = t;
    for (const [who, text] of lines) {
      const u = users[roles[who] ?? who];
      if (!u || !c.spec.members.includes(u.username)) continue;
      const e = await encryptMessage(c.key, text);
      rows.push(c.id, u.id, e.ciphertext, e.iv, new Date(Math.min(ts, T0 - 60e3)));
      ts += (10 + rnd() * 150) * 1000 + text.length * 900;
    }
    if (!rows.length) return;
    const values = Array.from({ length: rows.length / 5 }, (_, i) => `($${i * 5 + 1},$${i * 5 + 2},'chat',$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(",");
    await db.query(`INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ${values}`, rows);
  }

  /** One friend trades on a noisy belief about the truth; sharper people are less noisy. */
  async function act(who: string, marketId: number, truth: number) {
    const u = users[who];
    const m = await getMarket(db, marketId);
    const p = price(m);
    const belief = clamp(truth + gauss() * (0.04 + (1 - u.skill) * 0.32));
    if (Math.abs(belief - p) < 0.04) return;
    const [{ balance }] = await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [u.id]);
    const amount = Math.floor(Math.min(balance * 0.3, 6 + u.boldness * 40 * (0.4 + rnd())));
    // People keep some cash back, so nobody arrives at the demo unable to trade.
    if (amount < 3 || balance - amount < 220) return;
    await trade(u, marketId, { side: belief > p ? "yes" : "no", action: "buy", amount }).catch(() => {});
  }

  const events: Event[] = [];
  const add = (t: number, run: () => Promise<void>) => events.push({ t, run });

  // Daily housekeeping: allowances land weekly per person, stocks decay as time passes.
  for (let d = 0; d <= DAYS; d++) {
    const t = START + d * DAY + 7 * HOUR;
    add(t, async () => {
      if (d % 2 === 0) for (const u of Object.values(users)) await applyAllowance(db, u.id);
      await runDecay(db);
    });
  }

  // Everyday chat.
  for (const c of chats) {
    for (let d = Math.ceil((born(c) - START) / DAY); d < DAYS; d++) {
      const n = Math.floor(c.spec.activity + rnd());
      for (let k = 0; k < n; k++) {
        const t = awake(START + d * DAY);
        add(t, () => speak(c, pick(c.spec.snippets), t));
      }
    }
  }

  // Nobody can call a market the way that pays them, so the first friend (creator first) who can, does.
  async function settle(members: string[], first: string, subject: string | null | undefined, id: number, outcome: boolean) {
    for (const who of [first, ...members.filter((m) => m !== first && m !== subject)]) {
      const ok = await resolveMarket(users[who], id, outcome, "", { waitForMemory: true }).then(() => true, () => false);
      if (ok) return;
    }
  }

  // Recurring situations, settled before today, so the AI has a track record per person.
  const perWeek = GROUPS.flatMap((s) => s.templates.map((x) => x.perWeek)).reduce((a, b) => a + b, 0);
  const scale = TARGET_SETTLED / (perWeek * (DAYS / 7) * 0.92);
  for (const c of chats) {
    for (const tpl of c.spec.templates) {
      let t = born(c) + rnd() * 3 * DAY;
      for (;;) {
        t += (7 * DAY) / (tpl.perWeek * scale) * (0.5 + rnd());
        const open = awake(START + Math.floor((t - START) / DAY) * DAY);
        const close = open + tpl.hours * HOUR;
        if (close + 2 * HOUR > T0 - 3 * HOUR) break;
        const holder = { id: 0 };
        const creator = pick(c.spec.members.filter((m) => m !== tpl.subject));
        add(open - 6 * 60e3, () => speak(c, pick(tpl.before), open - 6 * 60e3, tpl.subject));
        add(open, async () => {
          holder.id = await createMarket(users[creator], c.id, {
            title: tpl.title.replace("{s}", name(tpl.subject)),
            resolvesAt: new Date(close).toISOString(),
            subjectUsername: tpl.subject,
          });
        });
        const traders = shuffle(c.spec.members.filter((m) => m !== tpl.subject)).slice(0, 2 + Math.floor(rnd() * 3));
        traders.forEach((who, i) => add(open + ((i + 1) / (traders.length + 1)) * tpl.hours * HOUR * 0.85, () => (holder.id ? act(who, holder.id, tpl.p) : Promise.resolve())));
        const outcome = rnd() < tpl.p;
        add(close + HOUR, async () => {
          if (holder.id) await settle(c.spec.members, creator, tpl.subject, holder.id, outcome);
        });
        add(close + HOUR + 4 * 60e3, () => speak(c, pick(outcome ? tpl.yes : tpl.no), close + HOUR + 4 * 60e3, tpl.subject));
      }
    }
  }

  // Long-term stocks: a few settled during the three months, the rest still trading.
  for (const c of chats) {
    for (const s of c.spec.stocks) {
      const open = Math.max(born(c) + 6 * HOUR, T0 - s.openDaysAgo * DAY + 14 * HOUR);
      const end = T0 + s.resolveDaysFromNow * DAY;
      const settled = s.outcome !== undefined && end < T0;
      const holder = { id: 0 };
      add(open, async () => {
        holder.id = await createMarket(users[s.by], c.id, { title: s.title, resolvesAt: new Date(Math.max(end, now().getTime() + DAY)).toISOString(), subjectUsername: s.subject });
      });
      const last = settled ? end - DAY : T0 - 2 * HOUR;
      for (let t = open + DAY; t < last; t += (1 + rnd() * 2.5) * DAY) {
        const progress = (t - open) / Math.max(DAY, last - open);
        const truth = clamp(s.p0 + s.drift * progress + gauss() * 0.06);
        const who = pick(c.spec.members);
        const when = awake(START + Math.floor((t - START) / DAY) * DAY);
        if (when >= last) break;
        add(when, () => (holder.id ? act(who, holder.id, truth) : Promise.resolve()));
      }
      if (settled) add(end, async () => {
        if (holder.id) await settle(c.spec.members, s.by, s.subject, holder.id, s.outcome!);
      });
    }
  }

  // Today's live bets, and the last few messages before "now".
  for (const c of chats) {
    for (const b of c.spec.liveBets) {
      const open = T0 - (3 + rnd() * 16) * HOUR;
      const holder = { id: 0 };
      add(open, async () => {
        holder.id = await createMarket(users[b.by], c.id, { title: b.title, resolvesAt: new Date(T0 + b.hoursLeft * HOUR).toISOString(), subjectUsername: b.subject });
      });
      const traders = shuffle(c.spec.members.filter((m) => m !== b.subject && m !== b.by)).slice(0, 3);
      traders.forEach((who, i) => add(open + (i + 1) * 40 * 60e3, () => (holder.id ? act(who, holder.id, clamp(0.5 + gauss() * 0.2)) : Promise.resolve())));
    }
    const t = T0 - (25 + rnd() * 30) * 60e3;
    add(t, () => speak(c, c.spec.recent, t));
  }

  events.sort((a, b) => a.t - b.t);
  console.log(`Replaying ${events.length} events…`);
  let done = 0;
  for (const e of events) {
    at(Math.min(e.t, T0 - 60e3));
    await e.run();
    if (++done % 200 === 0) console.log(`  ${done}/${events.length} (${((Date.now() - t1) / 60000).toFixed(1)} min)`);
  }

  g.__fsClockOffset = 0;
  // Don't hand the demo a backlog of thousands of chain transactions.
  await db.query(`UPDATE chain_ops SET status = 'skipped' WHERE status = 'pending'`);
  // One mint per wallet for today's balance instead, so the first stake has tokens to burn.
  await db.query(
    `INSERT INTO chain_ops (kind, user_id, amount, memo, created_at)
     SELECT 'mint', id, balance, 'Opening balance', $1 FROM users WHERE wallet_pubkey IS NOT NULL AND balance > 0`,
    [now()]
  );
  const [{ n, r }] = await db.query<{ n: string; r: string }>(`SELECT count(*) AS n, count(*) FILTER (WHERE status = 'resolved') AS r FROM markets`);
  const [{ msgs }] = await db.query<{ msgs: string }>(`SELECT count(*) AS msgs FROM messages`);
  console.log(`Seeded ${n} markets (${r} settled) and ${msgs} messages in ${((Date.now() - t1) / 60000).toFixed(1)} min.`);
  console.log(`Log in as any of ${PEOPLE.map((p) => "@" + p.username).join(", ")} with password "${PASSWORD}".`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
