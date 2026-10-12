// Editor de niveles de Entropía Orgánica (editor.html).
// Carga las salas de data/levels.js, permite pintar tiles, colocar elementos, etiquetar
// zonas, ampliar o crear salas, comprobar el alcance con la física real y guardar de
// vuelta en levels.js (solo las salas tocadas) o probar en el juego sin guardar.
import { LEVELS, START } from '../data/levels.js';
import { BIOMES } from '../data/biomes.js';
import { TileWorld } from '../core/Physics.js';
import { paintRoom } from '../factory/TilePainter.js';
import { reach } from '../../tools/reach.mjs';
import { TILES, TILE_BY_CHAR, SOLID, KINDS, ENEMY_TYPES, ENEMIES } from './schema.js';
import { patchLevels } from './serialize.js';

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
function touch() {
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
  touch();
  renderRoomPanel();
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

function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0a0709';
  g.fillRect(0, 0, cv.width, cv.height);
  if (!S.id) return;
  const z = S.zoom, r = room();
  g.setTransform(1, 0, 0, 1, S.pan.x, S.pan.y);
  g.imageSmoothingEnabled = false;
  if (S.view === 'game' && gameView()) {
    g.fillStyle = '#1a1418'; g.fillRect(0, 0, W() * z, H() * z);
    g.drawImage(S.gameCanvas, 0, 0, W() * z, H() * z);
  } else {
    const bc = biomeColors(r.biome);
    for (let y = 0; y < H(); y++) for (let x = 0; x < W(); x++) {
      const c = r.grid[y][x], t = TILE_BY_CHAR[c];
      g.fillStyle = c === '#' ? bc.wall : c === '.' || t?.item ? bc.air : t?.color ?? '#ff00ff';
      g.fillRect(x * z, y * z, z, z);
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
    g.fillStyle = S.sel?.kind === 'exits' && S.sel.index === i ? '#ffd23f' : '#fff';
    g.font = '11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`→ ${ex.to}`, bx + bw / 2, by + bh / 2);
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
      const o = K.make(x, y, room());
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
  const d = S.drag;
  if (!d) { if (e.target === cv) draw(); return; }
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
      else K.move(o, bx + dx, by + dy, r);
    }
    touch(); renderInspector();
  }
});
addEventListener('mouseup', () => {
  const d = S.drag;
  S.drag = null;
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
];
function setTool(t) {
  S.tool = t;
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
  $('kind-row').style.display = t === 'place' ? '' : 'none';
}
function renderTools() {
  $('tools').innerHTML = TOOLS.map(([id, label, key]) => `<button data-tool="${id}" title="${label} (${key})">${label}<kbd>${key}</kbd></button>`).join('');
  for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  $('kind').innerHTML = Object.entries(KINDS).filter(([k]) => k !== 'exits').map(([k, K]) => `<option value="${k}">${K.label}</option>`).join('');
  $('kind').onchange = () => { S.kind = $('kind').value; };
  $('brush').oninput = () => { S.brush = Number($('brush').value); $('brush-v').textContent = S.brush; };
  setTool('brush');
}
function renderPalette() {
  const bc = biomeColors(room()?.biome);
  $('palette').innerHTML = TILES.map((t) => `<button class="sw${t.c === S.tile ? ' on' : ''}" data-c="${t.c}" title="${t.name}"><i style="background:${t.c === '#' ? bc.wall : t.c === '.' ? bc.air : t.color}"></i><b>${t.c}</b><span>${t.name}</span></button>`).join('');
  for (const b of document.querySelectorAll('#palette .sw')) b.onclick = () => { S.tile = b.dataset.c; if (!['brush', 'blob', 'rect', 'fill'].includes(S.tool)) setTool('brush'); renderPalette(); };
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
    };
  });
  return `<label>${label}${input}</label>`;
}
function renderInspector() {
  const box = $('inspector');
  const o = selected();
  if (!o) { box.innerHTML = '<p class="dim">Selecciona un elemento (V) o coloca uno nuevo (E). Clic derecho borra.</p>'; return; }
  const kind = S.sel.kind;
  let html = `<h3>${KINDS[kind]?.label ?? kind} <span class="dim">#${S.sel.index}</span></h3>`;
  if (Array.isArray(o)) html += field('posición [x, y]', o, (v) => { o[0] = v[0]; o[1] = v[1]; });
  else for (const [k, v] of Object.entries(o)) {
    if (kind === 'enemies' && k === 'type') html += field('tipo', { v, options: ENEMY_TYPES }, (nv) => { o.type = nv; }, 'select');
    else if (kind === 'exits' && k === 'to') html += field('lleva a', { v, options: Object.keys(S.rooms) }, (nv) => { o.to = nv; }, 'select');
    else if (kind === 'exits' && k === 'side') html += field('lado', { v, options: ['left', 'right', 'top', 'bottom'] }, (nv) => { o.side = nv; }, 'select');
    else html += field(k, v, (nv) => { o[k] = nv; });
  }
  if (kind === 'enemies') html += `<p class="dim">${ENEMIES[o.type]?.name ?? ''} · ${ENEMIES[o.type]?.w}x${ENEMIES[o.type]?.h}px · ${ENEMIES[o.type]?.behavior}</p>`;
  if (kind === 'pods') html += field('abre la compuerta', room().pods.opens, (v) => { room().pods.opens = v; }) + field('orden (índices)', room().pods.order, (v) => { room().pods.order = v; });
  html += `<div class="row"><button id="del">Eliminar</button><button id="dup">Duplicar</button></div>`;
  box.innerHTML = html;
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
function renderRoomPanel() {
  const r = room(), box = $('room');
  if (!r) { box.innerHTML = ''; return; }
  const cells = [Math.ceil(W() / CELL[0]), Math.ceil(H() / CELL[1])];
  let html = `<h3>${S.id} <span class="dim">${W()}x${H()} tiles · ${cells[0]}x${cells[1]} celdas</span></h3>`;
  html += field('nombre', r.name, (v) => { r.name = v; renderRoomList(); });
  html += field('bioma', { v: r.biome, options: Object.keys(BIOMES) }, (v) => { r.biome = v; renderPalette(); drawMap(); }, 'select');
  html += field('secreta', !!r.secret, (v) => { if (v) r.secret = true; else delete r.secret; });
  html += field('mapa [x, y, ancho, alto] (celdas)', r.map ?? [0, 0, cells[0], cells[1]], (v) => { r.map = v; drawMap(); });
  html += `<div class="row"><button id="fitmap" title="Ancho y alto del mapa según el tamaño de la sala">Ajustar mapa al tamaño</button></div>`;
  html += `<h4>Ampliar / recortar</h4><div class="grid4">${['top', 'bottom', 'left', 'right'].map((s) => `<span>${{ top: 'arriba', bottom: 'abajo', left: 'izquierda', right: 'derecha' }[s]}</span><button data-rs="${s}" data-n="-1">−1</button><button data-rs="${s}" data-n="1">+1</button><button data-rs="${s}" data-n="${s === 'top' || s === 'bottom' ? CELL[1] : CELL[0]}">+celda</button>`).join('')}</div>`;
  html += `<h4>Salidas</h4>`;
  (r.exits ?? []).forEach((ex, i) => { html += `<button class="ex${S.sel?.kind === 'exits' && S.sel.index === i ? ' on' : ''}" data-ex="${i}">${ex.side}${ex.at ? ` [${ex.at.join('-')}]` : ''} → ${ex.to} (${ex.spawn.join(',')})</button>`; });
  html += `<div class="row"><button id="addexit">+ salida</button><button id="setstart">Inicio del juego aquí (punto de prueba)</button></div>`;
  box.innerHTML = html;
  $('fitmap').onclick = () => { snapshot(); r.map = [r.map?.[0] ?? 0, r.map?.[1] ?? 0, cells[0], cells[1]]; touch(); renderRoomPanel(); drawMap(); };
  for (const b of box.querySelectorAll('[data-rs]')) b.onclick = () => resize(b.dataset.rs, Number(b.dataset.n));
  for (const b of box.querySelectorAll('[data-ex]')) b.onclick = () => { S.sel = { kind: 'exits', index: Number(b.dataset.ex) }; renderInspector(); renderRoomPanel(); draw(); };
  $('addexit').onclick = () => {
    snapshot();
    (r.exits ??= []).push({ side: 'right', at: [Math.floor(H() / 2) - 1, Math.floor(H() / 2)], to: Object.keys(S.rooms)[0], spawn: [1, 1] });
    S.sel = { kind: 'exits', index: r.exits.length - 1 };
    touch(); renderInspector(); renderRoomPanel();
  };
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
function drawMap() {
  const rects = Object.entries(S.rooms).filter(([, r]) => r.map).map(([id, r]) => [id, ...r.map]);
  if (!rects.length) return;
  const minX = Math.min(...rects.map((r) => r[1])), minY = Math.min(...rects.map((r) => r[2]));
  const maxX = Math.max(...rects.map((r) => r[1] + r[3])), maxY = Math.max(...rects.map((r) => r[2] + r[4]));
  const k = Math.min(mv.width / (maxX - minX + 1), mv.height / (maxY - minY + 1));
  mg.fillStyle = '#0a0709'; mg.fillRect(0, 0, mv.width, mv.height);
  S.mapXform = { minX, minY, k };
  for (const [id, x, y, w, h] of rects) {
    const r = S.rooms[id];
    mg.fillStyle = (BIOMES[r.biome]?.mapColor ?? '#888') + (id === S.id ? 'ff' : '66');
    mg.fillRect((x - minX + 0.5) * k + 1, (y - minY + 0.5) * k + 1, w * k - 2, h * k - 2);
    if (k > 10) { mg.fillStyle = '#000'; mg.font = '9px monospace'; mg.fillText(id, (x - minX + 0.5) * k + 3, (y - minY + 0.5) * k + 10); }
  }
}
mv.onclick = (e) => {
  const t = S.mapXform; if (!t) return;
  const rc = mv.getBoundingClientRect();
  const mx = (e.clientX - rc.left) / t.k + t.minX - 0.5, my = (e.clientY - rc.top) / t.k + t.minY - 0.5;
  const hit = Object.entries(S.rooms).find(([, r]) => r.map && mx >= r.map[0] && my >= r.map[1] && mx < r.map[0] + r.map[2] && my < r.map[1] + r.map[3]);
  if (hit) openRoom(hit[0]);
};

function openRoom(id) {
  S.id = id;
  S.sel = null; S.reach = null; S.reachStart = null; S.testSpawn = null;
  S.pan = { x: 20, y: 20 };
  const c = cv.getBoundingClientRect();
  S.zoom = Math.max(4, Math.min(28, Math.floor(Math.min((c.width - 40) / W(), (c.height - 40) / H()))));
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
      else if (!SOLID.has(cell(ex.to, x, y + 1))) add(id, `la llegada a ${ex.to} [${x},${y}] no tiene suelo`);
      if (!(S.rooms[ex.to].exits ?? []).some((b) => b.to === id)) add(id, `${ex.to} no tiene salida de vuelta a ${id}`);
    }
    const gates = new Set((r.gates ?? []).map((q) => q.id));
    for (const p of r.pads ?? []) if (!gates.has(p.opens)) add(id, `ganglio que abre una compuerta inexistente (${p.opens})`);
    if (r.pods && !gates.has(r.pods.opens)) add(id, `sacos en orden que abren una compuerta inexistente (${r.pods.opens})`);
    for (const v of [...(r.valves ?? []), ...(r.floats ?? [])]) if (!r.fluids?.[v.pool]) add(id, `válvula o balsa ligada a la cubeta ${v.pool}, que no existe`);
  }
  if (!S.rooms[S.start.room]) add('INICIO', 'la sala de inicio no existe');
  $('problems').innerHTML = out.length ? out.map(([rid, m]) => `<button class="pb" data-id="${rid}">${rid}: ${m}</button>`).join('') : '<p class="ok">Sin problemas.</p>';
  for (const b of document.querySelectorAll('#problems .pb')) b.onclick = () => S.rooms[b.dataset.id] && openRoom(b.dataset.id);
  return out.length;
}

// ---------------------------------------------------------------- probar y guardar
// El archivo levels.js elegido se recuerda entre sesiones (IndexedDB guarda el
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
const loadHandle = () => handleStore('readonly', (st) => st.get('levels')).catch(() => null);
const saveHandle = (h) => handleStore('readwrite', (st) => st.put(h, 'levels')).catch(() => null);

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
      [S.fileHandle] = await showOpenFilePicker({ id: 'linfa-levels', types: [{ description: 'levels.js', accept: { 'text/javascript': ['.js'] } }] });
      saveHandle(S.fileHandle);
    }
    let text;
    if (S.fileHandle) text = await (await S.fileHandle.getFile()).text();
    else text = await (await fetch('src/data/levels.js', { cache: 'no-store' })).text();
    if (!text.includes('export const LEVELS')) throw new Error('Ese archivo no es src/data/levels.js');
    const out = patchLevels(text, changed, [...S.removed], startChanged);
    if (S.fileHandle) {
      const w = await S.fileHandle.createWritable();
      await w.write(out); await w.close();
      $('msg').textContent = `Guardado en ${S.fileHandle.name}: ${Object.keys(changed).join(', ') || '(sin salas)'}${startChanged ? ' + inicio' : ''}.`;
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
      a.download = 'levels.js'; a.click();
      $('msg').textContent = 'Tu navegador no deja escribir archivos: se ha descargado levels.js. Sustituye src/data/levels.js por él.';
    }
    S.dirty.clear(); S.removed.clear();
    renderRoomList();
  } catch (e) {
    if (e.name !== 'AbortError') alert('No se pudo guardar: ' + e.message);
  }
}
function newRoom() {
  const id = prompt('Identificador de la nueva sala (p. ej. B8):');
  if (!id || S.rooms[id]) { if (id) alert('Ya existe una sala con ese identificador.'); return; }
  const cw = Number(prompt('Ancho en celdas (16 tiles cada una):', '3')) || 3, ch = Number(prompt('Alto en celdas (14 tiles cada una):', '1')) || 1;
  const w = cw * CELL[0], h = ch * CELL[1];
  const grid = Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));
  const biome = room()?.biome ?? 'nervioso';
  S.rooms[id] = { name: 'Sala nueva', biome, map: [0, 0, cw, ch], grid, exits: [] };
  S.dirty.add(id);
  openRoom(id);
}
function deleteRoom() {
  if (!S.id || !confirm(`¿Eliminar la sala ${S.id}? (al guardar se quitará de levels.js)`)) return;
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

// ---------------------------------------------------------------- teclado
const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
addEventListener('keydown', (e) => {
  if (isTyping()) return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); undo(true); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); return; }
  const t = TOOLS.find(([, , k]) => `Key${k}` === e.code);
  if (t) setTool(t[0]);
  if (e.code === 'Delete' || e.code === 'Backspace') deleteSelected();
  if (e.code === 'KeyG') { S.view = S.view === 'game' ? 'schema' : 'game'; $('view').checked = S.view === 'game'; draw(); }
  if (e.code === 'BracketRight') { S.brush = Math.min(9, S.brush + 1); $('brush').value = S.brush; $('brush-v').textContent = S.brush; }
  if (e.code === 'BracketLeft') { S.brush = Math.max(1, S.brush - 1); $('brush').value = S.brush; $('brush-v').textContent = S.brush; }
});

// ---------------------------------------------------------------- arranque
$('save').onclick = save;
$('pickfile').onclick = async () => {
  if (!window.showOpenFilePicker) { alert('Este navegador no permite elegir archivos para escribir: al guardar se descargará levels.js.'); return; }
  try {
    [S.fileHandle] = await showOpenFilePicker({ id: 'linfa-levels', types: [{ description: 'levels.js', accept: { 'text/javascript': ['.js'] } }] });
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
