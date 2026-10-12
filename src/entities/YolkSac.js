import { spriteMesh, placeMesh, canvasTexture } from '../core/Sprites.js';
import { TILE } from '../core/Physics.js';
import { px, seg, part, blob } from './Rig.js';

// Saco vitelino: una bolsa de carne unida al jefe de la sala que guarda un objeto
// (se ve dentro, flotando en la yema, pero no se puede coger). Late al ritmo del
// jefe; cuando el jefe muere, el saco se marchita y revienta, liberándolo.
// En data/levels.js: sacs: [{ x, y, item: '*', until: 'gangliomadre' }]

const W = 26, H = 30;
const WITHER = 1.6; // segundos que tarda en marchitarse

export class YolkSac {
  constructor(game, def, pickup) {
    this.game = game;
    this.def = def;
    this.pickup = pickup;
    pickup.locked = true;
    this.cx = def.x * TILE + TILE / 2;
    this.cy = def.y * TILE + TILE / 2;
    this.t = Math.random() * 3;
    this.wither = 0;
    this.alive = true;
    this.canvas = document.createElement('canvas');
    this.glowCanvas = document.createElement('canvas');
    this.canvas.width = this.glowCanvas.width = W;
    this.canvas.height = this.glowCanvas.height = H;
    this.tex = canvasTexture(this.canvas);
    this.glowTex = canvasTexture(this.glowCanvas);
    // El saco se pinta por encima del objeto: lo tapa a medias, como una yema turbia.
    this.mesh = spriteMesh(W, H);
    this.mesh.material.map = this.tex;
    this.mesh.material.alphaTest = 0;
    this.mesh.renderOrder = 3;
    this.glowMesh = spriteMesh(W, H, { glow: true });
    this.glowMesh.material.map = this.glowTex;
    game.visual.world.add(this.mesh);
    game.visual.glow.add(this.glowMesh);
  }

  // El jefe ha muerto: empieza a marchitarse.
  release() {
    if (this.wither > 0 || !this.alive) return;
    this.wither = WITHER;
    this.game.audio.play('mutate', { x: this.cx, y: this.cy });
  }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    if (this.wither > 0) {
      this.wither -= dt;
      if (Math.random() < 0.4) this.game.particles.emit(this.cx + (Math.random() - 0.5) * 16, this.cy, { vy: 30, life: 0.6, gravity: 300, color: [0.7, 0.55, 0.15] });
      if (this.wither <= 0) this.#burst();
      return;
    }
    // Si el jugador lo toca, el saco se tensa: se ve lo que guarda, pero no cede.
    const p = this.game.player;
    if (Math.abs(p.cx - this.cx) < 14 && Math.abs(p.cy - this.cy) < 20 && !this.warned) {
      this.warned = true;
      this.game.say('Un saco vitelino unido al jefe por un cordón. Mientras su dueño viva, no cederá.', 3);
    }
  }

  #burst() {
    const g = this.game;
    this.alive = false;
    this.pickup.locked = false;
    this.pickup.falling = true;
    g.audio.play('tear', { x: this.cx, y: this.cy });
    g.audio.play('acid', { x: this.cx, y: this.cy });
    for (let i = 0; i < 26; i++) {
      g.particles.emit(this.cx, this.cy, { vx: (Math.random() - 0.5) * 150, vy: -Math.random() * 130, life: 0.9, gravity: 420, color: i % 2 ? [0.85, 0.7, 0.2] : [0.6, 0.15, 0.2] });
    }
    g.say('El saco vitelino se marchita y revienta.', 2);
    this.dispose();
  }

  render() {
    if (!this.alive) return;
    const g = this.canvas.getContext('2d'), gl = this.glowCanvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    gl.clearRect(0, 0, W, H);
    const k = this.wither > 0 ? 1 - this.wither / WITHER : 0;       // 0 vivo, 1 seco
    const beat = (Math.max(0, Math.sin(this.t * 5)) * 0.08 + 1) * (1 - k * 0.35);
    const cx = 13, cy = 15;
    // Cordón umbilical que sube hacia el jefe (se arruga al marchitarse).
    for (let y = 0; y < 8; y++) px(g, cx + Math.sin(y * 0.8 + this.t * 2) * (1 + k), y, k > 0.5 ? '#4a3018' : '#8a3a4a', 2, 1);
    // Bolsa translúcida de yema: borde de carne, interior turbio y venas.
    const rx = 9 * beat, ry = 11 * beat;
    blob(g, cx, cy + 2, rx + 1, ry + 1, '#3a1418');
    g.globalAlpha = 0.55;
    blob(g, cx, cy + 2, rx, ry, k > 0.5 ? '#6a5020' : '#c8a040', k > 0.5 ? '#4a3018' : '#a06a30');
    g.globalAlpha = 1;
    for (const [x0, y0, x1, y1] of [[cx - 6, cy - 4, cx - 1, cy + 6], [cx + 5, cy - 6, cx + 2, cy + 8], [cx - 2, cy - 8, cx + 3, cy - 2]]) {
      seg(g, x0, y0 + 2, x1, y1 + 2, k > 0.5 ? '#3a2010' : '#9a3a3a');
    }
    px(g, cx - 5, cy - 5, '#f8e8b0', 2, 1); // brillo húmedo
    // La yema brilla tenue: el objeto se adivina dentro.
    // La yema brilla en la oscuridad (late con el jefe): se adivina lo que guarda.
    if (k < 0.6) {
      const glow = 0.6 + Math.max(0, Math.sin(this.t * 5)) * 0.4;
      blob(gl, cx, cy + 2, 6 * beat, 7 * beat, k > 0 ? '#3a2a08' : `rgba(200,160,60,${0.35 * glow})`);
      part(gl, cx, cy + 2, 3, 3, k > 0 ? '#5a4010' : '#e0b040');
    }
    this.tex.needsUpdate = true;
    this.glowTex.needsUpdate = true;
    placeMesh(this.mesh, this.cx - W / 2, this.cy - H / 2 - 4, W, H);
    placeMesh(this.glowMesh, this.cx - W / 2, this.cy - H / 2 - 4, W, H);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.glowMesh.removeFromParent();
    this.tex.dispose();
    this.glowTex.dispose();
  }
}
