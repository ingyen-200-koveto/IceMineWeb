const { ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { K, adat, ment, mentKesobb, beall, kartya, sor, gomb, valasz, hiba, rejtett, csatorna, dm, uzenetId, vagas, avatar, unix, v2E } = require("../kozos");

const DONTESEK = {
  elfogadva: { nev: "Elfogadva", emoji: "✅", szin: K.ZOLD, vegleges: true },
  kesz: { nev: "Megvalósítva", emoji: "🚀", szin: K.SZIN, vegleges: true },
  megfontoljuk: { nev: "Megfontoljuk", emoji: "🤔", szin: K.SARGA, vegleges: false },
  elutasitva: { nev: "Elutasítva", emoji: "❌", szin: K.PIROS, vegleges: true },
};

const lezartE = (r) => !!(r.allapot && DONTESEK[r.allapot] && DONTESEK[r.allapot].vegleges);

function aranyCsik(igen, nem) {
  const ossz = igen + nem;
  if (!ossz) return "⬜".repeat(10);
  const z = Math.round((igen / ossz) * 10);
  return "🟩".repeat(z) + "🟥".repeat(10 - z);
}

function otletKartya(r) {
  const d = r.allapot ? DONTESEK[r.allapot] : null;
  const k = kartya(d ? d.szin : K.SZIN)
    .kepes(`### 💡 Új ötlet\n${r.szoveg}`, r.kep || K.LOGO)
    .elvalaszto()
    .szoveg(`${aranyCsik(r.igen.length, r.nem.length)}`, `👍 **${r.igen.length}** támogató  ·  👎 **${r.nem.length}** nem tetszik`);
  if (d) {
    k.elvalaszto().szoveg(`${d.emoji} **Staff válasza: ${d.nev}**`, r.megjegyzes ? `> ${r.megjegyzes}` : null, r.donto ? `-# ${r.donto}` : null);
  }
  const zar = lezartE(r);
  return k
    .sor(
      gomb("otlet:igen", `Támogatom (${r.igen.length})`, ButtonStyle.Success, "👍").setDisabled(zar),
      gomb("otlet:nem", `Nem tetszik (${r.nem.length})`, ButtonStyle.Secondary, "👎").setDisabled(zar),
    )
    .lab(`💡 ${r.szerzoNev || "ismeretlen"} ötlete • <t:${unix(r.ido || Date.now())}:d>`);
}

function regiGombok(r) {
  const zar = lezartE(r);
  return sor(
    new ButtonBuilder().setCustomId("otlet:igen").setLabel(`Támogatom (${r.igen.length})`).setStyle(ButtonStyle.Success).setDisabled(zar),
    new ButtonBuilder().setCustomId("otlet:nem").setLabel(`Nem tetszik (${r.nem.length})`).setStyle(ButtonStyle.Secondary).setDisabled(zar),
  );
}

const parancsok = {
  async otlet(i) {
    const ch = await csatorna(i.guild, beall(i.guild.id).otletek);
    if (!ch) return hiba(i, "Az ötletek csatornája még nincs beállítva, szólj egy adminnak.");
    const r = {
      v2: true,
      szerzo: i.user.id,
      szerzoNev: i.user.username,
      kep: avatar(i.user),
      szoveg: i.options.getString("otlet"),
      igen: [],
      nem: [],
      allapot: null,
      ido: Date.now(),
    };
    const m = await ch.send(otletKartya(r).uzenet());
    adat.otletek[m.id] = r;
    ment();
    return rejtett(i, kartya(K.ZOLD).szoveg(`💡 Köszi, kint van az ötleted: ${ch}`));
  },

  async "otlet-valasz"(i) {
    const id = uzenetId(i.options.getString("uzenet"));
    if (!id) return hiba(i, "Másold be az ötlet üzenetének linkjét vagy ID-ját.");
    const ch = await csatorna(i.guild, beall(i.guild.id).otletek);
    const msg = ch ? await ch.messages.fetch(id).catch(() => null) : null;
    if (!msg || msg.author.id !== i.client.user.id) return hiba(i, "Nem találom ezt az ötletet az ötletek csatornájában.");
    const kulcs = i.options.getString("dontes");
    const dontes = DONTESEK[kulcs];
    const megjegyzes = i.options.getString("megjegyzes");
    const r = adat.otletek[msg.id];
    if (r && r.v2) {
      r.allapot = kulcs;
      r.megjegyzes = megjegyzes || null;
      r.donto = i.user.username;
      ment();
      const { components, flags } = otletKartya(r).uzenet();
      await msg.edit({ components, flags });
    } else {
      if (!msg.embeds.length) return hiba(i, "Ezt az ötletet nem tudom szerkeszteni.");
      const e = EmbedBuilder.from(msg.embeds[0]).setColor(dontes.szin);
      const mezok = (msg.embeds[0].fields || []).filter((f) => f.name !== "Staff válasza");
      e.setFields(...mezok, { name: "Staff válasza", value: vagas(`${dontes.emoji} **${dontes.nev}**${megjegyzes ? ` – ${megjegyzes}` : ""} (${i.user.username})`, 1024) });
      if (r) {
        r.allapot = kulcs;
        ment();
      }
      await msg.edit({ embeds: [e], components: r ? [regiGombok(r)] : msg.components });
    }
    if (r && r.szerzo) {
      const user = await i.client.users.fetch(r.szerzo).catch(() => null);
      await dm(user, `### 💡 Válasz jött az ötletedre\n${dontes.emoji} **${dontes.nev}**${megjegyzes ? `\n> ${megjegyzes}` : ""}\n${msg.url}`, dontes.szin);
    }
    return rejtett(i, kartya(dontes.szin).szoveg(`${dontes.emoji} Kész, az ötlet állapota: **${dontes.nev}**.`));
  },
};

async function szavazat(i) {
  const r = adat.otletek[i.message.id];
  if (!r) return hiba(i, "Erre az ötletre már nem lehet szavazni.");
  if (lezartE(r)) return hiba(i, "Erről az ötletről már döntött a staff.");
  const igen = i.customId === "otlet:igen";
  const ide = igen ? r.igen : r.nem;
  const masik = igen ? r.nem : r.igen;
  const volt = ide.indexOf(i.user.id);
  let szoveg;
  if (volt >= 0) {
    ide.splice(volt, 1);
    szoveg = "↩️ Visszavontad a szavazatod.";
  } else {
    const m = masik.indexOf(i.user.id);
    if (m >= 0) masik.splice(m, 1);
    ide.push(i.user.id);
    szoveg = igen ? "👍 Támogatod ezt az ötletet." : "👎 Rögzítettem, hogy nem tetszik.";
  }
  mentKesobb();
  if (r.v2 && v2E(i.message)) await i.update(otletKartya(r).uzenet());
  else await i.update({ components: [regiGombok(r)] });
  return rejtett(i, kartya().szoveg(szoveg));
}

module.exports = { parancsok, komponensek: { "otlet:igen": szavazat, "otlet:nem": szavazat }, DONTESEK };
