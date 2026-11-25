// Waffen und Ausrüstung (Version 51, Umbau Harry 25.11.2026).
// 12 Plätze: 7 sichtbar (Helm, Rüstung, Handschuhe, Hose, Stiefel, Schwert, Schild), 5 unsichtbar (Gürtel, Amulett,
// Ring rechts, Ring links, Ohrringe). Keine Schmiede mehr: Items gibt es nur als Beute von Gegnern und Bossen.
// 12 Qualitätsstufen, Zeitalter n schaltet Stufe n frei. 3 gleiche Stücke werden zur nächsten Qualität,
// Sterne gibt es nur für Genesis-Stücke in Zeitalter 12.

const WAFFEN_PLAETZE = ["waffe"];
export const RUESTUNG_PLAETZE = ["helm", "ruestung", "handschuhe", "hose", "stiefel", "schild"];
export const SCHMUCK_PLAETZE = ["guertel", "amulett", "ring1", "ring2", "ohrringe"];
export const ALLE_PLAETZE = [...WAFFEN_PLAETZE, ...RUESTUNG_PLAETZE, ...SCHMUCK_PLAETZE];

export function waffenSystem(api) {
  const d = () => api.daten();
  const s = () => api.seite();
  const istWaffe = (art) => WAFFEN_PLAETZE.includes(art);
  const fach = (art) => (istWaffe(art) ? s().waffen : SCHMUCK_PLAETZE.includes(art) ? s().schmuck : s().ruestung);
  const hole = (art) => fach(art)[art] || null;
  const setze = (art, stueck) => {
    fach(art)[art] = stueck;
  };
  const vorlageVon = (stueck) => (stueck ? d().waffen.find((w) => w.id === stueck.id) : null);
  const nur = (x) => ({ id: x.id, seltenheit: x.seltenheit, sterne: x.sterne || 0 });
  const gleich = (a, b) =>
    !!a && !!b && a.id === b.id && a.seltenheit === b.seltenheit && (a.sterne || 0) === (b.sterne || 0);

  // Je höher die Schmiede, desto kleiner der Abstand zwischen den Seltenheiten.
  // Harry 17.11.2026: jedes Zeitalter schaltet eine neue Qualität frei (Zeitalter 1 = nur Gewöhnlich,
  // Zeitalter 2 = bis Ungewöhnlich … Göttlich ab Zeitalter 7). Die Schmiede-Stufe verbessert die Chancen nur darunter.
  const maxSelten = () => Math.min(d().seltenheiten.length - 1, api.zeitalterNummerVon(api.zeitalterId()) - 1);
  // Chancen je Qualität für eine Beute: jede Stufe „ratio“-mal seltener (Vorschlag 3); Bosse fangen höher an.
  function chancen(abStufe = 0) {
    const ratio = Math.max(1.3, d().beute.ratio * (1 - Math.min(0.5, api.seltenBonus ? api.seltenBonus() : 0)));
    const grenze = maxSelten();
    const unten = Math.min(grenze, abStufe);
    const gewichte = d().seltenheiten.map((_, i) => (i >= unten && i <= grenze ? Math.pow(ratio, -(i - unten)) : 0));
    const summe = gewichte.reduce((a, b) => a + b, 0);
    return gewichte.map((g) => g / summe);
  }

  function wuerfeln(abStufe = 0) {
    const c = chancen(abStufe);
    let z = Math.random();
    for (let i = 0; i < c.length; i++) {
      z -= c[i];
      if (z < 0) return i;
    }
    return 0;
  }

  // Ringe haben zwei Plätze: der neue kommt auf den freien oder den schwächeren.
  const istWaffenArt = (art) => art === "nah";
  function zielPlatz(stueck) {
    const art = vorlageVon(stueck).art;
    if (istWaffenArt(art)) return "waffe";
    if (art !== "ring") return art;
    const a = werte(hole("ring1"), "ring1");
    const b = werte(hole("ring2"), "ring2");
    if (!a) return "ring1";
    if (!b) return "ring2";
    return a.staerke <= b.staerke ? "ring1" : "ring2";
  }
  const plaetzeFuer = (stueck) => {
    const art = vorlageVon(stueck).art;
    return art === "ring" ? ["ring1", "ring2"] : [istWaffenArt(art) ? "waffe" : art];
  };

  // Zusatzwerte (Block, Tempo …): fester Betrag je Wert, bessere Qualität = mehr. Kommen mit späteren Zeitaltern dazu.
  function zusatzVon(vorlage, seltenheit) {
    const nr = api.zeitalterNummerVon(vorlage.zeitalter);
    const merkmal = vorlage.art;
    return (d().zusatzWerte || [])
      .filter((z) => nr >= z.abZeitalter && z.plaetze.includes(merkmal))
      .map((z) => ({ id: z.id, name: z.name, text: z.text, wert: z.grund + z.jeSeltenheit * seltenheit }));
  }

  function werte(stueck, platz) {
    if (!stueck) return null;
    const vorlage = vorlageVon(stueck);
    if (!vorlage) return null;
    platz = platz || (vorlage.art === "ring" ? "ring1" : istWaffenArt(vorlage.art) ? "waffe" : vorlage.art);
    const selten = d().seltenheiten[stueck.seltenheit] || d().seltenheiten[0];
    const sterne = stueck.sterne || 0;
    // Harry 16.11.2026: die Seltenheit entscheidet. Alle Stücke wachsen mit dem aktuellen Zeitalter mit,
    // damit ein Göttliches immer stärker ist als ein Legendäres, egal aus welchem Zeitalter.
    const faktor =
      selten.faktor * api.zeitalterStaerke(api.zeitalterId()) * (1 + sterne * d().sternBonus) * api.platzFaktor(platz);
    return {
      id: vorlage.id,
      art: vorlage.art,
      hand: null,
      zusatz: zusatzVon(vorlage, stueck.seltenheit),
      zeitalter: vorlage.zeitalter,
      name: typeof vorlage.name === "string" ? vorlage.name : vorlage.name.gut,
      seltenheit: selten,
      sterne,
      schaden: vorlage.schaden * faktor,
      leben: vorlage.leben * faktor,
      staerke: (vorlage.schaden * 5 + vorlage.leben) * faktor,
    };
  }

  // Kein Fernkampf mehr: jede Waffe passt.
  const passtZumStil = () => true;

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

  // Sterne nur für Genesis-Stücke in Zeitalter 12 (Harry 25.11.2026).
  const sterneOffen = () => !api.sterneOffen || api.sterneOffen();
  function ablegen(stueck) {
    insLager(stueck);
  }

  function anlegen(stueck, platz) {
    const art = platz || zielPlatz(stueck);
    const alt = hole(art);
    setze(art, nur(stueck));
    if (alt) ablegen(alt);
  }

  // Legt ein neues Stück an, wenn es besser ist, sonst ins Lager (oder verkauft es). Gibt zurück, ob es angelegt wurde.
  function einsortieren(stueck) {
    const platz = zielPlatz(stueck);
    const alt = werte(hole(platz), platz);
    // Höhere Seltenheit gewinnt immer; bei gleicher Seltenheit entscheidet die Stärke.
    const altRang = hole(platz) ? hole(platz).seltenheit : -1;
    const hoeher = !alt || stueck.seltenheit > altRang || (stueck.seltenheit === altRang && werte(stueck, platz).staerke > alt.staerke);
    const besser = passtZumStil(stueck) && hoeher;
    if (besser) anlegen(stueck);
    else ablegen(stueck);
    return besser;
  }

  function anzahlGleich(stueck) {
    const vorlage = vorlageVon(stueck);
    if (!vorlage) return 0;
    const eintrag = s().lager.find((x) => gleich(x, stueck));
    return (eintrag ? eintrag.anzahl : 0) + plaetzeFuer(stueck).filter((p) => gleich(hole(p), stueck)).length;
  }

  // Erst geht es die Seltenheiten hinauf; ganz oben kommen (im Endgame) die Sterne.
  const hoechste = () => d().seltenheiten.length - 1;
  const mergbar = (stueck) =>
    anzahlGleich(stueck) >= 3 &&
    // Mergen geht nur bis zur Qualität, die das Zeitalter schon freigeschaltet hat; Sterne erst ganz oben.
    (stueck.seltenheit < maxSelten() || (stueck.seltenheit === hoechste() && sterneOffen() && (stueck.sterne || 0) < d().maxSterne));
  // Ein neues Stück (Beute): zufälliger Platz, Vorlage aus dem jetzigen Zeitalter, Qualität gewürfelt.
  function neuesStueck(abStufe = 0, art = null) {
    const auswahl = d().waffen.filter((w) => w.zeitalter === api.zeitalterId() && (!art || w.art === art));
    if (!auswahl.length) return null;
    const vorlage = auswahl[Math.floor(Math.random() * auswahl.length)];
    return { id: vorlage.id, seltenheit: wuerfeln(abStufe), sterne: 0 };
  }

  return {
    chancen,
    maxSelten,
    werte,
    hole,
    bonus() {
      const waffe = werte(hole("waffe"), "waffe");
      const bonus = {
        schaden: waffe ? waffe.schaden : 0,
        leben: waffe ? waffe.leben : 0,
        kampfArt: "nah", // Harry 18.11./25.11.2026: nur Nahkampf
        hand: waffe ? waffe.hand : null,
        set: 0,
        ruestungTeile: 0,
        lebenProzent: 0,
        zusatz: {},
      };
      const dazu = (x) => {
        for (const z of x.zusatz) bonus.zusatz[z.id] = (bonus.zusatz[z.id] || 0) + z.wert;
      };
      if (waffe) dazu(waffe);
      const jeZeitalter = {};
      for (const art of RUESTUNG_PLAETZE) {
        const r = werte(hole(art), art);
        if (!r) continue;
        dazu(r);
        bonus.schaden += r.schaden;
        bonus.leben += r.leben;
        jeZeitalter[r.zeitalter] = (jeZeitalter[r.zeitalter] || 0) + 1;
      }
      bonus.ruestungTeile = Math.max(0, ...Object.values(jeZeitalter));
      // Schmuck zählt immer; 2 Ringe + Amulett aus einem Zeitalter = Schmuck-Set.
      const schmuck = SCHMUCK_PLAETZE.map((p) => werte(hole(p), p));
      for (const x of schmuck) {
        if (!x) continue;
        dazu(x);
        bonus.schaden += x.schaden;
        bonus.leben += x.leben;
      }
      // Grenzen (Harry 25.11.2026): Endwert bei Level 120, linear mit dem Max-Level des Zeitalters (10 × Zeitalter).
      const anteil = Math.min(120, 10 * api.zeitalterNummerVon(api.zeitalterId())) / 120;
      for (const z of d().zusatzWerte || []) bonus.zusatz[z.id] = Math.min(z.linear ? z.max * anteil : z.max, bonus.zusatz[z.id] || 0);
      const [r1, r2, am] = schmuck;
      bonus.schmuckSet = r1 && r2 && am && r1.zeitalter === r2.zeitalter && r2.zeitalter === am.zeitalter ? d().schmuckSet : 0;
      for (const [teile, prozent] of Object.entries(d().ruestungSet)) {
        if (bonus.ruestungTeile >= Number(teile)) bonus.lebenProzent = Math.max(bonus.lebenProzent, prozent);
      }
      return bonus;
    },
    // Beute eines Gegners: art = "normal", "elite", "anfuehrer" oder "boss". Gibt das Stück zurück (oder null).
    beute(art) {
      const b = d().beute;
      if (Math.random() >= (b.chance[art] || 0) * (api.dropBonus ? 1 + api.dropBonus() : 1)) return null;
      const neu = neuesStueck(art === "boss" ? b.bossQualitaet : 0);
      if (!neu) return null;
      const besser = einsortieren(neu);
      return { neu: werte(neu), besser };
    },
    // Für Dungeon-Belohnungen und Test-Modus: ein Stück ohne Zufall, ob es fällt.
    schmiedenGratis() {
      const neu = neuesStueck();
      if (!neu) return null;
      const besser = einsortieren(neu);
      return { neu: werte(neu), besser };
    },
    // Kein Nackt-Start (Harry 25.11.2026): leere Plätze bekommen ein Primitiv-Stück des jetzigen Zeitalters.
    startAusruestung() {
      let n = 0;
      for (const platz of ALLE_PLAETZE) {
        if (hole(platz) && vorlageVon(hole(platz))) continue;
        const art = platz === "waffe" ? "nah" : platz.startsWith("ring") ? "ring" : platz;
        const vorlage = d().waffen.find((w) => w.zeitalter === api.zeitalterId() && w.art === art) || d().waffen.find((w) => w.art === art);
        if (!vorlage) continue;
        setze(platz, { id: vorlage.id, seltenheit: 0, sterne: 0 });
        n += 1;
      }
      // Stücke, deren Vorlage es nicht mehr gibt (Fernkampf, Zweihänder), fallen aus dem Lager.
      s().lager = s().lager.filter((e) => vorlageVon(e));
      return n;
    },
    lagerListe() {
      return s()
        .lager.map((e) => ({ ...werte(e), anzahl: e.anzahl, roh: nur(e), mergbar: mergbar(e) }))
        .filter((e) => e.id)
        // Nach Qualität (Harry 16.11.2026): Seltenheit, dann Zeitalter, dann Sterne, dann Stärke.
        .sort(
          (a, b) =>
            b.roh.seltenheit - a.roh.seltenheit ||
            api.zeitalterNummerVon(b.zeitalter) - api.zeitalterNummerVon(a.zeitalter) ||
            b.sterne - a.sterne ||
            b.staerke - a.staerke
        );
    },
    anlegenAusLager(stueck) {
      if (ausLager(stueck, 1) === 1) anlegen(stueck);
    },
    // 3 gleiche werden zu 1 Stück mit +1 Stern. Zuerst aus dem Lager, zur Not auch das angelegte.
    mergen(stueck) {
      if (!mergbar(stueck)) return null;
      const angelegt = plaetzeFuer(stueck).filter((p) => gleich(hole(p), stueck));
      let fehlt = 3 - ausLager(stueck, 3);
      const neu = stueck.seltenheit < hoechste() ? { ...nur(stueck), seltenheit: stueck.seltenheit + 1 } : { ...nur(stueck), sterne: (stueck.sterne || 0) + 1 };
      // Fehlende Stücke kommen von den angelegten Plätzen; der erste bekommt das neue Stück.
      for (let i = 1; i < fehlt; i++) setze(angelegt[i], null);
      if (fehlt > 0) setze(angelegt[0], neu);
      else einsortieren(neu);
      return werte(neu);
    },
  };
}
