// Navegación de menús con teclado (y mando, que envía las mismas teclas):
// flechas o WASD mueven la selección hacia el elemento más cercano en esa dirección,
// Intro o Espacio lo marcan. El ratón sigue funcionando: pasar por encima también
// selecciona. Sirve igual para listas (nodo), rejillas (desarrollo) o el árbol del genoma.
const DIRS = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};

export class MenuNav {
  // el: contenedor · selector: elementos elegibles
  // isOpen(): si el menú está abierto · onPick(item): al marcar (por defecto, clic)
  // onSelect(item): al cambiar la selección
  constructor(el, selector, { isOpen, onPick, onSelect } = {}) {
    this.el = el;
    this.selector = selector;
    this.isOpen = isOpen;
    this.onPick = onPick ?? ((item) => item.click());
    this.onSelect = onSelect;
    this.index = 0;
    addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      const d = DIRS[e.code];
      if (d) { e.preventDefault(); this.move(d[0], d[1]); return; }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (e.repeat) return;
        const item = this.current();
        if (!item) return;
        document.activeElement?.blur?.(); // que el botón con foco no se pulse dos veces
        this.onPick(item);
        this.restore();
      }
    });
    el.addEventListener('mouseover', (e) => {
      const item = e.target.closest?.(selector);
      if (item && this.items().includes(item)) this.select(item, false);
    });
  }

  items() {
    return [...this.el.querySelectorAll(this.selector)].filter((b) => !b.disabled && b.offsetParent !== null);
  }

  current() {
    return this.items().find((b) => b.classList.contains('nav-sel')) ?? null;
  }

  select(item, notify = true) {
    const list = this.items();
    for (const b of this.el.querySelectorAll('.nav-sel')) b.classList.remove('nav-sel');
    if (!item) return;
    item.classList.add('nav-sel');
    item.scrollIntoView?.({ block: 'nearest' }); // en listas con desplazamiento, que se vea
    this.index = list.indexOf(item);
    if (notify) this.onSelect?.(item);
  }

  // Tras repintar el menú, vuelve a seleccionar la misma posición (o la más cercana).
  restore() {
    const list = this.items();
    if (!list.length || this.current()) return;
    this.select(list[Math.min(Math.max(0, this.index), list.length - 1)], false);
  }

  // El elemento más cercano en la dirección pedida; si no hay ninguno, da la vuelta.
  move(dx, dy) {
    const list = this.items();
    if (!list.length) return;
    const cur = this.current();
    if (!cur) return this.select(list[0]);
    const c = center(cur);
    let best = null, bestScore = Infinity;
    for (const b of list) {
      if (b === cur) continue;
      const p = center(b), vx = p.x - c.x, vy = p.y - c.y;
      const along = vx * dx + vy * dy, across = Math.abs(vx * dy - vy * dx);
      if (along <= 2) continue;
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (!best && dy) {
      // Arriba/abajo sin nada más allá: da la vuelta al otro extremo, en la misma
      // columna (lista circular). A los lados sin nada, la selección se queda quieta.
      let far = -Infinity;
      for (const b of list) {
        const p = center(b), back = -(p.y - c.y) * dy - Math.abs(p.x - c.x) * 2.5;
        if (b !== cur && back > far) { far = back; best = b; }
      }
    }
    if (best) this.select(best);
  }
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
