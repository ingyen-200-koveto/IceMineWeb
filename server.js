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
app.post("/api/stripe-webhook", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => stripeHook(req, res));
app.post("/api/skin", express.json({ limit: "64kb" }), (req, res) => skinLimit(req, res, () => saveSkin(req, res)));
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
  const ready = () => { console.log("IceMine fut" + (pool ? " (adatbázissal)" : " (fájllal)") + (tls ? ", HTTPS" : ", HTTP") + ", port: " + port); (async () => { await checkMail().catch(e => console.log("E-mail: ellenőrzési hiba – " + e.message)); await checkStripe().catch(e => console.log("Fizetés: ellenőrzési hiba – " + e.message)); })(); };
  host ? server.listen(port, host, ready) : server.listen(port, ready);
}

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 12 }, () => ALPH[crypto.randomInt(ALPH.length)]).join("");
const mask = e => e.replace(/^(.).*(@.*)$/, "$1***$2");
const pub = u => ({ name: u.name, email: u.email, coins: u.coins || 0, created: u.created, rank: u.rank || "default", skin: u.skin || null, unbanNext: unbanNext(u), unbanLast: u.unbanLast ? { t: u.unbanLast, item: u.unbanItem || "" } : null });
const fail = (res, code, error) => res.status(code).json({ error });

const hits = {};
const limit = (max, ms) => (req, res, next) => {
  const k = req.ip + req.path, n = Date.now();
  hits[k] = (hits[k] || []).filter(t => n - t < ms);
  if (hits[k].length >= max) return fail(res, 429, "Túl sok kérés. Próbáld később.");
  hits[k].push(n); next();
};
setInterval(() => {
  const n = Date.now();
  for (const k of Object.keys(hits)) { hits[k] = hits[k].filter(t => n - t < 36e5); if (!hits[k].length) delete hits[k]; }
}, 3e5).unref();

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
const STRIPE_KEY = String(process.env.STRIPE_SECRET_KEY || "").replace(/[^\w]/g, ""), STRIPE_WH = String(process.env.STRIPE_WEBHOOK_SECRET || "").replace(/[^\w]/g, "");
const PACKS = [[500, 499], [1000, 899], [2000, 1690], [3500, 2990], [5000, 3990], [7500, 5990], [10000, 7990], [15000, 11990]];
function formBody(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + "[" + k + "]" : k;
    if (typeof v === "object") formBody(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
  }
  return out;
}
async function stripe(method, p, params) {
  let r;
  try {
    r = await fetch("https://api.stripe.com/v1" + p, { method, headers: { authorization: "Bearer " + STRIPE_KEY, "content-type": "application/x-www-form-urlencoded" }, body: params ? formBody(params).join("&") : undefined, signal: AbortSignal.timeout(20000) });
  } catch (e) { throw new Error("a szerver nem éri el a Stripe-ot (" + netErr(e) + ")."); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("a Stripe nem fogadja el a kulcsot. Másold be újra: Stripe > Developers > API keys > Secret key.");
  if (!r.ok) throw new Error("Stripe " + r.status + ": " + String((d.error && d.error.message) || "ismeretlen hiba").slice(0, 200));
  return d;
}
function fulfill(s) {
  if (!s || s.object !== "checkout.session" || s.payment_status !== "paid") return false;
  db.payments = db.payments || {};
  if (db.payments[s.id]) return true;
  const m = s.metadata || {}, ic = Number(m.ic), ri = m.rank ? RANKS.findIndex(r => r.id === m.rank) : -1, ub = m.unban ? UNBANS.find(z => z.id === m.unban) : null;
  const u = m.uid ? Object.values(db.users).find(x => x.id === m.uid) : null;
  const okItem = m.unban ? !!ub : m.rank ? ri >= 0 : Number.isInteger(ic) && ic > 0 && ic <= 1e6;
  if (!u || !okItem) { if (m.uid) console.error("Fizetés: nem sikerült jóváírni, nincs ilyen fiók vagy termék (" + s.id + ")."); return false; }
  const rec = { t: Date.now(), uid: u.id, user: u.name, huf: (s.amount_total || 0) / 100, consent: Number(m.consent) || null, pi: s.payment_intent || null };
  if (ub) {
    rec.unban = ub.name;
    recordUnban(u, ub, "ft", { huf: rec.huf, pi: rec.pi, sid: s.id });
  } else if (m.rank) {
    const r = RANKS[ri], cur = RANKS.findIndex(x => x.name === u.rank);
    rec.rank = r.name;
    if (cur < ri) { u.rank = r.name; u.rankSince = Date.now(); console.log("Fizetés: " + u.name + " megkapta a(z) " + r.name + " rangot (" + s.id + ")."); }
    else { rec.ic = r.ic; u.coins = (u.coins || 0) + r.ic; console.log("Fizetés: " + u.name + " már " + u.rank + " rangú volt, helyette +" + r.ic + " IceCoin (" + s.id + ")."); }
  } else {
    rec.ic = ic; rec.qty = Number(m.qty) || 1; u.coins = (u.coins || 0) + ic;
    console.log("Fizetés: " + u.name + " +" + ic + " IceCoin jóváírva (" + s.id + ").");
  }
  db.payments[s.id] = rec;
  save();
  sendReceipt(u, rec, s.id).catch(e => console.error("Visszaigazoló e-mail hiba: " + e.message));
  return true;
}
async function sendReceipt(u, rec, sid) {
  const site = process.env.BASE_URL || "https://icemine.hu", when = new Date(rec.t).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
  const hu = n => n.toLocaleString("hu-HU");
  const item = rec.unban ? rec.unban : rec.rank ? rec.rank + " rang" : rec.qty > 1 ? rec.qty + " × " + hu(rec.ic / rec.qty) + " IceCoin (összesen " + hu(rec.ic) + " IceCoin)" : hu(rec.ic) + " IceCoin";
  const got = rec.unban ? "A kérésedet továbbítottuk a staffnak, a feloldást legkésőbb 24 órán belül elvégzik. Kliens ban esetén nincs feloldás, ilyenkor a vételárat visszatérítjük." : rec.rank && rec.ic ? "Mivel már " + rec.rank + " vagy magasabb rangod volt, helyette " + rec.ic.toLocaleString("hu-HU") + " IceCoint írtunk jóvá." : rec.rank ? "A(z) " + rec.rank + " rangot jóváírtuk a fiókodon." : rec.ic.toLocaleString("hu-HU") + " IceCoint jóváírtunk a fiókodon.";
  const consent = rec.unban ? "A vásárlás előtt kifejezetten kérted a szolgáltatás azonnali teljesítését, és tudomásul vetted, hogy a szolgáltatás teljesítése (a feloldás) után elveszíted a felmondási jogodat (45/2014. (II. 26.) Korm. rendelet 29. § (1) bekezdés a) pont)." : "A vásárlás előtt kifejezetten kérted a teljesítés azonnali megkezdését, és tudomásul vetted, hogy a teljesítés megkezdésével elveszíted a 14 napos elállási jogodat (45/2014. (II. 26.) Korm. rendelet 29. § (1) bekezdés m) pont).";
  const rows = [["Termék", item], ["Ár", rec.huf.toLocaleString("hu-HU") + " Ft"], ["Időpont", when], ["Fiók", u.name], ["Azonosító", rec.pi || sid]];
  const text = `Kedves ${u.name}!\nKöszönjük a vásárlást! Ezzel az e-maillel visszaigazoljuk a megrendelésedet.\n\n${rows.map(r => r[0] + ": " + r[1]).join("\n")}\n\n${got}\n\n${consent}\n\nÁSZF: ${site}/#aszf\nVisszatérítési feltételek: ${site}/#visszaterites\nKérdés esetén írj nekünk: support@icemine.hu\n\nÜdvözlettel, IceMine csapata!`;
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;background:#f2f8fc;color:#0a1e2b"><h2 style="margin:0 0 16px;color:#0b3a5b">IceMine</h2><p>Kedves <b>${esc(u.name)}</b>!</p><p>Köszönjük a vásárlást! Ezzel az e-maillel visszaigazoljuk a megrendelésedet.</p><table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px">${rows.map(r => `<tr><td style="padding:10px 14px;color:#587184">${esc(r[0])}</td><td style="padding:10px 14px;font-weight:bold;text-align:right">${esc(r[1])}</td></tr>`).join("")}</table><p>${esc(got)}</p><p style="font-size:13px;color:#587184">${esc(consent)}</p><p style="font-size:13px"><a href="${site}/#aszf">ÁSZF</a> · <a href="${site}/#visszaterites">Visszatérítési feltételek</a> · <a href="mailto:support@icemine.hu">support@icemine.hu</a></p><p>Üdvözlettel,<br>IceMine csapata!</p></div>`;
  await sendMail({ to: u.email, subject: "IceMine – visszaigazolás a vásárlásodról", text, html });
}
function stripeHook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
  const parts = String(req.get("stripe-signature") || "").split(","), t = (parts.find(x => x.startsWith("t=")) || "").slice(2);
  const ok = STRIPE_WH && t && Math.abs(Date.now() / 1000 - Number(t)) < 600 && (() => {
    const exp = crypto.createHmac("sha256", STRIPE_WH).update(Buffer.concat([Buffer.from(t + "."), raw])).digest("hex");
    return parts.some(x => x.startsWith("v1=") && same(x.slice(3), exp));
  })();
  if (!ok) return res.status(400).send("Hibás aláírás.");
  let ev;
  try { ev = JSON.parse(raw.toString("utf8")); } catch (e) { return res.status(400).send("Hibás adat."); }
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") fulfill(ev.data && ev.data.object);
  res.json({ received: true });
}
async function checkStripe() {
  const say = t => console.log("Fizetés: " + t);
  if (!STRIPE_KEY) return say("nincs beállítva (a STRIPE_SECRET_KEY hiányzik a .env fájlból).");
  if (!/^(sk|rk)_(test|live)_/.test(STRIPE_KEY)) return say("HIBA – a STRIPE_SECRET_KEY nem sk_test_ vagy sk_live_ kezdetű. Stripe > Developers > API keys > Secret key.");
  const mode = /_test_/.test(STRIPE_KEY) ? "TESZT mód" : "ÉLES mód";
  try { await stripe("GET", "/checkout/sessions?limit=1"); } catch (e) { return say("HIBA – " + e.message); }
  if (!STRIPE_WH) return say("a Stripe kapcsolat működik (" + mode + "), de a STRIPE_WEBHOOK_SECRET hiányzik, így az IceCoin csak akkor kerül jóváírásra, ha a vásárló visszatér az oldalra.");
  if (!STRIPE_WH.startsWith("whsec_")) return say("figyelem: a STRIPE_WEBHOOK_SECRET nem whsec_ kezdetű, nézd meg újra (Stripe > Webhooks > Signing secret).");
  say("rendben, a Stripe kapcsolat működik (" + mode + ").");
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
  const { name = "", email = "", password = "", accept } = req.body || {};
  if (accept !== true) return fail(res, 400, "A regisztrációhoz el kell fogadnod az ÁSZF-et és a Szabályzatot.");
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return fail(res, 400, "A felhasználónév 3–16 karakter lehet: betű, szám, aláhúzás.");
  if (typeof email !== "string" || email.length > 100 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, "Adj meg érvényes e-mail címet.");
  if (typeof password !== "string" || password.length < 6 || password.length > 100) return fail(res, 400, "A jelszó legalább 6 karakter legyen.");
  const key = name.toLowerCase(), mail = email.toLowerCase();
  if (taken(db.users[key])) return fail(res, 409, "Ez a felhasználónév már foglalt.");
  if (Object.values(db.users).some(x => x.email === mail && taken(x))) return fail(res, 409, "Ezzel az e-mail címmel már van fiók.");
  const salt = crypto.randomBytes(16).toString("hex");
  const u = db.users[key] = { name, email: mail, salt, hash: hashPw(password, salt), verified: false, coins: Number(process.env.START_COINS) || 0, created: Date.now(), accepted: { t: Date.now(), v: TERMS_VERSION } };
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

const SPIN_COST = 50;
const WHEEL = [
  { ic: 0, w: 150 }, { ic: 10, w: 100 }, { ic: 0, w: 150 }, { ic: 50, w: 100 }, { ic: 100, w: 60 },
  { ic: 0, w: 150 }, { ic: 10, w: 100 }, { ic: 150, w: 35 }, { ic: 0, w: 150 }, { rank: "bronz", w: 5 }
];
const WHEEL_TOTAL = WHEEL.reduce((a, x) => a + x.w, 0);
function pickSlot() {
  let n = crypto.randomInt(WHEEL_TOTAL);
  for (let i = 0; i < WHEEL.length; i++) { n -= WHEEL[i].w; if (n < 0) return i; }
  return 0;
}
const weekKey = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Budapest" }));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
app.get("/api/wheel", (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  res.json({ slots: WHEEL.map(x => x.rank ? { rank: RANKS.find(r => r.id === x.rank).name } : { ic: x.ic }), spun: u.lastSpin === weekKey(), cost: SPIN_COST });
});
app.post("/api/spin", limit(120, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const free = u.lastSpin !== weekKey();
  if (!free) {
    if (!(req.body || {}).paid) return fail(res, 429, "Ezen a héten már pörgettél ingyen. Újabb pörgetés " + SPIN_COST + " IceCoinba kerül.");
    if ((u.coins || 0) < SPIN_COST) return fail(res, 402, "Nincs elég IceCoinod. Egy pörgetés " + SPIN_COST + " IceCoinba kerül.");
    u.coins -= SPIN_COST;
  } else u.lastSpin = weekKey();
  const slot = pickSlot(), x = WHEEL[slot];
  let prize = x.ic || 0, rank = null, granted = false;
  if (x.rank) {
    const ri = RANKS.findIndex(r => r.id === x.rank), cur = RANKS.findIndex(r => r.name === u.rank);
    rank = RANKS[ri].name;
    if (cur < ri) { u.rank = rank; u.rankSince = Date.now(); granted = true; }
    else prize = RANKS[ri].ic;
    console.log("Szerencsekerék: " + u.name + " " + rank + " rangot nyert" + (granted ? "." : ", de már megvolt, helyette +" + prize + " IceCoin."));
  }
  if (prize > 0) u.coins = (u.coins || 0) + prize;
  save();
  res.json({ ok: true, slot, win: prize > 0 || granted, prize, rank, granted, free, spun: true, user: pub(u) });
});

const RANKS = [
  { id: "bronz", name: "Bronz", ic: 950, ft: 1000 },
  { id: "abyss", name: "Abyss", ic: 2700, ft: 2000 },
  { id: "iceking", name: "IceKing", ic: 4850, ft: 4150 },
  { id: "yeti", name: "Yeti", ic: 8000, ft: 9990 }
];
const TERMS_VERSION = "2026-10-12";
const MAX_QTY = 10;
const UNBANS = [
  { id: "mute", name: "Némítás feloldása", ft: 2000, ic: 2500 },
  { id: "ban10", name: "Kitiltás csökkentése 10 nappal", ft: 4990 },
  { id: "ban20", name: "Kitiltás csökkentése 20 nappal", ft: 9990 },
  { id: "banfull", name: "Teljes kitiltás feloldása", ft: 30000 }
];
const STAFF_EMAIL = process.env.STAFF_EMAIL || "support@icemine.hu";
function unbanNext(u) {
  if (!u.unbanLast) return 0;
  const d = new Date(u.unbanLast); d.setMonth(d.getMonth() + 6);
  return d.getTime();
}
const dayHu = t => new Date(t).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" });
const escHtml = v => String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function recordUnban(u, x, src, extra) {
  const t = Date.now(), late = unbanNext(u) > t;
  u.unbanLast = t; u.unbanItem = x.name;
  db.unbans = db.unbans || [];
  db.unbans.push(Object.assign({ t, uid: u.id, user: u.name, item: x.id, src, overLimit: late }, extra));
  if (db.unbans.length > 2000) db.unbans.splice(0, db.unbans.length - 2000);
  console.log("Feloldás: " + u.name + " – " + x.name + " (" + (src === "ic" ? x.ic + " IceCoin" : "forint") + ")" + (late ? " – FIGYELEM: 6 hónapon belül már vásárolt, vissza kell téríteni!" : "."));
  const when = new Date(t).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
  const text = "Új feloldási kérés érkezett az IceMine weboldalról.\n\nJátékos: " + u.name + "\nTermék: " + x.name + "\nFizetés: " + (src === "ic" ? x.ic + " IceCoin" : extra.huf + " Ft (Stripe: " + (extra.pi || extra.sid) + ")") + "\nIdőpont: " + when + "\n" + (late ? "\nFIGYELEM: a játékos 6 hónapon belül már vásárolt ilyet, ezt a szabály szerint vissza kell téríteni.\n" : "") + "\nTeendő: hajtsd végre a feloldást a szerveren 24 órán belül. Kliens ban esetén ne oldd fel, hanem térítsd vissza a vételárat.";
  sendMail({ to: STAFF_EMAIL, subject: "IceMine – feloldási kérés: " + u.name + " (" + x.name + ")", text, html: '<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;font-size:14px">' + escHtml(text) + "</pre>" }).catch(e => console.error("Staff értesítés hiba: " + e.message));
}
const SKIN_DIR = path.join(__dirname, "skins"), PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const skinLimit = limit(30, 6e5);
function cleanPng(buf) {
  if (buf.length < 57 || buf.length > 32768 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  const keep = ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"], out = [PNG_SIG];
  let off = 8, seen = {};
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("latin1", off + 4, off + 8), end = off + 12 + len;
    if (end > buf.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    if (off === 8 && type !== "IHDR") return null;
    if (keep.includes(type)) { out.push(buf.subarray(off, end)); seen[type] = 1; }
    off = end;
    if (type === "IEND") break;
  }
  if (!seen.IHDR || !seen.IDAT || !seen.IEND) return null;
  return Buffer.concat(out);
}
function saveSkin(req, res) {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const b = req.body || {};
  if (!u.id) u.id = crypto.randomBytes(9).toString("hex");
  const file = path.join(SKIN_DIR, u.id + ".png");
  if (b.reset) {
    try { fs.unlinkSync(file); } catch (e) {}
    delete u.skin; save();
    return res.json({ ok: true, user: pub(u) });
  }
  const png = cleanPng(Buffer.from(String(b.data || "").replace(/^data:image\/png;base64,/, ""), "base64"));
  if (!png) return fail(res, 400, "Csak PNG formátumú skin tölthető fel (legfeljebb 32 KB).");
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  if (w !== 64 || (h !== 64 && h !== 32)) return fail(res, 400, "A skin 64×64 pixeles PNG legyen. A te képed " + w + "×" + h + " pixeles.");
  try { fs.mkdirSync(SKIN_DIR, { recursive: true }); fs.writeFileSync(file, png); }
  catch (e) { console.error("Skin mentési hiba: " + e.message); return fail(res, 500, "Nem sikerült elmenteni a skint. Próbáld újra."); }
  u.skin = { v: Date.now(), slim: !!b.slim };
  save();
  res.json({ ok: true, user: pub(u) });
}
app.get("/skin/:file", (req, res) => {
  const m = /^([A-Za-z0-9_]{3,16})\.png$/.exec(req.params.file || "");
  const u = m && db.users[m[1].toLowerCase()];
  if (!u || !u.skin || !u.id) return res.status(404).type("text/plain").send("Nincs ilyen skin.");
  res.set({ "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" });
  res.sendFile(path.join(SKIN_DIR, u.id + ".png"), err => { if (err && !res.headersSent) res.status(404).type("text/plain").send("Nincs ilyen skin."); });
});
app.post("/api/checkout", limit(20, 6e5), async (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  if (!STRIPE_KEY) return fail(res, 503, "A fizetés jelenleg nem elérhető. Próbáld később.");
  const body = req.body || {};
  if (body.consent !== true) return fail(res, 400, "A vásárláshoz jelöld be a nyilatkozatot az azonnali teljesítésről.");
  let item;
  if (body.unban !== undefined) {
    const x = UNBANS.find(z => z.id === String(body.unban));
    if (!x) return fail(res, 400, "Ismeretlen termék.");
    if (unbanNext(u) > Date.now()) return fail(res, 409, "Ezek közül 6 hónaponta csak egyet vásárolhatsz. Legközelebb " + dayHu(unbanNext(u)) + " után.");
    item = { name: x.name, huf: x.ft, meta: { unban: x.id }, back: "&tipus=unban" };
  } else if (body.rank !== undefined) {
    const ri = RANKS.findIndex(r => r.id === String(body.rank)), cur = RANKS.findIndex(r => r.name === u.rank);
    if (ri < 0) return fail(res, 400, "Ismeretlen rang.");
    if (ri <= cur) return fail(res, 409, ri === cur ? "Már ez a rangod." : "Már magasabb rangod van.");
    item = { name: RANKS[ri].name + " rang", huf: RANKS[ri].ft, meta: { rank: RANKS[ri].id }, back: "&rang=1" };
  } else {
    const pack = PACKS.find(p => p[0] === Number(body.ic)), qty = body.qty === undefined ? 1 : Number(body.qty);
    if (!pack) return fail(res, 400, "Ismeretlen csomag.");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail(res, 400, "A mennyiség 1 és " + MAX_QTY + " között lehet.");
    item = { name: pack[0].toLocaleString("hu-HU") + " IceCoin", huf: pack[1], qty, meta: { ic: pack[0] * qty, qty }, back: "" };
  }
  if (!u.id) { u.id = crypto.randomBytes(9).toString("hex"); save(); }
  const b = base(req), meta = Object.assign({ uid: u.id, user: u.name, consent: String(Date.now()) }, item.meta);
  try {
    const s = await stripe("POST", "/checkout/sessions", {
      mode: "payment",
      locale: "hu",
      customer_email: u.email,
      client_reference_id: u.id,
      success_url: b + "/?fizetes={CHECKOUT_SESSION_ID}" + item.back,
      cancel_url: b + "/?fizetes=megszakitva" + item.back,
      line_items: [{ quantity: item.qty || 1, price_data: { currency: "huf", unit_amount: item.huf * 100, product_data: { name: item.name, description: "IceMine – " + u.name + " fiókjára", images: b.startsWith("https://") ? [b + "/favicon.png"] : undefined } } }],
      metadata: meta,
      payment_intent_data: { description: item.name + " – " + u.name, metadata: meta }
    });
    res.json({ url: s.url });
  } catch (e) {
    console.error("Fizetés: nem sikerült elindítani – " + e.message);
    fail(res, 502, "Nem sikerült elindítani a fizetést. Próbáld később.");
  }
});

app.post("/api/checkout-status", limit(60, 6e5), async (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const id = String((req.body || {}).id || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return fail(res, 400, "Hibás fizetési azonosító.");
  db.payments = db.payments || {};
  let pending = false;
  if (!db.payments[id] && STRIPE_KEY && u.id) {
    try {
      const s = await stripe("GET", "/checkout/sessions/" + id);
      if (s.metadata && s.metadata.uid === u.id) { fulfill(s); pending = s.status === "complete" && s.payment_status !== "paid"; }
    } catch (e) { console.error("Fizetés: ellenőrzési hiba – " + e.message); }
  }
  const p = db.payments[id], mine = !!(p && p.uid === u.id);
  res.json({ paid: mine, pending, ic: mine ? p.ic || 0 : 0, qty: mine ? p.qty || 1 : 0, rank: mine ? p.rank || null : null, unban: mine ? p.unban || null : null, user: pub(u) });
});

app.post("/api/unban-ic", limit(20, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const x = UNBANS.find(z => z.id === String((req.body || {}).item || ""));
  if (!x || !x.ic) return fail(res, 400, "Ez a termék IceCoinért nem vásárolható meg.");
  if (unbanNext(u) > Date.now()) return fail(res, 409, "Ezek közül 6 hónaponta csak egyet vásárolhatsz. Legközelebb " + dayHu(unbanNext(u)) + " után.");
  const bal = u.coins || 0;
  if (bal < x.ic) return fail(res, 402, "Nincs elég IceCoinod. Még " + (x.ic - bal) + " IceCoin hiányzik.");
  if (!u.id) u.id = crypto.randomBytes(9).toString("hex");
  u.coins = bal - x.ic;
  recordUnban(u, x, "ic", {});
  save();
  res.json({ ok: true, user: pub(u) });
});

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

app.get("/fonts/:file", (req, res) => {
  if (!/^(sora|manrope)\.woff$/.test(req.params.file || "")) return res.status(404).type("text/plain").send("Nincs ilyen fájl.");
  res.set({ "Content-Type": "font/woff", "Cache-Control": "public, max-age=2592000", "Access-Control-Allow-Origin": "*" });
  res.sendFile(path.join(__dirname, "fonts", req.params.file));
});
app.get(["/favicon.png", "/favicon.ico"], (req, res) => res.sendFile(path.join(__dirname, "favicon.png")));
app.get("/robots.txt", (req, res) => res.type("text/plain").send("User-agent: *\nAllow: /\nDisallow: /api/\n"));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
boot().catch(e => { console.error("Indítási hiba:", e.message); process.exit(1); });
