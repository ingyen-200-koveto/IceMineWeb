const { ButtonStyle, ChannelType, version: djsVerzio } = require("discord.js");
const { K, adat, ment, mentKesobb, allapot, kartya, gomb, linkGomb, valasz, hiba, rejtett, csatorna, tudIrni, idoErtelmez, idoSzoveg, unix, vagas, avatar } = require("../kozos");

function szamol(kifejezes) {
  const s = String(kifejezes)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[×x]/g, "*")
    .replace(/÷|:/g, "/")
    .replace(/\*\*/g, "^");
  if (!s || s.length > 200) throw new Error("hossz");
  let p = 0;
  let melyseg = 0;
  const kov = () => s[p];
  function szam() {
    const m = /^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(p));
    if (!m) throw new Error("szám");
    p += m[0].length;
    return parseFloat(m[0]);
  }
  function zarojel() {
    if (s[p++] !== ")") throw new Error("zárójel");
  }
  function tenyezo() {
    if (++melyseg > 100) throw new Error("mély");
    let v;
    if (kov() === "+") {
      p++;
      v = tenyezo();
    } else if (kov() === "-") {
      p++;
      v = -tenyezo();
    } else {
      if (kov() === "(") {
        p++;
        v = osszeg();
        zarojel();
      } else if (s.startsWith("sqrt(", p) || s.startsWith("gyok(", p)) {
        p += 5;
        v = Math.sqrt(osszeg());
        zarojel();
      } else if (s.startsWith("pi", p)) {
        p += 2;
        v = Math.PI;
      } else {
        v = szam();
      }
      if (kov() === "^") {
        p++;
        v = Math.pow(v, tenyezo());
      }
    }
    melyseg--;
    return v;
  }
  function szorzat() {
    let v = tenyezo();
    while (kov() === "*" || kov() === "/" || kov() === "%") {
      const op = s[p++];
      const r = tenyezo();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function osszeg() {
    let v = szorzat();
    while (kov() === "+" || kov() === "-") {
      const op = s[p++];
      const r = szorzat();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = osszeg();
  if (p !== s.length) throw new Error("maradék");
  return v;
}

const szamSzoveg = (v) => (Number.isInteger(v) ? v.toLocaleString("hu-HU") : v.toLocaleString("hu-HU", { maximumFractionDigits: 8 }));

const RSVP = {
  igen: { nev: "Ott leszek", emoji: "✅", stilus: ButtonStyle.Success },
  talan: { nev: "Talán", emoji: "🤔", stilus: ButtonStyle.Secondary },
  nem: { nev: "Nem jövök", emoji: "❌", stilus: ButtonStyle.Danger },
};

function esemenyKartya(r) {
  const lista = (ids) => (ids.length ? ids.slice(0, 15).map((id) => `<@${id}>`).join(" ") + (ids.length > 15 ? ` +${ids.length - 15}` : "") : "-# még senki");
  const k = kartya(K.ROZSA).banner("esemeny");
  if (r.ping) k.szoveg(`<@&${r.ping}>`);
  k.szoveg(`## 📅 ${r.cim}`, r.leiras || null)
    .elvalaszto()
    .szoveg(`🕒 **Mikor:** ${r.mikor}`, `🎙️ **Szervező:** <@${r.szervezo}>`)
    .elvalaszto();
  for (const [kulcs, v] of Object.entries(RSVP)) k.szoveg(`${v.emoji} **${v.nev} (${r[kulcs].length})**`, lista(r[kulcs]));
  return k.sor(...Object.entries(RSVP).map(([kulcs, v]) => gomb(`esemeny:${kulcs}`, v.nev, v.stilus, v.emoji))).lab("Jelezd, hogy jössz-e! • 🧊 IceMine");
}

const parancsok = {
  async szerverinfo(i) {
    const g = i.guild;
    const cs = [...g.channels.cache.values()];
    const szoveges = cs.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).length;
    const hang = cs.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).length;
    const ikon = (g.iconURL && g.iconURL({ extension: "png", size: 256 })) || K.LOGO;
    const k = kartya()
      .kepes(
        [
          `### 🏰 ${g.name}`,
          `👑 **Tulaj:** <@${g.ownerId}>`,
          `👥 **Tagok:** ${g.memberCount}`,
          `💬 **Csatornák:** ${szoveges} szöveges · ${hang} hang`,
          `🎭 **Rangok:** ${Math.max(0, g.roles.cache.size - 1)}`,
          `🚀 **Boost:** ${g.premiumTier || 0}. szint · ${g.premiumSubscriptionCount || 0} boost`,
          `📅 **Létrehozva:** <t:${unix(g.createdTimestamp)}:D> (<t:${unix(g.createdTimestamp)}:R>)`,
        ].join("\n"),
        ikon,
      )
      .lab();
    return valasz(i, k);
  },

  async emlekezteto(i) {
    const ido = idoErtelmez(i.options.getString("ido"));
    const szoveg = i.options.getString("szoveg");
    if (!ido || ido < 60000 || ido > 30 * 86400000) return hiba(i, "Az időt így add meg: `10p`, `2ó`, `1n12ó`. Legalább 1 perc, legfeljebb 30 nap.");
    const sajat = adat.emlekeztetok.filter((e) => e.uid === i.user.id);
    if (sajat.length >= 10) return hiba(i, "Egyszerre legfeljebb 10 emlékeztetőd lehet.");
    const lejar = Date.now() + ido;
    adat.emlekeztetok.push({ uid: i.user.id, gid: i.guild.id, csatorna: i.channel.id, lejar, szoveg, letrehozva: Date.now() });
    ment();
    return rejtett(i, kartya(K.ZOLD).szoveg("### ⏰ Rendben!", `<t:${unix(lejar)}:R> szólok neked:`, `> ${szoveg}`).lab("Privát üzenetben jövök • 🧊 IceMine"));
  },

  async afk(i) {
    const ok = i.options.getString("ok") || "";
    const tar = (adat.afk[i.guild.id] ||= {});
    const r = { ok, ido: Date.now() };
    const me = i.guild.members.me;
    if (i.member && i.member.manageable !== false && i.user.id !== i.guild.ownerId && me) {
      const eredeti = i.member.nickname || null;
      const nev = eredeti || i.user.globalName || i.user.username;
      if (!nev.startsWith("[AFK]")) {
        const sikerult = await i.member
          .setNickname(vagas(`[AFK] ${nev}`, 32), "AFK")
          .then(() => true)
          .catch(() => false);
        if (sikerult) r.eredetiNev = eredeti;
      }
    }
    tar[i.user.id] = r;
    mentKesobb();
    return valasz(i, kartya(K.SZURKE).szoveg(`💤 ${i.user} most AFK${ok ? `: ${ok}` : "."}`, "-# Ha legközelebb írsz, leveszem."), { allowedMentions: { parse: [] } });
  },

  async szamol(i) {
    const kif = i.options.getString("kifejezes");
    let v;
    try {
      v = szamol(kif);
    } catch {
      return hiba(i, "Ezt nem értem. Példa: `(64*3)+12`, `2^10`, `sqrt(144)`.");
    }
    if (!Number.isFinite(v)) return hiba(i, "Ezt nem lehet kiszámolni (nullával osztás?).");
    const sorok = ["### 🧮 Számológép", `\`${vagas(kif, 150)}\``, `= **${szamSzoveg(v)}**`];
    if (Number.isInteger(v) && v >= 64 && v < 1e9) {
      const stack = Math.floor(v / 64);
      const marad = v % 64;
      sorok.push(`-# 📦 Minecraftban: ${stack} stack${marad ? ` + ${marad} db` : ""}`);
    }
    return valasz(i, kartya().szoveg(...sorok).lab());
  },

  async skin(i) {
    const nev = i.options.getString("nev").trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nev)) return hiba(i, "Ez nem érvényes Minecraft név (3–16 karakter, betű, szám, alsóvonás).");
    const k = kartya()
      .kepes(`### 👕 ${nev} skinje`, `https://mc-heads.net/avatar/${nev}/128`)
      .galeria(`https://mc-heads.net/body/${nev}/right`)
      .sor(linkGomb("Skin letöltése", `https://mc-heads.net/download/${nev}`, "⬇️"))
      .lab("Ha nincs ilyen fiók, Steve jelenik meg • 🧊 IceMine");
    return valasz(i, k);
  },

  async meghivo(i) {
    return valasz(
      i,
      kartya()
        .kepes(`### 💌 Hívd meg a barátaidat!\n${K.DISCORD_LINK}\n-# Minél többen vagyunk, annál jobb! 🧊`, K.LOGO)
        .sor(linkGomb("Meghívó", K.DISCORD_LINK, "💌"))
        .lab(),
    );
  },

  async botinfo(i) {
    const mem = Math.round(process.memoryUsage().rss / 1048576);
    const k = kartya()
      .kepes(
        [
          "### 🤖 IceMine bot",
          `⏱️ **Fut:** ${idoSzoveg(Date.now() - K.INDULAS)}`,
          `📶 **Ping:** ${Math.max(0, Math.round(i.client.ws.ping))} ms`,
          `🧠 **Memória:** ${mem} MB`,
          `📚 **Parancsok:** ${allapot.parancsSzam || "?"}`,
          `🛠️ discord.js v${djsVerzio} · Node ${process.version}`,
        ].join("\n"),
        avatar(i.client.user),
      )
      .lab("Az IceMine közösségnek készült 💙 • 🧊 IceMine");
    return valasz(i, k);
  },

  async ping(i) {
    const valaszido = Math.max(0, Date.now() - i.createdTimestamp);
    const ws = Math.max(0, Math.round(i.client.ws.ping));
    const szin = ws < 150 ? K.ZOLD : ws < 400 ? K.SARGA : K.PIROS;
    return valasz(i, kartya(szin).szoveg("### 🏓 Pong!", `📶 **Gateway:** ${ws} ms`, `⚡ **Válaszidő:** ${valaszido} ms`).lab());
  },

  async esemeny(i) {
    const ch = i.options.getChannel("csatorna") || i.channel;
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
    const ping = i.options.getRole("ping");
    const r = {
      gid: i.guild.id,
      cim: i.options.getString("cim"),
      mikor: i.options.getString("mikor"),
      leiras: i.options.getString("leiras") || "",
      szervezo: i.user.id,
      ping: ping ? ping.id : null,
      igen: [],
      talan: [],
      nem: [],
      ido: Date.now(),
    };
    const msg = await ch.send(esemenyKartya(r).uzenet({ allowedMentions: { roles: r.ping ? [r.ping] : [] } }));
    adat.esemenyek[msg.id] = r;
    ment();
    return rejtett(i, kartya(K.ZOLD).szoveg(`📅 Kint van az esemény: ${msg.url}`));
  },
};

async function esemenyGomb(i) {
  const r = adat.esemenyek[i.message.id];
  if (!r) return hiba(i, "Ez az esemény már nem él.");
  const kulcs = i.customId.split(":")[1];
  if (!RSVP[kulcs]) return hiba(i, "Ismeretlen gomb.");
  const volt = r[kulcs].includes(i.user.id);
  for (const k of Object.keys(RSVP)) r[k] = r[k].filter((id) => id !== i.user.id);
  if (!volt) r[kulcs].push(i.user.id);
  mentKesobb();
  await i.update(esemenyKartya(r).uzenet());
  return rejtett(i, kartya().szoveg(volt ? "↩️ Visszavontad a jelentkezésed." : `${RSVP[kulcs].emoji} Rögzítettem: **${RSVP[kulcs].nev}**`));
}

async function uzenet(m) {
  if (!m.guild || !m.author || m.author.bot) return;
  const tar = adat.afk[m.guild.id];
  if (!tar) return;
  const sajat = tar[m.author.id];
  if (sajat) {
    delete tar[m.author.id];
    mentKesobb();
    if (m.member && m.member.nickname && m.member.nickname.startsWith("[AFK]")) {
      await m.member.setNickname(sajat.eredetiNev || null, "Visszajött az AFK-ból").catch(() => {});
    }
    if (tudIrni(m.channel)) {
      const v = await m.channel
        .send(kartya(K.ZOLD).szoveg(`👋 Üdv újra, ${m.author}! Levettem az AFK-t. (${idoSzoveg(Date.now() - sajat.ido)} voltál távol)`).uzenet({ allowedMentions: { users: [m.author.id] } }))
        .catch(() => null);
      if (v) setTimeout(() => v.delete().catch(() => {}), 8000);
    }
  }
  if (!m.mentions || !m.mentions.users || !m.mentions.users.size) return;
  const afkosok = [...m.mentions.users.values()].filter((u) => u.id !== m.author.id && tar[u.id]).slice(0, 3);
  if (!afkosok.length || !tudIrni(m.channel)) return;
  const sorok = afkosok.map((u) => `💤 **${u.username}** most AFK${tar[u.id].ok ? `: ${tar[u.id].ok}` : ""} · <t:${unix(tar[u.id].ido)}:R> óta`);
  const v = await m.channel.send(kartya(K.SZURKE).szoveg(...sorok).uzenet()).catch(() => null);
  if (v) setTimeout(() => v.delete().catch(() => {}), 15000);
}

function indit(client) {
  const kor = async () => {
    const most = Date.now();
    const lejart = adat.emlekeztetok.filter((e) => e.lejar <= most);
    if (!lejart.length) return;
    adat.emlekeztetok = adat.emlekeztetok.filter((e) => e.lejar > most);
    ment();
    for (const e of lejart) {
      const k = kartya(K.SARGA).szoveg("### ⏰ Emlékeztető", `> ${e.szoveg}`).lab(`<t:${unix(e.letrehozva)}:R> kérted • 🧊 IceMine`);
      const user = await client.users.fetch(e.uid).catch(() => null);
      const ok = user
        ? await user
            .send(k.uzenet())
            .then(() => true)
            .catch(() => false)
        : false;
      if (ok) continue;
      const g = client.guilds.cache.get(e.gid);
      const ch = g ? await csatorna(g, e.csatorna) : null;
      if (ch && tudIrni(ch)) {
        const k2 = kartya(K.SARGA).szoveg(`<@${e.uid}>`, "### ⏰ Emlékeztető", `> ${e.szoveg}`).lab();
        await ch.send(k2.uzenet({ allowedMentions: { users: [e.uid] } })).catch(() => {});
      }
    }
  };
  kor();
  setInterval(kor, 20000);
}

module.exports = { parancsok, elotagok: { "esemeny:": esemenyGomb }, uzenet, indit, szamol };
