import { spriteMesh, placeMesh, setMap, canvasTexture } from '../core/Sprites.js';

// Nodo Seguro con forma de útero vivo: un saco de carne translúcido colgado de
// cordones umbilicales, con líquido amniótico verde y una silueta encogida dentro.
// Late con un ritmo doble (lub-dub): se dilata, se contrae y su luz pulsa.

const W = 32, H = 42;
const BEAT = 1.15; // segundos por latido

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Pinta un fotograma con el saco escalado `s` (pixel art nítido en cada tamaño).
function paintWomb(s) {
  const color = document.createElement('canvas');
  const glow = document.createElement('canvas');
  color.width = glow.width = W;
  color.height = glow.height = H;
  const g = color.getContext('2d'), gl = glow.getContext('2d');
  gl.fillStyle = '#000';
  gl.fillRect(0, 0, W, H);
  const px = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const r = rngFrom(7);

  const cx = 16, cy = 23, rx = 10 * s, ry = 13 * s;
  const top = cy - ry;

  // Cordones umbilicales que lo cuelgan del techo.
  for (const [x0, bend] of [[11, -3], [21, 3]]) {
    for (let y = 0; y < top + 1; y++) {
      const x = x0 + Math.sin((y / Math.max(1, top)) * Math.PI) * bend;
      px(g, x, y, y % 4 === 0 ? '#c05a6a' : '#7a2434', 2, 1);
    }
  }

  // Raíz carnosa que lo ancla al suelo.
  for (let y = 0; y < 5; y++) {
    const w = 8 + y * 3;
    px(g, cx - w / 2, H - 5 + y, y === 0 ? '#a8424e' : '#6a1a28', w, 1);
  }

  // Saco: membrana exterior, líquido amniótico y venas.
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const d = Math.hypot(x / rx, y / ry);
      if (d > 1) continue;
      const X = cx + x, Y = cy + y;
      if (d > 0.88) px(g, X, Y, '#b8505e');
      else if (d > 0.78) px(g, X, Y, '#7a2434');
      else {
        px(g, X, Y, (x + y) % 5 === 0 ? '#2a6a54' : '#1d4e40');
        // El líquido brilla más en el centro.
        const k = (1 - d) * 0.55;
        gl.fillStyle = `rgba(70,255,160,${k.toFixed(2)})`;
        gl.fillRect(Math.round(X), Math.round(Y), 1, 1);
      }
    }
  }
  // Venas sobre la membrana.
  for (let v = 0; v < 4; v++) {
    let a = r() * Math.PI * 2;
    for (let i = 0; i < 7; i++) {
      px(g, cx + Math.cos(a) * rx * 0.86, cy + Math.sin(a) * ry * 0.86, '#5a0f1c');
      a += 0.12;
    }
  }

  // Silueta encogida dentro: cabeza grande y un cuerpo curvado.
  const head = 3.5 * s;
  for (let y = -head; y <= head; y++) for (let x = -head; x <= head; x++) {
    if (Math.hypot(x, y) <= head) px(g, cx - 2 * s + x, cy - 4 * s + y, '#0c2a20');
  }
  for (let a = 0.2; a < Math.PI * 1.15; a += 0.08) {
    const bx = cx + Math.cos(a) * 5 * s, by = cy + 1 * s + Math.sin(a) * 6 * s;
    px(g, bx - 1, by - 1, '#0c2a20', 3, 3);
  }
  // El "ojo" de la criatura, apenas una chispa.
  px(g, cx - 1 * s, cy - 5 * s, '#7dff9a');
  px(gl, cx - 1 * s, cy - 5 * s, 'rgba(160,255,190,0.9)');

  // Brillo húmedo de la membrana.
  px(g, cx - rx * 0.55, cy - ry * 0.55, '#ffd0d8', 2, 1);
  px(g, cx - rx * 0.62, cy - ry * 0.45, '#ffd0d8', 1, 2);

  return { tex: canvasTexture(color), glowTex: canvasTexture(glow) };
}

let FRAMES = null; // [contraído, reposo, dilatado]

export class Womb {
  constructor(game, node) {
    this.game = game;
    this.node = node;
    FRAMES ??= [0.88, 1, 1.1].map(paintWomb);
    this.cx = node.x + 8;
    this.cy = node.y + 14;
    this.beat = 0;
    this.lastPhase = 0;
    this.mesh = spriteMesh(W, H);
    this.mesh.renderOrder = 2;
    this.glowMesh = spriteMesh(W, H, { glow: true });
    this.glowMesh.renderOrder = 2;
    const x = node.x + 8 - W / 2, y = node.y + 32 - H;
    placeMesh(this.mesh, x, y, W, H);
    placeMesh(this.glowMesh, x, y, W, H);
    game.visual.world.add(this.mesh);
    game.visual.glow.add(this.glowMesh);
    this.update();
  }

  update() {
    const t = this.game.time, phase = t % BEAT;
    // Lub (fuerte) y dub (suave), luego una contracción y reposo.
    let frame = 1;
    if (phase < 0.09) frame = 2;
    else if (phase < 0.2) frame = 1;
    else if (phase < 0.28) frame = 2;
    else if (phase < 0.5) frame = 0;
    setMap(this.mesh, FRAMES[frame].tex);
    setMap(this.glowMesh, FRAMES[frame].glowTex);
    this.beat = Math.max(0, 1 - phase / 0.35);
    this.glowMesh.material.opacity = 0.55 + this.beat * 0.45;

    if (phase < this.lastPhase) {
      const p = this.game.player;
      if (p && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 180) this.game.audio.play('womb', this);
    }
    this.lastPhase = phase;
    // Burbujas en el líquido.
    if (Math.random() < 0.04) {
      this.game.glowParticles.emit(this.cx + (Math.random() - 0.5) * 10, this.cy + 6, { vy: -12, life: 0.9, color: [0.3, 0.9, 0.55] });
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.glowMesh.removeFromParent();
  }
}
