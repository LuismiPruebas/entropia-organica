// ESCARABAJO RINOCERONTE (Territorio del Hueso): un escarabajo hecho del propio
// esqueleto. Su élitro es una jaula de costillas cruzadas (entre ellas se ve la carne
// oscura de dentro) erizada de púas; delante, un pronoto de hueso poroso con un cuerno
// torácico como un fémur; la cabeza es un cráneo agujereado con un ojo de ámbar y un
// gran cuerno en hoz, con espinas en el filo interior. Seis patas de hueso con garras y,
// en medio, un brazo humano que apoya la mano en el suelo: es con lo que escarba antes
// de embestir. De lado, mirando a la derecha. Por piezas (cada una, su función):
//   legs · arm · cage · pronotum · head · horn
// Poses (comportamiento `rhino` en entities/Enemy.js):
//   walk     seis patas en ciclo y la mano que se apoya a cada paso
//   paw      la mano humana escarba el suelo; la cabeza baja y tiembla
//   charge   embiste con la cabeza gacha, el cuerno al frente y las patas a toda prisa
//   toss     levanta el cuerno de golpe (te lanza por los aires)
//   brake / turn   derrapa con las patas por delante; pesado al girarse
//   stunned  el cuerno clavado en la pared: tiembla y patalea
import { px, seg, part, blob, ik, OUTLINE } from './Rig.js';

const C = {
  bone: '#e8dcc0', boneMid: '#bca880', boneDark: '#7e6848', shade: '#4a3424',
  inside: '#1c0e0a', meat: '#4a1a14', hole: '#24140e',
  flesh: '#d0b498', fleshDark: '#8a6a54', fleshLight: '#ecd4bc', wrap: '#3a2418',
  eye: '#ffd040', ivory: '#fff6e0',
};
const W = 96, H = 48, G = 46; // lienzo (con sitio para el cuerno al frente) y suelo

// Hueso con contorno: un trazo grueso oscuro y encima el hueso (y un filo de luz).
function bone(g, x0, y0, x1, y1, w, c = C.boneMid, hi = C.bone) {
  seg(g, x0, y0, x1, y1, OUTLINE, w + 2);
  seg(g, x0, y0, x1, y1, c, w);
  if (hi && w > 1) seg(g, x0, y0 - 0.5, x1, y1 - 0.5, hi, 1);
}

// --- Patas de hueso: fémur grueso, tibia fina, articulación clara y garra de tres.
function legs(g, cy, pose, t, ph, far) {
  const hips = [[17, 0.0], [29, 2.1], [53, 4.2]];
  for (const [hx, off] of hips) {
    const k = hips.findIndex((h) => h[0] === hx);
    const o = off + (far ? Math.PI : 0);
    const speed = pose.st === 'charge' ? 2.2 : 1;
    let fx = hx + (k - 1) * 6 + (pose.moving ? Math.sin(ph * speed + o) * 5 : 0);
    let fy = G - (pose.moving ? Math.max(0, Math.cos(ph * speed + o)) * 3 : 0);
    if (pose.st === 'brake') fx += 4; // las patas por delante, frenando
    if (pose.st === 'stunned') { fx += Math.sin(t * 30 + k) * 2.5; fy -= Math.abs(Math.sin(t * 26 + k)) * 3; }
    const hy = cy + 6;
    const [kx, ky] = ik(hx, hy, fx, fy, 10, 11, -1);
    const c = far ? C.boneDark : C.boneMid, hi = far ? null : C.bone;
    bone(g, hx, hy, kx, ky, far ? 2 : 3, c, hi);
    bone(g, kx, ky, fx, fy - 1, 2, far ? C.shade : C.boneDark, hi);
    px(g, kx - 1, ky - 1, far ? C.boneMid : C.ivory, 2, 2); // rodilla
    // Garra: tres uñas abiertas.
    px(g, fx - 3, fy, OUTLINE, 7, 1);
    px(g, fx - 3, fy - 1, far ? C.boneDark : C.bone, 2, 1); px(g, fx, fy - 1, far ? C.boneDark : C.bone, 1, 1); px(g, fx + 2, fy - 1, far ? C.boneDark : C.bone, 2, 1);
  }
}

// --- El brazo humano, en medio: hombro de bola, codo, muñeca vendada y la mano.
function arm(g, cy, pose, t, ph) {
  const sx = 40, sy = cy + 5;
  let hx = 42 + (pose.moving ? Math.sin(ph + 1) * 5 : 0), hy = G;
  let lift = pose.moving ? Math.max(0, Math.cos(ph + 1)) * 3 : 0;
  let curl = 0; // 0 mano abierta, 1 dedos clavados
  if (pose.st === 'paw') { hx = 44 + Math.sin(t * 16) * 5; lift = Math.max(0, Math.cos(t * 16)) * 3; curl = Math.sin(t * 16) > 0 ? 1 : 0.4; }
  if (pose.st === 'charge') { hx = 34; lift = 2; }
  if (pose.st === 'brake') { hx = 50; curl = 1; }
  hy -= lift;
  const [ex, ey] = ik(sx, sy, hx, hy - 3, 9, 9, 1);
  seg(g, sx, sy, ex, ey, OUTLINE, 6); seg(g, ex, ey, hx, hy - 3, OUTLINE, 5);
  seg(g, sx, sy, ex, ey, C.flesh, 4); seg(g, ex, ey, hx, hy - 3, C.flesh, 3);
  seg(g, sx - 1, sy, ex - 1, ey, C.fleshLight, 1);
  seg(g, ex + 1, ey + 1, hx + 1, hy - 2, C.fleshDark, 1);
  px(g, (ex + hx) / 2 - 1, (ey + hy - 3) / 2, '#6a2a1c', 2, 1); // una costura
  part(g, sx, sy, 3.5, 3.5, C.flesh, C.fleshDark, C.fleshLight); // hombro
  // Muñeca vendada.
  px(g, hx - 2, hy - 5, C.wrap, 4, 1); px(g, hx - 2, hy - 3, C.wrap, 4, 1);
  // Mano: palma y cinco dedos que se abren o se clavan.
  blob(g, hx, hy - 2, 3, 1.5, C.flesh);
  for (let i = 0; i < 5; i++) {
    const fxs = hx - 3 + i * 1.6 + (i === 0 ? -1 : 0);
    const len = (i === 0 ? 2 : 3) - curl;
    const dx = (i - 2) * 0.9;
    seg(g, fxs, hy - 1, fxs + dx, hy - 1 + Math.max(0.5, len), OUTLINE, 2);
    seg(g, fxs, hy - 1, fxs + dx, hy - 1 + Math.max(0.5, len), C.fleshLight, 1);
  }
}

// --- La jaula de costillas: el élitro, con la carne oscura entre los huesos.
function cage(g, gl, cy, t) {
  const cx = 30, rx = 21, ry = 17, base = cy + 5;
  // Hueco: la carne de dentro, apenas visible y latiendo.
  for (let y = -ry; y <= 3; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1) continue;
    px(g, cx + x, base + y, d > 0.92 ? OUTLINE : (x + y * 3) % 7 === 0 ? C.meat : C.inside);
  }
  const beat = 0.15 + 0.1 * Math.sin(t * 3);
  blob(gl, cx - 2, base - 5, 6, 4, `rgba(160,40,30,${beat})`);
  // Costillas: arcos desde la columna (arriba) hasta el borde, inclinados hacia atrás.
  for (let i = 0; i < 6; i++) {
    const x0 = cx - 14 + i * 6.2;
    const yTop = base - ry * Math.sqrt(Math.max(0, 1 - ((x0 - cx) / rx) ** 2));
    // Arco convexo de la columna al borde (curva cuadrática), inclinado hacia atrás.
    const x2 = x0 - 5, y2 = base + 2, qx = x0 + 3, qy = (yTop + y2) / 2 - 1;
    let prev = [x0, yTop + 1];
    for (let k = 1; k <= 8; k++) {
      const u = k / 8, x = (1 - u) ** 2 * x0 + 2 * (1 - u) * u * qx + u * u * x2, y = (1 - u) ** 2 * (yTop + 1) + 2 * (1 - u) * u * qy + u * u * y2;
      bone(g, prev[0], prev[1], x, y, 3, u > 0.6 ? C.boneDark : C.boneMid, u > 0.6 ? null : C.bone);
      prev = [x, y];
    }
  }
  // Bandas longitudinales que cruzan las costillas: el enrejado.
  for (const [k, w] of [[0.5, 2]]) {
    let prev = null;
    for (let x = -rx + 3; x <= rx - 2; x += 3) {
      const y = base - ry * k * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx)));
      if (prev) bone(g, prev[0], prev[1], cx + x, y, w, k > 0.6 ? C.boneMid : C.boneDark, k > 0.6 ? C.bone : null);
      prev = [cx + x, y];
    }
  }
  // Columna: la cresta de arriba, con las púas dorsales.
  let prev = null;
  for (let x = -rx + 2; x <= rx - 3; x += 2) {
    const y = base - ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx)));
    if (prev) bone(g, prev[0], prev[1], cx + x, y, 2, C.boneMid, C.bone);
    prev = [cx + x, y];
  }
  for (let i = 0; i < 6; i++) {
    const x = -rx + 5 + i * 6.5;
    const y = base - ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx)));
    const len = 4 + (i % 2) * 2;
    const tx = cx + x - 1.5, ty = y - len;
    seg(g, cx + x, y, tx, ty, OUTLINE, 3);
    seg(g, cx + x, y, tx, ty, C.boneMid, 2);
    px(g, tx, ty, C.ivory);
  }
  // Púas cortas en la grupa.
  for (let i = 0; i < 3; i++) { const y = base - 4 + i * 3; seg(g, cx - rx + 1, y, cx - rx - 3, y - 1, OUTLINE, 2); px(g, cx - rx - 3, y - 1, C.bone); }
}

// --- Pronoto: escudo de hueso poroso con el cuerno torácico (un fémur).
function pronotum(g, cy, pose) {
  const x = 51, y = cy - 1;
  part(g, x, y, 6, 8, C.boneMid, C.boneDark, C.bone);
  px(g, x - 5, y - 6, C.bone, 3, 2);
  for (const [hx, hy, r] of [[2, -2, 1.4], [-2, 2, 1.2], [2, 4, 1], [-2, -4, 0.9]]) blob(g, x + hx, y + hy, r, r, C.hole);
  // Cuerno torácico: una caña de hueso con la cabeza del fémur en la punta.
  const lean = pose.st === 'toss' ? -0.2 : pose.st === 'charge' ? 0.35 : 0.15;
  const tx = x + 2 + Math.sin(lean + 0.35) * 10, ty = y - 7 - Math.cos(lean + 0.35) * 9;
  bone(g, x + 1, y - 6, tx, ty, 2);
  part(g, tx, ty - 1, 2, 2, C.bone, C.boneMid, C.ivory);
}

// --- Cráneo: placa agujereada, ojo de ámbar y dientes; y el cuerno en hoz.
function head(g, gl, cy, pose, t) {
  const low = pose.st === 'charge' ? 4 : pose.st === 'paw' ? 3 : pose.st === 'toss' ? -3 : 0;
  const hx = 62, hy = cy + 3 + low;
  part(g, hx, hy, 9, 6.5, C.boneMid, C.boneDark, C.bone);
  // Agujeros del cráneo (como hueso esponjoso) y la cuenca del ojo.
  for (const [dx, dy, r] of [[-5, -2, 1.6], [-1, -3, 1.4], [3, -3, 1.1], [-5, 2, 1.2], [6, 0, 1]]) blob(g, hx + dx, hy + dy, r, r * 0.9, C.hole);
  blob(g, hx + 1, hy + 1, 2, 1.6, OUTLINE);
  const hot = pose.st === 'paw' || pose.st === 'charge';
  px(g, hx + 1, hy + 1, C.eye, 1, 1);
  px(gl, hx + 1, hy + 1, hot ? '#fff0a0' : C.eye);
  if (hot) px(gl, hx, hy, 'rgba(255,200,60,0.4)', 3, 3);
  // Dientes bajo la mandíbula.
  for (let i = 0; i < 4; i++) { const x = hx - 1 + i * 2; seg(g, x, hy + 5, x + 1, hy + 7, OUTLINE, 2); px(g, x + 1, hy + 6, C.bone); }
  horn(g, hx + 7, hy - 2, pose, t);
  return [hx, hy];
}

function horn(g, x0, y0, pose) {
  const a0 = pose.st === 'charge' ? -0.05 : pose.st === 'paw' ? -0.15 : pose.st === 'toss' ? -1.35 : pose.st === 'stunned' ? 0.05 : -0.55;
  const pts = [];
  let x = x0, y = y0, a = a0;
  for (let i = 0; i <= 22; i++) { pts.push([x, y, a]); x += Math.cos(a); y += Math.sin(a); a -= 0.058; }
  const width = (i) => (i < 6 ? 4 : i < 12 ? 3 : i < 17 ? 2 : 1);
  for (const pass of [0, 1]) for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const c = i > 16 ? C.ivory : i > 9 ? C.bone : C.boneMid;
    seg(g, ax, ay, bx, by, pass ? c : OUTLINE, pass ? width(i) : width(i) + 2);
  }
  // Filo de luz por el lomo y espinas en el filo interior (cóncavo).
  for (let i = 2; i < pts.length - 3; i++) px(g, pts[i][0] + Math.sin(pts[i][2]) * -1, pts[i][1] + Math.cos(pts[i][2]) * 1, C.boneDark);
  for (const i of [7, 11, 15]) {
    const [sx, sy, a] = pts[i];
    const nx = Math.sin(a), ny = -Math.cos(a); // hacia dentro de la curva
    const len = i === 11 ? 3 : 2.5;
    seg(g, sx, sy, sx + nx * len - Math.cos(a) * 1.5, sy + ny * len - Math.sin(a) * 1.5, OUTLINE, 2);
    px(g, sx + nx * len - Math.cos(a) * 1.5, sy + ny * len - Math.sin(a) * 1.5, C.bone);
  }
  const [tx, ty] = pts[pts.length - 1];
  px(g, tx, ty, '#ffffff');
}

export const RHINO = {
  size: () => [W, H],
  // El lienzo se espeja entero al mirar a la izquierda: el cuerpo (x 36) queda sobre cx.
  origin: (e) => [e.dir < 0 ? e.cx - (W - 37) : e.cx - 36, e.y + e.h - H + 1],
  draw(g, gl, e, t) {
    const st = e.state ?? 'walk';
    const moving = Math.abs(e.vx) > 2;
    e.walkPh = (e.walkPh ?? 0) + Math.abs(e.vx) * 0.0022;
    const ph = e.walkPh * Math.PI * 2;
    const shake = st === 'paw' || st === 'stunned' ? Math.sin(t * 50) * 0.6 : 0;
    const low = st === 'charge' ? 2 : st === 'paw' ? 1 : 0;
    const cy = G - 22 + low + (moving ? Math.abs(Math.sin(ph)) * 0.8 : 0) + shake;
    const pose = { st, moving };

    legs(g, cy, pose, t, ph, true);
    cage(g, gl, cy, t);
    arm(g, cy, pose, t, ph);
    pronotum(g, cy, pose);
    const [hx, hy] = head(g, gl, cy, pose, t);
    legs(g, cy, pose, t, ph, false);

    // Polvo de hueso al cargar o escarbar.
    if ((st === 'charge' || st === 'paw') && Math.sin(t * 40) > 0) px(gl, 38 + Math.random() * 10, G - 1, 'rgba(220,200,160,0.6)');
    // Fijado: la jaula (la espalda, vulnerable) y el cráneo con el cuerno (la coraza).
    e.spotsLocal = [{ x: 24, y: cy - 6, r: 8, weak: true }, { x: hx, y: hy, r: 6, weak: false }];
  },
};
