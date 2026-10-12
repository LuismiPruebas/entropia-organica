import { MUTATIONS, LINES, LINE_ORDER, FRAGMENTS, SYNERGIES, CLASHES, ROMAN, linesOf } from '../data/mutations.js';
import { WEAPONS } from '../state/State.js';
import { dnaTag } from '../entities/Pickup.js';
import { PlayerBody, BODY_W, BODY_H } from '../entities/PlayerBody.js';
import { caps } from './Hud.js';
import { MenuNav } from './MenuNav.js';
import { drawBladder, drawNumber, drawBoneIcon } from './Bladders.js';
import { px, seg, part, blob } from '../entities/Rig.js';

// Genoma del Huésped (tecla I): una ficha viva y gráfica del cuerpo.
//   izquierda  el espécimen (tu cuerpo, con sus mutaciones) y tus constantes en vejigas
//   centro     el árbol genético: seis líneas de órganos (I→III), unidas por venas;
//              las fusiones (Tendón, Tercer Ojo) beben de dos líneas. Activa = brilla,
//              ADN latente = silueta que late (no sabes qué hará hasta asimilarlo en el
//              útero), desconocida = silueta apagada. Debajo, la carga genética, las
//              sinergias y los choques entre órganos, los fragmentos y las memorias.
//   derecha    lo que señalas, en pocas líneas: efecto, contrapartida, coste.

const VEINS = [
  'M0,8 C40,2 70,16 120,6 S200,14 250,4 S330,12 384,6',
  'M0,208 C50,214 90,200 150,210 S240,202 300,212 S360,204 384,210',
  'M6,0 C2,40 12,80 4,120 S10,180 6,216',
  'M378,0 C384,50 372,90 380,130 S374,190 378,216',
];

// Posición de cada mutación en el árbol (en % del área central) y sus venas.
// Columnas: una por línea; filas: niveles I, II, III. Las fusiones van entre sus dos líneas.
const COL_X = { cerebro: 8, ojo: 25, dermis: 42, extremidades: 58, torso: 75, canon: 92 };
const ROW_Y = [0, 6, 28, 50];
const TREE = Object.fromEntries(Object.entries(MUTATIONS).map(([id, m]) => {
  const ls = linesOf(m);
  const x = ls.length > 1 ? (COL_X[ls[0]] + COL_X[ls[1]]) / 2 : COL_X[m.line];
  return [id, [x, ROW_Y[m.level]]];
}));
// Venas: de cada mutación a las que exige.
const LINKS = Object.entries(MUTATIONS).flatMap(([id, m]) => (m.requires ?? []).map((r) => [r, id]));
const SHORT = { cerebro: 'CEREBRO', ojo: 'OJO', dermis: 'DERMIS', extremidades: 'MIEMB.', torso: 'TORSO', canon: 'CAÑÓN' };
const COLUMNS = LINE_ORDER.map((l) => [SHORT[l], COL_X[l]]);

// Iconos de órgano, 18x18 en píxeles.
export const ICONS = {
  alveolos(g, c) { for (const [x, y, r] of [[6, 7, 3.2], [11, 6, 3], [8, 11, 3.4], [12, 11, 2.6]]) part(g, x, y, r, r, c, '#1a3a24', '#d8ffe0'); seg(g, 9, 1, 9, 5, '#a87a7a', 2); },
  pistones(g, c) { seg(g, 5, 2, 9, 9, '#c98a5e', 3); seg(g, 9, 9, 6, 16, '#9a9aa2', 2); seg(g, 11, 8, 8, 15, c, 1); part(g, 9, 9, 1.5, 1.5, '#55555e'); px(g, 4, 16, '#140c10', 6, 1); },
  tendon(g, c) { let x = 4, y = 3; for (let i = 0; i < 9; i++) { const nx = 9 + Math.sin(i * 0.9) * 5, ny = 3 + i * 1.6; seg(g, x, y, nx, ny, i % 2 ? c : '#9a3a4a', i < 4 ? 3 : 2); x = nx; y = ny; } px(g, x, y + 1, '#e8dcc8', 2, 2); },
  garras(g, c) { seg(g, 4, 2, 7, 9, '#e8dcc8', 2); for (const dx of [-2, 1, 4]) { seg(g, 7, 9, 7 + dx, 15, '#140c10', 2); seg(g, 7, 9, 7 + dx, 15, c, 1); } },
  simbionte(g, c) { for (let i = 0; i < 7; i++) { const r = 2 + Math.sin(((i + 1) / 8) * Math.PI) * 2; part(g, 4 + i * 1.6, 9, r, r, '#8a3048'); } part(g, 15, 9, 1.5, 1.5, c); px(g, 7, 5, '#e8dcc8'); px(g, 10, 5, '#e8dcc8'); },
  quitina(g, c) { shield(g, c, 1); },
  quitina2(g, c) { shield(g, c, 2); },
  nanocutis(g, c) { shield(g, '#6a7e90', 2); for (const [x, y] of [[7, 6], [8, 7], [9, 8], [10, 8], [11, 9], [8, 10], [8, 11]]) px(g, x, y, c); },
  cartografo(g, c) { brain(g); seg(g, 5, 9, 9, 9, c); seg(g, 9, 9, 9, 6, c); seg(g, 9, 6, 13, 6, c); },
  ecolocacion(g, c) { brain(g); for (const r of [3, 5, 7]) for (let a = -0.6; a <= 0.6; a += 0.2) px(g, 9 + Math.cos(a) * r, 9 + Math.sin(a) * r, c); },
  // Tercer Ojo: el cerebro abierto con un ojo fundido en medio que irradia.
  percepcion(g, c) {
    brain(g);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) px(g, 9 + Math.cos(a) * 7.5, 9 + Math.sin(a) * 6.5, c);
    blob(g, 9, 9, 4, 2.8, '#140c10');
    blob(g, 9, 9, 3.2, 2, '#e8dcc8');
    blob(g, 9, 9, 1.8, 1.8, c);
    px(g, 9, 8, '#140c10', 1, 2);
    px(g, 8, 8, '#ffffff');
  },
  ojo1(g, c) { eye(g, c, 0); },
  ojo2(g, c) { eye(g, c, 1); },
  alveolos2(g, c) { for (const [x, y, r] of [[5, 6, 3], [10, 5, 3], [14, 8, 2.6], [6, 11, 3.2], [11, 11, 3.4], [8, 15, 2.4]]) part(g, x, y, r, r, c, '#1a3a24', '#d8ffe0'); },
  astillas(g, c) { seg(g, 3, 13, 13, 5, '#140c10', 5); seg(g, 3, 13, 13, 5, '#a89a80', 3); seg(g, 3, 12, 13, 4, c, 1); for (const [x, y] of [[14, 3], [15, 5], [13, 2]]) px(g, x, y, '#f0e6d0'); px(g, 4, 14, '#8a3048', 2, 2); },
  escopeta(g, c) { for (const o of [0, 3]) { seg(g, 3, 9 + o, 15, 5 + o, '#140c10', 3); seg(g, 3, 9 + o, 15, 5 + o, o ? '#a89a80' : c, 1); } part(g, 5, 11, 2.6, 2.6, '#8a3048'); px(g, 15, 5, '#1a0608'); px(g, 15, 8, '#1a0608'); },
};
// Ojo: esclerótica, iris del color de la línea y pupila; con rayos si es el pineal.
function eye(g, c, rays) {
  if (rays) for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) seg(g, 9 + Math.cos(a) * 6, 9 + Math.sin(a) * 6, 9 + Math.cos(a) * 8, 9 + Math.sin(a) * 8, c);
  blob(g, 9, 9, 6, 4, '#140c10');
  blob(g, 9, 9, 5, 3, '#e8dcc8');
  blob(g, 9, 9, 2.6, 2.6, c);
  px(g, 9, 8, '#140c10', 1, 2);
  px(g, 7, 7, '#ffffff');
}
function shield(g, c, layers) {
  for (let l = layers - 1; l >= 0; l--) {
    for (let y = 0; y < 12; y++) {
      const hw = Math.round(6 * Math.cos((y / 12) * Math.PI * 0.5));
      px(g, 9 - hw + l, 3 + y + l, '#140c10', hw * 2 + 1, 1);
      if (hw > 0) px(g, 10 - hw + l, 3 + y + l, l ? '#4a5a6a' : c, hw * 2 - 1, 1);
    }
  }
  px(g, 6, 5, '#e8eef4', 2, 1);
}
function brain(g) {
  blob(g, 9, 9, 7, 6, '#140c10');
  blob(g, 9, 9, 6, 5, '#d08a9a');
  for (const [x0, y0, x1, y1] of [[5, 7, 8, 9], [9, 5, 10, 9], [12, 7, 11, 11], [6, 11, 9, 12]]) seg(g, x0, y0, x1, y1, '#8a4a5a');
}

// Célula que flota en el fondo, en pixel art plano: membrana oscura, citoplasma,
// núcleo y un píxel de brillo. r = radio en píxeles.
function drawCell(c, r) {
  const s = r * 2 + 1;
  c.width = c.height = s;
  const g = c.getContext('2d');
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - r, y - r);
    if (d > r + 0.3) continue;
    px(g, x, y, d > r - 0.8 ? '#5a1424' : (x + y) % 3 ? '#3a0c18' : '#46101e');
  }
  px(g, r + (r > 2 ? 1 : 0), r, '#8a2a3a');
  px(g, r - Math.ceil(r / 2), r - Math.ceil(r / 2), '#c86a78');
}

// Constantes vitales: id, etiqueta bajo la vejiga, color, nombre en la ficha.
const VITALS = [
  ['int', 'INT', '#ff5a6a', 'INTEGRIDAD'],
  ['bio', 'BIO', '#e07a98', 'BIOMASA'],
  ['o2', 'O2', '#4ab8f0', 'OXIGENO'],
  ['lux', 'LUZ', '#ffd23f', 'LUZ'],
  ['rej', 'RCH', '#c07bff', 'RECHAZO'],
];
const focusKey = (n) => (n.dataset.vital ? `vit:${n.dataset.vital}` : n.dataset.id ?? `mem:${n.dataset.mem}`);

export class Genome {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('genome');
    this.open = false;
    this.focus = null;
    this.#skeleton();
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'KeyI' || e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  #skeleton() {
    const cells = Array.from({ length: 9 }, (_, i) =>
      `<canvas class="cell" data-r="${2 + (i % 3)}" style="left:${8 + ((i * 41) % 92)}%;top:${10 + ((i * 29) % 78)}%;animation-delay:${-i * 1.3}s"></canvas>`).join('');
    const nodes = Object.entries(TREE).map(([id, [x, y]]) =>
      `<div class="g-node" data-id="${id}" style="left:${x}%;top:${y}%;--c:${MUTATIONS[id].color}"><canvas width="18" height="18"></canvas></div>`).join('');
    const links = LINKS.map(([a, b]) => {
      const [x0, y0] = TREE[a], [x1, y1] = TREE[b];
      const fusion = MUTATIONS[a].line !== MUTATIONS[b].line || MUTATIONS[b].lines;
      return `<line class="${fusion ? 'fusion' : ''}" x1="${x0}" y1="${y0 + 9}" x2="${x1}" y2="${y1 + 1}"/>`;
    }).join('');
    this.el.innerHTML = `
      <svg class="veins" viewBox="0 0 384 216" preserveAspectRatio="none">
        ${VEINS.map((d) => `<path class="vein" d="${d}"/><path class="pulse" d="${d}"/>`).join('')}
      </svg>
      ${cells}
      <header class="g-head"><h2>GENOMA DEL HUESPED</h2><span class="g-res"><canvas id="g-scrap" width="26" height="10"></canvas><span id="g-count"></span></span></header>
      <div class="g-body">
        <aside class="g-left">
          <div class="g-specimen">
            <div class="g-aura"></div>
            <canvas id="g-canvas" width="${BODY_W}" height="${BODY_H}"></canvas>
            <div class="g-scan"></div>
          </div>
          <div class="g-vitals">
            <canvas id="g-vitals" width="104" height="46"></canvas>
            ${VITALS.map(([id, label, color], i) => `<div class="g-vital" data-vital="${id}" style="left:${2 + i * 20}px;--c:${color}"><span>${label}</span></div>`).join('')}
          </div>
          <div class="g-vinfo" id="g-vinfo"></div>
        </aside>
        <section class="g-tree">
          <svg class="g-links" viewBox="0 0 100 100" preserveAspectRatio="none">${links}</svg>
          ${COLUMNS.map(([t, x]) => `<span class="g-col" style="left:${x}%">${t}</span>`).join('')}
          ${nodes}
          <div class="g-bottom"><div id="g-load"></div><div id="g-pairs"></div><div id="g-frags"></div><div id="g-mem"></div></div>
        </section>
        <aside class="g-info" id="g-info"></aside>
      </div>
      <footer class="g-foot">FLECHAS ELEGIR · [I] / [ESC] CERRAR</footer>`;
    this.canvas = this.el.querySelector('#g-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.vitals = this.el.querySelector('#g-vitals').getContext('2d');
    this.scrap = this.el.querySelector('#g-scrap').getContext('2d');
    for (const c of this.el.querySelectorAll('canvas.cell')) drawCell(c, Number(c.dataset.r));
    this.info = this.el.querySelector('#g-info');
    this.vinfo = this.el.querySelector('#g-vinfo');
    this.el.querySelector('.g-body').addEventListener('click', (e) => {
      const n = e.target.closest('.g-node');
      if (n) this.#pick(n.dataset.id);
    });
    this.el.querySelector('.g-body').addEventListener('mouseover', (e) => {
      const n = e.target.closest('[data-id], [data-mem], [data-vital]');
      if (n) this.#setFocus(focusKey(n));
    });
    // Flechas: recorre las constantes, el árbol y las memorias; la ficha sigue a la selección.
    this.nav = new MenuNav(this.el.querySelector('.g-body'), '.g-vital, .g-node, .g-memory', {
      isOpen: () => this.open,
      onSelect: (n) => this.#setFocus(focusKey(n)),
      onPick: (n) => this.#pick(n.dataset.id),
    });
  }

  // Intro / clic sobre un arma del cañón ya asimilada: pasa a ser la que disparas.
  #pick(id) {
    const st = this.game.state;
    if (!WEAPONS.includes(id) || !st.mutations.has(id)) return;
    st.cycleWeapon(id);
    this.game.audio.play('click');
    this.#render();
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    const st = this.game.state;
    // Empieza señalando lo pendiente de asimilar, o lo último activo.
    this.focus = [...st.dna][0] ?? [...st.mutations][0] ?? null;
    this.#render();
    const start = this.el.querySelector(`.g-node[data-id="${this.focus}"]`);
    if (start) this.nav.select(start, false); else { this.nav.index = 0; this.nav.restore(); }
    this.raf = requestAnimationFrame(this.#animate);
  }

  close() {
    this.open = false;
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
    this.game.closeGenome();
  }

  #state(id) {
    const st = this.game.state;
    return st.mutations.has(id) ? 'active' : st.dna.has(id) ? 'latent' : 'unknown';
  }

  #setFocus(id) {
    if (id === this.focus) return;
    this.focus = id;
    this.game.audio.play('flicker');
    this.#renderInfo();
    for (const n of this.el.querySelectorAll('.g-node')) n.classList.toggle('focus', n.dataset.id === id);
    for (const n of this.el.querySelectorAll('.g-vital')) n.classList.toggle('focus', `vit:${n.dataset.vital}` === id);
  }

  #render() {
    const st = this.game.state;
    const ids = Object.keys(MUTATIONS);
    this.el.querySelector('#g-count').textContent = `MUTACIONES ${st.mutations.size}/${ids.length}`;
    const hp = st.integrity / Math.max(1, st.maxIntegrity);
    this.el.style.setProperty('--beat', `${Math.max(0.45, Math.min(1.6, 0.45 + hp * 1.1 - (st.critical ? 0.3 : 0)))}s`);
    this.el.classList.toggle('critical', hp < 0.35 || st.critical);
    // Nodos del árbol.
    for (const n of this.el.querySelectorAll('.g-node')) {
      const id = n.dataset.id, s = this.#state(id), m = MUTATIONS[id];
      n.className = `g-node ${s}${id === this.focus ? ' focus' : ''}`;
      const g = n.querySelector('canvas').getContext('2d');
      g.clearRect(0, 0, 18, 18);
      // Solo lo asimilado se ve tal cual: el ADN latente es aún una silueta (que late).
      ICONS[id](g, s === 'active' ? m.color : '#3a3036');
      if (s !== 'active') {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(20,12,16,0.75)';
        g.fillRect(0, 0, 18, 18);
        g.globalCompositeOperation = 'source-over';
      }
    }
    // Fragmentos: tres hélices por tipo de órgano.
    this.el.querySelector('#g-frags').innerHTML = Object.entries(FRAGMENTS).map(([id, fr]) => {
      const n = st.fragments[id] ?? 0;
      return `<span class="g-frag" style="--c:${fr.color}" title="Fragmentos ${fr.name}: hacen crecer tu ${LINES[fr.line].name.toLowerCase()}">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
    }).join('');
    // Carga genética: lo que ocupan las mutaciones frente a lo que toleras.
    const over = st.load > st.capacity;
    this.el.querySelector('#g-load').innerHTML = `<span class="g-loadlbl${over ? ' over' : ''}">CARGA ${st.load}/${st.capacity}</span>`
      + `<span class="g-loadbar">${Array.from({ length: Math.max(st.capacity, st.load) }, (_, i) => `<i class="${i < st.load ? (i >= st.capacity ? 'over' : 'on') : ''}"></i>`).join('')}</span>`
      + (st.extenders ? `<span class="g-ext">+${st.extenders} EXT</span>` : '');
    // Sinergias (verde) y choques (rojo) activos.
    this.el.querySelector('#g-pairs').innerHTML = [
      ...st.synergies.map((p) => `<span class="g-pair syn" title="${p.text}">+ ${p.name}</span>`),
      ...st.clashes.map((p) => `<span class="g-pair clash" title="${p.text}">✕ ${p.name}${p.k > 1 ? ' x' + p.k : ''}</span>`),
    ].join('');
    this.el.querySelector('#g-mem').innerHTML = st.lore.map((_, i) => `<i class="g-memory" data-mem="${i}"></i>`).join('');
    this.#renderInfo();
  }

  // Panel derecho: pocas líneas, con colores para los costes.
  #renderInfo() {
    const st = this.game.state, vital = this.focus?.startsWith('vit:');
    this.#renderVital(vital ? this.focus.slice(4) : null);
    const f = vital ? null : this.focus; // con una vejiga señalada, a la derecha queda lo básico
    if (f?.startsWith('mem:')) {
      const [title, text] = st.lore[Number(f.slice(4))] ?? [];
      this.info.innerHTML = `<b class="i-name" style="color:#e8dcc8">${title ?? ''}</b><p class="i-lore">«${text ?? ''}»</p>`;
      return;
    }
    const m = MUTATIONS[f];
    if (!m) {
      const w = st.weaponId ? MUTATIONS[st.weaponId] : null;
      this.info.innerHTML = `
        <b class="i-name" style="color:#ffd23f">${w ? w.name.toUpperCase() : 'CULATA'}</b>
        <p class="i-fx">${w ? w.controls : 'Sin cañón solo golpeas cuerpo a cuerpo. Busca el ADN del Cañón de Astillas.'}</p>
        ${st.weapons.length > 1 ? '<p class="i-dim">[R] / R2 cambia de arma · Intro sobre un cañón activo lo empuña.</p>' : ''}
        <b class="i-name" style="color:#ff5a5a">OJO FOTÓFORO [F]</b>
        <p class="i-fx">${st.has('eye2') ? 'Revela lo oculto, disuelve el tejido fotosensible y ahuyenta a los lucífugos.' : st.has('eye1') ? 'Intuye lo oculto y delata las paredes falsas.' : 'Sin mutar, solo un halo alrededor de tu cuerpo: el haz llega con el Ojo I.'}</p>
        <p class="i-dim">Señala una secuencia del árbol.</p>`;
      return;
    }
    const s = this.#state(f), cost = st.installCost(f);
    const tag = `${linesOf(m).map((l) => caps(LINES[l].name)).join(' + ')} ${ROMAN[m.level]}`;
    // Con qué órganos se lleva bien o se estorba esta línea.
    const pairs = [...SYNERGIES.map((p) => [p, 'syn']), ...CLASHES.map((p) => [p, 'clash'])]
      .filter(([p]) => p.lines.some((l) => linesOf(m).includes(l)))
      .map(([p, k]) => `<span class="g-pair ${k}" title="${p.text}">${k === 'syn' ? '+' : '✕'} ${p.name} (${p.lines.map((l) => LINES[l].name).join('·')})</span>`).join(' ');
    if (s === 'unknown') {
      this.info.innerHTML = `<b class="i-name" style="color:#6a5a5a">? ? ?</b><span class="i-tag">${tag}</span>
        <p class="i-dim">${m.source === 'key' ? 'Secuencia desconocida. La guarda un jefe o un lugar escondido.' : `Secuencia desconocida. Se completa con fragmentos de ADN de tipo ${FRAGMENTS[LINES[m.line].frag]?.name ?? ''}.`}</p>
        <p class="i-pairs">${pairs}</p>`;
      return;
    }
    // ADN recogido pero sin asimilar: no sabes qué te hará hasta que el útero lo injerte.
    if (s === 'latent') {
      this.info.innerHTML = `<b class="i-name" style="color:#a08a9a">ADN LATENTE</b><span class="i-tag">${tag}</span>
        <p class="i-dim">Una secuencia que aún no forma parte de ti. No sabrás qué te hace hasta que el útero la injerte.</p>
        <p class="i-cost"><span class="c-int">-${cost.integrity} integridad</span> <span class="c-rej">+${cost.rejection} rechazo</span> <span class="c-rej">carga +${m.load ?? 1}</span></p>
        <p class="i-dim">${st.canInstall(f) ? 'Asimílala en el útero de un Nodo Seguro.' : `Aún no puedes asimilarla: antes necesitas ${st.missing(f).map(dnaTag).join(' y ')}.`}</p>
        <p class="i-pairs">${pairs}</p>`;
      return;
    }
    this.info.innerHTML = `
      <b class="i-name" style="color:${m.color}">${m.name}</b><span class="i-tag">ACTIVA · ${tag}</span>
      <p class="i-fx">▶ ${m.desc}</p>
      <p class="i-dw">✕ ${m.drawback}</p>
      ${WEAPONS.includes(f) ? `<p class="i-dim">${st.weaponId === f ? 'EMPUÑADA' : 'Intro: empuñar'}</p>` : ''}<p class="i-lore">«${m.lore}»</p>
      <p class="i-pairs">${pairs}</p>`;
  }

  // Ficha de una constante vital, bajo las vejigas: qué es, cuánto tienes, qué la
  // gasta y qué la repone. Sin constante señalada, recuerda que se pueden señalar.
  #renderVital(id) {
    const st = this.game.state;
    if (!id) {
      this.vinfo.innerHTML = '<p class="i-dim">Señala una vejiga.</p>';
      return;
    }
    const [, , color, name] = VITALS.find(([v]) => v === id);
    const n = (v) => Math.floor(v);
    const [amount, what, cost, refill] = {
      int: [`${Math.ceil(st.integrity)} / ${st.maxIntegrity}`,
        'Tu tejido. Vacía, mueres.',
        st.corrupted ? `Mutar ha necrosado ${n(st.corrupted)} del máximo.` : 'Cada mutación necrosa parte del máximo.',
        'Tejido sano · Nodo.'],
      bio: [`${n(st.biomass)} / ${st.biomassMax}`,
        'Munición del simbionte y pago del útero.',
        'Algunas mutaciones la devoran.',
        'Restos de las criaturas.'],
      o2: [`${n(st.oxygen)} / ${st.oxygenMax}`,
        'Aire para los esfuerzos.',
        'Embestida 25 · doble salto 18 · pared 8.',
        'Sola al descansar · Nodo.'],
      lux: [`${n(st.light)} / 100`,
        'Revela lo oculto y fija tu arma en lo que alumbras.',
        'Encendido gasta 1/s.',
        'Células lumínicas · Nodo.'],
      rej: [`${n(st.rejection)} %`,
        'Tu cuerpo rechaza los injertos.',
        `+${(st.rejectionPerSecond * 60).toFixed(1)}/min (carga ${st.load}/${st.capacity}${st.discord ? `, choques ${st.discord}` : ''}). Al 100 % fallan y te dañan.`,
        'Supresor · extensores del útero · Timo.'],
    }[id];
    this.vinfo.innerHTML = `
      <b class="i-name" style="color:${color}">${name} <span class="i-amount">${amount}</span></b>
      <p class="i-fx">${what}</p>
      <p class="i-dw">✕ ${cost}</p>
      <p class="i-up">▶ ${refill}</p>`;
  }

  #animate = (ms) => {
    const st = this.game.state, t = ms / 1000;
    // Espécimen: tu cuerpo; la mutación señalada late en blanco. Lo latente no se proyecta.
    this.body ??= new PlayerBody();
    const f = MUTATIONS[this.focus] ? this.focus : null;
    const active = f && st.mutations.has(f);
    this.body.render(st.mutations, { t, dt: 1 / 60, vx: 0, vy: 0, onGround: true }, {
      highlight: active ? f : null,
    });
    this.ctx.clearRect(0, 0, BODY_W, BODY_H);
    this.ctx.drawImage(this.body.canvas, 0, 0);
    // Hueso, arriba a la derecha: el icono del fémur y cuánto te queda.
    this.scrap.clearRect(0, 0, 26, 10);
    drawBoneIcon(this.scrap, 1, 3, t);
    drawNumber(this.scrap, 12, 3, st.scrap, st.scrap === 0 ? '#ff5a5a' : '#e8dcc8');
    // Constantes vitales: las mismas vejigas que el HUD, con su número debajo.
    const g = this.vitals;
    g.clearRect(0, 0, 104, 46);
    const vit = [
      [st.integrity / 100, st.infection > 0 ? '#6a9a30' : '#c0283a', Math.ceil(st.integrity), st.corrupted / 100],
      [st.biomass / st.biomassMax, '#e07a98', Math.floor(st.biomass), 0],
      [st.oxygen / 100, '#4ab8f0', Math.floor(st.oxygen), 1 - st.oxygenMax / 100],
      [st.light / 100, '#ffd23f', Math.floor(st.light), 0],
      [Math.min(1, st.rejection / 100), st.critical ? '#ff4a8a' : '#a040d8', Math.floor(st.rejection), 0],
    ];
    vit.forEach(([level, color, value, scab], i) => {
      const x = 4 + i * 20;
      drawBladder(g, x, 3, 13, 28, level, color, { t, seed: i + 1, scab, low: level < 0.2 && i < 4 });
      drawNumber(g, x + (value < 10 ? 4 : value < 100 ? 2 : 0), 36, value, color);
    });
    this.raf = requestAnimationFrame(this.#animate);
  };
}
