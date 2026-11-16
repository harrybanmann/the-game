// Tech-Baum: 4 Äste, je 12 Ebenen × 3 Knoten, je 5 Stufen. Alle Äste gleich aufgebaut,
// die Wirkungen wiederholen sich in jeder Ebene reihum (wie bei Forge Master).
// Der Baum gilt für beide Seiten gemeinsam; neue Ebenen richten sich nach dem Zeitalter der aktiven Seite.
// Pro Ast läuft höchstens eine Forschung; sie ist nach echter Zeit fertig (auch offline).

export function techSystem(api) {
  const d = () => api.daten();
  const t = () => api.techStand(); // gemeinsam für Gut und Böse

  const ast = (id) => d().aeste.find((a) => a.id === id);
  const knotenId = (astId, ebene, nr) => astId + "-" + ebene + "-" + nr;

  function knoten(astId, ebene, nr) {
    const a = ast(astId);
    const effekt = a.effekte[(3 * (ebene - 1) + (nr - 1)) % a.effekte.length];
    return { id: knotenId(astId, ebene, nr), ast: astId, ebene, nr, effekt };
  }

  const stufe = (id) => t().stufen[id] || 0;

  function wert(effektId) {
    let summe = 0;
    for (const a of d().aeste) {
      const e = a.effekte.find((x) => x.id === effektId);
      if (!e) continue;
      for (let eb = 1; eb <= d().ebenen; eb++)
        for (let nr = 1; nr <= d().knotenJeEbene; nr++) {
          const k = knoten(a.id, eb, nr);
          if (k.effekt.id === effektId) summe += stufe(k.id) * e.wert;
        }
    }
    return summe;
  }

  const astOffen = (astId) => api.systemOffen(ast(astId).offen);

  // Ebene e braucht Zeitalter ≥ e und jeden Knoten der Ebene davor mindestens auf Stufe 1.
  function ebeneOffen(astId, ebene) {
    if (!astOffen(astId) || api.zeitalterNummer() < ebene) return false;
    if (ebene === 1) return true;
    for (let nr = 1; nr <= d().knotenJeEbene; nr++) if (stufe(knotenId(astId, ebene - 1, nr)) < 1) return false;
    return true;
  }

  const kosten = (k) => Math.ceil(d().kosten.grund * Math.pow(d().kosten.ebeneFaktor, k.ebene - 1) * (stufe(k.id) + 1));
  const dauer = (k) =>
    Math.round((d().dauer.grundSekunden * Math.pow(d().dauer.ebeneFaktor, k.ebene - 1) * (stufe(k.id) + 1)) / (1 + wert("tempo")));

  return {
    wert,
    stufe,
    kosten,
    dauer,
    astOffen,
    ebeneOffen,
    aeste: () => d().aeste,
    ebenen: () => d().ebenen,
    knotenJeEbene: () => d().knotenJeEbene,
    maxStufe: () => d().maxStufe,
    knoten,
    laeuft: (astId) => t().laeuft[astId] || null,
    punkteGeben(dungeonStufe, meilenstein) {
      const p = d().dungeonPunkte;
      const menge = Math.round((p.grund + dungeonStufe * p.jeStufe + (meilenstein ? p.meilenstein : 0)) * (1 + wert("techpunkte")));
      t().punkte += menge;
      return menge;
    },
    starten(astId, ebene, nr) {
      const k = knoten(astId, ebene, nr);
      if (t().laeuft[astId]) return "In diesem Ast läuft schon eine Forschung.";
      if (!ebeneOffen(astId, ebene)) return "Diese Ebene ist noch gesperrt.";
      if (stufe(k.id) >= d().maxStufe) return "Schon auf Höchststufe.";
      if (t().punkte < kosten(k)) return "Zu wenig Tech-Punkte (gibt es in den Dungeons).";
      t().punkte -= kosten(k);
      t().laeuft[astId] = { knoten: k.id, bis: Date.now() + dauer(k) * 1000 };
      return null;
    },
    // Gibt die Namen der fertig gewordenen Forschungen zurück.
    schritt(jetzt) {
      const fertig = [];
      for (const [astId, l] of Object.entries(t().laeuft)) {
        if (!l || jetzt < l.bis) continue;
        t().stufen[l.knoten] = stufe(l.knoten) + 1;
        delete t().laeuft[astId];
        const [, eb, nr] = l.knoten.split("-").map(Number).map((x, i) => (i === 0 ? 0 : x));
        fertig.push(knoten(astId, eb, nr).effekt.name);
      }
      return fertig;
    },
  };
}
