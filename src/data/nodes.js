import { LEVELS } from './levels.js';
import { NODE_DOSES, NODE_HEAL } from '../state/State.js';
// Cada útero de Nodo Seguro es distinto: qué ofrece y con qué cobra. No da igual en
// cuál pares. Donde abunda el hueso (la zona nerviosa, llena de nódulos) el útero
// cobra en hueso y la carne vale más; donde sobra la carne, cobra en biomasa.
// Algunos digieren un recurso en el otro para compensar la escasez de la zona.
//
//   precio      { bio: n } o { scrap: n }
//   heal        precio de una cura (gasta una dosis del útero)
// Las curas de cada útero (cuántas guarda y cuánto cura cada una) se ponen en su sala,
// desde el editor: womb: { doses, cure }. Sin eso, NODE_DOSES y NODE_HEAL (state/State.js).
//   suppressor  -35 rechazo
//   trade       { give: precio, get: { bio | scrap: n } } intercambio
// Sanar, comprar células lumínicas (precio y tope en state/State.js) y mutar están en todos;
// lo demás, solo donde se indica.
export const NODES = {
  A: { name: 'Útero joven', heal: { bio: 15 } },
  A3: { name: 'Útero medular', heal: { scrap: 8 }, suppressor: { scrap: 6 }, trade: { give: { scrap: 6 }, get: { bio: 15 } } },
  B: { name: 'Útero alveolar', heal: { bio: 15 }, suppressor: { bio: 20 } },
  B2: { name: 'Útero bronquial', heal: { bio: 12 }, trade: { give: { bio: 15 }, get: { scrap: 6 } } },
};

// Para Nodos nuevos sin carta propia.
export const DEFAULT_NODE = { name: 'Útero', heal: { bio: 15 }, suppressor: { scrap: 6 } };

export const nodeOf = (roomId) => {
  const w = LEVELS[roomId]?.womb ?? {};
  return { ...(NODES[roomId] ?? DEFAULT_NODE), doses: w.doses ?? NODE_DOSES, cure: w.cure ?? NODE_HEAL };
};
