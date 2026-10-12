const { SlashCommandBuilder, ChannelType, PermissionFlagsBits: P } = require("discord.js");

const SZOVEGES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const tag = (o, kotelezo = true) => o.setName("tag").setDescription("Kire vonatkozik").setRequired(kotelezo);
const indok = (o, kotelezo = false) => o.setName("ok").setDescription("Indok").setMaxLength(400).setRequired(kotelezo);
const szovegCsatorna = (o, nev, leiras, kotelezo = true) => o.setName(nev).setDescription(leiras).addChannelTypes(...SZOVEGES).setRequired(kotelezo);
const uzenet = (o) => o.setName("uzenet").setDescription("Az üzenet linkje vagy ID-ja").setRequired(true);

module.exports = [
  new SlashCommandBuilder().setName("ip").setDescription("Szervercím és verziók"),
  new SlashCommandBuilder().setName("statusz").setDescription("Fent van-e a szerver, és hányan játszanak"),
  new SlashCommandBuilder().setName("weboldal").setDescription("Az IceMine weboldala"),
  new SlashCommandBuilder().setName("linkek").setDescription("Weboldal, Discord, YouTube, Instagram, e-mail"),
  new SlashCommandBuilder().setName("szabalyzat").setDescription("Hol olvashatod a szabályzatot"),
  new SlashCommandBuilder().setName("segitseg").setDescription("A bot parancsai"),
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Adatok egy tagról")
    .addUserOption((o) => tag(o, false)),
  new SlashCommandBuilder()
    .setName("szint")
    .setDescription("A szinted, vagy valaki másé")
    .addUserOption((o) => tag(o, false)),
  new SlashCommandBuilder().setName("toplista").setDescription("A legaktívabb tagok"),
  new SlashCommandBuilder()
    .setName("otlet")
    .setDescription("Ötlet beküldése a szerverhez")
    .addStringOption((o) => o.setName("otlet").setDescription("Mi az ötleted?").setRequired(true).setMaxLength(1500)),
  new SlashCommandBuilder()
    .setName("otlet-valasz")
    .setDescription("Válasz egy beküldött ötletre")
    .setDefaultMemberPermissions(P.ManageMessages)
    .addStringOption(uzenet)
    .addStringOption((o) =>
      o
        .setName("dontes")
        .setDescription("Mi legyen vele")
        .setRequired(true)
        .addChoices(
          { name: "Elfogadva", value: "elfogadva" },
          { name: "Megvalósítva", value: "kesz" },
          { name: "Megfontoljuk", value: "megfontoljuk" },
          { name: "Elutasítva", value: "elutasitva" },
        ),
    )
    .addStringOption((o) => o.setName("megjegyzes").setDescription("Pár szó a döntésről").setMaxLength(500)),
  new SlashCommandBuilder()
    .setName("bejelentes")
    .setDescription("Bejelentés küldése")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Melyik csatornába menjen"))
    .addBooleanOption((o) => o.setName("everyone").setDescription("Kapjon-e mindenki értesítést (@everyone)"))
    .addRoleOption((o) => o.setName("rang").setDescription("Csak ezt a rangot pingelje"))
    .addAttachmentOption((o) => o.setName("kep").setDescription("Kép a bejelentéshez")),
  new SlashCommandBuilder()
    .setName("szavazas")
    .setDescription("Szavazás indítása ebben a csatornában")
    .setDefaultMemberPermissions(P.ManageMessages)
    .addStringOption((o) => o.setName("kerdes").setDescription("A kérdés").setRequired(true).setMaxLength(300))
    .addStringOption((o) => o.setName("valasz1").setDescription("1. válasz (ha üres, Igen/Nem lesz)").setMaxLength(55))
    .addStringOption((o) => o.setName("valasz2").setDescription("2. válasz").setMaxLength(55))
    .addStringOption((o) => o.setName("valasz3").setDescription("3. válasz").setMaxLength(55))
    .addStringOption((o) => o.setName("valasz4").setDescription("4. válasz").setMaxLength(55))
    .addStringOption((o) => o.setName("valasz5").setDescription("5. válasz").setMaxLength(55))
    .addIntegerOption((o) => o.setName("ora").setDescription("Hány óráig tartson (alapból 24)").setMinValue(1).setMaxValue(768))
    .addBooleanOption((o) => o.setName("tobb").setDescription("Lehessen-e több választ megjelölni")),
  new SlashCommandBuilder()
    .setName("torles")
    .setDescription("Üzenetek törlése ebből a csatornából")
    .setDefaultMemberPermissions(P.ManageMessages)
    .addIntegerOption((o) => o.setName("mennyiseg").setDescription("Hány üzenetet (1–100)").setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption((o) => tag(o, false).setDescription("Csak az ő üzeneteit")),
  new SlashCommandBuilder()
    .setName("kirugas")
    .setDescription("Tag kirúgása a Discordról")
    .setDefaultMemberPermissions(P.KickMembers)
    .addUserOption(tag)
    .addStringOption(indok),
  new SlashCommandBuilder()
    .setName("kitiltas")
    .setDescription("Tag kitiltása a Discordról")
    .setDefaultMemberPermissions(P.BanMembers)
    .addUserOption(tag)
    .addStringOption(indok)
    .addStringOption((o) => o.setName("ido").setDescription("Meddig, pl. 1n, 7n, 2hét (üresen hagyva végleges)").setMaxLength(20))
    .addIntegerOption((o) => o.setName("uzenetek_torlese").setDescription("Hány napnyi üzenetét törölje (0–7)").setMinValue(0).setMaxValue(7)),
  new SlashCommandBuilder()
    .setName("kitiltas-feloldas")
    .setDescription("Kitiltás feloldása")
    .setDefaultMemberPermissions(P.BanMembers)
    .addStringOption((o) => o.setName("felhasznalo_id").setDescription("A kitiltott felhasználó ID-ja").setRequired(true)),
  new SlashCommandBuilder()
    .setName("nemitas")
    .setDescription("Tag lenémítása")
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption(tag)
    .addStringOption((o) => o.setName("ido").setDescription("Meddig, pl. 10p, 2ó, 1n (0 = feloldás)").setRequired(true).setMaxLength(20))
    .addStringOption(indok),
  new SlashCommandBuilder()
    .setName("figyelmeztetes")
    .setDescription("Figyelmeztetések")
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addSubcommand((s) => s.setName("adas").setDescription("Figyelmeztetés adása").addUserOption(tag).addStringOption((o) => indok(o, true)))
    .addSubcommand((s) => s.setName("lista").setDescription("Egy tag figyelmeztetései").addUserOption(tag))
    .addSubcommand((s) =>
      s
        .setName("visszavonas")
        .setDescription("Egy figyelmeztetés visszavonása")
        .addUserOption(tag)
        .addIntegerOption((o) => o.setName("sorszam").setDescription("Hányadik (a listában látod)").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) => s.setName("torles").setDescription("Egy tag összes figyelmeztetésének törlése").addUserOption(tag)),
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket kezelése (a ticket csatornában)")
    .addSubcommand((s) => s.setName("hozzaad").setDescription("Valaki hozzáadása a tickethez").addUserOption(tag))
    .addSubcommand((s) => s.setName("eltavolit").setDescription("Valaki kivétele a ticketből").addUserOption(tag)),
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Ticket panel kirakása")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova kerüljön a panel")),
  new SlashCommandBuilder()
    .setName("statusz-panel")
    .setDescription("Élő szerverállapot panel, ami percenként frissül")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova kerüljön a panel")),
  new SlashCommandBuilder()
    .setName("nyeremenyjatek")
    .setDescription("Nyereményjátékok")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("inditas")
        .setDescription("Új nyereményjáték")
        .addStringOption((o) => o.setName("nyeremeny").setDescription("Mit lehet nyerni").setRequired(true).setMaxLength(200))
        .addStringOption((o) => o.setName("ido").setDescription("Meddig tart, pl. 30p, 12ó, 3n, 1hét").setRequired(true).setMaxLength(20))
        .addIntegerOption((o) => o.setName("nyertesek").setDescription("Hány nyertes legyen (alapból 1)").setMinValue(1).setMaxValue(20))
        .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova kerüljön (alapból ide)", false))
        .addStringOption((o) => o.setName("leiras").setDescription("Pár sor a nyereményjátékról").setMaxLength(1000)),
    )
    .addSubcommand((s) => s.setName("lezaras").setDescription("Lezárás és sorsolás most").addStringOption(uzenet))
    .addSubcommand((s) =>
      s
        .setName("ujrasorsolas")
        .setDescription("Új nyertes húzása egy lezárt nyereményjátékból")
        .addStringOption(uzenet)
        .addIntegerOption((o) => o.setName("db").setDescription("Hány új nyertes (alapból 1)").setMinValue(1).setMaxValue(20)),
    ),
  (() => {
    const c = new SlashCommandBuilder()
      .setName("rangvalaszto")
      .setDescription("Gombos rangválasztó, amivel a tagok maguk vehetnek fel rangokat")
      .setDefaultMemberPermissions(P.ManageRoles)
      .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova kerüljön"))
      .addStringOption((o) => o.setName("cim").setDescription("A panel címe, pl. Értesítések").setRequired(true).setMaxLength(200))
      .addRoleOption((o) => o.setName("rang1").setDescription("1. rang").setRequired(true));
    for (let n = 2; n <= 10; n++) c.addRoleOption((o) => o.setName("rang" + n).setDescription(`${n}. rang`));
    return c.addStringOption((o) => o.setName("leiras").setDescription("Saját szöveg a panelre").setMaxLength(1000));
  })(),
  new SlashCommandBuilder()
    .setName("beallitas")
    .setDescription("A bot beállításai")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName("mutat").setDescription("A jelenlegi beállítások"))
    .addSubcommand((s) => s.setName("udvozlo").setDescription("Ide köszönti a bot az új tagokat").addChannelOption((o) => szovegCsatorna(o, "csatorna", "Csatorna")))
    .addSubcommand((s) => s.setName("otletek").setDescription("Ide kerülnek az ötletek").addChannelOption((o) => szovegCsatorna(o, "csatorna", "Csatorna")))
    .addSubcommand((s) =>
      s.setName("naplo").setDescription("Ide kerül a moderálás, a ticketek és a törölt üzenetek naplója").addChannelOption((o) => szovegCsatorna(o, "csatorna", "Csatorna")),
    )
    .addSubcommand((s) =>
      s
        .setName("ticket")
        .setDescription("Ticket kategória és a staff rang")
        .addChannelOption((o) =>
          o.setName("kategoria").setDescription("Melyik kategóriában nyíljanak a ticketek").addChannelTypes(ChannelType.GuildCategory).setRequired(true),
        )
        .addRoleOption((o) => o.setName("staff").setDescription("A staff rangja").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("autorang")
        .setDescription("Rang, amit minden új tag megkap")
        .addRoleOption((o) => o.setName("rang").setDescription("A rang (ha üresen hagyod, kikapcsol)")),
    )
    .addSubcommand((s) =>
      s
        .setName("szamlalo")
        .setDescription("Hangcsatorna, aminek a neve mutatja, hányan vannak fent")
        .addChannelOption((o) =>
          o.setName("csatorna").setDescription("Egy hangcsatorna (ha üresen hagyod, kikapcsol)").addChannelTypes(ChannelType.GuildVoice),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("linkszuro")
        .setDescription("Más Discord szerverek meghívóinak és a tömeges pingelésnek a törlése")
        .addBooleanOption((o) => o.setName("be").setDescription("Bekapcsolva legyen?").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("szintek")
        .setDescription("Szintrendszer be/ki, és hova menjenek a szintlépések")
        .addBooleanOption((o) => o.setName("be").setDescription("Bekapcsolva legyen?").setRequired(true))
        .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Szintlépések csatornája (ha üres, ahol írt)", false)),
    )
    .addSubcommand((s) =>
      s
        .setName("szintrang")
        .setDescription("Rang, ami egy adott szinttől jár")
        .addIntegerOption((o) => o.setName("szint").setDescription("Hányadik szinttől").setMinValue(1).setMaxValue(500).setRequired(true))
        .addRoleOption((o) => o.setName("rang").setDescription("A rang (ha üresen hagyod, törli)")),
    ),
];
