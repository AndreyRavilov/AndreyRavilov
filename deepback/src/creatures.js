// Глубинник — длинное светящееся существо, живущее под Матерью.
// Патрулирует вокруг кита и охотится на тех, кто нырнул.
import * as THREE from 'three';
import { WHALE, backHeight } from './whale.js';

const N = 12;
const SPACING = 1.0;

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d1418, roughness: 0.4, metalness: 0.3, emissive: 0x061a1a, emissiveIntensity: 0.6 });
const spotMat = new THREE.MeshBasicMaterial({ color: 0x5dffc8 });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff27a });
const lureMat = new THREE.MeshBasicMaterial({ color: 0xb6ffe0 });

export class Deepling {
  constructor(scene, angle) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.segs = [];
    this.segPos = [];
    for (let i = 0; i < N; i++) {
      const r = 0.95 * (1 - i / N) + 0.2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), bodyMat);
      m.scale.set(1, 0.8, 1.3);
      if (i % 2 === 1) {
        for (const s of [-1, 1]) {
          const spot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), spotMat);
          spot.position.set(s * r * 0.85, r * 0.3, 0);
          m.add(spot);
        }
      }
      this.group.add(m);
      this.segs.push(m);
      this.segPos.push(new THREE.Vector3());
    }
    const head = this.segs[0];
    for (const s of [-0.4, 0.4]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), eyeMat);
      eye.position.set(s, 0.35, -0.8);
      head.add(eye);
    }
    // приманка, как у удильщика
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), bodyMat);
    stalk.position.set(0, 1.1, -0.6);
    stalk.rotation.x = -0.6;
    head.add(stalk);
    const lure = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lureMat);
    lure.position.set(0, 1.7, -1.2);
    head.add(lure);
    this.light = new THREE.PointLight(0x7dffc8, 18, 16, 1.6);
    this.light.position.copy(lure.position);
    head.add(this.light);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.angle = angle;
    this.cool = 0;
    this.flee = 0;
    this.hunting = false;
    this.phase = Math.random() * 6;
    this.setActive(false);
  }

  setActive(on, level = 0) {
    this.active = on;
    this.group.visible = on;
    if (on) {
      this.pos.set(Math.sin(this.angle) * (WHALE.a + 14), level - 6, Math.cos(this.angle) * (WHALE.b + 16));
      this.vel.set(0, 0, 0);
      this.cool = 0;
      this.flee = 0;
      this.segPos.forEach((p, i) => p.copy(this.pos).add(new THREE.Vector3(Math.sin(this.angle), 0, Math.cos(this.angle)).multiplyScalar(-i * SPACING)));
    }
  }

  // Возвращает 'bite', если укусил игрока
  update(dt, player, ocean, aggressive, speedBoost) {
    if (!this.active) return null;
    this.cool -= dt;
    this.flee -= dt;
    this.phase += dt * 3;
    const surface = ocean.level;
    const toP = new THREE.Vector3(player.pos.x - this.pos.x, player.pos.y + 1 - this.pos.y, player.pos.z - this.pos.z);
    const dP = toP.length();
    this.hunting = this.flee <= 0 && (aggressive || (player.headUnder && dP < 45));

    const target = new THREE.Vector3();
    let speed;
    if (this.flee > 0) {
      target.copy(this.pos).addScaledVector(toP, -1 / (dP || 1) * 20);
      target.y = surface - 12;
      speed = 7;
    } else if (this.hunting) {
      target.set(player.pos.x, player.pos.y + 1, player.pos.z);
      speed = 4.6 + speedBoost;
    } else {
      this.angle += dt * 0.045;
      target.set(Math.sin(this.angle) * (WHALE.a + 14), surface - 7, Math.cos(this.angle) * (WHALE.b + 16));
      speed = 3.5;
    }
    const dir = target.sub(this.pos);
    const dl = dir.length();
    if (dl > 0.01) dir.multiplyScalar(1 / dl);
    this.vel.lerp(dir.multiplyScalar(speed), Math.min(1, dt * 1.8));
    this.pos.addScaledVector(this.vel, dt);

    // остаётся под водой и не залезает в кита
    if (this.pos.y > surface - 1.4) this.pos.y = surface - 1.4;
    const bh = backHeight(this.pos.x, this.pos.z);
    if (isFinite(bh) && this.pos.y < bh + 1.2) this.pos.y = bh + 1.2;
    if (this.pos.y < surface - 45) this.pos.y = surface - 45;

    // хвост следует за головой
    this.segPos[0].copy(this.pos);
    for (let i = 1; i < N; i++) {
      const a = this.segPos[i - 1];
      const b = this.segPos[i];
      const d = a.distanceTo(b);
      if (d > SPACING) b.lerp(a, (d - SPACING) / d);
    }
    for (let i = 0; i < N; i++) {
      const m = this.segs[i];
      m.position.copy(this.segPos[i]);
      m.position.x += Math.sin(this.phase - i * 0.7) * 0.25 * (i / N);
      const next = i === 0 ? this.pos.clone().add(this.vel) : this.segPos[i - 1];
      if (next.distanceToSquared(m.position) > 1e-4) m.lookAt(next);
      m.rotateY(Math.PI);
    }
    this.light.intensity = this.hunting ? 30 + Math.sin(this.phase * 4) * 10 : 14;

    if (dP < 1.8 && this.cool <= 0 && player.swimming) {
      this.cool = 3;
      this.flee = 3.5;
      return 'bite';
    }
    return null;
  }

  scare() {
    this.flee = 8;
    this.cool = 2;
  }
}
