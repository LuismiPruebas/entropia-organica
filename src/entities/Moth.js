// MATRIARCA (jefa de la Cavidad Pulmonar): una esfinge de las esporas, mitad polilla y
// mitad mantis. Alas enormes y desgarradas, cubiertas de escamas que son esporas, con
// ocelos que se encienden cuando te fija; tórax acorazado por placas, abdomen
// segmentado que acaba en un aguijón de hueso, brazos de mantis, patas largas con
// espinas, una cresta de púas y antenas que se rizan.
//
// Se dibuja por partes en un lienzo propio de 128x128 en una pose "local" (de frente
// volando, o de lado corriendo con la superficie debajo) y luego se gira con muestreo
// de píxel exacto: así corre por el suelo, las paredes y el techo, y se lanza en picado
// en cualquier dirección. La mueve el comportamiento `bossMoth` (entities/Enemy.js):
//   e.pose   'crawl' | 'fly' | 'aim' | 'dive' | 'stuck'
//   e.rot    giro del dibujo (radianes)   e.face  1 / -1 (hacia dónde mira, en local)
const S = 128, C = 64;
const P = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
const hash = (x, y, k = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

const COL = {
  wingDark: '#1e1822', wing: '#3a3040', wingMid: '#4e4252', wingLight: '#6a5a68', vein: '#9a8676', fringe: '#7a5a6a', hole: '#0c080c',
  ringOut: '#1a0610', ring: '#7a1a48', ringIn: '#c03a7a', pupil: '#e8c8d0',
  shell: '#2a2430', shellMid: '#423a4c', shellLight: '#6e6478', shellShine: '#a89cb4', joint: '#5a2a40',
  sting: '#d8c8b0', stingDark: '#8a7a64', eye: '#ff3aa0', out: '#0c080c',
};

function line(g, x0, y0, x1, y1, c, w = 1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.4));
  for (let i = 0; i <= n; i++) P(g, x0 + ((x1 - x0) * i) / n - (w - 1) / 2, y0 + ((y1 - y0) * i) / n - (w - 1) / 2, c, w, w);
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function oval(g, cx, cy, rx, ry, fill) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d <= 1) P(g, x, y, typeof fill === 'function' ? fill(d, x - cx, y - cy) : fill);
  }
}
// Placa de quitina: contorno, cuerpo y brillo arriba a la izquierda.
function plate(g, cx, cy, rx, ry) {
  oval(g, cx, cy, rx + 0.8, ry + 0.8, COL.out);
  oval(g, cx, cy, rx, ry, (d, x, y) => (d > 0.7 ? COL.shell : x + y < -rx * 0.4 ? COL.shellLight : COL.shellMid));
  P(g, cx - rx * 0.4, cy - ry * 0.5, COL.shellShine);
}

// Ala: polígono (puntos relativos al hombro, mirando a la derecha) con venas, agujeros,
// flecos desgarrados en el borde exterior y ocelos.
function wing(g, gl, sx, sy, pts, side, spots, seed, glowK, edgeFrom) {
  const abs = pts.map(([x, y]) => [sx + x * side, sy + y]);
  const xs = abs.map((p) => p[0]), ys = abs.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const reach = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inPoly(x + 0.5, y + 0.5, abs)) continue;
    const r = Math.hypot(x - sx, y - sy) / reach;
    const n = hash(Math.floor((x - sx) * side / 3), Math.floor((y - sy) / 3), seed);
    if (n > 0.965 && r > 0.35) { P(g, x, y, COL.hole); continue; } // desgarros
    P(g, x, y, r < 0.18 ? COL.wingDark : n < 0.3 ? COL.wing : n < 0.75 ? COL.wingMid : r > 0.6 && n > 0.92 ? COL.wingLight : COL.wingMid);
  }
  // Venas: del hombro hacia el borde exterior, con alguna transversal.
  for (let i = edgeFrom; i < pts.length; i++) {
    const [ex, ey] = abs[i];
    line(g, sx, sy, sx + (ex - sx) * 0.92, sy + (ey - sy) * 0.92, COL.vein);
  }
  for (let i = edgeFrom; i < pts.length - 1; i++) {
    const a = abs[i], b = abs[i + 1];
    line(g, sx + (a[0] - sx) * 0.6, sy + (a[1] - sy) * 0.6, sx + (b[0] - sx) * 0.6, sy + (b[1] - sy) * 0.6, COL.vein);
  }
  // Borde: contorno oscuro y flecos de escamas que cuelgan.
  for (let i = 0; i < abs.length; i++) {
    const a = abs[i], b = abs[(i + 1) % abs.length];
    line(g, a[0], a[1], b[0], b[1], COL.out);
    if (i >= edgeFrom - 1) {
      const n = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let k = 0; k < n; k++) {
        const u = k / n, fx = a[0] + (b[0] - a[0]) * u, fy = a[1] + (b[1] - a[1]) * u;
        const ox = (fx - sx) / Math.max(1, Math.hypot(fx - sx, fy - sy)), oy = (fy - sy) / Math.max(1, Math.hypot(fx - sx, fy - sy));
        const L = 1 + Math.floor(hash(k, i, seed + 3) * 3);
        line(g, fx, fy, fx + ox * L, fy + oy * L + 0.5, COL.fringe);
      }
    }
  }
  // Ocelos: anillos concéntricos; se encienden al fijarte.
  for (const [ox, oy, r] of spots) {
    const cx = sx + ox * side, cy = sy + oy;
    oval(g, cx, cy, r + 1, r + 0.8, COL.ringOut);
    oval(g, cx, cy, r, r * 0.85, COL.ring);
    oval(g, cx, cy, r * 0.55, r * 0.5, COL.ringIn);
    P(g, cx - 0.5, cy - 0.5, COL.pupil, 1, 1);
    if (glowK > 0) oval(gl, cx, cy, r * 0.8, r * 0.7, `rgba(255,60,160,${0.35 + glowK * 0.6})`);
  }
}

// Pata larga con espinas: cadera -> rodilla -> pie.
function spinyLeg(g, hx, hy, kx, ky, fx, fy, far) {
  const c = far ? COL.shell : COL.shellMid;
  line(g, hx, hy, kx, ky, COL.out, 3); line(g, kx, ky, fx, fy, COL.out, 2);
  line(g, hx, hy, kx, ky, c, 2); line(g, kx, ky, fx, fy, far ? COL.shell : COL.shellLight, 1);
  P(g, kx - 1, ky - 1, COL.joint, 2, 2);
  for (let k = 1; k < 4; k++) { const u = k / 4; P(g, kx + (fx - kx) * u + 1, ky + (fy - ky) * u, COL.stingDark); } // espinas
  P(g, fx, fy, COL.sting);
}

// Brazo de mantis: fémur, tibia plegada con dientes y garfio.
function raptor(g, sx, sy, ex, ey, hx, hy, side) {
  line(g, sx, sy, ex, ey, COL.out, 3); line(g, sx, sy, ex, ey, COL.shellMid, 2);
  line(g, ex, ey, hx, hy, COL.out, 3); line(g, ex, ey, hx, hy, COL.shellLight, 1);
  for (let k = 1; k < 4; k++) { const u = k / 4; P(g, ex + (hx - ex) * u - side, ey + (hy - ey) * u, COL.sting); }
  line(g, hx, hy, hx + side * 2, hy - 2, COL.sting);
}

function head(g, gl, x, y, t, glowK, face = 0, sweep = 0) {
  // antenas que se rizan (sweep: barridas hacia atrás por el viento del picado)
  for (const s of [-1, 1]) {
    let ax = x + s * 1.5, ay = y - 3, a = -Math.PI / 2 + s * 0.35 * (1 - sweep) + face * 0.6 - sweep * 1.9;
    for (let k = 0; k < 16; k++) {
      a += s * (k > 10 ? 0.28 : 0.04) + Math.sin(t * 2 + k * 0.4 + s) * 0.03;
      ax += Math.cos(a); ay += Math.sin(a);
      P(g, ax, ay, k > 12 ? COL.vein : COL.shellLight);
    }
  }
  oval(g, x, y, 4.3, 4, COL.out);
  oval(g, x, y, 3.4, 3.2, (d, dx, dy) => (d > 0.6 ? COL.shell : dx + dy < -1 ? COL.shellLight : COL.shellMid));
  // cresta de púas
  for (let k = -2; k <= 2; k++) line(g, x + k * 1.5, y - 2.5, x + k * 2.6, y - 6 - (2 - Math.abs(k)) * 1.5, k === 0 ? COL.shellShine : COL.shellLight);
  // ojos magenta y mandíbulas
  for (const s of [-1, 1]) {
    P(g, x + s * 2 - 0.5 + face, y - 0.5, COL.eye, 2, 1);
    P(gl, x + s * 2 - 0.5 + face, y - 0.5, glowK > 0 ? '#ff80d0' : COL.eye, 2, 1);
    line(g, x + s * 1.5 + face, y + 2.5, x + s * 0.5 + face, y + 4.5, COL.sting);
  }
}

// Abdomen segmentado hasta el aguijón, siguiendo una curva (lista de puntos).
// Largo del aguijón: 8 px recogido; estirado como un arpón (ext 1), HARPOON más.
const HARPOON = 26;
function abdomen(g, gl, pts, w0, glowK, ext = 0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x, y] = pts[i], u = i / (pts.length - 1), w = Math.max(1, w0 * (1 - u * 0.85));
    oval(g, x, y, w + 0.8, w * 0.75 + 0.8, COL.out);
    oval(g, x, y, w, w * 0.75, (d, dx, dy) => (d > 0.65 ? COL.shell : dy < 0 ? COL.shellLight : COL.shellMid));
    if (i % 2 === 0) P(g, x - w * 0.6, y + w * 0.5, COL.joint, Math.max(1, w * 1.2), 1); // juntas entre segmentos
  }
  // aguijón
  const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
  const len = 8 + ext * HARPOON;
  const tx = bx + ux * len, ty = by + uy * len;
  if (ext > 0.05) {
    // Arpón: la vaina de quitina se queda en la base y de ella sale un asta de hueso
    // unida por una hebra de tendón tensa, con anillas, hasta la punta barbada.
    line(g, bx, by, bx + ux * 5, by + uy * 5, COL.stingDark, 3);
    line(g, bx + ux * 5, by + uy * 5, tx, ty, COL.out, 2);
    line(g, bx + ux * 5, by + uy * 5, tx, ty, COL.sting);
    for (let k = 9; k < len - 4; k += 4) P(g, bx + ux * k + nx * 0.5, by + uy * k + ny * 0.5, COL.joint); // anillas del tendón
    // punta barbada: cabeza de flecha con dos lengüetas hacia atrás
    line(g, tx, ty, tx - ux * 5 + nx * 3, ty - uy * 5 + ny * 3, COL.sting);
    line(g, tx, ty, tx - ux * 5 - nx * 3, ty - uy * 5 - ny * 3, COL.sting);
    line(g, tx - ux * 2, ty - uy * 2, tx - ux * 6 + nx * 1.5, ty - uy * 6 + ny * 1.5, COL.stingDark);
    P(g, tx, ty, '#ffffff');
    if (glowK > 0) {
      line(gl, bx + ux * 5, by + uy * 5, tx, ty, 'rgba(255,90,190,0.35)');
      P(gl, tx - 1, ty - 1, '#fff0ff', 2, 2);
    }
  } else {
    line(g, bx, by, bx + ux * 6, by + uy * 6, COL.stingDark, 2);
    line(g, bx, by, tx, ty, COL.sting);
    if (glowK > 0) { P(gl, tx, ty, '#fff0ff', 2, 2); P(gl, bx + ux * 6, by + uy * 6, '#ff60c0'); }
  }
}

// --- Poses locales ---------------------------------------------------------------
// De frente, volando: alas abiertas (fold 0) o recogidas hacia atrás (fold 1).
function frontPose(g, gl, t, fold, flap, glowK, curl, legsK) {
  const cx = C, cy = C - 4;
  const span = 1 - fold * 0.62, lift = flap * 18 + fold * 10;
  const fore = [[0, 0], [16, -16], [34, -30 - lift * 0.6], [54 * span, -40 - lift], [56 * span, -28 - lift * 0.8], [50 * span, -10 - lift * 0.4], [40 * span, 4], [24 * span, 8], [8, 6]];
  const hind = [[0, 0], [16 * span, 6], [32 * span, 16 - lift * 0.2], [40 * span, 30 - lift * 0.3], [32 * span, 40 - lift * 0.2], [18 * span, 34], [6, 18]];
  const eyesF = fold > 0.6 ? [] : [[34 * span, -22 - lift * 0.7, 4.5], [24 * span, -6 - lift * 0.3, 3]];
  const eyesH = fold > 0.6 ? [] : [[24 * span, 22 - lift * 0.2, 3.5]];
  for (const s of [-1, 1]) {
    wing(g, gl, cx + s * 4, cy + 4, hind, s, eyesH, 7 + s, glowK, 2);
    wing(g, gl, cx + s * 4, cy - 4, fore, s, eyesF, 3 + s, glowK, 3);
  }
  // patas largas (cuelgan en vuelo, se abren al picar)
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const sw = Math.sin(t * 3 + k + s) * 2 * legsK;
    const hx = cx + s * 3, hy = cy + 6 + k * 3;
    spinyLeg(g, hx, hy, cx + s * (13 + k * 4), cy + 14 + k * 4, cx + s * (16 + k * 6) + sw, cy + 38 + k * 6 - (1 - legsK) * 14, k === 1);
  }
  // abdomen: cuelga recto o se curva hacia delante (picado)
  const pts = [];
  for (let i = 0; i <= 14; i++) pts.push([cx + Math.sin(i * 0.2) * curl * i * 0.4, cy + 8 + i * 2.1 - curl * i * i * 0.035]);
  abdomen(g, gl, pts, 5.5, glowK);
  // tórax de placas (pecho segmentado)
  plate(g, cx, cy + 3, 6, 5);
  plate(g, cx, cy - 4, 6.5, 5);
  P(g, cx - 4, cy - 1, COL.joint, 8, 1);
  P(g, cx, cy - 8, COL.shell, 1, 13); // quilla
  // brazos de mantis
  for (const s of [-1, 1]) raptor(g, cx + s * 5, cy - 6, cx + s * 13, cy + 2, cx + s * (10 - fold * 3), cy + 12 - fold * 6, s);
  head(g, gl, cx, cy - 13, t, glowK);
}

// De lado, corriendo sobre una superficie (abajo), mirando a la derecha.
function crawlPose(g, gl, t, ph, glowK) {
  const cx = C, cy = C, floor = cy + 15;
  // alas plegadas sobre el lomo
  const folded = [[8, -6], [-6, -12], [-24, -11], [-34, -7], [-36, -3], [-26, -1], [-8, -1]];
  wing(g, gl, cx, cy - 2, folded, 1, [[-22, -5, 3]], 11, glowK, 2);
  // patas: tres pares; las lejanas primero
  for (const far of [true, false]) for (let k = 0; k < 3; k++) {
    const hx = cx + 2 + k * 4, hy = cy + 3;
    const off = k * 2.1 + (far ? Math.PI : 0);
    const fx = hx + (k - 1) * 8 + Math.sin(ph + off) * 5, fy = floor - Math.max(0, Math.cos(ph + off)) * 3;
    spinyLeg(g, hx, hy, (hx + fx) / 2 + (k - 1) * 2, cy - 7 - (far ? 1 : 0), fx, fy, far);
  }
  // abdomen hacia atrás, con el aguijón alzado
  const pts = [];
  for (let i = 0; i <= 14; i++) pts.push([cx - 4 - i * 2.3, cy + 2 - Math.max(0, i - 9) ** 2 * 0.35 + Math.sin(t * 3 + i * 0.5) * 0.3]);
  abdomen(g, gl, pts, 5.5, glowK);
  plate(g, cx + 2, cy - 1, 6, 5);
  plate(g, cx + 9, cy - 2, 4.5, 4);
  // brazos de mantis plegados al frente
  raptor(g, cx + 10, cy, cx + 17, cy + 4, cx + 16, cy - 4, 1);
  head(g, gl, cx + 16, cy - 7, t, glowK, 0.8);
}

// Abdomen de perfil: sale hacia atrás y, con curl, se curva por debajo hacia delante
// hasta que el aguijón apunta al frente (como una avispa al picar).
function sideAbdomen(cx, cy, curl, t) {
  const pts = [];
  let x = cx - 3, y = cy + 2;
  for (let i = 0; i <= 14; i++) {
    pts.push([x, y]);
    // media vuelta por debajo del cuerpo y luego recto hacia delante
    const th = Math.PI - curl * Math.min(1, i / 8) * Math.PI + Math.sin(t * 6 + i * 0.4) * 0.03;
    x += Math.cos(th) * 2.2; y += Math.sin(th) * 2.2;
  }
  return pts;
}
// Punta del aguijón en coordenadas locales (respecto al centro del lienzo), para que el
// comportamiento sepa dónde se clava.
export function stingTip(curl = 1, ext = 0) {
  const pts = sideAbdomen(C, C, curl, 0);
  const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1, len = 8 + ext * HARPOON;
  return [bx + ((bx - ax) / L) * len - C, by + ((by - ay) / L) * len - C];
}

// De perfil, mirando a la derecha. wingA: 0 alas plegadas sobre el lomo, ~1.4 alzadas.
// legs: 'tuck' (recogidas) o 'kick' (pataleando, clavada).
function sidePose(g, gl, t, wingA, curl, legs, glowK, sweep, ext = 0) {
  const cx = C, cy = C;
  const folded = [[0, 0], [-6, -7], [-20, -10], [-34, -9], [-40, -4], [-34, 2], [-16, 4], [-4, 3]];
  // Al alzarse, el ala se abre y enseña más superficie (se ensancha).
  const rot = (a) => folded.map(([x, y]) => { const yy = y * (1 + Math.max(0, a) * 0.9); return [x * Math.cos(a) - yy * Math.sin(a), x * Math.sin(a) + yy * Math.cos(a)]; });
  // ala lejana (desfasada) y luego el cuerpo
  const farA = wingA > 0.2 ? wingA + 0.45 : wingA + 0.12; // el ala lejana, desfasada
  wing(g, gl, cx + 1, cy - 4, rot(farA), 1, wingA > 0.5 ? [[-20, -6, 3]] : [], 13, glowK, 2);
  // patas
  for (let k = 0; k < 3; k++) {
    const hx = cx + 2 + k * 3, hy = cy + 3;
    if (legs === 'kick') {
      const w = Math.sin(t * 26 + k * 2) * 4;
      spinyLeg(g, hx, hy, hx + 4 + w * 0.3, hy + 6, hx - 6 + k * 6 + w, hy + 14, k === 0);
    } else spinyLeg(g, hx, hy, hx + 5, hy + 4, hx - 3 + k, hy + 7, k === 0);
  }
  abdomen(g, gl, sideAbdomen(cx, cy, curl, t), 5.5, glowK, ext);
  plate(g, cx + 2, cy - 1, 6, 5);
  plate(g, cx + 9, cy - 2, 4.5, 4);
  // brazos de mantis tendidos al frente
  raptor(g, cx + 10, cy, cx + 17, cy + 2 - curl, cx + 22, cy - 2 - curl * 2, 1);
  head(g, gl, cx + 16, cy - 6, t, glowK, 0.8, sweep);
  // ala cercana por encima
  wing(g, gl, cx + 2, cy - 5, rot(wingA), 1, wingA > 0.5 ? [[-22, -6, 3.5]] : [[-24, -4, 2.5]], 11, glowK, 2);
}

const off = typeof document !== 'undefined' ? [document.createElement('canvas'), document.createElement('canvas')] : null;
if (off) for (const c of off) { c.width = S; c.height = S; }

export const MOTH = {
  size: () => [S, S],
  origin: (e) => [e.cx - C, e.cy - C],
  noFlip: true,
  draw(g, gl, e, t) {
    const [oc, og] = off;
    const o = oc.getContext('2d'), ol = og.getContext('2d');
    o.clearRect(0, 0, S, S); ol.clearRect(0, 0, S, S);
    const pose = e.pose ?? 'fly';
    const glowK = e.glowK ?? 0;
    if (pose === 'crawl') {
      e.walkPh = (e.walkPh ?? 0) + (e.crawlV ?? 0) * 0.0012;
      crawlPose(o, ol, t, e.walkPh * Math.PI * 2, glowK);
    } else if (pose === 'tuck') {
      // anticipación: se pliega de perfil y curva el abdomen
      sidePose(o, ol, t, e.wingA ?? 0, e.curl ?? 0, 'tuck', glowK, (e.curl ?? 0) * 0.6);
    } else if (pose === 'dive') {
      sidePose(o, ol, t, 0, 1, 'tuck', glowK, 1, e.ext ?? 1);
    } else if (pose === 'stuck') {
      // clavada: aletea desesperada y patalea
      sidePose(o, ol, t, 0.75 + Math.sin(t * 32) * 0.6, 1, 'kick', glowK, 0.3, e.ext ?? 1);
    } else if (pose === 'rise') {
      // anticipación (primer tramo): de frente, alas que suben y se recogen
      frontPose(o, ol, t, e.fold ?? 0, 1, glowK, 0.4 + (e.fold ?? 0) * 0.4, 1 - (e.fold ?? 0) * 0.6);
    } else {
      const flap = pose === 'aim' ? -0.1 + Math.sin(t * 40) * 0.04 : Math.sin(t * (e.flapRate ?? 9));
      frontPose(o, ol, t, 0, flap, glowK, pose === 'aim' ? 0.6 : 0.15, 1);
    }
    // Gira la pose con muestreo de píxel exacto (sin suavizado).
    for (const [dst, src] of [[g, oc], [gl, og]]) {
      dst.save();
      dst.imageSmoothingEnabled = false;
      dst.translate(C, C);
      dst.rotate(e.rot ?? 0);
      dst.scale(e.face ?? 1, 1);
      dst.drawImage(src, -C, -C);
      dst.restore();
    }
    // Punto débil: el cuerpo (vulnerable mientras está clavada). Las sacudidas de la pose
    // clavada se aplican al dibujo, no a la caja.
    e.spotsLocal = [{ x: C, y: C, r: 12, weak: pose === 'stuck' }];
  },
};
