// Zahlen lesbar machen (deutsche Schreibweise, Kurzformen ab 1.000: 1,5 k, 2 Mio.).

// Harry 16.11.2026: ab 1.000 als k, dann die deutschen Namen bis Quadrillion, danach Buchstaben wie im Idle-Spiel
// (aa, ab … az, ba …), damit es nie aufhört. Gilt für alle großen Werte (Schaden, Leben, Währung …), nicht für Prozent.
const KURZ = ["k", "Mio.", "Mrd.", "Bio.", "Brd.", "Trill.", "Trd.", "Quadr."]; // 10^3 … 10^24

function einheit(stufe) {
  // stufe 1 = Tausend, 2 = Million … ab 9 (10^27) Buchstaben: 9 → aa, 10 → ab …
  if (stufe <= KURZ.length) return KURZ[stufe - 1];
  const i = stufe - KURZ.length - 1;
  return String.fromCharCode(97 + (Math.floor(i / 26) % 26)) + String.fromCharCode(97 + (i % 26));
}

export function zahl(wert) {
  const n = Number.isFinite(wert) ? wert : 0;
  if (n >= 1000) {
    let stufe = Math.floor(Math.log10(n) / 3);
    let v = n / Math.pow(1000, stufe);
    if (v < 1) {
      // Fließkomma-Ungenauigkeit bei log10: eine Stufe zurück.
      stufe -= 1;
      v = n / Math.pow(1000, stufe);
    }
    // Rundet die Zahl auf 1000 (z. B. 999,999 k), dann lieber die nächste Einheit: 1 Mio. statt 1.000 k.
    if (Math.round(v * 100) >= 100000) {
      stufe += 1;
      v = n / Math.pow(1000, stufe);
    }
    return v.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " " + einheit(stufe);
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
