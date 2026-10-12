// Controles táctiles (móvil y tableta). Se activan solos en pantallas táctiles: una
// cruceta de carne abajo a la izquierda y botones a la derecha, translúcidos. Como el
// mando (core/Gamepad.js), cada botón se traduce a la tecla que ya usa el juego, así
// todo lo que funciona con teclado funciona al tacto.
//
//   cruceta         mover · arriba/abajo trepan, recogen o sueltan el tendón (no saltan)
//   SALTAR          saltar (y soltarse del tendón)
//   tocar la pantalla  apunta hacia ese punto y dispara (mantener y mover: arrastra la mira)
//   DISPARAR        tocar: dispara a lo que alumbra el ojo (auto-apuntado)
//                   mantener y arrastrar: apunta a mano hacia donde arrastras
//   EMBESTIDA       embestida (con Pistones)
//   TENDÓN          tocar: lánzalo al frente · arrastrar y soltar: lánzalo hacia ahí
//   fila de arriba  ojo · arma · genoma · mapa · cerrar (en los menús)
//   USAR            aparece latiendo sobre un Nodo Seguro
// En los menús la cruceta mueve la selección, SALTAR acepta y ✕ sale; las opciones
// también se pueden tocar directamente.
import { overlap } from '../core/Physics.js';

// acción → tecla del juego (evento de teclado) o código propio de Input (Pad*/Mouse*)
const KEYS = {
  left: { key: 'ArrowLeft' }, right: { key: 'ArrowRight' }, up: { input: 'PadUp' }, down: { input: 'PadDown' },
  jump: { key: 'Space' }, fire: { input: 'Mouse0' }, dash: { input: 'PadDash' }, grapple: { key: 'KeyQ' },
  light: { key: 'KeyF' }, interact: { key: 'KeyE' }, genome: { key: 'KeyI' }, map: { key: 'KeyM' },
  weapon: { key: 'KeyR' }, back: { key: 'Escape' },
};
const MENU_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'Enter', back: 'Escape' };
const REPEAT_DELAY = 420, REPEAT = 160; // ms: la cruceta mantenida en los menús
const DRAG = 18; // px: a partir de aquí, arrastrar desde un botón es apuntar

// ---------------------------------------------------------------- dibujo (SVG)
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};
// Contorno de carne: un círculo irregular, abultado.
function blobPath(r, seed, n = 9) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(seed * 12.9 + i * 2.7) * 0.07 + Math.sin(seed * 3.1 + i * 5.3) * 0.04;
    pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
  }
  // Curvas suaves por los puntos medios.
  let d = '';
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    d += i === 0 ? `M${mx.toFixed(1)},${my.toFixed(1)}` : '';
    const [x2, y2] = pts[(i + 2) % n];
    d += ` Q${x1.toFixed(1)},${y1.toFixed(1)} ${((x1 + x2) / 2).toFixed(1)},${((y1 + y2) / 2).toFixed(1)}`;
  }
  return d + 'Z';
}
function defs(svg) {
  const d = el('defs', {}, svg);
  const grad = (id, c0, c1) => {
    const g = el('radialGradient', { id, cx: '38%', cy: '32%', r: '75%' }, d);
    el('stop', { offset: '0%', 'stop-color': c0 }, g);
    el('stop', { offset: '100%', 'stop-color': c1 }, g);
  };
  grad('t-flesh', '#c8506a', '#5a1424');
  grad('t-flesh-on', '#ff9ab0', '#a02a44');
  grad('t-bone', '#e8d8c0', '#8a6a50');
}
// Iconos (trazos de hueso sobre la carne), en un cuadro de -10..10.
const ICONS = {
  jump: 'M-6,3 L0,-4 L6,3 M-6,8 L0,1 L6,8',
  fire: 'M-8,0 L4,0 M1,-4 L6,0 L1,4 M-8,-3 L-6,0 L-8,3',
  dash: 'M-8,-5 L-2,0 L-8,5 M0,-5 L6,0 L0,5',
  grapple: 'M0,-8 L0,3 Q0,8 -5,6 M0,3 Q0,8 5,6 M-3,-8 L3,-8',
  light: 'M-8,0 Q0,-7 8,0 Q0,7 -8,0 Z M0,-2.5 A2.5,2.5 0 1,0 0.01,-2.5',
  genome: 'M-4,-8 Q6,-4 -4,0 Q-6,4 4,8 M4,-8 Q-6,-4 4,0 Q6,4 -4,8 M-3,-4 L3,-4 M-3,4 L3,4',
  map: 'M-8,-5 L-3,-7 L3,-5 L8,-7 L8,5 L3,7 L-3,5 L-8,7 Z M-3,-7 L-3,5 M3,-5 L3,7',
  weapon: 'M-7,5 L5,-5 M-8,3 A2,2 0 1,1 -5,6 M4,-7 A2,2 0 1,1 7,-4',
  back: 'M-6,-6 L6,6 M6,-6 L-6,6',
  interact: 'M0,-7 L0,3 M-4,-1 L0,3 L4,-1 M-7,7 L7,7',
};

function button(parent, id, r, label) {
  const svg = el('svg', { viewBox: `${-r - 3} ${-r - 3} ${2 * r + 6} ${2 * r + 6}`, class: 'tb', 'data-act': id });
  defs(svg);
  el('path', { d: blobPath(r + 1.5, id.length + r), fill: '#2a0810', class: 'rim' }, svg);
  el('path', { d: blobPath(r, id.length * 1.7 + r), fill: 'url(#t-flesh)', class: 'body' }, svg);
  // venas
  for (let i = 0; i < 3; i++) {
    const a = (id.length * 1.3 + i * 2.1) % 6.28;
    el('path', { d: `M${(Math.cos(a) * r * 0.95).toFixed(1)},${(Math.sin(a) * r * 0.95).toFixed(1)} Q${(Math.cos(a + 0.5) * r * 0.6).toFixed(1)},${(Math.sin(a + 0.5) * r * 0.6).toFixed(1)} ${(Math.cos(a + 0.2) * r * 0.45).toFixed(1)},${(Math.sin(a + 0.2) * r * 0.45).toFixed(1)}`, stroke: '#3a0c18', 'stroke-width': 0.9, fill: 'none', opacity: 0.7 }, svg);
  }
  const s = r / 13;
  el('path', { d: ICONS[id], transform: `scale(${s.toFixed(2)})`, stroke: '#f4e6d4', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, svg);
  if (label) { const t = el('text', { y: r * 0.82, 'text-anchor': 'middle', class: 'tl' }, svg); t.textContent = label; }
  parent.append(svg);
  return svg;
}

// La cruceta: cuatro brazos de carne y un núcleo; cada brazo se ilumina al pulsarlo.
function dpad(parent) {
  const svg = el('svg', { viewBox: '-52 -52 104 104', class: 'tdpad' });
  defs(svg);
  const arms = {};
  const arm = (dir, rot) => {
    const g = el('g', { transform: `rotate(${rot})` }, svg);
    el('path', { d: 'M-13,-14 Q-15,-40 -9,-46 Q0,-52 9,-46 Q15,-40 13,-14 Z', fill: '#2a0810', transform: 'scale(1.06)' }, g);
    const body = el('path', { d: 'M-12,-14 Q-14,-39 -8,-45 Q0,-50 8,-45 Q14,-39 12,-14 Z', fill: 'url(#t-flesh)', class: 'body' }, g);
    el('path', { d: 'M-4,-18 Q-6,-30 -2,-40 M5,-20 Q7,-30 3,-38', stroke: '#3a0c18', 'stroke-width': 1, fill: 'none', opacity: 0.7 }, g);
    el('path', { d: 'M-6,-30 L0,-38 L6,-30', stroke: '#f4e6d4', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, g);
    arms[dir] = body;
  };
  arm('up', 0); arm('right', 90); arm('down', 180); arm('left', 270);
  el('path', { d: blobPath(17, 3), fill: '#2a0810' }, svg);
  el('path', { d: blobPath(15.5, 5), fill: 'url(#t-flesh)' }, svg);
  el('circle', { r: 5, fill: '#3a0c18', opacity: 0.6 }, svg);
  el('circle', { r: 2.2, cx: -1, cy: -1, fill: '#ff9ab0', opacity: 0.5 }, svg);
  parent.append(svg);
  return { svg, arms };
}

export class Touch {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.active = false;
    this.held = new Set(); // acciones pulsadas ahora
    this.pointers = new Map(); // pointerId -> { kind, ... }
    this.input.padAim ??= { x: 0, y: 0, active: false };
    const coarse = matchMedia?.('(hover: none) and (pointer: coarse)').matches;
    if (coarse) this.#enable();
    // También al primer toque (tabletas con teclado, portátiles táctiles...).
    addEventListener('touchstart', () => this.#enable(), { passive: true, once: true });
    // Tras tocar la pantalla el navegador simula ratón: eso no cuenta como volver al ratón.
    addEventListener('touchstart', () => { this.lastTouch = performance.now(); }, { passive: true, capture: true });
    addEventListener('keydown', (e) => { if (e.isTrusted && this.active) this.#hide(true); });
    addEventListener('mousemove', (e) => { if (e.isTrusted && this.active && !this.recentTouch()) this.#hide(true); });
  }

  recentTouch() { return performance.now() - (this.lastTouch ?? -1e9) < 1500; }

  #enable() {
    if (!this.root) this.#build();
    this.active = true;
    this.hidden = false;
    document.body.classList.add('touch');
    this.root.hidden = false;
    // La portada explica los controles táctiles.
    document.querySelector('#overlay .controls')?.classList.add('kbd');
    document.querySelector('#overlay .touch-help')?.removeAttribute('hidden');
  }
  // Si vuelves al teclado o al ratón, la capa táctil se aparta (vuelve con un toque).
  #hide() {
    if (this.hidden) return;
    this.hidden = true;
    this.root.hidden = true;
    this.#releaseAll();
    document.body.classList.remove('touch');
    addEventListener('touchstart', () => this.#enable(), { passive: true, once: true });
  }

  #build() {
    const root = this.root = document.createElement('div');
    root.id = 'touch';
    const left = document.createElement('div'); left.className = 'tleft';
    const right = document.createElement('div'); right.className = 'tright';
    const top = document.createElement('div'); top.className = 'ttop';
    root.append(left, right, top);
    this.pad = dpad(left);
    this.btn = {
      jump: button(right, 'jump', 26, 'SALTAR'),
      fire: button(right, 'fire', 23, 'DISPARAR'),
      dash: button(right, 'dash', 17),
      grapple: button(right, 'grapple', 17),
      interact: button(right, 'interact', 17, 'USAR'),
      light: button(top, 'light', 13),
      weapon: button(top, 'weapon', 13),
      genome: button(top, 'genome', 13),
      map: button(top, 'map', 13),
      back: button(top, 'back', 13),
    };
    this.aimMark = document.createElement('div');
    this.aimMark.className = 'taim';
    root.append(this.aimMark);
    const rot = document.createElement('div');
    rot.id = 'rotate';
    rot.innerHTML = '<p>Gira el móvil</p><p class="dim">El cuerpo necesita espacio: juega en horizontal.</p>';
    document.body.append(root, rot);

    // Cruceta.
    this.pad.svg.addEventListener('pointerdown', (e) => this.#down(e, { kind: 'pad' }));
    // Botones.
    for (const [act, svg] of Object.entries(this.btn)) svg.addEventListener('pointerdown', (e) => this.#down(e, { kind: 'btn', act }));
    addEventListener('pointermove', (e) => this.#move(e));
    addEventListener('pointerup', (e) => this.#up(e));
    addEventListener('pointercancel', (e) => this.#up(e));
    // Un toque en la pantalla de juego no debe convertirse en un clic de ratón (dispararía).
    // Tocar la pantalla de juego: apunta hacia ese punto y dispara, como el ratón (y
    // mantener el dedo y moverlo arrastra la mira). En los menús, el toque es un toque.
    document.getElementById('stage').addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.#menuOpen() || !this.game.room) return;
      e.preventDefault();
      this.lastTouch = performance.now();
      this.pointers.set(e.pointerId, { kind: 'screen' });
      this.#mouse('mousemove', e);
      this.#mouse('mousedown', e);
    });
    const loop = () => { this.#tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  #menuOpen() {
    const g = this.game, overlay = document.getElementById('overlay');
    return !!((overlay && !overlay.hidden) || g.nodeMenu?.open || g.genome?.open || g.devMenu?.open);
  }

  #down(e, info) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault(); // sin clics ni ratón simulados
    e.stopPropagation();
    this.lastTouch = performance.now();
    if (this.hidden) this.#enable();
    const p = { ...info, x0: e.clientX, y0: e.clientY, drag: false };
    this.pointers.set(e.pointerId, p);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (info.kind === 'pad') this.#padAt(p, e);
    else this.#press(info.act, p);
  }

  #move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.lastTouch = performance.now();
    if (p.kind === 'pad') return this.#padAt(p, e);
    if (p.kind === 'screen') return this.#mouse('mousemove', e);
    // Arrastrar desde DISPARAR o TENDÓN: apuntar a mano.
    if (p.act === 'fire' || p.act === 'grapple') {
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0, m = Math.hypot(dx, dy);
      if (m > DRAG) {
        p.drag = true;
        const aim = this.input.padAim;
        aim.x = dx / m; aim.y = dy / m; aim.active = true;
        this.#showAim(p, dx / m, dy / m);
      }
    }
  }

  #up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.kind === 'pad') { p.dirs = new Set(); this.#sync(); return; }
    if (p.kind === 'screen') return this.#mouse('mouseup', e);
    this.#release(p.act, p);
  }

  // Ratón simulado en el punto tocado (lo lee Input como el ratón de verdad).
  #mouse(type, e) {
    dispatchEvent(new MouseEvent(type, { clientX: e.clientX, clientY: e.clientY, button: 0 }));
  }

  // Cruceta: la dirección sale del vector desde el centro (vale deslizar el pulgar).
  #padAt(p, e) {
    const r = this.pad.svg.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    const nx = (e.clientX - cx) / R, ny = (e.clientY - cy) / R;
    const dirs = new Set();
    if (Math.hypot(nx, ny) > 0.18) {
      if (nx < -0.32) dirs.add('left');
      if (nx > 0.32) dirs.add('right');
      if (ny < -0.42) dirs.add('up');
      if (ny > 0.42) dirs.add('down');
    }
    p.dirs = dirs;
    this.#sync();
  }

  #press(act, p) {
    if (this.#menuOpen()) {
      // En los menús: SALTAR acepta y ✕ sale; lo demás, como siempre.
      if (MENU_KEYS[act] && (act === 'jump' || act === 'back')) return this.#tap(MENU_KEYS[act]);
    }
    if (act === 'grapple') return; // el tendón se lanza al soltar (para poder apuntarlo)
    p.on = true;
    this.#sync();
  }

  #release(act, p) {
    if (act === 'grapple' && !this.#menuOpen()) {
      // Tocar: al frente (o a lo fijado); arrastrar y soltar: hacia donde arrastraste.
      this.#emit('grapple', true);
      setTimeout(() => { this.#emit('grapple', false); if (!this.#aiming()) this.input.padAim.active = false; this.#showAim(null); }, 50);
    }
    if (p.drag && !this.#aiming(p)) { this.input.padAim.active = false; this.#showAim(null); }
    this.#sync();
  }

  // ¿Queda otro dedo apuntando?
  #aiming(except) { return [...this.pointers.values()].some((q) => q !== except && q.drag); }

  // Junta lo que piden todos los dedos y pulsa/suelta lo que ha cambiado.
  #sync() {
    const want = new Set();
    for (const p of this.pointers.values()) {
      if (p.kind === 'pad') for (const d of p.dirs ?? []) want.add(d);
      else if (p.on) want.add(p.act);
    }
    const menu = this.#menuOpen();
    for (const d of ['up', 'down', 'left', 'right']) this.pad.arms[d].setAttribute('fill', want.has(d) ? 'url(#t-flesh-on)' : 'url(#t-flesh)');
    for (const [act, svg] of Object.entries(this.btn)) svg.classList.toggle('on', want.has(act));
    if (menu) {
      // En un menú todo son toques: la cruceta da pasos (y repite si la mantienes) y
      // los botones pulsan su tecla una vez (genoma, mapa, usar... también cierran).
      const dirs = ['up', 'down', 'left', 'right'];
      for (const a of want) {
        if (this.held.has(a)) continue;
        if (dirs.includes(a)) { this.#tap(MENU_KEYS[a]); this.repeatAt = performance.now() + REPEAT_DELAY; }
        else if (KEYS[a]?.key) this.#tap(KEYS[a].key);
      }
      this.held = want;
      this.menuDirs = new Set([...want].filter((a) => dirs.includes(a)));
      return;
    }
    this.menuDirs = null;
    for (const a of want) if (!this.held.has(a)) this.#emit(a, true);
    for (const a of this.held) if (!want.has(a)) this.#emit(a, false);
    this.held = want;
  }

  #tap(code) {
    dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
    dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
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
    if ([...this.pointers.values()].some((q) => q.kind === 'screen')) dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    this.pointers.clear();
    for (const a of this.held) this.#emit(a, false);
    this.held = new Set();
    this.input.padAim.active = false;
    this.#showAim(null);
  }

  // Marca de mira junto al botón mientras arrastras.
  #showAim(p, x, y) {
    if (!p) { this.aimMark.style.display = 'none'; return; }
    this.aimMark.style.display = 'block';
    this.aimMark.style.left = `${p.x0 + x * 46}px`;
    this.aimMark.style.top = `${p.y0 + y * 46}px`;
  }

  // Cada fotograma: botones según lo que ya tienes, USAR sobre un nodo, repetición en
  // los menús y el aviso de girar el móvil.
  #tick() {
    if (!this.active || this.hidden) return;
    const g = this.game, st = g.state, menu = this.#menuOpen();
    const playing = !!g.room && document.getElementById('overlay')?.hidden;
    this.root.classList.toggle('menu', menu);
    // Al abrirse un menú se suelta lo pulsado (sin volver a pulsarlo); al cerrarse, los
    // dedos que sigan apoyados vuelven a mandar.
    if (menu && !this.wasMenu) { for (const a of this.held) this.#emit(a, false); this.wasMenu = true; }
    else if (!menu && this.wasMenu) { this.wasMenu = false; this.held = new Set(); this.#sync(); }
    this.root.classList.toggle('title', !playing);
    // Los botones pequeños de arriba guardan su hueco aunque aún no los tengas (no se mueven).
    const TOP = ['light', 'weapon', 'genome', 'map', 'back'];
    const show = (act, on) => { if (TOP.includes(act)) this.btn[act].style.visibility = on ? '' : 'hidden'; else this.btn[act].style.display = on ? '' : 'none'; };
    if (st) {
      show('dash', st.has?.('dash'));
      show('grapple', st.has?.('grapple'));
      show('map', st.has?.('map1'));
      show('weapon', (st.weapons?.length ?? 0) > 1);
      const p = g.player;
      show('interact', !!(g.room && p && g.room.nodes?.some((n) => overlap(p, n))));
    }
    show('back', menu);
    if (menu && this.menuDirs?.size && performance.now() > this.repeatAt) {
      for (const d of this.menuDirs) this.#tap(MENU_KEYS[d]);
      this.repeatAt = performance.now() + REPEAT;
    }
    document.body.classList.toggle('portrait', innerHeight > innerWidth);
  }
}
