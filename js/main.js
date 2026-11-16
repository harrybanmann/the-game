import { zahl, btc, dauer } from "./format.js?v=37";
import * as speicher from "./speicher.js?v=37";
import { kampfSystem } from "./kampf.js?v=37";
import { waffenSystem } from "./waffen.js?v=37";
import { tierSystem } from "./tiere.js?v=37";
import { dungeonSystem } from "./dungeons.js?v=37";
import { faehigkeitenSystem } from "./faehigkeiten.js?v=37";
import { bitcoinSystem } from "./bitcoin.js?v=37";
import { techSystem } from "./tech.js?v=37";
import * as grafik from "./grafik.js?v=37";
import { haushaltSystem } from "./haushalt.js?v=37";
import { farmSystem } from "./farm.js?v=37";
import { reittierSystem } from "./reittiere.js?v=37";

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
  const [einstellungen, zeitalter, upgrades, gegner, waffenDaten, tierDaten, dungeonDaten, faehigkeitDaten, btcDaten, techDaten, haushaltDaten, farmDaten, reittierDaten] = await Promise.all([
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
  };
}

// ---------- Rechnen ----------

const seite = () => stand.seiten[stand.aktiveSeite];
const zeitalter = () => daten.zeitalter.find((z) => z.id === seite().zeitalter) || daten.zeitalter[0];
const waehrung = () => zeitalter().waehrung;
const upgradesHier = () => daten.upgrades.filter((u) => !u.zeitalter || u.zeitalter === zeitalter().id);
const upgradeName = (u) => (u.namen && u.namen[zeitalter().id]) || u.name;
const upgradeText = (u) => u.text.replace("{w}", waehrung().name);
const stufe = (u) => seite().upgrades[u.id] || 0;
const kosten = (u) =>
  Math.ceil(u.grundKosten * Math.pow(u.kostenFaktor, stufe(u)) * (1 - Math.min(0.6, tech ? tech.wert("rabatt") : 0)));
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

function summe(wirkung) {
  return upgradesHier()
    .filter((u) => u.wirkung === wirkung)
    .reduce((s, u) => s + u.wertProStufe * stufe(u), 0);
}

const klickWert = () => (zeitalter().klickGrundwert + summe("klick")) * (1 + tech.wert("produktion"));
const proSekunde = () => summe("proSekunde") * (1 + tech.wert("produktion"));
function schaden() {
  const b = waffen.bonus();
  const tb = tiere.bonus();
  const grund = daten.einstellungen.kampf.grundSchaden + summe("schaden") + b.schaden + tb.schaden;
  return grund * (1 + tb.schadenProzent) * (1 + b.schmuckSet) * (1 + tech.wert("schaden"));
}
// Die eine Waffe bestimmt den Kampfstil; die Zusatzwerte (Block, Tempo …) kommen von der ganzen Ausrüstung.
function kampfWerte() {
  const b = waffen.bonus();
  const z = b.zusatz;
  return {
    art: b.kampfArt,
    hand: b.hand,
    block: z.block || 0,
    krit: z.krit || 0,
    raub: z.raub || 0,
    ausweichen: z.ausweichen || 0,
    tempo: z.tempo || 0,
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
  return grund * (1 + tb.lebenProzent) * (1 + b.lebenProzent) * (1 + b.schmuckSet) * (1 + tech.wert("leben"));
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
  const s = seite();
  s.xp += menge;
  while (s.xp >= xpBedarf(s.level)) {
    s.xp -= xpBedarf(s.level);
    s.level += 1;
  }
}

// ---------- Zeit: aktiv und offline ----------

function tick() {
  const jetzt = Date.now();
  const sekunden = Math.max(0, (jetzt - letzterTick) / 1000);
  letzterTick = jetzt;
  const off = daten.einstellungen.offline;

  if (sekunden >= off.abSekunden) {
    // Spiel war zu oder im Hintergrund: Formel statt Einzel-Schritte, mit Obergrenze.
    const gezaehlt = Math.min(sekunden, Math.min(24, off.maxStunden + tech.wert("offline")) * 3600);
    const menge = (proSekunde() + seite().kampf.rate) * gezaehlt * off.anteil;
    gutschreiben(menge);
    if (menge >= 1 && sekunden >= off.meldungAbSekunden) offlineMeldung(sekunden, gezaehlt, menge);
    sichern();
  } else {
    gutschreiben(proSekunde() * sekunden);
    kampf.schritt(sekunden);
  }

  dungeons.schritt();
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
  if (waffen.schritt(jetzt)) {
    kurzMeldung("Schmiede ist jetzt Stufe " + seite().schmiede.stufe + "!");
    if (!$("waffen-fenster").hidden) waffenZeichnen();
    sichern();
  }
  autoSchritt(jetzt);
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
  const waffe = waffen.werte(waffen.hole("waffe"), "waffe");
  tragen.schild = !!waffe && waffe.hand === "schild";
  tragen.sitzt = frei("reittiere") && !!reittiere.aktiv();
  // Wer rundum mindestens episch trägt, leuchtet in der Farbe seines schwächsten Stücks.
  const alle = PLAETZE.map(([p]) => waffen.werte(waffen.hole(p), p));
  if (alle.every(Boolean)) {
    const schwach = alle.reduce((a, x) => (x.seltenheit.faktor < a.seltenheit.faktor ? x : a));
    if (daten.waffen.seltenheiten.indexOf(schwach.seltenheit) >= 3) tragen.aura = schwach.seltenheit.farbe;
  }
  const farbe = getComputedStyle(document.documentElement).getPropertyValue("--spieler").trim() || "#3c8fe0";
  document.querySelector(".figur.spieler").style.backgroundImage = grafik.spielerBild(stand.aktiveSeite, zeitalter(), farbe, tragen);
  $("chip-held-bild").style.backgroundImage = grafik.spielerBild(stand.aktiveSeite, zeitalter(), farbe, { ...tragen, sitzt: false });
}

function anzeigeAktualisieren() {
  const s = seite();
  $("zaehler-zahl").textContent = zahl(guthaben());
  const btcDa = frei("bitcoin");
  $("zaehler-btc").hidden = !btcDa;
  if (btcDa) $("zaehler-btc").textContent = "₿ " + btc(s.btc.menge) + (farm.imCrash() ? " 📉" : "");
  $("chip-staerke").textContent = "⚔ " + zahl(staerke());
  $("chip-level").textContent = "Lv " + s.level;
  $("chip-xp").style.width = Math.min(100, (100 * s.xp) / xpBedarf(s.level)) + "%";
  $("verdienen-text").textContent = "+" + zahl(klickWert());
  if (!$("btc-fenster").hidden) btcKnoepfe();
  for (const u of upgradesHier()) {
    const knopf = document.querySelector(`[data-upgrade="${u.id}"]`);
    if (knopf) knopf.classList.toggle("matt", stufe(u) >= u.maxStufe || guthaben() < kosten(u));
  }
  kampfZeichnen();
  ambossZeichnen();
  if (!$("waffen-fenster").hidden) waffenKnoepfe();
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
function treffer(box, menge, farbe, gross) {
  if (document.hidden) return;
  wackeln(box.querySelector(".figur"), "getroffen");
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
  if (arena.querySelectorAll(".geschoss").length >= 6) return;
  const g = el("div", "geschoss" + (gespiegelt ? " gespiegelt" : "") + (gross ? " gross" : ""));
  g.style.backgroundImage = grafik.geschossBild(art || "pfeil");
  arena.append(g);
  const flug = g.animate([{ left: von + "%" }, { left: nach + "%" }], { duration: 220, easing: "linear" });
  flug.onfinish = () => g.remove();
  setTimeout(() => g.remove(), 400);
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
  const k = (w ? w.id : "") + "|" + zeitalter().id + "|" + (bogen ? stufe : "");
  if (bild.dataset.k === k) return;
  bild.dataset.k = k;
  bild.hidden = !w;
  if (!w) return;
  const z = zeitalterVon(w.zeitalter);
  bild.classList.toggle("fern", w.art === "fern");
  bild.classList.toggle("nah", w.art === "nah");
  bild.classList.toggle("bogen", bogen);
  bild.style.backgroundImage = bogen ? grafik.bogenBild(z, stufe) : grafik.stueckBild(w.art, z, w.id, false);
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
  $("stufe-text").textContent = z.boss ? "Boss · Tränke " + s.traenke + "/" + trank.max : "Stufe " + z.stufe;
  // Punkte für die Wellen der Stufe: geschaffte sind gefüllt, die laufende ist größer.
  const punkte = $("wellen-punkte");
  const kp = z.boss ? "boss" : z.wellenProStufe + "|" + z.welle;
  if (punkte.dataset.k !== kp) {
    punkte.dataset.k = kp;
    punkte.replaceChildren();
    if (!z.boss) for (let i = 1; i <= z.wellenProStufe; i++) punkte.append(el("span", "punkt" + (i < z.welle ? " fertig" : i === z.welle ? " jetzt" : "")));
  }
  $("spieler-balken").style.width = (100 * z.spielerLeben) / z.maxLeben + "%";
  $("spieler-leben").textContent = zahl(Math.ceil(z.spielerLeben)) + "/" + zahl(Math.ceil(z.maxLeben));

  // Figuren bleiben bestehen und werden nur verschoben, damit Laufen und Treffer-Effekte flüssig sind.
  const gruppe = $("gegner-gruppe");
  const schluessel = z.gegner.map((g) => g.name + "/" + g.typ + "/" + g.art + (g.boss ? "/B" : "")).join("|");
  if (gruppe.dataset.k !== schluessel) {
    gruppe.dataset.k = schluessel;
    gruppe.replaceChildren();
    z.gegner.forEach((g, i) => {
      const box = el("div", "gegner" + (g.boss ? " boss" : ""));
      const figur = el("div", "figur gegner-figur" + (g.typ === "elite" ? " elite" : "") + (g.boss ? " boss" : ""));
      figur.style.backgroundImage = grafik.gegnerBild(stand.aktiveSeite, zeitalter(), g.typ, g.boss, g.art);
      const balken = el("div", "balken klein");
      balken.append(el("div", "fuellung rot"));
      if (g.boss) box.append(el("div", "gegner-name", g.name));
      box.append(balken, figur);
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
  const fae = faehigkeiten.aktiv();
  spielerBox.classList.toggle("staerke", fae.staerke);
  spielerBox.classList.toggle("schutz", fae.schutz);
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
        wackeln($("held-waffe"), "schwung");
        hiebSpur(zielBox);
      } else if (e.art === "mitSchlag" && ziel) hiebSpur(zielBox);
      else if (e.art === "gegnerSchuss" && ziel) geschoss(ort(ziel), heldOrt + 14, true, zeitalter().nummer >= 10 ? "kugel" : "pfeil");
      else if (e.art === "gegnerSchlag" && ziel) wackeln(zielBox.querySelector(".figur"), "hieb");
      else if (e.art === "block") wortZeigen(spielerBox, "Block!", "#9fd0ff");
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
  const z = kampf.zustand();
  if (z.boss) return;
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

// Bedingungen für den Boss (Harry): Level ≥ 10 × Zeitalter, Schmiede ≥ 3 × Zeitalter.
// null = es gibt noch kein nächstes Zeitalter; [] = alles erfüllt.
function aufstiegFehlt() {
  const boss = gegnerDaten().boss;
  if (!boss || (!boss.endboss && !daten.zeitalter.some((x) => x.id === boss.naechstesZeitalter))) return null;
  const a = daten.einstellungen.aufstieg;
  const nr = zeitalter().nummer;
  const s = seite();
  const fehlt = [];
  if (s.level < a.levelJeZeitalter * nr) fehlt.push("Level " + a.levelJeZeitalter * nr + " (du: " + s.level + ")");
  if (s.schmiede.stufe < a.schmiedeJeZeitalter * nr)
    fehlt.push("Schmiede " + a.schmiedeJeZeitalter * nr + " (du: " + s.schmiede.stufe + ")");
  return fehlt;
}

// ---------- Ausrüstungs-Raster (wie Forge Master) ----------

const PLAETZE = [
  ["waffe", "Waffe", "🗡"],
  ["helm", "Helm", "⛑"],
  ["handschuhe", "Handschuhe", "🧤"],
  ["ruestung", "Rüstung", "🦺"],
  ["stiefel", "Stiefel", "🥾"],
  ["ring1", "Ring", "💍"],
  ["ring2", "Ring", "💍"],
  ["amulett", "Amulett", "📿"],
  ["guertel", "Gürtel", "🎗"],
];

// Eine Kachel mit Bild statt Text: Farbe = Seltenheit, unten Sterne, oben links Level, oben rechts Anzahl.
function bildKachel(o) {
  const k = el("button", "kachel" + (o.leer ? " leer" : "") + (o.rund ? " rund" : "") + (o.gewaehlt ? " gewaehlt" : "") + (o.glanz ? " glanz" : ""));
  k.type = "button";
  if (o.titel) k.title = o.titel;
  if (o.farbe && !o.leer) k.style.background = o.farbe;
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
  // Zehnter Platz: das gesattelte Reittier (sobald es Reittiere gibt).
  if (frei("reittiere")) {
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
    else zeilen.push("Noch leer. Schmiede, bis ein Stück dafür fällt.");
    if (bitcoin.haendler().some((h) => h.offen && h.plaetze.includes(art))) {
      const voll = bitcoin.voll(art);
      const preis = frei("bitcoin") ? btc(bitcoin.preis(art)) + " ₿" : zahl(bitcoin.preisGeld(art)) + " " + waehrung().name;
      zeilen.push(el("div", "hinweis", "Händler Lv. " + bitcoin.stufe(art) + "/100 · +" + Math.round((bitcoin.faktor(art) - 1) * 100) + " % Werte, bleibt für immer"));
      knoepfe.push({
        text: voll ? "Händler: Maximum" : "Verbessern · " + preis,
        aus: voll,
        aktion: () => {
          if (!bitcoin.upgradeKaufen(art)) return kurzMeldung("Dafür reicht es noch nicht.");
          btcGeaendert();
        },
      });
    }
    if (art === "waffe") {
      const reihe = el("div", "stil-reihe");
      for (const [stil, text] of [["", "Egal"], ["nah", "Nahkampf"], ["fern", "Fernkampf"]]) {
        const k = el("button", "knopf klein" + ((waffen.stil() || "") === stil ? "" : " matt"), text);
        k.type = "button";
        k.addEventListener("click", () => {
          waffen.stilSetzen(stil);
          sichern();
          infoZeichnen();
        });
        reihe.append(k);
      }
      zeilen.push(el("div", "hinweis", "Welche Waffen soll die Schmiede anlegen?"), reihe);
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

// Info zur Schmiede: Chancen je Seltenheit und der Ausbau.
function schmiedeInfo() {
  infoZeigen(() => {
    const rest = waffen.ausbauRest(Date.now());
    const voll = waffen.stufeVoll();
    const chancen = waffen.chancen().map((c, i) => [daten.waffen.seltenheiten[i].name + " " + prozent(c), daten.waffen.seltenheiten[i].farbe]);
    return {
      titel: "Schmiede Stufe " + seite().schmiede.stufe,
      bild: grafik.symbolBild("amboss"),
      zeilen: [
        "Höhere Stufe = bessere Chancen auf seltene Stücke.",
        marken(chancen),
        rest !== null ? "Ausbau läuft: noch " + dauer(Math.ceil(rest)) + "." : voll ? "" : "Ausbau dauert " + dauer(waffen.stufeDauer()) + ".",
      ],
      knoepfe: [
        { text: voll ? "Maximum" : rest !== null ? "Ausbau läuft …" : "Ausbauen · " + zahl(waffen.stufeKosten()) + " " + waehrung().name, aus: voll || rest !== null, aktion: schmiedeVerbessern },
        frei("sterne") ? { text: "Lager und Mergen", zu: true, aktion: () => fensterZeigen("waffen-fenster") } : null,
      ],
    };
  });
}

function ambossZeichnen() {
  const ambossBild = document.querySelector(".amboss-bild");
  if (!ambossBild.style.backgroundImage) ambossBild.style.backgroundImage = grafik.symbolBild("amboss");
  autoZeichnen();
  $("amboss-text").textContent = zahl(waffen.schmiedeKosten());
  $("amboss-knopf").classList.toggle("matt", guthaben() < waffen.schmiedeKosten());
  const rest = waffen.ausbauRest(Date.now());
  $("schmiede-stufe-zahl").textContent = "Stufe " + seite().schmiede.stufe;
  $("schmiede-zeit").textContent = rest !== null ? dauer(Math.ceil(rest)) : waffen.stufeVoll() ? "Max" : "▲ " + zahl(waffen.stufeKosten());
}

function upgradesZeichnen() {
  const liste = $("upgrades");
  liste.replaceChildren();
  for (const u of upgradesHier()) {
    const voll = stufe(u) >= u.maxStufe;
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
  anzeigeAktualisieren();
}

function upgradeInfo(u) {
  infoZeigen(() => {
    const voll = stufe(u) >= u.maxStufe;
    return {
      titel: upgradeName(u),
      bild: grafik.upgradeBild(u.wirkung),
      farbe: "#3d6fb8",
      zeilen: [upgradeText(u) + " je Stufe.", marken([["Stufe " + stufe(u) + "/" + u.maxStufe]])],
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
const GRUPPEN = [
  { id: "kampf", name: "Kampf" },
  { id: "dungeons", name: "Dungeons", reiter: [["dungeon-fenster", "Dungeons", () => (($("dungeon-ergebnis").textContent = ""), dungeonsZeichnen()), "dungeons"]] },
  {
    id: "held",
    name: "Held",
    reiter: [
      ["faehigkeiten-fenster", "Fähigkeiten", () => (($("faehigkeit-ergebnis").textContent = ""), faehigkeitenZeichnen()), "faehigkeiten"],
      ["tiere-fenster", "Haustiere", () => tiereZeichnen(), "tiere"],
      ["reittiere-fenster", "Reittiere", () => reittiereZeichnen(), "reittiere"],
      ["tech-fenster", "Tech-Baum", () => techZeichnen(), "tech"],
    ],
  },
  {
    id: "geld",
    name: "Geld",
    reiter: [
      ["upgrades-fenster", "Upgrades", () => upgradesZeichnen()],
      ["btc-fenster", "Händler", () => btcZeichnen()],
      ["haushalt-fenster", "Haushalt", () => haushaltZeichnen(), "haushalt"],
      ["farm-fenster", "Farm", () => farmZeichnen(true), "farm"],
    ],
  },
  { id: "menue", name: "Menü", reiter: [["menue", "Menü", () => {}]] },
  { id: "schmiede", name: "Schmiede", versteckt: true, reiter: [["waffen-fenster", "Schmiede", () => waffenZeichnen()]] },
];
let offeneGruppe = null;
let offenerReiter = null;
const letzterReiter = {};
// Ein Reiter ist nur da, wenn sein System freigeschaltet ist (4. Eintrag = Name in einstellungen.freischalten).
const reiterOffen = (r) => !r[3] || (r[3] === "farm" ? frei("trading") || frei("bitcoin") : frei(r[3]));
const reiterVon = (g) => (g.reiter || []).filter(reiterOffen);
const gruppeVon = (fensterId) => GRUPPEN.find((g) => g.reiter && g.reiter.some((r) => r[0] === fensterId));

function seiteSchliessen() {
  for (const g of GRUPPEN) for (const r of g.reiter || []) $(r[0]).hidden = true;
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
  for (const gg of GRUPPEN) for (const rr of gg.reiter || []) $(rr[0]).hidden = true;
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
  const f = $(r[0]);
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
    rund.style.backgroundImage = grafik.symbolBild(an ? "zu" : g.id === "geld" && !frei("bitcoin") ? "muenze" : g.id);
    knopf.append(rund, el("span", "rund-name", g.name));
    knopf.addEventListener("click", () => (an || g.id === "kampf" ? seiteSchliessen() : seiteOeffnen(g.id)));
    leiste.append(knopf);
  }
}

function allesZeichnen() {
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
      bild: document.querySelector(".figur.spieler").style.backgroundImage,
      zeilen: [
        marken([["Level " + s.level + " · " + Math.floor((100 * s.xp) / xpBedarf(s.level)) + " %"], ["Stärke " + zahl(staerke())]]),
        marken([["⚔ " + zahl(schaden())], ["♥ " + zahl(maxLeben())], ["Tempo +" + prozent(angriffsTempo())], [w.art === "fern" ? "Fernkämpfer" : "Nahkämpfer"]]),
        zusatz.length ? marken(zusatz) : "",
      ],
    };
  });
}

function geldInfo() {
  infoZeigen(() => ({
    titel: zahl(guthaben()) + " " + waehrung().name,
    bild: grafik.waehrungBild(zeitalter()),
    zeilen: [marken([["+" + zahl(proSekunde()) + " pro Sek."], ["+" + zahl(klickWert()) + " pro Tippen"], ["Kampf +" + zahl(seite().kampf.rate) + " pro Sek."]])],
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
  const mitSternen = frei("sterne");
  $("lager-teil").hidden = !mitSternen;
  if (!mitSternen) return;
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

const WAFFEN_ART = { schild: "Einhand mit Schild", zweihand: "Zweihänder: trifft mehrere Gegner", bogen: "Fernkampf", wurf: "Fernkampf" };

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
  if (w.hand) reihe.append(el("span", "wert-marke", WAFFEN_ART[w.hand]));
  return reihe;
}

// Zeigt Name und Werte des angetippten Stücks, dazu die passenden Knöpfe.
function stueckInfoZeichnen() {
  const box = $("stueck-info");
  box.replaceChildren();
  const g = gewaehltesStueck;
  if (g && g.roh && !frei("sterne")) gewaehltesStueck = null;
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
  knopf("Mergen (3 → +1 Stern)", !e.mergbar, () => {
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

function waffenKnoepfe() {
  const voll = waffen.stufeVoll();
  $("schmieden-knopf").textContent = "Schmieden (" + zahl(waffen.schmiedeKosten()) + " " + waehrung().name + ")";
  $("schmieden-knopf").disabled = guthaben() < waffen.schmiedeKosten();
  const rest = waffen.ausbauRest(Date.now());
  $("schmiede-knopf").textContent = voll
    ? "Schmiede ist auf Maximum"
    : rest !== null
      ? "Ausbau läuft: noch " + dauer(Math.ceil(rest))
      : "Schmiede verbessern (" + zahl(waffen.stufeKosten()) + " " + waehrung().name + ", " + dauer(waffen.stufeDauer()) + ")";
  $("schmiede-knopf").disabled = voll || rest !== null || guthaben() < waffen.stufeKosten();
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
  for (const k of document.querySelectorAll("[data-stil]")) k.classList.toggle("matt", (waffen.stil() || "") !== k.dataset.stil);
  $("ruestung-set").textContent =
    "Rüstungs-Set: " + b.ruestungTeile + " von 4 Teilen aus einem Zeitalter (2 Teile +5 % Leben, 4 Teile +15 % Leben)" +
    (b.lebenProzent > 0 ? " – aktiv: +" + prozent(b.lebenProzent) + " Leben." : ".");
  $("schmuck-set").textContent =
    (b.schmuckSet > 0 ? "Schmuck-Set aktiv: +" : "Schmuck-Set: 2 Ringe + Amulett aus einem Zeitalter geben +") + sm + " % auf alle Werte.";
  rasterZeichnen();
  $("schmiede-stufe").textContent = "Schmiede Stufe " + seite().schmiede.stufe;
  const liste = $("schmiede-chancen");
  liste.replaceChildren();
  waffen.chancen().forEach((chance, i) => {
    const s = daten.waffen.seltenheiten[i];
    const zeile = el("div", "chance");
    const name = el("span", null, s.name);
    name.style.color = s.farbe;
    zeile.append(name, el("span", null, prozent(chance)));
    liste.append(zeile);
  });
  waffenKnoepfe();
}

let autoAn = false;
let autoLetzter = 0;

function autoSetzen(an) {
  autoAn = an;
  autoLetzter = 0;
  autoZeichnen();
}

function autoZeichnen() {
  const k = $("auto-knopf");
  const wartet = autoAn && guthaben() < waffen.schmiedeKosten();
  k.classList.toggle("an", autoAn);
  k.classList.toggle("wartet", wartet);
  k.setAttribute("aria-pressed", String(autoAn));
  $("auto-zustand").textContent = !autoAn ? "aus" : wartet ? "wartet" : "an";
}

function autoSchritt(jetzt) {
  if (!autoAn) return;
  if (kampf.zustand().boss) return;
  if (jetzt - autoLetzter < waffen.autoSekunden() * 1000) return;
  if (guthaben() < waffen.schmiedeKosten()) return;
  autoLetzter = jetzt;
  schmieden(true);
}

function schmieden(auto) {
  const r = waffen.schmieden();
  if (!r) return;
  const text = $("schmiede-ergebnis");
  text.textContent =
    r.neu.seltenheit.name + ": " + r.neu.name +
    (r.besser ? " – ausgerüstet!" : frei("sterne") ? " – ins Lager gelegt." : " – verkauft für " + zahl(r.verkauft) + " " + waehrung().name + ".");
  text.style.color = r.neu.seltenheit.farbe;
  wackeln(document.querySelector(".amboss-bild"), "haemmern");
  // Beim Auto-Schmieden nur melden, wenn etwas Besseres angelegt wurde.
  if ($("waffen-fenster").hidden && (!auto || r.besser)) kurzMeldung(text.textContent);
  waffenZeichnen();
  anzeigeAktualisieren();
  sichern();
}

function schmiedeVerbessern() {
  if (seite().schmiede.ausbauBis) return kurzMeldung("Der Ausbau läuft schon.");
  if (!waffen.stufeVoll() && guthaben() < waffen.stufeKosten())
    return kurzMeldung("Zu wenig " + waehrung().name + ". Ausbau kostet " + zahl(waffen.stufeKosten()) + ".");
  if (!waffen.stufeKaufen()) return;
  kurzMeldung("Ausbau gestartet, fertig in " + dauer(waffen.stufeDauer()));
  waffenZeichnen();
  anzeigeAktualisieren();
  sichern();
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
    lv: marke,
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
      ],
      knoepfe: [
        { text: "Als Kämpfer", aus: t.kaempfer === w.nr, aktion: tun(tiere.alsKaempfer) },
        { text: "Als Helfer", aus: tiere.plaetze() === 0 || t.supporter.includes(w.nr), aktion: tun(tiere.alsSupporter) },
        imTeam ? { text: "Aus dem Team", rot: true, aktion: tun(tiere.herausnehmen) } : null,
        frei("sterne") ? { text: "Mergen (3 → +1 Stern)", aus: !tiere.mergbar(w.nr), aktion: tun(tiere.mergen) } : null,
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
  alle.sort((a, b) => b.staerke - a.staerke);
  $("sammlung-titel").textContent = "Sammlung (" + alle.length + ")";
  const sammlung = $("tier-sammlung");
  sammlung.replaceChildren(...alle.map((w) => tierKachel(w, "")));
  if (!alle.length) sammlung.append(el("p", "hinweis", "Noch kein Tier."));
}

// ---------- Dungeons ----------

function dungeonErgebnis(text) {
  if (text) $("dungeon-ergebnis").textContent = text;
  dungeonsZeichnen();
  anzeigeAktualisieren();
  sichern();
}

function dungeonsZeichnen() {
  const box = $("dungeon-liste");
  box.replaceChildren();
  for (const art of daten.dungeons.arten) {
    if (art.id === "eier" && !frei("tiere")) continue; // Eier gibt es erst mit den Haustieren
    const i = dungeons.info(art.id);
    box.append(
      bildKachel({
        titel: art.name,
        farbe: "#6a4a8a",
        bild: grafik.dungeonBild(art.id),
        lv: "Stufe " + i.stufe,
        marke: "🎟 " + i.tickets,
        klick: () => dungeonInfo(art),
      })
    );
  }
}

function dungeonInfo(art) {
  infoZeigen(() => {
    const i = dungeons.info(art.id);
    return {
      titel: art.name,
      bild: grafik.dungeonBild(art.id),
      farbe: "#6a4a8a",
      zeilen: [art.text, marken([["Tickets " + i.tickets + "/" + daten.dungeons.ticketsMax], ["Stufe " + i.stufe]]), "Jeden Tag kommen " + daten.dungeons.ticketsProTag + " Tickets dazu."],
      knoepfe: [
        { text: "Stufe " + i.stufe + " kämpfen", aus: i.tickets <= 0, zu: true, aktion: () => dungeonErgebnis(dungeons.kaempfen(art.id)) },
        i.stufe > 1 ? { text: "Auto: Stufe " + (i.stufe - 1), aus: i.tickets <= 0, zu: true, aktion: () => dungeonErgebnis(dungeons.autoClear(art.id)) } : null,
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
      punkt: faehigkeiten.mergbar(w.id),
      klick: () => faehigkeitInfo(w.id),
    });

  const plaetze = $("faehigkeit-plaetze");
  plaetze.replaceChildren();
  const ab = faehigkeiten.plaetzeAbLevel();
  for (let i = 0; i < ab.length; i++) {
    const offen = i < faehigkeiten.plaetze();
    const w = offen ? faehigkeiten.werte(f.sammlung.find((x) => x.id === f.ausgeruestet[i])) : null;
    plaetze.append(w ? kachel(w) : bildKachel({ rund: true, leer: true, marke: offen ? "frei" : "Lv. " + ab[i] }));
  }

  const liste = $("faehigkeit-liste");
  liste.replaceChildren();
  const alle = faehigkeiten.liste();
  if (!alle.length) liste.append(el("p", "hinweis", "Noch keine Fähigkeit. Punkte (★) gibt es in den Dungeons."));
  for (const w of alle) liste.append(kachel(w, w.ausgeruestet ? "an" : mitSternen ? w.kopien + "/2" : ""));
  faehigkeitLeisteZeichnen();
}

function faehigkeitInfo(id) {
  infoZeigen(() => {
    const f = seite().faehigkeiten;
    const w = faehigkeiten.liste().find((x) => x.id === id);
    if (!w) return null;
    const e = f.sammlung.find((x) => x.id === w.id);
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
        w.ausgeruestet ? { text: "Ablegen", rot: true, aktion: tun(() => faehigkeiten.ablegen(w.id)) } : { text: "Ausrüsten", aktion: tun(() => faehigkeiten.ausruesten(w.id)) },
        { text: "Level +1 · ★ " + faehigkeiten.levelKosten(e), aus: f.punkte < faehigkeiten.levelKosten(e), aktion: tun(() => faehigkeiten.levelKaufen(w.id)) },
        frei("sterne") ? { text: "Mergen (+1 Stern)", aus: !faehigkeiten.mergbar(w.id), aktion: tun(() => faehigkeiten.mergen(w.id)) } : null,
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
    const w = faehigkeiten.werte(f.sammlung.find((x) => x.id === id));
    if (!w) continue;
    const b = el("span", "faehigkeit-punkt");
    b.style.backgroundImage = grafik.faehigkeitBild(w.art);
    b.style.backgroundColor = w.seltenheit.farbe;
    leiste.append(b);
  }
}

// ---------- Reittiere ----------

function reittierAnzeigen() {
  const a = frei("reittiere") ? reittiere.aktiv() : null;
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
  $("reittier-mergen").hidden = !frei("sterne") || !liste.some((w) => reittiere.mergbar(w.nr));
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
        lv: a && a.nr === w.nr ? "an" : "",
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
      zeilen: [marken([[w.seltenheit.name, w.seltenheit.farbe], ["Zeitalter " + zeitalterVon(w.zeitalter).nummer], ["Tempo +" + prozent(w.tempo)]]), "Mit Reittier greifst du schneller an."],
      knoepfe: [
        { text: a && a.nr === w.nr ? "Gesattelt" : "Satteln", aus: !!a && a.nr === w.nr, aktion: tun(() => reittiere.satteln(w.nr)) },
        frei("sterne") ? { text: "Mergen (3 → +1 Stern)", aus: !reittiere.mergbar(w.nr), aktion: tun(() => reittiere.mergen(w.nr)) } : null,
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
  const liste = $("haendler-liste");
  liste.replaceChildren();
  for (const h of bitcoin.haendler()) {
    if (!h.offen) continue;
    for (const platz of h.plaetze) liste.append(platzKachel(platz, PLATZ_NAMEN[platz], () => stueckInfo(platz)));
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

const AST_BILD = { produktion: "beutel", kampf: "schwert", handel: "farm", haushalt: "held" };

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
    const grund = { farm: "mit der Mining Farm", haushalt: "mit der Firma", dungeons: "mit den Dungeons" }[a.offen];
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
  if (kampf.zustand().boss) return kurzMeldung("Mitten im Boss-Kampf geht das nicht.");
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
  autoSetzen(false);
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

// ---------- Kampf: Boss und Aufstieg ----------

function kampfEreignis(name, gegner) {
  if (name === "sieg") {
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

// Ein Ei fällt sichtbar beim besiegten Gegner auf den Weg und hüpft dann nach unten zum Helden-Knopf.
function eiZeigen(gegner, farbe) {
  if (document.hidden) return;
  const arena = $("arena");
  if (arena.querySelectorAll(".ei-beute").length >= 4) return;
  const ei = el("div", "ei-beute");
  ei.style.backgroundImage = grafik.eiBild(farbe);
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
  if (stufe(u) >= u.maxStufe || guthaben() < preis) return;
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

function offlineMeldung(wegSekunden, gezaehlt, menge) {
  const off = daten.einstellungen.offline;
  let text = "Du warst " + dauer(wegSekunden) + " weg.";
  if (gezaehlt < wegSekunden) text += " Gezählt werden höchstens " + off.maxStunden + " Stunden.";
  hinweis("Willkommen zurück!", text, "+" + zahl(menge) + " " + waehrung().name);
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

// ---------- Start ----------

function knoepfeVerbinden() {
  $("verdienen").addEventListener("pointerdown", verdienen);
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
  $("reittier-mergen").addEventListener("click", () => {
    const n = reittiere.allesMergen();
    kurzMeldung(n + " Mal gemergt.");
    reittierAnzeigen();
    reittiereZeichnen();
    sichern();
  });
  $("ziehen-knopf").addEventListener("click", () => {
    if (seite().faehigkeiten.punkte < faehigkeiten.ziehenKosten()) {
      kurzMeldung("Zu wenig Punkte. Punkte gibt es in den Dungeons.");
      return;
    }
    const r = faehigkeiten.ziehen();
    if (r) {
      const e = $("faehigkeit-ergebnis");
      e.textContent = r.seltenheit.name + ": " + r.name + (r.neu ? " – neu!" : frei("sterne") ? " – Kopie für Sterne." : " – schon da (Kopie für später).");
      e.style.color = r.seltenheit.farbe;
    }
    faehigkeitGeaendert();
  });
  $("schmieden-knopf").addEventListener("click", () => schmieden(false));
  for (const k of document.querySelectorAll("[data-stil]"))
    k.addEventListener("click", () => {
      waffen.stilSetzen(k.dataset.stil);
      waffenZeichnen();
      sichern();
    });
  $("amboss-knopf").addEventListener("click", () => {
    if (guthaben() < waffen.schmiedeKosten()) return kurzMeldung("Zu wenig " + waehrung().name + " zum Schmieden.");
    schmieden();
  });
  $("auto-knopf").addEventListener("click", () => {
    autoSetzen(!autoAn);
    kurzMeldung(autoAn ? "Auto-Schmieden an: alle " + zahl(waffen.autoSekunden()) + " Sek., solange das Spiel offen ist." : "Auto-Schmieden aus.");
  });
  $("schmiede-stufe-knopf").addEventListener("click", schmiedeInfo);
  $("alles-mergen").addEventListener("click", allesMergen);
  $("schmiede-knopf").addEventListener("click", schmiedeVerbessern);
  $("export-datei").addEventListener("click", exportDatei);
  $("export-text").addEventListener("click", exportText);
  $("import-knopf").addEventListener("click", () => importieren($("import-text").value));
  $("import-datei").addEventListener("change", async (e) => {
    const datei = e.target.files[0];
    if (datei) importieren(await datei.text());
    e.target.value = "";
  });
  $("neu-anfangen").addEventListener("click", neuAnfangen);
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

async function start() {
  try {
    daten = await datenLaden();
  } catch (fehler) {
    $("lade-fehler").textContent = "Das Spiel konnte nicht geladen werden: " + fehler.message;
    $("lade-fehler").hidden = false;
    return;
  }
  stand = speicher.laden() || speicher.neuerStand(daten.einstellungen.startZeitalter);
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
    gutschreiben: (m) => gutschreiben(m * (1 + tech.wert("beute"))),
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
      name === "immer" || name === "dungeons" || (name === "haushalt" && seite().haushalt.firma > 0) || (name === "farm" && farm.hatFarm()),
  });
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
    daten: () => daten.waffen,
    seite,
    seitenName: () => stand.aktiveSeite,
    zeitalterId: () => zeitalter().id,
    zeitalterStaerke: (id) => (daten.zeitalter.find((z) => z.id === id) || {}).staerke || 1,
    zeitalterNummerVon: (id) => (daten.zeitalter.find((z) => z.id === id) || { nummer: 1 }).nummer,
    bezahlen,
    gutschreiben,
    sterneOffen: () => frei("sterne"),
  });
  tiere = tierSystem({
    daten: () => daten.tiere,
    seltenheiten: () => daten.waffen.seltenheiten,
    seite,
    zeitalterId: () => zeitalter().id,
    zeitalterStaerke: (id) => (daten.zeitalter.find((z) => z.id === id) || {}).staerke || 1,
    level: () => seite().level,
    schluepfFaktor: () => 1 - Math.min(0.75, tech.wert("schluepfen")),
    eiChanceFaktor: () => 1 + tech.wert("eier"),
    lagerPlus: () => 0,
    brutPlaetze: () => 1 + Math.floor(tech.wert("brutplatz") + 1e-9),
    offen: () => frei("tiere"),
    sterneOffen: () => frei("sterne"),
    supporterFaktor: () => 1 + tech.wert("supporter"),
    reittierAusEi: (ei) => (frei("reittiere") ? reittiere.ausEi(ei) : null),
  });
  reittiere = reittierSystem({
    daten: () => daten.reittiere,
    seltenheiten: () => daten.waffen.seltenheiten,
    seite,
    zeitalterNummerVon: (id) => (daten.zeitalter.find((z) => z.id === id) || { nummer: 1 }).nummer,
    sterneOffen: () => frei("sterne"),
  });
  faehigkeiten = faehigkeitenSystem({
    daten: () => daten.faehigkeiten,
    seltenheiten: () => daten.waffen.seltenheiten,
    seite,
    seitenName: () => stand.aktiveSeite,
    level: () => seite().level,
    grundSchaden: schaden,
    sterneOffen: () => frei("sterne"),
  });
  dungeons = dungeonSystem({
    daten: () => daten.dungeons,
    seite,
    spieler: () => ({ schaden: schaden(), leben: maxLeben() }),
    gegnerBasis: () => {
      const typen = gegnerDaten().typen;
      return { leben: typen.elite.leben, schaden: typen.elite.schaden, beute: typen.normal.beute };
    },
    eiGeben: (ratio, plus) => tiere.eiGeben(ratio, plus),
    schmiedenGratis: () => waffen.schmiedenGratis(),
    gutschreiben,
    punkteGeben: (stufe, meilenstein) => {
      const vorher = seite().faehigkeiten.punkte;
      faehigkeiten.punkteGeben(stufe, meilenstein);
      const dazu = seite().faehigkeiten.punkte - vorher;
      const extra = Math.round(dazu * tech.wert("fpunkte"));
      seite().faehigkeiten.punkte += extra;
      return dazu + extra;
    },
    techPunkteGeben: (stufe, meilenstein) => tech.punkteGeben(stufe, meilenstein),
    ticketsPlus: () => tech.wert("tickets"),
    offen: frei,
    mengeText: (menge) => zahl(menge) + " " + waehrung().name,
  });
  knoepfeVerbinden();
  allesZeichnen();
  tick();
  setInterval(tick, 250);
}

start();
