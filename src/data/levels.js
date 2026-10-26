// MUNDO ACTIVO. Cada mapa completo (sus salas, conexiones e inicio) vive en su propio
// archivo de src/data/worlds/; aquí se elige cuál se juega y se edita. La leyenda de
// los caracteres de las salas está al principio de cada mundo.
//
// Se elige (de más a menos prioridad):
//   ?world=mapa2 en la dirección (y se recuerda), la última elección guardada en el
//   navegador (editor y menú de desarrollo: setWorld), o LINFA_WORLD en Node.
// Para añadir un mundo: crea src/data/worlds/<id>.js (con WORLD, START y LEVELS) y
// regístralo en WORLDS.

// physicalLinks: las aberturas de techo y suelo no teletransportan. Al cruzarlas conservas
// tu movimiento: subiendo apareces en la boca de abajo de la sala de arriba con el impulso
// que traías (el pozo que quede lo trepas tú, o vuelves a caer); cayendo entras por la boca
// de arriba con tu caída. Sin ello se aparece de pie en la llegada del punto (`arrive`).
export const WORLDS = {
  original: { name: 'Mapa original', load: () => import('./worlds/original.js') },
  mapa2: { name: 'Mapa 2', load: () => import('./worlds/mapa2.js'), physicalLinks: true },
};
const KEY = 'linfa.world';

function chosen() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('world');
    if (q && WORLDS[q]) { localStorage.setItem(KEY, q); return q; }
    const saved = globalThis.localStorage?.getItem(KEY);
    if (saved && WORLDS[saved]) return saved;
  } catch { /* sin navegador o sin almacenamiento */ }
  const env = globalThis.process?.env?.LINFA_WORLD;
  return env && WORLDS[env] ? env : 'mapa2';
}

export const WORLD_ID = chosen();
const world = await WORLDS[WORLD_ID].load();
export const LEVELS = world.LEVELS;
export const START = world.START;
export const PHYSICAL_LINKS = !!WORLDS[WORLD_ID].physicalLinks;

// Cambia el mundo activo (hay que recargar para que se aplique).
export function setWorld(id) {
  if (!WORLDS[id]) return;
  try { localStorage.setItem(KEY, id); } catch { /* sin almacenamiento */ }
}
