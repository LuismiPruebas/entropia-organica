// EL RELICARIO (jefe del bioma Hueso): un torso colosal que asoma del suelo entre
// escombros de hueso. Una caja torácica de seis pares de costillas encierra un núcleo que
// late; el lomo, erizado de púas; por cuello, el muñón hueco de la columna. Sus brazos,
// columnas de vértebras, acaban en dos guadañas enormes. Ocupa casi toda la pantalla.
// Se dibuja en un búfer de píxeles propio (rápido aunque sea enorme) con sombreado de
// cinco tonos de hueso, contorno y brillo.
// Lo anima el comportamiento `bossReaper` (entities/Enemy.js), que deja en la criatura:
//   e.arms = { L: { pose, k, tx }, R: {...} }  pose: idle | raise | sweep | slam | stuck
//   e.open  0..1  las costillas abiertas (núcleo expuesto)
//   e.beat  0..1  el latido del núcleo
const W = 380, H = 214, CX = W / 2, FY = H - 6;  // lienzo; centro; suelo (donde asoma)

const hex = (h) => { const n = parseInt(h.slice(1), 16); return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255); };
const B = {                                       // hueso, de la sombra al brillo
  out: hex('#120a08'), dd: hex('#3e3024'), d: hex('#6e5a42'), m: hex('#a8906c'), l: hex('#cfb88e'), hl: hex('#efe0bc'),
  crack: hex('#2a1e16'), stain: hex('#5a2a1a'),
};
const CORE = { out: hex('#2a0608'), d: hex('#6a0e14'), m: hex('#b82a1e'), l: hex('#ff6a2a'), hl: hex('#ffd060'), vein: hex('#5a0a10') };
const GLOW = { d: hex('#5a1008'), m: hex('#c83a14'), l: hex('#ff8a30'), hl: hex('#fff0a0') };
const TONES = [B.dd, B.d, B.m, B.l, B.hl];

// Búfer de píxeles: color y brillo propio. Se vuelca de una vez al lienzo.
let buf = null, gbuf = null, img = null, gimg = null;
function begin(g) {
  if (!img) {
    img = g.createImageData(W, H); gimg = g.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer); gbuf = new Uint32Array(gimg.data.buffer);
  }
}
// Lo que no se anima (lomo, columna, cuello, hombreras, escombros) se pinta una vez por
// altura de respiración y se guarda.
const CACHE = {};
function cached(key, fn) {
  if (!CACHE[key]) { buf.fill(0); fn(); CACHE[key] = buf.slice(); }
  return CACHE[key];
}
const P = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c; };
const Q = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) gbuf[y * W + x] = c; };
const has = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && buf[y * W + x] !== 0; };

// Banda de hueso a lo largo de una línea de puntos [[x,y],...], con un ancho por punto:
// contorno, y tono según el lado (la luz viene de arriba a la izquierda) y la curvatura.
function band(pts0, width, opt = {}) {
  const lx = -0.55, ly = -0.83;                 // dirección de la luz
  // Remuestreo a medio píxel: el trazo sale macizo, sin rayas.
  const pts = [pts0[0]];
  for (let i = 1; i < pts0.length; i++) {
    const [ax, ay] = pts0[i - 1], [bx, by] = pts0[i], L = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(L / 0.5));
    for (let j = 1; j <= m; j++) pts.push([ax + (bx - ax) * j / m, ay + (by - ay) * j / m]);
  }
  const n = pts.length;
  const norm = (i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [-dy / L, dx / L];
  };
  for (const pass of [0, 1]) {
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i], [nx, ny] = norm(i), w = width(i / (n - 1));
      const half = w / 2;
      for (let o = -half - (pass ? 0 : 1); o <= half + (pass ? 0 : 1); o += 0.4) {
        const px = x + nx * o, py = y + ny * o;
        if (!pass) { P(px, py, B.out); continue; }
        const side = o / Math.max(0.5, half);         // -1..1 a lo ancho
        const lit = -(nx * side) * lx * 1.6 - (ny * side) * ly * 1.6 + (1 - Math.abs(side)) * 0.5;
        let t = lit > 0.95 ? 4 : lit > 0.45 ? 3 : lit > -0.1 ? 2 : lit > -0.6 ? 1 : 0;
        if (opt.edge && side * opt.edge > 0.55) t = 4;  // filo
        if (opt.dark) t = Math.max(0, t - 1);
        P(px, py, TONES[t]);
      }
    }
  }
  // Grietas y manchas a lo largo (detalle).
  if (opt.cracks) for (let i = 6; i < n - 6; i += opt.cracks * 2) {
    const [x, y] = pts[i], [nx, ny] = norm(i), w = width(i / (n - 1));
    P(x + nx * w * 0.15, y + ny * w * 0.15, B.crack);
    P(x + nx * w * 0.15 + 1, y + ny * w * 0.15, B.crack);
  }
}
// Punta afilada (púa) de la base al extremo.
function spike(x0, y0, x1, y1, w0) {
  const pts = []; const L = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= L; i++) pts.push([x0 + (x1 - x0) * i / L, y0 + (y1 - y0) * i / L]);
  band(pts, (u) => Math.max(1, w0 * (1 - u) ** 0.9));
}
// Hueso abombado (elipse sombreada como esfera).
function knob(cx, cy, rx, ry, opt = {}) {
  for (let y = -Math.ceil(ry) - 1; y <= ry + 1; y++) for (let x = -Math.ceil(rx) - 1; x <= rx + 1; x++) {
    const d = (x / rx) ** 2 + (y / ry) ** 2, d2 = (x / (rx + 1)) ** 2 + (y / (ry + 1)) ** 2;
    if (d <= 1) {
      const lit = -x / rx * 0.5 - y / ry * 0.8 + (1 - d) * 0.6;
      P(cx + x, cy + y, TONES[lit > 0.9 ? 4 : lit > 0.4 ? 3 : lit > -0.1 ? 2 : lit > -0.55 ? 1 : 0]);
    } else if (d2 <= 1) P(cx + x, cy + y, B.out);
  }
  if (opt.hole) for (let y = -opt.hole; y <= opt.hole; y++) for (let x = -opt.hole; x <= opt.hole; x++) if (x * x + y * y * 1.6 <= opt.hole * opt.hole) P(cx + x, cy + y - 1, y < 0 ? B.out : B.crack);
}
// Curva: arco de n pasos desde (x,y) en la dirección a, girando `curv` por paso.
function arc(x, y, a, curv, steps, len = 1) {
  const pts = [[x, y]];
  for (let i = 0; i < steps; i++) { x += Math.cos(a) * len; y += Math.sin(a) * len; a += curv; pts.push([x, y]); }
  return pts;
}
// Codo entre hombro y muñeca (dos tramos), hacia `bend`.
function elbow(ax, ay, bx, by, l1, l2, bend) {
  const dx = bx - ax, dy = by - ay, d = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, Math.hypot(dx, dy)));
  const a = Math.atan2(dy, dx), c = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  return [ax + Math.cos(a + bend * c) * l1, ay + Math.sin(a + bend * c) * l1];
}

// Poses de un brazo (para el lado derecho; el izquierdo es su espejo). Devuelve la muñeca,
// la dirección de salida de la hoja y su curvatura.
const SH = [62, 76];   // hombro, desplazado del centro
function pose(arm, t, side, idleHigh) {
  const k = arm?.k ?? 0, p = arm?.pose ?? 'idle';
  const sway = Math.sin(t * 1.3 + (side > 0 ? 0 : 1.7));
  const idle = idleHigh
    ? { wx: 126 + sway * 3, wy: 44 + sway * 2, a: -1.15, c: 0.036 }      // en alto, la hoja arqueada por fuera
    : { wx: 152 + sway * 2, wy: 96 + sway * 3, a: 0.35, c: 0.026 };      // abierta a un lado, la hoja hacia abajo
  const lerp = (A, Bp, u) => ({ wx: A.wx + (Bp.wx - A.wx) * u, wy: A.wy + (Bp.wy - A.wy) * u, a: A.a + (Bp.a - A.a) * u, c: A.c + (Bp.c - A.c) * u });
  const tx = arm?.tx ?? 130;                                             // a qué distancia del centro clava
  const RAISE_SW = { wx: 120, wy: 4, a: -2.55, c: 0.024 };
  const RAISE_SL = { wx: Math.max(60, tx - 40), wy: -6, a: -1.75, c: 0.012 };
  const SLAM = { wx: tx - 18, wy: FY - 96, a: 1.2, c: 0.012 };
  if (p === 'raise') {
    // Alza la guadaña temblando de tensión (para barrer o para clavarla).
    const q = lerp(idle, arm.kind === 'slam' ? RAISE_SL : RAISE_SW, Math.min(1, k * 1.4));
    q.wx += Math.sin(t * 50) * k;
    return q;
  }
  if (p === 'sweep') {
    // Barre el suelo de fuera adentro: la hoja, casi plana, raspando a ras.
    const u = k * k * (3 - 2 * k);
    return { wx: 176 - u * 132, wy: FY - 58 + Math.sin(u * Math.PI) * 6, a: 0.75 + u * 0.9, c: 0.02 - u * 0.004 };
  }
  if (p === 'slam') return lerp(RAISE_SL, SLAM, k * k);
  if (p === 'stuck') return { ...SLAM, wx: SLAM.wx + Math.sin(t * 30) * 0.6 };
  if (p === 'recover') return lerp(SLAM, idle, k);
  return idle;
}

// Detrás de todo: el abanico de púas del lomo, la columna y el muñón hueco del cuello.
function drawBack(bodyY) {
  const backSpikes = [[-46, -12, -70, -64, 9], [-24, -22, -34, -86, 10], [-6, -26, 2, -96, 11], [14, -24, 38, -88, 10], [34, -16, 66, -70, 9], [-60, 2, -96, -34, 7], [52, 4, 92, -30, 7]];
  for (const [x0, y0, x1, y1, w0] of backSpikes) spike(CX + x0, 74 + y0 + bodyY, CX + x1, 74 + y1 + bodyY, w0);
  for (let y = 30 + bodyY; y < FY + 4; y += 9) {
    const big = y > 150 ? 1.3 : 1;
    knob(CX, y, 7 * big, 4.2, {});
    for (const s of [-1, 1]) spike(CX + s * 6 * big, y, CX + s * 13 * big, y + 3, 3);
  }
  knob(CX, 24 + bodyY, 9, 7, { hole: 3 });
  knob(CX, 13 + bodyY, 7, 5, { hole: 3 });
}

// Delante de la caja: los escombros de hueso de los que asoma y las hombreras con púas.
function drawFront(bodyY) {
  for (let i = 0; i < 16; i++) {
    const x0 = CX - 96 + i * 12 + Math.sin(i * 2.3) * 4, ang = -Math.PI / 2 + Math.sin(i * 1.7) * 0.9;
    const L = 14 + ((i * 7) % 13) + (Math.abs(i - 7.5) < 3 ? 8 : 0);
    spike(x0, FY + 2, x0 + Math.cos(ang) * L, FY + 2 + Math.sin(ang) * L, 6);
  }
  for (let x = CX - 116; x < CX + 116; x++) {
    const h = 5 + Math.abs(Math.sin(x * 0.17)) * 5 + Math.abs(Math.sin(x * 0.53 + 1)) * 3 + (1 - Math.abs(x - CX) / 116) * 8;
    for (let y = 0; y < h; y++) {
      const lump = Math.sin(x * 0.9 + y * 1.3) + Math.sin(x * 0.31 - y * 0.7);
      P(x, FY + 3 - y, y > h - 1.5 ? B.out : TONES[Math.max(0, Math.min(4, Math.round(1.6 + lump * 0.9 + (y / h) * 1.2)))]);
    }
  }
  for (const s of [-1, 1]) {
    const hx = CX + s * 66, hy = 66 + bodyY;
    knob(hx, hy, 26, 19, {});
    for (let j = 0; j < 3; j++) { const sx = hx + s * (j * 9 - 6), sy = hy - 12 + j * 2; spike(sx, sy, sx + s * (8 + j * 6), sy - 22 + j * 4, 7); }
    // Crestas de la placa y una grieta.
    for (let j = 0; j < 3; j++) { const ry = hy - 8 + j * 8; for (let x = -20 + j * 3; x <= 20 - j * 3; x++) { const yy = ry + (x * x) / 60; P(hx + x, yy, B.dd); P(hx + x, yy - 1, B.hl); } }
    for (let j = 0; j < 5; j++) P(hx + s * (4 - j), hy + 12 + (j % 2), B.crack);
  }
}

export const REAPER = {
  size: () => [W, H],
  origin: (e) => [e.cx - CX, e.y + e.h - FY],
  noFlip: true,
  FY, CX,
  draw(g, gl, e, t) {
    begin(g);
    const open = e.open ?? 0, beat = e.beat ?? 0;
    const rage = e.hp < e.def.hp / 2;
    const breathe = Math.sin(t * 1.6) * 1.5;
    const bodyY = Math.round(breathe * 0.5);
    const back = cached('b' + bodyY, () => drawBack(bodyY)), front = cached('f' + bodyY, () => drawFront(bodyY));
    buf.set(back); gbuf.fill(0);

    // ---- Núcleo: late dentro de la caja; venas hacia las costillas.
    const cy = 112 + bodyY, r = 20 + beat * 3 + open * 2;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + 0.3, L = r + 12 + (i % 3) * 5;
      for (let s = 0; s < L; s += 0.7) P(CX + Math.cos(a + Math.sin(s * 0.2) * 0.15) * s, cy + Math.sin(a) * s * 0.9, s < r ? CORE.d : CORE.vein);
    }
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y * 1.1) / r;
      if (d > 1.06) continue;
      const lit = 1 - d + (-x - y) / r * 0.15 + Math.sin(x * 0.7 + y * 0.5 + t * 6) * 0.06;
      P(CX + x, cy + y, d > 0.95 ? CORE.out : lit > 0.75 ? CORE.hl : lit > 0.5 ? CORE.l : lit > 0.22 ? CORE.m : CORE.d);
      // Brillo propio: tenue cerrado (se intuye entre las costillas), intenso abierto.
      const gi = (0.35 + open * 0.65) * (0.7 + beat * 0.3);
      if (d < 0.9) Q(CX + x, cy + y, lit * gi > 0.6 ? GLOW.hl : lit * gi > 0.38 ? GLOW.l : lit * gi > 0.18 ? GLOW.m : GLOW.d);
    }
    // Halo del núcleo (brillo que se escapa entre las costillas).
    for (let y = -r - 12; y <= r + 12; y++) for (let x = -r - 12; x <= r + 12; x++) {
      const d = Math.hypot(x, y);
      if (d > r && d < r + 12 && ((x * 7 + y * 13) & 3) === 0) Q(CX + x, cy + y, open > 0.4 ? GLOW.m : GLOW.d);
    }

    // ---- Costillas: seis pares vistos de frente. Salen del esternón hacia fuera, suben un
    // poco y bajan al rodear el costado (las de atrás asoman más oscuras por encima). Abiertas,
    // se separan del centro y se alzan en abanico: el esternón se parte en dos.
    const RIB = [50, 62, 70, 72, 66, 54];
    for (let i = 0; i < 6; i++) {
      const ys = 72 + i * 14 + bodyY + breathe * (i / 6);
      for (const s of [-1, 1]) {
        // Mitad de atrás (desde la columna), fina y oscura: da fondo a la caja.
        const back = arc(CX + s * 7, ys - 8, s > 0 ? -0.15 : Math.PI + 0.15, s * 0.034, Math.round(RIB[i] * 0.9), 1);
        band(back, (u) => 4 - u * 1.5, { dark: true });
      }
      for (const s of [-1, 1]) {
        const x0 = CX + s * (10 + open * 30), y0 = ys - open * (6 + i * 1.5);
        const a0 = (s > 0 ? -0.32 - open * 0.55 : Math.PI + 0.32 + open * 0.55);
        const pts = arc(x0, y0, a0, s * (0.03 - open * 0.004), Math.round(RIB[i] * 1.25 + open * 10), 1);
        band(pts, (u) => 7.5 - u * 3 - Math.max(0, 0.15 - u) * 6, { cracks: i % 2 ? 7 : 0, dark: i > 3 });
      }
    }
    // Esternón: placas segmentadas; abierto, dos mitades que se separan.
    for (const s of open > 0.05 ? [-1, 1] : [0]) {
      const ox = s * open * 32;
      for (let j = 0; j < 6; j++) knob(CX + ox, 74 + j * 14 + bodyY, s ? 5 : 6, 5.6, {});
    }

    for (let i = 0; i < front.length; i++) if (front[i]) buf[i] = front[i];

    // ---- Brazos y guadañas.
    const blades = [];
    for (const s of [-1, 1]) {
      const arm = e.arms?.[s < 0 ? 'L' : 'R'];
      const q = pose(arm, t, s, s < 0);
      const mx = (x) => CX + s * x;                                // espejo
      const ax = mx(SH[0]), ay = SH[1] + bodyY;
      const wx = mx(q.wx), wy = q.wy + (q.wy < FY - 100 ? bodyY : 0);
      const [ex, ey] = elbow(ax, ay, wx, wy, 64, 60, -s);
      // Brazo: columna de vértebras (bloques con apófisis) del hombro al codo y a la muñeca.
      for (const [x0, y0, x1, y1, w0, w1] of [[ax, ay, ex, ey, 15, 12], [ex, ey, wx, wy, 12, 9]]) {
        const L = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        // Púas en el lado de fuera (antes, que queden detrás).
        for (let j = 1; j < 5; j++) { const u = j / 5, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u; spike(x - nx * s * w0 * 0.4, y - ny * s * w0 * 0.4, x - nx * s * (w0 * 0.4 + 9) + Math.cos(ang) * 3, y - ny * s * (w0 * 0.4 + 9) - 3, 4); }
        band([[x0, y0], [x1, y1]], (u) => w0 + (w1 - w0) * u, { cracks: 9 });
        // Anillos de vértebra: surcos oscuros cruzados, con un borde de luz.
        for (let d = 8; d < L - 4; d += 9) {
          const x = x0 + Math.cos(ang) * d, y = y0 + Math.sin(ang) * d, w = (w0 + (w1 - w0) * d / L) / 2;
          for (let o = -w + 1; o <= w - 1; o += 0.5) { P(x + nx * o, y + ny * o, B.dd); P(x + nx * o + Math.cos(ang), y + ny * o + Math.sin(ang), B.l); }
        }
      }
      knob(ex, ey, 9, 8, {});                                        // codo
      knob(wx, wy, 7, 6, {});                                        // muñeca
      // Guadaña: arco de hoja que se ensancha y se afila; filo claro por dentro.
      const a = s > 0 ? q.a : Math.PI - q.a, c = q.c * s;
      const pts = arc(wx, wy, a, c, 92, 1.15);
      band(pts, (u) => 2 + 13 * Math.sin(Math.min(1, u * 2.4) * Math.PI / 2) * (1 - u) ** 0.55, { edge: s > 0 ? 1 : -1, cracks: 23 });
      // Acanaladura a lo largo de la hoja y la punta.
      for (let j = 10; j < pts.length - 12; j++) if (j % 2) P(pts[j][0], pts[j][1], B.d);
      const tip = pts[pts.length - 1];
      P(tip[0], tip[1], B.hl);
      if (arm?.pose === 'raise' && Math.sin(t * 20) > 0) { Q(tip[0], tip[1], GLOW.hl); Q(tip[0] + 1, tip[1], GLOW.l); }
      blades.push({ side: s, pts });
    }
    // (para el comportamiento: dónde están las hojas, en coordenadas del lienzo)
    e.bladePts = blades;
    // Punto débil y marcador: el núcleo, débil solo con las costillas abiertas.
    e.spotsLocal = [{ x: CX, y: cy, r: r + 2, weak: open > 0.5 }];

    g.putImageData(img, 0, 0);
    gl.putImageData(gimg, 0, 0);
  },
};
