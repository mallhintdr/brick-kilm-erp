#!/usr/bin/env bash
# Daily database backup. Keeps the last 3 days; the oldest is deleted when a new one is made.
#   Install the daily job (23:59 Pakistan time), once:  bash /var/www/brick-kilm-erp/scripts/backup.sh --install
#   Run a backup now:                                 bash /var/www/brick-kilm-erp/scripts/backup.sh
#   Restore one:                                      bash /var/www/brick-kilm-erp/scripts/backup.sh --restore <file>
#     (the current database is always saved first in /var/backups/brick-kiln/before-restore/, never auto-deleted)
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/brick-kiln}"
KEEP=3

if [ "${1:-}" = "--install" ]; then
  # runs at :59 every hour; the script itself only backs up when it is 23:59 in Pakistan,
  # so the server's own time zone does not matter
  LINE="59 * * * * /bin/bash $APP_DIR/scripts/backup.sh --scheduled >> /var/log/brick-kiln-backup.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'scripts/backup.sh' ; echo "$LINE" ) | crontab -
  echo "Daily backup installed (23:59 Pakistan time):"; crontab -l | grep backup.sh
  exit 0
fi

if [ "${1:-}" = "--scheduled" ] && [ "$(TZ=Asia/Karachi date +%H)" != "23" ]; then exit 0; fi

[ -f "$APP_DIR/.env.sh" ] && source "$APP_DIR/.env.sh"
URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"
DB="${MONGO_DB:-brick_kiln}"
command -v mongodump >/dev/null || { echo "mongodump not found: apt install mongodb-database-tools"; exit 1; }

mkdir -p "$BACKUP_DIR"

if [ "${1:-}" = "--restore" ]; then
  SRC="${2:-}"
  if [ ! -f "$SRC" ] && [ -f "$BACKUP_DIR/$SRC" ]; then SRC="$BACKUP_DIR/$SRC"; fi   # a bare file name is fine
  [ -f "$SRC" ] || { echo "Backup file not found: ${2:-<none>}"; echo "Available:"; ls -1t "$BACKUP_DIR" "$BACKUP_DIR/before-restore" 2>/dev/null; exit 1; }
  echo "This will REPLACE the live database '$DB' with: $SRC"
  read -r -p "Type YES to continue: " ok; [ "$ok" = "YES" ] || { echo "Cancelled."; exit 1; }
  # 1. save the current data first, kept separately with date and time
  SAFE_DIR="$BACKUP_DIR/before-restore"; mkdir -p "$SAFE_DIR"
  SAFE="$SAFE_DIR/${DB}-before-restore-$(TZ=Asia/Karachi date +%Y-%m-%d_%H%M%S).archive.gz"
  mongodump --uri="$URI" --db="$DB" --gzip --archive="$SAFE.part"
  mv "$SAFE.part" "$SAFE"
  echo "Current database saved: $SAFE ($(du -h "$SAFE" | cut -f1))"
  # 2. restore the chosen backup
  mongorestore --uri="$URI" --gzip --archive="$SRC" --nsInclude="$DB.*" --drop
  echo "$(TZ=Asia/Karachi date '+%F %T') PKT restored from $SRC"
  echo "To undo this restore:  bash $APP_DIR/scripts/backup.sh --restore $SAFE"
  exit 0
fi

FILE="$BACKUP_DIR/${DB}-$(TZ=Asia/Karachi date +%Y-%m-%d_%H%M).archive.gz"
mongodump --uri="$URI" --db="$DB" --gzip --archive="$FILE.part"
mv "$FILE.part" "$FILE"   # only a finished backup counts

# keep the newest 3, delete older ones
ls -1t "$BACKUP_DIR"/${DB}-*.archive.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$(TZ=Asia/Karachi date '+%F %T') PKT backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
ls -1t "$BACKUP_DIR"
