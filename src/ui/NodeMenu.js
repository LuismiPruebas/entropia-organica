import { MUTATIONS, LINES, ROMAN, linesOf } from '../data/mutations.js';
import { NODE_DOSES, NODE_HEAL, NODE_REGEN, CAPACITY_PER_EXTENDER } from '../state/State.js';
import { LEVELS } from '../data/levels.js';
import { dnaTag } from '../entities/Pickup.js';
import { nodeOf } from '../data/nodes.js';
import { MenuNav } from './MenuNav.js';
import { px } from '../entities/Rig.js';

// Menú del Nodo Seguro: curar (con la reserva limitada del útero), recargar el ojo,
// fabricar supresores, comprar extensores de tolerancia, instalar mutaciones y, con
// el Tercer Ojo, viajar a otro Nodo ya visitado. Flechas + Intro/Espacio, teclas 1..n o clic.
// A la izquierda late el útero: un bulbo por cura (lleno, gastado o regenerándose).

const W = 56, H = 72; // lienzo del útero

// El primer motivo por el que una opción está apagada, en gris.
const why = (...reasons) => { const r = reasons.find(Boolean); return r ? ` · <span class="dim">${r}</span>` : ''; };

// Precio en su color: { bio } o { scrap }. sign '+' para lo que recibes.
const price = (p, sign = '') => (p.bio ? `<span class="c-bio">${sign}${p.bio} biomasa</span>` : `<span class="c-scrap">${sign}${p.scrap} hueso</span>`);
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

export class NodeMenu {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('node-menu');
    this.open = false;
    this.nav = new MenuNav(this.el, 'button', { isOpen: () => this.open, onSelect: () => game.audio.play('flicker') });
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape' || e.code === 'KeyE') this.close();
      const n = Number(e.key);
      if (n >= 1) this.el.querySelectorAll('button')[n - 1]?.click();
    });
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.nav.index = 0;
    this.render();
    const loop = (ms) => {
      if (!this.open) return;
      this.#drawWomb(ms / 1000);
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
    const res = st.nodeReserve(key, g.time);
    const node = nodeOf(key); // cada útero ofrece y cobra distinto (data/nodes.js)
    const options = [
      {
        label: 'Sanar tejido',
        desc: `<span class="c-int">+${NODE_HEAL} integridad</span> · ${price(node.heal)}${why(!res.doses && 'útero vacío', st.integrity >= st.maxIntegrity && 'integridad al máximo', !st.canPay(node.heal) && 'no te alcanza')}${res.next ? ` <span class="dim">(+1 en ${res.next}s)</span>` : ''}`,
        enabled: res.doses > 0 && st.canPay(node.heal) && st.integrity < st.maxIntegrity,
        run: () => { if (st.healAtNode(key, g.time, node.heal)) g.audio.play('womb'); },
      },
      node.light && {
        label: 'Recargar el ojo',
        desc: `<span class="c-lux">+35 luz</span> · ${price(node.light)}${why(st.light >= 100 && 'luz al máximo', !st.canPay(node.light) && 'no te alcanza')}`,
        enabled: st.canPay(node.light) && st.light < 100,
        run: () => { if (st.buyLight(node.light)) g.audio.play('reveal'); },
      },
      node.suppressor && {
        label: 'Supresor de rechazo',
        desc: `<span class="c-rej">-35 rechazo</span> · ${price(node.suppressor)}${why(st.rejection <= 0 && 'sin rechazo', !st.canPay(node.suppressor) && 'no te alcanza')}`,
        enabled: st.canPay(node.suppressor) && st.rejection > 0,
        run: () => { if (st.craftSuppressor(node.suppressor)) g.audio.play('womb'); },
      },
      {
        label: 'Extensor de tolerancia',
        desc: `<span class="c-rej">+${CAPACITY_PER_EXTENDER} carga genética</span> (${st.load}/${st.capacity}) · ${price(st.extenderPrice)}${why(!st.canPay(st.extenderPrice) && 'no te alcanza')}`,
        enabled: st.canPay(st.extenderPrice),
        run: () => { if (st.buyExtender()) { g.audio.play('mutate'); g.say('El útero te injerta un extensor: tu cuerpo tolera más carga genética.', 3); } },
      },
      node.trade && {
        label: node.trade.get.bio ? 'Digerir hueso' : 'Calcificar carne',
        desc: `${price(node.trade.give)} → ${price(node.trade.get, '+')}${why(node.trade.get.bio && st.biomass >= st.biomassMax && 'biomasa al máximo', !st.canPay(node.trade.give) && 'no te alcanza')}`,
        enabled: st.canPay(node.trade.give) && !(node.trade.get.bio && st.biomass >= st.biomassMax),
        run: () => { if (st.tradeAtNode(node.trade)) g.audio.play('womb'); },
      },
      ...[...st.dna].map((id) => {
        const m = MUTATIONS[id];
        const ready = st.canInstall(id);
        const cost = st.installCost(id);
        const tag = linesOf(m).map((l) => LINES[l].name).join(' + ');
        return {
          label: `Asimilar ADN latente · ${tag} ${ROMAN[m.level]}`,
          desc: ready
            ? `<span class="c-int">-${cost.integrity} integridad máx</span> · <span class="c-rej">+${cost.rejection} rechazo</span>${cost.overload ? ` · <span class="c-rej">supera tu tolerancia (${st.load + (m.load ?? 1)}/${st.capacity})</span>` : ''}`
            : `Aún no: antes necesitas ${st.missing(id).map(dnaTag).join(' y ')}`,
          enabled: ready,
          mutation: true,
          run: () => { st.install(id); g.audio.play('mutate'); },
        };
      }),
      // Tercer Ojo: el organismo te escupe en otro útero que ya conozcas.
      ...(st.has('eye3') ? travelTargets(st, key).map(([room, spawn]) => ({
        label: `Viajar: ${nodeOf(room).name}`,
        desc: `<span class="c-lux">-${TRAVEL.light} luz</span> · ${price({ bio: TRAVEL.bio })}${why(st.light < TRAVEL.light && 'sin luz', !st.canPay({ bio: TRAVEL.bio }) && 'no te alcanza')}`,
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
      { label: 'Salir', desc: '', enabled: true, run: () => this.close() },
    ].filter(Boolean);

    this.el.innerHTML = `
      <svg class="nm-veins" viewBox="0 0 250 120" preserveAspectRatio="none">
        ${VEINS.map((d) => `<path class="vein" d="${d}"/><path class="pulse" d="${d}"/>`).join('')}
      </svg>
      <div class="nm-womb"><canvas width="${W}" height="${H}"></canvas></div>
      <div class="nm-body">
        <h2>NODO SEGURO <span class="nm-name">${node.name}</span></h2>
        <div class="nm-res"><span class="c-int">INT ${Math.ceil(st.integrity)}/${st.maxIntegrity}</span> <span class="c-bio">BIO ${Math.floor(st.biomass)}</span> <span class="c-lux">LUZ ${Math.floor(st.light)}</span> <span class="c-scrap">HUESO ${st.scrap}</span></div>
        <div class="nm-list"></div>
      </div>`;
    this.canvas = this.el.querySelector('.nm-womb canvas').getContext('2d');
    const list = this.el.querySelector('.nm-list');
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.disabled = !o.enabled;
      if (o.mutation) b.classList.add('mut');
      b.innerHTML = `<i class="nucleus"></i>${i + 1}. ${o.label}${o.desc ? `<span class="desc">${o.desc}</span>` : ''}`;
      b.addEventListener('click', () => {
        o.run();
        if (this.open) this.render();
      });
      list.appendChild(b);
    });
    this.nav.restore();
    this.#drawWomb(performance.now() / 1000);
  }

  // El útero del nodo, en pixel art: una bolsa de carne que late, colgada de un cordón,
  // con líquido amniótico verde y un bulbo por cura dentro.
  #drawWomb(t) {
    const g = this.canvas, game = this.game;
    if (!g) return;
    const res = game.state.nodeReserve(game.room.id, game.time);
    const beatT = (t * 1.1) % 1;
    const beat = beatT < 0.12 ? 1 : 0;
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = 42, rx = 22 + beat, ry = 26 + beat;
    // Cordón y venas que la sujetan desde arriba.
    for (let y = 0; y < cy - ry + 3; y++) {
      const x = cx + Math.round(Math.sin(y * 0.5 + t * 2) * 1.2);
      px(g, x - 2, y, K, 5, 1);
      px(g, x - 1, y, y % 3 ? '#7a2a3a' : '#a03a4a', 3, 1);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) px(g, cx + s * (4 + i * 1.3), cy - ry + 4 - i * 0.9 + Math.sin(i) * 0.6, '#4a1424');
    // Pared del útero; dentro, líquido amniótico con su superficie ondulando.
    for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -rx - 1; x <= rx + 1; x++) {
      const wob = Math.sin(Math.atan2(y, x) * 5 + t * 1.5) * 0.04;
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry) + wob;
      if (d > 1.1) continue;
      let c;
      if (d > 0.98) c = K;
      else if (d > 0.72) c = (x * 3 + y * 7) % 9 ? '#7a2436' : '#902c40';
      else c = y > -ry * 0.55 + Math.sin(x * 0.4 + t * 2) * 1.5 ? ((x + y) % 4 ? '#163a24' : '#1a4429') : '#0e1c14';
      px(g, cx + x, cy + y, c);
    }
    // Venas de la pared que se encienden con el latido.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4;
      for (let i = 0; i < 4; i++) {
        const f = 0.95 - i * 0.07;
        px(g, cx + Math.cos(a + i * 0.08) * rx * f, cy + Math.sin(a + i * 0.08) * ry * f, beat ? '#e0506a' : '#b03850');
      }
    }
    // Bulbos de cura: los llenos brillan y laten, los gastados se arrugan y el
    // siguiente se va llenando mientras se regenera.
    const fill = res.next ? 1 - res.next / NODE_REGEN : 0;
    for (let i = 0; i < NODE_DOSES; i++) {
      const cols = Math.min(2, NODE_DOSES), rows = Math.ceil(NODE_DOSES / cols);
      const bx = cx + ((i % cols) - (cols - 1) / 2) * 14, by = cy + 4 + (Math.floor(i / cols) - (rows - 1) / 2) * 12 + Math.sin(t * 1.3 + i * 2) * 1.2;
      const full = i < res.doses, growing = !full && i === res.doses && res.next;
      const r = full ? 5 + beat * 0.6 : growing ? 2.5 + fill * 2.5 : 2.5;
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
        const d = Math.hypot(x / 0.85, y);
        if (d > r + 0.4) continue;
        let c;
        if (d > r - 0.7) c = K;
        else if (full) c = y < -r * 0.3 ? '#ff7a8a' : '#c0283a';
        else if (growing && y > r - 1 - fill * r * 2) c = '#a02838';
        else c = (x + y) % 2 ? '#3a1820' : '#2a1218';
        px(g, bx + x, by + y, c);
      }
      if (full) px(g, bx - 2, by - 2, '#ffd0d8');
    }
    // Burbujas que suben por el líquido.
    for (let i = 0; i < 4; i++) {
      const y = cy + ry - 4 - ((t * 8 + i * 9) % (ry * 1.2));
      px(g, cx - 12 + i * 8 + Math.sin(t * 2 + i) * 1.5, y, '#5ad88a');
    }
  }
}
