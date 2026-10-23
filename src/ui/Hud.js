import { OXYGEN_BASE, ITEMS } from '../state/State.js';
import { getSprite } from '../core/Sprites.js';
const K = '#140c10';
import { Placenta, drawNumber, drawBoneIcon, drawCellIcon, drawItemIcon } from './Bladders.js';

const $ = (id) => document.getElementById(id);

// Mayúsculas sin tildes: la fuente pixel no tiene vocales acentuadas en mayúscula.
export const caps = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Minitutorial del HUD: la primera vez que cambia cada valor, su vejiga se hincha y late
// unos segundos (con un anillo) y al lado sale qué es. De uno en uno, en cola.
//   sac: la vejiga que se señala · test(antes, ahora): ¿ha cambiado como para explicarlo?
// Cómo se usa la cavidad activa (lo escribe el juego según teclado, mando o táctil).
let cavHow = () => '';
export const setCavityHelp = (fn) => { cavHow = fn; };
const HUD_TUTOR = [
  { id: 'int', sac: 'int', color: '#ff5a6a', test: (a, b) => b.int < a.int,
    text: '<b>INTEGRIDAD</b> · la vejiga de sangre: <b>tu vida</b>. Si se vacía, mueres. Se recupera en el útero o con coágulos de plasma.' },
  { id: 'bio', sac: 'bio', color: '#e07a98', test: (a, b) => b.bio !== a.bio,
    text: '<b>BIOMASA</b> · la carne rosa: <b>tu moneda</b> y lo que comen tus mutaciones. La sueltan las criaturas; en el útero la gastas en curarte y comprar.' },
  { id: 'o2', sac: 'o2', color: '#4ab8f0', test: (a, b) => b.o2 < a.o2,
    text: '<b>OXÍGENO</b> · la vejiga azul: <b>tu aliento</b>. Lo gastan el doble salto, la embestida y el salto de pared; se recupera solo si descansas un momento.' },
  { id: 'lux', sac: 'lux', color: '#ffd23f', test: (a, b) => b.lux > a.lux + 0.5 || b.cells > a.cells,
    text: '<b>LUZ</b> · la vejiga amarilla: <b>la energía de tu ojo</b>. Se gasta con el ojo encendido (F); las células lumínicas como esta la recargan, y las que sobran se guardan.' },
  { id: 'rej', sac: 'rej', color: '#c07bff', test: (a, b) => b.rej > a.rej,
    text: '<b>RECHAZO</b> · la vejiga violeta: <b>tu cuerpo lucha contra los injertos</b>. Alto, las mutaciones fallan; al 100 % te hace daño. Lo calman los supresores del útero.' },
  { id: 'dead', sac: 'dead', color: '#b0a0a8', test: (a, b) => b.dead > a.dead,
    text: '<b>CORRUPCIÓN</b> · el bulto oscuro: <b>tejido muerto</b> que te roba vida máxima. Lo cura el Tejido sano.' },
  { id: 'scrap', slot: 'scrap', color: '#e0d4b8', test: (a, b) => b.scrap > a.scrap,
    text: '<b>HUESO</b> · se cuenta, no tiene límite: <b>la munición del Cañón de Astillas</b> y la moneda de algunos úteros. La sueltan los nódulos óseos.' },
  { id: 'it:plasma', slot: 'plasma', color: '#ff5a6a', test: (a, b) => b.plasma > a.plasma,
    text: () => `<b>COÁGULO DE PLASMA</b> · se aloja en una <b>cavidad</b> (los huecos bajo el hueso). ${cavHow()}: +30 de integridad al momento.` },
  { id: 'it:shield', slot: 'shield', color: '#4ff0ff', test: (a, b) => b.shield > a.shield,
    text: () => `<b>PERLA DE NÁCAR</b> · se aloja en una <b>cavidad</b>. ${cavHow()}: 10 s en los que nada te hiere.` },
  { id: 'it:regen', slot: 'regen', color: '#7dff9a', test: (a, b) => b.regen > a.regen,
    text: () => `<b>CÉLULA MADRE</b> · se aloja en una <b>cavidad</b>. ${cavHow()}: regeneras integridad durante 10 s.` },
  { id: 'inf', sac: 'int', color: '#9ad050', test: (a, b) => b.inf && !a.inf,
    text: '<b>INFECCIÓN</b> · tu sangre se vuelve verde: <b>te pudre poco a poco</b> y te da arcadas. La cura el útero (Sanar tejido).' },
];
// La caja se queda hasta que el jugador la acepta (E / Intro, Esc o tocándola).

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
    if (!lines.length) { opts.onEnd?.(); return; }   // sin texto: como si ya se hubiera leído
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

  // Voz: una frase suelta de un personaje (no espera a que pases). Con su nombre, del
  // mismo aspecto que las conversaciones, más pequeña y se va sola.  opts: { speaker }
  bark(text, seconds = 3, opts = {}) {
    if (this.dlg) return;
    const el = $('bark');
    el.querySelector('.who').textContent = caps(opts.speaker ?? '');
    el.querySelector('.txt').textContent = text;
    el.hidden = false;
    el.classList.remove('out');
    this.barkTime = seconds;
    this.msg.classList.remove('show');    // la voz manda sobre la información
    this.msgTime = 0;
  }

  // ¿Hay una voz o un aviso en pantalla? Y quitarlos (botón de salir).
  get textShown() { return this.barkTime > 0 || this.msgTime > 0; }
  dismiss() {
    this.barkTime = 0; $('bark').hidden = true;
    this.msgTime = 0; this.msg.classList.remove('show');
  }

  // Minitutorial: ¿hay una explicación abierta? Y cerrarla (acepta el jugador).
  get tutOpen() { return !!this.tut; }
  closeTut() {
    if (!this.tut) return;
    this.tut = null;
    $('hud-tip').hidden = true;
  }

  // Marca visual (ver Game.pop): se apilan si coinciden; cada una vive ~1,4 s.
  pop(text, color, sprite, sx, sy, big) {
    const stage = document.getElementById('stage');
    const el = document.createElement('div');
    el.className = big ? 'pop big' : 'pop';
    el.style.setProperty('--c', color);
    this.popN = (this.popN ?? 0) + 1;
    el.style.left = `${Math.round(sx)}px`;
    el.style.top = `${Math.round(sy - ((this.popN - 1) % 3) * 8)}px`;
    if (sprite) {
      try {
        const img = getSprite(sprite, 'a').tex.image, c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        el.append(c);
      } catch { /* sin icono */ }
    }
    const t = document.createElement('span');
    t.textContent = text;
    el.append(t);
    stage.append(el);
    setTimeout(() => { el.remove(); this.popN = Math.max(0, this.popN - 1); }, 1400);
  }

  say(text, seconds = 2.5) {
    if (this.dlg || this.barkTime > 0) return;   // mientras habla alguien, los avisos no lo tapan
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
      const next = this.typing ? '' : d.i < d.lines.length - 1 ? '▸' : '✕';
      if (this.cache.dlgNext !== next) el.querySelector('.next').textContent = this.cache.dlgNext = next;
    }
    if (this.barkTime > 0) {
      this.barkTime -= dt;
      const el = $('bark');
      if (this.barkTime <= 0.3) el.classList.add('out');
      if (this.barkTime <= 0) el.hidden = true;
    }
    this.t = (this.t ?? 0) + dt;
    const t = this.t;
    this.g ??= $('organs-c').getContext('2d');
    this.gl ??= $('organs-glow').getContext('2d');
    this.placenta ??= new Placenta(34, 20, 26, 17);
    const g = this.g, gl = this.gl;
    g.clearRect(0, 0, 150, 40);
    gl.clearRect(0, 0, 150, 40);
    const lux = '#' + eye.map((c) => Math.round(Math.min(1, c) * 255).toString(16).padStart(2, '0')).join('');
    const hp = st.integrity / 100, infected = st.infection > 0, bio = st.biomass / st.biomassMax;
    // Minitutorial: ¿ha cambiado algo por primera vez? A la cola; luego, de uno en uno.
    const snap = { int: st.integrity, bio: st.biomass, o2: st.oxygen, lux: st.light, cells: st.cells, scrap: st.scrap, rej: st.rejection, dead: st.corrupted, inf: st.infection > 0, plasma: st.items.plasma ?? 0, shield: st.items.shield ?? 0, regen: st.items.regen ?? 0 };
    // Aviso de cada cambio en los contadores: el icono parpadea un momento al subir.
    this.flashT ??= {};
    if (this.prevSnap) for (const k of ['scrap', 'cells', 'plasma', 'shield', 'regen']) if (snap[k] > this.prevSnap[k]) this.flashT[k] = 0.9;
    for (const k in this.flashT) this.flashT[k] = Math.max(0, this.flashT[k] - dt);
    st.hudSeen ??= new Set();
    this.tutQueue ??= [];
    if (this.prevSnap) for (const tu of HUD_TUTOR) if (!st.hudSeen.has(tu.id) && tu.test(this.prevSnap, snap)) { st.hudSeen.add(tu.id); this.tutQueue.push(tu); }
    this.prevSnap = snap;
    if (this.tut) this.tut.age += dt;
    if (!this.tut && this.tutQueue.length && !this.dlg) {
      this.tut = { ...this.tutQueue.shift(), age: 0 };
      const tip = $('hud-tip');
      tip.innerHTML = `${typeof this.tut.text === 'function' ? this.tut.text() : this.tut.text}<span class="tip-ok">✕</span>`;
      tip.onclick = () => this.closeTut();
      tip.style.setProperty('--c', this.tut.color);
      tip.style.top = this.tut.slot ? '38px' : '';   // bajo las cavidades si señala un icono
      tip.hidden = false;
    }
    // La vejiga señalada se hincha (entra rápido, late y vuelve a su tamaño al final).
    const tk = this.tut ? Math.min(1, this.tut.age / 0.35) * (0.75 + 0.25 * Math.sin(t * 7)) : 0;
    // Las demás se encogen un poco para dejarle sitio.
    const big = (it) => (this.tut?.sac === it.id ? { ...it, rMin: it.rMin * (1 + 1.2 * tk) + 4 * tk, rMax: it.rMax * (1 + 0.8 * tk), low: true }
      : this.tut?.sac ? { ...it, rMin: it.rMin * (1 - 0.3 * tk), rMax: it.rMax * (1 - 0.4 * tk) } : it);
    const items = [
      { id: 'int', level: hp, rMin: 2.5, rMax: 11.5, color: infected ? '#6a9a30' : '#c0283a', low: hp < 0.25, boil: infected ? 0.9 : 0.2 },
      { id: 'bio', level: bio, rMin: 2.5, rMax: 8, color: '#e07a98', low: bio < 0.15, boil: 0.15 },
      { id: 'o2', level: st.oxygen / OXYGEN_BASE, rMin: 2.5, rMax: 7.5, color: '#4ab8f0', low: st.oxygen < 20, boil: 0.5 },
      { id: 'lux', level: st.light / 100, rMin: 2.5, rMax: 7.5, color: st.flashlightOn ? lux : '#5a5040', low: st.light < 20, boil: st.flashlightOn ? 0.3 : 0, glow: st.flashlightOn },
      { id: 'rej', level: Math.min(1, st.rejection / 100), rMin: 1.5, rMax: 7, color: st.critical ? '#ff4a8a' : '#a040d8', low: st.critical, boil: Math.min(1, st.rejection / 80) },
      { id: 'dead', level: st.corrupted / 100, rMin: 0, rMax: 7, color: '#3a2a30', dead: true },
    ].map(big);
    this.placenta.update(items, dt, t);
    this.placenta.draw(g, gl, t);
    // Anillo que late alrededor de la vejiga señalada (en la capa de brillo, se ve a oscuras).
    const sac = this.tut && this.placenta.sacs.get(this.tut.sac);
    if (sac && tk > 0.05) {
      const r = sac.r + 2 + Math.sin(t * 7) * 0.8;
      for (const c of [g, gl]) {
        c.strokeStyle = this.tut.color; c.globalAlpha = c === g ? 0.9 : 0.8 * tk; c.lineWidth = 1;
        c.beginPath(); c.arc(sac.x, sac.y, r, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
      }
    }
    // ---- Reservas (contadores, sin máximo): hueso (munición) y células (recargas de la luz).
    // Un halo cuando suben o cuando el tutorial las señala.
    const mark = (k, x, y, w, h, c) => {
      const f = Math.max(this.flashT[k] ?? 0, this.tut?.slot === k ? 0.6 + 0.4 * Math.sin(t * 7) : 0);
      if (f <= 0) return;
      gl.fillStyle = c; gl.globalAlpha = Math.min(1, f); gl.fillRect(x - 1, y - 1, w + 2, h + 2); gl.globalAlpha = 1;
      if (this.tut?.slot === k) { g.strokeStyle = c; g.lineWidth = 1; g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3); }
    };
    drawBoneIcon(g, 64, 15, t);
    drawNumber(g, 75, 15, st.scrap, st.scrap === 0 ? '#ff5a5a' : '#e8dcc8');
    mark('scrap', 63, 12, 12 + String(st.scrap).length * 4, 9, '#e0d4b8');
    // Células lumínicas en reserva: recargan el ojo solas cuando su luz baja de la mitad.
    const cx = 75 + String(st.scrap).length * 4 + 4;
    drawCellIcon(g, cx, 13, t, st.cells > 0);
    drawNumber(g, cx + 6, 15, st.cells, st.cells === 0 ? '#6a6050' : '#ffd23f');
    mark('cells', cx, 12, 7 + String(st.cells).length * 4, 9, '#ffd23f');
    // ---- Cavidades: los huecos de carne con el consumible que llevas a mano en cada una
    // (icono y cuántos quedan). La activa tiene el borde vivo; debajo, la barra del efecto
    // que esté durando. Luego, los efectos activos que no van en cavidad.
    const COLOR = { plasma: '#ff5a6a', shield: '#4ff0ff', regen: '#7dff9a' };
    let bx = 64;
    const by = 25;
    st.cavities.forEach((k, i) => {
      const n = k ? st.items[k] ?? 0 : 0, on = k && (st.timers[k] ?? 0) > 0, act = i === st.cavity;
      const w = 9 + (k ? String(n).length * 4 : 0), c = k ? COLOR[k] : '#c88a98';
      // El hueco: carne oscura con el borde algo más claro (vivo si es la activa).
      g.fillStyle = '#1a0a10'; g.beginPath(); g.roundRect(bx, by - 1, w, 9, 3); g.fill();
      g.strokeStyle = act ? c : '#4a1a26'; g.lineWidth = 1; g.globalAlpha = act ? 0.75 + 0.25 * Math.sin(t * 5) : 1;
      g.beginPath(); g.roundRect(bx + 0.5, by - 0.5, w - 1, 8, 3); g.stroke(); g.globalAlpha = 1;
      if (act && this.choosing) { gl.fillStyle = c; gl.globalAlpha = 0.6; gl.fillRect(bx - 1, by - 2, w + 2, 11); gl.globalAlpha = 1; }
      if (k) {
        g.globalAlpha = n || on ? 1 : 0.35;
        drawItemIcon(g, k, bx + 1.5, by + 0.5, t, on);
        g.globalAlpha = 1;
        drawNumber(g, bx + 9, by + 1, n, n ? '#e8dcc8' : '#6a6050');
        if (on) { const left = st.timers[k] / (ITEMS[k].time || 1); g.fillStyle = K; g.fillRect(bx + 1, by + 9, w - 2, 2); g.fillStyle = c; g.fillRect(bx + 1, by + 9, Math.ceil((w - 2) * left), 1); }
        mark(k, bx, by - 1, w, 9, c);
      }
      bx += w + 2;
    });
    // Efectos activos de consumibles que no están en ninguna cavidad.
    for (const k of Object.keys(COLOR)) {
      if (st.cavities.includes(k) || !((st.timers[k] ?? 0) > 0)) continue;
      drawItemIcon(g, k, bx, by, t, true);
      g.fillStyle = K; g.fillRect(bx, by + 7, 6, 2); g.fillStyle = COLOR[k]; g.fillRect(bx, by + 7, Math.ceil(6 * st.timers[k] / (ITEMS[k].time || 1)), 1);
      bx += 9;
    }
    if ((st.timers.immune ?? 0) > 0) {
      drawItemIcon(g, 'immune', bx, by, t, true);
      g.fillStyle = K; g.fillRect(bx, by + 7, 6, 2); g.fillStyle = '#9affb0'; g.fillRect(bx, by + 7, Math.ceil(6 * st.timers.immune / 10), 1);
    }
  }
}
