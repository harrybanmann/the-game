import { zahl, btc, dauer } from "./format.js";
import * as speicher from "./speicher.js";

const $ = (id) => document.getElementById(id);

let daten; // { einstellungen, zeitalter[], upgrades[] }
let stand; // Spielstand
let letzterTick = Date.now();
let letztesSpeichern = Date.now();

// ---------- Daten laden (alle Inhalte kommen aus JSON) ----------

async function json(pfad) {
  const antwort = await fetch(pfad, { cache: "no-cache" });
  if (!antwort.ok) throw new Error(pfad + " konnte nicht geladen werden");
  return antwort.json();
}

async function datenLaden() {
  const [einstellungen, zeitalter, upgrades] = await Promise.all([
    json("data/einstellungen.json"),
    json("data/zeitalter.json"),
    json("data/upgrades.json"),
  ]);
  return { einstellungen, zeitalter, upgrades };
}

// ---------- Rechnen ----------

const seite = () => stand.seiten[stand.aktiveSeite];
const zeitalter = () => daten.zeitalter.find((z) => z.id === seite().zeitalter) || daten.zeitalter[0];
const waehrung = () => zeitalter().waehrung;
const upgradesHier = () => daten.upgrades.filter((u) => u.zeitalter === zeitalter().id);
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

function gutschreiben(menge) {
  if (!(menge > 0)) return;
  const s = seite();
  s.waehrungen[waehrung().id] = guthaben() + menge;
  s.gesamtVerdient += menge;
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
    const menge = proSekunde() * gezaehlt * off.anteil;
    gutschreiben(menge);
    if (menge >= 1) offlineMeldung(sekunden, gezaehlt, menge);
    sichern();
  } else {
    gutschreiben(proSekunde() * sekunden);
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
}

function anzeigeAktualisieren() {
  const w = waehrung();
  $("zaehler-zahl").textContent = zahl(guthaben());
  $("zaehler-name").textContent = w.name;
  $("zaehler-btc").textContent = "≈ " + btc(guthaben() * w.btcProStueck) + " ₿";
  $("pro-sekunde").textContent = zahl(proSekunde()) + " pro Sekunde · " + zahl(klickWert()) + " pro Tippen";
  for (const u of upgradesHier()) {
    const knopf = document.querySelector(`[data-upgrade="${u.id}"]`);
    if (!knopf) continue;
    const voll = stufe(u) >= u.maxStufe;
    knopf.disabled = voll || guthaben() < kosten(u);
  }
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
    links.append(el("span", "upgrade-name", u.name), el("span", "upgrade-text", u.text));
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
      else kurzMeldung(k.name + " kommt in einer späteren Version.");
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
  $("offline-text").textContent = text;
  $("offline-menge").textContent = "+" + zahl(menge) + " " + waehrung().name;
  fensterZeigen("offline");
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
  sichern();
  allesZeichnen();
  fensterSchliessen("menue");
}

// ---------- Start ----------

function knoepfeVerbinden() {
  $("verdienen").addEventListener("pointerdown", verdienen);
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
  knoepfeVerbinden();
  allesZeichnen();
  tick();
  setInterval(tick, 250);
}

start();
