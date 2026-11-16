// Bitcoin: mit der Zeitalter-Währung BTC kaufen, bei Händlern dauerhafte Upgrades je Platz (bis 100 Stufen).
// Bezahltes BTC landet in der Händler-Kasse und fließt langsam zurück (Händler kaufen Güter ab).
// Es gibt höchstens 21 Mio. BTC: Spieler + Händler-Kasse dürfen das nie übersteigen.

export function bitcoinSystem(api) {
  const d = () => api.daten();
  const b = () => api.seite().btc;

  const stufe = (platz) => b().upgrades[platz] || 0;
  const preis = (platz) => d().upgrade.grundPreis * Math.pow(d().upgrade.faktor, stufe(platz));
  const verteilt = () => b().menge + b().kasse;
  // Bitcoin kommt erst im letzten Zeitalter (Harry 16.11.2026). Bis dahin zahlt man mit der Währung des Zeitalters.
  const btcOffen = () => !api.btcOffen || api.btcOffen();
  const preisGeld = (platz) => Math.ceil(preis(platz) / api.kurs());

  return {
    stufe,
    preis,
    preisGeld,
    kannKaufen: (platz) => stufe(platz) < d().upgrade.maxStufe && (btcOffen() ? b().menge >= preis(platz) : api.guthaben() >= preisGeld(platz)),
    voll: (platz) => stufe(platz) >= d().upgrade.maxStufe,
    faktor: (platz) => 1 + stufe(platz) * d().upgrade.bonusProStufe,
    haendler() {
      return d().haendler.map((h) => ({
        ...h,
        name: h.name[api.seitenName()] || h.name.gut,
        offen: api.zeitalterNummer() >= h.ab,
      }));
    },
    // Kauft für einen Anteil des Guthabens BTC zum Kurs des Zeitalters.
    kaufen(anteil) {
      const kurs = api.kurs();
      const rest = Math.max(0, d().maxBtc - verteilt());
      const menge = Math.min(api.guthaben() * anteil, rest / kurs);
      if (!(menge > 0)) return 0;
      if (!api.bezahlen(menge)) return 0;
      b().menge += menge * kurs;
      return menge * kurs;
    },
    upgradeKaufen(platz) {
      if (stufe(platz) >= d().upgrade.maxStufe) return false;
      if (!btcOffen()) {
        if (!api.bezahlen(preisGeld(platz))) return false;
        b().upgrades[platz] = stufe(platz) + 1;
        return true;
      }
      const p = preis(platz);
      if (b().menge < p) return false;
      b().menge -= p;
      b().kasse += p;
      b().upgrades[platz] = stufe(platz) + 1;
      return true;
    },
    // Rückfluss aus der Händler-Kasse, läuft auch offline (nach echter Zeit).
    schritt(jetzt) {
      const vorher = b().letzterRueckfluss || jetzt;
      const stunden = Math.max(0, (jetzt - vorher) / 3600000);
      b().letzterRueckfluss = jetzt;
      if (!(b().kasse > 0) || stunden <= 0) return 0;
      const anteil = 1 - Math.pow(1 - d().rueckfluss.anteilProStunde, stunden);
      const zurueck = b().kasse * anteil;
      b().kasse -= zurueck;
      b().menge += zurueck;
      return zurueck;
    },
  };
}
