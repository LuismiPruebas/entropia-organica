// Criaturas procedurales: se dibujan cada fotograma, pixel a pixel, a partir de
// sus partes (segmentos, patas articuladas en dos tramos, tentáculos, ojos que te
// siguen), animadas por su propio movimiento. Se dibujan mirando a la DERECHA.
//
//   size(e)          [ancho, alto] del lienzo
//   origin(e)        [x, y] de la esquina superior izquierda del lienzo en el mundo
//   draw(g, gl, e, t, game)   g = color, gl = brillo propio (visible a oscuras)
//   noFlip           true si se dibuja en orientación de mundo (no se voltea)

import { px, seg, limb, blob, part, jointLeg, OUTLINE } from './Rig.js';
import { ABERRATIONS } from './Aberrations.js';
import { GLAND } from './Gland.js';
import { STAG } from './StagBeetle.js';
import { GOLEM } from './Golem.js';
import { MOTH } from './Moth.js';
import { RHINO } from './RhinoBeetle.js';
import { TOAD } from './Toad.js';

const P = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

function line(g, x0, y0, x1, y1, c, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) P(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, w, w);
}

function disc(g, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) P(g, cx + x, cy + y, c);
}

function ellipse(g, cx, cy, rx, ry, c, rim) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d <= 1) P(g, cx + x, cy + y, rim && d > 0.7 ? rim : c);
  }
}

const bottom = (e, w, h) => [e.cx - w / 2, e.y + e.h - h];
const center = (e, w, h) => [e.cx - w / 2, e.cy - h / 2];

// ---------------------------------------------------------------------------
export const CREATURES = {
  // REPTANTE (Sistema Nervioso): tres segmentos acorazados, seis patas articuladas
  // con las rodillas en alto (el par central se dobla al revés: no recuerda cuál era
  // el lado correcto), cabeza con mandíbulas y racimo de ojos. Poses: acecha bajo,
  // se encoge temblando, salta con las patas abiertas, queda despatarrado al caer.
  reptante: {
    size: () => [48, 28],
    origin: (e) => bottom(e, 48, 28),
    draw(g, gl, e, t) {
      const st = e.state ?? 'prowl';
      const moving = Math.abs(e.vx) > 2 && e.onGround !== false;
      const fast = Math.abs(e.vx) > 40;
      const gait = e.t * (moving ? (fast ? 15 : 8) : 1.5);
      const air = st === 'pounce';
      const low = st === 'crouch' ? 5 : st === 'recover' ? 4 : moving && !fast ? 2 : 0;
      const baseY = 14 + low - (air ? 3 : 0);
      const tilt = air ? (e.vy < 0 ? -2 : 2) : 0;
      const segs = [[14, baseY + 1 - tilt], [21, baseY], [28, baseY - 1 + tilt]]
        .map(([x, y], i) => [x, y + Math.sin(gait + i * 1.7) * (moving ? 0.8 : 0.3)]);
      for (const far of [true, false]) {
        segs.forEach(([sx, sy], i) => {
          const ph = gait + i * 2.1 + (far ? Math.PI : 0) + Math.sin(i * 7.3) * 0.6;
          let fx = sx + (i - 1) * 6 + (moving ? Math.sin(ph) * 4 : 0) + (far ? -1 : 1);
          let fy = 27 - (moving ? Math.max(0, Math.cos(ph)) * 3 : 0);
          if (st === 'crouch') { fx = sx + (i - 1) * 3 + (far ? -1 : 1); fy = 27; }
          if (air) { fx = sx + (i - 1) * 10 + 3; fy = baseY + 9; }
          if (st === 'recover') { fx = sx + (i - 1) * 9; fy = 27; }
          const up = fx > sx ? -1 : 1;
          const bend = i === 1 && !far ? -up : up; // el par central, al revés
          jointLeg(g, sx, sy + 1, fx, fy, 8, 9, bend, far ? 1 : 2, far ? '#4a1620' : '#8a3442', far ? '#3a1018' : '#6a2030', far ? null : '#d06070');
          if (!far) px(g, fx, fy, '#d8b48a'); // uña de hueso
        });
      }
      // Abdomen que une los segmentos (va debajo) y segmentos con espinas dorsales.
      for (let i = 0; i < 2; i++) limb(g, segs[i][0], segs[i][1] + 1, segs[i + 1][0], segs[i + 1][1] + 1, 4, '#5a1a24');
      part(g, segs[0][0] - 5, segs[0][1] + 1, 3.5, 2.5, '#6a2030', '#3a0e18'); // cola
      segs.forEach(([sx, sy], i) => {
        part(g, sx, sy, 5, 3.2, i === 1 ? '#8a3040' : '#7a2a34', '#4a1418', '#c05060');
        px(g, sx - 3, sy + 1, '#5a1a24', 6, 1); // borde de placa
        seg(g, sx, sy - 4, sx - 1, sy - 6, OUTLINE, 2);
        px(g, sx - 1, sy - 6, '#d8b48a');
        px(g, sx, sy - 5, '#d8b48a');
      });
      // Cabeza: mandíbulas que se abren al encogerse y al saltar.
      const [hx0, hy0] = segs[2];
      const hx = hx0 + 7, hy = hy0 - 1 + (st === 'crouch' ? 1 : 0);
      const jaw = st === 'crouch' || air ? 3 : Math.sin(e.t * 13) > 0.95 ? 1 : 0;
      for (const s of [-1, 1]) {
        seg(g, hx + 3, hy + s, hx + 8, hy + s * (1 + jaw) + 1, OUTLINE, 3);
        seg(g, hx + 3, hy + s, hx + 8, hy + s * (1 + jaw) + 1, '#d8b48a', 1);
      }
      part(g, hx, hy, 4, 3.5, '#9a3a46', '#4a1418', '#d06070');
      for (const [ex, ey] of [[hx + 1, hy - 2], [hx + 3, hy - 1], [hx, hy], [hx + 2, hy + 1]]) {
        px(g, ex, ey, '#ff3b2f');
        px(gl, ex, ey, st === 'crouch' ? '#ffd0a0' : '#ff3b2f');
      }
    },
  },

  // NEURONA ERRANTE (Sistema Nervioso): célula de membrana ondulante con núcleo
  // luminoso y tentáculos que se arrastran tras ella.
  neurona: {
    size: () => [26, 26],
    origin: (e) => center(e, 26, 26),
    noFlip: true,
    draw(g, gl, e, t) {
      const cx = 13, cy = 13, back = Math.atan2(-(e.vy || 0.01), -(e.vx || 0.01));
      const wind = e.state === 'windup', dash = e.state === 'dash';
      const len = wind ? 4 : dash ? 12 : 9, spread = dash ? 0.2 : 0.45;
      for (let k = 0; k < 6; k++) {
        const a0 = back + (k - 2.5) * spread;
        let x = cx, y = cy;
        for (let i = 0; i < len; i++) {
          x += Math.cos(a0 + Math.sin(t * 5 + k + i * 0.7) * 0.5);
          y += Math.sin(a0 + Math.sin(t * 5 + k + i * 0.7) * 0.5);
          P(g, x, y, i > len - 3 ? '#6ad0ff' : '#4a3a6a');
          if (i === len - 1) P(gl, x, y, '#6ad0ff');
        }
      }
      for (let a = 0; a < Math.PI * 2; a += 0.12) {
        const r = 5 + Math.sin(a * 3 + t * 4) * 1.2;
        for (let rr = 0; rr <= r; rr++) P(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rr > r - 1 ? '#8a6ab8' : '#3a2848');
      }
      disc(g, cx, cy, wind ? 3 : 2, '#ffd25a');
      disc(gl, cx, cy, wind ? 3 : 1, wind ? '#ffe8a0' : '#ffd25a');
    },
  },

  // ENJAMBRE SINÁPTICO (Sistema Nervioso): varias células unidas por filamentos que
  // giran alrededor de un núcleo con ojo. Pierde células al ser herido.
  enjambre: {
    size: () => [52, 46],
    origin: (e) => center(e, 52, 46),
    noFlip: true,
    draw(g, gl, e, t, game) {
      const cx = 26, cy = 23, n = Math.max(1, Math.min(6, Math.ceil(e.hp / 7)));
      const nodes = [];
      for (let i = 0; i < n; i++) {
        const a = t * (0.9 + i * 0.13) + (i / n) * Math.PI * 2;
        const r = (e.state === 'windup' ? 6 : 11) + Math.sin(t * 2 + i) * 4 + (i % 2) * 4;
        nodes.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8]);
      }
      // Filamentos que parpadean: núcleo-célula y célula-célula.
      nodes.forEach(([x, y], i) => {
        if (Math.sin(t * 7 + i * 2) > -0.4) line(gl, cx, cy, x, y, 'rgba(110,200,255,0.5)');
        const [nx, ny] = nodes[(i + 1) % n];
        if (n > 2 && Math.sin(t * 5 + i) > 0.2) line(g, x, y, nx, ny, '#3a2a5a');
      });
      ellipse(g, cx, cy, 6, 5, '#2a1830', '#5a3a6a');
      // El ojo del núcleo te sigue.
      const p = game.player, la = Math.atan2(p.cy - e.cy, p.cx - e.cx);
      disc(g, cx, cy, 3, '#e8dcc8');
      disc(g, cx + Math.cos(la) * 1.5, cy + Math.sin(la) * 1.5, 1, '#c03028');
      P(gl, cx + Math.cos(la) * 1.5, cy + Math.sin(la) * 1.5, '#ff3b2f');
      nodes.forEach(([x, y], i) => {
        disc(g, x, y, 3 + (i % 2), '#4a3a6a');
        P(g, x, y, '#ffd25a', 2, 2);
        P(gl, x, y, '#ffd25a');
      });
    },
  },

  // CÉLULA DESPRENDIDA (Sistema Nervioso): un trozo del enjambre con su núcleo y
  // tres dendritas. Cada división la deja más pequeña y más pálida.
  celula: {
    size: () => [20, 20],
    origin: (e) => center(e, 20, 20),
    noFlip: true,
    draw(g, gl, e, t) {
      const sc = [1, 0.75, 0.55][e.gen ?? 0] ?? 0.5;
      const st = e.state, cx = 10, cy = 10;
      const wind = st === 'windup';
      const r = (3.6 + (wind ? -0.6 : Math.sin(t * 6 + e.seed) * 0.4)) * sc;
      const back = Math.atan2(-(e.vy || 0.01), -(e.vx || 0.01));
      for (let k = 0; k < 3; k++) {
        const a = back + (k - 1) * 0.7 + Math.sin(t * 7 + k) * 0.3;
        const len = (st === 'dash' ? 8 : wind ? 3 : 6) * sc + 1;
        seg(g, cx, cy, cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len), '#5a4a8a');
        px(gl, cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len), '#6ad0ff');
      }
      part(g, cx, cy, r, r, ['#4a3a6a', '#5a4a7a', '#6a5a88'][e.gen ?? 0] ?? '#6a5a88', '#8a6ab8');
      const n = Math.max(1, r * 0.45);
      blob(g, cx, cy, n, n, '#ffd25a');
      blob(gl, cx, cy, wind ? n + 1 : n * 0.6, wind ? n + 1 : n * 0.6, wind ? '#ffe8a0' : '#ffd25a');
    },
  },

  // SACO ESPORÍFERO (Cavidad Pulmonar): saco de carne venoso que late y, si te
  // acercas, se hincha hasta reventar.
  saco: {
    size: () => [22, 20],
    origin: (e) => bottom(e, 22, 20),
    noFlip: true,
    draw(g, gl, e, t) {
      const swell = e.armed ? 1.25 + Math.sin(t * 30) * 0.08 : 1 + Math.sin(t * 3) * 0.06;
      const cx = 11, cy = 11, rx = Math.round(6 * swell), ry = Math.round(5 * swell);
      // Raíces que se hunden en el suelo.
      for (const dx of [-4, -1, 2, 5]) line(g, cx + dx / 2, cy + ry - 1, cx + dx, 19 + Math.sin(t * 2 + dx), '#4a2430');
      ellipse(g, cx, cy, rx, ry, '#7a8a2a', '#3a4410');
      for (let k = 0; k < 3; k++) line(g, cx - rx + 2 + k * 3, cy - ry + 2, cx - 2 + k * 2, cy + ry - 2, '#5a3a2a');
      for (const [sx, sy] of [[-3, -2], [2, -3], [3, 1], [-2, 2], [0, 0]]) {
        P(g, cx + sx * swell, cy + sy * swell, '#d8d070');
        P(gl, cx + sx * swell, cy + sy * swell, '#d8d070');
      }
    },
  },

  // FAUCE COLGANTE (Cavidad Pulmonar): planta carnívora colgada de un tallo de
  // nudos; abre los pétalos dentados antes de dejarse caer sobre ti.
  fauce: {
    size: (e) => [28, e.dropLen + 30],
    origin: (e) => [e.cx - 14, e.home - 4],
    noFlip: true,
    draw(g, gl, e, t) {
      const podY = Math.round(e.y - e.home) + 4;
      const open = e.phase === 'shake' ? 0.6 + Math.random() * 0.4 : e.phase === 'fall' ? 1 : e.phase === 'ground' ? 0.15 : 0;
      const sway = e.phase === 'wait' ? Math.sin(t * 1.6 + e.seed) * 2 : 0;
      // Tallo de nudos desde el techo hasta la cápsula.
      for (let y = 0; y < podY; y += 4) {
        const k = y / Math.max(1, podY);
        const x = 14 + sway * k + Math.sin(t * 3 + y * 0.3) * 0.6 * k;
        disc(g, x, y + 2, 2, (y / 4) % 2 ? '#4a5a2a' : '#5a6a32');
        P(g, x - 1, y + 2, '#2a3418', 3, 1);
      }
      const px = 14 + sway, py = podY + 6;
      // Pétalos: se abren mostrando dientes y una garganta que brilla.
      for (const s of [-1, 1]) {
        const ang = s * (0.3 + open * 1.1);
        for (let i = 0; i < 9; i++) {
          const x = px + Math.sin(ang) * i * s * s, y = py + Math.cos(ang) * i;
          P(g, x + s * (1 + open * 3), y, '#6a8a3a', 3, 1);
          if (i % 2 === 0 && open > 0.2) P(g, x + s * (1 + open * 3) - s * 2, y, '#e8dcc8');
        }
      }
      ellipse(g, px, py, 6, 5, '#7a9a42', '#3a4a1a');
      for (let k = -2; k <= 2; k += 2) line(g, px + k, py - 4, px + k * 1.4, py + 4, '#a83a3a');
      if (open > 0.2) {
        ellipse(g, px, py + 6, 2 + Math.round(open * 2), 2, '#ff5a3a');
        ellipse(gl, px, py + 6, 1 + Math.round(open * 2), 1, '#ff7a3a');
      }
    },
  },

  // COLONIA BACILAR: gólem de bacterias que te imita (entities/Golem.js).
  colonia: GOLEM,

  // CIERVO ACORAZADO: centauro escarabajo erguido (entities/StagBeetle.js).
  ciervo: STAG,
  // ESCARABAJO RINOCERONTE: cuerno de marfil y coraza frontal (entities/RhinoBeetle.js).
  rhino: RHINO,

  // OJO DE TECHO: racimo de ojos colgado de un pedúnculo; el principal te sigue.
  ojo: {
    size: () => [20, 22],
    origin: (e) => [e.cx - 10, e.y - 2],
    noFlip: true,
    draw(g, gl, e, t, game) {
      line(g, 10, 0, 10 + Math.sin(t * 1.5) * 1, 6, '#5a1a2a', 2);
      const ex = 10 + Math.sin(t * 1.5), ey = 12;
      disc(g, ex - 6, ey - 3, 2, '#e8dcc8'); P(g, ex - 6, ey - 3, '#c03028');
      disc(g, ex + 6, ey - 2, 2, '#e8dcc8'); P(g, ex + 6, ey - 2, '#c03028');
      disc(g, ex, ey, 6, '#5a1a2a');
      const open = e.frame === 'open';
      if (open) {
        disc(g, ex, ey, 5, '#e8dcc8');
        for (let k = 0; k < 4; k++) line(g, ex - 5 + k * 3, ey - 4 + (k % 2) * 7, ex - 2 + k * 2, ey - 1 + (k % 2), '#c05060');
        const p = game.player, a = Math.atan2(p.cy - e.cy, p.cx - e.cx);
        const ix = ex + Math.cos(a) * 2, iy = ey + Math.sin(a) * 2;
        disc(g, ix, iy, e.charging ? 3 : 2, '#ff3b2f');
        P(g, ix, iy, '#140c10');
        disc(gl, ix, iy, e.charging ? 3 : 1, e.charging ? '#ffb0a0' : '#ff3b2f');
      } else {
        line(g, ex - 5, ey, ex + 5, ey, '#2a0a10');
      }
    },
  },

  // VESTIGIO (Sistema Digestivo): lo que queda de alguien casi humano, armado
  // como el protagonista (huesos articulados) pero roto: una pierna más larga con la
  // rodilla al revés, la columna encorvada, la cabeza caída, costillas al aire, dos
  // brazos larguísimos que arrastra y un tercero atrofiado en la espalda.
  // Poses: arrastra los pies, latigazo de cabeza (aviso), carrera inclinada, zarpazo.
  vestigio: {
    size: () => [44, 48],
    origin: (e) => bottom(e, 44, 48),
    draw(g, gl, e, t) {
      const G0 = 47;
      const sprint = e.sprinting, lurch = e.lurch > 0;
      const moving = Math.abs(e.vx) > 2;
      const ph = e.t * (sprint ? 12 : moving ? 5.5 : 1);
      const skin = '#9a7a6a', skinD = '#6a5048', bone = '#e8dcc8';
      const hip = [20, 30 - (sprint ? 1 : 0)];
      // Piernas: la trasera larga y con la rodilla hacia atrás; la delantera corta.
      for (const [i, far] of [[0, true], [1, false]]) {
        const hx = hip[0] + (far ? -1 : 1);
        const step = moving ? Math.sin(ph + i * Math.PI) * (sprint ? 7 : 4) : 0;
        const fx = hx + step + (far ? -2 : 2), fy = G0 - (moving ? Math.max(0, Math.cos(ph + i * Math.PI)) * 3 : 0);
        jointLeg(g, hx, hip[1], fx, fy, far ? 9.5 : 8, far ? 9.5 : 8, far ? 1 : -1, far ? 2 : 3, far ? skinD : skin, far ? '#4a3430' : skinD, far ? null : '#c0a090');
        px(g, fx - 1, fy, OUTLINE, 4, 1);
        px(g, fx, fy - 1, far ? '#4a3430' : skinD, 3, 1);
      }
      // Columna encorvada; en carrera se inclina hacia delante.
      const lean = sprint ? 7 : lurch ? -2 : moving ? Math.max(0, Math.sin(ph)) * 2 : Math.sin(t) * 0.5;
      const sh = [hip[0] + 4 + lean, hip[1] - 12 + (sprint ? 3 : 0)];
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        const x = hip[0] + (sh[0] - hip[0]) * k - Math.sin(k * Math.PI) * 3;
        const y = hip[1] + (sh[1] - hip[1]) * k - Math.sin(k * Math.PI) * 3;
        part(g, x, y, 2.5, 1.8, k > 0.4 && k < 0.8 ? '#8a6a5a' : skin, null);
      }
      // Costillas al aire y una herida.
      for (let r = 0; r < 3; r++) {
        const x = hip[0] + (sh[0] - hip[0]) * (0.5 + r * 0.12) + 1, y = hip[1] + (sh[1] - hip[1]) * (0.5 + r * 0.12);
        seg(g, x - 1, y, x + 3, y + 1, bone);
      }
      px(g, hip[0] + 2, hip[1] - 5, '#7a2a34', 2, 2);
      // Brazo atrofiado de la espalda, que tiembla.
      const bx = hip[0] + (sh[0] - hip[0]) * 0.6 - 3, by = hip[1] + (sh[1] - hip[1]) * 0.6 - 2;
      limb(g, bx, by, bx - 4 + Math.sin(t * 11) * 1.5, by - 5, 1, '#7a5a50');
      // Cabeza caída a un lado; el latigazo la echa hacia atrás.
      const hx = sh[0] + 3 + (lurch ? -3 + Math.sin(t * 40) : 0), hy = sh[1] - 3 + (lurch ? -2 : 1);
      part(g, hx, hy, 3.4, 3.8, '#8a6a5a', '#5a4038', '#b09080');
      px(g, hx + 1, hy - 1, OUTLINE, 2, 2);
      px(g, hx + 1, hy - 1, '#ff3b2f');
      px(gl, hx + 1, hy - 1, lurch ? '#ffd0a0' : '#ff3b2f');
      px(g, hx + 2, hy + 2, '#3a1418', 2, 2); // mandíbula colgando
      px(g, hx - 3, hy - 4, '#3a2a28', 4, 1);  // mechón de pelo
      // Brazos larguísimos: arrastran, se echan atrás en carrera o se alzan para el zarpazo.
      const swing = e.swing > 0 ? e.swing : 0;
      for (const far of [true, false]) {
        const s = [sh[0] + (far ? -2 : 1), sh[1] + 1];
        let hand;
        if (swing > 0.3 && !far) hand = [s[0] + 3, s[1] - 12];
        else if (swing > 0 && !far) hand = [s[0] + 15, s[1] + 6];
        else if (sprint) hand = [s[0] - 10 + (far ? -2 : 0), s[1] + 6 + Math.sin(ph + (far ? 0 : 2)) * 3];
        else hand = [s[0] + 3 + Math.sin(ph + (far ? 0 : 1.5)) * 3, G0 - 2];
        jointLeg(g, s[0], s[1], hand[0], hand[1], 7, 8, swing > 0 && !far ? 1 : -1, far ? 1 : 2, far ? skinD : skin, far ? '#4a3430' : '#8a6a5a');
        // Dedos-garra.
        for (const dx of [-1, 1, 2]) seg(g, hand[0], hand[1], hand[0] + dx, hand[1] + 2, far ? '#a89a80' : '#d8b48a');
      }
    },
  },

  // ANGUILA ÁCIDA (Sistema Digestivo): vive bajo el ácido y salta en arco con las
  // fauces abiertas. Bajo la superficie solo se ven sus burbujas.
  anguila: {
    size: () => [44, 30],
    origin: (e) => center(e, 44, 30),
    noFlip: true,
    draw(g, gl, e, t) {
      const a = Math.atan2(e.vy || -1, e.vx || 0.01);
      const hx = 22 + Math.cos(a) * 9, hy = 15 + Math.sin(a) * 9;
      for (let i = 12; i >= 0; i--) {
        const x = hx - Math.cos(a) * i * 2.2 + Math.cos(a + Math.PI / 2) * Math.sin(t * 18 + i * 0.7) * 1.5;
        const y = hy - Math.sin(a) * i * 2.2 + Math.sin(a + Math.PI / 2) * Math.sin(t * 18 + i * 0.7) * 1.5;
        disc(g, x, y, Math.max(1, 3 - i * 0.18), i % 3 ? '#4a7a2a' : '#2a4a18');
        if (i % 2 === 0) P(g, x, y, '#9be06a');
      }
      // Fauces abiertas con dientes.
      for (const s of [-1, 1]) line(g, hx, hy, hx + Math.cos(a + s * 0.5) * 6, hy + Math.sin(a + s * 0.5) * 6, '#5a8a3a', 2);
      P(g, hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, '#e8dcc8', 2, 1);
      P(g, hx - Math.sin(a) * 2, hy + Math.cos(a) * -2, '#ffd25a');
      P(gl, hx - Math.sin(a) * 2, hy + Math.cos(a) * -2, '#ffd25a');
    },
  },

  // ======================= JEFES =======================

  // GANGLIO MADRE: una neurona colosal y fractal, con un ojo en el soma.
  // Teletransporte (bossGanglion): al cargarlo, arcos eléctricos que saltan del soma a
  // las ramas, cada vez más; en el salto, parpadea (Enemy.vanish).
  gangliomadre: {
    size: () => [100, 94],
    origin: (e) => center(e, 100, 94),
    noFlip: true,
    draw(g, gl, e, t, game) {
      const cx = 50, cy = 47;
      const charge = e.tp?.phase === 'charge' ? 1 - e.tp.t / e.tp.total : 0;
      const tips = [];
      const branch = (x, y, a, len, depth, k) => {
        let px = x, py = y;
        const jit = 0.08 + charge * 0.25;                  // al cargar, las ramas tiemblan
        for (let i = 0; i < len; i++) {
          px += Math.cos(a + Math.sin(t * (1.5 + charge * 20) + k + i * 0.3) * jit);
          py += Math.sin(a + Math.sin(t * (1.5 + charge * 20) + k + i * 0.3) * jit);
          P(g, px, py, depth > 1 ? '#5a3a6a' : '#4a3058', depth > 1 ? 3 : 2, depth > 1 ? 3 : 2);
          // Impulso que corre hacia fuera por cada rama.
          if (Math.floor((t * 14 + k * 3) % len) === i) { P(gl, px, py, '#82d2ff', 2, 2); P(g, px, py, '#82d2ff', 2, 2); }
        }
        if (depth > 0) for (const s of [-1, 1]) branch(px, py, a + s * 0.55, len * 0.6, depth - 1, k + s);
        else tips.push([px, py]);
      };
      for (let k = 0; k < 8; k++) branch(cx, cy, (k / 8) * Math.PI * 2 + t * 0.15, 19, 2, k);
      const pulse = 14 + Math.sin(t * 3) * 1.5 + charge * 2;
      disc(g, cx, cy, Math.round(pulse), '#3a2848');
      disc(g, cx, cy, Math.round(pulse) - 3, '#5a3a72');
      const p = game.player, a = Math.atan2(p.cy - e.cy, p.cx - e.cx);
      disc(g, cx, cy, 6, '#e8dcc8');
      const ix = cx + Math.cos(a) * 3, iy = cy + Math.sin(a) * 3;
      disc(g, ix, iy, 3, charge > 0 ? '#bfeaff' : '#ffd25a');
      P(g, ix, iy, '#140c10', 2, 2);
      disc(gl, ix, iy, 3, charge > 0 ? '#bfeaff' : '#ffd25a');
      // Arcos: del soma a la punta de algunas ramas, en zigzag, más y más a menudo.
      if (charge > 0) {
        const n = 1 + Math.floor(charge * 5);
        for (let j = 0; j < n; j++) {
          if (Math.random() > 0.35 + charge * 0.6) continue;
          const [tx, ty] = tips[Math.floor(Math.random() * tips.length)];
          let x = cx, y = cy;
          const steps = 6;
          for (let s = 1; s <= steps; s++) {
            const u = s / steps, nx = cx + (tx - cx) * u + (s < steps ? (Math.random() - 0.5) * 9 : 0), ny = cy + (ty - cy) * u + (s < steps ? (Math.random() - 0.5) * 9 : 0);
            line(gl, x, y, nx, ny, '#bfeaff', 2);
            line(g, x, y, nx, ny, '#e8f8ff', 1);
            x = nx; y = ny;
          }
        }
        // El soma se ilumina por dentro (sin tapar el ojo).
        for (let s = 0; s < 3; s++) { const ang = Math.random() * Math.PI * 2, rr = 7 + Math.random() * 5; P(gl, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, charge > 0.7 && Math.random() < 0.5 ? '#ffffff' : '#82d2ff', 2, 2); }
      }
    },
  },

  // MATRIARCA: esfinge de las esporas, mitad polilla y mitad mantis (entities/Moth.js).
  matriarca: MOTH,

  // GLÁNDULA GÁSTRICA: masa cerebral colgada de tubos elásticos (entities/Gland.js).
  glandula: GLAND,
  // SAPO PARTERO: jefe de la charca de ácido (entities/Toad.js).
  sapo: TOAD,
  // Jefes aberración (Quimera, Coro) y la cabeza-araña: entities/Aberrations.js.
  ...ABERRATIONS,
};

// Tintes sobre el dibujo: destello al recibir daño, camuflaje cuando no le da la luz.
// camo: el color hondo del bioma (biome.camo), para que se confunda con la carne.
export function tintCanvas(g, w, h, tint, camo = '#1a0c1a') {
  if (!tint) return;
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = tint === 'flash' ? 1 : 0.82;
  g.fillStyle = tint === 'flash' ? '#ffffff' : camo;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
}
