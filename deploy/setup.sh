#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu VM (e.g. Vultr Cloud Compute), run as root from
# the repo checkout:  bash deploy/setup.sh
# Installs Docker, adds swap for the build, opens the firewall, writes deploy/.env
# with random secrets and starts the stack. Safe to re-run: it keeps an existing .env.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# The Next.js build and TimescaleDB don't fit in 1-2 GB of RAM together without swap.
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if command -v ufw >/dev/null; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
fi

if [ ! -f .env ]; then
  ip=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
  sed -e "s|^DOMAIN=.*|DOMAIN=${DOMAIN:-$ip.sslip.io}|" \
      -e "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
      env.example > .env
  chmod 600 .env
  echo "Wrote deploy/.env (add API keys there if you have them)."
fi

docker compose up -d --build
echo
echo "Up at https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
echo "Demo data (wipes the database):  cd deploy && docker compose exec app npm run seed && docker compose restart app"
