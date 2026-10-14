import { px, seg, limb, blob, part, ik, OUTLINE as K } from './Rig.js';

// SAPO PARTERO (jefe de la charca, Enemy.bossToad): un sapo enorme, verrugoso y
// pálido de panza, que carga a sus crías en celdas hundidas en la espalda. Patas
// traseras enormes, plegadas en Z, que se estiran del todo al saltar; ojos saltones
// que te siguen. Se dibuja mirando a la derecha.
//
// Poses según e.state: sit (respira, se arrastra) · crouch (se agazapa y tiembla) ·
// leap (estirado en el aire) · land (aplastado, con la panza al aire: aturdido) ·
// brood (las celdas se hinchan y asoman las sanguijuelas antes de reventar).

const W = 76, H = 52, GROUND = H - 1;
const C = {
  skin: '#5a7a2a', skinD: '#3a5018', skinL: '#8aa848', wart: '#9ab84a',
  belly: '#c8c070', bellyD: '#9a9248', cell: '#2a1a18', cellRim: '#6a8a3a',
  leech: '#5a2a38', leechL: '#c05a6a', eye: '#e8d84a', acid: '#9be06a',
};

export const TOAD = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2, e.y + e.h - H],
  draw(g, gl, e, t, game) {
    const st = e.state ?? 'sit';
    const air = st === 'leap';
    // Agazapado: baja y tiembla; aterrizado: aplastado; en el aire: estirado.
    const crouch = st === 'crouch' ? 1 : 0;
    const squash = st === 'land' ? 1 : 0;
    const shake = crouch ? Math.round(Math.sin(t * 60)) : 0;
    const breath = Math.sin(t * 2.4);
    const bodyY = GROUND - 15 + crouch * 4 + squash * 5 - (air ? 4 : 0) + (st === 'sit' ? breath * 0.6 : 0);
    const bx = 34 + shake, rx = 21 + squash * 3 - (air ? 1 : 0), ry = 11 - squash * 3 + (air ? 1 : 0);

    // ---- Pata trasera (lejos, detrás) y pata trasera cercana: en Z, o estiradas al saltar.
    for (const far of [true, false]) {
      const hx = bx - 12 + (far ? 2 : 0), hy = bodyY + 3;
      let fx, fy;
      if (air) { fx = hx - 22; fy = hy + 12; }                       // estirada hacia atrás
      else { fx = hx - 4 + (far ? 2 : 0) - crouch * 2; fy = GROUND; }  // plegada
      const [kx, ky] = air ? [hx - 11, hy + 3] : ik(hx, hy, fx, fy, 9, 9, 1);
      const col = far ? C.skinD : C.skin;
      limb(g, hx, hy, kx, ky, 6, col, far ? null : C.skinL);       // muslo
      limb(g, kx, ky, fx, fy - 1, 4, col, far ? null : C.skinL);   // espinilla
      seg(g, fx - 5, fy, fx + 3, fy, K, 3);                         // pie palmeado
      seg(g, fx - 4, fy, fx + 2, fy, far ? C.skinD : C.wart, 1);
    }

    // ---- Cuerpo: un saco verrugoso con la panza pálida.
    part(g, bx, bodyY, rx, ry, C.skin, C.skinD, C.skinL);
    blob(g, bx + 3, bodyY + ry - 4, rx - 6, 4, C.belly, C.bellyD);
    // Verrugas (fijas, para que no parpadeen).
    for (const [dx, dy] of [[-14, -2], [-8, 4], [6, -6], [12, 2], [-2, 6], [16, -3], [-18, 3]]) {
      px(g, bx + dx, bodyY + dy, C.wart);
      px(g, bx + dx + 1, bodyY + dy + 1, C.skinD);
    }

    // ---- Celdas de la espalda con sus crías: se hinchan antes de reventar (brood).
    const brood = st === 'brood' ? 1 - Math.max(0, e.timer ?? 0) / 0.9 : 0;
    const ready = Math.max(0, 1 - Math.max(0, e.broodCool ?? 9) / 4); // se van llenando
    for (let i = 0; i < 5; i++) {
      const cx = bx - 12 + i * 6, cy = bodyY - ry + 2 + (i % 2) + Math.round(squash);
      const r = 2.2 + ready * 0.8 + brood * 1.4;
      blob(g, cx, cy, r + 0.8, r * 0.8 + 0.6, C.cellRim);
      blob(g, cx, cy, r, r * 0.7, C.cell);
      // La cría asoma y se retuerce: más cuanto más cerca de salir.
      if (ready > 0.3 || brood) {
        const out = 2 + Math.round((ready + brood * 2) * 2);
        const wig = Math.round(Math.sin(t * 12 + i * 1.7));
        seg(g, cx, cy, cx + wig, cy - out, K, 3);
        seg(g, cx, cy, cx + wig, cy - out, C.leech, 2);
        px(g, cx + wig - 1, cy - out - 1, C.leechL, 2, 1); // boquita de ventosa
        px(g, cx + wig, cy - out, C.leechL);
      }
    }

    // ---- Patas delanteras: cortas, apoyadas (abiertas al caer).
    for (const far of [true, false]) {
      const sx = bx + 12 + (far ? -3 : 0), sy = bodyY + 5;
      const hx = sx + (squash ? 7 : 3) + (air ? 6 : 0), hy = air ? sy + 6 : GROUND;
      limb(g, sx, sy, hx, hy - 1, 3, far ? C.skinD : C.skin);
      seg(g, hx - 1, hy, hx + 3, hy, K, 2);
    }

    // ---- Cabeza: ancha, con la boca de oreja a oreja y los ojos saltones arriba.
    const hx = bx + rx - 2, hy = bodyY - 2 + crouch;
    part(g, hx, hy, 9, 6.5 - squash, C.skin, C.skinD, C.skinL);
    const open = st === 'leap' || st === 'brood' ? 2 : 0;          // abre la boca al saltar y al criar
    seg(g, hx - 6, hy + 2, hx + 8, hy + 1, K, 1 + open);
    if (open) seg(g, hx - 4, hy + 2, hx + 6, hy + 2, '#6a1a24', 1);
    // Babea ácido.
    const drip = Math.floor((t * 3) % 4);
    px(g, hx + 6, hy + 3 + drip, C.acid);
    px(gl, hx + 6, hy + 3 + drip, C.acid);
    // Ojos saltones que te siguen.
    const p = game.player;
    for (const [ex, ey] of [[hx - 2, hy - 6], [hx + 4, hy - 6]]) {
      blob(g, ex, ey, 2.6, 2.4, K);
      blob(g, ex, ey, 1.8, 1.6, C.eye);
      const a = Math.atan2(p.cy - e.cy, (p.cx - e.cx) * (e.dir < 0 ? -1 : 1));
      const ix = Math.round(ex + Math.cos(a)), iy = Math.round(ey + Math.sin(a));
      px(g, ix, iy, K, 1, 2);                                        // pupila de rendija
      px(gl, ex, ey, C.eye);
    }
    // Aturdido: estrellitas de bilis sobre la cabeza.
    if (squash) for (let i = 0; i < 3; i++) {
      const a = t * 6 + i * 2.1;
      px(g, hx + Math.cos(a) * 6, hy - 10 + Math.sin(a) * 2, C.acid);
      px(gl, hx + Math.cos(a) * 6, hy - 10 + Math.sin(a) * 2, C.acid);
    }
  },
};
