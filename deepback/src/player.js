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

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.6, 6, 12), suit);
    body.position.y = 0.95;
    g.add(body);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), brass);
    helmet.position.y = 1.62;
    g.add(helmet);
    const visor = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), glass);
    visor.position.set(0, 1.62, -0.34);
    visor.rotation.y = Math.PI;
    g.add(visor);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.07, 8, 18), brass);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.32;
    g.add(collar);
    for (const s of [-0.14, 0.14]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 10), brass);
      tank.position.set(s, 1.05, 0.38);
      g.add(tank);
    }
    this.legs = [];
    for (const s of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.45, 4, 8), dark);
      leg.position.set(s, 0.35, 0);
      g.add(leg);
      this.legs.push(leg);
    }
    const lamp = new THREE.SpotLight(0xfff0c8, 0, 30, 0.5, 0.5, 1.2);
    lamp.position.set(0, 1.62, -0.3);
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
