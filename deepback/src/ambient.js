// Живой мир: чайки, дым из труб, пузыри и взвесь под водой, лучи света в толще воды.
import * as THREE from 'three';

// Мягкое круглое пятно для частиц
function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function rayTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)');
  h.addColorStop(0.5, 'rgba(0,0,0,0)');
  h.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

// Облако частиц с собственным размером и прозрачностью у каждой
class Particles {
  constructor(scene, max, { tex, color = 0xffffff, additive = false, sizeScale = 300 }) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTex: { value: tex }, uColor: { value: new THREE.Color(color) }, uScale: { value: sizeScale } }]),
      vertexShader: `attribute float size; attribute float alpha; varying float vAlpha; uniform float uScale;
        #include <fog_pars_vertex>
        void main(){ vAlpha = alpha; vec4 mvPosition = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * uScale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; varying float vAlpha;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vAlpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, size) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.age[i] = 0;
    this.size[i] = size;
    this.alpha[i] = 0;
  }

  // shape(age01) -> { alpha, grow }
  update(dt, shape, drag = 0) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      if (k >= 1) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      const s = shape(k);
      this.alpha[i] = s.alpha;
      this.size[i] *= 1 + s.grow * dt;
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= 1 - drag * dt;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

// Чайка: тушка и два крыла
function makeGull(mat, darkMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
  body.scale.set(0.8, 0.7, 2);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
  head.position.set(0, 0.08, -0.42);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 5), new THREE.MeshStandardMaterial({ color: 0xe0a030 }));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.06, -0.58);
  g.add(beak);
  const wings = [];
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(s * 0.9, 0.12);
    shape.lineTo(s * 1.25, -0.1);
    shape.lineTo(s * 0.35, -0.28);
    shape.lineTo(0, -0.22);
    const wg = new THREE.ShapeGeometry(shape);
    wg.rotateX(-Math.PI / 2);
    const w = new THREE.Group();
    const wm = new THREE.Mesh(wg, mat);
    w.add(wm);
    const tip = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.18).rotateX(-Math.PI / 2), darkMat);
    tip.position.set(s * 1.05, 0.005, 0.0);
    w.add(tip);
    g.add(w);
    wings.push(w);
  }
  g.userData.wings = wings;
  g.traverse((c) => c.isMesh && (c.castShadow = true));
  return g;
}

export class Ambient {
  constructor(scene) {
    this.scene = scene;
    const dot = softDot();
    this.smoke = new Particles(scene, 260, { tex: dot, color: 0xc9c4bb, sizeScale: 420 });
    this.bubbles = new Particles(scene, 180, { tex: dot, color: 0xdff6ff, additive: true, sizeScale: 160 });
    this.snow = new Particles(scene, 400, { tex: dot, color: 0xa8d0d8, additive: true, sizeScale: 90 });
    this.spray = new Particles(scene, 300, { tex: dot, color: 0xf0f8ff, sizeScale: 260 });

    // чайки
    const gm = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8, side: THREE.DoubleSide });
    const dm = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.8, side: THREE.DoubleSide });
    this.gulls = [];
    for (let i = 0; i < 14; i++) {
      const g = makeGull(gm, dm);
      g.userData.r = 25 + Math.random() * 60;
      g.userData.h = 26 + Math.random() * 22;
      g.userData.speed = (0.12 + Math.random() * 0.12) * (Math.random() < 0.5 ? 1 : -1);
      g.userData.a = Math.random() * Math.PI * 2;
      g.userData.cz = (Math.random() - 0.5) * 120;
      g.userData.ph = Math.random() * 6;
      g.scale.setScalar(1.3);
      scene.add(g);
      this.gulls.push(g);
    }

    // лучи света в толще воды
    const rt = rayTexture();
    this.rays = new THREE.Group();
    const rm = new THREE.MeshBasicMaterial({ map: rt, color: 0x9fe6ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.rayMat = rm;
    for (let i = 0; i < 9; i++) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(3 + Math.random() * 5, 40), rm);
      pl.geometry.translate(0, -20, 0);
      pl.userData.off = new THREE.Vector3((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40);
      pl.userData.ph = Math.random() * 6;
      pl.rotation.z = (Math.random() - 0.5) * 0.25;
      this.rays.add(pl);
    }
    this.rays.visible = false;
    scene.add(this.rays);
    this.smokeT = 0;
    this.bubbleT = 0;
    this.snowT = 0;
  }

  // ctx: { time, p (0 утро .. 1 ночь), camera, player, underK, chimneys, surface(x,z), weather, blowing, blowhole }
  update(dt, ctx) {
    const { time, p, camera, player, underK, chimneys = [], weather } = ctx;
    const wind = ctx.wind || { x: 0, z: 0 };

    // чайки: днём кружат над городом, в шторм и ночью прячутся
    const showGulls = p < 0.75 && weather !== 'storm';
    for (const g of this.gulls) {
      g.visible = showGulls;
      if (!showGulls) continue;
      const u = g.userData;
      u.a += u.speed * dt;
      const x = Math.cos(u.a) * u.r;
      const z = u.cz + Math.sin(u.a) * u.r * 1.4;
      const y = u.h + Math.sin(time * 0.6 + u.ph) * 2;
      g.position.set(x, y, z);
      // смотрит по касательной к окружности
      g.rotation.set(0, Math.atan2(-Math.sin(u.a) * Math.sign(u.speed), -Math.cos(u.a) * 1.4 * Math.sign(u.speed)), Math.sign(u.speed) * 0.35);
      const flap = Math.sin(time * 6 + u.ph);
      const glide = Math.sin(time * 0.4 + u.ph) > 0.3 ? 0.15 : 1;
      g.userData.wings[0].rotation.z = -flap * 0.55 * glide;
      g.userData.wings[1].rotation.z = flap * 0.55 * glide;
    }

    // дым из труб, сносимый ветром
    this.smokeT -= dt;
    if (this.smokeT <= 0 && chimneys.length && underK < 0.5) {
      this.smokeT = 0.12;
      const c = chimneys[Math.floor(Math.random() * chimneys.length)];
      if (c.y > ctx.surface(c.x, c.z) + 0.5) {
        this.smoke.spawn(c.x, c.y, c.z, wind.x * 0.4 + (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.4, wind.z * 0.4 + (Math.random() - 0.5) * 0.3, 5 + Math.random() * 2, 0.8);
      }
    }
    this.smoke.mat.uniforms.uColor.value.setRGB(0.78 - p * 0.5, 0.76 - p * 0.5, 0.73 - p * 0.5);
    this.smoke.update(dt, (k) => ({ alpha: Math.min(1, k * 6) * (1 - k) * 0.45, grow: 0.35 }), 0.1);

    // пузыри от шлема под водой
    this.bubbleT -= dt;
    if (player && player.headUnder && this.bubbleT <= 0) {
      this.bubbleT = 0.18 + Math.random() * 0.25;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        this.bubbles.spawn(player.pos.x + (Math.random() - 0.5) * 0.3, player.pos.y + 1.9, player.pos.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 1.6 + Math.random(), (Math.random() - 0.5) * 0.3, 3.5, 0.12 + Math.random() * 0.12);
      }
    }
    this.bubbles.update(dt, (k) => ({ alpha: (1 - k) * 0.9, grow: 0.15 }));

    // взвесь в воде вокруг камеры
    this.snowT -= dt;
    if (underK > 0.3 && this.snowT <= 0) {
      this.snowT = 0.02;
      const cp = camera.position;
      this.snow.spawn(cp.x + (Math.random() - 0.5) * 40, cp.y + (Math.random() - 0.5) * 20, cp.z + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 0.2, -0.15 - Math.random() * 0.1, (Math.random() - 0.5) * 0.2, 8, 0.06 + Math.random() * 0.08);
    }
    this.snow.points.visible = underK > 0.05;
    this.snow.update(dt, (k) => ({ alpha: Math.sin(k * Math.PI) * 0.8, grow: 0 }));

    // брызги прибоя у кромки спины (если передали точки кромки)
    if (ctx.shore && underK < 0.5) {
      for (let i = 0; i < 3; i++) {
        const s = ctx.shore();
        if (s) this.spray.spawn(s.x, s.y, s.z, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 1.0, 0.25 + Math.random() * 0.3);
      }
    }
    const sprayK = Math.max(0, 1 - p * 1.3);
    this.spray.update(dt, (k) => ({ alpha: (1 - k) * 0.45 * sprayK, grow: 0.8 }), 0.5);

    // лучи света: только днём и под водой, плывут вместе с камерой
    const rays = underK > 0.3 && p < 0.8;
    this.rays.visible = rays;
    if (rays) {
      const cp = camera.position;
      const top = ctx.surface(cp.x, cp.z);
      this.rayMat.opacity = 0.16 * (1 - p);
      for (const r of this.rays.children) {
        r.position.set(cp.x + r.userData.off.x, top, cp.z + r.userData.off.z);
        r.lookAt(cp.x, top, cp.z);
        r.material.opacity = this.rayMat.opacity;
        r.scale.x = 1 + Math.sin(time * 0.5 + r.userData.ph) * 0.3;
      }
    }
  }
}
