#!/usr/bin/env bash
# Daily database backup. Keeps the last 3 days; the oldest is deleted when a new one is made.
#   Install the daily job (23:59 server time), once:  bash /var/www/brick-kilm-erp/scripts/backup.sh --install
#   Run a backup now:                                 bash /var/www/brick-kilm-erp/scripts/backup.sh
#   Restore one:  mongorestore --uri "$MONGO_URI" --gzip --archive=/var/backups/brick-kiln/<file> --drop
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/brick-kiln}"
KEEP=3

if [ "${1:-}" = "--install" ]; then
  LINE="59 23 * * * /bin/bash $APP_DIR/scripts/backup.sh >> /var/log/brick-kiln-backup.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'scripts/backup.sh' ; echo "$LINE" ) | crontab -
  echo "Daily backup installed (23:59):"; crontab -l | grep backup.sh
  exit 0
fi

[ -f "$APP_DIR/.env.sh" ] && source "$APP_DIR/.env.sh"
URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"
DB="${MONGO_DB:-brick_kiln}"
command -v mongodump >/dev/null || { echo "mongodump not found: apt install mongodb-database-tools"; exit 1; }

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/${DB}-$(date +%Y-%m-%d_%H%M).archive.gz"
mongodump --uri="$URI" --db="$DB" --gzip --archive="$FILE.part"
mv "$FILE.part" "$FILE"   # only a finished backup counts

# keep the newest 3, delete older ones
ls -1t "$BACKUP_DIR"/${DB}-*.archive.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$(date '+%F %T') backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
ls -1t "$BACKUP_DIR"
