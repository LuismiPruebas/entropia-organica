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

const W = 76, H = 52, GROUND = H - 1;
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

export const TOAD = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2, e.y + e.h - H],
  draw(g, gl, e, t, game) {
    const st = e.state ?? 'sit';
    const air = st === 'leap';
    const crouch = st === 'crouch' ? 1 : 0;
    const squash = st === 'land' ? 1 : 0;
    const shake = crouch ? Math.round(Math.sin(t * 60)) : 0;
    const breath = Math.sin(t * 2.4);
    const bodyY = GROUND - 15 + crouch * 4 + squash * 5 - (air ? 4 : 0) + (st === 'sit' ? breath * 0.6 : 0);
    const bx = 34 + shake, rx = 21 + squash * 3 - (air ? 1 : 0), ry = 11 - squash * 3 + (air ? 1 : 0);

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
    const hx = bx + rx - 2, hy = bodyY - 2 + crouch;
    const sacR = 3 + (breath + 1) * 0.8 + (st === 'brood' ? 2 : 0);
    blob(g, hx + 1, hy + 6, sacR + 1, sacR * 0.7 + 1, K);
    blob(g, hx + 1, hy + 6, sacR, sacR * 0.7, C.sac, C.sacD);
    px(g, hx, hy + 5, '#e8ccc8');

    // ---- Cabeza ancha con boca de oreja a oreja y dientes.
    part(g, hx, hy, 9, 6.5 - squash, C.skin, C.skinD, C.skinL);
    for (const [dx, dy] of [[-3, -3], [3, -2], [6, 1], [-5, 1]]) px(g, hx + dx, hy + dy, C.spot);
    const open = st === 'leap' || st === 'brood' ? 3 : st === 'crouch' ? 1 : 0;
    seg(g, hx - 7, hy + 2, hx + 8, hy + 1, K, 1 + open);
    if (open) {
      seg(g, hx - 5, hy + 2, hx + 7, hy + 2, C.mouth, Math.max(1, open - 1));
      for (let x = hx - 5; x <= hx + 7; x += 2) { px(g, x, hy + 1, C.tooth); px(g, x + 1, hy + 2 + open - 1, C.tooth); } // dientes arriba y abajo
    } else for (let x = hx - 4; x <= hx + 6; x += 3) px(g, x, hy + 3, C.tooth);    // colmillos que asoman
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
        px(gl, ex, ey, C.eye, 2, 1);
      } else {
        // El tercer ojo: pequeño, lechoso, torcido.
        px(g, ex - 1, ey - 1, K, 3, 3); px(g, ex, ey, '#c8c0a0'); px(gl, ex, ey, '#c8c0a0');
      }
    }
    // Aturdido: estrellitas de bilis sobre la cabeza.
    if (squash) for (let i = 0; i < 3; i++) {
      const s = t * 6 + i * 2.1;
      px(g, hx + Math.cos(s) * 6, hy - 10 + Math.sin(s) * 2, C.acid);
      px(gl, hx + Math.cos(s) * 6, hy - 10 + Math.sin(s) * 2, C.acid);
    }
  },
};
