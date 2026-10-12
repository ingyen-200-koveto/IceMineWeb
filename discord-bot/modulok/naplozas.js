const { AuditLogEvent, ChannelType } = require("discord.js");
const { K, P, beall, embed, kartya, linkGomb, csatorna, naplo, staffE, idoSzoveg, unix, vagas, avatar, tudIrni, sajatE } = require("../kozos");

async function kiCsinalta(guild, tipus, celId) {
  const me = guild.members.me;
  if (!me || !me.permissions || !me.permissions.has(P.ViewAuditLog)) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type: tipus, limit: 6 });
    const e = [...logs.entries.values()].find((x) => (!celId || (x.target && x.target.id === celId) || x.targetId === celId) && Date.now() - x.createdTimestamp < 15000);
    return e ? { ki: e.executor, ok: e.reason } : null;
  } catch {
    return null;
  }
}

const kiSor = (a) => (a && a.ki ? `\n🛡️ **Ki:** ${a.ki}${a.ok ? `\n📝 **Indok:** ${a.ok}` : ""}` : "");
const CSATORNA_TIPUS = { 0: "szöveges", 2: "hang", 4: "kategória", 5: "hír", 13: "színpad", 15: "fórum" };

const MEGHIVO = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/gi;
const SAJAT_KOD = (K.DISCORD_LINK.match(/\/([\w-]+)$/) || [])[1];

function udvozloKartya(m) {
  return kartya()
    .banner("udvozlo")
    .kepes(
      [
        `## 👋 Szia, ${m.user.username}!`,
        `Jó, hogy itt vagy, ${m}! Te vagy a **${m.guild.memberCount}.** tagunk. 🎉`,
      ].join("\n"),
      avatar(m.user),
    )
    .elvalaszto()
    .szoveg(
      `🎮 **Szerver:** \`${K.MC_HOST}\` · Java és Bedrock`,
      `🧩 **Verziók:** ${K.VERZIOK}`,
      `🌐 **Fiók, IceCoin, rangok:** a weboldalon`,
      `🎫 **Segítség kell?** Nyiss egy ticketet!`,
    )
    .sor(linkGomb("Weboldal", K.WEB, "🌐"), linkGomb("YouTube", K.YOUTUBE, "▶️"))
    .lab();
}

async function belepes(m) {
  const b = beall(m.guild.id);
  if (b.autorang) await m.roles.add(b.autorang, "Autorang").catch((e) => console.error("Autorang:", e.message));
  const ch = await csatorna(m.guild, b.udvozlo);
  if (ch && tudIrni(ch)) await ch.send(udvozloKartya(m).uzenet({ allowedMentions: { users: [m.id] } })).catch(() => {});
  const kor = Date.now() - m.user.createdTimestamp;
  await naplo(
    m.guild,
    embed(K.ZOLD)
      .setAuthor({ name: m.user.username, iconURL: m.user.displayAvatarURL() })
      .setTitle("📥 Belépett")
      .setDescription(`${m}\n🗓️ **Fiók kora:** ${idoSzoveg(kor)}${kor < 7 * 86400000 ? " ⚠️ (új fiók)" : ""}\n👥 **Tagok száma:** ${m.guild.memberCount}\n🆔 ${m.id}`),
    null,
    "tag",
  );
}

async function kilepes(m) {
  const bentVolt = m.joinedTimestamp ? `\n⏱️ **Bent volt:** ${idoSzoveg(Date.now() - m.joinedTimestamp)}` : "";
  if (sajatE(`kick:${m.guild.id}:${m.id}`) || sajatE(`ban:${m.guild.id}:${m.id}`)) return;
  const kick = await kiCsinalta(m.guild, AuditLogEvent.MemberKick, m.id);
  const rangok = m.roles && m.roles.cache ? [...m.roles.cache.values()].filter((r) => r.id !== m.guild.id).map((r) => `<@&${r.id}>`) : [];
  await naplo(
    m.guild,
    embed(kick ? K.SARGA : K.SZURKE)
      .setAuthor({ name: m.user.username, iconURL: m.user.displayAvatarURL() })
      .setTitle(kick ? "👢 Kirúgták" : "📤 Kilépett")
      .setDescription(`${m.user.username}${bentVolt}${rangok.length ? `\n🎭 **Rangjai voltak:** ${rangok.slice(0, 15).join(" ")}` : ""}\n🆔 ${m.id}${kiSor(kick)}`),
    null,
    "tag",
  );
}

function figyelt(m) {
  if (!m || !m.guild || m.partial || !m.author || m.author.bot) return false;
  return m.channel.id !== beall(m.guild.id).naplo;
}

async function torles(m) {
  if (!figyelt(m)) return;
  const tartalom = m.content ? vagas(m.content, 1500) : "*(nincs szöveg)*";
  const csatolmany = m.attachments && m.attachments.size ? `\n📎 **Csatolmány:** ${[...m.attachments.values()].map((a) => a.name).join(", ")}` : "";
  const a = await kiCsinalta(m.guild, AuditLogEvent.MessageDelete, m.author.id);
  await naplo(
    m.guild,
    embed(K.PIROS)
      .setAuthor({ name: m.author.username, iconURL: m.author.displayAvatarURL() })
      .setTitle("🗑️ Törölt üzenet")
      .setDescription(`📍 **Csatorna:** ${m.channel}\n✍️ **Írta:** ${m.author}${csatolmany}${a ? `\n🛡️ **Törölte:** ${a.ki}` : ""}\n\n${tartalom}`),
    null,
    "uzenet",
  );
}

async function szerkesztes(regi, uj) {
  if (!figyelt(uj) || !regi || regi.partial || regi.content === uj.content) return;
  await naplo(
    uj.guild,
    embed(K.SARGA)
      .setAuthor({ name: uj.author.username, iconURL: uj.author.displayAvatarURL() })
      .setTitle("✏️ Szerkesztett üzenet")
      .setDescription(
        `📍 **Csatorna:** ${uj.channel} · [ugrás](${uj.url})\n✍️ **Írta:** ${uj.author}\n\n**Előtte:**\n${vagas(regi.content || "*(üres)*", 900)}\n\n**Utána:**\n${vagas(uj.content || "*(üres)*", 900)}`,
      ),
    null,
    "uzenet",
  );
}

async function automod(m) {
  if (!m.guild || !m.member || m.author.bot) return false;
  const b = beall(m.guild.id);
  if (!b.linkszuro || staffE(m.member, m.guild.id)) return false;
  let ok = null;
  const kodok = [...(m.content || "").matchAll(MEGHIVO)].map((x) => x[1]);
  if (kodok.some((k) => k !== SAJAT_KOD)) ok = "más Discord szerver meghívója";
  else if (m.mentions && m.mentions.users && m.mentions.users.size >= 5) ok = "túl sok megemlítés";
  if (!ok) return false;
  await m.delete().catch(() => {});
  const figyelmeztetes = await m.channel
    .send(kartya(K.SARGA).szoveg(`🚫 ${m.author}, ezt itt nem lehet (${ok}).`).uzenet({ allowedMentions: { users: [m.author.id] } }))
    .catch(() => null);
  if (figyelmeztetes) setTimeout(() => figyelmeztetes.delete().catch(() => {}), 6000);
  await naplo(
    m.guild,
    embed(K.SARGA)
      .setTitle("🤖 Automatikusan törölt üzenet")
      .setDescription(`✍️ **Írta:** ${m.author}\n📍 **Csatorna:** ${m.channel}\n🚫 **Ok:** ${ok}\n<t:${unix(Date.now())}:f>\n\n${vagas(m.content, 1200)}`),
    null,
    "uzenet",
  );
  return true;
}

async function tomegesTorles(uzenetek, ch) {
  if (!ch || !ch.guild || sajatE(`bulk:${ch.id}`)) return;
  const szerzok = new Set([...uzenetek.values()].filter((m) => m.author).map((m) => m.author.username));
  const a = await kiCsinalta(ch.guild, AuditLogEvent.MessageBulkDelete, ch.id);
  await naplo(
    ch.guild,
    embed(K.PIROS)
      .setTitle("🧹 Tömeges törlés")
      .setDescription(`📍 **Csatorna:** ${ch}\n🗑️ **Darab:** ${uzenetek.size}${szerzok.size ? `\n✍️ **Írták:** ${vagas([...szerzok].join(", "), 600)}` : ""}${kiSor(a)}`),
    null,
    "uzenet",
  );
}

async function tagFrissites(regi, uj) {
  if (!uj.guild || regi.partial || uj.user.bot) return;
  const g = uj.guild;
  const nevjegy = { name: uj.user.username, iconURL: uj.user.displayAvatarURL() };
  if (regi.nickname !== uj.nickname) {
    await naplo(g, embed(K.SZIN).setAuthor(nevjegy).setTitle("✏️ Becenév változott").setDescription(`${uj}\n**Előtte:** ${regi.nickname || "*(nincs)*"}\n**Utána:** ${uj.nickname || "*(nincs)*"}`), null, "tag");
  }
  const regiR = regi.roles.cache;
  const ujR = uj.roles.cache;
  const kapott = [...ujR.values()].filter((r) => !regiR.has(r.id));
  const elvett = [...regiR.values()].filter((r) => !ujR.has(r.id));
  if (kapott.length || elvett.length) {
    const a = await kiCsinalta(g, AuditLogEvent.MemberRoleUpdate, uj.id);
    const sorok = [`${uj}`];
    if (kapott.length) sorok.push(`➕ ${kapott.map((r) => `<@&${r.id}>`).join(" ")}`);
    if (elvett.length) sorok.push(`➖ ${elvett.map((r) => `<@&${r.id}>`).join(" ")}`);
    await naplo(g, embed(K.LILA).setAuthor(nevjegy).setTitle("🎭 Rang változás").setDescription(sorok.join("\n") + kiSor(a)), null, "tag");
  }
  const regiT = regi.communicationDisabledUntilTimestamp || 0;
  const ujT = uj.communicationDisabledUntilTimestamp || 0;
  if (regiT !== ujT && !sajatE(`timeout:${g.id}:${uj.id}`)) {
    const a = await kiCsinalta(g, AuditLogEvent.MemberUpdate, uj.id);
    const most = ujT > Date.now();
    await naplo(
      g,
      embed(most ? K.SARGA : K.ZOLD)
        .setAuthor(nevjegy)
        .setTitle(most ? "🔇 Időkorlátot kapott" : "🔊 Időkorlát vége")
        .setDescription(`${uj}${most ? `\n⏰ **Lejár:** <t:${unix(ujT)}:R>` : ""}${kiSor(a)}`),
      null,
      "tag",
    );
  }
  if (!regi.premiumSinceTimestamp && uj.premiumSinceTimestamp) {
    await naplo(g, embed(0xf47fff).setAuthor(nevjegy).setTitle("🚀 Új boost!").setDescription(`${uj} boostolta a szervert!`), null, "tag");
    const ch = await csatorna(g, beall(g.id).udvozlo);
    if (ch && tudIrni(ch)) {
      const k = kartya(0xf47fff).kepes(`### 🚀 Köszönjük a boostot!\n${uj} boostolta az IceMine Discordot. Te vagy a legjobb! 💜`, avatar(uj.user)).lab();
      await ch.send(k.uzenet({ allowedMentions: { users: [uj.id] } })).catch(() => {});
    }
  }
}

async function banUj(ban) {
  if (sajatE(`ban:${ban.guild.id}:${ban.user.id}`)) return;
  const a = await kiCsinalta(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  await naplo(ban.guild, embed(K.PIROS).setAuthor({ name: ban.user.username, iconURL: ban.user.displayAvatarURL() }).setTitle("🔨 Kitiltották").setDescription(`${ban.user} (${ban.user.id})${kiSor(a)}`), null, "tag");
}

async function banTorolve(ban) {
  if (sajatE(`unban:${ban.guild.id}:${ban.user.id}`)) return;
  const a = await kiCsinalta(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
  await naplo(ban.guild, embed(K.ZOLD).setAuthor({ name: ban.user.username, iconURL: ban.user.displayAvatarURL() }).setTitle("✅ Kitiltás feloldva").setDescription(`${ban.user} (${ban.user.id})${kiSor(a)}`), null, "tag");
}

const ticketCsatornaE = (ch) => {
  const b = beall(ch.guild.id);
  return !!(b.ticketKategoria && ch.parentId === b.ticketKategoria && ch.type !== ChannelType.GuildCategory);
};

async function csatornaUj(ch) {
  if (!ch.guild || ticketCsatornaE(ch)) return;
  const a = await kiCsinalta(ch.guild, AuditLogEvent.ChannelCreate, ch.id);
  await naplo(ch.guild, embed(K.ZOLD).setTitle("📁 Új csatorna").setDescription(`${ch} (**${ch.name}**, ${CSATORNA_TIPUS[ch.type] || "egyéb"})${kiSor(a)}`), null, "szerver");
}

async function csatornaTorolve(ch) {
  if (!ch.guild || ticketCsatornaE(ch)) return;
  const a = await kiCsinalta(ch.guild, AuditLogEvent.ChannelDelete, ch.id);
  await naplo(ch.guild, embed(K.PIROS).setTitle("🗑️ Csatorna törölve").setDescription(`**${ch.name}** (${CSATORNA_TIPUS[ch.type] || "egyéb"})${kiSor(a)}`), null, "szerver");
}

async function csatornaFrissites(regi, uj) {
  if (!uj.guild || ticketCsatornaE(uj)) return;
  const sorok = [];
  if (regi.name !== uj.name) sorok.push(`🏷️ **Név:** ${regi.name} → ${uj.name}`);
  if ((regi.topic || "") !== (uj.topic || "")) sorok.push(`📝 **Leírás:** ${vagas(regi.topic || "*(nincs)*", 300)} → ${vagas(uj.topic || "*(nincs)*", 300)}`);
  if (regi.nsfw !== uj.nsfw) sorok.push(`🔞 **Korhatáros:** ${uj.nsfw ? "be" : "ki"}`);
  if (regi.parentId !== uj.parentId) sorok.push(`📂 **Kategória:** ${regi.parentId ? `<#${regi.parentId}>` : "nincs"} → ${uj.parentId ? `<#${uj.parentId}>` : "nincs"}`);
  if (!sorok.length) return;
  const a = await kiCsinalta(uj.guild, AuditLogEvent.ChannelUpdate, uj.id);
  await naplo(uj.guild, embed(K.SZIN).setTitle("🛠️ Csatorna módosítva").setDescription(`${uj}\n${sorok.join("\n")}${kiSor(a)}`), null, "szerver");
}

async function rangUj(r) {
  const a = await kiCsinalta(r.guild, AuditLogEvent.RoleCreate, r.id);
  await naplo(r.guild, embed(K.ZOLD).setTitle("🎭 Új rang").setDescription(`${r} (**${r.name}**)${kiSor(a)}`), null, "szerver");
}

async function rangTorolve(r) {
  const a = await kiCsinalta(r.guild, AuditLogEvent.RoleDelete, r.id);
  await naplo(r.guild, embed(K.PIROS).setTitle("🗑️ Rang törölve").setDescription(`**${r.name}**${kiSor(a)}`), null, "szerver");
}

async function rangFrissites(regi, uj) {
  const sorok = [];
  if (regi.name !== uj.name) sorok.push(`🏷️ **Név:** ${regi.name} → ${uj.name}`);
  if (regi.color !== uj.color) sorok.push(`🎨 **Szín:** ${regi.hexColor} → ${uj.hexColor}`);
  if (regi.hoist !== uj.hoist) sorok.push(`📌 **Külön mutatva:** ${uj.hoist ? "igen" : "nem"}`);
  if (regi.mentionable !== uj.mentionable) sorok.push(`📣 **Megemlíthető:** ${uj.mentionable ? "igen" : "nem"}`);
  if (regi.permissions && uj.permissions && regi.permissions.bitfield !== uj.permissions.bitfield) {
    const r1 = new Set(regi.permissions.toArray());
    const r2 = new Set(uj.permissions.toArray());
    const plusz = [...r2].filter((x) => !r1.has(x));
    const minusz = [...r1].filter((x) => !r2.has(x));
    if (plusz.length) sorok.push(`➕ **Jogok:** ${plusz.join(", ")}`);
    if (minusz.length) sorok.push(`➖ **Jogok:** ${minusz.join(", ")}`);
  }
  if (!sorok.length) return;
  const a = await kiCsinalta(uj.guild, AuditLogEvent.RoleUpdate, uj.id);
  await naplo(uj.guild, embed(K.SZIN).setTitle("🛠️ Rang módosítva").setDescription(`${uj}\n${vagas(sorok.join("\n"), 3500)}${kiSor(a)}`), null, "szerver");
}

const meghivoSzerver = (inv) => (inv.guild && inv.client ? inv.client.guilds.cache.get(inv.guild.id) : null);

async function meghivoUj(inv) {
  const g = meghivoSzerver(inv);
  if (!g) return;
  const lejar = inv.expiresTimestamp ? `<t:${unix(inv.expiresTimestamp)}:R>` : "soha";
  await naplo(
    g,
    embed(K.SZIN)
      .setTitle("💌 Új meghívó")
      .setDescription(`🔗 discord.gg/${inv.code}\n👤 **Készítette:** ${inv.inviter || "ismeretlen"}\n📍 **Csatorna:** ${inv.channel || "?"}\n🔢 **Max. használat:** ${inv.maxUses || "korlátlan"}\n⏰ **Lejár:** ${lejar}`),
    null,
    "szerver",
  );
}

async function meghivoTorolve(inv) {
  const g = meghivoSzerver(inv);
  if (!g) return;
  await naplo(g, embed(K.SZURKE).setTitle("✂️ Meghívó törölve").setDescription(`🔗 discord.gg/${inv.code}`), null, "szerver");
}

async function hang(regi, uj) {
  const m = uj.member || regi.member;
  if (!m || m.user.bot || regi.channelId === uj.channelId) return;
  const nevjegy = { name: m.user.username, iconURL: m.user.displayAvatarURL() };
  let e;
  if (!regi.channelId) e = embed(K.ZOLD).setAuthor(nevjegy).setTitle("🔊 Hangcsatornába lépett").setDescription(`${m} → <#${uj.channelId}>`);
  else if (!uj.channelId) e = embed(K.SZURKE).setAuthor(nevjegy).setTitle("🔇 Kilépett a hangból").setDescription(`${m} ← <#${regi.channelId}>`);
  else e = embed(K.SZIN).setAuthor(nevjegy).setTitle("🔁 Hangcsatornát váltott").setDescription(`${m}: <#${regi.channelId}> → <#${uj.channelId}>`);
  await naplo(uj.guild || regi.guild, e, null, "hang");
}

async function szerverFrissites(regi, uj) {
  const sorok = [];
  if (regi.name !== uj.name) sorok.push(`🏷️ **Név:** ${regi.name} → ${uj.name}`);
  if (regi.icon !== uj.icon) sorok.push("🖼️ **Ikon** megváltozott");
  if (regi.banner !== uj.banner) sorok.push("🖼️ **Banner** megváltozott");
  if (regi.premiumTier !== uj.premiumTier) sorok.push(`🚀 **Boost szint:** ${regi.premiumTier} → ${uj.premiumTier}`);
  if (!sorok.length) return;
  await naplo(uj, embed(K.SZIN).setTitle("🏰 Szerver módosítva").setDescription(sorok.join("\n")), null, "szerver");
}

async function parancsNaplo(i) {
  if (!i.guild) return;
  const opciok = [];
  const jar = (lista) => {
    for (const o of lista || []) {
      if (o.options) {
        opciok.push(o.name);
        jar(o.options);
      } else opciok.push(`${o.name}:${vagas(String(o.value ?? ""), 60)}`);
    }
  };
  jar(i.options && i.options.data);
  await naplo(
    i.guild,
    embed(K.SZURKE)
      .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() })
      .setDescription(`⌨️ \`/${i.commandName}${opciok.length ? " " + opciok.join(" ") : ""}\`\n📍 ${i.channel || "?"}`),
    null,
    "parancs",
  );
}

module.exports = {
  belepes,
  kilepes,
  torles,
  szerkesztes,
  automod,
  udvozloKartya,
  tomegesTorles,
  tagFrissites,
  banUj,
  banTorolve,
  csatornaUj,
  csatornaTorolve,
  csatornaFrissites,
  rangUj,
  rangTorolve,
  rangFrissites,
  meghivoUj,
  meghivoTorolve,
  hang,
  szerverFrissites,
  parancsNaplo,
};
