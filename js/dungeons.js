// Dungeons: 3 Arten mit eigenen Tickets. Jeden Tag kommen Tickets dazu (bis zur Obergrenze).
// Ein Ticket geht nie verloren: Wer die neue Stufe nicht schafft, bekommt die Belohnung der letzten geschafften.

export function dungeonSystem(api) {
  const d = () => api.daten();
  const s = () => api.seite().dungeons;

  function heute() {
    const j = new Date();
    return j.getFullYear() + "-" + String(j.getMonth() + 1).padStart(2, "0") + "-" + String(j.getDate()).padStart(2, "0");
  }

  // Tages-Tickets nachfüllen (auch für verpasste Tage, bis zur Obergrenze).
  function auffuellen() {
    const tag = heute();
    const stand = s();
    if (stand.letzterTag === tag) return;
    if (stand.letzterTag) {
      const tage = Math.round((Date.parse(tag) - Date.parse(stand.letzterTag)) / 86400000);
      if (tage > 0) {
        for (const art of d().arten) {
          stand.tickets[art.id] = Math.min(d().ticketsMax + api.ticketsPlus(), (stand.tickets[art.id] || 0) + tage * d().ticketsProTag);
        }
      }
    }
    stand.letzterTag = tag;
  }

  const faktor = (stufe) => Math.pow(d().stufenFaktor, stufe - 1);

  function schaffbar(stufe) {
    const basis = api.gegnerBasis();
    const leben = basis.leben * d().gegner.lebenFaktor * faktor(stufe);
    const schaden = basis.schaden * d().gegner.schadenFaktor * faktor(stufe);
    const spieler = api.spieler();
    const runden = Math.ceil(leben / spieler.schaden);
    return (runden - 1) * schaden < spieler.leben;
  }

  function belohnen(art, stufe) {
    const meilenstein = stufe % d().meilensteinAlle === 0;
    const teile = [];
    teile.push(api.punkteGeben(stufe, meilenstein) + " Fähigkeitspunkte");
    teile.push(api.techPunkteGeben(stufe, meilenstein) + " Tech-Punkte");
    if (art === "eier") {
      const ratio = Math.max(d().ei.ratioEnde, d().ei.ratioStart - d().ei.ratioProStufe * (stufe - 1));
      teile.push("Ei (" + api.eiGeben(ratio, 0).name + ")");
      if (meilenstein) teile.push("Meilenstein-Ei (" + api.eiGeben(ratio, 1).name + ")");
    } else if (art === "ausruestung") {
      const anzahl = d().ausruestung.stuecke + (meilenstein ? d().ausruestung.meilensteinStuecke : 0);
      for (let i = 0; i < anzahl; i++) {
        const r = api.schmiedenGratis();
        if (r) teile.push(r.neu.seltenheit.name + " " + r.neu.name);
      }
    } else {
      const menge = api.gegnerBasis().beute * d().schatz.beuteFaktor * faktor(stufe);
      api.gutschreiben(menge);
      teile.push(api.mengeText(menge));
      const vorher = api.seite().traenke;
      const dazu = meilenstein ? d().schatz.meilensteinTraenke : d().schatz.traenke;
      api.seite().traenke = Math.min(d().heiltrank.max, vorher + dazu);
      const bekommen = api.seite().traenke - vorher;
      teile.push(bekommen > 0 ? bekommen + (bekommen === 1 ? " Heiltrank" : " Heiltränke") : "Heiltränke sind voll");
    }
    return teile.join(", ");
  }

  return {
    schritt: auffuellen,
    info(art) {
      auffuellen();
      return { tickets: s().tickets[art] || 0, stufe: s().stufe[art] || 1 };
    },
    kaempfen(art) {
      auffuellen();
      const stand = s();
      if ((stand.tickets[art] || 0) <= 0) return "Keine Tickets mehr. Morgen gibt es neue.";
      const stufe = stand.stufe[art] || 1;
      if (schaffbar(stufe)) {
        stand.tickets[art] -= 1;
        stand.stufe[art] = stufe + 1;
        return "Sieg in Stufe " + stufe + "! Belohnung: " + belohnen(art, stufe);
      }
      if (stufe > 1) {
        stand.tickets[art] -= 1;
        return "Stufe " + stufe + " war zu stark. Belohnung von Stufe " + (stufe - 1) + ": " + belohnen(art, stufe - 1);
      }
      return "Stufe 1 war zu stark. Das Ticket bleibt dir. Rüste erst auf.";
    },
    autoClear(art) {
      auffuellen();
      const stand = s();
      const stufe = (stand.stufe[art] || 1) - 1;
      if (stufe < 1 || (stand.tickets[art] || 0) <= 0) return null;
      stand.tickets[art] -= 1;
      return "Auto-Clear Stufe " + stufe + ". Belohnung: " + belohnen(art, stufe);
    },
  };
}
