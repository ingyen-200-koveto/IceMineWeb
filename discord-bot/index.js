const fs = require("fs");
const path = require("path");
const { Client, Events, GatewayIntentBits, OAuth2Scopes, MessageFlags, PermissionFlagsBits: P } = require("discord.js");
const { K, allapot, hiba } = require("./kozos");
const parancsLista = require("./parancsok");
const statusz = require("./modulok/statusz");
const alap = require("./modulok/alap");
const szintek = require("./modulok/szintek");
const moderalas = require("./modulok/moderalas");
const ticket = require("./modulok/ticket");
const otletek = require("./modulok/otletek");
const nyeremeny = require("./modulok/nyeremeny");
const rangvalaszto = require("./modulok/rangvalaszto");
const naplozas = require("./modulok/naplozas");
const beallitas = require("./modulok/beallitas");
const szorakozas = require("./modulok/szorakozas");
const kozosseg = require("./modulok/kozosseg");
const staff = require("./modulok/staff");
const panelek = require("./modulok/panelek");
const weboldal = require("./modulok/weboldal");

const MODULOK = [statusz, alap, szintek, moderalas, ticket, otletek, nyeremeny, rangvalaszto, beallitas, szorakozas, kozosseg, staff, panelek, weboldal];

const parancsok = {};
const komponensek = {};
const elotagok = {};
const modalok = {};
for (const m of MODULOK) {
  Object.assign(parancsok, m.parancsok || {});
  Object.assign(komponensek, m.komponensek || {});
  Object.assign(elotagok, m.elotagok || {});
  Object.assign(modalok, m.modalok || {});
}

for (const p of parancsLista) {
  if (!parancsok[p.name]) throw new Error("Nincs kezelője ennek a parancsnak: " + p.name);
}
allapot.parancsSzam = parancsLista.length;

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
  P.ViewAuditLog,
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
  ],
});
allapot.client = client;

async function profilBeallitas() {
  if (client.user.username !== K.NEV) {
    await client.user.setUsername(K.NEV).catch((e) => console.error("A nevet most nem sikerült beállítani:", e.message));
  }
  const jelzo = path.join(K.DATA_DIR, "profilkep.kesz");
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
    await client.application.commands.set(parancsLista.map((p) => p.toJSON()));
    console.log(`${parancsLista.length} parancs regisztrálva.`);
  } catch (e) {
    console.error("A parancsokat nem sikerült regisztrálni:", e.message);
  }
  console.log("Meghívó link: " + client.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: JOGOK }));
  await profilBeallitas();
  statusz.indit(client);
  nyeremeny.indit(client);
  moderalas.indit(client);
  kozosseg.indit(client);
  weboldal.indit(client);
});

async function kezel(i) {
  if (i.isChatInputCommand()) {
    if (!i.inGuild() || !i.guild) return hiba(i, "Ezt csak az IceMine Discordján tudod használni.");
    const f = parancsok[i.commandName];
    naplozas.parancsNaplo(i).catch(() => {});
    return f ? f(i) : hiba(i, "Ezt a parancsot már nem ismerem.");
  }
  if (i.isModalSubmit()) {
    const f = modalok[i.customId];
    return f ? f(i) : null;
  }
  if (i.isButton() || i.isStringSelectMenu()) {
    if (!i.guild) return null;
    const f = komponensek[i.customId] || Object.entries(elotagok).find(([e]) => i.customId.startsWith(e))?.[1];
    return f ? f(i) : hiba(i, "Ez a gomb már nem működik.");
  }
  return null;
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    await kezel(i);
  } catch (e) {
    console.error(e);
    const szoveg =
      e && e.code === 50013
        ? "Ehhez nincs jogom. Nézd meg a bot jogait, és hogy a rangja elég magasan van-e a Rangok listában."
        : "Valami hiba történt, próbáld újra kicsit később.";
    try {
      await hiba(i, szoveg);
    } catch {
      try {
        if (i.deferred || i.replied) await i.followUp({ content: szoveg, flags: MessageFlags.Ephemeral });
        else await i.reply({ content: szoveg, flags: MessageFlags.Ephemeral });
      } catch {}
    }
  }
});

const vedett = (nev, f) => (...a) => f(...a).catch((e) => console.error(nev + ":", e.message));

client.on(
  Events.GuildMemberAdd,
  vedett("Belépés", async (m) => {
    await naplozas.belepes(m);
    await weboldal.szinkron(client, m.id);
  }),
);
client.on(Events.GuildMemberRemove, vedett("Kilépés", naplozas.kilepes));
client.on(Events.GuildMemberUpdate, vedett("Tag módosítás", naplozas.tagFrissites));
client.on(Events.GuildBanAdd, vedett("Kitiltás napló", naplozas.banUj));
client.on(Events.GuildBanRemove, vedett("Feloldás napló", naplozas.banTorolve));
client.on(Events.MessageDelete, vedett("Törlés napló", naplozas.torles));
client.on(Events.MessageBulkDelete, vedett("Tömeges törlés napló", naplozas.tomegesTorles));
client.on(Events.MessageUpdate, vedett("Szerkesztés napló", naplozas.szerkesztes));
client.on(Events.ChannelCreate, vedett("Csatorna napló", naplozas.csatornaUj));
client.on(Events.ChannelDelete, vedett("Csatorna napló", naplozas.csatornaTorolve));
client.on(Events.ChannelUpdate, vedett("Csatorna napló", naplozas.csatornaFrissites));
client.on(Events.GuildRoleCreate, vedett("Rang napló", naplozas.rangUj));
client.on(Events.GuildRoleDelete, vedett("Rang napló", naplozas.rangTorolve));
client.on(Events.GuildRoleUpdate, vedett("Rang napló", naplozas.rangFrissites));
client.on(Events.InviteCreate, vedett("Meghívó napló", naplozas.meghivoUj));
client.on(Events.InviteDelete, vedett("Meghívó napló", naplozas.meghivoTorolve));
client.on(Events.VoiceStateUpdate, vedett("Hang napló", naplozas.hang));
client.on(Events.GuildUpdate, vedett("Szerver napló", naplozas.szerverFrissites));
client.on(
  Events.MessageCreate,
  vedett("Üzenet", async (m) => {
    if (await naplozas.automod(m)) return;
    await kozosseg.uzenet(m);
    await szintek.uzenet(m);
  }),
);
client.on(Events.GuildCreate, (g) => console.log(`Új szerverre kerültem: ${g.name}`));
process.on("unhandledRejection", (e) => console.error("Hiba:", e));

if (!process.env.DISCORD_TOKEN) {
  console.error("HIBA: hiányzik a DISCORD_TOKEN. Futtasd újra a telepítőt.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  const uzenet = String((e && e.message) || e);
  if ((e && e.code === "DisallowedIntents") || /disallowed intents|privileged intent/i.test(uzenet)) {
    console.error("HIBA: a Developer Portalon kapcsold be: Bot > Privileged Gateway Intents > SERVER MEMBERS INTENT és MESSAGE CONTENT INTENT, majd Save Changes.");
  } else if (/token/i.test(uzenet) || (e && e.code === "TokenInvalid")) {
    console.error("HIBA: hibás a bot token. Kérj újat (Developer Portal > Bot > Reset Token), és futtasd újra a telepítőt.");
  } else {
    console.error(e);
  }
  process.exit(1);
});
