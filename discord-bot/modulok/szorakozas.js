const crypto = require("crypto");
const { ButtonStyle } = require("discord.js");
const { K, kartya, gomb, linkGomb, valasz, hiba } = require("../kozos");
const szintek = require("./szintek");

const veletlen = (lista) => lista[crypto.randomInt(lista.length)];

const GOMB_VALASZOK = [
  ["Egészen biztosan. ✨", K.ZOLD],
  ["Igen, határozottan.", K.ZOLD],
  ["Erre mérget vehetsz.", K.ZOLD],
  ["Minden jel szerint igen.", K.ZOLD],
  ["Szerintem igen.", K.ZOLD],
  ["A csillagok is ezt mondják. 🌟", K.ZOLD],
  ["Igen, de ne bízd el magad. 😏", K.ZOLD],
  ["Most homályos a kép, kérdezz újra.", K.SARGA],
  ["Ezt most inkább nem árulom el. 🤫", K.SARGA],
  ["Fogalmam sincs, de jól hangzik.", K.SARGA],
  ["Koncentrálj, és kérdezd újra.", K.SARGA],
  ["Ne számíts rá.", K.PIROS],
  ["A válaszom nem.", K.PIROS],
  ["Erősen kétlem.", K.PIROS],
  ["A creeperek szerint nem. 💥", K.PIROS],
  ["Nem, és ezt a jeti is így gondolja. 🧊", K.PIROS],
];

const TIPPEK = [
  "A creeperek félnek a macskáktól. Egy macska a bázison sokat segít! 🐱",
  "Ágyban alvással átállítod az újraéledési pontodat. 🛏️",
  "A Netherben és az Endben ne aludj ágyban, mert felrobban! 💥",
  "Az obszidiánt csak gyémánt vagy netherit csákánnyal tudod kibányászni. ⛏️",
  "1.18 óta a gyémánt Y -58 és -59 környékén a leggyakoribb. 💎",
  "Silk Touch-csal a jég, az üveg és a fűblokk is egyben marad. 🧊",
  "A Mending XP-vel javítja a tárgyat, ha a kezedben vagy rajtad van. ✨",
  "Egy szénblokk 80, egy vödör láva 100 tárgyat éget ki a kemencében. 🔥",
  "A Totem of Undying egyszer megment a haláltól, ha a kezedben tartod. 🗿",
  "A piglinek nem támadnak meg, ha legalább egy arany páncélelem van rajtad. 🐷",
  "A Netherben 1 blokk a Felvilágon 8 blokknak felel meg. Gyors utazás! 🚀",
  "Faragott tökkel a fejeden az endermanek nem gurulnak be, ha rájuk nézel. 🎃",
  "A falusi szakmáját a munkablokk adja: az olvasópult például könyvtárost csinál belőle. 📚",
  "Fortune III-mal egy gyémántércből akár 4 gyémánt is eshet. 💎",
  "A netherit tárgyak nem égnek el a lávában, hanem fennmaradnak. 🌋",
  "A pajzs a creeper robbanását és a nyilakat is felfogja elölről. 🛡️",
  "Egy vödör vízzel megúszhatod a nagy esést, ha az utolsó pillanatban leteszed. 🪣",
  "Ha villám csap egy falusiba, boszorkány lesz belőle. ⚡",
  "A Respawn Anchorral a Netherben is beállíthatod az újraéledési pontot. ⚓",
  "Guggolva a sculk szenzorok nem hallanak meg. 🤫",
  "Az Elytrát fantommembránnal tudod megjavítani az üllőn. 🪽",
  "A gyapjú elnyeli a rezgéseket, a sculk szenzor nem érzékel át rajta. 🐑",
  "1.20 óta a netherit felszereléshez Netherite Upgrade sablon is kell. 🧰",
  "Delfinek közelében gyorsabban úszol (Dolphin's Grace). 🐬",
  "A szalmabálára esve jóval kisebb sebzést kapsz. 🌾",
  "Mézblokkon lassabban csúszol le a falról, és kisebbet esel rá. 🍯",
  "A beacon (jelzőfény) egész területre ad hasznos bónuszokat. 🔦",
  "A lodestone-ra állított iránytű mindig arra a pontra mutat, a Netherben is. 🧭",
];

const TRIVIA = [
  ["Mitől félnek a creeperek?", "Macskáktól", ["Farkasoktól", "Vasgólemtől", "Víztől"]],
  ["Legalább hány obszidián kell egy Nether portálhoz (sarkok nélkül)?", "10", ["14", "8", "12"]],
  ["Mivel lehet obszidiánt kibányászni?", "Gyémánt csákánnyal", ["Vas csákánnyal", "Kő csákánnyal", "Arany csákánnyal"]],
  ["Mi kell a netherit rúdhoz a 4 netherit törmeléken kívül?", "4 aranyrúd", ["4 gyémánt", "4 vasrúd", "4 smaragd"]],
  ["A Netherben 1 blokk a Felvilágon hány blokknak felel meg?", "8", ["4", "16", "2"]],
  ["Mi a legmagasabb Sharpness szint varázsasztalon/üllőn?", "V", ["III", "IV", "X"]],
  ["Ki az End főellensége?", "Ender Sárkány", ["Wither", "Warden", "Elder Guardian"]],
  ["Melyik mob dob fantommembránt?", "Phantom", ["Vex", "Denevér", "Ghast"]],
  ["Melyik blokkal lehet a Netherben újraéledési pontot állítani?", "Respawn Anchor", ["Ágy", "Lodestone", "Beacon"]],
  ["Hány gyapjú kell egy ágyhoz?", "3", ["2", "4", "6"]],
  ["Mi történik, ha a Netherben lefekszel egy ágyba?", "Felrobban", ["Elalszol", "Teleportálsz", "Semmi"]],
  ["Mivel tudod megnyírni a birkát?", "Ollóval", ["Karddal", "Fejszével", "Kapával"]],
  ["Mit dob a blaze?", "Blaze rudat", ["Puskaport", "Ender gyöngyöt", "Slime labdát"]],
  ["Miből készül az Ender szem?", "Ender gyöngy + blaze por", ["Ender gyöngy + cukor", "Blaze rúd + gyémánt", "Pók szem + redstone"]],
  ["Melyik a legerősebb páncél?", "Netherit", ["Gyémánt", "Vas", "Lánc"]],
  ["Mit csinál a Mending varázslat?", "XP-vel javítja a tárgyat", ["Gyorsabban bányászik", "Több sebzést ad", "Víz alatt lélegzel tőle"]],
  ["Melyik mob tud a lávában sétálni?", "Strider", ["Piglin", "Hoglin", "Enderman"]],
  ["Mi kell a Wither megidézéséhez?", "3 wither koponya + 4 lélekhomok", ["3 creeper fej + 4 obszidián", "4 vasblokk + tök", "3 zombi fej + 4 netherrack"]],
  ["Hány perc egy teljes Minecraft nap?", "20", ["10", "24", "60"]],
  ["Miből lehet vasgólemet építeni?", "4 vasblokk + faragott tök", ["4 vasrúd + tök", "2 vasblokk + hóblokk", "4 hóblokk + tök"]],
  ["Melyik verzióban jelent meg a Warden?", "1.19", ["1.18", "1.17", "1.20"]],
  ["Miből áll a hógólem teste?", "Hóblokkból", ["Jégből", "Gyapjúból", "Kvarcból"]],
  ["Melyik varázslattal bányászhatod ki egyben a jeget?", "Silk Touch", ["Fortune", "Efficiency", "Unbreaking"]],
  ["Hány tárgyat éget ki egy vödör láva a kemencében?", "100", ["64", "80", "20"]],
];

const BETUK = ["🇦", "🇧", "🇨", "🇩"];
const triviaJatekok = new Map();

function triviaKartya(uid) {
  const qi = crypto.randomInt(TRIVIA.length);
  const [kerdes, jo, rosszak] = TRIVIA[qi];
  const valaszok = [jo, ...rosszak];
  for (let n = valaszok.length - 1; n > 0; n--) {
    const j = crypto.randomInt(n + 1);
    [valaszok[n], valaszok[j]] = [valaszok[j], valaszok[n]];
  }
  const kulcs = `${uid}:${Date.now()}`;
  triviaJatekok.set(kulcs, { valaszok, jo: valaszok.indexOf(jo), kerdes });
  if (triviaJatekok.size > 500) triviaJatekok.delete(triviaJatekok.keys().next().value);
  return kartya(K.LILA)
    .szoveg("### 🧠 Minecraft kvíz", `**${kerdes}**`, "", ...valaszok.map((v, n) => `${BETUK[n]} ${v}`))
    .sor(...valaszok.map((v, n) => gomb(`trivia:${kulcs}:${n}`, "ABCD"[n], ButtonStyle.Secondary)))
    .lab("Jó válaszért +15 XP jár! • 🧊 IceMine");
}

const KPO = {
  ko: { nev: "Kő", emoji: "🪨", ver: "ollo" },
  papir: { nev: "Papír", emoji: "📄", ver: "ko" },
  ollo: { nev: "Olló", emoji: "✂️", ver: "papir" },
};

function kpoKartya(uid) {
  return kartya()
    .szoveg("### ✊ Kő, papír, olló", "Válassz, én is választok! 🤖")
    .sor(...Object.entries(KPO).map(([k, v]) => gomb(`kpo:${k}:${uid}`, v.nev, ButtonStyle.Primary, v.emoji)))
    .lab();
}

function hashSzazalek(a, b) {
  const h = crypto.createHash("sha256").update([a, b].sort().join(":") + ":icemine").digest();
  return h.readUInt32BE(0) % 101;
}

const parancsok = {
  async "8ball"(i) {
    const kerdes = i.options.getString("kerdes");
    const [v, szin] = veletlen(GOMB_VALASZOK);
    return valasz(i, kartya(szin).szoveg("### 🎱 Varázsgömb", `❓ **${kerdes}**`, "", `💬 ${v}`).lab(`${i.user.username} kérdezte • 🧊 IceMine`));
  },

  async "fej-vagy-iras"(i) {
    const tipp = i.options.getString("tipp");
    const eredmeny = crypto.randomInt(2) === 0 ? "fej" : "iras";
    const nev = eredmeny === "fej" ? "Fej" : "Írás";
    const sorok = ["### 🪙 Pénzfeldobás", `Feldobtam… és **${nev}** lett!`];
    let szin = K.SZIN;
    if (tipp) {
      const talalt = tipp === eredmeny;
      sorok.push(talalt ? "🎉 Eltaláltad!" : "😅 Most nem jött be.");
      szin = talalt ? K.ZOLD : K.PIROS;
    }
    return valasz(i, kartya(szin).szoveg(...sorok).lab());
  },

  async kocka(i) {
    const oldal = i.options.getInteger("oldalak") || 6;
    const db = i.options.getInteger("db") || 1;
    const dobasok = Array.from({ length: db }, () => crypto.randomInt(1, oldal + 1));
    const ossz = dobasok.reduce((a, b) => a + b, 0);
    const sorok = ["### 🎲 Dobókocka", db === 1 ? `Dobás: **${dobasok[0]}**` : `${dobasok.map((d) => `\`${d}\``).join(" · ")}\nÖsszesen: **${ossz}**`];
    return valasz(i, kartya().szoveg(...sorok).lab(`${db} db ${oldal} oldalú kocka • 🧊 IceMine`));
  },

  async kpo(i) {
    return valasz(i, kpoKartya(i.user.id));
  },

  async szerelem(i) {
    const a = i.options.getUser("tag");
    const b = i.options.getUser("masik") || i.user;
    const sz = a.id === b.id ? 100 : hashSzazalek(a.id, b.id);
    const tele = Math.round(sz / 10);
    const megj =
      a.id === b.id
        ? "Az önszeretet a legfontosabb! 💖"
        : sz <= 20
          ? "Hát… inkább maradjatok barátok. 🥶"
          : sz <= 40
            ? "Van még mit dolgozni rajta. 🙂"
            : sz <= 60
              ? "Nem rossz, nem rossz! 😏"
              : sz <= 80
                ? "Ez már komoly! 💞"
                : sz < 100
                  ? "Ti egymásnak lettetek teremtve! 💖"
                  : "Tökéletes páros! 💍";
    return valasz(
      i,
      kartya(K.ROZSA)
        .szoveg("### 💘 Szerelemmérő", `${a} ❤️ ${b}`, "", `${"❤️".repeat(tele)}${"🖤".repeat(10 - tele)} **${sz}%**`, megj)
        .lab(),
    );
  },

  async tipp(i) {
    return valasz(i, kartya(K.ZOLD).szoveg("### 💡 Minecraft tipp", veletlen(TIPPEK)).lab(`${TIPPEK.length} tipp van a tarsolyomban • 🧊 IceMine`));
  },

  async trivia(i) {
    return valasz(i, triviaKartya(i.user.id));
  },

  async avatar(i) {
    const u = i.options.getUser("tag") || i.user;
    const nagy = u.displayAvatarURL({ extension: "png", size: 1024 });
    return valasz(i, kartya().szoveg(`### 🖼️ ${u.username} profilképe`).galeria(nagy).sor(linkGomb("Megnyitás", nagy, "🔗")).lab());
  },
};

async function kpoGomb(i) {
  const [, valasztas, uid] = i.customId.split(":");
  if (uid !== i.user.id) return hiba(i, "Ez nem a te játékod. Indíts sajátot: `/kpo`");
  if (valasztas === "uj") return i.update(kpoKartya(uid).uzenet());
  const en = KPO[valasztas];
  const botKulcs = veletlen(Object.keys(KPO));
  const bot = KPO[botKulcs];
  let eredmeny;
  let szin;
  if (botKulcs === valasztas) {
    eredmeny = "🤝 Döntetlen!";
    szin = K.SARGA;
  } else if (en.ver === botKulcs) {
    eredmeny = "🎉 Nyertél!";
    szin = K.ZOLD;
  } else {
    eredmeny = "😈 Ezt most én nyertem!";
    szin = K.PIROS;
  }
  const k = kartya(szin)
    .szoveg("### ✊ Kő, papír, olló", `Te: ${en.emoji} **${en.nev}**  ·  Én: ${bot.emoji} **${bot.nev}**`, "", `## ${eredmeny}`)
    .sor(gomb(`kpo:uj:${uid}`, "Még egyet!", ButtonStyle.Secondary, "🔁"))
    .lab();
  return i.update(k.uzenet());
}

async function triviaGomb(i) {
  const reszek = i.customId.split(":");
  if (reszek[1] === "uj") {
    if (reszek[2] !== i.user.id) return hiba(i, "Indíts saját kvízt: `/trivia`");
    return i.update(triviaKartya(i.user.id).uzenet());
  }
  const kulcs = `${reszek[1]}:${reszek[2]}`;
  const valasztott = Number(reszek[3]);
  if (reszek[1] !== i.user.id) return hiba(i, "Ez a kérdés nem neked szól. Indíts sajátot: `/trivia`");
  const j = triviaJatekok.get(kulcs);
  if (!j) return hiba(i, "Ez a kérdés lejárt. Kérj újat: `/trivia`");
  triviaJatekok.delete(kulcs);
  const jo = valasztott === j.jo;
  let xp = "";
  if (jo && i.member) {
    const e = await szintek.xpAdas(i.member, 15, i.channel);
    xp = e.szintlepes ? ` · ⭐ szintet léptél (${e.szint}.)` : " · +15 XP";
  }
  const gombok = j.valaszok.map((v, n) => {
    const stilus = n === j.jo ? ButtonStyle.Success : n === valasztott ? ButtonStyle.Danger : ButtonStyle.Secondary;
    return gomb(`trivia:kesz:${n}`, "ABCD"[n], stilus).setDisabled(true);
  });
  const k = kartya(jo ? K.ZOLD : K.PIROS)
    .szoveg(
      "### 🧠 Minecraft kvíz",
      `**${j.kerdes}**`,
      "",
      ...j.valaszok.map((v, n) => `${BETUK[n]} ${v}${n === j.jo ? " ✅" : n === valasztott ? " ❌" : ""}`),
      "",
      jo ? `## 🎉 Helyes!${xp}` : `## 😬 Nem talált! A jó válasz: ${j.valaszok[j.jo]}`,
    )
    .sor(...gombok)
    .sor(gomb(`trivia:uj:${i.user.id}`, "Új kérdés", ButtonStyle.Primary, "🔁"))
    .lab();
  return i.update(k.uzenet());
}

module.exports = { parancsok, elotagok: { "kpo:": kpoGomb, "trivia:": triviaGomb }, TRIVIA, TIPPEK };
