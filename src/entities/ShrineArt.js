// Arte del Rostro del Anfitrión (entities/Face.js): un altar de carne monumental.
// Dos pilares anillados, cables y tubos que se pierden por los lados, un tapiz de venas
// que gotea, un rostro enorme y sereno con un tercer ojo en la frente, el pecho abierto
// con dos pulmones y un corazón, y un altar de bloques con un ojo sellado.
//
// Lo quieto se pinta una vez por estado (poseído / liberado) en paintShrineBase; lo
// vivo (latido, respiración, circulación, goteos, ojos, boca, sello) en drawShrine,
// con los pulmones y el corazón cacheados por fotograma.

export const SW = 288, SH = 240;          // 18 x 15 casillas
export const HEAD = { x: 144, y: 80 };
const LUNG = [{ x: 104, y: 170 }, { x: 184, y: 170 }];
const HEART = { x: 144, y: 172 };
const THIRD = { x: 144, y: 34 };
const EYES = [{ x: 122, y: 74 }, { x: 166, y: 74 }];
const MOUTH = { x: 144, y: 114 };
const SEAL = { x: 144, y: 223 };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Ruido de valor suave en [0, 1].
function noise2(seed) {
  const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  return (x, y) => v(x / 9, y / 9) * 0.6 + v(x / 4, y / 4) * 0.3 + v(x / 2, y / 2) * 0.1;
}
const P = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
const pick = (arr, v) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(v * arr.length)))];
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// Rampas de color (de sombra a brillo).
const FLESH = ['#16040a', '#2c0a12', '#4a121a', '#6e1c24', '#92282e', '#b23c3c', '#cc5a52', '#e27e74'];
const SKIN = {
  host: ['#22080e', '#3e121a', '#5e1c24', '#80302e', '#a04640', '#bc6052', '#d27e6c', '#e8a08a'],
  para: ['#160a14', '#2a1222', '#401c30', '#58283a', '#703644', '#86484e', '#9a5c5e', '#ac7270'],
};
const TUBES = {
  red: ['#1e060c', '#46101a', '#701c24', '#98302e', '#bc4c42', '#d87060', '#ee9a84'],
  purple: ['#140c1a', '#2e2040', '#4a3a64', '#685884', '#8a7aa6', '#ad9fc4', '#cfc4e0'],
  olive: ['#100e06', '#26240e', '#3e3c1a', '#5a5826', '#787636', '#96944c', '#b4b26a'],
};
const LUNGS = {
  host: ['#2e0c14', '#561e28', '#7e3440', '#a2505a', '#c06e72', '#d88c8a', '#eaaca4'],
  para: ['#1a0c16', '#30182a', '#48283c', '#60384e', '#784c5e', '#8e6270', '#a47a84'],
};

// Curva suave por los puntos (Catmull-Rom), muestreada cada ~1 px.
function curve(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Tubo carnoso por una curva: sombreado cilíndrico (luz de arriba a la izquierda) y
// anillos cada pocos píxeles, como los cables segmentados.
function tube(g, pts, r0, r1, pal, ringEvery = 7) {
  const s = curve(pts);
  for (let i = 0; i < s.length; i++) {
    const [x, y] = s[i], [ax, ay] = s[Math.max(0, i - 1)], [bx, by] = s[Math.min(s.length - 1, i + 1)];
    let tx = bx - ax, ty = by - ay;
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    const nx = -ty, ny = tx, rad = r0 + (r1 - r0) * (i / (s.length - 1));
    const ring = ringEvery && i % ringEvery < 1.5;
    for (let o = -rad; o <= rad; o += 0.5) {
      const u = o / rad, up = -(ny * u) - (nx * u) * 0.4;
      let v = 0.5 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.32 * up + 0.22;
      if (Math.abs(u) > 0.86) v = 0.05;
      if (ring) v -= 0.18;
      P(g, x + nx * o, y + ny * o, pick(pal, v));
    }
  }
  return s;
}

// Vena que serpentea y se ramifica.
function vein(g, r, x, y, ang, len, w, cols, out) {
  const path = [[x, y]];
  for (let i = 0; i < len; i++) {
    ang += (r() - 0.5) * 0.5;
    x += Math.cos(ang); y += Math.sin(ang);
    if ((y < 190 && (x < 52 || x > SW - 52)) || x < 30 || x > SW - 30) break;   // no se sale por los lados
    P(g, x, y, cols[0], w, w);
    if (w > 1) P(g, x, y, cols[1], 1, 1);
    path.push([x, y]);
    if (w > 1 && r() < 0.04) vein(g, r, x, y, ang + (r() < 0.5 ? -0.8 : 0.8), len * 0.4, w - 1, cols, out);
  }
  if (out && path.length > 20) out.push(path);
}

// Bulbo sombreado (sacos, orejas, bloques redondos).
function bulb(g, cx, cy, rx, ry, pal, slit) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const nx = x / rx, ny = y / ry, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    let v = 0.2 + 0.65 * Math.max(0, -0.45 * nx - 0.55 * ny + 0.7 * nz);
    if (d > 0.82) v *= 0.45;
    P(g, cx + x, cy + y, pick(pal, v));
  }
  if (slit) for (let y = -ry * 0.45; y < ry * 0.45; y++) P(g, cx + Math.sin(y * 0.4), cy + y, '#1a0408', 1, 1);
}

// ---------------------------------------------------------------- base quieta
// k: 0 poseído, 1 liberado. Devuelve los lienzos y lo que necesita la animación.
export function paintShrineBase(k, seed = 11) {
  const color = canvas(SW, SH), glow = canvas(SW, SH);
  const g = color.getContext('2d'), gl = glow.getContext('2d');
  const r = rng(seed);
  const host = k > 0.5;
  const flows = [], drips = [];

  // 1) Tapiz de venas entre los pilares (y un poco tras ellos).
  const nz = noise2(seed);
  for (let y = 0; y < 212; y++) for (let x = 60; x < 228; x++) {
    const n = nz(x, y);
    P(g, x, y, pick(FLESH, 0.08 + n * 0.5));
  }
  // Hebras que cuelgan de arriba abajo (todo el tapiz chorrea venas).
  for (let i = 0; i < 90; i++) {
    let x = 60 + r() * 168, y = r() * 40;
    const L = 40 + r() * 160, w = r() < 0.3 ? 2 : 1;
    for (let k = 0; k < L; k++) { x += Math.sin(k * 0.08 + i) * 0.3; y += 1; P(g, x, y, k % 9 === 0 ? FLESH[6] : FLESH[4], w, 1); if (w > 1) P(g, x, y, FLESH[5]); }
  }
  for (let i = 0; i < 170; i++) {
    const x = 62 + r() * 164, y = r() * 200;
    vein(g, r, x, y, Math.PI / 2 + (r() - 0.5) * 1.2, 12 + r() * 40, r() < 0.3 ? 2 : 1, r() < 0.15 ? ['#4a3462', '#6a5482'] : [FLESH[5], FLESH[7]], r() < 0.04 ? flows : null);
  }
  // Chorretones que bajan desde arriba.
  for (let i = 0; i < 26; i++) {
    const x = 64 + r() * 160, L = 10 + r() * 50;
    for (let y = 0; y < L; y++) P(g, x, y, y > L - 3 ? FLESH[6] : FLESH[4]);
    drips.push({ x, y: L, len: 14 + r() * 30, p: r(), sp: 0.25 + r() * 0.4 });
  }

  // 2) Tubos que cuelgan del techo hasta la cabeza.
  for (const x of [92, 112, 176, 196]) {
    const path = tube(g, [[x + (r() - 0.5) * 10, -10], [x + (r() - 0.5) * 8, 14], [x < 144 ? x + 10 : x - 10, 34]], 3.5, 2.5, TUBES[r() < 0.3 ? 'purple' : 'red'], 6);
    flows.push(path);
  }

  // 3) Pilares anillados.
  for (const cx of [68, 220]) {
    for (let y = 0; y < 214; y++) {
      const half = 15 + Math.sin(y * 0.045 + cx) * 2 + (y > 190 ? (y - 190) * 0.25 : 0);
      for (let x = -half; x <= half; x++) {
        const u = x / half;
        let v = 0.55 * Math.sqrt(Math.max(0, 1 - u * u)) - 0.25 * u + 0.18;
        const ring = (y + Math.round(cx / 7)) % 14;
        if (ring < 2) v -= 0.25; else if (ring === 2) v += 0.12;
        if (Math.abs(u) > 0.9) v = 0.04;
        P(g, cx + x, y, pick(FLESH, v));
      }
    }
    // Venas que trepan por el pilar.
    for (let i = 0; i < 6; i++) vein(g, r, cx - 10 + r() * 20, 210, -Math.PI / 2 + (r() - 0.5) * 0.3, 60 + r() * 120, 1, [FLESH[5], FLESH[7]], i < 2 ? flows : null);
  }
  // Sacos colgados de los pilares.
  bulb(g, 70, 128, 12, 18, FLESH, true);
  bulb(g, 218, 116, 11, 15, FLESH, true);
  bulb(g, 222, 158, 13, 18, FLESH, true);
  bulb(g, 60, 176, 8, 10, FLESH, false);

  // 4) Pecho abierto: cavidad oscura llena de venas (pulmones y corazón se animan).
  for (let y = 136; y < 206; y++) for (let x = 80; x < 208; x++) {
    const dx = (x - 144) / 64, dy = (y - 172) / 38;
    if (dx * dx + dy * dy > 1) continue;
    P(g, x, y, dx * dx + dy * dy > 0.8 ? FLESH[2] : FLESH[1]);
  }
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    vein(g, r, HEART.x + Math.cos(a) * 8, HEART.y + Math.sin(a) * 8, a, 14 + r() * 22, r() < 0.4 ? 2 : 1, [FLESH[5], FLESH[7]], i % 4 === 0 ? flows : null);
  }
  // Cuello: tendones que bajan de la barbilla al pecho.
  for (let x = 120; x <= 168; x += 3) {
    const k2 = Math.abs(x - 144) / 24;
    for (let y = 120; y < 146; y++) P(g, x + Math.sin(y * 0.3 + x) * 0.6, y, pick(FLESH, 0.65 - k2 * 0.35 + ((x / 3) % 2) * 0.1), 2, 1);
  }
  // Arterias del cuello hacia la cabeza.
  for (const dx of [-14, -6, 6, 14]) flows.push(tube(g, [[HEART.x + dx * 0.4, HEART.y - 14], [HEART.x + dx, 140], [HEART.x + dx * 1.2, 118]], 2.2, 1.6, TUBES.red, 0));

  // 5) El rostro.
  const skin = host ? SKIN.host : SKIN.para;
  bulb(g, 98, 84, 6, 13, skin, false);           // orejas
  bulb(g, 190, 84, 6, 13, skin, false);
  const RX = 41, RY = 56;
  for (let y = -RY; y <= RY; y++) for (let x = -RX - 4; x <= RX + 4; x++) {
    const ny = y / RY, rxe = RX * (1 + 0.05 * -ny - 0.42 * Math.max(0, ny) ** 1.6), nx = x / rxe;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    const X = HEAD.x + x, Y = HEAD.y + y;
    const nz = Math.sqrt(1 - d);
    let v = 0.06 + 0.78 * Math.max(0, -0.42 * nx - 0.5 * ny + 0.76 * nz);
    v *= 0.55 + 0.45 * nz;                                                   // oclusión hacia los bordes
    for (const e of EYES) {
      const s = ((X - e.x) / 13) ** 2 + ((Y - e.y) / 9) ** 2;           // cuenca
      if (s < 1) v -= 0.32 * (1 - s);
      const l = ((X - e.x) / 10.5) ** 2 + ((Y - e.y - 0.5) / 6.5) ** 2;  // párpado abultado
      if (l < 1) v += 0.42 * (1 - l) * (X < e.x ? 1 : 0.75) - (Y > e.y + 3 ? 0.1 : 0);
      if (host) {
        const b = ((X - e.x) / 15) ** 2 + ((Y - e.y + 12) / 4) ** 2;    // arco de la ceja
        if (b < 1) v += 0.18 * (1 - b);
      } else {
        // Ceño: la ceja baja hacia el centro y proyecta sombra sobre el ojo.
        const inner = ((X - e.x) * (e.x < 144 ? 1 : -1)) / 15;
        const browY = e.y - 12 + inner * 5;
        const b = ((X - e.x) / 15) ** 2 + ((Y - browY) / 3.5) ** 2;
        if (b < 1) v += 0.3 * (1 - b);
        if (Math.abs(X - e.x) < 14 && Y > browY + 2.5 && Y < browY + 6) v -= 0.2;
      }
    }
    if (!host) {
      // Entrecejo fruncido, nariz arrugada y mejillas tensas por la mueca.
      if (Y > 54 && Y < 68 && (Math.abs(X - 140.5) < 0.8 || Math.abs(X - 147.5) < 0.8)) v -= 0.24;
      if (Y > 80 && Y < 92 && Math.abs(X - 144) < 8 && (Y - 80) % 3 < 1) v -= 0.14;
      for (const [ax, ay] of [[121, 98], [167, 98]]) { const q = ((X - ax) / 10) ** 2 + ((Y - ay) / 7) ** 2; if (q < 1) v += 0.14 * (1 - q); }
    }
    if (Y > 64 && Y < 102) {                                              // puente de la nariz
      const w = 3 + (Y - 64) * 0.16, dd = Math.abs(X - 144) / w;
      if (dd < 1) v += (X < 144 ? 0.26 : 0.1) * (1 - dd);
    }
    for (const [ax, ay, rr, add] of [[137, 100, 5, 0.2], [151, 100, 5, 0.1], [144, 102, 5, 0.24], [116, 90, 9, 0.2], [172, 90, 9, 0.1], [144, 128, 9, 0.16], [120, 106, 9, -0.16], [168, 106, 9, -0.18], [144, 46, 22, 0.08], [132, 122, 5, -0.12], [156, 122, 5, -0.12]]) {
      const q = ((X - ax) / rr) ** 2 + ((Y - ay) / rr) ** 2;
      if (q < 1) v += add * (1 - q);
    }
    if (host) {
      const lipU = ((X - 144) / 13) ** 2 + ((Y - 111) / 3) ** 2, lipD = ((X - 144) / 11) ** 2 + ((Y - 117.5) / 3.5) ** 2;
      if (lipU < 1) v += 0.16 * (1 - lipU) - 0.05;
      if (lipD < 1) v += 0.28 * (1 - lipD);
    }
    // Surcos nasogenianos (de las aletas de la nariz a las comisuras): hondos en la mueca.
    for (const sd of [-1, 1]) { const fx = 144 + sd * (8 + (Y - 98) * (host ? 0.25 : 0.4)); if (Y > 98 && Y < (host ? 118 : 124) && Math.abs(X - fx) < (host ? 1 : 1.4)) v -= host ? 0.18 : 0.32; }
    // Arrugas de la frente.
    if (Y > 40 && Y < 58 && Math.abs(X - 144) < 26 && Math.abs(((Y - 40) % 5) - 2) < 0.6 && Math.abs(X - 144) > 3) v -= 0.08;
    // Grietas de la piel.
    const crack = Math.sin(X * 0.9 + Math.sin(Y * 0.37) * 2.2) * Math.sin(Y * 0.83 + Math.sin(X * 0.29) * 2.1);
    if (Math.abs(crack) < 0.07) v -= 0.16;
    if (d > 0.93) v = 0.02; else if (d > 0.86) v *= 0.6;
    P(g, X, Y, pick(skin, v));
  }
  // Rasgos encima: costura de la frente, línea de los párpados, fosas, comisuras.
  for (let y = HEAD.y - RY; y < THIRD.y + 12; y++) P(g, 144 + Math.sin(y * 0.5) * 0.5, y, skin[0], 1, 1);
  for (let y = THIRD.y + 12; y < 62; y++) P(g, 144, y, skin[1]);
  for (const e of EYES) {
    if (host) for (let x = -9; x <= 9; x++) P(g, e.x + x, e.y + 1.5 + Math.abs(x) * -0.12 + (x * x) / 40, skin[0]);
    for (let x = -7; x <= 7; x += 2) P(g, e.x + x, e.y + 4.5, skin[2]);               // ojeras
  }
  for (const nx of [138, 150]) { P(g, nx - 1, 101, skin[0], 3, host ? 2 : 3); P(g, nx, 100, skin[1], 1, 1); }
  if (host) for (let x = -12; x <= 12; x++) P(g, MOUTH.x + x, MOUTH.y + Math.abs(x) * 0.06, skin[0]);
  // Venas del rostro (de la costura hacia las sienes).
  for (let i = 0; i < 10; i++) vein(g, r, 144 + (r() - 0.5) * 6, 20 + r() * 30, (r() < 0.5 ? Math.PI : 0) + (r() - 0.5) * 0.8, 14 + r() * 26, 1, host ? ['#9a2c30', '#c04a44'] : ['#3a1428', '#5a2a44'], null);

  // 6) Base orgánica: un montículo de carne con pliegues y bultos que echa raíces al
  // suelo, con el ojo sellado en un esfínter.
  const top = (x) => 197 + 5 * Math.sin(x * 0.06 + 1) + 3 * Math.sin(x * 0.17) + 10 * (Math.abs(x - 144) / 124) ** 2;
  // Raíces que se hunden en el suelo por los lados (detrás del montículo).
  for (let i = 0; i < 10; i++) {
    const sd = i % 2 ? 1 : -1, x0 = 144 + sd * (70 + r() * 40), y0 = 214 + r() * 10;
    const x1 = 144 + sd * (126 + r() * 22), y1 = SH + 4;
    tube(g, [[x0, y0], [(x0 + x1) / 2 + sd * 6, (y0 + y1) / 2 - 4 + r() * 6], [x1, y1]], 3 + r() * 3, 1.5, TUBES.red, 9);
  }
  for (let y = 186; y < SH; y++) for (let x = 14; x < SW - 14; x++) {
    const ty = top(x);
    if (y < ty) continue;
    const reach = 116 + (y - 198) * 0.7 - 6 * nz(x * 0.5, y);
    if (Math.abs(x - 144) > reach) continue;
    const n = nz(x, y * 1.4);
    let v = 0.26 + 0.42 * n - ((y - 198) / 42) * 0.2;
    if (y - ty < 2) v += 0.3; else if (y - ty < 4) v += 0.14;               // labio superior húmedo
    const fold = Math.sin((y - ty) * 0.42 + n * 6 + x * 0.015);
    if (fold > 0.9) v -= 0.28; else if (fold > 0.72) v += 0.1;               // pliegues
    if (Math.abs(x - 144) > reach - 2) v *= 0.4;
    P(g, x, y, pick(FLESH, v));
  }
  for (let i = 0; i < 14; i++) {                                            // bultos y orificios
    const x = 40 + r() * 208;
    if (Math.abs(x - SEAL.x) < 26) continue;
    const rx = 5 + r() * 7;
    bulb(g, x, top(x) + rx * 0.5, rx, rx * 0.7, FLESH, r() < 0.35);
  }
  for (let i = 0; i < 22; i++) vein(g, r, 34 + r() * 220, top(144) + r() * 20, Math.PI / 2 + (r() - 0.5) * 1.6, 10 + r() * 26, r() < 0.3 ? 2 : 1, [FLESH[5], FLESH[7]], null);
  for (let x = 34; x < SW - 34; x += 7 + Math.floor(r() * 12)) drips.push({ x, y: top(x) + 1, len: 4 + r() * 10, p: r(), sp: 0.3 + r() * 0.4 });
  // Esfínter del sello: pliegues radiales que se cierran sobre el ojo.
  for (let y = -22; y <= 22; y++) for (let x = -24; x <= 24; x++) {
    const d = Math.hypot(x, y * 1.1);
    if (d < 12 || d > 22) continue;
    const a = Math.atan2(y, x), fold = Math.sin(a * 11 + d * 0.35);
    let v = 0.3 + 0.32 * fold * (1 - (d - 12) / 10) + 0.2 * (-(x + y) / 34);
    if (d < 13.5) v = 0.06; else if (d > 20.5) v *= 0.55;
    P(g, SEAL.x + x, SEAL.y + y, pick(FLESH, v));
  }

  // 7) El parásito (poseído) o la luz del anfitrión (liberado).
  if (!host) {
    const black = ['#0c040c', '#2a1430'];
    for (let i = 0; i < 16; i++) vein(g, r, 196 + r() * 30, 30 + r() * 120, Math.PI + (r() - 0.5) * 1.2, 30 + r() * 60, 2, black, null);
    for (let i = 0; i < 8; i++) vein(g, r, 150 + r() * 30, 40 + r() * 70, Math.PI * (0.7 + r() * 0.6), 20 + r() * 30, 1, black, null);
    // Tumor sobre la sien derecha, con pústulas que brillan.
    for (let i = 0; i < 9; i++) {
      const tx = 170 + (r() - 0.3) * 22, ty = 46 + (r() - 0.5) * 26, rr = 3 + r() * 6;
      bulb(g, tx, ty, rr, rr * 0.9, ['#0e060c', '#24101e', '#3a1c2e', '#52283c', '#663446'], false);
      if (r() < 0.7) { bulb(g, tx + rr * 0.3, ty - rr * 0.3, 2, 2, ['#3a4418', '#6a7a30', '#9ab040', '#c8e070'], false); P(gl, tx + rr * 0.3 - 1, ty - rr * 0.3 - 1, '#3a5010', 3, 3); }
    }
  } else {
    for (const f of flows) if (f.length > 30 && r() < 0.35) for (const [x, y] of f) P(gl, x, y, '#2a1406');
  }
  // 8) Remate superior: nada de corte recto. La masa termina en un borde de carne
  // ondulado (más alto en el centro, sobre la cabeza), con lóbulos que cuelgan y hebras.
  const edge = (x) => 3 + 10 * nz(x * 0.7, 5) + 20 * (Math.abs(x - 144) / 144) ** 1.5 + 4 * Math.sin(x * 0.13 + 2);
  const img = g.getImageData(0, 0, SW, SH).data;
  const solid = (x, y) => img[(Math.round(y) * SW + Math.round(x)) * 4 + 3] > 0;
  for (let x = 0; x < SW; x++) {
    const e = Math.floor(edge(x));
    g.clearRect(x, 0, 1, e); gl.clearRect(x, 0, 1, e);
    if (!solid(x, e + 1)) continue;
    P(g, x, e, FLESH[1]); P(g, x, e + 1, FLESH[5]); P(g, x, e + 2, FLESH[4]); P(g, x, e + 3, FLESH[2]);
    if (r() < 0.06) drips.push({ x, y: e + 3, len: 8 + r() * 26, p: r(), sp: 0.2 + r() * 0.4 });
  }
  for (let i = 0; i < 16; i++) {                                     // lóbulos sobre el borde
    const x = 56 + r() * 176, e = edge(x);
    if (!solid(x, e + 4)) continue;
    const rx = 4 + r() * 6;
    bulb(g, x, e + rx * 0.4, rx, rx * 0.75, FLESH, r() < 0.3);
  }
  for (let i = 0; i < 30; i++) {                                     // hebras que cuelgan del borde
    const x = 56 + r() * 176, e = edge(x);
    if (!solid(x, e + 4)) continue;
    const L = 6 + r() * 20;
    for (let y = 0; y < L; y++) P(g, x + Math.sin(y * 0.3 + i) * 0.6, e + 2 + y, y > L - 2 ? FLESH[6] : FLESH[3]);
  }
  return { color, glow, flows: flows.filter((f) => f.length > 12), drips };
}

// ---------------------------------------------------------------- piezas vivas
function paintLung(side, s, host) {
  const W = 56, H = 92, c = canvas(W, H), g = c.getContext('2d');
  const pal = host ? LUNGS.host : LUNGS.para;
  const rx = 21 * s, ry = 40 * (0.96 + (s - 1) * 1.6);
  for (let y = -46; y < 46; y++) for (let x = -28; x < 28; x++) {
    const ny = y / ry, nx = x / (rx * (1 - 0.25 * Math.max(0, -ny)));
    let d = nx * nx + ny * ny;
    const inner = x * side > 0;                          // lado del corazón: muesca
    if (inner && ny > -0.1) d += 0.55 * Math.max(0, 1 - Math.abs(ny - 0.45) * 2.2) * (x * side / rx);
    if (d > 1) continue;
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d)));
    let v = 0.2 + 0.62 * Math.max(0, -0.4 * nx - 0.5 * ny + 0.75 * nz);
    const sponge = Math.sin(x * 1.3 + y * 0.4) * Math.sin(y * 1.1 - x * 0.5);
    if (sponge > 0.6) v += 0.08; else if (sponge < -0.65) v -= 0.1;
    if (Math.abs(y - (x * side * 0.6 - 4)) < 0.8 && d < 0.8) v -= 0.25;   // cisura
    if (!host && Math.sin(x * 0.7) * Math.sin(y * 0.5) > 0.9) v -= 0.3;    // manchas
    if (d > 0.86) v *= 0.5;
    P(g, W / 2 + x, H / 2 + y, pick(pal, v));
  }
  return c;
}

function paintHeart(s, host) {
  const W = 56, H = 64, c = canvas(W, H), g = c.getContext('2d');
  const cx = W / 2, cy = 34;
  const pal = host ? ['#1e040a', '#420a14', '#6a1220', '#8e1e28', '#b03030', '#cc4c42', '#e2705e'] : ['#16040c', '#320a18', '#501424', '#6c2032', '#862e40', '#9c404e', '#b05a64'];
  const vessel = (pts, r0, col) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        for (let o = -r0; o <= r0; o++) P(g, x + o, y, pick(col, 0.55 - (o / r0) * 0.35 - (Math.abs(o) === r0 ? 0.3 : 0)));
      }
    }
  };
  // Vasos por detrás.
  vessel([[cx + 6, cy - 10], [cx + 8, cy - 22], [cx + 4, cy - 30], [cx - 4, cy - 31], [cx - 9, cy - 26]], 4, pal);       // arco aórtico
  vessel([[cx - 2, cy - 10], [cx - 3, cy - 20], [cx - 9, cy - 25]], 3, host ? ['#1a1430', '#3a2a5a', '#5a4a80', '#7a6aa0'] : ['#120c1a', '#2a1e3a', '#3e2e52', '#524266']); // tronco pulmonar
  vessel([[cx + 12, cy - 4], [cx + 15, cy - 16], [cx + 15, cy - 26]], 3, pal);                                            // cava
  const rot = -0.45, cr = Math.cos(rot), sr = Math.sin(rot);
  for (let y = -26; y < 30; y++) for (let x = -27; x < 27; x++) {
    const X = (x * cr + y * sr) / s, Y = (-x * sr + y * cr) / s;
    // Cuerpo: ovoide que se estrecha hacia la punta (abajo); aurícula a la derecha arriba.
    const taper = Y > 0 ? 1 - (Y / 22) * 0.55 : 1;
    const body = (X / (15 * taper)) ** 2 + ((Y - 2) / 19) ** 2;
    const atrium = ((x / s - 9) / 7) ** 2 + ((y / s + 9) / 6) ** 2;
    if (body > 1 && atrium > 1) continue;
    const d = Math.min(body, atrium), nz = Math.sqrt(Math.max(0, 1 - d));
    const nx = X / 15, ny = (Y - 2) / 19;
    let v = 0.15 + 0.72 * Math.max(0, -0.45 * nx - 0.45 * ny + 0.76 * nz);
    if (Math.abs(X - (Y * 0.25 - 1)) < 0.8 && Y > -10 && body < 1) v -= 0.32;   // surco interventricular
    if (d > 0.86) v *= 0.45;
    P(g, cx + x, cy + y, pick(pal, v));
  }
  // Grasa y coronarias sobre el surco.
  for (let y = -12; y < 18; y++) { const X = y * 0.25 - 1, x = (X * cr - y * sr) * s, yy = (X * sr + y * cr) * s; P(g, cx + x, cy + yy, host ? '#e8c890' : '#a89070'); if (y % 4 === 0) P(g, cx + x + 1, cy + yy, host ? '#ffb0a0' : '#c890a8'); }
  for (const [x0, y0, a] of [[-8, -6, 2.1], [6, -10, 0.9]]) {
    let x = cx + x0 * s, y = cy + y0 * s, ang = a;
    for (let i = 0; i < 16; i++) { ang += Math.sin(i * 1.7 + x0) * 0.3; x += Math.cos(ang); y += Math.sin(ang); P(g, x, y, host ? '#d0605a' : '#9a5a78'); }
  }
  return c;
}

const cache = new Map();
function cached(key, make) { let c = cache.get(key); if (!c) { c = make(); cache.set(key, c); } return c; }

// Dibuja el altar entero en (g, gl) (lienzos de SW x SH).
// o: { bases: [poseído, liberado], k (0..1), t, beat (0..1 del latido), talk (0..1),
//      look: [dx, dy] hacia el jugador, wake (0..1, temblor) }
export function drawShrine(g, gl, o) {
  const { bases, k, t } = o, host = k > 0.5;
  g.clearRect(0, 0, SW, SH);
  gl.clearRect(0, 0, SW, SH);
  g.globalAlpha = 1;
  if (k < 1) g.drawImage(bases[0].color, 0, 0);
  if (k > 0) { g.globalAlpha = k; g.drawImage(bases[1].color, 0, 0); g.globalAlpha = 1; }
  gl.globalAlpha = 1 - k; gl.drawImage(bases[0].glow, 0, 0); gl.globalAlpha = k; gl.drawImage(bases[1].glow, 0, 0); gl.globalAlpha = 1;
  const base = bases[host ? 1 : 0];

  // Latido: lub-dub. beat va de 0 a 1 en cada ciclo.
  const b = o.beat, pulse = b < 0.12 ? Math.sin((b / 0.12) * Math.PI) : b > 0.2 && b < 0.32 ? 0.6 * Math.sin(((b - 0.2) / 0.12) * Math.PI) : 0;
  // Pulmones (respiran despacio, a destiempo del corazón).
  const br = 0.5 + 0.5 * Math.sin(t * (host ? 1.1 : 1.6));
  const li = Math.round(br * 7);
  for (const [i, L] of LUNG.entries()) {
    const side = i ? 1 : -1;
    const img = cached(`lung${side}${host}${li}`, () => paintLung(side, 0.95 + li * 0.012, host));
    g.drawImage(img, L.x - 28, L.y - 46);
  }
  // Corazón.
  const hi = Math.round(pulse * 5);
  const heart = cached(`heart${host}${hi}`, () => paintHeart(1 + hi * 0.035, host));
  g.drawImage(heart, HEART.x - 28, HEART.y - 30);
  if (pulse > 0.05) { gl.globalAlpha = pulse * 0.16; gl.drawImage(heart, HEART.x - 28, HEART.y - 30); gl.globalAlpha = 1; }

  // Circulación: pulsos que corren por las venas, más vivos tras cada latido.
  const fc = host ? ['#ffb070', '#ffe0a0'] : ['#b04aff', '#e0a0ff'];
  for (const [i, path] of base.flows.entries()) {
    const n = Math.max(1, Math.floor(path.length / 90)), sp = 34 + (i % 5) * 8;
    for (let j = 0; j < n; j++) {
      const s = Math.floor((t * sp + j * (path.length / n) + i * 31) % path.length);
      for (let q = 0; q < 4; q++) {
        const [x, y] = path[Math.max(0, s - q * 2)];
        P(g, x, y, q ? fc[0] : fc[1]);
        if (q < 2) P(gl, x, y, fc[0]);
      }
    }
  }
  // Goteos: se forma la gota, se estira y cae.
  for (const d of base.drips) {
    const p = (t * d.sp + d.p) % 1;
    if (p < 0.6) { const l = 1 + (p / 0.6) * 3; P(g, d.x, d.y, '#b02028', 1, l); P(g, d.x, d.y + l - 1, '#e04848'); }
    else {
      const f = (p - 0.6) / 0.4, y = d.y + 3 + f * f * d.len;
      P(g, d.x, y, '#c02830', 1, 3); P(g, d.x, y + 2, '#f06a5a');
      if (host) P(gl, d.x, y, '#3a1006', 1, 3);
    }
  }

  // Ojos. Poseído: abiertos y entornados con odio; parpadean, saltan de un punto a otro
  // (sacádicos) y se abren de par en par al hablar; la pupila se dilata. Libre: cerrados
  // en paz, con los ojos moviéndose bajo los párpados; de vez en cuando los entreabre y
  // asoma un iris dorado.
  const [lx, ly] = o.look, blink = o.blink ?? 0, wide = o.wide ?? 0, pupil = o.pupil ?? 1;
  for (const e of EYES) {
    const sd = e.x < 144 ? 1 : -1;
    if (!host) {
      const open = (0.8 + 0.35 * wide) * (1 - blink);
      if (open < 0.12) { for (let x = -9; x <= 9; x++) P(g, e.x + x, e.y + 1 + (x * x) / 60 + Math.max(0, (x * sd) / 8) * 1.2, '#1a0408', 1, 2); continue; }
      const frown = 2.4 * (1 - wide * 0.6);
      const lid = (x) => e.y + 0.5 - 3.2 * open * (1 - (x / 8.6) ** 2) + Math.max(0, (x * sd) / 8) * frown;
      const low = (x) => e.y + 0.5 + 2.6 * open * (1 - (x / 8.6) ** 2) - (Math.sin(t * 31 + e.x) > 0.96 ? 0.8 : 0); // tic
      for (let x = -8; x <= 8; x++) {
        const y0 = lid(x), y1 = low(x);
        for (let y = Math.ceil(y0); y <= y1; y++) P(g, e.x + x, y, y > y1 - 1 ? '#3a0a10' : (x * 3 + y) % 7 === 0 ? '#a03028' : '#b08a6a');
      }
      const ix = e.x + lx * 3.8, iy = e.y + 1 + ly * 1.1, ir = 2.2 + wide * 0.4;
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        const d = x * x + y * y;
        if (d > ir * ir || iy + y < lid(ix - e.x + x) || iy + y > low(ix - e.x + x)) continue;
        P(g, ix + x, iy + y, d > ir * ir * 0.45 ? '#9a0a0a' : '#ff3a1a');
      }
      const pw = pupil > 1.35 ? 2 : 1;
      P(g, ix - (pw - 1) * 0.5, iy - 1.5, '#140000', pw, 3);
      P(gl, ix - 1, iy - 1, '#ff2010', 3, 3);
      if (wide > 0.3) P(gl, ix - 2, iy - 2, '#5a0800', 5, 5);
      for (let x = -9; x <= 9; x++) P(g, e.x + x, lid(Math.max(-8.5, Math.min(8.5, x))) - 1, '#1a0408', 1, 2);   // párpado
    } else {
      const h = o.hostOpen ?? 0;
      if (h > 0.08) {
        // Entreabiertos: un iris dorado que mira con calma.
        const open = h * 0.9;
        const lid = (x) => e.y + 1 - 2.8 * open * (1 - (x / 8.6) ** 2), low = (x) => e.y + 1.5 + 1.6 * open * (1 - (x / 8.6) ** 2);
        for (let x = -8; x <= 8; x++) for (let y = Math.ceil(lid(x)); y <= low(x); y++) P(g, e.x + x, y, '#e8d0b0');
        const ix = e.x + lx * 2.5, iy = e.y + 1 + ly * 0.6;
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5 && iy + y >= lid(ix - e.x + x) && iy + y <= low(ix - e.x + x)) P(g, ix + x, iy + y, x * x + y * y > 2 ? '#a06a18' : '#ffc860');
        P(g, ix, iy, '#2a1404');
        P(gl, ix - 1, iy - 1, '#ffb040', 3, 3);
        for (let x = -9; x <= 9; x++) P(g, e.x + x, lid(Math.max(-8.5, Math.min(8.5, x))) - 1, '#5a2a24', 1, 1);
      } else {
        // Cerrados: el ojo se mueve bajo el párpado (un bulto de luz que va y viene).
        const rem = Math.sin(t * 2.3 + e.x * 0.1) * 3 + Math.sin(t * 5.1) * 0.8;
        P(g, e.x + rem - 1, e.y - 1, '#d89a86', 3, 1); P(g, e.x + rem, e.y - 2, '#e8b4a0');
        const glowK = 0.5 + 0.5 * Math.sin(t * 1.2 + e.x);
        for (let x = -8; x <= 8; x++) P(gl, e.x + x, e.y + 1.5 + (x * x) / 40, glowK > 0.5 ? '#6a4412' : '#3a2408');
      }
    }
  }
  // Tercer ojo de la frente: parpadea a su aire, mira y dilata la pupila.
  const b3 = o.blink3 ?? 0, oy3 = 8.5 * (1 - b3);
  g.fillStyle = '#1a0408';
  g.beginPath(); g.ellipse(THIRD.x, THIRD.y, 7, 8.5, 0, 0, Math.PI * 2); g.fill();
  if (oy3 > 1.5) {
    const ex = THIRD.x + lx * 1.8, ey = THIRD.y + ly * 1.8;
    g.save(); g.beginPath(); g.ellipse(THIRD.x, THIRD.y, 6.5, oy3 - 0.5, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = host ? '#e8a030' : '#c81818';
    g.beginPath(); g.ellipse(ex, ey, 5, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = host ? '#ffe2a0' : '#ff5040';
    g.beginPath(); g.ellipse(ex - 1.5, ey - 2, 1.6, 1.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = host ? '#2a1404' : '#140000';
    const pw = host ? 1.4 * pupil : 0.6 * pupil;
    g.beginPath(); g.ellipse(ex, ey, pw, host ? 1.4 * pupil : 3.6, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    gl.globalAlpha = (0.55 + 0.3 * Math.sin(t * 2.2)) * (oy3 / 8.5);
    gl.fillStyle = host ? '#ffb040' : '#ff2010';
    gl.beginPath(); gl.ellipse(THIRD.x, THIRD.y, 6, oy3 * 0.8, 0, 0, Math.PI * 2); gl.fill();
    gl.globalAlpha = 1;
  }
  for (const sy of [-1, 1]) for (let x = -7; x <= 7; x++) P(g, THIRD.x + x, THIRD.y + sy * oy3 * Math.sqrt(Math.max(0, 1 - (x / 7.2) ** 2)) - (sy < 0 ? 1 : 0), '#2a0a10');

  // Boca. Poseída: un gruñido abierto con la mandíbula que se articula por sílabas al
  // hablar, que respira, que de vez en cuando chasquea los dientes (snap), la lengua que
  // se mueve y babas que se estiran y gotean. Libre: los labios se separan al hablar.
  if (!host) {
    const snap = o.snap ?? 0;
    const H = Math.max(2, 6 + o.talk * 10 + Math.sin(t * 1.3) * 1.2 + snap * 7 - (snap > 0.85 ? 8 : 0));
    const RXm = 16 + o.talk * 2, cx = MOUTH.x, cy = MOUTH.y + 2 + o.talk * 1.5;
    for (let x = -RXm - 2; x <= RXm + 2; x++) {
      const u = Math.max(0, 1 - (x / RXm) ** 2), su = Math.sqrt(u);
      const top = cy - (H / 2) * su - 2.2 * u, bot = cy + (H / 2) * su + 0.5 * u;
      if (Math.abs(x) > RXm) { P(g, cx + x, cy - 0.5, '#1a0408', 1, 2); continue; }    // comisuras
      P(g, cx + x, top - 3, '#1a0408'); P(g, cx + x, top - 2, '#7a2a34', 1, 1);
      P(g, cx + x, bot + 2, '#1a0408'); P(g, cx + x, bot + 1, '#6a2028', 1, 1);
      P(g, cx + x, top - 2, '#6a1828', 1, 3); P(g, cx + x, top - 1, x % 3 ? '#9a3442' : '#5a1020', 1, 1);
      P(g, cx + x, bot - 1, '#7a2030', 1, 3);
      for (let y = Math.ceil(top + 1); y < bot - 1; y++) P(g, cx + x, y, '#0a0204');
    }
    // Lengua: asoma y se agita al hablar.
    if (H > 6) {
      const tx = cx + Math.sin(t * 7.3) * 3 * o.talk, ty = cy + H / 2 - 2 - o.talk * 2;
      for (let y = -2; y <= 2; y++) for (let x = -6; x <= 6; x++) if ((x / 6) ** 2 + (y / 2.4) ** 2 <= 1) P(g, tx + x, ty + y, y < -1 ? '#9a3a44' : '#6a1a24');
    }
    for (let i = -5; i <= 5; i++) {
      if (i === -1 || i === 4) continue;                                   // huecos de dientes caídos
      const x = cx + i * 2.6 - 1, u = Math.max(0, 1 - ((i * 2.6) / RXm) ** 2), su = Math.sqrt(u);
      const top = cy - (H / 2) * su - 2.2 * u + 1, bot = cy + (H / 2) * su + 0.5 * u - 1;
      const fang = Math.abs(i) === 3, broken = (i * 7 + 3) % 5 === 0;
      const lu = fang ? 6 : broken ? 1.5 : 2.5 + ((i * 5 + 9) % 3) * 0.8, ld = fang ? 5 : 2 + ((i * 3 + 8) % 3) * 0.7;
      for (let y = 0; y < lu; y++) P(g, x, top + y, y >= lu - 1.5 ? '#8a7a50' : y === 0 ? '#6a5a3a' : '#c4b488', fang && y > lu - 3 ? 1 : 2, 1);
      for (let y = 0; y < ld; y++) P(g, x, bot - y, y >= ld - 1.5 ? '#8a7a50' : y === 0 ? '#6a5a3a' : '#b4a478', fang && y > ld - 3 ? 1 : 2, 1);
    }
    // Babas: hilos que se estiran con la mandíbula y una gota que cuelga y cae.
    for (const [bx, ph] of [[-5, 0], [7, 1.7]]) {
      const stretch = H - 3 + Math.sin(t * 2 + ph) * 1.5;
      if (stretch > 2) for (let y = 0; y < stretch; y++) P(g, cx + bx + Math.sin(y * 0.5 + t) * 0.4, cy - H / 2 + 1 + y, '#9a7a80');
    }
    const dp = (t * 0.45) % 1, dropX = cx + 9, base = cy + H / 2 + 2;
    const hang = Math.min(1, dp / 0.7) * 7, fall = dp > 0.7 ? ((dp - 0.7) / 0.3) ** 2 * 30 : 0;
    for (let y = 0; y < hang; y++) P(g, dropX, base + y + (fall ? fall : 0) * (y / Math.max(1, hang)), '#a8889a');
    P(g, dropX - 0.5, base + hang + fall, '#c8a8b8', 2, 2);
    P(gl, cx - 6, cy, '#3a0408', 12, Math.max(1, H / 2));
  } else if (o.talk > 0.02) {
    const h = 0.5 + o.talk * 4.5, w = 7 + o.talk * 2;
    g.fillStyle = '#5a1a1e';
    g.beginPath(); g.ellipse(MOUTH.x, MOUTH.y + h * 0.3, w + 1, h * 0.6 + 1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0c0206';
    g.beginPath(); g.ellipse(MOUTH.x, MOUTH.y + h * 0.3, w, h * 0.6, 0, 0, Math.PI * 2); g.fill();
    if (h > 2.5) for (let x = -5; x <= 5; x += 2) P(g, MOUTH.x + x, MOUTH.y - h * 0.2, '#e8d8c0', 1, 1);
    P(gl, MOUTH.x - 4, MOUTH.y + 1, '#4a2a08', 8, 2);
  }
  // Sello del altar: un ojo que se ilumina con cada latido.
  g.fillStyle = '#1a0408';
  g.beginPath(); g.arc(SEAL.x, SEAL.y, 12.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = host ? '#c88028' : '#a01418';
  g.beginPath(); g.ellipse(SEAL.x, SEAL.y, 11, 11, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = host ? '#ffd27a' : '#e03028';
  g.beginPath(); g.ellipse(SEAL.x, SEAL.y, 7, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#100204';
  g.beginPath(); g.ellipse(SEAL.x, SEAL.y, 1.5, 6, 0, 0, Math.PI * 2); g.fill();
  for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; P(g, SEAL.x + Math.cos(ang) * 9, SEAL.y + Math.sin(ang) * 9, '#1a0408', 1, 1); }
  gl.globalAlpha = 0.35 + pulse * 0.65;
  gl.fillStyle = host ? '#ffb040' : '#ff2a1a';
  gl.beginPath(); gl.arc(SEAL.x, SEAL.y, 9, 0, Math.PI * 2); gl.fill();
  gl.globalAlpha = 1;
}
