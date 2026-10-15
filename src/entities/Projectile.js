import { spriteMesh, placeMesh, canvasTexture, setMap } from '../core/Sprites.js';
import { overlap } from '../core/Physics.js';
import { PROJECTILES } from '../data/projectiles.js';

// Fotogramas pintados una vez por tipo (y color, si el tipo lo pide).
const frameCache = new Map();
function frameTex(style, kind, f, p) {
  const key = `${kind}|${f}|${style.tinted ? p.color : ''}`;
  let t = frameCache.get(key);
  if (t) return t;
  const [w, h] = style.size;
  const c = document.createElement('canvas'), gc = document.createElement('canvas');
  c.width = gc.width = w;
  c.height = gc.height = h;
  const g = c.getContext('2d'), gl = gc.getContext('2d');
  style.paint(g, gl, f, p);
  const hasGlow = gl.getImageData(0, 0, w, h).data.some((v, i) => i % 4 === 3 && v > 0);
  t = { tex: canvasTexture(c), glow: hasGlow ? canvasTexture(gc) : null };
  frameCache.set(key, t);
  return t;
}

export class Projectile {
  constructor(game, o) {
    this.game = game;
    this.style = PROJECTILES[o.kind] ?? null;
    Object.assign(this, { gravity: 0, life: 1.6, dot: 0, selfMissDamage: 0, glow: null }, this.style?.physics, o);
    this.alive = true;
    this.hit = false;
    this.t = 0;
    this.angle = Math.atan2(this.vy, this.vx);
    this.wob = 0; // desplazamiento lateral actual (wobble)
    this.bounce ??= 0;
    if (this.style) {
      const [w, h] = this.style.size;
      const f0 = frameTex(this.style, this.kind, 0, this);
      this.mesh = spriteMesh(w, h);
      this.mesh.material.map = f0.tex;
      if (f0.glow) {
        this.glowMesh = spriteMesh(w, h, { glow: true });
        this.glowMesh.material.map = f0.glow;
      }
    } else {
      // Sin sprite propio (p. ej. las ondas de choque): un bloque de color.
      this.mesh = spriteMesh(this.w, this.h, { color: this.color });
      if (this.glow) this.glowMesh = spriteMesh(this.w, this.h, { glow: true, color: `rgb(${this.glow.map((c) => Math.round(c * 255)).join(',')})` });
    }
    this.mesh.renderOrder = 5;
    game.visual.world.add(this.mesh);
    if (this.glowMesh) game.visual.glow.add(this.glowMesh);
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt) {
    const g = this.game, s = this.style;
    this.t += dt;
    this.life -= dt;

    // Fuerzas: gravedad, rozamiento del aire, flotación y deriva hacia el jugador.
    this.vy += this.gravity * dt;
    if (this.drag) { const k = 1 / (1 + this.drag * dt); this.vx *= k; this.vy *= k; }
    if (this.sink && this.vy > this.sink) this.vy += (this.sink - this.vy) * Math.min(1, dt * 4);
    if (this.home && this.owner === 'enemy') {
      const dx = g.player.cx - this.cx;
      this.vx += Math.sign(dx) * Math.min(1, Math.abs(dx) / 40) * this.home * dt;
    }

    // Movimiento por ejes, con rebote en las paredes y el suelo.
    let dx = this.vx * dt, dy = this.vy * dt;
    if (this.wobble) {
      // Oscila a los lados de su trayectoria sin cambiar el rumbo.
      const [amp, freq] = this.wobble;
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const w = Math.sin(this.t * freq * Math.PI * 2) * amp;
      dx += (-this.vy / sp) * (w - this.wob);
      dy += (this.vx / sp) * (w - this.wob);
      this.wob = w;
    }
    if (this.bounce > 0 && g.world.solidAtPx(this.cx + dx, this.cy)) {
      this.vx *= -(this.restitution ?? 0.5);
      dx = 0;
      this.#bounced();
    }
    if (this.bounce > 0 && g.world.solidAtPx(this.cx + dx, this.cy + dy)) {
      this.vy *= -(this.restitution ?? 0.5);
      this.vx *= this.friction ?? 1;
      dy = 0;
      this.#bounced();
    }
    const pcx = this.cx, pcy = this.cy;
    this.x += dx;
    this.y += dy;

    // Mecanismos que se revientan a tiros (sacos en orden, pústulas-válvula). Antes que
    // la pared: las pústulas están incrustadas en ella.
    if (this.owner === 'player') {
      for (const t of g.room.targets ?? []) {
        if (t.alive && overlap(this, t)) {
          this.hit = t.hit();
          return this.end();
        }
      }
    }

    // Choque con el escenario: un rayo desde donde estaba hasta donde está (aunque vaya
    // muy deprisa no atraviesa esquinas ni pendientes); se queda en el punto del impacto.
    const ray = g.world.raycast(pcx, pcy, this.cx, this.cy);
    if (ray || g.world.solidAtPx(this.cx, this.cy)) {
      if (ray) { this.x += ray.x - this.cx; this.y += ray.y - this.cy; }
      // El cañón de nivel II o más (simbionte, escopeta) revienta las membranas agrietadas.
      if (this.breaks && this.owner === 'player') {
        const tx = ray ? ray.cx : Math.floor(this.cx / 16), ty = ray ? ray.cy : Math.floor(this.cy / 16);
        if (g.world.get(tx, ty) === 'X') g.breakMembrane(tx, ty);
      }
      if (!s?.impact) {
        for (let i = 0; i < 4; i++) {
          g.glowParticles.emit(this.cx, this.cy, { vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.2, color: this.glow ?? [0.9, 0.8, 0.5] });
        }
      }
      return this.end();
    }

    if (this.owner === 'player') {
      for (const e of g.room.enemies) {
        // Las piezas que sobresalen de la caja (cabezas de los jefes) también reciben.
        if (e.alive && (overlap(this, e) || e.touchesSpot(this.cx, this.cy))) {
          this.hit = e.hurt(this.damage, this.kind, false, { x: this.cx, y: this.cy }) || e.armored;
          if (this.dot) e.applyAcid(this.dot, 3);
          if (this.knock && this.hit) e.knockback(Math.sign(this.vx) || 1, this.knock);
          return this.end();
        }
      }
    } else if (overlap(this, g.player)) {
      this.hit = true;
      g.hurtPlayer(this.damage, this.cx, 'proyectil', this.status);
      return this.end();
    }

    s?.trail?.(g, this, dt);
    if (this.life <= 0) this.end();
  }

  #bounced() {
    this.bounce--;
    this.style?.bounceFx?.(this.game, this);
    // Si ya casi no se mueve, que se rompa en vez de temblar en el suelo.
    if (Math.hypot(this.vx, this.vy) < 45) this.bounce = 0;
  }

  end() {
    if (!this.alive) return;
    this.alive = false;
    const g = this.game;
    this.style?.impact?.(g, this);
    if (this.burstRadius) g.areaBurst(this.cx, this.cy, this.burstRadius, this.burstDamage, this.status);
    // Al romperse puede soltar esquirlas (p. ej. los cálculos de sarro más adentro).
    for (let i = 0; i < (this.shards ?? 0); i++) {
      const a = -Math.PI / 2 + (i - (this.shards - 1) / 2) * 0.7;
      g.spawnProjectile({
        x: this.cx - 1.5, y: this.cy - 3, w: 3, h: 3, vx: Math.cos(a) * 110, vy: Math.sin(a) * 140, life: 1.2,
        damage: 2, kind: 'tartarShard', owner: this.owner,
      });
    }
    if (this.owner === 'player' && !this.hit) {
      g.state.stats.missed++;
      // Un disparo cargado fallido salpica de vuelta al portador.
      if (this.selfMissDamage) {
        g.state.damage(this.selfMissDamage, 'retroceso');
        g.say('El ácido fallado te salpica de vuelta.', 1.5);
      }
    }
    this.dispose();
  }

  render() {
    const s = this.style;
    if (!s) {
      const vertical = Math.abs(this.vy) > Math.abs(this.vx);
      const w = vertical ? this.h : this.w, h = vertical ? this.w : this.h;
      placeMesh(this.mesh, this.x, this.y, w, h);
      this.mesh.scale.set(w / this.w, h / this.h, 1);
      if (this.glowMesh) {
        placeMesh(this.glowMesh, this.x, this.y, w, h);
        this.glowMesh.scale.copy(this.mesh.scale);
      }
      return;
    }
    const [w, h] = s.size;
    if ((s.frames ?? 1) > 1) {
      const f = Math.floor(this.t * (s.fps ?? 8)) % s.frames;
      const ft = frameTex(s, this.kind, f, this);
      setMap(this.mesh, ft.tex);
      if (this.glowMesh && ft.glow) setMap(this.glowMesh, ft.glow);
    }
    // Giro (en pantalla la Y va hacia arriba: ángulo con el signo cambiado).
    let rot = 0;
    if (s.orient === 'velocity') rot = Math.atan2(this.vy, this.vx);
    else if (s.orient === 'spin') rot = this.t * (s.spin ?? 1) * Math.PI * 2 * (this.vx < 0 ? -1 : 1);
    else if (s.orient === 'rock') rot = Math.sin(this.t * 2.6) * 0.35;
    const x = this.cx - w / 2, y = this.cy - h / 2;
    placeMesh(this.mesh, x, y, w, h);
    this.mesh.rotation.z = -rot;
    if (this.glowMesh) {
      placeMesh(this.glowMesh, x, y, w, h);
      this.glowMesh.rotation.z = -rot;
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.glowMesh?.removeFromParent();
  }
}
