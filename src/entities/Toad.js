import { px, seg, limb, blob, ik, OUTLINE as K } from './Rig.js';

// SAPO PARTERO (jefe de la charca, Enemy.bossToad): una mole agazapada de carne gris
// verdosa, moteada de pardo, que carga a la espalda una joroba de huevos color hueso
// (pegados con mucosa que chorrea). Muchos están reventados: por los agujeros asoman
// gusanos rosados que se retuercen. Cabeza de reptil con unas fauces que se abren en
// cepo: colmillos largos arriba y abajo, encías rosadas, lengua colgando, babas, y un
// ojo amarillo de rendija bajo una ceja ósea. Se dibuja mirando a la derecha.
//
// Poses según e.state: sit (respira, enseña los dientes, croa) · crouch (se agazapa y
// jadea) · leap (estirado en el aire, fauces abiertas) · land (aplastado: aturdido) ·
// brood (los huevos se hinchan y los gusanos salen) · biteWind / bite (echa la cabeza
// atrás y la dispara con las fauces abiertas de par en par).

const W = 168, H = 100, GROUND = H - 1;
const C = {
  skin: '#4e5650', skinD: '#30362f', skinL: '#6e7a70', mot: '#6a5a3e', motD: '#3a3628',
  lip: '#24181c', gum: '#c86070', gumL: '#e8909c', throat: ['#160308', '#3a0a14', '#6a1a2c', '#8e2a3e'],
  tooth: '#e8dcb8', toothD: '#b4a07a', toothL: '#fffaf0',
  tongue: '#c05a78', tongueL: '#e890a8', tongueD: '#7a2a44',
  egg: '#d8ccb4', eggD: '#a8987e', eggL: '#f0e8d8', speck: '#7a4a30',
  hole: '#2a0e0c', holeRim: '#5a2a20', holeIn: '#7a2a28',
  worm: '#b05a78', wormD: '#6a2a40', wormL: '#e090b0',
  mucus: '#d0c090', mucusL: '#f0e0b0', drool: '#d8cca8',
  eye: '#f0c830', eyeD: '#a87a10', claw: '#e0d4b4', acid: '#9be06a',
};
// Ruido fijo por píxel (moteado de la piel, motas de los huevos): no parpadea.
const hash = (x, y) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 100) / 100;

// Piel moteada: rellena una elipse con la carne gris verdosa, sombreada (luz arriba a
// la izquierda), con manchas pardas.
function hide(g, cx, cy, rx, ry, salt = 0) {
  blob(g, cx, cy, rx + 1, ry + 1, K);
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1) continue;
    const lit = (-x / rx - y / ry) * 0.5;
    let c = d > 0.72 && lit < 0.1 ? C.skinD : lit > 0.42 && d > 0.3 ? C.skinL : C.skin;
    const n = hash(x + salt, y + salt * 3);
    if (n > 0.9) c = C.mot; else if (n < 0.06) c = C.motD;
    px(g, cx + x, cy + y, c);
  }
}

// Una mandíbula como cuña de carne a lo largo del ángulo `ang` desde la bisagra.
// side -1 = la de arriba (cráneo grueso con crestas), +1 = la de abajo (más fina).
function jaw(g, x0, y0, ang, L, side) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const nx = side < 0 ? sn : -sn, ny = side < 0 ? -cs : cs;      // hacia fuera de la boca
  const th = (u) => (side < 0 ? 15 - 8 * (u / L) : 10 - 4.5 * (u / L)) - Math.max(0, u - (L - 3)) * 1.4;
  const R = Math.ceil(L + 14);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const u = x * cs + y * sn, v = x * nx + y * ny;
    if (u < -2 || u > L + 0.5) continue;
    const t = th(Math.max(0, u));
    if (v < -0.5 || v > t + 1) continue;
    let c;
    if (v > t || u > L - 0.5) c = K;                                   // contorno
    else if (v < 1.2) c = C.lip;                                        // labio
    else {
      const k = v / t;
      c = side < 0 ? (k > 0.72 ? C.skinL : k < 0.3 ? C.skinD : C.skin) : (k > 0.6 ? C.skinD : C.skin);
      if (side < 0 && k > 0.55 && Math.round(u) % 6 === 0) c = C.skinD;  // crestas del cráneo
      const n = hash(Math.round(u) + 7, Math.round(v) + side * 11);
      if (n > 0.9) c = C.mot; else if (n < 0.05) c = C.motD;
    }
    px(g, x0 + x, y0 + y, c);
  }
  return { cs, sn, nx, ny, th };
}

// Colmillo: triángulo de hueso que sale del labio (bx, by) en la dirección (dx, dy).
function fang(g, bx, by, dx, dy, len) {
  const n = Math.max(2, Math.round(len * 2));
  for (const pass of [0, 1]) for (let i = 0; i <= n; i++) {
    const k = i / n, w = Math.max(1, Math.round((1 - k) * (len > 5 ? 3 : 2)));
    const x = bx + dx * len * k, y = by + dy * len * k;
    if (pass === 0) px(g, x - w / 2 - 0.5, y - 0.5, K, w + 1, 2);
    else px(g, x - w / 2, y, k < 0.25 ? C.toothD : C.tooth, w, 1);
  }
  px(g, bx + dx * len, by + dy * len, C.toothL);
}

// La cabeza entera: mandíbulas, interior de la boca, dientes, lengua, babas y ojo.
// open 0..1 (0 = cerrada enseñando los colmillos; 1 = abierta en cepo, casi 90° por lado).
function head(g, gl, x0, y0, open, t, look, blink, blood = 0) {
  const base = 0.08, a = 0.05 + open * 0.72, L = 36 + open * 4;
  hide(g, x0 - 4, y0 - 2, 12, 11, 31);                         // carrillo y nuca: tapan la bisagra
  // Interior: de la garganta (negra) a los labios, con anillos en el gaznate y encías.
  if (a > 0.12) for (let y = -Math.ceil(L); y <= L; y++) for (let x = 0; x <= L; x++) {
    const d = Math.hypot(x, y), ar = Math.atan2(y, x) - base;
    if (d > L - 0.5 || Math.abs(ar) >= a || d < 1) continue;
    if (d * Math.cos(ar) > (L - 3) * Math.cos(a) + 2) continue;                // nada por delante de las puntas
    let c = C.throat[Math.min(3, Math.floor((d / L) * 4.4))];
    if (Math.abs(d - L * 0.28) < 0.6 || Math.abs(d - L * 0.42) < 0.6) c = '#4a0e1a'; // anillos
    const edge = (a - Math.abs(ar)) * d;                                       // px hasta el labio
    if (edge < 3.5 && d > 4) c = edge < 1.8 ? C.gumL : C.gum;                 // encías
    px(g, x0 + x, y0 + y, c);
  }
  const lo = jaw(g, x0, y0, base + a, L - 2, 1);
  // Lengua gruesa que sale de la garganta, cae sobre la mandíbula de abajo y cuelga.
  if (open > 0.3) {
    const sway = Math.sin(t * 3) * 1.5;
    const dir = (ang, d) => [x0 + Math.cos(ang) * d, y0 + Math.sin(ang) * d];
    const p0 = dir(base + a * 0.35, L * 0.25), p1 = dir(base + a * 0.7, L * 0.8);
    const p2 = [p1[0] + 6 + sway, p1[1] + 4 + open * 9];
    limb(g, p0[0], p0[1], p1[0], p1[1], 5, C.tongue, C.tongueL);
    limb(g, p1[0], p1[1], p2[0], p2[1], 4, C.tongue, C.tongueL);
    seg(g, p1[0], p1[1] - 1, p2[0] - 1, p2[1], C.tongueD, 1);                 // surco
    px(g, p2[0] - 1, p2[1] + 2, C.tongueD, 3, 1);
  }
  const up = jaw(g, x0, y0, base - a, L, -1);
  // Dientes: una fila en cada labio, apuntando a la otra mandíbula; los de delante,
  // colmillos enormes. Con la boca cerrada se cruzan por fuera.
  const row = (j, s, Lj) => {
    for (let u = 6, i = 0; u < Lj - 1; u += 3.4, i++) {
      const front = u > Lj - 6, mid = i === 3;
      // Cerrada solo asoman los colmillos grandes (cruzados por fuera del labio).
      if (open < 0.2 && !front && !mid) continue;
      const len = (front ? (s < 0 ? 10 : 8) : mid ? 7 : 3.5 + (i % 2) * 2) * (0.7 + open * 0.5);
      const dx = -j.nx - j.cs * 0.25, dy = -j.ny - j.sn * 0.25, m = Math.hypot(dx, dy);
      fang(g, x0 + j.cs * u, y0 + j.sn * u, dx / m, dy / m, len);
    }
  };
  row(lo, 1, L - 2);
  row(up, -1, L);
  // Babas: hilos que cuelgan entre las dos mandíbulas.
  if (open > 0.25) for (const k of [0.45, 0.66, 0.84]) {
    const ax = x0 + up.cs * L * k, ay = y0 + up.sn * L * k;
    const bx = x0 + lo.cs * (L - 2) * k, by = y0 + lo.sn * (L - 2) * k;
    const n = Math.max(2, Math.round(Math.abs(by - ay)));
    for (let i = 1; i < n; i++) {
      if ((i + Math.round(k * 10)) % 5 === 4) continue;                       // hilo roto
      const s = i / n, sag = Math.sin(s * Math.PI) * (2 + k * 2) + Math.sin(t * 2 + k * 9) * 0.6;
      px(g, ax + (bx - ax) * s + sag, ay + (by - ay) * s, blood > 0 && (i + Math.round(k * 7)) % 3 ? '#9a1020' : C.drool);
    }
  }
  // Baba ácida que gotea del labio de abajo.
  const drip = (t * 5) % 8;
  const lx = x0 + lo.cs * (L - 6), ly = y0 + lo.sn * (L - 6) + 6;
  seg(g, lx, ly, lx, ly + drip, blood > 0 ? '#7a0a14' : C.drool, 1);
  px(g, lx, ly + drip, blood > 0 ? '#c01a24' : C.acid); if (!blood) px(gl, lx, ly + drip, C.acid);
  // Sangre en los labios y goteando de los colmillos tras morderte.
  if (blood > 0) {
    for (let u = 10; u < L - 2; u += 5) {
      const ux = x0 + up.cs * u - up.nx * 1, uy = y0 + up.sn * u - up.ny * 1;
      px(g, ux, uy, '#9a1020', 2, 2);
      const dl = ((t * 7 + u) % 9) * Math.min(1, blood);
      seg(g, ux, uy + 2, ux, uy + 2 + dl, '#7a0a14', 1);
      px(g, ux, uy + 3 + dl, '#c01a24');
    }
  }
  // Ollar en la punta del hocico.
  px(g, x0 + up.cs * (L - 4) + up.nx * 5, y0 + up.sn * (L - 4) + up.ny * 5, K, 2, 1);
  // Ojo amarillo de rendija bajo una ceja ósea, en lo alto del cráneo.
  const eu = 8, ev = up.th(eu) - 3.5;
  const ex = Math.round(x0 + up.cs * eu + up.nx * ev), ey = Math.round(y0 + up.sn * eu + up.ny * ev);
  blob(g, ex, ey + 0.5, 3.6, 3.1, K);
  if (blink) blob(g, ex, ey + 0.5, 2.6, 2.1, C.skinD);
  else {
    blob(g, ex, ey + 0.5, 2.6, 2.1, C.eye);
    px(g, ex - 1, ey + 2, C.eyeD, 3, 1);
    px(g, ex + Math.round(Math.cos(look)), ey - 1 + Math.round(Math.sin(look) * 0.7), K, 1, 4); // rendija
    px(g, ex - 2, ey - 1, C.toothL);
    px(gl, ex - 1, ey, C.eye, 3, 2);
  }
  seg(g, ex - 5, ey - 4, ex + 4, ey - 3, K, 2);                                // ceja ósea
  seg(g, ex - 4, ey - 4, ex + 3, ey - 3, C.skinL, 1);
}

// Joroba de huevos: [dx, dy, radio, tipo] desde la base de la joroba. tipo 0 entero,
// 1 reventado (agujero), 2 reventado con gusano. Se pinta de arriba abajo: los de
// abajo tapan a los de arriba.
const EGGS = [
  [-12, -27, 5, 2], [-1, -30, 6, 0], [10, -26, 5, 1],
  [-23, -18, 6, 0], [-11, -19, 6, 1], [1, -21, 6, 2], [12, -17, 6, 0],
  [-30, -9, 6, 1], [-18, -10, 6, 2], [-6, -11, 7, 1], [6, -10, 6, 0], [16, -7, 5, 2],
  [-34, -1, 6, 0], [-23, -1, 6, 1], [-11, -2, 6, 0], [1, -1, 6, 1], [11, 0, 5, 0],
];
// Huevo que revienta (age: segundos desde el estallido): primero se abre en esquirlas de
// cáscara y un chorro de mucosa; después queda el agujero, con el gusano que asoma un
// momento; al cabo de un rato el huevo vuelve a crecer (regrow 0..1).
function burstEgg(g, gl, cx, cy, r, i, t, age) {
  if (age < 0.4) {
    const k = age / 0.4;
    // Esquirlas que salen despedidas hacia fuera y caen.
    for (let s = 0; s < 9; s++) {
      const a = (s / 9) * Math.PI * 2 + i, d = r * (0.6 + k * 4);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8 + k * k * 10;
      px(g, x - 1, y - 1, K, 3, 3);
      px(g, x, y, s % 3 ? C.eggL : C.egg, 2, s % 2 ? 1 : 2);
    }
    // Mucosa y líquido del huevo que salpican.
    for (let s = 0; s < 6; s++) {
      const a = -Math.PI / 2 + (s - 2.5) * 0.5, d = r * (0.4 + k * 3);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d + k * k * 14;
      px(g, x - 1, y - 1, K, 4, 4); px(g, x, y, s % 2 ? C.mucusL : C.mucus, 3, 3);
    }
    if (k < 0.5) { blob(g, cx, cy, r * (1 + k), r * (1 + k), C.eggL); px(gl, cx - 1, cy - 1, '#fff0d0', 3, 3); }
  }
  // El agujero que queda (y el gusano asomando el primer segundo).
  const hole = Math.min(1, age / 0.25);
  const hr = r * 0.55 * hole;
  if (hr > 0.5) {
    blob(g, cx, cy, hr + 1.5, hr * 0.9 + 1.5, C.holeRim);
    blob(g, cx, cy, hr, hr * 0.9, C.hole);
  }
  if (age > 0.25 && age < 1.6) {
    const out = Math.sin(Math.min(1, (age - 0.25) / 1.35) * Math.PI);
    let x = cx, y = cy, ang = -Math.PI / 2 + Math.sin(t * 9 + i) * 0.5;
    for (let s = 0; s < Math.round(3 + out * 6); s++) {
      ang += Math.sin(t * 12 + s + i) * 0.35;
      x += Math.cos(ang) * 1.5; y += Math.sin(ang) * 1.5;
      blob(g, x, y, 2.2, 2.2, K); blob(g, x, y, 1.5, 1.5, s % 2 ? C.worm : C.wormD);
    }
  }
}

const REGROW = 14; // segundos hasta que un huevo reventado vuelve a crecer
function egg(g, cx, cy, r, kind, i, t, stir) {
  if (r < 0.5) return;
  const ry = r * 1.1;
  blob(g, cx, cy, r + 1, ry + 1, K);
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
    const d = (x * x) / (r * r) + (y * y) / (ry * ry);
    if (d > 1) continue;
    const lit = (-x / r - y / ry) * 0.5;
    let c = lit > 0.35 && d < 0.7 ? C.eggL : lit < -0.2 || d > 0.8 ? C.eggD : C.egg;
    if (hash(x + i * 13, y + i * 7) > 0.9) c = C.speck;                       // motas pardas
    px(g, cx + x, cy + y, c);
  }
  if (!kind) return;
  // Reventado: agujero de bordes carnosos mirando hacia fuera.
  const hx = cx + 1, hy = cy + 1, hr = r * 0.5;
  blob(g, hx, hy, hr + 1, hr * 0.9 + 1, C.holeRim);
  blob(g, hx, hy, hr, hr * 0.9, C.holeIn);
  blob(g, hx + 0.5, hy + 0.5, hr - 1, hr * 0.9 - 1, C.hole);
  if (kind < 2) return;
  // Gusano rosado que asoma del agujero y se retuerce (más fuera cuanto más inquieto).
  const len = 5 + Math.round(stir * 6), curl = i % 2 ? 1 : -1;
  const pts = [];
  let x = hx, y = hy, ang = -Math.PI / 2 - curl * 0.6 + Math.sin(t * 4 + i) * 0.3;
  for (let s = 0; s < len; s++) {
    ang += curl * (0.32 + Math.sin(t * 6 + i * 1.7 + s * 0.8) * 0.12);       // se enrosca y se retuerce
    x += Math.cos(ang) * 1.5; y += Math.sin(ang) * 1.5;
    pts.push([x, y]);
  }
  for (const [qx, qy] of pts) blob(g, qx, qy, 2.4, 2.4, K);
  pts.forEach(([qx, qy], s) => blob(g, qx, qy, 1.6, 1.6, s % 2 ? C.worm : C.wormD));   // anillos
  pts.forEach(([qx, qy], s) => { if (s % 2) px(g, qx - 1, qy - 1, C.wormL); });
  px(g, x, y, C.hole);                                                          // boca del gusano
}

export const TOAD = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2, e.y + e.h - H],
  draw(g, gl, e, t, game) {
    const st = e.state ?? 'sit';
    const air = st === 'leap';
    const crouch = st === 'crouch' ? 1 : 0;
    const squash = st === 'land' ? 1 : 0;
    const shake = crouch ? Math.round(Math.sin(t * 60)) : 0;
    // Respira hinchando el cuerpo; agazapado jadea deprisa; aturdido boquea.
    const seed = (e.seed ?? (e.seed = Math.random() * 10));
    const breath = Math.sin((t + seed) * (crouch ? 9 : squash ? 5 : 2.2));
    const swell = (breath + 1) / 2;
    // Croar: cada ~3,6 s el saco de la garganta se infla y entreabre las fauces.
    const cp = ((t + seed) % 3.6) / 3.6;
    const croak = st === 'sit' && cp < 0.28 ? Math.sin((cp / 0.28) * Math.PI) : 0;
    const blink = ((t * 0.27 + seed) % 1) < 0.035;
    const windup = st === 'biteWind' ? Math.min(1, e.biteWK ?? 1) : 0;
    const bite = st === 'bite' ? (e.biteK ?? 0) : 0;
    const snap = st === 'bite' ? (e.snapK ?? 0) : 0;
    const wind = windup * windup;                                       // se carga despacio y al final del todo

    const bx = W / 2 - 8 + shake;
    const bodyY = GROUND - 24 + crouch * 5 + squash * 6 - (air ? 6 : 0) - (air ? 0 : swell);
    const rx = 35 + squash * 4 + (air ? 0 : swell);
    const ry = 19 - squash * 4 + (air ? 1 : 0) + (air ? 0 : swell * 1.2);

    // ---- Patas: traseras con un muslo enorme; delanteras gruesas; garras de hueso.
    const backLeg = (far) => {
      const o = far ? 6 : 0, col = far ? C.skinD : C.skin;
      const hipx = bx - 20 + o, hipy = bodyY + 4;
      const fx = air ? hipx - 30 : hipx - 10 - crouch * 3, fy = air ? hipy + 16 : GROUND - 1;
      const [kx, ky] = air ? [hipx - 14, hipy + 8] : [hipx + 6, GROUND - 6 + crouch * 2];
      if (!far) hide(g, hipx, hipy, 17 - (air ? 4 : 0), 14 - (air ? 3 : 0), 5); // muslo
      else limb(g, hipx, hipy, kx, ky, 14, col);
      limb(g, kx, ky, fx, fy, 8, col, far ? null : C.skinL);                      // espinilla
      if (!far && !air) for (let i = 0; i < 3; i++) seg(g, hipx - 8 + i * 5, hipy - 7, hipx - 4 + i * 5, hipy + 7, C.skinD, 1); // estrías
      for (const [dx, dy] of [[-14, 0], [-9, 0], [-4, 0], [2, 0]]) {              // dedos y garras
        const tx = fx + dx, ty = fy + dy - (air ? 3 : 0);
        limb(g, fx, fy - 2, tx, ty - 1, 3, col);
        seg(g, tx - 1, ty - 1, tx - 5, ty, K, 3);
        seg(g, tx - 1, ty - 1, tx - 5, ty, C.claw, 1);
      }
    };
    const frontLeg = (far) => {
      const o = far ? -7 : 0, col = far ? C.skinD : C.skin;
      const sx = bx + 18 + o, sy = bodyY + 6;
      const hx = sx + (squash ? 10 : 6) + (air ? 10 : 0), hy = air ? sy + 10 : GROUND - 1;
      const [ex, ey] = ik(sx, sy, hx, hy, 12, 12, -1);
      limb(g, sx, sy, ex, ey, far ? 9 : 11, col, far ? null : C.skinL);
      limb(g, ex, ey, hx, hy - 1, far ? 7 : 8, col, far ? null : C.skinL);
      for (const dx of [-3, 2, 7]) {
        limb(g, hx, hy - 2, hx + dx + 2, hy - 1, 3, col);
        seg(g, hx + dx + 3, hy - 1, hx + dx + 7, hy + (air ? 2 : 0), K, 3);
        seg(g, hx + dx + 3, hy - 1, hx + dx + 7, hy + (air ? 2 : 0), C.claw, 1);
      }
    };
    backLeg(true);
    frontLeg(true);

    // ---- Cuerpo: mole gris verdosa moteada, con el vientre colgando.
    hide(g, bx, bodyY, rx, ry, 0);
    blob(g, bx + 4, bodyY + ry - 5, rx - 10, 4, C.skinD);
    for (let i = 0; i < 4; i++) seg(g, bx - 6 + i * 7, bodyY + ry - 7, bx - 4 + i * 7, bodyY + ry - 3, K, 1); // pliegues

    // ---- Joroba de huevos pegada con mucosa; al criar se hinchan y los gusanos salen.
    const brood = st === 'brood' ? 1 - Math.max(0, e.timer ?? 0) / 0.9 : 0;
    const ready = Math.max(0, 1 - Math.max(0, e.broodCool ?? 9) / 4);
    const stir = Math.min(1, ready * 0.6 + brood);
    const hbx = bx - 4, hby = bodyY - ry + 8 + squash * 2;
    blob(g, hbx - 10, hby - 4, 26, 10, C.motD);                                 // la carne que los sujeta
    const now = game?.time ?? t, popped = e.popped ?? {}, pending = e.popPending ?? [];
    EGGS.forEach(([dx, dy, r, kind], i) => {
      const x = hbx + dx, y = hby + dy;
      if (popped[i] !== undefined) {
        const age = now - popped[i];
        const regrow = age > REGROW ? Math.min(1, (age - REGROW) / 1.5) : 0;
        if (regrow > 0) egg(g, x, y, r * regrow, 0, i, t, 0);                // vuelve a crecer
        else burstEgg(g, gl, x, y, r, i, t, age);
        return;
      }
      // Los que van a reventar se hinchan, tiemblan y se agrietan.
      const doom = pending.includes(i) ? brood : 0;
      const pulse = doom ? 0.6 + doom * 2.2 + Math.sin(t * 30 + i) * doom : brood ? brood * 0.4 : 0;
      egg(g, x + (doom ? Math.sin(t * 40 + i) * doom : 0), y, r + pulse, kind, i, t, stir);
      if (doom > 0.4) for (let s = 0; s < 3; s++) seg(g, x - 2 + s * 2, y - r * 0.6, x - 1 + s * 2 + (s - 1), y + r * 0.2, C.speck, 1); // grietas
      if (doom > 0.6) px(gl, x - 1, y - 1, '#ffe8b0', 2, 2);
    });
    for (const [dx, base] of [[-30, 5], [-19, 7], [-7, 4], [4, 6], [13, 3]]) {   // mucosa que chorrea
      const len = base + Math.round(Math.sin(t * 1.3 + dx) * 2);
      const x = hbx + dx, y = hby + 4;
      seg(g, x, y, x, y + len, C.mucus, 2);
      px(g, x, y, C.mucusL);
      blob(g, x + 0.5, y + len + 1, 1.5, 1.8, C.mucus);
      px(g, x, y + len, C.mucusL);
    }

    backLeg(false);
    frontLeg(false);

    // ---- Cabeza. Bocado: se echa atrás (biteWind) y sale disparada sobre el cuello.
    const tremble = windup ? Math.round(Math.sin(t * 70) * wind * 1.5) : snap > 0 && bite > 0.9 ? Math.round(Math.sin(t * 90)) : 0;
    const hx = bx + 22 - wind * 9 + bite * 28 + tremble, hy = bodyY - 7 + crouch * 2 + squash * 2 + wind * 3 - bite * 3;
    if (wind > 0.05) {
      // Anticipación: el cuello se encoge y se hincha como un muelle, con pliegues.
      const nr = 10 + wind * 5;
      blob(g, hx - 6, hy + 4, nr + 1, nr * 0.75 + 1, K);
      blob(g, hx - 6, hy + 4, nr, nr * 0.75, C.skin, C.skinD, C.skinL);
      for (let i = -2; i <= 2; i++) seg(g, hx - 6 + i * 3, hy - 2, hx - 7 + i * 3, hy + 9, C.skinD, 1);
    }
    if (bite > 0.05) {
      // Embestida: el cuello estirado y tenso, con los tendones marcados y venas.
      limb(g, bx + 14, bodyY - 2, hx - 4, hy, 13 - bite * 3, C.skin, C.skinL);
      const n = 6;
      for (let i = 1; i < n; i++) {
        const k = i / n, x = bx + 14 + (hx - 4 - bx - 14) * k, y = bodyY - 2 + (hy - bodyY + 2) * k;
        px(g, x, y - 5 + bite, C.skinD, 2, 1);                                   // tendón de arriba
        px(g, x, y + 4 - bite, C.skinD, 2, 1);                                   // de abajo
        if (i % 2) px(g, x, y, '#7a3040');                                       // vena
      }
    }
    // Saco de la garganta: se infla al croar y al criar.
    const sacR = 3 + swell + croak * 6 + (st === 'brood' ? 3 : 0);
    blob(g, hx + 6, hy + 10, sacR + 1, sacR * 0.7 + 1, K);
    blob(g, hx + 6, hy + 10, sacR, sacR * 0.7, '#9a948a', '#6a6660');
    px(g, hx + 4, hy + 8, '#c8c0b4');
    // Apertura: siempre enseña los colmillos; jadea, croa, ruge al saltar y en el
    // bocado se abre de par en par.
    // Bocado: abiertas de par en par al embestir y de golpe cerradas (cepo) al morder.
    const want = st === 'bite' ? (snap > 0 ? 0 : 1) : windup ? 0.15 + wind * 0.85 + (Math.sin(t * 50) > 0 ? 0.03 : 0)
      : air ? 0.55 : st === 'brood' ? 0.35 : crouch ? 0.15 + swell * 0.1 : squash ? 0.25 + swell * 0.2 : croak * 0.3;
    e.jaw = st === 'bite' ? want : (e.jaw ?? 0) + (want - (e.jaw ?? 0)) * (windup ? 0.5 : 0.3); // el cepo no se suaviza
    const p = game.player;
    const look = Math.atan2(p.cy - e.cy, (p.cx - e.cx) * (e.dir < 0 ? -1 : 1));
    head(g, gl, hx, hy, Math.max(0, e.jaw), t, look, (blink || squash) && !windup, e.bloody ?? 0);
    // El chasquido del cepo: unas rayas de impacto delante de las fauces.
    if (snap > 0 && bite > 0.85) for (let i = -1; i <= 1; i++) { px(g, hx + 40, hy + i * 5 - 1, C.toothL, 4, 1); px(gl, hx + 40, hy + i * 5 - 1, '#fff4d0', 4, 1); }
    // Aturdido: estrellitas de bilis sobre la cabeza.
    if (squash) for (let i = 0; i < 3; i++) {
      const s = t * 6 + i * 2.1;
      px(g, hx + 10 + Math.cos(s) * 8, hy - 18 + Math.sin(s) * 2, C.acid, 2, 2);
      px(gl, hx + 10 + Math.cos(s) * 8, hy - 18 + Math.sin(s) * 2, C.acid, 2, 2);
    }
  },
};
