// Cada útero de Nodo Seguro es distinto: qué ofrece y con qué cobra. No da igual en
// cuál pares. Donde abunda el hueso (la zona nerviosa, llena de nódulos) el útero
// cobra en hueso y la carne vale más; donde sobra la carne, cobra en biomasa.
// Algunos digieren un recurso en el otro para compensar la escasez de la zona.
//
//   precio      { bio: n } o { scrap: n }
//   heal        +NODE_HEAL integridad (gasta una dosis del útero)
//   light       +35 luz para el ojo
//   suppressor  -35 rechazo
//   trade       { give: precio, get: { bio | scrap: n } } intercambio
// Sanar, recargar el ojo y mutar están en todos; lo demás, solo donde se indica.
export const NODES = {
  A: { name: 'Útero joven', heal: { bio: 15 }, light: { scrap: 4 } },
  A3: { name: 'Útero medular', heal: { scrap: 8 }, light: { scrap: 5 }, suppressor: { scrap: 6 }, trade: { give: { scrap: 6 }, get: { bio: 15 } } },
  B: { name: 'Útero alveolar', heal: { bio: 15 }, light: { bio: 12 }, suppressor: { bio: 20 } },
  B2: { name: 'Útero bronquial', heal: { bio: 12 }, light: { scrap: 3 }, trade: { give: { bio: 15 }, get: { scrap: 6 } } },
};

// Para Nodos nuevos sin carta propia.
export const DEFAULT_NODE = { name: 'Útero', heal: { bio: 15 }, light: { scrap: 4 }, suppressor: { scrap: 6 } };

export const nodeOf = (roomId) => NODES[roomId] ?? DEFAULT_NODE;
