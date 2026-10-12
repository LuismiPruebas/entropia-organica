// COLONIA BACILAR (Cavidad Pulmonar): un coloso de bacterias. Millones de células
// apiñadas que toman la forma de lo que tienen cerca y la exageran: un gigante
// encorvado, con una joroba y una barriga enormes, la cabeza hundida entre los hombros
// y un solo ojo que arde del color de tu luz. Te imita: camina hacia ti, te apunta
// con el brazo, salta cuando saltas. Toda su piel son células con núcleo; de la
// espalda le brotan pili con una bola en la punta y gotea limo por todas partes.
//
// Modular: cada parte (piernas, pies, torso, barriga, joroba, cabeza, brazos, manos)
// se rellena con la textura de células en sus propias coordenadas, así la textura
// viaja con la parte cuando se mueve. Cada herida le arranca carne: pierde el brazo de
// atrás, se le abren huecos, se le hunde la cabeza. Al morir se deshace en grumos que
// saltan y cada grumo en pulpa que corretea (e.gen: 0 coloso, 1 grumo, 2 pulpa). La
// IA es el comportamiento `golem` de entities/Enemy.js.
import { ik } from './Rig.js';

const P = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
const hash = (x, y, k = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

// Rampa de verdes: de la sombra más honda al brillo húmedo.
const RAMP = ['#16240a', '#26400e', '#3a5e14', '#54801c', '#6e9e26', '#8cba32', '#acd444', '#d0ec70', '#f0ffb0'];
const shade = (v) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))))];

// Textura de células (Voronoi): distancia al núcleo más cercano y al borde con la
// vecina. Devuelve [d1, borde] en unidades de celda.
function cells(u, v, size) {
  const x = u / size, y = v / size, xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const fx = cx + 0.15 + hash(cx, cy, 1) * 0.7, fy = cy + 0.15 + hash(cx, cy, 2) * 0.7;
    const d = Math.hypot(x - fx, y - fy);
    if (d < d1) { d2 = d1; d1 = d; id = hash(cx, cy, 3); } else if (d < d2) d2 = d;
  }
  return [d1, d2 - d1, id];
}

// Pinta un píxel de "carne celular": sombreado de volumen (nz, luz) + células.
function cellPx(g, x, y, u, v, nx, ny, nz, size, dark = 0) {
  const [d1, edge, id] = cells(u, v, size);
  const light = Math.max(0, -nx * 0.45 - ny * 0.6 + nz * 0.55); // luz de arriba a la izquierda
  let val = 0.18 + light * 0.62 - dark;
  if (edge < 0.12) val -= 0.22; // membrana entre células
  else {
    val += (0.35 - d1) * 0.35; // cada célula, abombada
    if (id > 0.82 && d1 < 0.16) val -= 0.25; // núcleo
    if (d1 < 0.12 && light > 0.5) val += 0.15; // brillo húmedo
  }
  P(g, x, y, shade(val));
}

// Parte "cápsula" de a a b con radios r0 → r1, rellena de células en coordenadas
// propias (u a lo largo, v a lo ancho) para que la textura se mueva con ella.
function capsule(g, ax, ay, bx, by, r0, r1, seed, size = 3.2, dark = 0) {
  const len = Math.hypot(bx - ax, by - ay) || 0.01, tx = (bx - ax) / len, ty = (by - ay) / len;
  const R = Math.max(r0, r1);
  const x0 = Math.floor(Math.min(ax, bx) - R - 1), x1 = Math.ceil(Math.max(ax, bx) + R + 1);
  const y0 = Math.floor(Math.min(ay, by) - R - 1), y1 = Math.ceil(Math.max(ay, by) + R + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5 - ax, py = y + 0.5 - ay;
    const t = Math.max(0, Math.min(1, (px * tx + py * ty) / len));
    const cx = px - tx * t * len, cy = py - ty * t * len;
    const r = r0 + (r1 - r0) * t, d = Math.hypot(cx, cy);
    if (d > r) continue;
    if (d > r - 0.9) { P(g, x, y, RAMP[0]); continue; }
    const nx = cx / r, ny = cy / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    cellPx(g, x, y, t * len + seed * 17, (px * -ty + py * tx) + seed * 5, nx, ny, nz, size, dark);
  }
}

// Parte "masa": elipse (joroba, barriga, cabeza, pies) con células.
function mass(g, cx, cy, rx, ry, seed, size = 3.6, dark = 0, holes = null) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
    if (d > 1) continue;
    if (d > 0.86) { P(g, x, y, RAMP[0]); continue; }
    if (holes?.some(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) < hr)) { P(g, x, y, Math.hypot(x - holes[0][0], y - holes[0][1]) % 2 < 1 ? '#0e1606' : '#1e2e0a'); continue; }
    cellPx(g, x, y, x - cx + seed * 23, y - cy + seed * 7, nx, ny, Math.sqrt(Math.max(0, 1 - d)), size, dark);
  }
}

// Pili: tallos finos que brotan de la espalda con una bola en la punta.
function pilus(g, gl, x, y, a, len, t, i) {
  let px = x, py = y;
  for (let s = 0; s < len; s++) {
    const w = Math.sin(t * 3 + i * 1.7 - s * 0.5) * 0.25;
    px += Math.cos(a + w); py += Math.sin(a + w);
    P(g, px, py, s < len - 2 ? '#6e9e26' : '#acd444');
  }
  P(g, px - 1, py - 1, '#acd444', 2, 2);
  P(g, px - 1, py - 1, '#f0ffb0');
  if (i % 3 === 0) P(gl, px, py, '#aaff70');
}

// Gotas de limo que resbalan y caen.
function drip(g, gl, x, y, t, i, maxLen = 6) {
  const k = (t * (0.35 + hash(i, 1) * 0.3) + hash(i, 2)) % 1;
  const L = Math.round(k * maxLen);
  for (let s = 0; s < L; s++) P(g, x, y + s, s === L - 1 ? '#d0ec70' : '#8cba32');
  if (k > 0.8) { P(g, x, y + L + (k - 0.8) * 30, '#acd444'); }
}

export const GOLEM = {
  size: () => [64, 58],
  origin: (e) => [e.cx - 32, e.y + e.h - 58],
  draw(g, gl, e, t, game) {
    const gen = e.gen ?? 0;
    const G = 57; // suelo del lienzo
    const eye = game?.beamColor ?? [1, 0.3, 0.2];
    const eyeC = `rgb(${eye.map((c) => Math.round(Math.min(1, c) * 255)).join(',')})`;
    e.walkPh = (e.walkPh ?? 0) + Math.abs(e.vx) * 0.0011;
    const ph = e.walkPh * Math.PI * 2;

    if (gen >= 2) {
      // Pulpa: un racimo de células con flagelos que corretea.
      const cx = 32, cy = G - 3 - Math.abs(Math.sin(ph * 4)) * 1.5;
      for (let f = 0; f < 3; f++) for (let s = 0; s < 6; s++) P(g, cx - 3 - s, cy + Math.sin(t * 18 + s + f * 2) * 1.5 + f - 1, '#54801c');
      mass(g, cx, cy, 3.5, 2.8, 9, 2.2);
      P(gl, cx + 2, cy - 1, eyeC);
      return;
    }
    if (gen === 1) {
      // Grumo: una bola de células con muñones y pili que bota hacia ti.
      const air = !e.onGround;
      const sq = air ? 0.85 : 1 + Math.max(0, Math.sin(t * 6)) * 0.12;
      const cx = 32, cy = G - 6.5 * (air ? 1.05 : 0.95);
      for (const [lx, k] of [[-4, 0], [-1, 2], [3, 4]]) capsule(g, cx + lx, cy + 3, cx + lx + (air ? -1 : Math.sin(ph * 3 + k)), G, 1.8, 1.5, 3 + k, 2.4);
      mass(g, cx, cy, 7 / sq, 6 * sq, 5, 2.8);
      for (let i = 0; i < 4; i++) pilus(g, gl, cx - 5 + i * 3, cy - 5, -Math.PI / 2 - 0.6 + i * 0.4, 4, t, i);
      P(g, cx + 3, cy - 2, '#0a1004', 3, 2);
      P(gl, cx + 4, cy - 2, eyeC);
      drip(g, gl, cx - 2, cy + 5, t, 3, 4);
      return;
    }

    // --- Coloso.
    const frac = Math.max(0, e.hp / (e.def?.hp ?? 40));
    const moving = Math.abs(e.vx) > 2;
    const air = !e.onGround;
    const wind = e.state === 'punchWind' ? 1 - Math.max(0, e.timer ?? 0) / (e.def?.punchWindup ?? 0.5) : 0;
    const hit = e.state === 'punch' ? 1 : 0;
    const step = moving ? Math.sin(ph) : 0;
    const bob = moving ? Math.abs(step) * 1.5 : Math.sin(t * 1.6) * 0.6;
    const lean = -wind * 3 + hit * 4 + (moving ? 1 : 0);
    const breath = Math.sin(t * 1.6) * 0.6;
    const jig = moving ? Math.sin(ph * 2 - 0.8) * 1.2 : 0; // la barriga rebota con retraso
    const hipX = 30 + lean * 0.4, hipY = 40 - bob + (air ? -2 : 0);
    // Bolas arrojadas (Enemy.js -> golem): la joroba primero, luego la barriga. Se
    // regeneran despacio; mientras se arranca una, encoge y se queda en la mano.
    const miss = e.missing ?? 0, rg = e.regrow ?? 0;
    const throwK = e.state === 'throwWind' ? (e.throwK ?? 0) : 0;
    let humpK = miss === 0 ? 1 : miss === 1 ? rg : 0;
    let bellyK = miss <= 1 ? 1 : rg;
    if (miss === 0) humpK *= 1 - throwK * 0.85;
    else if (miss === 1) bellyK *= 1 - throwK * 0.85;
    const hs = 0.3 + 0.7 * humpK, bs = 0.4 + 0.6 * bellyK;

    // Piernas y pies (la lejana primero, más oscura).
    const legs = [[Math.PI, true], [0, false]];
    const drawLeg = ([k, far]) => {
      const fx = hipX + (far ? -4 : 4) + (moving ? Math.sin(ph + k) * 5 : 0) + (air ? (far ? -2 : 3) : 0);
      const fy = G - 2 - (moving ? Math.max(0, Math.cos(ph + k)) * 3 : 0) - (air ? 4 : 0);
      const hx = hipX + (far ? -3 : 3);
      const [kx, ky] = ik(hx, hipY, fx, fy, 9, 8, 1);
      const dk = far ? 0.12 : 0;
      capsule(g, hx, hipY, kx, ky, 5.5, 4.5, far ? 11 : 12, 3, dk);
      capsule(g, kx, ky, fx, fy, 4.5, 4, far ? 13 : 14, 3, dk);
      // pie ancho con dedos planos
      mass(g, fx + 2, fy + 1, 5.5, 2.2, far ? 15 : 16, 2.4, dk);
      for (let d = 0; d < 3; d++) { P(g, fx + 5 + d * 1.6, fy + 2, RAMP[far ? 1 : 2]); P(g, fx + 4.6 + d * 1.6, fy + 1, RAMP[far ? 3 : 5]); }
    };
    drawLeg(legs[0]);

    // Brazo de atrás (se pierde con la primera herida grave).
    const shY = 23 - bob + breath * 0.3;
    if (frac > 0.66) {
      const sx = 26 + lean, sw = moving ? -step * 3 : 0;
      const [ex, ey] = [sx + 1 + sw * 0.5, shY + 10];
      capsule(g, sx, shY, ex, ey, 4.5, 3.5, 21, 3, 0.15);
      capsule(g, ex, ey, ex + 2 + sw, ey + 9, 3.5, 3.2, 22, 3, 0.15);
      mass(g, ex + 2 + sw, ey + 11, 3.2, 2.8, 23, 2.4, 0.15);
    } else {
      // muñón que gotea
      mass(g, 26 + lean, shY + 2, 3.5, 3, 24, 2.6, 0.15);
      drip(g, gl, 26 + lean, shY + 5, t, 40, 7);
    }

    // Joroba, torso y barriga. Con heridas se le abren huecos.
    const holes = [];
    if (frac < 0.8) holes.push([28 + lean, 27 - bob, 2 + (1 - frac) * 2.5]);
    if (frac < 0.5) holes.push([40 + lean, 37 - bob + jig * 0.5, 2 + (1 - frac) * 2.5]);
    // joroba (si falta, un cráter de carne viva que vuelve a crecer)
    mass(g, 25 + lean * 0.8, 22 - bob + breath * 0.3 + (1 - hs) * 6, 11 * hs, (11 + breath * 0.4) * hs, 31, 3.8, 0, humpK < 0.6 ? [[25 + lean * 0.8, 22 - bob + (1 - hs) * 6, 3 * hs]] : null);
    mass(g, 31 + lean, 30 - bob, 12, 11.5, 32, 3.8, 0, holes.length ? [holes[0]] : null); // torso
    mass(g, 38 + lean * 1.1 - (1 - bs) * 4, 37 - bob + jig * 0.5 - (1 - bs) * 3, (12.5 + breath * 0.3) * bs, (11 + jig * 0.4) * bs, 33, 4.4, 0, holes.length > 1 ? [holes[1]] : bellyK < 0.6 ? [[36 + lean, 36 - bob, 2.5]] : null); // barriga
    // pili de la espalda
    for (let i = 0; i < Math.round(9 * humpK); i++) {
      const a = -Math.PI * 0.95 + i * 0.22;
      const bx = 25 + lean * 0.8 + Math.cos(a) * 10.5 * hs, by = 22 - bob + (1 - hs) * 6 + Math.sin(a) * 10.5 * hs;
      pilus(g, gl, bx, by, a - 0.2, 4 + (i % 3), t, i);
    }
    // limo que gotea de la barriga
    for (let i = 0; i < 4; i++) drip(g, gl, 30 + lean + i * 4, 44 - bob + jig * 0.5, t, i, 7);

    drawLeg(legs[1]);

    // Cabeza: hundida entre los hombros, adelantada, con frente de hueso y un ojo.
    const hx = 39 + lean * 1.2, hy = 18 - bob + (frac < 0.33 ? 2 : 0);
    mass(g, hx - 4, hy + 3, 6, 5, 40, 3); // cuello: la cabeza se hunde entre los hombros
    mass(g, hx, hy, 5.5, 5 * (frac < 0.33 ? 0.8 : 1), 41, 2.6);
    mass(g, hx + 1, hy - 2.5, 4.5, 1.8, 42, 2, -0.1); // frente
    P(g, hx + 1, hy - 1, '#0a1004', 4, 2); // cuenca
    P(g, hx + 2, hy - 1, eyeC, 2, 1);
    P(gl, hx + 2, hy - 1, eyeC, 2, 1);
    P(gl, hx + 1, hy - 2, eyeC);
    // boca: dientes de células apretadas
    for (let i = 0; i < 4; i++) P(g, hx + 1 + i, hy + 2 + (i % 2), i % 2 ? '#26400e' : '#d0ec70');

    // Brazo de delante: cuelga hasta la rodilla; te apunta si te ve; puñetazo.
    const sx = 37 + lean, sy = shY + 1;
    let hxp, hyp;
    const throwing = e.state === 'throwWind', thrown = e.state === 'throw';
    if (throwing) {
      // Se echa la mano a la espalda y arranca la bola, que crece en el puño.
      const k = Math.min(1, throwK * 1.6);
      hxp = sx + 4 + (27 + lean - sx - 4) * k; hyp = sy + 19 + (shY - 11 - sy - 19) * k;
    } else if (thrown) { hxp = sx + 15; hyp = sy - 9; } // la arroja: brazo arriba y al frente
    else if (hit) { hxp = sx + 18; hyp = sy + 4; } // golpe: el brazo se estira
    else if (wind > 0) { hxp = sx - 6 - wind * 4; hyp = sy - 6 - wind * 4; } // carga: lo echa atrás
    else {
      const aim = e.aimA ?? 0.5, sw = moving ? step * 3 : 0;
      const hang = [sx + 4 + sw, sy + 19];
      const point = [sx + Math.cos(aim) * 16, sy + Math.sin(aim) * 16];
      const k = e.aiming ? 0.6 : 0;
      hxp = hang[0] + (point[0] - hang[0]) * k; hyp = hang[1] + (point[1] - hang[1]) * k;
    }
    const [ex, ey] = ik(sx, sy, hxp, hyp, 10, 10, wind > 0 ? -1 : 1);
    capsule(g, sx, sy, ex, ey, 5, 4.2, 51, 3);
    capsule(g, ex, ey, hxp, hyp, 4.2, 3.8, 52, 3);
    // mano: palma y dedos gruesos
    const fist = hit ? 1.4 : 1;
    mass(g, hxp, hyp + 1, 3.6 * fist, 3.2 * fist, 53, 2.4);
    if (!hit) for (let d = 0; d < 3; d++) capsule(g, hxp - 1.5 + d * 1.6, hyp + 2.5, hxp - 1.5 + d * 1.8, hyp + 6, 1.1, 0.9, 54 + d, 1.6);
    drip(g, gl, hxp, hyp + 5, t, 50, 5);
    if (throwing && throwK > 0.35) {
      // La bola arrancada, chorreando, sobre la cabeza.
      const r = 5.5 * Math.min(1, (throwK - 0.35) * 2.2);
      mass(g, hxp, hyp - r * 0.6, r, r * 0.92, 60, 2.8);
      drip(g, gl, hxp - 2, hyp + r * 0.3, t, 61, 4);
      if (throwK > 0.8) P(gl, hxp + 1, hyp - r, '#aaff70');
    }
    if (hit) for (let i = 0; i < 4; i++) P(gl, hxp + 4 + i * 2, hyp - 2 + (i % 2) * 4, '#aaff70');
  },
};
