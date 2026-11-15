// Spielstand: Auto-Speichern im Browser, Export/Import als JSON.
// Aufbau: gemeinsames Fach + je ein Fach für "gut" und "boese".

const SCHLUESSEL = "the-game-spielstand";
const SCHLUESSEL_SICHERUNG = "the-game-spielstand-sicherung";
export const VERSION = 2;

export function neueSeite(startZeitalter) {
  return {
    zeitalter: startZeitalter,
    waehrungen: {},
    upgrades: {},
    gesamtVerdient: 0,
    level: 1,
    xp: 0,
    kampf: { index: 0, rate: 0 },
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
