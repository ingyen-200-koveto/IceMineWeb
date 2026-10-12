const { ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, OverwriteType, AttachmentBuilder, MessageFlags } = require("discord.js");
const { K, P, adat, ment, beall, embed, sor, rejtett, csatorna, tudIrni, naplo, dm, staffE, vagas } = require("../kozos");

const TIPUSOK = {
  segitseg: { nev: "Kérdés, segítség", leiras: "Bármi, amiben elakadtál", tipp: "" },
  vasarlas: { nev: "Vásárlás, IceCoin", leiras: "Gond van egy vásárlással vagy az egyenlegeddel", tipp: "Írd meg a felhasználóneved, mikor vásároltál és mennyit fizettél." },
  hiba: { nev: "Hibajelentés", leiras: "Valami nem úgy működik, ahogy kéne", tipp: "Írd le, mit csináltál és mi történt. Ha van róla képed, csatold." },
  jelentes: { nev: "Játékos jelentése", leiras: "Csaló, sértegető vagy szabályszegő játékos", tipp: "Kit jelentesz, mit csinált és mikor? Egy kép vagy videó sokat segít." },
  fellebbezes: { nev: "Fellebbezés", leiras: "Szerinted jogtalanul kaptál büntetést", tipp: "Írd meg a játékbeli neved, milyen büntetést kaptál, és miért kéred a feloldását." },
  egyeb: { nev: "Egyéb", leiras: "Ami nem fér bele a többibe", tipp: "" },
};

function tulajdonos(ch) {
  const m = ch && typeof ch.topic === "string" ? ch.topic.match(/^(\d{17,20}) \|/) : null;
  return m ? m[1] : null;
}

function gombok(kezeloNev) {
  const atvesz = new ButtonBuilder().setCustomId("ticket:atvesz").setStyle(ButtonStyle.Secondary);
  if (kezeloNev) atvesz.setLabel(vagas(`Kezeli: ${kezeloNev}`, 80)).setDisabled(true);
  else atvesz.setLabel("Átveszem");
  return sor(atvesz, new ButtonBuilder().setCustomId("ticket:lezaras").setLabel("Lezárás").setStyle(ButtonStyle.Danger));
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
    const beagyazas = m.embeds.length ? ` [${m.embeds[0].title || m.embeds[0].description || "beágyazás"}]` : "";
    const csatolmany = m.attachments.size ? " " + [...m.attachments.values()].map((a) => a.url).join(" ") : "";
    return `[${ido}] ${m.author.username}: ${m.content || ""}${beagyazas}${csatolmany}`;
  });
  return fejlec.join("\n") + "\n\n" + sorok.join("\n");
}

const parancsok = {
  async "ticket-panel"(i) {
    const b = beall(i.guild.id);
    if (!b.ticketKategoria || !b.staffRang) return rejtett(i, "Előbb állítsd be a ticketeket: `/beallitas ticket`");
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return rejtett(i, `Ide nem tudok írni: ${ch}`);
    const e = embed()
      .setTitle("Ticket nyitása")
      .setDescription(
        "Ha kérdésed van, hibát találtál, gond van egy vásárlással, vagy jelentenél valakit, válassz témát lent.\n\nNyitunk neked egy privát csatornát, amit csak te és a staff láttok.",
      );
    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket:tipus")
      .setPlaceholder("Miben segíthetünk?")
      .addOptions(Object.entries(TIPUSOK).map(([value, t]) => ({ label: t.nev, value, description: t.leiras })));
    await ch.send({ embeds: [e], components: [sor(menu)] });
    return rejtett(i, `Kint van a panel: ${ch}`);
  },

  async ticket(i) {
    const sub = i.options.getSubcommand();
    const ch = i.channel;
    const tulaj = tulajdonos(ch);
    if (!tulaj) return rejtett(i, "Ezt egy ticket csatornában használd.");
    if (!staffE(i.member, i.guild.id)) return rejtett(i, "Ezt csak a staff használhatja.");
    const user = i.options.getUser("tag");
    if (user.bot) return rejtett(i, "Botot nem kell hozzáadni.");
    if (sub === "hozzaad") {
      await ch.permissionOverwrites.edit(
        user.id,
        { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true },
        { type: OverwriteType.Member },
      );
      return i.reply({ content: `${user} hozzá lett adva a tickethez.`, allowedMentions: { users: [user.id] } });
    }
    if (user.id === tulaj) return rejtett(i, "A ticket nyitóját nem lehet kivenni.");
    await ch.permissionOverwrites.delete(user.id).catch(() => {});
    return i.reply({ content: `${user.username} már nem látja ezt a ticketet.`, allowedMentions: { parse: [] } });
  },
};

async function nyitas(i) {
  const b = beall(i.guild.id);
  if (!b.ticketKategoria || !b.staffRang) return rejtett(i, "A ticketek még nincsenek beállítva, szólj egy adminnak.");
  const tipus = TIPUSOK[i.values[0]];
  if (!tipus) return rejtett(i, "Ismeretlen téma.");

  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await i.message.edit({ components: i.message.components }).catch(() => {});

  const meglevo = i.guild.channels.cache.find((c) => c.parentId === b.ticketKategoria && tulajdonos(c) === i.user.id);
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
      { id: i.client.user.id, type: OverwriteType.Member, allow: [...alap, P.ManageChannels] },
    ],
  });

  const e = embed()
    .setTitle(tipus.nev)
    .setDescription(`Szia ${i.user}! Írd le, miben segíthetünk, valaki a staffból hamarosan ránéz.` + (tipus.tipp ? `\n\n${tipus.tipp}` : ""));
  await ch.send({
    content: `${i.user} <@&${b.staffRang}>`,
    embeds: [e],
    components: [gombok()],
    allowedMentions: { users: [i.user.id], roles: [b.staffRang] },
  });
  await i.editReply(`Kész a ticketed: ${ch}`);
  return naplo(
    i.guild,
    embed().setTitle("Új ticket").setDescription(`**Ticket:** ${ch}\n**Nyitotta:** ${i.user}\n**Téma:** ${tipus.nev}`),
  );
}

async function atvetel(i) {
  const tulaj = tulajdonos(i.channel);
  if (!tulaj) return rejtett(i, "Ez nem ticket csatorna.");
  if (!staffE(i.member, i.guild.id)) return rejtett(i, "Ticketet csak a staff vehet át.");
  const kezelo = adat.ticketKezelo[i.channel.id];
  if (kezelo === i.user.id) return rejtett(i, "Ez már nálad van.");
  if (kezelo) return rejtett(i, `Ezt már <@${kezelo}> intézi.`);
  adat.ticketKezelo[i.channel.id] = i.user.id;
  ment();
  await i.update({ components: [gombok(i.user.username)] });
  return i.followUp({ content: `${i.user} átvette a ticketet.`, allowedMentions: { parse: [] } });
}

async function lezarasKerdes(i) {
  const tulaj = tulajdonos(i.channel);
  if (!tulaj) return rejtett(i, "Ez nem ticket csatorna.");
  if (!staffE(i.member, i.guild.id) && i.user.id !== tulaj) return rejtett(i, "Ezt csak a ticket nyitója vagy a staff zárhatja le.");
  const vanNaplo = !!beall(i.guild.id).naplo;
  return rejtett(i, {
    content: "Biztosan lezárod? A csatorna törlődik" + (vanNaplo ? ", de a beszélgetés megmarad a naplóban." : "."),
    components: [sor(new ButtonBuilder().setCustomId("ticket:lezaras-ok").setLabel("Igen, lezárom").setStyle(ButtonStyle.Danger))],
  });
}

async function lezaras(i) {
  const ch = i.channel;
  const tulaj = tulajdonos(ch);
  if (!tulaj) return rejtett(i, "Ez nem ticket csatorna.");
  if (!staffE(i.member, i.guild.id) && i.user.id !== tulaj) return rejtett(i, "Ezt csak a ticket nyitója vagy a staff zárhatja le.");
  await i.update({ content: "Lezárom…", components: [] });
  await ch.send({ embeds: [embed(K.SZURKE).setDescription(`${i.user} lezárta a ticketet. Pár másodperc múlva törlődik a csatorna.`)] }).catch(() => {});

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
      .setTitle("Ticket lezárva")
      .setDescription(`**Ticket:** ${ch.name}\n**Téma:** ${tema}\n**Nyitotta:** <@${tulaj}>\n**Kezelte:** ${kezelo ? `<@${kezelo}>` : "senki"}\n**Lezárta:** ${i.user}`);
    const files = szoveg ? [new AttachmentBuilder(Buffer.from(szoveg, "utf8"), { name: `${ch.name}.txt` })] : [];
    await naploCh.send({ embeds: [e], files, allowedMentions: { parse: [] } }).catch(() => {});
  }
  delete adat.ticketKezelo[ch.id];
  ment();
  if (tulaj !== i.user.id) {
    const user = await i.client.users.fetch(tulaj).catch(() => null);
    await dm(user, `A ticketed (${ch.name}) le lett zárva. Ha még kell valami, nyiss újat a Discordon.`);
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
