import { Placenta, drawNumber, drawBoneIcon, drawCellIcon } from './Bladders.js';

const $ = (id) => document.getElementById(id);

// Mayúsculas sin tildes: la fuente pixel no tiene vocales acentuadas en mayúscula.
export const caps = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Retrato del que habla (26x26, pixel art): una cara de carne que mueve la boca mientras
// se escribe el texto. k: 0 poseída (gris violácea, ojos rojos, dientes) · 1 liberada.
function drawPortrait(cv, t, talking, k, kind) {
  if (kind === 'bucle') return drawBucle(cv, t, talking);
  const g = cv.getContext('2d'), mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const rgb = (c) => `rgb(${c.join(',')})`;
  const skin = mix([96, 62, 78], [196, 140, 112]), dark = mix([52, 26, 40], [120, 70, 60]), lite = mix([140, 96, 120], [232, 184, 150]);
  const iris = mix([255, 40, 50], [255, 190, 90]);
  g.clearRect(0, 0, 26, 26);
  // Fondo: una cavidad húmeda.
  g.fillStyle = '#12060a'; g.fillRect(0, 0, 26, 26);
  g.fillStyle = 'rgba(120,30,50,0.35)'; g.fillRect(2, 2, 22, 22);
  // Cabeza: óvalo de carne con sombra a la derecha y brillo arriba a la izquierda.
  for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
    const dx = (x + 0.5 - 13) / 9, dy = (y + 0.5 - 14) / 11, d = dx * dx + dy * dy;
    if (d > 1) continue;
    g.fillStyle = rgb(d > 0.78 || dx > 0.55 ? dark : dx < -0.2 && dy < -0.3 ? lite : skin);
    g.fillRect(x, y, 1, 1);
  }
  // Venas de la posesión (se van al liberarlo).
  if (k < 0.6) { g.fillStyle = `rgba(30,10,24,${0.8 - k})`; for (const [x, y] of [[7, 6], [8, 7], [8, 8], [18, 7], [17, 8], [19, 17], [18, 18], [6, 16]]) g.fillRect(x, y, 1, 1); }
  // Ojos: miran de un lado a otro a saltos y parpadean.
  const look = Math.round(Math.sin(Math.floor(t * 1.3) * 2.7)), blink = (t % 3.7) < 0.12;
  for (const ex of [8, 15]) {
    g.fillStyle = rgb(dark); g.fillRect(ex - 1, 10, 5, 3);
    if (blink) { g.fillStyle = rgb(skin); g.fillRect(ex - 1, 11, 5, 1); continue; }
    g.fillStyle = k < 0.5 ? '#d8c0b0' : '#f0e4d0'; g.fillRect(ex, 11, 3, 1);
    g.fillStyle = rgb(iris); g.fillRect(ex + 1 + look, 11, 1, 1);
  }
  // Boca: se abre y cierra al hablar; poseído, con dientes.
  const open = talking ? [0, 1, 2, 1][Math.floor(t * 14) % 4] : 0;
  g.fillStyle = rgb(dark); g.fillRect(9, 18, 8, 1);
  if (open) {
    g.fillStyle = '#2a0408'; g.fillRect(9, 18, 8, open + 1);
    if (k < 0.5) { g.fillStyle = '#e8dcc0'; for (let x = 9; x < 17; x += 2) { g.fillRect(x, 18, 1, 1); g.fillRect(x + 1, 18 + open, 1, 1); } }
  }
}

// Pensamiento Bucle: una cara pálida casi a oscuras, cuencas vacías y una boca que
// repite; un hilo da vueltas a su alrededor.
function drawBucle(cv, t, talking) {
  const g = cv.getContext('2d');
  g.fillStyle = '#05040a'; g.fillRect(0, 0, 26, 26);
  for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
    const dx = (x + 0.5 - 12) / 7, dy = (y + 0.5 - 13) / 9, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const lit = -dx * 0.6 - dy * 0.4;                     // luz desde arriba a la izquierda
    g.fillStyle = d > 0.8 ? '#2a2630' : lit > 0.35 ? '#c8c0c8' : lit > -0.1 ? '#8a8290' : '#4a4452';
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = '#000'; g.fillRect(8, 10, 3, 3); g.fillRect(14, 10, 3, 3);
  if ((t % 2.4) < 1.2) { g.fillStyle = '#6a5a80'; g.fillRect(9, 11, 1, 1); g.fillRect(15, 11, 1, 1); }
  const open = talking ? [0, 1, 1, 0][Math.floor(t * 10) % 4] : 0;
  g.fillStyle = '#1a141e'; g.fillRect(10, 17, 4, 1 + open);
  // El hilo del bucle, girando.
  g.fillStyle = 'rgba(170,150,210,0.8)';
  for (let i = 0; i < 18; i++) { const a = t * 1.5 + i * 0.35, r = 10.5; g.fillRect(Math.round(12.5 + Math.cos(a) * r), Math.round(13 + Math.sin(a) * r * 0.9), 1, 1); }
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.msg = $('message');
    this.prompt = $('prompt');
    this.msgTime = 0;
    this.cache = {};
  }

  show(v) { this.root.hidden = !v; }

  // Diálogo (lore): una o varias pantallas que esperan a que el jugador pase. El texto
  // se escribe letra a letra; pasar la primera vez lo completa, la segunda avanza.
  //   opts: { speaker, key (texto del aviso para pasar), owner, onLine(i), onEnd() }
  dialogue(lines, opts = {}) {
    if (this.dlg) this.endDialogue();
    lines = lines.filter(Boolean);
    if (!lines.length) return;
    this.dlg = { lines, i: 0, shown: 0, ...opts };
    const el = $('dialogue');
    el.hidden = false;
    el.querySelector('.who').textContent = opts.speaker ? caps(opts.speaker) : '';
    // Con alguien que habla: conversación (retrato y nombre). Sin nadie: narración.
    el.className = opts.speaker ? 'npc' : 'narr';
    $('bark').hidden = true; this.barkTime = 0;
    this.cache.dlgTxt = this.cache.dlgNext = null;
    this.msg.classList.remove('show');
    this.msgTime = 0;
    opts.onLine?.(0);
  }
  get dialogueActive() { return !!this.dlg; }
  get typing() { const d = this.dlg; return !!d && d.shown < d.lines[d.i].length; }
  advance() {
    const d = this.dlg;
    if (!d) return;
    if (this.typing) { d.shown = d.lines[d.i].length; return; }
    if (++d.i >= d.lines.length) return this.endDialogue();
    d.shown = 0;
    d.onLine?.(d.i);
  }
  endDialogue() {
    const d = this.dlg;
    if (!d) return;
    this.dlg = null;
    $('dialogue').hidden = true;
    d.onEnd?.();
  }

  // Voz: una frase suelta de un personaje (no espera a que pases). Con su retrato y su
  // nombre, del mismo aspecto que las conversaciones, más pequeña y se va sola.
  //   opts: { speaker, owner (k: liberado), portrait: 'anfitrion' | 'bucle' }
  bark(text, seconds = 3, opts = {}) {
    if (this.dlg) return;
    const el = $('bark');
    el.querySelector('.who').textContent = caps(opts.speaker ?? '');
    el.querySelector('.txt').textContent = text;
    el.hidden = false;
    el.classList.remove('out');
    this.barkOpts = opts;
    this.barkTime = seconds;
    this.barkTalk = Math.min(seconds, 0.6 + text.length * 0.045);
  }

  say(text, seconds = 2.5) {
    if (this.dlg) return;                 // mientras hay un diálogo, los avisos no lo tapan
    this.msg.textContent = text;
    this.msg.classList.add('show');
    this.msgTime = seconds;
  }

  // Jefe de zona (null = ocultar): su nombre siempre; su vida, solo si sabes leerla
  // (Cerebro I u Ojo I).
  setBoss(e, showHp) {
    const el = $('boss-bar');
    el.hidden = !e;
    if (!e) return;
    const k = `${e.def.name}:${Math.ceil(e.hp)}:${showHp}`;
    if (this.cache.boss === k) return;
    this.cache.boss = k;
    el.querySelector('span').textContent = caps(e.def.name);
    el.querySelector('.bar').hidden = !showHp;
    el.querySelector('.fill').style.width = `${Math.max(0, e.hp / e.def.hp) * 100}%`;
  }

  setPrompt(text) {
    if (this.cache.prompt !== text) this.prompt.textContent = this.cache.prompt = text;
  }

  // HUD orgánico: una placenta ovalada que contiene una vejiga por parámetro. Cada
  // vejiga crece al llenarse y se arruga al vaciarse, y se empujan entre ellas, así
  // que el sitio que ocupa cada una cambia en directo. Sin textos:
  //   integridad: sangre roja (verde si te infectas) · biomasa: carne líquida rosa · oxígeno: azul
  //   luz: del color de tu ojo · rechazo: violeta · corrupción: un bulto necrosado
  update(dt, st, roomName, eye = [1, 0.82, 0.25]) {
    this.msgTime -= dt;
    if (this.msgTime <= 0) this.msg.classList.remove('show');
    const d = this.dlg;
    if (d) {
      const line = d.lines[d.i];
      d.shown = Math.min(line.length, d.shown + dt * 48);
      const el = $('dialogue'), txt = line.slice(0, Math.floor(d.shown));
      if (this.cache.dlgTxt !== txt) el.querySelector('.txt').textContent = this.cache.dlgTxt = txt;
      const next = this.typing ? '' : `${d.key ?? 'E'} ${d.i < d.lines.length - 1 ? '>' : 'x'}`;
      if (this.cache.dlgNext !== next) el.querySelector('.next').textContent = this.cache.dlgNext = next;
      if (d.speaker) drawPortrait(el.querySelector('.face'), this.t ?? 0, this.typing, d.owner?.k ?? 0, d.portrait);
    }
    if (this.barkTime > 0) {
      this.barkTime -= dt; this.barkTalk -= dt;
      const el = $('bark');
      if (this.barkTime <= 0.3) el.classList.add('out');
      if (this.barkTime <= 0) el.hidden = true;
      else drawPortrait(el.querySelector('.face'), this.t ?? 0, this.barkTalk > 0, this.barkOpts.owner?.k ?? 0, this.barkOpts.portrait);
    }
    this.t = (this.t ?? 0) + dt;
    const t = this.t;
    this.g ??= $('organs-c').getContext('2d');
    this.gl ??= $('organs-glow').getContext('2d');
    this.placenta ??= new Placenta(34, 20, 26, 17);
    const g = this.g, gl = this.gl;
    g.clearRect(0, 0, 110, 40);
    gl.clearRect(0, 0, 110, 40);
    const lux = '#' + eye.map((c) => Math.round(Math.min(1, c) * 255).toString(16).padStart(2, '0')).join('');
    const hp = st.integrity / 100, infected = st.infection > 0, bio = st.biomass / st.biomassMax;
    const items = [
      { id: 'int', level: hp, rMin: 2.5, rMax: 11.5, color: infected ? '#6a9a30' : '#c0283a', low: hp < 0.25, boil: infected ? 0.9 : 0.2 },
      { id: 'bio', level: bio, rMin: 2.5, rMax: 8, color: '#e07a98', low: bio < 0.15, boil: 0.15 },
      { id: 'o2', level: st.oxygen / 100, rMin: 2.5, rMax: 7.5, color: '#4ab8f0', low: st.oxygen < 20, boil: 0.5 },
      { id: 'lux', level: st.light / 100, rMin: 2.5, rMax: 7.5, color: st.flashlightOn ? lux : '#5a5040', low: st.light < 20, boil: st.flashlightOn ? 0.3 : 0, glow: st.flashlightOn },
      { id: 'rej', level: Math.min(1, st.rejection / 100), rMin: 1.5, rMax: 7, color: st.critical ? '#ff4a8a' : '#a040d8', low: st.critical, boil: Math.min(1, st.rejection / 80) },
      { id: 'dead', level: st.corrupted / 100, rMin: 0, rMax: 7, color: '#3a2a30', dead: true },
    ];
    this.placenta.update(items, dt, t);
    this.placenta.draw(g, gl, t);
    // En fila: icono del hueso y su valor (munición de las astillas), luego la célula y el suyo.
    drawBoneIcon(g, 64, 15, t);
    drawNumber(g, 75, 15, st.scrap, st.scrap === 0 ? '#ff5a5a' : '#e8dcc8');
    // Células lumínicas en reserva: recargan el ojo solas cuando su luz baja de la mitad.
    const cx = 75 + String(st.scrap).length * 4 + 4;
    drawCellIcon(g, cx, 13, t, st.cells > 0);
    drawNumber(g, cx + 6, 15, st.cells, st.cells === 0 ? '#6a6050' : '#ffd23f');
  }
}
