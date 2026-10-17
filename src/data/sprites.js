// Pixel art indexado por paleta (estilo 16 bits). Cada carácter es un color de
// PALETTE; '.' es transparente. `glow` lista los caracteres que además emiten
// luz propia (se pintan en la capa de brillo, visibles en la oscuridad).

export const PALETTE = {
  k: '#140c10', // contorno
  h: '#6b6f5a', H: '#4a4d3e', // casco
  v: '#9fd3c7', // visor
  s: '#b0703c', S: '#6e4224', // mono de trabajo
  g: '#2e2a2a', // botas / guantes
  b: '#4a5048', // depósito
  l: '#ffe9a0', // lámpara
  n: '#8f8f8f', // metal
  r: '#7a2a34', R: '#a8424e', p: '#4a1a20', // carne
  Y: '#ff3b2f', // ojos
  w: '#e8dcc8', // blanco / hueso
  f: '#c46a6a', F: '#7d3a3c', // tendón
  G: '#7dff9a', // gas alveolar
  a: '#7c8790', A: '#4b535b', // coraza
  B: '#c0283a', // biomasa
  y: '#ffd23f', // batería
  e: '#9a9a9a', E: '#5a5a5a', // metal gris (batería)
  m: '#5bd0ff', // oxígeno
  q: '#c07bff', // ADN
  i: '#7f93ab', I: '#46536a', // prótesis / chapa
  c: '#4ff0ff', // óptico cibernético
  T: '#6a2a52', // tubos de fluido
  // --- Protagonista bio-cibernético ---
  W: '#eeeae2', V: '#9a9aa8', // pelo blanco
  u: '#c98a5e', M: '#9a5a36', U: '#5e3020', // músculo cobrizo
  d: '#1e2538', D: '#34426a', x: '#6a80aa', // armadura
  J: '#d89a70', L: '#8a5236', // piel de la cara
  o: '#ff2a2a', // el ojo fotóforo: rojo saturado; de él sale la luz
  Z: '#e0303a', // luces rojas de la armadura
  P: '#ff4ad8', j: '#9a2a8a', // plasma del cañón orgánico
  t: '#d8b48a', // espinas óseas
  z: '#7a8a2a', K: '#3a4410', C: '#d8d070', // saco de esporas
};

// Protagonista bio-cibernético (mira a la derecha), 16x23 (con la fila vacía superior). Pelo blanco en punta,
// ojo fotóforo (o) que ilumina el camino, armadura negro-azulada con músculo
// cobrizo al descubierto y un lanzador de clavos metálico (n/E) que la mutación
// Cañón Simbionte convierte en carne espinosa con punta de plasma (P).
const PLAYER_TOP = [
  '......W..W......',
  '....V.WWWWW.....',
  '...VWWWWWWWW....',
  '..VWWWVWWWWk....',
  '...VWVkLJJJk....',
  '....VkLJJok.....',
  '.....kLJLJk.....',
  '......kLLk......',
  '...kkDDkkDDDk...',
  '..kDxDMuuMDxDk..',
  '.kuMkDMuMMDDk...',
  '.kuMkDDMMDDknnnk',
  '.kuUkdZDDZdkEnnn',
  '.kUukdDDDDdkEEEk',
  '..kUkkdDDdk.kkk.',
];

// Fila vacía arriba: deja sitio para que la cabeza suba al respirar (sprite de 16x23).
const EMPTY_ROW = '................';

const IDLE_LEGS = [
  '....kdDkdDk.....',
  '....kdxkdxk.....',
  '....kdDkdDk.....',
  '....kdDkkdDk....',
  '...kdDk.kdDk....',
  '...kxDk.kxDk....',
  '..kkkkk.kkkkk...',
];

export const SPRITES = {
  player: {
    frames: {
      idle: [EMPTY_ROW, ...PLAYER_TOP, ...IDLE_LEGS],
      // Inspiración: torso y cabeza suben un píxel (la cintura se estira).
      idle2: [...PLAYER_TOP, PLAYER_TOP[14], ...IDLE_LEGS],
      walk1: [EMPTY_ROW, ...PLAYER_TOP,
        '....kdDkdDk.....',
        '...kdxk.kdxk....',
        '...kdDk..kdDk...',
        '..kdDk...kdDk...',
        '..kdDk....kdDk..',
        '..kxDk....kxDk..',
        '.kkkkk....kkkkk.'],
      walk2: [EMPTY_ROW, ...PLAYER_TOP,
        '....kdDdDk......',
        '....kdxDxk......',
        '.....kdDk.......',
        '.....kdDk.......',
        '.....kdDk.......',
        '.....kxDk.......',
        '....kkkkk.......'],
      jump: [EMPTY_ROW, ...PLAYER_TOP,
        '....kdDkdDk.....',
        '...kdxk.kdxk....',
        '..kdDk...kdDk...',
        '..kxDk...kxDk...',
        '.kkkk.....kkkk..',
        '................',
        '................'],
    },
    glow: 'oZPGcy',
  },

  crawler: {
    frames: {
      a: [
        '................',
        '......kkkk......',
        '....kkrrRRkk....',
        '..kkrrRRRRRrkk..',
        '.krrRRrrrrrRRrk.',
        'krrRrrYrrrYrrRrk',
        'krRRrrrrrrrrrRRk',
        '.kkrkkpkkpkkrkk.',
        '.kp.kp...kp.kpk.',
        'kp...p....p...pk',
      ],
      b: [
        '................',
        '......kkkk......',
        '....kkrrRRkk....',
        '..kkrrRRRRRrkk..',
        '.krrRRrrrrrRRrk.',
        'krrRrrYrrrYrrRrk',
        'krRRrrrrrrrrrRRk',
        '.kkrkkpkkpkkrkk.',
        '..kp.kp.kp.kp.k.',
        '.kp..p..p..p..k.',
      ],
    },
    glow: 'Y',
  },

  eye: {
    frames: {
      open: [
        'kkkkkkkkkkkk',
        '.krrrrrrrrk.',
        '..krRRRRrk..',
        '..kRwwwwRk..',
        '.kRwwYYwwRk.',
        '.kRwYkkYwRk.',
        '.kRwwYYwwRk.',
        '..kRwwwwRk..',
        '...kRRRRk...',
        '....kkkk....',
      ],
      closed: [
        'kkkkkkkkkkkk',
        '.krrrrrrrrk.',
        '..krRRRRrk..',
        '..kRRRRRRk..',
        '.kRRRRRRRRk.',
        '.kkkkkkkkkk.',
        '.kRRRRRRRRk.',
        '..kRRRRRRk..',
        '...kRRRRk...',
        '....kkkk....',
      ],
    },
    glow: 'Y',
  },

  armored: {
    frames: {
      a: [
        '..................',
        '.......kkkk.......',
        '.....kkaaaakk.....',
        '...kkaaAaaAaakk...',
        '..kaaAaaAaaAaaak..',
        '.kaAaaAaaAaaAaaAk.',
        'kaaaaaaaaaaaaaaaak',
        'kAAAAAAAAAAAAAAAAk',
        'krrYrrrrrrrrrrYrrk',
        '.kkrkkpkkpkkpkrkk.',
        '.kp.kp..kp..kp.kp.',
        'kp...p...p...p...k',
      ],
      b: [
        '..................',
        '.......kkkk.......',
        '.....kkaaaakk.....',
        '...kkaaAaaAaakk...',
        '..kaaAaaAaaAaaak..',
        '.kaAaaAaaAaaAaaAk.',
        'kaaaaaaaaaaaaaaaak',
        'kAAAAAAAAAAAAAAAAk',
        'krrYrrrrrrrrrrYrrk',
        '.kkrkkpkkpkkpkrkk.',
        '..kp.kp.kp.kp.kp..',
        '.kp..p..p..p..p.k.',
      ],
    },
    glow: 'Y',
  },

  heart: {
    frames: {
      a: [
        '....kkk..kkk....',
        '...kRRRkkRRRk...',
        '..kRRrRRRRrRRk..',
        '.kRrrRRRRRRrrRk.',
        '.kRrRRRYYRRRrRk.',
        '.kRRRRYYYYRRRRk.',
        '.kRRRRRYYRRRRRk.',
        '..kRRRRRRRRRRk..',
        '...kRRrRRrRRk...',
        '....kRRRRRRk....',
        '.....kRRRRk.....',
        '......kRRk......',
        '.......kk.......',
      ],
    },
    glow: 'Y',
  },

  // Neurona: célula flotante con dendritas que chisporrotean.
  neuron: {
    frames: {
      a: [
        '....m...m...',
        '.m..q..q..m.',
        '..q.qqqq.q..',
        '...qqqqqq...',
        'mqqqqyyqqqqm',
        '..qqyyyyqq..',
        '..qqyyyyqq..',
        'mqqqqyyqqqqm',
        '...qqqqqq...',
        '..q.qqqq.q..',
        '.m..q..q..m.',
        '....m...m...',
      ],
      b: [
        '...m.....m..',
        'm...q..q...m',
        '..q.qqqq.q..',
        '...qqqqqq...',
        '.qqqqyyqqqq.',
        'm.qqyyyyqq.m',
        'm.qqyyyyqq.m',
        '.qqqqyyqqqq.',
        '...qqqqqq...',
        '..q.qqqq.q..',
        'm...q..q...m',
        '...m.....m..',
      ],
    },
    glow: 'ym',
  },

  // Saco de esporas: revienta si te acercas y deja una nube infecciosa.
  spore: {
    frames: { a: [
      '....kkkk....',
      '..kkzzzzkk..',
      '.kzzCzzCzzk.',
      '.kzCCzzzzzk.',
      'kzzzzzCzzzzk',
      'kzzCzzzzCzzk',
      '.kzzzzzzzzk.',
      '..kKzzzzKk..',
      '..kKKkkKKk..',
      '.kK.kK.Kk.k.',
    ] },
    glow: 'C',
  },

  // --- Jefes de zona ---
  // Ganglio Madre (Sistema Nervioso): una neurona colosal con un núcleo que ve.
  gangliomadre: {
    frames: { a: [
      '.....m.....m.....m......',
      '......q....q....q.......',
      '..m....q...q...q....m...',
      '...q...qqqqqqqqq...q....',
      '....q.qqqqqqqqqqq.q.....',
      '.....qqqqqyyyyqqqqq.....',
      'm...qqqqyyyyyyyyqqqq...m',
      '.qqqqqqyyyyyyyyyyqqqqqq.',
      '....qqqyyyykkyyyyqqq....',
      '....qqqyyykkkkyyyqqq....',
      '....qqqyyykkkkyyyqqq....',
      '....qqqyyyykkyyyyqqq....',
      '.qqqqqqyyyyyyyyyyqqqqqq.',
      'm...qqqqyyyyyyyyqqqq...m',
      '.....qqqqqyyyyqqqqq.....',
      '....q.qqqqqqqqqqq.q.....',
      '...q...qqqqqqqqq...q....',
      '..m....q...q...q....m...',
      '......q....q....q.......',
      '.....m.....m.....m......',
    ] },
    glow: 'ym',
  },
  // Bronquio Matriarca (Cavidad Pulmonar): el saco del que nacen todas las esporas.
  matriarca: {
    frames: { a: [
      '..........kkkkkkkk..........',
      '.......kkkzzzzzzzzkkk.......',
      '.....kkzzzzCzzzzCzzzzkk.....',
      '....kzzzCCzzzzzzzzCCzzzk....',
      '...kzzzzzzzzzCCzzzzzzzzzk...',
      '..kzzCzzzzzzzzzzzzzzzCzzzk..',
      '..kzzzzzzzkkkkkkzzzzzzzzzk..',
      '.kzzzzzzzkYYYYYYkzzzzzCzzzk.',
      '.kzzCzzzzkYkkkkYkzzzzzzzzzk.',
      '.kzzzzzzzkYYYYYYkzzzzzzzzzk.',
      '.kzzzzzzzzkkkkkkzzzzzzCzzzk.',
      '..kzzzzCzzzzzzzzzzzzzzzzzk..',
      '..kKzzzzzzzzzzCzzzzzzzzKzk..',
      '...kKKzzzzzzzzzzzzzzzzKKk...',
      '....kKKKzzzzzzzzzzzzKKKk....',
      '...kK.kKKKKKkkkkKKKKKk.Kk...',
      '..kK..kK..kK....kK..kK..Kk..',
      '.kK..kK...kK....kK...kK..Kk.',
    ] },
    glow: 'CY',
  },
  // Fragmento de ADN: media hélice. Tres del mismo bioma completan una mutación.
  fragment: {
    frames: { a: [
      '...q....',
      '..q.q...',
      '...qq...',
      '..q..q..',
      '...qq...',
      '..q.q...',
      '...q....',
      '........',
    ] },
    glow: 'q',
  },

  biomass: {
    frames: { a: [
      '...BB...',
      '..BRRB..',
      '.BRRBBB.',
      '.BBBBBB.',
      '.BBBBpB.',
      '..BBBB..',
      '...pp...',
      '........',
    ] },
    glow: '',
  },
  battery: {
    frames: { a: [
      '...kk...',
      '..kyyk..',
      '..kyyk..',
      '..kyyk..',
      '..kEEk..',
      '..kyyk..',
      '..kyyk..',
      '..kkkk..',
    ] },
    glow: 'y',
  },
  // Perla de Nácar (invulnerabilidad): una perla irisada que brilla en cian.
  pearl: {
    frames: { a: [
      '..kkkk..',
      '.kwwcck.',
      'kwWwwcck',
      'kwwwwwck',
      'kcwwwwck',
      'kccwwcck',
      '.kcccck.',
      '..kkkk..',
    ] },
    glow: 'c',
  },
  // Célula Madre (regeneración): una célula verde con el núcleo en cruz.
  stemcell: {
    frames: { a: [
      '..kkkk..',
      '.kGGGGk.',
      'kGGwwGGk',
      'kGwwwwGk',
      'kGwwwwGk',
      'kGGwwGGk',
      '.kGGGGk.',
      '..kkkk..',
    ] },
    glow: 'G',
  },
  // Hueso: un hueso astillado (munición de las astillas y moneda de los úteros).
  scrap: {
    frames: { a: [
      '.ww.....',
      'wwwt....',
      '.wtwt...',
      '..twt...',
      '...twt..',
      '....twtw',
      '.....www',
      '......w.',
    ] },
    glow: '',
  },
  oxygen: {
    frames: { a: [
      '..kkkk..',
      '.kmmmmk.',
      'kmkmmkmk',
      'kmmkkmmk',
      'kmmkkmmk',
      'kmkmmkmk',
      '.kmmmmk.',
      '..kkkk..',
    ] },
    glow: 'm',
  },
  cyst: {
    frames: { a: [
      '..kkkk..',
      '.kRBBRk.',
      'kRBRRBRk',
      'kBRYRRBk',
      'kBRRRRBk',
      'kRBRRBRk',
      '.kRBBRk.',
      '..kkkk..',
    ] },
    glow: 'Y',
  },
  thymus: {
    // Timo Necrótico: glándula bilobulada, pálida, con un núcleo que aún late.
    frames: { a: [
      '..kRRk..',
      '.kRwwRk.',
      'kRwGGwRk',
      'kRGGGGRk',
      'kRwGGwRk',
      '.kRwwRk.',
      '..kRRk..',
      '...kk...',
    ] },
    glow: 'G',
  },
  // Coágulo de plasma: una gota de sangre espesa con el corazón encendido.
  plasma: {
    frames: { a: [
      '...kk...',
      '..kBBk..',
      '..kBRk..',
      '.kBRoRk.',
      'kBRoooRk',
      'kBRooRBk',
      '.kBRRBk.',
      '..kkkk..',
    ] },
    glow: 'o',
  },
  tissue: {
    frames: { a: [
      '...ff...',
      '..fwwf..',
      '.fwGGwf.',
      'fwGGGGwf',
      'fwGGGGwf',
      '.fwGGwf.',
      '..fwwf..',
      '...ff...',
    ] },
    glow: 'G',
  },
  dna: {
    frames: { a: [
      '.q....q.',
      '..q..q..',
      '...qq...',
      '..q..q..',
      '.q....q.',
      '..q..q..',
      '...qq...',
      '..q..q..',
    ] },
    glow: 'q',
  },
};
