import { zahl, btc, dauer } from "./format.js?v=13";
import * as speicher from "./speicher.js?v=13";
import { kampfSystem } from "./kampf.js?v=13";
import { waffenSystem } from "./waffen.js?v=13";
import { tierSystem } from "./tiere.js?v=13";
import { dungeonSystem } from "./dungeons.js?v=13";
import { faehigkeitenSystem } from "./faehigkeiten.js?v=13";
import { bitcoinSystem } from "./bitcoin.js?v=13";

const $ = (id) => document.getElementById(id);

let daten; // { einstellungen, zeitalter[], upgrades[], gegner{} }
let stand; // Spielstand
let kampf; // Kampf-System
let waffen; // Schmiede und Waffen
let tiere; // Tiere und Eier
let dungeons; // Dungeons und Tickets
let faehigkeiten; // Fähigkeiten
let bitcoin; // Bitcoin und Händler
let gewaehltesTier = null;
let letzterTick = Date.now();
let letztesSpeichern = Date.now();

// ---------- Daten laden (alle Inhalte kommen aus JSON) ----------

async function json(pfad) {
  const antwort = await fetch(pfad, { cache: "no-cache" });
  if (!antwort.ok) throw new Error(pfad + " konnte nicht geladen werden");
  return antwort.json();
}

async function datenLaden() {
  const [einstellungen, zeitalter, upgrades, gegner, waffenDaten, tierDaten, dungeonDaten, faehigkeitDaten, btcDaten] = await Promise.all([
    json("data/einstellungen.json"),
    json("data/zeitalter.json"),
    json("data/upgrades.json"),
    json("data/gegner.json"),
    json("data/waffen.json"),
    json("data/tiere.json"),
    json("data/dungeons.json"),
    json("data/faehigkeiten.json"),
    json("data/bitcoin.json"),
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
const kosten = (u) => Math.ceil(u.grundKosten * Math.pow(u.kostenFaktor, stufe(u)));
const guthaben = () => seite().waehrungen[waehrung().id] || 0;

function summe(wirkung) {
  return upgradesHier()
    .filter((u) => u.wirkung === wirkung)
    .reduce((s, u) => s + u.wertProStufe * stufe(u), 0);
}

const klickWert = () => zeitalter().klickGrundwert + summe("klick");
const proSekunde = () => summe("proSekunde");
function schaden() {
  const b = waffen.bonus();
  const tb = tiere.bonus();
  const grund = daten.einstellungen.kampf.grundSchaden + summe("schaden") + b.schaden + tb.schaden;
  return grund * (1 + b.set) * (1 + tb.schadenProzent);
}
function maxLeben() {
  const tb = tiere.bonus();
  const b = waffen.bonus();
  const grund = daten.einstellungen.kampf.grundLeben + summe("leben") + b.leben + tb.leben;
  return grund * (1 + tb.lebenProzent) * (1 + b.lebenProzent);
}
const gegnerDaten = () => daten.gegner[zeitalter().id];
const xpBedarf = (level) =>
  Math.round(daten.einstellungen.level.grundXp * Math.pow(daten.einstellungen.level.faktor, level - 1));

function gutschreiben(menge) {
  if (!(menge > 0)) return;
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
    const gezaehlt = Math.min(sekunden, off.maxStunden * 3600);
    const menge = (proSekunde() + seite().kampf.rate) * gezaehlt * off.anteil;
    gutschreiben(menge);
    if (menge >= 1 && sekunden >= off.meldungAbSekunden) offlineMeldung(sekunden, gezaehlt, menge);
    sichern();
  } else {
    gutschreiben(proSekunde() * sekunden);
    kampf.schritt(sekunden);
  }

  dungeons.schritt();
  const zurueck = bitcoin.schritt(jetzt);
  if (zurueck > 0 && !$("btc-fenster").hidden) btcZeichnen();
  if (waffen.schritt(jetzt)) {
    kurzMeldung("Schmiede ist jetzt Stufe " + seite().schmiede.stufe + "!");
    if (!$("waffen-fenster").hidden) waffenZeichnen();
    sichern();
  }
  for (const tier of tiere.schritt(jetzt)) {
    kurzMeldung("Geschlüpft: " + tier.seltenheit.name + " – " + tier.name);
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

function farbenSetzen() {
  const f = zeitalter().farben;
  const stil = document.documentElement.style;
  stil.setProperty("--haupt", f.haupt);
  stil.setProperty("--zweit", f.zweit);
  stil.setProperty("--akzent", f.akzent);
  stil.setProperty("--symbol", f.symbol || "#6f7780");
}

function anzeigeAktualisieren() {
  const w = waehrung();
  $("zaehler-zahl").textContent = zahl(guthaben());
  $("zaehler-name").textContent = w.name;
  $("zaehler-btc").textContent = "≈ " + btc(guthaben() * w.btcProStueck) + " ₿";
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

function kampfZeichnen() {
  const z = kampf.zustand();
  const s = seite();
  const trank = daten.dungeons.heiltrank;
  $("stufe-text").textContent = z.boss ? "Boss-Kampf" : "Stufe " + z.stufe + "-" + z.welle;
  $("spieler-level").textContent =
    "Level " + s.level + " · XP " + zahl(s.xp) + "/" + zahl(xpBedarf(s.level)) + " · Heiltränke " + s.traenke + "/" + trank.max;
  $("spieler-werte").textContent = zahl(schaden()) + " Schaden";
  $("spieler-balken").style.width = (100 * z.spielerLeben) / z.maxLeben + "%";
  $("spieler-leben").textContent = zahl(Math.ceil(z.spielerLeben)) + "/" + zahl(Math.ceil(z.maxLeben));

  const gruppe = $("gegner-gruppe");
  gruppe.replaceChildren();
  for (const g of z.gegner) {
    const box = el("div", "gegner" + (g.leben <= 0 ? " weg" : "") + (g.boss ? " boss" : ""));
    const figur = el("div", "figur gegner-figur" + (g.typ === "elite" ? " elite" : "") + (g.boss ? " boss" : ""));
    const balken = el("div", "balken klein");
    const fuell = el("div", "fuellung rot");
    fuell.style.width = (100 * Math.max(0, g.leben)) / g.maxLeben + "%";
    balken.append(fuell);
    box.append(el("div", "gegner-name", g.name), figur, balken);
    gruppe.append(box);
  }

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
  if (!boss || !daten.zeitalter.some((x) => x.id === boss.naechstesZeitalter)) return null;
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

function rasterZeichnen() {
  const raster = $("ausruestung-raster");
  raster.replaceChildren();
  const aktiv = waffen.aktiveArt();
  for (const [art, name, symbol] of PLAETZE) {
    const offen = ["nah", "fern", "helm", "handschuhe", "ruestung", "stiefel"].includes(art);
    const w = offen ? waffen.werte(waffen.hole(art)) : null;
    const kachel = el("button", "kachel" + (w ? "" : " leer") + (offen ? "" : " zu"));
    kachel.type = "button";
    kachel.title = name;
    if (w) {
      kachel.style.background = w.seltenheit.farbe;
      if (w.seltenheit.glanz) kachel.classList.add("glanz");
      if ((art === "nah" || art === "fern") && art === aktiv) kachel.classList.add("aktiv");
    }
    kachel.append(el("span", "kachel-symbol", symbol), el("span", "kachel-name", w ? w.name : offen ? name : "bald"));
    if (w) kachel.append(el("span", "sterne", sterne(w.sterne)));
    const lv = bitcoin.stufe(art);
    if (lv > 0) kachel.append(el("span", "kachel-lv", "Lv. " + lv));
    kachel.addEventListener("click", () => {
      if (!offen) return kurzMeldung(name + " kommt in einer späteren Version.");
      waffenZeichnen();
      fensterZeigen("waffen-fenster");
    });
    raster.append(kachel);
  }
}

function ambossZeichnen() {
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

function leisteZeichnen() {
  const leiste = $("leiste");
  leiste.replaceChildren();
  for (const k of daten.einstellungen.leiste) {
    const knopf = el("button", "rund" + (k.offen ? "" : " gesperrt"));
    knopf.type = "button";
    knopf.append(el("span", "rund-symbol", k.symbol), el("span", "rund-name", k.name));
    knopf.addEventListener("click", () => {
      if (k.id === "menue") fensterZeigen("menue");
      else if (k.fenster) {
        ({ tiere: tiereZeichnen, waffen: waffenZeichnen, upgrades: upgradesZeichnen })[k.id]();
        fensterZeigen(k.fenster);
      } else kurzMeldung(k.name + " kommt in einer späteren Version.");
    });
    leiste.append(knopf);
  }
}

function allesZeichnen() {
  farbenSetzen();
  $("zeitalter-name").textContent = "Zeitalter " + zeitalter().nummer + ": " + zeitalter().name;
  $("verdienen-text").textContent = zeitalter().verdienKnopf;
  upgradesZeichnen();
  leisteZeichnen();
  rasterZeichnen();
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

function waffenKarte(art, titel) {
  const w = waffen.werte(seite().waffen[art]);
  const karte = el("div", "waffe");
  karte.append(el("div", "waffe-art", titel));
  if (!w) {
    karte.append(el("div", "waffe-leer", "Noch keine Waffe"));
    return karte;
  }
  karte.style.borderColor = w.seltenheit.farbe;
  if (w.seltenheit.glanz) karte.classList.add("glanz");
  const selten = el("div", "waffe-selten", w.seltenheit.name);
  selten.style.color = w.seltenheit.farbe;
  const aktiv = waffen.aktiveArt() === art;
  const knopf = el("button", "knopf klein", aktiv ? "Schlägt zu" : "Auswählen");
  knopf.type = "button";
  knopf.disabled = aktiv;
  knopf.addEventListener("click", () => {
    waffen.aktivSetzen(art);
    waffenZeichnen();
    anzeigeAktualisieren();
    sichern();
  });
  karte.append(
    el("div", "waffe-name", w.name),
    selten,
    el("div", "sterne", sterne(w.sterne)),
    el("div", "waffe-werte", "+" + zahl(w.schaden) + " Schaden"),
    el("div", "waffe-werte", "+" + zahl(w.leben) + " Leben"),
    knopf
  );
  return karte;
}

function ruestungKarte(art, titel) {
  const w = waffen.werte(waffen.hole(art));
  const karte = el("div", "waffe klein");
  karte.append(el("div", "waffe-art", titel));
  if (!w) {
    karte.append(el("div", "waffe-leer", "–"));
    return karte;
  }
  karte.style.borderColor = w.seltenheit.farbe;
  if (w.seltenheit.glanz) karte.classList.add("glanz");
  karte.append(
    el("div", "waffe-name", w.name),
    el("div", "sterne", sterne(w.sterne)),
    el("div", "waffe-werte", "+" + zahl(w.leben) + " Leben")
  );
  return karte;
}

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
  if (!liste.length) {
    box.append(el("p", "hinweis", "Leer. Was nicht besser ist, landet hier. 3 gleiche Stücke werden zu 1 Stück mit +1 Stern."));
    return;
  }
  for (const e of liste.slice(0, 40)) {
    const zeile = el("div", "lager-zeile");
    const name = el("span", "lager-name", e.name + " ×" + e.anzahl);
    name.style.color = e.seltenheit.farbe;
    const info = el("span", "lager-info");
    info.append(name, el("span", "sterne", sterne(e.sterne)));
    const anlegen = el("button", "knopf klein", "Anlegen");
    anlegen.type = "button";
    anlegen.addEventListener("click", () => {
      waffen.anlegenAusLager(e.roh);
      waffenGeaendert();
    });
    const mergen = el("button", "knopf klein", "Mergen");
    mergen.type = "button";
    mergen.disabled = !e.mergbar;
    mergen.addEventListener("click", () => {
      waffen.mergen(e.roh);
      waffenGeaendert();
    });
    zeile.append(info, anlegen, mergen);
    box.append(zeile);
  }
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
  $("waffen-plaetze").replaceChildren(waffenKarte("nah", "Nahkampf"), waffenKarte("fern", "Fernkampf"));
  $("ruestung-plaetze").replaceChildren(
    ruestungKarte("helm", "Helm"),
    ruestungKarte("handschuhe", "Handschuhe"),
    ruestungKarte("ruestung", "Rüstung"),
    ruestungKarte("stiefel", "Stiefel")
  );
  lagerZeichnen();
  const b = waffen.bonus();
  $("ruestung-set").textContent =
    "Rüstungs-Set: " + b.ruestungTeile + " von 4 Teilen aus einem Zeitalter (2 Teile +5 % Leben, 4 Teile +15 % Leben)" +
    (b.lebenProzent > 0 ? " – aktiv: +" + prozent(b.lebenProzent) + " Leben." : ".");
  const bonusText = "+" + Math.round(daten.waffen.setBonusSchaden * 100) + " % Schaden";
  $("waffen-set").textContent =
    b.set > 0
      ? "Waffen-Set aktiv: " + bonusText
      : "Waffen-Set: Nah- und Fernkampf-Waffe aus demselben Zeitalter geben " + bonusText + ".";
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

function schmieden() {
  const r = waffen.schmieden();
  if (!r) return;
  const text = $("schmiede-ergebnis");
  text.textContent =
    r.neu.seltenheit.name + ": " + r.neu.name + (r.besser ? " – ausgerüstet!" : " – ins Lager gelegt.");
  text.style.color = r.neu.seltenheit.farbe;
  if ($("waffen-fenster").hidden) kurzMeldung(text.textContent);
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
  const kachel = el("button", "tier");
  kachel.type = "button";
  if (!w) {
    kachel.classList.add("leer");
    kachel.append(el("span", "tier-marke", marke));
    kachel.disabled = true;
    return kachel;
  }
  kachel.style.borderColor = w.seltenheit.farbe;
  if (w.seltenheit.glanz) kachel.classList.add("glanz");
  if (w.nr === gewaehltesTier) kachel.classList.add("gewaehlt");
  if (marke) kachel.append(el("span", "tier-marke", marke));
  const selten = el("span", "tier-selten", w.seltenheit.name);
  selten.style.color = w.seltenheit.farbe;
  kachel.append(el("span", "tier-name", w.name), selten, el("span", "sterne", sterne(w.sterne)));
  kachel.addEventListener("click", () => {
    gewaehltesTier = gewaehltesTier === w.nr ? null : w.nr;
    tiereZeichnen();
  });
  return kachel;
}

function brutZeichnen() {
  const brut = tiere.brutInfo(Date.now());
  const text = $("brut-text");
  if (brut) {
    text.textContent = "Ei (" + brut.seltenheit.name + ") schlüpft in " + dauer(Math.ceil(brut.restSekunden));
    text.style.color = brut.seltenheit.farbe;
  } else {
    text.textContent = "Der Brutkasten ist leer.";
    text.style.color = "";
  }
  const wartend = seite().tiere.eier.length;
  $("eier-text").textContent =
    wartend > 0
      ? "Eier im Lager: " + wartend + " (höchstens " + daten.tiere.eierLagerMax + "). Sie schlüpfen der Reihe nach."
      : "Eier fallen im Kampf, vom Boss sicher. Je seltener das Ei, desto länger dauert es.";
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
  team.replaceChildren(tierKachel(tiere.werte(tiere.finde(t.kaempfer)), "Kämpfer"));
  const ab = tiere.plaetzeAbLevel();
  for (let i = 0; i < ab.length - 1; i++) {
    const frei = i < tiere.plaetze();
    const w = frei ? tiere.werte(tiere.finde(t.supporter[i])) : null;
    team.append(tierKachel(w, frei ? "Supporter" : "ab Level " + ab[i + 1]));
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
  aktionen.append(
    el(
      "p",
      "hinweis",
      w.name + ": als Kämpfer +" + zahl(w.schaden) + " Schaden und +" + zahl(w.leben) + " Leben. Als Supporter +" +
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
  $("punkte-text").textContent = "Fähigkeitspunkte: " + f.punkte + " (gibt es in den Dungeons)";
  $("ziehen-knopf").textContent = "Fähigkeit ziehen (" + faehigkeiten.ziehenKosten() + " Punkte)";
  $("ziehen-knopf").classList.toggle("matt", f.punkte < faehigkeiten.ziehenKosten());

  const plaetze = $("faehigkeit-plaetze");
  plaetze.replaceChildren();
  const ab = faehigkeiten.plaetzeAbLevel();
  for (let i = 0; i < ab.length; i++) {
    const frei = i < faehigkeiten.plaetze();
    const w = frei ? faehigkeiten.werte(f.sammlung.find((x) => x.id === f.ausgeruestet[i])) : null;
    const kachel = el("div", "tier" + (w ? "" : " leer"));
    if (w) {
      kachel.style.borderColor = w.seltenheit.farbe;
      kachel.append(el("span", "tier-name", w.name), el("span", "sterne", sterne(w.sterne)));
    } else {
      kachel.append(el("span", "tier-marke", frei ? "frei" : "ab Level " + ab[i]));
    }
    plaetze.append(kachel);
  }

  const liste = $("faehigkeit-liste");
  liste.replaceChildren();
  const alle = faehigkeiten.liste();
  if (!alle.length) liste.append(el("p", "hinweis", "Noch keine Fähigkeit. Hol dir Punkte in den Dungeons und ziehe."));
  for (const w of alle) {
    const karte = el("div", "dungeon");
    const name = el("div", "dungeon-name", w.name);
    name.style.color = w.seltenheit.farbe;
    karte.append(
      name,
      el("div", "sterne", sterne(w.sterne)),
      el("div", "hinweis", w.seltenheit.name + " · Level " + w.level + " · Kopien " + w.kopien + " · Stärke ×" + zahl(w.faktor)),
      el("div", "hinweis", w.text)
    );
    const knopf = (text, aus, aktion) => {
      const k = el("button", "knopf klein", text);
      k.type = "button";
      k.disabled = aus;
      k.addEventListener("click", () => {
        aktion();
        faehigkeitGeaendert();
      });
      karte.append(k);
    };
    if (w.ausgeruestet) knopf("Ablegen", false, () => faehigkeiten.ablegen(w.id));
    else knopf("Ausrüsten", false, () => faehigkeiten.ausruesten(w.id));
    const e = f.sammlung.find((x) => x.id === w.id);
    knopf("Level +1 (" + faehigkeiten.levelKosten(e) + " Punkte)", f.punkte < faehigkeiten.levelKosten(e), () =>
      faehigkeiten.levelKaufen(w.id)
    );
    knopf("Mergen: 3 gleiche werden +1 Stern", !faehigkeiten.mergbar(w.id), () => faehigkeiten.mergen(w.id));
    liste.append(karte);
  }
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

// ---------- Kampf: Boss und Aufstieg ----------

function kampfEreignis(name, gegner) {
  if (name === "sieg") {
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
  $(id).hidden = false;
}

function fensterSchliessen(id) {
  $(id).hidden = true;
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
  $("dungeons-knopf").addEventListener("click", () => {
    fensterSchliessen("menue");
    $("dungeon-ergebnis").textContent = "";
    dungeonsZeichnen();
    fensterZeigen("dungeon-fenster");
  });
  $("btc-knopf").addEventListener("click", () => {
    fensterSchliessen("menue");
    btcZeichnen();
    fensterZeigen("btc-fenster");
  });
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
  $("faehigkeiten-knopf").addEventListener("click", () => {
    fensterSchliessen("menue");
    $("faehigkeit-ergebnis").textContent = "";
    faehigkeitenZeichnen();
    fensterZeigen("faehigkeiten-fenster");
  });
  $("ziehen-knopf").addEventListener("click", () => {
    if (seite().faehigkeiten.punkte < faehigkeiten.ziehenKosten()) {
      kurzMeldung("Zu wenig Punkte. Punkte gibt es in den Dungeons (Menü → Dungeons).");
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
  $("schmieden-knopf").addEventListener("click", schmieden);
  $("amboss-knopf").addEventListener("click", () => {
    if (guthaben() < waffen.schmiedeKosten()) return kurzMeldung("Zu wenig " + waehrung().name + " zum Schmieden.");
    schmieden();
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
    wellen: () => daten.einstellungen.kampf.wellen,
    gutschreiben,
    xpGeben,
    ereignis: kampfEreignis,
    trank: () => daten.dungeons.heiltrank,
    faehigkeiten: () => faehigkeiten,
  });
  bitcoin = bitcoinSystem({
    daten: () => daten.bitcoin,
    seite,
    seitenName: () => stand.aktiveSeite,
    zeitalterNummer: () => zeitalter().nummer,
    kurs: () => waehrung().btcProStueck,
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
    spieler: () => ({ schaden: schaden(), leben: maxLeben() }),
    gegnerBasis: () => {
      const typen = gegnerDaten().typen;
      return { leben: typen.elite.leben, schaden: typen.elite.schaden, beute: typen.normal.beute };
    },
    eiGeben: (ratio, plus) => tiere.eiGeben(ratio, plus),
    schmiedenGratis: () => waffen.schmiedenGratis(),
    gutschreiben,
    punkteGeben: (stufe, meilenstein) => faehigkeiten.punkteGeben(stufe, meilenstein),
    mengeText: (menge) => zahl(menge) + " " + waehrung().name,
  });
  knoepfeVerbinden();
  allesZeichnen();
  tick();
  setInterval(tick, 250);
}

start();
