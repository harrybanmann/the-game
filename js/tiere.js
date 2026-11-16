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
    const sterne = tier.sterne || 0;
    const stern = 1 + sterne * d().sternBonus;
    const faktor = selten.faktor * api.zeitalterStaerke(vorlage.zeitalter) * stern;
    return {
      nr: tier.nr,
      sterne,
      rang: tier.seltenheit,
      zeitalter: vorlage.zeitalter,
      id: vorlage.id,
      name: vorlage.name,
      seltenheit: selten,
      schaden: vorlage.schaden * faktor,
      leben: vorlage.leben * faktor,
      supporterArt: vorlage.supporter.art,
      supporterProzent: vorlage.supporter.prozent * (selten.prozent || selten.faktor) * stern, // Prozent-Boni bleiben flach
      staerke: (vorlage.schaden * 5 + vorlage.leben) * faktor,
    };
  }

  function plaetze() {
    const level = api.level();
    return Math.max(0, d().plaetzeAbLevel.filter((ab) => level >= ab).length - 1);
  }

  const schluepfZeit = (seltenheit) => {
    const zeiten = d().schluepfSekunden;
    return zeiten[Math.min(seltenheit, zeiten.length - 1)] * 1000 * api.schluepfFaktor();
  };

  // Brutplätze: am Anfang einer, weitere im Tech-Baum (Harry 16.11.2026).
  const brutPlaetze = () => Math.max(1, Math.min(d().brutPlaetzeMax || 1, api.brutPlaetze ? api.brutPlaetze() : 1));

  function starten(basis) {
    const ei = t().eier.shift();
    t().brueten.push({ ei, fertigUm: basis + schluepfZeit(ei.seltenheit) });
  }

  function schluepfen(ei) {
    // Manchmal schlüpft ein Reittier statt eines Haustiers.
    const reittier = api.reittierAusEi ? api.reittierAusEi(ei) : null;
    if (reittier) return reittier;
    let auswahl = d().tiere.filter((x) => x.zeitalter === ei.zeitalter);
    if (!auswahl.length) auswahl = d().tiere;
    const vorlage = auswahl[Math.floor(Math.random() * auswahl.length)];
    const tier = { nr: t().naechsteNr, id: vorlage.id, seltenheit: ei.seltenheit, sterne: 0 };
    t().naechsteNr += 1;
    t().sammlung.push(tier);
    if (t().kaempfer === null) t().kaempfer = tier.nr;
    return werte(tier);
  }

  function gleiche(nr) {
    const tier = finde(nr);
    if (!tier) return [];
    return t().sammlung.filter(
      (x) => x !== tier && x.id === tier.id && x.seltenheit === tier.seltenheit && (x.sterne || 0) === (tier.sterne || 0)
    );
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
      if (api.offen && !api.offen()) return null;
      if (Math.random() >= (d().eiChance[typ] || 0) * api.eiChanceFaktor()) return null;
      if (t().eier.length >= d().eierLagerMax + api.lagerPlus()) return null;
      const ratio = typ === "boss" ? d().eiRatio.boss : d().eiRatio.normal;
      const ei = { zeitalter: api.zeitalterId(), seltenheit: wuerfeln(ratio) };
      t().eier.push(ei);
      return { seltenheit: api.seltenheiten()[ei.seltenheit] };
    },
    // Für Dungeon-Belohnungen: ein sicheres Ei. plus hebt die Seltenheit an.
    eiGeben(ratio, plus) {
      const hoechste = api.seltenheiten().length - 1;
      const ei = { zeitalter: api.zeitalterId(), seltenheit: Math.min(hoechste, wuerfeln(ratio) + plus) };
      t().eier.push(ei);
      return api.seltenheiten()[ei.seltenheit];
    },
    // Brutkasten weiterlaufen lassen; gibt die neu geschlüpften Tiere zurück.
    schritt(jetzt) {
      const neu = [];
      const b = t();
      let grenze = 50;
      while (grenze-- > 0) {
        const i = b.brueten.findIndex((x) => jetzt >= x.fertigUm);
        if (i >= 0) {
          const fertig = b.brueten.splice(i, 1)[0];
          neu.push(schluepfen(fertig.ei));
          if (b.eier.length) starten(fertig.fertigUm);
        } else if (b.eier.length && b.brueten.length < brutPlaetze()) {
          starten(jetzt);
        } else break;
      }
      return neu;
    },
    brutPlaetze,
    brutListe(jetzt) {
      return t().brueten.map((b) => ({
        seltenheit: api.seltenheiten()[b.ei.seltenheit] || api.seltenheiten()[0],
        restSekunden: Math.max(0, (b.fertigUm - jetzt) / 1000),
      }));
    },
    bonus() {
      const k = werte(finde(t().kaempfer));
      const hf = api.haendlerFaktor ? api.haendlerFaktor() : 1; // Händler-Stufe für das Kämpfer-Tier
      const bonus = { schaden: k ? k.schaden * hf : 0, leben: k ? k.leben * hf : 0, schadenProzent: 0, lebenProzent: 0 };
      for (const nr of t().supporter.slice(0, plaetze())) {
        const s = werte(finde(nr));
        if (!s) continue;
        const p = s.supporterProzent * api.supporterFaktor();
        if (s.supporterArt === "schaden") bonus.schadenProzent += p;
        else bonus.lebenProzent += p;
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
    allesMergen() {
      let n = 0;
      for (let i = 0; i < 500; i++) {
        const tier = t().sammlung.find((x) => this.mergbar(x.nr));
        if (!tier) break;
        this.mergen(tier.nr);
        n += 1;
      }
      return n;
    },
    // Harry 16.11.2026: 3 gleiche Tiere werden zu einem Tier der nächsten Seltenheit, wie bei den Waffen.
    mergbar(nr) {
      const tier = finde(nr);
      if (!tier || gleiche(nr).length < 2) return false;
      if (tier.seltenheit < api.seltenheiten().length - 1) return true;
      return (!api.sterneOffen || api.sterneOffen()) && (tier.sterne || 0) < d().maxSterne;
    },
    // 3 gleiche Tiere (Art, Seltenheit, Sternzahl) werden zu 1 Tier der nächsten Seltenheit (ganz oben: +1 Stern).
    mergen(nr) {
      if (!this.mergbar(nr)) return false;
      const tier = finde(nr);
      const andere = gleiche(nr);
      const imTeam = (x) => (t().kaempfer === x.nr || t().supporter.includes(x.nr) ? 1 : 0);
      const weg = andere.sort((a, b) => imTeam(a) - imTeam(b)).slice(0, 2);
      for (const x of weg) ausTeam(x.nr);
      t().sammlung = t().sammlung.filter((x) => !weg.includes(x));
      if (tier.seltenheit < api.seltenheiten().length - 1) tier.seltenheit += 1;
      else tier.sterne = (tier.sterne || 0) + 1;
      return true;
    },
  };
}
