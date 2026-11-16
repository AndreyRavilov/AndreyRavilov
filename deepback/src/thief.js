// Чайка-воришка: с третьего дня иногда пикирует на ныряльщика с рыбой в грузе.
// Предупреждение — крик и тень; если не отогнать гарпуном (F) за пару секунд,
// чайка утащит одну рыбу и улетит.
import * as THREE from 'three';
import { makeGull } from './ambient.js';

export const WARN_TIME = 2.6; // секунд от крика до кражи

export class ThiefGull {
  constructor(scene) {
    const gm = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.8, side: THREE.DoubleSide });
    const dm = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.8, side: THREE.DoubleSide });
    this.mesh = makeGull(gm, dm);
    this.mesh.scale.setScalar(1.6);
    this.mesh.visible = false;
    scene.add(this.mesh);
    // тень под чайкой — заметный сигнал опасности
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.visible = false;
    scene.add(this.shadow);
    this.state = 'idle'; // idle | dive | flee
    this.t = 0;
    this.cool = 40;
    this.pos = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.fish = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6).scale(2.2, 0.55, 1), new THREE.MeshStandardMaterial({ color: 0x9fc3d6, metalness: 0.5, roughness: 0.3 }));
    this.fish.position.set(0, -0.35, 0);
    this.fish.visible = false;
    this.mesh.add(this.fish);
  }

  reset(enabled) {
    this.enabled = enabled;
    this.state = 'idle';
    this.cool = 35 + Math.random() * 40;
    this.mesh.visible = false;
    this.shadow.visible = false;
  }

  // ev: 'warn' — начало пике, 'steal' — утащила рыбу, null — ничего
  update(dt, player, groundY, time) {
    if (!this.enabled) return null;
    let ev = null;
    if (this.state === 'idle') {
      const hasFish = player.carried.includes('food');
      if (!hasFish || player.swimming) return null;
      this.cool -= dt;
      if (this.cool > 0) return null;
      this.state = 'dive';
      this.t = 0;
      const a = Math.random() * Math.PI * 2;
      this.from.set(player.pos.x + Math.cos(a) * 30, player.pos.y + 22, player.pos.z + Math.sin(a) * 30);
      this.mesh.visible = true;
      this.shadow.visible = true;
      this.fish.visible = false;
      ev = 'warn';
    }
    if (this.state === 'dive') {
      this.t += dt;
      const k = Math.min(1, this.t / WARN_TIME);
      const target = new THREE.Vector3(player.pos.x, player.pos.y + 2.2, player.pos.z);
      // плавная дуга: сначала полого, потом резко вниз
      this.pos.lerpVectors(this.from, target, k * k * (3 - 2 * k));
      if (k >= 1) {
        if (player.carried.includes('food')) {
          player.carried.splice(player.carried.lastIndexOf('food'), 1);
          player.refreshPack();
          ev = 'steal';
          this.fish.visible = true;
        }
        this.flee(player);
      }
    } else if (this.state === 'flee') {
      this.t += dt;
      this.pos.addScaledVector(this.vel, dt);
      this.vel.y += dt * 2;
      if (this.t > 5) {
        this.state = 'idle';
        this.cool = 50 + Math.random() * 50;
        this.mesh.visible = false;
        this.shadow.visible = false;
      }
    }
    if (this.state !== 'idle') {
      const dir = this.state === 'flee' ? this.vel : this.pos.clone().sub(this.from);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(this.state === 'dive' ? 0.5 : -0.3, Math.atan2(-dir.x, -dir.z), 0);
      const flap = Math.sin(time * (this.state === 'flee' ? 14 : 4));
      this.mesh.userData.wings[0].rotation.z = -flap * 0.6;
      this.mesh.userData.wings[1].rotation.z = flap * 0.6;
      this.shadow.position.set(this.pos.x, groundY(this.pos.x, this.pos.z) + 0.06, this.pos.z);
      const h = Math.max(1, this.pos.y - this.shadow.position.y);
      this.shadow.scale.setScalar(Math.min(2.5, 0.6 + 8 / h));
      this.shadow.material.opacity = Math.min(0.45, 3 / h);
    }
    return ev;
  }

  flee(player) {
    this.state = 'flee';
    this.t = 0;
    const a = Math.random() * Math.PI * 2;
    this.vel = new THREE.Vector3(Math.cos(a) * 12, 7, Math.sin(a) * 12);
    void player;
  }

  // гарпун: отогнать, если чайка пикирует и близко
  scare(pos, range) {
    if (this.state !== 'dive') return false;
    void pos; void range; // пикирует прямо на ныряльщика — удар всегда достаёт
    this.fish.visible = false;
    this.flee();
    return true;
  }
}
