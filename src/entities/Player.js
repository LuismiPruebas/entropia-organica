import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { MUTATIONS } from '../data/mutations.js';
import { spriteMesh, placeMesh, setMap, canvasTexture } from '../core/Sprites.js';
import { PlayerBody, BODY_W, BODY_H, CROUCH_DROP } from './PlayerBody.js';
import { TILE, overlap } from '../core/Physics.js';
import { INFECTION, OXYGEN_COST, BLADE } from '../state/State.js';

export const GRAVITY = 900;
const JUMP_V = 320;
const MOVE = 92;
const MAX_FALL = 380;
const SWIM_SINK = 34;      // velocidad a la que te hundes en el fluido
const SWIM_STROKE = 165;   // impulso de cada brazada (el salto, dentro del fluido)
const SWIM_SPEED = 0.6;    // en el fluido avanzas más despacio
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;
const DASH_SPEED = 270;
const DASH_TIME = 0.18;
const GHOST_LIFE = 0.22;   // lo que tarda en desvanecerse cada silueta de la estela
const GRAPPLE_RANGE = 135;
// Tendón como cuerda de péndulo: te balanceas desde el anclaje.
const ROPE_MIN = 18;        // longitud mínima (pegado al esfínter)
const ROPE_REEL = 110;      // px/s al recoger (W) o soltar (S) cuerda
const ROPE_YANK = 520;      // al engancharte, la cuerda se recoge deprisa (px/s) hasta ROPE_COMFY
const ROPE_COMFY = [42, 74]; // longitud cómoda para columpiarse (mín, máx)
const SWING_PUMP = 520;     // aceleración de A/D al bombear, a lo largo del arco
const SWING_KEEP = 140;     // sin tocar nada, el péndulo no se apaga (empuje suave en su sentido)
const SWING_DRAG = 0.05;    // rozamiento del aire en el balanceo (por segundo)
const SWING_KICK = 150;     // empujón al engancharte casi parado (hacia donde miras)
const CATCH_TIME = 0.9;     // tras soltarte, este rato te enganchas solo al siguiente garfio
const SWING_MAX = 460;
const RELEASE_BOOST = 130;  // impulso hacia arriba al soltarte con Espacio
const TENDON_DAMAGE = 8;   // arponear a una criatura
const RAM_DAMAGE = 12;     // la embestida atraviesa y hiere
// Cañón Simbionte: ráfagas automáticas.
const BURST_SIZE = 3;          // espinas por ráfaga
const BURST_GAP = 0.07;        // segundos entre espinas de una ráfaga
const BURST_REST = 0.2;        // pausa entre ráfagas
const BURSTS_PER_BIOMASS = 2;  // ráfagas por cada punto de biomasa
// Cuerpo a cuerpo: siempre disponible como último recurso.
const MELEE_ABSORB = 3;      // biomasa que absorbes por golpe acertado
const MELEE_DAMAGE = 14;     // culatazo: más que una astilla, pero hay que estar pegado
const MELEE_REACH = 22;      // alcance desde el borde del cuerpo
const MELEE_KNOCK = 210;     // empujón que aparta a la criatura
const MELEE_TIME = 0.24;     // duración del gesto (para la animación)
// Cuerpo a cuerpo según la línea Dermis (placas de quitina): daño, alcance, golpes del
// combo y tamaño del arco. I: golpea más y el arco crece · II: placa-hoja en el antebrazo
// y combo de dos · III: además la Cuchilla de Quitina (arma propia, R) con combo de tres
// tajos que te hacen avanzar.
const MELEE_TIERS = [
  { dmg: 14, reach: 22, combo: 1, swoosh: 1 },
  { dmg: 18, reach: 24, combo: 1, swoosh: 1.3 },
  { dmg: 20, reach: 28, combo: 2, swoosh: 1.45 },
  { dmg: 24, reach: 32, combo: 3, swoosh: 1.65 },
];
const COMBO_WINDOW = 0.55;   // tiempo para encadenar el siguiente golpe
const HIT_STOP = 0.035;      // congelado al acertar: da peso al impacto
// Arcadas de la infección: lo que dura cada una y una entrada "muerta" mientras dura
// (nada pulsado; la mira y el ratón siguen donde estaban).
const RETCH_TIME = 1.15;
const RETCH_INPUT = (real) => ({
  down: () => false, hit: () => false, up: () => false, released: new Set(), pressed: new Set(), keys: new Set(),
  mouse: real.mouse, padAim: { x: 0, y: 0, active: false },
});
const MELEE_INFECTION = 0.25; // probabilidad de infectarte al tocar el tejido

// Cómo se lanza la embestida: 'doubleTap' (dos toques rápidos a un lado) o 'shift'.
const DASH_INPUT = 'doubleTap';
const DOUBLE_TAP_WINDOW = 0.25; // segundos máximos entre los dos toques
const BREATH_CYCLE = 1.5; // respiración algo agitada
const HAND_Y = 8;          // altura del hombro (de donde sale el tendón) bajo el borde de la caja
const STAND_H = 28;        // alto de la caja de pie
const CROUCH_H = STAND_H - CROUCH_DROP - 1; // y agachado (esquiva lo que va a la altura del pecho)
const WALL_SLIDE = 28;

// Estrella de 9x9 px para el destello del ojo (blanca; se tiñe con el material).
function flareTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 9, 9);
  const dot = (x, y, v) => { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1); };
  for (let i = 1; i <= 4; i++) {
    const v = [0, 230, 150, 80, 35][i];
    dot(4 + i, 4, v); dot(4 - i, 4, v); dot(4, 4 + i, v); dot(4, 4 - i, v);
  }
  dot(3, 3, 90); dot(5, 3, 90); dot(3, 5, 90); dot(5, 5, 90);
  dot(4, 4, 255);
  return canvasTexture(c);
}
// Marca de fijado del auto-apuntado: cuatro esquinas de luz, 16x16.
function lockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [15, 0, -1, 1], [0, 15, 1, -1], [15, 15, -1, -1]]) {
    for (let i = 0; i < 4; i++) { g.fillRect(x + sx * i, y, 1, 1); g.fillRect(x, y + sy * i, 1, 1); }
  }
  return canvasTexture(c);
}

// Arco del golpe: media luna de luz (blanca en el filo, ámbar hacia dentro), 28x28.
function swooshTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 28;
  const g = c.getContext('2d');
  for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
    const dx = x - 6, dy = y - 14, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (Math.abs(a) > 1.25 || d < 12 || d > 20) continue;
    const edge = (d - 12) / 8;               // 0 por dentro, 1 en el filo
    const fade = 1 - Math.abs(a) / 1.25;     // más intenso en el centro del arco
    const v = Math.round(255 * fade * (0.35 + edge * 0.65));
    g.fillStyle = `rgb(${v},${Math.round(v * (0.65 + edge * 0.3))},${Math.round(v * (0.3 + edge * 0.6))})`;
    g.fillRect(x, y, 1, 1);
  }
  return canvasTexture(c);
}

// Fibras del tendón: el mismo tentáculo estirado. Bandas de su carne con contorno
// oscuro y una púa de hueso de vez en cuando; 7x5 px repetibles. P = paleta del cuerpo.
function paintTendon(c, P) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, 7, 5);
  g.fillStyle = '#140c10';
  g.fillRect(0, 0, 7, 5);
  for (let x = 0; x < 7; x++) {
    g.fillStyle = x % 2 ? P.muscleD : P.muscle;
    g.fillRect(x, 1, 1, 3);
  }
  g.fillStyle = '#e8dcc8';
  g.fillRect(5, 0, 1, 1); // púa
}
function tendonTexture(P) {
  const c = document.createElement('canvas');
  c.width = 7;
  c.height = 5;
  paintTendon(c, P);
  const tex = canvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
// Punta del tentáculo (mirando a +x): tres garras de hueso o una ventosa de carne, 9x9.
function paintTendonTip(c, claws) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, 9, 9);
  const p = (x, y, k) => { g.fillStyle = k; g.fillRect(x, y, 1, 1); };
  if (claws) {
    for (const [dx, dy] of [[1, -2], [2, 0], [1, 2]]) {
      for (let i = 0; i <= 3; i++) {
        const x = 3 + Math.round((dx * i) / 1.2), y = 4 + Math.round((dy * i) / 3);
        p(x, y - 1, '#140c10'); p(x, y + 1, '#140c10'); p(x, y, i === 3 ? '#a89a80' : '#e8dcc8');
      }
    }
  } else {
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      const d = Math.hypot(x, y);
      if (d <= 2.6) p(4 + x, 4 + y, d > 1.8 ? '#140c10' : '#a8424e');
    }
    p(5, 4, '#2a0610');
  }
  p(0, 3, '#140c10'); p(0, 5, '#140c10'); p(0, 4, '#9a5a36'); p(1, 4, '#9a5a36');
}
const CLIMB_SPEED = 50;
const WALL_KICK = 100;     // empuje lateral del salto de pared (era 150: te alejaba demasiado)
const WALL_KICK_LOCK = 0.1; // sin control tras el salto, para despegarse
const WALL_RETURN = 0.45;   // tiempo en que empujar hacia la pared te devuelve con fuerza
const WALL_RETURN_ACCEL = 1400;

export class Player {
  constructor(game) {
    this.game = game;
    // Caja de colisión del cuerpo articulado (PlayerBody): cabe por huecos de 2 tiles.
    this.w = 12;
    this.h = STAND_H;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.aim = 0;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.airJumps = 0;
    this.dash = 0;
    this.dashCd = 0;
    this.dashDir = 1;
    this.lastTapDir = 0;
    this.lastTapTime = -1;
    this.clinging = 0;
    this.wallLock = 0;
    this.rope = null;      // { x, y, len, comfy } cuerda tendida hasta un garfio
    this.tendonShow = 0;
    this.tendonTarget = null;
    this.fireCd = 0;
    this.charge = 0;
    this.invuln = 0;
    this.anim = 0;
    this.lastSafe = { x: 0, y: 0 };

    // Cuerpo repintado cada fotograma: las mutaciones lo remodelan (PlayerBody.js).
    this.body = new PlayerBody();
    this.bodyTex = canvasTexture(this.body.canvas);
    this.bodyGlowTex = canvasTexture(this.body.glow);
    this.mesh = spriteMesh(BODY_W, BODY_H);
    this.mesh.renderOrder = 4;
    this.glowMesh = spriteMesh(BODY_W, BODY_H, { glow: true });
    this.glowMesh.renderOrder = 4;
    // Autoiluminación tenue: la silueta del protagonista siempre se lee en la oscuridad.
    this.selfMesh = spriteMesh(BODY_W, BODY_H, { glow: true, color: '#3c3c4a' });
    this.selfMesh.renderOrder = 3;
    this.eyeFlare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: flareTexture(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.eyeFlare.renderOrder = 5;
    this.swoosh = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), new THREE.MeshBasicMaterial({
      map: swooshTexture(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.swoosh.renderOrder = 6;
    this.swoosh.visible = false;
    game.visual.glow.add(this.swoosh);
    this.lockMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({
      map: lockTexture(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.lockMesh.renderOrder = 6;
    this.lockMesh.visible = false;
    game.visual.glow.add(this.lockMesh);
    game.visual.glow.add(this.eyeFlare);
    // Tendón: cordón de músculo estriado (textura repetida a lo largo de la cuerda).
    this.tendonTex = tendonTexture({ muscle: '#c98a5e', muscleD: '#9a5a36' });
    this.tipCanvas = document.createElement('canvas');
    this.tipCanvas.width = this.tipCanvas.height = 9;
    this.tipTex = canvasTexture(this.tipCanvas);
    this.tendonTip = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: this.tipTex, transparent: true, alphaTest: 0.5, depthTest: false }));
    this.tendonTip.renderOrder = 3;
    this.tendonTip.visible = false;
    game.visual.world.add(this.tendonTip);
    this.tendon = new THREE.Mesh(new THREE.PlaneGeometry(1, 5), new THREE.MeshBasicMaterial({ map: this.tendonTex, transparent: true, alphaTest: 0.5, depthTest: false }));
    this.tendon.renderOrder = 3;
    this.tendon.visible = false;
    game.visual.world.add(this.mesh, this.tendon);
    game.visual.glow.add(this.selfMesh, this.glowMesh);
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  // La luz sale del ojo fotóforo (dentro de la caja de colisión para no nacer en un techo).
  // Esquina del lienzo del cuerpo en el mundo (para despedazarlo al morir).
  get bodyOrigin() {
    return { x: Math.round(this.cx - BODY_W / 2), y: Math.round(this.y + this.h - BODY_H) };
  }

  // Del lienzo del cuerpo al mundo (reflejado si mira a la izquierda).
  #bodyToWorld({ x, y }) {
    // Nadando, el sprite va inclinado (this.tilt, en torno a su centro): el ojo y la
    // boca del arma giran con él.
    const tl = this.tilt ?? 0;
    if (tl) {
      const py = this.pivotFeet ? BODY_H : BODY_H / 2;
      const dx = x + 0.5 - BODY_W / 2, dy = y + 0.5 - py, cs = Math.cos(tl), sn = Math.sin(tl);
      x = BODY_W / 2 + dx * cs - dy * sn - 0.5; y = py + dx * sn + dy * cs - 0.5;
    }
    const left = Math.round(this.cx - BODY_W / 2), top = Math.round(this.y + this.h - BODY_H);
    return { x: left + (this.facing > 0 ? x : BODY_W - 1 - x) + 0.5, y: top + y + 0.5 };
  }
  // La luz sale del ojo fotóforo; los disparos, de la boca del arma (siguen la mira).
  // Ambos se acotan a la caja para no nacer dentro de una pared.
  // La boca (por donde vomita), siguiendo la cabeza y la inclinación del cuerpo.
  get mouthPos() { return this.#bodyToWorld(this.body.mouth ?? this.body.eye); }
  get lampPos() {
    const e = this.#bodyToWorld(this.body.eye);
    return { x: Math.max(this.x + 1, Math.min(this.x + this.w - 1, e.x)), y: Math.max(this.y + 1, e.y) };
  }
  // Los disparos nacen en la boca del arma (o del cañón de carne), que sigue la mira.
  // Si entre el hombro y la boca hay pared, el disparo sale justo antes de ella.
  get gunPos() {
    const m = this.#bodyToWorld(this.body.muzzle);
    const sx = this.cx, sy = this.y + HAND_Y, w = this.game.world;
    let last = { x: sx, y: sy };
    for (let i = 1; i <= 8; i++) {
      const p = { x: sx + ((m.x - sx) * i) / 8, y: sy + ((m.y - sy) * i) / 8 };
      if (w.solidAtPx(p.x, p.y)) return last;
      last = p;
    }
    return m;
  }

  spawnAt(tx, ty) {
    this.crouching = false;
    this.h = STAND_H;
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = (ty + 1) * TILE - this.h;
    this.vx = this.vy = 0;
    this.rope = null;
    this.dash = 0;
    this.lastSafe = { x: this.x, y: this.y };
  }

  // Infectado, cada pocos segundos le dan arcadas: se encorva y vomita, y mientras dura
  // no responde a los controles (te deja expuesto). Fuera de eso, el paso normal.
  update(dt) {
    this.#retchTick(dt);
    if (!(this.retch > 0)) return this.#step(dt);
    const g = this.game, real = g.input;
    g.input = RETCH_INPUT(real);
    try { return this.#step(dt); } finally { g.input = real; }
  }

  #retchTick(dt) {
    const g = this.game, st = g.state;
    if (st.infection <= 0 || st.dead) { this.retch = 0; this.retchCd = undefined; return; }
    this.retchCd ??= 1.6 + Math.random() * 0.8;
    if (this.retch > 0) {
      this.retch -= dt;
      const t = 1 - this.retch / RETCH_TIME;
      // Dos arcadas: en cada una, un chorro de vómito hacia delante.
      const heave = (t > 0.32 && t < 0.5) || (t > 0.6 && t < 0.86);
      if (heave) {
        const mp = this.mouthPos, mx = mp.x + this.facing, my = mp.y + 1;
        for (let i = 0; i < 4; i++) {
          const chunky = Math.random() < 0.3;
          g.particles.emit(mx, my, {
            vx: this.facing * (45 + Math.random() * 70), vy: 5 + Math.random() * 55, life: 0.7 + Math.random() * 0.4, gravity: 520,
            color: chunky ? [0.42, 0.32, 0.1] : Math.random() < 0.5 ? [0.58, 0.66, 0.16] : [0.66, 0.6, 0.2],
            stain: Math.random() < 0.5 ? 'rgba(110,130,30,0.75)' : 'rgba(90,70,20,0.7)',
          });
        }
        if (Math.random() < 0.3) g.glowParticles.emit(mx, my, { vx: this.facing * 40, vy: 10, life: 0.3, color: [0.25, 0.35, 0.05] });
      }
      if (this.retch <= 0) this.retch = 0;
    } else if ((this.retchCd -= dt) <= 0 && !this.rope && !this.clinging && !this.swimming) {
      this.retch = RETCH_TIME;
      this.retchCd = 3.2 + Math.random() * 1.6;
      g.audio.play('retch', this);
      if (!st.seenRetch) { st.seenRetch = true; g.say('La infección te revuelve: vomitas y quedas a merced de lo que te rodea. Cúrate en un útero.', 3.5); }
    }
  }

  #step(dt) {
    const { input, state: st, world, audio } = this.game;
    this.fireCd -= dt;
    this.dashCd -= dt;
    this.invuln -= dt;
    this.tendonShow -= dt;
    this.jumpBuf -= dt;
    this.coyote -= dt;

    const dir = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);

    // Hacia dónde mira: las teclas de dirección le dan la vuelta y apuntan al frente;
    // en cuanto se mueve el ratón, la mira vuelve a seguir al cursor.
    const ms = input.mouse;
    this.mouseIdle = (this.mouseIdle ?? 9) + dt;
    // El ratón toma la mira solo si se mueve de verdad (3 px desde donde estaba), no por
    // un temblor de la mano o del sensor.
    if (!this.lastMouse) this.lastMouse = { x: ms.x, y: ms.y };
    if (Math.hypot(ms.x - this.lastMouse.x, ms.y - this.lastMouse.y) >= 3) { this.aimMode = 'mouse'; this.mouseIdle = 0; this.lastMouse = { x: ms.x, y: ms.y }; }
    if (input.hit('KeyD', 'ArrowRight', 'KeyA', 'ArrowLeft')) this.aimMode = 'keys';
    // Stick derecho del mando: mira analógica en 360°. Al soltarlo, mira al frente.
    const pad = input.padAim;
    if (pad?.active) this.aimMode = 'pad';
    else if (this.aimMode === 'pad') this.aimMode = 'keys';
    if (this.aimMode !== 'keys') this.lock = null;
    if (this.aimMode === 'pad') {
      this.aim = Math.atan2(pad.y, pad.x);
      // Se da la vuelta hacia donde apunta el stick solo si apunta claramente a un lado;
      // si no, mira hacia donde camina.
      if (Math.abs(pad.x) > 0.5) this.facing = pad.x > 0 ? 1 : -1;
      else if (dir) this.facing = dir;
    } else if (this.aimMode === 'keys') {
      if (dir) this.facing = dir;
      // Auto-apuntado: sin mira manual (stick derecho o ratón), el arma se fija en la
      // criatura más cercana que alumbra el ojo en la dirección en que miras. Solo con
      // luz: a oscuras no hay fijado y toca apuntar a mano.
      this.lock = this.#lockOn();
      // Agarrado a la pared, el arma apunta hacia arriba a lo largo de ella (no dentro).
      const forward = this.clinging ? Math.atan2(-1, 0.35 * this.clinging) : this.facing > 0 ? 0 : Math.PI;
      if (this.lock) {
        const lp = this.#lockAt();
        const want = Math.atan2(lp.y - this.lampPos.y, lp.x - this.lampPos.x);
        const d = Math.atan2(Math.sin(want - this.aim), Math.cos(want - this.aim));
        this.aim += d * Math.min(1, dt * 14);
      } else this.aim = forward;
    } else {
      const m = this.game.mouseWorld();
      this.aim = Math.atan2(m.y - this.lampPos.y, m.x - this.lampPos.x);
      this.facing = m.x >= this.cx ? 1 : -1;
    }
    if (input.hit('KeyW', 'Space', 'ArrowUp')) {
      this.jumpBuf = JUMP_BUFFER;
      this.jumpKey = input.hit('Space') ? 'Space' : 'Up';
    }

    // --- Habilidades de mutación ---
    this.#hookScan(dt);
    if (input.hit('KeyQ', 'Mouse2') && st.has('grapple')) this.#tryGrapple();
    const dashDir = this.#dashRequest(input, dir);
    if (dashDir && st.has('dash') && this.dashCd <= 0 && !this.rope) {
      if (st.useOxygen(OXYGEN_COST.dash * st.mod('dashCost')) && st.abilityWorks('dash')) {
        this.dash = DASH_TIME;
        this.dashCd = 0.55;
        this.dashDir = dashDir;
        this.rammed = new Set();
        audio.play('dash', this);
        this.#dashDust(-dashDir, 10, 70); // arranca: polvo hacia atrás
      }
    }

    // --- Movimiento ---
    const wasGround = this.onGround;
    const up = input.down('KeyW', 'ArrowUp', 'PadUp'), down = input.down('KeyS', 'ArrowDown', 'PadDown');
    this.#crouch(down && this.jumpBuf <= 0);
    // --- Nado: en el fluido te hundes despacio y cada salto es una brazada ---
    const surface = this.game.fluidSurfaceAt(this);
    this.swimming = surface != null && this.cy > surface && !this.rope && this.dash <= 0;
    if (this.swimming !== !!this.wasSwimming) this.#splash(surface ?? this.y);
    this.wasSwimming = this.swimming;
    this.strokeCd = Math.max(0, (this.strokeCd ?? 0) - dt);
    if (this.rope) {
      // Recoger o soltar cuerda; al engancharte, un tirón te recoge un tramo.
      const r = this.rope;
      if (r.len > r.comfy) r.len = Math.max(r.comfy, r.len - ROPE_YANK * dt);
      if (up) r.len -= ROPE_REEL * dt;
      else if (down) r.len += ROPE_REEL * dt;
      r.len = Math.max(ROPE_MIN, Math.min(GRAPPLE_RANGE, r.len));
      if (up || down) r.comfy = r.len;                              // lo que elijas con W/S se respeta
    }
    if (this.dash > 0) {
      this.dash -= dt;
      this.vx = this.dashDir * DASH_SPEED;
      this.vy = 0;
      this.#breakMembranes();
      this.#ram();
      if (Math.random() < 0.6) this.game.particles.emit(this.cx - this.dashDir * 5, this.y + 4 + Math.random() * 10, { vx: -this.dashDir * 30, vy: 0, life: 0.25, color: [0.5, 0.6, 0.7] });
    } else {
      const speed = MOVE * st.mod('moveSpeed');
      // Tras un salto de pared, empujar hacia ella te devuelve rápido para seguir trepando.
      this.kickT = Math.max(0, (this.kickT ?? 0) - dt);
      const accel = this.onGround ? 900 : this.kickT > 0 && dir === this.kickSide ? WALL_RETURN_ACCEL : 600;
      // Tras un salto de pared, un instante sin control para separarse del muro.
      // Corrientes de aire (entities/Traps.js -> Wind): el aire arrastra; en el suelo, menos.
      const wind = (this.windX ?? 0) * (this.onGround ? 0.6 : 1);
      const target = this.wallLock > 0 ? this.vx : (this.crouching ? 0 : dir * speed * (this.swimming ? SWIM_SPEED : 1)) + wind; // agachado no se anda
      // Tras soltarte del péndulo, el control en el aire apenas frena la inercia.
      this.flung = Math.max(0, (this.flung ?? 0) - dt);
      if (this.rope && !this.onGround) {
        // Balanceo: A/D empujan a lo largo del arco (tangente a la cuerda). Sin tocar
        // nada, un empuje suave en el sentido del vaivén lo mantiene vivo.
        const r = this.rope, ax = this.cx - r.x, ay = this.y + HAND_Y - r.y, d = Math.hypot(ax, ay) || 1;
        let tx = -ay / d, ty = ax / d;                               // tangente
        const below = ay > 0;
        if (dir) {
          if (tx * dir < 0) { tx = -tx; ty = -ty; }
          const k = below ? 1 : 0.4;                                 // por encima del garfio empuja menos
          this.vx += tx * SWING_PUMP * k * dt;
          this.vy += ty * SWING_PUMP * k * dt;
        } else if (below) {
          const along = this.vx * tx + this.vy * ty, sgn = Math.sign(along) || this.facing * Math.sign(tx);
          this.vx += tx * sgn * SWING_KEEP * dt;
          this.vy += ty * sgn * SWING_KEEP * dt;
        }
        this.vx *= 1 - SWING_DRAG * dt;
        this.vy *= 1 - SWING_DRAG * dt;
      } else if (this.flung > 0 && Math.abs(this.vx) > speed && Math.sign(this.vx) === (dir || Math.sign(this.vx))) {
        // conserva la velocidad del balanceo
      } else if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
      else if (this.vx > target) this.vx = Math.max(target, this.vx - accel * dt);
      if (this.swimming) this.vy += (SWIM_SINK - this.vy) * Math.min(1, dt * 2.5); // se hunde despacio
      else this.vy = Math.min(this.rope ? SWING_MAX : MAX_FALL, this.vy + (GRAVITY - (this.lift ?? 0)) * dt);
      if (this.lift) this.vy = Math.max(this.vy, -(this.riseMax ?? 230));
    }
    this.windX = 0;
    this.lift = 0;

    // --- Garras de Hueso: aferrarse empujando contra la pared; W trepa, S baja ---
    this.wallLock -= dt;
    const wasClinging = this.clinging;
    this.clinging = 0;
    // Tras un salto de pared puedes volver a agarrarte aún subiendo (encadenar saltos).
    if (st.has('wallClimb') && !this.onGround && !this.rope && this.dash <= 0
        && dir !== 0 && (this.vy > -60 || this.kickT > 0) && this.wallLock <= 0) {
      const probeX = dir > 0 ? this.x + this.w : this.x - 1;
      // En la mucosa resbaladiza (m) las garras no hacen presa.
      const slick = [...world.tilesIn(probeX, this.y + 3, 1, this.h - 6)].some((t) => t.c === 'm');
      if (!slick && world.rectSolid(probeX, this.y + 3, 1, this.h - 6)) {
        this.clinging = dir;
        this.facing = dir; // agarrado, siempre de cara a la pared (aunque apuntes hacia atrás)
        this.airJumps = 1;
        if (this.vy < -CLIMB_SPEED) this.vy = Math.max(this.vy * 0.85, -170); // el impulso se frena contra la pared
        if (up) this.vy = Math.min(this.vy, -CLIMB_SPEED);
        else if (down) this.vy = 90;
        else this.vy = Math.min(this.vy, WALL_SLIDE);
        this.#clawFx(dir, wasClinging !== dir, up, down);
      } else if (wasClinging === dir && up) {
        // Se acabó la pared: se encarama al borde.
        this.vy = -170;
        audio.play('claw', this);
      }
    }

    // --- Salto ---
    if (this.jumpBuf > 0 && this.swimming) this.#stroke(surface);
    else if (this.jumpBuf > 0) {
      if (this.rope && !this.onGround) {
        // Colgado, W recoge cuerda: solo Espacio te suelta, con toda la inercia del balanceo.
        if (this.jumpKey === 'Space') this.#releaseRope(true);
        else this.jumpBuf = 0;
      } else if (this.onGround || this.coyote > 0) {
        this.#jump(JUMP_V);
        this.rope = null;
      } else if (this.clinging) {
        this.jumpBuf = 0;
        // Agarrado, W sirve para trepar: solo Espacio te impulsa fuera de la pared.
        if (this.jumpKey === 'Space' && st.useOxygen(OXYGEN_COST.wallKick) && st.abilityWorks('wallClimb')) {
          this.#jump(JUMP_V);
          this.vx = -this.clinging * WALL_KICK;
          this.wallLock = WALL_KICK_LOCK;
          this.kickT = WALL_RETURN;
          this.kickSide = this.clinging;
          this.clinging = 0;
          audio.play('claw', this);
        }
      } else if (this.airJumps > 0 && st.has('doubleJump') && !this.rope) {
        this.jumpBuf = 0;
        if (st.useOxygen(OXYGEN_COST.doubleJump * st.mod('jumpCost'))) this.airJumps--;
        if (this.airJumps === 0 && st.abilityWorks('doubleJump')) {
          this.#jump(JUMP_V);
          audio.play('gas', this);
          for (let i = 0; i < 10; i++) {
            this.game.glowParticles.emit(this.cx + (Math.random() - 0.5) * 8, this.y + this.h, { vx: (Math.random() - 0.5) * 60, vy: 30 + Math.random() * 40, life: 0.5, color: [0.3, 0.9, 0.45] });
          }
        }
      }
    }
    if (input.up('KeyW', 'Space', 'ArrowUp') && this.vy < 0 && !this.swimming && !this.rope && !(this.flung > 0)) this.vy *= 0.5;

    world.move(this, dt);
    if (this.rope) this.#constrainRope();
    if (this.onGround) {
      this.coyote = COYOTE;
      this.airJumps = 1;
      if (!wasGround) { audio.play('land', this); this.landT = 0.14; }
      if (!this.#onHazard()) this.lastSafe = { x: this.x, y: this.y + this.h - STAND_H }; // siempre de pie
    }

    this.#weapon(dt);
    this.#updateMesh(dt);
  }

  // Brazada (el salto dentro del fluido): impulso hacia arriba; cerca de la superficie,
  // te saca del todo. Los Pistones y el Tendón empujan algo más (patada y coletazo).
  #stroke(surface) {
    this.jumpBuf = 0;
    if (this.strokeCd > 0) return;
    const g = this.game, st = g.state;
    const k = 1 + (st.has('dash') ? 0.15 : 0) + (st.has('grapple') ? 0.15 : 0);
    this.vy = this.y < surface + 8 ? -JUMP_V * 0.85 : -SWIM_STROKE * k;
    this.strokeT = 1;
    this.strokeCd = 0.3;
    g.audio.play('splat', this);
    for (let i = 0; i < 6; i++) {
      g.glowParticles.emit(this.cx + (Math.random() - 0.5) * 10, this.y + this.h - 4, { vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 30, life: 0.5, color: [0.4, 1, 0.35] });
    }
  }

  // Al entrar o salir del fluido: salpicadura en la superficie.
  #splash(y) {
    const g = this.game;
    g.audio.play('acid', this);
    for (let i = 0; i < 10; i++) {
      g.glowParticles.emit(this.cx + (Math.random() - 0.5) * 14, y, { vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 70, life: 0.5, color: [0.4, 1, 0.3] });
    }
  }

  // Embestida: estela de siluetas que se desvanecen (copias del cuerpo en ese instante,
  // del color de los émbolos) y un frenazo que levanta polvo al acabar en el suelo.
  #dashFx(dt, x, y) {
    if (this.dash > 0) {
      this.ghostT = (this.ghostT ?? 0) - dt;
      if (this.ghostT <= 0) { this.ghostT = 0.035; this.#ghost(x, y); }
    } else if (this.wasDashing && this.onGround) this.#dashDust(this.dashDir, 8, 45); // frenazo
    this.wasDashing = this.dash > 0;
    for (const gh of this.ghosts ?? []) {
      if (gh.life <= 0) continue;
      gh.life -= dt;
      gh.mesh.visible = gh.life > 0;
      gh.mesh.material.opacity = Math.max(0, gh.life / GHOST_LIFE) * 0.85;
    }
  }

  #ghost(x, y) {
    this.ghosts ??= [];
    let gh = this.ghosts.find((o) => o.life <= 0);
    if (!gh && this.ghosts.length < 10) {
      const canvas = document.createElement('canvas');
      canvas.width = BODY_W; canvas.height = BODY_H;
      const tex = canvasTexture(canvas);
      const mesh = spriteMesh(BODY_W, BODY_H, { glow: true, color: '#ffb070' });
      mesh.renderOrder = 2;
      setMap(mesh, tex);
      this.game.visual.glow.add(mesh);
      gh = { canvas, ctx: canvas.getContext('2d'), tex, mesh, life: 0 };
      this.ghosts.push(gh);
    }
    if (!gh) return;
    gh.ctx.clearRect(0, 0, BODY_W, BODY_H);
    gh.ctx.drawImage(this.body.canvas, 0, 0);
    gh.tex.needsUpdate = true;
    placeMesh(gh.mesh, x, y, BODY_W, BODY_H);
    gh.mesh.scale.x = this.facing;
    gh.life = GHOST_LIFE;
  }

  // Polvo y chispas de los émbolos a los pies, lanzados hacia `dir`.
  #dashDust(dir, n, speed) {
    const g = this.game, fy = this.y + this.h - 1;
    for (let i = 0; i < n; i++) {
      g.particles.emit(this.cx + (Math.random() - 0.5) * 6, fy - Math.random() * 3, { vx: dir * (speed * (0.4 + Math.random())), vy: -10 - Math.random() * 35, life: 0.3 + Math.random() * 0.2, color: [0.75, 0.62, 0.5] });
    }
    for (let i = 0; i < 3; i++) g.glowParticles.emit(this.cx, fy - 2, { vx: dir * (40 + Math.random() * 60), vy: -20 - Math.random() * 30, life: 0.2, color: [1, 0.7, 0.35] });
  }

  // Rechazo en el cuerpo (diegético): desde el 40 % la silueta late en violeta, más
  // deprisa y más fuerte cuanto más rechazo; desde el 70 % gotea pus; al 100 % sangra.
  // El cuerpo solo se sacude cuando una mutación falla (rejectSpasm): nada de tics sueltos.
  // Devuelve el desplazamiento horizontal del cuerpo en este fotograma.
  #rejectFx(dt) {
    const g = this.game, st = g.state;
    const k = st.immuneRejection ? 0 : Math.max(0, Math.min(1, (st.rejection - st.failFrom) / (100 - st.failFrom)));
    this.spasm = Math.max(0, (this.spasm ?? 0) - dt * 3);
    this.rejPhase = (this.rejPhase ?? 0) + dt * (2 + k * 6); // el latido se acelera
    const beat = Math.pow(Math.max(0, Math.sin(this.rejPhase * Math.PI)), 6);
    const p = k * (0.25 + 0.55 * beat) + this.spasm * 0.9;
    this.rejTint = [0.45 * p, 0.04 * p, 0.55 * p];
    const jolt = this.spasm > 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    if (st.rejection >= 70) {
      // Pus violeta que gotea del cuerpo.
      if (Math.random() < dt * 4 * k) g.particles.emit(this.x + Math.random() * this.w, this.y + 6 + Math.random() * (this.h - 8), { vx: (Math.random() - 0.5) * 8, vy: 10 + Math.random() * 20, life: 0.6, color: [0.55, 0.15, 0.6] });
    }
    if (st.critical) {
      // Crisis: sangra.
      if (Math.random() < dt * 6) g.particles.emit(this.x + Math.random() * this.w, this.y + 4 + Math.random() * (this.h - 6), { vx: (Math.random() - 0.5) * 14, vy: 15 + Math.random() * 25, life: 0.7, color: [0.55, 0.03, 0.08] });
    }
    return jolt;
  }

  // Una mutación no responde: el cuerpo se contrae con un fogonazo violeta.
  rejectSpasm() {
    this.spasm = 1;
    const g = this.game;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 60;
      g.glowParticles.emit(this.cx, this.cy, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, color: [0.8, 0.2, 0.9] });
    }
    g.flash(this.cx, this.cy, 50, [0.6, 0.1, 0.7], 0.15);
  }

  // Consumibles activos, sin iconos en el HUD: se ven en el propio cuerpo.
  //   Perla de Nácar  la silueta brilla en cian nacarado y la rodean destellos
  //   Célula Madre    la silueta late en verde y le suben motas verdes
  // Los dos últimos segundos el brillo titila (aviso) y al acabar estalla y se apaga.
  #itemFx(dt) {
    const g = this.game, T = g.state.timers;
    const warn = (left) => left < 2 && Math.floor(left * 8) % 2 === 0;
    let r = 0.235, gr = 0.235, b = 0.29; // autoiluminación normal (#3c3c4a)
    if (T.shield > 0) {
      const k = warn(T.shield) ? 0.1 : 0.55 + 0.25 * Math.sin(this.anim * 8);
      r += 0.25 * k; gr += 0.85 * k; b += 1 * k;
      if (Math.random() < dt * 22) {
        const a = Math.random() * Math.PI * 2;
        g.glowParticles.emit(this.cx + Math.cos(a) * 11, this.cy + Math.sin(a) * 15, { vx: -Math.sin(a) * 35, vy: Math.cos(a) * 35, life: 0.35, color: [0.55, 0.95, 1] });
      }
    }
    if (T.regen > 0) {
      const k = warn(T.regen) ? 0.08 : 0.35 + 0.35 * Math.max(0, Math.sin(this.anim * 5));
      r += 0.1 * k; gr += 0.9 * k; b += 0.25 * k;
      if (Math.random() < dt * 16) {
        g.glowParticles.emit(this.x + Math.random() * this.w, this.y + this.h * (0.4 + Math.random() * 0.6), { vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 25, life: 0.7, color: [0.3, 1, 0.45] });
      }
    }
    const [rr, rg, rb] = this.rejTint ?? [0, 0, 0]; // latido violeta del rechazo
    this.selfMesh.material.color.setRGB(r + rr, gr + rg, b + rb);
    // Se acabó: un estallido del color del efecto y un aviso.
    for (const kind of ['shield', 'regen']) {
      if ((this.fxPrev?.[kind] ?? 0) > 0 && T[kind] <= 0) {
        const col = kind === 'shield' ? [0.55, 0.95, 1] : [0.3, 1, 0.45];
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 70;
          g.glowParticles.emit(this.cx, this.cy, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, color: col });
        }
        g.audio.play(kind === 'shield' ? 'ricochet' : 'flicker', this);
        g.say(kind === 'shield' ? 'El nácar se resquebraja: vuelves a ser vulnerable.' : 'La Célula Madre se agota.', 2);
      }
    }
    this.fxPrev = { ...T };
  }

  // Agacharse (abajo en el suelo): la caja encoge por arriba, los pies no se mueven.
  // No anda pero gira, apunta y dispara. Al soltar se levanta si hay sitio encima;
  // bajo un techo bajo sigue agachado hasta salir.
  #crouch(want) {
    const can = want && this.onGround && !this.rope && this.dash <= 0 && !this.clinging;
    if (can && !this.crouching) {
      this.crouching = true;
      this.y += STAND_H - CROUCH_H;
      this.h = CROUCH_H;
    } else if (!can && this.crouching) {
      const lift = STAND_H - CROUCH_H;
      if (this.game.world.rectSolid(this.x, this.y - lift, this.w, lift)) return;
      this.crouching = false;
      this.y -= lift;
      this.h = STAND_H;
    }
  }

  // Garras contra la pared: al clavarlas, un golpe de esquirlas y el cuerpo se pega al
  // muro; al resbalar, arañazos que quedan en la pared y un reguero de polvo de hueso.
  #clawFx(dir, grabbed, up, down) {
    const g = this.game, wx = dir > 0 ? this.x + this.w : this.x - 1;
    if (grabbed) {
      this.clingJolt = 1;
      g.audio.play('claw', this);
      for (let i = 0; i < 7; i++) {
        g.particles.emit(wx, this.y + 8 + Math.random() * 14, { vx: -dir * (20 + Math.random() * 40), vy: (Math.random() - 0.6) * 50, life: 0.35, color: [0.9, 0.85, 0.75] });
      }
    }
    const sliding = !up && this.vy > 8;
    if (sliding || down) {
      // Dos zarpas (mano y pie) rayan la pared mientras bajas.
      for (const y of [this.y + 9, this.y + this.h - 4]) g.gore.scratch(wx, y);
      if (Math.random() < 0.7) {
        g.particles.emit(wx - dir, this.y + 9 + Math.random() * 2, { vx: -dir * (6 + Math.random() * 14), vy: -20 - Math.random() * 30, life: 0.3 + Math.random() * 0.2, color: [0.85, 0.78, 0.66] });
      }
      if (Math.random() < 0.15) g.glowParticles.emit(wx, this.y + this.h - 4, { vx: -dir * 20, vy: -30, life: 0.15, color: [1, 0.7, 0.4] });
    } else if (up && Math.random() < 0.4) {
      g.particles.emit(wx, this.y + this.h - 3, { vx: -dir * 10, vy: 10, life: 0.3, color: [0.85, 0.8, 0.7] });
    }
  }

  // Punto exacto del blanco fijado (una cabeza, un núcleo...) o su centro.
  #lockAt() {
    const l = this.lock;
    return l?.lockPoint ? l.lockPoint(this.lampPos) : { x: l.cx, y: l.cy };
  }

  // Blanco del auto-apuntado: criaturas vivas bajo el haz (Game marca `lit` cada paso)
  // y por delante. Se mantiene el blanco actual mientras siga alumbrado.
  #lockOn() {
    const st = this.game.state;
    if (!st.flashlightOn || st.light <= 0) return null;
    const valid = (e) => e.alive && e.lit && (e.cx - this.cx) * this.facing > -6;
    if (this.lock && valid(this.lock)) return this.lock;
    let best = null, bd = Infinity;
    for (const e of [...this.game.room.enemies, ...(this.game.room.targets ?? [])]) {
      if (!valid(e)) continue;
      const d = Math.hypot(e.cx - this.lampPos.x, e.cy - this.lampPos.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Embestida: doble toque rápido hacia un lado (o Shift si DASH_INPUT = 'shift').
  // Devuelve la dirección de la embestida pedida en este paso, o 0.
  #dashRequest(input, dir) {
    if (input.hit('PadDash')) return dir || this.facing; // botón del mando
    if (DASH_INPUT === 'shift') return input.hit('ShiftLeft', 'ShiftRight') ? (dir || this.facing) : 0;
    const tap = input.hit('KeyD', 'ArrowRight') ? 1 : input.hit('KeyA', 'ArrowLeft') ? -1 : 0;
    if (!tap) return 0;
    const now = this.game.time;
    const isDouble = tap === this.lastTapDir && now - this.lastTapTime < DOUBLE_TAP_WINDOW;
    this.lastTapDir = tap;
    this.lastTapTime = isDouble ? -1 : now; // un tercer toque no encadena otra embestida
    return isDouble ? tap : 0;
  }

  #jump(v) {
    this.vy = -v;
    this.jumpBuf = 0;
    this.coyote = 0;
    this.game.audio.play('jump', this);
  }

  #onHazard() {
    for (const t of this.game.world.tilesIn(this.x, this.y, this.w, this.h + 1)) {
      if (t.c === '^' || t.c === '~' || t.c === 'v') return true;
    }
    return false;
  }

  #breakMembranes() {
    const { world } = this.game;
    for (const t of world.tilesIn(this.x - 2, this.y, this.w + 4, this.h)) {
      if (t.c === 'X') this.game.breakMembrane(t.cx, t.cy);
    }
  }

  // La cuerda no se estira: si te alejas más que su longitud, te devuelve al arco
  // y anula la velocidad que tira hacia fuera (eso es lo que hace oscilar).
  #constrainRope() {
    const r = this.rope, w = this.game.world;
    const hx = this.cx, hy = this.y + HAND_Y;
    const dx = hx - r.x, dy = hy - r.y, d = Math.hypot(dx, dy) || 1;
    if (d <= r.len) return; // cuerda floja: caída libre
    const nx = dx / d, ny = dy / d;
    const tx = r.x + nx * r.len - this.w / 2, ty = r.y + ny * r.len - HAND_Y;
    if (!w.rectSolid(tx, ty, this.w, this.h)) { this.x = tx; this.y = ty; }
    else if (!w.rectSolid(this.x, ty, this.w, this.h)) this.y = ty;
    else if (!w.rectSolid(tx, this.y, this.w, this.h)) this.x = tx;
    const vr = this.vx * nx + this.vy * ny;
    if (vr > 0) { this.vx -= vr * nx; this.vy -= vr * ny; }
    const v = Math.hypot(this.vx, this.vy);
    if (v > SWING_MAX) { this.vx *= SWING_MAX / v; this.vy *= SWING_MAX / v; }
  }

  #releaseRope(jump) {
    this.lastAnchor = this.rope ? { x: this.rope.x, y: this.rope.y } : null;
    this.catchT = jump ? CATCH_TIME : 0;
    this.rope = null;
    this.jumpBuf = 0;
    this.airJumps = 1; // soltarte devuelve el doble salto: combina
    if (jump) {
      this.vy = Math.max(-SWING_MAX, Math.min(this.vy - RELEASE_BOOST, -JUMP_V * 0.5));
      if (Math.abs(this.vx) > 40) this.vx += Math.sign(this.vx) * 60;     // sale despedido hacia donde iba
      this.flung = 0.6;
      this.game.audio.play('whip', this);
    }
  }

  // Embestida: atraviesa a las criaturas y las hiere una vez por embestida.
  #ram() {
    const g = this.game;
    for (const e of g.room.enemies) {
      if (!e.alive || e.submerged || this.rammed.has(e) || !e.overlaps(this)) continue;
      this.rammed.add(e);
      if (e.hurt(RAM_DAMAGE, 'dash')) {
        g.shake = Math.max(g.shake, 3);
        for (let i = 0; i < 8; i++) g.particles.emit(e.cx, e.cy, { vx: this.dashDir * (40 + Math.random() * 60), vy: (Math.random() - 0.5) * 60, life: 0.4, color: [0.75, 0.1, 0.15] });
      }
    }
  }

  // El Tendón busca lo más alineado con la mira:
  //   anchor  garfio de hueso (o): tiende una cuerda y te balanceas (péndulo)
  //   seal    esfínter sellado (Y): lo desgarras y se abre
  //   armor   coraza de un Acorazado: se la arrancas
  //   flesh   cualquier otra criatura pequeña: la arponeas, la hieres y la arrastras hacia ti
  #tryGrapple() {
    const g = this.game, w = g.world;
    const from = { x: this.cx, y: this.y + HAND_Y };
    const candidates = [
      ...g.room.anchors.map((a) => ({ x: a.x, y: a.y, kind: 'anchor' })),
      ...g.room.enemies.filter((e) => e.alive && !e.submerged && !e.def.boss)
        .map((e) => ({ x: e.cx, y: e.cy, kind: e.armored ? 'armor' : 'flesh', enemy: e })),
    ];
    for (let cy = 0; cy < w.h; cy++) for (let cx = 0; cx < w.w; cx++) {
      if (w.get(cx, cy) === 'Y') candidates.push({ x: cx * TILE + 8, y: cy * TILE + 8, kind: 'seal', tile: [cx, cy] });
    }
    let best = null, bestScore = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - from.x, c.y - from.y);
      if (d > GRAPPLE_RANGE) continue;
      // Los garfios, con teclado, se buscan hacia arriba y delante en un cono amplio
      // (la mira de teclado es horizontal); con ratón o mando manda la mira.
      const keysAnchor = c.kind === 'anchor' && this.aimMode !== 'mouse' && this.aimMode !== 'pad' && !this.lock;
      const ref = keysAnchor ? Math.atan2(-1, 0.75 * this.facing) : this.aim;
      let da = Math.abs(Math.atan2(c.y - from.y, c.x - from.x) - ref);
      if (da > Math.PI) da = Math.PI * 2 - da;
      // Agarrado a una pared (W trepa, no apunta), los sellos se buscan en cualquier dirección.
      if (da > (c.kind === 'seal' && this.clinging ? Math.PI : keysAnchor ? 1.25 : c.kind === 'anchor' ? 0.9 : 0.6)) continue;
      // Un tile sólido tapa su propio centro: se mira hasta su cara visible.
      const k = c.kind === 'seal' ? Math.max(0, 1 - 10 / d) : 1;
      if (!w.lineOfSight(from.x, from.y, from.x + (c.x - from.x) * k, from.y + (c.y - from.y) * k)) continue;
      // Los anclajes y sellos tienen prioridad sobre la carne en igualdad de puntería.
      const score = da * 100 + d * 0.2 + (c.kind === 'flesh' ? 12 : 0);
      if (score < bestScore) { bestScore = score; best = c; }
    }

    this.tendonShow = 0.15;
    this.reachT = 0; // el tentáculo sale disparado: se estira en unos fotogramas
    if (!best && this.rope) { this.#releaseRope(false); return; } // Q sin objetivo: te sueltas
    if (!best) {
      this.tendonTarget = { x: from.x + Math.cos(this.aim) * 40, y: from.y + Math.sin(this.aim) * 40 };
      g.audio.play('whip', this);
      return;
    }
    if (!g.state.abilityWorks('grapple')) return;
    this.tendonTarget = { x: best.x, y: best.y };
    this.tendonShow = 0.2;
    if (best.kind === 'armor') {
      best.enemy.ripArmor();
    } else if (best.kind === 'seal') {
      g.breakMembrane(...best.tile);
    } else if (best.kind === 'flesh') {
      // Arpón: lo hiere y lo arrastra media distancia hacia ti (si no está anclado).
      const e = best.enemy;
      e.hurt(TENDON_DAMAGE, 'tendon');
      if (e.alive && !['ceilingEye', 'pod', 'spore'].includes(e.def.behavior)) {
        const pull = 0.5;
        const dx = (from.x - e.cx) * pull, dy = (from.y - e.cy) * pull;
        const ny = ['floater'].includes(e.def.behavior) ? e.y + dy : e.y;
        if (!w.rectSolid(e.x + dx, ny, e.w, e.h)) { e.x += dx; e.y = ny; }
      }
      g.audio.play('tear', this);
    } else {
      this.#attach(best);
    }
  }

  // Engancharse a un garfio: la cuerda se recoge deprisa hasta una longitud cómoda, se
  // conserva el impulso y, si ibas casi parado, un empujón arranca el vaivén.
  #attach(a) {
    const from = { x: this.cx, y: this.y + HAND_Y };
    const d = Math.hypot(a.x - from.x, a.y - from.y);
    const comfy = Math.max(ROPE_COMFY[0], Math.min(ROPE_COMFY[1], d * 0.7));
    this.rope = { x: a.x, y: a.y, len: d, comfy };
    this.airJumps = 1;
    this.dash = 0;
    this.catchT = 0;
    if (Math.hypot(this.vx, this.vy) < 120 && !this.onGround) this.vx += (Math.sign(a.x - from.x) || this.facing) * SWING_KICK;
    if (this.onGround) { this.vy = -120; this.onGround = false; }        // desde el suelo, despega
    this.tendonTarget = { x: a.x, y: a.y };
    this.tendonShow = 0.2;
    this.reachT = 0;
    this.game.audio.play('tear', this);
  }

  // El garfio que cogería el Tendón ahora mismo (lo marca su halo) y, recién soltado
  // de otro, el enganche automático al siguiente que tengas delante.
  #hookScan(dt) {
    const g = this.game, w = g.world;
    this.hookTarget = null;
    this.catchT = Math.max(0, (this.catchT ?? 0) - dt);
    if (!g.state.has('grapple') || this.rope || !g.room.anchors.length) return;
    const from = { x: this.cx, y: this.y + HAND_Y };
    const keys = this.aimMode !== 'mouse' && this.aimMode !== 'pad' && !this.lock;
    const ref = keys ? Math.atan2(-1, 0.75 * this.facing) : this.aim;
    let best = null, bestScore = Infinity, ahead = null, aheadD = Infinity;
    for (const a of g.room.anchors) {
      const dx = a.x - from.x, dy = a.y - from.y, d = Math.hypot(dx, dy);
      if (d > GRAPPLE_RANGE || !w.lineOfSight(from.x, from.y, a.x, a.y)) continue;
      let da = Math.abs(Math.atan2(dy, dx) - ref);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da <= (keys ? 1.25 : 0.9) && da * 100 + d * 0.2 < bestScore) { bestScore = da * 100 + d * 0.2; best = a; }
      // Para el enganche automático: por delante en el sentido en que vuelas y por encima.
      const same = this.lastAnchor && this.lastAnchor.x === a.x && this.lastAnchor.y === a.y;
      if (!same && dy < 4 && Math.sign(dx) === Math.sign(this.vx) && Math.abs(this.vx) > 30 && d < aheadD) { aheadD = d; ahead = a; }
    }
    this.hookTarget = best;
    if (this.catchT > 0 && ahead && g.state.abilityWorks('grapple')) this.#attach(ahead);
  }

  #weapon(dt) {
    const { input, state: st, audio } = this.game;
    const pos = this.gunPos;
    const cooldown = st.mod('fireCooldown'), dmg = st.mod('gunDamage');
    this.recoil = Math.max(0, (this.recoil ?? 0) - dt * 3);

    // [R] / gatillo R2: cambia entre las armas del cañón que tengas.
    if (input.hit('KeyR') && st.weapons.length > 1) {
      const w = st.cycleWeapon();
      audio.play('click', this);
      this.game.say(w === BLADE.id ? `Arma: ${BLADE.name}` : `Cañón: ${MUTATIONS[w].name}`, 1.2);
      this.burstLeft = 0;
    }
    const weapon = st.weaponId;
    this.comboT = Math.max(0, (this.comboT ?? 0) - dt);

    // Cuchilla de Quitina: el gatillo encadena los tajos (y cada uno te hace avanzar).
    if (weapon === BLADE.id) {
      if (input.down('Mouse0')) { this.burstLeft = 0; this.#melee(); }
      return;
    }

    // Sin cañón, el brazo es solo una culata. Con él, si tienes una criatura pegada,
    // también golpeas: a quemarropa el culatazo manda.
    if (!weapon || (input.down('Mouse0') && this.#foeInReach())) {
      if (input.down('Mouse0')) { this.burstLeft = 0; this.#melee(); }
      return;
    }

    if (weapon === 'astillas') {
      // Cañón de Astillas: escupe astillas afiladas de tu reserva de hueso. Precisas.
      if (input.down('Mouse0') && this.fireCd <= 0) {
        if (st.scrap > 0) {
          st.scrap--;
          this.#shoot(pos, { speed: 540, damage: 6 * dmg, kind: 'splinter', w: 5, h: 2, color: '#e8dcc8' });
          audio.play('nail', this);
          this.fireCd = 0.3 * cooldown;
        } else {
          this.#melee();
        }
      }
      return;
    }

    if (weapon === 'escopeta') {
      // Escopeta de Esquirlas: un abanico a quemarropa que derriba y empuja. Cara:
      // 2 de biomasa y 1 de hueso; el retroceso te desplaza hacia atrás.
      if (input.down('Mouse0') && this.fireCd <= 0) {
        if (st.biomass >= 2 && st.scrap >= 1) {
          st.spendBiomass(2);
          st.scrap--;
          for (let i = 0; i < 7; i++) {
            this.#shoot(pos, {
              speed: 360 + Math.random() * 90, damage: 5 * dmg, kind: 'shard', w: 3, h: 3, color: '#e8dcc8', breaks: true,
              spread: (i - 3) * 0.09 + (Math.random() - 0.5) * 0.06, life: 0.3 + Math.random() * 0.08, knock: 120,
            }, i > 0);
          }
          // Retroceso: te empuja contra la dirección del disparo y levanta el brazo.
          const back = this.aim + Math.PI;
          this.vx += Math.cos(back) * 150;
          if (!this.onGround) this.vy += Math.sin(back) * 110;
          this.recoil = 1;
          this.wallLock = Math.max(this.wallLock, 0.12); // el empujón no se frena al instante
          this.game.shake = Math.max(this.game.shake, 4);
          this.game.flash(pos.x, pos.y, 120, [1, 0.8, 0.5], 0.1);
          audio.play('shotgun', this);
          this.fireCd = 0.55 * cooldown;                         // era 0.8: más rápida, más gratificante
        } else {
          this.#melee();
        }
      }
      return;
    }

    // Arma simbionte: mientras mantienes, ráfagas automáticas de tres espinas. Cada dos
    // ráfagas cuestan 1 de biomasa (se puede disparar un buen rato) y cada cuarta lanza
    // además un glóbulo de plasma incandescente que sigue quemando.
    this.charge = 0;
    if (!input.down('Mouse0')) { this.burstLeft = 0; return; }
    if (this.fireCd > 0) return;
    if (!this.burstLeft) {
      this.burstN = (this.burstN ?? 0) + 1;
      if (this.burstN % BURSTS_PER_BIOMASS === 0 && !st.spendBiomass(1)) { this.#melee(); return; }
      if (st.biomass <= 0) { this.#melee(); return; }
      this.burstLeft = BURST_SIZE;
      if (this.burstN % 4 === 0) {
        this.#shoot(pos, { speed: 300, damage: 10 * dmg, kind: 'acid', w: 6, h: 6, color: '#ffd0f4', glow: [1, 0.35, 0.9], dot: 6, gravity: 120, breaks: true });
        audio.play('acid', this);
      }
    }
    this.#shoot(pos, { speed: 560, damage: 8 * dmg, kind: 'spine', w: 7, h: 2, color: '#ff4ad8', glow: [0.8, 0.2, 0.7], spread: (Math.random() - 0.5) * 0.09, breaks: true });
    audio.play('spine', this);
    this.burstLeft--;
    this.fireCd = this.burstLeft > 0 ? BURST_GAP : BURST_REST * cooldown;
  }

  // Sin cañón, el brazo cuelga relajado; solo se alza a apuntar mientras mueves el
  // ratón (o el stick derecho), y vuelve a bajar poco después. 0 colgando, 1 apuntando.
  #armRaise(dt) {
    const want = this.aimMode === 'pad' || (this.aimMode === 'mouse' && this.mouseIdle < 1.2) ? 1 : 0;
    this.armUp = (this.armUp ?? 0) + (want - (this.armUp ?? 0)) * Math.min(1, dt * (want ? 10 : 4));
    return this.armUp;
  }

  // quiet: perdigones de un mismo disparo (no repiten fogonazo ni cuentan como tiros).
  #shoot(pos, o, quiet = false) {
    const g = this.game;
    if (!quiet) g.state.stats.shots++;
    // El disparo va de la boca del arma al cursor (no paralelo a la mira del ojo, que
    // está más arriba y hacía fallar por poco los blancos pequeños y cercanos).
    let dir = this.aim;
    if (this.lock?.alive) { const lp = this.#lockAt(); dir = Math.atan2(lp.y - pos.y, lp.x - pos.x); } // fijado: de la boca al blanco
    else if (this.aimMode === 'mouse') {
      const m = g.mouseWorld();
      if (Math.hypot(m.x - pos.x, m.y - pos.y) > 6) dir = Math.atan2(m.y - pos.y, m.x - pos.x);
    }
    dir += o.spread ?? 0;
    g.spawnProjectile({
      ...o,
      x: pos.x - o.w / 2,
      y: pos.y - o.h / 2,
      vx: Math.cos(dir) * o.speed,
      vy: Math.sin(dir) * o.speed,
      owner: 'player',
    });
    if (quiet) return;
    g.flash(pos.x, pos.y, 80, o.glow ?? [1, 0.85, 0.55], 0.06);
    g.shake = Math.max(g.shake, 1.5); // retroceso: se nota la descarga
  }

  // Sin munición: golpe cuerpo a cuerpo con riesgo de infección.
  // Sin munición, el mismo botón de disparo lanza un culatazo hacia delante: hiere,
  // aparta y aturde un instante a la criatura... pero hay que estar pegado a ella.
  // Al acertar arrancas carne (biomasa), a riesgo de infectarte.
  // Caja del golpe cuerpo a cuerpo, delante de ti.
  #meleeTier() { return MELEE_TIERS[Math.min(3, this.game.state.lineLevel('dermis'))]; }
  #meleeBox() {
    const reach = this.#meleeTier().reach;
    return { x: this.facing > 0 ? this.x + this.w : this.x - reach, y: this.y + 2, w: reach, h: this.h - 4 };
  }

  // ¿Hay una criatura (o un blanco) al alcance del puño?
  #foeInReach() {
    const g = this.game, box = this.#meleeBox();
    return g.room.enemies.some((e) => e.alive && e.overlaps(box)) || (g.room.targets ?? []).some((t) => t.alive && overlap(t, box));
  }

  #melee() {
    let infectious = false;
    const g = this.game, st = g.state;
    if (this.fireCd > 0) return;
    // Combo: si golpeas dentro de la ventana, el siguiente tajo de la serie.
    const T = this.#meleeTier();
    this.comboN = this.comboT > 0 && (this.comboN ?? 0) < T.combo ? this.comboN + 1 : 1;
    const last = this.comboN === T.combo && T.combo > 1;
    this.comboT = COMBO_WINDOW;
    this.fireCd = T.combo > 1 ? (last ? 0.42 : 0.2) : 0.38;
    this.punch = MELEE_TIME;
    this.punchN = this.comboN;
    this.swooshK = T.swoosh * (last && T.combo === 3 ? 1.25 : 1);
    const dmgMul = last && T.combo === 3 ? 1.5 : 1;
    // Con la cuchilla, cada tajo te lanza hacia delante (el último, más).
    if (st.weaponId === BLADE.id) {
      this.vx = this.facing * (last ? 230 : 150);
      this.wallLock = Math.max(this.wallLock ?? 0, 0.12);
    }
    if (!st.seenMelee) {
      st.seenMelee = true;
      g.say('Cuerpo a cuerpo: sin munición, o con una criatura pegada, golpeas. Duele, aparta... y te obliga a estar cerca.', 3);
    }
    g.audio.play('swing', this);
    const box = this.#meleeBox();
    let hit = false;
    for (const t of g.room.targets ?? []) if (t.alive && overlap(t, box)) { t.hit(); hit = true; }
    for (const e of g.room.enemies) {
      if (!e.alive || !e.overlaps(box)) continue;
      // Contra una coraza intacta el golpe rebota y no absorbe nada.
      if (e.hurt(T.dmg * dmgMul, 'melee')) {
        hit = true;
        if (e.def?.infects) infectious = true;   // reventar el tejido de algo que infecta
        e.knockback(this.facing, MELEE_KNOCK * (last ? 1.4 : 1));
      }
    }
    if (hit) {
      g.audio.play('smack', this);
      g.hitStop = HIT_STOP;
      g.shake = Math.max(g.shake, 4);
      const hx = this.cx + this.facing * 16, hy = this.cy - 2;
      g.flash(hx, hy, 50, [0.9, 0.6, 0.4], 0.08);
      for (let i = 0; i < 7; i++) {
        const a = (Math.random() - 0.5) * 1.6 + (this.facing > 0 ? 0 : Math.PI);
        g.glowParticles.emit(hx, hy, { vx: Math.cos(a) * (90 + Math.random() * 120), vy: Math.sin(a) * (90 + Math.random() * 120), life: 0.25, color: [1, 0.75, 0.4] });
      }
      st.addBiomass(MELEE_ABSORB);
      if (infectious && Math.random() < MELEE_INFECTION && st.applyStatus('infection', INFECTION.time)) {
        g.say('El tejido que has reventado te infecta.', 1.8);
      }
    }
  }

  #updateMesh(dt) {
    const st = this.game.state;
    this.anim += dt;
    // El cuerpo se repinta con sus mutaciones; la cuerda tira del tentáculo hacia el anclaje.
    let rope = null;
    if (this.rope) {
      const dx = this.rope.x - this.cx, dy = this.rope.y - this.y, d = Math.hypot(dx, dy) || 1;
      rope = { x: (dx / d) * this.facing, y: dy / d };
    }
    // El tentáculo del Tendón se estira hacia la cuerda o hacia donde lo has lanzado.
    const reachTo = this.rope ?? (this.tendonShow > 0 ? this.tendonTarget : null);
    let reach = null;
    if (reachTo) {
      const dx = reachTo.x - this.cx, dy = reachTo.y - (this.y + HAND_Y), d = Math.hypot(dx, dy) || 1;
      reach = { x: (dx / d) * this.facing, y: dy / d };
    }
    // Mira en coordenadas locales (0 = al frente), para el brazo del arma.
    const aim = Math.atan2(Math.sin(this.aim), Math.cos(this.aim) * this.facing);
    this.punch = Math.max(0, (this.punch ?? 0) - dt);
    this.landT = Math.max(0, (this.landT ?? 0) - dt);
    // El gesto de agacharse o levantarse dura un instante (la caja cambia de golpe).
    this.crouchK = Math.max(0, Math.min(1, (this.crouchK ?? 0) + (this.crouching ? 1 : -1) * dt * 14));
    // La zancada de la embestida entra de golpe y se recoge un poco más despacio.
    this.dashK = this.dash > 0 ? Math.min(1, (this.dashK ?? 0) + dt * 30) : Math.max(0, (this.dashK ?? 0) - dt * 7);
    // Nado: la pose entra y sale suave; la brazada se apaga en medio segundo.
    this.swimK = Math.max(0, Math.min(1, (this.swimK ?? 0) + (this.swimming ? 1 : -1) * dt * 6));
    this.strokeT = Math.max(0, (this.strokeT ?? 0) - dt * 2);
    // Nadando, todo el cuerpo se tumba hacia delante (con cualquier mutación); la mira
    // se compensa para que el arma siga apuntando donde apuntas.
    this.tilt = this.swimK * 0.5;
    const rt = this.retch > 0 ? 1 - this.retch / RETCH_TIME : 0;
    this.retchK = rt ? Math.min(1, rt / 0.22, (1 - rt) / 0.14) : 0;
    const heaveJolt = rt && ((rt > 0.32 && rt < 0.5) || (rt > 0.6 && rt < 0.86)) ? Math.sin(this.anim * 40) * 0.06 : 0;
    this.tilt += this.retchK * 0.38 + heaveJolt;
    this.pivotFeet = this.swimK < 0.5;
    this.body.render(st.mutations, {
      t: this.anim, dt, aim: aim - this.tilt, punch: this.punch / MELEE_TIME, land: this.crouchK > 0 ? 0 : this.landT / 0.14, crouch: Math.max(this.crouchK, (this.retchK ?? 0) * 0.3), dash: this.dashK, swim: this.swimK, stroke: this.strokeT,
      vx: this.vx * this.facing, vy: this.vy,
      onGround: this.onGround, clinging: !!this.clinging, rope, reach, charge: this.charge,
      weapon: st.weaponId, recoil: this.recoil ?? 0, armRaise: this.#armRaise(dt),
      punchN: this.punchN ?? 1, bladeLv: st.lineLevel('dermis'),
    });
    this.bodyTex.needsUpdate = true;
    this.bodyGlowTex.needsUpdate = true;
    setMap(this.mesh, this.bodyTex);
    setMap(this.selfMesh, this.bodyTex);
    setMap(this.glowMesh, this.bodyGlowTex);

    // Lienzo centrado en la caja y con los pies en su base.
    // Agarrado a la pared, el cuerpo se pega a ella (y da un tirón al clavar las garras).
    this.clingJolt = Math.max(0, (this.clingJolt ?? 0) - dt * 8);
    const press = this.clinging ? this.facing * (1 + Math.round(this.clingJolt * 2)) : 0;
    const jolt = this.#rejectFx(dt); // el rechazo sacude el cuerpo
    const x = this.cx - BODY_W / 2 + press + jolt, y = this.y + this.h - BODY_H;
    const rz = -this.tilt * this.facing;
    // Nadando, el cuerpo gira en torno a su centro; de pie (arcadas), en torno a los pies,
    // para que no se despeguen del suelo al encorvarse.
    const fx = this.pivotFeet ? -(BODY_H / 2) * Math.sin(rz) : 0, fy = this.pivotFeet ? -(BODY_H / 2) * (1 - Math.cos(rz)) : 0;
    for (const m of [this.mesh, this.selfMesh, this.glowMesh]) {
      placeMesh(m, x, y, BODY_W, BODY_H);
      m.position.x += fx; m.position.y += fy;
      m.scale.x = this.facing * (1 + 0.14 * (this.dashK ?? 0)); // al lanzarse, la silueta se estira hacia delante
      m.rotation.z = rz;                                              // nadando o encorvado, inclinado hacia delante
    }
    // Arco del golpe: aparece al salir el brazo y se desvanece, siempre por delante.
    const pk = this.punch / MELEE_TIME; // 1 al empezar, 0 al acabar
    this.swoosh.visible = pk > 0.15;
    if (this.swoosh.visible) {
      const k = 1 - pk, sk = this.swooshK ?? 1, n = this.punchN ?? 1;
      this.swoosh.material.opacity = Math.min(0.6, pk);
      // El revés (2º golpe) se voltea: el arco sube; el tajo (3º) baja desde arriba.
      this.swoosh.scale.set(this.facing * (0.55 + k * 0.3) * sk, (0.65 + k * 0.25) * sk * (n === 2 ? -1 : 1), 1);
      this.swoosh.position.set(Math.round(this.cx + this.facing * (9 + k * 5) * (0.8 + sk * 0.2)), -Math.round(this.y + 13 - (n === 3 ? 3 : n === 2 ? -1 : 0)), 0);
      const lv = st.lineLevel('dermis');
      this.swoosh.material.color.setRGB(lv >= 3 ? 0.6 : 1, 1, lv >= 3 ? 1 : lv >= 2 ? 0.85 : 1);
    }
    // Marca de fijado: se cierra sobre el blanco y late con el color del ojo.
    const lk = this.lock?.alive ? this.lock : null;
    this.lockMesh.visible = !!lk;
    if (lk) {
      this.lockT = this.lock === this.lastLock ? (this.lockT ?? 0) + dt : 0;
      this.lastLock = this.lock;
      const close = Math.max(0, 1 - this.lockT * 6); // entra desde más grande
      // Tamaño fijo y pequeño: en un monstruo grande marca la pieza fijada, no el monstruo.
      const s = (Math.min(Math.max(lk.w, lk.h) + 6, 22) + close * 14 + Math.sin(this.anim * 10) * 1) / 16;
      const lp = this.#lockAt();
      this.lockMesh.scale.set(s, s, 1);
      this.lockMesh.position.set(Math.round(lp.x), -Math.round(lp.y), 0);
      this.lockMesh.material.color.setRGB(...this.game.eyeColor);
      this.lockMesh.material.opacity = 0.55 + 0.3 * Math.sin(this.anim * 8);
    } else this.lastLock = null;
    const blink = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
    this.mesh.visible = this.selfMesh.visible = !blink;
    this.#itemFx(dt);
    this.#dashFx(dt, x, y);

    // Destello del ojo fotóforo: toma el color de la energía lumínica y late al respirar.
    const on = st.flashlightOn && st.light > 0;
    const breath = 0.5 + 0.5 * Math.sin((this.anim / BREATH_CYCLE) * Math.PI * 2);
    const k = on ? 0.75 + breath * 0.25 : 0.25;
    const [r, g, b] = this.game.eyeColor;
    this.eyeFlare.material.color.setRGB(r * k, g * k, b * k);
    const size = on ? 5 + Math.round(breath) * 2 : 3; // pequeño: la lente se ve debajo
    this.eyeFlare.scale.set(size, size, 1);
    // Centro exacto del píxel del ojo (reflejado si mira a la izquierda).
    const { x: eyeX, y: eyeY } = this.#bodyToWorld(this.body.eye);
    this.eyeFlare.position.set(eyeX, -eyeY, 0);
    this.eyeFlare.visible = !blink;

    // Tendón: el propio tentáculo se estira desde su raíz hasta el objetivo, con su
    // punta (garras o ventosa) clavada allí. Al lanzarlo sale disparado en unos fotogramas.
    const target = this.rope ?? (this.tendonShow > 0 ? this.tendonTarget : null);
    if (target) {
      const out = this.body.tendonOut ? this.#bodyToWorld(this.body.tendonOut) : { x: this.cx, y: this.y + HAND_Y };
      const fx = out.x, fy = out.y;
      this.reachT = Math.min(1, (this.reachT ?? 1) + dt / 0.08);
      const dx = (target.x - fx) * this.reachT, dy = (target.y - fy) * this.reachT;
      const len = Math.max(1, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx);
      if (this.body.P && this.tendonPal !== this.body.P) {
        this.tendonPal = this.body.P;
        paintTendon(this.tendonTex.image, this.body.P);
        this.tendonTex.needsUpdate = true;
      }
      this.tendon.visible = true;
      this.tendon.position.set(fx + dx / 2, -(fy + dy / 2), 0);
      this.tendon.rotation.z = -ang;
      this.tendon.scale.x = len;
      // Las fibras se deslizan al recoger cuerda y tiemblan bajo tensión.
      this.tendonTex.repeat.x = len / 7;
      this.tendonTex.offset.x = (this.rope ? -this.rope.len / 7 : 0) + (Math.random() < 0.3 ? 0.08 : 0);
      const claws = this.game.state.mutations.has('garras');
      if (this.tipClaws !== claws) { this.tipClaws = claws; paintTendonTip(this.tipCanvas, claws); this.tipTex.needsUpdate = true; }
      this.tendonTip.visible = true;
      this.tendonTip.position.set(fx + dx, -(fy + dy), 0);
      this.tendonTip.rotation.z = -ang;
    } else {
      this.tendon.visible = false;
      this.tendonTip.visible = false;
    }
  }
}
