// Automatischer Kampf in Wellen: Jede Stufe hat mehrere Wellen, jede Welle mehrere Gegner.
// Je höher die Stufe, desto mehr und stärkere Gegner. Boss per Knopf (mit Aufstiegs-Bedingungen).
// Verlieren kostet nichts: Die Stufe beginnt wieder bei Welle 1.
// Ablauf (Harry 16.11.2026): Gegner laufen von rechts heran. Solange keiner nah ist, schießt der Held
// mit der Fernkampf-Waffe, danach schlägt er mit der Nahkampf-Waffe. Jeder Gegner ist entweder
// Nahkämpfer (läuft heran, schlägt) oder Fernkämpfer (bleibt auf Abstand, schießt), nie beides.
// x = Abstand zum Helden: 1 = rechter Rand, 0 = direkt beim Helden.

export function kampfSystem(api) {
  let gegner = []; // aktuelle Welle
  let bossKampf = false;
  let spielerLeben = 0;
  let takt = 0;
  let seitWelle = 0;
  let beuteWelle = 0;
  let traenkeDabei = 0;
  // Boss-Fähigkeiten (lösen automatisch aus, im Kampf als Hinweis sichtbar) und Tier-Angriff.
  let bossUhren = {};
  let bossWutBis = 0;
  let bossSchildBis = 0;
  let aussetzen = 0;
  let kampfZeit = 0;
  let tierUhr = 0;
  let spielerUhr = 0;
  let effekte = []; // nur für die Anzeige: Schüsse und Schläge seit dem letzten Zeichnen

  const k = () => api.seite().kampf;
  const w = () => api.wellen();

  function machGegner(vorlage, typ, faktor, beuteFaktor, boss, art, x, halt) {
    return {
      boss,
      typ,
      art, // "nah" oder "fern"
      x,
      halt, // hier bleibt der Gegner stehen und greift an
      uhr: 0,
      name: vorlage.name[api.seitenName()] || vorlage.name.gut,
      leben: vorlage.leben * faktor,
      maxLeben: vorlage.leben * faktor,
      schaden: vorlage.schaden * faktor,
      beute: vorlage.beute * beuteFaktor,
      xp: vorlage.xp * beuteFaktor,
      naechstesZeitalter: vorlage.naechstesZeitalter,
      endboss: !!vorlage.endboss,
      faehigkeiten: vorlage.faehigkeiten || [],
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
    const l = api.lauf();
    let nahe = 0;
    let ferne = 0;
    for (let i = 0; i < n; i++) {
      let typ = s < 3 ? "schwach" : i % 2 ? "normal" : "schwach";
      if (nr === c.proStufe && i === n - 1) typ = s % c.eliteAlleStufen === 0 ? "elite" : "normal";
      // Jeder dritte Gegner ist ein Fernkämpfer; Elite kämpft immer nah.
      const art = typ !== "elite" && i % 3 === 2 ? "fern" : "nah";
      const halt = art === "fern" ? l.fernHalt + l.fernAbstand * ferne++ : l.nahHalt + l.nahAbstand * nahe++;
      gegner.push(machGegner(d.typen[typ], typ, faktor, beuteFaktor, false, art, 1 + l.startAbstand * i, halt));
    }
    spielerUhr = 0;
    effekte = [];
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

  const naechster = () => lebende().reduce((a, g) => (!a || g.x < a.x ? g : a), null);

  function treffen(menge, wie) {
    const ziel = naechster();
    if (!ziel) return;
    ziel.leben -= menge;
    if (wie && effekte.length < 30) effekte.push({ art: wie, i: gegner.indexOf(ziel) });
    if (ziel.leben <= 0) besiegt(ziel);
  }

  function bossZug(dt) {
    const boss = gegner[0];
    for (const f of boss.faehigkeiten) {
      bossUhren[f.id] = (bossUhren[f.id] || 0) + dt;
      if (bossUhren[f.id] < f.alle) continue;
      bossUhren[f.id] = 0;
      if (f.art === "heilen") boss.leben = Math.min(boss.maxLeben, boss.leben + boss.maxLeben * f.wert);
      else if (f.art === "wut") bossWutBis = kampfZeit + f.dauer;
      else if (f.art === "schild") bossSchildBis = kampfZeit + f.dauer;
      else if (f.art === "betaeuben") aussetzen = f.dauer;
      api.hinweis(f.text);
    }
  }

  // Ein kleiner Zeitschritt. Gibt true zurück, wenn die Welle gewechselt hat.
  function zeitschritt(dt) {
    const schlag = api.schlagZeit();
    const l = api.lauf();
    kampfZeit += dt;
    for (const g of lebende()) if (g.x > g.halt) g.x = Math.max(g.halt, g.x - l.tempo * dt);
    if (bossKampf && gegner[0] && gegner[0].leben > 0) bossZug(dt);
    const schild = () => (kampfZeit < bossSchildBis ? 0.5 : 1);
    // Kämpfer-Tier greift alle paar Sekunden selbst an (mehr Sterne = mehr Schaden).
    const tier = api.tierAngriff();
    if (tier) {
      tierUhr += dt;
      if (tierUhr >= tier.alle) {
        tierUhr = 0;
        treffen(tier.schaden * schild(), "tier");
      }
    }
    const fae = api.faehigkeiten();
    fae.schritt(dt, {
      treffen: (m) => treffen(m, "zauber"),
      heilen: (anteil) => {
        const max = api.maxLeben();
        spielerLeben = Math.min(max, spielerLeben + max * anteil);
      },
    });
    if (!lebende().length) return welleGeschafft(), true;
    // Held: Reittiere machen ihn schneller. Fernkampf, solange kein Gegner nah ist, sonst Nahkampf.
    const abstand = schlag / (1 + api.tempo());
    spielerUhr += dt;
    if (spielerUhr >= abstand) {
      spielerUhr -= abstand;
      if (aussetzen > 0) aussetzen -= 1;
      else {
        const art = naechster().x <= l.nahWeite ? "nah" : "fern";
        treffen(api.schaden(art) * fae.schadenFaktor() * schild(), art === "nah" ? "schlag" : "schuss");
      }
    }
    if (!lebende().length) return welleGeschafft(), true;
    const wut = kampfZeit < bossWutBis ? 1 + (gegner[0].faehigkeiten.find((f) => f.art === "wut") || { wert: 0 }).wert : 1;
    for (const g of lebende()) {
      if (g.x > g.halt + 1e-6) continue; // noch unterwegs
      g.uhr += dt;
      if (g.uhr < schlag) continue;
      g.uhr -= schlag;
      spielerLeben -= g.schaden * fae.schutzFaktor() * (g.boss ? wut : 1);
      if (effekte.length < 30) effekte.push({ art: g.art === "fern" ? "gegnerSchuss" : "gegnerSchlag", i: gegner.indexOf(g) });
    }
    if (spielerLeben <= 0) return niederlage(), true;
    // Heiltrank: nur im Boss-Kampf, automatisch unter der Schwelle.
    const regel = api.trank();
    const max = api.maxLeben();
    if (bossKampf && traenkeDabei > 0 && spielerLeben < max * regel.schwelle) {
      spielerLeben = Math.min(max, spielerLeben + max * regel.heilung);
      traenkeDabei -= 1;
      api.seite().traenke = Math.max(0, api.seite().traenke - 1);
    }
    return false;
  }

  return {
    schritt(sekunden) {
      if (!gegner.length) welleStellen("voll");
      seitWelle += sekunden;
      let rest = Math.min(sekunden, 20 * api.schlagZeit()); // nie mehr als 20 Schläge auf einmal nachholen
      while (rest > 1e-9) {
        const dt = Math.min(0.1, rest);
        rest -= dt;
        zeitschritt(dt);
      }
    },
    bossStarten() {
      const boss = api.gegnerDaten().boss;
      if (!boss || bossKampf) return;
      takt = 0;
      traenkeDabei = Math.min(api.seite().traenke, api.trank().bossMax);
      gegner = [machGegner(boss, "boss", 1, 1, true, "nah", 1, api.lauf().bossHalt)];
      spielerUhr = 0;
      effekte = [];
      bossKampf = true;
      bossUhren = {};
      bossWutBis = 0;
      bossSchildBis = 0;
      aussetzen = 0;
      kampfZeit = 0;
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
        effekte: effekte.splice(0),
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
