// HIEROFANTE (Cavidad Pulmonar): una polilla pequeña que, vista de frente, parece un
// sacerdote encapuchado. En reposo está pegada a una pared o al techo con las alas
// abiertas en rombo (pardo verdoso con paneles turquesa y ribete dorado); al verte las
// pliega hacia abajo como una túnica con capucha, se te pone delante (el cristal de la
// frente y los dos ojos brillan en cian) y luego despliega las alas y gira como una peonza,
// rebotando por la sala.
//
// Se dibuja de frente en un lienzo de 36x36 centrado en la criatura; noFlip (es simétrica).
// Lo mueve `mothSpin` (entities/Enemy.js):
//   e.state  'rest' | 'wake' | 'face' | 'spinup' | 'spin' | 'dizzy'
//   e.fold   0 alas abiertas (reposo) · 1 plegadas en túnica
//   e.spinA  ángulo del giro · e.spinK 0..1 cuánto gira (alas desplegadas en hélice)
//   e.anchor superficie en reposo ('techo', 'left', 'right' o nada = suelo): gira el dibujo
const S = 36, C = 18;
// Todo el dibujo se hace en coordenadas de diseño y se escala por K alrededor del centro
// (píxeles enteros, sin suavizado): así se ajusta su tamaño sin rehacer las formas.
const K = 0.78, PX = 18, PY = 17;
const RAW = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
const P = (g, x, y, c, w = 1, h = 1) => RAW(g, PX + (x - PX) * K, PY + (y - PY) * K, c, Math.max(1, Math.round(w * K)), Math.max(1, Math.round(h * K)));
const COL = {
  out: '#0a0c0c', cloth: '#26302f', clothD: '#161d1d', clothL: '#3c4a48', fold: '#1c2524',
  panel: '#2e5a5e', panelL: '#4a8a8c', gold: '#a8823a', goldL: '#e0b866', goldD: '#5a4420',
  hood: '#384240', hoodL: '#566260', face: '#141c1a', plate: '#8a8270', plateL: '#b8ae94',
  cyan: '#4af0f0', cyanL: '#d0ffff', cyanD: '#127a80',
};
const lerp = (a, b, k) => a + (b - a) * k;
function line(g, x0, y0, x1, y1, c, w = 1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
  for (let i = 0; i <= n; i++) P(g, x0 + ((x1 - x0) * i) / n - (w - 1) / 2, y0 + ((y1 - y0) * i) / n - (w - 1) / 2, c, w, w);
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Polígono relleno con una función de color por píxel, contorno y ribete dorado en los
// lados que se indiquen (índices de arista).
function poly(g, pts, fill, goldEdges = []) {
  const sp = pts.map(([x, y]) => [PX + (x - PX) * K, PY + (y - PY) * K]);
  const xs = sp.map((p) => p[0]), ys = sp.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
    if (inPoly(x + 0.5, y + 0.5, sp)) RAW(g, x, y, fill(PX + (x + 0.5 - PX) / K - 0.5, PY + (y + 0.5 - PY) / K - 0.5));
  }
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    line(g, a[0], a[1], b[0], b[1], goldEdges.includes(i) ? COL.gold : COL.out);
  });
}

// Ala (izquierda; la derecha es su reflejo): forma interpolada entre abierta (rombo
// horizontal, k=0) y plegada (paño de túnica que cuelga, k=1).
const OPEN = [[16, 7], [1, 16], [4, 19], [11, 20], [15, 16]];
const FOLD = [[15, 9], [10, 12], [7, 28], [12, 29], [14, 17]];
function wingPts(k, side) {
  return OPEN.map((p, i) => {
    const x = lerp(p[0], FOLD[i][0], k), y = lerp(p[1], FOLD[i][1], k);
    return [side < 0 ? x : 2 * C - x, y];
  });
}
function wing(g, gl, k, side, t) {
  const pts = wingPts(k, side);
  poly(g, pts, (x, y) => {
    const dx = Math.abs(x + 0.5 - C);
    // Abierta: un panel turquesa interior con venas; plegada: tela con pliegues verticales.
    if (k < 0.5) {
      const inner = dx > 3 && dx < 11 && y < 18 && y > 9 && (dx - 3) > (y - 13) * 0.6;
      if (inner) return (x + y) % 4 === 0 ? COL.panelL : COL.panel;
      return dx > 10 ? COL.clothD : COL.cloth;
    }
    const stripe = Math.floor(dx) % 3;
    return stripe === 0 ? COL.fold : stripe === 1 ? COL.cloth : COL.clothL;
  }, [0, 1, 2]);
  // Bajo deshilachado con motas doradas (el bordado del dobladillo).
  const [a, b] = [pts[2], pts[3]];
  for (let u = 0.1; u < 1; u += 0.22) P(g, lerp(a[0], b[0], u), lerp(a[1], b[1], u) - 1, (Math.floor(u * 9 + t * 2) % 2) ? COL.goldL : COL.goldD);
}
// Capucha con el cristal de la frente, cara oscura con dos ojos cian y el pecho.
function hoodAndFace(g, gl, t, fold, glow) {
  const hy = lerp(4, 2, fold);
  poly(g, [[C, hy], [C - 5, 12], [C - 3, 14], [C + 3, 14], [C + 5, 12]], (x, y) => (x < C - 1 && y < 11 ? COL.hoodL : COL.hood), [0, 4]);
  // Cristal: rombo cian que late.
  const pulse = 0.75 + 0.25 * Math.sin(t * 4) + glow * 0.4;
  for (const [x, y, c] of [[0, -2, COL.cyanD], [-1, -1, COL.cyan], [0, -1, COL.cyanL], [1, -1, COL.cyan], [-2, 0, COL.cyanD], [-1, 0, COL.cyanL], [0, 0, '#ffffff'], [1, 0, COL.cyanL], [2, 0, COL.cyanD], [-1, 1, COL.cyan], [0, 1, COL.cyanL], [1, 1, COL.cyan], [0, 2, COL.cyanD]]) {
    P(g, C + x, 9 + y, c);
  }
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    const d = Math.abs(x) + Math.abs(y);
    if (d <= 3) P(gl, C + x, 9 + y, `rgba(80,240,240,${(0.9 - d * 0.22) * pulse})`);
  }
  // Cara: hueco oscuro bajo la capucha con dos ojos cian.
  P(g, C - 3, 14, COL.out, 7, 3); P(g, C - 2, 14, COL.face, 5, 2);
  const blink = (t % 2.9) < 0.1;
  if (!blink) for (const ex of [C - 2, C + 1]) { P(g, ex, 15, COL.cyan, 2, 1); P(gl, ex, 15, 'rgba(80,240,240,0.9)', 2, 1); }
  // Placa del pecho (crema), visible con las alas abiertas.
  if (fold < 0.8) { P(g, C - 3, 17, COL.out, 7, 3); P(g, C - 2, 17, COL.plate, 5, 2); P(g, C - 2, 17, COL.plateL, 2, 1); }
}
// Abdomen: anillos dorados que se estrechan hasta un aguijón; se mece.
function abdomen(g, t, sway) {
  const rings = [[19, 3], [21.5, 2.5], [24, 2], [26.5, 1.5], [29, 1]];
  rings.forEach(([y, r], i) => {
    const x = C + Math.sin(t * 3 - i * 0.6) * sway * i * 0.4;
    P(g, x - r - 1, y - 1, COL.out, r * 2 + 2, 3);
    P(g, x - r, y - 1, COL.gold, r * 2, 2);
    P(g, x - r, y - 1, COL.goldL, Math.max(1, r - 0.5), 1);
    P(g, x - r, y + 1, COL.goldD, r * 2, 1);
  });
  P(g, C + Math.sin(t * 3 - 3) * sway * 1.6, 31, COL.goldD, 1, 3);
}

// Giro de peonza: el cuerpo en túnica en el centro y las dos alas desplegadas como aspas
// que dan vueltas (su ancho aparente varía con el ángulo; la de detrás, más oscura), con
// estelas doradas en el brillo.
function spinPose(g, gl, e, t) {
  const a = e.spinA ?? 0, k = e.spinK ?? 1;
  const blades = [a, a + Math.PI].map((ang) => ({ ext: Math.cos(ang) * 15 * k, front: Math.sin(ang) > 0 }));
  const blade = (b) => {
    const tip = C + b.ext, w = 8;
    if (Math.abs(b.ext) < 1) return;
    poly(g, [[C, 10], [tip, 12], [tip, 12 + w * 0.6], [C, 19]], (x) => {
      const u = Math.abs(x + 0.5 - C) / Math.abs(b.ext);
      return b.front ? (u > 0.75 ? COL.panelL : u > 0.35 ? COL.panel : COL.cloth) : COL.clothD;
    }, [1]);
  };
  for (const b of blades) if (!b.front) blade(b);
  // El cuerpo, recogido.
  abdomen(g, t, 0.4);
  hoodAndFace(g, gl, t, 1, 1);
  for (const b of blades) if (b.front) blade(b);
  // Estela dorada: un anillo de chispas alrededor que gira.
  for (let i = 0; i < 10; i++) {
    const u = a * 1 + (i / 10) * Math.PI * 2, x = C + Math.cos(u) * 15 * k, y = 15 + Math.sin(u) * 3;
    P(gl, x, y, `rgba(255,${180 + (i % 3) * 20},80,${0.25 + 0.5 * (i / 10) * k})`, 2, 1);
  }
}

let off = null;
function pose(o, ol, e, t) {
  const st = e.state ?? 'rest';
  if (st === 'spin' || st === 'spinup' || st === 'dizzy') return spinPose(o, ol, e, t);
  const fold = e.fold ?? 0;
  // Reposo: alas que tiemblan de vez en cuando (un estremecimiento de polilla).
  const twitch = st === 'rest' && (t % 4.3) < 0.25 ? Math.sin(t * 60) * 0.06 : 0;
  const kL = Math.max(0, Math.min(1, fold + twitch)), kR = Math.max(0, Math.min(1, fold - twitch));
  const sway = st === 'face' ? 1 : 0.4;
  abdomen(o, t, sway);
  // Plegada: el cuerpo es una túnica oscura con chevrones dorados entre las dos alas.
  if (fold > 0.4) {
    const h = Math.round(9 + fold * 4);
    P(o, C - 5, 14, COL.out, 11, h + 1);
    P(o, C - 4, 14, COL.clothD, 9, h);
    P(o, C - 4, 14, COL.cloth, 3, h);
    for (let y = 17; y < 14 + h - 1; y += 4) { line(o, C - 3, y, C, y + 2, COL.gold); line(o, C, y + 2, C + 3, y, COL.gold); }
  }
  wing(o, ol, kL, -1, t);
  wing(o, ol, kR, 1, t);
  hoodAndFace(o, ol, t, fold, st === 'face' ? 0.4 : 0);
}

export const HIEROPHANT = {
  size: () => [S, S],
  origin: (e) => [e.cx - C, e.cy - C + 2],
  noFlip: true,
  draw(g, gl, e, t, game) {
    off ??= [document.createElement('canvas'), document.createElement('canvas')];
    for (const c of off) { c.width = c.height = S; }
    const o = off[0].getContext('2d'), ol = off[1].getContext('2d');
    pose(o, ol, e, t);
    // Mimetismo: pegada a la pared se tiñe de su color (el del tejido del bioma) y su
    // brillo se apaga casi del todo; solo el cristal sigue latiendo, muy tenue.
    const m = e.mimic ?? 0;
    if (m > 0) {
      o.save(); o.globalCompositeOperation = 'source-atop';
      o.globalAlpha = 0.72 * m; o.fillStyle = game?.room?.biome?.mimic ?? game?.room?.biome?.camo ?? '#3a4458';
      o.fillRect(0, 0, S, S); o.restore();
      ol.save(); ol.globalCompositeOperation = 'destination-out';
      ol.globalAlpha = 0.85 * m; ol.fillRect(0, 0, S, S); ol.restore();
    }
    // Giro: en reposo, hacia su superficie; girando, el bamboleo de la peonza.
    const rest = { techo: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[e.anchor] ?? 0;
    const rot = (e.state === 'rest' || e.state === 'wake') ? rest * (1 - (e.unrot ?? 0)) : e.state === 'spin' ? Math.sin(t * 9) * 0.18 : e.state === 'dizzy' ? Math.sin(t * 5) * 0.45 : 0;
    for (const [dst, src] of [[g, off[0]], [gl, off[1]]]) {
      dst.save(); dst.imageSmoothingEnabled = false;
      dst.translate(C, C); dst.rotate(rot); dst.drawImage(src, -C, -C);
      dst.restore();
    }
  },
};
