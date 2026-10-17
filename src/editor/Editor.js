// Editor de niveles de Entropía Orgánica (editor.html).
// Carga las salas del mapa activo (data/levels.js elige el mundo de data/worlds/), permite pintar tiles, colocar elementos, etiquetar
// zonas, ampliar o crear salas, comprobar el alcance con la física real y guardar de
// vuelta en el archivo del mapa (src/data/worlds/<id>.js) (solo las salas tocadas) o probar en el juego sin guardar.
import { LEVELS, START, WORLDS, WORLD_ID, setWorld } from '../data/levels.js';
import { BIOMES } from '../data/biomes.js';
import { TileWorld } from '../core/Physics.js';
import { paintRoom } from '../factory/TilePainter.js';
import { reach } from '../../tools/reach.mjs';
import { TILES, TILE_BY_CHAR, SOLID, KINDS, ENEMY_TYPES, ENEMIES } from './schema.js';
import { patchLevels } from './serialize.js';
import { NODE_DOSES, NODE_HEAL } from '../state/State.js';
import { enemyThumb } from './EnemyThumbs.js';

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
const getTile = (x, y) => (x < 0 || y < 0 || x >= W() || y >= H() ? '#' : room().grid[y][x]);
function setTile(x, y, c) {
  if (x < 0 || y < 0 || x >= W() || y >= H()) return;
  const r = room().grid[y];
  if (r[x] === c) return;
  room().grid[y] = r.slice(0, x) + c + r.slice(x + 1);
}
function paintAt(x, y, c, size = S.brush, round = false) {
  const R = Math.floor((size - 1) / 2);
  for (let dy = -R; dy <= size - 1 - R; dy++) for (let dx = -R; dx <= size - 1 - R; dx++) {
    if (round && dx * dx + dy * dy > (size / 2) * (size / 2) + 0.5) continue;
    setTile(x + dx, y + dy, c);
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
  for (const ex of r.exits ?? []) {
    if (ex.at && (ex.side === 'left' || ex.side === 'right')) ex.at = ex.at.map((v) => v + dy);
    if (ex.at && (ex.side === 'top' || ex.side === 'bottom')) ex.at = ex.at.map((v) => v + dx);
  }
  for (const [oid, other] of Object.entries(S.rooms)) for (const ex of other.exits ?? []) {
    if (ex.to === S.id) { ex.spawn = [ex.spawn[0] + dx, ex.spawn[1] + dy]; S.dirty.add(oid); }
  }
  if (S.start.room === S.id) S.start.spawn = [S.start.spawn[0] + dx, S.start.spawn[1] + dy];
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
  }
}

// ---------------------------------------------------------------- sala nueva
// "Nueva sala" deja un bloque fantasma en el lienzo, encajado en las celdas del mapa:
// clic para ponerlo con el tamaño mínimo (2x1 celdas: algo más de una pantalla) o
// arrastrar para abarcar un espacio mayor. Se pone rojo si pisa otra sala. Esc cancela.
// ¿Cabe la sala en esa posición del mapa sin pisar a otra?
function mapFree(id, x, y) {
  const r = S.rooms[id], w = r.map?.[2] ?? 1, h = r.map?.[3] ?? 1;
  return !Object.entries(S.rooms).some(([k, o]) => k !== id && o.map && x < o.map[0] + o.map[2] - 1e-6 && x + w > o.map[0] + 1e-6 && y < o.map[1] + o.map[3] - 1e-6 && y + h > o.map[1] + 1e-6);
}
function startPlacing() {
  if (!S.id) { createRoomAt(0, 0, 2, 1); return; }
  S.placing = { cell: null, from: null };
  $('msg').textContent = 'Nueva sala: clic en un hueco libre (tamaño mínimo) o arrastra para marcar todo su espacio. Esc o clic derecho para cancelar. Aléjate con la rueda para ver más.';
  draw();
}
function placingRect() {
  const p = S.placing;
  if (!p?.cell) return null;
  if (!p.from) return [p.cell[0], p.cell[1], 2, 1];
  const x0 = Math.min(p.from[0], p.cell[0]), y0 = Math.min(p.from[1], p.cell[1]);
  const w = Math.max(2, Math.abs(p.cell[0] - p.from[0]) + 1), h = Math.max(1, Math.abs(p.cell[1] - p.from[1]) + 1);
  return [x0, y0, w, h];
}
const overlapsRoom = ([x, y, w, h]) => Object.values(S.rooms).some((o) => o.map && x < o.map[0] + o.map[2] && x + w > o.map[0] && y < o.map[1] + o.map[3] && y + h > o.map[1]);
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
  const biome = room()?.biome ?? 'nervioso';
  // La vista no salta: la sala nueva queda en el mismo sitio de la pantalla.
  const keep = S.id && room()?.map ? { zoom: S.zoom, pan: { x: S.pan.x + (x - room().map[0]) * CELL[0] * S.zoom, y: S.pan.y + (y - room().map[1]) * CELL[1] * S.zoom } } : null;
  S.rooms[id] = { name: 'Sala nueva', biome, map: [x, y, cw, ch], grid, exits: [] };
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

// Un enemigo dibujado con su aspecto, apoyado (centrado) en el fondo de su caja.
function drawEnemy(o, z, alpha) {
  const th = enemyThumb(o.type);
  if (!th) return;
  const [bx, by, bw, bh] = KINDS.enemies.box(o, room()), k = z / 16;
  const dw = th.w * k, dh = th.h * k;
  g.globalAlpha = alpha;
  g.drawImage(th.canvas, (bx + bw / 2) * z - dw / 2, (by + bh) * z - dh, dw, dh);
  g.globalAlpha = 1;
}
// ---------------------------------------------------------------- bestiario (panel)
const BIOME_ORDER = ['nervioso', 'pulmonar', 'digestivo', 'oseo', 'circulatorio', 'corazon'];
function renderBestiary() {
  const box = $('bestiary');
  if (!box) return;
  const ids = Object.keys(ENEMIES).filter((id) => ENEMIES[id].creature);
  ids.sort((a, b) => BIOME_ORDER.indexOf(ENEMIES[a].biome) - BIOME_ORDER.indexOf(ENEMIES[b].biome) || !!ENEMIES[a].boss - !!ENEMIES[b].boss);
  let html = '', last = null;
  for (const id of ids) {
    const d = ENEMIES[id];
    if (d.biome !== last) { last = d.biome; html += `<h5 style="color:${BIOMES[d.biome]?.mapColor ?? '#ccc'}">${(BIOMES[d.biome]?.name ?? d.biome).toUpperCase()}</h5>`; }
    html += `<button data-en="${id}" class="${S.enemyType === id && S.tool === 'place' && S.kind === 'enemies' ? 'on' : ''}" title="${d.name} (${id}) · ${d.w}×${d.h}px · ${d.behavior}"><span class="th" data-th="${id}"></span><span class="${d.boss ? 'boss' : ''}">${d.name}${d.boss ? ' · JEFE' : ''}</span></button>`;
  }
  box.innerHTML = html;
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
    for (const o of box.querySelectorAll('[data-en]')) o.classList.toggle('on', o === b);
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
      if (t?.item || ['o', 'N', 'X', 'Y', 'f', 'z', '^'].includes(c)) {
        g.fillStyle = t?.color ?? '#fff';
        if (t?.item) { g.beginPath(); g.arc(x * z + z / 2, y * z + z / 2, z * 0.32, 0, Math.PI * 2); g.fill(); }
        if (z >= 12) { g.fillStyle = t?.item ? '#000' : '#fff'; g.font = `${Math.floor(z * 0.6)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c, x * z + z / 2, y * z + z / 2 + 1); }
      }
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
  // Dónde se aparece al llegar a un punto (si no es sobre el propio punto).
  for (const l of r.links ?? []) if (l.arrive) {
    const [ax, ay] = l.arrive;
    g.strokeStyle = '#3aff8a'; g.lineWidth = 2; g.setLineDash([3, 3]);
    g.strokeRect(ax * z + 1, (ay - 1) * z + 1, z - 2, 2 * z - 2); g.setLineDash([]);
    g.fillStyle = '#3aff8a'; g.font = '10px monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(`llegada ${l.id}`, ax * z, (ay - 1) * z - 1);
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
const selected = () => {
  if (!S.sel) return null;
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
addEventListener('keydown', (e) => { if (e.code === 'Escape' && S.roomMove) { S.roomMove = false; $('msg').textContent = ''; renderRoomPanel(); draw(); } });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && S.placing) { S.placing = null; $('msg').textContent = 'Nueva sala cancelada.'; draw(); } });
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
  if (!S.id) return;
  const [x, y] = toTile(e);
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
    if (e.button === 2) { S.placing = null; $('msg').textContent = 'Nueva sala cancelada.'; draw(); return; }
    S.placing.cell = cellOf(room(), x, y);
    S.placing.from = S.placing.cell;
    S.drag = { placing: true };
    draw();
    return;
  }
  // Con la herramienta Zona, Alt es copiar (no el punto de prueba).
  if (S.tool === 'area') {
    if (e.button === 2) { S.area = null; S.float = null; draw(); renderInspector(); return; }
    if (S.area && inRect(areaRect(S.area), x, y)) { liftArea(); S.drag = { areaMove: true, from: [x, y] }; draw(); return; }
    S.area = { x0: x, y0: y, x1: x, y1: y }; S.drag = { areaSel: true }; draw(); renderInspector(); return;
  }
  // Alt+clic: punto de prueba · Mayús+clic: origen del alcance.
  if (e.altKey) { S.testSpawn = [x, y]; draw(); return; }
  if (e.shiftKey && S.tool !== 'rect') { S.reachStart = [x, y]; computeReach(); return; }
  const erase = e.button === 2;
  if (S.tool === 'pick') { S.tile = getTile(x, y); renderPalette(); setTool('brush'); return; }
  if (S.tool === 'select' || S.tool === 'place') {
    const hit = hitTest(x, y);
    if (S.tool === 'place' && !hit && !erase) {
      snapshot();
      const K = KINDS[S.kind];
      if (S.kind === 'links' && !spotOk(room(), x, y - (PH - 1))) { $('msg').textContent = 'Ahí no cabe el punto: necesita el hueco del personaje (1×2), sin muro y dentro de la sala. Mejor usa "Crear conexión" en el panel de la sala.'; S.undo[S.id]?.pop(); return; }
      const o = K.make(x, y, room());
      if (S.kind === 'nodules' && S.noduleLux) o.push('luz'); // desde la paleta: nódulo lumínico
      if (S.kind === 'enemies' && S.enemyType) o.type = S.enemyType; // el elegido en el Bestiario
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
  const c = S.tool === 'erase' ? (erase ? S.tile : '.') : erase ? (S.tile === '.' ? '#' : '.') : S.tile;
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
  if (d?.areaSel) { renderInspector(); return; }
  if (d?.roomMove) {
    const r = room();
    if (d.bad) { r.map[0] = d.map0[0]; r.map[1] = d.map0[1]; S.pan = d.pan0; $('msg').textContent = 'Ahí pisaría otra sala: vuelve a su sitio.'; }
    else { $('msg').textContent = `Sala ${S.id} en [${r.map[0]}, ${r.map[1]}].`; S.dirty.add(S.id); }
    renderRoomPanel(); draw(); drawMap();
    return;
  }
  if (d?.areaMove) { dropFloat(); return; }
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
  ['fill', 'Relleno', 'F'], ['pick', 'Cuentagotas', 'I'], ['place', 'Colocar elementos', 'E'], ['select', 'Seleccionar y mover', 'V'],
  ['area', 'Zona: mover, cortar, copiar y pegar', 'M'],
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
S.areaFill ??= '#';
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
function fillRect(r, [x, y, w, h]) {
  for (let j = y; j < y + h; j++) {
    if (j < 0 || j >= r.grid.length) continue;
    const row = r.grid[j], a = Math.max(0, x), b = Math.min(row.length, x + w);
    if (b > a) r.grid[j] = row.slice(0, a) + S.areaFill.repeat(b - a) + row.slice(b);
  }
}
// Arrastrar: levanta las casillas de la zona (y sus elementos) para moverlas.
function liftArea() {
  const rc = areaRect(S.area), [x, y, w, h] = rc;
  snapshot();
  const tiles = Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => getTile(x + i, y + j)));
  const elems = elementsIn(rc);
  fillRect(room(), rc);
  S.float = { tiles, elems, x, y, w, h, dx: 0, dy: 0 };
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
  S.area = { x0: F.x + F.dx, y0: F.y + F.dy, x1: F.x + F.dx + F.w - 1, y1: F.y + F.dy + F.h - 1 };
  S.float = null;
  if (S.clip?.cut && S.clip.room === S.id) S.clip.cut = false; // lo cortado ya no está ahí
  touch(); renderInspector(); draw();
}
function areaPanel() {
  if (S.tool !== 'area') return '';
  let h = '<h3>Zona</h3>';
  if (S.area) { const [x, y, w, h0] = areaRect(S.area); h += `<p class="dim">${w}×${h0} casillas en [${x},${y}] · ${elementsIn([x, y, w, h0]).length} elementos dentro</p>`; }
  else h += '<p class="dim">Arrastra para seleccionar casillas.</p>';
  h += '<p class="dim">Arrastrar desde dentro: mover · Ctrl+X: cortar · Ctrl+C: copiar · Ctrl+V: pegar donde está el ratón (también en otra sala) · Supr: borrar · Esc: soltar.</p>';
  if (S.clip) h += `<p class="dim">${S.clip.cut ? 'Cortado' : 'Copiado'}: ${S.clip.w}×${S.clip.h} de ${S.clip.room}.</p>`;
  if (S.area) h += '<div class="row"><button id="ar-cut">Cortar</button><button id="ar-copy">Copiar</button><button id="ar-del">Borrar</button></div>';
  if (S.clip) h += `<div class="row"><button id="ar-paste" title="Se pega con su esquina donde estaba el ratón por última vez sobre la sala">Pegar ${S.clip.w}×${S.clip.h}</button></div>`;
  h += field('el hueco que deja (al mover, cortar o borrar) se rellena con', { v: S.areaFill === '#' ? 'pared' : 'aire', options: ['pared', 'aire'] }, (v) => { S.areaFill = v === 'pared' ? '#' : '.'; }, 'select');
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
  touch(); renderInspector(); draw();
}
// Guarda la zona (casillas y elementos, con su sitio dentro de ella) para pegarla.
function areaCopy(cutIt = false) {
  if (!S.area) return;
  const rc = areaRect(S.area), [x, y, w, h] = rc, r = room(), src = elementsIn(rc);
  S.clip = {
    room: S.id, rect: rc, w, h, cut: cutIt, src,
    tiles: Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => getTile(x + i, y + j))),
    elems: src.map(({ kind, o }) => ({ kind, o: clone(o), at: elemPos(kind, o, r).map((v, k) => v - rc[k]) })),
  };
  $('msg').textContent = cutIt
    ? `Zona cortada (${w}×${h}): pon el ratón donde la quieras y pulsa Ctrl+V (Esc lo anula).`
    : `Zona copiada (${w}×${h}): pon el ratón donde la quieras y pulsa Ctrl+V.`;
  renderInspector(); draw();
}
const areaCut = () => areaCopy(true);
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
    if (src) { removeElements(c.src, src); fillRect(src, c.rect); }
  }
  for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) setTile(hx + i, hy + j, c.tiles[j][i]);
  const r = room(), elems = addCopies(c.elems);
  elems.forEach((e, i) => {
    const at = c.elems[i].at, [bx, by] = elemPos(e.kind, e.o, r);
    moveElement(e, hx + at[0] - bx, hy + at[1] - by);
  });
  S.area = { x0: hx, y0: hy, x1: hx + c.w - 1, y1: hy + c.h - 1 };
  $('msg').textContent = c.cut ? 'Zona movida aquí (Ctrl+Z la devuelve).' : 'Zona pegada (Ctrl+V otra vez pega otra copia).';
  if (c.cut) { c.cut = false; c.src = []; } // a partir de ahora, pegar hace copias
  touch(); renderInspector(); draw();
}
function drawArea(z) {
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
  if (typeof renderInspector === 'function' && S.id) renderInspector();
  $('kind-row').style.display = t === 'place' ? '' : 'none';
}
function renderTools() {
  $('tools').innerHTML = TOOLS.map(([id, label, key]) => `<button data-tool="${id}" title="${label} (${key})">${label}<kbd>${key}</kbd></button>`).join('');
  for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  $('kind').innerHTML = Object.entries(KINDS).filter(([k]) => k !== 'exits').map(([k, K]) => `<option value="${k}">${K.label}</option>`).join('');
  $('kind').onchange = () => { S.kind = $('kind').value; S.noduleLux = false; };
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
  const cur = TILE_BY_CHAR[S.tile];
  // Al final, accesos a elementos que se buscan junto a los objetos (los nódulos no son
  // casillas: pulsarlos pasa a "Colocar elementos" con ese nódulo).
  const extras = [['nodule', 'Nódulo óseo (elemento: suelta hueso)', '#e8dcc8', 'n'], ['noduleLux', 'Nódulo lumínico (elemento: suelta célula)', '#ffd23f', 'n*'], ['lamp', 'Luminaria colgante (elemento: luz tenue)', '#9affc8', 'l']];
  // Con una rampa elegida: la pieza en grande y cómo voltearla o reflejarla (T también voltea).
  const piece = cur?.slope || cur?.ceil ? `<div class="piece">${slopeIcon(cur, 42, bc.wall, bc.air)}<div><b>${cur.name}</b><div class="row"><button id="pc-flip" title="Rampa de techo ⇄ de suelo (tecla T)">⇅ Voltear (${cur.ceil ? 'suelo' : 'techo'})</button><button id="pc-mirror" title="Que suba o baje hacia el otro lado">⇆ Espejo</button></div></div></div>` : '';
  $('palette').innerHTML = piece + TILES.map((t) => `<button class="sw${t.c === S.tile ? ' on' : ''}" data-c="${t.c}" title="${t.name}">${t.slope || t.ceil ? slopeIcon(t, 14, bc.wall, bc.air) : `<i style="background:${t.c === '#' ? bc.wall : t.c === '.' ? bc.air : t.color}"></i>`}<b>${t.c}</b><span>${t.name}</span></button>`).join('')
    + extras.map(([id, name, col, mark]) => `<button class="sw${S.tool === 'place' && (id === 'lamp' ? S.kind === 'lamps' : S.kind === 'nodules' && !!S.noduleLux === (id === 'noduleLux')) ? ' on' : ''}" data-el="${id}" title="${name}"><i style="background:${col}"></i><b>${mark}</b><span>${name}</span></button>`).join('');
  if ($('pc-flip')) $('pc-flip').onclick = () => { S.tile = FLIP[S.tile]; renderPalette(); };
  if ($('pc-mirror')) $('pc-mirror').onclick = () => { S.tile = MIRROR[S.tile]; renderPalette(); };
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
  else if (typeof value === 'string' && value.length > 30) input = `<textarea id="${id}" rows="3">${value}</textarea>`;
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
  h += field('al llegar aquí, aparece en [x, y] (vacío: sobre el punto)', o.arrive ?? '', (v) => { if (Array.isArray(v) && v.length === 2) o.arrive = v; else delete o.arrive; });
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
    if (i >= 0) { S.sel = { kind: 'links', index: i }; S.tool = 'select'; renderInspector(); draw(); }
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
  if (S.tool === 'area') { box.innerHTML = areaPanel(); wireAreaPanel(); return; }
  if (!o) { box.innerHTML = '<p class="dim">Selecciona un elemento (V) o coloca uno nuevo (E). Clic derecho borra.</p>'; return; }
  const kind = S.sel.kind;
  let html = `<h3>${KINDS[kind]?.label ?? kind} <span class="dim">#${S.sel.index}</span></h3>`;
  if (Array.isArray(o)) html += field('posición [x, y]', o, (v) => { o[0] = v[0]; o[1] = v[1]; });
  // Nódulos: el tercer valor 'luz' lo vuelve lumínico (brilla a oscuras y suelta una célula).
  // Luminarias: el tercer valor es el largo del pingajo en píxeles.
  if (kind === 'lamps') html += field('largo (px)', o[2] ?? 10, (v) => { o[2] = Math.max(2, Math.round(v)); }, 'number');
  if (kind === 'nodules') html += field('tipo', { v: o[2] === 'luz' ? 'luz (suelta célula)' : 'óseo (suelta hueso)', options: ['óseo (suelta hueso)', 'luz (suelta célula)'] }, (nv) => { if (nv.startsWith('luz')) o[2] = 'luz'; else o.length = 2; }, 'select');
  else if (kind === 'links') html += linkFields(o);
  else for (const [k, v] of Object.entries(o)) {
    if (kind === 'exits' && k === 'toLink') continue;
    if (kind === 'enemies' && k === 'type') html += field('tipo', { v, options: ENEMY_TYPES }, (nv) => { o.type = nv; }, 'select');
    else if (kind === 'exits' && k === 'to') html += field('lleva a', { v, options: Object.keys(S.rooms) }, (nv) => { o.to = nv; }, 'select');
    else if (kind === 'exits' && k === 'side') html += field('lado', { v, options: ['left', 'right', 'top', 'bottom'] }, (nv) => { o.side = nv; }, 'select');
    else html += field(k, v, (nv) => { o[k] = nv; });
  }
  if (kind === 'exits') html += field('llega al punto (opcional: en vez de "spawn")', { v: o.toLink ?? '', options: ['', ...(S.rooms[o.to]?.links ?? []).map((l) => l.id)] }, (nv) => { if (nv) o.toLink = nv; else delete o.toLink; }, 'select');
  if (kind === 'enemies') html += `<p class="dim">${ENEMIES[o.type]?.name ?? ''} · ${ENEMIES[o.type]?.w}x${ENEMIES[o.type]?.h}px · ${ENEMIES[o.type]?.behavior}</p>`;
  if (kind === 'pods') html += field('abre la compuerta', room().pods.opens, (v) => { room().pods.opens = v; }) + field('orden (índices)', room().pods.order, (v) => { room().pods.order = v; });
  html += `<div class="row"><button id="del">Eliminar</button><button id="dup">Duplicar</button></div>`;
  box.innerHTML = html;
  if (kind === 'links') wireLinkButtons(o);
  $('del').onclick = deleteSelected;
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
function deleteSelected() {
  if (!S.sel) return;
  snapshot();
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
function spotOk(r, x, y, w = PW, h = PH) {
  if (x < 0 || y < 0 || x + w > r.grid[0].length || y + h > r.grid.length) return false;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const c = r.grid[yy][xx]; if (SOLID.has(c) || TILE_BY_CHAR[c]?.slope || TILE_BY_CHAR[c]?.ceil) return false; }
  return true;
}
// Un punto ya puesto vale si está dentro de la sala y tiene algún paso (libre, o que se abre:
// membrana, esfínter, fotosensible). Al crear uno, spotOk exige el hueco limpio del personaje.
function spotUsable(r, l) {
  let open = false;
  for (let y = l.y; y < l.y + (l.h ?? PH); y++) for (let x = l.x; x < l.x + (l.w ?? PW); x++) {
    const c = r.grid[y]?.[x];
    if (c === undefined) return false;
    if (!SOLID.has(c) || 'XYf'.includes(c)) open = true;
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
  if (L?.stage === 'place' && L.room === S.id) h += `<div class="wiz">1/3 · Haz clic en la sala donde irá el punto (fantasma del tamaño del personaje: verde si vale). <button data-lk="cancel">Cancelar</button></div>`;
  if (L?.stage === 'dest' && L.room === S.id) {
    h += `<div class="wiz">2/3 · ¿Adónde lleva <b>${L.link}</b>?</div>`;
    const list = [];
    for (const [id, o] of Object.entries(S.rooms)) for (const l of o.links ?? []) if (!(id === S.id && l.id === L.link)) list.push([id, l]);
    h += '<div class="dim" style="font-size:11px;margin:4px 0 2px">A un punto que ya existe:</div>';
    if (list.length) h += list.map(([id, l], i) => `<button class="pick" data-dest="${i}">${bName(id)} · ${id} · ${l.id} (${l.x},${l.y + (l.h ?? PH) - 1})${l.to ? '' : ' · llegada libre'}</button>`).join('');
    else h += '<div class="dim" style="font-size:11px">(todavía no hay otros puntos)</div>';
    // O a un sitio nuevo de cualquier sala: un botón por sala (un clic y se marca allí).
    h += '<div class="dim" style="font-size:11px;margin:6px 0 2px">O a un sitio nuevo, marcándolo en la sala:</div><div class="rooms-pick">';
    h += Object.keys(S.rooms).map((id) => `<button class="pick" data-man="${id}">${id} · ${S.rooms[id].name}${id === S.id ? ' (esta)' : ''} →</button>`).join('') + '</div>';
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
  $('lk-new').onclick = () => { S.linking = { stage: 'place', room: S.id }; setTool('select'); renderRoomPanel(); $('msg').textContent = 'Crear conexión: haz clic donde irá el punto (Esc cancela).'; draw(); };
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
    snapshot(); l.to = id; l.toLink = t.id; touch();
    S.linking = { stage: 'recip', room: L.room, from: { room: L.room, link: L.link }, to: { room: id, link: t.id } };
    renderRoomPanel();
  };
  for (const b of box.querySelectorAll('[data-man]')) b.dataset.lk = 'manual';
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
  const Wd = r.grid[0].length, Hd = r.grid.length, open = (c) => c !== undefined && !SOLID.has(c) && !TILE_BY_CHAR[c]?.slope && !TILE_BY_CHAR[c]?.ceil;
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
  if (!rectOk(r, q)) { $('msg').textContent = 'Ahí no cabe: el punto necesita al menos el hueco del personaje (1×2), sin muro y dentro de la sala.'; return true; }
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
    S.linking = { stage: 'recip', room: S.id, from: L.from, to: { room: S.id, link: id } };
    touch(); renderRoomPanel();
    $('msg').textContent = `Punto ${id} creado en ${S.id}. ¿Recíproco? (en el panel de la sala)`;
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
    html += `<h4>Útero (curas)</h4>`;
    html += field(`curas máximas (por defecto ${NODE_DOSES})`, w.doses ?? NODE_DOSES, (v) => setW('doses', v, NODE_DOSES));
    html += field(`integridad por cura (por defecto ${NODE_HEAL})`, w.cure ?? NODE_HEAL, (v) => setW('cure', v, NODE_HEAL));
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
  return [Math.floor(((e.clientX - rc.left) * sx - t.ox) / t.k + t.minX), Math.floor(((e.clientY - rc.top) * sy - t.oy) / t.k + t.minY)];
};
const roomAtCell = ([mx, my]) => Object.entries(S.rooms).find(([, r]) => r.map && mx >= r.map[0] && my >= r.map[1] && mx < r.map[0] + r.map[2] && my < r.map[1] + r.map[3]);
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
  S.sel = null; S.reach = null; S.reachStart = null; S.testSpawn = null;
  S.pan = keep?.pan ?? { x: 20, y: 20 };
  const c = cv.getBoundingClientRect();
  S.zoom = keep?.zoom ?? Math.max(4, Math.min(28, Math.floor(Math.min((c.width - 40) / W(), (c.height - 40) / H()))));
  renderRoomList(); renderRoomPanel(); renderInspector(); renderPalette(); drawMap(); draw();
}

// ---------------------------------------------------------------- alcance y validación
function computeReach() {
  if (!S.reachStart) { $('msg').textContent = 'Mayús+clic en un suelo para marcar desde dónde comprobar el alcance.'; return; }
  const open = S.reachOpen ? ['X', 'f', 'Y', 'z', 'D'] : [];
  const res = reach(S.id, S.reachStart, { grid: room().grid, doubleJump: S.reachDouble, open });
  S.reach = res;
  $('msg').textContent = `Alcance desde ${S.reachStart}: ${res.standing.size} apoyos · salidas: ${[...res.exits].join(', ') || 'ninguna'}${S.reachDouble ? ' (con doble salto)' : ''}`;
  draw();
}
function validate() {
  const out = [];
  const add = (room, msg) => out.push([room, msg]);
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
    for (const v of [...(r.valves ?? []), ...(r.floats ?? [])]) if (!r.fluids?.[v.pool]) add(id, `válvula o balsa ligada a la cubeta ${v.pool}, que no existe`);
  }
  for (const [id, r] of Object.entries(S.rooms)) {
    for (const l of r.links ?? []) {
      if (!l.to && !arrivals(id, l)) add(id, `el punto ${l.id} no lleva a ningún sitio (sin destino): elige su destino en Conexiones o bórralo`);
      if (!spotUsable(r, l)) add(id, `el punto ${l.id} está fuera de la sala o tapado por muro en [${l.x},${l.y}]: muévelo o bórralo`);
      if (l.to && !S.rooms[l.to]) add(id, `el punto ${l.id} lleva a una sala que no existe (${l.to})`);
      else if (l.to && l.toLink && !(S.rooms[l.to].links ?? []).some((k) => k.id === l.toLink)) add(id, `el punto ${l.id} lleva a ${l.to}·${l.toLink}, que no existe`);
    }
    for (const ex of r.exits ?? []) if (ex.toLink && !(S.rooms[ex.to]?.links ?? []).some((k) => k.id === ex.toLink)) add(id, `la salida ${ex.side} llega a ${ex.to}·${ex.toLink}, que no existe`);
  }
  if (!S.rooms[S.start.room]) add('INICIO', 'la sala de inicio no existe');
  $('problems').innerHTML = out.length ? out.map(([rid, m]) => `<button class="pb" data-id="${rid}">${rid}: ${m}</button>`).join('') : '<p class="ok">Sin problemas.</p>';
  for (const b of document.querySelectorAll('#problems .pb')) b.onclick = () => S.rooms[b.dataset.id] && openRoom(b.dataset.id);
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
  const sp = S.testSpawn ?? (S.start.room === S.id ? S.start.spawn : null) ?? findFloor();
  open(`index.html?editor&room=${encodeURIComponent(S.id)}&spawn=${sp.join(',')}&steps=2`, 'linfa-prueba');
}
function findFloor() {
  for (let y = 1; y < H() - 1; y++) for (let x = 1; x < W() - 1; x++) if (!SOLID.has(getTile(x, y)) && !SOLID.has(getTile(x, y - 1)) && SOLID.has(getTile(x, y + 1))) return [x, y];
  return [1, 1];
}
async function save() {
  if (validate() && !confirm('Hay problemas en los datos (mira la lista). ¿Guardar igualmente?')) return;
  const changed = {};
  for (const id of S.dirty) if (S.rooms[id]) changed[id] = S.rooms[id];
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
const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
addEventListener('keydown', (e) => {
  if (isTyping()) return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); undo(true); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); return; }
  if (e.ctrlKey || e.metaKey) {
    if (e.code === 'KeyC' && S.area) { e.preventDefault(); areaCopy(); }
    if (e.code === 'KeyX' && S.area) { e.preventDefault(); areaCut(); }
    if (e.code === 'KeyV' && S.clip && S.id) { e.preventDefault(); areaPaste(); }
    return;                                              // Ctrl + letra nunca cambia de herramienta
  }
  if (e.altKey) return;
  if (S.tool === 'area') {
    if ((e.code === 'Delete' || e.code === 'Backspace') && S.area && !S.float) { areaDelete(); return; }
    if (e.code === 'Escape') { if (S.clip?.cut) { S.clip = null; $('msg').textContent = 'Corte anulado.'; } S.area = null; S.float = null; draw(); renderInspector(); return; }
  }
  const t = TOOLS.find(([, , k]) => `Key${k}` === e.code);
  if (t) setTool(t[0]);
  if (e.code === 'Delete' || e.code === 'Backspace') deleteSelected();
  if (e.code === 'KeyT' && FLIP[S.tile]) { S.tile = FLIP[S.tile]; renderPalette(); $('msg').textContent = `Rampa volteada: ${TILE_BY_CHAR[S.tile].name} (T vuelve a voltear).`; return; }
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
