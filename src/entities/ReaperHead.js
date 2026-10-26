// LA TESTA DEL RELICARIO: un cráneo de babuino enloquecido. Bóveda de hueso agrietada con
// una cresta de púas, órbita hundida con un ojo que arde, un morro larguísimo de carne roja
// con surcos azulados (de mandril) y colmillos enormes. La mandíbula se abre al morder
// (e.jaw 0..1). Al tocar el suelo despliega cuatro patas de hueso (e.legs 0..1) y corre.
// Dibujado mirando a la derecha (el render lo voltea según e.dir).
import { px, limb, part, blob, jointLeg, OUTLINE } from './Rig.js';

const W = 60, H = 42, G0 = H - 2;
const C = {
  bone: '#d8cfb0', boneL: '#f2ead0', boneD: '#a89e80', boneDD: '#6e664e',
  snout: '#b8402e', snoutL: '#e8704a', snoutD: '#6a1a14', ridge: '#4a5a9a',
  gum: '#5a0a14', fang: '#f6f0dc', eye: '#ff3b2f',
};

export const REAPER_HEAD = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2 + 2, e.y + e.h - G0],
  draw(g, gl, e, t) {
    const legs = e.legs ?? 0, jaw = e.jaw ?? 0;
    const run = Math.abs(e.vx) > 5 && legs > 0.5;
    const ph = (e.t ?? t) * 16;
    const lift = Math.round(legs * 9);
    const cy = G0 - 11 - lift + (run ? Math.round(Math.sin(ph * 2)) : 0);
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
    if (jaw > 0.05) { // encías y garganta a la vista
      for (let k = 0; k < 1; k += 0.05) { const x = hx + (jx - hx) * k, y = hy + (jy - hy) * k; px(g, x, hy + 1, C.gum, 1, Math.max(1, y - hy)); }
    }
    limb(g, hx, hy, jx, jy, 4, C.boneD, C.bone);
    for (let i = 0; i < 2; i++) {                                     // colmillos de abajo, hacia arriba
      const k = 0.62 + i * 0.22, x = hx + (jx - hx) * k, y = hy + (jy - hy) * k;
      const tx = x + Math.sin(a) * 6, ty = y - Math.cos(a) * 6;
      limb(g, x, y, tx, ty, 2, C.fang);
    }
    // ---- Bóveda del cráneo, cresta de púas y grietas.
    for (let i = 0; i < 4; i++) { const x0 = 14 + i * 5, x1 = x0 - 3 - i, y1 = cy - 16 - (i % 2) * 3; limb(g, x0, cy - 8, x1, y1, i === 1 ? 3 : 2, C.boneL); }
    part(g, 22, cy - 1, 12, 9.5, C.boneD, C.boneDD);
    blob(g, 21, cy - 2, 10, 7.5, C.bone);
    blob(g, 18, cy - 4, 5, 3, C.boneL);
    blob(g, 25, cy + 4, 7, 2, C.boneD);                                     // pómulo en sombra
    for (let i = 0; i < 6; i++) px(g, 15 + i, cy - 6 + (i % 2), C.boneDD);       // grieta
    // ---- Morro de babuino: largo, rojo, con surcos azulados y el hocico achatado.
    const mx = 41, my = cy - 1;
    part(g, mx, my, 13, 5, C.snout, C.snoutD, C.snoutL);
    blob(g, mx - 2, my - 2, 9, 2, C.snoutL);
    for (let j = 0; j < 3; j++) for (let x = mx - 9; x < mx + 7; x++) px(g, x, my - 3 + j * 2 + Math.round(Math.sin(x * 0.5) * 0.5), j === 1 ? C.ridge : C.snoutD);
    part(g, mx + 13, my + 1, 2.5, 3, C.snoutD, OUTLINE);                    // hocico
    px(g, mx + 13, my + 1, OUTLINE, 2, 1);                                  // fosas
    // ---- Arcada superior y colmillos enormes (los de arriba, hacia abajo).
    limb(g, 28, cy + 3, mx + 10, my + 4, 2, C.bone);
    for (const [x, len, w] of [[mx - 1, 13, 3], [mx + 6, 9, 2]]) { limb(g, x, my + 3, x + 1, my + 3 + len, w, C.fang, '#ffffff'); px(g, x + 1, my + 3 + len, OUTLINE); }
    // ---- Órbita hundida y ojo que arde (más, con la boca abierta).
    blob(g, 30, cy - 4, 3.5, 3, OUTLINE);
    px(g, 30, cy - 5, C.eye, 2, 2);
    px(gl, 30, cy - 5, jaw > 0.5 ? '#ffd0a0' : C.eye, 2, 2);
    limb(g, 25, cy - 8, 35, cy - 7, 2, C.boneL);                           // ceño
  },
};
