import { LEVELS } from '../data/levels.js';
import { roomConnections } from '../data/connections.js';
import { BIOMES } from '../data/biomes.js';
import { DNA_CHARS } from '../data/mutations.js';
import { caps } from './Hud.js';

// Mapa interno: un minimapa en el HUD (tecla M lo muestra u oculta, sin pausar).
// Va centrado en tu posición. Lo que muestra depende de la línea del Cerebro:
//   map1 Ganglio Cartógrafo   salas visitadas, conexiones, Nodos y tu posición
//   map2 Órgano Ecolocador    + salas vecinas sin visitar
//   map3 Tercer Ojo           + objetos, ADN y secretos que quedan por recoger

const W = 104, H = 52;   // lienzo del minimapa (píxeles del HUD)
const CELL = 10;         // píxeles por casilla del mapa del mundo
const ITEM_COLORS = { dna: '#c07bff', g: '#7dff9a', Q: '#ff5a6a', h: '#ff9ab0', hidden: '#ffffff', other: '#d8c8a0' };
const MARKED = /[bBSOQhg]/;

export class MapView {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'minimap';
    this.el.hidden = true;
    this.el.innerHTML = `<canvas width="${W}" height="${H}"></canvas><span></span>`;
    document.getElementById('hud').append(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.label = this.el.querySelector('span');
    this.g = this.canvas.getContext('2d');
    this.open = false;
  }

  toggle() {
    this.open = !this.open;
    this.el.hidden = !this.open;
    return this.open;
  }

  // Qué salas se dibujan y cómo.
  #knownRooms() {
    const st = this.game.state;
    // Lo recorrido más lo que los jefes grabaron en tu memoria al morir.
    const visited = new Set([...st.visited, ...st.mapRevealed]);
    const adjacent = new Set();
    if (st.has('map2')) {
      for (const id of visited) for (const ex of roomConnections(LEVELS[id])) if (!visited.has(ex.to)) adjacent.add(ex.to);
    }
    return { visited, adjacent };
  }

  #items(id) {
    const st = this.game.state, lv = LEVELS[id], out = [];
    const hidden = new Set((lv.hidden ?? []).map(([x, y]) => `${x},${y}`));
    lv.grid.forEach((row, y) => [...row].forEach((c, x) => {
      const isDna = !!DNA_CHARS[c];
      if (!isDna && !MARKED.test(c)) return;
      if (st.collected.has(`${id}:${x},${y}`)) return;
      const color = hidden.has(`${x},${y}`) ? ITEM_COLORS.hidden : isDna ? ITEM_COLORS.dna : ITEM_COLORS[c] ?? ITEM_COLORS.other;
      out.push({ fx: (x + 0.5) / row.length, fy: (y + 0.5) / lv.grid.length, color, big: isDna || c === 'g' });
    }));
    return out;
  }

  // Se repinta desde el bucle del juego (Game.render), solo si está abierto.
  draw(t) {
    if (!this.open) return;
    const g = this.g, game = this.game, st = game.state, room = game.room, p = game.player;
    if (!room) return;
    const { visited, adjacent } = this.#knownRooms();
    const here = LEVELS[room.id];
    // Centro: tu posición dentro de la sala actual, en casillas del mapa del mundo.
    const mx = here.map[0] + (p.cx / room.world.pixelW) * here.map[2];
    const my = here.map[1] + (p.cy / room.world.pixelH) * here.map[3];
    const rect = (l) => [
      Math.round(W / 2 + (l.map[0] - mx) * CELL) + 1, Math.round(H / 2 + (l.map[1] - my) * CELL) + 1,
      l.map[2] * CELL - 2, l.map[3] * CELL - 2,
    ];

    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(4, 4, 10, 0.72)';
    g.fillRect(0, 0, W, H);

    // Conexiones entre salas conocidas.
    g.fillStyle = '#6a6a7a';
    for (const id of visited) {
      for (const ex of roomConnections(LEVELS[id])) {
        if (!visited.has(ex.to) && !adjacent.has(ex.to)) continue;
        const lv = LEVELS[id], [x, y, w, h] = rect(lv);
        if (ex.x !== undefined && !ex.side) {
          // Punto de conexión: la marca en su sitio (fuera del borde si está pegado a él).
          const W0 = lv.grid[0].length, H0 = lv.grid.length;
          const fx = (ex.x + ex.w / 2) / W0, fy = (ex.y + ex.h / 2) / H0;
          const px = ex.x === 0 ? x - 2 : ex.x + ex.w >= W0 ? x + w : x + w * fx - 1;
          const py = ex.y === 0 ? y - 2 : ex.y + ex.h >= H0 ? y + h : y + h * fy - 1;
          g.fillRect(px, py, 2, 2);
          continue;
        }
        const horiz = ex.side === 'left' || ex.side === 'right';
        const at = ex.at ? Math.min(1, (ex.at[0] + ex.at[1]) / 2 / (horiz ? lv.grid.length : lv.grid[0].length)) : 0.5;
        if (ex.side === 'right') g.fillRect(x + w, y + h * at - 1, 2, 2);
        if (ex.side === 'left') g.fillRect(x - 2, y + h * at - 1, 2, 2);
        if (ex.side === 'top') g.fillRect(x + w * at - 1, y - 2, 2, 2);
        if (ex.side === 'bottom') g.fillRect(x + w * at - 1, y + h, 2, 2);
      }
    }
    // Salas vecinas sin visitar (Ecolocación): contorno punteado.
    g.fillStyle = '#4a4a5a';
    for (const id of adjacent) {
      const [x, y, w, h] = rect(LEVELS[id]);
      for (let i = 0; i < w; i += 2) { g.fillRect(x + i, y, 1, 1); g.fillRect(x + i, y + h - 1, 1, 1); }
      for (let i = 0; i < h; i += 2) { g.fillRect(x, y + i, 1, 1); g.fillRect(x + w - 1, y + i, 1, 1); }
    }
    // Salas visitadas con el color de su bioma; las secretas, más tenues.
    for (const id of visited) {
      const lv = LEVELS[id], c = BIOMES[lv.biome].mapColor;
      const [x, y, w, h] = rect(lv);
      g.globalAlpha = lv.secret ? 0.18 : 0.32;
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
      g.strokeStyle = c;
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (lv.grid.some((r) => r.includes('N'))) {
        g.fillStyle = '#7dff9a';
        g.fillRect(x + 2, y + 3, 3, 1);
        g.fillRect(x + 3, y + 2, 1, 3);
      }
    }
    // Tercer Ojo: lo que queda por recoger.
    if (st.has('map3')) {
      for (const id of [...visited, ...adjacent]) {
        const [x, y, w, h] = rect(LEVELS[id]);
        for (const it of this.#items(id)) {
          g.fillStyle = it.color;
          g.fillRect(Math.round(x + it.fx * w), Math.round(y + it.fy * h), it.big ? 2 : 1, it.big ? 2 : 1);
        }
      }
    }
    // Sala actual (latiendo) y tú, en el centro.
    const [x, y, w, h] = rect(here);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
    g.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.55})`;
    g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    g.fillStyle = '#ff2a2a';
    g.fillRect(W / 2 - 1, H / 2 - 1, 3, 3);
    g.fillStyle = `rgba(255,140,140,${pulse})`;
    g.fillRect(W / 2 - 2, H / 2, 5, 1);
    g.fillRect(W / 2, H / 2 - 2, 1, 5);

    // El nombre de la sala (ya no está en el HUD) y el nivel del mapa.
    const tier = st.has('map3') ? 'III' : st.has('map2') ? 'II' : 'I';
    this.label.textContent = `${caps(here.name)} · ${tier}`;
  }
}
