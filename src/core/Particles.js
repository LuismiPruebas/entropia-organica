import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps

// Partículas de 1px en un único THREE.Points (sangre, gas, chispas).
export class Particles {
  constructor(scene, { capacity = 400, size = 1, additive = false } = {}) {
    this.cap = capacity;
    this.items = [];
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size,
      sizeAttenuation: false,
      vertexColors: true,
      depthTest: false,
      transparent: additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  // stain: color CSS con el que la gota mancha la superficie donde cae (ver onStain).
  emit(x, y, { vx = 0, vy = 0, life = 0.5, gravity = 0, color = [1, 1, 1], stain = null } = {}) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({ x, y, vx, vy, life, max: life, gravity, color, stain });
  }

  update(dt, world) {
    for (const p of this.items) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity && world?.solidAtPx(p.x, p.y)) {
        // Las gotas de sangre manchan lo que tocan y desaparecen.
        if (p.stain && this.onStain) {
          this.onStain(p.x - p.vx * dt, p.y - p.vy * dt, p.stain, p.vx, p.vy);
          p.life = 0;
          continue;
        }
        p.y -= p.vy * dt;
        p.vx *= 0.3;
        p.vy = 0;
      }
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  render() {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const p = this.items[i];
      const f = Math.min(1, (p.life / p.max) * 2);
      this.pos.set([Math.round(p.x) + 0.5, -Math.round(p.y) - 0.5, 0], i * 3);
      this.col.set([p.color[0] * f, p.color[1] * f, p.color[2] * f], i * 3);
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() { this.items = []; }
}
