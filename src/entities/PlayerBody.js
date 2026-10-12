import { MUTATIONS } from '../data/mutations.js';
import { px, seg, limb, blob, part as piece, mix, ik, sprite, OUTLINE as K } from './Rig.js';

// Cuerpo del protagonista: un esqueleto articulado (piernas, torso, cabeza, dos
// brazos) que se repinta cada fotograma en un lienzo de 48x44, con los pies en la
// base. Cada parte tiene volumen y contorno, y cada mutación SUSTITUYE la parte del
// cuerpo que reescribe, con su propia animación:
//
//   tendon      el brazo trasero es un tentáculo de músculo con inercia; tira hacia el anclaje
//   garras      brazo de hueso hasta la rodilla con tres garras; espolones en los pies
//   pistones    piernas digitígradas con émbolos: el paso rebota en muelle
//   astillas    el antebrazo abierto en un tubo de hueso (sin cañón: el brazo desnudo)
//   simbionte   el tubo de hueso es un cañón de carne que late y se hincha al cargar
//   escopeta    dos bocas de hueso cortas y anchas; el retroceso levanta el brazo
//   alveolos    sacos pulmonares translúcidos en espalda y pecho que respiran contigo
//   quitina*    I: hombreras y espinilleras de placa · II: púas dorsales · III: circuitos cian
//   cerebro     bulto tras la oreja · aleta de eco · tercer ojo y el cerebro al aire
//
// El precio de la revolución celular: cada mutación añade masa tumoral y la armadura
// se va volviendo carne. Con todas sigue siendo casi humano... pero no del todo.
// Se dibuja mirando a la derecha; el brazo del arma apunta hacia la mira.

// Cabeza de perfil, mirando a la derecha: pelo rapado (B/b, rastrojo claro con algo
// de piel), oreja (e), ceja (D), el ojo fotóforo (o rojo con su brillo O) engastado en
// una placa metálica de la sien (n/N), nariz, boca (m) y mandíbula. De la lente sale la luz.
const HEAD = [
  '...kkkkk',
  '.kBBbBBBk',
  'kBBBBBbJJk',
  'kBbBBJDDJk',
  'kBkekNoOJk',
  'kbkekNLJJJk',
  '.kkLJJLJJk',
  '.kLLJJmmk',
  '..kLLJJk',
  '...kkkk',
];
const EYE = [6, 4]; // la lente

// Orden en que se cae el pelo: primero las puntas del peinado, después calvas
// repartidas (orden pseudoaleatorio fijo, para que no parpadee entre fotogramas).
const HAIR = [];
HEAD.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'B' || ch === 'b') HAIR.push([x, y]); }));
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
HAIR.sort((a, b) => hash(...a) % 97 - hash(...b) % 97);

// Bultos que deforman el cráneo, por orden de aparición: [x, y, radio, mutaciones].
const SKULL_LUMPS = [[2, 2, 1.5, 3], [5, 0, 1.8, 5], [1, 4, 1.3, 7], [7, 1, 1.2, 9], [4, 0, 2.1, 10]];

export const BODY_W = 48;
export const BODY_H = 44;
const GROUND = BODY_H - 1;
const CX = 24;

const BASE = {
  armor: '#1e2538', armorM: '#34426a', armorL: '#6a80aa',
  skin: '#d89a70', skinD: '#8a5236', hair: '#cfcac0', hairD: '#9a968e',
  muscle: '#c98a5e', muscleD: '#9a5a36', muscleK: '#5e3020',
  light: '#e0303a', eye: '#ff2a2a',
};
// Armas del cañón (state.WEAPONS), para dibujar el brazo.
const WEAPON_IDS = ['astillas', 'simbionte', 'escopeta'];
const C = {
  bone: '#e8dcc8', boneD: '#a89a80', metal: '#9a9aa2', metalD: '#55555e',
  flesh: '#8a3048', fleshL: '#c0607a', fleshD: '#4a1424', tumor: '#a8486a', tumorL: '#d88aa0',
  plate: '#7a8ea2', plateL: '#c4d2de', plateD: '#3a4452',
  sac: '#3f8a52', sacL: '#c8ffd8', gas: '#7dff9a', cyan: '#4ff0ff',
  plasma: '#ff4ad8', plasmaD: '#9a2a8a', brain: '#e09aaa', brainD: '#9a4a62', gold: '#ffd25a',
};

// La carne invade la armadura (k 0..1), pero quedan restos oscuros que dibujan la silueta.
function palette(k) {
  return {
    armor: mix(BASE.armor, '#3a1020', k * 0.7), armorM: mix(BASE.armorM, '#7a2a40', k * 0.75), armorL: mix(BASE.armorL, '#c0607a', k * 0.7),
    skin: mix(BASE.skin, '#d08080', k * 0.5), skinD: mix(BASE.skinD, '#8a3a4a', k * 0.5),
    muscle: mix(BASE.muscle, '#d86a62', k * 0.5), muscleD: mix(BASE.muscleD, '#a8404a', k * 0.5), muscleK: BASE.muscleK,
    hair: BASE.hair, hairD: BASE.hairD, light: mix(BASE.light, '#ff6a4a', k * 0.3), eye: BASE.eye,
  };
}

// Dónde van los pies en el aire: al subir encoge las rodillas, en lo alto se recoge
// del todo, al caer estira las piernas algo abiertas. Colgado del tendón, las piernas
// cuelgan y se quedan atrás respecto al balanceo.
function airFeet(hx, far, pose, hanging) {
  const vy = pose.vy ?? 0;
  if (hanging) {
    const trail = Math.max(-6, Math.min(6, -(pose.vx ?? 0) * 0.025));
    return [hx + trail + (far ? -1 : 1), GROUND - 1 - Math.abs(trail) * 0.3];
  }
  if (vy < -80) return [hx + (far ? -2 : 3), GROUND - 6];
  if (vy <= 80) return [hx + (far ? -1 : 2), GROUND - 7];
  return [hx + (far ? -3 : 4), GROUND - 1];
}

export class PlayerBody {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.glow = document.createElement('canvas');
    this.tmp = document.createElement('canvas');
    for (const c of [this.canvas, this.glow, this.tmp]) { c.width = BODY_W; c.height = BODY_H; }
    this.g = this.canvas.getContext('2d');
    this.gl = this.glow.getContext('2d');
    this.tg = this.tmp.getContext('2d');
    this.tentacle = null;
    this.eye = { x: CX + 3, y: 14 };
    this.muzzle = { x: CX + 12, y: 22 };
    this.hand = { x: CX - 2, y: 22 };
  }

  // muts: Set de mutaciones. pose: { t, dt, vx, vy, onGround, clinging, rope {x,y} local,
  // charge, aim (ángulo local, 0 = al frente) }. opts.highlight / opts.ghost: una
  // mutación a resaltar latiendo en blanco, o a proyectar como fantasma de su color.
  render(muts, pose, opts = {}) {
    const { g, gl } = this;
    g.clearRect(0, 0, BODY_W, BODY_H);
    gl.clearRect(0, 0, BODY_W, BODY_H);
    const has = (id) => muts.has(id);
    const n = muts.size, t = pose.t;
    const P = palette(Math.min(1, n / 15));
    this.P = P; // la cuerda del Tendón (Player) se pinta con la misma carne

    // ---------- Pose ----------
    const moving = pose.onGround && Math.abs(pose.vx) > 10;
    const air = !pose.onGround && !pose.clinging;
    const hanging = !!pose.rope && air;
    const phase = t * (has('pistones') ? 12 : 10);
    const breath = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2);
    // Al aterrizar, el cuerpo se agacha un instante (amortigua la caída).
    const bob = (moving ? Math.abs(Math.sin(phase)) * (has('pistones') ? 2.2 : 1) : (pose.onGround ? breath * 0.8 : 0)) + (pose.land ?? 0) * 3;
    // Golpe: 0 → 1 rápido (30% del gesto) y vuelta lenta.
    const pt = 1 - Math.min(1, pose.punch ?? 0);
    const strike = (pose.punch ?? 0) > 0 ? (pt < 0.3 ? pt / 0.3 : 1 - (pt - 0.3) / 0.7) : 0;
    // Colgado del tendón, el cuerpo se inclina hacia el anclaje y la cadera se queda atrás.
    const swingLag = hanging ? Math.max(-3, Math.min(3, -(pose.vx ?? 0) * 0.012)) : 0;
    const lean = (hanging ? pose.rope.x * 3 : moving ? 1.5 : air ? (pose.vy < 0 ? -0.5 : 0.5) : 0) + strike * 1.5;
    const hip = [CX + swingLag, GROUND - 11 - bob + (has('pistones') ? -1 : 0)];
    const sh = [CX + lean, hip[1] - 8 + (pose.onGround && !moving ? -breath * 0.6 : 0)];
    const head = [sh[0] + 1, sh[1] - 6];
    const aim = pose.aim ?? 0;
    pose.strike = strike;
    const ctx = { has, P, t, pose, moving, air, hanging, phase, breath, hip, sh, head, aim, n };

    const shows = (id) => has(id) || opts.ghost === id;
    const part = (id, fn, behind = false) => {
      if (!shows(id)) return;
      const tg = this.tg;
      tg.clearRect(0, 0, BODY_W, BODY_H);
      fn(tg, gl);
      if (opts.highlight === id || opts.ghost === id) {
        tg.globalCompositeOperation = 'source-atop';
        tg.fillStyle = opts.ghost === id ? MUTATIONS[id].color : `rgba(255,255,255,${0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 6))})`;
        tg.fillRect(0, 0, BODY_W, BODY_H);
        tg.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = opts.ghost === id ? 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5)) : 1;
      g.globalCompositeOperation = behind ? 'destination-over' : 'source-over';
      g.drawImage(this.tmp, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    };

    // ---------- Capa trasera: pierna lejana, brazo trasero, saco dorsal ----------
    if (shows('pistones')) part('pistones', (tg) => this.#pistonLeg(tg, ctx, true));
    else this.#leg(g, ctx, true);
    if (shows('tendon')) part('tendon', (tg) => this.#tentacle(tg, ctx, opts.static));
    else if (shows('garras')) part('garras', (tg) => this.#boneArm(tg, ctx));
    else this.#backArm(g, ctx);
    part('alveolos', (tg, gl2) => {
      // Saco dorsal: el pulmón que creció hacia fuera, a la espalda.
      const r = 3 + c01(ctx.breath) * 1.6 + (pose.vy < -150 ? 1.5 : 0);
      blob(tg, sh[0] - 5, sh[1] + 4, r, r + 1, C.sac, '#2a6a3a', C.sacL);
      px(gl2, sh[0] - 5, sh[1] + 4, '#2a8a40', 2, 2);
    });

    // ---------- Torso, pierna cercana, cabeza ----------
    this.#torso(g, gl, ctx);
    if (shows('pistones')) part('pistones', (tg) => this.#pistonLeg(tg, ctx, false));
    else this.#leg(g, ctx, false);
    if (shows('garras') && !has('pistones')) part('garras', (tg) => this.#talons(tg, ctx));
    this.#head(g, gl, ctx);

    // ---------- Piel, sacos y masa ----------
    part('alveolos', (tg, gl2) => {
      // Racimo de alveolos en el pecho: se hinchan al inspirar.
      for (const [dx, dy, r0] of [[2, 3, 1.6], [4, 5, 1.3], [1, 6, 1.1]]) {
        const r = r0 + breath * 0.9;
        blob(tg, sh[0] + dx, sh[1] + dy, r, r, C.sac, '#2a6a3a', C.sacL);
        px(gl2, sh[0] + dx, sh[1] + dy, breath > 0.5 ? C.gas : '#2a8a40');
      }
    });
    part('quitina', (tg) => {
      // Hombreras de placas solapadas y espinillera.
      for (let i = 0; i < 3; i++) blob(tg, sh[0] - 3 + i * 2, sh[1] - 1 + (i === 1 ? -1 : 0), 2, 1.5, i === 1 ? C.plateL : C.plate, C.plateD);
      blob(tg, sh[0] + 4, sh[1], 2, 1.4, C.plate, C.plateD, C.plateL);
      if (!has('pistones') && this.knee) seg(tg, this.knee[0], this.knee[1] + 1, this.knee[0] - 0.5, this.knee[1] + 4, C.plateL, 2);
    });
    part('quitina2', (tg) => {
      // Púas dorsales que rompen la espalda, inclinadas hacia arriba.
      for (let i = 0; i < 4; i++) {
        const bx = sh[0] - 4 + i * 0.3, by = sh[1] + 1 + i * 2.4, l = i === 0 ? 4 : 3;
        seg(tg, bx, by, bx - l, by - 3, K, 2);
        seg(tg, bx, by, bx - l, by - 3, i % 2 ? C.boneD : C.bone, 1);
      }
    });
    this.#tumors(g, ctx, opts);
    part('nanocutis', (tg, gl2) => {
      // Circuitos cian que laten por la columna y bajan por las piernas.
      const path = [];
      for (let i = 0; i <= 6; i++) path.push([sh[0] - 2 + (hip[0] - sh[0]) * (i / 6), sh[1] + 1 + (hip[1] - sh[1]) * (i / 6)]);
      path.push([hip[0] - 1, hip[1] + 3], [hip[0] - 1, hip[1] + 6], [hip[0] + 2, hip[1] + 4], [sh[0] + 3, sh[1] + 2], [sh[0] + 5, sh[1] + 2]);
      path.forEach(([x, y], i) => {
        const on = Math.sin(t * 5 - i * 0.7) > 0.1;
        px(tg, x, y, on ? C.cyan : '#1a6a7a');
        if (on) px(gl2, x, y, C.cyan);
      });
    });

    // ---------- Cabeza mutada ----------
    part('cartografo', (tg, gl2) => {
      // Bulto tras la oreja: un ganglio que sueña con pasillos.
      blob(tg, head[0] - 4, head[1] + 1, 3.4, 3.8, K);
      blob(tg, head[0] - 4, head[1] + 1, 2.6, 3, C.tumor, C.fleshD, C.tumorL);
      seg(tg, head[0] - 5, head[1], head[0] - 3, head[1] + 2, C.gold);
      if (Math.sin(t * 4) > 0) px(gl2, head[0] - 4, head[1] + 1, C.gold);
    });
    part('ecolocacion', (tg) => {
      // Aleta de eco: membrana tensada sobre radios de hueso en la nuca.
      const bx = head[0] - 4, by = head[1] - 1, quiver = Math.sin(t * 9) > 0.6 ? 1 : 0;
      for (let i = 0; i < 4; i++) {
        const tx = bx - 5 + i * 0.5 - quiver, ty = by - 5 + i * 2.2;
        seg(tg, bx, by + 2, tx, ty, '#a05a6a', 2);
        seg(tg, bx, by + 2, tx, ty, C.boneD, 1);
      }
    });
    const eyeX = head[0] + 3, eyeY = head[1] - 1;
    part('percepcion', (tg, gl2) => {
      // El cráneo se abre: cerebro al aire y un tercer ojo en la frente.
      for (let i = -3; i <= 3; i++) {
        const h = 3 - Math.floor(Math.abs(i) / 2);
        px(tg, head[0] + i, head[1] - 5 - h, K, 1, h + 1);
        px(tg, head[0] + i, head[1] - 4 - h, (i + Math.floor(t * 2)) % 2 ? C.brain : C.brainD, 1, h);
      }
      px(tg, head[0] + 2, head[1] - 1, K, 3, 2);
      px(tg, head[0] + 3, head[1] - 1, '#ff2a2a');
      px(gl2, head[0] + 3, head[1] - 1, '#ff2a2a');
      // y un cordón nervioso que baja del ojo a la nuca, latiendo (el viaje entre úteros).
      for (let i = 0; i < 5; i++) {
        const x = eyeX - 1 - i * 1.4, y = eyeY + 1 + i * 0.9;
        px(tg, x, y, '#d040ff');
        if (Math.sin(t * 6 - i) > 0.5) px(gl2, x, y, '#d040ff');
      }
    });

    // ---------- Ojo: el fotóforo despierta ----------
    part('ojo1', (tg, gl2) => {
      // La pupila se come el iris: un anillo rosado que late alrededor de la lente.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) px(tg, eyeX + dx, eyeY + dy, '#ff9ac0');
      if (Math.sin(t * 3) > -0.3) px(gl2, eyeX, eyeY, '#ff9ac0');
    });
    part('ojo2', (tg, gl2) => {
      // Glándula pineal: un bulto luminoso en la frente con venas hacia el ojo.
      blob(tg, head[0] + 1, head[1] - 5, 1.6, 1.4, '#ff6aa8', '#8a1a48');
      seg(tg, head[0] + 1, head[1] - 4, eyeX, eyeY - 1, '#8a1a48');
      px(gl2, head[0] + 1, head[1] - 5, Math.sin(t * 4) > 0 ? '#ffd0e8' : '#ff6aa8');
    });
    part('alveolos2', (tg, gl2) => {
      // Alveolos hipertrofiados: el pecho reventado de sacos que inspiran a la vez.
      for (const [dx, dy, r0] of [[-1, 2, 1.8], [3, 1, 1.5], [-3, 5, 1.6], [5, 4, 1.2], [0, 7, 1.4]]) {
        const r = r0 + breath * 0.8;
        blob(tg, sh[0] + dx, sh[1] + dy, r, r, C.sac, '#2a6a3a', C.sacL);
        if (breath > 0.6) px(gl2, sh[0] + dx, sh[1] + dy, C.gas);
      }
    });

    // ---------- Brazo del arma (al frente) ----------
    // El arma del cañón elegida (pose.weapon); en el Genoma, la que se proyecta.
    const wpn = WEAPON_IDS.includes(opts.ghost) ? opts.ghost
      : pose.weapon !== undefined ? pose.weapon : [...WEAPON_IDS].reverse().find(has) ?? null;
    if (wpn === 'simbionte') part('simbionte', (tg, gl2) => this.#cannon(tg, gl2, ctx));
    else if (wpn === 'escopeta') part('escopeta', (tg) => this.#shotgun(tg, ctx));
    else if (wpn === 'astillas') part('astillas', (tg) => this.#gunArm(tg, ctx));
    else this.#bareArm(g, ctx);
    return this;
  }

  // ---------------------------------------------------------------- partes humanas
  #leg(g, c, far) {
    const { P, hip, phase, moving, air, pose } = c;
    const hx = hip[0] + (far ? -1 : 1), hy = hip[1] + 1;
    const ph = phase + (far ? Math.PI : 0);
    let fx = hx + (far ? -2 : 2), fy = GROUND;
    if (moving) { fx = hx + Math.sin(ph) * 5; fy = GROUND - Math.max(0, Math.cos(ph)) * 3; }
    if (air) [fx, fy] = airFeet(hx, far, pose, c.hanging);
    if (pose.clinging) { fx = hx + 4; fy = GROUND - (far ? 5 : 2); }
    if (pose.land > 0 && !air) { fx = hx + (far ? -3 : 3); }            // pies abiertos al caer
    const [kx, ky] = ik(hx, hy, fx, fy - 1, 6, 6, -1);
    if (!far) this.knee = [kx, ky];
    const col = far ? P.armor : P.armorM;
    limb(g, hx, hy, kx, ky, 3, col, far ? null : P.armorL);
    limb(g, kx, ky, fx, fy - 1, 3, col, far ? null : P.armorL);
    px(g, kx - 1, ky - 1, far ? P.armorM : P.armorL, 2, 2); // rodillera
    // Bota.
    px(g, fx - 2, fy - 1, K, 6, 2);
    px(g, fx - 1, fy - 1, far ? '#2e2a2a' : '#4a4444', 4, 1);
    if (!far) px(g, fx, fy - 3, P.light); // luz de la bota
  }

  #torso(g, gl, c) {
    const { P, hip, sh } = c;
    // Tronco: de hombros anchos a cintura estrecha.
    for (let y = sh[1]; y <= hip[1]; y++) {
      const k = (y - sh[1]) / (hip[1] - sh[1]);
      const cx = sh[0] + (hip[0] - sh[0]) * k;
      const half = 4.5 - k * 1.8;
      px(g, cx - half - 1, y, K, half * 2 + 3, 1);
    }
    for (let y = sh[1] + 1; y < hip[1]; y++) {
      const k = (y - sh[1]) / (hip[1] - sh[1]);
      const cx = sh[0] + (hip[0] - sh[0]) * k;
      const half = 4.5 - k * 1.8;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        const front = x > cx + 1;
        // Peto de armadura con el músculo cobrizo al aire en el costado y el vientre.
        const muscle = (front && k > 0.45) || (x < cx - half + 2 && k > 0.2 && k < 0.7);
        px(g, x, y, muscle ? ((x + y) % 3 ? P.muscle : P.muscleD) : k < 0.3 ? P.armorM : P.armor);
      }
    }
    px(g, sh[0] - 4, sh[1] + 1, P.armorL, 8, 1); // borde del peto
    // Luces rojas de la armadura.
    for (const [dx, dy] of [[-1, 5], [2, 5]]) {
      px(g, sh[0] + dx, sh[1] + dy, P.light);
      px(gl, sh[0] + dx, sh[1] + dy, P.light);
    }
    // Cinturón.
    px(g, hip[0] - 3, hip[1] - 1, K, 7, 2);
    px(g, hip[0] - 1, hip[1] - 1, '#5a5a5a', 2, 1);
  }

  // Cabeza pintada a mano (de perfil, mirando a la derecha): pelo blanco en punta
  // peinado hacia atrás, ceja marcada, el ojo fotóforo con su brillo, una placa
  // cibernética en la sien, nariz, boca y mandíbula. La piel se vuelve carne con las mutaciones.
  #head(g, gl, c) {
    const { P, sh } = c;
    const x0 = Math.round(sh[0] - 4), y0 = Math.round(sh[1] - 9);
    seg(g, sh[0] + 1, sh[1] + 1, x0 + 5, y0 + 8, K, 3);
    seg(g, sh[0] + 1, sh[1] + 1, x0 + 5, y0 + 8, P.skinD, 1); // cuello
    const pal = {
      k: K, B: P.hair, b: mix(P.hairD, P.skin, 0.35), J: P.skin, L: P.skinD, D: mix(P.skinD, '#2a1010', 0.45),
      e: mix(P.skin, '#b05a50', 0.35),
      n: '#55555e', N: '#b4b4be', c: '#7a2a34', o: P.eye, O: '#fff0e0', r: '#a01818', m: '#3a1418',
    };
    // El precio de mutar: el pelo se cae a calvas y el cráneo se abomba.
    const n = c.n;
    const rows = HEAD.map((r) => [...r]);
    const lost = Math.round(HAIR.length * Math.min(0.9, Math.max(0, (n - 1) / 9)));
    for (let i = 0; i < lost; i++) {
      const [x, y] = HAIR[i];
      // Las puntas desaparecen; el resto deja ver el cuero cabelludo (con venas, al final).
      rows[y][x] = n >= 7 && hash(x, y) % 5 === 0 ? 'v' : rows[y][x] === 'b' ? 'S' : 's';
    }
    pal.s = mix(P.skin, '#e8c0b8', 0.35);
    pal.S = mix(P.skinD, '#c08880', 0.3);
    pal.v = '#8a2a3a';
    for (const [lx, ly, r, need] of SKULL_LUMPS) {
      if (n < need) continue;
      const grow = Math.min(1, 0.5 + (n - need) * 0.25);
      piece(g, x0 + lx, y0 + ly, r * grow, r * grow * 0.85, pal.s, pal.S, '#f4d8d0');
    }
    sprite(g, gl, rows.map((r) => r.join('')), x0, y0, pal, 'oOr');
    // Venas sobre los bultos más grandes.
    for (const [lx, ly, r, need] of SKULL_LUMPS) if (n >= need + 1) seg(g, x0 + lx - r * 0.5, y0 + ly, x0 + lx + r * 0.3, y0 + ly - r * 0.5, pal.v);
    c.head[0] = x0 + 4;
    c.head[1] = y0 + 3;
    this.eye = { x: x0 + EYE[0], y: y0 + EYE[1] };
  }

  #backArm(g, c) {
    const { P, sh, phase, moving, pose, hanging } = c;
    const s = [sh[0] - 3, sh[1] + 1];
    let hand = [s[0] - 1 + (moving ? -Math.sin(phase) * 3 : 0), s[1] + 9];
    if (c.air && !hanging) hand = pose.vy < -60 ? [s[0] + 1, s[1] - 7] : pose.vy > 60 ? [s[0] - 7, s[1] + 1] : [s[0] - 4, s[1] - 4];
    if (pose.clinging) hand = [s[0] + 8, s[1] - 3];
    if (hanging) hand = [s[0] + pose.rope.x * 9, s[1] + pose.rope.y * 9];
    const el = ik(s[0], s[1], hand[0], hand[1], 4, 4, 1);
    limb(g, s[0], s[1], el[0], el[1], 2, P.muscleD);
    limb(g, el[0], el[1], hand[0], hand[1], 2, P.muscle);
    px(g, hand[0] - 1, hand[1], '#2e2a2a', 2, 2); // guante
    this.hand = { x: hand[0], y: hand[1] };
  }

  // Sin cañón: el brazo desnudo, con el puño cerrado (solo culatazos). Cuelga hacia
  // abajo balanceándose al andar; se alza hacia la mira solo si apuntas (pose.armRaise).
  #bareArm(g, c) {
    const { P, sh, t, moving, phase } = c;
    const k = c.pose.strike ?? 0;
    const swing = moving ? Math.sin(phase + Math.PI) * 0.45 : Math.sin(t * 1.6) * 0.06;
    const hang = Math.PI / 2 - 0.2 + swing;
    const raise = c.pose.armRaise ?? 0;
    const rest = hang + (c.aim - hang) * raise;
    const aim = k > 0 ? rest * (1 - k) : rest;
    const s = [sh[0] + 3, sh[1] + 1];
    const hand = [s[0] + Math.cos(aim) * (7 + k * 6), s[1] + Math.sin(aim) * (7 + k * 6)];
    const el = ik(s[0], s[1], hand[0], hand[1], 4, 4, 1);
    limb(g, s[0], s[1], el[0], el[1], 2, P.armorM, P.armorL);
    limb(g, el[0], el[1], hand[0], hand[1], 2, P.muscle);
    blob(g, hand[0], hand[1], 1.6, 1.6, K);
    blob(g, hand[0], hand[1], 1.1, 1.1, P.muscle);
    this.muzzle = { x: hand[0] + Math.cos(aim) * 2, y: hand[1] + Math.sin(aim) * 2 };
  }

  // Escopeta de Esquirlas: dos bocas de hueso cortas y anchas envueltas en carne. El
  // retroceso (pose.recoil 1 → 0) echa el brazo atrás y levanta el cañón.
  #shotgun(g, c) {
    const { P, sh } = c;
    const r = c.pose.recoil ?? 0;
    const kp = c.pose.strike ?? 0;
    const aim = (kp > 0 ? c.aim * (1 - kp) : c.aim) - r * 0.7;
    const s = [sh[0] + 3, sh[1] + 1];
    const reach = 6 - r * 3 + kp * 6;
    const hand = [s[0] + Math.cos(aim) * reach, s[1] + Math.sin(aim) * reach];
    const el = ik(s[0], s[1], hand[0], hand[1], 4, 4, 1);
    limb(g, s[0], s[1], el[0], el[1], 2, P.armorM, P.armorL);
    const ca = Math.cos(aim), sa = Math.sin(aim), nx = -sa, ny = ca;
    const ex = hand[0] + ca * 7, ey = hand[1] + sa * 7;
    // dos cañones paralelos
    for (const o of [-1.2, 1.2]) {
      seg(g, hand[0] + nx * o, hand[1] + ny * o, ex + nx * o, ey + ny * o, K, 3);
    }
    for (const o of [-1.2, 1.2]) {
      seg(g, hand[0] + nx * o, hand[1] + ny * o, ex + nx * o, ey + ny * o, o < 0 ? C.bone : C.boneD, 1);
    }
    // carne que los ata y la culata
    blob(g, hand[0] + ca * 2, hand[1] + sa * 2, 2.6, 2.6, K);
    blob(g, hand[0] + ca * 2, hand[1] + sa * 2, 2, 2, C.flesh);
    px(g, hand[0] + ca * 4, hand[1] + sa * 4, '#4a1020');
    // bocas
    px(g, ex + nx * -1.2, ey + ny * -1.2, '#1a0608');
    px(g, ex + nx * 1.2, ey + ny * 1.2, '#1a0608');
    this.muzzle = { x: ex + ca * 2, y: ey + sa * 2 };
  }

  // Cañón de Astillas: el antebrazo abierto en un tubo de hueso con astillas asomando.
  #gunArm(g, c) {
    const { P, sh } = c;
    // Culatazo: el brazo sale disparado hacia delante y vuelve.
    const k = c.pose.strike ?? 0;
    const aim = k > 0 ? c.aim * (1 - k) : c.aim;
    const s = [sh[0] + 3, sh[1] + 1];
    const hand = [s[0] + Math.cos(aim) * (7 + k * 6), s[1] + Math.sin(aim) * (7 + k * 6)];
    const el = ik(s[0], s[1], hand[0], hand[1], 4, 4, 1);
    limb(g, s[0], s[1], el[0], el[1], 2, P.armorM, P.armorL);
    limb(g, el[0], el[1], hand[0], hand[1], 2, P.muscle);
    // Tubo de hueso alineado con la mira, con anillos y astillas en la boca.
    const ex = hand[0] + Math.cos(aim) * 7, ey = hand[1] + Math.sin(aim) * 7;
    seg(g, hand[0], hand[1], ex, ey, K, 5);
    seg(g, hand[0], hand[1], ex, ey, C.boneD, 3);
    seg(g, hand[0], hand[1] - 1, ex, ey - 1, C.bone, 1);
    for (const u of [0.35, 0.7]) px(g, hand[0] + (ex - hand[0]) * u, hand[1] + (ey - hand[1]) * u, '#6a5a48');
    const mx = hand[0] + Math.cos(aim + 1.6) * 2.5, my = hand[1] + Math.sin(aim + 1.6) * 2.5;
    px(g, mx, my, C.flesh); // la carne que lo une al brazo
    px(g, ex + Math.cos(aim - 0.5) * 1.5, ey + Math.sin(aim - 0.5) * 1.5, '#f0e6d0'); // astilla asomando
    this.muzzle = { x: ex + Math.cos(aim) * 2, y: ey + Math.sin(aim) * 2 };
  }

  // ---------------------------------------------------------------- mutaciones
  // Piernas digitígradas con émbolos: rodilla adelante, talón alzado, salto en muelle.
  #pistonLeg(g, c, far) {
    const { P, hip, phase, moving, air, pose, has } = c;
    const hx = hip[0] + (far ? -1 : 1), hy = hip[1] + 1;
    const ph = phase + (far ? Math.PI : 0);
    let fx = hx + (far ? -2 : 3), fy = GROUND;
    if (moving) { fx = hx + Math.sin(ph) * 6; fy = GROUND - Math.max(0, Math.cos(ph)) * 4; }
    if (air) { [fx, fy] = airFeet(hx, far, pose, c.hanging); fy -= 1; }
    if (pose.clinging) { fx = hx + 4; fy = GROUND - (far ? 6 : 3); }
    const ax = fx - 3, ay = fy - 4;                                 // talón alzado
    const [kx, ky] = ik(hx, hy, ax, ay, 5, 5, -1);                  // rodilla adelante
    if (!far) this.knee = [kx, ky];
    limb(g, hx, hy, kx, ky, 4, far ? P.muscleD : P.muscle, far ? null : '#e8b08a'); // muslo
    // Espinilla de acero con el émbolo hidráulico paralelo.
    limb(g, kx, ky, ax, ay, 2, far ? C.metalD : C.metal);
    seg(g, kx - 2, ky + 1, ax - 1, ay + 1, K, 2);
    seg(g, kx - 2, ky + 1, ax - 1, ay + 1, far ? '#7a7a3a' : '#c8b46a', 1);
    px(g, kx - 1, ky - 1, K, 3, 3);
    px(g, kx, ky, has('quitina') ? C.plateL : C.metalD);
    // Pie de garra.
    seg(g, ax, ay, fx + 2, fy, K, 3);
    seg(g, ax, ay, fx + 2, fy, far ? '#2e2a2a' : '#4a4444', 1);
    px(g, fx, fy, K, 5, 1);
    if (has('garras')) { px(g, fx + 4, fy - 1, C.bone, 2, 1); px(g, fx + 5, fy - 2, C.boneD); }
  }

  // Tentáculo del Tendón: cadena de nodos con inercia. Arrastra al moverte, cuelga en
  // reposo y, con la cuerda tendida, se estira hacia el anclaje.
  #tentacle(g, c, still) {
    const { P, sh, pose, has } = c;
    const N = 12, SEG = 2.2;
    const sx = sh[0] - 4, sy = sh[1] + 2;
    if (pose.reach) {
      // Tendido hacia el objetivo: del hombro sale solo la raíz, recta hacia allí; el
      // resto del tentáculo es la cuerda que dibuja Player, con su punta en el anclaje.
      const ROOT = 3;
      const pts = Array.from({ length: ROOT + 1 }, (_, i) => ({ x: sx + pose.reach.x * SEG * 1.3 * i, y: sy + pose.reach.y * SEG * 1.3 * i }));
      for (let i = ROOT; i > 0; i--) seg(g, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, K, 5);
      for (let i = ROOT; i > 0; i--) seg(g, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, i % 2 ? P.muscle : P.muscleD, 3);
      this.tendonOut = pts[ROOT];
      this.tentacle = null; // al recogerse vuelve a colgar desde el hombro
      this.hand = { x: pts[ROOT].x, y: pts[ROOT].y };
      return;
    }
    this.tendonOut = null;
    if (!this.tentacle || still) {
      this.tentacle = Array.from({ length: N }, (_, i) => ({ x: sx - i * 0.4, y: sy + i * SEG, px: sx - i * 0.4, py: sy + i * SEG }));
    }
    const pts = this.tentacle;
    const dt = Math.min(0.05, pose.dt ?? 1 / 60);
    // Sin cuerda cae hacia atrás, lejos del cuerpo, para que se vea serpentear.
    const fx = -(pose.vx ?? 0) * 0.9 - 260 + (pose.rope ? pose.rope.x * 1400 + 260 : 0);
    const fy = 480 - (pose.vy ?? 0) * 0.5 + (pose.rope ? pose.rope.y * 1400 : 0);
    pts[0].x = sx; pts[0].y = sy;
    for (let i = 1; i < N; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * 0.86, vy = (p.y - p.py) * 0.86;
      p.px = p.x; p.py = p.y;
      p.x += vx + fx * dt * dt + Math.sin(pose.t * 3 + i * 0.7) * 0.12;
      p.y += vy + fy * dt * dt;
    }
    for (let k = 0; k < 3; k++) for (let i = 1; i < N; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      b.x = Math.max(1, Math.min(BODY_W - 2, a.x + (dx / d) * SEG));
      b.y = Math.min(GROUND - 1, a.y + (dy / d) * SEG);
    }
    const width = (i) => (i < 5 ? 3 : i < 9 ? 2 : 1);
    for (let i = N - 1; i > 0; i--) seg(g, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, K, width(i) + 2);
    for (let i = N - 1; i > 0; i--) {
      const a = pts[i - 1], b = pts[i];
      seg(g, a.x, a.y, b.x, b.y, i % 2 ? P.muscle : P.muscleD, width(i));
      if (i % 3 === 0) { px(g, b.x - 2, b.y - 1, K, 2, 2); px(g, b.x - 2, b.y - 1, C.bone); } // púas
    }
    const tip = pts[N - 1];
    if (has('garras')) {
      for (const [dx, dy] of [[-3, 1], [0, 3], [2, 2]]) {
        seg(g, tip.x, tip.y, tip.x + dx, tip.y + dy, K, 2);
        seg(g, tip.x, tip.y, tip.x + dx, tip.y + dy, C.bone);
      }
    } else {
      blob(g, tip.x, tip.y, 1.5, 1.5, '#a8424e', K);
      px(g, tip.x, tip.y, '#2a0610');
    }
    this.hand = { x: pts[3].x, y: pts[3].y };
  }

  // Brazo de hueso: cuelga hasta la rodilla, con tres garras largas que se crispan.
  #boneArm(g, c) {
    const { P, sh, phase, moving, pose, t, hanging } = c;
    const s = [sh[0] - 3, sh[1] + 1];
    let hand = [s[0] - 2 + (moving ? -Math.sin(phase) * 3 : 0), s[1] + 13];
    if (c.air && !hanging) hand = pose.vy < -60 ? [s[0] + 1, s[1] - 10] : pose.vy > 60 ? [s[0] - 10, s[1] + 2] : [s[0] - 6, s[1] - 6];
    if (pose.clinging) hand = [s[0] + 10, s[1] - 4];
    if (hanging) hand = [s[0] + pose.rope.x * 12, s[1] + pose.rope.y * 12];
    const el = ik(s[0], s[1], hand[0], hand[1], 6, 8, 1);
    limb(g, s[0], s[1], el[0], el[1], 2, P.muscleD);
    limb(g, el[0], el[1], hand[0], hand[1], 2, C.bone, '#fff4e0');
    px(g, el[0] - 2, el[1] - 1, K, 2, 2);
    px(g, el[0] - 2, el[1] - 1, C.boneD); // espolón del codo
    const tw = Math.sin(t * 7) > 0.8 ? 1 : 0;
    for (let i = 0; i < 3; i++) {
      const tx = hand[0] - 2 + i * 2 + tw, ty = hand[1] + 4 + (i === 1 ? 1 : 0);
      seg(g, hand[0], hand[1], tx, ty, K, 2);
      seg(g, hand[0], hand[1], tx, ty, i === 1 ? C.bone : C.boneD, 1);
    }
    this.hand = { x: hand[0], y: hand[1] };
  }

  // Espolones de hueso que rompen la punta de las botas.
  #talons(g, c) {
    const kx = this.knee ? this.knee[0] : CX + 3;
    for (const fx of [kx + 2, c.hip[0] - 1]) {
      seg(g, fx + 2, GROUND - 1, fx + 5, GROUND - 3, K, 2);
      seg(g, fx + 2, GROUND - 1, fx + 5, GROUND - 3, C.bone, 1);
    }
  }

  // Cañón Simbionte: el antebrazo es un saco de carne con una boca dentada que apunta
  // a la mira. Late solo; al cargar se hincha y la boca brilla.
  #cannon(g, gl, c) {
    const { P, sh, t, pose } = c;
    const kp = pose.strike ?? 0;
    const aim = kp > 0 ? c.aim * (1 - kp) : c.aim;
    const k = Math.min(1, (pose.charge ?? 0) / 0.6);
    const s = [sh[0] + 3, sh[1] + 1];
    const hand = [s[0] + Math.cos(aim) * (6 + kp * 6), s[1] + Math.sin(aim) * (6 + kp * 6)];
    const el = ik(s[0], s[1], hand[0], hand[1], 4, 4, 1);
    limb(g, s[0], s[1], el[0], el[1], 2, P.armorM);
    const swell = 3 + Math.sin(t * 5) * 0.4 + k * 1.6;
    const ca = Math.cos(aim), sa = Math.sin(aim);
    const mx = hand[0] + ca * 7, my = hand[1] + sa * 7;
    // Saco alargado a lo largo de la mira: primero el contorno, luego la carne.
    for (const pass of [0, 1]) {
      for (let i = 0; i <= 7; i++) {
        const r = swell * Math.sin(((i + 1) / 9) * Math.PI);
        if (pass === 0) blob(g, hand[0] + ca * i, hand[1] + sa * i, r + 1, r + 1, K);
        else blob(g, hand[0] + ca * i, hand[1] + sa * i, r, r, i % 2 ? C.flesh : '#9a3a56');
      }
    }
    const nx = -sa, ny = ca;
    seg(g, hand[0] + ca - nx, hand[1] + sa - ny, mx - ca - nx * 2, my - sa - ny * 2, C.fleshL); // brillo húmedo
    seg(g, hand[0] + ca + nx, hand[1] + sa + ny, mx - ca * 2 + nx, my - sa * 2 + ny, '#4a1020');  // vena
    // Púas óseas en el lomo y boca dentada con el núcleo de plasma.
    for (const i of [2, 4.5]) px(g, hand[0] + ca * i - nx * (swell + 1), hand[1] + sa * i - ny * (swell + 1), C.bone, 1, 2);
    px(g, mx + nx * 2, my + ny * 2, C.bone);
    px(g, mx - nx * 2, my - ny * 2, C.bone);
    blob(g, mx + ca, my + sa, 1.2 + k, 1.2 + k, C.plasma);
    px(gl, mx + ca, my + sa, k > 0.9 ? '#ffd0f4' : C.plasma, 2, 2);
    if (k > 0) blob(gl, hand[0] + ca * 3, hand[1] + sa * 3, k * 2, k * 2, C.plasmaD);
    this.muzzle = { x: mx + ca * 2, y: my + sa * 2 };
  }

  // Masa tumoral: brota en el contorno del cuerpo, una más con cada mutación.
  #tumors(g, c, opts) {
    const { sh, hip, head, breath, n } = c;
    const spots = [
      [sh[0] - 4, sh[1]], [sh[0] + 5, sh[1] + 1], [hip[0] - 4, hip[1] - 3], [head[0] - 3, head[1] + 4],
      [hip[0] - 2, hip[1] + 4], [sh[0] - 5, sh[1] + 5], [sh[0] + 2, sh[1] - 2], [hip[0] + 3, hip[1] + 6],
      [sh[0] - 1, sh[1] + 8], [head[0] + 1, head[1] + 5], [hip[0] - 3, hip[1] + 8],
    ];
    const count = Math.min(spots.length, n + (opts.ghost ? 1 : 0));
    for (let i = 0; i < count; i++) {
      const r = Math.min(2.8, 1 + (n - i) * 0.35) + (i % 3 === 0 ? breath * 0.4 : 0);
      const [x, y] = spots[i];
      g.globalAlpha = opts.ghost && i === count - 1 ? 0.4 : 1;
      blob(g, x, y, r + 0.8, r * 0.85 + 0.8, K);
      blob(g, x, y, r, r * 0.85, C.tumor, C.fleshD, C.tumorL);
      if (r > 2) px(g, x + 1, y, '#6a1a34');
      g.globalAlpha = 1;
    }
  }
}

const c01 = (v) => Math.max(0, Math.min(1, v));
