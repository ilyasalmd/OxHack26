# FriendStakes

**Your group chat, now with a stock market.** Friends post stakes about each other ("Jake is late to Friday dinner", "Priya graduates with a First"), the AI prices them from the group's own history, and everyone goes long or short with play money. Built for OxHack 2026 (theme: **TIME**).

- **Short-term bets** close at a deadline and settle YES/NO.
- **Long-term stocks** trade like a maturing bond: they pay out if the outcome happens by maturity, and "by date X" stocks lose value as time runs out with no news (constant-hazard decay).
- **Invest in yourself:** you can go long on stocks about you, never short them, and you can't bet on short-term stakes about yourself.
- **The AI is the bookmaker:** it quotes a buy and a sell price around its probability with a 3% margin each side, and leans its quote against whichever side people pile into. Each market has a limit on what the house can lose, and trading pauses while the AI re-marks a chat. Positions count at their cash-out value, so buying never makes you look richer.
- **Nobody gets wiped out:** a single trade is capped at 25% of your balance and you can't go below a 50-coin floor. Everyone starts with **500** and gets **+50 every week**.
- **The group remembers:** every settled stake is summarised and stored. New questions pull up similar past outcomes (per person, per category) to set the opening odds and show friends the record.
- **Private by design, with one disclosed exception:** chats are end-to-end encrypted in the browser. The server never reads message text. The AI gets only a few filtered, anonymised snippets picked on the phone when a stake is priced, and everyone agrees to that in the Terms when they sign up.

**Trying the demo:** the live link and the demo accounts are in [docs/DEMO_LOGINS.md](docs/DEMO_LOGINS.md), and what you can tell the AI is in [docs/AI_INPUTS.md](docs/AI_INPUTS.md).

## Run it

```bash
npm install
npm run seed      # demo data: 15 people, 6 group chats, 3 months of history
npm run dev       # http://localhost:3000
```

Log in as `ilyas` or any sample person (`jake`, `priya`, `sam`, `maya`, `omar` and the rest listed in [docs/DEMO_LOGINS.md](docs/DEMO_LOGINS.md)) with password `demo1234`. Use two browsers to chat between friends. Put your admin account's username in `ADMIN_USERNAMES`: that account alone sees the **Chain** page, the pricing records and the **+1h / +1d / +1w** buttons (bottom of the sidebar on a laptop, bottom of the screen on a phone). The buttons move only the admin's own clock, and its own groups, so you can show allowances, deadlines and stock decay live while everyone else stays on the real date.

On a laptop (1024px and wider) the app is a workspace: chats and your balance in a sidebar, the chat in the middle, and markets, leaderboard and insights beside it. On a phone it's one screen at a time.

No keys are needed to run it: without `DATABASE_URL` it uses embedded Postgres (PGlite in `.data/`), and without `OLLAMA_MODEL` it prices from history with a statistical model. Copy `.env.example` to `.env.local` to switch things on. Stop `npm run dev` before re-seeding when using PGlite. After a re-seed the demo users get fresh encryption keys, so each browser asks for the password once to unlock the chats again.

### Turning on the free services

Everything here is free; none of it needs a card.

- **Tiger Cloud (Timescale):** in the Tiger Cloud console create a service and pick the **Shared / Free** compute (US regions only). Copy the connection string it shows once into `.env.local` as `DATABASE_URL`, then `npm run seed`. The app creates the hypertables, the hourly candle aggregate and the compression policies itself. Seeding over the Atlantic takes a few minutes.
- **Solana:** `npm run solana:setup` makes a payer key, saves it in `.env.local` and creates the coin (an SPL token). Two ways to get the free SOL that pays the fees:
  - **Local validator (no faucet, no limits):** `brew install solana`, then `solana-test-validator --ledger .data/solana-ledger --quiet` in its own terminal, `solana -u localhost airdrop 50 <payer address>`, and add `SOLANA_RPC_URL=http://127.0.0.1:8899` and `SOLANA_CLUSTER=localnet` to `.env.local` before `npm run solana:setup`.
  - **Devnet:** request devnet SOL for the payer address at faucet.solana.com (the RPC airdrop is often rate limited), then rerun `npm run solana:setup`.

  - **Public copy on devnet:** `npm run solana:devnet` republishes every transaction the local chain confirmed to public devnet (same amounts, memos and pricing hashes) with its own payer and token, so anyone can check them on explorer.solana.com. The first run prints the payer address to fund at faucet.solana.com. The Chain pages then link each transaction to its devnet copy.

  Restart the app, and every buy-in (into the stake's vault), payout (out of it) or allowance (mint) shows up in each person's wallet on the Portfolio page, and on the admin's **Chain** page, which reads the transactions straight from the Solana RPC.
- **Gemma (the AI):** runs on your own machine through Ollama, so there is no API key and nothing leaves the machine. `brew install ollama`, then `ollama pull gemma4:12b` and `ollama pull embeddinggemma-2:270m`, and set `AI_PROVIDER=ollama` and `OLLAMA_MODEL=gemma4:12b` (or `gemma4:26b` on a bigger Mac). If Ollama isn't running, the app falls back to the statistical model.

`npm test` runs the market-maths tests. `sh scripts/serve.sh` builds and (re)starts production on port 3000 with only a few seconds of downtime, which keeps a phone tunnel (`cloudflared tunnel --url http://localhost:3000`) usable while you change things. Set `APP_SECRET` for production.

### Deploy on Vultr

`deploy/` runs the app, TimescaleDB and Caddy (automatic HTTPS) on one VM. HTTPS isn't optional: chat encryption uses WebCrypto, which browsers only allow on secure origins.

1. In Vultr, deploy **Cloud Compute** with **Ubuntu 24.04**, 2 GB RAM or more, in a region near your friends. Add your SSH key.
2. SSH in as root, then:
   ```bash
   git clone https://github.com/ilyasalmd/OxHack26.git && cd OxHack26
   bash deploy/setup.sh
   ```
   It installs Docker, adds swap, opens ports 80/443, writes `deploy/.env` with random secrets and starts everything. With no domain the site lives at `https://<server-ip>.sslip.io`. For your own domain, point an A record at the server and run `DOMAIN=stocks.example.com bash deploy/setup.sh` instead (or edit `DOMAIN` in `deploy/.env`).
3. Optional: paste the `SOLANA_*` values from your `.env.local` into `deploy/.env`, and point `OLLAMA_URL` and `OLLAMA_MODEL` at an Ollama server running Gemma, then run `docker compose up -d` from `deploy/`.
4. Optional demo data (wipes the database): `docker compose exec app npm run seed && docker compose restart app` from `deploy/`.

**Updates are automatic.** Every 5 minutes `deploy/update.sh` (cron) checks GitHub's default branch, and on a new commit it rebuilds and restarts the app. It also adds settings that are new in `deploy/env.example` to `deploy/.env` with their defaults. A failed build keeps the old version running and is retried next time. The server always matches GitHub, so don't edit code on it. To deploy right now: `bash deploy/update.sh --force`. To follow another branch, set `DEPLOY_BRANCH=` in `deploy/.env`. Deploy log: `tail -f /var/log/friendstakes-update.log`. App logs: `docker compose logs -f app` from `deploy/`. Keep `APP_SECRET` unchanged once people have signed up. `DEMO_MODE=true` lets the admin move their own demo clock; set it to `false` for real use.

## How it works

| Piece | What it does |
| --- | --- |
| `lib/lmsr.ts` | Hanson's LMSR market maker. Long = buy YES shares, short = buy NO shares, each pays 1 coin. Max house loss per market is `b·ln 2`. Also the hazard-decay formula `P(by T) = 1 − (1 − p)^((T − t₂)/(T − t₁))`. |
| `lib/markets.ts` | Preview → list → trade → resolve, AI re-marks, time decay. Trades run in a DB transaction with row locks. |
| `lib/ai.ts` | Gemma through Ollama with JSON-schema output: routes a stake to bet or stock, decides decay, writes the resolution rule, estimates the probability from the group's evidence, summarises outcomes, re-marks stocks. Falls back to a heuristic model. |
| `lib/pricing-record.ts` | Saves every AI pricing decision (inputs, prompt, raw reply, maths) as the exact JSON text that is hashed with SHA-256. The opening hash also goes in the market's Solana memo, and the admin can recheck it in the browser. |
| `lib/memory.ts` | Search for similar stakes (EmbeddingGemma vectors + keyword overlap, boosted for the same person and category) and a similarity-weighted Beta(1,1) base rate. |
| `lib/stats.ts` | Leaderboard (net worth, P&L in this group, Brier skill score) and AI vs crowd vs coin-flip calibration. |
| `lib/solana.ts`, `lib/outbox.ts` | Every balance change goes on an SPL token. Each stake has its own **vault** token account on chain: buy-ins and fees move into it, sales, payouts and refunds come out of it, the house mints any shortfall and burns what's left, then the vault closes. Allowances and opening balances **mint**; opens and results are **memos** of hashes. The outbox saves each signed transaction before sending, checks a lost answer by its signature, rebuilds only after the blockhash has expired, and puts a one-off receipt account on chain per operation so it can never be applied twice. |
| `lib/e2ee.ts` | WebCrypto E2EE (below). |
| `lib/db.ts`, `lib/schema.sql` | Postgres. On Timescale/Tiger Cloud it creates hypertables, an hourly OHLC continuous aggregate and compression policies. |

One account can be in any number of group chats. **Your balance is one wallet across all your groups** (like a real brokerage account); each group's leaderboard ranks net worth and also shows your profit or loss from that group's stakes only.

### Privacy

- Your password never leaves the device. The browser derives two keys with PBKDF2: an auth key (sent and bcrypt-hashed on the server) and an encryption key (never sent) that locks your ECDH P-256 identity key.
- Each group has a random AES-256-GCM key, wrapped separately for every member with ECDH + HKDF. People who join by invite link get the key from the next member whose app is open.
- The server stores ciphertext, sender and timestamp only.
- **Voice notes and photos** are encrypted on the phone with the group key before upload and stored as ciphertext in the database (`attachments`), with size caps (photos are re-drawn at 1600px, which also strips location and camera metadata; voice notes stop at 3 minutes). Group descriptions are encrypted the same way.
- **Profile photos** are encrypted with a per-person profile key that your app wraps for each person you share a chat with (as Signal does), so only friends can see them.
- **Private chats** are two-person groups with their own key; nobody can be added to one or join it by link.
- What the server does learn: who is typing or recording (kept in memory for 5 seconds), and how far each member has fetched and read (for the ticks). Market events (listings, trades, results) are plaintext because the server has to run the market.
- Gemma runs on the app's own machine, so nothing goes to an outside AI company. It always receives the stake text, settled-history stats and the group's "AI context" (term dates, fixtures), plus the subject's answers to the optional sign-up questions if they gave any. Those answers are never shown to other members, and the stored pricing records blank them out. If a user ticks the box, it also gets one mood number per person, worked out on the device from the decrypted chat.
- **AI reads relevant chat (always on, agreed at sign-up).** There is no per-group switch and no per-chat notice. The full text in `lib/ai-disclosure.ts` is section 7 of the Terms (`/terms#ai`) and is repeated on the privacy page. Sign-up needs a ticked "I agree" box, which the server checks and records in `users.terms_accepted_at`. Settings → Privacy and group info link to it. The phone of whoever lists a stake or re-marks stocks does the following with the chat it has already decrypted (`lib/chat-context.ts`):
  1. Keeps only messages about the subject or topic (mentions, same keywords or category, weighted towards recent ones). Max 20 per stake, 8 per stock.
  2. Replaces names with roles (`[SUBJECT]`, `Friend A`…) and removes emails, phone numbers, long numbers, links and @handles.
  3. Sends those snippets with the request. Gemma picks the ones that actually change the odds and says why, and ignores the rest.
  4. Shows the user every snippet that was sent and whether it was used, before they list. The market page keeps only the used snippets so everyone can see what moved the price.

  The server caps the count again and never asks for more.
- **The tradeoff:** a handful of anonymised messages leave the end-to-end encryption for that request. They go to our server, where Gemma reads them locally; the used ones are stored with the market for everyone in the chat to see, and every sent snippet is in the admin-only pricing record. Redaction can't catch everything: a message that describes someone without naming them still gets through, and the text of a message can identify its author. That's why it is in the Terms everyone ticks at sign-up and fully shown afterwards. A chat that should stay fully private should not have stakes posted in it.
- No analytics, trackers or third-party scripts; strict referrer and permissions headers.
- **Prototype limits:** no forward secrecy or key rotation yet (Signal's Double Ratchet / Matrix's Megolm would add that), no safety-number verification, and new members can read history from before they joined. Solana wallets are custodial devnet keys encrypted with `APP_SECRET`.

## Integrated services

| Service | Used for |
| --- | --- |
| **Tiger Data (Tiger Cloud)** | The app's database. Price and net-worth time series as hypertables, hourly candles as a continuous aggregate, compression, and the pricing records. Point `DATABASE_URL` at a Tiger Cloud service or `docker compose up -d`. |
| **Solana** | In-game coin as an SPL token (devnet or a local validator) with every open stake's coins held in its own on-chain vault (buy-ins in, payouts out, checkable against the app's ledger on the Chain page), exactly-once sending, memos for market lifecycle carrying each opening price's record hash, and an admin Chain page reading it all back from the RPC. `npm run solana:setup` creates the mint. |
| **Gemma** (open model, local) | Odds, bet-vs-stock routing, resolution rules, outcome summaries, embeddings for "similar past stakes", stock re-marks, and picking which anonymised chat snippets matter. Runs through Ollama with no API key. |
| **Vultr** | `deploy/`: Docker Compose stack (app, TimescaleDB, Caddy HTTPS) and a setup script for a Vultr VM. |

## Structure

```
app/            Next.js 16 pages (chats, group chat, market, portfolio) and API routes
components/     UI, chart, session + key handling
lib/            market engine, AI, memory, Solana, E2EE, DB
scripts/        seed.ts, solana-setup.ts
tests/          LMSR and max-trade tests
```
