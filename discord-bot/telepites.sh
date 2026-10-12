#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/icemine-bot
APP_USER=icemine-bot
APP_HOME=/var/lib/icemine-bot
BOT_DIR=$APP_DIR/discord-bot
REPO=https://github.com/ingyen-200-koveto/IceMineWeb
JOGOK=1099780582486

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

[ "$(id -u)" -eq 0 ] || hiba "Rootként futtasd (pl. sudo bash bot.sh)."
command -v apt-get >/dev/null 2>&1 || hiba "Ez a telepítő Ubuntura vagy Debianra készült."
export DEBIAN_FRONTEND=noninteractive
cd /
as_app(){ runuser -u "$APP_USER" -- env HOME="$APP_HOME" GIT_TERMINAL_PROMPT=0 "$@"; }

kek "Beállítások"
TOKEN="" BEDROCK="" WEB="" KEEP="n"
if [ -f "$APP_DIR/.env" ]; then
  kerdez KEEP "Már van telepítés. Megtartod a meglévő beállításokat? (i/n)" "i"
fi
if [ "$KEEP" != "i" ]; then
  echo "Másold be a bot tokenjét (Developer Portal > Bot > Reset Token)."
  echo "Beillesztés után a token nem látszik, ez így normális. Utána nyomj Entert."
  read -r -s -p "Token: " TOKEN </dev/tty || true
  echo
  TOKEN=$(printf '%s' "$TOKEN" | tr -d '[:space:]')
  [[ "$TOKEN" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]] || hiba "Ez nem bot tokennek néz ki. Másold ki újra: Developer Portal > Bot > Reset Token."
  kerdez BEDROCK "Bedrock port (Enter = a bot nem írja ki)"
  BEDROCK=$(printf '%s' "$BEDROCK" | tr -cd '0-9')
  kerdez WEB "Weboldal címe" "https://icemine.hu"
  case "$WEB" in http://*|https://*) ;; *) WEB="https://$WEB" ;; esac
else
  TOKEN=$(sed -n 's/^DISCORD_TOKEN=//p' "$APP_DIR/.env" | head -n1)
fi

kek "Rendszercsomagok telepítése"
apt-get update -y
apt-get install -y curl ca-certificates git gnupg

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

kek "Bot letöltése a GitHubról"
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
  as_app git clone --quiet "$REPO" "$APP_DIR" || hiba "Nem sikerült letölteni: $REPO"
fi
[ -f "$BOT_DIR/index.js" ] || hiba "A tárolóban nincs discord-bot/index.js."

if [ "$KEEP" != "i" ]; then
  kek "Beállítások mentése"
  umask 077
  {
    printf 'DISCORD_TOKEN=%s\n' "$TOKEN"
    printf 'DATA_DIR=%s\n' "$APP_HOME"
    printf 'WEBOLDAL=%s\n' "$WEB"
    [ -n "$BEDROCK" ] && printf 'BEDROCK_PORT=%s\n' "$BEDROCK"
    true
  } > "$APP_DIR/.env"
  umask 022
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"

kek "Függőségek telepítése (npm)"
as_app bash -c "cd '$BOT_DIR' && npm install --omit=dev --no-audit --no-fund"

kek "Automatikus indítás beállítása"
NODE_BIN=$(command -v node)
cat > /etc/systemd/system/icemine-bot.service <<EOF
[Unit]
Description=IceMine Discord bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$BOT_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$NODE_BIN index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > /usr/local/bin/icemine-bot-frissites <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
as_app(){ runuser -u icemine-bot -- env HOME=/var/lib/icemine-bot GIT_TERMINAL_PROMPT=0 "$@"; }
cd /opt/icemine-bot
as_app git fetch --quiet origin
REF=$(as_app git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo origin/main)
VALTOZOTT=$(as_app git diff --name-only HEAD "$REF" -- discord-bot)
as_app git reset --hard --quiet "$REF"
if [ -n "$VALTOZOTT" ] || [ "${1:-}" = "--most" ]; then
  as_app bash -c "cd discord-bot && npm install --omit=dev --no-audit --no-fund --silent"
  systemctl restart icemine-bot
  echo "IceMine bot frissítve: $(as_app git log -1 --format='%h %s')"
else
  echo "Nincs új változás a botban."
fi
EOF
chmod 755 /usr/local/bin/icemine-bot-frissites

cat > /etc/systemd/system/icemine-bot-frissites.service <<'EOF'
[Unit]
Description=IceMine bot frissítés a GitHubról
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/icemine-bot-frissites
EOF
cat > /etc/systemd/system/icemine-bot-frissites.timer <<'EOF'
[Unit]
Description=IceMine bot frissítés 5 percenként

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --quiet icemine-bot icemine-bot-frissites.timer
START=$(date '+%Y-%m-%d %H:%M:%S')
systemctl restart icemine-bot
systemctl start icemine-bot-frissites.timer

kek "Ellenőrzés"
ok=""
for _ in $(seq 1 40); do
  NAPLO=$(journalctl -u icemine-bot --since "$START" -o cat --no-pager 2>/dev/null || true)
  if grep -q "IceMine bot elindult" <<<"$NAPLO"; then ok=1; break; fi
  if grep -q "HIBA:" <<<"$NAPLO"; then break; fi
  sleep 1
done
if [ -z "$ok" ]; then
  piros "A bot nem indult el. Az utolsó naplósorok:"
  journalctl -u icemine-bot --since "$START" -n 20 -o cat --no-pager || true
  piros "
Javítás után futtasd újra ezt a telepítőt (a meglévő beállításokra válaszolj n-nel, ha új tokent adsz meg)."
  exit 1
fi
sleep 3

B64=$(printf '%s' "${TOKEN%%.*}" | tr '_-' '/+')
while [ $(( ${#B64} % 4 )) -ne 0 ]; do B64="$B64="; done
CID=$(printf '%s' "$B64" | base64 -d 2>/dev/null || true)
if [[ "$CID" =~ ^[0-9]{17,20}$ ]]; then
  MEGHIVO="https://discord.com/oauth2/authorize?client_id=$CID&permissions=$JOGOK&scope=bot%20applications.commands"
else
  MEGHIVO=$(journalctl -u icemine-bot --since "$START" -o cat --no-pager | sed -n 's/^Meghívó link: //p' | tail -n1)
fi

zold "
KÉSZ! Az IceMine bot fut a VPS-en.

1. Hívd meg a botot a Discord szerveredre ezzel a linkkel:
   $MEGHIVO

2. Discordon: Szerverbeállítások > Rangok. Húzd az IceMine rangot
   a lista tetejére, közvetlenül a saját admin rangod alá.

3. Állítsd be a botot a Discordon, ezekkel a parancsokkal:
   /beallitas udvozlo   /beallitas otletek   /beallitas naplo
   /beallitas ticket    majd: /ticket-panel
   Ha kell: /beallitas autorang   /beallitas szamlalo

Hasznos parancsok:
  icemine-bot-frissites --most     azonnali frissítés a GitHubról (egyébként 5 percenként magától)
  journalctl -u icemine-bot -f     a bot naplója élőben (kilépés: Ctrl+C)
  systemctl restart icemine-bot    a bot újraindítása
"
