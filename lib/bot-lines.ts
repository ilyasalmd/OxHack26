/**
 * Demo only: what a sample person says when no AI is available to write it (the hosted copy has
 * no Ollama). It reads what the message is (a greeting, "how r u", a question, a plan, a joke,
 * good or bad news) and answers in that person's voice: a parent, a sibling, a partner or a friend.
 * Pure, so it can be tested.
 */

export type Voice = "parent" | "sibling" | "partner" | "friend";
export type Intent =
  | "greeting"
  | "how-are-you"
  | "progress"
  | "thanks"
  | "love"
  | "bye"
  | "laugh"
  | "plan"
  | "when"
  | "where"
  | "question"
  | "yes-no"
  | "good-news"
  | "bad-news"
  | "statement";

const VOICES: Record<string, Voice> = { mum: "parent", dad: "parent", yasmin: "sibling", zayn: "sibling", nadia: "partner" };
export const voiceOf = (username: string): Voice => VOICES[username] ?? "friend";

export const HOW_ARE_YOU = /\bhow (r|are) (u|you|ya|things)\b|\bhow'?s it going\b|\bhow (have|r|are) (you|u) been\b|\b(you|u) (ok|okay|alright|good)\b|\bhow'?s (your|ur) day\b|\bwyd\b/i;

/** What kind of message `text` is, from the words in it. */
export function intentOf(text: string): Intent {
  const t = text.toLowerCase().trim();
  // A name in front ("dad hows the shed") doesn't change what's being asked.
  const lead = "^([a-z]+[ ,]+)?";
  if (HOW_ARE_YOU.test(t)) return "how-are-you";
  if (new RegExp(`${lead}how'?s\\b|${lead}how (is|was|did|are|were) (the|your|ur|it|that|things|uni|work|school|everything)\\b`).test(t)) return "progress";
  if (/\b(love (you|u|ya)|miss (you|u|ya)|luv u)\b/.test(t)) return "love";
  if (/\b(thanks|thank you|thank u|ty|cheers|thx)\b/.test(t)) return "thanks";
  if (/\b(good ?night|night night|gn|bye|see (you|ya|u)|ttyl|going to bed|off to bed)\b/.test(t)) return "bye";
  if (/^(hi+|hey+|hello+|hiya|yo+|oi|morning|good morning|evening|sup|wagwan|what'?s up|wassup)\b/.test(t)) return "greeting";
  if (/\b(what time|when)\b.*\?|^when\b|\bwhat time\b/.test(t)) return "when";
  if (/\bwhere\b/.test(t) && t.includes("?")) return "where";
  if (/\b(anyone|who'?s|fancy|up for|down for|coming|free (tonight|tomorrow|later|this)|plans?|shall we|let'?s|wanna|want to)\b/.test(t)) return "plan";
  if (/^(lol+|lmao+|haha+|ha ha|dead|crying|i'?m dead)\b|\b(lol|lmao|haha+)\b/.test(t)) return "laugh";
  if (new RegExp(`${lead}(what|why|how|who|which)\\b`).test(t)) return "question";
  if (new RegExp(`${lead}(are|is|do|did|does|can|could|will|would|should|have|has|r u|u|am i|was|were)\\b`).test(t) || t.endsWith("?")) return "yes-no";
  if (/\b(ugh|tired|knackered|sick|ill|failed|stressed|stress|late|missed|broke|skint|rough|worst|annoyed|hate|sad|gutted)\b/.test(t)) return "bad-news";
  if (/\b(got (in|it|the|an|a)|passed|won|finished|done|offer|booked|smashed|nailed|aced)\b|!$/.test(t)) return "good-news";
  return "statement";
}

const LINES: Record<Voice, Record<Intent, string[]>> = {
  parent: {
    greeting: ["hello love, you alright?", "hello darling, how's your day going?", "hi love, everything ok?"],
    "how-are-you": ["all good here love, busy day. how are you?", "not bad thanks, tired but fine. you eating properly?", "we're fine, house is quiet without you"],
    progress: ["coming along, slowly", "getting there love, nearly done", "don't ask, it's been a day"],
    thanks: ["you're welcome love", "any time darling", "that's what we're here for"],
    love: ["love you too darling", "miss you too, come home soon", "love you lots x"],
    bye: ["night love, sleep well", "night darling, text me tomorrow", "ok love, take care"],
    laugh: ["ha! you're as bad as each other", "very funny", "i don't get it but ok"],
    plan: ["let me check with your dad and get back to you", "sounds lovely, just tell me in advance", "yes but not too late please"],
    when: ["about 6 i think, i'll confirm later", "not sure yet love, i'll let you know", "after work, so around 7"],
    where: ["at home love, where else", "check the kitchen drawer", "i'll send you the address"],
    question: ["good question, ask me later when i'm not driving", "i'll have to think about that one", "no idea love, sorry"],
    "yes-no": ["yes love", "i think so, let me check", "not this time darling"],
    "good-news": ["oh well done! so proud of you", "that's brilliant love", "knew you could do it"],
    "bad-news": ["oh no love, call me later?", "don't worry about it, it'll be fine", "make sure you're eating and sleeping properly"],
    statement: ["ok love", "that's nice darling", "oh really? tell me more later", "alright love, keep me posted"],
  },
  sibling: {
    greeting: ["hey", "oh hi", "what do you want"],
    "how-are-you": ["fine, you?", "alive. you?", "tired but ok, you"],
    progress: ["it's going", "don't ask", "fine i guess"],
    thanks: ["you owe me", "np", "yeah yeah"],
    love: ["ew", "ok weirdo, love you too", "who are you and what have you done with my sibling"],
    bye: ["night", "bye", "later"],
    laugh: ["lmao", "stop", "i'm crying"],
    plan: ["only if you're paying", "maybe, depends what time", "i'm in"],
    when: ["no clue, ask mum", "like 7?", "whenever, i'm free"],
    where: ["no idea", "ask mum", "it's where you left it"],
    question: ["why are you asking me", "no idea tbh", "google it"],
    "yes-no": ["obviously", "nope", "maybe"],
    "good-news": ["wait actually? nice", "ok that's actually good", "show off"],
    "bad-news": ["unlucky", "rip", "that's rough, you ok?"],
    statement: ["ok", "and?", "cool story", "fair"],
  },
  partner: {
    greeting: ["hey you", "hii, how's your day", "hey, was just thinking about you"],
    "how-are-you": ["good now, long day though. you?", "tired but ok, how are you", "better now you've texted"],
    progress: ["getting there, long day though", "better than yesterday", "slowly, tell you on thursday"],
    thanks: ["any time", "of course", "you'd do the same"],
    love: ["love you more", "miss you too, thursday can't come soon enough", "love you x"],
    bye: ["night, sleep well", "night x", "speak tomorrow"],
    laugh: ["you're an idiot", "haha stop", "why are you like this"],
    plan: ["yes please", "i'm free after 7", "ok but i'm choosing the film"],
    when: ["after my shift, so 7ish?", "thursday?", "whenever you're free"],
    where: ["camden?", "somewhere near mine?", "your pick"],
    question: ["hmm let me think", "honestly not sure", "what do you think"],
    "yes-no": ["yes", "probably not", "maybe, ask me later"],
    "good-news": ["that's amazing, so proud of you", "yesss well done", "told you you'd do it"],
    "bad-news": ["oh no, want to call?", "sorry, that's rubbish", "come here, it'll be ok"],
    statement: ["fair", "aw", "really?", "ok noted"],
  },
  friend: {
    greeting: ["yo", "hey hey", "alright", "evening"],
    "how-are-you": ["not bad, you?", "surviving, you?", "good thanks, you", "tired but alright"],
    progress: ["going alright", "could be worse", "slowly lol", "don't even ask"],
    thanks: ["no worries", "any time", "nw"],
    love: ["love you too mate", "bit soft but ok", "miss you too"],
    bye: ["night", "later", "see ya"],
    laugh: ["lmao", "haha", "i'm dead", "stop"],
    plan: ["i'm in", "might be late but yeah", "can't tonight sorry", "depends what time"],
    when: ["7ish?", "not sure yet", "after 6 works for me"],
    where: ["usual place?", "no idea", "yours?"],
    question: ["no clue tbh", "good question", "someone google it"],
    "yes-no": ["yeah", "nah", "think so", "doubt it tbh"],
    "good-news": ["let's goooo", "big", "nice one", "well deserved"],
    "bad-news": ["unlucky", "rough", "that's grim, you alright?"],
    statement: ["fair", "classic", "true", "wait really?", "say less"],
  },
};

const QUICK: Record<Voice, string[]> = {
  parent: ["agreed", "ha!", "lovely", "exactly"],
  sibling: ["lol", "facts", "real", "same"],
  partner: ["haha", "aw", "same", "true"],
  friend: ["100%", "lol", "facts", "true", "fr", "haha", "same"],
};

const pickFrom = (xs: string[], rand: () => number, avoid: string[]) => {
  const fresh = xs.filter((x) => !avoid.includes(x));
  const from = fresh.length ? fresh : xs;
  return from[Math.floor(rand() * from.length)];
};

/** A reply to `text` in `username`'s voice. `avoid` is what they said recently, so they don't repeat it. */
export function cannedReply(username: string, text: string, opts: { rand?: () => number; avoid?: string[] } = {}) {
  return pickFrom(LINES[voiceOf(username)][intentOf(text)], opts.rand ?? Math.random, opts.avoid ?? []);
}

/** A quick reaction ("100%", "lol") in `username`'s voice. */
export function quickReaction(username: string, opts: { rand?: () => number; avoid?: string[] } = {}) {
  return pickFrom(QUICK[voiceOf(username)], opts.rand ?? Math.random, opts.avoid ?? []);
}
