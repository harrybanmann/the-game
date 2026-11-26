// Welt-Hintergrund (Harry 26.11.2026): Gemini-Bilder je Zeitalter, Tag (Beschützer) und Nacht (Dieb).
// Vier Ebenen wie in der Grafik-Vorschau „Welt-Alle-Zeitalter“: far (Berge/Himmel), clouds, mid (Häuser auf Magenta), road.
// Die Ebenen ziehen verschieden schnell vorbei, solange der Held läuft; die Wolken ziehen immer langsam.
// Dateien: bilder/welt/z<Zeitalter><t|n>-<far|mid|clouds|road>.jpg

let canvas = null;
let g = null;
let szeneEl = null;
let welt = null; // aufbereitete Ebenen des aktuellen Zeitalters
let schluessel = "";
let laeuft = false;
let versatz = 0;
let wolkenVersatz = 0;
let zuletzt = 0;
let schleife = false;
let version = "";
const cache = {};

function laden(src) {
  return new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
  });
}
function kopie(img, sx, sy, sw, sh) {
  const k = document.createElement("canvas");
  k.width = sw;
  k.height = sh;
  k.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return k;
}
// Beginn des einfarbigen Bodenbandes unten im Bild (y und Farbe).
function band(img) {
  const k = kopie(img, 0, 0, img.width, img.height);
  const q = k.getContext("2d");
  const w = k.width;
  const h = k.height;
  const zeile = (y) => {
    const d = q.getImageData(0, y, w, 1).data;
    let r = 0, gg = 0, b = 0, n = 0, v = 0;
    for (let x = 0; x < w; x += 4) { r += d[x * 4]; gg += d[x * 4 + 1]; b += d[x * 4 + 2]; n++; }
    r /= n; gg /= n; b /= n;
    for (let x = 0; x < w; x += 4) v += Math.abs(d[x * 4] - r) + Math.abs(d[x * 4 + 1] - gg) + Math.abs(d[x * 4 + 2] - b);
    return { r, gg, b, v: v / n };
  };
  const unten = zeile(h - 2);
  let y = h - 2;
  while (y > h * 0.5) {
    const a = zeile(y - 1);
    if (a.v > 9 || Math.abs(a.r - unten.r) + Math.abs(a.gg - unten.gg) + Math.abs(a.b - unten.b) > 40) break;
    y--;
  }
  return { y: y < h - 4 ? y : Math.round(h * 0.93), farbe: `rgb(${unten.r | 0},${unten.gg | 0},${unten.b | 0})` };
}
// Wolken: dunkler Hintergrund wird durchsichtig.
function dunkelWeg(img, lo, span) {
  const h = Math.round(img.height * 0.66);
  const k = kopie(img, 0, 0, img.width, h);
  const q = k.getContext("2d");
  const D = q.getImageData(0, 0, k.width, h);
  const d = D.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.max(d[i], d[i + 1], d[i + 2]);
    d[i + 3] = Math.max(0, Math.min(1, (m - lo) / span)) * 255;
  }
  q.putImageData(D, 0, 0);
  return k;
}
// Häuser-Ebene: Magenta-Himmel wird durchsichtig (Z1 Tag mit Ausbesserung wie in der Vorschau).
function magentaWeg(img, fix) {
  const w = img.width;
  const h = img.height;
  const k = kopie(img, 0, 0, w, h);
  const q = k.getContext("2d");
  const D = q.getImageData(0, 0, w, h);
  const d = D.data;
  if (fix && w >= 760 && h >= 420) {
    const S = new Uint8ClampedArray(d);
    const P = (x, y) => { const o = (y * w + x) * 4; return Math.max(Math.min(S[o], S[o + 2]) - S[o + 1], (S[o] + S[o + 2]) / 2 - S[o + 1] - 5); };
    for (let y = 296; y < 420; y++) for (let x = 540; x < 755; x++) {
      const top = x < 600 ? 314 + (600 - x) * 0.8 : 306;
      if (y < top) continue;
      const o = (y * w + x) * 4;
      if (P(x, y) <= 10) continue;
      let sx = x - 170;
      if (P(sx, y) > 14) sx = x - 250;
      const so = (y * w + sx) * 4;
      if (P(sx, y) > 14) { d[o] = 104; d[o + 1] = 98; d[o + 2] = 78; } else { d[o] = S[so]; d[o + 1] = S[so + 1]; d[o + 2] = S[so + 2]; }
    }
  }
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gr = d[i + 1], b = d[i + 2];
    const pink = Math.min(r, b) - gr;
    const a = fix ? 1 - Math.min(1, Math.max(0, (pink - 14) / 60)) : 1 - Math.min(1, Math.max(0, (pink - 22) / 90));
    if (a < 0.15) { d[i + 3] = 0; continue; }
    if (a < 1) { const cut = Math.max(0, pink - 8); d[i] = Math.max(0, r - cut); d[i + 2] = Math.max(0, b - cut); }
    d[i + 3] = Math.round(a * 255);
  }
  q.putImageData(D, 0, 0);
  return k;
}

async function aufbereiten(nr, t) {
  const k = nr + t;
  if (cache[k]) return cache[k];
  cache[k] = (async () => {
    const p = `bilder/welt/z${nr}${t}-`;
    const [far, mid, wolken, weg] = await Promise.all(["far", "mid", "clouds", "road"].map((n) => laden(p + n + ".jpg?v=" + version)));
    if (!far && !mid && !weg) return null;
    const w = { far, weg };
    if (far) w.farBand = band(far);
    if (mid) { w.midBand = band(mid); w.mid = magentaWeg(mid, nr === 1 && t === "t"); }
    if (wolken) w.wolken = t === "t" ? dunkelWeg(wolken, 46, 46) : dunkelWeg(wolken, 36, 26);
    return w;
  })();
  return cache[k];
}

function kacheln(img, x0, y, b, h, breite) {
  if (b < 2 || h < 1) return;
  const o = ((x0 % b) + b) % b;
  for (let x = -o; x < breite; x += b) g.drawImage(img, x, y, b, h);
}

// Bodenlinie: Unterkante der Arena (dort stehen die Füße), gemessen in CSS-Pixeln der Szene.
function bodenY(hoehe) {
  const arena = document.getElementById("arena");
  if (!arena || !szeneEl) return hoehe * 0.8;
  const a = arena.getBoundingClientRect();
  const s = szeneEl.getBoundingClientRect();
  return Math.min(hoehe - 8, Math.max(hoehe * 0.5, a.bottom - s.top - 6));
}

function zeichnen() {
  if (!canvas || !welt) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const B = szeneEl.clientWidth;
  const H = szeneEl.clientHeight;
  if (!B || !H) return;
  if (canvas.width !== Math.round(B * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(B * dpr);
    canvas.height = Math.round(H * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = true;
  const boden = bodenY(H);
  // Maßstab wie in der Vorschau (dort Straße bei y=725): alles skaliert mit der Höhe bis zum Boden.
  const k = boden / 725;
  g.fillStyle = welt.nacht ? "#0c0f24" : "#cfe3f0";
  g.fillRect(0, 0, B, H);
  const w = welt.w;
  if (w.far) {
    const fb = w.farBand.y;
    const farH = 538 * k;
    const fw = (w.far.width * farH) / fb;
    // Berge sitzen unten an der Häuser-Linie, oben bleibt notfalls Himmel.
    const y0 = Math.max(0, boden - 187 * k - farH);
    g.fillStyle = w.farBand.farbe;
    g.fillRect(0, y0 + farH - 1, B, boden - (y0 + farH) + 2);
    kacheln(kopieOhneBand(w), versatz * 0.1 * k, y0, fw, farH, B);
  }
  if (w.wolken) {
    const cw = 1260 * k;
    const ch = Math.min((cw * w.wolken.height) / w.wolken.width, 260 * k);
    kacheln(w.wolken, wolkenVersatz * k, 40 * k, cw, ch, B);
  }
  if (w.mid) {
    const sc = (443 * k) / w.midBand.y;
    kacheln(w.mid, versatz * 0.4 * k, boden - w.midBand.y * sc, w.mid.width * sc, w.mid.height * sc, B);
  }
  if (w.weg) {
    const rh = Math.max(171 * k, H - boden);
    kacheln(w.weg, versatz * k, boden, (rh * w.weg.width) / w.weg.height, rh, B);
  }
}
// Berg-Bild ohne das Bodenband (einmal je Zeitalter zugeschnitten).
function kopieOhneBand(w) {
  if (!w.farOhne) w.farOhne = kopie(w.far, 0, 0, w.far.width, w.farBand.y);
  return w.farOhne;
}

function takt(jetzt) {
  const dt = Math.min(80, jetzt - (zuletzt || jetzt));
  zuletzt = jetzt;
  if (laeuft) versatz += (110 * dt) / 1000;
  wolkenVersatz += (10 * dt) / 1000;
  zeichnen();
  if (canvas && canvas.isConnected && welt) requestAnimationFrame(takt);
  else schleife = false;
}
function starten() {
  if (schleife) return;
  schleife = true;
  zuletzt = 0;
  requestAnimationFrame(takt);
}

export function weltVersion(v) {
  version = v;
}

// Zeigt die Welt für Zeitalter nr; nacht = Dieb-Seite. Gibt false zurück, wenn es keine Bilder gibt.
export async function weltZeigen(szene, nr, nacht) {
  szeneEl = szene;
  const t = nacht ? "n" : "t";
  const s = nr + t;
  if (s === schluessel && welt) return true;
  schluessel = s;
  const w = await aufbereiten(nr, t);
  if (schluessel !== s) return !!w; // inzwischen anderes Zeitalter gewählt
  if (!w) {
    welt = null;
    if (canvas) canvas.remove();
    canvas = null;
    szene.classList.remove("mit-welt");
    return false;
  }
  if (!canvas || !canvas.isConnected) {
    canvas = document.createElement("canvas");
    canvas.id = "welt";
    canvas.setAttribute("aria-hidden", "true");
    g = canvas.getContext("2d");
    szene.prepend(canvas);
  }
  welt = { w, nacht };
  szene.classList.add("mit-welt");
  starten();
  return true;
}

export function weltLaufen(an) {
  laeuft = !!an;
}
