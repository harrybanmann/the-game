// Bilder-Blätter (Version 51, Harry 25.11.2026): Held, Bosse und Gegner kommen aus fertigen Gemini-Blättern.
// Jedes Blatt hat 4 × 2 Bilder: oben Laufen 1–4, unten Schlag 1–4, Blick nach rechts.
// Gegner und Bosse stehen (Warte-Bild = Schlag 1, leichtes Atmen per CSS) und schlagen mit Schlag 1–4 zu.
// Ein Bild-Element zeigt immer nur ein Bild des Blatts (Hintergrund 400 % × 200 %, verschoben).
// data/sprites.json: OW/OH = Zellgröße im Original, AX/AY = Fußpunkt (Körpermitte, Fußlinie) im Original.

const SCHLAG_DAUER = 0.45; // Sekunden für Schlag 1–4 des Helden
const GEGNER_SCHLAG = 0.4;
const LAUF_BILDER_JE_SEK = 8;

const figuren = new Set();
let schleifeLaeuft = false;

function schleife(jetzt) {
  for (const f of figuren) {
    if (!f.el.isConnected) {
      figuren.delete(f);
      continue;
    }
    f.schritt(jetzt / 1000);
  }
  if (figuren.size) requestAnimationFrame(schleife);
  else schleifeLaeuft = false;
}
function anmelden(f) {
  figuren.add(f);
  if (!schleifeLaeuft) {
    schleifeLaeuft = true;
    requestAnimationFrame(schleife);
  }
}

// Eine Figur aus einem Blatt. massstab = CSS-Pixel je Original-Pixel. spiegeln = Blick nach links.
export function blattFigur(eltern, info, src, massstab, spiegeln, art) {
  const el = document.createElement("div");
  el.className = "blatt";
  const b = info.OW * massstab;
  const h = info.OH * massstab;
  el.style.width = b + "px";
  el.style.height = h + "px";
  // Fußpunkt der Zelle liegt genau auf der Mitte der Unterkante des Eltern-Elements.
  el.style.left = `calc(50% - ${(spiegeln ? info.OW - info.AX : info.AX) * massstab}px)`;
  el.style.bottom = -(info.OH - info.AY) * massstab + "px";
  el.style.backgroundImage = `url("${src}")`;
  if (spiegeln) el.style.transform = "scaleX(-1)";
  eltern.append(el);
  let reihe = art === "held" ? 0 : 1;
  let bild = 0;
  let laeuft = false;
  let schlagSeit = -1;
  let schlagDauer = art === "held" ? SCHLAG_DAUER : GEGNER_SCHLAG;
  let jetztS = 0;
  const setze = (r, c) => {
    if (r === reihe && c === bild && el.dataset.f) return;
    reihe = r;
    bild = c;
    el.dataset.f = r + "-" + c;
    el.style.backgroundPosition = `${(c / 3) * 100}% ${r * 100}%`;
  };
  setze(reihe, 0);
  const f = {
    el,
    laufen(an) {
      laeuft = an;
    },
    schlag(dauer) {
      schlagSeit = jetztS;
      if (dauer) schlagDauer = dauer;
    },
    schritt(t) {
      jetztS = t;
      if (schlagSeit >= 0 && t - schlagSeit < schlagDauer) {
        setze(1, Math.min(3, Math.floor(((t - schlagSeit) / schlagDauer) * 4)));
        return;
      }
      schlagSeit = -1;
      if (art === "held") setze(0, laeuft ? Math.floor(t * LAUF_BILDER_JE_SEK) % 4 : 0);
      else setze(1, 0); // stehend: Deckung (Schlag-Bild 1)
    },
  };
  anmelden(f);
  return f;
}

// Daten und Bilder (Zwischenspeicher, damit jedes Blatt nur einmal geladen wird).
let daten = null;
const bilder = {};
function bildLaden(src) {
  if (!bilder[src]) {
    bilder[src] = new Promise((ok) => {
      let versuch = 0;
      const neu = () => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => (++versuch <= 2 ? setTimeout(neu, 400) : ok(null));
        i.src = src + (versuch ? (src.includes("?") ? "&" : "?") + "neu=" + versuch : "");
      };
      neu();
    });
  }
  return bilder[src];
}

export async function blattDatenLaden(version) {
  if (daten) return daten;
  const antwort = await fetch("data/sprites.json?v=" + version);
  daten = await antwort.json();
  return daten;
}
export const blattDaten = () => daten;

// Gegner- und Boss-Blatt für ein Zeitalter (null = keins vorhanden, dann bleibt das alte Bild).
export function gegnerBlatt(nr, boss, sorte) {
  if (!daten) return null;
  if (boss) {
    const i = daten.boss[nr];
    return i ? { info: i, src: `bilder/boss/z${nr}.png` } : null;
  }
  const liste = daten.gegner[nr];
  if (!liste || !liste.length) return null;
  const k = ((sorte || 0) % liste.length + liste.length) % liste.length;
  return { info: liste[k], src: `bilder/gegner/z${nr}-${k + 1}.png` };
}

// Der Held als Blatt; gleiche Schnittstelle wie früher die Puppe (puppe.js).
export function heldBlatt() {
  let figur = null;
  let figurEl = null;
  let za = 0;
  let laeuft = false;
  const warten = [];
  const info = (nr) => daten && daten.held[nr];
  const src = (nr) => `bilder/held/z${nr}.png`;
  const standbilder = {};

  function standbildMachen(nr) {
    bildLaden(src(nr)).then((img) => {
      if (!img) return;
      const i = info(nr);
      const zw = img.width / 4;
      const zh = img.height / 2;
      const c = document.createElement("canvas");
      c.width = 200;
      c.height = 260;
      const g = c.getContext("2d");
      // Ausschnitt um den Körper (Laufbild 1), Füße unten.
      const s = zw / i.OW;
      const breit = 560 * s;
      const hoch = 728 * s;
      const x0 = i.AX * s - breit / 2;
      const y0 = i.AY * s - hoch + 30 * s;
      g.drawImage(img, x0, y0, breit, hoch, 0, 0, 200, 260);
      standbilder[nr] = `url("${c.toDataURL()}")`;
      for (const cb of warten.splice(0)) cb();
    });
  }

  return {
    start() {},
    bereit(cb) {
      warten.push(cb);
    },
    verfuegbar: (nr) => !!info(nr),
    zeigen(el, nr) {
      if (figur && figurEl === el && za === nr && figur.el.isConnected) return;
      if (figur) figur.el.remove();
      figurEl = el;
      el.classList.add("puppe"); // gleiche CSS-Regeln wie die alte Puppe (kein Wippen, Treffer zuckt)
      za = nr;
      const i = info(nr);
      figur = blattFigur(el, i, src(nr), MASS.held, false, "held");
      figur.laufen(laeuft);
      if (!standbilder[nr]) standbildMachen(nr);
    },
    weg() {
      if (figurEl) figurEl.classList.remove("puppe");
      if (figur) figur.el.remove();
      figur = null;
      za = 0;
    },
    aktiv: () => !!figur,
    laufen(an) {
      laeuft = an;
      if (figur) figur.laufen(an);
    },
    schlag() {
      if (figur) figur.schlag();
    },
    block() {},
    blockHalten() {},
    standbild: (nr) => standbilder[nr] || null,
  };
}

// CSS-Pixel je Original-Pixel (Vorschlag; der Held ist dann etwa 120 px groß wie vorher die Puppe).
// Harry 26.11.2026: Figuren viel zu groß, auf etwa 60 % verkleinert.
export const MASS = { held: 0.12, gegner: 0.1, anfuehrer: 0.12, boss: 0.145 };
