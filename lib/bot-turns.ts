/**
 * Demo only: who answers when a real person writes in a sample chat. Pure, so it can be tested.
 *
 * The rule is the one people follow in a real group chat:
 *  1. If the message names one of the sample people ("how r u dad", "@priya", "mum, ..."), they answer.
 *  2. Otherwise, if the sender is answering someone (the last other person to speak before it), that
 *     person answers back.
 *  3. If nobody is addressed, one sample person picks it up.
 * Anyone else only chips in now and then, after the first reply.
 */

/** How many recent chat messages a sample person reads before answering. */
export const BOT_CONTEXT = 14;

export type TurnMember = { id: number; username: string; display_name: string; bot: boolean };
export type TurnMessage = { userId: number; text: string; at: number };
export type Turns = {
  /** Who answers, in order. The first is the person addressed; any after it chip in. */
  order: number[];
  why: "named" | "reply" | "open" | "someone-else";
};

// What people call their parents in a family chat, so "hi mum" finds the sample person called Mum.
const ALIASES: Record<string, string[]> = {
  mum: ["mum", "mom", "mam", "mummy", "mommy", "mama", "mother"],
  dad: ["dad", "daddy", "papa", "baba", "father", "pops"],
};
const GREETINGS = ["hi", "hey", "hello", "hiya", "yo", "oi", "morning", "evening", "night", "thanks", "thank you", "cheers", "love you", "miss you"];
// A conversation goes cold: past this, the last speaker isn't the person being answered.
const REPLY_WINDOW_MS = 2 * 3600e3;
const CHIME_AFTER_ADDRESSED = 0.15;
const CHIME_WHEN_OPEN = 0.2;

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
  if (!bots.length) return { order: [], why: "open" };
  const byId = new Map(members.map((m) => [m.id, m]));

  // What the sender just said: their last run of messages, since someone else last spoke.
  let i = recent.length;
  while (i > 0 && recent[i - 1].userId === senderId) i--;
  const said = recent.slice(i).map((m) => m.text).filter(Boolean);
  const before = recent.slice(0, i);

  const chime = (first: number[], p: number) => {
    const others = bots.filter((b) => !first.includes(b.id));
    if (!others.length || rand() >= p) return first;
    return [...first, others[Math.floor(rand() * others.length)].id];
  };

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
    if (!namedBots.length) return { order: chime([], CHIME_WHEN_OPEN), why: "someone-else" };
    return { order: namedBots.length > 1 ? namedBots : chime(namedBots, CHIME_AFTER_ADDRESSED), why: "named" };
  }

  // 2. Answering whoever spoke last, if that was recent.
  const prev = before[before.length - 1];
  const lastWord = recent[recent.length - 1]?.at ?? now;
  if (prev && lastWord - prev.at <= REPLY_WINDOW_MS && byId.has(prev.userId)) {
    const to = byId.get(prev.userId)!;
    if (to.bot) return { order: chime([to.id], CHIME_AFTER_ADDRESSED), why: "reply" };
    return { order: chime([], CHIME_WHEN_OPEN), why: "someone-else" };
  }

  // 3. Open to the room: one person picks it up.
  const first = bots[Math.floor(rand() * bots.length)].id;
  return { order: chime([first], CHIME_WHEN_OPEN), why: "open" };
}
