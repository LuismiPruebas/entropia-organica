import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { TILE } from '../core/Physics.js';
import { canvasTexture } from '../core/Sprites.js';

// Peligros de fluidos (sobre todo del Sistema Digestivo), definidos por sala en
// data/levels.js:
//   fluids: [{ x: [col0, col1], top, bottom, period, phase }]   cubeta que se llena y vacía
//           (con manual: true la controla otro, p. ej. un jefe o una válvula, mediante
//           .target 0..1; `rate` = casillas por segundo a las que sube o baja)
//   mouths: [{ x, y, dir, period, duration, phase }]             boca que escupe un chorro
//   drips:  [{ x, y, period, phase }]                            gotera de ácido
// Todos dañan como el ácido (la Quitina I protege).

const ACID_DPS = 16;
// Franja de superficie de las cubetas y su paleta (de lo hondo al brillo; grumos al final).
const SURF_H = 9;
const SC = ['#1e4a10', '#2e6a14', '#3f8f2a', '#4aa822', '#7ad83a', '#c8f080', '#8a9a2a', '#d0c868'].map((h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; });

function plane(w, h, color, { additive = false, opacity = 1, order = 2 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  m.renderOrder = order;
  return m;
}

function overlapsRect(p, x, y, w, h) {
  return p.x < x + w && p.x + p.w > x && p.y < y + h && p.y + p.h > y;
}

function acidHurt(game, dt) {
  const st = game.state;
  // Con Quitina, el daño reducido lo aplica Game (una vez por paso, crece con el tiempo).
  if (st.immune('acid')) { game.inAcid = true; return; }
  st.damage(ACID_DPS * dt, 'ácido');
  game.audio.play('sizzle', game.player);
}

// ---------------------------------------------------------------------------
// Cubeta que se llena y se vacía: sube, aguanta llena, drena y queda seca.
export class FluidPool {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.x0 = def.x[0] * TILE;
    this.w = (def.x[1] - def.x[0] + 1) * TILE;
    this.yTop = def.top * TILE;
    this.yBottom = (def.bottom + 1) * TILE;
    this.full = this.yBottom - this.yTop;
    // Las cubetas manuales (las mueve una válvula o un jefe) pueden empezar llenas.
    this.level = def.start ?? 0;
    this.target = def.start ?? 0;
    this.body = plane(this.w, 1, '#3f8f2a', { opacity: 0.78 });
    // Superficie: una franja pintada a mano (ácido espeso, con grumos que flotan y
    // burbujas que revientan), no una línea.
    this.sfCv = document.createElement('canvas');
    this.sfCv.width = this.w; this.sfCv.height = SURF_H;
    this.sfG = this.sfCv.getContext('2d');
    this.sfTex = canvasTexture(this.sfCv);
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(this.w, SURF_H), new THREE.MeshBasicMaterial({ map: this.sfTex, transparent: true, depthTest: false, depthWrite: false }));
    this.surface.renderOrder = 3;
    this.frame = 0;
    this.trend = 0; // +1 subiendo, -1 bajando, 0 quieta
    this.glow = plane(this.w, 1, '#5aff4a', { additive: true, opacity: 0.6, order: 3 });
    this.haze = plane(this.w, 1, '#2a8a20', { additive: true, opacity: 0.12 });
    game.visual.world.add(this.body, this.surface);
    game.visual.glow.add(this.glow, this.haze);
    this.wasRising = false;
  }

  // 0 = vacía, 1 = llena. Ciclo: sube 25%, llena 25%, baja 25%, seca 25%.
  levelAt(t) {
    const d = this.def, p = (((t + (d.phase ?? 0)) % d.period) + d.period) % d.period / d.period;
    if (p < 0.25) return p / 0.25;
    if (p < 0.5) return 1;
    if (p < 0.75) return 1 - (p - 0.5) / 0.25;
    return 0;
  }

  get surfaceY() { return this.yBottom - this.level * this.full; }

  update(dt) {
    const g = this.game, t = g.time;
    const prev = this.level;
    const speed = this.def.rate ? (this.def.rate * TILE) / this.full : 0.45;
    if (this.def.manual) this.level += Math.sign(this.target - this.level) * Math.min(Math.abs(this.target - this.level), dt * speed);
    else this.level = this.levelAt(t);
    this.trend = this.level > prev + 1e-5 ? 1 : this.level < prev - 1e-5 ? -1 : 0;
    const h = Math.max(0.001, this.level * this.full), sy = this.surfaceY;
    this.body.scale.y = h;
    this.body.position.set(this.x0 + this.w / 2, -(sy + h / 2), 0);
    this.haze.scale.y = h;
    this.haze.position.copy(this.body.position);
    this.surface.position.set(this.x0 + this.w / 2, -(sy + SURF_H / 2 - 3), 0);
    this.glow.position.set(this.x0 + this.w / 2, -(sy + 0.5), 0);
    if (this.level > 0.01 && (this.frame++ & 1) === 0) this.#paintSurface(t);
    const visible = this.level > 0.01;
    this.body.visible = this.surface.visible = this.glow.visible = this.haze.visible = visible;

    // Aviso al empezar a subir: gorgoteo.
    const rising = this.level > prev;
    if (rising && !this.wasRising) g.audio.play('acid', { x: this.x0 + this.w / 2, y: this.yBottom });
    this.wasRising = rising;
    if (visible && Math.random() < 0.3) {
      g.glowParticles.emit(this.x0 + Math.random() * this.w, sy, { vy: -15, life: 0.5, color: [0.4, 1, 0.3] });
    }
    const p = g.player;
    if (visible && overlapsRect(p, this.x0, sy + 2, this.w, this.yBottom - sy)) acidHurt(g, dt);
  }

  // ¿El fluido (lo que hay ahora en la cubeta) toca este rectángulo?
  hits(r) { return this.level > 0.05 && overlapsRect(r, this.x0, this.surfaceY + 2, this.w, this.yBottom - this.surfaceY); }

  // Franja de la superficie: ondas lentas, grumos que flotan a la deriva (más deprisa si
  // sube o baja), burbujas que se hinchan y revientan y un borde húmedo que brilla.
  #paintSurface(t) {
    const w = this.w, g = this.sfG, im = g.createImageData(w, SURF_H), d = im.data;
    const set = (x, y, c) => { if (y < 0 || y >= SURF_H) return; const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
    const drift = t * (this.trend ? 14 : 4);
    for (let x = 0; x < w; x++) {
      const crest = 3 + Math.sin(x * 0.11 + t * 1.6) * 1.1 + Math.sin(x * 0.37 - t * 2.3) * 0.5;
      // Grumo flotante: un bulto que asoma por encima de la superficie.
      const lx = x + drift, P = 23, ph = ((lx % P) + P) % P, sz = 5 + Math.floor(Math.abs(Math.sin(Math.floor(lx / P) * 12.9)) * 5);
      const lump = ph < sz ? Math.sin((ph / sz) * Math.PI) * 2.4 : 0;
      const top = Math.round(crest - lump);
      for (let y = top; y < SURF_H; y++) {
        const k = y - top;
        let c = k === 0 ? SC[5] : k === 1 ? SC[4] : k < 4 ? SC[3] : SC[2];
        if (lump > 0.5 && k < 4) c = k === 0 ? SC[7] : SC[6];          // grumo amarillento
        set(x, y, c);
      }
    }
    // Burbujas que se hinchan y revientan.
    for (let i = 0; i < Math.ceil(w / 40); i++) {
      const life = ((t * 0.7 + i * 0.37) % 1), bx = Math.floor((Math.sin(i * 91.7 + Math.floor(t * 0.7 + i * 0.37) * 7.3) * 0.5 + 0.5) * (w - 6)) + 3;
      const r = life < 0.85 ? Math.round(life * 2.5) : 0;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) set(bx + x, 2 + y, x * x + y * y >= (r - 1) * (r - 1) ? SC[5] : SC[1]);
    }
    g.putImageData(im, 0, 0);
    this.sfTex.needsUpdate = true;
  }

  dispose() { for (const m of [this.body, this.surface, this.glow, this.haze]) m.removeFromParent(); this.sfTex.dispose(); }
}

// ---------------------------------------------------------------------------
// Boca orgánica que evacúa un chorro de ácido: avisa (se abre y gotea), escupe y se cierra.
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
let MOUTH_TEX = null;

function paintMouth(open) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, (y - 7.5) * 1.4);
    if (d < 7.5) dot(x, y, d > 6 ? '#5a1a2a' : d > 4.5 ? '#a83a52' : '#c86070');
  }
  // Labios: cerrados es un pliegue; abiertos, un agujero con dientes.
  if (open) {
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) if (Math.hypot(x - 7.5, (y - 7.5) * 1.3) < 4) dot(x, y, '#140408');
    for (const x of [5, 7, 9]) { dot(x, 4, '#e8dcc8'); dot(x + 1, 11, '#e8dcc8'); }
  } else {
    for (let x = 4; x < 12; x++) dot(x, 7 + (x % 2), '#3a0a14');
  }
  return canvasTexture(c);
}

// Chorro de ácido espeso: una columna de líquido grumoso pintada a mano en cada
// fotograma (a lo largo de u, de la boca hacia fuera). El grosor ondula, los grumos
// avanzan con el flujo e hinchan la columna, el borde es oscuro y la cresta brilla
// húmeda; burbujas que viajan dentro. `reach` es lo que ha salido ya de la boca.
const JET_H = 16;
function paintJet(g, len, s, reach, t) {
  g.clearRect(0, 0, len, JET_H);
  const mid = JET_H / 2;
  for (let u = 0; u < Math.min(len, reach); u++) {
    // Grosor: ondas que viajan con el flujo + grumos gordos (y la punta, que se adelgaza).
    let w = 3.4 + Math.sin((u - s) * 0.19) * 0.8 + Math.sin((u - s * 1.25) * 0.47) * 0.4;
    // Grumos redondos de tamaños distintos; cuelgan más por abajo (pesan).
    const P = 30, lump = ((u - s * 0.9) % P + P) % P, size = 8 + (Math.floor((u - s * 0.9) / P) % 3 + 3) % 3 * 2;
    const b = lump < size ? Math.sqrt(Math.sin((lump / size) * Math.PI)) * (1.8 + size * 0.12) : 0;
    const taper = Math.min(1, 0.55 + u / 10) * Math.min(1, (reach - u) / 6 + 0.35);
    const sag = Math.sin((u - s * 0.6) * 0.08) * 0.8;                    // la columna culebrea
    const top = Math.round(mid - (w + b * 0.7) * taper + sag), bot = Math.round(mid + (w + b * 1.25) * taper + sag);
    for (let v = top; v <= bot; v++) {
      const k = (v - top) / Math.max(1, bot - top);
      let c = v === top || v === bot ? '#1a3a0a' : k < 0.22 ? '#c8f080' : k < 0.45 ? '#7ad83a' : k < 0.8 ? '#4aa822' : '#2e7414';
      if (k > 0.12 && k < 0.22 && (u + Math.floor(s)) % 7 < 3) c = '#f0ffc0';  // brillo húmedo en la cresta
      g.fillStyle = c;
      g.fillRect(u, v, 1, 1);
    }
  }
  // Burbujas que viajan dentro del chorro.
  for (let i = 0; i < Math.floor(len / 18); i++) {
    const u = ((i * 18 + s * 1.1 + i * 7) % len), v = mid + Math.sin(i * 2.3 + t * 3) * 1.5;
    if (u > reach - 3) continue;
    g.fillStyle = '#e0ffa8'; g.fillRect(u, v - 1, 1, 1);
    g.fillStyle = '#2e7414'; g.fillRect(u, v, 1, 1);
  }
}

export class Mouth {
  constructor(game, def, world) {
    this.game = game;
    this.def = def;
    MOUTH_TEX ??= [paintMouth(false), paintMouth(true)];
    this.cx = def.x * TILE + 8;
    this.cy = def.y * TILE + 8;
    const [dx, dy] = DIRS[def.dir];
    this.dx = dx;
    this.dy = dy;
    // Alcance del chorro: hasta la primera pared.
    let len = 0;
    while (len < 14 && !world.solid(def.x + dx * (len + 1), def.y + dy * (len + 1))) len++;
    this.len = len * TILE + 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: MOUTH_TEX[0], transparent: true, alphaTest: 0.5, depthTest: false }));
    this.mesh.renderOrder = 2;
    this.mesh.position.set(this.cx, -this.cy, 0);
    this.mesh.rotation.z = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[def.dir];
    // El chorro: lienzo propio (largo × JET_H) girado según la dirección de la boca.
    this.jetCv = document.createElement('canvas');
    this.jetCv.width = this.len;
    this.jetCv.height = JET_H;
    this.jetG = this.jetCv.getContext('2d');
    this.jetTex = canvasTexture(this.jetCv);
    this.stream = new THREE.Mesh(new THREE.PlaneGeometry(this.len, JET_H), new THREE.MeshBasicMaterial({ map: this.jetTex, transparent: true, depthTest: false, depthWrite: false }));
    this.stream.renderOrder = 3;
    this.stream.rotation.z = { right: 0, left: Math.PI, down: -Math.PI / 2, up: Math.PI / 2 }[def.dir];
    // Un halo tenue (no un láser): el ácido brilla poco.
    const horiz = dx !== 0;
    this.core = plane(horiz ? this.len : 10, horiz ? 10 : this.len, '#3a8a1a', { additive: true, opacity: 0.22, order: 3 });
    const sx = this.cx + dx * (this.len / 2 + 4), sy = this.cy + dy * (this.len / 2 + 4);
    this.stream.position.set(sx, -sy, 0);
    this.core.position.set(sx, -sy, 0);
    this.spitT = 0;
    game.visual.world.add(this.mesh, this.stream);
    game.visual.glow.add(this.core);
    this.state = 'closed';
  }

  update(dt) {
    const g = this.game, d = this.def;
    // Al caer la Glándula Gástrica, todas las bocas del Digestivo se sellan.
    const sealed = g.state.flags.has('mouthsSealed');
    const p = sealed ? 0 : (((g.time + (d.phase ?? 0)) % d.period) + d.period) % d.period;
    const warn = d.period - d.duration - 0.7;
    const state = p >= d.period - d.duration ? 'spit' : p >= warn ? 'warn' : 'closed';
    if (state !== this.state) {
      if (state === 'warn') g.audio.play('charge', { x: this.cx, y: this.cy });
      if (state === 'spit') g.audio.play('acid', { x: this.cx, y: this.cy });
      this.state = state;
    }
    this.mesh.material.map = MOUTH_TEX[state === 'closed' ? 0 : 1];
    const spitting = state === 'spit';
    this.stream.visible = this.core.visible = spitting;
    this.spitT = spitting ? this.spitT + dt : 0;
    if (spitting) {
      // El líquido sale de la boca y avanza (no aparece de golpe como un rayo).
      const reach = Math.min(this.len, this.spitT * 420);
      paintJet(this.jetG, this.len, g.time * 70, reach, g.time);
      this.jetTex.needsUpdate = true;
      this.core.material.opacity = 0.18 + Math.random() * 0.08;
      // Goterones que se desprenden del chorro y caen; salpicadura donde choca.
      if (Math.random() < 0.35) {
        const k = Math.random() * reach;
        g.particles.emit(this.cx + this.dx * (k + 4), this.cy + this.dy * (k + 4) + (this.dx ? 3 : 0), { vx: this.dx * 40, vy: this.dy * 40 + 20, life: 0.9, gravity: 600, color: [0.35, 0.75, 0.15], stain: '#4a8a1a' });
      }
      if (reach >= this.len && Math.random() < 0.6) {
        const ex = this.cx + this.dx * (this.len + 4), ey = this.cy + this.dy * (this.len + 4);
        g.particles.emit(ex, ey, { vx: -this.dx * 50 + (Math.random() - 0.5) * 120, vy: -this.dy * 50 - 60 - Math.random() * 80, life: 0.7, gravity: 600, color: Math.random() < 0.3 ? [0.75, 1, 0.45] : [0.35, 0.75, 0.15], stain: '#4a8a1a' });
      }
      const w = this.dx ? reach : 8, h = this.dx ? 8 : reach;               // daña lo que ya ha salido
      const x = this.dx >= 0 ? (this.dx ? this.cx + 4 : this.cx - 4) : this.cx - 4 - reach;
      const y = this.dy >= 0 ? (this.dy ? this.cy + 4 : this.cy - 4) : this.cy - 4 - reach;
      if (overlapsRect(g.player, x, y, w, h)) acidHurt(g, dt * 1.5);
    } else if (state === 'warn' && Math.random() < 0.15) {
      g.glowParticles.emit(this.cx + this.dx * 6, this.cy + this.dy * 6, { vx: this.dx * 15, vy: this.dy * 15 + 20, life: 0.4, color: [0.4, 1, 0.3] });
    }
  }

  dispose() { for (const m of [this.mesh, this.stream, this.core]) m.removeFromParent(); }
}

// ---------------------------------------------------------------------------
// Gotera: deja caer una gota de ácido a intervalos (se ve formarse antes de caer).
export class Drip {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.x = def.x * TILE + 8;
    this.y = (def.y + 1) * TILE;
    this.bead = plane(2, 3, '#9be06a', { additive: true, order: 3 });
    this.bead.position.set(this.x, -(this.y + 1), 0);
    game.visual.glow.add(this.bead);
    this.cool = (def.phase ?? 0) % def.period;
  }

  update(dt) {
    const g = this.game;
    this.cool -= dt;
    const grow = 1 - Math.max(0, this.cool) / this.def.period;
    this.bead.scale.set(1, 0.5 + grow, 1);
    if (this.cool <= 0) {
      this.cool = this.def.period;
      g.spawnProjectile({
        x: this.x - 1, y: this.y, w: 3, h: 4, vx: 0, vy: 20, gravity: 520, life: 3,
        damage: 5, kind: 'drip', owner: 'enemy', color: '#9be06a', glow: [0.4, 1, 0.3],
      });
    }
  }

  dispose() { this.bead.removeFromParent(); }
}
