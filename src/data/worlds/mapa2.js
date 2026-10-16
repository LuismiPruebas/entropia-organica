// MUNDO «mapa2» (Mapa 2): un mapa nuevo. Empieza con las dos primeras salas del
// Sistema Nervioso (A y A2, copiadas del original); el resto se construye desde el
// editor. Los huecos de A2 que llevaban a A3 y A6 quedan abiertos para conectar salas.
//
// Mapa del Metroidvania. Cada sala es una cuadrícula ASCII de tiles de 16px.
//
//  #  pared orgánica          X  membrana agrietada (se rompe con Embestida)
//  .  aire                    ^  espinas óseas (daño; inmune con Piel III)
//  ~  ácido gástrico          v  abismo (daño y vuelves al último suelo firme)
//  o  garfio de anclaje       N  Nodo Seguro (checkpoint, curar, mutar)
//  b  biomasa   B  batería   S  hueso   O  filtro de oxígeno
//  Q  quiste (+20 biomasa máx)   h  tejido sano (recupera integridad corrupta)
//  g  Timo Necrótico: cada uno, un paso permanente de tolerancia al rechazo; el último del mundo lo anula
//  P  Perla de Nácar (consumible: invulnerable unos segundos)
//  C  Célula Madre (consumible: regeneras integridad unos segundos)
//  2 4    muestras de ADN colocadas (llaves; ver data/mutations.js)   H  el Corazón (final)
//  *  fragmento de ADN del bioma de la sala (3, 4 y 5 completan los niveles I, II y III de su línea)
//  f  membrana fotosensible: parece pared; se retrae si la alumbras con el ojo
//  Y  esfínter sellado: pared de músculo; el Tendón lo desgarra y queda abierto
//  z  pared falsa: parece roca pero no lo es; la luz la atraviesa y la delata
//  m  mucosa resbaladiza: pared en la que las Garras no se agarran
//  /  rampa 45° que sube a la derecha    k  rampa 45° que sube a la izquierda
//  aA rampa suave (22,5°) que sube a la derecha (mitad baja + mitad alta)
//  Ee rampa suave que sube a la izquierda (mitad alta + mitad baja); debajo, pared
//
// Los huecos en los bordes de la sala son salidas (también en techo y suelo);
// `exits` dice a dónde llevan. Si un lado tiene varias, `at` indica el tramo de
// filas (laterales) o columnas (techo/suelo) de cada una.
// `spawn` y las posiciones de enemigos están en coordenadas de tile [col, fila].
// `hidden`: objetos invisibles hasta que el haz del ojo los alumbra.
// `biome`: sistema del organismo (data/biomes.js).
// `map`: [col, fila, ancho, alto] de la sala en la cuadrícula del mapa (tecla M).
// Mecanismos (entities/Puzzles.js): `gates` compuertas-esfínter, `pads` ganglios
// reflejo, `pods` sacos vitelinos que se revientan en orden, `valves` pústulas que
// llenan o vacían una cubeta de `fluids` y `floats` balsas que flotan en ella.

export const WORLD = 'mapa2'; // el editor comprueba que guarda en el mundo correcto

export const START = { room: 'A', spawn: [6, 11] };

export const LEVELS = {
  // ======================= SISTEMA NERVIOSO =======================
  A: {
    name: 'Conducto Nervioso',
    biome: 'nervioso',
    lamps: [[40, 2, 13], [18, 4, 13]], // luminarias colgantes
    map: [0, 2, 3, 1],
    grid: [
      '###########################################..###',
      '###########################################..###',
      '##################################.............#',
      '#######################...#####................#',
      '#################...###.....#.................2#',
      '###########...#......#....................######',
      '##########............................##########',
      '#########.............................##########',
      '#.....................................##########',
      '#.................................##############',
      '#.................................f.....########',
      '#...N...../############Ee.........f.bBB.########',
      '################################################',
      '################################################',
    ],
    enemies: [
      { type: 'acechador', x: 18, y: 10 },
      { type: 'ojo', x: 32, y: 3 },
    ],
    nodules: [[12, 10], [29, 11, 'luz']],
    exits: [
      { side: 'top', at: [43, 44], to: 'A2', spawn: [41, 39] },
    ],
    hints: [
      { x: 3, y: 11, r: 3, text: 'Una cápsula médica abandonada, reventada desde dentro. Lo que llevaba se arrastró más arriba, hacia la médula.' },
      { x: 44, y: 4, r: 2, text: 'ADN asimilable: llévalo al útero del Nodo y muta.' },
      { x: 43, y: 3, r: 2, text: 'Una grieta en el techo. Corriente de aire... desde arriba.' },
    ],
  },
  A2: {
    name: 'Ganglio Basal',
    biome: 'nervioso',
    lamps: [[28, 1, 10], [17, 19, 13], [26, 29, 12], [5, 34, 16], [39, 34, 10]], // luminarias colgantes
    map: [0, -1, 3, 3],
    grid: [
      '##################################zz############',
      '##########...........####.............##########',
      '###########.........####..............##########',
      '############........##................##########',
      '#############........................###########',
      '##....#####..............B..........############',
      '###....##................#######################',
      '####....X.......................################',
      '####..*.X..........................#############',
      '######################..............############',
      '##################....................##########',
      '############..........................##########',
      '#############.........................##########',
      '#############............#######################',
      '############.................###################',
      '##########.........................#############',
      '##########............................##########',
      '#######################...............##########',
      '####################..................##########',
      '##############........................##########',
      '##########............................##########',
      '##########................######################',
      '##########...................###################',
      '...................................#############',
      '................B...................############',
      '######################..............############',
      '###################.................############',
      '#############.........................##########',
      '###########...............######################',
      '############.................###################',
      '############.......................#############',
      '############..........................##########',
      '#######################...............##########',
      '####################..................##########',
      '####......####.............................#####',
      '####.......................................#####',
      '####......................############.....#####',
      '####.........................#########.......###',
      '####...............................###........##',
      '####.%..b.....................................##',
      '###########################################..###',
      '###########################################..###',
    ],
    enemies: [
      { type: 'acechador', x: 20, y: 39 },
      { type: 'neurona', x: 24, y: 19 },
      { type: 'enjambre', x: 20, y: 14 },
    ],
    nodules: [[14, 31], [30, 20], [30, 5], [25, 39, 'luz'], [16, 16, 'luz'], [20, 24]],
    exits: [
      { side: 'bottom', at: [43, 44], to: 'A', spawn: [44, 4] },
    ],
    hints: [
      { x: 6, y: 38, r: 3, text: 'Restos de la cápsula médica: dentro late ADN. Cógelo y asimílalo en el útero de un Nodo (E): tu brazo aprenderá a disparar.' },
      { x: 20, y: 8, r: 3, text: 'Un ganglio arrancado de algo enorme. Todavía recuerda caminos.' },
      { x: 4, y: 24, r: 2, text: 'Una médula hueca baja hacia la oscuridad.' },
    ],
  },
};
