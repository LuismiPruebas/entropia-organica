// Búfer de píxeles en memoria (Uint32) con la misma API que px(): pintar miles de
// píxeles sueltos con fillRect (y una cadena de color en cada uno) es caro; así se
// pintan en el búfer y se vuelcan al lienzo de una vez (putImageData). Lo usan el HUD
// (ui/Bladders.js) y las criaturas más detalladas (entities/Golem.js).
const RGBA = new Map(); // caché: cadena de color -> [r, g, b, a]
export function parseColor(c) {
  let v = RGBA.get(c);
  if (v) return v;
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  else { const m = c.match(/[\d.]+/g).map(Number); v = [m[0], m[1], m[2], m[3] ?? 1]; }
  RGBA.set(c, v);
  return v;
}
export const pack = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r; // ABGR (little-endian)
export class PixBuf {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.img = new ImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  clear() { this.buf.fill(0); }
  // c: cadena de color (con alfa se mezcla con lo que hay) o un color ya empaquetado.
  px(x, y, c, w = 1, h = 1) {
    x = Math.round(x); y = Math.round(y);
    const x0 = Math.max(0, x), x1 = Math.min(this.w, x + w), y0 = Math.max(0, y), y1 = Math.min(this.h, y + h);
    if (x0 >= x1 || y0 >= y1) return;
    if (typeof c === 'number') { for (let j = y0; j < y1; j++) this.buf.fill(c, j * this.w + x0, j * this.w + x1); return; }
    const [r, g, b, a] = parseColor(c);
    if (a >= 1) { const v = pack(r, g, b); for (let j = y0; j < y1; j++) this.buf.fill(v, j * this.w + x0, j * this.w + x1); return; }
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
      const k = j * this.w + i, d = this.buf[k], da = (d >>> 24) / 255;
      const oa = a + da * (1 - a);
      if (oa <= 0) continue;
      const mixc = (sc, dc) => Math.round((sc * a + dc * da * (1 - a)) / oa);
      this.buf[k] = (Math.round(oa * 255) << 24) | (mixc(b, (d >> 16) & 255) << 16) | (mixc(g, (d >> 8) & 255) << 8) | mixc(r, d & 255);
    }
  }
  flush(ctx) { ctx.putImageData(this.img, 0, 0); }
}
