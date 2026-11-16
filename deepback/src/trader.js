// Лодка торговца: в некоторые дни к краю спины Матери причаливает
// лодка с фонарём. Торговец меняет припасы Ковчега на то, чего не хватает.
import * as THREE from 'three';
import { WHALE, pointOnBack } from './whale.js';

// Предложения: что отдаёшь (из запасов Ковчега) и что получаешь
export const OFFERS = [
  { id: 'fish4scrap', give: { food: 2 }, get: { scrap: 3 }, title: '2 рыбы → 3 обломка', note: '«Железо мне ни к чему, а вот рыбу съем».' },
  { id: 'scrap4fuel', give: { scrap: 3 }, get: { fuel: 1 }, title: '3 обломка → бочка ворвани', note: '«Ворвань с южных китов, горит ровно».' },
  { id: 'fuel4food', give: { fuel: 1 }, get: { food: 3 }, title: 'бочка ворвани → 3 рыбы', note: '«Свежая, утренний улов».' },
  { id: 'scrap4bombs', give: { scrap: 2 }, get: { bombs: 2 }, title: '2 обломка → 2 солевые бомбы', note: '«Против пиявок — первое дело».' },
];

// Придёт ли торговец сегодня: со второго дня, примерно каждый третий день
export function traderComes(seed, cycle) {
  if (cycle < 2) return false;
  let h = (seed ^ Math.imul(cycle + 17, 0x2c1b3c6d)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39) >>> 0;
  return h % 3 === 0;
}

// Можно ли совершить обмен при таких запасах; возвращает новые запасы или причину
export function trade(stock, offerId) {
  const o = OFFERS.find((x) => x.id === offerId);
  if (!o) return { ok: false, why: 'Нет такого товара.' };
  for (const [k, n] of Object.entries(o.give)) if ((stock[k] || 0) < n) return { ok: false, why: 'Не хватает запасов.' };
  const out = { ...stock };
  for (const [k, n] of Object.entries(o.give)) out[k] -= n;
  for (const [k, n] of Object.entries(o.get)) out[k] = (out[k] || 0) + n;
  return { ok: true, stock: out };
}

export class TraderBoat {
  constructor(scene) {
    this.scene = scene;
    this.group = this.build();
    this.group.visible = false;
    scene.add(this.group);
    this.active = false;
    this.angle = 0;
    this.pos = new THREE.Vector3();
  }

  build() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.85, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 });
    // корпус: половина вытянутого веретена, нос по -z
    const hullGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    hullGeo.scale(1.3, 0.8, 3.2);
    const hull = new THREE.Mesh(hullGeo, wood);
    g.add(hull);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32), dark);
    rim.scale.set(1.3, 3.2, 1);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    for (const z of [-1.2, 0, 1.2]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.35), dark);
      seat.position.set(0, -0.2, z);
      g.add(seat);
    }
    // вёсла
    for (const s of [-1, 1]) {
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 5), wood);
      oar.rotation.z = -s * (Math.PI / 2 - 0.3); // почти горизонтально, наружный конец — в воду
      oar.position.set(s * 1.75, -0.25, 0.3);
      g.add(oar);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.7), wood);
      blade.position.set(s * 3.15, -0.68, 0.3);
      g.add(blade);
    }
    // мачта с фонарём
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), dark);
    pole.position.set(0, 1.0, -2.2);
    g.add(pole);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffa040, emissiveIntensity: 3 }));
    lantern.position.set(0, 2.0, -2.2);
    g.add(lantern);
    this.light = new THREE.PointLight(0xffa860, 25, 14, 1.6);
    this.light.position.copy(lantern.position);
    g.add(this.light);
    // ящики и мешки с товаром
    for (const [x, z, s] of [[-0.5, 1.4, 0.5], [0.45, 1.6, 0.4], [0, 0.7, 0.45]]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), wood);
      box.position.set(x, -0.1 + s / 2, z);
      box.rotation.y = x;
      g.add(box);
    }
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 }));
    sack.scale.y = 0.75;
    sack.position.set(-0.55, 0.05, 0.6);
    g.add(sack);
    // торговец в плаще с капюшоном
    const cloak = new THREE.MeshStandardMaterial({ color: 0x3e4a3a, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 10), cloak);
    body.position.set(0, 0.5, -0.6);
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.6 }));
    head.position.set(0, 1.28, -0.66);
    g.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), cloak);
    hood.position.set(0, 1.32, -0.6);
    hood.rotation.x = 0.35;
    g.add(hood);
    g.traverse((m) => m.isMesh && (m.castShadow = true));
    return g;
  }

  // где причалить: у кромки воды, в стороне от шлюза
  arrive(seed, cycle) {
    this.active = true;
    this.group.visible = true;
    this.angle = 0.9 + ((seed + cycle * 131) % 1000) / 1000 * 1.2; // справа от шлюза
  }

  leave() {
    this.active = false;
    this.group.visible = false;
  }

  // каждый кадр: лодка держится у кромки (вода поднимается — лодка ближе к центру)
  update(t, level, surfaceAt) {
    if (!this.active) return;
    const u = level <= 0 ? 0.999 : 1 - Math.pow(Math.min(0.995, level / WHALE.H), 2);
    const p = pointOnBack(Math.min(0.999, u), this.angle);
    const L = Math.hypot(p.x, p.z) || 1;
    const x = p.x + (p.x / L) * 2.6;
    const z = p.z + (p.z / L) * 2.6;
    this.pos.set(x, surfaceAt(x, z), z);
    this.group.position.set(x, this.pos.y + 0.55 + Math.sin(t * 1.3) * 0.08, z);
    this.group.rotation.set(Math.sin(t * 0.9) * 0.05, Math.atan2(p.x, p.z), Math.sin(t * 1.1) * 0.06);
    this.light.intensity = 18 + Math.sin(t * 7) * 3;
  }
}
