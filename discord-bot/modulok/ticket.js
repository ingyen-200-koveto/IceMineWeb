const { ButtonStyle, StringSelectMenuBuilder, ChannelType, OverwriteType, AttachmentBuilder, MessageFlags } = require("discord.js");
const { K, P, V2, adat, ment, beall, embed, kartya, sor, gomb, vagas, valasz, hiba, rejtett, csatorna, tudIrni, naplo, dm, staffE, unix, avatar, v2E } = require("../kozos");

const TIPUSOK = {
  segitseg: { nev: "Kérdés, segítség", emoji: "❓", leiras: "Bármi, amiben elakadtál", tipp: "" },
  vasarlas: { nev: "Vásárlás, IceCoin", emoji: "💎", leiras: "Gond van egy vásárlással vagy az egyenlegeddel", tipp: "Írd meg a felhasználóneved, mikor vásároltál és mennyit fizettél." },
  hiba: { nev: "Hibajelentés", emoji: "🐛", leiras: "Valami nem úgy működik, ahogy kéne", tipp: "Írd le, mit csináltál és mi történt. Ha van róla képed, csatold." },
  jelentes: { nev: "Játékos jelentése", emoji: "🚩", leiras: "Csaló, sértegető vagy szabályszegő játékos", tipp: "Kit jelentesz, mit csinált és mikor? Egy kép vagy videó sokat segít." },
  fellebbezes: { nev: "Fellebbezés", emoji: "⚖️", leiras: "Szerinted jogtalanul kaptál büntetést", tipp: "Írd meg a játékbeli neved, milyen büntetést kaptál, és miért kéred a feloldását." },
  egyeb: { nev: "Egyéb", emoji: "📩", leiras: "Ami nem fér bele a többibe", tipp: "" },
};

function tulajdonos(ch) {
  const m = ch && typeof ch.topic === "string" ? ch.topic.match(/^(\d{17,20}) \|/) : null;
  return m ? m[1] : null;
}

function tipusTopicbol(ch) {
  const nev = ch.topic.split(" | ").slice(1).join(" | ");
  return Object.values(TIPUSOK).find((t) => t.nev === nev) || { nev, emoji: "🎫", tipp: "" };
}

function ticketKartya(ch, user, tipus, staffRang, kezelo) {
  const k = kartya(kezelo ? K.ZOLD : K.SZIN)
    .szoveg(`${user} <@&${staffRang}>`)
    .kepes(
      [`### ${tipus.emoji} ${tipus.nev}`, `Szia ${user}! Írd le, miben segíthetünk, valaki a staffból hamarosan ránéz. 👋`, tipus.tipp ? `\n💡 ${tipus.tipp}` : null]
        .filter(Boolean)
        .join("\n"),
      avatar(user),
    )
    .elvalaszto()
    .szoveg(`👤 **Nyitotta:** ${user}`, `🛠️ **Kezeli:** ${kezelo ? `<@${kezelo}>` : "még senki"}`, `📅 **Nyitva:** <t:${unix(ch.createdTimestamp || Date.now())}:R>`);
  const atvesz = gomb("ticket:atvesz", kezelo ? "Átvéve" : "Átveszem", ButtonStyle.Success, "🙋");
  if (kezelo) atvesz.setDisabled(true);
  return k.sor(atvesz, gomb("ticket:lezaras", "Lezárás", ButtonStyle.Danger, "🔒")).lab(`🎫 ${ch.name} • 🧊 IceMine`);
}

async function atirat(ch, fejlec) {
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
  const sorok = mind.map((m) => {
    const ido = new Date(m.createdTimestamp).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
    const beagyazas = m.embeds && m.embeds.length ? ` [${m.embeds[0].title || m.embeds[0].description || "beágyazás"}]` : "";
    const csatolmany = m.attachments && m.attachments.size ? " " + [...m.attachments.values()].map((a) => a.url).join(" ") : "";
    return `[${ido}] ${m.author.username}: ${m.content || ""}${beagyazas}${csatolmany}`;
  });
  return fejlec.join("\n") + "\n\n" + sorok.join("\n");
}

const parancsok = {
  async "ticket-panel"(i) {
    const b = beall(i.guild.id);
    if (!b.ticketKategoria || !b.staffRang) return hiba(i, "Előbb állítsd be a ticketeket: `/beallitas ticket`");
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket:tipus")
      .setPlaceholder("🎫 Válassz témát…")
      .addOptions(Object.entries(TIPUSOK).map(([value, t]) => ({ label: t.nev, value, description: t.leiras, emoji: t.emoji })));
    const k = kartya()
      .banner("ticket")
      .szoveg(
        "### 🎫 Miben segíthetünk?",
        "Válassz témát lent, és nyitunk neked egy privát csatornát, amit csak te és a staff láttok.",
      )
      .szoveg(...Object.values(TIPUSOK).map((t) => `${t.emoji} **${t.nev}** · ${t.leiras}`))
      .elvalaszto()
      .sor(menu)
      .lab("🔒 A ticketedet csak te és a staff látjátok • 🧊 IceMine");
    await ch.send(k.uzenet());
    b.ticketPanel = ch.id;
    ment();
    return rejtett(i, kartya(K.ZOLD).szoveg(`✅ Kint van a panel: ${ch}`));
  },

  async ticket(i) {
    const sub = i.options.getSubcommand();
    const ch = i.channel;
    const tulaj = tulajdonos(ch);
    if (!tulaj) return hiba(i, "Ezt egy ticket csatornában használd.");
    if (!staffE(i.member, i.guild.id)) return hiba(i, "Ezt csak a staff használhatja.");
    const user = i.options.getUser("tag");
    if (user.bot) return hiba(i, "Botot nem kell hozzáadni.");
    if (sub === "hozzaad") {
      await ch.permissionOverwrites.edit(
        user.id,
        { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true },
        { type: OverwriteType.Member },
      );
      return valasz(i, kartya(K.ZOLD).szoveg(`➕ ${user} hozzá lett adva a tickethez.`), { allowedMentions: { users: [user.id] } });
    }
    if (user.id === tulaj) return hiba(i, "A ticket nyitóját nem lehet kivenni.");
    await ch.permissionOverwrites.delete(user.id).catch(() => {});
    return valasz(i, kartya(K.SZURKE).szoveg(`➖ ${user.username} már nem látja ezt a ticketet.`));
  },
};

async function nyitas(i) {
  const b = beall(i.guild.id);
  if (!b.ticketKategoria || !b.staffRang) return hiba(i, "A ticketek még nincsenek beállítva, szólj egy adminnak.");
  const tipus = TIPUSOK[i.values[0]];
  if (!tipus) return hiba(i, "Ismeretlen téma.");

  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const reset = v2E(i.message) ? { components: i.message.components, flags: V2 } : { components: i.message.components };
  await i.message.edit(reset).catch(() => {});

  const meglevo = i.guild.channels.cache.find((c) => c.parentId === b.ticketKategoria && tulajdonos(c) === i.user.id);
  if (meglevo) return hiba(i, `Már van nyitott ticketed: ${meglevo}`);

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
      { id: i.client.user.id, type: OverwriteType.Member, allow: [...alap, P.ManageChannels] },
    ],
  });

  await ch.send(ticketKartya(ch, i.user, tipus, b.staffRang, null).uzenet({ allowedMentions: { users: [i.user.id], roles: [b.staffRang] } }));
  await valasz(i, kartya(K.ZOLD).szoveg(`✅ Kész a ticketed: ${ch}`));
  return naplo(i.guild, embed().setTitle("🎫 Új ticket").setDescription(`**Ticket:** ${ch}\n**Nyitotta:** ${i.user}\n**Téma:** ${tipus.emoji} ${tipus.nev}`));
}

async function atvetel(i) {
  const tulaj = tulajdonos(i.channel);
  if (!tulaj) return hiba(i, "Ez nem ticket csatorna.");
  if (!staffE(i.member, i.guild.id)) return hiba(i, "Ticketet csak a staff vehet át.");
  const kezelo = adat.ticketKezelo[i.channel.id];
  if (kezelo === i.user.id) return hiba(i, "Ez már nálad van.");
  if (kezelo) return hiba(i, `Ezt már <@${kezelo}> intézi.`);
  adat.ticketKezelo[i.channel.id] = i.user.id;
  ment();
  if (v2E(i.message)) {
    const user = (await i.client.users.fetch(tulaj).catch(() => null)) || { id: tulaj, username: "?", toString: () => `<@${tulaj}>`, displayAvatarURL: () => K.LOGO };
    await i.update(ticketKartya(i.channel, user, tipusTopicbol(i.channel), beall(i.guild.id).staffRang, i.user.id).uzenet());
  } else {
    const atvesz = gomb("ticket:atvesz", vagas(`Kezeli: ${i.user.username}`, 80), ButtonStyle.Secondary).setDisabled(true);
    await i.update({ components: [sor(atvesz, gomb("ticket:lezaras", "Lezárás", ButtonStyle.Danger, "🔒"))] });
  }
  return i.followUp(kartya(K.ZOLD).szoveg(`🙋 ${i.user} átvette a ticketet, mostantól ő segít.`).uzenet());
}

async function lezarasKerdes(i) {
  const tulaj = tulajdonos(i.channel);
  if (!tulaj) return hiba(i, "Ez nem ticket csatorna.");
  if (!staffE(i.member, i.guild.id) && i.user.id !== tulaj) return hiba(i, "Ezt csak a ticket nyitója vagy a staff zárhatja le.");
  const vanNaplo = !!beall(i.guild.id).naplo;
  return rejtett(
    i,
    kartya(K.PIROS)
      .szoveg("### 🔒 Biztosan lezárod?", "A csatorna törlődik" + (vanNaplo ? ", de a beszélgetés megmarad a naplóban." : "."))
      .sor(gomb("ticket:lezaras-ok", "Igen, lezárom", ButtonStyle.Danger, "🔒")),
  );
}

async function lezaras(i) {
  const ch = i.channel;
  const tulaj = tulajdonos(ch);
  if (!tulaj) return hiba(i, "Ez nem ticket csatorna.");
  if (!staffE(i.member, i.guild.id) && i.user.id !== tulaj) return hiba(i, "Ezt csak a ticket nyitója vagy a staff zárhatja le.");
  await i.update(kartya(K.SZURKE).szoveg("🔒 Lezárom…").uzenet());
  await ch.send(kartya(K.SZURKE).szoveg("### 🔒 Ticket lezárva", `${i.user} lezárta a ticketet. Pár másodperc múlva törlődik a csatorna.`).uzenet()).catch(() => {});

  const b = beall(i.guild.id);
  const naploCh = await csatorna(i.guild, b.naplo);
  const kezelo = adat.ticketKezelo[ch.id];
  if (naploCh) {
    const tema = ch.topic.split(" | ").slice(1).join(" | ");
    const szoveg = await atirat(ch, [
      `Ticket: ${ch.name}`,
      `Téma: ${tema}`,
      `Nyitotta: ${tulaj}`,
      `Kezelte: ${kezelo || "senki"}`,
      `Lezárta: ${i.user.username} (${i.user.id})`,
    ]).catch(() => "");
    const e = embed(K.SZURKE)
      .setTitle("🔒 Ticket lezárva")
      .setDescription(`**Ticket:** ${ch.name}\n**Téma:** ${tema}\n**Nyitotta:** <@${tulaj}>\n**Kezelte:** ${kezelo ? `<@${kezelo}>` : "senki"}\n**Lezárta:** ${i.user}`);
    const files = szoveg ? [new AttachmentBuilder(Buffer.from(szoveg, "utf8"), { name: `${ch.name}.txt` })] : [];
    await naploCh.send({ embeds: [e], files, allowedMentions: { parse: [] } }).catch(() => {});
  }
  delete adat.ticketKezelo[ch.id];
  ment();
  if (tulaj !== i.user.id) {
    const user = await i.client.users.fetch(tulaj).catch(() => null);
    await dm(user, `### 🎫 Ticket lezárva\nA ticketed (${ch.name}) le lett zárva. Ha még kell valami, nyiss újat a Discordon. 💬`, K.SZURKE);
  }
  setTimeout(() => ch.delete(`Ticket lezárva: ${i.user.username}`).catch(() => {}), 5000);
}

module.exports = {
  parancsok,
  komponensek: {
    "ticket:tipus": nyitas,
    "ticket:atvesz": atvetel,
    "ticket:lezaras": lezarasKerdes,
    "ticket:lezaras-ok": lezaras,
  },
};
