// Música de los jefes aberración, al estilo de la Mega Drive: síntesis FM de dos
// operadores (bajo largo y melodía con vibrato tardío), un arpegio de onda cuadrada
// como el chip PSG y batería de ruido. Tétrica pero melódica: escalas menores, una
// frase de cuatro compases que se repite igual (para que se quede) con un eco fantasma.
// Errática pero consistente: el latido nunca se rompe; solo a veces una nota se tuerce,
// suena un trino breve o un pitido suelto del chip.
//
//   quimera  re menor, 88 ppm: Rem - Sib - Solm - La; motivo sobre el semitono La-Sib
//   coro     mi menor con giros frigios, 76 ppm: Mim - Do - Lam - Si; un suspiro que baja
//   ganglio  techno minimalista en do menor, 124 ppm: bajo a semicorcheas y arpegio simple
//
// Todo se programa con antelación (planificador cada 100 ms, a semicorcheas).

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function startBossMusic(audio, theme) {
  const c = audio.ctx;
  const bus = c.createGain();
  bus.gain.setValueAtTime(0.0001, c.currentTime);
  bus.gain.exponentialRampToValueAtTime(0.75, c.currentTime + 1.5);
  // Un poco de brillo de chip: paso alto suave y compresión ligera.
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 40;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  bus.connect(hp).connect(comp).connect(audio.master);
  const wet = c.createGain();
  wet.gain.value = 0.18;
  bus.connect(wet).connect(audio.reverb);

  // Voz FM de dos operadores. index = profundidad de modulación (brillo), que cae con
  // `decay`; vib añade vibrato a partir de 0,15 s, como los leads de Mega Drive.
  const fm = (n, t, dur, { ratio = 1, index = 2, decay = 0.25, vol = 0.1, attack = 0.004, vib = 0, detune = 0, type = 'sine' } = {}) => {
    const f = midi(n);
    const car = c.createOscillator();
    car.type = type;
    car.frequency.setValueAtTime(f, t);
    car.detune.value = detune;
    const mod = c.createOscillator();
    mod.frequency.setValueAtTime(f * ratio, t);
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.12), t + decay);
    mod.connect(mg).connect(car.frequency);
    const nodes = [car, mod];
    if (vib && dur > 0.2) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 5.6;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * vib, t + Math.min(dur, 0.3));
      lfo.connect(lg).connect(car.frequency);
      nodes.push(lfo);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    car.connect(g).connect(bus);
    for (const o of nodes) { o.start(t); o.stop(t + dur + 0.1); }
  };
  // Cuadrada fina del PSG (arpegios).
  const psg = (n, t, dur, vol = 0.03) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(midi(n), t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  };
  const noise = (t, dur, vol, type, f0, q = 1) => {
    const s = c.createBufferSource();
    s.buffer = audio.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.value = f0;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  };
  const kick = (t, vol = 0.45) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + 0.22);
  };
  const snare = (t, vol = 0.22) => {
    noise(t, 0.14, vol, 'bandpass', 2200, 0.7);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    g.gain.setValueAtTime(vol * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + 0.12);
  };
  const hat = (t, open = false) => noise(t, open ? 0.18 : 0.035, open ? 0.06 : 0.05, 'highpass', 7500);

  // Temas: lentos y siniestros, con un leitmotiv de cuatro compases que se quede en la
  // cabeza. Melodías: [nota, semicorcheas] (cada compás suma 16; 0 = silencio).
  const THEMES = {
    // La Quimera: re menor; el motivo gira sobre el semitono La-Sib, como un gruñido.
    quimera: {
      bpm: 88,
      roots: [38, 46, 43, 45],                       // Re, Sib, Sol, La
      chords: [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]],
      bassPat: [0, 0, 0, 0, 12, 0, 0, 0],
      melody: [
        [[74, 4], [69, 4], [70, 4], [69, 4]],
        [[67, 4], [65, 2], [64, 2], [65, 8]],
        [[74, 4], [69, 4], [70, 4], [73, 4]],
        [[74, 8], [73, 4], [69, 4]],
      ],
      lead: { ratio: 2, index: 1.1, decay: 0.8, vol: 0.07, vib: 0.01, attack: 0.03 },
      bass: { ratio: 1, index: 1.6, decay: 0.4, vol: 0.13 },
      arpBars: [3],
      drums(t, s) {
        const i = s % 16;
        if (i === 0 || i === 3) kick(t, i === 0 ? 0.4 : 0.22);   // latido: lub-dub
        if (i === 8) snare(t, 0.07);
        if (i % 4 === 2) hat(t);
      },
    },
    // El Ganglio Madre: techno minimalista en do menor. Bombo a negras sin parar, un
    // bajo continuo a semicorcheas (con la octava a contratiempo) y un arpegio simple
    // del chip que sube y baja por el acorde. Casi sin melodía: solo el pulso.
    ganglio: {
      bpm: 124,
      roots: [36, 36, 36, 39],                       // Do, Do, Do, Mib
      chords: [[60, 63, 67], [60, 63, 67], [60, 63, 70], [63, 67, 70]],
      ostinato: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 7], // semicorcheas
      melody: [[], [], [], [[79, 8], [0, 8]]],       // un único pitido largo cada cuatro compases
      lead: { ratio: 2, index: 0.8, decay: 0.6, vol: 0.04, vib: 0.01, attack: 0.02 },
      bass: { ratio: 1, index: 2.4, decay: 0.07, vol: 0.12 },
      arpPat: [0, 1, 2, 1],                          // sube y baja: do-mib-sol-mib
      arpEvery: 2,
      arpVol: 0.022,
      arpBars: [],
      drums(t, s, st) {
        const i = s % 16;
        if (i % 4 === 0) kick(t, 0.42);                              // cuatro al suelo
        if (i % 4 === 2) hat(t, true);                               // abierto a contratiempo
        else if (i % 2 === 1) hat(t);                                // tic suave entre medias
        if (i === 4 || i === 12) snare(t, 0.06);                     // palmada seca
        if (i === 14 && st.bar % 4 === 3) noise(t, 0.25, 0.05, 'bandpass', 5200, 12); // chispazo
      },
    },
    // El Coro: mi menor con giros frigios; un suspiro que baja (Si-Do-Si-Sol-Fa#) y
    // sube hasta un Re# que no resuelve.
    coro: {
      bpm: 76,
      roots: [40, 36, 45, 47],                       // Mi, Do, La, Si
      chords: [[64, 67, 71], [60, 64, 67], [69, 72, 76], [71, 75, 78]],
      bassPat: [0, 0, 0, 0, 7, 0, 0, 0],
      melody: [
        [[71, 4], [72, 2], [71, 2], [67, 4], [66, 4]],
        [[64, 6], [67, 2], [66, 4], [64, 4]],
        [[69, 4], [71, 2], [72, 2], [76, 4], [75, 4]],
        [[71, 8], [70, 4], [71, 4]],
      ],
      lead: { ratio: 3.5, index: 1.2, decay: 1, vol: 0.065, vib: 0.008, attack: 0.02 }, // campana
      bass: { ratio: 0.5, index: 1.4, decay: 0.6, vol: 0.14 },
      pad: true,
      arpBars: [],
      drums(t, s, st) {
        const i = s % 16;
        if (i === 0 || i === 3) kick(t, i === 0 ? 0.42 : 0.24);
        if (i === 8 && st.bar % 2) noise(t, 0.6, 0.035, 'bandpass', 3400, 16); // golpe metálico lejano
      },
    },
  };
  const th = THEMES[theme] ?? THEMES.quimera;
  const step = 60 / th.bpm / 4; // semicorchea
  const st = { next: c.currentTime + 0.1, s: 0, bar: 0, noteAt: 0, noteIdx: 0, loop: 0 };

  const playStep = (t) => {
    const i = st.s % 16;
    const bar = st.bar % 4;
    // Bajo FM: notas largas, casi un pedal.
    // Con ostinato, el bajo late sin parar; su largo marca el ritmo (8 = corcheas, 16 = semicorcheas).
    const every = th.ostinato ? 16 / th.ostinato.length : 0;
    if (th.ostinato) { if (i % every === 0) fm(th.roots[bar] + th.ostinato[i / every], t, step * every * 0.8, th.bass); }
    else if (i === 0 || i === 8) fm(th.roots[bar] + th.bassPat[i / 2], t, step * 7, th.bass);
    // Coro FM sostenido (acorde por compás, ataque lento).
    if (th.pad && i === 0) for (const n of th.chords[bar]) fm(n - 12, t, step * 15, { ratio: 1, index: 0.5, decay: 2, vol: 0.026, attack: 0.4, vib: 0.006 });
    // Arpegio PSG, apenas audible, solo en los compases marcados.
    if (th.arpPat) {
      // Arpegio propio del tema: notas del acorde en el orden de arpPat, cada arpEvery pasos.
      const e = th.arpEvery ?? 2;
      if (i % e === 0) psg(th.chords[bar][th.arpPat[(i / e) % th.arpPat.length]] + 12, t, step * e * 0.8, th.arpVol ?? 0.014);
    } else if (th.arpBars.includes(bar) && i % 2 === 0) psg(th.chords[bar][(i / 2) % 3] + 12, t, step * 1.5, 0.014);
    // Melodía: siempre la misma frase (que se quede); lo errático, en detalles raros.
    let acc = 0;
    for (const [n, len] of th.melody[bar]) {
      if (acc === i && n) {
        let note = n;
        if (st.loop % 3 === 2 && Math.random() < 0.06) note += Math.random() < 0.5 ? 1 : -1; // nota torcida
        const dur = len * step;
        if (len >= 8 && Math.random() < 0.15) {
          for (let k = 0; k < 4; k++) fm(note + (k % 2), t + k * step, step * 0.9, { ...th.lead, vib: 0 }); // trino breve
          fm(note, t + 4 * step, dur - 4 * step, th.lead);
        } else fm(note, t, dur * 0.95, th.lead);
        // Eco fantasma: la misma nota, una octava abajo y lejos, tres semicorcheas después.
        fm(note - 12, t + step * 3, dur * 0.8, { ...th.lead, vol: th.lead.vol * 0.28, vib: 0 });
      }
      acc += len;
    }
    // De vez en cuando, un pitido suelto del chip (consistente: siempre en el último tiempo).
    if (i === 14 && Math.random() < 0.2) psg(th.chords[bar][2] + 24, t, step * 0.6, 0.012);
    th.drums(t, st.s, st);
  };

  const schedule = () => {
    while (st.next < c.currentTime + 0.5) {
      playStep(st.next);
      st.s++;
      if (st.s % 16 === 0) {
        st.bar++;
        if (st.bar % 4 === 0) st.loop++;
      }
      st.next += step;
    }
  };
  schedule();
  const timer = setInterval(schedule, 100);
  return {
    stop(fade = 1.5) {
      clearInterval(timer);
      const t = c.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
      bus.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => { bus.disconnect(); }, (fade + 1.5) * 1000);
    },
  };
}
