const fs = require("fs");
const path = require("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits: P } = require("discord.js");

const K = {
  NEV: process.env.BOT_NEV || "IceMine",
  SZIN: 0x5cc0ff,
  ZOLD: 0x4fd18b,
  PIROS: 0xe5484d,
  SARGA: 0xf2b84b,
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

function embed(szin) {
  const u = allapot.client && allapot.client.user;
  return new EmbedBuilder()
    .setColor(szin ?? K.SZIN)
    .setFooter({ text: `${K.NEV} | ${K.MC_HOST}`, iconURL: u ? u.displayAvatarURL() : undefined });
}

const sor = (...elemek) => new ActionRowBuilder().addComponents(...elemek);
const linkGomb = (cimke, url) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(cimke).setURL(url);

function rejtett(i, tartalom) {
  const v = typeof tartalom === "string" ? { content: tartalom } : tartalom;
  if (i.deferred || i.replied) return i.followUp({ ...v, flags: MessageFlags.Ephemeral });
  return i.reply({ ...v, flags: MessageFlags.Ephemeral });
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

async function naplo(guild, e, files) {
  const ch = await csatorna(guild, beall(guild.id).naplo);
  if (ch) await ch.send({ embeds: [e], files: files || [], allowedMentions: { parse: [] } }).catch(() => {});
}

async function dm(user, szoveg) {
  if (!user) return false;
  return user
    .send({ embeds: [embed().setDescription(szoveg)] })
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

module.exports = {
  K,
  P,
  adat,
  ment,
  mentKesobb,
  beall,
  allapot,
  embed,
  sor,
  linkGomb,
  rejtett,
  csatorna,
  tudIrni,
  naplo,
  dm,
  staffE,
  idoErtelmez,
  idoSzoveg,
  uzenetId,
  vagas,
  unix,
};
