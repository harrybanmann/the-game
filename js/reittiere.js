// Reittiere (Harry 16.11.2026): Der Held reitet im Kampf. Ein Reittier gibt Angriffstempo:
// je später das Zeitalter, je seltener und je mehr Sterne, desto schneller schießt und schlägt der Held.
// Reittiere schlüpfen manchmal statt eines Haustiers aus einem Ei. 3 gleiche werden zu 1 mit +1 Stern.

export function reittierSystem(api) {
  const d = () => api.daten();
  const r = () => api.seite().reittiere;
  const finde = (nr) => r().sammlung.find((x) => x.nr === nr);

  function werte(tier) {
    if (!tier) return null;
    const vorlage = d().liste.find((x) => x.id === tier.id);
    if (!vorlage) return null;
    const c = d().tempo;
    const sterne = tier.sterne || 0;
    const tempo = Math.min(
      c.max,
      (c.grund + c.jeZeitalter * (api.zeitalterNummerVon(vorlage.zeitalter) - 1)) * (1 + c.jeSeltenheit * tier.seltenheit) * (1 + c.jeStern * sterne) *
        (api.haendlerFaktor ? api.haendlerFaktor() : 1)
    );
    // Zweiter Bonus (Harry 16.11.2026): Heilung oder mehr Drop-Chance, wächst wie das Tempo.
    const zb = d().zweitBonus || { werte: {} };
    const bonusArt = vorlage.bonus || null;
    const bonusWert = bonusArt ? (zb.werte[bonusArt] || 0) * (1 + zb.jeSeltenheit * tier.seltenheit) * (1 + zb.jeStern * sterne) * (api.haendlerFaktor ? api.haendlerFaktor() : 1) : 0;
    return {
      nr: tier.nr,
      id: vorlage.id,
      bonusArt,
      bonusWert,
      name: vorlage.name,
      zeitalter: vorlage.zeitalter,
      seltenheit: api.seltenheiten()[tier.seltenheit] || api.seltenheiten()[0],
      sterne,
      rang: tier.seltenheit,
      zeitalterNr: api.zeitalterNummerVon(vorlage.zeitalter),
      tempo,
    };
  }

  const gleiche = (tier) =>
    r().sammlung.filter((x) => x !== tier && x.id === tier.id && x.seltenheit === tier.seltenheit && (x.sterne || 0) === (tier.sterne || 0));

  function wuerfeln(ratio) {
    const gewichte = api.seltenheiten().map((_, i) => Math.pow(ratio, -i));
    let z = Math.random() * gewichte.reduce((a, b) => a + b, 0);
    for (let i = 0; i < gewichte.length; i++) {
      z -= gewichte[i];
      if (z < 0) return i;
    }
    return 0;
  }

  // Legt ein neues Reittier eines Zeitalters an und sattelt es, wenn es schneller ist.
  function neuesTier(zId, seltenheit) {
    let auswahl = d().liste.filter((x) => x.zeitalter === zId);
    if (!auswahl.length) auswahl = d().liste;
    const vorlage = auswahl[Math.floor(Math.random() * auswahl.length)];
    const tier = { nr: r().naechsteNr, id: vorlage.id, seltenheit, sterne: 0 };
    r().naechsteNr += 1;
    r().sammlung.push(tier);
    const neu = werte(tier);
    const jetzt = werte(finde(r().aktiv));
    if (!jetzt || neu.tempo > jetzt.tempo) r().aktiv = tier.nr;
    return { ...neu, reittier: true };
  }

  function besteNehmen() {
    const beste = r().sammlung.map(werte).filter(Boolean).sort((a, b) => b.tempo - a.tempo)[0];
    r().aktiv = beste ? beste.nr : null;
  }

  return {
    werte,
    finde,
    aktiv: () => werte(finde(r().aktiv)),
    tempo() {
      const a = werte(finde(r().aktiv));
      return a ? a.tempo : 0;
    },
    liste: () =>
      r()
        .sammlung.map(werte)
        .filter(Boolean)
        .sort((a, b) => b.rang - a.rang || b.zeitalterNr - a.zeitalterNr || b.sterne - a.sterne || b.tempo - a.tempo),
    // Wird beim Schlüpfen gefragt: mit etwas Glück kommt ein Reittier statt eines Haustiers.
    ausEi(ei) {
      if (Math.random() >= d().eiChance) return null;
      return neuesTier(ei.zeitalter, ei.seltenheit);
    },
    // Harry 16.11.2026: Reittiere fallen selten auch direkt bei Gegnern.
    geben: (zId) => neuesTier(zId, wuerfeln(d().beuteRatio || 5)),
    // Zweiter Bonus des gesattelten Reittiers für eine Art (heilung, schluessel, eier, fpunkte), sonst 0.
    bonus(art) {
      const a = werte(finde(r().aktiv));
      return a && a.bonusArt === art ? a.bonusWert : 0;
    },
    satteln(nr) {
      if (finde(nr)) r().aktiv = nr;
    },
    // 3 gleiche werden zur nächsten Seltenheit; erst ganz oben gibt es (im Endgame) Sterne.
    mergbar(nr) {
      const tier = finde(nr);
      if (!tier || gleiche(tier).length < 2) return false;
      if (tier.seltenheit < api.seltenheiten().length - 1) return true;
      return (!api.sterneOffen || api.sterneOffen()) && (tier.sterne || 0) < d().maxSterne;
    },
    mergen(nr) {
      if (!this.mergbar(nr)) return false;
      const tier = finde(nr);
      const war = r().aktiv;
      const weg = gleiche(tier).sort((a, b) => (a.nr === war ? 1 : 0) - (b.nr === war ? 1 : 0)).slice(0, 2);
      r().sammlung = r().sammlung.filter((x) => !weg.includes(x));
      if (tier.seltenheit < api.seltenheiten().length - 1) tier.seltenheit += 1;
      else tier.sterne = (tier.sterne || 0) + 1;
      if (!finde(war)) besteNehmen();
      return true;
    },
    // Mergt alles, was geht. Gibt die Zahl der Merges zurück.
    allesMergen() {
      let n = 0;
      for (let i = 0; i < 500; i++) {
        const tier = r().sammlung.find((x) => this.mergbar(x.nr));
        if (!tier) break;
        this.mergen(tier.nr);
        n += 1;
      }
      return n;
    },
  };
}
