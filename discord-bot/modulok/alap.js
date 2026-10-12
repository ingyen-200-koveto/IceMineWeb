const path = require("path");
const { ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags } = require("discord.js");
const { K, embed, sor, linkGomb, rejtett, csatorna, tudIrni, naplo, staffE, adat, unix, vagas } = require("../kozos");
const szintek = require("./szintek");

const fuggoBejelentesek = new Map();

const parancsok = {
  async weboldal(i) {
    const e = embed()
      .setTitle("IceMine weboldal")
      .setDescription("Itt tudsz regisztrálni, és itt látod az IceCoin egyenleged, a rangokat meg a WebShopot is.");
    return i.reply({ embeds: [e], components: [sor(linkGomb("Weboldal", K.WEB))] });
  },

  async linkek(i) {
    const e = embed()
      .setTitle("Elérhetőségek")
      .setDescription(
        [
          `**Weboldal:** ${K.WEB}`,
          `**Discord:** ${K.DISCORD_LINK}`,
          `**YouTube:** ${K.YOUTUBE}`,
          `**Instagram:** ${K.INSTAGRAM}`,
          `**E-mail:** ${K.EMAIL}`,
        ].join("\n"),
      );
    return i.reply({
      embeds: [e],
      components: [sor(linkGomb("Weboldal", K.WEB), linkGomb("Discord", K.DISCORD_LINK), linkGomb("YouTube", K.YOUTUBE), linkGomb("Instagram", K.INSTAGRAM))],
    });
  },

  async szabalyzat(i) {
    const e = embed()
      .setTitle("Szabályzat")
      .setDescription("A szabályzat a szerverre, a weboldalra és erre a Discordra is vonatkozik. A weboldalon, a Dokumentumok fül alatt találod.");
    return i.reply({ embeds: [e], components: [sor(linkGomb("Szabályzat megnyitása", K.WEB))] });
  },

  async segitseg(i) {
    const e = embed()
      .setTitle("Parancsok")
      .addFields(
        {
          name: "Mindenkinek",
          value: [
            "`/ip` – szervercím",
            "`/statusz` – fent van-e a szerver",
            "`/szint`, `/toplista` – szintek",
            "`/otlet` – ötlet beküldése",
            "`/info` – adatok egy tagról",
            "`/weboldal`, `/linkek`, `/szabalyzat`",
          ].join("\n"),
        },
        {
          name: "Staff",
          value: [
            "`/bejelentes`, `/szavazas`, `/torles`",
            "`/nemitas`, `/figyelmeztetes`, `/kirugas`, `/kitiltas`",
            "`/ticket hozzaad`, `/ticket eltavolit`",
            "`/otlet-valasz`",
          ].join("\n"),
        },
        {
          name: "Admin",
          value: ["`/beallitas` – minden beállítás itt van", "`/ticket-panel`, `/statusz-panel`", "`/nyeremenyjatek`, `/rangvalaszto`"].join("\n"),
        },
      );
    return rejtett(i, { embeds: [e] });
  },

  async info(i) {
    const cel = i.options.getMember("tag") || i.member;
    if (!cel || !cel.user) return rejtett(i, "Ő nincs fent a szerveren.");
    const u = cel.user;
    const sorok = [`**Fiók létrehozva:** <t:${unix(u.createdTimestamp)}:D> (<t:${unix(u.createdTimestamp)}:R>)`];
    if (cel.joinedTimestamp) sorok.push(`**Csatlakozott:** <t:${unix(cel.joinedTimestamp)}:D> (<t:${unix(cel.joinedTimestamp)}:R>)`);
    const sz = szintek.adatai(i.guild.id, u.id);
    sorok.push(`**Szint:** ${sz.szint} (${sz.xp} XP)`);
    if (staffE(i.member, i.guild.id)) {
      const f = ((adat.figyelmeztetesek[i.guild.id] || {})[u.id] || []).length;
      sorok.push(`**Figyelmeztetések:** ${f}`);
    }
    const rangok = [...cel.roles.cache.values()]
      .filter((r) => r && r.id && r.id !== i.guild.id)
      .sort((a, b) => b.position - a.position)
      .slice(0, 15)
      .map((r) => `<@&${r.id}>`);
    if (rangok.length) sorok.push(`**Rangok:** ${rangok.join(" ")}`);
    const e = embed()
      .setAuthor({ name: u.username, iconURL: u.displayAvatarURL() })
      .setThumbnail(u.displayAvatarURL({ size: 256 }))
      .setDescription(sorok.join("\n"));
    return rejtett(i, { embeds: [e] });
  },

  async bejelentes(i) {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return rejtett(i, `Ide nem tudok írni: ${ch}`);
    const kep = i.options.getAttachment("kep");
    const rang = i.options.getRole("rang");
    fuggoBejelentesek.set(i.user.id, {
      csatorna: ch.id,
      everyone: !!i.options.getBoolean("everyone"),
      rang: rang ? rang.id : null,
      kep: kep && kep.contentType && kep.contentType.startsWith("image/") ? { url: kep.url, nev: kep.name } : null,
    });
    const modal = new ModalBuilder()
      .setCustomId("bejelentes")
      .setTitle("Bejelentés")
      .addComponents(
        sor(new TextInputBuilder().setCustomId("cim").setLabel("Cím").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)),
        sor(new TextInputBuilder().setCustomId("szoveg").setLabel("Szöveg").setStyle(TextInputStyle.Paragraph).setMaxLength(3500).setRequired(true)),
      );
    return i.showModal(modal);
  },

  async szavazas(i) {
    if (!tudIrni(i.channel)) return rejtett(i, "Ebbe a csatornába nem tudok írni.");
    const kerdes = i.options.getString("kerdes");
    const valaszok = [1, 2, 3, 4, 5].map((n) => i.options.getString("valasz" + n)).filter(Boolean);
    if (valaszok.length === 1) return rejtett(i, "Legalább két válasz kell. Ha mindet üresen hagyod, Igen/Nem szavazás lesz.");
    const lista = valaszok.length ? valaszok : ["Igen", "Nem"];
    const ora = i.options.getInteger("ora") || 24;
    const tobb = !!i.options.getBoolean("tobb");
    try {
      await i.channel.send({
        poll: { question: { text: kerdes }, answers: lista.map((text) => ({ text })), duration: ora, allowMultiselect: tobb },
      });
    } catch {
      const jelek = valaszok.length ? ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"] : ["✅", "❌"];
      const e = embed()
        .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() })
        .setTitle(vagas(kerdes, 250))
        .setDescription(lista.map((t, n) => `${jelek[n]} ${t}`).join("\n"));
      const m = await i.channel.send({ embeds: [e] });
      for (const j of jelek.slice(0, lista.length)) await m.react(j).catch(() => {});
    }
    return rejtett(i, "Kint van a szavazás.");
  },

  async torles(i) {
    const n = i.options.getInteger("mennyiseg");
    const tag = i.options.getUser("tag");
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    let torolt;
    if (tag) {
      const uzenetek = await i.channel.messages.fetch({ limit: 100 });
      const sajat = [...uzenetek.values()].filter((m) => m.author && m.author.id === tag.id).slice(0, n);
      torolt = sajat.length ? await i.channel.bulkDelete(sajat, true) : { size: 0 };
    } else {
      torolt = await i.channel.bulkDelete(n, true);
    }
    const megj = !tag && torolt.size < n ? " A 14 napnál régebbi üzeneteket a Discord nem engedi egyszerre törölni." : "";
    await i.editReply(`${torolt.size} üzenetet töröltem.${megj}`);
    return naplo(
      i.guild,
      embed()
        .setTitle("Üzenetek törölve")
        .setDescription(`**Csatorna:** ${i.channel}\n**Darab:** ${torolt.size}${tag ? `\n**Csak tőle:** ${tag}` : ""}\n**Ki törölte:** ${i.user}`),
    );
  },
};

async function bejelentesKuldes(i) {
  const f = fuggoBejelentesek.get(i.user.id);
  fuggoBejelentesek.delete(i.user.id);
  if (!f) return rejtett(i, "Ez lejárt, futtasd újra a `/bejelentes` parancsot.");
  const ch = await csatorna(i.guild, f.csatorna);
  if (!ch) return rejtett(i, "Ez a csatorna már nem létezik.");
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const e = embed().setTitle(i.fields.getTextInputValue("cim")).setDescription(i.fields.getTextInputValue("szoveg"));
  const files = [];
  if (f.kep) {
    const r = await fetch(f.kep.url).catch(() => null);
    if (r && r.ok) {
      const nev = "kep" + (path.extname(f.kep.nev) || ".png").toLowerCase();
      files.push(new AttachmentBuilder(Buffer.from(await r.arrayBuffer()), { name: nev }));
      e.setImage("attachment://" + nev);
    }
  }
  const pingek = [];
  if (f.everyone) pingek.push("@everyone");
  if (f.rang) pingek.push(`<@&${f.rang}>`);
  await ch.send({
    content: pingek.length ? pingek.join(" ") : undefined,
    embeds: [e],
    files,
    allowedMentions: { parse: f.everyone ? ["everyone"] : [], roles: f.rang ? [f.rang] : [] },
  });
  return i.editReply(`Kiment ide: ${ch}`);
}

module.exports = { parancsok, modalok: { bejelentes: bejelentesKuldes } };
