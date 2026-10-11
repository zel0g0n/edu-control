#!/usr/bin/env bash
# Bazaning kunlik zaxira nusxasi (VPS uchun). Cron: har kuni 02:30
#   30 2 * * * DATABASE_URL=postgres://... /opt/edunazorat/tools/ops/backup.sh >> /var/log/edunazorat-backup.log 2>&1
# Nusxalar /var/backups/edunazorat da, 14 kundan eskisi o'chiriladi. Haftada bir marta boshqa joyga
# (boshqa server yoki shifrlangan disk) ko'chiring va TIKLASHNI SINAB KO'RING (SECURITY.md, "Zaxira").
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL kerak}"
DIR="${BACKUP_DIR:-/var/backups/edunazorat}"
KEEP_DAYS="${KEEP_DAYS:-14}"
umask 077
mkdir -p "$DIR"
FILE="$DIR/edunazorat-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
# Nusxa bo'sh emasligini tekshirish
[ "$(gzip -dc "$FILE" | head -c 100 | wc -c)" -gt 0 ] || { echo "XATO: nusxa bo'sh"; exit 1; }
find "$DIR" -name 'edunazorat-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date -Is) tayyor: $FILE ($(du -h "$FILE" | cut -f1))"
