const { SlashCommandBuilder, ChannelType, PermissionFlagsBits: P } = require("discord.js");

const SZOVEGES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const tag = (o, kotelezo = true) => o.setName("tag").setDescription("Kire vonatkozik").setRequired(kotelezo);
const indok = (o, kotelezo = false) => o.setName("ok").setDescription("Indok").setMaxLength(400).setRequired(kotelezo);
const szovegCsatorna = (o, nev, leiras, kotelezo = true) => o.setName(nev).setDescription(leiras).addChannelTypes(...SZOVEGES).setRequired(kotelezo);
const uzenet = (o) => o.setName("uzenet").setDescription("Az üzenet linkje vagy ID-ja").setRequired(true);

const SZIN_VALASZTEK = [
  { name: "Kék", value: "kek" },
  { name: "Zöld", value: "zold" },
  { name: "Piros", value: "piros" },
  { name: "Arany", value: "arany" },
  { name: "Lila", value: "lila" },
  { name: "Rózsaszín", value: "rozsa" },
];

module.exports = [
  new SlashCommandBuilder()
    .setName("osszekotes")
    .setDescription("A weboldalas fiókod összekötése a Discorddal")
    .addStringOption((o) => o.setName("kod").setDescription("A 6 jegyű kód a weboldal Karakter oldaláról").setRequired(true).setMinLength(6).setMaxLength(6)),
  new SlashCommandBuilder()
    .setName("fiok")
    .setDescription("A weboldalas fiókod (vagy másé)")
    .addUserOption((o) => tag(o, false)),
  new SlashCommandBuilder()
    .setName("rangok-letrehozas")
    .setDescription("Létrehozza a weboldal rangjait a Discordon, és kiosztja őket")
    .setDefaultMemberPermissions(P.ManageRoles),
  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Kérdezd meg a varázsgömböt")
    .addStringOption((o) => o.setName("kerdes").setDescription("Mit szeretnél tudni?").setRequired(true).setMaxLength(200)),
  new SlashCommandBuilder()
    .setName("fej-vagy-iras")
    .setDescription("Pénzfeldobás")
    .addStringOption((o) =>
      o
        .setName("tipp")
        .setDescription("Mire tippelsz?")
        .addChoices({ name: "Fej", value: "fej" }, { name: "Írás", value: "iras" }),
    ),
  new SlashCommandBuilder()
    .setName("kocka")
    .setDescription("Dobókocka")
    .addIntegerOption((o) => o.setName("oldalak").setDescription("Hány oldalú (alapból 6)").setMinValue(2).setMaxValue(100))
    .addIntegerOption((o) => o.setName("db").setDescription("Hány kockával (alapból 1)").setMinValue(1).setMaxValue(10)),
  new SlashCommandBuilder().setName("kpo").setDescription("Kő, papír, olló a bot ellen"),
  new SlashCommandBuilder()
    .setName("szerelem")
    .setDescription("Szerelemmérő két ember között")
    .addUserOption((o) => o.setName("tag").setDescription("Az egyik fél").setRequired(true))
    .addUserOption((o) => o.setName("masik").setDescription("A másik fél (alapból te)")),
  new SlashCommandBuilder().setName("tipp").setDescription("Egy hasznos Minecraft tipp"),
  new SlashCommandBuilder().setName("trivia").setDescription("Minecraft kvíz, jó válaszért XP jár"),
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Valakinek a profilképe nagyban")
    .addUserOption((o) => tag(o, false)),
  new SlashCommandBuilder().setName("napi").setDescription("Napi XP jutalom, sorozat bónusszal"),
  new SlashCommandBuilder().setName("szerverinfo").setDescription("A Discord szerver adatai"),
  new SlashCommandBuilder()
    .setName("emlekezteto")
    .setDescription("Szólok, ha eljön az idő")
    .addStringOption((o) => o.setName("ido").setDescription("Mikor, pl. 10p, 2ó, 1n").setRequired(true).setMaxLength(20))
    .addStringOption((o) => o.setName("szoveg").setDescription("Mire emlékeztesselek?").setRequired(true).setMaxLength(500)),
  new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Jelezd, hogy nem vagy gépnél")
    .addStringOption((o) => o.setName("ok").setDescription("Miért (pl. eszem)").setMaxLength(100)),
  new SlashCommandBuilder()
    .setName("szamol")
    .setDescription("Számológép, pl. (64*3)+12")
    .addStringOption((o) => o.setName("kifejezes").setDescription("Mit számoljak ki?").setRequired(true).setMaxLength(200)),
  new SlashCommandBuilder()
    .setName("skin")
    .setDescription("Minecraft skin megtekintése")
    .addStringOption((o) => o.setName("nev").setDescription("Minecraft név").setRequired(true).setMaxLength(16)),
  new SlashCommandBuilder().setName("meghivo").setDescription("Meghívó link a Discordra"),
  new SlashCommandBuilder().setName("botinfo").setDescription("Adatok a botról"),
  new SlashCommandBuilder().setName("ping").setDescription("A bot válaszideje"),
  new SlashCommandBuilder()
    .setName("esemeny")
    .setDescription("Esemény kiírása jelentkezéssel")
    .setDefaultMemberPermissions(P.ManageMessages)
    .addStringOption((o) => o.setName("cim").setDescription("Az esemény neve").setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName("mikor").setDescription("Mikor lesz, pl. szombat 18:00").setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName("leiras").setDescription("Pár sor az eseményről").setMaxLength(1500))
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova kerüljön (alapból ide)", false))
    .addRoleOption((o) => o.setName("ping").setDescription("Melyik rangot pingelje")),
  new SlashCommandBuilder()
    .setName("lassitas")
    .setDescription("Lassított mód ebben a csatornában")
    .setDefaultMemberPermissions(P.ManageChannels)
    .addIntegerOption((o) => o.setName("masodperc").setDescription("Hány másodpercenként írhatnak (0 = ki)").setMinValue(0).setMaxValue(21600).setRequired(true)),
  new SlashCommandBuilder()
    .setName("zarolas")
    .setDescription("Csatorna lezárása vagy feloldása")
    .setDefaultMemberPermissions(P.ManageChannels)
    .addBooleanOption((o) => o.setName("be").setDescription("Lezárva legyen?").setRequired(true))
    .addStringOption((o) => o.setName("ok").setDescription("Miért").setMaxLength(300)),
  new SlashCommandBuilder()
    .setName("becenev")
    .setDescription("Becenév módosítása")
    .setDefaultMemberPermissions(P.ManageNicknames)
    .addUserOption(tag)
    .addStringOption((o) => o.setName("nev").setDescription("Az új becenév (ha üres, törli)").setMaxLength(32)),
  new SlashCommandBuilder()
    .setName("rang")
    .setDescription("Rang adása vagy elvétele")
    .setDefaultMemberPermissions(P.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("adas")
        .setDescription("Rang adása")
        .addUserOption(tag)
        .addRoleOption((o) => o.setName("rang").setDescription("Melyik rang").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("elvetel")
        .setDescription("Rang elvétele")
        .addUserOption(tag)
        .addRoleOption((o) => o.setName("rang").setDescription("Melyik rang").setRequired(true)),
    ),
  new SlashCommandBuilder()
    .setName("mondd")
    .setDescription("Üzenet a bot nevében")
    .setDefaultMemberPermissions(P.ManageMessages)
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova (alapból ide)", false))
    .addBooleanOption((o) => o.setName("kartya").setDescription("Szép kártyában menjen? (alapból igen)"))
    .addStringOption((o) => o.setName("szin").setDescription("A kártya színe").addChoices(...SZIN_VALASZTEK)),
  new SlashCommandBuilder()
    .setName("info-panel")
    .setDescription("Információs panel kirakása (IP, weboldal, szabályzat, segítség)")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova kerüljön")),
  new SlashCommandBuilder()
    .setName("szabalyzat-panel")
    .setDescription("Szabályzat panel, opcionálisan elfogadás gombbal")
    .setDefaultMemberPermissions(P.ManageGuild)
    .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Hova kerüljön"))
    .addRoleOption((o) => o.setName("rang").setDescription("Ezt kapja, aki elfogadja (ha üres, nincs gomb)")),
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
      s
        .setName("naplo")
        .setDescription("Naplócsatorna beállítása (fő napló vagy egy-egy témának külön)")
        .addChannelOption((o) => szovegCsatorna(o, "csatorna", "Csatorna"))
        .addStringOption((o) =>
          o
            .setName("tipus")
            .setDescription("Melyik napló menjen ide (alapból a fő napló)")
            .addChoices(
              { name: "Fő napló", value: "fo" },
              { name: "Üzenetek (törlés, szerkesztés)", value: "uzenet" },
              { name: "Tagok (be/kilépés, rangok, ban)", value: "tag" },
              { name: "Hangcsatornák", value: "hang" },
              { name: "Szerver (csatornák, rangok, meghívók)", value: "szerver" },
              { name: "Weboldal (regisztráció, utalás)", value: "web" },
              { name: "Parancshasználat", value: "parancs" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s.setName("vasarlasok").setDescription("Ide küldöm a weboldalas vásárlásokat").addChannelOption((o) => szovegCsatorna(o, "csatorna", "Csatorna (legyen csak a staffé)")),
    )
    .addSubcommand((s) =>
      s
        .setName("webrang")
        .setDescription("Melyik Discord rang tartozzon egy weboldal ranghoz")
        .addStringOption((o) =>
          o
            .setName("weboldal_rang")
            .setDescription("A weboldal rangja")
            .setRequired(true)
            .addChoices({ name: "Bronz", value: "bronz" }, { name: "Abyss", value: "abyss" }, { name: "IceKing", value: "iceking" }, { name: "Yeti", value: "yeti" }),
        )
        .addRoleOption((o) => o.setName("discord_rang").setDescription("A Discord rang (ha üresen hagyod, törli)")),
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
