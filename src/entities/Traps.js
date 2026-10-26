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

// ---------------------------------------------------------------------------
// Trampas de derrumbe del Territorio del Hueso. En data/worlds/*.js, por sala:
//
//   slabs:   [{ x, y, w, delay, regrow }]  Losa de hueso quebradiza: ocupa w tiles de la
//            fila y (es suelo). Al pisarla cruje y se agrieta (las grietas enrojecen) y a
//            `delay` s (0,5) se parte y cae; a `regrow` s (5) vuelve a crecer.
//   fangs:   [{ x, y, len, regrow }]  Colmillo de techo: estalactita de hueso que cuelga
//            del techo sobre el tile (x, y), de `len` tiles. Si pasas por debajo tiembla,
//            se desprende y cae (hiere a lo que pille, también a las criaturas), se hace
//            añicos contra el suelo y vuelve a crecer a `regrow` s (4).
//   pillars: [{ x, y, h, fall, hits }]  Pilar de hueso quebradizo: columna de h tiles
//            cuya base es el tile (x, y). Bloquea el paso; tras `hits` golpes (4) se
//            agrieta del todo y se derrumba hacia `fall` ('left'/'right'), quedando
//            tumbado sobre la fila y como un puente. Queda así para siempre.
//   stacks:  [{ x, y, w, max, hold, period }]  Tolva de huesos: cuelga del techo sobre las
//            columnas x..x+w-1 (w: 2). Al golpearla (a tiros o cuerpo a cuerpo; con `period`,
//            sola a ese ritmo) suelta un fardo de huesos que cae y se apila sobre el suelo
//            de la fila y: cada fardo es una casilla más de altura, hasta `max` (4). Las
//            criaturas que pille debajo se llevan el golpe; a ti te sube con la torre. A
//            `hold` s (8) del último fardo cruje, enrojece y se desmorona entero.
const BONE = { out: '#140c08', dark: '#6e5a42', mid: '#b8a07a', light: '#e2d0aa', hl: '#f6ead0', crack: '#3a1a10', blood: '#8a2a1c' };
const stand = (p, x, y, w) => p.x + p.w > x + 1 && p.x < x + w - 1 && Math.abs(p.y + p.h - y) < 3;

export class BoneSlab {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.x = def.x * TILE; this.y = def.y * TILE;
    this.w = (def.w ?? 2) * TILE; this.h = TILE;
    this.cells = Array.from({ length: def.w ?? 2 }, (_, i) => [def.x + i, def.y]);
    this.state = 'solid';
    this.t = 0;
    this.k = 0;                 // grietas 0..1
    this.dropY = 0; this.dropV = 0; this.rot = 0;
    this.spr = canvasSprite(game, this.w, this.h + 2, 2);
    this.#solid(true);
    this.acc = 1;
    this.seed = Math.random() * 100;
  }

  #solid(on) { for (const [x, y] of this.cells) this.room.world.set(x, y, on ? 'D' : '.'); }

  update(dt) {
    const g = this.game, p = g.player, d = this.def;
    this.t += dt;
    if (this.state === 'solid') {
      if (stand(p, this.x, this.y, this.w) && p.onGround) { this.state = 'crack'; this.t = 0; g.audio.play('boneCreak', { x: this.x + this.w / 2, y: this.y }); }
    } else if (this.state === 'crack') {
      this.k = Math.min(1, this.t / (d.delay ?? 0.5));
      if (Math.random() < 0.6) g.particles.emit(this.x + Math.random() * this.w, this.y + TILE, { vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 30, life: 0.5, gravity: 300, color: [0.82, 0.74, 0.6] });
      if (this.t >= (d.delay ?? 0.5)) {
        // Se parte: deja de ser suelo y cae dando vueltas.
        this.state = 'fall'; this.t = 0; this.dropY = 0; this.dropV = 30; this.rot = 0;
        this.#solid(false);
        g.audio.play('crunch', { x: this.x + this.w / 2, y: this.y });
        g.shake = Math.max(g.shake, 1.5);
        for (let i = 0; i < 10; i++) g.particles.emit(this.x + Math.random() * this.w, this.y + 4, { vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 40, life: 0.6, gravity: 500, color: [0.85, 0.78, 0.62] });
      }
    } else if (this.state === 'fall') {
      this.dropV += 900 * dt; this.dropY += this.dropV * dt; this.rot += dt * (this.seed % 2 > 1 ? 1.4 : -1.4);
      if (this.t > 1.2) { this.state = 'gone'; this.t = 0; }
    } else if (this.state === 'gone') {
      if (this.t >= (d.regrow ?? 5) && !overlap(p, this)) { this.state = 'grow'; this.t = 0; this.k = 0; this.dropY = 0; this.rot = 0; }
    } else if (this.state === 'grow') {
      if (this.t >= 0.6) {
        if (overlap(p, this)) return;                                     // no te encierra dentro
        this.state = 'solid'; this.t = 0; this.k = 0; this.#solid(true);
      }
    }
    // Sprite: en su sitio; al caer, baja y gira.
    const m = this.spr.mesh, gm = this.spr.glow;
    this.spr.place(this.x, this.y + this.dropY);
    m.rotation.z = gm.rotation.z = this.state === 'fall' ? this.rot * 0.4 : 0;
    m.visible = gm.visible = this.state !== 'gone';
    const sc = this.state === 'grow' ? Math.min(1, this.t / 0.6) : 1;
    m.scale.set(sc, 1, 1); gm.scale.set(sc, 1, 1);
    this.#paint(dt);
  }

  #paint(dt) {
    this.acc += dt;
    if (this.acc < 1 / 20) return;
    this.acc = 0;
    const { g, gl } = this.spr, W = this.w, H = this.h + 2, k = this.state === 'fall' ? 1 : this.k, t = this.t;
    g.clearRect(0, 0, W, H); gl.clearRect(0, 0, W, H);
    const shake = this.state === 'crack' ? Math.round(Math.sin(t * 70) * k) : 0;
    // Losa: hueso plano con la cara de arriba clara, el canto en sombra y poros.
    for (let x = 0; x < W; x++) {
      const top = (x === 0 || x === W - 1) ? 2 : 0;
      for (let y = top; y < H - 1; y++) {
        let c = y === top ? BONE.out : y < 3 ? BONE.hl : y < 6 ? BONE.light : y < 11 ? BONE.mid : y < H - 2 ? BONE.dark : BONE.out;
        if (x === 0 || x === W - 1) c = BONE.out;
        if (((x * 7 + y * 3 + Math.floor(this.seed)) % 23) === 0 && y > 3 && y < H - 3) c = BONE.dark;
        px(g, x + shake, y, c);
      }
    }
    // Grietas: se abren desde el centro y enrojecen; al partirse, la losa en tres trozos.
    if (k > 0) {
      for (const cx of [W * 0.33, W * 0.66]) {
        let x = cx + Math.sin(this.seed) * 3;
        for (let y = 1; y < H - 1; y++) {
          if (y / H > k * 1.2) break;
          x += Math.sin(y * 1.7 + this.seed) * 0.8;
          px(g, x + shake, y, BONE.crack);
          if (k > 0.4) { px(g, x + shake + 1, y, BONE.blood); px(gl, x + shake, y, `rgba(255,80,50,${0.3 * k})`); }
          if (this.state === 'fall') px(g, x + shake + 1, y, 'rgba(0,0,0,0)');
        }
      }
    }
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

export class BoneFang {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.cx = def.x * TILE + 8;
    this.top = def.y * TILE;
    this.L = Math.round((def.len ?? 2) * TILE);
    this.state = 'hang';
    this.t = 0;
    this.y = this.top; this.vy = 0;
    this.grow = 1;
    this.spr = canvasSprite(game, 12, this.L, 2);
    this.acc = 1;
  }

  get rect() { return { x: this.cx - 4, y: this.y, w: 8, h: this.L * this.grow }; }

  update(dt) {
    const g = this.game, p = g.player, d = this.def, w = this.room.world;
    this.t += dt;
    if (this.state === 'hang') {
      // Pasas por debajo: tiembla y suelta polvo.
      const below = Math.abs(p.cx - this.cx) < 18 && p.y > this.top && p.y - this.top < 13 * TILE;
      if (below && !g.state.dead && w.lineOfSight(this.cx, this.top + this.L + 2, p.cx, p.y + 2)) { this.state = 'shake'; this.t = 0; g.audio.play('boneCreak', { x: this.cx, y: this.top }); }
    } else if (this.state === 'shake') {
      if (Math.random() < 0.5) g.particles.emit(this.cx + (Math.random() - 0.5) * 8, this.top + 2, { vx: (Math.random() - 0.5) * 20, vy: 30, life: 0.5, gravity: 300, color: [0.82, 0.74, 0.6] });
      if (this.t >= (d.warn ?? 0.45)) { this.state = 'fall'; this.t = 0; this.vy = 40; }
    } else if (this.state === 'fall') {
      this.vy = Math.min(520, this.vy + 1100 * dt);
      this.y += this.vy * dt;
      const r = this.rect;
      if (p.invuln <= 0 && overlap(p, r)) g.hurtPlayer(d.damage ?? 16, null, 'un colmillo de hueso');
      for (const e of this.room.enemies) if (e.alive && !e.fangHit && overlap(e, r)) { e.fangHit = true; e.hurt(20, 'trap', false, { x: this.cx, y: r.y + r.h }); }
      // Choca con el suelo (o se sale de la sala): se hace añicos.
      if (w.solidAtPx(this.cx, this.y + this.L) || this.y > w.pixelH) {
        this.state = 'gone'; this.t = 0;
        g.audio.play('crunch', { x: this.cx, y: this.y + this.L });
        g.shake = Math.max(g.shake, 2.5);
        for (let i = 0; i < 14; i++) g.particles.emit(this.cx + (Math.random() - 0.5) * 10, this.y + this.L - 2, { vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, life: 0.7, gravity: 700, color: Math.random() < 0.5 ? [0.9, 0.84, 0.7] : [0.6, 0.5, 0.38] });
        for (const e of this.room.enemies) e.fangHit = false;
      }
    } else if (this.state === 'gone') {
      if (this.t >= (d.regrow ?? 4)) { this.state = 'grow'; this.t = 0; this.y = this.top; this.grow = 0; }
    } else if (this.state === 'grow') {
      this.grow = Math.min(1, this.t / 1.2);
      if (this.grow >= 1) { this.state = 'hang'; this.t = 0; }
    }
    const sh = this.state === 'shake' ? Math.sin(this.t * 60) * 1 : 0;
    this.spr.place(this.cx - 6 + sh, this.y);
    this.spr.mesh.visible = this.spr.glow.visible = this.state !== 'gone';
    this.#paint(dt);
  }

  #paint(dt) {
    this.acc += dt;
    if (this.acc < 1 / 20) return;
    this.acc = 0;
    const { g, gl } = this.spr, L = this.L, len = Math.max(2, Math.round(L * this.grow));
    g.clearRect(0, 0, 12, L); gl.clearRect(0, 0, 12, L);
    // Raíz rota en el techo y colmillo afilado hacia abajo, con su luz a la izquierda.
    for (let y = 0; y < len; y++) {
      const u = y / L, hw = Math.max(0.5, 5 * (1 - u) ** 0.8);
      for (let x = -Math.ceil(hw) - 1; x <= hw + 1; x++) {
        const q = x / hw;
        const c = Math.abs(q) > 1 ? BONE.out : q < -0.4 ? BONE.hl : q < 0.2 ? BONE.light : q < 0.7 ? BONE.mid : BONE.dark;
        px(g, 6 + x, y, c);
      }
      if (y % 7 === 3 && hw > 2) px(g, 6, y, BONE.crack);
    }
    if (this.state === 'shake') for (let y = 0; y < 4; y++) px(gl, 4, y, 'rgba(255,90,60,0.5)', 4, 1);
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

export class BonePillar {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.hN = def.h ?? 4;
    this.dir = def.fall === 'left' ? -1 : 1;
    this.key = `pillar:${room.id}:${def.x},${def.y}`;
    this.x = def.x * TILE; this.y = (def.y - this.hN + 1) * TILE; this.w = TILE; this.h = this.hN * TILE;
    this.cracks = 0;
    this.k = game.state.flags.has(this.key) ? 1 : 0;   // 0 de pie .. 1 tumbado
    this.state = this.k ? 'down' : 'up';
    this.alive = this.state === 'up';
    this.t = 0;
    this.spr = canvasSprite(game, TILE, this.h, 2);
    this.#cells();
    this.acc = 1;
    if (this.alive) room.targets.push(this);
  }

  // Ocupa la columna de pie o la fila tumbado.
  #cells() {
    const { x, y } = this.def, w = this.room.world;
    for (let i = 0; i < this.hN; i++) w.set(x, y - i, this.state === 'up' || this.state === 'topple' ? 'D' : '.');
    if (this.state === 'down') for (let i = 1; i <= this.hN; i++) w.set(x + this.dir * i, y, 'D');
  }

  hit() {
    const g = this.game;
    if (this.state !== 'up') return false;
    this.cracks++;
    this.shake = 0.2;
    g.audio.play('boneCreak', { x: this.x + 8, y: this.y + this.h / 2 });
    for (let i = 0; i < 6; i++) g.particles.emit(this.x + 8, this.y + Math.random() * this.h, { vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 40, life: 0.5, gravity: 500, color: [0.85, 0.78, 0.62] });
    if (this.cracks >= (this.def.hits ?? 4)) {
      this.state = 'topple'; this.t = 0; this.alive = false;
      g.audio.play('crunch', { x: this.x + 8, y: this.y });
    }
    return true;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.shake = Math.max(0, (this.shake ?? 0) - dt);
    if (this.state === 'topple') {
      this.k = Math.min(1, (this.t / 0.7) ** 2);
      if (this.k >= 1) {
        this.state = 'down';
        g.state.flags.add(this.key);
        this.#cells();
        g.shake = Math.max(g.shake, 6);
        g.audio.play('thump', { x: this.x + this.dir * this.h / 2, y: this.y + this.h });
        for (let i = 0; i < 24; i++) g.particles.emit(this.x + 8 + this.dir * Math.random() * this.h, (this.def.y + 1) * TILE - 2, { vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 90, life: 0.8, gravity: 600, color: [0.8, 0.72, 0.58] });
      }
    }
    // Cae girando sobre la esquina de su base, hacia su lado.
    const a = this.k * Math.PI / 2 * this.dir;
    const pivX = this.x + (this.dir > 0 ? TILE : 0), pivY = (this.def.y + 1) * TILE;
    const rx = (this.dir > 0 ? -8 : 8), ry = -this.h / 2;
    const cx = pivX + rx * Math.cos(a) - ry * Math.sin(a), cy = pivY + rx * Math.sin(a) + ry * Math.cos(a);
    const sh = this.shake > 0 ? Math.sin(this.t * 80) : 0;
    this.spr.place(cx - TILE / 2 + sh, cy - this.h / 2);
    this.spr.mesh.rotation.z = this.spr.glow.rotation.z = -a;
    this.#paint(dt);
  }

  #paint(dt) {
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    this.acc = 0;
    const { g, gl } = this.spr, H = this.h, n = this.def.hits ?? 4, k = Math.min(1, this.cracks / n);
    g.clearRect(0, 0, TILE, H); gl.clearRect(0, 0, TILE, H);
    // Columna de hueso: cilindro con anillos de vértebra y una cabeza ancha arriba.
    for (let y = 0; y < H; y++) {
      const head = y < 6 ? 1 : 0, foot = y > H - 4 ? 1 : 0;
      const hw = 6 + head * 2 + foot;
      for (let x = -hw - 1; x <= hw; x++) {
        const q = (x + 0.5) / hw;
        let c = Math.abs(q) > 1 ? BONE.out : q < -0.5 ? BONE.hl : q < 0 ? BONE.light : q < 0.55 ? BONE.mid : BONE.dark;
        if (y % 12 === 0 && Math.abs(q) < 1) c = BONE.dark;                 // anillo
        if (y % 12 === 1 && Math.abs(q) < 0.9) c = BONE.hl;
        px(g, 8 + x, y, c);
      }
    }
    // Grietas: más y más rojas cuantos más golpes lleva.
    for (let i = 0; i < Math.ceil(k * 4); i++) {
      let x = 6 + i % 3 * 2, y0 = (i * 0.27 % 1) * H;
      for (let s = 0; s < 6 + k * 10; s++) { x += Math.sin(s * 1.9 + i) * 0.9; px(g, x, y0 + s, BONE.crack); if (k > 0.5) px(gl, x, y0 + s, `rgba(255,80,50,${0.4 * k})`); }
    }
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// Tolva de huesos: suelta fardos que se apilan en una torre que te sube y luego se desmorona.
export class BoneStack {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.W = (def.w ?? 2) * TILE;
    this.max = def.max ?? 4;
    this.n = 0;                                   // fardos apilados
    this.drop = null;                             // fardo cayendo: { y, vy }
    this.queue = 0;                               // golpes pendientes (uno cae cada vez)
    this.holdT = 0;
    this.crumble = -1;                            // >= 0: desmoronándose
    this.t = 0;
    this.flash = 0;
    this.auto = def.period ?? 0;
    // La tolva cuelga del primer techo sobre la columna.
    const w = room.world;
    let ty = def.y - 1; while (ty > 0 && !w.solid(def.x, ty)) ty--;
    this.top = (ty + 1) * TILE;
    this.alive = true;
    this.x = def.x * TILE - 3; this.y = this.top; this.w = this.W + 6; this.h = 20;   // lo que se golpea
    this.hopper = canvasSprite(game, this.w, this.h, 2);
    this.pile = canvasSprite(game, this.W + 4, this.max * TILE + 2, 2);
    this.bundle = canvasSprite(game, this.W, TILE, 2);
    this.acc = 1;
    this.dirty = true;
    room.targets.push(this);
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  #row(k) { return this.def.y - k; }              // fila del fardo k (0 = el de abajo)
  #cells(k, on) { for (let i = 0; i < (this.def.w ?? 2); i++) this.room.world.set(this.def.x + i, this.#row(k), on ? 'D' : '.'); }
  get #full() { return this.n + this.queue + (this.drop ? 1 : 0) >= this.max; }

  hit() {
    const g = this.game;
    this.flash = 0.15;
    if (this.crumble >= 0 || this.#full) { g.audio.play('click', { x: this.cx, y: this.cy }); return true; }
    this.queue++;
    g.audio.play('boneCreak', { x: this.cx, y: this.cy });
    return true;
  }

  update(dt) {
    const g = this.game, p = g.player, d = this.def;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    // Sola, a su ritmo (si tiene period): va soltando hasta llenar.
    if (this.auto && this.crumble < 0) {
      this.autoT = (this.autoT ?? this.auto * 0.5) - dt;
      if (this.autoT <= 0) { this.autoT = this.auto; if (!this.#full) this.queue++; }
    }
    // Se abre la tolva y cae un fardo.
    if (!this.drop && this.queue > 0 && this.crumble < 0) {
      this.queue--;
      this.drop = { y: this.top + 10, vy: 60 };
      g.audio.play('boneChatter', { x: this.cx, y: this.top });
      for (let i = 0; i < 6; i++) g.particles.emit(this.cx + (Math.random() - 0.5) * this.W, this.top + 16, { vx: (Math.random() - 0.5) * 40, vy: 20 + Math.random() * 40, life: 0.5, gravity: 400, color: [0.86, 0.8, 0.66] });
    }
    if (this.drop) {
      const dr = this.drop;
      dr.vy = Math.min(560, dr.vy + 1100 * dt);
      dr.y += dr.vy * dt;
      const land = this.#row(this.n) * TILE;
      const r = { x: d.x * TILE, y: dr.y, w: this.W, h: TILE };
      for (const e of this.room.enemies) if (e.alive && !e.stackHit && overlap(e, r)) { e.stackHit = true; e.hurt(16, 'trap', false, { x: this.cx, y: dr.y + TILE }); }
      if (dr.y >= land) {
        // Aterriza: una casilla más de torre. Si estabas encima, te sube con ella.
        this.drop = null;
        this.#cells(this.n, true);
        const top = this.#row(this.n) * TILE, cell = { x: d.x * TILE, y: top, w: this.W, h: TILE };
        this.n++;
        if (overlap(p, cell)) { p.y = top - p.h; p.vy = Math.min(p.vy, 0); }
        for (const e of this.room.enemies) { e.stackHit = false; if (e.alive && overlap(e, cell)) e.y = top - e.h; }
        this.holdT = d.hold ?? 8;
        g.audio.play('thump', { x: this.cx, y: top });
        g.shake = Math.max(g.shake, 1.5);
        for (let i = 0; i < 8; i++) g.particles.emit(d.x * TILE + Math.random() * this.W, top + TILE - 2, { vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 50, life: 0.5, gravity: 600, color: [0.8, 0.72, 0.58] });
        this.dirty = true;
      }
    } else if (this.n > 0 && this.crumble < 0 && this.queue === 0) {
      // Aguanta un rato; antes de caer cruje y enrojece.
      this.holdT -= dt;
      if (this.holdT < 1.2 && !this.warned) { this.warned = true; g.audio.play('boneCreak', { x: this.cx, y: this.#row(this.n - 1) * TILE }); }
      if (this.holdT <= 0) { this.crumble = 0; this.crumbleT = 0; this.warned = false; g.audio.play('boneCollapse', { x: this.cx, y: this.#row(this.n - 1) * TILE }); }
    }
    // Se desmorona de arriba abajo, capa a capa.
    if (this.crumble >= 0) {
      this.crumbleT -= dt;
      if (this.crumbleT <= 0) {
        if (this.n > 0) {
          this.n--;
          this.#cells(this.n, false);
          const y = this.#row(this.n) * TILE;
          for (let i = 0; i < 10; i++) g.particles.emit(d.x * TILE + Math.random() * this.W, y + Math.random() * TILE, { vx: (Math.random() - 0.5) * 140, vy: -40 - Math.random() * 80, life: 0.7, gravity: 700, color: Math.random() < 0.5 ? [0.9, 0.84, 0.7] : [0.6, 0.5, 0.38] });
          this.crumbleT = 0.09;
          this.dirty = true;
        } else { this.crumble = -1; if (this.auto) this.autoT = this.auto; }
      }
    }
    // Sprites: la tolva en el techo, la torre sobre el suelo y el fardo que cae.
    const shake = (this.n > 0 && this.holdT < 1.2 && this.crumble < 0) ? Math.sin(this.t * 70) : 0;
    this.hopper.place(this.x, this.y);
    this.pile.place(d.x * TILE - 2 + shake, (d.y + 1) * TILE - this.max * TILE - 2);
    this.bundle.place(d.x * TILE, this.drop ? this.drop.y : -999);
    this.bundle.mesh.visible = this.bundle.glow.visible = !!this.drop;
    this.#paint(dt);
  }

  // Un fardo: tres huesos largos atados con tendón, con sus cabezas abultadas.
  #paintBundle(g, ox, oy, seed, cracked) {
    const W = this.W;
    for (let b = 0; b < 3; b++) {
      const y0 = oy + 3 + b * 4, inset = (seed + b) % 2 ? 1 : 3;
      for (let x = inset; x < W - inset; x++) {
        const head = x < inset + 3 || x > W - inset - 4;
        for (let y = -1; y <= (head ? 2 : 1); y++) px(g, ox + x, y0 + y - (head ? 1 : 0), y === -1 ? BONE.light : y === (head ? 2 : 1) ? BONE.dark : BONE.mid);
      }
      px(g, ox + inset, y0 - 2, BONE.out, W - inset * 2, 1);
    }
    px(g, ox + 2, oy + TILE - 1, BONE.out, W - 4, 1);
    for (const xx of [W * 0.3, W * 0.7]) px(g, ox + Math.round(xx), oy + 2, '#5a2a1c', 2, TILE - 3);
    if (cracked) for (let s = 0; s < 8; s++) px(g, ox + Math.round(W / 2 + Math.sin(s * 2.3 + seed) * 4), oy + 2 + s, BONE.crack);
  }

  #paint(dt) {
    this.acc += dt;
    if (this.acc < 1 / 20 && !this.dirty) return;
    this.acc = 0; this.dirty = false;
    // Tolva: embudo de hueso anillado con una boca carnosa que se dilata al soltar.
    { const { g, gl } = this.hopper, W = this.w, H = this.h;
      g.clearRect(0, 0, W, H); gl.clearRect(0, 0, W, H);
      for (let y = 0; y < H; y++) {
        const half = (W / 2) * (1 - (y / H) * 0.45);
        for (let x = 0; x < W; x++) {
          const q = (x - W / 2 + 0.5) / half;
          if (Math.abs(q) > 1) continue;
          let c = Math.abs(q) > 0.86 ? BONE.out : q < -0.45 ? BONE.hl : q < 0.1 ? BONE.light : q < 0.6 ? BONE.mid : BONE.dark;
          if (y % 6 === 2) c = BONE.dark;
          if (this.flash > 0 && Math.abs(q) < 0.86) c = '#fff4e0';
          px(g, x, y, c);
        }
      }
      const open = this.drop && this.drop.y < this.top + 30 ? 2 : 0;
      px(g, W / 2 - 5 - open, H - 4, '#3a0a10', 10 + open * 2, 3);
      px(g, W / 2 - 4 - open, H - 3, '#8a2030', 8 + open * 2, 2);
      px(gl, W / 2 - 4, H - 3, 'rgba(255,70,50,0.45)', 8, 2);
      this.hopper.commit(); }
    // Torre: un fardo por casilla; al acercarse el derrumbe, grietas rojas.
    { const { g, gl } = this.pile, Hh = this.max * TILE + 2;
      g.clearRect(0, 0, this.W + 4, Hh); gl.clearRect(0, 0, this.W + 4, Hh);
      const cracked = this.holdT < 1.2 && this.crumble < 0 && this.n > 0;
      for (let k = 0; k < this.n; k++) {
        const oy = Hh - 2 - (k + 1) * TILE;
        this.#paintBundle(g, 2, oy, k * 7, cracked);
        if (cracked) px(gl, 2 + this.W / 2 - 1, oy + 3, 'rgba(255,80,50,0.5)', 3, 8);
      }
      this.pile.commit(); }
    // Fardo cayendo.
    { const { g, gl } = this.bundle;
      g.clearRect(0, 0, this.W, TILE); gl.clearRect(0, 0, this.W, TILE);
      if (this.drop) this.#paintBundle(g, 0, 0, this.n * 7, false);
      this.bundle.commit(); }
  }

  dispose() { this.hopper.dispose(); this.pile.dispose(); this.bundle.dispose(); }
}
