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
  // un racimo de alvéolos como uvas (azul grisáceo con la pared coral).
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
        ball(g, bx, by, rad, '#647a96', '#d6e0ee', '#2a384c', '#e0788a');
        dot(gl, bx - 1, by - 1, 'rgba(180,205,255,0.25)', 2, 2);
      }
    }
  };
  branch(64, MID_H + 4, -Math.PI / 2, 46, 11, 3);
  branch(192, MID_H + 4, -Math.PI / 2 + 0.1, 40, 9, 3);
  const [front, f] = canvas(FRONT_W, FRONT_H);
  // Bosque de cilios en primer plano, pizarra oscura.
  for (let x = 0; x < FRONT_W; x += 2) {
    const h = 6 + Math.floor(Math.abs(Math.sin(x * 0.07)) * 22 + r() * 8);
    f.fillStyle = '#121a26'; f.fillRect(x, FRONT_H - h, 1, h);
    f.fillStyle = '#3a4a60'; f.fillRect(x, FRONT_H - h, 1, 1);
  }
  return { mid, midGlow: glow, front, anim: { breathe: 4.8, motes: { n: 26, colors: ['rgba(190,170,255,0.8)', 'rgba(195,215,255,0.6)'], vx: 4, vy: -3, size: 1, wobble: 6 } } };
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

// Territorio del Hueso: una columna vertebral de lado (vértebras con sus apófisis y
// discos) de la que cuelga una caja torácica de costillas; polvo de hueso que cae.
function oseo() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(53);
  const IV = { out: '#2e1e16', dark: '#7a6048', mid: '#c4ae8c', light: '#efe2c6', crack: '#4a3226' };
  const FAR = { out: '#1e130e', dark: '#4a3a2c', mid: '#6e5a44', light: '#8e7a62', crack: '#2e2018' };
  // Hueso a lo largo de un recorrido: grosor w(s), luz arriba-izquierda, contorno.
  const boneAlong = (pts, wAt, pal, tipCol) => {
    for (const pass of [0, 1]) for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
      const s = i / pts.length, w = wAt(s);
      for (let k = -w - pass + 1; k <= w + 1 - pass; k += 0.5) {
        let c = pal.out;
        if (pass) {
          const q = k / w, lit = -(nx * q) - (ny * q);                  // el lado que mira arriba-izquierda, claro
          c = lit > 0.35 ? pal.light : lit < -0.4 ? pal.dark : pal.mid;
          if (tipCol && s > 0.84) c = lit > 0.3 ? '#c8aca0' : '#8a6a62';   // cartílago costal en la punta
        }
        dotW(g, x1 + nx * k, y1 + ny * k, c);
      }
    }
  };
  // Columna vertebral de lado, continua de borde a borde (10 vértebras por vuelta).
  const N = 10, step = MID_W / N;
  const spineY = (x) => 50 + Math.sin((x / MID_W) * Math.PI * 2) * 6;
  // Costillas (detrás de la columna): de cada vértebra cuelga un par que baja y se
  // curva hacia delante, como la jaula del tórax vista de lado. La del lado de allá,
  // más oscura y desplazada.
  const ribs = { true: [], false: [] };
  for (const far of [true, false]) for (let i = 0; i < N; i++) {
    const x0 = i * step + (far ? 7 : 2), y0 = spineY(x0) + 5;
    const len = 92 + ((i * 37) % 5) * 6, bow = 30 + ((i * 13) % 3) * 4;
    // Algunas costillas están rotas: acaban a medio camino en una punta astillada.
    const broken = !far && (i === 2 || i === 7) ? 0.5 + (i % 3) * 0.08 : far && i === 4 ? 0.6 : 1;
    const pts = [];
    // Sale hacia atrás, se abre hacia delante en un arco amplio y la punta vuelve.
    for (let j = 0; j <= 90 * broken; j++) { const s = j / 90; pts.push([x0 - Math.sin(s * 3.2) * 4 + Math.sin(s * 2.5) * bow - s * 14, y0 + len * Math.pow(s, 0.9)]); }
    ribs[far].push(pts);
  }
  ribs.true.forEach((pts) => boneAlong(pts, (s) => 1.6 * (1 - s * 0.3), FAR, false));
  // Pellejos: piel reseca tendida entre algunas costillas, rasgada por abajo y con agujeros.
  for (const i of [0, 4, 8]) {
    const A = ribs.false[i], B = ribs.false[(i + 1) % N], wrapX = i + 1 === N ? MID_W : 0;
    const n = Math.min(A.length, B.length);
    const end = Math.floor(n * (0.45 + (i % 3) * 0.08));
    for (let j = Math.floor(n * 0.08); j < end; j++) {
      const [ax, ay] = A[j], [bx, by] = B[j], bxx = bx + wrapX;
      const steps = Math.max(1, Math.round(bxx - ax));
      const rag = j > end - 6 ? Math.abs(Math.sin(j * 1.7 + i)) : 0;          // borde de abajo rasgado
      for (let q = 1; q < steps; q++) {
        const u = q / steps;
        if (rag > 0.5 && (q + j) % 3) continue;
        if ((i === 4 && Math.hypot(u - 0.45, (j - end * 0.6) / 6) < 0.12)) continue; // agujero
        const sag = Math.sin(u * Math.PI) * 3;                                  // la piel cuelga
        const c = u < 0.2 ? '#b88a6e' : u > 0.8 ? '#6a3a2e' : ((j + q) % 7 === 0 ? '#8a2a20' : '#94604c');
        dotW(g, ax + (bxx - ax) * u, ay + (by - ay) * u + sag, c);
      }
    }
  }
  ribs.false.forEach((pts) => boneAlong(pts, (s) => 2.1 * (1 - s * 0.3), IV, pts.length > 80));
  // Vértebras: cuerpo con cintura, arco con el agujero de la médula, apófisis espinosa
  // inclinada hacia atrás y apófisis transversa; discos rojizos entre ellas.
  for (let i = 0; i < N; i++) {
    const x = i * step + step / 2, y = spineY(x);
    // Cada vértebra distinta: tamaño, largo e inclinación de la apófisis (una, rota).
    const sv = 0.85 + ((i * 7) % 4) * 0.08, spL = (i === 6 ? 0.45 : 0.75 + ((i * 3) % 5) * 0.1) * 18, lean = 7 + ((i * 5) % 4) * 2;
    // Apófisis espinosa (detrás del cuerpo).
    const sp = []; for (let j = 0; j <= 20; j++) { const s = j / 20; sp.push([x - 2 - s * lean, y - 8 * sv - s * spL]); }
    boneAlong(sp, (s) => 3 * (1 - s * 0.6), IV);
    // Apófisis transversa: un muñón hacia delante y arriba.
    const tp = []; for (let j = 0; j <= 10; j++) { const s = j / 10; tp.push([x + 2 + s * 6, y - 7 - s * 4]); }
    boneAlong(tp, () => 1.6, IV);
    // Arco neural con el agujero vertebral.
    ball(g, x - 1, y - 8, 4.2, IV.mid, IV.light, IV.dark, IV.out);
    ball(g, x - 1, y - 8, 1.8, '#1e120c', '#3a2418', '#140a08');
    // Cuerpo: bloque redondeado con cintura, luz arriba.
    const hh = Math.round(6 * sv);
    for (let dy = -hh; dy <= hh; dy++) {
      const half = Math.round(8 * sv) - (Math.abs(dy) < 3 ? 1 : 0) - (Math.abs(dy) === hh ? 1 : 0);
      for (let dx = -half - 1; dx <= half + 1; dx++) {
        const edge = Math.abs(dx) > half || Math.abs(dy) === hh;
        const c = edge ? IV.out : dy < -3 ? IV.light : dy > 3 ? IV.dark : dx > half - 2 ? IV.dark : IV.mid;
        dotW(g, x + dx, y + dy, c);
      }
    }
    dotW(g, x - 6, y - 4, IV.light, 4, 1);                                    // brillo
    if (i % 3 === 0) { dotW(g, x + 2, y - 2, IV.crack, 1, 3); dotW(g, x + 3, y + 1, IV.crack); } // grieta
    // Musgo de sangre sobre algunas vértebras.
    if (i % 3 !== 1) for (let k = -5; k <= 5; k++) {
      const h = 1 + ((k * 7 + i * 3) % 3 + 3) % 3;
      dotW(g, x + k, y - hh - h, '#5a0e14', 1, h);
      if ((k + i) % 3 === 0) dotW(g, x + k, y - hh - h, '#a82a32');
    }
    // Disco intervertebral.
    const dx0 = x + step / 2;
    for (let dy = -5; dy <= 5; dy++) dotW(g, dx0 - 1, spineY(dx0) + dy, Math.abs(dy) === 5 ? '#2a1410' : dy < -2 ? '#9a4a3a' : '#6a2a20', 3, 1);
  }
  // Polvo de hueso pegado a la columna.
  for (let k = 0; k < 20; k++) dotW(g, r() * MID_W, spineY(0) + 10 + r() * 120, '#5a4636');
  const [front, f] = canvas(FRONT_W, FRONT_H);
  // Primer plano: puntas de costilla que asoman, curvas, en sepia oscuro.
  for (let x = 4; x < FRONT_W; x += 11 + Math.floor(r() * 6)) {
    const h = 10 + Math.floor(r() * 22), bend = (r() < 0.5 ? -1 : 1) * (3 + r() * 5);
    for (let i = 0; i < h; i++) {
      const s = i / h, w = Math.max(1, Math.round((1 - s * 0.7) * 3)), xx = x + Math.round(Math.sin(s * 1.6) * bend);
      f.fillStyle = i > h - 3 ? '#5a4232' : '#2e1c14';
      f.fillRect(xx - Math.floor(w / 2), FRONT_H - i, w, 1);
    }
  }
  return {
    mid, midGlow: glow, front,
    anim: {
      motes: { n: 34, colors: ['rgba(240,225,200,0.5)', 'rgba(200,170,140,0.4)'], vx: 2, vy: 7, size: 1, wobble: 3 },
    },
  };
}

// --- Variantes del bioma de Hueso (lv.backdrop) -------------------------------------
// Hueso a lo largo de un recorrido (para las variantes): grosor w(s), luz arriba-izquierda.
function boneLine(g, pts, wAt, pal) {
  for (const pass of [0, 1]) for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
    const w = wAt(i / pts.length);
    for (let k = -w - 1 + pass; k <= w + 1 - pass; k += 0.5) {
      let c = pal.out;
      if (pass) { const q = k / w, lit = -(nx * q) - (ny * q); c = lit > 0.35 ? pal.light : lit < -0.4 ? pal.dark : pal.mid; }
      dotW(g, x1 + nx * k, y1 + ny * k, c);
    }
  }
}

// Hueso esponjoso (oseo:2): grandes osteonas (los anillos del hueso compacto vistos en
// corte), cada una con su canal central por el que pasa un vaso que brilla; canales que las
// unen y glóbulos de médula a la deriva.
function oseo2() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(83);
  const RING = ['#e2cfa8', '#c4ab84', '#a68c66', '#cdb58e'];
  const osteons = [];
  for (let i = 0; i < 9; i++) osteons.push([r() * MID_W, 18 + r() * (MID_H - 36), 13 + r() * 13]);
  // Canales de Volkmann: tubos rojizos que unen las osteonas (detrás).
  for (let i = 0; i < osteons.length; i++) {
    const [ax, ay] = osteons[i], [bx, by] = osteons[(i + 3) % osteons.length];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let s = 0; s <= n; s++) {
      const u = s / n, x = ax + (bx - ax) * u, y = ay + (by - ay) * u + Math.sin(u * Math.PI * 2) * 4;
      dotW(g, x, y - 1, '#2a0e0a', 1, 3); dotW(g, x, y, '#6a1a14');
      if (s % 9 === 0) dotW(gl, x, y, '#5a0c08');
    }
  }
  for (const [x0, y0, R] of osteons) {
    for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 1) continue;
      let c;
      if (d > R) c = '#2a1a10';                                          // línea de cemento
      else if (d < 3.2) c = d < 2 ? '#3a0606' : '#7a1a14';                 // canal central
      else {
        const ring = Math.floor((d + Math.sin(Math.atan2(y, x) * 5) * 0.4) / 2.2);
        c = RING[ring % 4];
        const lit = (-x - y) / (R * 1.4);
        if (lit < -0.35 && ring % 2) c = '#86704f';
        if (lit > 0.4 && ring % 2 === 0) c = '#f2e4c4';
        // Lagunas de osteocitos: puntitos oscuros en los anillos, con sus canalículos.
        if (((Math.round(x * 3 + y * 7) % 23) === 0) && d > 4) c = '#3a2418';
      }
      dotW(g, x0 + x, y0 + y, c);
    }
    // El vaso del canal, que late (brillo propio).
    dotW(gl, x0 - 1, y0 - 1, '#c8281a', 2, 2); dotW(gl, x0, y0, '#ff6a3a');
    // Una grieta radial.
    const a = r() * Math.PI * 2;
    for (let s = 4; s < R; s++) dotW(g, x0 + Math.cos(a) * s, y0 + Math.sin(a) * s, '#3a2418');
  }
  const [front, f] = canvas(FRONT_W, FRONT_H);
  // Primer plano: espículas de hueso esponjoso que asoman, ramificadas.
  for (let x = 6; x < FRONT_W; x += 14 + Math.floor(r() * 8)) {
    const h = 12 + Math.floor(r() * 20);
    for (let i = 0; i < h; i++) {
      const w = Math.max(1, Math.round((1 - i / h) * 3));
      f.fillStyle = i > h - 3 ? '#5a4232' : '#2a1810';
      f.fillRect(x - Math.floor(w / 2) + Math.round(Math.sin(i * 0.3) * 2), FRONT_H - i, w, 1);
      if (i === Math.floor(h * 0.5)) { f.fillRect(x + 1, FRONT_H - i - 3, 1, 3); f.fillRect(x + 2, FRONT_H - i - 5, 1, 2); }
    }
  }
  return {
    mid, midGlow: glow, front,
    anim: {
      pulseGlow: 0.6,
      motes: { n: 26, colors: ['rgba(200,60,40,0.55)', 'rgba(230,190,120,0.45)', 'rgba(150,30,24,0.5)'], vx: 3, vy: -3, size: 2, shape: 'bubble', wobble: 5 },
    },
  };
}

// Osario (oseo:3): un montón de fémures cruzados y, entre ellos, cráneos grandes con brasas
// en las cuencas; polvo de hueso que cae.
function oseo3() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(97);
  const IV = { out: '#2a1a12', dark: '#7a6248', mid: '#bea47e', light: '#ecdcbc' };
  const FAR = { out: '#1a100a', dark: '#46362a', mid: '#685440', light: '#8a7458' };
  // Fémur: diáfisis con cintura y dos cabezas abultadas en cada extremo.
  const femur = (x0, y0, ang, len, w, pal) => {
    const cs = Math.cos(ang), sn = Math.sin(ang), nx = -sn, ny = cs;
    const pts = []; for (let t = 0; t <= len; t += 1) pts.push([x0 + cs * t, y0 + sn * t]);
    boneLine(g, pts, (s) => w * (1 - 0.3 * Math.sin(s * Math.PI)), pal);
    for (const e of [0, 1]) for (const sgn of [-1, 1]) {
      const ex = x0 + cs * len * e + nx * w * 0.8 * sgn, ey = y0 + sn * len * e + ny * w * 0.8 * sgn;
      const rad = w * (sgn > 0 && e ? 1.5 : 1.15);
      for (let y = -Math.ceil(rad) - 1; y <= rad + 1; y++) for (let x = -Math.ceil(rad) - 1; x <= rad + 1; x++) {
        const q = Math.hypot(x, y) / rad;
        if (q > 1.12) continue;
        const lit = (-x - y) / (rad * 1.4);
        dotW(g, ex + x, ey + y, q > 1 ? pal.out : lit > 0.35 ? pal.light : lit < -0.35 ? pal.dark : pal.mid);
      }
    }
  };
  // Capa de atrás, oscura; luego la de delante.
  for (let i = 0; i < 14; i++) femur(r() * MID_W, r() * MID_H, (r() - 0.5) * 1.6 + (r() < 0.5 ? 0 : Math.PI), 34 + r() * 26, 2.4, FAR);
  // Cráneos grandes (entre las capas), con brasas en las cuencas.
  const skull = (x0, y0, s) => {
    for (let y = -Math.ceil(13 * s); y <= 13 * s; y++) for (let x = -Math.ceil(12 * s); x <= 12 * s; x++) {
      const cran = (x / (11 * s)) ** 2 + ((y + 2 * s) / (9.5 * s)) ** 2;
      const jaw = Math.abs(x) < 6.5 * s && y > 3 * s && y < 11 * s && (x / (6.5 * s)) ** 2 + ((y - 7 * s) / (4.5 * s)) ** 2 < 1;
      if (cran > 1.1 && !jaw) continue;
      const lit = (-x * 0.6 - y) / (11 * s);
      let c = cran > 1 && !jaw ? IV.out : lit > 0.4 ? IV.light : lit < -0.35 ? IV.dark : IV.mid;
      const eye = ((Math.abs(x) - 4.4 * s) / (2.8 * s)) ** 2 + ((y - 0.5 * s) / (2.6 * s)) ** 2;
      if (eye < 1) c = eye < 0.35 ? '#5a1a08' : '#140806';
      if (Math.abs(x) < 1.4 * s && y > 3.5 * s && y < 6 * s && Math.abs(x) < (y - 3.5 * s) * 0.7 + 0.5) c = '#140806';
      if (jaw && y > 7.5 * s && y < 9.3 * s) c = (Math.round(x / s) % 2) ? IV.light : IV.out;
      if (cran < 1 && Math.abs(x + 3 * s) < 0.6 && y < -3 * s && y > -8 * s) c = IV.out; // grieta
      dotW(g, x0 + x, y0 + y, c);
    }
    // Brasas en las cuencas.
    for (const sx of [-1, 1]) { dotW(gl, x0 + sx * 4.4 * s - 1, y0 + 0.5 * s - 1, '#c84a14', 2, 2); dotW(gl, x0 + sx * 4.4 * s, y0 + 0.5 * s, '#ffb050'); }
  };
  for (let i = 0; i < 5; i++) skull(i * (MID_W / 5) + 20 + r() * 12, 40 + r() * (MID_H - 80), 0.9 + r() * 0.5);
  for (let i = 0; i < 12; i++) femur(r() * MID_W, r() * MID_H, (r() - 0.5) * 1.4 + (r() < 0.5 ? 0 : Math.PI), 40 + r() * 30, 3, IV);
  const [front, f] = canvas(FRONT_W, FRONT_H);
  // Primer plano: el borde del montón, huesos cruzados en silueta.
  for (let x = 0; x < FRONT_W; x += 18 + Math.floor(r() * 10)) {
    const ang = -0.5 - r() * 0.8, len = 18 + r() * 16;
    for (let t = 0; t < len; t++) {
      const xx = x + Math.cos(ang) * t * (r() < 0.5 ? 1 : 1), yy = FRONT_H - Math.abs(Math.sin(ang)) * t;
      f.fillStyle = t > len - 3 ? '#4a3626' : '#22140c';
      f.fillRect(Math.round(xx), Math.round(yy), 2, 2);
    }
    f.fillStyle = '#2e1e14'; f.fillRect(Math.round(x + Math.cos(ang) * len) - 2, Math.round(FRONT_H - Math.abs(Math.sin(ang)) * len) - 2, 5, 4);
  }
  return {
    mid, midGlow: glow, front,
    anim: {
      pulseGlow: 0.9,
      motes: { n: 40, colors: ['rgba(230,215,185,0.5)', 'rgba(190,165,130,0.4)'], vx: 1, vy: 9, size: 1, wobble: 2 },
    },
  };
}

// Sistema circulatorio: arterias rojas y venas azules gruesas y brillantes que cruzan la
// sala sin cortes (recorridos periódicos) y de las que brota una red de capilares de
// colores que brilla tenue; glóbulos rojos a la deriva. Todo late con el corazón.
function circulatorio() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(71);
  const W2 = (Math.PI * 2) / MID_W;
  const path = (y0, amp, ph, h = 1) => { const p = []; for (let x = 0; x <= MID_W; x += 0.5) p.push([x, y0 + Math.sin(x * W2 * h + ph) * amp + Math.sin(x * W2 * 3 + ph * 2) * amp * 0.2]); return p; };
  // Vaso grueso con volumen: borde oscuro, cuerpo, brillo húmedo arriba; dotW envuelve.
  const vessel = (pts, R, pal, glowCol) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
      for (let k = -R - 1; k <= R + 1; k += 0.5) {
        const q = k / R;
        const c = Math.abs(q) > 1 ? pal.out : q < -0.55 ? pal.light : q < -0.2 ? pal.mid : q < 0.6 ? pal.body : pal.dark;
        dotW(g, x1 + nx * k, y1 + ny * k, c);
      }
      if (i % 3 === 0) dotW(gl, x1 + nx * (-R * 0.6), y1 + ny * (-R * 0.6), glowCol);
    }
  };
  const ART = { out: '#2a0208', dark: '#6a0614', body: '#a8102a', mid: '#d8283e', light: '#ff8a9a' };
  const VEN = { out: '#0a0a2a', dark: '#1a1a5a', body: '#2e3a9a', mid: '#4a5ac8', light: '#a0b0ff' };
  // Capilares: ramas finas que salen de los vasos y se dividen, en rojo, azul y violeta.
  const COLS = [['#7a1a2e', 'rgba(255,40,60,0.18)'], ['#2a3a8a', 'rgba(70,110,255,0.18)'], ['#5a2a8a', 'rgba(190,70,255,0.18)']];
  const branch = (x, y, a, len, depth, ci) => {
    const [col, gcol] = COLS[ci];
    for (let i = 0; i < len; i++) {
      x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.5;
      dotW(g, x, y, col);
      if (i % 2 === 0) dotW(gl, x, y, gcol);
    }
    if (depth > 0) for (const s of [-1, 1]) branch(x, y, a + s * (0.4 + r() * 0.5), len * 0.7, depth - 1, r() < 0.35 ? (ci + 1) % 3 : ci);
  };
  const vein = path(140, 16, 1.3), artery = path(60, 22, 0), artery2 = path(170, 8, 2.6, 2);
  for (let n = 0; n < 5; n++) { const p = artery[Math.floor(r() * artery.length)]; branch(p[0], p[1] + 8, Math.PI / 2 + (r() - 0.5), 14 + r() * 10, 3, Math.floor(r() * 3)); }
  for (let n = 0; n < 4; n++) { const p = vein[Math.floor(r() * vein.length)]; branch(p[0], p[1] - 7, -Math.PI / 2 + (r() - 0.5), 12 + r() * 10, 3, Math.floor(r() * 3)); }
  vessel(artery2, 3, ART, 'rgba(255,40,60,0.3)');
  vessel(vein, 7, VEN, 'rgba(90,120,255,0.35)');
  vessel(artery, 9, ART, 'rgba(255,50,70,0.4)');
  const [front, f] = canvas(FRONT_W, FRONT_H);
  // Primer plano: lazos de vasos oscuros que asoman.
  for (let x = 0; x < FRONT_W; x += 6 + Math.floor(r() * 8)) {
    const h = 6 + Math.floor(r() * 22);
    for (let i = 0; i < h; i++) { f.fillStyle = i > h - 2 ? '#5a0a1e' : '#22040e'; f.fillRect(x + Math.round(Math.sin(i * 0.3 + x) * 2), FRONT_H - i, 3, 1); }
  }
  return {
    mid, midGlow: glow, front,
    anim: {
      heart: 1.6,
      motes: { n: 34, colors: ['rgba(230,40,60,0.9)', 'rgba(255,110,130,0.7)', 'rgba(120,140,255,0.5)'], vx: 26, vy: 0, size: 2, wobble: 4, shape: 'cell' },
    },
  };
}

// --- Variantes del Sistema Nervioso (lv.backdrop) ----------------------------------
// Raíces finas para el plano frontal (silueta oscura que asoma por abajo).
function nervFront(seed, n) {
  const [front, f] = canvas(FRONT_W, FRONT_H), r = rng(seed);
  for (let k = 0; k < n; k++) {
    let x = r() * FRONT_W, y = FRONT_H, a = -Math.PI / 2 + (r() - 0.5);
    for (let i = 0; i < 30; i++) { f.fillStyle = i % 6 ? '#22082e' : '#3a1450'; f.fillRect(Math.round(x) % FRONT_W, Math.round(y), 2, 2); x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.5; }
  }
  return front;
}
// 2 · Córtex: el Bosque neuronal simplificado: dos neuronas con dendritas menos
// ramificadas y sin el axón que las une; los impulsos recorren las dendritas.
function nervioso2() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(11);
  const paths = [];
  const dendrite = (x, y, a, len, thick, depth, trail) => {
    let px = x, py = y;
    const pts = [...trail];
    for (let i = 0; i < len; i++) {
      const w = Math.max(1, Math.round(thick));
      g.fillStyle = '#7a3aa0'; g.fillRect(Math.round(px), Math.round(py), w, w);
      g.fillStyle = '#c080f0'; g.fillRect(Math.round(px), Math.round(py), 1, 1);
      if (w > 2) { g.fillStyle = '#4a1a70'; g.fillRect(Math.round(px) + w - 1, Math.round(py) + w - 1, 1, 1); }
      pts.push([px, py]);
      px += Math.cos(a); py += Math.sin(a);
      a += (r() - 0.5) * 0.25;
    }
    if (depth > 0) for (let k = 0; k < 2; k++) dendrite(px, py, a + (k - 0.5) * (0.6 + r() * 0.3), len * 0.6, thick * 0.65, depth - 1, pts);
    else { paths.push(pts.slice().reverse()); ball(g, px, py, 1.6, '#e070c0', '#ffc0f0', '#8a2a70'); }
  };
  const neurons = [[70, 110], [190, 56]];
  for (const [sx, sy] of neurons) {
    const arms = 5;
    for (let k = 0; k < arms; k++) dendrite(sx, sy, (k / arms) * Math.PI * 2 + r() * 0.4, 16 + r() * 6, 3, 2, [[sx, sy]]);
    ball(g, sx, sy, 9, '#a060d8', '#e0b0ff', '#5a2890', '#3a1060');
    ball(g, sx - 1, sy - 1, 3.5, '#5a2890', '#9a60d0', '#3a1060');
    gl.fillStyle = 'rgba(150,170,255,0.22)'; gl.fillRect(sx - 2, sy - 2, 4, 4);
  }
  for (let k = 0; k < 4; k++) ball(g, r() * MID_W, r() * MID_H, 2 + r() * 2, '#b03a78', '#f080b0', '#6a1848');
  return { mid, midGlow: glow, front: nervFront(53, 4), anim: { neural: { paths, somas: neurons } } };
}
// 3 · Circunvoluciones: sobre los pliegues, unos vasos de las meninges que se ramifican
// (cortos, sin cruzar la pantalla); todo el plano respira muy despacio.
function nervioso3() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(61);
  const vessel = (x, y, a, len, w) => {
    for (let i = 0; i < len; i++) {
      dotW(g, x, y, '#5a1030', w, w); dotW(g, x, y, '#a0305a');
      x += Math.cos(a); y += Math.sin(a); a += (r() - 0.5) * 0.35;
      if (w > 1 && r() < 0.06) vessel(x, y, a + (r() < 0.5 ? -0.9 : 0.9), len * 0.45, w - 1);
    }
  };
  for (let k = 0; k < 5; k++) vessel(r() * MID_W, r() * MID_H, r() * Math.PI * 2, 40 + r() * 30, 2);
  return { mid, midGlow: glow, front: nervFront(63, 4), anim: { breathe: 5.5 } };
}
// 4 · Ventrículo: racimos de plexo coroideo (coliflores de carne con su tallo) y grandes
// burbujas de líquido que suben despacio.
function nervioso4() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(71);
  for (const [cx, cy, n, up] of [[52, 40, 10, false], [180, 150, 12, true], [222, 60, 7, false], [110, 170, 8, true]]) {
    // Tallo hacia el techo o el suelo.
    let x = cx, y = cy;
    for (let i = 0; i < 26; i++) { dotW(g, x - 1, y, '#3a1440', 3, 1); x += (r() - 0.5) * 0.8; y += up ? 1 : -1; }
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, d = r() * 13, bx = cx + Math.cos(a) * d * 1.2, by = cy + Math.sin(a) * d * 0.8, rad = 3.5 + r() * 3.5;
      ball(g, bx, by, rad, '#a0507a', '#f0a8c8', '#5a1a48', '#3a0e30');
      gl.fillStyle = 'rgba(200,90,150,0.18)'; gl.fillRect(Math.round(bx - 1), Math.round(by - 1), 3, 3);
    }
  }
  return {
    mid, midGlow: glow, front: nervFront(73, 3),
    anim: { pulseGlow: 0.4, motes: { n: 10, colors: ['rgba(220,180,240,0.4)', 'rgba(200,160,230,0.32)'], vx: 0, vy: -6, size: 3, shape: 'bubble', wobble: 8 } },
  };
}

// Cilios del pulmón en primer plano (pizarra oscura), compartido por sus variantes.
function pulmFront(seed, tone = '#121a26', tip = '#3a4a60') {
  const [front, f] = canvas(FRONT_W, FRONT_H), r = rng(seed);
  for (let x = 0; x < FRONT_W; x += 2) {
    const h = 6 + Math.floor(Math.abs(Math.sin(x * 0.07 + seed)) * 20 + r() * 8);
    f.fillStyle = tone; f.fillRect(x, FRONT_H - h, 1, h);
    f.fillStyle = tip; f.fillRect(x, FRONT_H - h, 1, 1);
  }
  return front;
}
// 2 · Espuma alveolar: dos alvéolos enormes (en pantalla se ven dos o tres), colgados de
// su bronquiolo, con poros y capilares por la pared; cada uno se hincha con la respiración
// y su pared coral se enciende en una ola que recorre el plano.
function pulmonar2() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(81), sacs = [];
  for (const [cx, cy, rad, stem] of [[70, 80, 40, -1.9], [196, 132, 30, -1.2]]) {
    // Bronquiolo del que cuelga: un tubo anillado que sale del saco y se pierde.
    const pts = [];
    let x = cx + Math.cos(stem) * rad, y = cy + Math.sin(stem) * rad, ang = stem;
    for (let i = 0; i < 70; i++) { pts.push([x, y]); x += Math.cos(ang); y += Math.sin(ang); ang += (r() - 0.5) * 0.08; }
    ringedTube(g, pts, 9, '#a04a62', '#e08aa0', '#5a1e34', '#f0b0c0', 5);
    ball(g, cx, cy, rad, '#4e6684', '#c4d2e6', '#1c2638', '#d0687a');
    // Poros de Kohn (huecos hondos) y capilares coral sobre la pared.
    for (let k = 0; k < 7; k++) {
      const pa = r() * Math.PI * 2, pd = r() * rad * 0.7;
      ball(g, cx + Math.cos(pa) * pd, cy + Math.sin(pa) * pd, 2 + r() * 2.5, '#18202e', '#2a3648', '#0c1018');
    }
    for (let k = 0; k < 9; k++) {
      let vx = cx + (r() - 0.5) * rad * 1.2, vy = cy + (r() - 0.5) * rad * 1.2, va = r() * Math.PI * 2;
      for (let i = 0; i < 22; i++) {
        if (Math.hypot(vx - cx, vy - cy) < rad - 2) { dotW(g, vx, vy, '#b8506a'); dotW(gl, vx, vy, 'rgba(255,110,130,0.18)'); }
        vx += Math.cos(va); vy += Math.sin(va); va += (r() - 0.5) * 0.6;
      }
    }
    sacs.push({ x: cx, y: cy, r: rad });
    // Brillo base: la pared coral se intuye aunque la sala esté a oscuras.
    for (let t = 0; t < Math.PI * 2; t += 0.6 / rad) dotW(gl, cx + Math.cos(t) * rad, cy + Math.sin(t) * rad, 'rgba(255,120,140,0.4)');
    for (let yy = -rad; yy <= rad; yy += 1) for (let xx = -rad; xx <= rad; xx += 1) if (Math.hypot(xx, yy) < rad * 0.75) dotW(gl, cx + xx, cy + yy, 'rgba(110,140,200,0.07)'); // aire dentro
    for (let k = 0; k < 6; k++) dotW(gl, cx - rad * 0.45 + k, cy - rad * 0.5 + (k > 2 ? 1 : 0), 'rgba(200,220,255,0.45)', 2, 1); // brillo húmedo
  }
  return {
    mid, midGlow: glow, front: pulmFront(83),
    anim: { sacs: { list: sacs, period: 4.6, color: [255, 130, 145] }, motes: { n: 14, colors: ['rgba(200,215,255,0.55)', 'rgba(255,190,200,0.4)'], vx: 2, vy: -1.5, size: 1, wobble: 4 } },
  };
}
// 3 · Red capilar: una vena (azul) arriba y una arteria (roja) abajo recorren todo el
// plano; entre ambas, capilares que bajan rozando alvéolos. Por los capilares los glóbulos
// bajan azules y llegan rojos; por los troncos, siguen su corriente.
function pulmonar3() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const r = rng(91), paths = [];
  // Apagados: el fondo no debe competir con las paredes y plataformas de la sala.
  const BLUE = ['#1c2236', '#262e48', 'rgba(90,120,255,0.05)'], VIOLET = ['#281e30', '#34283e', 'rgba(170,90,200,0.05)'], RED = ['#341822', '#44202c', 'rgba(255,70,90,0.06)'];
  const stroke = (pts, thick, pal) => {
    for (const [x, y] of pts) dotW(g, x - thick / 2 - 1, y - thick / 2 - 1, '#10141e', thick + 2, thick + 2);
    pts.forEach(([x, y], i) => {
      const p = typeof pal === 'function' ? pal(i / pts.length) : pal;
      dotW(g, x - thick / 2, y - thick / 2, p[0], thick, thick);
      dotW(g, x - thick / 2, y - thick / 2, p[1], Math.max(1, thick - 2), 1); // brillo arriba
      dotW(gl, x - thick / 2, y - thick / 2, p[2], thick, thick);
    });
  };
  // Troncos que empalman consigo mismos al dar la vuelta (y periódica en x).
  const trunk = (y0, amp, ph) => Array.from({ length: MID_W }, (_, x) => [x, y0 + Math.sin((x / MID_W) * Math.PI * 4 + ph) * amp]);
  const vein = trunk(34, 7, 0.5), artery = trunk(158, 6, 2.1);
  // Capilares de la vena a la arteria, con alvéolos a los lados.
  const grad = (k) => (k < 0.35 ? BLUE : k < 0.65 ? VIOLET : RED);
  for (const x0 of [20, 84, 148, 212]) {
    const pts = [];
    let x = x0, y = vein[x0][1];
    while (y < artery[Math.round(((x % MID_W) + MID_W) % MID_W)][1]) { pts.push([x, y]); y += 1; x += Math.sin(y * 0.09 + x0) * 0.8 + (r() - 0.5) * 0.4; }
    stroke(pts, 2, grad);
    paths.push(pts);
    for (let k = 0; k < 3; k++) {
      const [ax, ay] = pts[Math.floor(pts.length * (0.25 + k * 0.25))], side = k % 2 ? 1 : -1, rad = 6 + r() * 3;
      ball(g, ax + side * (rad + 2), ay, rad, '#3a4a62', '#6e7e98', '#1a2232', '#7a4250');
      for (let t = 0; t < Math.PI * 2; t += 1 / rad) dotW(gl, ax + side * (rad + 2) + Math.cos(t) * rad, ay + Math.sin(t) * rad, 'rgba(255,120,140,0.08)');
    }
  }
  stroke(vein, 4, BLUE);
  stroke(artery, 4, RED);
  // Glóbulos también por los troncos (de lado a lado, sin cambiar de color).
  paths.push({ pts: vein, from: [90, 120, 255], to: [110, 140, 255] }, { pts: artery, from: [255, 60, 75], to: [255, 90, 100] });
  return {
    mid, midGlow: glow, front: pulmFront(93, '#141626', '#3c3e5a'),
    anim: { cells: { paths, n: 40, from: [90, 120, 255], to: [255, 60, 75], speed: [18, 34], alpha: 0.45 } },
  };
}
// 4 · Bronquiolo ciliado: secciones de bronquiolo (anillos de cartílago) que se abren y se
// cierran como esfínteres; sus cilios, en el borde de la abertura, ondean en ola. Suben
// burbujas de moco.
function pulmonar4() {
  const [mid, g] = canvas(MID_W, MID_H), [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const iris = [];
  for (const [cx, cy, rad, ph] of [[60, 70, 22, 0], [190, 130, 28, 2.1], [150, 28, 13, 4.2]]) {
    for (let y = -rad - 4; y <= rad + 4; y++) for (let x = -rad - 4; x <= rad + 4; x++) {
      const q = Math.hypot(x, y);
      if (q > rad + 4) continue;
      const lit = (-x - y) / (rad * 1.4);
      if (q > rad) dotW(g, cx + x, cy + y, Math.round(Math.atan2(y, x) * 9) % 3 === 0 ? '#f0d8e0' : lit > 0.2 ? '#c8a8b8' : '#7a5a70');   // anillo de cartílago
      else dotW(g, cx + x, cy + y, lit > 0.3 ? '#5a3a52' : q > rad * 0.5 ? '#3e2a40' : '#1c1422');                                     // mucosa plegada y luz honda
    }
    iris.push({ x: cx, y: cy, r: rad, ph });
  }
  return {
    mid, midGlow: glow, front: pulmFront(103, '#1e1622', '#4a3a52'),
    anim: { iris: { list: iris, period: 5, color: 'rgba(255,150,200,0.55)', cilia: 'rgba(230,200,255,0.75)' }, motes: { n: 12, colors: ['rgba(240,220,250,0.42)', 'rgba(220,200,240,0.34)'], vx: 0, vy: -7, size: 3, shape: 'bubble', wobble: 7 } },
  };
}

// Digestivo 2 · Vellosidades: la carne está horadada como un hormiguero. Cámaras de
// formas irregulares (suelo más plano que el techo) unidas por galerías, con las paredes
// tapizadas de vellosidades que apuntan hacia dentro y se mecen; algunas cámaras
// guardan un charco de jugo turbio (con su orilla que tiembla y burbujas que suben).
// Por el fondo de los huecos se entrevé, muy oscuro, el plano lejano.
function digestivo2() {
  const W = MID_W, H = MID_H, r = rng(111), N = W * H;
  const I = (x, y) => wrap(Math.round(y), H) * W + wrap(Math.round(x), W);
  const M = new Uint8Array(N), ID = new Int8Array(N).fill(-1), LY = new Int16Array(N);
  // Cámaras: una por celda de una rejilla de 3×2 descolocada (filas desplazadas y
  // posición al azar dentro de la celda), de tamaños muy distintos.
  const ch = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
    const cw = W / 3, chh = H / 2;
    ch.push({ x: (i + 0.25 + r() * 0.5 + j * 0.5) * cw, y: (j + 0.3 + r() * 0.4) * chh, rx: 14 + r() * 22, ry: 10 + r() * 12, p: r() * 6 });
  }
  ch.forEach((c, k) => {
    for (let y = -c.ry * 1.3; y <= c.ry * 1.3; y++) for (let x = -c.rx * 1.3; x <= c.rx * 1.3; x++) {
      const an = Math.atan2(y, x), wob = 1 + 0.14 * Math.sin(3 * an + c.p) + 0.07 * Math.sin(5 * an + c.p * 2);
      const ry = y > 0 ? c.ry * 0.75 : c.ry;                            // suelo más plano
      if ((x / (c.rx * wob)) ** 2 + (y / (ry * wob)) ** 2 > 1) continue;
      const i = I(c.x + x, c.y + y);
      M[i] = 1; ID[i] = k; LY[i] = Math.round(y);
    }
  });
  // Galerías: cada cámara se une a la más cercana y algunas a otra más; serpentean.
  const dw = (p, q, n) => { let d = q - p; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; };
  const link = (A, B) => {
    const dx = dw(A.x, B.x, W), dy = dw(A.y, B.y, H), L = Math.hypot(dx, dy), rad = 2.5 + r() * 2.5, ph = r() * 6;
    for (let t = 0; t <= L; t += 0.7) {
      const u = t / L, off = Math.sin(u * Math.PI * 2 + ph) * 6 * Math.sin(u * Math.PI);
      const cx = A.x + dx * u - (dy / L) * off, cy = A.y + dy * u + (dx / L) * off;
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad) M[I(cx + x, cy + y)] = 1;
    }
  };
  ch.forEach((A, k) => {
    const near = ch.map((B, j) => [Math.hypot(dw(A.x, B.x, W), dw(A.y, B.y, H)), j]).filter(([, j]) => j !== k).sort((p, q) => p[0] - q[0]);
    link(A, ch[near[0][1]]);
    if (r() < 0.45) link(A, ch[near[1][1]]);
  });
  // Campo suavizado del hueco (0 carne … 1 centro de la cámara): sombras y normales.
  let B = Float32Array.from(M);
  for (const pass of [0, 1]) {
    const o = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let k = -4; k <= 4; k++) sum += pass ? B[I(x, y + k)] : B[I(x + k, y)];
      o[y * W + x] = sum / 9;
    }
    B = o;
  }
  const at = (x, y) => B[I(x, y)];
  // Base fija: carne con grano y sombra junto a los huecos; huecos oscuros (algo
  // transparentes: se adivina el fondo lejano).
  const FLESH = ['#140e04', '#1c1406', '#241a0a', '#2c220c', '#362a10'].map(hex32);
  const base = new Uint32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (M[i]) { const k = Math.min(1, B[i] * 1.4); base[i] = (Math.round(150 + 80 * k) << 24) | 0x020306; continue; }
    const edge = M[I(x + 1, y)] || M[I(x - 1, y)] || M[I(x, y + 1)] || M[I(x, y - 1)];
    const n = Math.sin(x * 0.21 + Math.sin(y * 0.13) * 2) * 0.5 + Math.sin(y * 0.17 + x * 0.05) * 0.5;
    const lip = M[I(x, y - 2)] && !M[I(x, y + 2)] ? 1 : 0;              // labio iluminado del suelo
    const grain = (Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5) % 1) * 0.6;
    const v = 2 + n * 0.45 + grain - B[i] * 2.5 + lip * 1.5;
    base[i] = edge ? FLESH[0] : FLESH[Math.max(0, Math.min(4, Math.round(v)))];
  }
  // Vellosidades a lo largo del borde de los huecos, mirando hacia dentro.
  const villi = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!M[i] || !(!M[I(x + 1, y)] || !M[I(x - 1, y)] || !M[I(x, y + 1)] || !M[I(x, y - 1)])) continue;
    if (r() > 0.3) continue;
    let nx = at(x + 2, y) - at(x - 2, y), ny = at(x, y + 2) - at(x, y - 2);
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-3) continue;
    villi.push({ x, y, nx: nx / nl, ny: ny / nl, len: 3 + r() * 3, ph: x * 0.3 + y * 0.2 });
  }
  // Charcos: en las cámaras más anchas, un nivel de líquido.
  const pools = new Map();
  ch.map((c, k) => [c.rx * c.ry, k]).sort((p, q) => q[0] - p[0]).slice(0, 3).forEach(([, k], j) => pools.set(k, Math.round(ch[k].ry * (j === 0 ? -0.15 : 0.15 + r() * 0.25))));
  const mix = (c, d, k) => {
    const f = (sh) => Math.round(((c >>> sh) & 255) * (1 - k) + ((d >>> sh) & 255) * k);
    return ((0xff << 24) | (f(16) << 16) | (f(8) << 8) | f(0)) >>> 0;
  };
  const VB = hex32('#3a3014'), VL = hex32('#5e4e22'), VT = hex32('#7e6a32'), LIQ = hex32('#3a4a12'), SURF = hex32('#5e6c28');
  const frames = [], FR = 10;
  for (let f = 0; f < FR; f++) {
    const t = (f / FR) * Math.PI * 2, d = base.slice();
    for (const v of villi) {
      const sway = Math.sin(t + v.ph) * 0.45;
      for (let k = 0; k < v.len; k++) {
        const ang = Math.atan2(v.ny, v.nx) + sway * (k / v.len), px = v.x + Math.cos(ang) * k, py = v.y + Math.sin(ang) * k;
        const c = k >= v.len - 1.5 ? VT : (Math.cos(ang) < 0 ? VL : VB);
        d[I(px, py)] = c;
        if (k < v.len - 1) d[I(px - Math.sin(ang), py + Math.cos(ang))] = VB;
      }
    }
    // Charcos: lo que queda por debajo del nivel se tiñe de jugo; la orilla tiembla.
    for (let i = 0; i < N; i++) {
      const lv = pools.get(ID[i]);
      if (lv === undefined) continue;
      const x = i % W, rip = Math.round(Math.sin(x * 0.35 + t) * 0.8);
      if (LY[i] < lv + rip) continue;
      d[i] = LY[i] === lv + rip ? SURF : mix(d[i], LIQ, 0.75);
    }
    // Burbujas que suben dentro de los charcos.
    for (const [k, lv] of pools) {
      const c = ch[k];
      for (let j = 0; j < 3; j++) {
        const bx = c.x + (j - 1) * c.rx * 0.4, rise = ((f / FR + j * 0.33) % 1) * c.ry * 0.6;
        const by = c.y + c.ry * 0.6 - rise;
        if (by - c.y > lv + 1) d[I(bx, by)] = SURF;
      }
    }
    const [cv, g] = canvas(W, H), im = g.createImageData(W, H);
    new Uint32Array(im.data.buffer).set(d);
    g.putImageData(im, 0, 0);
    frames.push(cv);
  }
  // Brillo tenue de los charcos.
  const [glow, gl] = canvas(W, H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, W, H);
  gl.fillStyle = 'rgba(140,180,40,0.12)';
  for (let i = 0; i < N; i++) { const lv = pools.get(ID[i]); if (lv !== undefined && LY[i] >= lv) gl.fillRect(i % W, (i / W) | 0, 1, 1); }
  return {
    mid: frames[0], midFrames: frames, frameTime: 0.2, midGlow: glow, front: digFront(113),
    anim: { motes: { n: 6, colors: ['rgba(210,200,120,0.22)'], vx: 2, vy: -2, size: 1, wobble: 4 } },
  };
}
// ---- Vísceras palpitantes (Digestivo 3 y 4) -------------------------------------
// Tuberías gruesas de intestino que cruzan el plano de lado a lado y vejigas enormes
// colgadas de ellas por conductos. Se precalculan varios fotogramas (la onda de la
// peristalsis recorre los tubos, las vejigas se hinchan y se vacían) y el plano medio
// los va alternando. Se pinta en un búfer de píxeles (rápido) que envuelve en ambos ejes.
const hex32 = (h) => { const n = parseInt(h.slice(1), 16); return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
function pixbuf() {
  const d = new Uint32Array(MID_W * MID_H);
  return {
    set: (x, y, c) => { d[wrap(Math.round(y), MID_H) * MID_W + wrap(Math.round(x), MID_W)] = c; },
    canvas() {
      const [cv, g] = canvas(MID_W, MID_H), im = g.createImageData(MID_W, MID_H);
      new Uint32Array(im.data.buffer).set(d);
      g.putImageData(im, 0, 0);
      return cv;
    },
  };
}
// Paletas apagadas: carne de intestino (pardo rosado) y vejiga (verdosa, translúcida).
const GUT = ['#120806', '#24120c', '#321a12', '#422418', '#52301e', '#643c26'].map(hex32);
const SAC = { out: hex32('#100c04'), wall: [hex32('#22200c'), hex32('#2e2c12'), hex32('#3a3818')], fluid: [hex32('#2c3410'), hex32('#3a4416'), hex32('#4a561c')], shine: hex32('#6a7034'), vein: hex32('#3a1c10') };
// Tubo de carne a lo largo de una lista de puntos. Rf(i, s) da el radio en el punto i
// (s = largo recorrido). Pliegues anulares cada `fold` px y luz desde arriba.
function gutTube(P, pts, Rf, fold = 0) {
  let sl = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i], [x0, y0] = pts[Math.max(0, i - 1)], [x1, y1] = pts[Math.min(pts.length - 1, i + 1)];
    if (i) sl += Math.hypot(x - x0, y - y0);
    let nx = -(y1 - y0), ny = x1 - x0;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    if (ny < 0) { nx = -nx; ny = -ny; }                       // la normal mira hacia abajo
    const Rr = Rf(i, sl), ring = fold ? 0.5 + 0.5 * Math.cos((sl / fold) * Math.PI * 2) : 1;
    for (let k = -Rr; k <= Rr; k += 0.5) {
      const q = k / Rr;
      let c;
      if (Math.abs(q) > 0.9) c = 0;
      else if (fold && ring < 0.1 && Math.abs(q) < 0.8) c = 1;   // surco del pliegue
      else {
        const lit = Math.sqrt(1 - q * q) * 0.6 - q * 0.4 + (fold ? (ring - 0.5) * 0.25 : 0);
        c = lit > 0.78 ? 5 : lit > 0.55 ? 4 : lit > 0.3 ? 3 : lit > 0.05 ? 2 : 1;
      }
      P.set(x + nx * k, y + ny * k, GUT[c]);
    }
  }
}
// Vejiga: saco enorme algo más ancho abajo, de borde irregular, con bilis turbia en la
// mitad de abajo (su nivel se mece), pared con venas y un brillo húmedo. k = hinchazón.
function bladder(P, cx, cy, rx, ry, k, veins, ph) {
  const RX = rx * k, RY = ry * k, lvl = 0.05 + Math.sin(ph) * 0.06;
  for (let y = -RY * 1.2; y <= RY * 1.2; y++) for (let x = -RX * 1.2; x <= RX * 1.2; x++) {
    const u = x / RX, v = y / RY, a = Math.atan2(v, u);
    const rr = (1 + 0.05 * Math.sin(3 * a + 1) + 0.03 * Math.sin(5 * a + 2)) * (1 + 0.1 * v);
    const d = Math.hypot(u, v) / rr;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d * d), lit = nz * 0.45 - u * 0.25 - v * 0.3;
    let c;
    if (d > 0.95) c = SAC.out;
    else if (v > lvl + Math.sin(u * 6 + ph * 2) * 0.03) c = SAC.fluid[lit > 0.3 ? 2 : lit > 0.05 ? 1 : 0];
    else c = SAC.wall[lit > 0.35 ? 2 : lit > 0.1 ? 1 : 0];
    if (d > 0.62 && d < 0.72 && a > -2.6 && a < -1.9) c = SAC.shine;   // brillo húmedo
    P.set(cx + x, cy + y, c);
  }
  for (const vn of veins) for (const [u, v] of vn) P.set(cx + u * RX, cy + v * RY, SAC.vein);
}
// Venas de una vejiga en coordenadas del disco unidad (fijas en todos los fotogramas).
function sacVeins(r, n) {
  const out = [];
  for (let j = 0; j < n; j++) {
    const a0 = r() * Math.PI * 2, line = [];
    let u = Math.cos(a0) * 0.9, v = Math.sin(a0) * 0.9, a = a0 + Math.PI + (r() - 0.5);
    for (let i = 0; i < 40 && Math.hypot(u, v) < 0.92; i++) { line.push([u, v]); u += Math.cos(a) * 0.025; v += Math.sin(a) * 0.025; a += (r() - 0.5) * 0.5; }
    out.push(line);
  }
  return out;
}
// Curva de Bézier cuadrática como lista de puntos (para los conductos).
const bez = (p0, p1, p2, n = 80) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, m = 1 - t; return [m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0], m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1]]; });
// Compone los fotogramas: `pipes` (tuberías que cruzan de lado a lado) y `sacs` (vejigas
// con sus conductos a una tubería). La onda de peristalsis recorre cada tubería (un bulto
// que ensancha la carne) y empuja: la vejiga se hincha cuando le llega.
function viscera({ pipes, sacs, frames = 12, seed = 1 }) {
  const r = rng(seed), W2 = (Math.PI * 2) / MID_W;
  const pathOf = (p) => { const pts = []; for (let x = 0; x <= MID_W; x += 0.5) pts.push([x, p.y + Math.sin(x * W2 * (p.h ?? 1) + p.ph) * p.amp]); return pts; };
  const pipePts = pipes.map(pathOf);
  const veins = sacs.map(() => sacVeins(r, 7));
  const out = [];
  for (let f = 0; f < frames; f++) {
    const P = pixbuf(), t = f / frames;
    const bumpAt = (p, x) => { const c = wrap((p.dir ?? 1) * t * MID_W + p.ph * 40, MID_W), dx = Math.min(Math.abs(x - c), MID_W - Math.abs(x - c)); return Math.exp(-((dx / 22) ** 2)); };
    // Conductos (detrás): de la vejiga a su tubería; se ensanchan un poco al hincharse.
    for (const sc of sacs) for (const dc of sc.ducts) {
      const p = pipes[dc.pipe], k = 1 + 0.06 * Math.sin((t + sc.ph) * Math.PI * 2);
      const ex = sc.x + dc.dx, ey = p.y + Math.sin(ex * W2 * (p.h ?? 1) + p.ph) * p.amp;
      const sy = sc.y + (ey < sc.y ? -1 : 1) * sc.ry * 0.85;
      const pts = bez([sc.x + dc.dx * 0.2, sy], [sc.x + dc.dx * 0.9, (sy + ey) / 2], [ex, ey]);
      gutTube(P, pts, (i) => dc.w * k * (1 + 0.35 * (1 - i / pts.length)), 12);
    }
    sacs.forEach((sc, j) => bladder(P, sc.x, sc.y, sc.rx, sc.ry, 1 + 0.06 * Math.sin((t + sc.ph) * Math.PI * 2), veins[j], (t + sc.ph) * Math.PI * 2));
    // Tuberías (delante): grosor base, pliegues y el bulto que avanza.
    pipes.forEach((p, j) => gutTube(P, pipePts[j], (i) => p.R * (1 + 0.4 * bumpAt(p, pipePts[j][i][0])), MID_W / 12));
    out.push(P.canvas());
  }
  return out;
}
// Digestivo 3 · Pliegues gástricos: dos tuberías gruesas de intestino cruzan el fondo
// (arriba y abajo) y entre ellas cuelgan dos vejigas enormes de bilis, unidas a ambas
// por conductos. La peristalsis recorre los tubos y las vejigas se hinchan y vacían.
function digestivo3() {
  const [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const frames = viscera({
    seed: 121,
    pipes: [{ y: 26, amp: 8, ph: 0, R: 14, dir: 1 }, { y: 166, amp: 10, ph: 2, R: 16, dir: -1 }],
    sacs: [
      { x: 70, y: 96, rx: 42, ry: 38, ph: 0, ducts: [{ pipe: 0, dx: 16, w: 10 }, { pipe: 1, dx: -20, w: 8 }] },
      { x: 190, y: 104, rx: 30, ry: 28, ph: 0.45, ducts: [{ pipe: 1, dx: 12, w: 8 }, { pipe: 0, dx: -10, w: 7 }] },
    ],
  });
  return {
    mid: frames[0], midFrames: frames, frameTime: 0.22, midGlow: glow, front: digFront(123),
    anim: { motes: { n: 9, colors: ['rgba(200,210,90,0.26)', 'rgba(220,220,120,0.2)'], vx: 0, vy: -5, size: 2, shape: 'bubble', wobble: 3 } },
  };
}
// Lóbulos pancreáticos: racimos de acinos (uvas de carne pálida, granulosa) colgados de
// un árbol de conductos que se ramifica sin orden. Tamaños muy dispares: un racimo
// enorme, otros medianos y uvas sueltas a lo largo de los conductos. Cada lóbulo se
// hincha y se vacía con su propio ritmo (secreción), en fotogramas precalculados.
const ACI = ['#140a08', '#2a1a12', '#3a2618', '#4a3220', '#5a3e28', '#6e4e34'].map(hex32);
function pancreas(seed, frames = 12) {
  const r = rng(seed), ducts = [], lobes = [];
  // Árbol de conductos: cada rama serpentea, se afina y se parte; en las puntas, racimos.
  const grow = (x, y, ang, w, depth) => {
    const pts = [], len = 26 + r() * (depth ? 30 : 70);
    for (let i = 0; i < len; i++) {
      pts.push([x, y]);
      x += Math.cos(ang); y += Math.sin(ang); ang += (r() - 0.5) * 0.18 + Math.sin(i * 0.07 + seed) * 0.01;
      // Uvas sueltas pegadas al costado del conducto.
      if (depth && r() < 0.035) { const side = r() < 0.5 ? -1 : 1, rad = 3 + r() * 5; lobes.push({ x: x - Math.sin(ang) * side * (w + rad * 0.6), y: y + Math.cos(ang) * side * (w + rad * 0.6), r: rad, ph: r() * 6, sp: 1 }); }
    }
    ducts.push({ pts, w });
    if (depth < 3 && w > 1.6) {
      const n = depth === 0 ? 3 : 1 + (r() < 0.6 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
      for (let k = 0; k < n; k++) grow(x, y, ang + (r() - 0.5) * 2.2, w * (0.55 + r() * 0.2), depth + 1);
    }
    // Racimo en la punta: más grande cuanto más grueso llega el conducto (con azar).
    if (depth >= 1 && (depth === 3 || w <= 1.6 || r() < 0.45)) {
      const S = (6 + w * 5) * (0.6 + r() * 0.9), n = 3 + Math.round(S / 5);
      for (let k = 0; k < n; k++) {
        const ka = r() * Math.PI * 2, kd = r() * S * 0.6;
        lobes.push({ x: x + Math.cos(ang) * S * 0.45 + Math.cos(ka) * kd, y: y + Math.sin(ang) * S * 0.45 + Math.sin(ka) * kd, r: S * (0.25 + r() * 0.3), ph: r() * 6, sp: 0.7 + r() * 0.6 });
      }
    }
  };
  grow(18, 176, -0.75, 7, 0);
  grow(200, 30, 2.3, 4.5, 1);
  lobes.sort((p, q) => p.r - q.r);                                  // los grandes, delante
  const out = [];
  for (let f = 0; f < frames; f++) {
    const P = pixbuf(), t = (f / frames) * Math.PI * 2;
    for (const d of ducts) gutTube(P, d.pts, (i) => d.w * (1 - 0.3 * (i / d.pts.length)), 9);
    for (const L of lobes) {
      const k = 1 + 0.07 * Math.sin(t * Math.round(L.sp) + L.ph), R = L.r * k;
      for (let y = -R - 2; y <= R + 2; y++) for (let x = -R - 2; x <= R + 2; x++) {
        const an = Math.atan2(y, x);
        // Borde abollonado: el lóbulo está hecho de acinos más pequeños.
        const rr = R * (1 + 0.09 * Math.abs(Math.sin(an * Math.max(3, Math.round(L.r / 2.2)) + L.ph)));
        const d = Math.hypot(x, y) / rr;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d * d), lit = nz * 0.55 - (x / rr) * 0.25 - (y / rr) * 0.35;
        // Grano: celdillas de acinos (hash sobre una rejilla de 3 px).
        const gx = Math.floor((L.x + x) / 3), gy = Math.floor((L.y + y) / 3);
        const h = Math.abs(Math.sin(gx * 127.1 + gy * 311.7 + seed) * 43758.5) % 1;
        let c = d > 0.9 ? 0 : lit > 0.62 ? 5 : lit > 0.4 ? 4 : lit > 0.18 ? 3 : lit > -0.05 ? 2 : 1;
        if (c > 1 && c < 5 && h < 0.18) c--;
        P.set(L.x + x, L.y + y, ACI[c]);
      }
    }
    out.push(P.canvas());
  }
  return out;
}
// Digestivo 4 · Páncreas: lóbulos pancreáticos en racimos irregulares colgados de sus
// conductos, que palpitan despacio; gotitas de jugo que flotan.
function digestivo4() {
  const [glow, gl] = canvas(MID_W, MID_H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, MID_W, MID_H);
  const frames = pancreas(141);
  return {
    mid: frames[0], midFrames: frames, frameTime: 0.2, midGlow: glow, front: digFront(133),
    anim: { motes: { n: 8, colors: ['rgba(220,190,140,0.22)'], vx: 1, vy: -3, size: 2, shape: 'bubble', wobble: 5 } },
  };
}
// Primer plano del digestivo: bultos escamados oscuros.
function digFront(seed) {
  const [front, f] = canvas(FRONT_W, FRONT_H);
  for (let x = 0; x < FRONT_W; x += 9) {
    const h = 5 + ((x * 7 + seed) % 12), w = 7 + ((x * 3 + seed) % 5);
    f.fillStyle = '#1a1406'; f.fillRect(x, FRONT_H - h, w, h);
    f.fillStyle = '#30280c'; f.fillRect(x + 1, FRONT_H - h, w - 2, 1);
  }
  return front;
}

const BUILDERS = { 'oseo:2': oseo2, 'oseo:3': oseo3, 'digestivo:2': digestivo2, 'digestivo:3': digestivo3, 'digestivo:4': digestivo4, 'pulmonar:2': pulmonar2, 'pulmonar:3': pulmonar3, 'pulmonar:4': pulmonar4, nervioso, pulmonar, digestivo, corazon, oseo, circulatorio, 'nervioso:2': nervioso2, 'nervioso:3': nervioso3, 'nervioso:4': nervioso4 };

// Ritmo de las paredes vivas de cada bioma (0..1).
const RHYTHMS = {
  nervioso: (t, s) => { s.v = Math.random() < 0.06 ? 1 : (s.v ?? 0) * 0.9; return 0.25 + s.v * 0.75; },
  pulmonar: (t) => 0.25 + 0.45 * (0.5 + 0.5 * Math.sin((t / 4.8) * Math.PI * 2)),
  digestivo: (t) => 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4)), // contracciones lentas
  oseo: (t) => 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.7)), // un latido lento y seco
  // Los capilares del circulatorio: golpe y caída lenta con rebote, al pulso de entities/Blood.js.
  circulatorio: (t) => { const p = t % 1.6; return 0.15 + 0.85 * (Math.min(1, p / 0.06) * Math.exp(-p * 2.6) + 0.22 * Math.exp(-(((p - 0.42) / 0.09) ** 2))); },
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
    if (b.anim.neural || b.anim.flow || b.anim.motes || b.anim.sacs || b.anim.cells || b.anim.cilia || b.anim.iris) {
      const [cv, ctx] = canvas(MID_W, MID_H);
      const mo = b.anim.motes;
      dyn = {
        base: b.midGlow, cv, ctx, last: 0,
        neural: b.anim.neural ? { paths: b.anim.neural.paths, sparks: [], flashes: [], calm: b.anim.neural.calm } : null,
        flow: b.anim.flow ?? null,
        cells: b.anim.cells ? { ...b.anim.cells, list: [] } : null,
        motes: mo ? Array.from({ length: mo.n }, (_, i) => ({ x: Math.random() * MID_W, y: Math.random() * MID_H, ph: Math.random() * 6, c: mo.colors[i % mo.colors.length], k: 0.6 + Math.random() * 0.8 })) : null,
      };
      b.midGlow = cv;
    }
    const midTex = canvasTexture(b.mid), glowTex = canvasTexture(b.midGlow), frontTex = canvasTexture(b.front);
    const set = {
      id, anim: b.anim, dyn, frames: b.midFrames ?? null, frameTime: b.frameTime ?? 0.2, fi: 0,
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
      while (n.sparks.length < (n.calm ? 2 : 7)) {
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
    const W = (x, n) => ((Math.round(x) % n) + n) % n;
    // Alvéolos que respiran: la pared de cada saco se enciende y se ensancha en una ola
    // que cruza el plano (cada saco llega a su punto un poco después que el anterior).
    if (s.anim.sacs) {
      const sc = s.anim.sacs, [cr, cg, cb] = sc.color;
      for (const p of sc.list) {
        const k = Math.max(0, Math.sin((t / sc.period) * Math.PI * 2 - p.x * 0.025 - p.y * 0.01));
        if (k < 0.05) continue;
        const rad = p.r * (1 + 0.16 * k);
        g.fillStyle = `rgba(${cr},${cg},${cb},${(0.2 + 0.65 * k).toFixed(2)})`;
        for (let a = 0; a < Math.PI * 2; a += 1 / rad) g.fillRect(W(p.x + Math.cos(a) * rad, MID_W), W(p.y + Math.sin(a) * rad, MID_H), 1, 1);
      }
    }
    // Glóbulos por los capilares: entran azules y salen rojos.
    const c = d.cells;
    if (c) {
      while (c.list.length < c.n) c.list.push({ path: c.paths[Math.floor(Math.random() * c.paths.length)], pos: 0, speed: c.speed[0] + Math.random() * (c.speed[1] - c.speed[0]) });
      for (const b of c.list) {
        b.pos += b.speed * dt;
        // Un recorrido es una lista de puntos o { pts, from, to } con sus propios colores.
        const pts = b.path.pts ?? b.path, from = b.path.from ?? c.from, to = b.path.to ?? c.to;
        const p = pts[Math.floor(b.pos)];
        if (!p) { b.dead = true; continue; }
        const k = b.pos / pts.length, col = from.map((v, i) => Math.round(v + (to[i] - v) * k));
        g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${c.alpha ?? 0.9})`;
        g.fillRect(W(p[0], MID_W), W(p[1], MID_H), 2, 1);
        g.fillRect(W(p[0] + 0.5, MID_W), W(p[1] - 1, MID_H), 1, 3);
      }
      c.list = c.list.filter((b) => !b.dead);
    }
    // Cilios: cada uno se inclina con un retraso respecto al vecino (ola metacrónica).
    // Esfínteres que se abren y cierran: el borde de la abertura brilla y sus cilios, que
    // la siguen, ondean hacia dentro.
    if (s.anim.iris) {
      const ir = s.anim.iris;
      for (const o of ir.list) {
        const open = 0.5 + 0.5 * Math.sin((t / ir.period) * Math.PI * 2 + o.ph);
        const rad = o.r * (0.3 + 0.6 * open);
        g.fillStyle = ir.color;
        for (let a = 0; a < Math.PI * 2; a += 0.7 / rad) {
          g.fillRect(W(o.x + Math.cos(a) * rad, MID_W), W(o.y + Math.sin(a) * rad, MID_H), 1, 1);
          g.fillRect(W(o.x + Math.cos(a) * (rad + 1), MID_W), W(o.y + Math.sin(a) * (rad + 1), MID_H), 1, 1);
        }
        g.fillStyle = ir.cilia;
        const n = Math.round(rad * 2.4);
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, sway = Math.sin(t * 5 - i * 0.45) * 0.5, len = 3 + (i % 3);
          for (let k = 1; k <= len; k++) {
            const a = a0 + Math.PI + sway * (k / len);
            const bx = o.x + Math.cos(a0) * rad, by = o.y + Math.sin(a0) * rad;
            g.fillRect(W(bx + Math.cos(a) * k, MID_W), W(by + Math.sin(a) * k, MID_H), 1, 1);
          }
        }
      }
    }
    if (s.anim.cilia) {
      g.fillStyle = s.anim.cilia.color;
      for (const bed of s.anim.cilia.beds) {
        bed.forEach((ci, i) => {
          const sway = Math.sin(t * 5 - i * 0.45) * 0.6, a = ci.a + sway;
          for (let k = 1; k <= ci.len; k++) {
            const bend = a + sway * 0.4 * (k / ci.len); // la punta se dobla más
            g.fillRect(W(ci.x + Math.cos(bend) * k, MID_W), W(ci.y + Math.sin(bend) * k, MID_H), 1, 1);
          }
        });
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
    // Plano medio animado por fotogramas (vísceras que palpitan).
    if (s.frames) {
      const i = Math.floor(t / s.frameTime) % s.frames.length;
      if (i !== s.fi) { s.fi = i; s.mid.material.map.image = s.frames[i]; s.mid.material.map.needsUpdate = true; }
    }
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
    if (this.pulseMesh) this.pulseMesh.material.opacity = RHYTHMS[s.id.split(":")[0]](t, this.state);
  }
}
