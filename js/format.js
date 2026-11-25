// Zahlen lesbar machen (deutsche Schreibweise, Kurzformen ab 1.000: 1,5k, 2M, 3a …).

// Harry 25.11.2026 (Arbeitsanweisung Umbau): 1 bis 999 direkt, dann 1k/10k/100k, ab 1 Million sofort M (1M/10M/100M),
// danach Buchstaben: 1a bis 100z (je Buchstabe ×1000), dann 1aa, 1ab … Nie „1000k“: wer auf 1000 rundet, rutscht eine Einheit hoch.
// Bitcoin bleibt bei der eigenen Schreibweise (21-Mio.-Grenze, siehe btc()).
function einheit(stufe) {
  // stufe 1 = k (10^3), 2 = M (10^6), 3 = a (10^9) … 28 = z, 29 = aa, 30 = ab …
  if (stufe === 1) return "k";
  if (stufe === 2) return "M";
  const i = stufe - 3;
  if (i < 26) return String.fromCharCode(97 + i);
  const j = i - 26;
  return String.fromCharCode(97 + (Math.floor(j / 26) % 26)) + String.fromCharCode(97 + (j % 26));
}

export function zahl(wert) {
  const n = Number.isFinite(wert) ? wert : 0;
  if (n < 0) return "-" + zahl(-n);
  if (n >= 1000) {
    let stufe = Math.floor(Math.log10(n) / 3);
    let v = n / Math.pow(1000, stufe);
    if (v < 1) {
      // Fließkomma-Ungenauigkeit bei log10: eine Stufe zurück.
      stufe -= 1;
      v = n / Math.pow(1000, stufe);
    }
    // Stellen: unter 10 zwei Nachkommastellen, unter 100 eine, sonst keine (1,25k · 12,5k · 125k).
    const stellen = v < 10 ? 2 : v < 100 ? 1 : 0;
    // Rundet die Zahl auf 1000 (z. B. 999,99k), dann die nächste Einheit: 1M statt 1000k.
    if (Math.round(v * Math.pow(10, stellen)) >= 1000 * Math.pow(10, stellen)) {
      stufe += 1;
      v = n / Math.pow(1000, stufe);
    }
    return v.toLocaleString("de-DE", { maximumFractionDigits: v < 10 ? 2 : v < 100 ? 1 : 0 }) + einheit(stufe);
  }
  if (n >= 100) return Math.floor(n).toLocaleString("de-DE");
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

export function btc(wert) {
  const n = Number.isFinite(wert) ? wert : 0;
  const stellen = n >= 1 ? 4 : n >= 0.001 ? 6 : 8;
  return n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

// Zeit sekundengenau (Harry 16.11.2026), z. B. "1 Std. 27 Min. 05 Sek." oder "3 Min. 09 Sek.".
export function dauer(sekunden) {
  const s = Math.max(0, Math.floor(sekunden));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sek = String(s % 60).padStart(2, "0");
  if (h > 0) return `${h} Std. ${String(m).padStart(2, "0")} Min. ${sek} Sek.`;
  if (m > 0) return `${m} Min. ${sek} Sek.`;
  return `${s % 60} Sek.`;
}
