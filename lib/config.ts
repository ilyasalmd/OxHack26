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
  // Per market, the bookmaker stops taking a side once its worst-case loss would pass the most a
  // plain book opened at that side's price is built to lose, b·ln(1/p), and never less than this
  // many times b. An even bet gets b; a 5% long shot gets about 3b, so it can still be backed.
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
// Which AI prices situations. Gemma either runs locally through Ollama, or is called on Google's
// servers through the Gemini API (Google AI Studio key in GEMMA_API_KEY), so a teammate without
// Ollama still gets Gemma. "none" is the stats model.
// AI_PROVIDER=none forces the stats model. Unset, OLLAMA_MODEL picks Ollama, else a key picks Google.
// With Ollama chosen and a key set, Google is the fallback whenever Ollama can't be reached.
export type AiProvider = "ollama" | "google";
export const AI = {
  get provider(): AiProvider | "none" {
    const p = process.env.AI_PROVIDER;
    if (p === "ollama" || p === "google" || p === "none") return p;
    if (process.env.OLLAMA_MODEL) return "ollama";
    return this.googleKey ? "google" : "none";
  },
  /** The providers to try, in order. */
  get chain(): AiProvider[] {
    if (this.provider === "ollama") return this.googleKey ? ["ollama", "google"] : ["ollama"];
    if (this.provider === "google" && this.googleKey) return ["google"];
    return [];
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
  /** Bearer token for an Ollama behind an authenticating proxy (e.g. a shared GPU server). */
  get ollamaKey() {
    return process.env.OLLAMA_API_KEY?.trim() ?? "";
  },
  get googleKey() {
    return process.env.GEMMA_API_KEY?.trim() ?? "";
  },
  get googleModel() {
    return process.env.GEMMA_API_MODEL ?? "gemma-4-26b-a4b-it";
  },
  /** Embeddings on the Gemini API come from Google's own model, not Gemma. "none" turns them off. */
  get googleEmbeddingModel() {
    return process.env.GEMMA_API_EMBEDDING_MODEL ?? "gemini-embedding-001";
  },
  get googleUrl() {
    return (process.env.GEMMA_API_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  },
  /** True when stake text and snippets may go to Google rather than stay on this machine. */
  get usesGoogle() {
    return this.chain.includes("google");
  },
  get enabled() {
    return this.chain.length > 0;
  },
  /** What the app calls the AI in the interface. */
  get label() {
    return this.enabled ? "Gemma" : "Stats model";
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
