// Convierte las salidas de borde antiguas (`exits`) de un mundo en puntos de conexión
// (`links`), conservando exactamente adónde se llega. Uso:
//   node tools/convert-exits.mjs <mundo>            (solo muestra qué haría)
//   node tools/convert-exits.mjs <mundo> --write    (escribe src/data/worlds/<mundo>.js)
// Cada salida pasa a ser un punto en su hueco del borde, "al tocarlo" e invisible, unido
// al punto de la salida de vuelta (ida y vuelta), con "aparece en" = el spawn que tenía.
// Si una salida no tiene vuelta, en el destino se crea un punto de llegada.
import { readFileSync, writeFileSync } from 'fs';
import { patchLevels } from '../src/editor/serialize.js';

const world = process.argv[2];
const write = process.argv.includes('--write');
if (!world) { console.error('Uso: node tools/convert-exits.mjs <mundo> [--write]'); process.exit(1); }
const file = new URL(`../src/data/worlds/${world}.js`, import.meta.url);
const { LEVELS } = await import(file);

const SOLID = new Set(['#', 'X', 'f', 'Y', 'D', 'm']);
// Lo que se abre (membrana, esfínter, fotosensible, falsa) cuenta como hueco.
const passable = (c) => c !== undefined && (!SOLID.has(c) || c === 'X' || c === 'Y' || c === 'f');

// El tramo [a, b] de cada salida (si no tiene `at`, el hueco del borde de ese lado).
function holeOf(lv, ex) {
  const H = lv.grid.length, W = lv.grid[0].length;
  const cells = ex.side === 'left' ? lv.grid.map((r) => r[0]) : ex.side === 'right' ? lv.grid.map((r) => r[W - 1])
    : ex.side === 'top' ? [...lv.grid[0]] : [...lv.grid[H - 1]];
  if (ex.at) return ex.at;
  let a = cells.findIndex(passable);
  if (a < 0) return null;
  let b = a; while (b + 1 < cells.length && passable(cells[b + 1])) b++;
  return [a, b];
}
// El rectángulo del punto en el hueco (2 de hondo en techo y suelo si hay sitio).
function rectOf(lv, ex, [a, b]) {
  const H = lv.grid.length, W = lv.grid[0].length;
  if (ex.side === 'left') return { x: 0, y: a, w: 1, h: b - a + 1 };
  if (ex.side === 'right') return { x: W - 1, y: a, w: 1, h: b - a + 1 };
  const open2 = (row) => { for (let x = a; x <= b; x++) if (!passable(lv.grid[row]?.[x])) return false; return true; };
  if (ex.side === 'top') return { x: a, y: 0, w: b - a + 1, h: open2(1) ? 2 : 1 };
  return open2(H - 2) ? { x: a, y: H - 2, w: b - a + 1, h: 2 } : { x: a, y: H - 1, w: b - a + 1, h: 1 };
}

// 1) Un punto por salida.
const points = {};                     // room -> [{ id, rect, to, spawnInTo, paired }]
let n = 0, skipped = [];
for (const [id, lv] of Object.entries(LEVELS)) {
  points[id] = [];
  for (const ex of lv.exits ?? []) {
    const hole = holeOf(lv, ex);
    if (!hole) { skipped.push(`${id} ${ex.side} → ${ex.to} (sin hueco)`); continue; }
    const used = new Set([...(lv.links ?? []).map((l) => l.id), ...points[id].map((p) => p.id)]);
    let k = 1; while (used.has('p' + k)) k++;
    points[id].push({ id: 'p' + k, rect: rectOf(lv, ex, hole), to: ex.to, spawnInTo: ex.spawn, toLink: ex.toLink ?? null, paired: null });
    n++;
  }
}
// 2) Emparejar cada punto con el de vuelta: el de la otra sala que lleve aquí y cuyo
// spawn (en esta sala) quede más cerca de este hueco.
const ctr = (r) => [r.x + r.w / 2, r.y + r.h / 2];
let pairs = 0, oneWay = [];
for (const [id, list] of Object.entries(points)) for (const p of list) {
  if (p.paired || p.toLink) continue;
  const cands = (points[p.to] ?? []).filter((q) => q.to === id && !q.paired && !q.toLink);
  if (!cands.length) { oneWay.push(p); continue; }
  const [cx, cy] = ctr(p.rect);
  cands.sort((u, v) => Math.hypot(u.spawnInTo[0] - cx, u.spawnInTo[1] - cy) - Math.hypot(v.spawnInTo[0] - cx, v.spawnInTo[1] - cy));
  const q = cands[0];
  p.paired = { room: p.to, id: q.id }; q.paired = { room: id, id: p.id };
  p.arrive = q.spawnInTo;               // al llegar a p (en esta sala), donde dejaba la salida de vuelta
  q.arrive = p.spawnInTo;
  pairs++;
}
// 3) Salidas de ida sin vuelta: un punto de llegada en el destino, en su spawn.
for (const p of oneWay) {
  const dest = points[p.to];
  const used = new Set([...(LEVELS[p.to].links ?? []).map((l) => l.id), ...dest.map((q) => q.id)]);
  let k = 1; while (used.has('p' + k)) k++;
  const arr = { id: 'p' + k, rect: { x: p.spawnInTo[0], y: p.spawnInTo[1] - 1, w: 1, h: 2 }, to: '', arrivalOnly: true };
  dest.push(arr);
  p.paired = { room: p.to, id: arr.id };
}

// 4) Escribir los links y quitar las salidas.
const changed = {};
for (const [id, list] of Object.entries(points)) {
  if (!list.length && !(LEVELS[id].exits ?? []).length) continue;
  const lv = structuredClone(LEVELS[id]);
  lv.links = [...(lv.links ?? []), ...list.map((p) => {
    const o = { id: p.id, ...p.rect, to: p.arrivalOnly ? '' : p.to, toLink: p.arrivalOnly ? '' : (p.toLink ?? p.paired?.id ?? ''), trigger: 'touch', look: 'hidden' };
    if (p.arrive) o.arrive = [...p.arrive];
    return o;
  })];
  delete lv.exits;
  changed[id] = lv;
}
console.log(`Mundo ${world}: ${n} salidas → ${n} puntos · ${pairs} pares de ida y vuelta · ${oneWay.length} de solo ida${oneWay.length ? ` (${oneWay.map((p) => p.to).join(', ')})` : ''}`);
if (skipped.length) console.log('Sin hueco (se omiten):', skipped.join('; '));
if (!write) { console.log('(no se ha escrito nada: añade --write)'); process.exit(0); }
const text = readFileSync(file, 'utf8');
writeFileSync(file, patchLevels(text, changed));
console.log(`Escrito src/data/worlds/${world}.js (${Object.keys(changed).length} salas).`);
