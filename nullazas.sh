#!/usr/bin/env bash
set -euo pipefail

APP=/opt/icemine
MENTESEK=/var/lib/icemine/mentesek
kek(){ printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }
hiba(){ printf '\n\033[1;31mHIBA: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || hiba "Rootként futtasd."
[ -f "$APP/server.js" ] || hiba "Nem találom az IceMine weboldalt itt: $APP"
install -d -o icemine -g icemine -m 700 "$MENTESEK"

FIOK="${1:-}"; ALMOD=""
kek "IceMine adatok nullázása"
if [ -n "$FIOK" ]; then MOD=4; else
echo "1) Teljes nullázás: minden fiók törlődik, mindenkinek újra kell regisztrálnia."
echo "2) A fiókok megmaradnak (név, e-mail, jelszó, Discord, skin), de:"
echo "   IceCoin 0, rang default, szerencsekerék és kitiltás-csökkentés újraindul,"
echo "   a vásárlási, utalási és kitiltási előzmények törlődnek."
echo "3) Visszaállítás egy korábbi mentésből (mindenkit visszaállít)."
echo "4) Csak egy fiók."
echo
read -rp "Melyik legyen (1/2/3/4)? " MOD </dev/tty
case "$MOD" in 1|2|3|4) ;; *) hiba "1, 2, 3 vagy 4 lehet." ;; esac
fi

if [ "$MOD" = 4 ]; then
  [ -n "$FIOK" ] || read -rp "Felhasználónév: " FIOK </dev/tty
  FIOK=$(printf '%s' "$FIOK" | tr -d '[:space:]')
  [[ "$FIOK" =~ ^[A-Za-z0-9_]{3,16}$ ]] || hiba "Hibás felhasználónév."
  echo
  echo "Mit csináljak $FIOK fiókjával?"
  echo "1) Csak az IceCoin legyen 0."
  echo "2) Csak a rang legyen default."
  echo "3) Minden nullázása: IceCoin 0, rang default, szerencsekerék, kitiltás-csökkentés,"
  echo "   és a vásárlási, utalási, kitiltási előzményei törlődnek. A fiók megmarad."
  echo "4) A fiók törlése (újra regisztrálhat ugyanezzel a névvel)."
  read -rp "Melyik (1/2/3/4)? " ALMOD </dev/tty
  case "$ALMOD" in 1|2|3|4) ;; *) hiba "1, 2, 3 vagy 4 lehet." ;; esac
fi

FAJL=""
if [ "$MOD" = 3 ]; then
  mapfile -t LISTA < <(ls -1t "$MENTESEK"/adatok-*.json 2>/dev/null || true)
  [ "${#LISTA[@]}" -gt 0 ] || hiba "Még nincs mentés itt: $MENTESEK"
  i=1; for f in "${LISTA[@]}"; do echo "  $i) $(basename "$f")"; i=$((i+1)); done
  read -rp "Melyik mentés (szám)? " N </dev/tty
  [[ "$N" =~ ^[0-9]+$ ]] && [ "$N" -ge 1 ] && [ "$N" -le "${#LISTA[@]}" ] || hiba "Nincs ilyen szám."
  FAJL="${LISTA[$((N-1))]}"
  echo "Visszaállítás innen: $(basename "$FAJL") (a mostani állapotról is lesz mentés)."
fi

echo
read -rp "Biztos? Írd be nagybetűvel: NULLAZAS " OK </dev/tty
[ "$OK" = NULLAZAS ] || hiba "Megszakítva, semmi nem változott."

kek "Weboldal leállítása"
systemctl stop icemine

MOST=$(date +%Y%m%d-%H%M%S)
set +e
( cd "$APP" && runuser -u icemine -- env HOME=/var/lib/icemine MOD="$MOD" ALMOD="$ALMOD" FIOK="$FIOK" FAJL="$FAJL" MENTES="$MENTESEK/adatok-$MOST.json" node - ) <<'JS'
const fs = require("fs"), path = require("path");
try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch (e) {}
const MOD = process.env.MOD, FILE = path.resolve("data.json");
(async () => {
  let pool = null, db = { users: {}, sessions: {} };
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    const cu = new URL(process.env.DATABASE_URL);
    cu.searchParams.delete("sslmode"); cu.searchParams.delete("channel_binding");
    pool = new Pool({ connectionString: cu.toString(), ssl: { rejectUnauthorized: false }, max: 1 });
    await pool.query("create table if not exists kv (k text primary key, v text not null)");
    const r = await pool.query("select v from kv where k = 'db'");
    if (r.rows[0]) db = JSON.parse(r.rows[0].v);
  } else if (fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, "utf8"));
  let kulcs = null;
  if (MOD === "4") {
    const kis = process.env.FIOK.toLowerCase();
    kulcs = Object.keys(db.users || {}).find(k => db.users[k] && (k.toLowerCase() === kis || String(db.users[k].name || "").toLowerCase() === kis));
    if (!kulcs) { console.error("HIBA: nincs ilyen fiók: " + process.env.FIOK); process.exit(1); }
  }
  fs.writeFileSync(process.env.MENTES, JSON.stringify(db), { mode: 0o600 });
  console.log("Mentés kész: " + process.env.MENTES);
  const fiokok = Object.keys(db.users || {}).length;
  if (MOD === "1") {
    db.users = {}; db.sessions = {};
    db.transfers = []; db.purchases = []; db.unbans = [];
    console.log("Törölve: " + fiokok + " fiók és minden előzmény.");
  } else if (MOD === "2") {
    for (const u of Object.values(db.users || {})) {
      if (!u) continue;
      u.coins = 0; u.rank = "default";
      for (const k of ["rankUntil", "rankSince", "lastSpin", "unbanLast", "unbanItem"]) delete u[k];
    }
    db.transfers = []; db.purchases = []; db.unbans = [];
    console.log("Nullázva: " + fiokok + " fiók (IceCoin, rang, kerék, kitiltás, előzmények).");
  } else if (MOD === "4") {
    const u = db.users[kulcs], A = process.env.ALMOD, nev = u.name;
    const elozmenyTorles = () => {
      db.purchases = (db.purchases || []).filter(x => x.user !== nev);
      db.unbans = (db.unbans || []).filter(x => x.uid !== u.id && x.user !== nev);
      db.transfers = (db.transfers || []).filter(x => x.from !== nev && x.to !== nev);
    };
    if (A === "1") { console.log(nev + ": " + (u.coins || 0) + " IceCoin -> 0."); u.coins = 0; }
    else if (A === "2") { console.log(nev + ": " + (u.rank || "default") + " rang -> default."); u.rank = "default"; delete u.rankUntil; delete u.rankSince; }
    else if (A === "3") {
      u.coins = 0; u.rank = "default";
      for (const k of ["rankUntil", "rankSince", "lastSpin", "unbanLast", "unbanItem"]) delete u[k];
      elozmenyTorles();
      console.log(nev + " fiókja nullázva.");
    } else {
      elozmenyTorles();
      for (const [h, x] of Object.entries(db.sessions || {})) if (x && x.k === kulcs) delete db.sessions[h];
      delete db.users[kulcs];
      if (u.id) try { fs.unlinkSync(path.join("skins", u.id + ".png")); } catch (e) {}
      console.log(nev + " fiókja törölve.");
    }
  } else {
    const regi = db;
    db = JSON.parse(fs.readFileSync(process.env.FAJL, "utf8"));
    if (regi.payments) db.payments = Object.assign({}, db.payments || {}, regi.payments);
    console.log("Visszaállítva: " + Object.keys(db.users || {}).length + " fiók.");
  }
  if (pool) { await pool.query("insert into kv (k, v) values ('db', $1) on conflict (k) do update set v = excluded.v", [JSON.stringify(db)]); await pool.end(); }
  else fs.writeFileSync(FILE, JSON.stringify(db));
})().catch(e => { console.error("HIBA: " + e.message); process.exit(1); });
JS
EREDMENY=$?
set -e

if [ "$EREDMENY" = 0 ] && [ "$MOD" = 1 ] && [ -d "$APP/skins" ]; then
  tar -czf "$MENTESEK/skinek-$MOST.tar.gz" -C "$APP" skins 2>/dev/null && chown icemine:icemine "$MENTESEK/skinek-$MOST.tar.gz" && chmod 600 "$MENTESEK/skinek-$MOST.tar.gz"
  find "$APP/skins" -type f -name '*.png' -delete
fi
if [ "$EREDMENY" = 0 ] && [ "$MOD" = 3 ]; then
  IDO=$(basename "$FAJL" .json | sed 's/^adatok-//'); SK=""
  for f in $(ls -1 "$MENTESEK"/skinek-*.tar.gz 2>/dev/null | sort); do
    t=$(basename "$f" .tar.gz | sed 's/^skinek-//'); [[ "$t" > "$IDO" || "$t" == "$IDO" ]] && { SK="$f"; break; }
  done
  [ -n "$SK" ] && tar -xzf "$SK" -C "$APP" && chown -R icemine:icemine "$APP/skins" && echo "Skinek is visszaállítva."
fi

kek "Weboldal indítása"
systemctl start icemine
[ "$EREDMENY" = 0 ] || hiba "Nem sikerült, az adatok nem változtak. A weboldal újraindult."
echo
[ "$MOD" = 4 ] && [ "$ALMOD" != 1 ] && echo "Ha mégis vissza kell állítani, a mentés itt van: $MENTESEK/adatok-$MOST.json"
echo "Kész. A Discord rangokat a bot kb. 2 percen belül igazítja."
echo "A Stripe fizetési azonosítók megmaradtak, így egy régi fizetést senki nem kaphat meg újra."
