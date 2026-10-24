import { TILE, overlap } from '../core/Physics.js';
import { canvasSprite } from './Puzzles.js';
import { px, seg } from './Rig.js';

// Trampas y corrientes de las salas. En data/levels.js:
//
//   traps: [{ x, y, n, dir, len, period, phase }]
//          Empalizada de hueso astillado (Territorio del Hueso). (x, y) es el primer
//          tile de aire junto a la superficie de la que brota; ocupa `n` tiles a lo
//          largo de ella y crece `len` tiles hacia `dir` ('up' desde el suelo, 'down'
//          desde el techo, 'left'/'right' desde una pared). Sin `period` salta cuando
//          te acercas (tras un aviso: tiembla, suelta polvo y asoman las puntas); con
//          `period` salta a ritmo. Al brotar, las puntas se astillan y salen volando.
//
//   winds: [{ x, y, w, h, dir, force, period, phase }]
//          Corriente de aire (Cavidad Pulmonar) en el rectángulo de tiles x, y, w, h.
//          dir 'up' te eleva (con `force` de empuje); 'left'/'right' sopla de lado;
//          'swap' sopla de lado y cambia de sentido cada medio `period`. Se reconoce
//          por un rastro tenue de vetas y esporas que siguen el aire.

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// Rotación del lienzo (pintado siempre hacia arriba) para cada dirección.
const ROT = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
const R = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Empalizada de hueso astillado.
const WARN = 0.5, THRUST = 0.07, HOLD = 0.55, RETRACT = 0.5, REST = 1.1;
const BASE = 4; // px del lienzo enterrados en la superficie

export class BoneTrap {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    const n = def.n ?? 2, len = def.len ?? 2.5;
    this.dir = def.dir ?? 'up';
    [this.dx, this.dy] = DIRS[this.dir];
    this.W = n * TILE;
    this.L = Math.round(len * TILE);
    this.H = this.L + BASE;
    // Estacas: dos o tres por tile, de alturas y grosores distintos.
    this.stakes = [];
    for (let x = 1; x < this.W - 4; x += 5 + Math.floor(Math.random() * 3)) {
      this.stakes.push({ x, w: 4 + Math.floor(Math.random() * 3), h: R(0.55, 1), lean: R(-0.15, 0.15), crack: Math.random() < 0.6, side: Math.random() < 0.5 ? -1 : 1 });
    }
    // Rectángulo de mundo que ocupa la empalizada desplegada (sin la base).
    const sx = def.x * TILE, sy = def.y * TILE;
    if (this.dir === 'up') this.area = { x: sx, y: sy + TILE - this.L, w: this.W, h: this.L };
    else if (this.dir === 'down') this.area = { x: sx, y: sy, w: this.W, h: this.L };
    else if (this.dir === 'right') this.area = { x: sx, y: sy, w: this.L, h: this.W };
    else this.area = { x: sx + TILE - this.L, y: sy, w: this.L, h: this.W };
    // La raíz: la línea de la superficie de la que brota.
    this.root = this.dir === 'up' ? sy + TILE : this.dir === 'down' ? sy : this.dir === 'right' ? sx : sx + TILE;
    this.spr = canvasSprite(game, this.W, this.H, 2);
    const a = this.area;
    const cx = a.x + a.w / 2 - this.dx * BASE / 2, cy = a.y + a.h / 2 - this.dy * BASE / 2;
    this.spr.place(cx - this.W / 2, cy - this.H / 2);
    this.spr.mesh.rotation.z = this.spr.glow.rotation.z = ROT[this.dir];
    this.state = 'idle';
    this.t = def.period ? ((def.phase ?? 0) % def.period) : 0;
    this.k = 0; // despliegue 0..1
    this.acc = 1;
    this.hitDone = false;
  }

  // Rectángulo de lo que ya ha brotado (k: despliegue).
  #reach(k) {
    const a = this.area, d = this.L * k;
    if (this.dir === 'up') return { x: a.x, y: this.root - d, w: a.w, h: d };
    if (this.dir === 'down') return { x: a.x, y: this.root, w: a.w, h: d };
    if (this.dir === 'right') return { x: this.root, y: a.y, w: d, h: a.h };
    return { x: this.root - d, y: a.y, w: d, h: a.h };
  }

  #center() { const a = this.area; return { x: a.x + a.w / 2, y: a.y + a.h / 2 }; }

  update(dt) {
    const g = this.game, p = g.player, d = this.def;
    this.t += dt;
    const next = (s) => { this.state = s; this.t = 0; };
    if (d.period) {
      // A ritmo: aviso, golpe, aguante, recogida y espera hasta el siguiente ciclo.
      const ph = ((this.t % d.period) + d.period) % d.period;
      const lead = d.period - (WARN + THRUST + HOLD + RETRACT);
      const s = ph < lead ? 'idle' : ph < lead + WARN ? 'warn' : ph < lead + WARN + THRUST ? 'thrust' : ph < lead + WARN + THRUST + HOLD ? 'hold' : 'retract';
      if (s !== this.state) this.#enter(s);
      this.state = s;
      this.st = ph - (s === 'idle' ? 0 : s === 'warn' ? lead : s === 'thrust' ? lead + WARN : s === 'hold' ? lead + WARN + THRUST : lead + WARN + THRUST + HOLD);
    } else {
      this.st = this.t;
      if (this.state === 'idle') {
        // Salta si pisas su sombra: el tramo de delante, con un tile de margen.
        const a = this.area, m = TILE;
        if (!g.state.dead && overlap(p, { x: a.x - m, y: a.y - m, w: a.w + 2 * m, h: a.h + 2 * m })) { next('warn'); this.#enter('warn'); }
      } else if (this.state === 'warn' && this.t >= WARN) { next('thrust'); this.#enter('thrust'); }
      else if (this.state === 'thrust' && this.t >= THRUST) next('hold');
      else if (this.state === 'hold' && this.t >= HOLD) next('retract');
      else if (this.state === 'retract' && this.t >= RETRACT) next('rest');
      else if (this.state === 'rest' && this.t >= REST) next('idle');
    }
    const s = this.state, st = this.st;
    this.k = s === 'warn' ? 0.08 + Math.sin(st * 60) * 0.03
      : s === 'thrust' ? Math.min(1, st / THRUST)
        : s === 'hold' ? 1
          : s === 'retract' ? 1 - Math.min(1, st / RETRACT) : 0;
    if (s === 'warn' && Math.random() < 0.5) this.#dust(0.4);
    // Brotada, te ensarta y te lanza en su dirección.
    if ((s === 'thrust' || s === 'hold') && !this.hitDone && p.invuln <= 0 && overlap(p, this.#reach(this.k))) {
      this.hitDone = true;
      const c = this.#center();
      g.hurtPlayer(d.damage ?? 14, this.dx ? c.x : null, 'una empalizada de hueso');
      if (this.dy) p.vy = this.dy * 330;
      if (this.dx) { p.vx = this.dx * 240; p.vy = -150; }
    }
    this.#paint(dt);
  }

  #enter(s) {
    const g = this.game, c = this.#center();
    if (s === 'warn') {
      this.hitDone = false;
      g.audio.play('boneCreak', c);
    } else if (s === 'thrust') {
      g.audio.play('stakes', c);
      g.shake = Math.max(g.shake, 2.5);
      this.#dust(1);
      // Las criaturas que estén encima también se ensartan.
      const r = this.#reach(1);
      for (const e of this.room.enemies) if (e.alive && overlap(e, r)) e.hurt(18, 'trap', false, c);
      // Las puntas se astillan y salen despedidas hacia delante, en abanico.
      const n = Math.max(2, Math.round(this.W / TILE * 1.5));
      for (let i = 0; i < n; i++) {
        const along = R(0.1, 0.9);
        const ox = this.dy ? this.area.x + this.area.w * along : this.root + this.dx * this.L;
        const oy = this.dx ? this.area.y + this.area.h * along : this.root + this.dy * this.L;
        const sp = R(170, 260), spread = R(-0.5, 0.5);
        const vx = this.dx ? this.dx * sp : Math.sin(spread) * sp;
        const vy = this.dy ? this.dy * sp * Math.cos(spread) : -R(60, 140);
        g.spawnProjectile({ x: ox - 2, y: oy - 2, w: 4, h: 4, vx, vy, life: 1.6, damage: this.def.shardDamage ?? 6, kind: 'stakeShard', owner: 'enemy', color: '#e8dcc0', glow: [0.9, 0.8, 0.6] });
      }
    }
  }

  // Polvo de hueso que sale de la junta.
  #dust(amount) {
    const g = this.game;
    const n = Math.ceil(amount * 4);
    for (let i = 0; i < n; i++) {
      const along = Math.random();
      const x = this.dy ? this.area.x + this.area.w * along : this.root;
      const y = this.dx ? this.area.y + this.area.h * along : this.root;
      g.particles.emit(x, y, { vx: this.dx * 40 + R(-25, 25), vy: this.dy * 40 + R(-30, 5), life: R(0.3, 0.6), gravity: 300, color: [0.82, 0.74, 0.6] });
    }
  }

  // Pinta las estacas hacia arriba en su lienzo (el mesh lo gira a su dirección).
  #paint(dt) {
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const { g, gl } = this.spr, W = this.W, H = this.H, k = this.k;
    g.clearRect(0, 0, W, H);
    gl.clearRect(0, 0, W, H);
    const ground = H - BASE; // y de la superficie en el lienzo
    const near = this.state === 'warn';
    // La junta: una costura de hueso roto, con las puntas asomando apenas.
    for (let x = 0; x < W; x++) {
      px(g, x, ground, (x * 7) % 5 === 0 ? '#3a1a12' : '#5a3424');
      if ((x * 13) % 9 === 0) px(g, x, ground + 1, '#2a120c');
    }
    for (const s of this.stakes) {
      const top = Math.max(2, Math.round(s.h * this.L * k)), show = Math.max(top, near ? 3 : 2);
      const x0 = s.x + (near ? Math.round(Math.sin(this.t * 70 + s.x) * 0.6) : 0);
      const tipX = x0 + Math.round(s.lean * show);
      // Tallo: marfil con la cara en sombra; base teñida de sangre seca.
      seg(g, x0 + s.w / 2, ground + BASE - 1, tipX + s.w / 2, ground - show + 3, '#140c10', s.w + 2);
      seg(g, x0 + s.w / 2, ground + BASE - 1, tipX + s.w / 2, ground - show + 3, '#d8c8a8', s.w);
      seg(g, x0 + s.w - 1, ground + BASE - 1, tipX + s.w - 1, ground - show + 3, '#9a8668', 1);
      if (show > 8) seg(g, x0 + s.w / 2, ground, x0 + s.w / 2, ground - Math.min(show, 10) + 4, '#6a2a1c', 1);
      // Punta astillada: un diente largo y otro corto, rotos en bisel.
      const ty = ground - show + 2;
      px(g, tipX, ty - 1, '#140c10', s.w, 1);
      px(g, tipX, ty, '#f0e6d0', s.w - 1, 2);
      px(g, tipX + 1, ty - 4, '#140c10', 2, 4);
      px(g, tipX + 1, ty - 3, '#fff6e0', 1, 3);
      px(g, tipX + s.w - 2, ty - 2, '#e8dcc0', 1, 2);
      // Astilla lateral desprendida y grietas con la médula a la vista.
      if (show > 12) {
        const sy = ground - Math.round(show * 0.62), sx = s.side < 0 ? x0 - 1 : x0 + s.w;
        px(g, sx, sy, '#d8c8a8', 1, 3); px(g, sx + s.side, sy - 2, '#f0e6d0', 1, 2);
      }
      if (s.crack && show > 10) { px(g, x0 + 1, ground - Math.round(show * 0.45), '#3a1a12', 1, 4); px(g, x0 + 2, ground - Math.round(show * 0.45) + 1, '#8a2a1c', 1, 2); }
      if (k > 0.5) px(gl, tipX, ground - show, 'rgba(255,220,180,0.35)', s.w, 2);
    }
    // Aviso: la junta enrojece y late.
    if (near) for (let x = 0; x < W; x += 2) px(gl, x, ground - 1, `rgba(255,90,60,${0.25 + 0.2 * Math.sin(this.t * 40)})`, 2, 2);
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// ---------------------------------------------------------------------------
// Corriente de aire: lateral (fija o que cambia de sentido) o vertical (te eleva).
const RISE_MAX = 230; // velocidad máxima de subida en una corriente vertical
const LIFT_FADE = TILE * 2; // la corriente se apaga en lo alto: ahí flotas

export class Wind {
  constructor(game, room, def) {
    this.game = game;
    this.def = def;
    this.dir = def.dir ?? 'up';
    this.rect = { x: def.x * TILE, y: def.y * TILE, w: def.w * TILE, h: def.h * TILE };
    this.force = def.force ?? (this.dir === 'up' ? 1500 : 125);
    this.period = def.period ?? 5;
    this.t = def.phase ?? 0;
    this.k = 0; // intensidad con signo (lateral) o 0..1 (vertical)
    this.power = 1; // 0..1: cuánto sopla ahora (los bufadores la encienden y apagan)
    this.prevSign = 0;
    this.spr = canvasSprite(game, this.rect.w, this.rect.h, 1);
    this.spr.place(this.rect.x, this.rect.y);
    this.spr.mesh.visible = false; // solo pinta en la capa de brillo
    // Vetas y esporas que siguen el aire.
    const n = Math.round((def.w * def.h) / 2.2);
    this.streaks = Array.from({ length: n }, () => this.#spawn(true));
    this.acc = 1;
  }

  #spawn(anywhere) {
    const r = this.rect, up = this.dir === 'up';
    return {
      x: Math.random() * r.w, y: Math.random() * r.h,
      len: R(4, 11), a: R(0.06, 0.2), sp: R(0.6, 1.3), ph: Math.random() * 6.28,
      mote: Math.random() < 0.25, anywhere, up,
    };
  }

  // Sentido del aire ahora: -1..1 lateral; 0..1 vertical.
  #strength() {
    const d = this.dir;
    if (d === 'up' || d === 'down') return 1;
    if (d === 'left') return -1;
    if (d === 'right') return 1;
    // 'swap': mesetas largas y un cambio suave (con un respiro de calma en medio).
    const s = Math.sin((this.t / this.period) * Math.PI * 2) * 1.7;
    return Math.max(-1, Math.min(1, s));
  }

  update(dt) {
    const g = this.game, p = g.player, r = this.rect;
    this.t += dt;
    this.k = this.#strength() * this.power;
    // Al cambiar de sentido, una ráfaga que se oye.
    const sign = Math.abs(this.k) > 0.5 ? Math.sign(this.k) : 0;
    if (this.dir === 'swap' && sign && sign !== this.prevSign) g.audio.play('gust', { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    if (sign) this.prevSign = sign;
    // Empuje sobre el jugador (Player lo consume en su próximo paso).
    if (overlap(p, r) && !p.rope && this.power > 0.05) {
      if (this.dir === 'up') {
        const depth = Math.min(1, Math.max(0, (p.y + p.h - r.y) / LIFT_FADE));
        p.lift = Math.max(p.lift ?? 0, this.force * depth * this.power);
        p.riseMax = this.def.rise ?? RISE_MAX; // rise: subida más lenta (p. ej. para pararte a media corriente)
      } else if (this.dir === 'down') {
        p.vy = Math.min(Math.max(p.vy, 0) + this.force * this.power * dt, 420); // te aplasta hacia abajo
      } else {
        p.windX = (p.windX ?? 0) + this.force * this.k;
      }
    }
    this.#paint(dt);
  }

  #paint(dt) {
    const r = this.rect, vert = this.dir === 'up' || this.dir === 'down', sgn = this.dir === 'down' ? -1 : 1;
    const flow = vert ? 1 : this.k;
    for (const s of this.streaks) {
      const v = (vert ? 90 : 160) * s.sp;
      if (vert) { s.y -= v * sgn * dt; s.x += Math.sin(this.t * 2 + s.ph) * 6 * dt; }
      else { s.x += v * flow * dt; s.y += Math.sin(this.t * 3 + s.ph) * 4 * dt; }
      if (s.x < -12 || s.x > r.w + 12 || s.y < -12 || s.y > r.h + 12) {
        Object.assign(s, this.#spawn(false));
        if (vert) s.y = sgn > 0 ? r.h + R(0, 6) : -R(0, 6);
        else s.x = flow > 0 ? -R(0, 8) : r.w + R(0, 8);
      }
    }
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const { gl } = this.spr;
    gl.clearRect(0, 0, r.w, r.h);
    const calm = vert ? this.power : Math.min(1, Math.abs(flow) * 1.4);
    for (const s of this.streaks) {
      // Se desvanece en los bordes de la corriente: no se ve el rectángulo.
      const ex = Math.min(s.x, r.w - s.x) / 24, ey = Math.min(s.y, r.h - s.y) / 24;
      const edge = Math.max(0, Math.min(1, ex, ey));
      const a = s.a * edge * calm;
      if (a < 0.02) continue;
      if (s.mote) { px(gl, s.x, s.y, `rgba(200,255,235,${a * 1.6})`); continue; }
      const len = s.len * (vert ? 1 : 0.4 + Math.abs(flow) * 0.6);
      gl.fillStyle = `rgba(190,250,235,${a})`;
      if (vert) gl.fillRect(Math.round(s.x), Math.round(s.y), 1, Math.round(len));
      else gl.fillRect(Math.round(flow > 0 ? s.x - len : s.x), Math.round(s.y), Math.round(len), 1);
    }
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}
