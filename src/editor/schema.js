// Qué sabe el editor de niveles sobre los datos de data/levels.js: los tiles que se
// pintan y los elementos que se colocan (con su posición, su caja y una plantilla).
import { ENEMIES } from '../data/enemies.js';
import { DECOR } from '../entities/Decor.js';
const decorBox = (o) => { const T = DECOR[o.type] ?? DECOR.neurona; return [Math.ceil(T.w / 16), Math.ceil(T.h / 16)]; };
import { MUTATIONS, DNA_CHARS } from '../data/mutations.js';

// Tiles: carácter, nombre y color en la vista esquemática.
export const TILES = [
  { c: '#', name: 'Pared (material del bioma)', color: '#6a2a40' },
  { c: '.', name: 'Aire', color: '#151018' },
  { c: '~', name: 'Ácido gástrico', color: '#3f8f2a' },
  { c: '^', name: 'Espinas óseas', color: '#d8c8a8' },
  { c: 'v', name: 'Abismo', color: '#000000' },
  { c: 'o', name: 'Garfio de anclaje (Tendón)', color: '#c86070' },
  { c: 'N', name: 'Nodo Seguro (útero)', color: '#3aff8a' },
  { c: 'X', name: 'Membrana agrietada (Embestida)', color: '#b04a6a' },
  { c: 'Y', name: 'Esfínter sellado (Tendón)', color: '#e07a9a' },
  { c: 'Z', name: 'Membrana del Rostro (se abre al liberarlo)', color: '#9a6ad0' },
  { c: 'K', name: 'Membrana del jefe (se abre al vencer al jefe de la zona)', color: '#d0603a' },
  { c: 'f', name: 'Membrana fotosensible (Ojo I)', color: '#c8a0c0' },
  { c: 'm', name: 'Mucosa resbaladiza', color: '#6a8a30' },
  { c: 'G', name: 'Velo de membrana (capa encima: no borra lo de debajo · clic derecho lo quita)', color: '#c890b0' },
  // Pendientes (core/Physics.js -> SLOPES): suelo inclinado, pared por debajo de la recta.
  { c: '/', name: 'Rampa 45° (sube a la derecha)', color: '#8a3a58', slope: [16, 0] },
  { c: 'k', name: 'Rampa 45° (sube a la izquierda)', color: '#8a3a58', slope: [0, 16] },
  { c: 'a', name: 'Rampa suave ↗ (mitad baja)', color: '#8a3a58', slope: [16, 8] },
  { c: 'A', name: 'Rampa suave ↗ (mitad alta)', color: '#8a3a58', slope: [8, 0] },
  { c: 'E', name: 'Rampa suave ↖ (mitad alta)', color: '#8a3a58', slope: [0, 8] },
  { c: 'e', name: 'Rampa suave ↖ (mitad baja)', color: '#8a3a58', slope: [8, 16] },
  // Rampas de techo (las de suelo volteadas: pared por encima de la recta). T voltea.
  { c: 'J', name: 'Techo 45° (baja a la derecha)', color: '#8a3a58', ceil: [0, 16] },
  { c: 'L', name: 'Techo 45° (baja a la izquierda)', color: '#8a3a58', ceil: [16, 0] },
  { c: 'r', name: 'Techo suave ↘ (mitad alta)', color: '#8a3a58', ceil: [0, 8] },
  { c: 'R', name: 'Techo suave ↘ (mitad baja)', color: '#8a3a58', ceil: [8, 16] },
  { c: 'w', name: 'Techo suave ↙ (mitad baja)', color: '#8a3a58', ceil: [16, 8] },
  { c: 'W', name: 'Techo suave ↙ (mitad alta)', color: '#8a3a58', ceil: [8, 0] },
  { c: 'b', name: 'Biomasa', color: '#e07a98', item: true },
  { c: 'B', name: 'Célula lumínica (batería)', color: '#ffd23f', item: true },
  { c: 'S', name: 'Hueso', color: '#e8dcc8', item: true },
  { c: 'O', name: 'Filtro de oxígeno', color: '#4ab8f0', item: true },
  { c: 'Q', name: 'Quiste (+20 biomasa máx)', color: '#d0a0ff', item: true },
  { c: 'h', name: 'Tejido sano (cura, quita la infección y 10 s de inmunidad)', color: '#ff9aa8', item: true },
  { c: 'u', name: 'Coágulo de plasma (se guarda; +30 integridad al usarlo)', color: '#ff3a4a', item: true },
  { c: 'g', name: 'Timo Necrótico', color: '#a0ffa0', item: true },
  { c: '*', name: 'Fragmento de ADN (tipo según el bioma y la casilla)', color: '#ff60ff', item: true },
  { c: 'i', name: 'Fragmento ocular (Ojo)', color: '#ff6aa8', item: true },
  { c: 'c', name: 'Fragmento neural (Cerebro)', color: '#ffd25a', item: true },
  { c: 'd', name: 'Fragmento dérmico (Dermis)', color: '#6fa0c8', item: true },
  { c: 'x', name: 'Fragmento óseo (Cañón)', color: '#ff4ad8', item: true },
  { c: 'P', name: 'Perla de Nácar (invulnerable)', color: '#4ff0ff', item: true },
  { c: 'C', name: 'Célula Madre (regenera)', color: '#3ac060', item: true },
  { c: 'H', name: 'El Corazón (final)', color: '#ff2040', item: true },
  ...Object.entries(DNA_CHARS).map(([c, id]) => ({ c, name: `ADN: ${MUTATIONS[id].name}`, color: MUTATIONS[id].color ?? '#ffffff', item: true })),
];
export const TILE_BY_CHAR = Object.fromEntries(TILES.map((t) => [t.c, t]));
export const SOLID = new Set(['#', 'X', 'f', 'Y', 'D', 'm', 'Z', 'K']);

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
    label: 'Nódulo (óseo o lumínico)', color: '#e8dcc8',
    make: (x, y) => [x, y], box: (o) => [...pt(o), 1, 1], move: (o, x, y) => { o[0] = x; o[1] = y; }, text: (o) => (o[2] === 'luz' ? 'nód·luz' : 'nód'),
  },
  // Luminaria colgante: cuelga del techo de la casilla; [col, fila, largo en px].
  lamps: {
    label: 'Luminaria colgante (luz tenue)', color: '#9affc8',
    make: (x, y) => [x, y], box: (o) => [...pt(o), 1, 1], move: (o, x, y) => { o[0] = x; o[1] = y; }, text: () => 'lámp',
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
  // Decoración: estructuras animadas del sistema nervioso (entities/Decor.js). (x, y) es
  // el centro de su base; las que cuelgan (haz nervioso), del techo de esa casilla.
  decor: {
    label: 'Decoración (sistema nervioso)', color: '#8a6ab8',
    make: (x, y) => ({ x, y, type: 'neurona', flip: false, front: false, invert: false }),
    // En una pared lateral va tumbada: ancho y alto cambian; (x, y) es la casilla pegada a
    // esa pared, a media altura.
    box: (o) => {
      const [w, h] = decorBox(o);
      if (o.side === 'left') return [o.x, o.y - Math.floor((w - 1) / 2), h, w];
      if (o.side === 'right') return [o.x - h + 1, o.y - Math.floor((w - 1) / 2), h, w];
      return [o.x - Math.floor((w - 1) / 2), o.invert ? o.y : o.y - h + 1, w, h];
    },
    move: (o, x, y) => {
      const [w, h] = decorBox(o);
      if (o.side === 'left') { o.x = x; o.y = y + Math.floor((w - 1) / 2); return; }
      if (o.side === 'right') { o.x = x + h - 1; o.y = y + Math.floor((w - 1) / 2); return; }
      o.x = x + Math.floor((w - 1) / 2); o.y = o.invert ? y : y + h - 1;
    },
    text: (o) => `${DECOR[o.type]?.name ?? o.type}${o.side === 'left' ? ' (pared izq.)' : o.side === 'right' ? ' (pared der.)' : o.invert ? ' (techo)' : ''}`,
  },
  // Evento de texto: al entrar en la zona salta un diálogo (se queda hasta que el jugador
  // pasa) o un aviso (se va solo). once: solo la primera vez.
  texts: {
    label: 'Evento de texto (zona)', color: '#ffe08a',
    make: (x, y) => ({ x, y, w: 3, h: 3, mode: 'dialogo', speaker: '', lines: ['Escribe aquí el texto.'], once: true }),
    box: (o) => [o.x, o.y, o.w ?? 1, o.h ?? 1], move: (o, x, y) => { o.x = x; o.y = y; },
    text: (o) => `${o.mode === 'aviso' ? 'aviso' : 'diálogo'}${o.when ? (o.when === 'antes' ? ' · antes de ' : ' · tras ') + (o.boss ?? '?') : ''}${o.speaker ? ' · ' + o.speaker : ''}${o.once === false ? ' ↻' : ''}`
  },
  // Rostro del Anfitrión (entities/Face.js, textos en data/faces.js): altar de 18x15 casillas;
  // (x, y) es el centro de su base. front: delante de las paredes (si no, de fondo).
  faces: {
    label: 'Rostro del Anfitrión (lore)', color: '#ffd27a',
    make: (x, y) => ({ x, y, front: false }), box: (o) => [o.x - 8, o.y - 14, 18, 15], move: (o, x, y) => { o.x = x + 8; o.y = y + 14; }, text: (o) => `rostro del anfitrión${o.boss ? ' → ' + o.boss : ''}${o.front ? ' (delante)' : ''}`,
  },
  // Bufador (entities/Bellows.js): estructura de 4x4 que inspira y sopla una corriente de
  // `reach` casillas hacia dir (right, left, up, down). (x, y): su casilla de arriba a la izquierda.
  bellows: {
    label: 'Bufador (sopla aire)', color: '#a0d8ff',
    make: (x, y) => ({ x, y, dir: 'right', reach: 10, period: 4.5 }), box: (o) => [o.x, o.y, 4, 4], move: (o, x, y) => { o.x = x; o.y = y; },
    text: (o) => `bufador → ${o.dir ?? 'right'} ${o.reach ?? 10}`,
  },
  winds: {
    label: 'Corriente de aire', color: '#90f0e0',
    make: (x, y) => ({ x, y, w: 4, h: 6, dir: 'up' }), box: (o) => [o.x, o.y, o.w, o.h], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => `aire ${o.dir}`,
  },
  // Sistema circulatorio (entities/Blood.js): todo late al mismo pulso.
  blood: {
    label: 'Charca de sangre (late)', color: '#e0304a',
    make: (x, y) => ({ x: [x, x + 8], top: y, bottom: y + 3, base: 0.4, surge: 0.3, flow: 'right' }),
    box: (o) => { const [a, b] = rangeX(o); return [a, o.top, b - a + 1, o.bottom - o.top + 1]; },
    move: (o, x, y) => { const [a, b] = rangeX(o); const h = o.bottom - o.top; o.x = [x, x + (b - a)]; o.top = y; o.bottom = y + h; }, text: (o) => `sangre ${o.flow ?? ''}`,
  },
  arteries: {
    label: 'Arteria (chorro a presión)', color: '#ff6070',
    make: (x, y) => ({ x, y, dir: 'up', power: 1 }), box: (o) => [o.x, o.y, 1, 1], move: (o, x, y) => { o.x = x; o.y = y; }, text: (o) => `arteria ${o.dir}`,
  },
  heartValves: {
    label: 'Válvula cardíaca (paso con ritmo)', color: '#ff90a0',
    make: (x, y) => ({ x, y, h: 3, open: 0.5 }), box: (o) => [o.x, o.y, 1, o.h], move: (o, x, y) => { o.x = x; o.y = y; }, text: () => 'válvula',
  },
  ventricles: {
    label: 'Ventrículo (decorado que bombea)', color: '#c02040',
    make: (x, y) => ({ x, y, r: 28 }), box: (o) => { const t = Math.round((o.r ?? 28) / 16); return [o.x - t, o.y - t, t * 2 + 1, t * 2 + 1]; }, move: (o, x, y) => { const t = Math.round((o.r ?? 28) / 16); o.x = x + t; o.y = y + t; }, text: () => 'ventrículo',
  },
  // Punto de conexión (entities/Link.js): lleva a otro punto de cualquier sala, o es
  // solo un punto de llegada (sin destino). Ida y vuelta: dos puntos que se apuntan.
  links: {
    label: 'Punto de conexión (lleva a otro punto)', color: '#40e0ff',
    make: (x, y, room) => {
      const used = new Set((room.links ?? []).map((l) => l.id));
      let n = 1; while (used.has('p' + n)) n++;
      return { id: 'p' + n, x, y: y - 1, w: 1, h: 2, to: '', toLink: '', trigger: 'use', look: 'portal' };
    },
    box: (o) => [o.x, o.y, o.w ?? 1, o.h ?? 2], move: (o, x, y) => { o.x = x; o.y = y; },
    text: (o) => (o.to ? o.id : `${o.id} (sin destino)`), // el destino lo rotula Editor como una salida ("→ sala")
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
export const KEY_ORDER = ['name', 'biome', 'secret', 'ambient', 'map', 'grid', 'sacs', 'enemies', 'nodules', 'hidden', 'gates', 'pads', 'pods', 'valves', 'floats', 'movers', 'fluids', 'mouths', 'drips', 'traps', 'winds', 'bellows', 'faces', 'texts', 'decor', 'veil', 'blood', 'arteries', 'heartValves', 'ventricles', 'links', 'exits', 'hints', 'zones'];
