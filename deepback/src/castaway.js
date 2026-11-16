// Выживший на плоту: в некоторые дни у Матери дрейфует плот с человеком
// из погибшего города. Доплыви, нажми E — в Ковчеге станет на одного больше.
import * as THREE from 'three';
import { WHALE } from './whale.js';

export const RESCUE_RADIUS = 3.5;

// Будет ли плот сегодня: с третьего дня, примерно каждый четвёртый день
export function castawayComes(seed, cycle) {
  if (cycle < 3) return false;
  let h = (seed ^ Math.imul(cycle + 101, 0x5bd1e995)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d) >>> 0;
  return h % 4 === 0;
}

export class Castaway {
  constructor(scene) {
    this.group = this.build();
    this.group.visible = false;
    scene.add(this.group);
    this.active = false;
    this.pos = new THREE.Vector3();
    this.t = 0;
  }

  build() {
    const g = new THREE.Group();
    const log = new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: 0.95 });
    // плот из пяти брёвен, связанных верёвкой
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 3.2, 8), log);
      l.rotation.x = Math.PI / 2;
      l.position.set(-0.9 + i * 0.45, 0, (i % 2) * 0.15);
      g.add(l);
    }
    const rope = new THREE.MeshStandardMaterial({ color: 0x3b3128, roughness: 1 });
    for (const z of [-1.1, 1.1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.1), rope);
      r.position.set(0, 0.2, z);
      g.add(r);
    }
    // мачта с лоскутом-флагом
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), log);
    mast.position.set(0.6, 1.3, -0.9);
    g.add(mast);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 4, 2), new THREE.MeshStandardMaterial({ color: 0xc23a2a, roughness: 0.9, side: THREE.DoubleSide }));
    this.flag.position.set(1.05, 2.3, -0.9);
    g.add(this.flag);
    // человек: машет руками
    const coat = new THREE.MeshStandardMaterial({ color: 0x5a6e7a, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd8ac8a, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.6, 4, 8), coat);
    body.position.set(-0.2, 0.75, 0.2);
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skin);
    head.position.set(-0.2, 1.35, 0.2);
    g.add(head);
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(-0.2 + s * 0.3, 1.1, 0.2);
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.45, 4, 6), coat);
      a.position.y = 0.3;
      arm.add(a);
      g.add(arm);
      this.arms.push(arm);
    }
    // фонарь-сигнал: мигает, чтобы плот было видно в сумерках
    this.beacon = new THREE.PointLight(0xff6a4a, 0, 20, 1.6);
    this.beacon.position.set(0.6, 2.7, -0.9);
    g.add(this.beacon);
    g.traverse((m) => m.isMesh && (m.castShadow = true));
    return g;
  }

  // плот появляется в 14–30 м от бока Матери, в стороне от шлюза
  arrive(seed, cycle) {
    this.active = true;
    this.group.visible = true;
    const r = ((seed ^ (cycle * 7919)) >>> 0) / 4294967296;
    this.angle = Math.PI * (0.35 + r * 1.3) * (r < 0.5 ? 1 : -1);
    this.off = 14 + r * 16;
  }

  leave() {
    this.active = false;
    this.group.visible = false;
  }

  update(dt, level, surfaceAt, dark) {
    if (!this.active) return;
    this.t += dt;
    const a = this.angle + Math.sin(this.t * 0.05) * 0.03; // медленно дрейфует
    const x = Math.sin(a) * (WHALE.a + this.off);
    const z = Math.cos(a) * (WHALE.b + this.off);
    const y = surfaceAt(x, z);
    this.pos.set(x, y, z);
    this.group.position.set(x, y + 0.1, z);
    this.group.rotation.set(Math.sin(this.t * 0.8) * 0.06, a + Math.PI / 2, Math.sin(this.t * 1.1) * 0.05);
    // машет над головой
    this.arms[0].rotation.z = 0.45 + Math.sin(this.t * 6) * 0.4; // руки вверх, машет
    this.arms[1].rotation.z = -0.45 - Math.sin(this.t * 6 + 1) * 0.4;
    const fp = this.flag.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(this.t * 5 + fp.getX(i) * 4) * 0.08 * (fp.getX(i) + 0.45));
    fp.needsUpdate = true;
    this.beacon.intensity = dark > 0.4 ? (Math.sin(this.t * 4) > 0 ? 30 : 4) : 0;
  }

  near(p) {
    return this.active && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < RESCUE_RADIUS && Math.abs(p.y - this.pos.y) < 3;
  }
}
