// Косяки рыб: кружат в толще воды у боков Матери. Нырни к косяку и нажми E —
// поймаешь рыбу. Каждый косяк даёт несколько рыб и уплывает.
import * as THREE from 'three';
import { WHALE } from './whale.js';

const FISH_PER = 28;
export const CATCH_RADIUS = 3.2;
export const CATCHES_PER_SCHOOL = 3;

function fishGeo() {
  // маленькая рыбка: веретено и хвост, нос по -z
  const body = new THREE.SphereGeometry(0.12, 8, 6);
  body.scale(0.45, 0.6, 1.6);
  const tail = new THREE.ConeGeometry(0.09, 0.16, 4);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, 0.25);
  const a = body.toNonIndexed();
  const b = tail.toNonIndexed();
  const pos = new Float32Array(a.attributes.position.array.length + b.attributes.position.array.length);
  pos.set(a.attributes.position.array, 0);
  pos.set(b.attributes.position.array, a.attributes.position.array.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Schools {
  constructor(scene) {
    this.scene = scene;
    this.geo = fishGeo();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xc8dce4, metalness: 0.6, roughness: 0.3 });
    this.list = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.e = new THREE.Euler();
  }

  // count — сколько косяков сегодня, rnd — генератор дня
  reset(count, rnd) {
    for (const sc of this.list) this.scene.remove(sc.mesh);
    this.list = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.InstancedMesh(this.geo, this.mat, FISH_PER);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      const fish = [];
      for (let k = 0; k < FISH_PER; k++) {
        fish.push({ r: 0.8 + rnd() * 2.2, ph: rnd() * Math.PI * 2, y: (rnd() - 0.5) * 1.6, sp: 0.8 + rnd() * 0.6 });
      }
      this.list.push({
        mesh,
        fish,
        ang: rnd() * Math.PI * 2, // где по окружности вокруг кита
        off: 6 + rnd() * 12, // как далеко от бока
        depth: 2.5 + rnd() * 4,
        speed: (rnd() < 0.5 ? -1 : 1) * (0.01 + rnd() * 0.012),
        left: CATCHES_PER_SCHOOL,
        flee: 0,
        center: new THREE.Vector3(),
        gone: false,
      });
    }
  }

  // центр косяка: вокруг кита по эллипсу, под поверхностью
  update(dt, t, level) {
    for (const sc of this.list) {
      if (sc.gone) continue;
      sc.ang += sc.speed * dt * (sc.flee > 0 ? 6 : 1);
      if (sc.flee > 0) {
        sc.flee -= dt;
        sc.off += dt * 6;
        if (sc.left <= 0 && sc.off > 60) {
          sc.gone = true;
          sc.mesh.visible = false;
          continue;
        }
      }
      sc.center.set(Math.sin(sc.ang) * (WHALE.a + sc.off), level - sc.depth, Math.cos(sc.ang) * (WHALE.b + sc.off));
      // рыбы кружат вокруг центра, плывут в сторону движения
      for (let k = 0; k < sc.fish.length; k++) {
        const f = sc.fish[k];
        const a = f.ph + t * f.sp * (sc.flee > 0 ? 3 : 1);
        this.v.set(sc.center.x + Math.cos(a) * f.r, sc.center.y + f.y + Math.sin(t * 2 + f.ph) * 0.15, sc.center.z + Math.sin(a) * f.r);
        this.e.set(0, -a, 0);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v, this.q, this.s);
        sc.mesh.setMatrixAt(k, this.m);
      }
      sc.mesh.count = Math.max(4, Math.round(FISH_PER * (sc.left / CATCHES_PER_SCHOOL)));
      sc.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ближайший косяк, до которого можно дотянуться
  near(pos) {
    let best = null;
    let bd = CATCH_RADIUS;
    for (const sc of this.list) {
      if (sc.gone || sc.left <= 0) continue;
      const d = sc.center.distanceTo(pos);
      if (d < bd) { bd = d; best = sc; }
    }
    return best;
  }

  // поймать одну рыбу; косяк шарахается в сторону
  catchFrom(sc) {
    if (!sc || sc.left <= 0) return false;
    sc.left--;
    sc.flee = sc.left > 0 ? 1.5 : 99;
    return true;
  }

  scare(pos, r = 12) {
    for (const sc of this.list) if (!sc.gone && sc.center.distanceTo(pos) < r) sc.flee = Math.max(sc.flee, 2);
  }
}
