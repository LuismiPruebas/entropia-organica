import { Visual, VIEW_W, VIEW_H } from './core/Visual.js';
import { Input } from './core/Input.js';
import { Gamepad } from './core/Gamepad.js';
import { Touch } from './ui/Touch.js';
import { sweepGPU } from './core/Gpu.js';
import { Loop } from './core/Loop.js';
import { AudioSys } from './core/Audio.js';
import { Particles } from './core/Particles.js';
import { Gore } from './entities/Gore.js';
import { overlap, TILE } from './core/Physics.js';
import { GameState } from './state/State.js';
import { EntityFactory } from './factory/EntityFactory.js';
import { Player, GRAVITY } from './entities/Player.js';
import { Projectile } from './entities/Projectile.js';
import { Pickup, dnaTag } from './entities/Pickup.js';
import { Hud, caps, setCavityHelp } from './ui/Hud.js';
import { NodeMenu } from './ui/NodeMenu.js';
import { Genome } from './ui/Genome.js';
import { DevMenu, DEV_TOOLS } from './ui/DevMenu.js';
import { MapView } from './ui/MapView.js';
import { START } from './data/levels.js';
import { MUTATIONS, FRAGMENTS, LINES } from './data/mutations.js';
import { BIOMES } from './data/biomes.js';
import { LEVELS } from './data/levels.js';
import { ITEMS, INFECTION } from './state/State.js';
import { BINDINGS, keyName } from './core/Bindings.js';
import { BIRTH } from './entities/Womb.js';

// Entrada vacía (nada pulsado) para cuando el jugador no manda: el parto.
const NO_INPUT = (real) => ({
  down: () => false, hit: () => false, up: () => false, released: new Set(), pressed: new Set(), keys: new Set(),
  mouse: real.mouse, padAim: { x: 0, y: 0, active: false }, endStep: () => {},
});
import { linkArrival } from './entities/Link.js';

const CONE_HALF = Math.PI / 6;
// Alcance del haz del ojo: corto sin mutar; la línea del Ojo lo alarga (mod lightRange).
const LIGHT_RANGE = 145;
// Halo del ojo sin mutar (sin haz cónico): lo único que alumbra hasta el Ojo I.
const HALO_R = 52;
// Ácido con Placas de Quitina: daño por segundo al entrar, cuánto sube por segundo
// sumergido y su tope (sin quitina son 14/s).
const ABYSS_VX = 420; // velocidad lateral máxima del rebote del abismo
const ACID_ARMORED = 1, ACID_ARMORED_RAMP = 0.6, ACID_ARMORED_MAX = 5;
const TRANSITION = 0.4;

const angleDiff = (a, b) => {
  let d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

// Color del haz lejos del ojo según la energía lumínica (0..1):
// rojo agónico -> ámbar -> blanco amarillento.
// Luz del ojo según su energía: roja y escasa al agotarse; llena, casi blanca (cálida pero
// neutra) para que la carne conserve su color al alumbrarla.
const BEAM_STOPS = [[0, [1, 0.22, 0.12]], [0.35, [1, 0.62, 0.36]], [1, [1, 0.96, 0.88]]];
export function beamColor(level) {
  const t = Math.max(0, Math.min(1, level));
  for (let i = 1; i < BEAM_STOPS.length; i++) {
    const [t1, c1] = BEAM_STOPS[i];
    if (t <= t1) {
      const [t0, c0] = BEAM_STOPS[i - 1];
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return BEAM_STOPS[BEAM_STOPS.length - 1][1];
}

// El ojo en sí es siempre rojo saturado; con más energía arde más (y tira a anaranjado).
export function eyeColor(level) {
  const t = Math.max(0, Math.min(1, level));
  return [0.55 + 0.45 * t, 0.04 + 0.12 * t, 0.04];
}

const PHOTO_CHARGE = 0.45; // segundos de luz para que una membrana fotosensible se abra
const PHOTO_LINGER = 2.5;  // segundos que sigue abierta sin luz

// Orquesta los módulos: Entrada -> Lógica/Físicas -> Render, y las reglas
// que cruzan sistemas (daño por contacto, salidas de sala, revelado...).

export class Game {
  constructor(canvas) {
    this.visual = new Visual(canvas);
    this.input = new Input(canvas, VIEW_W, VIEW_H);
    setCavityHelp(() => { const h = this.cavityHelp(); return h[0].toUpperCase() + h.slice(1); });
    this.audio = new AudioSys();
    this.state = new GameState();
    this.factory = new EntityFactory(this);
    this.hud = new Hud();
    this.nodeMenu = new NodeMenu(this);
    this.genome = new Genome(this);
    this.devMenu = new DevMenu(this);
    this.pad = new Gamepad(this);
    this.touch = new Touch(this);
    this.mapView = new MapView(this);
    this.particles = new Particles(this.visual.world, { capacity: 1400 });
    this.glowParticles = new Particles(this.visual.glow, { additive: true });
    this.gore = new Gore(this);
    this.fadeEl = document.getElementById('fade');
    this.overlay = document.getElementById('overlay');

    this.mode = 'title';
    this.room = null;
    this.player = null;
    this.projectiles = [];
    this.flashes = [];
    this.time = 0;
    this.shake = 0;
    this.heartTimer = 0;
    this.pulse = 0;
    this.flicker = 1;
    this.fade = 0;
    this.eyeColor = eyeColor(1);
    this.beamColor = beamColor(1);

    const st = this.state;
    st.on('damage', ({ n }) => { if (n >= 1) this.shake = Math.max(this.shake, 3); });
    st.on('death', (cause) => this.#onDeath(cause));
    // Rechazo: lo que falla se cuenta como algo del cuerpo (diegético), no como un fallo
    // del juego. El jugador ve el espasmo en el propio personaje (Player.rejectSpasm).
    const FAIL_TEXT = {
      dash: 'Los émbolos se agarrotan: tu cuerpo rechaza los Pistones.',
      doubleJump: 'Los alveolos se cierran en un espasmo: no hay gas para el salto.',
      wallClimb: 'Las garras tiemblan y no hacen presa: el injerto se resiste.',
      grapple: 'El tendón se contrae solo y no sale: tu cuerpo lo rechaza.',
    };
    st.on('mutationFail', (ability) => {
      this.audio.play('fail');
      this.player?.rejectSpasm();
      this.shake = Math.max(this.shake, 2);
      if (this.time - (this.lastFailSay ?? -9) > 3) {
        this.lastFailSay = this.time;
        this.say(FAIL_TEXT[ability] ?? 'Un injerto no responde: tu cuerpo lo rechaza.', 1.8);
      }
    });
    st.on('rejectionTier', (tier) => {
      this.audio.play('fail');
      this.player?.rejectSpasm();
      this.say([
        '',
        'Tus injertos se inflaman (70 %): aún responden, pero no tardarán en fallar. Un Supresor del útero lo calma.',
        'Tu cuerpo rechaza la carne ajena (85 %): las mutaciones empiezan a fallar.',
        'CRISIS DE RECHAZO: los injertos te devoran por dentro. Busca un útero.',
      ][tier], 4);
    });
    st.on('outOfBreath', () => {
      if (this.time - (this.lastBreathWarn ?? -9) < 1.2) return;
      this.lastBreathWarn = this.time;
      this.audio.play('empty');
      this.say('Sin aliento: deja de forzar el cuerpo y el O2 volverá.', 1.8);
    });
    st.on('fragment', ({ kind, count, need }) => {
      const fr = FRAGMENTS[kind], line = LINES[fr.line];
      this.say(`Fragmento de ADN ${fr.name} ${count}/${need} · hace crecer tu ${line.name.toLowerCase()}`, 2.2);
    });
    st.on('sequence', (id) => {
      this.audio.play('dna');
      this.say(`Secuencia completa: ${MUTATIONS[id].name} (${dnaTag(id)}). Asimílala en el útero de un Nodo Seguro.`, 4);
    });
    st.on('cellUsed', (left) => {
      this.audio.play('flicker');
      this.say(`Tu ojo devora una célula lumínica y vuelve a brillar. ${left ? `Quedan ${left} en reserva.` : 'No te quedan más.'}`, 2.5);
    });
    st.on('sequenceSpare',() => this.say('Secuencia redundante: esa línea ya está completa. El tejido sobrante amplía tu reserva de biomasa (+5).', 3));
    st.on('mutated', (id) => {
      const m = MUTATIONS[id];
      this.say(m.unlockHint ? `Tu cuerpo cede: ${m.name}. ${m.unlockHint}` : `Tu cuerpo cede. ${m.name} asimilado. [I] para ver cómo usarlo.`, 6);
      this.shake = 6;
    });

    this.loop = new Loop((dt) => this.update(dt), (dt) => this.render(dt));
    this.loop.start();
  }

  start() {
    if (this.mode !== 'title') return;
    this.audio.init();
    this.audio.stopTitleMusic(2.5);
    this.audio.startDrone();
    this.audio.biomeSound = null;
    this.overlay.hidden = true;
    this.hud.show(true);
    this.player = new Player(this);
    this.state.checkpoint = { room: START.room, spawn: START.spawn };
    this.loadRoom(START.room, START.spawn);
    this.mode = 'play';
    // Si se empieza junto a un útero, se nace de él.
    if (this.#startBirth(START.spawn)) this.birth.say = 'Naces de la carne. Solo ves lo que ilumina tu ojo.';
    else this.say('Despiertas en la carne. Solo ves lo que ilumina tu ojo.', 4);
  }

  // ---------- Salas ----------
  loadRoom(id, spawn) {
    this.audio.stopBossMusic(0.8);
    this.hud.endDialogue();
    if (this.room) this.factory.disposeRoom(this.room);
    for (const p of this.projectiles) p.dispose();
    this.projectiles = [];
    this.particles.clear();
    this.glowParticles.clear();
    const prevBiome = this.room?.biome;
    this.room = this.factory.buildRoom(id);
    sweepGPU(); // libera en la GPU lo de la sala anterior
    this.room.hintsShown = new Set();
    this.world = this.room.world;
    this.gore.reset(this.world);
    this.player.spawnAt(...spawn);
    this.#unstick();
    this.#updateCamera(1, true);
    this.audio.setBiome(this.room.biome.sound);
    this.state.visited.add(id);
    if (prevBiome && prevBiome !== this.room.biome) this.say(`— ${caps(this.room.biome.name)} —`, 3);
  }

  // Si al llegar quedas dentro de algo sólido (p. ej. un punto de conexión tapado por una
  // membrana aún cerrada), te lleva al hueco libre más cercano.
  #unstick() {
    const p = this.player, w = this.world;
    if (!w.rectSolid(p.x, p.y, p.w, p.h)) return;
    for (let r = 1; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = p.x + dx * TILE, y = p.y + dy * TILE;
        if (x < 0 || y < 0 || x + p.w > w.pixelW || y + p.h > w.pixelH) continue;
        if (!w.rectSolid(x, y, p.w, p.h)) { p.x = x; p.y = y; p.vx = p.vy = 0; return; }
      }
    }
  }

  #checkExits() {
    const p = this.player, w = this.world;
    if (this.mode !== 'play') return;
    const side = p.cx < 0 ? 'left' : p.cx > w.pixelW ? 'right' : p.cy < 0 ? 'top' : p.y > w.pixelH ? 'bottom' : null;
    if (!side) return;
    // Con varias salidas en el mismo lado, `at` indica el tramo (filas o columnas) de cada una.
    const along = Math.floor((side === 'left' || side === 'right' ? p.cy : p.cx) / TILE);
    const pass = (this.room.links ?? []).find((l) => l.def.to && (l.def.trigger ?? 'touch') === 'touch' && l.edge === side && along >= l.span[0] && along <= l.span[1]);
    if (pass) return this.#travel(pass.def.to, pass.def.toLink, pass.def.spawn, pass.visible);
    const exit = (this.room.def.exits ?? []).find((e) => e.side === side && (!e.at || (along >= e.at[0] && along <= e.at[1])));
    if (exit?.toLink) return this.#travel(exit.to, exit.toLink, exit.spawn);
    if (!exit) {
      p.x = Math.max(0, Math.min(w.pixelW - p.w, p.x));
      p.y = Math.max(-p.h / 2, Math.min(w.pixelH - p.h, p.y));
      return;
    }
    this.mode = 'transition';
    this.transition = { t: 0, exit, loaded: false };
  }

  // ---------- API para las entidades ----------
  mouseWorld() {
    return { x: this.visual.cam.x + this.input.mouse.x, y: this.visual.cam.y + this.input.mouse.y };
  }

  spawnProjectile(o) { this.projectiles.push(new Projectile(this, o)); }

  // Lo soltado salta en un arco y tarda un instante en poder cogerse: así se ve qué ha
  // caído (si no, al estar encima se recogía en el acto y parecía que no daba nada).
  dropPickup(kind, x, y, amount, extra = {}) {
    this.room.pickups.push(new Pickup(this, kind, x, y, {
      amount, falling: true, vx: (Math.random() - 0.5) * 70, vy: -120 - Math.random() * 50, noTake: 0.45, ...extra,
    }));
  }

  // Esbirros que invocan los jefes: no dejan fragmentos ni cuentan como muertes de sala.
  spawnMinion(type, x, y) {
    const e = this.factory.createEnemy(type, 0, 0);
    e.x = x - e.w / 2;
    e.y = y - e.h / 2;
    e.minion = true;
    e.seenOnce = true;
    this.room.enemies.push(e);
  }

  // Cría de una división (colonia partida, célula desprendida). Tope por sala para
  // que las divisiones en cadena no llenen la pantalla.
  spawnOffspring(type, x, y, extra = {}) {
    if (this.room.enemies.filter((m) => m.alive).length >= 18) return null;
    const e = this.factory.createEnemy(type, 0, 0);
    Object.assign(e, extra);
    e.x = x - e.w / 2;
    e.y = y - e.h / 2;
    e.offspring = true;
    e.seenOnce = true;
    this.room.enemies.push(e);
    return e;
  }

  // Explosión en área (esporas): daña e infecta a quien esté dentro del radio.
  areaBurst(x, y, radius, damage, status) {
    this.audio.play('acid', { x, y });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 50;
      this.glowParticles.emit(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: 0.8, color: [0.55, 0.75, 0.15] });
    }
    const p = this.player;
    if (Math.hypot(p.cx - x, p.cy - y) < radius) this.hurtPlayer(damage, x, 'esporas', status);
  }

  // Todos los jefes recompensan: su llave (si la guardan), una memoria, su bioma
  // grabado en el mapa y, algunos, un cambio permanente en el mundo.
  onBossDefeated(e) {
    const st = this.state, d = e.def, r = d.reward ?? {};
    // Su música se corta en el momento en que cae (sin arrastrarse tras su muerte), y la
    // sombra que inundaba su sala se retira poco a poco (solo en esta sala).
    this.audio.stopBossMusic(0.25);
    this.room.cleansed = true;
    if (e.key) st.bosses.add(e.key);
    if (d.drop?.dna && !e.noDna) this.dropPickup('dna', e.cx, e.cy, undefined, { mutation: d.drop.dna });
    (d.drop?.items ?? []).forEach((k, i) => this.dropPickup(k, e.cx + (i + 1) * 12, e.cy - 6));
    for (let i = 0; i < (d.drop?.fragments ?? 0); i++) {
      this.dropPickup('fragment', e.cx + (i - 0.5) * 14, e.cy, undefined, { frag: d.frag });
    }
    if (r.revealBiome) for (const [id, lv] of Object.entries(LEVELS)) if (lv.biome === r.revealBiome) st.mapRevealed.add(id);
    if (r.flag) st.flags.add(r.flag);
    // Los sacos vitelinos unidos a este jefe se marchitan y liberan lo que guardan.
    st.flags.add(`boss:${e.type}`);
    for (const s of this.room.sacs) if (s.def.until === e.type) s.release();
    if (r.lore) st.lore.push(r.lore);
    // Los esbirros mueren con su creador.
    for (const m of this.room.enemies) if (m.minion && m.alive) m.die();
    // Y los fluidos que controlaba (la arena de la Glándula) se vacían.
    for (const h of this.room.hazards) if (h.def?.manual) h.target = 0;
    this.shake = 10;
    this.audio.play('mutate');
    this.say(`${d.name} ha caído. ${r.lore ? '[I] Nueva memoria en el Genoma. ' : ''}${r.text ?? ''}`, 6);
  }

  // Luz ambiente de la sala. Sin energía en el ojo, la penumbra se cierra; en la sala de
  // un jefe vencido la sombra se retira y la carne se ve con una luz cálida y limpia.
  #ambient() {
    const c = this.room.cleanse ?? 0, dim = this.state.light > 0 ? 1 : 0.5;
    const CLEAN = [0.62, 0.5, 0.46];
    return this.room.ambient.map((v, i) => (v + (CLEAN[i] - v) * c * 0.85) * (dim + (1 - dim) * c));
  }

  // Superficie del fluido en el que está metido `p` (cubetas que se llenan o ácido fijo
  // '~'), o null si no está en ninguno. La usa el nado del jugador.
  fluidSurfaceAt(p) {
    for (const h of this.room.hazards) {
      if (h.surfaceY === undefined || h.level <= 0.01) continue;
      if (p.cx >= h.x0 && p.cx <= h.x0 + h.w && p.y + p.h > h.surfaceY && p.y < h.yBottom) return h.surfaceY;
    }
    const tx = Math.floor(p.cx / TILE);
    let ty = Math.floor(p.cy / TILE);
    if (this.world.get(tx, ty) !== '~') return null;
    while (this.world.get(tx, ty - 1) === '~') ty--;
    return ty * TILE;
  }

  flash(x, y, r, color, dur) { this.flashes.push({ x, y, r, color, t: dur, dur }); }

  say(text, seconds) { this.hud.say(text, seconds); }

  // Diálogo de lore: se queda hasta que el jugador pasa (Saltar, E o Intro).
  dialogue(lines, opts = {}) {
    this.hud.dialogue(lines, opts);
  }

  // Cómo se usa la cavidad activa, según con qué juegas.
  cavityHelp() {
    if (this.pad.active) return 'R3 usa la cavidad activa; mantén R3 y elige con la cruceta';
    if (this.touch.active) return 'el botón de la cavidad la usa; mantenlo y elige con la cruceta';
    return `${keyName('cavityUse')} usa la cavidad activa; ${keyName('cavityNext')} pasa a la siguiente`;
  }

  // Dónde está un consumible y cómo se usa, según con qué juegas.
  itemKey(kind) {
    const st = this.state, i = st.cavities.indexOf(kind);
    if (i < 0) return 'acomodándolo en una cavidad desde el Genoma (las tuyas están ocupadas)';
    const use = this.pad.active ? 'R3' : this.touch.active ? 'el botón de la cavidad' : keyName('cavityUse');
    const next = this.pad.active ? 'mantén R3 y elige con la cruceta' : this.touch.active ? 'mantenlo y elige con la cruceta' : `${keyName('cavityNext')} cambia de cavidad`;
    return `con ${use} desde tu cavidad ${i + 1} (${next})`;
  }

  // Cavidades. Teclado: una tecla usa la activa y otra pasa a la siguiente. Mando (R3) y
  // táctil: un toque usa la activa; mantenido, la cruceta elige (← →) y el cuerpo se
  // queda quieto. Al soltar sin haber elegido, no se usa nada si fue largo.
  #cavities(dt) {
    const st = this.state, input = this.input;
    if (input.hit(...BINDINGS.cavityUse)) this.useCavity();
    if (input.hit(...BINDINGS.cavityNext)) this.cycleCavity(1);
    if (input.down('PadCavity')) {
      this.cavHold = (this.cavHold ?? 0) + dt;
      this.choosingCavity = this.cavHold > 0.12 || this.cavMoved;
      const d = (input.hit('ArrowRight') ? 1 : 0) - (input.hit('ArrowLeft') ? 1 : 0);
      if (d) { this.cycleCavity(d); this.cavMoved = true; this.choosingCavity = true; }
      return;
    }
    if (this.cavHold > 0 && !this.cavMoved && this.cavHold < 0.35) this.useCavity();
    this.cavHold = 0; this.cavMoved = false; this.choosingCavity = false;
  }

  cycleCavity(d) {
    const st = this.state, n = st.cavities.length;
    st.cavity = (st.cavity + d + n) % n;
    this.audio.play('click');
    const k = st.cavities[st.cavity];
    this.say(k ? `Cavidad ${st.cavity + 1}: ${ITEMS[k].name} (×${st.items[k]}).` : `Cavidad ${st.cavity + 1}: vacía.`, 1.2);
  }

  useCavity() {
    const st = this.state, k = st.cavities[st.cavity];
    if (!k) { this.audio.play('empty'); return this.say(`Cavidad ${st.cavity + 1} vacía: acomoda un consumible desde el Genoma.`, 1.6); }
    if (!st.items[k] && !(st.timers[k] > 0)) this.audio.play('empty');
    this.useItem(k);
  }

  useItem(kind) {
    const st = this.state, it = ITEMS[kind];
    if (st.timers[kind] > 0) return this.say(`${it.name}: aún te dura.`, 1.2);
    if (kind === 'plasma' && st.items.plasma > 0 && st.integrity >= st.maxIntegrity) return this.say('Tu integridad está al máximo: guardas el coágulo.', 1.5);
    if (!st.useItem(kind)) return this.say(`No llevas ningún ${it.name}.`.replace('ningún Perla', 'ninguna Perla').replace('ningún Célula', 'ninguna Célula'), 1.2);
    if (kind === 'plasma') {
      const p = this.player;
      this.audio.play('womb');
      this.flash(p.cx, p.cy, 80, [1, 0.3, 0.35], 0.25);
      for (let i = 0; i < 10; i++) this.glowParticles.emit(p.cx + (Math.random() - 0.5) * 10, p.cy, { vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 40, life: 0.6, color: [1, 0.3, 0.35] });
      return this.say(`Coágulo de plasma: +${it.heal} integridad.`, 1.8);
    }
    const p = this.player;
    this.audio.play(kind === 'shield' ? 'reveal' : 'womb');
    this.flash(p.cx, p.cy, 90, kind === 'shield' ? [0.4, 0.9, 1] : [0.3, 1, 0.45], 0.3);
    this.say(kind === 'shield'
      ? `Perla de Nácar: el nácar te recubre. Nada te hiere durante ${it.time} s.`
      : `Célula Madre: tu tejido se regenera durante ${it.time} s.`, 2.5);
  }

  // Daño de enemigos y peligros. La Piel (Quitina II/III) reduce el de los enemigos;
  // 'status' aplica un estado alterado (p. ej. la infección de los escupitajos).
  hurtPlayer(n, fromX, cause, status) {
    const p = this.player, st = this.state;
    if (p.invuln > 0 || st.dead) return;
    // Con la Perla de Nácar los golpes resbalan: ni daño ni empujón.
    if (st.timers.shield > 0) {
      if ((p.shieldTick ?? 0) > this.time) return; // un tintineo por golpe, no uno por fotograma
      p.shieldTick = this.time + 0.3;
      this.audio.play('click');
      this.glowParticles.emit(p.cx, p.cy, { vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 60, life: 0.3, color: [0.5, 0.95, 1] });
      return;
    }
    const fromEnemy = cause !== 'espinas';
    st.damage(fromEnemy ? n * st.mod('damageTaken') : n, cause);
    if (status === 'infection' && st.applyStatus('infection', INFECTION.time)) this.say('Infección: la herida se pudre y te revuelve por dentro. Te dará arcadas.', 2.5);
    p.invuln = 0.9;
    p.rope = null;
    p.vy = -160;
    if (fromX != null) p.vx = Math.sign(p.cx - fromX || 1) * 130;
    this.audio.play('hurt');
    // Tu sangre también mancha.
    this.gore.hit(p.cx, p.cy, fromX != null ? Math.sign(p.cx - fromX || 1) : -p.facing, { blood: '#8a0a14' }, 0.8);
  }

  // Abre una membrana agrietada (X, embestida) o un esfínter sellado (Y, Tendón).
  breakMembrane(cx, cy) {
    const seal = this.world.get(cx, cy) === 'Y';
    // El sello del Corazón solo cede a un cuerpo completo: todas las líneas de órganos
    // a nivel I como mínimo.
    if (seal && this.room.def.heartSeal && !this.state.complete) {
      const missing = Object.entries(LINES).filter(([l]) => this.state.lineLevel(l) === 0).map(([, v]) => v.name.toLowerCase());
      this.audio.play('fail');
      this.say(`El sello del Corazón no reconoce un cuerpo incompleto. Te falta: ${missing.join(', ')}.`, 4);
      return false;
    }
    const cells = this.world.floodFill(cx, cy);
    for (const [x, y] of cells) {
      this.world.set(x, y, '.');
      this.state.broken.add(`${this.room.id}:${x},${y}`);
      for (let i = 0; i < 6; i++) {
        this.particles.emit(x * TILE + Math.random() * 16, y * TILE + Math.random() * 16, { vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 80, life: 1, gravity: 400, color: seal ? [0.75, 0.2, 0.3] : [0.6, 0.4, 0.38] });
      }
    }
    this.audio.play(seal ? 'tear' : 'crunch', this.player);
    if (seal) this.audio.play('crunch', this.player);
    this.shake = 6;
    this.factory.refresh(this.room);
  }

  openNode() {
    // Descansar repuebla el mundo: los enemigos muertos volverán al cambiar de sala.
    this.state.rest();
    this.mode = 'menu';
    this.audio.play('node');
    this.nodeMenu.show();
  }

  closeNode() {
    this.mode = 'play';
    this.input.endStep();
    this.input.keys.delete('Mouse0');
  }

  openGenome() {
    this.mode = 'genome';
    this.audio.play('genome');
    this.genome.show();
  }

  closeGenome() {
    this.audio.play('genome');
    this.closeNode();
  }

  // ---------- Bucle ----------
  update(dt) {
    // Cada pocos segundos se libera en la GPU lo que ya no está en escena (core/Gpu.js).
    this.gpuSweep = (this.gpuSweep ?? 0) + dt;
    if (this.gpuSweep > 6) { this.gpuSweep = 0; sweepGPU(); }
    this.time += dt;
    if (this.mode === 'transition') this.#updateTransition(dt);
    else if (this.mode === 'dead') this.#updateDeath(dt);
    else if (this.mode === 'play') this.#updatePlay(dt);
    this.input.endStep();
  }

  // Parto: si hay un útero junto al punto de salida (a pocas casillas), el cuerpo sale de
  // él. Devuelve true si empieza.
  #startBirth([tx, ty]) {
    const w = this.room.wombs?.find((w) => Math.abs(w.node.cx - tx) <= 3 && Math.abs(w.node.cy - ty) <= 3);
    if (!w) return false;
    this.birth = { womb: w, t: 0 };
    w.birth();
    this.player.unborn = true;
    return true;
  }

  // Avanza el parto: el cuerpo espera dentro del saco hasta la rotura y entonces cae por
  // la boca desgarrada, empapado; al terminar se devuelve el control.
  #birthStep(dt) {
    const b = this.birth, p = this.player, w = b.womb;
    b.t += dt;
    if (p.unborn) {
      const m = w.mouth;
      p.x = m.x - p.w / 2; p.y = m.y - p.h; p.vx = p.vy = 0;
      if (b.t >= BIRTH.rupture) {
        p.unborn = false;
        p.y = m.y - p.h * 0.5;
        p.vx = p.facing * 25; p.vy = 40;
      }
    } else if (Math.random() < 0.3 && b.t < BIRTH.end + 2) {
      // Empapado: gotea líquido amniótico un rato.
      this.particles.emit(p.cx + (Math.random() - 0.5) * 8, p.y + 6 + Math.random() * 16, { vy: 6, life: 0.8, gravity: 400, color: [0.3, 0.75, 0.5], stain: 'rgba(60,150,100,0.5)' });
    }
    if (b.t >= BIRTH.end) {
      if (b.say) this.say(b.say, 4);
      this.birth = null;
    }
  }

  #updatePlay(dt) {
    // Naciendo: el mundo sigue pero no hay controles (ni menús, ni consumibles).
    if (this.birth) {
      this.#birthStep(dt);
      const real = this.input;
      this.input = NO_INPUT(real);
      try { return this.#playStep(dt); } finally { this.input = real; }
    }
    return this.#playStep(dt);
  }

  #playStep(dt) {
    // Congelado del impacto: unos fotogramas quietos dan peso al golpe.
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    // Cavidades: usar el consumible a mano sin abrir el Genoma.
    this.#cavities(dt);
    this.hud.choosing = this.choosingCavity;
    // Diálogo abierto: Saltar (Espacio, ✕ / A del mando, SALTAR en táctil), E o Intro lo
    // pasan, y esa pulsación no hace nada más (no salta).
    // Explicación del HUD abierta (minitutorial): se acepta igual, o con Esc.
    const PASS = ['Space', 'KeyE', 'Enter'];
    if (!this.hud.dialogueActive && this.hud.tutOpen && this.input.hit(...PASS, 'Escape')) {
      this.hud.closeTut();
      for (const k of [...PASS, 'Escape']) this.input.pressed.delete(k);
    }
    if (this.hud.dialogueActive && this.input.hit(...PASS)) {
      this.hud.advance();
      for (const k of PASS) this.input.pressed.delete(k);
    }
    // Salir (Esc, o el botón de volver del mando) cierra los textos: el diálogo entero, o
    // la voz de un personaje y el aviso que haya en pantalla.
    if (this.input.hit('Escape') && (this.hud.dialogueActive || this.hud.textShown)) {
      if (this.hud.dialogueActive) this.hud.endDialogue(); else this.hud.dismiss();
      this.input.pressed.delete('Escape');
    }
    const st = this.state, p = this.player, input = this.input;
    this.eyeColor = eyeColor(st.light / 100);
    this.beamColor = beamColor(st.light / 100);

    if (input.hit('KeyI')) return this.openGenome();
    if (input.hit('KeyM')) {
      if (!st.has('map1')) {
        this.say('No tienes mapa interno. Algún ganglio de este cuerpo podría recordar los caminos por ti.', 3);
      } else {
        // Minimapa del HUD: se muestra y se oculta sin detener el juego.
        this.mapView.toggle();
        this.audio.play('genome');
      }
    }
    if (DEV_TOOLS && input.hit('F9', 'Backquote')) {
      this.mode = 'dev';
      return this.devMenu.show();
    }

    if (input.hit('KeyF')) {
      if (st.light > 0) {
        st.flashlightOn = !st.flashlightOn;
        st.eyeStarved = false;
        this.audio.play('flicker');
        if (!st.flashlightOn) this.say(`Cierras el ojo fotóforo. ${this.pad.active ? '[CUADRADO/X]' : this.touch.active ? '[OJO]' : '[F]'} para abrirlo.`, 1.5);
      } else {
        this.say('Tu ojo se ha apagado: necesita energía lumínica.', 1.5);
      }
    }

    // Puntos de conexión: al tocarlos, o con [E] delante, llevan a su destino. Al llegar a
    // un punto no se dispara hasta salir de él (si no, el de vuelta te devolvería).
    const isTouch = (l) => (l.def.trigger ?? 'touch') === 'touch';
    const centerIn = (r) => p.cx >= r.x && p.cx < r.x + r.w && p.cy >= r.y && p.cy < r.y + r.h;
    const link = (this.room.links ?? []).find((l) => l.def.to && (isTouch(l) ? !l.edge && centerIn(l.rect) : overlap(p, l.rect)));
    if (this.linkLock && !(this.room.links ?? []).some((l) => l.def.id === this.linkLock && overlap(p, l.rect))) this.linkLock = null;
    // (el bloqueo solo frena los de tocar: los de [E] nunca se disparan solos)
    const useLink = link && (link.def.trigger ?? 'touch') === 'use';
    if (link && (useLink || link.def.id !== this.linkLock)) {
      if (!useLink) return this.#travel(link.def.to, link.def.toLink, link.def.spawn, link.visible);
      const key = this.pad.active ? '[TRIANGULO/Y]' : this.touch.active ? '[USAR]' : '[E]';
      this.hud.setPrompt(`${key} ATRAVESAR`);
      if (input.hit('KeyE')) return this.#travel(link.def.to, link.def.toLink, link.def.spawn, link.visible);
    }
    const node = !this.birth && this.room.nodes.find((n) => overlap(p, n));
    if (node) {
      const cp = st.checkpoint;
      if (cp.room !== this.room.id || cp.spawn[0] !== node.cx) {
        st.checkpoint = { room: this.room.id, spawn: [node.cx, node.cy] };
        this.say('Nodo Seguro: punto de control. Aquí recuperas el aliento al instante.', 3);
      }
      const key = this.pad.active ? '[TRIANGULO/Y]' : this.touch.active ? '[USAR]' : '[E]';
      this.hud.setPrompt(st.dna.size ? `${key} ASIMILAR EL ADN EN EL UTERO` : `${key} USAR NODO SEGURO`);
      if (input.hit('KeyE')) return this.openNode();
    } else if (!(link && (useLink || link.def.id !== this.linkLock))) {
      this.hud.setPrompt('');
    }

    p.update(dt);

    let boss = null;
    for (const e of this.room.enemies) {
      e.update(dt);
      // Embistiendo atraviesas a los enemigos sin que te toquen (Player.#ram los hiere).
      const touch = e.contactDamage ?? e.def.contactDamage;
      if (e.alive && touch > 0 && !e.submerged && p.dash <= 0 && overlap(p, e)) this.hurtPlayer(touch, e.cx, e.def.name);
      if (e.alive && e.def.boss && (e.seenOnce || Math.hypot(e.cx - p.cx, e.cy - p.cy) < 200)) boss = e;
    }
    this.room.enemies = this.room.enemies.filter((e) => e.alive);
    this.hud.setBoss(boss, st.lineLevel('cerebro') >= 1 || st.lineLevel('ojo') >= 1);
    // Los jefes aberración traen su música: arranca al empezar la pelea y se apaga
    // al morir el jefe o al salir de la sala.
    const theme = boss?.def.music;
    if (theme && this.audio.bossTheme !== theme) { this.audio.stopBossMusic(0.4); this.audio.startBossMusic(theme); }
    else if (!theme && this.audio.bossMusic) this.audio.stopBossMusic(2.5);

    for (const pr of this.projectiles) pr.update(dt);
    this.projectiles = this.projectiles.filter((pr) => pr.alive);

    for (const pk of this.room.pickups) {
      pk.update(dt);
      // Lo oculto no existe para ti hasta que tu ojo lo revela.
      if (overlap(p, pk) && (!pk.hidden || pk.revealed) && !pk.locked && !(pk.noTake > 0) && (pk.def.canTake?.(this.state) ?? true)) {
        pk.collect();
        if (pk.kind === 'heart') return this.#win();
      } else if (pk.locked && overlap(p, pk) && this.time - (this.lastCantTake ?? -9) > 3) {
        // Un saco sellado: que se entienda por qué no se coge (lo oculto ya lo dice su fantasma).
        if (pk.locked) { this.lastCantTake = this.time; this.say('El saco vitelino está sellado: se abrirá cuando caiga el señor de esta sala.', 2.5); }
      }
    }
    this.room.pickups = this.room.pickups.filter((pk) => pk.alive);

    // Membrana del Rostro: al rozarla cerrada, un aviso de qué la abre.
    if (this.time - (this.lastFaceSealSay ?? -9) > 5) {
      const w = this.world, x0 = Math.floor((p.x - 2) / TILE), x1 = Math.floor((p.x + p.w + 2) / TILE);
      const y0 = Math.floor((p.y - 2) / TILE), y1 = Math.floor((p.y + p.h + 2) / TILE);
      let hit = false;
      for (let y = y0; y <= y1 && !hit; y++) for (let x = x0; x <= x1; x++) if (w.get(x, y) === 'Z') { hit = true; break; }
      if (hit) {
        this.lastFaceSealSay = this.time;
        this.audio.play('thump', p);
        this.say('Una membrana con un núcleo dormido. No cede a la fuerza: algo en este cuerpo tiene que querer abrirla.', 3.5);
      }
    }
    // Sala liberada: la luz vuelve despacio.
    if (this.room.cleansed && this.room.cleanse < 1) this.room.cleanse = Math.min(1, this.room.cleanse + dt / 4);
    // Eventos de texto de la sala (editor: "Evento de texto"): al entrar en su zona.
    for (const te of this.room.texts ?? []) {
      const d = te.def, inZone = overlap(p, { x: d.x * TILE, y: d.y * TILE, w: (d.w ?? 1) * TILE, h: (d.h ?? 1) * TILE });
      // Condición: siempre, o solo antes / después de vencer a un jefe.
      const bossDown = d.boss && st.flags.has(`boss:${d.boss}`);
      const allowed = d.when === 'antes' ? !bossDown : d.when === 'despues' ? bossDown : true;
      if (inZone && !te.inside && allowed && !(d.once !== false && st.flags.has(te.key))) {
        if (d.once !== false) st.flags.add(te.key);
        const lines = (d.lines ?? []).filter(Boolean);
        if (d.mode === 'aviso') this.say(lines.join(' '), Math.max(2.5, lines.join(' ').length * 0.06));
        else this.dialogue(lines, { speaker: d.speaker });
      }
      te.inside = inZone;
    }
    for (const w of this.room.wombs) w.update();
    for (const h of this.room.hazards) h.update(dt);
    for (const n of this.room.nodules) n.update(dt);
    for (const l of this.room.lamps ?? []) l.update(dt);
    for (const h of this.room.hooks ?? []) h.update(dt);
    for (const l of this.room.links ?? []) l.update(dt);
    for (const s of this.room.sacs) s.update(dt);
    this.room.sacs = this.room.sacs.filter((s) => s.alive);
    this.room.nodules = this.room.nodules.filter((n) => n.alive);
    // Las membranas agrietadas respiran: alternan fotogramas y sus grietas laten.
    for (const m of this.room.membranes) {
      const f = m.frames[Math.floor(this.time * 1.4 + m.phase) % 2];
      m.mesh.material.map = f.tex;
      m.glowMesh.material.map = f.glowTex;
      m.glowMesh.material.opacity = 0.5 + 0.5 * Math.sin(this.time * 3 + m.phase);
    }
    // Corriente de aire hacia los orificios del techo (y desde los del suelo).
    for (const h of this.room.holes) {
      if (Math.random() < 0.35) {
        const x = h.cx + (Math.random() - 0.5) * 20, up = h.dir < 0;
        this.glowParticles.emit(x, up ? h.y + 40 + Math.random() * 30 : h.y - 10, { vx: (Math.random() - 0.5) * 6, vy: up ? -45 : 30, life: 1.2, color: [0.9, 0.7, 0.55] });
      }
    }
    this.particles.update(dt, this.world);
    this.gore.update(dt);
    this.glowParticles.update(dt);
    this.flashes = this.flashes.filter((f) => (f.t -= dt) > 0);

    this.#hazards(dt);
    if (st.infection > 0 && Math.random() < 0.35) {
      this.glowParticles.emit(p.cx + (Math.random() - 0.5) * 10, p.y + Math.random() * p.h, { vy: -25, life: 0.5, color: [0.55, 0.75, 0.15] });
    }
    st.tick(dt, { inNode: !!node });
    this.#reveal(dt);
    this.#hints();
    this.#heartbeat(dt);
    this.#updateCamera(dt);
    this.#checkExits();
  }

  #hazards(dt) {
    const p = this.player, st = this.state;
    let acid = false, spikes = false, abyss = false;
    for (const t of this.world.tilesIn(p.x + 1, p.y + 1, p.w - 2, p.h - 1)) {
      if (t.c === '~') acid = true;
      // Las púas ocupan la mitad inferior del tile: solo hieren si los pies bajan hasta ellas.
      else if (t.c === '^' && p.y + p.h > t.cy * TILE + 7) spikes = true;
      else if (t.c === 'v') abyss = true;
    }
    if (p.onGround && !abyss) { this.abyssBites = 0; this.abyssArc = null; }
    // Durante el arco del rebote se mantiene el empuje lateral (rozar la pared del pozo
    // al subir no lo anula).
    if (this.abyssArc) {
      const a = this.abyssArc;
      if (Math.sign(a.x - p.x) !== Math.sign(a.vx)) { p.vx = 0; this.abyssArc = null; } // ya estás sobre el borde
      else p.vx = a.vx;
    }
    if (abyss && p.vy >= 0) {
      // Las fauces del fondo muerden y te escupen hacia arriba en un arco que acaba
      // sobre el último suelo firme. Si aun así vuelves a caer varias veces seguidas
      // (techo en medio, mala suerte), te devuelven a él como antes.
      st.damage(15, 'abismo');
      this.abyssBites = (this.abyssBites ?? 0) + 1;
      p.rope = null;
      p.dash = 0;
      p.invuln = 0.6;
      this.audio.play('hurt');
      this.audio.play('melee', p);
      this.gore.hit(p.cx, p.y + p.h, 0, { blood: '#8a0a14' }, 1.2);
      if (this.abyssBites > 3) {
        p.x = p.lastSafe.x;
        p.y = p.lastSafe.y;
        p.vx = p.vy = 0;
        this.abyssBites = 0;
        this.say('El abismo te escupe de vuelta.', 1.5);
        return;
      }
      // Arco justo: rebota lo mínimo para asomar sobre el borde (medio tile de margen);
      // si el borde queda lejos, el arco se alarga lo necesario para llegar a él.
      const dx = p.lastSafe.x - p.x, above = p.y - p.lastSafe.y + TILE / 4;
      const T = Math.abs(dx) / ABYSS_VX;
      let vy = Math.sqrt(2 * GRAVITY * Math.max(1.5 * TILE, above + TILE / 2));
      if (T > vy / GRAVITY) vy = (above + 0.5 * GRAVITY * T * T) / T; // aún ha de estar alto al llegar
      const t = Math.max(T, vy / GRAVITY);
      p.vy = -vy;
      p.vx = dx / t;
      p.wallLock = t; // sin control mientras vuela: el arco te deja en el borde
      this.abyssArc = p.vx ? { vx: p.vx, x: p.lastSafe.x } : null;
      if (this.abyssBites === 1) this.say('Las fauces del fondo te escupen hacia arriba.', 1.5);
      return;
    }
    if (spikes && !st.immune('spikes')) this.hurtPlayer(10, null, 'espinas');
    // Con Placas de Quitina el ácido apenas muerde, pero corroe más cuanto más rato
    // sigues dentro: se puede cruzar, no quedarse a vivir.
    // inAcid: lo marcan las cubetas e inundaciones (Hazards) en el paso anterior.
    if (this.inAcid && st.immune('acid')) acid = true;
    this.inAcid = false;
    this.acidSoak = acid ? (this.acidSoak ?? 0) + dt : 0;
    if (acid && !st.immune('acid')) {
      st.damage(14 * dt, 'ácido');
      this.audio.play('sizzle', p);
      if (Math.random() < 0.5) this.glowParticles.emit(p.cx + (Math.random() - 0.5) * 10, p.y + p.h, { vy: -40, life: 0.4, color: [0.4, 1, 0.3] });
    } else if (acid) {
      st.damage(Math.min(ACID_ARMORED_MAX, ACID_ARMORED + this.acidSoak * ACID_ARMORED_RAMP) * dt, 'ácido');
      if (this.acidSoak > 2) this.audio.play('sizzle', p);
      if (Math.random() < 0.15) this.glowParticles.emit(p.cx + (Math.random() - 0.5) * 10, p.y + p.h, { vy: -30, life: 0.3, color: [0.4, 1, 0.3] });
    }
  }

  // ¿Toca el haz del ojo este punto? (mismo cono y sombras que el shader)
  #inBeam(x, y) {
    const st = this.state, p = this.player, lp = p.lampPos;
    if (!st.flashlightOn || st.light <= 0) return { lit: false, los: false, d: Infinity };
    const dx = x - lp.x, dy = y - lp.y, d = Math.hypot(dx, dy);
    // Ojo sin mutar: no hay cono, solo alumbra lo que cae dentro del halo.
    if (!st.has('eye1')) {
      const los = d < HALO_R && this.world.lineOfSight(lp.x, lp.y, x, y);
      return { lit: los && d < HALO_R * 0.85, los, d };
    }
    const range = LIGHT_RANGE * st.mod('lightRange');
    const los = d < range && this.world.lineOfSight(lp.x, lp.y, x, y);
    return { lit: los && d < range * 0.9 && angleDiff(Math.atan2(dy, dx), p.aim) < CONE_HALF, los, d };
  }

  // Lo que la luz desvela: enemigos camuflados, objetos ocultos y membranas fotosensibles.
  #reveal(dt) {
    const st = this.state, lp = this.player.lampPos;
    const ambR = st.light <= 0 ? 20 : st.flashlightOn ? HALO_R : 42; // el halo no encoge con el ojo
    const eye1 = st.has('eye1'), eye2 = st.has('eye2');
    for (const e of this.room.enemies) {
      const beam = this.#inBeam(e.cx, e.cy);
      const near = Math.hypot(e.cx - lp.x, e.cy - lp.y) < ambR * 0.8 && this.world.lineOfSight(lp.x, lp.y, e.cx, e.cy);
      e.setLit(beam.lit, near);
      // Ojo Pineal: las criaturas lucífugas huyen de tu haz.
      // lucifugo: true huye con el Ojo Pineal; un número pide ese nivel de la línea del ojo.
      const fears = typeof e.def.lucifugo === 'number' ? st.lineLevel('ojo') >= e.def.lucifugo : eye2 && e.def.lucifugo;
      if (fears && beam.lit && !e.def.boss) {
        if (!(e.scared > 0) && !st.seenScare) { st.seenScare = true; this.say('Tu ojo pineal quema: la criatura huye de tu luz.', 2.5); }
        e.scared = 1.2;
      }
      // Ojo Despierto: ves el contorno de lo que se camufla aunque no le dé la luz.
      e.sensed = eye1;
    }

    // Los mecanismos alumbrados también los fija el auto-apuntado.
    for (const t of this.room.targets ?? []) t.lit = t.alive && this.#inBeam(t.cx, t.cy).lit;

    // Objetos ocultos: el Ojo Despierto los hace titilar; solo el Ojo Pineal los
    // materializa para poder cogerlos. Sin mutar el ojo, siguen invisibles.
    for (const pk of this.room.pickups) {
      if (!pk.hidden || pk.revealed) continue;
      const lit = eye1 && this.#inBeam(pk.cx, pk.cy).lit;
      pk.glimmer = lit && !eye2 ? Math.min(0.35, (pk.glimmer ?? 0) + dt) : Math.max(0, (pk.glimmer ?? 0) - dt);
      if (lit && !eye2 && !st.seenGlimmer) { st.seenGlimmer = true; this.say('Algo late en la oscuridad... tu ojo aún no lo ve del todo (Ojo Pineal).', 3); }
      if (lit && eye2) pk.reveal += dt * 2;
      else pk.reveal = Math.max(0, pk.reveal - dt);
      if (pk.reveal >= 1) {
        pk.revealed = true;
        this.audio.play('reveal', pk);
        this.say('Tu ojo revela algo que la oscuridad escondía.', 2.5);
        for (let i = 0; i < 14; i++) {
          this.glowParticles.emit(pk.cx, pk.cy, { vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, life: 0.7, color: this.beamColor });
        }
      }
    }

    // Nódulos óseos: solo existen bajo el haz del ojo despierto (sin el Ojo I, el halo no
    // los revela: era más eficiente que el haz porque alumbra en todas direcciones).
    for (const n of this.room.nodules) {
      const lit = eye1 && this.#inBeam(n.cx, n.cy - 3).lit;
      n.reveal = lit ? Math.min(1, n.reveal + dt * 3) : Math.max(0, n.reveal - dt * 0.7);
      if (lit && n.reveal > 0.6 && !st.seenNodule) {
        st.seenNodule = true;
        this.say('Tu luz desvela un nódulo lleno de hueso. Solo cede mientras lo alumbras: písalo.', 3.5);
      }
    }

    let changed = false;
    for (const m of this.room.photo) {
      // El tejido fotosensible cede al Ojo Despierto (nivel 1); sin él, se estremece y ya.
      const beamed = m.cells.some(([cx, cy]) => this.#inBeam((cx + 0.5) * TILE, (cy + 0.5) * TILE).lit);
      const lit = beamed && eye1;
      if (beamed && !eye1 && !st.seenPhotoLocked) { st.seenPhotoLocked = true; this.say('El tejido fotosensible se estremece con tu luz, pero no cede. Necesitas un ojo despierto (Ojo, nivel I).', 3.5); }
      if (!m.open) {
        m.charge = lit ? m.charge + dt : Math.max(0, m.charge - dt);
        if (m.charge > 0 && Math.random() < 0.3) {
          const [cx, cy] = m.cells[Math.floor(Math.random() * m.cells.length)];
          this.glowParticles.emit((cx + Math.random()) * TILE, (cy + Math.random()) * TILE, { vy: -15, life: 0.4, color: this.beamColor });
        }
        if (m.charge >= PHOTO_CHARGE) {
          m.open = true;
          m.linger = PHOTO_LINGER;
          this.audio.play('tear', this.#cellsCenter(m));
          if (!st.seenPhoto) {
            st.seenPhoto = true;
            this.say('El tejido fotosensible se retrae ante tu luz.', 3);
          }
        }
      } else {
        m.linger = lit ? PHOTO_LINGER : m.linger - dt;
        const blocked = m.cells.some(([cx, cy]) => overlap(this.player, { x: cx * TILE, y: cy * TILE, w: TILE, h: TILE }));
        if (m.linger <= 0 && !blocked) {
          m.open = false;
          m.charge = 0;
          this.audio.play('seal', this.#cellsCenter(m));
        }
      }
      // La membrana se anima (entities/Puzzles.js -> PhotoMembrane); el paso se abre a
      // media apertura y se cierra cuando casi ha vuelto a crecer, nunca sobre ti.
      m.view?.update(dt, Math.min(1, m.charge / PHOTO_CHARGE));
      const passable = this.world.get(m.cells[0][0], m.cells[0][1]) === 'F';
      const inside = m.cells.some(([cx, cy]) => overlap(this.player, { x: cx * TILE, y: cy * TILE, w: TILE, h: TILE }));
      if (m.open && !passable && (m.k ?? 1) > 0.55) {
        for (const [cx, cy] of m.cells) this.world.set(cx, cy, 'F');
        changed = true;
      } else if (!m.open && passable && (m.k ?? 0) < 0.45) {
        if (inside) m.k = 0.45; // espera a que te apartes
        else { for (const [cx, cy] of m.cells) this.world.set(cx, cy, 'f'); changed = true; }
      }
    }
    if (changed) this.visual.setRoomSolids(this.world);
  }

  #cellsCenter(m) {
    const [cx, cy] = m.cells[0];
    return { x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE };
  }

  #hints() {
    const p = this.player;
    for (const h of this.room.def.hints ?? []) {
      if (this.room.hintsShown.has(h)) continue;
      const d = Math.hypot(p.cx - (h.x + 0.5) * TILE, p.cy - (h.y + 0.5) * TILE);
      if (d < h.r * TILE) {
        this.room.hintsShown.add(h);
        this.say(h.text, 3.5);
      }
    }
  }

  // Latido del protagonista: más rápido cuanto peor estás. Mueve cámara y viñeta.
  #heartbeat(dt) {
    const st = this.state;
    const hp = st.integrity / Math.max(1, st.maxIntegrity);
    const stress = Math.max(hp < 0.4 ? 1 - hp / 0.4 : 0, st.rejection >= 70 ? (st.rejection - 70) / 30 : 0);
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    if (stress <= 0) return;
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = 1.1 - Math.min(1, stress) * 0.55;
      this.pulse = 0.4 + Math.min(1, stress) * 0.6;
      this.shake = Math.max(this.shake, 1.5);
      this.audio.play('thump');
    }
  }

  #updateCamera(dt, snap = false) {
    const p = this.player, w = this.world, cam = this.visual.cam, m = this.input.mouse;
    // Mira adelantada: hacia el cursor, o hacia donde apunta el stick del mando.
    const look = p.aimMode === 'pad' ? { x: VIEW_W / 2 + Math.cos(p.aim) * 90, y: VIEW_H / 2 + Math.sin(p.aim) * 90 } : m;
    let tx = p.cx - VIEW_W / 2 + (look.x - VIEW_W / 2) * 0.15;
    let ty = p.cy - VIEW_H / 2 + (look.y - VIEW_H / 2) * 0.15;
    tx = w.pixelW <= VIEW_W ? (w.pixelW - VIEW_W) / 2 : Math.max(0, Math.min(w.pixelW - VIEW_W, tx));
    ty = w.pixelH <= VIEW_H ? (w.pixelH - VIEW_H) / 2 : Math.max(0, Math.min(w.pixelH - VIEW_H, ty));
    const k = snap ? 1 : Math.min(1, dt * 8);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  // Viaje a un punto de conexión (o a unas coordenadas): la misma transición que una salida.
  #travel(to, toLink, spawn, portal = false) {
    if (!LEVELS[to]) return;
    const at = (toLink && linkArrival(LEVELS[to], toLink)) ?? spawn ?? START.spawn;
    this.linkLock = toLink ?? null;
    this.mode = 'transition';
    this.transition = { t: 0, exit: { to, spawn: at }, loaded: false };
    if (portal) this.audio.play('womb', this.player); // cruzar un hueco entre salas no suena: un portal sí
  }

  #updateTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    if (!tr.loaded && tr.t >= TRANSITION / 2) {
      tr.loaded = true;
      this.loadRoom(tr.exit.to, tr.exit.spawn);
    }
    this.fade = 1 - Math.abs(tr.t / (TRANSITION / 2) - 1);
    if (tr.t >= TRANSITION) {
      this.fade = 0;
      this.mode = 'play';
    }
  }

  #onDeath(cause) {
    this.mode = 'dead';
    this.deathTimer = 2.2;
    this.say(`TEJIDO PERDIDO (${cause ?? 'desconocido'}). Regresando al último Nodo...`, 2.2);
    this.audio.play('die', this.player);
    const p = this.player;
    // Revientas: tu propio cuerpo (con sus mutaciones) se parte en trozos con física.
    const o = p.bodyOrigin, blood = { blood: '#8a0a14', flesh: ['#c98a5e', '#8a3048', '#34426a', '#e8dcc8'] };
    this.gore.shatter(p.body.canvas, o.x, o.y, p.facing < 0, blood, 9);
    this.gore.burst(p.cx, p.cy, p.w, p.h, blood, 0.8);
    this.audio.play('splat', p);
    this.shake = 8;
    p.mesh.visible = p.selfMesh.visible = p.glowMesh.visible = p.eyeFlare.visible = false;
  }

  #updateDeath(dt) {
    this.audio.stopBossMusic(1.2);
    this.deathTimer -= dt;
    this.particles.update(dt, this.world);
    this.gore.update(dt);
    this.fade = Math.min(1, Math.max(0, 1 - (this.deathTimer - 0.2) / 1.2));
    if (this.deathTimer <= 0) {
      this.state.respawn();
      const cp = this.state.checkpoint;
      this.loadRoom(cp.room, cp.spawn);
      this.player.invuln = 1.5;
      this.fade = 0;
      this.mode = 'play';
      this.#startBirth(cp.spawn); // renaces del útero donde guardaste
    }
  }

  #win() {
    this.mode = 'end';
    const s = this.state.stats;
    this.hud.show(false);
    this.overlay.hidden = false;
    this.overlay.innerHTML = `
      <h1>EL CORAZON</h1>
      <p class="sub">Fin del prototipo</p>
      <ul class="controls">
        <li>Mutaciones: ${this.state.mutations.size} · Rechazo: ${Math.floor(this.state.rejection)}%</li>
        <li>Integridad máxima restante: ${this.state.maxIntegrity}</li>
        <li>Criaturas abatidas: ${s.kills} · Disparos fallados: ${s.missed}/${s.shots}</li>
        <li>Muertes: ${s.deaths}</li>
      </ul>
      <p class="blink">HAZ CLIC PARA VOLVER A EMPEZAR</p>`;
    this.overlay.addEventListener('click', () => location.reload(), { once: true });
  }

  // ---------- Render ----------
  render(dt) {
    this.mapView.draw(this.time);
    this.fadeEl.style.opacity = this.fade;
    if (!this.room) return;
    this.visual.scenery.pulseMesh = this.room.pulseMesh;
    const st = this.state, p = this.player;

    for (const e of this.room.enemies) e.render();
    for (const pk of this.room.pickups) pk.render();
    for (const n of this.room.nodules) n.render();
    for (const s of this.room.sacs) s.render();
    for (const pr of this.projectiles) pr.render();
    this.particles.render();
    this.glowParticles.render();

    // Parpadeo de linterna con poca batería.
    if (st.light < 20 && st.light > 0) {
      if (Math.random() < 0.08) {
        this.flicker = Math.random() < 0.5 ? 0.15 : 0.6;
        if (this.flicker < 0.3) this.audio.play('flicker');
      } else {
        this.flicker += (1 - this.flicker) * 0.2;
      }
    } else {
      this.flicker = 1;
    }

    this.shake = Math.max(0, this.shake - dt * 20);
    const hp = st.integrity / Math.max(1, st.maxIntegrity);
    // Aberración cromática (0..1, el shader la mezcla al 35 % como máximo): solo late con
    // el corazón cuando la integridad está baja o el rechazo es crítico.
    const aberr = (hp < 0.3 || st.critical) ? this.pulse : 0;

    const lp = p.lampPos;
    this.visual.render({
      lightPos: lp,
      aim: p.aim,
      // Sin el Ojo I no hay haz: solo un halo alrededor del cuerpo. Encendido, el halo
      // es algo mayor; sin energía, apenas un resplandor.
      flashOn: st.flashlightOn && st.light > 0 && st.has('eye1'),
      lightLevel: st.light > 0 ? (0.6 + 0.4 * (st.light / 100)) * this.flicker : 0,
      ambR: st.light <= 0 ? 20 : st.flashlightOn ? HALO_R : 42, // mismo halo con o sin Ojo I
      // Sin energía en el ojo, la penumbra se cierra: la carne apenas se intuye.
      range: LIGHT_RANGE * st.mod('lightRange'),
      ambient: this.#ambient(),
      lightColor: this.beamColor,
      eyeColor: this.eyeColor,
      points: this.#pointLights(),
      aberr: Math.min(1, aberr),
      pulse: this.pulse,
      time: this.time,
      shake: { x: (Math.random() - 0.5) * this.shake, y: (Math.random() - 0.5) * this.shake },
    });

    this.audio.setListener(p.cx, p.cy);
    this.hud.update(dt, st, caps(this.room.def.name), this.beamColor);
  }

  // Luces puntuales sin sombra: disparos, nodos, el óptico, el gas alveolar...
  #pointLights() {
    const p = this.player, st = this.state, lights = [];
    for (const f of this.flashes) lights.push({ x: f.x, y: f.y, r: f.r, color: f.color.map((c) => c * (f.t / f.dur) * 0.8) });
    for (const pr of this.projectiles) if (pr.glow) lights.push({ x: pr.cx, y: pr.cy, r: 40, color: pr.glow.map((c) => c * 0.5) });
    // El útero del Nodo ilumina al ritmo de su latido.
    for (const w of this.room.wombs ?? []) lights.push({ x: w.cx, y: w.cy, r: 60 + 25 * w.beat, color: [0.05, 0.22 + 0.2 * w.beat, 0.12] });
    // Los jefes irradian su propia luz, que late con ellos.
    for (const e of this.room.enemies) {
      const L = e.alive && e.def.light;
      if (!L) continue;
      const k = 0.75 + 0.25 * Math.sin(this.time * 3) + (e.exposed ? 0.4 : 0);
      lights.push({ x: e.cx, y: e.cy, r: L.r, color: L.color.map((c) => c * k) });
    }
    const halo = st.flashlightOn && st.light > 0 ? 0.3 : 0.12;
    lights.push({ x: p.lampPos.x, y: p.y - 1, r: 12, color: this.eyeColor.map((c) => c * halo) }); // halo del ojo fotóforo
    if (st.weaponId === 'simbionte' || st.weaponId === 'escopeta') lights.push({ x: p.gunPos.x, y: p.gunPos.y, r: 14, color: [0.3, 0.05, 0.25] }); // cañón vivo
    if (st.mutations.has('alveolos')) lights.push({ x: p.cx, y: p.y + 8, r: 26, color: [0.08, 0.35, 0.14] });
    for (const l of this.room.lamps ?? []) lights.push(l.light()); // luminarias colgantes
    // Consumibles activos: un halo de nácar cian o el verde de la regeneración, que late.
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 9);
    const fading = (left) => left < 2 && Math.floor(left * 8) % 2 === 0; // titila al acabarse
    if (st.timers.shield > 0 && !fading(st.timers.shield)) lights.push({ x: p.cx, y: p.cy, r: 34, color: [0.25 * pulse, 0.55 * pulse, 0.7 * pulse] });
    if (st.timers.regen > 0 && !fading(st.timers.regen)) lights.push({ x: p.cx, y: p.cy, r: 30, color: [0.08, 0.5 * pulse, 0.18] });
    for (const pk of this.room.pickups) {
      if (pk.kind === 'heart') {
        const beat = 0.6 + Math.max(0, Math.sin(this.time * 6)) * 0.6;
        lights.push({ x: pk.cx, y: pk.cy, r: 140, color: [0.55 * beat, 0.04, 0.08] });
      } else if (pk.kind === 'dna') {
        lights.push({ x: pk.cx, y: pk.cy, r: 30, color: [0.25, 0.1, 0.35] });
      }
    }
    lights.sort((a, b) => Math.hypot(a.x - p.cx, a.y - p.cy) - Math.hypot(b.x - p.cx, b.y - p.cy));
    return lights.slice(0, 8);
  }
}
