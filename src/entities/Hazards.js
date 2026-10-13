import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { TILE } from '../core/Physics.js';
import { canvasTexture } from '../core/Sprites.js';

// Peligros de fluidos (sobre todo del Sistema Digestivo), definidos por sala en
// data/levels.js:
//   fluids: [{ x: [col0, col1], top, bottom, period, phase }]   cubeta que se llena y vacía
//           (con manual: true la controla otro, p. ej. un jefe, mediante .target 0..1)
//   mouths: [{ x, y, dir, period, duration, phase }]             boca que escupe un chorro
//   drips:  [{ x, y, period, phase }]                            gotera de ácido
// Todos dañan como el ácido (la Quitina I protege).

const ACID_DPS = 16;

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
    this.surface = plane(this.w, 1, '#9be06a', { order: 3 });
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
    if (this.def.manual) this.level += Math.sign(this.target - this.level) * Math.min(Math.abs(this.target - this.level), dt * 0.45);
    else this.level = this.levelAt(t);
    const h = Math.max(0.001, this.level * this.full), sy = this.surfaceY;
    this.body.scale.y = h;
    this.body.position.set(this.x0 + this.w / 2, -(sy + h / 2), 0);
    this.haze.scale.y = h;
    this.haze.position.copy(this.body.position);
    const wave = Math.round(Math.sin(t * 4) * 0.6);
    this.surface.position.set(this.x0 + this.w / 2, -(sy + 0.5 + wave), 0);
    this.glow.position.copy(this.surface.position);
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

  dispose() { for (const m of [this.body, this.surface, this.glow, this.haze]) m.removeFromParent(); }
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
    const horiz = dx !== 0;
    this.stream = plane(horiz ? this.len : 6, horiz ? 6 : this.len, '#5aff4a', { additive: true, opacity: 0.85, order: 3 });
    this.core = plane(horiz ? this.len : 3, horiz ? 3 : this.len, '#d8ffb0', { additive: true, order: 3 });
    const sx = this.cx + dx * (this.len / 2 + 4), sy = this.cy + dy * (this.len / 2 + 4);
    this.stream.position.set(sx, -sy, 0);
    this.core.position.set(sx, -sy, 0);
    game.visual.world.add(this.mesh);
    game.visual.glow.add(this.stream, this.core);
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
    if (spitting) {
      this.stream.material.opacity = 0.6 + Math.random() * 0.3;
      if (Math.random() < 0.8) {
        const k = Math.random() * this.len;
        g.glowParticles.emit(this.cx + this.dx * (k + 4) + (Math.random() - 0.5) * 5, this.cy + this.dy * (k + 4) + (Math.random() - 0.5) * 5, { vx: this.dx * 60, vy: this.dy * 60, life: 0.3, color: [0.4, 1, 0.3] });
      }
      const w = this.dx ? this.len : 8, h = this.dx ? 8 : this.len;
      const x = this.dx >= 0 ? (this.dx ? this.cx + 4 : this.cx - 4) : this.cx - 4 - this.len;
      const y = this.dy >= 0 ? (this.dy ? this.cy + 4 : this.cy - 4) : this.cy - 4 - this.len;
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
