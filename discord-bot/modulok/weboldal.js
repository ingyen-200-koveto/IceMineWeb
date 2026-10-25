const { MessageFlags } = require("discord.js");
const { K, adat, ment, mentKesobb, beall, embed, kartya, linkGomb, valasz, hiba, csatorna, tudIrni, naplo, naploCsatorna, unix } = require("../kozos");

const BELSO = (process.env.BELSO_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");

const RANG_ALAP = [
  { id: "bronz", nev: "Bronz" },
  { id: "abyss", nev: "Wizard" },
  { id: "iceking", nev: "IceKing" },
  { id: "yeti", nev: "Yeti" },
];
const RANG_STILUS = {
  bronz: { szin: 0xc46f37, emoji: "🥉" },
  abyss: { szin: 0x8b6cff, emoji: "🔮" },
  iceking: { szin: 0x3fb4ff, emoji: "👑" },
  yeti: { szin: 0xf2b23a, emoji: "❄️" },
};
const REGI_NEVEK = { abyss: "Abyss" };
const stilus = (id) => RANG_STILUS[id] || { szin: K.SZIN, emoji: "🎖️" };

let elerheto = null;

async function web(ut, body) {
  const r = await fetch(BELSO + ut, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const d = await r.json().catch(() => ({}));
  if (elerheto !== true) console.log("Weboldal kapcsolat: rendben.");
  elerheto = true;
  return { ...d, ok: r.ok, status: r.status };
}

async function webBiztos(ut, body) {
  try {
    return await web(ut, body);
  } catch (e) {
    if (elerheto !== false) console.log("Weboldal kapcsolat: most nem érem el a weboldalt (" + (e.cause ? e.cause.code || e.message : e.message) + ").");
    elerheto = false;
    return null;
  }
}

const szam = (n) => String(Math.round(Number(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
const mcFej = (nev) => `https://mc-heads.net/avatar/${encodeURIComponent(nev || "MHF_Steve")}/128`;

function vasarlasKartya(e) {
  const osszeg = e.fizetes === "ft" ? `${szam(e.huf)} Ft` : `${szam(e.ic)} IceCoin`;
  const sorok = [
    "### 🛒 Új vásárlás",
    `👤 **Vevő:** ${e.user}${e.discord ? ` (<@${e.discord}>)` : ""}`,
    `📦 **Termék:** ${(e.tetelek || []).join(", ") || "ismeretlen"}`,
    e.eredmeny ? `🎡 **Eredmény:** ${e.eredmeny}` : null,
    `💰 **Összeg:** ${osszeg}`,
    `🕒 **Időpont:** <t:${unix(e.t)}:f>`,
    `🧾 **Rendelés:** \`${e.rendeles || "–"}\``,
  ].filter(Boolean);
  return kartya(e.fizetes === "ft" ? K.ZOLD : K.ARANY)
    .kepes(sorok.join("\n"), mcFej(e.user))
    .lab(e.fizetes === "ft" ? "💳 Bankkártyás fizetés • 🧊 IceMine WebShop" : "💎 IceCoinos fizetés • 🧊 IceMine WebShop");
}

function webNaploEmbed(e) {
  const ki = `**${e.user}**`;
  if (e.tipus === "regisztracio") return embed(K.ZOLD).setTitle("🆕 Új regisztráció a weboldalon").setDescription(`👤 ${ki}`);
  if (e.tipus === "utalas")
    return embed(K.SZIN)
      .setTitle("💸 IceCoin utalás")
      .setDescription(`${ki} → **${e.cimzett}**: ${szam(e.ic)} IceCoin${e.uzenet ? `\n💬 ${e.uzenet}` : ""}`);
  if (e.tipus === "osszekotes") return embed(K.ZOLD).setTitle("🔗 Discord összekötés").setDescription(`${ki} ↔ <@${e.discord}> (${e.discordNev || "?"})`);
  if (e.tipus === "levalasztas") return embed(K.SZURKE).setTitle("✂️ Discord leválasztás").setDescription(`${ki} ✕ <@${e.discord}> (${e.discordNev || "?"})`);
  if (e.tipus === "rang") return embed(K.LILA).setTitle("🎡 Rangot nyert").setDescription(`${ki}: **${e.rang}** (${e.forras || "weboldal"})`);
  return null;
}

async function feldolgoz(client, e) {
  for (const g of client.guilds.cache.values()) {
    if (e.tipus === "vasarlas") {
      const b = beall(g.id);
      const ch = (await csatorna(g, b.vasarlasok)) || (await naploCsatorna(g, "web"));
      if (ch && tudIrni(ch)) await ch.send(vasarlasKartya(e).uzenet()).catch((x) => console.error("Vásárlás küldése:", x.message));
      continue;
    }
    const em = webNaploEmbed(e);
    if (em) await naplo(g, em.setTimestamp(e.t), null, "web");
  }
}

const hibaztRangok = new Set();

async function szinkron(client, csakId) {
  const r = await webBiztos("/rangok");
  if (!r || !r.ok || !Array.isArray(r.tagok)) return null;
  const nevbolId = new Map((r.rangok || RANG_ALAP).map((x) => [x.nev, x.id]));
  const most = new Map(r.tagok.map((t) => [t.discord, t]));
  const regi = adat.webKapcsolatok || {};
  for (const g of client.guilds.cache.values()) {
    const map = beall(g.id).webRangok;
    if (!map) continue;
    for (const [rid, regi] of Object.entries(REGI_NEVEK)) {
      const uj = (r.rangok || RANG_ALAP).find((x) => x.id === rid);
      const role = map[rid] && g.roles.cache.get(map[rid]);
      if (uj && role && role.name === regi && uj.nev !== regi) await role.setName(uj.nev, "Weboldal rang átnevezve").catch(() => {});
    }
    const osszes = Object.values(map).filter((id) => g.roles.cache.has(id));
    const idk = new Set([...most.keys(), ...Object.keys(regi)]);
    for (const id of idk) {
      if (csakId && id !== csakId) continue;
      const t = most.get(id);
      const kell = t ? map[nevbolId.get(t.rang)] : null;
      const m = await g.members.fetch(id).catch(() => null);
      if (!m) continue;
      for (const rid of osszes) {
        if (rid !== kell && m.roles.cache.has(rid)) {
          await m.roles.remove(rid, "Weboldal rang szinkron").catch((x) => {
            if (!hibaztRangok.has(rid)) console.error("Rang elvétele:", x.message);
            hibaztRangok.add(rid);
          });
        }
      }
      if (kell && g.roles.cache.has(kell) && !m.roles.cache.has(kell)) {
        const ok = await m.roles
          .add(kell, `Weboldal rang: ${t.rang}`)
          .then(() => true)
          .catch((x) => {
            if (!hibaztRangok.has(kell)) console.error("Rang kiosztása:", x.message);
            hibaztRangok.add(kell);
            return false;
          });
        if (ok) await naplo(g, embed(K.LILA).setTitle("🎖️ Weboldal rang kiosztva").setDescription(`<@${id}> megkapta: <@&${kell}>\n🌐 Weboldal fiók: **${t.nev}**`), null, "web");
      }
    }
  }
  if (csakId) {
    const t = most.get(csakId);
    adat.webKapcsolatok = { ...regi };
    if (t) adat.webKapcsolatok[csakId] = { nev: t.nev, rang: t.rang };
  } else {
    adat.webKapcsolatok = Object.fromEntries([...most].map(([id, t]) => [id, { nev: t.nev, rang: t.rang }]));
  }
  mentKesobb();
  return r;
}

async function esemenyKor(client) {
  const r = await webBiztos("/esemenyek?utan=" + (adat.webSeq || 0));
  if (!r || !r.ok || !Array.isArray(r.esemenyek)) return;
  if (typeof r.utolso === "number" && r.utolso < (adat.webSeq || 0)) {
    adat.webSeq = r.utolso;
    ment();
    return;
  }
  let kellSzinkron = false;
  for (const e of r.esemenyek) {
    await feldolgoz(client, e).catch((x) => console.error("Weboldal esemény:", x.message));
    if (["osszekotes", "levalasztas", "rang"].includes(e.tipus) || (e.tipus === "vasarlas" && e.rang)) kellSzinkron = true;
    adat.webSeq = e.seq;
  }
  if (r.esemenyek.length) ment();
  if (kellSzinkron) await szinkron(client);
}

function indit(client) {
  let fut = false;
  const kor = async () => {
    if (fut) return;
    fut = true;
    try {
      await esemenyKor(client);
    } catch (e) {
      console.error("Weboldal:", e.message);
    }
    fut = false;
  };
  kor();
  setInterval(kor, 15000);
  setTimeout(() => szinkron(client).catch(() => {}), 5000);
  setInterval(() => szinkron(client).catch(() => {}), 120000);
}

const probalkozasok = new Map();

const parancsok = {
  async osszekotes(i) {
    const lista = (probalkozasok.get(i.user.id) || []).filter((t) => Date.now() - t < 600000);
    if (lista.length >= 5) return hiba(i, "Túl sok próbálkozás. Várj pár percet, és kérj új kódot a weboldalon.");
    lista.push(Date.now());
    probalkozasok.set(i.user.id, lista);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await webBiztos("/osszekotes", { kod: i.options.getString("kod"), discordId: i.user.id, discordNev: i.user.username });
    if (!r) return hiba(i, "A weboldal most nem érhető el. Próbáld újra pár perc múlva.");
    if (!r.ok) return hiba(i, r.error || "Nem sikerült az összekötés.");
    probalkozasok.delete(i.user.id);
    await szinkron(i.client, i.user.id).catch(() => {});
    const st = stilus((RANG_ALAP.find((x) => x.nev === r.rang) || {}).id);
    return valasz(
      i,
      kartya(K.ZOLD)
        .kepes(
          [
            "### 🔗 Sikeres összekötés!",
            `🌐 **Weboldal fiók:** ${r.nev}`,
            `${st.emoji} **Rang:** ${r.rang === "default" ? "nincs" : r.rang}`,
            "-# Ha a weboldalon rangot veszel, itt is magától megkapod.",
          ].join("\n"),
          mcFej(r.nev),
        )
        .lab(),
    );
  },

  async fiok(i) {
    const user = i.options.getUser("tag") || i.user;
    const sajat = user.id === i.user.id;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await webBiztos("/fiok?discord=" + user.id);
    if (!r) return hiba(i, "A weboldal most nem érhető el. Próbáld újra pár perc múlva.");
    if (!r.ok) {
      if (!sajat) return hiba(i, `${user.username} még nem kötötte össze a fiókját.`);
      return valasz(
        i,
        kartya(K.SZIN)
          .szoveg(
            "### 🔗 Még nincs összekötve",
            "1. Lépj be a weboldalon, és nyisd meg a **Karakter** oldalt",
            "2. A **Discord összekötés** résznél kérj kódot",
            "3. Írd be itt: `/osszekotes kod:123456`",
          )
          .sor(linkGomb("Weboldal", K.WEB, "🌐"))
          .lab(),
      );
    }
    const st = stilus((RANG_ALAP.find((x) => x.nev === r.rang) || {}).id);
    const sorok = [`### 🌐 ${r.nev}`, `${st.emoji} **Rang:** ${r.rang === "default" ? "nincs" : r.rang}`];
    if (sajat) sorok.push(`💎 **IceCoin:** ${szam(r.coins)}`);
    if (r.created) sorok.push(`📅 **Regisztrált:** <t:${unix(r.created)}:D>`);
    sorok.push(`🔗 **Discord:** ${user}`);
    return valasz(i, kartya(st.szin).kepes(sorok.join("\n"), mcFej(r.nev)).sor(linkGomb("Weboldal", K.WEB, "🌐")).lab());
  },

  async "rangok-letrehozas"(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await webBiztos("/rangok");
    const rangok = r && r.ok && Array.isArray(r.rangok) && r.rangok.length ? r.rangok : RANG_ALAP;
    const b = beall(i.guild.id);
    b.webRangok ||= {};
    const sorok = [];
    for (const rang of [...rangok].reverse()) {
      const meglevo = b.webRangok[rang.id] && i.guild.roles.cache.get(b.webRangok[rang.id]);
      const st = stilus(rang.id);
      if (meglevo) {
        sorok.unshift(`${st.emoji} ${meglevo} · már megvolt`);
        continue;
      }
      const uj = await i.guild.roles.create({ name: rang.nev, colors: { primaryColor: st.szin }, hoist: true, mentionable: false, reason: `Weboldal rang: ${rang.nev}` });
      b.webRangok[rang.id] = uj.id;
      sorok.unshift(`${st.emoji} ${uj} · létrehozva`);
    }
    ment();
    const s = await szinkron(i.client).catch(() => null);
    const k = kartya(K.ZOLD).szoveg("### 🎖️ Weboldal rangok", ...sorok);
    k.szoveg(s ? `-# ${s.tagok.length} összekötött tag rangját beállítottam.` : "-# A weboldalt most nem értem el, a rangokat később osztom ki.");
    return valasz(i, k.lab("A rangokat a Rangok listában bárhova húzhatod, a bot rangja alá • 🧊 IceMine"));
  },
};

module.exports = { parancsok, indit, szinkron, RANG_ALAP, RANG_STILUS };
