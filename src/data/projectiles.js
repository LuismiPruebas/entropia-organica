// Catálogo de proyectiles: cada uno con su aspecto, su física y lo que deja al volar y
// al chocar, según de dónde sale. Lo usa entities/Projectile.js por `kind`.
//
//   size    [w, h] del sprite (centrado en la caja de impacto, que es aparte)
//   frames / fps   animación; paint(g, gl, f, p) pinta el fotograma f (gl: brillo)
//   tinted  la caché distingue por p.color (p. ej. las notas del Coro, de dos colores)
//   orient  'velocity' apunta hacia donde vuela · 'spin' gira · 'rock' se mece
//   spin    vueltas por segundo (con 'spin')
//   physics valores por defecto que el disparo puede sobrescribir:
//           gravity, drag (frena), bounce (rebotes), restitution, friction (al rebotar
//           en el suelo), wobble [amplitud px, frecuencia] (oscila de lado a lado de su
//           trayectoria), home (deriva lateral hacia ti, px/s²), sink (velocidad de caída
//           máxima: flota)
//   trail(game, p, dt)   lo que va soltando     impact(game, p)   al chocar o caducar
//   bounceFx(game, p)    al rebotar

const px = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const R = (a, b) => a + Math.random() * (b - a);

// Píxeles de una elipse (centro cx, cy; radios rx, ry), con un color por anillo.
function ellipse(g, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d <= 1) px(g, x, y, typeof color === 'function' ? color(d, x - cx, y - cy) : color);
    }
  }
}

// Gotas que caen y manchan (sangre, pus, ácido).
function drips(game, p, n, color, stain, spread = 40) {
  for (let i = 0; i < n; i++) {
    game.particles.emit(p.cx, p.cy, { vx: p.vx * 0.15 + R(-spread, spread), vy: p.vy * 0.15 + R(-spread, spread * 0.4), life: R(0.4, 0.9), gravity: 520, color, stain });
  }
}
function sparks(game, p, n, color, speed = 80, life = 0.25) {
  for (let i = 0; i < n; i++) game.glowParticles.emit(p.cx, p.cy, { vx: R(-speed, speed), vy: R(-speed, speed), life: R(life * 0.5, life), color });
}
// Suelta algo cada `every` segundos de vuelo.
function every(p, dt, s) {
  p.trailT = (p.trailT ?? Math.random() * s) - dt;
  if (p.trailT > 0) return false;
  p.trailT += s;
  return true;
}

export const PROJECTILES = {
  // ------------------------------------------------------------------ enemigos
  // Ojo de Techo (Sistema Nervioso): saliva infectada. Un glóbulo morado que tiembla,
  // con grumos de pus, y va goteando. Lento y franco: el primer patrón que aprendes.
  spit: {
    size: [8, 7], frames: 4, fps: 10, orient: 'velocity',
    physics: { gravity: 60 },
    paint(g, gl, f) {
      const s = Math.sin((f / 4) * Math.PI * 2) * 0.5;
      ellipse(g, 4, 3.5, 3 + s, 2.5 - s * 0.6, (d) => (d > 0.65 ? '#5a1048' : d > 0.25 ? '#9a3a9a' : '#c87ad8'));
      px(g, 2, 2, '#f0e0ff');
      px(g, 4 + (f % 2), 4, '#e0c860'); px(g, 5, 2 + (f >> 1), '#e0c860'); // grumos de pus
      px(g, 0, 3, '#7a2a7a'); // cola
      ellipse(gl, 4, 3.5, 2.5, 2, 'rgba(150,60,220,0.55)');
    },
    trail(game, p, dt) { if (every(p, dt, 0.07)) drips(game, p, 1, [0.55, 0.2, 0.6], '#3a0a3a', 10); },
    impact(game, p) { drips(game, p, 7, [0.6, 0.25, 0.7], '#3a0a3a', 70); sparks(game, p, 3, [0.6, 0.3, 0.9], 50); },
  },

  // Ojo de Techo (Cavidad Pulmonar): semillas de espora con vilano. Salen despacio,
  // frenan en el aire y flotan meciéndose mientras derivan hacia ti. Esquivarlas es
  // leer el viento, no reaccionar rápido.
  seed: {
    size: [11, 11], frames: 4, fps: 6, orient: 'rock',
    physics: { gravity: 30, drag: 1.6, sink: 32, wobble: [5, 2.2], home: 22 },
    paint(g, gl, f) {
      const sway = [0, 1, 0, -1][f];
      // vilano: hebras pálidas que salen de la semilla hacia arriba
      for (const [dx, h] of [[-4, 3], [-2, 4], [0, 5], [2, 4], [4, 3]]) {
        const tx = 5 + dx + sway * (Math.abs(dx) > 2 ? 1 : 0), ty = 5 - h;
        for (let i = 1; i <= h; i++) px(g, Math.round(5 + (tx - 5) * (i / h)), 6 - i, i === h ? '#f4f8d8' : '#c8d0a0');
        px(gl, tx, ty, 'rgba(210,240,150,0.6)');
      }
      ellipse(g, 5.5, 8, 1.5, 2.2, (d) => (d > 0.5 ? '#5a4420' : '#a07a38')); // la semilla
      px(g, 5, 7, '#d8b060');
    },
    trail(game, p, dt) {
      if (every(p, dt, 0.18)) game.glowParticles.emit(p.cx + R(-3, 3), p.cy, { vx: R(-6, 6), vy: R(4, 12), life: 0.7, color: [0.7, 0.85, 0.45] });
    },
    impact(game, p) {
      for (let i = 0; i < 9; i++) game.glowParticles.emit(p.cx, p.cy, { vx: R(-35, 35), vy: R(-30, 15), life: R(0.5, 1), color: [0.75, 0.9, 0.5] });
    },
  },

  // Ojo de Techo (Sistema Digestivo): cálculos de sarro endurecido, con vetas de
  // ácido. Caen en parábola, rebotan dos veces perdiendo fuerza y se hacen añicos.
  tartar: {
    size: [8, 8], frames: 1, orient: 'spin', spin: 2.2,
    physics: { gravity: 460, bounce: 2, restitution: 0.58, friction: 0.82 },
    paint(g, gl) {
      const shape = ['..###...', '.#####..', '########', '#######.', '.######.', '.#####..', '..###...', '........'];
      shape.forEach((row, y) => [...row].forEach((c, x) => {
        if (c !== '#') return;
        const lit = x + y < 6 ? '#e4d6a0' : x + y < 9 ? '#b8a46c' : '#7a6a42';
        px(g, x, y, lit);
      }));
      px(g, 3, 2, '#4a3e26'); px(g, 4, 3, '#4a3e26'); px(g, 5, 5, '#4a3e26'); // grietas
      px(g, 2, 4, '#9be06a'); px(g, 6, 3, '#7ac04a'); // vetas de ácido
      px(gl, 2, 4, 'rgba(120,230,80,0.6)');
    },
    trail(game, p, dt) {
      if (every(p, dt, 0.09)) game.particles.emit(p.cx, p.cy, { vx: R(-10, 10), vy: R(-10, 5), life: 0.3, color: [0.55, 0.5, 0.35] });
    },
    bounceFx(game, p) {
      for (let i = 0; i < 4; i++) game.particles.emit(p.cx, p.cy, { vx: R(-60, 60), vy: R(-80, -20), life: 0.4, gravity: 500, color: [0.75, 0.68, 0.45] });
      game.audio.play('clack', p);
    },
    impact(game, p) {
      for (let i = 0; i < 10; i++) game.particles.emit(p.cx, p.cy, { vx: R(-90, 90), vy: R(-130, -20), life: R(0.4, 0.8), gravity: 560, color: i % 3 ? [0.8, 0.72, 0.48] : [0.4, 0.85, 0.3] });
      game.audio.play('clack', p);
    },
  },
  // Esquirlas de un cálculo que estalla (más adentro del cuerpo).
  tartarShard: {
    size: [3, 3], frames: 1, orient: 'spin', spin: 5,
    physics: { gravity: 520, bounce: 1, restitution: 0.4, friction: 0.7 },
    paint(g) { px(g, 0, 1, '#b8a46c', 3, 1); px(g, 1, 0, '#e4d6a0'); px(g, 1, 2, '#7a6a42'); },
  },

  // Ganglio Madre: carga neural. Una esfera eléctrica que vibra a los lados de su
  // trayectoria y suelta chispas.
  orb: {
    size: [9, 9], frames: 4, fps: 14, orient: 'none',
    physics: { wobble: [3, 9] },
    paint(g, gl, f) {
      ellipse(g, 4.5, 4.5, 3.4, 3.4, (d) => (d > 0.6 ? '#c08a20' : d > 0.2 ? '#ffd25a' : '#fff6d0'));
      const arcs = [[[0, 4], [1, 3], [2, 4]], [[6, 0], [7, 1], [8, 0]], [[8, 6], [7, 7], [8, 8]], [[1, 8], [0, 7], [1, 6]]];
      for (const [x, y] of arcs[f]) { px(g, x, y, '#fff8c0'); px(gl, x, y, 'rgba(255,240,140,1)'); }
      ellipse(gl, 4.5, 4.5, 3.6, 3.6, 'rgba(255,200,80,0.7)');
    },
    trail(game, p, dt) { if (every(p, dt, 0.05)) game.glowParticles.emit(p.cx + R(-3, 3), p.cy + R(-3, 3), { vx: R(-20, 20), vy: R(-20, 20), life: 0.18, color: [1, 0.9, 0.4] }); },
    impact(game, p) { sparks(game, p, 9, [1, 0.85, 0.35], 110, 0.3); },
  },

  // Matriarca: vaina de esporas. Un fruto verde que gira despacio y suelta polvo.
  sporeLob: {
    size: [9, 9], frames: 2, fps: 4, orient: 'spin', spin: 0.6,
    physics: { gravity: 420 },
    paint(g, gl, f) {
      ellipse(g, 4.5, 4.5, 3.5 + f * 0.4, 3.2, (d) => (d > 0.6 ? '#4a6a18' : d > 0.25 ? '#8ab030' : '#c8e070'));
      for (const [x, y] of [[2, 3], [6, 4], [4, 6], [3, 5]]) px(g, x, y, '#2e4210'); // poros
      px(g, 4, 0, '#6a5020', 1, 2); // pedúnculo
      for (const [x, y] of [[2, 3], [6, 4]]) px(gl, x, y, 'rgba(180,230,80,0.7)');
    },
    trail(game, p, dt) { if (every(p, dt, 0.08)) game.glowParticles.emit(p.cx, p.cy, { vx: R(-10, 10), vy: R(-5, 10), life: 0.6, color: [0.6, 0.8, 0.25] }); },
    impact(game, p) { for (let i = 0; i < 12; i++) game.glowParticles.emit(p.cx, p.cy, { vx: R(-60, 60), vy: R(-50, 20), life: R(0.5, 1), color: [0.65, 0.85, 0.3] }); },
  },

  // Quimera: coágulos con una hebra de carne. Vuelan rectos y lo salpican todo.
  tendril: {
    size: [11, 6], frames: 2, fps: 12, orient: 'velocity',
    physics: { gravity: 70 },
    paint(g, gl, f) {
      ellipse(g, 7.5, 3, 3, 2.6, (d) => (d > 0.55 ? '#5a0814' : d > 0.2 ? '#a8182c' : '#e85060'));
      px(g, 8, 2, '#ffc0c0');
      const w = f ? [3, 2, 3, 4] : [2, 3, 4, 3]; // la hebra se retuerce
      for (let i = 0; i < 4; i++) px(g, 3 - i, w[i], '#8a1424');
      ellipse(gl, 7.5, 3, 2.4, 2, 'rgba(255,60,70,0.5)');
    },
    trail(game, p, dt) { if (every(p, dt, 0.05)) drips(game, p, 1, [0.55, 0.04, 0.08], '#5a0814', 15); },
    impact(game, p) { drips(game, p, 9, [0.65, 0.05, 0.1], '#5a0814', 90); },
  },

  // Coro: chorro de ácido, gota a gota.
  acidStream: {
    size: [5, 4], frames: 1, orient: 'velocity',
    physics: { gravity: 280 },
    paint(g, gl) { ellipse(g, 3, 2, 2.2, 1.6, (d) => (d > 0.5 ? '#4a9a2a' : '#c8f090')); px(g, 0, 2, '#4a9a2a'); px(gl, 2, 1, 'rgba(140,255,90,0.8)', 2, 2); },
    trail(game, p, dt) { if (every(p, dt, 0.12)) game.glowParticles.emit(p.cx, p.cy, { vx: 0, vy: 10, life: 0.2, color: [0.4, 1, 0.3] }); },
    impact(game, p) { drips(game, p, 2, [0.35, 0.8, 0.2], null, 40); },
  },

  // Coro: notas de su canto. Anillos que ondulan a los lados de su trayectoria.
  note: {
    size: [8, 8], frames: 2, fps: 8, orient: 'none', tinted: true,
    physics: { wobble: [2.5, 5] },
    paint(g, gl, f, p) {
      const c = p.color;
      ellipse(g, 4, 4, 3.6 - f * 0.4, 3.6 - f * 0.4, (d) => (d > 0.45 ? c : '#1a0a18'));
      px(g, 3, 3, '#ffffff', 2, 2);
      ellipse(gl, 4, 4, 3.8, 3.8, c);
    },
    impact(game, p) { sparks(game, p, 5, p.glow ?? [1, 1, 1], 60); },
  },

  // Glándula: grumo de ácido que bota una vez antes de reventar.
  acidGlob: {
    size: [8, 8], frames: 3, fps: 8, orient: 'none',
    physics: { gravity: 420, bounce: 1, restitution: 0.45, friction: 0.7 },
    paint(g, gl, f) {
      ellipse(g, 4, 4, 3.4, 3.2, (d) => (d > 0.6 ? '#2e6a1a' : d > 0.25 ? '#6ac040' : '#c8f090'));
      const b = [[2, 2], [5, 3], [3, 5]][f]; px(g, b[0], b[1], '#eaffd0'); // burbuja
      ellipse(gl, 4, 4, 3, 3, 'rgba(110,240,70,0.6)');
    },
    trail(game, p, dt) { if (every(p, dt, 0.06)) drips(game, p, 1, [0.35, 0.8, 0.2], null, 10); },
    bounceFx(game, p) { drips(game, p, 4, [0.4, 0.9, 0.25], null, 50); game.audio.play('sizzle', p); },
    impact(game, p) { drips(game, p, 8, [0.4, 0.9, 0.25], null, 80); },
  },

  // Gotera de ácido.
  drip: {
    size: [3, 5], frames: 1, orient: 'none',
    paint(g, gl) { px(g, 1, 0, '#6ac040'); px(g, 0, 1, '#6ac040', 3, 3); px(g, 1, 4, '#4a9a2a'); px(g, 1, 2, '#d8ffb0'); px(gl, 0, 1, 'rgba(120,240,80,0.7)', 3, 3); },
    impact(game, p) { drips(game, p, 3, [0.4, 0.9, 0.25], null, 35); },
  },

  // Empalizada de hueso (entities/Traps.js): la punta astillada que sale despedida.
  stakeShard: {
    size: [7, 3], frames: 1, orient: 'velocity',
    physics: { gravity: 520 },
    paint(g, gl) { px(g, 0, 1, '#8a6a50', 2, 1); px(g, 2, 0, '#d8c8a8', 3, 1); px(g, 2, 1, '#f0e6d0', 4, 1); px(g, 2, 2, '#a89070', 3, 1); px(g, 6, 1, '#fff6e0'); px(gl, 5, 1, 'rgba(255,230,190,0.5)', 2, 1); },
    trail(game, p, dt) { if (every(p, dt, 0.06)) game.particles.emit(p.cx, p.cy, { vx: 0, vy: 0, life: 0.2, color: [0.82, 0.74, 0.6] }); },
    impact(game, p) {
      for (let i = 0; i < 5; i++) game.particles.emit(p.cx, p.cy, { vx: R(-80, 80), vy: R(-90, -10), life: R(0.25, 0.5), gravity: 500, color: [0.88, 0.8, 0.66] });
      game.audio.play('clack', p);
    },
  },

  // ------------------------------------------------------------------ jugador
  // Cañón de Astillas: una astilla de hueso afilada, con la punta teñida de sangre.
  splinter: {
    size: [8, 3], frames: 1, orient: 'velocity',
    paint(g) { px(g, 0, 1, '#a89878', 2, 1); px(g, 2, 0, '#d8ccb0', 3, 1); px(g, 2, 1, '#f0e6d0', 4, 1); px(g, 2, 2, '#b8a888', 3, 1); px(g, 6, 1, '#9a1424', 2, 1); },
    trail(game, p, dt) { if (every(p, dt, 0.08)) game.particles.emit(p.cx, p.cy, { vx: 0, vy: 0, life: 0.15, color: [0.85, 0.8, 0.7] }); },
    impact(game, p) {
      for (let i = 0; i < 4; i++) game.particles.emit(p.cx, p.cy, { vx: R(-70, 70), vy: R(-80, -10), life: R(0.25, 0.5), gravity: 500, color: [0.9, 0.85, 0.75] });
    },
  },
  // Escopeta de Esquirlas: esquirla de hueso que gira; corto alcance, se astilla.
  shard: {
    size: [4, 4], frames: 1, orient: 'spin', spin: 4,
    physics: { gravity: 120 },
    paint(g) { px(g, 1, 0, '#f0e6d0', 2, 1); px(g, 0, 1, '#d8ccb0', 4, 2); px(g, 1, 3, '#a89878', 2, 1); px(g, 2, 1, '#9a1424'); },
    impact(game, p) {
      for (let i = 0; i < 3; i++) game.particles.emit(p.cx, p.cy, { vx: R(-60, 60), vy: R(-70, -10), life: R(0.2, 0.4), gravity: 520, color: [0.85, 0.78, 0.66] });
    },
  },
  // Espinas del arma simbionte: hueso con la punta teñida y gotitas rosas.
  spine: {
    size: [9, 3], frames: 1, orient: 'velocity',
    paint(g, gl) {
      px(g, 0, 1, '#a8406a', 2, 1); px(g, 2, 1, '#e8c8b8', 5, 1); px(g, 7, 1, '#ff4ad8', 2, 1);
      px(g, 3, 0, '#c8a898'); px(g, 5, 2, '#c8a898'); // púas laterales
      px(gl, 6, 1, 'rgba(255,80,220,0.8)', 3, 1);
    },
    trail(game, p, dt) { if (every(p, dt, 0.05)) game.glowParticles.emit(p.cx, p.cy, { vx: 0, vy: 0, life: 0.12, color: [0.8, 0.2, 0.7] }); },
    impact(game, p) { drips(game, p, 3, [0.85, 0.3, 0.6], null, 50); },
  },
  // Plasma del arma simbionte: un glóbulo incandescente que late y deja brasas.
  acid: {
    size: [8, 8], frames: 3, fps: 12, orient: 'none',
    paint(g, gl, f) {
      const r = 3 + (f === 1 ? 0.4 : 0);
      ellipse(g, 4, 4, r, r, (d) => (d > 0.6 ? '#c03a9a' : d > 0.25 ? '#ff8ad8' : '#fff0fa'));
      ellipse(gl, 4, 4, r + 0.5, r + 0.5, 'rgba(255,90,220,0.9)');
    },
    trail(game, p, dt) { if (every(p, dt, 0.04)) game.glowParticles.emit(p.cx + R(-2, 2), p.cy + R(-2, 2), { vx: -p.vx * 0.1, vy: R(-20, 0), life: 0.3, color: [1, 0.35, 0.85] }); },
    impact(game, p) { sparks(game, p, 8, [1, 0.4, 0.9], 90, 0.35); },
  },
};
