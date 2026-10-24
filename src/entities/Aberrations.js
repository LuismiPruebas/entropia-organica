// Aberraciones: jefes hechos de cuerpos que se fundieron (perro, humano, caballo...),
// dibujados por piezas articuladas como el protagonista y animados cada fotograma.
// Mismo contrato que Creatures.js: size, origin, draw(g, gl, e, t, game), noFlip.

import { px, seg, limb, blob, part, ik, OUTLINE } from './Rig.js';

const K = OUTLINE;
const hash = (x, y, s = 0) => (((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) >>> 0);

// Carne moteada: retales de piel humana, pelo de perro y músculo al aire.
function fleshMass(g, cx, cy, rx, ry, t, seed, wobble = 1) {
  const R = Math.ceil(Math.max(rx, ry)) + 2;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const a = Math.atan2(y, x);
    const k = 1 + 0.12 * Math.sin(a * 3 + seed + t * 1.7 * wobble) + 0.07 * Math.sin(a * 7 - t * 2.3 * wobble + seed);
    const d = (x * x) / (rx * rx * k * k) + (y * y) / (ry * ry * k * k);
    if (d > 1) continue;
    const n = hash(x >> 2, y >> 2, seed);
    let c;
    if (d > 0.84) c = K;
    else {
      const patch = n % 7;
      c = patch < 2 ? ['#d89a80', '#c08068'][hash(x, y) % 2]       // piel humana
        : patch < 4 ? ['#6a4a2a', '#5a3a20', '#7a5634'][hash(x, y) % 3] // pelo de perro
          : patch < 6 ? ['#8a2a3c', '#a03448', '#6a1e2e'][hash(x, y) % 3] // músculo
            : '#c8b8a0';                                             // hueso que asoma
    }
    px(g, cx + x, cy + y, c);
  }
}

// Cabeza de perro de perfil (mirando a la derecha): hocico largo, orejas, ojo
// lechoso y belfos sobre los dientes. `jaw` 0..1 abre la boca; `bloom` 0..1 la
// parte en pétalos de carne con tentáculos dentro (como en La Cosa).
function dogHead(g, gl, x, y, jaw, bloom, t, eye) {
  if (bloom > 0.05) {
    // Pétalos: el cráneo se abre en cuatro gajos, cada uno con su trozo de hocico.
    for (let i = 0; i < 4; i++) {
      const a = -1.2 + i * 0.8 + Math.sin(t * 9 + i) * 0.08 * bloom;
      const L = 9 + bloom * 9;
      const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
      limb(g, x, y, ex, ey, 4, i % 2 ? '#6a4a2a' : '#7a5634', '#9a7650');
      for (let k = 0; k < 3; k++) px(g, ex - Math.cos(a) * (k * 2) + Math.sin(a) * 2, ey - Math.sin(a) * (k * 2) - Math.cos(a) * 2, '#f0e8d0');
    }
    // Dentro: un nido de tentáculos rojos y un núcleo que brilla.
    for (let i = 0; i < 6; i++) {
      const a = -1.4 + i * 0.55 + Math.sin(t * 6 + i * 2) * 0.3;
      let tx = x, ty = y;
      for (let s = 0; s < 6 + bloom * 6; s++) {
        tx += Math.cos(a + Math.sin(t * 8 + s * 0.7 + i) * 0.5);
        ty += Math.sin(a + Math.sin(t * 8 + s * 0.7 + i) * 0.5);
        px(g, tx, ty, s % 3 ? '#c03050' : '#e86070');
      }
    }
    part(g, x, y, 3.5 * bloom + 1, 3.5 * bloom + 1, '#ff4a5a', '#a01830');
    blob(gl, x, y, 4 * bloom + 1, 4 * bloom + 1, '#ff3040');
    return;
  }
  // Cráneo y orejas.
  part(g, x, y, 8, 7, '#6a4a2a', '#4a3018', '#8a6a44');
  for (const [ox, oy, s] of [[-4, -7, 0], [-1, -8, 1]]) {
    const flop = Math.sin(t * 3 + s) * 1;
    seg(g, x + ox, y + oy + 2, x + ox - 2 + flop, y + oy - 4, K, 4);
    seg(g, x + ox, y + oy + 2, x + ox - 2 + flop, y + oy - 4, s ? '#7a5634' : '#5a3a20', 2);
  }
  // Hocico: largo, con la nariz negra húmeda al final.
  const snoutY = y + 2;
  limb(g, x + 4, snoutY - 1, x + 15, snoutY - 1, 6, '#7a5634', '#9a7650');
  px(g, x + 16, snoutY - 4, K, 3, 3);
  px(g, x + 16, snoutY - 4, '#e8e0d0');
  // Mandíbula: baja al abrir; dientes arriba y abajo, encías rosadas.
  const jy = snoutY + 2 + jaw * 6;
  limb(g, x + 2, snoutY + 2, x + 14, jy, 3, '#5a3a20');
  if (jaw > 0.1) {
    for (let i = 0; i < 5; i++) {
      px(g, x + 6 + i * 2, snoutY + 2, '#f0e8d0', 1, 2);            // superiores
      px(g, x + 6 + i * 2 + (jy - snoutY) * 0.1, jy - 2, '#e0d8c0', 1, 2); // inferiores
    }
    seg(g, x + 5, snoutY + 3, x + 13, jy - 1, '#a03448');
    // Babas.
    const drool = (t * 20) % 6;
    px(g, x + 10, jy + drool, '#c8d0b0');
  }
  // Ojo de perro: lechoso, con un brillo enfermo que te sigue.
  px(g, x + 1, y - 3, K, 4, 3);
  px(g, x + 2, y - 2, '#d8d0a0', 2, 1);
  px(g, x + 2 + (eye > 0 ? 1 : 0), y - 2, '#a02020');
  px(gl, x + 2 + (eye > 0 ? 1 : 0), y - 2, '#ff5030');
}

// Cara humana (cabeza con pelo ralo), boca abierta en un grito.
function humanHead(g, gl, x, y, scream, t, flip = 1) {
  part(g, x, y, 5, 6, '#d89a80', '#a87060', '#f0c0a0');
  for (let i = -4; i <= 4; i += 2) px(g, x + i, y - 6 + Math.abs(i) * 0.3, '#3a3028');
  // Ojos hundidos y una boca que no se cierra nunca.
  px(g, x - 3 * flip, y - 1, K, 2, 2);
  px(g, x + 1 * flip, y - 1, K, 2, 2);
  px(gl, x - 3 * flip, y - 1, '#ff3020');
  const m = 2 + scream * 2;
  px(g, x - 1, y + 2, K, 3, Math.round(m));
  px(g, x, y + 3, '#5a0a14', 1, Math.max(1, Math.round(m) - 1));
}

// Cabeza del Coro: cráneo arrugado, antenas anilladas que tantean, ojos negros con
// brillo violeta y una mandíbula alargada de colmillos que se descuelga al abrirse.
function drawHead(g, gl, H, hx, hy, open, active, t, S) {
  for (let a = 0; a < H.ant; a++) {
    let ax = hx - 3 + a * 6, ay = hy - H.r + 1, ang = -1.95 + a * 0.55;
    for (let s = 0; s < 10; s++) {
      ang += Math.sin(t * 2.6 + s * 0.6 + a + H.f) * 0.11;
      ax += Math.cos(ang) * 2.3; ay += Math.sin(ang) * 2.3;
      px(g, ax, ay, s % 2 ? S.d : S.l, 2, 2);
    }
    px(g, ax - 1, ay - 1, '#c07050', 3, 3);
  }
  part(g, hx, hy, H.r, H.r * 0.9, H.man ? S.l : S.m, S.d, S.h);
  for (let k = -2; k <= 2; k++) px(g, hx + k * 2 - 1, hy - H.r * 0.55 + Math.abs(k), S.d, 2, 1);
  const er = H.big ? 3.2 : 1.8;
  for (let k = 0; k < H.eyes; k++) {
    const ex = H.eyes === 3 ? hx - 5 + k * 5 : hx - 3 + k * 6;
    const ey = hy - 2 - (H.eyes === 3 && k === 1 ? 3 : 0);
    part(g, ex, ey, er, er, '#1a0a1a', '#3a1a3a');
    px(g, ex - er * 0.45, ey - er * 0.45, '#d070d0');
    px(gl, ex, ey, active ? '#ff60c0' : '#5a1a5a');
  }
  const mw = H.r * 0.85, mh = 2 + open * H.r;
  const my = hy + H.r * 0.3;
  blob(g, hx + 2, my + mh / 2, mw, mh / 2 + 1, '#3a0810', S.k);
  for (let k = 0; k < 6; k++) {
    const fx = hx + 2 - mw + 1 + k * (mw * 2 - 2) / 5;
    seg(g, fx, my - 1, fx + 0.5, my + 3 + (k % 2) * 2, '#f0e0c8');
    seg(g, fx + 1, my + mh + 1, fx + 1, my + mh - 3 - (k % 2), '#e0d0b0');
  }
  if (active && open > 0.5) blob(gl, hx + 2, my + mh / 2, mw * 0.7, mh / 2, '#ff6080');
}

export const ABERRATIONS = {
  // QUIMERA DEL QUILO: una masa que se arrastra hecha de varios cuerpos fundidos. Delante,
  // la cabeza de un perro grande (el hocico se abre en pétalos de carne con tentáculos);
  // patas de perro delante y brazos humanos detrás que la empujan; del lomo le crece un
  // torso humano del revés, con los brazos agitándose y una cabeza que grita... hasta
  // que se desprende y echa a correr sobre sus propios dedos. Por detrás, látigos.
  quimera: {
    size: () => [128, 80],
    origin: (e) => [e.cx - 64, e.y + e.h - 80],
    draw(g, gl, e, t) {
      const st = e.state ?? 'stalk';
      const moving = Math.abs(e.vx) > 4;
      const fast = Math.abs(e.vx) > 120;
      const gait = e.t * (fast ? 18 : moving ? 7 : 1.5);
      const rear = st === 'rear' ? 1 : 0;
      const stun = st === 'stunned' ? 1 : 0;
      const bloom = e.bloom ?? 0;
      const baseY = 50 - rear * 4 + stun * 4 + (st === 'leapWind' ? 4 : 0);
      const floor = 79;
      // Látigos de la espalda; uno barre el suelo durante el latigazo.
      for (let k = 0; k < 3; k++) {
        let x = 30, y = baseY - 6 + k * 3;
        const lash = st === 'lash' && k === 1;
        const warn = st === 'lashWind' && k === 1;
        for (let i = 0; i < 26; i++) {
          if (lash) { x += 4.6; y += (floor - 4 - y) * 0.25; }
          else {
            const a = Math.PI + 0.6 - k * 0.5 + Math.sin(t * (warn ? 14 : 3) + i * 0.4 + k) * (warn ? 0.6 : 0.35);
            x += Math.cos(a) * 1.3; y += Math.sin(a) * 1.3 - 0.4;
          }
          const w = i < 8 ? 3 : i < 18 ? 2 : 1;
          px(g, x - 1, y - 1, K, w + 1, w + 1);
          px(g, x - 0.5, y - 0.5, i % 4 ? '#8a2a3c' : '#c05068', w, w);
          if (warn && i % 3 === 0) px(gl, x, y, '#ff3040');
        }
      }
      // Patas traseras: brazos humanos que se arrastran con las manos abiertas.
      for (const [hx, ph, far] of [[34, 0, true], [44, Math.PI, false]]) {
        const sw = moving ? Math.sin(gait + ph) * 7 : 0;
        const hand = [hx - 8 + sw, floor - 1 - Math.max(0, Math.cos(gait + ph)) * (moving ? 3 : 0)];
        const el = ik(hx, baseY + 6, hand[0], hand[1], 14, 13, 1);
        limb(g, hx, baseY + 6, el[0], el[1], 3, far ? '#a87060' : '#d89a80');
        limb(g, el[0], el[1], hand[0], hand[1], 3, far ? '#a87060' : '#d89a80');
        for (let f = 0; f < 4; f++) seg(g, hand[0], hand[1], hand[0] - 3 + f * 2, hand[1] + 1, '#c08068');
      }
      // Patas de araña hechas de dedos larguísimos (asoman por debajo).
      for (let i = 0; i < 3; i++) {
        const hx = 56 + i * 7, ph = gait * 1.3 + i * 2;
        const fx = hx + 6 + (moving ? Math.sin(ph) * 5 : 0), fy = floor - (moving ? Math.max(0, Math.cos(ph)) * 4 : 0);
        const kn = ik(hx, baseY + 8, fx, fy, 14, 16, -1);
        limb(g, hx, baseY + 8, kn[0], kn[1], 1, '#e0b098');
        limb(g, kn[0], kn[1], fx, fy, 1, '#c89078');
        px(g, kn[0] - 1, kn[1] - 1, '#f0d0c0', 2, 2); // nudillo
      }
      // La masa: carne, pelo y piel fundidos, que tiembla y se deforma.
      fleshMass(g, 56, baseY, 30 + rear * 2, 17 + stun * 2, t, 3, st === 'charge' ? 3 : 1);
      // Costillas que asoman y ojos sueltos en la carne.
      for (let i = 0; i < 5; i++) seg(g, 46 + i * 5, baseY + 4, 44 + i * 5, baseY + 12, '#e8dcc8');
      for (const [ox, oy] of [[-18, -6], [10, 8], [-4, 10]]) {
        px(g, 56 + ox, baseY + oy, K, 3, 3);
        px(g, 57 + ox, baseY + oy + 1, '#e8dcc8');
        px(gl, 57 + ox, baseY + oy + 1, '#ffb050');
      }
      // Patas delanteras de perro: dedos, rodilla al revés, garras negras.
      for (const [hx, ph, far] of [[78, Math.PI / 2, true], [86, -Math.PI / 2, false]]) {
        const sw = moving ? Math.sin(gait + ph) * (fast ? 10 : 6) : 0;
        const foot = [hx + 4 + sw, floor - (moving ? Math.max(0, Math.cos(gait + ph)) * (fast ? 6 : 3) : 0)];
        const kn = ik(hx, baseY + 6, foot[0], foot[1], 12, 14, -1);
        limb(g, hx, baseY + 6, kn[0], kn[1], 4, far ? '#5a3a20' : '#7a5634');
        limb(g, kn[0], kn[1], foot[0], foot[1], 3, far ? '#4a3018' : '#6a4a2a');
        px(g, foot[0] - 1, foot[1] - 1, '#1a1410', 4, 2);
      }
      // Torso humano que brota del lomo, inclinado hacia atrás; brazos que se agitan.
      if (!e.split) {
        const tx = 44, ty = baseY - 16;
        limb(g, tx + 4, baseY - 8, tx, ty, 7, '#d89a80', '#f0c0a0');
        for (const s of [-1, 1]) {
          const a = -1.6 + s * 0.9 + Math.sin(t * 5 + s) * 0.5;
          const hx = tx + Math.cos(a) * 12, hy = ty + 2 + Math.sin(a) * 12;
          const el = ik(tx, ty + 2, hx, hy, 7, 7, s);
          limb(g, tx, ty + 2, el[0], el[1], 2, '#c08068');
          limb(g, el[0], el[1], hx, hy, 2, '#d89a80');
        }
        humanHead(g, gl, tx - 2, ty - 7, 0.6 + Math.sin(t * 7) * 0.4, t, -1);
      } else {
        // Donde estaba el torso queda un muñón abierto que sangra.
        part(g, 44, baseY - 12, 4, 3, '#6a1e2e', K);
        if (Math.sin(t * 9) > 0.5) px(g, 44, baseY - 15, '#c02030');
      }
      // La cabeza de perro, delante.
      const jaw = st === 'rear' ? 1 : st === 'charge' ? 0.7 : st === 'stunned' ? 0.4 : 0.2 + Math.max(0, Math.sin(t * 2)) * 0.3;
      const hx = 92 + (st === 'charge' ? 4 : 0), hy = baseY - 4 + rear * -3;
      dogHead(g, gl, hx, hy, jaw, bloom, t, 1);
      e.spotsLocal = [{ x: hx + 4, y: hy, r: 10, weak: !!e.exposed }];
      if (!e.split) e.spotsLocal.push({ x: 42, y: baseY - 23, r: 7, weak: false });
      if (stun) for (let i = 0; i < 3; i++) px(gl, 92 + Math.cos(t * 8 + i * 2) * 8, baseY - 18 + Math.sin(t * 8 + i * 2) * 2, '#ffd25a');
    },
  },

  // CABEZA-ARAÑA: la cabeza humana que se desprende de la Quimera y corre sobre
  // seis dedos larguísimos. Grita. Como el Reptante, se agazapa y se abalanza.
  cabeza: {
    size: () => [28, 22],
    origin: (e) => [e.cx - 14, e.y + e.h - 22],
    draw(g, gl, e, t) {
      const st = e.state ?? 'prowl';
      const moving = Math.abs(e.vx) > 2;
      const gait = e.t * (moving ? 16 : 2);
      const low = st === 'crouch' ? 3 : 0;
      const hy = 9 + low, hx = 14;
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1, k = i % 3;
        const ph = gait + i * 1.9;
        const fx = hx + side * (6 + k * 3) + (moving ? Math.sin(ph) * 3 : 0);
        const fy = 21 - (moving ? Math.max(0, Math.cos(ph)) * 2 : 0);
        const kn = ik(hx + side * 2, hy + 3, fx, fy, 7, 8, side > 0 ? -1 : 1);
        limb(g, hx + side * 2, hy + 3, kn[0], kn[1], 1, '#e0b098');
        limb(g, kn[0], kn[1], fx, fy, 1, '#c89078');
      }
      humanHead(g, gl, hx, hy, 0.5 + Math.max(0, Math.sin(t * 10)) * 0.5, t, 1);
      // Cuello desgarrado colgando por detrás.
      seg(g, hx - 4, hy + 4, hx - 7, hy + 8 + Math.sin(t * 6), '#8a2a3c', 2);
    },
  },

  // CORO DE CARNE: una bestia esbelta de varios cuerpos. Tronco segmentado como el de
  // un insecto, con protuberancias que laten; patas traseras de saltamontes (fémur que
  // sube por encima del lomo, tibia larguísima con espinas), patas medias finas y
  // brazos humanos con garras delante. Cuatro cabezas cuelgan de cuellos hechos de
  // módulos anillados que se menean cada uno a su ritmo y se estiran al atacar: una con
  // antenas (vomita ácido), una enorme de ojos negros (muerde estirando el cuello),
  // una redonda de colmillos (vomita anguilas) y la del hombre (canta). La que ataca
  // queda abierta: es su punto débil.
  coro: {
    size: () => [320, 150],
    origin: (e) => [e.cx - 160, e.y + e.h - 150],
    draw(g, gl, e, t) {
      const st = e.state ?? 'stalk';
      const moving = Math.abs(e.vx) > 3;
      const gait = e.t * (moving ? 7 : 1.1);
      const floor = 149;
      const S = { k: '#3a2622', d: '#6a4a3c', m: '#94705a', l: '#b88e70', h: '#dcb494' };
      const enraged = e.hp < e.def.hp / 2;
      const spasm = (e.spasm ?? 0) > 0 ? Math.sin(t * 60) * 2 : 0;
      const crouch = st === 'leapWind' ? 10 : st === 'land' ? 6 : 0;
      const air = st === 'leap';
      const bodyY = 84 + crouch + Math.sin(t * 1.3) * 1.5 - (air ? 6 : 0);
      e.spotsLocal = [];

      const banded = (x0, y0, x1, y1, w, c, band, hi = S.h) => {
        limb(g, x0, y0, x1, y1, w, c, hi);
        const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 5));
        for (let i = 1; i < n; i++) {
          const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
          const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
          seg(g, x - (nx / L) * (w / 2), y - (ny / L) * (w / 2), x + (nx / L) * (w / 2), y + (ny / L) * (w / 2), band);
        }
      };
      const claws = (hx, hy, n, len, spread = 0.45, rot = 0) => {
        for (let f = 0; f < n; f++) {
          const a = rot + (f - (n - 1) / 2) * spread;
          const mx = hx + Math.cos(a) * len * 0.55, my = hy + Math.sin(a) * len * 0.3 + 1;
          const ex = mx + Math.cos(a + 0.6) * len * 0.5, ey = my + len * 0.35;
          limb(g, hx, hy, mx, my, 1, S.l);
          seg(g, mx, my, ex, ey, '#e8dcc8');
          px(g, ex, ey, '#fff4e0');
        }
      };

      // --- Tronco: segmentos que forman un arco esbelto, del abdomen (atrás) al pecho.
      const SEG = [];
      for (let i = 0; i < 9; i++) {
        const k = i / 8; // 0 = punta del abdomen, 1 = pecho
        const x = 96 + k * 108;
        const y = bodyY + 14 - Math.sin(k * Math.PI * 0.9) * 22 + Math.sin(t * 2.2 - i * 0.7) * 1.5 + (i < 4 ? (4 - i) * 3 : 0);
        const r = i < 4 ? 6 + i * 1.9 : 12.5 - (i - 4) * 0.7;
        SEG.push([x + spasm * (i % 2 ? 1 : -1), y, r]);
      }
      const P = (i) => SEG[Math.max(0, Math.min(8, i))];

      // --- Patas: las lejanas primero. Traseras de saltamontes, medias finas.
      const hindLeg = (far) => {
        const [hx, hy] = P(4);
        const knee = air ? [hx - 24, hy - 4] : [hx - 26 + (far ? 4 : 0), hy - 44 - crouch * 1.5 + (far ? 3 : 0)];
        const foot = air ? [hx - 62, hy + 30] : [hx - 50 + (moving ? Math.sin(gait + (far ? 2 : 0)) * 6 : 0) + (far ? 6 : 0), floor];
        banded(hx, hy, knee[0], knee[1], far ? 6 : 8, far ? S.d : S.m, S.k);          // fémur grueso
        for (let i = 0; i < 4; i++) {                                                   // franjas del fémur
          const k = 0.2 + i * 0.2;
          px(g, hx + (knee[0] - hx) * k - 1, hy + (knee[1] - hy) * k, far ? S.k : '#5a3a2c', 3, 1);
        }
        limb(g, knee[0], knee[1], foot[0], foot[1], far ? 2 : 3, far ? S.k : S.d);      // tibia larguísima
        for (let i = 1; i < 7; i++) {                                                   // espinas de la tibia
          const k = i / 7, x = knee[0] + (foot[0] - knee[0]) * k, y = knee[1] + (foot[1] - knee[1]) * k;
          seg(g, x, y, x + 2, y - 2, '#e8dcc8');
        }
        claws(foot[0], foot[1] - 1, 2, 7, 0.6, Math.PI * 0.9);
        part(g, knee[0], knee[1], 2.5, 2.5, S.k, S.d); // rodilla
      };
      const midLeg = (i, far) => {
        const [hx, hy] = P(i);
        const ph = gait + i + (far ? Math.PI : 0);
        const foot = [hx + (far ? -8 : 6) + (moving ? Math.sin(ph) * 8 : 0), floor - (moving ? Math.max(0, Math.cos(ph)) * 5 : 0)];
        // Rodilla alta y hacia fuera, como una araña.
        const kn = ik(hx, hy, foot[0], foot[1], 34, 40, far ? 1 : -1);
        banded(hx, hy, kn[0], kn[1], far ? 4 : 5, far ? S.d : S.m, S.k);
        limb(g, kn[0], kn[1], foot[0], foot[1], far ? 2 : 3, far ? S.k : S.d);
        part(g, kn[0], kn[1], 2, 2, S.k, S.d);
      };
      hindLeg(true);
      midLeg(6, true);

      // Abdomen y tórax: anillos con placas violetas y protuberancias que laten.
      for (let i = 0; i < SEG.length; i++) {
        const [x, y, r] = SEG[i];
        part(g, x, y, r, r * 0.85, i % 2 ? S.m : S.l, S.d, S.h);
        seg(g, x - r * 0.7, y + r * 0.2, x + r * 0.7, y + r * 0.2, S.d);    // pliegue del anillo
        if (i >= 3) part(g, x - 1, y - r * 0.8, r * 0.45, r * 0.3, '#4a3a6a', '#2a2040', '#7a6aaa'); // placa
        if (i % 2 === 0) {
          const bulge = 1.5 + Math.max(0, Math.sin(t * 3 + i * 1.9)) * 2.2 + (enraged ? 1 : 0);
          part(g, x + 2, y + r * 0.4, bulge, bulge, '#b05a5a', '#6a2a2a', '#e08a8a'); // protuberancia
          if (bulge > 3) px(gl, x + 2, y + r * 0.4, '#a03030');
        }
      }
      px(g, SEG[0][0] - 5, SEG[0][1] + 2, '#e8dcc8', 4, 1); // aguijón del abdomen
      hindLeg(false);
      midLeg(6, false);

      // --- Brazos delanteros humanos con garras (andan; el cercano también hace de apoyo).
      for (const far of [true, false]) {
        const [sx, sy] = P(8);
        const ph = gait * 1.2 + (far ? Math.PI : 0);
        const hand = [sx + 22 + (moving ? Math.sin(ph) * 10 : 0) + (far ? -4 : 0), floor - 2 - (moving ? Math.max(0, Math.cos(ph)) * 6 : 0)];
        const el = ik(sx, sy + 2, hand[0], hand[1], 28, 30, -1);
        banded(sx, sy + 2, el[0], el[1], far ? 4 : 6, far ? S.d : S.m, S.k);
        banded(el[0], el[1], hand[0], hand[1], far ? 3 : 5, far ? S.d : S.l, S.k);
        claws(hand[0], hand[1], 4, 12, 0.42);
      }

      // --- Cuellos de módulos y cabezas. Cada cuello se mece a su ritmo; al atacar
      // se estira (los módulos se separan y se ve el tendón entre ellos).
      const HEADS = [
        { base: [204, 82], rest: [52, 10], r: 8, ant: 2, eyes: 2, big: false, f: 2.6 },
        { base: [206, 74], rest: [40, -24], r: 11, ant: 2, eyes: 3, big: true, f: 0.9 },
        { base: [200, 86], rest: [30, 18], r: 9, ant: 0, eyes: 2, big: false, f: 1.7 },
        { base: [184, 66], rest: [6, -40], r: 8, ant: 0, eyes: 2, big: false, man: true, f: 1.3 },
      ];
      const atk = e.attackHead ?? -1;
      HEADS.forEach((H, i) => {
        const [bx, by] = H.base;
        const by2 = by + (bodyY - 84);
        let hx = bx + H.rest[0] + Math.sin(t * H.f + i) * 5, hy = by2 + H.rest[1] + Math.cos(t * H.f * 1.3 + i * 2) * 4;
        // Mordisco: la cabeza grande sale disparada hacia donde estabas.
        if (i === 1 && e.biteLocal && e.biteK > 0) {
          hx += (e.biteLocal.x - hx) * e.biteK;
          hy += (e.biteLocal.y - hy) * e.biteK;
        }
        if (i === atk && (st.endsWith('Wind'))) { hx -= 6; hy -= 3; } // se recoge antes de atacar
        // Módulos del cuello por una curva que cuelga entre la base y la cabeza.
        const N = 8, len = Math.hypot(hx - bx, hy - by2);
        const sag = Math.min(14, len * 0.15);
        let lx = bx, ly = by2;
        for (let k = 1; k <= N; k++) {
          const u = k / (N + 1);
          const x = bx + (hx - bx) * u, y = by2 + (hy - by2) * u + Math.sin(u * Math.PI) * sag + Math.sin(t * H.f * 2 + k) * 1.2;
          const r = 3.2 - u * 1;
          if (len > 50) seg(g, lx, ly, x, y, '#8a3a3a'); // tendón al estirarse
          part(g, x, y, r, r * 0.8, k % 2 ? S.m : S.d, S.k);
          lx = x; ly = y;
        }
        const open = i === atk && !st.endsWith('Wind') ? 1 : 0.2 + Math.max(0, Math.sin(t * 2 + i * 1.7)) * 0.3;
        drawHead(g, gl, H, hx, hy, open, i === atk, t, S);
        e.spotsLocal.push({ x: hx, y: hy + 2, r: H.r + (i === atk ? 5 : 2), weak: i === atk && !st.endsWith('Wind'), part: 'head' + i });
      });
    },
  },

  // RENACUAJO DE CHARCA: cría anfibia del Sapo Partero. Rechoncha, con cabeza de rana,
  // ojos saltones, la cola corta de renacuajo y las patas de atrás plegadas. Se hincha
  // (la papada se le vuelve un globo pálido que brilla) y escupe ácido con la boca abierta.
  larva: {
    size: () => [34, 24],
    origin: (e) => [e.cx - 17, e.y + e.h - 24],
    draw(g, gl, e, t) {
      const st = e.state ?? 'prowl', pf = e.puff ?? 0, air = !e.onGround;
      const G = 23, cx = 15, sw = 1 + pf * 0.55;                       // suelo, centro y cuánto se hincha
      const by = G - 6 - (air ? 2 : 0) - pf * 2;
      // Cola corta de renacuajo que ondula detrás.
      for (let i = 0; i < 6; i++) {
        const tx = cx - 8 - i * 1.6, ty = by + 1 + Math.sin(t * 9 - i * 0.8) * (1 + i * 0.25);
        px(g, tx, ty, i < 2 ? '#4a6a22' : '#5e7e2a', 2, Math.max(1, 3 - i * 0.4));
      }
      // Patas traseras: plegadas en el suelo, estiradas al saltar.
      for (const s2 of [0, 1]) {
        const hx = cx - 5 + s2 * 2, hy = by + 3;
        if (air) limb(g, hx, hy, hx - 7, G - 1 + s2, 2, '#5a7a2a', '#8aa848');
        else { limb(g, hx, hy, hx - 4, hy + 2, 3, '#5a7a2a', '#8aa848'); limb(g, hx - 4, hy + 2, hx + 1, G - 1, 2, '#4a6a22'); }
        px(g, hx + (air ? -9 : 0), G - 1, '#3a5218', 3, 1);
      }
      // Cuerpo rechoncho: verde oliva con manchas, panza pálida.
      part(g, cx, by, 7 * sw, 5 * sw, '#6a8a32', '#3e5a1c', '#a8c460');
      for (const [mx, my] of [[-3, -2], [2, -3], [-1, 1], [4, 0]]) px(g, cx + mx * sw, by + my * sw, '#3e5a1c', 2, 1);
      // Papada / saco que se hincha (pálido, brilla al cargarse).
      const sr = 2 + pf * 5;
      part(g, cx + 5, by + 2 + pf, sr, sr * 0.8, pf > 0.3 ? '#e8f0a0' : '#c8d870', '#8aa040');
      if (pf > 0.2) { const k = Math.round(pf * 3); px(gl, cx + 5 - k, by + 2, '#7ac030', k * 2, k); }
      // Cabeza de rana delante, con la boca ancha.
      const hx = cx + 7, hy = by - 2 - pf;
      part(g, hx, hy, 5, 3.5, '#7a9a3a', '#3e5a1c', '#b8d070');
      const open = st === 'spit' ? 3 : st === 'inflate' ? 1 : 0;
      px(g, hx - 1, hy + 1, '#2a1008', 7, 1 + open);                    // boca
      if (open > 1) { px(g, hx + 3, hy + 2, '#c8f090', 3, open - 1); px(gl, hx + 3, hy + 2, '#8aff60', 3, open - 1); }
      // Ojos saltones encima, con pupila horizontal.
      for (const ox of [-2, 2]) {
        part(g, hx + ox, hy - 4, 1.8, 1.8, '#d8e060', '#3e5a1c');
        px(g, hx + ox - 1, hy - 4, '#1a0a04', 2, 1);
      }
      px(gl, hx + 2, hy - 5, '#9be06a');
      // Chorro saliendo de la boca mientras escupe.
      if (st === 'spit') for (let i = 0; i < 4; i++) px(g, hx + 6 + i * 2, hy + 2 + Math.sin(t * 40 + i) * 0.6, i % 2 ? '#c8f090' : '#6ac040', 2, 2);
    },
  },
};
