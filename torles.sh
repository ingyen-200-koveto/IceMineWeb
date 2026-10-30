#!/usr/bin/env bash
set -uo pipefail

main() {
  local APP=/opt/icemine HOMEDIR=/var/lib/icemine USR=icemine ENV=/opt/icemine/.env
  piros(){ printf '\033[1;31m%s\033[0m\n' "$*"; }
  zold(){ printf '\033[1;32m%s\033[0m\n' "$*"; }
  kek(){ printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
  hiba(){ piros "HIBA: $*"; exit 1; }
  eltuntet(){ for c in "$@"; do [ -e "$c" ] || continue; find "$c" -xdev -type f -exec shred -fzu -n 1 {} + 2>/dev/null; rm -rf --one-file-system "$c"; done; }

  [ "$(id -u)" = 0 ] || hiba "Rootként futtasd."

  local DOMAIN="icemine.hu" DBURL=""
  if [ -f "$ENV" ]; then
    DOMAIN=$(sed -n 's|^BASE_URL=https\?://||p' "$ENV" | head -n1); DOMAIN=${DOMAIN#www.}; DOMAIN=${DOMAIN%%/*}; DOMAIN=${DOMAIN:-icemine.hu}
    DBURL=$(sed -n 's|^DATABASE_URL=||p' "$ENV" | head -n1)
  fi

  piros "
!!! AZ ICEMINE WEBOLDAL VÉGLEGES TÖRLÉSE !!!

Törlődik és felülíródik, VISSZAÁLLÍTÁS NINCS:
  - a weboldal kódja és beállításai, a Stripe és Brevo kulcsokkal ($APP)
  - minden fiók, jelszó, IceCoin, vásárlás, skin és mentés ($APP, $HOMEDIR)
  - az adatbázis tartalma (ha Neon adatbázis van beállítva)
  - a szolgáltatások, az automatikus frissítés és a HTTPS beállítás ($DOMAIN)
  - a bot weboldal beállítása ($DOMAIN aldomain)
  - a szerver naplói

Nem nyúl hozzá: Idealtherm, CS2 szerver, a GitHub tároló, a Stripe fiók, a domain."
  echo
  local V=""
  read -rp "Ha biztos vagy benne, írd be nagybetűvel: TOROLD " V </dev/tty || true
  [ "$V" = "TOROLD" ] || { echo "Megszakítva, semmi nem törlődött."; exit 1; }

  if [ -n "$DBURL" ] && [ -d "$APP/node_modules/pg" ] && command -v node >/dev/null 2>&1; then
    kek "Adatbázis ürítése"
    ( cd "$APP" && DATABASE_URL="$DBURL" timeout 60 node -e '
      const { Pool } = require("pg");
      const u = new URL(process.env.DATABASE_URL); u.searchParams.delete("sslmode"); u.searchParams.delete("channel_binding");
      const p = new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, max: 1 });
      p.query("drop table if exists kv").then(() => { console.log("Az adatbázis táblája törölve."); return p.end(); })
       .catch(e => { console.error("Nem sikerült: " + e.message); process.exit(1); });
    ' ) || piros "Az adatbázist nem sikerült üríteni. Töröld a projektet a Neon oldalán (console.neon.tech)."
  fi
  unset DBURL

  kek "Szolgáltatások leállítása"
  systemctl disable --now icemine-frissites.timer icemine-frissites.service icemine.service 2>/dev/null
  rm -f /etc/systemd/system/icemine.service /etc/systemd/system/icemine-frissites.service /etc/systemd/system/icemine-frissites.timer /usr/local/bin/icemine-frissites
  systemctl daemon-reload 2>/dev/null; systemctl reset-failed 2>/dev/null

  kek "Webszerver beállítás"
  if [ -f /etc/caddy/Caddyfile ]; then
    local D="${DOMAIN//./\\.}" UJ; UJ=$(mktemp)
    awk -v re="^[[:space:]]*(https?://)?(www\\.)?$D([,: ]|\\{|$)" '
      !bent && $0 ~ re { bent=1; m=0 }
      bent { n=gsub(/\{/,"{"); z=gsub(/\}/,"}"); m+=n-z; if (m<=0 && (n||z)) bent=0; next }
      { print }' /etc/caddy/Caddyfile > "$UJ"
    rm -f /etc/caddy/icemine.caddy /etc/caddy/icemine-bot.caddy/etc/caddy/icemine-bot.caddy.regi /etc/caddy/Caddyfile.eredeti /etc/caddy/Caddyfile.bot-elott
    grep -qF 'import /etc/caddy/*.caddy' "$UJ" || printf '\nimport /etc/caddy/*.caddy\n' >> "$UJ"
    if caddy validate --config "$UJ" --adapter caddyfile >/dev/null 2>&1; then
      cat "$UJ" > /etc/caddy/Caddyfile
      systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null
      echo "Az IceMine kikerült a Caddyből, a többi oldal fut tovább."
    else
      cat "$UJ" > /etc/caddy/Caddyfile
      piros "A Caddy beállítás ellenőrzése nem sikerült. Nézd meg: caddy validate --config /etc/caddy/Caddyfile"
    fi
    rm -f "$UJ"
  fi
  local C
  for C in /var/lib/caddy/.local/share/caddy/certificates/*/{,www.,bot.}"$DOMAIN"; do eltuntet "$C"; done

  kek "Fájlok felülírása és törlése (ez eltarthat pár percig)"
  eltuntet "$APP" "$HOMEDIR" /tmp/stripe-ell.* /tmp/nodesource_setup.sh
  id "$USR" >/dev/null 2>&1 && { pkill -u "$USR" 2>/dev/null; userdel "$USR" 2>/dev/null; }
  getent group "$USR" >/dev/null && groupdel "$USR" 2>/dev/null

  kek "Naplók törlése"
  journalctl --rotate >/dev/null 2>&1; journalctl --vacuum-time=1s >/dev/null 2>&1
  history -c 2>/dev/null; : > /root/.bash_history 2>/dev/null

  kek "Kész"
  zold "Az IceMine weboldal véglegesen törölve erről a szerverről."
  echo "Ami nem a szerveren van, azt kézzel töröld, ha kell:"
  echo "  - GitHub: IceMineWeb tároló > Settings > Delete this repository"
  echo "  - Stripe: Developers > API keys > Roll key, és a webhook törlése"
  echo "  - Neon adatbázis (ha volt): a projekt törlése a console.neon.tech oldalon"
  echo "  - RackHost DNS: az icemine.hu rekordjai"
  exit 0
}
main "$@"
