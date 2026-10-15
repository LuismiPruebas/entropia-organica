import { TILE } from '../core/Physics.js';

// Pinta procedimentalmente cada sala: un mundo de carne, con el tejido, la paleta y
// los brotes propios de su bioma (data/biomes.js). Nada mecánico: solo el
// protagonista es biomecánico.
// Devuelve un lienzo de color y otro de brillo.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (x, y, s = 0) => (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);

const C = {
  flesh: '#7a1a2a',
  fleshLight: '#b0283a',
  fleshDark: '#4a0f1a',
  vein: '#5c1020',
  membrane: ['#8a5a5a', '#9a6a62', '#7a4e50'],
  crack: '#2a1418',
  bone: '#d8cdb0',
  boneDark: '#8a7e64',
  acid: '#3f8f2a',
  acidLight: '#9be06a',
  acidDark: '#24561a',
};
const BASE_C = { ...C };

const px = (g, x, y, color, w = 1, h = 1) => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

const isWallChar = (c) => c === '#' || c === 'X' || c === 'f' || c === 'Y' || c === 'z' || c === 'm';

// Mucosa resbaladiza (m): pared cubierta de moco brillante. Se pinta como la pared y
// encima un barniz verdoso con regueros que relucen (las Garras no se agarran).
function paintMucus(g, gl, cx, cy, ox, oy) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(110, 150, 50, 0.38)';
  g.fillRect(ox, oy, TILE, TILE);
  const r = (k) => ((cx * 73 + cy * 37 + k * 11) % 16 + 16) % 16;
  for (let k = 0; k < 3; k++) {
    const x = ox + r(k), len = 3 + (r(k + 5) % 8);
    g.fillStyle = 'rgba(210, 250, 150, 0.55)';
    g.fillRect(x, oy + r(k + 2) % 8, 1, len);
    px(gl, x, oy + r(k + 2) % 8 + len - 1, '#1a3a0a');
  }
  g.restore();
}

// Textura de una membrana fotosensible cerrada (un grupo de celdas): tejido casi
// idéntico a la pared de su bioma, salvo unos receptores pálidos. Se llama justo después de paintRoom
// (usa su material y su paleta). Devuelve el lienzo y su posición en la sala.
export function paintPhotoTexture(world, cells) {
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const canvas = document.createElement('canvas');
  canvas.width = (x1 - x0 + 1) * TILE; canvas.height = (y1 - y0 + 1) * TILE;
  const g = canvas.getContext('2d');
  // Para el dibujo, la membrana cuenta como pared (sus vecinas también lo son).
  const fake = { get: (x, y) => (cells.some(([a, b]) => a === x && b === y) ? '#' : world.get(x, y)) };
  for (const [cx, cy] of cells) {
    const ox = (cx - x0) * TILE, oy = (cy - y0) * TILE;
    paintWall(g, fake, cx, cy, ox, oy);
    const r = rng(hash(cx, cy, 5));
    for (let i = 0; i < 4; i++) {
      const x = ox + 2 + Math.floor(r() * 11), y = oy + 3 + Math.floor(r() * 10);
      px(g, x, y, '#4a2a3a', 3, 2);
      px(g, x + 1, y, '#d8b0c0');
    }
  }
  return { canvas, x: x0 * TILE, y: y0 * TILE };
}

// --- Materiales de pared por bioma -------------------------------------------
// Cada bioma construye sus paredes con un tejido distinto (data/biomes.js -> material).

// Colores saturados y sin negros: lo más hondo sigue siendo un color de su familia.
const MATERIALS = {
  // Sistema Nervioso (violeta y magenta): haces de fibras estriadas con vainas de mielina.
  fibrous: {
    base: ['#7a2a62', '#8a3472', '#6a2256'], groove: '#3e1438', deep: '#2e1030',
    myelin: '#c070b0', light: '#f0a8e0', outline: '#2a0c28',
    pulse: null, // sin venas que laten: su azul se confundía con los impulsos de las neuronas del fondo
  },
  // Cavidad Pulmonar (turquesa y coral): tejido esponjoso cuajado de alvéolos.
  spongy: {
    base: ['#2e8a7e', '#2a7e74', '#246e66'], groove: '#12403e', deep: '#164a48',
    myelin: '#6ac8b4', light: '#b8f8e4', tissue: '#e0788a', outline: '#0e3634',
    pulse: 'rgba(255,150,175,0.7)',
  },
  // Digestivo (ámbar y mostaza): mucosa intestinal con pliegues, criptas y vellosidades.
  villous: {
    base: ['#8a7622', '#7c6a1c', '#96822c'], groove: '#3a2a0c', deep: '#2e2208',
    myelin: '#c8b040', light: '#e8d070', tissue: '#8a5e1e', outline: '#24180a',
    mucus: '#b8a830', mucusL: '#f0e48a',
    pulse: null, // sin venas que laten: la estela de luz no encajaba
  },
  // Territorio del Hueso (sepia y marfil): hueso compacto con poros y grietas.
  osseous: {
    base: ['#b8a07e', '#c8b090', '#a68e6c'], groove: '#5a3e2c', deep: '#4a3022',
    myelin: '#e0d0b0', light: '#f4ead4', tissue: '#7a2a20', outline: '#3a2216',
    pulse: 'rgba(255,170,130,0.6)',
  },
  // El Corazón (carmesí): músculo estriado con grasa.
  muscle: {
    base: ['#9a1a2c', '#aa2236', '#8a1426'], groove: '#4e0816', deep: '#40060f',
    myelin: '#c83a4c', light: '#f07080', fat: '#f0b080', outline: '#2e0408',
    pulse: 'rgba(255,60,80,0.75)',
  },
};
let MAT = 'fibrous';

// --- Carne escamada (Digestivo) -------------------------------------------------
// Escamas de carne como empedrado, calculadas en coordenadas del MUNDO (no por tile):
// la textura es continua entre casillas. Cada escama es un abombado con luz arriba a
// la izquierda, un brillo húmedo y una grieta oscura alrededor. depth 0..1 la apaga
// hacia el interior de la roca.
const SCALE = 7; // px por escama (aprox.)
const SCALE_PAL = ['#8a7622', '#7c6a1c', '#96822c', '#8a5e1e', '#73621a'].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
function scaleAt(X, Y) {
  const ci = Math.floor(X / SCALE), cj = Math.floor(Y / SCALE);
  let f1 = 99, f2 = 99, id = 0, dx = 0, dy = 0;
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const h = Math.abs(hash(i, j, 77));
    // Filas desplazadas a medias (como ladrillo) y algo de jitter: escamas, no rejilla.
    const sx = i * SCALE + (j & 1 ? SCALE / 2 : 0) + ((h % 97) / 97 - 0.5) * 3;
    const sy = j * SCALE + (((h >> 7) % 89) / 89 - 0.5) * 3;
    const ddx = X - sx, ddy = (Y - sy) * 1.15, d = Math.hypot(ddx, ddy);
    if (d < f1) { f2 = f1; f1 = d; id = h; dx = ddx; dy = ddy; } else if (d < f2) f2 = d;
  }
  return { edge: f2 - f1, id, dx, dy, f1 };
}
function scaleRGB(X, Y, depth = 0) {
  const s = scaleAt(X, Y);
  if (s.edge < 1.1) return [36 - depth * 14, 24 - depth * 10, 8 - depth * 4];        // grieta
  const base = SCALE_PAL[s.id % SCALE_PAL.length];
  // Abombado: luz arriba-izquierda, sombra abajo-derecha; brillo húmedo cerca de la cresta.
  const lit = Math.max(-1, Math.min(1, -(s.dx * 0.8 + s.dy) / (SCALE * 0.6)));
  let k = 0.82 + lit * 0.32 - (s.edge < 2 ? 0.18 : 0);
  if (lit > 0.55 && s.f1 > 1 && s.f1 < 3.2) k = 1.55;                             // brillo
  k *= 1 - depth * 0.62;
  return [Math.min(255, base[0] * k), Math.min(255, base[1] * k), Math.min(255, base[2] * k)];
}
function paintScales(g, ox, oy, w, h, depth = 0) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, gg, b] = scaleRGB(ox + x, oy + y, depth);
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.fillRect(ox + x, oy + y, 1, 1);
  }
}

function paintWall(g, world, cx, cy, ox, oy) {
  const m = MATERIALS[MAT], r = rng(hash(cx, cy, 1));
  const open = (dx, dy) => !isWallChar(world.get(cx + dx, cy + dy));
  const top = open(0, -1), left = open(-1, 0), right = open(1, 0);
  const exposed = top || open(0, 1) || left || right;
  if (!exposed && MAT === 'villous') { paintScales(g, ox, oy, TILE, TILE, 0.35); return; }
  if (!exposed) {
    px(g, ox, oy, m.deep, TILE, TILE);
    if (r() < 0.3) px(g, ox + 2 + Math.floor(r() * 12), oy + 2 + Math.floor(r() * 12), m.groove, 2, 1);
    return;
  }
  if (MAT === 'fibrous') {
    // Fibras verticales con surcos y cuentas de mielina a distintas alturas.
    for (let x = 0; x < 16; x++) {
      const col = (x + cx * 16) % 5 === 0 ? m.groove : m.base[Math.floor(((x + cx * 16) / 2)) % 3];
      px(g, ox + x, oy, col, 1, 16);
    }
    for (let k = 0; k < 3; k++) {
      const x = ox + 1 + Math.floor(r() * 12), y = oy + Math.floor(r() * 14);
      px(g, x, y, m.myelin, 3, 2);
      px(g, x + 1, y, m.light);
    }
  } else if (MAT === 'spongy') {
    // Masa de tejido con alvéolos (burbujas huecas).
    px(g, ox, oy, m.base[Math.floor(r() * 3)], TILE, TILE);
    for (let i = 0; i < 10; i++) px(g, ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), m.tissue);
    for (let k = 0; k < 4; k++) {
      const bx = ox + 3 + Math.floor(r() * 10), by = oy + 3 + Math.floor(r() * 10), rad = 2 + Math.floor(r() * 2);
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
        const d = Math.hypot(x, y);
        if (d <= rad) px(g, bx + x, by + y, d > rad - 1 ? m.light : m.groove);
      }
    }
  } else if (MAT === 'villous') {
    // Carne escamada como empedrado (continua entre casillas: coordenadas del mundo).
    paintScales(g, ox, oy, TILE, TILE, 0);
  } else if (MAT === 'osseous') {
    // Hueso compacto: marfil moteado con poros hondos de borde claro y alguna grieta.
    px(g, ox, oy, m.base[Math.floor(r() * 3)], TILE, TILE);
    for (let i = 0; i < 14; i++) px(g, ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), m.base[Math.floor(r() * 3)]);
    for (let k = 0; k < 3; k++) {
      const bx = ox + 2 + Math.floor(r() * 11), by = oy + 2 + Math.floor(r() * 11), rad = 1 + Math.floor(r() * 2);
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
        const d = Math.hypot(x, y);
        if (d <= rad) px(g, bx + x, by + y, d > rad - 0.8 ? m.light : m.groove);
      }
    }
    if (r() < 0.4) { let x = ox + Math.floor(r() * 16); for (let y = 0; y < 8; y++) { px(g, x, oy + y, m.groove); x += Math.floor(r() * 3) - 1; } }
  } else if (MAT === 'muscle') {
    // Músculo estriado horizontal con betas de grasa.
    for (let y = 0; y < 16; y++) {
      const wave = Math.round(Math.sin((ox + y * 3) / 9));
      px(g, ox, oy + y, Math.floor((y + wave + cy * 16) / 2) % 2 ? m.base[1] : m.myelin, 16, 1);
    }
    if (r() < 0.35) {
      const fx = ox + 2 + Math.floor(r() * 10), fy = oy + 2 + Math.floor(r() * 10);
      px(g, fx, fy, m.fat, 4, 3);
      px(g, fx + 1, fy - 1, m.fat, 2, 1);
    }
  }
  // Borde superior vivo y sombras laterales.
  if (top) {
    px(g, ox, oy, m.groove, 16, 1);
    if (MAT !== 'villous') px(g, ox, oy + 1, m.light, 16, 1); // las escamas ya tienen su brillo
  }
  if (left) px(g, ox, oy, m.outline, 1, 16);
  if (right) px(g, ox + 15, oy, m.outline, 1, 16);
}

// --- Orificios de salida en techo y suelo -------------------------------------
// Un hueco en la fila superior o inferior es una salida vertical. Se dibuja como
// un esfínter carnoso que brilla, para que se lea de un vistazo como un camino.

export function findHoles(world) {
  const holes = [];
  for (const [row, dir] of [[0, -1], [world.h - 1, 1]]) {
    let start = -1;
    for (let x = 0; x <= world.w; x++) {
      const open = x < world.w && !isWallChar(world.get(x, row)) && world.get(x, row) !== 'v';
      if (open && start < 0) start = x;
      if (!open && start >= 0) {
        holes.push({ x0: start, x1: x - 1, row, dir, cx: ((start + x) / 2) * TILE, y: dir < 0 ? 0 : world.pixelH });
        start = -1;
      }
    }
  }
  return holes;
}

function paintOrifice(g, gl, { x0, x1, row, dir }) {
  const left = x0 * TILE, right = (x1 + 1) * TILE, y = row * TILE;
  for (let i = 0; i < 16; i++) {
    const yy = dir < 0 ? y + i : y + 15 - i;
    const lip = Math.round(4 - Math.abs(i - 8) / 2.5); // labios que se cierran hacia el centro
    // Labios carnosos a ambos lados del hueco.
    for (const [x, s] of [[left, 1], [right, -1]]) {
      for (let k = 0; k < lip; k++) {
        const xx = s > 0 ? x + k : x - 1 - k;
        g.fillStyle = k === lip - 1 ? '#e08090' : k % 2 ? '#a83a52' : '#c05068';
        g.fillRect(xx, yy, 1, 1);
      }
      gl.fillStyle = 'rgba(255,170,150,0.55)';
      gl.fillRect(s > 0 ? x + lip - 1 : x - lip, yy, 1, 1);
    }
  }
  // Un halo cálido dentro del hueco: por ahí se respira otra sala.
  gl.fillStyle = 'rgba(255,190,150,0.10)';
  gl.fillRect(left, y, right - left, 16);
}

// --- Masa interior -------------------------------------------------------------
// El interior de las paredes no es un hueco negro: es carne maciza que se oscurece con
// la profundidad sin perder el color de su zona (como en un bodegón de carne), con
// vetas de grasa, fibras y venas continuas entre tiles. near = junto al borde,
// far = lo más hondo; marble = vetas; fat = grasa; vein = venas oscuras.
const MASS = {
  fibrous: { near: '#7a2a66', far: '#4e1a4c', marble: '#a8448a', fat: '#d898c8', vein: '#4a2a80' },
  spongy: { near: '#2a7a70', far: '#1c5a56', marble: '#44a094', fat: '#e8909e', vein: '#8a3050' },
  villous: { near: '#9a6018', far: '#6c4210', marble: '#bc8632', fat: '#f4c868', vein: '#7a4060' },
  osseous: { near: '#8a6a50', far: '#5a3e2e', marble: '#b09070', fat: '#e0d0b0', vein: '#6a2018' },
  muscle: { near: '#961a2a', far: '#640e1c', marble: '#bc3044', fat: '#f4b888', vein: '#6a0c1e' },
};
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Distancia (en tiles) de cada pared al aire más cercano.
function wallDepth(world) {
  const D = new Int16Array(world.w * world.h).fill(99);
  const q = [];
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    if (!isWallChar(world.get(x, y))) { D[y * world.w + x] = 0; q.push([x, y]); }
  }
  while (q.length) {
    const [x, y] = q.shift(), d = D[y * world.w + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
      const i = ny * world.w + nx;
      if (D[i] > d + 1) { D[i] = d + 1; q.push([nx, ny]); }
    }
  }
  return D;
}

// Ruido suave (valor interpolado) para la carne: vetas y grasa sin patrones repetidos.
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (a, b) => (Math.abs(hash(a, b, seed)) % 1000) / 1000;
  const s = (t) => t * t * (3 - 2 * t);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  const u = s(fx), v = s(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.6 + valueNoise(x * 2.1, y * 2.1, seed + 1) * 0.3 + valueNoise(x * 4.3, y * 4.3, seed + 2) * 0.1;
}

function paintMasses(g, world) {
  const M = MASS[MAT] ?? MASS.fibrous;
  const near = hexRgb(M.near), far = hexRgb(M.far), marble = hexRgb(M.marble), fat = hexRgb(M.fat), vein = hexRgb(M.vein);
  const D = wallDepth(world);
  const W = world.w * TILE, H = world.h * TILE;
  // Profundidad continua: la máscara de paredes desenfocada (lejos del borde, más alta).
  // Campo suave y amplio: se calcula a 1/4 de resolución y se amplía (no se nota).
  const deep = blurField(tileMask(world, isWallChar, 4), W / 4, H / 4, 14 / 4, 4);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let cy = 0; cy < world.h; cy++) for (let cx = 0; cx < world.w; cx++) {
    const c = world.get(cx, cy);
    if ((c !== '#' && c !== 'm') || D[cy * world.w + cx] < 2) continue; // el borde lo pinta su material
    for (let py = 0; py < TILE; py++) for (let pxl = 0; pxl < TILE; pxl++) {
      const x = cx * TILE + pxl, y = cy * TILE + py;
      const k = Math.min(1, Math.max(0, (deep[y * W + x] - 0.62) / 0.36));
      if (MAT === 'villous') {
        const sc = scaleRGB(x, y, 0.2 + k * 0.7), i = (y * W + x) * 4;
        d[i] = sc[0]; d[i + 1] = sc[1]; d[i + 2] = sc[2]; d[i + 3] = 255;
        continue;
      }
      let col = [near[0] + (far[0] - near[0]) * k, near[1] + (far[1] - near[1]) * k, near[2] + (far[2] - near[2]) * k];
      const mixc = (c2, a) => { col = [col[0] + (c2[0] - col[0]) * a, col[1] + (c2[1] - col[1]) * a, col[2] + (c2[2] - col[2]) * a]; };
      // Vetas: crestas del ruido deformado; grasa en las manchas altas; venas finas.
      const wx = x / 26 + fbm(x / 40, y / 40, 3) * 1.6, wy = y / 26 + fbm(x / 40 + 7, y / 40, 4) * 1.6;
      const n = fbm(wx, wy, 5);
      const ridge = Math.abs(n - 0.5);
      if (n > 0.68) mixc(fat, Math.min(0.55, (n - 0.68) * 4) * (1 - k * 0.5));
      if (ridge < 0.025) mixc(marble, 0.6 * (1 - k * 0.4));
      const vn = Math.abs(fbm(x / 18 + 30, y / 18, 9) - 0.5);
      if (vn < 0.012) mixc(vein, 0.75);
      mixc(far, (valueNoise(x / 3, y / 3, 11) - 0.5) * 0.25 + 0.05); // grano
      const i = (y * W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// --- Silueta orgánica -----------------------------------------------------------
// La colisión es de tiles; el dibujo no. Se calcula cuánta carne hay alrededor de
// cada píxel (desenfoque gaussiano de la máscara de paredes) y se corta por la mitad:
// las esquinas salientes salen como curvas amplias, los rincones se rellenan, las
// barras finas terminan en punta redondeada y todo queda unido, como carne. Después
// se repinta el contorno a lo largo del borde nuevo.
const SIGMA = 5.5; // px: cuánto se redondea (más = curvas más amplias, más desajuste)

// Máscara de la sala (1 donde fn(tile) es cierto), a TILE/div píxeles por casilla.
function tileMask(world, fn, div) {
  const T = TILE / div, W = world.w * T, H = world.h * T;
  const mask = new Float32Array(W * H);
  for (let cy = 0; cy < world.h; cy++) for (let cx = 0; cx < world.w; cx++) {
    if (!fn(world.get(cx, cy))) continue;
    for (let y = cy * T; y < (cy + 1) * T; y++) mask.fill(1, y * W + cx * T, y * W + (cx + 1) * T);
  }
  return mask;
}

// Desenfoque gaussiano separable. Fuera de la sala cuenta como carne (las paredes
// continúan): cada fila o columna se copia a un búfer con margen relleno a 1, así el
// bucle interior no comprueba bordes. Con up > 1, el campo se calcula a baja
// resolución y se amplía con interpolación bilineal.
function blurField(src, W, H, sigma, up = 1) {
  const R = Math.ceil(sigma * 2.5);
  const k = new Float32Array(2 * R + 1);
  let sum = 0;
  for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + R] = v; sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const n = k.length;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  const row = new Float32Array(W + 2 * R).fill(1);
  for (let y = 0; y < H; y++) {
    row.set(src.subarray(y * W, y * W + W), R);
    for (let x = 0; x < W; x++) { let s = 0; for (let i = 0; i < n; i++) s += row[x + i] * k[i]; tmp[y * W + x] = s; }
  }
  const col = new Float32Array(H + 2 * R).fill(1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) col[y + R] = tmp[y * W + x];
    for (let y = 0; y < H; y++) { let s = 0; for (let i = 0; i < n; i++) s += col[y + i] * k[i]; out[y * W + x] = s; }
  }
  if (up === 1) return out;
  const W2 = W * up, H2 = H * up, big = new Float32Array(W2 * H2);
  for (let y = 0; y < H2; y++) {
    const fy = Math.min(H - 1, Math.max(0, (y + 0.5) / up - 0.5)), y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W2; x++) {
      const fx = Math.min(W - 1, Math.max(0, (x + 0.5) / up - 0.5)), x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), tx = fx - x0;
      const a = out[y0 * W + x0] + (out[y0 * W + x1] - out[y0 * W + x0]) * tx;
      const c = out[y1 * W + x0] + (out[y1 * W + x1] - out[y1 * W + x0]) * tx;
      big[y * W2 + x] = a + (c - a) * ty;
    }
  }
  return big;
}

function organicSilhouette(g, world) {
  const m = MATERIALS[MAT];
  const W = world.w * TILE, H = world.h * TILE;
  // Lo que pertenece al cuerpo de la sala (pared y mucosa). El resto de lo sólido
  // (membranas, sellos, paredes falsas, compuertas) cuenta como carne para la forma,
  // pero no se recorta ni se pinta encima: tiene su propio dibujo.
  const body = (c) => c === '#' || c === 'm';
  const solidish = (c) => isWallChar(c) || c === 'D';
  const f = blurField(tileMask(world, solidish, 1), W, H, SIGMA);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const src = new Uint8ClampedArray(d); // copia: de aquí se toma el color de la carne
  const inside = (x, y) => f[y * W + x] >= 0.5;
  const tileOf = (x, y) => world.get(Math.floor(x / TILE), Math.floor(y / TILE));
  // Color de carne más cercano (para rellenar los rincones).
  const nearestFlesh = (x, y) => {
    for (let r = 1; r <= 10; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = (ny * W + nx) * 4;
      if (body(tileOf(nx, ny)) && src[i + 3] > 0) return i;
    }
    return -1;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = tileOf(x, y), i = (y * W + x) * 4, inn = inside(x, y);
    if (body(c) && !inn) d[i + 3] = 0;                             // esquina saliente: fuera
    else if (c === '.' && inn) {                                    // rincón: se rellena de carne
      const j = nearestFlesh(x, y);
      if (j >= 0) { d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2]; d[i + 3] = 255; }
    }
  }
  // Contorno continuo por el borde nuevo (solo en la carne de la sala).
  const oc = parseInt(m.outline.slice(1), 16);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!d[i + 3] || !inside(x, y)) continue;
    const c = tileOf(x, y);
    if (!body(c) && c !== '.') continue;
    const edge = (x > 0 && !inside(x - 1, y)) || (x < W - 1 && !inside(x + 1, y)) || (y > 0 && !inside(x, y - 1)) || (y < H - 1 && !inside(x, y + 1));
    if (edge) { d[i] = (oc >> 16) & 255; d[i + 1] = (oc >> 8) & 255; d[i + 2] = oc & 255; d[i + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
}

// --- Pasada orgánica: sin ángulos rectos ---------------------------------------
// Superficies que brotan hacia el aire (dendritas, cilios, vellosidades, pliegues).
// El redondeo de esquinas y rincones lo hace organicSilhouette.

function organicPass(g, pl, world) {
  const m = MATERIALS[MAT];
  const wall = (x, y) => isWallChar(world.get(x, y));
  const inRoom = (x, y) => x >= 0 && y >= 0 && x < world.w && y < world.h;
  // Superficies vivas: lo que brota de suelos, techos y paredes hacia el aire.
  for (let cy = 0; cy < world.h; cy++) {
    for (let cx = 0; cx < world.w; cx++) {
      if (world.get(cx, cy) !== '#') continue;
      const r = rng(hash(cx, cy, 11));
      const ox = cx * TILE, oy = cy * TILE;
      const air = (dx, dy) => inRoom(cx + dx, cy + dy) && !wall(cx + dx, cy + dy) && world.get(cx + dx, cy + dy) === '.';
      if (air(0, -1)) growUp(g, ox, oy, r, m);
      if (air(0, 1)) growDown(g, ox, oy + 16, r, m);
      if (air(-1, 0) && r() < 0.5) bulge(g, ox - 1, oy + 3 + Math.floor(r() * 9), -1, r, m);
      if (air(1, 0) && r() < 0.5) bulge(g, ox + 16, oy + 3 + Math.floor(r() * 9), 1, r, m);
      // Capa de pulso: venas cortas pegadas a la superficie que laten al ritmo del bioma.
      if (!m.pulse) continue;
      if (air(0, -1) && r() < 0.3) {
        let x = ox + 2 + Math.floor(r() * 10), y = oy + 2;
        for (let i = 0; i < 5; i++) { px(pl, x, y, m.pulse); x += 1; if (r() < 0.4) y += r() < 0.5 ? -1 : 1; y = Math.max(oy + 1, Math.min(oy + 4, y)); }
      } else if ((air(-1, 0) || air(1, 0)) && r() < 0.2) {
        let x = air(-1, 0) ? ox + 2 : ox + 13, y = oy + 3 + Math.floor(r() * 6);
        for (let i = 0; i < 4; i++) { px(pl, x, y, m.pulse); y += 1; if (r() < 0.4) x += r() < 0.5 ? -1 : 1; }
      }
    }
  }
}

// Brotes desde un suelo hacia arriba (y = borde superior del tile de pared).
function growUp(g, ox, y, r, m) {
  if (MAT === 'fibrous') {
    // Terminaciones dendríticas: filamentos que se ramifican.
    for (let k = 0; k < 2; k++) {
      if (r() < 0.4) continue;
      let x = ox + 2 + Math.floor(r() * 12);
      const len = 3 + Math.floor(r() * 5);
      for (let i = 1; i <= len; i++) {
        px(g, x, y - i, i === len ? m.light : m.myelin);
        if (i === Math.floor(len / 2)) px(g, x + (r() < 0.5 ? -1 : 1), y - i - 1, m.myelin);
        if (r() < 0.3) x += r() < 0.5 ? -1 : 1;
      }
    }
  } else if (MAT === 'spongy') {
    // Bosque de cilios.
    for (let x = 0; x < 16; x += 2) {
      const h = 1 + Math.floor(r() * 4);
      px(g, ox + x, y - h, r() < 0.5 ? m.light : m.tissue, 1, h);
    }
  } else if (MAT === 'villous') {
    // Película de mucosa sobre el suelo: un charquito brillante de vez en cuando.
    if (r() < 0.35) {
      const x = ox + 1 + Math.floor(r() * 9), w = 3 + Math.floor(r() * 5);
      px(g, x, y - 1, m.mucus, w, 1);
      px(g, x + 1, y - 1, m.mucusL, Math.max(1, w - 3), 1);
    }
  } else if (MAT === 'osseous') {
    // Espolones: pinchos de hueso cortos (no hieren).
    for (let k = 0; k < 2; k++) {
      if (r() < 0.45) continue;
      const x = ox + 2 + Math.floor(r() * 11), h = 2 + Math.floor(r() * 4);
      for (let i = 0; i < h; i++) px(g, x + (i > h / 2 ? 0 : 0), y - 1 - i, i === h - 1 ? m.light : m.myelin, i < h / 2 ? 2 : 1, 1);
    }
  } else if (MAT === 'muscle') {
    // Pliegues redondeados.
    if (r() < 0.6) {
      const x = ox + 3 + Math.floor(r() * 9), rad = 2 + Math.floor(r() * 2);
      for (let yy = 0; yy < rad; yy++) for (let xx = -rad; xx <= rad; xx++) {
        if (Math.hypot(xx, yy + 0.5) <= rad) px(g, x + xx, y - 1 - yy, yy === rad - 1 ? m.light : m.myelin);
      }
    }
  }
}

// Lo que cuelga de un techo (y = borde inferior del tile de pared).
function growDown(g, ox, y, r, m) {
  if (MAT === 'fibrous') {
    if (r() < 0.6) {
      let x = ox + 2 + Math.floor(r() * 12);
      const len = 3 + Math.floor(r() * 8);
      for (let i = 0; i < len; i++) {
        px(g, x, y + i, i === len - 1 ? m.light : m.groove);
        if (r() < 0.25) x += r() < 0.5 ? -1 : 1;
      }
    }
  } else if (MAT === 'spongy') {
    if (r() < 0.45) {
      const x = ox + 3 + Math.floor(r() * 9), h = 3 + Math.floor(r() * 3);
      px(g, x + 1, y, m.tissue, 1, 1);
      px(g, x, y + 1, m.tissue, 3, h);
      px(g, x + 1, y + 1, m.light, 1, h - 1);
    }
  } else if (MAT === 'villous') {
    for (let k = 0; k < 2; k++) {
      if (r() < 0.45) continue;
      const x = ox + 1 + Math.floor(r() * 13), len = 2 + Math.floor(r() * 7);
      px(g, x, y, m.outline, 2, 1);
      px(g, x, y, m.mucus, 1, len);                         // hilo
      px(g, x - 1, y + len, m.outline, 3, 3);               // gota
      px(g, x - 1, y + len, m.mucus, 2, 2);
      px(g, x - 1, y + len, m.mucusL);                      // brillo de la gota
    }
  } else if (MAT === 'osseous') {
    // Astillas de hueso colgando del techo, con un goterón de sangre seca.
    if (r() < 0.45) {
      const x = ox + 2 + Math.floor(r() * 12), len = 2 + Math.floor(r() * 5);
      for (let i = 0; i < len; i++) px(g, x, y + i, i === len - 1 ? m.light : m.myelin, i < len / 2 ? 2 : 1, 1);
      if (r() < 0.3) px(g, x + 3, y, m.tissue, 1, 2 + Math.floor(r() * 3));
    }
  } else if (MAT === 'muscle') {
    if (r() < 0.5) {
      const x = ox + 2 + Math.floor(r() * 12), len = 4 + Math.floor(r() * 6);
      px(g, x, y, m.myelin, 1, len);
      px(g, x, y + len, m.light);
    }
  }
}

// Abultamiento lateral que rompe la vertical de una pared.
function bulge(g, x, y, dir, r, m) {
  const h = 3 + Math.floor(r() * 3);
  const col = m.myelin ?? C.flesh;
  for (let i = 0; i < h; i++) {
    const w = i === 0 || i === h - 1 ? 1 : 2;
    px(g, dir < 0 ? x - w + 1 : x, y + i, col, w, 1);
  }
}

// Membrana agrietada viva: tejido esponjoso con poros, venas y grietas brillantes
// (sus puntos débiles). Se pinta por grupos conectados, en dos fotogramas que se
// alternan para que parezca respirar. Devuelve { frames: [{color, glow}], x, y, w, h }.
export function paintMembraneGroup(cells, kind = 'crack') {
  if (kind === 'seal') return paintSealGroup(cells);
  const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = (Math.max(...xs) - minX + 1) * TILE, h = (Math.max(...ys) - minY + 1) * TILE;
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const frames = [0, 1].map((frame) => {
    const color = document.createElement('canvas'), glow = document.createElement('canvas');
    color.width = glow.width = w;
    color.height = glow.height = h;
    const g = color.getContext('2d'), gl = glow.getContext('2d');
    gl.fillStyle = '#000';
    gl.fillRect(0, 0, w, h);
    for (const [cx, cy] of cells) {
      const ox = (cx - minX) * TILE, oy = (cy - minY) * TILE, r = rng(hash(cx, cy, 2));
      const edgeL = !set.has(`${cx - 1},${cy}`), edgeR = !set.has(`${cx + 1},${cy}`);
      // Masa esponjosa rosada; los bordes libres se abomban (más en el fotograma 1).
      const bulge = frame ? 2 : 1;
      for (let y = 0; y < 16; y++) {
        const wob = Math.round(Math.sin((oy + y) * 0.45 + frame) * bulge);
        const x0 = edgeL ? 2 - wob : 0, x1 = edgeR ? 14 + wob : 16;
        for (let x = x0; x < x1; x++) px(g, ox + x, oy + y, ['#9a5a6a', '#b06a78', '#8a4a5c'][Math.floor(r() * 3)]);
        if (edgeL) px(g, ox + x0, oy + y, '#e0a0b0');
        if (edgeR) px(g, ox + x1 - 1, oy + y, '#5a2034');
      }
      // Poros: huecos oscuros con borde húmedo, que se abren y cierran.
      for (let k = 0; k < 5; k++) {
        const bx = ox + 3 + Math.floor(r() * 10), by = oy + 2 + Math.floor(r() * 12), rad = 1 + Math.floor(r() * 2) + frame * (k % 2);
        for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) {
          const d = Math.hypot(xx, yy);
          if (d <= rad) px(g, bx + xx, by + yy, d > rad - 0.8 ? '#e8b0bc' : '#3a1420');
        }
      }
      // Venas finas.
      let vx = ox + 2 + Math.floor(r() * 12);
      for (let y = 0; y < 16; y++) { px(g, vx, oy + y, '#6a2038'); if (r() < 0.4) vx += r() < 0.5 ? -1 : 1; }
    }
    // Grietas que recorren la membrana de arriba abajo: son su punto débil y brillan.
    const r = rng(minX * 31 + minY * 17);
    for (let k = 0; k < Math.max(1, Math.round(w / 16)); k++) {
      let x = Math.floor(w * 0.2 + r() * w * 0.6);
      for (let y = 0; y < h; y++) {
        px(g, x, y, '#24080e');
        if (y % 2 === frame) { gl.fillStyle = 'rgba(255,200,120,0.55)'; gl.fillRect(x, y, 1, 1); }
        if (r() < 0.35) x = Math.max(2, Math.min(w - 3, x + (r() < 0.5 ? -1 : 1)));
      }
    }
    return { color, glow };
  });
  return { frames, x: minX * TILE, y: minY * TILE, w, h };
}

// Esfínter sellado (Y): un músculo anular cerrado con fuerza. Pliegues radiales que
// convergen en un frunce central, con un anillo rosado (como los esfínteres de
// anclaje) que indica dónde clavar el Tendón para desgarrarlo.
function paintSealGroup(cells) {
  const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = (Math.max(...xs) - minX + 1) * TILE, h = (Math.max(...ys) - minY + 1) * TILE;
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const cxp = w / 2 - 0.5, cyp = h / 2 - 0.5;
  const frames = [0, 1].map((frame) => {
    const color = document.createElement('canvas'), glow = document.createElement('canvas');
    color.width = glow.width = w;
    color.height = glow.height = h;
    const g = color.getContext('2d'), gl = glow.getContext('2d');
    gl.fillStyle = '#000';
    gl.fillRect(0, 0, w, h);
    const r = rng(minX * 13 + minY * 7);
    const squeeze = frame ? 0.85 : 1; // el frunce se contrae y se relaja
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const tx = minX + Math.floor(x / TILE), ty = minY + Math.floor(y / TILE);
      if (!set.has(`${tx},${ty}`)) continue;
      const dx = x - cxp, dy = y - cyp, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      // Bordes libres redondeados.
      const lx = x % TILE, ly = y % TILE;
      const freeL = !set.has(`${tx - 1},${ty}`) && lx < 2, freeR = !set.has(`${tx + 1},${ty}`) && lx > 13;
      const freeT = !set.has(`${tx},${ty - 1}`) && ly < 1, freeB = !set.has(`${tx},${ty + 1}`) && ly > 14;
      if ((freeL || freeR) && (freeT || freeB)) continue;
      // Fibras radiales: bandas claras y oscuras alrededor del centro.
      const fold = Math.sin(a * 9 + d * 0.15 * squeeze);
      let c = fold > 0.45 ? '#b0404e' : fold > -0.3 ? '#8a2a38' : '#5a1420';
      if (freeL || freeR || freeT || freeB) c = '#4a0e18';
      px(g, x, y, c);
      if (r() < 0.03) px(g, x, y, '#d06a78');
    }
    // Frunce central y anillo de anclaje.
    const ring = Math.min(w, h) * 0.22 * squeeze;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const x = Math.round(cxp + Math.cos(a) * ring), y = Math.round(cyp + Math.sin(a) * ring);
      px(g, x, y, '#e88a9a');
      gl.fillStyle = frame ? 'rgba(255,110,150,0.9)' : 'rgba(255,110,150,0.5)';
      gl.fillRect(x, y, 1, 1);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      for (let t = 0; t < ring - 1; t++) px(g, Math.round(cxp + Math.cos(a) * t), Math.round(cyp + Math.sin(a) * t), '#2a0610');
    }
    px(g, Math.round(cxp), Math.round(cyp), '#140408', 2, 2);
    return { color, glow };
  });
  return { frames, x: minX * TILE, y: minY * TILE, w, h };
}

// Pared falsa (z): se pinta igual que la pared del bioma, en su propio lienzo, para
// poder desvanecerla cuando la luz la delata. Usa el material de la última sala pintada.
export function paintFalseWallGroup(cells, world) {
  const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = (Math.max(...xs) - minX + 1) * TILE, h = (Math.max(...ys) - minY + 1) * TILE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  for (const [cx, cy] of cells) paintWall(g, world, cx, cy, (cx - minX) * TILE, (cy - minY) * TILE);
  return { canvas, x: minX * TILE, y: minY * TILE, w, h };
}

// Colmillo aserrado de marfil: base hundida en la encía que se curva en gancho
// hacia una punta translúcida. Vetas finas de crecimiento, como el marfil, y el filo
// cóncavo con púas de sierra.
const FANG = {
  light: '#f6eed8', mid: '#e4d6b4', vein: '#cfbf98', dark: '#ae9a74', deep: '#6e5a42', tip: '#fffaea',
  notch: '#3a2418', stain: '#a04a4a', gum: '#8e2a44', gumLight: '#d8687e', gumDark: '#4a1020',
};
function paintFang(g, gl, x, base, h, w, lean, r) {
  const side = lean >= 0 ? 1 : -1; // hacia dónde se curva: el filo aserrado mira a ese lado
  const stained = r() < 0.3;
  for (let i = 0; i < h; i++) {
    const t = i / (h - 1); // 0 base, 1 punta
    const half = Math.max(0.5, (w / 2) * (1 - t) ** 1.1);
    const c = x + lean * t * t; // gancho: la curva se acentúa al final
    const y = base - i;
    const l = Math.round(c - half), rr = Math.round(c + half);
    for (let xx = l; xx <= rr; xx++) {
      const u = (xx - l) / Math.max(1, rr - l);
      const lit = side > 0 ? 1 - u : u; // la luz cae en el dorso de la curva
      let col = lit > 0.72 ? FANG.light : lit > 0.3 ? FANG.mid : FANG.dark;
      if (col === FANG.mid && i % 3 === 1) col = FANG.vein; // vetas del marfil
      if (i < 2) col = lit > 0.5 ? FANG.dark : FANG.deep; // raíz en sombra
      else if (t > 0.8) col = lit > 0.4 ? FANG.tip : FANG.mid; // punta translúcida
      px(g, xx, y, col);
    }
    // Sierra: púas que sobresalen del filo cóncavo cada dos filas, con su muesca debajo.
    const edge = side > 0 ? rr : l;
    if (i >= 2 && t < 0.75 && i % 2 === 0) {
      px(g, edge + side, y, FANG.mid);
      px(g, edge, y + 1, FANG.notch);
    }
    if (stained && t > 0.55 && t < 0.85) px(g, edge, y, FANG.stain); // resto de la última presa
  }
  px(g, Math.round(x) - side, base - Math.floor(h * 0.5), FANG.tip); // brillo del esmalte
  px(gl, Math.round(x + lean), base - h + 1, 'rgba(255,240,210,0.3)');
}

function paintGum(g, ox, oy, h, r, swell = 0) {
  const top = oy + 16 - h - swell;
  px(g, ox, top, FANG.gum, 16, h + swell);
  px(g, ox, top, FANG.gumLight, 16, 1);
  px(g, ox, oy + 15, FANG.gumDark, 16, 1);
  // Encía hinchada: pliegues oscuros y un brillo de saliva.
  for (let i = 0; i < 5; i++) px(g, ox + Math.floor(r() * 15), top + 1 + Math.floor(r() * (h - 1)), FANG.gumDark, 2, 1);
  for (let i = 0; i < 2; i++) px(g, ox + Math.floor(r() * 15), top, '#f0a0b0');
}

// Fauces de un tile: encía y colmillos en gancho que alternan hacia un lado y otro
// como una mandíbula. kind '^' (púas: solo la mitad baja del tile) o 'v' (fondo del
// abismo, colmillos más grandes). t anima: los colmillos se flexionan despacio y la
// encía respira; 'near' (0..1) los agita cuando te acercas. La pinta entities/Puzzles.js (Fangs).
export function paintFangTile(g, gl, kind, cx, cy, ox, oy, t = 0, near = 0) {
  const r = rng(hash(cx, cy, kind === 'v' ? 12 : 11));
  const s = (cx & 1) ? 1 : -1;
  const ph = (cx * 1.7 + cy) % 6.28;
  const sway = (k) => Math.sin(t * (1.3 + near * 4) + ph + k) * (0.5 + near * 0.6);
  const swell = Math.sin(t * 1.1 + ph * 0.5) > 0.55 ? 1 : 0; // la encía se hincha y empuja
  const big = kind === 'v';
  const base = oy + (big ? 12 : 13) - swell;
  paintFang(g, gl, ox + 4 + r(), base, (big ? 11 : 9) + Math.floor(r() * (big ? 3 : 2)), big ? 7 : 6, s * (2.2 + r() * 1.5) + sway(0), r);
  if (r() < (big ? 0.8 : 0.7)) paintFang(g, gl, ox + 8.5, base, (big ? 5 : 3) + Math.floor(r() * 2), big ? 4 : 3, sway(2) * 0.6, r);
  paintFang(g, gl, ox + 12 + r(), base, (big ? 9 : 8) + Math.floor(r() * (big ? 4 : 2)), big ? 7 : 6, -s * (2.2 + r() * 1.5) + sway(4), r);
  paintGum(g, ox, oy, big ? 4 : 3, r, swell);
}

// Ácido gástrico: verde que se aclara hacia la superficie, vetas onduladas que
// reflejan, y burbujas que suben (el brillo lo pone el compositor).
function paintAcid(g, gl, world, cx, cy, ox, oy) {
  const r = rng(hash(cx, cy, 3));
  let depth = 0;
  while (depth < 4 && world.get(cx, cy - depth - 1) === '~') depth++;
  const ramp = ['#9ad850', '#7ac83a', '#5aa830', '#3f8f2a', '#2e7424'];
  for (let y = 0; y < 16; y++) {
    const k = Math.min(ramp.length - 1, Math.floor((depth * 16 + y) / 9));
    px(g, ox, oy + y, ramp[k], 16, 1);
    // vetas onduladas más claras
    for (let x = 0; x < 16; x++) {
      const w = Math.sin((ox + x) * 0.35 + (oy + y) * 0.9) + Math.sin((ox + x) * 0.13 - (oy + y) * 0.4);
      if (w > 1.55) px(g, ox + x, oy + y, ramp[Math.max(0, k - 1)]);
    }
  }
  // burbujas
  for (let i = 0; i < 2; i++) {
    if (r() < 0.45) continue;
    const bx = ox + 2 + Math.floor(r() * 11), by = oy + 2 + Math.floor(r() * 11), rad = 1 + Math.floor(r() * 2);
    for (let a = 0; a < Math.PI * 2; a += 0.5) px(g, Math.round(bx + Math.cos(a) * rad), Math.round(by + Math.sin(a) * rad), '#d8ffa0');
    px(g, bx - 1, by - 1, '#ffffff');
  }
  if (world.get(cx, cy - 1) !== '~') {
    px(g, ox, oy, '#e0ffa0', 16, 1);
    px(g, ox, oy + 1, C.acidLight, 16, 1);
    px(gl, ox, oy, 'rgba(160,255,100,0.6)', 16, 2);
  }
  px(gl, ox, oy, 'rgba(60,160,40,0.08)', 16, 16);
}

// Abismo (v): una garganta oscura. La mandíbula de colmillos del fondo es una pieza
// animada (entities/Puzzles.js -> Fangs); caer en ella te muerde y te escupe (Game.#hazards).
function paintVoid(g, gl, cx, cy, ox, oy) {
  px(g, ox, oy, '#05030a', 16, 16);
  for (let y = 4; y < 16; y++) px(g, ox, oy + y, y < 9 ? '#0c0410' : '#1a0612', 16, 1); // garganta
  px(gl, ox, oy + 9, 'rgba(110,10,25,0.4)', 16, 7);
}

function paintAnchor(g, gl, ox, oy) {
  const cx = ox + 8, cy = oy + 8;
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y);
      if (d <= 6) px(g, cx + x, cy + y, d > 4.5 ? C.fleshDark : d > 2.5 ? C.fleshLight : '#1a0408');
    }
  }
  // Pliegues radiales del esfínter.
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    px(g, Math.round(cx + Math.cos(ang) * 4), Math.round(cy + Math.sin(ang) * 4), C.flesh);
  }
  px(g, ox + 7, oy - 4, C.fleshDark, 2, 4); // cordón que lo cuelga
  px(gl, cx - 1, cy - 1, 'rgba(255,90,120,0.6)', 3, 3);
}

export function paintRoom(world, biome) {
  // La paleta del bioma sobrescribe la base (tejido); el material, la pared.
  Object.assign(C, BASE_C, biome?.palette ?? {});
  MAT = MATERIALS[biome?.material] ? biome.material : 'fibrous';
  const W = world.pixelW, H = world.pixelH;
  const color = document.createElement('canvas');
  const glow = document.createElement('canvas');
  color.width = glow.width = W;
  color.height = glow.height = H;
  const pulse = document.createElement('canvas');
  pulse.width = W;
  pulse.height = H;
  const g = color.getContext('2d', { willReadFrequently: true });
  const gl = glow.getContext('2d');
  const pl = pulse.getContext('2d');
  // Las capas de brillo son opacas sobre negro: se suman tal cual en el compositor.
  px(gl, 0, 0, '#000', W, H);
  px(pl, 0, 0, '#000', W, H);

  for (let cy = 0; cy < world.h; cy++) {
    for (let cx = 0; cx < world.w; cx++) {
      const c = world.get(cx, cy);
      const ox = cx * TILE, oy = cy * TILE;
      if (c === '#') paintWall(g, world, cx, cy, ox, oy);
      else if (c === 'm') { paintWall(g, world, cx, cy, ox, oy); paintMucus(g, gl, cx, cy, ox, oy); }
      // 'X' (membrana agrietada) se dibuja aparte y animada: paintMembraneGroup.
      // '^' (púas): sus colmillos son una pieza animada (entities/Fangs.js).
      else if (c === '~') paintAcid(g, gl, world, cx, cy, ox, oy);
      else if (c === 'v') paintVoid(g, gl, cx, cy, ox, oy);
      // 'f' / 'F' (membrana fotosensible) no se pintan aquí: es una pieza animada
      // (entities/Puzzles.js -> PhotoMembrane) con su textura de paintPhotoTexture.
    }
  }
  paintMasses(g, world);
  organicSilhouette(g, world);
  organicPass(g, pl, world);
  if (biome) paintGrowths(g, gl, world, biome);
  for (const hole of findHoles(world)) paintOrifice(g, gl, hole);
  // Objetos que sobresalen de su tile (los Nodos son ahora úteros vivos: entities/Womb.js).
  for (let cy = 0; cy < world.h; cy++) {
    for (let cx = 0; cx < world.w; cx++) {
      if (world.get(cx, cy) === 'o') paintAnchor(g, gl, cx * TILE, cy * TILE);
    }
  }
  return { color, glow, pulse };
}

// --- Brotes de cada bioma ------------------------------------------------------
// Lo que cuelga de los techos y asoma de las paredes: todo carne (biome.growth).

// Fibra nerviosa colgante con cuentas de mielina; acaba en un bulbo sináptico que brilla.
function nerveFiber(g, gl, x, y, len, r) {
  for (let i = 0; i < len; i++) {
    const sway = Math.round(Math.sin(i / 4 + r() * 0.3));
    px(g, x + sway, y + i, i % 4 === 2 ? '#c070b0' : '#7a2a62');
  }
  const tip = r() < 0.5 ? 'rgba(255,200,120,0.9)' : 'rgba(140,210,255,0.9)';
  px(g, x - 1, y + len, '#f0a8e0', 3, 2);
  px(gl, x - 1, y + len, tip, 3, 2);
}
// Vaina de mielina pegada a la pared: cuentas claras en vertical.
function myelinBeads(g, gl, x, oy, r) {
  for (let i = 1; i < 15; i += 4) { px(g, x, oy + i, '#c070b0', 2, 3); px(g, x, oy + i, '#f0a8e0'); }
  if (r() < 0.4) px(gl, x, oy + 1 + Math.floor(r() * 3) * 4, 'rgba(140,210,255,0.6)');
}
// Penacho de cilios sobre una pared lateral.
function ciliaTuft(g, x, oy, dir, r) {
  for (let i = 0; i < 6; i++) {
    const y = oy + 2 + i * 2, len = 2 + Math.floor(r() * 3);
    px(g, dir < 0 ? x - len : x, y, i % 2 ? '#b8f8e4' : '#6ac8b4', len, 1);
  }
}
// Saco alveolar colgante, translúcido.
function hangingSac(g, gl, x, y, r) {
  const h = 4 + Math.floor(r() * 4);
  px(g, x, y, '#e0788a', 1, 2);
  px(g, x - 2, y + 2, '#3a9a8c', 5, h);
  px(g, x - 2, y + 2, '#e0788a', 1, h);
  px(g, x - 1, y + 3, '#b8f8e4', 2, h - 2);
  px(gl, x - 1, y + 3, 'rgba(160,255,220,0.18)', 2, h - 2);
}
// Vellosidad colgante del techo del intestino.
function hangingVillus(g, x, y, r) {
  const len = 4 + Math.floor(r() * 6);
  px(g, x, y, '#b87e26', 3, len);
  px(g, x, y, '#ffe08a', 1, len);
  px(g, x + 2, y, '#5a3408', 1, len);
  px(g, x, y + len, '#ffe08a', 3, 1);
}
// Goterón de mucosa que cuelga del techo: un hilo que se estira, se adelgaza y acaba
// en una gota gruesa y brillante (a veces una segunda gota a medio caer).
function mucusDrip(g, gl, x, y, r) {
  const len = 5 + Math.floor(r() * 12);
  px(g, x - 1, y, '#24180a', 4, 2);                       // donde nace, en la escama
  px(g, x, y, '#b8a830', 2, 2);
  for (let i = 2; i < len; i++) {
    const w = i < len * 0.4 ? 2 : 1;                     // se adelgaza
    px(g, x, y + i, '#24180a', w + 1, 1);
    px(g, x, y + i, i % 3 ? '#b8a830' : '#d8c860', w, 1);
  }
  // La gota.
  px(g, x - 1, y + len, '#24180a', 4, 4);
  px(g, x - 1, y + len, '#b8a830', 3, 3);
  px(g, x - 1, y + len, '#f0e48a');
  px(gl, x, y + len + 1, 'rgba(220,210,90,0.35)');
  if (r() < 0.3) { px(g, x, y + len + 6, '#b8a830', 1, 2); px(g, x, y + len + 6, '#f0e48a'); }
}
// Poro de la mucosa que gotea bilis verde-amarilla.
function bilePore(g, gl, x, y, r) {
  px(g, x - 1, y, '#5a3408', 3, 2);
  const len = 2 + Math.floor(r() * 5);
  px(g, x, y + 2, '#c8e040', 1, len);
  px(gl, x, y + 2 + len - 1, 'rgba(210,255,90,0.6)');
}
// Cuerda tendinosa del corazón: un hilo tenso con un nudo de músculo.
function chorda(g, gl, x, y, len, r) {
  for (let i = 0; i < len; i++) px(g, x + Math.round(Math.sin(i / 5) * 0.6), y + i, i % 3 ? '#f07080' : '#c83a4c');
  px(g, x - 1, y + len, '#aa2236', 3, 3);
  px(g, x, y + len, '#f07080');
  if (r() < 0.3) px(gl, x, y + len + 1, 'rgba(255,80,100,0.5)');
}

// Costilla rota que asoma de una pared lateral, curvada hacia abajo.
function ribStub(g, x, y, dir, r) {
  const len = 4 + Math.floor(r() * 5);
  for (let i = 0; i < len; i++) {
    const yy = y + Math.floor((i * i) / 10);
    px(g, dir < 0 ? x - i - 1 : x + i, yy, '#3a2216', 1, 3);
    px(g, dir < 0 ? x - i - 1 : x + i, yy, '#e0d0b0', 1, 1);
    px(g, dir < 0 ? x - i - 1 : x + i, yy + 1, '#a68e6c', 1, 1);
  }
}

function paintGrowths(g, gl, world, biome) {
  const d = biome.growthDensity ?? 0.4;
  for (let cy = 0; cy < world.h; cy++) {
    for (let cx = 0; cx < world.w; cx++) {
      if (world.get(cx, cy) !== '#') continue;
      const r = rng(hash(cx, cy, 9));
      const ox = cx * TILE, oy = cy * TILE;
      const air = (dx, dy) => {
        const x = cx + dx, y = cy + dy;
        return x >= 0 && y >= 0 && x < world.w && y < world.h && !isWallChar(world.get(x, y)) && world.get(x, y) !== '~';
      };
      const left = air(-1, 0), side = left || air(1, 0);
      const sideX = left ? ox + 1 : ox + 13;
      switch (biome.growth) {
        case 'nerves':
          if (air(0, 1) && r() < d * 0.35) nerveFiber(g, gl, ox + 4 + Math.floor(r() * 8), oy + 16, 5 + Math.floor(r() * 16), r);
          if (side && r() < d * 0.3) myelinBeads(g, gl, sideX, oy, r);
          break;
        case 'alveoli':
          if (side && r() < d * 0.45) ciliaTuft(g, left ? ox : ox + 16, oy, left ? -1 : 1, r);
          if (air(0, 1) && r() < d * 0.3) hangingSac(g, gl, ox + 4 + Math.floor(r() * 8), oy + 16, r);
          break;
        case 'mucus':
          if (air(0, 1) && r() < d * 0.45) mucusDrip(g, gl, ox + 3 + Math.floor(r() * 10), oy + 16, r);
          if (air(0, 1) && r() < d * 0.15) bilePore(g, gl, ox + 4 + Math.floor(r() * 8), oy + 16, r);
          break;
        case 'villi':
          if (air(0, 1) && r() < d * 0.5) hangingVillus(g, ox + 2 + Math.floor(r() * 10), oy + 16, r);
          if (air(0, 1) && r() < d * 0.25) bilePore(g, gl, ox + 4 + Math.floor(r() * 8), oy + 16, r);
          break;
        case 'spurs':
          if (side && r() < d * 0.35) ribStub(g, left ? ox : ox + 16, oy + 3 + Math.floor(r() * 8), left ? -1 : 1, r);
          if (air(0, 1) && r() < d * 0.2) chorda(g, gl, ox + 4 + Math.floor(r() * 8), oy + 16, 4 + Math.floor(r() * 8), r);
          break;
        case 'chordae':
          if (air(0, 1) && r() < d * 0.3) chorda(g, gl, ox + 4 + Math.floor(r() * 8), oy + 16, 6 + Math.floor(r() * 14), r);
          break;
      }
    }
  }
}
