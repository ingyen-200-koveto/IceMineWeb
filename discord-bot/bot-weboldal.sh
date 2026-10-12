#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-bot.icemine.hu}"
DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN#http://}; DOMAIN=${DOMAIN%%/*}
WEB=/opt/icemine/discord-bot/web
CONF=/etc/caddy/icemine-bot.caddy

piros(){ printf '\033[1;31m%s\033[0m\n' "$*"; }
zold(){ printf '\033[1;32m%s\033[0m\n' "$*"; }
kek(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
hiba(){ piros "HIBA: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || hiba "Rootként futtasd."
command -v caddy >/dev/null 2>&1 || hiba "Nincs Caddy a gépen. Előbb a weboldal telepítőjét futtasd."
[ -f /etc/caddy/Caddyfile ] || hiba "Nincs /etc/caddy/Caddyfile. Előbb a weboldal telepítőjét futtasd."

if [ ! -f "$WEB/index.html" ] && command -v icemine-frissites >/dev/null 2>&1; then
  kek "Friss fájlok letöltése a GitHubról"
  icemine-frissites --most || true
fi
[ -f "$WEB/index.html" ] || hiba "Nem találom: $WEB/index.html. Futtasd: icemine-frissites --most"

kek "Bot weboldal beállítása: $DOMAIN"
chmod o+x /opt/icemine /opt/icemine/discord-bot
chmod -R o+rX "$WEB"

[ -f "$CONF" ] && cp "$CONF" "$CONF.regi"
cat > "$CONF" <<EOF
$DOMAIN {
	encode zstd gzip
	root * $WEB
	file_server
	header /fonts/* Cache-Control "public, max-age=31536000"
}
EOF

if ! grep -qF 'import /etc/caddy/*.caddy' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bot-elott
  printf '\nimport /etc/caddy/*.caddy\n' >> /etc/caddy/Caddyfile
fi

if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
  if [ -f "$CONF.regi" ]; then mv "$CONF.regi" "$CONF"; else rm -f "$CONF"; fi
  [ -f /etc/caddy/Caddyfile.bot-elott ] && mv /etc/caddy/Caddyfile.bot-elott /etc/caddy/Caddyfile
  hiba "A Caddy beállítás hibás lett, visszaállítottam az előzőt."
fi
rm -f "$CONF.regi" /etc/caddy/Caddyfile.bot-elott
systemctl reload caddy 2>/dev/null || systemctl restart caddy

IP=$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
zold "
KÉSZ! A bot weboldala be van állítva.

Utolsó lépés a RackHost DNS zónáiban (${DOMAIN#*.}):
  Adj hozzá egy új A rekordot:   ${DOMAIN%%.*}   A   $IP

Amint a DNS átmegy (pár perc – 1 óra), a https://$DOMAIN magától kap HTTPS-t.
A tartalma a GitHubról frissül a weboldallal együtt, ehhez többet nem kell nyúlni.
"
