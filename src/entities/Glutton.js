// GLOTÓN (Sistema Digestivo): un gólem de comida a medio digerir. Masa de carne y masa
// de pan, con una calavera hundida en lo alto, costillas asomando, una boca enorme en
// la barriga de la que cuelga una tripa, porciones de tarta y huesos clavados en los
// hombros y bilis verde que gotea. Dos brazos-maza: el de atrás aprieta un muslo con su
// hueso; el de delante es un puño de masa con garras rosadas y un trozo de tarta.
// Da mazazos con las dos manos y salta hacia delante tras una sentadilla. La IA es el
// comportamiento `glutton` de entities/Enemy.js. Se dibuja mirando a la derecha.
import { px, seg, ik, OUTLINE } from './Rig.js';

const W = 84, H = 70, G = 68; // lienzo y suelo
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// Paletas (de sombra a brillo).
const DOUGH = ['#4a2e10', '#8a6428', '#c09a4a', '#e6c674'];
const MEAT = ['#341408', '#5e3018', '#8a4e2c', '#b47448'];
const FLESH = ['#4a1222', '#94384a', '#c86478', '#ee9cb0'];
const BONE = ['#7a6a52', '#cdbfa2', '#efe4cc', '#fffaf0'];
const BILE = ['#5a7a14', '#8ab030', '#c8e050'];

// Masa sombreada: elipse con contorno, luz de arriba a la izquierda y grumos (migas).
function mass(g, cx, cy, rx, ry, pal, grain = 0.18) {
  for (let y = -Math.ceil(ry) - 1; y <= Math.ceil(ry) + 1; y++) for (let x = -Math.ceil(rx) - 1; x <= Math.ceil(rx) + 1; x++) {
    const d = (x * x) / ((rx + 1) * (rx + 1)) + (y * y) / ((ry + 1) * (ry + 1));
    if (d > 1) continue;
    const din = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (din > 1) { px(g, cx + x, cy + y, OUTLINE); continue; }
    const l = -(x / rx) * 0.55 - (y / ry) * 0.75 + (1 - din) * 0.35;
    const n = hash(Math.round(cx + x), Math.round(cy + y));
    let k = l > 0.55 ? 3 : l > 0.1 ? 2 : l > -0.35 ? 1 : 0;
    if (n < grain) k = Math.max(0, k - 1);          // grumo hundido
    else if (n > 1 - grain * 0.4) k = Math.min(3, k + 1); // miga que brilla
    px(g, cx + x, cy + y, pal[k]);
  }
}
// Miembro grueso con contorno y brillo.
function limbOf(g, x0, y0, x1, y1, w, pal) {
  seg(g, x0, y0, x1, y1, OUTLINE, w + 2);
  seg(g, x0, y0, x1, y1, pal[1], w);
  seg(g, x0 - 1, y0 - 1, x1 - 1, y1 - 1, pal[2], Math.max(1, w - 3));
  seg(g, x0 - 1, y0 - 2, x1 - 1, y1 - 2, pal[3], 1);
}
// Brazo-maza: hombro, codo (doblado hacia fuera) y mano; gordo y con bultos de comida.
function arm(g, sx, sy, hx, hy, w, pal, bend) {
  const L = Math.max(10, Math.hypot(hx - sx, hy - sy) * 0.62);
  const [ex, ey] = ik(sx, sy, hx, hy, L, L, bend);
  limbOf(g, sx, sy, ex, ey, w + 1, pal);
  limbOf(g, ex, ey, hx, hy, w, pal);
  mass(g, ex, ey, w * 0.55, w * 0.5, pal, 0.3);                    // codo abultado
  mass(g, (sx + ex) / 2, (sy + ey) / 2 - 1, w * 0.45, w * 0.4, pal, 0.3);
}
// Hueso: caña con las dos cabezas redondeadas.
function bone(g, x0, y0, x1, y1) {
  seg(g, x0, y0, x1, y1, OUTLINE, 4);
  seg(g, x0, y0, x1, y1, BONE[2], 2);
  seg(g, x0 - 0.5, y0 - 0.5, x1 - 0.5, y1 - 0.5, BONE[3], 1);
  for (const [bx, by] of [[x0, y0], [x1, y1]]) {
    for (const [ox, oy] of [[-1.5, -1], [1.5, 1]]) {
      px(g, bx + ox - 1, by + oy - 1, OUTLINE, 3, 3);
      px(g, bx + ox - 0.5, by + oy - 0.5, BONE[2], 2, 2);
    }
  }
}
// Porción de tarta: bizcocho, nata rosa que chorrea y una cereza.
function cake(g, x, y, w, h, cherry) {
  px(g, x - 1, y - 1, OUTLINE, w + 2, h + 2);
  px(g, x, y, '#e8c060', w, h);
  px(g, x, y + Math.round(h * 0.5), '#c89838', w, 1);
  px(g, x, y, '#f4a6c8', w, 3);
  px(g, x, y, '#ffd4e8', Math.max(1, w - 2), 1);
  for (let i = 0; i < w; i += 3) px(g, x + i, y + 3, '#f4a6c8', 1, 1 + ((i * 7) % 3));
  if (cherry) { px(g, x + w / 2 - 2, y - 4, OUTLINE, 5, 5); px(g, x + w / 2 - 1, y - 3, '#d81c1c', 3, 3); px(g, x + w / 2 - 1, y - 3, '#ff8a8a'); px(g, x + w / 2 + 1, y - 6, '#5a8a2a', 1, 3); }
}

export const GLUTTON = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2, e.y + e.h - H],
  draw(g, gl, e, t) {
    const st = e.st ?? 'walk', k = e.stK ?? 0; // k: avance de la pose (0..1)
    e.walkPh = (e.walkPh ?? 0) + Math.abs(e.vx) * 0.0016;
    const ph = e.walkPh * Math.PI * 2, walking = st === 'walk' && Math.abs(e.vx) > 2;
    // Cuánto se agacha el cuerpo (sentadilla, aterrizaje, mazazo) o se estira (salto).
    const squat = st === 'squat' ? 7 * k : st === 'land' ? 6 * (1 - k) : st === 'smash' ? 4 : st === 'hop' ? -3 : 0;
    const bob = walking ? Math.abs(Math.sin(ph)) * 1.5 : Math.sin(t * 2) * 0.6;
    const by = 38 + squat - bob;
    const lean = st === 'smash' ? 3 : st === 'raise' ? -2 : 0;
    const bx = 40 + lean;

    // --- Piernas (masa de pan) y pies con dedos.
    for (const [hx, side] of [[31, -1], [49, 1]]) {
      const step = walking ? Math.sin(ph + (side > 0 ? Math.PI : 0)) * 3 : 0;
      const fx = hx + step + (st === 'hop' ? side * 2 : 0), fy = st === 'hop' ? G - 4 : G - 2;
      limbOf(g, hx + lean * 0.5, by + 12, fx, fy - 3, 9, DOUGH);
      mass(g, fx + 2, fy - 1, 7, 3, DOUGH, 0.25);
      for (let i = 0; i < 3; i++) { px(g, fx + 4 + i * 2, fy + 1, OUTLINE, 2, 2); px(g, fx + 4 + i * 2, fy + 1, DOUGH[2]); }
    }

    // --- Brazo de atrás (sujeta un muslo con hueso): se dibuja detrás del cuerpo.
    const hands = handPose(st, k, t, ph, walking, bx, by);
    arm(g, bx - 12, by - 8, hands.back[0], hands.back[1], 7, MEAT, 1);
    mass(g, hands.back[0], hands.back[1], 6, 5, MEAT, 0.2);                   // el muslo
    bone(g, hands.back[0] - 2, hands.back[1] - 4, hands.back[0] - 6, hands.back[1] - 10);

    // --- Cuerpo: masa de carne con remiendos de pan y carne cruda.
    mass(g, bx, by, 17, 18, MEAT, 0.22);
    mass(g, bx - 8, by + 6, 7, 8, DOUGH, 0.3);                                 // grumo de pan
    mass(g, bx + 9, by - 9, 7, 6, FLESH, 0.15);                                // carne cruda
    mass(g, bx - 10, by - 10, 6, 5, DOUGH, 0.3);
    // Costillas que asoman por el costado.
    for (let i = 0; i < 3; i++) {
      const ry = by - 4 + i * 4;
      seg(g, bx + 9, ry, bx + 15, ry + 2, OUTLINE, 3);
      seg(g, bx + 9, ry, bx + 15, ry + 2, BONE[2], 1);
    }
    // Boca de la barriga: enorme, con dientes y una tripa que cuelga.
    const open = st === 'raise' ? 0.6 + 0.4 * k : st === 'smash' ? 1 : 0.55 + 0.1 * Math.sin(t * 3);
    const mx = bx + 5, my = by + 6, mrx = 6, mry = 4 + open * 4;
    mass(g, mx, my, mrx + 1, mry + 1, FLESH, 0.05);
    for (let y = -Math.ceil(mry); y <= Math.ceil(mry); y++) for (let x = -mrx; x <= mrx; x++) {
      if ((x * x) / (mrx * mrx) + (y * y) / (mry * mry) <= 1) px(g, mx + x, my + y, y > mry * 0.3 ? '#1a0408' : '#2e0a10');
    }
    for (let x = -mrx + 1; x < mrx; x += 2) { px(g, mx + x, my - mry, BONE[3], 1, 2); px(g, mx + x + 1, my + mry - 1, BONE[2], 1, 2); }
    gl.globalAlpha = 0.35 * open; px(gl, mx - 2, my - 1, '#ff3a2a', 4, 3); gl.globalAlpha = 1; // la garganta arde
    // Tripa que cuelga de la boca y se balancea.
    const sw = Math.sin(t * 2.4) * 2 + (walking ? Math.sin(ph) * 2 : 0);
    for (let i = 0; i < 12; i++) {
      const tx = mx - 2 + Math.sin(i * 0.5) * 2 + sw * (i / 12), ty = my + 2 + i;
      px(g, tx - 1, ty, OUTLINE, 4, 1); px(g, tx, ty, i % 3 ? FLESH[2] : FLESH[3], 2, 1);
    }

    // --- Calavera hundida arriba, babeando bilis.
    const sx = bx - 7, sy = by - 15;
    mass(g, sx, sy, 6, 6, BONE, 0.08);
    px(g, sx - 4, sy - 1, '#1a0a08', 3, 3); px(g, sx + 1, sy - 1, '#1a0a08', 3, 3);
    px(g, sx - 3, sy, '#c8e050'); px(g, sx + 2, sy, '#c8e050');                    // brillo en las cuencas
    px(gl, sx - 3, sy, '#6a8a20'); px(gl, sx + 2, sy, '#6a8a20');
    px(g, sx - 2, sy + 3, '#1a0a08', 5, 2);
    for (let i = -2; i <= 2; i += 2) px(g, sx + i, sy + 3, BONE[3]);

    // --- Hombros: tarta, bizcocho y huesos clavados.
    cake(g, bx + 4, by - 23, 12, 7, true);
    cake(g, bx - 4, by - 26, 7, 5, false);
    bone(g, bx - 14, by - 14, bx - 20, by - 24);
    bone(g, bx - 2, by - 20, bx - 4, by - 28);

    // --- Bilis que gotea (de la calavera y de la boca).
    for (const [dx0, dy0, ph0] of [[sx - 1, sy + 5, 0], [sx + 3, sy + 5, 1.7], [mx - 4, my + mry, 0.8], [mx + 4, my + mry, 2.4]]) {
      const len = 2 + Math.floor(((t * 1.3 + ph0) % 1) * 6);
      for (let i = 0; i < len; i++) px(g, dx0, dy0 + i, i === len - 1 ? BILE[2] : BILE[1]);
      px(gl, dx0, dy0 + len - 1, '#3a5a10');
    }

    // --- Brazo de delante: puño de masa con garras rosadas y un trozo de tarta.
    arm(g, bx + 12, by - 8, hands.front[0], hands.front[1], 8, DOUGH, -1);
    const [fx, fy] = hands.front;
    mass(g, fx, fy, 7, 6, DOUGH, 0.25);
    for (let i = 0; i < 3; i++) {
      const cx = fx - 3 + i * 3, cy = fy + 5;
      seg(g, cx, cy, cx + 1, cy + 4, OUTLINE, 3); seg(g, cx, cy, cx + 1, cy + 4, FLESH[2], 1);
    }
    cake(g, fx - 2, fy - 10, 8, 5, true);

    // Polvo y migas al golpear el suelo.
    if (st === 'smash' || (st === 'land' && k < 0.3)) {
      for (let i = 0; i < 6; i++) px(g, hands.front[0] - 8 + i * 4, G - 1 - ((i * 5 + Math.floor(t * 30)) % 4), i % 2 ? DOUGH[2] : FLESH[2]);
    }
  },
};

// Dónde van las manos según la pose: [x, y] de la mano de atrás y la de delante.
function handPose(st, k, t, ph, walking, bx, by) {
  const idleB = [bx - 16 + (walking ? Math.sin(ph) * 3 : 0), by + 12 + Math.sin(t * 2) * 0.8];
  const idleF = [bx + 18 + (walking ? -Math.sin(ph) * 3 : 0), by + 12 + Math.sin(t * 2 + 1) * 0.8];
  const up = { back: [bx - 6, by - 24], front: [bx + 8, by - 25] };
  const down = { back: [bx + 18, G - 6], front: [bx + 26, G - 6] };
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  if (st === 'raise') { const u = Math.min(1, k * 1.3); return { back: lerp(idleB, up.back, u), front: lerp(idleF, up.front, u) }; }
  if (st === 'smash') { const u = Math.min(1, k * 2); return { back: lerp(up.back, down.back, u), front: lerp(up.front, down.front, u) }; }
  if (st === 'recover') return { back: lerp(down.back, idleB, k), front: lerp(down.front, idleF, k) };
  if (st === 'squat') return { back: [bx - 18, by + 6], front: [bx + 20, by + 6] };
  if (st === 'hop') return { back: [bx - 18, by - 10], front: [bx + 20, by - 12] }; // brazos en alto al saltar
  return { back: idleB, front: idleF };
}
