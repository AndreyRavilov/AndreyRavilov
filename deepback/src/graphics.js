// Небо, солнце и пост-обработка (свечение огней, цветокоррекция, сглаживание).
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { SMAAPass } from '../vendor/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from '../vendor/addons/postprocessing/GTAOPass.js';

// ---------- Небо ----------
export function createSkyMaterial(cloudTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(0x4a90b8) },
      horizon: { value: new THREE.Color(0xcfe3e8) },
      under: { value: new THREE.Color(0x0b2a35) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.5, 0.2) },
      uSunColor: { value: new THREE.Color(0xfff0d8) },
      uSunSize: { value: 1 },
      uClouds: { value: cloudTex },
      uHasClouds: { value: cloudTex ? 1 : 0 },
      uCover: { value: 0.45 },
      uCloudDark: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 under;
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize;
      uniform sampler2D uClouds; uniform float uHasClouds; uniform float uCover; uniform float uCloudDark; uniform float uTime;
      varying vec3 vP;
      void main() {
        vec3 d = normalize(vP);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, under, min(1.0, -h * 5.0));
        vec3 s = normalize(uSunDir);
        float sd = max(dot(d, s), 0.0);
        float above = smoothstep(-0.08, 0.02, s.y);
        // ореол у горизонта на закате
        c += uSunColor * pow(sd, 6.0) * 0.18 * above * (1.0 - smoothstep(0.0, 0.5, s.y) * 0.6);
        // облака: проекция на купол
        if (uHasClouds > 0.5 && h > 0.0) {
          vec2 cuv = d.xz / (h + 0.12) * 0.22 + vec2(uTime * 0.003, uTime * 0.0015);
          float n = texture2D(uClouds, cuv).r * 0.65 + texture2D(uClouds, cuv * 2.7 + 0.37).r * 0.35;
          float cl = smoothstep(0.62 - uCover * 0.35, 0.78 - uCover * 0.3, n) * smoothstep(0.0, 0.18, h);
          vec3 lit = mix(horizon * 1.05 + 0.06, uSunColor * 0.9 + horizon * 0.3, pow(sd, 3.0) * above);
          vec3 cc = mix(lit, lit * 0.45, uCloudDark);
          c = mix(c, cc, cl * 0.88);
        }
        // луна — напротив солнца, видна после заката
        vec3 m = normalize(vec3(-s.x, abs(s.y) * 0.8 + 0.25, -s.z));
        float md = max(dot(d, m), 0.0);
        float night = 1.0 - smoothstep(-0.15, 0.05, s.y);
        float disc = smoothstep(0.99975, 0.9999, md);
        float crater = 0.85 + 0.15 * sin(d.x * 900.0) * sin(d.z * 800.0);
        c += vec3(0.85, 0.9, 1.0) * (disc * 0.8 * crater + pow(md, 120.0) * 0.06) * night;
        // солнечный диск поверх облаков (сквозь тонкие — виден)
        c += uSunColor * smoothstep(0.9993 - 0.0004 * uSunSize, 0.9998, sd) * 6.0 * above;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

// Направление солнца по доле дня p (0 — утро, 1 — ночь): поднимается
// невысоко, к вечеру садится за горизонт в стороне хвоста Матери.
export function sunDirection(p, out = new THREE.Vector3()) {
  const elev = THREE.MathUtils.lerp(0.62, -0.2, Math.pow(Math.min(1, p), 1.15));
  const az = THREE.MathUtils.lerp(-0.9, 0.6, p);
  return out.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
}

// ---------- Цветокоррекция и виньетка ----------
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.35 },
    uSaturation: { value: 1.08 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uUnder: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uSaturation; uniform vec3 uTint;
    uniform float uUnder; uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      // под водой картинка чуть «плывёт»
      uv += uUnder * vec2(sin(uv.y * 18.0 + uTime * 1.7), cos(uv.x * 14.0 + uTime * 1.3)) * 0.0025;
      vec4 c = texture2D(tDiffuse, uv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation) * uTint;
      float v = smoothstep(0.85, 0.2, distance(vUv, vec2(0.5)));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = c;
    }`,
};

// ---------- Лучи солнца: радиальное размытие ярких пикселей к солнцу ----------
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uColor: { value: new THREE.Color(1, 0.9, 0.7) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStrength; uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.001) { gl_FragColor = base; return; }
      vec2 d = (uSun - vUv) / 28.0;
      vec2 uv = vUv;
      float acc = 0.0;
      float w = 1.0;
      for (int i = 0; i < 28; i++) {
        uv += d;
        vec3 s = texture2D(tDiffuse, uv).rgb;
        float l = max(0.0, dot(s, vec3(0.299, 0.587, 0.114)) - 0.85);
        acc += l * w;
        w *= 0.95;
      }
      float fall = 1.0 - smoothstep(0.0, 0.9, distance(vUv, uSun));
      gl_FragColor = vec4(base.rgb + uColor * acc * 0.09 * uStrength * fall, base.a);
    }`,
};

// ---------- Пост-обработка с уровнями качества ----------
export const QUALITY = {
  low: { composer: false, smaa: false, bloom: false, shadows: false, shadowSize: 512, pixelRatio: 1 },
  medium: { composer: true, smaa: false, bloom: true, shadows: true, shadowSize: 1024, pixelRatio: 1.5 },
  high: { composer: true, smaa: true, bloom: true, shadows: true, shadowSize: 2048, pixelRatio: 2, ao: true },
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.level = null;
  }

  setQuality(level, sun) {
    const q = QUALITY[level] || QUALITY.high;
    this.level = level;
    this.q = q;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    r.shadowMap.enabled = q.shadows;
    if (sun) {
      sun.castShadow = q.shadows;
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    if (this.composer) {
      this.composer.dispose?.();
      this.composer = null;
    }
    if (q.composer) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const c = new EffectComposer(r);
      c.addPass(new RenderPass(this.scene, this.camera));
      // затенение в углах и щелях: стыки домов с землёй, складки кожи, проулки
      this.ao = null;
      if (q.ao) {
        this.ao = new GTAOPass(this.scene, this.camera, w, h);
        this.ao.output = GTAOPass.OUTPUT.Default;
        this.ao.blendIntensity = 0.85;
        this.ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.5, thickness: 2.5, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
        this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        c.addPass(this.ao);
      }
      if (q.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.86);
        c.addPass(this.bloom);
      }
      this.rays = q.smaa ? new ShaderPass(GodRaysShader) : null;
      if (this.rays) c.addPass(this.rays);
      this.grade = new ShaderPass(GradeShader);
      c.addPass(this.grade);
      c.addPass(new OutputPass());
      if (q.smaa) c.addPass(new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
      this.composer = c;
    }
    this.resize();
  }

  // Ночью рисуем не открытый мир, а зал Ковчега
  setScene(scene) {
    this.scene = scene;
    if (this.composer) this.composer.passes[0].scene = scene;
    if (this.ao) this.ao.scene = scene;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }

  // under: 0..1 — насколько камера под водой; tint — цветокоррекция кадра
  render(dt, { under = 0, time = 0, tint = null, bloom = null, sun = null } = {}) {
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const u = this.grade.uniforms;
    u.uUnder.value = under;
    u.uTime.value = time;
    if (tint) u.uTint.value.copy(tint);
    if (this.bloom && bloom !== null) this.bloom.strength = bloom;
    if (this.rays) {
      // sun: { x, y } в экранных координатах 0..1 и сила лучей
      const r = this.rays.uniforms;
      r.uStrength.value = sun ? sun.k : 0;
      if (sun) {
        r.uSun.value.set(sun.x, sun.y);
        r.uColor.value.copy(sun.color);
      }
    }
    this.composer.render(dt);
  }
}

// ---------- Каустика: пляшущие блики света на всём, что под водой ----------
export const CAUSTICS = {
  uLevel: { value: 3 },
  uCTime: { value: 0 },
  uCStrength: { value: 0.6 },
  uCColor: { value: new THREE.Color(0x9fe8ff) },
};

export function addCaustics(mat, { wet = false } = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CAUSTICS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPosC;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPosC = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPosC;
        uniform float uLevel; uniform float uCTime; uniform float uCStrength; uniform vec3 uCColor;
        float causticAt(vec2 p, float t) {
          vec2 i = p; float c = 1.0; float inten = 0.005;
          for (int n = 0; n < 4; n++) {
            float tt = t * (1.0 - (3.5 / float(n + 1)));
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
            vec2 q = vec2(p.x / (sin(i.x + tt) / inten + 1e-4), p.y / (cos(i.y + tt) / inten + 1e-4));
            c += 1.0 / max(length(q), 1e-3);
          }
          c = clamp(c / 4.0, 0.0, 2.0); c = 1.17 - pow(c, 1.4);
          return clamp(pow(abs(c), 8.0), 0.0, 1.5);
        }`)
      .replace('#include <color_fragment>', wet ? `#include <color_fragment>
        // мокрая полоса у кромки воды: темнее и с бликом
        float aboveW = vWPosC.y - uLevel;
        float wetK = aboveW > -0.2 ? 1.0 - smoothstep(0.0, 2.4, aboveW) : 0.0;
        diffuseColor.rgb *= mix(1.0, 0.62, wetK);` : '#include <color_fragment>')
      .replace('#include <roughnessmap_fragment>', wet ? `#include <roughnessmap_fragment>
        roughnessFactor *= mix(1.0, 0.3, wetK);` : '#include <roughnessmap_fragment>')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float depthC = uLevel - vWPosC.y;
        if (depthC > 0.0 && uCStrength > 0.001) {
          // блики падают сверху: на крыши и спину — да, на отвесные бока и брюхо — нет
          vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float upK = smoothstep(0.25, 0.8, nW.y);
          float k = smoothstep(0.0, 1.5, depthC) * exp(-depthC * 0.08) * upK;
          float cs = causticAt(vWPosC.xz * 0.35, uCTime * 0.6);
          gl_FragColor.rgb += uCColor * cs * k * uCStrength;
        }`);
  };
  mat.customProgramCacheKey = () => (wet ? 'caustics-wet' : 'caustics');
  mat.needsUpdate = true;
}
