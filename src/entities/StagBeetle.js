// CIERVO ACORAZADO: un centauro escarabajo pequeño, rápido y molesto. Detrás, un abdomen
// cubierto de élitros sobre cuatro patas finas; delante, un tórax erguido de placas de
// quitina pálida con dos garfios y una cabeza con mandíbulas de ciervo volante,
// ramificadas como astas. Dibujado a su tamaño (sin escalar), para que cada placa
// conserve su volumen: contorno, sombra, tono medio, luz y brillo.
// Poses (las marca el comportamiento `centaur` en entities/Enemy.js):
//   walk      paso rápido, el tórax se mece
//   rear      se encabrita sobre las patas traseras y abre las mandíbulas
//   gore      embiste inclinado hacia delante
//   dazed     tras embestir: se queda jadeando con los élitros abiertos (carne al aire)
//   pinchWind / pinch   abre las mandíbulas y las cierra de golpe delante de ti
// Sin coraza (arrancada con el Tendón) se ve la carne roja bajo las placas.
import { px, seg, OUTLINE } from './Rig.js';

const ARMOR = { dark: '#5e5868', mid: '#9a94a4', light: '#c8c2cc', shine: '#f4f0f6', ivory: '#d8c8a0', ivoryD: '#8a7656', joint: '#6a3a44' }; // quitina pálida
const FLESH = { dark: '#4a1420', mid: '#8a3040', light: '#c05060', shine: '#f09090', ivory: '#a04a50', ivoryD: '#6a2a30', joint: '#e07080' };
const W = 32, H = 24, G = 23; // lienzo y suelo

// Placa abombada: elipse con contorno y cuatro tonos según la luz (de arriba a la
// izquierda), y un punto de brillo. Así una placa de 5 px sigue leyéndose como volumen.
function plate(g, cx, cy, rx, ry, C) {
  for (let y = -Math.ceil(ry) - 1; y <= Math.ceil(ry) + 1; y++) for (let x = -Math.ceil(rx) - 1; x <= Math.ceil(rx) + 1; x++) {
    const nx = x / rx, ny = y / ry, d = nx * nx + ny * ny;
    const dOut = (x / (rx + 1)) ** 2 + (y / (ry + 1)) ** 2;
    if (d <= 1) {
      const lit = -nx * 0.45 - ny * 0.75;
      px(g, cx + x, cy + y, lit > 0.45 ? C.light : lit > -0.35 ? C.mid : C.dark);
    } else if (dOut <= 1) px(g, cx + x, cy + y, OUTLINE);
  }
  px(g, cx - Math.round(rx * 0.4), cy - Math.round(ry * 0.5), C.shine);
}

export const STAG = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2, e.y + e.h - H],
  draw(g, gl, e, t) {
    const C = e.armored ? ARMOR : FLESH;
    const st = e.state ?? 'walk';
    const tm = Math.max(0, e.timer ?? 0);
    const rear = st === 'rear' ? Math.min(1, (0.8 - tm) / 0.35) : 0;
    const lean = st === 'gore' ? 1 : st === 'pinch' ? 0.5 : 0;
    const dazed = st === 'dazed';
    const pinch = st === 'pinchWind' ? 1 - tm / 0.35 : st === 'pinch' ? -1 : 0;
    const moving = Math.abs(e.vx) > 2;
    e.walkPh = (e.walkPh ?? 0) + Math.abs(e.vx) * 0.02 + (moving ? 0 : 0.002);
    const ph = e.walkPh * Math.PI * 2;
    const bob = moving ? Math.round(Math.abs(Math.sin(ph))) : 0;

    // --- Abdomen (centro), algo hundido detrás si se encabrita.
    const ax = 10, ay = 15 - bob + (dazed ? 1 : 0) - Math.round(rear);
    // --- Patas: finas, de dos tramos (rodilla arriba), las lejanas más oscuras.
    const legs = [
      { hx: 7, off: 0, far: true }, { hx: 15, off: Math.PI, far: true, front: true },
      { hx: 9, off: Math.PI, far: false }, { hx: 17, off: 0, far: false, front: true },
    ];
    for (const L of legs) {
      const hy = ay + 2 - (L.front ? Math.round(rear * 3) : 0);
      const stride = moving ? Math.round(Math.sin(ph + L.off) * 2.5) : 0;
      const lift = moving ? Math.round(Math.max(0, Math.cos(ph + L.off)) * 1.5) : 0;
      let fx = L.hx + (L.front ? 3 : -3) + stride, fy = G - lift;
      if (L.front && rear > 0) { fx = L.hx + 4; fy = G - Math.round(6 * rear); }            // patea al aire
      if (L.front && lean > 0) fx += 2;
      const kx = (L.hx + fx) / 2 + (L.front ? 1 : -1), ky = hy - 1 + (fy - hy) * 0.35;
      const c = L.far ? C.dark : C.mid;
      seg(g, L.hx, hy, kx, ky, c); seg(g, kx, ky, fx, fy, c);
      px(g, kx, ky, L.far ? C.dark : C.light);                                              // rodilla
      px(g, fx - (L.front ? 0 : 1), fy, L.far ? C.dark : C.ivoryD, 2, 1);                   // tarso
    }

    // --- Abdomen con élitros. Aturdido, se abren y se ve la carne.
    if (dazed || !e.armored) {
      for (let i = 0; i < 4; i++) { px(g, ax - 5 + i * 3, ay - 2, OUTLINE, 3, 5); px(g, ax - 5 + i * 3, ay - 1, '#a8424e', 2, 3); px(g, ax - 5 + i * 3, ay - 1, '#e07080'); }
      px(gl, ax - 2, ay, '#ff6070');
    }
    if (dazed) {
      const flap = Math.round(Math.sin(t * 18));
      for (const s of [0, 1]) {
        const tx = ax - 7 - s, ty = ay - 7 - s * 2 + flap;
        seg(g, ax + 3, ay - 3, tx, ty, OUTLINE, 3);
        seg(g, ax + 3, ay - 3, tx, ty, s ? C.dark : C.mid, 2);
        px(g, tx + 1, ty + 1, C.light);
      }
    } else {
      plate(g, ax, ay - 1, 7, 4, C);
      seg(g, ax - 6, ay - 1, ax + 5, ay - 2, C.dark);                                        // sutura de los élitros
      px(g, ax - 3, ay - 3, C.shine); px(g, ax + 2, ay - 4, C.light, 2, 1);
    }

    // --- Tórax erguido: dos placas apiladas que se inclinan según la pose.
    const tilt = -0.15 - rear * 0.55 + lean * 0.75 + (dazed ? 0.25 : 0) + (moving ? Math.sin(ph * 2) * 0.05 : Math.sin(t * 1.2) * 0.03);
    const bx = 16, by = ay - 1;
    const P = (d) => [bx + Math.sin(tilt) * d, by - Math.cos(tilt) * d];
    const [s1x, s1y] = P(3), [s2x, s2y] = P(7);
    plate(g, s1x, s1y, 3.2, 2.4, C);
    px(g, s1x - 2, s1y + 2, C.joint, 4, 1);
    // Garfios (el lejano detrás).
    const arm = (far) => {
      const sx = s2x + (far ? -1 : 1), sy = s2y + 1;
      const reach = lean * 3 + (pinch > 0 ? pinch * 2 : 0);
      const sw = moving ? Math.round(Math.sin(ph + (far ? 0 : Math.PI))) : 0;
      const hx = sx + 3 + reach + sw, hy = sy + 4 - reach * 0.5 - rear * 3;
      seg(g, sx, sy, hx, hy, far ? C.dark : C.mid);
      px(g, hx + 1, hy - 1, far ? C.dark : C.ivory);                                         // garfio
    };
    arm(true);
    plate(g, s2x, s2y, 2.8, 2.2, C);
    arm(false);

    // --- Cabeza con mandíbulas de ciervo volante: dos astas curvas de un píxel, con una
    // rama hacia arriba y la punta clara; se abren al encabritarse y se cierran de golpe.
    const hx = s2x + Math.sin(tilt) * 3 + 2, hy = s2y - Math.cos(tilt) * 3 - (dazed ? -1 : 0);
    const open = st === 'rear' ? 0.5 + rear * 0.5 : st === 'pinchWind' ? 0.4 + pinch * 0.6 : st === 'pinch' ? 0 : st === 'gore' ? 0.15 : 0.22 + Math.sin(t * 2.4) * 0.06;
    const aim = tilt * 0.6 - (st === 'rear' ? 0.25 : 0) + (dazed ? 0.5 : 0);
    const jaws = [];
    for (const s of [-1, 1]) {
      const pts = [];
      let x = hx + 2, y = hy + s, a = aim + s * (0.35 + open * 0.8);
      pts.push([x, y]);
      for (let k = 0; k < 5; k++) { x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6; pts.push([x, y]); a -= s * (0.22 + open * 0.12); }
      const [tx, ty] = pts[2];
      jaws.push({ pts, tine: [tx, ty, tx + 0.6, ty - 2.2] });
    }
    // Contorno de las dos y luego el marfil encima (se leen aunque se crucen).
    for (const j of jaws) { for (let k = 0; k < j.pts.length - 1; k++) seg(g, j.pts[k][0], j.pts[k][1], j.pts[k + 1][0], j.pts[k + 1][1], OUTLINE, 2); seg(g, j.tine[0], j.tine[1], j.tine[2], j.tine[3], OUTLINE, 2); }
    for (const j of jaws) {
      for (let k = 0; k < j.pts.length - 1; k++) seg(g, j.pts[k][0], j.pts[k][1], j.pts[k + 1][0], j.pts[k + 1][1], k < 2 ? C.ivoryD : C.ivory);
      seg(g, j.tine[0], j.tine[1], j.tine[2], j.tine[3], C.ivory);
      const [ex, ey] = j.pts[j.pts.length - 1];
      px(g, ex, ey, C.shine);                                                                // punta
    }
    plate(g, hx, hy, 2.4, 2, C);
    px(g, hx - 2, hy - 2, C.ivoryD, 2, 1);                                                   // cresta
    // Ojo compuesto de ámbar.
    px(g, hx + 1, hy - 1, '#ffb030');
    px(gl, hx + 1, hy - 1, dazed ? '#ffe0a0' : '#ff8a20');

    // Carga de la embestida: polvo bajo las patas.
    if (st === 'gore' && Math.sin(t * 40) > 0) px(gl, 18 + Math.random() * 6, G - 1, '#ffd25a');

    // Fijado y punto vulnerable: la carne del abdomen cuando abre los élitros.
    e.spotsLocal = [{ x: ax, y: ay, r: 5, weak: dazed || !e.armored }, { x: hx, y: hy, r: 3, weak: false }];
  },
};
