(function () {
  "use strict";

  const CEG = {
    nev: "Idealtherm",
    telefon: "+36 30 583 2871",
    email: "kapcsolat@idealtherm.hu",
    cim: "Mosonmagyaróvár",
  };

  const SUTI_KULCS = "idealtherm-suti";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const ikon = (id) => `<svg class="ikon"><use href="#${id}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function tarolo(kulcs, ertek) {
    try {
      if (ertek === undefined) return JSON.parse(localStorage.getItem(kulcs) || "null");
      localStorage.setItem(kulcs, JSON.stringify(ertek));
    } catch (e) {
      return null;
    }
    return null;
  }

  let uzenetIdo;
  function uzenet(szoveg) {
    const el = $("#uzenet");
    el.textContent = szoveg;
    el.classList.add("lat");
    clearTimeout(uzenetIdo);
    uzenetIdo = setTimeout(() => el.classList.remove("lat"), 2200);
  }

  function adatok() {
    const tel = CEG.telefon.trim(), email = CEG.email.trim(), cim = CEG.cim.trim();
    const telLink = "tel:" + tel.replace(/[^\d+]/g, "");
    const ertekek = {
      telefon: tel ? `<a href="${telLink}">${esc(tel)}</a>` : "",
      email: email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : "",
      cim: cim ? esc(cim) : "",
    };
    $$("[data-adat]").forEach((el) => {
      const k = el.dataset.adat, v = ertekek[k];
      if (el.tagName === "LI") {
        const nev = { telefon: "Telefon", email: "E-mail", cim: "Helyszín" }[k];
        el.innerHTML = v ? v : `${nev}: hamarosan`;
      } else {
        el.innerHTML = v || "Hamarosan";
        el.classList.toggle("nincs", !v);
      }
    });
    if (tel || email) {
      $("#felso").hidden = false;
      if (tel) {
        const a = $("#felsoTel");
        a.hidden = false;
        a.href = telLink;
        $("span", a).innerHTML = `<span class="elotag">Hívjon minket: </span>${esc(tel)}`;
      }
      if (email) {
        const a = $("#felsoEmail");
        a.hidden = false;
        a.href = "mailto:" + email;
        $("span", a).textContent = email;
      }
      if (cim) {
        const h = $("#felsoHely");
        h.hidden = false;
        $("span", h).textContent = cim;
      }
      const k = $("#menuKapcs");
      k.hidden = false;
      k.innerHTML =
        (tel ? `<a href="${telLink}">${ikon("i-telefon")}${esc(tel)}</a>` : "") +
        (email ? `<a href="mailto:${esc(email)}">${ikon("i-level")}${esc(email)}</a>` : "");
    }
    $("#ev").textContent = new Date().getFullYear();
  }

  function dokumentumok() {
    $$("[data-dok]").forEach((lap) => {
      const cim = lap.dataset.cim;
      lap.innerHTML = `<div class="oldalfej"><div class="keret">
        <ol class="morzsa"><li><a href="/" data-ut>Kezdőlap</a></li><li aria-current="page">${esc(cim)}</li></ol>
        <h1>${esc(cim)}</h1></div></div>
        <div class="keret szekcio"><div class="ures">
          <span class="jel">${ikon("i-dok")}</span>
          <h2>Feltöltés alatt</h2>
          <p>Hamarosan itt olvashatja a teljes szöveget.</p>
          <div class="gombsor"><a class="gomb masod" href="/" data-ut>Vissza a kezdőlapra</a></div>
        </div></div>`;
    });
  }

  const LAPOK = () => $$(".lap");
  function utvonal(u) {
    let p = (u || "/").split(/[?#]/)[0].replace(/\/{2,}/g, "/");
    if (p.length > 1) p = p.replace(/\/+$/, "");
    if (p === "/index.html") p = "/";
    return p || "/";
  }

  let jelenlegi = null;
  function mutat(ut, gorget) {
    const lapok = LAPOK();
    const lap = lapok.find((l) => l.dataset.lap === ut) || lapok.find((l) => l.dataset.lap === "404");
    jelenlegi = lap.dataset.lap === "404" ? ut : lap.dataset.lap;
    lapok.forEach((l) => l.classList.toggle("aktiv", l === lap));
    const cim = lap.dataset.cim;
    document.title = cim ? `${cim} | ${CEG.nev}` : `${CEG.nev} | Klíma, hőszivattyú, szellőztetés`;
    $$("a[data-ut]").forEach((a) => {
      const sajat = utvonal(a.getAttribute("href")) === jelenlegi && !a.classList.contains("marka") && !a.closest(".morzsa");
      if (sajat) a.setAttribute("aria-current", "page");
      else if (!a.closest(".morzsa")) a.removeAttribute("aria-current");
    });
    if (gorget) {
      window.scrollTo(0, 0);
      $("#tartalom").focus({ preventScroll: true });
    }
    if (!sutiDontes() && jelenlegi !== "/adatkezeles") sutiMutat();
    else if (jelenlegi === "/adatkezeles" && !sutiDontes()) sutiRejt();
  }

  function navigal(ut) {
    try {
      if (location.pathname !== ut) history.pushState({}, "", ut);
    } catch (e) {}
    mutat(ut, true);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-ut]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    menuZar();
    navigal(utvonal(a.getAttribute("href")));
  });
  window.addEventListener("popstate", () => mutat(utvonal(location.pathname), false));

  const fejlec = $("#fejlec");
  const arnyek = () => fejlec.classList.toggle("arnyekos", window.scrollY > 4);
  window.addEventListener("scroll", arnyek, { passive: true });

  const menu = $("#mobilmenu"), hatter = $("#menuHatter"), nyit = $("#menuNyit");
  function menuNyit() {
    menu.hidden = false;
    hatter.hidden = false;
    document.body.style.overflow = "hidden";
    nyit.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      menu.classList.add("nyitva");
      hatter.classList.add("lat");
      $("#menuZar").focus();
    });
  }
  function menuZar() {
    if (menu.hidden) return;
    menu.classList.remove("nyitva");
    hatter.classList.remove("lat");
    nyit.setAttribute("aria-expanded", "false");
    if ($("#suti").hidden) document.body.style.overflow = "";
    setTimeout(() => {
      menu.hidden = true;
      hatter.hidden = true;
    }, 250);
  }
  nyit.addEventListener("click", menuNyit);
  $("#menuZar").addEventListener("click", () => {
    menuZar();
    nyit.focus();
  });
  hatter.addEventListener("click", menuZar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      menuZar();
      nyit.focus();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1060) menuZar();
  });

  const suti = $("#suti");
  function sutiDontes() {
    const d = tarolo(SUTI_KULCS);
    return d && d.v === 1 ? d : null;
  }
  function sutiMutat(beallitas) {
    if (!suti.hidden) return;
    const d = sutiDontes();
    $("#sutiStat").checked = !!(d && d.statisztika);
    $("#sutiMark").checked = !!(d && d.marketing);
    const tobb = !!beallitas;
    $("#sutiValasztok").hidden = !tobb;
    $("#sutiTobb").textContent = tobb ? "KIVÁLASZTOTTAK MENTÉSE" : "TOVÁBBI LEHETŐSÉGEK";
    suti.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("#sutiMind").focus({ preventScroll: true }), 30);
  }
  function sutiRejt() {
    suti.hidden = true;
    if (menu.hidden) document.body.style.overflow = "";
  }
  function sutiMent(statisztika, marketing) {
    const d = { v: 1, szukseges: true, statisztika, marketing, ido: new Date().toISOString() };
    tarolo(SUTI_KULCS, d);
    window.idealthermSuti = d;
    document.dispatchEvent(new CustomEvent("idealtherm:suti", { detail: d }));
    sutiRejt();
    uzenet("Süti beállítások mentve.");
  }
  $("#sutiMind").addEventListener("click", () => sutiMent(true, true));
  $("#sutiNem").addEventListener("click", () => sutiMent(false, false));
  $("#sutiTobb").addEventListener("click", () => {
    const v = $("#sutiValasztok");
    if (v.hidden) {
      v.hidden = false;
      $("#sutiTobb").textContent = "KIVÁLASZTOTTAK MENTÉSE";
      $("#sutiStat").focus();
    } else {
      sutiMent($("#sutiStat").checked, $("#sutiMark").checked);
    }
  });
  $("#sutiLink").addEventListener("click", () => {
    if (!sutiDontes()) sutiRejt();
  });
  $("#sutiBeallitas").addEventListener("click", () => sutiMutat(true));
  suti.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = $$("button:not([disabled]),a[href],input:not([disabled])", suti).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const elso = f[0], utolso = f[f.length - 1];
    if (e.shiftKey && document.activeElement === elso) {
      e.preventDefault();
      utolso.focus();
    } else if (!e.shiftKey && document.activeElement === utolso) {
      e.preventDefault();
      elso.focus();
    }
  });
  window.idealthermSuti = sutiDontes();

  const MIN = 16, MAX = 30, LEPES = 0.5, IV = 245;
  let fok = 22, meleg = false;
  const termosztat = $("#termosztat");
  function termRajzol() {
    $("#fok").textContent = String(fok).replace(".", ",");
    $("#modNev").textContent = meleg ? "Fűtés" : "Hűtés";
    $("#ivErtek").style.strokeDasharray = `${IV * ((fok - MIN) / (MAX - MIN)) + 0.01} 400`;
    $("#hoLe").disabled = fok <= MIN;
    $("#hoFel").disabled = fok >= MAX;
    $("#modHut").setAttribute("aria-pressed", String(!meleg));
    $("#modFut").setAttribute("aria-pressed", String(meleg));
    termosztat.classList.toggle("meleg", meleg);
    $("#hos").classList.toggle("meleg", meleg);
  }
  if (termosztat) {
    $("#hoLe").addEventListener("click", () => {
      fok = Math.max(MIN, fok - LEPES);
      termRajzol();
    });
    $("#hoFel").addEventListener("click", () => {
      fok = Math.min(MAX, fok + LEPES);
      termRajzol();
    });
    $("#modHut").addEventListener("click", () => {
      meleg = false;
      if (fok > 24) fok = 22;
      termRajzol();
    });
    $("#modFut").addEventListener("click", () => {
      meleg = true;
      if (fok < 20) fok = 22;
      termRajzol();
    });
    termRajzol();
  }

  const urlap = $("#urlap");
  let urlapKezdet = Date.now();
  const EMAIL_RE = /^[^\s@<>()",;:\\]{1,64}@[^\s@<>()",;:\\]{1,190}\.[a-z]{2,24}$/i;
  const TEL_RE = /^[+\d][\d\s()/-]{5,24}$/;
  const mezok = {
    vezeteknev: ["#uVezetek", (v) => (v ? "" : "Kérjük, adja meg a vezetéknevét.")],
    keresztnev: ["#uKereszt", (v) => (v ? "" : "Kérjük, adja meg a keresztnevét.")],
    email: ["#uEmail", (v) => (!v ? "Kérjük, adja meg az e-mail címét." : EMAIL_RE.test(v) ? "" : "Ez nem tűnik érvényes e-mail címnek.")],
    telefon: [
      "#uTelefon",
      (v) => (!v ? ($("#uMod").value === "telefon" ? "A visszahíváshoz kérjük, adja meg a telefonszámát." : "") : TEL_RE.test(v) ? "" : "Kérjük, ellenőrizze a telefonszámot."),
    ],
    uzenet: ["#uUzenet", (v) => (v.length >= 5 ? "" : "Kérjük, írja meg röviden, miben segíthetünk.")],
  };

  function mezoHiba(el, uz) {
    el.setAttribute("aria-invalid", uz ? "true" : "false");
    const h = $("#" + el.id + "Hiba");
    if (h) h.textContent = uz;
  }

  function telefonCimke() {
    const kell = $("#uMod").value === "telefon";
    $("#uTelOpc").hidden = kell;
    $("#uTelefon").required = kell;
    if ($("#uTelefon").getAttribute("aria-invalid") === "true") mezoHiba($("#uTelefon"), mezok.telefon[1]($("#uTelefon").value.trim()));
  }

  if (urlap) {
    $("#uMod").addEventListener("change", telefonCimke);
    telefonCimke();
    Object.values(mezok).forEach(([sel, f]) => {
      const el = $(sel);
      el.addEventListener("blur", () => {
        if (el.value.trim() || el.getAttribute("aria-invalid") === "true") mezoHiba(el, f(el.value.trim()));
      });
      el.addEventListener("input", () => {
        if (el.getAttribute("aria-invalid") === "true") mezoHiba(el, f(el.value.trim()));
      });
    });
    $("#uAdat").addEventListener("change", () => {
      if ($("#uAdat").checked) mezoHiba($("#uAdat"), "");
    });

    urlap.addEventListener("submit", async (e) => {
      e.preventDefault();
      $("#uHiba").hidden = true;
      let elsoHibas = null;
      const adat = {};
      for (const [nev, [sel, f]] of Object.entries(mezok)) {
        const el = $(sel);
        const v = el.value.trim();
        adat[nev] = v;
        const uz = f(v);
        mezoHiba(el, uz);
        if (uz && !elsoHibas) elsoHibas = el;
      }
      const adatEl = $("#uAdat");
      mezoHiba(adatEl, adatEl.checked ? "" : "Az elküldéshez kérjük, fogadja el az adatkezelési tájékoztatót.");
      if (!adatEl.checked && !elsoHibas) elsoHibas = adatEl;
      if (elsoHibas) {
        elsoHibas.focus();
        return;
      }
      adat.mod = $("#uMod").value;
      adat.adatkezeles = true;
      adat.weboldal = $("#uWeb").value;
      adat.ido = Date.now() - urlapKezdet;
      const gomb = $("#uKuld");
      gomb.disabled = true;
      gomb.textContent = "KÜLDÉS…";
      try {
        const r = await fetch("/api/uzenet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(adat),
          signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) throw new Error(d.hiba || "");
        $("#uSikerSzoveg").textContent =
          adat.mod === "email" ? `Hamarosan válaszolunk a(z) ${adat.email} címre.` : `Hamarosan visszahívjuk a(z) ${adat.telefon} számon.`;
        urlap.hidden = true;
        $("#uSiker").hidden = false;
        $("#uSiker").focus();
        urlap.reset();
        telefonCimke();
      } catch (err) {
        const tel = CEG.telefon.trim(), email = CEG.email.trim();
        const alap = err && err.message && !/fetch|network|abort|timeout/i.test(err.message) ? err.message : "Most nem sikerült elküldeni az üzenetet. Kérjük, próbálja újra később.";
        const elerheto = [email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : "", tel ? `<a href="tel:${tel.replace(/[^\d+]/g, "")}">${esc(tel)}</a>` : ""].filter(Boolean).join(", ");
        const h = $("#uHiba");
        h.innerHTML = esc(alap) + (elerheto ? ` Ha sürgős, keressen minket közvetlenül: ${elerheto}.` : "");
        h.hidden = false;
      } finally {
        gomb.disabled = false;
        gomb.textContent = "KÜLDÉS";
      }
    });

    $("#uUjra").addEventListener("click", () => {
      $("#uSiker").hidden = true;
      urlap.hidden = false;
      urlapKezdet = Date.now();
      $("#uVezetek").focus();
    });
  }

  adatok();
  dokumentumok();
  arnyek();
  mutat(utvonal(location.pathname), false);
})();
