// Voces de las criaturas: cada una con su firma reconocible a oscuras (su llamada),
// su alerta al descubrirte y su quejido al recibir daño. Se apoyan en AudioSys.voice
// (garganta con entonación, vocales, gruñido y aliento) y AudioSys.knock (golpe con
// cuerpo, de hueso o quitina) en lugar de ráfagas de ruido secas.
// Las usa core/Audio.js (se suman a SOUNDS); cada criatura las elige en data/enemies.js
// (`voice`: llamadas sueltas; `sounds`: reveal, hurt, attack...).

const rnd = (a, b) => a + Math.random() * (b - a);

// Vocales (formantes de una garganta adulta); k las escala: <1 bestia grande, >1 pequeña.
const V = {
  a: [[750, 6, 1], [1200, 7, 0.6], [2600, 9, 0.2]],
  o: [[450, 6, 1], [800, 7, 0.5], [2600, 9, 0.1]],
  u: [[320, 6, 1], [750, 7, 0.4], [2400, 9, 0.08]],
  e: [[500, 6, 1], [1800, 8, 0.5], [2600, 9, 0.2]],
  i: [[300, 6, 1], [2300, 9, 0.6], [3000, 10, 0.3]],
  m: [[280, 8, 1], [1000, 10, 0.12], [2200, 10, 0.04]],
};
const F = (v, k = 1) => V[v].map(([f, q, g]) => [f * k, q, g]);
// Aliento puro: solo aire por un tubo (inspirar, resoplar, sisear).
const air = (a, o, { f0 = 600, f1 = f0, q = 2.5, dur, vol, attack = 0.03, release = 0.5, delay = 0 }) =>
  a.voice(o, { f0: 50, dur, vol, wave: 'sine', breath: 1, formants: [[f0, q, 1]], to: [[f1]], attack, release, vibDepth: 0, delay });

export const VOICES = {
  // ---------------------------------------------------------------- Neurona
  // Firma: un motivo de tres notas eléctricas (sube, sube más, cae), siempre igual.
  neuronWarble: (a, o) => {
    const b = rnd(720, 880);
    [[b, 0], [b * 1.5, 0.1], [b * 1.26, 0.2]].forEach(([f, d], i) =>
      a.voice(o, { f0: f, f1: f * (i === 2 ? 1.08 : 1), dur: i === 2 ? 0.2 : 0.09, vol: 0.4, wave: 'triangle', vib: 30, vibDepth: 0.03, formants: [[1800, 2, 1]], attack: 0.008, release: 0.5, delay: d }));
    for (let i = 0; i < 3; i++) a.knock(o, { f: rnd(3500, 5000), q: 6, dur: 0.03, vol: 0.06, delay: rnd(0, 0.35) });
  },
  neuronAlert: (a, o) => a.voice(o, { pitch: [[0, 600], [0.7, 1900], [1, 1700]], dur: 0.4, vol: 0.4, wave: 'triangle', vib: 24, vibDepth: 0.04, formants: [[1600, 2, 1]], attack: 0.02 }),
  // Dolor: un gemido agudo que tiembla, con una chispa que se le escapa (no un pitido).
  neuronHurt: (a, o) => { a.voice(o, { pitch: [[0, rnd(820, 900)], [0.22, rnd(1080, 1180)], [1, 600]], dur: 0.24, vol: 0.45, breath: 0.35, growl: 0.3, growlRate: 38, vib: 9, vibDepth: 0.03, formants: F('e', 1.3), attack: 0.02 }); a.knock(o, { f: rnd(3200, 4200), q: 8, dur: 0.04, vol: 0.04, delay: 0.03 }); },

  // ---------------------------------------------------------------- Enjambre
  // Firma: un coro de gargantas que zumban como alas y se hinchan juntas.
  swarmBuzz: (a, o) => {
    for (let i = 0; i < 4; i++) a.voice(o, { f0: rnd(170, 260), f1: rnd(180, 280), dur: 0.9, vol: 0.22, growl: 0.8, growlRate: rnd(18, 26), breath: 0.2, formants: [[rnd(900, 1300), 3, 1]], attack: 0.25, release: 0.5, delay: i * 0.05 });
  },
  swarmAlert: (a, o) => { for (let i = 0; i < 3; i++) a.voice(o, { pitch: [[0, rnd(300, 380)], [1, rnd(900, 1100)]], dur: 0.45, vol: 0.25, growl: 0.6, growlRate: 24, formants: F('e', 1.5), delay: i * 0.04 }); },
  swarmHurt: (a, o) => { for (let i = 0; i < 3; i++) a.voice(o, { pitch: [[0, rnd(600, 750)], [0.3, rnd(900, 1050)], [1, rnd(480, 580)]], dur: 0.17, vol: 0.32, breath: 0.3, growl: 0.2, growlRate: 30, vib: 8, formants: F('e', 1.25), attack: 0.02, delay: i * rnd(0.05, 0.08) }); },

  // ---------------------------------------------------------------- Célula
  // Firma: "piu-piu", pitidos de pájaro enfermo.
  cellChirp: (a, o) => {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) a.voice(o, { pitch: [[0, 2300], [0.3, 2900], [1, 1800]], dur: 0.07, vol: 0.45, wave: 'triangle', vibDepth: 0, formants: [[2600, 3, 1]], attack: 0.005, delay: i * 0.09 });
  },
  // Dolor: un gritito diminuto, como un ratón (aire y garganta, no un pitido).
  cellHurt: (a, o) => a.voice(o, { pitch: [[0, rnd(1300, 1450)], [0.3, rnd(1650, 1800)], [1, 1100]], dur: 0.11, vol: 0.4, breath: 0.3, vib: 12, vibDepth: 0.02, formants: [[1500, 4, 1], [3000, 6, 0.25]], attack: 0.012 }),

  // ---------------------------------------------------------------- Polinizador
  // Alas de insecto y una garganta que fue de persona.
  // Firma (vuela): el zumbido grave de las alas y, encima, un "mmm" humano que se queja.
  pollBuzz: (a, o) => {
    a.voice(o, { f0: rnd(120, 145), f1: rnd(115, 150), dur: 1, vol: 0.3, growl: 1, growlRate: rnd(28, 34), growlWave: 'square', breath: 0.15, formants: [[700, 3, 1]], attack: 0.2, release: 0.4 });
    a.voice(o, { pitch: [[0, rnd(150, 165)], [0.5, 140], [1, 112]], dur: 0.8, vol: 0.5, growl: 0.15, vib: 5, formants: F('m'), attack: 0.08, delay: 0.15 });
  },
  // Ataque (carga y se lanza): un grito humano que crece de "a" a "e", rasgado, con las
  // alas subiendo a un chillido detrás.
  pollScream: (a, o) => {
    a.voice(o, { pitch: [[0, rnd(230, 260)], [0.45, rnd(430, 470)], [1, rnd(520, 560)]], dur: 0.7, vol: 0.6, breath: 0.4, growl: 0.45, growlRate: 34, vib: 7, formants: F('a'), to: F('e'), attack: 0.05, release: 0.35 });
    a.voice(o, { f0: 300, f1: 760, dur: 0.6, vol: 0.22, growl: 1, growlRate: 40, growlWave: 'square', formants: [[1400, 3, 1]], attack: 0.1 });
  },
  // Herido: un "¡ah!" humano corto y el crujido de la quitina.
  pollHurt: (a, o) => {
    a.voice(o, { pitch: [[0, rnd(360, 400)], [0.25, rnd(460, 500)], [1, 250]], dur: 0.3, vol: 0.6, breath: 0.35, growl: 0.25, growlRate: 30, vib: 8, formants: F('a'), attack: 0.015 });
    a.knock(o, { f: rnd(2400, 3000), q: 6, dur: 0.05, vol: 0.12 });
  },
  // Muere: un lamento humano que cae de "o" a "u" mientras las alas se atascan y se paran,
  // y el golpe sordo del cuerpo.
  pollDie: (a, o) => {
    a.knock(o, { f: rnd(110, 140), q: 2, dur: 0.35, vol: 0.4 });
    a.voice(o, { pitch: [[0, rnd(400, 440)], [0.25, rnd(470, 500)], [1, 105]], dur: 1.4, vol: 0.6, breath: 0.3, growl: 0.4, growlRate: 26, vib: 6, formants: F('o'), to: F('u'), attack: 0.03, release: 0.5 });
    a.voice(o, { f0: 150, f1: 55, dur: 1.2, vol: 0.28, growl: 1, growlRate: 30, growlWave: 'square', formants: [[600, 3, 1]], attack: 0.05, delay: 0.1 });
    a.knock(o, { f: 90, q: 2, dur: 0.3, vol: 0.3, delay: 1.3 });
  },

  // ---------------------------------------------------------------- Ojo de Techo
  // Firma: un parpadeo húmedo y un "mmm" grave de atención, con la boca cerrada.
  eyeSquelch: (a, o) => {
    air(a, o, { f0: 500, f1: 1300, q: 4, dur: 0.14, vol: 0.3, attack: 0.02 });
    a.voice(o, { pitch: [[0, 118], [0.5, 112], [1, 104]], dur: 0.7, vol: 0.55, growl: 0.15, vib: 4, formants: F('m'), delay: 0.12 });
  },
  eyeAlert: (a, o) => a.voice(o, { pitch: [[0, 105], [1, 175]], dur: 0.5, vol: 0.55, vib: 5, formants: F('m'), attack: 0.06 }),
  // Dolor: el globo se aplasta (chasquido húmedo) y gime con la boca cerrada.
  eyeHurt: (a, o) => {
    air(a, o, { f0: 1800, f1: 500, q: 3, dur: 0.07, vol: 0.35, attack: 0.005 });
    a.voice(o, { pitch: [[0, 175], [0.25, 190], [1, 118]], dur: 0.38, vol: 0.55, growl: 0.25, vib: 5, formants: F('m'), attack: 0.02, delay: 0.04 });
  },

  // ---------------------------------------------------------------- Saco Esporífero
  // Firma: inspira con un silbido que sube y suelta el aire en un resoplido.
  sacInhale: (a, o) => {
    air(a, o, { f0: 400, f1: 1600, q: 3, dur: 0.8, vol: 0.32, attack: 0.35, release: 0.15 });
    a.voice(o, { f0: 1500, f1: 1750, dur: 0.5, vol: 0.06, wave: 'sine', formants: [[1600, 6, 1]], attack: 0.2, delay: 0.25 });
    air(a, o, { f0: 900, f1: 260, q: 2, dur: 0.45, vol: 0.35, attack: 0.02, delay: 0.85 });
  },
  // Dolor: se desinfla por el pinchazo (aire que escapa) y borbotea por dentro.
  sacHurt: (a, o) => {
    air(a, o, { f0: 1500, f1: 380, q: 4, dur: 0.32, vol: 0.4, attack: 0.008, release: 0.3 });
    for (let i = 0; i < 3; i++) { const f = rnd(220, 380); a.voice(o, { f0: f, f1: f * 1.8, dur: 0.05, vol: 0.18, wave: 'sine', vibDepth: 0, formants: [[f * 1.5, 1.5, 1]], attack: 0.005, delay: 0.1 + i * 0.06 }); }
  },

  // ---------------------------------------------------------------- Fauce Colgante
  // Firma: dientes que castañetean con cuerpo, un sorbo húmedo y un gruñido de hambre.
  podChatter: (a, o) => {
    let t = 0;
    for (let i = 0; i < 6; i++) { a.knock(o, { f: rnd(1100, 1400), q: 12, dur: 0.07, vol: 0.25, delay: t }); t += 0.075 - i * 0.006; }
    air(a, o, { f0: 600, f1: 1500, q: 3, dur: 0.3, vol: 0.25, delay: t + 0.05 });
    a.voice(o, { pitch: [[0, 130], [1, 105]], dur: 0.4, vol: 0.4, growl: 0.7, growlRate: 26, formants: F('o', 0.9), delay: t + 0.2 });
  },
  // Dolor: un castañeteo seco de dientes y un gruñido ahogado.
  podHurt: (a, o) => {
    for (let i = 0; i < 3; i++) a.knock(o, { f: rnd(1200, 1500), q: 12, dur: 0.05, vol: 0.25, delay: i * 0.045 });
    a.voice(o, { pitch: [[0, 240], [1, 160]], dur: 0.24, vol: 0.45, growl: 0.75, growlRate: 30, breath: 0.3, formants: F('o', 1), attack: 0.01, delay: 0.1 });
  },

  // ---------------------------------------------------------------- Colonia Bacilar
  // Firma: "hm-hm-HMMM", tres gruñidos húmedos que suben (imita una voz que oyó).
  colonySquirm: (a, o) => {
    const b = rnd(80, 92);
    [[b, 0.12, 0], [b * 1.12, 0.12, 0.18], [b * 1.4, 0.42, 0.36]].forEach(([f, d, t]) =>
      a.voice(o, { pitch: [[0, f], [1, f * 0.9]], dur: d, vol: 0.55, growl: 0.5, growlRate: 26, breath: 0.3, formants: F('o', 0.8), attack: 0.02, delay: t }));
    for (let i = 0; i < 4; i++) a.tone(o, { type: 'sine', f0: rnd(200, 420), f1: rnd(450, 800), dur: 0.05, vol: 0.05, delay: 0.5 + Math.random() * 0.4 });
  },
  colonyAlert: (a, o) => a.voice(o, { pitch: [[0, 90], [0.3, 150], [1, 110]], dur: 0.7, vol: 0.6, growl: 0.7, growlRate: 24, breath: 0.4, formants: F('a', 0.8), to: F('o', 0.8) }),
  colonyHurt: (a, o) => a.voice(o, { pitch: [[0, 140], [0.3, 185], [1, 90]], dur: 0.38, vol: 0.55, growl: 0.7, growlRate: 28, breath: 0.4, formants: F('a', 0.8), attack: 0.015 }),

  // ---------------------------------------------------------------- Ciervo Acorazado
  // Firma: la berrea de un ciervo en celo, grave y larga, y el roce de la quitina.
  stagBellow: (a, o) => {
    a.voice(o, { pitch: [[0, 96], [0.12, 168], [0.6, 150], [1, 82]], dur: 1.1, vol: 0.7, growl: 0.8, growlRate: 28, breath: 0.35, formants: F('a', 0.75), to: F('o', 0.75), attack: 0.08 });
    for (let i = 0; i < 4; i++) a.knock(o, { f: rnd(1500, 2100), q: 14, dur: 0.06, vol: 0.1, delay: 1.05 + i * 0.07 });
  },
  stagHuff: (a, o) => { for (let i = 0; i < 2; i++) air(a, o, { f0: 700, f1: 420, q: 2, dur: 0.16, vol: 0.4, attack: 0.015, delay: i * 0.22 }); },
  stagGrunt: (a, o) => a.voice(o, { pitch: [[0, 150], [1, 100]], dur: 0.26, vol: 0.6, growl: 0.7, growlRate: 26, breath: 0.3, formants: F('a', 0.8), attack: 0.015 }),

  // ---------------------------------------------------------------- Vestigio
  // Firma: un sollozo humano: tres inspiraciones entrecortadas y un gemido "aah-ooh".
  vestigioBreath: (a, o) => {
    for (let i = 0; i < 3; i++) air(a, o, { f0: 1100, f1: 1250, q: 3, dur: 0.1, vol: 0.3, attack: 0.02, delay: i * 0.14 });
    a.voice(o, { pitch: [[0, 160], [0.3, 172], [1, 112]], dur: 0.9, vol: 0.45, breath: 0.45, vib: 4, vibDepth: 0.03, formants: F('a'), to: F('o'), attack: 0.06, delay: 0.45 });
  },
  // Gemido largo, casi humano y desafinado; una segunda voz se le cuela por encima.
  moan: (a, o) => {
    const f = rnd(125, 150);
    a.voice(o, { pitch: [[0, f], [0.4, f * 1.06], [1, f * 0.72]], dur: rnd(1.2, 1.6), vol: 0.45, breath: 0.3, vib: 4, vibDepth: 0.03, formants: F('a'), to: F('u'), attack: 0.15 });
    a.voice(o, { pitch: [[0, f * 1.48], [1, f * 1.05]], dur: 1, vol: 0.1, breath: 0.2, formants: F('e'), attack: 0.2, delay: 0.25 });
  },
  vestigioAlert: (a, o) => {
    air(a, o, { f0: 1200, f1: 1600, q: 3, dur: 0.12, vol: 0.4, attack: 0.01 });
    a.voice(o, { pitch: [[0, 165], [1, 235]], dur: 0.35, vol: 0.5, breath: 0.35, formants: F('a'), attack: 0.02, delay: 0.1 });
  },
  vestigioHurt: (a, o) => a.voice(o, { pitch: [[0, 225], [0.2, 250], [1, 160]], dur: 0.3, vol: 0.5, growl: 0.35, growlRate: 30, breath: 0.3, formants: F('a', 1.05), attack: 0.01 }),

  // ---------------------------------------------------------------- Anguila
  // Firma: burbujas que suben bajo el ácido y un siseo cuando asoma.
  eelGurgle: (a, o) => {
    for (let i = 0; i < 6; i++) { const f = rnd(140, 260); a.voice(o, { f0: f, f1: f * 2, dur: 0.07, vol: 0.25, wave: 'sine', vibDepth: 0, formants: [[f * 1.6, 1.5, 1]], attack: 0.01, delay: Math.random() * 0.5 }); }
    air(a, o, { f0: 2800, f1: 2200, q: 2, dur: 0.3, vol: 0.2, delay: 0.45 });
  },
  // Sanguijuela: chasquido viscoso y un chillido corto y agudo (es pequeñita).
  leechHurt: (a, o) => {
    air(a, o, { f0: 700, f1: 1800, q: 3, dur: 0.06, vol: 0.3, attack: 0.005 });
    a.voice(o, { pitch: [[0, 1100], [1, 1500]], dur: 0.09, vol: 0.3, breath: 0.4, wave: 'triangle', formants: [[1600, 4, 1]], attack: 0.008, delay: 0.04 });
  },

  // ---------------------------------------------------------------- Sapo Partero
  // Firma: un croar hondo, de buche enorme, en dos golpes y con gorgoteo de ácido.
  toadCroak: (a, o) => {
    for (let i = 0; i < 2; i++) a.voice(o, { pitch: [[0, 62], [0.4, 70], [1, 52]], dur: 0.32, vol: 0.7, growl: 1, growlRate: 14, breath: 0.25, formants: F('o', 0.55), to: F('u', 0.55), attack: 0.03, delay: i * 0.38 });
    for (let i = 0; i < 4; i++) { const f = rnd(110, 200); a.voice(o, { f0: f, f1: f * 1.7, dur: 0.07, vol: 0.18, wave: 'sine', vibDepth: 0, formants: [[f * 1.5, 1.5, 1]], delay: 0.8 + Math.random() * 0.3 }); }
  },
  // Dolor: un bramido grave que se le ahoga en la garganta (nada de chillidos).
  toadHurt: (a, o) => {
    a.voice(o, { pitch: [[0, 92], [0.25, 112], [1, 58]], dur: 0.45, vol: 0.75, growl: 0.95, growlRate: 17, breath: 0.35, formants: F('a', 0.6), to: F('o', 0.6), attack: 0.015 });
    air(a, o, { f0: 600, f1: 250, q: 2, dur: 0.3, vol: 0.25, delay: 0.25 });
  },
  toadDie: (a, o) => {
    a.voice(o, { pitch: [[0, 80], [0.2, 98], [1, 34]], dur: 2, vol: 0.75, growl: 1, growlRate: 13, breath: 0.4, formants: F('a', 0.55), to: F('u', 0.55), attack: 0.04 });
    for (let i = 0; i < 14; i++) { const f = rnd(90, 220); a.voice(o, { f0: f, f1: f * 2, dur: 0.08, vol: 0.18, wave: 'sine', vibDepth: 0, formants: [[f * 1.5, 1.5, 1]], delay: 0.6 + Math.random() * 1.5 }); }
  },

  // ---------------------------------------------------------------- Sistema circulatorio
  // El latido llega a una charca: un golpe sordo y la sangre que se agolpa.
  bloodSurge: (a, o) => {
    a.knock(o, { f: 70, q: 2, dur: 0.18, vol: 0.5 });
    air(a, o, { f0: 380, f1: 900, q: 1.6, dur: 0.35, vol: 0.22, attack: 0.03, release: 0.6, delay: 0.03 });
  },
  // Válvula: se abre con un chasquido húmedo y se cierra de golpe (el "lub-dub").
  valveOpen: (a, o) => air(a, o, { f0: 600, f1: 1500, q: 3, dur: 0.12, vol: 0.25, attack: 0.01 }),
  valveShut: (a, o) => { a.knock(o, { f: 95, q: 3, dur: 0.12, vol: 0.45 }); a.knock(o, { f: 420, q: 8, dur: 0.05, vol: 0.12, delay: 0.01 }); },

  eelHurt: (a, o) => a.voice(o, { pitch: [[0, 680], [0.3, 940], [1, 400]], dur: 0.26, vol: 0.4, breath: 0.5, formants: [[1400, 4, 1], [2600, 6, 0.4]], attack: 0.01 }),

  // ---------------------------------------------------------------- Escarabajo Rinoceronte
  // Firma: dos resoplidos por el cráneo hueco, un gruñido hondo y el traqueteo de la
  // jaula de costillas al moverse.
  rhinoSnort: (a, o) => {
    for (let i = 0; i < 2; i++) air(a, o, { f0: 520, f1: 380, q: 2, dur: 0.13, vol: 0.45, attack: 0.012, delay: i * 0.2 });
    a.voice(o, { pitch: [[0, 70], [0.5, 76], [1, 60]], dur: 0.75, vol: 0.6, growl: 0.9, growlRate: 21, breath: 0.2, formants: F('a', 0.6), to: F('o', 0.6), delay: 0.45 });
  },
  rhinoRattle: (a, o) => {
    const n = 7 + Math.floor(Math.random() * 4);
    let t = 0;
    for (let i = 0; i < n; i++) { a.knock(o, { f: rnd(650, 1250), q: 14, dur: 0.1, vol: 0.2 - i * 0.01, delay: t }); t += 0.04 + Math.abs(i - n / 2) * 0.012; }
  },
  // Al escarbar: una berrea honda que sube, con la jaula traqueteando.
  rhinoBellow: (a, o) => {
    a.voice(o, { pitch: [[0, 58], [0.3, 96], [1, 78]], dur: 0.9, vol: 0.7, growl: 1, growlRate: 20, breath: 0.3, formants: F('a', 0.6), to: F('o', 0.6), attack: 0.06 });
    VOICES.rhinoRattle(a, o);
  },
  rhinoHurt: (a, o) => {
    a.voice(o, { pitch: [[0, 115], [1, 74]], dur: 0.3, vol: 0.6, growl: 0.8, growlRate: 24, formants: F('a', 0.7), attack: 0.01 });
    a.knock(o, { f: rnd(1300, 1700), q: 10, dur: 0.08, vol: 0.18 });
  },
  rhinoDie: (a, o) => {
    a.knock(o, { f: 120, q: 2, dur: 0.3, vol: 0.5 });
    for (let i = 0; i < 12; i++) a.knock(o, { f: rnd(500, 1400), q: 14, dur: 0.12, vol: 0.18, delay: 0.05 + i * rnd(0.03, 0.08) });
    a.voice(o, { pitch: [[0, 92], [0.3, 104], [1, 40]], dur: 1.8, vol: 0.6, growl: 0.9, growlRate: 18, breath: 0.4, formants: F('a', 0.6), to: F('u', 0.6), attack: 0.05, delay: 0.1 });
  },
};

// Ganancia (×) de cada voz: igualadas midiendo con tools/sound-meter.html.
export const VOICE_GAIN = {
  neuronWarble: 1.6, neuronAlert: 0.8, neuronHurt: 3,
  swarmBuzz: 4.1, swarmAlert: 2.5, swarmHurt: 2.75,
  pollBuzz: 3.5, pollScream: 2.8, pollHurt: 3, pollDie: 2.8,
  cellChirp: 0.52, cellHurt: 0.75,
  eyeSquelch: 3.3, eyeAlert: 1.7, eyeHurt: 1.95,
  sacInhale: 2.75, sacHurt: 4,
  podChatter: 4.4, podHurt: 1.85,
  colonySquirm: 2.7, colonyAlert: 2.5, colonyHurt: 2.5,
  stagBellow: 2.6, stagHuff: 3, stagGrunt: 2.4,
  vestigioBreath: 2.55, moan: 2.55, vestigioAlert: 2.15, vestigioHurt: 2.2,
  eelGurgle: 1, eelHurt: 1.8, leechHurt: 1.6,
  toadCroak: 2.6, toadHurt: 2.6, toadDie: 2.4,
  bloodSurge: 1.6, valveOpen: 1.6, valveShut: 2,
  rhinoSnort: 3.4, rhinoRattle: 7.7, rhinoBellow: 3, rhinoHurt: 3.2, rhinoDie: 2.6,
  // Trampas y corrientes (entities/Traps.js).
  stakes: 2.2, boneCreak: 3.5, gust: 2.5,
};
