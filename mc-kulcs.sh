#!/usr/bin/env bash
set -euo pipefail

ENV=/opt/icemine/.env
kek(){ printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }
hiba(){ printf '\n\033[1;31mHIBA: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || hiba "Rootként futtasd."
[ -f "$ENV" ] || hiba "Nem találom: $ENV. Előbb a telepites.sh kell."

REGI=$(grep -E '^\s*MC_API_KEY\s*=' "$ENV" | tail -n1 | cut -d= -f2- | tr -d '[:space:]"' || true)

if [ -n "$REGI" ] && [ "${1:-}" != "uj" ]; then
  KULCS="$REGI"
  kek "Már van kulcs, ez az"
else
  KULCS=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  MENTES="/var/lib/icemine/env-mentes-$(date +%Y%m%d-%H%M%S)"
  mkdir -p /var/lib/icemine
  cp -p "$ENV" "$MENTES"; chmod 600 "$MENTES"
  UJ=$(mktemp)
  grep -v -E '^\s*MC_API_KEY\s*=' "$ENV" > "$UJ" || true
  printf 'MC_API_KEY=%s\n' "$KULCS" >> "$UJ"
  cat "$UJ" > "$ENV"; rm -f "$UJ"
  chown icemine:icemine "$ENV"; chmod 600 "$ENV"
  systemctl restart icemine
  kek "Új kulcs elkészült és beállítva a weboldalon"
fi

printf '\n   \033[1;33m%s\033[0m\n' "$KULCS"
cat <<SZOVEG

Ezt a kulcsot két helyre másold be (ne küldd el senkinek, chatbe se):

1) LOBBY: plugins/IceMine/config.yml, az icecoin részben:
     api-key: '$KULCS'
   Mentés, majd a lobby újraindítása.

2) PROXY: plugins/icemineproxy/hibak.properties
     kulcs=$KULCS
   Mentés, majd a proxy újraindítása.

Amíg a lobbyra nincs beírva, a játékban nem látszik az IceCoin egyenleg, úgyhogy azt csináld meg rögtön.
Új kulcs kell (pl. kiszivárgott)? bash /opt/icemine/mc-kulcs.sh uj
SZOVEG
