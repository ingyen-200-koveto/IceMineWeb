const crypto = require("crypto");
const { adat, mentKesobb, beall, embed, rejtett, csatorna, tudIrni } = require("../kozos");

const kovetkezo = (szint) => 5 * szint * szint + 50 * szint + 100;

function szintbol(xp) {
  let szint = 0;
  let maradek = xp;
  while (maradek >= kovetkezo(szint)) {
    maradek -= kovetkezo(szint);
    szint++;
  }
  return { szint, maradek, kell: kovetkezo(szint) };
}

function adatai(guildId, userId) {
  const r = ((adat.szintek[guildId] || {})[userId]) || { xp: 0 };
  return { xp: r.xp, ...szintbol(r.xp) };
}

function helyezes(guildId, userId) {
  const lista = Object.entries(adat.szintek[guildId] || {}).sort((a, b) => b[1].xp - a[1].xp);
  const n = lista.findIndex(([id]) => id === userId);
  return n < 0 ? null : n + 1;
}

async function jutalomRangok(member, szint) {
  const b = beall(member.guild.id);
  const jutalmak = b.szintRangok || {};
  for (const [kell, rangId] of Object.entries(jutalmak)) {
    if (szint >= Number(kell) && !member.roles.cache.has(rangId)) {
      await member.roles.add(rangId, `Elérte a(z) ${kell}. szintet`).catch((e) => console.error("Szint rang:", e.message));
    }
  }
}

async function uzenet(m) {
  if (!m.guild || !m.member || m.author.bot || m.system) return;
  const b = beall(m.guild.id);
  if (b.szintekKi) return;
  const tar = (adat.szintek[m.guild.id] ||= {});
  const r = (tar[m.author.id] ||= { xp: 0, utolso: 0 });
  const most = Date.now();
  if (most - (r.utolso || 0) < 60000) return;
  const elotte = szintbol(r.xp).szint;
  r.xp += crypto.randomInt(15, 26);
  r.utolso = most;
  mentKesobb();
  const utana = szintbol(r.xp).szint;
  if (utana <= elotte) return;
  await jutalomRangok(m.member, utana);
  const ch = (await csatorna(m.guild, b.szintCsatorna)) || m.channel;
  if (!tudIrni(ch)) return;
  await ch.send({ content: `${m.author} szintet lépett, most **${utana}.** szintű.`, allowedMentions: { users: [m.author.id] } }).catch(() => {});
}

function csik(arany) {
  const tele = Math.round(arany * 12);
  return "▰".repeat(tele) + "▱".repeat(12 - tele);
}

const parancsok = {
  async szint(i) {
    const user = i.options.getUser("tag") || i.user;
    if (user.bot) return rejtett(i, "A botoknak nincs szintjük.");
    const sz = adatai(i.guild.id, user.id);
    const hely = helyezes(i.guild.id, user.id);
    const e = embed()
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setDescription(
        [
          `**Szint:** ${sz.szint}${hely ? `  ·  **Helyezés:** #${hely}` : ""}`,
          `${csik(sz.maradek / sz.kell)}  ${sz.maradek} / ${sz.kell} XP`,
          `Összesen ${sz.xp} XP`,
        ].join("\n"),
      );
    return i.reply({ embeds: [e] });
  },

  async toplista(i) {
    const lista = Object.entries(adat.szintek[i.guild.id] || {})
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);
    if (!lista.length) return rejtett(i, "Még senkinek nincs XP-je. Írjatok valamit!");
    const sorok = lista.map(([id, r], n) => `**${n + 1}.** <@${id}> – ${szintbol(r.xp).szint}. szint (${r.xp} XP)`);
    return i.reply({ embeds: [embed().setTitle("Toplista").setDescription(sorok.join("\n"))], allowedMentions: { parse: [] } });
  },
};

module.exports = { uzenet, adatai, szintbol, parancsok };
