import { TILE } from '../core/Physics.js';
import { canvasSprite } from './Puzzles.js';

// SISTEMA CIRCULATORIO: todo late al mismo pulso. Cada latido es un golpe de presión
// que llega de repente y se apaga poco a poco (con un segundo rebote, como el pulso
// de verdad). Lo usan, definidos por sala en data/levels.js:
//   blood:       [{ x: [c0, c1], top, bottom, base, surge, flow, phase }]   charca de sangre
//                que sube con cada latido y vuelve a bajar despacio; superficie con olas
//                (muelles), glóbulos que arrastra la corriente y empuje en `flow` ('left'/'right')
//   arteries:    [{ x, y, dir, power, phase }]   orificio que escupe sangre a presión
//   heartValves: [{ x, y, h, phase, open }]      valvas que se abren con el latido (paso con ritmo)
//   ventricles:  [{ x, y, r, phase }]            cámara de fondo que se contrae y bombea
// La sangre no hiere: empuja, levanta y se nada en ella.

export const BEAT = 1.6;                       // s entre latidos

// Presión 0..1 en el instante t: golpe seco, caída exponencial y el rebote dicrótico.
export function pressure(t, phase = 0) {
  const p = (((t + phase) % BEAT) + BEAT) % BEAT;
  const rise = Math.min(1, p / 0.06);           // el golpe tarda unas centésimas
  return rise * Math.exp(-p * 2.6) + 0.22 * Math.exp(-(((p - 0.42) / 0.09) ** 2));
}
// Momento del latido (0..BEAT) y si acaba de empezar uno.
const beatPhase = (t, phase = 0) => (((t + phase) % BEAT) + BEAT) % BEAT;

const R = (a, b) => a + Math.random() * (b - a);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const overlap = (p, x, y, w, h) => p.x < x + w && p.x + p.w > x && p.y < y + h && p.y + p.h > y;

// ---------------------------------------------------------------------------
// Charca de sangre. La superficie es una hilera de muelles (ecuación de onda
// discreta): cada latido mete un empujón por el lado de donde viene la sangre y la
// ola cruza la charca; al entrar o nadar, el cuerpo la salpica.
export class BloodPool {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.x0 = def.x[0] * TILE;
    this.w = (def.x[1] - def.x[0] + 1) * TILE;
    this.yTop = def.top * TILE;
    this.yBottom = (def.bottom + 1) * TILE;
    this.full = this.yBottom - this.yTop;
    this.base = def.base ?? 0.4;
    this.surge = def.surge ?? 0.3;
    this.flow = def.flow === 'left' ? -1 : def.flow === 'right' ? 1 : 0;
    this.level = this.base;
    this.spr = canvasSprite(game, this.w, this.full, 3);
    this.spr.place(this.x0, this.yTop);
    this.spr.mesh.material.opacity = 0.9;
    this.N = Math.ceil(this.w / 2) + 1;
    this.h = new Float32Array(this.N);         // desplazamiento de la superficie (px)
    this.v = new Float32Array(this.N);
    this.cells = Array.from({ length: Math.round(this.w / 9) }, () => this.#cell(true));
    this.lastBeat = 0;
    this.wasIn = false;
  }

  #cell(any) {
    return { x: any ? Math.random() * this.w : (this.flow < 0 ? this.w : 0), y: Math.random(), r: R(1.4, 2.6), ph: Math.random() * 6, sp: R(0.6, 1.3), spin: Math.random() };
  }

  get surfaceY() { return this.yBottom - this.level * this.full; }

  update(dt) {
    const g = this.game, t = g.time, p = g.player;
    const pr = pressure(t, this.def.phase ?? 0);
    // Nivel: sube deprisa con el golpe y baja despacio.
    const want = this.base + this.surge * pr;
    this.level += (want - this.level) * Math.min(1, dt * (want > this.level ? 9 : 1.8));
    // Latido: un empujón en la superficie por el lado de entrada.
    const bp = beatPhase(t, this.def.phase ?? 0);
    if (bp < this.lastBeat) {
      const at = this.flow < 0 ? this.N - 3 : this.flow > 0 ? 2 : Math.floor(this.N / 2);
      for (let i = -4; i <= 4; i++) if (this.h[at + i] !== undefined) this.v[at + i] -= 120 * (1 - Math.abs(i) / 5);
      g.audio.play('bloodSurge', { x: this.x0 + this.w / 2, y: this.surfaceY });
    }
    this.lastBeat = bp;
    // Muelles: cada punto vuelve a su sitio y tira de sus vecinos.
    const sub = 2, k = 55, spread = 0.25, damp = 0.7;
    // Oleaje de fondo: la sangre nunca está quieta del todo.
    if (Math.random() < 0.25) { const i = Math.floor(Math.random() * this.N); this.v[i] += R(-14, 14); }
    for (let s = 0; s < sub; s++) {
      const h = this.h, v = this.v, d = dt / sub;
      for (let i = 0; i < this.N; i++) { v[i] += (-k * h[i] - damp * v[i]) * d; }
      for (let i = 0; i < this.N; i++) {
        const l = h[Math.max(0, i - 1)], r = h[Math.min(this.N - 1, i + 1)];
        v[i] += spread * (l + r - 2 * h[i]) * 60 * d;
      }
      for (let i = 0; i < this.N; i++) h[i] += v[i] * d;
    }
    // El cuerpo que entra o nada salpica la superficie.
    const sy = this.surfaceY;
    const inside = p.cx > this.x0 && p.cx < this.x0 + this.w && p.y + p.h > sy && p.y < this.yBottom;
    const near = p.cx > this.x0 && p.cx < this.x0 + this.w && Math.abs(p.y + p.h * 0.5 - sy) < 12;
    if (near) {
      const i = Math.round((p.cx - this.x0) / 2);
      const kick = inside !== this.wasIn ? 70 : Math.abs(p.vx) * 0.05;
      for (let j = -2; j <= 2; j++) if (this.v[i + j] !== undefined) this.v[i + j] += (p.vy > 0 || inside !== this.wasIn ? 1 : -1) * kick * (1 - Math.abs(j) / 3);
      if (inside !== this.wasIn) for (let n = 0; n < 10; n++) g.particles.emit(p.cx, sy, { vx: R(-70, 70), vy: R(-160, -60), life: 0.8, gravity: 520, color: [0.6, 0.04, 0.08], stain: '#6a0a12' });
    }
    this.wasIn = inside;
    // Corriente: empuja con el latido y se calma.
    if (this.flow && inside) p.windX = (p.windX ?? 0) + this.flow * (30 + 240 * pr);
    // Glóbulos arrastrados por la corriente.
    for (const c of this.cells) {
      c.x += (this.flow * (14 + 110 * pr) + Math.sin(t * 1.3 + c.ph) * 6) * c.sp * dt;
      c.ph += dt;
      if (c.x < -4 || c.x > this.w + 4) Object.assign(c, this.#cell(false));
    }
    this.#paint(t, pr);
  }

  #paint(t, pr) {
    const { g, gl } = this.spr, W = this.w, H = this.full;
    g.clearRect(0, 0, W, H);
    gl.clearRect(0, 0, W, H);
    const top = H - this.level * H;                        // superficie (local)
    for (let i = 0; i < this.N; i++) {
      const x = i * 2, y = Math.round(top + this.h[i]);
      if (y >= H) continue;
      // Cuerpo: escarlata arriba, granate hacia el fondo (tres bandas por columna).
      const y0 = Math.max(0, y);
      g.fillStyle = '#e8283e'; g.fillRect(x, y0, 2, 3);
      g.fillStyle = '#b8142c'; g.fillRect(x, y0 + 3, 2, 7);
      g.fillStyle = '#86081e'; g.fillRect(x, y0 + 10, 2, Math.max(0, H - y0 - 10));
      gl.fillStyle = 'rgba(140,0,24,0.22)'; gl.fillRect(x, y0, 2, H - y0);        // la sangre se ve a oscuras
      // Superficie brillante y espuma cuando la ola sube.
      g.fillStyle = this.v[i] < -12 ? '#ffb0b0' : '#ff4a5a';
      g.fillRect(x, y, 2, 1);
      gl.fillStyle = `rgba(255,60,70,${0.35 + pr * 0.4})`;
      gl.fillRect(x, y, 2, 1);
    }
    // Glóbulos rojos: discos con el centro hundido, a la deriva.
    for (const c of this.cells) {
      const yy = top + 4 + c.y * Math.max(1, H - top - 8) + Math.sin(c.ph * 2) * 1.5;
      if (yy > H - 2 || yy < top + 2) continue;
      g.fillStyle = '#e0303e'; g.fillRect(Math.round(c.x - c.r), Math.round(yy - 1), Math.round(c.r * 2), 2);
      g.fillStyle = '#8a0a18'; g.fillRect(Math.round(c.x - 0.5), Math.round(yy - 1), 1, 2);
    }
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// ---------------------------------------------------------------------------
// Arteria: un orificio de carne en la pared que escupe sangre a presión en cada
// latido. Las gotas siguen parábolas de verdad y manchan donde caen. El chorro
// empuja (o te sube si apunta hacia arriba); se va apagando hasta el siguiente golpe.
export class Artery {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    const [dx, dy] = DIRS[def.dir ?? 'up'];
    this.dx = dx; this.dy = dy;
    // La boca está en el borde de la casilla de pared, del lado del aire.
    this.ox = def.x * TILE + 8 + dx * 8;
    this.oy = def.y * TILE + 8 + dy * 8;
    this.power = def.power ?? 1;
    this.mouth = canvasSprite(game, 20, 20, 3);
    this.mouth.place(this.ox - 10, this.oy - 10);
    // Lienzo del chorro: una caja que cubre todo su recorrido.
    const up = dy < 0, down = dy > 0;
    this.box = up ? { x: this.ox - 70, y: this.oy - 230, w: 140, h: 250 }
      : down ? { x: this.ox - 60, y: this.oy - 10, w: 120, h: 230 }
        : { x: dx > 0 ? this.ox - 10 : this.ox - 270, y: this.oy - 80, w: 280, h: 230 };
    this.spray = canvasSprite(game, this.box.w, this.box.h, 4);
    this.spray.place(this.box.x, this.box.y);
    this.drops = [];
    this.acc = 0;
  }

  update(dt) {
    const g = this.game, p = g.player, t = g.time, w = g.world;
    const pr = pressure(t, this.def.phase ?? 0);
    const speed = (90 + 330 * pr) * this.power;
    // Gotas: muchas y gruesas con el golpe, un goteo al final (el chorro "se va deteniendo").
    this.acc += dt * (10 + 160 * pr * pr);
    while (this.acc >= 1) {
      this.acc--;
      const spread = 0.08 + (1 - pr) * 0.3, a = Math.atan2(this.dy, this.dx) + R(-spread, spread), v = speed * R(0.85, 1.08);
      this.drops.push({ x: this.ox + this.dx * 3, y: this.oy + this.dy * 3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1 + pr * 1.6 + Math.random() * 0.8, life: 1.6 });
    }
    // Física de las gotas: parábolas; al chocar, salpican y manchan.
    for (const d of this.drops) {
      d.vy += 520 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt;
      if (w.solidAtPx(d.x, d.y)) {
        d.life = 0;
        if (Math.random() < 0.3) for (let i = 0; i < 2; i++) g.particles.emit(d.x - d.vx * dt, d.y - d.vy * dt, { vx: -d.vx * 0.15 + R(-40, 40), vy: -Math.abs(d.vy) * 0.2 - R(20, 60), life: 0.6, gravity: 520, color: [0.8, 0.06, 0.12], stain: '#6a0a12' });
      }
    }
    this.drops = this.drops.filter((d) => d.life > 0);
    // Empuje: se recorre la parábola del chorro y, si el jugador está en ella, empuja.
    if (pr > 0.08) {
      let x = this.ox, y = this.oy, vx = this.dx * speed, vy = this.dy * speed;
      for (let i = 0; i < 24; i++) {
        const st = 0.025;
        x += vx * st; y += vy * st; vy += 520 * st;
        if (w.solidAtPx(x, y)) break;
        if (overlap(p, x - 5, y - 5, 10, 10)) {
          if (this.dy < 0 && Math.abs(vx) < Math.abs(vy)) { p.lift = Math.max(p.lift ?? 0, 1700 * pr * this.power); p.riseMax = 140 + 260 * pr; }
          else p.windX = (p.windX ?? 0) + Math.sign(vx || this.dx) * 260 * pr * this.power;
          break;
        }
      }
    }
    this.#paint(t, pr);
  }

  #paint(t, pr) {
    // La boca: anillo de carne que se dilata con la presión.
    const m = this.mouth;
    m.g.clearRect(0, 0, 20, 20); m.gl.clearRect(0, 0, 20, 20);
    const r = 4 + pr * 2.5;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const d = Math.hypot(x - 9.5, y - 9.5);
      if (d > r + 3) continue;
      m.g.fillStyle = d < r - 0.5 ? (d < r * 0.5 ? '#1a0206' : '#5a0410') : d < r + 1.5 ? '#c84a5a' : '#6a1a2a';
      m.g.fillRect(x, y, 1, 1);
    }
    m.gl.fillStyle = `rgba(255,40,60,${0.25 + pr * 0.6})`;
    m.gl.fillRect(8, 8, 4, 4);
    m.commit();
    // El chorro: gotas con contorno oscuro, cuerpo escarlata y un brillo.
    const { g, gl } = this.spray, B = this.box;
    g.clearRect(0, 0, B.w, B.h); gl.clearRect(0, 0, B.w, B.h);
    for (const pass of [0, 1, 2]) for (const d of this.drops) {
      const x = Math.round(d.x - B.x), y = Math.round(d.y - B.y), s = Math.max(1, Math.round(d.r));
      if (pass === 0) { g.fillStyle = '#3a0008'; g.fillRect(x - s, y - s, s * 2 + 1, s * 2 + 1); }
      else if (pass === 1) { g.fillStyle = d.r > 2.2 ? '#e8283e' : '#b8142c'; g.fillRect(x - s + 1, y - s + 1, s * 2 - 1, s * 2 - 1); if (s === 1) g.fillRect(x, y, 1, 1); }
      else { g.fillStyle = '#ffb0b8'; g.fillRect(x - s + 1, y - s + 1, 1, 1); gl.fillStyle = 'rgba(255,40,60,0.35)'; gl.fillRect(x - 1, y - 1, 2, 2); }
    }
    this.spray.commit();
  }

  dispose() { this.mouth.dispose(); this.spray.dispose(); }
}

// ---------------------------------------------------------------------------
// Válvula cardíaca: dos valvas de carne en un paso vertical, sujetas por cuerdas
// tendinosas. Se abren de golpe con el latido, aguantan y se cierran; tiemblan antes
// de cerrarse. Cerrada es pared. Nunca se cierra encima de ti.
export class HeartValve {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.cells = Array.from({ length: def.h }, (_, i) => [def.x, def.y + i]);
    this.openFrac = def.open ?? 0.5;
    this.k = 0;                                   // 0 cerrada · 1 abierta del todo
    this.solid = null;
    this.spr = canvasSprite(game, TILE + 8, def.h * TILE, 2);
    this.spr.place(def.x * TILE - 4, def.y * TILE);
    this.#set(true);
  }

  #set(solid) {
    if (this.solid === solid) return;
    for (const [x, y] of this.cells) this.room.world.set(x, y, solid ? 'D' : '.');
    this.solid = solid;
    this.game.visual.setRoomSolids(this.room.world);
  }

  update(dt) {
    const g = this.game, p = g.player;
    const bp = beatPhase(g.time, this.def.phase ?? 0), openT = BEAT * this.openFrac;
    let want = bp < openT ? 1 : 0;
    const blocked = overlap(p, this.def.x * TILE, this.def.y * TILE, TILE, this.def.h * TILE);
    if (!want && blocked && this.k > 0.2) want = 1;   // no aplasta: espera a que pases
    this.k += (want - this.k) * Math.min(1, dt * (want ? 16 : 7));
    const wasSolid = this.solid;
    this.#set(this.k < 0.35);
    if (wasSolid !== this.solid) g.audio.play(this.solid ? 'valveShut' : 'valveOpen', { x: this.def.x * TILE + 8, y: (this.def.y + this.def.h / 2) * TILE });
    this.#paint(g.time, bp > openT - 0.25 && bp < openT);
  }

  #paint(t, warn) {
    const { g, gl } = this.spr, W = TILE + 8, H = this.def.h * TILE;
    g.clearRect(0, 0, W, H); gl.clearRect(0, 0, W, H);
    const shiver = warn ? Math.round(Math.sin(t * 60)) : 0;
    // Dos valvas: una cuelga de arriba y otra sube de abajo; abiertas se pliegan a los lados.
    const reach = (H / 2) * (1 - this.k * 0.85);
    for (const top of [true, false]) {
      for (let i = 0; i < reach; i++) {
        const k = i / Math.max(1, reach), half = Math.max(1, Math.round((1 - k * 0.6) * 7));
        const y = top ? i : H - 1 - i, cx = W / 2 + shiver + Math.sin(k * 2.4) * (top ? 2 : -2) * this.k;
        g.fillStyle = '#2a0610'; g.fillRect(Math.round(cx - half - 1), y, half * 2 + 2, 1);
        g.fillStyle = i > reach - 2 ? '#f0a0a8' : k < 0.5 ? '#c8485a' : '#e06a78'; g.fillRect(Math.round(cx - half), y, half * 2, 1);
        g.fillStyle = '#8a1a2a'; g.fillRect(Math.round(cx + half - 2), y, 2, 1);
      }
      // Cuerdas tendinosas: del borde libre de la valva al muro.
      const ey = top ? reach : H - reach;
      g.fillStyle = '#e8d0c0';
      for (const side of [-1, 1]) for (let s = 0; s < 1; s += 0.08) g.fillRect(Math.round(W / 2 + side * (2 + s * 8)), Math.round(ey + (top ? -1 : 1) * s * 10), 1, 1);
    }
    if (warn) { gl.fillStyle = 'rgba(255,60,80,0.5)'; gl.fillRect(W / 2 - 1, 0, 2, H); }
    this.spr.commit();
  }

  dispose() { this.#set(false); this.spr.dispose(); }
}

// ---------------------------------------------------------------------------
// Ventrículo: decorado vivo detrás de la sala. Una cámara de músculo con trabéculas
// que se contrae con el latido; arriba, su válvula se abre y suelta un chorro.
export class Ventricle {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.r = def.r ?? 28;
    this.S = Math.ceil(this.r * 2.6);
    this.cx = def.x * TILE + 8;
    this.cy = def.y * TILE + 8;
    this.spr = canvasSprite(game, this.S, this.S, -2);
    this.spr.place(this.cx - this.S / 2, this.cy - this.S / 2);
    this.lastBeat = 0;
  }

  update(dt) {
    const g = this.game, t = g.time, ph = this.def.phase ?? 0;
    const pr = pressure(t, ph), bp = beatPhase(t, ph);
    if (bp < this.lastBeat) {
      // Expulsa: un chorro por la válvula de arriba.
      for (let i = 0; i < 18; i++) g.particles.emit(this.cx + R(-4, 4), this.cy - this.r * 0.9, { vx: R(-40, 40), vy: R(-260, -140), life: 1.2, gravity: 520, color: [0.7, 0.04, 0.1], stain: '#5a0a12' });
    }
    this.lastBeat = bp;
    this.#paint(t, pr);
  }

  #paint(t, pr) {
    const { g, gl } = this.spr, S = this.S, c = S / 2;
    g.clearRect(0, 0, S, S); gl.clearRect(0, 0, S, S);
    const squeeze = 1 - pr * 0.22;                           // sístole: se encoge
    const rx = this.r * squeeze, ry = this.r * (1.12 - pr * 0.1);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - c, dy = y - c - pr * 2;
      // Forma de ventrículo: más ancho arriba y en punta abajo.
      const taper = dy > 0 ? 1 + (dy / ry) * 0.5 : 1;
      const d = Math.hypot(dx * taper / rx, dy / ry);
      if (d > 1) continue;
      const wall = d > 0.62;                                  // pared de músculo
      let col;
      if (wall) {
        const lit = (-dx - dy) / (this.r * 1.4);
        const stri = Math.sin(Math.atan2(dy, dx) * 14 + d * 6) > 0.6;   // trabéculas
        col = d > 0.95 ? '#2a0410' : stri ? '#6a0e1e' : lit > 0.3 ? '#c83048' : '#9a1a30';
      } else col = d < 0.35 ? '#1a0208' : '#3a0610';               // la cavidad, con sangre
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    // Válvula de salida arriba: se abre con el golpe.
    const open = Math.round(pr * 5);
    g.fillStyle = '#e06a78';
    g.fillRect(c - 6, c - ry * 0.95, 6 - open, 3);
    g.fillRect(c + open, c - ry * 0.95, 6 - open, 3);
    // Vasos que la abrazan, rojos y azules, que se iluminan con el latido.
    gl.fillStyle = `rgba(255,50,70,${0.15 + pr * 0.5})`;
    gl.fillRect(c - 2, c - 2 - pr * 2, 4, 4);
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}
