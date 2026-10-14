import { px, seg, limb, blob, part, ik, OUTLINE as K } from './Rig.js';

// SAPO PARTERO (jefe de la charca, Enemy.bossToad): un sapo enorme de carne cenicienta
// y moteada, con la panza pálida y enfermiza (gris: se distingue del verde del ácido).
// Carga a sus crías en celdas inflamadas hundidas en la espalda; una cicatriz cosida le
// cruza el lomo (salió de una cámara del laboratorio). Patas traseras musculosas con
// garras, boca de oreja a oreja llena de dientes, saco bucal que se hincha, dos ojos
// saltones inyectados en sangre y un tercero, pequeño y deforme, en la sien.
// Se dibuja mirando a la derecha.
//
// Poses según e.state: sit (respira, se arrastra) · crouch (se agazapa y tiembla) ·
// leap (estirado en el aire) · land (aplastado, con la panza al aire: aturdido) ·
// brood (las celdas se hinchan y asoman las sanguijuelas antes de reventar).

const W = 108, H = 60, GROUND = H - 1; // grande: deja sitio a las fauces cuando las dispara (bocado)
const C = {
  skin: '#6c6874', skinD: '#44404c', skinL: '#9e98a6', spot: '#4c4852', wart: '#8a8290', wartL: '#bab2c0',
  belly: '#c0b0b4', bellyD: '#8e7e86', scar: '#3a2a2a', stitch: '#d8ccb8',
  cell: '#2a1414', cellRim: '#a0605e', cellRimD: '#6a3a3a',
  leech: '#5a2a38', leechL: '#c05a6a',
  mouth: '#5a1420', tooth: '#e8dcc8', sac: '#c8a4a0', sacD: '#8a6a68',
  eye: '#d8c84a', vein: '#a02a2a', acid: '#9be06a', claw: '#d8ccb8',
};
// Ruido fijo por píxel (para el moteado de la piel: no parpadea entre fotogramas).
const hash = (x, y) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 100) / 100;

// Fauces del bocado: las dos mandíbulas se abren en cepo desde la bisagra (x0, y0) y
// enseñan todo el interior: garganta honda con anillos, encías rosadas, dos filas de
// dientes que apuntan hacia dentro, lengua gruesa e hilos de baba. Puede tragar algo
// del tamaño de su cuerpo. `bite` 0..1 = cuánto se ha abierto.
function drawMaw(g, gl, x0, y0, bite, t) {
  const a = 0.25 + bite * 0.6;                   // media apertura (rad): casi 100° en total
  const L = 15 + bite * 6;                       // largo de cada mandíbula
  const dir = (ang, d) => [x0 + Math.cos(ang) * d, y0 + Math.sin(ang) * d];
  const [ux, uy] = dir(-a, L), [lx, ly] = dir(a, L);
  // Mandíbulas por fuera: la de arriba es la cabeza (piel), la de abajo, la barbilla pálida.
  limb(g, x0, y0 - 1, ux, uy - 2, 8, C.skin, C.skinL);
  limb(g, x0, y0 + 1, lx, ly + 2, 7, C.skin, C.belly);
  for (const k of [0.35, 0.6, 0.85]) { const [sx, sy] = dir(-a, L * k); px(g, sx, sy - 3, C.spot); } // moteado
  // Interior: de la garganta (negra) a los labios (rojos), con anillos en el gaznate.
  for (let y = -Math.ceil(L); y <= Math.ceil(L); y++) for (let x = 0; x <= Math.ceil(L); x++) {
    const d = Math.hypot(x, y), ang = Math.atan2(y, x);
    if (d > L - 0.5 || Math.abs(ang) > a - 0.1) continue;
    const k = d / L;
    let c = k < 0.28 ? '#120208' : k < 0.5 ? '#3e0a16' : k < 0.75 ? '#6e1a2a' : '#922a3c';
    if (Math.abs(d - L * 0.3) < 0.6 || Math.abs(d - L * 0.45) < 0.5) c = '#5a1222'; // anillos del gaznate
    if (Math.abs(ang) > a - 0.24 && d > 4) c = Math.abs(ang) > a - 0.15 ? '#e8909c' : '#c86070'; // encías
    px(g, x0 + x, y0 + y, c);
  }
  // Lengua gruesa y bífida, tendida sobre la mandíbula de abajo.
  const [tx, ty] = dir(a * 0.35, L * 0.75);
  limb(g, x0 + 2, y0 + 2, tx, ty, 3, '#c0506a', '#e88a9a');
  px(g, tx + 1, ty - 1, '#e88a9a'); px(g, tx + 1, ty + 1, '#a03a50');
  // Dientes: dos filas en las encías, largos y curvos, apuntando hacia dentro.
  for (const s of [-1, 1]) {
    for (let d = 6; d < L - 1; d += 4) {
      const [bx, by] = dir(s * (a - 0.16), d);
      const inward = s * (a - 0.16) - s * Math.PI / 2 + s * 0.35; // hacia dentro y algo hacia la garganta
      const len = 2 + (d > L * 0.6 ? 1 : 0);
      const ex = bx + Math.cos(inward) * len, ey = by + Math.sin(inward) * len;
      seg(g, bx, by, ex, ey, '#5a1222', 3);
      seg(g, bx, by, ex, ey, C.tooth, 2);
      px(g, ex, ey, '#fffaf0');
    }
  }
  // Hilos de baba entre las dos mandíbulas, que se estiran al abrir.
  for (const k of [0.62, 0.86]) {
    const [ax, ay] = dir(-(a - 0.22), L * k), [bx, by] = dir(a - 0.22, L * k);
    const n = Math.round(Math.abs(by - ay));
    for (let i = 1; i < n; i += 2) {
      const sag = Math.sin((i / n) * Math.PI) * 2;              // la baba cuelga en curva
      px(g, ax + (bx - ax) * (i / n) + sag, ay + (by - ay) * (i / n), '#c8dcb0');
    }
  }
  // Labios oscuros y ácido que gotea del de abajo.
  seg(g, x0, y0 - 1, ux, uy, K, 1);
  seg(g, x0, y0 + 1, lx, ly, K, 1);
  const drip = Math.floor((t * 4) % 5);
  px(g, lx - 1, ly + 2 + drip, C.acid);
  px(gl, lx - 1, ly + 2 + drip, C.acid);
  // Los ojos van sobre la mandíbula de arriba: se levantan al abrir.
  for (const k of [0.25, 0.5]) {
    const [ex, ey] = dir(-a, L * k);
    const oy = ey - 5;
    px(g, ex - 2, oy - 1, K, 6, 5);
    px(g, ex - 1, oy, C.eye, 4, 3);
    px(g, ex + 1, oy, K, 1, 3);                                  // pupila de rendija (mirando al frente)
    px(gl, ex, oy + 1, C.eye, 2, 1);
  }
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
    // Respira hinchando todo el cuerpo; agazapado jadea deprisa; aturdido boquea.
    const seed = (e.seed ?? (e.seed = Math.random() * 10));
    const breathRate = crouch ? 9 : squash ? 5 : 2.2;
    const breath = Math.sin((t + seed) * breathRate);
    const swell = (breath + 1) / 2;                                  // 0 vacío · 1 lleno
    // Croar: cada ~3,6 s el saco bucal se infla como un globo y la boca se entreabre.
    const cp = ((t + seed) % 3.6) / 3.6;
    const croak = st === 'sit' && cp < 0.28 ? Math.sin((cp / 0.28) * Math.PI) : 0;
    // Parpadeo de vez en cuando.
    const blink = ((t * 0.27 + seed) % 1) < 0.035;
    const bodyY = GROUND - 15 + crouch * 4 + squash * 5 - (air ? 4 : 0) - (air ? 0 : swell * 0.8);
    const bx = W / 2 - 4 + shake;
    const rx = 21 + squash * 3 - (air ? 1 : 0) + (air ? 0 : swell * 0.8);
    const ry = 11 - squash * 3 + (air ? 1 : 0) + (air ? 0 : swell * 1.2);

    // ---- Patas traseras: muslos gruesos en Z, o estiradas al saltar; dedos con garras.
    for (const far of [true, false]) {
      const hx = bx - 12 + (far ? 2 : 0), hy = bodyY + 3;
      let fx, fy;
      if (air) { fx = hx - 22; fy = hy + 12; }
      else { fx = hx - 4 + (far ? 2 : 0) - crouch * 2; fy = GROUND; }
      const [kx, ky] = air ? [hx - 11, hy + 3] : ik(hx, hy, fx, fy, 9, 9, 1);
      const col = far ? C.skinD : C.skin;
      limb(g, hx, hy, kx, ky, 7, col, far ? null : C.skinL);      // muslo
      if (!far) { px(g, (hx + kx) / 2, (hy + ky) / 2 - 1, C.spot, 2, 1); px(g, kx + 1, ky - 2, C.wart); }
      limb(g, kx, ky, fx, fy - 1, 4, col, far ? null : C.skinL);  // espinilla
      // Pie palmeado con tres garras de hueso.
      seg(g, fx - 6, fy, fx + 3, fy, K, 3);
      seg(g, fx - 5, fy, fx + 2, fy, far ? C.skinD : C.wart, 1);
      for (const dx of [-6, -3, 0]) { px(g, fx + dx - 1, fy, K, 2, 1); px(g, fx + dx - 1, fy, C.claw); }
    }

    // ---- Cuerpo: un saco ceniciento y moteado con la panza pálida.
    part(g, bx, bodyY, rx, ry, C.skin, C.skinD, C.skinL);
    for (let y = -ry + 1; y < ry; y++) for (let x = -rx + 1; x < rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 0.75) continue;
      if (hash(x + 40, y + 20) > 0.84) px(g, bx + x, bodyY + y, C.spot);      // moteado
    }
    blob(g, bx + 3, bodyY + ry - 4, rx - 6, 4, C.belly, C.bellyD);
    for (const [dx, dy] of [[-6, 0], [0, 1], [6, 0], [-2, -1]]) px(g, bx + 3 + dx, bodyY + ry - 4 + dy, C.bellyD); // pliegues
    // Cicatriz cosida a lo largo del costado.
    for (let i = 0; i < 16; i++) {
      const x = bx - 14 + i, y = bodyY + 1 + Math.round(Math.sin(i * 0.5));
      px(g, x, y, C.scar);
      if (i % 3 === 0) { px(g, x, y - 1, C.stitch); px(g, x, y + 1, C.stitch); }
    }
    // Verrugas con volumen: grandes y pequeñas.
    for (const [dx, dy, r] of [[-15, -3, 1.6], [-9, 4, 1.2], [7, -6, 1.4], [13, 2, 1.8], [-2, 6, 1], [17, -3, 1.1], [-19, 3, 1.3], [3, -1, 1], [10, 6, 1.1]]) {
      blob(g, bx + dx, bodyY + dy, r, r, C.wart, C.skinD);
      px(g, bx + dx - 1, bodyY + dy - 1, C.wartL);
    }

    // ---- Celdas de la espalda (dos filas), con bordes de carne inflamada; las crías
    // asoman y se retuercen, más cuanto más cerca están de salir (brood).
    const brood = st === 'brood' ? 1 - Math.max(0, e.timer ?? 0) / 0.9 : 0;
    const ready = Math.max(0, 1 - Math.max(0, e.broodCool ?? 9) / 4);
    const cells = [[-13, 0], [-7, -1], [-1, 0], [5, -1], [11, 0], [-10, 3], [-4, 3], [2, 3], [8, 3]];
    cells.forEach(([dx, dy], i) => {
      const cx = bx + dx, cy = bodyY - ry + 2 + dy + Math.round(squash);
      const r = (i < 5 ? 2.2 : 1.6) + ready * 0.8 + brood * 1.4;
      blob(g, cx, cy, r + 1, r * 0.8 + 0.8, C.cellRimD);
      blob(g, cx, cy, r + 0.4, r * 0.8 + 0.3, C.cellRim);
      blob(g, cx, cy, r, r * 0.65, C.cell);
      if (i < 5 && (ready > 0.3 || brood)) {
        const out = 2 + Math.round((ready + brood * 2) * 2);
        const wig = Math.round(Math.sin(t * 12 + i * 1.7));
        seg(g, cx, cy, cx + wig, cy - out, K, 3);
        seg(g, cx, cy, cx + wig, cy - out, C.leech, 2);
        px(g, cx + wig - 1, cy - out - 1, C.leechL, 2, 1); // ventosa
      }
    });
    // Cresta de bultos a lo largo del espinazo.
    for (let i = 0; i < 6; i++) { const x = bx - 16 + i * 6; px(g, x, bodyY - ry - 1 + (i % 2), K, 2, 1); px(g, x, bodyY - ry + (i % 2), C.skinL); }

    // ---- Patas delanteras: cortas y nudosas, con garras (abiertas al caer).
    for (const far of [true, false]) {
      const sx = bx + 12 + (far ? -3 : 0), sy = bodyY + 5;
      const hx = sx + (squash ? 7 : 3) + (air ? 6 : 0), hy = air ? sy + 6 : GROUND;
      limb(g, sx, sy, hx, hy - 1, 3, far ? C.skinD : C.skin);
      seg(g, hx - 1, hy, hx + 3, hy, K, 2);
      px(g, hx + 3, hy, C.claw);
    }

    // ---- Saco bucal bajo la mandíbula: se hincha al respirar (y del todo al criar).
    // Bocado: la cabeza se echa atrás (biteWind) y sale disparada sobre un cuello de carne.
    const windup = st === 'biteWind' ? 1 : 0;
    const bite = st === 'bite' ? (e.biteK ?? 0) : 0;
    const hx = bx + rx - 2 - windup * 3 + bite * 18, hy = bodyY - 2 + crouch - bite * 2;
    if (bite > 0.05) {
      // El cuello estirado: carne tensa con estrías y algún vaso.
      const nx = bx + rx - 5, ny = bodyY - 1;
      limb(g, nx, ny, hx - 5, hy + 2, 8, C.skin, C.skinL);
      for (let i = 1; i < 4; i++) { const k = i / 4; px(g, nx + (hx - 5 - nx) * k, ny + (hy + 2 - ny) * k - 2, C.skinD, 1, 4); }
      px(g, (nx + hx) / 2, (ny + hy) / 2 + 2, C.vein, 3, 1);
    }
    const sacR = 2.6 + swell * 1.2 + croak * 4.5 + (st === 'brood' ? 2 : 0) + (crouch ? swell : 0);
    blob(g, hx + 1, hy + 6, sacR + 1, sacR * 0.7 + 1, K);
    blob(g, hx + 1, hy + 6, sacR, sacR * 0.7, C.sac, C.sacD);
    px(g, hx, hy + 5, '#e8ccc8');

    // ---- Cabeza ancha con boca de oreja a oreja y dientes.
    // Cabeza normal; en pleno bocado se convierte en unas fauces abiertas en cepo (drawMaw).
    if (bite < 0.3) {
      part(g, hx, hy, 9 + bite * 3, 6.5 - squash + bite * 2, C.skin, C.skinD, C.skinL);
      for (const [dx, dy] of [[-3, -3], [3, -2], [6, 1], [-5, 1]]) px(g, hx + dx, hy + dy, C.spot);
      const want = bite ? 4 + bite * 9 : windup ? 2 + (Math.sin(t * 50) > 0 ? 1 : 0)
        : st === 'leap' ? 4 : st === 'brood' ? 4 : st === 'crouch' ? 1.5 + swell : squash ? 1 + swell * 1.5 : croak * 2.5;
      e.jaw = (e.jaw ?? 0) + (want - (e.jaw ?? 0)) * (bite ? 0.7 : 0.35);  // suaviza entre fotogramas (el bocado, rápido)
      const open = Math.round(e.jaw);
      if (open > 0) {
        // Las fauces: más anchas cuanto más se abren (en el bocado, enormes).
        const mw = Math.round(bite * 3);
        for (let y = 0; y <= open; y++) seg(g, hx - 6 - mw, hy + 2 + y, hx + 7 + mw, hy + 2 + y, y === open ? K : C.mouth, 1);
        if (open > 5) blob(g, hx + 1, hy + 2 + open / 2, 3 + mw, open / 3, '#2a0408');  // la garganta, al fondo
        seg(g, hx - 3, hy + 1 + open, hx + 3, hy + 1 + open, '#a03a48', 1);   // lengua
        for (let x = hx - 5 - mw; x <= hx + 7 + mw; x += 2) {
          px(g, x, hy + 2, C.tooth); px(g, x + 1, hy + 1 + open, C.tooth);
          if (open > 5) { px(g, x, hy + 3, C.tooth); px(g, x + 1, hy + open, C.tooth); } // colmillos largos
        }
        seg(g, hx - 7 - mw, hy + 2, hx - 7 - mw, hy + 2 + open, K, 1);    // comisura
        if (open > 4) limb(g, hx - 6 - mw, hy + 3 + open, hx + 8 + mw, hy + 2 + open, 2, C.skin, C.skinL); // mandíbula de abajo
      } else {
        seg(g, hx - 7, hy + 2, hx + 8, hy + 1, K, 1);
        for (let x = hx - 4; x <= hx + 6; x += 3) px(g, x, hy + 3, C.tooth); // colmillos que asoman
      }
      // Babea ácido.
      const drip = Math.floor((t * 3) % 4);
      px(g, hx + 7, hy + 3 + drip, C.acid);
      px(gl, hx + 7, hy + 3 + drip, C.acid);
  
      // ---- Ojos: dos saltones inyectados en sangre que te siguen, y uno pequeño y deforme.
      const p = game.player;
      const a = Math.atan2(p.cy - e.cy, (p.cx - e.cx) * (e.dir < 0 ? -1 : 1));
      for (const [ex, ey, big] of [[hx - 3, hy - 7, true], [hx + 3, hy - 7, true], [hx - 7, hy - 3, false]]) {
        if (big) {
          // Ojo saltón: párpado oscuro, globo amarillo, pupila de rendija y una vena.
          px(g, ex - 1, ey - 2, K, 4, 1); px(g, ex - 2, ey - 1, K, 6, 4); px(g, ex - 1, ey + 3, K, 4, 1);
          px(g, ex - 1, ey - 1, C.eye, 4, 3);
          px(g, ex - 1, ey + 1, '#a89a30', 4, 1);                            // sombra baja del globo
          px(g, ex - 1, ey + 1, C.vein);                                     // vena
          const ix = ex + Math.round(Math.cos(a) * 0.8), iy = ey - 1 + Math.round(Math.sin(a) * 0.6);
          px(g, ix, iy, K, 1, 3);                                            // pupila de rendija
          if (blink || squash) px(g, ex - 1, ey - 1, C.skinD, 4, blink ? 3 : 1); // párpado
          px(gl, ex, ey, C.eye, 2, 1);
        } else {
          // El tercer ojo: pequeño, lechoso, torcido.
          px(g, ex - 1, ey - 1, K, 3, 3); px(g, ex, ey, '#c8c0a0'); px(gl, ex, ey, '#c8c0a0');
        }
      }
    } else drawMaw(g, gl, hx - 6, hy, bite, t);
    // Aturdido: estrellitas de bilis sobre la cabeza.
    if (squash) for (let i = 0; i < 3; i++) {
      const s = t * 6 + i * 2.1;
      px(g, hx + Math.cos(s) * 6, hy - 10 + Math.sin(s) * 2, C.acid);
      px(gl, hx + Math.cos(s) * 6, hy - 10 + Math.sin(s) * 2, C.acid);
    }
  },
};
