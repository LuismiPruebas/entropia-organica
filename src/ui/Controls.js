import { keyName } from '../core/Bindings.js';

// Panel de controles: todas las acciones con su tecla/botón en cada sistema.
// En PC: teclado y ratón, y el mando si hay uno conectado (con los símbolos de
// PlayStation o de Xbox según cuál sea). En móvil: solo los controles táctiles.
// Se abre desde la portada (y más adelante desde el juego).

// Botones del mando por estilo: [PlayStation, Xbox]
const PAD = {
  south: ['✕', 'A'], east: ['○', 'B'], west: ['□', 'X'], north: ['△', 'Y'],
  L1: ['L1', 'LB'], R1: ['R1', 'RB'], L2: ['L2', 'LT'], R2: ['R2', 'RT'],
  L3: ['L3', 'LS'], R3: ['R3', 'RS'], start: ['Options', 'Menu'], select: ['Create', 'View'],
};

// [grupo, acción, teclado y ratón, mando (con {botón}), táctil]
const rows = () => [
  ['MOVIMIENTO', 'Moverse', '[A] / [D]  ·  [←] / [→]', 'stick izq.  ·  cruceta', 'cruceta'],
  ['MOVIMIENTO', 'Saltar (y saltar de la pared)', '[W]  ·  [Espacio]  ·  [↑]', '{south}', 'SALTAR'],
  ['MOVIMIENTO', 'Agacharse  ·  trepar con garras', '[S] / [W]  ·  [↓] / [↑]', 'stick / cruceta abajo · arriba', 'cruceta abajo · arriba'],
  ['MOVIMIENTO', 'Embestida', 'doble toque [A] o [D]', '{L1}  ·  {L3}', 'botón de embestida'],
  ['MOVIMIENTO', 'Tendón (lanzar · soltar)', '[Q]  ·  clic derecho', '{L2}', 'botón del tendón (arrástralo para apuntar)'],
  ['COMBATE', 'Apuntar', 'ratón', 'stick der. (360°)', 'toca la pantalla'],
  ['COMBATE', 'Disparar  ·  golpear de cerca', 'clic izq. (mantén: ráfaga)', '{R1} (mantén: ráfaga)', 'DISPARAR  ·  tocar la pantalla'],
  ['COMBATE', 'Cambiar de arma', '[R]', '{R2}', 'botón del arma'],
  ['CUERPO', 'Ojo fotóforo (luz)', '[F]', '{west}', 'botón del ojo'],
  ['CUERPO', 'Usar la cavidad activa', `[${keyName('cavityUse')}]`, '{R3} (un toque)', 'botón de la cavidad (un toque)'],
  ['CUERPO', 'Cambiar de cavidad', `[${keyName('cavityNext')}]`, 'mantén {R3} + cruceta ← →', 'mantén el botón de la cavidad + cruceta'],
  ['CUERPO', 'Usar nodo  ·  hablar  ·  pasar texto', '[E]', '{north}', 'USAR'],
  ['MENÚS', 'Genoma (mutaciones, cavidades)', '[I]', '{start}', 'botón del genoma'],
  ['MENÚS', 'Mapa', '[M]', '{select}', 'botón del mapa'],
  ['MENÚS', 'Elegir  ·  aceptar', 'flechas  ·  [Intro]', 'cruceta / stick  ·  {south}', 'cruceta  ·  SALTAR'],
  ['MENÚS', 'Salir  ·  cerrar textos', '[Esc]', '{east}', 'botón ✕'],
  ['MENÚS', 'Pantalla completa', '[P]', '—', 'botón de la esquina'],
];

// Mando conectado (el primero) y su estilo: 0 PlayStation, 1 Xbox / genérico.
function connectedPad() {
  for (const p of navigator.getGamepads?.() ?? []) if (p?.connected) return p;
  return null;
}
const padStyle = (pad) => (/054c|dualsense|dualshock|playstation|wireless controller/i.test(pad.id) ? 0 : 1);

export class ControlsPanel {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.id = 'controls-panel';
    this.el.hidden = true;
    parent.append(this.el);
    // Que un clic dentro no cuente como clic en la portada (la haría avanzar).
    this.el.addEventListener('click', (e) => { e.stopPropagation(); if (e.target.closest('.cp-close')) this.close(); });
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      e.preventDefault(); e.stopImmediatePropagation();
      // Flechas: desplazan la lista; Esc, Intro, E... cierran.
      const sc = this.el.querySelector('.cp-scroll');
      if (e.code === 'ArrowDown' || e.code === 'KeyS') sc.scrollTop += 24;
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') sc.scrollTop -= 24;
      // Intro / Espacio no cierran: el ✕ / A del mando llega como Intro, y pulsarlo es
      // justo lo que hace que el navegador descubra el mando.
      else if (['Escape', 'KeyE', 'Backspace'].includes(e.code)) this.close();
    }, true);
    // El navegador no enseña un mando hasta que se pulsa uno de sus botones (aunque ya
    // esté enchufado): con el panel abierto se mira a menudo y se rehace al aparecer.
    this.padId = null;
    setInterval(() => {
      if (!this.open) return;
      const id = connectedPad()?.id ?? null;
      if (id !== this.padId) this.#render();
    }, 300);
  }

  get open() { return !this.el.hidden; }

  show() { this.#render(); this.el.hidden = false; }
  close() { this.el.hidden = true; }
  toggle() { if (this.open) this.close(); else this.show(); }

  #render() {
    const touch = document.body.classList.contains('touch') || matchMedia?.('(hover: none) and (pointer: coarse)').matches;
    const pad = touch ? null : connectedPad();
    this.padId = pad?.id ?? null;
    const scroll = this.el.querySelector('.cp-scroll')?.scrollTop ?? 0;
    const ps = pad ? padStyle(pad) : 1;
    const padText = (s) => s.replace(/\{(\w+)\}/g, (_, b) => `<kbd>${PAD[b]?.[ps] ?? b}</kbd>`);
    const kb = (s) => s.replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
    const cols = touch ? [['TÁCTIL', 4]] : [['TECLADO Y RATÓN', 2], ...(pad ? [[ps ? 'MANDO (XBOX)' : 'MANDO (PLAYSTATION)', 3]] : [])];
    let group = '';
    const body = rows().map((r) => {
      const head = r[0] !== group ? `<tr class="cp-group"><th colspan="${cols.length + 1}">${(group = r[0])}</th></tr>` : '';
      return `${head}<tr><td class="cp-act">${r[1]}</td>${cols.map(([, i]) => `<td>${i === 3 ? padText(r[i]) : i === 2 ? kb(r[i]) : r[i]}</td>`).join('')}</tr>`;
    }).join('');
    const note = touch ? '' : pad ? '' : '<p class="cp-note">¿Tienes un mando enchufado? <b>Pulsa cualquier botón</b>: el navegador no lo muestra hasta entonces y aquí aparecerá su columna.</p>';
    this.el.innerHTML = `
      <div class="cp-box">
        <header><h2>CONTROLES</h2><button class="cp-close" type="button">✕</button></header>
        ${note}
        <div class="cp-scroll">
          <table><thead><tr><th></th>${cols.map(([t]) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
        </div>
        <footer>${touch ? 'Toca ✕ para volver' : `Esc${pad ? ` / ${PAD.east[ps]}` : ''} para volver`}</footer>
      </div>`;
    this.el.querySelector('.cp-scroll').scrollTop = scroll;
  }
}
