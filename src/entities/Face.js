import { TILE } from '../core/Physics.js';
import { px, seg, blob, part, mix } from './Rig.js';
import { canvasSprite } from './Puzzles.js';
import { faceData } from '../data/faces.js';

// Rostro del Anfitrión (data/faces.js): un bulbo de carne con cara humanoide, cosido a
// las paredes por cordones. Mientras el jefe de su bioma vive, habla el parásito que lo
// suplanta (piel enferma, tumores, ojos rojos); cuando cae, al acercarte se libera: se
// hincha y se aclara, te lo agradece, abre las membranas 'Z' de su bioma (flag
// face:<bioma>) y desde entonces te da pistas.
//
// En la sala: faces: [{ x, y, boss? }] con (x, y) el centro del rostro, en casillas.

const S = 176;                  // lienzo (cordones incluidos), con el rostro en el centro
const C = S / 2;
const HEAR = 150;               // distancia (px) a la que te habla
const K = '#140c10';

export class Face {
  constructor(game, room, def) {
    this.game = game;
    this.room = room;
    this.def = def;
    this.biome = room.def.biome;
    this.data = faceData(this.biome);
    this.boss = def.boss !== undefined ? def.boss : this.data.boss;
    this.flag = `face:${this.biome}`;
    this.cx = def.x * TILE + TILE / 2;
    this.cy = def.y * TILE + TILE / 2;
    const st = game.state;
    // libre: ya te lo agradeció (o no tiene jefe que lo esclavice y ya habló)
    this.state = st.flags.has(this.flag) ? 'free' : this.bossDown ? 'ready' : 'possessed';
    this.k = this.state === 'free' ? 1 : 0;      // 0 poseído, 1 liberado (transición)
    this.t = Math.random() * 5;
    this.talk = 0;                                // segundos que le quedan hablando
    this.next = 0;                                // espera hasta la próxima frase
    this.line = 0;
    this.spr = canvasSprite(game, S, S, 1);
    this.spr.place(this.cx - C, this.cy - C);
    this.anchors = this.#findAnchors(room.world);
    this.drawnAt = -1;
  }

  get bossDown() { return !this.boss || this.game.state.flags.has(`boss:${this.boss}`); }
  get center() { return { x: this.cx, y: this.cy }; }

  // Cordones hasta la pared: rayos en varias direcciones; se queda con los que tocan roca.
  #findAnchors(world) {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      const x1 = this.cx + Math.cos(a) * (C - 6), y1 = this.cy + Math.sin(a) * (C - 6);
      const hit = world.raycast(this.cx, this.cy, x1, y1);
      if (hit && hit.t > 0.2) out.push({ a, x: hit.x - this.cx + C, y: hit.y - this.cy + C, w: 3 + (i % 3) });
    }
    // Sin paredes cerca: cuelga de arriba.
    if (!out.length) out.push({ a: -Math.PI / 2, x: C, y: 2, w: 4 });
    return out;
  }

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
    const near = Math.hypot(p.cx - this.cx, p.cy - this.cy) < HEAR;
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
    const { g, gl } = this.spr, t = this.t, k = this.k;
    g.clearRect(0, 0, S, S);
    gl.clearRect(0, 0, S, S);
    const p = this.game.player;
    const waking = this.state === 'waking' && this.wake < 2.2;
    const jx = waking ? (Math.random() - 0.5) * 3 * (1 - k * 0.5) : 0;
    const breathe = Math.sin(t * (1.4 - k * 0.5)) * (1.2 + k);
    const sc = 1 + k * 0.32;                         // liberado: se magnifica
    const cx = C + jx, cy = C;
    // Colores: piel enferma y morada (parásito) → carne clara y cálida (anfitrión).
    const skin = mix('#7a4a5a', '#d49a92', k), skinD = mix('#4a2234', '#9a5a5e', k), skinH = mix('#9a6070', '#f2c4b4', k);
    const cord = mix('#4a2234', '#8a4a52', k), cordH = mix('#6a3448', '#c8786e', k);

    // Cordones que lo cosen al sistema (se mecen poco; liberado, les corre luz).
    for (const [i, an] of this.anchors.entries()) {
      const sway = Math.sin(t * 0.9 + i) * 2;
      const mx = (cx + an.x) / 2 + Math.cos(an.a + Math.PI / 2) * (6 + sway), my = (cy + an.y) / 2 + Math.sin(an.a + Math.PI / 2) * (6 + sway);
      const n = 14;
      let lx = cx + Math.cos(an.a) * 18 * sc, ly = cy + Math.sin(an.a) * 22 * sc;
      for (let s = 1; s <= n; s++) {
        const u = s / n, v = 1 - u;
        const x = v * v * lx + 2 * v * u * mx + u * u * an.x, y = v * v * ly + 2 * v * u * my + u * u * an.y;
        const w = Math.max(2, Math.round(an.w * (1.2 - u * 0.5)));
        seg(g, lx, ly, x, y, K, w + 2);
        seg(g, lx, ly, x, y, s % 3 ? cord : cordH, w);
        // Impulso que corre hacia el rostro (dorado si está libre, verdoso y enfermo si no).
        if (Math.floor((t * 6 + i * 1.7) % n) === n - s) { px(gl, x - 1, y - 1, k > 0.5 ? '#ffd27a' : '#6a8a3a', 3, 3); px(g, x, y, k > 0.5 ? '#ffe8b0' : '#9ab040'); }
        lx = x; ly = y;
      }
      blob(g, an.x, an.y, 3, 3, cordH, K);   // donde se hunde en la pared
    }

    // Halo del anfitrión liberado.
    if (k > 0) {
      const r = (30 + Math.sin(t * 1.3) * 2) * sc;
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        if ((a + Math.floor(t * 4)) % 4 === 0) continue;
        px(gl, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 1.1, k > 0.6 ? '#ffd27a' : '#a07a40', 2, 2);
      }
    }

    // Bulbo: una cabeza hinchada, más alta que ancha, con la mandíbula colgando.
    const rx = (22 + breathe * 0.4) * sc, ry = (27 + breathe * 0.6) * sc;
    part(g, cx, cy, rx, ry, skin, skinD);
    // Luz propia tenue para que se lea en la penumbra (enfermiza o cálida).
    blob(gl, cx, cy, rx * 0.9, ry * 0.9, mix('#1a0c18', '#3a2210', k));
    // Venas de la piel.
    for (let v = 0; v < 6; v++) {
      const a = (v / 6) * Math.PI * 2 + 0.4;
      let x = cx + Math.cos(a) * rx * 0.95, y = cy + Math.sin(a) * ry * 0.95;
      for (let s = 0; s < 6; s++) {
        const nx = x - Math.cos(a) * 3 + Math.sin(s * 1.7 + v) * 1.5, ny = y - Math.sin(a) * 3 + Math.cos(s * 1.3 + v) * 1.5;
        seg(g, x, y, nx, ny, k > 0.5 ? mix('#c06a72', '#ffb08a', Math.sin(t * 2 + v) * 0.5 + 0.5) : '#3a1a2a', 1);
        if (k > 0.5 && s === 2) px(gl, nx, ny, '#7a4a20');
        x = nx; y = ny;
      }
    }

    // El parásito: masa tumoral que le come media cara, con pústulas que laten.
    const tumor = 1 - k;
    if (tumor > 0.02) {
      const tx = cx + rx * 0.45, ty = cy - ry * 0.2;
      blob(g, tx, ty, 11 * tumor + 1, 13 * tumor + 1, '#3a1e30', '#24101e');
      for (let i = 0; i < 7; i++) {
        const a = i * 2.3, r = 7 * tumor;
        const bx = tx + Math.cos(a) * r, by = ty + Math.sin(a) * r * 1.2, pulse = Math.sin(t * 3 + i) > 0.3;
        blob(g, bx, by, 2.2 * tumor + 0.5, 2.2 * tumor + 0.5, pulse ? '#9ab040' : '#6a7a30', '#3a4418');
        if (pulse) px(gl, bx, by, '#5a7a1a', 2, 2);
      }
      // Raíces negras que se extienden por la frente.
      for (let i = 0; i < 4; i++) seg(g, tx, ty, tx - (8 + i * 4) * tumor, ty - 12 + i * 7 + Math.sin(t + i) * 1.5, '#24101e', 1);
    }

    // Rasgos humanoides.
    const look = Math.atan2(p.cy - cy - this.cy + C, p.cx - cx - this.cx + C);
    const lx = Math.cos(look) * 1.5, ly = Math.sin(look) * 1.2;
    const eyeY = cy - 6 * sc, eyeD = 9 * sc;
    // Arco de las cejas.
    seg(g, cx - eyeD - 5, eyeY - 5 * sc + (k > 0.5 ? 0 : 2), cx - 3, eyeY - 4 * sc - (k > 0.5 ? 0 : 1), skinD, 2);
    seg(g, cx + eyeD + 5, eyeY - 5 * sc + (k > 0.5 ? 0 : 2), cx + 3, eyeY - 4 * sc - (k > 0.5 ? 0 : 1), skinD, 2);
    const blink = k > 0.5 && (t % 5.5) < 0.12;
    for (const s of [-1, 1]) {
      const ex = cx + s * eyeD, ey = eyeY;
      blob(g, ex, ey, 5 * sc, 3.5 * sc, '#1a0a12');          // cuenca hundida
      if (blink) { seg(g, ex - 4 * sc, ey, ex + 4 * sc, ey, skinD, 2); continue; }
      if (k < 0.5) {
        // Poseído: una raja roja que no parpadea.
        const c = Math.sin(t * 7 + s) > -0.6 ? '#ff3020' : '#a01810';
        seg(g, ex - 2.5 * sc + lx, ey + ly, ex + 2.5 * sc + lx, ey + ly, c, 2);
        px(gl, ex - 3 + lx, ey - 1 + ly, '#ff2010', 6, 3);
      } else {
        // Libre: ojo abierto, iris dorado y sereno.
        blob(g, ex, ey, 3.5 * sc, 2.6 * sc, '#efe4d0');
        blob(g, ex + lx, ey + ly, 1.8 * sc, 1.8 * sc, '#d8a040');
        px(g, ex + lx, ey + ly, K, 2, 2);
        blob(gl, ex + lx, ey + ly, 2 * sc, 2 * sc, '#ffc860');
      }
    }
    // Nariz: dos rendijas.
    px(g, cx - 2, cy + 2 * sc, '#2a1018', 1, 3); px(g, cx + 1, cy + 2 * sc, '#2a1018', 1, 3);
    seg(g, cx, eyeY + 2, cx - 1, cy + 2 * sc, skinH, 1);
    // Boca: se abre al hablar (poseída, mueca torcida; libre, suave).
    const open = this.talk > 0 ? 0.35 + Math.abs(Math.sin(t * (k > 0.5 ? 9 : 13))) * 0.65 : (k > 0.5 ? 0.08 : 0.15 + Math.sin(t * 1.1) * 0.05);
    const my = cy + 12 * sc, mw = 8 * sc, mh = 1 + open * 6 * sc, tilt = k > 0.5 ? 0 : 1.5;
    blob(g, cx, my, mw + 1, mh + 1, skinD);
    blob(g, cx, my, mw, mh, '#1a060c');
    if (mh > 2) {
      for (let i = -3; i <= 3; i++) {
        px(g, cx + i * 2.2 - 0.5, my - mh + 1 - (i * tilt) / 3, '#e8dcc8', 1, k > 0.5 ? 1 : 2);
        px(g, cx + i * 2.2 - 0.5, my + mh - 2 + (i * tilt) / 3, '#d8c8a8', 1, k > 0.5 ? 1 : 2);
      }
      px(gl, cx - 2, my, k > 0.5 ? '#a06020' : '#601010', 4, 2);
    }
    // Labio con grietas (poseído) o pleno (libre).
    seg(g, cx - mw, my - mh * 0.2 + tilt, cx + mw, my - mh * 0.2 - tilt, skinH, 1);

    this.spr.commit();
  }

  dispose() { this.spr.dispose(); }
}
