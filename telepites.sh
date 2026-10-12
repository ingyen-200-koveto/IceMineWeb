#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/icemine
APP_USER=icemine
APP_HOME=/var/lib/icemine
PORT=3000

piros(){ printf '\033[1;31m%s\033[0m\n' "$*"; }
zold(){ printf '\033[1;32m%s\033[0m\n' "$*"; }
kek(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
hiba(){ piros "HIBA: $*"; exit 1; }
kerdez(){
  local valasz="" kerdes="$2"
  [ -n "${3:-}" ] && kerdes="$kerdes [$3]"
  read -r -p "$kerdes: " valasz </dev/tty || true
  printf -v "$1" '%s' "${valasz:-${3:-}}"
}

[ "$(id -u)" -eq 0 ] || hiba "Rootként futtasd (pl. sudo bash telepites.sh)."
command -v apt-get >/dev/null 2>&1 || hiba "Ez a telepítő Ubuntura vagy Debianra készült."
export DEBIAN_FRONTEND=noninteractive
cd /
as_app(){ runuser -u "$APP_USER" -- env HOME="$APP_HOME" GIT_TERMINAL_PROMPT=0 "$@"; }

kek "Beállítások"
REPO="" DOMAIN="" BREVO="" MAILFROM="" DBURL="" KEEP="n"
if [ -f "$APP_DIR/.env" ]; then
  kerdez KEEP "Már van telepítés. Megtartod a meglévő beállításokat? (i/n)" "i"
fi
if [ -d "$APP_DIR/.git" ]; then
  REPO=$(as_app git -C "$APP_DIR" config --get remote.origin.url 2>/dev/null || true)
fi
[ -n "$REPO" ] || kerdez REPO "GitHub tároló címe (pl. https://github.com/felhasznalo/icemine)"
[ -n "$REPO" ] || hiba "A GitHub tároló címe kötelező."
if [ "$KEEP" != "i" ]; then
  kerdez DOMAIN "Domain" "icemine.hu"
  kerdez BREVO "Brevo API kulcs (Enter = kihagyás, akkor nem mennek ki e-mailek)"
  kerdez MAILFROM "Feladó e-mail cím (a Brevóban megerősített cím)"
  kerdez DBURL "Neon DATABASE_URL (Enter = a fiókokat a VPS-en, fájlban tárolja)"
else
  DOMAIN=$(sed -n 's|^BASE_URL=https://||p' "$APP_DIR/.env" | head -n1)
  [ -n "$DOMAIN" ] || kerdez DOMAIN "Domain" "icemine.hu"
fi
DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN#http://}; DOMAIN=${DOMAIN#www.}; DOMAIN=${DOMAIN%%/*}
[ -n "$DOMAIN" ] || hiba "A domain kötelező."

kek "Rendszercsomagok telepítése"
apt-get update -y
apt-get install -y curl ca-certificates git gnupg
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https || true

node_ok(){ command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
if ! node_ok; then
  kek "Node.js telepítése"
  if curl -fsSL https://deb.nodesource.com/setup_lts.x -o /tmp/nodesource_setup.sh; then
    bash /tmp/nodesource_setup.sh && apt-get install -y nodejs || true
  fi
  node_ok || { apt-get install -y nodejs npm || true; }
  node_ok || hiba "Nem sikerült legalább 18-as Node.js-t telepíteni."
fi
command -v npm >/dev/null 2>&1 || apt-get install -y npm
zold "Node.js $(node -v) kész."

if ! command -v caddy >/dev/null 2>&1; then
  kek "Caddy webszerver telepítése (automatikus HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
zold "Caddy $(caddy version | awk '{print $1}') kész."

for svc in apache2 nginx lighttpd; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    piros "A(z) $svc foglalja a webes portokat, leállítom és kikapcsolom."
    systemctl disable --now "$svc" || true
  fi
done
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

kek "Weboldal letöltése a GitHubról"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_HOME"

if [ -d "$APP_DIR/.git" ]; then
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  as_app git -C "$APP_DIR" fetch --quiet origin
  REF=$(as_app git -C "$APP_DIR" rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo origin/main)
  as_app git -C "$APP_DIR" reset --hard --quiet "$REF"
else
  if [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    hiba "$APP_DIR már létezik, de nem GitHub-tároló. Nevezd át vagy töröld, majd futtasd újra."
  fi
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  as_app git clone --quiet "$REPO" "$APP_DIR" || hiba "Nem sikerült letölteni: $REPO
Ha a tároló privát, állítsd nyilvánosra a GitHubon (Settings > General > Danger Zone > Change visibility),
vagy ellenőrizd, hogy jó-e a cím."
fi
[ -f "$APP_DIR/server.js" ] || hiba "A tárolóban nincs server.js. Biztosan ez az IceMine tároló?"

if [ "$KEEP" != "i" ]; then
  kek "Beállítások mentése"
  umask 077
  {
    printf 'HOST=127.0.0.1\nPORT=%s\nBASE_URL=https://%s\n' "$PORT" "$DOMAIN"
    [ -n "$BREVO" ] && printf 'BREVO_API_KEY=%s\n' "$BREVO"
    [ -n "$MAILFROM" ] && printf 'MAIL_FROM=%s\n' "$MAILFROM"
    [ -n "$DBURL" ] && printf 'DATABASE_URL=%s\n' "$DBURL"
    true
  } > "$APP_DIR/.env"
  umask 022
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"

kek "Függőségek telepítése (npm)"
as_app bash -c "cd '$APP_DIR' && npm install --omit=dev --no-audit --no-fund"

kek "Automatikus indítás beállítása"
NODE_BIN=$(command -v node)
cat > /etc/systemd/system/icemine.service <<EOF
[Unit]
Description=IceMine weboldal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > /usr/local/bin/icemine-frissites <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
as_app(){ runuser -u icemine -- env HOME=/var/lib/icemine GIT_TERMINAL_PROMPT=0 "$@"; }
cd /opt/icemine
as_app git fetch --quiet origin
REF=$(as_app git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo origin/main)
if [ "$(as_app git rev-parse HEAD)" != "$(as_app git rev-parse "$REF")" ] || [ "${1:-}" = "--most" ]; then
  as_app git reset --hard --quiet "$REF"
  as_app bash -c "npm install --omit=dev --no-audit --no-fund --silent"
  systemctl restart icemine
  echo "IceMine frissítve: $(as_app git log -1 --format='%h %s')"
else
  echo "Nincs új változás a GitHubon."
fi
EOF
chmod 755 /usr/local/bin/icemine-frissites

cat > /etc/systemd/system/icemine-frissites.service <<'EOF'
[Unit]
Description=IceMine frissítés a GitHubról
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/icemine-frissites
EOF
cat > /etc/systemd/system/icemine-frissites.timer <<'EOF'
[Unit]
Description=IceMine frissítés 5 percenként

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --quiet icemine icemine-frissites.timer
systemctl restart icemine
systemctl start icemine-frissites.timer

kek "HTTPS beállítása"
install -d /etc/caddy
[ -f /etc/caddy/Caddyfile ] && ! grep -q "reverse_proxy 127.0.0.1:$PORT" /etc/caddy/Caddyfile && cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.eredeti
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN, www.$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}

import /etc/caddy/*.caddy
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || hiba "A Caddy beállítás hibás."
systemctl enable --quiet caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

kek "Ellenőrzés"
ok=""
for _ in $(seq 1 15); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/"; then ok=1; break; fi
  sleep 1
done
if [ -z "$ok" ]; then
  piros "A weboldal nem indult el. Az utolsó naplósorok:"
  journalctl -u icemine -n 30 --no-pager || true
  exit 1
fi
sleep 4
journalctl -u icemine -n 30 --no-pager | grep -oE "(IceMine fut|E-mail:).*" | tail -n 3 || true

IP=$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
zold "
KÉSZ! A weboldal fut a VPS-en.

Utolsó lépés a RackHost DNS zónáiban ($DOMAIN):
  1. Az üres nevű A rekord értéke legyen:   $IP
  2. A www rekord: töröld a CNAME-et, és adj hozzá:  www  A  $IP
  3. Ha van AAAA rekord üres névvel vagy www névvel, azt töröld.
  (A play rekordhoz ne nyúlj!)

Amint a DNS átmegy (pár perc – 1 óra), a https://$DOMAIN magától kap HTTPS-t.

Hasznos parancsok:
  icemine-frissites --most     azonnali frissítés a GitHubról (egyébként 5 percenként magától)
  journalctl -u icemine -f     a weboldal naplója élőben (kilépés: Ctrl+C)
  nano $APP_DIR/.env           beállítások (utána: systemctl restart icemine)
"
