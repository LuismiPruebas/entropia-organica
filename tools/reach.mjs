// Alcanzabilidad de una sala con la física real del jugador.
// Explora (BFS) todos los puntos de apoyo alcanzables desde un spawn, probando
// caminar, saltar y doble saltar con distintos controles en el aire.
//
//   node tools/reach.mjs <sala> <col,fila> [doble] [velocidad]
//   p. ej.: node tools/reach.mjs A 5,11 doble
//
// Imprime la sala marcando con '*' los apoyos alcanzables, con '@' el inicio, y
// lista las salidas y objetos alcanzables. También se puede importar: reach(...).
import { TileWorld, TILE } from '../src/core/Physics.js';
import { LEVELS } from '../src/data/levels.js';

const GRAVITY = 900, JUMP_V = 320, MOVE = 92, MAX_FALL = 380, DT = 1 / 60;
const W = 12, H = 28; // caja del jugador (Player.js)

function simulate(world, sx, sy, { dir0, dir1, switchAt, jump, dbl, speed }) {
  const b = { x: sx, y: sy, w: W, h: H, vx: 0, vy: 0, onGround: true };
  let air = 1, left = false, touched = new Set();
  for (let i = 0; i < 150; i++) {
    const dir = i < switchAt ? dir0 : dir1;
    const accel = b.onGround ? 900 : 600, target = dir * speed;
    if (b.vx < target) b.vx = Math.min(target, b.vx + accel * DT);
    else if (b.vx > target) b.vx = Math.max(target, b.vx - accel * DT);
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * DT);
    if (i === 0 && jump) b.vy = -JUMP_V;
    if (dbl && air > 0 && !b.onGround && b.vy >= 0 && i > 2) { b.vy = -JUMP_V; air--; }
    world.move(b, DT);
    for (const t of world.tilesIn(b.x, b.y, b.w, b.h)) touched.add(`${t.cx},${t.cy}`);
    if (b.x + W / 2 < 0) return { exit: 'left', touched };
    if (b.x + W / 2 > world.pixelW) return { exit: 'right', touched };
    if (b.y + H / 2 < 0) return { exit: 'top', touched };
    if (b.y > world.pixelH) return { exit: 'bottom', touched };
    if (!b.onGround) left = true;
    if (b.onGround && (left || i > 20)) {
      return { land: [Math.floor((b.x + W / 2) / TILE), Math.floor((b.y + H - 1) / TILE)], x: b.x, touched };
    }
  }
  return { touched };
}

// `grid` permite probar una cuadrícula que aún no está en levels.js (diseño de salas).
export function reach(roomId, [tx, ty], { doubleJump = false, speed = MOVE, open = [], grid: given = null } = {}) {
  const lv = given ? { grid: given } : LEVELS[roomId];
  // Las membranas y tiles que se consideran abiertos (p. ej. 'X' con embestida, 'f' con luz).
  const grid = lv.grid.map((r) => [...r].map((c) => (open.includes(c) ? '.' : c)).join(''));
  const world = new TileWorld(grid);
  const seen = new Set(), exits = new Set(), touched = new Set();
  const queue = [[tx * TILE + 3, (ty + 1) * TILE - H]];
  const key = (x, y) => `${Math.round(x / 4)},${Math.round(y)}`;
  while (queue.length) {
    const [x, y] = queue.shift();
    const k = key(x, y);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const dir0 of [-1, 0, 1]) for (const dir1 of [-1, 0, 1]) for (const switchAt of [0, 8, 16, 24]) {
      if (switchAt === 0 && dir1 !== dir0) continue;
      for (const [jump, dbl] of [[false, false], [true, false], ...(doubleJump ? [[true, true]] : [])]) {
        if (!jump && dir0 === 0) continue;
        const r = simulate(world, x, y, { dir0, dir1, switchAt, jump, dbl, speed });
        r.touched.forEach((t) => touched.add(t));
        if (r.exit) exits.add(r.exit);
        else if (r.land) {
          const ny = (r.land[1] + 1) * TILE - H;
          // Muestrea varias x en el tile de aterrizaje para no perder bordes.
          for (const nx of [r.x, r.land[0] * TILE + 3]) if (!seen.has(key(nx, ny))) queue.push([nx, ny]);
        }
      }
    }
    if (seen.size > 4000) break;
  }
  const standing = new Set([...seen].map((k) => {
    const [qx, y] = k.split(',').map(Number);
    return `${Math.floor((qx * 4 + W / 2) / TILE)},${Math.floor((y + H - 1) / TILE)}`;
  }));
  return { standing, exits, touched, world };
}

// --- CLI ---
if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [roomId, start, ...flags] = process.argv.slice(2);
  const [tx, ty] = start.split(',').map(Number);
  const res = reach(roomId, [tx, ty], { doubleJump: flags.includes('doble'), open: flags.includes('abierto') ? ['X', 'f', 'Y'] : [] });
  const lv = LEVELS[roomId];
  lv.grid.forEach((row, y) => {
    console.log([...row].map((c, x) => (x === tx && y === ty ? '@' : res.standing.has(`${x},${y}`) && c === '.' ? '*' : c)).join(''));
  });
  console.log('Salidas alcanzables:', [...res.exits].join(', ') || 'ninguna');
  const items = [];
  lv.grid.forEach((row, y) => [...row].forEach((c, x) => { if (/[0-9&bBSOQhgH*]/.test(c)) items.push(`${c}@${x},${y}:${res.touched.has(`${x},${y}`) ? 'SI' : 'no'}`); }));
  console.log('Objetos alcanzables:', items.join('  '));
}
