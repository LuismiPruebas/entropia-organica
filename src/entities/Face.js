import { TILE } from '../core/Physics.js';
import { canvasSprite } from './Puzzles.js';
import { faceData } from '../data/faces.js';
import { paintShrineBase, drawShrine, SW, SH, HEAD } from './ShrineArt.js';

// Rostro del Anfitrión (data/faces.js): un altar de carne monumental (entities/ShrineArt.js)
// con un rostro enorme, un tercer ojo, el pecho abierto y un corazón que late. Mientras
// el jefe de su bioma vive, habla el parásito que lo suplanta (piel enferma, venas
// negras, tumor, ojos rojos abiertos); cuando cae, al acercarte se libera: se aclara,
// cierra los ojos en paz, su sangre corre dorada, te lo agradece, abre las membranas
// 'Z' de su bioma (flag face:<bioma>) y desde entonces te da pistas.
//
// En la sala: faces: [{ x, y, boss?, front? }]. (x, y) es la casilla del centro de la
// base del altar (18 x 15 casillas, hacia arriba). De fondo por defecto: las paredes de
// la sala lo tapan; con front: true se dibuja delante de ellas.

const HEAR = 210;               // distancia (px) al centro del altar a la que te habla
let BASES = null;               // los dos estados pintados (se comparten entre rostros)

export class Face {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.biome = room.def.biome;
    this.data = faceData(this.biome);
    this.boss = def.boss !== undefined ? def.boss : this.data.boss;
    this.flag = `face:${this.biome}`;
    this.x0 = (def.x + 0.5) * TILE - SW / 2;
    this.y0 = (def.y + 1) * TILE - SH;
    this.cx = this.x0 + HEAD.x;                    // la cabeza (de ahí sale la voz)
    this.cy = this.y0 + HEAD.y;
    this.mid = { x: this.x0 + SW / 2, y: this.y0 + SH / 2 };
    const st = game.state;
    // libre: ya te lo agradeció (o no tiene jefe que lo esclavice y ya habló)
    this.state = st.flags.has(this.flag) ? 'free' : this.bossDown ? 'ready' : 'possessed';
    this.k = this.state === 'free' ? 1 : 0;      // 0 poseído, 1 liberado (transición)
    this.t = Math.random() * 5;
    this.talk = 0;                                // segundos que le quedan hablando
    this.next = 0;                                // espera hasta la próxima frase
    this.line = 0;
    BASES ??= [paintShrineBase(0), paintShrineBase(1)];
    const order = def.front ? 2 : -5;
    this.spr = canvasSprite(game, SW, SH, order);
    this.spr.glow.renderOrder = order;
    this.spr.place(this.x0, this.y0);
    this.drawnAt = -1;
  }

  get bossDown() { return !this.boss || this.game.state.flags.has(`boss:${this.boss}`); }
  get center() { return { x: this.cx, y: this.cy }; }

  #say(text, sec) {
    const g = this.game;
    g.say(`«${text}»`, sec);
    this.talk = Math.min(sec, 0.6 + text.length * 0.045);
    g.audio.play(this.k > 0.5 ? 'faceFree' : 'faceSpeak', this.center);
  }

  update(dt) {
    const g = this.game, p = g.player, st = g.state;
    this.t += dt;
    this.talk = Math.max(0, this.talk - dt);
    this.next -= dt;
    const near = Math.hypot(p.cx - this.mid.x, p.cy - this.mid.y) < HEAR;
    if (this.state === 'possessed' && this.bossDown) this.state = 'ready';

    if (this.state === 'possessed') {
      if (near && this.next <= 0) {
        const seen = st.flags.has(`faceSeen:${this.biome}`);
        const list = this.data.taunts;
        const text = seen ? list[1 + Math.floor(Math.random() * Math.max(1, list.length - 1))] ?? list[0] : list[0];
        st.flags.add(`faceSeen:${this.biome}`);
        this.#say(text, 4.5);
        this.next = 9 + Math.random() * 4;
      }
    } else if (this.state === 'ready' && near) {
      // Se libera delante de ti: tiembla, se hincha y se aclara.
      this.state = 'waking';
      this.wake = 0;
      g.audio.play('mutate', this.center);
      g.shake = Math.max(g.shake ?? 0, 4);
    } else if (this.state === 'waking') {
      this.wake += dt;
      this.k = Math.min(1, this.wake / 2.2);
      if (Math.random() < 0.6) this.#spark(1);
      if (this.wake >= 2.2 && !this.thanked) {
        this.thanked = true;
        this.#say(this.data.thanks, 6);
        this.openAt = this.wake + 6.2;
      }
      if (this.thanked && this.wake >= this.openAt) {
        this.state = 'free';
        st.flags.add(this.flag);
        this.#openMembranes();
        if (this.data.opens) this.#say(this.data.opens, 4.5);
        this.next = 7;
      }
    } else if (this.state === 'free') {
      if (near && this.next <= 0 && this.data.hints.length) {
        const i = st.faceHints?.[this.biome] ?? 0;
        (st.faceHints ??= {})[this.biome] = (i + 1) % this.data.hints.length;
        this.#say(this.data.hints[i], 6);
        this.next = 14 + Math.random() * 4;
      }
      if (Math.random() < 0.05) this.#spark(1);
    }
    // Si te alejas, la próxima vez te habla enseguida.
    if (!near && this.next > 2) this.next = Math.min(this.next, 2);

    if (this.t - this.drawnAt >= 1 / 20) { this.drawnAt = this.t; this.#draw(); }
  }

  #spark(n) {
    const g = this.game;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 18;
      g.glowParticles.emit(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, { vx: Math.cos(a) * 20, vy: Math.sin(a) * 20 - 15, life: 0.8, color: [1, 0.82, 0.5] });
    }
  }

  // Abre las membranas 'Z' de esta sala que dependen de este rostro (las de las demás
  // salas ya salen abiertas al entrar: EntityFactory).
  #openMembranes() {
    const g = this.game, room = this.room, w = room.world;
    if ((room.def.faceSeal ?? room.def.biome) !== this.biome) return;
    let any = false;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      if (w.get(x, y) !== 'Z') continue;
      w.set(x, y, '.');
      any = true;
      for (let i = 0; i < 5; i++) {
        g.particles.emit(x * TILE + Math.random() * 16, y * TILE + Math.random() * 16, { vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 70, life: 1, gravity: 300, color: [0.55, 0.3, 0.6] });
        g.glowParticles.emit(x * TILE + Math.random() * 16, y * TILE + Math.random() * 16, { vx: (Math.random() - 0.5) * 30, vy: -20, life: 0.9, color: [0.8, 0.6, 1] });
      }
    }
    if (any) {
      g.audio.play('tear', this.center);
      g.factory.refresh(room);
    }
  }

  #draw() {
    const p = this.game.player, t = this.t;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
    // Latido: más rápido y nervioso poseído; lento y hondo liberado.
    const period = this.k > 0.5 ? 1.25 : 0.82;
    const talk = this.talk > 0 ? 0.35 + Math.abs(Math.sin(t * (this.k > 0.5 ? 8 : 12))) * 0.65 : 0;
    drawShrine(this.spr.g, this.spr.gl, { bases: BASES, k: this.k, t, beat: (t % period) / period, talk, look: [dx / d, dy / d] });
    // Liberándose: tiembla.
    const shake = this.state === 'waking' && this.wake < 2.2 ? (Math.random() - 0.5) * 3 : 0;
    this.spr.place(this.x0 + shake, this.y0);
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}
