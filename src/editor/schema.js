// Qué sabe el editor de niveles sobre los datos de data/levels.js: los tiles que se
// pintan y los elementos que se colocan (con su posición, su caja y una plantilla).
import { ENEMIES } from '../data/enemies.js';
import { MUTATIONS, DNA_CHARS } from '../data/mutations.js';

// Tiles: carácter, nombre y color en la vista esquemática.
export const TILES = [
  { c: '#', name: 'Pared (material del bioma)', color: '#6a2a40' },
  { c: '.', name: 'Aire', color: '#151018' },
  { c: '~', name: 'Ácido gástrico', color: '#3f8f2a' },
  { c: '^', name: 'Espinas óseas', color: '#d8c8a8' },
  { c: 'v', name: 'Abismo', color: '#000000' },
  { c: 'o', name: 'Esfínter de anclaje (Tendón)', color: '#c86070' },
  { c: 'N', name: 'Nodo Seguro (útero)', color: '#3aff8a' },
  { c: 'X', name: 'Membrana agrietada (Embestida)', color: '#b04a6a' },
  { c: 'Y', name: 'Esfínter sellado (Tendón)', color: '#e07a9a' },
  { c: 'f', name: 'Membrana fotosensible (luz)', color: '#c8a0c0' },
  { c: 'z', name: 'Pared falsa (luz)', color: '#8a5a6a' },
  { c: 'm', name: 'Mucosa resbaladiza', color: '#6a8a30' },
  { c: 'b', name: 'Biomasa', color: '#e07a98', item: true },
  { c: 'B', name: 'Célula lumínica (batería)', color: '#ffd23f', item: true },
  { c: 'S', name: 'Hueso', color: '#e8dcc8', item: true },
  { c: 'O', name: 'Filtro de oxígeno', color: '#4ab8f0', item: true },
  { c: 'Q', name: 'Quiste (+20 biomasa máx)', color: '#d0a0ff', item: true },
  { c: 'h', name: 'Tejido sano', color: '#ff9aa8', item: true },
  { c: 'g', name: 'Timo Necrótico', color: '#a0ffa0', item: true },
  { c: '*', name: 'Fragmento de ADN', color: '#ff60ff', item: true },
  { c: 'P', name: 'Perla de Nácar (invulnerable)', color: '#4ff0ff', item: true },
  { c: 'C', name: 'Célula Madre (regenera)', color: '#3ac060', item: true },
  { c: 'H', name: 'El Corazón (final)', color: '#ff2040', item: true },
  ...Object.entries(DNA_CHARS).map(([c, id]) => ({ c, name: `ADN: ${MUTATIONS[id].name}`, color: MUTATIONS[id].color ?? '#ffffff', item: true })),
];
export const TILE_BY_CHAR = Object.fromEntries(TILES.map((t) => [t.c, t]));
export const SOLID = new Set(['#', 'X', 'f', 'Y', 'D', 'm']);

export const ENEMY_TYPES = Object.keys(ENEMIES);
export { ENEMIES };

// Elementos colocables. Para cada lista de la sala:
//   label    nombre en el editor
//   color    color en el lienzo
//   make(x, y, room)   nuevo elemento en el tile (x, y)
//   box(o, room)       [x, y, w, h] en tiles (para dibujar y seleccionar)
//   move(o, x, y, room)  lo coloca con la esquina en (x, y)
//   single   la lista es un único objeto (pods)
const pt = (o) => (Array.isArray(o) ? o : [o.x, o.y]);
const rangeX = (o) => (Array.isArray(o.x) ? o.x : [o.x, o.x]);
export const KINDS = {
  enemies: {
    label: 'Enemigo', color: '#ff5050',
    make: (x, y) => ({ type: 'acechador', x, y }),
    box: (o) => {
      const d = ENEMIES[o.type];
      const w = Math.max(1, Math.round((d?.w ?? 16) / 16)), h = Math.max(1, Math.round((d?.h ?? 16) / 16));
      return [o.x - Math.floor((w - 1) / 2), o.y - h + 1, w, h];
    },
    move: (o, x, y) => { o.x = x; o.y = y; },
    text: (o) => o.type,
  },
  nodules: {
    label: 'Nódulo óseo', color: '#e8dcc8',
    make: (x, y) => [x, y], box: (o) => [...pt(o), 1, 1], move: (o, x, y) => { o[0] = x; o[1] = y; }, text: (o) => (o[2] === 'luz' ? 'luz' : 'nód'),
  },
  hidden: {
    label: 'Objeto oculto (marca)', color: '#ffffff',
    make: (x, y) => [x, y], box: (o) => [...pt(o), 1, 1], move: (o, x, y) => { o[0] = x; o[1] = y; }, text: () => 'oculto',
  },
  sacs: {
    label: 'Saco vitelino (hasta el jefe)', color: '#e0b040',
    make: (x, y) => ({ x, y, item: '*', until: 'gangliomadre' }), box: (o) => [o.x, o.y, 1, 1], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => `saco ${o.item}`,
  },
  gates: {
    label: 'Compuerta-esfínter', color: '#ff3060',
    make: (x, y) => ({ id: 'g1', x, y, h: 3 }), box: (o) => [o.x, o.y, 1, o.h], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => o.id,
  },
  pads: {
    label: 'Ganglio reflejo', color: '#4ab0ff',
    make: (x, y) => ({ x, y, hold: 1.2, opens: 'g1', time: 6 }), box: (o) => [o.x, o.y, 1, 1], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => `→${o.opens}`,
  },
  pods: {
    label: 'Saco en orden (punto)', color: '#ffd860', single: true,
    make: (x, y, room) => { room.pods ??= { opens: 'g1', at: [], order: [] }; room.pods.at.push([x, y]); room.pods.order = room.pods.at.map((_, i) => i); return null; },
  },
  valves: {
    label: 'Pústula-válvula', color: '#c8c040',
    make: (x, y) => ({ x, y, dir: 'left', pool: 0, action: 'fill', time: 8 }), box: (o) => [o.x, o.y, 1, 1], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => o.action,
  },
  floats: {
    label: 'Balsa de grasa (en una cubeta)', color: '#d8c080',
    make: (x, y) => ({ x: [x, x + 2], pool: 0 }),
    box: (o, room) => { const [a, b] = rangeX(o); const f = room.fluids?.[o.pool]; return [a, f ? f.bottom : 0, b - a + 1, 1]; },
    move: (o, x) => { const [a, b] = rangeX(o); o.x = [x, x + (b - a)]; }, text: () => 'balsa',
  },
  movers: {
    label: 'Plataforma móvil', color: '#ff80a0',
    make: (x, y) => ({ x, y, w: 3, path: [[6, 0]], speed: 40, pause: 0.6 }), box: (o) => [o.x, o.y, o.w ?? 3, 1], move: (o, x, y) => { o.x = x; o.y = y; }, text: () => 'móvil',
  },
  fluids: {
    label: 'Cubeta de fluido', color: '#3fd02a',
    make: (x, y) => ({ x: [x, x + 5], top: y, bottom: y + 3, manual: true, start: 0 }),
    box: (o) => { const [a, b] = rangeX(o); return [a, o.top, b - a + 1, o.bottom - o.top + 1]; },
    move: (o, x, y) => { const [a, b] = rangeX(o); const h = o.bottom - o.top; o.x = [x, x + (b - a)]; o.top = y; o.bottom = y + h; }, text: (o) => (o.manual ? 'cubeta manual' : 'cubeta'),
  },
  mouths: {
    label: 'Boca que escupe', color: '#ff9060',
    make: (x, y) => ({ x, y, dir: 'down', period: 4, duration: 1 }), box: (o) => [o.x, o.y, 1, 1], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => `boca ${o.dir}`,
  },
  drips: {
    label: 'Gotera de ácido', color: '#9be06a',
    make: (x, y) => ({ x, y, period: 2 }), box: (o) => [o.x, o.y, 1, 1], move: (o, x, y) => { o.x = x; o.y = y; }, text: () => 'gota',
  },
  traps: {
    label: 'Empalizada de hueso', color: '#e8dcc0',
    make: (x, y) => ({ x, y, n: 2, dir: 'up' }),
    box: (o) => { const n = o.n ?? 2, l = Math.ceil(o.len ?? 2.5); return o.dir === 'down' ? [o.x, o.y, n, l] : o.dir === 'left' ? [o.x - l + 1, o.y, l, n] : o.dir === 'right' ? [o.x, o.y, l, n] : [o.x, o.y - l + 1, n, l]; },
    move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => `estacas ${o.dir}${o.period ? ` ${o.period}s` : ''}`,
  },
  winds: {
    label: 'Corriente de aire', color: '#90f0e0',
    make: (x, y) => ({ x, y, w: 4, h: 6, dir: 'up' }), box: (o) => [o.x, o.y, o.w, o.h], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => `aire ${o.dir}`,
  },
  hints: {
    label: 'Pista (texto)', color: '#a0a0ff',
    make: (x, y) => ({ x, y, r: 3, text: 'Algo late aquí...' }), box: (o) => [o.x, o.y, 1, 1], move: (o, x, y) => { o.x = x; o.y = y; }, text: () => 'pista',
  },
  zones: {
    label: 'Zona etiquetada', color: '#40c0ff',
    make: (x, y) => ({ name: 'zona', x, y, w: 6, h: 4, color: '#40c0ff', note: '' }), box: (o) => [o.x, o.y, o.w, o.h], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => o.name,
  },
  exits: {
    label: 'Salida', color: '#ffffff',
    make: () => null, // las salidas se crean desde el panel de la sala
  },
};

// Orden de las claves al escribir una sala en levels.js.
export const KEY_ORDER = ['name', 'biome', 'secret', 'ambient', 'map', 'grid', 'sacs', 'enemies', 'nodules', 'hidden', 'gates', 'pads', 'pods', 'valves', 'floats', 'movers', 'fluids', 'mouths', 'drips', 'traps', 'winds', 'exits', 'hints', 'zones'];
