#!/usr/bin/env bash
set -euo pipefail

ENV=/opt/icemine/.env
kek(){ printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }
hiba(){ printf '\n\033[1;31mHIBA: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || hiba "Rootként futtasd."
[ -f "$ENV" ] || hiba "Nem találom: $ENV. Előbb a telepites.sh kell."
command -v node >/dev/null || hiba "Nem találom a node-ot."

BPORT=$(sed -n 's/^INTERNAL_PORT=//p' "$ENV" | tail -n1); BPORT=${BPORT:-3001}
ADAT=$(curl -s -m 5 "http://127.0.0.1:$BPORT/votifier" || true)
[ -n "$ADAT" ] || hiba "Nem érem el a weboldalt (127.0.0.1:$BPORT). Fut az icemine? Nézd meg: systemctl status icemine"
mezo(){ printf '%s' "$ADAT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d);const v=process.argv[1].split(".").reduce((a,k)=>a&&a[k],o);process.stdout.write(v==null?"":String(v))})' "$1"; }
PORT=$(mezo port); TOKEN=$(mezo token); PUB=$(mezo publicKey)

if [ "${1:-}" = "teszt" ]; then
  NEV=${2:-}; [ -n "$NEV" ] || hiba "Add meg a játékosnevet: bash szavazas-eles.sh teszt JatekosNev"
  node -e '
const net=require("net"),crypto=require("crypto");const [port,token,nev]=process.argv.slice(1);
const s=net.connect(+port,"127.0.0.1");let b="";
s.on("data",d=>{b+=d;if(b.startsWith("VOTIFIER 2 ")&&b.includes("\n")&&!s.kuldve){s.kuldve=1;const ch=b.split(" ")[2].trim();
const payload=JSON.stringify({serviceName:"IceMine teszt",username:nev,address:"127.0.0.1",timestamp:Date.now(),challenge:ch});
const msg=Buffer.from(JSON.stringify({payload,signature:crypto.createHmac("sha256",token).update(payload).digest("base64")}));
const h=Buffer.alloc(4);h.writeUInt16BE(0x733a,0);h.writeUInt16BE(msg.length,2);s.write(Buffer.concat([h,msg]));b="";}
else if(s.kuldve&&b.includes("}")){console.log("Votifier válasz: "+b.trim());s.end();}});
s.on("error",e=>{console.log("Hiba: "+e.message);process.exit(1)});' "$PORT" "$TOKEN" "$NEV"
  echo "Ha a válasz {\"status\":\"ok\"}, és $NEV regisztrált a weboldalon, megkapta a jutalmat. A naplóban: journalctl -u icemine -n 5 --no-pager"
  exit 0
fi

if command -v ufw >/dev/null; then ufw allow "$PORT"/tcp >/dev/null && echo "Tűzfal: a $PORT port nyitva."; fi

DOMAIN=$(sed -n 's|^BASE_URL=https\?://||p' "$ENV" | head -n1 | cut -d/ -f1)
IP=$(curl -s -m 5 https://api.ipify.org || true)
kek "Votifier adatok a szerverlistákhoz"
echo "Ezeket kell megadni a szerverlistán, a szerver beállításainál (Votifier rész):"
echo
echo "  Votifier cím (IP / host):  ${IP:-a VPS IP címe}${DOMAIN:+   (vagy: $DOMAIN)}"
echo "  Votifier port:             $PORT"
echo "  Token (NuVotifier v2):     $TOKEN"
echo "  Public key (Votifier v1):"
echo "$PUB"
echo
echo "Ha a lista tokent kér, a tokent add meg. Ha 'public key'-t, a hosszú kulcsot."
echo "Fontos: ide a VPS (weboldal) adatai kellenek, NEM a Minecraft szerver IP-je."

kek "Szavazó linkek"
echo "Írd be az IceMine szavazó oldalának linkjét azokon a listákon, ahol fent vagytok."
echo "Ha valahol nem vagytok fent, csak nyomj Entert."
UJ=$(mktemp); cp "$ENV" "$UJ"
for SOR in "MSO|MinecraftServers.org|minecraftservers.org" "MCSL|Minecraft-Server-List|minecraft-server-list.com" "TOPG|TopG|topg.org" "BUZZ|Minecraft.Buzz|minecraft.buzz" "MCS|MC-Servers|mc-servers.com"; do
  KOD=${SOR%%|*}; MARAD=${SOR#*|}; NEV=${MARAD%%|*}; OLDAL=${MARAD#*|}
  REGI=$(sed -n "s|^VOTE_${KOD}_URL=||p" "$ENV" | tail -n1)
  read -rp "$NEV ($OLDAL) szavazó link${REGI:+ [most: $REGI]}: " LINK </dev/tty
  LINK=$(printf '%s' "$LINK" | tr -d '[:space:]')
  [ -n "$LINK" ] || continue
  case "$LINK" in https://*|http://*) ;; *) echo "  Kihagyva: a linknek https://-sel kell kezdődnie."; continue ;; esac
  grep -v -E "^\s*VOTE_${KOD}_URL\s*=" "$UJ" > "$UJ.2" || true; mv "$UJ.2" "$UJ"
  printf 'VOTE_%s_URL=%s\n' "$KOD" "$LINK" >> "$UJ"
done
cat "$UJ" > "$ENV"; rm -f "$UJ"
chown icemine:icemine "$ENV"; chmod 600 "$ENV"
systemctl restart icemine
sleep 3
journalctl -u icemine -n 40 --no-pager | grep -E "Votifier" | tail -n2 || true
echo
echo "Kész. A Szavazás oldalon megjelennek a megadott listák."
echo "Próba (a játékos kapja a jutalmat): bash /opt/icemine/szavazas-eles.sh teszt JatekosNev"
