// Spielstand: Auto-Speichern im Browser, Export/Import als JSON.
// Aufbau: gemeinsames Fach + je ein Fach für "gut" und "boese".

const SCHLUESSEL = "the-game-spielstand";
const SCHLUESSEL_SICHERUNG = "the-game-spielstand-sicherung";
export const VERSION = 20;

export function neueSeite(startZeitalter) {
  return {
    zeitalter: startZeitalter,
    waehrungen: {},
    upgrades: {},
    gesamtVerdient: 0,
    level: 1,
    xp: 0,
    kampf: { index: 0, rate: 0, raten: {}, stufe: 1, welle: 1 },
    schmiede: { stufe: 0, geschmiedet: 0, geschmiedetZA: 0, ausbauBis: null },
    waffen: { waffe: null, stil: null },
    ruestung: { helm: null, handschuhe: null, ruestung: null, stiefel: null },
    schmuck: { ring1: null, ring2: null, amulett: null, guertel: null },
    lager: [],
    traenke: 0,
    trading: { kurse: {}, positionen: [], letzter: 0, dividendeLetzter: 0 },
    farm: { rechner: {}, teile: {}, letzter: 0 },
    btcMarkt: { faktor: 1, crashBis: 0, vorCrash: 1, letzter: 0 },
    haushalt: { schulden: 0, firma: 0, letzter: 0 },
    btc: { menge: 0, kasse: 0, upgrades: {}, letzterRueckfluss: 0 },
    faehigkeiten: { punkte: 0, sammlung: [], ausgeruestet: [] },
    dungeons: { schluessel: 0, stufe: {} },
    sets: { sammlung: [], an: { helm: null, ruestung: null, handschuhe: null, waffe: null, stiefel: null, amulett: null } },
    tiere: { eier: [], brueten: [], sammlung: [], naechsteNr: 1, kaempfer: null, supporter: [] },
    reittiere: { sammlung: [], naechsteNr: 1, aktiv: null },
  };
}

export function neuerStand(startZeitalter) {
  return {
    spiel: "the-game",
    version: VERSION,
    zuletztGespeichert: Date.now(),
    aktiveSeite: "gut",
    gemeinsam: {
      einstellungen: {},
      figur: { name: "", aussehen: {} },
      tech: { punkte: 0, stufen: {}, laeuft: {} },
      perma: { punkte: 0, stufen: {}, neustarts: 0 },
      energie: { wert: 0, letzter: Date.now() },
      sammelbuch: { tiere: {}, reittiere: {}, sets: {} },
    },
    seiten: {
      gut: neueSeite(startZeitalter),
      boese: null,
    },
  };
}

export function pruefen(stand) {
  if (!stand || typeof stand !== "object") return "Das ist kein Spielstand.";
  if (stand.spiel !== "the-game") return "Das ist kein Spielstand von The Game.";
  if (typeof stand.version !== "number" || stand.version > VERSION) return "Der Spielstand ist von einer neueren Version.";
  if (!stand.seiten || !stand.seiten.gut || !stand.gemeinsam) return "Im Spielstand fehlen Fächer.";
  if (stand.aktiveSeite !== "gut" && stand.aktiveSeite !== "boese") return "Im Spielstand fehlt die aktive Seite.";
  if (!stand.seiten[stand.aktiveSeite]) return "Die aktive Seite ist leer.";
  for (const seite of [stand.seiten.gut, stand.seiten.boese]) {
    if (!seite) continue;
    if (typeof seite.zeitalter !== "string") return "Im Spielstand fehlt das Zeitalter.";
    seite.waehrungen = seite.waehrungen || {};
    seite.upgrades = seite.upgrades || {};
    seite.gesamtVerdient = Number(seite.gesamtVerdient) || 0;
    seite.level = Math.max(1, Math.floor(Number(seite.level)) || 1);
    seite.xp = Math.max(0, Number(seite.xp) || 0);
    const k = seite.kampf || {};
    seite.kampf = {
      index: Math.max(0, Math.floor(Number(k.index)) || 0),
      rate: Math.max(0, Number(k.rate) || 0),
      raten: Object.fromEntries(["schwach", "normal", "elite", "xp"].map((a) => [a, Math.max(0, Number(k.raten && k.raten[a]) || 0)])),
      stufe: Math.max(1, Math.floor(Number(k.stufe)) || 1),
      welle: Math.max(1, Math.floor(Number(k.welle)) || 1),
    };
    const sch = seite.schmiede || {};
    seite.schmiede = {
      stufe: Math.max(0, Math.floor(Number(sch.stufe)) || 0),
      geschmiedet: Math.max(0, Math.floor(Number(sch.geschmiedet)) || 0),
      geschmiedetZA: Math.max(0, Math.floor(Number(sch.geschmiedetZA)) || 0), // Schmieden im jetzigen Zeitalter (Preis steigt)
      ausbauBis: Number.isFinite(sch.ausbauBis) ? sch.ausbauBis : null,
    };
    const w = seite.waffen || {};
    const waffe = (x) =>
      x && typeof x.id === "string"
        ? {
            id: x.id,
            seltenheit: Math.max(0, Math.floor(Number(x.seltenheit)) || 0),
            sterne: Math.max(0, Math.floor(Number(x.sterne)) || 0),
          }
        : null;
    // Früher zwei Waffen (nah und fern), jetzt eine: die seltenere bleibt angelegt, die andere geht ins Lager.
    const alteWaffen = [waffe(w.nah), waffe(w.fern)].filter(Boolean).sort((a, b) => b.seltenheit - a.seltenheit || b.sterne - a.sterne);
    const uebrig = waffe(w.waffe) ? alteWaffen : alteWaffen.slice(1);
    seite.waffen = { waffe: waffe(w.waffe) || alteWaffen[0] || null, stil: w.stil === "nah" || w.stil === "fern" ? w.stil : null };
    const r = seite.ruestung || {};
    seite.ruestung = { helm: waffe(r.helm), handschuhe: waffe(r.handschuhe), ruestung: waffe(r.ruestung), stiefel: waffe(r.stiefel) };
    const sm = seite.schmuck || {};
    seite.schmuck = { ring1: waffe(sm.ring1), ring2: waffe(sm.ring2), amulett: waffe(sm.amulett), guertel: waffe(sm.guertel) };
    seite.lager = (Array.isArray(seite.lager) ? seite.lager : [])
      .map((x) => {
        const stueck = waffe(x);
        const anzahl = Math.floor(Number(x && x.anzahl)) || 0;
        return stueck && anzahl > 0 ? { ...stueck, anzahl } : null;
      })
      .filter(Boolean);
    for (const alt of uebrig) seite.lager.push({ ...alt, anzahl: 1 });
    seite.tiere = tierePruefen(seite.tiere);
    const rt = seite.reittiere || {};
    const rtListe = (Array.isArray(rt.sammlung) ? rt.sammlung : [])
      .filter((x) => x && typeof x.id === "string" && Number.isFinite(x.nr))
      .map((x) => ({ nr: x.nr, id: x.id, seltenheit: Math.max(0, Math.floor(Number(x.seltenheit)) || 0), sterne: Math.max(0, Math.floor(Number(x.sterne)) || 0) }));
    seite.reittiere = {
      sammlung: rtListe,
      naechsteNr: Math.max(1, Math.floor(Number(rt.naechsteNr)) || 1, ...rtListe.map((x) => x.nr + 1)),
      aktiv: rtListe.some((x) => x.nr === rt.aktiv) ? rt.aktiv : null,
    };
    seite.traenke = Math.max(0, Math.floor(Number(seite.traenke)) || 0);
    const zahl = (x, std) => (Number.isFinite(Number(x)) ? Number(x) : std);
    const zaehlen = (o) => {
      const aus = {};
      for (const [k, v] of Object.entries(o || {})) {
        const n = Math.floor(Number(v));
        if (Number.isFinite(n) && n > 0) aus[k] = n;
      }
      return aus;
    };
    const trd = seite.trading || {};
    const kurse = {};
    for (const [id, k] of Object.entries(trd.kurse || {}))
      if (k && Number(k.preis) > 0)
        kurse[id] = { preis: Number(k.preis), verlauf: (Array.isArray(k.verlauf) ? k.verlauf : []).map(Number).filter((x) => x > 0).slice(-60) };
    seite.trading = {
      kurse,
      positionen: (Array.isArray(trd.positionen) ? trd.positionen : [])
        .filter((p) => p && typeof p.wert === "string" && Number(p.einsatz) > 0 && Number(p.einstieg) > 0)
        .map((p) => ({ wert: p.wert, richtung: p.richtung === "short" ? "short" : "long", einsatz: Number(p.einsatz), einstieg: Number(p.einstieg), seit: zahl(p.seit, 0) })),
      letzter: zahl(trd.letzter, 0),
      dividendeLetzter: zahl(trd.dividendeLetzter, 0),
    };
    const frm = seite.farm || {};
    seite.farm = { rechner: zaehlen(frm.rechner), teile: zaehlen(frm.teile), letzter: zahl(frm.letzter, 0) };
    const mkt = seite.btcMarkt || {};
    seite.btcMarkt = {
      faktor: Math.max(0.01, zahl(mkt.faktor, 1)),
      crashBis: zahl(mkt.crashBis, 0),
      vorCrash: Math.max(0.01, zahl(mkt.vorCrash, 1)),
      letzter: zahl(mkt.letzter, 0),
    };
    const hh = seite.haushalt || {};
    seite.haushalt = {
      schulden: Math.max(0, Number(hh.schulden) || 0),
      firma: Math.max(0, Math.floor(Number(hh.firma)) || 0),
      letzter: Number.isFinite(hh.letzter) ? hh.letzter : 0,
    };
    const bt = seite.btc || {};
    const ups = {};
    for (const [platz, n] of Object.entries(bt.upgrades || {})) {
      const st = Math.floor(Number(n));
      if (Number.isFinite(st) && st > 0) ups[platz] = st;
    }
    // Händler-Stufen der alten Plätze nah/fern gelten jetzt für die eine Waffe (die höhere zählt).
    if (ups.nah || ups.fern) ups.waffe = Math.max(ups.waffe || 0, ups.nah || 0, ups.fern || 0);
    delete ups.nah;
    delete ups.fern;
    seite.btc = {
      menge: Math.max(0, Number(bt.menge) || 0),
      kasse: Math.max(0, Number(bt.kasse) || 0),
      upgrades: ups,
      letzterRueckfluss: Number.isFinite(bt.letzterRueckfluss) ? bt.letzterRueckfluss : 0,
    };
    const fa = seite.faehigkeiten || {};
    const ganz = (x, min) => Math.max(min, Math.floor(Number(x)) || 0);
    const sammlung = (Array.isArray(fa.sammlung) ? fa.sammlung : [])
      .filter((x) => x && typeof x.id === "string")
      .map((x) => {
        const e = { id: x.id, level: ganz(x.level, 1), sterne: ganz(x.sterne, 0), kopien: ganz(x.kopien, 0) };
        if (Number.isFinite(x.q)) e.q = ganz(x.q, 0); // Qualität (ab Version 38); alte Einträge bekommen sie beim ersten Laden
        return e;
      });
    // Ab Version 38 heißt jeder Eintrag id@q; ältere Spielstände haben nur die id (das Fähigkeiten-System wandelt sie um).
    const ids = new Set(sammlung.map((x) => (Number.isFinite(x.q) ? x.id + "@" + x.q : x.id)));
    seite.faehigkeiten = {
      punkte: ganz(fa.punkte, 0),
      sammlung,
      ausgeruestet: (Array.isArray(fa.ausgeruestet) ? fa.ausgeruestet : []).filter((id) => ids.has(id)),
    };
    if (fa.v2) seite.faehigkeiten.v2 = true;
    // Dungeons (V30): Schlüssel statt Tages-Tickets, Stufe je Zeitalter. Alte Tickets werden zu Schlüsseln,
    // die alten Dungeons (Eier-Höhle, Waffenkammer, Schatzkammer) und ihre Stufen fallen weg.
    const du = seite.dungeons || {};
    const ALT = ["eier", "ausruestung", "schatz"];
    let schluessel = Math.floor(Number(du.schluessel));
    if (!Number.isFinite(schluessel)) schluessel = Object.values(du.tickets || {}).reduce((a, n) => a + (Math.floor(Number(n)) || 0), 0);
    const dStufe = {};
    for (const [k, v] of Object.entries(du.stufe || {})) {
      const n = Math.floor(Number(v));
      if (!ALT.includes(k) && Number.isFinite(n) && n >= 1) dStufe[k] = n;
    }
    seite.dungeons = { schluessel: Math.max(0, Math.min(Number.isFinite(Number(du.schluessel)) ? 999 : 30, schluessel || 0)), stufe: dStufe };
    const se = seite.sets || {};
    const teil = (x) =>
      x && typeof x.z === "string" && typeof x.teil === "string" ? { z: x.z, teil: x.teil, seltenheit: Math.max(0, Math.floor(Number(x.seltenheit)) || 0) } : null;
    const an = se.an || {};
    seite.sets = {
      sammlung: (Array.isArray(se.sammlung) ? se.sammlung : [])
        .map((x) => {
          const t = teil(x);
          const n = Math.floor(Number(x && x.anzahl)) || 0;
          return t && n > 0 ? { ...t, anzahl: n } : null;
        })
        .filter(Boolean),
      an: { helm: teil(an.helm), ruestung: teil(an.ruestung), handschuhe: teil(an.handschuhe), waffe: teil(an.waffe), stiefel: teil(an.stiefel), amulett: teil(an.amulett) },
    };
    for (const k of Object.keys(seite.waehrungen)) {
      const n = Number(seite.waehrungen[k]);
      seite.waehrungen[k] = Number.isFinite(n) && n > 0 ? n : 0;
    }
    for (const k of Object.keys(seite.upgrades)) {
      const n = Math.floor(Number(seite.upgrades[k]));
      seite.upgrades[k] = Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  // Tech-Baum ist für Gut und Böse gemeinsam (Harry 16.11.2026). Alte Spielstände hatten ihn je Seite:
  // Punkte werden zusammengezählt, je Knoten gilt die höhere Stufe, laufende Forschungen bleiben erhalten.
  const quellen = [stand.gemeinsam.tech, stand.seiten.gut && stand.seiten.gut.tech, stand.seiten.boese && stand.seiten.boese.tech].filter(Boolean);
  const tech = { punkte: 0, stufen: {}, laeuft: {} };
  for (const te of quellen) {
    tech.punkte += Math.max(0, Math.floor(Number(te.punkte)) || 0);
    for (const [id, n] of Object.entries(te.stufen || {})) {
      const v = Math.floor(Number(n));
      if (Number.isFinite(v) && v > 0) tech.stufen[id] = Math.min(5, Math.max(tech.stufen[id] || 0, v));
    }
    for (const [astId, l] of Object.entries(te.laeuft || {}))
      if (!tech.laeuft[astId] && l && typeof l.knoten === "string" && Number.isFinite(l.bis)) tech.laeuft[astId] = { knoten: l.knoten, bis: l.bis };
  }
  stand.gemeinsam.tech = tech;
  for (const seite of [stand.seiten.gut, stand.seiten.boese]) if (seite) delete seite.tech;
  if (!Number.isFinite(stand.zuletztGespeichert)) stand.zuletztGespeichert = Date.now();
  const fig = stand.gemeinsam.figur || {};
  const au = fig.aussehen || {};
  stand.gemeinsam.figur = {
    name: typeof fig.name === "string" ? fig.name : "",
    aussehen: {
      besitz: Array.isArray(au.besitz) && au.besitz.length ? au.besitz.filter((x) => typeof x === "string") : ["blau"],
      aktiv: typeof au.aktiv === "string" ? au.aktiv : "blau",
    },
  };
  // Version 34 (Harry 16.11.2026): Perma-Baum, Energie und Sammelbuch, für beide Seiten gemeinsam.
  const pe = stand.gemeinsam.perma || {};
  const zahlOder0 = (x) => Math.max(0, Math.floor(Number(x)) || 0);
  stand.gemeinsam.perma = {
    punkte: zahlOder0(pe.punkte),
    neustarts: zahlOder0(pe.neustarts),
    stufen: Object.fromEntries(Object.entries(pe.stufen || {}).filter(([k, v]) => typeof k === "string" && Number(v) > 0).map(([k, v]) => [k, zahlOder0(v)])),
  };
  const en = stand.gemeinsam.energie || {};
  stand.gemeinsam.energie = { wert: Math.min(100, zahlOder0(en.wert)), letzter: Number.isFinite(en.letzter) ? en.letzter : Date.now() };
  const sb = stand.gemeinsam.sammelbuch || {};
  const fach = (x) => Object.fromEntries(Object.entries(x && typeof x === "object" ? x : {}).filter(([k, v]) => typeof k === "string" && Number.isFinite(v)).map(([k, v]) => [k, zahlOder0(v)]));
  stand.gemeinsam.sammelbuch = { tiere: fach(sb.tiere), reittiere: fach(sb.reittiere), sets: fach(sb.sets) };
  stand.version = VERSION; // ältere Spielstände sind jetzt ergänzt
  return null;
}

function tierePruefen(roh) {
  const t = roh || {};
  const stufe = (x) => Math.max(0, Math.floor(Number(x)) || 0);
  const ei = (x) => (x && typeof x.zeitalter === "string" ? { zeitalter: x.zeitalter, seltenheit: stufe(x.seltenheit) } : null);
  const sammlung = (Array.isArray(t.sammlung) ? t.sammlung : [])
    .filter((x) => x && typeof x.id === "string" && Number.isFinite(x.nr))
    .map((x) => ({ nr: x.nr, id: x.id, seltenheit: stufe(x.seltenheit), sterne: stufe(x.sterne) }));
  const nummern = new Set(sammlung.map((x) => x.nr));
  // Früher gab es nur einen Brutkasten (brut), jetzt mehrere Plätze (brueten).
  const roheBrut = (Array.isArray(t.brueten) ? t.brueten : []).concat(t.brut ? [t.brut] : []);
  const brueten = roheBrut
    .map((b) => (b && ei(b.ei) && Number.isFinite(b.fertigUm) ? { ei: ei(b.ei), fertigUm: b.fertigUm } : null))
    .filter(Boolean);
  return {
    eier: (Array.isArray(t.eier) ? t.eier : []).map(ei).filter(Boolean),
    brueten,
    sammlung,
    naechsteNr: Math.max(1, stufe(t.naechsteNr), ...sammlung.map((x) => x.nr + 1)),
    kaempfer: nummern.has(t.kaempfer) ? t.kaempfer : null,
    supporter: (Array.isArray(t.supporter) ? t.supporter : []).filter((nr) => nummern.has(nr)),
  };
}

export function laden() {
  try {
    const text = localStorage.getItem(SCHLUESSEL);
    if (!text) return null;
    const stand = JSON.parse(text);
    return pruefen(stand) ? null : stand;
  } catch {
    return null;
  }
}

export function speichern(stand) {
  stand.zuletztGespeichert = Date.now();
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(stand));
    return true;
  } catch {
    return false;
  }
}

export function sichern(stand) {
  try {
    localStorage.setItem(SCHLUESSEL_SICHERUNG, JSON.stringify(stand));
  } catch {
    /* Sicherung ist nur ein Zusatz */
  }
}

// Die Sicherung (wird vor „Alles löschen“ und vor einem Neustart angelegt) lesen; null, wenn keine da ist.
export function sicherungLaden() {
  try {
    const text = localStorage.getItem(SCHLUESSEL_SICHERUNG);
    if (!text) return null;
    const stand = JSON.parse(text);
    return pruefen(stand) ? null : stand;
  } catch {
    return null;
  }
}

export function alsText(stand) {
  stand.zuletztGespeichert = Date.now();
  return JSON.stringify(stand, null, 2);
}

export function ausText(text) {
  let stand;
  try {
    stand = JSON.parse(text);
  } catch {
    return { fehler: "Der Text ist kein gültiges JSON." };
  }
  const fehler = pruefen(stand);
  return fehler ? { fehler } : { stand };
}

export function loeschen() {
  try {
    localStorage.removeItem(SCHLUESSEL);
  } catch {
    /* nichts zu tun */
  }
}
