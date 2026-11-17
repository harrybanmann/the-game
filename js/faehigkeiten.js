// Fähigkeiten: Punkte ziehen eine zufällige Fähigkeit, Level mit Punkten.
// Version 38 (Harry 17.11.2026): Jede Fähigkeit hat eine Qualität (grau … göttlich). Jedes Zeitalter schaltet eine neue
// Qualität (und die dazu passende Fähigkeit) frei; im Zeitalter 1 gibt es nur Grau. 3 gleiche (Art + Qualität) werden zu
// einer Fähigkeit der nächsten Qualität; erst ganz oben gibt es dafür Sterne. Höhere Qualität macht stärker.
// Gespeichert wird jede Art je Qualität als eigener Eintrag { id, q, level, sterne, kopien }; Schlüssel = id@q.
// Im Kampf lösen die ausgerüsteten Fähigkeiten automatisch aus (je eigene Abklingzeit).

export function faehigkeitenSystem(api) {
  const d = () => api.daten();
  const vorlage = (id) => d().liste.find((x) => x.id === id);
  const schluesselVon = (e) => e.id + "@" + e.q;
  // Alte Spielstände: die feste Qualität der Fähigkeit wird zur Qualität des Eintrags (nichts geht verloren).
  function f() {
    const x = api.seite().faehigkeiten;
    if (!x.v2) {
      for (const e of x.sammlung) if (!Number.isFinite(e.q)) e.q = (vorlage(e.id) || { seltenheit: 0 }).seltenheit;
      const nachSchluessel = (id) => (id.includes("@") ? id : (x.sammlung.find((e) => e.id === id) ? schluesselVon(x.sammlung.find((e) => e.id === id)) : id));
      x.ausgeruestet = x.ausgeruestet.map(nachSchluessel);
      x.v2 = true;
    }
    return x;
  }
  const finde = (key) => f().sammlung.find((x) => schluesselVon(x) === key);
  const hoechste = () => api.seltenheiten().length - 1;
  // Höchste freigeschaltete Qualität: Zeitalter 1 = 0 (grau), Zeitalter 2 = 1 … bis göttlich.
  const maxQ = () => Math.min(hoechste(), (api.zeitalterNummer ? api.zeitalterNummer() : 99) - 1);
  const artOffen = (v) => v.seltenheit <= maxQ(); // die Fähigkeit selbst kommt mit ihrem Zeitalter

  function plaetze() {
    return d().plaetzeAbLevel.filter((ab) => api.level() >= ab).length;
  }

  function staerke(eintrag) {
    return (1 + (eintrag.level - 1) * d().levelBonus) * (1 + eintrag.sterne * d().sternBonus) * (1 + (d().qualitaetBonus || 0.5) * eintrag.q);
  }

  function werte(eintrag) {
    if (!eintrag) return null;
    const v = vorlage(eintrag.id);
    if (!v) return null;
    const key = schluesselVon(eintrag);
    return {
      id: v.id,
      key,
      name: v.name[api.seitenName()] || v.name.gut,
      text: v.text,
      art: v.art,
      seltenheit: api.seltenheiten()[eintrag.q] || api.seltenheiten()[0],
      rang: eintrag.q,
      artRang: v.seltenheit,
      level: eintrag.level,
      sterne: eintrag.sterne,
      kopien: eintrag.kopien,
      faktor: staerke(eintrag),
      ausgeruestet: f().ausgeruestet.includes(key),
    };
  }

  const levelKosten = (eintrag) => Math.ceil(d().levelKosten.grund * Math.pow(d().levelKosten.faktor, eintrag.level - 1));

  // Laufender Kampf-Zustand (nicht gespeichert).
  let uhren = {};
  let staerkeBis = 0;
  let staerkeWert = 0;
  let schutzBis = 0;
  let schutzWert = 0;
  let zeit = 0;

  return {
    werte,
    plaetze,
    levelKosten,
    plaetzeAbLevel: () => d().plaetzeAbLevel,
    ziehenKosten: () => d().ziehenKosten,
    eintrag: (key) => finde(key),
    maxQualitaet: maxQ,
    // Sortiert nach Qualität (Göttlich oben), dann Zeitalter der Fähigkeit, Sterne und Level.
    liste() {
      return f()
        .sammlung.map(werte)
        .filter(Boolean)
        .sort((a, b) => b.rang - a.rang || b.artRang - a.artRang || b.sterne - a.sterne || b.level - a.level);
    },
    punkteGeben(stufe, meilenstein) {
      const p = d().punkte;
      const menge = p.proDurchlauf + Math.floor(stufe / p.proStufen) + (meilenstein ? p.meilenstein : 0);
      f().punkte += menge;
      return menge;
    },
    ziehen() {
      if (f().punkte < d().ziehenKosten) return null;
      f().punkte -= d().ziehenKosten;
      // Art: gleich verteilt unter den freigeschalteten Fähigkeiten. Qualität: je höher, desto seltener, bis zur Grenze.
      const arten = d().liste.filter(artOffen);
      const wahl = arten[Math.floor(Math.random() * arten.length)] || d().liste[0];
      const gewichte = Array.from({ length: maxQ() + 1 }, (_, q) => Math.pow(d().ziehenRatio, -q));
      let z = Math.random() * gewichte.reduce((a, b) => a + b, 0);
      let q = 0;
      for (let i = 0; i < gewichte.length; i++) {
        z -= gewichte[i];
        if (z < 0) {
          q = i;
          break;
        }
      }
      let eintrag = finde(wahl.id + "@" + q);
      const neu = !eintrag;
      if (neu) {
        eintrag = { id: wahl.id, q, level: 1, sterne: 0, kopien: 0 };
        f().sammlung.push(eintrag);
        if (f().ausgeruestet.length < plaetze()) f().ausgeruestet.push(schluesselVon(eintrag));
      } else {
        eintrag.kopien += 1;
      }
      return { ...werte(eintrag), neu };
    },
    // 3 gleiche (die Fähigkeit selbst plus 2 Kopien) werden zur nächsten Qualität, bis zur freigeschalteten Grenze.
    // Ganz oben (göttlich) gibt es dafür Sterne, wenn die Sterne freigeschaltet sind.
    mergbar: (key) => {
      const e = finde(key);
      if (!e || e.kopien < 2) return false;
      if (e.q < hoechste()) return e.q < maxQ();
      return (!api.sterneOffen || api.sterneOffen()) && e.sterne < d().maxSterne;
    },
    mergen(key) {
      if (!this.mergbar(key)) return false;
      const e = finde(key);
      if (e.q >= hoechste()) {
        e.kopien -= 2;
        e.sterne += 1;
        return true;
      }
      const rest = e.kopien - 2; // übrige Kopien neben der Fähigkeit selbst
      const neuKey = e.id + "@" + (e.q + 1);
      const gleich = finde(neuKey);
      if (gleich) gleich.kopien += 1;
      else f().sammlung.push({ id: e.id, q: e.q + 1, level: rest < 0 || rest === 0 ? e.level : 1, sterne: 0, kopien: 0 });
      if (rest > 0) e.kopien = rest - 1;
      else {
        // Die Fähigkeit selbst ist aufgebraucht: aus der Sammlung nehmen, die neue übernimmt den Platz.
        f().sammlung = f().sammlung.filter((x) => x !== e);
        const i = f().ausgeruestet.indexOf(key);
        if (i >= 0) f().ausgeruestet[i] = neuKey;
      }
      return true;
    },
    levelKaufen(key) {
      const e = finde(key);
      if (!e || e.level >= d().maxLevel || f().punkte < levelKosten(e)) return false;
      f().punkte -= levelKosten(e);
      e.level += 1;
      return true;
    },
    ausruesten(key) {
      if (!finde(key) || f().ausgeruestet.includes(key)) return false;
      if (f().ausgeruestet.length >= plaetze()) f().ausgeruestet.shift();
      f().ausgeruestet.push(key);
      return true;
    },
    ablegen(key) {
      f().ausgeruestet = f().ausgeruestet.filter((x) => x !== key);
    },
    // ---------- Kampf ----------
    kampfStart() {
      uhren = {};
      staerkeBis = 0;
      schutzBis = 0;
      zeit = 0;
    },
    // Lässt die Zeit laufen und löst fällige Fähigkeiten aus.
    schritt(sekunden, kampf) {
      zeit += sekunden;
      const aktiv = f().ausgeruestet.slice(0, plaetze());
      for (const key of aktiv) {
        const e = finde(key);
        const v = e ? vorlage(e.id) : null;
        if (!e || !v) continue;
        uhren[key] = (uhren[key] || 0) + sekunden;
        if (uhren[key] < v.abklingen) continue;
        uhren[key] = 0;
        const k = staerke(e);
        if (v.art === "schaden") kampf.treffen(api.grundSchaden() * v.wert * k, v.id);
        else if (v.art === "heilung") kampf.heilen(v.wert * k, "heilung");
        else if (v.art === "staerke") {
          staerkeBis = zeit + v.dauer;
          staerkeWert = v.wert * k;
          kampf.zeigen("staerke");
        } else if (v.art === "schutz") {
          schutzBis = zeit + v.dauer;
          schutzWert = Math.min(0.9, v.wert * k);
          kampf.zeigen("schutz");
        }
      }
    },
    // Für die Anzeige: läuft gerade eine Verstärkung oder ein Schutz?
    aktiv: () => ({ staerke: zeit < staerkeBis, schutz: zeit < schutzBis }),
    schadenFaktor: () => (zeit < staerkeBis ? 1 + staerkeWert : 1),
    schutzFaktor: () => (zeit < schutzBis ? 1 - schutzWert : 1),
  };
}
