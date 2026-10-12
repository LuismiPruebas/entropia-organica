// GLÁNDULA GÁSTRICA: una masa cerebral pálida, llena de circunvoluciones, colgada del
// techo por tubos anillados que se estiran como resortes cuando baja. Respira: sus
// lóbulos y vesículas se inflan y se vacían por turnos. Una boca vertical de colmillos
// mastica en vacío en el costado que mira hacia ti, y por debajo cuelgan cilios de
// filtrado y vellosidades que se retuercen y se estiran hacia lo que tiene cerca.
// Solo es vulnerable con la boca abierta. La mueve bossGland (entities/Enemy.js).

const P = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

// --- Textura de circunvoluciones: curvas de nivel de un ruido suave (se calcula una
// vez; el cuerpo la muestrea deformada por lo que se infla cada lóbulo).
const GW = 96, GH = 80;
let FIELD = null;
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
}
function field() {
  if (FIELD) return FIELD;
  FIELD = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const u = x / 15, v = y / 13;
    const n = noise(u, v) * 0.75 + noise(u * 2.1 + 5, v * 2.1) * 0.25;
    FIELD[y * GW + x] = (n * 4.2) % 1; // cada banda, una circunvolución
  }
  return FIELD;
}

// Paleta pálida: carne rosada desvaída, como un órgano que lleva años sin sangre.
const C = {
  crest: '#f2d4d8', light: '#e2b8c0', mid: '#cc9aa8', low: '#b07e8e', shade: '#8e5e70',
  sulcus: '#6a3c50', deep: '#4a2436', outline: '#2a1220',
  lip: '#c0707e', lipLight: '#eaa0aa', throat: '#1a0408', gullet: '#5a0a18',
  tooth: '#f2e4bc', toothDark: '#b8a478',
  tube: '#8a7c88', tubeLight: '#c8bec6', tubeDark: '#463844', hose: '#2e2230', brass: '#a88a5a',
  cilia: '#b08090', ciliaTip: '#ecccd2', vesicle: '#d8e0a0', vesicleDark: '#8a9a50',
};
const SHADES = [C.deep, C.sulcus, C.shade, C.low, C.mid, C.light, C.crest];

// Lóbulos que se inflan por turnos: ángulo, amplitud, velocidad, fase.
const LOBES = [[-2.4, 0.09, 1.3, 0], [-1.6, 0.07, 1.7, 2], [-0.7, 0.1, 1.1, 4], [0.3, 0.06, 2.1, 1], [2.6, 0.08, 1.5, 3]];
const angDist = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export const GLAND = {
  size: () => [150, 190],
  // El lienzo arranca en el techo del que cuelga (e.ceilY, lo fija bossGland).
  origin: (e) => [e.cx - 75, (e.ceilY ?? e.y) - 2],
  noFlip: true,
  draw(g, gl, e, t, game) {
    const F = field();
    const [ox, oy] = GLAND.origin(e);
    const cx = e.cx - ox, cy = e.cy - oy; // centro del cuerpo en el lienzo
    const RX = 31, RY = 24;
    const open = e.mouthOpen ?? 0.2;
    const swell = e.swell ?? 0; // contracción antes de escupir / inundar
    const lash = e.lash ?? 0; // cilios latigueando (al bajar)
    const face = e.face ?? 1; // hacia dónde mira la boca (-1..1)
    const p = game?.player;
    const breath = Math.sin(t * 1.4) * 0.03 + swell * 0.07;
    // Radio de la silueta según el ángulo: respiración + lóbulos que se inflan.
    const R = (a) => {
      let k = 1 + breath;
      for (const [la, amp, sp, ph] of LOBES) {
        const d = angDist(a, la);
        k += amp * Math.max(0, Math.sin(t * sp + ph)) * Math.exp(-(d * d) / 0.22) * (1 + swell);
      }
      return k;
    };

    // --- Tubos: del techo (fijos en el mundo) al cuerpo. Anillos que se separan
    // cuando el cuerpo baja (elásticos) y una onda que los recorre bombeando.
    const homeCx = e.home ? e.home.x + e.w / 2 - ox : cx;
    for (const [i, ax, bx] of [[0, -24, -17], [1, -9, -6], [2, 7, 6], [3, 22, 16]]) {
      const x0 = homeCx + ax, y0 = 0;
      const top = cy - RY * R(-Math.PI / 2) + 3;
      const x1 = cx + bx, y1 = top + Math.abs(bx) * 0.35;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = 11, sag = Math.sin(t * 0.8 + i) * 3 + (x1 - x0) * 0.25;
      const at = (s) => {
        const mx = (x0 + x1) / 2 + sag, my = (y0 + y1) / 2;
        return [(1 - s) ** 2 * x0 + 2 * (1 - s) * s * mx + s * s * x1, (1 - s) ** 2 * y0 + 2 * (1 - s) * s * my + s * s * y1];
      };
      // manguera interior
      for (let s = 0; s <= 1; s += 1 / Math.max(8, len)) { const [x, y] = at(s); P(g, x - 1, y, C.hose, 3, 1); P(g, x, y, '#5a4656'); }
      // anillos
      for (let k = 0; k <= n; k++) {
        const s = k / n, [x, y] = at(s);
        const pump = Math.sin(k * 0.9 - t * 5 + i) * 0.8;
        const w = Math.round(6 + pump - (k === 0 ? 0 : 0));
        const ring = k >= n - 1 ? C.brass : C.tube;
        P(g, x - w / 2 - 0.5, y - 1, C.tubeDark, w + 1, 3);
        P(g, x - w / 2, y - 1, ring, w, 2);
        P(g, x - w / 2 + 1, y - 1, k >= n - 1 ? '#e0c890' : C.tubeLight, Math.max(1, w - 3), 1);
      }
      // jugo que sube por dentro
      const s = 1 - ((t * 0.5 + i * 0.27) % 1), [jx, jy] = at(s);
      P(gl, jx, jy, '#5aff4a');
    }

    // --- Cilios de filtrado y vellosidades: cuelgan de la mitad inferior, se retuercen
    // en ondas y, si estás cerca, se estiran hacia ti. Al bajar, latiguean.
    const pdx = p ? p.cx - e.cx : 0, pdy = p ? p.cy - e.cy : 0, pd = Math.hypot(pdx, pdy);
    const reach = p && pd < 110 ? 1 - pd / 110 : 0;
    const pa = Math.atan2(pdy, pdx);
    const NC = 30;
    for (let i = 0; i < NC; i++) {
      const a0 = 0.05 * Math.PI + (i / (NC - 1)) * 0.9 * Math.PI + Math.sin(i * 7.3) * 0.05;
      const rr = R(a0);
      let x = cx + Math.cos(a0) * RX * rr * 0.92, y = cy + Math.sin(a0) * RY * rr * 0.92;
      const L = 16 + ((i * 37) % 19) + lash * 8;
      const segs = 9, sl = L / segs;
      // espasmo: de vez en cuando un cilio se encoge de golpe
      const spasm = Math.max(0, Math.sin(t * 0.9 + i * 2.7)) ** 12;
      let a = a0 * 0.45 + Math.PI / 2 * 0.55; // cuelgan, pero hacia fuera
      for (let k = 0; k < segs; k++) {
        const wave = Math.sin(t * (2.2 + lash * 5) + i * 1.3 - k * 0.7) * (0.16 + lash * 0.3);
        a += wave + spasm * 0.35 * (i % 2 ? 1 : -1);
        if (reach > 0) a += angDist(pa, a) * reach * 0.12 * (k / segs);
        const nx = x + Math.cos(a) * sl, ny = y + Math.sin(a) * sl;
        const col = k < 3 ? C.cilia : k < 6 ? '#c898a6' : C.ciliaTip;
        const steps = Math.ceil(sl);
        for (let s = 0; s <= steps; s++) P(g, x + ((nx - x) * s) / steps, y + ((ny - y) * s) / steps, col, k < 2 ? 2 : 1, 1);
        x = nx; y = ny;
      }
      P(g, x, y, '#f8e0e4'); // botón de la punta
      if (reach > 0.4 || lash > 0.5) P(gl, x, y, '#ff8090');
    }

    // --- Cuerpo: silueta lobulada, sombreado como una esfera y circunvoluciones.
    const u0 = face * 0.35; // la textura gira un poco con la boca (como si rotara)
    for (let y = -RY - 6; y <= RY + 6; y++) {
      for (let x = -RX - 8; x <= RX + 8; x++) {
        const a = Math.atan2(y / RY, x / RX), rr = R(a);
        const d = Math.hypot(x / (RX * rr), y / (RY * rr));
        if (d > 1) continue;
        if (d > 0.94) { P(g, cx + x, cy + y, C.outline); continue; }
        // normal de la esfera para la luz (de arriba a la izquierda)
        const nz = Math.sqrt(Math.max(0, 1 - d * d));
        const lit = Math.max(0, (-x / (RX * rr)) * 0.35 + (-y / (RY * rr)) * 0.55 + nz * 0.6);
        const fu = Math.min(GW - 1, Math.max(0, Math.round(((x / (RX * rr) + u0) * 0.5 + 0.5) * (GW - 1))));
        const fv = Math.min(GH - 1, Math.max(0, Math.round((y / (RY * rr) * 0.5 + 0.5) * (GH - 1))));
        const f = F[fv * GW + fu];
        const bulge = Math.sin(f * Math.PI); // cresta de la circunvolución
        let v = lit * 0.6 + bulge * 0.5 - 0.05;
        if (f < 0.07 || f > 0.95) v = Math.min(v, 0.18); // surco
        if (y > RY * 0.35) v -= 0.18 * ((y - RY * 0.35) / RY) * 2; // la parte de abajo, en sombra
        P(g, cx + x, cy + y, SHADES[Math.max(0, Math.min(6, Math.floor(v * 7)))]);
      }
    }
    // Vesículas de jugo: se hinchan antes de escupir y se vacían al hacerlo.
    for (const [vx, vy, ph] of [[-0.62, 0.15, 0], [-0.48, 0.42, 1.7], [0.1, 0.5, 3.1]]) {
      const ex = cx + vx * RX * -face, ey = cy + vy * RY;
      const r = 2 + swell * 2.5 + Math.max(0, Math.sin(t * 2 + ph)) * 0.8;
      for (let yy = -Math.ceil(r); yy <= Math.ceil(r); yy++) for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
        const q = (xx * xx + yy * yy) / (r * r);
        if (q > 1) continue;
        P(g, ex + xx, ey + yy, q > 0.7 ? C.vesicleDark : C.vesicle);
        if (q < 0.4 && swell > 0.3) P(gl, ex + xx, ey + yy, '#7aff5a');
      }
      P(g, ex - r * 0.4, ey - r * 0.4, '#ffffff');
    }

    // --- Boca vertical de colmillos, en el costado que mira hacia ti. Mastica en vacío;
    // al abrirse del todo se ve la garganta roja (el punto débil).
    const mx = cx + face * RX * 0.5, my = cy + RY * 0.3;
    const mw = 4 + open * 3, mh = 6 + open * 9;
    const chew = Math.sin(t * 7) * (1 - open) * 0.8;
    for (let y = -Math.ceil(mh) - 3; y <= Math.ceil(mh) + 3; y++) {
      for (let x = -Math.ceil(mw) - 3; x <= Math.ceil(mw) + 3; x++) {
        const q = (x / (mw + 3)) ** 2 + (y / (mh + 3)) ** 2;
        if (q > 1) continue;
        const inner = (x / mw) ** 2 + (y / (mh + chew)) ** 2;
        if (inner <= 1) {
          const deep = (x / (mw * 0.5)) ** 2 + (y / (mh * 0.7)) ** 2 <= 1 && open > 0.5;
          P(g, mx + x, my + y, deep ? C.gullet : C.throat);
          if (deep && e.exposed) P(gl, mx + x, my + y, '#ff3020');
        } else P(g, mx + x, my + y, q > 0.8 ? C.outline : x * face < 0 ? C.lipLight : C.lip);
      }
    }
    // colmillos por todo el borde interior, apuntando hacia dentro
    const NT = 16;
    for (let k = 0; k < NT; k++) {
      const a = (k / NT) * Math.PI * 2;
      const ex = mx + Math.cos(a) * mw, ey = my + Math.sin(a) * (mh + chew);
      const len = 2 + (k % 3 === 0 ? 2 : 1) + open;
      for (let s = 0; s < len; s++) P(g, ex - Math.cos(a) * s, ey - Math.sin(a) * s, s === len - 1 ? '#fffbe8' : s === 0 ? C.toothDark : C.tooth);
    }
    // babas de ácido
    for (const dx of [-2, 1, 3]) {
      const drool = ((t * 20 + dx * 7) % 14) * (0.4 + open);
      for (let s = 0; s < drool; s++) P(g, mx + dx, my + mh + 2 + s, '#9be06a');
      P(gl, mx + dx, my + mh + 2 + drool, '#9be06a');
    }

    // Punto débil y fijado: la boca.
    e.spotsLocal = [{ x: mx, y: my, r: 7, weak: !!e.exposed }];
  },
};
