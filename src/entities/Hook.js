import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { spriteMesh, canvasTexture } from '../core/Sprites.js';

// Garfio de anclaje (casilla 'o'): un gancho de hueso que cuelga de un cordón de carne
// clavado en el techo de su casilla. Es donde se engancha el Tendón para columpiarse.
//   · se mece despacio y late (una vena que pulsa en el cordón);
//   · cuando el Tendón lo cogería (Player.hookTarget), un halo lo marca: se sabe a
//     cuál te vas a enganchar antes de pulsar;
//   · enganchado, el cordón se tensa y el gancho gira hacia ti.
// El punto de agarre (x, y) es el centro de la casilla: la curva del gancho.

const W = 13, H = 22;          // lienzo; el pivote está arriba en el centro
const GRIP = 15;               // del pivote al punto de agarre (la curva del gancho)
const K = '#140c10';

function paint(lit) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const px = (x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  // Cordón de carne con nudos, del techo a la argolla.
  for (let y = 0; y < 8; y++) { px(5, y, K, 3, 1); px(6, y, y % 3 === 1 ? '#c86a7a' : '#8a3a4a'); }
  px(5, 2, '#5a1a2a'); px(7, 5, '#5a1a2a');
  // Argolla de hueso.
  for (const [x, y] of [[5, 8], [6, 8], [7, 8], [4, 9], [8, 9], [4, 10], [8, 10], [5, 11], [6, 11], [7, 11]]) px(x, y, K);
  for (const [x, y] of [[5, 9], [7, 9], [5, 10], [7, 10]]) px(x, y, '#d8ccb0');
  px(6, 9, '#2a1410', 1, 2);
  // El gancho: caña que baja y se curva hacia la derecha en una J con punta afilada.
  const bone = lit ? '#fff4dc' : '#e0d4b8', boneD = lit ? '#d8c8a8' : '#a89878';
  const hook = [[6, 12], [6, 13], [6, 14], [6, 15], [6, 16], [7, 17], [8, 18], [9, 18], [10, 17], [11, 16], [11, 15]];
  for (const [x, y] of hook) px(x - 1, y - 1, K, 3, 3);
  for (const [x, y] of hook) px(x, y, y > 16 ? boneD : bone);
  px(5, 13, bone); px(5, 14, bone);                           // grosor de la caña
  px(11, 14, K); px(12, 14, K); px(11, 14, '#fffaf0');        // punta
  px(7, 16, '#6a5040');                                       // sombra en la curva
  return canvasTexture(cv);
}

let TEX = null;

export class Hook {
  constructor(game, anchor) {
    this.game = game;
    this.anchor = anchor;                 // { x, y } (Room.anchors): el punto de agarre
    this.t = Math.random() * 6;
    TEX ??= [paint(false), paint(true)];
    this.pivot = new THREE.Group();
    this.pivot.position.set(anchor.x, -(anchor.y - GRIP), 0);
    this.mesh = spriteMesh(W, H);
    this.mesh.material.map = TEX[0];
    this.mesh.position.set(0, -H / 2, 0);
    this.mesh.renderOrder = 2;
    this.pivot.add(this.mesh);
    // Halo de "lo tienes a tiro": un anillo que late en la curva del gancho.
    this.halo = new THREE.Mesh(new THREE.RingGeometry(5, 7, 20), new THREE.MeshBasicMaterial({
      color: 0xffb0c0, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.halo.renderOrder = 3;
    this.halo.position.set(anchor.x, -anchor.y, 0);
    game.visual.world.add(this.pivot);
    game.visual.glow.add(this.halo);
  }

  update(dt) {
    this.t += dt;
    const p = this.game.player, r = p.rope;
    const held = r && r.x === this.anchor.x && r.y === this.anchor.y;
    let a = Math.sin(this.t * 1.1) * 0.08 + Math.sin(this.t * 0.37) * 0.05;   // vaivén lento
    if (held) a = Math.atan2(p.cx - this.anchor.x, p.y - this.anchor.y) * 0.5; // tira hacia ti
    this.pivot.rotation.z += (a - this.pivot.rotation.z) * Math.min(1, dt * (held ? 12 : 4));
    const target = p.hookTarget === this.anchor && !held;
    this.mesh.material.map = TEX[target ? 1 : 0];
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 7);
    this.halo.material.opacity = target ? 0.35 + pulse * 0.4 : 0;
    const s = target ? 1 + pulse * 0.15 : 1;
    this.halo.scale.set(s, s, 1);
  }

  dispose() { this.pivot.removeFromParent(); this.halo.removeFromParent(); }
}
