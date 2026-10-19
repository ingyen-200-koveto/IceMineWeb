"use strict";

const http = require("http");
const net = require("net");
const tls = require("tls");
const crypto = require("crypto");

const fs = require("fs");

function envBetolt(fajl) {
  let szoveg;
  try {
    szoveg = fs.readFileSync(fajl, "utf8");
  } catch {
    return;
  }
  for (const sor of szoveg.split(/\r?\n/)) {
    const m = sor.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if (v.startsWith('"')) {
      try {
        v = JSON.parse(v);
      } catch {
        continue;
      }
    }
    process.env[m[1]] = v;
  }
}
envBetolt(process.env.UZENET_ENV || "/var/lib/idealtherm/uzenet.env");

const K = {
  PORT: parseInt(process.env.PORT || "3100", 10),
  HOST: process.env.HOST || "127.0.0.1",
  SMTP_HOST: (process.env.SMTP_HOST || "smtp.rackhost.hu").trim(),
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "465", 10),
  SMTP_USER: (process.env.SMTP_USER || "").trim(),
  SMTP_PASS: process.env.SMTP_PASS || "",
  CEL: (process.env.CEL_EMAIL || process.env.SMTP_USER || "").trim(),
  NEV: process.env.CEG_NEV || "Idealtherm",
  TLS_ELLENORZES: process.env.SMTP_TLS_ELLENORZES !== "0",
};
K.SSL = process.env.SMTP_SSL ? process.env.SMTP_SSL === "1" : K.SMTP_PORT === 465;

const beallitva = () => !!(K.SMTP_HOST && K.SMTP_USER && K.SMTP_PASS && K.CEL);
const EMAIL_RE = /^[^\s@<>()",;:\\]{1,64}@[^\s@<>()",;:\\]{1,190}\.[a-z]{2,24}$/i;

function smtpKuld({ felado, cimzett, adat }) {
  return new Promise((ok, hiba) => {
    let sock;
    let puffer = "";
    let varo = null;
    let vege = false;
    const sorok = [];
    const idozito = setTimeout(() => lezar(new Error("Az SMTP szerver nem válaszolt időben.")), 25000);

    function lezar(e, eredmeny) {
      if (vege) return;
      vege = true;
      clearTimeout(idozito);
      try {
        sock && sock.destroy();
      } catch {}
      if (e) hiba(e);
      else ok(eredmeny);
    }

    function olvas(adatok) {
      puffer += adatok.toString("utf8");
      let i;
      while ((i = puffer.indexOf("\n")) !== -1) {
        const sor = puffer.slice(0, i).replace(/\r$/, "");
        puffer = puffer.slice(i + 1);
        sorok.push(sor);
        if (/^\d{3} /.test(sor) || /^\d{3}$/.test(sor)) {
          const szoveg = sorok.splice(0).join("\n");
          const kod = parseInt(sor.slice(0, 3), 10);
          if (varo) {
            const v = varo;
            varo = null;
            v({ kod, szoveg });
          }
        }
      }
    }

    function valasz() {
      return new Promise((v) => (varo = v));
    }

    function bekot(s) {
      sock = s;
      sock.on("data", olvas);
      sock.on("error", (e) => lezar(e));
      sock.on("close", () => lezar(new Error("Az SMTP kapcsolat megszakadt.")));
    }

    async function parancs(sor, vart) {
      const p = valasz();
      sock.write(sor + "\r\n");
      const r = await p;
      if (!vart.includes(r.kod)) {
        const rejtett = /^(EHLO |STARTTLS$|MAIL FROM:|RCPT TO:|DATA$)/.test(sor) ? sor.slice(0, 80) : /^AUTH/.test(sor) ? "AUTH" : sor.length > 200 ? "levél" : "hitelesítés";
        throw new Error(`SMTP hiba (${rejtett}): ${r.szoveg}`);
      }
      return r;
    }

    const tlsOpc = (extra) => ({ host: K.SMTP_HOST, servername: net.isIP(K.SMTP_HOST) ? undefined : K.SMTP_HOST, rejectUnauthorized: K.TLS_ELLENORZES, ...extra });

    (async () => {
      const implicit = K.SSL;
      const elso = valasz();
      bekot(implicit ? tls.connect(tlsOpc({ port: K.SMTP_PORT })) : net.connect({ host: K.SMTP_HOST, port: K.SMTP_PORT }));
      const udv = await elso;
      if (udv.kod !== 220) throw new Error("SMTP üdvözlés helyett: " + udv.szoveg);
      let ehlo = await parancs("EHLO idealtherm.hu", [250]);
      if (!implicit) {
        if (!/STARTTLS/i.test(ehlo.szoveg)) throw new Error("Az SMTP szerver nem támogat titkosítást ezen a porton.");
        await parancs("STARTTLS", [220]);
        sock.removeAllListeners("data");
        sock.removeAllListeners("close");
        sock.removeAllListeners("error");
        const titkos = tls.connect(tlsOpc({ socket: sock }));
        await new Promise((v, h) => {
          titkos.once("secureConnect", v);
          titkos.once("error", h);
        });
        bekot(titkos);
        ehlo = await parancs("EHLO idealtherm.hu", [250]);
      }
      const plain = Buffer.from(`\0${K.SMTP_USER}\0${K.SMTP_PASS}`).toString("base64");
      try {
        await parancs("AUTH PLAIN " + plain, [235]);
      } catch (e) {
        if (!/AUTH[^\n]*LOGIN/i.test(ehlo.szoveg)) throw e;
        await parancs("AUTH LOGIN", [334]);
        await parancs(Buffer.from(K.SMTP_USER).toString("base64"), [334]);
        await parancs(Buffer.from(K.SMTP_PASS).toString("base64"), [235]);
      }
      await parancs(`MAIL FROM:<${felado}>`, [250]);
      await parancs(`RCPT TO:<${cimzett}>`, [250, 251]);
      await parancs("DATA", [354]);
      const torzs = adat.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
      await parancs(torzs + "\r\n.", [250]);
      try {
        sock.write("QUIT\r\n");
      } catch {}
      lezar(null, true);
    })().catch((e) => lezar(e));
  });
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const fejlecSzoveg = (s) => `=?UTF-8?B?${b64(s)}?=`;
const tiszta = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const egysoros = (s, max) => tiszta(s, max).replace(/[\r\n]+/g, " ");

function level(u) {
  const most = new Date();
  const datum = most.toLocaleString("hu-HU", { timeZone: "Europe/Budapest", dateStyle: "long", timeStyle: "short" });
  const nev = `${u.vezeteknev} ${u.keresztnev}`;
  const modSzoveg = u.mod === "email" ? "E-mailben kér választ" : "Telefonon kér visszahívást";
  const sorok = [
    `Új üzenet érkezett az ${K.NEV} weboldal kapcsolat űrlapjáról.`,
    "",
    `Név: ${nev}`,
    `E-mail: ${u.email}`,
    `Telefon: ${u.telefon || "nem adta meg"}`,
    `Kapcsolatfelvétel: ${modSzoveg}`,
    "",
    "Üzenet:",
    u.uzenet,
    "",
    "--",
    `Küldve: ${datum}`,
    "Erre a levélre válaszolva közvetlenül az érdeklődőnek írsz.",
  ];
  const torzs = b64(sorok.join("\r\n")).replace(/.{76}/g, "$&\r\n");
  const targy = `Új érdeklődés: ${nev}${u.mod === "email" ? "" : " (visszahívást kér)"}`;
  const domain = (K.SMTP_USER.split("@")[1] || "idealtherm.hu").replace(/[^a-z0-9.-]/gi, "");
  const fejlec = [
    `From: ${fejlecSzoveg(K.NEV + " weboldal")} <${K.SMTP_USER}>`,
    `To: <${K.CEL}>`,
    `Reply-To: ${fejlecSzoveg(nev)} <${u.email}>`,
    `Subject: ${fejlecSzoveg(targy)}`,
    `Date: ${most.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "X-Mailer: Idealtherm weboldal",
  ];
  return fejlec.join("\r\n") + "\r\n\r\n" + torzs;
}

function ellenoriz(b) {
  const u = {
    vezeteknev: egysoros(b.vezeteknev, 60),
    keresztnev: egysoros(b.keresztnev, 60),
    email: egysoros(b.email, 254).toLowerCase(),
    telefon: egysoros(b.telefon, 30),
    mod: b.mod === "email" ? "email" : "telefon",
    uzenet: tiszta(b.uzenet, 4000).replace(/\r\n/g, "\n"),
  };
  if (!u.vezeteknev || !u.keresztnev) return [null, "Kérjük, adja meg a teljes nevét."];
  if (!EMAIL_RE.test(u.email)) return [null, "Kérjük, adjon meg egy érvényes e-mail címet."];
  if (u.telefon && !/^[+\d][\d\s()/-]{5,24}$/.test(u.telefon)) return [null, "Kérjük, ellenőrizze a telefonszámot."];
  if (u.mod === "telefon" && !u.telefon) return [null, "A visszahíváshoz kérjük, adja meg a telefonszámát."];
  if (u.uzenet.length < 5) return [null, "Kérjük, írja meg röviden, miben segíthetünk."];
  if (b.adatkezeles !== true) return [null, "Az elküldéshez el kell fogadnia az adatkezelési tájékoztatót."];
  return [u, null];
}

const keresek = new Map();
function korlat(ip) {
  const most = Date.now();
  const lista = (keresek.get(ip) || []).filter((t) => most - t < 36e5);
  if (lista.length >= 5 || (lista.length && most - lista[lista.length - 1] < 2e4)) {
    keresek.set(ip, lista);
    return false;
  }
  lista.push(most);
  keresek.set(ip, lista);
  if (keresek.size > 5000) keresek.delete(keresek.keys().next().value);
  return true;
}

function kuld(res, kod, obj) {
  const t = JSON.stringify(obj);
  res.writeHead(kod, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-length": Buffer.byteLength(t) });
  res.end(t);
}

const szerver = http.createServer((req, res) => {
  const ut = (req.url || "").split("?")[0];
  if (req.method === "GET" && ut === "/api/allapot") return kuld(res, 200, { ok: true, email: beallitva() });
  if (ut !== "/api/uzenet") return kuld(res, 404, { hiba: "Nincs ilyen oldal." });
  if (req.method !== "POST") return kuld(res, 405, { hiba: "Csak POST kérés küldhető." });
  let meret = 0;
  const darabok = [];
  req.on("data", (d) => {
    meret += d.length;
    if (meret > 20000) {
      kuld(res, 413, { hiba: "Az üzenet túl hosszú." });
      req.destroy();
    } else darabok.push(d);
  });
  req.on("end", async () => {
    if (res.writableEnded) return;
    let b;
    try {
      b = JSON.parse(Buffer.concat(darabok).toString("utf8") || "{}");
    } catch {
      return kuld(res, 400, { hiba: "Hibás kérés." });
    }
    if (b.weboldal || (Number(b.ido) > 0 && Number(b.ido) < 3000)) return kuld(res, 200, { ok: true });
    const [u, gond] = ellenoriz(b);
    if (gond) return kuld(res, 400, { hiba: gond });
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (!korlat(ip)) return kuld(res, 429, { hiba: "Túl sok üzenet érkezett innen. Kérjük, próbálja újra később." });
    if (!beallitva()) {
      console.error("Az e-mail küldés nincs beállítva (SMTP_USER, SMTP_PASS).");
      return kuld(res, 503, { hiba: "Az üzenetküldés most nem elérhető." });
    }
    try {
      await smtpKuld({ felado: K.SMTP_USER, cimzett: K.CEL, adat: level(u) });
      console.log("Üzenet elküldve: " + new Date().toISOString());
      kuld(res, 200, { ok: true });
    } catch (e) {
      console.error("E-mail küldési hiba: " + e.message);
      kuld(res, 502, { hiba: "Az üzenetküldés most nem sikerült." });
    }
  });
});

if (require.main === module) {
  if (process.argv[2] === "--proba") {
    if (!beallitva()) {
      console.error("Hiányzik az SMTP_USER vagy az SMTP_PASS.");
      process.exit(1);
    }
    const u = { vezeteknev: "Próba", keresztnev: "Levél", email: K.SMTP_USER, telefon: "", mod: "email", uzenet: "Ez egy próbalevél. Ha megkaptad, a weboldal kapcsolat űrlapja működik." };
    smtpKuld({ felado: K.SMTP_USER, cimzett: K.CEL, adat: level(u) })
      .then(() => {
        console.log("PRÓBALEVÉL ELKÜLDVE ide: " + K.CEL);
        process.exit(0);
      })
      .catch((e) => {
        console.error("HIBA: " + e.message);
        process.exit(1);
      });
  } else {
    szerver.listen(K.PORT, K.HOST, () => console.log(`Idealtherm üzenetküldő fut: ${K.HOST}:${K.PORT} (e-mail ${beallitva() ? "beállítva" : "NINCS beállítva"})`));
  }
}

module.exports = { szerver, smtpKuld, level, ellenoriz };
