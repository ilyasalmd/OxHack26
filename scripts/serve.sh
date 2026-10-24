#!/bin/sh
# Rebuild and restart the production server with only a few seconds of downtime:
# build into whichever of .next-a / .next-b is idle, then restart on it.
#   sh scripts/serve.sh            (PORT defaults to 3000)
set -e
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
current="$(cat .data/serving 2>/dev/null || echo .next-b)"
next=".next-a"; [ "$current" = ".next-a" ] && next=".next-b"
NEXT_DIST_DIR="$next" npx next build
lsof -ti "tcp:$PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
sleep 1
mkdir -p .data
echo "$next" > .data/serving
NEXT_DIST_DIR="$next" nohup npx next start -p "$PORT" > .data/server.log 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/" && { echo "Serving $next on :$PORT"; exit 0; }; sleep 1; done
echo "Server did not come up; see .data/server.log" >&2; exit 1
