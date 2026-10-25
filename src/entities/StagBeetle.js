// CIERVO ACORAZADO (Sistema Digestivo): un centauro escarabajo. Detrás, un abdomen
// cubierto de élitros sobre cuatro patas articuladas; delante, un tórax erguido de
// placas de quitina con dos brazos de garfio y una cabeza con mandíbulas de ciervo
// volante, aserradas y ramificadas. Lento, pesado, casi todo coraza.
// Poses (las marca el comportamiento `centaur` en entities/Enemy.js):
//   walk      paso lento y pesado, el tórax se mece
//   rear      se encabrita sobre las patas traseras y abre las mandíbulas
//   gore      embiste inclinado hacia delante
//   dazed     tras embestir: se queda jadeando con los élitros abiertos (carne al aire)
//   pinchWind / pinch   abre las mandíbulas y las cierra de golpe delante de ti
// Sin coraza (arrancada con el Tendón) se ve la carne roja bajo las placas.
import { px, seg, limb, part, jointLeg, OUTLINE } from './Rig.js';

const ARMOR = { dark: '#5e5868', mid: '#9a94a4', light: '#c8c2cc', shine: '#eeeaf0', bronze: '#8a7656', bronzeLight: '#d4c098', joint: '#6a3a44' }; // quitina pálida
const FLESH = { dark: '#4a1420', mid: '#8a3040', light: '#c05060', shine: '#f09090', bronze: '#6a2a30', bronzeLight: '#a04a50', joint: '#e07080' };

// Tamaño: se dibuja con las medidas de siempre (56 x 52) y se encoge K al pintar cada
// píxel (sin bajar nunca de uno): sale más pequeño sin perder la nitidez.
const K = 0.6, W0 = 56, H0 = 52, W = Math.round(W0 * K), H = Math.round(H0 * K);
const shrink = (c) => ({
  set fillStyle(v) { c.fillStyle = v; },
  get fillStyle() { return c.fillStyle; },
  set globalAlpha(v) { c.globalAlpha = v; },
  fillRect(x, y, w, h) { c.fillRect(Math.round(x * K), Math.round(y * K), Math.max(1, Math.round(w * K)), Math.max(1, Math.round(h * K))); },
});

export const STAG = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2, e.y + e.h - H],
  draw(g0, gl0, e, t) {
    const g = shrink(g0), gl = shrink(gl0);
    const C = e.armored ? ARMOR : FLESH;
    const st = e.state ?? 'walk';
    const tm = Math.max(0, e.timer ?? 0);
    const rear = st === 'rear' ? Math.min(1, (0.8 - tm) / 0.35) : 0;
    const lean = st === 'gore' ? 1 : st === 'pinch' ? 0.5 : 0;
    const dazed = st === 'dazed';
    const pinch = st === 'pinchWind' ? 1 - tm / 0.35 : st === 'pinch' ? -1 : 0;
    const moving = Math.abs(e.vx) > 2;
    e.walkPh = (e.walkPh ?? 0) + Math.abs(e.vx) * 0.012 + (moving ? 0 : 0.002);
    const ph = e.walkPh * Math.PI * 2;
    const G = 51; // suelo
    const bob = moving ? Math.abs(Math.sin(ph)) * 1 : Math.sin(t * 1.5) * 0.5;

    // --- Abdomen: centro, inclinado si se encabrita.
    const ax = 17, ay = 34 - rear * 3 - bob + (dazed ? 2 : 0);
    // --- Patas (las lejanas primero, más oscuras). Caderas bajo el abdomen y el tórax.
    const legs = [
      { hx: 11, hy: ay + 4, off: 0, far: true }, { hx: 27, hy: ay + 3 - rear * 4, off: Math.PI, far: true, front: true },
      { hx: 14, hy: ay + 5, off: Math.PI, far: false }, { hx: 30, hy: ay + 4 - rear * 5, off: 0, far: false, front: true },
    ];
    for (const L of legs) {
      const stride = moving ? Math.sin(ph + L.off) * 4 : 0;
      const lift = moving ? Math.max(0, Math.cos(ph + L.off)) * 2 : 0;
      let fx = L.hx + (L.front ? 4 : -4) + stride, fy = G - lift;
      if (L.front && rear > 0) { fx = L.hx + 7; fy = G - 10 * rear - Math.sin(t * 20) * rear; } // patea al aire
      if (L.front && lean > 0) fx += 4;
      jointLeg(g, L.hx, L.hy, fx, fy, 9, 10, 1, L.far ? 2 : 3, L.far ? C.dark : C.mid, L.far ? OUTLINE : C.dark, L.far ? null : C.light);
      px(g, fx - 1, fy, L.far ? C.dark : C.bronze, 3, 1); // tarso
    }

    // --- Abdomen con élitros. Aturdido, los élitros se abren y se ve la carne.
    if (dazed || !e.armored) {
      for (let i = 0; i < 5; i++) part(g, ax - 8 + i * 4, ay + 1, 2.6, 4, '#a8424e', '#5a1a24', '#e07080');
      px(gl, ax - 4, ay, '#ff6070');
    }
    if (dazed) {
      const flap = Math.sin(t * 18) * 1.5;
      for (const s of [-1, 1]) {
        // élitro levantado, temblando
        const tipX = ax - 12, tipY = ay - 12 - (s > 0 ? 4 : 0) + flap;
        for (let k = 0; k < 4; k++) limb(g, ax + 6 - k, ay - 1 - k, tipX + k, tipY + k * 2, 2, s > 0 ? C.mid : C.dark, C.light);
      }
    } else {
      part(g, ax, ay - 1, 13, 7, C.mid, C.dark, C.light);
      seg(g, ax - 12, ay - 1, ax + 10, ay - 2, C.dark); // sutura de los élitros
      for (let i = 0; i < 4; i++) px(g, ax - 9 + i * 5, ay - 5 + (i % 2), C.shine, 2, 1); // brillo
      px(g, ax - 12, ay + 3, C.bronze, 4, 1);
    }

    // --- Tórax erguido: tres placas apiladas que se inclinan según la pose.
    const tilt = -0.12 - rear * 0.5 + lean * 0.7 + (dazed ? 0.25 : 0) + (moving ? Math.sin(ph * 2) * 0.04 : Math.sin(t * 1.2) * 0.03);
    const bx = 29, by = ay - 2;
    const P = (d) => [bx + Math.sin(tilt) * d, by - Math.cos(tilt) * d];
    const [s1x, s1y] = P(6), [s2x, s2y] = P(12), [s3x, s3y] = P(18);
    part(g, s1x, s1y, 6, 4.5, C.mid, C.dark, C.light);
    px(g, s1x - 5, s1y + 3, C.joint, 10, 1);
    part(g, s2x, s2y, 5, 4, C.mid, C.dark, C.light);
    px(g, s2x - 2, s2y - 2, C.shine, 3, 1);
    px(g, s2x - 3, s2y + 2, C.joint, 6, 1);

    // --- Brazos de garfio (el lejano detrás del tórax superior).
    const arm = (far) => {
      const sx = s3x + (far ? -2 : 1), sy = s3y + 2;
      const reach = lean * 6 + (pinch > 0 ? pinch * 3 : 0);
      const swing = moving ? Math.sin(ph + (far ? 0 : Math.PI)) * 2 : Math.sin(t * 1.3 + (far ? 1 : 0));
      const hx = sx + 5 + reach + swing, hy = sy + 8 - reach * 0.6 - rear * 6;
      jointLeg(g, sx, sy, hx, hy, 5, 6, 1, far ? 1 : 2, far ? C.dark : C.mid, far ? OUTLINE : C.dark);
      seg(g, hx, hy, hx + 2, hy - 2, far ? C.dark : C.bronzeLight); // garfio
      seg(g, hx + 2, hy - 2, hx + 1, hy - 3, far ? C.dark : C.bronzeLight);
    };
    arm(true);
    part(g, s3x, s3y, 5.5, 4, C.mid, C.dark, C.light);
    px(g, s3x - 2, s3y - 2, C.shine, 2, 1);
    arm(false);

    // --- Cabeza con mandíbulas de ciervo volante.
    const hx = s3x + Math.sin(tilt) * 5 + 3, hy = s3y - Math.cos(tilt) * 5 - (dazed ? -2 : 0);
    const open = st === 'rear' ? 0.5 + rear * 0.5 : st === 'pinchWind' ? 0.4 + pinch * 0.6 : st === 'pinch' ? 0 : st === 'gore' ? 0.15 : 0.22 + Math.sin(t * 2.4) * 0.06;
    const aim = tilt * 0.6 - (st === 'rear' ? 0.25 : 0) + (dazed ? 0.5 : 0);
    for (const s of [-1, 1]) {
      // Cada mandíbula: una curva que sale hacia delante y se cierra en la punta, con
      // una rama a media longitud (como un asta) y dientes de sierra por dentro.
      const pts = [];
      let x = hx + 3, y = hy + s * 1.5, a = aim + s * (0.3 + open * 0.75);
      pts.push([x, y]);
      for (let k = 0; k < 9; k++) {
        x += Math.cos(a) * 2.2; y += Math.sin(a) * 2.2;
        pts.push([x, y]);
        a -= s * (0.1 + open * 0.07);
      }
      const [tx, ty] = pts[5], ta = aim + s * (0.3 + open * 0.75) - s * 0.9;
      const tine = [tx + Math.cos(ta - s * 0.9) * 4, ty + Math.sin(ta - s * 0.9) * 4 - 1];
      for (const pass of [0, 1]) {
        for (let k = 0; k < pts.length - 1; k++) {
          const w = k < 4 ? 2 : 1;
          seg(g, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], pass ? (k < 5 ? C.bronze : C.bronzeLight) : OUTLINE, pass ? w : w + 2);
        }
        seg(g, tx, ty, tine[0], tine[1], pass ? C.bronzeLight : OUTLINE, pass ? 1 : 3);
      }
      for (let k = 2; k < pts.length - 1; k += 2) px(g, pts[k][0], pts[k][1] - s, '#ecdcb4'); // dientes
      px(g, pts[pts.length - 1][0], pts[pts.length - 1][1], '#f6e8c8');
    }
    part(g, hx, hy, 4.5, 3.6, C.mid, C.dark, C.light);
    px(g, hx - 3, hy - 3, C.bronze, 4, 1); // cresta
    // Ojos compuestos de ámbar.
    px(g, hx + 1, hy - 1, '#ffb030', 2, 1);
    px(gl, hx + 1, hy - 1, dazed ? '#ffe0a0' : '#ff8a20', 2, 1);

    // Carga de la embestida: polvo de mucosa seca bajo las patas.
    if (st === 'gore' && Math.sin(t * 40) > 0) px(gl, 32 + Math.random() * 8, G - 1, '#ffd25a');

    // Fijado y punto vulnerable: la carne del abdomen cuando abre los élitros.
    e.spotsLocal = [{ x: ax * K, y: ay * K, r: 8 * K, weak: dazed || !e.armored }, { x: hx * K, y: hy * K, r: 5 * K, weak: false }];
  },
};
