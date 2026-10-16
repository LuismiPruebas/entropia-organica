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
export function linkArrival(lv, linkId) {
  const l = (lv?.links ?? []).find((k) => k.id === linkId);
  if (!l) return null;
  if (l.arrive) return [...l.arrive];
  return [l.x + Math.floor(((l.w ?? 1) - 1) / 2), l.y + (l.h ?? 2) - 1];
}

// Dónde se aparece al seguir una conexión.
export function connectionArrival(levels, c) {
  return (c.toLink && linkArrival(levels[c.to], c.toLink)) ?? c.spawn ?? null;
}
