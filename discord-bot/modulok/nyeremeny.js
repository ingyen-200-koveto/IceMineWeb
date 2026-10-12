const crypto = require("crypto");
const { ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { K, adat, ment, mentKesobb, embed, sor, rejtett, csatorna, tudIrni, naplo, idoErtelmez, uzenetId, unix } = require("../kozos");

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

function gombSor(r) {
  const g = new ButtonBuilder().setCustomId("nyj:be").setStyle(r.lezarva ? ButtonStyle.Secondary : ButtonStyle.Primary);
  if (r.lezarva) g.setLabel(`Véget ért (${r.resztvevok.length})`).setDisabled(true);
  else g.setLabel(`Jelentkezem (${r.resztvevok.length})`);
  return sor(g);
}

function nyeremenyEmbed(r) {
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

function gratulacio(r, nyertesek, uj) {
  const nevek = felsorol(nyertesek.map((id) => `<@${id}>`));
  if (uj) return `Új sorsolás, a nyertes: ${nevek}! Megnyerted: **${r.nyeremeny}**. Nyiss egy ticketet, és a staff elintézi.`;
  if (nyertesek.length === 1) return `Gratulálunk, ${nevek}! Megnyerted: **${r.nyeremeny}**. Nyiss egy ticketet, és a staff elintézi.`;
  return `Gratulálunk, ${nevek}! Megnyertétek: **${r.nyeremeny}**. Nyissatok ticketet, és a staff elintézi.`;
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
  if (msg) await msg.edit({ embeds: [nyeremenyEmbed(r)], components: [gombSor(r)] }).catch(() => {});
  if (ch && tudIrni(ch)) {
    const szoveg = r.nyertesLista.length ? gratulacio(r, r.nyertesLista) : `Senki nem jelentkezett erre: **${r.nyeremeny}**, így nincs nyertes.`;
    await ch
      .send({ content: szoveg, allowedMentions: { users: r.nyertesLista }, reply: msg ? { messageReference: msg.id, failIfNotExists: false } : undefined })
      .catch(() => {});
  }
  if (g) {
    await naplo(
      g,
      embed(K.SZURKE)
        .setTitle("Nyereményjáték vége")
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
      if (!tudIrni(ch)) return rejtett(i, `Ide nem tudok írni: ${ch}`);
      const ido = idoErtelmez(i.options.getString("ido"));
      if (!ido || ido < 60000 || ido > 60 * 86400000) return rejtett(i, "Az időt így add meg: `30p`, `12ó`, `3n` vagy `1hét`. Legalább 1 perc, legfeljebb 60 nap.");
      const r = {
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
      const msg = await ch.send({ embeds: [nyeremenyEmbed(r)], components: [gombSor(r)] });
      adat.nyeremenyek[msg.id] = r;
      ment();
      return rejtett(i, `Elindult: ${msg.url}`);
    }

    const id = uzenetId(i.options.getString("uzenet"));
    const r = id ? adat.nyeremenyek[id] : null;
    if (!r || r.gid !== i.guild.id) return rejtett(i, "Nem találom ezt a nyereményjátékot. Másold be az üzenet linkjét vagy ID-ját.");

    if (sub === "lezaras") {
      if (r.lezarva) return rejtett(i, "Ez már véget ért. Új nyertest a `/nyeremenyjatek ujrasorsolas` paranccsal húzhatsz.");
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await lezar(i.client, id);
      return i.editReply("Lezártam és kisorsoltam.");
    }

    if (!r.lezarva) return rejtett(i, "Ez még nem ért véget. Ha most akarod lezárni, használd a `/nyeremenyjatek lezaras` parancsot.");
    const db = i.options.getInteger("db") || 1;
    const ujak = sorsol(r.resztvevok, db, r.nyertesLista);
    if (!ujak.length) return rejtett(i, "Nincs több jelentkező, akit ki lehetne húzni.");
    r.nyertesLista.push(...ujak);
    ment();
    const { ch, msg } = await uzenetEsCsatorna(i.client, id, r);
    if (msg) await msg.edit({ embeds: [nyeremenyEmbed(r)], components: [gombSor(r)] }).catch(() => {});
    if (ch) await ch.send({ content: gratulacio(r, ujak, true), allowedMentions: { users: ujak } }).catch(() => {});
    return rejtett(i, "Kész, kihúztam az új nyertest.");
  },
};

async function jelentkezes(i) {
  const r = adat.nyeremenyek[i.message.id];
  if (!r) return rejtett(i, "Ez a nyereményjáték már nem él.");
  if (r.lezarva || r.vege <= Date.now()) return rejtett(i, "Ez a nyereményjáték már véget ért.");
  const n = r.resztvevok.indexOf(i.user.id);
  if (n >= 0) r.resztvevok.splice(n, 1);
  else r.resztvevok.push(i.user.id);
  mentKesobb();
  await i.update({ components: [gombSor(r)] });
  return i.followUp({ content: n >= 0 ? "Kiszálltál a sorsolásból." : "Bent vagy a sorsolásban. Sok szerencsét!", flags: MessageFlags.Ephemeral });
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
