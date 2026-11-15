// Zahlen lesbar machen (deutsche Schreibweise, Kurzformen ab 1.000.000).

const KURZ = [
  [1e15, "Brd."],
  [1e12, "Bio."],
  [1e9, "Mrd."],
  [1e6, "Mio."],
];

export function zahl(wert) {
  const n = Number.isFinite(wert) ? wert : 0;
  for (const [grenze, name] of KURZ) {
    if (n >= grenze) {
      return (n / grenze).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " " + name;
    }
  }
  if (n >= 100) return Math.floor(n).toLocaleString("de-DE");
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

export function btc(wert) {
  const n = Number.isFinite(wert) ? wert : 0;
  const stellen = n >= 1 ? 4 : n >= 0.001 ? 6 : 8;
  return n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

export function dauer(sekunden) {
  const s = Math.max(0, Math.floor(sekunden));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} Std. ${m} Min.`;
  if (m > 0) return `${m} Min.`;
  return `${s} Sek.`;
}
