import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { canvasTexture } from './Sprites.js';

// Planos de profundidad vivos por bioma:
//   medio   estructuras orgánicas gigantes detrás de la sala (parallax 0.55), que la
//           luz del ojo puede iluminar, con detalles emisivos animados
//   frontal siluetas oscuras por delante del jugador (parallax 1.35), en los bordes
// Además anima la opacidad de las venas de las paredes (pulso) al ritmo del bioma.

const MID_W = 256, MID_H = 192, FRONT_W = 256, FRONT_H = 40;

function rng(seed) {
  let a = seed >>> 0;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

const wrap = (v, n) => ((v % n) + n) % n;
const dot = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(wrap(Math.round(x), MID_W), Math.round(y), w, h); };
// Igual, pero envolviendo también en vertical (la textura se repite en ambos ejes).
const dotW = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(wrap(Math.round(x), MID_W), wrap(Math.round(y), MID_H), w, h); };

// Tubo grueso a lo largo de una curva (axones, arterias, bronquios).
function tube(g, pts, thick, col, light) {
  for (const [x, y] of pts) {
    g.fillStyle = col;
    g.fillRect(Math.round(x) - thick / 2, Math.round(y) - thick / 2, thick, thick);
  }
  if (light) for (const [x, y] of pts) { g.fillStyle = light; g.fillRect(Math.round(x), Math.round(y) - thick / 2 + 1, 1, 1); }
}

function wavy(y0, amp, freq, phase, from = -8, to = MID_W + 8) {
  const pts = [];
  for (let x = from; x <= to; x += 1) pts.push([x, y0 + Math.sin(x * freq + phase) * amp]);
  return pts;
}

// ---------------------------------------------------------------------------
// Constructores por bioma: devuelven { mid, midGlow, front, anim }. Todo carne, con
// colores saturados de la familia del bioma (nada de negros ni grises). anim:
//   neural  { paths, somas }  impulsos que recorren dendritas y axones
//   flow    { path, color }   una onda luminosa que avanza por un tubo (peristalsis)
//   motes   { n, colors, vx, vy, size, shape, wobble }  partículas a la deriva
//   breathe / heart / pulseGlow   cómo late o respira todo el plano

// Disco sombreado (soma, alvéolo, gota...): luz arriba a la izquierda.
function ball(g, x0, y0, rad, col, light, dark, rim) {
  for (let y = -Math.ceil(rad); y <= Math.ceil(rad); y++) for (let x = -Math.ceil(rad); x <= Math.ceil(rad); x++) {
    const q = Math.hypot(x, y) / rad;
    if (q > 1) continue;
    const lit = (-x - y) / (rad * 1.4) * 0.5 + 0.5;
    dot(g, x0 + x, y0 + y, rim && q > 0.82 ? rim : lit > 0.72 ? light : lit < 0.32 ? dark : col);
  }
}
// Tubo anillado a lo largo de un recorrido (bronquios, intestino, axones).
function ringedTube(g, pts, thick, col, light, dark, ring, every = 5) {
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)];
    const a = Math.atan2(ny - y, nx - x), px0 = -Math.sin(a), py0 = Math.cos(a);
    for (let k = -thick / 2; k <= thick / 2; k++) {
      const u = k / (thick / 2);
      const c = i % every === 0 ? ring : u < -0.45 ? light : u > 0.55 ? dark : col;
      dot(g, x + px0 * k, y + py0 * k, c);
    }
  }
}

function nervioso() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(11);
  const paths = [];
  // Dendrita fractal violeta con el borde iluminado; guarda su recorrido para los impulsos.
  const dendrite = (x, y, a, len, thick, depth, trail) => {
    let px = x, py = y;
    const pts = [...trail];
    for (let i = 0; i < len; i++) {
      const w = Math.max(1, Math.round(thick));
      g.fillStyle = '#7a3aa0'; g.fillRect(Math.round(px), Math.round(py), w, w);
      g.fillStyle = '#c080f0'; g.fillRect(Math.round(px), Math.round(py), 1, 1);
      if (w > 2) { g.fillStyle = '#4a1a70'; g.fillRect(Math.round(px) + w - 1, Math.round(py) + w - 1, 1, 1); }
      gl.fillStyle = 'rgba(150,120,255,0.06)'; gl.fillRect(Math.round(px), Math.round(py), 1, 1);
      pts.push([px, py]);
      px += Math.cos(a); py += Math.sin(a);
      a += (r() - 0.5) * 0.25;
    }
    if (depth > 0) {
      const n = 2 + (r() < 0.3 ? 1 : 0);
      for (let k = 0; k < n; k++) dendrite(px, py, a + (k - (n - 1) / 2) * (0.5 + r() * 0.4), len * (0.55 + r() * 0.2), thick * 0.65, depth - 1, pts);
    } else {
      paths.push(pts.slice().reverse());
      ball(g, px, py, 1.6, '#e070c0', '#ffc0f0', '#8a2a70'); // botón sináptico
    }
  };
  const neurons = [[70, 110], [196, 50], [150, 160]];
  for (const [sx, sy] of neurons) {
    const arms = 5 + Math.floor(r() * 2);
    for (let k = 0; k < arms; k++) dendrite(sx, sy, (k / arms) * Math.PI * 2 + r() * 0.4, 14 + r() * 8, 3, 3, [[sx, sy]]);
    ball(g, sx, sy, 9, '#a060d8', '#e0b0ff', '#5a2890', '#3a1060');
    ball(g, sx - 1, sy - 1, 3.5, '#5a2890', '#9a60d0', '#3a1060');
    gl.fillStyle = 'rgba(150,170,255,0.22)'; gl.fillRect(sx - 2, sy - 2, 4, 4);
  }
  // Axón con vainas de mielina rosadas.
  const axon = [];
  for (let i = 0; i <= 140; i++) {
    const k = i / 140;
    axon.push([70 + (196 - 70) * k + Math.sin(k * Math.PI * 2) * 10, 110 + (50 - 110) * k + Math.sin(k * Math.PI) * 30]);
  }
  for (const [x, y] of axon) { g.fillStyle = '#6a2a90'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
  for (let i = 10; i < axon.length - 10; i += 14) ball(g, axon[i][0], axon[i][1], 3.4, '#d080c0', '#ffd0f0', '#8a3a80');
  paths.push(axon);
  // Glía flotando entre las neuronas.
  for (let k = 0; k < 10; k++) ball(g, r() * MID_W, r() * MID_H, 2 + r() * 2.5, '#b03a78', '#f080b0', '#6a1848');

  const [front, f] = canvas(FRONT_W, FRONT_H);
  for (let k = 0; k < 9; k++) {
    let x = r() * FRONT_W, y = FRONT_H, a = -Math.PI / 2 + (r() - 0.5);
    for (let i = 0; i < 40; i++) { f.fillStyle = i % 6 ? '#2a0c3a' : '#4a1a60'; f.fillRect(Math.round(x) % FRONT_W, Math.round(y), 2, 2); x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.5; }
  }
  return { mid, midGlow: glow, front, anim: { neural: { paths, somas: neurons } } };
}

function pulmonar() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(23);
  // Árbol bronquial: tubos rosados con anillos de cartílago; al final de cada rama,
  // un racimo de alvéolos como uvas (turquesa con la pared coral).
  const branch = (x, y, a, len, thick, depth) => {
    const pts = [];
    let px = x, py = y;
    for (let i = 0; i < len; i++) { pts.push([px, py]); px += Math.cos(a); py += Math.sin(a); a += (r() - 0.5) * 0.06; }
    ringedTube(g, pts, thick, '#e05a6c', '#ff9aa6', '#9a2440', '#f8b4bc', 6);
    if (depth > 0) {
      branch(px, py, a - 0.45 - r() * 0.2, len * 0.7, Math.max(3, thick * 0.7), depth - 1);
      branch(px, py, a + 0.45 + r() * 0.2, len * 0.7, Math.max(3, thick * 0.7), depth - 1);
    } else {
      for (let k = 0; k < 7; k++) {
        const bx = px + (r() - 0.5) * 14, by = py + (r() - 0.5) * 12, rad = 2.5 + r() * 2.5;
        ball(g, bx, by, rad, '#3aa898', '#b8fff0', '#1a6a64', '#e0788a');
        dot(gl, bx - 1, by - 1, 'rgba(160,255,230,0.25)', 2, 2);
      }
    }
  };
  branch(64, MID_H + 4, -Math.PI / 2, 46, 11, 3);
  branch(192, MID_H + 4, -Math.PI / 2 + 0.1, 40, 9, 3);
  const [front, f] = canvas(FRONT_W, FRONT_H);
  // Bosque de cilios en primer plano, verde agua oscuro.
  for (let x = 0; x < FRONT_W; x += 2) {
    const h = 6 + Math.floor(Math.abs(Math.sin(x * 0.07)) * 22 + r() * 8);
    f.fillStyle = '#0e3a3a'; f.fillRect(x, FRONT_H - h, 1, h);
    f.fillStyle = '#2a6a64'; f.fillRect(x, FRONT_H - h, 1, 1);
  }
  return { mid, midGlow: glow, front, anim: { breathe: 4.8, motes: { n: 26, colors: ['rgba(190,170,255,0.8)', 'rgba(170,255,230,0.6)'], vx: 4, vy: -3, size: 1, wobble: 6 } } };
}

// Tubo escamado (Digestivo): carne empedrada a lo largo de un recorrido, con sombreado
// cilíndrico (luz arriba, sombra abajo), grietas entre escamas y brillos húmedos. Las
// escamas se calculan sobre el propio tubo (largo × ancho), así siguen su curva.
// El recorrido es un lazo periódico (de x=0 a x=MID_W): el número de escamas a lo
// largo se redondea a entero para que el final empalme con el principio sin corte.
function scaledTube(g, pts, R, pal, seed) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const N = Math.max(1, Math.round(L / 5)), cs = L / N;    // px por escama (exacto)
  const cell = (u, v) => {
    const ci = Math.floor(u / cs), cj = Math.floor(v / 5);
    let f1 = 99, f2 = 99, id = 0, ddy = 0;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const h = Math.abs(Math.sin(wrap(i, N) * 127.1 + j * 311.7 + seed) * 43758.5453) % 1;
      const sx = i * cs + (j & 1 ? cs / 2 : 0) + (h - 0.5) * 2, sy = j * 5 + (h * 7 % 1 - 0.5) * 2;
      const d = Math.hypot(u - sx, (v - sy) * 1.2);
      if (d < f1) { f2 = f1; f1 = d; id = h; ddy = v - sy; } else if (d < f2) f2 = d;
    }
    return { edge: f2 - f1, id, f1, ddy };
  };
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const step = Math.hypot(x1 - x0, y1 - y0); len += step;
    const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
    for (let k = -R; k <= R; k += 0.7) {
      const q = k / R, round = Math.sqrt(Math.max(0, 1 - q * q));
      const c = cell(len % L, k + R);
      let col;
      if (Math.abs(q) > 0.93) col = pal.out;                                   // contorno
      else if (c.edge < 0.9) col = pal.crack;                                  // grieta
      else {
        const lit = round * 0.7 + (ny > 0 ? -q : q) * 0.35 + (c.ddy < 0 ? 0.12 : -0.1);
        col = lit > 0.86 && c.f1 < 2 ? pal.shine : lit > 0.62 ? pal.light : lit > 0.32 ? (c.id > 0.5 ? pal.mid : pal.mid2) : pal.dark;
      }
      dotW(g, x1 + nx * k, y1 + ny * k, col);
    }
  }
}

function digestivo() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(31);
  const OLIVE = { out: '#1e1606', crack: '#2c2008', dark: '#4a3e10', mid: '#7a6a1c', mid2: '#6c5c18', light: '#a8962e', shine: '#e8d878' };
  const RUST = { out: '#1e0e06', crack: '#2c1408', dark: '#4a2410', mid: '#7a3e1c', mid2: '#6a3418', light: '#a85e2e', shine: '#e8a878' };
  // Tubo muscular grueso que serpentea de lado a lado, y una vena gruesa rojiza que lo
  // cruza (como en la referencia). Sin estela de luz: la carne se mueve, no se ilumina.
  // Recorridos periódicos (armónicos enteros del ancho): la textura se repite sin cortes.
  const W2 = (Math.PI * 2) / MID_W;
  const path = (y0, amp, ph) => { const p = []; for (let x = 0; x <= MID_W + 0.01; x += 0.5) p.push([x, y0 + Math.sin(x * W2 + ph) * amp + Math.sin(x * W2 * 3 + ph) * amp * 0.25]); return p; };
  const vein = path(150, 22, 2.1), tubeP = path(72, 30, 0);
  scaledTube(g, vein, 9, RUST, 3);
  scaledTube(g, tubeP, 17, OLIVE, 1);
  // Goterones de mucosa colgando de la panza del tubo (hilo que se estira y gota).
  for (let k = 0; k < 16; k++) {
    const i = Math.floor(r() * tubeP.length), [x, y] = tubeP[i], h = 4 + r() * 16;
    for (let j = 0; j < h; j++) dot(g, x, y + 15 + j, j % 3 ? '#b8a830' : '#d8c860', j < h * 0.4 ? 2 : 1, 1);
    ball(g, x + 0.5, y + 16 + h, 1.8, '#b8a830', '#f0e48a', '#6a5e14');
    dot(gl, x, y + 16 + h, 'rgba(200,190,80,0.25)', 2, 2);
  }
  for (let k = 0; k < 8; k++) {
    const i = Math.floor(r() * vein.length), [x, y] = vein[i], h = 2 + r() * 5;
    for (let j = 0; j < h; j++) dot(g, x, y + 8 + j, '#9a5a2a');
    ball(g, x + 0.5, y + 9 + h, 1.4, '#9a5a2a', '#e8a878', '#4a2410');
  }
  // Algunas burbujas de bilis pegadas a la carne (pocas: el protagonista es el tubo).
  for (let k = 0; k < 6; k++) {
    const bx = r() * MID_W, by = 20 + r() * (MID_H - 40);
    ball(g, bx, by, 1.5 + r() * 1.5, '#a8b030', '#f0f090', '#5a6018');
  }
  const [front, f] = canvas(FRONT_W, FRONT_H);
  // Primer plano: bultos escamados oscuros y goterones que cuelgan.
  for (let x = 0; x < FRONT_W; x += 9) {
    const h = 6 + ((x * 7) % 13), w = 7 + ((x * 3) % 5);
    f.fillStyle = '#1e1606'; f.fillRect(x, FRONT_H - h, w, h);
    f.fillStyle = '#3a300c'; f.fillRect(x + 1, FRONT_H - h, w - 2, 1);
  }
  return {
    mid, midGlow: glow, front,
    anim: {
      motes: { n: 14, colors: ['rgba(220,220,110,0.55)', 'rgba(240,220,140,0.4)'], vx: 0, vy: -7, size: 2, wobble: 3, shape: 'bubble' },
    },
  };
}

function corazon() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(41);
  // Trabéculas: bandas gruesas de músculo carmesí, estriadas, que se cruzan.
  for (const [y0, ph, th] of [[40, 0, 16], [112, 1.5, 20], [170, 3, 12]]) {
    const pts = wavy(y0, 14, 0.025, ph);
    ringedTube(g, pts, th, '#b0283c', '#f07080', '#6a0c1c', '#7a1426', 3);
    for (const [x, y] of pts) dot(gl, x, y, 'rgba(255,60,80,0.05)');
  }
  // Cuerdas tendinosas entre las bandas, con nudos.
  for (let k = 0; k < 7; k++) {
    const x0 = r() * MID_W, len = 30 + r() * 30;
    for (let i = 0; i < len; i++) dot(g, x0 + Math.sin(i / 7) * 2, 52 + i, i % 4 ? '#f08a96' : '#c04a5a');
    ball(g, x0, 52 + len, 2.5, '#c03448', '#ff90a0', '#7a1424');
  }
  const [front, f] = canvas(FRONT_W, FRONT_H);
  for (let x = 0; x < FRONT_W; x++) {
    const h = 6 + Math.round(Math.abs(Math.sin(x * 0.05)) * 14);
    f.fillStyle = '#4a0612'; f.fillRect(x, FRONT_H - h, 1, h);
    if (x % 3 === 0) { f.fillStyle = '#7a1424'; f.fillRect(x, FRONT_H - h, 1, 1); }
  }
  return {
    mid, midGlow: glow, front,
    anim: { heart: 1.05, motes: { n: 30, colors: ['rgba(255,70,90,0.9)', 'rgba(255,120,130,0.7)'], vx: 22, vy: 0, size: 2, wobble: 4, shape: 'cell' } },
  };
}

// Territorio del Hueso: costillas gigantes que se arquean sobre la sala y una columna
// vertebral por la que corre un pulso rojo de médula; polvo de hueso que cae.
function oseo() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(53);
  // Costillas: arcos gruesos de marfil, sombreados, con grietas.
  for (const [cx, cy, rad, a0, a1] of [[40, 210, 120, -2.6, -1.4], [150, 230, 140, -2.4, -1.2], [230, -30, 110, 0.9, 2.1]]) {
    for (let a = a0; a < a1; a += 0.004) {
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      for (let k = -5; k <= 5; k++) {
        const c = k < -2 ? '#efe2c6' : k > 2 ? '#7a6048' : '#c4ae8c';
        dot(g, x + Math.cos(a) * k, y + Math.sin(a) * k, c);
      }
      if (Math.floor(a * 300) % 23 === 0) for (let k = -5; k <= 5; k++) dot(g, x + Math.cos(a) * k, y + Math.sin(a) * k, '#4a3226');
    }
  }
  // Columna vertebral en diagonal: vértebras con apófisis y discos rojos entre ellas.
  const spine = [];
  for (let i = 0; i <= 260; i++) { const t = i / 260; spine.push([t * MID_W * 1.1 - 10, 150 - t * 110 + Math.sin(t * 6) * 8]); }
  for (let i = 0; i < spine.length; i += 13) {
    const [x, y] = spine[i];
    ball(g, x, y, 6, '#c4ae8c', '#f4ead4', '#7a6048', '#4a3226');
    dot(g, x - 1, y - 8, '#c4ae8c', 3, 4); dot(g, x - 1, y - 9, '#efe2c6', 1, 4); // apófisis
    const [nx, ny] = spine[Math.min(spine.length - 1, i + 6)];
    ball(g, nx, ny, 3, '#8a2a20', '#c85a46', '#4a1410'); // disco
  }
  const [front, f] = canvas(FRONT_W, FRONT_H);
  // Espolones de hueso en primer plano, sepia oscuro.
  for (let x = 0; x < FRONT_W; x += 5) {
    const h = 6 + Math.floor(Math.abs(Math.sin(x * 0.09)) * 20 + r() * 6);
    for (let i = 0; i < h; i++) { const w = Math.max(1, Math.round((1 - i / h) * 3)); f.fillStyle = i > h - 3 ? '#5a4232' : '#2e1c14'; f.fillRect(x - Math.floor(w / 2), FRONT_H - i, w, 1); }
  }
  return {
    mid, midGlow: glow, front,
    anim: {
      flow: { path: spine, color: [255, 90, 70], size: 3, alpha: 0.28 },
      motes: { n: 34, colors: ['rgba(240,225,200,0.5)', 'rgba(200,170,140,0.4)'], vx: 2, vy: 7, size: 1, wobble: 3 },
    },
  };
}

const BUILDERS = { nervioso, pulmonar, digestivo, corazon, oseo };

// Ritmo de las paredes vivas de cada bioma (0..1).
const RHYTHMS = {
  nervioso: (t, s) => { s.v = Math.random() < 0.06 ? 1 : (s.v ?? 0) * 0.9; return 0.25 + s.v * 0.75; },
  pulmonar: (t) => 0.25 + 0.45 * (0.5 + 0.5 * Math.sin((t / 4.8) * Math.PI * 2)),
  digestivo: (t) => 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4)), // contracciones lentas
  oseo: (t) => 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.7)), // un latido lento y seco
  corazon: (t) => { const p = t % 1.05; return 0.2 + 0.8 * Math.max(Math.exp(-p * 9), p > 0.24 ? 0.6 * Math.exp(-(p - 0.24) * 10) : 0); },
};

function layerMesh(tex, w, h, { glow = false, order = 0, opacity = 1 } = {}) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, opacity,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  mesh.renderOrder = order;
  return mesh;
}

export class Scenery {
  constructor(visual, viewW, viewH) {
    this.visual = visual;
    this.viewW = viewW;
    this.viewH = viewH;
    this.cache = new Map();
    this.active = null;
    this.state = {};
    this.pulseMesh = null;
  }

  #build(id) {
    const b = BUILDERS[id]?.();
    if (!b) return null;
    const vw = this.viewW + MID_W, vh = this.viewH + MID_H;
    // Capa luminosa viva (impulsos, peristalsis, motas): se repinta cada fotograma
    // sobre una base fija.
    let dyn = null;
    if (b.anim.neural || b.anim.flow || b.anim.motes) {
      const [cv, ctx] = canvas(MID_W, MID_H);
      const mo = b.anim.motes;
      dyn = {
        base: b.midGlow, cv, ctx, last: 0,
        neural: b.anim.neural ? { paths: b.anim.neural.paths, sparks: [], flashes: [] } : null,
        flow: b.anim.flow ?? null,
        motes: mo ? Array.from({ length: mo.n }, (_, i) => ({ x: Math.random() * MID_W, y: Math.random() * MID_H, ph: Math.random() * 6, c: mo.colors[i % mo.colors.length], k: 0.6 + Math.random() * 0.8 })) : null,
      };
      b.midGlow = cv;
    }
    const midTex = canvasTexture(b.mid), glowTex = canvasTexture(b.midGlow), frontTex = canvasTexture(b.front);
    const set = {
      id, anim: b.anim, dyn,
      mid: layerMesh(midTex, vw, vh, { order: -6 }),
      midGlow: layerMesh(glowTex, vw, vh, { glow: true, order: -6 }),
      front: layerMesh(frontTex, this.viewW + FRONT_W, FRONT_H, { order: 8, opacity: 0.92 }),
      top: layerMesh(frontTex.clone(), this.viewW + FRONT_W, FRONT_H, { order: 8, opacity: 0.92 }),
    };
    for (const m of [set.mid, set.midGlow]) m.material.map.repeat.set(vw / MID_W, vh / MID_H);
    for (const m of [set.front, set.top]) { m.material.map.repeat.set((this.viewW + FRONT_W) / FRONT_W, 1); m.material.map.needsUpdate = true; }
    set.top.rotation.z = Math.PI; // colgando del borde superior
    return set;
  }

  // Capa luminosa viva del plano medio: base fija + lo que se mueve encima.
  #dynamic(s, t) {
    const d = s.dyn, dt = Math.min(0.1, t - d.last || 0);
    d.last = t;
    const g = d.ctx;
    g.clearRect(0, 0, MID_W, MID_H);
    g.drawImage(d.base, 0, 0);
    // Impulsos que recorren dendritas y axones; al llegar al soma, destello.
    const n = d.neural;
    if (n) {
      while (n.sparks.length < 7) {
        const path = n.paths[Math.floor(Math.random() * n.paths.length)];
        n.sparks.push({ path, pos: 0, speed: 30 + Math.random() * 40 });
      }
      for (const sp of n.sparks) {
        sp.pos += sp.speed * dt;
        for (let i = 0; i < 7; i++) {
          const p = sp.path[Math.floor(sp.pos - i * 1.6)];
          if (!p) continue;
          g.fillStyle = `rgba(150,220,255,${(1 - i / 7) * 0.95})`;
          g.fillRect(Math.round(p[0]), Math.round(p[1]), i === 0 ? 2 : 1, i === 0 ? 2 : 1);
        }
        if (sp.pos >= sp.path.length) {
          const [ex, ey] = sp.path[sp.path.length - 1];
          n.flashes.push({ x: ex, y: ey, life: 1 });
          sp.dead = true;
        }
      }
      n.sparks = n.sparks.filter((sp) => !sp.dead);
      for (const fl of n.flashes) {
        fl.life -= dt * 2;
        const rad = Math.round(3 + (1 - fl.life) * 6);
        g.fillStyle = `rgba(170,150,255,${Math.max(0, fl.life) * 0.35})`;
        g.fillRect(Math.round(fl.x) - rad, Math.round(fl.y) - rad, rad * 2, rad * 2);
      }
      n.flashes = n.flashes.filter((fl) => fl.life > 0);
    }
    // Peristalsis: un ensanchamiento luminoso que avanza por el tubo.
    if (d.flow) {
      const pts = d.flow.path, [cr, cg, cb] = d.flow.color;
      for (const off of [0, 0.5]) {
        const head = Math.floor((((t * 34) / pts.length + off) % 1) * pts.length);
        for (let i = 0; i < 26; i++) {
          const p = pts[head - i];
          if (!p) continue;
          const a = Math.sin((i / 26) * Math.PI) * (d.flow.alpha ?? 0.4), sz = d.flow.size ?? 4;
          g.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
          g.fillRect(Math.round(p[0]) - sz, Math.round(p[1]) - sz, sz * 2, sz * 2);
        }
      }
    }
    // Motas a la deriva: esporas, burbujas de bilis, glóbulos rojos.
    if (d.motes) {
      const mo = s.anim.motes;
      for (const m of d.motes) {
        m.ph += dt;
        m.x = (m.x + (mo.vx * m.k + Math.cos(m.ph * 1.3) * mo.wobble * 0.3) * dt + MID_W) % MID_W;
        m.y = (m.y + (mo.vy * m.k + Math.sin(m.ph) * mo.wobble * 0.3) * dt + MID_H) % MID_H;
        g.fillStyle = m.c;
        const sz = mo.size;
        if (mo.shape === 'cell') { g.fillRect(Math.round(m.x) - 1, Math.round(m.y), sz + 1, sz); g.fillRect(Math.round(m.x), Math.round(m.y) - 1, sz - 1, sz + 2); }
        else if (mo.shape === 'bubble') { g.fillRect(Math.round(m.x), Math.round(m.y), sz, sz); g.fillStyle = 'rgba(255,255,220,0.6)'; g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1); }
        else g.fillRect(Math.round(m.x), Math.round(m.y), sz, sz);
      }
    }
    s.midGlow.material.map.needsUpdate = true;
  }

  setBiome(id) {
    if (this.active?.id === id) return;
    if (this.active) {
      const a = this.active;
      for (const m of [a.mid, a.front, a.top]) m.removeFromParent();
      a.midGlow.removeFromParent();
    }
    if (!this.cache.has(id)) this.cache.set(id, this.#build(id));
    const s = this.cache.get(id);
    this.active = s;
    if (!s) return;
    this.visual.world.add(s.mid, s.front, s.top);
    this.visual.glow.add(s.midGlow);
  }

  update(t, camX, camY) {
    const s = this.active;
    if (!s) return;
    const vw = this.viewW, vh = this.viewH;
    // Plano medio: sigue a la cámara y desplaza su textura con parallax 0.55.
    const P = 0.55;
    for (const m of [s.mid, s.midGlow]) {
      m.position.set(camX + vw / 2, -camY - vh / 2, 0);
      m.material.map.offset.set((camX * P) / MID_W, (-camY * P) / MID_H);
    }
    if (s.dyn) this.#dynamic(s, t);
    if (s.anim.pulseGlow) s.midGlow.material.opacity = 0.55 + 0.45 * Math.sin(t * s.anim.pulseGlow * Math.PI);
    if (s.anim.breathe) {
      const k = 1 + 0.035 * Math.sin((t / s.anim.breathe) * Math.PI * 2);
      s.mid.scale.set(k, k, 1);
      s.midGlow.scale.set(k, k, 1);
      s.midGlow.material.opacity = 0.5 + 0.5 * (k - 1) / 0.035;
    }
    if (s.anim.heart) {
      const p = t % s.anim.heart, k = 1 + 0.03 * Math.max(Math.exp(-p * 9), p > 0.24 ? 0.6 * Math.exp(-(p - 0.24) * 10) : 0);
      s.mid.scale.set(k, k, 1);
      s.midGlow.scale.set(k, k, 1);
    }
    // Plano frontal: siluetas por delante, en los bordes inferior y superior.
    const FP = 1.35, sway = Math.sin(t * 0.8) * 2;
    s.front.position.set(camX + vw / 2, -(camY + vh - FRONT_H / 2 + 10), 0);
    s.top.position.set(camX + vw / 2, -(camY + FRONT_H / 2 - 14), 0);
    s.front.material.map.offset.x = (camX * FP + sway) / FRONT_W;
    s.top.material.map.offset.x = (-camX * FP + sway) / FRONT_W;
    // Paredes vivas.
    if (this.pulseMesh) this.pulseMesh.material.opacity = RHYTHMS[s.id](t, this.state);
  }
}
