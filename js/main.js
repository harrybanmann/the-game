import { zahl, btc, dauer } from "./format.js?v=28";
import * as speicher from "./speicher.js?v=28";
import { kampfSystem } from "./kampf.js?v=28";
import { waffenSystem } from "./waffen.js?v=28";
import { tierSystem } from "./tiere.js?v=28";
import { dungeonSystem } from "./dungeons.js?v=28";
import { faehigkeitenSystem } from "./faehigkeiten.js?v=28";
import { bitcoinSystem } from "./bitcoin.js?v=28";
import { techSystem } from "./tech.js?v=28";
import * as grafik from "./grafik.js?v=28";
import { haushaltSystem } from "./haushalt.js?v=28";
import { farmSystem } from "./farm.js?v=28";
import { reittierSystem } from "./reittiere.js?v=28";

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
let gewaehltesTier = null;
let gewaehltesStueck = null; // { platz } oder { roh } (Lager)
let gewaehlteFaehigkeit = null;
let gewaehltesReittier = null;
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

function summe(wirkung) {
  return upgradesHier()
    .filter((u) => u.wirkung === wirkung)
    .reduce((s, u) => s + u.wertProStufe * stufe(u), 0);
}

const klickWert = () => (zeitalter().klickGrundwert + summe("klick")) * (1 + tech.wert("produktion"));
const proSekunde = () => summe("proSekunde") * (1 + tech.wert("produktion"));
// art: "nah" oder "fern" – je nachdem, welche Waffe der Held gerade benutzt.
function schaden(art) {
  const b = waffen.bonus();
  const tb = tiere.bonus();
  const grund =
    daten.einstellungen.kampf.grundSchaden + summe("schaden") + b.schaden + (art === "fern" ? b.schadenFern : b.schadenNah) + tb.schaden;
  return grund * (1 + b.set) * (1 + tb.schadenProzent) * (1 + b.schmuckSet) * (1 + tech.wert("schaden"));
}
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
  haushalt.schritt(jetzt, Math.min(24, off.maxStunden + tech.wert("offline")) * 3600);
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
  const farbe = getComputedStyle(document.documentElement).getPropertyValue("--spieler").trim() || "#3c8fe0";
  document.querySelector(".figur.spieler").style.backgroundImage = grafik.spielerBild(stand.aktiveSeite, zeitalter(), farbe, tragen);
}

function anzeigeAktualisieren() {
  const w = waehrung();
  $("zaehler-zahl").textContent = zahl(guthaben());
  $("zaehler-name").textContent = w.name;
  $("zaehler-btc").textContent = "≈ " + btc(guthaben() * btcKurs()) + " ₿" + (farm.imCrash() ? " 📉" : "");
  $("pro-sekunde").textContent =
    zahl(proSekunde()) + " pro Sek. · " + zahl(klickWert()) + " pro Tippen · Dein ₿ " + btc(seite().btc.menge);
  if (!$("btc-fenster").hidden) btcKnoepfe();
  for (const u of upgradesHier()) {
    const knopf = document.querySelector(`[data-upgrade="${u.id}"]`);
    if (!knopf) continue;
    const voll = stufe(u) >= u.maxStufe;
    knopf.disabled = voll || guthaben() < kosten(u);
  }
  kampfZeichnen();
  ambossZeichnen();
  if (!$("waffen-fenster").hidden) waffenKnoepfe();
  if (!$("tiere-fenster").hidden) brutZeichnen();
}

let lebenVorher = [];
let spielerLebenVorher = 0;

function wackeln(element, klasse) {
  element.classList.remove(klasse);
  void element.offsetWidth;
  element.classList.add(klasse);
}

// Treffer: Figur blitzt kurz auf, die Schadenszahl steigt hoch.
function treffer(box, menge, farbe) {
  if (document.hidden) return;
  wackeln(box.querySelector(".figur"), "getroffen");
  if (box.querySelectorAll(".schadenszahl").length >= 3) return;
  const zahlEl = el("span", "schadenszahl", "-" + zahl(Math.max(1, Math.round(menge))));
  zahlEl.style.color = farbe;
  zahlEl.style.left = 30 + Math.random() * 40 + "%";
  box.append(zahlEl);
  setTimeout(() => zahlEl.remove(), 700);
}

// Pfeil fliegt quer durch die Arena (nur Anzeige; der Schaden ist schon verrechnet).
function geschoss(von, nach, gespiegelt) {
  const arena = $("arena");
  if (arena.querySelectorAll(".geschoss").length >= 6) return;
  const g = el("div", "geschoss" + (gespiegelt ? " gespiegelt" : ""));
  g.style.backgroundImage = grafik.symbolBild("pfeil");
  arena.append(g);
  const flug = g.animate([{ left: von + "%" }, { left: nach + "%" }], { duration: 200, easing: "linear" });
  flug.onfinish = () => g.remove();
  setTimeout(() => g.remove(), 400);
}

// Der Held hält die Waffe in der Hand, die er gerade benutzt: Bogen beim Schießen, Nahkampf-Waffe beim Zuschlagen.
function heldWaffe(art) {
  const w = waffen.werte(waffen.hole(art), art);
  const bild = $("held-waffe");
  const k = art + "|" + (w ? w.id : "") + "|" + zeitalter().id;
  if (bild.dataset.k === k) return;
  bild.dataset.k = k;
  bild.className = "held-waffe " + art;
  bild.style.backgroundImage = grafik.stueckBild(art, w ? zeitalterVon(w.zeitalter) : zeitalter(), w ? w.id : "", false);
}

// Weißer Bogen am Gegner, wenn der Held mit der Nahkampf-Waffe trifft.
function hiebSpur(box) {
  if (!box) return;
  const spur = el("span", "hieb-spur");
  box.append(spur);
  setTimeout(() => spur.remove(), 260);
}

function kampfZeichnen() {
  const z = kampf.zustand();
  const s = seite();
  const trank = daten.dungeons.heiltrank;
  $("stufe-text").textContent = z.boss ? "Boss-Kampf" : "Stufe " + z.stufe + "-" + z.welle;
  $("spieler-level").textContent =
    "Level " + s.level + " · " + Math.floor((100 * s.xp) / xpBedarf(s.level)) + " % · ⚔ " + zahl(schaden("nah")) + " · ➶ " + zahl(schaden("fern")) +
    (z.boss ? " · Tränke " + s.traenke + "/" + trank.max : "");
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
    heldWaffe("fern"); // neue Welle: Gegner sind weit weg, der Held nimmt den Bogen
  }
  const ort = (g) => 27 + Math.min(1.1, g.x) * 62; // Prozent der Arena-Breite
  z.gegner.forEach((g, i) => {
    const box = gruppe.children[i];
    box.style.left = ort(g) + "%";
    box.classList.toggle("weg", g.leben <= 0);
    box.classList.toggle("laeuft", g.leben > 0 && g.x > g.halt + 1e-6);
    box.querySelector(".fuellung").style.width = (100 * Math.max(0, g.leben)) / g.maxLeben + "%";
    const weniger = lebenVorher[i] - g.leben;
    if (weniger > 0.001) treffer(box, weniger, "#fff");
    lebenVorher[i] = g.leben;
  });
  const spielerBox = $("spieler-box");
  const spielerFigur = spielerBox.querySelector(".figur");
  if (!document.hidden) {
    for (const e of z.effekte) {
      const ziel = z.gegner[e.i];
      if (!ziel) continue;
      if (e.art === "schuss") {
        heldWaffe("fern");
        wackeln($("held-waffe"), "spannen");
        geschoss(20, ort(ziel), false);
      } else if (e.art === "schlag") {
        heldWaffe("nah");
        wackeln(spielerFigur, "schlag");
        wackeln($("held-waffe"), "schwung");
        hiebSpur(gruppe.children[e.i]);
      }
      else if (e.art === "gegnerSchuss") geschoss(ort(ziel), 14, true);
      else if (e.art === "gegnerSchlag") wackeln(gruppe.children[e.i].querySelector(".figur"), "hieb");
    }
  }
  if (spielerLebenVorher - z.spielerLeben > 0.001 && spielerLebenVorher <= z.maxLeben) treffer(spielerBox, spielerLebenVorher - z.spielerLeben, "#ff6b5e");
  spielerLebenVorher = z.spielerLeben;

  const knopf = $("boss-knopf");
  const fehlt = aufstiegFehlt();
  if (z.boss) {
    knopf.textContent = "Boss-Kampf läuft …";
    knopf.disabled = true;
  } else if (fehlt === null) {
    knopf.textContent = "Nächstes Zeitalter kommt später";
    knopf.disabled = true;
  } else if (fehlt.length) {
    knopf.textContent = "Noch nötig: " + fehlt.join(", ");
    knopf.disabled = true;
  } else {
    const boss = gegnerDaten().boss;
    knopf.textContent = "Boss herausfordern: " + (boss.name[stand.aktiveSeite] || boss.name.gut);
    knopf.disabled = false;
  }
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
  ["nah", "Nahkampf", "🗡"],
  ["fern", "Fernkampf", "🏹"],
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
    bild: grafik.stueckBild(art, w ? zeitalterVon(w.zeitalter) : zeitalter(), w ? w.id : "", !w),
    sterne: w ? w.sterne : 0,
    lv: lv > 0 ? "Lv. " + lv : "",
    gewaehlt,
    klick,
  });
}

function rasterZeichnen() {
  spielerBildSetzen();
  $("held-waffe").dataset.k = "";
  const raster = $("ausruestung-raster");
  raster.replaceChildren();
  for (const [art, name] of PLAETZE)
    raster.append(
      platzKachel(art, name, () => {
        gewaehltesStueck = waffen.hole(art) ? { platz: art } : null;
        fensterZeigen("waffen-fenster");
      })
    );
}

function ambossZeichnen() {
  const ambossBild = document.querySelector(".amboss-bild");
  if (!ambossBild.style.backgroundImage) ambossBild.style.backgroundImage = grafik.symbolBild("amboss");
  autoZeichnen();
  $("amboss-text").textContent = "Schmieden · " + zahl(waffen.schmiedeKosten()) + " " + waehrung().name;
  $("amboss-knopf").classList.toggle("matt", guthaben() < waffen.schmiedeKosten());
  const rest = waffen.ausbauRest(Date.now());
  $("schmiede-stufe-knopf").textContent = "Schmiede Stufe " + seite().schmiede.stufe;
  $("schmiede-zeit").textContent =
    rest !== null ? "Ausbau: noch " + dauer(Math.ceil(rest)) : waffen.stufeVoll() ? "Maximum" : "Ausbau: " + zahl(waffen.stufeKosten()) + " " + waehrung().name;
}

function upgradesZeichnen() {
  const liste = $("upgrades");
  liste.replaceChildren();
  for (const u of upgradesHier()) {
    const voll = stufe(u) >= u.maxStufe;
    const knopf = el("button", "upgrade");
    knopf.type = "button";
    knopf.dataset.upgrade = u.id;
    const links = el("span", "upgrade-links");
    links.append(el("span", "upgrade-name", upgradeName(u)), el("span", "upgrade-text", upgradeText(u)));
    const rechts = el("span", "upgrade-rechts");
    rechts.append(
      el("span", "upgrade-stufe", "Stufe " + stufe(u)),
      el("span", "upgrade-kosten", voll ? "Maximum" : zahl(kosten(u)) + " " + waehrung().name)
    );
    knopf.append(links, rechts);
    knopf.addEventListener("click", () => kaufen(u));
    liste.append(knopf);
  }
  anzeigeAktualisieren();
}

// Unten 5 Knöpfe. Jeder öffnet eine ganze Seite; darüber liegen die Reiter der Gruppe (wie bei Forge Master).
// Die Schmiede-Seite gehört zu keinem Knopf: Sie öffnet sich beim Tippen auf die Ausrüstung.
const GRUPPEN = [
  { id: "kampf", name: "Kampf" },
  { id: "dungeons", name: "Dungeons", reiter: [["dungeon-fenster", "Dungeons", () => (($("dungeon-ergebnis").textContent = ""), dungeonsZeichnen())]] },
  {
    id: "held",
    name: "Held",
    reiter: [
      ["faehigkeiten-fenster", "Fähigkeiten", () => (($("faehigkeit-ergebnis").textContent = ""), faehigkeitenZeichnen())],
      ["tiere-fenster", "Haustiere", () => tiereZeichnen()],
      ["reittiere-fenster", "Reittiere", () => reittiereZeichnen()],
      ["tech-fenster", "Tech-Baum", () => techZeichnen()],
    ],
  },
  {
    id: "geld",
    name: "Geld",
    reiter: [
      ["upgrades-fenster", "Upgrades", () => upgradesZeichnen()],
      ["btc-fenster", "Bitcoin", () => btcZeichnen()],
      ["haushalt-fenster", "Haushalt", () => haushaltZeichnen()],
      ["farm-fenster", "Farm", () => farmZeichnen(true)],
    ],
  },
  { id: "menue", name: "Menü", reiter: [["menue", "Menü", () => {}]] },
  { id: "schmiede", name: "Schmiede", versteckt: true, reiter: [["waffen-fenster", "Schmiede", () => waffenZeichnen()]] },
];
let offeneGruppe = null;
let offenerReiter = null;
const letzterReiter = {};
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
  if (!g || !g.reiter) return seiteSchliessen();
  const r = g.reiter.find((x) => x[0] === (fensterId || letzterReiter[g.id])) || g.reiter[0];
  for (const gg of GRUPPEN) for (const rr of gg.reiter || []) $(rr[0]).hidden = true;
  offeneGruppe = g.id;
  offenerReiter = r[0];
  letzterReiter[g.id] = r[0];
  const leiste = $("reiter");
  leiste.replaceChildren();
  leiste.hidden = g.reiter.length < 2;
  for (const rr of g.reiter) {
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
    const an = offeneGruppe === g.id;
    const knopf = el("button", "rund" + (an ? " an" : ""));
    knopf.type = "button";
    const rund = el("span", "rund-symbol");
    rund.style.backgroundImage = grafik.symbolBild(an ? "zu" : g.id);
    knopf.append(rund, el("span", "rund-name", g.name));
    knopf.addEventListener("click", () => (an || g.id === "kampf" ? seiteSchliessen() : seiteOeffnen(g.id)));
    leiste.append(knopf);
  }
}

function allesZeichnen() {
  farbenSetzen();
  $("zeitalter-name").textContent =
    (stand.aktiveSeite === "boese" ? "🦹 Dieb · " : "🛡 Beschützer · ") + "Zeitalter " + zeitalter().nummer + ": " + zeitalter().name;
  $("seite-knopf").textContent = stand.aktiveSeite === "boese" ? "Zur Beschützer-Seite wechseln 🛡" : "Zur Dieb-Seite wechseln 🦹";
  $("verdienen-text").textContent = zeitalter().verdienKnopf;
  upgradesZeichnen();
  leisteZeichnen();
  rasterZeichnen();
  reittierAnzeigen();
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

// Zeigt Name und Werte des angetippten Stücks, dazu die passenden Knöpfe.
function stueckInfoZeichnen() {
  const box = $("stueck-info");
  box.replaceChildren();
  const g = gewaehltesStueck;
  if (!g) return box.append(el("p", "hinweis", "Tippe ein Stück an, um Name und Werte zu sehen."));
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
    box.append(name, el("div", "hinweis", w.seltenheit.name + " · angelegt · +" + zahl(w.schaden) + " Schaden · +" + zahl(w.leben) + " Leben · Händler Lv. " + bitcoin.stufe(g.platz)));
    return;
  }
  const e = waffen.lagerListe().find((x) => x.roh.id === g.roh.id && x.roh.seltenheit === g.roh.seltenheit && (x.roh.sterne || 0) === (g.roh.sterne || 0));
  if (!e) return void (gewaehltesStueck = null);
  const name = el("div", "info-name", e.name + " " + "★".repeat(e.sterne) + " ×" + e.anzahl);
  name.style.color = e.seltenheit.farbe;
  box.append(name, el("div", "hinweis", e.seltenheit.name + " · +" + zahl(e.schaden) + " Schaden · +" + zahl(e.leben) + " Leben"));
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
  const bonusText = "+" + Math.round(daten.waffen.setBonusSchaden * 100) + " % Schaden";
  $("waffen-set").textContent = (b.set > 0 ? "Waffen-Set aktiv: " : "Waffen-Set: Nah- und Fernkampf-Waffe aus demselben Zeitalter geben ") + bonusText + ".";
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
    r.neu.seltenheit.name + ": " + r.neu.name + (r.besser ? " – ausgerüstet!" : " – ins Lager gelegt.");
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
    gewaehlt: w.nr === gewaehltesTier,
    klick: () => {
      gewaehltesTier = gewaehltesTier === w.nr ? null : w.nr;
      tiereZeichnen();
    },
  });
}

function brutZeichnen() {
  const brut = tiere.brutInfo(Date.now());
  const text = $("brut-text");
  text.textContent = brut ? brut.seltenheit.name + " – schlüpft in " + dauer(Math.ceil(brut.restSekunden)) : "Der Brutkasten ist leer. Eier fallen im Kampf.";
  text.style.color = brut ? brut.seltenheit.farbe : "";
  const reihe = $("eier-reihe");
  const eier = seite().tiere.eier;
  const k = (brut ? "1" : "0") + "|" + eier.map((e) => e.seltenheit).join(",");
  if (reihe.dataset.k === k) return;
  reihe.dataset.k = k;
  reihe.replaceChildren();
  const ei = (farbe, gross) => {
    const e = el("span", "ei" + (gross ? " gross" : ""));
    e.style.backgroundImage = grafik.eiBild(farbe);
    reihe.append(e);
  };
  if (brut) ei(brut.seltenheit.farbe, true);
  for (const e of eier) ei((daten.waffen.seltenheiten[e.seltenheit] || daten.waffen.seltenheiten[0]).farbe, false);
}

function tierTeamAendern(aktion) {
  aktion(gewaehltesTier);
  kampf.neuStarten();
  tiereZeichnen();
  anzeigeAktualisieren();
  sichern();
}

function tiereZeichnen() {
  brutZeichnen();
  const t = seite().tiere;
  const team = $("tier-team");
  team.replaceChildren(tierKachel(tiere.werte(tiere.finde(t.kaempfer)), "Kampf"));
  const ab = tiere.plaetzeAbLevel();
  for (let i = 0; i < ab.length - 1; i++) {
    const frei = i < tiere.plaetze();
    const w = frei ? tiere.werte(tiere.finde(t.supporter[i])) : null;
    team.append(tierKachel(w, frei ? "Hilfe" : "ab Lv. " + ab[i + 1]));
  }

  const alle = t.sammlung.map((x) => tiere.werte(x)).filter(Boolean);
  alle.sort((a, b) => b.staerke - a.staerke);
  $("sammlung-titel").textContent = "Sammlung (" + alle.length + ")";
  const sammlung = $("tier-sammlung");
  sammlung.replaceChildren(...alle.map((w) => tierKachel(w, "")));
  if (!alle.length) sammlung.append(el("p", "hinweis", "Noch kein Tier. Besiege Gegner, um Eier zu finden."));

  const aktionen = $("tier-aktionen");
  aktionen.replaceChildren();
  const w = tiere.werte(tiere.finde(gewaehltesTier));
  if (!w) return;
  const art = w.supporterArt === "schaden" ? "Schaden" : "Leben";
  const tierName = el("div", "info-name", w.name + " " + "★".repeat(w.sterne));
  tierName.style.color = w.seltenheit.farbe;
  aktionen.append(
    tierName,
    el(
      "p",
      "hinweis",
      w.seltenheit.name + ": als Kämpfer +" + zahl(w.schaden) + " Schaden und +" + zahl(w.leben) + " Leben. Als Supporter +" +
        prozent(w.supporterProzent) + " " + art + "."
    )
  );
  const knopf = (text, aktion, aus) => {
    const k = el("button", "knopf klein", text);
    k.type = "button";
    k.disabled = aus;
    k.addEventListener("click", () => tierTeamAendern(aktion));
    aktionen.append(k);
  };
  const imTeam = t.kaempfer === w.nr || t.supporter.includes(w.nr);
  knopf("Als Kämpfer", tiere.alsKaempfer, t.kaempfer === w.nr);
  knopf("Als Supporter", tiere.alsSupporter, tiere.plaetze() === 0 || t.supporter.includes(w.nr));
  knopf("Aus dem Team nehmen", tiere.herausnehmen, !imTeam);
  knopf("Mergen: 3 gleiche werden +1 Stern", tiere.mergen, !tiere.mergbar(w.nr));
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
    const i = dungeons.info(art.id);
    const karte = el("div", "dungeon");
    karte.append(
      el("div", "dungeon-name", art.name),
      el("div", "hinweis", art.text),
      el("div", "dungeon-stand", "Tickets " + i.tickets + "/" + daten.dungeons.ticketsMax + " · nächste Stufe " + i.stufe)
    );
    const kampfKnopf = el("button", "knopf klein", "Stufe " + i.stufe + " kämpfen");
    kampfKnopf.type = "button";
    kampfKnopf.disabled = i.tickets <= 0;
    kampfKnopf.addEventListener("click", () => dungeonErgebnis(dungeons.kaempfen(art.id)));
    const autoKnopf = el("button", "knopf klein", i.stufe > 1 ? "Auto-Clear Stufe " + (i.stufe - 1) : "Auto-Clear (noch nichts geschafft)");
    autoKnopf.type = "button";
    autoKnopf.disabled = i.stufe <= 1 || i.tickets <= 0;
    autoKnopf.addEventListener("click", () => dungeonErgebnis(dungeons.autoClear(art.id)));
    karte.append(kampfKnopf, autoKnopf);
    box.append(karte);
  }
}

// ---------- Fähigkeiten ----------

function faehigkeitGeaendert() {
  faehigkeitenZeichnen();
  anzeigeAktualisieren();
  sichern();
}

function faehigkeitenZeichnen() {
  const f = seite().faehigkeiten;
  $("punkte-text").textContent = "Punkte: " + f.punkte + " (gibt es in den Dungeons)";
  $("ziehen-knopf").textContent = "Ziehen (" + faehigkeiten.ziehenKosten() + " Punkte)";
  $("ziehen-knopf").classList.toggle("matt", f.punkte < faehigkeiten.ziehenKosten());
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
      gewaehlt: gewaehlteFaehigkeit === w.id,
      klick: () => {
        gewaehlteFaehigkeit = gewaehlteFaehigkeit === w.id ? null : w.id;
        faehigkeitenZeichnen();
      },
    });

  const plaetze = $("faehigkeit-plaetze");
  plaetze.replaceChildren();
  const ab = faehigkeiten.plaetzeAbLevel();
  for (let i = 0; i < ab.length; i++) {
    const frei = i < faehigkeiten.plaetze();
    const w = frei ? faehigkeiten.werte(f.sammlung.find((x) => x.id === f.ausgeruestet[i])) : null;
    plaetze.append(w ? kachel(w) : bildKachel({ rund: true, leer: true, marke: frei ? "frei" : "ab Lv. " + ab[i] }));
  }

  const liste = $("faehigkeit-liste");
  liste.replaceChildren();
  const alle = faehigkeiten.liste();
  if (!alle.length) liste.append(el("p", "hinweis", "Noch keine Fähigkeit. Hol dir Punkte in den Dungeons und ziehe."));
  for (const w of alle) liste.append(kachel(w, w.ausgeruestet ? "an" : w.kopien + "/2"));

  const info = $("faehigkeit-info");
  info.replaceChildren();
  const w = alle.find((x) => x.id === gewaehlteFaehigkeit);
  if (!w) return info.append(el("p", "hinweis", "Tippe eine Fähigkeit an."));
  const name = el("div", "info-name", w.name + " " + "★".repeat(w.sterne));
  name.style.color = w.seltenheit.farbe;
  info.append(name, el("div", "hinweis", w.text + " " + w.seltenheit.name + " · Stärke ×" + zahl(w.faktor) + " · Kopien " + w.kopien));
  const knopf = (text, aus, aktion) => {
    const k = el("button", "knopf klein", text);
    k.type = "button";
    k.disabled = aus;
    k.addEventListener("click", () => {
      aktion();
      faehigkeitGeaendert();
    });
    info.append(k);
  };
  if (w.ausgeruestet) knopf("Ablegen", false, () => faehigkeiten.ablegen(w.id));
  else knopf("Ausrüsten", false, () => faehigkeiten.ausruesten(w.id));
  const e = f.sammlung.find((x) => x.id === w.id);
  knopf("Level +1 (" + faehigkeiten.levelKosten(e) + ")", f.punkte < faehigkeiten.levelKosten(e), () => faehigkeiten.levelKaufen(w.id));
  knopf("Mergen (+1 Stern)", !faehigkeiten.mergbar(w.id), () => faehigkeiten.mergen(w.id));
}

// ---------- Reittiere ----------

function reittierAnzeigen() {
  const a = reittiere.aktiv();
  const bild = $("reittier-bild");
  bild.hidden = !a;
  $("spieler-box").classList.toggle("reitet", !!a);
  if (a) bild.style.backgroundImage = grafik.reittierBild(a.id);
}

function reittiereZeichnen() {
  const a = reittiere.aktiv();
  $("reittier-tempo").textContent = a
    ? "Angriffstempo +" + prozent(a.tempo) + " durch " + a.name + "."
    : "Noch kein Reittier. Aus Eiern schlüpft manchmal eins statt eines Haustiers.";
  const liste = reittiere.liste();
  $("reittier-mergen").hidden = !liste.some((w) => reittiere.mergbar(w.nr));
  const box = $("reittier-liste");
  box.replaceChildren();
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
        gewaehlt: gewaehltesReittier === w.nr,
        klick: () => {
          gewaehltesReittier = gewaehltesReittier === w.nr ? null : w.nr;
          reittiereZeichnen();
        },
      })
    );
  const info = $("reittier-info");
  info.replaceChildren();
  const w = liste.find((x) => x.nr === gewaehltesReittier);
  if (!w) return;
  const name = el("div", "info-name", w.name + " " + "★".repeat(w.sterne));
  name.style.color = w.seltenheit.farbe;
  info.append(name, el("div", "hinweis", w.seltenheit.name + " · Zeitalter " + zeitalterVon(w.zeitalter).nummer + " · Angriffstempo +" + prozent(w.tempo)));
  const knopf = (text, aus, aktion) => {
    const k = el("button", "knopf klein", text);
    k.type = "button";
    k.disabled = aus;
    k.addEventListener("click", () => {
      aktion();
      reittierAnzeigen();
      reittiereZeichnen();
      sichern();
    });
    info.append(k);
  };
  knopf("Satteln", !!a && a.nr === w.nr, () => reittiere.satteln(w.nr));
  knopf("Mergen (3 → +1 Stern)", !reittiere.mergbar(w.nr), () => reittiere.mergen(w.nr));
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
  $("btc-guthaben").textContent = "Dein ₿: " + btc(b.menge);
  $("btc-kurs").textContent =
    "Kurs: 1 " + waehrung().name + " = " + btc(waehrung().btcProStueck) + " ₿ · Händler-Kasse: " + btc(b.kasse) + " ₿";
  for (const k of document.querySelectorAll("[data-btc-platz]")) {
    const platz = k.dataset.btcPlatz;
    k.disabled = bitcoin.voll(platz) || b.menge < bitcoin.preis(platz);
  }
}

function btcZeichnen() {
  const liste = $("haendler-liste");
  liste.replaceChildren();
  for (const h of bitcoin.haendler()) {
    const karte = el("div", "dungeon" + (h.offen ? "" : " zu"));
    karte.append(el("div", "dungeon-name", h.name), el("div", "hinweis", h.offen ? h.text : "Ab Zeitalter " + h.ab + "."));
    if (h.offen) {
      for (const platz of h.plaetze) {
        const zeile = el("div", "lager-zeile");
        const info = el("span", "lager-info");
        const lv = bitcoin.stufe(platz);
        info.append(
          el("span", "lager-name", PLATZ_NAMEN[platz] + " · Lv. " + lv + "/100"),
          el("span", "hinweis", "+" + Math.round((bitcoin.faktor(platz) - 1) * 100) + " % Werte")
        );
        const knopf = el("button", "knopf klein", bitcoin.voll(platz) ? "Max" : btc(bitcoin.preis(platz)) + " ₿");
        knopf.type = "button";
        knopf.dataset.btcPlatz = platz;
        knopf.addEventListener("click", () => {
          if (bitcoin.upgradeKaufen(platz)) btcGeaendert();
        });
        zeile.append(info, knopf);
        karte.append(zeile);
      }
    }
    liste.append(karte);
  }
  btcKnoepfe();
}

// ---------- Tech-Baum ----------

function techZeiten() {
  for (const a of tech.aeste()) {
    const l = tech.laeuft(a.id);
    const feld = document.querySelector(`[data-tech-lauf="${a.id}"]`);
    if (feld) feld.textContent = l ? "Forschung läuft: noch " + dauer(Math.ceil((l.bis - Date.now()) / 1000)) : "";
  }
}

function techZeichnen() {
  $("tech-punkte").textContent = "Tech-Punkte: " + stand.gemeinsam.tech.punkte + " (gibt es in den Dungeons, gilt für beide Seiten)";
  const reiter = $("tech-reiter");
  reiter.replaceChildren();
  for (const a of tech.aeste()) {
    const k = el("button", "knopf klein" + (a.id === techAst ? "" : " matt"), a.name + (tech.astOffen(a.id) ? "" : " 🔒"));
    k.type = "button";
    k.addEventListener("click", () => {
      techAst = a.id;
      techZeichnen();
    });
    reiter.append(k);
  }
  const box = $("tech-ebenen");
  box.replaceChildren();
  const a = tech.aeste().find((x) => x.id === techAst);
  if (!tech.astOffen(a.id)) {
    const grund = { farm: "mit der Mining Farm", haushalt: "mit Haushalt und Firma", dungeons: "mit den Dungeons" }[a.offen];
    box.append(el("p", "hinweis", "Dieser Ast öffnet sich " + (grund || "später") + "."));
    return;
  }
  const lauf = el("p", "ergebnis");
  lauf.dataset.techLauf = a.id;
  box.append(lauf);
  for (let eb = 1; eb <= tech.ebenen(); eb++) {
    const offen = tech.ebeneOffen(a.id, eb);
    const zeile = el("div", "tech-ebene" + (offen ? "" : " zu"));
    zeile.append(el("div", "tech-ebene-titel", "Ebene " + eb + (offen ? "" : " · gesperrt (Zeitalter " + eb + " und Ebene davor)")));
    const reihe = el("div", "tech-reihe");
    for (let nr = 1; nr <= tech.knotenJeEbene(); nr++) {
      const k = tech.knoten(a.id, eb, nr);
      const st = tech.stufe(k.id);
      const voll = st >= tech.maxStufe();
      const knopf = el("button", "tech-knoten" + (voll ? " voll" : ""));
      knopf.type = "button";
      knopf.disabled = !offen;
      knopf.append(
        el("span", "tech-name", k.effekt.name),
        el("span", "tech-stufe", st + "/" + tech.maxStufe()),
        el("span", "tech-text", k.effekt.text),
        el("span", "tech-preis", voll ? "fertig" : tech.kosten(k) + " TP · " + dauer(tech.dauer(k)))
      );
      knopf.addEventListener("click", () => {
        const fehler = tech.starten(a.id, eb, nr);
        if (fehler) return kurzMeldung(fehler);
        kurzMeldung("Forschung gestartet: " + k.effekt.name);
        techZeichnen();
        sichern();
      });
      reihe.append(knopf);
    }
    zeile.append(reihe);
    box.append(zeile);
    if (!offen) break; // nur die erste gesperrte Ebene zeigen
  }
  techZeiten();
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
    if (gegner.boss && Math.random() < tech.wert("bossEi")) {
      const extra = tiere.eiGeben(2.5, 0);
      kurzMeldung("Zweites Boss-Ei: " + extra.name);
    }
    const ei = tiere.eiWurf(gegner.typ);
    if (ei) {
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
  s.zeitalter = neu.id;
  s.kampf = { index: 0, rate: 0, stufe: 1, welle: 1 };
  kampf.neuStarten();
  allesZeichnen();
  sichern();
  hinweis(
    "Aufstieg!",
    boss.name + " ist besiegt. Willkommen in Zeitalter " + neu.nummer + ": " + neu.name + ". Dein Vorrat wurde umgetauscht, der Wert in ₿ bleibt gleich.",
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
  $("boss-knopf").addEventListener("click", () => {
    kampf.bossStarten();
    kampfZeichnen();
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
      e.textContent = r.seltenheit.name + ": " + r.name + (r.neu ? " – neu!" : " – Kopie für Sterne.");
      e.style.color = r.seltenheit.farbe;
    }
    faehigkeitGeaendert();
  });
  $("schmieden-knopf").addEventListener("click", () => schmieden(false));
  $("amboss-knopf").addEventListener("click", () => {
    if (guthaben() < waffen.schmiedeKosten()) return kurzMeldung("Zu wenig " + waehrung().name + " zum Schmieden.");
    schmieden();
  });
  $("auto-knopf").addEventListener("click", () => {
    autoSetzen(!autoAn);
    kurzMeldung(autoAn ? "Auto-Schmieden an: alle " + zahl(waffen.autoSekunden()) + " Sek., solange das Spiel offen ist." : "Auto-Schmieden aus.");
  });
  $("schmiede-stufe-knopf").addEventListener("click", schmiedeVerbessern);
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
    tempo: () => (reittiere ? reittiere.tempo() : 0),
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
  });
  waffen = waffenSystem({
    platzFaktor: (art) => bitcoin.faktor(art),
    daten: () => daten.waffen,
    seite,
    seitenName: () => stand.aktiveSeite,
    zeitalterId: () => zeitalter().id,
    zeitalterStaerke: (id) => (daten.zeitalter.find((z) => z.id === id) || {}).staerke || 1,
    bezahlen,
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
    lagerPlus: () => tech.wert("lager"),
    supporterFaktor: () => 1 + tech.wert("supporter"),
    reittierAusEi: (ei) => reittiere.ausEi(ei),
  });
  reittiere = reittierSystem({
    daten: () => daten.reittiere,
    seltenheiten: () => daten.waffen.seltenheiten,
    seite,
    zeitalterNummerVon: (id) => (daten.zeitalter.find((z) => z.id === id) || { nummer: 1 }).nummer,
  });
  faehigkeiten = faehigkeitenSystem({
    daten: () => daten.faehigkeiten,
    seltenheiten: () => daten.waffen.seltenheiten,
    seite,
    seitenName: () => stand.aktiveSeite,
    level: () => seite().level,
    grundSchaden: schaden,
  });
  dungeons = dungeonSystem({
    daten: () => daten.dungeons,
    seite,
    spieler: () => ({ schaden: Math.max(schaden("nah"), schaden("fern")), leben: maxLeben() }),
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
    mengeText: (menge) => zahl(menge) + " " + waehrung().name,
  });
  knoepfeVerbinden();
  allesZeichnen();
  tick();
  setInterval(tick, 250);
}

start();
