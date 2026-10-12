import { spriteMesh, placeMesh, canvasTexture } from '../core/Sprites.js';
import { TILE } from '../core/Physics.js';
import { px, seg, part, OUTLINE } from './Rig.js';

// Nódulos: protuberancias orgánicas pegadas al suelo que han ido calcificando
// restos de hueso. Viven a oscuras: solo se ven bajo el haz del ojo (Game.#reveal sube
// `reveal`) y solo revientan si los pisas (o embistes) mientras están iluminados.
// Sueltan hueso y, a veces, algo más. Vuelven a crecer al descansar en un Nodo.
// Cada bioma tiene la suya (ver NODULES). En data/levels.js: nodules: [[col, fila], ...]
// Con un tercer valor 'luz' es un nódulo lumínico: un fotóforo que brilla un poco a
// oscuras (se intuye sin el ojo) y suelta una célula de luz, a veces también hueso.

const W = 20, H = 16;
const SWELL = 0.22; // segundos que tarda en reventar tras pisarla

// Qué suelta, por bioma: [tipo, probabilidad, cantidad].
const LOOT = {
  nervioso: [['battery', 0.25], ['biomass', 0.3, 4]],
  pulmonar: [['battery', 0.3], ['biomass', 0.35, 4]],
  digestivo: [['scrap', 0.45], ['biomass', 0.3, 5]],
  corazon: [['biomass', 0.6, 6]],
  oseo: [['scrap', 0.5], ['biomass', 0.25, 4]],
};

// Dibujo de cada bioma. k = hinchazón (0..1); t = tiempo. Siempre asoman esquirlas
// de hueso: es lo que avisa de que hay hueso dentro.
const NODULES = {
  // Bulbo ganglionar: racimo de vesículas violetas con una chispa dentro.
  nervioso(g, gl, k, t) {
    for (let i = 0; i < 4; i++) seg(g, 10, 14, 4 + i * 4, 16, '#2a1838'); // raíces
    for (const [x, y, r] of [[6, 11, 3.5], [14, 11, 3.2], [10, 8, 4.5]]) {
      part(g, x, y, r * (1 + k * 0.35), r * (1 + k * 0.35), '#5a3a7a', '#2a1838', '#a888d0');
    }
    px(g, 9, 8, '#e8dcc8'); px(g, 12, 10, '#b8a888'); px(g, 6, 11, '#e8dcc8'); // esquirlas de hueso
    const on = Math.sin(t * 7) > 0.3 || k > 0;
    px(gl, 10, 7, on ? '#ffd25a' : '#5a4a2a', 2, 2);
  },
  // Ampolla alveolar: ampolla esponjosa con poros, que respira.
  pulmonar(g, gl, k, t) {
    const br = 1 + Math.sin(t * 1.6) * 0.08 + k * 0.4;
    for (let i = 0; i < 3; i++) seg(g, 10, 14, 5 + i * 5, 16, '#3a4410');
    part(g, 10, 10, 7 * br, 5 * br, '#8a9a3a', '#3a4410', '#d8e080');
    for (const [x, y] of [[7, 9], [12, 8], [10, 12], [14, 11], [6, 12]]) px(g, x, y, '#3a4410');
    px(g, 9, 10, '#e8dcc8'); px(g, 13, 10, '#b8a888'); // esquirlas de hueso
    if (k > 0) px(gl, 10, 10, '#d8d070', 2, 2);
  },
  // Quiste calcificado: carne erizada de esquirlas de hueso, rezumando.
  digestivo(g, gl, k, t) {
    part(g, 10, 11, 7.5 * (1 + k * 0.3), 4.5 * (1 + k * 0.3), '#7a3a2a', '#3a1810', '#b0603a');
    for (const [x, y, dx, dy] of [[5, 9, -2, -3], [9, 7, 0, -4], [13, 8, 2, -3], [16, 11, 3, -1]]) {
      seg(g, x, y, x + dx, y + dy, OUTLINE, 2);
      seg(g, x, y, x + dx, y + dy, '#c8b898');
      px(g, x + dx, y + dy, '#f4ecd8');
    }
    px(g, 8, 11, '#d8ccb0', 2, 1); px(g, 12, 12, '#d8ccb0', 2, 1); // nudos de hueso
    const drip = (t * 6) % 4;
    px(g, 11, 15 + drip * 0.2, '#9be06a');
    px(gl, 11, 15, '#5aff4a');
  },
  // Excrecencia de hueso: una bola de hueso poroso con tuétano rojo asomando.
  oseo(g, gl, k, t) {
    for (let i = 0; i < 3; i++) seg(g, 10, 14, 5 + i * 5, 16, '#3a2418');
    part(g, 10, 10.5, 7 * (1 + k * 0.3), 5 * (1 + k * 0.3), '#c8b090', '#6a5038', '#f0e6d0');
    for (const [x, y] of [[7, 9], [12, 8], [10, 12], [14, 11]]) px(g, x, y, '#5a1a14');
    px(g, 9, 10, '#a02a1c', 2, 1);
    seg(g, 15, 8, 18, 5, OUTLINE, 2); px(g, 18, 5, '#f4ecd8');
    if (k > 0 || Math.sin(t * 2) > 0.7) px(gl, 10, 10, '#ff6a4a');
  },
  // Coágulo: ampolla de sangre negra con venas que laten al ritmo del corazón.
  corazon(g, gl, k, t) {
    const beat = Math.max(0, Math.sin(t * 6)) * 0.12 + k * 0.4;
    part(g, 10, 10, 6.5 * (1 + beat), 5 * (1 + beat), '#5a0e18', '#2a0408', '#a8303a');
    for (const [x0, y0, x1, y1] of [[5, 10, 9, 7], [15, 10, 11, 13], [10, 6, 12, 10]]) seg(g, x0, y0, x1, y1, '#c0283a');
    px(g, 8, 11, '#c8c8d0'); px(g, 13, 9, '#9a9aa2');
    px(gl, 10, 10, beat > 0.08 ? '#ff3a4a' : '#5a1018');
  },
};

// Nódulo lumínico: un fotóforo de carne translúcida con un núcleo de luz que late.
function luxNodule(g, gl, k, t) {
  const p = 0.5 + 0.5 * Math.sin(t * 2.2);
  for (let i = 0; i < 3; i++) seg(g, 10, 14, 5 + i * 5, 16, '#2a2010');
  part(g, 10, 10, 6.5 * (1 + k * 0.35), 5.5 * (1 + k * 0.35), '#6a5a2a', '#2a2010', '#d8c070');
  part(g, 10, 10, 3.2 + k, 3 + k, '#ffe080', '#c09020', '#fffbe0');
  px(g, 6, 8, '#e8dcc8'); px(g, 14, 12, '#b8a888'); // esquirlas de hueso
  px(gl, 9, 9, `rgba(255,230,120,${0.45 + p * 0.45})`, 3, 3);
  px(gl, 8, 10, `rgba(255,210,80,${0.2 + p * 0.25})`, 5, 2);
}

export class Nodule {
  constructor(game, [tx, ty], biome, key, kind) {
    this.game = game;
    this.biome = NODULES[biome] ? biome : 'nervioso';
    this.lux = kind === 'luz';
    this.key = key;
    this.w = 14;
    this.h = 10;
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.t = Math.random() * 5;
    this.swell = 0;
    this.reveal = 0;   // 0 = invisible en la oscuridad, 1 = bien alumbrado
    this.alive = true;
    this.canvas = document.createElement('canvas');
    this.glowCanvas = document.createElement('canvas');
    this.canvas.width = this.glowCanvas.width = W;
    this.canvas.height = this.glowCanvas.height = H;
    this.tex = canvasTexture(this.canvas);
    this.glowTex = canvasTexture(this.glowCanvas);
    this.mesh = spriteMesh(W, H);
    this.mesh.material.map = this.tex;
    this.mesh.material.alphaTest = 0; // aparece y se desvanece con la luz
    this.mesh.renderOrder = 2;
    this.glowMesh = spriteMesh(W, H, { glow: true });
    this.glowMesh.material.map = this.glowTex;
    game.visual.world.add(this.mesh);
    game.visual.glow.add(this.glowMesh);
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const p = this.game.player;
    const touching = p.x < this.x + this.w && p.x + p.w > this.x && p.y < this.y + this.h && p.y + p.h > this.y;
    // Solo cede bajo la luz: a oscuras es piedra de carne.
    if (this.swell === 0 && touching && this.reveal > 0.6) {
      this.swell = SWELL;
      this.game.audio.play('charge', this);
    } else if (this.swell > 0) {
      this.swell -= dt;
      if (this.swell <= 0) this.#burst();
    }
  }

  #burst() {
    const g = this.game;
    this.alive = false;
    g.state.nodules.add(this.key);
    g.audio.play('crunch', this);
    g.audio.play('acid', this);
    const col = this.lux ? [1, 0.85, 0.35] : { nervioso: [0.6, 0.45, 0.9], pulmonar: [0.7, 0.8, 0.3], digestivo: [0.7, 0.4, 0.2], corazon: [0.7, 0.05, 0.1], oseo: [0.85, 0.75, 0.6] }[this.biome];
    for (let i = 0; i < 18; i++) {
      g.particles.emit(this.cx, this.cy, { vx: (Math.random() - 0.5) * 140, vy: -40 - Math.random() * 110, life: 0.8, gravity: 450, color: col });
    }
    for (let i = 0; i < 5; i++) {
      g.particles.emit(this.cx, this.cy, { vx: (Math.random() - 0.5) * 100, vy: -60 - Math.random() * 80, life: 0.9, gravity: 500, color: [0.75, 0.75, 0.8] });
    }
    g.shake = Math.max(g.shake, 2);
    if (this.lux) {
      // Lumínico: siempre una célula de luz y, a veces, hueso.
      g.dropPickup('battery', this.cx - 3, this.y);
      if (Math.random() < 0.4) g.dropPickup('scrap', this.cx + 4, this.y);
    } else {
      // Siempre hueso; según el bioma, algo más.
      g.dropPickup('scrap', this.cx - 3, this.y);
      for (const [kind, chance, amount] of LOOT[this.biome]) {
        if (Math.random() < chance) g.dropPickup(kind, this.cx + 4, this.y, amount);
      }
    }
    this.dispose();
  }

  render() {
    if (!this.alive) return;
    const g = this.canvas.getContext('2d'), gl = this.glowCanvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    gl.clearRect(0, 0, W, H);
    const k = this.swell > 0 ? 1 - this.swell / SWELL : 0;
    (this.lux ? luxNodule : NODULES[this.biome])(g, gl, k, this.t);
    this.tex.needsUpdate = true;
    this.glowTex.needsUpdate = true;
    const shake = k > 0 ? (Math.random() - 0.5) * 2 : 0;
    // El lumínico se intuye a oscuras: su luz propia lo delata.
    const a = this.swell > 0 ? 1 : this.lux ? Math.max(0.55, this.reveal) : this.reveal;
    this.mesh.visible = this.glowMesh.visible = a > 0.02;
    this.mesh.material.opacity = a;
    this.glowMesh.material.opacity = a;
    placeMesh(this.mesh, this.cx - W / 2 + shake, this.y + this.h - H, W, H);
    placeMesh(this.glowMesh, this.cx - W / 2 + shake, this.y + this.h - H, W, H);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.glowMesh.removeFromParent();
    this.tex.dispose();
    this.glowTex.dispose();
  }
}
