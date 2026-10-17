import * as THREE from '../../vendor/three.module.min.js'; // ruta directa: Safari de iOS < 16.4 no entiende import maps
import { compositeVertex, compositeFragment, MAX_POINT_LIGHTS } from './shaders.js';
import { canvasTexture } from './Sprites.js';
import { paintBackdrop, BACKDROP_SIZE, backdropKey } from '../factory/Backdrop.js';
import { Scenery } from './Scenery.js';

export const VIEW_W = 384;
export const VIEW_H = 216;

// Gestor de Escena y Luz. Dos escenas (mundo iluminado + brillo propio) que se
// renderizan a texturas de baja resolución y se combinan en un shader final.
export class Visual {
  constructor(canvas) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(VIEW_W, VIEW_H, false);

    // Cámara ortográfica: 1 unidad = 1 píxel. El juego usa Y hacia abajo, Three Y hacia arriba.
    this.camera = new THREE.OrthographicCamera(0, VIEW_W, 0, -VIEW_H, -100, 100);
    this.camera.position.z = 50;
    this.cam = { x: 0, y: 0 };

    this.world = new THREE.Scene();
    this.glow = new THREE.Scene();

    const rtOpts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
    this.rtWorld = new THREE.WebGLRenderTarget(VIEW_W, VIEW_H, rtOpts);
    this.rtGlow = new THREE.WebGLRenderTarget(VIEW_W, VIEW_H, rtOpts);

    this.#buildBackground();
    this.scenery = new Scenery(this, VIEW_W, VIEW_H);

    this.uniforms = {
      tWorld: { value: this.rtWorld.texture },
      tGlow: { value: this.rtGlow.texture },
      tSolid: { value: null },
      uRes: { value: new THREE.Vector2(VIEW_W, VIEW_H) },
      uCam: { value: new THREE.Vector2() },
      uRoom: { value: new THREE.Vector2(1, 1) },
      uLightPos: { value: new THREE.Vector2() },
      uAim: { value: 0 },
      uConeHalf: { value: Math.PI / 6 }, // cono de 60º
      uRange: { value: 170 },
      uFlashOn: { value: 1 },
      uLightLevel: { value: 1 },
      uAmbR: { value: 40 },
      uAmbient: { value: new THREE.Vector3(0.05, 0.05, 0.07) },
      uLightColor: { value: new THREE.Vector3(1, 0.9, 0.62) },
      uEyeColor: { value: new THREE.Vector3(1, 0.1, 0.08) },
      uPL: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector3()) },
      uPC: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector3()) },
      uAberr: { value: 0 },
      uPulse: { value: 0 },
      uTime: { value: 0 },
    };
    this.compositeScene = new THREE.Scene();
    this.compositeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.compositeScene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: compositeVertex,
        fragmentShader: compositeFragment,
        depthTest: false,
        depthWrite: false,
      }),
    ));
  }

  #bgTexture(id) {
    const size = this.bgSize;
    const tex = canvasTexture(paintBackdrop(id));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set((VIEW_W + size) / size, (VIEW_H + size) / size);
    return tex;
  }

  // Cambia el fondo en parallax al del bioma de la sala (con caché). variant: el fondo
  // elegido para la sala (1 = el de siempre; ver Backdrop.BACKDROP_VARIANTS).
  setBiome(biomeId, biome, variant = 1) {
    const id = backdropKey(biomeId, variant);
    if (this.biomeId === id) return;
    this.biomeId = id;
    this.bgCache ??= new Map();
    if (!this.bgCache.has(id)) this.bgCache.set(id, this.#bgTexture(id));
    this.bgTex = this.bgCache.get(id);
    this.bg.material.map = this.bgTex;
    this.bg.material.needsUpdate = true;
    this.scenery.setBiome(id);
  }

  #buildBackground() {
    const size = BACKDROP_SIZE;
    this.bgSize = size;
    const tex = this.#bgTexture('nervioso');
    const w = VIEW_W + size, h = VIEW_H + size;
    this.bgTex = tex;
    this.bg = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false }),
    );
    this.bg.renderOrder = -10;
    this.world.add(this.bg);
  }

  // Cuadrícula de sólidos de la sala para las sombras del shader.
  setRoomSolids(world) {
    const data = new Uint8Array(world.w * world.h * 4);
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const v = world.solid(x, y) ? 255 : 0;
        data.set([v, v, v, 255], (y * world.w + x) * 4);
      }
    }
    if (this.solidTex) this.solidTex.dispose();
    const tex = new THREE.DataTexture(data, world.w, world.h, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.solidTex = tex;
    this.uniforms.tSolid.value = tex;
    this.uniforms.uRoom.value.set(world.w, world.h);
  }

  // params: { lightPos, aim, flashOn, lightLevel, ambR, ambient, points, aberr, pulse, time, shake }
  render(p) {
    const cx = Math.round(this.cam.x + (p.shake?.x ?? 0));
    const cy = Math.round(this.cam.y + (p.shake?.y ?? 0));
    this.camera.position.set(cx, -cy, 50);

    this.bg.position.set(cx + VIEW_W / 2, -cy - VIEW_H / 2, -1);
    // Fondo lejano más lento que el plano medio: tres planos de profundidad.
    this.bgTex.offset.set((cx * 0.3) / this.bgSize, (-cy * 0.3) / this.bgSize);
    this.scenery.update(p.time, cx, cy);

    const u = this.uniforms;
    u.uCam.value.set(cx, cy);
    u.uLightPos.value.set(p.lightPos.x, p.lightPos.y);
    u.uAim.value = p.aim;
    u.uFlashOn.value = p.flashOn ? 1 : 0;
    u.uLightLevel.value = p.lightLevel;
    u.uAmbR.value = p.ambR;
    u.uAmbient.value.set(...p.ambient);
    u.uRange.value = p.range ?? 170;
    u.uLightColor.value.set(...p.lightColor);
    u.uEyeColor.value.set(...p.eyeColor);
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const l = p.points[i];
      if (l) {
        u.uPL.value[i].set(l.x, l.y, l.r);
        u.uPC.value[i].set(...l.color);
      } else {
        u.uPL.value[i].set(0, 0, 0);
      }
    }
    u.uAberr.value = p.aberr;
    u.uPulse.value = p.pulse;
    u.uTime.value = p.time;

    const r = this.renderer;
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.rtWorld);
    r.clear();
    r.render(this.world, this.camera);
    r.setRenderTarget(this.rtGlow);
    r.clear();
    r.render(this.glow, this.camera);
    r.setRenderTarget(null);
    r.render(this.compositeScene, this.compositeCam);
  }
}
