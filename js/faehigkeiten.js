// Fähigkeiten: Punkte ziehen eine zufällige Fähigkeit, 3 gleiche = +1 Stern, Level mit Punkten.
// Seltenheit macht nicht stärker, nur seltener (Harry). Stärke kommt aus Level und Sternen.
// Im Kampf lösen die ausgerüsteten Fähigkeiten automatisch aus (je eigene Abklingzeit).

export function faehigkeitenSystem(api) {
  const d = () => api.daten();
  const f = () => api.seite().faehigkeiten;
  const vorlage = (id) => d().liste.find((x) => x.id === id);
  const finde = (id) => f().sammlung.find((x) => x.id === id);

  function plaetze() {
    return d().plaetzeAbLevel.filter((ab) => api.level() >= ab).length;
  }

  function staerke(eintrag) {
    return (1 + (eintrag.level - 1) * d().levelBonus) * (1 + eintrag.sterne * d().sternBonus);
  }

  function werte(eintrag) {
    if (!eintrag) return null;
    const v = vorlage(eintrag.id);
    if (!v) return null;
    return {
      id: v.id,
      name: v.name[api.seitenName()] || v.name.gut,
      text: v.text,
      art: v.art,
      seltenheit: api.seltenheiten()[v.seltenheit] || api.seltenheiten()[0],
      level: eintrag.level,
      sterne: eintrag.sterne,
      kopien: eintrag.kopien,
      faktor: staerke(eintrag),
      ausgeruestet: f().ausgeruestet.includes(v.id),
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
    liste() {
      return f()
        .sammlung.map(werte)
        .filter(Boolean)
        .sort((a, b) => b.seltenheit.faktor - a.seltenheit.faktor || b.sterne - a.sterne);
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
      const gewichte = d().liste.map((x) => Math.pow(d().ziehenRatio, -x.seltenheit));
      let z = Math.random() * gewichte.reduce((a, b) => a + b, 0);
      let wahl = d().liste[0];
      for (let i = 0; i < gewichte.length; i++) {
        z -= gewichte[i];
        if (z < 0) {
          wahl = d().liste[i];
          break;
        }
      }
      let eintrag = finde(wahl.id);
      const neu = !eintrag;
      if (neu) {
        eintrag = { id: wahl.id, level: 1, sterne: 0, kopien: 0 };
        f().sammlung.push(eintrag);
        if (f().ausgeruestet.length < plaetze()) f().ausgeruestet.push(wahl.id);
      } else {
        eintrag.kopien += 1;
      }
      return { ...werte(eintrag), neu };
    },
    // 3 gleiche = +1 Stern: die Fähigkeit selbst plus 2 Kopien.
    mergbar: (id) => {
      if (api.sterneOffen && !api.sterneOffen()) return false;
      const e = finde(id);
      return !!e && e.kopien >= 2 && e.sterne < d().maxSterne;
    },
    mergen(id) {
      if (api.sterneOffen && !api.sterneOffen()) return false;
      const e = finde(id);
      if (!e || e.kopien < 2 || e.sterne >= d().maxSterne) return false;
      e.kopien -= 2;
      e.sterne += 1;
      return true;
    },
    levelKaufen(id) {
      const e = finde(id);
      if (!e || e.level >= d().maxLevel || f().punkte < levelKosten(e)) return false;
      f().punkte -= levelKosten(e);
      e.level += 1;
      return true;
    },
    ausruesten(id) {
      if (!finde(id) || f().ausgeruestet.includes(id)) return false;
      if (f().ausgeruestet.length >= plaetze()) f().ausgeruestet.shift();
      f().ausgeruestet.push(id);
      return true;
    },
    ablegen(id) {
      f().ausgeruestet = f().ausgeruestet.filter((x) => x !== id);
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
      for (const id of aktiv) {
        const e = finde(id);
        const v = vorlage(id);
        if (!e || !v) continue;
        uhren[id] = (uhren[id] || 0) + sekunden;
        if (uhren[id] < v.abklingen) continue;
        uhren[id] = 0;
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
