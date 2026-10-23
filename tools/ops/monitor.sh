#!/usr/bin/env bash
# Serverlar ishlayaptimi? Ishlamasa (ketma-ket 2 marta) Telegram'ga xabar, tiklanganda yana xabar.
# Cron (har daqiqa, istalgan boshqa server yoki kompyuterda — tekshirilayotgan serverning o'zida EMAS):
#   * * * * * TG_TOKEN=... TG_CHAT=... /opt/edunazorat/tools/ops/monitor.sh >> /var/log/edunazorat-monitor.log 2>&1
# Tekshiriladigan manzillar (bo'sh joy bilan): MONITOR_URLS="https://api.maktab.uz/health https://admin.zams.uz/health"
# Telegram: @BotFather'dan bot oching (TG_TOKEN), botga yozing va https://api.telegram.org/bot<TOKEN>/getUpdates
# dan chat.id ni oling (TG_CHAT).
set -uo pipefail
URLS="${MONITOR_URLS:-https://edunazorat-api.onrender.com/health}"
STATE="${MONITOR_STATE:-/var/tmp/edunazorat-monitor}"
mkdir -p "$STATE"

notify() {
  echo "$(date -Is) $1"
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] || return 0
  curl -s -m 10 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" --data-urlencode "text=$1" > /dev/null || true
}

for url in $URLS; do
  key=$(printf '%s' "$url" | md5sum | cut -c1-12)
  body=$(curl -s -m 15 -w '\n%{http_code}' "$url" 2>/dev/null)
  code=$(printf '%s' "$body" | tail -n1)
  fails=$(cat "$STATE/$key.fails" 2>/dev/null || echo 0)
  if [ "$code" = "200" ] && printf '%s' "$body" | grep -q '"ok":true'; then
    if [ "$fails" -ge 2 ]; then notify "✅ Tiklandi: $url"; fi
    echo 0 > "$STATE/$key.fails"
  else
    fails=$((fails + 1))
    echo "$fails" > "$STATE/$key.fails"
    # Bir martalik uzilish (Render uyg'onishi) xabar bermaydi; 2-chi va har 30 daqiqada eslatma
    if [ "$fails" -eq 2 ] || [ $((fails % 30)) -eq 0 ]; then
      [ -n "$code" ] && [ "$code" != "000" ] || code="javob kelmadi"
      notify "🔴 Ishlamayapti ($fails daqiqa): $url — HTTP $code $(printf '%s' "$body" | head -n1 | cut -c1-120)"
    fi
  fi
done
