/**
 * Demo only: what a sample person says when no AI is available to write it (the hosted copy has
 * no Ollama). It reads what the message is (a greeting, "how r u", a question, a plan, a joke,
 * good or bad news) and answers in that person's voice: a parent, a sibling, a partner or a friend.
 * Pure, so it can be tested.
 */

export type Voice = "parent" | "sibling" | "partner" | "friend";
export type Intent =
  | "greeting"
  | "gibberish"
  | "how-are-you"
  | "progress"
  | "thanks"
  | "love"
  | "bye"
  | "laugh"
  | "plan"
  | "anyone-done"
  | "who"
  | "when"
  | "where"
  | "question"
  | "yes-no"
  | "good-news"
  | "bad-news"
  | "statement";

const VOICES: Record<string, Voice> = { mum: "parent", dad: "parent", yasmin: "sibling", zayn: "sibling", nadia: "partner" };
export const voiceOf = (username: string): Voice => VOICES[username] ?? "friend";

/** Who each sample person is, for the model: how they text and what they care about. */
export const PERSONAS: Record<string, string> = {
  jake: "always running late, loud, cocky, bets big and loses, calls everyone 'lads', supports Arsenal",
  priya: "organised and sharp, the best forecaster in the group, dry and a bit sarcastic, keeps receipts, hunting spring weeks",
  sam: "gym at 6am (sometimes), easy-going, short replies, up for most plans",
  maya: "run club regular, warm and chatty, a bit of a planner, too many group chats",
  omar: "Finance Soc events, smooth talker, always says he'll pay you back Friday",
  chloe: "economics student, JPM applications, early-morning runner, polite and encouraging",
  aisha: "the one who actually reads the lecture notes, helpful, a bit nerdy, dry humour",
  leo: "stats and Finance Soc socials, always has a number for everything, laid back",
  dan: "Sunday League, shoots from anywhere, banter-heavy, competitive",
  tom: "treasurer of everything, keeper on Sundays, reliable and a bit dad-joke-y",
  zara: "Finance Soc president, merch queen, confident, organises everyone, quick and witty",
  mum: "Ilyas's mum: caring, worries whether he's eating, organises Sunday lunch, calls people 'love' or 'darling', writes in full sentences",
  dad: "Ilyas's dad: building a shed, always loses his glasses, short replies, gentle teasing, offers lifts from the station",
  yasmin: "Ilyas's younger sister: Year 13, learning to drive, plays FIFA, winds her brothers up, short teenage replies",
  zayn: "Ilyas's older brother: junior engineer in Manchester, Man United fan (Ilyas is Arsenal), training for a sub-25 5k, replies eventually",
  nadia: "Ilyas's girlfriend: third-year medic at UCL, lives in Camden, affectionate and funny, planning a Paris weekend",
};

const VOWELS = /[aeiouy]/g;
/** Keyboard mash ("heiwfhrifhegr", "asdfgh"): a long run of letters no word looks like. */
export function isGibberish(text: string) {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!words.length) return false;
  return words.some((w) => {
    if (/(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|wert|erty|zxcv|xcvb)/.test(w) && w.length >= 5) return true;
    if (w.length >= 21) return true;
    if (w.length >= 6 && !/[aeiouy]/.test(w) && !/^(h+m+|s+h+|m+|p+s+t+|z+)$/.test(w)) return true;
    if (w.length < 9) return false;
    const vowels = (w.match(VOWELS) ?? []).length / w.length;
    return /[^aeiouy]{5,}/.test(w) || (/[^aeiouy]{4,}/.test(w) && w.length >= 16) || vowels < 0.2;
  });
}

export const HOW_ARE_YOU = /\bhow (r|are) (u|you|ya|things)\b|\bhow'?s it going\b|\bhow (have|r|are) (you|u) been\b|\b(you|u) (ok|okay|alright|good)\b|\bhow'?s (your|ur) day\b|\bwyd\b/i;

/** What kind of message `text` is, from the words in it. */
export function intentOf(text: string): Intent {
  const t = text.toLowerCase().trim();
  // A name in front ("dad hows the shed") doesn't change what's being asked.
  const lead = "^([a-z]+[ ,]+)?";
  if (isGibberish(t)) return "gibberish";
  if (HOW_ARE_YOU.test(t)) return "how-are-you";
  if (new RegExp(`${lead}how'?s\\b|${lead}how (is|was|did|are|were) (the|your|ur|it|that|things|uni|work|school|everything)\\b`).test(t)) return "progress";
  if (/\b(love (you|u|ya)|miss (you|u|ya)|luv u)\b/.test(t)) return "love";
  if (/\b(thanks|thank you|thank u|ty|cheers|thx)\b/.test(t)) return "thanks";
  if (/\b(good ?night|night night|gn|bye|see (you|ya|u)|ttyl|going to bed|off to bed)\b/.test(t)) return "bye";
  if (/^(hi+|hey+|hello+|hiya|yo+|oi|morning|good morning|evening|sup|wagwan|what'?s up|wassup)\b/.test(t)) return "greeting";
  if (new RegExp(`${lead}(has|have|did) (anyone|any of you|u guys|you guys|everyone|ya)\\b`).test(t)) return "anyone-done";
  if (/\b(what time|when)\b.*\?|^when\b|\bwhat time\b/.test(t)) return "when";
  if (new RegExp(`${lead}who('?s| is| was| did| has)? (cooking|paying|driving|bringing|got|has|took|ate|won|left|next|doing)\\b`).test(t)) return "who";
  if (/\bwhere\b/.test(t) && t.includes("?")) return "where";
  if (/\b(anyone|who'?s|fancy|up for|down for|coming|free (tonight|tomorrow|later|this)|plans?|shall we|let'?s|wanna|want to|we need|need (a|someone|one more))\b/.test(t)) return "plan";
  if (/^(a?(ha)+h?|he(he)+|lo+l+|lm+a+o+|ha ha|dead|crying|i'?m dead)\b|\b(lol|lmao|a?(ha){2,}h?)\b/.test(t)) return "laugh";
  if (new RegExp(`${lead}(what|why|how|who|which)\\b`).test(t)) return "question";
  if (new RegExp(`${lead}(are|is|do|did|does|can|could|will|would|should|have|has|r u|u|am i|was|were)\\b`).test(t) || t.endsWith("?")) return "yes-no";
  if (/\b(ugh|tired|knackered|sick|ill|failed|stressed|stress|late|missed|broke|skint|rough|worst|annoyed|hate|sad|gutted)\b/.test(t)) return "bad-news";
  if (/\b(got (in|it|the|an|a)|passed|won|finished|done|offer|booked|smashed|nailed|aced)\b|!$/.test(t)) return "good-news";
  return "statement";
}

const LINES: Record<Voice, Record<Intent, string[]>> = {
  parent: {
    greeting: ["hello love, you alright?", "hello darling, how's your day going?", "hi love, everything ok?"],
    gibberish: ["did you sit on your phone?", "i think your phone's typing by itself love", "what does that mean?"],
    "how-are-you": ["all good here love, busy day. how are you?", "not bad thanks, tired but fine. you eating properly?", "we're fine, house is quiet without you"],
    progress: ["coming along, slowly", "getting there love, nearly done", "don't ask, it's been a day"],
    thanks: ["you're welcome love", "any time darling", "that's what we're here for"],
    love: ["love you too darling", "miss you too, come home soon", "love you lots x"],
    bye: ["night love, sleep well", "night darling, text me tomorrow", "ok love, take care"],
    laugh: ["ha! you're as bad as each other", "very funny", "i don't get it but ok"],
    plan: ["let me check with your dad and get back to you", "sounds lovely, just tell me in advance", "yes but not too late please"],
    "anyone-done": ["not me love, ask your sister", "i did it this morning", "not yet, i'll do it later"],
    who: ["your dad, apparently", "not me, i did it last time", "whoever gets home first"],
    when: ["about 6 i think, i'll confirm later", "not sure yet love, i'll let you know", "after work, so around 7"],
    where: ["at home love, where else", "check the kitchen drawer", "i'll send you the address"],
    question: ["good question, ask me later when i'm not driving", "i'll have to think about that one", "no idea love, sorry"],
    "yes-no": ["yes love", "i think so, let me check", "not this time darling"],
    "good-news": ["oh well done! so proud of you", "that's brilliant love", "knew you could do it"],
    "bad-news": ["oh no love, call me later?", "don't worry about it, it'll be fine", "make sure you're eating and sleeping properly"],
    statement: ["oh really? tell me more later", "ok love, keep me posted", "that's nice darling", "how come?"],
  },
  sibling: {
    greeting: ["hey", "oh hi", "hiii what do you want"],
    gibberish: ["??", "are you having a stroke", "ok weirdo"],
    "how-are-you": ["fine, you?", "alive. you?", "tired but ok, you"],
    progress: ["it's going", "don't ask", "fine i guess"],
    thanks: ["you owe me", "np", "yeah yeah"],
    love: ["ew", "ok weirdo, love you too", "who are you and what have you done with my sibling"],
    bye: ["night", "bye", "later"],
    laugh: ["lmao", "stop", "i'm crying"],
    plan: ["only if you're paying", "maybe, depends what time", "i'm in"],
    "anyone-done": ["obviously not", "nope", "why would i have"],
    who: ["not me", "zayn", "you, obviously"],
    when: ["no clue, ask mum", "like 7?", "whenever, i'm free"],
    where: ["no idea", "ask mum", "it's where you left it"],
    question: ["why are you asking me", "no idea tbh", "google it"],
    "yes-no": ["obviously", "nope", "maybe"],
    "good-news": ["wait actually? nice", "ok that's actually good", "show off"],
    "bad-news": ["unlucky", "rip", "that's rough, you ok?"],
    statement: ["and?", "cool story", "wait why", "ok and what about it"],
  },
  partner: {
    greeting: ["hey you", "hii, how's your day", "hey, was just thinking about you"],
    gibberish: ["?? are you ok", "did you fall asleep on your keyboard", "babe what"],
    "how-are-you": ["good now, long day though. you?", "tired but ok, how are you", "better now you've texted"],
    progress: ["getting there, long day though", "better than yesterday", "slowly, tell you on thursday"],
    thanks: ["any time", "of course", "you'd do the same"],
    love: ["love you more", "miss you too, thursday can't come soon enough", "love you x"],
    bye: ["night, sleep well", "night x", "speak tomorrow"],
    laugh: ["you're an idiot", "haha stop", "why are you like this"],
    plan: ["yes please", "i'm free after 7", "ok but i'm choosing the film"],
    "anyone-done": ["not yet, have you?", "started, then gave up", "nope, tomorrow"],
    who: ["you, obviously", "not me", "rock paper scissors?"],
    when: ["after my shift, so 7ish?", "thursday?", "whenever you're free"],
    where: ["camden?", "somewhere near mine?", "your pick"],
    question: ["hmm let me think", "honestly not sure", "what do you think"],
    "yes-no": ["yes", "probably not", "maybe, ask me later"],
    "good-news": ["that's amazing, so proud of you", "yesss well done", "told you you'd do it"],
    "bad-news": ["oh no, want to call?", "sorry, that's rubbish", "come here, it'll be ok"],
    statement: ["aw", "really? how come", "ok noted", "tell me more"],
  },
  friend: {
    greeting: ["hey!", "heyy what's up", "hello hello", "yo, what's going on"],
    gibberish: ["??", "lol what", "you good?", "pocket text?", "bro what"],
    "how-are-you": ["not bad, you?", "surviving, you?", "good thanks, you", "tired but alright"],
    progress: ["going alright", "could be worse", "slowly lol", "don't even ask"],
    thanks: ["no worries", "any time", "nw"],
    love: ["love you too mate", "bit soft but ok", "miss you too"],
    bye: ["night", "later", "see ya"],
    laugh: ["lmao", "haha", "i'm dead", "stop"],
    plan: ["i'm in", "might be late but yeah", "can't tonight sorry", "depends what time"],
    "anyone-done": ["not yet, you?", "nope, that's tomorrow's problem", "halfway through, it's grim", "started it, regret it"],
    who: ["not me lol", "don't look at me", "whoever lost the last bet", "not it"],
    when: ["7ish?", "not sure yet", "after 6 works for me"],
    where: ["usual place?", "no idea", "yours?"],
    question: ["no clue tbh", "good question", "someone google it"],
    "yes-no": ["yeah", "nah", "think so", "doubt it tbh"],
    "good-news": ["let's goooo", "big news, congrats", "nice one!", "well deserved"],
    "bad-news": ["unlucky", "rough", "that's grim, you alright?"],
    statement: ["wait really?", "how come?", "go on", "ha love that", "no way", "as you do"],
  },
};

// Quick reactions only fit some messages; a greeting or a question gets a real answer instead.
const QUICK: Partial<Record<Intent, Record<Voice, string[]>>> = {
  laugh: { parent: ["ha!"], sibling: ["lmao", "lol"], partner: ["haha"], friend: ["lol", "lmao", "haha"] },
  "good-news": { parent: ["well done!", "brilliant"], sibling: ["nice"], partner: ["yesss"], friend: ["big", "let's go", "congrats!"] },
  "bad-news": { parent: ["oh no"], sibling: ["oof"], partner: ["aw no"], friend: ["oof", "unlucky"] },
  plan: { parent: ["lovely"], sibling: ["same"], partner: ["yes pls"], friend: ["i'm in", "same", "100%"] },
  statement: { parent: ["exactly"], sibling: ["real", "facts"], partner: ["true"], friend: ["100%", "facts", "true", "fr"] },
  "yes-no": { parent: ["good question"], sibling: ["obviously"], partner: ["hmm"], friend: ["surely", "has to be"] },
};
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9% ]/g, "").trim();
const pickFrom = (xs: string[], rand: () => number, avoid: string[]) => {
  const seen = new Set(avoid.map(norm));
  const fresh = xs.filter((x) => !seen.has(norm(x)));
  const from = fresh.length ? fresh : xs;
  return from[Math.floor(rand() * from.length)];
};

/** A reply to `text` in `username`'s voice. `avoid` is what was said recently, so no line repeats. */
export function cannedReply(username: string, text: string, opts: { rand?: () => number; avoid?: string[] } = {}) {
  return pickFrom(LINES[voiceOf(username)][intentOf(text)], opts.rand ?? Math.random, opts.avoid ?? []);
}

/** A quick reaction to `text` ("100%", "lol") in `username`'s voice, or a proper reply when a reaction wouldn't fit. */
export function quickReaction(username: string, text: string, opts: { rand?: () => number; avoid?: string[] } = {}) {
  const lines = QUICK[intentOf(text)]?.[voiceOf(username)];
  return lines ? pickFrom(lines, opts.rand ?? Math.random, opts.avoid ?? []) : cannedReply(username, text, opts);
}
