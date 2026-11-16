// Schmiede, Waffen und Rüstung.
// Seltenheit wird gewürfelt, ein besseres Stück wird angelegt, der Rest kommt ins Lager.
// 3 gleiche Stücke (gleiche Sorte, Seltenheit, Sternzahl) werden zu 1 Stück mit +1 Stern.

const WAFFEN_PLAETZE = ["nah", "fern"];
export const RUESTUNG_PLAETZE = ["helm", "handschuhe", "ruestung", "stiefel"];
const SCHMUCK_PLAETZE = ["ring1", "ring2", "amulett", "guertel"];

export function waffenSystem(api) {
  const d = () => api.daten();
  const s = () => api.seite();
  const istWaffe = (art) => WAFFEN_PLAETZE.includes(art);
  const fach = (art) => (istWaffe(art) ? s().waffen : SCHMUCK_PLAETZE.includes(art) ? s().schmuck : s().ruestung);
  const hole = (art) => fach(art)[art] || null;
  const setze = (art, stueck) => {
    fach(art)[art] = stueck;
  };
  const vorlageVon = (stueck) => d().waffen.find((w) => w.id === stueck.id);
  const nur = (x) => ({ id: x.id, seltenheit: x.seltenheit, sterne: x.sterne || 0 });
  const gleich = (a, b) =>
    !!a && !!b && a.id === b.id && a.seltenheit === b.seltenheit && (a.sterne || 0) === (b.sterne || 0);

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

  // Ringe haben zwei Plätze: der neue kommt auf den freien oder den schwächeren.
  function zielPlatz(stueck) {
    const art = vorlageVon(stueck).art;
    if (art !== "ring") return art;
    const a = werte(hole("ring1"), "ring1");
    const b = werte(hole("ring2"), "ring2");
    if (!a) return "ring1";
    if (!b) return "ring2";
    return a.staerke <= b.staerke ? "ring1" : "ring2";
  }
  const plaetzeFuer = (stueck) => (vorlageVon(stueck).art === "ring" ? ["ring1", "ring2"] : [vorlageVon(stueck).art]);

  function werte(stueck, platz) {
    if (!stueck) return null;
    const vorlage = vorlageVon(stueck);
    if (!vorlage) return null;
    platz = platz || (vorlage.art === "ring" ? "ring1" : vorlage.art);
    const selten = d().seltenheiten[stueck.seltenheit] || d().seltenheiten[0];
    const sterne = stueck.sterne || 0;
    const faktor =
      selten.faktor * api.zeitalterStaerke(vorlage.zeitalter) * (1 + sterne * d().sternBonus) * api.platzFaktor(platz);
    return {
      id: vorlage.id,
      art: vorlage.art,
      zeitalter: vorlage.zeitalter,
      name: vorlage.name[api.seitenName()] || vorlage.name.gut,
      seltenheit: selten,
      sterne,
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

  function insLager(stueck) {
    const eintrag = s().lager.find((x) => gleich(x, stueck));
    if (eintrag) eintrag.anzahl += 1;
    else s().lager.push({ ...nur(stueck), anzahl: 1 });
  }

  function ausLager(stueck, menge) {
    const eintrag = s().lager.find((x) => gleich(x, stueck));
    if (!eintrag) return 0;
    const genommen = Math.min(menge, eintrag.anzahl);
    eintrag.anzahl -= genommen;
    if (eintrag.anzahl <= 0) s().lager = s().lager.filter((x) => x !== eintrag);
    return genommen;
  }

  function anlegen(stueck, platz) {
    const art = platz || zielPlatz(stueck);
    const alt = hole(art);
    setze(art, nur(stueck));
    if (alt) insLager(alt);
  }

  // Legt ein neues Stück an, wenn es besser ist, sonst ins Lager. Gibt zurück, ob es angelegt wurde.
  function einsortieren(stueck) {
    const platz = zielPlatz(stueck);
    const alt = werte(hole(platz), platz);
    const besser = !alt || werte(stueck, platz).staerke > alt.staerke;
    if (besser) anlegen(stueck);
    else insLager(stueck);
    return besser;
  }

  function anzahlGleich(stueck) {
    const vorlage = vorlageVon(stueck);
    if (!vorlage) return 0;
    const eintrag = s().lager.find((x) => gleich(x, stueck));
    return (eintrag ? eintrag.anzahl : 0) + plaetzeFuer(stueck).filter((p) => gleich(hole(p), stueck)).length;
  }

  const mergbar = (stueck) => (stueck.sterne || 0) < d().maxSterne && anzahlGleich(stueck) >= 3;
  const schmiedeKosten = () => d().schmiede.kosten;
  const stufeVoll = () => s().schmiede.stufe >= d().schmiede.maxStufe;
  const stufeKosten = () => Math.ceil(d().schmiede.stufenKosten * Math.pow(d().schmiede.stufenFaktor, s().schmiede.stufe));
  const stufeDauer = () => Math.round(d().schmiede.dauerGrund * Math.pow(d().schmiede.dauerFaktor, s().schmiede.stufe));

  return {
    chancen,
    werte,
    hole,
    aktiveArt,
    schmiedeKosten,
    stufeVoll,
    stufeKosten,
    bonus() {
      const aktiv = werte(hole(aktiveArt()), aktiveArt());
      const nah = werte(hole("nah"), "nah");
      const fern = werte(hole("fern"), "fern");
      const bonus = {
        schaden: aktiv ? aktiv.schaden : 0,
        leben: aktiv ? aktiv.leben : 0,
        set: nah && fern && nah.zeitalter === fern.zeitalter ? d().setBonusSchaden : 0,
        ruestungTeile: 0,
        lebenProzent: 0,
      };
      const jeZeitalter = {};
      for (const art of RUESTUNG_PLAETZE) {
        const r = werte(hole(art), art);
        if (!r) continue;
        bonus.schaden += r.schaden;
        bonus.leben += r.leben;
        jeZeitalter[r.zeitalter] = (jeZeitalter[r.zeitalter] || 0) + 1;
      }
      bonus.ruestungTeile = Math.max(0, ...Object.values(jeZeitalter));
      // Schmuck zählt immer; 2 Ringe + Amulett aus einem Zeitalter = Schmuck-Set.
      const schmuck = SCHMUCK_PLAETZE.map((p) => werte(hole(p), p));
      for (const x of schmuck) {
        if (!x) continue;
        bonus.schaden += x.schaden;
        bonus.leben += x.leben;
      }
      const [r1, r2, am] = schmuck;
      bonus.schmuckSet = r1 && r2 && am && r1.zeitalter === r2.zeitalter && r2.zeitalter === am.zeitalter ? d().schmuckSet : 0;
      for (const [teile, prozent] of Object.entries(d().ruestungSet)) {
        if (bonus.ruestungTeile >= Number(teile)) bonus.lebenProzent = Math.max(bonus.lebenProzent, prozent);
      }
      return bonus;
    },
    aktivSetzen(art) {
      if (s().waffen[art]) s().waffen.aktiv = art;
    },
    schmieden() {
      const auswahl = d().waffen.filter((w) => w.zeitalter === api.zeitalterId());
      if (!auswahl.length || !api.bezahlen(schmiedeKosten())) return null;
      const vorlage = auswahl[Math.floor(Math.random() * auswahl.length)];
      const neu = { id: vorlage.id, seltenheit: wuerfeln(), sterne: 0 };
      const besser = einsortieren(neu);
      s().schmiede.geschmiedet += 1;
      return { neu: werte(neu), besser };
    },
    // Für Dungeon-Belohnungen: wie Schmieden, aber ohne Kosten.
    schmiedenGratis() {
      const auswahl = d().waffen.filter((w) => w.zeitalter === api.zeitalterId());
      if (!auswahl.length) return null;
      const vorlage = auswahl[Math.floor(Math.random() * auswahl.length)];
      const neu = { id: vorlage.id, seltenheit: wuerfeln(), sterne: 0 };
      const besser = einsortieren(neu);
      return { neu: werte(neu), besser };
    },
    stufeDauer,
    ausbauRest(jetzt) {
      const bis = s().schmiede.ausbauBis;
      return bis ? Math.max(0, (bis - jetzt) / 1000) : null;
    },
    // Ausbau starten: kostet sofort, fertig nach der Wartezeit (läuft auch offline weiter).
    stufeKaufen() {
      if (s().schmiede.ausbauBis || stufeVoll() || !api.bezahlen(stufeKosten())) return false;
      s().schmiede.ausbauBis = Date.now() + stufeDauer() * 1000;
      return true;
    },
    // Gibt true zurück, wenn ein Ausbau gerade fertig geworden ist.
    schritt(jetzt) {
      const bis = s().schmiede.ausbauBis;
      if (!bis || jetzt < bis) return false;
      s().schmiede.ausbauBis = null;
      s().schmiede.stufe += 1;
      return true;
    },
    lagerListe() {
      return s()
        .lager.map((e) => ({ ...werte(e), anzahl: e.anzahl, roh: nur(e), mergbar: mergbar(e) }))
        .filter((e) => e.id)
        .sort((a, b) => b.staerke - a.staerke);
    },
    anlegenAusLager(stueck) {
      if (ausLager(stueck, 1) === 1) anlegen(stueck);
    },
    // 3 gleiche werden zu 1 Stück mit +1 Stern. Zuerst aus dem Lager, zur Not auch das angelegte.
    mergen(stueck) {
      if (!mergbar(stueck)) return null;
      const angelegt = plaetzeFuer(stueck).filter((p) => gleich(hole(p), stueck));
      let fehlt = 3 - ausLager(stueck, 3);
      const neu = { ...nur(stueck), sterne: (stueck.sterne || 0) + 1 };
      // Fehlende Stücke kommen von den angelegten Plätzen; der erste bekommt das neue Stück.
      for (let i = 1; i < fehlt; i++) setze(angelegt[i], null);
      if (fehlt > 0) setze(angelegt[0], neu);
      else einsortieren(neu);
      return werte(neu);
    },
  };
}
