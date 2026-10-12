import { getSprite, spriteMesh, placeMesh } from '../core/Sprites.js';
import { MUTATIONS, LINES, ROMAN, linesOf } from '../data/mutations.js';
import { CELL_CHARGE, ITEMS } from '../state/State.js';

// 'ojo II', 'extremidades + torso III': de qué órgano es una secuencia, sin desvelarla.
export const dnaTag = (id) => { const m = MUTATIONS[id]; return `${linesOf(m).map((l) => LINES[l].name.toLowerCase()).join(' + ')} ${ROMAN[m.level]}`; };

// Hueso por cada pieza recogida (o soltada por un nódulo): munición de las astillas.
export const SCRAP_PER_PIECE = 12;

// Qué hace cada recurso al recogerlo. Añadir un tipo = añadir una entrada.
export const PICKUPS = {
  biomass: { sprite: 'biomass', apply: (st, p) => st.addBiomass(p.amount ?? 8), sound: 'pickup' },
  // Con el ojo casi lleno (95% o más) la célula se guarda en la reserva; si no, se consume al momento.
  battery: {
    sprite: 'battery',
    sound: 'pickup',
    apply: (st, p) => {
      p.stored = st.light >= 95;
      if (p.stored) st.cells++;
      else st.light = Math.min(100, st.light + CELL_CHARGE);
    },
    text: (p, st) => p.stored ? `Célula lumínica guardada (${st.cells} en reserva): recargará tu ojo cuando se apague` : 'Célula lumínica: tu ojo la devora y vuelve a brillar',
  },
  // Consumibles raros: se guardan y se usan cuando quieras.
  shield: {
    sprite: 'pearl', sound: 'dna',
    apply: (st) => { st.items.shield++; },
    text: (p, st) => `Perla de Nácar (${st.items.shield}): úsala ${p.game.itemKey('shield')} y nada te herirá durante ${ITEMS.shield.time} s.`,
  },
  regen: {
    sprite: 'stemcell', sound: 'dna',
    apply: (st) => { st.items.regen++; },
    text: (p, st) => `Célula Madre (${st.items.regen}): úsala ${p.game.itemKey('regen')} y tu tejido se regenerará durante ${ITEMS.regen.time} s.`,
  },
  scrap: { sprite: 'scrap', apply: (st) => { st.scrap += SCRAP_PER_PIECE; }, sound: 'pickup', text: `Esquirlas de hueso: +${SCRAP_PER_PIECE}` },
  oxygen: { sprite: 'oxygen', apply: (st) => { st.oxygen = Math.min(st.oxygenMax, st.oxygen + 40); }, sound: 'pickup', text: 'Filtro de oxígeno: +40 O2' },
  cyst: {
    sprite: 'cyst',
    sound: 'dna',
    apply: (st) => { st.biomassBase += 20; st.biomass = st.biomassMax; },
    text: 'Quiste de reserva: +20 biomasa máxima.',
  },
  fragment: {
    sprite: 'fragment',
    sound: 'pickup',
    apply: (st, p) => st.addFragment(p.frag),
  },
  thymus: {
    sprite: 'thymus',
    sound: 'dna',
    apply: (st) => { st.extenders++; },
    text: 'Timo Necrótico: tu sistema inmune olvida pelear. Un extensor gratis: toleras más carga genética (+1).',
  },
  tissue: {
    sprite: 'tissue',
    sound: 'dna',
    apply: (st) => { st.corrupted = Math.max(0, st.corrupted - 10); st.heal(10); },
    text: 'Tejido sano: recuperas 10 de integridad corrupta.',
  },
  dna: {
    sprite: 'dna',
    sound: 'dna',
    apply: (st, p) => st.dna.add(p.mutation),
    text: (p) => `ADN latente de tu ${dnaTag(p.mutation)}. Aún no es tuyo: no sabrás qué te hace hasta asimilarlo en el útero de un Nodo Seguro (E).`,
  },
  heart: { sprite: 'heart', size: 2, apply: () => {}, sound: 'node' },
};

export class Pickup {
  constructor(game, kind, x, y, extra = {}) {
    this.game = game;
    this.kind = kind;
    this.def = PICKUPS[kind];
    Object.assign(this, extra);
    const s = getSprite(this.def.sprite, 'a');
    const scale = this.def.size ?? 1;
    this.sw = s.w * scale;
    this.sh = s.h * scale;
    this.w = this.sw;
    this.h = this.sh;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.baseY = this.y;
    this.t = Math.random() * 6;
    this.alive = true;
    // Objetos ocultos: invisibles hasta que el haz del ojo los alumbra (Game.#reveal).
    this.reveal = 0;
    this.revealed = !this.hidden;
    this.mesh = spriteMesh(this.sw, this.sh);
    this.mesh.material.map = s.tex;
    this.mesh.renderOrder = 2;
    game.visual.world.add(this.mesh);
    if (s.glowTex) {
      this.glowMesh = spriteMesh(this.sw, this.sh, { glow: true });
      this.glowMesh.material.map = s.glowTex;
      game.visual.glow.add(this.glowMesh);
    }
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt) {
    this.t += dt;
    // Lo que sueltan los enemigos cae hasta el suelo antes de quedarse flotando.
    if (this.falling) {
      this.vx = 0;
      this.vy = Math.min(300, (this.vy ?? 0) + 600 * dt);
      this.game.world.move(this, dt);
      if (this.onGround) {
        this.falling = false;
        this.baseY = this.y - 3;
      }
      return;
    }
    this.y = this.baseY + Math.round(Math.sin(this.t * 3) * 1.5);
  }

  collect() {
    const g = this.game;
    this.def.apply(g.state, this);
    g.audio.play(this.def.sound, this);
    const text = typeof this.def.text === 'function' ? this.def.text(this, g.state) : this.def.text;
    if (text) g.say(text, 2.5);
    if (this.key) g.state.collected.add(this.key);
    this.alive = false;
    this.dispose();
  }

  render() {
    // Mientras se revela, parpadea como una interferencia; después queda fijo.
    const shown = this.revealed || Math.random() < Math.max(this.reveal, this.glimmer ?? 0);
    this.mesh.visible = shown;
    placeMesh(this.mesh, this.x, this.y, this.sw, this.sh);
    if (this.glowMesh) {
      this.glowMesh.visible = shown;
      placeMesh(this.glowMesh, this.x, this.y, this.sw, this.sh);
      this.glowMesh.material.opacity = 0.6 + Math.sin(this.t * 4) * 0.4;
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.glowMesh?.removeFromParent();
  }
}
