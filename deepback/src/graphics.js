// Небо, солнце и пост-обработка (свечение огней, цветокоррекция, сглаживание).
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { SMAAPass } from '../vendor/addons/postprocessing/SMAAPass.js';

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

// ---------- Пост-обработка с уровнями качества ----------
export const QUALITY = {
  low: { composer: false, smaa: false, bloom: false, shadows: false, shadowSize: 512, pixelRatio: 1 },
  medium: { composer: true, smaa: false, bloom: true, shadows: true, shadowSize: 1024, pixelRatio: 1.5 },
  high: { composer: true, smaa: true, bloom: true, shadows: true, shadowSize: 2048, pixelRatio: 2 },
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
      if (q.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.86);
        c.addPass(this.bloom);
      }
      this.grade = new ShaderPass(GradeShader);
      c.addPass(this.grade);
      c.addPass(new OutputPass());
      if (q.smaa) c.addPass(new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
      this.composer = c;
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }

  // under: 0..1 — насколько камера под водой; tint — цветокоррекция кадра
  render(dt, { under = 0, time = 0, tint = null, bloom = null } = {}) {
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const u = this.grade.uniforms;
    u.uUnder.value = under;
    u.uTime.value = time;
    if (tint) u.uTint.value.copy(tint);
    if (this.bloom && bloom !== null) this.bloom.strength = bloom;
    this.composer.render(dt);
  }
}
