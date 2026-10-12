const { ButtonStyle, MessageFlags } = require("discord.js");
const { K, beall, kartya, gomb, linkGomb, rejtett, hiba, tudIrni } = require("../kozos");
const { cimSorok } = require("./statusz");
const { SZABALYOK } = require("./alap");

function infoKartya() {
  return kartya()
    .banner("info")
    .szoveg("## 🧊 Üdv az IceMine-on!", "Magyar Minecraft szerver Java és Bedrock játékosoknak. Itt minden fontosat megtalálsz. 👇")
    .elvalaszto(true)
    .gombos(["### 🎮 Csatlakozás", ...cimSorok()].join("\n"), gomb("info:ip", "IP másolása", ButtonStyle.Primary, "📋"))
    .gombos("### 🌐 Weboldal\nRegisztráció, 💎 IceCoin, rangok, 🛒 WebShop és 🎡 Szerencsekerék.", linkGomb("Megnyitás", K.WEB, "🌐"))
    .gombos("### 📜 Szabályzat\nOlvasd el, mielőtt játszol!", gomb("info:szabaly", "Röviden", ButtonStyle.Secondary, "📜"))
    .gombos("### 🎫 Segítség\nKérdésed van, vagy gond akadt? Nyiss egy ticketet!", gomb("info:segitseg", "Hogyan?", ButtonStyle.Secondary, "🎫"))
    .elvalaszto()
    .szoveg("### 🔗 Közösség")
    .sor(linkGomb("YouTube", K.YOUTUBE, "▶️"), linkGomb("Instagram", K.INSTAGRAM, "📸"), linkGomb("Meghívó", K.DISCORD_LINK, "💌"))
    .lab(`✉️ ${K.EMAIL} • 🧊 IceMine`);
}

function szabalyKartya(rang) {
  const k = kartya(K.LILA)
    .banner("szabalyzat")
    .szoveg("## 📜 Szabályzat", "A szabályzat a szerverre, a weboldalra és erre a Discordra is vonatkozik. A legfontosabbak röviden:")
    .elvalaszto()
    .szoveg(...SZABALYOK)
    .elvalaszto()
    .szoveg("-# A teljes szabályzat a weboldalon, a Dokumentumok fül alatt van. Ha nem ismered a szabályokat, az nem mentesít a következmények alól.");
  const gombok = [];
  if (rang) gombok.push(gomb(`elfogad:${rang}`, "Elolvastam, elfogadom", ButtonStyle.Success, "✅"));
  gombok.push(linkGomb("Teljes szabályzat", K.WEB, "📜"));
  return k.sor(...gombok).lab();
}

const parancsok = {
  async "info-panel"(i) {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
    await ch.send(infoKartya().uzenet());
    return rejtett(i, kartya(K.ZOLD).szoveg(`✅ Kint van az info panel: ${ch}`));
  },

  async "szabalyzat-panel"(i) {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return hiba(i, `Ide nem tudok írni: ${ch}`);
    const rang = i.options.getRole("rang");
    if (rang) {
      if (rang.managed || rang.id === i.guild.id) return hiba(i, `Ezt a rangot nem lehet kiosztani: ${rang}`);
      if (rang.position >= i.guild.members.me.roles.highest.position) return hiba(i, `Ez a rang feljebb van, mint a bot rangja: ${rang}. Húzd a bot rangját fölé.`);
    }
    await ch.send(szabalyKartya(rang ? rang.id : null).uzenet());
    return rejtett(i, kartya(K.ZOLD).szoveg(`✅ Kint van a szabályzat: ${ch}`, rang ? `-# Aki elfogadja, megkapja ezt: ${rang}` : null));
  },
};

async function infoGomb(i) {
  const mit = i.customId.slice(5);
  if (mit === "ip") return i.reply({ content: K.MC_HOST, flags: MessageFlags.Ephemeral });
  if (mit === "szabaly") return rejtett(i, kartya(K.LILA).szoveg("### 📜 A legfontosabbak", ...SZABALYOK).sor(linkGomb("Teljes szabályzat", K.WEB, "📜")));
  const panel = beall(i.guild.id).ticketPanel;
  return rejtett(
    i,
    kartya().szoveg(
      "### 🎫 Így kérhetsz segítséget",
      panel ? `1. Menj ide: <#${panel}>` : "1. Keresd a ticket csatornát",
      "2. Válaszd ki a témát a listából",
      "3. Nyílik egy privát csatorna, ahol a staff segít 💬",
    ),
  );
}

async function elfogadas(i) {
  const id = i.customId.slice(8);
  const rang = i.guild.roles.cache.get(id);
  if (!rang) return hiba(i, "Ez a rang már nem létezik, szólj egy adminnak.");
  if (i.member.roles.cache.has(id)) return rejtett(i, kartya(K.ZOLD).szoveg("✅ Már elfogadtad. Jó játékot! 🎮"));
  if (rang.position >= i.guild.members.me.roles.highest.position) return hiba(i, "Most nem tudom kiosztani a rangot, szólj egy adminnak.");
  await i.member.roles.add(id, "Elfogadta a szabályzatot");
  return rejtett(i, kartya(K.ZOLD).szoveg(`✅ Köszi! Megkaptad: ${rang}`, "Jó játékot! 🎮"));
}

module.exports = { parancsok, elotagok: { "info:": infoGomb, "elfogad:": elfogadas } };
