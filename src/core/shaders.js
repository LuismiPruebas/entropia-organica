export const MAX_POINT_LIGHTS = 8;

export const compositeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Compositor final. Todo en coordenadas de mundo en píxeles con Y hacia abajo.
export const compositeFragment = /* glsl */ `
  #define PI 3.14159265
  #define TILE 16.0
  uniform sampler2D tWorld;
  uniform sampler2D tGlow;
  uniform sampler2D tSolid;
  uniform vec2 uRes;
  uniform vec2 uCam;
  uniform vec2 uRoom;
  uniform vec2 uLightPos;
  uniform float uAim;
  uniform float uConeHalf;
  uniform float uRange;
  uniform float uFlashOn;
  uniform float uLightLevel;
  uniform float uAmbR;
  uniform vec3 uAmbient;
  uniform vec3 uLightColor;
  uniform vec3 uEyeColor;
  uniform vec3 uPL[${MAX_POINT_LIGHTS}];
  uniform vec3 uPC[${MAX_POINT_LIGHTS}];
  uniform float uAberr;
  uniform float uPulse;
  uniform float uTime;
  varying vec2 vUv;

  float solidAt(vec2 p) {
    vec2 t = floor(p / TILE);
    t = clamp(t, vec2(0.0), uRoom - 1.0);
    return texture2D(tSolid, (t + 0.5) / uRoom).r;
  }

  // Sombra dura: recorre el segmento luz->píxel buscando paredes. La cara de la
  // pared que recibe la luz queda iluminada (se ignora el tile del propio píxel).
  float shadow(vec2 from, vec2 to) {
    vec2 d = to - from;
    vec2 target = floor(to / TILE);
    for (int i = 1; i < 64; i++) {
      vec2 q = from + d * (float(i) / 64.0);
      vec2 tq = floor(q / TILE);
      if (tq.x == target.x && tq.y == target.y) break;
      if (solidAt(q) > 0.5) return 0.0;
    }
    return 1.0;
  }

  float bayer(vec2 f) {
    vec2 p = mod(floor(f), 4.0);
    float i = p.x + p.y * 4.0;
    // Matriz de Bayer 4x4 aplanada.
    if (i < 1.0) return 0.0;   if (i < 2.0) return 8.0;  if (i < 3.0) return 2.0;  if (i < 4.0) return 10.0;
    if (i < 5.0) return 12.0;  if (i < 6.0) return 4.0;  if (i < 7.0) return 14.0; if (i < 8.0) return 6.0;
    if (i < 9.0) return 3.0;   if (i < 10.0) return 11.0; if (i < 11.0) return 1.0; if (i < 12.0) return 9.0;
    if (i < 13.0) return 15.0; if (i < 14.0) return 7.0; if (i < 15.0) return 13.0; return 5.0;
  }


  // Devuelve la luz que recibe el píxel; en 'hazeCol' deja el brillo volumétrico
  // del haz (el aire iluminado), que se suma aunque no haya nada detrás.
  // El color nace rojo saturado en el ojo y se aclara hacia uLightColor al alejarse.
  vec3 lightAt(vec2 p, out vec3 hazeCol) {
    float haze;
    vec2 d = p - uLightPos;
    float dist = length(d);
    // Luz de cercanía (neutra) y luz del cono (nace roja en el ojo), por separado.
    float amb = (1.0 - smoothstep(uAmbR * 0.35, uAmbR, dist)) * 0.55;
    float beam = 0.0;
    float cone = 0.0;
    haze = 0.0;
    if (uFlashOn > 0.5) {
      float a = atan(d.y, d.x);
      float da = abs(mod(a - uAim + PI, 2.0 * PI) - PI);
      float edge = 1.0 - smoothstep(uConeHalf * 0.7, uConeHalf, da);
      float fall = 1.0 - smoothstep(uRange * 0.3, uRange, dist);
      float hot = 1.0 - smoothstep(0.0, uConeHalf * 0.35, da);
      cone = edge * fall * uLightLevel;
      beam = cone * (1.35 + hot * 0.55);
      // Núcleo del haz: más denso cerca del ojo y en el eje.
      haze = cone * (0.03 + hot * 0.04) * (1.0 - smoothstep(0.0, uRange * 0.8, dist) * 0.6);
    }
    if (max(amb, beam) > 0.002) {
      float s = shadow(uLightPos, p);
      amb *= s;
      beam *= s;
      haze *= s;
    }
    vec3 lc = mix(uEyeColor, uLightColor, smoothstep(4.0, uRange * 0.55, dist));
    // El propio ojo: un punto incandescente del que nace el haz.
    float core = (1.0 - smoothstep(0.0, 7.0, dist)) * (0.15 + 0.35 * uFlashOn * uLightLevel);
    hazeCol = lc * haze + uEyeColor * core;
    vec3 col = max(uLightColor * amb, lc * beam);
    for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
      float r = uPL[i].z;
      if (r > 0.0) {
        float dd = length(p - uPL[i].xy);
        col += uPC[i] * (1.0 - smoothstep(0.0, r, dd));
      }
    }
    return col;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uCam + vec2(uv.x, 1.0 - uv.y) * uRes;

    // Luz cuantizada con tramado ordenado: transición escalonada tipo 16 bits.
    vec3 haze;
    vec3 L = lightAt(p, haze);
    float dither = bayer(gl_FragCoord.xy) / 16.0;
    L = floor(L * 6.0 + dither) / 6.0;
    L += uAmbient;
    haze = floor(haze * 14.0 + dither) / 14.0;

    // Aberración cromática muy sutil: un ribete de 1 píxel mezclado a lo sumo al 35 %
    // (uAberr 0..1), solo cuando el cuerpo flaquea y al ritmo del latido.
    vec3 base = texture2D(tWorld, uv).rgb;
    vec2 off = vec2(1.0 / uRes.x, 0.0);
    vec3 split = vec3(texture2D(tWorld, uv + off).r, base.g, texture2D(tWorld, uv - off).b);
    vec3 w = mix(base, split, clamp(uAberr, 0.0, 1.0) * 0.35);
    vec3 c = w * L;
    c += haze;
    c += texture2D(tGlow, uv).rgb;

    // Viñeta + latido rojo en los bordes.
    float v = length(uv - 0.5) * 1.35;
    float vig = 1.0 - smoothstep(0.45, 1.0, v);
    c *= mix(0.7, 1.0, vig);
    c += vec3(0.55, 0.0, 0.06) * uPulse * smoothstep(0.35, 1.0, v);

    // Sin grano animado: era un velo gris que parpadeaba en la oscuridad y lavaba el
    // color. En su lugar, un punto más de saturación (los negros siguen negros).
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    c = max(mix(vec3(luma), c, 1.18), 0.0);

    // Color de 15 bits (5 bits por canal), como la paleta de la SNES.
    c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
    gl_FragColor = vec4(c, 1.0);
  }
`;
