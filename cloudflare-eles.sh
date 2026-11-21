#!/usr/bin/env bash
set -euo pipefail

ENV=/opt/icemine/.env
kek(){ printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }
hiba(){ printf '\n\033[1;31mHIBA: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || hiba "Rootként futtasd."
[ -f "$ENV" ] || hiba "Nem találom: $ENV. Előbb a telepites.sh kell."
command -v curl >/dev/null || hiba "Hiányzik a curl (apt install curl)."

kek "Cloudflare ellenőrzés (Turnstile) beállítása"
if [ "${1:-}" = "ki" ]; then
  UJ=$(mktemp); grep -v -E '^\s*(TURNSTILE_SITE_KEY|TURNSTILE_SECRET_KEY)\s*=' "$ENV" > "$UJ" || true
  cat "$UJ" > "$ENV"; rm -f "$UJ"; chown icemine:icemine "$ENV"; chmod 600 "$ENV"
  systemctl restart icemine
  echo "Kikapcsolva. A regisztráció és a belépés ellenőrzés nélkül megy."
  exit 0
fi
echo "Cloudflare > Turnstile > a widgeted > Settings: itt van a Site Key és a Secret Key."
echo

read -rp "Site Key (0x...): " SITE </dev/tty
SITE=$(printf '%s' "$SITE" | tr -d '[:space:]')
[ -n "$SITE" ] || hiba "Üres Site Key."
read -rsp "Secret Key (0x..., gépelés közben nem látszik): " TITOK </dev/tty; echo
TITOK=$(printf '%s' "$TITOK" | tr -d '[:space:]')
[ -n "$TITOK" ] || hiba "Üres Secret Key."

echo "Secret Key ellenőrzése a Cloudflare-nél..."
VALASZ=$(curl -s -m 15 -X POST https://challenges.cloudflare.com/turnstile/v0/siteverify --data-urlencode "secret=$TITOK" --data-urlencode "response=proba" || true)
[ -n "$VALASZ" ] || hiba "Nem érem el a Cloudflare-t (challenges.cloudflare.com). Van internet a szerveren?"
if printf '%s' "$VALASZ" | grep -q 'invalid-input-secret'; then hiba "A Cloudflare nem fogadta el a Secret Key-t. Másold ki újra (Turnstile > Settings > Secret Key)."; fi
echo "Rendben, a Secret Key jó."

kek "Mentés"
MENTES="/var/lib/icemine/env-mentes-$(date +%Y%m%d-%H%M%S)"
cp -p "$ENV" "$MENTES"; chmod 600 "$MENTES"
UJ=$(mktemp)
grep -v -E '^\s*(TURNSTILE_SITE_KEY|TURNSTILE_SECRET_KEY)\s*=' "$ENV" > "$UJ" || true
printf 'TURNSTILE_SITE_KEY=%s\nTURNSTILE_SECRET_KEY=%s\n' "$SITE" "$TITOK" >> "$UJ"
cat "$UJ" > "$ENV"; rm -f "$UJ"
chown icemine:icemine "$ENV"; chmod 600 "$ENV"
unset TITOK
echo "A régi beállítás mentve ide: $MENTES"

systemctl restart icemine
sleep 3
journalctl -u icemine -n 30 --no-pager | grep -E "Cloudflare ellenőrzés" | tail -n1 || true
echo
echo "Kész. Nyisd meg az oldalt: a belépés és a regisztráció gombja fölött meg kell jelennie a Cloudflare ellenőrzésnek."
echo "Ha valami gond van, így kapcsolod ki: bash cloudflare-eles.sh ki"
