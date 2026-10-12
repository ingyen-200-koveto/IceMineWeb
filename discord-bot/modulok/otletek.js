const { ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require("discord.js");
const { K, adat, ment, mentKesobb, beall, embed, sor, rejtett, csatorna, dm, uzenetId, vagas } = require("../kozos");

const DONTESEK = {
  elfogadva: { nev: "Elfogadva", szin: K.ZOLD, vegleges: true },
  kesz: { nev: "Megvalósítva", szin: K.SZIN, vegleges: true },
  megfontoljuk: { nev: "Megfontoljuk", szin: K.SARGA, vegleges: false },
  elutasitva: { nev: "Elutasítva", szin: K.PIROS, vegleges: true },
};

function gombok(r) {
  const lezart = !!(r.allapot && DONTESEK[r.allapot] && DONTESEK[r.allapot].vegleges);
  return sor(
    new ButtonBuilder().setCustomId("otlet:igen").setLabel(`Támogatom (${r.igen.length})`).setStyle(ButtonStyle.Success).setDisabled(lezart),
    new ButtonBuilder().setCustomId("otlet:nem").setLabel(`Nem tetszik (${r.nem.length})`).setStyle(ButtonStyle.Secondary).setDisabled(lezart),
  );
}

const parancsok = {
  async otlet(i) {
    const ch = await csatorna(i.guild, beall(i.guild.id).otletek);
    if (!ch) return rejtett(i, "Az ötletek csatornája még nincs beállítva, szólj egy adminnak.");
    const r = { szerzo: i.user.id, igen: [], nem: [], allapot: null, ido: Date.now() };
    const e = embed()
      .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() })
      .setDescription(i.options.getString("otlet"));
    const m = await ch.send({ embeds: [e], components: [gombok(r)] });
    adat.otletek[m.id] = r;
    ment();
    return rejtett(i, `Köszi, kint van az ötleted: ${ch}`);
  },

  async "otlet-valasz"(i) {
    const id = uzenetId(i.options.getString("uzenet"));
    if (!id) return rejtett(i, "Másold be az ötlet üzenetének linkjét vagy ID-ját.");
    const ch = await csatorna(i.guild, beall(i.guild.id).otletek);
    const msg = ch ? await ch.messages.fetch(id).catch(() => null) : null;
    if (!msg || !msg.embeds.length || msg.author.id !== i.client.user.id) return rejtett(i, "Nem találom ezt az ötletet az ötletek csatornájában.");
    const dontes = DONTESEK[i.options.getString("dontes")];
    const megjegyzes = i.options.getString("megjegyzes");
    const e = EmbedBuilder.from(msg.embeds[0]).setColor(dontes.szin);
    const mezok = (msg.embeds[0].fields || []).filter((f) => f.name !== "Staff válasza");
    e.setFields(...mezok, { name: "Staff válasza", value: vagas(`**${dontes.nev}**${megjegyzes ? ` – ${megjegyzes}` : ""} (${i.user.username})`, 1024) });
    const r = adat.otletek[msg.id];
    if (r) {
      r.allapot = i.options.getString("dontes");
      ment();
    }
    await msg.edit({ embeds: [e], components: r ? [gombok(r)] : msg.components });
    const szerzoId = r ? r.szerzo : null;
    if (szerzoId) {
      const user = await i.client.users.fetch(szerzoId).catch(() => null);
      await dm(user, `Válasz jött az ötletedre: **${dontes.nev}**${megjegyzes ? `\n${megjegyzes}` : ""}\n${msg.url}`);
    }
    return rejtett(i, `Kész, az ötlet állapota: ${dontes.nev}.`);
  },
};

async function szavazat(i) {
  const r = adat.otletek[i.message.id];
  if (!r) return rejtett(i, "Erre az ötletre már nem lehet szavazni.");
  if (r.allapot && DONTESEK[r.allapot] && DONTESEK[r.allapot].vegleges) return rejtett(i, "Erről az ötletről már döntött a staff.");
  const igen = i.customId === "otlet:igen";
  const ide = igen ? r.igen : r.nem;
  const masik = igen ? r.nem : r.igen;
  const volt = ide.indexOf(i.user.id);
  let szoveg;
  if (volt >= 0) {
    ide.splice(volt, 1);
    szoveg = "Visszavontad a szavazatod.";
  } else {
    const m = masik.indexOf(i.user.id);
    if (m >= 0) masik.splice(m, 1);
    ide.push(i.user.id);
    szoveg = igen ? "Támogatod ezt az ötletet." : "Nem tetszik ez az ötlet, rögzítettem.";
  }
  mentKesobb();
  await i.update({ components: [gombok(r)] });
  return i.followUp({ content: szoveg, flags: MessageFlags.Ephemeral });
}

module.exports = { parancsok, komponensek: { "otlet:igen": szavazat, "otlet:nem": szavazat }, DONTESEK };
