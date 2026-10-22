import { Game } from './Game.js';
import { VIEW_W, VIEW_H } from './core/Visual.js';
import { LEVELS, START } from './data/levels.js';
import { ControlsPanel } from './ui/Controls.js';

// Pruebas desde el editor de niveles (editor.html): con ?editor se cargan las salas
// editadas (aún sin guardar) que el editor dejó en localStorage.
if (new URLSearchParams(location.search).has('editor')) {
  try {
    const ov = JSON.parse(localStorage.getItem('linfa.editor') ?? 'null');
    if (ov) { Object.assign(LEVELS, ov.rooms); if (ov.start) Object.assign(START, ov.start); }
  } catch { /* sin datos del editor: se juega con lo guardado */ }
}

const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const callToAction = overlay.querySelector('.blink');

// Escala el lienzo lógico de 384x216 para llenar la ventana (manteniendo 16:9).
function fit() {
  const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
  stage.style.transform = `scale(${s})`;
}
addEventListener('resize', fit);
document.addEventListener('fullscreenchange', fit);
fit();

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
document.getElementById('fullscreen').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFullscreen();
});
addEventListener('keydown', (e) => { if (e.code === 'KeyP') toggleFullscreen(); });

let game;
try {
  game = new Game(document.getElementById('game'));
  window.game = game; // depuración desde la consola: game.state.biomass = 100
  // La música de la portada desde el principio (si el navegador lo impide, suena con la
  // primera tecla, clic o toque).
  const qs = new URLSearchParams(location.search);
  if (!qs.has('room') && !qs.has('play')) { game.audio.init(); game.audio.startTitleMusic(); }
} catch (err) {
  console.error(err);
  window.bootError?.(`No se pudo iniciar WebGL: ${err.message}`);
}

// Inicio en dos pasos: el navegador solo deja sonar audio tras un gesto del jugador.
//   1) "Despertar": pantalla completa + música ambiental.
//   2) "Descender": empieza la partida.
let phase = 'sleep';
function advance() {
  if (!game) return;
  if (phase === 'sleep') {
    phase = 'title';
    if (!document.fullscreenElement) toggleFullscreen();
    game.audio.init();
    game.audio.startTitleMusic();
    callToAction.textContent = document.body.classList.contains('touch') ? 'TOCA PARA DESCENDER' : 'HAZ CLIC PARA DESCENDER';
  } else if (phase === 'title') {
    phase = 'play';
    game.start();
  }
}
overlay.addEventListener('click', advance);
// Panel de controles desde la portada: botón, E o △ / Y del mando.
const controls = new ControlsPanel(overlay);
const controlsBtn = document.getElementById('controls-btn');
controlsBtn.addEventListener('click', (e) => { e.stopPropagation(); controls.show(); });
addEventListener('keydown', (e) => { if (e.code === 'KeyE' && phase !== 'play' && !overlay.hidden && !controls.open) controls.show(); });
// En pantallas táctiles, la portada lo dice con sus palabras.
if (matchMedia?.('(hover: none) and (pointer: coarse)').matches) callToAction.textContent = 'TOCA PARA DESPERTAR';
addEventListener('keydown', (e) => {
  if ((e.code === 'Enter' || e.code === 'Space') && phase !== 'play' && !overlay.hidden && !controls.open) advance();
});

// Atajos de desarrollo: ?play  ·  ?room=C&spawn=20,12&mut=tendon,quitina&aim=1,0
const q = new URLSearchParams(location.search);
if (game && (q.has('play') || q.has('room'))) {
  phase = 'play';
  game.start();
  for (const id of q.get('mut')?.split(',') ?? []) {
    game.state.dna.add(id);
    game.state.install(id);
  }
  for (const id of q.get('dna')?.split(',') ?? []) game.state.dna.add(id);
  if (q.has('light')) game.state.light = Number(q.get('light'));
  if (q.has('room')) game.loadRoom(q.get('room'), (q.get('spawn') ?? '1,1').split(',').map(Number));
  if (q.has('aim')) {
    // Dirección de la mirada relativa al personaje, no al centro de la pantalla.
    const [ax, ay] = q.get('aim').split(',').map(Number);
    const p = game.player, cam = game.visual.cam;
    game.input.mouse.x = p.cx - cam.x + ax * 80;
    game.input.mouse.y = p.y - cam.y + ay * 80;
  }
  if (q.has('map')) game.mapView.toggle(); // minimapa del HUD abierto
  // Avanza N pasos lógicos de golpe (pruebas deterministas, sin depender del navegador).
  for (let i = 0; i < Number(q.get('steps') ?? 0); i++) game.update(1 / 60);
  if (q.has('genome')) {
    game.openGenome();
    const focus = q.get('genome');
    if (focus) game.genome.el.querySelector(`[data-id="${focus}"]`)?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  }
}
