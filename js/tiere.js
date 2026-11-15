// Tiere und Eier: Eier fallen im Kampf, schlüpfen im Brutkasten nach echter Zeit.
// Ein Tier kämpft mit, weitere Plätze (nach Level) sind Supporter mit Prozent-Bonus.

export function tierSystem(api) {
  const d = () => api.daten();
  const t = () => api.seite().tiere;
  const finde = (nr) => t().sammlung.find((x) => x.nr === nr);

  function wuerfeln(ratio) {
    const gewichte = api.seltenheiten().map((_, i) => Math.pow(ratio, -i));
    let z = Math.random() * gewichte.reduce((a, b) => a + b, 0);
    for (let i = 0; i < gewichte.length; i++) {
      z -= gewichte[i];
      if (z < 0) return i;
    }
    return 0;
  }

  function werte(tier) {
    if (!tier) return null;
    const vorlage = d().tiere.find((x) => x.id === tier.id);
    if (!vorlage) return null;
    const selten = api.seltenheiten()[tier.seltenheit] || api.seltenheiten()[0];
    const faktor = selten.faktor * api.zeitalterStaerke(vorlage.zeitalter);
    return {
      nr: tier.nr,
      id: vorlage.id,
      name: vorlage.name,
      seltenheit: selten,
      schaden: vorlage.schaden * faktor,
      leben: vorlage.leben * faktor,
      supporterArt: vorlage.supporter.art,
      supporterProzent: vorlage.supporter.prozent * selten.faktor,
      staerke: (vorlage.schaden * 5 + vorlage.leben) * faktor,
    };
  }

  function plaetze() {
    const level = api.level();
    return Math.max(0, d().plaetzeAbLevel.filter((ab) => level >= ab).length - 1);
  }

  const schluepfZeit = (seltenheit) => {
    const zeiten = d().schluepfSekunden;
    return zeiten[Math.min(seltenheit, zeiten.length - 1)] * 1000;
  };

  function starten(basis) {
    const ei = t().eier.shift();
    t().brut = { ei, fertigUm: basis + schluepfZeit(ei.seltenheit) };
  }

  function schluepfen(ei) {
    let auswahl = d().tiere.filter((x) => x.zeitalter === ei.zeitalter);
    if (!auswahl.length) auswahl = d().tiere;
    const vorlage = auswahl[Math.floor(Math.random() * auswahl.length)];
    const tier = { nr: t().naechsteNr, id: vorlage.id, seltenheit: ei.seltenheit };
    t().naechsteNr += 1;
    t().sammlung.push(tier);
    if (t().kaempfer === null) t().kaempfer = tier.nr;
    return werte(tier);
  }

  function ausTeam(nr) {
    if (t().kaempfer === nr) t().kaempfer = null;
    t().supporter = t().supporter.filter((x) => x !== nr);
  }

  return {
    werte,
    finde,
    plaetze,
    plaetzeAbLevel: () => d().plaetzeAbLevel,
    // Würfelt nach einem Sieg, ob ein Ei fällt. typ: schwach, normal, elite oder boss.
    eiWurf(typ) {
      if (Math.random() >= (d().eiChance[typ] || 0)) return null;
      if (t().eier.length >= d().eierLagerMax) return null;
      const ratio = typ === "boss" ? d().eiRatio.boss : d().eiRatio.normal;
      const ei = { zeitalter: api.zeitalterId(), seltenheit: wuerfeln(ratio) };
      t().eier.push(ei);
      return { seltenheit: api.seltenheiten()[ei.seltenheit] };
    },
    // Brutkasten weiterlaufen lassen; gibt die neu geschlüpften Tiere zurück.
    schritt(jetzt) {
      const neu = [];
      let grenze = 50;
      while (grenze-- > 0) {
        const b = t();
        if (b.brut) {
          if (jetzt < b.brut.fertigUm) break;
          const fertig = b.brut.fertigUm;
          neu.push(schluepfen(b.brut.ei));
          b.brut = null;
          if (b.eier.length) starten(fertig);
        } else if (b.eier.length) {
          starten(jetzt);
        } else break;
      }
      return neu;
    },
    brutInfo(jetzt) {
      const b = t().brut;
      if (!b) return null;
      return {
        seltenheit: api.seltenheiten()[b.ei.seltenheit],
        restSekunden: Math.max(0, (b.fertigUm - jetzt) / 1000),
      };
    },
    bonus() {
      const k = werte(finde(t().kaempfer));
      const bonus = { schaden: k ? k.schaden : 0, leben: k ? k.leben : 0, schadenProzent: 0, lebenProzent: 0 };
      for (const nr of t().supporter.slice(0, plaetze())) {
        const s = werte(finde(nr));
        if (!s) continue;
        if (s.supporterArt === "schaden") bonus.schadenProzent += s.supporterProzent;
        else bonus.lebenProzent += s.supporterProzent;
      }
      return bonus;
    },
    alsKaempfer(nr) {
      if (!finde(nr)) return;
      ausTeam(nr);
      t().kaempfer = nr;
    },
    alsSupporter(nr) {
      if (!finde(nr) || plaetze() === 0) return false;
      ausTeam(nr);
      t().supporter.push(nr);
      while (t().supporter.length > plaetze()) t().supporter.shift();
      return true;
    },
    herausnehmen: ausTeam,
  };
}
