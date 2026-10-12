import * as THREE from 'three';

// Recogida de recursos de la GPU. Las mallas que se quitan de la escena (enemigos que
// mueren, proyectiles, objetos recogidos, las piezas de una sala al salir de ella) se
// quitaban del dibujo pero su geometría y sus texturas se quedaban en la tarjeta: unas
// 100 texturas y 450 geometrías por cada vuelta al mapa. Aquí se anota todo lo que sale
// de la escena con removeFromParent() y sweepGPU() libera lo que siga fuera.
// Es seguro aunque algo vuelva a usarse luego: Three.js lo sube otra vez a la GPU.
const removed = new Set();
const remove = THREE.Object3D.prototype.removeFromParent;
THREE.Object3D.prototype.removeFromParent = function removeFromParent() {
  removed.add(this);
  return remove.call(this);
};

export function sweepGPU() {
  for (const obj of removed) {
    if (obj.parent) continue; // ha vuelto a la escena
    obj.traverse((m) => {
      m.geometry?.dispose();
      for (const mat of [].concat(m.material ?? [])) {
        mat.map?.dispose();
        mat.dispose();
      }
    });
  }
  removed.clear();
}
