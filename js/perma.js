// Perma-Baum (Harry 16.11.2026): Punkte gibt es nur durch einen Neustart. Der Neustart setzt alles zurück
// außer Tech-Baum, Perma-Baum, Energie und Sammelbuch. Jeder Knoten hat Stufen; der nächste Knoten eines Astes
// öffnet sich, sobald der davor mindestens Stufe 1 hat. Gespeichert in gemeinsam.perma.

export function permaSystem(api) {
  const d = () => api.daten();
  const p = () => api.permaStand(); // { punkte, stufen: {}, neustarts }

  const stufe = (id) => p().stufen[id] || 0;
  const ast = (id) => d().aeste.find((a) => a.id === id);
  const kosten = (k) => d().kosten.grund + d().kosten.jeStufe * stufe(k.id);

  // Knoten i eines Astes ist offen, wenn der Knoten davor mindestens Stufe 1 hat.
  function offen(astId, i) {
    if (i === 0) return true;
    const vorher = ast(astId).knoten[i - 1];
    return stufe(vorher.id) >= 1;
  }

  function wert(wirkung) {
    let summe = 0;
    for (const a of d().aeste) for (const k of a.knoten) if (k.wirkung === wirkung) summe += stufe(k.id) * k.wert;
    return summe;
  }

  // Punkte für einen Neustart: je erreichtem Zeitalter (ab dem zweiten) und je paar Stufen.
  function punkteFuer(zeitalterNummer, kampfStufe) {
    const b = d().belohnung;
    return Math.max(0, (zeitalterNummer - 1) * b.jeZeitalter + Math.floor(kampfStufe / b.stufenJePunkt));
  }

  return {
    aeste: () => d().aeste,
    stufe,
    kosten,
    offen,
    wert,
    punkte: () => p().punkte,
    neustarts: () => p().neustarts || 0,
    punkteFuer,
    gutschreiben(n) {
      p().punkte += n;
      p().neustarts = (p().neustarts || 0) + 1;
    },
    // Gibt einen Fehlertext zurück oder null bei Erfolg.
    kaufen(astId, i) {
      const k = ast(astId).knoten[i];
      if (!offen(astId, i)) return "Erst den Knoten davor einmal kaufen.";
      if (stufe(k.id) >= k.max) return "Schon auf Höchststufe.";
      if (p().punkte < kosten(k)) return "Zu wenig Perma-Punkte. Die gibt es nur durch einen Neustart.";
      p().punkte -= kosten(k);
      p().stufen[k.id] = stufe(k.id) + 1;
      return null;
    },
  };
}
