// Haushalt und Firma: läuft von selbst. Job bringt Gehalt, Rechnungen werden automatisch abgebucht.
// Fehlt Geld, entstehen Schulden: sie bremsen die Einnahmen (höchstens 30 %), nichts geht verloren,
// und neue Einnahmen zahlen sie automatisch ab. Erspartes bringt Zinsen in Stufen.

export function haushaltSystem(api) {
  const d = () => api.daten();
  const h = () => api.seite().haushalt;
  const job = () => d().jobs[api.zeitalterId()] || Object.values(d().jobs)[0];

  function bremse() {
    if (!(h().schulden > 0)) return 0;
    const max = Math.max(0, d().maxBremse - api.tech("schuldenBremse"));
    const tagesRechnung = job().rechnungProStunde * 24;
    return Math.min(max, 0.1 + (h().schulden / tagesRechnung) * 0.2);
  }

  const offen = (name) => !api.offen || api.offen(name);

  function zinsProTag() {
    if (!offen("bank")) return 0; // Zinsen gibt es erst mit der Bank
    let z = 0;
    for (const s of d().zinsStufen) if (api.guthaben() >= s.ab) z = s.proTag;
    return z > 0 ? z + api.tech("sparzins") : 0;
  }

  const firmaEinkommenProMinute = () => h().firma * d().firma.einkommenJeStufeProMinute * (1 + api.tech("gehalt"));
  const gehaltProMinute = () => job().gehaltProMinute * (1 + api.tech("gehalt"));
  const rechnungProStunde = () => job().rechnungProStunde * (1 - Math.min(0.6, api.tech("rechnungen")));
  const firmaKosten = () =>
    h().firma === 0 ? d().firma.gruenden : Math.ceil(d().firma.ausbauGrund * Math.pow(d().firma.ausbauFaktor, h().firma));

  return {
    job,
    bremse,
    zinsProTag,
    gehaltProMinute,
    rechnungProStunde,
    firmaEinkommenProMinute,
    firmaKosten,
    firmaVoll: () => h().firma >= d().firma.maxStufe,
    aussehenListe: () => d().aussehen,
    aussehenPreis: (a) => Math.ceil(a.preis * (1 - Math.min(0.6, api.tech("aussehen")))),
    // Einnahmen: Schulden zuerst (teilweise) abzahlen, dann Bremse anwenden.
    einnahme(menge) {
      if (!(menge > 0)) return 0;
      let rest = menge * (1 - bremse());
      if (h().schulden > 0) {
        const tilgung = Math.min(h().schulden, rest * d().tilgungAnteil);
        h().schulden -= tilgung;
        rest -= tilgung;
      }
      return rest;
    },
    // Läuft nach echter Zeit (auch offline, bis zur Offline-Grenze).
    schritt(jetzt, maxSekunden) {
      const vorher = h().letzter || jetzt;
      const sek = Math.min(maxSekunden, Math.max(0, (jetzt - vorher) / 1000));
      h().letzter = jetzt;
      if (sek <= 0) return;
      const minuten = sek / 60;
      const zins = api.guthaben() * zinsProTag() * (sek / 86400);
      api.gutschreiben((gehaltProMinute() + firmaEinkommenProMinute()) * minuten + zins);
      const rechnung = rechnungProStunde() * (sek / 3600);
      if (api.guthaben() >= rechnung) api.bezahlen(rechnung);
      else {
        // Schulden gibt es erst mit der Bank. Vorher zahlt man nur, was da ist.
        if (offen("bank")) h().schulden += rechnung - api.guthaben();
        api.bezahlen(api.guthaben());
      }
    },
    firmaAusbauen() {
      if (!offen("firma") || h().firma >= d().firma.maxStufe || !api.bezahlen(firmaKosten())) return false;
      h().firma += 1;
      return true;
    },
    aussehenKaufen(a) {
      const besitz = api.aussehen().besitz;
      if (!besitz.includes(a.id)) {
        if (!api.bezahlen(this.aussehenPreis(a))) return false;
        besitz.push(a.id);
      }
      api.aussehen().aktiv = a.id;
      return true;
    },
  };
}
