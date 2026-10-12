const { ButtonStyle } = require("discord.js");
const { K, kartya, gomb, hiba, rejtett, tudIrni, vagas } = require("../kozos");

const parancsok = {
  async rangvalaszto(i) {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
    const me = i.guild.members.me;
    const rangok = [];
    for (let n = 1; n <= 10; n++) {
      const r = i.options.getRole("rang" + n);
      if (r && !rangok.some((x) => x.id === r.id)) rangok.push(r);
    }
    for (const r of rangok) {
      if (r.managed || r.id === i.guild.id) return hiba(i, `Ezt a rangot nem lehet kiosztani: ${r}`);
      if (r.position >= me.roles.highest.position) {
        return hiba(i, `Ez a rang feljebb van, mint a bot rangja: ${r}. Húzd a bot rangját fölé a Rangok listában.`);
      }
    }
    const k = kartya()
      .banner("rangok")
      .szoveg(`### 🎭 ${i.options.getString("cim")}`, i.options.getString("leiras") || "Nyomj a gombra, és megkapod a rangot. Ha még egyszer rányomsz, leveszem.")
      .elvalaszto();
    for (const r of rangok) k.gombos(`**${vagas(r.name, 90)}**\n-# <@&${r.id}>`, gomb(`rang:${r.id}`, "Kérem", ButtonStyle.Secondary, "➕"));
    k.elvalaszto().lab("🎭 Bármikor ki- és bekapcsolhatod • 🧊 IceMine");
    await ch.send(k.uzenet());
    return rejtett(i, kartya(K.ZOLD).szoveg(`✅ Kint van: ${ch}`));
  },
};

async function valtas(i) {
  const id = i.customId.slice(5);
  const rang = i.guild.roles.cache.get(id);
  if (!rang) return hiba(i, "Ez a rang már nem létezik, szólj egy adminnak.");
  if (rang.position >= i.guild.members.me.roles.highest.position) return hiba(i, "Ezt a rangot most nem tudom kiosztani, szólj egy adminnak.");
  if (i.member.roles.cache.has(id)) {
    await i.member.roles.remove(id, "Rangválasztó");
    return rejtett(i, kartya(K.SZURKE).szoveg(`➖ Levettem rólad: ${rang}`));
  }
  await i.member.roles.add(id, "Rangválasztó");
  return rejtett(i, kartya(K.ZOLD).szoveg(`➕ Megkaptad: ${rang}`));
}

module.exports = { parancsok, elotagok: { "rang:": valtas } };
