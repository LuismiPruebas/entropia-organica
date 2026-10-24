import { TILE, isSlope, slopeSolidAt } from '../core/Physics.js';

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

const isWallChar = (c) => c === '#' || c === 'X' || c === 'f' || c === 'Y' || c === 'Z' || c === 'K' || c === 'z' || c === 'm' || isSlope(c);

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
    base: ['#9a3a80', '#aa4690', '#8a3072'], groove: '#4a1844', deep: '#36123a',
    myelin: '#c070b0', light: '#f0a8e0', outline: '#2a0c28',
    pulse: null, // sin venas que laten: su azul se confundía con los impulsos de las neuronas del fondo
  },
  // Cavidad Pulmonar (azul grisáceo y coral): tejido esponjoso cuajado de alvéolos.
  spongy: {
    base: ['#4a5a70', '#44546a', '#3c4a5e'], groove: '#161e2a', deep: '#1c2634',
    myelin: '#8a9cb6', light: '#d0dcec', tissue: '#e0788a', outline: '#10161f',
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
  // Sistema circulatorio: pared de vaso, granate húmeda, cruzada de capilares de colores.
  vascular: {
    base: ['#5a0a22', '#6a0e2a', '#4e081e'], groove: '#2a0410', deep: '#1e030c',
    myelin: '#c84a6a', light: '#ff8aa0', tissue: '#7a1a3a', outline: '#1a0208',
    pulse: null, // los capilares laten aparte (paintCapillaryLight), al pulso del corazón
  },
  // El Corazón (carmesí): músculo estriado con grasa.
  muscle: {
    base: ['#9a1a2c', '#aa2236', '#8a1426'], groove: '#4e0816', deep: '#40060f',
    myelin: '#c83a4c', light: '#f07080', fat: '#f0b080', outline: '#2e0408',
    pulse: 'rgba(255,60,80,0.75)',
  },
};
let MAT = 'fibrous';

// --- Carne mucosa (Digestivo) ---------------------------------------------------
// Lóbulos redondos de carne parda, de tamaños distintos, abombados (luz arriba a la
// izquierda, brillo húmedo), embutidos en un tejido más oscuro de fibras onduladas:
// carne, no piedra, en contraste con los tubos escamados del fondo. Se calcula en
// coordenadas del MUNDO, así que es continua entre casillas. depth 0..1 la apaga
// hacia el interior de la roca.
const SCALE = 12; // px entre lóbulos (aprox.)
const SCALE_PAL = ['#80562a', '#7a5026', '#86602c', '#7e4e2e'].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const TISSUE = [92, 60, 30];
function scaleAt(X, Y) {
  const ci = Math.floor(X / SCALE), cj = Math.floor(Y / SCALE);
  // El lóbulo que más "cubre" el píxel (q más bajo = más dentro de su radio).
  let q = 99, id = 0, dx = 0, dy = 0, rad = 1;
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const h = Math.abs(hash(i, j, 77));
    const sx = i * SCALE + (j & 1 ? SCALE / 2 : 0) + ((h % 97) / 97 - 0.5) * 6;
    const sy = j * SCALE + (((h >> 7) % 89) / 89 - 0.5) * 6;
    const r = SCALE * (0.36 + ((h >> 13) % 61) / 61 * 0.26);
    const ddx = X - sx, ddy = (Y - sy) * 1.15, qq = Math.hypot(ddx, ddy) / r;
    if (qq < q) { q = qq; id = h; dx = ddx; dy = ddy; rad = r; }
  }
  return { q, id, dx, dy, rad };
}
function scaleRGB(X, Y, depth = 0) {
  const s = scaleAt(X, Y);
  let base, k;
  if (s.q < 1) {
    // Lóbulo: cúpula con luz arriba-izquierda, borde que se hunde y brillo húmedo.
    base = SCALE_PAL[s.id % SCALE_PAL.length];
    const z = Math.sqrt(1 - s.q * s.q), lit = -(s.dx * 0.7 + s.dy * 0.7) / s.rad;
    k = 0.5 + z * 0.3 + lit * 0.26;
    k = Math.round(k / 0.08) * 0.08;
    // Brillo húmedo: media luna en el borde iluminado.
    if (lit > 0.5 && s.q > 0.5 && s.q < 0.82) k = 1.2;
  } else {
    // Tejido de entre medias: fibras onduladas más oscuras y algún poro.
    base = TISSUE;
    const fib = Math.sin((Y * 0.8 + X * 0.25 + Math.sin(X / 6) * 2.5) / 1.6);
    k = (fib > 0.4 ? 0.5 : 0.4) - Math.min(0.12, (s.q - 1) * 0.3);
    if (Math.abs(hash(X, Y, 5)) % 1000 < 25) k = 0.25;
  }
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
  if (MAT === 'vascular') { paintVasc(g, ox, oy, exposed ? 0 : 0.35); return; }
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
  fibrous: { near: '#92387c', far: '#5e2258', marble: '#bc54a0', fat: '#e8a8d8', vein: '#5a3290' },
  spongy: { near: '#425268', far: '#2a3648', marble: '#5e7290', fat: '#e8909e', vein: '#8a3050' },
  villous: { near: '#9a6018', far: '#6c4210', marble: '#bc8632', fat: '#f4c868', vein: '#7a4060' },
  osseous: { near: '#8a6a50', far: '#5a3e2e', marble: '#b09070', fat: '#e0d0b0', vein: '#6a2018' },
  muscle: { near: '#961a2a', far: '#640e1c', marble: '#bc3044', fat: '#f4b888', vein: '#6a0c1e' },
  vascular: { near: '#5a0a22', far: '#2e0412', marble: '#8a1a3a', fat: '#c84a6a', vein: '#3a0a40' },
};

// --- Pared de vaso (Sistema circulatorio) -------------------------------------------
// Carne granate y húmeda con pliegues suaves y un brillo ancho, cruzada por una red de
// capilares de colores (arteriolas rojas, vénulas azules, capilares violetas) que es
// continua entre casillas (coordenadas del mundo). capillary() dice si un píxel es
// capilar y de qué color; paintCapillaryLight los hace latir en la capa de pulso.
const CAP = [[255, 58, 74], [74, 122, 255], [192, 80, 255]]; // rojo, azul, violeta
function capillary(X, Y) {
  const wx = X / 30 + fbm(X / 60, Y / 60, 21) * 1.4, wy = Y / 30 + fbm(X / 60 + 5, Y / 60, 22) * 1.4;
  const big = Math.abs(fbm(wx, wy, 23) - 0.5);
  if (big < 0.016) return { col: CAP[Math.floor(fbm(X / 90, Y / 90, 24) * 5) % 3], thick: true };
  const fine = Math.abs(fbm(X / 11 + 3, Y / 11, 25) - 0.5);
  if (fine < 0.012) return { col: CAP[Math.floor(fbm(X / 40, Y / 40, 26) * 6) % 3], thick: false };
  return null;
}
function vascRGB(X, Y, depth = 0) {
  const n = fbm(X / 24, Y / 18, 27);
  const fold = Math.sin(Y / 5 + n * 6) * 0.5 + 0.5;                     // pliegues de la íntima
  let k = 0.78 + fold * 0.25 + (n - 0.5) * 0.35;
  if (fbm(X / 50 + 9, Y / 50, 28) > 0.68) k += 0.2;                   // brillo húmedo ancho
  let c = [168 * k, 34 * k, 58 * k];
  const cap = capillary(X, Y);
  if (cap) { const a = cap.thick ? 0.5 : 0.22; c = [c[0] + (cap.col[0] * 0.75 - c[0]) * a, c[1] + (cap.col[1] * 0.75 - c[1]) * a, c[2] + (cap.col[2] * 0.75 - c[2]) * a]; }
  const dk = 1 - depth * 0.7;
  return [c[0] * dk, c[1] * dk, c[2] * dk];
}
function paintVasc(g, ox, oy, depth) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const [r, gg, b] = vascRGB(ox + x, oy + y, depth);
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.fillRect(ox + x, oy + y, 1, 1);
  }
}
// Los capilares cerca de la superficie brillan (tenue) y laten con el corazón (capa de
// pulso, cuya opacidad lleva el ritmo del bioma en core/Scenery.js).
function paintCapillaryLight(gl, pl, world) {
  const D = wallDepth(world), W = world.w * TILE, H = world.h * TILE;
  const gi = gl.getImageData(0, 0, W, H), pi = pl.getImageData(0, 0, W, H);
  for (let cy = 0; cy < world.h; cy++) for (let cx = 0; cx < world.w; cx++) {
    if (!isWallChar(world.get(cx, cy)) || D[cy * world.w + cx] > 2) continue;
    for (let py = 0; py < TILE; py++) for (let pxl = 0; pxl < TILE; pxl++) {
      const x = cx * TILE + pxl, y = cy * TILE + py, cap = capillary(x, y);
      if (!cap || !cap.thick) continue;                                   // solo los gruesos laten
      const i = (y * W + x) * 4, a = 0.55;
      gi.data[i] = cap.col[0] * 0.12 * a; gi.data[i + 1] = cap.col[1] * 0.12 * a; gi.data[i + 2] = cap.col[2] * 0.12 * a;
      pi.data[i] = cap.col[0] * a; pi.data[i + 1] = cap.col[1] * a; pi.data[i + 2] = cap.col[2] * a; pi.data[i + 3] = 255;
    }
  }
  gl.putImageData(gi, 0, 0);
  pl.putImageData(pi, 0, 0);
}
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
    // El borde lo pinta su material; en el Digestivo la carne es una sola pieza (borde e
    // interior con la misma profundidad continua: sin saltos de una casilla a otra).
    const edge = D[cy * world.w + cx] < 2;
    const cont = MAT === 'villous' || MAT === 'vascular';
    if ((c !== '#' && c !== 'm') || (edge && (!cont || c === 'm'))) continue;
    for (let py = 0; py < TILE; py++) for (let pxl = 0; pxl < TILE; pxl++) {
      const x = cx * TILE + pxl, y = cy * TILE + py;
      const k = Math.min(1, Math.max(0, (deep[y * W + x] - 0.62) / 0.36));
      if (cont) {
        const dv = Math.min(1, Math.max(0, (deep[y * W + x] - 0.5) / 0.46));
        const sc = (MAT === 'vascular' ? vascRGB : scaleRGB)(x, y, dv * 0.85), i = (y * W + x) * 4;
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
    const c = world.get(cx, cy);
    if (!fn(c)) continue;
    if (isSlope(c)) {
      // Rampa (de suelo o de techo): cada celda de la máscara, según su centro quede del lado sólido.
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        if (slopeSolidAt(c, (x + 0.5) * div, (y + 0.5) * div)) mask[(cy * T + y) * W + cx * T + x] = 1;
      }
      continue;
    }
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
  const body = (c) => c === '#' || c === 'm' || isSlope(c);
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
  if (kind === 'face') return paintSealGroup(cells, FACE_SEAL);
  if (kind === 'boss') return paintSealGroup(cells, BOSS_SEAL);
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
// Colores del esfínter sellado (Y) y de la membrana del Rostro (Z: violeta, con núcleo).
const SEAL = { hi: '#b0404e', mid: '#8a2a38', lo: '#5a1420', edge: '#4a0e18', fleck: '#d06a78', ring: '#e88a9a', glow: [255, 110, 150], spoke: '#2a0610', core: '#140408' };
const FACE_SEAL = { hi: '#8a5ac0', mid: '#5e3690', lo: '#36185a', edge: '#22103a', fleck: '#b08ae0', ring: '#d8b8ff', glow: [190, 140, 255], spoke: '#1a0828', core: '#0c0414', nucleus: true };
// Membrana del jefe (K): carne oscura cruzada de vetas de brasa, con un núcleo que late.
const BOSS_SEAL = { hi: '#9a3a2a', mid: '#6a2018', lo: '#3a0e0a', edge: '#260806', fleck: '#e07040', ring: '#ffa060', glow: [255, 120, 60], spoke: '#1a0604', core: '#0c0302', nucleus: true };
function paintSealGroup(cells, P = SEAL) {
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
      let c = fold > 0.45 ? P.hi : fold > -0.3 ? P.mid : P.lo;
      if (freeL || freeR || freeT || freeB) c = P.edge;
      px(g, x, y, c);
      if (r() < 0.03) px(g, x, y, P.fleck);
    }
    // Frunce central y anillo de anclaje.
    const ring = Math.min(w, h) * 0.22 * squeeze;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const x = Math.round(cxp + Math.cos(a) * ring), y = Math.round(cyp + Math.sin(a) * ring);
      px(g, x, y, P.ring);
      gl.fillStyle = `rgba(${P.glow.join(',')},${frame ? 0.9 : 0.5})`;
      gl.fillRect(x, y, 1, 1);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      for (let t = 0; t < ring - 1; t++) px(g, Math.round(cxp + Math.cos(a) * t), Math.round(cyp + Math.sin(a) * t), P.spoke);
    }
    px(g, Math.round(cxp), Math.round(cyp), P.core, 2, 2);
    // Membrana del Rostro: en el frunce, un núcleo extraño que late (un ojo cerrado).
    if (P.nucleus) {
      const nr = Math.max(2, Math.min(w, h) * 0.12) * (frame ? 1.15 : 1);
      for (let y = -Math.ceil(nr); y <= Math.ceil(nr); y++) for (let x = -Math.ceil(nr); x <= Math.ceil(nr); x++) {
        const d = Math.hypot(x, y * 1.3) / nr;
        if (d > 1) continue;
        px(g, Math.round(cxp + x), Math.round(cyp + y), d > 0.75 ? '#1a0828' : d > 0.4 ? '#e0c8ff' : '#ffd27a');
        if (d < 0.6) { gl.fillStyle = frame ? 'rgba(255,210,122,0.95)' : 'rgba(200,150,255,0.7)'; gl.fillRect(Math.round(cxp + x), Math.round(cyp + y), 1, 1); }
      }
    }
    return { color, glow };
  });
  return { frames, x: minX * TILE, y: minY * TILE, w, h };
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
      if (c === '#' || isSlope(c)) paintWall(g, world, cx, cy, ox, oy); // la pendiente se recorta luego (organicSilhouette)
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
  if (MAT === 'vascular') paintCapillaryLight(gl, pl, world);
  organicSilhouette(g, world);
  organicPass(g, pl, world);
  if (biome) paintGrowths(g, gl, world, biome);
  for (const hole of findHoles(world)) paintOrifice(g, gl, hole);
  // Los Nodos son úteros vivos (entities/Womb.js) y los anclajes 'o', garfios animados
  // (entities/Hook.js): no se pintan en el fondo.
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
    px(g, dir < 0 ? x - len : x, y, i % 2 ? '#d0dcec' : '#8a9cb6', len, 1);
  }
}
// Saco alveolar colgante, translúcido.
function hangingSac(g, gl, x, y, r) {
  const h = 4 + Math.floor(r() * 4);
  px(g, x, y, '#e0788a', 1, 2);
  px(g, x - 2, y + 2, '#5a6e88', 5, h);
  px(g, x - 2, y + 2, '#e0788a', 1, h);
  px(g, x - 1, y + 3, '#d0dcec', 2, h - 2);
  px(gl, x - 1, y + 3, 'rgba(180,205,255,0.18)', 2, h - 2);
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

// Musgo de sangre: matas aterciopeladas rojo oscuro con las puntas claras, sobre un
// suelo (crece hacia arriba) y algo de él trepando por la cara de la pared.
function bloodMoss(g, gl, x0, y, w, r) {
  for (let i = 0; i < w; i++) {
    const h = 1 + Math.floor(r() * 3) + (i > 1 && i < w - 2 ? 1 : 0);
    px(g, x0 + i, y - h, '#3a080c', 1, h);
    px(g, x0 + i, y - h, r() < 0.5 ? '#8a1a22' : '#6a1018', 1, Math.max(1, h - 1));
    if (r() < 0.35) px(g, x0 + i, y - h, '#c8404a');                     // punta clara
    if (r() < 0.5) px(g, x0 + i, y + Math.floor(r() * 3), r() < 0.5 ? '#5a0e14' : '#7a1a1e'); // trepa por la cara
  }
  if (r() < 0.3) { const bx = x0 + 1 + Math.floor(r() * Math.max(1, w - 2)); px(g, bx, y - 3, '#e05a5a'); px(gl, bx, y - 3, 'rgba(200,40,50,0.35)'); } // espora
}
// Hebras de musgo de sangre colgando de un techo.
function mossStrand(g, x, y, len, r) {
  for (let i = 0; i < len; i++) {
    const xx = x + (Math.sin(i * 0.9 + x) > 0.5 ? 1 : 0);
    px(g, xx, y + i, i % 3 === 0 ? '#8a1a22' : '#5a0e14');
  }
  px(g, x - 1, y, '#3a080c', 3, 1);
  if (r() < 0.5) px(g, x, y + len, '#c8404a');
}
// Pellejo: tira de piel reseca que cuelga, ancha arriba y rasgada abajo, con algún
// agujero; luz por la izquierda.
function skinFlap(g, x, y, len, w, r) {
  for (let i = 0; i < len; i++) {
    const k = i / len, ww = Math.max(1, Math.round(w * (1 - k * 0.55)));
    const off = Math.round(Math.sin(i * 0.35 + x) * 0.8);
    if (k > 0.75 && r() < 0.35) continue;                                  // rasgado
    px(g, x + off - 1, y + i, '#3a1a14', ww + 2, 1);
    px(g, x + off, y + i, '#b88a6e', ww, 1);
    px(g, x + off, y + i, '#e0b898');                                      // canto iluminado
    if (ww > 2) px(g, x + off + ww - 1, y + i, '#7a4a3a');                // sombra
  }
  if (len > 6 && w > 3) px(g, x + 1, y + Math.floor(len * 0.45), '#2a0e0a', 1, 2); // agujero
  if (r() < 0.4) px(g, x + 1, y + 1, '#8a2a20', 1, 3);                     // mancha de sangre seca
}

// Capilar colgante: un hilo de color que se ramifica hacia abajo; la punta brilla.
function capTendril(g, gl, x, y, len, r) {
  const col = ['#ff3a4a', '#5a8aff', '#c050ff'][Math.floor(r() * 3)];
  let xx = x;
  for (let i = 0; i < len; i++) {
    px(g, xx, y + i, i % 4 === 3 ? '#2a0410' : col);
    if (r() < 0.25) xx += r() < 0.5 ? -1 : 1;
    if (i > 2 && r() < 0.12) { const bx = xx + (r() < 0.5 ? -1 : 1); px(g, bx, y + i + 1, col); px(g, bx + (bx > xx ? 1 : -1), y + i + 2, col); } // rama
  }
  px(g, xx - 1, y + len, '#2a0410', 3, 2);
  px(g, xx, y + len, '#ffd0e0');
  px(gl, xx - 1, y + len - 1, col, 3, 3);
}
// Bulbo de vaso pegado a un suelo: una burbuja de sangre con su brillo.
function vesselBulb(g, gl, x, y, r) {
  const rad = 1 + Math.floor(r() * 2);
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (Math.hypot(dx, dy) <= rad + 0.3) px(g, x + dx, y - rad + dy, Math.hypot(dx, dy) > rad - 0.6 ? '#2a0410' : '#c0182a');
  px(g, x - 1, y - rad - 1, '#ff8aa0');
  px(gl, x, y - rad, 'rgba(255,40,60,0.6)');
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
          if (air(0, 1) && r() < d * 0.15) chorda(g, gl, ox + 4 + Math.floor(r() * 8), oy + 16, 4 + Math.floor(r() * 8), r);
          // Musgo de sangre y pellejos: el osario no está limpio.
          if (air(0, -1) && r() < d * 1.3) bloodMoss(g, gl, ox + Math.floor(r() * 6), oy, 5 + Math.floor(r() * 8), r);
          if (air(0, 1) && r() < d * 0.6) mossStrand(g, ox + 2 + Math.floor(r() * 12), oy + 16, 2 + Math.floor(r() * 7), r);
          if (air(0, 1) && r() < d * 0.45) skinFlap(g, ox + 2 + Math.floor(r() * 9), oy + 15, 5 + Math.floor(r() * 12), 3 + Math.floor(r() * 3), r);
          if (side && r() < d * 0.3) skinFlap(g, left ? ox - 2 : ox + 14, oy + Math.floor(r() * 4), 6 + Math.floor(r() * 8), 2 + Math.floor(r() * 2), r);
          if (side && r() < d * 0.5) for (let k = 0; k < 6; k++) px(g, (left ? ox : ox + 13) + Math.floor(r() * 3), oy + Math.floor(r() * 16), r() < 0.5 ? '#5a0e14' : '#7a1a1e'); // musgo en la cara
          break;
        case 'capillaries':
          if (air(0, 1) && r() < d * 0.5) capTendril(g, gl, ox + 2 + Math.floor(r() * 12), oy + 16, 4 + Math.floor(r() * 12), r);
          if (air(0, -1) && r() < d * 0.35) vesselBulb(g, gl, ox + 3 + Math.floor(r() * 10), oy, r);
          break;
        case 'chordae':
          if (air(0, 1) && r() < d * 0.3) chorda(g, gl, ox + 4 + Math.floor(r() * 8), oy + 16, 6 + Math.floor(r() * 14), r);
          break;
      }
    }
  }
}
