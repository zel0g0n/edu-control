#!/usr/bin/env bash
# Zaxira nusxadan tiklash (avval BO'SH sinov bazasiga tiklab tekshiring!):
#   DATABASE_URL=postgres://.../edunazorat_restore ./restore.sh /var/backups/edunazorat/edunazorat-20261011-023000.sql.gz
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL kerak}"
FILE="${1:?Nusxa fayli kerak}"
gzip -dc "$FILE" | psql --single-transaction -v ON_ERROR_STOP=1 "$DATABASE_URL"
echo "Tiklandi. Tekshiring: psql \"\$DATABASE_URL\" -c 'select collection, count(*) from records group by 1'"
