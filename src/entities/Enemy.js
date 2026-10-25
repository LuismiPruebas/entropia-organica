import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { getSprite, spriteMesh, placeMesh, setMap, canvasTexture } from '../core/Sprites.js';
import { CREATURES, tintCanvas } from './Creatures.js';
import { stingTip } from './Moth.js';
import { TILE, overlap, isSlope } from '../core/Physics.js';
import { SPRITES } from '../data/sprites.js';
import { ITEM_DROP_CHANCE } from '../state/State.js';
// Probabilidad de que una criatura suelte su fragmento de ADN (era 0.3): el mapa y sus
// secretos son la fuente principal; matar solo ayuda.
const FRAGMENT_CHANCE = 0.18;

const GRAVITY = 900;
// Ganglio Madre: dónde reaparecer al teletransportarse ([cx, cy] en píxeles, o null).
// Un hueco libre de su tamaño (con margen), lejos de donde está, ni pegado a ti ni
// demasiado lejos, y que te vea.
function ganglionSpot(e, g) {
  const W = g.world.pixelW, H = g.world.pixelH, p = g.player, m = 6;
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 60; i++) {
    const x = e.w / 2 + m + Math.random() * (W - e.w - 2 * m), y = e.h / 2 + m + Math.random() * (H - e.h - 2 * m);
    if (g.world.rectSolid(x - e.w / 2 - m, y - e.h / 2 - m, e.w + 2 * m, e.h + 2 * m)) continue;
    const dp = Math.hypot(x - p.cx, y - p.cy), de = Math.hypot(x - e.cx, y - e.cy);
    if (dp < 85 || dp > 230 || de < 70) continue;
    if (!g.world.lineOfSight(x, y, p.cx, p.cy)) continue;
    const score = -Math.abs(dp - 140) + Math.random() * 30;
    if (score > bestScore) { bestScore = score; best = [x, y]; }
  }
  return best;
}
// Matriarca: duración de la anticipación del picado.
const WINDUP = 0.38;
// Ritmo de la Matriarca: todo corto para que el patrón sea continuo.
// Arena de la Matriarca: medida desde donde aparece (suelo bajo ella, techo encima y
// paredes a media altura). Así no se sale por un pozo o una chimenea de la sala.
function mothArena(e, g) {
  const w = g.world, tx = Math.floor(e.cx / TILE), ty0 = Math.floor(e.cy / TILE);
  let fy = ty0; while (fy < w.h - 1 && !w.solid(tx, fy)) fy++;
  let cy = ty0; while (cy > 0 && !w.solid(tx, cy)) cy--;
  const my = Math.floor((fy + cy) / 2);
  let lx = tx; while (lx > 0 && !w.solid(lx, my)) lx--;
  let rx = tx; while (rx < w.w - 1 && !w.solid(rx, my)) rx++;
  return { left: (lx + 1) * TILE, right: rx * TILE, top: (cy + 1) * TILE, floor: fy * TILE };
}
const MOTH_T = { crawl: 2.2, crawlRage: 1.5, takeoff: 0.3, hover: 1.0, hoverRage: 0.65, chain: 0.32, aim: 0.38, aimRage: 0.28, stuck: 1.0, stuckRage: 0.7, free: 0.4 };
// Formas de las crías de una división (la colonia bacilar: grumo y pulpa).
const ENEMY_FORMS = {
  colonia: [
    {},
    { w: 10, h: 9, hp: 20, contactDamage: 5 },
    { w: 6, h: 5, hp: 15, contactDamage: 2 },
  ],
};
// Botín de las crías de una división: [tipo, cantidad, peso].
const OFFSPRING_DROP = { chance: 0.35, table: [['biomass', 2, 60], ['battery', undefined, 40]] };

// ---------------------------------------------------------------- utilidades de IA
// Qué percibe la criatura del jugador. maxDy acota la vista vertical (los que andan
// por el suelo no ven lo que pasa dos pisos más arriba).
function senses(e, g, maxDy = 999) {
  const p = g.player, d = e.def;
  const dx = p.cx - e.cx, dy = p.cy - e.cy, dist = Math.hypot(dx, dy) || 1;
  const sees = dist < d.sight * g.state.mod('visibility') && Math.abs(dy) < maxDy && g.world.lineOfSight(e.cx, e.cy, p.cx, p.cy);
  return { p, dx, dy, dist, sees };
}
// A oscuras se envalentonan; bajo el haz del ojo se frenan.
function speedMods(e, g, s) {
  if (g.state.light <= 0) s *= e.def.darkMult ?? 1.6;
  if (e.lit) s *= e.def.lightFear ?? 1;
  return s;
}
// ¿Hay un borde (precipicio) justo delante? Un rayo hacia abajo desde el pie de
// delante: suelo plano a ras o una rampa (aunque baje) no es borde; un escalón sí.
function ledgeAhead(g, e, footX) {
  const feet = e.y + e.h;
  const hit = g.world.raycast(footX, feet - 2, footX, feet + e.w / 2 + 10);
  if (!hit) return true;
  return !(hit.y <= feet + 2 || isSlope(hit.c) || g.world.slopeAt(footX, feet + 1));
}
// Paso por el suelo sin caerse por los bordes.
function groundWalk(e, g, dt, speed, chasing) {
  const footX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
  if (ledgeAhead(g, e, footX) && e.onGround) {
    if (chasing) speed = 0;
    else e.dir *= -1;
  }
  e.vx = e.dir * speed;
  e.vy = Math.min(380, e.vy + GRAVITY * dt);
  g.world.move(e, dt);
  if (e.hitWall) e.dir = -e.hitWall;
}
function fall(e, g, dt) {
  e.vy = Math.min(380, e.vy + GRAVITY * dt);
  g.world.move(e, dt);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Zona de daño de un ataque cuerpo a cuerpo (látigos, barridos, suelo electrificado).
function hitZone(g, e, x, y, w, h, damage) {
  const p = g.player;
  if (p.x < x + w && p.x + p.w > x && p.y < y + h && p.y + p.h > y) g.hurtPlayer(damage, e.cx, e.def.name);
}
// Onda que corre pegada al suelo (salta por encima).
function shockwave(g, x, floorY, dir, color, glow) {
  g.spawnProjectile({ x: x - 5, y: floorY - 9, w: 10, h: 9, vx: dir * 170, vy: 0, life: 2, damage: 9, kind: 'wave', owner: 'enemy', color, glow });
}
// Disparos del Ojo de Techo. Lo que escupe depende del órgano en que creció (def.ammo
// por bioma) y su puntería, de lo hondo que esté la sala (room.tier: 0 junto al
// inicio, 1 en lo más profundo). Cerca del inicio los patrones son francos y lentos;
// más adentro adelantan tu movimiento, son más y cambian de forma.
//   spit   saliva infectada: ráfaga en abanico; más adentro, apunta a donde vas
//   seed   semillas de espora: salen despacio, frenan y flotan derivando hacia ti
//   tartar cálculos de sarro: parábolas que rebotan (corta, a ti, larga); en lo más
//          hondo estallan en esquirlas
function eyeVolley(e, g) {
  const ammo = e.def.ammo?.[g.room.def.biome] ?? 'spit';
  const tier = g.room.tier ?? 0;
  const n = { spit: tier >= 0.25 ? 4 : 3, seed: 3 + Math.round(tier * 3), tartar: tier >= 0.85 ? 3 : 2 }[ammo];
  return { ammo, tier, n, gap: { spit: 0.13, seed: 0.2, tartar: 0.32 }[ammo] };
}
function eyeShot(e, g, v, i) {
  const p = g.player, d = e.def;
  const x0 = e.cx, y0 = e.y + e.h - 2;
  // Infecta solo la saliva (Sistema Nervioso) de un ojo que infecta (enemies.js: infects).
  const base = { owner: 'enemy', damage: d.projectileDamage, status: d.infects && v.ammo === 'spit' ? 'infection' : undefined };
  const mid = i - (v.n - 1) / 2;
  if (v.ammo === 'seed') {
    // Se sueltan hacia ti en abanico, muy despacio; el aire hace el resto.
    const a = Math.atan2(p.cy - y0, p.cx - x0) + mid * 0.55;
    g.spawnProjectile({ ...base, x: x0 - 3, y: y0 - 3, w: 6, h: 6, vx: Math.cos(a) * 75, vy: Math.sin(a) * 75, life: 4.5, kind: 'seed', home: 20 + v.tier * 30, color: '#e8f0c8' });
    g.audio.play('bubble', e);
    return;
  }
  if (v.ammo === 'tartar') {
    // Parábola hasta el suelo a tu altura: la primera cae corta y te llega botando, la
    // segunda va a ti y la tercera, larga, por si saltas hacia delante.
    const GR = 460, vy0 = [-30, 0, 20][i] ?? 0, dy = Math.max(8, p.y + p.h - 4 - y0);
    const T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * GR * dy)) / GR;
    const dx = (p.cx - x0) * [0.65, 1, 1.35][i];
    g.spawnProjectile({ ...base, status: undefined, x: x0 - 3, y: y0 - 3, w: 6, h: 6, vx: dx / T, vy: vy0, gravity: GR, life: 4, kind: 'tartar', shards: v.tier >= 0.85 ? 3 : 0, damage: d.projectileDamage + 1 });
    g.audio.play('clack', e);
    return;
  }
  // Saliva: en abanico hacia ti; más adentro, hacia donde vas a estar.
  const speed = d.projectileSpeed * (1 + v.tier * 0.4);
  let tx = p.cx, ty = p.cy;
  if (v.tier >= 0.25) {
    const t = Math.hypot(tx - x0, ty - y0) / speed;
    tx += p.vx * t * 0.7;
    ty += Math.min(0, p.vy) * t * 0.3;
  }
  const a = Math.atan2(ty - y0, tx - x0) + mid * (v.tier >= 0.25 ? 0.14 : 0.2);
  g.spawnProjectile({ ...base, x: x0 - 2, y: y0 - 2, w: 4, h: 4, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, kind: 'spit', color: '#c07bff', glow: [0.6, 0.3, 0.9] });
  g.audio.play('spit', e);
}

function tick(e, dt) {
  e.timer = (e.timer ?? 0) - dt;
  e.cool = (e.cool ?? 0) - dt;
}

// IA por comportamiento. Cada función recibe la entidad, dt y el juego.
// La Colonia Bacilar sin cohesión: el coloso se desmorona en un charco de células y de
// él solo queda un grumo que sigue saltando hacia ti. Cuenta como vencido (no reaparece).
function collapseColony(e, g) {
  e.alive = false;
  if (e.key) g.state.slain.add(e.key);
  g.audio.play('colonyDie', e);
  g.gore.burst(e.cx, e.cy, e.w, e.h, e.def.gore, 0.5);
  for (let i = 0; i < 24; i++) g.particles.emit(e.x + Math.random() * e.w, e.y + Math.random() * e.h, { vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 80, life: 0.7, gravity: 500, color: [0.45, 0.65, 0.18], stain: [0.35, 0.5, 0.12] });
  const lump = g.spawnOffspring('colonia', e.cx, e.y + e.h - 8, { ...ENEMY_FORMS.colonia[1], gen: 1 });
  if (lump) { lump.state = 'recover'; lump.timer = 0.6; lump.dir = e.dir; }
  e.dispose();
}

// Sapo Partero: elige n huevos enteros de la joroba (sin reventar o ya regenerados).
function toadPickEggs(e, n, g) {
  const now = g.time, popped = e.popped ?? {};
  const free = [];
  for (let i = 0; i < 17; i++) if (popped[i] === undefined || now - popped[i] > 15.5) free.push(i);
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  return free.slice(0, n);
}
// Los revienta: cáscara y mucosa salpican desde la joroba.
function toadPopEggs(e, g, list) {
  e.popped ??= {};
  for (const i of list) e.popped[i] = g.time;
  if (!list.length) return;
  g.audio.play('splat', e);
  g.audio.play('crunch', e);
  for (let k = 0; k < list.length * 8; k++) {
    g.particles.emit(e.cx - e.dir * 4 + (Math.random() - 0.5) * 34, e.y + 2 + Math.random() * 8, { vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 140, life: 0.7, gravity: 520, color: Math.random() < 0.5 ? [0.94, 0.9, 0.82] : [0.72, 0.8, 0.45], stain: '#6a7a3a' });
  }
}

export const BEHAVIORS = {
  // Reptante: acecha agazapado y, a distancia de salto, se detiene, se encoge
  // temblando y se abalanza. Al caer queda un instante aturdido: tu ventana.
  // Renacuajo de Charca: avanza a saltos de rana; con el jugador a tiro se hincha (aviso)
  // y escupe una ráfaga de gotas de ácido a presión; se deshincha y repite pronto.
  // e.state: prowl · inflate · spit · recover; e.puff (0..1) cuánto está hinchado.
  puffer(e, dt, g) {
    const d = e.def, s = senses(e, g, 60), p = s.p;
    e.state ??= 'prowl';
    tick(e, dt);
    e.shakeX = 0;
    e.puff ??= 0;
    // En el ácido (cubetas o '~') no se quema: flota con los ojos fuera y nada hacia ti.
    const surf = g.fluidSurfaceAt(e);
    e.swimming = surf != null && e.y + e.h * 0.4 > surf;
    const move = () => {
      if (!e.swimming || e.vy < -150) return fall(e, g, dt); // (el salto de rana lo saca)
      const want = surf - e.h * 0.55 + Math.sin(e.t * 3) * 1.2;
      e.vy = clamp((want - e.y) * 5, -140, 140);
      g.world.move(e, dt);
    };
    const footing = e.onGround || e.swimming;
    const mouth = () => ({ x: e.cx + e.dir * (e.w / 2 + 1), y: e.y + e.h * 0.45 });
    if (e.state === 'prowl') {
      e.puff = Math.max(0, e.puff - dt * 3);
      if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
      if (s.sees && s.dist < d.spitRange && s.dist > 22 && e.cool <= 0 && footing) {
        e.state = 'inflate';
        e.timer = d.inflateTime;
        e.vx = 0;
        g.audio.play(d.sounds?.windup ?? 'bubble', e);
      } else if (footing) {
        // Saltos de rana: hacia ti si te ve; si no, de paseo (y se da la vuelta ante un borde).
        e.vx *= 0.7;
        e.hopT = (e.hopT ?? Math.random() * 0.5) - dt;
        if (e.hopT <= 0) {
          e.hopT = s.sees ? 0.45 + Math.random() * 0.2 : 1 + Math.random() * 0.6;
          if (!s.sees && ledgeAhead(g, e, e.dir > 0 ? e.x + e.w + 1 : e.x - 1)) e.dir *= -1;
          e.vx = e.dir * d.hopSpeed * (s.sees ? 1 : 0.5);
          e.vy = -d.hopV * (s.sees ? 1 : 0.7);
        }
      }
      move();
    } else if (e.state === 'inflate') {
      e.vx = 0;
      e.puff = Math.min(1, e.puff + dt / d.inflateTime);
      e.shakeX = Math.random() < 0.5 ? -1 : 1;
      if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
      move();
      if (e.timer <= 0) {
        e.state = 'spit';
        e.timer = d.spitTime;
        const m = mouth();
        e.aimA = Math.atan2(p.cy - m.y, p.cx - m.x);
        e.spitAcc = 0;
        g.audio.play(d.sounds?.lunge ?? 'spit', e);
      }
    } else if (e.state === 'spit') {
      e.vx = -e.dir * 18; // el retroceso del chorro
      move();
      e.puff = Math.max(0, e.puff - dt / d.spitTime);
      e.spitAcc += dt;
      // Vómito espeso: goterones gruesos y de tamaño variable, a borbotones (no un rayo).
      while (e.spitAcc >= 0.06) {
        e.spitAcc -= 0.06;
        const m = mouth(), a = e.aimA - 0.12 + (Math.random() - 0.5) * 0.22, v = d.spitSpeed * (0.75 + Math.random() * 0.35);
        const sz = 5 + Math.floor(Math.random() * 3);
        g.spawnProjectile({ x: m.x - sz / 2, y: m.y - sz / 2, w: sz, h: sz - 1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.4, damage: d.spitDamage, kind: 'acidSpew', owner: 'enemy', color: '#9be06a', glow: [0.4, 1, 0.3] });
      }
      if (e.timer <= 0) { e.state = 'recover'; e.timer = d.recover; }
    } else {
      e.vx = 0;
      e.puff = Math.max(0, e.puff - dt * 2);
      move();
      if (e.timer <= 0) { e.state = 'prowl'; e.cool = d.spitCool; }
    }
  },

  stalker(e, dt, g) {
    const d = e.def, s = senses(e, g, 40);
    e.state ??= 'prowl';
    tick(e, dt);
    e.shakeX = 0;
    if (e.state === 'prowl') {
      if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
      // De lejos corre; cerca se arrastra despacio, pegado al suelo.
      const speed = speedMods(e, g, s.sees ? (s.dist < d.pounceRange * 1.6 ? d.speed : d.chaseSpeed) : d.speed);
      groundWalk(e, g, dt, speed, s.sees);
      if (s.sees && s.dist < d.pounceRange && e.cool <= 0 && e.onGround) {
        e.state = 'crouch';
        e.timer = d.windup;
        g.audio.play(d.sounds?.windup ?? 'charge', e);
      }
    } else if (e.state === 'crouch') {
      e.vx = 0;
      e.shakeX = Math.random() < 0.5 ? -1 : 1;
      fall(e, g, dt);
      if (e.timer <= 0) {
        e.state = 'pounce';
        e.bit = false;
        e.vx = clamp((s.p.cx - e.cx) * 1.7, -d.leapSpeed, d.leapSpeed);
        e.vy = -d.leapV;
        e.dir = Math.sign(e.vx) || e.dir;
        g.audio.play(d.sounds?.lunge ?? 'screech', e);
      }
    } else if (e.state === 'latch') {
      // Aferrada a tu cuerpo: chupa biomasa y un poco de vida hasta que se suelta (al
      // acabar, si le pegas o si embistes).
      const p = g.player, L = d.latch;
      e.latchT -= dt;
      e.dir = e.side;
      e.x = p.cx - e.w / 2 + e.side * -5;
      e.y = p.y + 4 + Math.sin(e.t * 20) * 1;
      e.vx = e.vy = 0;
      e.shakeX = Math.random() < 0.5 ? -1 : 1;
      const st = g.state;
      st.biomass = Math.max(0, st.biomass - L.biomass * dt);
      if (!g.state.dev.god) st.damage(L.life * dt, d.name);
      if (Math.random() < 0.25) g.particles.emit(p.cx, p.cy, { vx: (e.cx - p.cx) * 2 + (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.4, gravity: 300, color: [0.6, 0.05, 0.1] });
      if (Math.random() < dt * 2.5) g.audio.play('splat', e);
      if (e.latchT <= 0 || e.shaken || p.dash > 0) {
        e.shaken = false;
        e.contactDamage = undefined;
        e.latchCool = g.time + 4; // no vuelve a agarrarse enseguida
        e.state = 'pounce';
        e.bit = true;
        e.vx = e.side * 130; e.vy = -170;
        g.audio.play(d.sounds?.lunge ?? 'screech', e);
      }
      return;
    } else if (e.state === 'pounce') {
      e.vy = Math.min(380, e.vy + GRAVITY * dt);
      g.world.move(e, dt);
      if (e.hitWall) e.vx = 0;
      // Al alcanzarte: mordisco que infecta o, a veces, se te agarra.
      if (d.bite && !e.bit && overlap(e, g.player)) {
        e.bit = true;
        if (d.latch && (e.latchCool ?? 0) <= g.time && Math.random() < d.latch.chance && g.player.dash <= 0) {
          e.state = 'latch';
          e.latchT = d.latch.time;
          e.side = Math.sign(e.cx - g.player.cx) || 1;
          e.contactDamage = 0;
          g.hurtPlayer(d.bite, e.cx, d.name, 'infection');
          return;
        }
        g.hurtPlayer(d.bite, e.cx, d.name, 'infection');
      }
      if (e.onGround && e.vy >= 0) {
        e.state = 'recover';
        e.timer = d.recover;
        e.vx = 0;
        g.audio.play('land', e);
      }
    } else {
      e.vx = 0;
      fall(e, g, dt);
      if (e.timer <= 0) { e.state = 'prowl'; e.cool = d.pounceCool; }
    }
  },

  // Neurona, Enjambre y Célula: flotan rondándote en un vaivén; cuando te tienen a
  // tiro se contraen (aviso: brillan y tiemblan) y salen disparadas en línea recta.
  darter(e, dt, g) {
    const d = e.def, s = senses(e, g);
    e.home ??= { x: e.x, y: e.y };
    e.state ??= 'drift';
    tick(e, dt);
    e.shakeX = 0;
    if (e.state === 'drift') {
      if (s.sees) {
        const speed = speedMods(e, g, d.chaseSpeed);
        const k = s.dist > (d.keep ?? 40) ? 1 : -0.4;
        const ox = -s.dy / s.dist, oy = s.dx / s.dist, orb = Math.sin(e.t * 1.7 + e.seed) * 0.8;
        e.vx = ((s.dx / s.dist) * k + ox * orb) * speed;
        e.vy = ((s.dy / s.dist) * k + oy * orb) * speed;
        if (s.dist < d.dashRange && e.cool <= 0) {
          e.state = 'windup';
          e.timer = d.windup;
          e.aimA = Math.atan2(s.dy, s.dx);
          g.audio.play('charge', e);
        }
      } else {
        e.vx = (e.home.x - e.x) * 0.8;
        e.vy = (e.home.y + Math.sin(e.t * 2 + e.seed) * 5 - e.y) * 0.8;
      }
      g.world.move(e, dt);
    } else if (e.state === 'windup') {
      // Apunta mientras se contrae; en el último instante deja de corregir.
      if (e.timer > 0.15) e.aimA = Math.atan2(s.dy, s.dx);
      e.vx = e.vy = 0;
      e.shakeX = Math.random() < 0.5 ? -1 : 1;
      if (e.timer <= 0) {
        e.state = 'dash';
        e.timer = d.dashTime;
        e.vx = Math.cos(e.aimA) * d.dashSpeed;
        e.vy = Math.sin(e.aimA) * d.dashSpeed;
        g.audio.play('flicker', e);
      }
    } else if (e.state === 'dash') {
      g.world.move(e, dt);
      if (Math.random() < 0.6) g.glowParticles.emit(e.cx, e.cy, { vx: -e.vx * 0.1, vy: -e.vy * 0.1, life: 0.3, color: d.trail ?? [0.4, 0.8, 1] });
      if (e.timer <= 0 || e.hitWall || e.hitCeiling || e.onGround) {
        e.state = 'recover';
        e.timer = d.recover;
      }
    } else {
      e.vx *= 0.9;
      e.vy *= 0.9;
      g.world.move(e, dt);
      if (e.timer <= 0) { e.state = 'drift'; e.cool = d.dashCool; }
    }
    e.dir = Math.sign(e.vx) || e.dir;
  },

  // Hierofante: descansa pegada a una pared o al techo; al verte pliega las alas como una
  // túnica, se despega y se te pone delante; luego despliega las alas, gira como una
  // peonza y sale disparada rebotando por la sala (hiere al contacto); al parar queda
  // mareada (vulnerable) y vuelve a ponerse delante de ti.
  mothSpin(e, dt, g) {
    const d = e.def, s = senses(e, g);
    // Si no la han pegado a nada en el editor, empieza buscando la pared o el techo más cercano.
    e.state ??= e.anchor ? 'rest' : 'seek';
    // Mimetismo: pegada y quieta, va tomando el color de la pared (lo usa su dibujo).
    e.mimic = Math.max(0, Math.min(1, (e.mimic ?? 0) + (e.state === 'rest' ? dt / 1.5 : -dt * 4)));
    tick(e, dt);
    e.shakeX = 0;
    const ease = (v, to, r) => v + (to - v) * Math.min(1, dt * r);
    e.spinA = (e.spinA ?? 0) + dt * (e.spinRate ?? 0);
    e.contactDamage = e.state === 'spin' ? d.spinDamage : d.contactDamage;
    const hover = () => {
      // Delante de ti, a tu altura, meciéndose.
      const side = Math.sign(e.cx - s.p.cx) || 1;
      const tx = s.p.cx + side * d.faceDist, ty = s.p.cy - 8 + Math.sin(e.t * 2.4) * 4;
      e.vx = ease(e.vx, (tx - e.cx) * 2.5, 4); e.vy = ease(e.vy, (ty - e.cy) * 2.5, 4);
      g.world.move(e, dt);
    };
    if (e.state === 'seek') {
      // Vuela con las alas plegadas hasta la pared o el techo más cercano y se pega.
      e.fold = ease(e.fold ?? 1, 1, 6); e.spinRate = ease(e.spinRate ?? 0, 0, 4); e.spinK = ease(e.spinK ?? 0, 0, 4);
      if (!e.perch) {
        const L = 220, ox = e.cx, oy = e.cy, opts = [];
        for (const [a, dx, dy] of [['left', -1, 0], ['right', 1, 0], ['techo', 0, -1]]) {
          const h = g.world.raycast(ox, oy, ox + dx * L, oy + dy * L);
          if (!h) continue;
          const tx = a === 'left' ? h.cx + 1 : a === 'right' ? h.cx - 1 : h.cx, ty = a === 'techo' ? h.cy + 1 : h.cy;
          opts.push({ a, tx, ty, dist: Math.hypot(h.x - ox, h.y - oy) });
        }
        e.perch = opts.sort((p, q) => p.dist - q.dist)[0] ?? { a: null };
      }
      const pc = e.perch;
      if (!pc.a) { e.state = 'face'; e.timer = d.faceTime; }
      else {
        // Dónde queda pegada (como setAnchor) y vuelo hasta allí.
        const px = pc.a === 'left' ? pc.tx * TILE : pc.a === 'right' ? (pc.tx + 1) * TILE - e.w : pc.tx * TILE + (TILE - e.w) / 2;
        const py = pc.a === 'techo' ? pc.ty * TILE : pc.ty * TILE + (TILE - e.h) / 2;
        const dx = px - e.x, dy = py - e.y, dist = Math.hypot(dx, dy);
        e.vx = ease(e.vx, (dx / (dist || 1)) * d.seekSpeed, 5); e.vy = ease(e.vy, (dy / (dist || 1)) * d.seekSpeed, 5);
        g.world.move(e, dt);
        if (dist < 3 || e.hitWall || e.hitCeiling) {
          e.setAnchor(pc.a, pc.tx, pc.ty);
          e.perch = null; e.state = 'rest'; e.timer = d.restTime; e.fold = 0; e.vx = e.vy = 0;
        }
      }
    } else if (e.state === 'rest') {
      e.fold = ease(e.fold ?? 0, 0, 5); e.spinRate = 0; e.vx = e.vy = 0;
      if (!e.anchor) fall(e, g, dt);                         // en el suelo, posada
      // Se queda pegada un rato antes de volver a atacar.
      if (e.timer <= 0 && s.sees && s.dist < d.wakeRange) { e.state = 'wake'; e.timer = d.wakeTime; g.audio.play(d.sounds?.reveal ?? 'flicker', e); }
    } else if (e.state === 'wake') {
      // Pliega las alas en túnica y se despega de su superficie.
      const u = 1 - Math.max(0, e.timer) / d.wakeTime;
      e.fold = u; e.unrot = u;
      const away = { techo: [0, 1], left: [1, 0], right: [-1, 0] }[e.anchor] ?? [0, -1];
      e.vx = away[0] * 70; e.vy = away[1] * 70;      // se despega de golpe
      g.world.move(e, dt);
      if (e.timer <= 0) { e.state = 'face'; e.anchor = null; e.unrot = 0; e.timer = d.faceTime; }
    } else if (e.state === 'face') {
      e.fold = ease(e.fold ?? 1, 1, 6); e.spinRate = ease(e.spinRate, 0, 4);
      hover();
      if (e.timer <= 0 && e.cool <= 0 && s.sees) { e.state = 'spinup'; e.timer = d.spinUp; g.audio.play(d.sounds?.windup ?? 'whip', e); }
    } else if (e.state === 'spinup') {
      // Despliega las alas como aspas y empieza a girar cada vez más rápido.
      const u = 1 - Math.max(0, e.timer) / d.spinUp;
      e.spinK = u; e.spinRate = 4 + u * 26;
      e.vx = ease(e.vx, 0, 6); e.vy = ease(e.vy, 0, 6);
      g.world.move(e, dt);
      if (e.timer <= 0) {
        const a = Math.atan2(s.dy, s.dx);
        e.vx = Math.cos(a) * d.spinSpeed; e.vy = Math.sin(a) * d.spinSpeed;
        e.state = 'spin'; e.timer = d.spinTime; e.spinK = 1;
      }
    } else if (e.state === 'spin') {
      // Peonza: avanza recto, rebota en paredes, suelo y techo, y se tuerce un poco hacia ti.
      e.spinRate = 30;
      const sp = Math.hypot(e.vx, e.vy) || 1;
      e.vx += (s.dx / s.dist) * 140 * dt; e.vy += (s.dy / s.dist) * 140 * dt;
      const k = d.spinSpeed / Math.hypot(e.vx, e.vy);
      e.vx *= k; e.vy *= k;
      const vx0 = e.vx, vy0 = e.vy;
      g.world.move(e, dt);
      const bounced = e.hitWall || e.hitCeiling || e.onGround;
      if (e.hitWall) e.vx = -vx0;
      if (e.hitCeiling || e.onGround) e.vy = -vy0;
      if (bounced) {
        g.audio.play(d.sounds?.bounce ?? 'clack', e);
        for (let i = 0; i < 6; i++) g.glowParticles.emit(e.cx, e.cy, { vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.3, color: [1, 0.75, 0.3] });
      }
      if (Math.random() < 0.5) g.glowParticles.emit(e.cx + (Math.random() - 0.5) * 20, e.cy, { vx: -e.vx * 0.1, vy: -e.vy * 0.1, life: 0.3, color: [0.3, 0.9, 0.9] });
      e.spinSnd = (e.spinSnd ?? 0) - dt;
      if (e.spinSnd <= 0) { e.spinSnd = 0.24; g.audio.play(d.sounds?.spin ?? 'swing', e); }
      void sp;
      if (e.timer <= 0) { e.state = 'dizzy'; e.timer = d.dizzyTime; }
    } else if (e.state === 'dizzy') {
      // Mareada: frena, el giro se apaga y se tambalea; es el momento de pegarle.
      e.spinRate = ease(e.spinRate, 0, 2.5); e.spinK = ease(e.spinK ?? 1, 0, 2);
      e.vx = ease(e.vx, 0, 3); e.vy = ease(e.vy, 12, 3);
      g.world.move(e, dt);
      if (e.timer <= 0) { e.state = 'seek'; e.perch = null; e.fold = 1; }
    }
  },

  // Zancudo Alveolar: corre sobre sus patas hasta quedarse a media distancia; se agacha,
  // hincha la cabeza (aviso largo) y la vacía de golpe disparando un abanico de espinas
  // por el esfínter del pecho. A ratos la hincha a medias y levita, se acerca amenazante
  // por el aire, dispara desde arriba y vuelve a bajar.
  inflater(e, dt, g) {
    const d = e.def, s = senses(e, g);
    e.state ??= 'walk';
    tick(e, dt);
    e.shakeX = 0;
    e.flash = Math.max(0, (e.flash ?? 0) - dt * 5);
    const ease = (v, to, r) => v + (to - v) * Math.min(1, dt * r);
    if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
    if (e.onGround) e.groundY = e.y;
    // Contraataque: le has golpeado de frente; se hincha de golpe y escupe enseguida.
    if (e.counter) {
      e.counter = false;
      if (e.state === 'walk' || e.state === 'float') {
        e.quick = true; e.state = 'inflate'; e.timer = d.counterInflate;
        g.audio.play(d.sounds?.windup ?? 'sacInhale', e);
      }
    }
    const fire = () => {
      const sx = e.cx + e.dir * 4, sy = e.y + e.h - 22;
      const a0 = Math.atan2(s.p.cy - sy, s.p.cx - sx);
      for (let i = 0; i < d.spines; i++) {
        const a = a0 + (i - (d.spines - 1) / 2) * (d.spread / (d.spines - 1)) + (Math.random() - 0.5) * 0.06;
        g.spawnProjectile({ x: sx - 4, y: sy - 1, w: 7, h: 2, vx: Math.cos(a) * d.spineSpeed, vy: Math.sin(a) * d.spineSpeed, life: 1.2, damage: d.spineDamage, kind: 'alvSpine', owner: 'enemy' });
      }
      for (let i = 0; i < 8; i++) g.particles.emit(sx, sy, { vx: Math.cos(a0) * 150 + (Math.random() - 0.5) * 70, vy: Math.sin(a0) * 150 + (Math.random() - 0.5) * 70, life: 0.3, color: [0.75, 0.3, 0.25] });
      g.audio.play(d.sounds?.attack ?? 'spine', e);
      e.k = -0.25; e.flash = 1; e.quick = false;
      e.state = 'recoil'; e.timer = d.recoil; e.cool = d.fireCool;
    };
    if (e.state === 'walk') {
      e.k = ease(e.k ?? 0, Math.sin(e.t * 2) * 0.05, 4);           // la cabeza respira
      let speed = 0;
      if (s.sees) {
        if (s.dist > d.keepFar) speed = d.speed;
        else if (s.dist < d.keepNear) { speed = d.speed * 0.8; e.dir = -e.dir; }
        if (e.cool <= 0 && s.dist < d.sight) {
          e.floating = Math.random() < d.floatChance;
          e.state = e.floating ? 'float' : 'inflate';
          e.timer = e.floating ? d.floatTime : d.inflateTime;
          if (!e.floating) g.audio.play(d.sounds?.windup ?? 'sacInhale', e);
        }
      } else speed = d.speed * 0.3;
      groundWalk(e, g, dt, speedMods(e, g, speed), !!s.sees);
      if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
      e.walkPh = (e.walkPh ?? 0) + Math.abs(e.vx) * dt * 0.35;
    } else if (e.state === 'float') {
      // Hincha la cabeza a medias y se eleva sobre el suelo; se te acerca por el aire.
      e.k = ease(e.k ?? 0, 0.55 + Math.sin(e.t * 3) * 0.05, 3);
      const ty = (e.groundY ?? e.y) - d.hoverH;
      e.vy = ease(e.vy, (ty - e.y) * 3, 6);
      e.vx = ease(e.vx, s.sees && s.dist > 60 ? Math.sign(s.dx) * 35 : 0, 3);
      g.world.move(e, dt);
      if (e.timer <= d.floatTime - 1.2 && e.cool <= 0 && s.sees) { e.state = 'inflate'; e.timer = d.inflateTime * 0.8; g.audio.play(d.sounds?.windup ?? 'sacInhale', e); }
      else if (e.timer <= 0) e.state = 'descend';
    } else if (e.state === 'inflate') {
      // Se agacha (o se queda flotando) e hincha la cabeza hasta el máximo; tiembla al final.
      const total = e.quick ? d.counterInflate : e.floating ? d.inflateTime * 0.8 : d.inflateTime, u = 1 - Math.max(0, e.timer) / total;
      e.k = Math.max(e.k ?? 0, e.floating ? 0.55 + u * 0.45 : u * u * (3 - 2 * u));
      if (e.floating) { const ty = (e.groundY ?? e.y) - d.hoverH; e.vy = ease(e.vy, (ty - e.y) * 3, 6); e.vx = ease(e.vx, 0, 4); g.world.move(e, dt); }
      else { e.vx = 0; fall(e, g, dt); }
      if (u > 0.75) e.shakeX = Math.random() < 0.5 ? -1 : 1;
      if (e.timer <= 0) fire();
    } else if (e.state === 'recoil') {
      // Vaciada de golpe: la cabeza vuelve despacio a su tamaño.
      e.k = ease(e.k, 0, 3);
      if (e.floating) { e.vx = ease(e.vx, -e.dir * 20, 4); e.vy = ease(e.vy, 0, 4); g.world.move(e, dt); }
      else { e.vx = 0; fall(e, g, dt); }
      if (e.timer <= 0) e.state = e.floating ? 'descend' : 'walk';
    } else if (e.state === 'descend') {
      // Deshincha la cabeza y vuelve a apoyarse.
      e.k = ease(e.k, 0, 2.5);
      e.vx = ease(e.vx, 0, 3);
      fall(e, g, dt);
      if (e.onGround) { e.state = 'walk'; e.floating = false; e.cool = Math.max(e.cool, 0.8); }
    }
  },

  // Polinizador: vuela. Te busca por arriba y se pasea de lado a lado sobre ti soltando
  // vainas de esporas (las de la Matriarca: revientan al caer). Si estás cerca, se
  // encoge alzando las garras (aviso), embiste en línea recta y se recupera aturdido.
  pollinator(e, dt, g) {
    const d = e.def, s = senses(e, g), W = g.world.pixelW;
    e.home ??= { x: e.cx, y: e.cy };
    e.state ??= 'patrol';
    tick(e, dt);
    e.shakeX = 0;
    e.puff = Math.max(0, (e.puff ?? 0) - dt * 3);
    e.contactDamage = d.contactDamage;
    // Contraataque: le has golpeado de frente; embiste de nuevo a bocajarro con un aviso corto.
    if (e.counter) {
      e.counter = false;
      if (e.state !== 'windup' && e.state !== 'ram') {
        e.state = 'windup'; e.timer = d.counterWindup; e.dive = false;
        e.aimA = Math.atan2(s.dy, s.dx);
        g.audio.play(d.sounds?.windup ?? 'charge', e);
      }
    }
    // Vuelo con inercia hacia un punto.
    const steer = (tx, ty, speed) => {
      const dx = tx - e.cx, dy = ty - e.cy, dist = Math.hypot(dx, dy) || 1, v = Math.min(speed, dist * 3);
      const k = Math.min(1, dt * 3.5);
      e.vx += ((dx / dist) * v - e.vx) * k;
      e.vy += ((dy / dist) * v - e.vy) * k;
    };
    if (e.state === 'patrol') {
      steer(e.home.x + Math.sin(e.t * 0.6 + e.seed) * 36, e.home.y + Math.sin(e.t * 1.7 + e.seed) * 6, d.speed * 0.5);
      if (s.sees) { e.state = 'hunt'; e.lost = 0; }
    } else if (e.state === 'hunt') {
      e.lost = s.sees ? 0 : (e.lost ?? 0) + dt;
      if (e.lost > 4) e.state = 'patrol';
      // A ratos, en vez de soltarte esporas, se lanza en picado desde arriba.
      e.decide = (e.decide ?? 1.5) - dt;
      const dive = s.sees && e.cool <= 0 && e.decide <= 0 && s.dy > 30 && s.dist < d.diveRange && Math.random() < d.diveChance;
      if (e.decide <= 0) e.decide = 1 + Math.random() * 0.6;
      if (dive || (s.sees && s.dist < d.ramRange && Math.abs(s.dy) < d.ramReachY && e.cool <= 0)) {
        e.state = 'windup'; e.timer = d.windup; e.aimA = Math.atan2(s.dy, s.dx); e.dive = dive;
        g.audio.play(d.sounds?.windup ?? 'charge', e);
      } else {
        // Se pasea por encima de ti, de lado a lado.
        const tx = clamp(s.p.cx + Math.sin(e.t * 1.1 + e.seed) * d.sweep, 20, W - 20);
        steer(tx, s.p.cy - d.height + Math.sin(e.t * 2.3) * 4, speedMods(e, g, d.speed));
        e.drop = (e.drop ?? d.dropEvery) - dt;
        if (s.sees && e.drop <= 0 && Math.abs(s.p.cx - e.cx) < 28 && e.cy < s.p.cy - 24) {
          e.drop = d.dropEvery; e.puff = 1;
          g.spawnProjectile({
            x: e.cx - 4, y: e.y + e.h - 2, w: 7, h: 7, vx: e.vx * 0.35, vy: 25, gravity: 420, life: 3,
            damage: d.sporeDamage, kind: 'sporeLob', owner: 'enemy', burstRadius: 26, burstDamage: d.sporeDamage,
          });
          g.audio.play(d.sounds?.attack ?? 'spit', e);
        }
      }
    } else if (e.state === 'windup') {
      // Recula, se encoge temblando y apunta; en el último instante deja de corregir.
      if (e.timer > 0.15) e.aimA = Math.atan2(s.dy, s.dx);
      const back = 45 * Math.max(0, e.timer / d.windup);
      e.vx = -Math.cos(e.aimA) * back; e.vy = -Math.sin(e.aimA) * back;
      e.shakeX = Math.random() < 0.5 ? -1 : 1;
      if (e.timer <= 0) {
        e.state = 'ram'; e.timer = e.dive ? d.diveTime : d.ramTime;
        e.vx = Math.cos(e.aimA) * d.ramSpeed; e.vy = Math.sin(e.aimA) * d.ramSpeed;
        g.audio.play(d.sounds?.ram ?? 'whip', e);
      }
    } else if (e.state === 'ram') {
      e.contactDamage = d.ramDamage;
      if (Math.random() < 0.5) g.particles.emit(e.cx, e.cy, { vx: -e.vx * 0.1, vy: -e.vy * 0.1, life: 0.3, color: [0.55, 0.45, 0.3] });
      if (e.timer <= 0 || e.hitWall || e.hitCeiling || e.onGround) {
        e.state = 'recover'; e.timer = d.recover;
        if (e.hitWall || e.hitCeiling || e.onGround) { e.vx *= -0.3; e.vy = -40; g.audio.play('thump', e); }
      }
    } else {
      e.vx *= 0.9; e.vy = e.vy * 0.9 - 8 * dt;
      if (e.timer <= 0) { e.state = 'hunt'; e.cool = d.ramCool; }
    }
    g.world.move(e, dt);
    // Mira hacia donde ataca; si no, a ti (o hacia donde vuela).
    if (e.state === 'windup' || e.state === 'ram') e.dir = Math.cos(e.aimA) >= 0 ? 1 : -1;
    else if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
    else e.dir = Math.sign(e.vx) || e.dir;
    // Inclinación (en su pose local, mirando a la derecha): se echa atrás al cargar,
    // se lanza de cabeza al embestir y se ladea un poco al volar.
    const fwd = e.vx * e.dir;
    const want = e.state === 'windup' ? -0.4 : e.state === 'ram' ? Math.atan2(e.vy, Math.abs(e.vx)) + 0.25 : clamp(fwd / 260, -0.25, 0.25);
    e.tilt = (e.tilt ?? 0) + (want - (e.tilt ?? 0)) * Math.min(1, dt * 10);
  },

  // Ojo de techo: vigila; al verte carga (el iris se dilata), escupe una ráfaga de
  // tres y cierra el párpado: endurecido, las balas rebotan hasta que vuelve a abrir.
  ceilingEye(e, dt, g) {
    const p = g.player, d = e.def;
    const dist = Math.hypot(p.cx - e.cx, p.cy - e.cy);
    e.state ??= 'watch';
    tick(e, dt);
    const awake = dist < d.range * g.state.mod('visibility') && g.world.lineOfSight(e.cx, e.y + e.h, p.cx, p.cy);
    e.hard = e.state === 'shut';
    e.charging = e.state === 'charge';
    if (e.state === 'watch') {
      e.frame = awake || e.lit ? 'open' : (Math.sin(e.t * 0.7 + e.seed) > 0.85 ? 'open' : 'closed');
      // Cerca del inicio el aviso es largo; más adentro, apenas un parpadeo.
      if (awake && e.cool <= 0) { e.state = 'charge'; e.timer = 0.7 - 0.3 * (g.room.tier ?? 0); g.audio.play('charge', e); }
    } else if (e.state === 'charge') {
      e.frame = 'open';
      if (e.timer <= 0) { e.state = 'burst'; e.volley = eyeVolley(e, g); e.shots = e.volley.n; e.timer = 0; }
    } else if (e.state === 'burst') {
      if (e.timer <= 0) {
        const v = e.volley;
        eyeShot(e, g, v, v.n - e.shots);
        e.timer = v.gap;
        if (--e.shots <= 0) { e.state = 'shut'; e.timer = d.shut ?? 1.4; e.frame = 'closed'; }
      }
    } else if (e.timer <= 0) {
      e.state = 'watch';
      e.cool = d.fireRate * (1 - 0.25 * (g.room.tier ?? 0)) * (g.state.light <= 0 ? 0.5 : 1);
    }
  },

  // Saco de esporas: inmóvil; si te acercas se hincha y revienta (o revienta al matarlo).
  spore(e, dt, g) {
    const p = g.player, d = e.def;
    const dist = Math.hypot(p.cx - e.cx, p.cy - e.cy);
    if (!e.armed && dist < d.trigger && g.world.lineOfSight(e.cx, e.cy, p.cx, p.cy)) {
      e.armed = true;
      e.fuse = d.fuse;
      g.audio.play('charge', e);
    }
    if (e.armed) {
      e.fuse -= dt;
      e.flash = Math.floor(e.fuse * 16) % 2 ? 0.05 : 0;
      if (e.fuse <= 0) e.die();
    }
    if (e.anchor) return;                                  // pegado al techo o a una pared
    e.vy = Math.min(380, e.vy + GRAVITY * dt);
    e.vx = 0;
    g.world.move(e, dt);
  },

  // Ganglio Madre: flota guardando distancia, dispara ráfagas de orbes eléctricos
  // y engendra neuronas. Con poca vida dispara más a menudo. Cada pocos segundos (o si
  // te le echas encima) se teletransporta: se queda quieto chisporroteando y parpadeando
  // (la anticipación; en su destino ya saltan chispas) y reaparece allí con un estallido.
  // Enfurecido carga más rápido, salta más a menudo y al llegar suelta un anillo de orbes.
  bossGanglion(e, dt, g) {
    const p = g.player, d = e.def;
    const dx = p.cx - e.cx, dy = p.cy - e.cy, dist = Math.hypot(dx, dy) || 1;
    const enraged = e.hp < d.hp / 2;
    const spark = (x, y, n, sp, life = 0.45) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = sp * (0.4 + Math.random() * 0.6);
        g.glowParticles.emit(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, color: Math.random() < 0.3 ? [1, 1, 1] : [0.5, 0.85, 1] });
      }
    };
    e.tpCool = (e.tpCool ?? 6) - dt;
    if (e.tp) {
      e.tp.t -= dt;
      e.vx = e.vy = 0;
      if (e.tp.phase === 'charge') {
        const k = 1 - e.tp.t / e.tp.total;
        // Parpadeo eléctrico: cada vez desaparece más a menudo y destella en blanco.
        e.vanish = Math.random() < 0.15 + k * 0.45;
        if (Math.random() < 0.25 + k * 0.4) e.flash = 0.04;
        e.shakeX = (Math.random() - 0.5) * 2 * k;
        if (Math.random() < 0.5) spark(e.cx, e.cy, 1, 60 + k * 80);
        if (Math.random() < 0.3 + k * 0.6) spark(e.tp.x, e.tp.y, 1, 30 + k * 50, 0.35); // aviso: ahí aparecerá
        if (e.tp.t <= 0) {
          spark(e.cx, e.cy, 22, 160, 0.5);
          e.x = e.tp.x - e.w / 2; e.y = e.tp.y - e.h / 2;
          spark(e.cx, e.cy, 26, 170, 0.55);
          g.audio.play(d.sounds?.blink ?? 'gangZap', e);
          g.shake = Math.max(g.shake ?? 0, 4);
          if (enraged) {
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              g.spawnProjectile({ x: e.cx - 2, y: e.cy - 2, w: 5, h: 5, vx: Math.cos(a) * 75, vy: Math.sin(a) * 75, damage: 8, kind: 'orb', owner: 'enemy', color: '#82d2ff', glow: [0.5, 0.85, 1], life: 2.6 });
            }
          }
          e.tp = { phase: 'arrive', t: 0.35, total: 0.35 };
          e.shakeX = 0;
        }
      } else {
        e.vanish = e.tp.t > 0.12 && Math.random() < 0.3;     // se asienta, aún inestable
        if (e.tp.t <= 0) { e.tp = null; e.vanish = false; e.cool = Math.max(e.cool ?? 0, 0.6); }
      }
      return;
    }
    // ¿Toca saltar? Cada pocos segundos, o antes si lo tienes encima.
    if (e.tpCool <= 0 || (dist < 55 && e.tpCool < 3.5)) {
      const to = ganglionSpot(e, g);
      e.tpCool = enraged ? 4.5 + Math.random() * 1.5 : 7 + Math.random() * 2;
      if (to) {
        const total = enraged ? 0.75 : 1.05;
        e.tp = { phase: 'charge', t: total, total, x: to[0], y: to[1] };
        g.audio.play(d.sounds?.charge ?? 'gangZap', e);
        return;
      }
    }
    let speed = d.speed * (e.lit ? 0.5 : 1);
    const want = dist > 95 ? 1 : dist < 60 ? -1 : 0;
    e.vx = (dx / dist) * speed * want + Math.sin(e.t * 1.3) * 18;
    e.vy = (dy / dist) * speed * want + Math.cos(e.t * 1.7) * 14;
    g.world.move(e, dt);
    e.cool = (e.cool ?? 2) - dt;
    if (e.cool <= 0) {
      e.cool = enraged ? 1.5 : 2.4;
      const a = Math.atan2(dy, dx);
      for (const off of enraged ? [-0.35, 0, 0.35] : [-0.2, 0.2]) {
        g.spawnProjectile({
          x: e.cx - 2, y: e.cy - 2, w: 5, h: 5, vx: Math.cos(a + off) * 90, vy: Math.sin(a + off) * 90, // era 120
          damage: 8, kind: 'orb', owner: 'enemy', color: '#ffd25a', glow: [1, 0.8, 0.3], life: 3.3, // más lentas, mismo alcance
        });
      }
      g.audio.play(d.sounds?.attack ?? 'spit', e);
    }
    e.spawnCool = (e.spawnCool ?? 4) - dt;
    if (e.spawnCool <= 0) {
      e.spawnCool = enraged ? 4 : 6;
      if (g.room.enemies.filter((m) => m.minion && m.alive).length < 3) {
        g.spawnMinion('neurona', e.cx, e.cy);
        g.audio.play(d.sounds?.summon ?? 'flicker', e);
      }
    }
  },

  // Matriarca (esfinge de las esporas, entities/Moth.js). Ciclo:
  //   crawl   corre por el suelo, las paredes y el techo siguiendo el contorno de la
  //           sala (def.crawl en levels.js: puntos del recorrido, en tiles); desde el
  //           techo deja caer vainas de esporas si pasas por debajo
  //   takeoff se despega de la superficie abriendo las alas
  //   hover   revolotea sobre ti sacudiendo polvo de esporas de las alas
  //   aim     se queda quieta, los ocelos se encienden y el aguijón brilla: ¡muévete!
  //   dive    se lanza en picado hacia donde estabas
  //   stuck   el aguijón se clava en la roca: vulnerable (recibe el doble)
  //   free    se arranca y vuelve a la pared más cercana
  // Enfurecida corre más, sacude más polvo y encadena dos picados.
  bossMoth(e, dt, g) {
    const p = g.player, d = e.def;
    const enraged = e.hp < d.hp / 2;
    const A = (e.arena ??= mothArena(e, g));
    const MX = (A.left + A.right) / 2, MY = (A.top + A.floor) / 2;
    const inset = e.h / 2 + 2;
    // Recorrido por el contorno de la arena (suelo, pared, techo, pared): centro del cuerpo, en px.
    if (!e.path) {
      const pts = (e.crawl ?? d.crawl)?.map(([x, y]) => [x * TILE, y * TILE])
        ?? [[A.right - inset, A.floor - inset], [A.left + inset, A.floor - inset], [A.left + inset, A.top + inset], [A.right - inset, A.top + inset], [A.right - inset, A.floor - inset]];
      e.path = pts.map(([x, y], i) => {
        const [nx, ny] = pts[i + 1] ?? pts[i];
        return { x, y, len: Math.hypot(nx - x, ny - y) };
      });
      e.pathLen = e.path.reduce((n, sg) => n + sg.len, 0);
      e.s = 0;
    }
    const at = (sv) => {
      let rest = Math.max(0, Math.min(e.pathLen, sv));
      for (let i = 0; i < e.path.length - 1; i++) {
        const a = e.path[i], b = e.path[i + 1];
        if (rest <= a.len || i === e.path.length - 2) {
          const u = a.len ? Math.min(1, rest / a.len) : 0;
          const tx = (b.x - a.x) / (a.len || 1), ty = (b.y - a.y) / (a.len || 1);
          // Superficie: el lado del segmento donde hay roca.
          const horiz = Math.abs(tx) > Math.abs(ty);
          const rot = horiz ? (a.y > MY ? 0 : Math.PI) : (a.x < MX ? Math.PI / 2 : -Math.PI / 2);
          return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, tx, ty, rot, ceiling: horiz && a.y < MY };
        }
        rest -= a.len;
      }
      return { x: e.path[0].x, y: e.path[0].y, tx: 1, ty: 0, rot: 0 };
    };
    const nearestS = (x, y) => {
      let best = 0, bd = Infinity, acc = 0;
      for (let i = 0; i < e.path.length - 1; i++) {
        const a = e.path[i], b = e.path[i + 1];
        for (let k = 0; k <= 20; k++) {
          const u = k / 20, px = a.x + (b.x - a.x) * u, py = a.y + (b.y - a.y) * u, dd = Math.hypot(px - x, py - y);
          if (dd < bd) { bd = dd; best = acc + a.len * u; }
        }
        acc += a.len;
      }
      return best;
    };
    const place = (x, y) => { e.x = x - e.w / 2; e.y = y - e.h / 2; };
    const go = (st, time) => { e.gs = st; e.timer = time; };
    e.gs ??= 'crawl';
    e.timer = (e.timer ?? MOTH_T.crawl) - dt;
    e.glowK = Math.max(0, (e.glowK ?? 0) - dt * 2);
    e.contactDamage = d.contactDamage;
    e.exposed = false;
    const crawlTime = () => (enraged ? 0.9 : 1.3) + Math.random() * 1.1;
    const faceTo = (q, x, y) => { const fx = Math.cos(q.rot), fy = Math.sin(q.rot); return Math.sign((x - q.x) * fx + (y - q.y) * fy) || e.face; };
    if (e.struck) {
      const h = e.struck;
      e.struck = null;
      if ((e.gs === 'crawl' || e.gs === 'hover') && e.t - (e.lastRush ?? -9) > 2.2 && Math.random() < (enraged ? 0.75 : 0.5)) {
        e.lastRush = e.t;
        e.rushFrom = e.gs;
        e.rushAt = { x: h.x, y: h.y };
        go('turn', 0.24);
        g.audio.play(d.sounds?.attack ?? 'screech', e);
      }
    }

    if (e.gs === 'turn') {
      // Se revuelve: se encara hacia el golpe, temblando, con los ocelos encendidos.
      e.glowK = 1;
      if (e.rushFrom === 'crawl') {
        const q = at(e.s);
        place(q.x + (Math.random() - 0.5) * 3, q.y);
        e.pose = 'crawl'; e.rot = q.rot; e.crawlV = 0;
        e.face = faceTo(q, e.rushAt.x, e.rushAt.y);
      } else {
        e.vx *= 0.8; e.vy *= 0.8;
        place(e.cx + (Math.random() - 0.5) * 3, e.cy);
        e.pose = 'fly'; e.rot = 0; e.face = 1; e.flapRate = 18;
      }
      if (e.timer <= 0) {
        g.audio.play('whip', e);
        if (e.rushFrom === 'crawl') { e.rushS = nearestS(e.rushAt.x, e.rushAt.y); go('rush', 1.3); }
        else {
          const a = Math.atan2(e.rushAt.y - e.cy, e.rushAt.x - e.cx);
          e.vx = Math.cos(a) * 340; e.vy = Math.sin(a) * 340;
          go('ram', 0.45);
        }
      }
    } else if (e.gs === 'rush') {
      // Carga corriendo por el contorno hacia donde le golpearon, mucho más rápida.
      e.contactDamage = d.stingDamage;
      const dir = Math.sign(e.rushS - e.s) || 1;
      e.crawlV = d.crawlSpeed * 2.8;
      e.s = Math.max(0, Math.min(e.pathLen, e.s + dir * e.crawlV * dt));
      const q = at(e.s);
      place(q.x, q.y);
      e.pose = 'crawl'; e.rot = q.rot;
      const fx = Math.cos(q.rot), fy = Math.sin(q.rot);
      e.face = (q.tx * dir * fx + q.ty * dir * fy) >= 0 ? 1 : -1;
      if (Math.random() < 0.5) g.particles.emit(q.x, q.y, { vx: -q.tx * dir * 60, vy: -q.ty * dir * 60 - 20, life: 0.4, gravity: 300, color: [0.45, 0.4, 0.42] });
      if (Math.abs(e.rushS - e.s) < 6 || e.timer <= 0) go('crawl', 0.5);
    } else if (e.gs === 'ram') {
      // En el aire: una embestida corta hacia quien le golpeó.
      e.contactDamage = d.stingDamage;
      e.pose = 'fly'; e.rot = 0; e.face = 1; e.flapRate = 20;
      place(Math.max(A.left + inset, Math.min(A.right - inset, e.cx + e.vx * dt)), Math.max(A.top + inset, Math.min(A.floor - inset, e.cy + e.vy * dt)));
      if (e.timer <= 0) { e.vx = e.vy = 0; go('hover', 0.5); }
    } else if (e.gs === 'crawl') {
      // Corre por el contorno buscando el techo justo encima de ti (trepa por la pared
      // y cruza el techo para dejarte caer las vainas).
      const target = nearestS(p.cx, 0);
      const speed = d.crawlSpeed * (enraged ? 1.35 : 1);
      const dir = Math.sign(target - e.s) || 1;
      e.crawlV = Math.abs(target - e.s) > 6 ? speed : 0;
      e.s = Math.max(0, Math.min(e.pathLen, e.s + dir * e.crawlV * dt));
      const q = at(e.s);
      place(q.x, q.y);
      e.pose = 'crawl';
      e.rot = q.rot;
      // Mira hacia donde corre (en local, +x es delante).
      const fx = Math.cos(q.rot), fy = Math.sin(q.rot);
      e.face = (q.tx * dir * fx + q.ty * dir * fy) >= 0 ? 1 : -1;
      if (!e.crawlV) e.face = Math.sign((p.cx - q.x) * fx + (p.cy - q.y) * fy) || e.face;
      // Desde el techo deja caer vainas de esporas sobre ti.
      e.drop = (e.drop ?? 0) - dt;
      if (q.ceiling && Math.abs(p.cx - q.x) < 30 && p.cy > q.y && e.drop <= 0) {
        e.drop = enraged ? 0.6 : 1.1;
        g.spawnProjectile({
          x: q.x - 4, y: q.y + 6, w: 7, h: 7, vx: (p.cx - q.x) * 0.4, vy: 30, gravity: 420, life: 3,
          damage: 5, kind: 'sporeLob', owner: 'enemy', burstRadius: 30, burstDamage: 5,
        });
        g.audio.play(d.sounds?.attack ?? 'spit', e);
      }
      if (e.timer <= 0) {
        if (Math.random() < (enraged ? 0.6 : 0.5)) {
          // Se lanza en picado directamente desde la pared, el techo o el suelo.
          e.diveA = Math.atan2(p.cy - q.y, p.cx - q.x);
          e.diveFace = Math.cos(e.diveA) >= 0 ? 1 : -1;
          e.dives = 1; e.ext = 0; e.vx = e.vy = 0;
          go('windup', WINDUP);
          g.audio.play('charge', e);
        } else { go('takeoff', MOTH_T.takeoff); e.from = { x: q.x, y: q.y, rot: q.rot }; g.audio.play('whip', e); }
      }
    } else if (e.gs === 'takeoff') {
      // Se separa de la superficie hacia el interior de la sala.
      const k = 1 - e.timer / MOTH_T.takeoff;
      const nx = -Math.sin(e.from.rot), ny = Math.cos(e.from.rot); // hacia "arriba" local
      place(e.from.x - nx * 0 + Math.sin(e.from.rot) * 40 * k, e.from.y - Math.cos(e.from.rot) * 40 * k);
      e.pose = 'fly'; e.rot = 0; e.face = 1; e.flapRate = 16;
      if (e.timer <= 0) { go('hover', enraged ? MOTH_T.hoverRage : MOTH_T.hover); e.vx = e.vy = 0; e.dives = enraged ? 3 : 2; } // encadena picados
    } else if (e.gs === 'hover' || e.gs === 'aim') {
      // Revolotea sobre ti, a cierta altura, sin salir de la sala.
      const tx = Math.max(A.left + 40, Math.min(A.right - 40, p.cx + Math.sin(e.t * 1.7) * 50));
      const ty = Math.max(A.top + 30, Math.min(A.floor - 80, p.cy - 72 + Math.sin(e.t * 3.1) * 8));
      if (e.gs === 'hover') {
        e.vx += ((tx - e.cx) * 4 - e.vx * 2.4) * dt;
        e.vy += ((ty - e.cy) * 4 - e.vy * 2.4) * dt;
        e.pose = 'fly'; e.flapRate = 10;
        // Polvo de esporas de las alas.
        e.dust = (e.dust ?? 0) - dt;
        if (e.dust <= 0) {
          e.dust = enraged ? 0.32 : 0.5;
          const sx = e.cx + (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 22);
          g.spawnProjectile({ x: sx - 3, y: e.cy - 6, w: 6, h: 6, vx: (Math.random() - 0.5) * 30, vy: 20, life: 4.5, damage: 4, kind: 'seed', owner: 'enemy', home: 15 });
        }
        if (e.timer <= 0) { go('aim', enraged ? MOTH_T.aimRage : MOTH_T.aim); e.aimAt = { x: p.cx + p.vx * 0.2, y: p.cy }; g.audio.play('charge', e); }
      } else {
        e.vx *= 0.85; e.vy *= 0.85;
        e.pose = 'aim';
        e.glowK = 1;
        e.aimAt = { x: e.aimAt.x + (p.cx - e.aimAt.x) * dt * 2, y: e.aimAt.y + (p.cy - e.aimAt.y) * dt * 2 }; // te sigue un poco
        if (e.timer <= 0) {
          // Fija la dirección del picado y empieza la anticipación.
          e.diveA = Math.atan2(e.aimAt.y - e.cy, e.aimAt.x - e.cx);
          e.diveFace = Math.cos(e.diveA) >= 0 ? 1 : -1;
          go('windup', WINDUP);
          e.ext = 0;
          e.vx = e.vy = 0;
          g.audio.play('whip', e);
        }
      }
      place(e.cx + e.vx * dt, e.cy + e.vy * dt);
      e.rot = 0; e.face = 1;
    } else if (e.gs === 'windup') {
      // Anticipación: recula contra la dirección del picado; primero alza y recoge las
      // alas de frente, luego se pliega de perfil, curva el abdomen (el aguijón pasa
      // delante) y va girando hasta apuntar donde va a caer.
      const k = 1 - Math.max(0, e.timer) / WINDUP;
      const back = (1 - k) * 70;
      place(e.cx - Math.cos(e.diveA) * back * dt, e.cy - Math.sin(e.diveA) * back * dt);
      e.glowK = 1;
      if (k < 0.35) {
        e.pose = 'rise'; e.fold = k / 0.35; e.rot = 0; e.face = 1;
      } else {
        const u = (k - 0.35) / 0.65, ease = u * u * (3 - 2 * u);
        e.pose = 'tuck';
        e.curl = ease;
        e.wingA = 1.1 * (1 - ease);
        // ángulo del "delante" de perfil: de vertical (cabeza arriba) al del picado
        const from = -Math.PI / 2;
        let delta = e.diveA - from;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        const fa = from + delta * ease;
        e.face = e.diveFace;
        e.rot = e.face > 0 ? fa : fa - Math.PI;
      }
      if (e.timer <= 0) {
        e.vx = Math.cos(e.diveA) * d.diveSpeed; e.vy = Math.sin(e.diveA) * d.diveSpeed;
        go('dive', 1.5);
        g.audio.play(d.sounds?.dive ?? 'screech', e);
      }
    } else if (e.gs === 'dive') {
      e.pose = 'dive';
      // El aguijón sale disparado como un arpón en las primeras décimas del picado.
      e.ext = Math.min(1, (e.ext ?? 0) + dt / 0.12);
      e.face = e.diveFace;
      e.rot = e.face > 0 ? e.diveA : e.diveA - Math.PI; // de perfil, la cabeza por delante
      e.glowK = 1;
      e.contactDamage = d.stingDamage;
      const ncx = e.cx + e.vx * dt, ncy = e.cy + e.vy * dt;
      // Punta del aguijón: la pose local girada igual que el dibujo.
      const [lx, ly] = stingTip(1, e.ext), c = Math.cos(e.rot), sn = Math.sin(e.rot);
      const tipX = ncx + c * lx * e.face - sn * ly, tipY = ncy + sn * lx * e.face + c * ly;
      place(ncx, ncy);
      if (Math.random() < 0.6) g.particles.emit(e.cx, e.cy, { vx: -e.vx * 0.1, vy: -e.vy * 0.1, life: 0.3, color: [0.5, 0.42, 0.5] });
      // Clava el aguijón en lo que tenga delante.
      if (g.world.solidAtPx(tipX, tipY) || tipX < A.left || tipX > A.right || tipY > A.floor || tipY < A.top || e.timer <= 0) {
        go('stuck', enraged ? MOTH_T.stuckRage : MOTH_T.stuck);
        g.shake = Math.max(g.shake, 5);
        g.audio.play('crunch', e);
        for (let i = 0; i < 10; i++) g.particles.emit(tipX, tipY, { vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 100, life: 0.6, gravity: 500, color: [0.45, 0.4, 0.42] });
        // Clavada en el suelo: de ese punto brota un Saco Esporífero (como mucho tres a la vez).
        const intoFloor = Math.sin(e.diveA) > 0.4 && (g.world.solidAtPx(tipX, tipY) || tipY > A.floor);
        if (intoFloor && g.room.enemies.filter((m) => m.minion && m.alive && m.type === 'espora').length < 3) {
          const floorY = Math.min(A.floor, Math.floor(tipY / TILE) * TILE);
          const sp = g.spawnMinion('espora', tipX, floorY);
          sp.y = floorY - sp.h;             // con la base en el suelo
          g.audio.play('bubble', e);
          for (let i = 0; i < 14; i++) g.glowParticles.emit(tipX, floorY - 2, { vx: (Math.random() - 0.5) * 80, vy: -30 - Math.random() * 70, life: 0.7, color: [0.75, 0.6, 0.85] });
        }
      }
      // Si te ensarta: daño e infección.
      // Si te ensarta (en cualquier punto del asta): daño e infección.
      for (let k = 0; k <= 3; k++) {
        const hx = ncx + (tipX - ncx) * (0.4 + k * 0.2), hy = ncy + (tipY - ncy) * (0.4 + k * 0.2);
        if (Math.hypot(p.cx - hx, p.cy - hy) < 12) { g.hurtPlayer(d.stingDamage, e.cx, d.name); break; }
      }
    } else if (e.gs === 'stuck') {
      e.pose = 'stuck';
      e.exposed = true;
      // El arpón sigue clavado y tenso; al final lo recoge de un tirón para soltarse.
      e.ext = e.timer < 0.25 ? Math.max(0, e.timer / 0.25) : 1;
      // aletea para soltarse: levanta polvo de esporas
      if (Math.random() < 0.35) g.glowParticles.emit(e.cx + (Math.random() - 0.5) * 40, e.cy + (Math.random() - 0.5) * 30, { vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 30, life: 0.7, color: [0.6, 0.5, 0.65] });
      if (Math.random() < 0.08) g.audio.play('whip', e);
      if (e.timer <= 0) {
        if (--e.dives > 0) { go('hover', MOTH_T.chain); e.vx = 0; e.vy = -160; e.rot = 0; } // se arranca y vuelve a fijarte enseguida
        else { go('free', MOTH_T.free); e.from = { x: e.cx, y: e.cy }; e.s = nearestS(e.cx, e.cy); }
        e.dives = Math.max(0, e.dives);
      }
    } else if (e.gs === 'free') {
      // Se arranca y vuela a la pared más cercana de su recorrido.
      const k = 1 - Math.max(0, e.timer) / MOTH_T.free, q = at(e.s);
      place(e.from.x + (q.x - e.from.x) * k, e.from.y + (q.y - e.from.y) * k);
      e.pose = 'fly'; e.rot = 0; e.face = 1; e.flapRate = 16;
      if (e.timer <= 0) go('crawl', crawlTime());
    }
  },

  // Fauce colgante: cuelga quieta, abre los pétalos (aviso), cae a plomo sobre ti,
  // se queda mordiendo el suelo y vuelve a subir por su tallo.
  pod(e, dt, g) {
    const d = e.def, p = g.player;
    e.home ??= e.y;
    e.phase ??= 'wait';
    e.timer ??= d.period * Math.random();
    e.timer -= dt;
    e.shakeX = 0;
    const under = Math.abs(p.cx - e.cx) < 26 && p.y > e.y;
    if (e.phase === 'wait' && e.timer <= 0 && under) {
      e.phase = 'shake';
      e.timer = 0.45;
      g.audio.play('charge', e);
    } else if (e.phase === 'shake') {
      e.shakeX = Math.random() < 0.5 ? -1 : 1;
      if (e.timer <= 0) { e.phase = 'fall'; e.vy = 0; }
    } else if (e.phase === 'fall') {
      e.vx = 0;
      e.vy = Math.min(460, e.vy + 1500 * dt);
      g.world.move(e, dt);
      if (e.y > g.world.pixelH) { e.y = e.home; e.phase = 'wait'; e.timer = d.period; return; }
      if (e.onGround || e.y - e.home > e.dropLen) {
        e.phase = 'ground';
        e.timer = 0.9;
        g.audio.play('tear', e);
      }
    } else if (e.phase === 'ground' && e.timer <= 0) {
      e.phase = 'rise';
    } else if (e.phase === 'rise') {
      e.y -= 45 * dt;
      if (e.y <= e.home) { e.y = e.home; e.phase = 'wait'; e.timer = d.period; }
    }
  },

  // Colonia bacilar: un gólem de bacterias que te imita (entities/Golem.js). Tres
  // formas según e.gen:
  //   0 gólem  camina erguido hacia ti, te apunta con el brazo, salta cuando saltas
  //            y, pegado a ti, lanza un puñetazo que se estira. Cada GOLEM_SHED de daño
  //            suelta un grumo (y pierde un brazo, luego el otro...)
  //   1 grumo  salta hacia ti a botes cortos
  //   2 pulpa  corretea deprisa dando saltitos
  // Al morir, el gólem se deshace en dos grumos y cada grumo en dos pulpas.
  golem(e, dt, g) {
    const d = e.def, s = senses(e, g, 40), p = g.player, gen = e.gen ?? 0;
    e.state ??= 'walk';
    tick(e, dt);
    e.cool2 = (e.cool2 ?? 0) - dt;
    if (e.state === 'recover') {
      // recién desprendido: cae y se recompone
      e.vx *= 0.9; fall(e, g, dt);
      if (e.timer <= 0) e.state = 'walk';
      return;
    }
    if (e.state === 'thrown') {
      // Grumo arrojado: vuela en parábola, hiere al dar y revienta en el suelo.
      e.vy += GRAVITY * dt;
      g.world.move(e, dt);
      if (Math.random() < 0.5) g.particles.emit(e.cx, e.cy, { vx: -e.vx * 0.1, vy: 10, life: 0.3, gravity: 300, color: [0.5, 0.7, 0.2] });
      if (!e.hitDone && overlap(p, e)) { e.hitDone = true; g.hurtPlayer(d.throwDamage, e.cx, d.name); }
      if (e.onGround || e.hitWall || e.hitCeiling) {
        for (let i = 0; i < 10; i++) g.particles.emit(e.cx, e.y + e.h, { vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 60, life: 0.5, gravity: 500, color: [0.45, 0.65, 0.18], stain: [0.35, 0.5, 0.12] });
        g.audio.play('bubble', e);
        e.state = 'recover'; e.timer = 0.45; e.vx *= 0.3;
      }
      return;
    }
    if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
    if (gen === 0) {
      // Regenera las bolas de células que ha arrojado (primero la barriga, luego la joroba).
      e.missing ??= 0;
      if (e.missing > 0 && e.state !== 'throwWind') {
        e.regrow = (e.regrow ?? 0) + dt / d.regrowTime;
        if (e.regrow >= 1) { e.missing--; e.regrow = 0; g.audio.play('colonySquirm', e); }
      }
      // A distancia: se arranca una bola de la espalda y te la arroja.
      if (e.state === 'throwWind') {
        e.vx = 0; fall(e, g, dt);
        e.throwK = 1 - Math.max(0, e.timer) / d.throwWindup;
        if (e.timer <= 0) {
          const hx = e.cx + e.dir * 6, hy = e.y + 4;
          const lump = g.spawnOffspring('colonia', hx, hy, { ...ENEMY_FORMS.colonia[1], gen: 1, parent: e, state: 'thrown', life: 0 });
          if (lump) {
            const tx = p.cx + p.vx * 0.25, ty = p.y + p.h - 6;
            const T = clamp(Math.hypot(tx - hx, ty - hy) / 210, 0.45, 0.95);
            lump.dir = e.dir;
            lump.vx = (tx - hx) / T;
            lump.vy = Math.max(-430, (ty - hy - 0.5 * GRAVITY * T * T) / T);
            e.missing++; e.regrow = 0;
            // Pierde cohesión: cada bola es un trozo de sí mismo que ya no vuelve solo.
            e.cohesion = (e.cohesion ?? d.cohesion ?? 99) - 1;
            e.hp = Math.max(1, e.hp - (d.throwCost ?? 0));
            g.audio.play('colonyHurt', e);
          }
          e.state = 'throw'; e.timer = 0.3; e.cool = d.throwCool;
        }
        return;
      }
      if (e.state === 'throw') {
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) {
          e.state = 'walk';
          if ((e.cohesion ?? 1) <= 0) { collapseColony(e, g); return; }
        }
        return;
      }
      // Cuanta menos cohesión, más células se le desprenden al andar.
      const loose = 1 - (e.cohesion ?? d.cohesion ?? 1) / (d.cohesion ?? 1);
      if (loose > 0 && Math.random() < loose * dt * 8) {
        g.particles.emit(e.x + Math.random() * e.w, e.y + Math.random() * e.h * 0.7, { vx: (Math.random() - 0.5) * 30, vy: 10, life: 0.8, gravity: 400, color: [0.45, 0.65, 0.18], stain: [0.35, 0.5, 0.12] });
      }
      // Le has pegado: se gira y, si te tiene cerca, te suelta el puñetazo enseguida.
      if (e.provoked && e.state === 'walk') {
        e.provoked = false;
        e.dir = Math.sign(p.cx - e.cx) || e.dir;
        if (Math.abs(p.cx - e.cx) < d.punchRange + 14 && Math.abs(p.cy - e.cy) < 40 && e.onGround) {
          e.state = 'punchWind'; e.timer = d.counterWindup ?? 0.22; g.audio.play('charge', e);
          return;
        }
      }
      e.aiming = s.sees && s.dist > d.punchRange;
      e.aimA = s.sees ? Math.max(-1.2, Math.min(1.2, Math.atan2(s.dy + 8, Math.abs(s.dx)))) : 0.5;
      if (e.state === 'punchWind') {
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) {
          e.state = 'punch'; e.timer = 0.25;
          g.audio.play('melee', e);
          hitZone(g, e, e.dir > 0 ? e.x + e.w - 2 : e.x - 26, e.y + 10, 28, 22, d.punchDamage);
          g.shake = Math.max(g.shake, 2);
        }
        return;
      }
      if (e.state === 'punch') {
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) { e.state = 'walk'; e.cool = d.punchCool; }
        return;
      }
      // Te imita: si saltas cerca, salta también.
      if (s.sees && s.dist < 130 && !p.onGround && p.vy < -80 && e.onGround && e.cool2 <= 0) {
        e.vy = -250; e.cool2 = 1.4;
        g.audio.play('colonySquirm', e);
      }
      groundWalk(e, g, dt, speedMods(e, g, s.sees ? d.chaseSpeed : d.speed), s.sees);
      if (s.sees && s.dist < d.punchRange && Math.abs(s.dy) < 24 && e.cool <= 0 && e.onGround) {
        e.state = 'punchWind'; e.timer = d.punchWindup; g.audio.play('charge', e);
      } else if (s.sees && s.dist > d.punchRange + 16 && s.dist < d.throwRange && e.cool <= 0 && e.onGround && e.missing < 2) {
        e.state = 'throwWind'; e.timer = d.throwWindup; e.throwK = 0;
        g.audio.play('colonySquirm', e);
      }
      return;
    }
    if (gen === 1) {
      // Grumo arrojado: al rato vuelve saltando a su coloso y se funde con él.
      e.life = (e.life ?? 0) + dt;
      const home = e.parent?.alive ? e.parent : null;
      if (home && e.life > d.rejoinAfter) {
        if (overlap(e, home)) {
          e.alive = false; e.dispose();
          home.missing = Math.max(0, (home.missing ?? 0) - 1); home.regrow = 0;
          if (home.def.cohesion) {
            home.cohesion = Math.min(home.def.cohesion, (home.cohesion ?? home.def.cohesion) + 1);
            home.hp = Math.min(home.def.hp, home.hp + (home.def.throwCost ?? 0));
          }
          for (let i = 0; i < 8; i++) g.particles.emit(e.cx, e.cy, { vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, life: 0.4, gravity: 300, color: [0.55, 0.75, 0.22] });
          g.audio.play('bubble', home);
          return;
        }
        e.dir = Math.sign(home.cx - e.cx) || e.dir;
        if (e.onGround) {
          e.vx *= 0.7;
          if (e.cool <= 0) { e.vx = e.dir * (70 + Math.random() * 30); e.vy = -170 - Math.random() * 50; e.cool = 0.45 + Math.random() * 0.3; }
        }
        fall(e, g, dt);
        return;
      }
      // Grumo: espera en el suelo, se encoge y salta hacia ti.
      if (e.onGround) {
        e.vx *= 0.7;
        if (s.sees && e.cool <= 0) {
          e.vx = e.dir * (60 + Math.random() * 30);
          e.vy = -150 - Math.random() * 60;
          e.cool = 0.7 + Math.random() * 0.5;
          if (Math.random() < 0.4) g.audio.play('bubble', e);
        }
      }
      fall(e, g, dt);
      return;
    }
    // Pulpa: corre hacia ti y da saltitos nerviosos.
    if (e.onGround && e.cool <= 0 && s.sees) { e.vy = -90 - Math.random() * 60; e.cool = 0.4 + Math.random() * 0.6; }
    groundWalk(e, g, dt, speedMods(e, g, s.sees ? d.pulpSpeed : 20), s.sees);
  },

  // Vestigio: avanza a tirones; a media distancia se queda quieto, sacude la cabeza
  // y arranca en una carrera torpe y repentina que acaba en un zarpazo.
  // Glotón: avanza pesado; pegado a ti alza los dos brazos y descarga un mazazo contra
  // el suelo delante; a media distancia se agacha (sentadilla) y salta hacia ti, y al
  // caer hace temblar el suelo. e.st: walk · raise · smash · recover · squat · hop · land
  // (e.stK = avance de la pose, para el dibujo).
  glutton(e, dt, g) {
    const d = e.def, s = senses(e, g, 70), dx = s.dx, p = s.p;
    e.cool = (e.cool ?? 0.8) - dt;
    e.hopCool = (e.hopCool ?? 1.5) - dt;
    e.st ??= 'walk';
    e.timer = (e.timer ?? 0) - dt;
    const set = (st, time) => { e.st = st; e.timer = time; e.stT = time; };
    e.stK = e.stT ? Math.max(0, Math.min(1, 1 - e.timer / e.stT)) : 0;
    // Hacia dónde estás (sin girarse por un par de píxeles cuando lo tienes encima).
    const toward = Math.abs(p.cx - e.cx) < 6 ? e.dir : Math.sign(p.cx - e.cx);
    const close = Math.abs(dx) < d.smashRange + 6 && Math.abs(s.dy) < 40;
    e.hitT = (e.hitT ?? 0) - dt;
    if (e.hitT <= 0) e.hits = 0;
    const ground = (x) => {
      g.shake = Math.max(g.shake, 6);
      g.audio.play('thump', e);
      for (let i = 0; i < 14; i++) g.particles.emit(x + (Math.random() - 0.5) * 30, e.y + e.h - 2, { vx: (Math.random() - 0.5) * 140, vy: -40 - Math.random() * 120, life: 0.7, gravity: 600, color: Math.random() < 0.5 ? [0.75, 0.6, 0.3] : [0.8, 0.4, 0.5] });
    };
    const smash = (windup, counter = false) => { e.dir = toward; e.counter = counter; set('raise', windup); e.cool = d.smashCool; g.audio.play(d.sounds?.reveal ?? 'growl', e); };
    // Dos golpes tuyos seguidos: deja lo que esté haciendo (salvo si ya está golpeando o en
    // el aire), se gira y te devuelve el mazazo.
    if ((e.hits ?? 0) >= 2 && ['walk', 'recover', 'land'].includes(e.st) && Math.abs(s.dy) < 48) {
      e.hits = 0;
      e.provoked = false;
      smash(d.counterWindup, true);
    }
    if (e.st === 'raise') {
      // Mientras alza los brazos se gira hacia ti: el mazazo siempre cae de frente.
      e.vx = 0;
      e.dir = toward;
      if (e.timer <= 0) { set('smash', 0.18); e.hitDone = false; }
    } else if (e.st === 'smash') {
      e.vx = 0;
      if (!e.hitDone && e.timer <= 0.09) {
        e.hitDone = true;
        // Cubre también su propio cuerpo: alcanza aunque lo tengas encima.
        const reach = d.smashRange + e.w / 2;
        const box = { x: e.dir > 0 ? e.cx - 10 : e.cx + 10 - reach, y: e.y + e.h * 0.25, w: reach, h: e.h * 0.75 + 4 };
        if (overlap(p, box)) {
          // El contraataque es más contundente: más daño y te lanza lejos.
          g.hurtPlayer(e.counter ? d.counterDamage : d.smashDamage, e.cx - e.dir * 20, d.name);
          if (e.counter) { p.vx = e.dir * 260; p.vy = -200; }
        }
        g.shake = Math.max(g.shake, e.counter ? 10 : 6);
        ground(e.cx + e.dir * 26);
        g.audio.play('crunch', e);
      }
      if (e.timer <= 0) set('recover', 0.5);
    } else if (e.st === 'squat') {
      e.vx = 0;
      e.dir = toward;
      if (e.timer <= 0) {
        set('hop', 1.5);
        e.vy = -d.hopPower;
        // Salto hacia ti, o hacia atrás si te tenía encima (sin dejar de mirarte).
        e.vx = e.back ? -e.dir * d.backHop : e.dir * Math.min(d.hopSpeed, Math.abs(dx) * 1.3 + 30);
        e.airborne = false;
        g.audio.play(d.sounds?.attack ?? 'growl', e);
      }
    } else if (e.st === 'hop') {
      e.dir = toward;
      if (!e.onGround) e.airborne = true;
      if (e.airborne && e.onGround) {
        set('land', 0.4);
        e.vx = 0;
        e.back = false;
        ground(e.cx);
        // La onda del golpe al caer: hiere si estás pegado a él en el suelo.
        if (Math.abs(p.cx - e.cx) < d.landRange && Math.abs(p.y + p.h - (e.y + e.h)) < 10) g.hurtPlayer(d.landDamage, e.cx, d.name);
      } else if (e.timer <= 0) set('land', 0.3);
    } else if (e.st === 'land' || e.st === 'recover') {
      e.vx *= 0.8;
      e.dir = toward;
      if (e.provoked) e.timer = Math.min(e.timer, 0.15); // golpeado, se recompone antes
      if (e.timer <= 0) set('walk', 0);
    } else {
      if (s.sees || e.provoked) e.dir = toward;
      if (e.provoked) {
        // Le has pegado: se revuelve. Pegado a ti, mazazo rápido; si no, salta hacia ti
        // (y a veces, si estás encima, se aparta de un salto hacia atrás).
        e.provoked = false;
        if (close && Math.random() < 0.3 && e.onGround) { e.back = true; set('squat', 0.25); e.hopCool = d.hopCool * 0.5; }
        else if (close) smash(d.counterWindup, true);
        else if (Math.abs(dx) < d.hopRange[1] && e.onGround) { set('squat', 0.3); e.hopCool = d.hopCool; }
      } else if ((s.sees || close) && close && e.cool <= 0) {
        smash(d.smashWindup);
      } else if (s.sees && Math.abs(dx) > d.hopRange[0] && Math.abs(dx) < d.hopRange[1] && e.hopCool <= 0 && e.onGround) {
        set('squat', d.squatTime);
        e.hopCool = d.hopCool;
      } else {
        // Paso pesado: avanza a empujones.
        let speed = (s.sees ? d.chaseSpeed : d.speed) * (0.3 + 0.7 * Math.max(0, Math.sin(e.t * 4)));
        speed = speedMods(e, g, speed);
        const footX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
        if (ledgeAhead(g, e, footX) && e.onGround) { if (s.sees) speed = 0; else e.dir *= -1; }
        if (close) speed = 0; // pegado a ti no te empuja: espera el mazazo
        e.vx = e.dir * speed;
      }
    }
    if (e.st === 'walk') e.provoked = false;
    e.vy = Math.min(380, e.vy + GRAVITY * dt);
    g.world.move(e, dt);
    if (e.hitWall && e.st === 'walk' && !s.sees) e.dir = -e.hitWall;
  },

  // Vestigio: un esqueleto encorvado que se apoya en sus brazos-estaca. Arrastra los pies;
  // a media distancia da un latigazo con la cabeza y arranca en una carrera torpe. Cuerpo
  // a cuerpo, dos estocadas seguidas (un brazo y luego el otro). Al caer no muere: se
  // desmorona en un montón de huesos y al rato se recompone (salvo que destroces el montón).
  shambler(e, dt, g) {
    const d = e.def, s = senses(e, g, 48);
    const dx = s.dx;
    e.cool = (e.cool ?? 0) - dt;
    e.sprintCool = (e.sprintCool ?? 1) - dt;
    // Montón de huesos: quieto; los últimos segundos tiembla, el cráneo se enciende y se
    // recompone.
    if (e.state === 'pile') {
      e.contactDamage = 0;
      e.vx = 0;
      e.pileT -= dt;
      e.reformK = Math.max(0, 1 - e.pileT / (d.reformWarn ?? 1.4));
      if (e.reformK > 0 && Math.random() < dt * 12) g.audio.play('click', e);
      if (e.pileT <= 0) {
        e.state = null; e.reformK = 0;
        e.hp = d.hp;
        e.y -= d.h - e.h; e.h = d.h;                                   // de pie otra vez
        e.flash = 0.15;
        e.swing = 0; e.lurch = 0; e.sprint = 0; e.cool = 0.8;
        g.audio.play('crunch', e);
        g.audio.play(d.sounds?.reveal ?? 'screech', e);
        for (let i = 0; i < 10; i++) g.particles.emit(e.cx + (Math.random() - 0.5) * 16, e.y + e.h - 4, { vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.5, gravity: 500, color: [0.85, 0.8, 0.65] });
      }
      e.vy = Math.min(380, e.vy + GRAVITY * dt);
      g.world.move(e, dt);
      return;
    }
    e.contactDamage = undefined;
    if (e.swing > 0) {
      // Estocada: se echa el brazo atrás (aviso) y lo clava hacia delante y abajo.
      e.swing -= dt;
      e.vx *= 0.7;
      const hitAt = e.swingDur * 0.4;                              // tramo final: el golpe
      if (e.swing < hitAt && !e.hitDone) {
        e.hitDone = true;
        e.vx = e.dir * 60;                                         // un paso al clavar
        const box = { x: e.dir > 0 ? e.x + e.w - 4 : e.x - d.reach + 4, y: e.y + 4, w: d.reach, h: e.h - 4 };
        if (overlap(s.p, box)) g.hurtPlayer(e.strike === 2 ? (d.swingDamage2 ?? d.swingDamage) : d.swingDamage, e.cx, d.name);
        g.audio.play('melee', e);
      }
      if (e.swing <= 0 && e.strike === 1) {
        // Segunda estocada, con el otro brazo, casi sin pausa.
        e.strike = 2;
        e.dir = Math.sign(dx) || e.dir;
        e.swing = e.swingDur = d.swing2Time ?? 0.42;
        e.hitDone = false;
        g.audio.play('screech', e);
      } else if (e.swing <= 0) { e.strike = 0; e.cool = d.comboCool ?? 1.9; }
    } else if (e.lurch > 0) {
      // Aviso: se detiene y la cabeza le da un latigazo hacia atrás.
      e.lurch -= dt;
      e.vx = 0;
      if (e.lurch <= 0) { e.sprint = d.sprintTime; g.audio.play('screech', e); }
    } else if (e.sprint > 0) {
      e.sprint -= dt;
      e.vx = e.dir * d.sprintSpeed;
      if (Math.abs(dx) < d.reach + 6) e.sprint = 0;
      if (e.sprint <= 0) e.sprintCool = d.sprintCool;
    } else if (s.sees && Math.abs(dx) < d.reach + 8 && e.cool <= 0) {
      e.dir = Math.sign(dx) || e.dir;
      e.strike = 1;
      e.swing = e.swingDur = d.swingTime ?? 0.6;
      e.hitDone = false;
      g.audio.play('screech', e);
    } else if (s.sees && Math.abs(dx) > 50 && Math.abs(dx) < 140 && e.sprintCool <= 0 && e.onGround) {
      e.dir = Math.sign(dx) || e.dir;
      e.lurch = d.lurch;
    } else {
      if (s.sees) e.dir = Math.sign(dx) || e.dir;
      let speed = (s.sees ? d.chaseSpeed : d.speed) * (0.35 + 0.65 * Math.max(0, Math.sin(e.t * 5.5)));
      speed = speedMods(e, g, speed);
      const footX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
      if (ledgeAhead(g, e, footX) && e.onGround) { if (s.sees) speed = 0; else e.dir *= -1; }
      e.vx = e.dir * speed;
    }
    // En carrera no se detiene ante el borde: es torpe.
    e.vy = Math.min(380, e.vy + GRAVITY * dt);
    g.world.move(e, dt);
    if (e.hitWall && !(e.swing > 0)) { e.dir = -e.hitWall; e.sprint = 0; }
    e.sprinting = e.sprint > 0;
  },

  // Anguila ácida: oculta bajo el ácido; a veces asoma la cabeza y se hunde (un
  // amago) antes del salto de verdad, que hace en arco hacia ti.
  leaper(e, dt, g) {
    const p = g.player, d = e.def;
    e.home ??= { x: e.x, y: e.y };
    e.state ??= 'under';
    // Si vive en una cubeta y la vacías (una válvula de drenaje), se queda en seco: se
    // retuerce un momento y muere. En el ácido fijo (~) no le pasa.
    if (e.pool === undefined) {
      const cx = e.home.x + e.w / 2;
      e.pool = g.room.hazards.find((h) => h.surfaceY !== undefined && cx >= h.x0 && cx <= h.x0 + h.w && e.home.y + e.h >= h.yTop && e.home.y <= h.yBottom) ?? null;
    }
    const dryOut = () => {
      if (!g.state.seenEelDry) { g.state.seenEelDry = true; g.say('Sin fluido, la anguila se retuerce y muere.', 3); }
      e.hp = 0;
      e.die();
    };
    if (e.pool && (e.state === 'under' || e.state === 'peek') && e.pool.surfaceY > e.home.y + e.h * 0.6) {
      e.dryT = (e.dryT ?? 1.6) - dt;
      e.submerged = false;
      e.x = e.home.x + Math.sin(e.dryT * 30) * 1.5; // coletazos en el fondo seco
      e.y = e.home.y + e.h * 0.3;
      if (e.dryT <= 0) dryOut();
      return;
    }
    e.dryT = undefined;
    e.cool = (e.cool ?? 1 + Math.random() * 2) - dt;
    const near = Math.hypot(p.cx - e.cx, p.cy - e.cy) < d.range;
    const homeCx = e.home.x + e.w / 2;
    if (e.state === 'under' || e.state === 'peek') {
      e.x = e.home.x;
      e.y = e.home.y - (e.state === 'peek' ? 5 : 0);
      e.submerged = e.state === 'under';
      if (Math.random() < (e.state === 'peek' ? 0.4 : 0.06)) g.glowParticles.emit(e.cx + (Math.random() - 0.5) * 12, e.home.y, { vy: -18, life: 0.5, color: [0.4, 1, 0.3] });
      if (e.state === 'peek' && e.cool <= 0) { e.state = 'under'; e.cool = 0.45; e.feinted = true; return; }
      if (e.state === 'under' && e.cool <= 0 && near) {
        if (!e.feinted && Math.random() < (d.feint ?? 0)) {
          e.state = 'peek';
          e.cool = 0.6;
          g.audio.play('acid', e);
          return;
        }
        e.feinted = false;
        e.state = 'air';
        e.submerged = false;
        e.vx = e.leapVx = clamp((p.cx - e.cx) * 1.3, -150, 150);
        e.vy = -340;
        e.leftT = 0;
        g.audio.play('spit', e);
      }
      return;
    }
    // Vuelo (salto de ataque o de vuelta): ahora choca con el escenario.
    const surf = g.fluidSurfaceAt(e);
    // Fuera del ácido se va secando (cuenta todo el rato, aunque falle al volver); y si
    // cae por un hueco fuera de la sala, se pierde.
    e.outT = (e.outT ?? 0) + dt;
    if (e.y > g.world.pixelH + 32) { e.alive = false; e.dispose(); return; }
    if (e.state === 'air') {
      e.leftT += dt;
      e.vy = Math.min(380, e.vy + 760 * dt);
      // Mantiene el impulso lateral aunque roce un borde al despegar.
      if (e.leapVx !== undefined) e.vx = e.leapVx;
      g.world.move(e, dt);
      // De vuelta en el ácido (el suyo u otro): se sumerge ahí.
      if (e.vy > 0 && surf != null && e.cy > surf && e.leftT > 0.15) {
        e.state = 'under';
        e.outT = 0;
        e.home = { x: e.x, y: surf + 6 };
        e.pool = undefined;
        e.cool = 2 + Math.random() * 1.5;
        g.audio.play('acid', e);
        for (let i = 0; i < 10; i++) g.glowParticles.emit(e.cx, surf, { vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 60, life: 0.5, color: [0.4, 1, 0.3] });
        return;
      }
      if (e.onGround) { e.state = 'land'; e.landT = 0; e.cool = 0.3; e.leapVx = undefined; g.audio.play('splat', e); }
      return;
    }
    // En tierra: repta a coletazos hacia ti; al rato busca su charca y salta a ella. Si
    // tarda demasiado, se seca.
    e.landT += dt;
    if (e.outT > 9) { dryOut(); return; }
    const back = e.outT > 3.5;
    const dir = back ? Math.sign(homeCx - e.cx) || 1 : Math.sign(p.cx - e.cx) || 1;
    e.dir = dir;
    if (e.onGround) {
      e.vx *= 0.8;
      if (e.cool <= 0) {
        if (back && Math.abs(homeCx - e.cx) < 70) {
          // El salto de vuelta: en parábola hasta el centro de su charca.
          const T = 0.7;
          e.vx = e.leapVx = (homeCx - e.cx) / T;
          e.vy = -Math.max(320, (e.y - e.home.y) / T + 0.5 * 760 * T); // por encima del borde
          e.state = 'air';
          e.leftT = 0;
          g.audio.play('spit', e);
          return;
        }
        e.vx = dir * (70 + Math.random() * 30);
        e.vy = -150 - Math.random() * 60;
        e.cool = 0.45 + Math.random() * 0.25;
        if (Math.random() < 0.5) g.particles.emit(e.cx, e.y + e.h, { vx: -dir * 30, vy: -20, life: 0.5, gravity: 400, color: [0.35, 0.75, 0.15], stain: '#4a8a1a' });
      }
    }
    e.vy = Math.min(380, e.vy + 760 * dt);
    g.world.move(e, dt);
    if (e.hitWall) e.vx = 0;
  },

  // Quimera del Quilo: se arrastra hacia ti y elige entre cuatro ataques, siempre
  // anunciados: embestida (se encabrita y galopa hasta chocar con la pared: queda
  // aturdida), florecer (la cabeza de perro se abre en pétalos y escupe tentáculos;
  // abierta recibe el doble), latigazo (un látigo barre el suelo: salta) y, en la
  // segunda fase, el salto que aplasta y levanta ondas. A media vida se le desprende
  // la cabeza humana, que corre sola sobre sus dedos.
  bossChimera(e, dt, g) {
    const d = e.def, p = g.player;
    tick(e, dt);
    e.state ??= 'stalk';
    if (e.cool > 1.6) e.cool = 1.6;
    const enraged = e.hp < d.hp / 2;
    const toward = Math.sign(p.cx - e.cx) || e.dir;
    e.exposed = false;
    if (enraged && !e.split) {
      e.split = true;
      g.spawnMinion('cabeza', e.cx - 20, e.y - 10);
      g.audio.play('stalkerLunge', e);
      g.shake = Math.max(g.shake, 5);
      g.say('La cabeza humana se le desprende... y echa a correr sobre sus dedos.', 3);
      e.headCool = 10;
    }
    if (enraged) {
      e.headCool -= dt;
      if (e.headCool <= 0) {
        e.headCool = 11;
        if (g.room.enemies.filter((m) => m.minion && m.alive).length < 2) g.spawnMinion('cabeza', e.cx, e.y);
      }
    }
    const go = (state, timer) => { e.state = state; e.timer = timer; };
    switch (e.state) {
      case 'stalk': {
        e.dir = toward;
        groundWalk(e, g, dt, d.speed * (enraged ? 1.4 : 1), true);
        if (e.cool <= 0 && e.onGround) {
          const far = Math.abs(p.cx - e.cx) > 110;
          const moves = enraged ? ['rear', 'bloomWind', 'lashWind', 'leapWind'] : ['rear', 'bloomWind', 'lashWind'];
          const pick = far && Math.random() < 0.55 ? 'rear' : moves[Math.floor(Math.random() * moves.length)];
          e.vx = 0;
          if (pick === 'rear') { go('rear', 0.75); g.audio.play(d.sounds.windup, e); }
          else if (pick === 'bloomWind') { go('bloomWind', 0.8); g.audio.play(d.sounds.bloom, e); }
          else if (pick === 'lashWind') { go('lashWind', 0.65); g.audio.play('charge', e); }
          else { go('leapWind', 0.45); g.audio.play(d.sounds.windup, e); }
        }
        break;
      }
      case 'rear':
        e.vx = 0; fall(e, g, dt);
        e.shakeX = Math.random() < 0.5 ? -1 : 1;
        if (e.timer <= 0) { e.dir = toward; go('charge', 3); g.audio.play(d.sounds.lunge, e); }
        break;
      case 'charge':
        e.shakeX = 0;
        e.vx = e.dir * d.chargeSpeed * (enraged ? 1.15 : 1);
        fall(e, g, dt);
        if (Math.random() < 0.5) g.particles.emit(e.cx - e.dir * 20, e.y + e.h, { vx: -e.dir * 40, vy: -30, life: 0.3, color: [0.4, 0.3, 0.2] });
        if (e.hitWall || e.timer <= 0) {
          go('stunned', enraged ? 0.9 : 1.3);
          g.shake = Math.max(g.shake, 6);
          g.audio.play('crunch', e);
          g.audio.play(d.sounds.hurt, e);
        }
        break;
      case 'stunned':
        e.vx = 0; fall(e, g, dt);
        e.exposed = true;
        if (e.timer <= 0) { go('stalk', 0); e.cool = enraged ? 0.9 : 1.4; }
        break;
      case 'bloomWind':
        e.vx = 0; fall(e, g, dt);
        e.dir = toward;
        e.bloom = Math.min(1, (e.bloom ?? 0) + dt * 2);
        e.exposed = true;
        if (e.timer <= 0) {
          const n = enraged ? 9 : 7, hx = e.cx + e.dir * 36, hy = e.y + e.h - 34;
          const a0 = Math.atan2(p.cy - hy, p.cx - hx);
          for (let i = 0; i < n; i++) {
            const a = a0 + (i - (n - 1) / 2) * 0.17;
            g.spawnProjectile({
              x: hx - 3, y: hy - 3, w: 6, h: 6, vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, gravity: 70, life: 2.2,
              damage: 7, kind: 'tendril', owner: 'enemy', color: '#e86070', glow: [1, 0.25, 0.3],
            });
          }
          g.audio.play(d.sounds.attack, e);
          go('bloomOpen', 0.7);
        }
        break;
      case 'bloomOpen':
        e.vx = 0; fall(e, g, dt);
        e.exposed = true;
        if (e.timer <= 0) { go('stalk', 0); e.cool = enraged ? 1 : 1.6; }
        break;
      case 'lashWind':
        e.vx = 0; fall(e, g, dt);
        e.dir = toward;
        if (e.timer <= 0) { go('lash', 0.35); g.audio.play('whip', e); }
        break;
      case 'lash': {
        e.vx = 0; fall(e, g, dt);
        // El látigo barre el suelo por delante: hay que estar en el aire.
        const reach = 150, x = e.dir > 0 ? e.cx : e.cx - reach;
        hitZone(g, e, x, e.y + e.h - 12, reach, 12, 12);
        if (e.timer <= 0) { go('stalk', 0); e.cool = enraged ? 0.8 : 1.3; }
        break;
      }
      case 'leapWind':
        e.vx = 0; fall(e, g, dt);
        e.shakeX = Math.random() < 0.5 ? -1 : 1;
        if (e.timer <= 0) {
          e.shakeX = 0;
          e.vx = clamp((p.cx - e.cx) * 1.4, -230, 230);
          e.vy = -420;
          e.dir = toward;
          go('leap', 3);
          g.audio.play(d.sounds.lunge, e);
        }
        break;
      case 'leap':
        e.vy = Math.min(420, e.vy + GRAVITY * dt);
        g.world.move(e, dt);
        if (e.hitWall) e.vx = 0;
        if (e.onGround && e.vy >= 0) {
          // Al caer, dos ondas corren por el suelo en ambos sentidos.
          for (const s of [-1, 1]) shockwave(g, e.cx, e.y + e.h, s, '#e86070', [1, 0.3, 0.35]);
          g.shake = Math.max(g.shake, 7);
          g.audio.play('crunch', e);
          go('stunned', 0.7);
        }
        break;
    }
    e.bloom = Math.max(0, (e.bloom ?? 0) - (e.state.startsWith('bloom') ? 0 : dt * 2));
  },

  // Coro de Carne: se mueve a tirones (lento y, de pronto, acelera), sacudido por
  // espasmos; salta como un saltamontes y vuelve a su sitio. Cada cabeza tiene su
  // ataque y queda abierta (vulnerable) mientras lo usa: la grande estira el cuello y
  // muerde si estás a su alcance, la de colmillos vomita anguilas, la de antenas
  // escupe un chorro de ácido casi continuo y la del hombre canta anillos. Herida,
  // además electrifica el suelo. El resto del cuerpo rebota.
  bossChoir(e, dt, g) {
    const d = e.def, p = g.player;
    tick(e, dt);
    e.state ??= 'stalk';
    e.home ??= e.x;
    if (e.cool > 1.6) e.cool = 1.6;
    const enraged = e.hp < d.hp / 2;
    const go = (state, timer) => { e.state = state; e.timer = timer; };
    const toward = Math.sign(p.cx - e.cx) || e.dir;
    const dist = Math.abs(p.cx - e.cx);
    const spots = e.spots();
    const floorY = e.y + e.h;
    // Espasmos musculares: tirones bruscos que no avisan.
    e.spasm = Math.max(0, (e.spasm ?? 0) - dt);
    if (Math.random() < dt * (enraged ? 1.2 : 0.6)) { e.spasm = 0.25; g.audio.play('crunch', e); }
    e.shakeX = e.spasm > 0 ? (Math.random() < 0.5 ? -2 : 2) : 0;
    // Cabeza que ataca: 0 ácido, 1 mordisco, 2 anguilas, 3 canto.
    const attack = (head, state, timer, sound) => { e.attackHead = head; go(state, timer); if (sound) g.audio.play(sound, e); };
    const done = (cool) => { e.attackHead = -1; e.biteK = 0; go('stalk', 0); e.cool = enraged ? cool * 0.7 : cool; };

    switch (e.state) {
      case 'stalk': {
        e.attackHead = -1;
        e.dir = toward;
        // A tirones: se arrastra despacio y cada poco arranca de golpe.
        e.lurch = (e.lurch ?? 1) - dt;
        if (e.lurch <= 0) { e.lurch = (enraged ? 1 : 1.5) + Math.random() * 0.6; e.burst = 0.28; g.audio.play(d.sounds.lunge, e); }
        e.burst = Math.max(0, (e.burst ?? 0) - dt);
        const speed = e.burst > 0 ? d.burstSpeed : d.speed;
        groundWalk(e, g, dt, dist < 100 ? 0 : speed * (enraged ? 1.3 : 1), true);
        if (e.cool <= 0 && e.onGround) {
          e.vx = 0;
          const moves = [];
          if (dist < 170) moves.push('bite', 'bite');
          moves.push('acid', 'eels', 'sing', 'leap');
          if (Math.abs(e.x - e.home) > 120) moves.push('home', 'home');
          if (enraged) moves.push('shock', 'acid');
          const pick = moves[Math.floor(Math.random() * moves.length)];
          if (pick === 'bite') { attack(1, 'biteWind', 0.55, d.sounds.windup); e.biteK = 0; }
          else if (pick === 'acid') attack(0, 'acidWind', 0.5, d.sounds.windup);
          else if (pick === 'eels') attack(2, 'eelWind', 0.6, d.sounds.windup);
          else if (pick === 'sing') attack(3, 'singWind', 0.5, d.sounds.windup);
          else if (pick === 'leap' || pick === 'home') { e.leapTo = pick === 'home' ? e.home + e.w / 2 : p.cx; go('leapWind', 0.5); g.audio.play('charge', e); }
          else { go('shockWind', 1.3); g.audio.play(d.sounds.summon, e); g.say('Todas las bocas gritan a la vez: el suelo se carga. ¡Arriba!', 2); }
        }
        break;
      }
      // --- Mordisco: el cuello se recoge, sale disparado hacia ti y se queda tendido.
      case 'biteWind':
        e.vx = 0; fall(e, g, dt);
        e.dir = toward;
        if (e.timer <= 0) {
          const [ox, oy] = e.creature.origin(e), W = e.canvas.width;
          const tx = p.cx - ox, ty = p.cy - oy;
          e.biteLocal = { x: e.dir < 0 ? W - 1 - tx : tx, y: ty };
          // Alcance limitado: no pasa de la longitud del cuello.
          const bx = 206, by = 74, L = Math.hypot(e.biteLocal.x - bx, e.biteLocal.y - by), max = 135;
          if (L > max) { e.biteLocal.x = bx + (e.biteLocal.x - bx) * max / L; e.biteLocal.y = by + (e.biteLocal.y - by) * max / L; }
          go('bite', 0.2);
          g.audio.play(d.sounds.attack, e);
        }
        break;
      case 'bite': {
        e.vx = 0; fall(e, g, dt);
        e.biteK = Math.min(1, (e.biteK ?? 0) + dt / 0.16);
        const h = spots[1];
        if (h && Math.hypot(h.x - p.cx, h.y - p.cy) < 16) g.hurtPlayer(16, e.cx, d.name);
        if (e.timer <= 0) go('biteHold', enraged ? 0.55 : 0.8);
        break;
      }
      case 'biteHold':
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) go('biteBack', 0.3);
        break;
      case 'biteBack':
        e.vx = 0; fall(e, g, dt);
        e.biteK = Math.max(0, e.biteK - dt / 0.3);
        if (e.timer <= 0) done(1.1);
        break;
      // --- Chorro de ácido: un flujo casi continuo que barre hacia ti.
      case 'acidWind':
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) { go('acid', enraged ? 2.6 : 2); e.drip = 0; g.audio.play(d.sounds.vomit, e); }
        break;
      case 'acid': {
        e.vx = 0; fall(e, g, dt);
        e.drip -= dt;
        const h = spots[0];
        if (h && e.drip <= 0) {
          e.drip = 0.05;
          const a = Math.atan2(p.cy - h.y, p.cx - h.x) + Math.sin(e.t * 4) * 0.35 - 0.25;
          g.spawnProjectile({
            x: h.x - 2, y: h.y, w: 4, h: 4, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, gravity: 280, life: 1.6,
            damage: 4, kind: 'acidStream', owner: 'enemy', color: '#9be06a', glow: [0.4, 1, 0.3],
          });
          if (Math.random() < 0.25) g.audio.play('sizzle', h);
        }
        if (e.timer <= 0) done(1.2);
        break;
      }
      // --- Anguilas: la cabeza de colmillos vomita crías que reptan hacia ti.
      case 'eelWind':
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) {
          const h = spots[2] ?? { x: e.cx, y: e.cy };
          const n = enraged ? 3 : 2;
          for (let k = 0; k < n; k++) {
            if (g.room.enemies.filter((m) => m.minion && m.alive).length >= 5) break;
            g.spawnMinion('larva', h.x, h.y);
            const m = g.room.enemies[g.room.enemies.length - 1];
            m.vx = toward * (80 + k * 40); m.vy = -150 - k * 30; m.state = 'pounce';
          }
          g.audio.play(d.sounds.vomit, e);
          go('eelOpen', 0.7);
        }
        break;
      case 'eelOpen':
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) done(1.2);
        break;
      // --- Canto: anillos de sonido con un hueco, desde la cabeza del hombre.
      case 'singWind':
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) { go('sing', 2.4); e.ring = 0; g.audio.play(d.sounds.sing, e); }
        break;
      case 'sing': {
        e.vx = 0; fall(e, g, dt);
        e.ring -= dt;
        const f = spots[3] ?? { x: e.cx, y: e.cy };
        if (e.ring <= 0) {
          e.ring = enraged ? 0.5 : 0.65;
          const n = enraged ? 14 : 11, rot = Math.random() * Math.PI * 2;
          for (let i = 0; i < n; i++) {
            if (i % (enraged ? 7 : 5) === 0) continue;
            const a = rot + (i / n) * Math.PI * 2;
            g.spawnProjectile({
              x: f.x - 3, y: f.y - 3, w: 6, h: 6, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 3.4,
              damage: 6, kind: 'note', owner: 'enemy', color: i % 2 ? '#80d0ff' : '#ff60c0', glow: i % 2 ? [0.4, 0.8, 1] : [1, 0.35, 0.8],
            });
          }
          g.audio.play(d.sounds.sing, f);
        }
        if (e.timer <= 0) done(1.2);
        break;
      }
      // --- Salto de saltamontes: se agacha, salta (hacia ti o de vuelta a su sitio) y
      // al caer levanta ondas.
      case 'leapWind':
        e.vx = 0; fall(e, g, dt);
        e.shakeX = Math.random() < 0.5 ? -1 : 1;
        if (e.timer <= 0) {
          e.vx = clamp((e.leapTo - e.cx) * 1.25, -260, 260);
          e.vy = -470;
          e.dir = Math.sign(e.vx) || e.dir;
          go('leap', 3);
          g.audio.play(d.sounds.lunge, e);
        }
        break;
      case 'leap':
        e.vy = Math.min(480, e.vy + GRAVITY * dt);
        g.world.move(e, dt);
        if (e.hitWall) e.vx = 0;
        if (e.onGround && e.vy >= 0) {
          for (const s of [-1, 1]) shockwave(g, e.cx, floorY, s, '#c49a78', [1, 0.5, 0.3]);
          g.shake = Math.max(g.shake, 7);
          g.audio.play('crunch', e);
          e.spasm = 0.4;
          go('land', 0.5);
        }
        break;
      case 'land':
        e.vx = 0; fall(e, g, dt);
        if (e.timer <= 0) done(0.9);
        break;
      // --- Suelo electrificado (segunda fase).
      case 'shockWind':
        e.vx = 0; fall(e, g, dt);
        if (Math.random() < 0.9) g.glowParticles.emit(Math.random() * g.world.pixelW, floorY, { vy: -40, life: 0.3, color: [0.5, 0.8, 1] });
        if (e.timer <= 0) { go('shock', 0.7); g.audio.play(d.sounds.shock, e); g.shake = Math.max(g.shake, 5); }
        break;
      case 'shock':
        e.vx = 0; fall(e, g, dt);
        hitZone(g, e, 0, floorY - 6, g.world.pixelW, 6, 14);
        for (let i = 0; i < 4; i++) g.glowParticles.emit(Math.random() * g.world.pixelW, floorY - Math.random() * 4, { vy: -60 - Math.random() * 60, vx: (Math.random() - 0.5) * 60, life: 0.25, color: [0.6, 0.9, 1] });
        if (e.timer <= 0) done(1.2);
        break;
    }
    e.exposed = e.attackHead >= 0 && !e.state.endsWith('Wind');
  },

  // Ciervo acorazado: centauro escarabajo, lento y casi todo coraza (las balas le
  // rebotan). Camina erguido hacia ti con paso pesado. A media distancia se encabrita
  // abriendo las mandíbulas y embiste; si choca con una pared se queda clavado más
  // rato. Tras la embestida jadea con los élitros abiertos: la carne del abdomen queda
  // al aire y ahí sí le hacen daño. Pegado a ti, abre las mandíbulas y las cierra de
  // golpe. El Tendón le arranca la coraza: entonces es más rápido y más rabioso.
  centaur(e, dt, g) {
    const d = e.def, s = senses(e, g, 50);
    e.state ??= 'walk';
    tick(e, dt);
    const rage = e.armored ? 1 : 1.4;
    e.contactDamage = e.state === 'gore' ? d.goreDamage : d.contactDamage;
    const front = (w, h, dmg) => hitZone(g, e, e.dir > 0 ? e.x + e.w - 4 : e.x - w + 4, e.y + 4, w, h, dmg);
    if (e.state === 'walk') {
      if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
      groundWalk(e, g, dt, speedMods(e, g, (s.sees ? d.chaseSpeed : d.speed) * rage), s.sees);
      if (s.sees && e.cool <= 0 && Math.abs(s.dy) < 40) {
        if (s.dist < d.pinchRange) { e.state = 'pinchWind'; e.timer = 0.35 / rage; e.vx = 0; g.audio.play('click', e); }
        else if (s.dist < d.goreRange) { e.state = 'rear'; e.timer = 0.8 / rage; e.vx = 0; g.audio.play(d.sounds?.attack ?? 'growl', e); }
      }
    } else if (e.state === 'rear') {
      e.vx = 0; fall(e, g, dt);
      e.dir = Math.sign(s.dx) || e.dir;
      if (e.timer <= 0) { e.state = 'gore'; e.timer = d.goreTime; e.hitWall = 0; g.audio.play('dash', e); g.shake = Math.max(g.shake, 2); }
    } else if (e.state === 'gore') {
      e.vx = e.dir * d.goreSpeed * rage;
      e.vy = Math.min(380, e.vy + GRAVITY * dt);
      g.world.move(e, dt);
      front(14, e.h - 8, d.goreDamage);
      if (Math.random() < 0.5) g.particles.emit(e.cx - e.dir * 8, e.y + e.h, { vx: -e.vx * 0.2, vy: -25, life: 0.35, color: [0.45, 0.42, 0.4] });
      if (e.hitWall) {
        // Clava las mandíbulas en la pared: se queda atascado.
        g.shake = Math.max(g.shake, 4);
        g.audio.play('crunch', e);
        e.state = 'dazed'; e.timer = d.stuck; e.vx = 0;
      } else if (e.timer <= 0) { e.state = 'dazed'; e.timer = d.dazed; e.vx = 0; }
    } else if (e.state === 'pinchWind') {
      e.vx = 0; fall(e, g, dt);
      if (e.timer <= 0) { e.state = 'pinch'; e.timer = 0.22; g.audio.play('crunch', e); front(18, 18, d.pinchDamage); }
    } else if (e.state === 'pinch') {
      e.vx = 0; fall(e, g, dt);
      if (e.timer <= 0) { e.state = 'walk'; e.cool = d.attackCool / rage; }
    } else {
      // Aturdido: jadea con los élitros abiertos.
      e.vx *= 0.85; fall(e, g, dt);
      if (Math.random() < 0.08) g.particles.emit(e.cx, e.y + 10, { vx: (Math.random() - 0.5) * 20, vy: -15, life: 0.5, color: [0.6, 0.55, 0.5] });
      if (e.timer <= 0) { e.state = 'walk'; e.cool = d.attackCool / rage; }
    }
  },

  // Ciervo Acorazado: trepa por cualquier superficie (suelo, paredes y techo) y desde
  // cualquiera se encabrita y se lanza en línea recta hacia ti; al chocar se agarra a lo
  // que toque (si se clava, se queda aturdido con los élitros abiertos). Pegado a ti,
  // cierra las mandíbulas de golpe.
  //   e.n  normal hacia la superficie a la que está agarrado ({x,y}: suelo 0,1; techo 0,-1;
  //        pared a la izquierda -1,0; a la derecha 1,0). Sin superficie, cae.
  //   e.td sentido de la marcha a lo largo de ella (+1/-1).
  stagCrawl(e, dt, g) {
    const d = e.def, p = g.player, w = g.world;
    e.state ??= 'walk';
    e.n ??= { x: 0, y: 1 };
    e.td ??= e.dir || 1;
    tick(e, dt);
    const rage = e.armored ? 1 : 1.4;
    const fwd = () => ({ x: e.td * e.n.y, y: -e.td * e.n.x });            // avance a lo largo de la superficie
    const solid = (dx, dy) => w.rectSolid(Math.round(e.x) + dx, Math.round(e.y) + dy, e.w, e.h);
    const dx = p.cx - e.cx, dy = p.cy - e.cy, dist = Math.hypot(dx, dy);
    const sees = dist < d.sight && w.lineOfSight(e.cx, e.cy, p.cx, p.cy);
    e.contactDamage = e.state === 'gore' ? d.goreDamage : d.contactDamage;
    // Agarrarse a lo que haya tocado (tras caer o embestir).
    const grab = () => {
      if (e.onGround) e.n = { x: 0, y: 1 };
      else if (e.hitCeiling) e.n = { x: 0, y: -1 };
      else if (e.hitWall) e.n = { x: e.hitWall, y: 0 };
      else return false;
      e.x = Math.round(e.x); e.y = Math.round(e.y); e.vx = e.vy = 0;
      return true;
    };
    // Volando (embestida o caída): recto, con algo de gravedad.
    if (e.state === 'gore' || e.state === 'fall') {
      e.vy = Math.min(380, e.vy + GRAVITY * (e.state === 'gore' ? 0.35 : 1) * dt);
      w.move(e, dt);
      if (e.state === 'gore') {
        hitZone(g, e, e.x - 3, e.y - 3, e.w + 6, e.h + 6, d.goreDamage);
        if (Math.random() < 0.5) g.particles.emit(e.cx, e.cy, { vx: -e.vx * 0.15, vy: -e.vy * 0.15, life: 0.3, color: [0.6, 0.58, 0.62] });
      }
      if (grab()) {
        const hard = e.state === 'gore' && (e.hitWall || e.hitCeiling);
        if (hard) { g.shake = Math.max(g.shake, 3); g.audio.play('crunch', e); }
        e.state = e.state === 'gore' ? 'dazed' : 'walk';
        e.timer = hard ? d.stuck : d.dazed;
      } else if (e.state === 'gore' && e.timer <= 0) e.state = 'fall';
      return;
    }
    // Agarrado: ¿sigue habiendo superficie? (si la han quitado, cae).
    if (!solid(e.n.x, e.n.y)) {
      e.state = 'fall'; e.vx = 0; e.vy = 0;
      return;
    }
    if (e.state === 'walk') {
      // Hacia ti a lo largo de la superficie (cambia de sentido con calma, sin temblar).
      e.turnT = (e.turnT ?? 0) - dt;
      const f = fwd();
      if (sees && e.turnT <= 0 && f.x * dx + f.y * dy < -4) { e.td = -e.td; e.turnT = 0.5; }
      if (!sees && e.turnT <= 0 && Math.random() < dt * 0.06) { e.td = -e.td; e.turnT = 3; }
      // Avanza píxel a píxel: en una esquina hacia dentro sube por la pared; en un borde,
      // lo rodea y sigue por la otra cara.
      e.acc = (e.acc ?? 0) + speedMods(e, g, (sees ? d.chaseSpeed : d.speed) * rage) * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        const f1 = fwd();
        if (solid(f1.x, f1.y)) { e.n = { x: f1.x, y: f1.y }; continue; }          // esquina hacia dentro
        e.x = Math.round(e.x) + f1.x; e.y = Math.round(e.y) + f1.y;
        if (!solid(e.n.x, e.n.y)) {                                            // borde: lo rodea
          e.x += e.n.x; e.y += e.n.y;
          e.n = { x: -f1.x, y: -f1.y };
          if (!solid(e.n.x, e.n.y)) { e.state = 'fall'; return; }
        }
      }
      if (sees && e.cool <= 0) {
        if (dist < d.pinchRange) { e.state = 'pinchWind'; e.timer = 0.3 / rage; g.audio.play('click', e); }
        else if (dist < d.goreRange) { e.state = 'rear'; e.timer = 0.55 / rage; g.audio.play(d.sounds?.attack ?? 'growl', e); }
      }
    } else if (e.state === 'rear') {
      // Se encabrita y apunta; al acabar, se suelta y se lanza recto hacia ti.
      if (e.timer <= 0) {
        const a = Math.atan2(dy, dx), sp = d.goreSpeed * rage;
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp - GRAVITY * 0.35 * (dist / sp) * 0.5; // apunta algo alto: la caída lo baja
        e.x += -e.n.x; e.y += -e.n.y;                                          // se despega
        e.state = 'gore'; e.timer = d.goreTime; e.hitWall = 0;
        g.audio.play('dash', e); g.shake = Math.max(g.shake, 2);
      }
    } else if (e.state === 'pinchWind') {
      if (e.timer <= 0) {
        e.state = 'pinch'; e.timer = 0.22; g.audio.play('crunch', e);
        hitZone(g, e, e.x - 8, e.y - 8, e.w + 16, e.h + 16, d.pinchDamage);
      }
    } else if (e.state === 'pinch') {
      if (e.timer <= 0) { e.state = 'walk'; e.cool = d.attackCool / rage; }
    } else {
      // Aturdido: jadea con los élitros abiertos.
      if (Math.random() < 0.08) g.particles.emit(e.cx, e.cy, { vx: (Math.random() - 0.5) * 20, vy: -15, life: 0.5, color: [0.6, 0.55, 0.5] });
      if (e.timer <= 0) { e.state = 'walk'; e.cool = d.attackCool / rage; }
    }
    // Para el dibujo: hacia dónde mira (a lo largo de la superficie) y el giro.
    e.dir = e.td;
    if (e.state === 'walk') e.vx = 20;                                          // (anda: para la animación)
    else if (e.state !== 'gore' && e.state !== 'fall') e.vx = 0;
    e.surfRot = Math.atan2(e.n.x, e.n.y);                                         // 0 suelo, π techo, ±π/2 paredes
  },

  // Escarabajo rinoceronte (entities/RhinoBeetle.js): conoce la quitina, y su coraza
  // frontal lo para todo (def.frontArmor: de frente rebota, por la espalda hiere más).
  // Camina pesado; al verte escarba el suelo, baja el cuerno y carga. Si te alcanza,
  // te lanza por los aires; si choca con una pared se queda clavado (aturdido, todo le
  // hiere); si falla, derrapa y tarda en girarse: es cuando se le ve la espalda.
  rhino(e, dt, g) {
    const d = e.def, s = senses(e, g, 40), p = g.player;
    e.state ??= 'walk';
    tick(e, dt);
    e.contactDamage = e.state === 'charge' ? 0 : d.contactDamage; // al cargar hiere el cuerno
    if (e.state === 'walk') {
      if (s.sees) e.dir = Math.sign(s.dx) || e.dir;
      groundWalk(e, g, dt, speedMods(e, g, s.sees ? d.chaseSpeed : d.speed), s.sees);
      if (s.sees && e.cool <= 0 && Math.abs(s.dy) < 30 && e.onGround) {
        e.state = 'paw'; e.timer = d.pawTime; e.vx = 0;
        g.audio.play(d.sounds?.attack ?? 'growl', e);
      }
    } else if (e.state === 'paw') {
      e.vx = 0; fall(e, g, dt);
      e.dir = Math.sign(s.dx) || e.dir;
      if (Math.random() < 0.4) g.particles.emit(e.cx - e.dir * 10, e.y + e.h, { vx: -e.dir * 40, vy: -30, life: 0.4, color: [0.7, 0.6, 0.48] });
      if (e.timer <= 0) { e.state = 'charge'; e.timer = d.chargeTime; e.hitWall = 0; g.audio.play('dash', e); }
    } else if (e.state === 'charge') {
      e.vx = e.dir * d.chargeSpeed;
      e.vy = Math.min(380, e.vy + GRAVITY * dt);
      g.world.move(e, dt);
      if (Math.random() < 0.5) g.particles.emit(e.cx - e.dir * 12, e.y + e.h, { vx: -e.vx * 0.2, vy: -20, life: 0.3, color: [0.65, 0.55, 0.42] });
      // El cuerno: si te alcanza, te lanza por los aires.
      const hx = e.dir > 0 ? e.x + e.w - 2 : e.x - 12;
      if (p.invuln <= 0 && p.x < hx + 14 && p.x + p.w > hx && p.y < e.y + e.h && p.y + p.h > e.y - 6) {
        g.hurtPlayer(d.hornDamage, e.cx, d.name);
        p.vy = -300; p.vx = e.dir * 160;
        e.state = 'toss'; e.timer = 0.45; e.vx = 0;
        g.audio.play('crunch', e);
      } else if (e.hitWall) {
        g.shake = Math.max(g.shake, 4);
        g.audio.play('crunch', e);
        e.state = 'stunned'; e.timer = d.stunned; e.vx = 0;
      } else if (e.timer <= 0) { e.state = 'brake'; e.timer = d.brake; }
    } else if (e.state === 'brake') {
      e.vx *= 0.9; fall(e, g, dt);
      if (Math.random() < 0.5) g.particles.emit(e.cx + e.dir * 10, e.y + e.h, { vx: e.vx * 0.3, vy: -25, life: 0.35, color: [0.65, 0.55, 0.42] });
      if (e.timer <= 0) { e.state = 'turn'; e.timer = d.turnTime; }
    } else if (e.state === 'turn' || e.state === 'toss' || e.state === 'stunned') {
      e.vx = 0; fall(e, g, dt);
      if (e.timer <= 0) { e.state = 'walk'; e.cool = d.attackCool; e.dir = Math.sign(s.dx) || e.dir; }
    }
  },

  // Glándula Gástrica: cuelga de sus tubos y nunca está quieta. Sube y baja
  // respirando, se balancea como un péndulo y te sigue despacio. Ataques, por turnos:
  //   spit   se contrae (las vesículas se hinchan), abre la boca y escupe grumos de
  //          ácido en abanico; el retroceso la sacude hacia arriba
  //   spray  (enfurecida) un chorro de jugo digestivo que barre el suelo hacia ti
  //   dip    si estás debajo: se encoge hacia el techo, se descuelga de golpe estirando
  //          los tubos y latiguea con los cilios antes de volver a subir
  // Cada cierto tiempo se exprime e inunda la arena. Solo es vulnerable con la boca
  // abierta (al cargar, al rociar, colgada abajo y al inundar).
  // Sapo Partero (entities/Toad.js). Ciclo:
  //   sit     se arrastra hacia ti, pesado
  //   crouch  se agazapa y tiembla: va a saltar (¡apártate!)
  //   leap    salta con las patas traseras hacia donde estás; su topetazo duele
  //   land    cae, salpica ácido y queda aturdido con la panza al aire (más daño)
  //   brood   le revientan las celdas de la espalda y brotan renacuajos
  //   bite    pegado a ti: echa la cabeza atrás y la dispara con las fauces abiertas
  // Enfurecido (media vida) se agazapa menos, salta más a menudo y cría más.
  bossToad(e, dt, g) {
    const d = e.def, p = g.player;
    const enraged = e.hp < d.hp / 2;
    e.state ??= 'sit';
    e.timer = (e.timer ?? 1.2) - dt;
    e.broodCool = (e.broodCool ?? 7) - dt;
    // Fase según lo cerca que está de morir: cada fase, más crías (y más seguidas).
    const phase = e.hp > d.hp * 0.66 ? 0 : e.hp > d.hp * 0.33 ? 1 : 2;
    const BROOD = [{ n: 2, max: 3, cool: 9 }, { n: 3, max: 5, cool: 7 }, { n: 5, max: 8, cool: 5 }][phase];
    const dx = p.cx - e.cx;
    e.exposed = e.state === 'land' || e.state === 'scalded';
    e.biteCool = (e.biteCool ?? 1) - dt;
    e.weakT = Math.max(0, (e.weakT ?? 0) - dt);
    e.bloody = Math.max(0, (e.bloody ?? 0) - dt);
    e.scaldCool = Math.max(0, (e.scaldCool ?? 0) - dt);
    // Debilitado: la piel humea y gotea (aviso de que ahora sí le duele).
    if (e.weakT > 0 && Math.random() < 0.5) g.glowParticles.emit(e.x + Math.random() * e.w, e.y + Math.random() * 10, { vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 0.7, color: [0.75, 1, 0.55] });
    // Su charca: cubetas de bilis (manual). Si le vacías la suya, se queja y se muda a una
    // llena; con las tres vacías (la bilis en sus vejigas) se resiente y queda debilitado un
    // rato, sin dejar de pelear; luego las vejigas le devuelven la bilis y vuelta a empezar.
    const basins = g.room.hazards.filter((h) => h.surfaceY !== undefined && h.def?.manual && !h.def.ceiling);
    const fullB = (b) => b.target > 0.5;
    const inB = basins.find((b) => e.cx >= b.x0 && e.cx <= b.x0 + b.w);
    if (inB && !fullB(inB) && e.dryOf !== inB && !(e.weakT > 0) && e.state !== 'scalded') {
      e.dryOf = inB; e.flash = 0.15; g.shake = Math.max(g.shake, 4);
      g.audio.play(d.sounds?.hurt ?? 'toadHurt', e);
    }
    if (inB && fullB(inB)) e.dryOf = null;
    e.inFull = !basins.length || (!!inB && fullB(inB) && inB.level > 0.5); // en su bilis: más duro y puede criar
    let dryNow = false;
    if (basins.length && !e.drained && basins.every((b) => !fullB(b) && b.level < 0.1)) { e.drained = true; dryNow = true; }
    if (e.drained && e.wasWeak && e.weakT <= 0) {
      e.drained = false;                                               // las vejigas se exprimen
      for (const b of basins) b.target = 1;
      g.audio.play('glandFlood', e);
    }
    e.wasWeak = e.weakT > 0;
    e.goalX = null;
    if (!(e.weakT > 0) && basins.some(fullB) && (!inB || !fullB(inB))) {
      const best = basins.filter(fullB).sort((a, b) => Math.abs(a.x0 + a.w / 2 - e.cx) - Math.abs(b.x0 + b.w / 2 - e.cx))[0];
      e.goalX = best.x0 + best.w / 2;
    }
    // Sin una gota en su charca: convulsiona, le revientan las celdas y queda resentido.
    if (dryNow) {
      e.state = 'scalded'; e.timer = d.scaldStun ?? 2.6; e.vx = 0; e.biteK = 0;
      toadPopEggs(e, g, toadPickEggs(e, 5, g));
      e.popPending = [];
      e.weakT = d.weakTime ?? 12;
      e.weakFloor = Math.max(0, e.hp - d.hp * (d.weakShare ?? 0.36)); // no cae de un solo golpe de suerte
      e.scaldCool = 3;
      e.broodCool = Math.max(e.broodCool, 9);
      e.flash = 0.2;
      g.shake = Math.max(g.shake, 8);
      g.audio.play(d.sounds?.hurt ?? 'toadHurt', e);
      for (let i = 0; i < 26; i++) g.particles.emit(e.cx + (Math.random() - 0.5) * e.w, e.y + 2, { vx: (Math.random() - 0.5) * 140, vy: -80 - Math.random() * 120, life: 0.8, gravity: 500, color: Math.random() < 0.5 ? [0.85, 0.8, 0.6] : [0.45, 0.6, 0.2], stain: '#4a6a1a' });
    }
    // Le pegas: no se queda quieto. Aturdido tras un salto, se recompone enseguida; a los
    // dos golpes seguidos, si te tiene a tiro, te muerde sin esperar a su ritmo.
    e.hitT = Math.max(0, (e.hitT ?? 0) - dt);
    if (e.hitT <= 0) e.hits = 0;
    if (e.provoked) {
      e.provoked = false;
      if (e.state === 'land') e.timer = Math.min(e.timer, 0.15);
      if ((e.hits ?? 0) >= 2 && ['sit', 'land'].includes(e.state) && Math.abs(dx) < 80 && Math.abs(p.cy - e.cy) < 40) {
        e.hits = 0;
        e.dir = Math.sign(dx) || e.dir;
        e.state = 'biteWind'; e.timer = e.biteWT = 0.3; e.vx = 0; e.biteK = 0;
        g.audio.play('eelGurgle', e);
      }
    }
    // Le disparas desde lejos: no se queda a recibir, salta hacia ti (a veces dos saltos).
    if (e.shotAt) {
      e.shotAt = false;
      if (['sit', 'land'].includes(e.state) && e.onGround && Math.abs(dx) > 110) {
        e.state = 'crouch'; e.timer = enraged ? 0.2 : 0.3; e.vx = 0;
        e.chain = Math.abs(dx) > 260 || enraged ? 1 : 0;
        e.farLeap = 1 + e.chain;                                         // saltos de acercamiento: largos y bajos
        g.audio.play('eelGurgle', e);
      }
    }
    if (e.state === 'scalded') {
      // Se retuerce panza arriba, humeando: es el momento de pegarle.
      e.vx = 0;
      e.shakeX = Math.random() < 0.5 ? -1 : 1;
      if (e.timer <= 0) { e.state = 'sit'; e.timer = 0.8; e.shakeX = 0; }
    } else if (e.state === 'sit') {
      e.dir = Math.sign(dx) || e.dir;
      e.vx = e.onGround ? e.dir * 18 * (0.4 + 0.6 * Math.max(0, Math.sin(e.t * 4))) : e.vx;
      const minions = g.room.enemies.filter((m) => m.minion && m.alive).length;
      // Pegado a ti: el bocado (la cabeza sale disparada con las fauces abiertas).
      if (Math.abs(dx) < 62 && Math.abs(p.cy - e.cy) < 34 && e.biteCool <= 0 && e.onGround) {
        e.state = 'biteWind'; e.timer = e.biteWT = enraged ? 0.4 : 0.55; e.vx = 0; e.biteK = 0;
        g.audio.play('eelGurgle', e);
      } else if (e.broodCool <= 0 && minions < BROOD.max && e.inFull) { e.state = 'brood'; e.timer = 0.9; e.vx = 0; e.popPending = toadPickEggs(e, BROOD.n, g); g.audio.play(d.sounds.summon, e); } // solo cría dentro de una cubeta llena
      // Su cubeta está seca: en sus pausas, a veces salta a una llena (sigue atacando).
      else if (e.timer <= 0 && e.onGround && e.goalX != null && Math.abs(e.goalX - e.cx) > 40 && Math.random() < 0.4) {
        e.state = 'crouch'; e.timer = 0.3; e.vx = 0; e.chain = 0; e.leapTo = e.goalX;
        g.audio.play('eelGurgle', e);
      }
      else if (e.timer <= 0 && e.onGround) {
        // A media distancia, a veces la embestida a ras de suelo; si no, saltos (a veces
        // encadenados: 1-2 más; herido, casi siempre).
        if (!e.preferLeap && Math.abs(dx) < 230 && Math.random() < 0.45) { e.state = 'rushWind'; e.timer = enraged ? 0.28 : 0.42; e.vx = 0; g.audio.play('eelGurgle', e); }
        else { e.state = 'crouch'; e.timer = enraged ? 0.35 : 0.55; e.vx = 0; e.chain = enraged ? 1 + (Math.random() < 0.5 ? 1 : 0) : Math.random() < 0.5 ? 1 : 0; g.audio.play('eelGurgle', e); }
      }
    } else if (e.state === 'crouch') {
      e.vx = 0;
      if (e.timer <= 0) {
        e.state = 'leap';
        e.preferLeap = false;
        e.dir = Math.sign(dx) || e.dir;
        const far = (e.farLeap ?? 0) > 0 && Math.abs(dx) > 90;
        if (e.farLeap > 0) e.farLeap--;
        const to = e.leapTo != null ? e.leapTo - e.cx : null;
        if (to != null) e.dir = Math.sign(to) || e.dir;
        e.vx = to != null ? clamp(to / 0.85, -340, 340) : far ? Math.sign(dx) * 340 : clamp(dx * 1.3, -230, 230);
        e.vy = to != null ? -360 : (far ? -290 : -360) - Math.min(120, Math.max(0, -(p.cy - e.cy)) * 0.8); // más alto si estás arriba
        e.leapTo = null;
        e.hitDone = false;
        e.airT = 0;
        e.leapVx = e.vx;                                                 // conserva el impulso aunque roce un escalón
        g.audio.play(d.sounds.attack, e);
      }
    } else if (e.state === 'leap') {
      e.airT += dt;
      if (!e.onGround) e.vx = e.leapVx ?? e.vx;
      // El topetazo: una vez por salto.
      if (!e.hitDone && overlap(p, e)) { e.hitDone = true; g.hurtPlayer(d.leapDamage, e.cx, d.name); }
      if (e.onGround && e.airT > 0.15) {
        e.state = 'land';
        e.landT = 0;
        e.timer = enraged ? 0.5 : 0.75;
        e.vx = 0;
        g.shake = Math.max(g.shake, 6);
        g.audio.play('thump', e);
        // Salpicadura de ácido a los lados.
        for (const s of [-1, 1]) for (let i = 0; i < (enraged ? 3 : 2); i++) {
          g.spawnProjectile({
            x: e.cx - 2, y: e.y + e.h - 6, w: 4, h: 4, vx: s * (60 + i * 50), vy: -160 - i * 40, gravity: 520, life: 2,
            damage: 6, kind: 'drip', owner: 'enemy', color: '#9be06a', glow: [0.4, 1, 0.3],
          });
        }
      }
    } else if (e.state === 'biteWind') {
      // Anticipación: recoge la cabeza, se le hincha el cuello y abre las fauces despacio.
      e.vx *= 0.8;
      e.dir = Math.sign(dx) || e.dir;
      e.biteWK = 1 - Math.max(0, e.timer) / (e.biteWT ?? 0.5);
      if (e.timer <= 0) { e.state = 'bite'; e.timer = 0.7; e.hitDone = false; e.snapped = false; g.audio.play('stalkerLunge', e); }
    } else if (e.state === 'bite') {
      e.vx = 0;
      // Embestida (0-0,16 s): el cuello se estira de golpe con las fauces abiertas.
      // Cepo (0,16 s): se cierran de golpe; aprietan temblando y el cuello se recoge despacio.
      const k = 0.7 - Math.max(0, e.timer);
      e.biteK = k < 0.16 ? Math.pow(k / 0.16, 0.6) : k < 0.34 ? 1 : Math.max(0, 1 - (k - 0.34) / 0.36);
      e.snapK = k < 0.16 ? 0 : Math.min(1, (k - 0.16) / 0.04);           // 0 abierta → 1 cerrada
      if (!e.snapped && k >= 0.16) {
        e.snapped = true;
        g.audio.play('crunch', e);
        g.audio.play('melee', e);
        g.shake = Math.max(g.shake, 5);
        const reach = 18 + 30 * e.biteK;
        const box = { x: e.dir > 0 ? e.x + e.w - 6 : e.x - reach + 6, y: e.y - 12, w: reach, h: e.h + 12 };
        if (overlap(p, box)) {
          e.hitDone = true;
          g.hurtPlayer(d.biteDamage ?? 16, e.cx, d.name, undefined, d.biteIframes, d.bitePush ?? 260);
          g.shake = Math.max(g.shake, 9);
          e.bloody = 3;
          const bx = e.dir > 0 ? e.x + e.w + 26 : e.x - 26, by = e.y + 6;
          for (let i = 0; i < 18; i++) g.particles.emit(bx, by, { vx: e.dir * (20 + Math.random() * 110) + (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 120, life: 0.7, gravity: 600, color: [0.6, 0.03, 0.08], stain: '#6a0a14' });
        }
      }
      if (e.timer <= 0) { e.state = 'sit'; e.biteK = 0; e.snapK = 0; e.timer = enraged ? 0.4 : 0.7; e.biteCool = enraged ? 1.2 : 1.8; }
    } else if (e.state === 'land') {
      e.vx = 0;
      e.landT = (e.landT ?? 0) + dt;
      if ((e.chain ?? 0) > 0 && e.landT > 0.16) {
        e.chain--; e.state = 'crouch'; e.timer = 0.2;                     // otro salto, casi sin pausa
      } else if (e.landT > 0.14 && Math.abs(dx) < 90 && Math.abs(p.cy - e.cy) < 40 && e.biteCool <= 0) {
        e.dir = Math.sign(dx) || e.dir;
        e.state = 'biteWind'; e.timer = e.biteWT = 0.26; e.biteK = 0;      // cae cerca de ti: muerde enseguida
        g.audio.play('eelGurgle', e);
      } else if (e.timer <= 0) { e.state = 'sit'; e.timer = enraged ? 0.45 : 0.85; }
    } else if (e.state === 'rushWind') {
      // Se agazapa temblando, con la mirada fija.
      e.vx = 0;
      e.dir = Math.sign(dx) || e.dir;
      e.shakeX = Math.random() < 0.5 ? -1 : 1;
      if (e.timer <= 0) { e.state = 'rush'; e.timer = 0.75; e.rushHit = false; e.shakeX = 0; g.audio.play('stalkerLunge', e); g.audio.play(d.sounds.attack, e); }
    } else if (e.state === 'rush') {
      // Embestida a ras de suelo con las fauces abiertas: te arrolla y, si acaba cerca, muerde.
      e.vx = e.dir * Math.min(290, Math.abs(e.vx) + 1400 * dt);
      if (Math.random() < 0.7) g.particles.emit(e.cx - e.dir * 20, e.y + e.h - 2, { vx: -e.dir * (40 + Math.random() * 60), vy: -20 - Math.random() * 50, life: 0.5, gravity: 400, color: [0.55, 0.5, 0.4] });
      if (!e.rushHit && overlap(p, e)) { e.rushHit = true; g.hurtPlayer(d.rushDamage ?? 14, e.cx - e.dir * 30, d.name, undefined, undefined, d.rushPush ?? 300); g.shake = Math.max(g.shake, 6); }
      const close = Math.abs(dx) < 70 && Math.sign(dx) === e.dir;
      if (e.timer <= 0 || e.hitWall || (close && e.timer < 0.55)) {
        if (Math.abs(dx) < 90 && Math.abs(p.cy - e.cy) < 40) { e.state = 'biteWind'; e.timer = e.biteWT = 0.18; e.biteK = 0; e.vx *= 0.3; }
        else { e.state = 'sit'; e.timer = 0.5; }
        if (e.hitWall) { g.shake = Math.max(g.shake, 5); g.audio.play('thump', e); e.preferLeap = true; }
      }
    } else if (e.state === 'brood') {
      e.vx = 0;
      if (e.timer <= 0) {
        // Revientan las celdas: los huevos estallan y las crías saltan de la espalda.
        toadPopEggs(e, g, e.popPending ?? []);
        e.popPending = [];
        for (let i = 0; i < BROOD.n; i++) {
          const sp = i - (BROOD.n - 1) / 2;
          g.spawnMinion('larva', e.cx + sp * 10, e.y - 6);
          const m = g.room.enemies[g.room.enemies.length - 1];
          // Salen disparadas de la espalda: hacia arriba y abiertas, algo hacia ti.
          m.vy = -250 - Math.random() * 60; m.vx = sp * (BROOD.n > 3 ? 70 : 110) + Math.sign(p.cx - e.cx) * 40;
        }
        for (let i = 0; i < 12; i++) g.particles.emit(e.cx + (Math.random() - 0.5) * 30, e.y + 4, { vx: (Math.random() - 0.5) * 100, vy: -60 - Math.random() * 80, life: 0.6, gravity: 400, color: [0.45, 0.6, 0.2] });
        e.broodCool = BROOD.cool;
        e.state = 'sit';
        e.timer = 1;
      }
    }
    e.vy = Math.min(420, e.vy + GRAVITY * dt);
    g.world.move(e, dt);
    if (e.hitWall && e.state === 'leap') e.vx = 0;
  },

  // Glándula Gástrica (semijefe, poseída por el parásito). Un ciclo en cuatro tiempos:
  //   hang   colgada del techo por sus tubos: escupe ácido (enfurecida, rocía) y suelta
  //          anguilas en la charca.
  //   detach se exprime, se le rompen los tubos y cae al ácido, que sube e inunda la sala.
  //   float  flota en la superficie como un pepino de mar, se deja ir hacia ti y te
  //          latiguea con un tentáculo que se estira; es cuando más expuesta queda.
  //   climb  lanza los flagelos al techo, se iza y vuelve a colgar (el ácido baja).
  // Al vencerla se desinfla (deflate): queda una cabeza que habla (talk) y se deshace.
  // Dibujo: entities/Gland.js (lee attach, flag, float, tent, deflate, talk...).
  bossGland(e, dt, g) {
    const p = g.player, d = e.def;
    const enraged = e.hp < d.hp / 2;
    e.ceilY ??= e.y;
    e.home ??= { x: e.x, y: e.y + 20 };
    e.trackX ??= e.home.x;
    e.depth ??= 0;
    e.gs ??= 'hang';
    e.attach ??= 1;
    e.flag ??= 0;
    e.float ??= 0;
    e.deflate ??= 0;
    e.timer = (e.timer ?? 0) - dt;
    e.cool = (e.cool ?? 2.2) - dt;
    e.phaseT = (e.phaseT ?? (enraged ? 7 : 9)) - dt;
    const pool = g.room.hazards.find((h) => h.def?.manual);
    const base = d.poolBase ?? 0.35;                                  // el ácido que siempre queda
    // El tanque: ella lo llena (sus tubos) salvo con los sumideros abiertos (válvula flush).
    const setPool = (v) => { if (pool && !(pool.flushT > 0)) pool.target = v; };
    // Varada no hace daño al tocarla (está indefensa: puedes pegarte a ella).
    e.contactDamage = e.gs === 'beached' ? 0 : undefined;
    const side = Math.sign(p.cx - e.cx) || 1;
    e.face = (e.face ?? side) + (side - (e.face ?? side)) * Math.min(1, dt * 1.6);
    const mouth = () => ({ x: e.cx + e.face * 15, y: e.cy + 8 });
    const go = (st, time) => { e.gs = st; e.timer = time; };
    e.swell = Math.max(0, (e.swell ?? 0) - dt * 2);
    e.lash = Math.max(0, (e.lash ?? 0) - dt * 1.5);
    e.mouthOpen = 0.18 + Math.max(0, Math.sin(e.t * 2.3)) * 0.12;
    const surfaceY = () => (pool && pool.level > 0.01 ? pool.surfaceY : g.world.pixelH - TILE * 2);
    const tentTip = () => {
      const T = e.tent; if (!T) return null;
      const len = 18 + T.k * 120;
      return { x: e.cx + Math.cos(T.a) * len, y: e.cy + Math.sin(T.a) * len };
    };

    // --- Desinflada: cae, habla y se deshace.
    if (e.gs === 'deflate') {
      e.exposed = false;
      e.tent = null;
      e.attach = Math.max(0, e.attach - dt * 3);
      e.flag = Math.max(0, e.flag - dt * 2);
      e.deflate = Math.min(1, e.deflate + dt / 2.4);
      if (pool) pool.target = 0;
      e.vy = Math.min(220, (e.vy ?? 0) + GRAVITY * 0.5 * dt);
      e.vx = 0;
      g.world.move(e, dt);
      if (Math.random() < 0.5) g.glowParticles.emit(e.cx + (Math.random() - 0.5) * e.w * (1 - e.deflate * 0.6), e.cy, { vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, life: 0.6, color: [0.4, 1, 0.3] });
      if (Math.random() < dt * 6) g.audio.play('sizzle', e);
      if (e.deflate >= 1 && e.onGround && e.timer <= 0) {
        go('talk', 0);
        e.talk = 0;
        g.dialogue(d.lastWords ?? ['...'], {
          speaker: d.headName ?? 'La cabeza',
          owner: e,
          onLine: () => { e.talk = 1.5; g.audio.play('faceFree', e); },
          onEnd: () => { e.gs = 'dissolve'; e.timer = 1.2; },
        });
      }
      return;
    }
    if (e.gs === 'talk' || e.gs === 'dissolve') {
      e.exposed = false;
      e.talk = Math.max(0, (e.talk ?? 0) - dt);
      e.vy = Math.min(220, (e.vy ?? 0) + GRAVITY * 0.5 * dt);
      g.world.move(e, dt);
      if (e.gs === 'dissolve') {
        e.melt = Math.min(1, (e.melt ?? 0) + dt / 1.2);
        if (Math.random() < 0.6) g.particles.emit(e.cx + (Math.random() - 0.5) * 16, e.y + e.h - 4, { vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0.6, gravity: 400, color: [0.75, 0.55, 0.6], stain: '#5a3a44' });
        if (e.timer <= 0) { e.deflating = false; e.hp = 0; e.die(); }
      }
      return;
    }

    // --- Tentáculo (flotando): se encoge hacia atrás, se dispara hacia ti y vuelve.
    if (e.tent) {
      const T = e.tent;
      T.t += dt;
      if (T.st === 'wind') { T.k = Math.max(0, 0.15 - T.t * 0.3); T.a += (Math.atan2(p.cy - e.cy, p.cx - e.cx) - T.a) * Math.min(1, dt * 6); if (T.t >= T.wind) { T.st = 'lash'; T.t = 0; g.audio.play('stalkerLunge', e); } }
      else if (T.st === 'lash') {
        T.k = Math.min(1, T.t / 0.22);
        // Hiere a lo largo del último tramo del tentáculo.
        if (!T.hit) {
          for (let u = 0.45; u <= 1.001; u += 0.11) {
            const len = (18 + T.k * 120) * u, x = e.cx + Math.cos(T.a) * len, y = e.cy + Math.sin(T.a) * len;
            if (x > p.x - 4 && x < p.x + p.w + 4 && y > p.y - 4 && y < p.y + p.h + 4) { T.hit = true; g.hurtPlayer(d.lashDamage ?? 12, e.cx, d.name); break; }
          }
        }
        if (T.t >= 0.34) { T.st = 'back'; T.t = 0; }
      } else { T.k = Math.max(0, 1 - T.t / 0.22); if (T.t >= 0.22) e.tent = null; }
    }
    // Un latigazo de tentáculo hacia ti (wind: lo que tarda en cargarlo).
    const lashAt = (wind) => {
      e.tent = { st: 'wind', t: 0, k: 0, wind, a: Math.atan2(p.cy - e.cy, p.cx - e.cx), hit: false };
      g.audio.play('glandRumble', e);
    };
    const near = Math.hypot(p.cx - e.cx, p.cy - e.cy);
    e.tentCool = (e.tentCool ?? 0) - dt;
    // Le pegas cuerpo a cuerpo: no lo aguanta, se iza deprisa al techo y desde allí te
    // bombardea.
    if (e.meleeHit) {
      e.meleeHit = false;
      if (e.gs === 'float') { e.tent = null; go('climb', 1.0); e.climbDur = 1.0; e.thenBomb = true; e.flag = 0; e.climbFrom = e.y; e.home.x = Math.max(TILE * 2, Math.min(g.world.pixelW - TILE * 2 - e.w, e.x)); e.trackX = e.home.x; e.swingX = 0; }
      else if (e.gs === 'swing' || (e.gs === 'hang' && e.atk !== 'bomb' && e.atk !== 'retreat')) { e.tent = null; e.gs = 'hang'; e.atk = 'retreat'; e.timer = 0.45; e.swL = undefined; e.trackX = e.x; e.depth = e.y - e.home.y; e.swingX = 0; e.swingV = 0; }
    }

    if (e.gs === 'hang') {
      // Colgada: respira, sigue tu posición y ataca desde arriba.
      e.attach = Math.min(1, e.attach + dt * 2);
      e.float = Math.max(0, e.float - dt * 2);
      setPool(base);
      const target = Math.max(e.home.x - 60, Math.min(e.home.x + 60, p.cx - e.w / 2));
      e.trackX += Math.sign(target - e.trackX) * Math.min(Math.abs(target - e.trackX), (enraged ? 26 : 18) * dt);
      e.swingV = (e.swingV ?? 0) + (-(e.swingX ?? 0) * 9 - (e.swingV ?? 0) * 0.6) * dt + Math.sin(e.t * 1.1) * 14 * dt;
      e.swingX = (e.swingX ?? 0) + e.swingV * dt;
      let want = 6 + Math.sin(e.t * (enraged ? 2.2 : 1.6)) * 7;
      if (e.atk === 'retreat') {
        // Se recoge de golpe contra el techo.
        want = -4; e.swell = 0.6;
        e.depth += (want - e.depth) * Math.min(1, dt * 9);
        if (e.timer <= 0) { e.atk = 'bomb'; e.timer = enraged ? 2.6 : 2.0; e.drip = 0.2; g.audio.play(d.sounds?.attack ?? 'charge', e); }
      } else if (e.atk === 'bomb') {
        // Bombardeo: grumos de ácido seguidos, apuntados a donde estás (y a donde vas).
        want = -3; e.mouthOpen = 1; e.swell = 0.5 + Math.sin(e.t * 20) * 0.3;
        e.drip = (e.drip ?? 0) - dt;
        if (e.drip <= 0) {
          e.drip = enraged ? 0.2 : 0.27;
          const m = mouth(), lead = p.vx * 0.5 + (Math.random() - 0.5) * 50;
          g.spawnProjectile({ x: m.x - 3, y: m.y - 3, w: 6, h: 6, vx: (p.cx + lead - m.x) / 0.9, vy: -60, gravity: 420, life: 3, damage: 6, kind: 'acidGlob', owner: 'enemy', color: '#9be06a', glow: [0.4, 1, 0.3], burstRadius: 22, burstDamage: 5 });
          g.audio.play('acid', e);
        }
        if (e.timer <= 0) {
          e.atk = null; e.cool = 0.6;
          // Si no has subido a por ella, baja colgada de sus tubos y te ataca pendulando.
          if (p.y > e.home.y + TILE * 7) { e.gs = 'swing'; e.timer = enraged ? 7 : 5.5; e.swA = 0; e.swV = 0; e.trackX = e.x; e.tentCool = 0.8; g.audio.play('glandRumble', e); return; }
        }
      } else if (e.atk === 'spitWind') {
        want = -3; e.swell = Math.min(1, 1 - e.timer / 0.8 + 0.2); e.mouthOpen = 0.3 + 0.7 * (1 - e.timer / 0.8);
        if (e.timer <= 0) {
          const m = mouth();
          for (const k of enraged ? [-1, -0.5, 0, 0.5, 1] : [-1, 0, 1]) {
            g.spawnProjectile({ x: m.x - 3, y: m.y - 3, w: 6, h: 6, vx: (p.cx - m.x) / 1.0 + k * 45, vy: -120, gravity: 420, life: 3, damage: 6, kind: 'acidGlob', owner: 'enemy', color: '#9be06a', glow: [0.4, 1, 0.3], burstRadius: 22, burstDamage: 5 });
          }
          g.audio.play('acid', e);
          e.depth -= 10; e.swell = 0; e.atk = null; e.cool = enraged ? 1.4 : 2.1;
        }
      } else if (e.atk === 'spray') {
        e.mouthOpen = 1;
        e.drip = (e.drip ?? 0) - dt;
        if (e.drip <= 0) {
          e.drip = 0.06;
          const m = mouth(), k = 1 - e.timer / 1.3;
          const an = Math.atan2(p.cy - m.y, p.cx - m.x) + (k - 0.5) * 1.1 * -side;
          g.spawnProjectile({ x: m.x - 2, y: m.y - 2, w: 4, h: 4, vx: Math.cos(an) * 190, vy: Math.sin(an) * 190, gravity: 280, life: 1.6, damage: 4, kind: 'acidStream', owner: 'enemy', color: '#9be06a', glow: [0.4, 1, 0.3] });
        }
        if (e.timer <= 0) { e.atk = null; e.cool = 1.8; }
      } else if (e.atk === 'brood') {
        // Pare anguilas: le revientan las vesículas y caen al ácido.
        e.swell = 0.8; e.mouthOpen = 0.9;
        if (e.timer <= 0) {
          const n = enraged ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const m = mouth(), eel = g.spawnMinion('anguila', m.x + (i - 0.5) * 16, m.y + 6);
            eel.state = 'air'; eel.leftT = 1; eel.vx = eel.leapVx = (Math.random() - 0.5) * 60; eel.vy = 0; eel.home = { x: eel.x, y: eel.y };
          }
          g.audio.play('splat', e);
          e.atk = null; e.cool = 1.6;
        }
      } else if (!e.tent && e.tentCool <= 0 && near < 150) {
        // Te tiene a su alcance (has subido): latigazos con el tentáculo.
        lashAt(enraged ? 0.18 : 0.26); e.tentCool = enraged ? 0.55 : 0.75;
      } else if (e.cool <= 0) {
        const eels = g.room.enemies.filter((m) => m.minion && m.alive && m.type === 'anguila').length;
        if (p.y > e.home.y + TILE * 9 && Math.random() < 0.3) { e.gs = 'swing'; e.timer = enraged ? 6 : 4.5; e.swA = 0; e.swV = 0; e.trackX = e.x; e.tentCool = 0.8; e.cool = 1; g.audio.play('glandRumble', e); return; }
        if (eels < (enraged ? 4 : 2) && Math.random() < 0.4) { e.atk = 'brood'; e.timer = 0.9; g.audio.play('glandRumble', e); }
        else if (enraged && Math.random() < 0.4) { e.atk = 'spray'; e.timer = 1.3; g.audio.play(d.sounds?.attack ?? 'charge', e); }
        else { e.atk = 'spitWind'; e.timer = 0.8; g.audio.play(d.sounds?.attack ?? 'charge', e); }
      }
      e.depth += (want - e.depth) * Math.min(1, dt * 3);
      e.x = e.trackX + e.swingX;
      e.y = e.home.y + Math.max(-4, e.depth);
      e.exposed = e.atk === 'spitWind' || e.atk === 'spray' || e.atk === 'bomb' || !!e.tent;
      if (e.phaseT <= 0 && !e.atk) { go('detach', 0.9); g.audio.play(d.sounds?.flood ?? 'glandFlood', e); }
      return;
    }
    if (e.gs === 'swing') {
      // Baja colgada de sus tubos estirados hasta tu altura y se balancea como un péndulo
      // sobre ti, menea los cilios y te latiguea una y otra vez.
      e.attach = 1;
      e.lash = 1;
      e.exposed = true;
      e.mouthOpen = 0.5 + 0.5 * Math.max(0, Math.sin(e.t * 4));
      setPool(base);
      const lo = TILE * 2, hi = g.world.pixelW - TILE * 2 - e.w;
      const pivTarget = Math.max(lo, Math.min(hi, p.cx - e.w / 2));
      e.trackX += Math.sign(pivTarget - e.trackX) * Math.min(Math.abs(pivTarget - e.trackX), (enraged ? 70 : 50) * dt);
      e.home.x += (e.trackX - e.home.x) * Math.min(1, dt * 2);
      const sy = surfaceY();
      const wantL = Math.max(30, Math.min(sy - e.h - 8 - e.ceilY, p.cy - 22 - e.ceilY - e.h / 2));
      e.swL = (e.swL ?? (e.y - e.ceilY)) + (wantL - (e.swL ?? (e.y - e.ceilY))) * Math.min(1, dt * 2.2);
      // Péndulo con empuje: se impulsa hacia ti.
      const L = Math.max(30, e.swL);
      e.swV += (-(9.8 * 60 / L) * Math.sin(e.swA) - e.swV * 0.25) * dt + Math.sign(p.cx - e.cx) * (enraged ? 2.6 : 2) * dt;
      e.swA = Math.max(-0.75, Math.min(0.75, e.swA + e.swV * dt));
      if (Math.abs(e.swA) < 0.05 && Math.abs(e.swV) < 0.3) e.swV += (Math.random() < 0.5 ? -1 : 1) * 0.8;
      e.x = Math.max(lo, Math.min(hi, e.home.x + Math.sin(e.swA) * L));
      e.y = e.ceilY + Math.cos(e.swA) * L;
      if (!e.tent && e.tentCool <= 0 && near < 170) { lashAt(enraged ? 0.15 : 0.22); e.tentCool = enraged ? 0.45 : 0.6; }
      if (e.timer <= 0 && !e.tent) {
        // Vuelve arriba.
        e.gs = 'hang'; e.swL = undefined; e.trackX = e.x; e.swingX = 0; e.swingV = 0;
        e.home.x = Math.max(lo, Math.min(hi, e.x));
        e.depth = e.y - e.home.y; e.cool = 1;
      }
      return;
    }
    if (e.gs === 'detach') {
      // Se exprime, los tubos revientan y cae.
      e.swell = 1; e.mouthOpen = 1;
      e.x += (Math.random() - 0.5) * 2;
      if (e.timer <= 0 && e.attach > 0.5) {
        e.attach = 0.4;
        e.vy = 0;
        g.shake = Math.max(g.shake, 6);
        g.audio.play('tear', e);
        for (let i = 0; i < 20; i++) g.particles.emit(e.cx + (Math.random() - 0.5) * 60, e.y, { vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 60, life: 0.7, gravity: 500, color: [0.55, 0.45, 0.5] });
      }
      if (e.timer <= 0) {
        e.attach = Math.max(0, e.attach - dt * 1.5);
        setPool(1);                                                   // revientan sus tubos: el ácido inunda el tanque
        e.vy = Math.min(300, (e.vy ?? 0) + GRAVITY * 0.6 * dt);
        e.y += e.vy * dt;
        const sy = surfaceY();
        if (e.y + e.h * 0.55 >= sy) {
          e.y = sy - e.h * 0.55;
          g.shake = Math.max(g.shake, 8);
          g.audio.play('splat', e);
          for (let i = 0; i < 24; i++) g.particles.emit(e.cx + (Math.random() - 0.5) * 70, sy, { vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 140, life: 0.8, gravity: 600, color: [0.35, 0.75, 0.15], stain: '#4a8a1a' });
          go('float', enraged ? 6.5 : 7.5);
          e.cool = 0.8;
        }
      }
      return;
    }
    if (e.gs === 'float') {
      // Flota tal cual es, cabeceando con las olas, meneando cilios y tentáculo; se arrastra
      // hacia ti y te latiguea una y otra vez.
      e.attach = 0;
      e.lash = Math.max(e.lash, 0.7);
      e.float = Math.min(1, e.float + dt * 2);
      e.exposed = true;
      e.mouthOpen = 0.6 + 0.4 * Math.max(0, Math.sin(e.t * 3));
      setPool(1);
      // Le vacían el tanque: se queda varada en el fondo.
      if (pool && pool.flushT > 0 && pool.level < 0.12) {
        e.tent = null;
        go('beached', d.beachedTime ?? 5);
        g.shake = Math.max(g.shake, 6);
        g.audio.play('thump', e);
        g.audio.play(d.sounds?.hurt ?? 'glandHurt', e);
        return;
      }
      const sy = surfaceY();
      e.y += (sy - e.h * 0.55 + Math.sin(e.t * 2) * 2 - e.y) * Math.min(1, dt * 4);
      const tx = p.cx - e.w / 2;
      const lo = TILE * 2, hi = g.world.pixelW - TILE * 2 - e.w;
      e.x = Math.max(lo, Math.min(hi, e.x + Math.sign(tx - e.x) * Math.min(Math.abs(tx - e.x), (enraged ? 46 : 34) * (e.tent ? 0.4 : 1) * dt)));
      if (!e.tent && e.cool <= 0) { lashAt(enraged ? 0.16 : 0.24); e.cool = enraged ? 0.4 : 0.6; }
      if (e.timer <= 0 && !e.tent) { go('climb', 1.8); e.climbDur = 1.8; e.flag = 0; e.climbFrom = e.y; e.home.x = Math.max(lo, Math.min(hi, e.x)); e.trackX = e.home.x; e.swingX = 0; }
      return;
    }
    if (e.gs === 'beached') {
      // Varada en el fondo vacío: se retuerce sin poder flotar ni huir, con la boca abierta
      // boqueando; los cilios se agitan en el aire. El momento de destrozarla.
      e.attach = 0;
      e.exposed = true;
      e.lash = 1;
      e.mouthOpen = 0.7 + 0.3 * Math.max(0, Math.sin(e.t * 9));
      e.swell = 0.3 + Math.max(0, Math.sin(e.t * 6)) * 0.3;
      const floorY = surfaceY();
      e.y += (floorY - e.h * 0.8 - e.y) * Math.min(1, dt * 8);
      e.x += Math.sin(e.t * 13) * 0.6;
      if (Math.random() < dt * 3) g.particles.emit(e.cx + (Math.random() - 0.5) * e.w, e.y + e.h * 0.8, { vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, life: 0.5, gravity: 400, color: [0.45, 0.75, 0.2] });
      // Si el tanque se vuelve a llenar, flota otra vez; si no, al rato se iza.
      if (pool && pool.level > 0.3) { go('float', 3); e.cool = 0.6; return; }
      if (e.timer <= 0) { go('climb', 2.2); e.climbDur = 2.2; e.flag = 0; e.climbFrom = e.y; const lo = TILE * 2, hi = g.world.pixelW - TILE * 2 - e.w; e.home.x = Math.max(lo, Math.min(hi, e.x)); e.trackX = e.home.x; e.swingX = 0; }
      return;
    }
    if (e.gs === 'climb') {
      // Los flagelos suben al techo (1 s) y la izan (1,6 s); el ácido baja.
      e.exposed = false;
      e.float = Math.max(0, e.float - dt * 1.5);
      const k = 1 - e.timer / (e.climbDur ?? 1.8);
      e.flag = Math.min(1, k / 0.38);
      if (k > 0.38) {
        const u = Math.min(1, (k - 0.38) / 0.62), ease = u * u * (3 - 2 * u);
        e.y = e.climbFrom + (e.home.y + 6 - e.climbFrom) * ease;
        e.attach = Math.min(1, u * 1.2);
        setPool(base);
      }
      if (e.timer <= 0) {
        go('hang', 0); e.flag = 0; e.attach = 1; e.depth = 6; e.phaseT = enraged ? 7 : 9; e.cool = 1.2;
        if (e.thenBomb) { e.thenBomb = false; e.atk = 'bomb'; e.timer = enraged ? 2.6 : 2.0; e.drip = 0.15; e.depth = -3; }
      }
      return;
    }
  },

};

export class Enemy {
  constructor(game, type, def, tx, ty, world = game.world) {
    this.game = game;
    this.type = type;
    this.def = def;
    this.w = def.w;
    this.h = def.h;
    this.x = tx * TILE + (TILE - this.w) / 2;
    // Ojos, fauces y la glándula cuelgan del techo; las neuronas flotan en su tile; el resto pisa el suelo.
    const hanging = ['ceilingEye', 'pod', 'bossGland'].includes(def.behavior);
    const floating = ['darter', 'pollinator', 'mothSpin'].includes(def.behavior);
    this.y = hanging ? ty * TILE : floating ? ty * TILE + (TILE - this.h) / 2 : (ty + 1) * TILE - this.h;
    // Las fauces necesitan saber cuánto pueden caer (para dibujar su tallo).
    if (def.behavior === 'pod' && world) {
      let d = 1;
      while (d < 16 && !world.solid(tx, ty + d)) d++;
      this.dropLen = d * TILE;
    }
    this.vx = 0;
    this.vy = 0;
    this.dir = -1;
    this.hp = def.hp;
    this.armored = !!def.armored;
    this.alive = true;
    this.lit = false;
    this.revealed = false;
    this.seenOnce = false;
    this.cool = 1 + Math.random();
    this.seed = Math.random() * 10;
    this.t = Math.random();
    this.flash = 0;
    this.dot = 0;
    this.dotTime = 0;

    this.creature = CREATURES[def.creature];
    let s;
    if (this.creature) {
      // Criatura procedural: un lienzo que se repinta cada fotograma.
      const [w, h] = this.creature.size(this);
      this.canvas = document.createElement('canvas');
      this.glowCanvas = document.createElement('canvas');
      this.canvas.width = this.glowCanvas.width = w;
      this.canvas.height = this.glowCanvas.height = h;
      this.ctx = this.canvas.getContext('2d');
      this.gctx = this.glowCanvas.getContext('2d');
      s = { w, h, tex: canvasTexture(this.canvas), glowTex: canvasTexture(this.glowCanvas) };
      this.frame = 'open';
    } else {
      this.frame = Object.keys(SPRITES[def.sprite].frames)[0];
      s = getSprite(def.sprite, this.frame);
    }
    this.sw = s.w;
    this.sh = s.h;
    this.mesh = spriteMesh(s.w, s.h);
    this.mesh.renderOrder = 3;
    this.glowMesh = spriteMesh(s.w, s.h, { glow: true });
    this.glowMesh.renderOrder = 3;
    if (this.creature) {
      this.mesh.material.map = s.tex;
      this.glowMesh.material.map = s.glowTex;
    }
    game.visual.world.add(this.mesh);
    game.visual.glow.add(this.glowMesh);
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  // Puntos concretos del cuerpo (cabezas, núcleos) en coordenadas de mundo, si la
  // criatura los marca al dibujarse (e.spots: [{ x, y, r, weak }] en su lienzo).
  spots() {
    if (!this.spotsLocal?.length || !this.creature) return [];
    const [ox, oy] = this.creature.origin(this), W = this.canvas.width;
    const flip = !this.creature.noFlip && this.dir < 0;
    return this.spotsLocal.map((s) => ({ ...s, x: ox + (flip ? W - 1 - s.x : s.x), y: oy + s.y }));
  }

  touchesSpot(x, y) {
    // Solo los puntos débiles abiertos atrapan disparos fuera de la caja (las cabezas
    // cerradas no hacen de escudo de la que canta).
    return this.spotsLocal?.length > 0 && this.spots().some((s) => s.weak && Math.hypot(x - s.x, y - s.y) <= s.r + 2);
  }

  // Dónde se fija el auto-apuntado: el punto débil abierto si lo hay; si no, el punto
  // del cuerpo más cercano; si la criatura no marca puntos, su centro.
  lockPoint(from) {
    const sp = this.spots();
    if (!sp.length) return { x: this.cx, y: this.cy };
    const weak = sp.filter((s) => s.weak);
    const pool = weak.length ? weak : sp;
    return pool.reduce((a, b) => (Math.hypot(b.x - from.x, b.y - from.y) < Math.hypot(a.x - from.x, a.y - from.y) ? b : a));
  }

  overlaps(box) { return overlap(this, box); }

  // Pegado a una superficie de su casilla: 'techo' (cuelga del de arriba) o la pared
  // 'left' / 'right'. Sin gravedad; se dibuja girado hacia ella.
  setAnchor(a, tx, ty) {
    this.anchor = a;
    if (a === 'techo') { this.x = tx * TILE + (TILE - this.w) / 2; this.y = ty * TILE; }
    if (a === 'left') { this.x = tx * TILE; this.y = ty * TILE + (TILE - this.h) / 2; }
    if (a === 'right') { this.x = (tx + 1) * TILE - this.w; this.y = ty * TILE + (TILE - this.h) / 2; }
  }

  // Huye de tu luz (Ojo Pineal): se aparta de ti a toda prisa, por el suelo o por el aire.
  #flee(dt) {
    const g = this.game, p = g.player;
    this.scared -= dt;
    const away = Math.sign(this.cx - p.cx) || 1;
    this.dir = away;
    this.state = this.def.behavior === 'golem' ? 'walk' : this.state;
    if (this.def.behavior === 'darter' || this.def.behavior === 'pollinator') {
      const dx = this.cx - p.cx, dy = this.cy - p.cy, d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * 90; this.vy = (dy / d) * 90;
      g.world.move(this, dt);
    } else {
      groundWalk(this, g, dt, (this.def.chaseSpeed ?? 40) * 1.4, false);
    }
    this.shakeX = Math.random() < 0.5 ? -1 : 1;
  }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    this.flash -= dt;
    if (this.dotTime > 0) {
      this.dotTime -= dt;
      this.hurt(this.dot * dt, 'acid', true);
      if (Math.random() < 0.3) this.game.glowParticles.emit(this.cx, this.cy, { vx: (Math.random() - 0.5) * 20, vy: -20, life: 0.4, color: [0.8, 0.2, 0.7] });
    }
    if (this.knock > 0) this.#stagger(dt);
    else if (this.scared > 0) this.#flee(dt);
    else BEHAVIORS[this.def.behavior](this, dt, this.game);
    this.#voice(dt);
  }

  // Empujón de un golpe: la criatura sale despedida y queda un instante sin control.
  // Los jefes y lo que está anclado (ojos de techo, fauces, sacos, anguilas) no se mueven.
  knockback(dir, force) {
    if (this.def.boss || (this.def.noStagger && !(this.gen > 0)) || ['ceilingEye', 'pod', 'spore', 'leaper'].includes(this.def.behavior) || this.hard) return;
    this.knock = 0.38;
    this.kvx = dir * force * (this.def.knockResist ?? 1);   // knockResist: fracción del empujón
    this.kvy = ['darter', 'pollinator', 'mothSpin'].includes(this.def.behavior) ? -30 : -110;
  }

  #stagger(dt) {
    const g = this.game, floats = ['darter', 'pollinator', 'mothSpin'].includes(this.def.behavior);
    this.knock -= dt;
    this.vx = this.kvx;
    this.kvx *= 0.85;
    this.vy = floats ? this.kvy * 0.9 : Math.min(380, (this.kvy += 900 * dt));
    this.kvy = floats ? this.kvy * 0.9 : this.kvy;
    g.world.move(this, dt);
    this.shakeX = Math.random() < 0.5 ? -1 : 1;
    if (this.knock <= 0) this.shakeX = 0;
  }

  // Ruidos propios: a oscuras se la oye antes de verla. Más a menudo si te ha visto.
  #voice(dt) {
    const aura = this.def.sounds?.aura;
    if (aura) {
      this.auraCool = (this.auraCool ?? 0.5) - dt;
      if (this.auraCool <= 0) {
        this.auraCool = this.def.auraPeriod ?? 3;
        const p = this.game.player;
        if (Math.hypot(p.cx - this.cx, p.cy - this.cy) < 340) this.game.audio.play(aura, this);
      }
    }
    const v = this.def.voice;
    if (!v || this.submerged) return;
    this.voiceCool = (this.voiceCool ?? 1 + Math.random() * 4) - dt;
    if (this.voiceCool > 0) return;
    const p = this.game.player;
    const near = Math.hypot(p.cx - this.cx, p.cy - this.cy) < 300;
    this.voiceCool = (this.seenOnce ? 1.8 : 3.5) + Math.random() * 3.5;
    if (near) this.game.audio.play(v[Math.floor(Math.random() * v.length)], this);
  }

  // Revelado por la linterna (lo calcula Game cada paso).
  setLit(lit, nearby) {
    this.lit = lit;
    const was = this.revealed;
    // Los jefes no se camuflan: siempre se les ve.
    this.revealed = lit || nearby || !!this.def.boss;
    if (this.revealed && !was && !this.seenOnce) {
      this.seenOnce = true;
      this.game.audio.play(this.def.sounds?.reveal ?? 'screech', this);
    }
  }

  hurt(n, kind, silent = false, at = null) {
    if (!this.alive) return false;
    if (this.submerged) return false; // bajo el ácido no le alcanzas
    // Jefes con punto débil (def.weakOnly): solo hiere el disparo que da en un punto
    // débil abierto (la cabeza que canta); el resto del cuerpo rebota.
    if (this.def.weakOnly && at) {
      const ok = this.spots().some((s) => s.weak && Math.hypot(at.x - s.x, at.y - s.y) <= s.r + 3);
      if (!ok) {
        if (!silent) this.game.audio.play('ricochet', this);
        return false;
      }
    }
    // Criaturas invulnerables, o un jefe con el núcleo cubierto: las balas rebotan.
    if (this.def.invulnerable || (this.def.exposedOnly && !this.exposed)) {
      if (!silent) this.game.audio.play('ricochet', this);
      return false;
    }
    // Coraza frontal (escarabajo rinoceronte): de frente rebota, por la espalda hiere más.
    if (this.def.frontArmor && kind !== 'tendon' && this.state !== 'stunned') {
      const sx = at?.x ?? this.game.player.cx;
      if ((sx - this.cx) * this.dir > -2) {
        if (!silent) this.game.audio.play('ricochet', this);
        return false;
      }
      n *= this.def.backBonus ?? 1.6;
    }
    // Aguante al cuerpo a cuerpo (def.meleeResist: fracción del daño que le llega).
    if (kind === 'melee' && this.def.meleeResist && this.gs !== 'beached') n *= this.def.meleeResist;
    if (this.gs === 'beached') n *= this.def.beachedBonus ?? 1;
    // Contraataque (def.counterChance): si le golpeas de frente cuerpo a cuerpo, a veces
    // responde enseguida (lo recoge su comportamiento, p. ej. una embestida corta).
    if (kind === 'melee' && this.def.counterChance && (this.game.player.cx - this.cx) * this.dir > 0 && Math.random() < this.def.counterChance) this.counter = true;
    // Endurecido (ojo con el párpado cerrado): todo rebota.
    if (this.hard && kind !== 'acid') {
      if (!silent) this.game.audio.play('ricochet', this);
      return false;
    }
    // La coraza para todo menos el tendón... y la carne del ciervo aturdido (élitros abiertos).
    if (this.armored && kind !== 'tendon' && this.state !== 'dazed') {
      if (!silent) this.game.audio.play('ricochet', this);
      // Reacción: al notar el golpe se enrosca.
      // El ciervo se vuelve hacia quien le dispara.
      if (this.def.behavior === 'centaur' && this.state === 'walk') this.dir = Math.sign(this.game.player.cx - this.cx) || this.dir;
      return false;
    }
    const before = this.hp;
    if (this.exposed && this.def.exposedBonus) n *= this.def.exposedBonus;
    // Piel curtida (el Sapo): casi nada le hace daño hasta que lo debilitas.
    if (this.def.armor) n *= this.weakT > 0 ? (this.def.weakArmor ?? 1) : this.inFull === false ? (this.def.dryArmor ?? this.def.armor) : this.def.armor;
    // Debilidades por tipo de golpe (p. ej. el Ganglio Madre ante las espinas del simbionte).
    n *= this.def.weakTo?.[kind] ?? 1;
    if (this.deflating) return false;
    // Montón de huesos (el Vestigio caído): los golpes lo deshacen; si lo destrozas, ya no
    // se levanta.
    if (this.state === 'pile') {
      this.pileHp -= n;
      this.flash = 0.06;
      this.game.audio.play('crunch', this);
      for (let i = 0; i < 5; i++) this.game.particles.emit(this.cx + (Math.random() - 0.5) * 16, this.y + this.h - 6, { vx: (Math.random() - 0.5) * 100, vy: -40 - Math.random() * 70, life: 0.5, gravity: 500, color: [0.85, 0.8, 0.65] });
      if (this.pileHp <= 0) { this.hp = 0; this.die(); }
      return true;
    }
    this.hp -= n;
    if (this.def.reforms && this.hp <= 0) {
      // No muere: se desmorona y al rato se recompone.
      this.hp = 0; this.state = 'pile'; this.pileT = this.def.reformTime ?? 5; this.pileHp = this.def.pileHp ?? 14;
      this.swing = 0; this.lurch = 0; this.sprint = 0; this.strike = 0; this.vx = 0; this.flash = 0.1;
      this.y += this.h - 12; this.h = 12;                          // el montón: bajo
      this.game.audio.play(this.def.sounds?.die ?? 'crunch', this);
      this.game.gore.burst(this.cx, this.cy, this.w, this.h, this.def.gore, 0.3);
      return true;
    }
    if (this.weakT > 0 && this.weakFloor > 0 && this.hp < this.weakFloor) this.hp = this.weakFloor;
    if (this.def.deflates && this.hp <= 0 && !this.deflating) {
      this.hp = 1; this.deflating = true; this.gs = 'deflate'; this.timer = 0.6; this.vy = 0; this.tent = null;
      this.flash = 0.08; this.game.audio.play(this.def.sounds?.hurt ?? 'hit', this);
      this.game.audio.stopBossMusic?.(0.6);
      return true;
    }
    if (this.def.behavior === 'bossMoth' && n > 0) this.struck = { x: at?.x ?? this.game.player.cx, y: at?.y ?? this.game.player.cy };
    if (this.def.behavior === 'golem' && n > 0 && !(this.gen > 0)) this.provoked = true;
    if (this.state === 'latch' && n > 0) this.shaken = true;
    if (this.def.behavior === 'bossToad' && n > 0) { this.provoked = true; this.hits = (this.hits ?? 0) + 1; this.hitT = 1.2; if (kind !== 'melee' && kind !== 'dash') this.shotAt = true; }
    if (this.def.behavior === 'bossGland' && n > 0 && kind === 'melee' && this.gs !== 'beached') this.meleeHit = true;
    if (this.def.behavior === 'glutton' && n > 0) { this.provoked = true; this.hits = (this.hits ?? 0) + 1; this.hitT = 1.4; }
    // El enjambre pierde células al ser herido: cada una sigue viva por su cuenta.
    if (this.def.sheds && this.hp > 0 && (this.gen ?? 0) === 0) {
      const lost = Math.ceil(before / this.def.cellHp) - Math.ceil(this.hp / this.def.cellHp);
      for (let i = 0; i < lost; i++) this.#offspring(this.def.sheds, { gen: this.def.shedGen ?? 0 });
    }
    if (!silent) {
      this.flash = 0.08;
      this.game.audio.play('hit', this);
      // Su quejido, sin amontonarse bajo una ráfaga de disparos.
      if (this.def.sounds?.hurt && this.game.time - (this.cryAt ?? -9) > 0.28) {
        this.cryAt = this.game.time;
        this.game.audio.play(this.def.sounds.hurt, this);
      }
      // Chorro de fluido hacia donde empuja el golpe (lejos del jugador).
      const dir = Math.sign(this.cx - this.game.player.cx) || 1;
      this.game.gore.hit(this.cx, this.cy, dir, this.def.gore, Math.min(2, 0.6 + n / 10));
    }
    this.seenOnce = true;
    if (this.hp <= 0) this.die();
    return true;
  }

  applyAcid(dps, time) {
    if (this.armored) return;
    this.dot = dps;
    this.dotTime = time;
  }

  ripArmor() {
    if (!this.armored) return;
    this.armored = false;
    this.hurt(5, 'tendon');
    this.game.audio.play('tear', this);
    this.game.say('Le has arrancado la coraza. Sus placas son hueso útil.', 2);
    this.game.dropPickup('scrap', this.cx, this.y);
    for (let i = 0; i < 12; i++) {
      this.game.particles.emit(this.cx, this.y, { vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 140, life: 0.8, gravity: 500, color: [0.45, 0.5, 0.55] });
    }
  }

  die() {
    this.alive = false;
    const g = this.game;
    g.state.stats.kills++;
    if (this.key) g.state.slain.add(this.key);
    g.audio.play(this.def.sounds?.die ?? 'die', this);
    // Revienta en trozos de su propio cuerpo, más carne suelta, sangre y un charco.
    if (this.creature) {
      const c = this.creature, cg = this.ctx;
      cg.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.draw(cg, this.gctx, this, g.time, g); // sin el destello del golpe
      const [ox, oy] = c.origin(this);
      const pieces = this.def.boss ? 12 : Math.max(3, Math.min(9, Math.round(Math.sqrt(this.canvas.width * this.canvas.height) / 5)));
      g.gore.shatter(this.canvas, ox, oy, !c.noFlip && this.dir < 0, this.def.gore, this.offspring ? Math.min(3, pieces) : pieces);
    }
    g.gore.burst(this.cx, this.cy, this.w, this.h, this.def.gore, this.def.boss ? 1.5 : this.offspring ? 0.3 : 0.6);
    // Las crías de una división sueltan poca biomasa y nunca ADN (no se puede granjear).
    if (this.offspring) this.#offspringDrop();
    else if (this.def.drop?.biomass) g.dropPickup('biomass', this.cx, this.cy, this.def.drop.biomass);
    if (this.def.behavior === 'spore') this.#burst();
    this.#split();
    // Consumibles raros: casi nunca los suelta una criatura; un jefe, siempre uno.
    if (!this.minion && !this.offspring && (this.def.boss || Math.random() < ITEM_DROP_CHANCE)) {
      g.dropPickup(Math.random() < 0.5 ? 'shield' : 'regen', this.cx + 6, this.cy - 4);
    }
    if (this.def.boss) {
      g.onBossDefeated(this);
    } else if (!this.minion && !this.offspring && this.def.frag && Math.random() < (this.def.fragmentChance ?? FRAGMENT_CHANCE)) {
      // Fragmento de ADN de lo que era: un ojo deja tejido ocular, una neurona, neural...
      g.dropPickup('fragment', this.cx, this.cy - 4, undefined, { frag: this.def.frag });
    }
    this.dispose();
  }

  // Las crías de una división (colonias partidas, células) casi nunca sueltan nada;
  // cuando lo hacen, no siempre es biomasa. Ajustable por enemigo con `offspringDrop`.
  #offspringDrop() {
    const od = this.def.offspringDrop ?? OFFSPRING_DROP;
    if (Math.random() >= od.chance) return;
    let r = Math.random() * od.table.reduce((n, [, , w]) => n + w, 0);
    for (const [kind, amount, w] of od.table) {
      if ((r -= w) <= 0) { this.game.dropPickup(kind, this.cx, this.cy, amount); return; }
    }
  }

  // División al morir: la colonia se parte en dos cadenas más cortas; la célula, en
  // dos más pequeñas; el enjambre libera sus últimas células. Hasta agotarse.
  #split() {
    const d = this.def, gen = this.gen ?? 0;
    if (d.behavior === 'golem') {
      if (gen < 2) for (const side of [-1, 1]) this.#offspring(this.type, { gen: gen + 1 }, side);
    } else if (d.splitsInto && gen < d.maxGen) {
      for (const side of [-1, 1]) this.#offspring(d.splitsInto, { gen: gen + 1, hp: Math.max(2, Math.round(d.hp * 0.6 ** (gen + 1))) }, side);
    } else if (d.sheds) {
      this.#offspring(d.sheds, { gen: d.shedGen ?? 0 });
    }
  }

  #offspring(type, extra, side = Math.random() < 0.5 ? -1 : 1) {
    // El gólem cambia de forma en cada generación (tamaño, vida, daño).
    const forms = this.game.factory && ENEMY_FORMS[type];
    if (forms && extra.gen !== undefined) extra = { ...forms[Math.min(forms.length - 1, extra.gen)], ...extra };
    const e = this.game.spawnOffspring(type, this.cx + side * 4, this.cy, extra);
    if (!e) return;
    // Sale despedida hacia los lados.
    e.vx = side * (60 + Math.random() * 40);
    e.vy = -40 - Math.random() * 40;
    e.state = 'recover';
    e.timer = 0.5;
  }

  // Nube de esporas: daña e infecta a quien esté cerca (también si lo revientas tú de lejos).
  #burst() {
    const g = this.game, d = this.def, p = g.player;
    g.audio.play('acid', this);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * (d.radius * 1.3);
      g.glowParticles.emit(this.cx, this.cy, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: 1.1, color: [0.55, 0.65, 0.12] });
    }
    if (Math.hypot(p.cx - this.cx, p.cy - this.cy) < d.radius) g.hurtPlayer(d.burstDamage, this.cx, 'esporas', d.infects ? 'infection' : undefined);
  }

  render() {
    if (!this.alive) return;
    if (this.creature) return this.#renderCreature();
    const palette = this.type === 'acorazado' && !this.armored ? { a: '#7a2a34', A: '#a8424e' } : undefined;
    const tint = this.flash > 0 ? 'flash' : this.revealed || this.sensed ? undefined : 'camo';
    const s = getSprite(this.def.sprite, this.frame, { key: palette ? 'naked' : '', palette, tint });
    setMap(this.mesh, s.tex);
    // Los ojos siempre brillan en la oscuridad, salvo cuando parpadean.
    const eyes = getSprite(this.def.sprite, this.frame, { key: palette ? 'naked' : '', palette });
    setMap(this.glowMesh, eyes.glowTex);
    this.glowMesh.visible = !!eyes.glowTex;

    const x = this.cx - this.sw / 2, y = this.y + this.h - this.sh;
    const yy = this.def.behavior === 'ceilingEye' ? this.y : y;
    const sx = x + (this.shakeX ?? 0);
    placeMesh(this.mesh, sx, yy, this.sw, this.sh);
    placeMesh(this.glowMesh, sx, yy, this.sw, this.sh);
    const flip = this.dir > 0 ? -1 : 1;
    this.mesh.scale.x = this.glowMesh.scale.x = this.def.behavior === 'crawler' ? flip : 1;
  }

  #renderCreature() {
    const c = this.creature, g = this.ctx, gl = this.gctx;
    const w = this.canvas.width, h = this.canvas.height;
    // La animación interna se redibuja a 30 fps (la posición se mueve a 60): la mitad
    // de dibujo y de subida de texturas. Un destello o un cambio de camuflaje, al momento.
    const tint = this.flash > 0 ? 'flash' : this.revealed || this.sensed ? null : 'camo';
    const now = this.game.time;
    if (this.drawnAt === undefined || now - this.drawnAt >= 1 / 30 - 1e-4 || now < this.drawnAt || tint !== this.drawnTint) {
      this.drawnAt = now;
      this.drawnTint = tint;
      g.clearRect(0, 0, w, h);
      gl.clearRect(0, 0, w, h);
      c.draw(g, gl, this, now, this.game);
      tintCanvas(g, w, h, tint, this.game.room?.biome?.camo);
      this.mesh.material.map.needsUpdate = true;
      this.glowMesh.material.map.needsUpdate = true;
    }
    const [ox, oy] = c.origin(this);
    const sx = ox + (this.shakeX ?? 0);
    placeMesh(this.mesh, sx, oy, w, h);
    placeMesh(this.glowMesh, sx, oy, w, h);
    const flip = c.noFlip ? 1 : (this.dir > 0 ? 1 : -1);
    this.mesh.scale.x = this.glowMesh.scale.x = flip;
    // Agarrado a una pared o al techo (Ciervo Acorazado): el dibujo gira para que las patas
    // pisen la superficie, apoyado en ella.
    const rot = this.surfRot ?? 0;
    if (rot) {
      const k = h / 2 - this.h / 2, n = this.n;
      for (const m of [this.mesh, this.glowMesh]) m.position.set(this.cx - n.x * k, -(this.cy - n.y * k), 0);
    }
    this.mesh.rotation.z = this.glowMesh.rotation.z = rot;
    this.mesh.visible = this.glowMesh.visible = !this.submerged && !this.vanish;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.glowMesh.removeFromParent();
  }
}
