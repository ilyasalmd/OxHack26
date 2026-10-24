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
  // Stocks: your first trade on each one is free; every trade after that pays this to whoever
  // listed it, held until maturity. The lister trades their own stock free.
  stockFee: 0.5,
  freeTrades: 1,
};

export const MARKET = {
  // LMSR liquidity: higher b = prices move less per coin traded.
  betLiquidity: 80,
  stockLiquidity: 150,
  minProb: 0.03,
  maxProb: 0.97,
  // Situations resolving further out than this default to long-term "stocks".
  stockThresholdDays: 21,
  // How much weight the history base rate gets against the AI when we have data.
  historyWeight: 0.3,
  // A group can ask the AI to re-mark its stocks at most this often (app clock), so
  // nobody can pump prices by calling it over and over with made-up mood scores.
  repriceCooldownMs: 6 * 3600 * 1000,
};

// Getters so env changes (tests, the seed script) are picked up after import.
// Which AI prices situations: a local model through Ollama, Google's Gemini API, or none
// (the stats model). AI_PROVIDER picks one; otherwise OLLAMA_MODEL wins over GEMINI_API_KEY.
export const AI = {
  get provider(): "ollama" | "gemini" | "none" {
    const p = process.env.AI_PROVIDER;
    if (p === "ollama" || p === "gemini" || p === "none") return p;
    return process.env.OLLAMA_MODEL ? "ollama" : process.env.GEMINI_API_KEY ? "gemini" : "none";
  },
  get model() {
    return this.provider === "ollama" ? process.env.OLLAMA_MODEL ?? "gemma4:12b" : process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  },
  get embeddingModel() {
    return this.provider === "ollama"
      ? process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma-2:270m"
      : process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  },
  get ollamaUrl() {
    return (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  },
  get enabled() {
    return this.provider !== "none";
  },
  /** What the app calls the AI in the interface. */
  get label() {
    return this.provider === "gemini" ? "Gemini" : this.provider === "ollama" ? "Local AI" : "Stats model";
  },
};

export const DEMO_MODE = process.env.DEMO_MODE !== "false";
