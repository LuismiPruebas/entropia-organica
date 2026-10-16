// Pruebas de la física de pendientes (core/Physics.js): node tools/test-slopes.mjs
// Simula un cuerpo como el del jugador (12x24) por escenarios con rampas de 45° y
// suaves, en los dos sentidos, y comprueba en cada paso que nunca queda dentro de una
// pared, que no se hunde en la superficie de una rampa y que llega a donde debe.
import { TileWorld, TILE, isSlope, slopeSurface } from '../src/core/Physics.js';

const GRAV = 900, DT = 1 / 60;
let fails = 0;
const fail = (name, msg) => { fails++; console.log(`  ✗ ${name}: ${msg}`); };

// Hundimiento: cuánto está el centro de los pies por debajo de la superficie de rampa.
function sink(w, b) {
  const fx = b.x + b.w / 2, fy = b.y + b.h - 0.01;
  const cx = Math.floor(fx / TILE), cy = Math.floor(fy / TILE), c = w.get(cx, cy);
  if (!isSlope(c)) return 0;
  return fy - (cy * TILE + slopeSurface(c, fx - cx * TILE));
}

// Corre a velocidad constante (opcionalmente saltando a un tiempo) y devuelve el cuerpo.
function run(name, rows, { start, vx, frames = 600, w = 12, h = 24, jumpAt = -1, until }) {
  const world = new TileWorld(rows);
  const b = { x: start[0] * TILE + (TILE - w) / 2, y: (start[1] + 1) * TILE - h, w, h, vx: 0, vy: 0, onGround: false };
  let airFrames = 0, maxAir = 0;
  for (let f = 0; f < frames; f++) {
    b.vx = vx;
    if (f === jumpAt && b.onGround) b.vy = -300;
    b.vy = Math.min(420, b.vy + GRAV * DT);
    world.move(b, DT);
    if (world.rectSolid(b.x, b.y, b.w, b.h)) { fail(name, `dentro de la pared en el paso ${f} (x=${b.x.toFixed(1)}, y=${b.y.toFixed(1)})`); return b; }
    const s = sink(world, b);
    if (s > 1.01) { fail(name, `hundido ${s.toFixed(2)}px en una rampa en el paso ${f}`); return b; }
    airFrames = b.onGround ? 0 : airFrames + 1;
    if (f > 30 && jumpAt < 0) maxAir = Math.max(maxAir, airFrames);
    if (until && until(b)) { b.frames = f; break; }
  }
  b.maxAir = maxAir;
  return b;
}

const scenarios = [];
const T = (name, fn) => scenarios.push([name, fn]);

// Colina: rampas que suben hasta una meseta y bajan al otro lado. kind '45' o 'suave'.
// Cada rampa tiene pared debajo; la meseta queda en la fila `top`.
function hill(kind, W = 34, H = 10, base = 8, x0 = 6, steps = 3, flat = 6) {
  const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || y >= base || x === 0 || x === W - 1 ? '#' : '.')));
  const run = kind === '45' ? 1 : 2;                    // casillas de ancho por fila de subida
  const up = kind === '45' ? ['/'] : ['a', 'A'], down = kind === '45' ? ['k'] : ['E', 'e'];
  const width = steps * run * 2 + flat;
  for (let i = 0; i < steps; i++) {
    const y = base - 1 - i, xl = x0 + i * run, xr = x0 + width - 1 - i * run;
    up.forEach((c, j) => { g[y][xl + j] = c; });
    down.forEach((c, j) => { g[y][xr - (run - 1) + j] = c; });
    for (let x = xl + run; x <= xr - run; x++) g[y][x] = '#';
  }
  return g.map((r) => r.join(''));
}
const hill45 = hill('45');
T('45° sube y baja hacia la derecha', () => {
  const b = run('45° →', hill45, { start: [2, 7], vx: 120, frames: 400, until: (b) => b.x > 28 * TILE });
  if (!(b.x > 28 * TILE)) fail('45° →', `no cruzó la colina (x=${(b.x / TILE).toFixed(1)})`);
  if (b.maxAir > 3) fail('45° →', `despegó del suelo ${b.maxAir} pasos seguidos (saltitos al bajar)`);
});
T('45° sube y baja hacia la izquierda', () => {
  const b = run('45° ←', hill45, { start: [30, 7], vx: -120, frames: 400, until: (b) => b.x < 3 * TILE });
  if (!(b.x < 3 * TILE)) fail('45° ←', `no cruzó la colina (x=${(b.x / TILE).toFixed(1)})`);
  if (b.maxAir > 3) fail('45° ←', `despegó del suelo ${b.maxAir} pasos seguidos`);
});
T('45° a velocidad de embestida', () => {
  const b = run('45° rápido', hill45, { start: [2, 7], vx: 270, frames: 300, until: (b) => b.x > 28 * TILE });
  if (!(b.x > 28 * TILE)) fail('45° rápido', `no cruzó (x=${(b.x / TILE).toFixed(1)})`);
});

// --- Rampas suaves (22,5°) ---------------------------------------------------------
const gentle = hill('suave');
T('rampa suave sube y baja (→)', () => {
  const b = run('suave →', gentle, { start: [2, 7], vx: 110, frames: 500, until: (b) => b.x > 30 * TILE });
  if (!(b.x > 30 * TILE)) fail('suave →', `no cruzó (x=${(b.x / TILE).toFixed(1)})`);
  if (b.maxAir > 3) fail('suave →', `despegó ${b.maxAir} pasos seguidos`);
});
T('rampa suave sube y baja (←)', () => {
  const b = run('suave ←', gentle, { start: [31, 7], vx: -110, frames: 500, until: (b) => b.x < 3 * TILE });
  if (!(b.x < 3 * TILE)) fail('suave ←', `no cruzó (x=${(b.x / TILE).toFixed(1)})`);
  if (b.maxAir > 3) fail('suave ←', `despegó ${b.maxAir} pasos seguidos`);
});

// --- Caer sobre una rampa desde lo alto -------------------------------------------
T('cae sobre una rampa y se queda encima', () => {
  const b = run('caída', hill45, { start: [9, 2], vx: 0, frames: 120 });
  const s = sink(new TileWorld(hill45), b);
  if (!b.onGround) fail('caída', 'no quedó apoyado');
  if (Math.abs(s) > 1.01) fail('caída', `no quedó sobre la superficie (desfase ${s.toFixed(2)})`);
});

// --- Saltar en mitad de la rampa ----------------------------------------------------
T('salta desde la rampa', () => {
  const b = run('salto', hill45, { start: [2, 7], vx: 100, frames: 200, jumpAt: 70 });
  if (b.maxAir === undefined) fail('salto', 'sin datos');
});

// --- La cara vertical de una rampa es pared ------------------------------------------
const cliff = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#........k.........#',
  '#........#k........#',
  '#........##k.......#',
  '####################',
];
// Cuerpo en el suelo a la derecha; avanza hacia la izquierda: sube la rampa 'k' (sube a la izquierda).
T('rampa k: se sube desde la derecha', () => {
  const b = run('k', cliff, { start: [16, 6], vx: -100, frames: 300, until: (b) => b.x < 9 * TILE });
  if (b.y + b.h > 5 * TILE + 1) fail('k', `no subió la rampa (pies en ${((b.y + b.h) / TILE).toFixed(2)})`);
});
const wallSide = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#........./........#',
  '#......../#........#',
  '#......./##........#',
  '####################',
];
// Desde la derecha, a ras del suelo, hacia la izquierda: la cara vertical de '/' frena.
T('cara vertical de una rampa: frena', () => {
  const b = run('cara', wallSide, { start: [16, 6], vx: -100, frames: 300 });
  if (b.x < 10 * TILE - 0.5) fail('cara', `atravesó la cara vertical (x=${(b.x / TILE).toFixed(2)})`);
});

// --- Raycast ------------------------------------------------------------------------
T('raycast: corte exacto con la rampa', () => {
  const w = new TileWorld(wallSide);
  // Rayo vertical hacia abajo por el centro de la casilla '/' (9,5): superficie en y = 5*16 + 8.
  const hit = w.raycast(9 * TILE + 8, 2 * TILE, 9 * TILE + 8, 7 * TILE);
  if (!hit || Math.abs(hit.y - (5 * TILE + 8)) > 0.01) fail('raycast', `esperaba y=${5 * TILE + 8}, dio ${hit?.y}`);
  // Un rayo por encima de la rampa no choca.
  if (w.raycast(2 * TILE, 2 * TILE, 18 * TILE, 2 * TILE)) fail('raycast', 'chocó en el aire');
  // Un rayo diagonal que roza la esquina de un bloque sí choca (no se cuela).
  const corner = w.raycast(9 * TILE - 4, 6 * TILE - 4, 11 * TILE, 8 * TILE);
  if (!corner) fail('raycast', 'se coló por una esquina');
  // Línea de visión hasta una casilla sólida (como un sello): la casilla del destino no cuenta.
  if (!w.lineOfSight(5 * TILE, 2 * TILE + 8, 0 * TILE + 8, 2 * TILE + 8)) fail('raycast', 'la línea de visión contó la casilla del destino');
});
T('solidAtPx en una rampa', () => {
  const w = new TileWorld(wallSide);
  if (w.solidAtPx(9 * TILE + 2, 5 * TILE + 3)) fail('solidAtPx', 'aire sobre la rampa contado como sólido');
  if (!w.solidAtPx(9 * TILE + 14, 5 * TILE + 6)) fail('solidAtPx', 'carne bajo la rampa contada como aire');
});

// --- Prueba aleatoria: correr, frenar, girar y saltar al azar ------------------------
T('aleatoria: 20 recorridos x 2000 pasos sobre las dos colinas', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const map of [hill45, gentle]) for (let k = 0; k < 10; k++) {
    const world = new TileWorld(map);
    const b = { x: (3 + rnd() * 26) * TILE, y: 2 * TILE, w: 12, h: 24, vx: 0, vy: 0, onGround: false };
    let vx = 0;
    for (let f = 0; f < 2000; f++) {
      if (rnd() < 0.03) vx = [-270, -150, -90, 0, 90, 150, 270][Math.floor(rnd() * 7)];
      b.vx = vx;
      if (b.onGround && rnd() < 0.02) b.vy = -300;
      b.vy = Math.min(420, b.vy + GRAV * DT);
      world.move(b, DT);
      if (world.rectSolid(b.x, b.y, b.w, b.h)) { fail('aleatoria', `dentro de la pared (mapa ${map === hill45 ? '45' : 'suave'}, recorrido ${k}, paso ${f})`); return; }
      if (sink(world, b) > 1.01) { fail('aleatoria', `hundido ${sink(world, b).toFixed(2)}px (recorrido ${k}, paso ${f})`); return; }
    }
  }
});

// --- Rampas de techo (las de suelo volteadas) ----------------------------------------
// Pasillo cuyo techo baja en rampa hasta cerrarse (45° y suave): al caminar hacia ahí el
// cuerpo frena sin meterse; al saltar debajo, la cabeza se para en la diagonal.
function ceilCave(kind) {
  const W = 34, H = 10, g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || y >= 8 || x === 0 || x === W - 1 ? '#' : '.')));
  // Techo bajo a la derecha: baja hasta dejar 1 casilla de hueco (el cuerpo mide 1,5: no cabe).
  const seq = kind === '45' ? ['J'] : ['r', 'R'];
  let x = 10;
  for (let row = 1; row <= 6; row++) {
    for (const c of seq) { g[row][x] = c; for (let yy = 1; yy < row; yy++) g[yy][x] = '#'; x++; }
  }
  for (; x < W - 1; x++) for (let yy = 1; yy <= 6; yy++) g[yy][x] = "#";
  return g.map((r) => r.join(''));
}
const hitsCeil = (w, b) => w.rectHitsCeil(b.x, b.y, b.w, b.h);
for (const kind of ['45', 'suave']) {
  T(`techo ${kind}: caminar hacia donde baja frena sin meterse`, () => {
    const map = ceilCave(kind), w = new TileWorld(map);
    const b = { x: 2 * TILE, y: 8 * TILE - 24, w: 12, h: 24, vx: 0, vy: 0, onGround: false };
    for (let i = 0; i < 400; i++) {
      b.vx = 120; b.vy = Math.min(420, b.vy + GRAV * DT); w.move(b, DT);
      if (w.rectSolid(b.x, b.y, b.w, b.h) || hitsCeil(w, b)) { fail('techo ' + kind, `dentro del techo en el paso ${i}`); return; }
    }
    if (b.x > 25 * TILE) fail('techo ' + kind, 'atravesó el techo bajo');
  });
  T(`techo ${kind}: saltar debajo para la cabeza en la diagonal`, () => {
    const map = ceilCave(kind), w = new TileWorld(map);
    const b = { x: 14 * TILE, y: 8 * TILE - 24, w: 12, h: 24, vx: 0, vy: 0, onGround: true };
    let bumped = false;
    for (let i = 0; i < 120; i++) {
      if (i === 2) b.vy = -400;
      b.vy = Math.min(420, b.vy + GRAV * DT); w.move(b, DT);
      if (b.hitCeiling) bumped = true;
      if (w.rectSolid(b.x, b.y, b.w, b.h) || hitsCeil(w, b)) { fail('salto ' + kind, `la cabeza se metió en el techo (paso ${i})`); return; }
    }
    if (!bumped) fail('salto ' + kind, 'no tocó el techo');
  });
  T(`techo ${kind}: aleatoria (8 recorridos x 2000 pasos)`, () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const map = ceilCave(kind);
    for (let k = 0; k < 8; k++) {
      const w = new TileWorld(map), b = { x: (2 + rnd() * 8) * TILE, y: 6 * TILE, w: 12, h: 24, vx: 0, vy: 0, onGround: false };
      let vx = 0;
      for (let i = 0; i < 2000; i++) {
        if (rnd() < 0.03) vx = [-270, -150, 0, 150, 270][Math.floor(rnd() * 5)];
        b.vx = vx;
        if (b.onGround && rnd() < 0.03) b.vy = -400;
        b.vy = Math.min(420, b.vy + GRAV * DT); w.move(b, DT);
        if (w.rectSolid(b.x, b.y, b.w, b.h) || hitsCeil(w, b)) { fail('aleatoria techo ' + kind, `dentro (recorrido ${k}, paso ${i})`); return; }
      }
    }
  });
}
T('raycast hacia arriba contra un techo inclinado', () => {
  const w = new TileWorld(ceilCave('45'));
  // Casilla 'J' en (10,1): superficie y = 16 + lx; por su centro (lx 8): y = 24.
  const hit = w.raycast(10 * TILE + 8, 7 * TILE, 10 * TILE + 8, 0);
  if (!hit || Math.abs(hit.y - (1 * TILE + 8)) > 0.01) fail('raycast techo', `esperaba y=${TILE + 8}, dio ${hit?.y}`);
  if (!w.solidAtPx(10 * TILE + 12, 1 * TILE + 4) || w.solidAtPx(10 * TILE + 2, 1 * TILE + 10)) fail('solidAtPx techo', 'mal a un lado u otro de la diagonal');
});

for (const [name, fn] of scenarios) {
  const before = fails;
  fn();
  if (fails === before) console.log(`  ✓ ${name}`);
}
console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
process.exit(fails ? 1 : 0);
