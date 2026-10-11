const express = require("express"), crypto = require("crypto"), fs = require("fs"), path = require("path");

let envFound = false;
try {
  const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  envFound = true;
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch (e) {}
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));

const FILE = path.join(__dirname, "data.json");
let db = { users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) {}
db.users = Object.assign(Object.create(null), db.users || {});
db.sessions = db.sessions || {};

let pool = null;
if (process.env.DATABASE_URL) {
  const { Pool } = require("pg");
  const cu = new URL(process.env.DATABASE_URL);
  cu.searchParams.delete("sslmode"); cu.searchParams.delete("channel_binding");
  pool = new Pool({ connectionString: cu.toString(), ssl: { rejectUnauthorized: false }, max: 3 });
  pool.on("error", e => console.error("DB hiba:", e.message));
}
let saving = false, dirty = false;
async function flush() {
  if (saving) { dirty = true; return; }
  saving = true;
  try { await pool.query("insert into kv (k, v) values ('db', $1) on conflict (k) do update set v = excluded.v", [JSON.stringify(db)]); }
  catch (e) { console.error("Mentési hiba:", e.message); }
  saving = false;
  if (dirty) { dirty = false; flush(); }
}
const save = () => {
  if (pool) return flush();
  try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch (e) { console.error("Mentési hiba:", e.message); }
};
async function boot() {
  if (pool) {
    await pool.query("create table if not exists kv (k text primary key, v text not null)");
    const r = await pool.query("select v from kv where k = 'db'");
    if (r.rows[0]) db = JSON.parse(r.rows[0].v);
    db.users = Object.assign(Object.create(null), db.users || {});
    db.sessions = db.sessions || {};
  }
  const port = process.env.PORT || process.env.SERVER_PORT || 3000, host = process.env.HOST;
  const certFile = path.join(__dirname, "cert.pem"), keyFile = path.join(__dirname, "key.pem");
  const tls = fs.existsSync(certFile) && fs.existsSync(keyFile);
  const server = tls ? require("https").createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, app) : require("http").createServer(app);
  const ready = () => { console.log("IceMine fut" + (pool ? " (adatbázissal)" : " (fájllal)") + (tls ? ", HTTPS" : ", HTTP") + ", port: " + port); checkMail().catch(e => console.log("E-mail: ellenőrzési hiba – " + e.message)); };
  host ? server.listen(port, host, ready) : server.listen(port, ready);
}

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 12 }, () => ALPH[crypto.randomInt(ALPH.length)]).join("");
const mask = e => e.replace(/^(.).*(@.*)$/, "$1***$2");
const pub = u => ({ name: u.name, email: u.email, coins: u.coins || 0, created: u.created, rank: u.rank || "default" });
const fail = (res, code, error) => res.status(code).json({ error });

const hits = {};
const limit = (max, ms) => (req, res, next) => {
  const k = req.ip + req.path, n = Date.now();
  hits[k] = (hits[k] || []).filter(t => n - t < ms);
  if (hits[k].length >= max) return fail(res, 429, "Túl sok kérés. Próbáld később.");
  hits[k].push(n); next();
};

const BREVO_KEY = String(process.env.BREVO_API_KEY || "").replace(/[^\w-]/g, "");
const MAIL_FROM = (String(process.env.MAIL_FROM || "").match(/[^\s<>"'“”„]+@[^\s<>"'“”„]+\.[^\s<>"'“”„]+/) || [""])[0];
const brevo = (p, opt = {}) => fetch("https://api.brevo.com/v3" + p, { ...opt, headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" }, signal: AbortSignal.timeout(15000) });
const netErr = e => (e && e.cause && (e.cause.code || e.cause.message)) || (e && e.name === "TimeoutError" ? "időtúllépés" : e && e.message) || "ismeretlen hiba";
function mailHelp(status, body) {
  let msg = "";
  try { msg = JSON.parse(body).message || body; } catch (e) { msg = String(body || ""); }
  msg = String(msg).slice(0, 220);
  if (/unrecogni[sz]ed ip|authori[sz]ed[_ ]ips?/i.test(msg)) return "a Brevo letiltotta ennek a szervernek az IP-címét. Engedélyezd: Brevo > jobb fent a neved > Security > Authorised IPs, ott add hozzá a szerver IP-jét, vagy kapcsold ki az IP-szűrést. [" + msg + "]";
  if (status === 401) return "a Brevo nem fogadja el a kulcsot (rossz, törölt vagy nem API kulcs). Készíts újat: Brevo > SMTP & API > API Keys (xkeysib- kezdetű), írd a .env-be, majd Restart. [" + msg + "]";
  if (/sender/i.test(msg)) return "a feladó cím (MAIL_FROM) nincs megerősítve a Brevóban: Brevo > Senders, Domains & Dedicated IPs > Senders. [" + msg + "]";
  if (/activat|suspend|blocked|permission/i.test(msg)) return "a Brevo fiókod nem küldhet e-mailt (nincs aktiválva vagy fel van függesztve), nézd meg a Brevo fiókodat. [" + msg + "]";
  return "Brevo " + status + ": " + msg;
}
async function sendMail({ to, subject, text, html }) {
  if (!BREVO_KEY || !MAIL_FROM) throw new Error("az e-mail küldés nincs beállítva (BREVO_API_KEY és MAIL_FROM kell a .env fájlba).");
  let r;
  try { r = await brevo("/smtp/email", { method: "POST", body: JSON.stringify({ sender: { name: "IceMine", email: MAIL_FROM }, to: [{ email: to }], subject, textContent: text, htmlContent: html }) }); }
  catch (e) { throw new Error("a szerver nem éri el a Brevót (" + netErr(e) + ")."); }
  if (!r.ok) throw new Error(mailHelp(r.status, await r.text()));
}
async function checkMail() {
  const say = t => console.log("E-mail: " + t);
  if (!envFound) say("nem találom a .env fájlt a server.js mellett (pontosan .env legyen a neve, ugyanabban a mappában).");
  if (!BREVO_KEY || !MAIL_FROM) return say("NINCS BEÁLLÍTVA, hiányzik: " + [!BREVO_KEY && "BREVO_API_KEY", !MAIL_FROM && "MAIL_FROM"].filter(Boolean).join(", ") + ".");
  if (typeof fetch !== "function") return say("HIBA – túl régi a Node.js (" + process.version + "). A Startup fülön a Node verzió legyen 22.");
  if (BREVO_KEY.startsWith("xsmtpsib-")) return say("HIBA – ez SMTP kulcs, nem API kulcs. Brevo > SMTP & API > API Keys fülön készíts xkeysib- kezdetűt.");
  if (!BREVO_KEY.startsWith("xkeysib-")) say("figyelem: a kulcs nem xkeysib- kezdetű, lehet, hogy nem a teljes API kulcsot másoltad be.");
  let r;
  try { r = await brevo("/account"); } catch (e) { return say("HIBA – a szerver nem éri el a Brevót (" + netErr(e) + ")."); }
  if (!r.ok) return say("HIBA – " + mailHelp(r.status, await r.text()));
  try {
    const s = await brevo("/senders");
    if (s.ok) {
      const hit = ((await s.json()).senders || []).find(x => String(x.email).toLowerCase() === MAIL_FROM.toLowerCase());
      if (!hit) return say("figyelem: a feladó cím (" + mask(MAIL_FROM) + ") nincs a Brevo feladói között. Add hozzá: Brevo > Senders, Domains & Dedicated IPs > Senders.");
      if (hit.active === false) return say("figyelem: a feladó cím (" + mask(MAIL_FROM) + ") még nincs megerősítve a Brevóban, nézd meg a postafiókját.");
    }
  } catch (e) {}
  say("rendben, a Brevo kapcsolat működik (feladó: " + mask(MAIL_FROM) + ").");
}
const base = req => process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || req.protocol + "://" + req.get("host");

async function sendCode(req, u, code) {
  const link = base(req) + "/?megerosites=" + u.name + ":" + code;
  const text = `Kedves ${u.name}!\nKöszönjük, hogy regisztráltál weboldalunkon!\nKattints a linkre, hogy megerősítsd a fiókod.\n${link}\nvagy a megerősítő oldalon az alábbi kódot másold/írd be.\n${code}\nÜdvözlettel, IceMine csapata!`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;background:#f2f8fc;color:#0a1e2b"><h2 style="margin:0 0 16px;color:#0b3a5b">IceMine</h2><p>Kedves <b>${u.name}</b>!</p><p>Köszönjük, hogy regisztráltál weboldalunkon!</p><p>Kattints a linkre, hogy megerősítsd a fiókod.</p><p><a href="${link}" style="display:inline-block;padding:12px 22px;background:#1c8ad6;color:#fff;border-radius:999px;text-decoration:none;font-weight:bold">Fiók megerősítése</a></p><p>vagy a megerősítő oldalon az alábbi kódot másold/írd be.</p><p style="font-size:24px;letter-spacing:3px;font-weight:bold;background:#fff;padding:14px;border-radius:10px;text-align:center">${code}</p><p>Üdvözlettel,<br>IceMine csapata!</p></div>`;
  await sendMail({ to: u.email, subject: "IceMine – fiók megerősítése", text, html });
}
async function sendReset(req, u, code) {
  const link = base(req) + "/?jelszo=" + u.name + ":" + code;
  const text = `Kedves ${u.name}!\nJelszó-visszaállítást kértél az IceMine fiókodhoz.\nKattints a linkre az új jelszó megadásához.\n${link}\nvagy a visszaállítás oldalon az alábbi kódot írd be.\n${code}\nA kód 1 óráig érvényes. Ha nem te kérted, hagyd figyelmen kívül ezt a levelet.\nÜdvözlettel, IceMine csapata!`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;background:#f2f8fc;color:#0a1e2b"><h2 style="margin:0 0 16px;color:#0b3a5b">IceMine</h2><p>Kedves <b>${u.name}</b>!</p><p>Jelszó-visszaállítást kértél az IceMine fiókodhoz.</p><p>Kattints a linkre az új jelszó megadásához.</p><p><a href="${link}" style="display:inline-block;padding:12px 22px;background:#1c8ad6;color:#fff;border-radius:999px;text-decoration:none;font-weight:bold">Új jelszó megadása</a></p><p>vagy a visszaállítás oldalon az alábbi kódot írd be.</p><p style="font-size:24px;letter-spacing:3px;font-weight:bold;background:#fff;padding:14px;border-radius:10px;text-align:center">${code}</p><p>A kód 1 óráig érvényes. Ha nem te kérted, hagyd figyelmen kívül ezt a levelet.</p><p>Üdvözlettel,<br>IceMine csapata!</p></div>`;
  await sendMail({ to: u.email, subject: "IceMine – jelszó-visszaállítás", text, html });
}
async function issue(req, u) {
  const code = makeCode();
  u.v = { h: sha(u.salt + code), exp: Date.now() + 864e5, tries: 0, sent: Date.now() };
  save();
  await sendCode(req, u, code);
}
function verifyCode(key, code) {
  const u = db.users[key];
  if (!u || !u.v) return "Ehhez a fiókhoz nincs függő megerősítés.";
  if (Date.now() > u.v.exp) return "A kód lejárt. Kérj újat.";
  if (u.v.tries >= 5) return "Túl sok hibás próbálkozás. Kérj új kódot.";
  if (!same(u.v.h, sha(u.salt + String(code).toUpperCase()))) { u.v.tries++; save(); return "Hibás kód."; }
  u.verified = true; delete u.v; save(); return "";
}
function session(u) {
  const t = crypto.randomBytes(32).toString("hex");
  db.sessions[sha(t)] = { k: u.name.toLowerCase(), exp: Date.now() + 30 * 864e5 };
  save(); return t;
}
function authUser(req) {
  const t = (req.headers.authorization || "").slice(7);
  const s = t && db.sessions[sha(t)];
  return s && s.exp > Date.now() ? db.users[s.k] || null : null;
}
const taken = (u) => u && (u.verified || (u.v && u.v.exp > Date.now()));

app.post("/api/register", limit(10, 36e5), async (req, res) => {
  const { name = "", email = "", password = "" } = req.body || {};
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return fail(res, 400, "A felhasználónév 3–16 karakter lehet: betű, szám, aláhúzás.");
  if (typeof email !== "string" || email.length > 100 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, "Adj meg érvényes e-mail címet.");
  if (typeof password !== "string" || password.length < 6 || password.length > 100) return fail(res, 400, "A jelszó legalább 6 karakter legyen.");
  const key = name.toLowerCase(), mail = email.toLowerCase();
  if (taken(db.users[key])) return fail(res, 409, "Ez a felhasználónév már foglalt.");
  if (Object.values(db.users).some(x => x.email === mail && taken(x))) return fail(res, 409, "Ezzel az e-mail címmel már van fiók.");
  const salt = crypto.randomBytes(16).toString("hex");
  const u = db.users[key] = { name, email: mail, salt, hash: hashPw(password, salt), verified: false, coins: Number(process.env.START_COINS) || 0, created: Date.now() };
  try { await issue(req, u); }
  catch (e) { delete db.users[key]; save(); console.error("E-mail hiba: " + e.message); return fail(res, 502, "Nem sikerült elküldeni az e-mailt. Ellenőrizd a címet, vagy próbáld később."); }
  res.json({ ok: true, mail: mask(u.email) });
});

app.post("/api/verify", limit(30, 6e5), (req, res) => {
  const { name = "", code = "" } = req.body || {};
  const key = String(name).toLowerCase(), err = verifyCode(key, code);
  if (err) return fail(res, 400, err);
  const u = db.users[key];
  res.json({ ok: true, token: session(u), user: pub(u) });
});

app.post("/api/resend", limit(10, 6e5), async (req, res) => {
  const u = db.users[String((req.body || {}).name || "").toLowerCase()];
  if (!u || u.verified) return res.json({ ok: true });
  if (u.v && Date.now() - u.v.sent < 3e4) return fail(res, 429, "Várj fél percet az új kód kérése előtt.");
  try { await issue(req, u); } catch (e) { console.error("E-mail hiba: " + e.message); return fail(res, 502, "Nem sikerült elküldeni az e-mailt."); }
  res.json({ ok: true, mail: mask(u.email) });
});

app.post("/api/login", limit(30, 6e5), async (req, res) => {
  const { name = "", password = "" } = req.body || {};
  const u = db.users[String(name).toLowerCase()];
  if (!u || typeof password !== "string" || !same(u.hash, hashPw(password, u.salt))) return fail(res, 401, "Hibás felhasználónév vagy jelszó.");
  if (!u.verified) {
    if (!u.v || Date.now() - u.v.sent > 3e4) { try { await issue(req, u); } catch (e) { console.error("E-mail hiba: " + e.message); return fail(res, 502, "Nem sikerült elküldeni a megerősítő e-mailt."); } }
    return res.json({ needVerify: true, name: u.name, mail: mask(u.email) });
  }
  res.json({ ok: true, token: session(u), user: pub(u) });
});

const NAME_COST = 2550;
app.post("/api/change-password", limit(10, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const { oldPassword = "", newPassword = "" } = req.body || {};
  if (typeof oldPassword !== "string" || typeof newPassword !== "string" || !same(u.hash, hashPw(oldPassword, u.salt))) return fail(res, 403, "A jelenlegi jelszó hibás.");
  if (newPassword.length < 6 || newPassword.length > 100) return fail(res, 400, "Az új jelszó legalább 6 karakter legyen.");
  u.salt = crypto.randomBytes(16).toString("hex");
  u.hash = hashPw(newPassword, u.salt);
  const cur = sha((req.headers.authorization || "").slice(7)), key = u.name.toLowerCase();
  for (const h of Object.keys(db.sessions)) if (h !== cur && db.sessions[h].k === key) delete db.sessions[h];
  save();
  res.json({ ok: true, user: pub(u) });
});

app.post("/api/change-username", limit(10, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const { newName = "", password = "" } = req.body || {};
  if (typeof password !== "string" || !same(u.hash, hashPw(password, u.salt))) return fail(res, 403, "A jelszó hibás.");
  if (typeof newName !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(newName)) return fail(res, 400, "A felhasználónév 3–16 karakter lehet: betű, szám, aláhúzás.");
  if (newName === u.name) return fail(res, 400, "Ez már a jelenlegi felhasználóneved.");
  const oldKey = u.name.toLowerCase(), newKey = newName.toLowerCase();
  if (newKey !== oldKey && taken(db.users[newKey])) return fail(res, 409, "Ez a felhasználónév már foglalt.");
  if ((u.coins || 0) < NAME_COST) return fail(res, 402, "Nincs elég IceCoinod. A felhasználónév-váltás " + NAME_COST + " IceCoinba kerül.");
  u.coins -= NAME_COST;
  u.name = newName;
  if (newKey !== oldKey) {
    delete db.users[oldKey]; db.users[newKey] = u;
    for (const h of Object.keys(db.sessions)) if (db.sessions[h].k === oldKey) db.sessions[h].k = newKey;
  }
  save();
  res.json({ ok: true, user: pub(u) });
});

app.post("/api/transfer", limit(30, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const { to = "", amount, message = "" } = req.body || {};
  const r = db.users[String(to).trim().toLowerCase()];
  const n = Number(amount);
  if (!r || !r.verified) return fail(res, 404, "Nincs ilyen felhasználó.");
  if (r === u) return fail(res, 400, "Magadnak nem utalhatsz.");
  if (!Number.isInteger(n) || n < 1 || n > 1e9) return fail(res, 400, "A mennyiség pozitív egész szám legyen.");
  if (typeof message !== "string" || message.length > 100) return fail(res, 400, "Az üzenet legfeljebb 100 karakter lehet.");
  if ((u.coins || 0) < n) return fail(res, 402, "Nincs ennyi IceCoinod.");
  u.coins -= n; r.coins = (r.coins || 0) + n;
  db.transfers = db.transfers || [];
  db.transfers.push({ t: Date.now(), from: u.name, to: r.name, amount: n, msg: message.trim() });
  if (db.transfers.length > 1000) db.transfers.splice(0, db.transfers.length - 1000);
  save();
  res.json({ ok: true, user: pub(u), to: r.name });
});

const WHEEL = [0, 10, 0, 50, 100, 0, 10, 150, 0, 50];
const weekKey = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Budapest" }));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
app.get("/api/wheel", (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  res.json({ slots: WHEEL, spun: u.lastSpin === weekKey() });
});
app.post("/api/spin", limit(60, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  if (u.lastSpin === weekKey()) return fail(res, 429, "Ezen a héten már pörgettél, hétfőn újra próbálkozhatsz.");
  const slot = crypto.randomInt(WHEEL.length), prize = WHEEL[slot];
  u.lastSpin = weekKey();
  if (prize > 0) u.coins = (u.coins || 0) + prize;
  save();
  res.json({ ok: true, slot, win: prize > 0, prize, user: pub(u) });
});

const RANKS = [
  { id: "bronz", name: "Bronz", ic: 950 },
  { id: "abyss", name: "Abyss", ic: 2700 },
  { id: "iceking", name: "IceKing", ic: 4850 },
  { id: "yeti", name: "Yeti", ic: 8000 }
];
app.post("/api/buy-rank", limit(20, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const i = RANKS.findIndex(r => r.id === String((req.body || {}).rank || ""));
  if (i < 0) return fail(res, 400, "Ismeretlen rang.");
  const cur = RANKS.findIndex(r => r.name === u.rank);
  if (i <= cur) return fail(res, 409, i === cur ? "Már ez a rangod." : "Már magasabb rangod van.");
  const r = RANKS[i], bal = u.coins || 0;
  if (bal < r.ic) return fail(res, 402, "Nincs elég IceCoinod. Még " + (r.ic - bal) + " IceCoin hiányzik.");
  u.coins = bal - r.ic; u.rank = r.name; u.rankSince = Date.now();
  db.purchases = db.purchases || [];
  db.purchases.push({ t: Date.now(), user: u.name, rank: r.name, ic: r.ic });
  if (db.purchases.length > 2000) db.purchases.splice(0, db.purchases.length - 2000);
  save();
  res.json({ ok: true, user: pub(u) });
});

app.get("/api/me", (req, res) => { const u = authUser(req); u ? res.json({ user: pub(u) }) : fail(res, 401, "Nem vagy bejelentkezve."); });
app.post("/api/logout", (req, res) => { const t = (req.headers.authorization || "").slice(7); if (t) { delete db.sessions[sha(t)]; save(); } res.json({ ok: true }); });
app.get("/api/status", (req, res) => res.json({ online: null }));

app.get(["/favicon.png", "/favicon.ico"], (req, res) => res.sendFile(path.join(__dirname, "favicon.png")));
app.get("/robots.txt", (req, res) => res.type("text/plain").send("User-agent: *\nAllow: /\nDisallow: /api/\n"));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
boot().catch(e => { console.error("Indítási hiba:", e.message); process.exit(1); });
