import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { canvasTexture } from '../core/Sprites.js';

// Gore: lo que suelta la carne al romperse.
//   hit()    al recibir un golpe: un chorro de fluido en la dirección del impacto y
//            gotas que manchan el suelo y las paredes (las manchas quedan en la sala).
//   burst()  al morir: revienta en trozos con física (rebotan, ruedan, sangran y se
//            quedan en el suelo un rato), un charco y una lluvia de gotas.
// Los colores salen de `gore` en data/enemies.js: { blood: '#rrggbb', flesh: [...] }.

const GRAVITY = 700;
const MAX_GIBS = 60;
const GIB_LIFE = 14;     // segundos que un trozo sigue en el suelo antes de pudrirse
const DEFAULT = { blood: '#7a0a1a', flesh: ['#7a2a34', '#a8424e', '#4a1418'] };

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

// Un trozo de carne: forma irregular con borde oscuro, brillo húmedo y, a veces,
// una astilla de hueso o un jirón de piel. Se dibuja una vez y se gira con la física.
function gibCanvas(flesh, size, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size + 2;
  const g = c.getContext('2d');
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const cx = (size + 1) / 2, cy = (size + 1) / 2;
  const base = flesh[Math.floor(rnd() * flesh.length)];
  for (let y = 0; y < size + 2; y++) for (let x = 0; x < size + 2; x++) {
    const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy);
    const rad = size / 2 * (0.65 + 0.35 * Math.sin(a * 3 + seed) * Math.cos(a * 2 - seed * 0.7) + 0.2 * rnd());
    if (d > rad + 0.5) continue;
    g.fillStyle = d > rad - 0.8 ? shade(base, 0.45) : rnd() < 0.15 ? shade(base, 1.35) : base;
    g.fillRect(x, y, 1, 1);
  }
  if (rnd() < 0.35) { g.fillStyle = '#e8dcc8'; g.fillRect(Math.floor(cx), Math.floor(cy - 1), 1, Math.max(2, size >> 1)); }
  g.fillStyle = 'rgba(255,230,230,0.8)';
  g.fillRect(Math.floor(cx - 1), Math.floor(cy - 1), 1, 1);
  return c;
}

export class Gore {
  constructor(game) {
    this.game = game;
    this.gibs = [];
    this.decal = null;
    game.particles.onStain = (x, y, color, vx, vy) => this.#splat(x, y, color, 1 + Math.min(2, Math.hypot(vx, vy) / 160), vx, vy);
  }

  // Al entrar en una sala: lienzo de manchas limpio y fuera los trozos de la anterior.
  reset(world) {
    for (const gb of this.gibs) gb.mesh.removeFromParent();
    this.gibs = [];
    this.decalMesh?.removeFromParent();
    this.decalTex?.dispose();
    const c = document.createElement('canvas');
    c.width = world.pixelW;
    c.height = world.pixelH;
    this.decal = c;
    this.dg = c.getContext('2d');
    this.decalTex = canvasTexture(c);
    this.decalMesh = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), new THREE.MeshBasicMaterial({
      map: this.decalTex, transparent: true, depthTest: false, depthWrite: false,
    }));
    this.decalMesh.position.set(c.width / 2, -c.height / 2, 0);
    this.decalMesh.renderOrder = 1.5;
    this.game.visual.world.add(this.decalMesh);
    this.dirty = false;
  }

  // Mancha irregular, más grande cuanto más rápido cae la gota; un reguero si resbala.
  #splat(x, y, color, size, vx = 0, vy = 0) {
    if (!this.dg) return;
    const g = this.dg;
    const n = Math.round(size * 3);
    g.fillStyle = color;
    for (let i = 0; i < n; i++) g.fillRect(Math.round(x + (Math.random() - 0.5) * size * 2), Math.round(y + (Math.random() - 0.5) * size * 1.2), 1, 1);
    g.fillStyle = shade(color, 0.6);
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
    // En una pared, la sangre escurre hacia abajo.
    if (Math.abs(vx) > Math.abs(vy) && Math.random() < 0.6) {
      const len = 2 + Math.floor(Math.random() * 5);
      g.fillStyle = color;
      for (let k = 0; k < len; k++) g.fillRect(Math.round(x), Math.round(y + k), 1, 1);
    }
    this.dirty = true;
  }

  // Arañazo de las Garras: surco oscuro con el borde levantado, que se queda en la pared.
  scratch(x, y) {
    if (!this.dg) return;
    const g = this.dg;
    g.fillStyle = 'rgba(16, 6, 8, 0.5)';
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
    if (Math.random() < 0.35) {
      g.fillStyle = 'rgba(220, 190, 170, 0.18)';
      g.fillRect(Math.round(x), Math.round(y) - 1, 1, 1);
    }
    this.dirty = true;
  }

  // Un golpe: chorro de fluido hacia donde va el impacto, y alguna gota hacia atrás.
  hit(x, y, dir, gore = DEFAULT, amount = 1) {
    const g = this.game, col = hexRgb(gore.blood);
    const n = Math.round(10 * amount);
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 1.2;
      const sp = 60 + Math.random() * 140;
      g.particles.emit(x, y, {
        vx: Math.cos(spread) * sp * dir + (Math.random() - 0.5) * 20,
        vy: -40 - Math.random() * 90 + Math.sin(spread) * 40,
        life: 1.4, gravity: GRAVITY, color: col, stain: gore.blood,
      });
    }
    for (let i = 0; i < 3; i++) {
      g.particles.emit(x, y, { vx: -dir * (20 + Math.random() * 40), vy: -Math.random() * 50, life: 1.2, gravity: GRAVITY, color: col, stain: gore.blood });
    }
    // Una salpicadura fina, casi niebla, que se queda flotando un instante.
    for (let i = 0; i < 4; i++) g.particles.emit(x, y, { vx: dir * Math.random() * 40, vy: -Math.random() * 30, life: 0.3, color: col.map((c) => c * 1.4) });
  }

  // Muerte: revienta en trozos con física, un charco y una lluvia de gotas.
  burst(x, y, w, h, gore = DEFAULT, scale = 1) {
    const g = this.game, col = hexRgb(gore.blood);
    const area = Math.max(60, w * h);
    const chunks = Math.min(16, Math.round((4 + area / 30) * scale));
    for (let i = 0; i < chunks; i++) {
      const size = 3 + Math.floor(Math.random() * Math.min(7, 3 + area / 70));
      this.#gib(x + (Math.random() - 0.5) * w, y + (Math.random() - 0.5) * h, size, gore);
    }
    const drops = Math.min(90, Math.round(30 + area / 6));
    for (let i = 0; i < drops; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4, sp = 50 + Math.random() * 200;
      g.particles.emit(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.6, gravity: GRAVITY, color: col, stain: gore.blood });
    }
    for (let i = 0; i < 6; i++) g.particles.emit(x, y, { vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.35, color: col.map((c) => c * 1.5) });
    // Charco bajo el cuerpo.
    const floorY = this.#floorBelow(x, y);
    if (floorY !== null) for (let i = 0; i < 6; i++) this.#splat(x + (Math.random() - 0.5) * w, floorY - 1, gore.blood, 2 + Math.random() * 2);
  }

  // Despedaza el dibujo real de un cuerpo: cada píxel va al trozo de la "semilla" más
  // cercana (con ruido, para cortes desgarrados) y los bordes del corte quedan en carne
  // viva. x0,y0 = esquina del lienzo en el mundo; flip = si se dibuja reflejado.
  shatter(canvas, x0, y0, flip, gore = DEFAULT, pieces = 6) {
    const w = canvas.width, h = canvas.height;
    const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const opaque = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src[(y * w + x) * 4 + 3] > 0) opaque.push([x, y]);
    if (opaque.length < 8) return;
    const seeds = Array.from({ length: pieces }, () => opaque[Math.floor(Math.random() * opaque.length)]);
    const owner = new Int16Array(w * h).fill(-1);
    for (const [x, y] of opaque) {
      let best = 0, bd = Infinity;
      seeds.forEach(([sx, sy], i) => {
        const d = (x - sx) ** 2 + (y - sy) ** 2 + Math.random() * 6;
        if (d < bd) { bd = d; best = i; }
      });
      owner[y * w + x] = best;
    }
    const cx = w / 2, cy = h / 2, raw = gore.blood ?? DEFAULT.blood;
    seeds.forEach(([sx, sy], i) => {
      let x0p = w, y0p = h, x1p = -1, y1p = -1;
      for (const [x, y] of opaque) if (owner[y * w + x] === i) { x0p = Math.min(x0p, x); y0p = Math.min(y0p, y); x1p = Math.max(x1p, x); y1p = Math.max(y1p, y); }
      if (x1p < 0) return;
      const pw = x1p - x0p + 1, ph = y1p - y0p + 1;
      const c = document.createElement('canvas');
      c.width = pw;
      c.height = ph;
      const g = c.getContext('2d'), img = g.createImageData(pw, ph);
      for (let y = y0p; y <= y1p; y++) for (let x = x0p; x <= x1p; x++) {
        if (owner[y * w + x] !== i) continue;
        const k = ((y - y0p) * pw + (x - x0p)) * 4, s4 = (y * w + x) * 4;
        // Borde del corte: carne viva.
        const cut = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const o = owner[(y + dy) * w + (x + dx)];
          return x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && o !== -1 && o !== i;
        });
        if (cut) {
          const n = parseInt(raw.slice(1), 16);
          img.data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], k);
        } else img.data.set([src[s4], src[s4 + 1], src[s4 + 2], 255], k);
      }
      g.putImageData(img, 0, 0);
      // Si el cuerpo se dibujaba reflejado, el trozo también.
      let pc = c;
      if (flip) {
        pc = document.createElement('canvas');
        pc.width = pw;
        pc.height = ph;
        const pg = pc.getContext('2d');
        pg.translate(pw, 0);
        pg.scale(-1, 1);
        pg.drawImage(c, 0, 0);
      }
      const lx = flip ? w - (x0p + pw / 2) : x0p + pw / 2, ly = y0p + ph / 2;
      const dx = lx - cx, dy = ly - cy, d = Math.hypot(dx, dy) || 1;
      const sp = 80 + Math.random() * 120;
      this.#gib(x0 + lx, y0 + ly, Math.max(pw, ph) / 2, gore, pc, [(dx / d) * sp + (Math.random() - 0.5) * 60, -140 - Math.random() * 160 + (dy / d) * 40]);
    });
  }

  #floorBelow(x, y) {
    const w = this.game.world;
    for (let yy = y; yy < y + 64; yy += 2) if (w.solidAtPx(x, yy)) return Math.floor(yy / 16) * 16;
    return null;
  }

  #gib(x, y, size, gore, canvas = null, vel = null) {
    if (this.gibs.length >= MAX_GIBS) this.gibs.shift().mesh.removeFromParent();
    const c = canvas ?? gibCanvas(gore.flesh ?? DEFAULT.flesh, size, Math.floor(Math.random() * 1e5));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), new THREE.MeshBasicMaterial({
      map: canvasTexture(c), transparent: true, alphaTest: 0.5, depthTest: false, depthWrite: false,
    }));
    mesh.renderOrder = 2;
    this.game.visual.world.add(mesh);
    const a = Math.random() * Math.PI * 2;
    this.gibs.push({
      mesh, x, y, size: Math.min(8, size),
      vx: vel ? vel[0] : Math.cos(a) * (60 + Math.random() * 140), vy: vel ? vel[1] : -120 - Math.random() * 200,
      spin: (Math.random() - 0.5) * 18, rot: 0, life: GIB_LIFE + Math.random() * 4,
      blood: gore.blood, bleed: 1.5 + Math.random(), rest: false,
    });
  }

  update(dt) {
    const w = this.game.world;
    for (const gb of this.gibs) {
      gb.life -= dt;
      if (!gb.rest) {
        gb.vy += GRAVITY * dt;
        const nx = gb.x + gb.vx * dt;
        if (w.solidAtPx(nx, gb.y)) { gb.vx *= -0.35; gb.spin *= 0.6; this.#splat(gb.x, gb.y, gb.blood, 1.5, gb.vx, 0); }
        else gb.x = nx;
        const ny = gb.y + gb.vy * dt;
        if (w.solidAtPx(gb.x, ny + gb.size / 2)) {
          // Rebota cada vez menos, rueda con rozamiento y se queda quieto.
          if (Math.abs(gb.vy) > 60) {
            this.#splat(gb.x, ny + gb.size / 2 - 1, gb.blood, 1.5 + gb.size * 0.3, 0, gb.vy);
            if (Math.abs(gb.vy) > 140) this.game.audio.play('splat', gb);
          }
          gb.vy *= -0.3;
          gb.vx *= 0.7;
          gb.spin = gb.vx / Math.max(2, gb.size);
          if (Math.abs(gb.vy) < 25 && Math.abs(gb.vx) < 8) { gb.rest = true; gb.vx = gb.vy = 0; }
        } else if (w.solidAtPx(gb.x, ny - gb.size / 2)) {
          gb.vy = Math.abs(gb.vy) * 0.3;
        } else {
          gb.y = ny;
        }
        gb.rot += gb.spin * dt;
        // Va dejando un reguero mientras vuela.
        gb.bleed -= dt;
        if (gb.bleed > 0 && Math.random() < 0.35) {
          this.game.particles.emit(gb.x, gb.y, { vx: gb.vx * 0.2, vy: gb.vy * 0.2, life: 1, gravity: GRAVITY, color: hexRgb(gb.blood), stain: gb.blood });
        }
      }
      // Giro en pasos de 90º: el pixel art no se emborrona.
      gb.mesh.rotation.z = Math.round(gb.rot / (Math.PI / 2)) * (Math.PI / 2);
      gb.mesh.position.set(Math.round(gb.x), -Math.round(gb.y), 0);
      if (gb.life < 2) gb.mesh.material.opacity = Math.max(0, gb.life / 2);
    }
    const dead = this.gibs.filter((gb) => gb.life <= 0);
    for (const gb of dead) { gb.mesh.removeFromParent(); gb.mesh.material.map.dispose(); }
    if (dead.length) this.gibs = this.gibs.filter((gb) => gb.life > 0);
    if (this.dirty) { this.decalTex.needsUpdate = true; this.dirty = false; }
  }
}
