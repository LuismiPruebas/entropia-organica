import { TILE } from '../core/Physics.js';
import { px, seg, blob, part, mix } from './Rig.js';
import { canvasSprite } from './Puzzles.js';

// Decoración del Sistema Nervioso: estructuras que se colocan en la sala (editor:
// "Decoración (sistema nervioso)") para dar variedad al fondo. Animadas, sin colisión.
// De fondo por defecto (las paredes de la sala las tapan); con front: true, por delante.
//
// En la sala: decor: [{ x, y, type, flip?, front?, invert? }]. (x, y) es la casilla del
// centro de su base; con invert: true la estructura va boca abajo, colgada del techo de
// esa casilla.
//
// Muro eléctrico: un ganglio en el suelo y otro colgado del techo (2x2 casillas cada uno), en la misma columna
// (o una al lado), se tienden un haz de rayos de techo a suelo que se enciende cada poco
// (wall: { on, off, delay } en el del suelo, en segundos). Avisa cargando antes de
// encenderse; encendido, hiere y empuja. Las neuronas son solo decoración.

const K = '#140c10';
const C = {                       // paleta nerviosa
  tissue: '#4a3058', tissueD: '#2e1c3a', tissueL: '#6a4a82', hi: '#8a6ab8',
  myelin: '#d8c8e8', myelinD: '#9a88b0', imp: '#82d2ff', impL: '#e0f6ff', gold: '#ffd25a',
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Rama que serpentea desde (x, y) con ángulo a: devuelve sus puntos.
function branch(r, x, y, a, len, wobble = 0.35) {
  const pts = [[x, y]];
  for (let i = 0; i < len; i++) { a += (r() - 0.5) * wobble; x += Math.cos(a); y += Math.sin(a); pts.push([x, y]); }
  return pts;
}
const drawPath = (g, pts, c, w = 1) => { for (let i = 1; i < pts.length; i++) seg(g, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, w); };
const glowAt = (gl, x, y, c, n = 2) => px(gl, x - (n >> 1), y - (n >> 1), c, n, n);

// Cada tipo: tamaño del lienzo, cómo se ancla y su dibujo (geometría fija + animación).
export const DECOR = {
  // Neurona: soma con núcleo, dendritas ramificadas y axón mielinizado hacia abajo.
  neurona: {
    name: 'Neurona', w: 72, h: 80, sway: true, soma: [36, 30],
    setup(r) {
      const cx = 36, cy = 30, dend = [];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55 + (r() - 0.5) * 0.3;
        const main = branch(r, cx + Math.cos(a) * 7, cy + Math.sin(a) * 6, a, 16 + r() * 8);
        const end = main[main.length - 1], kids = [];
        for (const s of [-1, 1]) kids.push(branch(r, end[0], end[1], a + s * 0.6, 6 + r() * 6));
        dend.push({ main, kids, ph: r() * 3 });
      }
      const axon = branch(r, cx, cy + 8, Math.PI / 2, 40, 0.12);
      return { cx, cy, dend, axon };
    },
    draw(g, gl, t, s) {
      const fire = (t % 2.6) / 2.6;                         // ciclo: entra señal, dispara
      for (const d of s.dend) {
        drawPath(g, d.main, C.tissueD, 3); drawPath(g, d.main, C.tissue, 2);
        for (const k of d.kids) { drawPath(g, k, C.tissueD, 2); drawPath(g, k, C.tissueL, 1); }
        // Impulsos entrantes: desde las puntas hacia el soma.
        const u = ((t * 0.7 + d.ph) % 1), i = Math.floor((1 - u) * (d.main.length - 1));
        const [x, y] = d.main[i]; px(g, x, y, C.imp, 2, 2); glowAt(gl, x, y, C.imp, 3);
      }
      // Axón con vainas de mielina; el disparo baja por él.
      drawPath(g, s.axon, C.tissueD, 3);
      for (let i = 2; i < s.axon.length - 1; i += 6) { const [x, y] = s.axon[i]; blob(g, x, y + 1, 2.4, 2.6, C.myelin, C.myelinD); }
      const shot = fire > 0.55 ? Math.floor(((fire - 0.55) / 0.45) * (s.axon.length - 1)) : -1;
      if (shot >= 0) { const [x, y] = s.axon[shot]; px(g, x - 1, y - 1, C.impL, 3, 3); glowAt(gl, x, y, C.imp, 5); }
      // Soma: se ilumina al disparar (y mientras su muro eléctrico carga o arde).
      const flash = (fire > 0.5 && fire < 0.62) || (s.charge ?? 0) > 0.05 ? 1 : 0;
      if ((s.charge ?? 0) > 0.05) for (let k = 0; k < 3; k++) { const a = Math.random() * Math.PI * 2, d = 9 + Math.random() * 6; seg(g, s.cx + Math.cos(a) * 7, s.cy + Math.sin(a) * 6, s.cx + Math.cos(a) * d, s.cy + Math.sin(a) * d, C.impL); seg(gl, s.cx, s.cy, s.cx + Math.cos(a) * d, s.cy + Math.sin(a) * d, C.imp); }
      part(g, s.cx, s.cy, 9 + flash * 0.6, 8 + flash * 0.6, flash ? C.hi : C.tissueL, C.tissue);
      blob(g, s.cx + 1, s.cy, 3.4, 3.2, flash ? C.impL : '#2a1a40');
      px(g, s.cx, s.cy - 1, flash ? '#ffffff' : C.hi, 2, 2);
      if (flash) blob(gl, s.cx, s.cy, 8, 7, '#2a5a8a');
      else glowAt(gl, s.cx + 1, s.cy, '#1a3050', 4);
    },
  },
  // Ganglio: un racimo pequeño de bulbos nerviosos que se inflaman (se hinchan de golpe y
  // se deshinchan despacio, en una ola que sale del centro); al hincharse la piel se tensa,
  // se le marcan las venas y brilla. Al cargar su muro eléctrico se quedan hinchados al
  // máximo y chispean.
  ganglio: {
    name: 'Ganglio', w: 32, h: 30, soma: [16, 13],
    setup(r) {
      const b = [{ x: 16, y: 14, r: 4.6, d: 0 }];
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 1.15 + (r() - 0.5) * 0.3, d = 9 + r() * 1.5;
        b.push({ x: 16 + Math.cos(a) * d * 1.1, y: 14 + Math.sin(a) * d * 0.95 + 1, r: 2.8 + r() * 1.2, d: 1 });
      }
      const roots = [];
      for (let i = 0; i < 3; i++) roots.push(branch(r, 12 + i * 4, 17, Math.PI / 2 + (i - 1) * 0.5, 7 + r() * 5, 0.4));
      return { b, roots, ph: r() * 6 };
    },
    draw(g, gl, t, s) {
      const P = { rim: '#3a1048', base: '#9a54b6', mid: '#d08ae6', light: '#f6dcff', vein: '#e0405e', glow: '#1e0a2a' };
      const ch = s.charge ?? 0;
      // Inflamación: subida rápida y bajada lenta; los de fuera, un poco después.
      const swell = (delay) => {
        const u = ((t * 0.55 + s.ph - delay * 0.08) % 1 + 1) % 1;
        const k = u < 0.18 ? u / 0.18 : Math.max(0, 1 - (u - 0.18) / 0.62);
        return Math.max(ch, k * k * (3 - 2 * k));
      };
      for (const p of s.roots) { drawPath(g, p, P.rim, 2); drawPath(g, p, P.base, 1); }
      // Fibras del centro a cada bulbo.
      for (const o of s.b.slice(1)) { seg(g, 16, 13, o.x, o.y, P.rim, 3); seg(g, 16, 13, o.x, o.y, P.base, 1); }
      // De fuera hacia dentro, para que el central quede encima.
      for (const o of [...s.b].reverse()) {
        const k = swell(o.d), rr = o.r * (0.85 + 0.5 * k);
        part(g, o.x, o.y, rr, rr * 0.92, mix(P.base, P.mid, k), mix(P.rim, P.base, k * 0.4), P.light);
        // Piel tensa: brillo que crece y venas rojas que se marcan.
        if (k > 0.25) {
          px(g, o.x - rr * 0.45, o.y - rr * 0.5, P.light, Math.max(1, Math.round(rr * 0.35)), 1);
          const vk = Math.min(1, (k - 0.25) / 0.6);
          if (vk > 0.3) { seg(g, o.x - rr * 0.6, o.y + rr * 0.1, o.x - rr * 0.1, o.y + rr * 0.45, P.vein); seg(g, o.x + rr * 0.15, o.y - rr * 0.55, o.x + rr * 0.55, o.y - rr * 0.1, P.vein); }
        }
        // Brillo propio (se lee a oscuras), más fuerte al hincharse.
        blob(gl, o.x, o.y, rr * (0.35 + 0.3 * k), rr * (0.3 + 0.3 * k), mix(P.glow, ch > 0.05 ? '#3a8aff' : '#6a2a8a', k * 0.7));
      }
      // Núcleo del central.
      blob(g, 16, 13, 1.6 + swell(0) * 0.8, 1.4 + swell(0) * 0.6, ch > 0.05 ? C.impL : '#3a1448');
      // Cargando o encendido: chispas que saltan del centro.
      if (ch > 0.05) for (let k = 0; k < 2 + ch * 3; k++) { const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 8; seg(g, 16, 13, 16 + Math.cos(a) * d, 13 + Math.sin(a) * d, C.impL); seg(gl, 16, 13, 16 + Math.cos(a) * d, 13 + Math.sin(a) * d, C.imp, 2); }
    },
  },
  // Pensamiento Bucle: un pensamiento atrapado en su propia repetición. Acuclillado, se
  // aprieta el cráneo con las manos y se mece; la espiral de su cara no deja de girar.
  // Lo rodea un anillo de neuronas por el que dan vueltas los impulsos (con flechas que
  // marcan el sentido), y cada neurona se enciende al pasar uno. Sus raíces laten contra
  // el suelo. Si te acercas, susurra un pensamiento que vuelve siempre al principio.
  // Volumen con claroscuro: luz desde arriba a la izquierda y un contraluz rosado (el
  // brillo del anillo rebotando) por la derecha.
  bucle: {
    name: 'Pensamiento Bucle', w: 76, h: 74, soma: [38, 34],
    whisper: [
      '¿Y si lo hice mal?',
      'Tengo que comprobarlo otra vez.',
      'Ya lo comprobé. ¿Lo comprobé bien?',
      'Tengo que comprobarlo otra vez.',
      '¿Y si lo hice mal?',
    ],
    setup(r) {
      const roots = [];
      for (let i = 0; i < 6; i++) roots.push(branch(r, 31 + i * 2.8, 64, Math.PI / 2 + (i - 2.5) * 0.4, 5 + r() * 7, 0.5));
      const nodes = [0.05, 0.27, 0.48, 0.66, 0.86].map((u) => ({ u, arms: [...Array(5)].map(() => ({ a: r() * Math.PI * 2, l: 3 + r() * 3.5 })) }));
      return { roots, nodes };
    },
    draw(g, gl, t, s) {
      const BODY = ['#170c20', '#2c1838', '#4a2c5c', '#6c4884', '#9670b0'], RIM = '#e07aac';
      const BONE = ['#4a3c3c', '#7c6e68', '#ad9f94', '#d6cabe', '#f4ece2'];
      const P = { vein: '#b8588c', veinL: '#f0a0c8', spiral: '#c8507a', ring: '#7a3268', ringL: '#c86aa8', ringD: '#3e1838', shadow: '#0c0610' };
      const RX = 38, RY = 34, R = 31, spin = t * 0.15;
      const at = (u, rr = R) => { const a = u * Math.PI * 2 + spin - Math.PI / 2; return [RX + Math.cos(a) * rr, RY + Math.sin(a) * rr * 0.96]; };
      const LX = -0.55, LY = -0.83;                         // luz: arriba a la izquierda
      // Volumen sombreado: elipse (rx, ry) con rampa de 5 tonos y contraluz por la derecha.
      const shade = (cx, cy, rx, ry, ramp, rim) => {
        for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
          const nx = x / rx, ny = y / ry, d = nx * nx + ny * ny;
          if (d > 1) continue;
          const nz = Math.sqrt(1 - d), lit = Math.max(0, -(nx * LX + ny * LY) * 0.8 + nz * 0.45 + 0.12);
          let c = ramp[Math.min(4, Math.floor(lit * 4.2))];
          if (d > 0.86) c = ramp[0];                                             // contorno en sombra
          if (rim && nx > 0.55 && d > 0.45 && d <= 0.85) c = rim;                // contraluz
          px(g, cx + x, cy + y, c);
        }
      };
      // Extremidad sombreada: cápsula de (x0,y0,r0) a (x1,y1,r1).
      const limb = (x0, y0, x1, y1, r0, r1, ramp, rim) => {
        const minx = Math.floor(Math.min(x0, x1) - Math.max(r0, r1)) - 1, maxx = Math.ceil(Math.max(x0, x1) + Math.max(r0, r1)) + 1;
        const miny = Math.floor(Math.min(y0, y1) - Math.max(r0, r1)) - 1, maxy = Math.ceil(Math.max(y0, y1) + Math.max(r0, r1)) + 1;
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
        for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
          const u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
          const qx = x0 + dx * u, qy = y0 + dy * u, rr = r0 + (r1 - r0) * u;
          const ex = x - qx, ey = y - qy, dd = Math.hypot(ex, ey) / rr;
          if (dd > 1) continue;
          const nx = ex / rr, ny = ey / rr, nz = Math.sqrt(Math.max(0, 1 - dd * dd));
          const lit = Math.max(0, -(nx * LX + ny * LY) * 0.8 + nz * 0.45 + 0.12);
          let c = ramp[Math.min(4, Math.floor(lit * 4.2))];
          if (dd > 0.82) c = ramp[0];
          if (rim && nx > 0.5 && dd > 0.55 && dd <= 0.85) c = rim;
          px(g, x, y, c);
        }
      };
      blob(g, 38, 69, 22, 2.6, P.shadow);
      // --- El anillo: axón, flechas y neuronas.
      for (let i = 0; i < 130; i++) { const [x, y] = at(i / 130); px(g, x - 1, y - 1, P.ringD, 3, 3); }
      for (let i = 0; i < 130; i++) { const [x, y] = at(i / 130); px(g, x, y - 0.6, i % 9 < 5 ? P.ring : P.ringL); }
      for (const u of [0.16, 0.57, 0.76]) {
        const [x, y] = at(u), [nx, ny] = at(u + 0.01), a = Math.atan2(ny - y, nx - x);
        for (const sd of [-1, 1]) seg(g, x, y, x - Math.cos(a + sd * 0.7) * 4, y - Math.sin(a + sd * 0.7) * 4, P.ringL, 1);
      }
      const imps = [0, 0.33, 0.66].map((o) => (t * 0.22 + o) % 1);
      for (const u of imps) for (let k = 0; k < 5; k++) { const [x, y] = at(u - k * 0.007); px(g, x - 0.5, y - 0.5, k ? P.ringL : '#ffffff', 2, 2); if (k < 2) px(gl, x - 1, y - 1, '#a04aa0', 3, 3); }
      for (const n of s.nodes) {
        const [x, y] = at(n.u);
        const near = Math.min(...imps.map((u) => Math.abs(((u - n.u + 1.5) % 1) - 0.5))), lit = Math.max(0, 1 - near / 0.05);
        for (const arm of n.arms) {
          const a = arm.a + Math.sin(t * 1.3 + arm.a) * 0.15;
          seg(g, x, y, x + Math.cos(a) * arm.l, y + Math.sin(a) * arm.l, P.ringD, 2);
          seg(g, x, y, x + Math.cos(a) * arm.l, y + Math.sin(a) * arm.l, P.ring, 1);
          px(g, x + Math.cos(a) * (arm.l + 1), y + Math.sin(a) * (arm.l + 1), lit > 0.3 ? '#ffe0f0' : P.ringL);
        }
        shade(x, y, 3 + lit * 0.6, 2.8 + lit * 0.6, lit > 0.3 ? ['#5a1a4a', '#a0407a', '#e070b0', '#ffb0dc', '#ffe8f4'] : ['#2a0c26', '#5a1a4a', '#8a3070', '#b85a98', '#e090c0']);
        px(gl, x - 1, y - 1, mix('#200a20', '#c04a9a', 0.25 + lit * 0.75), 3, 3);
        if (lit > 0.3) blob(gl, x, y, 3 + lit * 3, 3 + lit * 3, '#6a1a5a');
      }
      // --- La criatura (se mece desde los pies).
      const rock = Math.sin(t * 1.6) * 0.06, shake = Math.sin(t * 23) * (Math.sin(t * 0.7) > 0.6 ? 0.5 : 0.1);
      // Se pinta en un lienzo aparte y se gira entero sin suavizado (nítido al mecerse).
      const G0 = g, GL0 = gl;
      s.cv ??= document.createElement('canvas'); s.cvg ??= document.createElement('canvas');
      for (const c of [s.cv, s.cvg]) { c.width = 76; c.height = 74; }
      g = s.cv.getContext('2d'); gl = s.cvg.getContext('2d');
      for (const [i, p] of s.roots.entries()) {
        drawPath(g, p, BODY[1], 2); drawPath(g, p, P.vein, 1);
        const k = Math.floor((t * 8 + i * 3) % p.length); px(gl, p[k][0], p[k][1], '#a03a7a', 2, 2);
      }
      // Piernas en cuclillas: la del fondo (derecha) primero y más oscura.
      for (const sd of [1, -1]) {
        const hip = [38 + sd * 4, 55], knee = [38 + sd * 12, 47], foot = [38 + sd * 11, 66];
        const ramp = sd > 0 ? BODY.map((c, i) => BODY[Math.max(0, i - 1)]) : BODY;
        limb(knee[0], knee[1], foot[0], foot[1], 2.6, 2.2, ramp, sd > 0 ? RIM : null);
        limb(hip[0], hip[1], knee[0], knee[1], 3.6, 3, ramp, sd > 0 ? RIM : null);
        shade(foot[0] + sd * 1.5, foot[1] + 0.5, 3.6, 1.8, ramp);
        for (let k = -2; k <= 2; k += 2) px(g, foot[0] + sd * 1.5 + k + sd, foot[1] + 2, BODY[0]);
        seg(g, knee[0] - sd, knee[1] + 2, foot[0], foot[1] - 2, P.vein, 1);
      }
      // Torso (respira), vientre hundido y venas que bajan serpenteando.
      const br = 1 + Math.sin(t * 2.1) * 0.04;
      shade(38, 46, 7.5 * br, 10.5, BODY, RIM);
      for (let y = 44; y < 54; y++) for (let x = -3; x <= 3; x++) if (x * x / 9 + ((y - 49) * (y - 49)) / 25 < 1) px(g, 38 + x, y, (x + y) % 3 ? BODY[1] : BODY[2]);
      for (const [x0, ph] of [[35, 0], [41, 3.1]]) {
        for (let y = 39; y < 57; y++) px(g, x0 + Math.sin(y * 0.4 + ph) * 1, y, (Math.floor(t * 6 + ph * 3) + y) % 8 === 0 ? P.veinL : '#8a3a6c');
      }
      // Brazos: de los hombros a las sienes, apretando.
      const sq = Math.max(0, Math.sin(t * 3.1)) * 0.9;
      for (const sd of [1, -1]) {
        const sh = [38 + sd * 7, 38], el = [38 + sd * 14, 31], hand = [38 + sd * (9.5 - sq), 24];
        const ramp = sd > 0 ? BODY.map((c, i) => BODY[Math.max(0, i - 1)]) : BODY;
        limb(sh[0], sh[1], el[0], el[1], 2.6, 2.2, ramp, sd > 0 ? RIM : null);
        limb(el[0], el[1], hand[0], hand[1], 2.2, 2, ramp, sd > 0 ? RIM : null);
        seg(g, el[0], el[1] + 1, hand[0], hand[1] + 3, P.vein, 1);
      }
      // Cráneo pálido, con sombra de la mandíbula y la espiral girando.
      const hy = 23 + Math.sin(t * 1.6) * 0.4;
      shade(38, hy + 8, 3.6, 3, BONE, '#e8b0c8');                                   // mandíbula
      px(g, 36.5, hy + 9, '#2a1a20', 3, 1);
      shade(38, hy, 8.5, 9.5, BONE, '#f0c0d4');
      // Cuencas y sienes hundidas (sombra) que dan forma de cara.
      for (const sd of [-1, 1]) for (let y = -2; y <= 2; y++) for (let x = -1; x <= 1; x++) if (x * x + y * y < 4) px(g, 38 + sd * 6.2 + x, hy + 1 + y, BONE[1]);
      blob(g, 38, hy + 1, 4.8, 5.2, BONE[4]);
      for (let k = 0; k < 70; k++) {
        const th = k * 0.15, rr = 0.6 + th * 0.48, a = th - t * 2.4;
        if (rr > 4.6) break;
        px(g, 38 + Math.cos(a) * rr, hy + 1 + Math.sin(a) * rr, k % 2 ? P.spiral : '#a03a62');
        if (k % 4 === 0) px(gl, 38 + Math.cos(a) * rr, hy + 1 + Math.sin(a) * rr, '#5a1a3a');
      }
      px(g, 37.5, hy + 0.5, '#5a1838', 1, 1);
      // Manos sobre el cráneo, con dedos.
      for (const sd of [1, -1]) {
        const hx = 38 + sd * (9.5 - sq);
        const ramp = sd > 0 ? BODY.map((c, i) => BODY[Math.max(0, i - 1)]) : BODY;
        shade(hx, hy + 1, 2.4, 3.2, ramp, sd > 0 ? RIM : null);
        for (let k = 0; k < 3; k++) px(g, hx - sd * 2.5, hy - 1.5 + k * 1.6, ramp[3], 2, 1);
      }
      for (const [dst, src] of [[G0, s.cv], [GL0, s.cvg]]) { dst.save(); dst.imageSmoothingEnabled = false; dst.translate(38, 68); dst.rotate(rock); dst.translate(-38 + shake, -68); dst.drawImage(src, 0, 0); dst.restore(); }
      g = G0; gl = GL0;
    },
    // Al acercarte, susurra su bucle (una frase cada pocos segundos, y vuelta a empezar).
    tick(d, game) {
      const p = game.player, T = d.type, cx = d.x0 + T.w / 2, cy = d.y0 + T.h / 2;
      if (Math.hypot(p.cx - cx, p.cy - cy) > 110) return;
      d.wt = (d.wt ?? 0) - 1 / 60;
      if (d.wt > 0 || game.hud.dialogueActive) return;
      const i = (d.wi = ((d.wi ?? -1) + 1) % T.whisper.length);
      game.hud.bark(T.whisper[i], 2.6, { speaker: 'Pensamiento Bucle', portrait: 'bucle' });
      d.wt = 3.4;
    },
  },
  // Médula: columna con anillos de vértebra, raíces nerviosas a los lados y un impulso
  // que sube por ella.
  medula: {
    name: 'Médula', w: 48, h: 112,
    setup(r) {
      const roots = [];
      for (let y = 12; y < 104; y += 14) for (const sd of [-1, 1]) roots.push(branch(r, 24 + sd * 6, y, sd > 0 ? 0.3 : Math.PI - 0.3, 10 + r() * 8, 0.4));
      return { roots };
    },
    draw(g, gl, t, s) {
      for (const p of s.roots) { drawPath(g, p, C.tissueD, 2); drawPath(g, p, C.tissue, 1); }
      for (let y = 0; y < 112; y++) {
        const w = 6 + Math.sin(y * 0.45) * 0.6;
        for (let x = -w; x <= w; x++) { const u = x / w; px(g, 24 + x, y, u < -0.6 ? C.tissueD : u > 0.5 ? C.tissue : C.tissueL); }
      }
      for (let y = 6; y < 112; y += 14) {                    // vértebras
        part(g, 24, y, 10, 3, '#cbbfa8', '#8a7a64', '#f0e8d8');
        px(g, 14, y, '#8a7a64', 3, 2); px(g, 31, y, '#8a7a64', 3, 2);
      }
      const y = 112 - ((t * 40) % 128);
      if (y > 0) { px(g, 22, y, C.impL, 4, 5); blob(gl, 24, y + 2, 5, 6, '#2a5a8a'); }
    },
  },
};

export class Decor {
  constructor(game, room, def, i) {
    this.game = game;
    this.def = def;
    this.type = DECOR[def.type] ?? DECOR.neurona;
    const T = this.type;
    this.state = T.setup(rng((def.x * 73856093) ^ (def.y * 19349663) ^ (i * 83492791)));
    const order = def.front ? 2 : -5;
    this.spr = canvasSprite(game, T.w, T.h, order);
    this.spr.glow.renderOrder = order;
    // Base centrada en (x, y); invertida, colgada del techo de esa casilla.
    this.x0 = (def.x + 0.5) * TILE - T.w / 2;
    this.y0 = def.invert ? def.y * TILE : (def.y + 1) * TILE - T.h;
    this.spr.place(this.x0, this.y0);
    this.spr.mesh.scale.x = this.spr.glow.scale.x = def.flip ? -1 : 1;
    this.spr.mesh.scale.y = this.spr.glow.scale.y = def.invert ? -1 : 1;
    this.jolt = 0;
    this.t = Math.random() * 10;
    this.drawnAt = -1;
  }

  update(dt) {
    this.t += dt;
    this.type.tick?.(this, this.game, dt);
    if (this.t - this.drawnAt < 1 / 20) return;
    this.drawnAt = this.t;
    const { g, gl } = this.spr, T = this.type;
    g.clearRect(0, 0, T.w, T.h);
    gl.clearRect(0, 0, T.w, T.h);
    if (T.sway) {
      // Se mece desde su base y de vez en cuando da una sacudida (más si su muro arde).
      if (Math.random() < 0.012 + (this.state.charge ?? 0) * 0.15) this.jolt = 1;
      this.jolt = Math.max(0, this.jolt - 0.12);
      const a = Math.sin(this.t * 0.9) * 0.05 + Math.sin(this.t * 2.3) * 0.015 + (this.jolt > 0 ? (Math.random() - 0.5) * 0.14 * this.jolt : 0);
      for (const c of [g, gl]) { c.save(); c.translate(T.w / 2, T.h); c.rotate(a); c.translate(-T.w / 2, -T.h); }
      T.draw(g, gl, this.t, this.state);
      g.restore(); gl.restore();
    } else T.draw(g, gl, this.t, this.state);
    this.spr.commit();
  }

  // Dónde está el soma en el mundo (para los muros eléctricos).
  get soma() {
    const T = this.type, [sx, sy] = T.soma ?? [T.w / 2, T.h / 2];
    return { x: this.x0 + (this.def.flip ? T.w - sx : sx), y: this.def.invert ? this.y0 + T.h - sy : this.y0 + sy };
  }

  dispose() { this.spr.dispose(); }
}

// Parejas de ganglios que forman un muro: uno en el suelo y otro colgado del techo
// por encima, a una casilla como mucho de su columna. Devuelve [{ floor, ceil }] (los
// índices en la lista de decoración).
export function neuronPairs(list) {
  const out = [], used = new Set();
  list.forEach((d, i) => {
    if (d.type !== WALL_TYPE || d.invert) return;
    let best = -1, bd = Infinity;
    list.forEach((c, j) => {
      if (c.type !== WALL_TYPE || !c.invert || used.has(j) || c.y >= d.y || Math.abs(c.x - d.x) > 1) return;
      const dd = d.y - c.y + Math.abs(c.x - d.x) * 4;
      if (dd < bd) { bd = dd; best = j; }
    });
    if (best >= 0) { used.add(best); out.push({ floor: i, ceil: best }); }
  });
  return out;
}
export const WALL_DEFAULT = { on: 1.4, off: 2.6, delay: 0 };
export const WALL_TYPE = 'ganglio';
const WARN = 0.8;               // segundos de aviso (carga) antes de encenderse

// Muro eléctrico entre dos ganglios enfrentados.
export class ElectricWall {
  constructor(game, a, b) {
    this.game = game;
    this.a = a; this.b = b;     // Decor del suelo y del techo
    const w = { ...WALL_DEFAULT, ...(a.def.wall ?? {}) };
    this.on = Math.max(0.2, w.on); this.off = Math.max(0.2, w.off);
    this.t = -(w.delay ?? 0);
    // De techo a suelo: la descarga recorre también el cuerpo de los dos ganglios, así
    // que no se puede pasar por debajo ni por encima de los somas.
    const top = b.soma, bot = a.soma;
    this.x = (top.x + bot.x) / 2; this.y0 = b.y0 + 2; this.y1 = a.y0 + a.type.h - 2;
    this.W = 28;
    this.h = Math.max(8, this.y1 - this.y0);
    this.spr = canvasSprite(game, this.W, Math.ceil(this.h), 3);
    this.spr.place(this.x - this.W / 2, this.y0);
    this.phase = 'off';
  }

  get center() { return { x: this.x, y: (this.y0 + this.y1) / 2 }; }

  update(dt) {
    const g = this.game, p = g.player, cyc = this.on + this.off;
    this.t += dt;
    const u = ((this.t % cyc) + cyc) % cyc;           // 0..off: apagado · off..cyc: encendido
    const phase = this.t < 0 ? 'off' : u >= this.off ? 'on' : u >= this.off - WARN ? 'warn' : 'off';
    if (phase !== this.phase) {
      if (phase === 'warn') g.audio.play('gangCharge', this.center);
      if (phase === 'on') { g.audio.play('gangBlink', this.center); g.shake = Math.max(g.shake ?? 0, 1.5); }
      this.phase = phase;
    }
    const k = phase === 'on' ? 1 : phase === 'warn' ? (u - (this.off - WARN)) / WARN : 0;
    this.a.state.charge = this.b.state.charge = k;
    // Encendido: hiere y aparta al que lo toque.
    if (phase === 'on' && p.x + p.w > this.x - 5 && p.x < this.x + 5 && p.y + p.h > this.y0 && p.y < this.y1) {
      g.hurtPlayer(12, this.x, 'muro eléctrico');
      if (Math.random() < 0.5) g.glowParticles.emit(p.cx, p.cy, { vx: (Math.random() - 0.5) * 80, vy: -40, life: 0.3, color: [0.6, 0.9, 1] });
    }
    this.#draw(phase, k);
  }

  #draw(phase, k) {
    const { g, gl } = this.spr, W = this.W, H = Math.ceil(this.h), cx = W / 2;
    g.clearRect(0, 0, W, H); gl.clearRect(0, 0, W, H);
    if (phase === 'off') { this.spr.commit(); return; }
    // Aviso: chispas sueltas que nacen en los extremos. Encendido: varios rayos.
    const bolts = phase === 'on' ? 3 : Math.random() < 0.3 + k * 0.5 ? 1 : 0;
    for (let n = 0; n < bolts; n++) {
      const reach = phase === 'on' ? H : H * (0.15 + k * 0.25), from = n % 2 ? H : 0, dir = from ? -1 : 1;
      let x = cx, y = from;
      const steps = Math.max(3, Math.round(reach / 7));
      for (let i = 1; i <= steps; i++) {
        const nx = cx + (i < steps || phase !== 'on' ? (Math.random() - 0.5) * (phase === 'on' ? 14 : 8) : 0), ny = from + dir * (reach * i) / steps;
        seg(gl, x, y, nx, ny, '#4aa0ff', phase === 'on' ? 3 : 2);
        seg(g, x, y, nx, ny, n === 0 ? '#ffffff' : C.impL, 1);
        x = nx; y = ny;
      }
    }
    if (phase === 'on') { gl.fillStyle = 'rgba(60,140,255,0.18)'; gl.fillRect(cx - 6, 0, 12, H); }
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}

// Un fotograma de muestra (para el editor).
export function decorPreview(type, seed = 7) {
  const T = DECOR[type] ?? DECOR.neurona;
  const c = document.createElement('canvas'), gc = document.createElement('canvas');
  c.width = gc.width = T.w; c.height = gc.height = T.h;
  T.draw(c.getContext('2d'), gc.getContext('2d'), 1.4, T.setup(rng(seed)));
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'lighter'; x.drawImage(gc, 0, 0);
  return c;
}
