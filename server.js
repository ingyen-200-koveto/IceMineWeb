const express = require("express"), crypto = require("crypto"), fs = require("fs"), path = require("path"), net = require("net"), dns = require("dns").promises;

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
const jsonKicsi = express.json({ limit: "10kb" }), jsonSzerver = express.json({ limit: "512kb" });
app.use((req, res, next) => (req.path.startsWith("/api/mc/") ? jsonSzerver : jsonKicsi)(req, res, next));

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
  if (!db.rangLejaratKesz) {
    let n = 0;
    for (const u of Object.values(db.users)) if (u && u.rank && u.rank !== "default" && !u.rankUntil) { u.rankUntil = Date.now() + 30 * NAP_MS; n++; }
    db.rangLejaratKesz = 1;
    save();
    if (n) console.log("Rang lejárat: " + n + " meglévő rang 30 napot kapott mostantól.");
  }
  setInterval(() => { let v = false; for (const u of Object.values(db.users)) if (u && rangLejart(u)) v = true; if (v) save(); }, 6e5);
  setTimeout(lejaratFigyelo, 6e4); setInterval(lejaratFigyelo, 18e5);
  let atnevezve = 0;
  for (const u of Object.values(db.users)) if (u && u.rank === "Abyss") { u.rank = "Wizard"; atnevezve++; }
  if (atnevezve) { save(); console.log("Rang átnevezés: " + atnevezve + " Abyss rangú fiók mostantól Wizard."); }
  const port = process.env.PORT || process.env.SERVER_PORT || 3000, host = process.env.HOST;
  const certFile = path.join(__dirname, "cert.pem"), keyFile = path.join(__dirname, "key.pem");
  const tls = fs.existsSync(certFile) && fs.existsSync(keyFile);
  const server = tls ? require("https").createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, app) : require("http").createServer(app);
  const ready = () => { console.log("Cloudflare ellenőrzés: " + (TS_SITE && TS_SECRET ? "bekapcsolva (regisztráció és belépés)." : "kikapcsolva (TURNSTILE_SITE_KEY és TURNSTILE_SECRET_KEY kell a .env-be).")); console.log("IceMine fut" + (pool ? " (adatbázissal)" : " (fájllal)") + (tls ? ", HTTPS" : ", HTTP") + ", port: " + port); (async () => { await checkMail().catch(e => console.log("E-mail: ellenőrzési hiba – " + e.message)); await checkStripe().catch(e => console.log("Fizetés: ellenőrzési hiba – " + e.message)); })(); };
  server.requestTimeout = 15 * 6e4;
  host ? server.listen(port, host, ready) : server.listen(port, ready);
  const bport = Number(process.env.INTERNAL_PORT) || 3001, bs = require("http").createServer((req, res) => belso(req, res));
  bs.on("error", e => console.error("Bot kapcsolat: nem indult el a belső API (" + e.message + ")."));
  votifierInditas();
  bs.listen(bport, "127.0.0.1", () => console.log("Bot kapcsolat: belső API a 127.0.0.1:" + bport + " címen."));
}

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 12 }, () => ALPH[crypto.randomInt(ALPH.length)]).join("");
const mask = e => e.replace(/^(.).*(@.*)$/, "$1***$2");
const pub = u => (rangLejart(u), { name: u.name, email: u.email, coins: u.coins || 0, created: u.created, rank: u.rank || "default", rankUntil: u.rank && u.rank !== "default" ? u.rankUntil || null : null, skin: u.skin || null, unbanNext: unbanNext(u), unbanLast: u.unbanLast ? { t: u.unbanLast, item: u.unbanItem || "" } : null, discord: u.discord ? { nev: u.discord.nev } : null, punish: buntetesFiok(u) });
const fail = (res, code, error) => res.status(code).json({ error });
function esemeny(tipus, adat, u) {
  db.esemenyek = db.esemenyek || [];
  db.esemenySeq = (db.esemenySeq || 0) + 1;
  const e = Object.assign({ seq: db.esemenySeq, t: Date.now(), tipus }, adat);
  db.esemenyek.push(e);
  if (db.esemenyek.length > 2000) db.esemenyek.splice(0, db.esemenyek.length - 2000);
  if (tipus === "vasarlas" && u) naplo(u, e);
}
const naploSor = e => ({ t: e.t, mit: (e.tetelek || []).slice(0, 10), ft: e.fizetes === "ft" ? Number(e.huf) || 0 : null, ic: e.fizetes === "ic" ? Number(e.ic) || 0 : null, id: e.rendeles || null });
function naplo(u, e) {
  u.vasarlasok = u.vasarlasok || [];
  u.vasarlasok.unshift(naploSor(e));
  if (u.vasarlasok.length > 200) u.vasarlasok.length = 200;
}
function vasarlasElozmeny(u) {
  if (!u.vasarlasokKesz) {
    const sajat = u.vasarlasok || [], hatar = sajat.length ? sajat[sajat.length - 1].t : Infinity;
    const nevek = new Set([u.name.toLowerCase()]), regi = [], ids = new Set(sajat.map(x => x.id).filter(Boolean));
    for (const e of db.esemenyek || []) if (e.tipus === "vasarlas" && e.t < hatar && nevek.has(String(e.user || "").toLowerCase())) { const x = naploSor(e); if (!x.id || !ids.has(x.id)) { regi.push(x); if (x.id) ids.add(x.id); } }
    for (const [sid, r] of Object.entries(db.payments || {})) {
      if (!u.id || r.uid !== u.id || r.t >= hatar) continue;
      const id = r.pi || sid;
      if (ids.has(id)) continue;
      const mit = [];
      for (const [ic, q, bon] of r.packs || (r.ic ? [[r.ic, 1]] : [])) mit.push((q > 1 ? q + " × " : "") + Number(ic).toLocaleString("hu-HU") + " IceCoin" + (bon ? " + " + Number(bon).toLocaleString("hu-HU") + " bónusz" : ""));
      if (r.rank) mit.push(r.rank + " rang, " + (r.rankNap || 30) + " nap");
      if (r.unban) mit.push(r.unban);
      regi.push({ t: r.t, mit, ft: r.huf || 0, ic: null, id });
      ids.add(id);
    }
    u.vasarlasok = sajat.concat(regi).sort((a, b) => b.t - a.t).slice(0, 200);
    u.vasarlasokKesz = true;
    save();
  }
  return u.vasarlasok || [];
}
const rendelesId = () => "IC-" + Array.from({ length: 10 }, () => ALPH[crypto.randomInt(ALPH.length)]).join("");
const dcId = u => (u && u.discord && u.discord.id) || null;

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
const PACKS = [[500, 499, 0], [1000, 899, 0], [2000, 1690, 0], [3500, 2990, 0], [5000, 3990, 250], [7500, 5990, 500], [10000, 7990, 750], [15000, 11990, 1000]];
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
function parseCart(code) {
  const out = { ic: 0, packs: [], rank: null, unban: null };
  for (const part of String(code || "").split(",")) {
    let mm;
    if ((mm = /^ic(\d+)x(\d+)$/.exec(part))) {
      const pk = PACKS.find(p => p[0] === Number(mm[1])), q = Number(mm[2]);
      if (!pk || q < 1 || q > MAX_QTY) return null;
      out.ic += (pk[0] + pk[2]) * q; out.packs.push(pk[2] ? [pk[0], q, pk[2]] : [pk[0], q]);
    } else if ((mm = /^r:(\w+)(?::(\d+))?$/.exec(part))) {
      out.rank = RANKS.find(x => x.id === mm[1]) || null;
      out.rankNap = rangNap(mm[2]);
      if (!out.rank) return null;
    } else if ((mm = /^u:(\w+)$/.exec(part))) {
      out.unban = UNBANS.find(z => z.id === mm[1]) || null;
      if (!out.unban) return null;
    } else return null;
  }
  return out.ic || out.rank || out.unban ? out : null;
}
function legacyCart(m) {
  if (m.unban) { const x = UNBANS.find(z => z.id === m.unban); return x ? { ic: 0, packs: [], rank: null, unban: x } : null; }
  if (m.rank) { const r = RANKS.find(x => x.id === m.rank); return r ? { ic: 0, packs: [], rank: r, unban: null } : null; }
  const ic = Number(m.ic), q = Number(m.qty) || 1;
  return Number.isInteger(ic) && ic > 0 && ic <= 1e6 ? { ic, packs: [[ic / q, q]], rank: null, unban: null } : null;
}
function fulfill(s) {
  if (!s || s.object !== "checkout.session" || s.payment_status !== "paid") return false;
  db.payments = db.payments || {};
  if (db.payments[s.id]) return true;
  const m = s.metadata || {}, c = m.cart ? parseCart(m.cart) : legacyCart(m);
  const u = m.uid ? Object.values(db.users).find(x => x.id === m.uid) : null;
  if (!u || !c) { if (m.uid) console.error("Fizetés: nem sikerült jóváírni, nincs ilyen fiók vagy termék (" + s.id + ")."); return false; }
  const rec = { t: Date.now(), uid: u.id, user: u.name, huf: (s.amount_total || 0) / 100, consent: Number(m.consent) || null, pi: s.payment_intent || null };
  if (c.ic) {
    rec.ic = c.ic; rec.packs = c.packs; u.coins = (u.coins || 0) + c.ic;
    console.log("Fizetés: " + u.name + " +" + c.ic + " IceCoin jóváírva (" + s.id + ").");
  }
  if (c.rank) {
    const nap = rangNap(c.rankNap);
    rec.rank = c.rank.name; rec.rankNap = nap;
    if (rangAd(u, c.rank, nap)) console.log("Fizetés: " + u.name + " megkapta a(z) " + c.rank.name + " rangot " + nap + " napra (" + s.id + ").");
    else { rec.rankComp = rangAr(c.rank, nap, "ic"); u.coins = (u.coins || 0) + rec.rankComp; console.log("Fizetés: " + u.name + " már " + u.rank + " rangú volt, helyette +" + rec.rankComp + " IceCoin (" + s.id + ")."); }
  }
  if (c.unban) {
    rec.unban = c.unban.name;
    recordUnban(u, c.unban, "ft", { huf: c.unban.ft, pi: rec.pi, sid: s.id });
  }
  db.payments[s.id] = rec;
  const tetelek = [];
  for (const [ic, q, bon] of rec.packs || (rec.ic ? [[rec.ic, 1]] : [])) tetelek.push((q > 1 ? q + " × " : "") + Number(ic).toLocaleString("hu-HU") + " IceCoin" + (bon ? " + " + Number(bon).toLocaleString("hu-HU") + " bónusz" : ""));
  if (rec.rank) tetelek.push(rec.rank + " rang, " + (rec.rankNap || 30) + " nap" + (rec.rankComp ? " (helyette " + rec.rankComp + " IceCoin)" : ""));
  if (rec.unban) tetelek.push(rec.unban);
  esemeny("vasarlas", { user: u.name, discord: dcId(u), fizetes: "ft", huf: rec.huf, tetelek, rendeles: rec.pi || s.id, rang: rec.rank && !rec.rankComp ? rec.rank : null }, u);
  save();
  sendReceipt(u, rec, s.id).catch(e => console.error("Visszaigazoló e-mail hiba: " + e.message));
  return true;
}
async function sendReceipt(u, rec, sid) {
  const site = process.env.BASE_URL || "https://icemine.hu", when = new Date(rec.t).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
  const hu = n => Number(n).toLocaleString("hu-HU");
  const items = [], got = [], consent = [];
  for (const [ic, q, bon] of rec.packs || (rec.ic ? [[rec.ic, 1]] : [])) { const nev = hu(ic) + " IceCoin" + (bon ? " + " + hu(bon) + " bónusz" : ""); items.push(q > 1 ? q + " × " + nev : nev); }
  if (rec.rank) items.push(rec.rank + " rang, " + (rec.rankNap || 30) + " nap");
  if (rec.unban) items.push(rec.unban);
  if (rec.ic) got.push(hu(rec.ic) + " IceCoint jóváírtunk a fiókodon.");
  if (rec.rank) got.push(rec.rankComp ? "Mivel már " + rec.rank + " vagy magasabb rangod volt, a rang helyett " + hu(rec.rankComp) + " IceCoint írtunk jóvá." : "A(z) " + rec.rank + " rangot " + (rec.rankNap || 30) + " napra jóváírtuk a fiókodon. Ha már megvolt, a lejáratát hosszabbítottuk meg.");
  if (rec.unban) got.push("A(z) „" + rec.unban + "” kérésedet továbbítottuk a staffnak, legkésőbb 24 órán belül elvégzik. Kliens ban esetén nincs feloldás, ilyenkor a vételárat visszatérítjük.");
  if (rec.ic || rec.rank) consent.push("A vásárlás előtt kifejezetten kérted a digitális tartalom (IceCoin, rang) azonnali jóváírását, és tudomásul vetted, hogy a teljesítés megkezdésével elveszíted a 14 napos elállási jogodat (45/2014. (II. 26.) Korm. rendelet 29. § (1) bekezdés m) pont).");
  if (rec.unban) consent.push("A vásárlás előtt kifejezetten kérted a szolgáltatás (feloldás) azonnali teljesítését, és tudomásul vetted, hogy a szolgáltatás teljesítése után elveszíted a felmondási jogodat (45/2014. (II. 26.) Korm. rendelet 29. § (1) bekezdés a) pont).");
  const rows = [...items.map(x => ["Termék", x]), ["Összesen", hu(rec.huf) + " Ft"], ["Időpont", when], ["Fiók", u.name], ["Azonosító", rec.pi || sid]];
  const text = `Kedves ${u.name}!\nKöszönjük a vásárlást! Ezzel az e-maillel visszaigazoljuk a megrendelésedet.\n\n${rows.map(r => r[0] + ": " + r[1]).join("\n")}\n\n${got.join("\n")}\n\n${consent.join("\n")}\n\nÁSZF: ${site}/#aszf\nVisszatérítési feltételek: ${site}/#visszaterites\nKérdés esetén írj nekünk: support@icemine.hu\n\nÜdvözlettel, IceMine csapata!`;
  const esc = escHtml;
  const sor = (k, v, kiemel) => `<tr><td style="padding:11px 0;border-bottom:1px solid #e8eef3;font-size:14px;color:#6b7c89">${esc(k)}</td><td align="right" style="padding:11px 0;border-bottom:1px solid #e8eef3;font-size:14.5px;font-weight:bold;color:${kiemel ? "#0a1e2b" : "#33434f"}">${esc(v)}</td></tr>`;
  const html = levelSablon(site, { cim: "Köszönjük a vásárlást! 🧾", torzs: levelP(`Szia ${esc(u.name)}! Ezzel az e-maillel visszaigazoljuk a megrendelésedet.`)
    + `<div style="margin:0 0 18px;padding:16px 18px;border-radius:12px;background:#0f2a44"><div style="font-size:11px;letter-spacing:1.5px;color:#9fc3dd;font-weight:bold">FIZETVE</div><div style="margin-top:4px;font-size:26px;font-weight:bold;color:#ffffff">${esc(hu(rec.huf))} Ft</div><div style="margin-top:2px;font-size:13px;color:#9fc3dd">${esc(when)}</div></div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${items.map(x => sor("Termék", x, true)).join("")}${sor("Fiók", u.name)}${sor("Azonosító", rec.pi || sid)}</table>`
    + (got.length ? `<div style="font-size:13px;letter-spacing:1.2px;color:#6b7c89;font-weight:bold;margin:0 0 10px">MIT KAPTÁL?</div>` + got.map(g => `<div style="margin:0 0 10px;padding:12px 14px;border-radius:10px;background:#eef7ee;font-size:14.5px;line-height:1.5;color:#24452c">✅ ${esc(g)}</div>`).join("") : "")
    + `<div style="height:8px"></div>` + levelGomb(site + "/#karakter", "Megnézem a fiókomban →"),
    megjegyzes: consent.map(esc).join("<br><br>") + `${consent.length ? "<br><br>" : ""}<a href="${site}/#aszf" style="color:#1c7fd0">ÁSZF</a> · <a href="${site}/#visszaterites" style="color:#1c7fd0">Visszatérítési feltételek</a>` });
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

const levelEsc = v => String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function levelSablon(site, { cim, torzs, megjegyzes }) {
  const F = "font-family:Arial,Helvetica,sans-serif;";
  return `<!doctype html><html lang="hu"><body style="margin:0;padding:0;background:#e9eef3"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9eef3"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:#0f2a44;border-radius:14px 14px 0 0;padding:22px 28px;${F}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:24px;font-weight:bold;color:#ffffff"><a href="${site}" style="color:#ffffff;text-decoration:none"><span style="color:#5cc0ff">Ice</span>Mine</a></td><td align="right" style="font-size:13px;color:#9fc3dd">play.icemine.hu</td></tr></table></td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 8px;${F}color:#1d2b36"><div style="font-size:26px;line-height:1.25;font-weight:bold;color:#0a1e2b;margin:0 0 14px">${cim}</div>${torzs}</td></tr>
${megjegyzes ? `<tr><td style="background:#ffffff;padding:6px 28px 26px;${F}"><div style="padding:14px 16px;border-radius:10px;background:#f3f6f9;font-size:13.5px;line-height:1.55;color:#5b6b78">${megjegyzes}</div></td></tr>` : `<tr><td style="background:#ffffff;padding:0 0 18px"></td></tr>`}
<tr><td style="background:#ffffff;border-top:1px solid #e3e9ef;border-radius:0 0 14px 14px;padding:18px 28px;${F}font-size:13px;color:#7a8894">Kérdésed van? Írj nekünk a <a href="${DISCORD_URL}" style="color:#1c7fd0">Discordon</a> vagy a <a href="mailto:support@icemine.hu" style="color:#1c7fd0">support@icemine.hu</a> címen.</td></tr>
<tr><td align="center" style="padding:18px 10px 0;${F}font-size:12px;color:#8a97a3">© ${new Date().getFullYear()} IceMine · <a href="${site}/#aszf" style="color:#8a97a3">ÁSZF</a> · <a href="${site}/#adatvedelem" style="color:#8a97a3">Adatvédelem</a><br><span style="font-size:10.5px">NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.</span></td></tr>
</table></td></tr></table></body></html>`;
}
const levelP = t => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#33434f">${t}</p>`;
const levelGomb = (href, t) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td style="background:#1c7fd0;border-radius:8px"><a href="${href}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">${t}</a></td></tr></table>`;
const levelKod = (cimke, kod) => `<div style="margin:0 0 18px;padding:14px 18px;border:1px dashed #b9cad8;border-radius:10px;background:#f7fafc"><div style="font-size:11px;letter-spacing:1.5px;color:#6b7c89;font-weight:bold">${cimke}</div><div style="margin-top:4px;font-family:Consolas,Menlo,monospace;font-size:24px;letter-spacing:3px;color:#0a1e2b;font-weight:bold">${kod}</div></div>`;
const DISCORD_URL = process.env.DISCORD_URL || "https://discord.gg/U8Z7EUgaKz";
async function sendCode(req, u, code) {
  const link = base(req) + "/?megerosites=" + u.name + ":" + code;
  const text = `Kedves ${u.name}!\nKöszönjük, hogy regisztráltál weboldalunkon!\nKattints a linkre, hogy megerősítsd a fiókod.\n${link}\nvagy a megerősítő oldalon az alábbi kódot másold/írd be.\n${code}\nÜdvözlettel, IceMine csapata!`;
  const site = base(req);
  const html = levelSablon(site, { cim: `Szia ${levelEsc(u.name)}! Még egy lépés.`, torzs: levelP("Köszönjük, hogy regisztráltál az IceMine-ra! Erősítsd meg az e-mail címed, és már kész is a fiókod.") + levelGomb(link, "Fiók megerősítése →") + levelKod("VAGY ÍRD BE EZT A KÓDOT", code) + levelP('<span style="font-size:14px;color:#6b7c89">A kód 24 óráig érvényes.</span>'), megjegyzes: "Nem te regisztráltál? Nyugodtan hagyd figyelmen kívül ezt a levelet. Megerősítés nélkül a fiók nem jön létre." });
  await sendMail({ to: u.email, subject: "IceMine – fiók megerősítése", text, html });
}
async function sendReset(req, u, code) {
  const link = base(req) + "/?jelszo=" + u.name + ":" + code;
  const text = `Kedves ${u.name}!\nJelszó-visszaállítást kértél az IceMine fiókodhoz.\nKattints a linkre az új jelszó megadásához.\n${link}\nvagy a visszaállítás oldalon az alábbi kódot írd be.\n${code}\nA kód 1 óráig érvényes. Ha nem te kérted, hagyd figyelmen kívül ezt a levelet.\nÜdvözlettel, IceMine csapata!`;
  const html = levelSablon(base(req), { cim: "Új jelszó beállítása", torzs: levelP(`Szia ${levelEsc(u.name)}! Jelszó-visszaállítást kértél az IceMine fiókodhoz.`) + levelGomb(link, "Új jelszó megadása →") + levelKod("VAGY ÍRD BE EZT A KÓDOT", code) + levelP('<span style="font-size:14px;color:#6b7c89">A kód 1 óráig érvényes.</span>'), megjegyzes: "Nem te kérted? Hagyd figyelmen kívül ezt a levelet, a jelszavad nem változik." });
  await sendMail({ to: u.email, subject: "IceMine – jelszó-visszaállítás", text, html });
}
const oldalCim = () => process.env.BASE_URL || "https://icemine.hu";
const huIdo = t => new Date(t).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
async function sendRangLejar(u) {
  const site = oldalCim(), mikor = huIdo(u.rankUntil), nap = Math.max(1, Math.ceil((u.rankUntil - Date.now()) / 864e5));
  const text = `Szia ${u.name}!\nA(z) ${u.rank} rangod ${mikor}-kor lejár (még ${nap} nap).\nHa szeretnéd megtartani, itt meghosszabbíthatod: ${site}/#rangok\nHa ugyanazt a rangot hosszabbítod, az új napok a mostani lejárathoz adódnak.\n\nÜdvözlettel, IceMine csapata!`;
  const html = levelSablon(site, { cim: `Hamarosan lejár a rangod ⏳`, torzs: levelP(`Szia ${levelEsc(u.name)}! A <b>${levelEsc(u.rank)}</b> rangod hamarosan lejár.`)
    + `<div style="margin:0 0 20px;padding:16px 18px;border-radius:12px;background:#0f2a44"><div style="font-size:11px;letter-spacing:1.5px;color:#9fc3dd;font-weight:bold">LEJÁRAT</div><div style="margin-top:4px;font-size:20px;font-weight:bold;color:#ffffff">${mikor}</div><div style="margin-top:2px;font-size:13px;color:#9fc3dd">még ${nap} nap van hátra</div></div>`
    + levelP("Ha szeretnéd megtartani a jutalmait, hosszabbítsd meg időben. Ha ugyanazt a rangot hosszabbítod, az új napok a mostani lejárathoz adódnak, így egy napot sem veszítesz.")
    + levelGomb(site + "/#rangok", "Meghosszabbítom →"), megjegyzes: "Ezt a levelet azért kaptad, mert van IceMine rangod. Lejárat előtt csak egyszer küldjük." });
  await sendMail({ to: u.email, subject: "IceMine – hamarosan lejár a rangod", text, html });
}
function lejaratFigyelo() {
  const most = Date.now(); let v = false;
  for (const u of Object.values(db.users)) {
    if (!u || !u.verified || !u.rank || u.rank === "default" || !u.rankUntil) continue;
    const hatra = u.rankUntil - most;
    if (hatra <= 0 || hatra > 3 * 864e5 || u.lejErtesites === u.rankUntil) continue;
    u.lejErtesites = u.rankUntil; v = true;
    esemeny("ranglejar", { user: u.name, discord: dcId(u), rang: u.rank, lejar: u.rankUntil });
    if (u.email) sendRangLejar(u).catch(e => console.error("Rang lejárat e-mail hiba: " + e.message));
  }
  if (v) save();
}
const MERFOLDKOVEK = [10, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000];
function regMerfoldko() {
  const n = Object.values(db.users).filter(x => x && x.verified).length, m = MERFOLDKOVEK.filter(x => x <= n).pop() || 0;
  if (db.merfoldReg === undefined) { db.merfoldReg = m; return; }
  if (m > db.merfoldReg) { db.merfoldReg = m; esemeny("merfoldko", { fajta: "regisztracio", szam: m }); }
}
const TS_SITE = String(process.env.TURNSTILE_SITE_KEY || "").trim(), TS_SECRET = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
async function emberE(req, token) {
  if (!TS_SITE || !TS_SECRET) return null;
  if (typeof token !== "string" || !token || token.length > 2048) return "Várd meg, amíg a Cloudflare ellenőrzés „Sikeres!” lesz a gomb fölött.";
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: TS_SECRET, response: token, remoteip: req.ip || "" }), signal: AbortSignal.timeout(8000) });
    const d = await r.json().catch(() => ({}));
    if (d.success) return null;
    console.log("Cloudflare ellenőrzés elutasítva: " + ((d["error-codes"] || []).join(", ") || r.status));
    return "Az ellenőrzés nem sikerült. Próbáld újra.";
  } catch (e) { console.error("Cloudflare ellenőrzés hiba: " + e.message); return "Az ellenőrzés most nem érhető el. Próbáld újra pár perc múlva."; }
}
app.get("/api/beallitasok", (req, res) => res.json({ turnstile: TS_SITE && TS_SECRET ? TS_SITE : null }));
async function jelentkezesLevel(u, j) {
  const site = oldalCim(), ok = j.allapot === "elfogadva";
  const text = `Szia ${u.name}!\n${ok ? "Elfogadtuk a staff jelentkezésedet! Hamarosan keresünk a Discordon a részletekkel." : "Köszönjük a staff jelentkezésedet, de most nem tudjuk elfogadni."}${!ok && j.indok ? "\nIndok: " + j.indok : ""}${!ok ? "\n14 nap múlva újra jelentkezhetsz." : ""}\n\nÜdvözlettel, IceMine csapata!`;
  const html = levelSablon(site, { cim: ok ? "Elfogadtuk a jelentkezésed! 🎉" : "A staff jelentkezésedről", torzs: levelP(`Szia ${levelEsc(u.name)}!`) + levelP(ok ? "Örömmel írjuk, hogy elfogadtuk a staff jelentkezésedet. Hamarosan keresünk a Discordon a részletekkel, addig nézz be gyakran!" : "Köszönjük, hogy jelentkeztél staffnak. Most nem tudjuk elfogadni a jelentkezésedet.") + (!ok && j.indok ? `<div style="margin:0 0 18px;padding:14px 16px;border-radius:10px;background:#f7fafc;border:1px solid #e3e9ef;font-size:14.5px;color:#33434f"><b>Indok:</b> ${levelEsc(j.indok)}</div>` : "") + (!ok ? levelP("14 nap múlva újra jelentkezhetsz. Addig is játssz sokat, és segíts a többieknek, ez sokat számít!") : "") + levelGomb(DISCORD_URL, "Discord szerver →") });
  await sendMail({ to: u.email, subject: ok ? "IceMine – elfogadtuk a staff jelentkezésed" : "IceMine – a staff jelentkezésedről", text, html });
}
async function sendWelcome(req, u) {
  const site = base(req), token = crypto.randomBytes(24).toString("hex");
  u.torles = { h: sha(token), exp: Date.now() + 30 * 864e5 }; save();
  const torlo = site + "/?torles=" + u.name + ":" + token;
  const text = `Kedves ${u.name}!\nSikeres regisztráció!\n\nNem te regisztráltál ezzel az e-mail címmel? Ezen a linken törölheted a fiókot (1 hónapig érvényes):\n${torlo}\n\nIceMine fiók: ${site}\nSzerver: play.icemine.hu (Java 1.18 – 1.20.x)\nSegítség: ${DISCORD_URL}\n\nÜdvözlettel, IceMine csapata!`;
const pont = (ikon, cim, szoveg) => `<tr><td valign="top" style="padding:0 14px 16px 0;width:44px"><div style="width:42px;height:42px;line-height:42px;text-align:center;border-radius:10px;background:#eaf4fc;font-size:20px">${ikon}</div></td><td valign="top" style="padding:0 0 16px;font-family:Arial,Helvetica,sans-serif"><div style="font-size:16px;font-weight:bold;color:#0a1e2b">${cim}</div><div style="font-size:14.5px;line-height:1.5;color:#55656f;margin-top:3px">${szoveg}</div></td></tr>`;
  const html = levelSablon(site, { cim: `Üdv az IceMine-on, ${levelEsc(u.name)}! 🎉`, torzs: levelP("Kész a fiókod, már fel is léphetsz a szerverre.")
    + `<div style="margin:0 0 20px;padding:16px 18px;border-radius:12px;background:#0f2a44"><div style="font-size:11px;letter-spacing:1.5px;color:#9fc3dd;font-weight:bold">SZERVER CÍM</div><div style="margin-top:4px;font-size:22px;font-weight:bold;color:#ffffff">play.icemine.hu</div><div style="margin-top:2px;font-size:13px;color:#9fc3dd">Minecraft Java 1.18 – 1.20.x · a szerveren a weboldalas jelszavaddal lépj be</div></div>`
    + `<div style="font-size:13px;letter-spacing:1.2px;color:#6b7c89;font-weight:bold;margin:0 0 12px">MIT CSINÁLHATSZ MOST?</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">`
    + pont("👕", "Saját skin", "Tölts fel skint a fiókodban, és a szerveren magától rád kerül.")
    + pont("❄️", "IceCoin és rangok", "Vásárolj IceCoint vagy rangot, és az azonnal megjelenik a fiókodon.")
    + pont("🎁", "Ingyen jutalmak", "Szavazz a szerverlistákon, pörgess a Szerencsekeréken, és hívd meg a barátaidat.")
    + `</table>` + levelGomb(site + "/#karakter", "Belépek a fiókomba →"),
    megjegyzes: `Nem te regisztráltál ezzel az e-mail címmel? <a href="${torlo}" style="color:#1c7fd0">Itt törölheted a fiókot.</a> A link 1 hónapig érvényes.` });
  await sendMail({ to: u.email, subject: "IceMine regisztráció", text, html });
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
  const { name = "", email = "", password = "", accept, ref = "", birth = "", kor } = req.body || {};
  if (accept !== true) return fail(res, 400, "A regisztrációhoz el kell fogadnod az ÁSZF-et és a Szabályzatot.");
  { const eh = await emberE(req, (req.body || {}).ts); if (eh) return fail(res, 400, eh); }
  const bm = typeof birth === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth), bd = bm && new Date(Date.UTC(+bm[1], +bm[2] - 1, +bm[3]));
  if (!bd || bd.getUTCMonth() !== +bm[2] - 1 || bd.getUTCDate() !== +bm[3] || +bm[1] < 1920 || bd > Date.now() - 3 * 365 * 864e5) return fail(res, 400, "Adj meg érvényes születési dátumot.");
  if (kor !== true) return fail(res, 400, "Erősítsd meg az életkorodat, vagy hogy a szülőd hozzájárult a regisztrációhoz.");
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return fail(res, 400, "A felhasználónév 3–16 karakter lehet: betű, szám, aláhúzás.");
  if (typeof email !== "string" || email.length > 100 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, "Adj meg érvényes e-mail címet.");
  if (typeof password !== "string" || password.length < 6 || password.length > 100) return fail(res, 400, "A jelszó legalább 6 karakter legyen.");
  const key = name.toLowerCase(), mail = email.toLowerCase();
  if (taken(db.users[key])) return fail(res, 409, "Ez a felhasználónév már foglalt.");
  if (Object.values(db.users).some(x => x.email === mail && taken(x))) return fail(res, 409, "Ezzel az e-mail címmel már van fiók.");
  const rk = typeof ref === "string" ? ref.trim() : "", rkU = rk.toUpperCase();
  const meghivo = !rk ? null : (/^[A-Z0-9]{8}$/.test(rkU) && Object.values(db.users).find(x => x.refKod === rkU && x.verified)) || (/^[A-Za-z0-9_]{3,16}$/.test(rk) && db.users[rk.toLowerCase()] && db.users[rk.toLowerCase()].verified && rk.toLowerCase() !== key ? db.users[rk.toLowerCase()] : null);
  if (rk && !meghivo) { return fail(res, 400, "Nem találjuk a meghívót. Írd be a barátod pontos játékosnevét, vagy hagyd üresen."); }
  const salt = crypto.randomBytes(16).toString("hex");
  const u = db.users[key] = { name, email: mail, salt, hash: hashPw(password, salt), verified: false, coins: Number(process.env.START_COINS) || 0, created: Date.now(), accepted: { t: Date.now(), v: TERMS_VERSION }, birth };
  if (meghivo) { if (!meghivo.id) meghivo.id = crypto.randomBytes(9).toString("hex"); u.meghivtaId = meghivo.id; u.id = u.id || crypto.randomBytes(9).toString("hex"); }
  try { await issue(req, u); }
  catch (e) { delete db.users[key]; save(); console.error("E-mail hiba: " + e.message); return fail(res, 502, "Nem sikerült elküldeni az e-mailt. Ellenőrizd a címet, vagy próbáld később."); }
  res.json({ ok: true, mail: mask(u.email) });
});

app.post("/api/verify", limit(30, 6e5), (req, res) => {
  const { name = "", code = "" } = req.body || {};
  const key = String(name).toLowerCase(), err = verifyCode(key, code);
  if (err) return fail(res, 400, err);
  const u = db.users[key];
  esemeny("regisztracio", { user: u.name });
  sendWelcome(req, u).catch(e => console.error("Üdvözlő e-mail hiba: " + e.message));
  regMerfoldko(); save();
  res.json({ ok: true, token: session(u), user: pub(u) });
});

app.post("/api/torles-linkkel", limit(10, 6e5), (req, res) => {
  const { name = "", token = "" } = req.body || {};
  const key = String(name).toLowerCase(), u = db.users[key];
  if (!u || !u.torles || typeof token !== "string" || !same(u.torles.h, sha(token))) return fail(res, 400, "Ez a törlő link érvénytelen, vagy a fiókot már törölték.");
  if (Date.now() > u.torles.exp) return fail(res, 400, "Ez a törlő link lejárt (1 hónapig volt érvényes). Írj nekünk: support@icemine.hu");
  const vett = (u.vasarlasok || []).length || Object.values(db.payments || {}).some(p => p && String(p.user || "").toLowerCase() === key);
  if (vett) return fail(res, 409, "Ehhez a fiókhoz már tartozik vásárlás, ezért csak az ügyfélszolgálat tudja törölni. Írj nekünk: support@icemine.hu");
  for (const [h, sx] of Object.entries(db.sessions)) if (sx && sx.k === key) delete db.sessions[h];
  delete db.users[key]; save();
  console.log("Fiók törölve az e-mailes linkkel: " + u.name);
  res.json({ ok: true, name: u.name });
});

app.post("/api/resend", limit(10, 6e5), async (req, res) => {
  const u = db.users[String((req.body || {}).name || "").toLowerCase()];
  if (!u || u.verified) return res.json({ ok: true });
  if (u.v && Date.now() - u.v.sent < 3e4) return fail(res, 429, "Várj fél percet az új kód kérése előtt.");
  try { await issue(req, u); } catch (e) { console.error("E-mail hiba: " + e.message); return fail(res, 502, "Nem sikerült elküldeni az e-mailt."); }
  res.json({ ok: true, mail: mask(u.email) });
});

app.post("/api/forgot", limit(8, 6e5), async (req, res) => {
  const id = String((req.body || {}).id || "").trim().toLowerCase();
  if (!id || id.length > 100) return fail(res, 400, "Add meg a felhasználóneved vagy az e-mail címed.");
  const u = id.includes("@") ? Object.values(db.users).find(x => x.email === id && x.verified) : db.users[id];
  if (u && u.verified && !(u.r && Date.now() - u.r.sent < 6e4)) {
    const code = makeCode();
    u.r = { h: sha(u.salt + code), exp: Date.now() + 36e5, tries: 0, sent: Date.now() };
    save();
    try { await sendReset(req, u, code); }
    catch (e) { delete u.r; save(); console.error("E-mail hiba: " + e.message); return fail(res, 502, "Nem sikerült elküldeni az e-mailt. Próbáld újra pár perc múlva."); }
  }
  res.json({ ok: true });
});

app.post("/api/reset", limit(20, 6e5), (req, res) => {
  const { name = "", code = "", password = "" } = req.body || {};
  if (typeof password !== "string" || password.length < 6 || password.length > 100) return fail(res, 400, "Az új jelszó legalább 6 karakter legyen.");
  const u = db.users[String(name).trim().toLowerCase()];
  if (!u || !u.r) return fail(res, 400, "Hibás felhasználónév vagy kód.");
  if (Date.now() > u.r.exp) { delete u.r; save(); return fail(res, 400, "A kód lejárt. Kérj új kódot az Elfelejtettem a jelszavam gombbal."); }
  if (u.r.tries >= 5) return fail(res, 429, "Túl sok hibás próbálkozás. Kérj új kódot.");
  if (!same(u.r.h, sha(u.salt + String(code).trim().toUpperCase()))) { u.r.tries++; save(); return fail(res, 400, "Hibás felhasználónév vagy kód."); }
  delete u.r;
  u.salt = crypto.randomBytes(16).toString("hex");
  u.hash = hashPw(password, u.salt);
  const key = u.name.toLowerCase();
  for (const h of Object.keys(db.sessions)) if (db.sessions[h].k === key) delete db.sessions[h];
  save();
  res.json({ ok: true });
});

app.post("/api/login", limit(30, 6e5), async (req, res) => {
  const { name = "", password = "" } = req.body || {};
  { const eh = await emberE(req, (req.body || {}).ts); if (eh) return fail(res, 400, eh); }
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
  esemeny("vasarlas", { user: newName, discord: dcId(u), fizetes: "ic", ic: NAME_COST, tetelek: ["Felhasználónév-váltás: " + u.name + " → " + newName], rendeles: rendelesId() }, u);
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
  esemeny("utalas", { user: u.name, cimzett: r.name, ic: n, uzenet: message.trim() });
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
    const ri = RANKS.findIndex(r => r.id === x.rank);
    rank = RANKS[ri].name;
    if (rangAd(u, RANKS[ri], 30)) granted = true;
    else prize = RANKS[ri].ic;
    console.log("Szerencsekerék: " + u.name + " " + rank + " rangot nyert" + (granted ? "." : ", de már megvolt, helyette +" + prize + " IceCoin."));
  }
  if (prize > 0) u.coins = (u.coins || 0) + prize;
  if (!free) esemeny("vasarlas", { user: u.name, discord: dcId(u), fizetes: "ic", ic: SPIN_COST, tetelek: ["Szerencsekerék pörgetés"], eredmeny: granted ? rank + " rang" : prize > 0 ? prize + " IceCoin" : "nem nyert", rendeles: rendelesId() }, u);
  if (granted) esemeny("rang", { user: u.name, discord: dcId(u), rang: rank, forras: "Szerencsekerék" });
  save();
  res.json({ ok: true, slot, win: prize > 0 || granted, prize, rank, granted, free, spun: true, user: pub(u) });
});

const VOTE_REWARD = Math.max(0, Math.floor(Number(process.env.VOTE_REWARD)) || 25);
const VOTE_SITES = [
  { id: "mcmp", name: "Minecraft-MP", mod: "api", api: process.env.VOTE_MCMP_API || "https://minecraft-mp.com/api/", url: String(process.env.VOTE_MCMP_URL || "").trim(), key: String(process.env.VOTE_MCMP_KEY || "").trim(), szolg: ["minecraftmp"] },
  { id: "mso", name: "MinecraftServers.org", mod: "votifier", url: String(process.env.VOTE_MSO_URL || "").trim(), szolg: ["minecraftserversorg"], nevParam: "username" },
  { id: "mcsl", name: "Minecraft-Server-List", mod: "votifier", url: String(process.env.VOTE_MCSL_URL || "").trim(), szolg: ["minecraftserverlist", "mcsl"] },
  { id: "topg", name: "TopG", mod: "votifier", url: String(process.env.VOTE_TOPG_URL || "").trim(), szolg: ["topg"] },
  { id: "buzz", name: "Minecraft.Buzz", mod: "votifier", url: String(process.env.VOTE_BUZZ_URL || "").trim(), szolg: ["minecraftbuzz", "buzz"] },
  { id: "mcs", name: "MC-Servers", mod: "votifier", url: String(process.env.VOTE_MCS_URL || "").trim(), szolg: ["mcserverscom", "mcservers"] }
];
const VOTIFIER_SZUNET = 12 * 36e5;
const szavazoOldal = szolgaltatas => { const n = String(szolgaltatas || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return VOTE_SITES.find(s => s.szolg.some(x => n.includes(x))) || { id: "egyeb:" + (n.slice(0, 30) || "ismeretlen"), name: String(szolgaltatas || "ismeretlen").slice(0, 40), mod: "votifier" }; };
const siteKesz = s => s.mod === "api" ? !!(s.url && s.key) : !!s.url;
const voteZar = new Set();
const idoHu = t => new Date(t).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
const voteNext = (u, s) => { const t = u.votes && u.votes[s.id]; return t && t + NAP_MS > Date.now() ? t + NAP_MS : null; };
async function voteApi(s, claim, name) {
  const q = new URLSearchParams({ object: "votes", element: "claim", key: s.key, username: name });
  if (claim) q.set("action", "post");
  const r = await fetch(s.api + "?" + q, { headers: { "User-Agent": "IceMine-web" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.text()).trim();
}
const JEL_KERDESEK = [
  ["kor", "Hány éves vagy?", 2, 3], ["discord", "Discord neved", 2, 40], ["ido", "Mióta játszol az IceMine-on?", 2, 80], ["mod", "Melyik játékmódban vagy a legaktívabb?", 2, 80],
  ["orak", "Naponta hány órát tudsz aktív lenni?", 1, 40], ["tapasztalat", "Voltál már staff máshol? Hol és mióta?", 2, 500], ["miert", "Miért szeretnél staff lenni?", 30, 1500],
  ["helyzet", "Mit csinálsz, ha valaki csal vagy sérteget a chatben?", 30, 1500], ["mikrofon", "Van mikrofonod, tudsz hangcsatornában beszélni?", 2, 20]
];
const JEL_SZUNET = 14 * 864e5;
const sajatJel = u => Object.values(db.jelentkezesek || {}).filter(j => j.uid === u.id).sort((a, b) => b.t - a.t)[0] || null;
const jelPub = j => j && { id: j.id, t: j.t, allapot: j.allapot, dontesT: j.dontesT || null, indok: j.allapot === "elutasitva" ? j.indok || null : null };
app.get("/api/staff-jelentkezes", (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const j = sajatJel(u);
  res.json({ jelentkezes: jelPub(j), kerdesek: JEL_KERDESEK.map(([id, cim, min, max]) => ({ id, cim, min, max })), ujra: j && j.allapot === "elutasitva" ? j.dontesT + JEL_SZUNET : null, discord: u.discord ? u.discord.nev || null : null });
});
app.post("/api/staff-jelentkezes", limit(5, 36e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  if (!u.verified) return fail(res, 403, "Előbb erősítsd meg a fiókodat.");
  const j0 = sajatJel(u);
  if (j0 && j0.allapot === "fuggoben") return fail(res, 409, "Már van egy elbírálás alatt lévő jelentkezésed.");
  if (j0 && j0.allapot === "elfogadva") return fail(res, 409, "A jelentkezésedet már elfogadtuk.");
  if (j0 && j0.allapot === "elutasitva" && Date.now() - j0.dontesT < JEL_SZUNET) return fail(res, 429, "Elutasítás után 14 nap múlva jelentkezhetsz újra.");
  const b = (req.body && req.body.valaszok) || {}, valaszok = {};
  for (const [id, cim, min, max] of JEL_KERDESEK) {
    const v = String(b[id] == null ? "" : b[id]).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim();
    if (v.length < min) return fail(res, 400, "Töltsd ki rendesen ezt is: " + cim);
    valaszok[id] = v.slice(0, max);
  }
  if (!/^\d{1,2}$/.test(valaszok.kor) || +valaszok.kor < 10) return fail(res, 400, "Az életkorodat számmal add meg.");
  db.jelentkezesek = db.jelentkezesek || {};
  if (!u.id) u.id = crypto.randomBytes(9).toString("hex");
  const id = "J-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  db.jelentkezesek[id] = { id, t: Date.now(), uid: u.id, user: u.name, allapot: "fuggoben", valaszok };
  esemeny("jelentkezes", { id, user: u.name, discord: dcId(u), rang: u.rank || "default", regisztralt: u.created || null, valaszok, kerdesek: JEL_KERDESEK.map(([k, c]) => [k, c]) });
  save();
  console.log("Staff jelentkezés: " + u.name + " (" + id + ").");
  res.json({ ok: true, jelentkezes: jelPub(db.jelentkezesek[id]) });
});
app.get("/api/vote", (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const sajatUrl = s => s.url && s.nevParam ? s.url + (s.url.includes("?") ? "&" : "?") + s.nevParam + "=" + encodeURIComponent(u.name) : s.url || null;
  res.json({ reward: VOTE_REWARD, total: u.voteCount || 0, sites: VOTE_SITES.filter(s => siteKesz(s) || s.id === "mcmp").map(s => ({ id: s.id, name: s.name, mod: s.mod, url: sajatUrl(s), ready: siteKesz(s), next: s.mod === "api" ? voteNext(u, s) : null, last: (u.votes && u.votes[s.id]) || null })) });
});
app.post("/api/vote/claim", limit(40, 6e5), async (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const s = VOTE_SITES.find(x => x.id === String((req.body || {}).site || ""));
  if (!s || s.mod !== "api") return fail(res, 400, "Ismeretlen szavazóoldal.");
  if (!s.url || !s.key) return fail(res, 503, "Ezen az oldalon még nem lehet jutalmat átvenni.");
  const nx = voteNext(u, s);
  if (nx) return fail(res, 429, "Erről az oldalról ma már átvetted a jutalmat. Legközelebb " + idoHu(nx) + " után.");
  const k = u.name.toLowerCase();
  if (voteZar.has(k)) return fail(res, 429, "Már ellenőrizzük a szavazatodat, várj egy pillanatot.");
  voteZar.add(k);
  try {
    let a;
    try { a = await voteApi(s, false, u.name); } catch (e) { console.error("Szavazás: a(z) " + s.name + " nem válaszolt (" + e.message + ")."); return fail(res, 502, "A szavazóoldal most nem válaszol. Próbáld újra pár perc múlva."); }
    if (a === "0") return fail(res, 404, "Nem találunk szavazatot " + u.name + " néven az elmúlt 24 órából. A szavazóoldalon pontosan ezt a nevet add meg: " + u.name + ". Ha most szavaztál, várj 1-2 percet, és próbáld újra.");
    if (a === "2") return fail(res, 409, "Ezt a szavazatot már átvetted. Holnap újra szavazhatsz.");
    if (a !== "1") { console.error("Szavazás: váratlan válasz a(z) " + s.name + " oldaltól: " + String(a).slice(0, 80)); return fail(res, 502, "A szavazóoldal hibás választ adott. Ellenőrizd a VOTE_MCMP_KEY kulcsot, vagy próbáld újra később."); }
    let c;
    try { c = await voteApi(s, true, u.name); } catch (e) { return fail(res, 502, "A szavazóoldal most nem válaszol. Próbáld újra pár perc múlva."); }
    if (c !== "1") return fail(res, 409, "Ezt a szavazatot már átvetted. Holnap újra szavazhatsz.");
    const most = Date.now();
    u.votes = u.votes || {}; u.votes[s.id] = most;
    u.voteCount = (u.voteCount || 0) + 1;
    u.coins = (u.coins || 0) + VOTE_REWARD;
    save();
    console.log("Szavazás: " + u.name + " +" + VOTE_REWARD + " IceCoin (" + s.name + ").");
    res.json({ ok: true, reward: VOTE_REWARD, next: most + NAP_MS, total: u.voteCount, user: pub(u) });
  } finally { voteZar.delete(k); }
});

function szavazatJovair(nev, szolgaltatas) {
  const u = typeof nev === "string" && /^[A-Za-z0-9_]{3,16}$/.test(nev) ? db.users[nev.toLowerCase()] : null;
  const s = szavazoOldal(szolgaltatas);
  if (!u || !u.verified) { console.log("Szavazás (" + s.name + "): " + String(nev).slice(0, 20) + " nevű fiók nincs a weboldalon, nem jár jutalom."); return "nincs"; }
  const most = Date.now(), elozo = u.votes && u.votes[s.id];
  if (elozo && most - elozo < VOTIFIER_SZUNET) { console.log("Szavazás (" + s.name + "): " + u.name + " ismételt szavazat, kihagyva."); return "ismetelt"; }
  u.votes = u.votes || {}; u.votes[s.id] = most;
  u.voteCount = (u.voteCount || 0) + 1;
  u.coins = (u.coins || 0) + VOTE_REWARD;
  esemeny("szavazas", { user: u.name, discord: dcId(u), oldal: s.name, ic: VOTE_REWARD });
  save();
  console.log("Szavazás: " + u.name + " +" + VOTE_REWARD + " IceCoin (" + s.name + ", Votifier).");
  return "ok";
}
function votifierKulcsok() {
  if (!db.votifier || !db.votifier.priv || !db.votifier.token) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    db.votifier = { priv: privateKey.export({ type: "pkcs8", format: "pem" }), pub: publicKey.export({ type: "spki", format: "der" }).toString("base64"), token: crypto.randomBytes(18).toString("base64url") };
    save();
    console.log("Votifier: új kulcsok készültek.");
  }
  return db.votifier;
}
function votifierV1(buf, k) {
  let raw;
  try { raw = crypto.privateDecrypt({ key: k.priv, padding: crypto.constants.RSA_NO_PADDING }, buf.subarray(0, 256)); } catch (e) { return null; }
  if (raw[0] !== 0 || raw[1] !== 2) return null;
  const nulla = raw.indexOf(0, 2);
  if (nulla < 10) return null;
  const sorok = raw.subarray(nulla + 1).toString("utf8").split("\n");
  if (sorok[0] !== "VOTE") return null;
  return { serviceName: sorok[1], username: sorok[2], address: sorok[3], timestamp: sorok[4] };
}
function votifierInditas() {
  const port = String(process.env.VOTIFIER_PORT || "").trim() === "" ? 8192 : Number(process.env.VOTIFIER_PORT);
  if (!(port > 0)) return console.log("Votifier: kikapcsolva (VOTIFIER_PORT=0).");
  const k = votifierKulcsok();
  const srv = net.createServer(sock => {
    const kihivas = crypto.randomBytes(16).toString("hex");
    let buf = Buffer.alloc(0), kesz = false;
    const vege = (valasz) => { if (kesz) return; kesz = true; try { if (valasz) sock.end(JSON.stringify(valasz) + "\r\n"); else sock.destroy(); } catch (e) {} };
    sock.setTimeout(5000, () => vege(null));
    sock.on("error", () => {});
    sock.write("VOTIFIER 2 " + kihivas + "\n");
    sock.on("data", d => {
      if (kesz) return;
      buf = Buffer.concat([buf, d]);
      if (buf.length > 65536) return vege(null);
      if (buf.length >= 2 && buf[0] === 0x73 && buf[1] === 0x3a) {
        if (buf.length < 4) return;
        const hossz = buf.readUInt16BE(2);
        if (buf.length < 4 + hossz) return;
        let uzenet, adat;
        try { uzenet = JSON.parse(buf.subarray(4, 4 + hossz).toString("utf8")); adat = JSON.parse(uzenet.payload); } catch (e) { return vege({ status: "error", cause: "BadJson", error: "Hibás adat." }); }
        const vart = crypto.createHmac("sha256", k.token).update(String(uzenet.payload)).digest();
        let kapott; try { kapott = Buffer.from(String(uzenet.signature || ""), "base64"); } catch (e) { kapott = Buffer.alloc(0); }
        if (kapott.length !== vart.length || !crypto.timingSafeEqual(kapott, vart)) { console.log("Votifier: hibás aláírás (" + String(adat.serviceName || "?").slice(0, 40) + "). Rossz tokent adtak meg a listán?"); return vege({ status: "error", cause: "BadSignature", error: "Hibás aláírás." }); }
        if (adat.challenge !== kihivas) return vege({ status: "error", cause: "BadChallenge", error: "Hibás kihívás." });
        szavazatJovair(adat.username, adat.serviceName);
        return vege({ status: "ok" });
      }
      if (buf.length >= 256) {
        const szav = votifierV1(buf, k);
        if (!szav) { console.log("Votifier: nem sikerült visszafejteni egy szavazatot. Rossz nyilvános kulcsot adtak meg a listán?"); return vege(null); }
        szavazatJovair(szav.username, szav.serviceName);
        return vege(null);
      }
    });
  });
  srv.on("error", e => console.error("Votifier: nem indult el a " + port + " porton (" + e.message + ")."));
  srv.listen(port, "0.0.0.0", () => console.log("Votifier: szavazatok fogadása a " + port + " porton."));
}
const NAP_MS = 864e5;
const RANG_NAPOK = [30, 60];
const rangNap = n => (RANG_NAPOK.includes(Number(n)) ? Number(n) : 30);
const rangAr = (r, nap, mi) => r[mi] * rangNap(nap) / 30;
function rangLejart(u) {
  if (!u || !u.rank || u.rank === "default" || !u.rankUntil || Date.now() < u.rankUntil) return false;
  console.log("Rang lejárt: " + u.name + " (" + u.rank + ").");
  esemeny("rang", { user: u.name, discord: dcId(u), rang: "lejárt: " + u.rank, forras: "Lejárat" });
  u.rank = "default"; delete u.rankUntil;
  return true;
}
const aktivRang = u => (rangLejart(u), RANKS.findIndex(r => r.name === u.rank));
function rangAd(u, r, nap) {
  const ri = RANKS.indexOf(r), cur = aktivRang(u), most = Date.now(), hossz = rangNap(nap) * NAP_MS;
  if (cur > ri) return false;
  if (cur === ri) u.rankUntil = Math.max(most, u.rankUntil || most) + hossz;
  else { u.rank = r.name; u.rankSince = most; u.rankUntil = most + hossz; }
  return true;
}
const RANKS = [
  { id: "bronz", name: "Bronz", ic: 950, ft: 1000 },
  { id: "abyss", name: "Wizard", ic: 2700, ft: 2000 },
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
const HIRKEP_DIR = path.join(__dirname, "hirkepek");
app.get("/api/hirek", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ hirek: (db.hirek || []).slice(0, 12).map(h => ({ id: h.id, t: h.t, cim: h.cim, szoveg: h.szoveg, kep: h.kep ? "/hirkep/" + h.kep : null, szerzo: h.szerzo || null })) });
});
app.get("/hirkep/:file", (req, res) => {
  if (!/^\d{5,25}\.(png|jpg|jpeg|gif|webp)$/.test(req.params.file || "")) return res.status(404).type("text/plain").send("Nincs ilyen kép.");
  res.set({ "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" });
  res.sendFile(path.join(HIRKEP_DIR, req.params.file), err => { if (err && !res.headersSent) res.status(404).type("text/plain").send("Nincs ilyen kép."); });
});
function hirMentes(d) {
  if (!d || !/^\d{5,25}$/.test(String(d.id || ""))) return "Hibás azonosító.";
  db.hirek = (db.hirek || []).filter(h => h.id !== d.id);
  const cim = String(d.cim || "").trim().slice(0, 200), szoveg = String(d.szoveg || "").trim().slice(0, 4000);
  if (!cim && !szoveg) return null;
  let kep = null;
  if (d.kep && typeof d.kep.adat === "string") {
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[d.kep.tipus];
    const buf = ext ? Buffer.from(d.kep.adat, "base64") : null;
    if (buf && buf.length > 100 && buf.length < 6e6) { fs.mkdirSync(HIRKEP_DIR, { recursive: true }); kep = d.id + "." + ext; fs.writeFileSync(path.join(HIRKEP_DIR, kep), buf); }
  }
  db.hirek.push({ id: d.id, t: Number(d.t) || Date.now(), cim: cim || szoveg.split("\n")[0].slice(0, 120), szoveg: cim ? szoveg : szoveg.split("\n").slice(1).join("\n").trim(), kep, szerzo: String(d.szerzo || "").slice(0, 40) || null });
  db.hirek.sort((a, b) => b.t - a.t);
  for (const h of db.hirek.splice(30)) if (h.kep) fs.rm(path.join(HIRKEP_DIR, h.kep), () => {});
  return null;
}
app.get("/skin/:file", (req, res) => {
  const m = /^([A-Za-z0-9_]{3,16})\.png$/.exec(req.params.file || "");
  const u = m && db.users[m[1].toLowerCase()];
  if (!u || !u.skin || !u.id) return res.status(404).type("text/plain").send("Nincs ilyen skin.");
  res.set({ "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" });
  res.sendFile(path.join(SKIN_DIR, u.id + ".png"), err => { if (err && !res.headersSent) res.status(404).type("text/plain").send("Nincs ilyen skin."); });
});
const mcSkins = new Map(), mcWait = new Map();
async function mcSkin(name) {
  const key = name.toLowerCase(), hit = mcSkins.get(key);
  if (hit && hit.exp > Date.now()) return hit.b;
  if (mcWait.has(key)) return mcWait.get(key);
  const job = (async () => {
    let b = null;
    try {
      const r = await fetch("https://mc-heads.net/skin/" + encodeURIComponent(name), { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "IceMine-web" } });
      if (r.ok) {
        const png = cleanPng(Buffer.from(await r.arrayBuffer()));
        if (png && png.readUInt32BE(16) === 64 && [32, 64].includes(png.readUInt32BE(20))) b = png;
      }
    } catch (e) {}
    if (mcSkins.size >= 500) mcSkins.delete(mcSkins.keys().next().value);
    mcSkins.set(key, { b, exp: Date.now() + (b ? 6 * 3600e3 : 600e3) });
    return b;
  })();
  mcWait.set(key, job);
  try { return await job; } finally { mcWait.delete(key); }
}
app.get("/mcskin/:file", async (req, res) => {
  const m = /^([A-Za-z0-9_]{3,16})\.png$/.exec(req.params.file || "");
  const u = m && db.users[m[1].toLowerCase()];
  if (!u || !u.verified) return res.status(404).type("text/plain").send("Nincs ilyen skin.");
  const b = await mcSkin(u.name);
  if (!b) return res.status(404).type("text/plain").send("Nincs ilyen skin.");
  res.set({ "Content-Type": "image/png", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" }).send(b);
});
function buildCart(u, body) {
  const lines = Array.isArray(body.cart) ? body.cart : body.rank !== undefined ? [{ t: "rank", id: body.rank, nap: body.nap }] : body.unban !== undefined ? [{ t: "unban", id: body.unban }] : [{ t: "ic", ic: body.ic, qty: body.qty === undefined ? 1 : body.qty }];
  if (!lines.length) return { err: [400, "A kosár üres."] };
  if (lines.length > 12) return { err: [400, "Túl sok tétel van a kosárban."] };
  const ics = new Map();
  let rank = null, unban = null, rankNap = 30;
  for (const l of lines) {
    const t = l && l.t;
    if (t === "ic") {
      const pack = PACKS.find(p => p[0] === Number(l.ic)), qty = Number(l.qty === undefined ? 1 : l.qty);
      if (!pack) return { err: [400, "Ismeretlen csomag."] };
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY || (ics.get(pack) || 0) + qty > MAX_QTY) return { err: [400, "Egy csomagból 1–" + MAX_QTY + " darabot vehetsz."] };
      ics.set(pack, (ics.get(pack) || 0) + qty);
    } else if (t === "rank") {
      const ri = RANKS.findIndex(r => r.id === String(l.id)), cur = aktivRang(u);
      if (ri < 0) return { err: [400, "Ismeretlen rang."] };
      if (rank) return { err: [400, "Egyszerre csak egy rangot vehetsz."] };
      if (ri < cur) return { err: [409, "Már magasabb rangod van, mint: " + RANKS[ri].name + "."] };
      rank = RANKS[ri]; rankNap = rangNap(l.nap);
    } else if (t === "unban") {
      const x = UNBANS.find(z => z.id === String(l.id));
      if (!x) return { err: [400, "Ismeretlen termék."] };
      if (unban) return { err: [400, "A Kitiltás csökkentése termékek közül egyszerre csak egyet vehetsz."] };
      if (unbanNext(u) > Date.now()) return { err: [409, "A Kitiltás csökkentése termékek közül 6 hónaponta csak egyet vásárolhatsz. Legközelebb " + dayHu(unbanNext(u)) + " után."] };
      unban = x;
    } else return { err: [400, "Ismeretlen tétel a kosárban."] };
  }
  const items = [...ics].map(([p, q]) => ({ name: p[0].toLocaleString("hu-HU") + " IceCoin" + (p[2] ? " + " + p[2].toLocaleString("hu-HU") + " bónusz IceCoin" : ""), huf: p[1], qty: q }));
  if (rank) items.push({ name: rank.name + " rang, " + rankNap + " nap", huf: rangAr(rank, rankNap, "ft"), qty: 1 });
  if (unban) items.push({ name: unban.name, huf: unban.ft, qty: 1 });
  const code = [...[...ics].map(([p, q]) => "ic" + p[0] + "x" + q), rank && "r:" + rank.id + ":" + rankNap, unban && "u:" + unban.id].filter(Boolean).join(",");
  const kinds = (ics.size ? 1 : 0) + (rank ? 1 : 0) + (unban ? 1 : 0);
  return { items, code, back: kinds > 1 ? "&tipus=kosar" : rank ? "&rang=1" : unban ? "&tipus=unban" : "" };
}
app.post("/api/checkout", limit(20, 6e5), async (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  if (!STRIPE_KEY) return fail(res, 503, "A fizetés jelenleg nem elérhető. Próbáld később.");
  const body = req.body || {};
  if (body.consent !== true) return fail(res, 400, "A vásárláshoz jelöld be a nyilatkozatot az azonnali teljesítésről.");
  const cart = buildCart(u, body);
  if (cart.err) return fail(res, cart.err[0], cart.err[1]);
  if (!u.id) { u.id = crypto.randomBytes(9).toString("hex"); save(); }
  const b = base(req), meta = { uid: u.id, user: u.name, consent: String(Date.now()), cart: cart.code };
  const desc = cart.items.map(x => (x.qty > 1 ? x.qty + " × " : "") + x.name).join(", ");
  try {
    const s = await stripe("POST", "/checkout/sessions", {
      mode: "payment",
      locale: "hu",
      customer_email: u.email,
      client_reference_id: u.id,
      success_url: b + "/?fizetes={CHECKOUT_SESSION_ID}" + cart.back,
      cancel_url: b + "/?fizetes=megszakitva" + cart.back,
      line_items: cart.items.map(x => ({ quantity: x.qty, price_data: { currency: "huf", unit_amount: x.huf * 100, product_data: { name: x.name, description: "IceMine – " + u.name + " fiókjára", images: b.startsWith("https://") ? [b + "/favicon.png"] : undefined } } })),
      metadata: meta,
      payment_intent_data: { description: (desc + " – " + u.name).slice(0, 480), metadata: meta }
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
  res.json({ paid: mine, pending, ic: mine ? (p.rank && p.ic && !p.packs ? 0 : p.ic || 0) : 0, packs: mine ? p.packs || null : null, rank: mine ? p.rank || null : null, rankNap: mine ? p.rankNap || null : null, rankComp: mine ? p.rankComp || (p.rank && p.ic && !p.packs ? p.ic : 0) : 0, unban: mine ? p.unban || null : null, user: pub(u) });
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
  esemeny("vasarlas", { user: u.name, discord: dcId(u), fizetes: "ic", ic: x.ic, tetelek: [x.name], rendeles: rendelesId() }, u);
  save();
  res.json({ ok: true, user: pub(u) });
});

app.post("/api/buy-rank", limit(20, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const i = RANKS.findIndex(r => r.id === String((req.body || {}).rank || ""));
  if (i < 0) return fail(res, 400, "Ismeretlen rang.");
  const cur = aktivRang(u);
  if (i < cur) return fail(res, 409, "Már magasabb rangod van.");
  const r = RANKS[i], bal = u.coins || 0, nap = rangNap((req.body || {}).nap), ar = rangAr(r, nap, "ic");
  if (bal < ar) return fail(res, 402, "Nincs elég IceCoinod. Még " + (ar - bal) + " IceCoin hiányzik.");
  u.coins = bal - ar;
  rangAd(u, r, nap);
  db.purchases = db.purchases || [];
  const rid = rendelesId();
  db.purchases.push({ t: Date.now(), user: u.name, rank: r.name, nap, ic: ar, id: rid });
  esemeny("vasarlas", { user: u.name, discord: dcId(u), fizetes: "ic", ic: ar, tetelek: [r.name + " rang, " + nap + " nap"], rendeles: rid, rang: r.name }, u);
  if (db.purchases.length > 2000) db.purchases.splice(0, db.purchases.length - 2000);
  save();
  res.json({ ok: true, user: pub(u) });
});

app.post("/api/discord-code", limit(10, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const code = String(crypto.randomInt(100000, 1000000));
  u.dcKod = { h: sha(code), exp: Date.now() + 6e5 };
  save();
  res.json({ ok: true, code });
});

app.post("/api/discord-unlink", limit(10, 6e5), (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  if (u.discord) { esemeny("levalasztas", { user: u.name, discord: u.discord.id, discordNev: u.discord.nev }); delete u.discord; save(); }
  res.json({ ok: true, user: pub(u) });
});

function fizetesTetelek(p) {
  const hu = n => Number(n).toLocaleString("hu-HU"), t = [];
  for (const [ic, q, bon] of p.packs || (p.ic ? [[p.ic, 1]] : [])) t.push((q > 1 ? q + " × " : "") + hu(ic) + " IceCoin" + (bon ? " + " + hu(bon) + " bónusz" : ""));
  if (p.rank) t.push(p.rank + " rang, " + (p.rankNap || 30) + " nap");
  if (p.unban) t.push(p.unban);
  return t;
}
function belso(req, res) {
  const kuld = (k, o) => { res.writeHead(k, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(o)); };
  let url;
  try { url = new URL(req.url, "http://belso"); } catch (e) { return kuld(400, { error: "Hibás kérés." }); }
  if (req.method === "GET" && url.pathname === "/esemenyek") {
    const utan = Number(url.searchParams.get("utan")) || 0;
    return kuld(200, { utolso: db.esemenySeq || 0, esemenyek: (db.esemenyek || []).filter(e => e.seq > utan).slice(0, 100) });
  }
  if (req.method === "POST" && ["/hirek", "/hirek-torles", "/jelentkezes-dontes"].includes(url.pathname)) {
    const max = url.pathname === "/hirek" ? 9e6 : 4000, darabok = []; let hossz = 0;
    req.on("data", c => { hossz += c.length; if (hossz > max) { req.destroy(); return; } darabok.push(c); });
    req.on("end", () => {
      let d;
      try { d = JSON.parse(Buffer.concat(darabok).toString("utf8")); } catch (e) { return kuld(400, { error: "Hibás kérés." }); }
      if (url.pathname === "/hirek") {
        const hibak = [];
        for (const h of Array.isArray(d.hirek) ? d.hirek : [d]) { const e = hirMentes(h); if (e) hibak.push(e); }
        save();
        return kuld(hibak.length ? 400 : 200, hibak.length ? { error: hibak[0] } : { ok: true, db: (db.hirek || []).length });
      }
      if (url.pathname === "/hirek-torles") {
        const h = (db.hirek || []).find(x => x.id === String(d.id));
        if (h) { db.hirek = db.hirek.filter(x => x !== h); if (h.kep) fs.rm(path.join(HIRKEP_DIR, h.kep), () => {}); save(); }
        return kuld(200, { ok: true, torolve: !!h });
      }
      const j = (db.jelentkezesek || {})[String(d.id || "")];
      if (!j) return kuld(404, { error: "Nincs ilyen jelentkezés." });
      if (j.allapot !== "fuggoben") return kuld(409, { error: "Ezt már elbírálta: " + (j.dontoNev || "valaki") + " (" + (j.allapot === "elfogadva" ? "elfogadva" : "elutasítva") + ").", allapot: j.allapot });
      j.allapot = d.dontes === "elfogad" ? "elfogadva" : "elutasitva"; j.dontesT = Date.now(); j.dontoNev = String(d.staff || "").slice(0, 40); j.indok = String(d.indok || "").trim().slice(0, 500) || null;
      save();
      const u = Object.values(db.users).find(x => x.id === j.uid);
      if (u && u.email) jelentkezesLevel(u, j).catch(e => console.error("Jelentkezés e-mail hiba: " + e.message));
      return kuld(200, { ok: true, allapot: j.allapot, user: j.user, discord: dcId(u) });
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/rendeles") {
    const id = String(url.searchParams.get("id") || "").trim(), idK = id.toUpperCase();
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return kuld(400, { error: "Hibás azonosító. Így néz ki: IC-H8D3RT6WNB vagy pi_3Qx..." });
    const e = (db.esemenyek || []).slice().reverse().find(x => x.tipus === "vasarlas" && String(x.rendeles || "").toUpperCase() === idK);
    const pEntry = Object.entries(db.payments || {}).find(([sid, x]) => x && (sid === id || x.pi === id));
    let u = null, sor = null;
    for (const x of Object.values(db.users)) { const f = (x.vasarlasok || []).find(v => String(v.id || "").toUpperCase() === idK); if (f) { u = x; sor = f; break; } }
    if (!u && pEntry) u = Object.values(db.users).find(x => x.id === pEntry[1].uid) || null;
    if (!u && e && e.user) u = db.users[String(e.user).toLowerCase()] || null;
    if (!e && !pEntry && !sor) return kuld(404, { error: "Nincs ilyen rendelés: " + id + ". Nézd meg, jól másolta-e ki a játékos (a vásárlási előzményeiből vagy az e-mailből)." });
    const p = pEntry ? pEntry[1] : null, ub = p ? (db.unbans || []).find(x => x.pi === p.pi || x.sid === pEntry[0]) : null;
    return kuld(200, {
      id, user: (u && u.name) || (e && e.user) || (p && p.user) || "?", discord: (u && dcId(u)) || (e && e.discord) || null,
      t: (e && e.t) || (p && p.t) || (sor && sor.t) || null,
      fizetes: e ? e.fizetes : p ? "ft" : sor && sor.ft != null ? "ft" : "ic",
      huf: p ? p.huf : e && e.fizetes === "ft" ? e.huf : sor ? sor.ft : null, ic: e && e.fizetes === "ic" ? e.ic : sor ? sor.ic : null,
      tetelek: (e && e.tetelek) || (sor && sor.mit && sor.mit.length ? sor.mit : null) || (p ? fizetesTetelek(p) : []), eredmeny: (e && e.eredmeny) || null,
      jovairva: true, stripe: p ? { pi: p.pi || null, session: pEntry[0] } : null, rangHelyett: p && p.rankComp ? p.rankComp : null,
      feloldas: ub ? { tullepes: !!ub.overLimit } : null, ma: { rang: u ? u.rank || "default" : null, coins: u ? u.coins || 0 : null }
    });
  }
  if (req.method === "GET" && url.pathname === "/votifier") {
    const k = votifierKulcsok();
    return kuld(200, { port: String(process.env.VOTIFIER_PORT || "").trim() === "" ? 8192 : Number(process.env.VOTIFIER_PORT), publicKey: k.pub, token: k.token, oldalak: VOTE_SITES.map(s => ({ id: s.id, nev: s.name, mod: s.mod, url: s.url || null })) });
  }
  if (req.method === "GET" && url.pathname === "/rangok") {
    let lejart = false;
    for (const u of Object.values(db.users)) if (rangLejart(u)) lejart = true;
    if (lejart) save();
    const tagok = Object.values(db.users).filter(u => u.verified && u.discord).map(u => ({ nev: u.name, rang: u.rank || "default", discord: u.discord.id }));
    return kuld(200, { rangok: RANKS.map(r => ({ id: r.id, nev: r.name })), tagok });
  }
  if (req.method === "GET" && url.pathname === "/fiok") {
    const id = url.searchParams.get("discord"), u = id && Object.values(db.users).find(x => x.discord && x.discord.id === id);
    if (!u) return kuld(404, { error: "Nincs összekötött fiók." });
    return kuld(200, { nev: u.name, rang: u.rank || "default", coins: u.coins || 0, created: u.created || null, skin: !!u.skin });
  }
  if (req.method === "POST" && url.pathname === "/osszekotes") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 2000) req.destroy(); });
    req.on("end", () => {
      let d;
      try { d = JSON.parse(body); } catch (e) { return kuld(400, { error: "Hibás kérés." }); }
      const kod = String(d.kod || "").replace(/\D/g, ""), id = String(d.discordId || ""), nev = String(d.discordNev || "").slice(0, 40);
      if (!/^\d{6}$/.test(kod) || !/^\d{17,20}$/.test(id)) return kuld(400, { error: "Hibás kód. A kód 6 számjegyből áll." });
      const h = sha(kod), most = Date.now(), talalat = Object.values(db.users).filter(u => u.dcKod && u.dcKod.exp > most && same(u.dcKod.h, h));
      if (talalat.length !== 1) return kuld(404, { error: "Hibás vagy lejárt kód. Kérj újat a weboldalon, a Karakter oldalon." });
      const u = talalat[0];
      for (const x of Object.values(db.users)) if (x !== u && x.discord && x.discord.id === id) { esemeny("levalasztas", { user: x.name, discord: id, discordNev: x.discord.nev }); delete x.discord; }
      u.discord = { id, nev, t: most };
      delete u.dcKod;
      esemeny("osszekotes", { user: u.name, discord: id, discordNev: nev });
      save();
      kuld(200, { ok: true, nev: u.name, rang: u.rank || "default" });
    });
    return;
  }
  kuld(404, { error: "Nincs ilyen." });
}

app.get("/api/me", (req, res) => { const u = authUser(req); u ? res.json({ user: pub(u) }) : fail(res, 401, "Nem vagy bejelentkezve."); });
app.post("/api/logout", (req, res) => { const t = (req.headers.authorization || "").slice(7); if (t) { delete db.sessions[sha(t)]; save(); } res.json({ ok: true }); });

const REF_REWARD = Math.max(0, Math.floor(Number(process.env.REF_REWARD)) || 100);
const REF_HAVI = Math.max(1, Math.floor(Number(process.env.REF_HAVI)) || 10);
function refKod(u) {
  if (!u.refKod) {
    const foglalt = new Set(Object.values(db.users).map(x => x.refKod).filter(Boolean));
    let k;
    do { k = Array.from({ length: 8 }, () => ALPH[crypto.randomInt(ALPH.length)]).join(""); } while (foglalt.has(k));
    u.refKod = k;
    save();
  }
  return u.refKod;
}
function meghivoJutalom(u) {
  if (!u.meghivtaId || u.refJutalom) return;
  const m = Object.values(db.users).find(x => x.id === u.meghivtaId);
  u.refJutalom = Date.now();
  u.coins = (u.coins || 0) + REF_REWARD;
  let meghivoKap = false;
  if (m && m !== u) {
    const ho = new Date().toISOString().slice(0, 7);
    if (!m.refHo || m.refHo.ho !== ho) m.refHo = { ho, n: 0 };
    if (m.refHo.n < REF_HAVI) { m.refHo.n++; m.coins = (m.coins || 0) + REF_REWARD; m.refDb = (m.refDb || 0) + 1; meghivoKap = true; }
  }
  esemeny("meghivo", { user: u.name, meghivo: m ? m.name : null, ic: REF_REWARD, meghivoKap });
  console.log("Meghívó: " + u.name + " +" + REF_REWARD + " IceCoin" + (meghivoKap ? ", " + m.name + " +" + REF_REWARD + " IceCoin." : "."));
  save();
}
app.get("/api/referral", (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  const kod = refKod(u), lista = [];
  if (u.id) for (const x of Object.values(db.users)) if (x.meghivtaId === u.id && x.verified) lista.push({ name: x.name, t: x.created || 0, kesz: !!x.refJutalom });
  lista.sort((a, b) => b.t - a.t);
  const ho = new Date().toISOString().slice(0, 7);
  res.json({ code: kod, reward: REF_REWARD, havi: REF_HAVI, eHonap: u.refHo && u.refHo.ho === ho ? u.refHo.n : 0, osszes: u.refDb || 0, lista: lista.slice(0, 100) });
});
app.get("/api/history", (req, res) => {
  const u = authUser(req);
  if (!u) return fail(res, 401, "Nem vagy bejelentkezve.");
  res.set("Cache-Control", "no-store").json({ items: vasarlasElozmeny(u).slice(0, 100) });
});

const MC_HOST = String(process.env.MC_HOST || "play.icemine.hu").trim();
let mcAll = { t: 0, d: null }, mcFut = null, modAll = { t: 0, modes: null };
const varint = n => { const b = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return Buffer.from(b); };
async function mcCel() {
  let h = MC_HOST, port = Number(process.env.MC_PORT) || 0;
  if (!port) { try { const r = await dns.resolveSrv("_minecraft._tcp." + MC_HOST); if (r && r[0]) { h = r[0].name; port = r[0].port; } } catch (e) {} }
  return { h, port: port || 25565 };
}
function mcPing(h, port) {
  return new Promise((ok, no) => {
    const s = net.connect({ host: h, port }); let buf = Buffer.alloc(0), kesz = false;
    const vege = (e, v) => { if (kesz) return; kesz = true; clearTimeout(ido); s.destroy(); e ? no(e) : ok(v); };
    const ido = setTimeout(() => vege(new Error("időtúllépés")), 6000);
    s.on("error", e => vege(e));
    s.on("close", () => vege(new Error("a kapcsolat lezárult")));
    s.on("connect", () => {
      const hb = Buffer.from(MC_HOST, "utf8");
      const adat = Buffer.concat([varint(0), varint(767), varint(hb.length), hb, Buffer.from([(port >> 8) & 255, port & 255]), varint(1)]);
      s.write(Buffer.concat([varint(adat.length), adat, varint(1), varint(0)]));
    });
    s.on("data", d => {
      buf = Buffer.concat([buf, d]);
      if (buf.length > 262144) return vege(new Error("túl nagy válasz"));
      let i = 0;
      const olvas = () => { let v = 0, k = 0, b; do { if (i >= buf.length) throw 0; b = buf[i++]; v |= (b & 0x7f) << (7 * k++); } while (b & 0x80 && k < 5); return v; };
      try {
        const hossz = olvas(), eleje = i;
        if (buf.length < eleje + hossz) return;
        olvas();
        const sh = olvas();
        vege(null, JSON.parse(buf.slice(i, i + sh).toString("utf8")));
      } catch (e) { if (e !== 0) vege(e); }
    });
  });
}
async function mcAllapot() {
  if (Date.now() - mcAll.t < 30000 && mcAll.d) return mcAll.d;
  if (!mcFut) mcFut = (async () => {
    try {
      const c = await mcCel(), r = await mcPing(c.h, c.port), p = r.players || {};
      mcAll = { t: Date.now(), d: { up: true, online: Number(p.online) || 0, max: Number(p.max) || 0, version: String((r.version && r.version.name) || "").slice(0, 60) } };
    } catch (e) {
      mcAll = { t: Date.now(), d: { up: false, online: null, max: null, version: "" } };
    } finally { mcFut = null; }
  })();
  await mcFut;
  return mcAll.d;
}
app.get("/api/status", async (req, res) => {
  const d = await mcAllapot();
  res.set("Cache-Control", "no-store").json(Object.assign({ host: MC_HOST }, d, { modes: Date.now() - modAll.t < 120000 ? modAll.modes : null }));
});
const JELZES_SZUNET = { report: 6e4, admin: 3e5 }, jelzesUtolso = new Map();
app.post("/api/mc/jelzes", limit(120, 6e5), (req, res) => {
  const key = String(process.env.MC_API_KEY || "");
  if (!key) return fail(res, 503, "Az MC_API_KEY nincs beállítva a weboldalon.");
  if (!same(String(req.get("x-icemine-key") || ""), key)) return fail(res, 401, "Hibás kulcs.");
  const b = req.body || {}, tipus = b.tipus === "admin" ? "admin" : b.tipus === "report" ? "report" : null;
  const nev = typeof b.jatekos === "string" && /^\.?[A-Za-z0-9_]{1,16}$/.test(b.jatekos) ? b.jatekos : null;
  if (!tipus || !nev) return fail(res, 400, "Hibás adat.");
  const celpont = tipus === "report" && typeof b.celpont === "string" && /^\.?[A-Za-z0-9_]{1,16}$/.test(b.celpont) ? b.celpont : null;
  if (tipus === "report" && !celpont) return fail(res, 400, "Hiányzik a jelentett játékos.");
  const szoveg = String(b.szoveg || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300);
  if (tipus === "report" && szoveg.length < 3) return fail(res, 400, "Hiányzik az indok.");
  const k = tipus + ":" + nev.toLowerCase(), most = Date.now();
  if (most - (jelzesUtolso.get(k) || 0) < JELZES_SZUNET[tipus]) return fail(res, 429, "Túl gyakran.");
  jelzesUtolso.set(k, most);
  const fiok = db.users[nev.replace(/^\./, "").toLowerCase()];
  esemeny("jelzes", { fajta: tipus, jatekos: nev, discord: dcId(fiok), celpont, szoveg, mod: String(b.mod || "Lobby").slice(0, 40), vilag: String(b.vilag || "").slice(0, 40), online: celpont ? !!b.celpontOnline : null });
  console.log((tipus === "admin" ? "Segítségkérés (/segitseg): " : "Jelentés (/jelent): ") + nev + (celpont ? " → " + celpont : "") + " (" + String(b.mod || "Lobby").slice(0, 40) + ")" + (szoveg ? ": " + szoveg : ""));
  save();
  res.json({ ok: true });
});
const MENTES_DIR = process.env.MENTES_DIR || "/var/lib/icemine/mentesek", MENTES_MEGTART = Math.max(1, parseInt(process.env.MENTES_MEGTART || "7", 10) || 7);
const mentesAllapot = { nev: null, kovetkezo: 0, t: 0 };
app.post("/api/mc/mentes", limit(2000, 36e5), async (req, res) => {
  const key = String(process.env.MC_API_KEY || "");
  if (!key) return fail(res, 503, "Az MC_API_KEY nincs beállítva a weboldalon.");
  if (!same(String(req.get("x-icemine-key") || ""), key)) return fail(res, 401, "Hibás kulcs.");
  const nev = String(req.query.nev || ""), resz = parseInt(req.query.resz || "0", 10), osszes = parseInt(req.query.osszes || "1", 10);
  if (!/^mentes_[0-9_-]{10,20}\.zip$/.test(nev) || !(resz >= 0) || !(osszes >= 1) || resz >= osszes || osszes > 1000) return fail(res, 400, "Hibás adat.");
  const tmp = path.join(MENTES_DIR, nev + ".resz");
  if (resz === 0) {
    for (const f of await fs.promises.readdir(MENTES_DIR).catch(() => [])) if (f.endsWith(".resz") || /\.resz\.\d+$/.test(f)) await fs.promises.unlink(path.join(MENTES_DIR, f)).catch(() => {});
    Object.assign(mentesAllapot, { nev, kovetkezo: 0, t: Date.now() });
  }
  else if (mentesAllapot.nev !== nev || mentesAllapot.kovetkezo !== resz) return fail(res, 409, "Rossz sorrend, kezdd elölről.");
  mentesAllapot.t = Date.now();
  try {
    await fs.promises.mkdir(MENTES_DIR, { recursive: true });
    if (resz === 0) {
      const st = await fs.promises.statfs(MENTES_DIR), hossz = Number(req.get("content-length")) || 0;
      if (st.bavail * st.bsize - hossz * osszes < 1024 ** 3) return fail(res, 507, "Nincs elég hely a VPS-en a mentéshez.");
    }
    let meret = 0;
    await new Promise((kesz, hiba) => {
      const ki = fs.createWriteStream(tmp + "." + resz);
      req.on("data", d => { meret += d.length; if (meret > 200 * 1024 ** 2) req.destroy(new Error("túl nagy darab")); });
      req.on("error", hiba); ki.on("error", hiba); ki.on("finish", kesz);
      req.pipe(ki);
    });
    mentesAllapot.kovetkezo = resz + 1;
    if (resz + 1 < osszes) return res.json({ ok: true, resz });
    const cel = fs.createWriteStream(tmp);
    for (let i = 0; i < osszes; i++) {
      await new Promise((kesz, hiba) => { const be = fs.createReadStream(tmp + "." + i); be.on("error", hiba); be.on("end", kesz); be.pipe(cel, { end: false }); });
      await fs.promises.unlink(tmp + "." + i).catch(() => {});
    }
    await new Promise((kesz, hiba) => { cel.on("error", hiba); cel.end(kesz); });
    await fs.promises.rename(tmp, path.join(MENTES_DIR, nev));
    mentesAllapot.nev = null;
    const lista = (await fs.promises.readdir(MENTES_DIR)).filter(f => /^mentes_.*\.zip$/.test(f)).sort().reverse();
    for (const regi of lista.slice(MENTES_MEGTART)) await fs.promises.unlink(path.join(MENTES_DIR, regi)).catch(() => {});
    const teljes = (await fs.promises.stat(path.join(MENTES_DIR, nev))).size;
    console.log("Mentés megérkezett a szerverről: " + nev + " (" + Math.round(teljes / 1048576) + " MB)");
    res.json({ ok: true, kesz: true, meret: teljes });
  } catch (e) {
    await fs.promises.unlink(tmp + "." + resz).catch(() => {});
    console.error("Mentés feltöltése nem sikerült:", e.message);
    if (!res.headersSent) fail(res, 500, "A mentés mentése nem sikerült.");
  }
});
const mcKulcsOk = (req, res) => {
  const key = String(process.env.MC_API_KEY || "");
  if (!key) { fail(res, 503, "Az MC_API_KEY nincs beállítva a weboldalon."); return false; }
  if (!same(String(req.get("x-icemine-key") || ""), key)) { fail(res, 401, "Hibás kulcs."); return false; }
  return true;
};
const mcNev = x => typeof x === "string" && /^\.?[A-Za-z0-9_]{1,16}$/.test(x) ? x : null;
const mcSzoveg = (x, n) => String(x || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
app.post("/api/mc/buntetes-esemeny", limit(300, 6e5), (req, res) => {
  if (!mcKulcsOk(req, res)) return;
  const b = req.body || {};
  const tipus = ["ban", "mute", "kick", "warn"].includes(b.tipus) ? b.tipus : null;
  if (!tipus) return fail(res, 400, "Hibás adat.");
  const jatekos = mcNev(b.jatekos) || "IP-cím", fiok = db.users[String(jatekos).replace(/^\./, "").toLowerCase()];
  esemeny("buntetes", { mufaj: b.mufaj === "feloldas" ? "feloldas" : "uj", btipus: tipus, jatekos, discord: fiok ? dcId(fiok) : null, staff: mcNev(b.staff) || mcSzoveg(b.staff, 20) || "Ismeretlen", indok: mcSzoveg(b.indok, 300), lejar: Math.max(0, Number(b.lejar) || 0), id: Number(b.id) || 0 });
  save();
  res.json({ ok: true });
});
const gyanuUtolso = new Map();
app.post("/api/mc/csalasgyanu", limit(300, 6e5), (req, res) => {
  if (!mcKulcsOk(req, res)) return;
  const b = req.body || {}, jatekos = mcNev(b.jatekos);
  if (!jatekos) return fail(res, 400, "Hibás adat.");
  const most = Date.now(), k = jatekos.toLowerCase();
  if (most - (gyanuUtolso.get(k) || 0) < 5 * 6e4) return fail(res, 429, "Túl gyakran.");
  gyanuUtolso.set(k, most);
  const checkek = (Array.isArray(b.checkek) ? b.checkek : []).slice(0, 6).map(c => ({ nev: mcSzoveg(c && c.nev, 40), db: Math.max(1, Math.min(1e5, Number(c && c.db) || 1)), vl: Math.round((Number(c && c.vl) || 0) * 10) / 10 })).filter(c => c.nev);
  esemeny("csalasgyanu", { jatekos, db: Math.max(1, Math.min(1e5, Number(b.db) || 1)), mp: Math.max(1, Math.min(86400, Number(b.mp) || 1)), checkek, vilag: mcSzoveg(b.vilag, 40), ping: Number.isFinite(Number(b.ping)) ? Number(b.ping) : -1, online: !!b.online });
  save();
  res.json({ ok: true });
});
const hibaKorlat = { perc: 0, db: 0 };
app.post("/api/mc/hibak", limit(300, 6e5), (req, res) => {
  const key = String(process.env.MC_API_KEY || "");
  if (!key) return fail(res, 503, "Az MC_API_KEY nincs beállítva a weboldalon.");
  if (!same(String(req.get("x-icemine-key") || ""), key)) return fail(res, 401, "Hibás kulcs.");
  const b = req.body || {}, lista = Array.isArray(b.hibak) ? b.hibak.slice(0, 20) : null;
  if (!lista) return fail(res, 400, "Hibás adat.");
  const forras = String(b.forras || "Szerver").replace(/[^\p{L}\p{N} _.\-]/gu, "").slice(0, 30) || "Szerver";
  const perc = Math.floor(Date.now() / 6e4);
  if (hibaKorlat.perc !== perc) { hibaKorlat.perc = perc; hibaKorlat.db = 0; }
  let kuldve = 0;
  for (const h of lista) {
    if (!h || typeof h.uzenet !== "string" || hibaKorlat.db >= 15) continue;
    hibaKorlat.db++; kuldve++;
    const tiszta = (x, n) => String(x || "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").slice(0, n);
    esemeny("szerverhiba", { forras, szint: h.szint === "ERROR" ? "ERROR" : "WARN", logger: tiszta(h.logger, 80), uzenet: tiszta(h.uzenet, 900), verem: tiszta(h.verem, 900), db: Math.max(1, Math.min(1e6, Number(h.db) || 1)), elso: Number(h.elso) || Date.now() });
  }
  if (kuldve) save();
  res.json({ ok: true, kuldve });
});
function buntetesFiok(u) {
  const b = db.buntetesek;
  if (!b || !b.t || Date.now() - b.t > 864e5) return undefined;
  const sajat = (b.lista || []).filter(x => x.nev === String(u.name || "").toLowerCase() && (!x.lejar || x.lejar > Date.now()));
  const egy = tipus => { const x = sajat.find(y => y.tipus === tipus); return x ? { until: x.lejar || 0, reason: x.indok || "" } : null; };
  return { ban: egy("ban"), mute: egy("mute") };
}
app.post("/api/mc/buntetesek", limit(120, 6e5), (req, res) => {
  const key = String(process.env.MC_API_KEY || "");
  if (!key) return fail(res, 503, "Az MC_API_KEY nincs beállítva a weboldalon.");
  if (!same(String(req.get("x-icemine-key") || ""), key)) return fail(res, 401, "Hibás kulcs.");
  const lista = Array.isArray(req.body && req.body.lista) ? req.body.lista : null;
  if (!lista) return fail(res, 400, "Hibás adat.");
  db.buntetesek = { t: Date.now(), lista: lista.slice(0, 5000).filter(x => x && typeof x.nev === "string" && /^\.?[A-Za-z0-9_]{1,16}$/.test(x.nev) && (x.tipus === "ban" || x.tipus === "mute")).map(x => ({ nev: x.nev.replace(/^\./, "").toLowerCase(), tipus: x.tipus, lejar: Math.max(0, Number(x.lejar) || 0), indok: String(x.indok || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 200) })) };
  save();
  res.json({ ok: true, db: db.buntetesek.lista.length });
});
app.post("/api/mc/status", limit(200, 6e5), (req, res) => {
  const key = String(process.env.MC_API_KEY || "");
  if (key && !same(String(req.get("x-icemine-key") || ""), key)) return fail(res, 401, "Hibás kulcs.");
  const m = (req.body || {}).modes, modes = {};
  if (m && typeof m === "object") for (const [k, v] of Object.entries(m).slice(0, 30)) if (/^[a-z0-9_-]{1,24}$/i.test(k) && Number.isInteger(v) && v >= 0 && v < 1e5) modes[k.toLowerCase()] = v;
  modAll = { t: Date.now(), modes };
  res.json({ ok: true });
});
app.get("/api/mc/coins", limit(400, 6e5), (req, res) => {
  const key = String(process.env.MC_API_KEY || "");
  if (key && !same(String(req.get("x-icemine-key") || ""), key)) return fail(res, 401, "Hibás kulcs.");
  const names = [...new Set(String(req.query.names || "").toLowerCase().split(",").map(s => s.trim()).filter(n => /^[a-z0-9_]{1,16}$/.test(n)))].slice(0, 200);
  const players = {};
  for (const n of names) { const u = db.users[n]; if (u && u.verified) { rangLejart(u); players[n] = { coins: u.coins || 0, rank: u.rank || "default", skin: u.skin && u.id ? u.skin.v : 0, slim: !!(u.skin && u.skin.slim) }; } }
  res.set("Cache-Control", "no-store").json({ players });
});

const mcHibak = new Map();
setInterval(() => { const n = Date.now(); for (const [k, v] of mcHibak) if (v.zar < n && n - v.t > 9e5) mcHibak.delete(k); }, 3e5).unref();
app.post("/api/mc/login", limit(300, 6e5), (req, res) => {
  const key = String(process.env.MC_API_KEY || "");
  if (key && !same(String(req.get("x-icemine-key") || ""), key)) return fail(res, 401, "Hibás kulcs.");
  const { name = "", password = "" } = req.body || {};
  const k = String(name).toLowerCase();
  if (!/^[a-z0-9_]{1,16}$/.test(k) || typeof password !== "string" || !password || password.length > 100) return fail(res, 400, "Hibás kérés.");
  const most = Date.now(), h = mcHibak.get(k);
  if (h && h.zar > most) return res.status(429).json({ error: "Túl sok rossz jelszó.", wait: Math.ceil((h.zar - most) / 1000) });
  const u = db.users[k];
  res.set("Cache-Control", "no-store");
  if (!u || !taken(u)) return res.json({ result: "nincs" });
  if (!same(u.hash, hashPw(password, u.salt))) {
    const x = h && most - h.t < 9e5 ? h : { n: 0, t: most, zar: 0 };
    x.n++; x.t = most;
    if (x.n >= 8) { x.zar = most + 9e5; x.n = 0; }
    mcHibak.set(k, x);
    return res.json({ result: "hibas" });
  }
  mcHibak.delete(k);
  if (!u.verified) return res.json({ result: "megerosites" });
  meghivoJutalom(u);
  res.json({ result: "ok", name: u.name, created: u.created || 0 });
});

app.get("/fonts/:file", (req, res) => {
  if (!/^[a-z0-9-]+\.woff2?$/.test(req.params.file || "")) return res.status(404).type("text/plain").send("Nincs ilyen fájl.");
  res.set({ "Content-Type": req.params.file.endsWith(".woff2") ? "font/woff2" : "font/woff", "Cache-Control": "public, max-age=2592000", "Access-Control-Allow-Origin": "*" });
  res.sendFile(path.join(__dirname, "fonts", req.params.file));
});
app.get(["/favicon.png", "/favicon.ico"], (req, res) => res.sendFile(path.join(__dirname, "favicon.png")));
app.get("/robots.txt", (req, res) => res.type("text/plain").send("User-agent: *\nAllow: /\nDisallow: /api/\n"));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
boot().catch(e => { console.error("Indítási hiba:", e.message); process.exit(1); });
