// Океан. Волны считаются на видеокарте по той же формуле, что и waveAt()
// (её использует физика), так что картинка и плавание совпадают.
// В шейдере: отражение неба по Френелю, блик солнца, мелкая рябь,
// бирюзовое мелководье над спиной Матери и пена там, где вода её касается.
import * as THREE from 'three';
import { WHALE } from './whale.js';

const SIZE = 1600;
const SEG = 180;
const STEP = SIZE / SEG;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float t = uTime;
  float h = uAmp * (0.55 * sin(wp.x * 0.045 + t * 0.9) + 0.4 * sin(wp.z * 0.06 - t * 1.1) + 0.25 * sin((wp.x + wp.z) * 0.11 + t * 1.7));
  float dx = uAmp * (0.55 * 0.045 * cos(wp.x * 0.045 + t * 0.9) + 0.25 * 0.11 * cos((wp.x + wp.z) * 0.11 + t * 1.7));
  float dz = uAmp * (0.4 * 0.06 * cos(wp.z * 0.06 - t * 1.1) + 0.25 * 0.11 * cos((wp.x + wp.z) * 0.11 + t * 1.7));
  wp.y += h;
  vNormalW = normalize(vec3(-dx, 1.0, -dz));
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uWhale; // a, b, H
uniform sampler2D uDetail;
uniform float uHasDetail;
uniform float uGlow;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <fog_pars_fragment>

float taper(float zn) { float t = clamp((zn - 0.3) / 0.7, 0.0, 1.0); return 1.0 - 0.55 * t * t * (3.0 - 2.0 * t); }
float detail(vec2 p) { return uHasDetail > 0.5 ? texture2D(uDetail, p).r : 0.5 + 0.25 * sin(p.x * 40.0) * sin(p.y * 37.0); }

void main() {
  // мелкая рябь: два слоя, бегущие в разные стороны
  vec2 p1 = vWorld.xz * 0.035 + vec2(uTime * 0.020, uTime * 0.013);
  vec2 p2 = vWorld.xz * 0.090 - vec2(uTime * 0.017, -uTime * 0.024);
  float e = 0.004;
  float h1 = detail(p1), h2 = detail(p2);
  vec2 g = vec2(detail(p1 + vec2(e, 0.0)) - h1 + detail(p2 + vec2(e, 0.0)) - h2,
                detail(p1 + vec2(0.0, e)) - h1 + detail(p2 + vec2(0.0, e)) - h2) / e;
  vec3 n = normalize(vNormalW + vec3(-g.x, 0.0, -g.y) * 0.012);

  vec3 V = normalize(cameraPosition - vWorld);
  bool under = cameraPosition.y < vWorld.y - 0.05;
  if (under) n = -n;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);

  // глубина воды над спиной Матери
  float zn = vWorld.z / uWhale.y;
  float ax = uWhale.x * taper(zn);
  float u = (vWorld.x / ax) * (vWorld.x / ax) + zn * zn;
  float back = u < 1.0 ? uWhale.z * sqrt(1.0 - u) : -1000.0;
  float over = vWorld.y - back;
  float shallow = u < 1.0 ? smoothstep(7.0, 0.0, over) : 0.0;

  vec3 base = mix(uDeep, uShallow, 0.08 + 0.22 * h1);
  // крупные пятна: тени облаков и полосы течений, медленно плывут
  float big = detail(vWorld.xz * 0.0035 + vec2(uTime * 0.002, uTime * 0.0013));
  float band = detail(vec2(vWorld.x * 0.0012, vWorld.z * 0.006) + vec2(-uTime * 0.001, 0.0));
  base *= 0.82 + 0.3 * big;
  base = mix(base, uShallow * 0.9, smoothstep(0.62, 0.8, band) * 0.18);
  base = mix(base, uShallow * 1.3, shallow * 0.7);
  vec3 col = mix(base, uSky, clamp(fres * 0.9, 0.0, 1.0));

  // солнце
  vec3 H = normalize(normalize(uSunDir) + V);
  float spec = pow(max(dot(n, H), 0.0), 220.0) * 2.2 + pow(max(dot(n, H), 0.0), 24.0) * 0.08;
  // солнечные искры на ряби
  float glint = step(0.93, detail(vWorld.xz * 0.6 + vec2(uTime * 0.3, -uTime * 0.25)));
  spec += glint * pow(max(dot(n, H), 0.0), 260.0) * 1.2 * smoothstep(0.1, 0.3, normalize(uSunDir).y);
  col += uSunColor * spec;

  // пена у кромки, где Мать выходит из воды, и на гребнях
  float fn = detail(vWorld.xz * 0.18 + vec2(uTime * 0.06, -uTime * 0.04));
  // кромка у Матери — узкая рваная полоса; на пологой спине иначе пена разливается полем
  // ширина кромки — в метрах по горизонтали: высоту над спиной делим на крутизну склона;
  // где вода затапливает пологую макушку, пены нет вовсе
  float sq = sqrt(max(1.0 - u, 1e-3));
  vec2 gu = vec2(2.0 * vWorld.x / (ax * ax), 2.0 * zn / uWhale.y);
  float slope = uWhale.z / (2.0 * sq) * length(gu);
  float dist = abs(over) / max(slope, 0.02);
  float shore = u < 1.08 ? smoothstep(1.6, 0.0, dist) * (0.55 + 0.45 * smoothstep(0.35, 0.6, fn)) : 0.0;
  float crest = smoothstep(0.78, 0.95, h1 + (vNormalW.y < 0.985 ? 0.1 : 0.0)) * 0.25;
  // пенные полосы по ветру: тянутся вдоль x, рвутся мелким шумом
  float sn = detail(vec2(vWorld.x * 0.01, vWorld.z * 0.05) + vec2(uTime * 0.01, 0.0));
  float streak = smoothstep(0.8, 0.86, sn) * (1.0 - smoothstep(0.86, 0.92, sn)); // тонкая нить, а не пятно
  crest += streak * smoothstep(0.55, 0.75, h2) * 0.12;
  float foam = clamp(shore * smoothstep(0.30, 0.65, fn + shore * 0.25) + crest * fn, 0.0, 1.0);
  // пена освещена как всё остальное: ночью она серо-синяя, а не белая
  float lit = 0.18 + 0.82 * clamp(dot(uSunColor, vec3(0.3, 0.5, 0.2)) * 1.2, 0.0, 1.0);
  col = mix(col, vec3(0.90, 0.95, 0.97) * lit + uSky * 0.15, foam * 0.9);

  // светящееся море: гребни и пена горят голубым, по ряби — искры планктона
  if (uGlow > 0.001) {
    float spark = step(0.9, detail(vWorld.xz * 0.45 + vec2(uTime * 0.05, uTime * 0.03)));
    col += vec3(0.15, 0.85, 1.0) * uGlow * (foam * 1.6 + crest * 2.5 + spark * 0.5 + smoothstep(0.6, 0.9, h2) * 0.25);
  }
  float alpha = mix(0.84, 0.97, fres);
  alpha = max(alpha, foam);
  if (under) {
    // снизу: под острым углом поверхность зеркалит тёмную толщу (полное отражение),
    // а прямо над головой светится «окно Снелла» с бликами солнца
    float up = max(dot(n, V), 0.0);
    float window = smoothstep(0.6, 0.85, up);
    float ring = smoothstep(0.55, 0.62, up) * (1.0 - smoothstep(0.62, 0.7, up));
    col = mix(uDeep * 0.55, uSky * 0.6 + uSunColor * 0.08, window);
    col += uShallow * ring * 0.35 * (0.6 + h1);
    alpha = 0.92;
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Ocean {
  constructor(scene, { detail = null } = {}) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uAmp: { value: 1 },
          uDeep: { value: new THREE.Color(0x0f4656) },
          uShallow: { value: new THREE.Color(0x2c8f8a) },
          uSky: { value: new THREE.Color(0xbfd8e2) },
          uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3) },
          uSunColor: { value: new THREE.Color(0xfff0d8) },
          uWhale: { value: new THREE.Vector3(WHALE.a, WHALE.b, WHALE.H) },
          uDetail: { value: detail },
          uHasDetail: { value: detail ? 1 : 0 },
          uGlow: { value: 0 },
        },
      ]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      fog: true,
    });
    // совместимость: старый код красил океан через mat.color
    this.mat.color = this.mat.uniforms.uDeep.value;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.level = 3;
    this.amp = 1;
    this.t = 0;
  }

  setDetail(tex) {
    this.mat.uniforms.uDetail.value = tex;
    this.mat.uniforms.uHasDetail.value = tex ? 1 : 0;
  }

  waveAt(x, z, t = this.t) {
    return this.amp * (
      0.55 * Math.sin(x * 0.045 + t * 0.9) +
      0.4 * Math.sin(z * 0.06 - t * 1.1) +
      0.25 * Math.sin((x + z) * 0.11 + t * 1.7)
    );
  }

  surfaceAt(x, z) {
    return this.level + this.waveAt(x, z);
  }

  update(t, level, cx, cz) {
    this.t = t;
    this.level = level;
    const ox = Math.round(cx / STEP) * STEP;
    const oz = Math.round(cz / STEP) * STEP;
    this.mesh.position.set(ox, level, oz);
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uAmp.value = this.amp;
  }
}
