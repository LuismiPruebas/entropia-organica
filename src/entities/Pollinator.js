// POLINIZADOR (Cavidad Pulmonar): un insecto volador del tamaño de un niño, mitad
// cucaracha y mitad persona. Caparazón pardo de cucaracha sobre la espalda, vientre
// segmentado color oliva, dos pares de alas membranosas con venas, brazos humanos que
// acaban en garras, patas traseras de saltamontes colgando y, en lugar de cabeza de
// insecto, una cara humana demacrada con los ojos rojos y la boca torcida en una mueca;
// las antenas le salen de la frente.
//
// Volumen por claroscuro: cada pieza se sombrea con una luz desde arriba a la izquierda
// (cinco tonos y un brillo) y un contorno oscuro. Se dibuja en un lienzo propio en pose
// "local" (de perfil, mirando a la derecha) y se inclina con muestreo de píxel exacto.
// La mueve el comportamiento `pollinator` (entities/Enemy.js):
//   e.state  'patrol' | 'hunt' | 'windup' | 'ram' | 'recover'
//   e.tilt   inclinación (rad)   e.puff  0..1 (el abdomen se contrae al soltar una espora)
const S = 40, C = 20;
const P = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

// Paletas [contorno, sombra, base, medio, luz, brillo].
const SHELL = ['#120a08', '#2e1a10', '#5a3420', '#7e4c2c', '#a8703e', '#dcaa70'];
const BELLY = ['#141208', '#34301a', '#5a5428', '#7e7638', '#a89c58', '#d4c888'];
const SKIN = ['#160c0a', '#4a2a22', '#7e5040', '#a87458', '#cc9c7c', '#f0cca8'];
const LIMB = ['#120a08', '#3a2014', '#62381e', '#86522c', '#ac7440', '#d8a468'];
const WING = { fill: 'rgba(222,208,176,0.62)', fillFar: 'rgba(176,162,136,0.55)', vein: 'rgba(60,42,28,0.9)', edge: 'rgba(120,98,72,0.95)', shine: 'rgba(250,244,220,0.75)' };
const L = (() => { const v = [-0.5, -0.72, 0.48], n = Math.hypot(...v); return v.map((x) => x / n); })();

function line(g, x0, y0, x1, y1, c, w = 1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
  for (let i = 0; i <= n; i++) P(g, x0 + ((x1 - x0) * i) / n - (w - 1) / 2, y0 + ((y1 - y0) * i) / n - (w - 1) / 2, c, w, w);
}
// Pieza con volumen: un óvalo sombreado como una esfera iluminada desde arriba a la
// izquierda; contorno de 1 px. `ang` gira el óvalo.
function vol(g, cx, cy, rx, ry, pal, ang = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.ceil(Math.max(rx, ry)) + 1;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const u = (x * ca + y * sa) / (rx + 0.8), v = (-x * sa + y * ca) / (ry + 0.8);
    if (u * u + v * v <= 1) P(g, cx + x, cy + y, pal[0]);
  }
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const u = (x * ca + y * sa) / rx, v = (-x * sa + y * ca) / ry, d = u * u + v * v;
    if (d > 1) continue;
    const nx = (x / rx), ny = (y / ry), nz = Math.sqrt(Math.max(0, 1 - d));
    const lam = nx * L[0] + ny * L[1] + nz * L[2];
    P(g, cx + x, cy + y, lam < 0.05 ? pal[1] : lam < 0.4 ? pal[2] : lam < 0.7 ? pal[3] : lam < 0.9 ? pal[4] : pal[5]);
  }
}
// Miembro: tramo con contorno, cara iluminada arriba y sombra abajo.
function bone(g, x0, y0, x1, y1, w, pal) {
  line(g, x0, y0, x1, y1, pal[0], w + 2);
  line(g, x0, y0, x1, y1, pal[2], w);
  if (w > 1) line(g, x0 - 0.4, y0 - 0.6, x1 - 0.4, y1 - 0.6, pal[4], 1);
  if (w > 2) line(g, x0 + 0.6, y0 + 0.8, x1 + 0.6, y1 + 0.8, pal[1], 1);
}
// Dos huesos con la articulación hacia `bend` (+1/-1).
function joint(ax, ay, bx, by, l1, l2, bend) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy)));
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const th = Math.atan2(dy, dx) + bend * a;
  return [ax + Math.cos(th) * l1, ay + Math.sin(th) * l1];
}
function claw(g, x, y, ang, pal, open = 0.5, size = 3) {
  for (const k of [-1, 0, 1]) {
    const a = ang + k * (0.35 + open * 0.3), l = k ? size : size * 1.2;
    const mx = x + Math.cos(a) * l * 0.6, my = y + Math.sin(a) * l * 0.6;
    line(g, x, y, mx, my, pal[0], size > 2 ? 2 : 1);
    line(g, mx, my, x + Math.cos(a + 0.5) * l, y + Math.sin(a + 0.5) * l, pal[0]);
    P(g, mx, my, pal[4]);
  }
}
// Ala membranosa: hoja alargada desde el hombro, con venas y borde.
function wing(g, sx, sy, ang, len, wid, far) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const R = Math.ceil(len) + 1;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const u = x * ca + y * sa, v = -x * sa + y * ca;               // u: a lo largo, v: a lo ancho
    if (u < 0 || u > len) continue;
    const half = wid * Math.sin(Math.PI * Math.pow(u / len, 0.75)) * (u / len < 0.15 ? u / len / 0.15 : 1);
    if (Math.abs(v + half * 0.25) > half) continue;
    const edge = Math.abs(v + half * 0.25) > half - 1 || u > len - 1;
    P(g, sx + x, sy + y, edge ? WING.edge : far ? WING.fillFar : WING.fill);
  }
  // Venas: tres que nacen del hombro y una transversal.
  for (const k of [-0.55, 0, 0.5]) {
    const ex = len * 0.95, ey = wid * k;
    line(g, sx, sy, sx + ex * ca - ey * sa, sy + ex * sa + ey * ca, WING.vein);
  }
  const ux = len * 0.55;
  line(g, sx + ux * ca + wid * 0.6 * sa, sy + ux * sa - wid * 0.6 * ca, sx + ux * ca - wid * 0.5 * sa, sy + ux * sa + wid * 0.5 * ca, WING.vein);
  if (!far) P(g, sx + len * 0.35 * ca - wid * 0.3 * sa, sy + len * 0.35 * sa + wid * 0.3 * ca, WING.shine, 2, 1);
}

// Cara humana de perfil (mirando a la derecha), unos 10x11 px: cráneo con pelo ralo en
// la nuca, frente iluminada, ceño saliente, la cuenca hundida con su pupila roja, nariz
// que sobresale, mejilla chupada, boca torcida (abierta, con dientes), barbilla y oreja.
// `snarl` abre la boca.
function face(g, gl, cx, cy, t, snarl) {
  vol(g, cx, cy, 3.8, 4.6, SKIN);                         // cráneo
  vol(g, cx + 1.6, cy + 2, 2.6, 2.5, SKIN);                // cara: pómulo, boca y mandíbula
  for (const [x, y] of [[-2, -5], [-3, -4], [-4, -2], [-4, -1], [-1, -5]]) P(g, cx + x, cy + y, SKIN[0]); // pelo ralo
  P(g, cx - 1, cy, SKIN[2]); P(g, cx - 1, cy + 1, SKIN[1]);                                           // oreja
  P(g, cx + 1, cy - 2, SKIN[1], 3, 1);                                                                 // ceño
  // Ojo: la cuenca hundida y una pupila roja; parpadea de tarde en tarde.
  P(g, cx + 1, cy - 1, SKIN[0], 2, 1);
  if ((t % 3.3) >= 0.12) { P(g, cx + 2, cy - 1, '#ff3a1c'); P(gl, cx + 2, cy - 1, 'rgba(255,50,20,0.85)'); }
  // Nariz que sobresale, con la sombra de la aleta.
  P(g, cx + 4, cy - 1, SKIN[3]); P(g, cx + 4, cy, SKIN[4]); P(g, cx + 5, cy, SKIN[3]); P(g, cx + 4, cy + 1, SKIN[1]);
  P(g, cx + 5, cy - 1, SKIN[0]); P(g, cx + 6, cy, SKIN[0]); P(g, cx + 5, cy + 1, SKIN[0]);
  P(g, cx + 1, cy + 1, SKIN[1]);                                                                       // mejilla chupada
  // Boca torcida: la comisura cae hacia atrás; abierta, enseña los dientes.
  const open = snarl > 0.5 ? 1 : 0;
  P(g, cx + 1, cy + 3, SKIN[0]); P(g, cx + 2, cy + 2, SKIN[0], 3, 1 + open);
  if (open) { P(g, cx + 2, cy + 2, '#e8dcc0'); P(g, cx + 3, cy + 2, '#b8aa88'); P(g, cx + 4, cy + 2, '#e8dcc0'); P(g, cx + 5, cy + 3, SKIN[0]); }
  P(g, cx + 4, cy + 4, SKIN[4]); P(g, cx + 5, cy + 4, SKIN[0]);                                        // barbilla
}

// La pose completa en el lienzo local. Erguido como en la lámina: torso con el caparazón
// pardo detrás y el vientre oliva delante, alas pálidas a la espalda, brazos con garras
// por delante y las patas dobladas colgando. Unos 25 px de la coronilla a los pies.
function pose(o, ol, e, t) {
  const st = e.state ?? 'patrol';
  const wind = st === 'windup', ram = st === 'ram';
  const k = wind ? 1 - Math.max(0, e.timer ?? 0) / (e.def.windup || 1) : 0;
  const seed = e.seed ?? 0;
  const bob = ram ? 0 : Math.round(Math.sin(t * 6 + seed) * 1);
  const puff = e.puff ?? 0;
  const tx = 18, ty = 20 + bob;                               // centro del torso
  // Alas: aleteo muy rápido (en la carga, frenético). Todas a la espalda.
  const fr = wind ? 46 : ram ? 34 : 26;
  const flap = Math.sin(t * fr + seed), flap2 = Math.sin(t * fr + 1.3 + seed);
  wing(o, tx - 2, ty - 4, -2.1 + flap * 0.5, 15, 3.8, true);
  wing(o, tx - 2, ty - 2, -2.75 + flap2 * 0.4, 12, 3.2, false);
  const far = LIMB.map((c, i) => (i ? SHELL[Math.max(1, i - 1)] : c));
  // Patas dobladas que cuelgan (al embestir, estiradas hacia atrás).
  const sw = Math.sin(t * 3 + seed) * (ram ? 0 : 1);
  const hip = [tx, ty + 4];
  const legTo = (dx) => (ram ? [tx - 8 + dx, ty + 7] : [tx + 1 + dx + sw, ty + 11]);
  const leg = (dx, pal) => {
    const f = legTo(dx), kn = joint(hip[0] + dx * 0.5, hip[1], f[0], f[1], 5, 6, -1);
    bone(o, hip[0] + dx * 0.5, hip[1], kn[0], kn[1], 2, pal); bone(o, kn[0], kn[1], f[0], f[1], 1, pal);
    P(o, kn[0] - 0.5, kn[1] - 0.5, pal[5]);
    claw(o, f[0], f[1], Math.PI / 2, pal, 0.2, 2);
  };
  // Brazos humanos con garras: por delante; en la carga, echados atrás; al embestir,
  // extendidos hacia delante.
  const arm = (near) => {
    const off = near ? 1 : -1, sh = [tx + 2, ty - 3.5];
    const hand = ram ? [tx + 10, ty - 2 + off] : wind ? [tx - 3 - k * 2, ty - 4 + off - k] : [tx + 9 + off * 0.5 + Math.sin(t * 4 + off) * 0.6, ty - 1 + off * 1.5];
    const el = joint(sh[0], sh[1], hand[0], hand[1], 4, 5, wind ? 1 : -1);
    const pal = near ? LIMB : far;
    bone(o, sh[0], sh[1], el[0], el[1], 2, pal); bone(o, el[0], el[1], hand[0], hand[1], 1, pal);
    claw(o, hand[0], hand[1], Math.atan2(hand[1] - el[1], hand[0] - el[0]), pal, ram || wind ? 1 : 0.4, 2);
  };
  leg(-1, far);
  arm(false);
  // Torso: caparazón pardo de la espalda y vientre oliva segmentado delante; al soltar
  // una espora, el vientre se contrae y el último anillo se hincha.
  vol(o, tx - 1.5, ty + 0.5, 4, 5.8, SHELL, 0.15);
  const rings = [[tx + 2, ty - 1.6, 2.7, 1.7], [tx + 2.3, ty + 0.9, 2.8, 1.8], [tx + 2, ty + 3.4, 2.6, 1.7], [tx + 1.3, ty + 5.6, 2 + puff * 0.8, 1.5 + puff * 0.7]];
  rings.forEach(([x, y, rx, ry], i) => {
    const s = i === 3 ? 1 : 1 - puff * 0.1;
    vol(o, x, y, rx * s, ry * s, BELLY);
    if (i) line(o, x - rx * 0.7, y - ry - 0.3, x + rx * 0.6, y - ry - 0.3, BELLY[1]);
  });
  if (puff > 0.2) { P(o, tx + 1, ty + 7, '#c8e070', 2, 2); P(ol, tx + 1, ty + 7, 'rgba(180,230,80,0.8)', 2, 2); }
  // Pronoto: la placa del caparazón sobre los hombros, con su filo iluminado.
  vol(o, tx - 2, ty - 3.5, 3.8, 2.4, SHELL, -0.35);
  line(o, tx - 5.5, ty - 2.6, tx - 0.5, ty - 5.8, SHELL[5]);
  leg(1, LIMB);
  // Cabeza: encima y un poco delante; en la carga se echa atrás.
  const hx = Math.round(tx + 2 - k * 2), hy = Math.round(ty - 9.5 + k);
  bone(o, tx + 0.5, ty - 5, hx - 1, hy + 3, 1, SHELL);
  // Antenas finas desde la frente, hacia atrás, meciéndose.
  const aw = Math.sin(t * 2.3 + seed) * 1.2;
  for (const [ox, len] of [[0, 10], [2, 8]]) {
    const ax = hx + ox, ay = hy - 4;
    const mx = ax - 1 + aw * 0.4, my = ay - len * 0.55, ex = ax - 6 + aw, ey = ay - len * 0.75 + Math.abs(aw) * 0.4;
    line(o, ax, ay, mx, my, LIMB[3]); line(o, mx, my, ex, ey, LIMB[2]);
    P(o, ex, ey, LIMB[4]);
  }
  face(o, ol, hx, hy, t, wind || ram ? 1 : Math.max(0, Math.sin(t * 1.3)));
  arm(true);
}

let off = null;
export const POLLINATOR = {
  size: () => [S, S],
  origin: (e) => [e.cx - C, e.cy - C - 1],
  draw(g, gl, e, t) {
    off ??= [document.createElement('canvas'), document.createElement('canvas')];
    for (const c of off) { c.width = S; c.height = S; }
    const o = off[0].getContext('2d'), ol = off[1].getContext('2d');
    pose(o, ol, e, t);
    // Inclinación con muestreo de píxel exacto (sin suavizado).
    for (const [dst, src] of [[g, off[0]], [gl, off[1]]]) {
      dst.save();
      dst.imageSmoothingEnabled = false;
      dst.translate(C, C);
      dst.rotate(e.tilt ?? 0);
      dst.drawImage(src, -C, -C);
      dst.restore();
    }
  },
};
