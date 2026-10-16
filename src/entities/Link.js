import { TILE } from '../core/Physics.js';
import { canvasSprite } from './Puzzles.js';

// PUNTO DE CONEXIÓN (data/worlds/*: links de cada sala). Une un sitio de una sala con un
// punto de otra (o de la misma), donde sea, no solo en los bordes:
//   { id: 'p1', x, y, w: 1, h: 2, to: 'A3', toLink: 'p2', trigger: 'touch' | 'use', look: 'portal' | 'hidden' }
//   · to/toLink: adónde lleva. Sin `to` es solo un punto de llegada (para un viaje de ida).
//   · trigger: 'touch' te lleva al entrar en él; 'use' pide [E] delante.
//   · look: 'portal' se ve (un orificio de carne que late); 'hidden' no se ve (pasos invisibles).
//   · arrive: [x, y] opcional: dónde se aparece al llegar a este punto (p. ej. en la repisa
//     junto a un hueco de techo o de suelo, en vez de dentro del propio hueco).
// Ida y vuelta = dos puntos que se apuntan entre sí. Se llega con los pies en su fila de abajo.
export class LinkPoint {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.rect = { x: def.x * TILE, y: def.y * TILE, w: (def.w ?? 1) * TILE, h: (def.h ?? 2) * TILE };
    this.t = Math.random() * 6;
    this.visible = def.look !== 'hidden' && !!def.to;
    if (this.visible) {
      this.spr = canvasSprite(game, this.rect.w + 8, this.rect.h + 8, 1);
      this.spr.place(this.rect.x - 4, this.rect.y - 4);
    }
  }

  update(dt) {
    this.t += dt;
    if (this.visible) this.#paint();
  }

  // Un orificio vertical de carne con un núcleo que respira luz (más vivo cuanto más cerca).
  #paint() {
    const { g, gl } = this.spr, W = this.rect.w + 8, H = this.rect.h + 8, p = this.game.player;
    const near = Math.max(0, 1 - Math.hypot(p.cx - (this.rect.x + this.rect.w / 2), p.cy - (this.rect.y + this.rect.h / 2)) / 90);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    g.clearRect(0, 0, W, H); gl.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, rx = W / 2 - 1, ry = H / 2 - 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (d > 1) continue;
      let c;
      if (d > 0.86) c = '#2a0a1a';
      else if (d > 0.7) c = (Math.floor(Math.atan2(y - cy, x - cx) * 5 + this.t * 2) % 2) ? '#8a2a52' : '#6a1a40'; // labios con pliegues
      else if (d > 0.45) c = '#3a0a2a';
      else c = d < 0.2 + pulse * 0.08 ? '#ffd0f0' : '#c050a0';
      g.fillStyle = c; g.fillRect(x, y, 1, 1);
      if (d < 0.5) { gl.fillStyle = `rgba(220,90,200,${(0.25 + near * 0.5) * (1 - d * 1.6)})`; gl.fillRect(x, y, 1, 1); }
    }
    this.spr.commit();
  }

  dispose() { this.spr?.dispose(); }
}

// Dónde se aparece al llegar a un punto (pies en su fila de abajo, columna central).
export function linkArrival(roomDef, linkId) {
  const l = (roomDef?.links ?? []).find((k) => k.id === linkId);
  if (l?.arrive) return [...l.arrive];
  return l ? [l.x + Math.floor(((l.w ?? 1) - 1) / 2), l.y + (l.h ?? 2) - 1] : null;
}
