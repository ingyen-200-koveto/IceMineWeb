const { ButtonBuilder, ButtonStyle } = require("discord.js");
const { embed, sor, rejtett, tudIrni, vagas } = require("../kozos");

const parancsok = {
  async rangvalaszto(i) {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return rejtett(i, `Ide nem tudok írni: ${ch}`);
    const me = i.guild.members.me;
    const rangok = [];
    for (let n = 1; n <= 10; n++) {
      const r = i.options.getRole("rang" + n);
      if (r && !rangok.some((x) => x.id === r.id)) rangok.push(r);
    }
    for (const r of rangok) {
      if (r.managed || r.id === i.guild.id) return rejtett(i, `Ezt a rangot nem lehet kiosztani: ${r}`);
      if (r.position >= me.roles.highest.position) {
        return rejtett(i, `Ez a rang feljebb van, mint a bot rangja: ${r}. Húzd a bot rangját fölé a Rangok listában.`);
      }
    }
    const leiras =
      i.options.getString("leiras") || "Nyomj a gombra, és megkapod a rangot. Ha még egyszer rányomsz, leveszem.";
    const e = embed()
      .setTitle(i.options.getString("cim"))
      .setDescription(leiras + "\n\n" + rangok.map((r) => `<@&${r.id}>`).join("\n"));
    const gombok = rangok.map((r) => new ButtonBuilder().setCustomId(`rang:${r.id}`).setLabel(vagas(r.name, 80)).setStyle(ButtonStyle.Secondary));
    const sorok = [];
    for (let n = 0; n < gombok.length; n += 5) sorok.push(sor(...gombok.slice(n, n + 5)));
    await ch.send({ embeds: [e], components: sorok, allowedMentions: { parse: [] } });
    return rejtett(i, `Kint van: ${ch}`);
  },
};

async function valtas(i) {
  const id = i.customId.slice(5);
  const rang = i.guild.roles.cache.get(id);
  if (!rang) return rejtett(i, "Ez a rang már nem létezik, szólj egy adminnak.");
  if (rang.position >= i.guild.members.me.roles.highest.position) return rejtett(i, "Ezt a rangot most nem tudom kiosztani, szólj egy adminnak.");
  if (i.member.roles.cache.has(id)) {
    await i.member.roles.remove(id, "Rangválasztó");
    return rejtett(i, `Levettem rólad: ${rang}`);
  }
  await i.member.roles.add(id, "Rangválasztó");
  return rejtett(i, `Megkaptad: ${rang}`);
}

module.exports = { parancsok, elotagok: { "rang:": valtas } };
