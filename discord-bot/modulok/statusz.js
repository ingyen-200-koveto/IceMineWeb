const net = require("net");
const dns = require("dns").promises;
const { ActivityType, MessageFlags } = require("discord.js");
const { K, ment, beall, embed, rejtett, csatorna, tudIrni, naplo, unix, idoSzoveg } = require("../kozos");

function varint(n) {
  const b = [];
  n >>>= 0;
  do {
    let x = n & 0x7f;
    n >>>= 7;
    if (n) x |= 0x80;
    b.push(x);
  } while (n);
  return Buffer.from(b);
}

function olvasVarint(buf, i) {
  let n = 0;
  let s = 0;
  let x;
  do {
    if (i >= buf.length) return null;
    x = buf[i++];
    n |= (x & 0x7f) << s;
    s += 7;
    if (s > 35) throw new Error("hibás varint");
  } while (x & 0x80);
  return [n, i];
}

const mcString = (s) => {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([varint(b.length), b]);
};

function csomag(id, ...reszek) {
  const t = Buffer.concat([varint(id), ...reszek]);
  return Buffer.concat([varint(t.length), t]);
}

async function cimFelold() {
  if (K.MC_PORT) return { host: K.MC_HOST, port: K.MC_PORT };
  try {
    const r = await dns.resolveSrv("_minecraft._tcp." + K.MC_HOST);
    if (r.length) return { host: r[0].name, port: r[0].port };
  } catch {}
  return { host: K.MC_HOST, port: 25565 };
}

function mcPing(host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let kesz = false;
    const t = setTimeout(() => vege(new Error("időtúllépés")), 6000);
    function vege(hiba, ertek) {
      if (kesz) return;
      kesz = true;
      clearTimeout(t);
      s.destroy();
      if (hiba) reject(hiba);
      else resolve(ertek);
    }
    s.on("connect", () => {
      const p = Buffer.alloc(2);
      p.writeUInt16BE(port);
      s.write(csomag(0, varint(767), mcString(host), p, varint(1)));
      s.write(csomag(0));
    });
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      try {
        const fej = olvasVarint(buf, 0);
        if (!fej) return;
        const [hossz, i] = fej;
        if (buf.length < i + hossz) return;
        const id = olvasVarint(buf, i);
        const sz = olvasVarint(buf, id[1]);
        vege(null, JSON.parse(buf.subarray(sz[1], sz[1] + sz[0]).toString("utf8")));
      } catch (e) {
        vege(e);
      }
    });
    s.on("error", (e) => vege(e));
    s.on("close", () => vege(new Error("a kapcsolat lezárult")));
  });
}

let tar = { ido: 0, ertek: null };

async function statusz() {
  if (tar.ertek && Date.now() - tar.ido < 30000) return tar.ertek;
  let ertek;
  try {
    const c = await cimFelold();
    const d = await mcPing(c.host, c.port);
    ertek = { online: true, jatekos: (d.players && d.players.online) || 0, max: (d.players && d.players.max) || 0 };
  } catch {
    ertek = { online: false, jatekos: 0, max: 0 };
  }
  tar = { ido: Date.now(), ertek };
  return ertek;
}

function panelEmbed(s) {
  const sorok = s.online
    ? [`**Állapot:** Online`, `**Játékosok:** ${s.jatekos} / ${s.max}`]
    : [`**Állapot:** Offline`, `A szerver most nem válaszol, valószínűleg újraindul.`];
  sorok.push(`**Cím:** \`${K.MC_HOST}\``);
  if (K.BEDROCK_PORT) sorok.push(`**Bedrock port:** \`${K.BEDROCK_PORT}\``);
  sorok.push(`**Verziók:** ${K.VERZIOK}`, "", `Frissítve <t:${unix(Date.now())}:R>`);
  return embed(s.online ? K.ZOLD : K.PIROS)
    .setTitle("IceMine szerver")
    .setDescription(sorok.join("\n"));
}

const figyelo = { megerositett: null, hibaSzam: 0, kiesesKezdete: 0 };

async function riasztas(client, s) {
  if (s.online) {
    figyelo.hibaSzam = 0;
    if (figyelo.megerositett === false) {
      const kieses = Date.now() - figyelo.kiesesKezdete;
      figyelo.megerositett = true;
      for (const g of client.guilds.cache.values()) {
        await naplo(
          g,
          embed(K.ZOLD).setTitle("A Minecraft szerver újra elérhető").setDescription(`Kiesés: kb. ${idoSzoveg(kieses)}.`),
        );
      }
    }
    figyelo.megerositett = true;
    return;
  }
  if (figyelo.hibaSzam === 0) figyelo.kiesesKezdete = Date.now();
  figyelo.hibaSzam++;
  if (figyelo.hibaSzam >= 3 && figyelo.megerositett === true) {
    figyelo.megerositett = false;
    for (const g of client.guilds.cache.values()) {
      await naplo(
        g,
        embed(K.PIROS)
          .setTitle("A Minecraft szerver nem válaszol")
          .setDescription(`<t:${unix(figyelo.kiesesKezdete)}:t> óta nem érhető el. Ha visszajön, ide írok.`),
      );
    }
  }
}

async function panelekFrissit(client, s) {
  for (const g of client.guilds.cache.values()) {
    const b = beall(g.id);
    if (!b.statuszPanel) continue;
    const ch = await csatorna(g, b.statuszPanel.csatorna);
    const msg = ch ? await ch.messages.fetch(b.statuszPanel.uzenet).catch(() => null) : null;
    if (!msg) {
      delete b.statuszPanel;
      ment();
      continue;
    }
    await msg.edit({ embeds: [panelEmbed(s)] }).catch(() => {});
  }
}

async function jelenlet(client, s) {
  const szoveg = s.online ? `${s.jatekos} játékos online | ${K.MC_HOST}` : K.MC_HOST;
  client.user.setPresence({ activities: [{ name: K.NEV, type: ActivityType.Custom, state: szoveg }], status: "online" });
}

async function szamlaloFrissit(guild, kenyszer) {
  const b = beall(guild.id);
  if (!b.szamlalo) return;
  const ch = await csatorna(guild, b.szamlalo);
  if (!ch) return;
  const s = await statusz();
  const nev = s.online ? `Online: ${s.jatekos} játékos` : "Szerver: offline";
  if (kenyszer || ch.name !== nev) await ch.setName(nev).catch((e) => console.error("Számláló:", e.message));
}

function indit(client) {
  const kor = async () => {
    const s = await statusz();
    await jelenlet(client, s).catch((e) => console.error("Jelenlét:", e.message));
    await panelekFrissit(client, s).catch((e) => console.error("Státusz panel:", e.message));
    await riasztas(client, s).catch((e) => console.error("Riasztás:", e.message));
  };
  kor();
  setInterval(kor, 60000);
  const szamlalok = () => client.guilds.cache.forEach((g) => szamlaloFrissit(g).catch(() => {}));
  szamlalok();
  setInterval(szamlalok, 600000);
}

const parancsok = {
  async ip(i) {
    const sorok = [`**Java:** \`${K.MC_HOST}\``, `**Bedrock:** \`${K.MC_HOST}\`` + (K.BEDROCK_PORT ? `, port \`${K.BEDROCK_PORT}\`` : ""), `**Verziók:** ${K.VERZIOK}`];
    return i.reply({ embeds: [embed().setTitle("Így jössz fel a szerverre").setDescription(sorok.join("\n"))] });
  },

  async statusz(i) {
    await i.deferReply();
    const s = await statusz();
    const e = s.online
      ? embed(K.ZOLD).setTitle("A szerver fent van").setDescription(`**${s.jatekos}** játékos online (max. ${s.max})\nCím: \`${K.MC_HOST}\``)
      : embed(K.PIROS).setTitle("A szerver most nem elérhető").setDescription("Valószínűleg épp újraindul, nézz vissza pár perc múlva.");
    return i.editReply({ embeds: [e] });
  },

  async "statusz-panel"(i) {
    const ch = i.options.getChannel("csatorna");
    if (!tudIrni(ch)) return rejtett(i, `Ide nem tudok írni: ${ch}`);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const b = beall(i.guild.id);
    if (b.statuszPanel) {
      const regi = await csatorna(i.guild, b.statuszPanel.csatorna);
      if (regi) await regi.messages.delete(b.statuszPanel.uzenet).catch(() => {});
    }
    const msg = await ch.send({ embeds: [panelEmbed(await statusz())] });
    b.statuszPanel = { csatorna: ch.id, uzenet: msg.id };
    ment();
    return i.editReply(`Kész, a panel kint van itt: ${ch}. Percenként frissül.`);
  },
};

module.exports = { statusz, indit, szamlaloFrissit, parancsok };
