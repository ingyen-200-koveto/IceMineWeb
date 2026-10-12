const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits: P,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require("discord.js");

const RAW = "https://raw.githubusercontent.com/ingyen-200-koveto/IceMineWeb/main/discord-bot";

const K = {
  NEV: process.env.BOT_NEV || "IceMine",
  SZIN: 0x5cc0ff,
  ZOLD: 0x4fd18b,
  PIROS: 0xe5484d,
  SARGA: 0xf2b84b,
  ARANY: 0xffc94d,
  LILA: 0xa593ff,
  ROZSA: 0xff8fb1,
  SZURKE: 0x8fa3b3,
  MC_HOST: process.env.MC_HOST || "play.icemine.hu",
  MC_PORT: parseInt(process.env.MC_PORT || "0", 10),
  BEDROCK_PORT: (process.env.BEDROCK_PORT || "").trim(),
  WEB: (process.env.WEBOLDAL || "https://icemine.hu").replace(/\/+$/, ""),
  DISCORD_LINK: "https://discord.gg/YJV2HNqTMc",
  YOUTUBE: "https://youtube.com/@icemine_1",
  INSTAGRAM: "https://www.instagram.com/icemine_1",
  EMAIL: "support@icemine.hu",
  VERZIOK: "1.20 – 1.21.x",
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, "adatok"),
  KEPEK: (process.env.KEPEK_URL || RAW + "/kepek").replace(/\/+$/, ""),
  LOGO: process.env.LOGO_URL || RAW + "/logo.png",
  INDULAS: Date.now(),
};

const ADAT_FAJL = path.join(K.DATA_DIR, "adatok.json");
fs.mkdirSync(K.DATA_DIR, { recursive: true });

const adat = {
  szerverek: {},
  figyelmeztetesek: {},
  ticketSzam: {},
  ticketKezelo: {},
  otletek: {},
  nyeremenyek: {},
  szintek: {},
  ideiglenesBanok: [],
  afk: {},
  emlekeztetok: [],
  napi: {},
  esemenyek: {},
};
try {
  Object.assign(adat, JSON.parse(fs.readFileSync(ADAT_FAJL, "utf8")));
} catch {}

let mentesIdozito = null;

function ment() {
  if (mentesIdozito) {
    clearTimeout(mentesIdozito);
    mentesIdozito = null;
  }
  const tmp = ADAT_FAJL + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(adat));
  fs.renameSync(tmp, ADAT_FAJL);
}

function mentKesobb() {
  if (!mentesIdozito) mentesIdozito = setTimeout(ment, 5000);
}

for (const jel of ["SIGTERM", "SIGINT"]) {
  process.once(jel, () => {
    try {
      ment();
    } catch {}
    process.exit(0);
  });
}

const beall = (id) => (adat.szerverek[id] ||= {});

const allapot = { client: null };

const V2 = MessageFlags.IsComponentsV2;
const LAB = `-# 🧊 IceMine • ${K.MC_HOST}`;
const kep = (nev) => `${K.KEPEK}/${nev}.jpg`;

class Kartya {
  constructor(szin) {
    this.c = new ContainerBuilder().setAccentColor(szin ?? K.SZIN);
  }

  banner(nev) {
    return this.galeria(kep(nev));
  }

  galeria(...urlek) {
    const g = new MediaGalleryBuilder().addItems(...urlek.slice(0, 10).map((u) => new MediaGalleryItemBuilder().setURL(u)));
    this.c.addMediaGalleryComponents(g);
    return this;
  }

  szoveg(...sorok) {
    const t = sorok.filter((s) => s !== null && s !== undefined && s !== false).join("\n");
    if (t) this.c.addTextDisplayComponents(new TextDisplayBuilder().setContent(t));
    return this;
  }

  kepes(szoveg, url) {
    const s = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(szoveg)).setThumbnailAccessory(new ThumbnailBuilder().setURL(url));
    this.c.addSectionComponents(s);
    return this;
  }

  gombos(szoveg, gomb) {
    const s = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(szoveg)).setButtonAccessory(gomb);
    this.c.addSectionComponents(s);
    return this;
  }

  elvalaszto(nagy = false, vonal = true) {
    this.c.addSeparatorComponents(new SeparatorBuilder().setDivider(vonal).setSpacing(nagy ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small));
    return this;
  }

  sor(...elemek) {
    if (elemek.length) this.c.addActionRowComponents(new ActionRowBuilder().addComponents(...elemek));
    return this;
  }

  lab(szoveg) {
    return this.szoveg(szoveg ? `-# ${szoveg}` : LAB);
  }

  uzenet(extra = {}) {
    const { rejtett, ...tobbi } = extra;
    return { components: [this.c], flags: rejtett ? V2 | MessageFlags.Ephemeral : V2, allowedMentions: { parse: [] }, ...tobbi };
  }
}

const kartya = (szin) => new Kartya(szin);

const sor = (...elemek) => new ActionRowBuilder().addComponents(...elemek);
const linkGomb = (cimke, url, emoji) => {
  const g = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(cimke).setURL(url);
  if (emoji) g.setEmoji(emoji);
  return g;
};
const gomb = (id, cimke, stilus, emoji) => {
  const g = new ButtonBuilder().setCustomId(id).setLabel(cimke).setStyle(stilus ?? ButtonStyle.Secondary);
  if (emoji) g.setEmoji(emoji);
  return g;
};

function rejtett(i, tartalom) {
  const k = tartalom instanceof Kartya ? tartalom : kartya().szoveg(String(tartalom));
  const v = k.uzenet({ rejtett: true });
  if (i.deferred && !i.replied) {
    const { flags, ...tobbi } = v;
    return i.editReply({ ...tobbi, flags: V2 });
  }
  if (i.replied) return i.followUp(v);
  return i.reply(v);
}

function valasz(i, k, opciok = {}) {
  const v = k.uzenet(opciok);
  if (i.deferred && !i.replied) {
    const { flags, ...tobbi } = v;
    return i.editReply({ ...tobbi, flags: V2 });
  }
  if (i.replied) return i.followUp(v);
  return i.reply(v);
}

const hiba = (i, szoveg) => rejtett(i, kartya(K.PIROS).szoveg(`❌ ${szoveg}`));
const siker = (i, szoveg) => rejtett(i, kartya(K.ZOLD).szoveg(`✅ ${szoveg}`));

function v2E(msg) {
  return !!(msg && msg.flags && typeof msg.flags.has === "function" && msg.flags.has(V2));
}

function embed(szin) {
  const u = allapot.client && allapot.client.user;
  return new EmbedBuilder()
    .setColor(szin ?? K.SZIN)
    .setFooter({ text: `IceMine • ${K.MC_HOST}`, iconURL: u ? u.displayAvatarURL() : undefined })
    .setTimestamp();
}

async function csatorna(guild, id) {
  if (!id || !guild) return null;
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

function tudIrni(ch) {
  if (!ch || !ch.guild) return false;
  const p = ch.permissionsFor(ch.guild.members.me);
  return !!p && p.has([P.ViewChannel, P.SendMessages, P.EmbedLinks]);
}

async function naploCsatorna(guild, tipus) {
  const b = beall(guild.id);
  const sajat = b.naplok && tipus && b.naplok[tipus];
  if (sajat) return csatorna(guild, sajat);
  if (tipus === "parancs") return null;
  return csatorna(guild, b.naplo);
}

async function naplo(guild, e, files, tipus) {
  const ch = await naploCsatorna(guild, tipus);
  if (ch) await ch.send({ embeds: [e], files: files || [], allowedMentions: { parse: [] } }).catch(() => {});
}

const sajatMuveletek = new Map();
function jelol(kulcs) {
  sajatMuveletek.set(kulcs, Date.now());
  if (sajatMuveletek.size > 500) sajatMuveletek.delete(sajatMuveletek.keys().next().value);
}
function sajatE(kulcs) {
  const t = sajatMuveletek.get(kulcs);
  return !!t && Date.now() - t < 15000;
}

async function dm(user, szoveg, szin) {
  if (!user) return false;
  const k = kartya(szin).szoveg(szoveg).lab();
  return user
    .send(k.uzenet())
    .then(() => true)
    .catch(() => false);
}

function staffE(member, guildId) {
  if (!member) return false;
  const b = beall(guildId);
  if (b.staffRang && member.roles && member.roles.cache && member.roles.cache.has(b.staffRang)) return true;
  return !!(member.permissions && member.permissions.has(P.ManageMessages));
}

const EGYSEGEK = [
  [/^(p|perc|percre|m|min)$/, 60000],
  [/^(ó|o|óra|ora|órára|orara|h)$/, 3600000],
  [/^(n|nap|napra|d)$/, 86400000],
  [/^(hét|het|hétre|hetre|w)$/, 604800000],
  [/^(mp|s)$/, 1000],
];

function idoErtelmez(szoveg) {
  if (szoveg === null || szoveg === undefined) return null;
  const s = String(szoveg).toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 60000;
  const re = /(\d+)([a-záéíóöőúüű]+)/g;
  let ossz = 0;
  let hossz = 0;
  let m;
  while ((m = re.exec(s))) {
    const egyseg = EGYSEGEK.find(([r]) => r.test(m[2]));
    if (!egyseg) return null;
    ossz += parseInt(m[1], 10) * egyseg[1];
    hossz += m[0].length;
  }
  return hossz === s.length ? ossz : null;
}

const RAGOS = { hét: "hétre", nap: "napra", óra: "órára", perc: "percre" };

function idoSzoveg(ms, ragos) {
  let mp = Math.max(0, Math.round(ms / 1000));
  const reszek = [];
  const egysegek = [
    [604800, "hét"],
    [86400, "nap"],
    [3600, "óra"],
    [60, "perc"],
  ];
  for (const [e, nev] of egysegek) {
    if (mp >= e) {
      reszek.push(`${Math.floor(mp / e)} ${nev}`);
      mp %= e;
    }
  }
  if (!reszek.length) return ragos ? "kevesebb mint 1 percre" : "kevesebb mint 1 perc";
  const r = reszek.slice(0, 2);
  if (ragos) r[r.length - 1] = r[r.length - 1].replace(/\S+$/, (szo) => RAGOS[szo] || szo);
  return r.join(" ");
}

function uzenetId(szoveg) {
  const m = String(szoveg || "").match(/(\d{17,20})\D*$/);
  return m ? m[1] : null;
}

const vagas = (s, n) => {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

const unix = (ms) => Math.floor(ms / 1000);

function csik(arany, hossz = 12) {
  const tele = Math.max(0, Math.min(hossz, Math.round(arany * hossz)));
  return "▰".repeat(tele) + "▱".repeat(hossz - tele);
}

const avatar = (user) => user.displayAvatarURL({ extension: "png", size: 256 });

module.exports = {
  K,
  P,
  V2,
  LAB,
  adat,
  ment,
  mentKesobb,
  beall,
  allapot,
  kep,
  Kartya,
  kartya,
  sor,
  linkGomb,
  gomb,
  rejtett,
  valasz,
  hiba,
  siker,
  v2E,
  embed,
  csatorna,
  tudIrni,
  naplo,
  naploCsatorna,
  jelol,
  sajatE,
  dm,
  staffE,
  idoErtelmez,
  idoSzoveg,
  uzenetId,
  vagas,
  unix,
  csik,
  avatar,
};
