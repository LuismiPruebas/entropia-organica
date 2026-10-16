// Miniaturas de los enemigos para el editor (panel Bestiario, enemigos en el lienzo y el
// fantasma al colocar): cada criatura se dibuja como en tools/bestiary.html, con una
// entidad de mentira en reposo, y se recorta a su contenido. Se guardan en caché.
import { CREATURES } from '../entities/Creatures.js';
import { ENEMIES } from '../data/enemies.js';

const cache = new Map();

function fakeEntity(id, def) {
  const e = {
    type: id, def, x: 0, y: 0, w: def.w, h: def.h, vx: 0, vy: 0, dir: 1, t: 1.3, seed: 2.3,
    hp: def.hp, armored: !!def.armored, exposed: true, armed: false, swing: 0,
    frame: 'open', phase: 'shake', home: 0, dropLen: 40, onGround: true,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
  };
  if (def.behavior === 'pod') { e.dropLen = 26; e.y = 10; }
  if (def.behavior === 'bossGland') Object.assign(e, { ceilY: 0, home: { x: 0, y: 22 }, y: 26, mouthOpen: 0.25, swell: 0.2, lash: 0, face: 1, exposed: false, gs: 'idle' });
  if (def.behavior === 'centaur') Object.assign(e, { state: 'walk' });
  if (def.behavior === 'rhino') Object.assign(e, { state: 'walk' });
  if (def.behavior === 'bossMoth') Object.assign(e, { pose: 'fly', rot: 0, face: 1, glowK: 0 });
  if (def.behavior === 'bossToad') Object.assign(e, { state: 'sit' });
  return e;
}

// { canvas, w, h } de la criatura recortada (sin escalar), o null si no tiene dibujo.
export function enemyThumb(id) {
  if (cache.has(id)) return cache.get(id);
  const def = ENEMIES[id], cr = CREATURES[def?.creature];
  let out = null;
  try {
    if (cr) {
      const e = fakeEntity(id, def);
      const [W, H] = cr.size(e);
      const c = document.createElement('canvas'), gc = document.createElement('canvas');
      c.width = gc.width = W; c.height = gc.height = H;
      cr.draw(c.getContext('2d'), gc.getContext('2d'), e, 1.3, { time: 1.3, player: { cx: e.cx + 80, cy: e.cy + 10 } });
      // Brillo encima (ojos, núcleos) y recorte al contenido.
      const g = c.getContext('2d');
      g.globalCompositeOperation = 'lighter'; g.drawImage(gc, 0, 0); g.globalCompositeOperation = 'source-over';
      const px = g.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= x0) {
        const w = x1 - x0 + 1, h = y1 - y0 + 1, t = document.createElement('canvas');
        t.width = w; t.height = h;
        t.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
        out = { canvas: t, w, h };
      }
    }
  } catch (err) { console.warn('miniatura de', id, err); }
  cache.set(id, out);
  return out;
}
