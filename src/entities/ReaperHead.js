// LA TESTA DEL RELICARIO: el cráneo de un babuino, enorme, con su melena. Anatomía de
// babuino: bóveda pequeña con su cresta, ceño grueso corrido sobre dos cuencas hondas y
// juntas (con una brasa que te sigue, e.look), pómulos muy abiertos con la fosa temporal
// detrás, y un hocico larguísimo y alto, estrecho arriba y ancho abajo, con la cresta
// maxilar, restos de piel rojiza en el dorso y la nariz en la punta. Muelas, incisivos y
// colmillos cónicos y curvos hacia atrás que nacen de la eminencia canina; la mandíbula en
// U, honda, articula bajo la sien: al abrir (e.jaw 0..1) baja y el cráneo se echa atrás;
// de cara se ve la garganta, de perfil se ve a través de los dientes. Al cerrarla de golpe
// (e.snapT, el mordisco) da un respingo y chispea entre los colmillos. La melena cae como
// un manto hacia la nuca.
//
// Es un modelo 3D sencillo (piezas convexas en unidades; X hacia el hocico, Y abajo, Z
// hacia el lado cercano) que se proyecta girado e.yaw (0 de perfil, π/2 de frente; sin
// e.yaw, según e.view 'profile' | 'three' | 'front'), visto un poco desde arriba. Se apoya
// en el cuello por la nuca (socket). Al caer despliega cuatro patas de hueso (e.legs 0..1)
// y corre. Mira a la derecha (el render lo voltea según e.dir); todo se pinta a resolución
// escalada por S (más píxeles, no píxeles más gordos).
import { part as part1, jointLeg as jointLeg1, OUTLINE } from './Rig.js';

const S = 2.4;
const W = Math.ceil(60 * S), H = Math.ceil(56 * S), G0 = 40;   // G0: suelo, en unidades
const C = {
  bone: '#d8cfb0', boneL: '#f2ead0', boneD: '#a89e80', boneDD: '#6e664e', hollow: '#4a3c2a',
  flesh: '#a03a2a', fleshL: '#c85a40', fleshD: '#5a1810',
  throat: '#24060a', gum: '#6a161c',
  socket: '#160c08', brow: '#3a2418', eye: '#ff3b2f',
};
const BONE = [C.boneL, C.bone, C.boneD];
const BONE_SHADE = [C.bone, C.boneD, C.boneDD];
const FANG = ['#fffaf0', '#efe6cc', '#b8ac8c'];
const FANG_FAR = ['#d8ceb0', '#b8ac8c', '#7e735c'];
const FLESH = [C.fleshL, C.flesh, C.fleshD];
const MANE = ['#bcaa86', '#8a7a62', '#54483a'];
const MANE_BACK = ['#7a6c56', '#54483a', '#382e24'];
const TOOTH = { light: 0.4, dark: 0.25 };
const BIG_TOOTH = { light: 0.3, dark: 0.3 };

// ---- Pintado a resolución escalada (coordenadas de pantalla en unidades).
const dot = (g, x, y, c, w = 1) => { g.fillStyle = c; g.fillRect(x, y, w, w); };
const inside = (pts, x, y) => {
  let on = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
};
// Polígono relleno con contorno; tono por altura dentro de la pieza (luz desde arriba):
// pal = [claro, medio, oscuro]; light: cuánto de arriba va claro; dark: cuánto de abajo.
function poly(g, pts0, pal, { light = 0.22, dark = 0.3, outline = true } = {}) {
  const pts = pts0.map(([x, y]) => [x * S, y * S]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const h = Math.max(1, y1 - y0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(pts, x + 0.5, y + 0.5)) continue;
    const edge = outline && (!inside(pts, x - 0.5, y + 0.5) || !inside(pts, x + 1.5, y + 0.5) || !inside(pts, x + 0.5, y - 0.5) || !inside(pts, x + 0.5, y + 1.5));
    const v = (y - y0) / h;
    dot(g, x, y, edge ? OUTLINE : v < light ? pal[0] : v > 1 - dark ? pal[2] : pal[1]);
  }
}
// Elipse sin contorno (sombras, cuencas, brillos).
function oval(g, cx, cy, rx, ry, c) {
  for (let y = Math.floor((cy - ry) * S); y <= Math.ceil((cy + ry) * S); y++) for (let x = Math.floor((cx - rx) * S); x <= Math.ceil((cx + rx) * S); x++) {
    if (((x + 0.5) / S - cx) ** 2 / (rx * rx) + ((y + 0.5) / S - cy) ** 2 / (ry * ry) <= 1) dot(g, x, y, c);
  }
}
// Trazo fino (grietas, crestas, surcos).
function line(g, pts, c, w = 1) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * S);
    for (let k = 0; k <= n; k++) dot(g, Math.floor((x0 + (x1 - x0) * k / n) * S), Math.floor((y0 + (y1 - y0) * k / n) * S), c, w);
  }
}
// Pieza cónica y curva (colmillo, diente, mechón): de la base (x, y) hacia (dx, dy), largo
// len, ancho w en la base que se afila hasta la punta; bend curva la punta de lado.
function cone(g, x, y, dx, dy, len, w, bend, pal, opt) {
  const n = 10, L = [], R = [], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
  for (let i = 0; i <= n; i++) {
    const k = i / n, cx = x + ux * len * k + nx * bend * len * k * k, cy = y + uy * len * k + ny * bend * len * k * k;
    const hw = (w / 2) * (1 - k) ** 0.8;
    L.push([cx + nx * hw, cy + ny * hw]); R.push([cx - nx * hw, cy - ny * hw]);
  }
  poly(g, [...L, ...R.reverse()], pal, opt);
}
// Envolvente convexa (silueta de una pieza proyectada).
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// ---- Cámara: giro yaw alrededor del eje vertical y una pizca de vista desde arriba (lo
// cercano baja; cuanto más de frente, más: de perfil estricto, nada), centrada en la
// bóveda (ox, oy).
const PITCH = 0.22;
const YAW = { profile: 0.3, three: 0.95, front: Math.PI / 2 };
const yawOf = (e) => e.yaw ?? YAW[e.view] ?? YAW.profile;
const originX = (phi) => 20 + 10 * Math.sin(phi);
const cyOf = (e, t) => G0 - 17 - Math.round((e.legs ?? 0) * 6) + (e.mood === 'growl' ? Math.round(Math.sin(t * 50) * 0.6) : 0);
function camera(phi, ox, oy) {
  const c = Math.cos(phi), s = Math.sin(phi), CP = Math.cos(PITCH * s), SP = Math.sin(PITCH * s);
  const d = ([X, Y, Z]) => [X * c - Z * s, Y * CP + (X * s + Z * c) * SP];
  return { c, s, d, p: (q) => { const [x, y] = d(q); return [ox + x, oy + y]; } };
}
// Giro en el plano X-Y alrededor del gozne de la mandíbula (abrir la boca).
const HX = 5, HY = 7.7;
function hinge(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const T = ([X, Y, Z]) => [HX + (X - HX) * c - (Y - HY) * s, HY + (X - HX) * s + (Y - HY) * c, Z];
  T.d = ([X, Y, Z]) => [X * c - Y * s, X * s + Y * c, Z];
  return T;
}
// Pincel de una parte (cráneo, mandíbula...): pinta piezas 3D ya proyectadas.
function pen(g, cam, T) {
  const at = (q) => cam.p(T(q));
  return {
    at,
    solid: (pts, pal, opt) => poly(g, hull(pts.map(at)), pal, opt),
    shape: (pts, pal, opt) => poly(g, pts.map(at), pal, opt),
    line: (pts, c, w) => line(g, pts.map(at), c, w),
    oval: (q, rx, ry, c) => { const [x, y] = at(q); oval(g, x, y, rx, ry, c); },
    cone: (q, dir, len, w, bend, pal, opt = TOOTH) => {
      const d = cam.d(T.d(dir)), k = Math.hypot(d[0], d[1]) / Math.hypot(...dir);
      if (k > 0.08) { const [x, y] = at(q); cone(g, x, y, d[0], d[1], len * k, w, bend, pal, opt); }
    },
  };
}
const mir = (pts, s) => pts.map(([X, Y, Z]) => [X, Y, Z * s]);
const both = (pts) => [...pts, ...mir(pts, -1)];

// ---- El cráneo (relativo al centro de la bóveda).
const BRAIN = [];
for (let i = 0; i < 16; i++) for (let j = -3; j <= 3; j++) {
  const u = (i / 16) * 2 * Math.PI, v = (j / 3) * (Math.PI / 2);
  BRAIN.push([9.5 * Math.cos(v) * Math.cos(u), 8.2 * Math.sin(v), 7.4 * Math.cos(v) * Math.sin(u)]);
}
const FACE = both([[4, -6.5, 6], [11, -5, 7.6], [15.6, -3, 2], [17, 4.6, 4.4], [13, 5.4, 8.2], [5, 6.6, 7.6]]);
const BROW = both([[15.8, -3.4, 0], [15, -3.6, 3.5], [12.6, -3.2, 7.4], [10.4, -2.4, 8.6], [11.5, -5, 0], [11, -5.2, 4], [9, -4.6, 7.6], [15.4, -1.6, 1.5], [14.4, -1.4, 4.4], [12, -1, 7.6]]);
const ZYG = [[1, 4.8, 8.4], [7, 4.4, 10.8], [12.6, 4.2, 9.4], [13.4, 6, 8], [7, 6.6, 10.4], [1, 6.6, 8.2]];
const ORBIT = [13.2, 1.3, 4.6];
const MUZZLE = both([[16, -2.4, 1.8], [17, 4.6, 4.4], [16, 9.3, 5], [10.5, 8.6, 5.2], [26, -0.9, 1.6], [26, 3.4, 4.4], [26, 9.4, 4.8], [34.6, 1, 1.5], [35, 3.6, 3], [34.6, 9, 3.2], [36.2, 2.4, 1.4], [36.2, 6.4, 1.6]]);
const NOSE = both([[34.8, 1, 1.5], [36.2, 2.4, 1.4], [36.2, 6.4, 1.6], [34.8, 9, 3.2]]);
const FLESH_TOP = [[16.4, -2.2, 1.7], [21, -1.6, 1.7], [26, -0.8, 1.6], [30, 0, 1.6], [34.6, 1.1, 1.5], [36.3, 2.6, 1.4]];
const FLESH_RAG = [[36.3, 4.4, 1.5], [34.6, 3.4, 2.6], [32.4, 2, 3.3], [30.2, 3, 3.4], [27.6, 1.4, 3.7], [25, 2.2, 3.8], [22.4, 0.6, 3.8], [19.6, 1.4, 3.8], [17.2, 0, 3]];
const INCISORS = [[32, 9.2, 2.1], [33.6, 9.2, 1.3], [34.6, 9.1, 0.45]];
const LOW_INCISORS = [[31.8, 10, 2.4], [33.2, 10.1, 1.5], [34.2, 10.2, 0.5]];
const RAMUS = [[2.6, 7.2], [6.8, 7.4], [9.6, 5.2], [11.2, 9.9], [9.4, 14.8], [4, 14.6], [1.8, 12.6]].flatMap(([X, Y]) => [[X, Y, 7.4], [X, Y, 6.2]]);
const BODY = [[9, 9.9, 6.6], [20, 10, 5.6], [30, 10.1, 3.9], [34.4, 10.3, 2.4], [34.6, 12, 2.2], [33, 13.6, 2.6], [25, 14.2, 4.4], [16, 14.6, 5.6], [9, 14.8, 6.6]].flatMap(([X, Y, Z]) => [[X, Y, Z], [X, Y, Z - 1.4]]);
const CHIN = both([[32, 10.2, 2.6], [34.6, 10.4, 2.2], [34.6, 12.2, 2.2], [32.8, 13.8, 2.6]]);
const THROAT_UP = both([[11, 9, 4.6], [25, 9.2, 4.2], [33.5, 9.2, 1.6]]), THROAT_LO = both([[11, 9.9, 5.4], [25, 9.9, 4.2], [33.5, 10.1, 1.8]]);
const SOCKET = [-8, 10, 0];                       // la nuca: lo que encaja en el cuello
// Melena: raíces en anillos de la bóveda (nuca, detrás de la oreja y coronilla); cada
// mechón sale hacia fuera y fluye atrás y abajo, más largo en la nuca.
const MANE_ROOTS = [];
for (const [X, a0, n, extra] of [[-8, 2.6, 14, 3], [-5.5, 2.5, 14, 1.5], [-2.5, 2.3, 12, 0], [1.5, 0.7, 4, -2.5]]) {
  const k = Math.sqrt(1 - (X / 9.5) ** 2);
  for (let i = 0; i <= n; i++) {
    const a = -a0 + (2 * a0 * i) / n, ry = -Math.cos(a), rz = Math.sin(a);
    MANE_ROOTS.push({ p: [X, 8.2 * k * ry, 7.4 * k * rz], dir: [X < 0 ? -1.2 : -1, ry * 0.8 + 0.5, rz * 1.1], len: 7 + 2.5 * (1 - Math.cos(a)) + extra });
  }
}
const CHEEK_TUFTS = [[3, 6.2, 8.4], [0.5, 7.4, 7.8], [5.5, 6.8, 8.8]];

// Cuenca honda con la brasa del ojo dentro; mira hacia e.look.
function orbit(g, gl, [x, y], rx, ry, e, jaw, r = 1) {
  oval(g, x, y, rx + 0.5, ry + 0.5, C.boneD);
  oval(g, x, y, rx, ry, C.socket);
  oval(g, x, y - ry * 0.55, rx * 0.95, ry * 0.42, C.brow);              // sombra del ceño dentro
  const lx = Math.max(-1, Math.min(1, e.look?.x ?? 0.6)), ly = Math.max(-1, Math.min(1, e.look?.y ?? 0));
  const ex = x + lx * rx * 0.3, ey = y + 0.3 + ly * ry * 0.25;
  oval(g, ex, ey, 1.25 * r, 1.15 * r, '#5a0a06');
  oval(g, ex, ey, 0.62 * r, 0.62 * r, C.eye);
  oval(gl, ex, ey, 0.85 * r, 0.85 * r, jaw > 0.5 ? '#ffd0a0' : C.eye);
}

// La de detrás lleva debajo su volumen (una masa oscura de la que asoman las puntas).
function mane(g, P, cam, t, front) {
  const list = MANE_ROOTS.filter(({ p }) => (p[0] * cam.s + p[2] * cam.c > 0.5) === front);
  if (!front) {
    const mass = list.flatMap(({ p, dir, len }) => {
      const [x, y] = P.at(p), d = cam.d(dir), k = (len * 0.62) / Math.hypot(...dir);
      return [[x, y], [x + d[0] * k, y + d[1] * k]];
    });
    poly(g, hull(mass), [MANE_BACK[1], MANE_BACK[2], MANE_BACK[2]], { light: 0.3, dark: 0.5 });
  }
  list.forEach(({ p, dir, len }, i) => {
    const droop = 0.2 + Math.sin(t * 2.1 + i * 0.9) * 0.04, dx = cam.d(dir)[0];
    P.cone(p, dir, len, front ? 3.4 : 4.2, dx < 0 ? -droop : droop, front ? MANE : i % 2 ? MANE_BACK : MANE, { light: 0.3, dark: 0.35 });
  });
}

// Patas de hueso: cuatro, finas, con la rodilla alta como una araña; corren en dos tiempos.
function boneLegs(g, B, legs, run, ph) {
  [[-7, -1, 0, -1], [-3, 1, Math.PI, -1], [6, -1, Math.PI / 2, 1], [10, 1, Math.PI * 1.5, 1]].forEach(([X, side, off, fwd], i) => {
    const [hx, hy] = B.at([X, 9, 0]);
    const swing = run ? Math.sin(ph + off) * 5 : 0;
    const fx = hx + fwd * 8 * legs + swing, fy = G0 - (run ? Math.max(0, Math.sin(ph + off)) * 3 : 0);
    const L = 4 + legs * 7;
    jointLeg1(g, hx * S, hy * S, fx * S, fy * S, L * S, L * S, side, Math.round(2 * S), i % 2 ? C.boneD : C.bone, C.boneDD, C.boneL);
    cone(g, fx, fy - 1.2, fwd, 0.5, 2.6, 1.6, 0, BONE, TOOTH);                 // la uña
  });
}

export const REAPER_HEAD = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2, e.y + e.h - G0 * S],
  // Dónde queda la nuca respecto a (e.cx, pie de la caja), en píxeles de mundo: ahí se
  // apoya en el cuello.
  socket(e) {
    const phi = yawOf(e), [x, y] = camera(phi, originX(phi), G0 - 21.5).p(SOCKET);
    return [(x - 30) * S * (e.dir < 0 ? -1 : 1), (y - G0) * S];
  },
  draw(g, gl, e, t) {
    const phi = yawOf(e), legs = e.legs ?? 0, jaw = e.jaw ?? 0;
    const run = Math.abs(e.vx) > 5 && legs > 0.5, ph = (e.t ?? t) * 16;
    const snap = Math.max(0, e.snapT ?? 0) / 0.12;                          // 1 → 0 tras cerrar las fauces de golpe
    const cy = cyOf(e, t) + (run ? Math.round(Math.sin(ph * 2)) : 0) + Math.round(snap);
    const cam = camera(phi, originX(phi), cy - 4.5);
    const vis = (s) => s * cam.c * 0.9 + cam.s * 0.4;                      // cuánto se ve el costado s (1 el cercano)
    const look = (s) => 0.78 * cam.s + 0.62 * cam.c * s;                    // cuánto te mira la cuenca s
    const front = cam.s > 0.96;                                             // de frente: los dos lados por igual
    const B = pen(g, cam, hinge(0));
    const Sk = pen(g, cam, hinge(-jaw * (0.3 * cam.c + 0.1 * cam.s)));    // el cráneo se echa atrás al abrir
    const Jw = pen(g, cam, hinge(jaw * 0.55));                              // la mandíbula baja
    const upperCanine = (s) => Sk.cone([25.6, 9.3, 4.5 * s], [0.06, 1, 0.1 * s], 10, 4, 0.14 * cam.c, s < 0 && !front ? FANG_FAR : FANG, BIG_TOOTH);
    const lowerCanine = (s) => Jw.cone([29.6, 9.9, 3.6 * s], [0.05, -1, 0.05 * s], 6, 3.4, -0.12 * cam.c, s < 0 && !front ? FANG_FAR : FANG, BIG_TOOTH);
    // ---- Patas, atlas y la melena de detrás.
    if (legs > 0.05) boneLegs(g, B, legs, run, ph);
    { const [x, y] = B.at([-8, 8.4, 0]); part1(g, x * S, y * S, 2.6 * S, 1.7 * S, C.boneD, C.boneDD, C.bone); }
    mane(g, Sk, cam, t, false);
    // ---- Boca: de cara se ve la garganta; casi de perfil es un cráneo sin mejillas y entre
    // los dientes se ve a través (el lado lejano queda justo detrás del cercano y no se
    // pinta). La mandíbula en U, lejos primero, con sus dientes.
    const farSide = vis(-1) > -0.5;
    if (jaw > 0.05 && cam.s > 0.5) {
      poly(g, hull([...THROAT_UP.map(Sk.at), ...THROAT_LO.map(Jw.at)]), [C.gum, C.throat, C.throat], { light: 0.12, dark: 0.5, outline: false });
      if (jaw > 0.4) { const [x, y] = Jw.at([22, 9.4, 0]); oval(gl, x, y, 5, 1.5 + jaw, '#3a0804'); }
    }
    const jawHalf = (s) => {
      Jw.solid(mir(RAMUS, s), BONE, { light: 0.25, dark: 0.35 });
      Jw.solid(mir(BODY, s), BONE, { light: 0.25, dark: 0.35 });
      for (let X = 11.5; X <= 26; X += 2) Jw.cone([X, 9.9, s * (5.8 - (X - 11.5) * 0.1)], [0, -1, 0], 1.4, 1.7, 0, FANG);
    };
    if (farSide) { jawHalf(-1); lowerCanine(-1); if (!front) upperCanine(-1); }
    Jw.solid(CHIN, BONE, { light: 0.25, dark: 0.35 });
    jawHalf(1);
    // ---- Cráneo: cara y pómulos (el lejano; de frente, los dos) tras la bóveda, la bóveda
    // con su cresta y una grieta, la melena de encima y la fosa temporal sobre el pómulo.
    Sk.solid(FACE, BONE, { light: 0.2, dark: 0.3 });
    for (const s of front ? [-1, 1] : [-1]) Sk.solid(mir(ZYG, s), BONE, { light: 0.4, dark: 0.4 });
    Sk.solid(BRAIN, BONE, { light: 0.2, dark: 0.3 });
    Sk.oval([-1, -5.5, 2.5], 4.5, 2, C.boneL);
    Sk.line([[-7, -7.6, 0], [-2, -8.3, 0], [4, -7.6, 0]], C.boneL, 2);
    Sk.line([[-3, -7.6, 3], [-1.6, -5, 4.8], [-2.8, -3, 5.8], [-1, -0.6, 6.6]], C.boneDD);
    mane(g, Sk, cam, t, true);
    for (const s of [-1, 1]) { const v = vis(s); if (v > 0.08) Sk.oval([6.5, 2.6, 7.4 * s], 2.6 * Math.max(0.35, v), 1.6, C.boneD); }
    // El ojo lejano: casi de perfil queda tras el arranque del hocico; de tres cuartos, asoma.
    const farEye = () => orbit(g, gl, Sk.at(mir([ORBIT], -1)[0]), 2.9 * Math.max(0.3, look(-1)), 2.8, e, jaw, front ? 1 : 0.55 + 0.45 * look(-1));
    if (look(-1) > 0.08 && look(-1) <= 0.2) farEye();
    // ---- Hocico: la pieza, la cara de la nariz, crestas y fosas maxilares, eminencia del
    // colmillo, la piel rojiza del dorso (con sus jirones) y las narinas.
    Sk.solid(MUZZLE, BONE, { light: 0.18, dark: 0.3 });
    if (cam.s > 0.25) Sk.solid(NOSE, BONE_SHADE, { light: 0.3, dark: 0.3 });
    for (const s of [-1, 1]) {
      const v = vis(s);
      if (v <= 0.08) continue;
      Sk.oval([21.5, 6.4, 4.8 * s], 3.6 * Math.max(0.3, Math.abs(cam.c)), 1.3, C.boneD);
      Sk.line([[17.4, 4, 4.5 * s], [33.6, 3.4, 3.2 * s]], C.boneL, 2);
      Sk.oval([25.6, 7, 4.9 * s], 1.3 * Math.max(0.5, v), 2, C.boneL);
    }
    for (const s of [-1, 1]) if (vis(s) > 0.05) Sk.shape([...mir(FLESH_TOP, s), ...mir(FLESH_RAG, s)], FLESH, { light: 0.3, dark: 0.3, outline: false });
    Sk.shape([...FLESH_TOP, ...mir(FLESH_TOP, -1).reverse()], FLESH, { light: 0.3, dark: 0.3, outline: false });
    for (const s of [-1, 1]) if (vis(s) > 0.05) { Sk.line(mir(FLESH_RAG, s), C.fleshD); Sk.line(mir(FLESH_TOP, s).slice(0, -1), C.fleshD); }
    for (const s of [-1, 1]) Sk.oval([36.3, 3.6, 0.85 * s], 0.45 + 0.3 * cam.s, 0.8, C.socket);
    // ---- Cuencas, el ceño corrido encima y el pómulo cercano.
    if (look(-1) > 0.2) farEye();
    orbit(g, gl, Sk.at(ORBIT), 2.9 * Math.max(0.3, look(1)), 2.8, e, jaw);
    Sk.solid(BROW, BONE, { light: 0.45, dark: 0.2 });
    if (!front) Sk.solid(ZYG, BONE, { light: 0.4, dark: 0.4 });
    // ---- Dientes del maxilar y los grandes colmillos (el de abajo, delante del de arriba).
    for (const s of farSide ? [-1, 1] : [1]) for (let X = 11.5; X <= 23.5; X += 2) Sk.cone([X, 9.1, s * (5 - (X - 11.5) * 0.03)], [0, 1, 0], 1.4, 1.7, 0, FANG);
    for (const q of farSide ? both(INCISORS) : INCISORS) Sk.cone(q, [0.25, 1, 0], 2, 1.4, 0, FANG);
    for (const q of farSide ? both(LOW_INCISORS) : LOW_INCISORS) Jw.cone(q, [0.35, -1, 0], 1.8, 1.3, 0, FANG);
    if (front) upperCanine(-1);
    upperCanine(1);
    lowerCanine(1);
    // El chasquido: al cerrarse de golpe, un destello entre los colmillos.
    if (snap > 0) for (const s of front ? [-1, 1] : [1]) {
      const [x, y] = Sk.at([27.6, 9.6, 4.2 * s]);
      oval(gl, x, y, 2.6 * snap, 1.2 * snap, '#fff2d8');
      line(gl, [[x - 3.5 * snap, y], [x + 3.5 * snap, y]], '#fff2d8');
      line(gl, [[x, y - 2.5 * snap], [x, y + 2.5 * snap]], '#fff2d8');
    }
    // ---- Patillas de melena que enmarcan la cara.
    for (const s of front ? [-1, 1] : [1]) CHEEK_TUFTS.forEach((q, i) => {
      const dir = [-0.6, 1, 0.5 * s], dx = cam.d(dir)[0], droop = 0.2 + Math.sin(t * 2.1 + i * 1.3) * 0.04;
      Sk.cone(mir([q], s)[0], dir, 9 + i, 3.2, dx < 0 ? -droop : droop, MANE, { light: 0.3, dark: 0.35 });
    });
  },
};
