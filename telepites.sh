#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-idealtherm.hu}"
DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN#http://}; DOMAIN=${DOMAIN#www.}; DOMAIN=${DOMAIN%%/*}
REPO=https://github.com/ingyen-200-koveto/IceMineWeb
BRANCH=idealtherm
APP_DIR=/opt/idealtherm
APP_USER=idealtherm
APP_HOME=/var/lib/idealtherm
CONF=/etc/caddy/idealtherm.caddy
UZENET_PORT=3100

piros(){ printf '\033[1;31m%s\033[0m\n' "$*"; }
zold(){ printf '\033[1;32m%s\033[0m\n' "$*"; }
kek(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
hiba(){ piros "HIBA: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || hiba "Rootként futtasd."
command -v caddy >/dev/null 2>&1 || hiba "Nincs Caddy a gépen."
[ -f /etc/caddy/Caddyfile ] || hiba "Nincs /etc/caddy/Caddyfile."
command -v git >/dev/null 2>&1 || { apt-get update -y >/dev/null && apt-get install -y git >/dev/null; }
node_ok(){ command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
node_ok || { apt-get update -y >/dev/null && apt-get install -y nodejs >/dev/null || true; }
node_ok || hiba "Legalább 18-as Node.js kell a kapcsolat űrlaphoz."
NODE_BIN=$(command -v node)
cd /
as_app(){ runuser -u "$APP_USER" -- env HOME="$APP_HOME" GIT_TERMINAL_PROMPT=0 "$@"; }

kek "Weboldal letöltése a GitHubról"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_HOME"
if [ -d "$APP_DIR/.git" ]; then
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  as_app git -C "$APP_DIR" remote set-url origin "$REPO"
  as_app git -C "$APP_DIR" fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
  as_app git -C "$APP_DIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
  as_app git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
else
  [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ] && hiba "$APP_DIR már létezik, de nem GitHub-tároló."
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  as_app git clone --quiet --branch "$BRANCH" --single-branch "$REPO" "$APP_DIR" || hiba "Nem sikerült letölteni: $REPO ($BRANCH)"
fi
[ -f "$APP_DIR/index.html" ] || hiba "A tárolóban nincs index.html."
chmod 755 "$APP_DIR"

kek "Automatikus frissítés beállítása (5 percenként)"
cat > /usr/local/bin/idealtherm-frissites <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
as_app(){ runuser -u idealtherm -- env HOME=/var/lib/idealtherm GIT_TERMINAL_PROMPT=0 "$@"; }
cd /opt/idealtherm
AG=$(as_app git rev-parse --abbrev-ref HEAD)
as_app git fetch --quiet origin "+refs/heads/$AG:refs/remotes/origin/$AG"
if [ "$(as_app git rev-parse HEAD)" != "$(as_app git rev-parse "origin/$AG")" ] || [ "${1:-}" = "--most" ]; then
  VALTOZOTT=$(as_app git diff --name-only HEAD "origin/$AG" -- szerver)
  as_app git reset --hard --quiet "origin/$AG"
  if [ -n "$VALTOZOTT" ] || [ "${1:-}" = "--most" ]; then systemctl restart idealtherm-uzenet || true; fi
  echo "Idealtherm frissítve: $(as_app git log -1 --format='%h %s')"
else
  echo "Nincs új változás a GitHubon."
fi
EOF
chmod 755 /usr/local/bin/idealtherm-frissites
cat > /etc/systemd/system/idealtherm-frissites.service <<'EOF'
[Unit]
Description=Idealtherm weboldal frissítése a GitHubról
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/idealtherm-frissites
EOF
cat > /etc/systemd/system/idealtherm-frissites.timer <<'EOF'
[Unit]
Description=Idealtherm weboldal frissítése 5 percenként

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
kek "Kapcsolat űrlap szolgáltatás"
if ss -ltn 2>/dev/null | grep -q "127.0.0.1:$UZENET_PORT " && ! systemctl is-active --quiet idealtherm-uzenet; then
  hiba "A $UZENET_PORT port már foglalt. Írd át a UZENET_PORT értékét a telepítő elején."
fi
cat > /etc/systemd/system/idealtherm-uzenet.service <<UNIT
[Unit]
Description=Idealtherm kapcsolat urlap (e-mail kuldes)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/szerver
ExecStart=$NODE_BIN uzenet.js
Environment=PORT=$UZENET_PORT
Environment=HOST=127.0.0.1
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now --quiet idealtherm-frissites.timer
systemctl enable --quiet idealtherm-uzenet
systemctl restart idealtherm-uzenet

kek "HTTPS beállítása: $DOMAIN"
[ -f "$CONF" ] && cp "$CONF" "$CONF.regi"
cat > "$CONF" <<EOF
$DOMAIN, www.$DOMAIN {
	encode zstd gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:$UZENET_PORT
	}
	handle {
		root * $APP_DIR
		@rejtett path /.git /.git/* /szerver /szerver/* /telepites.sh /email-beallitas.sh /README.md
		respond @rejtett 404
		@nemfont not path /fonts/*
		header @nemfont Cache-Control "no-cache"
		header /fonts/* Cache-Control "public, max-age=31536000"
		try_files {path} /index.html
		file_server
	}
}
EOF
UJ_IMPORT=""
if ! grep -qF 'import /etc/caddy/*.caddy' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.idealtherm-elott
  printf '\nimport /etc/caddy/*.caddy\n' >> /etc/caddy/Caddyfile
  UJ_IMPORT=1
fi
if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/idealtherm-caddy.txt 2>&1; then
  tail -n 5 /tmp/idealtherm-caddy.txt || true
  if [ -f "$CONF.regi" ]; then mv "$CONF.regi" "$CONF"; else rm -f "$CONF"; fi
  [ -n "$UJ_IMPORT" ] && mv /etc/caddy/Caddyfile.idealtherm-elott /etc/caddy/Caddyfile
  hiba "A Caddy beállítás hibás lett, visszaállítottam az előzőt."
fi
rm -f "$CONF.regi" /etc/caddy/Caddyfile.idealtherm-elott /tmp/idealtherm-caddy.txt
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if [ ! -f /var/lib/idealtherm/uzenet.env ]; then
  VALASZ=""
  read -r -p "Beállítod most a kapcsolat űrlap e-mail küldését? (i/n) [i]: " VALASZ </dev/tty || true
  if [ "${VALASZ:-i}" = "i" ]; then
    bash "$APP_DIR/email-beallitas.sh" || piros "Az e-mail beállítás nem sikerült. Később újra futtathatod: bash $APP_DIR/email-beallitas.sh"
  fi
fi

zold "
KÉSZ! Az Idealtherm weboldal fut: https://$DOMAIN

A GitHubról 5 percenként magától frissül.
Azonnali frissítés:              idealtherm-frissites --most
E-mail küldés újbóli beállítása: bash $APP_DIR/email-beallitas.sh
"
