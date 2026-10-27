// EL RELICARIO (jefe del bioma Hueso): el esqueleto colosal de un babuino, de pie y
// agazapado sobre sus piernas flexionadas, con su cola curvada. La caja torácica encierra
// un núcleo que late; los brazos empuñan dos guadañas de mango de hueso. Su cabeza de
// babuino (entities/ReaperHead.js) es aparte: se sostiene sobre el cuello y a ratos se cae.
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
const SH = [30, 52];   // hombro, desplazado del centro
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

// ---- Cuerpo (lo que no se anima se pinta una vez por altura de respiración).
const HIP = [16, FY - 74], KNEE = [46, FY - 44], ANK = [36, FY - 10];
const NECK = 26;                                  // donde se apoya la cabeza (y del lienzo)
const CORE_Y = 86;                                // centro del núcleo

// Pierna flexionada de babuino (s: lado), con su pie largo de dedos huesudos.
function leg(s, bodyY, dark) {
  const hx = CX + s * HIP[0], hy = HIP[1] + bodyY, kx = CX + s * KNEE[0], ky = KNEE[1] + bodyY * 0.5, ax = CX + s * ANK[0], ay = ANK[1];
  band([[hx, hy], [kx, ky]], (u) => 11 - u * 3, { cracks: 7, dark });
  knob(kx, ky, 6.5, 5.5, {});
  band([[kx, ky], [ax, ay]], (u) => 8 - u * 2.5, { cracks: 9, dark });
  knob(ax, ay, 4.5, 4, {});
  for (let j = 0; j < 4; j++) {                                // dedos largos, hacia fuera
    const tx = ax + s * (10 + j * 3), ty = FY - (j % 2);
    band([[ax + s * 2, ay + 2], [ax + s * (6 + j * 2), FY - 3], [tx, ty]], (u) => 3 - u * 1.4, { dark });
  }
}

// Detrás de la caja: cola, piernas, pelvis, columna lumbar, omóplatos y vértebras del cuello.
function drawBack(bodyY) {
  // Cola: sale de la pelvis por detrás, se arquea y cae curvándose.
  const tail = arc(CX + 14, FY - 76 + bodyY, -0.2, 0.034, 95, 1.15);
  band(tail, (u) => 6 - u * 4.2, { dark: true });
  for (let i = 8; i < tail.length - 4; i += 7) { const [x, y] = tail[i]; P(x, y, B.dd); P(x + 1, y, B.dd); }
  leg(-1, bodyY, true); leg(1, bodyY, false);
  // Pelvis: dos alas ilíacas con su hueco y el sacro.
  for (const s of [-1, 1]) knob(CX + s * 11, FY - 80 + bodyY, 11, 9, { hole: 3 });
  knob(CX, FY - 74 + bodyY, 7, 6, {});
  // Columna lumbar, de la pelvis a la caja.
  for (let y = FY - 86 + bodyY; y > 104 + bodyY; y -= 7) knob(CX, y, 6, 3.6, {});
  // Omóplatos tras los hombros.
  for (const s of [-1, 1]) knob(CX + s * 24, 64 + bodyY, 9, 13, {});
  // Vértebras del cuello, hasta la cabeza.
  for (let y = 50 + bodyY; y >= NECK + bodyY; y -= 6) knob(CX, y, 5 - (50 - y) / 30, 3.2, {});
}

// Delante de la caja: clavículas y hombros.
function drawFront(bodyY) {
  for (const s of [-1, 1]) {
    band([[CX + s * 3, 56 + bodyY], [CX + s * 16, 52 + bodyY], [CX + s * SH[0], SH[1] + bodyY]], (u) => 4.5 - u, {});
    knob(CX + s * SH[0], SH[1] + bodyY, 7, 6.5, {});
  }
}

export const REAPER = {
  size: () => [W, H],
  origin: (e) => [e.cx - CX, e.y + e.h - FY],
  noFlip: true,
  FY, CX, NECK,
  draw(g, gl, e, t) {
    begin(g);
    const open = e.open ?? 0, beat = e.beat ?? 0;
    const breathe = Math.sin(t * 1.6) * 1.5;
    const bodyY = Math.round(breathe * 0.5);
    const back = cached('b' + bodyY, () => drawBack(bodyY)), front = cached('f' + bodyY, () => drawFront(bodyY));
    buf.set(back); gbuf.fill(0);

    // ---- Núcleo: late dentro de la caja; venas hacia las costillas.
    const cy = CORE_Y + bodyY, r = 15 + beat * 2.5 + open * 2;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + 0.3, L = r + 9 + (i % 3) * 4;
      for (let s = 0; s < L; s += 0.7) P(CX + Math.cos(a + Math.sin(s * 0.2) * 0.15) * s, cy + Math.sin(a) * s * 0.9, s < r ? CORE.d : CORE.vein);
    }
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y * 1.1) / r;
      if (d > 1.06) continue;
      const lit = 1 - d + (-x - y) / r * 0.15 + Math.sin(x * 0.7 + y * 0.5 + t * 6) * 0.06;
      P(CX + x, cy + y, d > 0.95 ? CORE.out : lit > 0.75 ? CORE.hl : lit > 0.5 ? CORE.l : lit > 0.22 ? CORE.m : CORE.d);
      const gi = (0.35 + open * 0.65) * (0.7 + beat * 0.3);
      if (d < 0.9) Q(CX + x, cy + y, lit * gi > 0.6 ? GLOW.hl : lit * gi > 0.38 ? GLOW.l : lit * gi > 0.18 ? GLOW.m : GLOW.d);
    }
    for (let y = -r - 9; y <= r + 9; y++) for (let x = -r - 9; x <= r + 9; x++) {
      const d = Math.hypot(x, y);
      if (d > r && d < r + 9 && ((x * 7 + y * 13) & 3) === 0) Q(CX + x, cy + y, open > 0.4 ? GLOW.m : GLOW.d);
    }

    // ---- Costillas: seis pares; abiertas, se separan del centro y se alzan en abanico.
    const RIB = [34, 42, 48, 49, 45, 37];
    for (let i = 0; i < 6; i++) {
      const ys = 60 + i * 10 + bodyY + breathe * (i / 6);
      for (const s of [-1, 1]) {
        const bk = arc(CX + s * 5, ys - 6, s > 0 ? -0.15 : Math.PI + 0.15, s * 0.05, Math.round(RIB[i] * 0.9), 1);
        band(bk, (u) => 3 - u * 1.2, { dark: true });
      }
      for (const s of [-1, 1]) {
        const x0 = CX + s * (7 + open * 22), y0 = ys - open * (5 + i * 1.2);
        const a0 = (s > 0 ? -0.32 - open * 0.55 : Math.PI + 0.32 + open * 0.55);
        const pts = arc(x0, y0, a0, s * (0.045 - open * 0.006), Math.round(RIB[i] * 1.2 + open * 8), 1);
        band(pts, (u) => 5.5 - u * 2.2 - Math.max(0, 0.15 - u) * 4, { cracks: i % 2 ? 7 : 0, dark: i > 3 });
      }
    }
    // Esternón: placas; abierto, dos mitades que se separan.
    for (const s of open > 0.05 ? [-1, 1] : [0]) {
      const ox = s * open * 24;
      for (let j = 0; j < 6; j++) knob(CX + ox, 61 + j * 10 + bodyY, s ? 3.5 : 4.5, 4.2, {});
    }

    for (let i = 0; i < front.length; i++) if (front[i]) buf[i] = front[i];

    // ---- Brazos y guadañas: la mano empuña el mango; la hoja sale de su extremo.
    const blades = [];
    for (const s of [-1, 1]) {
      const arm = e.arms?.[s < 0 ? 'L' : 'R'];
      const q = pose(arm, t, s, s < 0);
      const mx = (x) => CX + s * x;
      const ax = mx(SH[0]), ay = SH[1] + bodyY;
      const wx = mx(q.wx), wy = q.wy + (q.wy < FY - 100 ? bodyY : 0);   // extremo del mango (arranque de la hoja)
      // La mano, a algo más de la mitad del camino del hombro al extremo; el mango sobresale por detrás.
      const hx = ax + (wx - ax) * 0.42, hy = ay + (wy - ay) * 0.42 + 14;
      const dx = wx - hx, dy = wy - hy, L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      const [ex, ey] = elbow(ax, ay, hx, hy, 34, 32, s);
      // Brazo: húmero, codo, radio y cúbito.
      band([[ax, ay], [ex, ey]], (u) => 8 - u * 1.5, { cracks: 9 });
      knob(ex, ey, 5.5, 5, {});
      band([[ex, ey], [hx, hy]], (u) => 6 - u * 1.2, { cracks: 11 });
      band([[ex + 2, ey + 1], [hx + 2, hy + 1]], () => 2.2, { dark: true });
      // Mango de hueso: de un poco por detrás de la mano al arranque de la hoja.
      band([[hx - ux * 14, hy - uy * 14], [wx, wy]], (u) => 6 - u * 1.5, { cracks: 13 });
      knob(hx - ux * 14, hy - uy * 14, 3.5, 3.5, {});
      // Mano: nudillos agarrando el mango.
      knob(hx, hy, 6, 5, {});
      for (let j = -1; j <= 1; j++) knob(hx + uy * 4 * s + ux * j * 3, hy - ux * 4 * s + uy * j * 3, 2.2, 2, {});
      // Hoja: arco que se ensancha y se afila; filo claro por dentro.
      const a = s > 0 ? q.a : Math.PI - q.a, c = q.c * s;
      const pts = arc(wx, wy, a, c, 92, 1.15);
      band(pts, (u) => 2 + 13 * Math.sin(Math.min(1, u * 2.4) * Math.PI / 2) * (1 - u) ** 0.55, { edge: s > 0 ? 1 : -1, cracks: 23 });
      for (let j = 10; j < pts.length - 12; j++) if (j % 2) P(pts[j][0], pts[j][1], B.d);
      knob(wx, wy, 5, 5, {});                                       // virola de la hoja
      const tip = pts[pts.length - 1];
      P(tip[0], tip[1], B.hl);
      if (arm?.pose === 'raise' && Math.sin(t * 20) > 0) { Q(tip[0], tip[1], GLOW.hl); Q(tip[0] + 1, tip[1], GLOW.l); }
      blades.push({ side: s, pts });
    }
    e.bladePts = blades;
    e.spotsLocal = [{ x: CX, y: cy, r: r + 2, weak: open > 0.5 }];

    g.putImageData(img, 0, 0);
    gl.putImageData(gimg, 0, 0);
  },
};
