// Schmiede und Waffen: Seltenheit wird gewürfelt, eine bessere Waffe ersetzt die alte.
// Zwei Plätze (Nahkampf, Fernkampf); die gewählte Waffe schlägt zu.

export function waffenSystem(api) {
  const d = () => api.daten();
  const s = () => api.seite();

  // Je höher die Schmiede, desto kleiner der Abstand zwischen den Seltenheiten.
  function chancen() {
    const sch = d().schmiede;
    const anteil = Math.min(1, s().schmiede.stufe / sch.maxStufe);
    const ratio = sch.ratioStart + (sch.ratioEnde - sch.ratioStart) * anteil;
    const gewichte = d().seltenheiten.map((_, i) => Math.pow(ratio, -i));
    const summe = gewichte.reduce((a, b) => a + b, 0);
    return gewichte.map((g) => g / summe);
  }

  function wuerfeln() {
    const c = chancen();
    let z = Math.random();
    for (let i = 0; i < c.length; i++) {
      z -= c[i];
      if (z < 0) return i;
    }
    return 0;
  }

  function werte(waffe) {
    if (!waffe) return null;
    const vorlage = d().waffen.find((w) => w.id === waffe.id);
    if (!vorlage) return null;
    const selten = d().seltenheiten[waffe.seltenheit] || d().seltenheiten[0];
    const faktor = selten.faktor * api.zeitalterStaerke(vorlage.zeitalter);
    return {
      id: vorlage.id,
      art: vorlage.art,
      zeitalter: vorlage.zeitalter,
      name: vorlage.name[api.seitenName()] || vorlage.name.gut,
      seltenheit: selten,
      schaden: vorlage.schaden * faktor,
      leben: vorlage.leben * faktor,
      staerke: (vorlage.schaden * 5 + vorlage.leben) * faktor,
    };
  }

  function aktiveArt() {
    const w = s().waffen;
    if (w[w.aktiv]) return w.aktiv;
    if (w.nah) return "nah";
    if (w.fern) return "fern";
    return w.aktiv;
  }

  const schmiedeKosten = () => d().schmiede.kosten;
  const stufeVoll = () => s().schmiede.stufe >= d().schmiede.maxStufe;
  const stufeKosten = () => Math.ceil(d().schmiede.stufenKosten * Math.pow(d().schmiede.stufenFaktor, s().schmiede.stufe));

  return {
    chancen,
    werte,
    aktiveArt,
    schmiedeKosten,
    stufeVoll,
    stufeKosten,
    bonus() {
      const w = s().waffen;
      const aktiv = werte(w[aktiveArt()]);
      const nah = werte(w.nah);
      const fern = werte(w.fern);
      const set = nah && fern && nah.zeitalter === fern.zeitalter;
      return {
        schaden: aktiv ? aktiv.schaden : 0,
        leben: aktiv ? aktiv.leben : 0,
        set: set ? d().setBonusSchaden : 0,
      };
    },
    aktivSetzen(art) {
      if (s().waffen[art]) s().waffen.aktiv = art;
    },
    schmieden() {
      const auswahl = d().waffen.filter((w) => w.zeitalter === api.zeitalterId());
      if (!auswahl.length || !api.bezahlen(schmiedeKosten())) return null;
      const vorlage = auswahl[Math.floor(Math.random() * auswahl.length)];
      const neu = { id: vorlage.id, seltenheit: wuerfeln() };
      const alt = werte(s().waffen[vorlage.art]);
      const besser = !alt || werte(neu).staerke > alt.staerke;
      if (besser) s().waffen[vorlage.art] = neu;
      s().schmiede.geschmiedet += 1;
      return { neu: werte(neu), besser };
    },
    stufeKaufen() {
      if (stufeVoll() || !api.bezahlen(stufeKosten())) return false;
      s().schmiede.stufe += 1;
      return true;
    },
  };
}
