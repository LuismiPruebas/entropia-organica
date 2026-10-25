// Registro de mutaciones, organizado en LÍNEAS de órganos (Cerebro, Ojo, Dermis,
// Extremidades, Torso, Cañón), cada una con tres niveles. Algunas mutaciones son
// FUSIONES: pertenecen a dos líneas a la vez y exigen haber desarrollado ambas
// (el Tendón: Extremidades II + Torso II; el Tercer Ojo: Cerebro II + Ojo II).
//
// Añadir una mutación = añadir una entrada aquí (y, si da una habilidad nueva,
// implementarla en Player.js / Game.js, que consultan state.has(ability)).
//
//   line / lines   línea a la que pertenece (lines: varias, en una fusión)
//   level          nivel dentro de su línea (1..3)
//   requires       mutaciones que hay que tener instaladas antes
//   source         'key': la da un jefe o un lugar fijo del mapa (abre caminos)
//                  'fragment': se completa reuniendo fragmentos del órgano de su línea
//   dna            carácter del mapa que representa la muestra de ADN
//   ability        habilidad que otorga (abilities: varias, en una fusión)
//   load           carga genética que ocupa (por defecto 1; los niveles III, 2)
//   integrityCost  salud máxima que queda corrupta para siempre
//   rejection      subida inmediata del Índice de Rechazo al instalarla
//   brief          una línea con lo que hace, con voz del organismo (útero, Genoma, recogida)
//   mods           multiplicadores pasivos (state.mod(nombre) los multiplica)
//   immunities     peligros del entorno que deja de sufrir
//   hunger         biomasa por segundo que consume
//   desc / controls / effect / drawback / lore / unlockHint   textos
//   color          color de la ficha en el Genoma

// --- Líneas de órganos. frag: tipo de fragmento de ADN que las hace crecer (las
// líneas sin frag solo avanzan con llaves: jefes y lugares fijos).
export const LINES = {
  cerebro: { name: 'Cerebro', color: '#ffd25a', frag: 'neural' },
  ojo: { name: 'Ojo', color: '#ff6aa8', frag: 'ocular' },
  dermis: { name: 'Dermis', color: '#6fa0c8', frag: 'dermal' },
  extremidades: { name: 'Extremidades', color: '#c8a46a', frag: null },
  torso: { name: 'Torso', color: '#7dff9a', frag: null },
  canon: { name: 'Cañón', color: '#ff4ad8', frag: 'balistico' },
};
export const LINE_ORDER = ['cerebro', 'ojo', 'dermis', 'extremidades', 'torso', 'canon'];

// --- Fragmentos de ADN: cada criatura suelta el de lo que es (def.frag en
// enemies.js); los fragmentos fijos del mapa ('*') rotan entre los de su bioma.
export const FRAGMENTS = {
  neural: { name: 'neural', color: '#ffd25a', line: 'cerebro' },
  ocular: { name: 'ocular', color: '#ff6aa8', line: 'ojo' },
  dermal: { name: 'dérmico', color: '#6fa0c8', line: 'dermis' },
  balistico: { name: 'óseo', color: '#ff4ad8', line: 'canon' },
};

// --- Órganos que se llevan bien o se estorban. k = nivel común de las dos líneas
// (el menor de los dos). Las sinergias valen desde nivel I en ambas; los choques
// crecen con k (mods elevados a k) y suman k al desorden que dispara el rechazo.
export const SYNERGIES = [
  { lines: ['cerebro', 'ojo'], name: 'Nervio óptico', text: 'El ojo gasta un 20% menos de luz.', mods: { lightDrain: 0.8 } },
  { lines: ['dermis', 'extremidades'], name: 'Exoesqueleto', text: 'Las placas ya no te frenan.', mods: { moveSpeed: 1.11 } },
  { lines: ['extremidades', 'torso'], name: 'Fuelle motor', text: 'Embestida y saltos de gas cuestan un 20% menos de aliento.', mods: { dashCost: 0.8, jumpCost: 0.8 } },
  { lines: ['dermis', 'canon'], name: 'Astillas de placa', text: 'Tus disparos hieren un 25% más.', mods: { gunDamage: 1.25 } },
];
export const CLASHES = [
  { lines: ['dermis', 'torso'], name: 'Coraza opresiva', text: 'La coraza aprieta los pulmones: -10% de oxígeno máximo por nivel común.', mods: { oxygenCap: 0.9 } },
  { lines: ['dermis', 'ojo'], name: 'Piel fotófaga', text: 'La piel bebe luz: +12% de gasto de luz por nivel común.', mods: { lightDrain: 1.12 } },
  { lines: ['canon', 'cerebro'], name: 'Hambre doble', text: 'Cañón y cerebro se disputan la carne: +30% de hambre por nivel común.', mods: { hunger: 1.3 } },
];

export const MUTATIONS = {
  // ============================== CEREBRO ==============================
  // El mapa interno (tecla M).
  cartografo: {
    name: 'Ganglio Cartógrafo',
    line: 'cerebro', level: 1, source: 'fragment',
    dna: '9',
    ability: 'map1',
    integrityCost: 4,
    rejection: 12,
    mods: { visibility: 1.15 },
    desc: 'Cerebro I: mapa de lo recorrido (M) y ves la vida de los jefes.',
    brief: 'Un ganglio que sueña pasillos: mapa de lo recorrido [M] y lees la vida de los jefes.',
    controls: 'Pulsa M: un ganglio nuevo recuerda cada sala que pisas y te dibuja el camino recorrido.',
    effect: 'Ves las salas visitadas, sus conexiones, los Nodos y dónde estás. Y lees cuánta vida le queda a un jefe.',
    drawback: 'Te detectan un 15% más lejos.',
    lore: 'Un bulto crece detrás de tu oreja y empieza a soñar con pasillos. Cuando cierras los ojos, los ves todos a la vez.',
    color: '#ffd25a',
  },
  ecolocacion: {
    name: 'Órgano Ecolocador',
    line: 'cerebro', level: 2, source: 'fragment', requires: ['cartografo'],
    dna: '0',
    ability: 'map2',
    integrityCost: 4,
    rejection: 12,
    mods: { oxygenRegen: 0.9 },
    desc: 'Cerebro II: el mapa revela las salas vecinas que aún no has pisado.',
    brief: 'Chasquidos que rebotan en la carne: el mapa dibuja las salas vecinas sin pisarlas.',
    controls: 'Pasiva: chasquidos inaudibles rebotan por la carne y el mapa (M) muestra las salas contiguas sin visitar.',
    effect: 'Ves hacia dónde lleva cada salida antes de cruzarla. Con el Ojo Pineal, abre el Tercer Ojo.',
    drawback: 'Chasqueas sin parar: recuperas el aliento un 10% más lento.',
    lore: 'Tu garganta aprende a chasquear como un murciélago. El eco te devuelve formas de lugares donde nunca has estado.',
    color: '#ffb84a',
  },
  // Fusión Cerebro III + Ojo III: un solo órgano para las dos líneas.
  percepcion: {
    name: 'Tercer Ojo',
    line: 'cerebro', lines: ['cerebro', 'ojo'], level: 3, source: 'fragment', requires: ['ecolocacion', 'ojo2'],
    dna: '&',
    ability: 'map3',
    abilities: ['map3', 'eye3'],
    load: 2,
    integrityCost: 6,
    rejection: 18,
    mods: { lightRange: 1.3 }, // el haz llega mucho más lejos
    hunger: 0.05,
    desc: 'Fusión Cerebro III + Ojo III: tu haz llega mucho más lejos, el mapa marca los secretos que quedan por recoger y, desde el útero de un Nodo, puedes viajar a cualquier otro que hayas visitado.',
    brief: 'El ojo del deseo: haz larguísimo, secretos marcados en el mapa y viajes entre úteros.',
    controls: 'Pasiva: el mapa (M) señala lo que aún late en cada sala conocida (ADN, timos, quistes, tejido y objetos ocultos). En un Nodo Seguro, elige "Viajar": el organismo te escupe en otro Nodo ya visitado (25 de luz y 10 de biomasa).',
    effect: 'Requiere Órgano Ecolocador y Ojo Pineal. Lo completan los fragmentos neurales o los oculares.',
    drawback: 'Tu cerebro hinchado tiene hambre (0,05 de biomasa por segundo) y cada viaje te vacía: 25 de luz y 10 de biomasa.',
    lore: 'El cráneo se abre y el ojo y el cerebro se funden en uno solo, en mitad de la frente. No ve luz: ve deseo, y ve el nervio que une los úteros del organismo. Ahora puedes cruzarlo.',
    color: '#d040ff',
  },

  // ================================ OJO ================================
  // Sin mutar, el ojo fotóforo solo alumbra y fija tu arma en lo que ilumina.
  ojo1: {
    name: 'Ojo Despierto',
    line: 'ojo', level: 1, source: 'fragment',
    dna: '!',
    ability: 'eye1',
    integrityCost: 4,
    rejection: 10,
    mods: { lightDrain: 1.1 },
    desc: 'Ojo I: haz de largo alcance. Abre las membranas fotosensibles, apunta solo y ves la vida de los jefes.',
    brief: 'La pupila se abre en un haz: deshace espejismos de carne, apunta sola y lee la vida de los jefes.',
    controls: 'Pasiva: alumbra lejos. Las paredes falsas se deshacen bajo el haz, el auto-apuntado fija lo que ilumina y ves la vida de los jefes.',
    effect: 'Tu luz llega lejos y empieza a actuar: deshace los espejismos de carne, apunta por ti y presiente la vida de los jefes.',
    drawback: 'Gasta un 10% más de luz.',
    lore: 'La pupila se te abre hasta comerse el iris. Ves cosas en los bordes de la luz. Algunas te devuelven la mirada.',
    color: '#ff9ac0',
  },
  ojo2: {
    name: 'Ojo Pineal',
    line: 'ojo', level: 2, source: 'fragment', requires: ['ojo1'],
    dna: '?',
    ability: 'eye2',
    integrityCost: 5,
    rejection: 12,
    mods: { visibility: 1.2, lightDrain: 0.75, lightRange: 1.12 },
    desc: 'Ojo II: el haz revela los objetos ocultos y ahuyenta a las criaturas lucífugas. Tu luz dura más.',
    brief: 'Glándula pineal: materializa lo oculto, disuelve el tejido fotosensible y espanta a los lucífugos.',
    controls: 'Pasiva: alumbra lo escondido para que se materialice y puedas cogerlo; las membranas fotosensibles se deshacen bajo el haz. Reptantes, colonias, neuronas y larvas huyen de tu luz.',
    effect: 'Tu luz ya no solo mira: actúa. Aguanta más (gasta un 25% menos) y llega un poco más lejos.',
    drawback: 'Lo que no huye te ve antes: te detectan desde un 20% más lejos.',
    lore: 'Una glándula que llevaba siglos dormida en el centro de tu cráneo despierta y empuja hacia la frente. Quema. Ilumina.',
    color: '#ff6aa8',
  },

  // =============================== DERMIS ==============================
  quitina: {
    name: 'Placas de Quitina',
    line: 'dermis', level: 1, source: 'fragment',
    dna: '6',
    integrityCost: 8,
    rejection: 15,
    mods: { moveSpeed: 0.9 },
    immunities: ['acid'],
    desc: 'Dermis I: resiste el ácido gástrico y tus golpes cuerpo a cuerpo hieren más. Velocidad -10%.',
    brief: 'Placas de quitina: el ácido gástrico ya no te muerde. Pesan: -10 % de velocidad.',
    controls: 'Pasiva: caminas y buceas en el ácido gástrico casi sin daño, aunque corroe más cuanto más rato sigues dentro. Cuerpo a cuerpo golpeas más fuerte (14 -> 18) y el arco del golpe es mayor.',
    effect: 'El ácido apenas te daña (1/s, sube hasta 5/s si te quedas dentro; sin placas, 14/s).',
    drawback: 'Las placas pesan: caminas un 10% más despacio y tus saltos llegan algo menos lejos.',
    lore: 'La piel se cuartea y se endurece en placas que crujen al andar. Pesas más. Sientes menos. Ya no recuerdas el tacto del aire.',
    color: '#8fb4c8',
  },
  quitina2: {
    name: 'Quitina Reforzada',
    line: 'dermis', level: 2, source: 'fragment', requires: ['quitina'],
    dna: '7',
    integrityCost: 8,
    rejection: 15,
    mods: { damageTaken: 0.7, oxygenCap: 0.8 },
    desc: 'Dermis II: -30% de daño enemigo. Placa-hoja en el antebrazo: combo de dos golpes. Oxígeno máximo -20%.',
    brief: 'Coraza que oprime: -30 % de daño, a costa del pulmón (O2 máx. -20 %).',
    controls: 'Pasiva: las placas se solapan en capas. Mordiscos, garras y escupitajos hieren un 30% menos. Al golpear asoma una placa-hoja del antebrazo: dos golpes seguidos (estocada y revés), con más alcance. Ya puedes empuñarla como arma: [R] / R2 cambia entre el cañón y la Cuchilla de Quitina.',
    effect: 'Mantiene la inmunidad al ácido.',
    drawback: 'La coraza te oprime el pecho: tu oxígeno máximo baja un 20 %.',
    lore: 'Capa sobre capa, como una cebolla de hueso. Debajo, en algún sitio, sigue habiendo alguien. Cada vez más lejos de la superficie.',
    color: '#6fa0c8',
  },
  nanocutis: {
    name: 'Dermis Nanocutánea',
    line: 'dermis', level: 3, source: 'fragment', requires: ['quitina2'],
    dna: '8',
    load: 2,
    integrityCost: 8,
    rejection: 20,
    mods: { damageTaken: 0.8, lightDrain: 1.35 },
    immunities: ['spikes', 'status'],
    desc: 'Dermis III: otro -20% de daño, inmune a espinas e infecciones. Cuchilla de Quitina: combo de tres tajos. Tu ojo gasta más luz.',
    brief: 'Piel de circuitos: otro -20 % de daño, inmune a espinas e infecciones. Bebe luz.',
    controls: 'Pasiva: pisas espinas óseas sin daño y las infecciones no prenden en tu carne. La Cuchilla de Quitina ([R] / R2) se completa: combo de tres tajos que te hacen avanzar, el último pesado.',
    effect: 'Daño enemigo acumulado: -44%.',
    drawback: 'Los circuitos se alimentan de fotones: tu ojo gasta energía lumínica un 35% más rápido.',
    lore: 'Algo microscópico teje circuitos entre las placas. Brillan en cian cuando respiras. Tu piel ya no es piel: es un idioma que no entiendes.',
    color: '#4ff0ff',
  },

  // ============================ EXTREMIDADES ===========================
  pistones: {
    name: 'Pistones Biomecánicos',
    line: 'extremidades', level: 1, source: 'key',
    dna: '3',
    ability: 'dash',
    integrityCost: 10,
    rejection: 20,
    mods: { oxygenRegen: 0.75, moveSpeed: 1.2 }, // además corres un 20% más rápido
    desc: 'Extremidades I: doble toque A/D: embestida (25 O2) que revienta membranas y atraviesa criaturas. Corres un 20% más rápido.',
    brief: 'Émbolos en los muslos: embestida que revienta membranas y atraviesa criaturas. Corres +20 %.',
    controls: 'Pulsa dos veces rápido A o D: embestida hacia ese lado (25 O2). Revienta las membranas agrietadas (X) y atraviesa a las criaturas hiriéndolas sin que te toquen. En el aire, alarga el salto.',
    effect: 'Piernas veloces: corres un 20% más rápido y la embestida no se frena con el peso del cuerpo.',
    unlockHint: 'Dos toques rápidos a un lado: embiste. Las membranas agrietadas ya no te detienen.',
    drawback: 'Los émbolos beben de tus pulmones: recuperas el aliento un 25% más lento.',
    lore: 'Te arrancan los tendones de los muslos y en su lugar sisean dos émbolos hidráulicos atornillados al hueso. Ya no caminas: te disparas.',
    color: '#c8a46a',
  },
  garras: {
    name: 'Garras de Hueso',
    line: 'extremidades', level: 2, source: 'key', requires: ['pistones'],
    dna: '4',
    ability: 'wallClimb',
    integrityCost: 8,
    rejection: 15,
    mods: { biomassCap: 0.8 },
    desc: 'Extremidades II: aférrate a las paredes: W trepa, S baja, Espacio te impulsa. Biomasa máx. -20%.',
    brief: 'Brazo de hueso: te aferras a las paredes y trepas. Devora reservas: biomasa máx. -20 %.',
    controls: 'En el aire, empuja contra una pared para clavarte. W trepa, S baja, Espacio te impulsa al lado contrario (8 O2). Arriba del todo te encaramas solo.',
    effect: 'Trepar no gasta aliento; solo el impulso desde la pared.',
    unlockHint: 'En el aire, empuja contra una pared: trepa con W. Busca paredes de carne y repisas altas.',
    drawback: 'Los huesos se alimentan de tu reserva: tu biomasa máxima baja un 20%.',
    lore: 'Los huesos de los dedos perforan la carne buscando algo a lo que aferrarse. Duele. Dejará de doler. Todo deja de doler aquí abajo.',
    color: '#e8dcc8',
  },
  tendon: {
    name: 'Tendón Elástico',
    line: 'extremidades', lines: ['extremidades', 'torso'], level: 3, source: 'key', requires: ['garras', 'alveolos2'],
    dna: '1',
    ability: 'grapple',
    load: 2,
    integrityCost: 12,
    rejection: 25,
    mods: { fireCooldown: 1.25 },
    desc: 'Fusión Extremidades III + Torso III: Q / clic der.: balancéate de garfios, desgarra sellos, arponea criaturas. Cadencia -20%.',
    brief: 'Un tentáculo que se lanza: péndulo en garfios, desgarra sellos y arponea criaturas.',
    controls: 'Q o clic derecho cerca de un garfio de hueso (o; brilla el que vas a coger): el tendón se clava, recoge cuerda y te balanceas como un péndulo. A/D impulsan el balanceo, W recoge cuerda, S la suelta, Espacio te desengancha con toda la inercia (y recuperas el doble salto). Si al soltarte vuelas hacia otro garfio, el tendón se engancha solo: encadénalos. Contra un esfínter sellado (Y) lo desgarras; contra un Acorazado le arrancas la coraza; contra cualquier otra criatura la arponeas y la arrastras hacia ti.',
    effect: 'Requiere Garras de Hueso y Alveolos Hipertrofiados: el brazo tira y el pecho aguanta. Balancearse no gasta aliento.',
    unlockHint: 'Q o clic derecho cerca de un garfio de hueso: te balanceas. A/D para coger impulso, Espacio para soltarte en lo alto del arco. Los sellos (Y) se desgarran.',
    drawback: 'El brazo ya no obedece del todo: disparas un 20% más lento.',
    lore: 'Los tendones del antebrazo se desenrollan como cabos húmedos, anclados en un pecho que ya puede soportar el tirón. Ya no es un brazo: es una cuerda que recuerda haber sido tuya.',
    color: '#ff7a8a',
  },

  // =============================== TORSO ===============================
  alveolos: {
    name: 'Alveolos Filtrantes',
    line: 'torso', level: 1, source: 'key',
    dna: '2',
    ability: 'doubleJump',
    integrityCost: 10,
    rejection: 20,
    mods: { oxygenRegen: 1.6, visibility: 1.5 },
    desc: 'Torso I: doble salto de gas (18 O2). Aliento +60%. Te detectan desde más lejos.',
    brief: 'Sacos de gas en la espalda: doble salto y aliento +60 %. Tu respiración te delata.',
    controls: 'Salta otra vez en el aire (W / Espacio) para impulsarte con un chorro de gas. Cada impulso cuesta 18 de O2.',
    effect: 'Recuperas el aliento un 60% más rápido.',
    unlockHint: 'Tus pulmones te elevan: salta otra vez en el aire. La grieta del techo ya está a tu alcance.',
    drawback: 'Tu pecho brilla en la oscuridad: los enemigos te detectan desde un 50% más lejos.',
    lore: 'Tu pecho se hincha de sacos translúcidos que fermentan un gas verdoso. Respiras dos veces por cada bocanada: una para ti, otra para ellos.',
    color: '#7dff9a',
  },
  alveolos2: {
    name: 'Alveolos Hipertrofiados',
    line: 'torso', level: 2, source: 'key', requires: ['alveolos'],
    dna: '+',
    ability: 'bigLungs',
    integrityCost: 8,
    rejection: 15,
    mods: { oxygenCap: 1.5, jumpCost: 0.6, damageTaken: 1.15 },
    desc: 'Torso II: oxígeno máximo +50% y el doble salto cuesta un 40% menos. Recibes un 15% más de daño.',
    brief: 'Pulmón hipertrofiado: O2 máx. +50 % y doble salto más barato; la carne blanda sufre +15 %.',
    controls: 'Pasiva: los sacos se multiplican hasta llenarte el pecho. Aguantas el doble de esfuerzos seguidos.',
    effect: 'Junto a las Garras, sostiene el Tendón (fusión de nivel III).',
    drawback: 'El pecho hinchado es un blanco blando: recibes un 15% más de daño.',
    lore: 'Los sacos se dividen y se dividen. Tu caja torácica cruje para hacerles sitio. Ya no respiras: te inflas.',
    color: '#4ae07a',
  },

  // =============================== CAÑÓN ===============================
  // Sin el cañón, el arma es tu culata: golpes cuerpo a cuerpo.
  astillas: {
    name: 'Cañón de Astillas',
    line: 'canon', level: 1, source: 'key',
    dna: '%',
    ability: 'gun1',
    integrityCost: 4,
    rejection: 10,
    mods: { biomassCap: 0.9 },
    desc: 'Cañón I: tu antebrazo escupe astillas afiladas de tu reserva de hueso (1 por disparo). Precisas y rápidas.',
    brief: 'El antebrazo se abre en un tubo de hueso: escupe astillas de tu reserva, precisas y rápidas.',
    controls: 'Dispara (clic izquierdo / R1): una astilla recta hacia donde apuntas. Cada una gasta 1 de hueso; sin hueso, golpeas con la culata.',
    effect: 'Por fin puedes herir de lejos.',
    unlockHint: 'Tu antebrazo se abre en un tubo de hueso: dispara con clic izquierdo (o R1). Gasta hueso.',
    drawback: 'El hueso nuevo se rehace de tu reserva: biomasa máxima -10%.',
    lore: 'El radio se te parte a lo largo y se ahueca. Por dentro crecen astillas como dientes de leche. Las escupes. Te crecen otras.',
    color: '#e8dcc8',
  },
  simbionte: {
    name: 'Cañón Simbionte',
    line: 'canon', level: 2, source: 'fragment', requires: ['astillas'],
    dna: '5',
    ability: 'symbiontGun',
    integrityCost: 8,
    rejection: 15,
    mods: {},
    hunger: 0.15,
    desc: 'Cañón II: ráfagas de espinas de plasma alimentadas con tu biomasa; revientan las membranas agrietadas. Tiene hambre constante.',
    brief: 'Un cañón vivo: ráfagas de espinas de plasma que devoran tu biomasa sin parar.',
    controls: 'Mantén el disparo: ráfagas automáticas de espinas de plasma (1,35 de biomasa por ráfaga). Al agotar la biomasa el cañón se vacía y escupe un glóbulo incandescente que sigue quemando. [R] cambia de arma.',
    effect: 'Sus disparos revientan las membranas agrietadas (X), como la embestida. No gasta hueso.',
    drawback: 'Tiene hambre: devora 0,15 de biomasa por segundo, dispares o no.',
    lore: 'El tubo de hueso se abre como una flor de carne y se suelda a tu antebrazo. Late. Tiene hambre. La alimentas con lo que eres.',
    color: '#ff4ad8',
  },
  escopeta: {
    name: 'Escopeta de Esquirlas',
    line: 'canon', level: 3, source: 'fragment', requires: ['simbionte'],
    dna: '$',
    ability: 'shotgun',
    load: 2,
    integrityCost: 8,
    rejection: 20,
    mods: {},
    desc: 'Cañón III: escopeta recortada de carne y hueso. Un abanico de esquirlas a quemarropa que derriba y empuja. 2 de biomasa y 1 de hueso por disparo.',
    brief: 'Abanico de esquirlas a quemarropa que derriba y empuja. Cara: biomasa y hueso por disparo.',
    controls: 'Dispara: siete esquirlas en abanico, devastadoras de cerca. El retroceso te empuja hacia atrás. Recarga en 0,8 s. [R] cambia de arma.',
    effect: 'Revienta lo que tengas delante y lo aparta, membranas agrietadas incluidas.',
    drawback: 'Lenta y cara: cada disparo cuesta biomasa y hueso, y el retroceso te desplaza.',
    lore: 'El cañón se ensancha y se acorta, hueso sobre hueso, hasta que la boca del arma es más ancha que tu puño. Ya no dispara: escupe.',
    color: '#ffb040',
  },
};

// Nivel en números romanos (para las fichas).
export const ROMAN = ['', 'I', 'II', 'III'];
export const linesOf = (m) => m.lines ?? [m.line];

export const DNA_CHARS = Object.fromEntries(
  Object.entries(MUTATIONS).map(([id, m]) => [m.dna, id]),
);
