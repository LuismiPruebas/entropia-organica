import { MUTATIONS, LINES, ROMAN, FRAGMENTS } from '../data/mutations.js';
import { LEVELS, START, WORLDS, WORLD_ID, setWorld } from '../data/levels.js';
import { roomConnections, connectionArrival } from '../data/connections.js';
import { BIOMES } from '../data/biomes.js';
import { PICKUPS } from '../entities/Pickup.js';
import { MenuNav } from './MenuNav.js';

// Menú de desarrollo (F9 o º): probar mutaciones, objetos y estados sin jugar
// hasta ellos. Pon DEV_TOOLS a false para quitarlo de una versión pública.
export const DEV_TOOLS = true;

const ITEMS = [
  ['biomass', 'Biomasa +8'], ['scrap', 'Hueso +3'], ['battery', 'Célula lumínica'],
  ['oxygen', 'Filtro O2'], ['cyst', 'Quiste'], ['tissue', 'Tejido sano'], ['plasma', 'Coágulo de plasma'], ['suppress', 'Supresor'], ['cavity', 'Divertículo (cavidad)'], ['extender', 'Extensor de tolerancia'], ['thymus', 'Timo Necrótico'],
  ['shield', 'Perla de Nácar'], ['regen', 'Célula Madre'],
];

// Punto de entrada de cada sala: el spawn de cualquier salida que lleve a ella.
function roomSpawns() {
  const spawns = { [START.room]: START.spawn };
  for (const lv of Object.values(LEVELS)) {
    for (const c of roomConnections(lv)) spawns[c.to] ??= connectionArrival(LEVELS, c);
  }
  return spawns;
}

export class DevMenu {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('dev-menu');
    this.open = false;
    this.chargeCosts = false;
    this.el.addEventListener('click', (e) => this.#onClick(e));
    this.nav = new MenuNav(this.el, 'button', { isOpen: () => this.open });
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (['F9', 'Backquote', 'Escape'].includes(e.code)) {
        e.preventDefault();
        this.close();
      }
    });
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.open = false;
    this.el.hidden = true;
    this.game.closeNode();
  }

  #toggleMutation(id) {
    const st = this.game.state, m = MUTATIONS[id];
    if (st.mutations.has(id)) {
      st.mutations.delete(id);
      if (this.chargeCosts) st.corrupted = Math.max(0, st.corrupted - m.integrityCost);
    } else {
      const cost = st.installCost(id);
      st.dna.delete(id);
      st.mutations.add(id);
      if (this.chargeCosts) {
        st.corrupted += cost.integrity;
        st.rejection = Math.min(120, st.rejection + cost.rejection);
      }
    }
    // Ajusta los recursos a los nuevos máximos.
    st.integrity = Math.min(st.integrity, st.maxIntegrity);
    st.biomass = Math.min(st.biomass, st.biomassMax);
    st.oxygen = Math.min(st.oxygen, st.oxygenMax);
  }

  #onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const g = this.game, st = g.state, [action, arg] = b.dataset.act.split(':');
    switch (action) {
      case 'mut': this.#toggleMutation(arg); break;
      case 'allmut': for (const id of Object.keys(MUTATIONS)) if (!st.mutations.has(id)) this.#toggleMutation(id); break;
      case 'nomut': for (const id of [...st.mutations]) this.#toggleMutation(id); break;
      case 'costs': this.chargeCosts = !this.chargeCosts; break;
      case 'god': st.dev.god = !st.dev.god; break;
      case 'freeze': st.dev.freezeRejection = !st.dev.freezeRejection; break;
      case 'item': PICKUPS[arg].apply(st, { amount: 8 }); break;
      case 'frag': st.addFragment(arg); break;
      case 'ext': st.extenders++; break;
      case 'bosses': st.bosses.clear(); st.flags.clear(); break;
      case 'rej': st.rejection = Number(arg); break;
      case 'heal':
        st.integrity = st.maxIntegrity;
        st.oxygen = st.oxygenMax;
        st.light = 100;
        st.biomass = st.biomassMax;
        st.infection = 0;
        break;
      case 'resetbody':
        st.corrupted = 0;
        st.thymus = 0;
        st.extenders = 0;
        st.extendersBought = 0;
        st.biomassBase = 100;
        st.integrity = st.maxIntegrity;
        break;
      case 'world':
        // Cambia el mapa activo (también el del editor) y vuelve a empezar en él.
        if (arg !== WORLD_ID && confirm(`¿Cambiar al mapa «${WORLDS[arg].name}»? Se reinicia la partida.`)) { setWorld(arg); location.href = location.pathname + '?play'; }
        return;
      case 'room': {
        const spawns = roomSpawns();
        g.loadRoom(arg, spawns[arg] ?? [1, 1]);
        break;
      }
    }
    g.audio.play('flicker');
    this.render();
  }

  render() {
    const st = this.game.state;
    const on = (v) => (v ? 'on' : '');
    const btn = (act, label, active = false) => `<button data-act="${act}" class="${on(active)}">${label}</button>`;

    const muts = Object.entries(MUTATIONS).map(([id, m]) =>
      btn(`mut:${id}`, `${LINES[m.line].name} ${ROMAN[m.level]} · ${m.name}`, st.mutations.has(id))).join('');
    const items = ITEMS.map(([k, label]) => btn(`item:${k}`, label)).join('');
    // Salas agrupadas por bioma, con el color de su mapa.
    const byBiome = {};
    for (const [id, lv] of Object.entries(LEVELS)) (byBiome[lv.biome] ??= []).push([id, lv]);
    const rooms = Object.entries(byBiome).map(([b, list]) =>
      `<h4 style="color:${BIOMES[b]?.mapColor ?? '#ccc'};margin:6px 0 2px">${BIOMES[b]?.name ?? b}</h4>` +
      list.map(([id, lv]) => btn(`room:${id}`, `${id} · ${lv.name}${lv.secret ? ' (secreta)' : ''}`, this.game.room?.id === id)).join('')).join('');

    this.el.innerHTML = `
      <h2>MODO DESARROLLO <span>[F9] / [º] / [ESC] cerrar</span></h2>
      <div class="dev-stats">
        INT ${Math.ceil(st.integrity)}/${st.maxIntegrity} · BIO ${Math.floor(st.biomass)}/${st.biomassMax} ·
        O2 ${Math.floor(st.oxygen)}/${st.oxygenMax} · LUZ ${Math.floor(st.light)} · HUESO ${st.scrap} ·
        RECHAZO ${Math.floor(st.rejection)}% (+${(st.rejectionPerSecond * 60).toFixed(1)}/min) ·
        CARGA ${st.load}/${st.capacity} (${st.extenders} ext) · CHOQUES ${st.discord} · SINERGIAS ${st.synergies.length}
      </div>
      <section><h3>Estado</h3>
        ${btn('god', 'Modo dios', st.dev.god)}
        ${btn('freeze', 'Congelar rechazo', st.dev.freezeRejection)}
        ${btn('costs', 'Cobrar costes al mutar', this.chargeCosts)}
        ${btn('heal', 'Rellenar todo')}
        ${btn('resetbody', 'Cuerpo limpio (sin corrupción ni timos)')}
      </section>
      <section><h3>Rechazo</h3>
        ${[0, 50, 80, 100, 120].map((v) => btn(`rej:${v}`, `${v}%`)).join('')}
      </section>
      <section><h3>Mutaciones (clic para activar / desactivar)</h3>
        ${muts}
        ${btn('allmut', 'Todas')}${btn('nomut', 'Ninguna')}
      </section>
      <section><h3>Objetos (se aplican al instante, también los acumulativos)</h3>${items}</section>
      <section><h3>Fragmentos de ADN</h3>
        ${Object.entries(FRAGMENTS).map(([k, fr]) => btn(`frag:${k}`, `+1 ${fr.name} (${st.fragments[k] ?? 0}/3)`)).join('')}
        ${btn('ext', `+1 extensor (${st.extenders})`)}
        ${btn('bosses', `Revivir jefes (${st.bosses.size} derrotados)`)}
      </section>
      <section><h3>Mapa</h3>${Object.entries(WORLDS).map(([id, w]) => btn(`world:${id}`, w.name, id === WORLD_ID)).join("")}</section>
      <section><h3>Viajar a sala</h3>${rooms}</section>`;
    this.nav.restore();
  }
}
