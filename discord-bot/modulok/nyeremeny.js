const crypto = require("crypto");
const { ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { K, adat, ment, mentKesobb, embed, kartya, sor, gomb, valasz, hiba, rejtett, csatorna, tudIrni, naplo, idoErtelmez, idoSzoveg, uzenetId, unix } = require("../kozos");

function felsorol(lista) {
  if (lista.length <= 1) return lista.join("");
  return lista.slice(0, -1).join(", ") + " és " + lista[lista.length - 1];
}

function sorsol(lista, db, kizart) {
  const jeloltek = lista.filter((id) => !kizart.includes(id));
  for (let n = jeloltek.length - 1; n > 0; n--) {
    const j = crypto.randomInt(n + 1);
    [jeloltek[n], jeloltek[j]] = [jeloltek[j], jeloltek[n]];
  }
  return jeloltek.slice(0, db);
}

function regiGombSor(r) {
  const g = new ButtonBuilder().setCustomId("nyj:be").setStyle(r.lezarva ? ButtonStyle.Secondary : ButtonStyle.Primary);
  if (r.lezarva) g.setLabel(`Véget ért (${r.resztvevok.length})`).setDisabled(true);
  else g.setLabel(`Jelentkezem (${r.resztvevok.length})`);
  return sor(g);
}

function regiEmbed(r) {
  const sorok = [];
  if (r.leiras) sorok.push(r.leiras, "");
  if (!r.lezarva) {
    sorok.push("Nyomj a gombra, ha benne vagy.", "", `**Vége:** <t:${unix(r.vege)}:R>`, `**Nyertesek száma:** ${r.nyertesek}`, `**Indította:** <@${r.inditotta}>`);
    return embed().setTitle(r.nyeremeny).setDescription(sorok.join("\n"));
  }
  sorok.push(`**Véget ért:** <t:${unix(r.vege)}:R>`);
  sorok.push(r.nyertesLista.length ? `**Nyertes:** ${felsorol(r.nyertesLista.map((id) => `<@${id}>`))}` : "Nem volt jelentkező, így nincs nyertes.");
  sorok.push(`**Jelentkezők:** ${r.resztvevok.length}`);
  return embed(K.SZURKE).setTitle(r.nyeremeny).setDescription(sorok.join("\n"));
}

function nyjKartya(r) {
  const k = kartya(r.lezarva ? K.SZURKE : K.ARANY)
    .banner("nyeremeny")
    .szoveg(`## 🎁 ${r.nyeremeny}`, r.leiras || null)
    .elvalaszto();
  if (!r.lezarva) {
    k.szoveg(
      `⏰ **Vége:** <t:${unix(r.vege)}:R> · <t:${unix(r.vege)}:f>`,
      `🏆 **Nyertesek:** ${r.nyertesek}`,
      `👥 **Jelentkezők:** ${r.resztvevok.length}`,
      `🎙️ **Indította:** <@${r.inditotta}>`,
    )
      .sor(gomb("nyj:be", "Jelentkezem", ButtonStyle.Primary, "🎉"))
      .lab("Nyomj a gombra, ha benne vagy! Még egy nyomás, és kiszállsz. • 🧊 IceMine");
  } else {
    k.szoveg(
      `🏁 **Véget ért** <t:${unix(r.vege)}:R>`,
      r.nyertesLista.length ? `🏆 **Nyertes:** ${felsorol(r.nyertesLista.map((id) => `<@${id}>`))}` : "😶 Nem volt jelentkező, így nincs nyertes.",
      `👥 **Jelentkezők:** ${r.resztvevok.length}`,
    )
      .sor(gomb("nyj:be", "Véget ért", ButtonStyle.Secondary, "🏁").setDisabled(true))
      .lab("🧊 IceMine");
  }
  return k;
}

function frissitoAdat(r) {
  if (!r.v2) return { embeds: [regiEmbed(r)], components: [regiGombSor(r)] };
  const { components, flags } = nyjKartya(r).uzenet();
  return { components, flags };
}

function gratulacioKartya(r, nyertesek, uj) {
  const nevek = felsorol(nyertesek.map((id) => `<@${id}>`));
  const ige = nyertesek.length > 1 ? "megnyerték" : "megnyerte";
  return kartya(K.ARANY)
    .szoveg(uj ? "### 🔄 Újrasorsolás" : "### 🎉 Gratulálunk!", `${nevek} ${ige}: **${r.nyeremeny}**! 🏆`, "-# 🎫 Nyiss egy ticketet, és a staff elintézi a nyereményt.")
    .uzenet({ allowedMentions: { users: nyertesek } });
}

async function uzenetEsCsatorna(client, id, r) {
  const g = client.guilds.cache.get(r.gid);
  const ch = g ? await csatorna(g, r.csatorna) : null;
  const msg = ch ? await ch.messages.fetch(id).catch(() => null) : null;
  return { g, ch, msg };
}

async function lezar(client, id) {
  const r = adat.nyeremenyek[id];
  if (!r || r.lezarva) return null;
  r.lezarva = true;
  r.vege = Math.min(r.vege, Date.now());
  r.nyertesLista = sorsol(r.resztvevok, r.nyertesek, []);
  ment();
  const { g, ch, msg } = await uzenetEsCsatorna(client, id, r);
  if (msg) await msg.edit(frissitoAdat(r)).catch(() => {});
  if (ch && tudIrni(ch)) {
    const reply = msg ? { messageReference: msg.id, failIfNotExists: false } : undefined;
    const v = r.nyertesLista.length
      ? gratulacioKartya(r, r.nyertesLista)
      : kartya(K.SZURKE).szoveg(`😶 Senki nem jelentkezett erre: **${r.nyeremeny}**, így nincs nyertes.`).uzenet();
    await ch.send({ ...v, reply }).catch(() => {});
  }
  if (g) {
    await naplo(
      g,
      embed(K.ARANY)
        .setTitle("🎁 Nyereményjáték vége")
        .setDescription(`**Nyeremény:** ${r.nyeremeny}\n**Nyertes:** ${r.nyertesLista.length ? felsorol(r.nyertesLista.map((x) => `<@${x}>`)) : "nincs"}\n**Jelentkezők:** ${r.resztvevok.length}`),
    );
  }
  return r;
}

const parancsok = {
  async nyeremenyjatek(i) {
    const sub = i.options.getSubcommand();

    if (sub === "inditas") {
      const ch = i.options.getChannel("csatorna") || i.channel;
      if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
      const ido = idoErtelmez(i.options.getString("ido"));
      if (!ido || ido < 60000 || ido > 60 * 86400000) return hiba(i, "Az időt így add meg: `30p`, `12ó`, `3n` vagy `1hét`. Legalább 1 perc, legfeljebb 60 nap.");
      const r = {
        v2: true,
        gid: i.guild.id,
        csatorna: ch.id,
        nyeremeny: i.options.getString("nyeremeny"),
        leiras: i.options.getString("leiras") || "",
        nyertesek: i.options.getInteger("nyertesek") || 1,
        vege: Date.now() + ido,
        inditotta: i.user.id,
        resztvevok: [],
        lezarva: false,
        nyertesLista: [],
      };
      const msg = await ch.send(nyjKartya(r).uzenet());
      adat.nyeremenyek[msg.id] = r;
      ment();
      return rejtett(i, kartya(K.ARANY).szoveg(`🎉 Elindult! ${msg.url}`, `-# ${idoSzoveg(ido)} múlva sorsolok.`));
    }

    const id = uzenetId(i.options.getString("uzenet"));
    const r = id ? adat.nyeremenyek[id] : null;
    if (!r || r.gid !== i.guild.id) return hiba(i, "Nem találom ezt a nyereményjátékot. Másold be az üzenet linkjét vagy ID-ját.");

    if (sub === "lezaras") {
      if (r.lezarva) return hiba(i, "Ez már véget ért. Új nyertest a `/nyeremenyjatek ujrasorsolas` paranccsal húzhatsz.");
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await lezar(i.client, id);
      return valasz(i, kartya(K.ZOLD).szoveg("🏁 Lezártam és kisorsoltam."));
    }

    if (!r.lezarva) return hiba(i, "Ez még nem ért véget. Ha most akarod lezárni, használd a `/nyeremenyjatek lezaras` parancsot.");
    const db = i.options.getInteger("db") || 1;
    const ujak = sorsol(r.resztvevok, db, r.nyertesLista);
    if (!ujak.length) return hiba(i, "Nincs több jelentkező, akit ki lehetne húzni.");
    r.nyertesLista.push(...ujak);
    ment();
    const { ch, msg } = await uzenetEsCsatorna(i.client, id, r);
    if (msg) await msg.edit(frissitoAdat(r)).catch(() => {});
    if (ch) await ch.send(gratulacioKartya(r, ujak, true)).catch(() => {});
    return rejtett(i, kartya(K.ZOLD).szoveg("🔄 Kész, kihúztam az új nyertest."));
  },
};

async function jelentkezes(i) {
  const r = adat.nyeremenyek[i.message.id];
  if (!r) return hiba(i, "Ez a nyereményjáték már nem él.");
  if (r.lezarva || r.vege <= Date.now()) return hiba(i, "Ez a nyereményjáték már véget ért.");
  const n = r.resztvevok.indexOf(i.user.id);
  if (n >= 0) r.resztvevok.splice(n, 1);
  else r.resztvevok.push(i.user.id);
  mentKesobb();
  await i.update(r.v2 ? nyjKartya(r).uzenet() : { components: [regiGombSor(r)] });
  return rejtett(i, n >= 0 ? kartya(K.SZURKE).szoveg("👋 Kiszálltál a sorsolásból.") : kartya(K.ARANY).szoveg("🎉 Bent vagy a sorsolásban. Sok szerencsét! 🍀"));
}

function indit(client) {
  const kor = async () => {
    const most = Date.now();
    for (const [id, r] of Object.entries(adat.nyeremenyek)) {
      if (!r.lezarva && r.vege <= most) await lezar(client, id).catch((e) => console.error("Nyereményjáték:", e.message));
      else if (r.lezarva && most - r.vege > 30 * 86400000) {
        delete adat.nyeremenyek[id];
        mentKesobb();
      }
    }
  };
  kor();
  setInterval(kor, 15000);
}

module.exports = { parancsok, komponensek: { "nyj:be": jelentkezes }, indit, lezar };
