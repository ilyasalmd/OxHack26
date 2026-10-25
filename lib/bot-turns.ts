/**
 * Demo only: who answers when a real person writes in a sample chat. Pure, so it can be tested.
 *
 * The rule is the one people follow in a real group chat:
 *  1. If the message names one of the sample people ("how r u dad", "@priya", "mum, ..."), they answer.
 *  2. Otherwise, if the sender is answering someone (the last other person to speak before it), that
 *     person answers back.
 *  3. If nobody is addressed, someone picks it up most of the time, preferring whoever hasn't just
 *     spoken, and now and then nobody does.
 * Someone else often chips in after the first reply, usually with a quick "100%" or "lol" rather
 * than a full answer. A bare "ok" or "lol" from the sender often gets no reply at all.
 */

/** How many recent chat messages a sample person reads before answering. */
export const BOT_CONTEXT = 14;

export type TurnMember = { id: number; username: string; display_name: string; bot: boolean };
export type TurnMessage = { userId: number; text: string; at: number };
export type Turns = {
  /** Who answers, in order. The first is the person addressed; any after it chip in. */
  order: number[];
  why: "named" | "reply" | "open" | "someone-else";
  /** The ones in `order` who only react ("100%", "lol") instead of answering. */
  quick: number[];
};

// What people call their parents in a family chat, so "hi mum" finds the sample person called Mum.
const ALIASES: Record<string, string[]> = {
  mum: ["mum", "mom", "mam", "mummy", "mommy", "mama", "mother"],
  dad: ["dad", "daddy", "papa", "baba", "father", "pops"],
};
const GREETINGS = ["hi", "hey", "hello", "hiya", "yo", "oi", "morning", "evening", "night", "thanks", "thank you", "cheers", "love you", "miss you"];
// A conversation goes cold: past this, the last speaker isn't the person being answered.
const REPLY_WINDOW_MS = 2 * 3600e3;
// How often a second person chips in, and how often that's a quick reaction rather than a reply.
const CHIME_AFTER_ADDRESSED = 0.25;
const CHIME_WHEN_OPEN = 0.35;
const CHIME_QUICK = 0.6;
// How often an open message, or a bare "ok"/"lol" nobody needs to answer, gets no reply.
const QUIET_WHEN_OPEN = 0.15;
const QUIET_AFTER_ACK = 0.55;
// How often, in a group of three or more, a message after someone's passing remark is open to anyone.
const OPEN_AFTER_REMARK = 0.55;
/** A message that needs no answer: "ok", "lol", "haha", "100%", "nice". */
export const ACK = /^(ok(ay)?|k|kk|lol+|lmao+|haha+|ha|nice|fair|true|same|yeah|yep|ye|ya|cool|sound|bet|100%?|facts|fr|word|right|oh|ah|hmm+|mhm|np|ty|thx)[\s!.?]*$/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function namesFor(m: TurnMember) {
  const base = [m.display_name.toLowerCase(), m.username.toLowerCase()];
  return [...new Set([...base, ...(ALIASES[m.username] ?? []), ...(ALIASES[m.display_name.toLowerCase()] ?? [])])].filter((n) => n.length >= 2);
}

/**
 * How directly `text` speaks to `m`: 2 when they're called by name ("dad, ...", "how r u dad",
 * "hi dad", "@dad"), 1 when they're only mentioned ("tell dad"), 0 when they're not in it at all.
 */
export function addressScore(text: string, m: TurnMember) {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
  let best = 0;
  for (const n of namesFor(m)) {
    const name = esc(n);
    if (new RegExp(`@${esc(m.username)}\\b`).test(t)) return 2;
    if (!new RegExp(`(^|[^\\p{L}\\p{N}])${name}($|[^\\p{L}\\p{N}])`, "u").test(t)) continue;
    const vocative =
      new RegExp(`^ ${name}\\b`, "u").test(t) || // "dad, ..." / "dad how are you"
      new RegExp(`\\b${name}[\\s!?.,:;)x]*$`, "u").test(t) || // "how r u dad?"
      new RegExp(`\\b(${GREETINGS.map(esc).join("|")})[\\s,!]+${name}\\b`, "u").test(t); // "hi dad"
    best = Math.max(best, vocative ? 2 : 1);
  }
  return best;
}

/**
 * Picks who answers `senderId`'s latest message(s). `recent` is oldest first and ends with what the
 * sender just wrote; `rand` is Math.random in the app and fixed in tests.
 */
export function pickTurns(args: { members: TurnMember[]; recent: TurnMessage[]; senderId: number; now: number; rand?: () => number }): Turns {
  const { members, recent, senderId, now } = args;
  const rand = args.rand ?? Math.random;
  const bots = members.filter((m) => m.bot && m.id !== senderId);
  if (!bots.length) return { order: [], why: "open", quick: [] };
  const byId = new Map(members.map((m) => [m.id, m]));

  // What the sender just said: their last run of messages, since someone else last spoke.
  let i = recent.length;
  while (i > 0 && recent[i - 1].userId === senderId) i--;
  const said = recent.slice(i).map((m) => m.text).filter(Boolean);
  const before = recent.slice(0, i);

  const quick: number[] = [];
  const chime = (first: number[], p: number, quickP = CHIME_QUICK) => {
    const others = bots.filter((b) => !first.includes(b.id));
    if (!others.length || rand() >= p) return first;
    const extra = others[Math.floor(rand() * others.length)].id;
    if (rand() < quickP) quick.push(extra);
    return [...first, extra];
  };
  const done = (order: number[], why: Turns["why"]): Turns => ({ order, why, quick: quick.filter((id) => order.includes(id)) });
  // In a group, a bare "ok" or "lol" often just sits there, as it would with real friends.
  const ack = said.length > 0 && said.every((t) => ACK.test(t.trim()));
  const quiet = (p: number) => bots.length > 1 && rand() < p;

  // 1. Named. The most direct wins; the newest message counts most when two are equally direct.
  const scored = members
    .filter((m) => m.id !== senderId)
    .map((m) => ({ m, score: Math.max(0, ...said.map((s, k) => addressScore(s, m) * 10 + k)) }))
    .filter((x) => x.score >= 10)
    .sort((a, b) => b.score - a.score);
  if (scored.length) {
    const top = Math.floor(scored[0].score / 10);
    const named = scored.filter((x) => Math.floor(x.score / 10) === top).map((x) => x.m);
    const namedBots = named.filter((m) => m.bot).slice(0, 2).map((m) => m.id);
    // Speaking to a real person in the chat: the sample people mostly leave them to it.
    if (!namedBots.length) return done(chime([], CHIME_WHEN_OPEN - 0.1, 0.7), "someone-else");
    return done(namedBots.length > 1 ? namedBots : chime(namedBots, CHIME_AFTER_ADDRESSED), "named");
  }

  // 2. Answering whoever spoke last, if that was recent.
  const prev = before[before.length - 1];
  const lastWord = recent[recent.length - 1]?.at ?? now;
  if (prev && lastWord - prev.at <= REPLY_WINDOW_MS && byId.has(prev.userId)) {
    const to = byId.get(prev.userId)!;
    if (!to.bot) return done(chime([], CHIME_WHEN_OPEN - 0.1, 0.7), "someone-else");
    if (ack && quiet(QUIET_AFTER_ACK)) return done([], "reply");
    // A question either way (theirs to the sender, or the sender's back about what they said) stays
    // between the two. After a passing remark, in a bigger group anyone may pick the next message up,
    // so one person doesn't hog the chat.
    const me = byId.get(senderId);
    const asked = [prev.text, ...said].some((t) => /\?\s*$/.test(t)) || (me ? addressScore(prev.text, me) > 0 : false);
    if (asked || bots.length < 3 || rand() >= OPEN_AFTER_REMARK) return done(chime([to.id], CHIME_AFTER_ADDRESSED), "reply");
  }

  // 3. Open to the room: someone picks it up, usually not whoever spoke last.
  if (quiet(ack ? QUIET_AFTER_ACK : QUIET_WHEN_OPEN)) return done([], "open");
  const lastBot = [...before].reverse().find((m) => bots.some((b) => b.id === m.userId))?.userId;
  const fresh = bots.length > 1 && rand() < 0.75 ? bots.filter((b) => b.id !== lastBot) : bots;
  const first = fresh[Math.floor(rand() * fresh.length)].id;
  return done(chime([first], CHIME_WHEN_OPEN), "open");
}
