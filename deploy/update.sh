#!/usr/bin/env bash
# Keeps the server on the latest code. setup.sh runs this from cron every few minutes;
# run it by hand any time:  bash deploy/update.sh   (--force rebuilds with no new commits)
# It follows GitHub's default branch (or DEPLOY_BRANCH in deploy/.env), adds settings that
# are new in env.example to deploy/.env, and rebuilds only when the commit changed.
# A failed build leaves the running site as it is and is retried on the next run.
set -euo pipefail
cd "$(dirname "$0")"

exec 9>/tmp/friendstakes-update.lock
flock -n 9 || { echo "Another update is running"; exit 0; }

branch=$(sed -n 's/^DEPLOY_BRANCH=//p' .env 2>/dev/null | tail -1)
git fetch -q origin
if [ -z "$branch" ]; then
  git remote set-head origin -a >/dev/null
  branch=$(git symbolic-ref --short refs/remotes/origin/HEAD)
  branch=${branch#origin/}
fi

# The server always matches GitHub. deploy/.env is ignored by git, so it is kept.
git checkout -q -B "$branch" "origin/$branch"

# New settings from env.example go into .env with their defaults; existing values stay.
[ -z "$(tail -c1 .env)" ] || echo >> .env
while IFS= read -r line; do
  key=${line%%=*}
  grep -q "^$key=" .env || { echo "$line" >> .env; echo "Added $key to deploy/.env"; }
done < <(grep -E '^[A-Z_]+=' env.example)

commit=$(git rev-parse HEAD)
if [ "${1:-}" != "--force" ] && [ "$(cat .deployed 2>/dev/null)" = "$commit" ]; then
  exit 0
fi

echo "$(date -Is) deploying $branch: $(git log -1 --format='%h %s')"
docker compose up -d --build --remove-orphans
echo "$commit" > .deployed
docker image prune -f >/dev/null
# Demo accounts and sample chats: only adds what the database is missing, never wipes it.
docker compose exec -T app npm run setup || echo "$(date -Is) npm run setup failed; the site is still up"
echo "$(date -Is) done"
