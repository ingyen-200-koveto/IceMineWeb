#!/usr/bin/env bash
set -euo pipefail

ENV_FAJL=/var/lib/idealtherm/uzenet.env
APP_DIR=/opt/idealtherm
APP_USER=idealtherm

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

[ "$(id -u)" -eq 0 ] || hiba "Rootként futtasd."
[ -f "$APP_DIR/szerver/uzenet.js" ] || hiba "Előbb a telepítőt futtasd (telepites.sh)."
command -v node >/dev/null 2>&1 || hiba "Nincs Node.js a gépen."

kek "Kapcsolat űrlap: e-mail küldés beállítása"
echo "Az űrlap üzeneteit a weboldal a RackHostos postafiókodból küldi el."
echo "Ehhez a postafiók jelszava kell (amit a RackHoston a postafióknak adtál)."
echo
EMAIL="" SMTP="" PASS="" CEL=""
kerdez EMAIL "Postafiók" "kapcsolat@idealtherm.hu"
kerdez SMTP "Kimenő levelek szervere" "smtp.rackhost.hu"
kerdez CEL "Melyik címre érkezzenek az üzenetek" "$EMAIL"
echo "Most írd be a postafiók jelszavát. Beírás közben nem látszik, ez így normális. Utána nyomj Entert."
read -r -s -p "Jelszó: " PASS </dev/tty || true
echo
[ -n "$PASS" ] || hiba "Nem adtál meg jelszót."
[[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]] || hiba "Ez nem e-mail cím: $EMAIL"
[[ "$CEL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]] || hiba "Ez nem e-mail cím: $CEL"

kek "Próbalevél küldése ide: $CEL"
if ! ( export SMTP_HOST="$SMTP" SMTP_PORT=465 SMTP_USER="$EMAIL" SMTP_PASS="$PASS" CEL_EMAIL="$CEL"; node "$APP_DIR/szerver/uzenet.js" --proba ); then
  hiba "Nem sikerült levelet küldeni. Nézd meg, jó-e a jelszó, és létezik-e a postafiók a RackHoston, aztán futtasd újra."
fi

UJ=$(mktemp)
chmod 600 "$UJ"
( export SMTP_HOST="$SMTP" SMTP_PORT=465 SMTP_USER="$EMAIL" SMTP_PASS="$PASS" CEL_EMAIL="$CEL"
  node -e 'const k=["SMTP_HOST","SMTP_PORT","SMTP_USER","SMTP_PASS","CEL_EMAIL"];require("fs").writeFileSync(process.argv[1],k.map((x)=>x+"="+JSON.stringify(process.env[x]||"")).join("\n")+"\n")' "$UJ" )
unset PASS

install -d -o "$APP_USER" -g "$APP_USER" -m 750 /var/lib/idealtherm
mv "$UJ" "$ENV_FAJL"
chown root:"$APP_USER" "$ENV_FAJL"
chmod 640 "$ENV_FAJL"
systemctl restart idealtherm-uzenet

zold "
KÉSZ! A kapcsolat űrlap üzenetei ide érkeznek: $CEL
Nézd meg a postafiókot, ott kell lennie a próbalevélnek is.
"
