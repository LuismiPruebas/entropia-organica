// Subsistema de físicas: colisión AABB contra la cuadrícula de tiles.
// Coordenadas del juego en píxeles con Y hacia abajo; (x, y) = esquina sup. izq.

export const TILE = 16;
// 'f' = membrana fotosensible cerrada (se abre a 'F' con la luz del ojo).
// 'D' = compuerta-esfínter cerrada (entities/Puzzles.js la abre y la cierra).
// 'm' = mucosa resbaladiza: pared en la que las Garras no se agarran.
const SOLID = new Set(['#', 'X', 'f', 'Y', 'D', 'm', 'K']);

// Pendientes (suelos inclinados): sólidas por debajo de una recta. Para cada una, la
// altura de la superficie (px desde el borde superior de la casilla) en su borde
// izquierdo y en el derecho:
//   /  45° que sube hacia la derecha        k  45° que sube hacia la izquierda
//   a  22,5° sube a la derecha, mitad baja    A  ... mitad alta    (se ponen "aA")
//   E  22,5° sube a la izquierda, mitad alta  e  ... mitad baja    (se ponen "Ee")
// Por debajo de cada pendiente debe haber pared. Se pisan desde arriba (desde abajo,
// se atraviesan como una plataforma).
export const SLOPES = { '/': [16, 0], k: [0, 16], a: [16, 8], A: [8, 0], E: [0, 8], e: [8, 16] };
export const isSlope = (c) => c in SLOPES || c in CEILS;
// Rampas de techo (las de suelo volteadas): sólidas por ENCIMA de su recta.
//   J  techo 45° que baja hacia la derecha   L  techo 45° que baja hacia la izquierda
//   r  techo suave que baja a la derecha, mitad alta   R  ... mitad baja   (se ponen "rR")
//   w  techo suave que baja a la izquierda, mitad baja  W  ... mitad alta  (se ponen "wW")
export const CEILS = { J: [0, 16], L: [16, 0], r: [0, 8], R: [8, 16], w: [16, 8], W: [8, 0] };
export const isCeil = (c) => c in CEILS;
// ¿Es sólido el punto (lx, ly) de una casilla de rampa (de suelo o de techo)?
export function slopeSolidAt(c, lx, ly) {
  if (c in SLOPES) return ly >= slopeSurface(c, lx);
  const [l, r] = CEILS[c];
  return ly < l + (r - l) * Math.min(1, Math.max(0, lx / TILE));
}
// Altura de la superficie (px desde arriba de la casilla) a lx px de su borde izquierdo.
export function slopeSurface(c, lx) {
  const [l, r] = SLOPES[c];
  return l + (r - l) * Math.min(1, Math.max(0, lx / TILE));
}
const STEP = 9;          // lo que se sube sin saltar (la unión rampa-bloque)
const EPS = 0.001;

export class TileWorld {
  constructor(rows) {
    this.rows = rows.map((r) => r.split(''));
    this.h = this.rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    for (const r of this.rows) while (r.length < this.w) r.push('.');
    // Plataformas móviles { x, y, w, dy } (balsas que flotan): se pisan desde arriba.
    this.platforms = [];
  }

  get pixelW() { return this.w * TILE; }
  get pixelH() { return this.h * TILE; }

  // Fuera de la sala se prolonga el borde en las cuatro direcciones: los huecos
  // de salida (laterales, de techo o de suelo) continúan y las paredes siguen cerradas.
  get(cx, cy) {
    if (cy < 0) cy = 0;
    else if (cy >= this.h) cy = this.h - 1;
    if (cx < 0) cx = 0;
    else if (cx >= this.w) cx = this.w - 1;
    return this.rows[cy][cx];
  }

  set(cx, cy, c) {
    if (cy >= 0 && cy < this.h && cx >= 0 && cx < this.w) this.rows[cy][cx] = c;
  }

  solid(cx, cy) { return SOLID.has(this.get(cx, cy)); }

  // ¿Es sólido este píxel? En las pendientes, solo por debajo de su superficie.
  solidAtPx(x, y) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE), c = this.get(cx, cy);
    if (SOLID.has(c)) return true;
    if (c in SLOPES) return y - cy * TILE >= slopeSurface(c, x - cx * TILE);
    if (c in CEILS) return slopeSolidAt(c, x - cx * TILE, y - cy * TILE);
    return false;
  }

  // ¿Choca un rectángulo con alguna rampa de techo? Exacto: en el tramo de la casilla que
  // cubre, la recta alcanza su punto más bajo en un extremo; si el borde de arriba del
  // rectángulo queda por encima de ese punto, se solapan.
  rectHitsCeil(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - EPS) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - EPS) / TILE);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const c = this.get(cx, cy);
      if (!(c in CEILS)) continue;
      const [l, r] = CEILS[c], k = (r - l) / TILE;
      const lx0 = Math.max(0, x - cx * TILE), lx1 = Math.min(TILE, x + w - cx * TILE);
      const low = Math.max(l + k * lx0, l + k * lx1);             // lo más bajo de la recta en ese tramo
      if (y - cy * TILE < low - EPS) return true;
    }
    return false;
  }
  // Sólido para un cuerpo: casillas macizas o rampas de techo (las de suelo van aparte).
  #blocked(x, y, w, h) { return this.rectSolid(x, y, w, h) || this.rectHitsCeil(x, y, w, h); }

  // Raycast robusto por la cuadrícula (DDA de Amanatides-Woo): recorre exactamente las
  // casillas que cruza el segmento, en orden, sin saltarse esquinas. En las casillas
  // macizas el impacto es al entrar; en las pendientes se calcula el corte exacto con
  // su recta. Devuelve { x, y, t (0..1), cx, cy, c } del primer impacto, o null.
  // skipEnd: no cuenta la casilla del destino (p. ej. el garfio o el sello al que apuntas).
  raycast(x0, y0, x1, y1, skipEnd = false) {
    const dx = x1 - x0, dy = y1 - y0;
    let cx = Math.floor(x0 / TILE), cy = Math.floor(y0 / TILE);
    const ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
    const sx = Math.sign(dx), sy = Math.sign(dy);
    const tdx = dx ? Math.abs(TILE / dx) : Infinity, tdy = dy ? Math.abs(TILE / dy) : Infinity;
    let tmx = dx ? ((sx > 0 ? (cx + 1) * TILE - x0 : x0 - cx * TILE) / Math.abs(dx)) : Infinity;
    let tmy = dy ? ((sy > 0 ? (cy + 1) * TILE - y0 : y0 - cy * TILE) / Math.abs(dy)) : Infinity;
    let tIn = 0;
    for (let guard = 0; guard < 4096; guard++) {
      const tOut = Math.min(tmx, tmy, 1);
      if (skipEnd && cx === ex && cy === ey) return null;
      const c = this.get(cx, cy);
      if (SOLID.has(c)) return { x: x0 + dx * tIn, y: y0 + dy * tIn, t: tIn, cx, cy, c };
      if (c in SLOPES) {
        // Distancia con signo bajo la superficie: f(t) = y(t) - surf(x(t)); es lineal en t.
        const [l, r] = SLOPES[c], k = (r - l) / TILE;
        const fn = (t) => (y0 + dy * t - cy * TILE) - (l + k * Math.min(TILE, Math.max(0, x0 + dx * t - cx * TILE)));
        const fa = fn(tIn), fb = fn(tOut);
        if (fa >= 0) return { x: x0 + dx * tIn, y: y0 + dy * tIn, t: tIn, cx, cy, c };
        if (fb >= 0) { const t = tIn + (tOut - tIn) * (-fa / (fb - fa)); return { x: x0 + dx * t, y: y0 + dy * t, t, cx, cy, c }; }
      }
      if (c in CEILS) {
        // Dentro por encima de la recta: g(t) = surf(x(t)) - y(t) > 0; también lineal en t.
        const [l, r] = CEILS[c], k = (r - l) / TILE;
        const gn = (t) => (l + k * Math.min(TILE, Math.max(0, x0 + dx * t - cx * TILE))) - (y0 + dy * t - cy * TILE);
        const ga = gn(tIn), gb = gn(tOut);
        if (ga > 0) return { x: x0 + dx * tIn, y: y0 + dy * tIn, t: tIn, cx, cy, c };
        if (gb > 0) { const t = tIn + (tOut - tIn) * (-ga / (gb - ga)); return { x: x0 + dx * t, y: y0 + dy * t, t, cx, cy, c }; }
      }
      if (tOut >= 1) return null;
      tIn = tOut;
      if (tmx < tmy) { tmx += tdx; cx += sx; } else { tmy += tdy; cy += sy; }
    }
    return null;
  }

  // Suelo bajo un punto: un rayo vertical desde (x, y0) hacia abajo hasta maxDist.
  // Devuelve la altura (px) de la superficie que encuentra (plana o en pendiente), o
  // null. Si el punto de partida ya está dentro de algo, devuelve y0.
  groundBelow(x, y0, maxDist) {
    const hit = this.raycast(x, y0, x, y0 + maxDist);
    return hit ? hit.y : null;
  }

  slopeAt(x, y) { return this.get(Math.floor(x / TILE), Math.floor(y / TILE)) in SLOPES; }

  // Tiles que solapa un rectángulo.
  *tilesIn(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) yield { cx, cy, c: this.get(cx, cy) };
    }
  }

  rectSolid(x, y, w, h) {
    for (const t of this.tilesIn(x, y, w, h)) if (SOLID.has(t.c)) return true;
    return false;
  }

  // Mueve un cuerpo {x,y,w,h,vx,vy} resolviendo cada eje por separado. Las casillas
  // macizas se resuelven como cajas; las pendientes, con un rayo desde los pies (el
  // centro de la base): el cuerpo se apoya en la superficie que haya bajo ese punto.
  move(b, dt) {
    const wasGround = b.onGround;
    b.hitWall = 0;
    b.hitCeiling = false;
    b.onGround = false;

    const oldX = b.x;
    b.x += b.vx * dt;
    // Cara alta de una pendiente (su lado vertical): es pared si la pisaríamos hundidos
    // más de lo que se puede subir.
    if (b.vx) {
      const feet = b.y + b.h, cxp = b.x + b.w / 2;
      const surf = this.raycast(cxp, feet - TILE * 2, cxp, feet);
      if (surf && surf.c in SLOPES && feet - surf.y > STEP && !this.rectSolid(oldX, b.y, b.w, b.h)) {
        b.x = oldX; b.hitWall = Math.sign(b.vx); b.vx = 0;
      }
    }
    if (this.rectSolid(b.x, b.y, b.w, b.h)) {
      // Escalón: en el suelo, un choque bajo (la unión de una rampa con un bloque) se sube.
      let lifted = 0;
      if (wasGround && b.vy >= 0) for (let st = 1; st <= STEP; st++) if (!this.#blocked(b.x, b.y - st, b.w, b.h)) { lifted = st; break; }
      if (lifted) b.y -= lifted;
      else if (b.vx > 0) {
        b.x = Math.floor((b.x + b.w) / TILE) * TILE - b.w;
        b.hitWall = 1;
      } else if (b.vx < 0) {
        b.x = (Math.floor(b.x / TILE) + 1) * TILE;
        b.hitWall = -1;
      }
      if (!lifted) b.vx = 0;
    }

    if (this.rectHitsCeil(b.x, b.y, b.w, b.h)) {
      let lo = 0, hi = 1;                                  // fracción del paso que sí cabe
      const nx = b.x;
      for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (this.rectHitsCeil(oldX + (nx - oldX) * m, b.y, b.w, b.h)) hi = m; else lo = m; }
      b.x = oldX + (nx - oldX) * lo;
      if (this.rectHitsCeil(b.x, b.y, b.w, b.h)) b.x = oldX;
      b.hitWall = Math.sign(b.vx) || b.hitWall; b.vx = 0;
    }

    const prevBottom = b.y + b.h, oldY = b.y;
    b.y += b.vy * dt;
    if (this.rectSolid(b.x, b.y, b.w, b.h)) {
      if (b.vy > 0) {
        b.y = Math.floor((b.y + b.h) / TILE) * TILE - b.h;
        b.onGround = true;
      } else if (b.vy < 0) {
        b.y = (Math.floor(b.y / TILE) + 1) * TILE;
        b.hitCeiling = true;
      }
      b.vy = 0;
    } else if (b.vy >= 0 && this.rectSolid(b.x, b.y + b.h, b.w, 1)) {
      b.onGround = true;
    }
    // Pendientes: rayo desde los pies. Si el cuerpo se hunde en la superficie, se apoya
    // encima; si iba por el suelo y la superficie queda un poco más abajo (bajando una
    // rampa), se pega a ella en vez de despegar a saltitos.
    b.onSlope = false;
    if (b.vy >= 0) {
      const fx = b.x + b.w / 2, feet = b.y + b.h;
      // (+ media anchura: al salir de una meseta hacia la bajada, el cuerpo aún se apoya en
      // la esquina mientras su centro ya va sobre la rampa, que entretanto ha bajado eso)
      const snap = wasGround ? Math.abs(b.vx * dt) * 1.25 + 2 + b.w / 2 : 0;
      const hit = this.raycast(fx, feet - STEP, fx, feet + snap + EPS);
      if (hit && (hit.c in SLOPES || this.slopeAt(fx, feet - 1) || this.slopeAt(fx, feet + 1))) {
        const ny = hit.y - b.h;
        const sinks = hit.y < feet;                                    // hundido en la rampa
        if ((sinks || wasGround) && !this.#blocked(b.x, ny, b.w, b.h)) {
          b.y = ny; b.vy = 0; b.onGround = true; b.onSlope = hit.c in SLOPES;
        }
      }
    }
    if (this.rectHitsCeil(b.x, b.y, b.w, b.h)) {
      let lo = 0, hi = 1;
      const ny = b.y;
      for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (this.rectHitsCeil(b.x, oldY + (ny - oldY) * m, b.w, b.h)) hi = m; else lo = m; }
      b.y = oldY + (ny - oldY) * lo;
      if (this.rectHitsCeil(b.x, b.y, b.w, b.h)) b.y = oldY;
      if (ny < oldY) b.hitCeiling = true; else b.onGround = true;
      b.vy = 0;
    }
    // Plataformas: solo frenan cayendo (o quieto) desde encima; si suben, te llevan. Un
    // escalón de pocos píxeles se sube andando (de la orilla a una balsa que flota).
    for (const pl of this.platforms) {
      if (b.vy < 0 || b.x + b.w <= pl.x || b.x >= pl.x + pl.w) continue;
      const prevTop = pl.y - (pl.dy ?? 0);
      if (prevBottom <= prevTop + 6 && b.y + b.h >= pl.y - 0.5) {
        const ny = pl.y - b.h;
        if (!this.rectSolid(b.x, ny, b.w, b.h)) {
          b.y = ny; b.vy = 0; b.onGround = true;
          // Si la plataforma se desplaza de lado, te lleva con ella.
          if (pl.dx && !this.rectSolid(b.x + pl.dx, b.y, b.w, b.h)) b.x += pl.dx;
        }
      }
    }
  }

  // Línea de visión: un raycast exacto (la casilla del destino no cuenta: así se ve un
  // sello o un garfio aunque su casilla sea sólida).
  lineOfSight(x0, y0, x1, y1) {
    return !this.raycast(x0, y0, x1, y1, true);
  }

  // Todas las celdas conectadas con el mismo carácter (para romper membranas enteras).
  floodFill(cx, cy) {
    const c = this.get(cx, cy);
    const out = [];
    const seen = new Set();
    const stack = [[cx, cy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const k = `${x},${y}`;
      if (seen.has(k) || x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      seen.add(k);
      if (this.rows[y][x] !== c) continue;
      out.push([x, y]);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return out;
  }
}

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
