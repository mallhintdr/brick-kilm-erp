#!/usr/bin/env bash
# One-step server update: pull from GitHub, install, build the app, restart the API.
# Usage (on the server, from anywhere):  bash /var/www/brick-kilm-erp/update.sh
set -euo pipefail
cd "$(dirname "$0")"

git pull origin main
npm install
npm run build -w apps/pwa
[ -f .env.sh ] && source .env.sh
pm2 restart kiln-api --update-env

echo "Updated to v$(node -p "require('./package.json').version")"
