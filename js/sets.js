// Set-Teile aus den Dungeons (Harry 16.11.2026): Helm, Rüstung, Handschuhe, Waffe – je Zeitalter ein Set.
// Sie ändern das Aussehen des Helden und geben pro Teil Prozent mehr Schaden und Leben, dazu einen Set-Bonus
// (Teile aus demselben Set). 3 gleiche Teile werden zu einem Teil der nächsten Seltenheit.
// Gespeichert in seite.sets: { sammlung: [{ z, teil, seltenheit, anzahl }], an: { helm, ruestung, handschuhe, waffe } }.

export function setSystem(api) {
  const d = () => api.daten();
  const st = () => api.seite().sets;
  const gleich = (a, b) => !!a && !!b && a.z === b.z && a.teil === b.teil && a.seltenheit === b.seltenheit;
  const setVon = (z) => d().sets.find((x) => x.zeitalter === z);
  const hoechste = () => api.seltenheiten().length - 1;

  function wuerfeln(ratio) {
    const gewichte = api.seltenheiten().map((_, i) => Math.pow(ratio, -i));
    let r = Math.random() * gewichte.reduce((a, b) => a + b, 0);
    for (let i = 0; i < gewichte.length; i++) {
      r -= gewichte[i];
      if (r < 0) return i;
    }
    return 0;
  }

  // Werte eines Teils: Prozent Schaden und Prozent Leben (gleich groß), mit Händler-Stufe des Platzes.
  function werte(teil, mitHaendler = true) {
    if (!teil) return null;
    const set = setVon(teil.z);
    if (!set) return null;
    const selten = api.seltenheiten()[teil.seltenheit] || api.seltenheiten()[0];
    const c = d().set;
    const prozent = c.grundProzent * selten.faktor * (1 + c.jeZeitalter * (api.zeitalterNummerVon(teil.z) - 1)) * (mitHaendler ? api.haendlerFaktor("set-" + teil.teil) : 1);
    return { ...teil, set, seltenheitInfo: selten, prozent, zeitalterNr: api.zeitalterNummerVon(teil.z) };
  }

  const besser = (a, b) => !b || a.seltenheit > b.seltenheit || (a.seltenheit === b.seltenheit && api.zeitalterNummerVon(a.z) > api.zeitalterNummerVon(b.z));

  function insLager(teil) {
    const e = st().sammlung.find((x) => gleich(x, teil));
    if (e) e.anzahl += 1;
    else st().sammlung.push({ z: teil.z, teil: teil.teil, seltenheit: teil.seltenheit, anzahl: 1 });
  }
  function ausLager(teil, n) {
    const e = st().sammlung.find((x) => gleich(x, teil));
    if (!e) return 0;
    const weg = Math.min(n, e.anzahl);
    e.anzahl -= weg;
    if (e.anzahl <= 0) st().sammlung = st().sammlung.filter((x) => x !== e);
    return weg;
  }
  // Neues Teil: anlegen, wenn es besser ist als das getragene, sonst in die Sammlung.
  function einsortieren(teil) {
    const alt = st().an[teil.teil];
    if (besser(teil, alt)) {
      st().an[teil.teil] = { z: teil.z, teil: teil.teil, seltenheit: teil.seltenheit };
      if (alt) insLager(alt);
      return true;
    }
    insLager(teil);
    return false;
  }

  const mergbar = (teil) => teil.seltenheit < hoechste() && (st().sammlung.find((x) => gleich(x, teil)) || { anzahl: 0 }).anzahl >= 3;

  return {
    werte,
    setVon,
    // Belohnung aus einem Dungeon: zufälliges Teil des Sets dieses Zeitalters.
    geben(z, ratio) {
      const teile = d().set.teile;
      const teil = { z, teil: teile[Math.floor(Math.random() * teile.length)], seltenheit: wuerfeln(ratio) };
      const angelegt = einsortieren(teil);
      return { ...werte(teil), angelegt };
    },
    angelegt: (platz) => werte(st().an[platz]),
    liste() {
      return st()
        .sammlung.map((e) => ({ ...werte(e, false), anzahl: e.anzahl, mergbar: mergbar(e) }))
        .filter((e) => e.set)
        .sort((a, b) => b.seltenheit - a.seltenheit || b.zeitalterNr - a.zeitalterNr || d().set.teile.indexOf(a.teil) - d().set.teile.indexOf(b.teil));
    },
    anlegen(teil) {
      if (ausLager(teil, 1) !== 1) return;
      const alt = st().an[teil.teil];
      st().an[teil.teil] = { z: teil.z, teil: teil.teil, seltenheit: teil.seltenheit };
      if (alt) insLager(alt);
    },
    mergbar,
    mergen(teil) {
      if (!mergbar(teil)) return false;
      ausLager(teil, 3);
      einsortieren({ ...teil, seltenheit: teil.seltenheit + 1 });
      return true;
    },
    allesMergen() {
      let n = 0;
      for (let i = 0; i < 500; i++) {
        const e = st().sammlung.find((x) => mergbar(x));
        if (!e) break;
        this.mergen(e);
        n += 1;
      }
      return n;
    },
    // Summe für den Kampf: Prozent Schaden und Leben aus allen getragenen Teilen plus Set-Bonus.
    bonus() {
      let prozent = 0;
      const jeSet = {};
      for (const p of d().set.teile) {
        const w = werte(st().an[p]);
        if (!w) continue;
        prozent += w.prozent;
        jeSet[w.z] = (jeSet[w.z] || 0) + 1;
      }
      const meiste = Math.max(0, ...Object.values(jeSet));
      let setBonus = 0;
      for (const [n, b] of Object.entries(d().set.bonus)) if (meiste >= Number(n)) setBonus = Math.max(setBonus, b);
      return { schaden: prozent + setBonus, leben: prozent + setBonus, setTeile: meiste, setBonus };
    },
  };
}
