const fs = require("fs");
const path = require("path");
const net = require("net");
const dns = require("dns").promises;
const {
  Client,
  Events,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits: P,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  ActivityType,
  AttachmentBuilder,
  MessageFlags,
  OAuth2Scopes,
  OverwriteType,
} = require("discord.js");

const NEV = process.env.BOT_NEV || "IceMine";
const SZIN = 0x5cc0ff;
const MC_HOST = process.env.MC_HOST || "play.icemine.hu";
const MC_PORT = parseInt(process.env.MC_PORT || "0", 10);
const BEDROCK_PORT = (process.env.BEDROCK_PORT || "").trim();
const WEB = (process.env.WEBOLDAL || "https://icemine.hu").replace(/\/+$/, "");
const DISCORD_LINK = "https://discord.gg/YJV2HNqTMc";
const YOUTUBE = "https://youtube.com/@icemine_1";
const INSTAGRAM = "https://www.instagram.com/icemine_1";
const EMAIL = "support@icemine.hu";
const VERZIOK = "1.20 – 1.21.x";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "adatok");
const ADAT_FAJL = path.join(DATA_DIR, "adatok.json");

const JOGOK = [
  P.ViewChannel,
  P.SendMessages,
  P.EmbedLinks,
  P.AttachFiles,
  P.ReadMessageHistory,
  P.AddReactions,
  P.UseExternalEmojis,
  P.ManageMessages,
  P.MentionEveryone,
  P.ManageChannels,
  P.ManageRoles,
  P.KickMembers,
  P.BanMembers,
  P.ModerateMembers,
];

const TICKET_TIPUSOK = {
  segitseg: { nev: "Általános segítség", emoji: "❓", tipp: "" },
  vasarlas: { nev: "Vásárlás / IceCoin", emoji: "💎", tipp: "Írd meg a felhasználóneved, a vásárlás idejét és összegét." },
  hiba: { nev: "Hibajelentés", emoji: "🐛", tipp: "Írd le, mit csináltál, mi történt, és mit vártál volna. Ha tudsz, csatolj képet." },
  jelentes: { nev: "Játékos jelentése", emoji: "🚩", tipp: "Írd meg a játékos nevét, mi történt és mikor. Ha van, csatolj képet vagy videót." },
  fellebbezes: { nev: "Fellebbezés", emoji: "⚖️", tipp: "Írd meg a játékbeli neved, a büntetést, és hogy miért kérsz feloldást." },
  egyeb: { nev: "Egyéb", emoji: "📩", tipp: "" },
};

fs.mkdirSync(DATA_DIR, { recursive: true });
let adat = { szerverek: {}, figyelmeztetesek: {}, ticketSzam: {} };
try {
  adat = Object.assign(adat, JSON.parse(fs.readFileSync(ADAT_FAJL, "utf8")));
} catch {}

function ment() {
  const tmp = ADAT_FAJL + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(adat, null, 2));
  fs.renameSync(tmp, ADAT_FAJL);
}

const beall = (id) => (adat.szerverek[id] ||= {});

function varint(n) {
  const b = [];
  n >>>= 0;
  do {
    let x = n & 0x7f;
    n >>>= 7;
    if (n) x |= 0x80;
    b.push(x);
  } while (n);
  return Buffer.from(b);
}

function olvasVarint(buf, i) {
  let n = 0;
  let s = 0;
  let x;
  do {
    if (i >= buf.length) return null;
    x = buf[i++];
    n |= (x & 0x7f) << s;
    s += 7;
    if (s > 35) throw new Error("hibás varint");
  } while (x & 0x80);
  return [n, i];
}

const mcString = (s) => {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([varint(b.length), b]);
};

function csomag(id, ...reszek) {
  const t = Buffer.concat([varint(id), ...reszek]);
  return Buffer.concat([varint(t.length), t]);
}

async function cimFelold() {
  if (MC_PORT) return { host: MC_HOST, port: MC_PORT };
  try {
    const r = await dns.resolveSrv("_minecraft._tcp." + MC_HOST);
    if (r.length) return { host: r[0].name, port: r[0].port };
  } catch {}
  return { host: MC_HOST, port: 25565 };
}

function mcPing(host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let kesz = false;
    const t = setTimeout(() => vege(new Error("időtúllépés")), 6000);
    function vege(hiba, ertek) {
      if (kesz) return;
      kesz = true;
      clearTimeout(t);
      s.destroy();
      if (hiba) reject(hiba);
      else resolve(ertek);
    }
    s.on("connect", () => {
      const p = Buffer.alloc(2);
      p.writeUInt16BE(port);
      s.write(csomag(0, varint(767), mcString(host), p, varint(1)));
      s.write(csomag(0));
    });
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      try {
        const fej = olvasVarint(buf, 0);
        if (!fej) return;
        const [hossz, i] = fej;
        if (buf.length < i + hossz) return;
        const id = olvasVarint(buf, i);
        const sz = olvasVarint(buf, id[1]);
        vege(null, JSON.parse(buf.subarray(sz[1], sz[1] + sz[0]).toString("utf8")));
      } catch (e) {
        vege(e);
      }
    });
    s.on("error", (e) => vege(e));
    s.on("close", () => vege(new Error("a kapcsolat lezárult")));
  });
}

let statuszTar = { ido: 0, ertek: null };

async function statusz() {
  if (statuszTar.ertek && Date.now() - statuszTar.ido < 30000) return statuszTar.ertek;
  let ertek;
  try {
    const c = await cimFelold();
    const d = await mcPing(c.host, c.port);
    ertek = {
      online: true,
      jatekos: (d.players && d.players.online) || 0,
      max: (d.players && d.players.max) || 0,
    };
  } catch {
    ertek = { online: false, jatekos: 0, max: 0 };
  }
  statuszTar = { ido: Date.now(), ertek };
  return ertek;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const fuggoBejelentesek = new Map();

function embed() {
  return new EmbedBuilder()
    .setColor(SZIN)
    .setFooter({ text: "IceMine • " + MC_HOST, iconURL: client.user ? client.user.displayAvatarURL() : undefined })
    .setTimestamp();
}

const sor = (...elemek) => new ActionRowBuilder().addComponents(...elemek);
const linkGomb = (cimke, url, emoji) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(cimke).setURL(url).setEmoji(emoji);

function rejtett(i, tartalom) {
  const v = typeof tartalom === "string" ? { content: tartalom } : tartalom;
  return i.reply({ ...v, flags: MessageFlags.Ephemeral });
}

async function csatorna(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

function tudIrni(ch) {
  const me = ch.guild.members.me;
  return ch.permissionsFor(me).has([P.ViewChannel, P.SendMessages, P.EmbedLinks]);
}

async function naplo(guild, e, files) {
  const ch = await csatorna(guild, beall(guild.id).naplo);
  if (ch) await ch.send({ embeds: [e], files: files || [] }).catch(() => {});
}

async function dm(user, szoveg) {
  await user.send({ embeds: [embed().setDescription(szoveg)] }).catch(() => {});
}

function modEmbed(cim, cel, moderator, ok, extra) {
  const e = embed()
    .setTitle(cim)
    .addFields(
      { name: "Tag", value: `${cel} (${cel.username})`, inline: true },
      { name: "Moderátor", value: `${moderator}`, inline: true },
    );
  if (extra) e.addFields(extra);
  e.addFields({ name: "Indok", value: ok });
  return e;
}

function rangEllenor(i, cel) {
  if (!cel) return "Ez a felhasználó nincs a szerveren.";
  if (cel.id === i.user.id) return "Magadra ezt nem használhatod.";
  if (cel.id === client.user.id) return "Rám ezt nem használhatod. 🧊";
  if (cel.id === i.guild.ownerId) return "A szerver tulajdonosára ezt nem használhatod.";
  if (i.user.id !== i.guild.ownerId && cel.roles.highest.position >= i.member.roles.highest.position) {
    return "Csak nálad alacsonyabb rangú tagra használhatod.";
  }
  return null;
}

const BOT_RANG_TIPP = "A bot rangját húzd feljebb a Szerverbeállítások > Rangok listában, mint az övé.";

const tag = (o) => o.setName("tag").setDescription("A tag").setRequired(true);
const indok = (o, kotelezo) => o.setName("ok").setDescription("Indok").setMaxLength(400).setRequired(!!kotelezo);
const szovegCsatorna = (o, nev, leiras) =>
  o.setName(nev).setDescription(leiras).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true);

const parancsok = [
  new SlashCommandBuilder().setName("ip").setDescription("A szerver címe és a támogatott verziók"),
  new SlashCommandBuilder().setName("statusz").setDescription("Fut-e a szerver, és hányan játszanak"),
  new SlashCommandBuilder().setName("weboldal").setDescription("Az IceMine weboldala"),
  new SlashCommandBuilder().setName("linkek").setDescription("Az IceMine hivatalos elérhetőségei"),
  new SlashCommandBuilder().setName("szabalyzat").setDescription("Hol találod a szabályzatot"),
  new SlashCommandBuilder().setName("segitseg").setDescription("A bot parancsai"),
  new SlashCommandBuilder()
    .setName("otlet")
    .setDescription("Ötlet beküldése a szerverhez")
    .addStringOption((o) => o.setName("otlet").setDescription("Mi az ötleted?").setRequired(true).setMaxLength(1500)),
  new SlashCommandBuilder()
    .setName("bejelentes")
    .setDescription("Bejelentés küldése")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Melyik csatornába menjen"))
    .addBooleanOption((o) => o.setName("everyone").setDescription("Kapjon-e mindenki értesítést (@everyone)"))
    .addAttachmentOption((o) => o.setName("kep").setDescription("Kép a bejelentéshez")),
  new SlashCommandBuilder()
    .setName("szavazas")
    .setDescription("Igen/nem szavazás indítása ebben a csatornában")
    .setDefaultMemberPermissions(P.ManageMessages)
    .addStringOption((o) => o.setName("kerdes").setDescription("A kérdés").setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName("torles")
    .setDescription("Üzenetek törlése ebből a csatornából")
    .setDefaultMemberPermissions(P.ManageMessages)
    .addIntegerOption((o) =>
      o.setName("mennyiseg").setDescription("Hány üzenetet (1–100)").setMinValue(1).setMaxValue(100).setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("kirugas")
    .setDescription("Tag kirúgása a Discord szerverről")
    .setDefaultMemberPermissions(P.KickMembers)
    .addUserOption(tag)
    .addStringOption((o) => indok(o)),
  new SlashCommandBuilder()
    .setName("kitiltas")
    .setDescription("Tag kitiltása a Discord szerverről")
    .setDefaultMemberPermissions(P.BanMembers)
    .addUserOption(tag)
    .addStringOption((o) => indok(o))
    .addIntegerOption((o) =>
      o.setName("uzenetek_torlese").setDescription("Hány napnyi üzenetét törölje (0–7)").setMinValue(0).setMaxValue(7),
    ),
  new SlashCommandBuilder()
    .setName("kitiltas-feloldas")
    .setDescription("Kitiltás feloldása")
    .setDefaultMemberPermissions(P.BanMembers)
    .addStringOption((o) => o.setName("felhasznalo_id").setDescription("A kitiltott felhasználó ID-ja").setRequired(true)),
  new SlashCommandBuilder()
    .setName("nemitas")
    .setDescription("Tag lenémítása megadott időre")
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption(tag)
    .addIntegerOption((o) =>
      o.setName("perc").setDescription("Hány percre (0 = feloldás, max. 40320)").setMinValue(0).setMaxValue(40320).setRequired(true),
    )
    .addStringOption((o) => indok(o)),
  new SlashCommandBuilder()
    .setName("figyelmeztetes")
    .setDescription("Figyelmeztetések kezelése")
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addSubcommand((s) =>
      s.setName("adas").setDescription("Figyelmeztetés adása").addUserOption(tag).addStringOption((o) => indok(o, true)),
    )
    .addSubcommand((s) => s.setName("lista").setDescription("Egy tag figyelmeztetései").addUserOption(tag))
    .addSubcommand((s) => s.setName("torles").setDescription("Egy tag összes figyelmeztetésének törlése").addUserOption(tag)),
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Ticket panel kirakása egy csatornába")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova kerüljön a panel")),
  new SlashCommandBuilder()
    .setName("beallitas")
    .setDescription("A bot beállításai")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) =>
      s.setName("udvozlo").setDescription("Ide köszönti a bot az új tagokat").addChannelOption((o) => szovegCsatorna(o, "csatorna", "Csatorna")),
    )
    .addSubcommand((s) =>
      s.setName("otletek").setDescription("Ide kerülnek a beküldött ötletek").addChannelOption((o) => szovegCsatorna(o, "csatorna", "Csatorna")),
    )
    .addSubcommand((s) =>
      s.setName("naplo").setDescription("Ide kerül a moderálás és a lezárt ticketek naplója").addChannelOption((o) => szovegCsatorna(o, "csatorna", "Csatorna")),
    )
    .addSubcommand((s) =>
      s
        .setName("ticket")
        .setDescription("Ticket kategória és a csapat rangja")
        .addChannelOption((o) =>
          o.setName("kategoria").setDescription("Melyik kategóriában nyíljanak a ticketek").addChannelTypes(ChannelType.GuildCategory).setRequired(true),
        )
        .addRoleOption((o) => o.setName("staff").setDescription("A csapat rangja, ami látja a ticketeket").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("autorang")
        .setDescription("Rang, amit minden új tag automatikusan megkap")
        .addRoleOption((o) => o.setName("rang").setDescription("A rang (ha üresen hagyod, kikapcsol)")),
    )
    .addSubcommand((s) =>
      s
        .setName("szamlalo")
        .setDescription("Hangcsatorna, aminek a neve mutatja az online játékosokat")
        .addChannelOption((o) =>
          o.setName("csatorna").setDescription("Egy hangcsatorna (ha üresen hagyod, kikapcsol)").addChannelTypes(ChannelType.GuildVoice),
        ),
    )
    .addSubcommand((s) => s.setName("mutat").setDescription("A jelenlegi beállítások")),
];

async function parancs(i) {
  if (!i.inGuild() || !i.guild) return rejtett(i, "Ezt a parancsot csak az IceMine Discord szerverén használhatod.");
  const b = beall(i.guild.id);

  switch (i.commandName) {
    case "ip": {
      const e = embed()
        .setTitle("🧊 Csatlakozás az IceMine-ra")
        .addFields(
          { name: "☕ Java Edition", value: "Cím: `" + MC_HOST + "`" },
          { name: "📱 Bedrock Edition", value: "Cím: `" + MC_HOST + "`" + (BEDROCK_PORT ? "\nPort: `" + BEDROCK_PORT + "`" : "") },
          { name: "🎮 Verziók", value: VERZIOK },
        );
      return i.reply({ embeds: [e] });
    }

    case "statusz": {
      await i.deferReply();
      const s = await statusz();
      const e = embed().setTitle(s.online ? "🟢 A szerver online" : "🔴 A szerver most nem elérhető");
      if (s.online) {
        e.addFields(
          { name: "Játékosok", value: `${s.jatekos} / ${s.max}`, inline: true },
          { name: "Cím", value: "`" + MC_HOST + "`", inline: true },
        );
      } else {
        e.setDescription("Lehet, hogy éppen újraindul. Próbáld újra pár perc múlva!");
      }
      return i.editReply({ embeds: [e] });
    }

    case "weboldal": {
      const e = embed()
        .setTitle("🌐 IceMine weboldal")
        .setDescription("Regisztráció, karakter, IceCoin, rangok, WebShop és Szerencsekerék egy helyen.");
      return i.reply({ embeds: [e], components: [sor(linkGomb("Weboldal megnyitása", WEB, "🌐"))] });
    }

    case "linkek": {
      const e = embed()
        .setTitle("🔗 IceMine elérhetőségek")
        .addFields(
          { name: "🌐 Weboldal", value: WEB },
          { name: "💬 Discord", value: DISCORD_LINK },
          { name: "▶️ YouTube", value: YOUTUBE },
          { name: "📸 Instagram", value: INSTAGRAM },
          { name: "✉️ E-mail", value: EMAIL },
        );
      return i.reply({
        embeds: [e],
        components: [
          sor(
            linkGomb("Weboldal", WEB, "🌐"),
            linkGomb("Discord", DISCORD_LINK, "💬"),
            linkGomb("YouTube", YOUTUBE, "▶️"),
            linkGomb("Instagram", INSTAGRAM, "📸"),
          ),
        ],
      });
    }

    case "szabalyzat": {
      const e = embed()
        .setTitle("📜 Szabályzat")
        .setDescription(
          "A szabályzat a Minecraft szerverre, a weboldalra és erre a Discord szerverre is vonatkozik.\nA weboldalon, a **Dokumentumok** fülön olvashatod el.",
        );
      return i.reply({ embeds: [e], components: [sor(linkGomb("Szabályzat", WEB, "📜"))] });
    }

    case "segitseg": {
      const e = embed()
        .setTitle("❓ IceMine bot parancsai")
        .addFields(
          {
            name: "🎮 Mindenkinek",
            value: "`/ip` – szervercím\n`/statusz` – online játékosok\n`/weboldal` – weboldal\n`/linkek` – elérhetőségek\n`/szabalyzat` – szabályzat\n`/otlet` – ötlet beküldése",
          },
          {
            name: "🛡️ Csapatnak",
            value:
              "`/bejelentes` – bejelentés\n`/szavazas` – igen/nem szavazás\n`/torles` – üzenetek törlése\n`/nemitas` – némítás\n`/figyelmeztetes` – figyelmeztetések\n`/kirugas` – kirúgás\n`/kitiltas` – kitiltás\n`/kitiltas-feloldas` – kitiltás feloldása",
          },
          { name: "⚙️ Adminoknak", value: "`/beallitas` – a bot beállításai\n`/ticket-panel` – ticket panel kirakása" },
        );
      return rejtett(i, { embeds: [e] });
    }

    case "otlet": {
      const ch = await csatorna(i.guild, b.otletek);
      if (!ch) return rejtett(i, "Az ötletek csatornája még nincs beállítva. Szólj egy adminnak!");
      const e = embed()
        .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() })
        .setTitle("💡 Új ötlet")
        .setDescription(i.options.getString("otlet"));
      const m = await ch.send({ embeds: [e] });
      await m.react("👍").catch(() => {});
      await m.react("👎").catch(() => {});
      return rejtett(i, `Köszönjük! Az ötleted bekerült ide: ${ch}`);
    }

    case "bejelentes": {
      const ch = i.options.getChannel("csatorna");
      if (!tudIrni(ch)) return rejtett(i, `Nincs jogom írni ide: ${ch}`);
      const kep = i.options.getAttachment("kep");
      fuggoBejelentesek.set(i.user.id, {
        csatorna: ch.id,
        everyone: !!i.options.getBoolean("everyone"),
        kep: kep && kep.contentType && kep.contentType.startsWith("image/") ? { url: kep.url, nev: kep.name } : null,
      });
      const modal = new ModalBuilder()
        .setCustomId("bejelentes")
        .setTitle("Bejelentés")
        .addComponents(
          sor(new TextInputBuilder().setCustomId("cim").setLabel("Cím").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)),
          sor(new TextInputBuilder().setCustomId("szoveg").setLabel("Szöveg").setStyle(TextInputStyle.Paragraph).setMaxLength(3500).setRequired(true)),
        );
      return i.showModal(modal);
    }

    case "szavazas": {
      if (!tudIrni(i.channel)) return rejtett(i, "Ebbe a csatornába nincs jogom írni.");
      const e = embed()
        .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() })
        .setTitle("📊 Szavazás")
        .setDescription(i.options.getString("kerdes"));
      const m = await i.channel.send({ embeds: [e] });
      await m.react("✅").catch(() => {});
      await m.react("❌").catch(() => {});
      return rejtett(i, "A szavazás elindult.");
    }

    case "torles": {
      const n = i.options.getInteger("mennyiseg");
      const torolt = await i.channel.bulkDelete(n, true);
      await rejtett(
        i,
        `🧹 ${torolt.size} üzenet törölve.` +
          (torolt.size < n ? " A 14 napnál régebbi üzeneteket a Discord nem engedi egyszerre törölni." : ""),
      );
      return naplo(
        i.guild,
        embed()
          .setTitle("🧹 Üzenetek törlése")
          .addFields(
            { name: "Csatorna", value: `${i.channel}`, inline: true },
            { name: "Darab", value: String(torolt.size), inline: true },
            { name: "Moderátor", value: `${i.user}`, inline: true },
          ),
      );
    }

    case "kirugas": {
      const cel = i.options.getMember("tag");
      const ok = i.options.getString("ok") || "Nincs megadva";
      const hiba = rangEllenor(i, cel);
      if (hiba) return rejtett(i, hiba);
      if (!cel.kickable) return rejtett(i, "Ezt a tagot nem tudom kirúgni. " + BOT_RANG_TIPP);
      await dm(cel.user, `👢 Ki lettél rúgva az **${i.guild.name}** szerverről.\nIndok: ${ok}`);
      await cel.kick(`${ok} | ${i.user.username}`);
      const e = modEmbed("👢 Kirúgás", cel.user, i.user, ok);
      await i.reply({ embeds: [e] });
      return naplo(i.guild, e);
    }

    case "kitiltas": {
      const user = i.options.getUser("tag");
      const cel = i.options.getMember("tag");
      const ok = i.options.getString("ok") || "Nincs megadva";
      const napok = i.options.getInteger("uzenetek_torlese") || 0;
      if (cel) {
        const hiba = rangEllenor(i, cel);
        if (hiba) return rejtett(i, hiba);
        if (!cel.bannable) return rejtett(i, "Ezt a tagot nem tudom kitiltani. " + BOT_RANG_TIPP);
        await dm(user, `🔨 Ki lettél tiltva az **${i.guild.name}** szerverről.\nIndok: ${ok}`);
      } else if (user.id === i.user.id || user.id === client.user.id) {
        return rejtett(i, "Ezt nem lehet.");
      }
      await i.guild.bans.create(user.id, { reason: `${ok} | ${i.user.username}`, deleteMessageSeconds: napok * 86400 });
      const e = modEmbed("🔨 Kitiltás", user, i.user, ok);
      await i.reply({ embeds: [e] });
      return naplo(i.guild, e);
    }

    case "kitiltas-feloldas": {
      const id = i.options.getString("felhasznalo_id").replace(/\D/g, "");
      if (!/^\d{17,20}$/.test(id)) return rejtett(i, "Ez nem érvényes felhasználó ID.");
      const sikerult = await i.guild.bans
        .remove(id, `Feloldotta: ${i.user.username}`)
        .then(() => true)
        .catch(() => false);
      if (!sikerult) return rejtett(i, "Nincs ilyen kitiltott felhasználó.");
      const e = embed()
        .setTitle("✅ Kitiltás feloldva")
        .addFields({ name: "Felhasználó", value: `<@${id}> (${id})`, inline: true }, { name: "Moderátor", value: `${i.user}`, inline: true });
      await i.reply({ embeds: [e] });
      return naplo(i.guild, e);
    }

    case "nemitas": {
      const cel = i.options.getMember("tag");
      const perc = i.options.getInteger("perc");
      const ok = i.options.getString("ok") || "Nincs megadva";
      const hiba = rangEllenor(i, cel);
      if (hiba) return rejtett(i, hiba);
      if (!cel.moderatable) return rejtett(i, "Ezt a tagot nem tudom lenémítani. " + BOT_RANG_TIPP);
      if (perc === 0) {
        await cel.timeout(null, `${ok} | ${i.user.username}`);
        const e = modEmbed("🔊 Némítás feloldva", cel.user, i.user, ok);
        await i.reply({ embeds: [e] });
        return naplo(i.guild, e);
      }
      await cel.timeout(perc * 60000, `${ok} | ${i.user.username}`);
      const lejar = Math.floor((Date.now() + perc * 60000) / 1000);
      await dm(cel.user, `🔇 Le lettél némítva az **${i.guild.name}** szerveren.\nLejár: <t:${lejar}:R>\nIndok: ${ok}`);
      const e = modEmbed("🔇 Némítás", cel.user, i.user, ok, { name: "Lejár", value: `<t:${lejar}:f>`, inline: true });
      await i.reply({ embeds: [e] });
      return naplo(i.guild, e);
    }

    case "figyelmeztetes": {
      const sub = i.options.getSubcommand();
      const user = i.options.getUser("tag");
      const tar = (adat.figyelmeztetesek[i.guild.id] ||= {});
      const lista = tar[user.id] || [];

      if (sub === "adas") {
        const cel = i.options.getMember("tag");
        const hiba = rangEllenor(i, cel);
        if (hiba) return rejtett(i, hiba);
        const ok = i.options.getString("ok");
        lista.push({ ok, ki: i.user.id, ido: Date.now() });
        tar[user.id] = lista;
        ment();
        await dm(user, `⚠️ Figyelmeztetést kaptál az **${i.guild.name}** szerveren.\nIndok: ${ok}\nEz a(z) ${lista.length}. figyelmeztetésed.`);
        const e = modEmbed("⚠️ Figyelmeztetés", user, i.user, ok, { name: "Összesen", value: String(lista.length), inline: true });
        await i.reply({ embeds: [e] });
        return naplo(i.guild, e);
      }

      if (sub === "lista") {
        if (!lista.length) return rejtett(i, `${user} még nem kapott figyelmeztetést.`);
        const sorok = lista
          .slice(-15)
          .map((f, n) => `**${lista.length - Math.min(lista.length, 15) + n + 1}.** <t:${Math.floor(f.ido / 1000)}:d> – ${f.ok} (<@${f.ki}>)`);
        const e = embed().setTitle(`⚠️ ${user.username} figyelmeztetései (${lista.length})`).setDescription(sorok.join("\n"));
        return rejtett(i, { embeds: [e] });
      }

      delete tar[user.id];
      ment();
      const e = embed()
        .setTitle("🧽 Figyelmeztetések törölve")
        .addFields({ name: "Tag", value: `${user}`, inline: true }, { name: "Moderátor", value: `${i.user}`, inline: true });
      await i.reply({ embeds: [e] });
      return naplo(i.guild, e);
    }

    case "ticket-panel": {
      if (!b.ticketKategoria || !b.staffRang) return rejtett(i, "Előbb állítsd be a ticketeket: `/beallitas ticket`");
      const ch = i.options.getChannel("csatorna");
      if (!tudIrni(ch)) return rejtett(i, `Nincs jogom írni ide: ${ch}`);
      const e = embed()
        .setTitle("🎫 Ügyfélszolgálat")
        .setDescription(
          "Kérdésed van, hibát találtál, gond van egy vásárlással, vagy jelentenél egy játékost?\n\nVálaszd ki lent, miben segíthetünk, és nyitunk neked egy privát csatornát, ahol csak te és a csapat láttok.",
        );
      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket:tipus")
        .setPlaceholder("Válassz témát…")
        .addOptions(Object.entries(TICKET_TIPUSOK).map(([value, t]) => ({ label: t.nev, value, emoji: t.emoji })));
      await ch.send({ embeds: [e], components: [sor(menu)] });
      return rejtett(i, `A ticket panel kikerült ide: ${ch}`);
    }

    case "beallitas":
      return beallitas(i, b);
  }
}

async function beallitas(i, b) {
  const sub = i.options.getSubcommand();
  const me = i.guild.members.me;

  if (sub === "mutat") {
    const ki = (v, f) => (v ? f(v) : "*nincs beállítva*");
    const e = embed()
      .setTitle("⚙️ Beállítások")
      .addFields(
        { name: "Üdvözlő csatorna", value: ki(b.udvozlo, (v) => `<#${v}>`), inline: true },
        { name: "Ötletek", value: ki(b.otletek, (v) => `<#${v}>`), inline: true },
        { name: "Napló", value: ki(b.naplo, (v) => `<#${v}>`), inline: true },
        { name: "Ticket kategória", value: ki(b.ticketKategoria, (v) => `<#${v}>`), inline: true },
        { name: "Staff rang", value: ki(b.staffRang, (v) => `<@&${v}>`), inline: true },
        { name: "Autorang", value: ki(b.autorang, (v) => `<@&${v}>`), inline: true },
        { name: "Online számláló", value: ki(b.szamlalo, (v) => `<#${v}>`), inline: true },
      );
    return rejtett(i, { embeds: [e] });
  }

  if (sub === "udvozlo" || sub === "otletek" || sub === "naplo") {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return rejtett(i, `Nincs jogom írni ide: ${ch}. Adj a botnak jogot a csatornához.`);
    b[sub] = ch.id;
    ment();
    const nevek = { udvozlo: "Üdvözlő csatorna", otletek: "Ötletek csatornája", naplo: "Napló csatorna" };
    return rejtett(i, `✅ ${nevek[sub]}: ${ch}`);
  }

  if (sub === "ticket") {
    const kat = i.options.getChannel("kategoria");
    const rang = i.options.getRole("staff");
    if (!kat.permissionsFor(me).has([P.ViewChannel, P.ManageChannels])) {
      return rejtett(i, `Nincs jogom csatornát létrehozni itt: ${kat}`);
    }
    b.ticketKategoria = kat.id;
    b.staffRang = rang.id;
    ment();
    return rejtett(i, `✅ A ticketek ide nyílnak: **${kat.name}**, és ${rang} látja őket.\nMost rakd ki a panelt: \`/ticket-panel\``);
  }

  if (sub === "autorang") {
    const rang = i.options.getRole("rang");
    if (!rang) {
      delete b.autorang;
      ment();
      return rejtett(i, "✅ Az autorang kikapcsolva.");
    }
    if (rang.managed || rang.id === i.guild.id) return rejtett(i, "Ezt a rangot nem lehet kiosztani.");
    if (rang.position >= me.roles.highest.position) {
      return rejtett(i, `A ${rang} rang magasabban van, mint a bot rangja, így nem tudom kiosztani. A Szerverbeállítások > Rangok listában húzd a bot rangját fölé.`);
    }
    b.autorang = rang.id;
    ment();
    return rejtett(i, `✅ Minden új tag megkapja: ${rang}`);
  }

  if (sub === "szamlalo") {
    const ch = i.options.getChannel("csatorna");
    if (!ch) {
      delete b.szamlalo;
      ment();
      return rejtett(i, "✅ Az online számláló kikapcsolva.");
    }
    if (!ch.permissionsFor(me).has([P.ViewChannel, P.ManageChannels])) return rejtett(i, `Nincs jogom átnevezni ezt: ${ch}`);
    b.szamlalo = ch.id;
    ment();
    await szamlaloFrissit(i.guild, true);
    return rejtett(i, `✅ ${ch} neve mostantól 10 percenként mutatja az online játékosokat.`);
  }
}

async function bejelentesKuldes(i) {
  const f = fuggoBejelentesek.get(i.user.id);
  fuggoBejelentesek.delete(i.user.id);
  if (!f) return rejtett(i, "Ez a bejelentés lejárt. Futtasd újra a `/bejelentes` parancsot.");
  const ch = await csatorna(i.guild, f.csatorna);
  if (!ch) return rejtett(i, "A csatorna már nem létezik.");
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const e = embed().setTitle("📢 " + i.fields.getTextInputValue("cim")).setDescription(i.fields.getTextInputValue("szoveg"));
  const files = [];
  if (f.kep) {
    const r = await fetch(f.kep.url).catch(() => null);
    if (r && r.ok) {
      const nev = "kep" + (path.extname(f.kep.nev) || ".png").toLowerCase();
      files.push(new AttachmentBuilder(Buffer.from(await r.arrayBuffer()), { name: nev }));
      e.setImage("attachment://" + nev);
    }
  }
  await ch.send({
    content: f.everyone ? "@everyone" : undefined,
    embeds: [e],
    files,
    allowedMentions: { parse: f.everyone ? ["everyone"] : [] },
  });
  return i.editReply(`📢 Elküldve ide: ${ch}`);
}

async function ticketNyitas(i) {
  const b = beall(i.guild.id);
  if (!b.ticketKategoria || !b.staffRang) return rejtett(i, "A ticket rendszer még nincs beállítva.");
  const tipus = TICKET_TIPUSOK[i.values[0]];
  if (!tipus) return rejtett(i, "Ismeretlen téma.");

  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await i.message.edit({ components: i.message.components }).catch(() => {});

  const meglevo = i.guild.channels.cache.find(
    (c) => c.parentId === b.ticketKategoria && typeof c.topic === "string" && c.topic.startsWith(i.user.id + " |"),
  );
  if (meglevo) return i.editReply(`Már van nyitott ticketed: ${meglevo}`);

  adat.ticketSzam[i.guild.id] = (adat.ticketSzam[i.guild.id] || 0) + 1;
  ment();
  const szam = String(adat.ticketSzam[i.guild.id]).padStart(4, "0");
  const alap = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];

  const ch = await i.guild.channels.create({
    name: `ticket-${szam}`,
    type: ChannelType.GuildText,
    parent: b.ticketKategoria,
    topic: `${i.user.id} | ${tipus.nev}`,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
      { id: i.user.id, type: OverwriteType.Member, allow: alap },
      { id: b.staffRang, type: OverwriteType.Role, allow: [...alap, P.ManageMessages] },
      { id: client.user.id, type: OverwriteType.Member, allow: [...alap, P.ManageChannels] },
    ],
  });

  const e = embed()
    .setTitle(`${tipus.emoji} ${tipus.nev}`)
    .setDescription(
      `Szia ${i.user}! Írd le részletesen, miben segíthetünk.` + (tipus.tipp ? `\n\n${tipus.tipp}` : "") + "\n\nA csapat hamarosan válaszol.",
    );
  const gomb = new ButtonBuilder().setCustomId("ticket:lezaras").setLabel("Ticket lezárása").setEmoji("🔒").setStyle(ButtonStyle.Danger);
  await ch.send({
    content: `${i.user} <@&${b.staffRang}>`,
    embeds: [e],
    components: [sor(gomb)],
    allowedMentions: { users: [i.user.id], roles: [b.staffRang] },
  });
  await i.editReply(`🎫 Elkészült a ticketed: ${ch}`);
  return naplo(
    i.guild,
    embed()
      .setTitle("🎫 Új ticket")
      .addFields(
        { name: "Ticket", value: `${ch}`, inline: true },
        { name: "Nyitotta", value: `${i.user}`, inline: true },
        { name: "Téma", value: tipus.nev, inline: true },
      ),
  );
}

async function atirat(ch) {
  const mind = [];
  let elotte;
  for (let k = 0; k < 5; k++) {
    const r = await ch.messages.fetch({ limit: 100, before: elotte });
    if (!r.size) break;
    mind.push(...r.values());
    elotte = r.last().id;
    if (r.size < 100) break;
  }
  mind.reverse();
  return mind
    .map((m) => {
      const ido = new Date(m.createdTimestamp).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
      const beagyazas = m.embeds.length ? ` [${m.embeds[0].title || m.embeds[0].description || "beágyazás"}]` : "";
      const csatolmany = m.attachments.size ? " " + [...m.attachments.values()].map((a) => a.url).join(" ") : "";
      return `[${ido}] ${m.author.username}: ${m.content || ""}${beagyazas}${csatolmany}`;
    })
    .join("\n");
}

async function ticketLezaras(i) {
  const ch = i.channel;
  const b = beall(i.guild.id);
  if (!ch || typeof ch.topic !== "string" || !/^\d{17,20} \|/.test(ch.topic)) return rejtett(i, "Ez nem ticket csatorna.");
  const tulaj = ch.topic.split(" |")[0];
  const staff = (b.staffRang && i.member.roles.cache.has(b.staffRang)) || i.memberPermissions.has(P.ManageChannels);
  if (!staff && i.user.id !== tulaj) return rejtett(i, "Ezt csak a ticket nyitója vagy a csapat zárhatja le.");

  await i.reply({ embeds: [embed().setDescription(`🔒 ${i.user} lezárta a ticketet. A csatorna 5 másodperc múlva törlődik.`)] });

  const naploCh = await csatorna(i.guild, b.naplo);
  if (naploCh) {
    const szoveg = await atirat(ch).catch(() => "");
    const e = embed()
      .setTitle("🔒 Ticket lezárva")
      .addFields(
        { name: "Ticket", value: ch.name, inline: true },
        { name: "Nyitotta", value: `<@${tulaj}>`, inline: true },
        { name: "Lezárta", value: `${i.user}`, inline: true },
      );
    const files = szoveg ? [new AttachmentBuilder(Buffer.from(szoveg, "utf8"), { name: `${ch.name}.txt` })] : [];
    await naploCh.send({ embeds: [e], files }).catch(() => {});
  }
  setTimeout(() => ch.delete(`Ticket lezárva: ${i.user.username}`).catch(() => {}), 5000);
}

async function szamlaloFrissit(guild, kenyszer) {
  const b = beall(guild.id);
  if (!b.szamlalo) return;
  const ch = await csatorna(guild, b.szamlalo);
  if (!ch) return;
  const s = await statusz();
  const nev = s.online ? `🟢 Online: ${s.jatekos} játékos` : "🔴 Szerver: offline";
  if (kenyszer || ch.name !== nev) await ch.setName(nev).catch((e) => console.error("Számláló:", e.message));
}

async function jelenletFrissit() {
  const s = await statusz();
  const szoveg = s.online ? `🧊 ${s.jatekos} játékos online | ${MC_HOST}` : `🧊 ${MC_HOST}`;
  client.user.setPresence({ activities: [{ name: NEV, type: ActivityType.Custom, state: szoveg }], status: "online" });
}

async function profilBeallitas() {
  if (client.user.username !== NEV) {
    await client.user.setUsername(NEV).catch((e) => console.error("A nevet most nem sikerült beállítani:", e.message));
  }
  const jelzo = path.join(DATA_DIR, "profilkep.kesz");
  if (!client.user.avatar || !fs.existsSync(jelzo)) {
    try {
      await client.user.setAvatar(path.join(__dirname, "logo.png"));
      fs.writeFileSync(jelzo, new Date().toISOString());
      console.log("Profilkép beállítva.");
    } catch (e) {
      console.error("A profilképet most nem sikerült beállítani:", e.message);
    }
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`IceMine bot elindult: ${client.user.tag} (${client.guilds.cache.size} szerveren)`);
  try {
    await client.application.commands.set(parancsok.map((p) => p.toJSON()));
    console.log(`${parancsok.length} parancs regisztrálva.`);
  } catch (e) {
    console.error("A parancsokat nem sikerült regisztrálni:", e.message);
  }
  console.log(
    "Meghívó link: " + client.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: JOGOK }),
  );
  await profilBeallitas();
  const kor = () => jelenletFrissit().catch((e) => console.error("Jelenlét:", e.message));
  kor();
  setInterval(kor, 60000);
  const szamlalok = () => client.guilds.cache.forEach((g) => szamlaloFrissit(g).catch(() => {}));
  szamlalok();
  setInterval(szamlalok, 600000);
});

client.on(Events.GuildMemberAdd, async (m) => {
  const b = beall(m.guild.id);
  if (b.autorang) await m.roles.add(b.autorang).catch((e) => console.error("Autorang:", e.message));
  const ch = await csatorna(m.guild, b.udvozlo);
  if (!ch) return;
  const e = embed()
    .setTitle("👋 Üdv az IceMine-on!")
    .setDescription(
      `Szia ${m}! Örülünk, hogy itt vagy.\n\n🧊 Szerver: \`${MC_HOST}\`\n🌐 Weboldal: ${WEB}\n\nHa segítség kell, nyiss egy ticketet!`,
    )
    .setThumbnail(m.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Te vagy a(z) ${m.guild.memberCount}. tagunk!`, iconURL: client.user.displayAvatarURL() });
  await ch.send({ content: `${m}`, embeds: [e], allowedMentions: { users: [m.id] } }).catch(() => {});
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) return await parancs(i);
    if (i.isStringSelectMenu() && i.customId === "ticket:tipus") return await ticketNyitas(i);
    if (i.isButton() && i.customId === "ticket:lezaras") return await ticketLezaras(i);
    if (i.isModalSubmit() && i.customId === "bejelentes") return await bejelentesKuldes(i);
  } catch (e) {
    console.error(e);
    const szoveg =
      e && e.code === 50013
        ? "Nincs jogom ehhez. Ellenőrizd a bot jogait, és hogy a rangja elég magasan van-e a Rangok listában."
        : "Hiba történt, próbáld újra később.";
    const v = { content: szoveg, flags: MessageFlags.Ephemeral };
    try {
      if (i.deferred || i.replied) await i.followUp(v);
      else await i.reply(v);
    } catch {}
  }
});

client.on(Events.GuildCreate, (g) => console.log(`Új szerverre kerültem: ${g.name}`));
process.on("unhandledRejection", (e) => console.error("Hiba:", e));

if (!process.env.DISCORD_TOKEN) {
  console.error("HIBA: hiányzik a DISCORD_TOKEN. Futtasd újra a telepítőt, vagy írd be a .env fájlba.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  const uzenet = String((e && e.message) || e);
  if ((e && e.code === "DisallowedIntents") || /disallowed intents|privileged intent/i.test(uzenet)) {
    console.error(
      "HIBA: a Discord Developer Portalon kapcsold be: Bot > Privileged Gateway Intents > SERVER MEMBERS INTENT és MESSAGE CONTENT INTENT, majd Save Changes.",
    );
  } else if (/token/i.test(uzenet) || (e && e.code === "TokenInvalid")) {
    console.error("HIBA: a bot token hibás. Kérj újat: Developer Portal > Bot > Reset Token, majd futtasd újra a telepítőt.");
  } else {
    console.error(e);
  }
  process.exit(1);
});
