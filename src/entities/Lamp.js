import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { TILE } from '../core/Physics.js';
import { spriteMesh, canvasTexture } from '../core/Sprites.js';

// Luminaria colgante: un pingajo de carne que cuelga del techo con una bolita
// fluorescente en la punta. Se balancea, la bolita late y da una luz tenue alrededor
// (Game.#lights): se ve y alumbra un poco aunque tu ojo se haya quedado sin luz.
// En data/levels.js: lamps: [[col, fila], [col, fila, largo], ...] — la casilla bajo el
// techo del que cuelga; `largo` en píxeles (por defecto 10).

// Color de la bolita según el bioma.
const BULB = {
  nervioso: '#9affc8', pulmonar: '#c8ff6a', digestivo: '#ffd26a', corazon: '#ff6a7a', oseo: '#ffe0a0',
};
const W = 7;
const K = '#140c10';

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);

function paint(len, bulb) {
  const h = len + 5;
  const cv = document.createElement('canvas'), gc = document.createElement('canvas');
  cv.width = gc.width = W;
  cv.height = gc.height = h;
  const g = cv.getContext('2d'), gl = gc.getContext('2d');
  const px = (ctx, x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  // El pingajo: un hilo de carne con nudos que ondula un poco.
  for (let y = 0; y < len; y++) {
    const x = 3 + (Math.sin(y * 0.9) > 0.6 ? 1 : 0);
    px(g, x, y, y % 4 === 1 ? '#a04a5a' : '#6a2a3a');
    // A oscuras se intuye: el hilo brilla un poco en el color de la bolita, más cerca de ella.
    if (y > len * 0.4) { gl.globalAlpha = 0.15 + 0.35 * (y / len); px(gl, x, y, bulb); gl.globalAlpha = 1; }
    if (y % 4 === 1) px(g, x - 1, y, '#3a1020');
  }
  // La bolita: un saco translúcido con el núcleo que brilla.
  for (const [x, y] of [[2, 0], [3, 0], [4, 0], [1, 1], [5, 1], [1, 2], [5, 2], [2, 3], [3, 3], [4, 3]]) px(g, x, len + y, K);
  for (const [x, y] of [[2, 1], [3, 1], [4, 1], [2, 2], [3, 2], [4, 2]]) { px(g, x, len + y, bulb); px(gl, x, len + y, bulb); }
  px(g, 3, len + 1, '#ffffff');
  px(gl, 3, len + 1, '#ffffff');
  return { cv, gc, h };
}

export class Lamp {
  constructor(game, def, biome) {
    this.game = game;
    const [cx, cy, len = 10] = def;
    this.x = cx * TILE + 8;
    this.y = cy * TILE;            // borde superior de la casilla: el techo
    this.len = len;
    this.t = Math.random() * 6;
    this.color = BULB[biome] ?? BULB.nervioso;
    this.rgb = hex(this.color);
    const { cv, gc, h } = paint(len, this.color);
    // Cuelga de un punto: el grupo gira en el techo y el sprite pende de él.
    this.pivot = new THREE.Group();
    this.glowPivot = new THREE.Group();
    this.mesh = spriteMesh(W, h);
    this.mesh.material.map = canvasTexture(cv);
    this.mesh.renderOrder = 2;
    this.glow = spriteMesh(W, h, { glow: true });
    this.glow.material.map = canvasTexture(gc);
    for (const m of [this.mesh, this.glow]) m.position.set(0, -h / 2, 0);
    this.pivot.add(this.mesh);
    this.glowPivot.add(this.glow);
    for (const p of [this.pivot, this.glowPivot]) p.position.set(this.x, -this.y, 0);
    game.visual.world.add(this.pivot);
    game.visual.glow.add(this.glowPivot);
  }

  // Dónde está la bolita ahora (para la luz).
  get bulb() {
    const a = this.pivot.rotation.z, d = this.len + 2;
    return { x: this.x + Math.sin(a) * d, y: this.y + Math.cos(a) * d };
  }

  update(dt) {
    this.t += dt;
    const a = Math.sin(this.t * 1.3) * 0.12 + Math.sin(this.t * 0.47) * 0.06; // vaivén lento
    this.pivot.rotation.z = this.glowPivot.rotation.z = a;
    this.pulse = 0.75 + 0.25 * Math.sin(this.t * 2.2);
    this.glow.material.opacity = 0.7 + 0.3 * this.pulse;
  }

  // Luz tenue que late (la recoge Game.#lights).
  light() {
    const b = this.bulb, k = 0.6 * this.pulse;
    return { x: b.x, y: b.y, r: 62, color: this.rgb.map((c) => c * k) };
  }

  dispose() {
    this.pivot.removeFromParent();
    this.glowPivot.removeFromParent();
  }
}
