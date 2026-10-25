/**
 * Four more sample people (Kofi, Hana, Theo and Ruby, Ilyas's sixth-form friends from Harrow) and
 * their chat, "Harrow Sixth Form": twelve weeks of everyday chat, settled stakes with the lines
 * around each result and a memory per result, so the AI has a record for each of them, plus a few
 * live stakes. Photos come from scripts/avatars/make.py and bios are filled here.
 *
 *   npx tsx --env-file=.env.local scripts/seed-newcomers.ts
 *   npm run demo:join        # then the real accounts see the new chat too, as guests
 *
 * Additive: it makes the four people only if they don't exist and stops if the chat already does.
 * Nothing in any other chat changes. Everything is written oldest first, so the chat reads in order.
 */
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../lib/db";
import { embed } from "../lib/ai";
import { MARKET } from "../lib/config";
import { bookAt } from "../lib/lmsr";
import { credit } from "../lib/economy";
import { newWallet } from "../lib/solana";
import { playbook } from "../lib/categories";
import { createMarket, trade } from "../lib/markets";
import { creatorKey } from "../lib/demo";
import { createIdentity, deriveKeys, encryptBytes, encryptMessage, importGroupKey, newGroupKey, randomSalt, wrapGroupKey } from "../lib/e2ee";
import type { User } from "../lib/auth";
import { PASSWORD, PEOPLE, type Line } from "./seed-content";
import type { RichLine, Story } from "./seed-rich-content";

const HOUR = 36e5;
const DAY = 24 * HOUR;
const DAYS = 84;
const NAME = "Harrow Sixth Form";
const NEW = ["kofi", "hana", "theo", "ruby"];
const MEMBERS = ["kofi", "ilyas", "hana", "theo", "ruby"];

const BIOS: Record<string, string> = {
  kofi: "Computer science at Warwick. Has a spreadsheet for that.",
  hana: "Architecture at Edinburgh. In the studio, will reply later.",
  theo: "Accounting apprentice in Canary Wharf. Probably coming.",
  ruby: "English at Bristol. On the last train home.",
};

const AI_CONTEXT =
  "Ilyas's friends from sixth form in Harrow, now at different places. Kofi studies computer science at Warwick and runs every plan from a spreadsheet; he pays first and hands work in early. Hana studies architecture at Edinburgh, works through the night before studio crits and often replies hours later. Theo did an accounting apprenticeship and works in Canary Wharf while studying for the ACA; he says yes to plans and often cancels on the day. Ruby studies English at Bristol, does essays at the last minute and is usually on the 23:52 from Paddington. They meet in Harrow when everyone is home and have a group call on the first Sunday of each month at 7pm. Reunion on 27 December at the pub on the hill. Lisbon trip planned for 14 February: flights from Gatwick and a £60 Airbnb deposit each.";

const SNIPPETS: Line[][] = [
  [["kofi", "group call sunday 7pm, first sunday of the month as always"], ["ruby", "I'll be on a train but I'll join"], ["theo", "I'm in"], ["hana", "will try"], ["kofi", "hana 'will try' means no"]],
  [["hana", "crit went fine, slept 3 hours"], ["ilyas", "fine as in good or fine as in fine"], ["hana", "fine as in I'm alive"]],
  [["theo", "can't make tonight, work thing came up"], ["kofi", "the work thing is always on the day theo"], ["theo", "it's month end"], ["ruby", "it's the 12th"]],
  [["ruby", "on the last train again, 23:52 from paddington"], ["ilyas", "the 23:52 is your second home"], ["ruby", "it has a trolley, it's basically a restaurant"]],
  [["kofi", "lisbon spreadsheet is updated, tab 4 is flights"], ["hana", "why are there four tabs"], ["kofi", "tab 5 is coming"]],
  [["ilyas", "anyone home in harrow this weekend"], ["theo", "I'm home, sunday lunch at my nan's"], ["kofi", "invite us"], ["theo", "no"]],
  [["$a", "who's seen the reunion poll"], ["$b", "voted"], ["$c", "voted for the 27th"], ["$a", "hana hasn't voted"]],
  [["hana", "sorry just seeing this, been in the studio since 9"], ["kofi", "it's 1am hana"], ["hana", "yes"]],
  [["ruby", "essay due friday, I've written the title"], ["ilyas", "strong title?"], ["ruby", "it's a great title"]],
  [["kofi", "flights to lisbon are £74 return from gatwick on the 14th"], ["ruby", "book it"], ["theo", "can we do luton"], ["kofi", "no"]],
  [["ilyas", "warwick vs imperial, who's having the worse week"], ["kofi", "two deadlines and a hackathon"], ["ilyas", "fair, you win"]],
  [["$a", "remember when theo got us kicked out of the common room"], ["theo", "it was one sandwich"], ["$b", "it was a toastie in the printer"]],
  [["theo", "who's around saturday, I'm free"], ["ruby", "theo free on a saturday, write it down"], ["theo", "I'm always free"], ["hana", "you are never free"]],
  [["$a", "miss sixth form honestly"], ["$b", "you miss free periods"], ["$a", "I miss free periods"]],
];

const STORIES: Story[] = [
  { group: NAME, subject: "theo", title: "{s} turns up to the group call", category: "social", kind: "bet", p: 0.45, times: 3, span: 72,
    rule: "YES if Theo joins Sunday's group call before it ends.",
    yes: [[["$s", "I'm here, I'm on"], ["$a", "theo on a call, screenshot this"]], [["$s", "on, camera off but on"], ["$b", "counts"]]],
    no: [[["$a", "7:15, no theo"], ["$s", "sorry work ran over"], ["$b", "it's sunday theo"]]] },
  { group: NAME, subject: "theo", title: "{s} comes to the meet-up in Harrow", category: "social", kind: "bet", p: 0.4, times: 3, span: 96,
    rule: "YES if Theo is at the meet-up in person at any point in the evening.",
    yes: [[["$s", "on my way, 10 mins"], ["$a", "he's actually coming"]]],
    no: [[["$s", "guys I can't do tonight"], ["$a", "called it"], ["$b", "pay up"]], [["$s", "something came up, next time"], ["$a", "there's always a next time with theo"]]] },
  { group: NAME, subject: "hana", title: "{s} replies to the chat within an hour", category: "habits", kind: "bet", p: 0.3, times: 6, span: 1,
    rule: "YES if Hana sends any message in the chat within an hour of the stake opening.",
    yes: [[["$s", "here! what did I miss"], ["$a", "58 minutes. she's alive"]]],
    no: [[["$s", "sorry just seeing this"], ["$a", "four hours later"]], [["$s", "was in a crit, what's up"], ["$b", "it's resolved now hana"]]] },
  { group: NAME, subject: "hana", title: "{s} is asleep before 3am the night before her crit", category: "habits", kind: "bet", p: 0.25, times: 3, span: 20,
    rule: "YES if Hana says she was asleep before 3am, the night before a studio crit.",
    yes: [[["$s", "asleep by 2:30, crit at 10, felt human"], ["$a", "growth"]]],
    no: [[["$s", "went to bed at 5:40"], ["$a", "the studio always wins"]]] },
  { group: NAME, subject: "ruby", title: "{s} makes the last train home", category: "travel", kind: "bet", p: 0.55, times: 4, span: 20,
    rule: "YES if Ruby is on the 23:52 from Paddington, or an earlier train.",
    yes: [[["$s", "on the 23:52, made it with a minute to spare"], ["$a", "the ruby sprint"]]],
    no: [[["$s", "missed it. ilyas, sofa?"], ["ilyas", "the sofa remembers you"]], [["$s", "the 23:52 left at 23:51, not my fault"], ["$a", "again"]]] },
  { group: NAME, subject: "ruby", title: "{s} hands her essay in on time", category: "uni", kind: "bet", p: 0.5, times: 4, span: 96,
    rule: "YES if Ruby submits the essay before the deadline without an extension.",
    yes: [[["$s", "submitted at 11:58"], ["$a", "on time is on time"]]],
    no: [[["$s", "asked for an extension"], ["$a", "but the title was so good"]]] },
  { group: NAME, subject: "kofi", title: "{s} gets his coursework in a day early", category: "uni", kind: "bet", p: 0.7, times: 3, span: 96,
    rule: "YES if Kofi submits at least 24 hours before the deadline.",
    yes: [[["$s", "submitted, a day early"], ["$a", "nobody likes a show-off kofi"]]],
    no: [[["$s", "ok it went in with 20 minutes to go"], ["$a", "the spreadsheet man is human"]]] },
  { group: NAME, subject: "kofi", title: "{s} is the first to pay his share", category: "money", kind: "bet", p: 0.8, times: 3, span: 48,
    rule: "YES if Kofi's share arrives before anyone else's.",
    yes: [[["$s", "sent mine"], ["$a", "of course kofi paid first"]]],
    no: [[["$a", "kofi hasn't paid??"], ["$s", "bank app was down"]]] },
  { group: NAME, subject: "theo", title: "{s} passes his first ACA exam", category: "work", kind: "stock", p: 0.75, times: 1, span: 40,
    rule: "YES if Theo passes the first ACA paper he sits this term.",
    yes: [[["$s", "passed!"], ["$a", "THEO"], ["$b", "drinks on you at christmas"]]],
    no: [[["$s", "failed by 3 marks"], ["$a", "resit in december, you've got this"]]] },
  { group: NAME, subject: null, title: "All five of us make the September meet-up", category: "social", kind: "stock", p: 0.35, times: 1, span: 20,
    rule: "YES if all five are at the September meet-up in Harrow at the same time.",
    yes: [[["$a", "all five of us in one place, first time since june"], ["$b", "frame it"]]],
    no: [[["$a", "four out of five, theo cancelled at 6"], ["$b", "classic"]]] },
];

type Open = { by: string; title: string; subject?: string; days: number; kind?: "bet" | "stock"; trades: [string, "yes" | "no", number][] };
const OPEN: Open[] = [
  { by: "kofi", title: "Everyone pays the £60 Lisbon Airbnb deposit by Sunday", days: 6, kind: "bet", trades: [["ruby", "no", 20], ["hana", "yes", 15], ["theo", "no", 25]] },
  { by: "ruby", title: "Theo turns up to the reunion on 27 December", subject: "theo", days: 63, kind: "stock", trades: [["kofi", "no", 30], ["hana", "yes", 20]] },
  { by: "theo", title: "Hana votes on the Lisbon dates poll before Monday", subject: "hana", days: 2, kind: "bet", trades: [["kofi", "no", 20], ["ruby", "yes", 10]] },
  { by: "hana", title: "Ruby books her Lisbon flight before Friday", subject: "ruby", days: 5, kind: "bet", trades: [["theo", "no", 15], ["kofi", "yes", 20]] },
];

let seed = 5150;
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
const pct = (p: number) => `${Math.round(p * 100)}%`;
const awake = (day: number) => day + (8 + Math.min(16.9, Math.abs(gauss()) * 6 + rnd() * 8)) * HOUR;

type U = { id: number; username: string; display_name: string; public_key: string; enc_private_key: string; key_salt: string; avatar_id: number | null };
// One message to write, in time order once everything is planned.
type Said = { at: number; who: U; text?: string; kind?: "market" | "resolution"; body?: string; marketId?: number };

async function main() {
  const db = await getDb();
  const [exists] = await db.query(`SELECT 1 FROM groups WHERE name = $1`, [NAME]);
  if (exists) throw new Error(`"${NAME}" already exists`);
  const load = async (name: string) =>
    (await db.query<U>(`SELECT id, username, display_name, public_key, enc_private_key, key_salt, avatar_id FROM users WHERE username = $1 AND deleted_at IS NULL`, [name]))[0];

  const T = Date.now();
  const START = T - DAYS * DAY;
  for (const name of NEW) {
    if (await load(name)) continue;
    const p = PEOPLE.find((x) => x.username === name)!;
    const salt = randomSalt();
    const { authKey, encKey } = await deriveKeys(PASSWORD, p.username, salt);
    const id = await createIdentity(encKey);
    const w = newWallet();
    const [u] = await db.query<{ id: number }>(
      `INSERT INTO users (username, display_name, auth_hash, color, balance, last_allowance_at, created_at, public_key, enc_private_key, key_salt, wallet_pubkey, wallet_secret_enc, bio)
       VALUES ($1,$2,$3,$4,0,$5,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [p.username, p.name, await bcrypt.hash(authKey, 10), p.color, new Date(START - 3 * DAY), id.publicKey, id.encPrivateKey, salt, w.pubkey, w.secretEnc, BIOS[name]]
    );
    await credit(db, u.id, 500, "Welcome bonus");
    console.log(`Made @${name}`);
  }
  const users: Record<string, U> = {};
  for (const name of MEMBERS) {
    users[name] = await load(name);
    if (!users[name]) throw new Error(`@${name} doesn't exist`);
  }

  // The chat, made by Kofi, with the key wrapped for each of them.
  const creator = users.kofi;
  const priv = await creatorKey(creator);
  if (!priv) throw new Error("Can't unlock @kofi's identity with the sample password");
  const raw = newGroupKey();
  const key = await importGroupKey(raw);
  const born = START + 20 * HOUR;
  const [grp] = await db.query<{ id: number }>(
    `INSERT INTO groups (name, emoji, invite_code, ai_context, created_by, created_at, ai_reads_chat) VALUES ($1,'',$2,$3,$4,$5,true) RETURNING id`,
    [NAME, "harrowsixthform-demo", AI_CONTEXT, creator.id, new Date(born)]
  );
  for (const m of MEMBERS) {
    await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,$3)`, [grp.id, users[m].id, new Date(born)]);
    await db.query(`INSERT INTO group_keys (group_id, user_id, wrapped_key, wrapped_by) VALUES ($1,$2,$3,$4)`, [grp.id, users[m].id, await wrapGroupKey(raw, priv, users[m].public_key), creator.id]);
  }
  await db.query(`INSERT INTO messages (group_id, user_id, kind, body, created_at) VALUES ($1,$2,'system',$3,$4)`, [grp.id, creator.id, `created ${NAME}`, new Date(born)]);

  const members = MEMBERS.map((m) => users[m]);
  const plan: Said[] = [];

  // Everyday chat, a snippet most days, never the same one twice within twelve days.
  const lastSaid = new Map<number, number>();
  for (let d = 1; d < DAYS; d++) {
    const k = Math.floor(1.3 + rnd());
    for (let j = 0; j < k; j++) {
      const fresh = SNIPPETS.map((_, i) => i).filter((i) => d - (lastSaid.get(i) ?? -99) >= 12);
      if (!fresh.length) break;
      const i = pick(fresh);
      lastSaid.set(i, d);
      const others = shuffle(MEMBERS);
      const roles: Record<string, string> = { $a: others[0], $b: others[1], $c: others[2] };
      let ts = awake(START + d * DAY);
      for (const [who, text] of SNIPPETS[i]) {
        plan.push({ at: Math.min(ts, T - 3 * HOUR), who: users[roles[who] ?? who], text });
        ts += (10 + rnd() * 150) * 1000 + text.length * 900;
      }
    }
  }

  // Settled stakes: the market, its price history and a memory now; its chat lines go in the plan.
  let made = 0;
  async function one(s: Story, createdAt: number, resolvesAt: number) {
    const subject = s.subject ? users[s.subject] : null;
    const others = members.filter((m) => m.id !== subject?.id);
    const by = pick(others.filter((m) => m.username !== "ilyas"));
    const title = s.title.replace("{s}", subject?.display_name ?? "");
    const outcome = rnd() < s.p;
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
         open_prob, ai_rationale, ai_source, b, q_yes, q_no, status, outcome, created_at, resolves_at, resolved_at, last_decay_at, volume, answer, evidence, sample)
       VALUES ($1,$2,$3,$4,$5,$6,'',$7,$8,$9,NULL,0,$9,$10,'heuristic',$11,$12,$13,'resolved',$14,$15,$16,$17,$15,$18,'yesno',1.5,true) RETURNING id`,
      [grp.id, by.id, subject?.id ?? null, s.kind, s.kind === "stock" ? "hazard" : "none", title, s.category, s.rule, ai,
        `Opened from the usual odds for ${pb.label.toLowerCase()} stakes and ${subject ? `${subject.display_name}'s` : "this chat's"} earlier record.`,
        b, bk.qYes, bk.qNo, outcome, new Date(createdAt), new Date(resolvesAt), new Date(resolvedAt), Math.round(volume)]
    );
    const all = [...ticks, { t: resolvedAt, p: outcome ? 1 : 0, source: "resolve" }];
    await db.query(
      `INSERT INTO price_ticks (market_id, ts, price, source) VALUES ${all.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(",")}`,
      all.flatMap((tk) => [m.id, new Date(tk.t), +tk.p.toFixed(4), tk.source])
    );
    plan.push({ at: createdAt, who: by, kind: "market", body: `${s.kind === "stock" ? "listed a stock" : "opened a bet"}: ${title}`, marketId: m.id });
    plan.push({ at: resolvedAt, who: by, kind: "resolution", body: `resolved ${outcome ? "YES" : "NO"}: ${title}`, marketId: m.id });
    const lines: RichLine[] = pick(outcome ? s.yes : s.no);
    const roles: Record<string, U> = { $s: subject ?? others[0], $a: others[0], $b: others[1] ?? others[0] };
    let t = resolvedAt - (5 + rnd() * 40) * 60e3;
    for (const [who, text] of lines) {
      plan.push({ at: t, who: roles[who] ?? users[who], text });
      t += (20 + rnd() * 200) * 1000;
    }
    const what = lines[0]?.[1] ? ` "${lines[0][1]}"` : "";
    const vector = await embed(title);
    await db.query(
      `INSERT INTO memories (group_id, market_id, subject_id, category, title, outcome, ai_prob, crowd_prob, summary, embedding, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [grp.id, m.id, subject?.id ?? null, s.category, title, outcome, ai, crowd, `${outcome ? "Happened" : "Didn't happen"}.${what} Opened at ${pct(ai)}, crowd closed at ${pct(crowd)}.`,
        vector ? JSON.stringify(vector) : null, new Date(resolvedAt)]
    );
    made++;
  }
  for (const s of STORIES) {
    if (s.kind === "stock") {
      const resolvesAt = T - (2 + rnd() * 12) * DAY;
      await one(s, resolvesAt - s.span * DAY, resolvesAt);
      continue;
    }
    for (let k = 0; k < s.times; k++) {
      const slot = (DAYS - 2) * DAY / s.times;
      const createdAt = START + 2 * DAY + (k + 0.2 + rnd() * 0.6) * slot;
      const resolvesAt = createdAt + s.span * HOUR;
      if (resolvesAt + 5 * HOUR > T - 3 * HOUR) continue;
      await one(s, createdAt, resolvesAt);
    }
  }

  // Oldest first, so the chat reads in order however it's sorted.
  plan.sort((a, b) => a.at - b.at);
  for (const s of plan) {
    if (s.kind) {
      await db.query(`INSERT INTO messages (group_id, user_id, kind, body, market_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [grp.id, s.who.id, s.kind, s.body, s.marketId, new Date(s.at)]);
    } else {
      const e = await encryptMessage(key, s.text!);
      await db.query(`INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at) VALUES ($1,$2,'chat',$3,$4,$5)`, [grp.id, s.who.id, e.ciphertext, e.iv, new Date(s.at)]);
    }
  }
  console.log(`"${NAME}" (group ${grp.id}): ${plan.length} messages, ${made} settled stakes`);

  // Live stakes through the normal market code, with a few early trades.
  const asUser = async (name: string) =>
    (await db.query<User>(`SELECT id, username, display_name, color, balance, public_key FROM users WHERE username = $1 AND deleted_at IS NULL`, [name]))[0];
  for (const s of OPEN) {
    const id = await createMarket(await asUser(s.by), grp.id, {
      title: s.title,
      resolvesAt: new Date(Date.now() + s.days * DAY).toISOString(),
      subjectUsername: s.subject ?? null,
      kind: s.kind,
    });
    await db.query(`UPDATE markets SET sample = true WHERE id = $1`, [id]);
    for (const [u, side, amount] of s.trades) await trade(await asUser(u), id, { side, action: "buy", amount });
    const [m] = await db.query<{ kind: string; open_prob: number; ai_source: string }>(`SELECT kind, open_prob, ai_source FROM markets WHERE id = $1`, [id]);
    console.log(`  #${id} ${m.kind} "${s.title}" opened at ${pct(m.open_prob)} (${m.ai_source})`);
  }
  await db.query(`UPDATE group_members gm SET delivered_upto = x.m, read_upto = x.m FROM (SELECT max(id) AS m FROM messages WHERE group_id = $1) x WHERE gm.group_id = $1`, [grp.id]);

  // Photos: their own copy of the profile key, and one for everyone they share a chat with.
  const pics = await db.query<{ id: number }>(`SELECT id FROM attachments WHERE group_id = $1 AND kind = 'group_photo'`, [grp.id]);
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "avatars");
  const groupJpeg = await readFile(path.join(dir, "groups", "harrow-sixth-form.jpg")).catch(() => null);
  if (!pics.length && groupJpeg) {
    const sealed = await encryptBytes(key, new Uint8Array(groupJpeg));
    const [a] = await db.query<{ id: number }>(`INSERT INTO attachments (owner_id, group_id, kind, data, size, created_at) VALUES ($1,$2,'group_photo',$3,$4,now()) RETURNING id::int`, [creator.id, grp.id, sealed, sealed.length]);
    await db.query(`UPDATE groups SET photo_id = $2 WHERE id = $1`, [grp.id, a.id]);
  }
  for (const name of NEW) {
    const u = await load(name);
    const me = await creatorKey(u);
    const jpeg = await readFile(path.join(dir, `${name}.jpg`)).catch(() => null);
    if (u.avatar_id || !me || !jpeg) continue;
    const pk = newGroupKey();
    const sealed = await encryptBytes(await importGroupKey(pk), new Uint8Array(jpeg));
    const [a] = await db.query<{ id: number }>(`INSERT INTO attachments (owner_id, group_id, kind, data, size, created_at) VALUES ($1,NULL,'avatar',$2,$3,now()) RETURNING id::int`, [u.id, sealed, sealed.length]);
    await db.query(`UPDATE users SET avatar_id = $2 WHERE id = $1`, [u.id, a.id]);
    const viewers = await db.query<{ id: number; public_key: string }>(
      `SELECT DISTINCT v.id, v.public_key FROM group_members mine JOIN group_members o ON o.group_id = mine.group_id
         JOIN users v ON v.id = o.user_id AND v.deleted_at IS NULL AND v.public_key IS NOT NULL WHERE mine.user_id = $1
       UNION SELECT id, public_key FROM users WHERE id = $1`,
      [u.id]
    );
    for (const v of viewers) await db.query(`INSERT INTO profile_keys (owner_id, viewer_id, wrapped) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [u.id, v.id, await wrapGroupKey(pk, me, v.public_key)]);
    console.log(`Photo for @${name}, shown to ${viewers.length} people`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
