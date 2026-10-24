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
//   suppressor  cría un Supresor (-35 rechazo al tomarlo; se guarda en una cavidad)
//   trade       { give: precio, get: { bio | scrap: n } } intercambio
// Sanar, comprar células lumínicas (precio y tope en state/State.js) y mutar están en todos;
// lo demás, solo donde se indica.
export const NODES = {
  A: { name: 'Útero joven', heal: { bio: 15 } },
  A3: { name: 'Útero medular', heal: { scrap: 8 }, suppressor: { scrap: 4 }, trade: { give: { scrap: 6 }, get: { bio: 15 } } },
  B: { name: 'Útero alveolar', heal: { bio: 15 }, suppressor: { bio: 12 } },
  B2: { name: 'Útero bronquial', heal: { bio: 12 }, trade: { give: { bio: 15 }, get: { scrap: 6 } } },
};

// Para Nodos nuevos sin carta propia.
export const DEFAULT_NODE = { name: 'Útero', heal: { bio: 15 }, suppressor: { scrap: 4 } };

// Desde el editor, cada sala puede decir qué vende su útero (womb.sells) y cómo se
// llama (womb.name). Lo que no diga, sale de la carta de arriba (o de DEFAULT_NODE).
//   sells: { cells, suppressor, extender, shield, regen: true/false, trade: '' | 'carne' | 'hueso' }
//   trade 'carne': digiere hueso y da carne · 'hueso': calcifica carne y da hueso
export const TRADES = {
  carne: { give: { scrap: 6 }, get: { bio: 15 } },
  hueso: { give: { bio: 15 }, get: { scrap: 6 } },
};
export const baseNode = (roomId) => NODES[roomId] ?? DEFAULT_NODE;
export const nodeOf = (roomId) => {
  const w = LEVELS[roomId]?.womb ?? {}, base = baseNode(roomId), s = w.sells ?? {};
  return {
    ...base,
    name: w.name ?? base.name,
    doses: w.doses ?? NODE_DOSES, cure: w.cure ?? NODE_HEAL,
    cells: s.cells ?? true,
    extender: s.extender ?? true,
    suppressor: s.suppressor === false ? null : s.suppressor === true ? (base.suppressor ?? { scrap: 4 }) : base.suppressor,
    trade: s.trade === '' ? null : TRADES[s.trade] ?? base.trade,
    shield: s.shield ?? true,
    plasma: s.plasma ?? true,
    regen: s.regen ?? true,
  };
};
