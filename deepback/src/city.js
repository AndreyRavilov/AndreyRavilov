// Город Ноа: Ковчег (постоянный), процедурные кварталы, припасы и пиявки.
// Город перестраивается каждый день: ночное погружение всё перемешивает.
import * as THREE from 'three';
import { WHALE, backHeight, backU, BLOWHOLE, pointOnBack } from './whale.js';

export const STEP = 0.7;
export const HATCH = new THREE.Vector3(0, 0, 13);
HATCH.y = backHeight(HATCH.x, HATCH.z);

export const ITEM = {
  food: { name: 'Рыба', weight: 1, icon: '🐟' },
  fuel: { name: 'Бочка ворвани', weight: 3, icon: '🛢️' },
  relic: { name: 'Реликвия', weight: 1, icon: '◈' },
  scrap: { name: 'Обломки', weight: 2, icon: '⚙️' },
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
export const MATERIALS = M;

const WALLS = [0x6f5a46, 0x4f6b6a, 0x7a6a55, 0x5d4a3f, 0x3f5560, 0x8a6e4b, 0x5a5f4c];
const ROOFS = [0x7a3b2a, 0x3d4b52, 0x5b4636, 0x2f3d3a];

function std(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
}
const wallMats = WALLS.map(std);
const roofMats = ROOFS.map(std);

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
    this.buildArk();
  }

  // ---------------- Ковчег ----------------
  buildArk() {
    const g = new THREE.Group();
    const base = backHeight(0, 0) - 2;
    const R = 8.5;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.6, 8, 40), M.steel);
    cyl.position.y = base + 4;
    g.add(cyl);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.rust);
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
  generate(seed, cycle, relicIndex, relicTotal) {
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
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMats[Math.floor(rng() * wallMats.length)]);
    walls.position.y = h / 2;
    g.add(walls);

    const roofMat = roofMats[Math.floor(rng() * roofMats.length)];
    let top = base + h;
    if (rng() < 0.5) {
      const rh = 2 + rng() * 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(hx, hz) * 1.05, rh, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = h + rh / 2;
      g.add(roof);
    } else {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.4, d + 0.8), roofMat);
      slab.position.y = h + 0.2;
      g.add(slab);
      top += 0.4;
      if (rng() < 0.6) {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8), M.rust);
        ch.position.set((rng() - 0.5) * w * 0.6, h + 1.3, (rng() - 0.5) * d * 0.6);
        g.add(ch);
      }
    }
    // дверь и окна
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.2), M.dark);
    door.position.set(0, backHeight(x, z + hz) - base + 1.1, hz + 0.05);
    g.add(door);
    const winCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < winCount; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.15), M.window);
      const side = rng() < 0.5 ? -1 : 1;
      win.position.set(side * (hx + 0.03), h - 1.6 - rng() * 1.5, (rng() - 0.5) * (d - 1.5));
      win.rotation.y = Math.PI / 2;
      g.add(win);
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
  }

  addCrate(rng, x, z) {
    const s = 1 + rng() * 0.8;
    const y = backHeight(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), rng() < 0.5 ? M.rust : wallMats[2]);
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
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14, 0.8), M.rust);
    mast.position.y = 7;
    g.add(mast);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 16), M.rust);
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
    const halo = new THREE.Mesh(new THREE.SphereGeometry(type === 'relic' ? 1.5 : 1.0, 12, 8), M.glow);
    halo.material = M.glow.clone();
    halo.material.color.set({ food: 0xcff6ff, fuel: 0xffb070, scrap: 0xd0d6ff, relic: 0x80ffff }[type]);
    g.add(halo);
    const gy = y ?? this.groundAt(x, z);
    g.position.set(x, gy + 0.9, z);
    g.traverse((c) => c.isMesh && c !== halo && (c.castShadow = true));
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
    this.group.add(g);
    this.leeches.push({ mesh: g, segs, x, z, dir: rng() * Math.PI * 2, cool: 0, phase: rng() * 6, push: null });
  }
}

export function inside(c, x, z, r) {
  if (c.type === 'box') return x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r;
  return Math.hypot(x - c.x, z - c.z) < c.r + r;
}
