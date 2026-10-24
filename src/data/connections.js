// Conexiones entre salas: los puntos de conexión (`links` de cada sala, ver
// entities/Link.js) y, por compatibilidad, las salidas de borde antiguas (`exits`).
// Lo usan el mapa del juego, el nivel de cada sala, el menú de desarrollo y las
// herramientas de validación.

// Las salas a las que lleva una sala: [{ to, toLink, spawn, x, y, w, h }] (x..h: el sitio
// del punto, si es un punto; en una salida antigua, null).
export function roomConnections(lv) {
  const out = [];
  for (const l of lv?.links ?? []) if (l.to) out.push({ to: l.to, toLink: l.toLink, spawn: l.spawn ?? null, x: l.x, y: l.y, w: l.w ?? 1, h: l.h ?? 2 });
  for (const e of lv?.exits ?? []) out.push({ to: e.to, toLink: e.toLink, spawn: e.spawn, side: e.side, at: e.at });
  return out;
}

// Dónde se aparece al llegar a un punto de una sala: su "aparece en" o, si no, de pie
// sobre el propio punto (pies en su fila de abajo, columna central).
// Un hueco del suelo (punto en la fila de abajo sin "aparece en"): no se puede aparecer
// dentro, porque caerías por él y volverías a la sala de abajo. Se aparece de pie en el
// suelo firme más cercano al borde del agujero.
const FLOOR = new Set(['#', 'X', 'Y', 'Z', 'K', 'f', 'm', 'D', '/', 'k', 'a', 'A', 'E', 'e']);
const AIRY = (c) => c !== undefined && !FLOOR.has(c) && c !== '~' && c !== '^' && c !== 'v';
function besideFloorHole(lv, l) {
  const g = lv.grid, H = g.length, W = g[0].length, w = l.w ?? 1;
  for (let up = 1; up <= 4; up++) {
    for (let d = 1; d <= 10; d++) {
      for (const x of [l.x - d, l.x + w - 1 + d]) {
        if (x < 0 || x >= W) continue;
        const fy = H - up;                                  // fila del suelo
        if (FLOOR.has(g[fy]?.[x]) && AIRY(g[fy - 1]?.[x]) && AIRY(g[fy - 2]?.[x])) return [x, fy - 1];
      }
    }
  }
  return null;
}
export function linkArrival(lv, linkId) {
  const l = (lv?.links ?? []).find((k) => k.id === linkId);
  if (!l) return null;
  if (l.arrive) return [...l.arrive];
  if (lv.grid && l.y + (l.h ?? 2) >= lv.grid.length) {
    const s = besideFloorHole(lv, l);
    if (s) return s;
  }
  return [l.x + Math.floor(((l.w ?? 1) - 1) / 2), l.y + (l.h ?? 2) - 1];
}

// Dónde se aparece al seguir una conexión.
export function connectionArrival(levels, c) {
  return (c.toLink && linkArrival(levels[c.to], c.toLink)) ?? c.spawn ?? null;
}
