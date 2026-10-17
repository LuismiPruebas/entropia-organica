// Audio procedimental con WebAudio (sin archivos): cada sonido es una receta.
// play(name, {x, y}) aplica paneo y atenuación según la distancia al oyente.

import { startBossMusic } from './BossMusic.js';
import { VOICES, VOICE_GAIN } from './Voices.js';

// Variación de tono por llamada: ninguna criatura suena dos veces igual.
const rnd = (a, b) => a + Math.random() * (b - a);

// Base de toda muerte: el estallido y el golpe que la hacen pesar.
function deathImpact(a, o, vol = 1) {
  a.noise(o, { dur: 0.03, vol: 0.14 * vol, type: 'highpass', f0: 2500 });
  a.knock(o, { f: rnd(110, 140), q: 2, dur: 0.35, vol: 0.45 * vol });
  a.noise(o, { dur: 0.3, vol: 0.22 * vol, type: 'lowpass', f0: 1600, f1: 120 });
}

// Ganancia extra (×) por sonido, ajustada midiendo su energía con
// tools/sound-meter.html: el objetivo es que las voces se oigan como un disparo.
const GAIN = {
  hit: 2.5, screech: 10, growl: 7, click: 7, crackle: 5, bubble: 3.5, hiss: 4.2, moan: 8.5,
  spit: 3, stalkerWindup: 10, stalkerLunge: 2,
  stalkerChitter: 9, neuronWarble: 4, swarmBuzz: 8, cellChirp: 2.5, eyeSquelch: 2.5, sacInhale: 6.5,
  podChatter: 3, colonySquirm: 12, vestigioBreath: 5.4, eelGurgle: 2.5,
  gangAura: 4.5, matBreath: 3.2, glandRumble: 5.6,
  chimAura: 4, chimHowl: 2.2, chimBark: 2, choirSing: 3, choirMoan: 4, choirScream: 2.5, headScream: 3,
};

const SOUNDS = {
  nail: (a, o) => {
    a.noise(o, { dur: 0.01, vol: 0.55, type: 'highpass', f0: 4500 });
    a.noise(o, { dur: 0.07, vol: 0.32, type: 'bandpass', f0: rnd(1700, 2100), f1: 550, q: 3 });
    a.tone(o, { type: 'square', f0: rnd(170, 200), f1: 65, dur: 0.06, vol: 0.16 });
    a.tone(o, { type: 'sine', f0: 95, f1: 38, dur: 0.11, vol: 0.45 });
    a.tone(o, { type: 'triangle', f0: rnd(1350, 1550), f1: 900, dur: 0.13, vol: 0.045, delay: 0.01 });
    a.noise(o, { dur: 0.06, vol: 0.07, type: 'lowpass', f0: 1500, f1: 300, delay: 0.09 });
  },
  spine: (a, o) => {
    a.noise(o, { dur: 0.05, vol: 0.45, type: 'bandpass', f0: rnd(2200, 2700), f1: 900, q: 5 });
    a.tone(o, { type: 'sine', f0: rnd(2400, 2900), f1: 1100, dur: 0.1, vol: 0.05 });
    a.tone(o, { type: 'sine', f0: rnd(150, 175), f1: 42, dur: 0.15, vol: 0.5 });
    a.noise(o, { dur: 0.1, vol: 0.22, type: 'bandpass', f0: 650, f1: 180, q: 6, delay: 0.02 });
    a.noise(o, { dur: 0.05, vol: 0.08, type: 'bandpass', f0: 1800, f1: 700, q: 5, delay: 0.085 });
  },
  acid: (a, o) => { a.tone(o, { type: 'sawtooth', f0: 180, f1: 50, dur: 0.3, vol: 0.18 }); a.noise(o, { dur: 0.25, vol: 0.25, type: 'lowpass', f0: 1800, f1: 300 }); },
  charge: (a, o) => a.tone(o, { type: 'sine', f0: 120, f1: 380, dur: 0.6, vol: 0.06 }),
  empty: (a, o) => a.tone(o, { type: 'square', f0: 140, f1: 120, dur: 0.05, vol: 0.06 }),
  melee: (a, o) => { a.noise(o, { dur: 0.1, vol: 0.35, type: 'lowpass', f0: 900, f1: 120 }); a.tone(o, { type: 'sine', f0: 110, f1: 45, dur: 0.12, vol: 0.3 }); },
  hit: (a, o) => {
    a.noise(o, { dur: 0.07, vol: 0.4, type: 'lowpass', f0: 2200, f1: 300 });
    a.noise(o, { dur: 0.16, vol: 0.28, type: 'bandpass', f0: rnd(500, 800), f1: 160, q: 6, delay: 0.02 });
    a.creature(o, { f0: rnd(260, 420), f1: rnd(120, 200), dur: 0.16, vol: 0.07, formant: rnd(700, 1100), rough: 0.5 });
  },
  ricochet: (a, o) => a.tone(o, { type: 'square', f0: 2200, f1: 1600, dur: 0.07, vol: 0.08 }),
  hurt: (a, o) => { a.creature(o, { f0: 190, f1: 95, dur: 0.28, vol: 0.14, formant: 750, rough: 0.7 }); a.noise(o, { dur: 0.15, vol: 0.28, type: 'lowpass', f0: 1400, f1: 200 }); a.noise(o, { dur: 0.25, vol: 0.12, type: 'highpass', f0: 1800, f1: 900, delay: 0.1 }); },
  jump: (a, o) => a.tone(o, { type: 'sine', f0: 220, f1: 380, dur: 0.08, vol: 0.06 }),
  gas: (a, o) => a.noise(o, { dur: 0.3, vol: 0.25, type: 'highpass', f0: 3000, f1: 1200 }),
  land: (a, o) => a.noise(o, { dur: 0.05, vol: 0.12, type: 'lowpass', f0: 400 }),
  pickup: (a, o) => { a.tone(o, { type: 'sine', f0: 660, f1: 660, dur: 0.07, vol: 0.1 }); a.tone(o, { type: 'sine', f0: 990, f1: 990, dur: 0.1, vol: 0.1, delay: 0.07 }); },
  dna: (a, o) => [0, 0.12, 0.24, 0.36].forEach((d, i) => a.tone(o, { type: 'triangle', f0: [220, 277, 311, 207][i], f1: [220, 277, 311, 207][i], dur: 0.3, vol: 0.12, delay: d })),
  screech: (a, o) => {
    const f = rnd(380, 620);
    a.creature(o, { f0: f, f1: f * rnd(1.6, 2.2), dur: 0.5, vol: 0.09, formant: rnd(1200, 1800), rough: 0.6, vib: 11 });
    a.creature(o, { f0: f * 1.07, f1: f * rnd(1.3, 1.8), dur: 0.42, vol: 0.05, formant: 2200, rough: 0.9, vib: 17, delay: 0.04 });
    a.noise(o, { dur: 0.4, vol: 0.08, type: 'bandpass', f0: 2600, f1: 1200, q: 3 });
  },
  die: (a, o) => {
    deathImpact(a, o, 0.9);
    a.creature(o, { f0: rnd(300, 520), f1: rnd(70, 110), dur: 0.55, vol: 0.12, formant: rnd(600, 1000), rough: 0.8 });
    a.noise(o, { dur: 0.35, vol: 0.5, type: 'lowpass', f0: 2500, f1: 120, delay: 0.08 });
    a.noise(o, { dur: 0.45, vol: 0.32, type: 'bandpass', f0: 900, f1: 180, q: 5, delay: 0.1 });
    a.tone(o, { type: 'sine', f0: 90, f1: 38, dur: 0.3, vol: 0.3, delay: 0.08 });
    for (let i = 0; i < 4; i++) a.noise(o, { dur: 0.05, vol: 0.18, type: 'bandpass', f0: rnd(300, 900), f1: 150, q: 8, delay: 0.25 + i * rnd(0.05, 0.1) });
  },
  tear: (a, o) => { a.noise(o, { dur: 0.3, vol: 0.4, type: 'bandpass', f0: 250, f1: 2200, q: 3 }); a.noise(o, { dur: 0.2, vol: 0.22, type: 'bandpass', f0: 700, f1: 200, q: 7, delay: 0.12 }); a.tone(o, { type: 'sawtooth', f0: 80, f1: 50, dur: 0.2, vol: 0.1 }); },
  whip: (a, o) => a.noise(o, { dur: 0.12, vol: 0.2, type: 'bandpass', f0: 3000, f1: 800, q: 4 }),
  womb: (a, o) => { a.tone(o, { type: 'sine', f0: 58, f1: 36, dur: 0.2, vol: 0.16 }); a.tone(o, { type: 'sine', f0: 52, f1: 34, dur: 0.16, vol: 0.1, delay: 0.22 }); },
  reveal: (a, o) => [0, 0.08, 0.16, 0.3].forEach((d, i) => a.tone(o, { type: 'sine', f0: [880, 1175, 1568, 2093][i], f1: [880, 1175, 1568, 2093][i], dur: 0.5, vol: 0.06, delay: d })),
  genome: (a, o) => { a.noise(o, { dur: 0.35, vol: 0.18, type: 'bandpass', f0: 300, f1: 900, q: 3 }); a.tone(o, { type: 'sine', f0: 90, f1: 55, dur: 0.3, vol: 0.2 }); },
  claw: (a, o) => { a.noise(o, { dur: 0.1, vol: 0.25, type: 'bandpass', f0: 2500, f1: 900, q: 5 }); a.tone(o, { type: 'square', f0: 400, f1: 200, dur: 0.05, vol: 0.05 }); },
  dash: (a, o) => a.noise(o, { dur: 0.2, vol: 0.3, type: 'lowpass', f0: 600, f1: 2400 }),
  // Membrana que vuelve a crecer: chapoteo blando y húmedo, sin golpe; tejido que se
  // sorbe a sí mismo con unas burbujas que revientan suaves.
  seal: (a, o) => {
    a.noise(o, { dur: 0.7, vol: 0.14, type: 'lowpass', f0: 220, f1: 520 });
    a.noise(o, { dur: 0.5, vol: 0.1, type: 'bandpass', f0: 380, f1: 900, q: 4, delay: 0.15 });
    a.tone(o, { type: 'sine', f0: 70, f1: 110, dur: 0.45, vol: 0.08 });
    for (let i = 0, t = 0.08; i < 5; i++, t += rnd(0.09, 0.17)) {
      const f = rnd(260, 480);
      a.tone(o, { type: 'sine', f0: f, f1: f * rnd(1.5, 2), dur: rnd(0.04, 0.07), vol: rnd(0.03, 0.05), delay: t });
    }
  },
  // Escopeta de Esquirlas: estampido seco y grave, astillas que silban y un chasquido húmedo.
  shotgun: (a, o) => {
    a.noise(o, { dur: 0.25, vol: 0.55, type: 'lowpass', f0: 2600, f1: 180 });
    a.tone(o, { type: 'sine', f0: 120, f1: 40, dur: 0.22, vol: 0.4 });
    a.noise(o, { dur: 0.12, vol: 0.18, type: 'highpass', f0: 3000, f1: 1500, delay: 0.03 });
    a.noise(o, { dur: 0.1, vol: 0.15, type: 'bandpass', f0: 600, f1: 250, q: 5, delay: 0.15 });
  },
  // Cálculo de sarro que rebota o se rompe: chasquido mineral, seco y breve.
  clack: (a, o) => { a.noise(o, { dur: 0.04, vol: 0.18, type: 'bandpass', f0: rnd(1800, 2600), q: 6 }); a.tone(o, { type: 'square', f0: rnd(500, 700), f1: 260, dur: 0.03, vol: 0.04 }); },
  // Empalizada de hueso: crujido de aviso y el golpe seco de las estacas al brotar.
  boneCreak: (a, o) => { [0, 0.09, 0.2, 0.33].forEach((d) => a.noise(o, { dur: 0.05, vol: 0.16, type: 'bandpass', f0: rnd(900, 1700), q: 8, delay: d })); a.tone(o, { type: 'sawtooth', f0: 70, f1: 55, dur: 0.45, vol: 0.05 }); },
  stakes: (a, o) => { a.noise(o, { dur: 0.18, vol: 0.45, type: 'lowpass', f0: 2600, f1: 300 }); a.tone(o, { type: 'square', f0: 140, f1: 60, dur: 0.12, vol: 0.12 }); [0.02, 0.05, 0.08].forEach((d) => a.noise(o, { dur: 0.03, vol: 0.2, type: 'bandpass', f0: rnd(2000, 3000), q: 6, delay: d })); },
  // Corriente de aire que cambia de sentido: un soplo hondo y suave.
  gust: (a, o) => { a.noise(o, { dur: 0.9, vol: 0.09, type: 'bandpass', f0: 300, f1: 900, q: 1.2 }); a.noise(o, { dur: 0.7, vol: 0.05, type: 'highpass', f0: 2500, f1: 1500, delay: 0.1 }); },
  crunch: (a, o) => { a.noise(o, { dur: 0.4, vol: 0.5, type: 'lowpass', f0: 2000, f1: 150 }); a.tone(o, { type: 'square', f0: 80, f1: 40, dur: 0.3, vol: 0.15 }); },
  spit: (a, o) => { a.noise(o, { dur: 0.14, vol: 0.25, type: 'bandpass', f0: rnd(700, 1100), f1: 250, q: 5 }); a.creature(o, { f0: rnd(200, 300), f1: 90, dur: 0.12, vol: 0.05, formant: 600, rough: 1 }); },
  node: (a, o) => [196, 247, 294].forEach((f) => a.tone(o, { type: 'sine', f0: f, f1: f, dur: 1.2, vol: 0.06 })),
  mutate: (a, o) => { a.noise(o, { dur: 1.0, vol: 0.4, type: 'bandpass', f0: 200, f1: 1800, q: 2 }); a.tone(o, { type: 'sawtooth', f0: 60, f1: 240, dur: 1.0, vol: 0.12 }); },
  thump: (a, o) => { a.tone(o, { type: 'sine', f0: 70, f1: 40, dur: 0.18, vol: 0.35 }); a.tone(o, { type: 'sine', f0: 60, f1: 35, dur: 0.15, vol: 0.25, delay: 0.2 }); },
  sizzle: (a, o) => a.noise(o, { dur: 0.15, vol: 0.06, type: 'highpass', f0: 4000 }),
  fail: (a, o) => { a.tone(o, { type: 'square', f0: 300, f1: 60, dur: 0.3, vol: 0.12 }); a.noise(o, { dur: 0.2, vol: 0.2, type: 'bandpass', f0: 500 }); },
  // --- Voces de las criaturas (las emiten solas mientras viven: Enemy.#voice) ---
  // Gruñido: garganta grave y áspera con un retumbo debajo.
  growl: (a, o) => {
    const f = rnd(60, 95), d = rnd(0.5, 0.9);
    a.creature(o, { f0: f, f1: f * rnd(0.75, 1.1), dur: d, vol: 0.2, formant: rnd(320, 480), q: 3, rough: 1, vib: 5 });
    a.noise(o, { dur: d, vol: 0.1, type: 'lowpass', f0: 260, f1: 120 });
  },
  // Chasquido: mandíbulas o quitina; una ráfaga irregular de clics secos.
  click: (a, o) => {
    const n = 3 + Math.floor(Math.random() * 5);
    let t = 0;
    for (let i = 0; i < n; i++) {
      a.noise(o, { dur: 0.018, vol: 0.32, type: 'bandpass', f0: rnd(1800, 3600), q: 9, delay: t });
      a.tone(o, { type: 'square', f0: rnd(600, 900), f1: 300, dur: 0.012, vol: 0.05, delay: t });
      t += rnd(0.035, 0.11);
    }
  },
  // Crepitar: chisporroteo eléctrico, como un nervio en cortocircuito.
  crackle: (a, o) => {
    const d = rnd(0.35, 0.7);
    for (let i = 0; i < 18; i++) a.noise(o, { dur: rnd(0.004, 0.015), vol: rnd(0.08, 0.3), type: 'highpass', f0: rnd(2500, 6000), delay: Math.random() * d });
    a.tone(o, { type: 'sawtooth', f0: rnd(50, 60), f1: 50, dur: d, vol: 0.03 });
  },
  // Burbujeo: líquido espeso que borbotea; burbujas que suben de tono y revientan.
  bubble: (a, o) => {
    const n = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const f = rnd(180, 520), t = Math.random() * 0.6;
      a.tone(o, { type: 'sine', f0: f, f1: f * rnd(1.6, 2.4), dur: rnd(0.04, 0.09), vol: 0.09, delay: t });
    }
    a.noise(o, { dur: 0.6, vol: 0.06, type: 'lowpass', f0: 400, f1: 200 });
  },
  // Siseo: aire forzado por una garganta de carne.
  hiss: (a, o) => {
    const d = rnd(0.4, 0.8);
    a.noise(o, { dur: d, vol: 0.18, type: 'bandpass', f0: rnd(2500, 4000), f1: rnd(1500, 2500), q: 2 });
    a.noise(o, { dur: d * 0.6, vol: 0.06, type: 'bandpass', f0: 600, f1: 400, q: 6, delay: 0.05 });
  },
  // Gemido: casi humano, largo y desafinado. Lo peor es que se parece a una voz.
  moan: (a, o) => {
    const f = rnd(120, 160), d = rnd(1, 1.6);
    a.creature(o, { f0: f, f1: f * rnd(0.7, 0.85), dur: d, vol: 0.13, formant: rnd(450, 650), q: 5, rough: 0.35, vib: 4 });
    a.creature(o, { f0: f * 1.5, f1: f * 1.05, dur: d * 0.8, vol: 0.04, formant: 1100, q: 6, rough: 0.6, vib: 6, delay: 0.15 });
  },
  // Golpe cuerpo a cuerpo: el aire cortado por el brazo (siempre)...
  swing: (a, o) => {
    a.noise(o, { dur: 0.14, vol: 0.28, type: 'bandpass', f0: rnd(350, 450), f1: rnd(1400, 1800), q: 2.5 });
    a.noise(o, { dur: 0.08, vol: 0.12, type: 'highpass', f0: 2500, f1: 4000, delay: 0.04 });
  },
  // ...y, si acierta, un impacto carnoso y grave con un crujido de hueso.
  smack: (a, o) => {
    a.tone(o, { type: 'sine', f0: rnd(95, 115), f1: 38, dur: 0.18, vol: 0.55 });
    a.noise(o, { dur: 0.05, vol: 0.5, type: 'lowpass', f0: 3000, f1: 400 });
    a.noise(o, { dur: 0.07, vol: 0.3, type: 'bandpass', f0: rnd(1000, 1400), f1: 500, q: 2, delay: 0.015 });
    a.noise(o, { dur: 0.12, vol: 0.18, type: 'bandpass', f0: 500, f1: 150, q: 5, delay: 0.03 });
  },
  // --- Reptante ---
  // Se encoge para saltar: castañeteo de mandíbulas que se acelera, siseo que crece y
  // un gruñido vibrante debajo. Dura lo que su temblor (0,5 s): es el aviso.
  stalkerWindup: (a, o) => {
    let t = 0;
    for (let i = 0; i < 11; i++) {
      a.noise(o, { dur: 0.014, vol: 0.2 + i * 0.025, type: 'bandpass', f0: rnd(2600, 4200), q: 10, delay: t });
      t += Math.max(0.02, 0.07 - i * 0.005);
    }
    a.noise(o, { dur: 0.5, vol: 0.14, type: 'bandpass', f0: 1400, f1: 3600, q: 3 });
    a.creature(o, { f0: 85, f1: 135, dur: 0.5, vol: 0.13, formant: 480, rough: 1, vib: 22 });
  },
  // Se lanza: chillido agudo a dos voces y el chasquido de las mandíbulas.
  stalkerLunge: (a, o) => {
    a.noise(o, { dur: 0.03, vol: 0.45, type: 'highpass', f0: 3200 });
    a.creature(o, { f0: rnd(700, 880), f1: rnd(1500, 1900), dur: 0.36, vol: 0.15, formant: 2000, rough: 0.8, vib: 26 });
    a.creature(o, { f0: rnd(300, 360), f1: 620, dur: 0.3, vol: 0.08, formant: 900, rough: 1, delay: 0.02 });
  },
  // Muere: la quitina cruje, un chillido que se ahoga en gorgoteo, y las patas siguen
  // chasqueando un segundo más.
  stalkerDie: (a, o) => {
    deathImpact(a, o, 1);
    a.noise(o, { dur: 0.09, vol: 0.55, type: 'bandpass', f0: 2600, f1: 700, q: 4 });
    a.tone(o, { type: 'square', f0: 140, f1: 60, dur: 0.12, vol: 0.12 });
    a.creature(o, { f0: rnd(850, 1000), f1: 160, dur: 0.7, vol: 0.13, formant: 1300, rough: 0.9, vib: 18, delay: 0.04 });
    for (let i = 0; i < 6; i++) a.tone(o, { type: 'sine', f0: rnd(160, 380), f1: rnd(400, 700), dur: 0.05, vol: 0.07, delay: 0.35 + Math.random() * 0.4 });
    for (let i = 0; i < 7; i++) a.noise(o, { dur: 0.012, vol: 0.18 - i * 0.02, type: 'bandpass', f0: rnd(2000, 3500), q: 9, delay: 0.5 + i * rnd(0.08, 0.16) });
  },
  // ===== Jefes: cada uno con su presencia (suena sola mientras está cerca), ataque,
  // invocación, dolor y muerte. =====

  // --- Ganglio Madre: un nervio sobrecargado ---
  // Presencia: zumbido eléctrico que late (sube y baja) con chisporroteos encima.
  gangAura: (a, o) => {
    a.tone(o, { type: 'sawtooth', f0: 55, f1: 62, dur: 1.4, vol: 0.06 });
    a.tone(o, { type: 'square', f0: 110, f1: 104, dur: 1.4, vol: 0.025 });
    a.creature(o, { f0: 220, f1: 180, dur: 1.2, vol: 0.04, formant: 700, q: 6, rough: 0.9, vib: 3 });
    for (let i = 0; i < 10; i++) a.noise(o, { dur: rnd(0.005, 0.02), vol: rnd(0.08, 0.22), type: 'highpass', f0: rnd(3000, 7000), delay: Math.random() * 1.3 });
  },
  // Descarga neural: un tono que trepa en medio segundo y revienta en chasquido.
  gangZap: (a, o) => {
    a.tone(o, { type: 'sawtooth', f0: 180, f1: 1400, dur: 0.22, vol: 0.12 });
    a.noise(o, { dur: 0.22, vol: 0.1, type: 'bandpass', f0: 800, f1: 4000, q: 4 });
    a.noise(o, { dur: 0.12, vol: 0.5, type: 'highpass', f0: 2500, f1: 1200, delay: 0.22 });
    a.tone(o, { type: 'square', f0: 90, f1: 40, dur: 0.18, vol: 0.2, delay: 0.22 });
  },
  // Carga del salto: un zumbido que trepa y chisporroteos cada vez más seguidos.
  gangCharge: (a, o) => {
    a.tone(o, { type: 'sawtooth', f0: 70, f1: 520, dur: 0.95, vol: 0.08 });
    a.tone(o, { type: 'square', f0: 140, f1: 1040, dur: 0.95, vol: 0.03 });
    for (let i = 0; i < 22; i++) { const u = Math.sqrt(Math.random()); a.noise(o, { dur: rnd(0.005, 0.02), vol: 0.08 + u * 0.22, type: 'highpass', f0: rnd(2500, 7000), delay: u * 0.9 }); }
  },
  // El salto: un chasquido eléctrico seco que se apaga lejos.
  gangBlink: (a, o) => {
    a.noise(o, { dur: 0.08, vol: 0.6, type: 'highpass', f0: 4000, f1: 1500 });
    a.tone(o, { type: 'sawtooth', f0: 1600, f1: 60, dur: 0.3, vol: 0.14 });
    a.tone(o, { type: 'square', f0: 70, f1: 35, dur: 0.25, vol: 0.18, delay: 0.02 });
    for (let i = 0; i < 6; i++) a.noise(o, { dur: 0.01, vol: 0.2 - i * 0.025, type: 'highpass', f0: rnd(3000, 6000), delay: 0.08 + i * rnd(0.04, 0.08) });
  },
  // Invoca neuronas: un coro de crepitares que se separan.
  gangSummon: (a, o) => {
    for (let k = 0; k < 3; k++) a.creature(o, { f0: rnd(500, 900), f1: rnd(1100, 1600), dur: 0.5, vol: 0.05, formant: 1800, q: 6, rough: 1, vib: 30, delay: k * 0.08 });
    for (let i = 0; i < 14; i++) a.noise(o, { dur: 0.01, vol: 0.2, type: 'highpass', f0: rnd(3000, 6000), delay: Math.random() * 0.6 });
  },
  gangHurt: (a, o) => {
    a.noise(o, { dur: 0.05, vol: 0.4, type: 'highpass', f0: 3000 });
    a.creature(o, { f0: rnd(240, 300), f1: rnd(140, 180), dur: 0.3, vol: 0.12, formant: 900, rough: 1, vib: 40 });
  },
  // Muere: cascada de chispas, el zumbido que se desploma y un gemido largo.
  gangDie: (a, o) => {
    for (let i = 0; i < 40; i++) a.noise(o, { dur: rnd(0.005, 0.03), vol: rnd(0.1, 0.35), type: 'highpass', f0: rnd(2000, 7000), delay: Math.random() * 1.6 });
    a.tone(o, { type: 'sawtooth', f0: 120, f1: 20, dur: 2.2, vol: 0.15 });
    a.creature(o, { f0: 170, f1: 70, dur: 2.4, vol: 0.14, formant: 550, q: 5, rough: 0.5, vib: 4, delay: 0.2 });
    a.noise(o, { dur: 0.6, vol: 0.4, type: 'lowpass', f0: 2000, f1: 100 });
  },

  // --- Bronquio Matriarca: unos pulmones gigantes ---
  // Presencia: respiración enorme y lenta. Inspira (aire que entra, subiendo)...
  matBreath: (a, o) => {
    a.noise(o, { dur: 1.3, vol: 0.2, type: 'bandpass', f0: 300, f1: 900, q: 1.5 });
    a.noise(o, { dur: 1.1, vol: 0.08, type: 'highpass', f0: 2500, f1: 3500, delay: 0.1 });
    // ...y espira con un estertor grave.
    a.noise(o, { dur: 1.6, vol: 0.22, type: 'bandpass', f0: 800, f1: 220, q: 1.5, delay: 1.4 });
    a.creature(o, { f0: 70, f1: 55, dur: 1.4, vol: 0.08, formant: 300, q: 3, rough: 1, vib: 6, delay: 1.5 });
  },
  // Tos húmeda con la que lanza las esporas.
  matCough: (a, o) => {
    for (let i = 0; i < 2; i++) {
      a.noise(o, { dur: 0.12, vol: 0.5, type: 'lowpass', f0: 1800, f1: 300, delay: i * 0.18 });
      a.creature(o, { f0: rnd(110, 140), f1: 70, dur: 0.14, vol: 0.12, formant: 500, rough: 1, delay: i * 0.18 });
      a.noise(o, { dur: 0.1, vol: 0.18, type: 'bandpass', f0: 900, f1: 300, q: 6, delay: i * 0.18 + 0.05 });
    }
  },
  // Siembra sacos: un silbido de pulmón, como un fuelle que se escapa.
  matSummon: (a, o) => {
    a.noise(o, { dur: 0.7, vol: 0.18, type: 'bandpass', f0: 2200, f1: 900, q: 5 });
    a.tone(o, { type: 'sine', f0: 900, f1: 600, dur: 0.6, vol: 0.04 });
  },
  matHurt: (a, o) => {
    a.noise(o, { dur: 0.25, vol: 0.35, type: 'bandpass', f0: 1200, f1: 400, q: 2 });
    a.creature(o, { f0: 150, f1: 90, dur: 0.25, vol: 0.1, formant: 600, rough: 1 });
  },
  // Muere: la última espiración, larguísima, y un gorgoteo cuando se vacían.
  matDie: (a, o) => {
    a.noise(o, { dur: 3, vol: 0.3, type: 'bandpass', f0: 1200, f1: 120, q: 1.2 });
    a.creature(o, { f0: 110, f1: 40, dur: 2.8, vol: 0.12, formant: 400, rough: 1, vib: 5 });
    for (let i = 0; i < 10; i++) a.tone(o, { type: 'sine', f0: rnd(150, 400), f1: rnd(400, 800), dur: 0.06, vol: 0.08, delay: 1.8 + Math.random() * 1.2 });
  },

  // --- Glándula Gástrica: un estómago colosal ---
  // Presencia: rugido de tripas, grave y largo, con gorgoteos.
  glandRumble: (a, o) => {
    a.creature(o, { f0: rnd(45, 60), f1: rnd(35, 50), dur: 1.4, vol: 0.14, formant: 220, q: 2, rough: 1, vib: 3 });
    a.noise(o, { dur: 1.4, vol: 0.12, type: 'lowpass', f0: 260, f1: 140 });
    for (let i = 0; i < 6; i++) a.tone(o, { type: 'sine', f0: rnd(90, 220), f1: rnd(220, 380), dur: 0.08, vol: 0.06, delay: Math.random() * 1.3 });
  },
  // Arcada antes del escupitajo de ácido.
  glandRetch: (a, o) => {
    a.creature(o, { f0: 130, f1: 220, dur: 0.45, vol: 0.13, formant: 650, q: 4, rough: 1, vib: 12 });
    a.noise(o, { dur: 0.4, vol: 0.18, type: 'bandpass', f0: 500, f1: 1400, q: 3 });
    a.noise(o, { dur: 0.2, vol: 0.45, type: 'lowpass', f0: 2200, f1: 300, delay: 0.42 });
  },
  // Se contrae para inundar la sala: un eructo enorme que borbotea.
  glandFlood: (a, o) => {
    a.creature(o, { f0: 75, f1: 50, dur: 1.4, vol: 0.18, formant: 380, q: 3, rough: 1, vib: 9 });
    a.noise(o, { dur: 1.6, vol: 0.2, type: 'lowpass', f0: 600, f1: 150 });
    for (let i = 0; i < 16; i++) a.tone(o, { type: 'sine', f0: rnd(120, 300), f1: rnd(300, 600), dur: 0.07, vol: 0.07, delay: 0.3 + Math.random() * 1.5 });
  },
  glandHurt: (a, o) => {
    a.noise(o, { dur: 0.15, vol: 0.35, type: 'bandpass', f0: 700, f1: 200, q: 4 });
    a.creature(o, { f0: 95, f1: 60, dur: 0.3, vol: 0.12, formant: 400, rough: 1 });
  },
  // Revienta: chorro de jugos y el último rugido.
  glandDie: (a, o) => {
    a.noise(o, { dur: 0.5, vol: 0.6, type: 'lowpass', f0: 3000, f1: 150 });
    a.noise(o, { dur: 2.2, vol: 0.25, type: 'bandpass', f0: 1500, f1: 300, q: 1.5, delay: 0.1 });
    a.creature(o, { f0: 90, f1: 30, dur: 2.2, vol: 0.15, formant: 300, rough: 1, vib: 6, delay: 0.1 });
    for (let i = 0; i < 18; i++) a.tone(o, { type: 'sine', f0: rnd(100, 300), f1: rnd(300, 700), dur: 0.06, vol: 0.07, delay: 0.4 + Math.random() * 1.8 });
  },
  // ===== Voz propia de cada criatura (la firma que la delata a oscuras) =====
  // Reptante: castañeteo de mandíbulas en ráfagas, con un gruñido corto debajo.
  stalkerChitter: (a, o) => {
    let t = 0;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 7; i++) { a.noise(o, { dur: 0.012, vol: 0.4, type: 'bandpass', f0: rnd(2800, 3800), q: 8, delay: t }); t += 0.028; }
      t += rnd(0.12, 0.2);
    }
    a.creature(o, { f0: rnd(80, 100), f1: 70, dur: 0.35, vol: 0.12, formant: 420, rough: 1, vib: 18 });
  },
  // Neurona: gorjeo eléctrico que tiembla, como una señal que se escapa.
  neuronWarble: (a, o) => {
    a.creature(o, { f0: rnd(650, 850), f1: rnd(1100, 1400), dur: 0.3, vol: 0.1, formant: 1800, q: 3, rough: 0.2, vib: 28 });
    for (let i = 0; i < 4; i++) a.noise(o, { dur: 0.01, vol: 0.25, type: 'highpass', f0: 4500, delay: Math.random() * 0.3 });
  },
  // Enjambre: zumbido de enjambre, varias gargantas desafinadas vibrando a la vez.
  swarmBuzz: (a, o) => {
    for (let i = 0; i < 4; i++) a.creature(o, { f0: rnd(170, 270), f1: rnd(160, 290), dur: 0.8, vol: 0.07, formant: rnd(800, 1400), q: 2, rough: 1, vib: rnd(14, 24), delay: i * 0.04 });
  },
  // Célula: pitidos diminutos y agudos, como un pájaro enfermo.
  cellChirp: (a, o) => {
    for (let i = 0; i < 3; i++) a.tone(o, { type: 'sine', f0: rnd(1700, 2100), f1: rnd(2500, 3000), dur: 0.045, vol: 0.12, delay: i * rnd(0.07, 0.11) });
  },
  // Ojo de techo: parpadeo húmedo (chapoteo corto) y un zumbido grave de atención.
  eyeSquelch: (a, o) => {
    a.noise(o, { dur: 0.12, vol: 0.35, type: 'bandpass', f0: 450, f1: 1300, q: 4 });
    a.tone(o, { type: 'sine', f0: 140, f1: 120, dur: 0.6, vol: 0.12, delay: 0.1 });
  },
  // Saco esporífero: inspira con un silbido que sube y la carne cruje al hincharse.
  sacInhale: (a, o) => {
    a.noise(o, { dur: 0.7, vol: 0.3, type: 'bandpass', f0: 350, f1: 1600, q: 2.5 });
    a.creature(o, { f0: 70, f1: 90, dur: 0.6, vol: 0.08, formant: 300, rough: 1, vib: 7, delay: 0.1 });
  },
  // Fauce colgante: castañeteo de dientes a ritmo y hojas que se agitan.
  podChatter: (a, o) => {
    for (let i = 0; i < 8; i++) a.noise(o, { dur: 0.02, vol: 0.35, type: 'bandpass', f0: rnd(1100, 1600), q: 6, delay: i * 0.055 });
    a.noise(o, { dur: 0.5, vol: 0.12, type: 'highpass', f0: 3000, f1: 5000 });
  },
  // Colonia: reptar húmedo (chapoteos en serie) con chillidos agudos.
  colonySquirm: (a, o) => {
    for (let i = 0; i < 5; i++) a.noise(o, { dur: 0.07, vol: 0.3, type: 'bandpass', f0: rnd(500, 900), f1: 250, q: 5, delay: i * 0.09 });
    a.creature(o, { f0: rnd(1200, 1500), f1: rnd(1700, 2000), dur: 0.15, vol: 0.07, formant: 2200, q: 5, rough: 0.6, vib: 30, delay: 0.25 });
  },

  // Vestigio: respiración rota, casi humana: inspira entrecortado y espira con un quejido.
  vestigioBreath: (a, o) => {
    for (let i = 0; i < 3; i++) a.noise(o, { dur: 0.12, vol: 0.25, type: 'bandpass', f0: 1000, f1: 1300, q: 2, delay: i * 0.15 });
    a.noise(o, { dur: 0.7, vol: 0.25, type: 'bandpass', f0: 900, f1: 400, q: 2, delay: 0.5 });
    a.creature(o, { f0: 150, f1: 115, dur: 0.6, vol: 0.08, formant: 550, q: 5, rough: 0.4, vib: 5, delay: 0.55 });
  },
  // Anguila: borboteo bajo el ácido y un siseo cuando asoma.
  eelGurgle: (a, o) => {
    for (let i = 0; i < 7; i++) a.tone(o, { type: 'sine', f0: rnd(120, 260), f1: rnd(260, 480), dur: 0.07, vol: 0.12, delay: Math.random() * 0.5 });
    a.noise(o, { dur: 0.3, vol: 0.15, type: 'highpass', f0: 3500, delay: 0.4 });
  },

  // ===== Muertes de las criaturas =====
  // Neurona / Célula: chispazo, "pop" eléctrico y un chillido agudo que se corta.
  neuronDie: (a, o) => {
    deathImpact(a, o, 0.7);
    a.noise(o, { dur: 0.06, vol: 0.5, type: 'highpass', f0: 4000, f1: 1500 });
    a.creature(o, { f0: rnd(900, 1300), f1: rnd(1800, 2400), dur: 0.18, vol: 0.12, formant: 2400, q: 6, rough: 1, vib: 40 });
    for (let i = 0; i < 12; i++) a.noise(o, { dur: rnd(0.004, 0.015), vol: rnd(0.1, 0.3), type: 'highpass', f0: rnd(3000, 7000), delay: 0.05 + Math.random() * 0.4 });
  },
  // Enjambre: una cadena de reventones, una célula tras otra, entre chisporroteos.
  swarmDie: (a, o) => {
    deathImpact(a, o, 1);
    for (let i = 0; i < 6; i++) {
      const t = i * rnd(0.06, 0.11);
      a.noise(o, { dur: 0.05, vol: 0.4, type: 'bandpass', f0: rnd(1200, 2600), f1: 500, q: 3, delay: t });
      a.tone(o, { type: 'sine', f0: rnd(300, 500), f1: 90, dur: 0.08, vol: 0.18, delay: t });
    }
    a.creature(o, { f0: 700, f1: 200, dur: 0.6, vol: 0.1, formant: 1600, rough: 1, vib: 30 });
    for (let i = 0; i < 20; i++) a.noise(o, { dur: 0.01, vol: 0.2, type: 'highpass', f0: rnd(3000, 7000), delay: Math.random() * 0.8 });
  },
  // Saco esporífero: estallido a presión, rociada de esporas siseando y un gorgoteo.
  sacDie: (a, o) => {
    deathImpact(a, o, 1.1);
    a.noise(o, { dur: 0.08, vol: 0.7, type: 'lowpass', f0: 4000, f1: 600 });
    a.noise(o, { dur: 0.7, vol: 0.25, type: 'highpass', f0: 3000, f1: 1500, delay: 0.04 });
    for (let i = 0; i < 6; i++) a.tone(o, { type: 'sine', f0: rnd(150, 350), f1: rnd(400, 700), dur: 0.06, vol: 0.08, delay: 0.2 + Math.random() * 0.5 });
  },
  // Fauce colgante: crujido vegetal, chorro de savia y un quejido de madera que cede.
  podDie: (a, o) => {
    deathImpact(a, o, 0.9);
    for (let i = 0; i < 5; i++) a.noise(o, { dur: 0.03, vol: 0.35, type: 'bandpass', f0: rnd(800, 1600), q: 6, delay: i * rnd(0.02, 0.05) });
    a.noise(o, { dur: 0.35, vol: 0.25, type: 'bandpass', f0: 1200, f1: 400, q: 4, delay: 0.1 });
    a.creature(o, { f0: 220, f1: 90, dur: 0.6, vol: 0.09, formant: 500, q: 8, rough: 0.3, vib: 3, delay: 0.15 });
  },
  // Colonia: desgarros húmedos en cadena (se parte segmento a segmento) y burbujeo.
  colonyDie: (a, o) => {
    deathImpact(a, o, 0.8);
    for (let i = 0; i < 5; i++) a.noise(o, { dur: 0.09, vol: 0.3, type: 'bandpass', f0: rnd(400, 900), f1: 150, q: 6, delay: i * rnd(0.05, 0.09) });
    for (let i = 0; i < 8; i++) a.tone(o, { type: 'sine', f0: rnd(180, 400), f1: rnd(400, 800), dur: 0.05, vol: 0.07, delay: 0.1 + Math.random() * 0.5 });
  },
  // Coraza: crack de quitina, placas que repiquetean y un golpe hueco.
  isopodDie: (a, o) => {
    deathImpact(a, o, 1.2);
    a.noise(o, { dur: 0.1, vol: 0.6, type: 'bandpass', f0: 2800, f1: 900, q: 3 });
    for (let i = 0; i < 6; i++) a.tone(o, { type: 'triangle', f0: rnd(1500, 2600), f1: rnd(900, 1400), dur: 0.08, vol: 0.06, delay: 0.12 + i * rnd(0.06, 0.12) });
    a.tone(o, { type: 'sine', f0: 70, f1: 40, dur: 0.25, vol: 0.4, delay: 0.3 });
    a.noise(o, { dur: 0.2, vol: 0.2, type: 'bandpass', f0: 300, f1: 120, q: 3, delay: 0.3 });
  },
  // Vestigio: un estertor casi humano, crujido de huesos y el cuerpo que cae.
  vestigioDie: (a, o) => {
    deathImpact(a, o, 1);
    a.creature(o, { f0: rnd(170, 200), f1: 70, dur: 1.1, vol: 0.16, formant: 600, q: 5, rough: 0.6, vib: 5 });
    for (let i = 0; i < 4; i++) a.noise(o, { dur: 0.04, vol: 0.35, type: 'bandpass', f0: rnd(1500, 2500), q: 4, delay: 0.1 + i * rnd(0.04, 0.08) });
    a.tone(o, { type: 'sine', f0: 65, f1: 32, dur: 0.3, vol: 0.55, delay: 0.75 });
    a.noise(o, { dur: 0.25, vol: 0.3, type: 'lowpass', f0: 800, f1: 100, delay: 0.75 });
  },
  // Anguila: chapuzón violento, siseo del ácido y coletazos.
  eelDie: (a, o) => {
    deathImpact(a, o, 0.9);
    a.noise(o, { dur: 0.5, vol: 0.45, type: 'lowpass', f0: 3000, f1: 300 });
    a.noise(o, { dur: 0.8, vol: 0.15, type: 'highpass', f0: 4000, f1: 2500, delay: 0.1 });
    for (let i = 0; i < 4; i++) a.noise(o, { dur: 0.06, vol: 0.25, type: 'bandpass', f0: rnd(500, 1000), q: 3, delay: 0.2 + i * rnd(0.1, 0.18) });
  },
  // Ojo de techo: "plop" húmedo y el goteo de lo que cae.
  eyeDie: (a, o) => {
    deathImpact(a, o, 0.8);
    a.tone(o, { type: 'sine', f0: 500, f1: 120, dur: 0.12, vol: 0.3 });
    a.noise(o, { dur: 0.15, vol: 0.35, type: 'bandpass', f0: 900, f1: 250, q: 5 });
    for (let i = 0; i < 5; i++) a.tone(o, { type: 'sine', f0: rnd(700, 1200), f1: rnd(300, 500), dur: 0.04, vol: 0.06, delay: 0.3 + i * rnd(0.12, 0.25) });
  },
  // --- Quimera del Quilo: un perro que aúlla con una garganta humana dentro ---
  chimHowl: (a, o) => {
    a.creature(o, { f0: 380, f1: 620, dur: 0.5, vol: 0.2, formant: 900, q: 3, vib: 7, rough: 0.6 });
    a.creature(o, { f0: 620, f1: 300, dur: 0.7, vol: 0.18, formant: 1100, q: 3, vib: 9, rough: 0.7, delay: 0.45 });
    a.creature(o, { f0: 240, f1: 210, dur: 1.1, vol: 0.12, formant: 1500, q: 6, vib: 11, rough: 0.9, delay: 0.1 }); // el grito de dentro
  },
  chimBark: (a, o) => {
    a.noise(o, { dur: 0.08, vol: 0.4, type: 'bandpass', f0: 900, f1: 400, q: 2 });
    a.creature(o, { f0: 330, f1: 170, dur: 0.18, vol: 0.3, formant: 800, rough: 1 });
    a.creature(o, { f0: 300, f1: 150, dur: 0.2, vol: 0.25, formant: 750, rough: 1, delay: 0.22 });
  },
  chimBloom: (a, o) => {
    a.noise(o, { dur: 0.6, vol: 0.35, type: 'bandpass', f0: 400, f1: 2400, q: 4 }); // carne que se abre
    for (let i = 0; i < 10; i++) a.tone(o, { type: 'square', f0: rnd(1500, 3000), f1: rnd(400, 800), dur: 0.03, vol: 0.06, delay: i * rnd(0.03, 0.07) });
    a.creature(o, { f0: 120, f1: 90, dur: 0.8, vol: 0.15, formant: 500, rough: 0.8 });
  },
  chimSpit: (a, o) => { a.noise(o, { dur: 0.2, vol: 0.4, type: 'bandpass', f0: 1200, f1: 300, q: 3 }); a.tone(o, { type: 'sawtooth', f0: 200, f1: 60, dur: 0.2, vol: 0.12 }); },
  chimHurt: (a, o) => { a.creature(o, { f0: 240, f1: 130, dur: 0.3, vol: 0.2, formant: 600, rough: 0.9 }); a.creature(o, { f0: 120, f1: 80, dur: 0.32, vol: 0.12, formant: 380, rough: 1 }); a.noise(o, { dur: 0.1, vol: 0.2, type: 'bandpass', f0: 450, q: 2 }); }, // grave: es una bestia grande
  chimAura: (a, o) => { a.creature(o, { f0: 70, f1: 62, dur: 1.4, vol: 0.12, formant: 380, q: 5, vib: 3, rough: 0.8 }); a.creature(o, { f0: 700, f1: 560, dur: 0.6, vol: 0.04, formant: 1300, vib: 12, delay: 0.7 }); },
  chimDie: (a, o) => {
    deathImpact(a, o, 1.6);
    a.creature(o, { f0: 600, f1: 90, dur: 2.2, vol: 0.2, formant: 900, rough: 0.7, vib: 6 });
    a.creature(o, { f0: 260, f1: 400, dur: 1.6, vol: 0.12, formant: 1500, rough: 0.9, vib: 12, delay: 0.3 });
    for (let i = 0; i < 12; i++) a.noise(o, { dur: 0.08, vol: 0.25, type: 'bandpass', f0: rnd(300, 900), q: 3, delay: 0.3 + i * rnd(0.08, 0.16) });
  },
  headScream: (a, o) => a.creature(o, { f0: 520, f1: 880, dur: 0.35, vol: 0.14, formant: 1600, q: 5, vib: 14, rough: 0.6 }),
  // --- Coro de Carne: voces humanas y de animal cantando a la vez, mal afinadas ---
  choirSing: (a, o) => {
    for (const [f, fm] of [[220, 750], [233, 1150], [311, 800], [330, 1200]]) a.creature(o, { f0: f, f1: f * 1.01, dur: 0.55, vol: 0.06, formant: fm, q: 7, vib: 6, rough: 0.2 });
  },
  choirMoan: (a, o) => {
    for (const f of [98, 104, 147]) a.creature(o, { f0: f, f1: f * 0.97, dur: 2, vol: 0.05, formant: 600, q: 6, vib: 4, rough: 0.3 });
  },
  choirRetch: (a, o) => { a.creature(o, { f0: 150, f1: 90, dur: 0.6, vol: 0.2, formant: 500, rough: 1 }); a.noise(o, { dur: 0.5, vol: 0.3, type: 'lowpass', f0: 900, f1: 200 }); },
  choirVomit: (a, o) => { a.noise(o, { dur: 0.45, vol: 0.45, type: 'bandpass', f0: 500, f1: 1500, q: 2 }); a.creature(o, { f0: 110, f1: 70, dur: 0.4, vol: 0.18, formant: 450, rough: 1 }); },
  choirScream: (a, o) => {
    for (const [f, fm] of [[400, 1500], [425, 1700], [560, 1300]]) a.creature(o, { f0: f, f1: f * 1.5, dur: 1.2, vol: 0.09, formant: fm, q: 4, vib: 10, rough: 0.6 });
  },
  choirShock: (a, o) => {
    for (let i = 0; i < 16; i++) a.tone(o, { type: 'square', f0: rnd(60, 140), f1: rnd(40, 80), dur: 0.04, vol: 0.2, delay: i * 0.04 });
    a.noise(o, { dur: 0.7, vol: 0.4, type: 'highpass', f0: 3000, f1: 6000 });
  },
  choirHurt: (a, o) => { a.creature(o, { f0: 300, f1: 180, dur: 0.25, vol: 0.18, formant: 1100, rough: 0.7 }); a.creature(o, { f0: 90, f1: 70, dur: 0.3, vol: 0.12, formant: 400, rough: 0.9 }); },
  choirDie: (a, o) => {
    deathImpact(a, o, 1.8);
    for (const [f, fm, d] of [[220, 750, 0], [330, 1200, 0.2], [147, 600, 0.4], [440, 1500, 0.6]]) a.creature(o, { f0: f, f1: f * 0.4, dur: 2.4, vol: 0.12, formant: fm, rough: 0.6, vib: 5, delay: d });
    a.noise(o, { dur: 1.5, vol: 0.4, type: 'lowpass', f0: 2500, f1: 80 });
  },
  splat: (a, o) => { a.noise(o, { dur: 0.09, vol: 0.22, type: 'bandpass', f0: rnd(350, 650), f1: 120, q: 6 }); a.tone(o, { type: 'sine', f0: rnd(70, 110), f1: 40, dur: 0.07, vol: 0.12 }); },
  flicker: (a, o) => a.noise(o, { dur: 0.03, vol: 0.05, type: 'highpass', f0: 5000 }),
};
Object.assign(SOUNDS, VOICES);
Object.assign(GAIN, VOICE_GAIN);

// Capas ambientales por bioma. Se llaman cada 150 ms con el número de paso (entero).
const LAYERS = {
  // Sistema Nervioso: chasquidos sinápticos y algún zumbido eléctrico.
  synapse(a, t) {
    if (Math.random() < 0.3) {
      a.ambient(Math.random() * 2 - 1, (o) => a.tone(o, { type: 'square', f0: 1800 + Math.random() * 1400, f1: 500, dur: 0.04, vol: 0.045 }));
    }
    if (Math.random() < 0.02) {
      a.ambient(Math.random() * 2 - 1, (o) => a.tone(o, { type: 'sawtooth', f0: 118, f1: 122, dur: 0.5, vol: 0.04 }));
    }
  },
  // Cavidad Pulmonar: un fuelle gigante que inspira y espira.
  breath(a, t) {
    const phase = t % 32; // ciclo de 4,8 s
    if (phase === 0) {
      a.ambient(-0.3, (o) => a.noise(o, { dur: 2, vol: 0.09, type: 'bandpass', f0: 300, f1: 950, q: 1.2 }));
    } else if (phase === 16) {
      a.ambient(0.3, (o) => a.noise(o, { dur: 2.3, vol: 0.08, type: 'bandpass', f0: 950, f1: 220, q: 1.2 }));
    }
    if (Math.random() < 0.02) a.ambient(Math.random() * 2 - 1, (o) => a.tone(o, { type: 'sine', f0: 700, f1: 480, dur: 0.8, vol: 0.03 }));
  },
  // Sistema Digestivo: peristalsis. Una onda grave y húmeda que recorre la tripa a
  // ritmo lento, gorgoteos que suben y algún chapoteo lejano.
  peristalsis(a, t) {
    const phase = t % 22; // una contracción cada 3,3 s
    if (phase === 0) {
      a.ambient(-0.3, (o) => { a.tone(o, { type: 'sine', f0: 70, f1: 46, dur: 0.9, vol: 0.08 }); a.noise(o, { dur: 0.9, vol: 0.05, type: 'lowpass', f0: 260, f1: 120 }); });
    } else if (phase === 6) {
      a.ambient(0.3, (o) => a.noise(o, { dur: 0.7, vol: 0.04, type: 'bandpass', f0: 320, f1: 180, q: 3 }));
    }
    if (Math.random() < 0.06) {
      const f = 180 + Math.random() * 220;
      a.ambient(Math.random() * 2 - 1, (o) => { for (let i = 0; i < 3; i++) a.tone(o, { type: 'sine', f0: f * (1 + i * 0.3), f1: f * (1.6 + i * 0.3), dur: 0.06, vol: 0.035, delay: i * 0.07 }); });
    }
  },
  // Territorio del Hueso: un osario por donde pasa el viento. Los huesos huecos silban
  // como flautas (notas largas de una escala menor, a veces dos que chocan), cuelgan y
  // se rozan como campanillas, el hueso que se asienta cruje despacio, la médula gotea y,
  // muy de tarde en tarde, algo enorme llama dos veces desde lo hondo.
  ossuary(a, t) {
    const pan = Math.random() * 2 - 1;
    const SCALE = [146.8, 174.6, 196, 220, 261.6, 293.7];
    const whistle = (f, d, p, delay = 0) => a.ambient(p, (o) => a.voice(o, {
      f0: f, f1: f * (0.985 + Math.random() * 0.03), dur: d, vol: 0.05, wave: 'sine', breath: 0.9,
      vib: 3, vibDepth: 0.006, formants: [[f, 14, 1], [f * 2, 18, 0.25]], attack: d * 0.35, release: 0.4, delay,
    }), true);
    const r = Math.random();
    if (r < 0.022) {
      // Viento en los huesos huecos.
      const f = SCALE[Math.floor(Math.random() * SCALE.length)] * (Math.random() < 0.3 ? 2 : 1);
      whistle(f, 3 + Math.random() * 2.5, pan);
      if (Math.random() < 0.35) whistle(f * 1.414, 2.5, -pan, 0.8); // un tritono que incomoda
    } else if (r < 0.034) {
      // Campanillas de hueso: huesos colgados que se rozan.
      const notes = [523, 587, 698, 784, 880, 1046];
      const n = 3 + Math.floor(Math.random() * 4);
      a.ambient(pan, (o) => { let d = 0; for (let i = 0; i < n; i++) { a.knock(o, { f: notes[Math.floor(Math.random() * notes.length)] * (Math.random() < 0.4 ? 0.5 : 1), q: 30, dur: 0.5, vol: 0.05, delay: d }); d += 0.09 + Math.random() * 0.25; } }, true);
    } else if (r < 0.043) {
      // Crujido lento: hueso que se asienta bajo su propio peso.
      a.ambient(pan, (o) => a.voice(o, { pitch: [[0, 42 + Math.random() * 18], [1, 36]], dur: 1 + Math.random() * 0.8, vol: 0.05, growl: 1, growlRate: 11 + Math.random() * 8, growlWave: 'square', formants: [[320, 8, 1], [900, 10, 0.3]], attack: 0.2, release: 0.5 }));
    } else if (r < 0.075) {
      // La médula gotea en una cavidad.
      a.ambient(pan, (o) => { const f = 700 + Math.random() * 500; a.tone(o, { type: 'sine', f0: f, f1: f * 0.55, dur: 0.12, vol: 0.025 }); a.tone(o, { type: 'sine', f0: f * 1.5, f1: f, dur: 0.06, vol: 0.01, delay: 0.09 }); }, true);
    } else if (r < 0.085) {
      // Polvo de hueso que se desliza.
      a.ambient(pan, (o) => a.noise(o, { dur: 0.8, vol: 0.015, type: 'highpass', f0: 3500, f1: 6000 }));
    }
    // De lo hondo, dos golpes enormes y lejanos (cada ~10 s, no siempre).
    if (t % 64 === 20 && Math.random() < 0.45) {
      a.ambient(0, (o) => { a.knock(o, { f: 68, q: 3, dur: 0.7, vol: 0.12 }); a.knock(o, { f: 60, q: 3, dur: 0.8, vol: 0.09, delay: 0.55 }); }, true);
    }
  },
  // El Corazón: el latido lo llena todo.
  // Sistema circulatorio: la sangre corre (un siseo que crece y se apaga) y, lejos,
  // el "lub-dub" del corazón que lo empuja todo.
  bloodstream(a, t) {
    if (t % 5 === 0) a.ambient(Math.random() * 1.2 - 0.6, (o) => {
      a.noise(o, { dur: 0.7, vol: 0.05, type: 'bandpass', f0: 220, f1: 520, q: 1.2 });
      a.tone(o, { type: 'sine', f0: 58, f1: 40, dur: 0.2, vol: 0.12 });
      a.tone(o, { type: 'sine', f0: 52, f1: 34, dur: 0.16, vol: 0.08, delay: 0.22 });
    });
    if (Math.random() < 0.04) a.ambient(Math.random() * 2 - 1, (o) => a.tone(o, { type: 'sine', f0: 140 + Math.random() * 120, f1: 300 + Math.random() * 200, dur: 0.07, vol: 0.03 }));
  },
  heart(a, t) {
    if (t % 7 === 0) a.ambient(0, (o) => { a.tone(o, { type: 'sine', f0: 62, f1: 38, dur: 0.22, vol: 0.18 }); a.tone(o, { type: 'sine', f0: 55, f1: 34, dur: 0.18, vol: 0.12, delay: 0.24 }); });
  },

  // Silencio habitado: casi nada suena, y de pronto emerge algo (Sistema Nervioso).
  emergent(a) {
    const roll = Math.random(), pan = Math.random() * 2 - 1;
    if (roll < 0.012) {
      // Ráfaga sináptica: una corta cascada de chasquidos.
      const n = 3 + Math.floor(Math.random() * 5);
      a.ambient(pan, (o) => { for (let i = 0; i < n; i++) a.tone(o, { type: 'square', f0: 2200 + Math.random() * 1800, f1: 700, dur: 0.03, vol: 0.05, delay: i * (0.03 + Math.random() * 0.05) }); }, true);
    } else if (roll < 0.019) {
      // Una nota de cristal que se queda flotando.
      const f = [1318, 1568, 1760, 2093][Math.floor(Math.random() * 4)];
      a.ambient(pan, (o) => { a.tone(o, { type: 'sine', f0: f, f1: f * 0.995, dur: 2.5, vol: 0.03 }); a.tone(o, { type: 'sine', f0: f * 1.5, f1: f * 1.49, dur: 1.8, vol: 0.012 }); }, true);
    } else if (roll < 0.024) {
      // Gemido lejano, como de algo que respira en la carne.
      a.ambient(pan, (o) => a.tone(o, { type: 'sawtooth', f0: 70 + Math.random() * 40, f1: 45, dur: 2.2, vol: 0.035 }), true);
    } else if (roll < 0.029) {
      // Susurro: ruido filtrado que barre como una voz sin palabras.
      a.ambient(pan, (o) => a.noise(o, { dur: 1.4, vol: 0.05, type: 'bandpass', f0: 600 + Math.random() * 600, f1: 1800, q: 6 }), true);
    }
  },

  // Arpegio siniestro en menor, lento, con huecos y reverberación (Cavidad Pulmonar).
  arpeggio(a, t) {
    // 0,6 s por nota (4 pasos de 150 ms); el acorde cambia cada 8 notas.
    if (t % 4 !== 0) return;
    const n = (t / 4) | 0;
    const chords = [[57, 60, 64, 69], [53, 56, 60, 65], [55, 58, 62, 67], [52, 55, 59, 64]]; // La m, Fa m, Sol m, Mi m(b9)
    const chord = chords[Math.floor(n / 8) % chords.length];
    if (n % 8 === 7 || Math.random() < 0.18) return; // silencios que respiran
    const order = [0, 2, 1, 3, 2, 1, 3, 0];
    const midi = chord[order[n % 8]] + (n % 16 >= 8 ? 12 : 0);
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    a.ambient((n % 2 ? 0.35 : -0.35), (o) => { a.tone(o, { type: 'triangle', f0: f, f1: f, dur: 1.6, vol: 0.028 }); a.tone(o, { type: 'sine', f0: f * 2.01, f1: f * 2, dur: 0.9, vol: 0.008 }); }, true);
    // Cada cambio de acorde, una nota grave muy suave por debajo.
    if (n % 8 === 0) a.ambient(0, (o) => a.tone(o, { type: 'sine', f0: f / 4, f1: f / 4, dur: 4.6, vol: 0.03 }), true);
  },

  // Digestivo: burbujeo de fluidos y goteos que resuenan.
  fluids(a) {
    if (Math.random() < 0.09) a.ambient(Math.random() * 2 - 1, (o) => a.tone(o, { type: 'sine', f0: 180 + Math.random() * 260, f1: 90, dur: 0.12, vol: 0.04 }));
    if (Math.random() < 0.03) a.ambient(Math.random() * 2 - 1, (o) => a.tone(o, { type: 'sine', f0: 1500 + Math.random() * 900, f1: 900, dur: 0.18, vol: 0.03 }), true);
  },
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0 };
    this.lastPlayed = new Map();
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Safari (iPhone) crea el audio en pausa y lo vuelve a pausar al cambiar de app:
    // cualquier toque o tecla lo despierta.
    const wake = () => { if (this.ctx.state !== 'running') this.ctx.resume?.(); };
    wake();
    for (const ev of ['touchend', 'pointerdown', 'keydown']) addEventListener(ev, wake, { passive: true });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // Fondo de zona (zumbido y capas del bioma): se apaga despacio durante los jefes.
    this.zone = this.ctx.createGain();
    this.zone.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.reverb = this.#makeReverb(3.5);
  }

  #makeReverb(seconds) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.6;
    conv.connect(wet).connect(this.master);
    return conv;
  }

  // ---------- Música de la pantalla de inicio ----------
  // Progresión menor lenta (Am - F - Dm - E), campanas dispersas y un latido lejano.
  startTitleMusic() {
    if (!this.ctx || this.music) return;
    const c = this.ctx;
    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.exponentialRampToValueAtTime(1, c.currentTime + 3);
    bus.connect(this.master);
    bus.connect(this.reverb);

    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const CHORDS = [[45, 57, 60, 64], [41, 53, 57, 60], [38, 50, 53, 57], [40, 52, 56, 59]];
    const BAR = 8;
    const music = { bus, next: c.currentTime + 0.1, bar: 0, beat: 0 };

    const pad = (notes, t) => {
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, t);
      filter.frequency.linearRampToValueAtTime(900, t + BAR / 2);
      filter.frequency.linearRampToValueAtTime(300, t + BAR);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 2.5);
      g.gain.setValueAtTime(0.035, t + BAR - 1.5);
      g.gain.linearRampToValueAtTime(0.0001, t + BAR + 1.5);
      filter.connect(g).connect(bus);
      for (const n of notes) {
        for (const det of [-7, 7]) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = midi(n);
          o.detune.value = det;
          o.connect(filter);
          o.start(t);
          o.stop(t + BAR + 1.6);
        }
      }
    };

    const bell = (n, t) => {
      const o = c.createOscillator();
      const o2 = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o2.type = 'sine';
      o.frequency.value = midi(n);
      o2.frequency.value = midi(n) * 2.76; // parcial inarmónico: timbre de campana
      const g2 = c.createGain();
      g2.gain.value = 0.25;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(bus);
      o.start(t);
      o2.start(t);
      o.stop(t + 3.1);
      o2.stop(t + 3.1);
    };

    const thump = (t, vol) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(60, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.2);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.3);
    };

    // Planificador con margen: cada 200 ms programa lo que cae en el próximo segundo.
    const schedule = () => {
      while (music.next < c.currentTime + 1) {
        const t = music.next;
        const chord = CHORDS[music.bar % CHORDS.length];
        if (music.beat === 0) pad(chord, t);
        if (Math.random() < 0.45) {
          const n = chord[1 + Math.floor(Math.random() * 3)] + (Math.random() < 0.5 ? 12 : 24);
          bell(n, t + Math.random() * 0.3);
        }
        if (music.beat % 2 === 0) {
          thump(t, 0.12);
          thump(t + 0.28, 0.08);
        }
        music.beat++;
        music.next += 1;
        if (music.beat >= BAR) {
          music.beat = 0;
          music.bar++;
        }
      }
    };
    schedule();
    music.timer = setInterval(schedule, 200);
    this.music = music;
  }

  stopTitleMusic(fade = 2) {
    const m = this.music;
    if (!m) return;
    this.music = null;
    clearInterval(m.timer);
    const t = this.ctx.currentTime;
    m.bus.gain.cancelScheduledValues(t);
    m.bus.gain.setValueAtTime(m.bus.gain.value, t);
    m.bus.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => m.bus.disconnect(), (fade + 2) * 1000);
  }

  // ---------- Música de los jefes aberración (core/BossMusic.js) ----------
  startBossMusic(theme) {
    if (!this.ctx || this.bossMusic) return;
    this.bossMusic = startBossMusic(this, theme);
    this.#fadeZone(0.0001, 5);
    this.bossTheme = theme;
  }

  // Fundido lento del fondo de zona (el silencio se impone antes de la música del jefe).
  #fadeZone(to, seconds) {
    const g = this.zone.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(to, t + seconds);
  }

  stopBossMusic(fade = 1.5) {
    if (!this.bossMusic) return;
    this.bossMusic.stop(fade);
    this.#fadeZone(1, 4);
    this.bossMusic = null;
    this.bossTheme = null;
  }

  // Zumbido grave de fondo con un filtro que "respira".
  startDrone() {
    if (!this.ctx || this.droneOn) return;
    this.droneOn = true;
    const c = this.ctx;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, c.currentTime + 2);
    const oscs = [43.65, 44.1, 87.5].map((f) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
      return o;
    });
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    filter.connect(gain).connect(this.zone);

    const wind = c.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.8;
    const wg = c.createGain();
    wg.gain.value = 0.03;
    wind.connect(bp).connect(wg).connect(this.zone);
    wind.start();

    // Zumbido tonal propio de cada bioma (un silbido de nervio, un rumor de víscera...).
    const hum = c.createOscillator();
    const humGain = c.createGain();
    const trem = c.createOscillator();
    const tremGain = c.createGain();
    hum.frequency.value = 110;
    humGain.gain.value = 0;
    trem.frequency.value = 6;
    tremGain.gain.value = 0;
    trem.connect(tremGain).connect(humGain.gain);
    hum.connect(humGain).connect(this.zone);
    hum.start();
    trem.start();
    this.drone = { oscs, filter, lfo, gain, bed: bp, bedGain: wg, hum, humGain, trem, tremGain };
  }

  // Paisaje sonoro del bioma: retoca el zumbido base y arranca su capa propia.
  setBiome(sound) {
    if (!this.ctx || !this.drone || !sound || this.biomeSound === sound) return;
    this.biomeSound = sound;
    const c = this.ctx, t = c.currentTime, d = this.drone;
    // Timbre, tono y filtro del zumbido base.
    [sound.drone, sound.drone * 1.01, sound.drone * 2].forEach((f, i) => {
      d.oscs[i].type = sound.wave ?? 'sawtooth';
      d.oscs[i].frequency.setTargetAtTime(f, t, 1.2);
    });
    d.filter.frequency.setTargetAtTime(sound.filter, t, 1.2);
    d.filter.Q.setTargetAtTime(sound.q ?? 1, t, 1.2);
    d.lfo.frequency.setTargetAtTime(sound.lfo, t, 1.2);
    d.gain.gain.setTargetAtTime(sound.level ?? 0.07, t, 1.2);
    // Lecho de ruido: siseo, aire, rumor de fluidos...
    d.bed.frequency.setTargetAtTime(sound.bed?.freq ?? 380, t, 1.2);
    d.bed.Q.setTargetAtTime(sound.bed?.q ?? 0.8, t, 1.2);
    d.bedGain.gain.setTargetAtTime(sound.bed?.level ?? 0.03, t, 1.2);
    // Zumbido tonal (o silencio si el bioma no tiene).
    d.hum.type = sound.hum?.wave ?? 'sine';
    d.hum.frequency.setTargetAtTime(sound.hum?.freq ?? 110, t, 0.5);
    d.humGain.gain.setTargetAtTime(sound.hum?.level ?? 0, t, 1.2);
    d.trem.frequency.setTargetAtTime(sound.hum?.trem ?? 6, t, 0.5);
    d.tremGain.gain.setTargetAtTime(sound.hum?.trem ? (sound.hum.level ?? 0) * 0.8 : 0, t, 1.2);

    clearInterval(this.layerTimer);
    this.layerT = 0;
    // Una o varias capas a la vez (p. ej. respiración + arpegio).
    const layers = [].concat(sound.layer ?? []).map((n) => LAYERS[n]).filter(Boolean);
    if (layers.length) this.layerTimer = setInterval(() => { const t = this.layerT++; for (const l of layers) l(this, t); }, 150);
  }

  // Sonido ambiental sin posición pero con un paneo dado.
  ambient(pan, fn, wet = false) {
    const c = this.ctx, g = c.createGain();
    g.gain.value = 1;
    if (wet && this.reverb) g.connect(this.reverb);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.zone);
    } else g.connect(this.zone);
    fn(g);
  }

  setListener(x, y) {
    this.listener.x = x;
    this.listener.y = y;
  }

  #output(pos, gain = 1) {
    const c = this.ctx;
    const g = c.createGain();
    let vol = gain, pan = 0;
    if (pos && pos.x !== undefined) {
      const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y;
      vol = gain / (1 + Math.hypot(dx, dy) / 140);
      pan = Math.max(-1, Math.min(1, dx / 180));
    }
    g.gain.value = vol;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  tone(dest, { type = 'sine', f0, f1 = f0, dur, vol, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Voz de criatura: diente de sierra con vibrato irregular y "aspereza" (trémolo
  // rápido) a través de un formante, como una garganta que no termina de ser humana.
  creature(dest, { f0, f1 = f0, dur, vol, formant = 900, q = 4, vib = 8, rough = 0.5, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = vib * (0.7 + Math.random() * 0.6);
    lg.gain.value = f0 * 0.05;
    lfo.connect(lg).connect(o.frequency);
    const trem = c.createOscillator(), tg = c.createGain(), amp = c.createGain();
    trem.type = 'square';
    trem.frequency.value = 30 + Math.random() * 30;
    tg.gain.value = rough * 0.5;
    amp.gain.value = 1 - rough * 0.5;
    trem.connect(tg).connect(amp.gain);
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = q;
    flt.frequency.setValueAtTime(formant, t);
    flt.frequency.linearRampToValueAtTime(formant * 0.6, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(amp).connect(flt).connect(g).connect(dest);
    for (const n of [o, lfo, trem]) { n.start(t); n.stop(t + dur + 0.03); }
  }

  // Voz orgánica (core/Voices.js): una garganta con su curva de entonación (`pitch`:
  // [[0..1, Hz], ...] o f0 -> f1), sus vocales (`formants`: [[Hz, Q, ganancia], ...],
  // que se deslizan hacia `to`), vibrato suave, un gruñido de garganta (`growl`:
  // trémolo senoidal grave, no el zumbido cuadrado), aliento (`breath`) y una
  // envolvente que entra y se apaga sin chasquido (`attack`, `release`: fracción final).
  voice(dest, {
    pitch, f0 = 200, f1 = f0, dur, vol, formants = [[800, 5, 1]], to = null, wave = 'sawtooth',
    vib = 5, vibDepth = 0.025, growl = 0, growlRate = 32, growlWave = 'sine', breath = 0,
    attack = 0.04, release = 0.45, delay = 0,
  }) {
    const c = this.ctx, t = c.currentTime + delay;
    const pts = pitch ?? [[0, f0], [1, f1]];
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(pts[0][1], t);
    for (const [k, f] of pts.slice(1)) o.frequency.linearRampToValueAtTime(Math.max(20, f), t + k * dur);
    // Vibrato: una oscilación lenta y otra más lenta aún e irregular (la voz no es fija).
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = vib * (0.85 + Math.random() * 0.3);
    lg.gain.value = pts[0][1] * vibDepth;
    lfo.connect(lg).connect(o.frequency);
    const wob = c.createOscillator(), wg = c.createGain();
    wob.frequency.value = 0.7 + Math.random() * 1.5;
    wg.gain.value = pts[0][1] * vibDepth * 0.8;
    wob.connect(wg).connect(o.frequency);
    // Gruñido: la amplitud late a ritmo grave (garganta que raspa).
    const amp = c.createGain();
    amp.gain.value = 1 - growl * 0.5;
    const gr = c.createOscillator(), gg = c.createGain();
    gr.type = growlWave;
    gr.frequency.value = growlRate * (0.85 + Math.random() * 0.3);
    gg.gain.value = growl * 0.5;
    gr.connect(gg).connect(amp.gain);
    const bus = c.createGain();
    o.connect(amp).connect(bus);
    const srcs = [o, lfo, wob, gr];
    if (breath > 0) {
      const n = c.createBufferSource(), ng = c.createGain();
      n.buffer = this.noiseBuf;
      ng.gain.value = breath * 1.4;
      n.connect(ng).connect(bus);
      n.start(t, Math.random() * 0.5);
      n.stop(t + dur + 0.05);
    }
    // Banco de formantes (las vocales) en paralelo.
    const env = c.createGain();
    formants.forEach(([f, q, gain], i) => {
      const flt = c.createBiquadFilter();
      flt.type = 'bandpass';
      flt.Q.value = q;
      flt.frequency.setValueAtTime(f, t);
      if (to?.[i]) flt.frequency.linearRampToValueAtTime(to[i][0], t + dur);
      const fg = c.createGain();
      fg.gain.value = gain;
      bus.connect(flt).connect(fg).connect(env);
    });
    // Envolvente suave: entra, se sostiene y se apaga.
    const a = Math.min(attack, dur * 0.4), r = t + dur * (1 - release);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + a);
    env.gain.setValueAtTime(vol, Math.max(t + a, r));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(dest);
    for (const s of srcs) { s.start(t); s.stop(t + dur + 0.05); }
  }

  // Golpe resonante (hueso, quitina, madera): un "toc" con cuerpo, no un chasquido seco.
  knock(dest, { f = 900, dur = 0.12, vol = 0.2, q = 18, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(flt).connect(g).connect(dest);
    n.start(t, Math.random() * 0.5);
    n.stop(t + dur + 0.02);
    // El cuerpo: una nota corta que resuena con el golpe.
    this.tone(dest, { type: 'sine', f0: f, f1: f * 0.92, dur: dur * 0.9, vol: vol * 0.35, delay });
  }

  noise(dest, { dur, vol, type = 'lowpass', f0 = 1000, f1 = f0, q = 1, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name, pos) {
    if (!this.ctx || !SOUNDS[name]) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.03) return;
    this.lastPlayed.set(name, now);
    SOUNDS[name](this, this.#output(pos, GAIN[name] ?? 1));
  }
}
