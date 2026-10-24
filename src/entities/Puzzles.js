import { TILE, overlap } from '../core/Physics.js';
import { canvasTexture, spriteMesh, placeMesh } from '../core/Sprites.js';
import { px, seg, blob } from './Rig.js';
import { paintFangTile } from '../factory/TilePainter.js';
import { ENEMIES } from '../data/enemies.js';

// Mecanismos vivos de las salas: puzles sencillos hechos de carne. En data/levels.js:
//
//   gates:  [{ id, x, y, h, pool }]                  compuerta-esfínter vertical de h tiles (con
//                                                    `pool`: esclusa, cerrada mientras esa cubeta
//                                                    tiene fluido)
//   pads:   [{ x, y, hold, opens, time }]            ganglio reflejo en el suelo: quédate encima
//                                                    `hold` s y abre la compuerta `opens` durante
//                                                    `time` s (sin time, para siempre)
//   pods:   { opens, at: [[x, y], ...], order }      sacos vitelinos que hay que reventar en orden
//                                                    (`order`: índices de `at`); laten en ese orden
//   valves: [{ x, y, dir, pool, action, time, pool2 }] válvula-esfínter en la roca: al dispararle
//                                                    llena (`fill`, durante `time` s), vacía para
//                                                    siempre (`drain`), alterna lleno/vacío
//                                                    (`toggle`) o pasa el fluido de `pool` a
//                                                    `pool2` y viceversa (`swap`)
//   floats: [{ x: [c0, c1], pool }]                  balsa de grasa que flota en esa cubeta
//   movers: [{ x, y, w, path, speed, pause }]       plataforma móvil que recorre una ruta
//
// Las cubetas que mueven las válvulas llevan manual: true y start (0 vacía, 1 llena).
// Todo lo que se abre para siempre se recuerda en state.flags.

const K = '#140c10';

// Lienzo animado con su mesh (mundo) y su brillo (capa aditiva).
export function canvasSprite(game, w, h, order = 2) {
  const canvas = document.createElement('canvas'), glowCanvas = document.createElement('canvas');
  canvas.width = glowCanvas.width = w;
  canvas.height = glowCanvas.height = h;
  const tex = canvasTexture(canvas), glowTex = canvasTexture(glowCanvas);
  const mesh = spriteMesh(w, h);
  mesh.material.map = tex;
  mesh.renderOrder = order;
  const glow = spriteMesh(w, h, { glow: true });
  glow.material.map = glowTex;
  game.visual.world.add(mesh);
  game.visual.glow.add(glow);
  return {
    canvas, glowCanvas, mesh, glow,
    g: canvas.getContext('2d'), gl: glowCanvas.getContext('2d'),
    place(x, y) { placeMesh(mesh, x, y, w, h); placeMesh(glow, x, y, w, h); },
    commit() { tex.needsUpdate = true; glowTex.needsUpdate = true; },
    dispose() { mesh.removeFromParent(); glow.removeFromParent(); tex.dispose(); glowTex.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// Compuerta-esfínter: un telón de músculo anillado que cierra un paso. Al abrirse se
// recoge hacia arriba; abierta a tiempo, parpadea en rojo antes de volver a cerrarse.
export class Gate {
  constructor(game, room, def, pool) {
    this.game = game;
    this.room = room;
    this.def = def;
    // Compuerta de esclusa (`pool`): cerrada mientras esa cubeta tiene fluido o se está
    // llenando; se abre cuando queda seca. Así se entra a un tanque por abajo sin que el
    // ácido se salga.
    this.pool = pool;
    this.key = `gate:${room.id}:${def.id}`;
    this.cells = Array.from({ length: def.h }, (_, i) => [def.x, def.y + i]);
    // Con `until: 'jefe'` es un sello de frontera: abierto para siempre cuando ese jefe cae.
    this.forever = game.state.flags.has(this.key) || (def.until && game.state.flags.has(`boss:${def.until}`));
    this.k = this.forever ? 1 : 0; // 0 cerrada, 1 recogida
    this.timer = 0;
    this.solid = !this.forever;
    this.#setCells(this.solid);
    this.spr = canvasSprite(game, TILE, def.h * TILE, 2);
    this.spr.place(def.x * TILE, def.y * TILE);
    this.t = Math.random() * 3;
  }

  get open() {
    // when: 'full' → al revés: solo se abre con la cubeta llena (una puerta a su balsa arriba).
    if (this.pool && this.def.when === 'full') return this.pool.level > 0.97 && this.pool.target > 0.5;
    if (this.pool) return this.pool.level < 0.02 && this.pool.target < 0.5;
    return this.forever || this.timer > 0;
  }

  // Abre durante `seconds` (o para siempre si no se indica).
  openFor(seconds) {
    if (this.forever) return;
    const g = this.game;
    if (seconds == null) {
      this.forever = true;
      g.state.flags.add(this.key);
    } else this.timer = seconds;
    g.audio.play('tear', this.center);
    g.audio.play('womb', this.center);
  }

  get center() { return { x: this.def.x * TILE + 8, y: (this.def.y + this.def.h / 2) * TILE }; }

  #setCells(solid) {
    for (const [x, y] of this.cells) this.room.world.set(x, y, solid ? 'D' : '.');
    this.solid = solid;
    this.game.visual.setRoomSolids(this.room.world);
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    // Sello de frontera: al tocarlo cerrado, se explica qué lo abre.
    if (this.def.until && !this.forever) {
      const p = g.player, near = this.cells.some(([x, y]) => overlap(p, { x: x * TILE - 4, y: y * TILE, w: TILE + 8, h: TILE }));
      if (near && g.time - (g.lastSealSay ?? -9) > 4) {
        g.lastSealSay = g.time;
        g.audio.play('thump', this.center);
        g.say(`Un esfínter de carne cierra el paso. Late al ritmo de ${ENEMIES[this.def.until]?.name ?? 'algo vivo'}: no cederá mientras siga en pie.`, 3.5);
      }
    }
    if (this.timer > 0) {
      this.timer -= dt;
      // Últimos segundos: late para avisar de que se va a cerrar.
      if (this.timer < 1.6 && Math.floor(this.timer * 4) !== Math.floor((this.timer + dt) * 4)) g.audio.play('thump', this.center);
      if (this.timer <= 0) g.audio.play('crunch', this.center);
    }
    const want = this.open ? 1 : 0;
    this.k += Math.sign(want - this.k) * Math.min(Math.abs(want - this.k), dt * (want ? 3 : 4));
    // El paso se libera a media apertura; para cerrarse, nada puede estar dentro.
    const inside = this.cells.some(([x, y]) => overlap(g.player, { x: x * TILE, y: y * TILE, w: TILE, h: TILE }));
    if (this.solid && this.k > 0.5) this.#setCells(false);
    else if (!this.solid && this.k < 0.5 && !inside) this.#setCells(true);
    else if (!this.solid && this.k < 0.5 && inside) this.k = 0.5; // se detiene contra tu cuerpo
    this.#draw();
  }

  #draw() {
    const { g, gl } = this.spr, H = this.def.h * TILE;
    g.clearRect(0, 0, TILE, H);
    gl.clearRect(0, 0, TILE, H);
    const shown = Math.round((1 - this.k) * (H - 4)) + 4; // siempre queda un rodete arriba
    const warn = this.timer > 0 && this.timer < 1.6 && Math.floor(this.timer * 6) % 2 === 0;
    for (let y = 0; y < shown; y++) {
      const fold = (y + Math.round(this.t * 3)) % 5 === 0;
      for (let x = 1; x < 15; x++) {
        const edge = x === 1 || x === 14 || y === shown - 1;
        let c = edge ? K : fold ? '#5a1424' : x === 7 || x === 8 ? '#2a0810' : (x + y) % 3 ? '#8a2a3c' : '#a03448';
        if (!edge && (x === 3 || x === 12)) c = '#6a1e2e';
        px(g, x, y, c);
      }
      if (y % 5 === 2) { px(gl, 7, y, warn ? '#ff2040' : '#7a1828', 2, 1); }
    }
    // Labio inferior: el borde del esfínter, más claro.
    for (let x = 2; x < 14; x++) px(g, x, shown - 2, '#c86070');
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// ---------------------------------------------------------------------------
// Ganglio reflejo: un bulbo nervioso en el suelo. Quédate encima y se carga; al
// completarse dispara la compuerta. Mientras está abierta (a tiempo) se queda apagado.
export class Pad {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.x = def.x * TILE;
    this.y = (def.y + 1) * TILE - 5;
    this.charge = 0;
    this.spr = canvasSprite(game, 20, 12, 2);
    this.spr.place(this.x - 2, (def.y + 1) * TILE - 11);
    this.t = 0;
  }

  get gate() { return this.room.gates[this.def.opens]; }

  update(dt) {
    const g = this.game, p = g.player, gate = this.gate;
    this.t += dt;
    const on = p.onGround && overlap(p, { x: this.x, y: this.y - 2, w: TILE, h: 8 });
    const idle = !gate || gate.open;
    if (!idle && on) {
      if (this.charge === 0) g.audio.play('charge', { x: this.x + 8, y: this.y });
      this.charge += dt;
      if (Math.random() < 0.4) g.glowParticles.emit(this.x + 8 + (Math.random() - 0.5) * 10, this.y, { vy: -30, life: 0.4, color: [0.4, 0.8, 1] });
      if (this.charge >= (this.def.hold ?? 1.2)) {
        this.charge = 0;
        gate.openFor(this.def.time);
        g.shake = Math.max(g.shake, 2);
        if (!g.state.seenPad) {
          g.state.seenPad = true;
          g.say(this.def.time ? 'El ganglio dispara un reflejo: algo se abre... por poco tiempo.' : 'El ganglio dispara un reflejo: algo se abre.', 3);
        }
      }
    } else this.charge = Math.max(0, this.charge - dt * 2);
    this.#draw(idle);
  }

  #draw(idle) {
    const { g, gl } = this.spr;
    g.clearRect(0, 0, 20, 12);
    gl.clearRect(0, 0, 20, 12);
    const k = Math.min(1, this.charge / (this.def.hold ?? 1.2));
    const beat = Math.sin(this.t * (idle ? 2 : 4 + k * 10)) > 0.6 ? 1 : 0;
    // Raíces que se hunden en el suelo y el bulbo encima.
    for (const x of [3, 8, 12, 16]) seg(g, x, 11, x + (x < 10 ? 2 : -2), 7, '#4a2a3a');
    blob(g, 10, 7, 7 + beat * 0.5, 3.5, '#4a5a8a', K, '#8aa0d0');
    // Núcleo: se llena de luz al cargar; apagado mientras la compuerta está abierta.
    const fill = Math.round(k * 9);
    for (let i = 0; i < 9; i++) px(g, 6 + i, 7, i < fill ? '#bfe8ff' : idle ? '#2a3050' : '#3a4a7a');
    if (!idle) { blob(gl, 10, 7, 3 + k * 4, 2 + k, k > 0 ? '#4ab0ff' : beat ? '#1a3a6a' : '#0a1a3a'); }
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// ---------------------------------------------------------------------------
// Sacos vitelinos en cadena: hay que reventarlos en orden. De vez en cuando laten uno
// tras otro mostrando ese orden; uno equivocado y se vuelven a hinchar todos.
class Pod {
  constructor(chain, i, [x, y]) {
    this.chain = chain;
    this.i = i;
    this.cx = x * TILE + 8;
    this.cy = y * TILE + 9;
    this.w = 12; this.h = 14;
    this.x = this.cx - 6; this.y = this.cy - 7;
    this.alive = true;
    this.popped = false;
    this.flash = 0;
    this.spr = canvasSprite(chain.game, 16, 26, 3);
    this.spr.place(this.cx - 8, this.cy - 15);
  }

  hit() { this.chain.hitPod(this); return true; }

  draw(t, show) {
    const { g, gl } = this.spr;
    g.clearRect(0, 0, 16, 26);
    gl.clearRect(0, 0, 16, 26);
    // Cordón hasta el techo (o hasta lo que lo sostiene).
    for (let y = 0; y < 10; y++) px(g, 7 + Math.round(Math.sin(y * 0.8 + t * 2 + this.i)), y, '#8a3a4a', 2, 1);
    if (this.popped) {
      // Reventado: un pellejo arrugado colgando.
      blob(g, 8, 13, 3, 3, '#5a3a20', K);
      this.spr.commit();
      return;
    }
    const beat = 1 + Math.max(0, Math.sin(t * 5 + this.i)) * 0.08;
    blob(g, 8, 17, 6 * beat, 7 * beat, '#3a1418');
    g.globalAlpha = 0.65;
    blob(g, 8, 17, 5 * beat, 6 * beat, '#c8a040', '#a06a30');
    g.globalAlpha = 1;
    px(g, 5, 13, '#f8e8b0', 2, 1);
    const bright = show || this.flash > 0;
    blob(gl, 8, 17, 4, 5, bright ? '#ffd860' : 'rgba(200,160,60,0.3)');
    this.spr.commit();
  }

  burst(good) {
    const g = this.chain.game;
    for (let i = 0; i < (good ? 14 : 6); i++) {
      g.particles.emit(this.cx, this.cy, { vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 100, life: 0.7, gravity: 400, color: i % 2 ? [0.85, 0.7, 0.2] : [0.6, 0.15, 0.2] });
    }
  }

  dispose() { this.spr.dispose(); }
}

const STEP = 0.55; // segundos que late cada saco al mostrar el orden

export class PodChain {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.order = def.order ?? def.at.map((_, i) => i);
    this.key = `pods:${room.id}`;
    this.solved = game.state.flags.has(this.key);
    this.pods = def.at.map((p, i) => new Pod(this, i, p));
    this.next = 0;
    this.t = 0;
    this.phase = 0;
    if (this.solved) for (const p of this.pods) { p.popped = true; p.alive = false; }
    room.targets.push(...this.pods);
  }

  get period() { return this.pods.length * STEP + 2.5; }

  hitPod(pod) {
    const g = this.game;
    if (this.solved || pod.popped) return;
    if (pod.i === this.order[this.next]) {
      pod.popped = true;
      pod.alive = false;
      pod.burst(true);
      g.audio.play('splat', { x: pod.cx, y: pod.cy });
      this.next++;
      if (this.next === this.pods.length) {
        this.solved = true;
        g.state.flags.add(this.key);
        g.audio.play('reveal', { x: pod.cx, y: pod.cy });
        this.room.gates[this.def.opens]?.openFor(null);
        g.say('Los sacos se vacían en orden... y algo cede.', 3);
      }
    } else {
      // Orden equivocado: todos se vuelven a hinchar.
      pod.burst(false);
      g.audio.play('fail', { x: pod.cx, y: pod.cy });
      for (const p of this.pods) { p.popped = false; p.alive = true; p.flash = 0.4; }
      this.next = 0;
      this.phase = this.period - 1;
      if (!g.state.seenPods) {
        g.state.seenPods = true;
        g.say('Se hinchan de nuevo. Laten en un orden... obsérvalos.', 3.5);
      }
    }
  }

  update(dt) {
    this.t += dt;
    for (const p of this.pods) p.flash = Math.max(0, p.flash - dt);
    // Pista: laten uno tras otro en el orden correcto, y descansan.
    let show = -1;
    if (!this.solved) {
      this.phase = (this.phase + dt) % this.period;
      const s = Math.floor(this.phase / STEP);
      if (s < this.pods.length) show = this.order[s];
      if (show !== this.lastShow && show >= 0 && !this.pods[show].popped) this.game.audio.play('click', { x: this.pods[show].cx, y: this.pods[show].cy });
      this.lastShow = show;
    }
    for (const p of this.pods) p.draw(this.t, p.i === show && !p.popped);
  }

  dispose() { for (const p of this.pods) p.dispose(); }
}

// ---------------------------------------------------------------------------
// Válvula-esfínter: un esfínter de carne incrustado en la roca, visto de frente. Se le
// dispara (o se golpea) para accionarlo:
//   action 'fill'   lo abre y llena la cubeta `pool` durante `time` s (luego se cierra)
//   action 'drain'  lo abre para siempre y vacía la cubeta (se recuerda)
//   action 'toggle' cada golpe la llena o la vacía (y así se queda)
//   action 'swap'   pasa el fluido de una cubeta a otra: llena `pool` y vacía `pool2`, o al revés
// Cerrado: los pliegues se juntan en una estrella apretada y en el centro late un punto
// ámbar (pide un golpe). Abierto: se dilata, los labios se dan la vuelta, se ve la
// garganta y el ácido verde que corre por ella.
const VS = 26;
const vrgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const VC = {
  out: vrgb('#1a0810'), root: vrgb('#3a1220'), rootHi: vrgb('#5a2034'), dark: vrgb('#4a1626'), mid: vrgb('#7a2a40'), lit: vrgb('#a8445a'), hi: vrgb('#d47a88'),
  crease: vrgb('#2a0a16'), lipC: vrgb('#5a1a2c'), lipO: vrgb('#f0a0aa'), throat: vrgb('#12040a'),
  amber: vrgb('#ffb040'), amberD: vrgb('#a85a10'), acid: vrgb('#6ad83a'), acidHi: vrgb('#c8f080'), acidD: vrgb('#2e7414'), vein: vrgb('#2a0816'),
};
export class Valve {
  constructor(game, room, def, pool, pool2) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.pool = pool;
    this.pool2 = pool2;
    this.key = `valve:${room.id}:${def.x},${def.y}`;
    this.cx = def.x * TILE + 8;
    this.cy = def.y * TILE + 8;
    this.w = 16; this.h = 16;
    this.x = this.cx - 8; this.y = this.cy - 8;
    this.done = def.action === 'drain' && game.state.flags.has(this.key);
    this.alive = !this.done;
    this.timer = 0;
    this.cool = 0;
    this.squish = 0;
    this.k = 0; // apertura dibujada (0..1)
    this.t = Math.random() * 3;
    this.frame = 0;
    if (this.done && pool) { pool.target = 0; pool.level = 0; }
    this.spr = canvasSprite(game, VS, VS, 2);
    this.spr.place(this.cx - VS / 2, this.cy - VS / 2);
    this.spr.mesh.rotation.z = this.spr.glow.rotation.z = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[def.dir ?? 'down'];
    room.targets.push(this);
  }

  // Abierta = está haciendo lo suyo (llenando, ya vaciada, o en su posición de "lleno").
  get open() {
    const act = this.def.action ?? 'fill';
    if (act === 'drain') return this.done;
    if (act === 'toggle' || act === 'swap') return (this.pool?.target ?? 0) >= 0.5;
    return this.timer > 0;
  }

  get flowing() { return this.timer > 0 || (this.def.action === 'drain' && this.pool && this.pool.level > 0.01 && this.done); }

  hit() {
    const g = this.game, act = this.def.action ?? 'fill';
    if (!this.alive || this.cool > 0) return true;
    this.cool = 0.6;
    this.squish = 1;
    g.audio.play('splat', this);
    g.audio.play('acid', this);
    for (let i = 0; i < 12; i++) g.particles.emit(this.cx, this.cy, { vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.5, gravity: 300, color: [0.75, 0.85, 0.25] });
    if (act === 'drain') {
      this.done = true;
      this.alive = false;
      g.state.flags.add(this.key);
      if (this.pool) this.pool.target = 0;
    } else if (act === 'toggle') {
      if (this.pool) this.pool.target = this.pool.target >= 0.5 ? 0 : 1;
    } else if (act === 'swap') {
      const fillA = (this.pool?.target ?? 0) < 0.5;
      if (this.pool) this.pool.target = fillA ? 1 : 0;
      if (this.pool2) this.pool2.target = fillA ? 0 : 1;
    } else {
      this.timer = this.def.time ?? 8;
      if (this.pool) this.pool.target = 1;
    }
    return true;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.cool = Math.max(0, this.cool - dt);
    this.squish = Math.max(0, this.squish - dt * 3);
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && this.pool) {
        this.pool.target = 0;
        g.audio.play('glandFlood', this);
      }
    }
    this.k += ((this.open ? 1 : 0) - this.k) * Math.min(1, dt * 5);
    // Un llenado a tiempo avisa al final: el esfínter tiembla y empieza a cerrarse.
    if ((this.frame++ & 1) === 0) this.#draw();
  }

  #draw() {
    const { g, gl } = this.spr, t = this.t;
    const ending = this.timer > 0 && this.timer < 2 ? Math.sin(t * 30) * 0.12 : 0;
    const k = Math.max(0, Math.min(1, this.k + ending));
    const beat = Math.max(0, Math.sin(t * 3.2));
    const sq = 1 + this.squish * 0.18;
    const c = VS / 2 - 0.5, cy = c + 1;
    const im = g.createImageData(VS, VS), d = im.data;
    for (let y = 0; y < VS; y++) for (let x = 0; x < VS; x++) {
      let col = null;
      // Raíces: la carne que lo ancla a la roca (por arriba; el sprite se gira según dir).
      if (y < 7) {
        const sway = Math.sin(x * 0.9 + 1.3) * 1.5;
        const root = Math.abs(((x + 2) % 6) - 3 + sway * 0.3) < 1.6 && y < 6 - Math.abs(x - c) * 0.2;
        if (root) col = (x + y) % 5 === 0 ? VC.rootHi : VC.root;
      }
      const u = (x - c) / (11.5 * sq), v = (y - cy) / (10.5 / sq), r = Math.hypot(u, v);
      if (r <= 1) {
        const a = Math.atan2(v, u);
        const hole = 0.07 + k * 0.5, lip = hole + 0.13 + k * 0.05;
        const lit = -u * 0.35 - v * 0.55;
        if (r > 0.9) col = VC.out;
        else if (r < hole) {
          // Garganta: oscura; abierta, el ácido corre por ella en ondas.
          if (k < 0.2) col = VC.throat;
          else { const w = Math.sin(r * 22 - t * 10 + a); col = w > 0.6 ? VC.acidHi : w > -0.1 ? VC.acid : r < hole * 0.45 ? VC.acidD : VC.throat; }
        } else if (r < lip) {
          col = k > 0.4 ? (lit > 0 ? VC.lipO : VC.hi) : VC.lipC;          // labios: evertidos y pálidos al abrirse
        } else {
          // Pliegues radiales que se retuercen hacia el centro (más cerrado, más prietos).
          const fold = Math.cos(a * 8 + (1 - r) * (3 - k * 2.4));
          if (fold < -0.6) col = VC.crease;
          else if (fold > 0.55) col = lit > 0.05 ? VC.hi : VC.lit;
          else col = lit > 0.25 ? VC.lit : lit > -0.25 ? VC.mid : VC.dark;
          // Venas oscuras en el anillo exterior.
          if (r > 0.72 && Math.abs(Math.sin(a * 3 + 0.7)) < 0.08) col = VC.vein;
        }
        // Cerrado: el punto ámbar que late en el centro.
        if (k < 0.3 && r < 0.12 + beat * 0.05) col = beat > 0.5 ? VC.amber : VC.amberD;
      }
      if (!col) continue;
      const i = (y * VS + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    gl.clearRect(0, 0, VS, VS);
    if (k > 0.25) { gl.fillStyle = `rgba(90,255,74,${0.5 * k})`; gl.beginPath(); gl.arc(c + 0.5, cy + 0.5, 1 + k * 5, 0, Math.PI * 2); gl.fill(); }
    else { gl.fillStyle = `rgba(255,170,60,${0.25 + beat * 0.55})`; gl.fillRect(Math.round(c) - 1, Math.round(cy) - 1, 3, 3); }
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// ---------------------------------------------------------------------------
// Balsa de grasa: flota en la superficie de una cubeta y se pisa desde arriba. Con la
// cubeta vacía descansa en el fondo; al llenarse te sube con ella.
export class Float {
  constructor(game, room, def, pool) {
    this.game = game;
    this.def = def;
    this.pool = pool;
    this.x = def.x[0] * TILE;
    this.w = (def.x[1] - def.x[0] + 1) * TILE;
    this.h = 8;
    this.y = this.#restY();
    this.platform = { x: this.x, y: this.y, w: this.w, dy: 0 };
    this.world = room.world;
    this.world.platforms.push(this.platform);
    this.spr = canvasSprite(game, this.w, 12, 3);
    this.t = Math.random() * 3;
  }

  #restY() {
    const p = this.pool;
    return p.level > 0.03 ? p.surfaceY - 4 : p.yBottom - this.h;
  }

  update(dt) {
    this.t += dt;
    const target = this.#restY() + Math.sin(this.t * 2) * (this.pool.level > 0.03 ? 1 : 0);
    const ny = this.y + (target - this.y) * Math.min(1, dt * 8);
    this.platform.dy = ny - this.y;
    this.y = ny;
    this.platform.y = this.y;
    this.#draw();
    this.spr.place(this.x, this.y - 2);
  }

  #draw() {
    const { g, gl } = this.spr, w = this.w;
    g.clearRect(0, 0, w, 12);
    gl.clearRect(0, 0, w, 12);
    // Glóbulos de grasa amarillenta apelotonados, con contorno.
    for (let x = 0; x < w; x += 6) {
      const r = 4 + ((x * 7) % 3) * 0.6;
      blob(g, x + 4, 6, r, 3.5, '#d8c080', K, '#fff0c0');
    }
    for (let x = 2; x < w - 2; x += 9) px(g, x, 8, '#a08040', 3, 1);
    if (this.pool.level > 0.03) for (let x = 0; x < w; x += 4) px(gl, x + ((this.t * 6) | 0) % 4, 10, '#2a6a20', 2, 1);
    this.spr.commit();
  }

  dispose() {
    const pl = this.world.platforms;
    pl.splice(pl.indexOf(this.platform), 1);
    this.spr.dispose();
  }
}

// ---------------------------------------------------------------------------
// Plataforma móvil: una losa de carne con raíces colgando que recorre una ruta de ida
// y vuelta y te lleva encima. En data/levels.js:
//   movers: [{ x, y, w, path: [[dx, dy], ...], speed, pause }]
// (x, y) = tile de la esquina superior izquierda (se pisa su cara de arriba), w = ancho
// en tiles, path = puntos de paso relativos al inicio (en tiles), speed en px/s y pause
// = segundos de espera en cada extremo.
export class Mover {
  constructor(game, room, def) {
    this.game = game;
    this.def = def;
    this.w = (def.w ?? 3) * TILE;
    this.h = 10;
    const x0 = def.x * TILE, y0 = def.y * TILE;
    this.points = [[0, 0], ...(def.path ?? [[4, 0]])].map(([dx, dy]) => [x0 + dx * TILE, y0 + dy * TILE]);
    this.x = x0; this.y = y0;
    this.seg = 0; this.dir = 1; this.wait = def.pause ?? 0.6;
    this.platform = { x: this.x, y: this.y, w: this.w, dx: 0, dy: 0 };
    this.world = room.world;
    this.world.platforms.push(this.platform);
    this.spr = canvasSprite(game, this.w, 18, 3);
    this.t = Math.random() * 3;
  }

  update(dt) {
    this.t += dt;
    let nx = this.x, ny = this.y;
    if (this.wait > 0) this.wait -= dt;
    else {
      const to = this.points[this.seg + this.dir] ?? null;
      if (!to) { this.dir *= -1; this.wait = this.def.pause ?? 0.6; }
      else {
        const dx = to[0] - this.x, dy = to[1] - this.y, d = Math.hypot(dx, dy), step = (this.def.speed ?? 40) * dt;
        if (d <= step) { nx = to[0]; ny = to[1]; this.seg += this.dir; if (!this.points[this.seg + this.dir]) { this.dir *= -1; this.wait = this.def.pause ?? 0.6; } }
        else { nx += (dx / d) * step; ny += (dy / d) * step; }
      }
    }
    this.platform.dx = nx - this.x;
    this.platform.dy = ny - this.y;
    this.x = nx; this.y = ny;
    this.platform.x = nx; this.platform.y = ny;
    this.#draw();
    this.spr.place(this.x, this.y - 2);
  }

  #draw() {
    const { g, gl } = this.spr, w = this.w;
    g.clearRect(0, 0, w, 18);
    gl.clearRect(0, 0, w, 18);
    // Losa de músculo con la cara de arriba clara y raíces que cuelgan y se mecen.
    for (let x = 0; x < w; x += 5) blob(g, x + 3, 5, 4, 3.5, x % 10 ? '#8a3044' : '#a03a50', K, '#d07088');
    for (let x = 3; x < w - 2; x += 7) {
      const sw = Math.sin(this.t * 3 + x) * 1.5;
      seg(g, x, 8, x + sw, 14 + (x % 3), '#5a1a28');
    }
    for (let x = 2; x < w - 2; x += 9) px(gl, x, 7, '#3a0a14', 2, 1);
    this.spr.commit();
  }

  dispose() {
    const pl = this.world.platforms;
    pl.splice(pl.indexOf(this.platform), 1);
    this.spr.dispose();
  }
}

// ---------------------------------------------------------------------------
// Membrana fotosensible animada. No cambia de golpe: con la luz se tensa, tiembla y
// sus receptores se encienden; al abrirse, el tejido se deshace desde el centro hacia
// la pared siguiendo un patrón orgánico (hebras que aguantan más, un borde húmedo que
// brilla) y al cerrarse vuelve a crecer desde los bordes. Game decide cuándo se abre
// (m.open); aquí se anima su apertura m.k (0..1) y se avisa cuando el paso cambia.
const lattice = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 974634) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function smoothNoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = lattice(xi, yi, s), b = lattice(xi + 1, yi, s), c = lattice(xi, yi + 1, s), d = lattice(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class PhotoMembrane {
  constructor(game, room, m, tex) {
    this.game = game;
    this.m = m;
    m.k = m.open ? 1 : 0;
    const W = tex.canvas.width, H = tex.canvas.height;
    this.W = W; this.H = H; this.x = tex.x; this.y = tex.y;
    this.base = tex.canvas.getContext('2d').getImageData(0, 0, W, H);
    // Orden en que se deshace cada píxel: ruido suave + distancia al borde del grupo
    // (lo del centro se va antes) + hebras que aguantan más.
    const inside = new Set(m.cells.map(([x, y]) => `${x},${y}`));
    const solidAround = (tx, ty) => !inside.has(`${tx},${ty}`);
    this.keep = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      // Distancia (px) al borde de la membrana que toca otra cosa.
      let dEdge = 99;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let d = 0, px0 = x, py0 = y;
        while (d < 24) {
          px0 += dx; py0 += dy; d++;
          const tx = Math.floor((this.x + px0) / TILE), ty = Math.floor((this.y + py0) / TILE);
          if (px0 < 0 || py0 < 0 || px0 >= W || py0 >= H || solidAround(tx, ty)) break;
        }
        dEdge = Math.min(dEdge, d);
      }
      const center = Math.min(1, dEdge / 10);
      const n = smoothNoise(x / 5, y / 5, 3) * 0.6 + smoothNoise(x / 2, y / 2, 4) * 0.4;
      const fiber = smoothNoise(x / 1.5, y / 9, 7) > 0.78 ? 0.22 : 0; // hebras verticales
      this.keep[y * W + x] = Math.min(1, n * 0.55 + (1 - center) * 0.45 + fiber);
    }
    this.spr = canvasSprite(game, W, H, 1);
    this.spr.place(this.x, this.y);
    this.out = this.spr.g.createImageData(W, H);
    this.t = 0;
    this.lastK = -1;
  }

  // Devuelve true si el paso cambió (para actualizar sombras y colisión).
  update(dt, chargeK) {
    const m = this.m;
    this.t += dt;
    const target = m.open ? 1 : 0;
    m.k += Math.sign(target - m.k) * Math.min(Math.abs(target - m.k), dt * (m.open ? 1.6 : 1.1));
    const tremble = !m.open && chargeK > 0;
    if (Math.abs(m.k - this.lastK) > 0.002 || tremble || m.k > 0 && m.k < 1) this.#draw(chargeK, tremble);
    this.lastK = m.k;
  }

  #draw(chargeK, tremble) {
    const { W, H, base } = this, d = this.out.data, b = base.data, k = this.m.k;
    const gl = this.spr.gl;
    gl.clearRect(0, 0, W, H);
    // Umbral: por debajo de él, el tejido ya se ha ido. Un pulso lo hace respirar.
    const thr = k * 1.12 - 0.06 + Math.sin(this.t * 6) * 0.01 * (k > 0 && k < 1 ? 1 : 0);
    const jx = tremble ? Math.round(Math.sin(this.t * 40) * chargeK) : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, sx = Math.max(0, Math.min(W - 1, x + jx)), si = (y * W + sx) * 4;
      const kp = this.keep[y * W + x];
      if (kp < thr) { d[i + 3] = 0; continue; }
      let r = b[si], g = b[si + 1], bl = b[si + 2];
      const edge = kp - thr;
      if (k > 0 && edge < 0.05) { r = 230; g = 120; bl = 150; if (edge < 0.02) { r = 255; g = 190; bl = 205; } } // borde húmedo
      else if (k > 0 && edge < 0.12) { r *= 0.65; g *= 0.5; bl *= 0.55; } // el tejido se oscurece al retraerse
      d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = 255;
      if (k > 0 && edge < 0.03 && (x + y) % 2 === 0) { gl.fillStyle = '#ff5a8a'; gl.fillRect(x, y, 1, 1); }
    }
    // Receptores: se encienden al cargar la luz (y laten).
    if (!this.m.open && chargeK > 0) {
      for (let y = 2; y < H; y += 7) for (let x = 3; x < W; x += 6) {
        if (lattice(x, y, 9) < 0.5) continue;
        gl.fillStyle = `rgba(255,${200 + Math.round(chargeK * 55)},220,${0.25 + chargeK * 0.6 * (0.7 + 0.3 * Math.sin(this.t * 12 + x))})`;
        gl.fillRect(x + jx, y, 2, 1);
      }
    }
    this.spr.g.putImageData(this.out, 0, 0);
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// ---------------------------------------------------------------------------
// Fauces: los colmillos de marfil de las púas (^) y del fondo del abismo (v). Una pieza
// por tramo horizontal; se flexionan despacio, la encía respira y se agitan cuando te
// acercas. Se repintan a 12 fps, como el resto del pixel art animado.
const FANG_FPS = 12;
const FANG_TOP = 4; // margen sobre el tile: los colmillos del abismo asoman por encima
export class Fangs {
  constructor(game, kind, row, x0, x1) {
    this.game = game;
    this.kind = kind;
    this.row = row;
    this.x0 = x0;
    this.n = x1 - x0 + 1;
    this.W = this.n * TILE;
    this.H = TILE + FANG_TOP;
    this.spr = canvasSprite(game, this.W, this.H, 2);
    this.spr.place(x0 * TILE, row * TILE - FANG_TOP);
    this.t = Math.random() * 10;
    this.acc = 1;
    this.near = 0;
  }

  update(dt) {
    this.t += dt;
    const p = this.game.player;
    const cx = this.x0 * TILE + this.W / 2, cy = (this.row + 0.5) * TILE;
    const d = Math.max(0, Math.abs(p.cx - cx) - this.W / 2) + Math.max(0, Math.abs(p.cy - cy) - TILE);
    const want = d < 3 * TILE ? 1 - d / (3 * TILE) : 0;
    this.near += (want - this.near) * Math.min(1, dt * 4);
    this.acc += dt;
    if (this.acc < 1 / FANG_FPS) return;
    this.acc = 0;
    const { g, gl } = this.spr;
    g.clearRect(0, 0, this.W, this.H);
    gl.clearRect(0, 0, this.W, this.H);
    for (let i = 0; i < this.n; i++) paintFangTile(g, gl, this.kind, this.x0 + i, this.row, i * TILE, FANG_TOP, this.t, this.near);
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// Tramos de colmillos de una sala.
export function buildFangs(game, world) {
  const out = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const c = world.get(x, y);
      if (c !== '^' && c !== 'v') continue;
      let e = x;
      while (e + 1 < world.w && world.get(e + 1, y) === c) e++;
      out.push(new Fangs(game, c, y, x, e));
      x = e;
    }
  }
  return out;
}
