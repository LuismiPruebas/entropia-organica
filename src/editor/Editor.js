// Editor de niveles de Entropía Orgánica (editor.html).
// Carga las salas del mapa activo (data/levels.js elige el mundo de data/worlds/), permite pintar tiles, colocar elementos, etiquetar
// zonas, ampliar o crear salas, comprobar el alcance con la física real y guardar de
// vuelta en el archivo del mapa (src/data/worlds/<id>.js) (solo las salas tocadas) o probar en el juego sin guardar.
import { LEVELS, START, WORLDS, WORLD_ID, PHYSICAL_LINKS, setWorld } from '../data/levels.js';
import { BIOMES } from '../data/biomes.js';
import { TileWorld } from '../core/Physics.js';
import { paintRoom } from '../factory/TilePainter.js';
import { reach } from '../../tools/reach.mjs';
import { TILES, TILE_BY_CHAR, SOLID, KINDS, ENEMY_TYPES, ENEMIES } from './schema.js';
import { patchLevels } from './serialize.js';
import { NODE_DOSES, NODE_HEAL } from '../state/State.js';
import { enemyThumb } from './EnemyThumbs.js';
import { paintShrineBase, drawShrine, SW as SHRINE_W, SH as SHRINE_H } from '../entities/ShrineArt.js';
import { faceData } from '../data/faces.js';
import { linkArrival } from '../data/connections.js';
import { BACKDROP_VARIANTS } from '../factory/Backdrop.js';
import { DECOR, decorPreview, neuronPairs, WALL_DEFAULT, WALL_TYPE } from '../entities/Decor.js';
import { baseNode } from '../data/nodes.js';

const $ = (id) => document.getElementById(id);
const clone = (v) => JSON.parse(JSON.stringify(v));
const CELL = [16, 14]; // celda del mapa (tiles)

// ---------------------------------------------------------------- estado
const S = {
  rooms: clone(LEVELS),
  start: clone(START),
  id: null,
  tool: 'brush',        // brush | rect | fill | pick | blob | place | select
  tile: '#',
  kind: 'enemies',
  brush: 1,
  zoom: 16,
  pan: { x: 20, y: 20 },
  view: 'schema',       // schema | game
  sel: null,            // { kind, index }
  dirty: new Set(),
  removed: new Set(),
  undo: {}, redo: {},
  reach: null, reachStart: null, reachDouble: true, reachOpen: true,
  testSpawn: null,
  testSpawns: (() => { try { return JSON.parse(localStorage.getItem('linfa.editor.spawns') ?? '{}'); } catch { return {}; } })(),
  pickSpawn: false,
  fileHandle: null,
  gameCanvas: null, gameCanvasFor: null,
};
const room = () => S.rooms[S.id];

// ---------------------------------------------------------------- deshacer
function snapshot() {
  const id = S.id;
  (S.undo[id] ??= []).push(JSON.stringify(room()));
  if (S.undo[id].length > 120) S.undo[id].shift();
  S.redo[id] = [];
}
function snapshotRoom(id) {
  (S.undo[id] ??= []).push(JSON.stringify(S.rooms[id]));
  S.redo[id] = [];
}
function touch() {
  CTX_CACHE.delete(S.id);
  S.dirty.add(S.id);
  S.gameCanvasFor = null;
  S.reach = null;
  refreshRoomList();
  draw();
}
function undo(redo = false) {
  const id = S.id, from = redo ? S.redo : S.undo, to = redo ? S.undo : S.redo;
  const st = from[id]?.pop();
  if (!st) return;
  (to[id] ??= []).push(JSON.stringify(room()));
  S.rooms[id] = JSON.parse(st);
  S.sel = null;
  touch();
  renderInspector();
  renderRoomPanel();
}

// ---------------------------------------------------------------- cuadrícula
const W = () => room().grid[0].length, H = () => room().grid.length;
// Punto en un hueco de techo o suelo de un mapa sin teletransporte (levels.js physicalLinks).
const physicalHole = (l, r = room()) => PHYSICAL_LINKS && l.x > 0 && l.x + (l.w ?? 1) < r.grid[0].length && (l.y === 0 || l.y + (l.h ?? 2) >= r.grid.length);
const getTile = (x, y) => (x < 0 || y < 0 || x >= W() || y >= H() ? '#' : room().grid[y][x]);
function setTile(x, y, c) {
  if (x < 0 || y < 0 || x >= W() || y >= H()) return;
  const r = room().grid[y];
  if (r[x] === c) return;
  room().grid[y] = r.slice(0, x) + c + r.slice(x + 1);
}
// Velo de membrana: una capa encima de las casillas (r.veil = [[x, y], ...]); pintarlo
// no cambia lo que hay debajo. 'G' lo pone y '-G' lo quita.
const hasVeil = (r, x, y) => (r.veil ?? []).some(([vx, vy]) => vx === x && vy === y);
function setVeil(r, x, y, on) {
  if (x < 0 || y < 0 || y >= r.grid.length || x >= r.grid[0].length || hasVeil(r, x, y) === on) return;
  if (on) (r.veil ??= []).push([x, y]);
  else { r.veil = r.veil.filter(([vx, vy]) => vx !== x || vy !== y); if (!r.veil.length) delete r.veil; }
}
// El velo dentro de un rectángulo, relativo a su esquina; y quitarlo de ahí.
const veilIn = (r, [x, y, w, h]) => (r.veil ?? []).filter(([vx, vy]) => inRect([x, y, w, h], vx, vy)).map(([vx, vy]) => [vx - x, vy - y]);
function clearVeil(r, rc) { if (r.veil) { r.veil = r.veil.filter(([vx, vy]) => !inRect(rc, vx, vy)); if (!r.veil.length) delete r.veil; } }
function paintAt(x, y, c, size = S.brush, round = false) {
  const R = Math.floor((size - 1) / 2);
  for (let dy = -R; dy <= size - 1 - R; dy++) for (let dx = -R; dx <= size - 1 - R; dx++) {
    if (round && dx * dx + dy * dy > (size / 2) * (size / 2) + 0.5) continue;
    if (c === 'G' || c === '-G') setVeil(room(), x + dx, y + dy, c === 'G');
    else setTile(x + dx, y + dy, c);
  }
  // Borrar a aire también quita las marcas de objeto oculto de esas casillas:
  // la marca va con el objeto que esconde.
  const r = room();
  if (c === '.' && r.hidden) {
    r.hidden = r.hidden.filter(([hx, hy]) => hx - x < -R || hx - x > size - 1 - R || hy - y < -R || hy - y > size - 1 - R
      || (round && (hx - x) ** 2 + (hy - y) ** 2 > (size / 2) * (size / 2) + 0.5));
    if (!r.hidden.length) delete r.hidden;
    if (S.sel?.kind === 'hidden') S.sel = null;
  }
}
function floodFill(x, y, c) {
  // Con el velo: cubre (o descubre) la zona de casillas iguales, sin cambiarlas.
  if (c === 'G' || c === '-G') {
    const from = getTile(x, y), stack = [[x, y]], seen = new Set();
    while (stack.length) {
      const [px, py] = stack.pop(), k = px + ',' + py;
      if (seen.has(k) || px < 0 || py < 0 || px >= W() || py >= H() || getTile(px, py) !== from) continue;
      seen.add(k);
      setVeil(room(), px, py, c === 'G');
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    return;
  }
  const from = getTile(x, y);
  if (from === c) return;
  const stack = [[x, y]], seen = new Set();
  while (stack.length) {
    const [px, py] = stack.pop(), k = px + ',' + py;
    if (seen.has(k) || px < 0 || py < 0 || px >= W() || py >= H() || getTile(px, py) !== from) continue;
    seen.add(k);
    setTile(px, py, c);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

// Desplaza todo lo de la sala (y las llegadas desde otras salas) al ampliarla por
// arriba o por la izquierda.
function shiftRoom(dx, dy) {
  const r = room();
  // Regla general: coordenadas sueltas [x, y], campos x / y, rangos x: [a, b] y top / bottom.
  const shift = (o) => {
    if (Array.isArray(o)) { o[0] += dx; o[1] += dy; return; }
    if (typeof o.x === 'number') o.x += dx; else if (Array.isArray(o.x)) o.x = o.x.map((v) => v + dx);
    if (typeof o.y === 'number') o.y += dy;
    if (typeof o.top === 'number') { o.top += dy; o.bottom += dy; }
    if (Array.isArray(o.arrive)) o.arrive = [o.arrive[0] + dx, o.arrive[1] + dy]; // llegada de un punto de conexión
  };
  for (const key of Object.keys(KINDS)) if (key !== 'exits' && key !== 'pods') for (const o of r[key] ?? []) shift(o);
  if (r.pods) r.pods.at = r.pods.at.map(([x, y]) => [x + dx, y + dy]);
  if (r.veil) r.veil = r.veil.map(([x, y]) => [x + dx, y + dy]);
  for (const ex of r.exits ?? []) {
    if (ex.at && (ex.side === 'left' || ex.side === 'right')) ex.at = ex.at.map((v) => v + dy);
    if (ex.at && (ex.side === 'top' || ex.side === 'bottom')) ex.at = ex.at.map((v) => v + dx);
  }
  for (const [oid, other] of Object.entries(S.rooms)) for (const ex of other.exits ?? []) {
    if (ex.to === S.id) { ex.spawn = [ex.spawn[0] + dx, ex.spawn[1] + dy]; S.dirty.add(oid); }
  }
  if (S.start.room === S.id) S.start.spawn = [S.start.spawn[0] + dx, S.start.spawn[1] + dy];
}
// Mete dentro de la sala r un elemento que se haya quedado fuera (total o parcialmente):
// lo pega al borde más cercano. Devuelve true si lo ha movido.
function clampInside(r, kind, o) {
  const W = r.grid[0].length, H = r.grid.length;
  if (kind === 'pods' || Array.isArray(o)) {
    const nx = Math.max(0, Math.min(W - 1, o[0])), ny = Math.max(0, Math.min(H - 1, o[1]));
    if (nx === o[0] && ny === o[1]) return false;
    o[0] = nx; o[1] = ny; return true;
  }
  const K = KINDS[kind];
  if (!K?.box || !K.move) return false;
  const [bx, by, bw, bh] = K.box(o, r);
  const nx = Math.max(0, Math.min(W - Math.min(bw, W), bx)), ny = Math.max(0, Math.min(H - Math.min(bh, H), by));
  if (nx === bx && ny === by) return false;
  if (kind === 'enemies') K.move(o, o.x + nx - bx, o.y + ny - by, r); else K.move(o, nx, ny, r);
  return true;
}
// Todo lo de la sala que esté fuera, dentro. Devuelve cuántos ha movido.
function clampRoom(r) {
  let n = 0;
  for (const kind of Object.keys(KINDS)) if (kind !== 'exits') for (const o of (kind === 'pods' ? r.pods?.at : r[kind]) ?? []) if (clampInside(r, kind, o)) n++;
  const W = r.grid[0].length, H = r.grid.length, inside = ([x, y]) => x >= 0 && y >= 0 && x < W && y < H;
  if (r.veil) { r.veil = r.veil.filter(inside); if (!r.veil.length) delete r.veil; }
  if (r.hidden) { r.hidden = r.hidden.filter(inside); if (!r.hidden.length) delete r.hidden; }
  return n;
}
function resize(side, n) {
  snapshot();
  const r = room(), w = W();
  if (side === 'top') { if (n > 0) r.grid = [...Array(n).fill('#'.repeat(w)), ...r.grid]; else r.grid = r.grid.slice(-n); shiftRoom(0, n); }
  if (side === 'bottom') { if (n > 0) r.grid = [...r.grid, ...Array(n).fill('#'.repeat(w))]; else r.grid = r.grid.slice(0, n); }
  if (side === 'left') { r.grid = r.grid.map((row) => (n > 0 ? '#'.repeat(n) + row : row.slice(-n))); shiftRoom(n, 0); }
  if (side === 'right') r.grid = r.grid.map((row) => (n > 0 ? row + '#'.repeat(n) : row.slice(0, n)));
  // En el mapa: la esquina sube o se corre lo que crece por arriba o por la izquierda (en
  // celdas, con decimales si no es una celda entera) y el tamaño sigue al de la sala.
  const q = (v) => Math.round(v * 1000) / 1000;
  r.map ??= [0, 0, 1, 1];
  if (side === 'top') { r.map[1] = q(r.map[1] - n / CELL[1]); S.pan.y -= n * S.zoom; }
  if (side === 'left') { r.map[0] = q(r.map[0] - n / CELL[0]); S.pan.x -= n * S.zoom; }
  r.map[2] = q(W() / CELL[0]); r.map[3] = q(H() / CELL[1]);
  // Al recortar, lo que se quedaría fuera se recoloca dentro (pegado al borde).
  if (n < 0) { const moved = clampRoom(r); if (moved) $('msg').textContent = `Recortada: ${moved} elemento${moved > 1 ? 's' : ''} que quedaba${moved > 1 ? 'n' : ''} fuera se ha${moved > 1 ? 'n' : ''} metido dentro, pegado${moved > 1 ? 's' : ''} al borde.`; }
  CTX_CACHE.delete(S.id);
  touch();
  renderRoomPanel(); drawMap();
}

// ---------------------------------------------------------------- lienzo
const cv = $('grid'), g = cv.getContext('2d');
function fitCanvas() {
  const r = cv.parentElement.getBoundingClientRect();
  cv.width = r.width; cv.height = r.height;
  draw();
}
const toTile = (ev) => {
  const r = cv.getBoundingClientRect();
  return [Math.floor((ev.clientX - r.left - S.pan.x) / S.zoom), Math.floor((ev.clientY - r.top - S.pan.y) / S.zoom)];
};

function gameView() {
  if (S.gameCanvasFor === S.id && S.gameCanvas) return S.gameCanvas;
  try {
    const world = new TileWorld(room().grid);
    const biome = BIOMES[room().biome] ?? BIOMES.nervioso;
    S.gameCanvas = paintRoom(world, biome).color;
  } catch (e) { S.gameCanvas = null; console.warn(e); }
  S.gameCanvasFor = S.id;
  return S.gameCanvas;
}

// Colores de la vista esquemática según el bioma: la pared (#) es el mismo tile en
// todas partes, pero cada bioma la construye con su material, así que aquí toma su tono.
const mixHex = (a, b, k) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
};
function biomeColors(b) {
  const B = BIOMES[b] ?? BIOMES.nervioso;
  return { wall: mixHex(B.mapColor, '#140c10', 0.55), air: mixHex(B.bg?.base ?? '#151018', '#000000', 0.1) };
}

// ---------------------------------------------------------------- contexto del mundo
// Alrededor de la sala abierta se ven las demás en su sitio del mapa (gris translúcido,
// con su nombre), la cuadrícula de celdas del mapa y, si se pide, el calco del mapa
// original: así se sabe dónde se está y dónde queda sitio. Coordenadas: la casilla 0,0
// de la sala abierta es la esquina de su celda de mapa (map[0], map[1]).
const CTX_CACHE = new Map();               // id -> lienzo de 1 px por casilla
const SCREEN = [24, 13.5];                 // casillas que caben en una pantalla de juego
function roomThumb(id, r) {
  let c = CTX_CACHE.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  const h = r.grid.length, w = r.grid[0].length;
  c.width = w; c.height = h;
  const x = c.getContext('2d'), img = x.createImageData(w, h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const ch = r.grid[yy][xx], i = (yy * w + xx) * 4, wall = SOLID.has(ch) || TILE_BY_CHAR[ch]?.slope;
    img.data.set(wall ? [150, 140, 150, 95] : [60, 50, 60, 45], i);
  }
  x.putImageData(img, 0, 0);
  CTX_CACHE.set(id, c);
  return c;
}
const cellOf = (r, tx, ty) => [(r.map?.[0] ?? 0) + Math.floor(tx / CELL[0]), (r.map?.[1] ?? 0) + Math.floor(ty / CELL[1])];
const roomAt = (cx, cy) => Object.entries(S.rooms).find(([, o]) => o.map && cx >= o.map[0] && cy >= o.map[1] && cx < o.map[0] + o.map[2] && cy < o.map[1] + o.map[3]);
function drawContext(z, r) {
  const m = r.map ?? [0, 0, 1, 1];
  const toX = (cx) => (cx - m[0]) * CELL[0] * z, toY = (cy) => (cy - m[1]) * CELL[1] * z;
  // Celdas visibles.
  const c0 = cellOf(r, -S.pan.x / z, -S.pan.y / z), c1 = cellOf(r, (cv.width - S.pan.x) / z, (cv.height - S.pan.y) / z);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.beginPath();
  for (let cx = c0[0]; cx <= c1[0] + 1; cx++) { g.moveTo(toX(cx) + 0.5, toY(c0[1])); g.lineTo(toX(cx) + 0.5, toY(c1[1] + 1)); }
  for (let cy = c0[1]; cy <= c1[1] + 1; cy++) { g.moveTo(toX(c0[0]), toY(cy) + 0.5); g.lineTo(toX(c1[0] + 1), toY(cy) + 0.5); }
  g.stroke();
  // Calco del mapa original (contornos discontinuos).
  if ($('map-ghost')?.checked && GHOST) for (const [id, o] of Object.entries(GHOST)) {
    if (!o.map) continue;
    g.strokeStyle = 'rgba(200,190,200,0.35)'; g.setLineDash([6, 4]); g.lineWidth = 1.5;
    g.strokeRect(toX(o.map[0]) + 2, toY(o.map[1]) + 2, o.map[2] * CELL[0] * z - 4, o.map[3] * CELL[1] * z - 4);
    g.setLineDash([]);
    g.fillStyle = 'rgba(200,190,200,0.4)'; g.font = '12px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(`original: ${id} ${o.name}`, toX(o.map[0]) + 6, toY(o.map[1]) + 6);
  }
  // Las demás salas de este mapa, en gris translúcido.
  for (const [id, o] of Object.entries(S.rooms)) {
    if (id === S.id || !o.map || !o.grid) continue;
    const x = toX(o.map[0]), y = toY(o.map[1]);
    g.drawImage(roomThumb(id, o), x, y, o.grid[0].length * z, o.grid.length * z);
    g.strokeStyle = 'rgba(200,190,200,0.45)'; g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, o.grid[0].length * z - 1, o.grid.length * z - 1);
    g.fillStyle = 'rgba(230,220,230,0.75)'; g.font = 'bold 13px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(`${id} · ${o.name}  (doble clic para abrir)`, x + 6, y + 6);
    // Sus puntos de conexión, en su sitio: en amarillo los que llevan a esta sala (ahí
    // es donde tiene que haber paso), en cian los demás.
    for (const l of o.links ?? []) {
      const here = l.to === S.id, lx = x + l.x * z, ly = y + l.y * z, lw = (l.w ?? 1) * z, lh = (l.h ?? 2) * z;
      g.fillStyle = here ? 'rgba(255,210,63,0.45)' : 'rgba(64,224,255,0.3)';
      g.fillRect(lx, ly, lw, lh);
      g.strokeStyle = here ? '#ffd23f' : '#40e0ff'; g.lineWidth = 2;
      g.strokeRect(lx + 1, ly + 1, lw - 2, lh - 2);
      g.fillStyle = here ? '#ffd23f' : '#40e0ff'; g.font = 'bold 11px monospace'; g.textBaseline = 'bottom';
      g.fillText(`${id}·${l.id}${l.to ? ' → ' + l.to + (l.toLink ? '·' + l.toLink : '') : ''}`, lx, ly - 2);
      g.textBaseline = 'top';
    }
  }
}

// ---------------------------------------------------------------- sala nueva
// "Nueva sala" deja un bloque fantasma en el lienzo, encajado en las celdas del mapa:
// clic para ponerlo con el tamaño mínimo (2x1 celdas: algo más de una pantalla) o
// arrastrar para abarcar un espacio mayor. Se pone rojo si pisa otra sala. Esc cancela.
// ¿Cabe la sala en esa posición del mapa sin pisar a otra?
function mapFree(id, x, y) {
  const r = S.rooms[id], w = r.map?.[2] ?? 1, h = r.map?.[3] ?? 1;
  return !Object.entries(S.rooms).some(([k, o]) => k !== id && o.map && x < o.map[0] + o.map[2] - MAP_EPS && x + w > o.map[0] + MAP_EPS && y < o.map[1] + o.map[3] - MAP_EPS && y + h > o.map[1] + MAP_EPS);
}
function startPlacing() {
  if (!S.id) { createRoomAt(0, 0, 2, 1); return; }
  S.placing = { cell: null, from: null };
  S.newBiome = room()?.biome ?? 'nervioso';
  showNewRoomBox(true);
  $('msg').textContent = 'Nueva sala: clic en un hueco libre (tamaño mínimo) o arrastra para marcar todo su espacio. Esc o clic derecho para cancelar. Aléjate con la rueda para ver más.';
  draw();
}
// Cajita flotante mientras se coloca una sala nueva: primero su bioma y luego su fondo
// (si ese bioma tiene varios). Empieza con el bioma de la sala abierta.
function showNewRoomBox(on) {
  let el = $('newroom-box');
  if (!on) { if (el) el.hidden = true; return; }
  if (!BIOMES[S.newBiome]) S.newBiome = room()?.biome ?? 'nervioso';
  const bgs = BACKDROP_VARIANTS[S.newBiome];
  if (!el) {
    el = document.createElement('div'); el.id = 'newroom-box'; el.className = 'wiz';
    el.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:5;';
    cv.parentElement.style.position = 'relative';
    cv.parentElement.appendChild(el);
  }
  if (!bgs || (S.newBackdrop ?? 1) > bgs.length) S.newBackdrop = 1;
  el.innerHTML = `Sala nueva · bioma: <select id="newroom-biome">${Object.entries(BIOMES).map(([id, b]) => `<option value="${id}"${id === S.newBiome ? ' selected' : ''}>${b.name}</option>`).join('')}</select>`
    + (bgs?.length > 1 ? ` · fondo: <select id="newroom-bg">${bgs.map((b, i) => `<option value="${i + 1}"${i + 1 === S.newBackdrop ? ' selected' : ''}>${b}</option>`).join('')}</select>` : '');
  el.hidden = false;
  $('newroom-biome').onchange = (e) => { S.newBiome = e.target.value; S.newBackdrop = 1; showNewRoomBox(true); };
  if ($('newroom-bg')) $('newroom-bg').onchange = (e) => { S.newBackdrop = Number(e.target.value); };
}
function placingRect() {
  const p = S.placing;
  if (!p?.cell) return null;
  if (!p.from) return [p.cell[0], p.cell[1], 2, 1];
  const x0 = Math.min(p.from[0], p.cell[0]), y0 = Math.min(p.from[1], p.cell[1]);
  const w = Math.max(2, Math.abs(p.cell[0] - p.from[0]) + 1), h = Math.max(1, Math.abs(p.cell[1] - p.from[1]) + 1);
  return [x0, y0, w, h];
}
// Holgura de medio tile: una sala en x = 1.001 (posiciones con decimales) no "pisa" la celda de al lado.
const MAP_EPS = 0.03;
const overlapsRoom = ([x, y, w, h]) => Object.values(S.rooms).some((o) => o.map && x < o.map[0] + o.map[2] - MAP_EPS && x + w > o.map[0] + MAP_EPS && y < o.map[1] + o.map[3] - MAP_EPS && y + h > o.map[1] + MAP_EPS);
function nextRoomId() {
  const pre = (S.id ?? 'A').replace(/\d+$/, '') || 'A';
  for (let n = 2; ; n++) if (!S.rooms[pre + n]) return pre + n;
}
function drawPlacing(z, r) {
  const rc = placingRect();
  if (!rc) return;
  const m = r.map ?? [0, 0, 1, 1], [x, y, w, h] = rc, bad = overlapsRoom(rc);
  const px = (x - m[0]) * CELL[0] * z, py = (y - m[1]) * CELL[1] * z, pw = w * CELL[0] * z, ph = h * CELL[1] * z;
  g.fillStyle = bad ? 'rgba(255,60,80,0.25)' : 'rgba(58,255,138,0.18)'; g.fillRect(px, py, pw, ph);
  g.strokeStyle = bad ? '#ff3c50' : '#3aff8a'; g.lineWidth = 2; g.setLineDash([8, 5]); g.strokeRect(px + 1, py + 1, pw - 2, ph - 2); g.setLineDash([]);
  const tiles = [w * CELL[0], h * CELL[1]], screens = (tiles[0] / SCREEN[0]) * (tiles[1] / SCREEN[1]);
  g.fillStyle = bad ? '#ff8a96' : '#3aff8a'; g.font = 'bold 14px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(bad ? 'Pisa otra sala' : `${nextRoomId()} · nueva sala`, px + 8, py + 8);
  g.font = '12px monospace';
  g.fillText(`${w}×${h} celdas · ${tiles[0]}×${tiles[1]} casillas · ≈ ${screens.toFixed(1)} pantallas`, px + 8, py + 28);
}
function createRoomAt(x, y, cw, ch) {
  const id = nextRoomId(), w = cw * CELL[0], h = ch * CELL[1];
  const grid = Array.from({ length: h }, (_, yy) => (yy === 0 || yy === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));
  const biome = BIOMES[S.newBiome] ? S.newBiome : room()?.biome ?? 'nervioso';
  // La vista no salta: la sala nueva queda en el mismo sitio de la pantalla.
  const keep = S.id && room()?.map ? { zoom: S.zoom, pan: { x: S.pan.x + (x - room().map[0]) * CELL[0] * S.zoom, y: S.pan.y + (y - room().map[1]) * CELL[1] * S.zoom } } : null;
  S.rooms[id] = { name: 'Sala nueva', biome, map: [x, y, cw, ch], grid, exits: [] };
  const bgs = BACKDROP_VARIANTS[biome];
  if (bgs && (S.newBackdrop ?? 1) > 1 && S.newBackdrop <= bgs.length) S.rooms[id].backdrop = S.newBackdrop;
  showNewRoomBox(false);
  S.dirty.add(id);
  S.placing = null;
  openRoom(id, keep);
  $('msg').textContent = `Sala ${id} creada (${w}×${h} casillas). Cámbiale el nombre y el identificador en el panel de la sala; las salidas se añaden con "+ salida".`;
}
// Renombrar una sala: cambia su identificador y todas las salidas que llevaban a ella.
function renameRoom(oldId, newId) {
  newId = newId.trim();
  if (!newId || newId === oldId) return;
  if (!/^[A-Za-z][\w]*$/.test(newId)) { alert('Identificador no válido: letras y números, empezando por letra (p. ej. B8).'); renderRoomPanel(); return; }
  if (S.rooms[newId]) { alert('Ya existe una sala con ese identificador.'); renderRoomPanel(); return; }
  S.rooms[newId] = S.rooms[oldId];
  delete S.rooms[oldId];
  for (const [id, o] of Object.entries(S.rooms)) for (const ex of o.exits ?? []) if (ex.to === oldId) { ex.to = newId; S.dirty.add(id); }
  if (S.start.room === oldId) { S.start.room = newId; S.dirty.add('__start'); }
  S.dirty.delete(oldId); S.removed.add(oldId);              // al guardar se quita el bloque viejo
  S.removed.delete(newId);
  S.dirty.add(newId);
  for (const st of [S.undo, S.redo]) if (st[oldId]) { st[newId] = st[oldId]; delete st[oldId]; }
  CTX_CACHE.delete(oldId);
  S.id = newId;
  renderRoomList(); renderRoomPanel(); drawMap(); draw();
}

// El Rostro del Anfitrión (altar de 18x15 casillas), poseído, pintado una vez.
let SHRINE = null;
function shrineThumb() {
  if (SHRINE) return SHRINE;
  const bases = [paintShrineBase(0), paintShrineBase(1)];
  const c = document.createElement('canvas'), gc = document.createElement('canvas');
  c.width = gc.width = SHRINE_W; c.height = gc.height = SHRINE_H;
  drawShrine(c.getContext('2d'), gc.getContext('2d'), { bases, k: 0, t: 2, beat: 0.05, talk: 0.3, look: [0, 0.3] });
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'lighter'; x.drawImage(gc, 0, 0); x.globalCompositeOperation = 'source-over';
  return (SHRINE = c);
}
// El altar en el lienzo: (o.x, o.y) es la casilla del centro de su base.
function drawFace(o, z, alpha) {
  g.globalAlpha = alpha;
  g.drawImage(shrineThumb(), (o.x + 0.5) * z - (SHRINE_W / 32) * z, (o.y + 1) * z - (SHRINE_H / 16) * z, (SHRINE_W / 16) * z, (SHRINE_H / 16) * z);
  g.globalAlpha = 1;
}
// ---------------------------------------------------------------- piezas orientables
// Rampas y decoración se orientan igual: una "pieza" con su dibujo grande y sus operaciones
// (Voltear ⇅, Espejo ⇆ y, la decoración, Girar ⟳). La pieza elegida sale en lo alto de la
// paleta; la de un elemento ya colocado, en el inspector. T voltea la pieza elegida.
//   pieza: { icon (html), name, sub?, ops: [{ label, title, run() }] }
function pieceCard(p, prefix) {
  return `<div class="piece">${p.icon}<div><b>${p.name}</b>${p.sub ? `<div class="dim">${p.sub}</div>` : ''}<div class="row">${p.ops.map((op, i) => `<button id="${prefix}-${i}" title="${op.title}">${op.label}</button>`).join('')}</div></div></div>`;
}
function wirePiece(p, prefix, before, after) {
  p.ops.forEach((op, i) => { const b = $(`${prefix}-${i}`); if (b) b.onclick = () => { before?.(); op.run(); after(); }; });
}
// Rampa: la casilla elegida en la paleta (FLIP y MIRROR, más abajo).
function slopePiece(bc) {
  const cur = TILE_BY_CHAR[S.tile];
  if (!cur?.slope && !cur?.ceil) return null;
  return {
    icon: slopeIcon(cur, 42, bc.wall, bc.air), name: cur.name,
    ops: [
      { label: `⇅ Voltear (${cur.ceil ? 'suelo' : 'techo'})`, title: 'Rampa de techo ⇄ de suelo (tecla T)', run: () => { S.tile = FLIP[S.tile]; } },
      { label: '⇆ Espejo', title: 'Que suba o baje hacia el otro lado', run: () => { S.tile = MIRROR[S.tile]; } },
    ],
  };
}
// Decoración: anclada al suelo, a una pared (side) o al techo (invert), y en espejo (flip).
const ANCHORS = ['suelo', 'left', 'techo', 'right'];
const ANCHOR_NAME = { suelo: 'en el suelo', left: 'en la pared izquierda', techo: 'colgada del techo', right: 'en la pared derecha' };
const anchorOf = (o) => o.side ?? (o.invert ? 'techo' : 'suelo');
const setAnchor = (o, a) => { o.invert = a === 'techo'; if (a === 'left' || a === 'right') o.side = a; else delete o.side; };
const DECOR_OPS = {
  // Voltear: suelo ⇄ techo (en una pared, de arriba abajo).
  flip: (o) => { const a = anchorOf(o); if (a === 'suelo' || a === 'techo') setAnchor(o, a === 'suelo' ? 'techo' : 'suelo'); else o.flip = !o.flip; },
  // Espejo: que mire al otro lado (en una pared, pasa a la de enfrente).
  mirror: (o) => { const a = anchorOf(o); if (a === 'left' || a === 'right') setAnchor(o, a === 'left' ? 'right' : 'left'); else o.flip = !o.flip; },
  // Girar: un cuarto de vuelta (suelo → pared izquierda → techo → pared derecha).
  rotate: (o) => setAnchor(o, ANCHORS[(ANCHORS.indexOf(anchorOf(o)) + 1) % ANCHORS.length]),
};
function decorIcon(o, size = 42) {
  const T = DECOR[o.type] ?? DECOR.neurona, img = (DECOR_PREV[o.type] ??= decorPreview(o.type));
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), k = (size - 4) / Math.max(T.w, T.h), a = anchorOf(o);
  x.imageSmoothingEnabled = false;
  x.translate(size / 2, size / 2);
  x.rotate({ suelo: 0, left: Math.PI / 2, techo: Math.PI, right: -Math.PI / 2 }[a]);
  if (o.flip !== (a === 'techo')) x.scale(-1, 1);          // boca abajo ya invierte el lado
  x.drawImage(img, (-T.w / 2) * k, (-T.h / 2) * k, T.w * k, T.h * k);
  return `<img src="${c.toDataURL()}" width="${size}" height="${size}" style="image-rendering:pixelated">`;
}
function decorPieceOf(o) {
  const a = anchorOf(o);
  return {
    icon: decorIcon(o), name: DECOR[o.type]?.name ?? o.type, sub: `${ANCHOR_NAME[a]}${o.flip ? ' · en espejo' : ''}`,
    ops: [
      { label: `⇅ Voltear (${a === 'techo' ? 'suelo' : a === 'suelo' ? 'techo' : 'arriba ⇄ abajo'})`, title: 'Del suelo al techo y al revés (tecla T)', run: () => DECOR_OPS.flip(o) },
      { label: '⇆ Espejo', title: 'Que mire hacia el otro lado (en una pared: a la de enfrente)', run: () => DECOR_OPS.mirror(o) },
      { label: '⟳ Girar', title: 'Un cuarto de vuelta: suelo → pared izquierda → techo → pared derecha', run: () => DECOR_OPS.rotate(o) },
    ],
  };
}
// Bufador: sopla hacia dir. Voltear: arriba ⇄ abajo · Espejo: derecha ⇄ izquierda ·
// Girar: un cuarto de vuelta (derecha → abajo → izquierda → arriba).
const BELLOWS_DIRS = ['right', 'down', 'left', 'up'];
const BELLOWS_NAME = { right: 'sopla a la derecha', left: 'sopla a la izquierda', up: 'sopla hacia arriba', down: 'sopla hacia abajo' };
function bellowsIcon(dir, size = 42) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.translate(size / 2, size / 2);
  x.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir]);
  // Saco anillado, cuello y boca, y la flecha del soplido.
  x.fillStyle = '#b06474'; x.beginPath(); x.ellipse(-7, 0, 10, 12, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#7a2c44'; x.lineWidth = 2; for (const k of [-12, -6, 0]) { x.beginPath(); x.moveTo(k, -9); x.lineTo(k, 9); x.stroke(); }
  x.fillStyle = '#e07a8c'; x.beginPath(); x.moveTo(2, -4); x.lineTo(12, -7); x.lineTo(12, 7); x.lineTo(2, 4); x.fill();
  x.strokeStyle = '#a0d8ff'; x.lineWidth = 2; x.beginPath(); x.moveTo(13, 0); x.lineTo(20, 0); x.moveTo(17, -3); x.lineTo(20, 0); x.lineTo(17, 3); x.stroke();
  return `<img src="${c.toDataURL()}" width="${size}" height="${size}">`;
}
function bellowsPieceOf(o) {
  const d = o.dir ?? 'right';
  return {
    icon: bellowsIcon(d), name: 'Bufador', sub: BELLOWS_NAME[d],
    ops: [
      { label: '⇅ Voltear', title: 'Que sople hacia arriba ⇄ hacia abajo', run: () => { o.dir = { up: 'down', down: 'up', right: 'down', left: 'up' }[d]; } },
      { label: '⇆ Espejo', title: 'Que sople hacia el otro lado', run: () => { o.dir = { right: 'left', left: 'right', up: 'up', down: 'down' }[d]; } },
      { label: '⟳ Girar', title: 'Un cuarto de vuelta: derecha → abajo → izquierda → arriba', run: () => { o.dir = BELLOWS_DIRS[(BELLOWS_DIRS.indexOf(d) + 1) % 4]; } },
    ],
  };
}
// La decoración que se va a colocar: el tipo del desplegable con la orientación elegida.
const decorFromChoice = (dt = 'neurona') => ({ ...(S.decorChoice ??= { flip: false, invert: false }), type: dt });
// La pieza que sale en lo alto de la paleta: la decoración (si estás colocando una) o la rampa.
// Enemigo orientable (def.rotatable, p. ej. el Saco Esporífero): misma pieza que la
// decoración; se guarda igual (invert: techo, side: pared).
function enemyIcon(o, size = 42) {
  const th = enemyThumb(o.type);
  const c = document.createElement('canvas'); c.width = c.height = size;
  if (th) {
    const x = c.getContext('2d'), k = Math.min((size - 6) / th.w, (size - 6) / th.h, 3);
    x.imageSmoothingEnabled = false;
    x.translate(size / 2, size / 2);
    x.rotate({ suelo: 0, left: Math.PI / 2, techo: Math.PI, right: -Math.PI / 2 }[anchorOf(o)]);
    x.drawImage(th.canvas, (-th.w / 2) * k, (-th.h / 2) * k, th.w * k, th.h * k);
  }
  return `<img src="${c.toDataURL()}" width="${size}" height="${size}" style="image-rendering:pixelated">`;
}
function enemyPieceOf(o) {
  const a = anchorOf(o);
  return {
    icon: enemyIcon(o), name: ENEMIES[o.type]?.name ?? o.type, sub: ANCHOR_NAME[a],
    ops: [
      { label: `⇅ Voltear (${a === 'techo' ? 'suelo' : a === 'suelo' ? 'techo' : 'arriba ⇄ abajo'})`, title: 'Del suelo al techo y al revés (tecla T)', run: () => DECOR_OPS.flip(o) },
      { label: '⇆ Espejo', title: 'En una pared, a la de enfrente', run: () => DECOR_OPS.mirror(o) },
      { label: '⟳ Girar', title: 'Un cuarto de vuelta: suelo → pared izquierda → techo → pared derecha', run: () => DECOR_OPS.rotate(o) },
    ],
  };
}
const isRotatable = (type) => !!ENEMIES[type]?.rotatable;
function palettePiece(bc) {
  if (S.tool === 'place' && S.kind === 'enemies' && isRotatable(S.enemyType)) {
    const o = (S.enemyChoice ??= { invert: false });
    o.type = S.enemyType;
    return enemyPieceOf(o);
  }
  if (S.tool === 'place' && S.kind === 'decor') {
    const o = (S.decorChoice ??= { flip: false, invert: false });
    o.type = S.decorType ?? 'neurona';
    return decorPieceOf(o);
  }
  return slopePiece(bc);
}
// Decoración en el lienzo: una muestra de la estructura en su sitio (como en el juego).
const DECOR_PREV = {};
function drawDecor(o, z, alpha) {
  const T = DECOR[o.type] ?? DECOR.neurona, img = (DECOR_PREV[o.type] ??= decorPreview(o.type));
  if (o.side === 'left' || o.side === 'right') {
    // Tumbada contra la pared: girada un cuarto de vuelta alrededor de su centro.
    const k = z / 16, base = o.side === 'left' ? o.x * z : (o.x + 1) * z;
    const cx = base + (o.side === 'left' ? 1 : -1) * (T.h / 2) * k, cy = (o.y + 0.5) * z;
    g.globalAlpha = alpha; g.save();
    g.translate(cx, cy); g.rotate(o.side === 'left' ? Math.PI / 2 : -Math.PI / 2);
    if (o.flip) g.scale(-1, 1);
    g.drawImage(img, -(T.w / 2) * k, -(T.h / 2) * k, T.w * k, T.h * k);
    g.restore(); g.globalAlpha = 1;
    return;
  }
  const x = (o.x + 0.5) * z - (T.w / 32) * z, y = o.invert ? o.y * z : (o.y + 1) * z - (T.h / 16) * z;
  g.globalAlpha = alpha;
  g.save();
  if (o.flip) { g.translate(x * 2 + (T.w / 16) * z, 0); g.scale(-1, 1); }
  if (o.invert) { g.translate(0, y * 2 + (T.h / 16) * z); g.scale(1, -1); }
  g.drawImage(img, x, y, (T.w / 16) * z, (T.h / 16) * z);
  g.restore();
  g.globalAlpha = 1;
}
// Muros eléctricos: entre cada neurona del suelo y la del techo que tiene encima.
function drawElectricWalls(z, r) {
  const list = r.decor ?? [];
  for (const { floor, ceil, horiz } of neuronPairs(list)) {
    const a = list[floor], b = list[ceil], w = { ...WALL_DEFAULT, ...(a.wall ?? {}) };
    const label = `⚡ muro: ${w.on}s on / ${w.off}s off${w.delay ? ` · desfase ${w.delay}s` : ''}`;
    g.strokeStyle = '#82d2ff'; g.lineWidth = 3; g.setLineDash([6, 4]); g.beginPath();
    g.fillStyle = '#82d2ff'; g.font = 'bold 11px monospace'; g.textBaseline = 'middle';
    if (horiz) {
      const y = ((a.y + b.y) / 2 + 0.5) * z, x0 = a.x * z, x1 = (b.x + 1) * z;     // de pared a pared
      g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
      g.textAlign = 'center'; g.fillText(label, (x0 + x1) / 2, y - 10);
    } else {
      const x = ((a.x + b.x) / 2 + 0.5) * z, y0 = b.y * z, y1 = (a.y + 1) * z;     // de techo a suelo
      g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.setLineDash([]);
      g.textAlign = 'left'; g.fillText(label, x + 6, (y0 + y1) / 2);
    }
  }
}
function showDecorRow() { if ($('decor-row')) $('decor-row').style.display = S.tool === 'place' && S.kind === 'decor' ? '' : 'none'; }
// Un enemigo dibujado con su aspecto, apoyado (centrado) en el fondo de su caja.
function drawEnemy(o, z, alpha) {
  const th = enemyThumb(o.type);
  if (!th) return;
  const [bx, by, bw, bh] = KINDS.enemies.box(o, room()), k = z / 16;
  const dw = th.w * k, dh = th.h * k;
  g.globalAlpha = alpha;
  const a = isRotatable(o.type) ? anchorOf(o) : 'suelo';
  if (a !== 'suelo') {
    // Pegado al techo o a una pared de su casilla.
    const cx = (o.x + 0.5) * z, cy = (o.y + 0.5) * z;
    const ox = a === 'left' ? -z / 2 : a === 'right' ? z / 2 : 0, oy = a === 'techo' ? -z / 2 : 0;
    g.save(); g.translate(cx + ox, cy + oy);
    g.rotate({ left: Math.PI / 2, techo: Math.PI, right: -Math.PI / 2 }[a]);
    g.drawImage(th.canvas, -dw / 2, -dh, dw, dh);
    g.restore();
  } else g.drawImage(th.canvas, (bx + bw / 2) * z - dw / 2, (by + bh) * z - dh, dw, dh);
  g.globalAlpha = 1;
}
// ---------------------------------------------------------------- bestiario (panel)
const BIOME_ORDER = ['nervioso', 'pulmonar', 'digestivo', 'oseo', 'circulatorio', 'corazon'];
function renderBestiary() {
  const box = $('bestiary');
  if (!box) return;
  const ids = Object.keys(ENEMIES).filter((id) => ENEMIES[id].creature);
  ids.sort((a, b) => BIOME_ORDER.indexOf(ENEMIES[a].biome) - BIOME_ORDER.indexOf(ENEMIES[b].biome) || !!ENEMIES[a].boss - !!ENEMIES[b].boss);
  let html = `<h5 style="color:#ffd27a">LORE</h5><button data-face="1" class="${S.tool === 'place' && S.kind === 'faces' ? 'on' : ''}" title="Rostro del Anfitrión: altar de 18×15 casillas. Clic en la sala: centro de su base (sobre el suelo)."><span class="th" data-shrine="1"></span><span class="boss">Rostro del Anfitrión</span></button><button data-bucle="1" class="${S.tool === 'place' && S.kind === 'decor' && S.decorType === 'bucle' ? 'on' : ''}" title="Pensamiento Bucle: habitante del sistema nervioso (sin colisión); susurra su bucle si te acercas."><span class="th" data-bucleth="1"></span><span class="boss">Pensamiento Bucle</span></button>`, last = null;
  for (const id of ids) {
    const d = ENEMIES[id];
    if (d.biome !== last) { last = d.biome; html += `<h5 style="color:${BIOMES[d.biome]?.mapColor ?? '#ccc'}">${(BIOMES[d.biome]?.name ?? d.biome).toUpperCase()}</h5>`; }
    html += `<button data-en="${id}" class="${S.enemyType === id && S.tool === 'place' && S.kind === 'enemies' ? 'on' : ''}" title="${d.name} (${id}) · ${d.w}×${d.h}px · ${d.behavior}"><span class="th" data-th="${id}"></span><span class="${d.boss ? 'boss' : ''}">${d.name}${d.boss ? ' · JEFE' : ''}</span></button>`;
  }
  box.innerHTML = html;
  for (const el of box.querySelectorAll('[data-shrine]')) {
    const c = document.createElement('canvas');
    c.width = SHRINE_W; c.height = SHRINE_H;
    c.style.width = '62px'; c.style.height = '52px';
    c.getContext('2d').drawImage(shrineThumb(), 0, 0);
    el.appendChild(c);
  }
  for (const el of box.querySelectorAll('[data-bucleth]')) { const c = decorPreview('bucle'); c.style.width = '52px'; c.style.height = '52px'; el.appendChild(c); }
  for (const b of box.querySelectorAll('[data-bucle]')) b.onclick = () => {
    S.kind = 'decor'; S.decorType = 'bucle'; S.enemyType = null;
    $('kind').value = 'decor'; $('decor-type').value = 'bucle';
    setTool('place');
    for (const o of box.querySelectorAll('[data-en], [data-face], [data-bucle]')) o.classList.toggle('on', o === b);
    $('msg').textContent = 'Colocando el Pensamiento Bucle: clic en la casilla del centro de su base, sobre el suelo.';
  };
  for (const b of box.querySelectorAll('[data-face]')) b.onclick = () => {
    S.kind = 'faces'; S.enemyType = null; S.noduleLux = false;
    $('kind').value = 'faces';
    setTool('place');
    for (const o of box.querySelectorAll('[data-en], [data-face]')) o.classList.toggle('on', o === b);
    $('msg').textContent = 'Colocando el Rostro del Anfitrión: clic en la casilla del centro de su base, sobre el suelo (18×15 casillas hacia arriba). Clic derecho sobre él lo borra.';
  };
  for (const el of box.querySelectorAll('[data-th]')) {
    const th = enemyThumb(el.dataset.th);
    if (!th) continue;
    const k = Math.max(0.25, Math.min(3, Math.floor(Math.min(84 / th.w, 52 / th.h) * 4) / 4));
    const c = document.createElement('canvas');
    c.width = th.w; c.height = th.h;
    c.style.width = th.w * k + 'px'; c.style.height = th.h * k + 'px';
    c.getContext('2d').drawImage(th.canvas, 0, 0);
    el.appendChild(c);
  }
  for (const b of box.querySelectorAll('[data-en]')) b.onclick = () => {
    S.enemyType = b.dataset.en; S.kind = 'enemies'; S.noduleLux = false;
    $('kind').value = 'enemies';
    setTool('place');
    for (const o of box.querySelectorAll('[data-en], [data-face]')) o.classList.toggle('on', o === b);
    $('msg').textContent = `Colocando ${ENEMIES[S.enemyType].name}: clic en la sala (clic derecho sobre uno lo borra).`;
  };
}

function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0a0709';
  g.fillRect(0, 0, cv.width, cv.height);
  if (!S.id) return;
  const z = S.zoom, r = room();
  g.setTransform(1, 0, 0, 1, S.pan.x, S.pan.y);
  g.imageSmoothingEnabled = false;
  drawContext(z, r);
  if (S.view === 'game' && gameView()) {
    g.fillStyle = '#1a1418'; g.fillRect(0, 0, W() * z, H() * z);
    g.drawImage(S.gameCanvas, 0, 0, W() * z, H() * z);
  } else {
    const bc = biomeColors(r.biome);
    for (let y = 0; y < H(); y++) for (let x = 0; x < W(); x++) {
      const c = r.grid[y][x], t = TILE_BY_CHAR[c];
      g.fillStyle = c === '#' ? bc.wall : c === '.' || t?.item || t?.slope || t?.ceil ? bc.air : t?.color ?? '#ff00ff';
      g.fillRect(x * z, y * z, z, z);
      if (c === 'G') { g.fillStyle = bc.air; g.fillRect(x * z, y * z, z, z); g.fillStyle = 'rgba(214,150,186,0.42)'; g.fillRect(x * z, y * z, z, z); }   // velo: aire con tinte
      if (t?.slope) {
        // Pendiente: el triángulo (o trapecio) de pared bajo su recta.
        const [l, rr] = t.slope;
        g.fillStyle = bc.wall; g.beginPath();
        g.moveTo(x * z, y * z + (l / 16) * z); g.lineTo(x * z + z, y * z + (rr / 16) * z);
        g.lineTo(x * z + z, y * z + z); g.lineTo(x * z, y * z + z); g.closePath(); g.fill();
      }
      if (t?.ceil) {
        // Rampa de techo: la pared por encima de su recta.
        const [l, rr] = t.ceil;
        g.fillStyle = bc.wall; g.beginPath();
        g.moveTo(x * z, y * z); g.lineTo(x * z + z, y * z);
        g.lineTo(x * z + z, y * z + (rr / 16) * z); g.lineTo(x * z, y * z + (l / 16) * z); g.closePath(); g.fill();
      }
      if (t?.item || ['o', 'N', 'X', 'Y', 'K', 'f', 'z', '^'].includes(c)) {
        g.fillStyle = t?.color ?? '#fff';
        if (t?.item) { g.beginPath(); g.arc(x * z + z / 2, y * z + z / 2, z * 0.32, 0, Math.PI * 2); g.fill(); }
        if (z >= 12) { g.fillStyle = t?.item ? '#000' : '#fff'; g.font = `${Math.floor(z * 0.6)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c, x * z + z / 2, y * z + z / 2 + 1); }
      }
    }
  }
  // Velo de membrana: tinte por encima (la casilla de debajo se sigue viendo).
  if (r.veil?.length) {
    g.fillStyle = 'rgba(214,150,186,0.18)';
    for (const [vx, vy] of r.veil) g.fillRect(vx * z, vy * z, z, z);
    if (z >= 6) {
      g.strokeStyle = 'rgba(245,190,225,0.55)'; g.lineWidth = 1; g.beginPath();
      for (const [vx, vy] of r.veil) { g.moveTo(vx * z, vy * z + z / 2); g.lineTo(vx * z + z / 2, vy * z); g.moveTo(vx * z + z / 2, vy * z + z); g.lineTo(vx * z + z, vy * z + z / 2); }
      g.stroke();
    }
  }
  // Rejilla y celdas del mapa.
  if (z >= 8) {
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x <= W(); x++) { g.moveTo(x * z + 0.5, 0); g.lineTo(x * z + 0.5, H() * z); }
    for (let y = 0; y <= H(); y++) { g.moveTo(0, y * z + 0.5); g.lineTo(W() * z, y * z + 0.5); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(80,160,255,0.35)'; g.lineWidth = 2; g.beginPath();
  for (let x = 0; x <= W(); x += CELL[0]) { g.moveTo(x * z, 0); g.lineTo(x * z, H() * z); }
  for (let y = 0; y <= H(); y += CELL[1]) { g.moveTo(0, y * z); g.lineTo(W() * z, y * z); }
  g.stroke();
  // Alcance.
  if (S.reach) {
    g.fillStyle = 'rgba(80,255,140,0.35)';
    for (const k of S.reach.standing) { const [x, y] = k.split(',').map(Number); g.fillRect(x * z + 2, y * z + 2, z - 4, z - 4); }
    if (S.reachStart) { g.strokeStyle = '#50ff8c'; g.lineWidth = 2; g.strokeRect(S.reachStart[0] * z, S.reachStart[1] * z, z, z); }
  }
  // Salidas: los huecos del borde y a dónde llevan.
  for (const [i, ex] of (r.exits ?? []).entries()) {
    const [a, b] = ex.at ?? [0, (ex.side === 'left' || ex.side === 'right' ? H() : W()) - 1];
    g.fillStyle = 'rgba(255,255,255,0.18)';
    let bx, by, bw, bh;
    if (ex.side === 'left') [bx, by, bw, bh] = [-z, a * z, z, (b - a + 1) * z];
    if (ex.side === 'right') [bx, by, bw, bh] = [W() * z, a * z, z, (b - a + 1) * z];
    if (ex.side === 'top') [bx, by, bw, bh] = [a * z, -z, (b - a + 1) * z, z];
    if (ex.side === 'bottom') [bx, by, bw, bh] = [a * z, H() * z, (b - a + 1) * z, z];
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = S.sel?.kind === 'exits' && S.sel.index === i ? '#ffd23f' : '#3aff8a';
    g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`→ ${ex.to}`, bx + bw / 2, by + bh / 2);
  }
  // Dónde se aparece al llegar a un punto (si no es sobre el propio punto). Por un hueco de
  // techo o suelo, en un mapa sin teletransporte, se entra por la propia boca: nada que marcar.
  for (const l of r.links ?? []) {
    if (physicalHole(l, r)) {
      g.fillStyle = 'rgba(58,255,138,0.7)'; g.font = '10px monospace'; g.textAlign = 'left'; g.textBaseline = l.y === 0 ? 'top' : 'bottom';
      g.fillText(`entra por la boca (${l.id})`, l.x * z, l.y === 0 ? ((l.h ?? 2) * z + 1) : (l.y * z - 1));
      continue;
    }
    const [ax, ay] = l.arrive ?? linkArrival(r, l.id) ?? [l.x, l.y + 1];
    const auto = !l.arrive;
    if (auto && ax >= l.x && ax < l.x + (l.w ?? 1) && ay >= l.y && ay < l.y + (l.h ?? 2)) continue;   // sobre el propio punto: no hace falta marca
    g.strokeStyle = auto ? 'rgba(58,255,138,0.5)' : '#3aff8a'; g.lineWidth = 2; g.setLineDash([3, 3]);
    g.strokeRect(ax * z + 1, (ay - 1) * z + 1, z - 2, 2 * z - 2);
    // Una línea la une a su punto: se ve por qué abertura se llega ahí.
    g.lineWidth = 1; g.beginPath();
    g.moveTo((l.x + (l.w ?? 1) / 2) * z, (l.y + (l.h ?? 2) / 2) * z); g.lineTo((ax + 0.5) * z, ay * z);
    g.stroke(); g.setLineDash([]);
    g.fillStyle = auto ? 'rgba(58,255,138,0.6)' : '#3aff8a'; g.font = '10px monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(`llegada ${l.id}${auto ? ' (auto)' : ''}`, ax * z, (ay - 1) * z - 1);
  }
  // Marcando una llegada: la casilla bajo el ratón.
  if (S.pickArrive && S.hover) {
    const [hx, hy] = S.hover;
    g.fillStyle = 'rgba(58,255,138,0.3)'; g.fillRect(hx * z, (hy - 1) * z, z, 2 * z);
    g.strokeStyle = '#3aff8a'; g.lineWidth = 2; g.strokeRect(hx * z + 1, (hy - 1) * z + 1, z - 2, 2 * z - 2);
  }
  // Puntos de conexión con destino: el mismo distintivo que una salida ("→ sala"). Pegados
  // al borde, la pestaña sale por fuera del borde, como las salidas de siempre.
  for (const [i, l] of (r.links ?? []).entries()) {
    if (!l.to) continue;
    const w0 = l.w ?? PW, h0 = l.h ?? PH, sel = S.sel?.kind === 'links' && S.sel.index === i;
    let bx = l.x * z, by = l.y * z, bw = w0 * z, bh = h0 * z;
    if (l.x === 0) [bx, bw] = [-z, z];
    else if (l.x + w0 === W()) [bx, bw] = [W() * z, z];
    else if (l.y === 0) [by, bh] = [-z, z];
    else if (l.y + h0 === H()) [by, bh] = [H() * z, z];
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = sel ? '#ffd23f' : '#3aff8a';
    g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${isReciprocal(S.id, l) ? '⇄' : '→'} ${l.to}`, bx + bw / 2, by + bh / 2);
  }
  // Elementos.
  const drawBox = (kind, o, i, color, label) => {
    const K = KINDS[kind];
    const [x, y, w, h] = K.box(o, r);
    const sel = S.sel?.kind === kind && S.sel.index === i;
    // La marca de oculto no se rellena: debajo debe verse el objeto que esconde.
    g.fillStyle = color + (kind === 'hidden' ? '00' : kind === 'zones' || kind === 'fluids' ? '28' : '55');
    g.fillRect(x * z, y * z, w * z, h * z);
    g.strokeStyle = sel ? '#ffd23f' : color; g.lineWidth = sel ? 3 : 1.5;
    g.strokeRect(x * z + 1, y * z + 1, w * z - 2, h * z - 2);
    if (z >= 10 && label) { g.fillStyle = sel ? '#ffd23f' : color; g.font = `${Math.max(9, Math.floor(z * 0.55))}px monospace`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(label, x * z + 2, y * z + 2); }
  };
  for (const [kind, K] of Object.entries(KINDS)) {
    if (!K.box) continue;
    (r[kind] ?? []).forEach((o, i) => {
      const color = kind === 'zones' ? (o.color ?? K.color) : K.color;
      if (kind === 'enemies') drawEnemy(o, z, 1);
      if (kind === 'faces') drawFace(o, z, o.front ? 0.95 : 0.7);
      if (kind === 'decor') drawDecor(o, z, o.front ? 0.95 : 0.75);
      drawBox(kind, o, i, color, K.text?.(o));
      // Ruta de las plataformas móviles; radio de las pistas.
      if (kind === 'movers') {
        g.strokeStyle = K.color; g.setLineDash([4, 3]); g.beginPath();
        let px = o.x + (o.w ?? 3) / 2, py = o.y + 0.5; g.moveTo(px * z, py * z);
        for (const [dx, dy] of o.path ?? []) g.lineTo((o.x + dx + (o.w ?? 3) / 2) * z, (o.y + dy + 0.5) * z);
        g.stroke(); g.setLineDash([]);
      }
      if (kind === 'hints') { g.strokeStyle = 'rgba(160,160,255,0.3)'; g.beginPath(); g.arc((o.x + 0.5) * z, (o.y + 0.5) * z, o.r * z, 0, Math.PI * 2); g.stroke(); }
    });
  }
  if (r.pods) r.pods.at.forEach(([x, y], i) => {
    const sel = S.sel?.kind === 'pods' && S.sel.index === i;
    g.fillStyle = '#ffd860'; g.beginPath(); g.arc((x + 0.5) * z, (y + 0.5) * z, z * 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.font = `${Math.floor(z * 0.55)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String((r.pods.order ?? []).indexOf(i) + 1), (x + 0.5) * z, (y + 0.5) * z);
    if (sel) { g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.strokeRect(x * z, y * z, z, z); }
  });
  // Inicio del juego y punto de prueba.
  if (S.start.room === S.id) mark(S.start.spawn, '#3aff8a', 'INICIO');
  if (S.testSpawn) mark(S.testSpawn, '#ff8a3a', 'PRUEBA');
  // Puntos de conexión: una línea discontinua hasta su destino.
  for (const l of r.links ?? []) {
    if (!l.to || !l.toLink) continue;
    const t = S.rooms[l.to], d = (t?.links ?? []).find((k) => k.id === l.toLink);
    if (!t?.map || !d || !r.map) continue;
    const ax = (l.x + (l.w ?? 1) / 2) * z, ay = (l.y + (l.h ?? 2) / 2) * z;
    const bx = ((t.map[0] - r.map[0]) * CELL[0] + d.x + (d.w ?? 1) / 2) * z, by = ((t.map[1] - r.map[1]) * CELL[1] + d.y + (d.h ?? 2) / 2) * z;
    g.strokeStyle = '#40e0ff'; g.lineWidth = 2; g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#40e0ff'; g.beginPath(); g.arc(bx, by, 4, 0, Math.PI * 2); g.fill();
  }
  drawPlacing(z, r);
  drawLinking(z, r);
  if (S.roomMove) {
    g.strokeStyle = S.drag?.bad ? '#ff3c50' : '#40e0ff'; g.lineWidth = 3; g.setLineDash([10, 6]);
    g.strokeRect(-2, -2, W() * z + 4, H() * z + 4); g.setLineDash([]);
  }
  // Fantasma del enemigo que se va a colocar.
  if (S.tool === 'place' && S.kind === 'enemies' && S.hover && S.enemyType) drawEnemy({ type: S.enemyType, x: S.hover[0], y: S.hover[1] }, z, 0.55);
  if (S.tool === 'place' && S.kind === 'faces' && S.hover) drawFace({ x: S.hover[0], y: S.hover[1] }, z, 0.45);
  if (S.tool === 'place' && S.kind === 'decor' && S.hover) drawDecor({ x: S.hover[0], y: S.hover[1], ...decorFromChoice(S.decorType) }, z, 0.5);
  drawElectricWalls(z, r);
  drawArea(z);
  // Rectángulo en curso.
  if (S.drag?.rect) {
    const [x0, y0] = S.drag.from, [x1, y1] = S.drag.to;
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2;
    g.strokeRect(Math.min(x0, x1) * z, Math.min(y0, y1) * z, (Math.abs(x1 - x0) + 1) * z, (Math.abs(y1 - y0) + 1) * z);
  }
  if (S.hover) {
    // Cursor del tamaño del pincel (rojo con la goma).
    const painting = ['brush', 'erase', 'blob', 'rect', 'fill'].includes(S.tool);
    const n = painting && S.tool !== 'rect' && S.tool !== 'fill' ? S.brush : 1, R = Math.floor((n - 1) / 2);
    g.strokeStyle = S.tool === 'erase' ? 'rgba(255,80,80,0.9)' : 'rgba(255,210,63,0.7)'; g.lineWidth = 1.5;
    g.strokeRect((S.hover[0] - R) * z, (S.hover[1] - R) * z, n * z, n * z);
  }
  function mark([x, y], color, text) {
    g.strokeStyle = color; g.lineWidth = 2; g.strokeRect(x * z + 1, (y - 1) * z + 1, z - 2, 2 * z - 2);
    g.fillStyle = color; g.font = '10px monospace'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(text, (x + 0.5) * z, (y - 1) * z - 2);
  }
}

// ---------------------------------------------------------------- selección
function areaHit(x, y) {
  const h = hitTest(x, y);
  return h && h.kind !== 'zones' && h.kind !== 'fluids' ? h : null;
}
function hitTest(x, y) {
  const r = room();
  if (r.pods) { const i = r.pods.at.findIndex(([px, py]) => px === x && py === y); if (i >= 0) return { kind: 'pods', index: i }; }
  // Lo pequeño primero: zonas y cubetas, al final.
  const order = Object.keys(KINDS).filter((k) => KINDS[k].box).sort((a, b) => (a === 'zones' || a === 'fluids' ? 1 : 0) - (b === 'zones' || b === 'fluids' ? 1 : 0));
  for (const kind of order) {
    const list = r[kind] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const [bx, by, bw, bh] = KINDS[kind].box(list[i], r);
      if (x >= bx && y >= by && x < bx + bw && y < by + bh) return { kind, index: i };
    }
  }
  return null;
}
const TILE_OBJ_SPECIAL = new Set(['o', 'N', 'X', 'Y', 'K', 'f', '^']);
const isTileObj = (c) => !!TILE_BY_CHAR[c]?.item || TILE_OBJ_SPECIAL.has(c);
const selected = () => {
  if (!S.sel) return null;
  // Objeto de casilla seleccionado: su carácter y su sitio.
  if (S.sel.kind === 'tile') { const c = getTile(S.sel.x, S.sel.y); return isTileObj(c) ? { tile: c, x: S.sel.x, y: S.sel.y } : null; }
  if (S.sel.kind === 'pods') return room().pods?.at[S.sel.index];
  return room()[S.sel.kind]?.[S.sel.index];
};

// ---------------------------------------------------------------- ratón
cv.addEventListener('contextmenu', (e) => e.preventDefault());
// Doble clic en una sala vecina (gris): la abre sin mover la vista.
cv.addEventListener('dblclick', (e) => {
  if (!S.id || S.placing) return;
  const [x, y] = toTile(e), r = room();
  if (x >= 0 && y >= 0 && x < W() && y < H()) return;
  const hit = roomAt(...cellOf(r, x, y));
  if (!hit || hit[0] === S.id) return;
  const o = hit[1];
  openRoom(hit[0], { zoom: S.zoom, pan: { x: S.pan.x + (o.map[0] - r.map[0]) * CELL[0] * S.zoom, y: S.pan.y + (o.map[1] - r.map[1]) * CELL[1] * S.zoom } });
});
addEventListener('keydown', (e) => { if (e.code === 'Escape' && S.linking) { S.linking = null; $('msg').textContent = 'Conexión cancelada.'; renderRoomPanel(); draw(); } });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && S.pickArrive) { S.pickArrive = null; $('msg').textContent = ''; renderInspector(); draw(); } });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && S.roomMove) { S.roomMove = false; $('msg').textContent = ''; renderRoomPanel(); draw(); } });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && S.placing) { S.placing = null; showNewRoomBox(false); $('msg').textContent = 'Nueva sala cancelada.'; draw(); } });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const z0 = S.zoom, z1 = Math.max(4, Math.min(48, Math.round(z0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2))));
  S.pan.x = mx - ((mx - S.pan.x) * z1) / z0;
  S.pan.y = my - ((my - S.pan.y) * z1) / z0;
  S.zoom = z1;
  draw();
}, { passive: false });
let spaceDown = false;
addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping()) { spaceDown = true; e.preventDefault(); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

cv.addEventListener('mousedown', (e) => {
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (!S.id) return;
  const [x, y] = toTile(e);
  // Marcar el inicio de la prueba (botón 📍 Inicio): el siguiente clic lo fija.
  if (S.pickSpawn && e.button === 0) { S.pickSpawn = false; $('test-spawn').classList.remove('on'); setTestSpawn(x, y); return; }
  if (S.pickArrive && e.button === 0) {
    const o = S.pickArrive, r = room();
    S.pickArrive = null;
    if (!(r.links ?? []).includes(o) || x < 0 || y < 1 || x >= W() || y >= H()) { $('msg').textContent = 'Fuera de la sala: no se ha marcado.'; renderInspector(); draw(); return; }
    snapshot(); o.arrive = [x, y]; touch();
    const solid = (c) => SOLID.has(c) || TILE_BY_CHAR[c]?.slope;
    const ok = !solid(r.grid[y][x]) && !solid(r.grid[y - 1]?.[x]);
    $('msg').textContent = ok ? `Al llegar por ${o.id} se aparece en [${x},${y}].` : `Marcado en [${x},${y}], pero ahí hay pared: el personaje no cabe (2 casillas de alto).`;
    renderInspector(); draw(); return;
  }
  if (e.button === 1 || spaceDown) { S.drag = { pan: true, sx: e.clientX, sy: e.clientY, px: S.pan.x, py: S.pan.y }; return; }
  if (S.roomMove && e.button === 0) {
    snapshot();
    S.drag = { roomMove: true, sx: e.clientX, sy: e.clientY, map0: [...room().map], pan0: { ...S.pan }, bad: false };
    return;
  }
  if (S.linking && ['place', 'placeDest'].includes(S.linking.stage) && S.linking.room === S.id) {
    if (e.button === 2) { S.linking = null; $('msg').textContent = 'Conexión cancelada.'; renderRoomPanel(); draw(); return; }
    S.linkDrag = { from: [x, y] }; S.drag = { linkDrag: true }; draw(); return;
  }
  if (S.placing) {
    if (e.button === 2) { S.placing = null; showNewRoomBox(false); $('msg').textContent = 'Nueva sala cancelada.'; draw(); return; }
    S.placing.cell = cellOf(room(), x, y);
    S.placing.from = S.placing.cell;
    S.drag = { placing: true };
    draw();
    return;
  }
  // Herramienta Zona (también selecciona y mueve):
  //  - clic en un elemento (criatura, lámpara, punto...): lo selecciona; arrastrando, se mueve.
  //  - clic en un objeto de casilla (fragmento, biomasa...): arrastrando, se mueve solo él.
  //  - arrastrar en vacío: marca una zona de casillas; arrastrar desde dentro la mueve.
  //  - clic derecho: borra el elemento bajo el ratón, o suelta la zona.
  if (S.tool === 'area') {
    const hit = areaHit(x, y);
    if (e.button === 2) {
      if (hit) { S.sel = hit; deleteSelected(); return; }
      if (isTileObj(getTile(x, y))) { S.sel = { kind: 'tile', x, y }; deleteSelected(); return; }
      S.area = null; S.float = null; S.sel = null; draw(); renderInspector(); return;
    }
    if (S.area && inRect(areaRect(S.area), x, y)) { liftArea(); S.drag = { areaMove: true, from: [x, y] }; draw(); return; }
    if (hit) { S.area = null; S.sel = hit; renderInspector(); snapshot(); S.drag = { move: true, last: [x, y] }; draw(); return; }
    if (isTileObj(getTile(x, y))) {
      S.sel = { kind: 'tile', x, y }; S.area = { x0: x, y0: y, x1: x, y1: y };
      liftArea({ fill: '.', veil: false }); S.drag = { areaMove: true, from: [x, y], single: true }; draw(); return;
    }
    S.sel = null; S.area = { x0: x, y0: y, x1: x, y1: y }; S.drag = { areaSel: true, from: [x, y] }; draw(); renderInspector(); return;
  }
  // Alt+clic: punto de prueba · Mayús+clic: origen del alcance.
  if (e.altKey) { setTestSpawn(x, y); return; }
  if (e.shiftKey && S.tool !== 'rect') { S.reachStart = [x, y]; computeReach(); return; }
  const erase = e.button === 2;
  if (S.tool === 'pick') { S.tile = getTile(x, y); renderPalette(); setTool('brush'); return; }
  if (S.tool === 'place') {
    const hit = hitTest(x, y);
    if (S.tool === 'place' && !hit && !erase) {
      snapshot();
      const K = KINDS[S.kind];
      if (S.kind === 'links' && !spotOk(room(), x, y - (PH - 1))) { $('msg').textContent = 'Ahí no cabe el punto: necesita el hueco del personaje (1×2), sin roca (las membranas valen) y dentro de la sala. Mejor usa "Crear conexión" en el panel de la sala.'; S.undo[S.id]?.pop(); return; }
      const o = K.make(x, y, room());
      if (S.kind === 'nodules' && S.noduleLux) o.push('luz'); // desde la paleta: nódulo lumínico
      if (S.kind === 'enemies' && S.enemyType) o.type = S.enemyType; // el elegido en el Bestiario
      if (S.kind === 'enemies' && isRotatable(o.type) && S.enemyChoice) { if (S.enemyChoice.side) o.side = S.enemyChoice.side; if (S.enemyChoice.invert) o.invert = true; }
      if (S.kind === 'decor') Object.assign(o, decorFromChoice(S.decorType));   // la elegida en el desplegable
      if (o) { (room()[S.kind] ??= []).push(o); S.sel = { kind: S.kind, index: room()[S.kind].length - 1 }; }
      else if (S.kind === 'pods') S.sel = { kind: 'pods', index: room().pods.at.length - 1 };
      touch(); renderInspector(); return;
    }
    if (erase && hit) { S.sel = hit; deleteSelected(); return; }
    S.sel = hit;
    renderInspector();
    if (hit) { snapshot(); S.drag = { move: true, last: [x, y] }; }
    draw();
    return;
  }
  snapshot();
  // La goma (o el clic derecho con cualquier herramienta de pintar) deja aire.
  // La goma borra siempre (tengas la casilla que tengas elegida): con clic izquierdo deja
  // aire; con el derecho pinta la casilla elegida. Con el velo elegido, el pincel lo pone
  // y el clic derecho lo quita.
  let c = S.tool === 'erase' ? (erase && S.tile !== 'G' ? S.tile : '.')
    : S.tile === 'G' ? (erase ? '-G' : 'G')
    : erase ? (S.tile === '.' ? '#' : '.') : S.tile;
  // Borrar va por capas: primero el velo (si el trazo empieza sobre él), luego lo de debajo.
  if ((S.tool === 'erase' || erase) && c === '.' && hasVeil(room(), x, y)) c = '-G';
  if (S.tool === 'fill') { floodFill(x, y, c); touch(); return; }
  if (S.tool === 'rect') { S.drag = { rect: true, from: [x, y], to: [x, y], c }; draw(); return; }
  paintAt(x, y, c, S.brush, S.tool === 'blob' || S.tool === 'erase');
  S.drag = { paint: true, c };
  touch();
});
addEventListener('mousemove', (e) => {
  if (!S.id) return;
  const [x, y] = toTile(e);
  if (e.target === cv) { S.hover = [x, y]; $('status').textContent = `${S.id}  ·  tile ${x}, ${y}  ·  ${TILE_BY_CHAR[getTile(x, y)]?.name ?? getTile(x, y)}  ·  celda de mapa ${Math.floor(x / CELL[0])}, ${Math.floor(y / CELL[1])}`; }
  if (S.placing && e.target === cv) { S.placing.cell = cellOf(room(), x, y); draw(); if (!S.drag) return; }
  const d = S.drag;
  if (!d) { if (e.target === cv) draw(); return; }
  if (d.placing) return;
  if (d.linkDrag) { draw(); return; }
  if (d.roomMove) {
    // Por celdas enteras: la sala sigue al ratón y las vecinas se quedan donde están.
    const dcx = Math.round((e.clientX - d.sx) / (CELL[0] * S.zoom)), dcy = Math.round((e.clientY - d.sy) / (CELL[1] * S.zoom));
    const nx = d.map0[0] + dcx, ny = d.map0[1] + dcy, r = room();
    d.bad = !mapFree(S.id, nx, ny);
    r.map[0] = nx; r.map[1] = ny;
    S.pan = { x: d.pan0.x + dcx * CELL[0] * S.zoom, y: d.pan0.y + dcy * CELL[1] * S.zoom };
    draw(); drawMap();
    return;
  }
  if (d.areaSel) { S.area.x1 = x; S.area.y1 = y; draw(); return; }
  if (d.areaMove && S.float) { floatTo(x - d.from[0], y - d.from[1]); draw(); return; }
  if (d.pan) { S.pan.x = d.px + e.clientX - d.sx; S.pan.y = d.py + e.clientY - d.sy; draw(); return; }
  if (d.paint) { paintAt(x, y, d.c, S.brush, S.tool === 'blob' || S.tool === 'erase'); touch(); return; }
  if (d.rect) { d.to = [x, y]; draw(); return; }
  if (d.move && S.sel) {
    const [lx, ly] = d.last;
    if (x === lx && y === ly) return;
    const dx = x - lx, dy = y - ly;
    d.last = [x, y];
    const r = room(), o = selected();
    if (S.sel.kind === 'pods') { o[0] += dx; o[1] += dy; }
    else {
      const K = KINDS[S.sel.kind];
      const [bx, by, bw, bh] = K.box(o, r);
      if (S.sel.kind === 'enemies') K.move(o, o.x + dx, o.y + dy, r);
      else if (S.sel.kind === 'links') { if (spotOk(r, bx + dx, by + dy, bw, bh)) K.move(o, bx + dx, by + dy, r); else return; }
      else K.move(o, bx + dx, by + dy, r);
    }
    touch(); renderInspector();
  }
});
addEventListener('mouseup', () => {
  const d = S.drag;
  S.drag = null;
  if (d?.linkDrag && S.linkDrag) {
    const from = S.linkDrag.from, to = S.hover ?? from;
    S.linkDrag = null;
    linkingClick(to[0], to[1], from[0] === to[0] && from[1] === to[1] ? null : dragRect(from, to));
    draw(); return;
  }
  if (d?.areaSel) {
    const [x0, y0] = d.from, a = S.area;
    if (a && a.x1 === x0 && a.y1 === y0) {
      const hit = hitTest(x0, y0);
      S.area = null; S.sel = hit; draw();
    }
    renderInspector(); return;
  }
  if (d?.roomMove) {
    const r = room();
    if (d.bad) { r.map[0] = d.map0[0]; r.map[1] = d.map0[1]; S.pan = d.pan0; $('msg').textContent = 'Ahí pisaría otra sala: vuelve a su sitio.'; }
    else { $('msg').textContent = `Sala ${S.id} en [${r.map[0]}, ${r.map[1]}].`; S.dirty.add(S.id); }
    renderRoomPanel(); draw(); drawMap();
    return;
  }
  if (d?.areaMove) {
    const F = S.float, nx = F ? F.x + F.dx : 0, ny = F ? F.y + F.dy : 0;
    dropFloat();
    if (d.single) { S.area = null; S.sel = { kind: 'tile', x: nx, y: ny }; renderInspector(); }
    draw(); return;
  }
  if (d?.placing && S.placing) {
    // Un clic deja el tamaño mínimo; un arrastre, el espacio marcado.
    if (S.placing.from && S.placing.cell && S.placing.from[0] === S.placing.cell[0] && S.placing.from[1] === S.placing.cell[1]) S.placing.from = null;
    const rc = placingRect();
    if (rc && !overlapsRoom(rc)) createRoomAt(...rc);
    else { S.placing.from = null; $('msg').textContent = 'Ahí pisa otra sala: elige un hueco libre (o Esc para cancelar).'; draw(); }
    return;
  }
  if (d?.rect) {
    const [x0, y0] = d.from, [x1, y1] = d.to;
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) setTile(x, y, d.c);
    touch();
  }
});

// ---------------------------------------------------------------- herramientas
const TOOLS = [
  ['brush', 'Pincel', 'B'], ['erase', 'Goma (borra a aire)', 'X'], ['blob', 'Masa orgánica (pincel redondo)', 'O'], ['rect', 'Rectángulo', 'R'],
  ['fill', 'Relleno', 'F'], ['pick', 'Cuentagotas', 'I'], ['place', 'Colocar elementos', 'E'],
  ['area', 'Seleccionar y mover (y zonas: Ctrl+X/C/V)', 'M'],
];
// ---------------------------------------------------------------- zona (mover, cortar, copiar, pegar)
// Con la herramienta Zona (M) se arrastra un rectángulo de casillas.
// - Arrastrar desde dentro la mueve a otro sitio (el hueco que deja se rellena con pared
//   o aire, S.areaFill).
// - Ctrl+X la marca como cortada (en rojo); no cambia nada hasta pegar.
// - Ctrl+C la copia.
// - Ctrl+V pega lo cortado o copiado con su esquina donde está el ratón (también en otra
//   sala). Si era un corte, en ese momento desaparece del sitio original.
// - Supr la borra; Esc suelta la selección y anula el corte.
// Todo va con lo que hay encima: objetos, enemigos, puntos, luces...
// El hueco queda limpio (aire, como con la Goma) salvo que se elija pared; se recuerda.
S.areaFill ??= (() => { try { return localStorage.getItem('linfa.areaFill') === '#' ? '#' : '.'; } catch { return '.'; } })();
const areaRect = (a) => [Math.min(a.x0, a.x1), Math.min(a.y0, a.y1), Math.abs(a.x1 - a.x0) + 1, Math.abs(a.y1 - a.y0) + 1];
const inRect = ([x, y, w, h], px, py) => px >= x && py >= y && px < x + w && py < y + h;
const elemPos = (kind, o, r) => (kind === 'pods' ? o : KINDS[kind].box(o, r)).slice(0, 2);
// Los elementos cuya esquina cae dentro de la zona: [{ kind, o }] (y los sacos en orden).
function elementsIn(rc, r = room()) {
  const out = [];
  for (const [kind, K] of Object.entries(KINDS)) {
    if (!K.box || kind === 'exits') continue;
    for (const o of r[kind] ?? []) { const [bx, by] = K.box(o, r); if (inRect(rc, bx, by)) out.push({ kind, o }); }
  }
  for (const p of r.pods?.at ?? []) if (inRect(rc, p[0], p[1])) out.push({ kind: 'pods', o: p });
  return out;
}
function moveElement({ kind, o }, dx, dy) {
  if (kind === 'pods') { o[0] += dx; o[1] += dy; return; }
  const K = KINDS[kind], r = room(), [bx, by] = K.box(o, r);
  if (kind === 'enemies') K.move(o, o.x + dx, o.y + dy, r); else K.move(o, bx + dx, by + dy, r);
}
// Pone copias de elementos en la sala abierta. Los puntos de conexión conservan su nombre
// si está libre (al pegar algo cortado); si no, toman uno nuevo.
function addCopies(elems) {
  const r = room();
  return elems.map(({ kind, o }) => {
    const c = clone(o);
    if (kind === 'pods') { r.pods ??= {}; (r.pods.at ??= []).push(c); return { kind, o: c }; }
    if (kind === 'links' && (r.links ?? []).some((l) => l.id === c.id)) c.id = newLinkId(r);
    (r[kind] ??= []).push(c);
    return { kind, o: c };
  });
}
// Quita elementos de una sala.
function removeElements(elems, r = room()) {
  for (const { kind, o } of elems) {
    const arr = kind === 'pods' ? r.pods?.at : r[kind];
    const i = arr?.indexOf(o) ?? -1;
    if (i >= 0) arr.splice(i, 1);
  }
}
// Rellena un rectángulo de una sala con pared o aire (S.areaFill).
function fillRect(r, [x, y, w, h], fill) {
  fill ??= S.areaFill;
  for (let j = y; j < y + h; j++) {
    if (j < 0 || j >= r.grid.length) continue;
    const row = r.grid[j], a = Math.max(0, x), b = Math.min(row.length, x + w);
    if (b > a) r.grid[j] = row.slice(0, a) + fill.repeat(b - a) + row.slice(b);
  }
}
// Arrastrar: levanta las casillas de la zona (y sus elementos) para moverlas.
function liftArea({ fill = S.areaFill, veil: withVeil = true } = {}) {
  const rc = areaRect(S.area), [x, y, w, h] = rc;
  snapshot();
  const tiles = Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => getTile(x + i, y + j)));
  const elems = withVeil ? elementsIn(rc) : [], veil = withVeil ? veilIn(room(), rc) : [];
  fillRect(room(), rc, fill);
  if (withVeil) clearVeil(room(), rc);
  S.gameCanvasFor = null; CTX_CACHE.delete(S.id);         // la vista de juego, ya sin lo levantado
  S.float = { tiles, elems, veil, keepVeil: !withVeil, x, y, w, h, dx: 0, dy: 0 };
}
// Coloca el bloque que se arrastra a (dx, dy) de su origen; sus elementos lo siguen.
function floatTo(dx, dy) {
  const F = S.float;
  if (!F || (dx === F.dx && dy === F.dy)) return;
  for (const e of F.elems) moveElement(e, dx - F.dx, dy - F.dy);
  F.dx = dx; F.dy = dy;
}
// Suelta el bloque en su sitio nuevo.
function dropFloat() {
  const F = S.float;
  if (!F) return;
  for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) setTile(F.x + F.dx + i, F.y + F.dy + j, F.tiles[j][i]);
  if (!F.keepVeil) clearVeil(room(), [F.x + F.dx, F.y + F.dy, F.w, F.h]);
  for (const [i, j] of F.veil) setVeil(room(), F.x + F.dx + i, F.y + F.dy + j, true);
  S.area = { x0: F.x + F.dx, y0: F.y + F.dy, x1: F.x + F.dx + F.w - 1, y1: F.y + F.dy + F.h - 1 };
  S.float = null;
  if (S.clip?.cut && S.clip.room === S.id) S.clip.cut = false; // lo cortado ya no está ahí
  touch(); renderInspector(); draw();
}
function areaPanel() {
  if (S.tool !== 'area') return '';
  let h = '<h3>Seleccionar y mover</h3><p class="dim">Clic en un elemento u objeto: lo eliges y, arrastrando, lo mueves (clic derecho lo borra). Arrastrar en vacío: marca una zona de casillas.</p>';
  if (S.area) { const [x, y, w, h0] = areaRect(S.area); h += `<p class="dim">${w}×${h0} casillas en [${x},${y}] · ${elementsIn([x, y, w, h0]).length} elementos dentro</p>`; }
  else h += '<p class="dim">Arrastra para seleccionar casillas.</p>';
  h += '<p class="dim">Arrastrar desde dentro: mover · Ctrl+X: cortar · Ctrl+C: copiar · Ctrl+V: pegar donde está el ratón (también en otra sala) · Supr: borrar · Esc: soltar.</p>';
  if (S.clip) h += `<p class="dim">${S.clip.cut ? 'Cortado' : 'Copiado'}: ${S.clip.w}×${S.clip.h} de ${S.clip.room}.</p>`;
  if (S.area) h += '<div class="row"><button id="ar-cut">Cortar</button><button id="ar-copy">Copiar</button><button id="ar-del">Borrar</button></div>';
  if (S.clip) h += `<div class="row"><button id="ar-paste" title="Se pega con su esquina donde estaba el ratón por última vez sobre la sala">Pegar ${S.clip.w}×${S.clip.h}</button></div>`;
  h += field('el hueco que deja (al mover, cortar o borrar) queda como', { v: S.areaFill === '#' ? 'pared' : 'aire', options: ['aire', 'pared'] }, (v) => { S.areaFill = v === 'pared' ? '#' : '.'; try { localStorage.setItem('linfa.areaFill', S.areaFill); } catch {} }, 'select');
  return h;
}
function wireAreaPanel() {
  const on = (id, fn) => { if ($(id)) $(id).onclick = fn; };
  on('ar-cut', () => areaCut());
  on('ar-copy', () => areaCopy());
  on('ar-del', () => areaDelete());
  on('ar-paste', () => areaPaste());
}
// Borra la zona: casillas (a pared o aire) y lo que hay encima.
function areaDelete() {
  if (!S.area) return;
  const rc = areaRect(S.area);
  snapshot();
  removeElements(elementsIn(rc));
  fillRect(room(), rc);
  clearVeil(room(), rc);
  touch(); renderInspector(); draw();
}
// Guarda la zona (casillas y elementos, con su sitio dentro de ella) para pegarla.
function areaCopy(cutIt = false) {
  if (!S.area) return elemCopy(cutIt);
  const rc = areaRect(S.area), [x, y, w, h] = rc, r = room(), src = elementsIn(rc);
  S.clip = {
    room: S.id, rect: rc, w, h, cut: cutIt, src,
    tiles: Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => getTile(x + i, y + j))),
    veil: veilIn(r, rc),
    elems: src.map(({ kind, o }) => ({ kind, o: clone(o), at: elemPos(kind, o, r).map((v, k) => v - rc[k]) })),
  };
  $('msg').textContent = cutIt
    ? `Zona cortada (${w}×${h}): pon el ratón donde la quieras y pulsa Ctrl+V (Esc lo anula).`
    : `Zona copiada (${w}×${h}): pon el ratón donde la quieras y pulsa Ctrl+V.`;
  renderInspector(); draw();
}
const areaCut = () => areaCopy(true);
// Copiar o cortar el elemento seleccionado (criatura, lámpara, rostro, decoración...): se
// pega con su esquina donde esté el ratón, sin tocar las casillas.
function elemCopy(cutIt) {
  const o = selected();
  if (S.sel?.kind === 'tile' && o) {
    S.clip = { room: S.id, rect: [o.x, o.y, 1, 1], w: 1, h: 1, cut: cutIt, tileOnly: true, fill: '.', src: [], tiles: [[o.tile]], veil: [], elems: [] };
    $('msg').textContent = `${TILE_BY_CHAR[o.tile]?.name ?? o.tile} ${cutIt ? 'cortado' : 'copiado'}: pon el ratón donde lo quieras y pulsa Ctrl+V.`;
    renderInspector(); draw();
    return;
  }
  if (!o || !S.sel || S.sel.kind === 'pods' || S.sel.kind === 'exits') { $('msg').textContent = 'Nada que copiar: marca una zona o selecciona un elemento.'; return; }
  const kind = S.sel.kind, r = room(), [bx, by, bw, bh] = KINDS[kind].box(o, r);
  S.clip = {
    room: S.id, rect: [bx, by, bw, bh], w: bw, h: bh, cut: cutIt, elemOnly: true,
    src: [{ kind, o }], tiles: null, veil: [],
    elems: [{ kind, o: clone(o), at: elemPos(kind, o, r).map((v, k) => v - [bx, by][k]) }],
  };
  $('msg').textContent = `${KINDS[kind]?.label ?? kind} ${cutIt ? 'cortado' : 'copiado'}: pon el ratón donde lo quieras y pulsa Ctrl+V.`;
  renderInspector(); draw();
}
// Pega con la esquina donde está el ratón. Si era un corte, lo quita del sitio original.
function areaPaste() {
  const c = S.clip;
  if (!c) return;
  if (S.tool !== 'area') setTool('area');
  const [hx, hy] = S.hover ?? c.rect;
  snapshot();
  if (c.cut) {
    const src = S.rooms[c.room];
    if (src && c.room !== S.id) { snapshotRoom(c.room); S.dirty.add(c.room); CTX_CACHE.delete(c.room); }
    if (src) { removeElements(c.src, src); if (!c.elemOnly) { fillRect(src, c.rect, c.fill); if (!c.tileOnly) clearVeil(src, c.rect); } }
  }
  if (!c.elemOnly) {
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) setTile(hx + i, hy + j, c.tiles[j][i]);
    if (!c.tileOnly) {
      clearVeil(room(), [hx, hy, c.w, c.h]);
      for (const [i, j] of c.veil ?? []) setVeil(room(), hx + i, hy + j, true);
    }
  }
  const r = room(), elems = addCopies(c.elems);
  elems.forEach((e, i) => {
    const at = c.elems[i].at, [bx, by] = elemPos(e.kind, e.o, r);
    moveElement(e, hx + at[0] - bx, hy + at[1] - by);
  });
  if (c.tileOnly) { S.area = null; S.sel = { kind: 'tile', x: hx, y: hy }; }
  else if (c.elemOnly) {
    // Un elemento: queda seleccionado (sin zona).
    const e = elems[0];
    S.area = null;
    S.sel = e ? { kind: e.kind, index: (e.kind === 'pods' ? r.pods.at : r[e.kind]).indexOf(e.o) } : null;
  } else S.area = { x0: hx, y0: hy, x1: hx + c.w - 1, y1: hy + c.h - 1 };
  $('msg').textContent = c.cut ? 'Zona movida aquí (Ctrl+Z la devuelve).' : 'Zona pegada (Ctrl+V otra vez pega otra copia).';
  if (c.cut) { c.cut = false; c.src = []; } // a partir de ahora, pegar hace copias
  touch(); renderInspector(); draw();
}
function drawArea(z) {
  if (S.sel?.kind === 'tile' && !S.float) {
    const { x, y } = S.sel;
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.strokeRect(x * z + 1, y * z + 1, z - 2, z - 2);
  }
  const c = S.clip;
  if (c?.cut && c.room === S.id) {
    const [x, y, w, h] = c.rect;
    g.fillStyle = 'rgba(255,60,80,0.28)'; g.fillRect(x * z, y * z, w * z, h * z);
    g.strokeStyle = '#ff3c50'; g.lineWidth = 2; g.setLineDash([4, 4]);
    g.strokeRect(x * z + 1, y * z + 1, w * z - 2, h * z - 2); g.setLineDash([]);
    g.fillStyle = '#ff8a96'; g.font = 'bold 11px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('cortado · Ctrl+V lo pega', x * z + 2, (y + h) * z + 2);
  }
  if (S.tool !== 'area') return;
  const F = S.float;
  if (F) {
    g.globalAlpha = 0.75;
    const bc = biomeColors(room().biome);
    for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) {
      const c = F.tiles[j][i], t = TILE_BY_CHAR[c];
      g.fillStyle = c === '#' ? bc.wall : c === '.' || t?.item || t?.slope || t?.ceil ? bc.air : t?.color ?? '#ff00ff';
      g.fillRect((F.x + F.dx + i) * z, (F.y + F.dy + j) * z, z, z);
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#3aff8a'; g.lineWidth = 2; g.setLineDash([6, 4]);
    g.strokeRect((F.x + F.dx) * z + 1, (F.y + F.dy) * z + 1, F.w * z - 2, F.h * z - 2); g.setLineDash([]);
    return;
  }
  if (!S.area) return;
  const [x, y, w, h] = areaRect(S.area);
  g.fillStyle = 'rgba(255,210,63,0.12)'; g.fillRect(x * z, y * z, w * z, h * z);
  g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.setLineDash([6, 4]);
  g.strokeRect(x * z + 1, y * z + 1, w * z - 2, h * z - 2); g.setLineDash([]);
  g.fillStyle = '#ffd23f'; g.font = 'bold 11px monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom';
  g.fillText(`${w}×${h}`, x * z + 2, y * z - 2);
}

function setTool(t) {
  if (t !== 'area' && S.area) { S.area = null; S.float = null; }
  S.tool = t;
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
  if (typeof renderInspector === 'function' && S.id) { renderInspector(); renderPalette(); }
  $('kind-row').style.display = t === 'place' ? '' : 'none';
  showDecorRow();
}
function renderTools() {
  $('tools').innerHTML = TOOLS.map(([id, label, key]) => `<button data-tool="${id}" title="${label} (${key})">${label}<kbd>${key}</kbd></button>`).join('');
  for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  // Al final, atajos a las casillas especiales (se pintan con el pincel, no se colocan):
  // así se encuentran también desde aquí.
  const TILE_SHORTCUTS = ['o', 'Y', 'X', 'K', 'f', 'N'];
  $('kind').innerHTML = Object.entries(KINDS).filter(([k]) => k !== 'exits').map(([k, K]) => `<option value="${k}">${K.label}</option>`).join('')
    + `<optgroup label="Casillas (se pintan con el pincel)">${TILE_SHORTCUTS.map((c) => `<option value="tile:${c}">${TILE_BY_CHAR[c].name} · casilla ${c}</option>`).join('')}</optgroup>`;
  $('kind').onchange = () => {
    const v = $('kind').value;
    if (v.startsWith('tile:')) {
      S.tile = v.slice(5);
      $('kind').value = S.kind;
      setTool('brush');
      $('msg').textContent = `${TILE_BY_CHAR[S.tile].name}: píntalo con el pincel (casilla ${S.tile}).`;
      if (S.id) renderPalette();
      return;
    }
    S.kind = v; S.noduleLux = false; showDecorRow(); if (S.id) renderPalette();
  };
  $('decor-type').innerHTML = Object.entries(DECOR).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('');
  if (!DECOR[S.decorType]) S.decorType = 'neurona';
  $('decor-type').value = S.decorType;
  $('decor-type').onchange = () => { S.decorType = $('decor-type').value; renderPalette(); draw(); };
  showDecorRow();
  $('brush').oninput = () => { S.brush = Number($('brush').value); $('brush-v').textContent = S.brush; };
  setTool('brush');
}
// Silueta de una rampa (SVG): pared bajo la recta (suelo) o sobre ella (techo).
function slopeIcon(t, size, wall, air) {
  const q = (v) => (v / 16) * size;
  const pts = t.slope ? [[0, q(t.slope[0])], [size, q(t.slope[1])], [size, size], [0, size]]
    : [[0, 0], [size, 0], [size, q(t.ceil[1])], [0, q(t.ceil[0])]];
  return `<svg width="${size}" height="${size}" style="display:inline-block;vertical-align:middle;background:${air}"><polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${wall}"/></svg>`;
}
function renderPalette() {
  const bc = biomeColors(room()?.biome);
  // Al final, accesos a elementos que se buscan junto a los objetos (los nódulos no son
  // casillas: pulsarlos pasa a "Colocar elementos" con ese nódulo).
  const extras = [['nodule', 'Nódulo óseo (elemento: suelta hueso)', '#e8dcc8', 'n'], ['noduleLux', 'Nódulo lumínico (elemento: suelta célula)', '#ffd23f', 'n*'], ['lamp', 'Luminaria colgante (elemento: luz tenue)', '#9affc8', 'l']];
  // La pieza elegida (rampa o decoración) en grande, con cómo orientarla (T voltea).
  const pc = palettePiece(bc);
  $('palette').innerHTML = (pc ? pieceCard(pc, 'pc') : '') + TILES.map((t) => `<button class="sw${t.c === S.tile ? ' on' : ''}" data-c="${t.c}" title="${t.name}">${t.slope || t.ceil ? slopeIcon(t, 14, bc.wall, bc.air) : `<i style="background:${t.c === '#' ? bc.wall : t.c === '.' ? bc.air : t.color}"></i>`}<b>${t.c}</b><span>${t.name}</span></button>`).join('')
    + extras.map(([id, name, col, mark]) => `<button class="sw${S.tool === 'place' && (id === 'lamp' ? S.kind === 'lamps' : S.kind === 'nodules' && !!S.noduleLux === (id === 'noduleLux')) ? ' on' : ''}" data-el="${id}" title="${name}"><i style="background:${col}"></i><b>${mark}</b><span>${name}</span></button>`).join('');
  if (pc) wirePiece(pc, 'pc', null, () => { renderPalette(); draw(); });
  for (const b of document.querySelectorAll('#palette .sw')) b.onclick = () => {
    if (b.dataset.el) {
      S.kind = b.dataset.el === 'lamp' ? 'lamps' : 'nodules';
      S.noduleLux = b.dataset.el === 'noduleLux';
      $('kind').value = S.kind;
      setTool('place');
    } else {
      S.tile = b.dataset.c;
      if (!['brush', 'blob', 'rect', 'fill'].includes(S.tool)) setTool('brush');
    }
    renderPalette();
  };
}

// ---------------------------------------------------------------- inspector
function field(label, value, onset, type) {
  const id = 'f' + Math.random().toString(36).slice(2);
  let input;
  if (type === 'select') input = `<select id="${id}">${value.options.map((o) => `<option${o === value.v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  else if (typeof value === 'boolean') input = `<input id="${id}" type="checkbox"${value ? ' checked' : ''}>`;
  else if (typeof value === 'number') input = `<input id="${id}" type="number" step="any" value="${value}">`;
  else if (type === 'textarea' || (typeof value === 'string' && value.length > 30)) input = `<textarea id="${id}" rows="${type === 'textarea' ? 6 : 3}">${String(value).replace(/</g, '&lt;')}</textarea>`;
  else if (typeof value === 'string') input = `<input id="${id}" value="${value.replace(/"/g, '&quot;')}">`;
  else input = `<input id="${id}" class="json" value='${JSON.stringify(value)}'>`;
  setTimeout(() => {
    const el = $(id);
    if (!el) return;
    el.onchange = () => {
      let v;
      if (type === 'select') v = el.value;
      else if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') v = Number(el.value);
      else if (el.classList.contains('json')) { try { v = JSON.parse(el.value); } catch { el.classList.add('bad'); return; } }
      else v = el.value;
      el.classList.remove('bad');
      snapshot(); onset(v); touch();
      if (S.id) renderRoomPanel();                         // p. ej. la lista de Conexiones
    };
  });
  return `<label>${label}${input}</label>`;
}
// ---------------------------------------------------------------- puntos de conexión
const LINK_TRIGGER = { use: 'con [E] delante (puerta, portal)', touch: 'al tocarlo (paso directo)' };
const LINK_LOOK = { portal: 'portal de carne (se ve)', hidden: 'invisible' };
function linkFields(o) {
  const rooms = ['', ...Object.keys(S.rooms)];
  const targets = ['', ...(S.rooms[o.to]?.links ?? []).filter((l) => !(o.to === S.id && l === o)).map((l) => l.id)];
  let h = field('nombre del punto', o.id, (v) => renameLink(o, v));
  h += field('lleva a la sala (vacío: solo punto de llegada)', { v: o.to ?? '', options: rooms }, (v) => { o.to = v; if (!v || !(S.rooms[v]?.links ?? []).some((l) => l.id === o.toLink)) o.toLink = ''; renderInspector(); }, 'select');
  if (o.to) h += field('punto de destino', { v: o.toLink ?? '', options: targets }, (v) => { o.toLink = v; renderInspector(); }, 'select');
  if (o.to && !targets.slice(1).length) h += `<p class="dim">La sala ${o.to} no tiene puntos: ábrela y pon uno (o pulsa "Crear el punto de llegada").</p>`;
  h += field('se activa', { v: LINK_TRIGGER[o.trigger ?? 'use'], options: Object.values(LINK_TRIGGER) }, (v) => { o.trigger = Object.keys(LINK_TRIGGER).find((k) => LINK_TRIGGER[k] === v); }, 'select');
  h += field('aspecto', { v: LINK_LOOK[o.look ?? 'portal'], options: Object.values(LINK_LOOK) }, (v) => { o.look = Object.keys(LINK_LOOK).find((k) => LINK_LOOK[k] === v); }, 'select');
  h += field('tamaño [ancho, alto] (casillas)', [o.w ?? 1, o.h ?? 2], (v) => { o.w = Math.max(1, v[0]); o.h = Math.max(1, v[1]); });
  if (physicalHole(o)) {
    // Sin teletransporte: por un hueco de techo o suelo se entra con tu propio movimiento.
    h += `<p class="dim" style="margin:6px 0 2px">Hueco de ${o.y === 0 ? 'techo' : 'suelo'}: en este mapa <b style="color:#3aff8a">se entra por la boca</b>, con el impulso que traes (${o.y === 0 ? 'cayendo' : 'subiendo: el pozo hay que poder trepararlo con doble salto, paredes, garfios o corriente; si no, vuelves a caer'}). No hay llegada que marcar.</p>`;
    if (o.arrive) h += '<div class="row"><button id="lk-arr-del">Quitar la llegada marcada (no se usa)</button></div>';
  } else {
    const auto = linkArrival({ ...room(), links: [{ ...o, arrive: undefined }] }, o.id);
    h += `<p class="dim" style="margin:6px 0 2px">Al llegar aquí se aparece en: <b style="color:#3aff8a">${o.arrive ? `[${o.arrive}] (marcado)` : `[${auto}] (automático)`}</b></p>`;
    h += `<div class="row"><button id="lk-arr" class="${S.pickArrive === o ? 'on' : ''}">${S.pickArrive === o ? 'Haz clic en la sala… (Esc cancela)' : 'Marcar dónde se aparece'}</button>${o.arrive ? '<button id="lk-arr-del">Volver a automático</button>' : ''}</div>`;
  }
  // Estado de la conexión, en claro.
  const back = o.to && o.toLink && (S.rooms[o.to]?.links ?? []).find((l) => l.id === o.toLink);
  const two = back && back.to === S.id && back.toLink === o.id;
  h += `<p style="color:${!o.to ? '#aaa' : two ? '#3aff8a' : '#ffd23f'};font-size:11px">${!o.to ? 'Solo punto de llegada (no lleva a ningún sitio).' : !o.toLink ? `Lleva a la sala ${o.to} (sin punto: se aparece en su inicio).` : two ? `Ida y vuelta con ${o.to} · ${o.toLink}.` : `Solo de ida: ${o.to} · ${o.toLink} no vuelve aquí.`}</p>`;
  h += '<div class="row">';
  if (o.to && !o.toLink) h += '<button id="lk-mk">Crear el punto de llegada allí</button>';
  if (back && !two) h += '<button id="lk-back">Crear la vuelta (ida y vuelta)</button>';
  if (two) h += '<button id="lk-oneway">Dejar solo de ida</button>';
  if (o.to) h += '<button id="lk-go">Ir al destino</button>';
  return h + '</div>';
}
function wireLinkButtons(o) {
  const r = room(), here = S.id;
  if ($('lk-arr')) $('lk-arr').onclick = () => { S.pickArrive = S.pickArrive === o ? null : o; $('msg').textContent = S.pickArrive ? `Clic en la casilla donde pisará el personaje al llegar por ${o.id} (sus pies quedan en esa casilla).` : ''; renderInspector(); draw(); };
  if ($('lk-arr-del')) $('lk-arr-del').onclick = () => { snapshot(); delete o.arrive; touch(); renderInspector(); draw(); };
  if ($('lk-back')) $('lk-back').onclick = () => {
    const t = S.rooms[o.to].links.find((l) => l.id === o.toLink);
    snapshot(); t.to = here; t.toLink = o.id; S.dirty.add(o.to); touch(); renderInspector();
  };
  if ($('lk-oneway')) $('lk-oneway').onclick = () => {
    const t = S.rooms[o.to].links.find((l) => l.id === o.toLink);
    snapshot(); t.to = ''; t.toLink = ''; S.dirty.add(o.to); touch(); renderInspector();
  };
  if ($('lk-mk')) $('lk-mk').onclick = () => {
    // Un punto de llegada en la otra sala, sobre el primer suelo libre que encuentre.
    const t = S.rooms[o.to], used = new Set((t.links ?? []).map((l) => l.id));
    let n = 1; while (used.has('p' + n)) n++;
    let at = [1, 1];
    for (let y = 1; y < t.grid.length - 1 && at[1] === 1; y++) for (let x = 1; x < t.grid[0].length - 1; x++) {
      if (!SOLID.has(t.grid[y][x]) && !SOLID.has(t.grid[y - 1][x]) && SOLID.has(t.grid[y + 1][x])) { at = [x, y]; break; }
    }
    snapshot();
    (t.links ??= []).push({ id: 'p' + n, x: at[0], y: at[1] - 1, w: 1, h: 2, to: '', toLink: '', trigger: 'use', look: 'portal' });
    o.toLink = 'p' + n; S.dirty.add(o.to); touch(); renderInspector();
    $('msg').textContent = `Punto ${'p' + n} creado en ${o.to}. Pulsa "Ir al destino" para colocarlo donde quieras.`;
  };
  if ($('lk-go')) $('lk-go').onclick = () => {
    const to = o.to, id = o.toLink;
    openRoom(to);
    const i = (room().links ?? []).findIndex((l) => l.id === id);
    if (i >= 0) { S.sel = { kind: 'links', index: i }; setTool('area'); renderInspector(); draw(); }
  };
}
// Cambiar el nombre de un punto también cambia los que llegaban a él.
function renameLink(o, v) {
  v = String(v).trim();
  if (!v || v === o.id) return;
  if ((room().links ?? []).some((l) => l !== o && l.id === v)) { alert('Ya hay un punto con ese nombre en esta sala.'); return; }
  for (const [id, rr] of Object.entries(S.rooms)) {
    for (const l of rr.links ?? []) if (l.to === S.id && l.toLink === o.id) { l.toLink = v; S.dirty.add(id); }
    for (const ex of rr.exits ?? []) if (ex.to === S.id && ex.toLink === o.id) { ex.toLink = v; S.dirty.add(id); }
  }
  o.id = v;
}

function renderInspector() {
  const box = $('inspector');
  const o = selected();
  if (S.tool === 'area' && !o) { box.innerHTML = areaPanel(); wireAreaPanel(); return; }
  if (!o) { box.innerHTML = '<p class="dim">Selecciona un elemento (M) o coloca uno nuevo (E). Clic derecho borra.</p>'; return; }
  if (S.sel.kind === 'tile') {
    const opts = TILES.filter((t) => isTileObj(t.c));
    box.innerHTML = `<h3>${TILE_BY_CHAR[o.tile]?.name ?? o.tile} <span class="dim">[${o.x}, ${o.y}]</span></h3>
      <label>cambiar por<select id="ts-type">${opts.map((t) => `<option value="${t.c}"${t.c === o.tile ? ' selected' : ''}>${t.c} · ${t.name}</option>`).join('')}</select></label>
      <p class="dim">Arrastra para moverlo · Supr o clic derecho lo borra · Ctrl+C / Ctrl+X y Ctrl+V lo copian o cortan.</p>
      <div class="row"><button id="del">Eliminar</button></div>`;
    $('ts-type').onchange = (e) => { snapshot(); setTile(o.x, o.y, e.target.value); touch(); renderInspector(); draw(); };
    $('del').onclick = deleteSelected;
    return;
  }
  const kind = S.sel.kind;
  let html = `<h3>${KINDS[kind]?.label ?? kind} <span class="dim">#${S.sel.index}</span></h3>`;
  if (Array.isArray(o)) html += field('posición [x, y]', o, (v) => { o[0] = v[0]; o[1] = v[1]; });
  // Nódulos: el tercer valor 'luz' lo vuelve lumínico (brilla a oscuras y suelta una célula).
  // Luminarias: el tercer valor es el largo del pingajo en píxeles.
  if (kind === 'lamps') html += field('largo (px)', o[2] ?? 10, (v) => { o[2] = Math.max(2, Math.round(v)); }, 'number');
  if (kind === 'nodules') html += field('tipo', { v: o[2] === 'luz' ? 'luz (suelta célula)' : 'óseo (suelta hueso)', options: ['óseo (suelta hueso)', 'luz (suelta célula)'] }, (nv) => { if (nv.startsWith('luz')) o[2] = 'luz'; else o.length = 2; }, 'select');
  else if (kind === 'links') html += linkFields(o);
  else if (kind === 'faces') {
    const fd = faceData(room().biome);
    html += field('x (centro de la base)', o.x, (v) => { o.x = Math.round(v); }, 'number') + field('y (suelo bajo la base)', o.y, (v) => { o.y = Math.round(v); }, 'number');
    html += field('delante de las paredes (front)', !!o.front, (v) => { o.front = v; });
    html += field('lo libera el jefe', { v: o.boss ?? `(el del bioma: ${fd.boss ?? 'ninguno'})`, options: [`(el del bioma: ${fd.boss ?? 'ninguno'})`, ...BOSSES] }, (v) => { if (v.startsWith('(')) delete o.boss; else o.boss = v; }, 'select');
    html += `<p class="dim">Textos del rostro: los de su bioma (data/faces.js). Si los cambias aquí se guardan solo para este rostro; vacía un campo para volver a los del bioma.</p>`;
    const txt = (label, key, multi) => {
      const val = o[key] ?? fd[key];
      return field(label, multi ? (val ?? []).join('\n\n') : val ?? '', (v) => {
        const nv = multi ? v.split(/\n\s*\n/).map((s) => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean) : v.replace(/\s*\n\s*/g, ' ').trim();
        const empty = multi ? !nv.length : !nv;
        if (empty || JSON.stringify(nv) === JSON.stringify(fd[key])) delete o[key]; else o[key] = nv;
      }, 'textarea');
    };
    html += txt('poseído: provocaciones (aviso; la primera al verte, luego al azar; una línea en blanco las separa)', 'taunts', true);
    html += txt('liberado: agradecimiento (diálogo)', 'thanks', false);
    html += txt('liberado: al abrir sus membranas (diálogo)', 'opens', false);
    html += txt('liberado: pistas (diálogo, una cada vez, en orden)', 'hints', true);
    html += `<div class="row"><button id="face-reset">Volver a los textos del bioma</button></div>`;
  }
  else if (kind === 'texts') {
    html += field('textos (una línea en blanco separa una pantalla de la siguiente)', (o.lines ?? []).join('\n\n'), (v) => {
      o.lines = v.split(/\n\s*\n/).map((s) => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    }, 'textarea');
    html += field('quién habla (vacío: nadie)', o.speaker ?? '', (v) => { if (v.trim()) o.speaker = v.trim(); else delete o.speaker; });
    html += field('tipo', { v: o.mode === 'aviso' ? 'aviso (se va solo)' : 'diálogo (espera a que el jugador pase)', options: ['diálogo (espera a que el jugador pase)', 'aviso (se va solo)'] }, (v) => { o.mode = v.startsWith('aviso') ? 'aviso' : 'dialogo'; }, 'select');
    html += field('solo la primera vez', o.once !== false, (v) => { o.once = v; });
    const WHEN = { '': 'siempre', antes: 'solo antes de vencer al jefe', despues: 'solo después de vencer al jefe' };
    html += field('cuándo', { v: WHEN[o.when ?? ''], options: Object.values(WHEN) }, (v) => {
      const k = Object.keys(WHEN).find((key) => WHEN[key] === v);
      if (k) { o.when = k; o.boss ??= bossOfRoom(room()); } else { delete o.when; delete o.boss; }
    }, 'select');
    if (o.when) html += field('jefe', { v: o.boss ?? '', options: BOSSES }, (v) => { o.boss = v; }, 'select');
    html += field('x', o.x, (v) => { o.x = Math.round(v); }, 'number') + field('y', o.y, (v) => { o.y = Math.round(v); }, 'number');
    html += field('ancho (casillas)', o.w ?? 1, (v) => { o.w = Math.max(1, Math.round(v)); }, 'number') + field('alto (casillas)', o.h ?? 1, (v) => { o.h = Math.max(1, Math.round(v)); }, 'number');
    html += `<p class="dim">Salta al entrar en la zona. Para verlo: Alt+clic cerca para el punto de prueba y "Probar ▶".</p>`;
  }
  else for (const [k, v] of Object.entries(o)) {
    if (kind === 'exits' && k === 'toLink') continue;
    if (kind === 'enemies' && k === 'type') html += field('tipo', { v, options: ENEMY_TYPES }, (nv) => { o.type = nv; }, 'select');
    else if (kind === 'decor' && k === 'side') continue;
    else if (kind === 'decor' && (k === 'invert' || k === 'flip')) {
      if (k === 'invert') html += pieceCard(decorPieceOf(o), 'dc');
    }
    else if (kind === 'decor' && k === 'type') html += field('estructura', { v: DECOR[v]?.name ?? v, options: Object.values(DECOR).map((d) => d.name) }, (nv) => { o.type = Object.keys(DECOR).find((key) => DECOR[key].name === nv) ?? o.type; }, 'select');
    else if (kind === 'exits' && k === 'to') html += field('lleva a', { v, options: Object.keys(S.rooms) }, (nv) => { o.to = nv; }, 'select');
    else if (kind === 'bellows' && k === 'dir') html += pieceCard(bellowsPieceOf(o), 'bl');
    else if (kind === 'exits' && k === 'side') html += field('lado', { v, options: ['left', 'right', 'top', 'bottom'] }, (nv) => { o.side = nv; }, 'select');
    else html += field(k, v, (nv) => { o[k] = nv; });
  }
  if (kind === 'exits') html += field('llega al punto (opcional: en vez de "spawn")', { v: o.toLink ?? '', options: ['', ...(S.rooms[o.to]?.links ?? []).map((l) => l.id)] }, (nv) => { if (nv) o.toLink = nv; else delete o.toLink; }, 'select');
  if (kind === 'decor' && o.type === WALL_TYPE) {
    const list = room().decor ?? [], i = list.indexOf(o), pair = neuronPairs(list).find((p) => p.floor === i || p.ceil === i);
    const hint = o.side === 'left' ? 'en la pared derecha, enfrente, en esta misma fila (o una al lado)'
      : o.side === 'right' ? 'en la pared izquierda, enfrente, en esta misma fila (o una al lado)'
      : o.invert ? 'en el suelo, debajo, en esta misma columna (o una al lado)' : 'colgado del techo, encima, en esta misma columna (o una al lado)';
    if (!pair) html += `<p class="dim">Pon otro ganglio ${hint} y entre los dos se forma un muro eléctrico.</p>`;
    else if (pair.ceil === i) html += `<p class="dim">Forma un muro eléctrico con el ganglio ${pair.horiz ? 'de la pared izquierda' : 'del suelo de debajo'}: sus tiempos se ajustan en aquel.</p>`;
    else {
      const w = { ...WALL_DEFAULT, ...(o.wall ?? {}) }, setWall = (k, v) => { o.wall = { ...(o.wall ?? {}), [k]: Math.max(0, Math.round(v * 10) / 10) }; if (o.wall[k] === WALL_DEFAULT[k]) delete o.wall[k]; if (!Object.keys(o.wall).length) delete o.wall; };
      html += `<h4 style="margin-top:8px">Muro eléctrico</h4>`;
      html += field('encendido (segundos)', w.on, (v) => setWall('on', v), 'number');
      html += field('apagado (segundos; avisa cargando 0,8 s antes)', w.off, (v) => setWall('off', v), 'number');
      html += field('desfase (segundos; para alternar varios muros)', w.delay, (v) => setWall('delay', v), 'number');
    }
  }
  if (kind === 'enemies' && isRotatable(o.type)) html += pieceCard(enemyPieceOf(o), 'en');
  if (kind === 'enemies') html += `<p class="dim">${ENEMIES[o.type]?.name ?? ''} · ${ENEMIES[o.type]?.w}x${ENEMIES[o.type]?.h}px · ${ENEMIES[o.type]?.behavior}</p>`;
  if (kind === 'pods') html += field('abre la compuerta', room().pods.opens, (v) => { room().pods.opens = v; }) + field('orden (índices)', room().pods.order, (v) => { room().pods.order = v; });
  html += `<div class="row"><button id="del">Eliminar</button><button id="dup">Duplicar</button></div>`;
  box.innerHTML = html;
  if (kind === 'links') wireLinkButtons(o);
  if (kind === 'faces' && $('face-reset')) $('face-reset').onclick = () => { snapshot(); for (const k of ['taunts', 'thanks', 'opens', 'hints']) delete o[k]; touch(); renderInspector(); };
  $('del').onclick = deleteSelected;
  if (kind === 'decor') wirePiece(decorPieceOf(o), 'dc', snapshot, () => { touch(); renderInspector(); draw(); });
  if (kind === 'bellows') wirePiece(bellowsPieceOf(o), 'bl', snapshot, () => { touch(); renderInspector(); draw(); });
  if (kind === 'enemies' && isRotatable(o.type)) wirePiece(enemyPieceOf(o), 'en', snapshot, () => { touch(); renderInspector(); draw(); });
  $('dup').onclick = () => {
    if (kind === 'pods') return;
    snapshot();
    const c = clone(o);
    if (!Array.isArray(c)) { if (typeof c.x === 'number') c.x += 1; } else c[0] += 1;
    room()[kind].push(c);
    S.sel = { kind, index: room()[kind].length - 1 };
    touch(); renderInspector();
  };
}
const BOSSES = Object.keys(ENEMIES).filter((id) => ENEMIES[id].boss);
const bossOfRoom = (r) => (r.enemies ?? []).map((e) => e.type).find((t) => ENEMIES[t]?.boss) ?? BOSSES[0];
function deleteSelected() {
  if (!S.sel) return;
  snapshot();
  if (S.sel.kind === 'tile') {
    const { x, y } = S.sel, r = room();
    setTile(x, y, '.');
    if (r.hidden) { r.hidden = r.hidden.filter(([hx, hy]) => hx !== x || hy !== y); if (!r.hidden.length) delete r.hidden; }
    S.sel = null; touch(); renderInspector(); draw();
    return;
  }
  if (S.sel.kind === 'pods') {
    const p = room().pods;
    p.at.splice(S.sel.index, 1);
    p.order = p.order.filter((i) => i !== S.sel.index).map((i) => (i > S.sel.index ? i - 1 : i));
    if (!p.at.length) delete room().pods;
  } else {
    room()[S.sel.kind].splice(S.sel.index, 1);
    if (!room()[S.sel.kind].length) delete room()[S.sel.kind];
  }
  S.sel = null;
  touch(); renderInspector(); renderRoomPanel();
}

// ---------------------------------------------------------------- panel de sala
// ---------------------------------------------------------------- conexiones (asistente)
// Puntos de conexión de la sala: qué hay, adónde lleva cada uno y quién llega aquí. El
// botón "Crear conexión" guía: 1) sitio del punto (del tamaño del personaje, nunca en
// muro ni fuera de la sala), 2) adónde lleva (un punto que ya existe, o uno nuevo que se
// marca en otra sala) y 3) si es recíproco (ida y vuelta) o solo de ida.
const PW = 1, PH = 2;                                 // tamaño mínimo: el del personaje
const bName = (id) => BIOMES[S.rooms[id]?.biome]?.name ?? '';
const linkOf = (roomId, linkId) => (S.rooms[roomId]?.links ?? []).find((l) => l.id === linkId);
const isReciprocal = (roomId, l) => { const t = l.to && linkOf(l.to, l.toLink); return !!t && t.to === roomId && t.toLink === l.id; };
function newLinkId(r) { const used = new Set((r.links ?? []).map((l) => l.id)); let n = 1; while (used.has('p' + n)) n++; return 'p' + n; }
// ¿Cabe aquí un punto? Dentro de la sala y sin muro (ni rampa) en ninguna de sus casillas.
// Casillas que no son paso pero se abren en el juego: un punto de conexión puede ir en ellas
// (membrana agrietada, esfínter, fotosensible, membrana del Rostro); la roca, no.
const OPENABLE = new Set(['X', 'Y', 'f', 'K']);
const passOrOpen = (c) => !SOLID.has(c) || OPENABLE.has(c);
function spotOk(r, x, y, w = PW, h = PH) {
  if (x < 0 || y < 0 || x + w > r.grid[0].length || y + h > r.grid.length) return false;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const c = r.grid[yy][xx]; if (!passOrOpen(c) || TILE_BY_CHAR[c]?.slope || TILE_BY_CHAR[c]?.ceil) return false; }
  return true;
}
// Un punto ya puesto vale si está dentro de la sala y tiene algún paso (libre, o que se abre:
// membrana, esfínter, fotosensible). Al crear uno, spotOk exige el hueco limpio del personaje.
function spotUsable(r, l) {
  let open = false;
  for (let y = l.y; y < l.y + (l.h ?? PH); y++) for (let x = l.x; x < l.x + (l.w ?? PW); x++) {
    const c = r.grid[y]?.[x];
    if (c === undefined) return false;
    if (passOrOpen(c)) open = true;
  }
  return open;
}
// Los que llegan a puntos de esta sala desde otras sin vuelta: [fromRoom, fromLink, toLink].
function incoming(roomId) {
  const out = [];
  for (const [id, o] of Object.entries(S.rooms)) for (const l of o.links ?? []) {
    if (l.to !== roomId || !l.toLink) continue;
    const t = linkOf(roomId, l.toLink);
    if (t && !(t.to === id && t.toLink === l.id)) out.push([id, l, t]);
  }
  return out;
}
const arrivals = (roomId, l) => Object.values(S.rooms).some((o) => (o.links ?? []).some((k) => k.to === roomId && k.toLink === l.id) || (o.exits ?? []).some((e) => e.to === roomId && e.toLink === l.id));
// Un punto pegado al borde de la sala es un paso: se cruza al tocarlo y no se ve.
const atEdge = (r, x, y, w = PW, h = PH) => x === 0 || y === 0 || x + w === r.grid[0].length || y + h === r.grid.length;
function connectionsHtml(r) {
  const L = S.linking;
  let h = `<h4>Conexiones</h4>`;
  // Puntos de esta sala.
  const links = r.links ?? [];
  if (!links.length && !(r.exits ?? []).length) h += '<div class="dim" style="font-size:11px">Esta sala no tiene conexiones. Un hueco en el borde no es una conexión: solo cuenta lo que conectes aquí.</div>';
  links.forEach((l, i) => {
    const st = !l.to ? (arrivals(S.id, l) ? ['punto de llegada', '#aaa'] : ['⚠ sin destino: no hace nada', '#ffd23f']) : !l.toLink ? [`→ ${l.to} (a su inicio)`, '#ffd23f'] : isReciprocal(S.id, l) ? [`⇄ ${l.to} · ${l.toLink} · ida y vuelta`, '#3aff8a'] : [`→ ${l.to} · ${l.toLink} · solo ida`, '#40e0ff'];
    const sel = S.sel?.kind === 'links' && S.sel.index === i;
    h += `<button class="ex${sel ? ' on' : ''}" data-lsel="${i}" style="text-align:left"><b>${l.id}</b> (${l.x},${l.y + (l.h ?? PH) - 1}) <span style="color:${st[1]}">${st[0]}</span></button>`;
    if (!l.to && !sel && !incoming(S.id).some(([, , t]) => t === l) && !arrivals(S.id, l)) h += `<div class="row"><button data-lredo="${i}" style="color:#ffd23f">⚠ Sin destino: elegir destino</button></div>`;
    if (sel) h += `<div class="row"><button data-lview="${i}">Ver</button><button data-lredo="${i}">Cambiar destino</button><button data-ldel="${i}" style="color:#ff8a96">Borrar</button>${l.to && l.toLink && !isReciprocal(S.id, l) && linkOf(l.to, l.toLink) ? `<button data-lrec="${i}">Hacer recíproco</button>` : ''}${isReciprocal(S.id, l) ? `<button data-lone="${i}">Dejar solo ida</button>` : ''}</div>`;
  });
  // Pasos por el borde (salidas de toda la vida): también son conexiones.
  (r.exits ?? []).forEach((ex, i) => {
    const sel = S.sel?.kind === 'exits' && S.sel.index === i;
    const where = { left: 'izquierda', right: 'derecha', top: 'arriba', bottom: 'abajo' }[ex.side];
    h += `<button class="ex${sel ? ' on' : ''}" data-ex="${i}" style="text-align:left"><b>borde ${where}</b>${ex.at ? ` [${ex.at.join('-')}]` : ''} <span style="color:#40e0ff">→ ${ex.to}${ex.toLink ? ' · ' + ex.toLink : ''}</span></button>`;
    if (sel) h += `<div class="row"><button data-exdel="${i}" style="color:#ff8a96">Borrar</button></div>`;
  });
  // Llegan aquí sin vuelta: se puede hacer recíproco.
  for (const [fromId, fl, tl] of incoming(S.id)) h += `<div style="font-size:11px;margin:3px 0">Llega a <b>${tl.id}</b> desde ${fromId} · ${fl.id} (solo ida) <button data-inc="${fromId}|${fl.id}|${tl.id}">Hacer recíproco</button></div>`;
  h += `<div class="row"><button id="lk-new" class="primary">Crear conexión</button></div>`;
  return h;
}
// El asistente, flotando arriba del lienzo (siempre a la vista mientras dura).
function renderWizard() {
  let el = $('wizard');
  if (!el) {
    el = document.createElement('div'); el.id = 'wizard';
    cv.parentElement.style.position = 'relative';
    cv.parentElement.appendChild(el);
  }
  const L = S.linking;
  if (!L) { el.hidden = true; return; }
  let h = '';
  if (L?.stage === 'place' && L.room === S.id) h += `<div class="wiz">1/2 · Haz clic en la sala donde irá el punto (fantasma del tamaño del personaje: verde si vale). <button data-lk="cancel">Cancelar</button></div>`;
  if (L?.stage === 'dest' && L.room === S.id) {
    h += `<div class="wiz">2/2 · ¿Adónde lleva <b>${L.link}</b>? Un clic y queda conectado, de ida y vuelta (se cambia luego en Conexiones).</div>`;
    const list = [];
    for (const [id, o] of Object.entries(S.rooms)) for (const l of o.links ?? []) if (!(id === S.id && l.id === L.link)) list.push([id, l]);
    h += '<div class="dim" style="font-size:11px;margin:4px 0 2px">A un punto que ya existe:</div>';
    if (list.length)     h += list.map(([id, l], i) => `<button class="pick" data-dest="${i}">${bName(id)} · ${id} · ${l.id} (${l.x},${l.y + (l.h ?? PH) - 1})${l.to ? ` · ya lleva a ${l.to}` : ' · libre'}</button>`).join('');
    else h += '<div class="dim" style="font-size:11px">(todavía no hay otros puntos)</div>';
    // O a un sitio nuevo de cualquier sala: un botón por sala (un clic y se marca allí).
    h += '<div class="dim" style="font-size:11px;margin:6px 0 2px">O a otra sala (el punto de llegada se crea solo, donde encaja en el mapa):</div><div class="rooms-pick">';
    h += Object.keys(S.rooms).filter((id) => id !== S.id).map((id) => `<button class="pick" data-auto="${id}">${id} · ${S.rooms[id].name}</button>`).join('') + '</div>';
    h += `<div class="row"><button data-lk="none">Sin destino por ahora</button><button data-lk="cancel">Cancelar</button></div>`;
    S.linkList = list;
  }
  if (L?.stage === 'placeDest' && L.room === S.id) h += `<div class="wiz">2/3 · Haz clic en esta sala (${S.id}) donde se llegará desde ${L.from.room} · ${L.from.link}. <button data-lk="cancel">Cancelar</button></div>`;
  if (L?.stage === 'recip' && (L.room === S.id || L.to.room === S.id)) h += `<div class="wiz">3/3 · ${L.from.room} · ${L.from.link} → ${L.to.room} · ${L.to.link}. ¿Recíproco?<div class="row"><button data-lk="both">Sí, ida y vuelta</button><button data-lk="one">Solo de ida</button></div></div>`;
  if (!h) h = `<div class="wiz">Asistente de conexión en curso en la sala ${L.room}. <button data-lk="goto">Ir allí</button> <button data-lk="cancel">Cancelar</button></div>`;
  el.innerHTML = h;
  el.hidden = false;
  wireWizard(el);
}
function wireConnections(r) {
  const box = $('room');
  $('lk-new').onclick = () => { S.linking = { stage: 'place', room: S.id }; setTool('area'); renderRoomPanel(); $('msg').textContent = 'Crear conexión: haz clic donde irá el punto (Esc cancela).'; draw(); };
  for (const b of box.querySelectorAll('[data-lsel]')) b.onclick = () => { S.sel = { kind: 'links', index: Number(b.dataset.lsel) }; renderInspector(); renderRoomPanel(); draw(); };
  for (const b of box.querySelectorAll('[data-lredo]')) b.onclick = () => { S.linking = { stage: 'dest', room: S.id, link: r.links[Number(b.dataset.lredo)].id }; renderRoomPanel(); };
  for (const b of box.querySelectorAll('[data-ldel]')) b.onclick = () => deleteLink(S.id, Number(b.dataset.ldel));
  for (const b of box.querySelectorAll('[data-lview]')) b.onclick = () => viewLink(r.links[Number(b.dataset.lview)]);
  for (const b of box.querySelectorAll('[data-exdel]')) b.onclick = () => {
    const ex = r.exits[Number(b.dataset.exdel)];
    if (!confirm(`¿Borrar el paso por el borde hacia ${ex.to}? (Se mantiene la salida de vuelta en ${ex.to}, si la hay: bórrala allí si quieres.)`)) return;
    snapshot(); r.exits.splice(Number(b.dataset.exdel), 1); S.sel = null; touch(); renderRoomPanel(); renderInspector(); drawMap();
  };
  for (const b of box.querySelectorAll('[data-lrec]')) b.onclick = () => { const l = r.links[Number(b.dataset.lrec)]; makeReciprocal(S.id, l, true); };
  for (const b of box.querySelectorAll('[data-lone]')) b.onclick = () => { const l = r.links[Number(b.dataset.lone)]; makeReciprocal(S.id, l, false); };
  for (const b of box.querySelectorAll('[data-inc]')) b.onclick = () => { const [fr, fl] = b.dataset.inc.split('|'); makeReciprocal(fr, linkOf(fr, fl), true); };
  renderWizard();
}
function wireWizard(box) {
  for (const b of box.querySelectorAll('[data-dest]')) b.onclick = () => {
    const [id, t] = S.linkList[Number(b.dataset.dest)], L = S.linking, l = linkOf(L.room, L.link);
    snapshot(); l.to = id; l.toLink = t.id;
    const both = !t.to;                     // si el otro ya lleva a otro sitio, no se lo quitamos
    if (both) { t.to = L.room; t.toLink = l.id; }
    S.dirty.add(id); S.dirty.add(L.room); touch();
    S.linking = null;
    $('msg').textContent = both ? `Conectado: ${L.room} · ${l.id} ⇄ ${id} · ${t.id} (ida y vuelta).` : `Conectado: ${L.room} · ${l.id} → ${id} · ${t.id} (solo ida: ${t.id} ya llevaba a ${t.to}).`;
    renderRoomPanel(); drawMap(); draw();
  };
  for (const b of box.querySelectorAll('[data-man]')) b.dataset.lk = 'manual';
  // Otra sala: el punto de llegada se pone solo y queda de ida y vuelta.
  for (const b of box.querySelectorAll('[data-auto]')) b.onclick = () => {
    const L = S.linking, l = linkOf(L.room, L.link), to = b.dataset.auto;
    const q = arrivalSpot(L.room, l, to);
    if (!q) { $('msg').textContent = `No encuentro sitio en ${to} para el punto de llegada (ningún hueco de 1×2).`; return; }
    snapshot(); snapshotRoom(to);
    const d = S.rooms[to], id = newLinkId(d), edge = atEdge(d, q.x, q.y, q.w, q.h);
    (d.links ??= []).push({ id, x: q.x, y: q.y, w: q.w, h: q.h, to: L.room, toLink: l.id, trigger: edge ? 'touch' : 'use', look: edge ? 'hidden' : 'portal' });
    l.to = to; l.toLink = id;
    S.dirty.add(to); S.dirty.add(L.room); CTX_CACHE.delete(to); touch();
    S.linking = null;
    $('msg').textContent = `Conectado: ${L.room} · ${l.id} ⇄ ${to} · ${id} (ida y vuelta), en [${q.x},${q.y}] de ${to}. Para moverlo, abre ${to} y arrástralo (M).${arrivalSpot.noHole ? ` Ojo: ${to} no tiene hueco en su borde de ${({ top: 'arriba', bottom: 'abajo', left: 'la izquierda', right: 'la derecha' })[arrivalSpot.noHole]}, así que va dentro como portal (se usa con E); si abres ahí un hueco y lo pones en él, será un paso.` : ''}`;
    renderRoomPanel(); drawMap(); draw();
  };
  for (const b of box.querySelectorAll('[data-lk]')) b.onclick = () => {
    const L = S.linking, a = b.dataset.lk;
    if (a === 'goto') { openRoom(L.room); return; }
    if (a === 'cancel' || a === 'none') { S.linking = null; $('msg').textContent = a === 'none' ? 'Punto creado sin destino: puedes dárselo luego ("Cambiar destino").' : 'Conexión cancelada.'; renderRoomPanel(); draw(); return; }
    if (a === 'manual') {
      const to = b.dataset.man;
      S.linking = { stage: 'placeDest', room: to, from: { room: L.room, link: L.link } };
      if (to !== S.id) openRoom(to); else { renderRoomPanel(); draw(); }
      $('msg').textContent = `Conectar manualmente: haz clic en ${to} donde se llegará (Esc cancela).`;
      return;
    }
    if (a === 'both' || a === 'one') {
      makeReciprocal(L.from.room, linkOf(L.from.room, L.from.link), a === 'both');
      S.linking = null;
      $('msg').textContent = a === 'both' ? 'Conexión de ida y vuelta creada.' : 'Conexión de solo ida creada (el destino es solo un punto de llegada).';
      renderRoomPanel(); draw();
    }
  };
}
// Punto de llegada automático en la sala 'to' para el punto l de la sala 'from': donde le
// toca según el mapa del mundo. Si l está en un borde, se busca un hueco en el borde opuesto
// de la otra sala (el más cercano a la misma altura o columna); si no, el hueco 1×2 libre
// más cercano a ese sitio. Devuelve { x, y, w, h } o null.
function arrivalSpot(from, l, to) {
  arrivalSpot.noHole = null;
  const a = S.rooms[from], d = S.rooms[to];
  const W = d.grid[0].length, H = d.grid.length, Wa = a.grid[0].length, Ha = a.grid.length;
  const ox = (r) => (r.map?.[0] ?? 0) * CELL[0], oy = (r) => (r.map?.[1] ?? 0) * CELL[1];
  const tx = Math.max(0, Math.min(W - 1, Math.round(ox(a) + l.x + (l.w ?? 1) / 2 - ox(d)))), ty = Math.max(0, Math.min(H - 1, Math.round(oy(a) + l.y + (l.h ?? PH) / 2 - oy(d))));
  const side = l.y === 0 ? 'top' : l.y + (l.h ?? PH) >= Ha ? 'bottom' : l.x === 0 ? 'left' : l.x + (l.w ?? 1) >= Wa ? 'right' : null;
  const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side];
  let best = null, bd = Infinity;
  const tryRect = (q, cx, cy) => { if (!q || !rectOk(d, q)) return; const dd = Math.hypot(cx - tx, cy - ty); if (dd < bd) { bd = dd; best = q; } };
  if (opp) {
    // Hueco en el borde opuesto (pointRect ya coge el hueco entero).
    const cells = opp === 'top' ? [...Array(W).keys()].map((x) => [x, 0]) : opp === 'bottom' ? [...Array(W).keys()].map((x) => [x, H - 1])
      : opp === 'left' ? [...Array(H).keys()].map((y) => [0, y]) : [...Array(H).keys()].map((y) => [W - 1, y]);
    for (const [x, y] of cells) { const q = pointRect(d, x, y); if (q.w > 1 || q.h > 1 || opp === 'left' || opp === 'right') tryRect(q, x, y); }
    if (best) return best;
    arrivalSpot.noHole = opp;              // no había hueco en ese borde: irá dentro (portal)
  }
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) tryRect({ x, y, w: PW, h: PH }, x, y + 1);
  return best;
}
// Borra un punto; los que llevaban a él se quedan sin destino (no se rompe nada).
function deleteLink(roomId, i) {
  const r = S.rooms[roomId], l = r.links[i];
  if (!confirm(`¿Borrar el punto ${l.id}${l.to ? ` (lleva a ${l.to})` : ''}?`)) return;
  snapshot();
  r.links.splice(i, 1);
  if (!r.links.length) delete r.links;
  for (const [id, o] of Object.entries(S.rooms)) {
    for (const k of o.links ?? []) if (k.to === roomId && k.toLink === l.id) { k.to = ''; k.toLink = ''; S.dirty.add(id); }
    for (const ex of o.exits ?? []) if (ex.to === roomId && ex.toLink === l.id) { delete ex.toLink; S.dirty.add(id); }
  }
  S.sel = null;
  touch(); renderRoomPanel(); renderInspector(); drawMap();
  $('msg').textContent = `Punto ${l.id} borrado.`;
}
// Selecciona un punto y centra la vista en él.
function viewLink(l) {
  const i = (room().links ?? []).indexOf(l);
  if (i < 0) return;
  S.sel = { kind: 'links', index: i };
  S.pan = { x: cv.width / 2 - (l.x + 0.5) * S.zoom, y: cv.height / 2 - (l.y + 1) * S.zoom };
  renderInspector(); renderRoomPanel(); draw();
}
// Recíproco: el punto de destino apunta de vuelta (o deja de hacerlo).
function makeReciprocal(roomId, l, on) {
  const t = l && linkOf(l.to, l.toLink);
  if (!t) return;
  snapshot();
  if (on) { t.to = roomId; t.toLink = l.id; } else if (t.to === roomId && t.toLink === l.id) { t.to = ''; t.toLink = ''; }
  S.dirty.add(l.to); S.dirty.add(roomId);
  touch(); renderRoomPanel(); renderInspector();
}
// Clic en el lienzo durante el asistente: pone el punto (si el sitio vale).
// El punto que se pondría al hacer clic en (x, y): en un hueco del borde, el hueco entero
// (un solo paso aunque sea grande); en otro sitio, el hueco del personaje (1×2).
function pointRect(r, x, y) {
  const Wd = r.grid[0].length, Hd = r.grid.length, open = (c) => c !== undefined && passOrOpen(c) && !TILE_BY_CHAR[c]?.slope && !TILE_BY_CHAR[c]?.ceil;
  if ((x === 0 || x === Wd - 1) && open(r.grid[y]?.[x])) {
    let a = y, b = y;
    while (a > 0 && open(r.grid[a - 1][x])) a--;
    while (b < Hd - 1 && open(r.grid[b + 1][x])) b++;
    if (b - a + 1 >= PH) return { x, y: a, w: 1, h: b - a + 1 };
  }
  if ((y === 0 || y === Hd - 1) && open(r.grid[y]?.[x])) {
    let a = x, b = x;
    while (a > 0 && open(r.grid[y][a - 1])) a--;
    while (b < Wd - 1 && open(r.grid[y][b + 1])) b++;
    const yy = y === 0 ? 0 : Hd - 2;
    const two = [...Array(b - a + 1)].every((_, i) => open(r.grid[y === 0 ? 1 : Hd - 2]?.[a + i]));
    return { x: a, y: two ? yy : y, w: b - a + 1, h: two ? 2 : 1 };
  }
  return { x, y: y - (PH - 1), w: PW, h: PH };
}
// Rectángulo de un arrastre (mínimo, el del personaje: si es más bajo, crece hacia arriba).
function dragRect(a, b) {
  const x = Math.min(a[0], b[0]), w = Math.abs(a[0] - b[0]) + 1;
  let y = Math.min(a[1], b[1]), h = Math.abs(a[1] - b[1]) + 1;
  if (h < PH) { y -= PH - h; h = PH; }
  return { x, y, w, h };
}
// ¿Vale ese sitio para un punto? Dentro de la sala y todo hueco (sin muro ni rampa); en
// un hueco de borde de 1 fila (techo o suelo) basta con esa fila.
const rectOk = (r, q) => spotOk(r, q.x, q.y, q.w, q.h);
function linkingClick(x, y, rect = null) {
  const L = S.linking, r = room(), q = rect ?? pointRect(r, x, y);
  if (!rectOk(r, q)) { $('msg').textContent = 'Ahí no cabe: el punto necesita al menos el hueco del personaje (1×2), sin roca (las membranas que se abren valen) y dentro de la sala.'; return true; }
  const top = q.y;
  if (L.stage === 'place') {
    snapshot();
    const id = newLinkId(r);
    (r.links ??= []).push({ id, x: q.x, y: top, w: q.w, h: q.h, to: '', toLink: '', trigger: atEdge(r, q.x, top, q.w, q.h) ? 'touch' : 'use', look: atEdge(r, q.x, top, q.w, q.h) ? 'hidden' : 'portal' });
    S.sel = { kind: 'links', index: r.links.length - 1 };
    S.linking = { stage: 'dest', room: S.id, link: id };
    touch(); renderRoomPanel(); renderInspector();
    $('msg').textContent = `Punto ${id} creado. Elige adónde lleva en el panel de la sala.`;
    return true;
  }
  if (L.stage === 'placeDest') {
    snapshot();
    const id = newLinkId(r);
    (r.links ??= []).push({ id, x: q.x, y: top, w: q.w, h: q.h, to: '', toLink: '', trigger: atEdge(r, q.x, top, q.w, q.h) ? 'touch' : 'use', look: atEdge(r, q.x, top, q.w, q.h) ? 'hidden' : 'portal' });
    const from = linkOf(L.from.room, L.from.link);
    from.to = S.id; from.toLink = id;
    S.dirty.add(L.from.room);
    const nl = r.links.at(-1); nl.to = L.from.room; nl.toLink = L.from.link;
    S.linking = null;
    touch(); renderRoomPanel(); drawMap();
    $('msg').textContent = `Conectado: ${L.from.room} · ${L.from.link} ⇄ ${S.id} · ${id} (ida y vuelta).`;
    return true;
  }
  return false;
}
function drawLinking(z, r) {
  const L = S.linking;
  if (!L || !['place', 'placeDest'].includes(L.stage) || L.room !== S.id || !S.hover) return;
  const [x, y] = S.hover, q = S.linkDrag ? dragRect(S.linkDrag.from, S.hover) : pointRect(r, x, y), ok = rectOk(r, q);
  g.fillStyle = ok ? 'rgba(64,224,255,0.3)' : 'rgba(255,60,80,0.3)'; g.fillRect(q.x * z, q.y * z, q.w * z, q.h * z);
  g.strokeStyle = ok ? '#40e0ff' : '#ff3c50'; g.lineWidth = 2; g.strokeRect(q.x * z + 1, q.y * z + 1, q.w * z - 2, q.h * z - 2);
  g.fillStyle = ok ? '#40e0ff' : '#ff8a96'; g.font = 'bold 12px monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom';
  g.fillText(ok ? `${L.stage === 'place' ? 'punto de conexión' : 'llegada'} ${q.w}×${q.h}` : 'no cabe aquí', (q.x + q.w) * z + 4, q.y * z);
}

function renderRoomPanel() {
  const r = room(), box = $('room');
  if (!r) { box.innerHTML = ''; return; }
  const cells = [Math.ceil(W() / CELL[0]), Math.ceil(H() / CELL[1])];
  let html = `<h3>${S.id} <span class="dim">${W()}x${H()} tiles · ${cells[0]}x${cells[1]} celdas · ≈ ${((W() / SCREEN[0]) * (H() / SCREEN[1])).toFixed(1)} pantallas</span></h3>`;
  html += field('identificador (cambia también las salidas que llevan aquí)', S.id, (v) => renameRoom(S.id, v));
  html += field('nombre', r.name, (v) => { r.name = v; renderRoomList(); });
  html += field('bioma', { v: r.biome, options: Object.keys(BIOMES) }, (v) => { r.biome = v; renderPalette(); drawMap(); }, 'select');
  const bgs = BACKDROP_VARIANTS[r.biome];
  if (bgs?.length > 1) html += field('fondo', { v: bgs[(r.backdrop ?? 1) - 1] ?? bgs[0], options: bgs }, (v) => { const n = bgs.indexOf(v) + 1; if (n > 1) r.backdrop = n; else delete r.backdrop; }, 'select');
  html += field('secreta', !!r.secret, (v) => { if (v) r.secret = true; else delete r.secret; });
  html += field('mapa [x, y, ancho, alto] (celdas)', r.map ?? [0, 0, cells[0], cells[1]], (v) => { r.map = v; drawMap(); });
  html += `<div class="row"><button id="mvroom" class="${S.roomMove ? 'on' : ''}" title="Arrastra en el lienzo para cambiar dónde está la sala respecto a las demás (por celdas)">${S.roomMove ? 'Moviendo: arrastra (Esc termina)' : 'Mover sala'}</button><button id="fitmap" title="Ancho y alto del mapa según el tamaño de la sala">Ajustar mapa al tamaño</button></div>`;
  html += `<h4>Ampliar / recortar</h4><div class="grid4">${['top', 'bottom', 'left', 'right'].map((s) => `<span>${{ top: 'arriba', bottom: 'abajo', left: 'izquierda', right: 'derecha' }[s]}</span><button data-rs="${s}" data-n="-1">−1</button><button data-rs="${s}" data-n="1">+1</button><button data-rs="${s}" data-n="${s === 'top' || s === 'bottom' ? CELL[1] : CELL[0]}">+celda</button>`).join('')}</div>`;
  // Útero de la sala: cuántas curas guarda (se regeneran con el tiempo) y cuánto cura cada una.
  if (r.grid.some((row) => row.includes('N'))) {
    const w = r.womb ?? {}, setW = (k, v, def) => {
      const o = { ...(r.womb ?? {}) };
      if (!(v > 0) || v === def) delete o[k]; else o[k] = Math.round(v);
      if (Object.keys(o).length) r.womb = o; else delete r.womb;
    };
    html += `<h4>Útero</h4>`;
    const base = baseNode(S.id), sells = w.sells ?? {};
    // Guarda un ajuste de womb (y lo quita si vuelve a lo de por defecto).
    const setWomb = (fn) => { const o = { ...(r.womb ?? {}) }; fn(o); if (o.sells && !Object.keys(o.sells).length) delete o.sells; if (Object.keys(o).length) r.womb = o; else delete r.womb; };
    html += field(`nombre (por defecto «${base.name}»)`, w.name ?? base.name, (v) => setWomb((o) => { if (!v.trim() || v.trim() === base.name) delete o.name; else o.name = v.trim(); }));
    html += field(`curas máximas (por defecto ${NODE_DOSES})`, w.doses ?? NODE_DOSES, (v) => setW('doses', v, NODE_DOSES));
    html += field(`integridad por cura (por defecto ${NODE_HEAL})`, w.cure ?? NODE_HEAL, (v) => setW('cure', v, NODE_HEAL));
    html += `<p class="dim" style="margin:6px 0 2px">Qué vende (sanar y mutar están siempre):</p>`;
    const SELL = [
      ['cells', 'Células lumínicas', true],
      ['suppressor', 'Supresor de rechazo', !!base.suppressor],
      ['extender', 'Extensor de tolerancia', true],
      ['shield', 'Perla de Nácar', true],
      ['regen', 'Célula Madre', true],
      ['plasma', 'Coágulo de plasma (cuajar)', true],
    ];
    for (const [k, label, def] of SELL) html += field(label, sells[k] ?? def, (v) => setWomb((o) => { o.sells = { ...(o.sells ?? {}) }; if (v === def) delete o.sells[k]; else o.sells[k] = v; }));
    const tradeNow = sells.trade !== undefined ? sells.trade : base.trade ? (base.trade.get.bio ? 'carne' : 'hueso') : '';
    const TR = { '': 'ninguno', carne: 'digerir hueso (da carne)', hueso: 'calcificar carne (da hueso)' };
    const tradeDef = base.trade ? (base.trade.get.bio ? 'carne' : 'hueso') : '';
    html += field('trueque', { v: TR[tradeNow], options: Object.values(TR) }, (v) => setWomb((o) => {
      const k = Object.keys(TR).find((key) => TR[key] === v) ?? '';
      o.sells = { ...(o.sells ?? {}) };
      if (k === tradeDef) delete o.sells.trade; else o.sells.trade = k;
    }), 'select');
  }
  html += connectionsHtml(r);
  html += `<div class="row"><button id="setstart">Inicio del juego aquí (punto de prueba)</button></div>`;
  box.innerHTML = html;
  $('mvroom').onclick = () => { S.roomMove = !S.roomMove; $('msg').textContent = S.roomMove ? 'Mover sala: arrastra en el lienzo; la sala se mueve por celdas (en rojo si pisaría otra). Esc o el botón para terminar.' : ''; renderRoomPanel(); draw(); };
  $('fitmap').onclick = () => { snapshot(); r.map = [r.map?.[0] ?? 0, r.map?.[1] ?? 0, cells[0], cells[1]]; touch(); renderRoomPanel(); drawMap(); };
  for (const b of box.querySelectorAll('[data-rs]')) b.onclick = () => resize(b.dataset.rs, Number(b.dataset.n));
  wireConnections(r);

  for (const b of box.querySelectorAll('[data-ex]')) b.onclick = () => { S.sel = { kind: 'exits', index: Number(b.dataset.ex) }; renderInspector(); renderRoomPanel(); draw(); };
  $('setstart').onclick = () => {
    if (!S.testSpawn) { alert('Marca antes un punto con Alt+clic.'); return; }
    S.start = { room: S.id, spawn: [...S.testSpawn] };
    S.dirty.add('__start');
    draw(); refreshRoomList();
  };
}

// ---------------------------------------------------------------- lista de salas y mapa
function renderRoomList() {
  const groups = {};
  for (const [id, r] of Object.entries(S.rooms)) (groups[r.biome] ??= []).push(id);
  $('rooms').innerHTML = Object.entries(groups).map(([b, ids]) => `<h4 style="color:${BIOMES[b]?.mapColor ?? '#ccc'}">${BIOMES[b]?.name ?? b}</h4>` +
    ids.map((id) => `<button class="rm${id === S.id ? ' on' : ''}" data-id="${id}">${S.dirty.has(id) ? '● ' : ''}${id} · ${S.rooms[id].name}${S.rooms[id].secret ? ' ·s' : ''}</button>`).join('')).join('');
  for (const b of document.querySelectorAll('#rooms .rm')) b.onclick = () => openRoom(b.dataset.id);
}
const refreshRoomList = () => renderRoomList();

const mv = $('map'), mg = mv.getContext('2d');
// Mapa del mundo como plano de obra: las salas, un margen de celdas libres alrededor
// (S.mapPad, con la rueda o −/+), la cuadrícula de celdas, los huecos de borde que aún
// no llevan a ninguna sala (en amarillo: por ahí se sigue construyendo) y, si se pide,
// el mapa original de fondo como calco. Clic en una sala la abre; en una celda vacía la
// elige para la próxima "Nueva sala".
S.mapPad ??= 3;
let GHOST = null;                        // salas del mapa original (calco)
import('../data/worlds/original.js').then((m) => { GHOST = m.LEVELS; drawMap(); }).catch(() => {});
// Huecos del borde de una sala sin salida definida: [{ side, cell: [cx, cy] }] en celdas del mapa.
function drawMap() {
  const rects = Object.entries(S.rooms).filter(([, r]) => r.map).map(([id, r]) => [id, ...r.map]);
  const ghost = $('map-ghost')?.checked && GHOST ? Object.entries(GHOST).filter(([, r]) => r.map).map(([id, r]) => [id, ...r.map]) : [];
  const all = rects.concat(ghost);
  if (!all.length) return;
  const P = S.mapPad;
  const minX = Math.min(...all.map((r) => r[1])) - P, minY = Math.min(...all.map((r) => r[2])) - P;
  const maxX = Math.max(...all.map((r) => r[1] + r[3])) + P, maxY = Math.max(...all.map((r) => r[2] + r[4])) + P;
  const k = Math.min(mv.width / (maxX - minX), mv.height / (maxY - minY));
  const ox = (mv.width - (maxX - minX) * k) / 2, oy = (mv.height - (maxY - minY) * k) / 2;
  const X = (x) => ox + (x - minX) * k, Y = (y) => oy + (y - minY) * k;
  mg.fillStyle = '#0a0709'; mg.fillRect(0, 0, mv.width, mv.height);
  S.mapXform = { minX, minY, k, ox, oy };
  // Cuadrícula de celdas (y los ejes 0,0 un poco más marcados).
  mg.lineWidth = 1;
  for (let x = Math.ceil(minX); x <= maxX; x++) { mg.strokeStyle = x === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'; mg.beginPath(); mg.moveTo(Math.round(X(x)) + 0.5, 0); mg.lineTo(Math.round(X(x)) + 0.5, mv.height); mg.stroke(); }
  for (let y = Math.ceil(minY); y <= maxY; y++) { mg.strokeStyle = y === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'; mg.beginPath(); mg.moveTo(0, Math.round(Y(y)) + 0.5); mg.lineTo(mv.width, Math.round(Y(y)) + 0.5); mg.stroke(); }
  // Calco del original: contornos grises con su nombre.
  for (const [id, x, y, w, h] of ghost) {
    mg.strokeStyle = 'rgba(200,190,200,0.35)'; mg.setLineDash([2, 2]);
    mg.strokeRect(X(x) + 1.5, Y(y) + 1.5, w * k - 3, h * k - 3);
    mg.setLineDash([]);
    if (k > 9) { mg.fillStyle = 'rgba(200,190,200,0.45)'; mg.font = '8px monospace'; mg.fillText(id, X(x) + 3, Y(y) + 9); }
  }
  // Celda elegida para la próxima sala.
  if (S.newCell) { mg.strokeStyle = '#3aff8a'; mg.lineWidth = 2; mg.strokeRect(X(S.newCell[0]) + 1, Y(S.newCell[1]) + 1, k - 2, k - 2); mg.lineWidth = 1; }
  for (const [id, x, y, w, h] of rects) {
    const r = S.rooms[id];
    mg.fillStyle = (BIOMES[r.biome]?.mapColor ?? '#888') + (id === S.id ? 'ff' : '88');
    mg.fillRect(X(x) + 1, Y(y) + 1, w * k - 2, h * k - 2);
    if (k > 9) { mg.fillStyle = '#000'; mg.font = '9px monospace'; mg.fillText(id, X(x) + 3, Y(y) + 10); }
  }
  // Conexiones: una línea de cada punto a su punto de destino (donde están de verdad en
  // la sala) y un puntito en cada uno; sin punto de destino, al centro de la otra sala.
  const ctr = (o) => [X(o.map[0] + o.map[2] / 2), Y(o.map[1] + o.map[3] / 2)];
  const at = (o, l) => [X(o.map[0] + ((l.x + (l.w ?? 1) / 2) / o.grid[0].length) * o.map[2]), Y(o.map[1] + ((l.y + (l.h ?? 2) / 2) / o.grid.length) * o.map[3])];
  mg.lineWidth = 1.5;
  for (const [, r] of Object.entries(S.rooms)) {
    if (!r.map) continue;
    for (const l of r.links ?? []) {
      const a = at(r, l), o = S.rooms[l.to];
      mg.fillStyle = l.to && o ? '#40e0ff' : '#ff8a96';
      mg.fillRect(a[0] - 1.5, a[1] - 1.5, 3, 3);
      if (!o?.map || o === r) continue;
      const tl = (o.links ?? []).find((m) => m.id === l.toLink), b = tl ? at(o, tl) : ctr(o);
      mg.strokeStyle = 'rgba(64,224,255,0.7)';
      mg.beginPath(); mg.moveTo(a[0], a[1]); mg.lineTo(b[0], b[1]); mg.stroke();
    }
    for (const e of r.exits ?? []) {
      const o = S.rooms[e.to];
      if (!o?.map || o === r) continue;
      const [ax, ay] = ctr(r), [bx, by] = ctr(o);
      mg.strokeStyle = 'rgba(64,224,255,0.7)';
      mg.beginPath(); mg.moveTo(ax, ay); mg.lineTo(bx, by); mg.stroke();
    }
  }
}
const mapCell = (e) => {
  const t = S.mapXform; if (!t) return null;
  const rc = mv.getBoundingClientRect();
  const sx = mv.width / rc.width, sy = mv.height / rc.height;
  const fx = ((e.clientX - rc.left) * sx - t.ox) / t.k + t.minX, fy = ((e.clientY - rc.top) * sy - t.oy) / t.k + t.minY;
  // [celda x, celda y, punto exacto x, punto exacto y] (las salas pueden estar en posiciones no enteras).
  return [Math.floor(fx), Math.floor(fy), fx, fy];
};
// Sala bajo el punto pinchado: el exacto si lo hay (una sala en x = 1.001 no ocupa la celda 1 entera).
const roomAtCell = ([mx, my, fx = mx + 0.5, fy = my + 0.5]) => Object.entries(S.rooms).find(([, r]) => r.map && fx >= r.map[0] && fy >= r.map[1] && fx < r.map[0] + r.map[2] && fy < r.map[1] + r.map[3]);
// Arrastrar una sala en el mapa del mundo la cambia de sitio (por celdas).
mv.onmousedown = (e) => {
  const c = mapCell(e); if (!c) return;
  const hit = roomAtCell(c);
  if (!hit) return;
  S.mapDrag = { id: hit[0], from: c, map0: [...hit[1].map], moved: false };
};
addEventListener('mousemove', (e) => {
  const d = S.mapDrag; if (!d) return;
  const c = mapCell(e); if (!c) return;
  const dx = c[0] - d.from[0], dy = c[1] - d.from[1];
  if (!dx && !dy && !d.moved) return;
  if (!d.moved) snapshotRoom(d.id);
  d.moved = true;
  const r = S.rooms[d.id], nx = d.map0[0] + dx, ny = d.map0[1] + dy;
  if (mapFree(d.id, nx, ny)) { r.map[0] = nx; r.map[1] = ny; }
  drawMap(); draw();
});
addEventListener('mouseup', () => {
  const d = S.mapDrag; S.mapDrag = null;
  if (!d?.moved) return;
  S.dirty.add(d.id); S.justDragged = true; CTX_CACHE.delete(d.id);
  renderRoomPanel(); refreshRoomList(); draw();
  $('msg').textContent = `Sala ${d.id} movida a [${S.rooms[d.id].map[0]}, ${S.rooms[d.id].map[1]}].`;
});
mv.onclick = (e) => {
  if (S.justDragged) { S.justDragged = false; return; }
  const c = mapCell(e); if (!c) return;
  const hit = roomAtCell(c);
  if (hit) { S.newCell = null; openRoom(hit[0]); return; }
  S.newCell = c;
  $('map-info').textContent = `Celda ${c[0]}, ${c[1]} elegida: "Nueva sala" la pondrá ahí.`;
  drawMap();
};
mv.onmousemove = (e) => {
  const c = mapCell(e); if (!c) return;
  const hit = roomAtCell(c);
  const ghost = GHOST && $('map-ghost')?.checked ? Object.entries(GHOST).find(([, r]) => r.map && c[0] >= r.map[0] && c[1] >= r.map[1] && c[0] < r.map[0] + r.map[2] && c[1] < r.map[1] + r.map[3]) : null;
  $('map-info').textContent = `celda ${c[0]}, ${c[1]} · ${hit ? `${hit[0]} · ${hit[1].name}` : 'libre'}${ghost ? ` · en el original: ${ghost[0]} ${ghost[1].name}` : ''}`;
};
mv.onwheel = (e) => { e.preventDefault(); S.mapPad = Math.max(1, Math.min(30, S.mapPad + (e.deltaY > 0 ? 2 : -2))); drawMap(); };
$('map-out').onclick = () => { S.mapPad = Math.min(30, S.mapPad + 3); drawMap(); };
$('map-in').onclick = () => { S.mapPad = Math.max(1, S.mapPad - 3); drawMap(); };
// ⤢: el mapa en grande, flotando sobre la zona de dibujo (el lienzo se ajusta a su tamaño en pantalla).
function mapBig(on) {
  mv.classList.toggle('big', on);
  const rc = mv.getBoundingClientRect();
  mv.width = on ? Math.round(rc.width) : 214; mv.height = on ? Math.round(rc.height) : 150;
  drawMap();
}
$('map-big').onclick = () => mapBig(!mv.classList.contains('big'));
addEventListener('keydown', (e) => { if (e.code === 'Escape' && mv.classList.contains('big')) mapBig(false); });
$('map-ghost').onchange = drawMap;

function openRoom(id, keep = null) {
  S.id = id;
  S.sel = null; S.reach = null; S.reachStart = null; S.testSpawn = S.testSpawns[id] ?? null;
  S.pan = keep?.pan ?? { x: 20, y: 20 };
  const c = cv.getBoundingClientRect();
  S.zoom = keep?.zoom ?? Math.max(4, Math.min(28, Math.floor(Math.min((c.width - 40) / W(), (c.height - 40) / H()))));
  renderRoomList(); renderRoomPanel(); renderInspector(); renderPalette(); drawMap(); draw();
}

// ---------------------------------------------------------------- alcance y validación
function computeReach() {
  if (!S.reachStart) { $('msg').textContent = 'Mayús+clic en un suelo para marcar desde dónde comprobar el alcance.'; return; }
  const open = S.reachOpen ? ['X', 'f', 'Y', 'K', 'z', 'D'] : [];
  const res = reach(S.id, S.reachStart, { grid: room().grid, doubleJump: S.reachDouble, open });
  S.reach = res;
  $('msg').textContent = `Alcance desde ${S.reachStart}: ${res.standing.size} apoyos · salidas: ${[...res.exits].join(', ') || 'ninguna'}${S.reachDouble ? ' (con doble salto)' : ''}`;
  draw();
}
function validate() {
  const out = [];
  const add = (room, msg, fix) => out.push([room, msg, fix]);
  for (const [id, r] of Object.entries(S.rooms)) {
    const w = r.grid[0].length;
    r.grid.forEach((row, y) => { if (row.length !== w) add(id, `fila ${y} mide ${row.length} (se esperaba ${w})`); });
    const cell = (rid, x, y) => S.rooms[rid]?.grid[y]?.[x];
    for (const e of r.enemies ?? []) if (!ENEMIES[e.type]) add(id, `enemigo desconocido ${e.type}`); else if (SOLID.has(cell(id, e.x, e.y))) add(id, `enemigo ${e.type} dentro de la roca en [${e.x},${e.y}]`);
    for (const [x, y] of r.nodules ?? []) if (SOLID.has(cell(id, x, y)) || !SOLID.has(cell(id, x, y + 1))) add(id, `nódulo en [${x},${y}] sin hueco o sin suelo`);
    for (const ex of r.exits ?? []) {
      if (!S.rooms[ex.to]) { add(id, `salida hacia sala inexistente ${ex.to}`); continue; }
      const [x, y] = ex.spawn;
      if (SOLID.has(cell(ex.to, x, y)) || SOLID.has(cell(ex.to, x, y - 1))) add(id, `la llegada a ${ex.to} [${x},${y}] está dentro de la roca`);
      else if (!SOLID.has(cell(ex.to, x, y + 1)) && !TILE_BY_CHAR[cell(ex.to, x, y + 1)]?.slope && !TILE_BY_CHAR[cell(ex.to, x, y)]?.slope) add(id, `la llegada a ${ex.to} [${x},${y}] no tiene suelo`);
      if (!(S.rooms[ex.to].exits ?? []).some((b) => b.to === id)) add(id, `${ex.to} no tiene salida de vuelta a ${id}`);
    }
    const gates = new Set((r.gates ?? []).map((q) => q.id));
    for (const p of r.pads ?? []) if (!gates.has(p.opens)) add(id, `ganglio que abre una compuerta inexistente (${p.opens})`);
    if (r.pods && !gates.has(r.pods.opens)) add(id, `sacos en orden que abren una compuerta inexistente (${r.pods.opens})`);
    for (const v of [...(r.valves ?? []).filter((q) => q.pool !== undefined), ...(r.floats ?? [])]) if (!r.fluids?.[v.pool]) add(id, `válvula o balsa ligada a la cubeta ${v.pool}, que no existe`);
    for (const v of [...(r.spouts ?? []), ...(r.sinks ?? [])]) if (v.pool !== undefined && !r.fluids?.[v.pool]) add(id, `surtidor o sumidero ligado a la cubeta ${v.pool}, que no existe`);
    for (const v of r.spouts ?? []) if (v.valve !== undefined && !r.valves?.[v.valve]) add(id, `surtidor ligado a la válvula ${v.valve}, que no existe`);
    for (const v of r.valves ?? []) if (v.action === 'swap' && !r.fluids?.[v.pool2]) add(id, `válvula de trasvase sin segunda cubeta (pool2)`);
    // Elementos fuera de la sala (p. ej. tras recortarla): pulsando el aviso se meten dentro.
    const Wd = r.grid[0].length, Hd = r.grid.length;
    for (const kind of Object.keys(KINDS)) {
      if (kind === 'exits' || kind === 'links' || kind === 'pods') continue;
      for (const o of r[kind] ?? []) {
        const [bx, by, bw, bh] = KINDS[kind].box(o, r);
        if (bx + bw <= 0 || by + bh <= 0 || bx >= Wd || by >= Hd) add(id, `${KINDS[kind].label} fuera de la sala en [${bx},${by}]: pulsa para meterlo dentro`, () => clampInside(r, kind, o));
      }
    }
  }
  for (const [id, r] of Object.entries(S.rooms)) {
    for (const l of r.links ?? []) {
      if (!l.to && !arrivals(id, l)) add(id, `el punto ${l.id} no lleva a ningún sitio (sin destino): elige su destino en Conexiones o bórralo`);
      const outside = l.x < 0 || l.y < 0 || l.x + (l.w ?? 1) > r.grid[0].length || l.y + (l.h ?? 2) > r.grid.length;
      if (outside) add(id, `el punto ${l.id} está fuera de la sala en [${l.x},${l.y}]: pulsa para meterlo dentro (luego muévelo o bórralo)`, () => clampInside(r, 'links', l));
      else if (!spotUsable(r, l)) add(id, `el punto ${l.id} está tapado por muro en [${l.x},${l.y}]: muévelo o bórralo`);
      if (l.to && !S.rooms[l.to]) add(id, `el punto ${l.id} lleva a una sala que no existe (${l.to})`);
      else if (l.to && l.toLink && !(S.rooms[l.to].links ?? []).some((k) => k.id === l.toLink)) add(id, `el punto ${l.id} lleva a ${l.to}·${l.toLink}, que no existe`);
    }
    for (const ex of r.exits ?? []) if (ex.toLink && !(S.rooms[ex.to]?.links ?? []).some((k) => k.id === ex.toLink)) add(id, `la salida ${ex.side} llega a ${ex.to}·${ex.toLink}, que no existe`);
  }
  if (!S.rooms[S.start.room]) add('INICIO', 'la sala de inicio no existe');
  $('problems').innerHTML = out.length ? out.map(([rid, m], i) => `<button class="pb" data-id="${rid}" data-i="${i}">${rid}: ${m}</button>`).join('') : '<p class="ok">Sin problemas.</p>';
  for (const b of document.querySelectorAll('#problems .pb')) b.onclick = () => {
    const [rid, , fix] = out[Number(b.dataset.i)];
    if (!S.rooms[rid]) return;
    if (rid !== S.id) openRoom(rid);
    // Arreglo directo (meter dentro lo que está fuera): se aplica y se vuelve a validar.
    if (fix) { snapshot(); if (fix()) { S.dirty.add(rid); CTX_CACHE.delete(rid); touch(); draw(); } validate(); }
  };
  return out.length;
}

// ---------------------------------------------------------------- probar y guardar
// El archivo de cada mapa elegido se recuerda entre sesiones (IndexedDB guarda el
// identificador del archivo, no su contenido).
function handleStore(mode, fn) {
  return new Promise((resolve) => {
    const req = indexedDB.open('linfa-editor', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const tx = req.result.transaction('handles', mode), st = tx.objectStore('handles');
      const r = fn(st);
      tx.oncomplete = () => resolve(r?.result ?? null);
      tx.onerror = () => resolve(null);
    };
  });
}
// Cada mundo recuerda su propio archivo (src/data/worlds/<id>.js).
const HANDLE_KEY = `world:${WORLD_ID}`;
const WORLD_FILE = `${WORLD_ID}.js`;
const loadHandle = () => handleStore('readonly', (st) => st.get(HANDLE_KEY)).catch(() => null);
const saveHandle = (h) => handleStore('readwrite', (st) => st.put(h, HANDLE_KEY)).catch(() => null);
// ¿Es este texto el archivo del mundo que se está editando? (nunca el selector levels.js)
const isWorldFile = (text) => text.includes(`export const WORLD = '${WORLD_ID}'`) && text.includes('export const LEVELS');

function test() {
  const changed = {};
  for (const id of S.dirty) if (S.rooms[id]) changed[id] = S.rooms[id];
  localStorage.setItem('linfa.editor', JSON.stringify({ rooms: S.rooms, start: S.start }));
  const sp = S.testSpawn ?? (S.start.room === S.id ? S.start.spawn : null) ?? linkSpawn() ?? findFloor();
  open(`index.html?editor&room=${encodeURIComponent(S.id)}&spawn=${sp.join(',')}&steps=2`, 'linfa-prueba');
}
// Punto de prueba de la sala: se guarda por sala (y entre sesiones). Avisa si ahí no cabe.
function setTestSpawn(x, y) {
  if (x < 0 || y < 1 || x >= W() || y >= H()) { $('msg').textContent = 'Fuera de la sala: no se ha marcado.'; return; }
  S.testSpawn = [x, y];
  S.testSpawns[S.id] = [x, y];
  try { localStorage.setItem('linfa.editor.spawns', JSON.stringify(S.testSpawns)); } catch { /* sin almacenamiento */ }
  const solid = (c) => SOLID.has(c) || TILE_BY_CHAR[c]?.slope;
  const ok = !solid(getTile(x, y)) && !solid(getTile(x, y - 1));
  $('msg').textContent = ok ? `Probar ▶ empezará en [${x},${y}].` : `Inicio en [${x},${y}], pero ahí hay pared: el personaje no cabe (2 casillas de alto).`;
  draw();
}
// Sin punto marcado: se entra por el primer punto de conexión (donde llegarías jugando).
function linkSpawn() {
  for (const l of room().links ?? []) {
    const [x, y] = l.arrive ?? [l.x + Math.floor((l.w ?? 1) / 2), l.y + (l.h ?? 2) - 1];
    if (x >= 0 && y >= 1 && x < W() && y < H() && !SOLID.has(getTile(x, y)) && !SOLID.has(getTile(x, y - 1))) return [x, y];
  }
  return null;
}
// Último recurso: el primer hueco con suelo, buscando de abajo arriba (lejos de techos y
// rendijas de arriba, que suelen ser huecos dentro del muro).
function findFloor() {
  for (let y = H() - 2; y >= 2; y--) for (let x = 1; x < W() - 1; x++) if (!SOLID.has(getTile(x, y)) && !SOLID.has(getTile(x, y - 1)) && SOLID.has(getTile(x, y + 1))) return [x, y];
  return [1, 1];
}
// Al abrir el editor se apunta su código y cómo estaba cada sala en el archivo. Al guardar
// se comprueba de nuevo: si el editor se actualizó o alguien (p. ej. Claude) cambió esas
// salas en el archivo, guardar desde esta pestaña desharía esos cambios: se avisa antes.
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const canon = (v) => JSON.stringify(sortKeys(v ?? null));
const CODE_FILES = ['src/editor/Editor.js', 'src/editor/schema.js', 'src/editor/serialize.js'];
const codeStamp = () => Promise.all(CODE_FILES.map((f) => fetch(f, { cache: 'no-store' }).then((r) => r.text()).catch(() => ''))).then((a) => a.join('\n'));
const BASE = { code: codeStamp(), rooms: Object.fromEntries(Object.entries(LEVELS).map(([id, r]) => [id, canon(r)])) };
async function staleWarning(ids) {
  const msgs = [];
  if ((await codeStamp()) !== (await BASE.code)) msgs.push('El editor se ha actualizado desde que abriste esta pestaña.');
  try {
    const disk = (await import(`../data/worlds/${WORLD_FILE}?t=${Date.now()}`)).LEVELS;
    const changedOnDisk = ids.filter((id) => disk[id] && BASE.rooms[id] && canon(disk[id]) !== BASE.rooms[id]);
    if (changedOnDisk.length) msgs.push(`Las salas ${changedOnDisk.join(', ')} han cambiado en el archivo desde que lo abriste; si guardas, esos cambios se pierden.`);
  } catch { /* sin servidor: no se puede comprobar */ }
  return msgs.length ? msgs.join('\n') + '\n\nRecarga la pestaña (F5) antes de guardar.\n¿Guardar igualmente?' : null;
}
async function save() {
  if (validate() && !confirm('Hay problemas en los datos (mira la lista). ¿Guardar igualmente?')) return;
  const changed = {};
  for (const id of S.dirty) if (S.rooms[id]) changed[id] = S.rooms[id];
  const stale = await staleWarning(Object.keys(changed));
  if (stale && !confirm(stale)) { $('msg').textContent = 'No se ha guardado: recarga la pestaña (F5) y vuelve a hacer los cambios.'; return; }
  const startChanged = S.dirty.has('__start') ? S.start : null;
  try {
    S.fileHandle ??= await loadHandle();
    // Con el archivo recordado solo hace falta (como mucho) confirmar el permiso.
    if (S.fileHandle && (await S.fileHandle.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
      if ((await S.fileHandle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') S.fileHandle = null;
    }
    if (!S.fileHandle && window.showOpenFilePicker) {
      // id: el selector se abre en la última carpeta usada.
      alert(`Elige el archivo del mapa «${WORLDS[WORLD_ID].name}»: src/data/worlds/${WORLD_FILE}`);
      [S.fileHandle] = await showOpenFilePicker({ id: 'linfa-world', types: [{ description: WORLD_FILE, accept: { 'text/javascript': ['.js'] } }] });
    }
    let text;
    if (S.fileHandle) text = await (await S.fileHandle.getFile()).text();
    else text = await (await fetch(`src/data/worlds/${WORLD_FILE}`, { cache: 'no-store' })).text();
    if (!isWorldFile(text)) {
      S.fileHandle = null;
      throw new Error(`ese archivo no es el del mapa «${WORLDS[WORLD_ID].name}». Elige src/data/worlds/${WORLD_FILE} (no levels.js).`);
    }
    if (S.fileHandle) saveHandle(S.fileHandle);
    const out = patchLevels(text, changed, [...S.removed], startChanged);
    if (S.fileHandle) {
      const w = await S.fileHandle.createWritable();
      await w.write(out); await w.close();
      $('msg').textContent = `Guardado en ${S.fileHandle.name}: ${Object.keys(changed).join(', ') || '(sin salas)'}${startChanged ? ' + inicio' : ''}.`;
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
      a.download = WORLD_FILE; a.click();
      $('msg').textContent = `Tu navegador no deja escribir archivos: se ha descargado ${WORLD_FILE}. Sustituye src/data/worlds/${WORLD_FILE} por él.`;
    }
    for (const [id, r] of Object.entries(changed)) BASE.rooms[id] = canon(r);
    S.dirty.clear(); S.removed.clear();
    renderRoomList();
  } catch (e) {
    if (e.name !== 'AbortError') alert('No se pudo guardar: ' + e.message);
  }
}
function newRoom() { startPlacing(); }
function deleteRoom() {
  if (!S.id || !confirm(`¿Eliminar la sala ${S.id}? (al guardar se quitará del mapa)`)) return;
  S.removed.add(S.id); S.dirty.delete(S.id);
  delete S.rooms[S.id];
  S.id = null;
  openRoom(Object.keys(S.rooms)[0]);
}
function duplicateRoom() {
  const id = prompt('Identificador de la copia:', S.id + 'b');
  if (!id || S.rooms[id]) return;
  S.rooms[id] = clone(room());
  S.rooms[id].exits = [];
  S.dirty.add(id);
  openRoom(id);
}

// Voltear una rampa (suelo ⇄ techo): la misma forma, reflejada en vertical.
const FLIP = { '/': 'J', J: '/', k: 'L', L: 'k', a: 'r', r: 'a', A: 'R', R: 'A', E: 'w', w: 'E', e: 'W', W: 'e' };
// Espejo (izquierda ⇄ derecha): la rampa sube o baja hacia el otro lado.
const MIRROR = { '/': 'k', k: '/', a: 'e', e: 'a', A: 'E', E: 'A', J: 'L', L: 'J', r: 'W', W: 'r', R: 'w', w: 'R' };

// ---------------------------------------------------------------- teclado
const isTyping = () => {
  const a = document.activeElement;
  if (!a) return false;
  if (a.tagName === 'TEXTAREA' || a.isContentEditable) return true;
  return a.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file'].includes(a.type);
};
addEventListener('keydown', (e) => {
  if (isTyping()) return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); undo(true); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); return; }
  if (e.ctrlKey || e.metaKey) {
    if (e.code === 'KeyC' && (S.area || S.sel)) { e.preventDefault(); areaCopy(); }
    if (e.code === 'KeyX' && (S.area || S.sel)) { e.preventDefault(); areaCut(); }
    if (e.code === 'KeyV' && S.clip && S.id) { e.preventDefault(); areaPaste(); }
    return;                                              // Ctrl + letra nunca cambia de herramienta
  }
  if (e.altKey) return;
  if (S.tool === 'area') {
    if ((e.code === 'Delete' || e.code === 'Backspace') && S.area && !S.float) { areaDelete(); return; }
    if (e.code === 'Escape') { if (S.clip?.cut) { S.clip = null; $('msg').textContent = 'Corte anulado.'; } S.area = null; S.float = null; draw(); renderInspector(); return; }
  }
  const t = e.code === 'KeyV' ? TOOLS.find(([id]) => id === 'area') : TOOLS.find(([, , k]) => `Key${k}` === e.code);   // V: el atajo de antes
  if (t) setTool(t[0]);
  if (e.code === 'Delete' || e.code === 'Backspace') deleteSelected();
  if (e.code === 'KeyT') {
    const so = S.sel?.kind === 'bellows' ? selected() : null;
    if (so) { snapshot(); bellowsPieceOf(so).ops[0].run(); touch(); renderInspector(); draw(); $('msg').textContent = `Bufador: ${BELLOWS_NAME[so.dir]} (T vuelve a voltear).`; return; }
    const pc = palettePiece(biomeColors(room()?.biome));
    if (pc) { pc.ops[0].run(); renderPalette(); draw(); $('msg').textContent = `${palettePiece(biomeColors(room()?.biome)).name}: volteada (T vuelve a voltear).`; return; }
  }
  if (e.code === 'KeyG') { S.view = S.view === 'game' ? 'schema' : 'game'; $('view').checked = S.view === 'game'; draw(); }
  if (e.code === 'BracketRight') { S.brush = Math.min(9, S.brush + 1); $('brush').value = S.brush; $('brush-v').textContent = S.brush; }
  if (e.code === 'BracketLeft') { S.brush = Math.max(1, S.brush - 1); $('brush').value = S.brush; $('brush-v').textContent = S.brush; }
});

// ---------------------------------------------------------------- arranque
$('save').onclick = save;
renderBestiary();
// Salas que crecieron sin que su tamaño en el mapa las siguiera (ampliadas con versiones
// anteriores del editor): el mapa crece hasta su tamaño real y quedan para guardar. Las
// que en el mapa son más grandes que la sala (redondeadas a celdas enteras) no se tocan.
{
  const q = (v) => Math.round(v * 1000) / 1000, grown = [];
  for (const [id, r] of Object.entries(S.rooms)) {
    if (!r.map || !r.grid?.length) continue;
    const w = q(r.grid[0].length / CELL[0]), h = q(r.grid.length / CELL[1]);
    if (w > r.map[2] + 1e-3 || h > r.map[3] + 1e-3) {
      r.map[2] = Math.max(r.map[2], w); r.map[3] = Math.max(r.map[3], h);
      S.dirty.add(id); grown.push(id);
    }
  }
  if (grown.length) setTimeout(() => { $('msg').textContent = `Tamaño en el mapa corregido (era más pequeño que la sala): ${grown.join(', ')}. Guarda para dejarlo así.`; refreshRoomList(); drawMap(); });
}
// Selector de mapa: cambia el mundo activo (el del juego también) y recarga.
$('world').innerHTML = Object.entries(WORLDS).map(([id, w]) => `<option value="${id}"${id === WORLD_ID ? ' selected' : ''}>${w.name}</option>`).join('');
$('world').onchange = (e) => {
  if (S.dirty.size && !confirm('Hay cambios sin guardar en este mapa. ¿Cambiar de mapa igualmente?')) { e.target.value = WORLD_ID; return; }
  setWorld(e.target.value);
  location.reload();
};
$('save').textContent = `Guardar en ${WORLD_FILE}`;
$('pickfile').onclick = async () => {
  if (!window.showOpenFilePicker) { alert(`Este navegador no permite elegir archivos para escribir: al guardar se descargará ${WORLD_FILE}.`); return; }
  try {
    [S.fileHandle] = await showOpenFilePicker({ id: 'linfa-world', types: [{ description: WORLD_FILE, accept: { 'text/javascript': ['.js'] } }] });
    if (!isWorldFile(await (await S.fileHandle.getFile()).text())) { S.fileHandle = null; alert(`Ese no es el archivo del mapa «${WORLDS[WORLD_ID].name}»: elige src/data/worlds/${WORLD_FILE}.`); return; }
    await saveHandle(S.fileHandle);
    $('msg').textContent = `Se guardará en ${S.fileHandle.name} (recordado para las próximas veces).`;
  } catch { /* cancelado */ }
};
loadHandle().then((h) => { if (h) { S.fileHandle = h; $('msg').textContent = `Archivo recordado: ${h.name}. Guardar escribe ahí directamente.`; } });
$('test').onclick = test;
$('test-spawn').onclick = () => {
  S.pickSpawn = !S.pickSpawn;
  $('test-spawn').classList.toggle('on', S.pickSpawn);
  $('msg').textContent = S.pickSpawn ? 'Haz clic en la sala donde quieras aparecer al probar.' : '';
};
$('validate').onclick = validate;
$('newroom').onclick = newRoom;
$('delroom').onclick = deleteRoom;
$('duproom').onclick = duplicateRoom;
$('view').onchange = () => { S.view = $('view').checked ? 'game' : 'schema'; draw(); };
$('reach').onclick = computeReach;
$('reach-clear').onclick = () => { S.reach = null; draw(); };
$('rdouble').onchange = () => { S.reachDouble = $('rdouble').checked; if (S.reach) computeReach(); };
$('ropen').onchange = () => { S.reachOpen = $('ropen').checked; if (S.reach) computeReach(); };
addEventListener('resize', fitCanvas);
addEventListener('beforeunload', (e) => { if (S.dirty.size) { e.preventDefault(); e.returnValue = ''; } });
renderTools();
renderPalette();
fitCanvas();
openRoom(S.start.room);
validate();

// Depuración desde la consola (y pruebas automáticas): el estado y algunas acciones.
window.__editor = { S, createRoomAt, openRoom, renderInspector, draw, linkingClick, deleteLink, liftArea, floatTo, dropFloat, areaCut, areaCopy, areaPaste, areaDelete, elementsIn };
