#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-idealtherm.hu}"
DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN#http://}; DOMAIN=${DOMAIN#www.}; DOMAIN=${DOMAIN%%/*}
REPO=https://github.com/ingyen-200-koveto/Idealtherm
APP_DIR=/opt/idealtherm
APP_USER=idealtherm
APP_HOME=/var/lib/idealtherm
CONF=/etc/caddy/idealtherm.caddy

piros(){ printf '\033[1;31m%s\033[0m\n' "$*"; }
zold(){ printf '\033[1;32m%s\033[0m\n' "$*"; }
kek(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
hiba(){ piros "HIBA: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || hiba "Rootként futtasd."
command -v caddy >/dev/null 2>&1 || hiba "Nincs Caddy a gépen."
[ -f /etc/caddy/Caddyfile ] || hiba "Nincs /etc/caddy/Caddyfile."
command -v git >/dev/null 2>&1 || { apt-get update -y >/dev/null && apt-get install -y git >/dev/null; }
cd /
as_app(){ runuser -u "$APP_USER" -- env HOME="$APP_HOME" GIT_TERMINAL_PROMPT=0 "$@"; }

kek "Weboldal letöltése a GitHubról"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_HOME"
if [ -d "$APP_DIR/.git" ]; then
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  as_app git -C "$APP_DIR" fetch --quiet origin
  as_app git -C "$APP_DIR" reset --hard --quiet origin/main
else
  [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ] && hiba "$APP_DIR már létezik, de nem GitHub-tároló."
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  as_app git clone --quiet "$REPO" "$APP_DIR" || hiba "Nem sikerült letölteni: $REPO"
fi
[ -f "$APP_DIR/index.html" ] || hiba "A tárolóban nincs index.html."
chmod 755 "$APP_DIR"

kek "Automatikus frissítés beállítása (5 percenként)"
cat > /usr/local/bin/idealtherm-frissites <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
as_app(){ runuser -u idealtherm -- env HOME=/var/lib/idealtherm GIT_TERMINAL_PROMPT=0 "$@"; }
cd /opt/idealtherm
as_app git fetch --quiet origin
if [ "$(as_app git rev-parse HEAD)" != "$(as_app git rev-parse origin/main)" ] || [ "${1:-}" = "--most" ]; then
  as_app git reset --hard --quiet origin/main
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
systemctl daemon-reload
systemctl enable --now --quiet idealtherm-frissites.timer

kek "HTTPS beállítása: $DOMAIN"
[ -f "$CONF" ] && cp "$CONF" "$CONF.regi"
cat > "$CONF" <<EOF
$DOMAIN, www.$DOMAIN {
	encode zstd gzip
	root * $APP_DIR
	@rejtett path /.git /.git/* /telepites.sh /README.md
	respond @rejtett 404
	@nemfont not path /fonts/*
	header @nemfont Cache-Control "no-cache"
	header /fonts/* Cache-Control "public, max-age=31536000"
	try_files {path} /index.html
	file_server
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

zold "
KÉSZ! Az Idealtherm weboldal fut: https://$DOMAIN

A GitHubról 5 percenként magától frissül.
Azonnali frissítés:  idealtherm-frissites --most
"
