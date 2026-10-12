const path = require("path");
const { ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags, StringSelectMenuBuilder } = require("discord.js");
const { K, kartya, sor, linkGomb, rejtett, valasz, hiba, csatorna, tudIrni, naplo, embed, staffE, adat, unix, vagas, avatar } = require("../kozos");
const szintek = require("./szintek");

const fuggoBejelentesek = new Map();

const SZABALYOK = [
  "🤝 **Légy tisztelettudó.** Tilos a sértegetés, a zaklatás és a diszkrimináció.",
  "🚫 **Nincs spam és reklám.** Flood, csupa nagybetű, más szerverek hirdetése tilos.",
  "🛡️ **Csalni tilos.** Hack kliens, X-Ray, makró, AutoClicker kitiltással jár. OptiFine, Sodium, Iris mehet.",
  "🐛 **A bugokat jelentsd,** ne használd ki őket.",
  "💎 **Valódi pénzes kereskedés tilos.** IceCoint, rangot, fiókot nem lehet pénzért adni-venni.",
  "👮 **A staff döntése a mérvadó** ott is, amiről a szabályzat nem szól.",
];

const SUGO = {
  alap: {
    nev: "Alap",
    emoji: "🎮",
    sorok: [
      ["ip", "szervercím és verziók"],
      ["statusz", "fent van-e a szerver"],
      ["weboldal", "az IceMine weboldala"],
      ["linkek", "minden elérhetőség"],
      ["szabalyzat", "a legfontosabb szabályok"],
      ["info", "adatok egy tagról"],
      ["szint", "a szinted és az XP-d"],
      ["toplista", "a legaktívabbak"],
      ["napi", "napi XP jutalom"],
      ["otlet", "ötlet beküldése"],
    ],
  },
  szorakozas: {
    nev: "Szórakozás",
    emoji: "🎲",
    sorok: [
      ["trivia", "Minecraft kvíz, XP jár a jó válaszért"],
      ["kpo", "kő, papír, olló a bot ellen"],
      ["8ball", "kérdezd a varázsgömböt"],
      ["fej-vagy-iras", "pénzfeldobás"],
      ["kocka", "dobókocka"],
      ["szerelem", "mennyire illetek össze"],
      ["tipp", "egy hasznos Minecraft tipp"],
      ["avatar", "valakinek a profilképe nagyban"],
    ],
  },
  kozosseg: {
    nev: "Közösség",
    emoji: "👥",
    sorok: [
      ["skin", "Minecraft skin megtekintése"],
      ["szerverinfo", "a Discord szerver adatai"],
      ["emlekezteto", "szólok, ha eljön az idő"],
      ["afk", "jelezd, hogy nem vagy gépnél"],
      ["szamol", "számológép"],
      ["meghivo", "meghívó a Discordra"],
      ["botinfo", "a botról"],
      ["ping", "a bot válaszideje"],
    ],
  },
  staff: {
    nev: "Staff",
    emoji: "🛡️",
    sorok: [
      ["bejelentes", "bejelentés kártyával"],
      ["mondd", "üzenet a bot nevében"],
      ["szavazas", "szavazás indítása"],
      ["esemeny", "esemény jelentkezéssel"],
      ["torles", "üzenetek törlése"],
      ["lassitas", "lassított mód"],
      ["zarolas", "csatorna lezárása"],
      ["nemitas", "némítás"],
      ["figyelmeztetes", "figyelmeztetések"],
      ["kirugas", "kirúgás"],
      ["kitiltas", "kitiltás, akár ideiglenesen"],
      ["kitiltas-feloldas", "kitiltás feloldása"],
      ["becenev", "becenév módosítása"],
      ["rang", "rang adása vagy elvétele"],
      ["ticket", "valaki hozzáadása a tickethez"],
      ["otlet-valasz", "döntés egy ötletről"],
    ],
  },
  admin: {
    nev: "Admin",
    emoji: "⚙️",
    sorok: [
      ["beallitas", "minden beállítás"],
      ["info-panel", "információs panel"],
      ["szabalyzat-panel", "szabályzat panel elfogadás gombbal"],
      ["ticket-panel", "ticket panel"],
      ["statusz-panel", "élő szerverállapot"],
      ["rangvalaszto", "gombos rangválasztó"],
      ["nyeremenyjatek", "nyereményjáték"],
    ],
  },
};

function sugoKartya(kat) {
  const k = SUGO[kat] || SUGO.alap;
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sugo")
    .setPlaceholder("Válassz kategóriát…")
    .addOptions(Object.entries(SUGO).map(([value, s]) => ({ label: s.nev, value, emoji: s.emoji, default: value === kat })));
  const ossz = Object.values(SUGO).reduce((a, s) => a + s.sorok.length, 0);
  return kartya()
    .banner("parancsok")
    .szoveg(`### ${k.emoji} ${k.nev}`, ...k.sorok.map(([p, l]) => `\`/${p}\` · ${l}`))
    .elvalaszto()
    .sor(menu)
    .lab(`📚 ${ossz} parancs • 🧊 IceMine`);
}

const parancsok = {
  async weboldal(i) {
    const k = kartya()
      .kepes(
        "### 🌐 IceMine weboldal\nItt tudsz regisztrálni, és itt látod az 💎 IceCoin egyenleged, a rangokat, a 🛒 WebShopot és a 🎡 Szerencsekereket is.",
        K.LOGO,
      )
      .sor(linkGomb("Weboldal megnyitása", K.WEB, "🌐"))
      .lab();
    return valasz(i, k);
  },

  async linkek(i) {
    const k = kartya()
      .szoveg(
        "### 🔗 Elérhetőségek",
        `🌐 **Weboldal:** ${K.WEB}`,
        `💬 **Discord:** ${K.DISCORD_LINK}`,
        `▶️ **YouTube:** ${K.YOUTUBE}`,
        `📸 **Instagram:** ${K.INSTAGRAM}`,
        `✉️ **E-mail:** ${K.EMAIL}`,
      )
      .elvalaszto()
      .sor(linkGomb("Weboldal", K.WEB, "🌐"), linkGomb("YouTube", K.YOUTUBE, "▶️"), linkGomb("Instagram", K.INSTAGRAM, "📸"))
      .lab();
    return valasz(i, k);
  },

  async szabalyzat(i) {
    const k = kartya(K.LILA)
      .banner("szabalyzat")
      .szoveg("### 📜 A legfontosabbak röviden", ...SZABALYOK)
      .elvalaszto()
      .szoveg("-# A szabályzat a szerverre, a weboldalra és erre a Discordra is vonatkozik. A teljes változat a weboldalon, a Dokumentumok fül alatt van.")
      .sor(linkGomb("Teljes szabályzat", K.WEB, "📜"))
      .lab();
    return valasz(i, k);
  },

  async segitseg(i) {
    return rejtett(i, sugoKartya("alap"));
  },

  async info(i) {
    const cel = i.options.getMember("tag") || i.member;
    if (!cel || !cel.user) return hiba(i, "Ő nincs fent a szerveren.");
    const u = cel.user;
    const sz = szintek.adatai(i.guild.id, u.id);
    const sorok = [
      `### 👤 ${u.username}`,
      `🆔 \`${u.id}\``,
      `📅 **Fiók:** <t:${unix(u.createdTimestamp)}:D> (<t:${unix(u.createdTimestamp)}:R>)`,
    ];
    if (cel.joinedTimestamp) sorok.push(`📥 **Csatlakozott:** <t:${unix(cel.joinedTimestamp)}:D> (<t:${unix(cel.joinedTimestamp)}:R>)`);
    sorok.push(`⭐ **Szint:** ${sz.szint} · ${sz.xp} XP`);
    if (staffE(i.member, i.guild.id)) {
      const f = ((adat.figyelmeztetesek[i.guild.id] || {})[u.id] || []).length;
      sorok.push(`⚠️ **Figyelmeztetések:** ${f}`);
    }
    const afk = (adat.afk[i.guild.id] || {})[u.id];
    if (afk) sorok.push(`💤 **AFK:** ${afk.ok || "nincs indok"}`);
    const rangok = [...cel.roles.cache.values()]
      .filter((r) => r && r.id && r.id !== i.guild.id)
      .sort((a, b) => b.position - a.position)
      .slice(0, 15)
      .map((r) => `<@&${r.id}>`);
    const k = kartya().kepes(sorok.join("\n"), avatar(u));
    if (rangok.length) k.elvalaszto().szoveg(`🎭 **Rangok:** ${rangok.join(" ")}`);
    return rejtett(i, k.lab());
  },

  async bejelentes(i) {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
    const kep = i.options.getAttachment("kep");
    const rang = i.options.getRole("rang");
    fuggoBejelentesek.set(i.user.id, {
      csatorna: ch.id,
      everyone: !!i.options.getBoolean("everyone"),
      rang: rang ? rang.id : null,
      kep: kep && kep.contentType && kep.contentType.startsWith("image/") ? { url: kep.url, nev: kep.name } : null,
    });
    const modal = new ModalBuilder()
      .setCustomId("bejelentes")
      .setTitle("📢 Bejelentés")
      .addComponents(
        sor(new TextInputBuilder().setCustomId("cim").setLabel("Cím").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)),
        sor(new TextInputBuilder().setCustomId("szoveg").setLabel("Szöveg").setStyle(TextInputStyle.Paragraph).setMaxLength(3000).setRequired(true)),
      );
    return i.showModal(modal);
  },

  async szavazas(i) {
    if (!tudIrni(i.channel)) return hiba(i, "Ebbe a csatornába nem tudok írni.");
    const kerdes = i.options.getString("kerdes");
    const valaszok = [1, 2, 3, 4, 5].map((n) => i.options.getString("valasz" + n)).filter(Boolean);
    if (valaszok.length === 1) return hiba(i, "Legalább két válasz kell. Ha mindet üresen hagyod, Igen/Nem szavazás lesz.");
    const lista = valaszok.length ? valaszok : ["Igen", "Nem"];
    const ora = i.options.getInteger("ora") || 24;
    const tobb = !!i.options.getBoolean("tobb");
    try {
      await i.channel.send({
        poll: { question: { text: kerdes }, answers: lista.map((text) => ({ text })), duration: ora, allowMultiselect: tobb },
      });
    } catch {
      const jelek = valaszok.length ? ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"] : ["✅", "❌"];
      const k = kartya()
        .szoveg(`### 📊 ${vagas(kerdes, 250)}`, ...lista.map((t, n) => `${jelek[n]} ${t}`))
        .lab(`Szavazz a reakciókkal! • ${i.user.username}`);
      const m = await i.channel.send(k.uzenet());
      for (const j of jelek.slice(0, lista.length)) await m.react(j).catch(() => {});
    }
    return rejtett(i, kartya(K.ZOLD).szoveg("✅ Kint van a szavazás."));
  },

  async torles(i) {
    const n = i.options.getInteger("mennyiseg");
    const tag = i.options.getUser("tag");
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    let torolt;
    if (tag) {
      const uzenetek = await i.channel.messages.fetch({ limit: 100 });
      const sajat = [...uzenetek.values()].filter((m) => m.author && m.author.id === tag.id).slice(0, n);
      torolt = sajat.length ? await i.channel.bulkDelete(sajat, true) : { size: 0 };
    } else {
      torolt = await i.channel.bulkDelete(n, true);
    }
    const megj = !tag && torolt.size < n ? "-# A 14 napnál régebbi üzeneteket a Discord nem engedi egyszerre törölni." : null;
    await valasz(i, kartya(K.ZOLD).szoveg(`🧹 **${torolt.size}** üzenetet töröltem.`, megj));
    return naplo(
      i.guild,
      embed(K.SARGA)
        .setTitle("🧹 Üzenetek törölve")
        .setDescription(`**Csatorna:** ${i.channel}\n**Darab:** ${torolt.size}${tag ? `\n**Csak tőle:** ${tag}` : ""}\n**Ki törölte:** ${i.user}`),
    );
  },
};

async function bejelentesKuldes(i) {
  const f = fuggoBejelentesek.get(i.user.id);
  fuggoBejelentesek.delete(i.user.id);
  if (!f) return hiba(i, "Ez lejárt, futtasd újra a `/bejelentes` parancsot.");
  const ch = await csatorna(i.guild, f.csatorna);
  if (!ch) return hiba(i, "Ez a csatorna már nem létezik.");
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const pingek = [];
  if (f.everyone) pingek.push("@everyone");
  if (f.rang) pingek.push(`<@&${f.rang}>`);
  const k = kartya();
  if (pingek.length) k.szoveg(pingek.join(" "));
  k.szoveg(`## 📢 ${i.fields.getTextInputValue("cim")}`, i.fields.getTextInputValue("szoveg"));
  const files = [];
  if (f.kep) {
    const r = await fetch(f.kep.url).catch(() => null);
    if (r && r.ok) {
      const nev = "kep" + (path.extname(f.kep.nev) || ".png").toLowerCase();
      files.push(new AttachmentBuilder(Buffer.from(await r.arrayBuffer()), { name: nev }));
      k.galeria("attachment://" + nev);
    }
  }
  k.elvalaszto().lab(`📣 IceMine csapat • <t:${unix(Date.now())}:f>`);
  await ch.send(k.uzenet({ files, allowedMentions: { parse: f.everyone ? ["everyone"] : [], roles: f.rang ? [f.rang] : [] } }));
  return valasz(i, kartya(K.ZOLD).szoveg(`✅ Kiment ide: ${ch}`));
}

async function sugoValtas(i) {
  return i.update(sugoKartya(i.values[0]).uzenet());
}

module.exports = { parancsok, modalok: { bejelentes: bejelentesKuldes }, komponensek: { sugo: sugoValtas }, SZABALYOK, SUGO };
