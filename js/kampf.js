// Automatischer Kampf: Jede Stufe hat 10 Ebenen (intern „Welle“), Ebene n hat n Gegner (Harry 16.11.2026).
// Je höher die Stufe, desto stärkere Gegner. Boss per Knopf (mit Aufstiegs-Bedingungen).
// Verlieren kostet nichts, aber die Stufe beginnt wieder bei Ebene 1.
// Ablauf (Harry 16.11.2026): Gegner laufen von rechts heran. Der Held trägt EINE Waffe:
// Nahkämpfer laufen den Gegnern entgegen und schlagen zu, Fernkämpfer bleiben stehen und schießen.
// Jeder Gegner ist entweder Nahkämpfer (läuft heran, schlägt) oder Fernkämpfer (bleibt auf Abstand, schießt), nie beides.
// x = Ort auf dem Weg: 0 = Startplatz des Helden, 1 = rechter Rand. heldX = wo der Held gerade steht.

export function kampfSystem(api) {
  let gegner = []; // aktuelle Welle
  let bossKampf = false;
  let spielerLeben = 0;
  let takt = 0;
  let seitWelle = 0;
  let beuteWelle = 0;
  let siegeWelle = { schwach: 0, normal: 0, elite: 0, xp: 0 }; // für die Offline-Beute
  let traenkeDabei = 0;
  // Boss-Fähigkeiten (lösen automatisch aus, im Kampf als Hinweis sichtbar) und Tier-Angriff.
  let bossUhren = {};
  let bossWutBis = 0;
  let bossSchildBis = 0;
  let bossPhase = 1;
  let aussetzen = 0;
  let kampfZeit = 0;
  let tierUhr = 0;
  let spielerUhr = 0;
  let heldX = 0;
  let heldLaeuft = false;
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

  // Ebene n hat n Gegner.
  const anzahl = (stufe, welle) => Math.max(1, Math.min(w().maxGegner, welle));

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
    heldX = 0; // jede Welle beginnt am Startplatz: Held und Gegner laufen neu aufeinander zu
    effekte = [];
    bossKampf = false;
    const max = api.maxLeben();
    if (heilen === "voll") spielerLeben = max;
    else spielerLeben = Math.min(max, spielerLeben + max * c.heilungZwischen);
    seitWelle = 0;
    beuteWelle = 0;
    siegeWelle = { schwach: 0, normal: 0, elite: 0, xp: 0 };
    api.faehigkeiten().kampfStart();
  }

  const lebende = () => gegner.filter((g) => g.leben > 0);

  function besiegt(g) {
    api.gutschreiben(g.beute);
    api.xpGeben(g.xp);
    beuteWelle += g.beute;
    if (!g.boss && siegeWelle[g.typ] !== undefined) siegeWelle[g.typ] += 1;
    if (!g.boss) siegeWelle.xp += g.xp;
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
    // Gemessene Siege und Erfahrung pro Sekunde je Gegnerart, geglättet: daraus wird die Offline-Beute gewürfelt.
    const r = k().raten || {};
    for (const [art, n] of Object.entries(siegeWelle)) {
      const neu = n / Math.max(1, seitWelle);
      r[art] = r[art] > 0 ? r[art] * 0.7 + neu * 0.3 : neu;
    }
    k().raten = r;
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
  const merken = (e) => {
    if (effekte.length < 40) effekte.push(e);
  };

  // was: optionaler Name für die Anzeige (z. B. die Art der Fähigkeit). ziel: bestimmter Gegner, sonst der nächste.
  function treffen(menge, wie, ziel, was) {
    ziel = ziel || naechster();
    if (!ziel) return 0;
    const vorher = Math.max(0, ziel.leben);
    ziel.leben -= menge;
    if (wie) merken({ art: wie, i: gegner.indexOf(ziel), was });
    if (ziel.leben <= 0) besiegt(ziel);
    return Math.min(vorher, menge);
  }

  // Ein Angriff des Helden mit seiner Waffe: kritische Treffer, Lebensraub, Zweihänder trifft alle in Reichweite.
  function heldAngriff(art, faktor) {
    const w = api.kampfWerte();
    const ziele = art === "nah" && w.hand === "zweihand" ? lebende().filter((g) => g.x - heldX <= w.zweihandReichweite) : [naechster()];
    const krit = Math.random() < w.krit;
    if (bossKampf && api.bossSchaden) faktor *= 1 + api.bossSchaden(); // Perma-Baum: Bossjäger
    let gemacht = 0;
    ziele.forEach((ziel, n) => {
      // Der Zweihänder trifft die weiteren Gegner nur mit einem Teil des Schadens.
      const anteil = n === 0 ? 1 : w.zweihandNebenschaden;
      gemacht += treffen(api.schaden() * faktor * anteil * (krit ? 2 + (w.kritSchaden || 0) : 1), n === 0 ? (art === "nah" ? "schlag" : "schuss") : "mitSchlag", ziel, krit ? "krit" : "");
    });
    if (w.raub > 0 && gemacht > 0) spielerLeben = Math.min(api.maxLeben(), spielerLeben + gemacht * w.raub);
  }

  // Boss-Phasen: unter 2/3 und 1/3 Leben wird der Boss wütender (mehr Schaden, schnellere Fähigkeiten, kurz ein Schild).
  const phaseRegel = () => (bossPhase > 1 ? (api.bossRegeln().phasen || [])[bossPhase - 2] : null) || { schaden: 1, tempo: 1 };
  function bossZug(dt) {
    const boss = gegner[0];
    const phasen = api.bossRegeln().phasen || [];
    const anteil = boss.leben / boss.maxLeben;
    const soll = 1 + phasen.filter((p) => anteil <= p.ab).length;
    if (soll > bossPhase) {
      bossPhase = soll;
      bossSchildBis = kampfZeit + (api.bossRegeln().schildSekunden || 0);
      merken({ art: "bossPhase", phase: bossPhase });
      api.hinweis(boss.name + " wird wütend: Phase " + bossPhase + "!");
    }
    dt *= phaseRegel().tempo;
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
    const w = api.kampfWerte();
    // Held: Nahkämpfer läuft dem nächsten sichtbaren Gegner entgegen, sonst geht er zum Startplatz zurück.
    const vorn = naechster();
    const sichtbar = vorn && vorn.x <= 1.02;
    let zielX = 0;
    if (w.art === "nah" && sichtbar) zielX = Math.min(l.heldMax, Math.max(0, vorn.x - l.nahReichweite));
    const altX = heldX;
    if (heldX < zielX) heldX = Math.min(zielX, heldX + l.heldTempo * dt);
    else if (heldX > zielX && !sichtbar) heldX = Math.max(zielX, heldX - l.heldZurueck * dt);
    heldLaeuft = Math.abs(heldX - altX) > 1e-6;
    // Gegner: Nahkämpfer laufen bis vor den Helden, Fernkämpfer bleiben auf Abstand stehen.
    for (const g of lebende()) {
      const halt = g.art === "fern" ? g.halt : heldX + g.halt;
      g.laeuft = g.x > halt + 1e-6;
      if (g.laeuft) g.x = Math.max(halt, g.x - l.tempo * dt);
    }
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
      treffen: (m, was) => treffen(m, "zauber", null, was),
      heilen: (anteil, was) => {
        const max = api.maxLeben();
        spielerLeben = Math.min(max, spielerLeben + max * anteil);
        merken({ art: "heldZauber", was });
      },
      zeigen: (was) => merken({ art: "heldZauber", was }),
    });
    if (!lebende().length) return welleGeschafft(), true;
    // Held: Reittier und Ausrüstung machen ihn schneller. Die Uhr läuft immer, zugeschlagen wird nur in Reichweite.
    const abstand = schlag / (1 + api.tempo());
    const ziel = naechster();
    const inReichweite = w.art === "nah" ? ziel.x - heldX <= l.nahReichweite + 0.005 : ziel.x <= 1.02;
    spielerUhr = Math.min(abstand, spielerUhr + dt);
    if (spielerUhr >= abstand && inReichweite) {
      spielerUhr = 0;
      if (aussetzen > 0) aussetzen -= 1;
      else heldAngriff(w.art, fae.schadenFaktor() * schild());
    }
    if (!lebende().length) return welleGeschafft(), true;
    const wut = kampfZeit < bossWutBis ? 1 + (gegner[0].faehigkeiten.find((f) => f.art === "wut") || { wert: 0 }).wert : 1;
    for (const g of lebende()) {
      if (g.laeuft) continue; // noch unterwegs
      g.uhr += dt;
      if (g.uhr < schlag) continue;
      g.uhr -= schlag;
      const i = gegner.indexOf(g);
      merken({ art: g.art === "fern" ? "gegnerSchuss" : "gegnerSchlag", i });
      // Block und Ausweichen wehren den Treffer ganz ab.
      if (Math.random() < w.block) merken({ art: "block" });
      else if (Math.random() < w.ausweichen) merken({ art: "ausweichen" });
      else spielerLeben -= g.schaden * fae.schutzFaktor() * (g.boss ? wut * phaseRegel().schaden : 1);
    }
    // Erholung (Upgrade): ein kleiner Teil des Lebens kommt jede Sekunde zurück.
    if (w.regeneration > 0 && spielerLeben > 0) spielerLeben = Math.min(api.maxLeben(), spielerLeben + api.maxLeben() * w.regeneration * dt);
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
      // Harry 16.11.2026: Bosse deutlich schwerer. Der Boss ist so stark wie die Gegner auf Stufe 10 × Zeitalter.
      const r = api.bossRegeln();
      const c = w();
      const bs = Math.max(1, r.stufeJeZeitalter * api.zeitalterNummer());
      const faktor = Math.pow(c.staerkeFaktor, bs - 1);
      const g = machGegner(boss, "boss", faktor, Math.pow(c.beuteFaktor, bs - 1), true, "nah", 1, api.lauf().bossHalt);
      g.leben *= r.lebenFaktor;
      g.maxLeben *= r.lebenFaktor;
      g.schaden *= r.schadenFaktor;
      gegner = [g];
      bossPhase = 1;
      heldX = 0;
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
      heldX = 0;
      welleStellen("voll");
    },
    // Nur Abfrage, ob gerade ein Boss-Kampf läuft. zustand() verbraucht die Effekte (Schüsse, Hiebe)
    // und darf deshalb nur vom Zeichnen aufgerufen werden, sonst fehlen Pfeile und Schläge.
    istBoss: () => bossKampf,
    zustand() {
      if (!gegner.length) welleStellen("voll");
      const max = api.maxLeben();
      return {
        gegner,
        effekte: effekte.splice(0),
        boss: bossKampf,
        bossPhase,
        stufe: k().stufe,
        welle: k().welle,
        wellenProStufe: w().proStufe,
        heldX,
        heldLaeuft,
        heldArt: api.kampfWerte().art,
        ladung: Math.min(1, spielerUhr / (api.schlagZeit() / (1 + api.tempo()))),
        spielerLeben: Math.min(max, Math.max(0, spielerLeben)),
        maxLeben: max,
        traenkeDabei: bossKampf ? traenkeDabei : null,
      };
    },
  };
}
