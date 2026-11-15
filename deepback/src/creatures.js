// Глубинник — длинное светящееся существо, живущее под Матерью.
// Патрулирует вокруг кита и охотится на тех, кто нырнул.
import * as THREE from 'three';
import { WHALE, backHeight } from './whale.js';

const N = 12;
const SPACING = 1.0;

const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x0d1418, roughness: 0.6, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.35, emissive: 0x061a1a, emissiveIntensity: 0.6 });
const finMat = new THREE.MeshStandardMaterial({ color: 0x1c3a3c, roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, emissive: 0x0a3a34, emissiveIntensity: 0.5, depthWrite: false });
const toothMat = new THREE.MeshStandardMaterial({ color: 0xd8e6dc, roughness: 0.25, emissive: 0x13261e, emissiveIntensity: 0.5 });
const throatMat = new THREE.MeshBasicMaterial({ color: 0x3a0710 });

// Перепончатый плавник: треугольник с изогнутой кромкой и «лучами»
function finGeo(len, h) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(len * 0.35, h * 1.1, len, h * 0.25);
  shape.lineTo(len * 0.85, 0);
  shape.lineTo(0, 0);
  return new THREE.ShapeGeometry(shape, 8);
}
// Ряд зубов-игл вдоль челюсти
function teethRow(w, n, len, down) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = (t - 0.5) * Math.PI * 0.9;
    const cone = new THREE.ConeGeometry(0.035, len * (0.6 + 0.4 * Math.cos(a)), 5);
    if (down) cone.rotateX(Math.PI);
    cone.translate(Math.sin(a) * w, 0, -Math.cos(a) * w * 0.9);
    parts.push(cone);
  }
  return parts;
}
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
    // пасть удильщика: нижняя челюсть на шарнире, иглы зубов сверху и снизу, тёмная глотка
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), throatMat);
    throat.position.set(0, -0.15, -0.95);
    throat.scale.set(1, 0.5, 0.8);
    head.add(throat);
    const upper = new THREE.Group();
    for (const g of teethRow(0.62, 11, 0.32, true)) upper.add(new THREE.Mesh(g, toothMat));
    upper.position.set(0, -0.08, -0.62);
    head.add(upper);
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.32, -0.15);
    const jawBone = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bodyMat);
    jawBone.scale.set(0.95, 0.45, 1.15);
    jawBone.position.z = -0.72;
    this.jaw.add(jawBone);
    const lower = new THREE.Group();
    for (const g of teethRow(0.6, 10, 0.36, false)) lower.add(new THREE.Mesh(g, toothMat));
    lower.position.set(0, 0.02, -0.92);
    this.jaw.add(lower);
    head.add(this.jaw);
    // грудные плавники
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo(1.1, 0.5), finMat);
      fin.position.set(s * 0.8, -0.1, 0.1);
      fin.rotation.set(0, s > 0 ? -0.4 : Math.PI + 0.4, -0.35 * s);
      head.add(fin);
    }
    // спинной гребень по всему телу и хвостовой плавник
    for (let i = 2; i < N - 1; i += 2) {
      const r = 0.95 * (1 - i / N) + 0.2;
      const crest = new THREE.Mesh(finGeo(0.9, 0.45 * r + 0.2), finMat);
      crest.rotation.y = Math.PI / 2;
      crest.position.set(0, r * 0.75, 0.4);
      this.segs[i].add(crest);
    }
    const tail = new THREE.Mesh(finGeo(1.2, 0.9), finMat);
    tail.rotation.y = -Math.PI / 2;
    tail.position.set(0, 0, 0.1);
    this.segs[N - 1].add(tail);
    const tail2 = tail.clone();
    tail2.scale.y = -1;
    this.segs[N - 1].add(tail2);
    for (const s of [-0.4, 0.4]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), eyeMat);
      eye.position.set(s * 1.15, 0.42, -0.92);
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
    // пасть приоткрыта всегда, на охоте — распахнута
    const open = this.hunting ? 0.55 + Math.sin(this.phase * 2.5) * 0.15 : 0.12 + Math.sin(this.phase * 0.7) * 0.06;
    this.jaw.rotation.x += (open - this.jaw.rotation.x) * Math.min(1, dt * 4);

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
