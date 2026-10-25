#!/usr/bin/env bash
# Copies settings from this Mac's .env.local into the hosted copy's deploy/.env and restarts
# the app, over the deploy SSH key. Values go through SSH and are never printed.
#
#   npm run server:set-env                  GEMMA_API_KEY (the default)
#   npm run server:set-env -- NAME [NAME]   any other settings, by name
#
# SERVER and SSH_KEY override the defaults (root@192.248.147.140, ~/.ssh/friendstakes_vultr).
set -euo pipefail
cd "$(dirname "$0")/.."
server=${SERVER:-root@192.248.147.140}
key=${SSH_KEY:-$HOME/.ssh/friendstakes_vultr}
[ $# -gt 0 ] || set -- GEMMA_API_KEY

lines=""
for name in "$@"; do
  [[ $name =~ ^[A-Z_][A-Z0-9_]*$ ]] || { echo "Not a setting name: $name"; exit 1; }
  line=$(grep -E "^$name=" .env.local 2>/dev/null | tail -1 || true)
  [ -n "${line#*=}" ] || { echo "$name is empty or missing in .env.local"; exit 1; }
  lines+="$line"$'\n'
done

printf '%s' "$lines" | ssh -i "$key" -o BatchMode=yes "$server" 'set -e; umask 077; cd /opt/friendstakes/deploy
  while IFS= read -r line; do
    name=${line%%=*}
    { grep -v "^$name=" .env || true; printf "%s\n" "$line"; } > .env.new
    cat .env.new > .env && rm .env.new
    echo "$name set"
  done
  # A changed env file makes compose recreate the app; Caddy holds requests meanwhile.
  docker compose up -d app >/dev/null 2>&1 && echo "app restarted"'
