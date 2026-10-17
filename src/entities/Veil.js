import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { TILE, overlap } from '../core/Physics.js';
import { canvasTexture } from '../core/Sprites.js';

// Velo de membrana (casilla 'G'): una capa de tejido translúcido, sin colisión, que se
// dibuja por DELANTE de todo (jugador, criaturas, partículas). Sirve para rellenar zonas
// con una cortina de carne fina a través de la que se ve lo que pasa detrás. Cada mancha
// conectada es una pieza: el tono de su bioma, venas, un borde más denso, motas húmedas
// y una respiración lenta. Si te metes dentro, se aclara para que no te pierdas.

const ORDER = 7;                // por encima de criaturas (2-3), proyectiles (5) y partículas (6)

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Dos fotogramas del grupo (la membrana se tensa y se relaja).
function paintVeil(cells, tint, seed) {
  const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const W = (Math.max(...xs) - minX + 1) * TILE, H = (Math.max(...ys) - minY + 1) * TILE;
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const inside = (px, py) => set.has(`${minX + Math.floor(px / TILE)},${minY + Math.floor(py / TILE)}`);
  // Distancia (px, hasta 6) al borde del grupo: el borde es más denso y oscuro.
  const edgeD = (px, py) => {
    for (let d = 1; d <= 6; d++) if (!inside(px - d, py) || !inside(px + d, py) || !inside(px, py - d) || !inside(px, py + d)) return d;
    return 7;
  };
  const [tr, tg, tb] = hex(tint);
  const frames = [0, 1].map((f) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const r = rng(seed + f * 7);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const e = edgeD(x, y);
      // Borde ondulado: la membrana no acaba en la línea de la casilla, se deshilacha.
      const rag = 1.5 + 1.5 * Math.sin(x * 0.31 + y * 0.17) + Math.sin(x * 0.07 - y * 0.23 + f * 0.6);
      if (e <= rag) continue;
      const er = e - rag;
      // Ondas suaves de grosor (se desplazan entre fotogramas).
      const n = Math.sin(x * 0.11 + y * 0.05 + f * 1.4) * 0.5 + Math.sin(y * 0.17 - x * 0.07 + f * 0.9) * 0.5;
      let a = 0.4 + n * 0.08 + (er < 3 ? (3 - er) * 0.12 : 0);
      let k = 0.85 + n * 0.14 - (er < 1.5 ? 0.3 : 0);         // brillo (el filo, más oscuro)
      if (r() < 0.004) { k = 1.5; a += 0.25; }                 // mota húmeda
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, tr * k); d[i + 1] = Math.min(255, tg * k); d[i + 2] = Math.min(255, tb * k);
      d[i + 3] = Math.round(Math.min(0.85, a) * 255);
    }
    g.putImageData(img, 0, 0);
    // Venas finas que serpentean por la membrana.
    const vr = rng(seed + 99);
    const n = Math.max(2, Math.round((W * H) / 900));
    for (let v = 0; v < n; v++) {
      let x = vr() * W, y = vr() * H, ang = vr() * Math.PI * 2;
      const L = 20 + vr() * 50;
      g.fillStyle = `rgba(${Math.round(tr * 0.55)},${Math.round(tg * 0.25)},${Math.round(tb * 0.3)},0.8)`;
      for (let s = 0; s < L; s++) {
        ang += (vr() - 0.5) * 0.45; x += Math.cos(ang); y += Math.sin(ang);
        if (!inside(x, y)) break;
        g.fillRect(Math.round(x + (f ? Math.sin(s * 0.3) * 0.5 : 0)), Math.round(y), 1, 1);
      }
    }
    return c;
  });
  return { frames, x: minX * TILE, y: minY * TILE, w: W, h: H };
}

export class Veil {
  constructor(game, room, cells, i) {
    this.game = game;
    this.cells = cells;
    // Tono: una carne pálida teñida del color de su bioma.
    const base = hex(room.biome?.mapColor ?? '#b0283a');
    const tint = '#' + base.map((v, i) => Math.round(v * 0.7 + [240, 170, 190][i] * 0.3).toString(16).padStart(2, '0')).join('');
    const p = paintVeil(cells, tint, (cells[0][0] * 31 + cells[0][1] * 17 + i) | 0);
    this.box = { x: p.x, y: p.y, w: p.w, h: p.h };
    this.texs = p.frames.map((c) => canvasTexture(c));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({
      map: this.texs[0], transparent: true, depthTest: false, depthWrite: false, opacity: 1,
    }));
    this.mesh.position.set(p.x + p.w / 2, -(p.y + p.h / 2), 0);
    this.mesh.renderOrder = ORDER;
    game.visual.world.add(this.mesh);
    this.t = Math.random() * 5;
    this.k = 1;
  }

  update(dt) {
    this.t += dt;
    const p = this.game.player;
    // ¿Estás dentro? Entonces se aclara (sin desaparecer).
    const inside = overlap(p, this.box) && this.cells.some(([cx, cy]) => overlap(p, { x: cx * TILE, y: cy * TILE, w: TILE, h: TILE }));
    this.k += ((inside ? 0.6 : 1) - this.k) * Math.min(1, dt * 4);
    this.mesh.material.map = this.texs[Math.floor(this.t * 0.9) % 2];
    this.mesh.material.opacity = this.k * (0.88 + 0.12 * Math.sin(this.t * 1.3));
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    for (const t of this.texs) t.dispose();
  }
}

// Agrupa las casillas 'G' en manchas conectadas (4 vecinos).
export function veilGroups(cellsSet) {
  const seen = new Set(), groups = [];
  for (const k of cellsSet) {
    if (seen.has(k)) continue;
    const q = [k], cells = [];
    seen.add(k);
    while (q.length) {
      const c = q.pop(), [x, y] = c.split(',').map(Number);
      cells.push([x, y]);
      for (const n of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) if (cellsSet.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    groups.push(cells);
  }
  return groups;
}
