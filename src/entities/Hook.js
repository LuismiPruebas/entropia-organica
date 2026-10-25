import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { spriteMesh, canvasTexture } from '../core/Sprites.js';

// Garfio de anclaje (casilla 'o'), visto de frente: una columna de vértebras que cuelga de
// un nudo de carne y acaba en una garra de hueso en media luna, con las dos puntas
// curvadas hacia dentro. Es donde se engancha el Tendón para columpiarse.
//   · la columna ondula despacio como una espina viva;
//   · cada pocos segundos una luz baja por la médula y la garra destella (llama la vista);
//   · cuando el Tendón lo cogería (Player.hookTarget) la garra se abre, la médula late
//     deprisa y un halo la marca: se sabe a cuál te vas a enganchar antes de pulsar;
//   · enganchado, la columna se tensa y se dobla hacia ti.
// El punto de agarre (x, y) es el centro de la casilla: el centro de la garra.

const W = 26, H = 36;          // lienzo
const GRIP = 27;               // altura del punto de agarre en el lienzo (centro de la garra)
const N = 4;                   // vértebras
const C = {
  out: '#140c10', bone: '#e6dac0', boneL: '#fff6e0', boneD: '#a89676', boneDD: '#6e5c46',
  flesh: '#8a3a4a', fleshL: '#c86a7a', fleshD: '#4a1424', cord: '#5a1a2a',
  glow: '#ff9a7a', glowHot: '#ffe0c0',
};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGB = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, hex(v)]));

export class Hook {
  constructor(game, anchor) {
    this.game = game;
    this.anchor = anchor;                 // { x, y } (Room.anchors): el punto de agarre
    this.t = Math.random() * 6;
    this.flare = 1 + Math.random() * 2.5; // segundos hasta el próximo destello
    this.flareK = 0;                      // 0..1: la luz bajando por la médula
    this.open = 0;                        // garra abierta (a tiro)
    this.bend = 0;                        // tirón hacia el jugador (enganchado)
    this.frame = 0;
    this.cv = document.createElement('canvas'); this.cv.width = W; this.cv.height = H;
    this.gcv = document.createElement('canvas'); this.gcv.width = W; this.gcv.height = H;
    this.g = this.cv.getContext('2d'); this.gl = this.gcv.getContext('2d');
    this.tex = canvasTexture(this.cv); this.gtex = canvasTexture(this.gcv);
    const cx = anchor.x, cy = -(anchor.y - GRIP + H / 2);
    this.mesh = spriteMesh(W, H);
    this.mesh.material.map = this.tex;
    this.mesh.position.set(cx, cy, 0);
    this.mesh.renderOrder = 2;
    this.glow = spriteMesh(W, H, { glow: true });
    this.glow.material.map = this.gtex;
    this.glow.position.set(cx, cy, 0);
    // Halo de "lo tienes a tiro": un anillo que late alrededor de la garra.
    this.halo = new THREE.Mesh(new THREE.RingGeometry(7, 9, 24), new THREE.MeshBasicMaterial({
      color: 0xffb0a0, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.halo.renderOrder = 3;
    this.halo.position.set(anchor.x, -anchor.y, 0);
    game.visual.world.add(this.mesh);
    game.visual.glow.add(this.glow, this.halo);
    this.#draw();
  }

  update(dt) {
    this.t += dt;
    const g = this.game, p = g.player, r = p.rope;
    const held = r && r.x === this.anchor.x && r.y === this.anchor.y;
    const target = p.hookTarget === this.anchor && !held;
    this.open += ((target ? 1 : 0) - this.open) * Math.min(1, dt * 8);
    const want = held ? Math.max(-1, Math.min(1, (p.cx - this.anchor.x) / 60)) : 0;
    this.bend += (want - this.bend) * Math.min(1, dt * (held ? 10 : 4));
    // Destello: una luz baja por la médula hasta la garra (más a menudo si está a tiro).
    this.flare -= dt * (target ? 2.5 : 1);
    if (this.flare <= 0 && this.flareK <= 0) { this.flareK = 0.001; this.flare = 2.6 + Math.random() * 1.8; }
    if (this.flareK > 0) {
      this.flareK += dt / 0.7;
      if (this.flareK >= 1) {
        this.flareK = 0;
        // Al llegar a la garra: un chispazo de motas.
        for (let i = 0; i < 3; i++) g.glowParticles.emit(this.anchor.x + (Math.random() - 0.5) * 8, this.anchor.y + 2, { vx: (Math.random() - 0.5) * 30, vy: 10 + Math.random() * 20, life: 0.6, color: [1, 0.6, 0.45] });
      }
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 7);
    this.halo.material.opacity = target ? 0.3 + pulse * 0.4 : 0;
    const s = target ? 1 + pulse * 0.12 : 1;
    this.halo.scale.set(s, s, 1);
    if ((this.frame++ & 1) === 0) this.#draw(held);
  }

  #draw(held = false) {
    const { g, gl } = this, t = this.t;
    const im = g.createImageData(W, H), d = im.data;
    const gim = gl.createImageData(W, H), gd = gim.data;
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4, k = RGB[c]; d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = 255; };
    const glo = (x, y, c, a = 255) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4, k = RGB[c]; gd[i] = k[0]; gd[i + 1] = k[1]; gd[i + 2] = k[2]; gd[i + 3] = a; };
    const blob = (cx, cy, rx, ry, fill, edge = 'out') => {
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (q <= 1) set(x, y, typeof fill === 'function' ? fill(x - cx, y - cy) : fill);
        else if (q <= 1.45 && edge) set(x, y, edge);
      }
    };
    const mid = W / 2 - 0.5;
    // Columna: cada vértebra se desplaza un poco (ondula como una espina, y se dobla hacia
    // ti cuando tiras de ella).
    const sway = (i) => {
      const u = i / N;
      return Math.sin(t * 1.7 - i * 0.9) * 1.3 * u + Math.sin(t * 0.6 + i) * 0.5 * u + this.bend * 5 * u * u;
    };
    // Nudo de carne del que cuelga, con raicillas a los lados.
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) set(mid + s * (4 + k), 2 + k * 0.6 + Math.sin(t * 2 + k) * 0.4, k % 2 ? 'fleshD' : 'flesh');
    blob(mid, 3, 4.2, 2.6, (x, y) => (y < -1 ? 'fleshL' : x > 1.5 ? 'fleshD' : 'flesh'));
    // Vértebras (de arriba abajo), con la médula por dentro.
    const vy = (i) => 8 + i * 4.6;
    const flareAt = this.flareK > 0 ? this.flareK * (N + 1) : -9;   // por qué vértebra va la luz
    for (let i = 0; i < N; i++) {
      const x = mid + sway(i), y = vy(i), w = 3.6 - i * 0.35;
      // Apófisis transversas: alas de hueso que salen a los lados, inclinadas hacia abajo.
      for (const s of [-1, 1]) {
        const len = 3 + (i % 2) + this.open * 1.5;
        for (let k = 0; k <= len; k++) { set(x + s * (w + k), y + k * 0.5, 'out'); set(x + s * (w + k), y - 1 + k * 0.5, k > len - 1 ? 'boneL' : 'boneD'); }
      }
      // Cuerpo vertebral, sombreado como un cilindro visto de frente.
      blob(x, y, w, 1.9, (dx, dy) => (dx < -w * 0.4 && dy < 0.5 ? 'boneL' : dx > w * 0.45 ? 'boneD' : dy > 1 ? 'boneD' : 'bone'));
      set(x, y - 2.3, 'boneL');                                       // apófisis espinosa
      // Disco entre vértebras: carne oscura.
      if (i < N - 1) { set(x - 1, y + 2.6, 'fleshD'); set(x, y + 2.6, 'flesh'); set(x + 1, y + 2.6, 'fleshD'); }
      // Médula: brilla un poco siempre; cuando pasa la luz, a fuego.
      const hot = Math.max(0, 1 - Math.abs(flareAt - i) * 1.4);
      const base = 120 + 60 * this.open + 60 * Math.max(0, Math.sin(t * (2 + this.open * 6) - i * 0.8));
      glo(x, y, hot > 0.3 ? 'glowHot' : 'glow', Math.min(255, base + hot * 200));
      if (hot > 0.5) { glo(x - 1, y, 'glow', 160 * hot); glo(x + 1, y, 'glow', 160 * hot); }
    }
    // Garra frontal en forma de ancla: la columna baja por el centro hasta el fondo y dos
    // brazos de hueso curvos suben a los lados, abiertos por arriba, con púas hacia fuera en
    // las puntas (como las de una espina). A tiro, los brazos se abren.
    const gx = mid + sway(N), gy = GRIP;
    const R1 = 6.6, R0 = 4.2, gap = 1.15 + this.open * 0.3;          // medio ángulo de la abertura (rad)
    const sx0 = mid + sway(N - 1), sy0 = vy(N - 1) + 2, sy1 = gy + R1 - 1;
    for (let y = sy0; y <= sy1; y++) {
      const x = sx0 + (gx - sx0) * ((y - sy0) / (sy1 - sy0));
      set(x - 1.5, y, 'out'); set(x + 1.5, y, 'out'); set(x - 0.5, y, 'boneL'); set(x + 0.5, y, 'boneD');
    }
    for (let y = Math.floor(gy - R1 - 2); y <= gy + R1 + 1; y++) for (let x = Math.floor(gx - R1 - 2); x <= gx + R1 + 2; x++) {
      const dx = x - gx, dy = y - gy, r = Math.hypot(dx, dy);
      if (Math.abs(Math.atan2(dx, -dy)) < gap) continue;                 // 0 = arriba
      if (r <= R1 && r >= R0) {
        const lit = -dx * 0.12 - dy * 0.1;
        set(x, y, r > R1 - 0.9 || r < R0 + 0.6 ? 'out' : lit > 0.3 ? 'boneL' : lit < -0.35 ? 'boneD' : 'bone');
      }
    }
    // Púas de las puntas: salen hacia fuera y arriba, curvadas.
    for (const s of [-1, 1]) {
      const a = s * gap, bx = gx + Math.sin(a) * (R0 + R1) / 2, by = gy - Math.cos(a) * (R0 + R1) / 2;
      const tip = [[0, -0.5], [s * 0.8, -1.6], [s * 1.8, -2.2], [s * 2.8, -2]];
      for (const [ox, oy] of tip) for (const [qx, qy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) set(bx + ox + qx, by + oy + qy, 'out');
      tip.forEach(([ox, oy], k) => set(bx + ox, by + oy, k > 1 ? 'boneL' : 'bone'));
      glo(bx + s * 2.8, by - 2, 'glowHot', 150 + 105 * this.open);
    }
    // Corazón de la garra (donde se agarra el Tendón): late; el destello lo enciende.
    const beat = 0.5 + 0.5 * Math.sin(t * (2.2 + this.open * 6));
    const flash = this.flareK > 0.8 ? (this.flareK - 0.8) / 0.2 : 0;
    const a0 = Math.min(255, 130 + beat * 90 + this.open * 60 + flash * 255);
    // Aura de la garra: un resplandor suave que late (se ve aunque la sala esté a oscuras).
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const q = Math.hypot(x, y); if (q > 3 && q <= 9) glo(gx + x, gy + y, 'glow', (30 + 40 * beat + 60 * this.open + 120 * flash) * (1 - q / 9)); }
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) { const q = x * x + y * y; if (q <= 4) glo(gx + x, gy + y, q <= 1 ? 'glowHot' : 'glow', a0 * (q <= 1 ? 1 : 0.55)); }
    if (flash > 0) for (let y = -R1; y <= R1; y++) for (let x = -R1; x <= R1; x++) { const r = Math.hypot(x, y); if (r >= R0 && r <= R1 && Math.abs(Math.atan2(x, -y)) >= gap) glo(gx + x, gy + y, 'glowHot', 220 * flash); }
    if (held) for (let i = 0; i < N; i++) glo(mid + sway(i), vy(i), 'glowHot', 220);
    g.putImageData(im, 0, 0);
    gl.putImageData(gim, 0, 0);
    this.tex.needsUpdate = true;
    this.gtex.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent(); this.glow.removeFromParent(); this.halo.removeFromParent();
    this.tex.dispose(); this.gtex.dispose();
  }
}
