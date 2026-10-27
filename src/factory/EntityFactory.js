import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { LEVELS, START } from '../data/levels.js';
import { BIOMES } from '../data/biomes.js';
import { ENEMIES } from '../data/enemies.js';
import { DNA_CHARS } from '../data/mutations.js';
import { TileWorld, TILE } from '../core/Physics.js';
import { canvasTexture } from '../core/Sprites.js';
import { paintRoom, findHoles, paintMembraneGroup, paintPhotoTexture } from './TilePainter.js';
import { Enemy } from '../entities/Enemy.js';
import { Pickup } from '../entities/Pickup.js';
import { Womb } from '../entities/Womb.js';
import { FluidPool, Mouth, Drip } from '../entities/Hazards.js';
import { Spout, Sink, Bladder } from '../entities/Sluice.js';
import { Lamp } from '../entities/Lamp.js';
import { Hook } from '../entities/Hook.js';
import { roomConnections } from '../data/connections.js';
import { LinkPoint } from '../entities/Link.js';
import { BloodPool, Artery, HeartValve, Ventricle } from '../entities/Blood.js';
import { BoneTrap, Wind, BoneSlab, BoneFang, BonePillar, BoneStack, BoneCluster } from '../entities/Traps.js';
import { Bellows } from '../entities/Bellows.js';
import { Nodule } from '../entities/Nodule.js';
import { YolkSac } from '../entities/YolkSac.js';
import { Gate, Pad, PodChain, Valve, Float, Mover, PhotoMembrane, buildFangs } from '../entities/Puzzles.js';
import { Face } from '../entities/Face.js';
import { Veil, veilGroups } from '../entities/Veil.js';
import { Decor, ElectricWall, neuronPairs } from '../entities/Decor.js';

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
    for (const ex of roomConnections(LEVELS[r])) if (depth[ex.to] === undefined) { depth[ex.to] = depth[r] + 1; queue.push(ex.to); }
  }
  return Math.min(1, (depth[id] ?? TIER_DEPTH) / TIER_DEPTH);
}

const PICKUP_CHARS = { b: 'biomass', B: 'battery', S: 'scrap', O: 'oxygen', H: 'heart', Q: 'cyst', h: 'tissue', u: 'plasma', g: 'thymus', '*': 'fragment', i: 'fragment', c: 'fragment', d: 'fragment', x: 'fragment', P: 'shield', C: 'regen', U: 'suppress', T: 'extender', V: 'cavity' };
// Fragmentos de tipo fijo (no dependen de la casilla, como el '*').
const FRAG_CHARS = { i: 'ocular', c: 'neural', d: 'dermal', x: 'balistico' };

// Puente entre los datos (levels/enemies) y la escena de Three.js.
// Membrana del jefe ('K'): se abre cuando ha caído el jefe de la zona (cualquier jefe del
// bioma de la sala, o el que diga la sala en bossSeal). La usa también Game al vencerlo.
export function zoneBossDown(st, def) {
  if (def.bossSeal) return st.flags.has(`boss:${def.bossSeal}`);
  return Object.entries(ENEMIES).some(([type, e]) => e.boss && e.biome === def.biome && st.flags.has(`boss:${type}`));
}

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
    // Sala de jefe: iluminada (el combate se ve entero); def.ambient manda si la sala lo fija.
    const bossRoom = (def.enemies ?? []).some((e) => ENEMIES[e.type]?.boss);
    // (con el tono del bioma, subido hasta que su canal más fuerte llegue a 1: en los biomas
    // muy oscuros, multiplicar se quedaba corto)
    const lit = 1 / Math.max(0.05, ...biome.ambient);
    const ambient = def.ambient ?? (bossRoom ? biome.ambient.map((v) => Math.min(1, Math.max(v * 2.6, v * lit))) : biome.ambient);
    const room = { id, def, world, biome, ambient, enemies: [], pickups: [], anchors: [], nodes: [], photo: [], meshes: [], tier: roomTier(id) };
    const hidden = new Set((def.hidden ?? []).map(([x, y]) => `${x},${y}`));
    const photoSeen = new Set();
    // Velo de membrana: capa propia (def.veil) por delante; no cambia la casilla de debajo.
    const veilCells = new Set((def.veil ?? []).filter(([x, y]) => x >= 0 && y >= 0 && x < world.w && y < world.h).map(([x, y]) => `${x},${y}`));

    for (let cy = 0; cy < world.h; cy++) {
      for (let cx = 0; cx < world.w; cx++) {
        if (world.get(cx, cy) === 'z') world.set(cx, cy, 'f');  // antigua pared falsa
        if (world.get(cx, cy) === 'Z') world.set(cx, cy, 'K');  // antigua membrana del Rostro
        const c = world.get(cx, cy);
        const center = { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
        const key = `${id}:${cx},${cy}`;
        if (c === 'G') {
          veilCells.add(`${cx},${cy}`);
          world.set(cx, cy, '.');
        } else if ((c === 'X' || c === 'Y') && g.state.broken.has(key)) {
          world.set(cx, cy, '.');
        } else if (c === 'K' && zoneBossDown(g.state, def)) {
          world.set(cx, cy, '.');                          // el jefe de la zona ya cayó
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
            key, mutation: DNA_CHARS[c], hidden: hidden.has(`${cx},${cy}`), frag: FRAG_CHARS[c] ?? fixedFrag(biome, cx, cy),
          }));
        }
      }
    }

    // Eventos de texto (editor): zonas que lanzan un diálogo o un aviso al entrar.
    room.texts = (def.texts ?? []).map((d, i) => ({ def: d, key: `text:${id}:${i}`, inside: false }));
    // Sala de un jefe ya vencido: la sombra que la inundaba se ha retirado (Game: cleanse).
    room.cleansed = (def.enemies ?? []).some((e, i) => ENEMIES[e.type]?.boss && g.state.bosses.has(`${id}:${i}`));
    room.cleanse = room.cleansed ? 1 : 0;
    (def.enemies ?? []).forEach((e, i) => {
      const key = `${id}:${i}`;
      if (g.state.slain.has(key)) return; // sigue muerto hasta que descanses
      if (g.state.bosses.has(key)) return; // los jefes no vuelven nunca
      if (e.type === 'espora' && g.state.flags.has('sporesCleared')) return; // la plaga murió con su madre
      const enemy = this.createEnemy(e.type, e.x, e.y, world);
      enemy.key = key;
      if (e.crawl) enemy.crawl = e.crawl; // recorrido por las paredes (Matriarca)
      if (e.noDna) enemy.noDna = true;     // en esta sala no suelta su ADN (p. ej. un jefe en otro mapa)
      // Orientado en el editor (techo o pared): se pega a esa superficie.
      if (ENEMIES[e.type]?.rotatable && (e.side || e.invert)) enemy.setAnchor(e.side ?? 'techo', e.x, e.y);
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
        key, frag: FRAG_CHARS[d.item] ?? fixedFrag(biome, d.x, d.y), mutation: DNA_CHARS[d.item],
      });
      room.pickups.push(pk);
      if (!g.state.flags.has(`boss:${d.until}`)) room.sacs.push(new YolkSac(g, d, pk));
    }
    // Luminarias colgantes: luz tenue que se ve aunque tu ojo esté apagado.
    room.lamps = (def.lamps ?? []).map((d) => new Lamp(g, d, def.biome));
    // Garfios de hueso donde se engancha el Tendón (casillas 'o').
    room.hooks = room.anchors.map((a) => new Hook(g, a));
    // Puntos de conexión (entities/Link.js): llevan a otro punto, en esta sala o en otra.
    room.links = (def.links ?? []).map((d) => new LinkPoint(g, d, world));
    // Nódulos óseos (vuelven a crecer al descansar en un Nodo).
    room.nodules = (def.nodules ?? [])
      .filter(([x, y]) => !g.state.nodules.has(`${id}:${x},${y}`))
      .map(([x, y, kind]) => new Nodule(g, [x, y], def.biome, `${id}:${x},${y}`, kind));
    const pools = (def.fluids ?? []).map((d) => new FluidPool(g, d));
    // (las válvulas se crean dentro de la lista de peligros; los surtidores ligados a una
    // válvula, `valve`, la buscan aquí)
    const valves = [];
    // Mecanismos (entities/Puzzles.js): compuertas, ganglios, sacos en orden, válvulas
    // y balsas. room.targets: lo que se puede reventar a tiros o a golpes.
    room.targets = [];
    room.gates = {};
    for (const d of def.gates ?? []) room.gates[d.id] = new Gate(g, room, d, pools[d.pool]);
    // Decoración (y los muros eléctricos de las neuronas enfrentadas).
    const decors = (def.decor ?? []).map((d, i) => new Decor(g, room, d, i));
    room.hazards = [
      ...pools,
      // Sistema circulatorio (entities/Blood.js): charcas que laten, arterias, válvulas y ventrículos.
      ...(def.blood ?? []).map((d) => new BloodPool(g, d)),
      ...(def.arteries ?? []).map((d) => new Artery(g, d)),
      ...(def.heartValves ?? []).map((d) => new HeartValve(g, room, d)),
      ...(def.ventricles ?? []).map((d) => new Ventricle(g, d)),
      ...(def.mouths ?? []).map((d) => new Mouth(g, d, world)),
      ...(def.drips ?? []).map((d) => new Drip(g, d)),
      // Empalizadas de hueso y corrientes de aire (entities/Traps.js).
      ...(def.traps ?? []).map((d) => new BoneTrap(g, room, d)),
      ...(def.slabs ?? []).map((d) => new BoneSlab(g, room, d)),
      ...(def.fangs ?? []).map((d) => new BoneFang(g, room, d)),
      ...(def.pillars ?? []).map((d) => new BonePillar(g, room, d)),
      ...(def.stacks ?? []).map((d) => new BoneStack(g, room, d)),
      ...(def.clusters ?? []).map((d) => new BoneCluster(g, room, d)),
      ...(def.winds ?? []).map((d) => new Wind(g, room, d)),
      ...(def.bellows ?? []).map((d) => new Bellows(g, room, d)),
      ...Object.values(room.gates),
      ...(def.pads ?? []).map((d) => new Pad(g, room, d)),
      ...(def.pods ? [new PodChain(g, room, def.pods)] : []),
      ...(def.valves ?? []).map((d) => { const v = new Valve(g, room, d, pools[d.pool], pools[d.pool2]); valves.push(v); return v; }),
      // Surtidores (cataratas de ácido) y sumideros que muestran cómo se llenan y vacían.
      ...(def.spouts ?? []).map((d) => new Spout(g, room, d, pools[d.pool], valves[d.valve])),
      ...(def.sinks ?? []).map((d) => new Sink(g, room, d, pools[d.pool])),
      ...(def.bladders ?? []).map((d) => new Bladder(g, room, d, pools[d.pool], pools[d.chamber])),
      ...(def.floats ?? []).map((d) => new Float(g, room, d, pools[d.pool])),
      ...(def.movers ?? []).map((d) => new Mover(g, room, d)),
      ...buildFangs(g, world), // colmillos animados de púas y abismos
      // Rostros del Anfitrión (lore): hablan, se liberan y abren las membranas Z.
      ...(def.faces ?? []).map((d) => new Face(g, room, d)),
      // Decoración (editor): estructuras animadas del sistema nervioso.
      ...decors,
      ...neuronPairs(def.decor ?? []).map((p) => new ElectricWall(g, decors[p.floor], decors[p.ceil])),
      // Velos de membrana: capas translúcidas por delante de todo.
      ...veilGroups(veilCells).map((cells, i) => new Veil(g, room, cells, i)),
    ];
    this.#paint(room);
    // Membranas fotosensibles: piezas animadas con la textura de su bioma (justo tras
    // pintar la sala, que deja preparado el material).
    for (const m of room.photo) m.view = new PhotoMembrane(g, room, m, paintPhotoTexture(world, m.cells));
    g.visual.setRoomSolids(world);
    g.visual.setBiome(def.biome ?? 'nervioso', biome, def.backdrop ?? 1);
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
      if ((kind !== 'X' && kind !== 'Y' && kind !== 'K') || seen.has(`${cx},${cy}`)) continue;
      const cells = room.world.floodFill(cx, cy);
      cells.forEach(([x, y]) => seen.add(`${x},${y}`));
      const p = paintMembraneGroup(cells, kind === 'Y' ? 'seal' : kind === 'K' ? 'boss' : 'crack');
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

  }

  // Tras romper membranas: repinta y actualiza las sombras.
  refresh(room) {
    room.holes = findHoles(room.world);   // un hueco recién abierto en techo o suelo ya echa corriente
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
    for (const l of room.links ?? []) l.dispose();
    for (const s of room.sacs ?? []) if (s.alive) s.dispose();
    for (const m of room.photo ?? []) m.view?.dispose();
    for (const p of room.pickups) p.dispose();
  }
}
