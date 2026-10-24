# Friend Stocks 📈

**Your group chat, now with a stock market.** Friends post situations about each other ("Jake is late to Friday dinner", "Priya graduates with a First"), the AI prices them from the group's own history, and everyone goes long or short with play money. Built for OxHack 2026 (theme: **TIME**).

- **Short-term bets** close at a deadline and settle YES/NO.
- **Long-term stocks** trade like a maturing bond: they pay out if the outcome happens by maturity, and "by date X" stocks lose value as time runs out with no news (constant-hazard decay).
- **Invest in yourself:** you can go long on stocks about you, never short them, and you can't bet on short-term situations about yourself.
- **Nobody gets wiped out:** a single trade is capped at 25% of your balance and you can't go below a 50-coin floor. Everyone starts with **500** and gets **+50 every week**.
- **The group remembers:** every settled situation is summarised and stored. New questions pull up similar past outcomes (per person, per category) to set the opening odds and show friends the record.
- **Private by design:** chats are end-to-end encrypted in the browser. The server and the AI never see message text.

## Run it

```bash
npm install
npm run seed      # demo data: 5 friends, 2 group chats, 8 weeks of history
npm run dev       # http://localhost:3000
```

Log in as `ilyas`, `jake`, `priya`, `sam` or `maya` with password `demo1234`. Use two browsers to chat between friends. The **+1h / +1d / +1w** buttons at the bottom move the app clock so you can show allowances, deadlines and stock decay live.

No keys are needed to run it: without `DATABASE_URL` it uses embedded Postgres (PGlite in `.data/`), and without `GEMINI_API_KEY` it prices from history with a statistical model. Copy `.env.example` to `.env.local` to switch things on. Stop `npm run dev` before re-seeding when using PGlite.

`npm test` runs the market-maths tests. `npm run build && npm start` for production (set `APP_SECRET`).

## How it works

| Piece | What it does |
| --- | --- |
| `lib/lmsr.ts` | Hanson's LMSR market maker. Long = buy YES shares, short = buy NO shares, each pays 1 coin. Max house loss per market is `b·ln 2`. Also the hazard-decay formula `P(by T) = 1 − (1 − p)^((T − t₂)/(T − t₁))`. |
| `lib/markets.ts` | Preview → list → trade → resolve, AI re-marks, time decay. Trades run in a DB transaction with row locks. |
| `lib/ai.ts` | Gemini with JSON-schema output: routes a situation to bet or stock, decides decay, writes the resolution rule, estimates the probability from the group's evidence, summarises outcomes, re-marks stocks. Falls back to a heuristic model. |
| `lib/memory.ts` | Similar-situation search (Gemini embeddings + keyword overlap, boosted for the same person and category) and a similarity-weighted Beta(1,1) base rate. |
| `lib/stats.ts` | Leaderboard (net worth, P&L in this group, Brier skill score) and AI vs crowd vs coin-flip calibration. |
| `lib/solana.ts` | Outbox worker mirroring every balance change to an SPL token on devnet: stakes **burn**, payouts and allowances **mint**, market opens/resolutions are **memos**. |
| `lib/e2ee.ts` | WebCrypto E2EE (below). |
| `lib/db.ts`, `lib/schema.sql` | Postgres. On Timescale/Tiger Cloud it creates hypertables, an hourly OHLC continuous aggregate and compression policies. |

One account can be in any number of group chats. **Your balance is one wallet across all your groups** (like a real brokerage account); each group's leaderboard ranks net worth and also shows your profit or loss from that group's situations only.

### Privacy

- Your password never leaves the device. The browser derives two keys with PBKDF2: an auth key (sent and bcrypt-hashed on the server) and an encryption key (never sent) that locks your ECDH P-256 identity key.
- Each group has a random AES-256-GCM key, wrapped separately for every member with ECDH + HKDF. People who join by invite link get the key from the next member whose app is open.
- The server stores ciphertext, sender and timestamp only. Market events (listings, trades, results) are plaintext because the server has to run the market.
- Gemini receives the situation text, settled-history stats, the group's opt-in "AI context" (term dates, fixtures) and, only if a user ticks the box, a single mood number per person computed on the device from the decrypted chat. Never message text.
- No analytics, trackers or third-party scripts; strict referrer and permissions headers.
- **Prototype limits:** no forward secrecy or key rotation yet (Signal's Double Ratchet / Matrix's Megolm would add that), no safety-number verification, and new members can read history from before they joined. Solana wallets are custodial devnet keys encrypted with `APP_SECRET`.

## Sponsor tech

| Sponsor | Used for |
| --- | --- |
| **Google Gemini** | Odds, bet-vs-stock routing, resolution rules, outcome summaries, embeddings for "similar past situations", stock re-marks. Set `GEMINI_API_KEY`. |
| **Solana** | In-game coin as an SPL token on devnet with mint/burn for every stake and payout, memos for market lifecycle. `npm run solana:setup` creates the mint. |
| **Tiger Data (Timescale)** | Price and net-worth time series as hypertables, hourly candles as a continuous aggregate, compression. Point `DATABASE_URL` at a Tiger Cloud service or `docker compose up -d`. |
| **ElevenLabs** | "🔊 Recap" on any market reads a trading-floor style update or the final result. Set `ELEVENLABS_API_KEY`. |
| **Vultr** | `Dockerfile` for a one-command deploy on a Vultr VM. |

## Structure

```
app/            Next.js 16 pages (chats, group chat, market, portfolio) and API routes
components/     UI, chart, session + key handling
lib/            market engine, AI, memory, Solana, E2EE, DB
scripts/        seed.ts, solana-setup.ts
tests/          LMSR and stake-cap tests
```
