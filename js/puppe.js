// Der Held als Puppe (Harry 18.11.2026): Körper aus starren Bildteilen (Oberkörper mit Kopf, Arme, Beine, Schwert, Schild),
// der Code dreht die Teile an den Gelenken. Ein Charakter für Gut und Böse, nur die Rüstung (Zeitalter) ändert sich.
// Bilder: bilder/puppe/z1 … z6 (Steinzeit bis Mittelalter). Ab Zeitalter 7 und im Sattel bleibt das alte Bild aus grafik.js.
// Die Zahlen für Lage und Gelenke stammen aus dem Brain (Held-Puppe-Paket/V2-Teile, Vorschau Version 27).

const TEILE = ["torso", "uarm", "farm", "larm", "thigh", "shin", "shield", "sword"];
const ZEITALTER = {
  1: { // Steinzeit
    torso: [11.44140625, 34.013671875], uarm: [-51.291015625, -33.45703125], farm: [-51.291015625, -20.546875], larm: [-49.518046875, -24.40734375],
    thigh: [-46.65234375, -20.1171875], shin: [-54.953125, -15.60546875], shield: [-25.2378125, -120.09734375], sword: [-32.816015625, -222.77734375],
  },
  2: { // Muscheln
    torso: [12.271484375, 17.412109375], uarm: [-42.990234375, -30.966796875], farm: [-49.630859375, -20.546875], larm: [-44.537578125, -22.7471875],
    thigh: [-37.521484375, -17.626953125], shin: [-45.822265625, -15.60546875], shield: [-52.63039062, -118.4371875], sword: [-27.835546875, -221.1171875],
  },
  3: { // Bronzezeit (alte Fassung mit Helmabdruck, neue folgt)
    torso: [13.1015625, 0.810546875], uarm: [-42.990234375, -30.966796875], farm: [-42.990234375, -20.546875], larm: [-43.7075, -22.7471875],
    thigh: [-37.521484375, -17.626953125], shin: [-40.841796875, -15.60546875], shield: [-15.98, -118.4371875], sword: [-25.3453125, -217.796875],
  },
  4: { // Münzen
    torso: [8.12109375, 29.86328125], uarm: [-44.650390625, -34.287109375], farm: [-44.650390625, -20.546875], larm: [-49.518046875, -26.0675],
    thigh: [-46.65234375, -20.947265625], shin: [-52.462890625, -15.60546875], shield: [-25.2378125, -121.7575], sword: [-40.28671875, -222.77734375],
  },
  5: { // Rom
    torso: [4.80078125, 4.9609375], uarm: [-44.650390625, -34.287109375], farm: [-44.650390625, -20.546875], larm: [-49.518046875, -26.0675],
    thigh: [-46.65234375, -20.947265625], shin: [-52.462890625, -15.60546875], shield: [-25.2378125, -121.7575], sword: [-34.476171875, -222.77734375],
  },
  6: { // Mittelalter
    torso: [9.78125, 7.451171875], uarm: [-45.48046875, -33.45703125], farm: [-45.48046875, -20.546875], larm: [-56.98875, -26.0675],
    thigh: [-51.6328125, -21.77734375], shin: [-47.482421875, -15.60546875], shield: [-25.2378125, -121.7575], sword: [-48.5875, -224.4375],
  },
};
const S = 0.830078125; // Maßstab aller Teile
const HUEFTE = [90, 410];
const ANGRIFF_S = 0.5; // Dauer eines Schlags in Sekunden
const PUPPEN_MASSSTAB = 0.64;
// Innere Zeichenfläche (Pixel) und wie hoch der stehende Körper darin ist; oben bleibt Platz für das erhobene Schwert.
const BW = 320, BH = 380, KOERPER_H = 250, FUSS_Y = 376;

export function puppeSystem() {
  const bilder = {}; // bilder[za][teil] = Image, dunkel[za].(thigh|shin|larm) = Canvas
  const dunkel = {};
  const mass = {};   // mass[za] = { sk, ox, oy }  (Skalierung und Verschiebung, damit der stehende Körper passt)
  let geladen = 0, gesamt = 0, fertig = false;
  const warten = [];
  let canvas = null, x = null, figurEl = null, za = 0;
  let t = 0, amp = 0, ziel = 0, atkT = -1, blockT = -1, blkHalten = false, last = 0, laeuft = false, schleife = false;

  const verfuegbar = (nr) => !!ZEITALTER[nr] && (!fertig || !!mass[nr]);

  function abdunkeln(img, f) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = `rgba(0,0,0,${1 - f})`;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function laden() {
    for (const nr of Object.keys(ZEITALTER)) {
      bilder[nr] = {};
      for (const teil of TEILE) {
        gesamt++;
        const i = new Image();
        let versuche = 0;
        const quelle = `bilder/puppe/z${nr}/${teil}.png`;
        i.onload = () => { if (++geladen === gesamt) bereitMachen(); };
        // Bricht eine Verbindung ab, wird das Bild noch zweimal geholt; sonst fehlt dieses Zeitalter (altes Bild bleibt).
        i.onerror = () => {
          if (versuche++ < 2) setTimeout(() => { i.src = quelle + "?neu=" + versuche; }, 400 * versuche);
          else if (++geladen === gesamt) bereitMachen();
        };
        i.src = quelle;
        bilder[nr][teil] = i;
      }
    }
  }

  function bereitMachen() {
    for (const nr of Object.keys(ZEITALTER)) {
      const b = bilder[nr];
      if (!TEILE.every((n) => b[n].complete && b[n].naturalWidth > 0)) continue;
      dunkel[nr] = { thigh: abdunkeln(b.thigh, 0.72), shin: abdunkeln(b.shin, 0.72), larm: abdunkeln(b.larm, 0.88) };
      // Maße des stehenden Körpers messen und auf die Zeichenfläche abbilden.
      const m = document.createElement("canvas");
      m.width = 420; m.height = 520;
      const g = m.getContext("2d");
      zeichne(g, +nr, 0, 0, -1, 0, 0);
      const d = g.getImageData(0, 0, 420, 520).data;
      let x0 = 420, x1 = 0, y0 = 520, y1 = 0;
      for (let yy = 0; yy < 520; yy++) for (let xx = 0; xx < 420; xx++) if (d[(yy * 420 + xx) * 4 + 3] > 20) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      // Der Körper wurde mit Maßstab 0.64 und Verschiebung (120|10) gemessen. Jetzt wird er auf KOERPER_H Pixel gebracht.
      const sk = (PUPPEN_MASSSTAB * KOERPER_H) / Math.max(1, y1 - y0);
      const mitteU = ((x0 + x1) / 2 - 120) / PUPPEN_MASSSTAB; // Mitte in Teile-Einheiten
      const bodenU = (y1 - 10) / PUPPEN_MASSSTAB;             // Unterkante in Teile-Einheiten
      mass[nr] = { sk, ox: BW / 2 - mitteU * sk, oy: FUSS_Y - bodenU * sk };
    }
    fertig = true;
    for (const f of warten.splice(0)) f();
  }

  const D = (g, nr, n) => {
    const i = bilder[nr][n], p = ZEITALTER[nr][n];
    g.drawImage(i, p[0], p[1], i.width * S, i.height * S);
  };
  const Dd = (g, nr, n) => {
    const i = dunkel[nr] ? dunkel[nr][n] : bilder[nr][n], p = ZEITALTER[nr][n];
    g.drawImage(i, p[0], p[1], i.width * S, i.height * S);
  };
  const weich = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

  function bein(g, nr, p, hx, hy, hinten, a) {
    const sn = Math.sin(p);
    const th = a * (sn > 0 ? -0.45 * sn : -0.45 * sn * 0.45);
    const rel = a * (0.3 * sn + 0.95 * Math.pow(Math.max(0, Math.cos(p)), 1.4));
    g.save(); g.translate(hx, hy); g.rotate(th);
    g.save(); g.translate(0, 120); g.rotate(rel); (hinten ? Dd : D)(g, nr, "shin"); g.restore();
    (hinten ? Dd : D)(g, nr, "thigh");
    g.restore();
  }
  function arm(g, nr, sh, el, sx, sy) {
    g.save(); g.translate(sx, sy); g.rotate(sh);
    g.save(); g.translate(0, 95); g.rotate(el);
    g.save(); g.translate(17, 115); g.rotate(2.0); D(g, nr, "sword"); g.restore();
    D(g, nr, "farm"); g.restore();
    D(g, nr, "uarm"); g.restore();
  }
  function linkerArm(g, nr, vorn, blk, tt, a) {
    const SS = 0.31, sh = -0.5 - 0.65 * blk + 0.03 * Math.sin(tt) * a;
    g.save(); g.translate(46, 205); g.rotate(sh);
    if (!vorn) Dd(g, nr, "larm");
    else { g.translate(240 * SS, 575 * SS); g.rotate(-sh); g.translate(6, -2); D(g, nr, "shield"); }
    g.restore();
  }

  // Zeichnet die Puppe in den Zeichner g. Wird zum Messen (ohne Verschiebung) und zum Anzeigen benutzt.
  function zeichne(g, nr, tt, a, atk, blk, ruhe, sk, ox, oy) {
    const k = sk || PUPPEN_MASSSTAB;
    g.save();
    if (sk) g.translate(ox, oy); else g.translate(120, 10);
    g.scale(k, k);
    const bob = -Math.abs(Math.cos(tt)) * 6 * a + Math.sin(ruhe / 650) * 1.6 * (1 - a);
    g.translate(0, bob);
    let lean = 0.03 * Math.sin(tt) * a, sh = 0.38 * Math.sin(tt) * a, el = -0.35 * a - 0.08 * (1 - a);
    if (atk >= 0) {
      // Kurzes Ausholen: der Arm geht nur bis über den Kopf, dann schlägt er von oben nach unten nach vorn.
      const u = atk / ANGRIFF_S;
      if (u < 0.38) { const e = weich(u / 0.38); sh = 2.5 * e; el = -0.6 * e; lean = -0.05 * e; }
      else { const q = Math.pow((u - 0.38) / 0.62, 0.7); sh = 2.5 + 1.9 * Math.min(1, q * 1.15); el = -0.6 * (1 - Math.min(1, q * 2)); lean = -0.05 + 0.16 * Math.sin(Math.min(1, q) * Math.PI * 0.9); }
    }
    const [hx, hy] = HUEFTE;
    const aa = Math.max(a, 0.001);
    bein(g, nr, tt, hx - 8, hy, true, aa);
    bein(g, nr, tt + Math.PI, hx + 8, hy, false, aa);
    g.save(); g.translate(hx, hy); g.rotate(lean); g.translate(-hx, -hy);
    linkerArm(g, nr, false, blk, tt, a);
    D(g, nr, "torso");
    linkerArm(g, nr, true, blk, tt, a);
    arm(g, nr, sh, el, 40, 200);
    g.restore();
    g.restore();
  }

  function bild(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!canvas || !fertig || !mass[za]) return;
    amp += (ziel - amp) * Math.min(1, dt * 7);
    t += dt * 1.0 * (5 + 2.5 * amp) * (0.15 + 0.85 * amp);
    if (atkT >= 0) { atkT += dt; if (atkT > ANGRIFF_S) atkT = -1; }
    let blk = 0;
    if (blockT >= 0) { blockT += dt; if (blockT > 0.7) blockT = -1; else blk = blockT < 0.15 ? blockT / 0.15 : blockT < 0.45 ? 1 : 1 - (blockT - 0.45) / 0.25; }
    if (blkHalten) blk = 1;
    x.clearRect(0, 0, BW, BH);
    const m = mass[za];
    zeichne(x, za, t, amp, atkT, blk, now, m.sk, m.ox, m.oy);
  }

  function schleifeStarten() {
    if (schleife) return;
    schleife = true;
    const lauf = (now) => {
      if (!schleife) return;
      if (!document.hidden && canvas) bild(now);
      else last = now;
      requestAnimationFrame(lauf);
    };
    requestAnimationFrame((n) => { last = n; lauf(n); });
  }

  return {
    verfuegbar,
    // Puppe in die Figur setzen (Zeitalter nr). Vorher muss das Element .figur.spieler sein.
    zeigen(el, nr) {
      const los = () => {
        if (!mass[nr]) return;
        figurEl = el;
        if (!canvas) {
          canvas = document.createElement("canvas");
          canvas.className = "puppe-bild";
          canvas.width = BW; canvas.height = BH;
          canvas.setAttribute("aria-hidden", "true");
          x = canvas.getContext("2d");
        }
        if (canvas.parentNode !== el) el.append(canvas);
        za = nr;
        el.classList.add("puppe");
        schleifeStarten();
      };
      if (fertig) los(); else warten.push(los);
    },
    weg() {
      if (canvas && canvas.parentNode) canvas.remove();
      if (figurEl) figurEl.classList.remove("puppe");
      za = 0;
    },
    aktiv: () => za > 0 && !!canvas && !!canvas.parentNode,
    laufen(an) { ziel = an ? 1 : 0; },
    schlag() { atkT = 0; },
    block() { blockT = 0; },
    blockHalten(an) { blkHalten = !!an; },
    // Stehbild als CSS-Hintergrund (für Kopfzeile und Info-Fenster).
    standbild(nr) {
      if (!fertig || !mass[nr]) return null;
      const c = document.createElement("canvas");
      c.width = 200; c.height = 260;
      const g = c.getContext("2d");
      const m = mass[nr];
      // Körper (KOERPER_H hoch) in 200x260 einpassen.
      zeichne(g, nr, 0, 0, -1, 0, 0, m.sk, m.ox - (BW / 2 - 100), m.oy - (FUSS_Y - 252));
      return `url("${c.toDataURL("image/png")}")`;
    },
    bereit(f) { if (fertig) f(); else warten.push(f); },
    start: laden,
  };
}
