import { spriteMesh, placeMesh, setMap, canvasTexture } from '../core/Sprites.js';

// Nodo Seguro con forma de útero vivo: un saco de carne translúcido colgado de
// cordones umbilicales, lleno de una gelatina rosa pálida y una silueta encogida dentro.
// Late con un ritmo doble (lub-dub): se dilata, se contrae y su luz pulsa.

const W = 48, H = 48;
const CX = 24, CY = H - 19; // centro del saco (los pies del lienzo tocan el suelo)
const BEAT = 1.15; // segundos por latido

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Venas de colores: sangre, morado, azul venoso y un verde bilioso, como la carne vieja.
const VEINS = [
  ['#a02436', '#e05a6a'], ['#6a2a8a', '#b070d0'], ['#2e4690', '#6a8ae0'], ['#5e6a26', '#a0b44a'], ['#b03a4c', '#f08090'],
];

// Contorno del saco: no es un óvalo, tiene lóbulos y es más ancho abajo (como una pera
// blanda). Devuelve cuánto se aleja (x, y) del borde: < 1 dentro.
function sackDist(x, y, rx, ry) {
  const ang = Math.atan2(y, x);
  const lobes = 1 + 0.1 * Math.sin(3 * ang + 1) + 0.07 * Math.sin(5 * ang + 2.3) + 0.05 * Math.sin(8 * ang + 0.7);
  const pear = y > 0 ? 1.1 : 0.94;
  return Math.hypot(x / (rx * pear), y / ry) / lobes;
}

// Pinta un fotograma con el saco escalado `s` (pixel art nítido en cada tamaño).
// torn: recién parido — vacío, con la boca de abajo desgarrada y jirones colgando.
function paintWomb(s, torn = false) {
  const color = document.createElement('canvas');
  const glow = document.createElement('canvas');
  color.width = glow.width = W;
  color.height = glow.height = H;
  const g = color.getContext('2d'), gl = glow.getContext('2d');
  gl.fillStyle = '#000';
  gl.fillRect(0, 0, W, H);
  const px = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const r = rngFrom(7); // misma semilla en cada fotograma: las ramas no bailan

  const cx = CX, cy = CY, rx = 10 * s, ry = 13 * s;
  const top = cy - ry;

  // Ramificación: una vena o un cordón que avanza serpenteando y se bifurca; cada rama
  // más fina. clip(x, y) decide si se pinta ese punto (p. ej. solo sobre la membrana).
  const branch = (x, y, ang, len, w, pal, depth, clip = () => true, stop = () => false) => {
    for (let i = 0; i < len; i++) {
      x += Math.cos(ang); y += Math.sin(ang);
      ang += (r() - 0.5) * 0.45;
      if (x < 0 || x >= W || y < 0 || y >= H || stop(x, y)) return;
      if (clip(x, y)) {
        px(g, x, y, pal[0], w, w);
        if (w > 1) px(g, x, y, pal[1]); // brillo húmedo del cordón
        // Un leve brillo propio: las venas se ven aunque la sala esté a oscuras.
        gl.globalAlpha = w > 1 ? 0.3 : 0.22; px(gl, x, y, pal[1], w, w); gl.globalAlpha = 1;
      }
      if (depth > 0 && i > 2 && r() < 0.16) {
        branch(x, y, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), len * (0.45 + r() * 0.25), Math.max(1, w - 1), r() < 0.35 ? VEINS[Math.floor(r() * VEINS.length)] : pal, depth - 1, clip, stop);
      }
    }
  };
  const inSack = (x, y) => sackDist(x - cx, y - cy, rx, ry) < 1;

  // Cordones que lo cuelgan del techo: suben retorciéndose y se abren en raíces.
  for (const [dx, lean] of [[-4, -0.35], [0, 0.05], [4, 0.4]]) {
    branch(cx + dx, top + 2, -Math.PI / 2 + lean, 40, 2, VEINS[dx < 0 ? 0 : dx > 0 ? 4 : 1], 2);
  }
  // Zarcillos laterales que se agarran a la carne de alrededor.
  for (const [side, h] of [[-1, -0.2], [1, 0.1], [-1, 0.45], [1, 0.55]]) {
    const x0 = cx + side * rx * 0.95, y0 = cy + ry * h;
    branch(x0, y0, side < 0 ? Math.PI + 0.3 - h * 0.5 : -0.3 + h * 0.5, 13, 1, VEINS[Math.floor(r() * VEINS.length)], 2, () => true, inSack);
  }
  // Raíces al suelo: bajan del saco y se extienden por el suelo.
  for (const [dx, lean] of [[-3, 0.5], [0, 0], [3, -0.5]]) {
    branch(cx + dx, cy + ry * 0.9, Math.PI / 2 + lean, 12, 2, VEINS[0], 2);
  }
  // Base carnosa (un montículo irregular).
  for (let y = 0; y < 4; y++) {
    const w = 10 + y * 4 + (y % 2) * 2;
    px(g, cx - w / 2 + (y === 1 ? 1 : 0), H - 4 + y, y === 0 ? '#b04a58' : y === 1 ? '#8a2a3a' : '#5a1424', w, 1);
  }

  // Saco: membrana de bordes vivos, gelatina rosa pálida dentro.
  for (let y = -ry - 3; y <= ry + 3; y++) {
    for (let x = -rx - 3; x <= rx + 3; x++) {
      const d = sackDist(x, y, rx, ry);
      if (d > 1) continue;
      const X = cx + x, Y = cy + y;
      // La boca desgarrada: abajo, un hueco de bordes irregulares.
      const mouth = torn && y > ry * 0.45 && Math.abs(x) < rx * (0.28 + 0.12 * Math.sin(x * 2.3 + y));
      if (mouth) continue;
      if (d > 0.9) px(g, X, Y, (x * 7 + y * 3) % 5 === 0 ? '#d06a78' : '#b8505e');
      else if (d > 0.8) px(g, X, Y, '#7a2434');
      else if (torn && y < ry * 0.35) px(g, X, Y, (x * 3 + y) % 7 === 0 ? '#4a1420' : '#2a0810'); // vaciado
      else if (torn) px(g, X, Y, (x + y) % 4 === 0 ? '#c48a92' : '#a87078'); // el poso de gelatina
      else {
        px(g, X, Y, (x + y) % 5 === 0 ? '#f0c4c8' : '#e2aab2');
        // La gelatina brilla más en el centro.
        const k = (1 - d) * 0.55;
        gl.fillStyle = `rgba(255,190,200,${k.toFixed(2)})`;
        gl.fillRect(Math.round(X), Math.round(Y), 1, 1);
      }
    }
  }
  // Venas sobre la membrana: ramas de varios colores que la recorren desde el borde.
  const onSkin = (x, y) => { const d = sackDist(x - cx, y - cy, rx, ry); return d > 0.45 && d < 0.95; };
  for (let v = 0; v < 7; v++) {
    const ang = r() * Math.PI * 2, x0 = cx + Math.cos(ang) * rx * 0.92, y0 = cy + Math.sin(ang) * ry * 0.92;
    branch(x0, y0, ang + Math.PI + (r() - 0.5) * 0.8, 9, 1, VEINS[v % VEINS.length], 2, onSkin);
  }

  if (torn) {
    // Labios del desgarro y jirones de membrana que cuelgan goteando.
    for (let x = -rx * 0.42; x <= rx * 0.42; x++) px(g, cx + x, cy + ry * 0.45 + Math.abs(Math.sin(x * 1.7)) * 2, '#d06a78');
    for (const [dx, len] of [[-3, 4], [1, 6], [4, 3]]) for (let i = 0; i < len; i++) px(g, cx + dx + (i % 3 === 2 ? 1 : 0), cy + ry * 0.75 + i, i === len - 1 ? '#b0aaaa' : '#a8424e');
    px(g, cx - rx * 0.55, cy - ry * 0.55, '#ffd0d8', 2, 1);
    return { tex: canvasTexture(color), glowTex: canvasTexture(glow) };
  }
  // Silueta encogida dentro: cabeza grande y un cuerpo curvado.
  const head = 3.5 * s;
  for (let y = -head; y <= head; y++) for (let x = -head; x <= head; x++) {
    if (Math.hypot(x, y) <= head) px(g, cx - 2 * s + x, cy - 4 * s + y, '#b8707c');
  }
  for (let a = 0.2; a < Math.PI * 1.15; a += 0.08) {
    const bx = cx + Math.cos(a) * 5 * s, by = cy + 1 * s + Math.sin(a) * 6 * s;
    px(g, bx - 1, by - 1, '#b8707c', 3, 3);
  }
  // El "ojo" de la criatura, apenas una chispa.
  px(g, cx - 1 * s, cy - 5 * s, '#fff0f2');
  px(gl, cx - 1 * s, cy - 5 * s, 'rgba(255,220,228,0.9)');

  // Brillo húmedo de la membrana.
  px(g, cx - rx * 0.55, cy - ry * 0.55, '#ffd0d8', 2, 1);
  px(g, cx - rx * 0.62, cy - ry * 0.45, '#ffd0d8', 1, 2);

  return { tex: canvasTexture(color), glowTex: canvasTexture(glow) };
}

let FRAMES = null; // [contraído, reposo, dilatado, desgarrado]
// El parto (segundos desde que empieza): contracciones, rotura y vuelta a cerrarse.
export const BIRTH = { rupture: 1.4, stand: 2.9, end: 3.3, heal: 7 };

export class Womb {
  constructor(game, node) {
    this.game = game;
    this.node = node;
    FRAMES ??= [...[0.88, 1, 1.1].map((s) => paintWomb(s)), paintWomb(0.84, true)];
    this.cx = node.x + 8;
    this.cy = node.y + 14;
    this.beat = 0;
    this.lastPhase = 0;
    this.baseX = node.x + 8 - W / 2;
    this.baseY = node.y + 32 - H;
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

  // El parto: el saco se contrae a golpes, revienta por abajo y te suelta.
  birth() { this.birthAt = this.game.time; }
  get mouth() { return { x: this.cx, y: this.baseY + CY + 13 * 0.84 * 0.5 }; }

  #birthUpdate() {
    const g = this.game, t = g.time - this.birthAt;
    let frame, shake = 0;
    if (t < BIRTH.rupture) {
      // Contracciones cada vez más seguidas y fuertes; el saco tiembla y gotea.
      const k = t / BIRTH.rupture, rate = 0.42 - 0.28 * k;
      const ph = (t % rate) / rate;
      frame = ph < 0.35 ? 2 : ph < 0.7 ? 0 : 1;
      shake = Math.round(Math.sin(t * 60) * (0.5 + k));
      if (ph < this.lastLabor) g.audio.play('womb', this);
      this.lastLabor = ph;
      this.glowMesh.material.opacity = 0.6 + 0.4 * (1 - ph) + 0.3 * k;
      if (Math.random() < 0.2 + k * 0.5) g.particles.emit(this.cx + (Math.random() - 0.5) * 6, this.mouth.y, { vy: 10, life: 1, gravity: 400, color: [0.8, 0.62, 0.66], stain: 'rgba(170,140,145,0.55)' });
    } else {
      if (!this.ruptured) this.#rupture();
      frame = 3;
      shake = t < BIRTH.rupture + 0.3 ? Math.round(Math.sin(t * 70) * 2) : 0;
      this.glowMesh.material.opacity = Math.max(0.15, 1 - (t - BIRTH.rupture) * 0.5);
      // Sigue goteando un rato.
      if (Math.random() < Math.max(0, 0.5 - (t - BIRTH.rupture) * 0.08)) g.particles.emit(this.cx + (Math.random() - 0.5) * 5, this.mouth.y + 3, { vy: 5, life: 1.2, gravity: 400, color: Math.random() < 0.5 ? [0.6, 0.6, 0.6] : [0.6, 0.12, 0.18], stain: 'rgba(120,60,65,0.6)' });
      if (t > BIRTH.heal) { this.birthAt = null; this.ruptured = false; }
    }
    setMap(this.mesh, FRAMES[frame].tex);
    setMap(this.glowMesh, FRAMES[frame].glowTex);
    placeMesh(this.mesh, this.baseX + shake, this.baseY, W, H);
    placeMesh(this.glowMesh, this.baseX + shake, this.baseY, W, H);
    this.beat = 0.5;
  }

  // La rotura: un chorro de sangre mezclada con plasma gris que salpica el suelo.
  #rupture() {
    const g = this.game, m = this.mouth;
    this.ruptured = true;
    g.audio.play('birth', this);
    g.shake = Math.max(g.shake ?? 0, 5);
    for (let i = 0; i < 170; i++) {
      const blood = Math.random() < 0.5; // mitad sangre, mitad plasma gris
      g.particles.emit(m.x + (Math.random() - 0.5) * 8, m.y, {
        vx: (Math.random() - 0.5) * 220, vy: -30 + Math.random() * 160, life: 0.8 + Math.random() * 0.8, gravity: 520,
        color: blood ? [0.62, 0.1, 0.16] : Math.random() < 0.5 ? [0.62, 0.6, 0.6] : [0.78, 0.74, 0.74],
        stain: blood ? 'rgba(120,20,30,0.7)' : 'rgba(140,135,135,0.65)',
      });
    }
    for (let i = 0; i < 40; i++) g.glowParticles.emit(m.x + (Math.random() - 0.5) * 10, m.y, { vx: (Math.random() - 0.5) * 90, vy: 10 + Math.random() * 60, life: 0.6, color: Math.random() < 0.5 ? [0.9, 0.25, 0.3] : [0.8, 0.78, 0.78] });
    g.flash(m.x, m.y, 110, [1, 0.55, 0.6], 0.35);
  }

  update() {
    if (this.birthAt != null) return this.#birthUpdate();
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
      this.game.glowParticles.emit(this.cx + (Math.random() - 0.5) * 10, this.cy + 6, { vy: -12, life: 0.9, color: [1, 0.75, 0.8] });
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.glowMesh.removeFromParent();
  }
}
