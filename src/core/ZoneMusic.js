// Temas de zona sintetizados (en vez de una pista grabada): suenan por el bus de zona, se
// alternan con el ambiente como las pistas del bioma (biomes.js: sound.music.theme) y
// terminan solos (onend) para que vuelva el ambiente.
//
//   osario  Territorio del Hueso. Industrial pesado y distorsionado, lento pero con pulso:
//           re frigio a 68 ppm, a medio tiempo. Un riff de hueso saturado (dos sierras y su
//           octava baja por un saturador duro y una "caja de altavoz") con notas ahogadas
//           a palma (golpe corto y el filtro que se cierra); yunque en el tercer tiempo,
//           bombo sincopado, cadenas, chapa y escapes de vapor. En la pausa, campanas de
//           hueso que se apagan nada más sonar, como oídas a través de la pared.
//           Intro 4 · riff 8 · pausa 4 · riff con melodía 8 · cierre 4 (unos 100 s).
//
// Todo se programa con antelación (planificador cada 100 ms, a semicorcheas).

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ahead: cuánto se programa por adelantado (s); Infinity lo programa entero (para renderizar
// el tema sin tiempo real, p. ej. a un archivo).
export function startZoneMusic(audio, theme, dest, { vol = 0.6, onend, ahead = 0.5 } = {}) {
  if (theme !== 'osario') return null;                                       // (de momento, el único tema)
  const c = audio.ctx;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, c.currentTime);
  out.gain.exponentialRampToValueAtTime(vol, c.currentTime + 4);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.2;
  out.connect(comp).connect(dest);
  const wet = c.createGain();
  wet.gain.value = 0.22;
  comp.connect(wet).connect(audio.reverb);

  // Saturador duro (el riff y el zumbido) y la "caja de altavoz": corta lo chillón.
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 9) * 0.9; }
  shaper.curve = curve;
  shaper.oversample = '4x';
  const cab = c.createBiquadFilter();
  cab.type = 'lowpass'; cab.frequency.value = 2300; cab.Q.value = 0.9;
  const body = c.createBiquadFilter();
  body.type = 'peaking'; body.frequency.value = 110; body.gain.value = 5; body.Q.value = 1;
  const dist = c.createGain();
  dist.gain.value = 0.9;
  const distOut = c.createGain();
  distOut.gain.value = 0.16;
  dist.connect(shaper).connect(cab).connect(body).connect(distOut).connect(out);

  const noise = (t, dur, v, type, f0, q = 1, f1) => {
    const s = c.createBufferSource();
    s.buffer = audio.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  };

  // Nota del riff. muted: a palma, ahogada (corta, y el filtro se cierra al momento).
  const riff = (n, t, dur, muted) => {
    const f = midi(n);
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(muted ? 1400 : 3200, t);
    lp.frequency.exponentialRampToValueAtTime(muted ? 260 : 1100, t + (muted ? 0.09 : dur));
    const len = muted ? 0.13 : dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(muted ? 0.9 : 0.75, t + 0.006);
    g.gain.setValueAtTime(muted ? 0.9 : 0.6, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const os = [[f, 'sawtooth', -9], [f, 'sawtooth', 9], [f / 2, 'square', 0]].map(([fr, type, det]) => {
      const o = c.createOscillator();
      o.type = type; o.frequency.setValueAtTime(fr, t); o.detune.value = det;
      o.connect(lp);
      o.start(t); o.stop(t + len + 0.05);
      return o;
    });
    lp.connect(g).connect(dist);
    return os;
  };

  const kick = (t, v = 0.7) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.45);
    noise(t, 0.03, v * 0.25, 'highpass', 2500);                              // el chasquido del mazo
  };
  // Yunque: golpe de ruido y parciales inarmónicos de metal que resuenan.
  const anvil = (t, v = 0.32) => {
    noise(t, 0.22, v, 'bandpass', 1900, 0.8);
    noise(t, 0.08, v * 0.6, 'highpass', 5000);
    for (const [fr, d] of [[523, 0.9], [811, 0.6], [1187, 0.45], [1764, 0.3]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(fr * (1 + (Math.random() - 0.5) * 0.004), t);
      g.gain.setValueAtTime(v * 0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + d + 0.02);
    }
  };
  const chain = (t, v = 0.05) => { for (let k = 0; k < 5; k++) noise(t + k * 0.035 + Math.random() * 0.01, 0.04, v * (1 - k * 0.12), 'bandpass', 3800 + Math.random() * 1600, 6); };
  const clank = (t, v = 0.12) => { noise(t, 0.35, v, 'bandpass', 640 + Math.random() * 120, 18); noise(t, 0.05, v * 0.5, 'bandpass', 2400, 4); };
  const hat = (t, v = 0.03) => noise(t, 0.04, v, 'highpass', 7000);
  const steam = (t, dur = 1.6, v = 0.06) => noise(t, dur, v, 'bandpass', 5200, 1.2, 1400);

  // Campana de hueso ahogada: FM metálica que se apaga enseguida, tras un filtro cerrado.
  const choked = (n, t, ring = 0.12, v = 0.12) => {
    const f = midi(n);
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain();
    car.frequency.setValueAtTime(f, t);
    car.frequency.exponentialRampToValueAtTime(f * 0.985, t + ring + 0.1);   // al ahogarla se hunde un poco
    mod.frequency.setValueAtTime(f * 3.5, t);
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.2, t + ring);
    mod.connect(mg).connect(car.frequency);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.setValueAtTime(v * 0.7, t + ring);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring + 0.07);         // la mano que la para
    car.connect(lp).connect(g).connect(out);
    for (const o of [car, mod]) { o.start(t); o.stop(t + ring + 0.15); }
  };

  // Zumbido saturado de fondo (re grave), con su filtro respirando; entra y sale por secciones.
  const drone = c.createGain();
  drone.gain.value = 0.0001;
  const dlp = c.createBiquadFilter();
  dlp.type = 'lowpass'; dlp.frequency.value = 300;
  const dlfo = c.createOscillator(), dlg = c.createGain();
  dlfo.frequency.value = 0.07; dlg.gain.value = 160;
  dlfo.connect(dlg).connect(dlp.frequency);
  const dos = [midi(26), midi(26) * 1.006, midi(38)].map((fr) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(dlp); o.start(); return o; });
  dlp.connect(drone).connect(dist);
  dlfo.start();
  const droneTo = (t, v, secs) => { drone.gain.setTargetAtTime(Math.max(0.0001, v), t, secs / 3); };

  // ----- Partitura (re frigio: Re Mib Fa Sol La Sib Do). Notas: [paso, nota, pasos, ahogada]
  const D = 38, Eb = 39, F = 41, E = 40, Bb = 34, A = 33, Ab = 32;
  const RIFF = [
    [[0, D, 3], [3, D, 1, 1], [4, D, 1, 1], [6, D, 2], [10, D, 1, 1], [11, D, 1, 1], [12, Eb, 4]],
    [[0, D, 3], [3, D, 1, 1], [4, D, 1, 1], [6, F, 2], [10, D, 1, 1], [11, D, 1, 1], [12, E, 2], [14, D, 1, 1]],
    [[0, D, 3], [3, D, 1, 1], [4, D, 1, 1], [6, D, 2], [10, D, 1, 1], [11, D, 1, 1], [12, Eb, 4]],
    [[0, Bb, 4], [4, Bb, 1, 1], [6, A, 4], [10, A, 1, 1], [11, A, 1, 1], [12, Ab, 4]],
  ];
  // Melodía de campanas ahogadas: [paso, nota, eco largo?]
  const BELLS = [
    [[0, 57], [4, 58], [6, 57], [10, 53]],
    [[0, 55], [4, 53], [8, 51, 1]],
    [[0, 57], [4, 58], [6, 57], [10, 53], [14, 52]],
    [[0, 50], [3, 51], [6, 50], [12, 45, 1]],
  ];
  // Secciones: [compases, nombre]
  const SECTIONS = [[4, 'intro'], [8, 'riff'], [4, 'pausa'], [8, 'riff2'], [4, 'cierre']];
  const TOTAL = SECTIONS.reduce((s, [n]) => s + n, 0);
  const sectionAt = (bar) => { let b = bar; for (const [n, name] of SECTIONS) { if (b < n) return { name, i: b, n }; b -= n; } return null; };

  const bpm = 68, step = 60 / bpm / 4;
  const st = { next: c.currentTime + 0.15, s: 0, ended: false };
  const playStep = (t) => {
    const bar = Math.floor(st.s / 16), i = st.s % 16, sec = sectionAt(bar);
    if (!sec) return;
    const ph = bar % 4;
    if (i === 0 && sec.i === 0) {
      // Cambio de sección: escape de vapor y el zumbido se ajusta.
      if (sec.name !== 'intro') steam(t - step * 2, 1.4, 0.05);
      droneTo(t, { intro: 0.5, riff: 0.18, pausa: 0.45, riff2: 0.18, cierre: 0.35 }[sec.name], 3);
      if (sec.name === 'cierre') droneTo(t + step * 16 * 3, 0.0001, 4);
    }
    // ---- Riff
    if (sec.name === 'riff' || sec.name === 'riff2' || (sec.name === 'cierre' && sec.i < 2)) {
      for (const [at, n, len, muted] of RIFF[ph]) if (at === i) riff(n, t, len * step * 0.95, !!muted);
    } else if (sec.name === 'pausa' && ph === 3 && i >= 12) {
      riff(D, t, step, true);                                                 // chugs que anuncian la vuelta
    } else if (sec.name === 'cierre' && sec.i === 2 && i === 0) {
      riff(D, t, step * 30, false); riff(D + 7, t, step * 30, false);         // el último acorde, que se pudre
    }
    // ---- Batería (medio tiempo: el yunque en el tercer tiempo)
    const full = sec.name === 'riff' || sec.name === 'riff2';
    if (sec.name === 'intro') {
      if (i === 0) kick(t, 0.55);
      if (i === 8 && ph % 2 === 1) anvil(t, 0.22);
      if (i === 12 && ph === 2) clank(t, 0.1);
    } else if (full) {
      if (i === 0 || i === 10) kick(t, 0.7);
      if (i === 3 || (i === 7 && ph % 2 === 1)) kick(t, 0.38);                // golpes fantasma: el pulso cojea
      if (i === 8) anvil(t, 0.3);
      if (i % 2 === 0) hat(t, i % 4 === 0 ? 0.035 : 0.022);
      if (i === 15 && ph % 2 === 1) chain(t);
      if (i === 13 && ph === 3) clank(t, 0.12);
      if (ph === 3 && sec.i === sec.n - 1 && i >= 12) kick(t, 0.45);          // redoble de mazos al final
    } else if (sec.name === 'pausa') {
      if (i === 0) kick(t, 0.5);
      if (i === 8) anvil(t, 0.2);
      if (i === 6 || i === 14) chain(t, 0.035);
    } else if (sec.name === 'cierre') {
      if (sec.i < 2 && (i === 0 || i === 10)) kick(t, 0.6);
      if (sec.i < 2 && i === 8) anvil(t, 0.28);
      if (sec.i === 2 && i === 0) { kick(t, 0.8); anvil(t, 0.4); steam(t + step * 4, 2.5, 0.05); }
    }
    // ---- Campanas ahogadas: en la pausa, y por encima del riff en la segunda vuelta.
    if (sec.name === 'pausa' || (sec.name === 'riff2' && sec.i >= 4) || (sec.name === 'intro' && sec.i >= 2 && ph === 3)) {
      for (const [at, n, long] of BELLS[ph]) if (at === i) choked(n, t, long ? 0.5 : 0.1, sec.name === 'riff2' ? 0.08 : 0.12);
    }
  };
  const schedule = () => {
    while (st.next < c.currentTime + ahead) {
      if (st.s >= TOTAL * 16) {
        if (!st.ended && ahead !== Infinity) { st.ended = true; setTimeout(() => { if (!stopped) { stop(4); onend?.(); } }, 6000); }
        return;
      }
      playStep(st.next);
      st.s++;
      st.next += step;
    }
  };
  let stopped = false;
  const stop = (fade = 2) => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    const t = c.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => { for (const o of [...dos, dlfo]) { try { o.stop(); } catch { /* ya parado */ } } out.disconnect(); wet.disconnect(); }, (fade + 1) * 1000);
  };
  schedule();
  const timer = setInterval(schedule, 100);
  return { stop };
}
