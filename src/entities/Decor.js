import { TILE } from '../core/Physics.js';
import { px, seg, blob, part, mix } from './Rig.js';
import { canvasSprite } from './Puzzles.js';

// Decoración del Sistema Nervioso: estructuras que se colocan en la sala (editor:
// "Decoración (sistema nervioso)") para dar variedad al fondo. Animadas, sin colisión.
// De fondo por defecto (las paredes de la sala las tapan); con front: true, por delante.
//
// En la sala: decor: [{ x, y, type, flip?, front? }]. (x, y) es la casilla del centro de
// su base (las que cuelgan del techo, como el haz nervioso, cuelgan de esa casilla).

const K = '#140c10';
const C = {                       // paleta nerviosa
  tissue: '#4a3058', tissueD: '#2e1c3a', tissueL: '#6a4a82', hi: '#8a6ab8',
  myelin: '#d8c8e8', myelinD: '#9a88b0', imp: '#82d2ff', impL: '#e0f6ff', gold: '#ffd25a',
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Rama que serpentea desde (x, y) con ángulo a: devuelve sus puntos.
function branch(r, x, y, a, len, wobble = 0.35) {
  const pts = [[x, y]];
  for (let i = 0; i < len; i++) { a += (r() - 0.5) * wobble; x += Math.cos(a); y += Math.sin(a); pts.push([x, y]); }
  return pts;
}
const drawPath = (g, pts, c, w = 1) => { for (let i = 1; i < pts.length; i++) seg(g, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, w); };
const glowAt = (gl, x, y, c, n = 2) => px(gl, x - (n >> 1), y - (n >> 1), c, n, n);

// Cada tipo: tamaño del lienzo, cómo se ancla y su dibujo (geometría fija + animación).
export const DECOR = {
  // Neurona: soma con núcleo, dendritas ramificadas y axón mielinizado hacia abajo.
  neurona: {
    name: 'Neurona', w: 72, h: 80,
    setup(r) {
      const cx = 36, cy = 30, dend = [];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55 + (r() - 0.5) * 0.3;
        const main = branch(r, cx + Math.cos(a) * 7, cy + Math.sin(a) * 6, a, 16 + r() * 8);
        const end = main[main.length - 1], kids = [];
        for (const s of [-1, 1]) kids.push(branch(r, end[0], end[1], a + s * 0.6, 6 + r() * 6));
        dend.push({ main, kids, ph: r() * 3 });
      }
      const axon = branch(r, cx, cy + 8, Math.PI / 2, 40, 0.12);
      return { cx, cy, dend, axon };
    },
    draw(g, gl, t, s) {
      const fire = (t % 2.6) / 2.6;                         // ciclo: entra señal, dispara
      for (const d of s.dend) {
        drawPath(g, d.main, C.tissueD, 3); drawPath(g, d.main, C.tissue, 2);
        for (const k of d.kids) { drawPath(g, k, C.tissueD, 2); drawPath(g, k, C.tissueL, 1); }
        // Impulsos entrantes: desde las puntas hacia el soma.
        const u = ((t * 0.7 + d.ph) % 1), i = Math.floor((1 - u) * (d.main.length - 1));
        const [x, y] = d.main[i]; px(g, x, y, C.imp, 2, 2); glowAt(gl, x, y, C.imp, 3);
      }
      // Axón con vainas de mielina; el disparo baja por él.
      drawPath(g, s.axon, C.tissueD, 3);
      for (let i = 2; i < s.axon.length - 1; i += 6) { const [x, y] = s.axon[i]; blob(g, x, y + 1, 2.4, 2.6, C.myelin, C.myelinD); }
      const shot = fire > 0.55 ? Math.floor(((fire - 0.55) / 0.45) * (s.axon.length - 1)) : -1;
      if (shot >= 0) { const [x, y] = s.axon[shot]; px(g, x - 1, y - 1, C.impL, 3, 3); glowAt(gl, x, y, C.imp, 5); }
      // Soma: se ilumina al disparar.
      const flash = fire > 0.5 && fire < 0.62 ? 1 : 0;
      part(g, s.cx, s.cy, 9 + flash * 0.6, 8 + flash * 0.6, flash ? C.hi : C.tissueL, C.tissue);
      blob(g, s.cx + 1, s.cy, 3.4, 3.2, flash ? C.impL : '#2a1a40');
      px(g, s.cx, s.cy - 1, flash ? '#ffffff' : C.hi, 2, 2);
      if (flash) blob(gl, s.cx, s.cy, 8, 7, '#2a5a8a');
      else glowAt(gl, s.cx + 1, s.cy, '#1a3050', 4);
    },
  },
  // Ganglio: racimo de bulbos nerviosos que laten a destiempo y chispean entre ellos.
  ganglio: {
    name: 'Ganglio', w: 64, h: 48,
    setup(r) {
      const b = [];
      for (let i = 0; i < 7; i++) b.push({ x: 12 + r() * 40, y: 12 + r() * 26, r: 4 + r() * 5, ph: r() * 6 });
      b.sort((p, q) => q.r - p.r);
      const fib = [];
      for (let i = 1; i < b.length; i++) { const j = Math.floor(r() * i); fib.push([b[i], b[j]]); }
      const roots = [];
      for (let i = 0; i < 4; i++) { const o = b[Math.floor(r() * b.length)]; roots.push(branch(r, o.x, o.y, Math.PI / 2 + (r() - 0.5) * 1.6, 14 + r() * 10)); }
      return { b, fib, roots };
    },
    draw(g, gl, t, s) {
      for (const p of s.roots) { drawPath(g, p, C.tissueD, 2); drawPath(g, p, C.tissue, 1); }
      for (const [a, c] of s.fib) { seg(g, a.x, a.y, c.x, c.y, C.tissueD, 3); seg(g, a.x, a.y, c.x, c.y, C.tissueL, 1); }
      for (const o of s.b) {
        const k = Math.max(0, Math.sin(t * 2.2 + o.ph));
        part(g, o.x, o.y, o.r + k * 0.6, o.r * 0.9 + k * 0.5, mix(C.tissueL, C.hi, k), C.tissue, C.myelin);
        if (k > 0.6) blob(gl, o.x, o.y, o.r * 0.7, o.r * 0.6, mix('#000000', '#3a6aa0', (k - 0.6) / 0.4));
      }
      // Chispa entre dos bulbos, de vez en cuando.
      const i = Math.floor(t * 1.7) % s.fib.length, live = (t * 1.7) % 1 < 0.18;
      if (live) {
        const [a, c] = s.fib[i];
        let x = a.x, y = a.y;
        for (let k = 1; k <= 5; k++) { const nx = a.x + (c.x - a.x) * (k / 5) + (Math.random() - 0.5) * 4, ny = a.y + (c.y - a.y) * (k / 5) + (Math.random() - 0.5) * 4; seg(g, x, y, nx, ny, C.impL); seg(gl, x, y, nx, ny, C.imp, 2); x = nx; y = ny; }
      }
    },
  },
  // Haz nervioso: un nervio grueso en arco (cuelga del techo por sus dos extremos), con su
  // vaina de mielina por segmentos y la señal que corre a lo largo; caen fibras sueltas.
  nervio: {
    name: 'Haz nervioso', w: 128, h: 56, hang: true,
    setup(r) {
      const pts = [];
      for (let i = 0; i <= 120; i++) { const u = i / 120; pts.push([4 + u * 120, 6 + Math.sin(u * Math.PI) * 30 + Math.sin(u * 9) * 1.5]); }
      const hang = [];
      for (let i = 0; i < 9; i++) { const j = 10 + Math.floor(r() * 100); hang.push({ p: pts[j], len: 6 + r() * 14, ph: r() * 6 }); }
      return { pts, hang };
    },
    draw(g, gl, t, s) {
      for (const h of s.hang) { const sw = Math.sin(t * 1.3 + h.ph) * 1.5; seg(g, h.p[0], h.p[1], h.p[0] + sw, h.p[1] + h.len, C.tissue, 1); px(g, h.p[0] + sw, h.p[1] + h.len, C.hi); }
      for (let i = 1; i < s.pts.length; i++) seg(g, s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1], K, 8);   // contorno, todo primero
      for (let i = 1; i < s.pts.length; i++) {
        const [ax, ay] = s.pts[i - 1], [bx, by] = s.pts[i];
        const band = Math.floor(i / 7) % 2;
        seg(g, ax, ay, bx, by, band ? C.myelin : C.myelinD, 6);
        seg(g, ax, ay - 1.5, bx, by - 1.5, band ? '#f0e8f8' : C.myelin, 1);
        if (i % 7 === 0) seg(g, bx, by - 3, bx, by + 3, C.tissueD, 1);   // nódulos de Ranvier
      }
      // La señal salta de nódulo en nódulo.
      const n = s.pts.length, u = (t * 0.6) % 1, i = Math.floor(u * (n - 1) / 7) * 7;
      const [x, y] = s.pts[Math.min(n - 1, i)];
      px(g, x - 1, y - 2, C.impL, 3, 4); blob(gl, x, y, 4, 4, '#2a5a8a');
    },
  },
  // Sinapsis: dos terminales enfrentados; las vesículas sueltan neurotransmisor a través
  // de la hendidura y el de enfrente chispea al recibirlo.
  sinapsis: {
    name: 'Sinapsis', w: 64, h: 40,
    setup(r) { return { ves: [...Array(6)].map(() => ({ x: 10 + r() * 10, y: 13 + r() * 14 })), ph: r() * 3 }; },
    draw(g, gl, t, s) {
      seg(g, 0, 20, 14, 20, C.tissueD, 6); seg(g, 50, 20, 64, 20, C.tissueD, 6);
      part(g, 18, 20, 11, 12, C.tissueL, C.tissue, C.myelin);
      part(g, 46, 20, 10, 12, C.tissueL, C.tissue, C.myelin);
      for (const v of s.ves) { blob(g, v.x, v.y, 2, 2, C.myelin, C.myelinD); }
      // Neurotransmisor cruzando la hendidura.
      const u = ((t * 0.9 + s.ph) % 1);
      for (let k = 0; k < 5; k++) {
        const p = (u + k * 0.12) % 1, x = 28 + p * 9, y = 14 + ((k * 37) % 13);
        if (p < 0.95) { px(g, x, y, C.gold); px(gl, x, y, '#5a4010'); }
      }
      // Receptores del otro lado.
      for (let y = 10; y <= 30; y += 4) px(g, 36, y, C.hi, 1, 2);
      if (u > 0.8) { for (let k = 0; k < 4; k++) { const y = 12 + Math.random() * 16; seg(g, 37, y, 40 + Math.random() * 3, y + (Math.random() - 0.5) * 4, C.impL); } blob(gl, 46, 20, 6, 7, '#2a5a8a'); }
    },
  },
  // Médula: columna con anillos de vértebra, raíces nerviosas a los lados y un impulso
  // que sube por ella.
  medula: {
    name: 'Médula', w: 48, h: 112,
    setup(r) {
      const roots = [];
      for (let y = 12; y < 104; y += 14) for (const sd of [-1, 1]) roots.push(branch(r, 24 + sd * 6, y, sd > 0 ? 0.3 : Math.PI - 0.3, 10 + r() * 8, 0.4));
      return { roots };
    },
    draw(g, gl, t, s) {
      for (const p of s.roots) { drawPath(g, p, C.tissueD, 2); drawPath(g, p, C.tissue, 1); }
      for (let y = 0; y < 112; y++) {
        const w = 6 + Math.sin(y * 0.45) * 0.6;
        for (let x = -w; x <= w; x++) { const u = x / w; px(g, 24 + x, y, u < -0.6 ? C.tissueD : u > 0.5 ? C.tissue : C.tissueL); }
      }
      for (let y = 6; y < 112; y += 14) {                    // vértebras
        part(g, 24, y, 10, 3, '#cbbfa8', '#8a7a64', '#f0e8d8');
        px(g, 14, y, '#8a7a64', 3, 2); px(g, 31, y, '#8a7a64', 3, 2);
      }
      const y = 112 - ((t * 40) % 128);
      if (y > 0) { px(g, 22, y, C.impL, 4, 5); blob(gl, 24, y + 2, 5, 6, '#2a5a8a'); }
    },
  },
  // Astrocito: célula en estrella con prolongaciones que se mecen; respira luz despacio.
  astrocito: {
    name: 'Astrocito', w: 56, h: 56,
    setup(r) { return { arms: [...Array(10)].map((_, i) => ({ a: (i / 10) * Math.PI * 2 + r() * 0.4, len: 12 + r() * 12, ph: r() * 6 })) }; },
    draw(g, gl, t, s) {
      const cx = 28, cy = 28, br = 0.5 + 0.5 * Math.sin(t * 1.1);
      for (const a of s.arms) {
        let x = cx, y = cy, ang = a.a;
        for (let i = 0; i < a.len; i++) {
          ang += Math.sin(t * 0.8 + a.ph + i * 0.3) * 0.04;
          const nx = x + Math.cos(ang), ny = y + Math.sin(ang);
          seg(g, x, y, nx, ny, i < a.len * 0.5 ? C.tissueL : C.tissue, i < a.len * 0.4 ? 2 : 1);
          x = nx; y = ny;
        }
        blob(g, x, y, 1.5, 1.5, C.hi);
        if (br > 0.7) px(gl, x, y, '#2a4a70');
      }
      part(g, cx, cy, 6, 5.5, mix(C.tissueL, C.hi, br * 0.6), C.tissue, C.myelin);
      blob(gl, cx, cy, 4 + br * 2, 4 + br * 2, mix('#0a1020', '#2a5a8a', br));
    },
  },
};

export class Decor {
  constructor(game, room, def, i) {
    this.game = game;
    this.def = def;
    this.type = DECOR[def.type] ?? DECOR.neurona;
    const T = this.type;
    this.state = T.setup(rng((def.x * 73856093) ^ (def.y * 19349663) ^ (i * 83492791)));
    const order = def.front ? 2 : -5;
    this.spr = canvasSprite(game, T.w, T.h, order);
    this.spr.glow.renderOrder = order;
    // Base centrada en (x, y); lo que cuelga, desde el techo de esa casilla.
    this.x0 = (def.x + 0.5) * TILE - T.w / 2;
    this.y0 = T.hang ? def.y * TILE : (def.y + 1) * TILE - T.h;
    this.spr.place(this.x0, this.y0);
    this.spr.mesh.scale.x = this.spr.glow.scale.x = def.flip ? -1 : 1;
    this.t = Math.random() * 10;
    this.drawnAt = -1;
  }

  update(dt) {
    this.t += dt;
    if (this.t - this.drawnAt < 1 / 20) return;
    this.drawnAt = this.t;
    const { g, gl } = this.spr;
    g.clearRect(0, 0, this.type.w, this.type.h);
    gl.clearRect(0, 0, this.type.w, this.type.h);
    this.type.draw(g, gl, this.t, this.state);
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// Un fotograma de muestra (para el editor).
export function decorPreview(type, seed = 7) {
  const T = DECOR[type] ?? DECOR.neurona;
  const c = document.createElement('canvas'), gc = document.createElement('canvas');
  c.width = gc.width = T.w; c.height = gc.height = T.h;
  T.draw(c.getContext('2d'), gc.getContext('2d'), 1.4, T.setup(rng(seed)));
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'lighter'; x.drawImage(gc, 0, 0);
  return c;
}
