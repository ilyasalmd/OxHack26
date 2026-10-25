// Every game-economy knob lives here so the rules can be tuned (or the coin renamed) in one place.
export const CURRENCY = {
  name: process.env.NEXT_PUBLIC_CURRENCY_NAME ?? "Clout",
  ticker: process.env.NEXT_PUBLIC_CURRENCY_TICKER ?? "CLT",
  decimals: 2,
};

export const ECONOMY = {
  startingBalance: 500,
  weeklyAllowance: 50,
  allowancePeriodMs: 7 * 24 * 3600 * 1000,
  // A single trade can use at most this share of your current balance...
  maxStakeFraction: 0.25,
  // ...and nobody can trade below this floor, so nobody is ever wiped out.
  balanceFloor: 50,
  minTrade: 1,
  // Optional flat fee on stocks, off now that the AI bookmaker's margin (MARKET.vig) is the fee.
  // If set: your first trade on each is free, then every trade pays this to whoever listed it, held
  // until maturity. The lister trades their own stock free.
  stockFee: 0,
  freeTrades: 1,
  // Invite friends: paid once, when this many friends who signed up with your link have joined a chat or made a stake.
  referralReward: 200,
  referralFriends: 3,
  // Sign-ups on one link beyond this many in a day are recorded but never count.
  referralDailyCap: 5,
};

export const MARKET = {
  // LMSR liquidity: higher b = prices move less per coin traded.
  betLiquidity: 120,
  stockLiquidity: 250,
  minProb: 0.03,
  maxProb: 0.97,
  // Situations resolving further out than this default to long-term "stocks".
  stockThresholdDays: 21,
  // The AI bookmaker's margin on each side: buys keep this share of the stake, cash-outs pay this much less.
  vig: 0.03,
  // Per market, the bookmaker stops taking a side once its worst-case loss would pass this many
  // times the book's liquidity b (b·ln 2 ≈ 0.69 b is the most a plain book can lose).
  houseRisk: 1,
  // How much weight the history base rate gets against the AI when we have data.
  historyWeight: 0.3,
  // Cold start: with no history, profile answers or chat to go on, the AI is working from general
  // knowledge, so its answer only gets this share of its distance from 50/50. Trust grows to full
  // at fullEvidence pieces of evidence, and a low-data book is this much thinner so trades move it faster.
  coldTrust: 0.5,
  fullEvidence: 3,
  lowDataLiquidity: 0.6,
  // A group can ask the AI to re-mark its stocks at most this often (app clock), so
  // nobody can pump prices by calling it over and over with made-up mood scores.
  repriceCooldownMs: 6 * 3600 * 1000,
};

// Getters so env changes (tests, the seed script) are picked up after import.
// Which AI prices situations: Gemma, running locally through Ollama, or none (the stats model).
// AI_PROVIDER=none forces the stats model; otherwise setting OLLAMA_MODEL turns Gemma on.
export const AI = {
  get provider(): "ollama" | "none" {
    const p = process.env.AI_PROVIDER;
    if (p === "ollama" || p === "none") return p;
    return process.env.OLLAMA_MODEL ? "ollama" : "none";
  },
  get model() {
    return process.env.OLLAMA_MODEL ?? "gemma4:12b";
  },
  get embeddingModel() {
    return process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma-2:270m";
  },
  get ollamaUrl() {
    return (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  },
  get enabled() {
    return this.provider !== "none";
  },
  /** What the app calls the AI in the interface. */
  get label() {
    return this.provider === "ollama" ? "Gemma" : "Stats model";
  },
};

export const DEMO_MODE = process.env.DEMO_MODE !== "false";

// The app's admin accounts: usernames listed in ADMIN_USERNAMES (comma or space separated), and
// stakesadmin alone when it isn't set. Only they see the Solana chain pages, the pricing records
// and the demo clock. Read at call time so a .env change is picked up on restart.
export const isAdminUsername = (username: string) =>
  (process.env.ADMIN_USERNAMES || "stakesadmin").toLowerCase().split(/[,\s]+/).filter(Boolean).includes(username.toLowerCase());

// Demo: every account gets the synthetic sample chats (three months of bets, trades and chat).
// New sign-ups join them automatically and `npm run demo:join` adds existing accounts. Set
// DEMO_DATA_FOR_ALL=false for real use, so an account only sees the chats it's actually in.
export const DEMO_DATA_FOR_ALL = process.env.DEMO_DATA_FOR_ALL !== "false";
// Demo only: when someone posts a stake in a sample chat, the sample people in it chat and trade
// by themselves, through the normal rules and ledger. DEMO_BOTS=false turns it off.
export const DEMO_BOTS = DEMO_MODE && process.env.DEMO_BOTS !== "false";
