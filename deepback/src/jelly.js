// Медузы: дрейфуют у боков Матери в толще воды. Жалят, если подплыть вплотную;
// один удар гарпуном — и медуза лопается облачком искр.
import * as THREE from 'three';
import { WHALE } from './whale.js';

export const STING = 9; // урон ожога
export const STING_RADIUS = 1.35;
const TENT = 7;

function bellGeo() {
  // колокол: полусфера, края чуть загнуты внутрь и волнисты
  const g = new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const rim = 1 - Math.max(0, (0.3 - y) / 0.3); // 1 у купола, 0 у края
    const wave = 1 + 0.06 * Math.sin(a * 8) * (1 - rim);
    p.setXYZ(i, x * wave, y * 0.8, z * wave);
  }
  g.computeVertexNormals();
  return g;
}

function tentGeo() {
  // щупальца — тонкие ленты, свисающие с края колокола
  const geos = [];
  for (let k = 0; k < TENT; k++) {
    const a = (k / TENT) * Math.PI * 2;
    const len = 1.1 + (k % 3) * 0.35;
    const c = new THREE.CylinderGeometry(0.02, 0.006, len, 3, 4, true);
    c.translate(Math.cos(a) * 0.32, 0.05 - len / 2, Math.sin(a) * 0.32);
    geos.push(c.toNonIndexed());
  }
  let n = 0;
  for (const g of geos) n += g.attributes.position.array.length;
  const pos = new Float32Array(n);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.array.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Jellies {
  constructor(scene) {
    this.scene = scene;
    this.bell = bellGeo();
    this.tent = tentGeo();
    this.bellMat = new THREE.MeshStandardMaterial({
      color: 0xe2b8ff, emissive: 0x9a5cff, emissiveIntensity: 0.7, roughness: 0.2,
      transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    });
    this.tentMat = new THREE.MeshBasicMaterial({ color: 0xd9a8ff, transparent: true, opacity: 0.45, depthWrite: false });
    this.list = [];
  }

  // count — сколько медуз сегодня; rnd — генератор дня
  reset(count, rnd) {
    for (const j of this.list) this.scene.remove(j.mesh);
    this.list = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Group();
      const bell = new THREE.Mesh(this.bell, this.bellMat);
      const tent = new THREE.Mesh(this.tent, this.tentMat);
      mesh.add(bell, tent);
      bell.renderOrder = tent.renderOrder = 3;
      this.scene.add(mesh);
      this.list.push({
        mesh,
        bell,
        tent,
        ang: rnd() * Math.PI * 2,
        off: 7 + rnd() * 10, // бок Матери под водой шире кромки — ближе медуза оказалась бы в нём
        depth: 1.2 + rnd() * 4,
        speed: (rnd() < 0.5 ? -1 : 1) * (0.004 + rnd() * 0.006),
        ph: rnd() * Math.PI * 2,
        size: 0.8 + rnd() * 0.6,
        x: 0,
        y: 0,
        z: 0,
        hp: 1,
        maxHp: 1,
        cool: 0,
        dead: false,
        pop: 0,
      });
    }
    this.update(0, 0, 0, null);
  }

  get alive() {
    return this.list.filter((j) => !j.dead);
  }

  // Возвращает медузу, которая только что ужалила ныряльщика, или null
  update(dt, t, level, player) {
    let stung = null;
    for (const j of this.list) {
      if (j.dead) {
        // лопнула: колокол раздувается и тает
        if (j.pop > 0) {
          j.pop -= dt;
          const k = 1 - Math.max(0, j.pop) / 0.4;
          j.mesh.scale.setScalar(j.size * (1 + k * 0.8));
          this.fade(j, 1 - k);
          if (j.pop <= 0) j.mesh.visible = false;
        }
        continue;
      }
      j.ang += j.speed * dt;
      j.cool = Math.max(0, j.cool - dt);
      // толчок колокола: короткое сжатие и подъём, потом медленное опускание
      const beat = Math.pow(Math.max(0, Math.sin(t * 1.6 + j.ph)), 6);
      const ax = WHALE.a + j.off;
      const bz = WHALE.b + j.off;
      j.x = Math.sin(j.ang) * ax;
      j.z = Math.cos(j.ang) * bz;
      j.y = level - j.depth + Math.sin(t * 0.4 + j.ph) * 0.5 + beat * 0.25;
      j.mesh.position.set(j.x, j.y, j.z);
      j.mesh.scale.set(j.size * (1 - beat * 0.18), j.size * (1 + beat * 0.12), j.size * (1 - beat * 0.18));
      j.tent.rotation.x = Math.sin(t * 0.9 + j.ph) * 0.12;
      j.tent.rotation.z = Math.cos(t * 0.7 + j.ph) * 0.12;
      if (player && player.swimming && j.cool <= 0) {
        const dx = player.pos.x - j.x;
        const dy = player.pos.y + 0.9 - j.y;
        const dz = player.pos.z - j.z;
        if (dx * dx + dy * dy + dz * dz < STING_RADIUS * STING_RADIUS * j.size * j.size) {
          j.cool = 2.5;
          stung = j;
        }
      }
    }
    return stung;
  }

  fade(j, k) {
    // у каждой лопнувшей медузы — свой материал, чтобы таять отдельно
    if (j.bell.material === this.bellMat) {
      j.bell.material = this.bellMat.clone();
      j.tent.material = this.tentMat.clone();
    }
    j.bell.material.opacity = 0.55 * k;
    j.tent.material.opacity = 0.45 * k;
  }

  kill(j) {
    if (j.dead) return;
    j.dead = true;
    j.hp = 0;
    j.pop = 0.4;
  }

  // Ярче светятся в светящемся море и ночью
  setGlow(k) {
    this.bellMat.emissiveIntensity = 0.5 + k * 1.6;
  }
}
