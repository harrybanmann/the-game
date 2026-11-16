// Automatischer Kampf in Wellen: Jede Stufe hat mehrere Wellen, jede Welle mehrere Gegner.
// Je höher die Stufe, desto mehr und stärkere Gegner. Boss per Knopf (mit Aufstiegs-Bedingungen).
// Verlieren kostet nichts: Die Stufe beginnt wieder bei Welle 1.

export function kampfSystem(api) {
  let gegner = []; // aktuelle Welle
  let bossKampf = false;
  let spielerLeben = 0;
  let takt = 0;
  let seitWelle = 0;
  let beuteWelle = 0;
  let traenkeDabei = 0;

  const k = () => api.seite().kampf;
  const w = () => api.wellen();

  function machGegner(vorlage, typ, faktor, beuteFaktor, boss) {
    return {
      boss,
      typ,
      name: vorlage.name[api.seitenName()] || vorlage.name.gut,
      leben: vorlage.leben * faktor,
      maxLeben: vorlage.leben * faktor,
      schaden: vorlage.schaden * faktor,
      beute: vorlage.beute * beuteFaktor,
      xp: vorlage.xp * beuteFaktor,
      naechstesZeitalter: vorlage.naechstesZeitalter,
    };
  }

  function anzahl(stufe, welle) {
    const c = w();
    return Math.min(c.maxGegner, c.startGegner + Math.floor((stufe - 1) / c.mehrAlleStufen) + Math.floor((welle - 1) / 2));
  }

  function welleStellen(heilen) {
    const d = api.gegnerDaten();
    const c = w();
    const s = k().stufe;
    const nr = k().welle;
    const n = anzahl(s, nr);
    const faktor = Math.pow(c.staerkeFaktor, s - 1);
    const beuteFaktor = Math.pow(c.beuteFaktor, s - 1);
    gegner = [];
    for (let i = 0; i < n; i++) {
      let typ = s < 3 ? "schwach" : i % 2 ? "normal" : "schwach";
      if (nr === c.proStufe && i === n - 1) typ = s % c.eliteAlleStufen === 0 ? "elite" : "normal";
      gegner.push(machGegner(d.typen[typ], typ, faktor, beuteFaktor, false));
    }
    bossKampf = false;
    const max = api.maxLeben();
    if (heilen === "voll") spielerLeben = max;
    else spielerLeben = Math.min(max, spielerLeben + max * c.heilungZwischen);
    seitWelle = 0;
    beuteWelle = 0;
    api.faehigkeiten().kampfStart();
  }

  const lebende = () => gegner.filter((g) => g.leben > 0);

  function besiegt(g) {
    api.gutschreiben(g.beute);
    api.xpGeben(g.xp);
    beuteWelle += g.beute;
    api.ereignis("sieg", g);
  }

  function welleGeschafft() {
    if (bossKampf) {
      const boss = gegner[0];
      bossKampf = false;
      api.ereignis("bossSieg", boss);
      welleStellen("voll");
      return;
    }
    // Geglätteter Ertrag pro Sekunde, wird für die Offline-Berechnung gebraucht.
    const jetzt = beuteWelle / Math.max(1, seitWelle);
    k().rate = k().rate > 0 ? k().rate * 0.7 + jetzt * 0.3 : jetzt;
    k().welle += 1;
    if (k().welle > w().proStufe) {
      k().welle = 1;
      k().stufe += 1;
      welleStellen("voll");
    } else {
      welleStellen("teil");
    }
  }

  function niederlage() {
    if (bossKampf) api.ereignis("bossNiederlage", gegner[0]);
    k().welle = 1;
    welleStellen("voll");
  }

  function treffen(menge) {
    const ziel = lebende()[0];
    if (!ziel) return;
    ziel.leben -= menge;
    if (ziel.leben <= 0) besiegt(ziel);
  }

  function runde() {
    const fae = api.faehigkeiten();
    fae.schritt(api.schlagZeit(), {
      treffen,
      heilen: (anteil) => {
        const max = api.maxLeben();
        spielerLeben = Math.min(max, spielerLeben + max * anteil);
      },
    });
    if (!lebende().length) return welleGeschafft();
    treffen(api.schaden() * fae.schadenFaktor());
    if (!lebende().length) return welleGeschafft();
    for (const g of lebende()) spielerLeben -= g.schaden * fae.schutzFaktor();
    if (spielerLeben <= 0) return niederlage();
    // Heiltrank: nur im Boss-Kampf, automatisch unter der Schwelle.
    const regel = api.trank();
    const max = api.maxLeben();
    if (bossKampf && traenkeDabei > 0 && spielerLeben < max * regel.schwelle) {
      spielerLeben = Math.min(max, spielerLeben + max * regel.heilung);
      traenkeDabei -= 1;
      api.seite().traenke = Math.max(0, api.seite().traenke - 1);
    }
  }

  return {
    schritt(sekunden) {
      if (!gegner.length) welleStellen("voll");
      takt += sekunden;
      seitWelle += sekunden;
      const schlag = api.schlagZeit();
      let grenze = 20; // nie mehr als 20 Schläge auf einmal nachholen
      while (takt >= schlag && grenze-- > 0) {
        takt -= schlag;
        runde();
      }
      if (takt >= schlag) takt = 0;
    },
    bossStarten() {
      const boss = api.gegnerDaten().boss;
      if (!boss || bossKampf) return;
      takt = 0;
      traenkeDabei = Math.min(api.seite().traenke, api.trank().bossMax);
      gegner = [machGegner(boss, "boss", 1, 1, true)];
      bossKampf = true;
      spielerLeben = api.maxLeben();
      seitWelle = 0;
      beuteWelle = 0;
      api.faehigkeiten().kampfStart();
    },
    neuStarten() {
      takt = 0;
      welleStellen("voll");
    },
    zustand() {
      if (!gegner.length) welleStellen("voll");
      const max = api.maxLeben();
      return {
        gegner,
        boss: bossKampf,
        stufe: k().stufe,
        welle: k().welle,
        wellenProStufe: w().proStufe,
        spielerLeben: Math.min(max, Math.max(0, spielerLeben)),
        maxLeben: max,
        traenkeDabei: bossKampf ? traenkeDabei : null,
      };
    },
  };
}
