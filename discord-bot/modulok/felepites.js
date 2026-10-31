const { SlashCommandBuilder, ChannelType, ButtonStyle, MessageFlags, OverwriteType, PermissionFlagsBits: P } = require("discord.js");
const { K, ment, beall, kartya, gomb, hiba, rejtett, csatorna } = require("../kozos");
const panelek = require("./panelek");
const ticket = require("./ticket");
const statusz = require("./statusz");
const rangvalaszto = require("./rangvalaszto");

const MOD = [P.ManageMessages, P.KickMembers, P.ModerateMembers, P.ManageNicknames, P.MuteMembers, P.DeafenMembers, P.MoveMembers, P.ViewAuditLog, P.ManageThreads];
const ADMIN = [...MOD, P.BanMembers, P.ManageChannels, P.ManageRoles, P.ManageGuild, P.MentionEveryone, P.PrioritySpeaker, P.ManageEvents];

const RANGOK = [
  { kulcs: "tulaj", nev: "👑 Tulajdonos", szin: 0x5cc0ff, kiemelt: true, jogok: [P.Administrator] },
  { kulcs: "admin", nev: "🛠️ Admin", szin: 0xe5484d, kiemelt: true, jogok: ADMIN },
  { kulcs: "mod", nev: "🛡️ Moderátor", szin: 0xf2b84b, kiemelt: true, jogok: MOD },
  { kulcs: "segito", nev: "🎧 Segítő", szin: 0x4fd18b, kiemelt: true, jogok: [P.ManageMessages, P.ModerateMembers, P.MoveMembers] },
  { kulcs: "staff", nev: "🧊 Staff", szin: 0, kiemelt: false, jogok: [] },
  { kulcs: "botok", nev: "🤖 Botok", szin: 0x8fa3b3, kiemelt: true, jogok: [] },
  { kulcs: "hirek", nev: "📢 Hírek", szin: 0, kiemelt: false, jogok: [] },
  { kulcs: "esemenyek", nev: "🎉 Események", szin: 0, kiemelt: false, jogok: [] },
  { kulcs: "nyeremeny", nev: "🎁 Nyereményjátékok", szin: 0, kiemelt: false, jogok: [] },
];

const T = ChannelType.GuildText;
const H = ChannelType.GuildVoice;
const N = ChannelType.GuildAnnouncement;

const FELEPITES = [
  {
    kat: "📌 INFORMÁCIÓ",
    mod: "olvas",
    csatornak: [
      { kulcs: "info", nev: "ℹ️・információ", tipus: T, tema: "Minden fontos az IceMine-ról" },
      { kulcs: "szabalyzat", nev: "📜・szabályzat", tipus: T, tema: "Olvasd el, mielőtt játszol" },
      { kulcs: "hirek", nev: "📢・hírek", tipus: N, tema: "Hivatalos IceMine hírek" },
      { kulcs: "udvozlo", nev: "👋・üdvözlés", tipus: T, tema: "Itt köszöntjük az új tagokat" },
      { kulcs: "statusz", nev: "📊・státusz", tipus: T, tema: "Fent van-e a szerver, és hányan játszanak" },
      { kulcs: "ertesitesek", nev: "🎭・értesítések", tipus: T, tema: "Válaszd ki, miről kérsz értesítést" },
      { kulcs: "szamlalo", nev: "📊 Szerver státusz", tipus: H, szamlalo: true },
    ],
  },
  {
    kat: "💬 KÖZÖSSÉG",
    mod: "nyitott",
    csatornak: [
      { kulcs: "altalanos", nev: "💬・általános", tipus: T, tema: "Beszélgetés mindenről" },
      { kulcs: "media", nev: "🖼️・képek-videók", tipus: T, tema: "Screenshotok, klipek, buildek" },
      { kulcs: "csapat", nev: "🤝・csapatkeresés", tipus: T, tema: "Csapattársat keresel? Írd ide." },
      { kulcs: "otletek", nev: "💡・ötletek", tipus: T, tema: "Ötleted van? Írd be: /otlet", otlet: true },
      { kulcs: "parancsok", nev: "🤖・bot-parancsok", tipus: T, tema: "Bot-parancsok ide, ne a chatbe" },
    ],
  },
  {
    kat: "🎮 JÁTÉKMÓDOK",
    mod: "nyitott",
    csatornak: [
      { kulcs: "kitpvp", nev: "⚔️・kitpvp", tipus: T, tema: "KitPvP: harcok, kitek, taktikák" },
      { kulcs: "kingdoms", nev: "🏰・kingdoms", tipus: T, tema: "Kingdoms: királyságok, szövetségek, háborúk" },
      { kulcs: "skypvp", nev: "☁️・skypvp", tipus: T, tema: "SkyPvP: szigetek és harc a levegőben" },
      { kulcs: "gens", nev: "⛏️・gens", tipus: T, tema: "Gens: generátorok, fejlesztés, kereskedés" },
      { kulcs: "fyland", nev: "🏝️・fyland", tipus: T, tema: "Fyland" },
    ],
  },
  {
    kat: "🎫 TÁMOGATÁS",
    mod: "nyitott",
    csatornak: [
      { kulcs: "ticketpanel", nev: "🎫・ticket-nyitás", tipus: T, tema: "Válassz témát, és nyitunk neked egy privát csatornát", olvas: true },
      { kulcs: "segitseg", nev: "❓・segítség", tipus: T, tema: "Gyors kérdések, egymás segítése" },
    ],
  },
  { kat: "📂 TICKETEK", mod: "ticket", kulcs: "ticketKat", csatornak: [] },
  {
    kat: "🎉 ESEMÉNYEK",
    mod: "olvas",
    csatornak: [
      { kulcs: "esemenyek", nev: "🎉・események", tipus: T, tema: "Közelgő események és versenyek" },
      { kulcs: "nyeremenyjatekok", nev: "🎁・nyereményjátékok", tipus: T, tema: "Nyereményjátékok" },
    ],
  },
  {
    kat: "🔊 HANG",
    mod: "nyitott",
    csatornak: [
      { kulcs: "v_tarsalgo", nev: "🔊 Társalgó", tipus: H },
      { kulcs: "v_jatek1", nev: "🎮 Játék #1", tipus: H },
      { kulcs: "v_jatek2", nev: "🎮 Játék #2", tipus: H },
      { kulcs: "v_duo", nev: "👥 Duó", tipus: H, limit: 2 },
      { kulcs: "v_zene", nev: "🎵 Zene", tipus: H },
      { kulcs: "v_afk", nev: "💤 AFK", tipus: H },
    ],
  },
  {
    kat: "🛡️ STAFF",
    mod: "staff",
    csatornak: [
      { kulcs: "staffchat", nev: "🛡️・staff-chat", tipus: T, tema: "Csak a csapatnak" },
      { kulcs: "vasarlasok", nev: "🛒・vásárlások", tipus: T, tema: "Weboldalas vásárlások" },
      { kulcs: "naplo", nev: "📒・napló", tipus: T, tema: "Moderálás, ticketek, minden más" },
      { kulcs: "naplo_uzenet", nev: "💬・üzenet-napló", tipus: T, tema: "Törölt és szerkesztett üzenetek, automod" },
      { kulcs: "naplo_tag", nev: "👥・tag-napló", tipus: T, tema: "Belépés, kilépés, rangok, kitiltások" },
      { kulcs: "naplo_web", nev: "🌐・web-napló", tipus: T, tema: "Regisztrációk, utalások, összekötések" },
      { kulcs: "v_staff", nev: "🔒 Staff", tipus: H },
    ],
  },
];

const definiciok = [
  new SlashCommandBuilder()
    .setName("szerver-felepites")
    .setDescription("Felépíti a szerver csatornáit, rangjait és paneljeit (semmit nem töröl)")
    .setDefaultMemberPermissions(P.Administrator)
    .addBooleanOption((o) => o.setName("panelek").setDescription("Kirakja-e a paneleket az új csatornákba (alapból igen)")),
];

const fut = new Set();

function szerkesztes(k) {
  const { flags, ...m } = k.uzenet();
  return { ...m, flags: MessageFlags.IsComponentsV2 };
}
const kerelmek = new Map();

const kulcsNev = (s) =>
  String(s || "")
    .normalize("NFC")
    .replace(/[︎️‍\s_-]/g, "")
    .toLowerCase();

const csatornaNev = (nev, tipus) => (tipus === H || tipus === ChannelType.GuildCategory ? nev : nev.toLowerCase().replace(/\s+/g, "-"));

function keres(guild, nev, tipusok, szulo) {
  const k = kulcsNev(nev);
  return guild.channels.cache.find((c) => tipusok.includes(c.type) && (szulo === undefined || (c.parentId || null) === szulo) && kulcsNev(c.name) === k) || null;
}

function jogSzuro(me) {
  const admin = me.permissions.has(P.Administrator);
  return (lista) => {
    const ok = [];
    const hianyzik = [];
    for (const j of lista) (admin || me.permissions.has(j) ? ok : hianyzik).push(j);
    return { ok, hianyzik };
  };
}

function felulirasok(mod, guild, rangId, botId, szur) {
  const ow = (id, type, allow, deny) => {
    const a = szur(allow || []).ok;
    const d = szur(deny || []).ok;
    return a.length || d.length ? [{ id, type, allow: a, deny: d }] : [];
  };
  const bot = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory];
  const everyone = guild.id;
  if (mod === "olvas") {
    return [
      ...ow(everyone, OverwriteType.Role, [], [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads]),
      ...ow(rangId.staff, OverwriteType.Role, [P.SendMessages, P.EmbedLinks, P.AttachFiles]),
      ...ow(botId, OverwriteType.Member, bot),
    ];
  }
  if (mod === "staff") {
    return [
      ...ow(everyone, OverwriteType.Role, [], [P.ViewChannel]),
      ...ow(rangId.staff, OverwriteType.Role, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak]),
      ...ow(botId, OverwriteType.Member, bot),
    ];
  }
  if (mod === "ticket") {
    return [
      ...ow(everyone, OverwriteType.Role, [], [P.ViewChannel]),
      ...ow(rangId.staff, OverwriteType.Role, [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles]),
      ...ow(botId, OverwriteType.Member, [...bot, P.ManageChannels]),
    ];
  }
  return [];
}

function szamlaloCsatorna(guild) {
  const b = beall(guild.id);
  return (b.szamlalo && guild.channels.cache.get(b.szamlalo)) || null;
}

function terv(guild) {
  let rangok = 0;
  let kat = 0;
  let cs = 0;
  for (const r of RANGOK) if (!guild.roles.cache.find((x) => x.name === r.nev)) rangok++;
  for (const k of FELEPITES) {
    const kc = keres(guild, k.kat, [ChannelType.GuildCategory]);
    if (!kc) kat++;
    for (const c of k.csatornak) {
      if (c.szamlalo && szamlaloCsatorna(guild)) continue;
      if (!kc || !keres(guild, csatornaNev(c.nev, c.tipus), [T, H, N], kc.id)) cs++;
    }
  }
  return { rangok, kat, cs };
}

function alInterakcio(i, ertekek) {
  const ertek = (n) => (ertekek[n] === undefined ? null : ertekek[n]);
  return {
    guild: i.guild,
    guildId: i.guild.id,
    member: i.member,
    user: i.user,
    client: i.client,
    channel: i.channel,
    deferred: false,
    replied: false,
    inGuild: () => true,
    options: { getChannel: ertek, getRole: ertek, getString: ertek, getBoolean: ertek, getInteger: ertek, getUser: ertek, getSubcommand: () => null },
    async reply() {
      this.replied = true;
    },
    async deferReply() {
      this.deferred = true;
    },
    async editReply() {
      this.replied = true;
    },
    async followUp() {},
  };
}

async function uresE(ch) {
  if (!ch || !ch.messages) return false;
  const m = await ch.messages.fetch({ limit: 1 }).catch(() => null);
  return !!m && m.size === 0;
}

async function epit(i, panelekKellenek) {
  const guild = i.guild;
  const me = guild.members.me;
  const szur = jogSzuro(me);
  const b = beall(guild.id);
  const kozosseg = guild.features.includes("COMMUNITY");
  const uj = { rang: [], kat: [], cs: [] };
  const megjegyzes = [];
  const rangId = {};
  const reszleges = [];

  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);

  for (const r of RANGOK) {
    const { ok, hianyzik } = szur(r.jogok);
    let rang = guild.roles.cache.find((x) => x.name === r.nev);
    if (!rang) {
      rang = await guild.roles.create({ name: r.nev, colors: { primaryColor: r.szin }, hoist: r.kiemelt, mentionable: false, permissions: ok, reason: "Szerver felépítés" });
      uj.rang.push(rang.name);
    } else if (ok.length && rang.position < me.roles.highest.position && !ok.every((j) => rang.permissions.has(j))) {
      await rang.setPermissions(rang.permissions.add(ok), "Szerver felépítés").catch(() => null);
    }
    rangId[r.kulcs] = rang.id;
    if (hianyzik.length) reszleges.push(r.nev);
  }
  if (reszleges.length) {
    megjegyzes.push(
      `Ezeket a rangokat csak részleges jogokkal tudtam létrehozni, mert a botnak sincs meg minden jog: ${reszleges.join(", ")}. Adj a bot rangjának ideiglenesen Adminisztrátor jogot, és futtasd újra: a hiányzó jogokat pótolom (vagy állítsd be kézzel).`,
    );
  }

  try {
    const csucs = me.roles.highest.position;
    if (csucs > RANGOK.length) {
      const pos = RANGOK.map((r, n) => ({ role: rangId[r.kulcs], position: csucs - 1 - n })).filter((x) => {
        const rr = guild.roles.cache.get(x.role);
        return rr && rr.position < csucs;
      });
      await guild.roles.setPositions(pos);
    }
  } catch {
    megjegyzes.push("A rangok sorrendjét nem tudtam beállítani: húzd a bot rangját a lista tetejére, vagy rendezd kézzel.");
  }

  const ch = {};
  const ujCs = new Set();
  let katPoz = 0;
  for (const k of FELEPITES) {
    const ow = felulirasok(k.mod, guild, rangId, me.id, szur);
    let kc = keres(guild, k.kat, [ChannelType.GuildCategory]);
    if (!kc) {
      kc = await guild.channels.create({ name: k.kat, type: ChannelType.GuildCategory, position: katPoz, permissionOverwrites: ow, reason: "Szerver felépítés" });
      uj.kat.push(k.kat);
    }
    katPoz++;
    if (k.kulcs) ch[k.kulcs] = kc;
    for (const c of k.csatornak) {
      let tipus = c.tipus;
      if (tipus === N && !kozosseg) tipus = T;
      const nev = csatornaNev(c.nev, tipus);
      let x = (c.szamlalo && szamlaloCsatorna(guild)) || keres(guild, nev, [T, H, N], kc.id);
      if (!x) {
        const opc = { name: nev, type: tipus, parent: kc.id, reason: "Szerver felépítés" };
        if (c.tema && tipus !== H) opc.topic = c.tema;
        if (c.limit) opc.userLimit = c.limit;
        let sajat = null;
        if (c.olvas) sajat = felulirasok("olvas", guild, rangId, me.id, szur);
        if (c.otlet) {
          sajat = [
            ...felulirasok("olvas", guild, rangId, me.id, szur).filter((o) => o.id !== guild.id),
            { id: guild.id, type: OverwriteType.Role, allow: szur([P.SendMessagesInThreads]).ok, deny: szur([P.SendMessages, P.CreatePublicThreads]).ok },
          ];
        }
        if (c.szamlalo) sajat = [...ow, { id: guild.id, type: OverwriteType.Role, allow: [], deny: szur([P.Connect]).ok }].filter((o) => o.allow.length || o.deny.length);
        if (sajat) opc.permissionOverwrites = sajat;
        x = await guild.channels.create(opc);
        uj.cs.push(nev);
        ujCs.add(c.kulcs);
      }
      ch[c.kulcs] = x;
    }
  }

  const beallitva = [];
  const el = async (id) => !!id && !!(await csatorna(guild, id));
  const allit = async (mezo, c, cimke) => {
    if (!c || (await el(b[mezo]))) return;
    b[mezo] = c.id;
    beallitva.push(`${cimke}: ${c}`);
  };
  await allit("udvozlo", ch.udvozlo, "👋 Üdvözlés");
  await allit("otletek", ch.otletek, "💡 Ötletek");
  await allit("vasarlasok", ch.vasarlasok, "🛒 Vásárlások");
  await allit("naplo", ch.naplo, "📒 Fő napló");
  b.naplok ||= {};
  for (const [tipus, kulcs, cimke] of [
    ["uzenet", "naplo_uzenet", "💬 Üzenet-napló"],
    ["tag", "naplo_tag", "👥 Tag-napló"],
    ["web", "naplo_web", "🌐 Web-napló"],
  ]) {
    if (ch[kulcs] && !(await el(b.naplok[tipus]))) {
      b.naplok[tipus] = ch[kulcs].id;
      beallitva.push(`${cimke}: ${ch[kulcs]}`);
    }
  }
  if (ch.ticketKat && !(await el(b.ticketKategoria))) {
    b.ticketKategoria = ch.ticketKat.id;
    beallitva.push(`📂 Ticket kategória: **${ch.ticketKat.name}**`);
  }
  if (!b.staffRang || !guild.roles.cache.get(b.staffRang)) {
    b.staffRang = rangId.staff;
    beallitva.push(`🛡️ Staff rang: <@&${rangId.staff}>`);
  }
  if (ch.szamlalo && !(await el(b.szamlalo))) {
    b.szamlalo = ch.szamlalo.id;
    beallitva.push(`🔢 Online számláló: ${ch.szamlalo}`);
  }
  ment();
  if (b.szamlalo === (ch.szamlalo && ch.szamlalo.id)) statusz.szamlaloFrissit(guild, true).catch(() => {});

  const kirakva = [];
  if (panelekKellenek) {
    const panel = async (kulcs, fn, ertekek, feltetel = true) => {
      const c = ch[kulcs];
      if (!c || !feltetel || !(ujCs.has(kulcs) || (await uresE(c)))) return;
      try {
        await fn(alInterakcio(i, { csatorna: c, ...ertekek }));
        if (!(await uresE(c))) kirakva.push(`${c}`);
      } catch (e) {
        megjegyzes.push(`A panelt nem tudtam kirakni ide: ${c} (${e.message})`);
      }
    };
    await panel("info", panelek.parancsok["info-panel"], {});
    await panel("szabalyzat", panelek.parancsok["szabalyzat-panel"], { rang: null });
    await panel("statusz", statusz.parancsok["statusz-panel"], {}, !(b.statuszPanel && (await el(b.statuszPanel.csatorna))));
    await panel("ticketpanel", ticket.parancsok["ticket-panel"], {}, !(await el(b.ticketPanel)));
    await panel("ertesitesek", rangvalaszto.parancsok.rangvalaszto, {
      cim: "Értesítések",
      leiras: "Miről szólhatunk neked? Nyomj a gombra, és megkapod a rangot, még egyszer nyomva leveszem.",
      rang1: guild.roles.cache.get(rangId.hirek),
      rang2: guild.roles.cache.get(rangId.esemenyek),
      rang3: guild.roles.cache.get(rangId.nyeremeny),
    });
  }

  const szerver = {};
  if (ch.v_afk) {
    szerver.afkChannel = ch.v_afk.id;
    szerver.afkTimeout = 900;
  }
  if (kozosseg) {
    if (ch.szabalyzat) szerver.rulesChannel = ch.szabalyzat.id;
    if (ch.naplo) szerver.publicUpdatesChannel = ch.naplo.id;
  }
  if (Object.keys(szerver).length) {
    await guild.edit(szerver).catch(() => megjegyzes.push("Az AFK csatornát (💤 AFK, 15 perc) kézzel állítsd be: Szerverbeállítások > Áttekintés. Ehhez a botnak Szerver kezelése jog kellene."));
  }

  return { uj, beallitva, kirakva, megjegyzes, kozosseg };
}

const parancsok = {
  async "szerver-felepites"(i) {
    if (!i.member.permissions.has(P.Administrator)) return hiba(i, "Ezt csak adminisztrátor használhatja.");
    const me = i.guild.members.me;
    if (!me.permissions.has(P.ManageChannels) || !me.permissions.has(P.ManageRoles)) {
      return hiba(i, "Ehhez a botnak Csatornák kezelése és Rangok kezelése jog kell. Add meg neki a Szerverbeállítások > Rangok menüben.");
    }
    await i.guild.roles.fetch().catch(() => null);
    await i.guild.channels.fetch().catch(() => null);
    const t = terv(i.guild);
    const panelekKellenek = i.options.getBoolean("panelek") !== false;
    kerelmek.set(i.user.id + ":" + i.guild.id, { panelekKellenek, ido: Date.now() });
    if (!t.rangok && !t.kat && !t.cs) {
      return rejtett(
        i,
        kartya()
          .szoveg("### 🏗️ Szerver felépítés", "Minden megvan, nincs mit létrehozni. Ha akarod, a beállításokat és a hiányzó paneleket így is pótolom.")
          .sor(gomb("felepites:mehet", "Beállítások pótlása", ButtonStyle.Primary, "🔧"), gomb("felepites:megse", "Mégse", ButtonStyle.Secondary)),
      );
    }
    const k = kartya()
      .szoveg(
        "### 🏗️ Szerver felépítés",
        `Ezt hozom létre: **${t.rangok}** rang, **${t.kat}** kategória, **${t.cs}** csatorna.`,
        "Ami már megvan ugyanazzal a névvel, azt kihagyom. **Semmit nem törlök.**",
        panelekKellenek ? "Az új csatornákba kirakom a paneleket is (info, szabályzat, státusz, ticket, értesítések)." : "Paneleket most nem rakok ki.",
      )
      .elvalaszto()
      .szoveg(
        "-# A bot beállításait (üdvözlés, ötletek, vásárlások, naplók, ticketek, online számláló) is ráállítom az új csatornákra, de csak ott, ahol még nincs beállítva semmi.",
      )
      .sor(gomb("felepites:mehet", "Mehet", ButtonStyle.Success, "✅"), gomb("felepites:megse", "Mégse", ButtonStyle.Secondary));
    return rejtett(i, k);
  },
};

async function gombKezelo(i) {
  const kulcs = i.user.id + ":" + i.guild.id;
  if (i.customId === "felepites:megse") {
    kerelmek.delete(kulcs);
    return i.update(kartya().szoveg("Rendben, nem csináltam semmit.").uzenet());
  }
  if (!i.member.permissions.has(P.Administrator)) return hiba(i, "Ezt csak adminisztrátor használhatja.");
  const k = kerelmek.get(kulcs);
  if (!k || Date.now() - k.ido > 15 * 60000) return hiba(i, "Ez a kérés lejárt. Írd be újra: /szerver-felepites");
  if (fut.has(i.guild.id)) return hiba(i, "Már fut egy felépítés ezen a szerveren, várd meg a végét.");
  kerelmek.delete(kulcs);
  fut.add(i.guild.id);
  await i.update(kartya().szoveg("### 🏗️ Dolgozom rajta…", "Ez fél-egy percig is eltarthat, a Discord nem engedi gyorsabban.").uzenet());
  try {
    const e = await epit(i, k.panelekKellenek);
    const sz = (n, szo) => `**${n}** ${szo}`;
    const v = kartya(K.ZOLD)
      .szoveg(
        "### ✅ Kész a szerver",
        `Létrehozva: ${sz(e.uj.rang.length, "rang")}, ${sz(e.uj.kat.length, "kategória")}, ${sz(e.uj.cs.length, "csatorna")}.`,
        e.kirakva.length ? `Panelek: ${e.kirakva.join(", ")}` : null,
      )
      .elvalaszto()
      .szoveg("**⚙️ Bot beállítások**", ...(e.beallitva.length ? e.beallitva : ["-# Minden már be volt állítva, nem nyúltam hozzá."]))
      .elvalaszto()
      .szoveg(
        "**📝 Ezt még neked kell**",
        "1. Add meg magadnak a 👑 Tulajdonos rangot, a csapatnak a megfelelőt (Admin / Moderátor / Segítő).",
        "2. **Mindenki a csapatban kapja meg a 🧊 Staff rangot is**: ezzel látják a staff csatornákat és a ticketeket.",
        "3. A régi, felesleges csatornákat töröld (én semmit nem töröltem).",
        "4. Weboldalas rangok (Bronz, Wizard, IceKing, Yeti): `/rangok-letrehozas`",
        e.kozosseg ? null : "5. Ajánlott: Szerverbeállítások > Közösség engedélyezése, utána futtasd újra: a 📢 hírek követhető hírcsatorna lesz.",
      );
    if (e.megjegyzes.length) v.elvalaszto().szoveg("**⚠️ Figyelj**", ...e.megjegyzes.slice(0, 8).map((m) => `• ${m}`));
    await i.editReply(szerkesztes(v.lab("🏗️ Szerver felépítés • 🧊 IceMine")));
  } catch (err) {
    console.error("Szerver felépítés:", err);
    const szoveg =
      err && err.code === 50013
        ? "Elfogyott a jogom valahol (50013). Húzd a bot rangját a Rangok lista tetejére, és futtasd újra: ami kész, megmarad, csak a hiányzót pótolom."
        : `Hiba történt: ${err.message}. Ami kész, megmarad; futtasd újra, és csak a hiányzót pótolom.`;
    await i.editReply(szerkesztes(kartya(K.PIROS).szoveg(`❌ ${szoveg}`))).catch(() => {});
  } finally {
    fut.delete(i.guild.id);
  }
}

module.exports = { parancsok, definiciok, elotagok: { "felepites:": gombKezelo } };
