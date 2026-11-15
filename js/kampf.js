// Automatischer Kampf: Gegner der Reihe nach, Boss per Knopf.
// Verlieren kostet nichts: Die Reihe beginnt nur wieder von vorne.

export function kampfSystem(api) {
  let gegner = null;
  let spielerLeben = 0;
  let takt = 0;
  let seitLetztemSieg = 0;

  function stellen(vorlage, istBoss) {
    gegner = {
      boss: istBoss,
      name: vorlage.name[api.seitenName()] || vorlage.name.gut,
      leben: vorlage.leben,
      maxLeben: vorlage.leben,
      schaden: vorlage.schaden,
      beute: vorlage.beute,
      xp: vorlage.xp,
      naechstesZeitalter: vorlage.naechstesZeitalter,
    };
    spielerLeben = api.maxLeben();
  }

  function naechster() {
    const liste = api.gegnerDaten();
    const reihe = liste.reihenfolge;
    const typ = reihe[api.seite().kampf.index % reihe.length];
    stellen(liste.typen[typ], false);
  }

  function sieg() {
    const besiegt = gegner;
    api.gutschreiben(besiegt.beute);
    api.xpGeben(besiegt.xp);
    if (besiegt.boss) {
      api.ereignis("bossSieg", besiegt);
    } else {
      // Geglätteter Ertrag pro Sekunde, wird für die Offline-Berechnung gebraucht.
      const k = api.seite().kampf;
      const jetzt = besiegt.beute / Math.max(1, seitLetztemSieg);
      k.rate = k.rate > 0 ? k.rate * 0.7 + jetzt * 0.3 : jetzt;
      k.index += 1;
    }
    seitLetztemSieg = 0;
    naechster();
  }

  function niederlage() {
    if (gegner.boss) api.ereignis("bossNiederlage", gegner);
    api.seite().kampf.index = 0;
    naechster();
  }

  function runde() {
    gegner.leben -= api.schaden();
    if (gegner.leben <= 0) return sieg();
    spielerLeben -= gegner.schaden;
    if (spielerLeben <= 0) niederlage();
  }

  return {
    schritt(sekunden) {
      if (!gegner) naechster();
      takt += sekunden;
      seitLetztemSieg += sekunden;
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
      if (!boss || (gegner && gegner.boss)) return;
      takt = 0;
      stellen(boss, true);
    },
    neuStarten() {
      takt = 0;
      seitLetztemSieg = 0;
      naechster();
    },
    zustand() {
      if (!gegner) naechster();
      const max = api.maxLeben();
      return { gegner, spielerLeben: Math.min(max, Math.max(0, spielerLeben)), maxLeben: max };
    },
  };
}
