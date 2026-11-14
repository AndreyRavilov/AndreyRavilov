import * as THREE from 'three';
import { STEP, inside, ITEM } from './city.js';
import { backHeight } from './whale.js';

const R = 0.45;
const HEIGHT = 1.8;
export const CAPACITY = 8;

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 20, 18);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI;
    this.onGround = false;
    this.swimming = false;
    this.headUnder = false;
    this.oxygen = 1;
    this.carried = [];
    this.walkPhase = 0;
    // параметры, которые меняют улучшения Ковчега
    this.capacity = CAPACITY;
    this.oxyTime = 22;
    this.swimMul = 1;
    this.walkMul = 1;
    this.loadMul = 0.07;
    this.swing = 0;
    this.mesh = this.build();
    scene.add(this.mesh);
  }

  build() {
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.75 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a55a, roughness: 0.3, metalness: 0.85 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2a6a80, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });

    const leather = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.7 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.5, metalness: 0.8 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd080, emissiveIntensity: 2 });
    suit.color.set(0xc9772c);
    suit.roughness = 0.92;
    const add = (geo, mat, x, y, z, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    // торс: плотный холщовый костюм, ремень с латунной пряжкой
    const torso = add(new THREE.CapsuleGeometry(0.36, 0.5, 6, 14), suit, 0, 1.0, 0);
    torso.scale.set(1.05, 1, 0.9);
    add(new THREE.TorusGeometry(0.36, 0.05, 8, 20), leather, 0, 0.78, 0).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.12, 0.09, 0.05), brass, 0, 0.78, -0.35);
    // нагрудник-манишка, на нём держится шлем
    const corselet = add(new THREE.CylinderGeometry(0.3, 0.42, 0.22, 16), brass, 0, 1.36, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(new THREE.SphereGeometry(0.025, 6, 4), iron, Math.sin(a) * 0.36, 1.3, Math.cos(a) * 0.36);
    }
    void corselet;

    // шлем: латунная сфера, три иллюминатора с решётками, клапан сверху
    const head = new THREE.Group();
    head.position.y = 1.66;
    g.add(head);
    this.head = head;
    add(new THREE.SphereGeometry(0.34, 22, 16), brass, 0, 0, 0, head);
    const port = (x, z, ry, r) => {
      const ring = add(new THREE.TorusGeometry(r, 0.035, 8, 20), brass, x, 0, z, head);
      ring.rotation.y = ry;
      const gl = add(new THREE.CircleGeometry(r, 18), glass, x * 0.99, 0, z * 0.99, head);
      gl.rotation.y = ry + Math.PI;
      for (const k of [-1, 0, 1]) {
        const bar = add(new THREE.BoxGeometry(0.018, r * 2, 0.018), iron, x * 1.02 + Math.cos(ry) * k * r * 0.5, 0, z * 1.02 - Math.sin(ry) * k * r * 0.5, head);
        bar.rotation.y = ry;
      }
    };
    port(0, -0.32, 0, 0.15);
    port(-0.31, -0.06, Math.PI / 2 - 0.15, 0.09);
    port(0.31, -0.06, -Math.PI / 2 + 0.15, 0.09);
    add(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10), brass, 0, 0.36, 0, head);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), brass, 0.12, 0.28, 0.2, head).rotation.x = 0.6;
    // лампа над стеклом
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), iron, 0, 0.27, -0.2, head).rotation.x = Math.PI / 2 - 0.4;
    add(new THREE.CircleGeometry(0.05, 12), lampMat, 0, 0.29, -0.27, head).rotation.x = -0.4;

    // руки
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 0.43, 1.25, 0);
      g.add(arm);
      add(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), suit, 0, -0.27, 0, arm);
      add(new THREE.SphereGeometry(0.1, 10, 8), leather, 0, -0.58, 0, arm).scale.set(1, 1.2, 1);
      add(new THREE.TorusGeometry(0.1, 0.025, 6, 14), brass, 0, -0.48, 0, arm).rotation.x = Math.PI / 2;
      this.arms.push(arm);
    }

    // баллоны со шлангом и ремнями
    for (const s of [-0.13, 0.13]) {
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.62, 14), brass, s, 1.05, 0.36);
      add(new THREE.SphereGeometry(0.12, 12, 8), brass, s, 1.36, 0.36);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), iron, s, 1.5, 0.36);
    }
    add(new THREE.TorusGeometry(0.42, 0.03, 6, 20), leather, 0, 1.12, 0.05).rotation.x = Math.PI / 2;
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.13, 1.52, 0.36), new THREE.Vector3(0.2, 1.75, 0.3), new THREE.Vector3(0.24, 1.75, 0.05),
    ]), 12, 0.03, 6), leather);
    g.add(hose);

    // ноги в тяжёлых ботинках с латунными носами
    this.legs = [];
    for (const s of [-0.16, 0.16]) {
      const leg = new THREE.Group();
      leg.position.set(s, 0.72, 0);
      g.add(leg);
      add(new THREE.CapsuleGeometry(0.13, 0.38, 4, 8), suit, 0, -0.3, 0, leg);
      add(new THREE.BoxGeometry(0.24, 0.16, 0.36), leather, 0, -0.63, -0.04, leg);
      add(new THREE.BoxGeometry(0.25, 0.08, 0.12), brass, 0, -0.67, -0.2, leg);
      this.legs.push(leg);
    }
    const lamp = new THREE.SpotLight(0xfff0c8, 0, 30, 0.5, 0.5, 1.2);
    lamp.position.set(0, 1.95, -0.45);
    lamp.target.position.set(0, 1.0, -6);
    g.add(lamp, lamp.target);
    this.lamp = lamp;

    // гарпун-шест
    const pole = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), brass);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -1.1;
    pole.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0xdfe8ea, metalness: 0.9, roughness: 0.2 }));
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -2.3;
    pole.add(tip);
    pole.position.set(0.3, 1.1, 0);
    pole.visible = false;
    g.add(pole);
    this.pole = pole;

    // груз на спине
    this.pack = new THREE.Group();
    this.pack.position.set(0, 1.5, 0.62);
    g.add(this.pack);
    this.packMat = {
      food: new THREE.MeshStandardMaterial({ color: 0x9fc3d6, metalness: 0.5, roughness: 0.3 }),
      fuel: new THREE.MeshStandardMaterial({ color: 0xb4532a }),
      scrap: new THREE.MeshStandardMaterial({ color: 0x8a96a0, metalness: 0.8, roughness: 0.4 }),
      keepsake: new THREE.MeshStandardMaterial({ color: 0xffb3d1, emissive: 0xff5fa2, emissiveIntensity: 1 }),
      relic: new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0x5ff0ff, emissiveIntensity: 1.4 }),
    };
    g.traverse((c) => c.isMesh && (c.castShadow = true));
    return g;
  }

  get weight() {
    return this.carried.reduce((s, t) => s + ITEM[t].weight, 0);
  }

  refreshPack() {
    while (this.pack.children.length) this.pack.remove(this.pack.children[0]);
    let y = 0;
    for (const t of this.carried) {
      const size = t === 'fuel' ? 0.45 : 0.3;
      const m = new THREE.Mesh(
        t === 'fuel' ? new THREE.CylinderGeometry(size * 0.7, size * 0.7, size * 1.2, 10) : new THREE.BoxGeometry(size, size, size),
        this.packMat[t]
      );
      m.position.y = y + size / 2;
      m.castShadow = true;
      this.pack.add(m);
      y += size * (t === 'fuel' ? 1.2 : 1);
    }
  }

  reset(pos) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.oxygen = 1;
    this.carried = [];
    this.refreshPack();
  }

  update(dt, input, yaw, world) {
    const { colliders, ocean, current } = world;

    // --- ввод ---
    let ix = 0;
    let iz = 0;
    if (input.has('KeyW') || input.has('ArrowUp')) iz -= 1;
    if (input.has('KeyS') || input.has('ArrowDown')) iz += 1;
    if (input.has('KeyA')) ix -= 1;
    if (input.has('KeyD')) ix += 1;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let mx = rx * ix - fx * iz;
    let mz = rz * ix - fz * iz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }

    const surface = ocean.surfaceAt(this.pos.x, this.pos.z);
    const depth = surface - this.pos.y;
    this.swimming = depth > 1.0;
    this.headUnder = surface > this.pos.y + 1.65;

    const sprint = input.has('ShiftLeft') || input.has('ShiftRight');
    const load = Math.max(0.45, 1 - this.loadMul * this.weight);
    let speed = (sprint ? 11 : 6.5) * load * this.walkMul;
    if (this.swimming) speed = (sprint ? 5.5 : 4) * Math.max(0.55, load) * this.swimMul;

    const accel = this.onGround ? 14 : this.swimming ? 4 : 3;
    const k = Math.min(1, accel * dt);
    // порыв ветра в шторм: в прыжке и на бегу сносит сильно,
    // стоящего на месте — почти нет (иначе персонаж «сам идёт»)
    let windK = 0;
    if (world.wind && !this.swimming) windK = !this.onGround ? 1 : ml > 0 ? 0.8 : 0.15;
    const wx = world.wind ? world.wind.x * windK : 0;
    const wz = world.wind ? world.wind.z * windK : 0;
    this.vel.x += (mx * speed + wx - this.vel.x) * k;
    this.vel.z += (mz * speed + wz - this.vel.z) * k;

    // --- вертикаль ---
    if (this.swimming) {
      let target = Math.max(-3, Math.min(3, (depth - 1.3) * 2.5));
      if (input.has('Space')) target = 5;
      if (input.has('KeyC') || input.has('ControlLeft')) target = -5;
      target -= current;
      this.vel.y += (target - this.vel.y) * Math.min(1, 3 * dt);
    } else {
      this.vel.y -= 30 * dt;
      if (this.onGround && input.has('Space')) {
        this.vel.y = 11;
        this.onGround = false;
      }
    }

    // --- горизонтальное движение + стены ---
    const ox = this.pos.x;
    const oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    for (const c of colliders) {
      const top = c.topAt ? c.topAt(this.pos.x, this.pos.z) : c.top;
      if (this.pos.y + HEIGHT < c.bottom || this.pos.y >= top - STEP) continue;
      if (!inside(c, this.pos.x, this.pos.z, R)) continue;
      if (c.type === 'box') {
        const l = this.pos.x - (c.minX - R);
        const r = c.maxX + R - this.pos.x;
        const b = this.pos.z - (c.minZ - R);
        const f = c.maxZ + R - this.pos.z;
        const m = Math.min(l, r, b, f);
        if (m === l) { this.pos.x -= l; this.vel.x = Math.min(0, this.vel.x); }
        else if (m === r) { this.pos.x += r; this.vel.x = Math.max(0, this.vel.x); }
        else if (m === b) { this.pos.z -= b; this.vel.z = Math.min(0, this.vel.z); }
        else { this.pos.z += f; this.vel.z = Math.max(0, this.vel.z); }
      } else {
        const dx = this.pos.x - c.x;
        const dz = this.pos.z - c.z;
        const d = Math.hypot(dx, dz) || 1;
        const need = c.r + R;
        this.pos.x = c.x + (dx / d) * need;
        this.pos.z = c.z + (dz / d) * need;
      }
    }
    // крутой подъём из воды на бок кита
    const gNew = world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (gNew > this.pos.y + 1.6) {
      this.pos.x = ox;
      this.pos.z = oz;
    }
    // граница океана
    const dist = Math.hypot(this.pos.x, this.pos.z);
    if (dist > 300) {
      this.pos.x *= 300 / dist;
      this.pos.z *= 300 / dist;
    }

    // --- вертикальное движение + земля ---
    this.pos.y += this.vel.y * dt;
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const wasGround = this.onGround;
    this.onGround = false;
    if (this.pos.y <= g) {
      this.pos.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    } else if (wasGround && !this.swimming && this.vel.y <= 0 && this.pos.y - g < 0.6) {
      this.pos.y = g; // прилипаем к склону
      this.vel.y = 0;
      this.onGround = true;
    }

    // --- кислород ---
    if (this.headUnder) this.oxygen -= dt / this.oxyTime;
    else this.oxygen = Math.min(1, this.oxygen + dt / 3);

    // --- анимация ---
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5) this.facing = Math.atan2(-this.vel.x, -this.vel.z);
    this.walkPhase += dt * hs * (this.swimming ? 0.8 : 1.6);
    const sw = Math.sin(this.walkPhase) * Math.min(1, hs / 5) * 0.6;
    this.legs[0].rotation.x = sw;
    this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw * 0.8;
    this.arms[1].rotation.x = sw * 0.8;
    // в воде руки гребут, на суше чуть разведены
    const swim = this.swimming ? Math.sin(this.walkPhase * 1.3) * 0.9 : 0;
    this.arms[0].rotation.z = -0.12 - Math.abs(swim) * 0.6;
    this.arms[1].rotation.z = 0.12 + Math.abs(swim) * 0.6;
    if (this.head) this.head.position.y = 1.66 + Math.abs(Math.sin(this.walkPhase)) * 0.02 * Math.min(1, hs / 5);
    this.mesh.position.copy(this.pos);
    let cur = this.mesh.rotation.y;
    let diff = this.facing - cur;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.mesh.rotation.y = cur + diff * Math.min(1, dt * 10);
    this.mesh.rotation.x = this.swimming ? -0.9 * Math.min(1, hs / 3) : 0;
    // выпад гарпуном
    if (this.swing > 0) {
      this.swing -= dt;
      const k = Math.sin(Math.max(0, this.swing) / 0.35 * Math.PI);
      this.pole.visible = true;
      this.pole.position.z = -k * 0.9;
    } else this.pole.visible = false;
  }
}

export { backHeight };
