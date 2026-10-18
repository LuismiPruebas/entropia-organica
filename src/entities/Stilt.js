// ZANCUDO ALVEOLAR (Cavidad Pulmonar): cuatro patas larguísimas y finas, un torso pequeño
// y nervudo con un esfínter en el pecho, y por cabeza un racimo de alvéolos (sacos
// rojizos, algunos abiertos como copas). Hincha la cabeza muchísimo (los sacos crecen, se
// tensan, se ponen al rojo y se les marcan las venas) y la vacía de golpe: el aire sale por
// el esfínter del torso y escupe un abanico de espinas. Hinchada a medias le sirve también
// para levitar un poco sobre el suelo, con las patas colgando, y amenazarte.
//
// Volumen por claroscuro (luz desde arriba a la izquierda). Se dibuja de perfil mirando a
// la derecha, con los pies en el borde inferior del lienzo. Lo mueve `inflater`
// (entities/Enemy.js):
//   e.state  'walk' | 'inflate' | 'recoil' | 'float' | 'descend'
//   e.k      hinchado de la cabeza (0 normal, 1 al máximo; negativo = vaciada de golpe)
//   e.walkPh fase del paso   e.flash  0..1 fogonazo del esfínter al disparar
const W = 60, H = 74;
const P = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
const hash = (i, k = 0) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

const LEG = ['#0e080e', '#24142a', '#3a2440', '#52345a', '#6e4a74', '#9a74a0'];
const TORSO = ['#0e080e', '#1e1024', '#341c3a', '#4c2c54', '#6a4272', '#8e6496'];
const ALV = ['#1a0608', '#5a1820', '#8a2a32', '#b04048', '#d8707a', '#f6c0c0'];   // saco en reposo
const HOT = ['#2a0804', '#8a1a0c', '#c8381a', '#ee6a2a', '#ffa050', '#fff0b0'];   // hinchado al rojo
const L = (() => { const v = [-0.5, -0.72, 0.48], n = Math.hypot(...v); return v.map((x) => x / n); })();
const mixHex = (a, b, k) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
};

function line(g, x0, y0, x1, y1, c, w = 1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
  for (let i = 0; i <= n; i++) P(g, x0 + ((x1 - x0) * i) / n - (w - 1) / 2, y0 + ((y1 - y0) * i) / n - (w - 1) / 2, c, w, w);
}
// Esfera u óvalo sombreado (cinco tonos y brillo) con contorno.
function vol(g, cx, cy, rx, ry, pal, outline = true) {
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  if (outline) for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    if ((x / (rx + 0.8)) ** 2 + (y / (ry + 0.8)) ** 2 <= 1) P(g, cx + x, cy + y, pal[0]);
  }
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const nx = x / rx, ny = y / ry, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const lam = nx * L[0] + ny * L[1] + Math.sqrt(1 - d) * L[2];
    P(g, cx + x, cy + y, lam < 0.05 ? pal[1] : lam < 0.4 ? pal[2] : lam < 0.7 ? pal[3] : lam < 0.9 ? pal[4] : pal[5]);
  }
}
function bone(g, x0, y0, x1, y1, w, pal) {
  line(g, x0, y0, x1, y1, pal[0], w + 2);
  line(g, x0, y0, x1, y1, pal[2], w);
  if (w > 1) line(g, x0 - 0.4, y0 - 0.6, x1 - 0.4, y1 - 0.6, pal[4], 1);
}
function joint(ax, ay, bx, by, l1, l2, bend) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy)));
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const th = Math.atan2(dy, dx) + bend * a;
  return [ax + Math.cos(th) * l1, ay + Math.sin(th) * l1];
}

// Los alvéolos de la cabeza: puntos repartidos por una esfera (espiral de Fibonacci), cada
// uno con su tamaño y si es una copa abierta.
const SACS = Array.from({ length: 12 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 12, r = Math.sqrt(1 - y * y), th = i * 2.39996;
  return { x: Math.cos(th) * r, y, z: Math.sin(th) * r, s: 0.9 + hash(i) * 0.35, cup: y > -0.1 && hash(i, 3) < 0.8 };   // copas abiertas: en la mitad de abajo, como en la lámina
});

// Cabeza de alvéolos de radio R en (cx, cy). k: 0..1 hinchado (colores al rojo, venas);
// sq: aplastado al vaciarse de golpe.
function head(g, gl, cx, cy, R, k, sq, t) {
  const pal = ALV.map((c, i) => mixHex(c, HOT[i], Math.max(0, k) ** 1.4));
  // Masa de fondo entre los sacos (más oscura).
  vol(g, cx, cy, R * 0.8 * (1 + sq * 0.15), R * 0.8 * (1 - sq * 0.25), pal.map((c, i) => (i ? pal[Math.max(1, i - 2)] : c)));
  // Los sacos de delante, de atrás adelante. Giran despacio (la cabeza respira).
  const rot = 0.6 + Math.sin(t * 0.4) * 0.35;           // se mece un poco, sin dar la vuelta
  const pts = SACS.map((p) => {
    const x = p.x * Math.cos(rot) + p.z * Math.sin(rot), z = -p.x * Math.sin(rot) + p.z * Math.cos(rot);
    return { ...p, X: x, Z: z };
  }).filter((p) => p.Z > -0.15).sort((a, b) => a.Z - b.Z);
  for (const p of pts) {
    const sx = cx + p.X * R * 0.66 * (1 + sq * 0.15), sy = cy + p.y * R * 0.66 * (1 - sq * 0.25);
    const r = R * 0.5 * p.s * (0.7 + 0.3 * p.Z) * (1 + Math.max(0, k) * 0.15);
    if (r < 1) continue;
    vol(g, sx, sy, r, r * (1 - sq * 0.2), pal);
    // Copa abierta: un agujero hondo con el borde iluminado (se cierran al hincharse).
    if (p.cup && p.Z > 0.1 && k < 0.55 && r > 1.6) {
      const hr = r * 0.62 * (1 - Math.max(0, k) * 1.4);
      if (hr >= 0.8) {
        // Borde del saco abierto (labio claro arriba) y el hueco hondo, más oscuro abajo.
        for (let a = 0; a < Math.PI * 2; a += 0.25) P(g, sx + Math.cos(a) * (hr + 0.6), sy + Math.sin(a) * (hr + 0.6), Math.sin(a) < 0 ? pal[4] : pal[1]);
        vol(g, sx, sy + 0.3, hr, hr, ['#0a0204', '#100204', '#2a060a', '#4a0e14', '#6a1a1e', '#6a1a1e'], false);
      }
    }
  }
  // Venas que se marcan al hincharse: hilos amarillos que laten y brillan.
  if (k > 0.45) {
    const vk = Math.min(1, (k - 0.45) / 0.4);
    for (let v = 0; v < 7; v++) {
      let a = hash(v, 7) * Math.PI * 2, x = cx + Math.cos(a) * R * 0.2, y = cy + Math.sin(a) * R * 0.2;
      for (let s = 0; s < R * 0.9; s++) {
        a += (hash(v * 31 + s, 9) - 0.5) * 0.9;
        x += Math.cos(a); y += Math.sin(a);
        if (Math.hypot(x - cx, y - cy) > R * 0.95) break;
        if (hash(v * 17 + s, 5) < vk) { P(g, x, y, '#ffd060'); P(gl, x, y, `rgba(255,170,60,${0.5 * vk})`); }
      }
    }
    // Brillo de calor de toda la cabeza.
    for (let y = -R; y <= R; y += 2) for (let x = -R; x <= R; x += 2) if (x * x + y * y < R * R) P(gl, cx + x, cy + y, `rgba(255,90,30,${0.1 * vk})`, 2, 2);
  }
}

function draw(g, gl, e, t) {
  const st = e.state ?? 'walk';
  const k = e.k ?? 0, sq = Math.max(0, -k) * 4;         // vaciada de golpe: se aplasta
  const air = st === 'float' || (st === 'inflate' && e.floating) || (st === 'recoil' && e.floating) || st === 'descend';
  const ph = e.walkPh ?? 0, moving = Math.abs(e.vx ?? 0) > 5 && !air;
  const gy = H - 1;                                     // suelo (pies)
  const lift = air ? (e.hover ?? 0) : 0;                // altura sobre el suelo al levitar
  const bob = moving ? Math.abs(Math.sin(ph * 2)) * 1 : Math.sin(t * 2.2) * 0.5;
  const tx = 29, ty = gy - 30 - bob + (st === 'inflate' && !air ? Math.min(1, k) * 3 : 0);   // torso (se agacha al hinchar)
  // Patas: cuatro, con las rodillas altas hacia fuera (las de atrás en sombra).
  const legs = [[-1, -8, 0, true], [1, 9, Math.PI, true], [-1, -5, Math.PI, false], [1, 6, 0, false]];
  for (const [side, reach, off, far] of legs) {
    const pal = far ? LEG.map((c, i) => (i ? LEG[Math.max(1, i - 1)] : c)) : LEG;
    const hip = [tx + side * 2.5, ty + 4];
    let fx, fy;
    if (air) {
      // Colgando y meciéndose, con las puntas hacia abajo.
      fx = tx + reach * 0.55 + Math.sin(t * 3 + off) * 1.5; fy = ty + 27 + Math.cos(t * 2.4 + off) * 1;
    } else {
      const s = moving ? Math.sin(ph + off) : 0;
      fx = tx + reach + s * 5; fy = gy - (moving ? Math.max(0, Math.cos(ph + off)) * 3 : 0);
    }
    const kn = joint(hip[0], hip[1], fx, fy, 14, 16, side > 0 ? -1 : 1);
    bone(g, hip[0], hip[1], kn[0], kn[1], 2, pal);
    bone(g, kn[0], kn[1], fx, fy, 1, pal);
    P(g, kn[0] - 0.5, kn[1] - 0.5, pal[5]);                                   // rodilla
    P(g, fx - 1, fy, pal[3], 3, 1); P(g, fx - 2, fy, pal[0]); P(g, fx + 2, fy, pal[0]);   // pie con uñas
  }
  // Torso nervudo con costillas.
  vol(g, tx, ty, 6, 7, TORSO);
  for (const dy of [-4, -1, 2, 5]) line(g, tx - 5, ty + dy, tx + 1, ty + dy - 1, TORSO[1]);
  // Esfínter del pecho (delante, a la derecha): anillo de labios fruncidos; carga al rojo
  // mientras se hincha y escupe un fogonazo al vaciarse.
  const sx = tx + 4, sy = ty + 0.5, open = Math.max(0, k) * 0.8 + (e.flash ?? 0);
  vol(g, sx, sy, 3, 3.4, TORSO.map((c, i) => (i ? TORSO[Math.min(5, i + 1)] : c)));
  for (let a = 0; a < 6.2; a += 0.9) P(g, sx + Math.cos(a) * 2.2, sy + Math.sin(a) * 2.6, TORSO[1]);  // pliegues
  P(g, sx - 0.5, sy - 0.5, open > 0.3 ? '#ff8a30' : '#0a0408', 1 + Math.round(open), 1 + Math.round(open));
  if (open > 0.2) P(gl, sx - 2, sy - 2, `rgba(255,120,40,${Math.min(1, open)})`, 4, 4);
  if ((e.flash ?? 0) > 0) { for (let i = 0; i < 4; i++) P(gl, sx + 2 + i * 2, sy - 1 + (i % 2), `rgba(255,190,90,${e.flash})`, 2, 2); }
  // Cuello: un tallo retorcido hasta la cabeza.
  const R = 8.5 * (1 + Math.max(0, k) * 0.6);
  const hx = tx + 1, hy = ty - 6 - R * (1 - sq * 0.25) - 1;
  for (let i = 0; i <= 4; i++) {
    const y = ty - 5 - i, x = tx + Math.sin(i * 1.3 + t) * 0.6;
    P(g, x - 1, y, TORSO[0], 3, 1); P(g, x, y, TORSO[3]);
  }
  head(g, gl, hx, hy, R, k, sq, t);
}

export const STILT = {
  size: () => [W, H],
  origin: (e) => [e.cx - W / 2, e.y + e.h - H - (e.hoverDraw ?? 0)],
  draw,
};
