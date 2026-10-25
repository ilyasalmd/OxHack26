import { getDb } from "./db";
import { now } from "./clock";
import { DEMO_BOTS, ECONOMY } from "./config";
import { askJson } from "./ai";
import { markRead, setTyping } from "./chat";
import { notifyChat } from "./live";
import { creatorKey, SAMPLE_GROUPS } from "./demo";
import { decryptPayload, encryptMessage, importGroupKey, unwrapGroupKey } from "./e2ee";
import { book, getMarket, trade, voteOnResult, voteState } from "./markets";
import { priceYes } from "./lmsr";
import { maxStake } from "./economy";
import { PEOPLE } from "../scripts/seed-content";
import type { User } from "./auth";

/**
 * Demo only: when someone posts a stake in one of the sample chats, two to four of the sample
 * people in it react in the chat and trade on it over the next minute, so a live demo shows a
 * market that moves. Every trade goes through trade(), with the same caps, fees and ledger as a
 * person's, and is flagged `bot` so the admin can tell. It never runs outside the sample chats,
 * never acts for a real account, and DEMO_BOTS=false turns it off.
 */

// Ilyas is a sample person too, but it's also the name a teammate signs in with, so it never acts by itself.
const BOTS = new Map(PEOPLE.filter((p) => p.username !== "ilyas").map((p) => [p.username, p]));

type Bot = { id: number; username: string; display_name: string; key_salt: string; enc_private_key: string; public_key: string; balance: number; wrapped_key: string; wrapper_public_key: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

const LINES = {
  yes: ["easy money, I'm in", "this is happening, no doubt", "free coins honestly", "I've seen this coming for weeks", "taking the long side on this one"],
  no: ["no chance", "I'll take the other side of that", "not a hope, shorting it", "bold call, I'm betting against", "history says otherwise"],
  subject: ["wow, thanks for the faith", "I'm going to prove you all wrong", "this is slander"],
};

/**
 * Demo only: when a real person writes in a sample chat, one of the sample people in it reads it
 * within a second or so (so the sender's tick turns into the logo), and once the chat goes quiet
 * for a few seconds one of them answers, in character, from the last few messages.
 */
const replying = new Map<number, { timer: NodeJS.Timeout; last: number }>();
export function startBotReply(groupId: number, senderId: number) {
  if (!DEMO_BOTS) return;
  readSoon(groupId, senderId).catch((e) => console.warn("[bots] read", (e as Error).message));
  const prev = replying.get(groupId);
  if (prev) clearTimeout(prev.timer);
  const last = prev?.last ?? 0;
  // Wait for a pause in what they're typing; never more than one reply every 8 seconds per chat.
  const wait = Math.max(3500 + Math.random() * 2000, last + 8000 - Date.now());
  const timer = setTimeout(() => {
    replying.set(groupId, { timer, last: Date.now() });
    reply(groupId, senderId).catch((e) => console.warn("[bots] reply", (e as Error).message));
  }, wait);
  replying.set(groupId, { timer, last });
}

async function chatBots(groupId: number, excludeId: number) {
  const db = await getDb();
  const [sample] = await db.query(`SELECT 1 FROM groups gr WHERE gr.id = $1 AND ${SAMPLE_GROUPS}`, [groupId]);
  if (!sample) return [];
  const members = await db.query<Bot>(
    `SELECT u.id, u.username, u.display_name, u.key_salt, u.enc_private_key, u.public_key, u.balance, gk.wrapped_key, w.public_key AS wrapper_public_key
       FROM group_members gm JOIN users u ON u.id = gm.user_id AND u.deleted_at IS NULL
       JOIN group_keys gk ON gk.group_id = gm.group_id AND gk.user_id = u.id JOIN users w ON w.id = gk.wrapped_by
      WHERE gm.group_id = $1 AND NOT gm.guest AND u.id <> $2`,
    [groupId, excludeId]
  );
  return shuffle(members.filter((b) => BOTS.has(b.username)));
}

async function readSoon(groupId: number, senderId: number) {
  const bots = await chatBots(groupId, senderId);
  if (!bots.length) return;
  await sleep(700 + Math.random() * 900);
  const db = await getDb();
  await markRead(db, groupId, bots[0].id);
  // A couple more catch up a moment later, as people do.
  for (const b of bots.slice(1, 1 + Math.floor(Math.random() * 3))) {
    await sleep(1500 + Math.random() * 4000);
    await markRead(db, groupId, b.id);
  }
}

async function reply(groupId: number, senderId: number) {
  const bots = await chatBots(groupId, senderId);
  const b = bots[0];
  if (!b) return;
  const priv = await creatorKey(b);
  if (!priv) return;
  const key = await importGroupKey(await unwrapGroupKey(b.wrapped_key, priv, b.wrapper_public_key));
  const db = await getDb();
  const recent = await db.query<{ ciphertext: string; iv: string; display_name: string }>(
    `SELECT m.ciphertext, m.iv, u.display_name FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = $1 AND m.kind = 'chat' AND m.ciphertext IS NOT NULL ORDER BY m.id DESC LIMIT 8`,
    [groupId]
  );
  const lines: string[] = [];
  for (const r of recent.reverse()) {
    const p = await decryptPayload(key, r.iv, r.ciphertext).catch(() => null);
    if (p?.t) lines.push(`${r.display_name}: ${p.t.slice(0, 200)}`);
  }
  const [g] = await db.query<{ name: string }>(`SELECT name FROM groups WHERE id = $1`, [groupId]);
  const person = BOTS.get(b.username)!;
  setTyping(groupId, b.id, "text");
  const prompt = `You are ${b.display_name}, texting in a group chat called "${g?.name ?? "the chat"}" with friends. The latest messages:
${lines.join("\n")}
Write ${b.display_name}'s next message: reply to the last one naturally, casual British English, lowercase is fine, under 15 words, no emoji, no hashtags.${person.boldness > 0.7 ? " You're a bit cocky." : ""}`;
  const out = await askJson<{ reply: string }>(prompt, { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] }, 15000);
  const text = (typeof out?.reply === "string" ? out.reply : "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/^["']|["']$/g, "").replace(new RegExp(`^${b.display_name}:\\s*`, "i"), "").trim().slice(0, 140);
  await sleep(800 + Math.random() * 1200);
  await say(groupId, b, text || pick(SMALL_TALK)).catch((e) => console.warn("[bots] chat", (e as Error).message));
  setTyping(groupId, b.id, null);
}

const SMALL_TALK = ["haha fair", "say less", "honestly same", "wait what", "no way", "classic", "I'm in", "100%", "big if true", "we'll see about that"];

/** Starts the bots for a freshly posted stake. Returns at once; they act over the next minute. */
export function startBots(marketId: number, posterId: number) {
  if (!DEMO_BOTS) return;
  runBots(marketId, posterId).catch((e) => console.warn("[bots]", (e as Error).message));
}

async function runBots(marketId: number, posterId: number) {
  const db = await getDb();
  const m = await getMarket(db, marketId);
  const [sample] = await db.query(`SELECT 1 FROM groups gr WHERE gr.id = $1 AND ${SAMPLE_GROUPS}`, [m.group_id]);
  if (!sample) return;
  const members = await db.query<Bot>(
    `SELECT u.id, u.username, u.display_name, u.key_salt, u.enc_private_key, u.public_key, u.balance, gk.wrapped_key, w.public_key AS wrapper_public_key
       FROM group_members gm JOIN users u ON u.id = gm.user_id AND u.deleted_at IS NULL
       JOIN group_keys gk ON gk.group_id = gm.group_id AND gk.user_id = u.id JOIN users w ON w.id = gk.wrapped_by
      WHERE gm.group_id = $1 AND NOT gm.guest AND u.id <> $2`,
    [m.group_id, posterId]
  );
  const bots = shuffle(members.filter((b) => BOTS.has(b.username))).slice(0, 2 + Math.floor(Math.random() * 3));
  if (!bots.length) return;

  const p0 = priceYes(book(m));
  // Each bot's own read of the odds: sharper people land nearer the truth the market can't see yet.
  const plans = bots.map((b) => {
    const person = BOTS.get(b.username)!;
    const isSubject = b.id === m.subject_id;
    const view = Math.min(0.95, Math.max(0.05, p0 + (Math.random() - 0.5) * (1.1 - person.skill)));
    const side: "yes" | "no" = isSubject ? "yes" : view >= p0 ? "yes" : "no";
    return { b, person, isSubject, side, trades: !(isSubject && m.kind === "bet") };
  });
  const lines = await chatLines(m.title, p0, plans.map((p) => ({ name: p.b.display_name, side: p.side, isSubject: p.isSubject, boldness: p.person.boldness })));

  for (const [i, p] of plans.entries()) {
    await sleep(i === 0 ? 3000 + Math.random() * 3000 : 6000 + Math.random() * 9000);
    if (!(await stillOpen(marketId))) return;
    setTyping(m.group_id, p.b.id, "text");
    await sleep(1500 + Math.random() * 1500);
    await say(m.group_id, p.b, lines[i] ?? pick(p.isSubject ? LINES.subject : LINES[p.side])).catch((e) => console.warn("[bots] chat", (e as Error).message));
    setTyping(m.group_id, p.b.id, null);
    if (!p.trades) continue;
    await sleep(1500 + Math.random() * 2500);
    const [{ balance }] = await db.query<{ balance: number }>(`SELECT balance FROM users WHERE id = $1`, [p.b.id]);
    const cap = maxStake(balance);
    const amount = Math.round(Math.min(cap, 8 + p.person.boldness * 45 * (0.4 + Math.random())));
    if (amount < ECONOMY.minTrade) continue;
    await trade(asUser(p.b), marketId, { side: p.side, action: "buy", amount }, { bot: true }).catch((e) => console.warn("[bots] trade", (e as Error).message));
  }

  // On a stock, someone takes a little profit (or cuts a loss) once the price has moved.
  if (m.kind !== "stock") return;
  const seller = plans.find((p) => p.trades && !p.isSubject);
  if (!seller) return;
  await sleep(10000 + Math.random() * 10000);
  if (!(await stillOpen(marketId))) return;
  const [pos] = await db.query<{ yes_shares: number; no_shares: number }>(`SELECT yes_shares, no_shares FROM positions WHERE market_id = $1 AND user_id = $2`, [marketId, seller.b.id]);
  const held = pos ? (seller.side === "yes" ? pos.yes_shares : pos.no_shares) : 0;
  if (held > 2) await trade(asUser(seller.b), marketId, { side: seller.side, action: "sell", amount: Math.round(held * 0.4) }, { bot: true }).catch((e) => console.warn("[bots] sell", (e as Error).message));
}

/** Demo only: when someone proposes a result in a sample chat, the sample people who can vote do, over the next half minute. */
export function startBotVotes(marketId: number) {
  if (!DEMO_BOTS) return;
  runVotes(marketId).catch((e) => console.warn("[bots] votes", (e as Error).message));
}

async function runVotes(marketId: number) {
  const db = await getDb();
  const m = await getMarket(db, marketId);
  const [sample] = await db.query(`SELECT 1 FROM groups gr WHERE gr.id = $1 AND ${SAMPLE_GROUPS}`, [m.group_id]);
  if (!sample) return;
  const { eligible } = await voteState(db, m);
  const voters = shuffle(
    (await db.query<Bot>(`SELECT id, username, display_name, public_key, balance FROM users WHERE id = ANY($1::int[]) AND deleted_at IS NULL`, [eligible])).filter((b) => BOTS.has(b.username))
  );
  for (const b of voters) {
    await sleep(4000 + Math.random() * 8000);
    const now = await getMarket(db, marketId);
    if (now.status !== "open" || now.proposed_outcome == null || now.proposed_at?.toString() !== m.proposed_at?.toString()) return;
    // Mostly they agree with what a friend says happened; now and then someone pushes back.
    const confirm = Math.random() < (m.proposed_early ? 0.8 : 0.85);
    await voteOnResult(asUser(b), marketId, confirm).catch((e) => console.warn("[bots] vote", (e as Error).message));
  }
}

async function stillOpen(marketId: number) {
  const m = await getMarket(await getDb(), marketId);
  return m.status === "open" && m.proposed_outcome == null;
}

const asUser = (b: Bot) => ({ id: b.id, username: b.username, display_name: b.display_name, balance: b.balance, public_key: b.public_key }) as User;

/** Posts an end-to-end encrypted chat message as a sample person, the way their browser would. */
async function say(groupId: number, b: Bot, text: string) {
  const priv = await creatorKey(b);
  if (!priv) return;
  const raw = await unwrapGroupKey(b.wrapped_key, priv, b.wrapper_public_key);
  const e = await encryptMessage(await importGroupKey(raw), text);
  await (await getDb()).query(`INSERT INTO messages (group_id, user_id, kind, ciphertext, iv, created_at, bot) VALUES ($1,$2,'chat',$3,$4,$5,true)`, [groupId, b.id, e.ciphertext, e.iv, now()]);
  // Open chats show it straight away rather than on their next re-check.
  notifyChat(groupId);
}

/** One short line per bot from Gemma, in the group-chat voice; canned lines if the model is off or slow. */
async function chatLines(title: string, price: number, who: { name: string; side: "yes" | "no"; isSubject: boolean; boldness: number }[]) {
  const prompt = `Friends in a group chat just saw this bet posted: "${title}" (the market says ${Math.round(price * 100)}% it happens).
Write one short reply for each person below, in order, as they'd text it: casual British English, lowercase is fine, under 12 words, no emoji, no hashtags.
${who.map((w, i) => `${i + 1}. ${w.name}: ${w.isSubject ? "it's about them, they're a bit defensive" : w.side === "yes" ? "thinks it will happen and is betting on it" : "thinks it won't and is betting against it"}${w.boldness > 0.7 ? ", cocky" : ""}`).join("\n")}`;
  const out = await askJson<{ lines: string[] }>(prompt, { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"] }, 20000);
  const clean = (s: unknown) => (typeof s === "string" ? s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/^["']|["']$/g, "").trim().slice(0, 120) : "");
  return who.map((w, i) => clean(out?.lines?.[i]) || pick(w.isSubject ? LINES.subject : LINES[w.side]));
}
