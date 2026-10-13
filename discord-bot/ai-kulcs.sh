#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/icemine-bot
ENV_FAJL=$APP_DIR/.env
APP_USER=icemine-bot

piros(){ printf '\033[1;31m%s\033[0m\n' "$*"; }
zold(){ printf '\033[1;32m%s\033[0m\n' "$*"; }
kek(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
hiba(){ piros "HIBA: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || hiba "Rootként futtasd."
[ -f "$ENV_FAJL" ] || hiba "Nem találom a bot beállításait ($ENV_FAJL). Előbb telepítsd a botot."

if [ "${1:-}" = "--torles" ]; then
  sed -i '/^ANTHROPIC_API_KEY=/d' "$ENV_FAJL"
  systemctl restart icemine-bot
  zold "Kész, töröltem az AI kulcsot. A ticketeknél újra rögtön a staff kap értesítést."
  exit 0
fi

kek "AI kulcs beállítása a bothoz"
echo "Másold be az Anthropic API kulcsot (platform.claude.com > Settings > API keys)."
echo "Beillesztés után a kulcs nem látszik, ez így normális. Utána nyomj Entert."
KULCS=""
read -r -s -p "Kulcs: " KULCS </dev/tty || true
echo
KULCS=$(printf '%s' "$KULCS" | tr -d '[:space:]')
[[ "$KULCS" =~ ^sk-ant-[A-Za-z0-9_-]{20,}$ ]] || hiba "Ez nem Anthropic kulcsnak néz ki (sk-ant- kezdetűnek kell lennie). Másold ki újra."

kek "Kulcs ellenőrzése"
FEJLEC=$(mktemp)
trap 'rm -f "$FEJLEC"' EXIT
chmod 600 "$FEJLEC"
printf 'x-api-key: %s\nanthropic-version: 2023-06-01\n' "$KULCS" > "$FEJLEC"
KOD=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -H @"$FEJLEC" https://api.anthropic.com/v1/models 2>/dev/null || echo 000)
case "$KOD" in
  200) zold "A kulcs működik." ;;
  401|403) hiba "Az Anthropic nem fogadta el a kulcsot. Nézd meg, jól másoltad-e, vagy készíts újat." ;;
  000) piros "Most nem értem el az Anthropicot, ezért nem tudtam ellenőrizni. A kulcsot azért elmentem." ;;
  *) piros "Az ellenőrzés nem sikerült (HTTP $KOD). A kulcsot azért elmentem." ;;
esac

LIMIT=""
read -r -p "Naponta legfeljebb hány AI válasz lehet? [300]: " LIMIT </dev/tty || true
LIMIT=$(printf '%s' "${LIMIT:-300}" | tr -cd '0-9')
[ -n "$LIMIT" ] && [ "$LIMIT" -gt 0 ] || LIMIT=300

UJ=$(mktemp)
chmod 600 "$UJ"
grep -v -e '^ANTHROPIC_API_KEY=' -e '^AI_NAPI_LIMIT=' "$ENV_FAJL" > "$UJ" || true
printf 'ANTHROPIC_API_KEY=%s\nAI_NAPI_LIMIT=%s\n' "$KULCS" "$LIMIT" >> "$UJ"
mv "$UJ" "$ENV_FAJL"
chown "$APP_USER:$APP_USER" "$ENV_FAJL"
chmod 600 "$ENV_FAJL"
unset KULCS

systemctl restart icemine-bot
sleep 4
journalctl -u icemine-bot -n 20 --no-pager | grep -oE "AI ticket asszisztens:.*" | tail -n 1 || true

zold "
KÉSZ! Az AI asszisztens be van kapcsolva a ticketekben (napi legfeljebb $LIMIT válasz).

Kipróbálás: nyiss egy ticketet a Discordon, és írj bele egy kérdést.
Ki- és bekapcsolás a Discordon:  /beallitas ai
A kulcs törlése:  bash $APP_DIR/discord-bot/ai-kulcs.sh --torles
"
