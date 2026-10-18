import { MUTATIONS, LINES, FRAGMENTS, SYNERGIES, CLASHES, linesOf } from '../data/mutations.js';
import { LEVELS } from '../data/levels.js';
import { ENEMIES } from '../data/enemies.js';

// Fragmentos que pide cada nivel de una línea: el primero se encuentra pronto,
// mejorarlo cuesta un poco más. Con la línea completa, el sobrante va de 3 en 3.
export const FRAGMENTS_BY_LEVEL = { 1: 3, 2: 4, 3: 5 };
export const FRAGMENTS_SPARE = 3;

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
// Una célula recogida o comprada siempre recarga el ojo al 100 %; si ya estaba a esto o
// más (%), además se guarda en la reserva.
export const CELL_STORE_FROM = 80;
// Las células de la reserva se gastan solas cuando la luz baja de esto (%).
export const CELL_AUTO_BELOW = 50;
// Consumibles raros: se guardan y se usan desde el Genoma.
// Apenas los sueltan las criaturas (los jefes, siempre uno); el útero los vende caros.
export const ITEMS = {
  shield: { name: 'Perla de Nácar', time: 10, price: { bio: 130 } }, // invulnerable
  regen: { name: 'Célula Madre', time: 10, price: { bio: 130 } },   // regenera integridad
};
// Coágulo de plasma: cura al momento al cogerlo (solo se encuentra; el útero no lo vende).
export const PLASMA = { name: 'Coágulo de plasma', heal: 30 };
// Infección: te pudre al menos 10 s (poco daño, pero arcadas que te dejan vendido; ver
// Player). La anula la Dermis Nanocutánea; la curan el útero, el Tejido sano, la Célula
// Madre y la Perla de Nácar.
export const INFECTION = { time: 10, dps: 1.2 };
export const REGEN_RATE = 5;          // integridad por segundo con la Célula Madre
export const ITEM_DROP_CHANCE = 0.02; // por criatura abatida (ni crías ni esbirros)
// Células lumínicas a la venta en cada útero: pocas, y no vuelven a crecer.
export const NODE_CELLS = 2;
export const CELL_PRICE = { bio: 15, scrap: 4 };
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
// Desde la Dermis II (placas de quitina) el antebrazo es también un arma cuerpo a cuerpo:
// se elige con R / R2 como un cañón más. Con la Dermis III su combo es de tres tajos y avanza.
export const BLADE = {
  id: 'cuchilla', name: 'Cuchilla de Quitina',
  controls: 'El antebrazo es una hoja de placas. Clic / R1: combo de tajos (Dermis II: dos; Dermis III: tres avanzando, el último pesado). [R] / R2 vuelve al cañón.',
};
const REJECTION_CRITICAL = 100;
// Rechazo gradual: por debajo de failFrom (40 %, más con los timos) no pasa nada; desde ahí las
// mutaciones fallan cada vez más (hasta REJECTION_FAIL_MAX al 100 %); al 100 % además
// el cuerpo se daña. Tramos de aviso (mensajes y señales en el cuerpo): 40, 70, 100.
export const REJECTION_FAIL_FROM = 40; // sin timos (ver countThymus)
const REJECTION_FAIL_MAX = 0.35;
// Timos Necróticos: tu sistema inmune olvida pelear. Cada uno es un paso permanente de
// tolerancia y los pasos se reparten según cuántos haya en el mundo (mapa, sacos y lo
// que sueltan los jefes): pongas los que pongas, el rechazo se frena poco a poco hasta
// un 70 % y los fallos se retrasan hasta 28 puntos con el penúltimo; el último lo anula
// por completo (ni sube, ni falla, ni daña).
const THYMUS_RATE_CUT = 0.7;   // cuánto se frena el rechazo con el penúltimo timo
const THYMUS_FAIL_DELAY = 28;  // cuántos puntos se retrasan los fallos con el penúltimo
export function countThymus() {
  let n = 0;
  for (const r of Object.values(LEVELS)) {
    for (const row of r.grid) for (const c of row) if (c === 'g') n++;
    for (const s of r.sacs ?? []) if (s.item === 'g') n++;
  }
  for (const e of Object.values(ENEMIES)) n += (e.drop?.items ?? []).filter((k) => k === 'thymus').length;
  return Math.max(1, n);
}
export const REJECTION_TIERS = [40, 70, 100];
// Supresor del útero: resta rechazo de golpe y lo frena un buen rato (no sube).
export const SUPPRESS_CUT = 35;
export const SUPPRESS_TIME = 120; // segundos
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
    this.thymus = 0;             // Timos Necróticos asimilados
    this.thymusMax = countThymus(); // cuántos hay en el mundo: el último anula el rechazo
    this.extenders = 0;          // extensores de tolerancia (amplían la carga genética)
    this.extendersBought = 0;    // los comprados en el útero (fijan el precio del siguiente)
    this.weapon = null;          // arma del cañón elegida (WEAPONS); null = culata
    this.scrap = 12;
    this.cells = 0;              // células lumínicas en reserva: se gastan solas bajo CELL_AUTO_BELOW
    this.items = { shield: 0, regen: 0 }; // consumibles guardados (ITEMS)
    this.timers = { shield: 0, regen: 0, suppress: 0 }; // segundos que le quedan a cada efecto activo
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
    this.nodeCells = {};          // células lumínicas que ya has comprado en cada Nodo: { sala: n }
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
  get weapons() { return [...WEAPONS.filter((id) => this.mutations.has(id)), ...(this.lineLevel('dermis') >= 2 ? [BLADE.id] : [])]; }
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
  // Pasos de tolerancia de los timos: cuánto se frena el rechazo y desde dónde falla.
  // Fracción del camino recorrido hasta el penúltimo timo (0 sin timos, 1 con el penúltimo).
  get thymusK() { return Math.min(1, this.thymus / Math.max(1, this.thymusMax - 1)); }
  get tolerance() { return this.immuneRejection ? 0 : 1 - THYMUS_RATE_CUT * this.thymusK; }
  get failFrom() { return Math.round(REJECTION_FAIL_FROM + THYMUS_FAIL_DELAY * this.thymusK); }
  get immuneRejection() { return this.thymus >= this.thymusMax; }
  // ¿Se puede terminar el juego? Todas las líneas a nivel I (lo exige el Corazón).
  get complete() { return Object.keys(LINES).every((l) => this.lineLevel(l) > 0); }
  get critical() { return !this.immuneRejection && this.rejection >= REJECTION_CRITICAL; }

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

  // Probabilidad de que una mutación no responda: crece del 0 (al 40 %) al 35 % (al 100 %).
  get failChance() {
    if (this.immuneRejection) return 0;
    const k = (this.rejection - this.failFrom) / (REJECTION_CRITICAL - this.failFrom);
    return Math.max(0, Math.min(1, k)) * REJECTION_FAIL_MAX;
  }

  // Tramo de rechazo (0 sano, 1 inflamado, 2 rechazo, 3 crisis), para los avisos.
  get rejectionTier() { return this.immuneRejection ? 0 : [this.failFrom, 70, 100].filter((t) => this.rejection >= t).length; }

  // Con el rechazo alto, las mutaciones fallan a veces (cada vez más).
  abilityWorks(ability) {
    if (Math.random() < this.failChance) {
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

  // Un Timo Necrótico: un paso más de tolerancia (el tercero anula el rechazo).
  // Devuelve cuántos llevas. Con los tres, los que encuentres de más no hacen nada.
  addThymus() {
    if (this.thymus >= this.thymusMax) return this.thymus;
    this.thymus++;
    if (this.immuneRejection) this.rejection = 0;
    return this.thymus;
  }

  // Consumible: lo gasta y arranca su efecto. No se pisa con uno igual aún activo.
  useItem(kind) {
    if (this.dead || !this.items[kind] || this.timers[kind] > 0) return false;
    this.items[kind]--;
    this.timers[kind] = ITEMS[kind].time;
    if (kind === 'shield' || kind === 'regen') this.infection = 0;
    return true;
  }

  // Células que le quedan a la venta a un útero.
  nodeCellsLeft(key) { return NODE_CELLS - (this.nodeCells[key] ?? 0); }

  // Compra una célula: actúa igual que encontrarla. Devuelve false, 'stored' o 'used'.
  buyCell(key) {
    if (this.nodeCellsLeft(key) <= 0 || !this.pay(CELL_PRICE)) return false;
    this.nodeCells[key] = (this.nodeCells[key] ?? 0) + 1;
    return this.gainCell() ? 'stored' : 'used';
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
    // La luz baja de CELL_AUTO_BELOW y hay células en reserva: se gasta una y el ojo se recarga.
    if (this.light < CELL_AUTO_BELOW && this.cells > 0) {
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
    // Con un Supresor reciente el rechazo no sube (timers.suppress).
    if (!this.dev.freezeRejection && !(this.timers.suppress > 0)) this.rejection = Math.min(120, this.rejection + this.rejectionPerSecond * dt);
    // Al cruzar un tramo hacia arriba, el cuerpo avisa (Game muestra el mensaje).
    const tier = this.rejectionTier;
    if (tier > (this.lastTier ?? 0)) this.emit('rejectionTier', tier);
    this.lastTier = tier;
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
      this.damage(INFECTION.dps * dt, 'infección');
    }
  }

  // --- Acciones del Nodo Seguro ---
  // Fragmentos de ADN de un órgano (neural, ocular, dérmico, óseo). Al reunir los que
  // pide el nivel (FRAGMENTS_BY_LEVEL: 3, 4, 5) se completa la siguiente secuencia de
  // su línea (la de nivel más bajo que aún no tengas); si la línea ya está completa,
  // cada 3 de tejido sobrante amplían tu biomasa.
  nextSequence(kind) {
    const line = FRAGMENTS[kind].line;
    return Object.entries(MUTATIONS)
      .filter(([id, m]) => m.source === 'fragment' && linesOf(m).includes(line) && !this.mutations.has(id) && !this.dna.has(id))
      .sort((a, b) => a[1].level - b[1].level)[0]?.[0] ?? null;
  }

  fragmentsNeeded(kind) {
    const next = this.nextSequence(kind);
    return next ? FRAGMENTS_BY_LEVEL[MUTATIONS[next].level] ?? FRAGMENTS_SPARE : FRAGMENTS_SPARE;
  }

  addFragment(kind) {
    if (!FRAGMENTS[kind]) kind = 'neural';
    this.fragments[kind] = (this.fragments[kind] ?? 0) + 1;
    const need = this.fragmentsNeeded(kind);
    if (this.fragments[kind] < need) {
      this.emit('fragment', { kind, count: this.fragments[kind], need });
      return;
    }
    this.fragments[kind] -= need;
    const next = this.nextSequence(kind);
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
    return { integrity: m.integrityCost, rejection: this.immuneRejection ? 0 : Math.round(m.rejection * scale), overload: over };
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
    this.rejection = Math.max(0, this.rejection - SUPPRESS_CUT);
    this.timers.suppress = SUPPRESS_TIME;
    return true;
  }

  // Reserva de nutrientes del útero de cada Nodo: NODE_DOSES curas que se regeneran
  // solas, una cada NODE_REGEN segundos de juego. Curar ya no es una fuente infinita.
  // Cada útero puede tener su propio tope de curas (max) y lo que cura cada una (amount).
  nodeReserve(key, now, max = NODE_DOSES) {
    const r = (this.nodeRes[key] ??= { n: max, t: now });
    if (r.n > max) r.n = max;                             // si se bajó el tope en el editor
    while (r.n < max && now - r.t >= NODE_REGEN) { r.n++; r.t += NODE_REGEN; }
    if (r.n >= max) r.t = now;
    return { doses: r.n, next: r.n < max ? Math.ceil(NODE_REGEN - (now - r.t)) : 0 };
  }

  healAtNode(key, now, price, amount = NODE_HEAL, max = NODE_DOSES) {
    const r = this.nodeReserve(key, now, max);
    if (r.doses <= 0 || (this.integrity >= this.maxIntegrity && this.infection <= 0) || !this.pay(price)) return false;
    this.heal(amount);
    this.infection = 0;                                  // el útero limpia la infección
    const res = this.nodeRes[key];
    if (res.n === max) res.t = now;
    res.n--;
    return true;
  }

  // Una célula lumínica nueva (encontrada o comprada): siempre deja el ojo al 100 %; si
  // ya estaba a CELL_STORE_FROM o más, además se guarda. Devuelve true si se guardó.
  gainCell() {
    const store = this.light >= CELL_STORE_FROM;
    if (store) this.cells++;
    this.light = Math.min(100, this.light + CELL_CHARGE);
    // Una célula enciende el ojo aunque lo hubieras apagado (si no, parecía no hacer nada).
    this.flashlightOn = true;
    this.eyeStarved = false;
    return store;
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
    this.timers = { shield: 0, regen: 0, suppress: this.timers.suppress }; // el supresor sigue actuando
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
