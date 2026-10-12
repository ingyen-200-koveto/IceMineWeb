const { K, beall, embed, kartya, linkGomb, csatorna, naplo, staffE, idoSzoveg, unix, vagas, avatar, tudIrni } = require("../kozos");

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
      .setDescription(`${m}\n🗓️ **Fiók kora:** ${idoSzoveg(kor)}${kor < 7 * 86400000 ? " ⚠️ (új fiók)" : ""}\n🆔 ${m.id}`),
  );
}

async function kilepes(m) {
  const bentVolt = m.joinedTimestamp ? `\n⏱️ **Bent volt:** ${idoSzoveg(Date.now() - m.joinedTimestamp)}` : "";
  await naplo(
    m.guild,
    embed(K.SZURKE)
      .setAuthor({ name: m.user.username, iconURL: m.user.displayAvatarURL() })
      .setTitle("📤 Kilépett")
      .setDescription(`${m.user.username}${bentVolt}\n🆔 ${m.id}`),
  );
}

function figyelt(m) {
  if (!m || !m.guild || m.partial || !m.author || m.author.bot) return false;
  return m.channel.id !== beall(m.guild.id).naplo;
}

async function torles(m) {
  if (!figyelt(m)) return;
  const tartalom = m.content ? vagas(m.content, 1500) : "*(nincs szöveg)*";
  const csatolmany = m.attachments && m.attachments.size ? `\n📎 **Csatolmány:** ${m.attachments.size} db` : "";
  await naplo(
    m.guild,
    embed(K.PIROS)
      .setAuthor({ name: m.author.username, iconURL: m.author.displayAvatarURL() })
      .setTitle("🗑️ Törölt üzenet")
      .setDescription(`📍 **Csatorna:** ${m.channel}\n✍️ **Írta:** ${m.author}${csatolmany}\n\n${tartalom}`),
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
        `📍 **Csatorna:** ${uj.channel} · [ugrás](${uj.url})\n\n**Előtte:**\n${vagas(regi.content || "*(üres)*", 900)}\n\n**Utána:**\n${vagas(uj.content || "*(üres)*", 900)}`,
      ),
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
  );
  return true;
}

module.exports = { belepes, kilepes, torles, szerkesztes, automod, udvozloKartya };
