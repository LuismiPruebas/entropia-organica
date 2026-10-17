import { MUTATIONS, LINES, ROMAN, linesOf } from '../data/mutations.js';
import { NODE_REGEN, CAPACITY_PER_EXTENDER, ITEMS, CELL_PRICE, NODE_CELLS, CELL_STORE_FROM, CELL_AUTO_BELOW, SUPPRESS_CUT, SUPPRESS_TIME } from '../state/State.js';
import { LEVELS } from '../data/levels.js';
import { dnaTag } from '../entities/Pickup.js';
import { nodeOf } from '../data/nodes.js';
import { MenuNav } from './MenuNav.js';
import { px, seg, part, blob } from '../entities/Rig.js';
import { ICONS as ORGANS } from './Genome.js';
import { drawBoneIcon, drawCellIcon } from './Bladders.js';

// Menú del Nodo Seguro: curar (con la reserva limitada del útero), comprar células lumínicas,
// fabricar supresores, comprar extensores de tolerancia, instalar mutaciones y, con
// el Tercer Ojo, viajar a otro Nodo ya visitado. Flechas + Intro/Espacio, teclas 1..n o clic.
// Cada opción lleva su icono animado en pixel art (ICON): el de sanar muestra las curas
// que le quedan al útero (un bulbo por cura: lleno, gastado o regenerándose).

const S = 18; // lado de los iconos

// El primer motivo por el que una opción está apagada, en gris.
const why = (...reasons) => { const r = reasons.find(Boolean); return r ? ` · <span class="dim">${r}</span>` : ''; };

// Precio en su color: { bio } o { scrap }. sign '+' para lo que recibes.
const price = (p, sign = '') => [p.bio && `<span class="c-bio">${sign}${p.bio} biomasa</span>`, p.scrap && `<span class="c-scrap">${sign}${p.scrap} hueso</span>`].filter(Boolean).join(' + ');
const K = '#140c10';

// Viaje entre úteros (Tercer Ojo): lo que cuesta y adónde se puede ir.
const TRAVEL = { light: 25, bio: 10 };
function travelTargets(st, here) {
  const out = [];
  for (const [id, lv] of Object.entries(LEVELS)) {
    if (id === here || !st.visited.has(id)) continue;
    lv.grid.forEach((row, y) => { const x = row.indexOf('N'); if (x >= 0) out.push([id, [x, y]]); });
  }
  return out;
}

// Venas de la membrana del menú (viewBox 250x120, se estira al tamaño del panel).
const VEINS = [
  'M0,6 C40,0 80,14 130,5 S210,12 250,4',
  'M0,116 C60,120 110,108 160,116 S220,110 250,117',
  'M4,0 C0,30 9,60 3,90 S7,110 4,120',
  'M246,0 C250,35 240,70 247,95 S243,112 246,120',
];

// Tipos de opción: cada uno destaca con su color, y explica qué hace en
// el panel de abajo al señalarlo (ratón, flechas o mando). Las mutaciones toman el
// color de su órgano.
const CATS = {
  heal: { c: '#ff5a6a', info: 'El útero guarda pocas curas; se regeneran con el tiempo.' },
  cell: { c: '#ffd23f', info: `Al ${CELL_STORE_FROM} % o más, además se guarda; las guardadas se gastan solas bajo el ${CELL_AUTO_BELOW} %.` },
  suppressor: { c: '#c07bff', info: 'Calma tus injertos un rato. Con el rechazo alto las mutaciones fallan; al 100 % te dañan.' },
  extender: { c: '#b48cff', info: 'Llevas más mutaciones sin que el rechazo se dispare. Cada uno cuesta más.' },
  trade: { c: '#c8b8a0', info: 'El útero digiere un recurso y te devuelve el otro.' },
  shield: { c: '#4ff0ff', info: 'Se guarda; úsala cuando quieras desde el Genoma.' },
  regen: { c: '#7dff9a', info: 'Se guarda; úsala cuando quieras desde el Genoma.' },
  travel: { c: '#d0a8ff', info: 'El nervio del organismo te lleva a otro útero que ya conoces.' },
};
const HINT = 'Señala una opción para saber qué hace.';

// ---------------------------------------------------------------- iconos (18x18)
const ICON = {
  // Tejido que late, cosido; debajo, las curas del útero.
  heal(g, t, o) {
    const beat = (t * 1.1) % 1 < 0.12 ? 1 : 0;
    part(g, 9, 6.5, 5.5 + beat * 0.5, 4.6 + beat * 0.4, '#c0283a', '#6a1020', '#ff9aa8');
    for (const x of [6, 9, 12]) { px(g, x, 4, '#2a0810'); px(g, x, 8, '#2a0810'); px(g, x, 5, '#f0d8c8', 1, 3); }
    const { doses, total, fill } = o;
    const w = Math.min(4, 16 / total);
    for (let i = 0; i < total; i++) {
      const cx = 9 + (i - (total - 1) / 2) * w, full = i < doses, grow = !full && i === doses && fill > 0;
      const r = full ? 1.7 : grow ? 0.8 + fill : 1;
      blob(g, cx, 14.5, r + 0.6, r + 0.6, '#140c10');
      blob(g, cx, 14.5, r, r, full ? '#ff5a6a' : grow ? '#a02838' : '#3a1820');
    }
  },
  // Vial de supresor: cristal con líquido violeta que burbujea y su aguja.
  suppressor(g, t) {
    seg(g, 4, 14, 12, 4, '#140c10', 6);
    seg(g, 4, 14, 12, 4, '#3a3048', 4);
    seg(g, 5, 13, 9, 8, '#c07bff', 3);
    const k = Math.floor((t * 6) % 3);
    px(g, 6 + k, 11 - k, '#f0d8ff');
    seg(g, 12, 4, 15, 1, '#e8dcc8', 1);
    px(g, 3, 15, '#7a6a8a', 3, 2);
  },
  // Extensor: una vértebra violeta que crece, con un "+".
  extender(g, t) {
    const k = 1 + Math.sin(t * 2.4) * 0.06;
    part(g, 9, 9, 6.5 * k, 4.5 * k, '#7a4aa0', '#3a1a50', '#d0a8ff');
    blob(g, 9, 9, 2, 2, '#1a0c24');
    for (const d of [-1, 1]) { seg(g, 9 + d * 6, 6, 9 + d * 8, 3, '#140c10', 3); seg(g, 9 + d * 6, 6, 9 + d * 8, 3, '#b08ad0', 1); }
    px(g, 13, 12, '#7dff9a', 3, 1); px(g, 14, 11, '#7dff9a', 1, 3);
  },
  // Trueque: hueso que se vuelve carne (digerir) o carne que se calcifica.
  trade(g, t, o) {
    const flesh = (x, y) => part(g, x, y, 2.6, 2.6, '#e07a98', '#6a1a34', '#ffd0dc');
    const k = (t * 1.5) % 1;
    if (o.toBio) { drawBoneIcon(g, 1, 3, t); flesh(13, 13); } else { flesh(4, 5); drawBoneIcon(g, 6, 12, t); }
    for (let i = 0; i < 3; i++) px(g, 7 + i * 1.5 + k * 1.5, 8 + i * 1.5 + k * 1.5, i === 2 ? '#e8dcc8' : '#8a6a5a');
  },
  // ADN latente: el órgano de la mutación, en el color de su línea, y una hélice.
  dna(g, t, o) {
    const m = MUTATIONS[o.id];
    ORGANS[o.id]?.(g, LINES[m.line].color);
    const ph = t * 3;
    for (let y = 0; y < 18; y += 2) { px(g, 16 + Math.round(Math.sin(ph + y * 0.6)), y, '#7dff9a'); px(g, 16 - Math.round(Math.sin(ph + y * 0.6)), y, '#c07bff'); }
  },
  // Célula lumínica: la pila de la reserva y, al lado, las que le quedan al útero.
  cell(g, t, o) {
    g.save(); g.scale(2, 2); drawCellIcon(g, 1, 1, t, o.left > 0); g.restore();
    for (let i = 0; i < o.total; i++) blob(g, 14, 4 + i * 5, 1.8, 1.8, i < o.left ? '#ffd23f' : '#3a3020');
  },
  // Perla de Nácar: una perla irisada con el brillo que gira.
  shield(g, t) {
    blob(g, 9, 9, 6.5, 6.5, '#140c10');
    blob(g, 9, 9, 5.5, 5.5, '#a8e8f0');
    blob(g, 10, 10, 3.5, 3.5, '#e8fcff');
    const a = t * 2.5;
    px(g, 9 + Math.cos(a) * 3.5, 9 + Math.sin(a) * 3.5, '#4ff0ff', 2, 2);
    px(g, 6, 6, '#ffffff');
  },
  // Célula Madre: una célula verde que late, con el núcleo en cruz.
  regen(g, t) {
    const k = 1 + Math.sin(t * 4) * 0.08;
    part(g, 9, 9, 6.5 * k, 6.5 * k, '#3ac060', '#14501e', '#9affb0');
    px(g, 8, 5, '#f0fff0', 2, 8); px(g, 5, 8, '#f0fff0', 8, 2);
  },
  // Viaje: un remolino de carne con el Tercer Ojo en medio.
  travel(g, t) {
    for (let i = 0; i < 26; i++) { const a = i * 0.5 + t * 2, r = 1.5 + i * 0.27; px(g, 9 + Math.cos(a) * r, 9 + Math.sin(a) * r * 0.85, i % 3 ? '#8a4ad0' : '#d0a8ff'); }
    blob(g, 9, 9, 2.6, 1.8, '#140c10'); blob(g, 9, 9, 1.8, 1.2, '#ffd25a'); px(g, 9, 9, '#140c10');
  },
};

export class NodeMenu {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('node-menu');
    this.open = false;
    this.nav = new MenuNav(this.el, 'button', { isOpen: () => this.open, onSelect: (b) => { game.audio.play('flicker'); this.#showInfo(b); } });
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape' || e.code === 'KeyE') this.close();
      const n = Number(e.key);
      if (n >= 1) this.el.querySelectorAll('button')[n - 1]?.click();
    });
  }

  show() {
    this.open = true;
    this.openedAt = performance.now();
    this.el.hidden = false;
    this.nav.index = 0;
    this.render();
    const loop = (ms) => {
      if (!this.open) return;
      this.#drawIcons(ms / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    this.open = false;
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
    this.game.closeNode();
  }

  render() {
    const g = this.game, st = g.state, key = g.room.id;
    const node = nodeOf(key); // cada útero ofrece y cobra distinto (data/nodes.js y la sala)
    const res = st.nodeReserve(key, g.time, node.doses);
    // Cada opción: en su ficha, solo nombre y coste (con el motivo si no se puede); lo
    // que hace (effect + la explicación de su tipo) va al panel de abajo al señalarla.
    const options = [
      {
        icon: ['heal', { doses: res.doses, total: node.doses, fill: res.next ? 1 - res.next / NODE_REGEN : 0 }],
        label: 'Sanar tejido',
        effect: `<span class="c-int">+${node.cure} integridad</span>${res.next ? ` <span class="dim">(otra cura en ${res.next}s)</span>` : ''}`,
        cost: `${price(node.heal)}${why(!res.doses && 'útero vacío', st.integrity >= st.maxIntegrity && 'integridad al máximo', !st.canPay(node.heal) && 'no te alcanza')}`,
        enabled: res.doses > 0 && st.canPay(node.heal) && st.integrity < st.maxIntegrity,
        run: () => { if (st.healAtNode(key, g.time, node.heal, node.cure, node.doses)) g.audio.play('womb'); },
      },
      // Células lumínicas: como al encontrarlas, siempre recargan el ojo y, si ya estaba
      // a CELL_STORE_FROM o más, además se guardan. Cada útero solo cría unas pocas.
      {
        icon: ['cell', { left: st.nodeCellsLeft(key), total: NODE_CELLS }],
        label: `Célula lumínica ${st.nodeCellsLeft(key)}/${NODE_CELLS}`,
        effect: `<span class="c-lux">recarga el ojo${st.light >= CELL_STORE_FROM ? ` y se guarda (llevas ${st.cells})` : ''}</span>`,
        cost: `${price(CELL_PRICE)}${why(st.nodeCellsLeft(key) <= 0 && 'este útero ya no cría más', !st.canPay(CELL_PRICE) && 'no te alcanza')}`,
        enabled: st.nodeCellsLeft(key) > 0 && st.canPay(CELL_PRICE),
        run: () => {
          const r = st.buyCell(key);
          if (!r) return;
          g.audio.play('reveal');
          g.say(r === 'used' ? 'Tu ojo devora la célula y vuelve a brillar.' : `Tu ojo vuelve a brillar y guardas la célula: llevas ${st.cells} en reserva.`, 2);
        },
      },
      node.suppressor && {
        icon: ['suppressor'],
        label: 'Supresor de rechazo',
        effect: `<span class="c-rej">-${SUPPRESS_CUT} rechazo y no sube en ${SUPPRESS_TIME / 60} min</span> <span class="dim">(ahora ${Math.floor(st.rejection)} %)</span>`,
        cost: `${price(node.suppressor)}${why(st.rejection <= 0 && 'sin rechazo', !st.canPay(node.suppressor) && 'no te alcanza')}`,
        enabled: st.canPay(node.suppressor) && st.rejection > 0,
        run: () => { if (st.craftSuppressor(node.suppressor)) { g.audio.play('womb'); g.say(`El supresor adormece tus injertos: el rechazo no subirá en ${SUPPRESS_TIME / 60} minutos.`, 3); } },
      },
      {
        icon: ['extender'],
        label: 'Extensor de tolerancia',
        effect: `<span class="c-rej">+${CAPACITY_PER_EXTENDER} carga genética</span> <span class="dim">(ahora ${st.load}/${st.capacity})</span>`,
        cost: `${price(st.extenderPrice)}${why(!st.canPay(st.extenderPrice) && 'no te alcanza')}`,
        enabled: st.canPay(st.extenderPrice),
        run: () => { if (st.buyExtender()) { g.audio.play('mutate'); g.say('El útero te injerta un extensor: tu cuerpo tolera más carga genética.', 3); } },
      },
      node.trade && {
        icon: ['trade', { toBio: !!node.trade.get.bio }],
        label: node.trade.get.bio ? 'Digerir hueso' : 'Calcificar carne',
        effect: '',
        cost: `${price(node.trade.give)} → ${price(node.trade.get, '+')}${why(node.trade.get.bio && st.biomass >= st.biomassMax && 'biomasa al máximo', !st.canPay(node.trade.give) && 'no te alcanza')}`,
        enabled: st.canPay(node.trade.give) && !(node.trade.get.bio && st.biomass >= st.biomassMax),
        run: () => { if (st.tradeAtNode(node.trade)) g.audio.play('womb'); },
      },
      // Consumibles raros: el útero los cría, pero cuestan mucha carne.
      ...Object.entries(ITEMS).map(([kind, it]) => ({
        icon: [kind],
        label: `${it.name} ×${st.items[kind]}`,
        effect: kind === 'shield' ? `<span class="c-o2">invulnerable ${it.time} s</span>` : `<span class="c-int">regeneras ${it.time} s</span>`,
        cost: `${price(it.price)}${why(it.price.bio > st.biomassMax && 'amplía tu reserva', !st.canPay(it.price) && 'no te alcanza')}`,
        enabled: st.canPay(it.price),
        run: () => { if (st.buyItem(kind)) { g.audio.play('womb'); g.say(`El útero cría una ${it.name}. Úsala ${g.itemKey(kind)}.`, 2.5); } },
      })),
      ...[...st.dna].map((id) => {
        const m = MUTATIONS[id];
        const ready = st.canInstall(id);
        const cost = st.installCost(id);
        const tag = linesOf(m).map((l) => LINES[l].name).join(' + ');
        return {
          icon: ['dna', { id }],
          label: `${m.name} <span class="nm-line">${tag} ${ROMAN[m.level]}</span>`,
          cost: ready
            ? `<span class="c-int">-${cost.integrity} integridad máx</span> · <span class="c-rej">+${cost.rejection} rechazo</span>${cost.overload ? ` · <span class="c-rej">supera tu tolerancia</span>` : ''}`
            : `<span class="dim">antes necesitas ${st.missing(id).map(dnaTag).join(' y ')}</span>`,
          effect: cost.overload ? `<span class="c-rej">supera tu tolerancia (${st.load + (m.load ?? 1)}/${st.capacity}): el rechazo subirá más deprisa</span>` : '',
          enabled: ready,
          mutation: true,
          cat: { c: LINES[m.line].color, info: m.brief ?? m.desc },
          run: () => { st.install(id); g.audio.play('mutate'); },
        };
      }),
      // Tercer Ojo: el organismo te escupe en otro útero que ya conozcas.
      ...(st.has('eye3') ? travelTargets(st, key).map(([room, spawn]) => ({
        icon: ['travel'],
        label: `Viajar: ${nodeOf(room).name}`,
        cost: `<span class="c-lux">-${TRAVEL.light} luz</span> · ${price({ bio: TRAVEL.bio })}${why(st.light < TRAVEL.light && 'sin luz', !st.canPay({ bio: TRAVEL.bio }) && 'no te alcanza')}`,
        enabled: st.light >= TRAVEL.light && st.canPay({ bio: TRAVEL.bio }),
        run: () => {
          if (!st.pay({ bio: TRAVEL.bio })) return;
          st.light -= TRAVEL.light;
          this.close();
          g.audio.play('womb');
          st.checkpoint = { room, spawn };
          g.loadRoom(room, spawn);
          g.say(`El útero te escupe en ${nodeOf(room).name}.`, 3);
        },
      })) : []),
    ].filter(Boolean);

    this.el.innerHTML = `
      <svg class="nm-veins" viewBox="0 0 250 120" preserveAspectRatio="none">
        ${VEINS.map((d) => `<path class="vein" d="${d}"/><path class="pulse" d="${d}"/>`).join('')}
      </svg>
      <div class="nm-body">
        <span class="nm-close" title="Cerrar">✕</span>
        <h2>NODO SEGURO <span class="nm-name">${node.name}</span></h2>
        <div class="nm-res"><span class="c-int">INT ${Math.ceil(st.integrity)}/${st.maxIntegrity}</span> <span class="c-bio">BIO ${Math.floor(st.biomass)}</span> <span class="c-lux">LUZ ${Math.floor(st.light)}</span> <span class="c-scrap">HUESO ${st.scrap}</span></div>
        <div class="nm-scroll"><div class="nm-list"></div><div class="nm-bar" hidden><i></i></div></div>
        <div class="nm-info"></div>
      </div>`;
    const list = this.el.querySelector('.nm-list');
    this.icons = [];
    // Se cierra con la misma tecla que lo abre (E, △/Y, USAR), con Esc o con la aspa.
    this.el.querySelector('.nm-close').addEventListener('click', () => this.close());
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.disabled = !o.enabled;
      if (o.mutation) b.classList.add('mut');
      // Cada tipo destaca a su manera: su color en la franja, el fondo, el título y el
      // brillo del icono. Al señalarla, el panel de abajo explica qué hace.
      const cat = o.cat ?? CATS[o.icon?.[0]] ?? { c: '#e8dcc8', info: '' };
      b.style.setProperty('--c', cat.c);
      b.style.setProperty('--tint', `${cat.c}26`);
      b.dataset.info = cat.info;
      b.dataset.title = o.label;
      b.dataset.effect = o.effect ?? '';
      b.innerHTML = `<canvas class="nm-icon" width="${S}" height="${S}"></canvas><span class="nm-label">${i + 1}. ${o.label}</span><span class="desc">${o.cost}</span>`;
      // Con el ratón, la selección sigue al cursor: marco y panel siempre coinciden.
      b.addEventListener('mouseenter', () => { if (!b.classList.contains('nav-sel')) this.nav.select(b); });
      if (o.icon) this.icons.push({ g: b.querySelector('canvas').getContext('2d'), kind: o.icon[0], opts: o.icon[1] ?? {} });
      b.addEventListener('click', () => {
        // Un clic justo al abrirse viene del gesto que lo abrió (un toque en USAR): se ignora.
        if (performance.now() - this.openedAt < 350) return;
        o.run();
        if (this.open) this.render();
      });
      list.appendChild(b);
    });
    this.nav.restore();
    this.#showInfo(list.querySelector('.nav-sel'));
    this.#scrollBar(list);
    this.#drawIcons(performance.now() / 1000);
  }

  // Barra vertical de la lista: solo aparece si no cabe todo, sigue al desplazamiento
  // (rueda, flechas, dedo) y su asa se puede arrastrar.
  #scrollBar(list) {
    const bar = this.el.querySelector('.nm-bar'), thumb = bar.firstElementChild;
    const update = () => {
      const { scrollHeight: sh, clientHeight: ch, scrollTop: top } = list;
      bar.hidden = sh <= ch + 1;
      if (bar.hidden) return;
      const h = Math.max(12, (ch / sh) * bar.clientHeight);
      thumb.style.height = `${h}px`;
      thumb.style.top = `${(top / (sh - ch)) * (bar.clientHeight - h)}px`;
    };
    list.addEventListener('scroll', update, { passive: true });
    thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const y0 = e.clientY, top0 = list.scrollTop;
      // La escala del escenario (transform) cambia los píxeles de pantalla por píxel lógico.
      const scale = bar.getBoundingClientRect().height / bar.clientHeight || 1;
      const move = (ev) => {
        const free = bar.clientHeight - thumb.offsetHeight;
        list.scrollTop = top0 + ((ev.clientY - y0) / scale / free) * (list.scrollHeight - list.clientHeight);
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
    update();
  }

  // Panel de abajo: qué hace la opción señalada. Lleva su nombre en su color (y la
  // misma franja), para que se vea a qué opción pertenece.
  #showInfo(b) {
    const box = this.el.querySelector('.nm-info');
    if (!box) return;
    box.style.setProperty('--c', b?.style.getPropertyValue('--c') || '#6a5a5a');
    if (!b) { box.textContent = HINT; return; }
    box.innerHTML = `<b class="nm-info-t">${b.dataset.title}</b>${b.dataset.effect ? ` ${b.dataset.effect}` : ''}<br>${b.dataset.info}`;
  }

  #drawIcons(t) {
    for (const ic of this.icons ?? []) {
      ic.g.clearRect(0, 0, S, S);
      ICON[ic.kind]?.(ic.g, t, ic.opts);
    }
  }
}
