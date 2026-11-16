// Город Ноа: Ковчег (постоянный), процедурные кварталы, припасы и пиявки.
// Город перестраивается каждый день: ночное погружение всё перемешивает.
import * as THREE from 'three';
import { WHALE, backHeight, backU, BLOWHOLE, pointOnBack } from './whale.js';
import { boxProjectUV } from './textures.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { mergeChildren } from './merge.js';

export const STEP = 0.7;
export const HATCH = new THREE.Vector3(0, 0, 13);
HATCH.y = backHeight(HATCH.x, HATCH.z);
// здесь ныряльщик просыпается каждое утро
export const SPAWN = new THREE.Vector3(HATCH.x, 0, HATCH.z + 6);

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
  bone: new THREE.MeshStandardMaterial({ color: 0xaeaa9c, roughness: 0.85 }), // выбеленная солью кость: серая, не телесная
  window: new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb45a, emissiveIntensity: 0.3 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffb860, emissiveIntensity: 1.5 }),
  hatch: new THREE.MeshBasicMaterial({ color: 0x58f0d8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  fish: new THREE.MeshStandardMaterial({ color: 0x9fc3d6, roughness: 0.3, metalness: 0.6 }),
  barrel: new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.7, metalness: 0.2 }),
  relic: new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0x5ff0ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.8 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.35, depthWrite: false }),
  // пиявка: влажная, под слоем слизи (лак поверх), с кольцами и полосами по спине
  leech: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0x2a0820, emissiveIntensity: 0.35 }),
  leechMouth: new THREE.MeshStandardMaterial({ color: 0xb8505e, roughness: 0.4 }),
  leechTeeth: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.3 }),
  leechEye: new THREE.MeshBasicMaterial({ color: 0xff5a7a }),
};
M.trim = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.85 });
M.deck = new THREE.MeshStandardMaterial({ color: 0x7a5c40, roughness: 0.9 });
M.pool = new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
M.ao = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
M.dryFish = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 0.55, metalness: 0.15 });
M.float = new THREE.MeshStandardMaterial({ color: 0xd9542e, roughness: 0.6 });
M.driftwood = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.95 });
M.relicStone = new THREE.MeshStandardMaterial({ color: 0x6e7b7c, roughness: 0.85, emissive: 0x0c2a2c, emissiveIntensity: 0.5 });
M.brass = new THREE.MeshStandardMaterial({ color: 0xb08a50, metalness: 0.85, roughness: 0.35 });
M.net = new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 1, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
export const MATERIALS = M;
// Текстура мягкого свечения задаётся из браузера (в Node её нет)
export const GLOW = { tex: null };

// выцветшая краска: охра, морская зелень, красный сурик, кремовый, серо-голубой, шалфей, бурый
const WALLS = [0xa8834a, 0x4f8580, 0x9a4e3e, 0xc2b394, 0x5a7690, 0x7f8f66, 0x84644a];
const ROOFS = [0x8a4632, 0x56646a, 0x6e5640, 0x44564e];
// Ковчег — отдельные материалы: у цилиндра свои UV, текстуре нужен свой повтор
M.arkWall = M.steel.clone();
M.arkDome = M.rust.clone();

// Потёртости: у земли стена темнее и зеленее (морская сырость), к верху — светлее
function grime(geo, h, groundLocal) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + h / 2; // от низа стены
    const k = Math.min(1, Math.max(0, (y - groundLocal) / 2.5));
    col[i * 3] = 0.55 + 0.45 * k;
    col[i * 3 + 1] = 0.62 + 0.38 * k;
    col[i * 3 + 2] = 0.55 + 0.45 * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Пятно света под фонарём
let POOL_G = null;
function POOL_GEO() {
  if (!POOL_G) POOL_G = new THREE.CircleGeometry(3.2, 28).rotateX(-Math.PI / 2);
  return POOL_G;
}

// Мягкая тень-пятно у основания построек
let AO_GEO = null;
function aoBlob(w, d) {
  if (!AO_GEO) AO_GEO = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(AO_GEO, M.ao);
  m.scale.set(w, 1, d);
  m.userData.ao = true;
  return m;
}

function std(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
}
const wallMats = WALLS.map((hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, vertexColors: true }));
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
    this.archPoints = [];
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
    const det = new THREE.Group(); // мелкие детали — потом сольём по материалам
    // латунные рамы иллюминаторов
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.11, 8, 20), M.brass);
      rim.position.set(Math.sin(a) * (R + 0.08), base + 6, Math.cos(a) * (R + 0.08));
      rim.lookAt(rim.position.x * 2, rim.position.y, rim.position.z * 2);
      det.add(rim);
    }
    // вертикальные рёбра-накладки и ряды заклёпок по поясам
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(Math.sin(a / 2)) < 0.14) continue; // не перед шлюзом
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.32, 8, 0.18), M.steel);
      rib.position.set(Math.sin(a) * (R + 0.2), base + 4, Math.cos(a) * (R + 0.2));
      rib.rotation.y = a;
      det.add(rib);
    }
    const rivetGeo = new THREE.SphereGeometry(0.07, 6, 4);
    const rivets = new THREE.InstancedMesh(rivetGeo, M.steel, 3 * 96);
    const rm = new THREE.Matrix4();
    let ri = 0;
    for (const y of [base + 2.35, base + 5.35, base + 7.65]) {
      for (let k = 0; k < 96; k++) {
        const a = (k / 96) * Math.PI * 2;
        rm.makeTranslation(Math.sin(a) * (R + 0.12), y, Math.cos(a) * (R + 0.12));
        rivets.setMatrixAt(ri++, rm);
      }
    }
    g.add(rivets); // заклёпки — инстансами, отдельно
    // шлюз: проём, круглая дверь-люк со штурвалом и петлями, козырёк над ним
    const recess = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.8, 1.4), M.dark);
    recess.position.set(0, base + 4.3, R + 0.1);
    det.add(recess);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.35, 28), M.arkWall);
    door.rotation.x = Math.PI / 2;
    door.position.set(0, base + 4.4, R + 0.9);
    det.add(door);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.28, 8, 28), M.steel);
    frame.position.set(0, base + 4.4, R + 0.95);
    det.add(frame);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 20), M.brass);
    wheel.position.set(0, base + 4.4, R + 1.2);
    det.add(wheel);
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.07, 0.07), M.brass);
      spoke.rotation.z = (k / 3) * Math.PI;
      spoke.position.copy(wheel.position);
      det.add(spoke);
    }
    for (const yy of [-1.0, 1.0]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8), M.steel);
      hinge.position.set(-1.85, base + 4.4 + yy, R + 1.0);
      det.add(hinge);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 1.8), M.steel);
    canopy.position.set(0, base + 7.0, R + 1.0);
    canopy.rotation.x = 0.15;
    det.add(canopy);
    // обходная галерея у основания купола: стойки и поручень
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R + 0.9, 0.06, 6, 64), M.steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = base + 9.1;
    det.add(rail);
    const deck = new THREE.Mesh(new THREE.RingGeometry(R - 0.1, R + 1.0, 64), M.steel);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = base + 8.05;
    det.add(deck);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 5), M.steel);
      post.position.set(Math.sin(a) * (R + 0.9), base + 8.58, Math.cos(a) * (R + 0.9));
      det.add(post);
    }
    // лестница по куполу к маяку
    const lad = [];
    for (let k = 0; k <= 22; k++) {
      const t = (k / 22) * (Math.PI / 2 - 0.12);
      const rr = R + 0.25;
      lad.push(new THREE.Vector3(0, base + 8 + Math.sin(t) * rr, -Math.cos(t) * rr));
    }
    for (const sx of [-0.35, 0.35]) {
      const side = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lad.map((v) => v.clone().setX(sx))), 24, 0.05, 5), M.steel);
      det.add(side);
    }
    for (let k = 1; k < lad.length; k += 2) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 5), M.steel);
      rung.rotation.z = Math.PI / 2;
      rung.position.copy(lad[k]);
      det.add(rung);
    }
    g.add(mergeByMaterial(det));
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
    this.archPoints = [];
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
      // площадка у шлюза, где утром стоит ныряльщик, всегда свободна
      if (Math.abs(x - SPAWN.x) < clear + 1.5 && z > HATCH.z && z < SPAWN.z + clear + 1.5) continue;
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

    // дома из перевёрнутых лодок — на свободных местах, своим генератором
    const br = mulberry32((seed ^ 0x2545f491) >>> 0);
    const boats = 4 + Math.floor(br() * 3);
    for (let i = 0; i < boats; i++) {
      const p = this.randomPoint(br, 0.1, 0.6, 4.2, 40);
      if (p && Math.hypot(p.x, p.z) > 16) this.addBoatHouse(br, p.x, p.z);
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
    // особенности моря: свой генератор, чтобы раскладка города не сдвигалась
    const xr = mulberry32((seed ^ 0x7f4a7c15) >>> 0);
    for (let i = 0; i < (opts.extraFood || 0); i++) {
      const p = this.randomPoint(xr, 0.45, 0.975, 1);
      if (p) this.addPickup('food', p.x, p.z);
    }
    for (let i = 0; i < (opts.extraScrap || 0); i++) {
      const p = this.randomPoint(xr, 0.3, 0.97, 1);
      if (p) this.addPickup('scrap', p.x, p.z);
    }
    for (let i = 0; i < (cycle > 1 ? opts.extraLeeches || 0 : 0); i++) {
      const p = this.randomPoint(xr, 0.55, 0.92, 1);
      if (p) this.addLeech(xr, p.x, p.z);
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
        // материалу с цветами вершин нужен цвет у каждой вершины, иначе деталь станет чёрной
        if (m.material.vertexColors && !geo.attributes.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
        if (!m.material.vertexColors && geo.attributes.color) geo.deleteAttribute('color');
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

  // ореолы припасов: днём едва заметны, в сумерках и ночью ярче
  setHaloStrength(k) {
    for (const p of this.pickups) {
      const h = p.mesh.userData.halo;
      if (h) h.material.opacity = h.userData.base * k;
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
    const walls = new THREE.Mesh(grime(boxProjectUV(new THREE.BoxGeometry(w, h, d, 1, 4, 1), 2.4), h, backHeight(x, z) - base), wallMats[Math.floor(rng() * wallMats.length)]);
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
    this.dressWalls(g, x, z, hx, hz, h, base);
    shadow(g);
    this.group.add(g);
    this.colliders.push({ type: 'box', minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, bottom: base, top });
    const blob = aoBlob(w * 1.5, d * 1.5);
    blob.position.set(x, backHeight(x, z) + 0.04, z);
    this.group.add(blob);
  }

  // Жизнь на стенах: вяленая рыба на верёвке, развешанная сеть, лестница, поленница.
  // Свой генератор от координат дома, чтобы не сдвигать раскладку города.
  dressWalls(g, x, z, hx, hz, h, base) {
    const r = mulberry32(Math.floor(x * 1009 + z * 9173) >>> 0);
    const ground = (lx, lz) => backHeight(x + lx, z + lz) - base;
    // стены: 0 — левая (-x), 1 — правая (+x), 2 — задняя (-z)
    const wallAt = (k, t) => (k === 0 ? [-hx - 0.12, t * (hz - 0.8), -Math.PI / 2] : k === 1 ? [hx + 0.12, t * (hz - 0.8), Math.PI / 2] : [t * (hx - 0.8), -hz - 0.12, Math.PI]);
    const used = new Set();
    const pick = () => { let k; do { k = Math.floor(r() * 3); } while (used.has(k) && used.size < 3); used.add(k); return k; };
    if (r() < 0.5) {
      // вяленая рыба: верёвка между гвоздями и пять-семь рыбин хвостом вверх
      const [px, pz, ry] = wallAt(pick(), r() * 1.4 - 0.7);
      const grp = new THREE.Group();
      grp.position.set(px, Math.min(h - 1.2, ground(px, pz) + 2.6), pz);
      grp.rotation.y = ry;
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 4), M.rope);
      rope.rotation.z = Math.PI / 2;
      grp.add(rope);
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const f = new THREE.Mesh(FISH.body, M.dryFish);
        f.scale.setScalar(0.45 + r() * 0.15);
        f.rotation.x = -Math.PI / 2 + (r() - 0.5) * 0.3;
        f.position.set(-0.85 + (i / (n - 1)) * 1.7, -0.3, 0.06);
        grp.add(f);
      }
      g.add(grp);
    }
    if (r() < 0.45) {
      // сеть, перекинутая через жердь
      const [px, pz, ry] = wallAt(pick(), r() * 1.2 - 0.6);
      const grp = new THREE.Group();
      grp.position.set(px, Math.min(h - 1.4, ground(px, pz) + 2.2), pz);
      grp.rotation.y = ry;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), M.trim);
      pole.rotation.z = Math.PI / 2;
      pole.position.y = 0.9;
      grp.add(pole);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.8, 6, 4), M.net);
      const ps = net.geometry.attributes.position;
      for (let k = 0; k < ps.count; k++) ps.setZ(k, 0.05 + Math.sin((ps.getX(k) / 2.3 + 0.5) * Math.PI * 2) * 0.06 + (0.9 - ps.getY(k)) * 0.04);
      net.position.set(0, 0, 0.02);
      grp.add(net);
      for (let i = 0; i < 4; i++) {
        const float = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.float);
        float.position.set(-0.9 + i * 0.6, -0.75 + (i % 2) * 0.12, 0.12);
        grp.add(float);
      }
      g.add(grp);
    }
    if (r() < 0.35) {
      // лестница, прислонённая к стене
      const [px, pz, ry] = wallAt(pick(), r() * 1.4 - 0.7);
      const grp = new THREE.Group();
      const len = Math.min(h - 0.5, 4.2);
      grp.position.set(px, ground(px, pz), pz);
      grp.rotation.y = ry;
      const lean = 0.22;
      for (const sx of [-0.28, 0.28]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, len, 0.08), M.trim);
        side.position.set(sx, len / 2, 0.5 - (len / 2) * Math.sin(lean));
        side.rotation.x = -lean;
        grp.add(side);
      }
      for (let y = 0.4; y < len - 0.2; y += 0.42) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.06), M.trim);
        rung.position.set(0, y * Math.cos(lean), 0.5 - y * Math.sin(lean));
        grp.add(rung);
      }
      g.add(grp);
    }
    if (r() < 0.4) {
      // поленница из плавника под стеной
      const [px, pz, ry] = wallAt(pick(), r() * 1.2 - 0.6);
      const grp = new THREE.Group();
      grp.position.set(px, ground(px, pz), pz);
      grp.rotation.y = ry;
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 5 - row; i++) {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + r() * 0.04, 0.12, 1.2, 7), M.driftwood);
          log.rotation.x = Math.PI / 2;
          log.rotation.z = Math.PI / 2;
          log.position.set(-0.5 + i * 0.26 + row * 0.13, 0.13 + row * 0.22, 0.35);
          grp.add(log);
        }
      }
      g.add(grp);
    }
  }

  // Дом из перевёрнутой лодки: корпус килем вверх, дощатый торец с дверью,
  // труба сквозь днище, подпорки по бокам
  addBoatHouse(r, x, z) {
    const len = 7 + r() * 3;
    const w = 3.2 + r() * 0.8;
    const y = backHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y - 0.3, z);
    g.rotation.y = r() * Math.PI;
    const hullMat = wallMats[Math.floor(r() * wallMats.length)];
    const hull = new THREE.Mesh(boxProjectUV(new THREE.CylinderGeometry(w / 2, w / 2, len, 14, 1, true, Math.PI / 2, Math.PI), 2.4), hullMat);
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1, 1, 1.25);
    g.add(hull);
    // киль и шпангоуты снаружи
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, len + 0.6), M.trim);
    keel.position.y = (w / 2) * 1.25 + 0.05;
    g.add(keel);
    for (let k = -2; k <= 2; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.06, 0.07, 5, 16, Math.PI), M.trim);
      rib.scale.set(1, 1.25, 1);
      rib.position.z = (k / 2.5) * (len / 2);
      g.add(rib);
    }
    // торцы: дощатые стенки, в переднем — дверь и окно
    for (const s of [-1, 1]) {
      const end = new THREE.Mesh(boxProjectUV(new THREE.CircleGeometry(w / 2, 14, 0, Math.PI), 2.4), M.deck);
      end.scale.set(1, 1.25, 1);
      end.position.z = (s * len) / 2;
      if (s < 0) end.rotation.y = Math.PI;
      g.add(end);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.12), M.dark);
    door.position.set(0, 0.95, len / 2 + 0.04);
    g.add(door);
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), M.window);
    win.position.set(w * 0.25, 2.3, len / 2 + 0.06);
    g.add(win);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.6, 8), M.rust);
    pipe.position.set(w * 0.15, (w / 2) * 1.25 + 0.6, -len * 0.2);
    g.add(pipe);
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) {
        const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 6), M.trim);
        prop.position.set(s * (w / 2 + 0.35), 0.7, (k * len) / 3);
        prop.rotation.z = -s * 0.45;
        g.add(prop);
      }
    }
    shadow(g);
    this.group.add(g);
    // столкновение: прямоугольник по габаритам с учётом поворота
    const c = Math.abs(Math.cos(g.rotation.y));
    const sn = Math.abs(Math.sin(g.rotation.y));
    const hx = (w / 2 + 0.4) * c + (len / 2) * sn;
    const hz = (w / 2 + 0.4) * sn + (len / 2) * c;
    this.colliders.push({ type: 'box', minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, bottom: y - 1, top: y + w * 0.65 + 0.3 });
    const blob = aoBlob(w * 1.6, len * 1.2);
    blob.position.set(x, y + 0.04, z);
    blob.rotation.y = g.rotation.y;
    this.group.add(blob);
  }

  addArch(rng, x, z) {
    const g = new THREE.Group();
    const y = backHeight(x, z);
    const R = 5 + rng() * 2;
    const arc = new THREE.Mesh(boneArc(R, rng), M.bone);
    g.add(arc);
    g.position.set(x, y - 0.5, z);
    g.rotation.y = rng() * Math.PI;
    shadow(g);
    this.group.add(g);
    // точки вдоль дуги — для камеры ролика (сама арка не мешает ходить)
    const r = g.rotation.y;
    for (let k = 0; k <= 10; k++) {
      const th = (k / 10) * Math.PI;
      const lx = Math.cos(th) * R;
      this.archPoints.push([x + lx * Math.cos(r), y - 0.5 + Math.sin(th) * R, z - lx * Math.sin(r)]);
    }
  }

  addLamp(x, z) {
    const y = backHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // чугунный фонарь: ступенчатое основание, столб с кольцами, гнутый кронштейн,
    // фонарь-клетка с колпаком и светящимся стеклом
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.45, 8), M.dark);
    base.position.y = 0.22;
    g.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.0, 8), M.dark);
    pole.position.y = 2.2;
    g.add(pole);
    for (const yy of [0.55, 2.4, 4.05]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 12), M.dark);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = yy;
      g.add(ring);
    }
    const arm = new THREE.Mesh(LAMP_ARM, M.dark);
    arm.position.y = 3.9;
    g.add(arm);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.42, 6), M.lamp);
    lamp.position.set(1.0, 3.72, 0);
    g.add(lamp);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.46, 0.03), M.dark);
      bar.position.set(1.0 + Math.cos(a) * 0.19, 3.72, Math.sin(a) * 0.19);
      g.add(bar);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 6), M.dark);
    cap.position.set(1.0, 4.06, 0);
    g.add(cap);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), M.dark);
    finial.position.set(1.0, 4.22, 0);
    g.add(finial);
    const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 6), M.dark);
    bottom.rotation.x = Math.PI;
    bottom.position.set(1.0, 3.45, 0);
    g.add(bottom);
    shadow(g);
    this.group.add(g);
    this.colliders.push({ type: 'box', minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, bottom: y - 1, top: y + 4.2 });
    this.lamps.push({ x: x + 1.0, y: y + 3.95, z });
    // тёплое пятно света на земле под фонарём (видно в сумерках)
    const pool = new THREE.Mesh(POOL_GEO(), M.pool);
    pool.position.set(x + 1.0, backHeight(x + 1.0, z) + 0.06, z);
    this.group.add(pool);
  }

  addCrate(rng, x, z) {
    const s = 1 + rng() * 0.8;
    const y = backHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y + s / 2 - 0.15, z);
    g.rotation.y = rng() * Math.PI;
    const metal = rng() < 0.35;
    // ящик: доски внутри каркаса из брусьев, на боках — диагональные распорки;
    // железный — гладкие листы с двумя обручами
    g.add(new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(s * 0.96, s * 0.96, s * 0.96), metal ? 1.2 : 0.8), metal ? M.rust : M.deck));
    const t = s * 0.08;
    const edge = metal ? M.steel : M.trim;
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        const e1 = new THREE.Mesh(new THREE.BoxGeometry(t, s, t), edge);
        e1.position.set((a * (s - t)) / 2, 0, (b * (s - t)) / 2);
        const e2 = new THREE.Mesh(new THREE.BoxGeometry(s, t, t), edge);
        e2.position.set(0, (a * (s - t)) / 2, (b * (s - t)) / 2);
        const e3 = new THREE.Mesh(new THREE.BoxGeometry(t, t, s), edge);
        e3.position.set((a * (s - t)) / 2, (b * (s - t)) / 2, 0);
        g.add(e1, e2, e3);
      }
    }
    if (metal) {
      for (const yy of [-0.25, 0.25]) {
        const hoop = new THREE.Mesh(new THREE.BoxGeometry(s * 1.0, t * 0.7, s * 1.0), M.steel);
        hoop.position.y = yy * s;
        g.add(hoop);
      }
    } else {
      for (const side of [0, 1, 2, 3]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(s * 1.2, t * 0.8, t * 0.5), M.trim);
        brace.rotation.z = Math.PI / 4 * (side % 2 ? 1 : -1);
        const ang = (side * Math.PI) / 2;
        brace.position.set(Math.sin(ang) * s * 0.49, 0, Math.cos(ang) * s * 0.49);
        brace.rotation.y = ang;
        g.add(brace);
      }
    }
    shadow(g);
    this.group.add(g);
    const h = s * 0.6;
    this.colliders.push({ type: 'box', minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h, bottom: y - 1, top: y + s - 0.15 });
  }

  addCrane(rng, x, z) {
    const y = backHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // решётчатая мачта и стрела из ржавых уголков, противовес, будка, блок с крюком
    g.add(new THREE.Mesh(CRANE.truss, M.rust));
    const cab = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(1.6, 1.5, 1.6), 1.2), wallMats[1]);
    cab.position.set(0, 12.6, -0.4);
    g.add(cab);
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.8), M.steel);
    cabRoof.position.set(0, 13.4, -0.4);
    g.add(cabRoof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), M.window);
    win.position.set(0, 12.8, 0.41);
    g.add(win);
    const weight = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(1.4, 1.2, 1.6), 1.2), M.steel);
    weight.position.set(0, 13.0, -4.6);
    g.add(weight);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.6, 5), M.rope);
    cable.position.set(0, 11.0, 13.5);
    g.add(cable);
    const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 14), M.steel);
    pulley.rotation.y = Math.PI / 2;
    pulley.position.set(0, 13.6, 13.5);
    g.add(pulley);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12, Math.PI * 1.4), M.steel);
    hook.position.set(0, 8.0, 13.5);
    hook.rotation.z = Math.PI * 0.8;
    g.add(hook);
    // клеть с сетью
    const cage = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.5), M.net);
    cage.position.set(0, 7.0, 13.5);
    g.add(cage);
    const cageFrame = new THREE.Mesh(CRANE.cage, M.steel);
    cageFrame.position.copy(cage.position);
    g.add(cageFrame);
    g.rotation.y = Math.atan2(x, z);
    shadow(g);
    this.group.add(g);
    this.colliders.push({ type: 'box', minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6, bottom: y - 1, top: y + 14 });
  }

  addPickup(type, x, z, relicIndex = -1, y = null) {
    const g = new THREE.Group();
    if (type === 'food') {
      g.add(new THREE.Mesh(FISH.body, FISH.mat));
      const tail = new THREE.Mesh(FISH.tail, FISH.finMat);
      tail.position.z = 0.62;
      g.add(tail);
      const dorsal = new THREE.Mesh(FISH.fin, FISH.finMat);
      dorsal.rotation.y = Math.PI / 2;
      dorsal.position.set(0, 0.2, 0.12);
      g.add(dorsal);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(FISH.eye, FISH.eyeMat);
        eye.position.set(s * 0.1, 0.06, -0.42);
        g.add(eye);
      }
    } else if (type === 'keepsake') {
      // сундучок жителя: дерево, медные уголки, светящаяся лента
      const box = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(0.6, 0.38, 0.42), 0.6), M.deck);
      g.add(box);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.6, 12, 1, false, 0, Math.PI), M.deck);
      lid.rotation.z = Math.PI / 2;
      lid.position.y = 0.19;
      g.add(lid);
      const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffb3d1, emissive: 0xff5fa2, emissiveIntensity: 1.4 });
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 6, 20), ribbonMat);
      ribbon.scale.set(1, 1.15, 0.9);
      ribbon.position.y = 0.05;
      g.add(ribbon);
      const bow = new THREE.Mesh(new THREE.TorusKnotGeometry(0.06, 0.02, 24, 4), ribbonMat);
      bow.position.y = 0.43;
      g.add(bow);
      for (const cx of [-0.29, 0.29]) {
        for (const cz of [-0.2, 0.2]) {
          const corner = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), M.trim);
          corner.position.set(cx, 0, cz);
          g.add(corner);
        }
      }
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
      // реликвия: каменная скрижаль со светящейся спиралью и два кольца вокруг
      const tablet = new THREE.Mesh(RELIC.tablet, M.relicStone);
      g.add(tablet);
      const glyph = new THREE.Mesh(RELIC.spiral, M.relic);
      glyph.position.z = 0.09;
      g.add(glyph);
      const back = glyph.clone();
      back.position.z = -0.09;
      back.rotation.y = Math.PI;
      g.add(back);
      for (const [rr, tilt] of [[0.85, 0.5], [1.0, -0.7]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.025, 6, 48), M.relic);
        ring.rotation.set(Math.PI / 2 + tilt, tilt, 0);
        g.add(ring);
      }
      const light = new THREE.PointLight(0x7ff6ff, 25, 18, 1.8);
      g.add(light);
    }
    mergeChildren(g); // детали припаса — одной сеткой на материал
    // мягкое свечение вокруг припаса (в браузере — с текстурой пятна)
    const glowColor = { food: 0xcff6ff, fuel: 0xffb070, scrap: 0xd0d6ff, relic: 0x80ffff, keepsake: 0xff9fc8 }[type];
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: glowColor, transparent: true, opacity: GLOW.tex ? 0.75 : 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(type === 'relic' || type === 'keepsake' ? 4 : 2.0);
    halo.userData.base = halo.material.opacity;
    g.userData.halo = halo;
    g.add(halo);
    // реликвия и вещь жителя видны издалека: столб света в небо
    if (type === 'relic' || type === 'keepsake') {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.9, 60, 12, 1, true).translate(0, 30, 0),
        new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
      );
      col.position.y = -0.9;
      g.add(col);
      g.userData.beam = col;
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
      const s = new THREE.Mesh(LEECH_SEGS[i], M.leech);
      s.scale.set(1, 0.7, 1.2);
      s.position.z = i * 0.7;
      g.add(s);
      segs.push(s);
    }
    // присоска-рот впереди: розовое кольцо и венчик зубцов
    const mouth = new THREE.Mesh(LEECH_MOUTH, M.leechMouth);
    mouth.position.set(0, -0.02, -0.62);
    g.add(mouth);
    const teeth = new THREE.Mesh(LEECH_TEETH, M.leechTeeth);
    teeth.position.copy(mouth.position);
    g.add(teeth);
    for (const sx of [-0.22, 0.22]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.leechEye);
      e.position.set(sx, 0.26, -0.42);
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

// Слить все меши группы в один на каждый материал (меньше вызовов отрисовки)
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((m) => {
    if (!m.isMesh) return;
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

// Реликвия: скруглённая плита (вытянутый профиль) и спираль-резьба по ней
const RELIC = (() => {
  const sh = new THREE.Shape();
  const w = 0.42;
  const h = 0.62;
  sh.moveTo(-w, -h);
  sh.lineTo(w, -h);
  sh.lineTo(w, h * 0.55);
  sh.quadraticCurveTo(w, h, 0, h);
  sh.quadraticCurveTo(-w, h, -w, h * 0.55);
  sh.lineTo(-w, -h);
  const tablet = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 2, steps: 1 });
  tablet.translate(0, 0, -0.07);
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const a = t * Math.PI * 5;
    const r = 0.04 + t * 0.3;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 1.2 + 0.05, 0));
  }
  const spiral = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.022, 5);
  return { tablet, spiral };
})();

// Кран: брусья-уголки между точками, мачта-ферма 1×1 м, стрела-ферма до 16 м
const CRANE = (() => {
  const beam = (a, b, t = 0.09) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const g2 = new THREE.BoxGeometry(t, len, t);
    g2.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    g2.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return g2.toNonIndexed();
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const parts = [];
  const h = 0.5;
  // мачта: четыре стойки и раскосы через каждые 2 м
  for (const [cx, cz] of [[-h, -h], [h, -h], [h, h], [-h, h]]) parts.push(beam(V(cx, 0, cz), V(cx, 14, cz), 0.14));
  for (let y = 0; y < 14; y += 2) {
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k];
      const [bx, bz] = corners[(k + 1) % 4];
      parts.push(beam(V(ax, y, az), V(bx, y, bz)));
      parts.push(beam(V(ax, y, az), V(bx, y + 2, bz)));
    }
  }
  // стрела: треугольная ферма от мачты до 14 м вперёд и хвост назад
  const top = 13.9;
  const bw = 0.35;
  for (const sx of [-bw, bw]) parts.push(beam(V(sx, top, -5.2), V(sx, top, 14), 0.12));
  parts.push(beam(V(0, top + 0.6, -5.2), V(0, top + 0.6, 14), 0.1));
  for (let z = -5; z < 14; z += 1.5) {
    parts.push(beam(V(-bw, top, z), V(bw, top, z)));
    parts.push(beam(V(-bw, top, z), V(0, top + 0.6, z + 0.75)));
    parts.push(beam(V(bw, top, z), V(0, top + 0.6, z + 0.75)));
  }
  // растяжки от верхушки мачты к концам стрелы
  parts.push(beam(V(0, 16, 0), V(0, top + 0.6, 13.5), 0.05));
  parts.push(beam(V(0, 16, 0), V(0, top + 0.6, -5), 0.05));
  parts.push(beam(V(-h, 14, -h), V(0, 16, 0), 0.1), beam(V(h, 14, h), V(0, 16, 0), 0.1));
  const truss = mergeGeometries(parts);
  // каркас клети
  const cp = [];
  const c = 0.75;
  const cy = 0.7;
  for (const [ax, az] of [[-c, -c], [c, -c], [c, c], [-c, c]]) cp.push(beam(V(ax, -cy, az), V(ax, cy, az), 0.06));
  for (const yy of [-cy, cy]) {
    cp.push(beam(V(-c, yy, -c), V(c, yy, -c), 0.06), beam(V(c, yy, -c), V(c, yy, c), 0.06));
    cp.push(beam(V(c, yy, c), V(-c, yy, c), 0.06), beam(V(-c, yy, c), V(-c, yy, -c), 0.06));
  }
  return { truss, cage: mergeGeometries(cp) };
})();

// Кронштейн фонаря: от столба выгибается дугой и спускается к фонарю, с завитком
const LAMP_ARM = (() => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, 0.28, 0), new THREE.Vector3(0.8, 0.32, 0), new THREE.Vector3(1.0, 0.25, 0),
  ]);
  const arm = new THREE.TubeGeometry(curve, 16, 0.045, 6);
  const scroll = new THREE.TorusGeometry(0.12, 0.03, 6, 14, Math.PI * 1.5);
  scroll.translate(0.22, 0.05, 0);
  return mergeGeometries([arm.toNonIndexed(), scroll.toNonIndexed()]);
})();

// Рыба: тело вращением профиля, тёмная спина и серебристое брюхо,
// полоса вдоль бока; раздвоенный хвост и спинной плавник
const FISH = (() => {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = Math.sin(Math.PI * Math.pow(t, 0.75)) * 0.22 * (1 - 0.35 * t);
    pts.push(new THREE.Vector2(Math.max(0.005, r), (t - 0.5) * 1.05));
  }
  const body = new THREE.LatheGeometry(pts, 18);
  body.rotateX(Math.PI / 2); // толстая часть (голова) — в сторону -z
  body.scale(0.7, 1, 1); // сплюснута с боков
  const ps = body.attributes.position;
  const col = new Float32Array(ps.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < ps.count; i++) {
    const y = ps.getY(i);
    const z = ps.getZ(i);
    const k = Math.max(0, Math.min(1, (y + 0.15) / 0.3));
    c.setRGB(0.78 - k * 0.6, 0.82 - k * 0.55, 0.86 - k * 0.42, THREE.SRGBColorSpace);
    if (Math.abs(y - 0.02) < 0.02) c.setRGB(0.45, 0.62, 0.7, THREE.SRGBColorSpace);
    if (y > 0.05 && Math.sin(z * 40) > 0.6) c.multiplyScalar(0.8);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  body.computeVertexNormals();
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(0.32, 0.26);
  tailShape.quadraticCurveTo(0.2, 0, 0.32, -0.26);
  tailShape.lineTo(0, 0);
  const tail = new THREE.ShapeGeometry(tailShape, 6);
  tail.rotateY(-Math.PI / 2);
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.15, 0);
  finShape.quadraticCurveTo(0, 0.18, 0.2, 0.02);
  finShape.lineTo(-0.15, 0);
  return {
    body,
    tail,
    fin: new THREE.ShapeGeometry(finShape, 6),
    eye: new THREE.SphereGeometry(0.035, 8, 6),
    mat: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.15 }),
    finMat: new THREE.MeshStandardMaterial({ color: 0x5a7f8f, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    eyeMat: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1, metalness: 0.3 }),
  };
})();

// Сегмент пиявки: кольчатое тело, тёмная спина с двумя рыжими полосами, светлее брюхо
function leechSegment(r) {
  const geo = new THREE.SphereGeometry(r, 20, 14);
  const ps = geo.attributes.position;
  const col = new Float32Array(ps.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < ps.count; i++) {
    const x = ps.getX(i);
    const y = ps.getY(i);
    const z = ps.getZ(i);
    const ring = 1 + 0.07 * Math.pow(Math.abs(Math.sin((z / r) * 7)), 3);
    ps.setXYZ(i, x * ring, y * ring, z);
    const side = Math.abs(x / r);
    const stripe = y > 0 && Math.abs(side - 0.42) < 0.09 ? 1 : 0;
    const belly = y < -r * 0.2 ? 1 : 0;
    c.setRGB(0.12, 0.05, 0.11, THREE.SRGBColorSpace);
    if (stripe) c.setRGB(0.62, 0.32, 0.12, THREE.SRGBColorSpace);
    else if (belly) c.setRGB(0.3, 0.2, 0.22, THREE.SRGBColorSpace);
    else if (Math.sin(x * 31) * Math.sin(z * 27) > 0.85) c.setRGB(0.05, 0.02, 0.05, THREE.SRGBColorSpace);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
const LEECH_SEGS = [0, 1, 2, 3].map((i) => leechSegment(0.55 - i * 0.08));
const LEECH_MOUTH = new THREE.TorusGeometry(0.2, 0.07, 8, 18);
const LEECH_TEETH = (() => {
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const t = new THREE.ConeGeometry(0.03, 0.1, 5);
    t.rotateX(Math.PI / 2);
    t.translate(Math.cos(a) * 0.15, Math.sin(a) * 0.15, -0.02);
    parts.push(t);
  }
  return mergeGeometries(parts);
})();

// Ребро Матери: дуга из позвонков — утолщения через равные промежутки,
// у земли кость толще, к вершине тоньше; чуть неровная, как настоящая
export function boneArc(R, rng = Math.random) {
  const geo = new THREE.TorusGeometry(R, 0.55, 12, 96, Math.PI);
  const ps = geo.attributes.position;
  const n = 9 + Math.floor(rng() * 4);
  const wob = rng() * 6;
  for (let k = 0; k < ps.count; k++) {
    const x = ps.getX(k);
    const y = ps.getY(k);
    const z = ps.getZ(k);
    const u = Math.atan2(y, x); // 0..π вдоль дуги
    const cx = Math.cos(u) * R;
    const cy = Math.sin(u) * R;
    const t = u / Math.PI;
    const base = 1.25 - 0.45 * Math.sin(t * Math.PI); // толще у земли
    const knob = 0.22 * Math.pow(Math.max(0, Math.cos(t * n * Math.PI * 2)), 6);
    const lump = 0.05 * Math.sin(t * 23 + wob) * Math.sin(Math.atan2(z, Math.hypot(x, y) - R) * 3);
    const k2 = base + knob + lump;
    ps.setXYZ(k, cx + (x - cx) * k2, cy + (y - cy) * k2, z * k2);
  }
  geo.computeVertexNormals();
  return geo;
}

export function inside(c, x, z, r) {
  if (c.type === 'box') return x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r;
  return Math.hypot(x - c.x, z - c.z) < c.r + r;
}

// Текстуры навешиваются только в браузере (в тестах под Node нет canvas).
// TEX — модуль textures.js.
export function dressMaterials(TEX) {
  GLOW.tex = TEX.glowDot();
  M.ao.map = TEX.glowDot();
  M.pool.map = TEX.glowDot();
  M.ao.opacity = 0.55;
  M.ao.needsUpdate = true;
  WALLS.forEach((hex, i) => {
    const c = new THREE.Color(hex);
    const k = 255 * 1.05;
    const t = TEX.paintedPlanks([Math.min(235, c.r * k), Math.min(235, c.g * k), Math.min(235, c.b * k)]);
    const m = wallMats[i];
    m.map = t.map;
    m.bumpMap = t.bump;
    m.bumpScale = 1.4;
    m.roughnessMap = t.rough;
    m.roughness = 1;
    m.color.set(0xffffff);
    m.needsUpdate = true;
  });
  ROOFS.forEach((hex, i) => {
    const c = new THREE.Color(hex);
    const t = TEX.shingles([c.r * 255 * 1.9, c.g * 255 * 1.9, c.b * 255 * 1.9]);
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
  // кость арок: шероховатая, в трещинах
  const bone = TEX.whaleSkin();
  M.bone.bumpMap = bone.bump;
  M.bone.bumpScale = 1.2;
  M.bone.roughnessMap = bone.rough;
  M.bone.needsUpdate = true;
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
        // ткань сеткой 4×3: складки поперёк, низ отдувает ветром, к низу темнее
        const nrm = new THREE.Vector3(-side.z, 0, side.x);
        const blow = 0.08 + rng() * 0.14;
        const folds = 2 + Math.floor(rng() * 3);
        const at = (i, j) => {
          const fx = i / 4 - 0.5;
          const fy = j / 3;
          const q = p.clone().addScaledVector(side, fx * w);
          q.y -= fy * h * (1 - Math.abs(fx) * 0.06);
          q.addScaledVector(nrm, Math.sin(fx * Math.PI * folds) * 0.035 + fy * fy * blow);
          return q;
        };
        const shade = (j) => 1 - (j / 3) * 0.22;
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            const tri = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]];
            for (const [a2, b2] of tri) {
              const q = at(a2, b2);
              const k = shade(b2) * (0.94 + ((a2 + b2) % 2) * 0.06);
              pos.push(q.x, q.y, q.z);
              col.push(c.r * k, c.g * k, c.b * k);
            }
          }
        }
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
  // одна доска — одна полоса текстуры (а не шесть, как на стене):
  // шесть вариантов, чтобы соседние доски отличались рисунком и тоном
  const variants = [];
  for (let k = 0; k < 6; k++) {
    const g = new THREE.BoxGeometry(2.0, 0.09, 0.42);
    const ps = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < ps.count; i++) uv.setXY(i, (k + 0.06 + ((ps.getZ(i) + 0.21) / 0.42) * 0.88) / 6, (ps.getX(i) + 1) / 2);
    variants.push(g);
  }
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
      const plank = new THREE.Mesh(variants[Math.floor(rng() * 6)], M.deck);
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
