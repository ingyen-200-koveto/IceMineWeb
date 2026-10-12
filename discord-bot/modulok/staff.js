const { ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, OverwriteType } = require("discord.js");
const { K, beall, embed, kartya, sor, valasz, hiba, csatorna, tudIrni, naplo, avatar } = require("../kozos");
const { rangEllenor } = require("./moderalas");

const SZINEK = { kek: K.SZIN, zold: K.ZOLD, piros: K.PIROS, arany: K.ARANY, lila: K.LILA, rozsa: K.ROZSA };
const fuggo = new Map();

function rangGond(i, rang) {
  if (rang.managed || rang.id === i.guild.id) return `Ezt a rangot nem lehet kiosztani: ${rang}`;
  if (rang.position >= i.guild.members.me.roles.highest.position) return `Ez a rang feljebb van, mint a bot rangja: ${rang}`;
  if (i.user.id !== i.guild.ownerId && rang.position >= i.member.roles.highest.position) return `Ez a rang nem alacsonyabb a tiédnél: ${rang}`;
  return null;
}

const parancsok = {
  async lassitas(i) {
    const mp = i.options.getInteger("masodperc");
    await i.channel.setRateLimitPerUser(mp, `Lassított mód: ${i.user.username}`);
    const k = mp
      ? kartya(K.SARGA).szoveg("### 🐢 Lassított mód", `Ebben a csatornában **${mp} másodpercenként** írhattok egy üzenetet.`)
      : kartya(K.ZOLD).szoveg("### ⚡ Lassított mód kikapcsolva", "Mehet a beszélgetés!");
    await valasz(i, k.lab(`🛡️ ${i.user.username} • 🧊 IceMine`));
    return naplo(i.guild, embed(K.SARGA).setTitle("🐢 Lassított mód").setDescription(`📍 ${i.channel}\n⏱️ ${mp ? `${mp} mp` : "kikapcsolva"}\n🛡️ ${i.user}`));
  },

  async zarolas(i) {
    const be = i.options.getBoolean("be");
    const ok = i.options.getString("ok");
    const ch = i.channel;
    const everyone = i.guild.roles.everyone;
    const indok = `${be ? "Lezárás" : "Feloldás"}: ${i.user.username}`;
    if (be) {
      await ch.permissionOverwrites.edit(everyone, { SendMessages: false, SendMessagesInThreads: false, AddReactions: false }, { reason: indok });
      const staff = beall(i.guild.id).staffRang;
      if (staff) await ch.permissionOverwrites.edit(staff, { SendMessages: true }, { reason: indok, type: OverwriteType.Role }).catch(() => {});
    } else {
      await ch.permissionOverwrites.edit(everyone, { SendMessages: null, SendMessagesInThreads: null, AddReactions: null }, { reason: indok });
    }
    const k = be
      ? kartya(K.PIROS).szoveg("### 🔒 A csatorna lezárva", ok ? `📝 ${ok}` : "Egy kis szünet, hamarosan nyitunk.")
      : kartya(K.ZOLD).szoveg("### 🔓 A csatorna újra nyitva", ok ? `📝 ${ok}` : "Mehet a beszélgetés!");
    await valasz(i, k.lab(`🛡️ ${i.user.username} • 🧊 IceMine`));
    return naplo(i.guild, embed(be ? K.PIROS : K.ZOLD).setTitle(be ? "🔒 Csatorna lezárva" : "🔓 Csatorna feloldva").setDescription(`📍 ${ch}\n🛡️ ${i.user}${ok ? `\n📝 ${ok}` : ""}`));
  },

  async becenev(i) {
    const cel = i.options.getMember("tag");
    const nev = i.options.getString("nev");
    if (!cel) return hiba(i, "Ő nincs fent a szerveren.");
    if (cel.id !== i.user.id) {
      const h = rangEllenor(i, cel);
      if (h) return hiba(i, h);
    }
    if (!cel.manageable) return hiba(i, "Az ő becenevét nem tudom módosítani. Húzd feljebb a bot rangját.");
    await cel.setNickname(nev || null, `Becenév: ${i.user.username}`);
    return valasz(
      i,
      kartya(K.ZOLD)
        .kepes(nev ? `### ✏️ Új becenév\n${cel} mostantól: **${nev}**` : `### ✏️ Becenév törölve\n${cel} újra a saját nevén fut.`, avatar(cel.user))
        .lab(`🛡️ ${i.user.username} • 🧊 IceMine`),
    );
  },

  async rang(i) {
    const sub = i.options.getSubcommand();
    const cel = i.options.getMember("tag");
    const rang = i.options.getRole("rang");
    if (!cel) return hiba(i, "Ő nincs fent a szerveren.");
    const h = rangGond(i, rang);
    if (h) return hiba(i, h);
    if (sub === "adas") {
      if (cel.roles.cache.has(rang.id)) return hiba(i, `Neki már megvan: ${rang}`);
      await cel.roles.add(rang.id, `Rang: ${i.user.username}`);
    } else {
      if (!cel.roles.cache.has(rang.id)) return hiba(i, `Neki nincs ilyen rangja: ${rang}`);
      await cel.roles.remove(rang.id, `Rang elvéve: ${i.user.username}`);
    }
    const ad = sub === "adas";
    await valasz(
      i,
      kartya(ad ? K.ZOLD : K.SZURKE)
        .kepes(`### 🎭 ${ad ? "Rang kiosztva" : "Rang elvéve"}\n${cel} ${ad ? "megkapta" : "elvesztette"}: ${rang}`, avatar(cel.user))
        .lab(`🛡️ ${i.user.username} • 🧊 IceMine`),
    );
    return naplo(i.guild, embed(K.SZIN).setTitle(ad ? "🎭 Rang kiosztva" : "🎭 Rang elvéve").setDescription(`👤 ${cel}\n🎭 ${rang}\n🛡️ ${i.user}`));
  },

  async mondd(i) {
    const ch = i.options.getChannel("csatorna") || i.channel;
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
    fuggo.set(i.user.id, { csatorna: ch.id, kartya: i.options.getBoolean("kartya") !== false, szin: SZINEK[i.options.getString("szin")] || K.SZIN });
    const modal = new ModalBuilder()
      .setCustomId("mondd")
      .setTitle("💬 Üzenet a bot nevében")
      .addComponents(sor(new TextInputBuilder().setCustomId("szoveg").setLabel("Mit írjak?").setStyle(TextInputStyle.Paragraph).setMaxLength(3500).setRequired(true)));
    return i.showModal(modal);
  },
};

async function monddKuldes(i) {
  const f = fuggo.get(i.user.id);
  fuggo.delete(i.user.id);
  if (!f) return hiba(i, "Ez lejárt, futtasd újra a `/mondd` parancsot.");
  const ch = await csatorna(i.guild, f.csatorna);
  if (!ch) return hiba(i, "Ez a csatorna már nem létezik.");
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const szoveg = i.fields.getTextInputValue("szoveg");
  if (f.kartya) await ch.send(kartya(f.szin).szoveg(szoveg).lab().uzenet());
  else await ch.send({ content: szoveg, allowedMentions: { parse: [] } });
  await naplo(i.guild, embed(K.SZURKE).setTitle("💬 Üzenet a bot nevében").setDescription(`📍 ${ch}\n🛡️ ${i.user}\n\n${szoveg.slice(0, 1500)}`));
  return valasz(i, kartya(K.ZOLD).szoveg(`✅ Elküldve ide: ${ch}`));
}

module.exports = { parancsok, modalok: { mondd: monddKuldes } };
