// Herramientas de dibujo modular (protagonista y criaturas): cuerpos hechos de
// piezas con volumen y contorno, unidas por articulaciones de dos huesos. Todo en
// píxeles enteros sobre un lienzo 2D que luego se usa como textura.

export const OUTLINE = '#140c10';

export function px(g, x, y, c, w = 1, h = 1) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

// Trazo grueso centrado (pluma cuadrada de w px).
export function seg(g, x0, y0, x1, y1, c, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 1.5;
  const o = (w - 1) / 2;
  for (let i = 0; i <= n; i++) px(g, x0 + ((x1 - x0) * i) / n - o, y0 + ((y1 - y0) * i) / n - o, c, w, w);
}

// Miembro con contorno: primero el borde oscuro, luego el relleno y un brillo.
export function limb(g, x0, y0, x1, y1, w, c, hi) {
  seg(g, x0, y0, x1, y1, OUTLINE, w + 2);
  seg(g, x0, y0, x1, y1, c, w);
  if (hi && w > 1) seg(g, x0 - 0.5, y0 - 0.5, x1 - 0.5, y1 - 0.5, hi, 1);
}

// Elipse rellena; con `rim` pinta el borde de otro color y con `hi` un brillo.
export function blob(g, cx, cy, rx, ry, c, rim, hi) {
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
    const d = (x * x) / (rx * rx || 1) + (y * y) / (ry * ry || 1);
    if (d > 1) continue;
    px(g, cx + x, cy + y, rim && d > 0.6 ? rim : c);
  }
  if (hi) px(g, cx - Math.round(rx / 2), cy - Math.round(ry / 2), hi);
}

// Pieza con contorno: elipse oscura un píxel mayor y encima la pieza.
export function part(g, cx, cy, rx, ry, c, rim, hi) {
  blob(g, cx, cy, rx + 1, ry + 1, OUTLINE);
  blob(g, cx, cy, rx, ry, c, rim, hi);
}

export function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
}

// Articulación de dos huesos: devuelve el codo/rodilla. bend = +1/-1 elige el lado.
export function ik(ax, ay, bx, by, l1, l2, bend) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy)));
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const th = Math.atan2(dy, dx) + bend * a;
  return [ax + Math.cos(th) * l1, ay + Math.sin(th) * l1];
}

// Pata articulada completa (cadera -> rodilla -> pie) con contorno.
export function jointLeg(g, hx, hy, fx, fy, l1, l2, bend, w, c, cFar, joint) {
  const [kx, ky] = ik(hx, hy, fx, fy, l1, l2, bend);
  limb(g, hx, hy, kx, ky, w, c);
  limb(g, kx, ky, fx, fy, Math.max(1, w - 1), cFar ?? c);
  if (joint) px(g, kx - 0.5, ky - 0.5, joint, 2, 2);
  return [kx, ky];
}

// Pinta un mapa de píxeles (filas de caracteres) con una paleta, opcionalmente
// también en la capa de brillo para los caracteres de `glow`.
export function sprite(g, gl, rows, x0, y0, pal, glow = '') {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || !pal[ch]) continue;
      px(g, x0 + x, y0 + y, pal[ch]);
      if (gl && glow.includes(ch)) px(gl, x0 + x, y0 + y, pal[ch]);
    }
  });
}
