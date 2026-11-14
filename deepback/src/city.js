// Город Ноа: Ковчег (постоянный), процедурные кварталы, припасы и пиявки.
// Город перестраивается каждый день: ночное погружение всё перемешивает.
import * as THREE from 'three';
import { WHALE, backHeight, backU, BLOWHOLE, pointOnBack } from './whale.js';
import { boxProjectUV } from './textures.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

export const STEP = 0.7;
export const HATCH = new THREE.Vector3(0, 0, 13);
HATCH.y = backHeight(HATCH.x, HATCH.z);

export const ITEM = {
  food: { name: 'Рыба', weight: 1, icon: '🐟' },
  fuel: { name: 'Бочка ворвани', weight: 3, icon: '🛢️' },
  relic: { name: 'Реликвия', weight: 1, icon: '◈' },
  scrap: { name: 'Обломки', weight: 2, icon: '⚙️' },
  keepsake: { name: 'Памятная вещь', weight: 1, icon: '🎁' },
};

const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0x5b6a70, roughness: 0.6, metalness: 0.6 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x7a4a33, roughness: 0.9, metalness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.9 }),
  rope: new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xd9d2bf, roughness: 0.7 }),
  window: new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb45a, emissiveIntensity: 0.3 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffb860, emissiveIntensity: 1.5 }),
  hatch: new THREE.MeshBasicMaterial({ color: 0x58f0d8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  fish: new THREE.MeshStandardMaterial({ color: 0x9fc3d6, roughness: 0.3, metalness: 0.6 }),
  barrel: new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.7, metalness: 0.2 }),
  relic: new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0x5ff0ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.8 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.35, depthWrite: false }),
  leech: new THREE.MeshStandardMaterial({ color: 0x2b1631, roughness: 0.35, metalness: 0.2, emissive: 0x3a0d2a, emissiveIntensity: 0.4 }),
  leechEye: new THREE.MeshBasicMaterial({ color: 0xff5a7a }),
};
M.trim = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.85 });
M.deck = new THREE.MeshStandardMaterial({ color: 0x7a5c40, roughness: 0.9 });
M.net = new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 1, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
export const MATERIALS = M;
// Текстура мягкого свечения задаётся из браузера (в Node её нет)
export const GLOW = { tex: null };

const WALLS = [0x6f5a46, 0x4f6b6a, 0x7a6a55, 0x5d4a3f, 0x3f5560, 0x8a6e4b, 0x5a5f4c];
const ROOFS = [0x7a3b2a, 0x3d4b52, 0x5b4636, 0x2f3d3a];
// Ковчег — отдельные материалы: у цилиндра свои UV, текстуре нужен свой повтор
M.arkWall = M.steel.clone();
M.arkDome = M.rust.clone();

function std(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
}
const wallMats = WALLS.map(std);
const roofMats = ROOFS.map(std);
M.walls = wallMats;
M.roofs = roofMats;

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shadow(o) {
  o.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.static = new THREE.Group();
    scene.add(this.static);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.staticColliders = [];
    this.pickups = [];
    this.leeches = [];
    this.chimneys = [];
    this.lamps = [];
    this.buildArk();
  }

  // ---------------- Ковчег ----------------
  buildArk() {
    const g = new THREE.Group();
    const base = backHeight(0, 0) - 2;
    const R = 8.5;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.6, 8, 40), M.arkWall);
    cyl.position.y = base + 4;
    g.add(cyl);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.arkDome);
    dome.position.y = base + 8;
    g.add(dome);
    for (const y of [base + 2, base + 5, base + 8]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.15, 0.22, 8, 48), M.dark);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      g.add(band);
    }
    // иллюминаторы
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), M.window);
      w.position.set(Math.sin(a) * (R + 0.05), base + 6, Math.cos(a) * (R + 0.05));
      w.lookAt(w.position.x * 2, w.position.y, w.position.z * 2);
      g.add(w);
    }
    // шлюз
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.6, 1.6), M.dark);
    door.position.set(0, base + 4.3, R + 0.2);
    g.add(door);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.35, 8, 24), M.steel);
    frame.position.set(0, base + 4.6, R + 1.0);
    g.add(frame);
    // маяк на куполе
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 8), M.steel);
    mast.position.y = base + 8 + R + 2;
    g.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), M.lamp);
    beacon.position.y = base + 8 + R + 5.2;
    g.add(beacon);
    this.beaconLight = new THREE.PointLight(0xffc070, 60, 70, 1.6);
    this.beaconLight.position.copy(beacon.position);
    g.add(this.beaconLight);
    // вращающийся луч маяка — виден в сумерках и ночью
    const beamGeo = new THREE.CylinderGeometry(0.2, 3.2, 60, 24, 1, true);
    beamGeo.translate(0, 30, 0);
    beamGeo.rotateZ(-Math.PI / 2 + 0.06);
    // свет гаснет к концу луча и мягко — к его краям
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffd9a0) }, opacity: { value: 0 } },
      vertexShader: `varying float vV; varying vec3 vN; varying vec3 vView;
        void main(){ vV = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float opacity; varying float vV; varying vec3 vN; varying vec3 vView;
        void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.5); float fade = pow(1.0 - vV, 1.6);
        gl_FragColor = vec4(uColor * edge * fade * opacity, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Group();
    this.beam.position.copy(beacon.position);
    this.beam.add(new THREE.Mesh(beamGeo, this.beamMat));
    const back = new THREE.Mesh(beamGeo, this.beamMat);
    back.rotation.y = Math.PI;
    this.beam.add(back);
    g.add(this.beam);

    // зона шлюза
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.7, 40), M.hatch);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(HATCH.x, HATCH.y + 0.08, HATCH.z);
    g.add(ring);
    this.hatchRing = ring;

    shadow(g);
    ring.castShadow = false;
    this.static.add(g);

    const domeTop = base + 8;
    this.staticColliders.push({
      type: 'circle',
      x: 0,
      z: 0,
      r: R + 0.3,
      bottom: base - 4,
      topAt: (x, z) => domeTop + Math.sqrt(Math.max(0, R * R - x * x - z * z)),
    });
  }

  clear() {
    this.group.traverse((o) => {
      if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
    });
    this.scene.remove(this.group);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.colliders = [...this.staticColliders];
    this.pickups = [];
    this.leeches = [];
    this.chimneys = [];
    this.lamps = [];
  }

  overlaps(x, z, r) {
    for (const c of this.colliders) {
      if (c.type === 'box') {
        if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
      } else if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    }
    return false;
  }

  randomPoint(rng, uMin, uMax, clear = 1.5, tries = 60) {
    for (let i = 0; i < tries; i++) {
      const th = rng() * Math.PI * 2;
      const u = uMin + rng() * (uMax - uMin);
      const { x, z } = pointOnBack(u, th);
      if (Math.hypot(x - HATCH.x, z - HATCH.z) < 6) continue;
      if (!this.overlaps(x, z, clear)) return { x, z };
    }
    return null;
  }

  // ---------------- Генерация дня ----------------
  generate(seed, cycle, relicIndex, relicTotal, opts = {}) {
    this.clear();
    const rng = mulberry32(seed);

    // Дома
    const houses = 34 + Math.floor(rng() * 10);
    for (let i = 0; i < houses; i++) {
      const w = 4 + rng() * 6;
      const d = 4 + rng() * 6;
      const p = this.randomPoint(rng, 0.03, 0.62, Math.max(w, d) * 0.5 + 2.2, 30);
      if (!p || Math.hypot(p.x, p.z) < 15) continue;
      this.addHouse(rng, p.x, p.z, w, d);
    }
    // Арки из костей
    for (let i = 0; i < 6; i++) {
      const p = this.randomPoint(rng, 0.05, 0.5, 4);
      if (p) this.addArch(rng, p.x, p.z);
    }
    // Фонари
    for (let i = 0; i < 26; i++) {
      const p = this.randomPoint(rng, 0.02, 0.8, 1.2);
      if (p) this.addLamp(p.x, p.z);
    }
    this.addLines(rng);
    this.addWalkways(rng);
    this.addProps(rng);
    // Ящики
    for (let i = 0; i < 30; i++) {
      const p = this.randomPoint(rng, 0.05, 0.85, 1.4);
      if (p) this.addCrate(rng, p.x, p.z);
    }
    // Краны
    for (let i = 0; i < 3; i++) {
      const p = this.randomPoint(rng, 0.6, 0.8, 3);
      if (p) this.addCrane(rng, p.x, p.z);
    }

    // Припасы: рыба у краёв (затопит первой), ворвань в кварталах
    const fish = 18;
    for (let i = 0; i < fish; i++) {
      const p = this.randomPoint(rng, 0.45, 0.975, 1);
      if (p) this.addPickup('food', p.x, p.z);
    }
    for (let i = 0; i < 8; i++) {
      const p = this.randomPoint(rng, 0.15, 0.8, 1);
      if (p) this.addPickup('fuel', p.x, p.z);
    }
    // Потерянная вещь жителя — на опасном краю
    if (opts.keepsake) {
      const p = this.randomPoint(rng, 0.86, 0.97, 1);
      if (p) this.addPickup('keepsake', p.x, p.z);
    }
    // Обломки для мастерской Ковчега
    for (let i = 0; i < 7; i++) {
      const p = this.randomPoint(rng, 0.3, 0.97, 1);
      if (p) this.addPickup('scrap', p.x, p.z);
    }
    // Реликвия: всегда в опасном месте
    if (relicIndex < relicTotal) {
      let p;
      if (rng() < 0.35) {
        p = { x: BLOWHOLE.x + (rng() - 0.5) * 6, z: BLOWHOLE.z + 7 + rng() * 3 };
      } else {
        p = this.randomPoint(rng, 0.9, 0.975, 1);
      }
      if (p) this.addPickup('relic', p.x, p.z, relicIndex);
    }

    // Пиявки появляются со второго дня
    const leeches = Math.min(12, (cycle - 1) * 2);
    for (let i = 0; i < leeches; i++) {
      const p = this.randomPoint(rng, 0.55, 0.92, 1);
      if (p) this.addLeech(rng, p.x, p.z);
    }
    this.bake();
  }

  // Неподвижные постройки склеиваются по материалам в несколько больших сеток:
  // вместо тысячи отрисовок за кадр — пара десятков.
  bake() {
    const buckets = new Map();
    const statics = this.group.children.filter((c) => !c.userData.dynamic);
    this.group.updateMatrixWorld(true);
    for (const obj of statics) {
      obj.traverse((m) => {
        if (!m.isMesh || m.isInstancedMesh) return;
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.applyMatrix4(m.matrixWorld);
        const key = `${m.material.uuid}|${geo.attributes.color ? 'c' : ''}`;
        if (!buckets.has(key)) buckets.set(key, { mat: m.material, geos: [], shadow: m.castShadow });
        buckets.get(key).geos.push(geo);
      });
    }
    for (const obj of statics) this.group.remove(obj);
    for (const { mat, geos, shadow } of buckets.values()) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.userData.baked = true;
      this.group.add(mesh);
    }
  }

  groundAt(x, z, y = Infinity) {
    let g = backHeight(x, z);
    for (const c of this.colliders) {
      if (!inside(c, x, z, 0.15)) continue;
      const t = c.topAt ? c.topAt(x, z) : c.top;
      if (t <= y + STEP && t > g) g = t;
    }
    return g;
  }

  addHouse(rng, x, z, w, d) {
    const hx = w / 2;
    const hz = d / 2;
    let minH = Infinity;
    for (const [cx, cz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [0, 0]]) {
      minH = Math.min(minH, backHeight(x + cx, z + cz));
    }
    if (!isFinite(minH)) return;
    const base = minH - 1.5;
    const h = 4 + rng() * 6 + 1.5;
    const g = new THREE.Group();
    g.position.set(x, base, z);
    const walls = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(w, h, d), 2.4), wallMats[Math.floor(rng() * wallMats.length)]);
    walls.position.y = h / 2;
    g.add(walls);
    // угловые столбы каркаса
    for (const [px, pz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, 0.28), M.trim);
      post.position.set(px, h / 2, pz);
      g.add(post);
    }

    // второй этаж с нависанием — у части домов
    let rb = h; // где начинается крыша
    let uw = w;
    let ud = d;
    if (rng() < 0.38 && h < 9) {
      uw = w + 0.8;
      ud = d + 0.8;
      const uh = 2.8;
      const upper = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(uw, uh, ud), 2.4), wallMats[Math.floor(rng() * wallMats.length)]);
      upper.position.y = h + uh / 2;
      g.add(upper);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(uw + 0.1, 0.25, ud + 0.1), M.trim);
      beam.position.y = h + 0.05;
      g.add(beam);
      for (let i = 0; i < 2; i++) {
        const wi = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), M.window);
        wi.position.set((i - 0.5) * uw * 0.45, h + 1.4, ud / 2 + 0.03);
        g.add(wi);
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.06), M.trim);
        fr.position.set(wi.position.x, wi.position.y, ud / 2 + 0.01);
        g.add(fr);
      }
      // балкон с перилами
      if (rng() < 0.6) {
        const side = rng() < 0.5 ? -1 : 1;
        const bal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, ud * 0.7), M.deck);
        bal.position.set(side * (uw / 2 + 0.45), h + 0.3, 0);
        g.add(bal);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, ud * 0.7), M.trim);
        rail.position.set(side * (uw / 2 + 0.88), h + 1.25, 0);
        g.add(rail);
        for (let k = -2; k <= 2; k++) {
          const bal2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), M.trim);
          bal2.position.set(side * (uw / 2 + 0.88), h + 0.8, (k / 2) * ud * 0.33);
          g.add(bal2);
        }
      }
      rb = h + uh;
    }

    const roofMat = roofMats[Math.floor(rng() * roofMats.length)];
    let top = base + rb;
    if (rng() < 0.5) {
      const rh = 2 + rng() * 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(uw / 2, ud / 2) * 1.05, rh, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = rb + rh / 2;
      g.add(roof);
      // флюгер-рыбка на коньке
      if (rng() < 0.35) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), M.dark);
        rod.position.y = rb + rh + 0.5;
        g.add(rod);
        const vane = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 4), M.rust);
        vane.rotation.z = Math.PI / 2;
        vane.position.y = rb + rh + 0.95;
        g.add(vane);
      }
    } else {
      const slab = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(uw + 0.8, 0.4, ud + 0.8), 2.4), roofMat);
      slab.position.y = rb + 0.2;
      g.add(slab);
      top += 0.4;
      if (rng() < 0.6) {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8), M.rust);
        ch.position.set((rng() - 0.5) * uw * 0.6, rb + 1.3, (rng() - 0.5) * ud * 0.6);
        g.add(ch);
        this.chimneys.push({ x: x + ch.position.x, y: base + rb + 2.45, z: z + ch.position.z });
      } else if (rng() < 0.6) {
        // бочка для дождевой воды на плоской крыше
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 14), M.barrel);
        tank.position.set((rng() - 0.5) * uw * 0.5, rb + 1.05, (rng() - 0.5) * ud * 0.5);
        g.add(tank);
        for (const yy of [0.6, 1.5]) {
          const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.04, 6, 18), M.dark);
          hoop.rotation.x = Math.PI / 2;
          hoop.position.set(tank.position.x, rb + yy, tank.position.z);
          g.add(hoop);
        }
      }
    }
    // дверь и окна
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.2), M.dark);
    door.position.set(0, backHeight(x, z + hz) - base + 1.1, hz + 0.05);
    g.add(door);
    // наличник и крылечко
    for (const [fx, fy, fw, fh] of [[-0.68, 0, 0.16, 2.5], [0.68, 0, 0.16, 2.5], [0, 1.2, 1.52, 0.18]]) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.12), M.trim);
      tr.position.set(fx, door.position.y + fy + (fy ? 0 : 0.1), hz + 0.12);
      g.add(tr);
    }
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.8), M.trim);
    step.position.set(0, door.position.y - 1.15, hz + 0.4);
    g.add(step);
    // фонарик у двери
    if (rng() < 0.5) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), M.dark);
      arm.position.set(0.95, door.position.y + 0.9, hz + 0.25);
      g.add(arm);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.lamp);
      lamp.position.set(0.95, door.position.y + 0.72, hz + 0.42);
      g.add(lamp);
    }
    // вывеска над дверью
    if (rng() < 0.3) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.06), wallMats[Math.floor(rng() * wallMats.length)]);
      sign.position.set(0, door.position.y + 1.6, hz + 0.2);
      g.add(sign);
    }
    const winCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < winCount; i++) {
      const wg = new THREE.Group();
      const side = rng() < 0.5 ? -1 : 1;
      wg.position.set(side * (hx + 0.03), h - 1.6 - rng() * 1.5, (rng() - 0.5) * (d - 1.5));
      wg.rotation.y = side * Math.PI / 2;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.12), M.window);
      wg.add(win);
      // рама с переплётом, подоконник, ставни
      for (const [fx, fy, fw, fh] of [[0, 0.5, 1.12, 0.1], [0, -0.5, 1.2, 0.12], [-0.5, 0, 0.1, 1.1], [0.5, 0, 0.1, 1.1], [0, 0, 0.05, 0.9], [0, 0, 0.9, 0.05]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.1), M.trim);
        f.position.set(fx, fy, 0.06);
        wg.add(f);
      }
      if (rng() < 0.5) {
        for (const sx of [-0.78, 0.78]) {
          const sh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 0.06), wallMats[Math.floor(rng() * wallMats.length)]);
          sh.position.set(sx, 0, 0.05);
          sh.rotation.y = sx * 0.4;
          wg.add(sh);
        }
      }
      g.add(wg);
    }
    shadow(g);
    this.group.add(g);
    this.colliders.push({ type: 'box', minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, bottom: base, top });
  }

  addArch(rng, x, z) {
    const g = new THREE.Group();
    const y = backHeight(x, z);
    const R = 5 + rng() * 2;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.55, 10, 30, Math.PI), M.bone);
    g.add(arc);
    g.position.set(x, y - 0.5, z);
    g.rotation.y = rng() * Math.PI;
    shadow(g);
    this.group.add(g);
  }

  addLamp(x, z) {
    const y = backHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 6), M.dark);
    pole.position.y = 2.1;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), M.dark);
    arm.position.set(0.5, 4.1, 0);
    g.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.lamp);
    lamp.position.set(1.0, 3.75, 0);
    g.add(lamp);
    shadow(g);
    this.group.add(g);
    this.colliders.push({ type: 'box', minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, bottom: y - 1, top: y + 4.2 });
    this.lamps.push({ x: x + 1.0, y: y + 3.95, z });
  }

  addCrate(rng, x, z) {
    const s = 1 + rng() * 0.8;
    const y = backHeight(x, z);
    const m = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(s, s, s), 1.2), rng() < 0.5 ? M.rust : wallMats[2]);
    m.position.set(x, y + s / 2 - 0.15, z);
    m.rotation.y = rng() * Math.PI;
    shadow(m);
    this.group.add(m);
    const h = s * 0.6;
    this.colliders.push({ type: 'box', minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h, bottom: y - 1, top: y + s - 0.15 });
  }

  addCrane(rng, x, z) {
    const y = backHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const mast = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(0.8, 14, 0.8), 2), M.rust);
    mast.position.y = 7;
    g.add(mast);
    const boom = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(0.5, 0.5, 16), 2), M.rust);
    boom.position.set(0, 13.5, 6);
    g.add(boom);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6), M.rope);
    cable.position.set(0, 10.5, 13.5);
    g.add(cable);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), M.steel);
    cage.position.set(0, 7, 13.5);
    g.add(cage);
    g.rotation.y = Math.atan2(x, z);
    shadow(g);
    this.group.add(g);
    this.colliders.push({ type: 'box', minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6, bottom: y - 1, top: y + 14 });
  }

  addPickup(type, x, z, relicIndex = -1, y = null) {
    const g = new THREE.Group();
    if (type === 'food') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), M.fish);
      body.scale.set(0.45, 0.6, 1.2);
      g.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), M.fish);
      tail.rotation.x = Math.PI / 2;
      tail.position.z = 0.75;
      g.add(tail);
    } else if (type === 'keepsake') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xffb3d1, emissive: 0xff5fa2, emissiveIntensity: 1.2 }));
      g.add(box);
      const light = new THREE.PointLight(0xff7fb8, 14, 12, 1.8);
      g.add(light);
    } else if (type === 'scrap') {
      const gear = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.14, 6, 10), M.steel);
      gear.rotation.x = 0.4;
      g.add(gear);
      for (let i = 0; i < 3; i++) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), M.rust);
        plate.position.set((i - 1) * 0.25, -0.2 + i * 0.12, (i % 2) * 0.2 - 0.1);
        plate.rotation.set(i, i * 0.7, 0.3);
        g.add(plate);
      }
    } else if (type === 'fuel') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 14), M.barrel);
      g.add(b);
      for (const yy of [-0.35, 0.35]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.05, 6, 20), M.dark);
        band.rotation.x = Math.PI / 2;
        band.position.y = yy;
        g.add(band);
      }
    } else {
      const r = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), M.relic);
      r.scale.y = 1.5;
      g.add(r);
      const light = new THREE.PointLight(0x7ff6ff, 25, 18, 1.8);
      g.add(light);
    }
    // мягкое свечение вокруг припаса (в браузере — с текстурой пятна)
    const glowColor = { food: 0xcff6ff, fuel: 0xffb070, scrap: 0xd0d6ff, relic: 0x80ffff, keepsake: 0xff9fc8 }[type];
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: glowColor, transparent: true, opacity: GLOW.tex ? 0.75 : 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(type === 'relic' || type === 'keepsake' ? 4 : 2.6);
    g.add(halo);
    // реликвия и вещь жителя видны издалека: столб света в небо
    if (type === 'relic' || type === 'keepsake') {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.9, 60, 12, 1, true).translate(0, 30, 0),
        new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
      );
      col.position.y = -0.9;
      g.add(col);
    }
    const gy = y ?? this.groundAt(x, z);
    g.position.set(x, gy + 0.9, z);
    g.traverse((c) => c.isMesh && (c.castShadow = true));
    g.userData.dynamic = true;
    this.group.add(g);
    this.pickups.push({ type, relicIndex, mesh: g, x, z, y: gy + 0.9, phase: Math.random() * 6, active: true });
  }

  addLeech(rng, x, z) {
    const g = new THREE.Group();
    const segs = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.55 - i * 0.08, 12, 10), M.leech);
      s.scale.set(1, 0.7, 1.2);
      s.position.z = i * 0.7;
      g.add(s);
      segs.push(s);
    }
    for (const sx of [-0.22, 0.22]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), M.leechEye);
      e.position.set(sx, 0.25, -0.4);
      g.add(e);
    }
    shadow(g);
    const y = backHeight(x, z);
    g.position.set(x, y + 0.3, z);
    g.userData.dynamic = true;
    this.group.add(g);
    this.leeches.push({ mesh: g, segs, x, z, dir: rng() * Math.PI * 2, cool: 0, phase: rng() * 6, push: null });
  }
}

export function inside(c, x, z, r) {
  if (c.type === 'box') return x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r;
  return Math.hypot(x - c.x, z - c.z) < c.r + r;
}

// Текстуры навешиваются только в браузере (в тестах под Node нет canvas).
// TEX — модуль textures.js.
export function dressMaterials(TEX) {
  GLOW.tex = TEX.glowDot();
  WALLS.forEach((hex, i) => {
    const c = new THREE.Color(hex);
    const t = TEX.planks([Math.min(235, c.r * 255 * 1.75), Math.min(235, c.g * 255 * 1.75), Math.min(235, c.b * 255 * 1.75)]);
    const m = wallMats[i];
    m.map = t.map;
    m.bumpMap = t.bump;
    m.bumpScale = 1.4;
    m.color.set(0xffffff);
    m.needsUpdate = true;
  });
  ROOFS.forEach((hex, i) => {
    const c = new THREE.Color(hex);
    const t = TEX.shingles([c.r * 255 * 1.3, c.g * 255 * 1.3, c.b * 255 * 1.3]);
    t.map.repeat.set(3, 3);
    t.bump.repeat.set(3, 3);
    const m = roofMats[i];
    m.map = t.map;
    m.bumpMap = t.bump;
    m.bumpScale = 2;
    m.color.set(0xffffff);
    m.needsUpdate = true;
  });
  const metal = (mat, base, rx, ry) => {
    const t = TEX.rustyMetal(base);
    for (const k of ['map', 'bump', 'rough']) t[k].repeat.set(rx, ry);
    mat.map = t.map;
    mat.bumpMap = t.bump;
    mat.bumpScale = 1.5;
    mat.roughnessMap = t.rough;
    mat.roughness = 1;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  };
  const dk = TEX.planks([170, 128, 88]);
  M.deck.map = dk.map;
  M.deck.bumpMap = dk.bump;
  M.deck.bumpScale = 1.2;
  M.deck.color.set(0xffffff);
  M.deck.needsUpdate = true;
  M.net.alphaMap = TEX.netTexture();
  M.net.alphaMap.repeat.set(3, 2);
  M.net.needsUpdate = true;
  metal(M.steel, [96, 108, 114], 1, 1);
  metal(M.rust, [118, 78, 56], 1, 1);
  metal(M.arkWall, [98, 110, 116], 6, 2);
  metal(M.arkDome, [128, 70, 48], 5, 2);
  metal(M.barrel, [170, 76, 40], 2, 1);
}

// Флажки и бельё на верёвках между соседними фонарями
City.prototype.addLines = function (rng) {
  const flagColors = [0xd9483b, 0xe8c547, 0x3f8fbf, 0xf2efe6, 0x4f9a63, 0xc7703a];
  const clothColors = [0xf2efe6, 0xd8dde0, 0x9fb8c8, 0xc9b79a, 0xe7d3c0];
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x3b3128, roughness: 1 });
  const flagMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const used = new Set();
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  for (let i = 0; i < this.lamps.length; i++) {
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < this.lamps.length; j++) {
      if (i === j || used.has(`${Math.min(i, j)}-${Math.max(i, j)}`)) continue;
      const d = Math.hypot(this.lamps[i].x - this.lamps[j].x, this.lamps[i].z - this.lamps[j].z);
      if (d > 7 && d < 22 && d < bd) { bd = d; best = j; }
    }
    if (best < 0 || rng() < 0.25) continue;
    used.add(`${Math.min(i, best)}-${Math.max(i, best)}`);
    const a = this.lamps[i];
    const b = this.lamps[best];
    const sag = 0.6 + bd * 0.05;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 4), ropeMat);
    this.group.add(rope);
    const laundry = rng() < 0.35;
    const n = Math.floor(bd / (laundry ? 1.4 : 0.75));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = new THREE.Vector3(tan.x, 0, tan.z).normalize();
      if (laundry) {
        if (rng() < 0.3) continue;
        const w = 0.5 + rng() * 0.5;
        const h = 0.5 + rng() * 0.6;
        c.setHex(clothColors[Math.floor(rng() * clothColors.length)]);
        const p0 = p.clone().addScaledVector(side, -w / 2);
        const p1 = p.clone().addScaledVector(side, w / 2);
        const quad = [p0, p1, p1.clone().setY(p1.y - h), p0, p1.clone().setY(p1.y - h), p0.clone().setY(p0.y - h)];
        for (const q of quad) { pos.push(q.x, q.y, q.z); col.push(c.r, c.g, c.b); }
      } else {
        const w = 0.32;
        c.setHex(flagColors[Math.floor(rng() * flagColors.length)]);
        const p0 = p.clone().addScaledVector(side, -w / 2);
        const p1 = p.clone().addScaledVector(side, w / 2);
        const tip = p.clone().setY(p.y - 0.45);
        for (const q of [p0, p1, tip]) { pos.push(q.x, q.y, q.z); col.push(c.r, c.g, c.b); }
      }
    }
  }
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const flags = new THREE.Mesh(geo, flagMat);
    flags.castShadow = true;
    this.group.add(flags);
  }
};

// Дощатые мостки: «улицы» от Ковчега к краям спины, огибают дома
City.prototype.addWalkways = function (rng) {
  const geo = new THREE.BoxGeometry(2.0, 0.09, 0.42);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  const rays = 7 + Math.floor(rng() * 3);
  for (let r = 0; r < rays; r++) {
    let a = (r / rays) * Math.PI * 2 + rng() * 0.4;
    let x = Math.sin(a) * 10.5;
    let z = Math.cos(a) * 10.5;
    for (let s = 0; s < 220; s++) {
      if (backU(x, z) > 0.8) break;
      // если впереди дом — сворачиваем
      let tries = 0;
      while (this.overlaps(x + Math.sin(a) * 1.5, z + Math.cos(a) * 1.5, 1.2) && tries < 6) {
        a += (rng() < 0.5 ? -1 : 1) * 0.35;
        tries++;
      }
      if (tries >= 6) break;
      x += Math.sin(a) * 0.5;
      z += Math.cos(a) * 0.5;
      a += (rng() - 0.5) * 0.06; // чуть петляет
      const y = backHeight(x, z);
      if (!isFinite(y)) break;
      const e = 0.3;
      n.set(backHeight(x - e, z) - backHeight(x + e, z), 2 * e, backHeight(x, z - e) - backHeight(x, z + e)).normalize();
      const plank = new THREE.Mesh(geo, M.deck);
      plank.position.set(x, y + 0.05, z);
      q.setFromUnitVectors(up, n);
      plank.quaternion.copy(q);
      plank.rotateY(a + (rng() - 0.5) * 0.08);
      if (rng() < 0.04) continue; // выпавшая доска
      this.group.add(plank);
    }
  }
};

// Мелочи между домами: сушилки с сетями, штабеля бочек, бухты канатов
City.prototype.addProps = function (rng) {
  for (let i = 0; i < 16; i++) {
    const p = this.randomPoint(rng, 0.08, 0.8, 2.2);
    if (!p) continue;
    const y = backHeight(p.x, p.z);
    const g = new THREE.Group();
    g.position.set(p.x, y, p.z);
    g.rotation.y = rng() * Math.PI;
    const kind = rng();
    if (kind < 0.35) {
      // сушилка: два шеста и сеть
      for (const s of [-1.3, 1.3]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), M.trim);
        pole.position.set(s, 1.3, 0);
        g.add(pole);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.7, 5), M.trim);
      bar.rotation.z = Math.PI / 2;
      bar.position.y = 2.5;
      g.add(bar);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.9, 8, 4), M.net);
      const pos = net.geometry.attributes.position;
      for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin((pos.getX(k) / 2.5 + 0.5) * Math.PI) * 0.15 * (0.5 - pos.getY(k) / 1.9));
      net.position.y = 1.5;
      g.add(net);
      this.colliders.push({ type: 'box', minX: p.x - 1.4, maxX: p.x + 1.4, minZ: p.z - 0.3, maxZ: p.z + 0.3, bottom: y - 1, top: y + 2.6 });
    } else if (kind < 0.7) {
      // штабель бочек
      const n = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), M.barrel);
        const ring = k < 3;
        b.position.set(ring ? (k - 1) * 0.9 : (k - 3.5) * 0.9, ring ? 0.5 : 1.5, ring ? 0 : 0);
        if (!ring) b.position.y = 1.5;
        g.add(b);
      }
      this.colliders.push({ type: 'box', minX: p.x - 1.4, maxX: p.x + 1.4, minZ: p.z - 1.4, maxZ: p.z + 1.4, bottom: y - 1, top: y + 1.0 });
    } else {
      // бухта каната и ящик
      for (let k = 0; k < 4; k++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42 - k * 0.04, 0.07, 6, 18), M.rope);
        coil.rotation.x = Math.PI / 2;
        coil.position.set(0, 0.08 + k * 0.12, 0);
        g.add(coil);
      }
      const box = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(0.9, 0.7, 0.9), 1.2), M.deck);
      box.position.set(1.1, 0.35, 0.2);
      box.rotation.y = 0.3;
      g.add(box);
    }
    g.traverse((m) => m.isMesh && (m.castShadow = m.receiveShadow = true));
    this.group.add(g);
  }
};
