// Trading (erfundene Werte, Long/Short ohne Hebel, Dividenden) und Mining Farm (Rechner schürfen BTC).
// Dazu der BTC-Markt: BTC wird mit der Zeit mehr wert, ab und zu ein Crash (30–50 %) für etwa einen Tag.
// Alles läuft nach echter Zeit, also auch im Hintergrund und offline (mit Grenzen).

export function farmSystem(api) {
  const d = () => api.daten();
  const tr = () => api.seite().trading;
  const fa = () => api.seite().farm;
  const mk = () => api.seite().btcMarkt;

  // ---------- Trading ----------
  const offeneWerte = () => d().trading.werte.filter((w) => api.zeitalterNummer() >= w.ab);

  function gauss() {
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function kursSchritt() {
    const nachrichten = [];
    for (const w of offeneWerte()) {
      const k = tr().kurse[w.id] || { preis: 100, verlauf: [] };
      // Leichter Zug zurück Richtung 100, damit nichts davonläuft.
      let r = 0.02 * w.vol * Math.log(100 / k.preis) + w.vol * gauss();
      if (Math.random() < d().trading.nachrichtChance) {
        const gut = Math.random() < 0.5;
        r += (gut ? 1 : -1) * w.vol * (3 + Math.random() * 5);
        const liste = d().trading.nachrichten[gut ? "gut" : "schlecht"];
        nachrichten.push(liste[Math.floor(Math.random() * liste.length)].replace("{n}", w.name));
      }
      k.preis = Math.max(1, k.preis * Math.exp(r));
      k.verlauf.push(Math.round(k.preis * 100) / 100);
      if (k.verlauf.length > d().trading.verlauf) k.verlauf.shift();
      tr().kurse[w.id] = k;
    }
    return nachrichten;
  }

  const preis = (id) => (tr().kurse[id] ? tr().kurse[id].preis : 100);
  function gewinn(p) {
    const roh = p.einsatz * (preis(p.wert) / p.einstieg - 1) * (p.richtung === "long" ? 1 : -1);
    return roh > 0 ? roh * (1 + api.tech("tradingGewinn")) : Math.max(-p.einsatz, roh);
  }

  // ---------- Farm ----------
  const teilStufe = (id) => fa().teile[id] || 0;
  const plaetze = () => d().farm.startPlaetze + teilStufe("regale");
  const anzahlRechner = () => Object.values(fa().rechner).reduce((a, b) => a + b, 0);
  const energieStufe = () => Math.min(d().farm.energie.length - 1, Math.floor(api.tech("energie")));
  function leistung() {
    let hash = 0;
    let watt = 0;
    for (const r of d().farm.rechner) {
      const n = fa().rechner[r.id] || 0;
      hash += n * r.hash;
      watt += n * r.watt;
    }
    hash *= (1 + 0.05 * teilStufe("kuehlung")) * (1 + 0.05 * teilStufe("internet")) * (1 + api.tech("rechenleistung"));
    watt *= Math.max(0.2, 1 - 0.05 * teilStufe("netzteil"));
    return { hash, watt };
  }
  const stromProStunde = () => leistung().watt * d().farm.energie[energieStufe()].preisJeWattStunde;
  // Die Farm schürft nur aus dem noch nicht verteilten Vorrat (21 Mio.): je weniger übrig, desto weniger.
  // Ertrag wächst mit dem Zeitalter (×10 je Zeitalter, wie die Währungen).
  const btcProStunde = () =>
    leistung().hash * d().farm.btcJeHashProStunde * Math.pow(10, api.zeitalterNummer() - 1) * Math.max(0, 1 - api.btcVerteilt() / api.maxBtc());
  const teilKosten = (id) => Math.ceil(d().farm.teilKosten.grund * Math.pow(d().farm.teilKosten.faktor, teilStufe(id)));
  const rechnerPreis = (r) => Math.ceil(r.preis * (1 - Math.min(0.6, api.tech("farmRabatt"))));

  // ---------- BTC-Markt ----------
  function marktSchritt(stunden) {
    const m = mk();
    const c = d().btcMarkt;
    const jetzt = api.jetzt();
    if (m.crashBis && jetzt >= m.crashBis) {
      m.faktor = m.vorCrash * c.erholung;
      m.crashBis = 0;
      api.meldung("Bitcoin hat sich erholt und steht höher als vor dem Crash.");
    }
    m.faktor *= Math.pow(1 + c.wachstumProTag, stunden / 24);
    if (!m.crashBis && Math.random() < 1 - Math.pow(1 - c.crashChanceProStunde, stunden)) {
      const tiefe = c.crashTiefe[0] + Math.random() * (c.crashTiefe[1] - c.crashTiefe[0]);
      m.vorCrash = m.faktor;
      m.faktor *= 1 - tiefe;
      m.crashBis = jetzt + c.crashStunden * 3600000;
      api.meldung("Bitcoin-Crash: −" + Math.round(tiefe * 100) + " %! Gute Zeit zum Nachkaufen.");
    }
  }

  return {
    // Trading
    offeneWerte,
    preis,
    gewinn,
    verlauf: (id) => (tr().kurse[id] ? tr().kurse[id].verlauf : []),
    positionen: () => tr().positionen,
    eroeffnen(wert, richtung, einsatz) {
      if (!(einsatz > 0) || !api.bezahlen(einsatz)) return false;
      tr().positionen.push({ wert, richtung, einsatz, einstieg: preis(wert), seit: api.jetzt() });
      return true;
    },
    schliessen(i) {
      const p = tr().positionen[i];
      if (!p) return 0;
      const ergebnis = p.einsatz + gewinn(p);
      tr().positionen.splice(i, 1);
      api.gutschreiben(ergebnis);
      return ergebnis - p.einsatz;
    },
    // Farm
    leistung,
    plaetze,
    anzahlRechner,
    energieStufe,
    energieName: () => d().farm.energie[energieStufe()].name,
    stromProStunde,
    btcProStunde,
    teilStufe,
    teilKosten,
    rechnerPreis,
    rechnerListe: () => d().farm.rechner.map((r) => ({ ...r, offen: api.zeitalterNummer() >= r.ab, anzahl: fa().rechner[r.id] || 0 })),
    teileListe: () => d().farm.teile,
    teilMax: () => d().farm.teilKosten.maxStufe,
    hatFarm: () => anzahlRechner() > 0,
    rechnerKaufen(r) {
      if (api.zeitalterNummer() < r.ab) return "Noch gesperrt.";
      if (anzahlRechner() >= plaetze()) return "Kein Platz mehr. Baue Regale aus.";
      if (!api.bezahlen(rechnerPreis(r))) return "Zu wenig Geld.";
      fa().rechner[r.id] = (fa().rechner[r.id] || 0) + 1;
      return null;
    },
    teilKaufen(id) {
      if (teilStufe(id) >= d().farm.teilKosten.maxStufe) return "Schon auf Höchststufe.";
      if (!api.bezahlen(teilKosten(id))) return "Zu wenig Geld.";
      fa().teile[id] = teilStufe(id) + 1;
      return null;
    },
    // BTC-Markt
    marktFaktor: () => mk().faktor,
    imCrash: () => !!mk().crashBis,
    // Zeit: Kurse, Dividenden, Mining, Strom, Markt
    schritt(jetzt) {
      const nachrichten = [];
      // Trading-Kurse (höchstens 200 Schritte nachholen)
      const tl = tr().letzter || jetzt;
      let schritte = Math.floor((jetzt - tl) / (d().trading.sekundenProSchritt * 1000));
      if (schritte > 0) {
        tr().letzter = tl + schritte * d().trading.sekundenProSchritt * 1000;
        schritte = Math.min(200, schritte);
        for (let i = 0; i < schritte; i++) nachrichten.push(...kursSchritt());
      } else if (!tr().letzter) tr().letzter = jetzt;
      // Dividenden für gehaltene Long-Positionen auf ruhige Werte
      const stundenTr = Math.max(0, (jetzt - (tr().dividendeLetzter || jetzt)) / 3600000);
      tr().dividendeLetzter = jetzt;
      let dividende = 0;
      for (const p of tr().positionen) {
        const w = d().trading.werte.find((x) => x.id === p.wert);
        if (p.richtung === "long" && w && w.art === "ruhig") dividende += p.einsatz * d().trading.dividendeProStunde * stundenTr;
      }
      if (dividende > 0) api.gutschreiben(dividende);
      // Farm (höchstens 8 Std. + Tech nachholen)
      const maxStd = d().farm.offlineStunden + api.tech("offlineMining");
      const stundenFa = Math.min(maxStd, Math.max(0, (jetzt - (fa().letzter || jetzt)) / 3600000));
      fa().letzter = jetzt;
      if (stundenFa > 0 && anzahlRechner() > 0) {
        const strom = stromProStunde() * stundenFa;
        if (api.bezahlen(strom)) api.btcGeben(btcProStunde() * stundenFa);
        else fa().stromFehlt = true;
      }
      // BTC-Markt
      const stundenMk = Math.max(0, (jetzt - (mk().letzter || jetzt)) / 3600000);
      mk().letzter = jetzt;
      if (stundenMk > 0) marktSchritt(stundenMk);
      return nachrichten;
    },
  };
}
