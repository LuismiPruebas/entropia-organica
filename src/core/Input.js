const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F9']);

// Teclado + ratón. `hit` = pulsado en este paso lógico; se limpia en endStep().
export class Input {
  constructor(canvas, viewW, viewH) {
    this.canvas = canvas;
    this.viewW = viewW;
    this.viewH = viewH;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { x: viewW / 2, y: viewH / 2, buttons: new Set() };

    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('mousemove', (e) => this.#track(e));
    addEventListener('mousedown', (e) => {
      this.#track(e);
      const code = `Mouse${e.button}`;
      this.keys.add(code);
      this.pressed.add(code);
    });
    addEventListener('mouseup', (e) => {
      const code = `Mouse${e.button}`;
      this.keys.delete(code);
      this.released.add(code);
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => {
      for (const k of this.keys) this.released.add(k);
      this.keys.clear();
    });
  }

  #track(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - r.left) / r.width) * this.viewW;
    this.mouse.y = ((e.clientY - r.top) / r.height) * this.viewH;
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  up(...codes) { return codes.some((c) => this.released.has(c)); }

  endStep() {
    this.pressed.clear();
    this.released.clear();
  }
}
