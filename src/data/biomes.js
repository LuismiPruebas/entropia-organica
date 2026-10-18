// Biomas: cada "sistema" del organismo tiene su familia de color, su tejido, sus
// brotes, su fondo y su paisaje sonoro. Todo es carne: solo el protagonista es
// biomecánico. Las salas eligen bioma en data/levels.js.
//
//   palette  colores de tejido que usan las piezas de la sala (membranas, gotas...)
//   material tejido de las paredes: 'fibrous' | 'spongy' | 'villous' | 'muscle'
//   growth   lo que brota de techos y paredes: 'nerves' | 'alveoli' | 'villi' | 'chordae'
//   growthDensity  0..1, cuánto brota
//   bg       colores base del fondo (el fondo lejano lo pinta factory/Backdrop.js)
//   ambient  luz ambiente (rgb, teñida con la familia del bioma): lo que se ve sin el ojo
//   sound    receta del paisaje sonoro (core/Audio.js -> setBiome)
//   mapColor color de sus salas en el mapa
//   fragments  tipos de fragmento de ADN que dejan los fragmentos fijos ('*') de sus
//              salas (rotan por posición); las criaturas sueltan el suyo (enemies.js)

export const BIOMES = {
  nervioso: {
    name: 'Sistema Nervioso',
    palette: { flesh: '#8a2a5a', fleshLight: '#c8509a', fleshDark: '#4a1438', vein: '#6a2050' },
    material: 'fibrous',
    growth: 'nerves',
    growthDensity: 0.45,
    bg: { base: '#2a1238' },
    camo: '#3a1648', // las criaturas sin alumbrar se tiñen de esto
    // Violeta y magenta: la penumbra deja ver el tejido nervioso.
    ambient: [0.25, 0.19, 0.29],
    // Silencio habitado: sin zumbido de fondo; de vez en cuando emergen chasquidos,
    // notas de cristal, gemidos metálicos o susurros.
    sound: { drone: 43.6, wave: 'sine', filter: 120, q: 1, lfo: 0.1, level: 0, bed: { freq: 2400, q: 2, level: 0.004 }, layer: 'emergent',
      // Versión de fondo de 'Chitinous Clicks' (solo sus pasajes tranquilos, más grave, sin agudos,
      // volumen plano y reverberación). Se alterna con el ambiente: suena entera cada 40-90 s.
      music: { src: 'assets/music/chitinous-fondo.mp3', vol: 0.6, first: 15, gap: [40, 90], duck: 0.55 } },
    mapColor: '#b0283a',
    fragments: ['neural', 'ocular', 'balistico'],
  },
  pulmonar: {
    name: 'Cavidad Pulmonar',
    palette: { flesh: '#c8606a', fleshLight: '#f0a0a8', fleshDark: '#6a2a38', vein: '#a04a58' },
    material: 'spongy',
    growth: 'alveoli',
    growthDensity: 0.45,
    bg: { base: '#18202c' },
    camo: '#1c2532',
    // Azul grisáceo de pulmón frío (pizarra), con las venas y los acentos en rojo coral.
    ambient: [0.16, 0.18, 0.22],
    // Respiración y un arpegio lento y siniestro en menor; apenas un aire de fondo.
    sound: { drone: 32.7, wave: 'triangle', filter: 160, q: 1, lfo: 0.21, level: 0.022, bed: { freq: 520, q: 0.6, level: 0.04 }, layer: ['breath', 'arpeggio'], layerGain: 2 },
    mapColor: '#8aa0c4',
    fragments: ['ocular', 'dermal', 'neural'],
  },
  digestivo: {
    name: 'Sistema Digestivo',
    palette: { flesh: '#8a7622', fleshLight: '#e8d070', fleshDark: '#3a2a0c', vein: '#7a4a1e' },
    material: 'villous',
    growth: 'mucus', // goterones de mucosa colgando de los techos
    growthDensity: 0.5,
    bg: { base: '#4a2a0c' },
    camo: '#4a3e10',
    // Ámbar, mostaza y oliva, con la bilis verde-amarilla como acento.
    ambient: [0.21, 0.17, 0.12],
    // Tripa viva: un retumbo grave y húmedo, peristalsis que gorgotea y fluidos.
    sound: { drone: 41.2, wave: 'triangle', filter: 220, q: 1.5, lfo: 0.12, level: 0.04, bed: { freq: 140, q: 1, level: 0.04 }, layer: ['peristalsis', 'fluids'] },
    mapColor: '#d09a4a',
    fragments: ['dermal', 'balistico', 'ocular'],
  },
  corazon: {
    name: 'El Corazón',
    palette: { flesh: '#aa2236', fleshLight: '#f07080', fleshDark: '#5a0a18', vein: '#8a1424' },
    material: 'muscle',
    growth: 'chordae',
    growthDensity: 0.4,
    bg: { base: '#5a0a18' },
    camo: '#5a0e1e',
    // Carmesí y escarlata: dentro del corazón todo late en rojo.
    ambient: [0.23, 0.12, 0.13],
    // Dentro del corazón: un grave que palpita con el latido y la sangre corriendo.
    sound: { drone: 27.5, wave: 'sine', filter: 140, q: 1, lfo: 0.95, level: 0.03, bed: { freq: 90, q: 0.8, level: 0.02 }, layer: 'heart' },
    mapColor: '#ff3b4a',
    fragments: [],
  },
  // Territorio del Hueso: la región que la Médula Espinal sostiene por detrás. Hueso
  // compacto y esponjoso, costillas y espolones; lo habitan los escarabajos
  // rinoceronte, que conocen la quitina, y los Vestigios.
  oseo: {
    name: 'Territorio del Hueso',
    palette: { flesh: '#7a3a2a', fleshLight: '#c8a888', fleshDark: '#3a1a12', vein: '#5a1a14' },
    material: 'osseous',
    growth: 'spurs',
    growthDensity: 0.45,
    bg: { base: '#2e1a14' },
    camo: '#3e2a20',
    // Sepia, marfil y sangre reseca.
    ambient: [0.2, 0.16, 0.14],
    // Un osario por donde pasa el viento: un tubo hueco que resuena (el lecho estrecho y
    // un zumbido que se hincha despacio), huesos que silban y campanillas de hueso.
    sound: { drone: 36.7, wave: 'triangle', filter: 160, q: 3, lfo: 0.05, level: 0.028, bed: { freq: 520, q: 6, level: 0.012 }, hum: { wave: 'sine', freq: 73.4, level: 0.012, trem: 0.13 }, layer: 'ossuary' },
    mapColor: '#c8b090',
    fragments: ['balistico', 'dermal', 'balistico'],
  },
  // Sistema Circulatorio: los vasos por donde el Corazón empuja la sangre. Todo late al
  // mismo pulso (entities/Blood.js): charcas que suben con cada golpe, arterias que
  // escupen a presión, válvulas que se abren y se cierran y ventrículos que bombean.
  circulatorio: {
    name: 'Sistema Circulatorio',
    palette: { flesh: '#8a1430', fleshLight: '#ff7a96', fleshDark: '#2a0410', vein: '#3a2a8a' },
    material: 'vascular',
    growth: 'capillaries',
    growthDensity: 0.45,
    bg: { base: '#22040e' },
    camo: '#3a0a1c',
    // Granate y escarlata, con capilares azules y violetas.
    ambient: [0.2, 0.09, 0.13],
    sound: { drone: 30.9, wave: 'sine', filter: 180, q: 1.2, lfo: 0.62, level: 0.03, bed: { freq: 300, q: 1, level: 0.016 }, layer: 'bloodstream' },
    mapColor: '#e0306a',
    fragments: ['dermal', 'balistico', 'ocular'],
  },
};
