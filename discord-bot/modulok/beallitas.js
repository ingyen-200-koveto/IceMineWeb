const { P, ment, beall, kartya, rejtett, hiba, siker, tudIrni } = require("../kozos");
const statusz = require("./statusz");
const weboldal = require("./weboldal");

const CSATORNA_NEVEK = { udvozlo: "Üdvözlő üzenetek", otletek: "Ötletek", vasarlasok: "Vásárlások" };
const NAPLO_TIPUSOK = {
  fo: "📒 Fő napló (moderálás, ticketek és minden, aminek nincs külön csatornája)",
  uzenet: "💬 Üzenetek (törlés, szerkesztés, automod)",
  tag: "👥 Tagok (belépés, kilépés, rangok, becenevek, boost, kitiltások)",
  hang: "🔊 Hangcsatornák",
  szerver: "🏰 Szerver (csatornák, rangok, meghívók)",
  web: "🌐 Weboldal (regisztrációk, utalások, összekötések, rangok)",
  parancs: "⌨️ Parancshasználat (csak ha külön csatornát adsz meg)",
};

function rangHiba(i, rang) {
  if (rang.managed || rang.id === i.guild.id) return `Ezt a rangot nem lehet kiosztani: ${rang}`;
  if (rang.position >= i.guild.members.me.roles.highest.position) {
    return `Ez a rang feljebb van, mint a bot rangja: ${rang}. Húzd a bot rangját fölé a Szerverbeállítások > Rangok listában.`;
  }
  return null;
}

async function beallitas(i) {
  const sub = i.options.getSubcommand();
  const b = beall(i.guild.id);
  const me = i.guild.members.me;

  if (sub === "mutat") {
    const cs = (v) => (v ? `<#${v}>` : "`nincs`");
    const rg = (v) => (v ? `<@&${v}>` : "`nincs`");
    const kapcs = (v) => (v ? "🟢 be" : "⚫ ki");
    const jutalmak = Object.entries(b.szintRangok || {})
      .sort((x, y) => Number(x[0]) - Number(y[0]))
      .map(([sz, r]) => `⭐ ${sz}. szint → <@&${r}>`);
    const k = kartya()
      .szoveg("### ⚙️ Beállítások")
      .szoveg(
        "**📍 Csatornák**",
        `👋 Üdvözlés: ${cs(b.udvozlo)}`,
        `💡 Ötletek: ${cs(b.otletek)}`,
        `🛒 Vásárlások: ${cs(b.vasarlasok)}`,
        `📊 Státusz panel: ${b.statuszPanel ? cs(b.statuszPanel.csatorna) : "`nincs`"}`,
        `🔢 Online számláló: ${cs(b.szamlalo)}`,
      )
      .elvalaszto()
      .szoveg(
        "**📒 Naplók**",
        ...Object.entries(NAPLO_TIPUSOK).map(([t, nev]) => `${nev.split(" (")[0]}: ${t === "fo" ? cs(b.naplo) : b.naplok && b.naplok[t] ? cs(b.naplok[t]) : t === "parancs" ? "`ki`" : "→ fő napló"}`),
      )
      .elvalaszto()
      .szoveg(
        "**🎖️ Weboldal rangok**",
        ...(b.webRangok && Object.keys(b.webRangok).length
          ? weboldal.RANG_ALAP.map((r) => `${(weboldal.RANG_STILUS[r.id] || {}).emoji || "🎖️"} ${r.nev} → ${rg(b.webRangok[r.id])}`)
          : ["-# Még nincsenek beállítva: `/rangok-letrehozas`"]),
      )
      .elvalaszto()
      .szoveg("**🎫 Ticketek és rangok**", `📁 Ticket kategória: ${cs(b.ticketKategoria)}`, `🛡️ Staff rang: ${rg(b.staffRang)}`, `🎭 Autorang: ${rg(b.autorang)}`)
      .elvalaszto()
      .szoveg(
        "**🧩 Funkciók**",
        `🚫 Linkszűrő: ${kapcs(b.linkszuro)}`,
        `⭐ Szintrendszer: ${kapcs(!b.szintekKi)}${b.szintCsatorna ? ` · szintlépések: <#${b.szintCsatorna}>` : ""}`,
        ...(jutalmak.length ? jutalmak : ["-# Nincs szint jutalom beállítva."]),
      )
      .lab("Módosítás: /beallitas • 🧊 IceMine");
    return rejtett(i, k);
  }

  if (sub === "naplo") {
    const ch = i.options.getChannel("csatorna");
    const tipus = i.options.getString("tipus") || "fo";
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}. Adj jogot a botnak ehhez a csatornához.`);
    if (tipus === "fo") b.naplo = ch.id;
    else (b.naplok ||= {})[tipus] = ch.id;
    ment();
    return siker(i, `${NAPLO_TIPUSOK[tipus].split(" (")[0]} ide megy: ${ch}`);
  }

  if (sub === "webrang") {
    const rangId = i.options.getString("weboldal_rang");
    const szerep = i.options.getRole("discord_rang");
    b.webRangok ||= {};
    if (!szerep) {
      delete b.webRangok[rangId];
      ment();
      return siker(i, "Kész, ehhez a weboldal ranghoz most nem tartozik Discord rang.");
    }
    const h = rangHiba(i, szerep);
    if (h) return hiba(i, h);
    b.webRangok[rangId] = szerep.id;
    ment();
    weboldal.szinkron(i.client).catch(() => {});
    return siker(i, `Aki a weboldalon ${(weboldal.RANG_ALAP.find((r) => r.id === rangId) || { nev: rangId }).nev} rangú, itt ezt kapja: ${szerep}`);
  }

  if (CSATORNA_NEVEK[sub]) {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}. Adj jogot a botnak ehhez a csatornához.`);
    b[sub] = ch.id;
    ment();
    return siker(i, `${CSATORNA_NEVEK[sub]}: ${ch}`);
  }

  if (sub === "ticket") {
    const kat = i.options.getChannel("kategoria");
    const rang = i.options.getRole("staff");
    if (!kat.permissionsFor(me).has([P.ViewChannel, P.ManageChannels])) return hiba(i, `Ebben a kategóriában nem tudok csatornát nyitni: ${kat}`);
    b.ticketKategoria = kat.id;
    b.staffRang = rang.id;
    ment();
    return siker(i, `A ticketek ebben a kategóriában nyílnak: **${kat.name}**. Staff rang: ${rang}.\n👉 Most rakd ki a panelt: \`/ticket-panel\``);
  }

  if (sub === "autorang") {
    const rang = i.options.getRole("rang");
    if (!rang) {
      delete b.autorang;
      ment();
      return siker(i, "Kikapcsoltam az autorangot.");
    }
    const h = rangHiba(i, rang);
    if (h) return hiba(i, h);
    b.autorang = rang.id;
    ment();
    return siker(i, `Minden új tag megkapja ezt: ${rang}`);
  }

  if (sub === "szamlalo") {
    const ch = i.options.getChannel("csatorna");
    if (!ch) {
      delete b.szamlalo;
      ment();
      return siker(i, "Kikapcsoltam az online számlálót.");
    }
    if (!ch.permissionsFor(me).has([P.ViewChannel, P.ManageChannels])) return hiba(i, `Ezt a csatornát nem tudom átnevezni: ${ch}`);
    b.szamlalo = ch.id;
    ment();
    await statusz.szamlaloFrissit(i.guild, true);
    return siker(i, `${ch} neve 10 percenként mutatja, hányan vannak fent.`);
  }

  if (sub === "linkszuro") {
    b.linkszuro = i.options.getBoolean("be");
    ment();
    return siker(
      i,
      b.linkszuro
        ? "Bekapcsoltam. A bot törli a más Discord szerverekre mutató meghívókat és a tömeges megemlítéseket (a staffra nem vonatkozik)."
        : "Kikapcsoltam a linkszűrőt.",
    );
  }

  if (sub === "szintek") {
    const be = i.options.getBoolean("be");
    const ch = i.options.getChannel("csatorna");
    if (ch && !tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
    if (be) delete b.szintekKi;
    else b.szintekKi = true;
    if (ch) b.szintCsatorna = ch.id;
    else if (be) delete b.szintCsatorna;
    ment();
    if (!be) return siker(i, "Kikapcsoltam a szintrendszert. Az eddigi XP megmarad.");
    return siker(i, ch ? `Bekapcsolva, a szintlépések ide mennek: ${ch}` : "Bekapcsolva, a szintlépést abba a csatornába írom, ahol épp írt az illető.");
  }

  if (sub === "szintrang") {
    const szint = i.options.getInteger("szint");
    const rang = i.options.getRole("rang");
    b.szintRangok ||= {};
    if (!rang) {
      delete b.szintRangok[szint];
      ment();
      return siker(i, `${szint}. szinten már nem jár rang.`);
    }
    const h = rangHiba(i, rang);
    if (h) return hiba(i, h);
    b.szintRangok[szint] = rang.id;
    ment();
    return siker(i, `${szint}. szinttől jár ez a rang: ${rang}`);
  }
}

module.exports = { parancsok: { beallitas } };
