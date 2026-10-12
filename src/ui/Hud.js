import { Placenta, drawNumber, drawBoneIcon, drawCellIcon, drawItemIcon } from './Bladders.js';
import { ITEMS } from '../state/State.js';

const $ = (id) => document.getElementById(id);

// Mayúsculas sin tildes: la fuente pixel no tiene vocales acentuadas en mayúscula.
export const caps = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export class Hud {
  constructor() {
    this.root = $('hud');
    this.msg = $('message');
    this.prompt = $('prompt');
    this.msgTime = 0;
    this.cache = {};
  }

  show(v) { this.root.hidden = !v; }

  say(text, seconds = 2.5) {
    this.msg.textContent = text;
    this.msg.classList.add('show');
    this.msgTime = seconds;
  }

  // Jefe de zona (null = ocultar): su nombre siempre; su vida, solo si sabes leerla
  // (Cerebro I u Ojo II).
  setBoss(e, showHp) {
    const el = $('boss-bar');
    el.hidden = !e;
    if (!e) return;
    const k = `${e.def.name}:${Math.ceil(e.hp)}:${showHp}`;
    if (this.cache.boss === k) return;
    this.cache.boss = k;
    el.querySelector('span').textContent = caps(e.def.name);
    el.querySelector('.bar').hidden = !showHp;
    el.querySelector('.fill').style.width = `${Math.max(0, e.hp / e.def.hp) * 100}%`;
  }

  setPrompt(text) {
    if (this.cache.prompt !== text) this.prompt.textContent = this.cache.prompt = text;
  }

  // HUD orgánico: una placenta ovalada que contiene una vejiga por parámetro. Cada
  // vejiga crece al llenarse y se arruga al vaciarse, y se empujan entre ellas, así
  // que el sitio que ocupa cada una cambia en directo. Sin textos:
  //   integridad: sangre roja (verde si te infectas) · biomasa: carne líquida rosa · oxígeno: azul
  //   luz: del color de tu ojo · rechazo: violeta · corrupción: un bulto necrosado
  update(dt, st, roomName, eye = [1, 0.82, 0.25]) {
    this.msgTime -= dt;
    if (this.msgTime <= 0) this.msg.classList.remove('show');
    this.t = (this.t ?? 0) + dt;
    const t = this.t;
    this.g ??= $('organs-c').getContext('2d');
    this.gl ??= $('organs-glow').getContext('2d');
    this.placenta ??= new Placenta(34, 20, 26, 17);
    const g = this.g, gl = this.gl;
    g.clearRect(0, 0, 110, 40);
    gl.clearRect(0, 0, 110, 40);
    const lux = '#' + eye.map((c) => Math.round(Math.min(1, c) * 255).toString(16).padStart(2, '0')).join('');
    const hp = st.integrity / 100, infected = st.infection > 0, bio = st.biomass / st.biomassMax;
    const items = [
      { id: 'int', level: hp, rMin: 2.5, rMax: 11.5, color: infected ? '#6a9a30' : '#c0283a', low: hp < 0.25, boil: infected ? 0.9 : 0.2 },
      { id: 'bio', level: bio, rMin: 2.5, rMax: 8, color: '#e07a98', low: bio < 0.15, boil: 0.15 },
      { id: 'o2', level: st.oxygen / 100, rMin: 2.5, rMax: 7.5, color: '#4ab8f0', low: st.oxygen < 20, boil: 0.5 },
      { id: 'lux', level: st.light / 100, rMin: 2.5, rMax: 7.5, color: st.flashlightOn ? lux : '#5a5040', low: st.light < 20, boil: st.flashlightOn ? 0.3 : 0, glow: st.flashlightOn },
      { id: 'rej', level: Math.min(1, st.rejection / 100), rMin: 1.5, rMax: 7, color: st.critical ? '#ff4a8a' : '#a040d8', low: st.critical, boil: Math.min(1, st.rejection / 80) },
      { id: 'dead', level: st.corrupted / 100, rMin: 0, rMax: 7, color: '#3a2a30', dead: true },
    ];
    this.placenta.update(items, dt, t);
    this.placenta.draw(g, gl, t);
    // En fila: icono del hueso y su valor (munición de las astillas), luego la célula y el suyo.
    drawBoneIcon(g, 64, 15, t);
    drawNumber(g, 75, 15, st.scrap, st.scrap === 0 ? '#ff5a5a' : '#e8dcc8');
    // Células lumínicas en reserva: recargan el ojo solas cuando se apaga.
    const cx = 75 + String(st.scrap).length * 4 + 4;
    drawCellIcon(g, cx, 13, t, st.cells > 0);
    drawNumber(g, cx + 6, 15, st.cells, st.cells === 0 ? '#6a6050' : '#ffd23f');
    // Debajo, los consumibles que lleves (o el que esté activo, con lo que le queda).
    let ix = 64;
    for (const kind of ['shield', 'regen']) {
      const n = st.items[kind], left = st.timers[kind];
      if (!n && !left) continue;
      drawItemIcon(g, kind, ix, 25, t, left > 0);
      drawNumber(g, ix + 8, 26, n, kind === 'shield' ? '#4ff0ff' : '#7dff9a');
      if (left > 0) { g.fillStyle = kind === 'shield' ? '#4ff0ff' : '#7dff9a'; g.fillRect(ix, 32, Math.ceil((6 * left) / ITEMS[kind].time), 1); }
      ix += 8 + String(n).length * 4 + 5;
    }
  }
}
