import { TILE } from '../core/Physics.js';
import { canvasSprite } from './Puzzles.js';
import { Wind } from './Traps.js';

// Bufador: una estructura de carne enorme (4x4 casillas) anclada a la pared, con un saco
// anillado y un cuello que acaba en un esfínter. Inspira despacio (el saco se hincha y la
// boca se cierra) y sopla de golpe: la boca se abre y suelta una corriente de aire que
// empuja (hacia un lado) o eleva (hacia arriba) durante el soplido; luego, calma.
//   def: { x, y, dir: 'right' | 'left' | 'up', reach: casillas de alcance, period: s, phase }
// (x, y) es la casilla de arriba a la izquierda de la estructura.

const SIZE = 4 * TILE;          // 64 px
const FRAMES = 6;               // grados de hinchazón
const INHALE = 0.55, HOLD = 0.08; // fracciones del ciclo (el resto es el soplido)

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = {
  body: hex('#b06474'), light: hex('#eeaab6'), dark: hex('#5a2234'), deep: hex('#2a0c18'),
  rib: hex('#7a2c44'), mouth: hex('#3a0c1c'), lip: hex('#e07a8c'), outline: hex('#14040a'),
};
const VEINS = [hex('#a02436'), hex('#6a2a8a'), hex('#2e4690'), hex('#c04a5e')];

// Pinta un fotograma mirando a la derecha (u: a lo largo del soplido; v: de lado) y lo
// gira al dibujarlo. inf: 0..1 hinchazón · open: 0..1 apertura de la boca.
function paintFrame(dir, inf, open) {
  const c = document.createElement('canvas'), gc = document.createElement('canvas');
  c.width = c.height = gc.width = gc.height = SIZE;
  const g = c.getContext('2d'), gl = gc.getContext('2d');
  const img = g.createImageData(SIZE, SIZE), gimg = gl.createImageData(SIZE, SIZE);
  // De coordenadas locales (u, v) a la casilla del lienzo según hacia dónde sopla.
  const toXY = (u, v) => (dir === 'right' ? [u, v + 32] : dir === 'left' ? [63 - u, v + 32] : [v + 32, 63 - u]);
  const put = (u, v, col, a = 255, glow = null) => {
    const [x, y] = toXY(Math.round(u), Math.round(v));
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = a;
    if (glow) { gimg.data[i] = glow[0]; gimg.data[i + 1] = glow[1]; gimg.data[i + 2] = glow[2]; gimg.data[i + 3] = glow[3]; }
  };
  // Luz de arriba a la izquierda en pantalla: se convierte a (u, v) según la orientación.
  const lightUV = dir === 'right' ? [-0.7, -0.7] : dir === 'left' ? [0.7, -0.7] : [0.7, -0.7];
  const shade = (nu, nv) => nu * lightUV[0] + nv * lightUV[1]; // >0 iluminado

  // Saco: elipse anillada que se hincha (centro en u=22).
  const cu = 22, ru = 15 + 4 * inf, rv = 15 + 9 * inf;
  // Cuello: de la parte delantera del saco al esfínter (u 36..58), estrecho y abocinado.
  const neck = (u) => (u < 50 ? 6 - (u - 36) * 0.15 : 4 + (u - 50) * 0.9) * (1 + 0.15 * open);
  const mouthU = 58 + 2 * open;
  for (let u = 0; u < SIZE; u++) for (let v = -32; v < 32; v++) {
    const du = (u - cu) / ru, dv = v / rv, d = Math.hypot(du, dv);
    const inSac = d <= 1;
    const inNeck = u >= 34 && u <= mouthU && Math.abs(v) <= neck(u);
    const inRoot = u < 8 && Math.abs(v) < 12 - u * 0.6; // raíz que se hunde en la pared
    if (!inSac && !inNeck && !inRoot) {
      // Contorno oscuro de 1 px alrededor de todo.
      const near = Math.hypot((u - cu) / (ru + 1.2), v / (rv + 1.2)) <= 1 || (u >= 33 && u <= mouthU + 1 && Math.abs(v) <= neck(Math.min(u, mouthU)) + 1.2);
      if (near) put(u, v, C.outline);
      continue;
    }
    let col;
    if (inSac) {
      const l = shade(du, dv);
      // Anillos (pliegues): bandas oscuras a lo largo de u, más juntas al deshincharse.
      const ring = Math.abs(Math.sin((u - cu) * (0.55 - 0.12 * inf))) < 0.18 && d < 0.95;
      col = d > 0.9 ? (l > 0.1 ? C.light : C.dark) : ring ? C.rib : l > 0.35 ? C.light : l > -0.25 ? C.body : C.dark;
      // Translúcido: se adivina el aire dentro al hincharse.
      // Translúcido: se adivina el aire dentro al hincharse; el borde iluminado brilla un poco.
      const glow = inf > 0.3 && d < 0.75 ? [190, 210, 255, Math.round(70 * inf * (1 - d))] : d > 0.9 && l > 0.1 ? [240, 150, 170, 70] : null;
      put(u, v, col, 255, glow);
    } else if (inNeck) {
      const w = neck(u), nv = v / w, l = -nv * lightUV[1];
      const lipZone = u > mouthU - 3;
      col = lipZone ? (Math.abs(nv) < 0.55 * open ? C.mouth : C.lip) : l > 0.3 ? C.light : l < -0.4 ? C.dark : C.body;
      if (!lipZone && (u % 4 === 0)) col = C.rib; // anillos del cuello
      if (lipZone && Math.abs(nv) >= 0.55 * open) { put(u, v, col, 255, [255, 140, 160, 80]); continue; } // labios húmedos
      put(u, v, col, 255, lipZone && Math.abs(nv) < 0.55 * open ? [180, 240, 255, Math.round(140 * open)] : null);
    } else {
      put(u, v, (u + v) % 3 === 0 ? C.deep : C.dark); // raíz
    }
  }
  // Venas de colores por el saco (fijas: misma semilla en todos los fotogramas).
  let seed = 11;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 5; k++) {
    let a = r() * Math.PI * 2, u = cu + Math.cos(a) * ru * 0.9, v = Math.sin(a) * rv * 0.9;
    const col = VEINS[k % VEINS.length];
    let ang = a + Math.PI + (r() - 0.5);
    for (let i = 0; i < 12; i++) {
      if (Math.hypot((u - cu) / ru, v / rv) < 0.95) put(u, v, col, 255, [...col.map((c) => Math.min(255, c + 60)), 90]);
      u += Math.cos(ang); v += Math.sin(ang); ang += (r() - 0.5) * 0.5;
    }
  }
  g.putImageData(img, 0, 0);
  gl.putImageData(gimg, 0, 0);
  return { c, gc };
}

const CACHE = {};
function frames(dir) {
  return (CACHE[dir] ??= {
    closed: Array.from({ length: FRAMES }, (_, i) => paintFrame(dir, i / (FRAMES - 1), 0)),
    open: Array.from({ length: FRAMES }, (_, i) => paintFrame(dir, i / (FRAMES - 1), 1)),
  });
}

export class Bellows {
  constructor(game, room, def) {
    this.game = game;
    this.def = def;
    this.dir = ['left', 'up'].includes(def.dir) ? def.dir : 'right';
    this.period = def.period ?? 4.5;
    this.t = (def.phase ?? 0) * this.period;
    const reach = def.reach ?? 10, x = def.x, y = def.y;
    // La corriente sale de la boca.
    const zone = this.dir === 'right' ? { x: x + 4, y, w: reach, h: 4 }
      : this.dir === 'left' ? { x: x - reach, y, w: reach, h: 4 }
        : { x, y: y - reach, w: 4, h: reach };
    this.wind = new Wind(game, room, { ...zone, dir: this.dir, force: def.force ?? (this.dir === 'up' ? 1700 : 190) });
    this.wind.power = 0;
    this.spr = canvasSprite(game, SIZE, SIZE, 2);
    this.spr.place(x * TILE, y * TILE);
    this.mouth = this.dir === 'right' ? { x: (x + 4) * TILE, y: (y + 2) * TILE } : this.dir === 'left' ? { x: x * TILE, y: (y + 2) * TILE } : { x: (x + 2) * TILE, y: y * TILE };
    this.frame = null;
    this.phase = 'inhale';
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const p = (this.t % this.period) / this.period;
    let inf, open, power, phase;
    if (p < INHALE) { phase = 'inhale'; const k = p / INHALE; inf = k * k * (3 - 2 * k); open = 0; power = 0; }
    else if (p < INHALE + HOLD) { phase = 'hold'; inf = 1; open = 0; power = 0; }
    else {
      phase = 'blow';
      const k = (p - INHALE - HOLD) / (1 - INHALE - HOLD);
      inf = 1 - Math.min(1, k * 1.6);
      open = k < 0.85 ? 1 : (1 - k) / 0.15;
      power = k < 0.1 ? k / 0.1 : Math.max(0, 1 - (k - 0.1) / 0.9) ** 0.6;
    }
    // Sonidos al cambiar de fase: inspiración ronca y el soplido.
    if (phase !== this.phase) {
      const at = this.mouth;
      if (phase === 'inhale') g.audio.play('sacInhale', at);
      if (phase === 'blow') { g.audio.play('gust', at); g.shake = Math.max(g.shake ?? 0, 1.5); }
      this.phase = phase;
    }
    // Al soplar escupe vaho y motas por la boca.
    if (phase === 'blow' && power > 0.3 && Math.random() < 0.6) {
      const m = this.mouth, s = 120 + Math.random() * 80;
      const [vx, vy] = this.dir === 'right' ? [s, (Math.random() - 0.5) * 30] : this.dir === 'left' ? [-s, (Math.random() - 0.5) * 30] : [(Math.random() - 0.5) * 30, -s];
      g.glowParticles.emit(m.x, m.y + (Math.random() - 0.5) * 10, { vx, vy, life: 0.5, color: [0.7, 0.9, 1] });
    }
    this.wind.power = power;
    this.wind.update(dt);
    // Fotograma.
    const set = frames(this.dir), fi = Math.round(inf * (FRAMES - 1)), f = (open > 0.4 ? set.open : set.closed)[fi];
    if (f !== this.frame) {
      this.frame = f;
      const { g: cg, gl } = this.spr;
      cg.clearRect(0, 0, SIZE, SIZE); cg.drawImage(f.c, 0, 0);
      gl.clearRect(0, 0, SIZE, SIZE); gl.drawImage(f.gc, 0, 0);
      this.spr.commit();
    }
  }

  dispose() {
    this.wind.dispose();
    this.spr.dispose();
  }
}
