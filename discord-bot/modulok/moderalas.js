const { K, adat, ment, embed, kartya, valasz, hiba, rejtett, naplo, dm, idoErtelmez, idoSzoveg, unix, avatar } = require("../kozos");

const BOT_RANG_TIPP = "Húzd feljebb a bot rangját a Szerverbeállítások > Rangok listában, mint az övé.";
const MAX_NEMITAS = 28 * 86400000;

function rangEllenor(i, cel) {
  if (!cel) return "Ő nincs fent a szerveren.";
  if (cel.id === i.user.id) return "Magadon ezt nem tudod használni.";
  if (cel.id === i.client.user.id) return "Rajtam ezt nem tudod használni. 🧊";
  if (cel.id === i.guild.ownerId) return "A tulajdonoson ezt nem lehet.";
  if (i.user.id !== i.guild.ownerId && cel.roles.highest.position >= i.member.roles.highest.position) {
    return "Csak nálad alacsonyabb rangú tagon használhatod.";
  }
  return null;
}

function naploEmbed(cim, szin, cel, moderator, ok, extra) {
  const sorok = [`👤 **Tag:** ${cel} (${cel.username})`, `🛡️ **Moderátor:** ${moderator}`];
  if (extra) sorok.push(extra);
  sorok.push(`📝 **Indok:** ${ok}`);
  return embed(szin).setTitle(cim).setDescription(sorok.join("\n"));
}

function modKartya(cim, szin, user, moderator, sorok) {
  return kartya(szin)
    .kepes([`### ${cim}`, ...sorok].join("\n"), avatar(user))
    .lab(`🛡️ ${moderator.username} • 🧊 IceMine`);
}

const parancsok = {
  async kirugas(i) {
    const cel = i.options.getMember("tag");
    const ok = i.options.getString("ok") || "nincs megadva";
    const h = rangEllenor(i, cel);
    if (h) return hiba(i, h);
    if (!cel.kickable) return hiba(i, "Őt nem tudom kirúgni. " + BOT_RANG_TIPP);
    await dm(cel.user, `### 👢 Ki lettél rúgva\nAz IceMine Discordjáról.\n📝 **Indok:** ${ok}`, K.SARGA);
    await cel.kick(`${ok} | ${i.user.username}`);
    await valasz(i, modKartya("👢 Kirúgás", K.SARGA, cel.user, i.user, [`**${cel.user.username}** ki lett rúgva.`, `📝 **Indok:** ${ok}`]));
    return naplo(i.guild, naploEmbed("👢 Kirúgás", K.SARGA, cel.user, i.user, ok));
  },

  async kitiltas(i) {
    const user = i.options.getUser("tag");
    const cel = i.options.getMember("tag");
    const ok = i.options.getString("ok") || "nincs megadva";
    const napok = i.options.getInteger("uzenetek_torlese") || 0;
    const idoSz = i.options.getString("ido");
    let ido = null;
    if (idoSz) {
      ido = idoErtelmez(idoSz);
      if (!ido || ido < 60000) return hiba(i, "Ezt az időt nem értem. Példák: `30p`, `12ó`, `7n`, `2hét`.");
    }
    if (cel) {
      const h = rangEllenor(i, cel);
      if (h) return hiba(i, h);
      if (!cel.bannable) return hiba(i, "Őt nem tudom kitiltani. " + BOT_RANG_TIPP);
      await dm(user, `### 🔨 Ki lettél tiltva\nAz IceMine Discordjáról${ido ? ` ${idoSzoveg(ido, true)}` : ""}.\n📝 **Indok:** ${ok}`, K.PIROS);
    } else if (user.id === i.user.id || user.id === i.client.user.id) {
      return hiba(i, "Ezt nem lehet.");
    }
    await i.guild.bans.create(user.id, { reason: `${ok} | ${i.user.username}`, deleteMessageSeconds: napok * 86400 });
    adat.ideiglenesBanok = adat.ideiglenesBanok.filter((b) => !(b.gid === i.guild.id && b.uid === user.id));
    if (ido) adat.ideiglenesBanok.push({ gid: i.guild.id, uid: user.id, lejar: Date.now() + ido, nev: user.username });
    ment();
    const sorok = [`**${user.username}** ki lett tiltva${ido ? ` ${idoSzoveg(ido, true)}` : ", véglegesen"}.`, `📝 **Indok:** ${ok}`];
    if (ido) sorok.push(`⏰ **Lejár:** <t:${unix(Date.now() + ido)}:R>`);
    await valasz(i, modKartya("🔨 Kitiltás", K.PIROS, user, i.user, sorok));
    return naplo(
      i.guild,
      naploEmbed("🔨 Kitiltás", K.PIROS, user, i.user, ok, ido ? `⏰ **Lejár:** <t:${unix(Date.now() + ido)}:f>` : "⏰ **Időtartam:** végleges"),
    );
  },

  async "kitiltas-feloldas"(i) {
    const id = String(i.options.getString("felhasznalo_id")).replace(/\D/g, "");
    if (!/^\d{17,20}$/.test(id)) return hiba(i, "Ez nem felhasználó ID. Az ID egy 17–20 jegyű szám.");
    const sikerult = await i.guild.bans
      .remove(id, `Feloldotta: ${i.user.username}`)
      .then(() => true)
      .catch(() => false);
    if (!sikerult) return hiba(i, "Nincs ilyen kitiltott felhasználó.");
    adat.ideiglenesBanok = adat.ideiglenesBanok.filter((b) => !(b.gid === i.guild.id && b.uid === id));
    ment();
    await valasz(i, kartya(K.ZOLD).szoveg("### ✅ Kitiltás feloldva", `<@${id}> újra beléphet.`).lab(`🛡️ ${i.user.username} • 🧊 IceMine`));
    return naplo(i.guild, embed(K.ZOLD).setTitle("✅ Kitiltás feloldva").setDescription(`👤 **Felhasználó:** <@${id}> (${id})\n🛡️ **Moderátor:** ${i.user}`));
  },

  async nemitas(i) {
    const cel = i.options.getMember("tag");
    const ok = i.options.getString("ok") || "nincs megadva";
    const ido = idoErtelmez(i.options.getString("ido"));
    if (ido === null) return hiba(i, "Ezt az időt nem értem. Példák: `10p`, `2ó`, `1n`. Feloldáshoz írj `0`-t.");
    const h = rangEllenor(i, cel);
    if (h) return hiba(i, h);
    if (!cel.moderatable) return hiba(i, "Őt nem tudom lenémítani. " + BOT_RANG_TIPP);
    if (ido === 0) {
      await cel.timeout(null, `${ok} | ${i.user.username}`);
      await valasz(i, modKartya("🔊 Némítás feloldva", K.ZOLD, cel.user, i.user, [`**${cel.user.username}** újra írhat.`]));
      return naplo(i.guild, naploEmbed("🔊 Némítás feloldva", K.ZOLD, cel.user, i.user, ok));
    }
    const valodi = Math.min(ido, MAX_NEMITAS);
    const lejar = Date.now() + valodi;
    await cel.timeout(valodi, `${ok} | ${i.user.username}`);
    await dm(cel.user, `### 🔇 Le lettél némítva\nAz IceMine Discordján ${idoSzoveg(valodi, true)}.\n📝 **Indok:** ${ok}\n⏰ **Lejár:** <t:${unix(lejar)}:R>`, K.SARGA);
    const sorok = [`**${cel.user.username}** le lett némítva ${idoSzoveg(valodi, true)}.`, `📝 **Indok:** ${ok}`, `⏰ **Lejár:** <t:${unix(lejar)}:R>`];
    if (ido > MAX_NEMITAS) sorok.push("-# A Discord legfeljebb 28 napot enged.");
    await valasz(i, modKartya("🔇 Némítás", K.SARGA, cel.user, i.user, sorok));
    return naplo(i.guild, naploEmbed("🔇 Némítás", K.SARGA, cel.user, i.user, ok, `⏰ **Lejár:** <t:${unix(lejar)}:f>`));
  },

  async figyelmeztetes(i) {
    const sub = i.options.getSubcommand();
    const user = i.options.getUser("tag");
    const tar = (adat.figyelmeztetesek[i.guild.id] ||= {});
    const lista = tar[user.id] || [];

    if (sub === "adas") {
      const cel = i.options.getMember("tag");
      const h = rangEllenor(i, cel);
      if (h) return hiba(i, h);
      const ok = i.options.getString("ok");
      lista.push({ ok, ki: i.user.id, ido: Date.now() });
      tar[user.id] = lista;
      ment();
      await dm(user, `### ⚠️ Figyelmeztetést kaptál\nAz IceMine Discordján.\n📝 **Indok:** ${ok}\n📊 Eddig összesen ${lista.length} figyelmeztetésed van.`, K.SARGA);
      await valasz(i, modKartya("⚠️ Figyelmeztetés", K.SARGA, user, i.user, [`**${user.username}** figyelmeztetést kapott.`, `📝 **Indok:** ${ok}`, `📊 **Összesen:** ${lista.length}`]));
      return naplo(i.guild, naploEmbed("⚠️ Figyelmeztetés", K.SARGA, user, i.user, ok, `📊 **Összesen:** ${lista.length}`));
    }

    if (sub === "lista") {
      if (!lista.length) return rejtett(i, kartya(K.ZOLD).szoveg(`✨ ${user.username} még nem kapott figyelmeztetést.`));
      const kezdo = Math.max(0, lista.length - 15);
      const sorok = lista.slice(kezdo).map((f, n) => `**${kezdo + n + 1}.** <t:${unix(f.ido)}:d> · ${f.ok} · <@${f.ki}>`);
      return rejtett(i, kartya(K.SARGA).kepes(`### ⚠️ ${user.username} figyelmeztetései (${lista.length})\n` + sorok.join("\n"), avatar(user)).lab());
    }

    if (sub === "visszavonas") {
      const n = i.options.getInteger("sorszam");
      if (n < 1 || n > lista.length) return hiba(i, `Nincs ${n}. figyelmeztetése. A listát a \`/figyelmeztetes lista\` mutatja.`);
      const [torolt] = lista.splice(n - 1, 1);
      if (lista.length) tar[user.id] = lista;
      else delete tar[user.id];
      ment();
      await valasz(i, kartya(K.ZOLD).szoveg(`### ↩️ Visszavonva`, `${user.username} ${n}. figyelmeztetése törölve („${torolt.ok}”).`).lab(`🛡️ ${i.user.username} • 🧊 IceMine`));
      return naplo(i.guild, naploEmbed("↩️ Figyelmeztetés visszavonva", K.ZOLD, user, i.user, torolt.ok));
    }

    delete tar[user.id];
    ment();
    await valasz(i, kartya(K.ZOLD).szoveg(`### 🧽 Tiszta lap`, `${user.username} összes figyelmeztetése törölve.`).lab(`🛡️ ${i.user.username} • 🧊 IceMine`));
    return naplo(i.guild, embed(K.ZOLD).setTitle("🧽 Figyelmeztetések törölve").setDescription(`👤 **Tag:** ${user}\n🛡️ **Moderátor:** ${i.user}`));
  },
};

function indit(client) {
  const kor = async () => {
    const most = Date.now();
    const lejart = adat.ideiglenesBanok.filter((b) => b.lejar <= most);
    if (!lejart.length) return;
    adat.ideiglenesBanok = adat.ideiglenesBanok.filter((b) => b.lejar > most);
    ment();
    for (const b of lejart) {
      const g = client.guilds.cache.get(b.gid);
      if (!g) continue;
      const ok = await g.bans
        .remove(b.uid, "Lejárt az ideiglenes kitiltás")
        .then(() => true)
        .catch(() => false);
      if (ok) await naplo(g, embed(K.ZOLD).setTitle("⏰ Lejárt egy kitiltás").setDescription(`<@${b.uid}> (${b.nev || b.uid}) újra beléphet.`));
    }
  };
  kor();
  setInterval(kor, 30000);
}

module.exports = { parancsok, indit, rangEllenor };
