import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { LEVELS, START } from '../data/levels.js';
import { BIOMES } from '../data/biomes.js';
import { ENEMIES } from '../data/enemies.js';
import { DNA_CHARS } from '../data/mutations.js';
import { TileWorld, TILE } from '../core/Physics.js';
import { canvasTexture } from '../core/Sprites.js';
import { paintRoom, findHoles, paintMembraneGroup, paintFalseWallGroup, paintPhotoTexture } from './TilePainter.js';
import { Enemy } from '../entities/Enemy.js';
import { Pickup } from '../entities/Pickup.js';
import { Womb } from '../entities/Womb.js';
import { FluidPool, Mouth, Drip } from '../entities/Hazards.js';
import { Lamp } from '../entities/Lamp.js';
import { Hook } from '../entities/Hook.js';
import { BoneTrap, Wind } from '../entities/Traps.js';
import { Nodule } from '../entities/Nodule.js';
import { YolkSac } from '../entities/YolkSac.js';
import { Gate, Pad, PodChain, Valve, Float, Mover, PhotoMembrane, buildFangs } from '../entities/Puzzles.js';

// Lo hondo que está cada sala: salas de distancia desde el inicio (por las salidas),
// de 0 a 1 (TIER_DEPTH salas o más). Mide la dificultad de los patrones de disparo.
const TIER_DEPTH = 10;
// Tipo de un fragmento fijo del mapa ('*'): rota entre los del bioma según su posición.
function fixedFrag(biome, x, y) {
  const kinds = biome.fragments ?? [];
  return kinds.length ? kinds[(x * 7 + y * 3) % kinds.length] : 'neural';
}

export function roomTier(id) {
  const depth = { [START.room]: 0 }, queue = [START.room];
  while (queue.length) {
    const r = queue.shift();
    for (const ex of LEVELS[r]?.exits ?? []) if (depth[ex.to] === undefined) { depth[ex.to] = depth[r] + 1; queue.push(ex.to); }
  }
  return Math.min(1, (depth[id] ?? TIER_DEPTH) / TIER_DEPTH);
}

const PICKUP_CHARS = { b: 'biomass', B: 'battery', S: 'scrap', O: 'oxygen', H: 'heart', Q: 'cyst', h: 'tissue', g: 'thymus', '*': 'fragment', P: 'shield', C: 'regen' };

// Puente entre los datos (levels/enemies) y la escena de Three.js.
export class EntityFactory {
  constructor(game) {
    this.game = game;
  }

  buildRoom(id) {
    const def = LEVELS[id];
    if (!def) throw new Error(`Sala desconocida: ${id}`);
    const g = this.game;
    const world = new TileWorld(def.grid);
    const biome = BIOMES[def.biome] ?? BIOMES.nervioso;
    const room = { id, def, world, biome, ambient: def.ambient ?? biome.ambient, enemies: [], pickups: [], anchors: [], nodes: [], photo: [], meshes: [], tier: roomTier(id) };
    const hidden = new Set((def.hidden ?? []).map(([x, y]) => `${x},${y}`));
    const photoSeen = new Set();

    for (let cy = 0; cy < world.h; cy++) {
      for (let cx = 0; cx < world.w; cx++) {
        const c = world.get(cx, cy);
        const center = { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
        const key = `${id}:${cx},${cy}`;
        if ((c === 'X' || c === 'Y') && g.state.broken.has(key)) {
          world.set(cx, cy, '.');
        } else if (c === 'o') {
          room.anchors.push(center);
        } else if (c === 'f' && !photoSeen.has(`${cx},${cy}`)) {
          // Cada mancha conectada de tejido fotosensible se abre y cierra como una sola.
          const cells = world.floodFill(cx, cy);
          for (const [x, y] of cells) photoSeen.add(`${x},${y}`);
          room.photo.push({ cells, charge: 0, open: false, linger: 0 });
        } else if (c === 'N') {
          room.nodes.push({ x: cx * TILE, y: cy * TILE - TILE, w: TILE, h: TILE * 2, cx, cy });
        } else if (PICKUP_CHARS[c] || DNA_CHARS[c]) {
          // Un objeto sumergido sigue rodeado de ácido.
          const liquid = world.get(cx - 1, cy) === '~' || world.get(cx + 1, cy) === '~';
          world.set(cx, cy, liquid ? '~' : '.');
          if (g.state.collected.has(key)) continue;
          // Muestras de reserva (p. ej. los Alveolos del Foramen Óseo): no aparecen si
          // esa mutación ya es tuya o ya llevas su ADN latente.
          const owned = DNA_CHARS[c] && (g.state.mutations.has(DNA_CHARS[c]) || g.state.dna.has(DNA_CHARS[c]));
          if (owned) continue;
          const kind = DNA_CHARS[c] ? 'dna' : PICKUP_CHARS[c];
          room.pickups.push(new Pickup(g, kind, center.x, center.y + 3, {
            key, mutation: DNA_CHARS[c], hidden: hidden.has(`${cx},${cy}`), frag: fixedFrag(biome, cx, cy),
          }));
        }
      }
    }

    (def.enemies ?? []).forEach((e, i) => {
      const key = `${id}:${i}`;
      if (g.state.slain.has(key)) return; // sigue muerto hasta que descanses
      if (g.state.bosses.has(key)) return; // los jefes no vuelven nunca
      if (e.type === 'espora' && g.state.flags.has('sporesCleared')) return; // la plaga murió con su madre
      const enemy = this.createEnemy(e.type, e.x, e.y, world);
      enemy.key = key;
      if (e.crawl) enemy.crawl = e.crawl; // recorrido por las paredes (Matriarca)
      room.enemies.push(enemy);
    });

    // Salidas verticales: por ellas sube (o baja) una corriente de aire visible.
    room.holes = findHoles(world);
    // Los Nodos Seguros son úteros vivos que laten.
    room.wombs = room.nodes.map((n) => new Womb(g, n));
    // Peligros de fluidos (cubetas que se llenan, bocas que escupen, goteras).
    // Sacos vitelinos: guardan un objeto hasta que muere el jefe de la sala.
    room.sacs = [];
    for (const d of def.sacs ?? []) {
      const key = `${id}:${d.x},${d.y}`;
      if (g.state.collected.has(key)) continue;
      const kind = DNA_CHARS[d.item] ? 'dna' : PICKUP_CHARS[d.item];
      const pk = new Pickup(g, kind, d.x * TILE + TILE / 2, d.y * TILE + TILE / 2 + 3, {
        key, frag: fixedFrag(biome, d.x, d.y), mutation: DNA_CHARS[d.item],
      });
      room.pickups.push(pk);
      if (!g.state.flags.has(`boss:${d.until}`)) room.sacs.push(new YolkSac(g, d, pk));
    }
    // Luminarias colgantes: luz tenue que se ve aunque tu ojo esté apagado.
    room.lamps = (def.lamps ?? []).map((d) => new Lamp(g, d, def.biome));
    // Garfios de hueso donde se engancha el Tendón (casillas 'o').
    room.hooks = room.anchors.map((a) => new Hook(g, a));
    // Nódulos óseos (vuelven a crecer al descansar en un Nodo).
    room.nodules = (def.nodules ?? [])
      .filter(([x, y]) => !g.state.nodules.has(`${id}:${x},${y}`))
      .map(([x, y, kind]) => new Nodule(g, [x, y], def.biome, `${id}:${x},${y}`, kind));
    const pools = (def.fluids ?? []).map((d) => new FluidPool(g, d));
    // Mecanismos (entities/Puzzles.js): compuertas, ganglios, sacos en orden, válvulas
    // y balsas. room.targets: lo que se puede reventar a tiros o a golpes.
    room.targets = [];
    room.gates = {};
    for (const d of def.gates ?? []) room.gates[d.id] = new Gate(g, room, d);
    room.hazards = [
      ...pools,
      ...(def.mouths ?? []).map((d) => new Mouth(g, d, world)),
      ...(def.drips ?? []).map((d) => new Drip(g, d)),
      // Empalizadas de hueso y corrientes de aire (entities/Traps.js).
      ...(def.traps ?? []).map((d) => new BoneTrap(g, room, d)),
      ...(def.winds ?? []).map((d) => new Wind(g, room, d)),
      ...Object.values(room.gates),
      ...(def.pads ?? []).map((d) => new Pad(g, room, d)),
      ...(def.pods ? [new PodChain(g, room, def.pods)] : []),
      ...(def.valves ?? []).map((d) => new Valve(g, room, d, pools[d.pool])),
      ...(def.floats ?? []).map((d) => new Float(g, room, d, pools[d.pool])),
      ...(def.movers ?? []).map((d) => new Mover(g, room, d)),
      ...buildFangs(g, world), // colmillos animados de púas y abismos
    ];
    this.#paint(room);
    // Membranas fotosensibles: piezas animadas con la textura de su bioma (justo tras
    // pintar la sala, que deja preparado el material).
    for (const m of room.photo) m.view = new PhotoMembrane(g, room, m, paintPhotoTexture(world, m.cells));
    g.visual.setRoomSolids(world);
    g.visual.setBiome(def.biome ?? 'nervioso', biome);
    return room;
  }

  createEnemy(type, tx, ty, world) {
    const def = ENEMIES[type];
    if (!def) throw new Error(`Enemigo desconocido: ${type}`);
    return new Enemy(this.game, type, def, tx, ty, world ?? this.game.world);
  }

  #paint(room) {
    const v = this.game.visual;
    for (const m of room.meshes) {
      m.removeFromParent();
      if (m.material.color?.getHex() !== 0 && !room.membranes?.some((mb) => mb.mesh === m || mb.glowMesh === m)) m.material.map?.dispose();
      if (room.membranes?.length) m.geometry?.dispose();
    }
    const { color, glow, pulse } = paintRoom(room.world, room.biome);
    const W = room.world.pixelW, H = room.world.pixelH;
    const make = (canvas, additive) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({
        map: canvasTexture(canvas),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
      mesh.position.set(W / 2, -H / 2, 0);
      mesh.renderOrder = 1;
      return mesh;
    };
    const tiles = make(color, false);
    const glowMesh = make(glow, true);
    // Venas y puntos de las paredes: su opacidad late al ritmo del bioma (core/Scenery.js).
    room.pulseMesh = make(pulse, true);
    // Silueta negra de las paredes en la capa de brillo: lo luminoso del plano medio
    // (impulsos, bilis, alvéolos) queda DETRÁS de la sala en vez de encima.
    const occluder = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({
      map: tiles.material.map, color: 0x000000, transparent: true, alphaTest: 0.5, depthTest: false, depthWrite: false,
    }));
    occluder.position.copy(tiles.position);
    occluder.renderOrder = -4;
    v.world.add(tiles);
    v.glow.add(occluder, glowMesh, room.pulseMesh);
    room.meshes = [tiles, glowMesh, room.pulseMesh, occluder];

    // Membranas agrietadas (X) y esfínteres sellados (Y): una pieza viva por grupo
    // conectado, con dos fotogramas.
    for (const m of room.membranes ?? []) for (const f of m.frames) { f.tex.dispose(); f.glowTex.dispose(); }
    room.membranes = [];
    const seen = new Set();
    for (let cy = 0; cy < room.world.h; cy++) for (let cx = 0; cx < room.world.w; cx++) {
      const kind = room.world.get(cx, cy);
      if ((kind !== 'X' && kind !== 'Y') || seen.has(`${cx},${cy}`)) continue;
      const cells = room.world.floodFill(cx, cy);
      cells.forEach(([x, y]) => seen.add(`${x},${y}`));
      const p = paintMembraneGroup(cells, kind === 'Y' ? 'seal' : 'crack');
      const frames = p.frames.map((f) => ({ tex: canvasTexture(f.color), glowTex: canvasTexture(f.glow) }));
      const mk = (map, additive) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({
          map, transparent: true, depthTest: false, depthWrite: false,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        }));
        mesh.position.set(p.x + p.w / 2, -(p.y + p.h / 2), 0);
        mesh.renderOrder = 1;
        return mesh;
      };
      const mesh = mk(frames[0].tex, false), glowM = mk(frames[0].glowTex, true);
      // También tapa lo luminoso del plano de fondo.
      const occ = mk(frames[0].tex, false);
      occ.material.color.set(0x000000);
      occ.material.alphaTest = 0.5;
      occ.renderOrder = -4;
      v.world.add(mesh);
      v.glow.add(occ, glowM);
      room.meshes.push(mesh, glowM, occ);
      room.membranes.push({ mesh, glowMesh: glowM, frames, phase: Math.random() * 2 });
    }

    // Paredes falsas (z): parecen roca, pero la luz las atraviesa. Una pieza por grupo.
    room.falseWalls = [];
    const seenZ = new Set();
    for (let cy = 0; cy < room.world.h; cy++) for (let cx = 0; cx < room.world.w; cx++) {
      if (room.world.get(cx, cy) !== 'z' || seenZ.has(`${cx},${cy}`)) continue;
      const cells = room.world.floodFill(cx, cy);
      cells.forEach(([x, y]) => seenZ.add(`${x},${y}`));
      const p = paintFalseWallGroup(cells, room.world);
      const tex = canvasTexture(p.canvas);
      const mk = (color, order) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({
          map: tex, color, transparent: true, depthTest: false, depthWrite: false,
        }));
        mesh.position.set(p.x + p.w / 2, -(p.y + p.h / 2), 0);
        mesh.renderOrder = order;
        return mesh;
      };
      const mesh = mk(0xffffff, 1), occ = mk(0x000000, -4);
      v.world.add(mesh);
      v.glow.add(occ);
      room.meshes.push(mesh, occ);
      const key = `${room.id}:${cx},${cy}`;
      room.falseWalls.push({ cells, mesh, occ, key, charge: 0, revealed: this.game.state.revealedWalls.has(key) });
    }
  }

  // Tras romper membranas: repinta y actualiza las sombras.
  refresh(room) {
    this.#paint(room);
    this.game.visual.setRoomSolids(room.world);
  }

  disposeRoom(room) {
    for (const m of room.meshes) {
      m.removeFromParent();
      m.material.map?.dispose();
    }
    for (const e of room.enemies) e.dispose();
    for (const w of room.wombs ?? []) w.dispose();
    for (const h of room.hazards ?? []) h.dispose();
    for (const n of room.nodules ?? []) if (n.alive) n.dispose();
    for (const l of room.lamps ?? []) l.dispose();
    for (const h of room.hooks ?? []) h.dispose();
    for (const s of room.sacs ?? []) if (s.alive) s.dispose();
    for (const m of room.photo ?? []) m.view?.dispose();
    for (const p of room.pickups) p.dispose();
  }
}
