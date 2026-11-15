// Spielstand: Auto-Speichern im Browser, Export/Import als JSON.
// Aufbau: gemeinsames Fach + je ein Fach für "gut" und "boese".

const SCHLUESSEL = "the-game-spielstand";
const SCHLUESSEL_SICHERUNG = "the-game-spielstand-sicherung";
export const VERSION = 4;

export function neueSeite(startZeitalter) {
  return {
    zeitalter: startZeitalter,
    waehrungen: {},
    upgrades: {},
    gesamtVerdient: 0,
    level: 1,
    xp: 0,
    kampf: { index: 0, rate: 0 },
    schmiede: { stufe: 0, geschmiedet: 0 },
    waffen: { nah: null, fern: null, aktiv: "nah" },
    tiere: { eier: [], brut: null, sammlung: [], naechsteNr: 1, kaempfer: null, supporter: [] },
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
    };
    const sch = seite.schmiede || {};
    seite.schmiede = {
      stufe: Math.max(0, Math.floor(Number(sch.stufe)) || 0),
      geschmiedet: Math.max(0, Math.floor(Number(sch.geschmiedet)) || 0),
    };
    const w = seite.waffen || {};
    const waffe = (x) =>
      x && typeof x.id === "string" ? { id: x.id, seltenheit: Math.max(0, Math.floor(Number(x.seltenheit)) || 0) } : null;
    seite.waffen = { nah: waffe(w.nah), fern: waffe(w.fern), aktiv: w.aktiv === "fern" ? "fern" : "nah" };
    seite.tiere = tierePruefen(seite.tiere);
    for (const k of Object.keys(seite.waehrungen)) {
      const n = Number(seite.waehrungen[k]);
      seite.waehrungen[k] = Number.isFinite(n) && n > 0 ? n : 0;
    }
    for (const k of Object.keys(seite.upgrades)) {
      const n = Math.floor(Number(seite.upgrades[k]));
      seite.upgrades[k] = Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  if (!Number.isFinite(stand.zuletztGespeichert)) stand.zuletztGespeichert = Date.now();
  stand.version = VERSION; // ältere Spielstände sind jetzt ergänzt
  return null;
}

function tierePruefen(roh) {
  const t = roh || {};
  const stufe = (x) => Math.max(0, Math.floor(Number(x)) || 0);
  const ei = (x) => (x && typeof x.zeitalter === "string" ? { zeitalter: x.zeitalter, seltenheit: stufe(x.seltenheit) } : null);
  const sammlung = (Array.isArray(t.sammlung) ? t.sammlung : [])
    .filter((x) => x && typeof x.id === "string" && Number.isFinite(x.nr))
    .map((x) => ({ nr: x.nr, id: x.id, seltenheit: stufe(x.seltenheit) }));
  const nummern = new Set(sammlung.map((x) => x.nr));
  const brutEi = t.brut ? ei(t.brut.ei) : null;
  return {
    eier: (Array.isArray(t.eier) ? t.eier : []).map(ei).filter(Boolean),
    brut: brutEi && Number.isFinite(t.brut.fertigUm) ? { ei: brutEi, fertigUm: t.brut.fertigUm } : null,
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
