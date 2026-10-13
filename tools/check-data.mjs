// Valida los datos del juego: filas de igual ancho, salidas y spawns coherentes,
// enemigos y sprites existentes. Uso: npm run check
import { LEVELS, START } from '../src/data/levels.js';
import { ENEMIES } from '../src/data/enemies.js';
import { SPRITES } from '../src/data/sprites.js';
import { BIOMES } from '../src/data/biomes.js';
import { TileWorld, TILE } from '../src/core/Physics.js';

const SOLID = new Set(['#', 'X', 'f', 'Y', 'D', 'm']);
let errors = 0;
const fail = (msg) => { errors++; console.error('  ✗', msg); };

const cell = (room, x, y) => LEVELS[room].grid[y]?.[x];

for (const [id, lv] of Object.entries(LEVELS)) {
  console.log(`Sala ${id} (${lv.name})`);
  const w = lv.grid[0].length;
  if (!BIOMES[lv.biome]) fail(`bioma desconocido ${lv.biome}`);
  if (!lv.map) fail('falta la posición en el mapa (map)');
  lv.grid.forEach((row, y) => { if (row.length !== w) fail(`fila ${y} mide ${row.length}, se esperaba ${w}`); });
  for (const e of lv.enemies ?? []) { // una sala puede no tener enemigos
    if (!ENEMIES[e.type]) fail(`enemigo desconocido ${e.type}`);
    if (SOLID.has(cell(id, e.x, e.y))) fail(`enemigo ${e.type} dentro de una pared en [${e.x},${e.y}]`);
    // Su caja entera (colocada como en Enemy.js) tampoco puede empezar dentro de la roca.
    const d = ENEMIES[e.type];
    if (d) {
      const hanging = ['ceilingEye', 'pod', 'bossGland'].includes(d.behavior);
      const floating = ['darter'].includes(d.behavior);
      const bx = e.x * TILE + (TILE - d.w) / 2;
      const by = hanging ? e.y * TILE : floating ? e.y * TILE + (TILE - d.h) / 2 : (e.y + 1) * TILE - d.h;
      if (new TileWorld(lv.grid).rectSolid(bx + 0.5, by + 0.5, d.w - 1, d.h - 1)) fail(`la caja de ${e.type} (${d.w}x${d.h}) empieza dentro de la roca en [${e.x},${e.y}]`);
    }
  }
  // Mecanismos: referencias coherentes.
  const gateIds = new Set((lv.gates ?? []).map((g) => g.id));
  for (const p of lv.pads ?? []) {
    if (!gateIds.has(p.opens)) fail(`ganglio en [${p.x},${p.y}] abre una compuerta inexistente ${p.opens}`);
    if (!SOLID.has(cell(id, p.x, p.y + 1))) fail(`ganglio en [${p.x},${p.y}] sin suelo`);
  }
  if (lv.pods && !gateIds.has(lv.pods.opens)) fail(`los sacos en orden abren una compuerta inexistente ${lv.pods.opens}`);
  for (const v of [...(lv.valves ?? []), ...(lv.floats ?? [])]) if (!lv.fluids?.[v.pool]) fail(`válvula/balsa ligada a la cubeta ${v.pool}, que no existe`);
  for (const v of lv.valves ?? []) if (!lv.fluids?.[v.pool]?.manual) fail(`la cubeta ${v.pool} de una válvula debe ser manual`);
  for (const m of lv.movers ?? []) if (!Array.isArray(m.path) || !m.path.length) fail();
  for (const m of lv.movers ?? []) if (!Array.isArray(m.path) || !m.path.length) fail(`plataforma móvil en [${m.x},${m.y}] sin ruta (path)`);
  for (const g of lv.gates ?? []) for (let i = 0; i < g.h; i++) if (cell(id, g.x, g.y + i) !== '.') fail(`compuerta ${g.id}: la celda [${g.x},${g.y + i}] debe ser aire en la cuadrícula`);
  for (const [x, y] of lv.nodules ?? []) {
    if (SOLID.has(cell(id, x, y)) || !SOLID.has(cell(id, x, y + 1))) fail(`nódulo en [${x},${y}] sin hueco o sin suelo`);
  }
  for (const ex of lv.exits) {
    if (!LEVELS[ex.to]) { fail(`salida hacia sala inexistente ${ex.to}`); continue; }
    const [x, y] = ex.spawn;
    if (SOLID.has(cell(ex.to, x, y))) fail(`spawn de ${ex.side}->${ex.to} [${x},${y}] es sólido`);
    if (!SOLID.has(cell(ex.to, x, y + 1))) fail(`spawn de ${ex.side}->${ex.to} [${x},${y}] no tiene suelo`);
    // El cuerpo mide casi dos tiles: también ha de caber la cabeza.
    if (SOLID.has(cell(ex.to, x, y - 1))) fail(`spawn de ${ex.side}->${ex.to} [${x},${y}]: no cabe (techo encima)`);
    const h = lv.grid.length;
    const [from, to] = ex.at ?? [0, Infinity];
    let edge;
    if (ex.side === 'left' || ex.side === 'right') {
      const col = ex.side === 'left' ? 0 : w - 1;
      edge = lv.grid.map((row, y) => (y >= from && y <= to ? row[col] : '#'));
    } else {
      const row = ex.side === 'top' ? lv.grid[0] : lv.grid[h - 1];
      edge = [...row].map((c, x) => (x >= from && x <= to ? c : '#'));
    }
    // Un esfínter sellado (Y) o una membrana agrietada (X) cuentan como hueco: se abren.
    if (!edge.some((c) => !SOLID.has(c) || c === 'Y' || c === 'f' || c === 'X')) fail(`la salida ${ex.side} no tiene hueco en el borde`);
    // Por una salida lateral pasa el cuerpo entero: hueco de al menos 2 tiles de alto.
    if (ex.side === 'left' || ex.side === 'right') {
      let run = 0, best = 0;
      for (const c of edge) { run = !SOLID.has(c) || c === 'Y' || c === 'f' || c === 'X' ? run + 1 : 0; best = Math.max(best, run); }
      if (best < 2) fail(`la salida ${ex.side} mide ${best} tile de alto; el cuerpo necesita 2`);
    }
    // La sala de destino debe tener una salida de vuelta.
    if (!LEVELS[ex.to].exits.some((b) => b.to === id)) fail(`${ex.to} no tiene salida de vuelta a ${id}`);
  }
}
if (SOLID.has(cell(START.room, ...START.spawn))) fail('el spawn inicial es sólido');
if (SOLID.has(cell(START.room, START.spawn[0], START.spawn[1] - 1))) fail('el spawn inicial no deja sitio a la cabeza');

for (const [id, sp] of Object.entries(SPRITES)) {
  for (const [f, rows] of Object.entries(sp.frames)) {
    const w = rows[0].length;
    rows.forEach((r, i) => { if (r.length !== w) fail(`sprite ${id}.${f} fila ${i} mide ${r.length}, se esperaba ${w}`); });
  }
}

console.log(errors ? `\n${errors} error(es)` : '\nDatos OK');
process.exit(errors ? 1 : 0);
