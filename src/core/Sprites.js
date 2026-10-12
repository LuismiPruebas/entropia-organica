import * as THREE from 'three';
import { PALETTE, SPRITES } from '../data/sprites.js';

// Convierte el pixel art indexado en texturas (color + brillo), con caché.
//   opts.palette  sobrescribe colores    opts.overlay  [[x, y, char], ...]
//   opts.tint     'camo' | 'flash'       opts.key      clave de caché de la variante
const cache = new Map();

export function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tintColor([r, g, b], tint) {
  if (tint === 'flash') return [255, 255, 255];
  if (tint === 'camo') {
    // Se funde con la carne del fondo: un tono hondo violáceo con un rastro del color original.
    return [Math.round(40 + r * 0.15), Math.round(20 + g * 0.1), Math.round(46 + b * 0.12)];
  }
  return [r, g, b];
}

export function getSprite(id, frame, opts = {}) {
  const key = `${id}|${frame}|${opts.key ?? ''}|${opts.tint ?? ''}`;
  let s = cache.get(key);
  if (s) return s;

  const def = SPRITES[id];
  const rows = (def.frames[frame] ?? Object.values(def.frames)[0]).map((r) => r.split(''));
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  for (const [x, y, c] of opts.overlay ?? []) if (rows[y]) rows[y][x] = c;

  const pal = { ...PALETTE, ...(opts.palette ?? {}) };
  const glowChars = def.glow ?? '';
  const color = document.createElement('canvas');
  const glow = document.createElement('canvas');
  color.width = glow.width = w;
  color.height = glow.height = h;
  const cc = color.getContext('2d');
  const gc = glow.getContext('2d');
  const ci = cc.createImageData(w, h);
  const gi = gc.createImageData(w, h);
  let hasGlow = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (!ch || ch === '.' || !pal[ch]) continue;
      const rgb = tintColor(hexToRgb(pal[ch]), opts.tint);
      const i = (y * w + x) * 4;
      ci.data.set([...rgb, 255], i);
      if (glowChars.includes(ch) && opts.tint !== 'camo') {
        gi.data.set([...hexToRgb(pal[ch]), 255], i);
        hasGlow = true;
      }
    }
  }
  cc.putImageData(ci, 0, 0);
  gc.putImageData(gi, 0, 0);

  s = { w, h, tex: canvasTexture(color), glowTex: hasGlow ? canvasTexture(glow) : null };
  cache.set(key, s);
  return s;
}

// Plano centrado con material de sprite (mundo iluminado) o de brillo (aditivo).
export function spriteMesh(w, h, { glow = false, color } = {}) {
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    alphaTest: glow ? 0 : 0.5,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  if (color !== undefined) mat.color.set(color);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return mesh;
}

// Cambia la textura de un sprite (recompila el material solo si pasa de/a null).
export function setMap(mesh, tex) {
  const m = mesh.material;
  if (m.map === tex) return;
  if (!m.map !== !tex) m.needsUpdate = true;
  m.map = tex;
}

// Coloca un mesh centrado a partir de una caja en coordenadas de juego (Y abajo).
export function placeMesh(mesh, x, y, w, h) {
  mesh.position.set(Math.round(x) + w / 2, -(Math.round(y) + h / 2), 0);
}
