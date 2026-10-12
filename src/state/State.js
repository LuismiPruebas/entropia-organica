import { MUTATIONS, LINES, FRAGMENTS, SYNERGIES, CLASHES, linesOf } from '../data/mutations.js';

export const FRAGMENTS_PER_SEQUENCE = 3;

// Gestor de Estado Global: la "hoja de personaje". El resto del juego solo le
// dice qué ha pasado (damage, spendBiomass...) y él aplica las reglas.

const BASE_MAX_INTEGRITY = 100;
// El oxígeno es el aliento de los movimientos especiales: se gasta al usarlos y
// se recupera solo cuando dejas de hacer esfuerzos.
// Economía del Nodo Seguro.
export const NODE_DOSES = 4;      // curas que guarda cada útero
export const NODE_REGEN = 75;     // segundos de juego para regenerar una
export const NODE_HEAL = 15;      // integridad por cura

export const OXYGEN_COST = { doubleJump: 18, dash: 25, wallKick: 8 };
const OXYGEN_REGEN = 6;        // por segundo (base, mejorable con mutaciones)
const OXYGEN_REGEN_DELAY = 0.9; // segundos de descanso antes de recuperar
export const LIGHT_DRAIN = 1.5;       // por segundo con el ojo encendido (era 1.0: las células ahora se acumulan en reserva)
export const CELL_CHARGE = 100; // luz que devuelve cada célula lumínica de la reserva
// Consumibles raros: se guardan y se usan cuando quieras (1 / 2, R3 / L3, botón táctil).
// Apenas los sueltan las criaturas (los jefes, siempre uno); el útero los vende caros.
export const ITEMS = {
  shield: { name: 'Perla de Nácar', time: 6, price: { bio: 70 } }, // invulnerable
  regen: { name: 'Célula Madre', time: 8, price: { bio: 60 } },    // regenera integridad
};
export const REGEN_RATE = 5;          // integridad por segundo con la Célula Madre
export const ITEM_DROP_CHANCE = 0.02; // por criatura abatida (ni crías ni esbirros)
const REJECTION_GROWTH = 0.03; // por segundo y por punto de carga genética
const OVERLOAD_GROWTH = 0.08;  // por segundo y por punto de carga por encima de tu tolerancia
const DISCORD_GROWTH = 0.05;   // por segundo y por nivel de choque entre órganos
const HARMONY_RELIEF = 0.03;   // lo que resta cada sinergia activa
// Carga genética: lo que tu cuerpo aguanta sin que el rechazo se dispare. Cada
// extensor la amplía. Ser el mutante perfecto exige muchos extensores.
export const CAPACITY_BASE = 8;
export const CAPACITY_PER_EXTENDER = 1;
// Extensores del útero: cada vez más caros (biomasa). Los Timos Necróticos dan uno.
export const EXTENDER_PRICES = [30, 45, 65, 90, 120, 155, 195, 240, 290, 345, 405, 470, 540, 615];
// Armas del cañón, en orden de su línea.
export const WEAPONS = ['astillas', 'simbionte', 'escopeta'];
const REJECTION_CRITICAL = 100;
const HUNGER_FLOOR = 10;          // el hambre de las mutaciones no baja tu biomasa de aquí
const REJECTION_ESCALATION = 0.15; // cada mutación instalada encarece un 15% el rechazo de la siguiente

export class GameState {
  constructor() {
    this.listeners = {};
    this.reset();
  }

  reset() {
    this.integrity = BASE_MAX_INTEGRITY;
    this.corrupted = 0;
    this.biomass = 30;
    this.biomassBase = 100;
    this.oxygen = 100;
    this.oxygenRest = 0;
    this.infection = 0;          // segundos restantes del estado alterado 'infección'
    this.light = 100;
    this.rejection = 0;
    this.tolerance = 1;          // multiplica el ritmo de rechazo
    this.extenders = 0;          // extensores de tolerancia (amplían la carga genética)
    this.extendersBought = 0;    // los comprados en el útero (fijan el precio del siguiente)
    this.weapon = null;          // arma del cañón elegida (WEAPONS); null = culata
    this.scrap = 12;
    this.cells = 0;              // células lumínicas en reserva: se gastan solas al apagarse el ojo
    this.items = { shield: 0, regen: 0 }; // consumibles guardados (ITEMS)
    this.timers = { shield: 0, regen: 0 }; // segundos que le quedan a cada efecto activo
    this.flashlightOn = true;
    this.mutations = new Set();   // instaladas
    this.dna = new Set();         // muestras recogidas sin instalar
    this.collected = new Set();   // pickups del mapa ya recogidos
    this.broken = new Set();      // membranas rotas "sala:x,y"
    this.revealedWalls = new Set(); // paredes falsas que la luz ya delató "sala:x,y"
    this.visited = new Set();     // salas visitadas (para el mapa)
    this.mapRevealed = new Set(); // salas grabadas en el mapa al derrotar a un jefe
    this.fragments = {};          // fragmentos de ADN por tipo de órgano (FRAGMENTS)
    this.bosses = new Set();      // jefes derrotados (no reaparecen nunca)
    this.flags = new Set();       // efectos permanentes de los jefes ('sporesCleared'...)
    this.lore = [];               // memorias recuperadas [título, texto]
    this.slain = new Set();       // enemigos muertos "sala:índice": no vuelven hasta descansar
    this.nodules = new Set();     // nódulos óseos reventados "sala:x,y": vuelven a crecer al descansar
    this.nodeRes = {};            // reserva de curas de cada Nodo: { sala: { n, t } }
    this.checkpoint = null;
    this.dead = false;
    this.stats = { kills: 0, shots: 0, missed: 0, deaths: 0 };
    // Herramientas de desarrollo (menú F9).
    this.dev = { god: false, freezeRejection: false };
  }

  on(evt, fn) { (this.listeners[evt] ??= []).push(fn); }
  emit(evt, data) { for (const fn of this.listeners[evt] ?? []) fn(data); }

  get maxIntegrity() { return BASE_MAX_INTEGRITY - this.corrupted; }
  get biomassMax() { return Math.round(this.biomassBase * this.mod('biomassCap')); }
  get oxygenMax() { return Math.round(100 * this.mod('oxygenCap')); }
  // Arma que dispara el gatillo: la elegida si sigue instalada; si no, la mejor.
  get weaponId() {
    const owned = this.weapons;
    return owned.includes(this.weapon) ? this.weapon : owned[owned.length - 1] ?? null;
  }
  get weapons() { return WEAPONS.filter((id) => this.mutations.has(id)); }
  // Cambia a la siguiente arma instalada (tecla R / gatillo R2 / Genoma).
  cycleWeapon(to) {
    const owned = this.weapons;
    if (!owned.length) return null;
    this.weapon = to && owned.includes(to) ? to : owned[(owned.indexOf(this.weaponId) + 1) % owned.length];
    return this.weapon;
  }

  // --- Líneas de órganos -----------------------------------------------------
  // Nivel de una línea: el más alto de sus mutaciones instaladas (las fusiones
  // cuentan en sus dos líneas).
  lineLevel(line) {
    let lv = 0;
    for (const id of this.mutations) if (linesOf(MUTATIONS[id]).includes(line)) lv = Math.max(lv, MUTATIONS[id].level ?? 1);
    return lv;
  }
  // Sinergias activas (ambas líneas a nivel I o más) y choques (k = nivel común).
  get synergies() { return SYNERGIES.filter((p) => p.lines.every((l) => this.lineLevel(l) > 0)); }
  get clashes() {
    return CLASHES.map((p) => ({ ...p, k: Math.min(...p.lines.map((l) => this.lineLevel(l))) })).filter((p) => p.k > 0);
  }
  // Carga genética que ocupan las mutaciones y la que tu cuerpo tolera.
  get load() { let n = 0; for (const id of this.mutations) n += MUTATIONS[id].load ?? 1; return n; }
  get capacity() { return CAPACITY_BASE + CAPACITY_PER_EXTENDER * this.extenders; }
  get overload() { return Math.max(0, this.load - this.capacity); }
  get discord() { return this.clashes.reduce((n, c) => n + c.k, 0); }
  // Ritmo al que tu cuerpo rechaza el tejido ajeno: crece con la carga, se dispara
  // por encima de tu tolerancia y con los órganos que se estorban; las sinergias lo calman.
  get rejectionPerSecond() {
    if (!this.mutations.size) return 0;
    const r = REJECTION_GROWTH * this.load + OVERLOAD_GROWTH * this.overload + DISCORD_GROWTH * this.discord - HARMONY_RELIEF * this.synergies.length;
    return Math.max(0.01, r) * this.tolerance;
  }
  // ¿Se puede terminar el juego? Todas las líneas a nivel I (lo exige el Corazón).
  get complete() { return Object.keys(LINES).every((l) => this.lineLevel(l) > 0); }
  get critical() { return this.rejection >= REJECTION_CRITICAL; }

  has(ability) {
    for (const id of this.mutations) {
      const m = MUTATIONS[id];
      if (m.ability === ability || m.abilities?.includes(ability)) return true;
    }
    return false;
  }

  immune(hazard) {
    for (const id of this.mutations) if (MUTATIONS[id].immunities?.includes(hazard)) return true;
    return false;
  }

  mod(name) {
    let m = 1;
    for (const id of this.mutations) m *= MUTATIONS[id].mods?.[name] ?? 1;
    for (const p of this.synergies) m *= p.mods[name] ?? 1;
    for (const p of this.clashes) m *= (p.mods[name] ?? 1) ** p.k;
    return m;
  }

  // Con el rechazo al máximo, las mutaciones fallan a veces.
  abilityWorks(ability) {
    if (this.critical && Math.random() < 0.35) {
      this.emit('mutationFail', ability);
      return false;
    }
    return true;
  }

  damage(n, cause) {
    if (this.dead || n <= 0 || this.dev.god || this.timers.shield > 0) return;
    this.integrity = Math.max(0, this.integrity - n);
    this.emit('damage', { n, cause });
    if (this.integrity <= 0) {
      this.dead = true;
      this.stats.deaths++;
      this.emit('death', cause);
    }
  }

  // Estados alterados: la Dermis Nanocutánea los anula.
  applyStatus(kind, seconds) {
    if (this.immune('status') || this.timers.shield > 0) return false;
    if (kind === 'infection') this.infection = Math.max(this.infection, seconds);
    return true;
  }

  heal(n) { this.integrity = Math.min(this.maxIntegrity, this.integrity + n); }

  // Consumible: lo gasta y arranca su efecto. No se pisa con uno igual aún activo.
  useItem(kind) {
    if (this.dead || !this.items[kind] || this.timers[kind] > 0) return false;
    this.items[kind]--;
    this.timers[kind] = ITEMS[kind].time;
    if (kind === 'shield') this.infection = 0;
    return true;
  }

  buyItem(kind) {
    if (!this.pay(ITEMS[kind].price)) return false;
    this.items[kind]++;
    return true;
  }
  addBiomass(n) { this.biomass = Math.min(this.biomassMax, this.biomass + n); }

  // Gasta aliento para un movimiento especial; si no llega, el movimiento no sale.
  useOxygen(n) {
    if (this.dev.god) return true;
    if (this.oxygen < n) {
      this.emit('outOfBreath');
      return false;
    }
    this.oxygen -= n;
    this.oxygenRest = OXYGEN_REGEN_DELAY;
    return true;
  }

  spendBiomass(n) {
    if (this.dev.god) return true;
    if (this.biomass < n) return false;
    this.biomass -= n;
    return true;
  }

  tick(dt, { inNode }) {
    if (this.dead) return;
    this.oxygenRest -= dt;
    if (inNode) {
      this.oxygen = Math.min(this.oxygenMax, this.oxygen + 25 * dt);
    } else if (this.oxygenRest <= 0) {
      this.oxygen = Math.min(this.oxygenMax, this.oxygen + OXYGEN_REGEN * this.mod('oxygenRegen') * dt);
    }
    // Consumibles activos: la Célula Madre te va cerrando las heridas.
    if (this.timers.regen > 0) this.heal(REGEN_RATE * dt);
    for (const k in this.timers) this.timers[k] = Math.max(0, this.timers[k] - dt);
    if (this.flashlightOn) {
      this.light = Math.max(0, this.light - LIGHT_DRAIN * this.mod('lightDrain') * dt);
      if (this.light <= 0) { this.flashlightOn = false; this.eyeStarved = true; }
    }
    // Ojo sin luz y células en reserva: se gasta una y el ojo se recarga entero.
    if (this.light <= 0 && this.cells > 0) {
      this.cells--;
      this.light = CELL_CHARGE;
      this.emit('cellUsed', this.cells);
    }
    if (!this.flashlightOn && this.eyeStarved && this.light > 0) {
      // Se apagó por quedarse sin luz: en cuanto recibe energía (célula, Nodo,
      // muerte...) se vuelve a encender solo. Si lo apagaste tú, sigue apagado.
      this.flashlightOn = true;
      this.eyeStarved = false;
    }
    // Mutaciones con hambre (el Cañón Simbionte) devoran biomasa continuamente
    // (más si el cerebro y el cañón se disputan la carne).
    const hungerK = this.mod('hunger');
    for (const id of this.mutations) {
      const hunger = (MUTATIONS[id].hunger ?? 0) * hungerK;
      if (hunger && this.biomass > HUNGER_FLOOR) this.biomass = Math.max(HUNGER_FLOOR, this.biomass - hunger * dt);
    }
    if (!this.dev.freezeRejection) this.rejection = Math.min(120, this.rejection + this.rejectionPerSecond * dt);
    if (this.dev.god) {
      this.oxygen = this.oxygenMax;
      this.light = 100;
      this.biomass = this.biomassMax;
      this.scrap = Math.max(this.scrap, 99);
      this.infection = 0;
    }

    if (this.critical) this.damage(0.8 * dt, 'rechazo');
    if (this.infection > 0) {
      this.infection -= dt;
      this.damage(2.5 * dt, 'infección');
    }
  }

  // --- Acciones del Nodo Seguro ---
  // Un fragmento de ADN de un órgano (neural, ocular, dérmico, óseo). Cada 3 se
  // completa la siguiente secuencia de su línea (la de nivel más bajo que aún no
  // tengas); si la línea ya está completa, el tejido sobrante amplía tu biomasa.
  addFragment(kind) {
    if (!FRAGMENTS[kind]) kind = 'neural';
    this.fragments[kind] = (this.fragments[kind] ?? 0) + 1;
    if (this.fragments[kind] < FRAGMENTS_PER_SEQUENCE) {
      this.emit('fragment', { kind, count: this.fragments[kind] });
      return;
    }
    this.fragments[kind] -= FRAGMENTS_PER_SEQUENCE;
    const line = FRAGMENTS[kind].line;
    const next = Object.entries(MUTATIONS)
      .filter(([id, m]) => m.source === 'fragment' && linesOf(m).includes(line) && !this.mutations.has(id) && !this.dna.has(id))
      .sort((a, b) => a[1].level - b[1].level)[0]?.[0];
    if (next) {
      this.dna.add(next);
      this.emit('sequence', next);
    } else {
      this.biomassBase += 5;
      this.emit('sequenceSpare', kind);
    }
  }

  // Extensores de tolerancia: amplían la carga genética que aguantas.
  get extenderPrice() {
    return { bio: EXTENDER_PRICES[Math.min(EXTENDER_PRICES.length - 1, this.extendersBought)] };
  }
  buyExtender() {
    if (!this.pay(this.extenderPrice)) return false;
    this.extendersBought++;
    this.extenders++;
    return true;
  }

  // Lo que costaría asimilar una mutación ahora: el cuerpo saturado rechaza más.
  // Si además te pasa de tu tolerancia, el injerto entra con más violencia.
  installCost(id) {
    const m = MUTATIONS[id];
    const over = Math.max(0, this.load + (m.load ?? 1) - this.capacity);
    const scale = 1 + REJECTION_ESCALATION * this.mutations.size + 0.25 * over;
    return { integrity: m.integrityCost, rejection: Math.round(m.rejection * scale), overload: over };
  }

  // Lo que le falta para poder asimilarse (mutaciones previas sin instalar).
  missing(id) { return (MUTATIONS[id]?.requires ?? []).filter((r) => !this.mutations.has(r)); }

  // ¿Se puede asimilar ya? Exige las mutaciones previas de su línea (o de las dos, en una fusión).
  canInstall(id) {
    const m = MUTATIONS[id];
    return !!m && this.dna.has(id) && this.missing(id).length === 0;
  }

  install(id) {
    const m = MUTATIONS[id];
    if (!this.canInstall(id)) return false;
    const cost = this.installCost(id);
    this.dna.delete(id);
    this.mutations.add(id);
    this.corrupted += cost.integrity;
    this.integrity = Math.min(this.integrity, this.maxIntegrity);
    this.biomass = Math.min(this.biomass, this.biomassMax);
    this.oxygen = Math.min(this.oxygen, this.oxygenMax);
    this.rejection = Math.min(120, this.rejection + cost.rejection);
    if (WEAPONS.includes(id)) this.weapon = id; // el arma nueva, a mano
    this.emit('mutated', id);
    return true;
  }

  // Precios del útero: { bio } o { scrap } (cada Nodo cobra distinto, data/nodes.js).
  canPay(price) {
    return (price.bio ?? 0) <= this.biomass && (price.scrap ?? 0) <= this.scrap;
  }

  pay(price) {
    if (!this.canPay(price)) return false;
    if (price.bio) this.spendBiomass(price.bio);
    if (price.scrap) this.scrap -= price.scrap;
    return true;
  }

  craftSuppressor(price) {
    if (this.rejection <= 0 || !this.pay(price)) return false;
    this.rejection = Math.max(0, this.rejection - 35);
    return true;
  }

  // Reserva de nutrientes del útero de cada Nodo: NODE_DOSES curas que se regeneran
  // solas, una cada NODE_REGEN segundos de juego. Curar ya no es una fuente infinita.
  nodeReserve(key, now) {
    const r = (this.nodeRes[key] ??= { n: NODE_DOSES, t: now });
    while (r.n < NODE_DOSES && now - r.t >= NODE_REGEN) { r.n++; r.t += NODE_REGEN; }
    if (r.n >= NODE_DOSES) r.t = now;
    return { doses: r.n, next: r.n < NODE_DOSES ? Math.ceil(NODE_REGEN - (now - r.t)) : 0 };
  }

  healAtNode(key, now, price) {
    const r = this.nodeReserve(key, now);
    if (r.doses <= 0 || this.integrity >= this.maxIntegrity || !this.pay(price)) return false;
    this.heal(NODE_HEAL);
    const res = this.nodeRes[key];
    if (res.n === NODE_DOSES) res.t = now;
    res.n--;
    return true;
  }

  // El ojo se recarga con lo que el útero digiere (hueso o carne, según el Nodo).
  buyLight(price) {
    if (this.light >= 100 || !this.pay(price)) return false;
    this.light = Math.min(100, this.light + 35);
    return true;
  }

  // El útero digiere un recurso y devuelve el otro.
  tradeAtNode({ give, get }) {
    if (get.bio && this.biomass >= this.biomassMax) return false;
    if (!this.pay(give)) return false;
    if (get.bio) this.biomass = Math.min(this.biomassMax, this.biomass + get.bio);
    if (get.scrap) this.scrap += get.scrap;
    return true;
  }

  // Descansar en un Nodo (o morir) deja que la carne del mundo vuelva a crecer.
  rest() {
    this.slain.clear();
    this.nodules.clear();
  }

  respawn() {
    this.dead = false;
    this.timers = { shield: 0, regen: 0 };
    this.rest();
    this.integrity = Math.ceil(this.maxIntegrity * 0.5);
    this.oxygen = this.oxygenMax;
    this.infection = 0;
    this.biomass = Math.floor(this.biomass / 2);
    this.light = Math.max(this.light, 25);
    this.flashlightOn = true;
    this.eyeStarved = false;
  }
}
