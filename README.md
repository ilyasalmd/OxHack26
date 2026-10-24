# Friend Stocks 📈

**Your group chat, now with a stock market.** Friends post situations about each other ("Jake is late to Friday dinner", "Priya graduates with a First"), the AI prices them from the group's own history, and everyone goes long or short with play money. Built for OxHack 2026 (theme: **TIME**).

- **Short-term bets** close at a deadline and settle YES/NO.
- **Long-term stocks** trade like a maturing bond: they pay out if the outcome happens by maturity, and "by date X" stocks lose value as time runs out with no news (constant-hazard decay).
- **Invest in yourself:** you can go long on stocks about you, never short them, and you can't bet on short-term situations about yourself.
- **Nobody gets wiped out:** a single trade is capped at 25% of your balance and you can't go below a 50-coin floor. Everyone starts with **500** and gets **+50 every week**.
- **The group remembers:** every settled situation is summarised and stored. New questions pull up similar past outcomes (per person, per category) to set the opening odds and show friends the record.
- **Private by design:** chats are end-to-end encrypted in the browser. Neither the server nor the AI sees message text unless the group switches on "AI reads relevant chat", and then only a few filtered, anonymised snippets picked on the phone.

## Run it

```bash
npm install
npm run seed      # demo data: 5 friends, 2 group chats, 8 weeks of history
npm run dev       # http://localhost:3000
```

Log in as `ilyas`, `jake`, `priya`, `sam` or `maya` with password `demo1234`. Use two browsers to chat between friends. The **+1h / +1d / +1w** buttons (bottom of the sidebar on a laptop, bottom of the screen on a phone) move the app clock so you can show allowances, deadlines and stock decay live.

On a laptop (1024px and wider) the app is a workspace: chats and your balance in a sidebar, the chat in the middle, and markets, leaderboard and insights beside it. On a phone it's one screen at a time.

No keys are needed to run it: without `DATABASE_URL` it uses embedded Postgres (PGlite in `.data/`), and without `GEMINI_API_KEY` it prices from history with a statistical model. Copy `.env.example` to `.env.local` to switch things on. Stop `npm run dev` before re-seeding when using PGlite. After any re-seed, log out and back in: the demo users get fresh encryption keys, and a browser still holding the old ones can see markets but not chat text.

### Turning on the free services

Everything here is free; none of it needs a card.

- **Tiger Cloud (Timescale):** in the Tiger Cloud console create a service and pick the **Shared / Free** compute (US regions only). Copy the connection string it shows once into `.env.local` as `DATABASE_URL`, then `npm run seed`. The app creates the hypertables, the hourly candle aggregate and the compression policies itself. Seeding over the Atlantic takes a few minutes.
- **Solana devnet:** `npm run solana:setup` makes a payer key and saves it in `.env.local`. If the devnet faucet is rate limited it prints the payer address: request devnet SOL for it at faucet.solana.com, then run `npm run solana:setup` again to create the coin. Restart the app, and every stake (burn), payout or allowance (mint) shows up in each person's Solana wallet on the Portfolio page.
- **Gemini:** make a key in Google AI Studio under a project with **no billing attached** (the free tier covers the Flash models) and set `GEMINI_API_KEY`. A key from a project with prepaid billing and no credit fails with HTTP 402, and the app falls back to the statistical model.

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
- Gemini always receives the situation text, settled-history stats and the group's "AI context" (term dates, fixtures). If a user ticks the box, it also gets one mood number per person, worked out on the device from the decrypted chat.
- **AI reads relevant chat (opt-in per group, off by default).** Any member can switch it on or off in group settings, and the chat announces the change to everyone. While it's on, the phone of whoever lists a situation or re-marks stocks does the following with the chat it has already decrypted (`lib/chat-context.ts`):
  1. Keeps only messages about the subject or topic (mentions, same keywords or category, weighted towards recent ones). Max 20 per situation, 8 per stock.
  2. Replaces names with roles (`[SUBJECT]`, `Friend A`…) and removes emails, phone numbers, long numbers, links and @handles.
  3. Sends those snippets with the request. Gemini picks the ones that actually change the odds and says why, and ignores the rest.
  4. Shows the user every snippet that was sent and whether it was used, before they list. The market page keeps only the used snippets so everyone can see what moved the price.

  The server drops any snippets it receives while the group setting is off.
- **The tradeoff:** with the setting on, a handful of anonymised messages leave the end-to-end encryption for that request. They go to our server and to Google's Gemini API, and the used ones are stored with the market. Redaction can't catch everything: a message that describes someone without naming them still gets through, and the text of a message can identify its author. That's why it's per group, off by default, announced to everyone, and fully shown. Leave it off for chats that should stay fully private.
- No analytics, trackers or third-party scripts; strict referrer and permissions headers.
- **Prototype limits:** no forward secrecy or key rotation yet (Signal's Double Ratchet / Matrix's Megolm would add that), no safety-number verification, and new members can read history from before they joined. Solana wallets are custodial devnet keys encrypted with `APP_SECRET`.

## Sponsor tech

| Sponsor | Used for |
| --- | --- |
| **Google Gemini** | Odds, bet-vs-stock routing, resolution rules, outcome summaries, embeddings for "similar past situations", stock re-marks, and (opt-in) picking which anonymised chat snippets matter. Set `GEMINI_API_KEY`. |
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
