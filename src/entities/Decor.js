import { TILE } from '../core/Physics.js';
import { px, seg, blob, part, mix } from './Rig.js';
import { canvasSprite } from './Puzzles.js';

// Decoración del Sistema Nervioso: estructuras que se colocan en la sala (editor:
// "Decoración (sistema nervioso)") para dar variedad al fondo. Animadas, sin colisión.
// De fondo por defecto (las paredes de la sala las tapan); con front: true, por delante.
//
// En la sala: decor: [{ x, y, type, flip?, front?, invert? }]. (x, y) es la casilla del
// centro de su base; con invert: true la estructura va boca abajo, colgada del techo de
// esa casilla.
//
// Muro eléctrico: un ganglio en el suelo y otro colgado del techo, en la misma columna
// (o una al lado), se tienden un haz de rayos de techo a suelo que se enciende cada poco
// (wall: { on, off, delay } en el del suelo, en segundos). Avisa cargando antes de
// encenderse; encendido, hiere y empuja. Las neuronas son solo decoración.

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
    name: 'Neurona', w: 72, h: 80, sway: true, soma: [36, 30],
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
      // Soma: se ilumina al disparar (y mientras su muro eléctrico carga o arde).
      const flash = (fire > 0.5 && fire < 0.62) || (s.charge ?? 0) > 0.05 ? 1 : 0;
      if ((s.charge ?? 0) > 0.05) for (let k = 0; k < 3; k++) { const a = Math.random() * Math.PI * 2, d = 9 + Math.random() * 6; seg(g, s.cx + Math.cos(a) * 7, s.cy + Math.sin(a) * 6, s.cx + Math.cos(a) * d, s.cy + Math.sin(a) * d, C.impL); seg(gl, s.cx, s.cy, s.cx + Math.cos(a) * d, s.cy + Math.sin(a) * d, C.imp); }
      part(g, s.cx, s.cy, 9 + flash * 0.6, 8 + flash * 0.6, flash ? C.hi : C.tissueL, C.tissue);
      blob(g, s.cx + 1, s.cy, 3.4, 3.2, flash ? C.impL : '#2a1a40');
      px(g, s.cx, s.cy - 1, flash ? '#ffffff' : C.hi, 2, 2);
      if (flash) blob(gl, s.cx, s.cy, 8, 7, '#2a5a8a');
      else glowAt(gl, s.cx + 1, s.cy, '#1a3050', 4);
    },
  },
  // Ganglio: racimo de bulbos nerviosos que laten a destiempo y chispean entre ellos.
  ganglio: {
    name: 'Ganglio', w: 48, h: 44, soma: [24, 20],
    setup(r) {
      const b = [{ x: 24, y: 20, r: 7, ph: 0 }];             // el bulbo central (de él salta el muro)
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + r() * 0.6, d = 9 + r() * 6; b.push({ x: 24 + Math.cos(a) * d * 1.2, y: 20 + Math.sin(a) * d * 0.8, r: 3.5 + r() * 3, ph: r() * 6 }); }
      b.sort((p, q) => q.r - p.r);
      const fib = [];
      for (let i = 1; i < b.length; i++) { const j = Math.floor(r() * i); fib.push([b[i], b[j]]); }
      const roots = [];
      for (let i = 0; i < 4; i++) { const o = b[Math.floor(r() * b.length)]; roots.push(branch(r, o.x, o.y, Math.PI / 2 + (r() - 0.5) * 1.4, 10 + r() * 8)); }
      return { b, fib, roots };
    },
    draw(g, gl, t, s) {
      for (const p of s.roots) { drawPath(g, p, C.tissueD, 2); drawPath(g, p, C.tissue, 1); }
      for (const [a, c] of s.fib) { seg(g, a.x, a.y, c.x, c.y, C.tissueD, 3); seg(g, a.x, a.y, c.x, c.y, C.tissueL, 1); }
      const ch = s.charge ?? 0;
      for (const o of s.b) {
        const k = Math.max(ch, Math.max(0, Math.sin(t * 2.2 + o.ph)));
        part(g, o.x, o.y, o.r + k * 0.6, o.r * 0.9 + k * 0.5, mix(C.tissueL, C.hi, k), C.tissue, C.myelin);
        if (k > 0.6) blob(gl, o.x, o.y, o.r * 0.7, o.r * 0.6, mix('#000000', '#3a6aa0', (k - 0.6) / 0.4));
      }
      if (ch > 0.05) for (let k = 0; k < 2 + ch * 3; k++) { const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 8; seg(g, 24, 20, 24 + Math.cos(a) * d, 20 + Math.sin(a) * d, C.impL); seg(gl, 24, 20, 24 + Math.cos(a) * d, 20 + Math.sin(a) * d, C.imp, 2); }
      // Chispa entre dos bulbos, de vez en cuando (o sin parar si su muro carga).
      const i = Math.floor(t * 1.7) % s.fib.length, live = (t * 1.7) % 1 < 0.18 || ch > 0.05;
      if (live) {
        const [a, c] = s.fib[i];
        let x = a.x, y = a.y;
        for (let k = 1; k <= 5; k++) { const nx = a.x + (c.x - a.x) * (k / 5) + (Math.random() - 0.5) * 4, ny = a.y + (c.y - a.y) * (k / 5) + (Math.random() - 0.5) * 4; seg(g, x, y, nx, ny, C.impL); seg(gl, x, y, nx, ny, C.imp, 2); x = nx; y = ny; }
      }
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
    // Base centrada en (x, y); invertida, colgada del techo de esa casilla.
    this.x0 = (def.x + 0.5) * TILE - T.w / 2;
    this.y0 = def.invert ? def.y * TILE : (def.y + 1) * TILE - T.h;
    this.spr.place(this.x0, this.y0);
    this.spr.mesh.scale.x = this.spr.glow.scale.x = def.flip ? -1 : 1;
    this.spr.mesh.scale.y = this.spr.glow.scale.y = def.invert ? -1 : 1;
    this.jolt = 0;
    this.t = Math.random() * 10;
    this.drawnAt = -1;
  }

  update(dt) {
    this.t += dt;
    if (this.t - this.drawnAt < 1 / 20) return;
    this.drawnAt = this.t;
    const { g, gl } = this.spr, T = this.type;
    g.clearRect(0, 0, T.w, T.h);
    gl.clearRect(0, 0, T.w, T.h);
    if (T.sway) {
      // Se mece desde su base y de vez en cuando da una sacudida (más si su muro arde).
      if (Math.random() < 0.012 + (this.state.charge ?? 0) * 0.15) this.jolt = 1;
      this.jolt = Math.max(0, this.jolt - 0.12);
      const a = Math.sin(this.t * 0.9) * 0.05 + Math.sin(this.t * 2.3) * 0.015 + (this.jolt > 0 ? (Math.random() - 0.5) * 0.14 * this.jolt : 0);
      for (const c of [g, gl]) { c.save(); c.translate(T.w / 2, T.h); c.rotate(a); c.translate(-T.w / 2, -T.h); }
      T.draw(g, gl, this.t, this.state);
      g.restore(); gl.restore();
    } else T.draw(g, gl, this.t, this.state);
    this.spr.commit();
  }

  // Dónde está el soma en el mundo (para los muros eléctricos).
  get soma() {
    const T = this.type, [sx, sy] = T.soma ?? [T.w / 2, T.h / 2];
    return { x: this.x0 + (this.def.flip ? T.w - sx : sx), y: this.def.invert ? this.y0 + T.h - sy : this.y0 + sy };
  }

  dispose() { this.spr.dispose(); }
}

// Parejas de ganglios que forman un muro: uno en el suelo y otro colgado del techo
// por encima, a una casilla como mucho de su columna. Devuelve [{ floor, ceil }] (los
// índices en la lista de decoración).
export function neuronPairs(list) {
  const out = [], used = new Set();
  list.forEach((d, i) => {
    if (d.type !== WALL_TYPE || d.invert) return;
    let best = -1, bd = Infinity;
    list.forEach((c, j) => {
      if (c.type !== WALL_TYPE || !c.invert || used.has(j) || c.y >= d.y || Math.abs(c.x - d.x) > 1) return;
      const dd = d.y - c.y + Math.abs(c.x - d.x) * 4;
      if (dd < bd) { bd = dd; best = j; }
    });
    if (best >= 0) { used.add(best); out.push({ floor: i, ceil: best }); }
  });
  return out;
}
export const WALL_DEFAULT = { on: 1.4, off: 2.6, delay: 0 };
export const WALL_TYPE = 'ganglio';
const WARN = 0.8;               // segundos de aviso (carga) antes de encenderse

// Muro eléctrico entre dos ganglios enfrentados.
export class ElectricWall {
  constructor(game, a, b) {
    this.game = game;
    this.a = a; this.b = b;     // Decor del suelo y del techo
    const w = { ...WALL_DEFAULT, ...(a.def.wall ?? {}) };
    this.on = Math.max(0.2, w.on); this.off = Math.max(0.2, w.off);
    this.t = -(w.delay ?? 0);
    // De techo a suelo: la descarga recorre también el cuerpo de los dos ganglios, así
    // que no se puede pasar por debajo ni por encima de los somas.
    const top = b.soma, bot = a.soma;
    this.x = (top.x + bot.x) / 2; this.y0 = b.y0 + 2; this.y1 = a.y0 + a.type.h - 2;
    this.W = 28;
    this.h = Math.max(8, this.y1 - this.y0);
    this.spr = canvasSprite(game, this.W, Math.ceil(this.h), 3);
    this.spr.place(this.x - this.W / 2, this.y0);
    this.phase = 'off';
  }

  get center() { return { x: this.x, y: (this.y0 + this.y1) / 2 }; }

  update(dt) {
    const g = this.game, p = g.player, cyc = this.on + this.off;
    this.t += dt;
    const u = ((this.t % cyc) + cyc) % cyc;           // 0..off: apagado · off..cyc: encendido
    const phase = this.t < 0 ? 'off' : u >= this.off ? 'on' : u >= this.off - WARN ? 'warn' : 'off';
    if (phase !== this.phase) {
      if (phase === 'warn') g.audio.play('gangCharge', this.center);
      if (phase === 'on') { g.audio.play('gangBlink', this.center); g.shake = Math.max(g.shake ?? 0, 1.5); }
      this.phase = phase;
    }
    const k = phase === 'on' ? 1 : phase === 'warn' ? (u - (this.off - WARN)) / WARN : 0;
    this.a.state.charge = this.b.state.charge = k;
    // Encendido: hiere y aparta al que lo toque.
    if (phase === 'on' && p.x + p.w > this.x - 5 && p.x < this.x + 5 && p.y + p.h > this.y0 && p.y < this.y1) {
      g.hurtPlayer(12, this.x, 'muro eléctrico');
      if (Math.random() < 0.5) g.glowParticles.emit(p.cx, p.cy, { vx: (Math.random() - 0.5) * 80, vy: -40, life: 0.3, color: [0.6, 0.9, 1] });
    }
    this.#draw(phase, k);
  }

  #draw(phase, k) {
    const { g, gl } = this.spr, W = this.W, H = Math.ceil(this.h), cx = W / 2;
    g.clearRect(0, 0, W, H); gl.clearRect(0, 0, W, H);
    if (phase === 'off') { this.spr.commit(); return; }
    // Aviso: chispas sueltas que nacen en los extremos. Encendido: varios rayos.
    const bolts = phase === 'on' ? 3 : Math.random() < 0.3 + k * 0.5 ? 1 : 0;
    for (let n = 0; n < bolts; n++) {
      const reach = phase === 'on' ? H : H * (0.15 + k * 0.25), from = n % 2 ? H : 0, dir = from ? -1 : 1;
      let x = cx, y = from;
      const steps = Math.max(3, Math.round(reach / 7));
      for (let i = 1; i <= steps; i++) {
        const nx = cx + (i < steps || phase !== 'on' ? (Math.random() - 0.5) * (phase === 'on' ? 14 : 8) : 0), ny = from + dir * (reach * i) / steps;
        seg(gl, x, y, nx, ny, '#4aa0ff', phase === 'on' ? 3 : 2);
        seg(g, x, y, nx, ny, n === 0 ? '#ffffff' : C.impL, 1);
        x = nx; y = ny;
      }
    }
    if (phase === 'on') { gl.fillStyle = 'rgba(60,140,255,0.18)'; gl.fillRect(cx - 6, 0, 12, H); }
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
