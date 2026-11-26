import { zahl, btc, dauer } from "./format.js?v=88";
import * as speicher from "./speicher.js?v=88";
import { kampfSystem } from "./kampf.js?v=88";
import { waffenSystem } from "./waffen.js?v=88";
import { tierSystem } from "./tiere.js?v=88";
import { dungeonSystem } from "./dungeons.js?v=88";
import { faehigkeitenSystem } from "./faehigkeiten.js?v=88";
import { bitcoinSystem } from "./bitcoin.js?v=88";
import { techSystem } from "./tech.js?v=88";
import * as grafik from "./grafik.js?v=88";
import { haushaltSystem } from "./haushalt.js?v=88";
import { farmSystem } from "./farm.js?v=88";
import { reittierSystem } from "./reittiere.js?v=88";
import { setSystem } from "./sets.js?v=88";
import { permaSystem } from "./perma.js?v=88";
import { heldBlatt, blattDatenLaden, gegnerBlatt, blattFigur, MASS } from "./blatt.js?v=88";

const $ = (id) => document.getElementById(id);

let daten; // { einstellungen, zeitalter[], upgrades[], gegner{} }
let stand; // Spielstand
let kampf; // Kampf-System
let waffen; // Schmiede und Waffen
let tiere; // Tiere und Eier
let dungeons; // Dungeons und Tickets
let faehigkeiten; // Fähigkeiten
let bitcoin; // Bitcoin und Händler
let tech; // Tech-Baum
let haushalt; // Haushalt und Firma
let farm; // Trading, Mining Farm, BTC-Markt
let reittiere; // Reittiere (Angriffstempo)
let sets; // Set-Teile aus den Dungeons
// Harry 18.11.2026: Reittiere sind im Kampf nicht zu sehen (Held als Puppe); ihre Boni gelten weiter.
const REITTIER_SICHTBAR = false;
const puppe = heldBlatt(); // Held aus den 12 Bilder-Blättern (Version 51, Harry 25.11.2026)
let perma; // Perma-Baum (Punkte nur durch Neustart)
let sammelTakt = 0;
let farmReiter = "trading";
let techAst = "produktion";
let gewaehltesStueck = null; // { platz } oder { roh } (Lager)
let letzterTick = Date.now();
let letztesSpeichern = Date.now();

// ---------- Daten laden (alle Inhalte kommen aus JSON) ----------

async function json(pfad) {
  const antwort = await fetch(pfad, { cache: "no-cache" });
  if (!antwort.ok) throw new Error(pfad + " konnte nicht geladen werden");
  return antwort.json();
}

async function datenLaden() {
  const [einstellungen, zeitalter, upgrades, gegner, waffenDaten, tierDaten, dungeonDaten, faehigkeitDaten, btcDaten, techDaten, haushaltDaten, farmDaten, reittierDaten, permaDaten] = await Promise.all([
    json("data/einstellungen.json"),
    json("data/zeitalter.json"),
    json("data/upgrades.json"),
    json("data/gegner.json"),
    json("data/waffen.json"),
    json("data/tiere.json"),
    json("data/dungeons.json"),
    json("data/faehigkeiten.json"),
    json("data/bitcoin.json"),
    json("data/tech.json"),
    json("data/haushalt.json"),
    json("data/farm.json"),
    json("data/reittiere.json"),
    json("data/perma.json"),
  ]);
  return {
    einstellungen,
    zeitalter,
    upgrades,
    gegner,
    waffen: waffenDaten,
    tiere: tierDaten,
    dungeons: dungeonDaten,
    faehigkeiten: faehigkeitDaten,
    bitcoin: btcDaten,
    tech: techDaten,
    haushalt: haushaltDaten,
    farm: farmDaten,
    reittiere: reittierDaten,
    perma: permaDaten,
  };
}

// ---------- Rechnen ----------

const seite = () => stand.seiten[stand.aktiveSeite];
const zeitalter = () => daten.zeitalter.find((z) => z.id === seite().zeitalter) || daten.zeitalter[0];
const waehrung = () => zeitalter().waehrung;
// Das Sammeln per Fingertipp gibt es nicht mehr (Harry 16.11.2026), deshalb fehlen die Tipp-Upgrades in der Liste.
// Harry 16.11.2026: 10 Kampf-Werte als Upgrades; die neuen kommen nach und nach (abZeitalter).
const upgradesHier = () =>
  daten.upgrades.filter((u) => u.wirkung !== "klick" && (!u.zeitalter || u.zeitalter === zeitalter().id) && zeitalter().nummer >= (u.abZeitalter || 1));
const upgradeName = (u) => (u.namen && u.namen[zeitalter().id]) || u.name;
const upgradeText = (u) =>
  u.jeZeitalterFaktor && zeitalter().nummer > 1
    ? u.text.replace(/^\+[\d,]+/, "+" + zahl(upgradeWert(u))).replace("{w}", waehrung().name)
    : u.text.replace("{w}", waehrung().name);
const stufe = (u) => seite().upgrades[u.id] || 0;
// Harry 17.11.2026: Jedes Zeitalter erweitert die Upgrades um 100 Stufen (1. bis 100, 2. bis 200 …), die alten Stufen bleiben.
// Die Kosten beginnen mit jedem Zeitalter wieder von vorn (neue Währung), jede Stufe zählt mit dem Wert ihres Zeitalters.
const capOf = (u) => (u.zeitalter ? u.maxStufe : u.maxStufe * Math.max(1, zeitalter().nummer - (u.abZeitalter || 1) + 1));
const bandVon = (u, st) => (u.zeitalter ? 0 : Math.floor(st / u.maxStufe));
const kosten = (u) =>
  Math.ceil(u.grundKosten * Math.pow(u.kostenFaktor, stufe(u) - bandVon(u, stufe(u)) * u.maxStufe) * (1 - Math.min(0.6, tech ? tech.wert("rabatt") : 0)));
const guthaben = () => seite().waehrungen[waehrung().id] || 0;
// Kurs der Zeitalter-Währung in ₿: wird BTC mehr wert, gibt es weniger ₿ pro Einheit.
const btcKurs = () => waehrung().btcProStueck / (farm ? farm.marktFaktor() : 1);

// Inhalte kommen nach und nach (Harry 16.11.2026): je System ein Zeitalter oder Level, ab dem es offen ist.
function frei(name) {
  const f = daten.einstellungen.freischalten[name];
  if (!f) return true;
  return seite().level >= (f.level || 1) && zeitalter().nummer >= (f.zeitalter || 1);
}
const freiListe = () => Object.keys(daten.einstellungen.freischalten).filter((n) => n[0] !== "_" && frei(n));
let freiVorher = null;

// Meldet neu freigeschaltete Systeme (z. B. durch ein Level) und zeichnet die Leiste neu.
function freiPruefen() {
  const jetzt = freiListe();
  const k = jetzt.join(",");
  if (k === freiVorher) return;
  const alt = freiVorher === null ? null : freiVorher.split(",");
  freiVorher = k;
  leisteZeichnen();
  if (!alt) return;
  const neu = jetzt.filter((n) => !alt.includes(n));
  if (!neu.length) return;
  freiBelohnen(neu);
  const f = daten.einstellungen.freischalten;
  hinweis("Neu: " + neu.map((n) => f[n].name).join(", "), neu.map((n) => f[n].text).join(" "), "");
}

// Kleine Starthilfe beim Freischalten: das erste Ei gibt es geschenkt.
function freiBelohnen(neu) {
  const t = seite().tiere;
  if (neu.includes("tiere") && !t.eier.length && !t.brueten.length && !t.sammlung.length) tiere.eiGeben(daten.tiere.eiRatio.normal, 0);
}

// Schaden und Leben aus Upgrades bringen je Zeitalter 10× mehr (Harry 16.11.2026: neue Währung ist 10× mehr wert).
const upgradeWert = (u) => u.wertProStufe * Math.pow(u.jeZeitalterFaktor || 1, (u.zeitalter ? zeitalter().nummer : (u.abZeitalter || 1)) - 1 + bandVon(u, Math.min(stufe(u), capOf(u) - 1)));
// Gesamtwert aller gekauften Stufen: jede Stufe zählt mit dem Faktor des Zeitalters, in dem sie gekauft wurde.
function upgradeSumme(u) {
  const f = u.jeZeitalterFaktor || 1;
  const b0 = (u.zeitalter ? zeitalter().nummer : u.abZeitalter || 1) - 1;
  if (u.zeitalter) return u.wertProStufe * f ** b0 * stufe(u);
  let rest = stufe(u);
  let summe = 0;
  for (let b = 0; rest > 0; b++) {
    const c = Math.min(u.maxStufe, rest);
    summe += c * f ** (b0 + b);
    rest -= c;
  }
  return summe * u.wertProStufe;
}
function summe(wirkung) {
  return upgradesHier()
    .filter((u) => u.wirkung === wirkung)
    .reduce((s, u) => s + upgradeSumme(u), 0);
}
// Fortschritt zum Aufstieg: alle Upgrades des Zeitalters auf Höchststufe (Harry 16.11.2026: Lv 100).
function upgradeFortschritt() {
  const liste = upgradesHier();
  const hat = liste.reduce((s, u) => s + Math.min(stufe(u), capOf(u)), 0);
  const max = liste.reduce((s, u) => s + capOf(u), 0);
  return { hat, max, voll: liste.filter((u) => stufe(u) >= capOf(u)).length, anzahl: liste.length };
}

const klickWert = () => (zeitalter().klickGrundwert + summe("klick")) * (1 + tech.wert("produktion"));
const proSekunde = () => summe("proSekunde") * (1 + tech.wert("produktion"));
// Harry 17.11.2026: Dauerhafte Aufstiegs-Boni (Perma-Baum) wirken im ersten Zeitalter voll und nehmen bis zum letzten ab.
const fruehAnteil = () => (13 - Math.min(12, Math.max(1, zeitalter().nummer))) / 12;
const tempoFaktor = () => 1 + (perma ? perma.wert("zeitalterTempo") * fruehAnteil() : 0);
const fruehFaktor = () => 1 + (perma ? perma.wert("fruehStaerke") * fruehAnteil() : 0);
function schaden() {
  const b = waffen.bonus();
  const tb = tiere.bonus();
  const grund = daten.einstellungen.kampf.grundSchaden + summe("schaden") + b.schaden + tb.schaden;
  return grund * (1 + tb.schadenProzent) * (1 + b.schmuckSet) * (1 + tech.wert("schaden")) * (1 + setBonus().schaden) * fruehFaktor();
}
function setBonus() {
  if (!sets || !frei("dungeons")) return { schaden: 0, leben: 0, setTeile: 0, setBonus: 0, extra: {}, zaehler: {}, stufen: {}, dominant: null };
  const b = sets.bonus();
  const f = 1 + tech.wert("setStaerke");
  return { ...b, schaden: b.schaden * f, leben: b.leben * f };
}
// Zusatz-Boni der Sets (Krit, Tempo, Geld, Drops …).
const setExtra = (id) => (setBonus().extra && setBonus().extra[id]) || 0;
// Zweiter Bonus des gesattelten Reittiers (Heilung, Schlüssel, Eier, Fähigkeitspunkte).
const reittierBonus = (art) => (reittiere && frei("reittiere") ? reittiere.bonus(art) : 0);
const REITTIER_BONUS = {
  heilung: (w) => "Heilung +" + prozent(w) + " Leben/Sek.",
  schluessel: (w) => "Schlüssel-Chance +" + prozent(w),
  eier: (w) => "Eier-Chance +" + prozent(w),
  fpunkte: (w) => "★-Chance +" + prozent(w),
};
const traenkeMax = () => 0; // Heiltränke entfallen (Harry 25.11.2026)
// Die eine Waffe bestimmt den Kampfstil; die Zusatzwerte (Block, Tempo …) kommen von der ganzen Ausrüstung.
function kampfWerte() {
  const b = waffen.bonus();
  const z = b.zusatz;
  // Zusatzwerte der Ausrüstung plus Upgrades, gedeckelt wie bei der Ausrüstung.
  const deckel = (id) => ((daten.waffen.zusatzWerte || []).find((x) => x.id === id) || { max: 1 }).max;
  const wert = (id) => Math.min(deckel(id), (z[id] || 0) + summe(id) + setExtra(id));
  return {
    art: b.kampfArt,
    kombi: false,
    hand: b.hand,
    block: wert("block"),
    krit: wert("krit"),
    raub: wert("raub"),
    ausweichen: wert("ausweichen"),
    tempo: wert("tempo"),
    kritSchaden: summe("kritSchaden") + setExtra("kritSchaden"),
    regeneration: summe("regeneration") + setExtra("regeneration") + reittierBonus("heilung"),
    zweihandReichweite: daten.waffen.zweihandReichweite,
    zweihandNebenschaden: daten.waffen.zweihandNebenschaden,
  };
}
const angriffsTempo = () => (reittiere && frei("reittiere") ? reittiere.tempo() : 0) + kampfWerte().tempo;
// Eine Zahl für die Gesamtstärke (wie beim Vergleich der Stücke: Schaden zählt fünffach).
const staerke = () => schaden() * 5 * (1 + angriffsTempo()) + maxLeben();
function maxLeben() {
  const tb = tiere.bonus();
  const b = waffen.bonus();
  const grund = daten.einstellungen.kampf.grundLeben + summe("leben") + b.leben + tb.leben;
  return grund * (1 + tb.lebenProzent) * (1 + b.lebenProzent) * (1 + b.schmuckSet) * (1 + tech.wert("leben")) * (1 + setBonus().leben) * fruehFaktor();
}
const gegnerDaten = () => daten.gegner[zeitalter().id];
const xpBedarf = (level) =>
  Math.round(daten.einstellungen.level.grundXp * Math.pow(daten.einstellungen.level.faktor, level - 1));

function gutschreiben(menge) {
  if (!(menge > 0)) return;
  if (haushalt) menge = haushalt.einnahme(menge);
  const s = seite();
  s.waehrungen[waehrung().id] = guthaben() + menge;
  s.gesamtVerdient += menge;
}

function bezahlen(preis) {
  if (guthaben() < preis) return false;
  seite().waehrungen[waehrung().id] = guthaben() - preis;
  return true;
}

function xpGeben(menge) {
  menge *= (1 + (perma ? perma.wert("xp") : 0)) * tempoFaktor() * (1 + setExtra("xp"));
  const s = seite();
  s.xp += menge;
  while (s.xp >= xpBedarf(s.level)) {
    s.xp -= xpBedarf(s.level);
    s.level += 1;
  }
}

// ---------- Zeit: aktiv und offline ----------

function tick() {
  if (testModus) testAuffuellen();
  const jetzt = Date.now();
  const sekunden = Math.max(0, (jetzt - letzterTick) / 1000);
  letzterTick = jetzt;
  const off = daten.einstellungen.offline;

  const energieVorher = stand.gemeinsam.energie.wert;
  energieSchritt(jetzt);
  if (++sammelTakt % 20 === 0) sammelbuchPruefen();
  if (sekunden >= off.abSekunden) {
    // Spiel war zu oder im Hintergrund: Formel statt Einzel-Schritte, mit Obergrenze.
    const gezaehlt = Math.min(sekunden, offlineMaxStunden() * 3600);
    const menge = (proSekunde() + seite().kampf.rate) * gezaehlt * offlineAnteil();
    gutschreiben(menge);
    const beute = offlineBeute(gezaehlt);
    beute.energie = stand.gemeinsam.energie.wert - energieVorher;
    if (sekunden >= off.meldungAbSekunden) offlineMeldung(sekunden, gezaehlt, menge, beute);
    sichern();
  } else {
    gutschreiben(proSekunde() * sekunden);
    kampf.schritt(sekunden);
  }

  for (const n of farm.schritt(jetzt)) if (!$("farm-fenster").hidden) kurzMeldung(n);
  if (!$("farm-fenster").hidden) farmZeichnen(false);
  if (frei("haushalt")) haushalt.schritt(jetzt, Math.min(24, off.maxStunden + tech.wert("offline")) * 3600);
  else seite().haushalt.letzter = jetzt; // gesperrt: Uhr mitlaufen lassen, damit es beim Freischalten keinen Nachschlag gibt
  if (!$("haushalt-fenster").hidden) haushaltZeichnen();
  for (const name of tech.schritt(jetzt)) {
    kurzMeldung("Forschung fertig: " + name);
    if (!$("tech-fenster").hidden) techZeichnen();
    sichern();
  }
  if (!$("tech-fenster").hidden) techZeiten();
  const zurueck = bitcoin.schritt(jetzt);
  if (zurueck > 0 && !$("btc-fenster").hidden) btcZeichnen();
  for (const tier of tiere.schritt(jetzt)) {
    kurzMeldung((tier.reittier ? "Neues Reittier: " : "Geschlüpft: ") + tier.seltenheit.name + " – " + tier.name);
    if (tier.reittier) reittierAnzeigen();
    if (!$("reittiere-fenster").hidden) reittiereZeichnen();
    if (!$("tiere-fenster").hidden) tiereZeichnen();
    sichern();
  }

  freiPruefen();
  if (jetzt - letztesSpeichern >= daten.einstellungen.speichern.alleSekunden * 1000) sichern();
  anzeigeAktualisieren();
}

function sichern() {
  letztesSpeichern = Date.now();
  const ok = speicher.speichern(stand);
  $("speicher-hinweis").textContent = ok
    ? "Gespeichert " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : "Speichern nicht möglich! Bitte exportieren.";
}

// ---------- Anzeige ----------

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Böse-Look (Grafik-Chat): gleiche Palette, dunkler und mit Violett/Schwarz gemischt.
function mischen(hex, mit, anteil) {
  const a = hex.match(/\w\w/g).map((x) => parseInt(x, 16));
  const b = mit.match(/\w\w/g).map((x) => parseInt(x, 16));
  return "#" + a.map((v, i) => Math.round(v * (1 - anteil) + b[i] * anteil).toString(16).padStart(2, "0")).join("");
}

function farbenSetzen() {
  grafik.stueckeMelden(daten.waffen.waffen);
  const f = zeitalter().farben;
  const boese = stand.aktiveSeite === "boese";
  const ton = (c) => (boese ? mischen(c, "#2b1a3d", 0.5) : c);
  const stil = document.documentElement.style;
  document.body.classList.toggle("boese", boese);
  stil.setProperty("--haupt", ton(f.haupt));
  stil.setProperty("--zweit", ton(f.zweit));
  stil.setProperty("--akzent", ton(f.akzent));
  stil.setProperty("--symbol", f.symbol || "#6f7780");
  const au = stand.gemeinsam.figur.aussehen;
  const umhang = daten.haushalt.aussehen.find((a) => a.id === au.aktiv);
  const spielerFarbe = umhang ? umhang.farbe : "#3c8fe0";
  stil.setProperty("--spieler", spielerFarbe);
  $("szene").style.backgroundImage = grafik.szeneBild(zeitalter(), stand.aktiveSeite);
  $("weg").style.backgroundImage = grafik.wegBild(zeitalter(), stand.aktiveSeite);
  spielerBildSetzen();
  stil.setProperty("--geld-bild", grafik.waehrungBild(zeitalter()));
  $("gegner-gruppe").dataset.k = "";
}

// Die Figur trägt sichtbar, was angelegt ist (Helm, Rüstung, Handschuhe, Stiefel).
function spielerBildSetzen() {
  const tragen = {};
  for (const p of ["helm", "ruestung", "handschuhe", "stiefel"]) {
    const w = waffen.werte(waffen.hole(p), p);
    if (w) tragen[p] = { zeitalter: zeitalterVon(w.zeitalter), farbe: w.seltenheit.farbe };
  }
  // Set-Teile aus den Dungeons bestimmen das Aussehen (Farben des Sets), die Werte kommen weiter von der Rüstung.
  if (frei("dungeons"))
    for (const p of ["helm", "ruestung", "handschuhe", "stiefel"]) {
      const st = sets.angelegt(p);
      if (st) tragen[p] = { zeitalter: zeitalterVon(st.z), farbe: st.seltenheitInfo.farbe, metall: st.set.farbe, akzent: st.set.rand };
    }
  // Ab 4 Teilen eines Sets sieht man es am Helden: Schulterplatten, Hörner, Flügel, Flammen … (Harry 17.11.2026).
  if (frei("dungeons")) {
    const sb = setBonus();
    if (sb.dominant && sb.zaehler[sb.dominant] >= 4) {
      const so = sets.setObjekt(sb.dominant);
      tragen.setLook = { thema: sb.dominant, c: sb.zaehler[sb.dominant], f: so.farbe, r: so.rand };
    }
  }
  const waffe = waffen.werte(waffen.hole("waffe"), "waffe");
  tragen.schild = !!waffe && waffe.hand === "schild";
  tragen.sitzt = REITTIER_SICHTBAR && frei("reittiere") && !!reittiere.aktiv();
  // Wer rundum mindestens episch trägt, leuchtet in der Farbe seines schwächsten Stücks.
  const alle = PLAETZE.map(([p]) => waffen.werte(waffen.hole(p), p));
  if (alle.every(Boolean)) {
    const schwach = alle.reduce((a, x) => (x.seltenheit.faktor < a.seltenheit.faktor ? x : a));
    if (daten.waffen.seltenheiten.indexOf(schwach.seltenheit) >= 3) tragen.aura = schwach.seltenheit.farbe;
  }
  const farbe = getComputedStyle(document.documentElement).getPropertyValue("--spieler").trim() || "#3c8fe0";
  const figurEl = document.querySelector(".figur.spieler");
  // Version 51: der Held kommt aus dem Bilder-Blatt seines Zeitalters (1 bis 12). Im Sattel bliebe das alte Bild.
  const nr = zeitalter().nummer;
  const alsPuppe = puppe.verfuegbar(nr) && !tragen.sitzt;
  const stehend = alsPuppe ? puppe.standbild(nr) : null;
  $("spieler-box").classList.toggle("puppe-aktiv", alsPuppe);
  if (alsPuppe) {
    figurEl.style.backgroundImage = "none";
    puppe.zeigen(figurEl, nr);
  } else {
    puppe.weg();
    figurEl.style.backgroundImage = grafik.spielerBild(stand.aktiveSeite, zeitalter(), farbe, tragen, true);
  }
  $("chip-held-bild").style.backgroundImage = stehend || grafik.spielerBild(stand.aktiveSeite, zeitalter(), farbe, { ...tragen, sitzt: false });
}

function anzeigeAktualisieren() {
  const s = seite();
  $("zaehler-zahl").textContent = zahl(guthaben());
  const btcDa = frei("bitcoin");
  $("zaehler-btc").hidden = !btcDa;
  if (btcDa) $("zaehler-btc").textContent = "₿ " + btc(s.btc.menge) + (farm.imCrash() ? " 📉" : "");
  $("chip-staerke").textContent = "⚔ " + zahl(staerke());
  $("chip-level").textContent = "Lv " + s.level;
  $("energie-chip").textContent = "⚡ " + stand.gemeinsam.energie.wert;
  const f = upgradeFortschritt();
  $("aufstieg-fuellung").style.width = (f.max ? (100 * f.hat) / f.max : 0) + "%";
  $("aufstieg-balken").title = "Aufstieg: Upgrades " + f.voll + "/" + f.anzahl + " auf Höchststufe";
  $("chip-xp").style.width = Math.min(100, (100 * s.xp) / xpBedarf(s.level)) + "%";
  if (!$("btc-fenster").hidden) btcKnoepfe();
  for (const u of upgradesHier()) {
    const knopf = document.querySelector(`[data-upgrade="${u.id}"]`);
    if (knopf) knopf.classList.toggle("matt", stufe(u) >= capOf(u) || guthaben() < kosten(u));
  }
  kampfZeichnen();
  ambossZeichnen();
  zieleKnopfZeichnen();
  if (!$("tiere-fenster").hidden) brutZeichnen();
}

// ---------- Info-Fenster: ploppt beim Antippen auf (Harry 16.11.2026: weniger Text, Infos erst auf Wunsch) ----------
// bauen() liefert { titel, titelFarbe, bild, farbe, rund, zeilen: [Text oder Element], knoepfe: [{ text, aktion, aus, rot, zu }] }.
// Nach einem Knopfdruck wird das Fenster neu gebaut, damit die Zahlen stimmen.
let infoBauen = null;

function infoZeigen(bauen) {
  infoBauen = bauen;
  if (infoZeichnen()) $("info").hidden = false;
}

function infoZu() {
  infoBauen = null;
  $("info").hidden = true;
  // Nach einer Änderung im Info-Fenster die Listen im Upgrade-Bereich auffrischen.
  if (!$("upgrades-fenster").hidden) upgradeKategorienZeichnen();
}

function infoZeichnen() {
  if (!infoBauen) return false;
  const o = infoBauen();
  if (!o) {
    infoZu();
    return false;
  }
  const bild = $("info-bild");
  bild.hidden = !o.bild;
  bild.style.backgroundImage = o.bild || "";
  bild.style.backgroundColor = o.farbe || "transparent";
  bild.classList.toggle("rund", !!o.rund);
  $("info-titel").textContent = o.titel;
  $("info-titel").style.color = o.titelFarbe || "";
  const inhalt = $("info-inhalt");
  inhalt.replaceChildren();
  for (const z of o.zeilen || []) if (z) inhalt.append(typeof z === "string" ? el("p", "hinweis", z) : z);
  const knoepfe = $("info-knoepfe");
  knoepfe.replaceChildren();
  for (const k of o.knoepfe || []) {
    if (!k) continue;
    const b = el("button", "knopf" + (k.rot ? " rot" : "") + (k.aus ? " matt" : ""), k.text);
    b.type = "button";
    b.disabled = !!k.aus;
    b.addEventListener("click", () => {
      k.aktion();
      if (k.zu) infoZu();
      else infoZeichnen();
    });
    knoepfe.append(b);
  }
  return true;
}

// Eine Zeile aus kleinen Marken (z. B. Werte oder Chancen).
function marken(liste) {
  const reihe = el("div", "werte-reihe");
  for (const [text, farbe] of liste) {
    const m = el("span", "wert-marke", text);
    if (farbe) m.style.color = farbe;
    reihe.append(m);
  }
  return reihe;
}

let lebenVorher = [];
let spielerLebenVorher = 0;

function wackeln(element, klasse) {
  element.classList.remove(klasse);
  void element.offsetWidth;
  element.classList.add(klasse);
}

// Treffer: Figur blitzt kurz auf, die Schadenszahl steigt hoch.
// Ein paar rote Tropfen spritzen von der getroffenen Figur weg.
function blut(box) {
  if (box.querySelectorAll(".blut").length >= 10) return;
  for (let i = 0; i < 5; i++) {
    const t = el("span", "blut");
    t.style.setProperty("--dx", Math.round(Math.random() * 44 - 22) + "px");
    t.style.setProperty("--dy", Math.round(-8 - Math.random() * 26) + "px");
    t.style.left = 40 + Math.random() * 20 + "%";
    box.append(t);
    setTimeout(() => t.remove(), 460);
  }
}

function treffer(box, menge, farbe, gross) {
  if (document.hidden) return;
  wackeln(box.querySelector(".figur"), "getroffen");
  blut(box);
  if (box.querySelectorAll(".schadenszahl").length >= 3) return;
  const zahlEl = el("span", "schadenszahl" + (gross ? " krit" : ""), "-" + zahl(Math.max(1, Math.round(menge))));
  zahlEl.style.color = farbe;
  zahlEl.style.left = 30 + Math.random() * 40 + "%";
  box.append(zahlEl);
  setTimeout(() => zahlEl.remove(), 700);
}

// Pfeil fliegt quer durch die Arena (nur Anzeige; der Schaden ist schon verrechnet).
function geschoss(von, nach, gespiegelt, art, gross) {
  const arena = $("arena");
  if (arena.querySelectorAll(".geschoss").length >= 8) return;
  const g = el("div", "geschoss" + (gespiegelt ? " gespiegelt" : "") + (gross ? " gross" : ""));
  g.style.backgroundImage = grafik.geschossBild(art || "pfeil");
  arena.append(g);
  const flug = g.animate([{ left: von + "%" }, { left: nach + "%" }], { duration: 360, easing: "linear" });
  flug.onfinish = () => g.remove();
  setTimeout(() => g.remove(), 600);
}

// Kurzes Wort oder Zeichen, das über einer Figur aufsteigt (Block, Heilung …).
function wortZeigen(box, text, farbe) {
  if (document.hidden || box.querySelectorAll(".schadenszahl").length >= 4) return;
  const e = el("span", "schadenszahl wort", text);
  e.style.color = farbe;
  e.style.left = "50%";
  box.append(e);
  setTimeout(() => e.remove(), 700);
}

// Leuchtender Ring um eine Figur (Fähigkeit löst aus).
function blitz(box, klasse) {
  const b = el("span", "blitz " + klasse);
  box.append(b);
  setTimeout(() => b.remove(), 500);
}

// Der Held hält die Waffe in der Hand, die er gerade benutzt: Bogen beim Schießen, Nahkampf-Waffe beim Zuschlagen.
// stufe (nur Bogen): 0 = entspannt, 1 = halb gespannt, 2 = voll gespannt.
function heldWaffe(stufe) {
  const w = waffen.werte(waffen.hole("waffe"), "waffe");
  const bild = $("held-waffe");
  const bogen = !!w && w.hand === "bogen";
  const skin = frei("dungeons") ? sets.angelegt("waffe") : null; // Set-Waffe: Aussehen in den Farben des Sets
  const k = (w ? w.id : "") + "|" + zeitalter().id + "|" + (bogen ? stufe : "") + "|" + (skin ? skin.z : "");
  if (bild.dataset.k === k) return;
  bild.dataset.k = k;
  bild.hidden = !w;
  if (!w) return;
  const z = zeitalterVon(w.zeitalter);
  bild.classList.toggle("fern", w.art === "fern");
  bild.classList.toggle("nah", w.art === "nah");
  bild.classList.toggle("bogen", bogen);
  bild.style.backgroundImage = bogen ? grafik.bogenBild(z, stufe, skin && skin.set) : skin ? grafik.setWaffeBild(w.art, skin.set, w.id) : grafik.stueckBild(w.art, z, w.id, false);
}

// Weißer Bogen am Gegner, wenn der Held mit der Nahkampf-Waffe trifft.
function hiebSpur(box, farbe) {
  if (!box) return;
  const spur = el("span", "hieb-spur" + (farbe ? " " + farbe : ""));
  box.append(spur);
  setTimeout(() => spur.remove(), 260);
}

function kampfZeichnen() {
  const z = kampf.zustand();
  const s = seite();
  const trank = daten.dungeons.heiltrank;
  // Harry 16.11.2026: Stufe und Ebene wie „46-3“ (10 Ebenen je Stufe).
  $("stufe-text").textContent = z.boss
    ? "Boss · Phase " + z.bossPhase
    : "Stufe " + z.stufe + "-" + z.welle + (z.besondere === "zwischen" ? " · Anführer" : z.besondere === "elite" ? " · Elite" : "");
  // Punkte für die Wellen der Stufe: geschaffte sind gefüllt, die laufende ist größer.
  const punkte = $("wellen-punkte");
  const kp = z.boss ? "boss" : z.wellenProStufe + "|" + z.welle;
  if (punkte.dataset.k !== kp) {
    punkte.dataset.k = kp;
    punkte.replaceChildren();
    if (!z.boss) for (let i = 1; i <= z.wellenProStufe; i++) punkte.append(el("span", "punkt klein" + (i < z.welle ? " fertig" : i === z.welle ? " jetzt" : "")));
  }
  $("spieler-balken").style.width = (100 * z.spielerLeben) / z.maxLeben + "%";
  $("spieler-leben").textContent = zahl(Math.ceil(z.spielerLeben)) + "/" + zahl(Math.ceil(z.maxLeben));

  // Figuren bleiben bestehen und werden nur verschoben, damit Laufen und Treffer-Effekte flüssig sind.
  const gruppe = $("gegner-gruppe");
  gruppe.dataset.phase = z.boss ? z.bossPhase : ""; // Boss-Phase färbt den Boss (CSS)
  const schluessel = z.gegner.map((g) => g.name + "/" + g.typ + "/" + g.art + "/" + (g.sorte || 0) + (g.boss ? "/B" : "") + (g.zwischen ? "/Z" : "")).join("|");
  if (gruppe.dataset.k !== schluessel) {
    gruppe.dataset.k = schluessel;
    gruppe.replaceChildren();
    z.gegner.forEach((g, i) => {
      const box = el("div", "gegner" + (g.boss ? " boss" : "") + (g.zwischen ? " boss zwischen" : ""));
      const figur = el("div", "figur gegner-figur" + (g.typ === "elite" ? " elite" : "") + (g.boss ? " boss" : ""));
      // Version 51: Bilder-Blatt (stehend, atmet, schlägt mit 4 Bildern), sonst das alte Bild.
      const blatt = gegnerBlatt(zeitalter().nummer, g.boss, g.zwischen ? 3 : g.sorte);
      if (blatt) {
        const m = g.boss ? MASS.boss : g.zwischen ? MASS.anfuehrer : MASS.gegner;
        figur.classList.add("blatt-figur");
        figur.style.height = Math.round(blatt.info.AY * m * 0.88) + "px";
        box._blatt = blattFigur(figur, blatt.info, blatt.src, m, true, "gegner");
      } else figur.style.backgroundImage = grafik.gegnerBild(stand.aktiveSeite, zeitalter(), g.typ, g.boss, g.art, true);
      const balken = el("div", "balken klein");
      balken.append(el("div", "fuellung rot"));
      if (g.boss || g.zwischen) box.append(el("div", "gegner-name", g.name));
      // Die Waffe ist ein eigenes Bild über der Figur: so wird sie nie abgeschnitten und kann sich bewegen.
      const stapel = el("div", "gegner-stapel");
      stapel.append(figur);
      const gw = blatt ? null : grafik.gegnerWaffe(stand.aktiveSeite, zeitalter(), g.boss, g.art); // Blatt-Gegner kämpfen mit Fäusten
      if (gw) {
        const waffe = el("div", "gegner-waffe " + gw.art);
        waffe.style.backgroundImage = gw.bild;
        stapel.append(waffe);
      }
      box.append(balken, stapel);
      box.style.bottom = (i % 3) * 8 + "px";
      box.style.zIndex = String(3 - (i % 3));
      gruppe.append(box);
    });
    lebenVorher = z.gegner.map((g) => g.leben);
  }
  const ORT0 = 27; // Prozent der Arena-Breite: hier steht ein Gegner direkt vor dem Startplatz des Helden
  const ort = (g) => ORT0 + Math.min(1.1, g.x) * 62;
  const heldOrt = z.heldX * 62; // der Held verschiebt sich um denselben Maßstab
  const krit = new Set(z.effekte.filter((e) => e.was === "krit").map((e) => e.i));
  z.gegner.forEach((g, i) => {
    const box = gruppe.children[i];
    box.style.left = ort(g) + "%";
    box.classList.toggle("weg", g.leben <= 0);
    box.classList.toggle("laeuft", g.leben > 0 && !!g.laeuft);
    box.querySelector(".fuellung").style.width = (100 * Math.max(0, g.leben)) / g.maxLeben + "%";
    const weniger = lebenVorher[i] - g.leben;
    if (weniger > 0.001) treffer(box, weniger, krit.has(i) ? "#ffd54a" : "#fff", krit.has(i));
    lebenVorher[i] = g.leben;
  });
  const spielerBox = $("spieler-box");
  const spielerFigur = spielerBox.querySelector(".figur");
  spielerBox.style.left = heldOrt + "%";
  spielerBox.classList.toggle("laeuft", z.heldLaeuft);
  puppe.laufen(z.heldLaeuft);
  const fae = faehigkeiten.aktiv();
  spielerBox.classList.toggle("staerke", fae.staerke);
  spielerBox.classList.toggle("schutz", fae.schutz);
  puppe.blockHalten(!!fae.schutz);
  // Bogen: je voller die Angriffs-Uhr, desto weiter ist er gespannt (nur wenn ein Gegner zu sehen ist).
  const sichtbar = z.gegner.some((g) => g.leben > 0 && g.x <= 1.02);
  const schoss = z.effekte.some((e) => e.art === "schuss");
  heldWaffe(schoss || !sichtbar ? 0 : z.ladung > 0.7 ? 2 : z.ladung > 0.35 ? 1 : 0);
  if (!document.hidden) {
    const waffe = waffen.werte(waffen.hole("waffe"), "waffe");
    const pfeilArt = !waffe || waffe.hand === "bogen" ? "pfeil" : zeitalterVon(waffe.zeitalter).nummer >= 7 ? "kugel" : "speer";
    for (const e of z.effekte) {
      const ziel = z.gegner[e.i];
      const zielBox = gruppe.children[e.i];
      if (e.art === "schuss" && ziel) {
        wackeln($("held-waffe"), waffe && waffe.hand === "bogen" ? "loslassen" : "wurf");
        geschoss(heldOrt + 20, ort(ziel), false, pfeilArt);
      } else if (e.art === "schlag" && ziel) {
        wackeln(spielerFigur, "schlag");
        puppe.schlag();
        wackeln($("held-waffe"), "schwung");
        hiebSpur(zielBox);
      } else if (e.art === "mitSchlag" && ziel) hiebSpur(zielBox);
      else if (e.art === "gegnerSchuss" && ziel) {
        const gw = zielBox.querySelector(".gegner-waffe");
        if (gw) wackeln(gw, "los");
        geschoss(ort(ziel), heldOrt + 14, true, zeitalter().nummer >= 10 ? "kugel" : "pfeil");
      } else if (e.art === "gegnerSchlag" && ziel) {
        const gw = zielBox.querySelector(".gegner-waffe");
        if (gw) wackeln(gw, "los");
        if (zielBox._blatt) zielBox._blatt.schlag();
        else wackeln(zielBox.querySelector(".figur"), "hieb");
      }
      else if (e.art === "block") {
        wortZeigen(spielerBox, "Block!", "#9fd0ff");
        puppe.block();
      }
      else if (e.art === "ausweichen") wortZeigen(spielerBox, "Daneben!", "#d8f0c0");
      else if (e.art === "zauber" && ziel) {
        // Fähigkeit mit Schaden: Stein und Feuerball fliegen, der Doppelschlag ist ein zweiter, gelber Hieb.
        if (e.was === "doppelschlag") hiebSpur(zielBox, "gelb");
        else geschoss(heldOrt + 20, ort(ziel), false, e.was === "feuerball" ? "feuer" : "stein", e.was === "feuerball");
        blitz(zielBox, e.was === "feuerball" ? "feuer" : "treff");
      } else if (e.art === "tier" && ziel) blitz(zielBox, "treff");
      else if (e.art === "heldZauber") {
        blitz(spielerBox, e.was);
        if (e.was === "heilung") wortZeigen(spielerBox, "+", "#6fe08a");
      }
    }
  }
  if (spielerLebenVorher - z.spielerLeben > 0.001 && spielerLebenVorher <= z.maxLeben) treffer(spielerBox, spielerLebenVorher - z.spielerLeben, "#ff6b5e");
  spielerLebenVorher = z.spielerLeben;

  // Boss-Knopf: Schloss, solange noch etwas fehlt (Antippen zeigt, was), sonst Krone.
  const fehlt = aufstiegFehlt();
  const bereit = !z.boss && fehlt !== null && !fehlt.length;
  const kb = z.boss ? "laeuft" : bereit ? "bereit" : "zu";
  const knopf = $("boss-knopf");
  if (knopf.dataset.k !== kb) {
    knopf.dataset.k = kb;
    $("boss-bild").style.backgroundImage = grafik.symbolBild(bereit || z.boss ? "krone" : "schloss");
    $("boss-text").textContent = z.boss ? "läuft" : "Boss";
    knopf.classList.toggle("bereit", bereit);
  }
}

function bossTippen() {
  if (kampf.istBoss()) return;
  const fehlt = aufstiegFehlt();
  const boss = gegnerDaten().boss;
  if (fehlt !== null && !fehlt.length) {
    kampf.bossStarten();
    return kampfZeichnen();
  }
  infoZeigen(() => ({
    titel: boss ? boss.name[stand.aktiveSeite] || boss.name.gut : "Boss",
    bild: grafik.symbolBild("schloss"),
    zeilen: fehlt === null ? ["Das nächste Zeitalter kommt später."] : ["Der Boss öffnet das nächste Zeitalter. Dafür brauchst du noch:", marken(fehlt.map((f) => [f]))],
  }));
}

// Bedingungen für den Boss: Level (Schmied-Hürde entfällt, Harry 25.11.2026).
// null = es gibt noch kein nächstes Zeitalter; [] = alles erfüllt.
function aufstiegFehlt() {
  const boss = gegnerDaten().boss;
  if (!boss || (!boss.endboss && !daten.zeitalter.some((x) => x.id === boss.naechstesZeitalter))) return null;
  const a = daten.einstellungen.aufstieg;
  const nr = zeitalter().nummer;
  const s = seite();
  const fehlt = [];
  if (s.level < a.levelJeZeitalter * nr) fehlt.push("Level " + a.levelJeZeitalter * nr + " (du: " + s.level + ")");
  if (a.stufe && s.kampf.stufe < a.stufe) fehlt.push("Kampfstufe " + a.stufe + " (du: " + s.kampf.stufe + ")");
  if (a.alleUpgradesMax) {
    const f = upgradeFortschritt();
    if (f.voll < f.anzahl) fehlt.push("Alle Upgrades auf Höchststufe (fertig: " + f.voll + " von " + f.anzahl + ")");
  }
  return fehlt;
}

// ---------- Ausrüstungs-Raster (wie Forge Master) ----------

// Harry 25.11.2026: 12 Plätze, 7 sichtbar am Helden, 5 unsichtbar (nur Werte und Set).
const PLAETZE = [
  ["helm", "Helm", "⛑"],
  ["ruestung", "Rüstung", "🦺"],
  ["handschuhe", "Handschuhe", "🧤"],
  ["hose", "Hose", "👖"],
  ["stiefel", "Stiefel", "🥾"],
  ["waffe", "Schwert", "🗡"],
  ["schild", "Schild", "🛡"],
  ["guertel", "Gürtel", "🎗"],
  ["amulett", "Amulett", "📿"],
  ["ring1", "Ring rechts", "💍"],
  ["ring2", "Ring links", "💍"],
  ["ohrringe", "Ohrringe", "✦"],
];

// Eine Kachel mit Bild statt Text: Farbe = Seltenheit, unten Sterne, oben links Level, oben rechts Anzahl.
function bildKachel(o) {
  const k = el("button", "kachel" + (o.leer ? " leer" : "") + (o.rund ? " rund" : "") + (o.gewaehlt ? " gewaehlt" : "") + (o.glanz ? " glanz" : ""));
  k.type = "button";
  if (o.titel) k.title = o.titel;
  if (o.farbe && !o.leer) k.style.background = o.farbe;
  // Harry 17.11.2026: jede Qualitätsstufe leuchtet, je höher, desto kräftiger.
  if (o.leucht && o.leucht.q > 0) {
    k.classList.add("leucht");
    k.style.setProperty("--leucht", o.leucht.farbe);
    k.style.setProperty("--leucht-r", 4 + o.leucht.q * 3 + "px");
    k.style.setProperty("--leucht-s", o.leucht.q * 0.7 + "px");
  }
  const bild = el("span", "kachel-bild");
  if (o.bild) bild.style.backgroundImage = o.bild;
  k.append(bild);
  if (o.marke) k.append(el("span", "kachel-name", o.marke));
  if (o.sterne > 0) k.append(el("span", "sterne", "★".repeat(o.sterne)));
  if (o.lv) k.append(el("span", "kachel-lv", o.lv));
  if (o.anzahl > 1) k.append(el("span", "kachel-anzahl", "×" + o.anzahl));
  if (o.punkt) k.append(el("span", "kachel-punkt"));
  if (o.klick) k.addEventListener("click", o.klick);
  else k.disabled = true;
  return k;
}

const zeitalterVon = (id) => daten.zeitalter.find((x) => x.id === id) || zeitalter();

function platzKachel(art, name, klick, gewaehlt) {
  const w = waffen.werte(waffen.hole(art), art);
  const lv = bitcoin.stufe(art);
  return bildKachel({
    titel: w ? w.name : name,
    leer: !w,
    farbe: w && w.seltenheit.farbe,
    glanz: w && w.seltenheit.glanz,
    bild: grafik.stueckBild(art === "waffe" ? (w ? w.art : "nah") : art, w ? zeitalterVon(w.zeitalter) : zeitalter(), w ? w.id : "", !w),
    sterne: w ? w.sterne : 0,
    lv: lv > 0 ? "Lv. " + lv : "",
    gewaehlt,
    klick,
  });
}

function rasterZeichnen() {
  spielerBildSetzen();
  $("held-waffe").dataset.k = "-";
  const raster = $("ausruestung-raster");
  raster.replaceChildren();
  for (const [art, name] of PLAETZE) raster.append(platzKachel(art, name, () => stueckInfo(art)));
  // Platz für das gesattelte Reittier (nur, wenn Reittiere sichtbar sind; seit V47 aus).
  if (REITTIER_SICHTBAR && frei("reittiere")) {
    const a = reittiere.aktiv();
    raster.append(
      bildKachel({
        leer: !a,
        farbe: a && a.seltenheit.farbe,
        glanz: a && a.seltenheit.glanz,
        bild: a ? grafik.reittierBild(a.id) : grafik.symbolBild("tiere"),
        sterne: a ? a.sterne : 0,
        klick: () => fensterZeigen("reittiere-fenster"),
      })
    );
  }
}

// Info zu einem Ausrüstungs-Platz: Name, Werte, Händler-Stufe. Bei der Waffe dazu der Kampfstil.
function stueckInfo(art) {
  infoZeigen(() => {
    const w = waffen.werte(waffen.hole(art), art);
    const zeilen = [];
    const knoepfe = [];
    if (w) zeilen.push(el("div", "hinweis", w.seltenheit.name), werteListe(w));
    else zeilen.push("Noch leer. Gegner und Bosse lassen Ausrüstung fallen.");
    if (bitcoin.haendler().some((h) => h.offen && h.plaetze.includes(art))) {
      const voll = bitcoin.voll(art);
      const preis = frei("bitcoin") ? btc(bitcoin.preis(art)) + " ₿" : zahl(bitcoin.preisGeld(art)) + " " + waehrung().name;
      zeilen.push(el("div", "hinweis", "Händler Lv. " + bitcoin.stufe(art) + "/" + bitcoin.maxStufe() + " · +" + Math.round((bitcoin.faktor(art) - 1) * 100) + " % Werte, bleibt für immer"));
      knoepfe.push({
        text: voll ? "Händler: Maximum" : "Verbessern · " + preis,
        aus: voll,
        aktion: () => {
          if (!bitcoin.upgradeKaufen(art)) return kurzMeldung("Dafür reicht es noch nicht.");
          btcGeaendert();
        },
      });
    }
    return {
      titel: w ? w.name + " " + "★".repeat(w.sterne) : PLATZ_NAMEN[art],
      titelFarbe: w ? w.seltenheit.farbe : "",
      bild: grafik.stueckBild(art === "waffe" ? (w ? w.art : "nah") : art, w ? zeitalterVon(w.zeitalter) : zeitalter(), w ? w.id : "", !w),
      farbe: w ? w.seltenheit.farbe : "#cfd3da",
      zeilen,
      knoepfe,
    };
  });
}

// Statt Amboss (Schmiede entfällt, Harry 25.11.2026): ein Knopf für Lager und Mergen, mit Punkt, wenn etwas mergbar ist.
function ambossZeichnen() {
  const liste = waffen.lagerListe();
  $("schmiede-stufe-zahl").textContent = "Lager";
  $("schmiede-stufe-knopf").classList.toggle("mergbar", liste.some((e) => e.mergbar));
  $("schmiede-zeit").textContent = liste.reduce((n, e) => n + e.anzahl, 0) + " Stück";
}

// Harry 17.11.2026: Im Upgrade-Bereich stehen alle Dinge, die man aufwerten kann, nach Kategorien getrennt und
// jeweils nach Qualität sortiert (Göttlich oben, dann Zeitalter, dann Sterne). Fähigkeiten gibt es nur hier.
function upgradeKategorienZeichnen() {
  const nummer = (id) => zeitalterVon(id).nummer;
  const sortieren = (a, b) => b.rang - a.rang || b.zNr - a.zNr || b.sterne - a.sterne || b.staerke - a.staerke;
  const rangVon = (selten) => daten.waffen.seltenheiten.indexOf(selten);
  // Ausrüstung: alle getragenen Stücke
  const stuecke = PLAETZE.map(([p, name]) => ({ p, name, w: waffen.werte(waffen.hole(p), p) }))
    .filter((x) => x.w)
    .map((x) => ({ ...x, rang: rangVon(x.w.seltenheit), zNr: nummer(x.w.zeitalter), sterne: x.w.sterne, staerke: x.w.staerke }))
    .sort(sortieren);
  const aus = $("up-ausruestung");
  aus.replaceChildren();
  if (!stuecke.length) aus.append(el("p", "hinweis", "Noch nichts angelegt. Gegner und Bosse lassen Ausrüstung fallen."));
  for (const x of stuecke) aus.append(platzKachel(x.p, x.name, () => stueckInfo(x.p)));
  // Haustiere: Kämpfer und Helfer
  const tbox = $("up-tiere-box");
  tbox.hidden = !frei("tiere");
  if (!tbox.hidden) {
    const t = seite().tiere;
    const team = [t.kaempfer, ...t.supporter]
      .filter((nr) => nr !== null && nr !== undefined)
      .map((nr) => tiere.werte(tiere.finde(nr)))
      .filter(Boolean)
      .map((w) => ({ w, rang: w.rang, zNr: nummer(w.zeitalter), sterne: w.sterne, staerke: w.staerke }))
      .sort(sortieren);
    const box = $("up-tiere");
    box.replaceChildren();
    if (!team.length) box.append(el("p", "hinweis", "Noch kein Haustier im Team."));
    for (const x of team) box.append(tierKachel(x.w, ""));
  }
  // Reittiere: alle, nach Qualität
  const rbox = $("up-reittiere-box");
  rbox.hidden = !frei("reittiere");
  if (!rbox.hidden) {
    const a = reittiere.aktiv();
    const box = $("up-reittiere");
    box.replaceChildren();
    const liste = reittiere.liste();
    if (!liste.length) box.append(el("p", "hinweis", "Noch kein Reittier."));
    for (const w of liste)
      box.append(
        bildKachel({
          titel: w.name,
          farbe: w.seltenheit.farbe,
          glanz: w.seltenheit.glanz,
          bild: grafik.reittierBild(w.id),
          sterne: w.sterne,
          lv: bitcoin.stufe("reittier-" + w.nr) > 0 ? "Lv. " + bitcoin.stufe("reittier-" + w.nr) : a && a.nr === w.nr ? "an" : "",
          punkt: reittiere.mergbar(w.nr),
          klick: () => reittierInfo(w.nr),
        })
      );
  }
  // Fähigkeiten gibt es nur im Upgrade-Bereich
  const fbox = $("faehigkeiten-box");
  fbox.hidden = !frei("faehigkeiten");
  if (!fbox.hidden) faehigkeitenZeichnen();
}

function upgradesZeichnen() {
  const liste = $("upgrades");
  liste.replaceChildren();
  for (const u of upgradesHier()) {
    const voll = stufe(u) >= capOf(u);
    const k = bildKachel({
      titel: upgradeName(u),
      farbe: "#3d6fb8",
      bild: grafik.upgradeBild(u.wirkung),
      lv: "Lv. " + stufe(u),
      marke: voll ? "Max" : zahl(kosten(u)),
      klick: () => upgradeInfo(u),
    });
    k.dataset.upgrade = u.id;
    liste.append(k);
  }
  upgradeKategorienZeichnen();
  anzeigeAktualisieren();
}

function upgradeInfo(u) {
  infoZeigen(() => {
    const voll = stufe(u) >= capOf(u);
    return {
      titel: upgradeName(u),
      bild: grafik.upgradeBild(u.wirkung),
      farbe: "#3d6fb8",
      zeilen: [upgradeText(u) + " je Stufe.", marken([["Stufe " + stufe(u) + "/" + capOf(u)]])],
      knoepfe: [
        {
          text: voll ? "Maximum" : "Kaufen · " + zahl(kosten(u)) + " " + waehrung().name,
          aus: voll,
          aktion: () => {
            if (guthaben() < kosten(u)) return kurzMeldung("Zu wenig " + waehrung().name + ".");
            kaufen(u);
          },
        },
      ],
    };
  });
}

// Unten 5 Knöpfe. Jeder öffnet eine ganze Seite; darüber liegen die Reiter der Gruppe (wie bei Forge Master).
// Die Schmiede-Seite gehört zu keinem Knopf: Sie öffnet sich beim Tippen auf die Ausrüstung.
// Harry 16.11.2026: unten ein Hauptmenü, darüber die Unterpunkte des gewählten Bereichs als Reiter.
// "arena" ist kein Fenster: der Reiter zeigt einfach den Kampf.
const GRUPPEN = [
  {
    id: "kampf",
    name: "Kampf",
    reiter: [
      ["arena", "Kampf", () => {}],
      ["waffen-fenster", "Lager", () => waffenZeichnen()],
      ["upgrades-fenster", "Upgrades", () => (($("faehigkeit-ergebnis").textContent = ""), upgradesZeichnen())],
    ],
  },
  { id: "dungeons", name: "Dungeons", reiter: [["dungeon-fenster", "Dungeons", () => (($("dungeon-ergebnis").textContent = ""), dungeonsZeichnen()), "dungeons"]] },
  {
    id: "held",
    name: "Held",
    reiter: [
      ["tiere-fenster", "Haustiere", () => tiereZeichnen(), "tiere"],
      ["reittiere-fenster", "Reittiere", () => reittiereZeichnen(), "reittiere"],
    ],
  },
  {
    id: "fortschritt",
    name: "Forschung",
    bild: "tech",
    reiter: [
      ["tech-fenster", "Tech-Baum", () => techZeichnen(), "tech"],
      ["perma-fenster", "Perma 👑", () => permaSeiteZeichnen()],
      ["sammelbuch", "Sammelbuch", () => (sammelbuchPruefen(), sammelbuchZeichnen())],
    ],
  },
  {
    id: "geld",
    name: "Geld",
    reiter: [
      ["btc-fenster", "Händler", () => btcZeichnen()],
      ["haushalt-fenster", "Haushalt", () => haushaltZeichnen(), "haushalt"],
      ["farm-fenster", "Farm", () => farmZeichnen(true), "farm"],
    ],
  },
  { id: "menue", name: "Menü", reiter: [["menue", "Menü", () => {}]] },
];
let offeneGruppe = null;
let offenerReiter = null;
const letzterReiter = {};
// Ein Reiter ist nur da, wenn sein System freigeschaltet ist (4. Eintrag = Name in einstellungen.freischalten).
const reiterOffen = (r) => !r[3] || (r[3] === "farm" ? frei("trading") || frei("bitcoin") : frei(r[3]));
const reiterVon = (g) => (g.reiter || []).filter(reiterOffen);
const gruppeVon = (fensterId) => GRUPPEN.find((g) => g.reiter && g.reiter.some((r) => r[0] === fensterId));

// "arena" ist der Kampf selbst, kein Fenster: der darf nie versteckt oder zur Seite gemacht werden.
const fensterVerstecken = () => {
  for (const g of GRUPPEN) for (const r of g.reiter || []) if (r[0] !== "arena" && $(r[0])) $(r[0]).hidden = true;
};

function seiteSchliessen() {
  fensterVerstecken();
  offeneGruppe = null;
  offenerReiter = null;
  $("reiter").hidden = true;
  leisteZeichnen();
}

function seiteOeffnen(gruppeId, fensterId) {
  const g = GRUPPEN.find((x) => x.id === gruppeId);
  const offene = g ? reiterVon(g) : [];
  if (!offene.length) return seiteSchliessen();
  const r = offene.find((x) => x[0] === (fensterId || letzterReiter[g.id])) || offene[0];
  fensterVerstecken();
  offeneGruppe = g.id;
  offenerReiter = r[0];
  letzterReiter[g.id] = r[0];
  const leiste = $("reiter");
  leiste.replaceChildren();
  leiste.hidden = offene.length < 2;
  for (const rr of offene) {
    const k = el("button", "reiter-knopf" + (rr[0] === r[0] ? " an" : ""), rr[1]);
    k.type = "button";
    k.addEventListener("click", () => seiteOeffnen(g.id, rr[0]));
    leiste.append(k);
  }
  r[2]();
  const f = r[0] === "arena" ? null : $(r[0]);
  if (!f) {
    // Reiter „Kampf“: kein Fenster, nur die Reiter-Leiste über dem Kampf
    leisteZeichnen();
    document.documentElement.style.setProperty("--unten", $("leiste").offsetHeight + (leiste.hidden ? 0 : leiste.offsetHeight) + "px");
    return;
  }
  f.classList.add("seite");
  f.hidden = false;
  f.querySelector(".karte").scrollTop = 0;
  leisteZeichnen();
  document.documentElement.style.setProperty("--unten", $("leiste").offsetHeight + (leiste.hidden ? 0 : leiste.offsetHeight) + "px");
}

function leisteZeichnen() {
  const leiste = $("leiste");
  leiste.replaceChildren();
  for (const g of GRUPPEN) {
    if (g.versteckt) continue;
    if (g.reiter && !reiterVon(g).length) continue; // noch nichts freigeschaltet
    const an = offeneGruppe === g.id;
    const knopf = el("button", "rund" + (an ? " an" : ""));
    knopf.type = "button";
    const rund = el("span", "rund-symbol");
    rund.style.backgroundImage = grafik.symbolBild(an ? "zu" : g.id === "geld" && !frei("bitcoin") ? "muenze" : g.bild || g.id);
    knopf.append(rund, el("span", "rund-name", g.name));
    knopf.addEventListener("click", () => (an ? seiteSchliessen() : seiteOeffnen(g.id, g.id === "kampf" ? "arena" : undefined)));
    leiste.append(knopf);
  }
}

function allesZeichnen() {
  if (waffen.startAusruestung() > 0) sichern(); // kein Nackt-Start: leere Plätze bekommen ein Primitiv-Stück
  farbenSetzen();
  $("zeitalter-name").textContent = "Zeitalter " + zeitalter().nummer;
  $("seite-knopf").textContent = stand.aktiveSeite === "boese" ? "Zur Beschützer-Seite wechseln 🛡" : "Zur Dieb-Seite wechseln 🦹";
  upgradesZeichnen();
  freiVorher = freiListe().join(","); // Seitenwechsel oder Aufstieg: still übernehmen
  leisteZeichnen();
  rasterZeichnen();
  reittierAnzeigen();
  faehigkeitLeisteZeichnen();
}

// Infos hinter den drei Feldern der Kopfzeile.
function heldInfo() {
  infoZeigen(() => {
    const s = seite();
    const w = kampfWerte();
    const zusatz = daten.waffen.zusatzWerte.filter((z) => w[z.id] > 0).map((z) => [z.name + " " + prozent(w[z.id])]);
    return {
      titel: stand.aktiveSeite === "boese" ? "Dieb" : "Beschützer",
      bild: puppe.aktiv() && puppe.standbild(zeitalter().nummer) || document.querySelector(".figur.spieler").style.backgroundImage,
      zeilen: [
        marken([["Level " + s.level + " · " + Math.floor((100 * s.xp) / xpBedarf(s.level)) + " %"], ["Stärke " + zahl(staerke())]]),
        marken([["⚔ " + zahl(schaden())], ["♥ " + zahl(maxLeben())], ["Tempo +" + prozent(angriffsTempo())], [w.kombi ? "Nah + Fern" : w.art === "fern" ? "Fernkämpfer" : "Nahkämpfer"]]),
        zusatz.length ? marken(zusatz) : "",
      ],
    };
  });
}

function geldInfo() {
  infoZeigen(() => ({
    titel: zahl(guthaben()) + " " + waehrung().name,
    bild: grafik.waehrungBild(zeitalter()),
    zeilen: [
      marken([["+" + zahl(proSekunde()) + " pro Sek."], ["Kampf +" + zahl(seite().kampf.rate) + " pro Sek."]]),
      marken([["⏱ Offline zählen höchstens " + offlineMaxStunden() + " Std."], ["Ertrag " + Math.round(offlineAnteil() * 100) + " %"]]),
    ],
  }));
}

function zeitalterInfo() {
  infoZeigen(() => {
    const fehlt = aufstiegFehlt();
    const f = daten.einstellungen.freischalten;
    // Was als Nächstes aufgeht (das früheste noch gesperrte System).
    const naechstes = Object.keys(f)
      .filter((n) => n[0] !== "_" && !frei(n))
      .sort((a, b) => (f[a].zeitalter || 1) - (f[b].zeitalter || 1) || (f[a].level || 1) - (f[b].level || 1))[0];
    return {
      titel: "Zeitalter " + zeitalter().nummer + ": " + zeitalter().name,
      bild: grafik.waehrungBild(zeitalter()),
      zeilen: [
        fehlt === null ? "" : fehlt.length ? "Für den Boss fehlt noch:" : "Der Boss wartet. Tippe unten rechts auf die Krone.",
        fehlt && fehlt.length ? marken(fehlt.map((x) => [x])) : "",
        naechstes ? "Als Nächstes: " + f[naechstes].name + (f[naechstes].zeitalter ? " ab Zeitalter " + f[naechstes].zeitalter : " ab Level " + f[naechstes].level) + "." : "",
      ],
    };
  });
}

// ---------- Aktionen ----------

function verdienen(ereignis) {
  const menge = klickWert();
  gutschreiben(menge);
  anzeigeAktualisieren();
  const flug = el("span", "flug", "+" + zahl(menge));
  const rahmen = $("szene").getBoundingClientRect();
  flug.style.left = ereignis.clientX - rahmen.left + "px";
  flug.style.top = ereignis.clientY - rahmen.top + "px";
  $("szene").append(flug);
  flug.addEventListener("animationend", () => flug.remove());
}

// ---------- Schmiede und Waffen ----------

const sterne = (n) => "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
const prozent = (anteil) => (anteil * 100).toLocaleString("de-DE", { maximumSignificantDigits: 2 }) + " %";





function waffenGeaendert() {
  rasterZeichnen();
  waffenZeichnen();
  anzeigeAktualisieren();
  sichern();
}

function lagerZeichnen() {
  const liste = waffen.lagerListe();
  $("lager-titel").textContent = "Lager (" + liste.reduce((n, e) => n + e.anzahl, 0) + ")";
  $("alles-mergen").hidden = !liste.some((e) => e.mergbar);
  const box = $("lager");
  box.replaceChildren();
  if (!liste.length) return box.append(el("p", "hinweis", "Leer. Was nicht besser ist, landet hier."));
  const gleich = (a, b) => a && b && a.id === b.id && a.seltenheit === b.seltenheit && (a.sterne || 0) === (b.sterne || 0);
  for (const e of liste.slice(0, 60))
    box.append(
      bildKachel({
        titel: e.name,
        farbe: e.seltenheit.farbe,
        glanz: e.seltenheit.glanz,
        bild: grafik.stueckBild(e.art, zeitalterVon(e.zeitalter), e.id, false),
        sterne: e.sterne,
        anzahl: e.anzahl,
        punkt: e.mergbar,
        gewaehlt: gewaehltesStueck && gleich(gewaehltesStueck.roh, e.roh),
        klick: () => {
          gewaehltesStueck = { roh: e.roh };
          waffenZeichnen();
        },
      })
    );
}


// Die Werte eines Stücks als kleine Marken: Schaden, Leben und (in späteren Zeitaltern) Zusatzwerte.
function werteListe(w) {
  const reihe = el("div", "werte-reihe");
  const marke = (bild, text, titel) => {
    const m = el("span", "wert-marke", text);
    if (titel) m.title = titel;
    const b = el("span", "wert-bild");
    b.style.backgroundImage = grafik.symbolBild(bild);
    m.prepend(b);
    reihe.append(m);
  };
  if (w.schaden > 0) marke("schwert", "+" + zahl(w.schaden));
  if (w.leben > 0) marke("herz", "+" + zahl(w.leben));
  for (const z of w.zusatz) reihe.append(el("span", "wert-marke", z.name + " +" + prozent(z.wert)));
  return reihe;
}

// Zeigt Name und Werte des angetippten Stücks, dazu die passenden Knöpfe.
function stueckInfoZeichnen() {
  const box = $("stueck-info");
  box.replaceChildren();
  const g = gewaehltesStueck;
  if (!gewaehltesStueck) return box.append(el("p", "hinweis", "Tippe ein Stück an, um Name und Werte zu sehen."));
  const knopf = (text, aus, aktion) => {
    const k = el("button", "knopf klein", text);
    k.type = "button";
    k.disabled = aus;
    k.addEventListener("click", aktion);
    box.append(k);
  };
  if (g.platz) {
    const w = waffen.werte(waffen.hole(g.platz), g.platz);
    if (!w) return;
    const name = el("div", "info-name", w.name + " " + "★".repeat(w.sterne));
    name.style.color = w.seltenheit.farbe;
    box.append(name, el("div", "hinweis", w.seltenheit.name + " · Händler Lv. " + bitcoin.stufe(g.platz)), werteListe(w));
    return;
  }
  const e = waffen.lagerListe().find((x) => x.roh.id === g.roh.id && x.roh.seltenheit === g.roh.seltenheit && (x.roh.sterne || 0) === (g.roh.sterne || 0));
  if (!e) return void (gewaehltesStueck = null);
  const name = el("div", "info-name", e.name + " " + "★".repeat(e.sterne) + " ×" + e.anzahl);
  name.style.color = e.seltenheit.farbe;
  box.append(name, el("div", "hinweis", e.seltenheit.name), werteListe(e));
  knopf("Anlegen", false, () => {
    waffen.anlegenAusLager(e.roh);
    gewaehltesStueck = null;
    waffenGeaendert();
  });
  knopf("Mergen (3 gleiche → nächste Stufe)", !e.mergbar, () => {
    waffen.mergen(e.roh);
    gewaehltesStueck = null;
    waffenGeaendert();
  });
}

function allesMergen() {
  for (let i = 0; i < 500; i++) {
    const naechstes = waffen.lagerListe().find((e) => e.mergbar);
    if (!naechstes) break;
    waffen.mergen(naechstes.roh);
  }
  waffenGeaendert();
}

function waffenZeichnen() {
  const raster = $("schmiede-raster");
  raster.replaceChildren();
  for (const [art, name] of PLAETZE)
    raster.append(
      platzKachel(
        art,
        name,
        () => {
          gewaehltesStueck = waffen.hole(art) ? { platz: art } : null;
          waffenZeichnen();
        },
        !!gewaehltesStueck && gewaehltesStueck.platz === art
      )
    );
  lagerZeichnen();
  stueckInfoZeichnen();
  const b = waffen.bonus();
  const sm = Math.round(daten.waffen.schmuckSet * 100);
  const zw = daten.waffen.zusatzWerte.filter((z) => b.zusatz[z.id] > 0).map((z) => z.name + " " + prozent(b.zusatz[z.id]));
  $("waffen-set").textContent = zw.length ? "Deine Zusatzwerte: " + zw.join(" · ") + "." : "";
  $("ruestung-set").textContent =
    "Rüstungs-Set: " + b.ruestungTeile + " von 4 Teilen aus einem Zeitalter (2 Teile +5 % Leben, 4 Teile +15 % Leben)" +
    (b.lebenProzent > 0 ? " – aktiv: +" + prozent(b.lebenProzent) + " Leben." : ".");
  $("schmuck-set").textContent =
    (b.schmuckSet > 0 ? "Schmuck-Set aktiv: +" : "Schmuck-Set: 2 Ringe + Amulett aus einem Zeitalter geben +") + sm + " % auf alle Werte.";
  rasterZeichnen();
}

// ---------- Tiere und Eier ----------

function tierKachel(w, marke) {
  if (!w) return bildKachel({ leer: true, marke });
  return bildKachel({
    titel: w.name,
    farbe: w.seltenheit.farbe,
    glanz: w.seltenheit.glanz,
    bild: grafik.tierBild(w.id),
    sterne: w.sterne,
    lv: bitcoin.stufe("tier-" + w.nr) > 0 ? "Lv. " + bitcoin.stufe("tier-" + w.nr) : marke,
    punkt: tiere.mergbar(w.nr),
    klick: () => tierInfo(w.nr),
  });
}

function tierInfo(nr) {
  infoZeigen(() => {
    const t = seite().tiere;
    const w = tiere.werte(tiere.finde(nr));
    if (!w) return null;
    const art = w.supporterArt === "schaden" ? "Schaden" : "Leben";
    const tun = (aktion) => () => {
      aktion(nr);
      kampf.neuStarten();
      tiereZeichnen();
      anzeigeAktualisieren();
      sichern();
    };
    const imTeam = t.kaempfer === w.nr || t.supporter.includes(w.nr);
    return {
      titel: w.name + " " + "★".repeat(w.sterne),
      titelFarbe: w.seltenheit.farbe,
      bild: grafik.tierBild(w.id),
      farbe: w.seltenheit.farbe,
      zeilen: [
        el("div", "hinweis", w.seltenheit.name),
        el("div", "hinweis", "Als Kämpfer:"),
        marken([["⚔ +" + zahl(w.schaden)], ["♥ +" + zahl(w.leben)]]),
        el("div", "hinweis", "Als Helfer:"),
        marken([[art + " +" + prozent(w.supporterProzent)]]),
        haendlerZeile("tier-" + w.nr),
      ],
      knoepfe: [
        haendlerKnopf("tier-" + w.nr),
        { text: "Als Kämpfer", aus: t.kaempfer === w.nr, aktion: tun(tiere.alsKaempfer) },
        { text: "Als Helfer", aus: tiere.plaetze() === 0 || t.supporter.includes(w.nr), aktion: tun(tiere.alsSupporter) },
        imTeam ? { text: "Aus dem Team", rot: true, aktion: tun(tiere.herausnehmen) } : null,
        { text: "Mergen (3 gleiche → nächste Stufe)", aus: !tiere.mergbar(w.nr), aktion: tun((nr) => tiere.mergen(nr)) },
      ],
    };
  });
}

function brutZeichnen() {
  // Oben die Brutplätze (Ei mit Restzeit), darunter die wartenden Eier.
  const brut = tiere.brutListe(Date.now());
  const plaetze = tiere.brutPlaetze();
  const eier = seite().tiere.eier;
  $("brut-text").textContent = brut.length || eier.length ? "" : "Noch kein Ei. Gegner lassen manchmal eins fallen.";
  const nester = $("brut-plaetze");
  const kn = plaetze + "|" + brut.map((b) => b.seltenheit.id).join(",");
  if (nester.dataset.k !== kn) {
    nester.dataset.k = kn;
    nester.replaceChildren();
    for (let i = 0; i < plaetze; i++) {
      const nest = el("div", "nest" + (brut[i] ? "" : " leer"));
      const bild = el("span", "ei gross");
      if (brut[i]) bild.style.backgroundImage = grafik.eiBild(brut[i].seltenheit.farbe);
      nest.append(bild, el("span", "nest-zeit"));
      if (brut[i]) nest.addEventListener("click", () => brutInfo(i));
      nester.append(nest);
    }
  }
  brut.forEach((b, i) => {
    if (nester.children[i]) nester.children[i].querySelector(".nest-zeit").textContent = dauer(Math.ceil(b.restSekunden));
  });
  const reihe = $("eier-reihe");
  const k = eier.map((e) => e.seltenheit).join(",");
  if (reihe.dataset.k === k) return;
  reihe.dataset.k = k;
  reihe.replaceChildren();
  for (const e of eier) {
    const b = el("span", "ei");
    b.style.backgroundImage = grafik.eiBild((daten.waffen.seltenheiten[e.seltenheit] || daten.waffen.seltenheiten[0]).farbe);
    reihe.append(b);
  }
}



function tiereZeichnen() {
  brutZeichnen();
  const t = seite().tiere;
  const team = $("tier-team");
  team.replaceChildren(tierKachel(tiere.werte(tiere.finde(t.kaempfer)), "Kampf"));
  const ab = tiere.plaetzeAbLevel();
  for (let i = 0; i < ab.length - 1; i++) {
    const frei_ = i < tiere.plaetze();
    const w = frei_ ? tiere.werte(tiere.finde(t.supporter[i])) : null;
    team.append(tierKachel(w, frei_ ? "Hilfe" : "Lv. " + ab[i + 1]));
  }
  const alle = t.sammlung.map((x) => tiere.werte(x)).filter(Boolean);
  // Nach Qualität: Seltenheit, Zeitalter, Sterne, Stärke.
  alle.sort((a, b) => b.rang - a.rang || zeitalterVon(b.zeitalter).nummer - zeitalterVon(a.zeitalter).nummer || b.sterne - a.sterne || b.staerke - a.staerke);
  $("sammlung-titel").textContent = "Sammlung (" + alle.length + ")";
  $("tier-mergen").hidden = !alle.some((w) => tiere.mergbar(w.nr));
  const sammlung = $("tier-sammlung");
  sammlung.replaceChildren(...alle.map((w) => tierKachel(w, "")));
  if (!alle.length) sammlung.append(el("p", "hinweis", "Noch kein Tier."));
}

// ---------- Dungeons ----------

function dungeonErgebnis(r) {
  if (r) {
    if (r.text) $("dungeon-ergebnis").textContent = r.text;
    else {
      const teile = r.teile.map((t) => t.seltenheitInfo.name + " " + t.set.name + "-" + SET_TEIL_NAMEN[t.teil] + (t.angelegt ? " (angelegt)" : "")).join(", ");
      $("dungeon-ergebnis").textContent =
        (r.sieg ? (r.auto ? "Auto Stufe " : "Sieg in Stufe ") + r.stufe : "Zu stark. Belohnung von Stufe " + r.stufe) + ": " + teile + (r.traenke ? ", 1 Heiltrank" : "");
    }
  }
  dungeonsZeichnen();
  rasterZeichnen();
  anzeigeAktualisieren();
  sichern();
}

const SET_TEIL_NAMEN = { helm: "Helm", ruestung: "Rüstung", handschuhe: "Handschuhe", hose: "Hose", stiefel: "Stiefel", waffe: "Schwert", schild: "Schild", guertel: "Gürtel", amulett: "Amulett", ring1: "Ring rechts", ring2: "Ring links", ohrringe: "Ohrringe" };
const offeneDungeons = () => daten.dungeons.sets.filter((x) => zeitalterVon(x.zeitalter).nummer <= zeitalter().nummer && daten.zeitalter.some((z) => z.id === x.zeitalter));

// Ein Dungeon je Zeitalter (bis zum aktuellen), darunter das getragene Set und die Sammlung.
function dungeonsZeichnen() {
  $("schluessel-text").textContent = "🗝 " + dungeons.schluessel();
  const box = $("dungeon-liste");
  box.replaceChildren();
  for (const s of offeneDungeons()) {
    const z = zeitalterVon(s.zeitalter);
    box.append(
      bildKachel({
        titel: s.name,
        farbe: s.farbe,
        bild: grafik.setTeilBild("helm", s),
        lv: "Stufe " + dungeons.stufe(s.zeitalter),
        marke: "ZA " + z.nummer,
        klick: () => dungeonInfo(s),
      })
    );
  }
  const plaetze = $("set-plaetze");
  plaetze.replaceChildren();
  for (const p of daten.dungeons.set.teile) {
    const w = sets.angelegt(p);
    const lv = bitcoin.stufe("set-" + p);
    // Noch gesperrte Plätze (Harry 16.11.2026: ein neues Teil je Zeitalter) zeigen ein Schloss.
    if (!w && !sets.offen(p)) {
      const ab = (daten.dungeons.set.teilAbZeitalter || {})[p] || 1;
      plaetze.append(bildKachel({ leer: true, bild: grafik.symbolBild("schloss"), marke: "ZA " + ab, klick: () => setPlatzInfo(p) }));
      continue;
    }
    plaetze.append(
      bildKachel({
        leer: !w,
        farbe: w && w.seltenheitInfo.farbe,
        glanz: w && w.seltenheitInfo.glanz,
        bild: w ? grafik.setTeilBild(p, w.set, w.seltenheit) : grafik.setTeilBild(p, null),
        leucht: w ? { farbe: w.seltenheitInfo.farbe, q: w.seltenheit } : null,
        lv: lv > 0 ? "Lv. " + lv : "",
        marke: w ? "" : SET_TEIL_NAMEN[p],
        klick: () => setPlatzInfo(p),
      })
    );
  }
  const b = setBonus();
  const sbox = $("set-bonus");
  sbox.replaceChildren(el("div", "", "+" + prozent(b.schaden) + " Schaden und +" + prozent(b.leben) + " Leben durch Set-Teile"));
  for (const th of sets.themen()) {
    const n = b.zaehler[th.id] || 0;
    const stufen = Object.keys(th.boni).map(Number);
    const erreicht = stufen.filter((k) => n >= k);
    const naechste = stufen.find((k) => n < k);
    const zeile = el("div", "set-zeile");
    zeile.style.cssText = "margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,0.06);border-left:5px solid " + (stand.aktiveSeite === "boese" ? th.boese[1] : th.gut[1]);
    zeile.append(el("b", "", th.name + " " + n + "/10"), el("span", "", " · " + th.thema));
    for (const k of stufen) zeile.append(el("div", "", (n >= k ? "✔ " : "○ ") + k + " Teile: " + th.boni[k].text));
    if (n > 0 && naechste) zeile.append(el("div", "", "Nächster Bonus bei " + naechste + " Teilen"));
    if (n > 0 || erreicht.length) sbox.append(zeile);
  }
  if (!Object.values(b.zaehler).some((n) => n > 0)) sbox.append(el("div", "", "Trage Teile aus demselben Set: Boni bei 2, 4, 6, 8 und 10 Teilen. Es gibt Berserker, Bollwerk, Sturmläufer und Plünderer."));
  const liste = sets.liste();
  $("set-mergen").hidden = !liste.some((e) => e.mergbar);
  $("set-titel").textContent = "Sammlung (" + liste.reduce((n, e) => n + e.anzahl, 0) + ")";
  const sammlung = $("set-sammlung");
  sammlung.replaceChildren();
  if (!liste.length) sammlung.append(el("p", "hinweis", "Noch keine Set-Teile. Jeder Dungeon-Sieg bringt eins."));
  for (const e of liste)
    sammlung.append(
      bildKachel({
        farbe: e.seltenheitInfo.farbe,
        glanz: e.seltenheitInfo.glanz,
        bild: grafik.setTeilBild(e.teil, e.set, e.seltenheit),
        leucht: { farbe: e.seltenheitInfo.farbe, q: e.seltenheit },
        anzahl: e.anzahl,
        punkt: e.mergbar,
        klick: () => setTeilInfo(e),
      })
    );
}



function setWerteZeile(w) {
  return marken([["⚔ +" + prozent(w.prozent)], ["♥ +" + prozent(w.prozent)], [w.set.name]]);
}

function setPlatzInfo(p) {
  infoZeigen(() => {
    const w = sets.angelegt(p);
    return {
      titel: w ? w.set.name + "-" + SET_TEIL_NAMEN[p] : SET_TEIL_NAMEN[p],
      titelFarbe: w ? w.seltenheitInfo.farbe : "",
      bild: grafik.setTeilBild(p, w ? w.set : null, w ? w.seltenheit : 0),
      farbe: w ? w.seltenheitInfo.farbe : "#cfd3da",
      zeilen: [
        w ? el("div", "hinweis", w.seltenheitInfo.name) : sets.offen(p) ? "Noch leer. Set-Teile gibt es in den Dungeons." : "Dieses Set-Teil fällt ab Zeitalter " + ((daten.dungeons.set.teilAbZeitalter || {})[p] || 1) + " in den Dungeons.",
        w ? setWerteZeile(w) : "",
        haendlerZeile("set-" + p),
      ],
      knoepfe: [haendlerKnopf("set-" + p)],
    };
  });
}

function setTeilInfo(e) {
  infoZeigen(() => {
    const aktuell = sets.liste().find((x) => x.z === e.z && x.teil === e.teil && x.seltenheit === e.seltenheit);
    if (!aktuell) return null;
    const mitHaendler = sets.werte(aktuell);
    const tun = (aktion) => () => {
      aktion();
      dungeonsZeichnen();
      rasterZeichnen();
      anzeigeAktualisieren();
      sichern();
    };
    return {
      titel: aktuell.set.name + "-" + SET_TEIL_NAMEN[aktuell.teil] + " ×" + aktuell.anzahl,
      titelFarbe: aktuell.seltenheitInfo.farbe,
      bild: grafik.setTeilBild(aktuell.teil, aktuell.set, aktuell.seltenheit),
      farbe: aktuell.seltenheitInfo.farbe,
      zeilen: [el("div", "hinweis", aktuell.seltenheitInfo.name + " · Zeitalter " + aktuell.zeitalterNr), setWerteZeile(mitHaendler)],
      knoepfe: [
        { text: "Anlegen", zu: true, aktion: tun(() => sets.anlegen(aktuell)) },
        { text: "Mergen (3 gleiche → nächste Stufe)", aus: !aktuell.mergbar, aktion: tun(() => sets.mergen(aktuell)) },
      ],
    };
  });
}

// ---------- Händler für Plätze ohne Schmiede-Stück (Kämpfer-Tier, Reittier, Set-Teile) ----------
const HAENDLER_NAMEN = { tier: "Kämpfer-Tier", reittier: "Reittier", ...Object.fromEntries(Object.entries(SET_TEIL_NAMEN).map(([k, v]) => ["set-" + k, "Set-" + v])) };

function haendlerZeile(platz) {
  return el("div", "hinweis", "Händler Lv. " + bitcoin.stufe(platz) + "/" + bitcoin.maxStufe() + " · +" + Math.round((bitcoin.faktor(platz) - 1) * 100) + " % Werte, bleibt für immer");
}

function haendlerKnopf(platz) {
  const voll = bitcoin.voll(platz);
  const preis = frei("bitcoin") ? btc(bitcoin.preis(platz)) + " ₿" : zahl(bitcoin.preisGeld(platz)) + " " + waehrung().name;
  return {
    text: voll ? "Händler: Maximum" : "Verbessern · " + preis,
    aus: voll,
    aktion: () => {
      if (!bitcoin.upgradeKaufen(platz)) return kurzMeldung("Dafür reicht es noch nicht.");
      btcGeaendert();
      if (!$("dungeon-fenster").hidden) dungeonsZeichnen();
      reittierAnzeigen();
    },
  };
}

function haendlerInfo(platz) {
  infoZeigen(() => {
    let bild = grafik.symbolBild("amboss");
    let zeile = "";
    if (platz === "tier") {
      const k = tiere.werte(tiere.finde(seite().tiere.kaempfer));
      if (k) bild = grafik.tierBild(k.id);
      zeile = "Verstärkt das Tier, das als Kämpfer im Team ist.";
    } else if (platz === "reittier") {
      const a = reittiere.aktiv();
      if (a) bild = grafik.reittierBild(a.id);
      zeile = "Macht das gesattelte Reittier schneller.";
    } else {
      const w = sets.angelegt(platz.slice(4));
      bild = grafik.setTeilBild(platz.slice(4), w ? w.set : null);
      zeile = "Verstärkt das Set-Teil auf diesem Platz.";
    }
    return { titel: HAENDLER_NAMEN[platz], bild, zeilen: [zeile, haendlerZeile(platz)], knoepfe: [haendlerKnopf(platz)] };
  });
}

function dungeonInfo(s) {
  infoZeigen(() => {
    const st = dungeons.stufe(s.zeitalter);
    const k = dungeons.schluessel();
    return {
      titel: s.name,
      bild: grafik.setTeilBild("helm", s),
      farbe: s.farbe,
      zeilen: [
        "Dungeon aus Zeitalter " + zeitalterVon(s.zeitalter).nummer + ". Jeder Sieg bringt ein Teil des Sets " + s.name + ".",
        marken([["Stufe " + st], ["🗝 " + k]]),
      ],
      // Harry 17.11.2026: Das Fenster bleibt nach einem Kampf offen. Es schließt nur, wenn keine Schlüssel mehr da sind
      // oder du es selbst schließt.
      knoepfe: [
        { text: "Stufe " + st + " kämpfen · 🗝 1", aus: k <= 0, aktion: () => { dungeonErgebnis(dungeons.kaempfen(s.zeitalter)); if (dungeons.schluessel() <= 0) infoZu(); } },
        st > 1 ? { text: "Auto: Stufe " + (st - 1) + " · 🗝 1", aus: k <= 0, aktion: () => { dungeonErgebnis(dungeons.autoClear(s.zeitalter)); if (dungeons.schluessel() <= 0) infoZu(); } } : null,
      ],
    };
  });
}

// ---------- Fähigkeiten ----------

function faehigkeitGeaendert() {
  faehigkeitenZeichnen();
  anzeigeAktualisieren();
  sichern();
}

function faehigkeitenZeichnen() {
  const f = seite().faehigkeiten;
  $("punkte-text").textContent = "★ " + f.punkte;
  $("ziehen-knopf").textContent = "Ziehen · ★ " + faehigkeiten.ziehenKosten();
  $("ziehen-knopf").classList.toggle("matt", f.punkte < faehigkeiten.ziehenKosten());
  const mitSternen = frei("sterne");
  const kachel = (w, marke) =>
    bildKachel({
      rund: true,
      titel: w.name,
      farbe: w.seltenheit.farbe,
      glanz: w.seltenheit.glanz,
      bild: grafik.faehigkeitBild(w.art),
      sterne: w.sterne,
      lv: "Lv. " + w.level,
      marke,
      punkt: faehigkeiten.mergbar(w.key),
      klick: () => faehigkeitInfo(w.key),
    });

  const plaetze = $("faehigkeit-plaetze");
  plaetze.replaceChildren();
  const ab = faehigkeiten.plaetzeAbLevel();
  for (let i = 0; i < ab.length; i++) {
    const offen = i < faehigkeiten.plaetze();
    const w = offen ? faehigkeiten.werte(faehigkeiten.eintrag(f.ausgeruestet[i])) : null;
    plaetze.append(w ? kachel(w) : bildKachel({ rund: true, leer: true, marke: offen ? "frei" : "Lv. " + ab[i] }));
  }

  const liste = $("faehigkeit-liste");
  liste.replaceChildren();
  const alle = faehigkeiten.liste();
  if (!alle.length) liste.append(el("p", "hinweis", "Noch keine Fähigkeit. Punkte (★) lassen Gegner manchmal fallen."));
  for (const w of alle) liste.append(kachel(w, w.ausgeruestet ? "an" : w.kopien + "/2"));
  faehigkeitLeisteZeichnen();
}

function faehigkeitInfo(key) {
  infoZeigen(() => {
    const f = seite().faehigkeiten;
    const w = faehigkeiten.liste().find((x) => x.key === key);
    if (!w) return null;
    const e = faehigkeiten.eintrag(w.key);
    const tun = (aktion) => () => {
      aktion();
      faehigkeitGeaendert();
    };
    return {
      titel: w.name + " " + "★".repeat(w.sterne),
      titelFarbe: w.seltenheit.farbe,
      bild: grafik.faehigkeitBild(w.art),
      farbe: w.seltenheit.farbe,
      rund: true,
      zeilen: [w.text, marken([[w.seltenheit.name, w.seltenheit.farbe], ["Lv. " + w.level], ["Stärke ×" + zahl(w.faktor)]])],
      knoepfe: [
        w.ausgeruestet ? { text: "Ablegen", rot: true, aktion: tun(() => faehigkeiten.ablegen(w.key)) } : { text: "Ausrüsten", aktion: tun(() => faehigkeiten.ausruesten(w.key)) },
        { text: "Level +1 · ★ " + faehigkeiten.levelKosten(e), aus: f.punkte < faehigkeiten.levelKosten(e), aktion: tun(() => faehigkeiten.levelKaufen(w.key)) },
        { text: "Mergen (3 gleiche → " + (w.rang >= daten.waffen.seltenheiten.length - 1 ? "+1 Stern" : "nächste Qualität") + ") · " + w.kopien + "/2", aus: !faehigkeiten.mergbar(w.key), aktion: tun(() => faehigkeiten.mergen(w.key)) },
      ],
    };
  });
}

// Die ausgerüsteten Fähigkeiten als kleine runde Bilder unter dem Kampf.
function faehigkeitLeisteZeichnen() {
  const leiste = $("faehigkeit-leiste");
  const f = seite().faehigkeiten;
  const aktiv = frei("faehigkeiten") ? f.ausgeruestet.slice(0, faehigkeiten.plaetze()) : [];
  const k = aktiv.join(",");
  if (leiste.dataset.k === k) return;
  leiste.dataset.k = k;
  leiste.replaceChildren();
  for (const id of aktiv) {
    const w = faehigkeiten.werte(faehigkeiten.eintrag(id));
    if (!w) continue;
    const b = el("span", "faehigkeit-punkt");
    b.style.backgroundImage = grafik.faehigkeitBild(w.art);
    b.style.backgroundColor = w.seltenheit.farbe;
    leiste.append(b);
  }
}

// ---------- Reittiere ----------

function reittierAnzeigen() {
  const a = REITTIER_SICHTBAR && frei("reittiere") ? reittiere.aktiv() : null;
  const bild = $("reittier-bild");
  bild.hidden = !a;
  $("spieler-box").classList.toggle("reitet", !!a);
  if (a) bild.style.backgroundImage = grafik.reittierBild(a.id);
  spielerBildSetzen(); // im Sattel sitzt die Figur
}

function reittiereZeichnen() {
  const a = reittiere.aktiv();
  $("reittier-tempo").textContent = a ? "Tempo +" + prozent(a.tempo) : "";
  const liste = reittiere.liste();
  $("reittier-mergen").hidden = !liste.some((w) => reittiere.mergbar(w.nr));
  const box = $("reittier-liste");
  box.replaceChildren();
  if (!liste.length) box.append(el("p", "hinweis", "Noch kein Reittier. Aus Eiern schlüpft manchmal eins."));
  for (const w of liste)
    box.append(
      bildKachel({
        titel: w.name,
        farbe: w.seltenheit.farbe,
        glanz: w.seltenheit.glanz,
        bild: grafik.reittierBild(w.id),
        sterne: w.sterne,
        lv: bitcoin.stufe("reittier-" + w.nr) > 0 ? "Lv. " + bitcoin.stufe("reittier-" + w.nr) : a && a.nr === w.nr ? "an" : "",
        punkt: reittiere.mergbar(w.nr),
        klick: () => reittierInfo(w.nr),
      })
    );
}

function reittierInfo(nr) {
  infoZeigen(() => {
    const a = reittiere.aktiv();
    const w = reittiere.liste().find((x) => x.nr === nr);
    if (!w) return null;
    const tun = (aktion) => () => {
      aktion();
      reittierAnzeigen();
      rasterZeichnen();
      reittiereZeichnen();
      sichern();
    };
    return {
      titel: w.name + " " + "★".repeat(w.sterne),
      titelFarbe: w.seltenheit.farbe,
      bild: grafik.reittierBild(w.id),
      farbe: w.seltenheit.farbe,
      zeilen: [
        marken([[w.seltenheit.name, w.seltenheit.farbe], ["Zeitalter " + zeitalterVon(w.zeitalter).nummer], ["Tempo +" + prozent(w.tempo)]]),
        w.bonusArt && REITTIER_BONUS[w.bonusArt] ? marken([[REITTIER_BONUS[w.bonusArt](w.bonusWert)]]) : "",
        "Mit Reittier greifst du schneller an. Der zweite Bonus wirkt, solange es gesattelt ist.",
        haendlerZeile("reittier-" + w.nr),
      ],
      knoepfe: [
        haendlerKnopf("reittier-" + w.nr),
        { text: a && a.nr === w.nr ? "Gesattelt" : "Satteln", aus: !!a && a.nr === w.nr, aktion: tun(() => reittiere.satteln(w.nr)) },
        { text: "Mergen (3 gleiche → nächste Stufe)", aus: !reittiere.mergbar(w.nr), aktion: tun(() => reittiere.mergen(w.nr)) },
      ],
    };
  });
}

// ---------- Bitcoin und Händler ----------

const PLATZ_NAMEN = Object.fromEntries(PLAETZE.map(([art, name]) => [art, name]));

function btcGeaendert() {
  btcZeichnen();
  rasterZeichnen();
  anzeigeAktualisieren();
  sichern();
}

function btcKnoepfe() {
  const b = seite().btc;
  const btcDa = frei("bitcoin");
  $("btc-teil").hidden = !btcDa;
  if (!btcDa) return;
  $("btc-guthaben").textContent = "Dein ₿: " + btc(b.menge);
  $("btc-kurs").textContent = "Kurs: 1 " + waehrung().name + " = " + btc(waehrung().btcProStueck) + " ₿ · Händler-Kasse: " + btc(b.kasse) + " ₿";
}

function btcZeichnen() {
  // Je Händler eine Kachel pro Platz, den er verbessert. Antippen zeigt Preis und Wirkung.
  const platzFrei = (p) => (p === "tier" ? frei("tiere") : p === "reittier" ? frei("reittiere") : p.startsWith("set-") ? frei("dungeons") : true);
  const liste = $("haendler-liste");
  liste.replaceChildren();
  for (const h of bitcoin.haendler()) {
    if (!h.offen) continue;
    for (const platz of h.plaetze) {
      if (!platzFrei(platz)) continue;
      if (HAENDLER_NAMEN[platz]) {
        const lv = bitcoin.stufe(platz);
        let bild = grafik.symbolBild("tiere");
        if (platz === "reittier") bild = grafik.symbolBild("held");
        if (platz.startsWith("set-")) bild = grafik.setTeilBild(platz.slice(4), sets.angelegt(platz.slice(4)) ? sets.angelegt(platz.slice(4)).set : null);
        liste.append(bildKachel({ titel: HAENDLER_NAMEN[platz], farbe: "#6a4a8a", bild, lv: lv > 0 ? "Lv. " + lv : "", marke: HAENDLER_NAMEN[platz].replace("Set-", ""), klick: () => haendlerInfo(platz) }));
      } else liste.append(platzKachel(platz, PLATZ_NAMEN[platz], () => stueckInfo(platz)));
    }
  }
  btcKnoepfe();
}

// ---------- Tech-Baum ----------

function techZeiten() {
  for (const feld of document.querySelectorAll(".tech-knoten.laeuft .tech-stand")) {
    const l = tech.laeuft(techAst);
    feld.textContent = l ? dauer(Math.max(0, Math.ceil((l.bis - Date.now()) / 1000))) : "";
  }
}

const AST_BILD = { produktion: "beutel", kampf: "schwert", handel: "farm", haushalt: "held", sets: "schluessel" };

// Der Baum wächst von oben nach unten: je Ebene ein Knoten in der Mitte, darunter zwei an den Seiten.
function techZeichnen() {
  $("tech-punkte").textContent = "⚗ " + stand.gemeinsam.tech.punkte;
  const reiter = $("tech-reiter");
  reiter.replaceChildren();
  for (const a of tech.aeste()) {
    const offen = tech.astOffen(a.id);
    const k = el("button", "ast-knopf" + (a.id === techAst ? " an" : "") + (offen ? "" : " zu"));
    k.type = "button";
    k.title = a.name;
    k.style.backgroundImage = grafik.symbolBild(offen ? AST_BILD[a.id] || "tech" : "schloss");
    k.addEventListener("click", () => {
      techAst = a.id;
      techZeichnen();
    });
    reiter.append(k);
  }
  const box = $("tech-ebenen");
  box.replaceChildren();
  const a = tech.aeste().find((x) => x.id === techAst);
  box.append(el("div", "tech-ast-name", a.name));
  if (!tech.astOffen(a.id)) {
    const grund = { farm: "mit dem Trading (Zeitalter 9)", haushalt: "mit der Firma (Zeitalter 8)", dungeons: "mit den Dungeons" }[a.offen];
    box.append(el("p", "hinweis", "Öffnet sich " + (grund || "später") + "."));
    return;
  }
  const baum = el("div", "tech-baum");
  const lauf = tech.laeuft(a.id);
  for (let eb = 1; eb <= tech.ebenen(); eb++) {
    const offen = tech.ebeneOffen(a.id, eb);
    const knoten = (nr) => {
      const k = tech.knoten(a.id, eb, nr);
      const st = tech.stufe(k.id);
      const voll = st >= tech.maxStufe();
      const laeuft = !!lauf && lauf.knoten === k.id;
      const knopf = el("button", "tech-knoten" + (voll ? " voll" : "") + (offen ? "" : " zu") + (laeuft ? " laeuft" : ""));
      knopf.type = "button";
      const rund = el("span", "tech-rund");
      rund.style.backgroundImage = grafik.techBild(k.effekt.id);
      knopf.append(rund, el("span", "tech-stand", voll ? "Max" : st + "/" + tech.maxStufe()));
      knopf.addEventListener("click", () => techInfo(a.id, eb, nr));
      return knopf;
    };
    const oben = el("div", "tech-zeile eins");
    oben.append(knoten(1));
    const unten = el("div", "tech-zeile zwei");
    unten.append(knoten(2), knoten(3));
    baum.append(oben, unten);
    if (!offen) break; // nur die erste gesperrte Ebene zeigen
  }
  box.append(baum);
  techZeiten();
}

function techInfo(astId, eb, nr) {
  infoZeigen(() => {
    const k = tech.knoten(astId, eb, nr);
    const st = tech.stufe(k.id);
    const voll = st >= tech.maxStufe();
    const offen = tech.ebeneOffen(astId, eb);
    const lauf = tech.laeuft(astId);
    const hier = !!lauf && lauf.knoten === k.id;
    return {
      titel: k.effekt.name,
      bild: grafik.techBild(k.effekt.id),
      farbe: voll ? "#4fc46a" : "#c98a5e",
      rund: true,
      zeilen: [
        k.effekt.text + " je Stufe.",
        marken([["Stufe " + st + "/" + tech.maxStufe()], voll ? ["fertig"] : ["⚗ " + tech.kosten(k)], voll ? ["Ebene " + eb] : ["⏱ " + dauer(tech.dauer(k))]]),
        !offen ? "Gesperrt: erst Zeitalter " + eb + " und jeden Knoten der Ebene davor einmal erforschen." : hier ? "Wird gerade erforscht." : lauf ? "In diesem Ast läuft schon eine Forschung." : "",
      ],
      knoepfe: [
        {
          text: voll ? "Maximum" : "Forschen",
          aus: voll || !offen || !!lauf,
          zu: true,
          aktion: () => {
            const fehler = tech.starten(astId, eb, nr);
            if (fehler) return kurzMeldung(fehler);
            techZeichnen();
            sichern();
          },
        },
        ...(hier ? [energieKnopf((lauf.bis - Date.now()) / 1000, (sek) => ((lauf.bis -= sek * 1000), techZeichnen()))] : []),
      ],
    };
  });
}

// ---------- Haushalt und Firma ----------

function haushaltZeichnen() {
  const h = seite().haushalt;
  const j = haushalt.job();
  const w = waehrung().name;
  const firmaName = j.firma;
  $("hh-job").textContent = "Job: " + j.job + " · +" + zahl(haushalt.gehaltProMinute()) + " " + w + " pro Minute";
  $("hh-rechnung").textContent = "Rechnungen (" + j.rechnungen + "): −" + zahl(haushalt.rechnungProStunde()) + " " + w + " pro Stunde, automatisch";
  const zins = haushalt.zinsProTag();
  $("hh-zins").hidden = $("hh-schulden").hidden = !frei("bank");
  $("hh-firma-teil").hidden = !frei("firma");
  $("hh-zins").textContent =
    zins > 0
      ? "Sparzins: " + prozent(zins) + " pro Tag auf dein Guthaben"
      : "Sparzins: ab " + zahl(daten.haushalt.zinsStufen[0].ab) + " " + w + " Guthaben gibt es Zinsen";
  $("hh-schulden").textContent =
    h.schulden > 0
      ? "Schulden: " + zahl(h.schulden) + " " + w + " · Einnahmen gebremst um " + prozent(haushalt.bremse()) + " (zahlt sich automatisch ab)"
      : "Keine Schulden.";
  $("hh-firma").textContent =
    h.firma === 0
      ? "Firma: noch keine. Gründen kostet " + zahl(haushalt.firmaKosten()) + " " + w + "."
      : firmaName + " · Stufe " + h.firma + " · +" + zahl(haushalt.firmaEinkommenProMinute()) + " " + w + " pro Minute";
  const fk = $("hh-firma-knopf");
  fk.textContent = haushalt.firmaVoll()
    ? "Firma ist auf Maximum"
    : (h.firma === 0 ? "Firma gründen (" : "Firma ausbauen (") + zahl(haushalt.firmaKosten()) + " " + w + ")";
  fk.classList.toggle("matt", haushalt.firmaVoll() || guthaben() < haushalt.firmaKosten());
  const box = $("hh-aussehen");
  if (box.childElementCount !== daten.haushalt.aussehen.length || box.dataset.aktiv !== stand.gemeinsam.figur.aussehen.aktiv) {
    box.replaceChildren();
    box.dataset.aktiv = stand.gemeinsam.figur.aussehen.aktiv;
    for (const a of haushalt.aussehenListe()) {
      const hat = stand.gemeinsam.figur.aussehen.besitz.includes(a.id);
      const aktiv = stand.gemeinsam.figur.aussehen.aktiv === a.id;
      const k = el("button", "knopf klein", a.name + (aktiv ? " ✓" : hat ? "" : " · " + zahl(haushalt.aussehenPreis(a)) + " " + w));
      k.type = "button";
      k.style.background = a.farbe;
      k.addEventListener("click", () => {
        if (!haushalt.aussehenKaufen(a)) return kurzMeldung("Zu wenig " + w + ".");
        farbenSetzen();
        haushaltZeichnen();
        sichern();
      });
      box.append(k);
    }
  }
}

// ---------- Farm und Trading ----------

function linie(werte) {
  if (werte.length < 2) return "";
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const spanne = max - min || 1;
  return werte.map((v, i) => ((i / (werte.length - 1)) * 100).toFixed(1) + "," + (28 - ((v - min) / spanne) * 26).toFixed(1)).join(" ");
}

function farmZeichnen(neu) {
  const offenFarm = { trading: frei("trading"), mining: frei("bitcoin") };
  if (!offenFarm[farmReiter]) farmReiter = offenFarm.trading ? "trading" : "mining";
  $("farm-reiter").hidden = !(offenFarm.trading && offenFarm.mining);
  $("farm-btc").hidden = !frei("bitcoin");
  for (const b of document.querySelectorAll("#farm-reiter button")) b.classList.toggle("matt", b.dataset.reiter !== farmReiter);
  $("trading-teil").hidden = farmReiter !== "trading";
  $("mining-teil").hidden = farmReiter !== "mining";
  const w = waehrung().name;
  $("farm-btc").textContent =
    "Dein ₿ " + btc(seite().btc.menge) + " · 1 " + w + " = " + btc(btcKurs()) + " ₿" + (farm.imCrash() ? " · CRASH, günstig nachkaufen!" : "");
  if (farmReiter === "trading") {
    const einsatz = Math.floor(guthaben() * 0.1);
    $("trading-einsatz").textContent = "Einsatz je Trade: 10 % deines Geldes = " + zahl(einsatz) + " " + w + " (kein Hebel)";
    const liste = $("trading-werte");
    if (neu || liste.childElementCount !== farm.offeneWerte().length) {
      liste.replaceChildren();
      for (const x of farm.offeneWerte()) {
        const karte = el("div", "wert");
        karte.dataset.wert = x.id;
        const kopf = el("div", "wert-kopf");
        kopf.append(el("span", "wert-name", x.name), el("span", "wert-art " + x.art, x.art), el("span", "wert-preis"));
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 30");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.classList.add("wert-chart");
        const pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        svg.append(pl);
        const knoepfe = el("div", "btc-kauf");
        for (const [richtung, text] of [["long", "Long ↑"], ["short", "Short ↓"]]) {
          const k = el("button", "knopf klein", text);
          k.type = "button";
          k.addEventListener("click", () => {
            const e = Math.floor(guthaben() * 0.1);
            if (!farm.eroeffnen(x.id, richtung, e)) return kurzMeldung("Zu wenig Geld für einen Trade.");
            kurzMeldung(text + " " + x.name + " mit " + zahl(e) + " " + w);
            farmZeichnen(true);
            sichern();
          });
          knoepfe.append(k);
        }
        karte.append(kopf, svg, knoepfe);
        liste.append(karte);
      }
    }
    for (const karte of liste.children) {
      const id = karte.dataset.wert;
      karte.querySelector(".wert-preis").textContent = zahl(farm.preis(id));
      const v = farm.verlauf(id);
      const pl = karte.querySelector("polyline");
      pl.setAttribute("points", linie(v));
      pl.setAttribute("class", v.length > 1 && v[v.length - 1] < v[0] ? "faellt" : "steigt");
    }
    const pos = $("trading-positionen");
    pos.replaceChildren();
    farm.positionen().forEach((p, i) => {
      const name = (farm.offeneWerte().find((x) => x.id === p.wert) || { name: p.wert }).name;
      const g = farm.gewinn(p);
      const zeile = el("div", "lager-zeile");
      const info = el("span", "lager-info");
      const ergebnis = el("span", "lager-name", (g >= 0 ? "+" : "") + zahl(g) + " " + w);
      ergebnis.style.color = g >= 0 ? "#4fc46a" : "#e0564c";
      info.append(el("span", "hinweis", (p.richtung === "long" ? "Long " : "Short ") + name + " · " + zahl(p.einsatz) + " " + w), ergebnis);
      const k = el("button", "knopf klein", "Schließen");
      k.type = "button";
      k.addEventListener("click", () => {
        const erg = farm.schliessen(i);
        kurzMeldung("Trade geschlossen: " + (erg >= 0 ? "+" : "") + zahl(erg) + " " + w);
        farmZeichnen(true);
        sichern();
      });
      zeile.append(info, k);
      pos.append(zeile);
    });
    if (!farm.positionen().length)
      pos.append(el("p", "hinweis", "Keine offenen Trades. Long = du setzt auf steigende Kurse, Short = auf fallende. Ruhige Werte zahlen bei Long eine kleine Dividende."));
  } else {
    const l = farm.leistung();
    $("mining-stand").textContent =
      "Rechner " + farm.anzahlRechner() + "/" + farm.plaetze() + " · Leistung " + zahl(l.hash) + " · Strom " + zahl(l.watt) + " W (" + farm.energieName() + ")";
    $("mining-ertrag").textContent =
      "+" + btc(farm.btcProStunde()) + " ₿ pro Stunde · Strom −" + zahl(farm.stromProStunde()) + " " + w + " pro Stunde · offline höchstens " + daten.farm.farm.offlineStunden + " Std.";
    if (!neu) return;
    const rl = $("mining-rechner");
    rl.replaceChildren();
    for (const r of farm.rechnerListe()) {
      const zeile = el("div", "lager-zeile" + (r.offen ? "" : " zu"));
      const info = el("span", "lager-info");
      info.append(el("span", "lager-name", r.name + " ×" + r.anzahl), el("span", "hinweis", r.offen ? "Leistung " + r.hash + " · " + r.watt + " W" : "ab Zeitalter " + r.ab));
      const k = el("button", "knopf klein", zahl(farm.rechnerPreis(r)) + " " + w);
      k.type = "button";
      k.disabled = !r.offen;
      k.addEventListener("click", () => {
        const f = farm.rechnerKaufen(r);
        if (f) return kurzMeldung(f);
        kurzMeldung(r.name + " gekauft. Der Tech-Ast Handel und Mining ist offen.");
        farmZeichnen(true);
        sichern();
      });
      zeile.append(info, k);
      rl.append(zeile);
    }
    const tl = $("mining-teile");
    tl.replaceChildren();
    for (const t of farm.teileListe()) {
      const st = farm.teilStufe(t.id);
      const zeile = el("div", "lager-zeile");
      const info = el("span", "lager-info");
      info.append(el("span", "lager-name", t.name + " · Stufe " + st), el("span", "hinweis", t.text));
      const voll = st >= farm.teilMax();
      const k = el("button", "knopf klein", voll ? "Max" : zahl(farm.teilKosten(t.id)) + " " + w);
      k.type = "button";
      k.disabled = voll;
      k.addEventListener("click", () => {
        const f = farm.teilKaufen(t.id);
        if (f) return kurzMeldung(f);
        farmZeichnen(true);
        sichern();
      });
      zeile.append(info, k);
      tl.append(zeile);
    }
  }
}

// ---------- Seitenwechsel Gut/Böse (nur in der Zentrale = Menü, nie im Boss-Kampf) ----------

function seiteWechseln() {
  if (kampf.istBoss()) return kurzMeldung("Mitten im Boss-Kampf geht das nicht.");
  const ziel = stand.aktiveSeite === "gut" ? "boese" : "gut";
  const zielName = ziel === "boese" ? "Dieb" : "Beschützer";
  const neu = !stand.seiten[ziel];
  if (
    !confirm(
      "Zur " + zielName + "-Seite wechseln? Deine jetzige Seite wird gespeichert und wartet auf dich." +
        (neu ? " Die " + zielName + "-Seite startet beim ersten Mal von vorne." : " Die " + zielName + "-Seite macht dort weiter, wo sie aufgehört hat.")
    )
  )
    return;
  sichern();
  if (neu) {
    stand.seiten[ziel] = speicher.neueSeite(daten.einstellungen.startZeitalter);
    speicher.pruefen(stand);
  }
  stand.aktiveSeite = ziel;
  letzterTick = Date.now();
  kampf.neuStarten();
  fensterSchliessen("menue");
  allesZeichnen();
  sichern();
  const anim = $("wechsel-animation");
  anim.textContent = ziel === "boese" ? "🛡 ⚡ 🦹" : "🦹 ⚡ 🛡";
  anim.hidden = false;
  anim.classList.remove("los");
  void anim.offsetWidth;
  anim.classList.add("los");
  setTimeout(() => (anim.hidden = true), 1100);
}

// ---------- Aufgaben-Liste (Harry 25.11.2026: zeigt nächste Ziele, blockiert nichts) ----------
// Nur Punkte, die schon beschlossen sind: Zeitalter-Boss, Set-Dungeon des Zeitalters, Ausrüstung, Weg durch die 12 Zeitalter.
// Kosmos-Modus, Neustart-Zeitpunkt und Bitcoin-Meilensteine kommen dazu, sobald sie gebaut sind.
function aufgaben() {
  const liste = [];
  const s = seite();
  const nr = zeitalter().nummer;
  const maxStufe = daten.einstellungen.kampf.wellen.maxStufe || 100;
  // 1. Zeitalter-Boss
  const fehlt = aufstiegFehlt();
  if (fehlt === null) liste.push({ kopf: "Zeitalter-Boss", text: "Letztes Zeitalter erreicht." + (s.endbossBesiegt ? " Endboss besiegt." : " Der Endboss wartet auf Stufe " + maxStufe + "."), fertig: !!s.endbossBesiegt });
  else if (s.kampf.stufe < maxStufe) liste.push({ kopf: "Zeitalter-Boss", text: "Kampfstufe " + s.kampf.stufe + " von " + maxStufe + ". Auf Stufe " + maxStufe + " wartet der Boss von Zeitalter " + nr + "." });
  else liste.push({ kopf: "Zeitalter-Boss", text: fehlt.length ? "Boss wartet. Dafür fehlt noch: " + fehlt.join(", ") + "." : "Boss bereit: tippe auf den Boss-Knopf.", neu: !fehlt.length });
  // 2. Set-Dungeon des Zeitalters
  if (frei("dungeons")) {
    const d = offeneDungeons().find((x) => x.zeitalter === zeitalter().id);
    if (d) {
      const st = dungeons.stufe(d.zeitalter);
      liste.push(st > 1 ? { kopf: "Set-Dungeon", text: d.name + " geschafft (jetzt Stufe " + st + "). Weiter Set-Teile farmen.", fertig: true } : { kopf: "Set-Dungeon", text: "Den Dungeon-Wächter von " + d.name + " noch besiegen (Dungeons, 1 Schlüssel)." });
    }
  }
  // 3. Ausrüstung: welche Plätze haben noch nicht die beste Qualität des Zeitalters?
  const beste = waffen.maxSelten();
  const schwach = PLAETZE.filter(([p]) => {
    const w = waffen.werte(waffen.hole(p), p);
    return !w || daten.waffen.seltenheiten.indexOf(w.seltenheit) < beste;
  });
  const mergbar = waffen.lagerListe().some((e) => e.mergbar);
  if (mergbar) liste.push({ kopf: "Ausrüstung", text: "Im Lager liegen 3 gleiche Stücke: mergen gibt die nächste Qualität.", neu: true });
  liste.push(
    schwach.length
      ? { kopf: "Ausrüstung", text: schwach.length + " von 12 Plätzen unter " + daten.waffen.seltenheiten[beste].name + " (beste Qualität in Zeitalter " + nr + "). Gegner und Bosse lassen Items fallen." }
      : { kopf: "Ausrüstung", text: "Alle 12 Plätze haben die beste Qualität dieses Zeitalters.", fertig: true }
  );
  // 4. Begleitung durch die 12 Zeitalter
  const naechstes = daten.zeitalter.find((z) => z.nummer === nr + 1);
  liste.push({ kopf: "Weg durch die Zeitalter", text: "Zeitalter " + nr + " von 12: " + zeitalter().name + "." + (naechstes ? " Als Nächstes: " + naechstes.name + " (Währung " + naechstes.waehrung.name + ", Höchststufe " + 10 * naechstes.nummer + ")." : " Das ist das letzte Zeitalter.") });
  return liste;
}

function aufgabenZeigen() {
  infoZeigen(() => {
    const box = el("div", "ziel-liste");
    for (const a of aufgaben()) {
      const z = el("div", "ziel" + (a.fertig ? " fertig" : ""));
      z.append(el("b", null, (a.fertig ? "✓ " : "") + a.kopf), document.createTextNode(a.text));
      box.append(z);
    }
    return { titel: "Aufgaben-Liste", bild: grafik.symbolBild("stern"), zeilen: [el("div", "hinweis", "Deine nächsten Ziele. Nichts davon ist Pflicht."), box], knoepfe: [{ text: "Weiter", zu: true, aktion: () => {} }] };
  });
}

let zieleTakt = 0;
function zieleKnopfZeichnen() {
  if (++zieleTakt % 8 !== 1) return; // nicht bei jedem Tick neu rechnen
  $("ziele-knopf").classList.toggle("neu", aufgaben().some((a) => a.neu));
}

// ---------- Kampf: Boss und Aufstieg ----------

// Beute in der freien Welt (Harry 16.11.2026): Fähigkeitspunkte, Tech-Punkte (seltener) und Dungeon-Schlüssel.
function weltBeute(gegner) {
  const b = daten.einstellungen.beute;
  const typ = gegner.boss || gegner.zwischen ? "boss" : gegner.typ; // Zwischen-Boss gibt Boss-Beute
  // Je weiter man in den Kampfstufen ist, desto öfter fällt etwas (Harry 17.11.2026).
  const stufenBonus = 1 + ((b.stufenBonus && b.stufenBonus.jeStufe) || 0) * (seite().kampf.stufe - 1);
  const setDrop = (1 + setExtra("drop")) * (typ === "boss" ? 1 + setExtra("bossDrop") : 1);
  const wurf = (art, plus) => Math.random() < (b[art].chance[typ] || 0) * (1 + plus) * stufenBonus * setDrop;
  const menge = (art) => (b[art].menge && b[art].menge[typ]) || 1;
  if (frei("faehigkeiten") && wurf("fpunkte", tech.wert("fpunkte") + reittierBonus("fpunkte"))) {
    seite().faehigkeiten.punkte += menge("fpunkte");
    beuteZeigen(gegner, grafik.symbolBild("stern"));
  }
  if (frei("tech") && wurf("techpunkte", tech.wert("techpunkte"))) {
    stand.gemeinsam.tech.punkte += menge("techpunkte");
    beuteZeigen(gegner, grafik.symbolBild("tech"));
  }
  if (frei("dungeons") && wurf("schluessel", tech.wert("tickets") + reittierBonus("schluessel"))) {
    dungeons.schluesselGeben(menge("schluessel"));
    beuteZeigen(gegner, grafik.symbolBild("schluessel"));
  }
  // Harry 16.11.2026: Reittiere fallen selten auch bei Gegnern.
  if (frei("reittiere") && b.reittier && wurf("reittier", perma.wert("reittierChance"))) {
    const neu = reittiere.geben(zeitalter().id);
    beuteZeigen(gegner, grafik.reittierBild(neu.id));
    kurzMeldung("Neues Reittier: " + neu.seltenheit.name + " – " + neu.name);
    reittierAnzeigen();
    if (!$("reittiere-fenster").hidden) reittiereZeichnen();
  }
}

// Überspringen gibt Beute (Harry 17.11.2026): für jede übersprungene Stufe werden die Drops der Gegner (Ebene 1–10) gewürfelt.
function sprungBeute(n, stufe) {
  const b = daten.einstellungen.beute;
  const pro = daten.einstellungen.kampf.wellen.proStufe;
  const anzahl = Math.round(n * ((pro * (pro + 1)) / 2));
  const stufenBonus = 1 + ((b.stufenBonus && b.stufenBonus.jeStufe) || 0) * (stufe - 1);
  const wurf = (art, plus) => Math.random() < (b[art].chance.normal || 0) * (1 + plus) * stufenBonus * (1 + setExtra("drop"));
  const menge = (art) => (b[art].menge && b[art].menge.normal) || 1;
  const sum = { fpunkte: 0, tech: 0, schluessel: 0, reittiere: 0, eier: 0 };
  for (let i = 0; i < anzahl; i++) {
    if (frei("faehigkeiten") && wurf("fpunkte", tech.wert("fpunkte") + reittierBonus("fpunkte"))) {
      seite().faehigkeiten.punkte += menge("fpunkte");
      sum.fpunkte += menge("fpunkte");
    }
    if (frei("tech") && wurf("techpunkte", tech.wert("techpunkte"))) {
      stand.gemeinsam.tech.punkte += menge("techpunkte");
      sum.tech += menge("techpunkte");
    }
    if (frei("dungeons") && wurf("schluessel", tech.wert("tickets") + reittierBonus("schluessel"))) {
      dungeons.schluesselGeben(menge("schluessel"));
      sum.schluessel += menge("schluessel");
    }
    if (frei("reittiere") && b.reittier && wurf("reittier", perma.wert("reittierChance"))) {
      reittiere.geben(zeitalter().id);
      sum.reittiere += 1;
    }
    if (frei("tiere") && tiere.eiWurf("normal")) sum.eier += 1;
  }
  const teile = [];
  if (sum.fpunkte) teile.push("+" + sum.fpunkte + " ★");
  if (sum.tech) teile.push("+" + sum.tech + " Tech");
  if (sum.schluessel) teile.push("+" + sum.schluessel + " Schlüssel");
  if (sum.eier) teile.push("+" + sum.eier + " Eier");
  if (sum.reittiere) teile.push("+" + sum.reittiere + " Reittiere");
  if (teile.length) kurzMeldung("Sprung-Beute: " + teile.join(" · "));
  reittierAnzeigen();
  if (!$("tiere-fenster").hidden) tiereZeichnen();
  if (!$("reittiere-fenster").hidden) reittiereZeichnen();
}

function kampfEreignis(name, gegner) {
  if (name === "sprung") return sprungBeute(gegner.n, gegner.stufe);
  if (name === "sieg" || name === "bossSieg") itemBeute(gegner);
  if (name === "sieg") {
    weltBeute(gegner);
    if (gegner.boss && frei("tiere") && Math.random() < tech.wert("bossEi")) {
      const extra = tiere.eiGeben(2.5, 0);
      kurzMeldung("Zweites Boss-Ei: " + extra.name);
    }
    const ei = tiere.eiWurf(gegner.typ);
    if (ei) {
      eiZeigen(gegner, ei.seltenheit.farbe);
      kurzMeldung("Ei gefunden: " + ei.seltenheit.name);
      if (!$("tiere-fenster").hidden) tiereZeichnen();
    }
    return;
  }
  if (name === "bossNiederlage") {
    kurzMeldung(gegner.name + " war zu stark. Rüste auf und versuch es noch mal.");
  } else if (name === "bossSieg") {
    aufsteigen(gegner);
  }
}

// Harry 25.11.2026: Items gibt es nur als Beute von Gegnern und Bossen (alle 12 Plätze).
function itemBeute(gegner) {
  const art = gegner.boss ? "boss" : gegner.zwischen ? "anfuehrer" : gegner.typ === "elite" ? "elite" : "normal";
  const r = waffen.beute(art);
  if (!r) return;
  beuteZeigen(gegner, grafik.stueckBild(r.neu.art, zeitalterVon(r.neu.zeitalter), r.neu.id, false));
  if (r.besser || r.neu.seltenheit !== daten.waffen.seltenheiten[0]) kurzMeldung(r.neu.seltenheit.name + ": " + r.neu.name + (r.besser ? " – angelegt!" : " – ins Lager."));
  if (r.besser) rasterZeichnen();
  if (!$("waffen-fenster").hidden) waffenZeichnen();
}

// Ein Ei fällt sichtbar beim besiegten Gegner auf den Weg und hüpft dann nach unten zum Helden-Knopf.
function eiZeigen(gegner, farbe) {
  beuteZeigen(gegner, grafik.eiBild(farbe));
}

// Etwas fällt sichtbar beim besiegten Gegner auf den Weg (Ei, Punkte, Schlüssel) und hüpft dann weg.
function beuteZeigen(gegner, bild) {
  if (document.hidden) return;
  const arena = $("arena");
  if (arena.querySelectorAll(".ei-beute").length >= 5) return;
  const ei = el("div", "ei-beute");
  ei.style.backgroundImage = bild;
  ei.style.left = 27 + Math.min(1.1, Math.max(0, gegner.x)) * 62 + "%";
  arena.append(ei);
  setTimeout(() => ei.remove(), 1700);
}

function aufsteigen(boss) {
  if (boss.endboss) {
    seite().endbossBesiegt = true;
    sichern();
    return hinweis(
      "Geschafft!",
      boss.name + " ist besiegt. Du hast die ganze Geschichte des Geldes durchgespielt – von Feuerstein bis Bitcoin. Du kannst weiter aufrüsten, Stufen klettern und die andere Seite spielen.",
      "🏆"
    );
  }
  const neu = daten.zeitalter.find((z) => z.id === boss.naechstesZeitalter);
  if (!neu) return;
  const s = seite();
  const alt = waehrung();
  const menge = guthaben();
  const getauscht = menge * (neu.umtauschVonVorher || 1);
  s.waehrungen[alt.id] = 0;
  s.waehrungen[neu.waehrung.id] = (s.waehrungen[neu.waehrung.id] || 0) + getauscht;
  const vorher = freiListe();
  s.zeitalter = neu.id;
  s.kampf = { index: 0, rate: 0, stufe: 1, welle: 1 };
  // Harry 17.11.2026: Die Upgrade-Stufen bleiben, jedes Zeitalter erweitert sie um 100 Stufen.
  const dazu = freiListe().filter((n) => !vorher.includes(n));
  freiBelohnen(dazu);
  const f = daten.einstellungen.freischalten;
  kampf.neuStarten();
  allesZeichnen();
  sichern();
  hinweis(
    "Aufstieg!",
    boss.name + " ist besiegt. Willkommen in Zeitalter " + neu.nummer + ": " + neu.name + ". Dein Vorrat wurde umgetauscht." +
      dazu.map((n) => " Neu: " + f[n].name + ". " + f[n].text).join(""),
    zahl(menge) + " " + alt.name + " → " + zahl(getauscht) + " " + neu.waehrung.name
  );
}

function kaufen(u) {
  const preis = kosten(u);
  if (stufe(u) >= capOf(u) || guthaben() < preis) return;
  seite().waehrungen[waehrung().id] = guthaben() - preis;
  seite().upgrades[u.id] = stufe(u) + 1;
  upgradesZeichnen();
  sichern();
}

// ---------- Fenster und Meldungen ----------

function fensterZeigen(id) {
  const g = gruppeVon(id);
  if (g) seiteOeffnen(g.id, id);
  else $(id).hidden = false;
}

function fensterSchliessen(id) {
  if (gruppeVon(id)) {
    if (offenerReiter === id) seiteSchliessen();
  } else $(id).hidden = true;
}

let meldungZeit;
function kurzMeldung(text) {
  const m = $("kurzmeldung");
  m.textContent = text;
  m.hidden = false;
  clearTimeout(meldungZeit);
  meldungZeit = setTimeout(() => (m.hidden = true), 2500);
}

// Offline (Harry 16.11.2026): Grenze und Anteil, beides im Tech-Baum erhöhbar.
const offlineMaxStunden = () => Math.min(24, daten.einstellungen.offline.maxStunden + tech.wert("offline"));
const offlineAnteil = () => Math.min(1, daten.einstellungen.offline.anteil + tech.wert("offlineBeute"));

// Aus dem gemessenen Kampf-Tempo wird ausgerechnet, wie viele Gegner man in der Zeit besiegt hätte (im selben
// Anteil wie das Geld). Daraus gibt es Erfahrung, Eier, Punkte und Schlüssel. Die Stufe bleibt stehen.
function offlineBeute(sekunden) {
  const r = seite().kampf.raten || {};
  const anteil = offlineAnteil();
  const b = daten.einstellungen.beute;
  const typen = ["schwach", "normal", "elite"];
  // Erwartungswert ganzzahlig machen: Ganzes sicher, Rest als Wurf.
  const ganz = (x) => Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0);
  const erwartet = (chance, plus) => typen.reduce((s, t) => s + (r[t] || 0) * sekunden * anteil * (chance[t] || 0), 0) * (1 + plus);
  const ergebnis = { siege: Math.round(typen.reduce((s, t) => s + (r[t] || 0), 0) * sekunden * anteil), xp: 0, eier: 0, fpunkte: 0, techpunkte: 0, schluessel: 0, reittiere: 0 };
  const levelVorher = seite().level;
  ergebnis.xp = Math.round((r.xp || 0) * sekunden * anteil);
  if (ergebnis.xp > 0) xpGeben(ergebnis.xp);
  ergebnis.level = seite().level - levelVorher;
  if (frei("tiere")) {
    const platz = Math.max(0, daten.tiere.eierLagerMax - seite().tiere.eier.length);
    ergebnis.eier = Math.min(platz, ganz(erwartet(daten.tiere.eiChance, tech.wert("eier") + reittierBonus("eier"))));
    for (let i = 0; i < ergebnis.eier; i++) tiere.eiGeben(daten.tiere.eiRatio.normal, 0);
  }
  if (frei("faehigkeiten")) {
    ergebnis.fpunkte = ganz(erwartet(b.fpunkte.chance, tech.wert("fpunkte") + reittierBonus("fpunkte")));
    seite().faehigkeiten.punkte += ergebnis.fpunkte;
  }
  if (frei("tech")) {
    ergebnis.techpunkte = ganz(erwartet(b.techpunkte.chance, tech.wert("techpunkte")));
    stand.gemeinsam.tech.punkte += ergebnis.techpunkte;
  }
  if (frei("dungeons")) {
    const vorher = dungeons.schluessel();
    dungeons.schluesselGeben(ganz(erwartet(b.schluessel.chance, tech.wert("tickets") + reittierBonus("schluessel"))));
    ergebnis.schluessel = dungeons.schluessel() - vorher;
  }
  // Version 51: Ausrüstung fällt auch offline (wie im Kampf, höchstens 30 Stück je Abwesenheit).
  {
    const wb = daten.waffen.beute;
    const n = Math.min(30, ganz(erwartet({ schwach: wb.chance.normal, normal: wb.chance.normal, elite: wb.chance.elite }, setExtra("drop"))));
    ergebnis.items = 0;
    ergebnis.itemsAn = 0;
    for (let i = 0; i < n; i++) {
      const r = waffen.schmiedenGratis();
      if (!r) break;
      ergebnis.items += 1;
      if (r.besser) ergebnis.itemsAn += 1;
    }
  }
  if (frei("reittiere") && b.reittier) {
    ergebnis.reittiere = Math.min(20, ganz(erwartet(b.reittier.chance, perma.wert("reittierChance"))));
    for (let i = 0; i < ergebnis.reittiere; i++) reittiere.geben(zeitalter().id);
  }
  return ergebnis;
}

// Willkommen-Fenster: wie lange weg, wie viel davon zählt, und jede Belohnung als Symbol mit Zahl.
function offlineMeldung(wegSekunden, gezaehlt, menge, beute) {
  infoZeigen(() => {
    const zeilen = [
      marken([["⏱ Weg: " + dauer(wegSekunden)]]),
      marken([["Gezählt: " + dauer(gezaehlt) + " von höchstens " + offlineMaxStunden() + " Std."], ["Ertrag " + Math.round(offlineAnteil() * 100) + " %"]]),
    ];
    const liste = el("div", "beute-liste");
    const eintrag = (bild, text) => {
      const e = el("span", "beute-eintrag");
      const b = el("span", "wert-bild gross");
      b.style.backgroundImage = bild;
      e.append(b, el("span", null, text));
      liste.append(e);
    };
    eintrag(grafik.waehrungBild(zeitalter()), "+" + zahl(menge) + " " + waehrung().name);
    if (beute.xp > 0) eintrag(grafik.symbolBild("stern"), "+" + zahl(beute.xp) + " Erfahrung" + (beute.level > 0 ? " (+" + beute.level + " Level)" : ""));
    if (beute.eier > 0) eintrag(grafik.symbolBild("ei"), "+" + beute.eier + (beute.eier === 1 ? " Ei" : " Eier"));
    if (beute.fpunkte > 0) eintrag(grafik.symbolBild("stern"), "+" + beute.fpunkte + " Fähigkeitspunkte");
    if (beute.techpunkte > 0) eintrag(grafik.symbolBild("tech"), "+" + beute.techpunkte + " Tech-Punkte");
    if (beute.items > 0) eintrag(grafik.stueckBild("helm", zeitalter(), "", false), "+" + beute.items + " Ausrüstung" + (beute.itemsAn > 0 ? " (" + beute.itemsAn + " angelegt)" : ""));
    if (beute.schluessel > 0) eintrag(grafik.symbolBild("schluessel"), "+" + beute.schluessel + " Schlüssel");
    if (beute.reittiere > 0) eintrag(grafik.symbolBild("tiere"), "+" + beute.reittiere + (beute.reittiere === 1 ? " Reittier" : " Reittiere"));
    if (beute.energie > 0) eintrag(grafik.symbolBild("blitz"), "+" + beute.energie + " Energie");
    zeilen.push(liste);
    if (beute.siege > 0) zeilen.push(el("div", "hinweis", "Etwa " + zahl(beute.siege) + " Gegner besiegt. Die Stufe bleibt, bis du wieder spielst."));
    return { titel: "Willkommen zurück!", bild: grafik.symbolBild("uhr"), rund: true, zeilen, knoepfe: [{ text: "Weiter", zu: true, aktion: () => {} }] };
  });
}

function hinweis(titel, text, menge) {
  $("hinweis-titel").textContent = titel;
  $("hinweis-text").textContent = text;
  $("hinweis-menge").textContent = menge;
  fensterZeigen("hinweis");
}

// ---------- Export / Import ----------

function exportDatei() {
  const text = speicher.alsText(stand);
  const datum = new Date().toISOString().slice(0, 10);
  const link = el("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = "the-game-spielstand-" + datum + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  kurzMeldung("Spielstand als Datei gespeichert.");
}

async function exportText() {
  const text = speicher.alsText(stand);
  $("import-text").value = text;
  try {
    await navigator.clipboard.writeText(text);
    kurzMeldung("Spielstand kopiert.");
  } catch {
    kurzMeldung("Text steht im Feld unten, bitte dort kopieren.");
  }
}

function importieren(text) {
  const ergebnis = speicher.ausText(text);
  if (ergebnis.fehler) {
    kurzMeldung(ergebnis.fehler);
    return;
  }
  if (!confirm("Den jetzigen Spielstand durch den importierten ersetzen?")) return;
  speicher.sichern(stand); // alter Stand bleibt als Sicherung im Browser
  stand = ergebnis.stand;
  letzterTick = Date.now(); // Import zählt nicht als Offline-Zeit
  kampf.neuStarten();
  sichern();
  allesZeichnen();
  $("import-text").value = "";
  fensterSchliessen("menue");
  kurzMeldung("Spielstand importiert.");
}

// Sicherung zurückholen: tauscht den jetzigen Stand mit der Sicherung (so lässt sich auch das wieder rückgängig machen).
function sicherungInfo() {
  const alt = speicher.sicherungLaden();
  infoZeigen(() => {
    if (!alt) return { titel: "Keine Sicherung", bild: grafik.symbolBild("schloss"), zeilen: ["Es gibt noch keine Sicherung. Sie entsteht beim Löschen und bei jedem Neustart."] };
    const s = alt.seiten[alt.aktiveSeite];
    const z = daten.zeitalter.find((x) => x.id === s.zeitalter) || daten.zeitalter[0];
    const wann = new Date(alt.zuletztGespeichert || Date.now()).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
    return {
      titel: "Sicherung zurückholen",
      bild: grafik.symbolBild("uhr"),
      zeilen: [
        marken([["Zeitalter " + z.nummer], ["Stufe " + ((s.kampf && s.kampf.stufe) || 1)], ["Lv " + (s.level || 1)]]),
        "Gespeichert am " + wann + ". Dein jetziger Stand wird dafür zur neuen Sicherung, du kannst also zurücktauschen.",
      ],
      knoepfe: [
        {
          text: "Zurückholen",
          zu: true,
          aktion: () => {
            const jetzt = JSON.parse(JSON.stringify(stand));
            speicher.sichern(jetzt);
            stand = alt;
            speicher.speichern(stand);
            location.reload();
          },
        },
      ],
    };
  });
}

function neuAnfangen() {
  if (!confirm("Wirklich neu anfangen? Der jetzige Spielstand wird ersetzt.")) return;
  speicher.sichern(stand);
  stand = speicher.neuerStand(daten.einstellungen.startZeitalter);
  letzterTick = Date.now();
  kampf.neuStarten();
  sichern();
  allesZeichnen();
  fensterSchliessen("menue");
}

// ---------- Version 34: Energie, Neustart, Perma-Baum, Sammelbuch (Harry 16.11.2026) ----------

// Alle 10 Minuten 1 Energie, höchstens 100 (läuft auch offline über die Uhrzeit).
function energieSchritt(jetzt) {
  const e = daten.einstellungen.energie;
  const en = stand.gemeinsam.energie;
  const takt = e.alleSekunden * 1000;
  if (en.wert >= e.max) {
    en.letzter = jetzt;
    return;
  }
  const n = Math.floor((jetzt - en.letzter) / takt);
  if (n > 0) {
    en.wert = Math.min(e.max, en.wert + n);
    en.letzter += n * takt;
  }
}
const energieMinuten = () => {
  const e = daten.einstellungen.energie;
  return Math.min(e.maxMinutenJePunkt, e.minutenJePunkt + perma.wert("energieZeit"));
};
// Knopf für ein Info-Fenster: verbraucht so viel Energie wie nötig (höchstens alles), um die Restzeit zu verkürzen.
function energieKnopf(restSek, anwenden) {
  const en = stand.gemeinsam.energie;
  const proPunkt = energieMinuten() * 60;
  const nutzen = Math.min(en.wert, Math.ceil(Math.max(0, restSek) / proPunkt));
  const gespart = Math.min(Math.max(0, restSek), nutzen * proPunkt);
  return {
    text: nutzen > 0 ? "⚡ " + nutzen + " Energie · −" + dauer(Math.ceil(gespart)) : "⚡ Keine Energie",
    aus: nutzen < 1 || !(restSek > 0),
    aktion: () => {
      en.wert -= nutzen;
      anwenden(gespart);
      kurzMeldung("⚡ " + dauer(Math.ceil(gespart)) + " gespart");
      anzeigeAktualisieren();
      sichern();
    },
  };
}
function energieInfo() {
  infoZeigen(() => {
    const e = daten.einstellungen.energie;
    const en = stand.gemeinsam.energie;
    const naechste = en.wert >= e.max ? null : Math.max(0, Math.ceil((en.letzter + e.alleSekunden * 1000 - Date.now()) / 1000));
    return {
      titel: "Energie " + en.wert + "/" + e.max,
      bild: grafik.symbolBild("blitz"),
      zeilen: [
        "Alle " + Math.round(e.alleSekunden / 60) + " Minuten kommt 1 Energie dazu, höchstens " + e.max + ".",
        marken([["1 Energie = " + energieMinuten() + " Min."], [naechste === null ? "voll" : "nächste in " + dauer(naechste)]]),
        "Damit verkürzt du Wartezeiten: Forschung und Brüten (dort antippen). Im Perma-Baum wird 1 Energie bis zu 1 Stunde wert.",
      ],
    };
  });
}
function brutInfo(i) {
  infoZeigen(() => {
    const b = seite().tiere.brueten[i];
    if (!b) return null;
    const selten = daten.waffen.seltenheiten[b.ei.seltenheit] || daten.waffen.seltenheiten[0];
    const rest = Math.max(0, (b.fertigUm - Date.now()) / 1000);
    return {
      titel: "Ei im Nest",
      bild: grafik.eiBild(selten.farbe),
      zeilen: [marken([[selten.name, selten.farbe], ["⏱ " + dauer(Math.ceil(rest))]])],
      knoepfe: [energieKnopf(rest, (sek) => (b.fertigUm -= sek * 1000))],
    };
  });
}

// Neustart: alles auf dieser Seite beginnt neu, außer Tech-Baum, Perma-Baum, Energie und Sammelbuch.
function neustartInfo() {
  // aus dem Perma-Reiter heraus
  infoZeigen(() => {
    const nr = zeitalter().nummer;
    const st = seite().kampf.stufe;
    const p = perma.punkteFuer(nr, st);
    return {
      titel: "Neustart",
      bild: grafik.symbolBild("krone"),
      zeilen: [
        marken([["+" + p + " Perma-Punkte"], ["Zeitalter " + nr], ["Stufe " + st]]),
        "Neu beginnt alles auf dieser Seite: Zeitalter, Level, Geld, Upgrades, Ausrüstung, Tiere, Reittiere, Sets, Fähigkeiten.",
        "Es bleibt: Tech-Baum, Perma-Baum, Energie und Sammelbuch.",
        "Perma-Punkte gibt es nur durch einen Neustart: 10 je Zeitalter ab dem zweiten, dazu 1 je 5 Stufen. Ausgeben unter Forschung → Perma 👑.",
      ],
      knoepfe: [{ text: p > 0 ? "Neustart · +" + p + " 👑" : "Noch keine Perma-Punkte", aus: p <= 0, zu: true, aktion: neustartMachen }],
    };
  });
}
function neustartMachen() {
  const p = perma.punkteFuer(zeitalter().nummer, seite().kampf.stufe);
  if (p <= 0) return;
  speicher.sichern(stand); // Sicherung des alten Stands
  sammelbuchPruefen();
  perma.gutschreiben(p);
  stand.seiten[stand.aktiveSeite] = speicher.neueSeite(daten.einstellungen.startZeitalter);
  letzterTick = Date.now();
  kampf.neuStarten();
  sichern();
  allesZeichnen();
  seiteSchliessen();
  hinweis("Neustart!", "Du hast " + p + " Perma-Punkte bekommen. Gib sie unter Forschung → Perma 👑 aus – sie bleiben für immer.", "👑");
}

const PERMA_BILD = {
  schaden: "schwert", leben: "herz", xp: "stern", zeitalterTempo: "uhr", fruehStaerke: "herz", bossSchaden: "krone", beute: "muenze", tickets: "schluessel", eier: "ei",
  reittierChance: "tiere", fpunkte: "stern", techpunkte: "tech", schmiedeSelten: "amboss", autoSchmiede: "uhr", rabatt: "upgrades",
  energieZeit: "blitz", offline: "uhr", offlineBeute: "beutel", schluepfen: "nest", supporter: "tiere", setStaerke: "schild", setSelten: "schatz",
};
// Eigene Seite „Perma“ unter Forschung, mit dem Neustart-Knopf ganz oben.
function permaSeiteZeichnen() {
  $("perma-punkte").textContent = "👑 " + perma.punkte();
  const box = $("perma-inhalt");
  box.replaceChildren();
  permaZeichnen(box);
}
function permaZeichnen(box) {
  box.append(el("div", "tech-ast-name", perma.neustarts() + " Neustarts bisher"));
  for (const a of perma.aeste()) {
    const ast = el("div", "perma-ast");
    ast.append(el("div", "perma-ast-name", a.name));
    const reihe = el("div", "perma-reihe");
    a.knoten.forEach((k, i) => {
      const st = perma.stufe(k.id);
      const voll = st >= k.max;
      const offen = perma.offen(a.id, i);
      const knopf = el("button", "tech-knoten" + (voll ? " voll" : "") + (offen ? "" : " zu"));
      knopf.type = "button";
      const rund = el("span", "tech-rund");
      rund.style.backgroundImage = grafik.symbolBild(offen ? PERMA_BILD[k.wirkung] || "krone" : "schloss");
      knopf.append(rund, el("span", "tech-stand", voll ? "Max" : st + "/" + k.max));
      knopf.addEventListener("click", () => permaInfo(a.id, i));
      reihe.append(knopf);
    });
    ast.append(reihe);
    box.append(ast);
  }
}
function permaInfo(astId, i) {
  infoZeigen(() => {
    const a = perma.aeste().find((x) => x.id === astId);
    const k = a.knoten[i];
    const st = perma.stufe(k.id);
    const voll = st >= k.max;
    const offen = perma.offen(astId, i);
    return {
      titel: k.name,
      bild: grafik.symbolBild(PERMA_BILD[k.wirkung] || "krone"),
      farbe: voll ? "#4fc46a" : "#b8862e",
      rund: true,
      zeilen: [
        k.text + " je Stufe.",
        marken([["Stufe " + st + "/" + k.max], voll ? ["fertig"] : ["👑 " + perma.kosten(k)], ["Du hast 👑 " + perma.punkte()]]),
        offen ? "Bleibt für immer, auch nach jedem Neustart." : "Gesperrt: erst den Knoten davor einmal kaufen.",
      ],
      knoepfe: [
        {
          text: voll ? "Maximum" : "Kaufen · 👑 " + perma.kosten(k),
          aus: voll || !offen || perma.punkte() < perma.kosten(k),
          aktion: () => {
            const fehler = perma.kaufen(astId, i);
            if (fehler) return kurzMeldung(fehler);
            permaSeiteZeichnen();
            anzeigeAktualisieren();
            sichern();
          },
        },
      ],
    };
  });
}

// Sammelbuch: merkt sich die beste Seltenheit jedes Tiers, Reittiers und Set-Teils, das man je hatte.
function sammelbuchPruefen() {
  const sb = stand.gemeinsam.sammelbuch;
  const merk = (fach, key, rang) => {
    if (!(fach[key] >= rang)) fach[key] = rang;
  };
  const s = seite();
  for (const t of s.tiere.sammlung) merk(sb.tiere, t.id, t.seltenheit);
  for (const r of s.reittiere.sammlung) merk(sb.reittiere, r.id, r.seltenheit);
  for (const e of s.sets.sammlung) merk(sb.sets, (e.thema || "berserker") + "|" + e.teil, e.seltenheit);
  for (const t of Object.values(s.sets.an)) if (t) merk(sb.sets, (t.thema || "berserker") + "|" + t.teil, t.seltenheit);
}
function sammelbuchZeichnen() {
  const sb = stand.gemeinsam.sammelbuch;
  const box = $("sammelbuch-inhalt");
  box.replaceChildren();
  const selten = (rang) => daten.waffen.seltenheiten[rang] || daten.waffen.seltenheiten[0];
  const abschnitt = (titel, eintraege) => {
    const gefunden = eintraege.filter((e) => e.rang !== undefined).length;
    box.append(el("h3", "", titel + " (" + gefunden + "/" + eintraege.length + ")"));
    const raster = el("div", "kachel-raster sammel-raster");
    for (const e of eintraege) {
      const da = e.rang !== undefined;
      raster.append(
        bildKachel({
          leer: !da,
          farbe: da ? selten(e.rang).farbe : "",
          bild: e.bild,
          titel: e.name,
          klick: () =>
            infoZeigen(() => ({
              titel: e.name,
              bild: e.bild,
              farbe: da ? selten(e.rang).farbe : "#cfd3da",
              zeilen: [da ? marken([["Beste: " + selten(e.rang).name, selten(e.rang).farbe], ["Zeitalter " + e.za]]) : "Noch nicht gefunden · Zeitalter " + e.za],
            })),
        })
      );
    }
    box.append(raster);
  };
  const za = (id) => zeitalterVon(id).nummer;
  abschnitt("Haustiere", daten.tiere.tiere.map((t) => ({ name: t.name, bild: grafik.tierBild(t.id), rang: sb.tiere[t.id], za: za(t.zeitalter) })));
  abschnitt("Reittiere", daten.reittiere.liste.map((t) => ({ name: t.name, bild: grafik.reittierBild(t.id), rang: sb.reittiere[t.id], za: za(t.zeitalter) })));
  const teile = [];
  for (const th of sets.themen())
    for (const teil of daten.dungeons.set.teile)
      teile.push({ name: th.name + "-" + SET_TEIL_NAMEN[teil], bild: grafik.setTeilBild(teil, sets.setObjekt(th.id)), rang: sb.sets[th.id + "|" + teil], za: daten.dungeons.set.teilAbZeitalter[teil] || 1 });
  abschnitt("Set-Teile", teile);
}

// ---------- Test-Modus (Harry 17.11.2026) ----------
// Nur lokal auf diesem Gerät (eigener localStorage-Schlüssel, nicht im Spielstand und nicht im Export). Solange er an ist, werden
// Währungen, Punkte und Schlüssel immer wieder aufgefüllt, also kostet alles nichts. Beim Ausschalten kommen die echten Vorräte zurück.
const TEST_AN = "the-game-testmodus";
const TEST_SICHERUNG = "the-game-testmodus-sicherung";
let testModus = false;
try {
  testModus = localStorage.getItem(TEST_AN) === "an";
} catch {}
const GROSS = 1e21;
function testSicherung() {
  const sicher = {};
  for (const [name, s] of Object.entries(stand.seiten)) {
    if (!s) continue;
    sicher[name] = { w: { ...s.waehrungen }, fp: s.faehigkeiten.punkte, btc: s.btc.menge, schluessel: s.dungeons.schluessel, traenke: s.traenke };
  }
  sicher.tech = stand.gemeinsam.tech.punkte;
  try {
    localStorage.setItem(TEST_SICHERUNG, JSON.stringify(sicher));
  } catch {}
}
function testAuffuellen() {
  for (const s of Object.values(stand.seiten)) {
    if (!s) continue;
    for (const id of Object.keys(s.waehrungen)) if (s.waehrungen[id] < GROSS) s.waehrungen[id] = GROSS;
    s.waehrungen[(daten.zeitalter.find((z) => z.id === s.zeitalter) || daten.zeitalter[0]).waehrung.id] = Math.max(GROSS, s.waehrungen[(daten.zeitalter.find((z) => z.id === s.zeitalter) || daten.zeitalter[0]).waehrung.id] || 0);
    if (s.faehigkeiten.punkte < 1e6) s.faehigkeiten.punkte = 1e6;
    if (s.btc.menge < 1) s.btc.menge = Math.min(daten.bitcoin.maxBtc * 0.5, 1e6);
    if (s.dungeons.schluessel < 30) s.dungeons.schluessel = 30;
  }
  if (stand.gemeinsam.tech.punkte < 1e6) stand.gemeinsam.tech.punkte = 1e6;
  stand.gemeinsam.energie.wert = Math.max(stand.gemeinsam.energie.wert, 100);
}
function testSchalten(an) {
  if (an === testModus) return;
  if (an) {
    testSicherung();
    testModus = true;
    try {
      localStorage.setItem(TEST_AN, "an");
    } catch {}
    testAuffuellen();
  } else {
    testModus = false;
    try {
      const sicher = JSON.parse(localStorage.getItem(TEST_SICHERUNG) || "null");
      if (sicher) {
        for (const [name, s] of Object.entries(stand.seiten)) {
          const alt = s && sicher[name];
          if (!alt) continue;
          s.waehrungen = { ...alt.w };
          s.faehigkeiten.punkte = alt.fp;
          s.btc.menge = alt.btc;
          s.dungeons.schluessel = alt.schluessel;
          s.traenke = alt.traenke;
        }
        stand.gemeinsam.tech.punkte = sicher.tech;
      }
      localStorage.removeItem(TEST_AN);
      localStorage.removeItem(TEST_SICHERUNG);
    } catch {}
  }
  testAnzeige();
  allesZeichnen();
  sichern();
}
function testAnzeige() {
  $("test-schalter").textContent = testModus ? "Test-Modus: AN (antippen zum Ausschalten)" : "Test-Modus einschalten";
  $("test-schalter").classList.toggle("rot", testModus);
  $("test-knoepfe").hidden = !testModus;
}
function testAktion(was) {
  const s = seite();
  if (was === "upgrades") {
    for (const u of upgradesHier()) s.upgrades[u.id] = capOf(u);
    kurzMeldung("Alle Upgrades auf der Höchststufe.");
  } else if (was === "zeit") {
    for (const l of Object.values(stand.gemeinsam.tech.laeuft || {})) if (l) l.bis = Date.now();
    for (const b of s.tiere.brueten) b.fertigUm = Date.now();
    kurzMeldung("Alle Wartezeiten sind gleich fertig.");
  } else if (was === "zeitalter") {
    const naechstes = daten.zeitalter.find((z) => z.nummer === zeitalter().nummer + 1);
    if (!naechstes) return kurzMeldung("Das ist schon das letzte Zeitalter.");
    aufsteigen({ naechstesZeitalter: naechstes.id, name: "Test" });
  } else if (was === "stufe99") {
    s.kampf.stufe = 99;
    s.kampf.welle = 1;
    kampf.neuStarten();
    kurzMeldung("Kampfstufe 99.");
  } else if (was === "level") {
    s.level += 10;
    s.xp = 0;
    kurzMeldung("Level " + s.level);
  } else if (was === "boss") {
    const a = daten.einstellungen.aufstieg;
    const nr = zeitalter().nummer;
    s.level = Math.max(s.level, a.levelJeZeitalter * nr);
    s.kampf.stufe = Math.max(s.kampf.stufe, a.stufe || 100);
    for (const u of upgradesHier()) s.upgrades[u.id] = capOf(u);
    kampf.neuStarten();
    kurzMeldung("Boss ist freigeschaltet.");
  }
  allesZeichnen();
  sichern();
}

// ---------- Start ----------

function knoepfeVerbinden() {
  $("boss-knopf").addEventListener("click", bossTippen);
  $("chip-held").addEventListener("click", heldInfo);
  $("chip-geld").addEventListener("click", geldInfo);
  $("chip-zeit").addEventListener("click", zeitalterInfo);
  $("info-zu").addEventListener("click", infoZu);
  $("info").addEventListener("click", (e) => {
    if (e.target === $("info")) infoZu();
  });
  $("hh-firma-knopf").addEventListener("click", () => {
    if (haushalt.firmaVoll()) return;
    const neu = seite().haushalt.firma === 0;
    if (!haushalt.firmaAusbauen()) return kurzMeldung("Zu wenig " + waehrung().name + ".");
    kurzMeldung(neu ? "Firma gegründet! Der Tech-Ast Haushalt ist jetzt offen." : "Firma ausgebaut.");
    haushaltZeichnen();
    anzeigeAktualisieren();
    sichern();
  });
  for (const b of document.querySelectorAll("#farm-reiter button")) {
    b.addEventListener("click", () => {
      farmReiter = b.dataset.reiter;
      farmZeichnen(true);
    });
  }
  $("zaehler-btc").addEventListener("click", () => {
    btcZeichnen();
    fensterZeigen("btc-fenster");
  });
  for (const k of document.querySelectorAll("[data-btc-kauf]")) {
    k.addEventListener("click", () => {
      const menge = bitcoin.kaufen(Number(k.dataset.btcKauf));
      kurzMeldung(menge > 0 ? "Gekauft: " + btc(menge) + " ₿" : "Nichts zum Kaufen da.");
      btcGeaendert();
    });
  }
  $("set-mergen").addEventListener("click", () => {
    const n = sets.allesMergen();
    kurzMeldung(n + " Mal gemergt.");
    dungeonsZeichnen();
    rasterZeichnen();
    sichern();
  });
  $("tier-mergen").addEventListener("click", () => {
    const n = tiere.allesMergen();
    kurzMeldung(n + " Mal gemergt.");
    kampf.neuStarten();
    tiereZeichnen();
    sichern();
  });
  $("reittier-mergen").addEventListener("click", () => {
    const n = reittiere.allesMergen();
    kurzMeldung(n + " Mal gemergt.");
    reittierAnzeigen();
    reittiereZeichnen();
    sichern();
  });
  $("ziehen-knopf").addEventListener("click", () => {
    if (seite().faehigkeiten.punkte < faehigkeiten.ziehenKosten()) {
      kurzMeldung("Zu wenig Punkte. Gegner lassen manchmal welche fallen.");
      return;
    }
    const r = faehigkeiten.ziehen();
    if (r) {
      const e = $("faehigkeit-ergebnis");
      e.textContent = r.seltenheit.name + ": " + r.name + (r.neu ? " – neu!" : " – schon da (Kopie zum Mergen).");
      e.style.color = r.seltenheit.farbe;
    }
    faehigkeitGeaendert();
  });
  // Mehrfach ziehen (Harry 17.11.2026): ×10 / ×50 / ×100 mit den vorhandenen Punkten, dann Zusammenfassung.
  for (const k of document.querySelectorAll("[data-ziehen]"))
    k.addEventListener("click", () => {
      const wunsch = Number(k.dataset.ziehen);
      const n = Math.min(wunsch, Math.floor(seite().faehigkeiten.punkte / faehigkeiten.ziehenKosten()));
      if (n < 1) return kurzMeldung("Zu wenig Punkte. Gegner lassen manchmal welche fallen.");
      const proQ = {};
      for (let i = 0; i < n; i++) {
        const r = faehigkeiten.ziehen();
        if (r) proQ[r.seltenheit.name] = (proQ[r.seltenheit.name] || 0) + 1;
      }
      const e = $("faehigkeit-ergebnis");
      e.textContent = n + "× gezogen: " + Object.entries(proQ).map(([q, a]) => a + "× " + q).join(", ");
      e.style.color = "";
      faehigkeitGeaendert();
    });
  $("faehigkeiten-alle-mergen").addEventListener("click", () => {
    let n = 0;
    for (let runde = 0; runde < 2000; runde++) {
      const w = faehigkeiten.liste().find((x) => faehigkeiten.mergbar(x.key));
      if (!w || !faehigkeiten.mergen(w.key)) break;
      n++;
    }
    const e = $("faehigkeit-ergebnis");
    e.textContent = n ? n + "× gemergt." : "Nichts zum Mergen.";
    e.style.color = "";
    faehigkeitGeaendert();
  });
  $("schmiede-stufe-knopf").addEventListener("click", () => fensterZeigen("waffen-fenster"));
  $("ziele-knopf").addEventListener("click", aufgabenZeigen);
  $("alles-mergen").addEventListener("click", allesMergen);
  $("export-datei").addEventListener("click", exportDatei);
  $("export-text").addEventListener("click", exportText);
  $("import-knopf").addEventListener("click", () => importieren($("import-text").value));
  $("import-datei").addEventListener("change", async (e) => {
    const datei = e.target.files[0];
    if (datei) importieren(await datei.text());
    e.target.value = "";
  });
  $("neu-anfangen").addEventListener("click", neuAnfangen);
  $("neustart-knopf").addEventListener("click", neustartInfo);
  $("test-schalter").addEventListener("click", () => testSchalten(!testModus));
  for (const k of document.querySelectorAll("[data-test]")) k.addEventListener("click", () => testAktion(k.dataset.test));
  testAnzeige();
  $("sicherung-knopf").addEventListener("click", sicherungInfo);
  $("energie-chip").addEventListener("click", energieInfo);
  $("aufstieg-balken").addEventListener("click", bossTippen);
  $("seite-knopf").addEventListener("click", seiteWechseln);
  for (const knopf of document.querySelectorAll("[data-schliessen]")) {
    knopf.addEventListener("click", () => fensterSchliessen(knopf.dataset.schliessen));
  }
  // Beim Verlassen sofort speichern, beim Zurückkommen sofort nachrechnen.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) sichern();
    else tick();
  });
  window.addEventListener("pagehide", sichern);
}

// Alte Spielstände: Upgrades galten nur im jeweiligen Zeitalter (Stufe 0–100). Jetzt bleiben alle Stufen und jedes Zeitalter
// erweitert um 100. Damit die schon gekauften Stufen ihren Wert behalten, gelten die früheren Zeitalter als „gekauft“.
// Die Marke "_baender" steht im Upgrade-Eintrag der Seite.
function upgradeBaenderUebernehmen() {
  for (const seiteStand of Object.values(stand.seiten)) {
    if (!seiteStand || !seiteStand.upgrades) continue;
    // Händler-Stufen: ebenfalls nur noch 10 je Zeitalter, alte Stufen zählen durch 10.
    const hb = seiteStand.btc && seiteStand.btc.upgrades;
    if (hb && !hb._v10) {
      for (const k of Object.keys(hb)) hb[k] = Math.round(hb[k] / 10);
      hb._v10 = 1;
    }
    if (seiteStand.upgrades._baender === 2) continue;
    const alt = seiteStand.upgrades._baender === 1; // schon auf „100 Stufen je Zeitalter“ umgestellt
    const nr = (daten.zeitalter.find((z) => z.id === seiteStand.zeitalter) || daten.zeitalter[0]).nummer;
    for (const u of daten.upgrades) {
      if (u.zeitalter) continue;
      const ab = u.abZeitalter || 1;
      // Version 44 (Harry 17.11.2026): nur noch 10 Stufen je Zeitalter (10, 20, 30 …) statt 100. Alte Stufen zählen durch 10.
      const vorher = Math.round((seiteStand.upgrades[u.id] || 0) / 10);
      seiteStand.upgrades[u.id] = alt ? vorher : vorher + (nr > ab ? u.maxStufe * (nr - ab) : 0);
    }
    seiteStand.upgrades._baender = 2;
    // Händler-Stufen der Tiere/Reittiere nur bei alten Ständen ohne Marke (vor V41) auf je Tier umstellen
    if (!alt) {
      const bu = (seiteStand.btc && seiteStand.btc.upgrades) || {};
      if (bu.tier && seiteStand.tiere && seiteStand.tiere.kaempfer != null) bu["tier-" + seiteStand.tiere.kaempfer] = bu.tier;
      if (bu.reittier && seiteStand.reittiere && seiteStand.reittiere.aktiv != null) bu["reittier-" + seiteStand.reittiere.aktiv] = bu.reittier;
      delete bu.tier;
      delete bu.reittier;
    }
  }
}

async function start() {
  try {
    daten = await datenLaden();
  } catch (fehler) {
    $("lade-fehler").textContent = "Das Spiel konnte nicht geladen werden: " + fehler.message;
    $("lade-fehler").hidden = false;
    return;
  }
  try {
    await blattDatenLaden("88");
  } catch {
    /* ohne Blatt-Daten bleiben die alten Bilder */
  }
  puppe.start();
  puppe.bereit(() => spielerBildSetzen());
  stand = speicher.laden() || speicher.neuerStand(daten.einstellungen.startZeitalter);
  upgradeBaenderUebernehmen();
  letzterTick = stand.zuletztGespeichert; // so rechnet der erste Tick die Offline-Zeit aus
  kampf = kampfSystem({
    seite,
    seitenName: () => stand.aktiveSeite,
    gegnerDaten,
    schaden,
    maxLeben,
    schlagZeit: () => daten.einstellungen.kampf.sekundenProSchlag,
    lauf: () => daten.einstellungen.kampf.lauf,
    tempo: angriffsTempo,
    kampfWerte,
    wellen: () => daten.einstellungen.kampf.wellen,
    gutschreiben: (m) => gutschreiben(m * (1 + tech.wert("beute") + summe("beute")) * tempoFaktor() * (1 + setExtra("geld"))),
    schutz: () => 1 - Math.min(0.9, setExtra("schutz")),
    bossRegeln: () => daten.einstellungen.kampf.boss,
    ueberspringen: () => daten.einstellungen.kampf.ueberspringen,
    bossSchaden: () => (perma ? perma.wert("bossSchaden") : 0),
    zeitalterNummer: () => zeitalter().nummer,
    xpGeben,
    ereignis: kampfEreignis,
    trank: () => daten.dungeons.heiltrank,
    faehigkeiten: () => faehigkeiten,
    hinweis: (text) => kurzMeldung(text),
    tierAngriff: () => {
      const k = tiere.werte(tiere.finde(seite().tiere.kaempfer));
      if (!k) return null;
      const a = daten.tiere.tierAngriff;
      return { alle: a.alle, schaden: k.schaden * (a.grund + a.jeStern * k.sterne) * (1 + tech.wert("schaden")) };
    },
  });
  tech = techSystem({
    daten: () => daten.tech,
    techStand: () => stand.gemeinsam.tech,
    zeitalterNummer: () => zeitalter().nummer,
    systemOffen: (name) =>
      // Äste öffnen sich erst, wenn ihr System nach dem Freischalt-Plan da ist (alte Spielstände hatten Farm und Firma schon früher).
      name === "immer" ||
      (name === "dungeons" && frei("dungeons")) ||
      (name === "haushalt" && frei("firma") && seite().haushalt.firma > 0) ||
      (name === "farm" && frei("trading")),
  });
  // Perma-Baum: wirkt auf dieselben Werte wie der Tech-Baum (Schaden, Leben, Beute, Chancen …).
  perma = permaSystem({ daten: () => daten.perma, permaStand: () => stand.gemeinsam.perma });
  const techWert = tech.wert;
  tech.wert = (id) => techWert(id) + perma.wert(id);
  haushalt = haushaltSystem({
    daten: () => daten.haushalt,
    seite,
    zeitalterId: () => zeitalter().id,
    tech: (id) => tech.wert(id),
    guthaben,
    gutschreiben,
    bezahlen,
    aussehen: () => stand.gemeinsam.figur.aussehen,
    offen: frei,
  });
  farm = farmSystem({
    daten: () => daten.farm,
    seite,
    zeitalterNummer: () => zeitalter().nummer,
    tech: (id) => tech.wert(id),
    jetzt: () => Date.now(),
    bezahlen,
    gutschreiben,
    btcVerteilt: () => seite().btc.menge + seite().btc.kasse,
    maxBtc: () => daten.bitcoin.maxBtc,
    btcGeben: (menge) => {
      const b = seite().btc;
      b.menge += Math.max(0, Math.min(menge, daten.bitcoin.maxBtc - b.menge - b.kasse));
    },
    meldung: (text) => kurzMeldung(text),
  });
  bitcoin = bitcoinSystem({
    daten: () => daten.bitcoin,
    seite,
    seitenName: () => stand.aktiveSeite,
    zeitalterNummer: () => zeitalter().nummer,
    kurs: btcKurs,
    guthaben,
    bezahlen,
    btcOffen: () => frei("bitcoin"),
  });
  waffen = waffenSystem({
    platzFaktor: (art) => bitcoin.faktor(art),
    seltenBonus: () => (perma ? perma.wert("schmiedeSelten") : 0), // Perma-Knoten „Qualitäts-Glück“ (alter Name schmiedeSelten)
    dropBonus: () => setExtra("drop"),
    daten: () => daten.waffen,
    seite,
    seitenName: () => stand.aktiveSeite,
    zeitalterId: () => zeitalter().id,
    zeitalterStaerke: (id) => (daten.zeitalter.find((z) => z.id === id) || {}).staerke || 1,
    zeitalterNummerVon: (id) => (daten.zeitalter.find((z) => z.id === id) || { nummer: 1 }).nummer,
    bezahlen,
    gutschreiben,
    sterneOffen: () => zeitalter().nummer >= 12, // Harry 25.11.2026: Sterne nur Genesis in Zeitalter 12
  });
  tiere = tierSystem({
    daten: () => daten.tiere,
    seltenheiten: () => daten.waffen.seltenheiten,
    seite,
    zeitalterId: () => zeitalter().id,
    zeitalterNummer: () => zeitalter().nummer,
    zeitalterStaerke: (id) => (daten.zeitalter.find((z) => z.id === id) || {}).staerke || 1,
    level: () => seite().level,
    schluepfFaktor: () => 1 - Math.min(0.75, tech.wert("schluepfen")),
    eiChanceFaktor: () => (1 + tech.wert("eier") + reittierBonus("eier")) * (1 + setExtra("drop")) * (1 + (((daten.einstellungen.beute.stufenBonus || {}).jeStufe) || 0) * (seite().kampf.stufe - 1)),
    lagerPlus: () => 0,
    brutPlaetze: () => 1 + Math.floor(tech.wert("brutplatz") + 1e-9),
    offen: () => frei("tiere"),
    sterneOffen: () => frei("sterne"),
    supporterFaktor: () => 1 + tech.wert("supporter"),
    reittierAusEi: (ei) => (frei("reittiere") ? reittiere.ausEi(ei) : null),
    haendlerFaktor: (nr) => (bitcoin ? bitcoin.faktor("tier-" + nr) : 1),
  });
  reittiere = reittierSystem({
    daten: () => daten.reittiere,
    seltenheiten: () => daten.waffen.seltenheiten,
    seite,
    zeitalterNummerVon: (id) => (daten.zeitalter.find((z) => z.id === id) || { nummer: 1 }).nummer,
    zeitalterNummer: () => zeitalter().nummer,
    sterneOffen: () => frei("sterne"),
    haendlerFaktor: (nr) => (bitcoin ? bitcoin.faktor("reittier-" + nr) : 1),
  });
  faehigkeiten = faehigkeitenSystem({
    daten: () => daten.faehigkeiten,
    seltenheiten: () => daten.waffen.seltenheiten,
    seite,
    seitenName: () => stand.aktiveSeite,
    level: () => seite().level,
    grundSchaden: schaden,
    zeitalterNummer: () => zeitalter().nummer,
    sterneOffen: () => frei("sterne"),
  });
  sets = setSystem({
    daten: () => daten.dungeons,
    seite,
    seltenheiten: () => daten.waffen.seltenheiten,
    zeitalterNummerVon: (id) => (daten.zeitalter.find((z) => z.id === id) || { nummer: 1 }).nummer,
    haendlerFaktor: (platz) => bitcoin.faktor(platz),
    zeitalterNummer: () => zeitalter().nummer,
    seitenName: () => stand.aktiveSeite,
  });
  dungeons = dungeonSystem({
    daten: () => daten.dungeons,
    seite,
    spieler: () => ({ schaden: schaden(), leben: maxLeben() }),
    gegnerBasis: (zId) => {
      const typen = (daten.gegner[zId] || gegnerDaten()).typen;
      return { leben: typen.elite.leben, schaden: typen.elite.schaden };
    },
    setTeilGeben: (zId, ratio) => sets.geben(zId, Math.max(1.3, ratio * (1 - Math.min(0.5, tech.wert("setSelten"))))),
    schluesselPlus: () => tech.wert("schluesselPlatz"),
    traenkeMax,
  });
  knoepfeVerbinden();
  allesZeichnen();
  tick();
  setInterval(tick, 150);
}

start();
