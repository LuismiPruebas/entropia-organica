import { TILE } from '../core/Physics.js';
import { canvasSprite } from './Puzzles.js';
import { faceData } from '../data/faces.js';
import { paintShrineBase, drawShrine, SW, SH, HEAD } from './ShrineArt.js';

// Rostro del Anfitrión (data/faces.js): un altar de carne monumental (entities/ShrineArt.js)
// con un rostro enorme, un tercer ojo, el pecho abierto y un corazón que late. Mientras
// el jefe de su bioma vive, habla el parásito que lo suplanta (piel enferma, venas
// negras, tumor, ojos rojos abiertos); cuando cae, al acercarte se libera: se aclara,
// cierra los ojos en paz, su sangre corre dorada, te lo agradece, abre las membranas
// (flag face:<bioma>) y desde entonces te da pistas.
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
    // Textos: los de su bioma (data/faces.js), salvo los que se hayan cambiado para este
    // rostro en el editor (taunts, thanks, opens, hints en su definición).
    const base = faceData(this.biome);
    this.data = { ...base };
    for (const k of ['taunts', 'thanks', 'opens', 'hints']) if (def[k] !== undefined) this.data[k] = def[k];
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
    g.hud.bark(text, sec, { speaker: 'El Anfitrión', owner: this });
    this.talk = Math.min(sec, 0.6 + text.length * 0.045);
    g.audio.play(this.k > 0.5 ? 'faceFree' : 'faceSpeak', this.center);
  }

  // Habla en un diálogo (se queda hasta que pases); mueve la boca mientras se escribe.
  #talk(lines, onLine, onEnd) {
    const g = this.game;
    g.dialogue(lines, {
      speaker: 'El Anfitrión', owner: this,
      onLine: (i) => { g.audio.play(this.k > 0.5 ? 'faceFree' : 'faceSpeak', this.center); onLine?.(i); },
      onEnd,
    });
  }

  // Liberado del todo: su marca y sus membranas.
  #free() {
    if (this.state === 'free') return;
    this.state = 'free';
    this.k = 1;
    this.game.state.flags.add(this.flag);
  }

  update(dt) {
    const g = this.game, p = g.player, st = g.state;
    this.t += dt;
    // Mientras se escribe su diálogo, la boca se mueve.
    if (g.hud.dlg?.owner === this && g.hud.typing) this.talk = Math.max(this.talk, 0.2);
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
        // Te lo agradece (y abre sus membranas al decirlo); se queda hasta que pases.
        this.#talk([this.data.thanks, this.data.opens], (i) => { if (i === 1) this.#free(); }, () => { this.#free(); this.next = 9; });
      }
      // Por si su agradecimiento no llegó a mostrarse o se cerró sin liberarlo: queda libre igual
      // (cerrar la conversación cuenta como haberla leído).
      else if (this.thanked && g.hud.dlg?.owner !== this) { this.#free(); this.next = 9; }
    } else if (this.state === 'free') {
      if (near && this.next <= 0 && this.data.hints.length && !g.hud.dialogueActive) {
        const i = st.faceHints?.[this.biome] ?? 0;
        (st.faceHints ??= {})[this.biome] = (i + 1) % this.data.hints.length;
        this.next = 999;                                  // la siguiente, al cerrar esta
        this.#talk([this.data.hints[i]], null, () => { this.next = 14 + Math.random() * 4; });
      }
      if (Math.random() < 0.05) this.#spark(1);
    }
    // Si te alejas, la próxima vez te habla enseguida.
    if (!near && this.next > 2) this.next = Math.min(this.next, 2);

    this.#animate(dt);
    if (this.t - this.drawnAt >= 1 / 30) { this.drawnAt = this.t; this.#draw(); }
  }

  #spark(n) {
    const g = this.game;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 18;
      g.glowParticles.emit(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, { vx: Math.cos(a) * 20, vy: Math.sin(a) * 20 - 15, life: 0.8, color: [1, 0.82, 0.5] });
    }
  }

  // Gestos: mirada con sacádicos, parpadeos, pupila, chasquidos de dientes y, ya libre,
  // los ojos que se entreabren de vez en cuando. Avanza con dt real (lo llama update).
  #animate(dt) {
    const p = this.game.player, A = (this.anim ??= { lx: 0, ly: 0, tx: 0, ty: 0, next: 0, blink: 0, bt: 3, b3: 0, b3t: 5, snap: 0, st: 4, open: 0, ot: 8, pupil: 1, wide: 0, talk: 0 });
    const host = this.k > 0.5, talking = this.talk > 0;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
    // Mirada: salta (rápido) a un punto nuevo cada poco; el parásito casi siempre a ti.
    if ((A.next -= dt) <= 0) {
      const toYou = host ? Math.random() < 0.4 : Math.random() < 0.8;
      A.tx = toYou ? dx / d : Math.random() * 2 - 1;
      A.ty = toYou ? dy / d : Math.random() * 1.4 - 0.7;
      A.next = host ? 1.5 + Math.random() * 2.5 : 0.25 + Math.random() * 1.1;
    }
    const sp = Math.min(1, dt * (host ? 4 : 22));
    A.lx += (A.tx - A.lx) * sp; A.ly += (A.ty - A.ly) * sp;
    // Parpadeo (0 abierto, 1 cerrado): cierra rápido y abre algo más lento.
    if ((A.bt -= dt) <= 0) { A.blinkT = 0; A.bt = 2.2 + Math.random() * 4 + (Math.random() < 0.2 ? -1.8 : 0); }
    if (A.blinkT !== undefined) { A.blinkT += dt; const u = A.blinkT / 0.2; A.blink = u < 0.4 ? u / 0.4 : u < 1 ? 1 - (u - 0.4) / 0.6 : 0; if (u >= 1) A.blinkT = undefined; }
    if ((A.b3t -= dt) <= 0) { A.b3T = 0; A.b3t = 3 + Math.random() * 6; }
    if (A.b3T !== undefined) { A.b3T += dt; const u = A.b3T / 0.3; A.b3 = u < 0.5 ? u * 2 : u < 1 ? 2 - u * 2 : 0; if (u >= 1) A.b3T = undefined; }
    // Pupila: se dilata al hablar o si lo tienes cerca.
    const wantP = 1 + (talking ? 0.5 : 0) + (d < 120 ? 0.3 : 0);
    A.pupil += (wantP - A.pupil) * Math.min(1, dt * 3);
    // Chasquido de dientes del parásito (callado): abre de golpe y cierra con un clac.
    if (!host && !talking && (A.st -= dt) <= 0) { A.snapT = 0; A.st = 3 + Math.random() * 5; }
    if (A.snapT !== undefined) {
      A.snapT += dt; const u = A.snapT / 0.45;
      A.snap = u < 0.6 ? u / 0.6 : u < 0.75 ? 0.9 : u < 1 ? 1 - (u - 0.75) / 0.25 : 0;
      if (u >= 0.75 && !A.clacked) { A.clacked = true; this.game.audio.play('crunch', this.center); }
      if (u >= 1) { A.snapT = undefined; A.clacked = false; }
    }
    // Libre: de vez en cuando entreabre los ojos un par de segundos.
    if (host && (A.ot -= dt) <= 0) { A.oT = 0; A.ot = 7 + Math.random() * 6; }
    if (A.oT !== undefined) { A.oT += dt; const u = A.oT / 3.2; A.open = u < 0.3 ? u / 0.3 : u < 0.75 ? 1 : u < 1 ? 1 - (u - 0.75) / 0.25 : 0; if (u >= 1) A.oT = undefined; }
    // Habla por sílabas: cada una con su apertura; pausas breves de vez en cuando.
    if (talking) {
      const sy = this.t * (host ? 6 : 7.5), i = Math.floor(sy), h = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1;
      A.talk = h < 0.12 ? 0.08 : (0.35 + 0.65 * h) * Math.sin(Math.PI * (sy - i));
    } else A.talk = Math.max(0, (A.talk ?? 0) - dt * 6);
    A.wide += ((talking && !host ? 1 : 0) - A.wide) * Math.min(1, dt * 5);
  }

  #draw() {
    const t = this.t, A = this.anim ?? {};
    // Latido: más rápido y nervioso poseído; lento y hondo liberado.
    const period = this.k > 0.5 ? 1.25 : 0.82;
    drawShrine(this.spr.g, this.spr.gl, {
      bases: BASES, k: this.k, t, beat: (t % period) / period,
      talk: A.talk ?? 0, look: [A.lx ?? 0, A.ly ?? 0], blink: A.blink ?? 0, blink3: A.b3 ?? 0,
      pupil: A.pupil ?? 1, wide: A.wide ?? 0, snap: A.snap ?? 0, hostOpen: A.open ?? 0,
    });
    // Liberándose: tiembla.
    const shake = this.state === 'waking' && this.wake < 2.2 ? (Math.random() - 0.5) * 3 : 0;
    this.spr.place(this.x0 + shake, this.y0);
    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}
