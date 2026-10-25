import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { TILE } from '../core/Physics.js';
import { canvasTexture } from '../core/Sprites.js';
import { canvasSprite } from './Puzzles.js';

// Esclusas del Sistema Digestivo: lo que llena y vacía las cubetas (`fluids`) a la vista.
// En data/worlds/*.js, por sala:
//   spouts: [{ x, y, dir, pool, always }]   surtidor: un caño de carne anillada (en el techo,
//           dir 'down'; en una pared, 'left' o 'right' hacia donde vierte) del que cae una
//           catarata de ácido espeso y grumoso. Con `pool` vierte mientras esa cubeta sube;
//           con always: true no para nunca (decoración... que quema); con `valve` (índice
//           en valves), vierte mientras esa válvula está abierta (una vejiga que se suelta).
//   sinks:  [{ x, y, dir, pool }]            sumidero: un esfínter fruncido en el suelo (dir
//           'up'; o en una pared/techo) que se dilata y traga mientras la cubeta baja.
// (x, y) es la casilla de roca donde va incrustado.

const ACID_DPS = 16;
function acidHurt(game, dt) {
  const st = game.state;
  if (st.immune('acid')) { game.inAcid = true; return; }
  st.damage(ACID_DPS * dt, 'ácido');
  game.audio.play('sizzle', game.player);
}

// --- Pintado por píxeles: fn(x, y) devuelve un color [r, g, b] (o null: transparente).
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function paint(ctx, w, h, fn) {
  const im = ctx.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y);
    if (!c) continue;
    const i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Ácido: de la sombra al brillo, y los grumos (amarillentos, oscuros, pálidos).
const AC = ['#12280a', '#1e4a10', '#2e7414', '#4aa822', '#7ad83a', '#b8f070', '#eaffc0'].map(rgb);
const LUMP = ['#6a7414', '#a8a830', '#e0d070', '#34400c'].map(rgb);
// Carne de los caños y esfínteres.
const FL = { out: rgb('#1a0810'), dark: rgb('#3a1220'), mid: rgb('#6a2236'), lit: rgb('#9a3a50'), hi: rgb('#d0707e'), lip: rgb('#e898a0'), ring: rgb('#c8a8a0'), ringD: rgb('#7a5a58'), throat: rgb('#14040a'), vein: rgb('#2a0816') };
const ROT = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };

// Una cubeta sube (llenándose) o baja (vaciándose) ahora mismo.
const rising = (pool) => pool && pool.trend > 0;
const falling = (pool) => pool && pool.trend < 0;

// ---------------------------------------------------------------------------
// Surtidor: caño grueso de carne con anillos de cartílago y labios al final. Al verter,
// los labios se abren y cae una catarata espesa con grumos que bajan con ella; al parar,
// la cola de la catarata se desprende y cae. Donde golpea, espuma y salpicaduras.
const FALL_W = 36;
export class Spout {
  constructor(game, room, def, pool, valve) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.pool = pool;
    this.valve = valve;
    this.dir = def.dir ?? 'down';
    const side = this.dir === 'left' ? -1 : this.dir === 'right' ? 1 : 0;
    this.side = side;
    // El caño, centrado en su casilla de roca y asomando hacia `dir`.
    this.spr = canvasSprite(game, 32, 32, 4);
    const ox = def.x * TILE + 8 + side * 14, oy = def.y * TILE + 8 + (side ? 0 : 14);
    this.spr.place(ox - 16, oy - 16);
    this.spr.mesh.rotation.z = this.spr.glow.rotation.z = ROT[this.dir];
    // Boca: de donde sale el chorro (los de pared lo echan un poco hacia fuera y cae).
    this.mx = def.x * TILE + 8 + side * 28;
    this.my = side ? def.y * TILE + 12 : (def.y + 1) * TILE + 14;
    // Hasta el suelo que tiene debajo.
    const world = room.world;
    let ty = Math.floor(this.my / TILE);
    // (o hasta el ácido fijo '~': la catarata cae en su charca)
    while (ty < world.h && !world.solid(Math.floor(this.mx / TILE), ty) && world.get(Math.floor(this.mx / TILE), ty) !== '~') ty++;
    this.floorY = ty * TILE;
    this.maxLen = Math.max(8, this.floorY - this.my);
    this.cv = document.createElement('canvas');
    this.cv.width = FALL_W; this.cv.height = this.maxLen;
    this.cg = this.cv.getContext('2d');
    this.tex = canvasTexture(this.cv);
    this.fall = new THREE.Mesh(new THREE.PlaneGeometry(FALL_W, this.maxLen), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }));
    this.fall.renderOrder = 3;
    this.fall.position.set(this.mx, -(this.my + this.maxLen / 2), 0);
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(14, this.maxLen), new THREE.MeshBasicMaterial({ color: '#3a8a1a', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    this.halo.renderOrder = 3;
    this.halo.position.copy(this.fall.position);
    game.visual.world.add(this.fall);
    game.visual.glow.add(this.halo);
    this.head = 0; this.tail = 0; // tramo de la catarata que está en el aire (px desde la boca)
    this.open = 0;
    this.t = Math.random() * 10;
    this.frame = 0;
    this.wasOn = false;
  }

  get on() { return !!this.def.always || (this.valve ? this.valve.open : rising(this.pool)); }

  // ¿La catarata (lo que está cayendo ahora) toca este rectángulo?
  hits(r) {
    if (this.head <= this.tail + 1) return false;
    return r.x < this.mx + 7 && r.x + r.w > this.mx - 7 && r.y < this.my + this.head && r.y + r.h > this.my + this.tail;
  }

  // Hasta dónde cae ahora: el suelo o la superficie de la cubeta que tenga debajo.
  #landY() {
    let y = this.floorY;
    for (const h of this.room.hazards) {
      if (h.surfaceY === undefined || h.level <= 0.01) continue;
      if (this.mx >= h.x0 && this.mx <= h.x0 + h.w && h.surfaceY > this.my && h.surfaceY < y) y = h.surfaceY;
    }
    return y;
  }

  update(dt) {
    const g = this.game, on = this.on;
    this.t += dt;
    if (on && !this.wasOn) g.audio.play('acid', { x: this.mx, y: this.my });
    this.wasOn = on;
    this.open += ((on ? 1 : 0) - this.open) * Math.min(1, dt * 6);
    const len = Math.max(4, this.#landY() - this.my);
    const V = 260;
    if (on) {
      this.tail = Math.max(0, this.tail - V * dt * 3);
      if (this.tail <= 0) this.tail = 0;
      this.head = Math.min(len, this.head + V * dt);
    } else {
      this.tail += V * dt;                                   // la cola se desprende y cae
      this.head = Math.min(len, this.head + V * dt);
      if (this.tail >= this.head) { this.tail = 0; this.head = 0; }
    }
    if (this.head > len) this.head = len;
    const live = this.head > this.tail + 1;
    this.fall.visible = this.halo.visible = live;
    if (live) {
      // El halo, solo en el tramo que está cayendo.
      const hl = Math.max(1, this.head - this.tail);
      this.halo.scale.y = hl / this.maxLen;
      this.halo.position.y = -(this.my + this.tail + hl / 2);
      // Salpicadura y espuma donde golpea.
      if (this.head >= len - 1 && Math.random() < 0.7) {
        const ex = this.mx + (Math.random() - 0.5) * 12, ey = this.my + len - 2;
        g.particles.emit(ex, ey, { vx: (Math.random() - 0.5) * 130, vy: -50 - Math.random() * 90, life: 0.6, gravity: 650, color: Math.random() < 0.3 ? [0.85, 1, 0.55] : [0.35, 0.75, 0.15], stain: '#4a8a1a' });
      }
      if (Math.random() < 0.2) g.particles.emit(this.mx + (Math.random() - 0.5) * 10, this.my + this.tail + Math.random() * (this.head - this.tail), { vx: (Math.random() - 0.5) * 30, vy: 40, life: 0.8, gravity: 600, color: [0.5, 0.6, 0.15] });
      const p = g.player;
      if (p.x < this.mx + 6 && p.x + p.w > this.mx - 6 && p.y < this.my + this.head && p.y + p.h > this.my + this.tail) acidHurt(g, dt * 1.5);
    }
    // A 30 fps: el caño y la catarata.
    if ((this.frame++ & 1) === 0) {
      this.#drawNozzle();
      if (live) this.#drawFall(len);
    }
  }

  #drawNozzle() {
    const { g, gl } = this.spr, t = this.t, k = this.open;
    const beat = Math.sin(t * 2.2) * 0.5 + 0.5;
    // Dibujado mirando hacia abajo (pegado a la roca por arriba).
    paint(g, 32, 32, (x, y) => {
      const cx = 15.5;
      // Tubo: ancho 18 arriba, algo más fino, y se ensancha en el labio.
      if (y < 22) {
        const r = 9 - y * 0.08 + Math.sin(y * 0.9 + t * 3) * 0.3 * k;
        const dx = Math.abs(x - cx);
        if (dx > r) return null;
        if (dx > r - 1) return FL.out;
        const ring = (y + Math.floor(t * 6 * k)) % 5 === 0;           // anillos de cartílago (corren al verter)
        const lit = -(x - cx) / r * 0.6 + 0.3;
        if (ring) return lit > 0.2 ? FL.ring : FL.ringD;
        return lit > 0.55 ? FL.hi : lit > 0.15 ? FL.lit : lit > -0.25 ? FL.mid : FL.dark;
      }
      // Labios: un rodete carnoso; abierto, la garganta oscura con el ácido asomando.
      const lx = (x - cx) / (11 + k), ly = (y - 24) / (5 + k * 1.5), d = lx * lx + ly * ly;
      if (d > 1) return null;
      if (d > 0.82) return FL.out;
      const hole = k * 0.75;
      if (d < hole * hole) return d < hole * hole * 0.5 ? AC[3 + ((x + y + Math.floor(t * 8)) % 2)] : FL.throat;
      if (k < 0.2 && Math.abs(y - 24) < 0.6 && Math.abs(x - cx) < 7) return FL.dark;   // boca cerrada: una raja
      return ly < -0.2 ? FL.lip : d < 0.5 ? FL.hi : FL.lit;
    });
    gl.clearRect(0, 0, 32, 32);
    if (k > 0.2) { gl.fillStyle = `rgba(90,255,74,${0.35 * k})`; gl.fillRect(11, 22, 10, 4); }
    else if (beat > 0.8) { gl.fillStyle = 'rgba(90,200,60,0.25)'; gl.fillRect(14, 24, 3, 2); } // una gota a punto de caer
    this.spr.commit();
  }

  #drawFall(len) {
    const g = this.cg, H = this.maxLen, t = this.t, s = t * 90;
    const im = g.createImageData(FALL_W, H), d = im.data, mid = FALL_W / 2;
    const set = (x, y, c) => { if (x < 0 || x >= FALL_W || y < 0 || y >= H) return; const i = (y * FALL_W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
    const top = Math.floor(this.tail), bot = Math.min(H, Math.floor(this.head));
    for (let v = top; v < bot; v++) {
      // Los de pared salen un poco hacia fuera y se doblan hacia abajo.
      const arc = this.side ? -this.side * Math.max(0, 10 - v) * 0.9 : 0;
      // Grosor: más fino al despegarse, grumos que hinchan la columna y bajan con ella.
      const P = 26, ph = ((v - s) % P + P) % P, size = 9 + (Math.floor((v - s) / P) % 3 + 3) % 3 * 3;
      const bulge = ph < size ? Math.sin((ph / size) * Math.PI) * 2.6 : 0;
      const neck = Math.min(1, 0.55 + (v - top) / 14);
      const w = (6 + Math.sin((v - s) * 0.13) * 1.1 + bulge) * neck;
      const c = mid + arc + Math.sin((v - s * 0.5) * 0.06) * 1.2;
      const x0 = Math.round(c - w), x1 = Math.round(c + w);
      for (let x = x0; x <= x1; x++) {
        const q = (x - c) / Math.max(1, w);
        let col;
        if (x === x0 || x === x1) col = AC[0];
        else if (q < -0.55) col = AC[(v + Math.floor(s)) % 9 < 4 ? 5 : 4];               // brillo húmedo a la izquierda
        else if (q < -0.1) col = AC[4];
        else if (q < 0.45) col = AC[3];
        else col = AC[2];
        // Grumos: trozos sueltos (amarillentos u oscuros) que bajan con el flujo.
        const hv = hash(Math.floor((v - s * 0.95) / 3), Math.floor((x - c + 20) / 3));
        if (hv > 0.8 && Math.abs(q) < 0.85) col = LUMP[Math.floor(hv * 40) % 4];
        else if (hv < 0.06) col = AC[1];                                              // vetas oscuras
        set(x, v, col);
      }
    }
    // Espuma donde golpea.
    if (this.head >= len - 1) {
      const fy = Math.floor(len);
      for (let v = fy - 5; v < fy; v++) {
        const w = 6 + (v - (fy - 5)) * 1.6 + Math.sin(t * 20 + v) * 1.5;
        for (let x = Math.round(mid - w); x <= Math.round(mid + w); x++) {
          const h = hash(x + Math.floor(t * 20), v);
          if (h < 0.55) set(x, v, h < 0.15 ? AC[6] : h < 0.35 ? AC[5] : AC[3]);
        }
      }
    }
    g.putImageData(im, 0, 0);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.spr.dispose();
    for (const m of [this.fall, this.halo]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    this.tex.dispose();
  }
}

// ---------------------------------------------------------------------------
// Sumidero: un esfínter fruncido en la carne del suelo, como un ano. Cerrado, los
// pliegues se juntan en una estrella; mientras su cubeta baja se dilata, se ve la
// garganta y el ácido gira hacia dentro en remolino.
export class Sink {
  constructor(game, room, def, pool) {
    this.game = game;
    this.def = def;
    this.pool = pool;
    this.dir = def.dir ?? 'up';
    this.spr = canvasSprite(game, 32, 16, 4);
    // Asoma por la cara de la roca que mira hacia `dir`.
    const cx = def.x * TILE + 8, cy = def.y * TILE + 8;
    const off = { up: [0, -9], down: [0, 9], left: [-9, 0], right: [9, 0] }[this.dir];
    this.cx = cx + off[0]; this.cy = cy + off[1];
    this.spr.place(this.cx - 16, this.cy - 8);
    this.spr.mesh.rotation.z = this.spr.glow.rotation.z = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[this.dir];
    this.open = 0;
    this.t = Math.random() * 10;
    this.frame = 0;
    this.was = false;
  }

  update(dt) {
    const g = this.game, on = falling(this.pool);
    this.t += dt;
    if (on && !this.was) g.audio.play('splat', { x: this.cx, y: this.cy });
    this.was = on;
    this.open += ((on ? 1 : 0) - this.open) * Math.min(1, dt * 4);
    // Remolino: grumos de la superficie que se arrastran hacia el sumidero.
    if (on && this.pool && Math.random() < 0.6) {
      const sy = this.pool.surfaceY, a = Math.random() * Math.PI;
      const sx = this.cx + Math.cos(a) * (20 + Math.random() * 40) * (Math.random() < 0.5 ? -1 : 1);
      g.glowParticles.emit(sx, Math.min(sy, this.cy - 2), { vx: (this.cx - sx) * 1.6, vy: (this.cy - sy) * 1.2, life: 0.6, color: [0.4, 1, 0.3] });
    }
    if ((this.frame++ & 1) === 0) this.#draw();
  }

  #draw() {
    const { g, gl } = this.spr, t = this.t, k = this.open;
    const clench = Math.sin(t * 1.7) * 0.5 + 0.5;                      // se frunce y se relaja
    paint(g, 32, 16, (x, y) => {
      const u = (x - 15.5) / 14, v = (y - 9) / 6.5, d = Math.hypot(u, v);
      if (d > 1 || y < 3) return null;
      if (d > 0.9) return FL.out;
      const a = Math.atan2(v, u);
      const hole = 0.08 + k * 0.55;
      if (d < hole) {
        // Garganta: oscura, con el ácido girando dentro al tragar.
        if (k < 0.15) return FL.throat;
        const sw = Math.sin(a * 3 + d * 14 - t * 9);
        return sw > 0.4 ? AC[4] : sw > -0.2 ? AC[2] : FL.throat;
      }
      if (d < hole + 0.12) return k > 0.3 ? FL.lip : FL.dark;            // el borde (se evierte al abrirse)
      // Pliegues radiales que convergen; más apretados cuanto más cerrado.
      const fold = Math.cos(a * 9 + (1 - d) * (2.5 - k * 2) * (1 + clench * 0.3));
      const lit = -v * 0.5 - u * 0.2;
      if (fold < -0.55) return FL.vein;
      if (fold > 0.5) return lit > 0 ? FL.hi : FL.lit;
      return lit > 0.15 ? FL.lit : FL.mid;
    });
    gl.clearRect(0, 0, 32, 16);
    if (k > 0.2) { gl.fillStyle = `rgba(90,255,74,${0.4 * k})`; gl.fillRect(12, 7, 8, 4); }
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// ---------------------------------------------------------------------------
// Vejiga de bilis: el espejo de una cubeta en el techo. Una cámara cerrada en la roca,
// sobre la cubeta; lo que se bombea de la cubeta (válvula 'pump', su esfínter) sube en
// gotas por el caño del techo y llena la cámara; al devolverla, la bilis vuelve a caer por
// el caño (un surtidor con pool: la cubeta). En data/worlds/*.js, por sala:
//   bladders: [{ pool, chamber }]  pool: la cubeta del suelo; chamber: la cámara del techo
//             (otra cubeta de fluids, con ceiling: true). La cámara es el reflejo de la cubeta.
export class Bladder {
  constructor(game, room, def, pool, chamber) {
    this.game = game;
    this.def = def;
    this.pool = pool;
    this.chamber = chamber;
  }

  update() {
    const g = this.game, p = this.pool, c = this.chamber;
    if (!p || !c) return;
    // Lo que falta abajo está arriba.
    c.target = c.level = 1 - p.level;
    // Bombeando: gotas de bilis que suben de la cubeta al caño del techo.
    if (p.trend < 0 && Math.random() < 0.8) {
      const x = c.x0 + c.w / 2 + (Math.random() - 0.5) * Math.min(60, c.w - 12), y0 = p.surfaceY - 2, y1 = c.yBottom + TILE;
      g.glowParticles.emit(x, y0, { vx: (c.x0 + c.w / 2 - x) * 1.5, vy: -(y0 - y1) / 0.5, life: 0.5, color: [0.45, 1, 0.3] });
    }
  }

  dispose() {}
}
