// Subsistema de físicas: colisión AABB contra la cuadrícula de tiles.
// Coordenadas del juego en píxeles con Y hacia abajo; (x, y) = esquina sup. izq.

export const TILE = 16;
// 'f' = membrana fotosensible cerrada (se abre a 'F' con la luz del ojo).
// 'D' = compuerta-esfínter cerrada (entities/Puzzles.js la abre y la cierra).
// 'm' = mucosa resbaladiza: pared en la que las Garras no se agarran.
const SOLID = new Set(['#', 'X', 'f', 'Y', 'D', 'm']);

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

  solidAtPx(x, y) { return this.solid(Math.floor(x / TILE), Math.floor(y / TILE)); }

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

  // Mueve un cuerpo {x,y,w,h,vx,vy} resolviendo cada eje por separado.
  move(b, dt) {
    b.hitWall = 0;
    b.hitCeiling = false;
    b.onGround = false;

    b.x += b.vx * dt;
    if (this.rectSolid(b.x, b.y, b.w, b.h)) {
      if (b.vx > 0) {
        b.x = Math.floor((b.x + b.w) / TILE) * TILE - b.w;
        b.hitWall = 1;
      } else if (b.vx < 0) {
        b.x = (Math.floor(b.x / TILE) + 1) * TILE;
        b.hitWall = -1;
      }
      b.vx = 0;
    }

    const prevBottom = b.y + b.h;
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
    // Plataformas: solo frenan cayendo (o quieto) desde encima; si suben, te llevan.
    for (const pl of this.platforms) {
      if (b.vy < 0 || b.x + b.w <= pl.x || b.x >= pl.x + pl.w) continue;
      const prevTop = pl.y - (pl.dy ?? 0);
      if (prevBottom <= prevTop + 3 && b.y + b.h >= pl.y - 0.5) {
        const ny = pl.y - b.h;
        if (!this.rectSolid(b.x, ny, b.w, b.h)) {
          b.y = ny; b.vy = 0; b.onGround = true;
          // Si la plataforma se desplaza de lado, te lleva con ella.
          if (pl.dx && !this.rectSolid(b.x + pl.dx, b.y, b.w, b.h)) b.x += pl.dx;
        }
      }
    }
  }

  // Línea de visión: muestrea el segmento cada 4px.
  lineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.ceil(Math.hypot(dx, dy) / 4);
    const end = `${Math.floor(x1 / TILE)},${Math.floor(y1 / TILE)}`;
    for (let i = 1; i < steps; i++) {
      const x = x0 + (dx * i) / steps, y = y0 + (dy * i) / steps;
      if (`${Math.floor(x / TILE)},${Math.floor(y / TILE)}` === end) break;
      if (this.solidAtPx(x, y)) return false;
    }
    return true;
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
