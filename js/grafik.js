// Selbst gezeichnete Bilder als SVG (Harry 16.11.2026: "selber zeichnen").
// Stil laut Brain: flacher, weicher Cartoon, dicke dunkle Umrisse, runde Formen, wenige Farbflächen.
// Alles wird aus wenigen Bausteinen erzeugt und mit den Farben des Zeitalters eingefärbt.

const U = "#2e1c12"; // Umriss
const S = `stroke="${U}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;
const S3 = `stroke="${U}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
const HAUT = ["#f3c9a0", "#e0a97a", "#c98958"];

const zwischen = new Map();
function alsBild(schluessel, bauen) {
  if (!zwischen.has(schluessel)) zwischen.set(schluessel, "url(\"data:image/svg+xml," + encodeURIComponent(bauen()) + "\")");
  return zwischen.get(schluessel);
}
const svg = (breite, hoehe, inhalt, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${breite} ${hoehe}" ${extra}>${inhalt}</svg>`;

// ---------- Figuren ----------
// o: { haut, kleid, kleid2, kopf: "haare"|"kapuze"|"helm"|"krone"|"flammen", maske, schild, waffe: "keule"|"speer"|null, akzent, gross }
function person(o) {
  const haut = o.haut || HAUT[0];
  let t = o.sitzt ? "" : `<ellipse cx="50" cy="114" rx="30" ry="5" fill="#000" opacity="0.22"/>`;
  if (o.aura) t += `<circle cx="50" cy="60" r="52" fill="${o.akzent}" opacity="0.28"/>`;
  // Umhang hinten
  if (o.umhang) t += `<path d="M24,58 Q8,96 20,108 L44,100 Z" fill="${o.umhang}" ${S}/>`;
  // Waffe hinter der Hand
  if (o.waffe === "keule")
    t += `<g transform="rotate(28 82 70)"><rect x="76" y="26" width="15" height="52" rx="7.5" fill="#9a6a3c" ${S}/><circle cx="83" cy="38" r="2.5" fill="${U}"/><circle cx="80" cy="50" r="2" fill="${U}"/></g>`;
  if (o.waffe === "speer")
    t += `<line x1="84" y1="104" x2="84" y2="14" stroke="${U}" stroke-width="9" stroke-linecap="round"/><line x1="84" y1="104" x2="84" y2="20" stroke="#9a6a3c" stroke-width="4" stroke-linecap="round"/><path d="M84,2 L93,22 L75,22 Z" fill="#c9ced6" ${S3}/>`;
  if (o.waffe === "bogen")
    t += `<path d="M84,44 Q104,72 84,100" fill="none" stroke="${U}" stroke-width="9" stroke-linecap="round"/><path d="M84,44 Q104,72 84,100" fill="none" stroke="#9a6a3c" stroke-width="4" stroke-linecap="round"/><path d="M84,44 V100" stroke="${U}" stroke-width="2.5"/>`;
  if (o.waffe === "blaster")
    t += `<rect x="74" y="64" width="26" height="10" rx="3" fill="#5a5f69" ${S3}/><rect x="76" y="72" width="8" height="12" rx="2" fill="#3a3f49" ${S3}/><circle cx="100" cy="69" r="3" fill="${o.akzent}"/>`;
  // Beine und Schuhe. Im Sattel: Oberschenkel nach vorn, Unterschenkel hängt herunter (man sieht das vordere Bein).
  if (o.sitzt) {
    t += `<rect x="40" y="84" width="34" height="15" rx="7" fill="${o.kleid2}" ${S}/><rect x="60" y="88" width="14" height="24" rx="6" fill="${o.kleid2}" ${S}/>`;
    t += o.stiefel
      ? `<path d="M58,104 h18 v8 h6 v6 h-24 z" fill="${o.stiefel}" ${S3}/><path d="M58,106 h18" stroke="${o.stiefelRand || U}" stroke-width="3"/>`
      : `<path d="M58,112 h22 v6 h-22 z" fill="#5a3a22" ${S3}/>`;
  } else {
    // Jedes Bein ist eine eigene Gruppe (Bein + Schuh), damit es beim Laufen schwingen kann.
    const bein = (x, schuhX, schuhB, [dx, dy, rot]) =>
      `<g transform="translate(${dx},${dy}) rotate(${rot} ${x + 7} 88)"><rect x="${x}" y="86" width="14" height="24" rx="3" fill="${o.kleid2}" ${S}/>` +
      (o.stiefel
        ? `<rect x="${schuhX}" y="98" width="${schuhB}" height="14" rx="3" fill="${o.stiefel}" ${S3}/><path d="M${schuhX + 1},101 h${schuhB - 2}" stroke="${o.stiefelRand || U}" stroke-width="3"/>`
        : `<rect x="${schuhX}" y="104" width="${schuhB}" height="8" rx="3" fill="#5a3a22" ${S3}/>`) +
      `</g>`;
    const p = SCHRITT[o.schritt || 0];
    t += bein(33, 29, 20, p.hinten) + bein(53, 51, 24, p.vorn);
  }
  // Alles über den Beinen wippt beim Laufen leicht mit.
  const lauf = SCHRITT[o.schritt || 0];
  t += `<g transform="translate(0,${o.sitzt ? lauf.sitz : lauf.koerper})">`;
  const hl = o.sitzt ? 0 : lauf.hand, hr = o.sitzt ? 0 : -lauf.hand;
  // Körper
  // Stil C (Harry 16.11.2026): klein und kantig – eckiger Körper, großer eckiger Kopf, dicke Platten.
  t += `<rect x="27" y="54" width="46" height="40" rx="8" fill="${o.kleid}" ${S}/>`;
  if (o.fell) t += `<circle cx="38" cy="66" r="3.5" fill="${o.kleid2}"/><circle cx="58" cy="78" r="4" fill="${o.kleid2}"/><circle cx="62" cy="62" r="3" fill="${o.kleid2}"/><path d="M26,88 l6,7 l6,-6 l6,7 l6,-6 l6,7 l6,-6 l6,7 l6,-7" fill="none" ${S3}/>`;
  else t += `<rect x="27" y="76" width="46" height="8" fill="${o.kleid2}" ${S3}/><rect x="45" y="75" width="10" height="10" rx="2" fill="${o.akzent}" ${S3}/>`;
  // Brustplatte der angelegten Rüstung
  if (o.platte) t += `<rect x="31" y="56" width="38" height="19" rx="5" fill="${o.platte}" ${S3}/><path d="M50,56 v19" ${S3}/><circle cx="50" cy="65" r="3.5" fill="${o.platteRand || o.akzent}" ${S3}/><rect x="19" y="52" width="18" height="14" rx="5" fill="${o.platte}" ${S3}/><rect x="63" y="52" width="18" height="14" rx="5" fill="${o.platte}" ${S3}/>`;
  // Hände (mit Handschuhen in deren Farbe)
  t += `<rect x="${14 + hl}" y="65" width="15" height="18" rx="6" fill="${o.handschuh || haut}" ${S}/><rect x="${72 + hr}" y="65" width="15" height="18" rx="6" fill="${o.handschuh || haut}" ${S}/>`;
  if (o.handschuh) t += `<path d="M${15 + hl},69 h14 M${73 + hr},69 h14" stroke="${o.handschuhRand || U}" stroke-width="3" stroke-linecap="round"/>`;
  // Kopf
  if (o.kopf === "kapuze") {
    t += `<path d="M20,44 Q18,4 50,4 Q82,4 80,44 Q80,54 50,56 Q20,54 20,44 Z" fill="${o.kapuze}" ${S}/><path d="M50,4 Q62,-4 70,8" fill="none" ${S}/>`;
    t += `<rect x="36" y="20" width="38" height="32" rx="10" fill="${haut}" ${S3}/>`;
  } else {
    t += `<rect x="22" y="6" width="56" height="50" rx="14" fill="${haut}" ${S}/>`;
  }
  // Gesicht (schaut nach rechts)
  if (o.maske) t += `<rect x="38" y="26" width="38" height="13" rx="5" fill="#2b2b33" ${S3}/><rect x="49" y="29.5" width="8" height="6" rx="2.5" fill="#fff"/><rect x="63" y="29.5" width="8" height="6" rx="2.5" fill="#fff"/>`;
  else if (o.augen) t += `<ellipse cx="50" cy="33" rx="5" ry="3.4" fill="${o.augen}"/><ellipse cx="65" cy="33" rx="5" ry="3.4" fill="${o.augen}"/>`;
  else t += `<rect x="50" y="27" width="6.5" height="11" rx="3" fill="${U}"/><rect x="64" y="27" width="6.5" height="11" rx="3" fill="${U}"/><rect x="51.5" y="28.5" width="2.6" height="3.6" rx="1.2" fill="#fff"/><rect x="65.5" y="28.5" width="2.6" height="3.6" rx="1.2" fill="#fff"/>`;
  if (o.augen) t += "";
  else if (o.boese) t += `<path d="M46,22 l11,4 M74,22 l-11,4" fill="none" ${S3}/><path d="M53,46 h14" fill="none" ${S3}/>`;
  else t += `<path d="M54,45 h13" fill="none" ${S3}/><ellipse cx="41" cy="42" rx="5" ry="3" fill="#f08a7a" opacity="0.6"/>`;
  // Kopfbedeckung
  if (o.kopf === "haare")
    t += `<path d="M20,32 V20 Q20,3 50,3 Q80,3 80,20 V30 L69,22 L60,29 L50,21 L40,29 L31,23 Z" fill="${o.haare || "#5a3a22"}" ${S}/>`;
  if (o.kopf === "helm")
    t += `<path d="M20,24 V18 Q20,2 50,2 Q80,2 80,18 V24 Z" fill="${o.helm || "#b9bfc8"}" ${S}/><rect x="17" y="18" width="66" height="8" rx="4" fill="${o.akzent}" ${S3}/><path d="M50,4 v-8" ${S}/><circle cx="50" cy="-4" r="4" fill="${o.akzent}" ${S3}/>`;
  if (o.kopf === "krone")
    t += `<path d="M21,22 L19,-2 L34,10 L50,-6 L66,10 L81,-2 L79,22 Z" fill="#f2c230" ${S}/><circle cx="50" cy="12" r="4" fill="${o.akzent}" ${S3}/>`;
  if (o.kopf === "flammen")
    t += `<path d="M24,26 Q14,10 26,2 Q26,12 34,10 Q32,-4 46,-10 Q44,2 54,4 Q58,-6 70,-6 Q64,4 72,10 Q80,6 80,-2 Q90,12 76,26 Q50,10 24,26 Z" fill="#f2761e" ${S}/><path d="M38,20 Q36,10 46,4 Q46,12 54,12 Q60,6 64,8 Q60,14 64,20 Q50,12 38,20 Z" fill="#ffd54a"/>`;
  const haar = `<path d="M20,32 V20 Q20,3 50,3 Q80,3 80,20 V30 L69,22 L60,29 L50,21 L40,29 L31,23 Z" fill="${o.haare || "#5a3a22"}" ${S}/>`;
  if (o.bart) t += `<path d="M34,42 Q40,68 56,66 Q72,64 74,42 Q56,52 34,42 Z" fill="${o.bart}" ${S3}/>`;
  if (o.kopf === "lorbeer") t += haar + `<path d="M22,24 Q50,4 78,24" fill="none" stroke="${U}" stroke-width="10" stroke-linecap="round"/><path d="M22,24 Q50,4 78,24" fill="none" stroke="#f2c230" stroke-width="5" stroke-linecap="round" stroke-dasharray="7 4"/>`;
  if (o.kopf === "hut") t += `<path d="M30,14 Q30,-10 50,-10 Q70,-10 70,14 Z" fill="${o.hut || "#7a4b26"}" ${S}/><ellipse cx="50" cy="14" rx="35" ry="7" fill="${o.hut || "#7a4b26"}" ${S}/><path d="M31,8 h38" stroke="${o.akzent}" stroke-width="5"/>`;
  if (o.kopf === "dreispitz") t += `<path d="M10,20 Q50,-22 90,20 Q50,6 10,20 Z" fill="${o.hut || "#2b2b33"}" ${S}/><circle cx="50" cy="6" r="4.5" fill="${o.akzent}" ${S3}/>`;
  if (o.kopf === "zylinder") t += `<rect x="32" y="-16" width="36" height="30" rx="3" fill="${o.hut || "#2b2b33"}" ${S}/><ellipse cx="50" cy="14" rx="32" ry="6" fill="${o.hut || "#2b2b33"}" ${S}/><rect x="32" y="2" width="36" height="6" fill="${o.akzent}"/>`;
  if (o.kopf === "muetze") t += `<path d="M24,22 Q24,-2 50,-2 Q76,-2 76,22 Z" fill="${o.hut || "#3c4a5e"}" ${S}/><path d="M66,16 h22 q4,8 -6,8 h-16 z" fill="${o.hut || "#3c4a5e"}" ${S3}/><circle cx="50" cy="10" r="4" fill="${o.akzent}" ${S3}/>`;
  if (o.kopf === "tuch") t += `<path d="M24,26 Q22,2 50,3 Q78,2 76,26 Q50,12 24,26 Z" fill="${o.hut || "#b3342e"}" ${S}/><circle cx="20" cy="26" r="6" fill="${o.hut || "#b3342e"}" ${S3}/><path d="M16,30 l-8,12 M20,32 l-2,14" ${S3} fill="none"/>`;
  if (o.kopf === "ritter") t += `<path d="M22,40 Q18,2 50,2 Q82,2 78,40 Q78,54 50,57 Q22,54 22,40 Z" fill="${o.helm || "#b9bfc8"}" ${S}/><rect x="40" y="27" width="36" height="8" rx="4" fill="${U}"/><path d="M58,35 v16" ${S3}/><path d="M50,2 Q40,-14 26,-6 Q40,-4 44,4" fill="${o.akzent}" ${S3}/>`;
  if (o.kopf === "visier") t += `<path d="M23,30 Q22,4 50,4 Q78,4 77,30 Z" fill="#1b1f3a" ${S}/><rect x="36" y="26" width="42" height="13" rx="6" fill="${o.akzent}" ${S3}/><path d="M42,30 h14" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`;
  // Schild vorne
  if (o.schild)
    t += `<path d="M4,56 h34 v16 q0,20 -17,27 q-17,-7 -17,-27 z" fill="${o.schild}" ${S}/><path d="M21,62 v30 M10,74 h22" stroke="${o.akzent}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  return t + "</g>";
}

// Lauf-Bilder (Harry 16.11.2026: fließende Animationen): 0 = Stand, 1 = Schritt, 2 = Durchschwung, 3 = Gegenschritt.
// Je Bein [dx, dy, Drehung]; koerper/sitz = Wippen des Oberkörpers; hand = Schwung der Hände.
const SCHRITT = [
  { hinten: [0, 0, 0], vorn: [0, 0, 0], koerper: 0, sitz: 0, hand: 0 },
  { hinten: [-4, 0, 20], vorn: [5, -1, -20], koerper: 2, sitz: 1.5, hand: 3 },
  { hinten: [1, -5, -4], vorn: [0, 0, 2], koerper: -1.5, sitz: 0, hand: 0 },
  { hinten: [5, -1, -20], vorn: [-4, 0, 20], koerper: 2, sitz: -1.5, hand: -3 },
];
// Vier Lauf-Bilder nebeneinander in einem Bild; CSS zeigt immer eins davon (background-position in Schritten).
const laufBogen = (o, gespiegelt) =>
  svg(
    400,
    124,
    [0, 1, 2, 3]
      .map((i) => {
        const fig = person({ ...o, schritt: i });
        return `<svg x="${i * 100}" y="0" width="100" height="124" viewBox="0 0 100 124"><g transform="translate(0,12)">${gespiegelt ? spiegeln(fig) : fig}</g></svg>`;
      })
      .join("")
  );

const spiegeln = (t) => `<g transform="translate(100,0) scale(-1,1)">${t}</g>`;
const figurSvg = (t) => svg(100, 124, `<g transform="translate(0,12)">${t}</g>`);

// Kopfbedeckung der "ordentlichen" Leute (Beschützer, Wächter) je Zeitalter.
const KOPF = [null, "haare", "haare", "helm", "helm", "lorbeer", "helm", "hut", "dreispitz", "zylinder", "muetze", "muetze", "visier"];
const HELM = { 3: "#c98a4a", 4: "#c98a4a", 6: "#b9bfc8" };

function waechter(z, typ, farbe) {
  const f = z.farben;
  const frueh = z.nummer <= 2;
  return {
    haut: HAUT[typ === "elite" ? 1 : 0],
    kleid: farbe || (typ === "elite" ? f.akzent : f.haupt),
    kleid2: z.nummer >= 9 ? "#2b2b33" : "#f1ead8",
    kopf: z.nummer === 6 && typ === "elite" ? "ritter" : KOPF[z.nummer],
    helm: HELM[z.nummer],
    hut: z.nummer >= 10 ? f.haupt : undefined,
    haare: "#6b4423",
    fell: frueh && !farbe,
    akzent: f.akzent,
  };
}

function dieb(z, typ, farbe) {
  const f = z.farben;
  const o = {
    haut: HAUT[typ === "normal" ? 1 : typ === "elite" ? 2 : 0],
    kleid: typ === "elite" ? "#7a2f6b" : typ === "normal" ? "#5b4a72" : "#7b6a58",
    kleid2: "#3a2d44",
    kopf: typ === "schwach" ? "haare" : "kapuze",
    haare: "#3d2a1a",
    kapuze: farbe || (typ === "elite" ? "#4a1d44" : "#3d3350"),
    maske: true,
    fell: z.nummer <= 2 && typ === "schwach",
    waffe: typ === "schwach" ? null : "keule",
    akzent: f.akzent,
    boese: true,
  };
  if (z.nummer === 8) Object.assign(o, { kopf: "tuch", hut: typ === "elite" ? "#2b2b33" : "#b3342e", kleid: typ === "elite" ? "#2b2b33" : "#f1ead8", kleid2: "#b3342e", bart: typ === "elite" ? "#2b2b33" : undefined });
  if (z.nummer >= 9 && z.nummer <= 11 && typ === "schwach") Object.assign(o, { kopf: "muetze", hut: "#3a2d44" });
  if (z.nummer === 12) Object.assign(o, { kopf: "kapuze", haut: "#14142a", maske: false, augen: typ === "elite" ? "#ff4bd8" : f.zweit, kleid: "#1b1f3a", kleid2: "#0f1230", kapuze: farbe || "#23284f", waffe: null });
  return o;
}

const BOSSE = {
  steinzeit: { kopf: "flammen" },
  muscheln: { kopf: "helm", helm: "#f2c230" },
  bronzezeit: { kopf: "krone", bart: "#2b2b33" },
  muenzen: { kopf: "krone", kleid: "#f2c230" },
  rom: { kopf: "lorbeer", kleid: "#f1eee6", umhang: "#b3342e", haare: "#5a3a22" },
  mittelalter: { kopf: "helm", helm: "#8a8d91", bart: "#2b2b33", kleid: "#7a4b26" },
  banken: { kopf: "hut", hut: "#b3342e", kleid: "#25355e" },
  entdeckungen: { kopf: "dreispitz", bart: "#17171c", kleid: "#2b2b33", waffe: "keule" },
  aktien: { kopf: "zylinder", kleid: "#2e7d4f", haare: "#e8e2d0" },
  industrie: { kopf: "zylinder", bart: "#e8e2d0", kleid: "#2b2b33" },
  fiat: { kopf: "haare", haare: "#4a3a2a", kleid: "#25355e", waffe: null },
  digital: { kopf: "kapuze", kapuze: "#0b0d28", haut: "#0b0d28", augen: "#f7931a", kleid: "#14183a", umhang: "#0b0d28", waffe: null },
};

// Spieler: Gut = Beschützer mit Schild, Böse = Dieb mit Kapuze. farbe = gekaufter Umhang/Aussehen.
// tragen: angelegte Rüstung je Platz { zeitalter, farbe (Seltenheit) } – Helm, Rüstung, Handschuhe und Stiefel
// sind an der Figur zu sehen: Material in der Farbe ihres Zeitalters, Rand in der Farbe der Seltenheit.
// lauf = true: vier Lauf-Bilder nebeneinander (für die Figur im Kampf), sonst ein einzelnes Bild.
export function spielerBild(seite, zeitalter, farbe, tragen = {}, lauf = false) {
  const f = zeitalter.farben;
  // Set-Teile aus den Dungeons bringen eigene Farben mit (metall); sonst bestimmt das Zeitalter das Material.
  const teil = (p) =>
    tragen[p]
      ? tragen[p].metall
        ? { m: tragen[p].metall, rand: tragen[p].akzent || tragen[p].farbe, frueh: false }
        : { m: material(tragen[p].zeitalter).metall, rand: tragen[p].farbe, frueh: tragen[p].zeitalter.nummer <= 2 }
      : null;
  const helm = teil("helm"), ruestung = teil("ruestung"), handschuhe = teil("handschuhe"), stiefel = teil("stiefel");
  const schluessel =
    ["helm", "ruestung", "handschuhe", "stiefel"].map((p) => (tragen[p] ? tragen[p].zeitalter.id + tragen[p].farbe + (tragen[p].metall || "") + (tragen[p].akzent || "") : "-")).join(",") +
    (tragen.schild ? "S" : "") + (tragen.sitzt ? "R" : "") + (tragen.aura || "");
  return alsBild(["spieler", seite, farbe, zeitalter.id, schluessel, lauf ? "L" : ""].join("|"), () => {
    const o =
      seite === "boese"
        ? { ...dieb(zeitalter, "normal", farbe), kleid: "#4a3566", kleid2: "#2b1a3d", umhang: farbe, boese: false, waffe: null, schild: tragen.schild ? "#3a2d44" : null }
        : { ...waechter(zeitalter, "schwach", farbe), schild: tragen.schild ? f.zweit : null, umhang: f.akzent };
    // Den Schild gibt es nur zur Einhand-Waffe. Im Sattel sitzt die Figur. Sehr gute Ausrüstung leuchtet.
    if (tragen.sitzt) o.sitzt = true;
    if (tragen.aura) Object.assign(o, { aura: true, akzent: tragen.aura });
    if (helm) Object.assign(o, { kopf: "helm", helm: helm.frueh ? "#a8763a" : helm.m, akzent: helm.rand });
    if (ruestung) Object.assign(o, { platte: ruestung.frueh ? "#a8763a" : ruestung.m, platteRand: ruestung.rand, fell: false });
    if (handschuhe) Object.assign(o, { handschuh: handschuhe.frueh ? "#8a5a3a" : handschuhe.m, handschuhRand: handschuhe.rand });
    if (stiefel) Object.assign(o, { stiefel: stiefel.frueh ? "#8a5a3a" : stiefel.m, stiefelRand: stiefel.rand });
    return lauf ? laufBogen(o, false) : figurSvg(person(o));
  });
}

// Der Bogen in der Hand des Helden in drei Stufen: 0 = entspannt (Pfeil ist weg), 1 = halb gespannt, 2 = voll gespannt.
export function bogenBild(zeitalter, stufe, set) {
  return alsBild(["bogen", zeitalter.id, stufe, set ? set.zeitalter : ""].join("|"), () => {
    const m = set ? { metall: set.rand } : material(zeitalter);
    const holz = set ? set.farbe : "#9a6a3c";
    const zug = [0, 9, 18][stufe] || 0;
    const bauch = 52 - zug * 0.35;
    let t = `<path d="M22,6 Q${bauch},32 22,58" fill="none" stroke="${U}" stroke-width="9" stroke-linecap="round"/><path d="M22,6 Q${bauch},32 22,58" fill="none" stroke="${holz}" stroke-width="4" stroke-linecap="round"/>`;
    t += `<path d="M22,6 L${22 - zug},32 L22,58" fill="none" stroke="${U}" stroke-width="2.5" stroke-linejoin="round"/>`;
    if (stufe > 0) t += `<line x1="${22 - zug}" y1="32" x2="${54 - zug}" y2="32" stroke="${U}" stroke-width="3.5" stroke-linecap="round"/><path d="M${60 - zug},32 L${50 - zug},26 V38 Z" fill="${m.metall}" ${S3}/>`;
    return svg(64, 64, t);
  });
}

// Was durch die Luft fliegt: Pfeil, Speer, Stein, Feuerball, Kugel.
const GESCHOSSE = {
  speer: () => `<path d="M2,32 H46" stroke="${U}" stroke-width="10" stroke-linecap="round"/><path d="M2,32 H46" stroke="#9a6a3c" stroke-width="5" stroke-linecap="round"/><path d="M63,32 L42,20 V44 Z" fill="#d5dbe2" ${S3}/>`,
  stein: () => `<path d="M18,30 Q20,14 36,16 Q50,18 48,34 Q46,48 30,48 Q16,46 18,30 Z" fill="#9aa3ad" ${S}/><path d="M28,24 q6,-4 12,0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`,
  feuer: () => `<path d="M2,32 Q16,14 34,12 Q58,12 60,32 Q58,52 34,52 Q16,50 2,32 Z" fill="#f2761e" ${S}/><path d="M18,32 Q26,22 40,22 Q52,24 52,32 Q52,42 40,42 Q26,42 18,32 Z" fill="#ffd54a"/>`,
  kugel: () => `<circle cx="40" cy="32" r="9" fill="#3a3f49" ${S3}/><path d="M6,32 H26" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`,
};
export function geschossBild(art) {
  if (!GESCHOSSE[art]) return symbolBild("pfeil");
  return alsBild("geschoss|" + art, () => svg(64, 64, GESCHOSSE[art]()));
}

// art: "nah" (Keule/Speer) oder "fern" (Bogen, später Blaster) – nie beides.
export function gegnerBild(seite, zeitalter, typ, boss, art, lauf = false) {
  const f = zeitalter.farben;
  const fern = art === "fern";
  return alsBild(["gegner", seite, zeitalter.id, typ, boss ? 1 : 0, fern ? 1 : 0, lauf ? "L" : ""].join("|"), () => {
    const fernWaffe = zeitalter.nummer >= 10 ? "blaster" : "bogen";
    let o;
    if (boss)
      o = { haut: "#e9b98a", kleid: f.akzent, kleid2: "#5a2a1a", kopf: "krone", boese: true, akzent: f.akzent, waffe: "speer", umhang: "#8e2d2d", aura: true, ...(BOSSE[zeitalter.id] || {}) };
    else if (seite === "boese")
      o = { ...waechter(zeitalter, typ), boese: true, schild: fern ? null : f.zweit, waffe: fern ? fernWaffe : "speer" };
    else o = { ...dieb(zeitalter, typ), waffe: fern ? fernWaffe : "keule" };
    o.waffe = null; // die Waffe liegt als eigenes Bild über der Figur (gegnerWaffe), damit sie sich bewegen kann
    return lauf ? laufBogen(o, true) : figurSvg(spiegeln(person(o)));
  });
}

// Die Waffe eines Gegners als eigenes Bild (zeigt nach links). Gibt { art, bild } zurück oder null.
const GEGNER_WAFFEN = {
  keule: `<g transform="rotate(-28 32 40)"><rect x="24" y="2" width="16" height="54" rx="8" fill="#9a6a3c" ${S3}/><circle cx="31" cy="14" r="2.5" fill="${U}"/><circle cx="34" cy="26" r="2" fill="${U}"/></g>`,
  speer: `<path d="M62,36 H18" stroke="${U}" stroke-width="9" stroke-linecap="round"/><path d="M62,36 H18" stroke="#9a6a3c" stroke-width="4" stroke-linecap="round"/><path d="M2,36 L22,26 V46 Z" fill="#c9ced6" ${S3}/>`,
  bogen: `<path d="M44,6 Q14,32 44,58" fill="none" stroke="${U}" stroke-width="9" stroke-linecap="round"/><path d="M44,6 Q14,32 44,58" fill="none" stroke="#9a6a3c" stroke-width="4" stroke-linecap="round"/><path d="M44,6 V58" stroke="${U}" stroke-width="2.5"/>`,
  blaster: `<rect x="8" y="24" width="40" height="14" rx="4" fill="#5a5f69" ${S3}/><rect x="36" y="36" width="12" height="16" rx="3" fill="#3a3f49" ${S3}/><circle cx="8" cy="31" r="4" fill="#ff4bd8"/>`,
};
export function gegnerWaffe(seite, zeitalter, boss, art) {
  let w;
  if (boss) w = BOSSE[zeitalter.id] && "waffe" in BOSSE[zeitalter.id] ? BOSSE[zeitalter.id].waffe : "speer";
  else if (art === "fern") w = zeitalter.nummer >= 10 ? "blaster" : "bogen";
  else w = seite === "boese" ? "speer" : zeitalter.nummer === 12 ? null : "keule";
  if (!w || !GEGNER_WAFFEN[w]) return null;
  return { art: w, bild: alsBild("gegnerwaffe|" + w, () => svg(64, 64, GEGNER_WAFFEN[w])) };
}

// ---------- Ausrüstung ----------
// Eine Form je Platz, zwei Varianten je Waffe; das Material kommt aus den Farben des Zeitalters.
// Glanzlicht (heller Strich) und Schatten (dunkle Fläche) für die Gegenstands-Bilder.
const GL = (d, w = 3, o = 0.6) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" opacity="${o}"/>`;
const SCH = (d, o = 0.18) => `<path d="${d}" fill="#000" opacity="${o}"/>`;
// Harry 16.11.2026: schönere Icons – jedes Stück mit Glanz, Schatten und mehr Details.
function stueck(art, variante, m) {
  const holz = "#9a6a3c";
  const holz2 = "#7a4f2a";
  switch (art) {
    case "nah":
      // Keule (frühe Zeitalter)
      if (m.frueh && !variante)
        return `<g transform="rotate(40 32 32)"><path d="M26,56 L27,22 Q22,6 32,5 Q43,6 38,22 L39,56 Q32,60 26,56 Z" fill="${holz}" ${S3}/>${SCH("M33,8 Q41,10 37,22 L38,55 Q35,57 33,57 Z")}${GL("M28,12 Q27,20 29,34", 3, 0.45)}<circle cx="33" cy="14" r="2.2" fill="${U}"/><circle cx="29.5" cy="24" r="1.8" fill="${U}"/><path d="M27,42 h11 M27,47 h11" stroke="${m.akzent}" stroke-width="3.2"/><path d="M27,42 h11 M27,47 h11 M27,52 h11" stroke="${U}" stroke-width="1.2" opacity="0.6"/></g>`;
      // Axt
      if (variante)
        return `<g transform="rotate(35 32 32)"><rect x="29" y="8" width="7" height="50" rx="3.5" fill="${holz}" ${S3}/>${SCH("M33,10 h2 v46 h-2 z")}<path d="M35,9 Q56,10 54,32 Q45,26 35,30 Z" fill="${m.metall}" ${S3}/><path d="M47,13 Q54,20 53,31 Q49,27 45,26 Q49,20 47,13 Z" fill="#fff" opacity="0.55"/>${SCH("M35,24 Q45,22 53,30 Q45,26 35,30 Z", 0.2)}<path d="M28,13 h9 M28,27 h9" stroke="${m.akzent}" stroke-width="3.5" stroke-linecap="round"/><path d="M29,50 h7 M29,54 h7" stroke="${holz2}" stroke-width="2"/></g>`;
      // Schwert
      return `<g transform="rotate(40 32 32)"><path d="M26.5,40 L26.5,6 L32,-5 L37.5,6 L37.5,40 Z" fill="${m.metall}" ${S3}/>${SCH("M32,-4 L37,6 L37,39.5 L32,39.5 Z", 0.16)}${GL("M29,7 V36", 2.4, 0.75)}<path d="M32,4 V38" stroke="${U}" stroke-width="1.4" opacity="0.45"/><path d="M17,38 Q32,44 47,38 L47,45 Q32,50 17,45 Z" fill="${m.akzent}" ${S3}/>${GL("M21,41.5 Q32,45.5 43,41.5", 1.8, 0.6)}<rect x="28.5" y="46" width="7" height="11" rx="2.5" fill="${holz}" ${S3}/><path d="M28.5,50 h7 M28.5,53.5 h7" stroke="${holz2}" stroke-width="1.6"/><circle cx="32" cy="59.5" r="4" fill="${m.gold}" ${S3}/></g>`;
    case "fern":
      // Speer
      if (variante)
        return `<g transform="rotate(40 32 32)"><rect x="29.5" y="12" width="5" height="50" rx="2.5" fill="${holz}" ${S3}/>${SCH("M32.5,14 h1.6 v46 h-1.6 z")}<path d="M32,-5 L42,15 L32,20 L22,15 Z" fill="${m.metall}" ${S3}/>${SCH("M32,-4 L41.5,15 L32,19.5 Z", 0.18)}${GL("M28.5,4 L25.5,13.5", 2, 0.75)}<path d="M28,21 h8 M28,25 h8" stroke="${m.akzent}" stroke-width="3.2" stroke-linecap="round"/><path d="M34,26 q7,3 4,11 q-4,-2 -4,-8" fill="${m.akzent}" ${S3}/></g>`;
      // Bogen mit Pfeil
      return `<path d="M18,6 Q54,32 18,58" fill="none" stroke="${U}" stroke-width="9.5" stroke-linecap="round"/><path d="M18,6 Q54,32 18,58" fill="none" stroke="${holz}" stroke-width="5" stroke-linecap="round"/><path d="M21,11 Q46,32 21,53" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.4"/><path d="M33.5,26 Q36.5,32 33.5,38" fill="none" stroke="${U}" stroke-width="9.5" stroke-linecap="round"/><path d="M33.5,26 Q36.5,32 33.5,38" fill="none" stroke="${m.akzent}" stroke-width="5.5" stroke-linecap="round"/><line x1="18" y1="6" x2="18" y2="58" stroke="${U}" stroke-width="2.2"/><line x1="10" y1="32" x2="52" y2="32" stroke="${U}" stroke-width="5" stroke-linecap="round"/><line x1="10" y1="32" x2="50" y2="32" stroke="#d9b98a" stroke-width="2" stroke-linecap="round"/><path d="M61,32 L49,25 L49,39 Z" fill="${m.metall}" ${S3}/><path d="M6,26 L14,32 L6,38 Z" fill="${m.akzent}" ${S3}/>`;
    case "helm":
      return `<path d="M9,40 Q7,9 32,9 Q57,9 55,40 Z" fill="${m.metall}" ${S3}/>${SCH("M38,10 Q57,12 55,40 H40 Q46,24 38,10 Z", 0.16)}${GL("M16,30 Q16,17 27,14", 3.2, 0.7)}<path d="M32,9 V40" stroke="${U}" stroke-width="2" opacity="0.4"/><path d="M27,9 Q32,-3 37,9 Z" fill="${m.akzent}" ${S3}/><rect x="5" y="37" width="54" height="10" rx="5" fill="${m.akzent}" ${S3}/>${GL("M11,40.5 H44", 2, 0.5)}<path d="M28.5,47 h7 v9 q-3.5,4 -7,0 Z" fill="${m.metall}" ${S3}/><circle cx="14" cy="42" r="1.7" fill="${U}"/><circle cx="50" cy="42" r="1.7" fill="${U}"/>`;
    case "handschuhe":
      return `<path d="M17,50 V30 Q17,24 22,24 V14 Q22,9 26.5,9 Q31,9 31,14 V12 Q31,7 35.5,7 Q40,7 40,12 V15 Q40,11 44,11 Q48.5,11 48.5,16 V34 Q48.5,46 44,50 Z" fill="${m.metall}" ${S3}/>${SCH("M40,14 Q44,11 48,16 V34 Q48,46 44,50 H38 Q43,40 40,14 Z", 0.16)}${GL("M21.5,30 V42", 2.6, 0.6)}${GL("M26.5,13 V22", 2.2, 0.6)}<path d="M31,15 V25 M40,16 V26" stroke="${U}" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/><path d="M22,33 Q33,37 47,32" fill="none" stroke="${U}" stroke-width="2" opacity="0.45"/><path d="M14,47 H47 V55 Q30,60 14,55 Z" fill="${m.akzent}" ${S3}/>${GL("M18,50.5 H40", 1.8, 0.55)}<circle cx="30" cy="53" r="2" fill="${m.gold}" stroke="${U}" stroke-width="1.4"/>`;
    case "ruestung":
      return `<path d="M15,13 L24,8 Q32,17 40,8 L49,13 L52,28 L46,31 V53 Q32,60 18,53 V31 L12,28 Z" fill="${m.metall}" ${S3}/>${SCH("M40,9 L49,13 L52,28 L46,31 V53 Q39,57 33,57 V16 Q37,14 40,9 Z", 0.15)}<path d="M5,24 Q5,11 17,11 Q22,17 20,29 Q12,31 5,24 Z" fill="${m.metall}" ${S3}/><path d="M59,24 Q59,11 47,11 Q42,17 44,29 Q52,31 59,24 Z" fill="${m.metall}" ${S3}/>${GL("M9,21 Q10,15 16,15", 2.4, 0.65)}${GL("M22,22 Q23,32 22,44", 2.8, 0.55)}<path d="M32,17 V40" stroke="${U}" stroke-width="2" opacity="0.4"/><path d="M21,31 Q32,36 43,31" fill="none" stroke="${U}" stroke-width="2" opacity="0.4"/><path d="M18,41 Q32,47 46,41 V48 Q32,54 18,48 Z" fill="${m.akzent}" ${S3}/><path d="M32,22 l4.5,4.5 l-4.5,4.5 l-4.5,-4.5 z" fill="${m.gold}" stroke="${U}" stroke-width="2" stroke-linejoin="round"/>`;
    case "stiefel":
      return `<path d="M20,10 H39 V34 Q57,36 57,48 V52 H20 Z" fill="${m.metall}" ${S3}/>${SCH("M33,12 H39 V34 Q57,36 57,48 V52 H44 Q48,40 33,36 Z", 0.15)}${GL("M24.5,17 V40", 2.8, 0.6)}<path d="M39,34 Q33,35 30,40" fill="none" stroke="${U}" stroke-width="2" opacity="0.45"/><path d="M46,41 q4,1 6,5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.5"/><path d="M16,5 H42 V15 Q29,19 16,15 Z" fill="${m.akzent}" ${S3}/>${GL("M20,8.5 H37", 1.8, 0.55)}<path d="M17,51 H59 V57 Q38,60 17,57 Z" fill="${holz2}" ${S3}/>`;
    case "ring":
      return `<circle cx="32" cy="40" r="16" fill="none" stroke="${U}" stroke-width="12.5"/><circle cx="32" cy="40" r="16" fill="none" stroke="${m.gold}" stroke-width="7"/><path d="M19,47 A15,15 0 0 1 19,33" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/><path d="M45,33 A15,15 0 0 1 43,50" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" opacity="0.18"/><path d="M24,22 h16 l3,-6 l-5,-6 h-12 l-5,6 z" fill="${m.gold}" ${S3}/><path d="M32,3 L43,13 L32,25 L21,13 Z" fill="${m.akzent}" ${S3}/><path d="M32,3 L37,13 L32,25 L27,13 Z" fill="#fff" opacity="0.28"/><path d="M21,13 H43" stroke="${U}" stroke-width="1.4" opacity="0.5"/>${GL("M26.5,10.5 L30,7", 2, 0.85)}`;
    case "amulett":
      return `<path d="M10,4 Q32,42 54,4" fill="none" stroke="${U}" stroke-width="7.5" stroke-linecap="round"/><path d="M10,4 Q32,42 54,4" fill="none" stroke="${m.gold}" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="4.5 3"/><path d="M32,24 L47,34 L43,53 Q32,61 21,53 L17,34 Z" fill="${m.gold}" ${S3}/>${SCH("M32,25 L46,34.5 L42.5,52.5 Q37,57 32,58 Z", 0.16)}${GL("M22,36 L24,49", 2.4, 0.65)}<path d="M32,32 L40,41 L32,52 L24,41 Z" fill="${m.akzent}" ${S3}/><path d="M32,32 L35.5,41 L32,52 L28.5,41 Z" fill="#fff" opacity="0.3"/>${GL("M28.5,38.5 L30.5,36", 1.8, 0.9)}`;
    case "guertel":
      return `<path d="M3,25 Q32,20 61,25 V40 Q32,45 3,40 Z" fill="${holz}" ${S3}/>${SCH("M3,34 Q32,38 61,34 V40 Q32,45 3,40 Z", 0.2)}${GL("M8,27.5 Q20,25.5 24,25.5", 2, 0.45)}<path d="M5,30 Q32,26 59,30 M5,36.5 Q32,40.5 59,36.5" fill="none" stroke="${holz2}" stroke-width="1.4" stroke-dasharray="3 3"/><circle cx="48" cy="32.5" r="1.8" fill="${U}"/><circle cx="54.5" cy="32.5" r="1.8" fill="${U}"/><rect x="21" y="16" width="22" height="33" rx="6" fill="${m.gold}" ${S3}/>${SCH("M33,17 h5 q5,0 5,6 v20 q0,6 -5,6 h-5 z", 0.16)}${GL("M25,22 V42", 2.4, 0.65)}<rect x="27.5" y="23" width="9" height="19" rx="2.5" fill="${holz}" ${S3}/><rect x="30" y="29" width="13" height="5" rx="2.5" fill="${m.akzent}" ${S3}/>`;
  }
  return "";
}

function material(zeitalter) {
  const f = zeitalter.farben;
  const frueh = zeitalter.nummer <= 2;
  return { frueh, metall: frueh ? "#a9a093" : f.symbol || "#c6cdd4", akzent: f.akzent, gold: frueh ? "#e8d5a8" : "#f2c230" };
}

// Die zweite Waffe je Zeitalter und Art bekommt die zweite Form (z. B. Keule und Axt, Bogen und Speer).
const varianten = new Map();
export function stueckeMelden(liste) {
  const gesehen = {};
  for (const w of liste) {
    const k = w.zeitalter + "|" + w.art;
    varianten.set(w.id, (gesehen[k] = (gesehen[k] || 0) + 1) % 2 === 0 ? 1 : 0);
  }
}

// platz: nah, fern, helm, handschuhe, ruestung, stiefel, ring1, ring2, amulett, guertel. id = Stück (für die Variante).
// Set-Teile aus den Dungeons: dieselben Formen, aber in den Farben des Sets (set = null: leerer Platz).
export function setTeilBild(teil, set) {
  const art = teil === "waffe" ? "nah" : teil;
  return alsBild(["setteil", art, set ? set.zeitalter : "-"].join("|"), () => {
    const m = set ? { frueh: false, metall: set.farbe, akzent: set.rand, gold: set.rand } : { frueh: false, metall: "#b9bec7", akzent: "#a3a8b2", gold: "#b9bec7" };
    return svg(64, 64, `<g opacity="${set ? 1 : 0.55}">${stueck(art, 0, m)}</g>`);
  });
}
// Die getragene Waffe mit dem Aussehen der Set-Waffe (Form der Waffe, Farben des Sets).
export function setWaffeBild(art, set, id) {
  const v = varianten.get(id) || 0;
  return alsBild(["setwaffe", art, set.zeitalter, v].join("|"), () => svg(64, 64, stueck(art, v, { frueh: false, metall: set.farbe, akzent: set.rand, gold: set.rand })));
}

export function stueckBild(platz, zeitalter, id, leer) {
  const art = platz.startsWith("ring") ? "ring" : platz;
  const v = varianten.get(id) || 0;
  return alsBild(["stueck", art, zeitalter.id, v, leer ? 1 : 0].join("|"), () => {
    const m = leer ? { frueh: false, metall: "#b9bec7", akzent: "#a3a8b2", gold: "#b9bec7" } : material(zeitalter);
    return svg(64, 64, `<g opacity="${leer ? 0.55 : 1}">${stueck(art, leer ? 0 : v, m)}</g>`);
  });
}

// ---------- Hintergrund ----------
function steinzeitSzene(f, nacht) {
  const himmelOben = nacht ? "#2a1f47" : "#f6dfa6";
  const himmelUnten = nacht ? "#5a3d6b" : "#f3b877";
  const ton = (hell, dunkel) => (nacht ? dunkel : hell);
  return `
  <defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${himmelOben}"/><stop offset="1" stop-color="${himmelUnten}"/></linearGradient></defs>
  <rect width="400" height="300" fill="url(#h)"/>
  <circle cx="330" cy="52" r="26" fill="${ton("#f2761e", "#f1ead8")}" ${S}/>
  ${nacht ? `<circle cx="319" cy="46" r="20" fill="${himmelOben}" opacity="0.9"/>` : ""}
  <path d="M64,58 q10,-12 22,-2 q14,-6 18,6 q-22,6 -40,-4 z M200,34 q8,-10 18,-2 q12,-4 14,6 q-18,4 -32,-4 z" fill="#fff" opacity="${nacht ? 0.15 : 0.75}"/>
  <path d="M-10,190 L60,84 L104,150 L150,96 L214,190 Z" fill="${ton("#b98a5e", "#4d3a5c")}" ${S}/>
  <path d="M60,84 L76,108 L64,116 L50,104 Z M150,96 L164,118 L150,124 L138,112 Z" fill="${ton("#f6ead0", "#8d7a9c")}" ${S3}/>
  <path d="M190,196 L262,112 L318,160 L356,128 L420,196 Z" fill="${ton("#a8744a", "#3f2f4e")}" ${S}/>
  <path d="M-10,300 V178 Q40,150 104,172 Q150,186 150,300 Z" fill="${ton(f.haupt, "#43304f")}" ${S}/>
  <path d="M34,300 V226 Q36,190 74,190 Q112,190 112,226 V300 Z" fill="#2a1a16" ${S}/>
  <path d="M320,300 V214 Q364,188 420,206 V300 Z" fill="${ton(f.haupt, "#43304f")}" ${S}/>
  <path d="M-10,300 V232 Q110,214 210,230 Q320,246 420,226 V300 Z" fill="${ton("#7a4f28", "#2f2238")}" ${S}/>
  <g transform="translate(350,208)"><path d="M-14,24 L14,10 M14,24 L-14,10" stroke="${U}" stroke-width="9" stroke-linecap="round"/><path d="M-14,24 L14,10 M14,24 L-14,10" stroke="#9a6a3c" stroke-width="4" stroke-linecap="round"/><path d="M0,14 Q-16,2 -6,-12 Q-4,-2 2,-6 Q0,-18 10,-24 Q8,-12 16,-6 Q20,4 0,14 Z" fill="#f2761e" ${S3}/><path d="M2,10 Q-6,2 0,-6 Q4,0 8,-4 Q12,4 2,10 Z" fill="#ffd54a"/></g>
  <g fill="${ton("#b9aa98", "#6d6078")}" ${S3}><ellipse cx="176" cy="262" rx="15" ry="9"/><ellipse cx="270" cy="282" rx="11" ry="7"/><ellipse cx="22" cy="276" rx="12" ry="7"/></g>
  <g fill="none" stroke="${ton("#5d7a2e", "#3d5a4a")}" stroke-width="4" stroke-linecap="round"><path d="M130,250 l-4,-12 M134,250 l0,-14 M138,250 l4,-12"/><path d="M300,258 l-4,-11 M304,258 l0,-13 M308,258 l4,-11"/><path d="M232,246 l-3,-9 M236,246 l0,-11 M240,246 l3,-9"/></g>`;
}

const GRUND = `M-10,300 V232 Q110,214 210,230 Q320,246 420,226 V300 Z`;
const wolken = (staerke) =>
  `<path d="M64,58 q10,-12 22,-2 q14,-6 18,6 q-22,6 -40,-4 z M200,34 q8,-10 18,-2 q12,-4 14,6 q-18,4 -32,-4 z" fill="#fff" opacity="${staerke}"/>`;
const himmel = (oben, unten) =>
  `<defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${oben}"/><stop offset="1" stop-color="${unten}"/></linearGradient></defs><rect width="400" height="300" fill="url(#h)"/>`;
const huegel = (farbe) =>
  `<path d="M-10,300 V196 Q70,130 170,196 Q200,216 220,300 Z" fill="${farbe}" ${S}/><path d="M170,300 V214 Q280,150 420,206 V300 Z" fill="${farbe}" ${S}/><path d="M-10,300 V196 Q70,130 170,196 Q200,216 220,300 Z M170,300 V214 Q280,150 420,206 V300 Z" fill="#fff" opacity="0.25"/>`;
const meer = () =>
  `<rect x="-10" y="168" width="420" height="80" fill="#4fa7b5" ${S}/><path d="M20,186 q10,-8 20,0 q10,8 20,0 M150,200 q10,-8 20,0 q10,8 20,0 M300,184 q10,-8 20,0 q10,8 20,0 M230,214 q10,-8 20,0" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.7"/>`;
const palme = (x, y) => {
  const k = `${x + 6},${y - 74}`;
  const blatt = (d) => `<path d="M${k} ${d}" fill="none" stroke="${U}" stroke-width="13" stroke-linecap="round"/><path d="M${k} ${d}" fill="none" stroke="#4f9a3c" stroke-width="7" stroke-linecap="round"/>`;
  return `<path d="M${x},${y} q-8,-40 6,-74" fill="none" stroke="${U}" stroke-width="13" stroke-linecap="round"/><path d="M${x},${y} q-8,-40 6,-74" fill="none" stroke="#9a6a3c" stroke-width="7" stroke-linecap="round"/>${blatt("q-28,-16 -42,6")}${blatt("q28,-16 42,6")}${blatt("q-12,-30 -34,-26")}${blatt("q12,-30 34,-26")}`;
};
const baum = (x, y, farbe = "#5d8a3a", r = 26) =>
  `<rect x="${x - 6}" y="${y - 40}" width="12" height="42" rx="4" fill="#7a4b26" ${S}/><circle cx="${x}" cy="${y - 56}" r="${r}" fill="${farbe}" ${S}/><circle cx="${x - 8}" cy="${y - 62}" r="${r / 3}" fill="#fff" opacity="0.25"/>`;
const saeulen = (x, y, n, abstand, hoehe, farbe) =>
  Array.from({ length: n }, (_, i) => `<rect x="${x + i * abstand}" y="${y - hoehe}" width="12" height="${hoehe}" fill="${farbe}" ${S3}/>`).join("");
const fenster = (x, y, spalten, zeilen, farbe, dx = 11, dy = 14) => {
  let t = "";
  for (let i = 0; i < spalten; i++) for (let j = 0; j < zeilen; j++) t += `<rect x="${x + i * dx}" y="${y + j * dy}" width="6" height="8" rx="1" fill="${farbe}"/>`;
  return t;
};

// Je Zeitalter: [Himmel oben, Himmel unten, Boden, Bild-Teile]
const SZENEN = {
  muscheln: (f) => ["#bfe6ee", "#f6e7b8", "#e3c16f",
    meer() + palme(96, 236) +
    `<path d="M236,196 L282,150 L328,196 Z" fill="#b98a3e" ${S}/><rect x="248" y="194" width="68" height="40" fill="#e6c88e" ${S}/><path d="M274,234 v-22 q8,-10 16,0 v22 z" fill="#5a3a22" ${S3}/>
     <path d="M330,210 L358,180 L386,210 Z" fill="#b98a3e" ${S}/><rect x="338" y="208" width="40" height="26" fill="#e6c88e" ${S}/>`],
  bronzezeit: (f) => ["#f8d9a0", "#f0b070", "#d9a55c",
    huegel("#e0b070") + palme(120, 236) +
    `<rect x="206" y="198" width="168" height="36" fill="#d9a066" ${S}/><rect x="230" y="168" width="120" height="30" fill="#d9a066" ${S}/><rect x="256" y="142" width="68" height="26" fill="#d9a066" ${S}/><rect x="274" y="124" width="32" height="18" fill="${f.akzent}" ${S}/><path d="M278,234 L284,142 h12 L302,234 Z" fill="#b97a44" ${S3}/>`],
  muenzen: (f) => ["#cfe8f2", "#f7ecc8", "#a8b45a",
    huegel("#b9c88a") + baum(118, 236, "#7c8b3a", 24) +
    `<path d="M194,150 L285,110 L376,150 Z" fill="#f4efe2" ${S}/><rect x="200" y="150" width="170" height="12" fill="#f4efe2" ${S}/>${saeulen(210, 220, 6, 28, 58, "#f4efe2")}<rect x="196" y="220" width="178" height="12" fill="#e2dccb" ${S}/><circle cx="285" cy="134" r="8" fill="#f2b632" ${S3}/>`],
  rom: (f) => ["#cfe3f5", "#f4e6d2", "#c9b27a",
    huegel("#d9c9a0") +
    `<rect x="110" y="150" width="16" height="84" fill="#f1eee6" ${S}/><rect x="104" y="140" width="28" height="12" rx="3" fill="#f1eee6" ${S}/>
     <path d="M190,234 V156 Q190,134 220,134 H352 Q382,134 382,156 V234 Z" fill="#e8dcc0" ${S}/><path d="M190,182 H382" ${S3} fill="none"/>` +
    [0, 1, 2, 3, 4].map((i) => `<path d="M${204 + i * 36},178 v-14 q10,-14 20,0 v14 z M${204 + i * 36},232 v-26 q10,-14 20,0 v26 z" fill="#6b4d3a" ${S3}/>`).join("") +
    `<path d="M286,134 v-22" ${S}/><path d="M286,112 h26 l-8,8 l8,8 h-26 z" fill="${f.haupt}" ${S3}/>`],
  mittelalter: (f) => ["#bcd9ee", "#e9e2d6", "#6f9a4a",
    huegel("#8fb86a") + baum(110, 236) +
    `<rect x="226" y="172" width="130" height="62" fill="#b9b4ab" ${S}/><path d="M226,172 v-12 h16 v12 h14 v-12 h16 v12 h14 v-12 h16 v12 h14 v-12 h16 v12 h14 v-12 h10 v12" fill="#b9b4ab" ${S3}/>
     <rect x="204" y="140" width="34" height="94" fill="#c9c4bb" ${S}/><rect x="344" y="140" width="34" height="94" fill="#c9c4bb" ${S}/>
     <path d="M198,142 L221,100 L244,142 Z M338,142 L361,100 L384,142 Z" fill="${f.haupt}" ${S}/>
     <path d="M276,234 v-28 q15,-20 30,0 v28 z" fill="#5a3a22" ${S}/><rect x="216" y="160" width="9" height="16" rx="4" fill="${U}"/><rect x="356" y="160" width="9" height="16" rx="4" fill="${U}"/>
     <path d="M221,100 v-18" ${S3}/><path d="M221,82 h18 l-6,6 l6,6 h-18 z" fill="${f.akzent}" ${S3}/>`],
  banken: (f) => ["#f3e3b8", "#f1c9a0", "#c9b88a",
    huegel("#d9c08a") +
    `<ellipse cx="116" cy="196" rx="14" ry="42" fill="#3f6b3a" ${S}/><rect x="112" y="228" width="8" height="10" fill="#7a4b26" ${S3}/>
     <rect x="366" y="112" width="24" height="122" fill="#f0e2c0" ${S}/><path d="M362,114 L378,88 L394,114 Z" fill="#b3542e" ${S}/><rect x="374" y="130" width="8" height="14" rx="4" fill="${U}"/>
     <rect x="216" y="170" width="140" height="64" fill="#f0e2c0" ${S}/><path d="M232,170 Q286,84 340,170 Z" fill="#b3542e" ${S}/><rect x="278" y="100" width="16" height="18" fill="#f0e2c0" ${S3}/><path d="M286,100 v-14" ${S}/>` +
    [0, 1, 2, 3].map((i) => `<path d="M${230 + i * 32},234 v-34 q8,-12 16,0 v34 z" fill="${f.haupt}" ${S3}/>`).join("")],
  entdeckungen: (f) => ["#9fd8e0", "#e8f0d8", "#e8d39a",
    meer() + palme(92, 236) +
    `<path d="M206,198 h124 l-16,34 h-88 z" fill="#7a4b26" ${S}/><path d="M212,210 h112" stroke="#f2c230" stroke-width="4"/>
     <path d="M268,198 V112" ${S}/><path d="M274,122 q40,22 0,68 z" fill="#f4efe2" ${S}/><path d="M262,130 q-34,18 0,58 z" fill="#f4efe2" ${S}/>
     <path d="M268,112 h24 l-7,7 l7,7 h-24 z" fill="${f.akzent}" ${S3}/><circle cx="238" cy="218" r="5" fill="#2b2b33"/><circle cx="268" cy="218" r="5" fill="#2b2b33"/><circle cx="298" cy="218" r="5" fill="#2b2b33"/>`],
  aktien: (f) => ["#d5e6da", "#f0ead6", "#9aa37a",
    huegel("#b9c8a0") +
    `<rect x="100" y="188" width="52" height="46" fill="#d9b08a" ${S}/><path d="M94,190 L126,162 L158,190 Z" fill="#8e4a3a" ${S}/>${fenster(110, 198, 3, 2, "#5a3a22", 14, 16)}
     <path d="M200,158 L286,118 L372,158 Z" fill="#efe6cf" ${S}/><rect x="206" y="158" width="160" height="12" fill="#efe6cf" ${S}/>${saeulen(216, 224, 5, 34, 54, "#efe6cf")}<rect x="200" y="224" width="172" height="10" fill="#d9d0b8" ${S}/>
     <path d="M262,146 l12,-8 l10,6 l16,-14" fill="none" stroke="${f.haupt}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`],
  industrie: (f) => ["#b9b2a8", "#d8c9b0", "#6b6660",
    huegel("#8a857c") +
    `<g fill="#f1ede6" opacity="0.85"><circle cx="340" cy="92" r="14"/><circle cx="326" cy="70" r="18"/><circle cx="300" cy="50" r="22"/><circle cx="368" cy="106" r="10"/><circle cx="378" cy="84" r="14"/></g>
     <rect x="330" y="104" width="20" height="76" fill="#6b4033" ${S}/><rect x="358" y="120" width="18" height="60" fill="#6b4033" ${S}/><rect x="328" y="100" width="24" height="9" fill="${f.akzent}" ${S3}/>
     <path d="M198,178 l30,-24 v24 l30,-24 v24 l30,-24 v24 h96 v56 h-186 z" fill="#8a5a44" ${S}/>${fenster(210, 194, 9, 2, "#ffd54a", 19, 18)}
     <rect x="100" y="196" width="50" height="38" fill="#7a6a5c" ${S}/><path d="M96,198 h58 l-8,-14 h-42 z" fill="#4a4038" ${S}/>`],
  fiat: (f) => ["#bcd3ee", "#e4e8ee", "#8a9099",
    `<rect x="98" y="150" width="40" height="84" fill="#9fb0c8" ${S}/>${fenster(106, 160, 3, 5, "#e8f1ff")}
     <rect x="196" y="122" width="36" height="112" fill="#6f87b0" ${S}/>${fenster(203, 132, 3, 7, "#e8f1ff", 9)}
     <rect x="236" y="82" width="46" height="152" fill="${f.akzent}" ${S}/>${fenster(244, 92, 3, 10, "#e8f1ff")}<path d="M259,82 v-20" ${S}/>
     <rect x="286" y="142" width="30" height="92" fill="#aab6c8" ${S}/>${fenster(292, 152, 2, 5, "#e8f1ff")}
     <rect x="320" y="102" width="42" height="132" fill="#4f6a96" ${S}/>${fenster(328, 112, 3, 8, "#ffe9a0")}
     <rect x="366" y="134" width="36" height="100" fill="#8fa0bc" ${S}/>${fenster(373, 144, 2, 6, "#e8f1ff")}
     <rect x="240" y="212" width="38" height="14" fill="${f.haupt}" ${S3}/>`],
  digital: (f) => ["#0b0d28", "#3a1a6a", "#14183a",
    `<g stroke="${f.akzent}" stroke-width="1.5" opacity="0.5"><path d="M0,150 H400 M0,120 H400 M0,90 H400 M60,0 V230 M140,0 V230 M220,0 V230 M300,0 V230 M380,0 V230"/></g>
     <rect x="96" y="150" width="40" height="84" fill="#1b1f4a" ${S}/>${fenster(104, 160, 3, 5, f.zweit)}
     <rect x="196" y="122" width="36" height="112" fill="#23285a" ${S}/>${fenster(203, 132, 3, 7, f.akzent, 9)}
     <rect x="236" y="76" width="46" height="158" fill="#1b1f4a" ${S}/>${fenster(244, 88, 3, 10, f.zweit)}<path d="M259,76 v-22" stroke="${f.zweit}" stroke-width="4" stroke-linecap="round"/><circle cx="259" cy="52" r="4" fill="#ff4bd8"/>
     <rect x="286" y="142" width="30" height="92" fill="#23285a" ${S}/>${fenster(292, 152, 2, 5, "#ff4bd8")}
     <rect x="320" y="102" width="42" height="132" fill="#1b1f4a" ${S}/>${fenster(328, 112, 3, 8, f.akzent)}
     <rect x="366" y="134" width="36" height="100" fill="#23285a" ${S}/>${fenster(373, 144, 2, 6, f.zweit)}`],
};

function zeitalterSzene(z, nacht) {
  const f = z.farben;
  if (z.id === "steinzeit") return steinzeitSzene(f, nacht);
  const [oben, unten, boden, teile] = (SZENEN[z.id] || ((ff) => [ff.zweit, ff.zweit, ff.haupt, huegel(ff.haupt)]))(f);
  const digital = z.id === "digital";
  const dunkel = nacht || digital;
  let t = himmel(nacht && !digital ? "#2a1f47" : oben, nacht && !digital ? "#5a3d6b" : unten);
  if (digital) t += `<circle cx="330" cy="52" r="26" fill="#f7931a" ${S}/><text x="330" y="64" font-size="34" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" fill="#fff">₿</text>`;
  else if (nacht) t += `<circle cx="330" cy="52" r="26" fill="#f1ead8" ${S}/><circle cx="319" cy="46" r="20" fill="#2a1f47" opacity="0.9"/>`;
  else t += `<circle cx="330" cy="52" r="26" fill="${z.nummer === 10 ? "#e8b07a" : "#ffd54a"}" ${S}/>`;
  t += wolken(dunkel ? 0.12 : 0.75) + teile;
  t += `<path d="${GRUND}" fill="${boden}" ${S}/>`;
  if (digital) t += `<g stroke="${f.zweit}" stroke-width="2" opacity="0.6" fill="none"><path d="M0,250 H400 M0,272 H400 M200,232 V300 M120,228 L60,300 M280,236 L340,300"/></g>`;
  if (nacht && !digital) t += `<rect y="96" width="400" height="204" fill="#1a1030" opacity="0.42"/>`;
  return t;
}

export function szeneBild(zeitalter, seite) {
  const nacht = seite === "boese";
  return alsBild(["szene", zeitalter.id, nacht ? 1 : 0].join("|"), () =>
    svg(400, 300, zeitalterSzene(zeitalter, nacht), 'preserveAspectRatio="xMidYMax slice"')
  );
}

// ---------- Tiere ----------
const HELL = "#f6ead0";
const NEON = "#1fe3e3";
const linie = (d, farbe, breite) =>
  `<path d="${d}" fill="none" stroke="${U}" stroke-width="${breite + 6}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${farbe}" stroke-width="${breite}" stroke-linecap="round"/>`;
const auge = (x, y, o) =>
  o.robo
    ? `<circle cx="${x}" cy="${y}" r="5" fill="${o.neon || NEON}" ${S3}/>`
    : `<ellipse cx="${x}" cy="${y}" rx="3" ry="4.2" fill="${U}"/><circle cx="${x + 1}" cy="${y - 1.4}" r="1.1" fill="#fff"/>`;

function vier(o) {
  const c = o.c;
  const c2 = o.c2 || "#5a3a22";
  let t = `<ellipse cx="50" cy="91" rx="34" ry="5" fill="#000" opacity="0.2"/>`;
  if (o.fluegel) t += `<path d="M44,50 Q24,6 66,18 Q54,30 58,50 Z" fill="${o.fluegel}" ${S}/>`;
  if (o.schwanz === "lang") t += linie("M20,60 q-16,-4 -10,-24", c, 5);
  else if (o.schwanz === "busch") t += `<path d="M22,62 Q-4,62 6,36 Q22,40 26,56 Z" fill="${c}" ${S}/><path d="M6,36 Q4,46 10,50" fill="none" stroke="${HELL}" stroke-width="5" stroke-linecap="round"/>`;
  else if (o.schwanz === "flach") t += `<ellipse cx="12" cy="70" rx="13" ry="6" fill="#5a3a22" ${S}/>`;
  else if (o.schwanz === "kringel") t += linie("M20,62 q-18,2 -14,-14 q4,-10 12,-4 q4,6 -4,8", c, 5);
  else if (o.schwanz !== "ohne") t += `<circle cx="18" cy="56" r="6.5" fill="${c}" ${S}/>`;
  if (o.hoecker) t += `<circle cx="44" cy="42" r="14" fill="${c}" ${S}/>`;
  for (const x of [24, 36, 56, 68]) t += `<rect x="${x}" y="68" width="11" height="21" rx="5" fill="${o.robo ? "#8a94a3" : c}" ${S}/>`;
  t += `<ellipse cx="46" cy="60" rx="30" ry="19" fill="${c}" ${S}/>`;
  if (o.bauch) t += `<ellipse cx="46" cy="68" rx="20" ry="9" fill="${o.bauch}"/>`;
  if (o.sattel) t += `<path d="M30,46 Q46,36 60,46 L58,58 Q46,52 32,58 Z" fill="${o.sattel}" ${S3}/><path d="M34,56 v10" ${S3}/>`;
  if (o.streifen) t += `<path d="M34,44 l3,14 M46,42 l2,14 M58,45 l1,12" fill="none" ${S3}/>`;
  if (o.flecken) t += `<circle cx="34" cy="54" r="4.5" fill="${c2}"/><circle cx="50" cy="62" r="5.5" fill="${c2}"/><circle cx="44" cy="48" r="3.5" fill="${c2}"/><circle cx="30" cy="68" r="3" fill="${c2}"/>`;
  if (o.panzer) t += `<path d="M22,52 l8,-10 l8,10 l8,-10 l8,10 l8,-10 l8,10" fill="${c2}" ${S3}/>`;
  if (o.zeichen) t += `<text x="44" y="70" font-size="24" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" fill="#fff">${o.zeichen}</text>`;
  if (o.robo) t += `<circle cx="30" cy="58" r="2.5" fill="${U}"/><circle cx="60" cy="66" r="2.5" fill="${U}"/><path d="M40,46 h14" stroke="${o.neon || NEON}" stroke-width="4" stroke-linecap="round"/>`;
  if (o.schornstein) t += `<rect x="38" y="24" width="12" height="20" fill="#5a4a44" ${S}/><circle cx="44" cy="14" r="7" fill="#f1ede6" opacity="0.9"/><circle cx="52" cy="6" r="5" fill="#f1ede6" opacity="0.8"/>`;
  if (o.maehne) t += `<circle cx="70" cy="42" r="25" fill="${c2}" ${S}/>`;
  if (o.pferd) t += `<path d="M58,22 q-14,12 -8,34 l10,-4 q-2,-14 8,-24 z" fill="${c2}" ${S}/>`;
  if (o.ohren === "rund") t += `<circle cx="60" cy="26" r="8" fill="${o.ohr || c}" ${S}/><circle cx="84" cy="26" r="8" fill="${o.ohr || c}" ${S}/>`;
  if (o.ohren === "spitz") t += `<path d="M54,34 L58,12 L70,28 Z M76,28 L88,12 L90,34 Z" fill="${o.ohr || c}" ${S}/>`;
  if (o.ohren === "lang") t += `<ellipse cx="62" cy="16" rx="6" ry="16" fill="${c}" ${S} transform="rotate(-12 62 16)"/><ellipse cx="80" cy="16" rx="6" ry="16" fill="${c}" ${S} transform="rotate(10 80 16)"/>`;
  if (o.ohren === "gross") t += `<ellipse cx="56" cy="42" rx="13" ry="18" fill="${o.ohr || c}" ${S}/>`;
  if (o.horn) t += linie("M62,28 q-10,-12 0,-22", HELL, 4) + linie("M82,28 q10,-12 0,-22", HELL, 4);
  t += `<circle cx="72" cy="42" r="18" fill="${o.kopf || c}" ${S}/>`;
  if (o.augenfleck) t += `<ellipse cx="76" cy="40" rx="7" ry="8" fill="${U}"/>`;
  if (o.schnabel) t += `<path d="M84,38 l16,8 l-16,7 z" fill="#f2b632" ${S}/>`;
  else if (o.ruessel) t += linie("M88,46 q12,6 6,28", c, 8);
  else if (o.schnauze === "lang") t += `<ellipse cx="88" cy="49" rx="13" ry="7.5" fill="${o.maul || HELL}" ${S}/><circle cx="97" cy="46" r="3" fill="${U}"/>`;
  else t += `<ellipse cx="85" cy="49" rx="9" ry="7" fill="${o.maul || HELL}" ${S}/><circle cx="90" cy="46" r="3" fill="${o.nase || U}"/>`;
  if (o.stosszaehne) t += linie("M82,54 q4,16 16,8", "#fff", 4);
  if (o.zaehne) t += `<path d="M80,54 l3,12 l3,-12 z M88,54 l3,10 l3,-10 z" fill="#fff" ${S3}/>`;
  if (o.nashorn) t += `<path d="M90,44 l8,-18 l4,20 z" fill="${o.robo ? "#e8751a" : HELL}" ${S}/>`;
  if (o.bart) t += `<path d="M80,56 q2,12 6,14 q2,-8 2,-14 z" fill="${HELL}" ${S3}/>`;
  if (o.ring) t += `<circle cx="88" cy="56" r="4" fill="none" stroke="#f2c230" stroke-width="3"/>`;
  t += auge(o.augenfleck ? 77 : 75, 39, o.augenfleck ? { robo: false } : o);
  if (o.augenfleck) t += `<circle cx="77" cy="39" r="2.4" fill="#fff"/>`;
  if (o.robo) t += `<path d="M72,24 v-12" ${S3}/><circle cx="72" cy="10" r="4" fill="${o.neon || NEON}" ${S3}/>`;
  return t;
}

function vogel(o) {
  const c = o.c;
  const c2 = o.c2 || "#5a3a22";
  let t = `<ellipse cx="50" cy="91" rx="26" ry="5" fill="#000" opacity="0.2"/>`;
  if (o.faecher) {
    t += `<path d="M48,62 L4,44 Q2,6 44,4 Q78,2 86,30 Z" fill="${c2}" ${S}/>`;
    for (const [x, y] of [[20, 34], [34, 18], [54, 14], [70, 24]]) t += `<circle cx="${x}" cy="${y}" r="5.5" fill="#f2c230" ${S3}/><circle cx="${x}" cy="${y}" r="2" fill="${c}"/>`;
  } else if (o.flammen) t += `<path d="M30,66 Q2,70 6,40 Q14,52 18,44 Q10,28 24,20 Q24,36 34,40 Z" fill="#f2761e" ${S}/><path d="M26,60 Q12,58 14,44 Q22,50 28,46 Z" fill="#ffd54a"/>`;
  else t += `<path d="M30,62 L8,74 L12,58 L6,50 L28,50 Z" fill="${c2}" ${S}/>`;
  t += `<path d="M42,78 v10 M56,78 v10" fill="none" stroke="${U}" stroke-width="8" stroke-linecap="round"/><path d="M42,78 v10 M56,78 v10" fill="none" stroke="#f2b632" stroke-width="3.5" stroke-linecap="round"/>`;
  t += `<ellipse cx="48" cy="58" rx="24" ry="22" fill="${c}" ${S}/>`;
  if (o.bauch) t += `<ellipse cx="54" cy="64" rx="13" ry="13" fill="${o.bauch}"/>`;
  t += `<path d="M30,52 Q32,76 52,70 Q44,56 30,52 Z" fill="${c2}" ${S}/>`;
  if (o.krawatte) t += `<path d="M62,54 l5,6 l-4,16 l-5,-16 z" fill="#b3342e" ${S3}/>`;
  const r = o.eule ? 19 : 15;
  if (o.eule) t += `<path d="M50,20 l4,-12 l8,10 z M74,18 l8,-10 l2,13 z" fill="${c2}" ${S}/>`;
  if (o.flammen) t += `<path d="M58,24 Q52,6 66,4 Q64,12 72,12 Q74,2 82,8 Q76,16 78,26 Z" fill="#f2761e" ${S}/>`;
  t += `<circle cx="66" cy="36" r="${r}" fill="${o.kopf || c}" ${S}/>`;
  t += `<path d="M${o.eule ? 66 : 79},${o.eule ? 40 : 34} l${o.eule ? 6 : 15},6 l-${o.eule ? 6 : 15},6 z" fill="#f2b632" ${S}/>`;
  if (o.eule) t += `<circle cx="59" cy="33" r="7" fill="#fff" ${S3}/><circle cx="75" cy="33" r="7" fill="#fff" ${S3}/><circle cx="60" cy="33" r="3" fill="${U}"/><circle cx="74" cy="33" r="3" fill="${U}"/>`;
  else t += auge(69, 33, o);
  return t;
}

function fisch(o) {
  const c = o.c;
  const g = o.gross ? 1.15 : 1;
  let t = `<ellipse cx="50" cy="90" rx="30" ry="5" fill="#000" opacity="0.2"/><g transform="translate(${50 - 50 * g},${56 - 56 * g}) scale(${g})">`;
  t += `<path d="M24,56 L4,38 Q10,56 4,74 Z" fill="${o.c2 || c}" ${S}/><path d="M44,40 Q50,22 62,36 Z" fill="${o.c2 || c}" ${S}/>`;
  t += `<ellipse cx="52" cy="56" rx="32" ry="19" fill="${c}" ${S}/><path d="M24,62 Q52,82 82,62 Q52,72 24,62 Z" fill="${o.bauch || HELL}"/>`;
  if (o.schnauze) t += `<ellipse cx="86" cy="60" rx="10" ry="5" fill="${c}" ${S}/>`;
  if (o.schuppen) t += `<path d="M36,50 q4,6 8,0 q4,6 8,0 M40,60 q4,6 8,0 q4,6 8,0" fill="none" ${S3} opacity="0.6"/>`;
  if (o.neon) t += `<path d="M30,50 h22 M34,58 h14" stroke="${o.neon}" stroke-width="4" stroke-linecap="round"/>`;
  if (o.zeichen) t += `<text x="46" y="66" font-size="22" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" fill="${o.neon || "#fff"}">${o.zeichen}</text>`;
  if (o.schnurr) t += `<path d="M78,58 l14,-4 M78,62 l14,2" fill="none" ${S3}/>`;
  t += `<path d="M56,64 q-2,10 -12,10" fill="none" ${S3}/>` + auge(70, 50, o) + `<path d="M74,62 q5,3 9,-1" fill="none" ${S3}/></g>`;
  return t;
}

function schlange(o) {
  const d = "M18,84 q22,-22 40,-6 q16,12 22,-8 q6,-20 -10,-28";
  return `<ellipse cx="50" cy="91" rx="30" ry="5" fill="#000" opacity="0.2"/><path d="${d}" fill="none" stroke="${U}" stroke-width="22" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${o.c}" stroke-width="13" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${o.c2}" stroke-width="13" stroke-linecap="round" stroke-dasharray="6 14"/><path d="M82,38 l12,-4 M94,34 l5,-4 M94,34 l5,3" fill="none" stroke="#d93a3a" stroke-width="3" stroke-linecap="round"/><ellipse cx="70" cy="38" rx="14" ry="12" fill="${o.c}" ${S}/>${auge(74, 36, o)}`;
}

function krabbe(o) {
  let t = `<ellipse cx="50" cy="90" rx="30" ry="5" fill="#000" opacity="0.2"/>`;
  t += `<path d="M28,70 l-12,14 M38,76 l-6,12 M62,76 l6,12 M72,70 l12,14 M26,56 Q10,56 16,40 M74,56 Q90,56 84,40" fill="none" stroke="${U}" stroke-width="9" stroke-linecap="round"/><path d="M28,70 l-12,14 M38,76 l-6,12 M62,76 l6,12 M72,70 l12,14 M26,56 Q10,56 16,40 M74,56 Q90,56 84,40" fill="none" stroke="${o.c}" stroke-width="4" stroke-linecap="round"/>`;
  t += `<path d="M16,40 Q2,34 10,20 L16,30 L22,20 Q28,34 16,40 Z M84,40 Q98,34 90,20 L84,30 L78,20 Q72,34 84,40 Z" fill="${o.c}" ${S}/>`;
  t += `<ellipse cx="50" cy="62" rx="27" ry="18" fill="${o.c}" ${S}/><path d="M40,46 v-10 M60,46 v-10" ${S}/><circle cx="40" cy="32" r="6" fill="#fff" ${S3}/><circle cx="60" cy="32" r="6" fill="#fff" ${S3}/><circle cx="41" cy="32" r="2.5" fill="${U}"/><circle cx="61" cy="32" r="2.5" fill="${U}"/><path d="M42,66 q8,6 16,0" fill="none" ${S3}/>`;
  return t;
}

function raupe(o) {
  let t = `<ellipse cx="50" cy="90" rx="34" ry="5" fill="#000" opacity="0.2"/>`;
  [[16, 74], [30, 68], [44, 72], [58, 66]].forEach(([x, y], i) => (t += `<circle cx="${x}" cy="${y}" r="13" fill="${i % 2 ? o.c2 : o.c}" ${S}/>`));
  t += `<path d="M70,40 q-2,-14 -10,-16 M80,40 q2,-14 10,-16" fill="none" ${S3}/><circle cx="74" cy="56" r="17" fill="${o.c}" ${S}/>${auge(72, 53, o)}${auge(82, 53, o)}<path d="M72,63 q5,4 10,0" fill="none" ${S3}/>`;
  return t;
}

const T = (form, o) => ({ form, ...o });
const TIERE = {
  mammut: T(vier, { c: "#8a5a3a", ohren: "gross", ruessel: true, stosszaehne: true, schwanz: "lang" }),
  saebelzahntiger: T(vier, { c: "#e8a04a", ohren: "spitz", streifen: true, zaehne: true, schwanz: "lang" }),
  wolf: T(vier, { c: "#8a8f99", ohren: "spitz", schnauze: "lang", schwanz: "busch" }),
  hoehlenbaer: T(vier, { c: "#6b4a32", ohren: "rund" }),
  rind: T(vier, { c: "#f4efe2", c2: "#4a3a32", flecken: true, horn: true, ohren: "rund", maul: "#f2b8a8", schwanz: "lang" }),
  wildschwein: T(vier, { c: "#6b5040", ohren: "spitz", schnauze: "lang", maul: "#c9a08a", stosszaehne: true }),
  krabbe: T(krabbe, { c: "#e8563a" }),
  ziege: T(vier, { c: "#efe8d8", horn: true, bart: true, ohren: "rund" }),
  loewe: T(vier, { c: "#e8b44a", c2: "#a8642a", maehne: true, schwanz: "lang" }),
  esel: T(vier, { c: "#9a948c", ohren: "lang", schwanz: "lang" }),
  schlange: T(schlange, { c: "#5d9a3c", c2: "#3f6b2a" }),
  adler: T(vogel, { c: "#6b4a32", c2: "#4a3220", kopf: "#f4efe2" }),
  pferd: T(vier, { c: "#a8642a", c2: "#4a3220", pferd: true, ohren: "spitz", schnauze: "lang", maul: "#a8642a", schwanz: "busch" }),
  eule: T(vogel, { c: "#9a7a5a", c2: "#6b4a32", eule: true, bauch: "#e8d5a8" }),
  delfin: T(fisch, { c: "#5a9ad0", schnauze: true }),
  stier: T(vier, { c: "#4a3a32", horn: true, ohren: "rund", ring: true, schwanz: "lang" }),
  woelfin: T(vier, { c: "#b9a892", ohren: "spitz", schnauze: "lang", schwanz: "busch" }),
  elefant: T(vier, { c: "#9aa3ad", ohren: "gross", ruessel: true, stosszaehne: true, schwanz: "lang" }),
  gans: T(vogel, { c: "#f4efe2", c2: "#d9d0c0" }),
  falke: T(vogel, { c: "#8a8f99", c2: "#5a5f69", bauch: "#e8e2d0" }),
  kamel: T(vier, { c: "#d9b06a", hoecker: true, ohren: "rund", schnauze: "lang", maul: "#d9b06a", schwanz: "lang" }),
  seidenraupe: T(raupe, { c: "#f4efe2", c2: "#d9e8b0" }),
  panda: T(vier, { c: "#f4f1ea", ohren: "rund", ohr: "#2b2b33", augenfleck: true }),
  greif: T(vier, { c: "#d9a53a", fluegel: "#f4efe2", schnabel: true, ohren: "spitz", kopf: "#f4efe2", schwanz: "lang" }),
  drache: T(vier, { c: "#4f9a5a", c2: "#2f6b3a", fluegel: "#b3342e", horn: true, panzer: true, schnauze: "lang", maul: "#4f9a5a", schwanz: "lang" }),
  karpfen: T(fisch, { c: "#e8853a", schuppen: true }),
  tiger: T(vier, { c: "#e8853a", ohren: "rund", streifen: true, schwanz: "lang" }),
  fuchs: T(vier, { c: "#e0703a", ohren: "spitz", schnauze: "lang", schwanz: "busch" }),
  papagei: T(vogel, { c: "#d93a3a", c2: "#3c8fe0", bauch: "#f2c230" }),
  jaguar: T(vier, { c: "#e8b44a", c2: "#4a3220", ohren: "rund", flecken: true, schwanz: "lang" }),
  seehund: T(fisch, { c: "#8a94a3", schnurr: true }),
  krokodil: T(vier, { c: "#5d8a3a", c2: "#3f6b2a", panzer: true, schnauze: "lang", maul: "#5d8a3a", zaehne: true, schwanz: "lang" }),
  bulle: T(vier, { c: "#2e7d4f", horn: true, ohren: "rund", ring: true, schwanz: "lang" }),
  baer: T(vier, { c: "#b3342e", ohren: "rund" }),
  biber: T(vier, { c: "#7a5236", ohren: "rund", zaehne: true, schwanz: "flach" }),
  pfau: T(vogel, { c: "#2f6fb0", c2: "#2e9a7a", faecher: true }),
  dampfpferd: T(vier, { c: "#8a6a4a", c2: "#4a3a32", pferd: true, ohren: "spitz", schnauze: "lang", maul: "#8a6a4a", schornstein: true, robo: true, neon: "#e8751a", schwanz: "ohne" }),
  maulwurf: T(vier, { c: "#3a3540", nase: "#f08a9a", maul: "#5a5560" }),
  ratte: T(vier, { c: "#8a857c", ohren: "rund", ohr: "#f2b8a8", schnauze: "lang", schwanz: "lang" }),
  stahlnashorn: T(vier, { c: "#7f8b98", ohren: "rund", nashorn: true, robo: true, neon: "#e8751a", schwanz: "ohne" }),
  adleranzug: T(vogel, { c: "#25355e", c2: "#17223f", kopf: "#f4efe2", krawatte: true, bauch: "#f4efe2" }),
  gepard: T(vier, { c: "#f0c45a", c2: "#3a2a1a", ohren: "rund", flecken: true, schwanz: "lang" }),
  roboterhund: T(vier, { c: "#b9c2cf", ohren: "spitz", schnauze: "lang", maul: "#8a94a3", robo: true, schwanz: "ohne" }),
  chamaeleon: T(vier, { c: "#5fc05a", c2: "#f2c230", flecken: true, schwanz: "kringel", schnauze: "lang", maul: "#5fc05a" }),
  robofuchs: T(vier, { c: "#2b2f5a", ohren: "spitz", schnauze: "lang", maul: "#3a3f7a", robo: true, neon: "#ff4bd8", schwanz: "busch" }),
  kryptowal: T(fisch, { c: "#23285a", bauch: "#3a3f7a", gross: true, neon: NEON, zeichen: "" }),
  neonphoenix: T(vogel, { c: "#a24bff", c2: "#ff4bd8", flammen: true, bauch: NEON }),
  btcdrache: T(vier, { c: "#f7931a", c2: "#b8650a", fluegel: "#a24bff", horn: true, panzer: true, schnauze: "lang", maul: "#f7931a", zeichen: "₿", schwanz: "lang" }),
};

export function tierBild(id) {
  return alsBild("tier|" + id, () => {
    const t = TIERE[id] || T(vier, { c: "#b9a892", ohren: "rund" });
    return svg(104, 100, `<g transform="translate(2,4)">${t.form(t)}</g>`);
  });
}

// ---------- Währung je Zeitalter ----------
const muenze = (farbe, zeichen, rand = "#fff") =>
  `<circle cx="32" cy="32" r="26" fill="${farbe}" ${S}/><circle cx="32" cy="32" r="18" fill="none" stroke="${rand}" stroke-width="3" opacity="0.55"/>` +
  (zeichen ? `<text x="32" y="42" font-size="28" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" fill="${U}">${zeichen}</text>` : `<circle cx="32" cy="32" r="6" fill="${U}" opacity="0.5"/>`) +
  `<path d="M16,22 q6,-10 16,-12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`;
const schein = (farbe, zeichen) =>
  `<rect x="3" y="14" width="58" height="36" rx="5" fill="${farbe}" ${S}/><rect x="9" y="20" width="46" height="24" rx="3" fill="none" stroke="${U}" stroke-width="2" opacity="0.5"/><circle cx="32" cy="32" r="10" fill="#fff" opacity="0.5"/><text x="32" y="39" font-size="19" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" fill="${U}">${zeichen}</text>`;
const GELD = {
  steinzeit: () => `<path d="M10,40 Q6,18 28,10 Q52,6 58,28 Q60,50 38,56 Q16,58 10,40 Z" fill="#7f8792" ${S}/><path d="M20,22 q8,-8 18,-6" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.5"/><path d="M34,56 Q54,48 56,30" fill="none" stroke="#000" stroke-width="6" opacity="0.18"/>`,
  muscheln: () => `<path d="M32,56 Q2,44 8,22 Q32,0 56,22 Q62,44 32,56 Z" fill="#f7d9c8" ${S}/><path d="M32,54 L14,22 M32,54 L26,14 M32,54 L38,14 M32,54 L50,22" fill="none" ${S3} opacity="0.55"/><rect x="24" y="52" width="16" height="7" rx="3" fill="#f2b8a8" ${S3}/>`,
  bronzezeit: () => `<path d="M6,46 L16,24 H48 L58,46 Z" fill="#c6cdd4" ${S}/><path d="M16,24 L22,16 H42 L48,24" fill="#e2e7ec" ${S}/><path d="M18,38 h28" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.6"/>`,
  muenzen: () => muenze("#f2b632"),
  rom: () => muenze("#c6cdd4"),
  mittelalter: () => muenze("#a9adb3"),
  banken: () => muenze("#f2c230", "F"),
  entdeckungen: () => muenze("#d5dbe2", "8"),
  aktien: () => schein("#efe3c2", "£"),
  industrie: () => muenze("#f2b632", "M"),
  fiat: () => schein("#6fbf73", "$"),
  digital: () => muenze("#1fe3e3", "$", "#a24bff"),
};
export function waehrungBild(zeitalter) {
  return alsBild("geld|" + zeitalter.id, () => svg(64, 64, (GELD[zeitalter.id] || GELD.muenzen)()));
}

// ---------- Symbole (Leiste, Amboss, Ei) ----------
const W = "#fff";
const SYMBOLE = {
  upgrades: () => `<path d="M32,6 L56,32 H43 V56 H21 V32 H8 Z" fill="${W}" ${S}/>`,
  waffen: () => `<path d="M8,20 H48 Q58,20 60,28 H46 V36 Q46,42 52,46 V54 H16 V46 Q22,42 22,36 Q10,34 6,22 Z" fill="#d5dbe2" ${S}/><path d="M14,26 h28" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
  tiere: () => `<ellipse cx="32" cy="42" rx="15" ry="12" fill="${W}" ${S}/><circle cx="12" cy="28" r="6.5" fill="${W}" ${S}/><circle cx="25" cy="15" r="6.5" fill="${W}" ${S}/><circle cx="39" cy="15" r="6.5" fill="${W}" ${S}/><circle cx="52" cy="28" r="6.5" fill="${W}" ${S}/>`,
  farm: () => `<rect x="8" y="38" width="11" height="18" rx="2" fill="${W}" ${S}/><rect x="26" y="28" width="11" height="28" rx="2" fill="${W}" ${S}/><rect x="44" y="16" width="11" height="40" rx="2" fill="${W}" ${S}/><path d="M8,24 L24,12 L32,18 L50,4" fill="none" stroke="${U}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8,24 L24,12 L32,18 L50,4" fill="none" stroke="#7be08a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  menue: () => [14, 28, 42].map((y) => `<rect x="10" y="${y}" width="44" height="10" rx="5" fill="${W}" ${S3}/>`).join(""),
  kampf: () => `<g transform="rotate(45 32 32)"><rect x="27" y="2" width="10" height="40" rx="3" fill="#d5dbe2" ${S}/><path d="M27,2 L32,-6 L37,2 Z" fill="#d5dbe2" ${S3}/><rect x="18" y="40" width="28" height="7" rx="3" fill="#f2c230" ${S}/><rect x="28" y="47" width="8" height="13" rx="3" fill="#9a6a3c" ${S}/></g>`,
  dungeons: () => `<path d="M12,58 V28 Q12,6 32,6 Q52,6 52,28 V58 Z" fill="#9a6a3c" ${S}/><path d="M32,6 V58 M12,34 H52" ${S3} fill="none"/><circle cx="40" cy="40" r="3.5" fill="#f2c230" ${S3}/>`,
  held: () => `<circle cx="32" cy="22" r="14" fill="${W}" ${S}/><path d="M8,58 Q8,38 32,38 Q56,38 56,58 Z" fill="${W}" ${S}/>`,
  geld: () => `<circle cx="32" cy="32" r="25" fill="#f7931a" ${S}/><text x="32" y="45" font-size="36" font-weight="900" font-family="Arial, sans-serif" text-anchor="middle" fill="#fff">₿</text>`,
  muenze: () => `<circle cx="32" cy="32" r="25" fill="#f2c230" ${S}/><circle cx="32" cy="32" r="16" fill="none" stroke="${U}" stroke-width="3" opacity="0.45"/><path d="M26,24 h8 q8,0 8,8 q0,8 -8,8 h-8 z" fill="#fff" opacity="0.55"/>`,
  schwert: () => `<g transform="rotate(40 32 32)"><path d="M27,2 L37,2 L37,40 L27,40 Z" fill="#d5dbe2" ${S3}/><path d="M32,-6 L37,2 L27,2 Z" fill="#d5dbe2" ${S3}/><rect x="20" y="40" width="24" height="6" rx="3" fill="#f2c230" ${S3}/><rect x="29" y="46" width="6" height="12" rx="3" fill="#9a6a3c" ${S3}/></g>`,
  herz: () => `<path d="M32,56 Q4,36 10,18 Q18,4 32,18 Q46,4 54,18 Q60,36 32,56 Z" fill="#e8475a" ${S}/>`,
  bogen: () => `<path d="M18,8 Q52,32 18,56" fill="none" stroke="${U}" stroke-width="9" stroke-linecap="round"/><path d="M18,8 Q52,32 18,56" fill="none" stroke="#9a6a3c" stroke-width="4" stroke-linecap="round"/><line x1="18" y1="8" x2="18" y2="56" stroke="${U}" stroke-width="2.5"/>`,
  schloss: () => `<path d="M20,30 V20 Q20,8 32,8 Q44,8 44,20 V30" fill="none" stroke="${U}" stroke-width="11" stroke-linecap="round"/><path d="M20,30 V20 Q20,8 32,8 Q44,8 44,20 V30" fill="none" stroke="#c6cdd4" stroke-width="5" stroke-linecap="round"/><rect x="12" y="28" width="40" height="30" rx="7" fill="#f2c230" ${S}/><circle cx="32" cy="41" r="4.5" fill="${U}"/><path d="M32,42 v8" ${S3}/>`,
  uhr: () => `<circle cx="32" cy="32" r="24" fill="#f4efe2" ${S}/><path d="M32,16 V32 L44,38" fill="none" ${S}/>`,
  krone: () => `<path d="M8,48 L6,16 L20,30 L32,10 L44,30 L58,16 L56,48 Z" fill="#f2c230" ${S}/><rect x="8" y="46" width="48" height="9" rx="3" fill="#e8475a" ${S3}/><circle cx="32" cy="34" r="4.5" fill="#e8475a" ${S3}/>`,
  ticket: () => `<path d="M6,18 H58 V28 Q52,32 58,36 V46 H6 V36 Q12,32 6,28 Z" fill="#f2c230" ${S}/><path d="M24,20 V44" stroke="${U}" stroke-width="3" stroke-dasharray="4 4"/><path d="M38,26 l3,6 l6,1 l-4,4 l1,6 l-6,-3 l-6,3 l1,-6 l-4,-4 l6,-1 z" fill="#fff" opacity="0.8"/>`,
  ei: () => `<path d="M32,6 Q52,6 54,36 Q54,58 32,58 Q10,58 10,36 Q12,6 32,6 Z" fill="#f4efe2" ${S}/><circle cx="26" cy="28" r="5" fill="#d9c9a0"/><circle cx="40" cy="40" r="6" fill="#d9c9a0"/><circle cx="28" cy="46" r="3.5" fill="#d9c9a0"/>`,
  stern: () => `<path d="M32,4 L40,24 L60,26 L44,40 L50,60 L32,48 L14,60 L20,40 L4,26 L24,24 Z" fill="#ffd54a" ${S}/>`,
  schatz: () => `<path d="M8,28 Q8,12 32,12 Q56,12 56,28 Z" fill="#9a6a3c" ${S}/><rect x="8" y="28" width="48" height="26" rx="4" fill="#7a4b26" ${S}/><rect x="27" y="24" width="10" height="14" rx="3" fill="#f2c230" ${S3}/><path d="M8,40 H56" stroke="#f2c230" stroke-width="4"/>`,
  tippen: () => `<path d="M24,58 Q12,48 12,38 Q12,32 18,32 L22,36 V12 Q22,7 27,7 Q32,7 32,12 V26 Q34,22 38,24 Q41,25 41,29 Q44,26 47,28 Q50,30 50,34 V44 Q50,54 42,58 Z" fill="#f3c9a0" ${S}/>`,
  tech: () => `<path d="M26,6 H38 V24 L52,50 Q54,58 46,58 H18 Q10,58 12,50 L26,24 Z" fill="#dff1f6" ${S}/><path d="M19,42 H45 L50,51 Q51,55 46,55 H18 Q13,55 14,51 Z" fill="#4fc46a"/><rect x="22" y="4" width="20" height="7" rx="3" fill="#c6cdd4" ${S3}/>`,
  plus: () => `<path d="M32,10 V54 M10,32 H54" stroke="${U}" stroke-width="18" stroke-linecap="round"/><path d="M32,10 V54 M10,32 H54" stroke="#6fe08a" stroke-width="9" stroke-linecap="round"/>`,
  nest: () => `<path d="M6,36 Q32,62 58,36 Q46,44 32,44 Q18,44 6,36 Z" fill="#9a6a3c" ${S}/><path d="M32,10 Q44,10 45,28 Q45,40 32,40 Q19,40 19,28 Q20,10 32,10 Z" fill="#f4efe2" ${S}/>`,
  beutel: () => `<path d="M22,18 Q8,34 12,48 Q16,58 32,58 Q48,58 52,48 Q56,34 42,18 Z" fill="#b98a3e" ${S}/><path d="M22,18 Q32,10 42,18" fill="none" ${S}/><path d="M20,10 L26,18 H38 L44,10 Q32,4 20,10 Z" fill="#b98a3e" ${S}/><circle cx="32" cy="40" r="8" fill="#f2c230" ${S3}/>`,
  schluessel: () => `<circle cx="20" cy="22" r="13" fill="#f2c230" ${S}/><circle cx="20" cy="22" r="5" fill="#9a6a3c" ${S3}/><path d="M30,30 L56,56 M44,44 l-6,6 M50,50 l-6,6" stroke="${U}" stroke-width="11" stroke-linecap="round"/><path d="M30,30 L56,56 M44,44 l-6,6 M50,50 l-6,6" stroke="#f2c230" stroke-width="5" stroke-linecap="round"/>`,
  zu: () => `<path d="M16,16 L48,48 M48,16 L16,48" fill="none" stroke="${U}" stroke-width="16" stroke-linecap="round"/><path d="M16,16 L48,48 M48,16 L16,48" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
  pfeil: () => `<path d="M2,32 H44" stroke="${U}" stroke-width="9" stroke-linecap="round"/><path d="M2,32 H44" stroke="#9a6a3c" stroke-width="4" stroke-linecap="round"/><path d="M62,32 L44,22 V42 Z" fill="#d5dbe2" ${S3}/>`,
  blitz: () => `<path d="M38,4 L12,36 H30 L24,60 L52,26 H34 Z" fill="#ffd54a" ${S}/>`,
  ziel: () => `<circle cx="32" cy="32" r="25" fill="#fff" ${S}/><circle cx="32" cy="32" r="16" fill="#e8475a" ${S3}/><circle cx="32" cy="32" r="7" fill="#fff" ${S3}/>`,
  schild: () => `<path d="M32,6 L54,14 V30 Q54,50 32,58 Q10,50 10,30 V14 Z" fill="#8a94a3" ${S}/><path d="M32,14 L46,19 V30 Q46,44 32,50 Z" fill="#c6cdd4"/>`,
  feder: () => `<path d="M50,8 Q20,14 14,46 L10,58 L18,50 Q46,44 50,8 Z" fill="#dff1f6" ${S}/><path d="M16,50 Q30,30 44,16" fill="none" stroke="${U}" stroke-width="3" stroke-linecap="round"/>`,
  tropfen: () => `<path d="M32,6 Q52,32 52,42 Q52,58 32,58 Q12,58 12,42 Q12,32 32,6 Z" fill="#e8475a" ${S}/><path d="M22,40 Q22,32 28,26" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`,
  amboss: () => `<path d="M4,30 H40 Q48,30 50,36 H38 V42 Q38,46 42,50 V56 H12 V50 Q16,46 16,42 Q6,40 4,30 Z" fill="#8a94a3" ${S}/><g transform="rotate(30 44 18)"><rect x="41" y="14" width="6" height="30" rx="3" fill="#9a6a3c" ${S3}/><rect x="32" y="4" width="24" height="14" rx="4" fill="#d5dbe2" ${S}/></g>`,
};
// Symbol für eine Tech-Wirkung (mehrere Wirkungen teilen sich ein Bild).
const TECH_BILD = {
  produktion: "beutel", beute: "muenze", offline: "uhr", rabatt: "upgrades", brutplatz: "nest", tempo: "tech",
  schaden: "schwert", leben: "herz", tickets: "ticket", fpunkte: "stern", techpunkte: "tech", bossEi: "krone", schluepfen: "ei", eier: "ei", supporter: "tiere",
  tradingGewinn: "farm", rechenleistung: "geld", farmRabatt: "upgrades", offlineMining: "uhr", energie: "stern",
  gehalt: "beutel", schuldenBremse: "schloss", rechnungen: "muenze", aussehen: "held", sparzins: "plus",
};
export const techBild = (effektId) => symbolBild(TECH_BILD[effektId] || "tech");
const UPGRADE_BILD = {
  klick: "tippen", proSekunde: "beutel", schaden: "schwert", leben: "herz",
  tempo: "uhr", krit: "blitz", kritSchaden: "ziel", block: "schild", ausweichen: "feder", raub: "tropfen", regeneration: "plus", beute: "muenze",
};
export const upgradeBild = (wirkung) => symbolBild(UPGRADE_BILD[wirkung] || "upgrades");
const DUNGEON_BILD = { eier: "ei", ausruestung: "amboss", schatz: "schatz" };
export const dungeonBild = (art) => symbolBild(DUNGEON_BILD[art] || "dungeons");

export function symbolBild(id) {
  return SYMBOLE[id] ? alsBild("symbol|" + id, () => svg(64, 64, SYMBOLE[id]())) : null;
}

// ---------- Reittiere (gleiche Bausteine wie die Tiere, mit Sattel) ----------
const R = (o) => T(vier, { sattel: "#8e2d2d", schwanz: "lang", ...o });
const ROSS = (c, c2, mehr) => R({ c, c2, pferd: true, ohren: "spitz", schnauze: "lang", maul: c, schwanz: "busch", ...mehr });
const REITTIERE = {
  wollnashorn: R({ c: "#8a6a4a", ohren: "rund", nashorn: true }),
  riesenhirsch: R({ c: "#a8763a", ohren: "spitz", horn: true, schnauze: "lang", maul: "#a8763a" }),
  reitochse: R({ c: "#c9a27a", horn: true, ohren: "rund", maul: "#f2b8a8" }),
  pony: ROSS("#d9b88a", "#8a5a3a"),
  onager: R({ c: "#c9b08a", ohren: "lang", schnauze: "lang", maul: "#e8dcc4" }),
  dromedar: R({ c: "#d9b06a", hoecker: true, ohren: "rund", schnauze: "lang", maul: "#d9b06a" }),
  lydischesross: ROSS("#f1ead8", "#f2b632", { sattel: "#8e2d4a" }),
  maultier: R({ c: "#7a5a3a", ohren: "lang", schnauze: "lang", maul: "#c9b08a" }),
  roemerross: ROSS("#3a3038", "#17171c", { sattel: "#7b2a6b" }),
  kriegselefant: R({ c: "#9aa3ad", ohren: "gross", ruessel: true, stosszaehne: true, sattel: "#d9a526" }),
  schlachtross: ROSS("#8a8d91", "#3a3038", { sattel: "#a63a32", panzer: true, c2: "#c6cdd4" }),
  steppenpony: ROSS("#c98a4a", "#5a3a22"),
  schimmel: ROSS("#f4f1ea", "#c6cdd4", { sattel: "#25355e" }),
  kutschpferd: ROSS("#5a3a22", "#2b1a12"),
  mustang: ROSS("#b9773a", "#f1ead8", { flecken: true }),
  lama: R({ c: "#f1ead8", ohren: "lang", schnauze: "lang", maul: "#f1ead8", sattel: "#1e8c93", schwanz: "kurz" }),
  rennpferd: ROSS("#6b3a1a", "#2b1a12", { sattel: "#2e7d4f" }),
  postpferd: ROSS("#b9a892", "#6b5a4a", { sattel: "#b8892b" }),
  dampfross: ROSS("#8a6a4a", "#4a3a32", { schornstein: true, robo: true, neon: "#e8751a", schwanz: "ohne", sattel: "#5f6b76" }),
  eisenochse: R({ c: "#7f8b98", horn: true, ohren: "rund", robo: true, neon: "#e8751a", schwanz: "ohne", sattel: "#e8751a" }),
  rennkamel: R({ c: "#e0c080", hoecker: true, ohren: "rund", schnauze: "lang", maul: "#e0c080", sattel: "#3c6fb5" }),
  stahlhengst: ROSS("#b9c2cf", "#5f6b76", { robo: true, schwanz: "ohne", sattel: "#3fa34d" }),
  neonross: ROSS("#2b2f5a", "#ff4bd8", { robo: true, neon: "#ff4bd8", sattel: "#a24bff" }),
  hoverwolf: R({ c: "#1b1f4a", ohren: "spitz", schnauze: "lang", maul: "#3a3f7a", robo: true, neon: NEON, schwanz: "busch", sattel: "#1fe3e3" }),
};
export function reittierBild(id) {
  return alsBild("reittier|" + id, () => {
    const t = REITTIERE[id] || R({ c: "#b9a892", ohren: "rund" });
    return svg(104, 100, `<g transform="translate(2,4)">${t.form(t)}</g>`);
  });
}

// ---------- Fähigkeiten (ein Symbol je Wirkung) und Eier ----------
const FAEHIGKEIT = {
  schaden: `<path d="M34,4 L46,28 L60,30 L44,42 L50,60 L32,48 L14,60 L20,42 L4,30 L22,28 Z" fill="#ffd54a" ${S}/><circle cx="32" cy="34" r="7" fill="#f2761e" ${S3}/>`,
  heilung: `<path d="M32,56 Q4,36 10,18 Q18,4 32,18 Q46,4 54,18 Q60,36 32,56 Z" fill="#e8475a" ${S}/><path d="M32,24 v18 M23,33 h18" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  staerke: `<path d="M10,40 Q8,22 22,20 Q24,8 36,10 Q42,12 40,22 Q56,22 56,38 Q56,54 34,54 Q14,54 10,40 Z" fill="#f3c9a0" ${S}/><path d="M24,36 q8,-10 18,-2" fill="none" ${S3}/>`,
  flaeche: `<circle cx="32" cy="32" r="8" fill="#ffd54a" ${S3}/><path d="M32,24 V6 M32,40 V58 M24,32 H6 M40,32 H58 M26,26 L12,12 M38,38 L52,52 M38,26 L52,12 M26,38 L12,52" fill="none" stroke="#e8672a" stroke-width="5" stroke-linecap="round"/>`,
  schutz: `<path d="M12,8 H52 V30 Q52,50 32,58 Q12,50 12,30 Z" fill="#6f9ad0" ${S}/><path d="M32,16 V48 M20,30 H44" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
};
export function faehigkeitBild(art) {
  return alsBild("faehigkeit|" + art, () => svg(64, 64, FAEHIGKEIT[art] || FAEHIGKEIT.schaden));
}
export function eiBild(farbe) {
  return alsBild("ei|" + farbe, () =>
    svg(64, 64, `<path d="M32,6 Q52,6 54,36 Q54,58 32,58 Q10,58 10,36 Q12,6 32,6 Z" fill="${farbe}" ${S}/><path d="M20,24 q4,-10 12,-12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.7"/><circle cx="40" cy="38" r="5" fill="#fff" opacity="0.35"/><circle cx="26" cy="44" r="3.5" fill="#fff" opacity="0.35"/>`)
  );
}

// ---------- Weg, auf dem die Figuren laufen ----------
// Erde in den frühen Zeitaltern, dann Pflaster, Asphalt und zuletzt eine Neon-Bahn.
export function wegBild(zeitalter, seite) {
  const nacht = seite === "boese";
  return alsBild(["weg", zeitalter.id, nacht ? 1 : 0].join("|"), () => {
    const n = zeitalter.nummer;
    let t;
    if (n <= 3) {
      const c = n === 2 ? "#d9b46a" : n === 3 ? "#c99a5a" : "#b98a5e";
      t = `<rect width="400" height="48" fill="${c}"/>`;
      for (const [x, y, r] of [[30, 14, 5], [92, 34, 4], [150, 12, 3], [214, 30, 6], [280, 16, 4], [338, 36, 5], [372, 12, 3], [60, 40, 3]]) t += `<ellipse cx="${x}" cy="${y}" rx="${r * 1.6}" ry="${r}" fill="#000" opacity="0.14"/>`;
      t += `<path d="M10,24 q20,-6 40,0 M180,40 q24,-6 48,0 M300,26 q20,-5 40,0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.3"/>`;
    } else if (n <= 9) {
      const c = n >= 7 ? "#b9b0a2" : "#cfc4ae";
      t = `<rect width="400" height="48" fill="${c}"/>`;
      for (let z = 0; z < 3; z++) for (let i = -1; i < 11; i++) t += `<rect x="${i * 40 + (z % 2) * 20 + 2}" y="${z * 16 + 2}" width="36" height="12" rx="5" fill="${(i + z) % 3 ? "#fff" : "#000"}" opacity="${(i + z) % 3 ? 0.22 : 0.1}"/>`;
    } else if (n <= 11) {
      t = `<rect width="400" height="48" fill="#4a4e57"/>`;
      for (let i = 0; i < 7; i++) t += `<rect x="${i * 60 + 10}" y="21" width="34" height="6" rx="2" fill="#f1ead8" opacity="0.85"/>`;
    } else {
      t = `<rect width="400" height="48" fill="#14183a"/><path d="M0,8 H400 M0,40 H400" stroke="#1fe3e3" stroke-width="3"/>`;
      for (let i = 0; i < 9; i++) t += `<path d="M${i * 48 + 10},24 l14,-8 v16 z" fill="#a24bff" opacity="0.7"/>`;
    }
    t += `<path d="M0,2 H400 M0,46 H400" stroke="${U}" stroke-width="5"/>`;
    if (nacht && n !== 12) t += `<rect width="400" height="48" fill="#1a1030" opacity="0.4"/>`;
    return svg(400, 48, t, 'preserveAspectRatio="none"');
  });
}
