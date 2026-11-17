// Set-Teile aus den Dungeons (Harry 16./17.11.2026): 10 Teile, 4 Sets (Berserker, Bollwerk, Sturmläufer, Plünderer).
// Jedes Teil gehört zu einem Set (Thema); Teile aus allen Zeitaltern zählen. Bei 2, 4, 6, 8 und 10 Teilen desselben Sets
// gibt es Boni, jedes Set andere. Gut = helle, Böse = dunkle Version. Gespeichert in seite.sets:
// { sammlung: [{ z, teil, thema, seltenheit, anzahl }], an: { <teil>: { z, teil, thema, seltenheit } } }.

export function setSystem(api) {
  const d = () => api.daten();
  const st = () => api.seite().sets;
  const themen = () => d().set.themen;
  const themaVon = (id) => themen().find((x) => x.id === id) || themen()[0];
  const gleich = (a, b) => !!a && !!b && a.z === b.z && a.teil === b.teil && (a.thema || "berserker") === (b.thema || "berserker") && a.seltenheit === b.seltenheit;
  const hoechste = () => api.seltenheiten().length - 1;
  const farben = (th) => (api.seitenName && api.seitenName() === "boese" ? th.boese : th.gut);
  // Das „Set“-Objekt für Anzeige und Bilder: Name, Farben der Seite, id als „zeitalter“-Schlüssel für Bild-Zwischenspeicher.
  const setObjekt = (th) => ({ zeitalter: th.id, thema: th.id, name: th.name, text: th.thema, farbe: farben(th)[0], rand: farben(th)[1] });
  // Harry 17.11.2026: Qualität nach Zeitalter – Zeitalter 1 nur grau, jedes weitere Zeitalter schaltet eine Qualität frei.
  const maxQ = () => Math.min(hoechste(), (api.zeitalterNummer ? api.zeitalterNummer() : 99) - 1);
  function wuerfeln(ratio) {
    const gewichte = api.seltenheiten().map((_, i) => (i <= maxQ() ? Math.pow(ratio, -i) : 0));
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
    const th = themaVon(teil.thema);
    const set = setObjekt(th);
    const selten = api.seltenheiten()[teil.seltenheit] || api.seltenheiten()[0];
    const c = d().set;
    const prozent = c.grundProzent * (selten.prozent || selten.faktor) * (1 + c.jeZeitalter * (api.zeitalterNummerVon(teil.z) - 1)) * (mitHaendler ? api.haendlerFaktor("set-" + teil.teil) : 1);
    return { ...teil, thema: th.id, set, seltenheitInfo: selten, prozent, zeitalterNr: api.zeitalterNummerVon(teil.z) };
  }

  const besser = (a, b) => !b || a.seltenheit > b.seltenheit || (a.seltenheit === b.seltenheit && api.zeitalterNummerVon(a.z) > api.zeitalterNummerVon(b.z));

  function insLager(teil) {
    const e = st().sammlung.find((x) => gleich(x, teil));
    if (e) e.anzahl += 1;
    else st().sammlung.push({ z: teil.z, teil: teil.teil, thema: teil.thema || "berserker", seltenheit: teil.seltenheit, anzahl: 1 });
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
      st().an[teil.teil] = { z: teil.z, teil: teil.teil, thema: teil.thema || "berserker", seltenheit: teil.seltenheit };
      if (alt) insLager(alt);
      return true;
    }
    insLager(teil);
    return false;
  }

  const mergbar = (teil) => teil.seltenheit < maxQ() && (st().sammlung.find((x) => gleich(x, teil)) || { anzahl: 0 }).anzahl >= 3;

  return {
    werte,
    setVon: (z) => null,
    themen,
    themaVon,
    setObjekt: (id) => setObjekt(themaVon(id)),
    // Belohnung aus einem Dungeon: zufälliges Teil des Sets dieses Zeitalters.
    // Harry 16.11.2026: jedes Zeitalter bringt ein neues Teil (Helm, Handschuhe, Rüstung, Waffe); nur offene Teile fallen.
    offen: (teil) => (api.zeitalterNummer ? api.zeitalterNummer() : 99) >= ((d().set.teilAbZeitalter || {})[teil] || 1),
    geben(z, ratio) {
      const teile = d().set.teile.filter((t) => this.offen(t));
      const teil = { z, teil: teile[Math.floor(Math.random() * teile.length)], thema: themen()[Math.floor(Math.random() * themen().length)].id, seltenheit: wuerfeln(ratio) };
      const angelegt = einsortieren(teil);
      return { ...werte(teil), angelegt };
    },
    angelegt: (platz) => werte(st().an[platz]),
    liste() {
      return st()
        .sammlung.map((e) => ({ ...werte(e, false), anzahl: e.anzahl, mergbar: mergbar(e) }))
        .filter((e) => e.set)
        .sort((a, b) => themen().findIndex((x) => x.id === a.thema) - themen().findIndex((x) => x.id === b.thema) || b.seltenheit - a.seltenheit || b.zeitalterNr - a.zeitalterNr || d().set.teile.indexOf(a.teil) - d().set.teile.indexOf(b.teil));
    },
    anlegen(teil) {
      if (ausLager(teil, 1) !== 1) return;
      const alt = st().an[teil.teil];
      st().an[teil.teil] = { z: teil.z, teil: teil.teil, thema: teil.thema || "berserker", seltenheit: teil.seltenheit };
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
    // Summe für den Kampf: Prozent Schaden und Leben aus allen getragenen Teilen plus die Boni der Sets.
    // zaehler: Teile je Set; stufen: erreichte Bonus-Stufen je Set; extra: Summe aller Zusatz-Boni (krit, tempo, geld …).
    bonus() {
      let prozent = 0;
      const zaehler = {};
      for (const p of d().set.teile) {
        const w = werte(st().an[p]);
        if (!w) continue;
        prozent += w.prozent;
        zaehler[w.thema] = (zaehler[w.thema] || 0) + 1;
      }
      const extra = {};
      const stufen = {};
      for (const th of themen()) {
        const n = zaehler[th.id] || 0;
        stufen[th.id] = Object.keys(th.boni).map(Number).filter((k) => n >= k);
        for (const k of stufen[th.id]) for (const [id, wert] of Object.entries(th.boni[k].w)) extra[id] = (extra[id] || 0) + wert;
      }
      const meiste = Math.max(0, ...Object.values(zaehler));
      const dominant = themen().reduce((a, th) => ((zaehler[th.id] || 0) > ((a && zaehler[a.id]) || 0) ? th : a), null);
      return {
        schaden: prozent + (extra.schaden || 0),
        leben: prozent + (extra.leben || 0),
        setTeile: meiste,
        setBonus: (extra.schaden || 0) + (extra.leben || 0),
        zaehler,
        stufen,
        extra,
        dominant: dominant && (zaehler[dominant.id] || 0) >= 1 ? dominant.id : null,
      };
    },
  };
}
