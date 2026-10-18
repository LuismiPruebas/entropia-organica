// Fondo lejano de cada bioma (parallax 0.3): una textura de tejido que se repite sin
// costuras, pintada píxel a píxel. Cada bioma tiene su familia de color (sin negros ni
// grises: el tono más hondo sigue siendo un color) y sus motivos:
//   nervioso   tejido violeta con neuronas estrelladas, glía y axones mielinizados
//   pulmonar   parénquima turquesa cuajado de alvéolos con capilares coral
//   digestivo  carne escamada como empedrado (oliva y ocre), venas rojizas y goterones de mucosa
//   corazon    músculo carmesí estriado, con discos intercalares y capilares
// Todo lo que se repite usa coordenadas envueltas (módulo del tamaño), así los bordes
// encajan. Ver Visual.setBiome (fondo lejano) y core/Scenery.js (plano medio).

const S = 256;

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Ruido de valor que se repite cada `per` celdas (para texturas sin costura).
function tnoise(x, y, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = (v) => ((v % per) + per) % per;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed), c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  const u = s(fx), v = s(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm sin costura sobre la textura de S px: f = celdas por lado de la primera octava.
function tfbm(x, y, f, seed) {
  return tnoise((x / S) * f, (y / S) * f, f, seed) * 0.55
    + tnoise((x / S) * f * 2, (y / S) * f * 2, f * 2, seed + 1) * 0.3
    + tnoise((x / S) * f * 4, (y / S) * f * 4, f * 4, seed + 2) * 0.15;
}
// Voronoi sin costura: n celdas por lado. Devuelve [d1, d2, id, cx, cy] (en px).
function cells(x, y, n, seed) {
  const cs = S / n, gx = Math.floor(x / cs), gy = Math.floor(y / cs);
  let d1 = 1e9, d2 = 1e9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j, wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
    const fx = (cx + 0.15 + hash(wx, wy, seed) * 0.7) * cs, fy = (cy + 0.15 + hash(wx, wy, seed + 9) * 0.7) * cs;
    const d = Math.hypot(x - fx, y - fy);
    if (d < d1) { d2 = d1; d1 = d; id = hash(wx, wy, seed + 5); bx = fx; by = fy; } else if (d < d2) d2 = d;
  }
  return [d1, d2, id, bx, by];
}

// Lienzo de trabajo en floats; al final se vuelca a un canvas.
function surface() {
  const buf = new Float32Array(S * S * 3);
  const idx = (x, y) => ((((y | 0) % S) + S) % S) * S + ((((x | 0) % S) + S) % S);
  return {
    buf,
    get(x, y) { const i = idx(x, y) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; },
    set(x, y, c) { const i = idx(x, y) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; },
    blend(x, y, c, k) { const i = idx(x, y) * 3; buf[i] += (c[0] - buf[i]) * k; buf[i + 1] += (c[1] - buf[i + 1]) * k; buf[i + 2] += (c[2] - buf[i + 2]) * k; },
    canvas() {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d'), img = g.createImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        img.data[i * 4] = buf[i * 3]; img.data[i * 4 + 1] = buf[i * 3 + 1]; img.data[i * 4 + 2] = buf[i * 3 + 2]; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    },
  };
}

// Tejido base: un degradado entre tres tonos de la familia guiado por fbm.
function tissue(sf, P, seed, f = 4) {
  const lo = hexRgb(P.lo), mid = hexRgb(P.mid), hi = hexRgb(P.hi);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = tfbm(x, y, f, seed);
    sf.set(x, y, n < 0.5 ? mix(lo, mid, n * 2) : mix(mid, hi, (n - 0.5) * 2));
  }
}

// Células abombadas (lóbulos) con membrana, núcleo y brillo húmedo.
function lobules(sf, n, seed, P, { strength = 1, nucleus = true, membrane = 0.18 } = {}) {
  const mem = hexRgb(P.membrane), body = hexRgb(P.cell), shine = hexRgb(P.shine), nuc = hexRgb(P.nucleus);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [d1, d2, id, cx, cy] = cells(x, y, n, seed);
    const cs = S / n, edge = (d2 - d1) / cs;
    if (edge < membrane * 0.35) { sf.blend(x, y, mem, 0.75 * strength); continue; }
    const r = d1 / (cs * 0.55);
    const dome = clamp01(1 - r * r);
    // Luz desde arriba a la izquierda sobre la cúpula.
    const lit = clamp01(((cx - x) * 0.7 + (cy - y)) / (cs * 0.6) * 0.5 + 0.5) * dome;
    sf.blend(x, y, body, (0.25 + dome * 0.45) * strength * (0.7 + id * 0.3));
    if (lit > 0.75 && dome > 0.5) sf.blend(x, y, shine, (lit - 0.75) * 2.4 * strength);
    if (nucleus && id > 0.55 && d1 < cs * 0.12) sf.blend(x, y, nuc, 0.7 * strength);
  }
}

// Vasos: caminos aleatorios envueltos, con ramas, de grosor decreciente.
function vessels(sf, count, seed, col, colLight, { len = 220, thick = 2, branch = 0.02 } = {}) {
  const r = rng(seed), c = hexRgb(col), cl = hexRgb(colLight);
  const walk = (x, y, a, n, w) => {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < w; k++) sf.blend(x - Math.sin(a) * k, y + Math.cos(a) * k, c, 0.8);
      if (i % 3 === 0) sf.blend(x, y, cl, 0.5);
      a += (r() - 0.5) * 0.35;
      x += Math.cos(a); y += Math.sin(a);
      if (w > 1 && r() < branch) walk(x, y, a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.5), n * 0.4, w - 1);
    }
  };
  for (let v = 0; v < count; v++) walk(r() * S, r() * S, r() * Math.PI * 2, len, thick);
}

// Disco sombreado (soma, glía, gota, alvéolo...).
function disc(sf, x0, y0, rad, col, light, dark, { k = 1, rim = null } = {}) {
  const c = hexRgb(col), l = hexRgb(light), d = hexRgb(dark), rm = rim && hexRgb(rim);
  for (let y = -rad - 1; y <= rad + 1; y++) for (let x = -rad - 1; x <= rad + 1; x++) {
    const q = Math.hypot(x, y) / rad;
    if (q > 1.05) continue;
    if (q > 0.86 && rm) { sf.blend(x0 + x, y0 + y, rm, 0.85 * k); continue; }
    const lit = clamp01((-x - y) / (rad * 1.4) * 0.5 + 0.5);
    sf.blend(x0 + x, y0 + y, lit > 0.7 ? l : lit < 0.3 ? d : c, 0.9 * k);
  }
}

// ----------------------------------------------------------------------------------
const BACKDROPS = {
  // Sistema Nervioso: violeta y magenta. Neuronas estrelladas, glía y axones.
  nervioso() {
    const sf = surface();
    const P = { lo: '#2a1238', mid: '#43205c', hi: '#5e2c78', membrane: '#28102e', cell: '#4e2668', shine: '#8a5ab0', nucleus: '#7a3a6a' };
    tissue(sf, P, 11, 4);
    lobules(sf, 12, 3, P, { strength: 0.55, membrane: 0.12 });
    vessels(sf, 6, 5, '#6a2050', '#a04078', { len: 260, thick: 2, branch: 0.015 });
    const r = rng(7);
    // Axones mielinizados: cadenas de vainas claras.
    for (let k = 0; k < 4; k++) {
      let x = r() * S, y = r() * S, a = r() * Math.PI * 2;
      for (let i = 0; i < 200; i++) {
        if (i % 10 < 7) disc(sf, x, y, 2.2, '#8a5ab8', '#b88ae0', '#5a3080', { k: 0.85 });
        a += (r() - 0.5) * 0.12; x += Math.cos(a) * 1.2; y += Math.sin(a) * 1.2;
      }
    }
    // Neuronas: soma con núcleo y dendritas que se ramifican.
    const dendrite = (x, y, a, len, w, depth) => {
      for (let i = 0; i < len; i++) {
        for (let k = 0; k < w; k++) sf.blend(x - Math.sin(a) * k, y + Math.cos(a) * k, hexRgb('#9a5ac8'), 0.85);
        a += (r() - 0.5) * 0.3; x += Math.cos(a); y += Math.sin(a);
      }
      if (depth > 0) for (const s of [-1, 1]) dendrite(x, y, a + s * (0.45 + r() * 0.3), len * 0.6, Math.max(1, w - 1), depth - 1);
      else if (r() < 0.4) disc(sf, x, y, 1.5, '#ffb070', '#ffe0a0', '#c06030'); // sinapsis encendida
    };
    for (let n = 0; n < 9; n++) {
      const x = r() * S, y = r() * S, big = r() < 0.4;
      const arms = 5 + Math.floor(r() * 3);
      for (let a = 0; a < arms; a++) dendrite(x, y, (a / arms) * Math.PI * 2 + r() * 0.5, big ? 14 : 9, big ? 3 : 2, 2);
      disc(sf, x, y, big ? 7 : 5, '#9a5ac8', '#d8a8f8', '#5a2a80');
      disc(sf, x, y, big ? 3 : 2, '#4a2060', '#b080d0', '#2a1040');
    }
    // Glía: células redondas granate con núcleo.
    for (let n = 0; n < 26; n++) {
      const x = r() * S, y = r() * S, rad = 3 + r() * 4;
      disc(sf, x, y, rad, '#8a2a5a', '#c85a8a', '#5a1838');
      disc(sf, x - 1, y - 1, rad * 0.35, '#5a1838', '#a04070', '#3a1028');
    }
    return sf.canvas();
  },

  // Cavidad Pulmonar: turquesa y verde agua, con alvéolos y capilares coral.
  pulmonar() {
    const sf = surface();
    const P = { lo: '#123c44', mid: '#1e5a5e', hi: '#2e7a74', membrane: '#c8606a', cell: '#3a948a', shine: '#a8f0dc', nucleus: '#1a4a50' };
    tissue(sf, P, 21, 4);
    // Alvéolos: racimos de sacos abombados (como uvas), con pared coral y el fondo del
    // saco más hondo abajo a la derecha.
    const mem = hexRgb('#c85a68'), wall = hexRgb('#58b8a8'), shine = hexRgb('#d0fff0'), shade = hexRgb('#14444a');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [d1, d2, id, cx, cy] = cells(x, y, 9, 4);
      const cs = S / 9, edge = (d2 - d1) / cs;
      if (edge < 0.05) { sf.blend(x, y, mem, 0.85); continue; }
      const r = Math.min(1, d1 / (cs * 0.62));
      const lx = (x - cx) / (cs * 0.6), ly = (y - cy) / (cs * 0.6);
      const lit = clamp01(0.5 - lx * 0.5 - ly * 0.6);
      sf.blend(x, y, wall, 0.35 + (1 - r) * 0.3 * (0.6 + id * 0.4));
      if (lit > 0.6) sf.blend(x, y, shine, (lit - 0.6) * 0.9 * (1 - r));
      if (lit < 0.3) sf.blend(x, y, shade, (0.3 - lit) * 1.2);
      if (r > 0.82) sf.blend(x, y, mem, (r - 0.82) * 2.5); // el saco se cierra en coral
    }
    vessels(sf, 10, 6, '#e0707a', '#ffa8a8', { len: 160, thick: 1, branch: 0.03 });
    const r = rng(9);
    // Secciones de bronquiolos: anillos de cartílago claro.
    for (let n = 0; n < 6; n++) {
      const x = r() * S, y = r() * S, rad = 6 + r() * 6;
      for (let a = 0; a < Math.PI * 2; a += 0.04) for (let k = 0; k < 3; k++) {
        sf.blend(x + Math.cos(a) * (rad + k), y + Math.sin(a) * (rad + k), hexRgb(k === 0 ? '#e8fff4' : '#8ad8c4'), 0.8);
      }
      disc(sf, x, y, rad - 1, '#1e5a5e', '#3a8a84', '#164a50', { k: 0.8 });
    }
    // Esporas suspendidas: motas violáceas con halo.
    for (let n = 0; n < 30; n++) disc(sf, r() * S, r() * S, 1.5 + r() * 1.5, '#8a6ac8', '#c8b0ff', '#4a3a80', { k: 0.8 });
    return sf.canvas();
  },

  // Digestivo: ámbar, mostaza y oliva. Vellosidades, criptas y gotas de bilis.
  digestivo() {
    // Pared del tubo digestivo a lo lejos: carne escamada como empedrado (oliva y ocre,
    // con escamas rojizas sueltas), grietas oscuras, brillo húmedo y goterones de
    // mucosa. Más apagada que las paredes de delante, para que no compita con ellas.
    const sf = surface();
    const P = { lo: '#1e1806', mid: '#3a3010', hi: '#54461a', membrane: '#140f04', cell: '#6a5a1c', shine: '#b8a648', nucleus: '#3a2a10' };
    tissue(sf, P, 31, 3);
    lobules(sf, 26, 6, P, { strength: 1, nucleus: false, membrane: 0.22 });
    // Una segunda capa, más grande y rojiza en manchas (venas gruesas bajo la mucosa).
    lobules(sf, 12, 9, { membrane: '#1a0c06', cell: '#5a2e14', shine: '#a8643a', nucleus: '#000' }, { strength: 0.35, nucleus: false, membrane: 0.12 });
    const r = rng(13);
    // Goterones de mucosa colgando, con la gota abajo.
    for (let n = 0; n < 26; n++) {
      const x = r() * S, y = r() * S, h = 6 + r() * 18;
      for (let j = 0; j < h; j++) sf.blend(x, y + j, hexRgb(j % 3 ? '#7a6a20' : '#9a8a30'), 0.85);
      disc(sf, x, y + h, 1.6, '#8a7a26', '#d8c860', '#3a3010');
    }
    vessels(sf, 5, 8, '#5a2a14', '#8a4a24', { len: 160, thick: 2 });
    return sf.canvas();
  },

  // El Corazón: carmesí y escarlata. Miocardio estriado con discos intercalares.
  corazon() {
    const sf = surface();
    const P = { lo: '#5a0a18', mid: '#7a1424', hi: '#9a2030', membrane: '#4a0812', cell: '#a02838', shine: '#e86070', nucleus: '#5a0c1a' };
    tissue(sf, P, 41, 4);
    // Fibras musculares: bandas onduladas horizontales con estrías y discos claros.
    const band = hexRgb('#c43a4c'), stria = hexRgb('#681020'), disk = hexRgb('#f08a90');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wave = Math.sin((x / S) * Math.PI * 4 + tfbm(x, y, 3, 7) * 3) * 6;
      const fy = (y + wave) / 9;
      const fib = fy - Math.floor(fy);
      if (fib < 0.14) { sf.blend(x, y, stria, 0.75); continue; }
      sf.blend(x, y, band, 0.6 * Math.sin(fib * Math.PI));
      if (fib > 0.3 && fib < 0.42) sf.blend(x, y, hexRgb('#e8707c'), 0.35); // brillo de la fibra
      if (x % 3 === 0 && fib > 0.3 && fib < 0.8) sf.blend(x, y, stria, 0.25); // estrías finas
      if ((Math.floor(x / 22) + Math.floor(fy)) % 3 === 0 && x % 22 === 0) sf.blend(x, y, disk, 0.8); // discos intercalares
    }
    vessels(sf, 4, 11, '#d84858', '#ff9aa0', { len: 160, thick: 1, branch: 0.02 });
    const r = rng(17);
    for (let n = 0; n < 14; n++) disc(sf, r() * S, r() * S, 2 + r() * 2, '#e8a070', '#fff0c0', '#a86030'); // grasa
    return sf.canvas();
  },

  // Territorio del Hueso: un osario en penumbra. Huesos largos con sus cabezas
  // (fémures, húmeros) amontonados en todas direcciones, vértebras sueltas de lado y
  // costillas en hileras paralelas; entre ellos, tejido sepia y sangre reseca.
  oseo() {
    const sf = surface();
    const P = { lo: '#24140f', mid: '#3a241a', hi: '#4e3222', membrane: '#3a1a14', cell: '#5a3828', shine: '#a8866a', nucleus: '#6a2a1e' };
    tissue(sf, P, 51, 4);
    vessels(sf, 4, 13, '#5a1a12', '#7a2a1e', { len: 160, thick: 1, branch: 0.02 }); // sangre reseca
    const r = rng(19);
    const L = hexRgb('#a89070'), M = hexRgb('#7a644c'), D = hexRgb('#4a3426'), O = hexRgb('#1e120c');
    // Pinta un punto de hueso con luz arriba-izquierda (q -1..1 a través del hueso).
    const shade = (x, y, q, lit, k) => sf.blend(x, y, Math.abs(q) > 0.86 ? O : lit > 0.3 ? L : lit < -0.35 ? D : M, k);
    const knob = (x0, y0, rad, k) => {
      for (let y = -rad - 1; y <= rad + 1; y++) for (let x = -rad - 1; x <= rad + 1; x++) {
        const d = Math.hypot(x, y) / rad;
        if (d > 1.1) continue;
        shade(x0 + x, y0 + y, d > 0.95 ? 1 : d * 0.5, (-x - y) / (rad * 1.4), k);
      }
    };
    // Hueso largo: diáfisis recta y una cabeza doble en cada extremo.
    const longBone = (x0, y0, ang, len, w, k) => {
      const cs = Math.cos(ang), sn = Math.sin(ang), nx = -sn, ny = cs;
      for (const e of [0, 1]) {
        const ex = x0 + cs * len * e, ey = y0 + sn * len * e;
        knob(ex + nx * w * 0.9, ey + ny * w * 0.9, w * 1.2, k);
        knob(ex - nx * w * 0.9, ey - ny * w * 0.9, w * 1.2, k);
      }
      for (let t = w; t <= len - w; t += 0.5) for (let q = -w; q <= w; q += 0.5) {
        const waist = 1 - 0.25 * Math.sin((t / len) * Math.PI);           // más fina en el centro
        if (Math.abs(q) > w * waist) continue;
        shade(x0 + cs * t + nx * q, y0 + sn * t + ny * q, q / (w * waist), -(nx + ny) * (q / w), k);
      }
    };
    // Costillas en hilera: arcos paralelos, como una jaula derrumbada.
    const ribRow = (x0, y0, n, k) => {
      for (let i = 0; i < n; i++) for (let a = -1.3; a < 0.4; a += 0.01) {
        const cx = x0 + i * 9, rad = 34 - i * 1.5, x = cx + Math.cos(a) * rad * 0.6, y = y0 + Math.sin(a) * rad;
        for (let q = -1.5; q <= 1.5; q += 0.5) shade(x + q, y, q / 1.5, -q, k);
      }
    };
    // Vértebra suelta de lado: cuerpo, arco y apófisis.
    const vertebra = (x0, y0, k) => {
      for (let y = -4; y <= 4; y++) for (let x = -6; x <= 6; x++) shade(x0 + x, y0 + y, Math.max(Math.abs(x) / 6, Math.abs(y) / 4.3), -y / 4, k);
      knob(x0 - 1, y0 - 6, 3, k);
      sf.blend(x0 - 1, y0 - 6, O, k);
      for (let i = 0; i < 9; i++) for (let q = -1; q <= 1; q++) shade(x0 - 2 - i * 0.6 + q, y0 - 9 - i, q, -q, k);
    };
    for (let n = 0; n < 3; n++) ribRow(r() * S, r() * S, 5, 0.55);
    for (let n = 0; n < 9; n++) longBone(r() * S, r() * S, r() * Math.PI * 2, 40 + r() * 50, 2.5 + r() * 1.5, 0.7);
    for (let n = 0; n < 8; n++) vertebra(r() * S, r() * S, 0.75);
    // Musgo de sangre que cubre a manchas los huesos amontonados.
    const moss = [hexRgb('#4a0a10'), hexRgb('#6a1218'), hexRgb('#8a1e24')];
    for (let n = 0; n < 16; n++) {
      const x0 = r() * S, y0 = r() * S, rad = 6 + r() * 12;
      for (let k = 0; k < rad * rad * 1.2; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
        sf.blend(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d * 0.7, moss[Math.floor(r() * 3)], 0.55 * (1 - d / rad) + 0.2);
      }
    }
    // Sombra de ambiente: el fondo bien atrás, para que las paredes se despeguen de él.
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) sf.blend(x, y, hexRgb('#140a08'), 0.45);
    return sf.canvas();
  },

  // Sistema circulatorio: tejido granate y violeta, en penumbra, con una maraña de
  // vasos rojos, azules y violetas de todos los grosores y algún coágulo.
  circulatorio() {
    const sf = surface();
    const P = { lo: '#1a0410', mid: '#2e0818', hi: '#401028', membrane: '#22061a', cell: '#3a0a22', shine: '#8a2a4a', nucleus: '#5a0a2a' };
    tissue(sf, P, 61, 4);
    lobules(sf, 18, 62, P, { strength: 0.3, nucleus: false });
    vessels(sf, 5, 63, '#5a0a1a', '#a01a30', { len: 220, thick: 3, branch: 0.03 });
    vessels(sf, 5, 64, '#1a1a5a', '#3a4aa0', { len: 200, thick: 2, branch: 0.03 });
    vessels(sf, 8, 65, '#4a1a6a', '#8a3ac0', { len: 140, thick: 1, branch: 0.05 });
    const r = rng(66);
    for (let n = 0; n < 10; n++) disc(sf, r() * S, r() * S, 2 + r() * 3, '#6a0a1a', '#b02a3a', '#3a0410'); // coágulos
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) sf.blend(x, y, hexRgb('#0e0208'), 0.3);
    return sf.canvas();
  },
};

// ----------------------------------------------------------------------------------
// Variantes de fondo por sala (lv.backdrop: 2, 3...). Misma familia de color que su
// bioma para que se sienta el mismo lugar, pero otro paisaje.
// Sistema Nervioso 2 · Córtex piramidal: tejido violeta suave salpicado de neuronas
// piramidales pequeñas y tenues (soma triangular y una dendrita que sube recta).
BACKDROPS['nervioso:2'] = () => {
  const sf = surface();
  tissue(sf, { lo: '#1e0c2a', mid: '#2c1440', hi: '#3a1c52' }, 21, 2);
  const r = rng(24);
  const c = hexRgb('#4e2a68'), cl = hexRgb('#7a4a98');
  for (let n = 0; n < 22; n++) {
    const x0 = r() * S, y0 = r() * S, sz = 2 + r() * 2.5, len = 12 + r() * 22;
    for (let y = 0; y <= sz * 1.6; y++) for (let x = -sz; x <= sz; x++) if (Math.abs(x) <= (y / (sz * 1.6)) * sz) sf.blend(x0 + x, y0 + y, x < 0 ? cl : c, 0.7);
    for (let y = 1; y < len; y++) { sf.blend(x0 + Math.sin(y * 0.2 + n) * 0.6, y0 - y, c, 0.6 * (1 - y / len) + 0.2); if (y % 7 === 0) for (let k = 1; k < 4; k++) sf.blend(x0 + (n % 2 ? k : -k), y0 - y - k * 0.6, c, 0.35); }
    for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) sf.blend(x0 + sd * (sz + k * 0.8), y0 + sz * 1.6 + k * 0.6, c, 0.4);
  }
  return sf.canvas();
};
// Sistema Nervioso 3 · Mielina en corte: axones cortados de través, como al microscopio:
// un mosaico de anillos lila de mielina, cada uno con su núcleo oscuro.
BACKDROPS['nervioso:3'] = () => {
  const sf = surface();
  tissue(sf, { lo: '#1a0a26', mid: '#26103a', hi: '#341a4c' }, 31, 3);
  const r = rng(33);
  const ring = hexRgb('#8a64aa'), ringL = hexRgb('#b894d4'), ringD = hexRgb('#4a2a62'), core = hexRgb('#22102e'), dotc = hexRgb('#6a3a7a');
  for (let n = 0; n < 230; n++) {
    const x0 = r() * S, y0 = r() * S, R = 2.5 + r() * 4.5, th = Math.max(1.1, R * 0.32);
    for (let y = -Math.ceil(R) - 1; y <= Math.ceil(R) + 1; y++) for (let x = -Math.ceil(R) - 1; x <= Math.ceil(R) + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > R) continue;
      if (d > R - th) sf.blend(x0 + x, y0 + y, x + y < -R * 0.4 ? ringL : x + y > R * 0.6 ? ringD : ring, 0.85);
      else sf.blend(x0 + x, y0 + y, core, 0.8);
    }
    if (R > 4) sf.blend(x0 - 0.5, y0 - 0.5, dotc, 0.8);
  }
  return sf.canvas();
};
// Sistema Nervioso 4 · Nebulosa sináptica: violeta hondo con destellos desenfocados
// (vesículas) y un polvo fino de neurotransmisor.
BACKDROPS['nervioso:4'] = () => {
  const sf = surface();
  tissue(sf, { lo: '#160820', mid: '#22102e', hi: '#30163e' }, 41, 3);
  const r = rng(42);
  const glow = (x0, y0, rad, col, k) => {
    const c = hexRgb(col);
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      const q = Math.hypot(x, y) / rad;
      if (q < 1) sf.blend(x0 + x, y0 + y, c, k * (1 - q) * (1 - q));
    }
  };
  for (let n = 0; n < 16; n++) glow(r() * S, r() * S, 8 + r() * 18, r() < 0.6 ? '#7a3aa0' : r() < 0.5 ? '#a0407a' : '#3a6aa0', 0.35 + r() * 0.25);
  for (let n = 0; n < 120; n++) sf.blend(r() * S, r() * S, hexRgb(r() < 0.5 ? '#c8a0e8' : '#90c8f0'), 0.35 + r() * 0.4);
  return sf.canvas();
};

// Fondos que ofrece cada bioma (para el editor). El primero es el de siempre.
export const BACKDROP_VARIANTS = {
  nervioso: ['Bosque neuronal', 'Córtex piramidal', 'Mielina en corte', 'Nebulosa sináptica'],
};
export const backdropKey = (biome, variant) => (variant > 1 && BACKDROPS[`${biome}:${variant}`] ? `${biome}:${variant}` : biome);

export function paintBackdrop(biomeId) {
  return (BACKDROPS[biomeId] ?? BACKDROPS.nervioso)();
}
export const BACKDROP_SIZE = S;
