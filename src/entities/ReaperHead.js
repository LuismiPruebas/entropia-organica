// LA TESTA DEL RELICARIO: un cráneo de babuino enloquecido, enorme. Bóveda de hueso
// agrietada con una cresta de púas, órbita hundida con un ojo que arde y te sigue (e.look),
// un morro larguísimo de carne roja con surcos azulados (de mandril) y colmillos enormes.
// La mandíbula se abre al morder (e.jaw 0..1). Al tocar el suelo despliega cuatro patas de
// hueso (e.legs 0..1) y corre. Dibujado mirando a la derecha (el render lo voltea según e.dir),
// con su geometría escalada por S (más píxeles, no píxeles más gordos).
import { px as px1, limb as limb1, part as part1, blob as blob1, jointLeg as jointLeg1, OUTLINE } from './Rig.js';

const S = 2.4;
const W = Math.ceil(60 * S), H = Math.ceil(42 * S), G0 = 40;   // G0: suelo, en unidades sin escalar
const C = {
  bone: '#d8cfb0', boneL: '#f2ead0', boneD: '#a89e80', boneDD: '#6e664e',
  snout: '#b8402e', snoutL: '#e8704a', snoutD: '#6a1a14', ridge: '#4a5a9a',
  gum: '#5a0a14', fang: '#f6f0dc', eye: '#ff3b2f',
  mane: '#b8a078', maneL: '#d8c49a', maneD: '#7a6448',
};
// Las herramientas de siempre, en unidades sin escalar.
const px = (g, x, y, c, w = 1, h = 1) => px1(g, x * S, y * S, c, Math.max(1, Math.round(w * S)), Math.max(1, Math.round(h * S)));
const limb = (g, x0, y0, x1, y1, w, c, hi) => limb1(g, x0 * S, y0 * S, x1 * S, y1 * S, Math.max(1, Math.round(w * S)), c, hi);
const part = (g, cx, cy, rx, ry, c, rim, hi) => part1(g, cx * S, cy * S, rx * S, ry * S, c, rim, hi);
const blob = (g, cx, cy, rx, ry, c, rim, hi) => blob1(g, cx * S, cy * S, rx * S, ry * S, c, rim, hi);
const jointLeg = (g, hx, hy, fx, fy, l1, l2, bend, w, c, cFar, joint) => jointLeg1(g, hx * S, hy * S, fx * S, fy * S, l1 * S, l2 * S, bend, Math.max(1, Math.round(w * S)), c, cFar, joint);

export const REAPER_HEAD = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2 + 2 * S, e.y + e.h - G0 * S],
  // Vistas (e.view): 'profile' de perfil, 'three' tres cuartos, 'front' de frente. Al gruñir
  // (e.mood 'growl') tiembla.
  draw(g, gl, e, t) {
    if (e.view === 'front') return drawFront(g, gl, e, t);
    const q = e.view === 'three' ? 1 : 0;                                    // tres cuartos: morro más corto, se ve el otro ojo
    const legs = e.legs ?? 0, jaw = e.jaw ?? 0;
    const run = Math.abs(e.vx) > 5 && legs > 0.5;
    const ph = (e.t ?? t) * 16;
    const lift = Math.round(legs * 9);
    const cy = G0 - 11 - lift + (run ? Math.round(Math.sin(ph * 2)) : 0) + (e.mood === 'growl' ? Math.round(Math.sin(t * 50) * 0.6) : 0);
    // ---- Patas de hueso: cuatro, finas y articuladas, que corren en dos tiempos.
    if (legs > 0.05) {
      [[16, -1, 0], [22, 1, Math.PI], [30, -1, Math.PI / 2], [36, 1, Math.PI * 1.5]].forEach(([hx, side, off], i) => {
        const swing = run ? Math.sin(ph + off) * 5 : 0;
        const fx = hx + (i < 2 ? -6 : 6) * legs + swing, fy = G0 - (run ? Math.max(0, Math.sin(ph + off)) * 3 : 0);
        jointLeg(g, hx, cy + 6, fx, fy, 6 + legs * 2, 6 + legs * 2, side, 2, i % 2 ? C.boneD : C.bone, C.boneDD, C.boneL);
        px(g, fx - 1, fy, OUTLINE, 3, 1);
      });
    }
    // ---- Muñón del cuello: dos vértebras rotas colgando detrás.
    part(g, 12, cy + 7, 3, 2.5, C.boneD, C.boneDD, C.bone);
    part(g, 9, cy + 10, 2.4, 2, C.boneD, C.boneDD);
    px(g, 8, cy + 12, '#8a1a10', 2, 2);
    // ---- Mandíbula inferior (detrás del morro): bisagra en el cráneo, se abre al morder.
    const a = jaw * 0.75;
    const hx = 26, hy = cy + 4, L = 25;
    const jx = hx + Math.cos(a) * L, jy = hy + Math.sin(a) * L;
    if (jaw > 0.05) for (let k = 0; k < 1; k += 0.04) { const x = hx + (jx - hx) * k, y = hy + (jy - hy) * k; px(g, x, hy + 1, C.gum, 1, Math.max(1, y - hy)); }
    limb(g, hx, hy, jx, jy, 4, C.boneD, C.bone);
    for (let i = 0; i < 2; i++) {                                     // colmillos de abajo, hacia arriba
      const k = 0.62 + i * 0.22, x = hx + (jx - hx) * k, y = hy + (jy - hy) * k;
      limb(g, x, y, x + Math.sin(a) * 6, y - Math.cos(a) * 6, 2, C.fang);
    }
    // ---- Bóveda del cráneo, cresta de púas y grietas.
    mane(g, 21, cy - 1, -3.0, -0.35, 9.5);
    part(g, 22, cy - 1, 12, 9.5, C.boneD, C.boneDD);
    blob(g, 21, cy - 2, 10, 7.5, C.bone);
    blob(g, 18, cy - 4, 5, 3, C.boneL);
    blob(g, 25, cy + 4, 7, 2, C.boneD);                                     // pómulo en sombra
    for (let i = 0; i < 6; i++) px(g, 15 + i, cy - 6 + (i % 2), C.boneDD);  // grieta
    // ---- Morro de babuino: largo, rojo, con surcos azulados y el hocico achatado.
    const mx = 41 - q * 5, my = cy - 1, sr = 13 - q * 4;
    part(g, mx, my, sr, 5, C.snout, C.snoutD, C.snoutL);
    blob(g, mx - 2, my - 2, sr - 4, 2, C.snoutL);
    for (let j = 0; j < 3; j++) for (let x = mx - sr + 4; x < mx + sr - 6; x += 0.5) px(g, x, my - 3 + j * 2 + Math.round(Math.sin(x * 0.5) * 0.5), j === 1 ? C.ridge : C.snoutD, 0.6, 0.6);
    part(g, mx + sr, my + 1, 2.5, 3, C.snoutD, OUTLINE);                    // hocico
    px(g, mx + sr, my + 1, OUTLINE, 2, 1);                                  // fosas
    // ---- Arcada superior y colmillos enormes (los de arriba, hacia abajo).
    limb(g, 28, cy + 3, mx + sr - 3, my + 4, 2, C.bone);
    for (const [x, len, w] of [[mx - 1, 13, 3], [mx + 6 - q * 3, 9 + q * 3, 2 + q]]) { limb(g, x, my + 3, x + 1, my + 3 + len, w, C.fang, '#ffffff'); px(g, x + 1, my + 3 + len, OUTLINE); }
    // De tres cuartos asoma el otro ojo, junto al arranque del morro.
    if (q) { blob(g, 35, cy - 4, 2.4, 2.4, OUTLINE); px(g, 35 + (e.look?.x ?? 0) * 0.8, cy - 4.5, C.eye, 1, 1); px1(gl, (35 + (e.look?.x ?? 0) * 0.8) * S, (cy - 4.5) * S, C.eye, 2, 2); }
    // ---- Órbita hundida y un ojo que arde y te sigue con la mirada.
    blob(g, 30, cy - 4, 3.6, 3.1, OUTLINE);
    const lx = Math.max(-1, Math.min(1, e.look?.x ?? 1)), ly = Math.max(-1, Math.min(1, e.look?.y ?? 0));
    const ex = 30 + lx * 1.6, ey = cy - 4.5 + ly * 1.3;
    blob(g, ex, ey, 1.6, 1.4, '#5a0a08');
    px(g, ex - 0.5, ey - 0.5, C.eye, 1.2, 1.2);
    px1(gl, (ex - 0.5) * S, (ey - 0.5) * S, jaw > 0.5 ? '#ffd0a0' : C.eye, 2, 2);
    limb(g, 25, cy - 8, 35, cy - 7 + ly * 0.6, 2, C.boneL);                 // ceño
  },
};

// Melena erizada (como la del babuino) alrededor de la bóveda: mechones cortos y tiesos que salen
// en abanico entre los ángulos a0 y a1, desde el radio r.
function mane(g, cx, cy, a0, a1, r) {
  for (let i = 0; i <= 26; i++) {
    const a = a0 + (a1 - a0) * i / 26, len = 4 + ((i * 7) % 5) + (i % 3 === 0 ? 2 : 0);
    const j = Math.sin(i * 2.7) * 0.12;
    limb(g, cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), cx + Math.cos(a + j) * (r + len), cy + Math.sin(a + j) * (r + len), 1, i % 3 ? C.mane : C.maneL, i % 2 ? C.maneD : undefined);
  }
}

// De frente: la bóveda con su melena, dos órbitas con ojos que arden y te siguen, el morro
// rojo de mandril bajando por el centro con sus surcos azules a los lados, y los colmillos
// enormes colgando a los dos lados de la boca; al gritar, la mandíbula cae del todo.
function drawFront(g, gl, e, t) {
  const jaw = e.jaw ?? 0, cx = 30;
  const cy = G0 - 13 + (e.mood === 'growl' ? Math.round(Math.sin(t * 50) * 0.6) : 0);
  const lx = Math.max(-1, Math.min(1, e.look?.x ?? 0)), ly = Math.max(-1, Math.min(1, e.look?.y ?? 0));
  // Muñón del cuello asomando por debajo.
  part(g, cx, cy + 12, 3.5, 2.5, C.boneD, C.boneDD);
  // Mandíbula inferior: cae al abrir la boca; encías y colmillos de abajo.
  const jy = cy + 10 + jaw * 9;
  if (jaw > 0.05) blob(g, cx, cy + 10 + jaw * 4.5, 8, 1 + jaw * 4.5, C.gum);
  part(g, cx, jy, 9, 2.5, C.boneD, C.boneDD, C.bone);
  for (const s of [-1, 1]) limb(g, cx + s * 5, jy - 1, cx + s * 5, jy - 6, 2, C.fang);
  // Cresta de púas en abanico y bóveda.
  mane(g, cx, cy - 3, -3.25, -0.05, 11.5);
  part(g, cx, cy - 3, 14, 10, C.boneD, C.boneDD);
  blob(g, cx, cy - 4, 12, 8, C.bone);
  blob(g, cx - 5, cy - 7, 5, 2.5, C.boneL);
  for (const s of [-1, 1]) blob(g, cx + s * 11, cy + 2, 4, 3, C.boneD);    // pómulos
  for (let i = 0; i < 5; i++) px(g, cx + 6 + i, cy - 8 + (i % 2), C.boneDD); // grieta
  // Órbitas y ojos (miran hacia ti).
  for (const s of [-1, 1]) {
    blob(g, cx + s * 6, cy - 4, 3.6, 3, OUTLINE);
    const ex = cx + s * 6 + lx * 1.4, ey = cy - 4.4 + ly * 1.2;
    blob(g, ex, ey, 1.5, 1.3, '#5a0a08');
    px(g, ex - 0.5, ey - 0.5, C.eye, 1.2, 1.2);
    px1(gl, (ex - 0.5) * S, (ey - 0.5) * S, jaw > 0.5 ? '#ffd0a0' : C.eye, 2, 2);
  }
  limb(g, cx - 10, cy - 8, cx + 10, cy - 8, 2, C.boneL);                     // ceño
  // Morro de mandril: baja por el centro, rojo, con los surcos azules a los lados.
  part(g, cx, cy + 3, 4.5, 7, C.snout, C.snoutD, C.snoutL);
  blob(g, cx, cy, 2.5, 4, C.snoutL);
  for (const s of [-1, 1]) for (let y = cy - 2; y < cy + 8; y += 0.5) { px(g, cx + s * 3.3, y, C.ridge, 0.6, 0.6); px(g, cx + s * 4.1, y + 0.5, C.snoutD, 0.6, 0.6); }
  px(g, cx - 2, cy + 9, OUTLINE, 1.2, 1); px(g, cx + 1, cy + 9, OUTLINE, 1.2, 1);   // fosas
  // Colmillos enormes de arriba, a los dos lados del morro.
  for (const s of [-1, 1]) { limb(g, cx + s * 7, cy + 7, cx + s * 7.5, cy + 19, 3, C.fang, '#ffffff'); px(g, cx + s * 7.5, cy + 19, OUTLINE); }
}
