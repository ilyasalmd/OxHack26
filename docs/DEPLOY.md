# Hosted copy (Vultr)

**Link: https://192.248.147.140.sslip.io**

The public, always-on copy of FriendStakes for judges and the team. Sign in with any account in [DEMO_LOGINS.md](DEMO_LOGINS.md) (`demo1234` for everyone except the admin). It has its own database, so chats and stakes made here don't appear on the Mac-hosted link, and the other way round.

## The server

| | |
|---|---|
| Provider | Vultr Cloud Compute, London (`lhr`) |
| Plan | `vc2-1c-2gb`: 1 vCPU, 2 GB RAM, 55 GB disk, about $10 a month from the team's free credit |
| OS | Ubuntu 24.04 |
| Label | `FriendStakes` |
| Address | `192.248.147.140` (HTTPS through `sslip.io`, so no domain is needed) |
| Code | `/opt/friendstakes`, a clone of this repo |

It runs `deploy/docker-compose.yml`: the app, TimescaleDB, and Caddy for HTTPS (a Let's Encrypt certificate for the sslip.io name).

## How it was set up

The server was created with a start-up script that clones this repo and runs `bash deploy/setup.sh`. That installs Docker, adds 2 GB of swap for the build, opens ports 22, 80 and 443, writes `deploy/.env` with random secrets, builds and starts the stack, and adds a cron job that runs `deploy/update.sh` every 5 minutes. Then `npm run setup` filled the database with every demo account and sample chat.

## Updating

Nothing to do: **merge to `main` and the server picks it up within 5 minutes.** `update.sh` fetches `main` (`DEPLOY_BRANCH` in `deploy/.env`) and rebuilds only when the commit changed. A failed build leaves the running site as it was and is tried again next time. After a deploy it runs `npm run setup`, which only adds missing demo data and never wipes anything.

By hand, over SSH (`ssh root@192.248.147.140` with a key the server knows):

```bash
cd /opt/friendstakes/deploy
bash update.sh --force                  # rebuild and restart now
docker compose restart app              # restart without rebuilding
docker compose logs -f --tail 100 app   # app logs
tail -f /var/log/friendstakes-update.log
docker compose exec app npm run setup   # top up demo data
```

SSH works by key only. The deploy key lives on Ilyas's Mac at `~/.ssh/friendstakes_vultr`. To let someone else in, add their public key to `/root/.ssh/authorized_keys`.

## Settings

The server's settings are in `/opt/friendstakes/deploy/.env`. That file is not in git and holds the secrets. Here are the names:

| Name | What it does |
|---|---|
| `DOMAIN` | Hostname Caddy gets a certificate for (`192.248.147.140.sslip.io`) |
| `APP_SECRET` | Signs sessions and encrypts custodial wallets. Never change it once people have signed up |
| `POSTGRES_PASSWORD` | TimescaleDB password (the container is not exposed outside the server) |
| `ADMIN_USERNAMES` | The admin account, `stakesadmin` |
| `ADMIN_PASSWORD` | The admin's password, the same as on the Mac-hosted copy |
| `DEPLOY_BRANCH` | The branch to follow, `main` |
| `DEMO_MODE` | Demo clock buttons for the admin |
| `DEMO_DATA_FOR_ALL` | Every account gets the sample chats |
| `SOLANA_CLUSTER`, `SOLANA_PAYER_SECRET`, `SOLANA_MINT`, `SOLANA_OP_RECEIPTS` | Optional on-chain coin (devnet). Empty here, so the Chain page is off |
| `GEMMA_API_KEY` | Gemma hosted by Google (a free key from aistudio.google.com/apikey). Without it the server has no GPU for Gemma and prices with the statistical model from history |
| `OLLAMA_URL`, `OLLAMA_MODEL` | Optional Gemma on an Ollama machine instead |

New settings added to `deploy/env.example` are copied into `deploy/.env` with their defaults on the next deploy.
