// Mando (DualSense, DualShock, Xbox o cualquiera que el navegador reconozca con la
// API Gamepad). Se lee en su propio bucle, así también funciona con el juego en pausa
// y en los menús. Cada botón se traduce a la tecla que ya usa el juego (se emite como
// un evento de teclado real), de modo que todo lo que funciona con teclado funciona
// con el mando. Lo que no tiene tecla (disparo, mira analógica, subir/bajar sin saltar,
// embestida) va directo a Input.
//
// Botones con el mapeo estándar (PlayStation / Xbox). El pulgar derecho vive en el
// stick de apuntar: disparo, tendón y embestida van en gatillos y bumpers.
//   stick izq. / cruceta  mover · arriba/abajo recoge o suelta el tendón, trepa
//   stick der.            apuntar la mirada (360°)
//   R1 / RB               disparar (mantener = cargado)
//   X / A                 saltar (y soltarse del tendón) · aceptar en menús
//   L2 / LT               tendón
//   L1 / LB               embestida
//   R3 · L3               Perla de Nácar · Célula Madre (consumibles)
//   R2 / RT               libre
//   △ / Y                 usar el Nodo Seguro
//   ○ / B                 salir de los menús
//   □ / X                 ojo fotóforo
//   Options / Menu        genoma · Create / View: mapa
// En los menús: cruceta o stick para elegir, X / A para aceptar, ○ / B para salir.
//
// Aún no hay pantalla de configuración: el mapeo está en BUTTONS, listo para hacerse
// editable más adelante.

// índice del botón (mapeo estándar) → acción
export const BUTTONS = {
  0: 'jump', 1: 'back', 2: 'light', 3: 'interact',
  4: 'dash', 5: 'fire', 6: 'grapple', 7: 'weapon',
  8: 'map', 9: 'genome', 10: 'regen', 11: 'shield', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

// acción → tecla del juego (evento de teclado) o código propio de Input (Pad*/Mouse*)
const KEYS = {
  jump: { key: 'Space' },
  fire: { input: 'Mouse0' },
  grapple: { key: 'KeyQ' },
  dash: { input: 'PadDash' },
  back: { key: 'Escape' },
  light: { key: 'KeyF' },
  interact: { key: 'KeyE' },
  genome: { key: 'KeyI' },
  map: { key: 'KeyM' },
  weapon: { key: 'KeyR' },
  shield: { key: 'Digit1' },
  regen: { key: 'Digit2' },
  left: { key: 'ArrowLeft' },
  right: { key: 'ArrowRight' },
  up: { input: 'PadUp' },
  down: { input: 'PadDown' },
};

export const RUMBLE = 'death'; // futura opción: 'off' | 'death' | 'all'
const DEAD = 0.25; // zona muerta del stick de apuntar
const MOVE_ON = 0.5, MOVE_OFF = 0.3; // histéresis del stick de mover
const STICK_MENU_ON = 0.65, STICK_MENU_OFF = 0.3; // el stick en los menús
const STICK_REPEAT_DELAY = 420, STICK_REPEAT = 150; // ms: pausa antes de repetir y cadencia

export class Gamepad {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.held = new Set(); // acciones que el mando tiene pulsadas
    this.active = false; // el último periférico usado fue el mando
    this.input.padAim = { x: 0, y: 0, active: false };
    addEventListener('gamepadconnected', (e) => this.game.say?.(`Mando conectado: ${e.gamepad.id.replace(/\(.*\)/, '').trim()}`, 2.5));
    addEventListener('gamepadconnected', (e) => {
      console.info('[mando]', e.gamepad.id, 'mapeo:', e.gamepad.mapping || 'ninguno', 'ejes:', e.gamepad.axes.length, 'botones:', e.gamepad.buttons.length);
    });
    addEventListener('gamepaddisconnected', () => { this.#releaseAll(); this.deadAxes = null; });
    // Si vuelves al teclado o al ratón, los avisos dejan de mostrar los botones del mando.
    addEventListener('keydown', (e) => { if (e.isTrusted) this.active = false; });
    addEventListener('mousedown', () => { this.active = false; });
    const loop = () => { this.#poll(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  #pad() {
    for (const p of navigator.getGamepads?.() ?? []) if (p?.connected) return p;
    return null;
  }

  #poll() {
    const pad = this.#pad();
    if (!pad) return;
    const want = new Set();
    pad.buttons.forEach((b, i) => {
      const action = BUTTONS[i];
      if (action && (b.pressed || b.value > 0.4)) want.add(action);
    });
    const buttons = new Set(want); // sin el stick: los menús lo leen aparte
    // Stick izquierdo: como la cruceta, con histéresis para que no parpadee.
    // Ejes "muertos": los que en reposo no están centrados son gatillos analógicos (en
    // algunos mapeos no estándar el DualSense pone L2/R2 donde iría un stick, a -1).
    // Se descartan para que no apunten ni giren al personaje por su cuenta.
    this.deadAxes ??= pad.axes.map((v) => Math.abs(v) > 0.5);
    const axis = (i) => (this.deadAxes[i] ? 0 : pad.axes[i] ?? 0);
    const lx = axis(0), ly = axis(1), rx = axis(2), ry = axis(3);
    const on = (a, v) => (this.held.has(a) ? v > MOVE_OFF : v > MOVE_ON);
    if (on('left', -lx)) want.add('left');
    if (on('right', lx)) want.add('right');
    if (on('up', -ly)) want.add('up');
    if (on('down', ly)) want.add('down');

    if (this.#menu(buttons, lx, ly)) { this.#sync(new Set()); this.held = want; return; }
    this.inMenu = false;
    this.#sync(want);

    // Stick derecho: la mira analógica.
    const m = Math.hypot(rx, ry), aim = this.input.padAim;
    // Solo toca la mira cuando apunta el stick (la mira táctil también la usa).
    if (m > DEAD) { aim.active = true; aim.x = rx / m; aim.y = ry / m; this.aiming = true; }
    else if (this.aiming) { aim.active = false; this.aiming = false; }
    if (want.size || this.aiming) this.active = true;
    this.#rumble(pad);
  }

  // Pulsa y suelta lo que ha cambiado desde la última lectura.
  #sync(want) {
    for (const a of want) if (!this.held.has(a)) this.#emit(a, true);
    for (const a of this.held) if (!want.has(a)) this.#emit(a, false);
    this.held = want;
  }

  #emit(action, down) {
    const k = KEYS[action];
    if (!k) return;
    if (k.key) dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: k.key, key: k.key }));
    if (k.input) {
      if (down) { this.input.keys.add(k.input); this.input.pressed.add(k.input); }
      else { this.input.keys.delete(k.input); this.input.released.add(k.input); }
    }
  }

  #releaseAll() {
    this.#sync(new Set());
    this.input.padAim.active = false;
  }

  // Menús (portada, nodo, genoma, desarrollo): el mando envía las mismas teclas que
  // el teclado, y cada menú las entiende con MenuNav (flechas + Intro). Devuelve true
  // si un menú se ha quedado con la entrada.
  // Los botones (cruceta incluida) dan un paso por pulsación. El stick solo cuenta su
  // eje dominante (una diagonal no manda dos direcciones a la vez), entra con mucha
  // inclinación y sale con poca (sin rebotes junto al umbral), da un paso al
  // inclinarlo y, si se mantiene, repite tras una pausa.
  #menu(buttons, lx, ly) {
    const g = this.game, overlay = document.getElementById('overlay');
    const open = (overlay && !overlay.hidden) || g.nodeMenu?.open || g.genome?.open || g.devMenu?.open;
    if (!open) return false;
    const press = (code) => {
      dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
      dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
      this.active = true;
    };
    const MENU = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'Enter', back: 'Escape', genome: 'KeyI', interact: 'KeyE' };
    for (const [action, code] of Object.entries(MENU)) if (buttons.has(action) && !this.held.has(action)) press(code);

    const now = performance.now(), ax = Math.abs(lx), ay = Math.abs(ly), m = Math.max(ax, ay);
    let dir = null;
    if (m > (this.stickDir ? STICK_MENU_OFF : STICK_MENU_ON)) {
      dir = ay >= ax ? (ly < 0 ? 'ArrowUp' : 'ArrowDown') : (lx < 0 ? 'ArrowLeft' : 'ArrowRight');
      // Mientras se mantiene, no cambia de dirección salvo giro claro del stick.
      if (this.stickDir && dir !== this.stickDir && Math.abs(ax - ay) < 0.35) dir = this.stickDir;
    }
    if (!this.inMenu) {
      // Al abrir un menú con el stick ya inclinado, no se mueve hasta soltarlo.
      this.inMenu = true;
      this.stickDir = dir;
      this.stickNext = Infinity;
    } else if (dir !== this.stickDir) {
      this.stickDir = dir;
      if (dir) { press(dir); this.stickNext = now + STICK_REPEAT_DELAY; }
    } else if (dir && now >= this.stickNext) {
      press(dir);
      this.stickNext = now + STICK_REPEAT;
    }
    return true;
  }

  // Vibración: de momento solo al morir. Cuando haya opciones, RUMBLE decidirá si
  // también vibra con golpes y explosiones.
  #rumble(pad) {
    if (RUMBLE === 'off') return;
    const dead = this.game.mode === 'dead';
    if (dead && !this.wasDead && pad.vibrationActuator?.playEffect) {
      pad.vibrationActuator.playEffect('dual-rumble', { duration: 700, strongMagnitude: 1, weakMagnitude: 0.8 }).catch(() => {});
    }
    this.wasDead = dead;
  }

}

