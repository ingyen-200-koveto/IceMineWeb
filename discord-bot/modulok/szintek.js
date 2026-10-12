const crypto = require("crypto");
const { K, adat, ment, mentKesobb, beall, kartya, valasz, hiba, csatorna, tudIrni, csik, avatar, unix } = require("../kozos");

const kovetkezo = (szint) => 5 * szint * szint + 50 * szint + 100;

function szintbol(xp) {
  let szint = 0;
  let maradek = xp;
  while (maradek >= kovetkezo(szint)) {
    maradek -= kovetkezo(szint);
    szint++;
  }
  return { szint, maradek, kell: kovetkezo(szint) };
}

function adatai(guildId, userId) {
  const r = (adat.szintek[guildId] || {})[userId] || { xp: 0 };
  return { xp: r.xp, ...szintbol(r.xp) };
}

function helyezes(guildId, userId) {
  const lista = Object.entries(adat.szintek[guildId] || {}).sort((a, b) => b[1].xp - a[1].xp);
  const n = lista.findIndex(([id]) => id === userId);
  return n < 0 ? null : n + 1;
}

const ERMEK = ["🥇", "🥈", "🥉"];

async function jutalomRangok(member, szint) {
  const jutalmak = beall(member.guild.id).szintRangok || {};
  const kapott = [];
  for (const [kell, rangId] of Object.entries(jutalmak)) {
    if (szint >= Number(kell) && !member.roles.cache.has(rangId)) {
      const ok = await member.roles
        .add(rangId, `Szint jutalom: ${kell}. szint`)
        .then(() => true)
        .catch((e) => {
          console.error("Szint rang:", e.message);
          return false;
        });
      if (ok) kapott.push(rangId);
    }
  }
  return kapott;
}

async function xpAdas(member, mennyi, ch) {
  const b = beall(member.guild.id);
  const tar = (adat.szintek[member.guild.id] ||= {});
  const r = (tar[member.id] ||= { xp: 0, utolso: 0 });
  const elotte = szintbol(r.xp).szint;
  r.xp += mennyi;
  mentKesobb();
  const utana = szintbol(r.xp).szint;
  if (utana <= elotte) return { szintlepes: false, szint: utana };
  const kapott = await jutalomRangok(member, utana);
  const cel = (await csatorna(member.guild, b.szintCsatorna)) || ch;
  if (cel && tudIrni(cel)) {
    const k = kartya(K.LILA)
      .kepes(
        [
          `### 🎉 Szintlépés!`,
          `${member} most már **${utana}. szintű**! ⭐`,
          kapott.length ? `🎁 Új rang: ${kapott.map((x) => `<@&${x}>`).join(" ")}` : `-# A következőhöz ${kovetkezo(utana)} XP kell.`,
        ].join("\n"),
        avatar(member.user),
      );
    await cel.send(k.uzenet({ allowedMentions: { users: [member.id] } })).catch(() => {});
  }
  return { szintlepes: true, szint: utana };
}

async function uzenet(m) {
  if (!m.guild || !m.member || m.author.bot || m.system) return;
  if (beall(m.guild.id).szintekKi) return;
  const tar = (adat.szintek[m.guild.id] ||= {});
  const r = (tar[m.author.id] ||= { xp: 0, utolso: 0 });
  const most = Date.now();
  if (most - (r.utolso || 0) < 60000) return;
  r.utolso = most;
  await xpAdas(m.member, crypto.randomInt(15, 26), m.channel);
}

function rangKartya(user, guildId) {
  const sz = adatai(guildId, user.id);
  const hely = helyezes(guildId, user.id);
  const arany = sz.maradek / sz.kell;
  const n = (adat.napi[guildId] || {})[user.id];
  return kartya(K.LILA)
    .kepes(
      [
        `### ⭐ ${user.username}`,
        `🏅 **Szint:** ${sz.szint}${hely ? `  ·  🏆 **#${hely}**` : ""}`,
        `✨ **XP:** ${sz.maradek} / ${sz.kell}`,
        `${csik(arany, 14)} ${Math.round(arany * 100)}%`,
      ].join("\n"),
      avatar(user),
    )
    .elvalaszto()
    .lab(`Összesen ${sz.xp} XP${n && n.sorozat ? ` • 🔥 ${n.sorozat} napos sorozat` : ""} • 🧊 IceMine`);
}

const parancsok = {
  async szint(i) {
    const user = i.options.getUser("tag") || i.user;
    if (user.bot) return hiba(i, "A botoknak nincs szintjük. 🤖");
    return valasz(i, rangKartya(user, i.guild.id));
  },

  async toplista(i) {
    const lista = Object.entries(adat.szintek[i.guild.id] || {})
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);
    if (!lista.length) return hiba(i, "Még senkinek nincs XP-je. Írjatok valamit! ✍️");
    const sorok = lista.map(([id, r], n) => `${ERMEK[n] || `\`${String(n + 1).padStart(2, " ")}.\``} <@${id}> · **${szintbol(r.xp).szint}. szint** · ${r.xp} XP`);
    const sajat = helyezes(i.guild.id, i.user.id);
    const k = kartya(K.ARANY)
      .banner("toplista")
      .szoveg("### 🏆 A legaktívabbak", ...sorok)
      .elvalaszto()
      .lab(sajat ? `A te helyezésed: #${sajat} • 🧊 IceMine` : "Írj valamit, és te is felkerülsz! • 🧊 IceMine");
    return valasz(i, k);
  },

  async napi(i) {
    if (beall(i.guild.id).szintekKi) return hiba(i, "A szintrendszer most ki van kapcsolva.");
    const tar = (adat.napi[i.guild.id] ||= {});
    const r = (tar[i.user.id] ||= { utolso: 0, sorozat: 0 });
    const most = Date.now();
    const eltelt = most - r.utolso;
    if (eltelt < 20 * 3600000) {
      const kovetkezoIdo = r.utolso + 20 * 3600000;
      return hiba(i, `Ma már átvetted. Legközelebb <t:${unix(kovetkezoIdo)}:R> jöhetsz. ⏳`);
    }
    r.sorozat = eltelt < 48 * 3600000 ? r.sorozat + 1 : 1;
    r.utolso = most;
    const alap = crypto.randomInt(50, 101);
    const bonusz = Math.min(r.sorozat - 1, 10) * 10;
    ment();
    const e = await xpAdas(i.member, alap + bonusz, i.channel);
    const k = kartya(K.ARANY)
      .kepes(
        [
          "### 🎁 Napi jutalom",
          `✨ **+${alap + bonusz} XP**${bonusz ? ` (benne ${bonusz} sorozat bónusz)` : ""}`,
          `🔥 **Sorozat:** ${r.sorozat} nap`,
          e.szintlepes ? `⭐ Szintet is léptél, most **${e.szint}.** szintű vagy!` : `-# Holnap is gyere vissza, a sorozat bónuszt ér!`,
        ].join("\n"),
        avatar(i.user),
      )
      .lab();
    return valasz(i, k);
  },
};

module.exports = { uzenet, adatai, szintbol, xpAdas, parancsok };
