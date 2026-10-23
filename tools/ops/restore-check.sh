#!/usr/bin/env bash
# Tiklash sinovi: oxirgi zaxira nusxani BO'SH sinov bazasiga tiklaydi va yozuvlar sonini asosiy baza bilan solishtiradi.
# Oyiga bir marta (cron): 0 4 1 * * DATABASE_URL=postgres://.../edunazorat RESTORE_TEST_URL=postgres://.../edunazorat_restore \
#   /opt/edunazorat/tools/ops/restore-check.sh >> /var/log/edunazorat-restore.log 2>&1
# RESTORE_TEST_URL — faqat sinov uchun alohida baza: har safar tozalanadi!
set -euo pipefail
: "${DATABASE_URL:?asosiy baza kerak}"
: "${RESTORE_TEST_URL:?sinov bazasi kerak (asosiy baza EMAS)}"
[ "$DATABASE_URL" != "$RESTORE_TEST_URL" ] || { echo "XATO: sinov bazasi asosiy baza bilan bir xil"; exit 1; }
DIR="${BACKUP_DIR:-/var/backups/edunazorat}"
FILE=$(ls -1t "$DIR"/edunazorat-*.sql.gz 2>/dev/null | head -n1)
[ -n "$FILE" ] || { echo "XATO: $DIR da nusxa yo'q"; exit 1; }
psql -q -v ON_ERROR_STOP=1 "$RESTORE_TEST_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gzip -dc "$FILE" | psql -q --single-transaction -v ON_ERROR_STOP=1 "$RESTORE_TEST_URL" > /dev/null
q="SELECT collection || '=' || count(*) FROM records GROUP BY collection ORDER BY collection"
got=$(psql -At "$RESTORE_TEST_URL" -c "$q" | tr '\n' ' ')
live=$(psql -At "$DATABASE_URL" -c "$q" | tr '\n' ' ')
echo "$(date -Is) nusxa: $FILE"
echo "  tiklangan: $got"
echo "  asosiy:    $live"
[ -n "$got" ] || { echo "XATO: tiklangan bazada yozuv yo'q"; exit 1; }
echo "OK: nusxa tiklanadi (sonlar farqi = nusxa olingandan keyingi o'zgarishlar)"
