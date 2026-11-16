// Dungeons (Harry 16.11.2026): Jedes Zeitalter hat einen eigenen Dungeon mit eigenem Set.
// Ein Schlüssel = ein Durchlauf. Schlüssel fallen im normalen Kampf, es gibt kein tägliches Warten mehr.
// Ein Schlüssel geht nie verloren: Wer die neue Stufe nicht schafft, bekommt die Belohnung der letzten geschafften.
// Belohnung: ein Set-Teil des Dungeons (höhere Stufe = seltener) und ein Heiltrank.

export function dungeonSystem(api) {
  const d = () => api.daten();
  const s = () => api.seite().dungeons;

  const faktor = (stufe) => Math.pow(d().stufenFaktor, stufe - 1);
  const stufe = (zId) => s().stufe[zId] || 1;

  function schaffbar(zId, st) {
    const basis = api.gegnerBasis(zId);
    const leben = basis.leben * d().gegner.lebenFaktor * faktor(st);
    const schaden = basis.schaden * d().gegner.schadenFaktor * faktor(st);
    const spieler = api.spieler();
    const runden = Math.ceil(leben / spieler.schaden);
    return (runden - 1) * schaden < spieler.leben;
  }

  function belohnen(zId, st) {
    const meilenstein = st % d().meilensteinAlle === 0;
    const sel = d().seltenheit;
    const ratio = Math.max(sel.ratioEnde, sel.ratioStart - sel.ratioProStufe * (st - 1));
    const teile = [];
    const anzahl = 1 + (meilenstein ? d().set.meilensteinTeile : 0);
    for (let i = 0; i < anzahl; i++) teile.push(api.setTeilGeben(zId, ratio));
    const vorher = api.seite().traenke;
    api.seite().traenke = Math.min(api.traenkeMax ? api.traenkeMax() : d().heiltrank.max, vorher + d().traenkeJeSieg);
    return { teile, traenke: api.seite().traenke - vorher };
  }

  return {
    stufe,
    schluessel: () => s().schluessel,
    schluesselGeben(n) {
      s().schluessel = Math.min(d().schluesselMax + (api.schluesselPlus ? api.schluesselPlus() : 0), s().schluessel + n);
    },
    // Ergebnis: { text, teile } – teile sind die gewonnenen Set-Teile (für die Anzeige).
    kaempfen(zId) {
      if (s().schluessel <= 0) return { text: "Kein Schlüssel. Gegner lassen manchmal welche fallen." };
      const st = stufe(zId);
      if (schaffbar(zId, st)) {
        s().schluessel -= 1;
        s().stufe[zId] = st + 1;
        return { sieg: true, stufe: st, ...belohnen(zId, st) };
      }
      if (st > 1) {
        s().schluessel -= 1;
        return { sieg: false, stufe: st - 1, ...belohnen(zId, st - 1) };
      }
      return { text: "Stufe 1 war zu stark. Der Schlüssel bleibt dir. Rüste erst auf." };
    },
    autoClear(zId) {
      const st = stufe(zId) - 1;
      if (st < 1 || s().schluessel <= 0) return null;
      s().schluessel -= 1;
      return { sieg: true, auto: true, stufe: st, ...belohnen(zId, st) };
    },
  };
}
