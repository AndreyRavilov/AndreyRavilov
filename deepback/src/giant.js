// Далёкий гигант: иногда у горизонта всплывает спина ещё одного огромного
// существа — родича Матери. Выдыхает фонтан, проходит и снова уходит вглубь.
// Чистая декорация: показывает, что Мать в океане не одна.
import * as THREE from 'three';

const SPOUT_N = 160;

export class DistantGiant {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const skin = new THREE.MeshStandardMaterial({ color: 0x3a4044, roughness: 0.75, metalness: 0.05 });
    // спина: вытянутый эллипсоид с гребнем-плавником
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16), skin);
    back.scale.set(14, 6, 70);
    this.group.add(back);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(3, 9, 8), skin);
    fin.scale.set(0.35, 1, 1.4);
    fin.position.set(0, 7, 18);
    fin.rotation.x = 0.5;
    this.group.add(fin);
    // фонтан: частицы, вылетающие вверх и падающие обратно
    const pos = new Float32Array(SPOUT_N * 3);
    this.vel = new Float32Array(SPOUT_N * 3);
    this.life = new Float32Array(SPOUT_N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.spout = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8f4f8, size: 2.2, transparent: true, opacity: 0.75, depthWrite: false }));
    this.spout.frustumCulled = false;
    this.group.add(this.spout);
    this.t = 0;
    this.active = false;
    this.cool = 40 + Math.random() * 60;
  }

  // dir — направление прохода, R — расстояние от центра
  start(rnd = Math.random) {
    this.active = true;
    this.t = 0;
    this.dur = 70;
    const a = rnd() * Math.PI * 2;
    this.R = 380 + rnd() * 160;
    this.from = new THREE.Vector3(Math.cos(a) * this.R, 0, Math.sin(a) * this.R);
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(260 * (rnd() < 0.5 ? 1 : -1));
    this.to = this.from.clone().add(side);
    this.group.visible = true;
    this.blown = [false, false];
    this.life.fill(0);
  }

  // возвращает true в момент выдоха (для звука)
  update(dt, level, enabled) {
    if (!this.active) {
      if (!enabled) return false;
      this.cool -= dt;
      if (this.cool <= 0) {
        this.start();
        this.cool = 120 + Math.random() * 120;
      }
      return false;
    }
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) {
      this.active = false;
      this.group.visible = false;
      return false;
    }
    // всплывает, идёт вдоль горизонта, уходит вглубь
    const rise = Math.sin(Math.min(1, k * 1.15) * Math.PI);
    this.group.position.lerpVectors(this.from, this.to, k);
    this.group.position.y = level - 6 + rise * 7.5;
    this.group.lookAt(this.to.x, this.group.position.y, this.to.z);
    let blew = false;
    for (const [i, at] of [[0, 0.3], [1, 0.55]]) {
      if (!this.blown[i] && k > at) {
        this.blown[i] = true;
        this.puff();
        blew = true;
      }
    }
    // частицы фонтана в локальных координатах
    const pos = this.spout.geometry.attributes.position.array;
    for (let n = 0; n < SPOUT_N; n++) {
      if (this.life[n] <= 0) {
        pos[n * 3 + 1] = -1000;
        continue;
      }
      this.life[n] -= dt;
      this.vel[n * 3 + 1] -= 9 * dt;
      pos[n * 3] += this.vel[n * 3] * dt;
      pos[n * 3 + 1] += this.vel[n * 3 + 1] * dt;
      pos[n * 3 + 2] += this.vel[n * 3 + 2] * dt;
    }
    this.spout.geometry.attributes.position.needsUpdate = true;
    return blew;
  }

  puff() {
    const pos = this.spout.geometry.attributes.position.array;
    for (let n = 0; n < SPOUT_N; n++) {
      pos[n * 3] = (Math.random() - 0.5) * 2;
      pos[n * 3 + 1] = 6;
      pos[n * 3 + 2] = -40 + (Math.random() - 0.5) * 2;
      this.vel[n * 3] = (Math.random() - 0.5) * 6;
      this.vel[n * 3 + 1] = 16 + Math.random() * 14;
      this.vel[n * 3 + 2] = (Math.random() - 0.5) * 6;
      this.life[n] = 3 + Math.random() * 1.5;
    }
  }
}
