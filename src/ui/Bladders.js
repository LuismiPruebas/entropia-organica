// Vejigas de fluido: el HUD orgánico (y las constantes vitales del Genoma).
// Cada parámetro es un saco de carne translúcida lleno de un fluido de color que
// chapotea, burbujea y late. Todo en píxeles sobre un lienzo 2D.

import { PixBuf, parseColor, pack } from '../core/PixBuf.js';

const K = '#140c10';

function px(g, x, y, c, w = 1, h = 1) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

// Sombreado numérico de un color base (como shade(), sin construir cadenas).
const shadeN = ([r, g, b], k) => pack(Math.max(0, Math.min(255, Math.round(r * k))), Math.max(0, Math.min(255, Math.round(g * k))), Math.max(0, Math.min(255, Math.round(b * k))));

// Perfil del saco: cuello estrecho arriba, panza abajo. Devuelve la media anchura de
// la fila `y` (0 = arriba, h-1 = abajo) para un saco de ancho w.
function halfWidth(y, h, w) {
  const k = y / (h - 1);
  const neck = 0.3, belly = 1;
  const v = k < 0.22 ? neck + (k / 0.22) * 0.35 : Math.sin(Math.min(1, (k - 0.1) / 0.92) * Math.PI * 0.62 + 0.55) * belly;
  return Math.max(1, Math.round((w / 2) * Math.min(1, v)));
}

// Dibuja un saco en (x, y) de tamaño w×h.
//   level   0..1, cuánto fluido contiene
//   color   color del fluido
//   opts.t        tiempo (animación)
//   opts.scab     0..1, parte de arriba necrosada (capacidad perdida)
//   opts.low      true: late y la membrana se enrojece (reserva baja)
//   opts.boil     0..1, cuánto burbujea
//   opts.glow     lienzo de brillo opcional (el fluido luminoso brilla en la oscuridad)
//   opts.seed     para que cada saco tenga sus venas
export function drawBladder(g, x, y, w, h, level, color, opts = {}) {
  const t = opts.t ?? 0, seed = opts.seed ?? 1;
  const beat = opts.low ? Math.max(0, Math.sin(t * 9)) : Math.max(0, Math.sin(t * 2.4 + seed));
  const swell = opts.low ? beat * 0.12 : beat * 0.04;
  const W = Math.round(w * (1 + swell)), ox = x - Math.round((W - w) / 2);
  const cx = ox + W / 2;
  const membrane = opts.low ? (Math.floor(t * 6) % 2 ? '#7a2030' : '#4a1824') : '#3a2028';
  const inner = h - 2;
  const surfaceY = y + 1 + inner * (1 - Math.max(0, Math.min(1, level)));
  const scabY = y + 1 + inner * (opts.scab ?? 0);
  // Cada saco es un poco deforme: bultos a un lado, que ondulan al respirar.
  const lump = (row) => Math.round(Math.sin(row * 0.55 + seed * 1.7) * 0.9 + Math.sin(row * 0.23 + t * 1.3 + seed) * 0.5);
  for (let row = 0; row < h; row++) {
    const base = halfWidth(row, h, W), yy = y + row;
    const l = row > 2 ? lump(row) : 0;
    const left = base + Math.max(0, l), right = base + Math.max(0, -l);
    // Contorno.
    px(g, cx - left - 1, yy, K);
    px(g, cx + right, yy, K);
    for (let xx = -left; xx < right; xx++) {
      const hw = xx < 0 ? left : right;
      const X = cx + xx;
      const edge = xx === -left || xx === right - 1;
      // Ola de la superficie: chapotea.
      const wave = Math.sin(xx * 0.9 + t * 4 + seed) * 0.8;
      let c;
      if (yy < scabY) {
        c = (xx + row) % 3 ? '#2a1418' : '#3a1a20';                  // costra necrosada
      } else if (yy >= surfaceY + wave) {
        const depth = (yy - surfaceY) / Math.max(1, inner);
        c = shade(color, 1.15 - depth * 0.55);
        if (opts.glow) { opts.glow.fillStyle = shade(color, 0.55 - depth * 0.3); opts.glow.fillRect(X, yy, 1, 1); }
      } else {
        c = edge ? membrane : (xx + row + seed) % 7 ? '#1c1216' : '#24161c'; // membrana vacía, translúcida
      }
      if (edge && yy >= surfaceY + wave) c = shade(color, 0.6);
      px(g, X, yy, c);
    }
  }
  // Tapa del cuello y base.
  px(g, cx - 1, y - 1, K, 2, 1);
  const bw = halfWidth(h - 1, h, W);
  px(g, cx - bw, y + h, K, bw * 2, 1);
  // Venas sobre la membrana.
  let vx = cx - W / 4 + (seed % 3);
  for (let row = Math.round(h * 0.3); row < h - 2; row++) {
    if ((row + seed) % 2) vx += Math.sin(row + seed) > 0 ? 1 : -1;
    const hw = halfWidth(row, h, W);
    if (Math.abs(vx - cx) < hw - 1) px(g, vx, y + row, 'rgba(120,30,50,0.55)');
  }
  // Burbujas que suben dentro del fluido.
  const nB = 1 + Math.round((opts.boil ?? 0.2) * 4);
  for (let i = 0; i < nB; i++) {
    const speed = 6 + (opts.boil ?? 0.2) * 14;
    const by = y + h - 2 - ((t * speed + i * 7 + seed * 3) % Math.max(2, h - 3));
    const bx = cx + Math.sin(i * 2.3 + seed + t) * (W / 4);
    if (by > surfaceY + 1) px(g, bx, by, shade(color, 1.6));
  }
  // Brillo húmedo de la membrana.
  px(g, cx - W / 4, y + h * 0.35, 'rgba(255,240,240,0.55)', 1, 2);
}

// Dígitos de 3x5 para los contadores (la fuente del juego no cabe tan pequeña).
const DIGITS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
};
export function drawNumber(g, x, y, n, color) {
  String(n).split('').forEach((d, i) => {
    const bits = DIGITS[d];
    for (let k = 0; k < 15; k++) {
      if (bits[k] !== '1') continue;
      px(g, x + i * 4 + (k % 3) + 1, y + Math.floor(k / 3) + 1, K);
      px(g, x + i * 4 + (k % 3), y + Math.floor(k / 3), color);
    }
  });
}

// Icono del hueso (el recurso): un fémur de marfil con sus dos cabezas, sombreado
// desde arriba, con un brillo que recorre la diáfisis y una astilla suelta al lado.
const BONE = [
  '.KK....KK.',
  'KLLK..KLLK',
  'KLLLLLLLMK',
  'KMMMMMMMDK',
  'KMDK..KDDK',
  '.KK....KK.',
];
const BONE_C = { K, L: '#f4ecd8', M: '#d8ccb0', D: '#a08c6c' };
export function drawBoneIcon(g, x, y, t) {
  BONE.forEach((row, r) => [...row].forEach((c, i) => { if (c !== '.') px(g, x - 1 + i, y - 1 + r, BONE_C[c]); }));
  const shine = Math.floor((t * 3) % 9);
  if (shine >= 2 && shine <= 6) px(g, x - 1 + shine, y + 1, '#ffffff'); // brillo que recorre el hueso
  px(g, x + 7, y - 3, K, 2, 1); px(g, x + 8, y - 4, '#e0d4b8'); // astilla
}

// ---------------------------------------------------------------------------
// Placenta: una membrana ovalada que contiene las vejigas. Cada vejiga crece al
// llenarse y se arruga al vaciarse, y entre todas se empujan y se recolocan dentro
// (empaquetado de círculos con relajación), así que el espacio que ocupa cada
// parámetro cambia en directo. La corrupción es un bulto necrosado que roba sitio.
export class Placenta {
  constructor(cx, cy, a, b) {
    this.cx = cx;
    this.cy = cy;
    this.a = a;
    this.b = b;
    this.sacs = new Map();
  }

  // items: [{ id, level 0..1, rMin, rMax, color, low, glow, dead, boil }]
  update(items, dt, t) {
    // Si entre todas no caben, se aprietan a la vez: cada una cede en proporción.
    // Radio proporcional al contenido: media vejiga = medio radio (se lee de un vistazo).
    const want = items.map((it) => it.rMin + (it.rMax - it.rMin) * Math.max(0, Math.min(1, it.level)));
    const room = 0.8 * (this.a - 1.5) * (this.b - 1.5);
    const squeeze = Math.min(1, Math.sqrt(room / Math.max(1, want.reduce((n, r) => n + r * r, 0))));
    for (const [n, it] of items.entries()) {
      let s = this.sacs.get(it.id);
      if (!s) {
        const k = this.sacs.size * 2.4;
        s = { x: this.cx + Math.cos(k) * this.a * 0.4, y: this.cy + Math.sin(k) * this.b * 0.4, r: it.rMin };
        this.sacs.set(it.id, s);
      }
      Object.assign(s, it);
      // El tamaño sigue al contenido (área proporcional), sin saltos bruscos.
      const target = want[n] * squeeze;
      s.r += (target - s.r) * Math.min(1, dt * 4);
    }
    const list = [...this.sacs.values()];
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        // Atracción suave al centro (más en vertical, para que se repartan a lo
        // ancho del óvalo) y una deriva lenta, como si flotaran.
        p.x += (this.cx - p.x) * 0.03 + Math.sin(t * 0.7 + i * 2) * 0.03;
        p.y += (this.cy - p.y) * 0.09 + Math.cos(t * 0.9 + i) * 0.03;
        for (let j = i + 1; j < list.length; j++) {
          const q = list[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.01;
          const over = p.r + q.r - 0.5 - d;
          if (over > 0) {
            const k = over / 2 / d;
            p.x -= dx * k; p.y -= dy * k;
            q.x += dx * k; q.y += dy * k;
          }
        }
        // Dentro del óvalo.
        const ex = (p.x - this.cx) / Math.max(1, this.a - p.r - 1.5), ey = (p.y - this.cy) / Math.max(1, this.b - p.r - 1.5);
        const e = Math.hypot(ex, ey);
        if (e > 1) { p.x = this.cx + (p.x - this.cx) / e; p.y = this.cy + (p.y - this.cy) / e; }
      }
      // El racimo entero se mantiene centrado en la placenta.
      const big = list.filter((p) => p.r > 0.5), w = big.reduce((n, p) => n + p.r * p.r, 0) || 1;
      const mx = big.reduce((n, p) => n + p.x * p.r * p.r, 0) / w - this.cx, my = big.reduce((n, p) => n + p.y * p.r * p.r, 0) / w - this.cy;
      for (const p of list) { p.x -= mx * 0.5; p.y -= my * 0.5; }
    }
  }

  draw(ctx, glCtx, t) {
    const { cx, cy, a, b } = this;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (this.B?.w !== W || this.B?.h !== H) { this.B = new PixBuf(W, H); this.GL = new PixBuf(W, H); }
    const B = this.B;
    B.clear(); this.GL.clear();
    const px = (_, x, y, c, w, h) => B.px(x, y, c, w, h);
    const g = null;
    // Cordón umbilical que entra por la izquierda, desde el borde de la pantalla.
    for (let x = cx - a + 2; x >= 0; x--) { const y = cy + 4 + (cx - a - x) * 0.6 + Math.sin(x * 0.9 + t * 3) * 0.6; px(g, x, y - 1, K, 1, 4); px(g, x, y, x % 3 ? '#7a2a3a' : '#a03a4a', 1, 2); }
    // Membrana: borde oscuro, carne y venas que laten.
    for (let y = -b - 1; y <= b + 1; y++) for (let x = -a - 1; x <= a + 1; x++) {
      const d = (x * x) / (a * a) + (y * y) / (b * b);
      if (d > 1.12) continue;
      px(g, cx + x, cy + y, d > 0.92 ? K : d > 0.8 ? '#4a1424' : (x * 3 + y * 5) % 11 ? '#2a0c14' : '#34101a');
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2 + 0.3;
      let x = cx + Math.cos(ang) * a * 0.92, y = cy + Math.sin(ang) * b * 0.92;
      for (let i = 0; i < 5; i++) {
        x += (cx - x) * 0.18 + Math.sin(i + k) * 0.6;
        y += (cy - y) * 0.18;
        px(g, x, y, pulse > 0.6 && i === Math.floor(t * 6) % 5 ? '#a03048' : '#5a1828');
      }
    }
    // Vejigas, de la más grande a la más pequeña.
    for (const s of [...this.sacs.values()].sort((p, q) => q.r - p.r)) this.#sac(B, s, t);
    B.flush(ctx);
    if (glCtx) this.GL.flush(glCtx);
  }

  #sac(B, s, t) {
    const px = (_, x, y, c, w, h) => B.px(x, y, c, w, h);
    const g = null;
    const base = parseColor(s.color), glowC = s.glow ? shadeN(base, 0.55) : 0;
    const r = s.r, full = (r - s.rMin) / Math.max(0.01, s.rMax - s.rMin);
    const beat = s.low ? Math.max(0, Math.sin(t * 9)) * 0.6 : 0;
    const R = r + beat;
    for (let y = -Math.ceil(R) - 1; y <= Math.ceil(R) + 1; y++) for (let x = -Math.ceil(R) - 1; x <= Math.ceil(R) + 1; x++) {
      const ang = Math.atan2(y, x);
      // Silueta irregular; arrugada cuando está casi vacía.
      const wob = Math.sin(ang * 3 + t * 1.5 + s.x) * 0.5 + (full < 0.3 ? Math.sin(ang * 7) * 0.6 : 0);
      const d = Math.hypot(x, y);
      if (d > R + wob + 0.6) continue;
      let c;
      if (d > R + wob - 0.6) c = s.low ? (Math.floor(t * 6) % 2 ? '#c02040' : K) : K;
      else if (s.dead) c = (x + y) % 2 ? '#3a2a30' : '#2a1c22';
      else {
        const shadeK = 1.15 - ((y + R) / (2 * R)) * 0.5;
        c = shadeN(base, shadeK);
        if (glowC) this.GL.px(s.x + x, s.y + y, glowC);
      }
      px(g, s.x + x, s.y + y, c);
    }
    if (s.dead) return;
    // Brillo húmedo, una vena y burbujas que suben.
    px(g, s.x - R * 0.45, s.y - R * 0.5, 'rgba(255,240,240,0.7)');
    if (R > 4) px(g, s.x + R * 0.2, s.y - R * 0.1, 'rgba(90,20,40,0.6)', 1, Math.round(R * 0.6));
    const nB = 1 + Math.round((s.boil ?? 0.2) * 3);
    for (let i = 0; i < nB; i++) {
      const by = s.y + R - 1 - ((t * (5 + (s.boil ?? 0.2) * 12) + i * 4) % Math.max(1, R * 2 - 2));
      px(g, s.x + Math.sin(i * 2.1 + t) * R * 0.4, by, shadeN(base, 1.6));
    }
  }
}
