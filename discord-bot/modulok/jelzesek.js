const { ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits: P } = require("discord.js");
const { K, beall, kartya, gomb, sor, csatorna, tudIrni, naploCsatorna, unix, hiba, siker, staffE } = require("../kozos");

const BELSO = (process.env.BELSO_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
const mcFej = (nev) => `https://mc-heads.net/avatar/${encodeURIComponent(String(nev || "MHF_Steve").replace(/^\./, ""))}/128`;

async function belso(ut, body) {
  try {
    const r = await fetch(BELSO + ut, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    return { ...d, ok: r.ok, status: r.status };
  } catch (e) {
    return null;
  }
}

async function kuldes(g, csatornaId, tartalek, uzenet) {
  const ch = (await csatorna(g, csatornaId)) || (tartalek ? await csatorna(g, tartalek) : null) || (await naploCsatorna(g, "fo"));
  if (ch && tudIrni(ch)) await ch.send(uzenet).catch((x) => console.error("Jelzés küldése:", x.message));
}

async function jelzes(client, e) {
  for (const g of client.guilds.cache.values()) {
    const b = beall(g.id);
    if (e.fajta === "admin") {
      const k = kartya(K.ARANY)
        .kepes(
          [
            "### 🆘 Segítség kell!",
            `👤 **Játékos:** ${e.jatekos}${e.discord ? ` (<@${e.discord}>)` : ""}`,
            `🎮 **Szerver:** ${e.mod}${e.vilag ? ` · ${e.vilag}` : ""}`,
            e.szoveg ? `💬 **Üzenet:** ${e.szoveg}` : "💬 Nem írt üzenetet.",
            `🕒 <t:${unix(e.t)}:R>`,
          ].join("\n"),
          mcFej(e.jatekos),
        )
        .sor(gomb("jelzes_at", "Megyek", ButtonStyle.Success, "🙋"))
        .lab("A /segitseg parancsból • 🧊 IceMine");
      const ping = b.staffRang ? `<@&${b.staffRang}>` : null;
      const u = k.uzenet({ allowedMentions: { roles: b.staffRang ? [b.staffRang] : [] } });
      if (ping) u.components.unshift({ type: 10, content: ping });
      await kuldes(g, b.adminhivasok, b.reportok, u);
    } else {
      const k = kartya(K.PIROS)
        .kepes(
          [
            "### 🚨 Új jelentés",
            `🎯 **Jelentett:** ${e.celpont}${e.online === true ? " (online)" : e.online === false ? " (nincs fent)" : ""}`,
            `👤 **Bejelentő:** ${e.jatekos}${e.discord ? ` (<@${e.discord}>)` : ""}`,
            `🎮 **Szerver:** ${e.mod}${e.vilag ? ` · ${e.vilag}` : ""}`,
            `📝 **Indok:** ${e.szoveg}`,
            `🕒 <t:${unix(e.t)}:R>`,
          ].join("\n"),
          mcFej(e.celpont),
        )
        .sor(gomb("jelzes_at", "Átvettem", ButtonStyle.Primary, "🛡️"))
        .lab("A /jelent parancsból • 🧊 IceMine");
      await kuldes(g, b.reportok, null, k.uzenet());
    }
  }
}

function lezar(uzenet, sorSzoveg) {
  const c = uzenet.components.map((x) => x.toJSON());
  for (const kont of c) if (kont.type === 17) kont.components = kont.components.filter((x) => x.type !== 1).concat([{ type: 10, content: sorSzoveg }]);
  return c;
}

async function jelzesAt(i) {
  if (!staffE(i.member, i.guild.id)) return hiba(i, "Ezt csak a staff veheti át.");
  return i.update({ components: lezar(i.message, `✅ **Átvette:** ${i.user} <t:${unix(Date.now())}:R>`) });
}

const KERDES_NEV = { kor: "🎂 Kor", discord: "💬 Discord", ido: "⏱️ Mióta játszik", mod: "🎮 Legaktívabb mód", orak: "🕒 Napi aktivitás", tapasztalat: "🛡️ Staff tapasztalat", miert: "❓ Miért szeretne staff lenni", helyzet: "⚖️ Mit tenne csalás / sértegetés esetén", mikrofon: "🎙️ Mikrofon" };

async function jelentkezes(client, e) {
  const keret = 3300;
  const rovid = ["kor", "discord", "ido", "mod", "orak", "mikrofon"];
  const fej = [
    `### 📝 Staff jelentkezés: ${e.user}`,
    `${e.discord ? `🔗 <@${e.discord}> · ` : ""}🎖️ ${e.rang === "default" ? "nincs rangja" : e.rang}${e.regisztralt ? ` · 📅 regisztrált <t:${unix(e.regisztralt)}:D>` : ""}`,
    rovid.map((k) => `${KERDES_NEV[k]}: **${String(e.valaszok[k] || "–").slice(0, 60)}**`).join("\n"),
  ].join("\n");
  const hosszu = ["tapasztalat", "miert", "helyzet"];
  const egyre = Math.floor((keret - fej.length) / hosszu.length);
  const reszek = hosszu.map((k) => {
    const v = String(e.valaszok[k] || "–");
    return `**${KERDES_NEV[k]}**\n${v.length > egyre - 40 ? v.slice(0, egyre - 41) + "…" : v}`;
  });
  for (const g of client.guilds.cache.values()) {
    const b = beall(g.id);
    const k = kartya(K.LILA)
      .kepes(fej, mcFej(e.user))
      .elvalaszto()
      .szoveg(reszek.join("\n\n"))
      .sor(gomb("jel_ok:" + e.id, "Elfogad", ButtonStyle.Success, "✅"), gomb("jel_no:" + e.id, "Elutasít", ButtonStyle.Danger, "✖️"))
      .lab(`Azonosító: ${e.id} • 🧊 IceMine`);
    await kuldes(g, b.jelentkezesek, null, k.uzenet());
  }
}

const vezetoE = (m) => !!(m && m.permissions && (m.permissions.has(P.ManageRoles) || m.permissions.has(P.Administrator)));

async function dontes(i, id, dontesTipus, indok, uzenet) {
  const r = await belso("/jelentkezes-dontes", { id, dontes: dontesTipus, staff: i.user.username, indok });
  if (!r) return { hiba: "A weboldal most nem érhető el. Próbáld újra pár perc múlva." };
  if (!r.ok) return { hiba: r.error || "Nem sikerült." };
  const ok = r.allapot === "elfogadva";
  const szoveg = `${ok ? "✅ **Elfogadta:**" : "✖️ **Elutasította:**"} ${i.user} <t:${unix(Date.now())}:R>${!ok && indok ? `\n📝 Indok: ${indok}` : ""}`;
  if (uzenet) await uzenet.edit({ components: lezar(uzenet, szoveg) }).catch(() => {});
  if (r.discord) {
    const u = await i.client.users.fetch(r.discord).catch(() => null);
    const k = kartya(ok ? K.ZOLD : K.SZURKE).szoveg(
      ok ? "### 🎉 Elfogadták a staff jelentkezésedet!" : "### 📝 A staff jelentkezésedről",
      ok ? "Gratulálunk! Hamarosan keresünk a részletekkel." : `Most nem tudtuk elfogadni a jelentkezésedet.${indok ? `\n📝 **Indok:** ${indok}` : ""}\n14 nap múlva újra jelentkezhetsz a weboldalon.`,
    );
    if (u) await u.send(k.lab().uzenet()).catch(() => {});
  }
  return { ok: true, allapot: r.allapot, user: r.user };
}

async function jelOk(i) {
  if (!vezetoE(i.member)) return hiba(i, "Jelentkezést csak az fogadhat el, akinek van Rangok kezelése joga.");
  await i.deferUpdate();
  const r = await dontes(i, i.customId.slice(7), "elfogad", null, i.message);
  if (r.hiba) return i.followUp({ content: "❌ " + r.hiba, flags: MessageFlags.Ephemeral });
  return i.followUp({ content: `✅ Elfogadva: **${r.user}**. Ne felejtsd el kiosztani a staff rangot (Discordon és a szerveren is).`, flags: MessageFlags.Ephemeral });
}

const fuggoElutasitas = new Map();

async function jelNo(i) {
  if (!vezetoE(i.member)) return hiba(i, "Jelentkezést csak az utasíthat el, akinek van Rangok kezelése joga.");
  fuggoElutasitas.set(i.user.id, { id: i.customId.slice(7), ch: i.channelId, msg: i.message.id });
  const modal = new ModalBuilder()
    .setCustomId("jel_elutasit")
    .setTitle("Jelentkezés elutasítása")
    .addComponents(sor(new TextInputBuilder().setCustomId("indok").setLabel("Indok (a jelentkező is látja, nem kötelező)").setStyle(TextInputStyle.Paragraph).setMaxLength(400).setRequired(false)));
  return i.showModal(modal);
}

async function jelElutasitModal(i) {
  const f = fuggoElutasitas.get(i.user.id);
  fuggoElutasitas.delete(i.user.id);
  if (!f) return hiba(i, "Ez lejárt, nyomd meg újra az Elutasít gombot.");
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const ch = await csatorna(i.guild, f.ch);
  const uzenet = ch ? await ch.messages.fetch(f.msg).catch(() => null) : null;
  const r = await dontes(i, f.id, "elutasit", i.fields.getTextInputValue("indok").trim() || null, uzenet);
  if (r.hiba) return hiba(i, r.hiba);
  return siker(i, `Elutasítva: **${r.user}**. Értesítettük e-mailben${uzenet ? "" : ""} és DM-ben, ha lehetett.`);
}

const hirIdo = (s) => new Date(Number(s) * 1000).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

function szovegek(komp, ki) {
  for (const c of komp || []) {
    const j = typeof c.toJSON === "function" ? c.toJSON() : c;
    if (j.type === 10 && j.content) ki.push(j.content);
    if (j.components) szovegek(j.components, ki);
    if (j.accessory && j.accessory.type === 10 && j.accessory.content) ki.push(j.accessory.content);
  }
  return ki;
}

function hirSzoveg(m) {
  const reszek = [];
  if (m.content) reszek.push(m.content);
  for (const e of m.embeds || []) {
    if (e.title) reszek.push("## " + e.title);
    if (e.description) reszek.push(e.description);
  }
  szovegek(m.components, reszek);
  let sorok = reszek.join("\n").split("\n").map((s) => s.replace(/\s+$/, ""));
  sorok = sorok.filter((s) => !/^-#\s/.test(s) && !/^(\s*(<@&?\d+>|@everyone|@here)\s*)+$/.test(s));
  let t = sorok.join("\n").replace(/<t:(\d+)(:\w)?>/g, (_, s) => hirIdo(s)).replace(/\n{3,}/g, "\n\n").trim();
  let cim = "";
  const elso = t.split("\n")[0] || "";
  if (/^#{1,3}\s+/.test(elso) || t.split("\n").length > 1) {
    cim = elso.replace(/^#{1,3}\s+/, "").replace(/\*\*/g, "").replace(/^📢\s*/, "").trim();
    t = t.split("\n").slice(1).join("\n").trim();
  }
  return { cim: cim.slice(0, 200), szoveg: t.slice(0, 4000) };
}

async function hirKep(m) {
  const csatolt = [...(m.attachments ? m.attachments.values() : [])].find((a) => a.contentType && a.contentType.startsWith("image/") && a.size < 5e6);
  const url = csatolt ? csatolt.url : (m.embeds || []).map((e) => (e.image && e.image.url) || null).find(Boolean);
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const tipus = (r.headers.get("content-type") || "").split(";")[0];
    const buf = Buffer.from(await r.arrayBuffer());
    if (!/^image\/(png|jpeg|gif|webp)$/.test(tipus) || buf.length > 5e6) return null;
    return { tipus, adat: buf.toString("base64") };
  } catch {
    return null;
  }
}

const hirCsatornaE = (m) => m && m.guild && m.channelId && beall(m.guild.id).hirek === m.channelId;

async function hirKuld(m) {
  const { cim, szoveg } = hirSzoveg(m);
  if (!cim && !szoveg) return belso("/hirek-torles", { id: m.id });
  const szerzo = m.member ? m.member.displayName : m.author ? m.author.username : null;
  return belso("/hirek", { id: m.id, t: m.createdTimestamp, cim, szoveg, szerzo, kep: await hirKep(m) });
}

async function hirUj(m) {
  if (!hirCsatornaE(m)) return;
  await hirKuld(m);
}

async function hirSzerk(regi, uj) {
  if (!hirCsatornaE(uj)) return;
  const m = uj.partial ? await uj.fetch().catch(() => null) : uj;
  if (m) await hirKuld(m);
}

async function hirTorolve(m) {
  if (!hirCsatornaE(m)) return;
  await belso("/hirek-torles", { id: m.id });
}

async function hirekSzinkron(client) {
  for (const g of client.guilds.cache.values()) {
    const id = beall(g.id).hirek;
    if (!id) continue;
    const ch = await csatorna(g, id);
    if (!ch || !ch.messages) continue;
    const lista = await ch.messages.fetch({ limit: 15 }).catch(() => null);
    if (!lista) continue;
    for (const m of [...lista.values()].reverse()) await hirKuld(m).catch(() => {});
  }
}

function indit(client) {
  setTimeout(() => hirekSzinkron(client).catch((e) => console.error("Hírek:", e.message)), 8000);
}

module.exports = {
  jelzes,
  jelentkezes,
  hirUj,
  hirSzerk,
  hirTorolve,
  hirekSzinkron,
  indit,
  komponensek: { jelzes_at: jelzesAt },
  elotagok: { "jel_ok:": jelOk, "jel_no:": jelNo },
  modalok: { jel_elutasit: jelElutasitModal },
};
