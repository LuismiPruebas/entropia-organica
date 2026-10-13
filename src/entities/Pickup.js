import { getSprite, spriteMesh, placeMesh } from '../core/Sprites.js';
import { MUTATIONS, LINES, ROMAN, linesOf } from '../data/mutations.js';
import { ITEMS, THYMUS_MAX } from '../state/State.js';

// 'ojo II', 'extremidades + torso III': de qué órgano es una secuencia, sin desvelarla.
export const dnaTag = (id) => { const m = MUTATIONS[id]; return `${linesOf(m).map((l) => LINES[l].name.toLowerCase()).join(' + ')} ${ROMAN[m.level]}`; };

// Hueso por cada pieza recogida (o soltada por un nódulo): munición de las astillas.
export const SCRAP_PER_PIECE = 12;

// Qué hace cada recurso al recogerlo. Añadir un tipo = añadir una entrada.
export const PICKUPS = {
  biomass: { sprite: 'biomass', apply: (st, p) => st.addBiomass(p.amount ?? 8), sound: 'pickup' },
  // Siempre recarga el ojo al 100 %; con el ojo a State.CELL_STORE_FROM o más, además se guarda.
  battery: {
    sprite: 'battery',
    sound: 'pickup',
    apply: (st, p) => { p.stored = st.gainCell(); },
    text: (p, st) => p.stored ? `Célula lumínica: tu ojo vuelve a brillar y guardas una (${st.cells} en reserva)` : 'Célula lumínica: tu ojo la devora y vuelve a brillar',
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
    apply: (st, p) => { p.had = st.thymus; st.addThymus(); },
    text: (p, st) => (p.had >= THYMUS_MAX
      ? 'Timo Necrótico: tu cuerpo ya no rechaza nada; este se deshace sin efecto.'
      : [
        '',
        'Timo Necrótico (1/3): tu sistema inmune olvida pelear. El rechazo crece más despacio y tarda más en hacerte fallar.',
        'Timo Necrótico (2/3): tu cuerpo acepta mejor la carne ajena. El rechazo se arrastra.',
        'Timo Necrótico (3/3): tu sistema inmune calla para siempre. El rechazo ya no existe.',
      ][st.thymus]),
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
    text: (p) => `ADN latente: ${MUTATIONS[p.mutation].name} (${dnaTag(p.mutation)}). Asimílalo en el útero de un Nodo Seguro.`,
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
    // Oculto: con el Ojo I se intuye como un fantasma (silueta translúcida y pálida que
    // ondula); aún no se puede coger. Solo el Ojo Pineal lo materializa.
    if (this.hidden) {
      this.ghostMesh = spriteMesh(this.sw, this.sh, { glow: true, color: '#7f9cd8' });
      this.ghostMesh.material.map = s.tex;
      this.ghostMesh.visible = false;
      game.visual.glow.add(this.ghostMesh);
    }
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt) {
    this.t += dt;
    if (this.noTake > 0) this.noTake -= dt;
    // Lo que sueltan enemigos y nódulos salta en un arco y cae hasta el suelo antes de
    // quedarse flotando.
    if (this.falling) {
      this.vx = (this.vx ?? 0) * (1 - Math.min(1, dt * 2));
      this.vy = Math.min(300, (this.vy ?? 0) + 600 * dt);
      this.game.world.move(this, dt);
      if (this.onGround) {
        this.falling = false;
        this.vx = 0;
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
    // Fantasma (Ojo I): translúcido, respira y ondula; nunca sólido.
    const ghost = !this.revealed && (this.glimmer ?? 0) > 0.01 && this.reveal < 0.05;
    if (this.ghostMesh) {
      this.ghostMesh.visible = ghost;
      if (ghost) {
        placeMesh(this.ghostMesh, this.x + Math.round(Math.sin(this.t * 5) * 1), this.y, this.sw, this.sh);
        this.ghostMesh.material.opacity = (this.glimmer / 0.35) * (0.28 + 0.14 * Math.sin(this.t * 3));
      }
    }
    // Mientras el Ojo Pineal lo revela, parpadea como una interferencia; después queda fijo.
    const shown = this.revealed || (!ghost && Math.random() < this.reveal);
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
    this.ghostMesh?.removeFromParent();
  }
}
