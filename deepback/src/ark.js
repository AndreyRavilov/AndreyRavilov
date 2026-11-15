// Ковчег изнутри: ночное убежище жителей. Здесь покупают улучшения и оружие,
// записывают день в летопись и ложатся спать.
import * as THREE from 'three';
import { RESIDENTS, NIGHT_ROLES } from './residents.js';

export const ARK_R = 11; // радиус зала: просторно, чтобы камера не упиралась в ныряльщика
const K = ARK_R / 8; // всё, что расставлено по кругу, растёт вместе с залом
export const DOOR = new THREE.Vector3(0, 0, 6.6 * K);

// Где кто стоит: угол (0 — у двери, +z) и расстояние от центра
const PLACES = {
  tagir: { a: 1.25, r: 5.6 * K },
  bran: { a: -1.25, r: 5.6 * K },
  osk: { a: Math.PI, r: 5.4 * K },
  agata: { a: 0.35, r: 2.2 * K },
  mira: { a: -2.2, r: 5.2 * K },
  lina: { a: 2.25, r: 5.0 * K },
  yos: { a: 0.75, r: 3.6 * K },
  vey: { a: -0.7, r: 3.7 * K },
};
const BED = { a: 2.75, r: 6.4 * K };

// Внешность жителей: одежда, кожа, волосы, головной убор
const LOOKS = {
  mira: { body: 0x6b4e7a, skin: 0xe0b89a, hair: 0xd8d8d8, hat: 'scarf', hatColor: 0x8a3b3b, scale: 0.93 },
  tagir: { body: 0x3e5560, skin: 0xb98a65, hair: 0x2a2018, hat: 'cap', hatColor: 0x2b2b2b, beard: true, scale: 1.02 },
  yos: { body: 0x4f8a63, skin: 0xe9c3a1, hair: 0x6b4a2c, hat: null, scale: 0.62 },
  agata: { body: 0x7a3a24, skin: 0xd09a78, hair: 0x2a1a12, hat: 'scarf', hatColor: 0x3b3b3b, scale: 1.0 },
  bran: { body: 0x2e3438, skin: 0xa77a5c, hair: 0x8a8a8a, hat: null, beard: true, scale: 1.08 },
  lina: { body: 0xd8d0c0, skin: 0xedc8a8, hair: 0xa0522d, hat: null, scale: 0.95 },
  osk: { body: 0x2a2a46, skin: 0xd8b090, hair: 0x9a9a9a, hat: 'tall', hatColor: 0x1d1d2c, scale: 1.0 },
  vey: { body: 0x5a6e8a, skin: 0xe2b896, hair: 0xc8a050, hat: 'cap', hatColor: 0x5a6e8a, scale: 0.85 },
};

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
}

function villager(look) {
  const g = new THREE.Group();
  const body = std(look.body);
  const skin = std(look.skin, { roughness: 0.6 });
  const dark = std(0x2a2420);
  const add = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  for (const s of [-0.13, 0.13]) {
    add(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), dark, s, 0.38, 0);
    // тяжёлые сапоги
    add(new THREE.BoxGeometry(0.17, 0.12, 0.28), std(0x1c1612, { roughness: 0.55 }), s, 0.06, -0.04);
  }
  const torso = add(new THREE.CapsuleGeometry(0.3, 0.55, 6, 12), body, 0, 1.05, 0);
  torso.scale.set(1, 1, 0.8);
  // фартук/юбка — расширение книзу
  add(new THREE.CylinderGeometry(0.3, 0.42, 0.45, 12), body, 0, 0.72, 0);
  // пояс с пряжкой, воротник, пуговицы и заплатка
  const belt = add(new THREE.TorusGeometry(0.31, 0.035, 6, 20), std(0x2b1d14, { roughness: 0.5 }), 0, 0.92, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.82, 1);
  add(new THREE.BoxGeometry(0.08, 0.06, 0.03), std(0xb08a50, { metalness: 0.8, roughness: 0.35 }), 0, 0.92, -0.255);
  const collar = add(new THREE.TorusGeometry(0.17, 0.05, 6, 16), body, 0, 1.52, 0);
  collar.rotation.x = Math.PI / 2;
  for (const y of [1.36, 1.2, 1.04]) add(new THREE.SphereGeometry(0.022, 6, 4), std(0x3a2c22), 0, y, -0.245);
  const patchCol = new THREE.Color(look.body).offsetHSL(0.03, -0.15, -0.07);
  add(new THREE.BoxGeometry(0.12, 0.12, 0.02), std(patchCol), 0.13, 1.12, -0.235).rotation.z = 0.3;
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.36, 1.32, 0);
    add(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), body, 0, -0.27, 0, arm);
    add(new THREE.SphereGeometry(0.08, 8, 6), skin, 0, -0.56, 0, arm);
    arm.rotation.z = s * 0.12;
    g.add(arm);
    arms.push(arm);
  }
  const head = new THREE.Group();
  head.position.y = 1.72;
  g.add(head);
  add(new THREE.SphereGeometry(0.2, 16, 12), skin, 0, 0, 0, head);
  // лицо смотрит вперёд (по -z): белки и зрачки, брови, нос, уши, рот
  const white = std(0xf2ece0, { roughness: 0.3 });
  const pupil = std(0x15110e, { roughness: 0.2 });
  for (const s of [-0.07, 0.07]) {
    add(new THREE.SphereGeometry(0.03, 8, 6), white, s, 0.03, -0.172, head).scale.set(1, 0.8, 0.6);
    add(new THREE.SphereGeometry(0.016, 6, 4), pupil, s, 0.03, -0.192, head);
    const brow = add(new THREE.BoxGeometry(0.06, 0.012, 0.015), std(look.hair), s, 0.085, -0.178, head);
    brow.rotation.z = -s * 1.5;
    add(new THREE.SphereGeometry(0.04, 8, 6), skin, s * 2.75, 0.0, -0.01, head).scale.set(0.5, 1, 0.8);
  }
  const nose = add(new THREE.SphereGeometry(0.035, 8, 6), std(new THREE.Color(look.skin).offsetHSL(0, 0.05, -0.06), { roughness: 0.6 }), 0, -0.02, -0.2, head);
  nose.scale.set(0.8, 1, 1.2);
  add(new THREE.BoxGeometry(0.07, 0.012, 0.01), std(0x5a2e26), 0, -0.085, -0.182, head);
  const hairMat = std(look.hair);
  const hair = add(new THREE.SphereGeometry(0.205, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, 0, 0.02, 0.02, head);
  hair.rotation.x = -0.25;
  if (look.beard) add(new THREE.SphereGeometry(0.15, 10, 8), hairMat, 0, -0.12, -0.09, head).scale.set(1, 0.9, 0.7);
  if (look.hat === 'cap') {
    add(new THREE.SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(look.hatColor), 0, 0.05, 0, head);
    add(new THREE.BoxGeometry(0.22, 0.03, 0.14), std(look.hatColor), 0, 0.06, -0.22, head);
  } else if (look.hat === 'scarf') {
    add(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), std(look.hatColor), 0, 0.01, 0.02, head);
  } else if (look.hat === 'tall') {
    add(new THREE.CylinderGeometry(0.17, 0.19, 0.3, 14), std(look.hatColor), 0, 0.27, 0, head);
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 18), std(look.hatColor), 0, 0.13, 0, head);
  }
  g.scale.setScalar(look.scale || 1);
  g.userData = { head, arms, phase: Math.random() * 6 };
  return g;
}

// Спящий в гамаке безымянный житель
function hammock(mat, sleeper) {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 14, 1, true, Math.PI * 0.15, Math.PI * 0.7), mat);
  cloth.rotation.z = Math.PI / 2;
  cloth.rotation.y = Math.PI;
  cloth.position.y = 1.05;
  g.add(cloth);
  for (const s of [-1.15, 1.15]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 4), std(0x3b3128));
    rope.position.set(s, 1.8, 0);
    rope.rotation.z = s * 0.25;
    g.add(rope);
  }
  if (sleeper) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 8), std(sleeper));
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 0.92, 0);
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), std(0xd8ac8a));
    head.position.set(-0.85, 0.98, 0);
    g.add(head);
  }
  return g;
}

export class ArkInterior {
  constructor(TEX) {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x07090b);
    scene.fog = new THREE.Fog(0x0b0d10, 14, 40);
    this.colliders = [];
    this.stations = [];
    this.time = 0;

    // свет: тёплая печь и фонари, холодный отсвет воды из иллюминаторов
    scene.add(new THREE.HemisphereLight(0x8fb4c8, 0x2a1a10, 0.35));
    this.stoveLight = new THREE.PointLight(0xff8a3a, 40, 16, 1.6);
    this.stoveLight.position.set(0, 1.6, 0);
    this.stoveLight.castShadow = true;
    scene.add(this.stoveLight);
    this.lamps = [];
    for (const [x, z] of [[4 * K, 2.5 * K], [-4 * K, 2.5 * K], [0, -4.6 * K], [0, 6 * K]]) {
      const l = new THREE.PointLight(0xffc070, 16, 14, 1.6);
      l.position.set(x, 4.6, z);
      scene.add(l);
      this.lamps.push(l);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffb860, emissiveIntensity: 3 }));
      bulb.position.copy(l.position);
      scene.add(bulb);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.2, 4), std(0x222222));
      chain.position.set(x, 6.3, z);
      scene.add(chain);
    }

    // пол из досок
    const floorMat = std(0x8a6a4a);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6d7a80, roughness: 0.75, metalness: 0.4, side: THREE.BackSide });
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x80503a, roughness: 0.8, metalness: 0.3, side: THREE.BackSide });
    if (TEX) {
      const p = TEX.planks([150, 112, 78]);
      p.map.repeat.set(5, 5);
      p.bump.repeat.set(5, 5);
      floorMat.map = p.map;
      floorMat.bumpMap = p.bump;
      floorMat.color.set(0xffffff);
      // стены — крашеные клёпаные листы (морская зелень), потолок — дощатый
      const w = TEX.paintedPanels([84, 122, 116]);
      for (const k of ['map', 'bump', 'rough']) w[k].repeat.set(10, 2);
      Object.assign(wallMat, { map: w.map, bumpMap: w.bump, roughnessMap: w.rough, roughness: 1, metalness: 0.25 });
      wallMat.color.set(0xffffff);
      const d = TEX.planks([128, 96, 66]);
      d.map.repeat.set(18, 3);
      d.bump.repeat.set(18, 3);
      Object.assign(domeMat, { map: d.map, bumpMap: d.bump, bumpScale: 1.2, roughness: 0.9, metalness: 0 });
      domeMat.color.set(0xffffff);
      this.wainscot = TEX.planks([118, 84, 56]);
      this.wainscot.map.repeat.set(26, 1);
      this.wainscot.bump.repeat.set(26, 1);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARK_R + 0.2, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARK_R + 0.2, ARK_R + 0.2, 7, 64, 1, true), wallMat);
    wall.position.y = 3.5;
    wall.receiveShadow = true;
    scene.add(wall);
    // деревянная обшивка снизу и поручень над ней
    const wainMat = std(0x7a5a3e);
    if (this.wainscot) Object.assign(wainMat, { map: this.wainscot.map, bumpMap: this.wainscot.bump, bumpScale: 1.2 });
    if (this.wainscot) wainMat.color.set(0xffffff);
    wainMat.side = THREE.BackSide;
    const wain = new THREE.Mesh(new THREE.CylinderGeometry(ARK_R + 0.1, ARK_R + 0.1, 1.4, 48, 1, true), wainMat);
    wain.position.y = 0.7;
    wain.receiveShadow = true;
    scene.add(wain);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(ARK_R + 0.02, 0.06, 6, 64), std(0x5a3a22));
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 1.42;
    scene.add(rail);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(ARK_R + 0.2, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.y = 7;
    dome.scale.y = 0.62; // приплюснутый купол: зал шире, но не колодец
    scene.add(dome);
    // рёбра купола
    for (let i = 0; i < 12; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(ARK_R, 0.09, 6, 32, Math.PI / 2), std(0x2a2a2a, { metalness: 0.6 }));
      rib.position.y = 7;
      rib.scale.set(0.62, 1, 1); // локальная ось x после поворота смотрит вверх
      rib.rotation.set(0, (i / 12) * Math.PI * 2, Math.PI / 2);
      scene.add(rib);
    }

    // иллюминаторы: за ними тёмная вода, по ним изредка проходит свет
    this.portMats = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      if (Math.abs(Math.sin(a / 2)) < 0.12) continue; // не над дверью
      const x = Math.sin(a) * ARK_R;
      const z = Math.cos(a) * ARK_R;
      const pm = new THREE.MeshStandardMaterial({ color: 0x061418, emissive: 0x0e3a44, emissiveIntensity: 1 });
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), pm);
      glass.position.set(x * 0.995, 3.6, z * 0.995);
      glass.lookAt(0, 3.6, 0);
      scene.add(glass);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.08, 8, 20), std(0xb08a50, { metalness: 0.9, roughness: 0.3 }));
      ring.position.copy(glass.position);
      ring.lookAt(0, 3.6, 0);
      scene.add(ring);
      this.portMats.push({ mat: pm, a });
    }

    // дверь-шлюз
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.6, 0.3), std(0x1d2124, { metalness: 0.6 }));
    door.position.set(0, 1.8, ARK_R - 0.05);
    scene.add(door);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 20), std(0xb08a50, { metalness: 0.9, roughness: 0.3 }));
    wheel.position.set(0, 1.9, ARK_R - 0.25);
    scene.add(wheel);

    // печь в центре
    const iron = std(0x2b2d30, { metalness: 0.7, roughness: 0.5 });
    const stove = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 1.3, 20), iron);
    stove.position.y = 0.65;
    stove.castShadow = true;
    scene.add(stove);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 9, 12), iron);
    pipe.position.y = 5.5;
    scene.add(pipe);
    this.fireMat = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff6a1a, emissiveIntensity: 3 });
    const fire = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.05), this.fireMat);
    fire.position.set(0, 0.6, 1.03);
    scene.add(fire);
    this.colliders.push({ type: 'circle', x: 0, z: 0, r: 1.15, bottom: -1, topAt: () => 3 });

    // станции: верстак, оружейная стойка, летопись, свой гамак
    const pos = (p) => new THREE.Vector3(Math.sin(p.a) * p.r, 0, Math.cos(p.a) * p.r);
    const wood = std(0x6a4a30);
    const bench = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.9), wood);
    top.position.y = 0.95;
    bench.add(top);
    for (const [x, z] of [[-1, -0.35], [1, -0.35], [-1, 0.35], [1, 0.35]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), wood);
      leg.position.set(x, 0.47, z);
      bench.add(leg);
    }
    // тиски, молоток, ключ, шестерни; за верстаком — щит с инструментом на гвоздях
    const steel = std(0x8a96a0, { metalness: 0.8, roughness: 0.35 });
    const darkSteel = std(0x3a3f44, { metalness: 0.7, roughness: 0.5 });
    const vise = new THREE.Group();
    vise.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.22), darkSteel));
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), darkSteel);
    jaw.position.set(0, 0.02, -0.18);
    vise.add(jaw);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), steel);
    screw.rotation.z = Math.PI / 2;
    screw.position.set(0, 0.02, -0.26);
    vise.add(screw);
    vise.position.set(-0.75, 1.12, -0.2);
    bench.add(vise);
    const hammer = new THREE.Group();
    const hh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 6), wood);
    hh.rotation.z = Math.PI / 2;
    hammer.add(hh);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.16), darkSteel);
    hd.position.x = 0.2;
    hammer.add(hd);
    hammer.position.set(-0.1, 1.06, 0.1);
    hammer.rotation.y = 0.5;
    bench.add(hammer);
    const wrench = new THREE.Group();
    wrench.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.04), steel));
    const wh = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 12, Math.PI * 1.6), steel);
    wh.rotation.x = Math.PI / 2;
    wh.position.x = 0.2;
    wrench.add(wh);
    wrench.position.set(0.35, 1.04, -0.15);
    wrench.rotation.y = -0.4;
    bench.add(wrench);
    for (const [gx, gz, gr] of [[0.75, 0.1, 0.12], [0.6, -0.2, 0.08]]) {
      const gear = new THREE.Mesh(new THREE.TorusGeometry(gr, gr * 0.35, 6, 10), std(0xb08a50, { metalness: 0.85, roughness: 0.35 }));
      gear.rotation.x = Math.PI / 2;
      gear.position.set(gx, 1.05, gz);
      bench.add(gear);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 0.06), std(0x7a5a3a));
    board.position.set(0, 1.75, 0.42);
    bench.add(board);
    for (let i = 0; i < 6; i++) {
      const tool = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3 + (i % 3) * 0.1, 0.03), i % 2 ? steel : darkSteel);
      tool.position.set(-0.8 + i * 0.32, 1.72, 0.38);
      tool.rotation.z = (i % 2 ? 0.15 : -0.1);
      bench.add(tool);
    }
    this.placeStation(bench, PLACES.tagir, 1.4, 'workshop');

    const rack = new THREE.Group();
    // щит из досок с поперечинами
    for (let i = 0; i < 5; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.39, 2.2, 0.08), std(i % 2 ? 0x6a4a30 : 0x5e4129));
      plank.position.set(-0.8 + i * 0.4, 1.3, 0.04);
      rack.add(plank);
    }
    for (const yy of [0.6, 2.0]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.06), std(0x3f2a1a));
      bar.position.set(0, yy, -0.04);
      rack.add(bar);
    }
    const shaftMat = std(0xb89a70);
    const tipMat = std(0xc8d2d8, { metalness: 0.9, roughness: 0.25 });
    // остроги в ряд, наконечником вверх
    for (let i = 0; i < 3; i++) {
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2, 6), shaftMat);
      spear.position.set(0.25 + i * 0.28, 1.25, -0.12);
      rack.add(spear);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), tipMat);
      tip.position.set(0.25 + i * 0.28, 2.33, -0.12);
      rack.add(tip);
    }
    // два гарпуна накрест
    for (const s2 of [-1, 1]) {
      const h = new THREE.Group();
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), shaftMat);
      h.add(sh);
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 4), tipMat);
      t.position.y = 1.0;
      h.add(t);
      for (const bs of [-1, 1]) {
        const barb = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 4), tipMat);
        barb.position.set(bs * 0.06, 0.86, 0);
        barb.rotation.z = bs * 2.6;
        h.add(barb);
      }
      h.position.set(-0.5, 1.4, -0.14);
      h.rotation.z = s2 * 0.55;
      rack.add(h);
    }
    // ящик солевых бомб и ракетница на крюке
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.45), std(0x6a4a30));
    crate.position.set(-0.45, 0.18, -0.35);
    rack.add(crate);
    for (let i = 0; i < 4; i++) {
      const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), std(0xe8e4d8, { roughness: 1 }));
      bomb.position.set(-0.72 + i * 0.18, 0.42, -0.35 + (i % 2) * 0.08);
      rack.add(bomb);
    }
    const flare = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 10), std(0xc23a2a, { roughness: 0.5 }));
    barrel.rotation.z = Math.PI / 2;
    flare.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.08), std(0x3a2a1e));
    grip.position.set(-0.12, -0.1, 0);
    flare.add(grip);
    flare.position.set(0.55, 0.9, -0.12);
    rack.add(flare);
    this.placeStation(rack, PLACES.bran, 1.4, 'armory');

    const lectern = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 1.1, 8), wood);
    stand.position.y = 0.55;
    lectern.add(stand);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.6), wood);
    desk.position.y = 1.15;
    desk.rotation.x = -0.35;
    lectern.add(desk);
    // раскрытая летопись: две половины переплёта, страницы, лента-закладка и перо
    const book = new THREE.Group();
    for (const s2 of [-1, 1]) {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.46), std(0x5a1e1e));
      cover.position.set(s2 * 0.17, 0, 0);
      cover.rotation.z = -s2 * 0.08;
      book.add(cover);
      const pages = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.04, 0.42), std(0xe8dcc0, { roughness: 1 }));
      pages.position.set(s2 * 0.165, 0.035, 0);
      pages.rotation.z = -s2 * 0.08;
      book.add(pages);
    }
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.3), std(0xa02020));
    ribbon.position.set(0.02, 0.06, 0.25);
    ribbon.rotation.x = 0.6;
    book.add(ribbon);
    const quill = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.36, 5), std(0xf2ece0));
    quill.rotation.z = 1.2;
    quill.position.set(0.25, 0.08, -0.12);
    book.add(quill);
    book.position.set(0, 1.22, 0);
    book.rotation.x = -0.35;
    lectern.add(book);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc070, emissiveIntensity: 2 }));
    candle.position.set(0.35, 1.3, 0.1);
    lectern.add(candle);
    this.placeStation(lectern, PLACES.osk, 1.3, 'chronicle');

    this.hammockMat = std(0xc9b79a, { side: THREE.DoubleSide });
    const bed = hammock(this.hammockMat, null);
    this.placeStation(bed, BED, 1.6, 'bed');

    this.furnish(TEX);

    this.people = new THREE.Group();
    scene.add(this.people);
    this.labelPoints = [];
    this.DOOR = DOOR;
    this.bedPos = pos(BED);
  }

  // Обстановка зала: ковёр, полки, бочки, стол, связки сушёной рыбы
  furnish(TEX) {
    const wood = std(0x6a4a30);
    const at = (ang, r) => [Math.sin(ang) * r, Math.cos(ang) * r];
    const block = (x, z, rad, top = 2.5) => this.colliders.push({ type: 'circle', x, z, r: rad, bottom: -1, topAt: () => top });

    // ковёр вокруг печи
    const rugMat = new THREE.MeshStandardMaterial({ color: 0x8a3b2a, roughness: 1 });
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const bands = ['#7a2f22', '#c99a4a', '#3b4a5a', '#7a2f22', '#e0c890', '#5a2a1e', '#c99a4a', '#3b4a5a'];
      bands.forEach((col, i) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(128, 128, 128 - i * 15, 0, Math.PI * 2);
        g.fill();
      });
      g.strokeStyle = '#e0c890';
      g.lineWidth = 3;
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        g.beginPath();
        g.moveTo(128 + Math.cos(ang) * 60, 128 + Math.sin(ang) * 60);
        g.lineTo(128 + Math.cos(ang) * 100, 128 + Math.sin(ang) * 100);
        g.stroke();
      }
      rugMat.map = new THREE.CanvasTexture(c);
      rugMat.map.colorSpace = THREE.SRGBColorSpace;
      rugMat.color.set(0xffffff);
    }
    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.012;
    rug.receiveShadow = true;
    this.scene.add(rug);

    // полки с банками у стены
    {
      const [x, z] = at(1.8, ARK_R - 0.7);
      const shelf = new THREE.Group();
      shelf.position.set(x, 0, z);
      shelf.lookAt(0, 0, 0);
      for (const y of [0.6, 1.4, 2.2]) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.45), wood);
        board.position.y = y;
        shelf.add(board);
        for (let i = 0; i < 6; i++) {
          const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 10), new THREE.MeshStandardMaterial({ color: [0x9fbfa0, 0xc8a050, 0x8a5a3a, 0xb0c8d0][i % 4], roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 }));
          jar.position.set(-0.9 + i * 0.36, y + 0.16, 0);
          shelf.add(jar);
        }
      }
      for (const s of [-1.05, 1.05]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.45), wood);
        side.position.set(s, 1.25, 0);
        shelf.add(side);
      }
      shelf.traverse((m) => m.isMesh && (m.castShadow = true));
      this.scene.add(shelf);
      block(x, z, 1.1);
    }

    // бочки и мешки
    for (const [ang, n] of [[-1.8, 4], [0.62, 2], [-0.62, 3]]) {
      const [x, z] = at(ang, ARK_R - 1.0);
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 12), std(0x7a4a2a));
        const off = (i - (n - 1) / 2) * 0.85;
        b.position.set(x + Math.cos(ang) * off, 0.48, z - Math.sin(ang) * off);
        b.castShadow = true;
        this.scene.add(b);
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.03, 6, 16), std(0x222222, { metalness: 0.7 }));
        hoop.rotation.x = Math.PI / 2;
        hoop.position.copy(b.position);
        this.scene.add(hoop);
      }
      block(x, z, 0.4 + n * 0.42);
    }
    for (let i = 0; i < 3; i++) {
      const [x, z] = at(-2.75 + i * 0.12, ARK_R - 0.9);
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), std(0xb8a07a, { roughness: 1 }));
      sack.scale.set(1, 1.25, 0.85);
      sack.position.set(x, 0.48, z);
      sack.castShadow = true;
      this.scene.add(sack);
    }

    // стол с кружками
    {
      const [x, z] = at(2.05, 3.4);
      const t = new THREE.Group();
      t.position.set(x, 0, z);
      const topm = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 18), wood);
      topm.position.y = 0.85;
      t.add(topm);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.85, 8), wood);
      leg.position.y = 0.42;
      t.add(leg);
      for (let i = 0; i < 3; i++) {
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 10), std(0x9a9a92, { metalness: 0.6, roughness: 0.4 }));
        mug.position.set(Math.cos(i * 2.1) * 0.4, 0.96, Math.sin(i * 2.1) * 0.4);
        t.add(mug);
      }
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0x6a4a30));
      bowl.position.y = 1.08;
      t.add(bowl);
      t.traverse((m) => m.isMesh && (m.castShadow = true));
      this.scene.add(t);
      block(x, z, 0.85, 1);
    }

    // связки сушёной рыбы под потолком
    const fishMat = std(0xa89070, { roughness: 0.7, metalness: 0.2 });
    for (const [ang, r] of [[0.9, 5.2], [-0.9, 5.2], [2.6, 4.5], [-2.5, 4.6]]) {
      const [x, z] = at(ang, r);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.6, 4), std(0x3b3128));
      rope.position.set(x, 5.3, z);
      this.scene.add(rope);
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), fishMat);
        f.scale.set(0.5, 1.8, 0.3);
        f.position.set(x + (i % 2 ? 0.08 : -0.08), 4.4 - i * 0.32, z);
        f.rotation.y = i;
        this.scene.add(f);
      }
    }
  }

  placeStation(obj, p, radius, kind) {
    const x = Math.sin(p.a) * p.r;
    const z = Math.cos(p.a) * p.r;
    obj.position.set(x, 0, z);
    obj.lookAt(0, 0, 0);
    obj.rotateY(Math.PI); // станции собраны «лицом» к -z — разворачиваем к залу
    obj.traverse((c) => c.isMesh && (c.castShadow = c.receiveShadow = true));
    this.scene.add(obj);
    this.colliders.push({ type: 'circle', x, z, r: 0.85, bottom: -1, topAt: () => 3 });
    this.stations.push({ kind, x, z, radius: radius + 0.85, label: { workshop: 'Верстак', armory: 'Оружейная стойка', chronicle: 'Летопись', bed: 'Твой гамак' }[kind] });
  }

  // Каждую ночь: живые жители на своих местах, остальные спят в гамаках
  setup(alive, pop) {
    while (this.people.children.length) this.people.remove(this.people.children[0]);
    this.colliders = this.colliders.filter((c) => !c.person);
    this.stations = this.stations.filter((s) => s.kind !== 'talk');
    this.npcs = [];
    for (const id of alive) {
      const p = PLACES[id];
      const r = RESIDENTS.find((x) => x.id === id);
      if (!p || !r) continue;
      const count = id === 'vey' ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const v = villager(LOOKS[id]);
        const off = count > 1 ? (k - 0.5) * 0.9 : 0;
        const a = p.a + off / p.r;
        // жители магазинов стоят чуть ближе к центру, за своим прилавком
        const rr = NIGHT_ROLES[id] ? p.r - 1.3 : p.r;
        v.position.set(Math.sin(a) * rr, 0, Math.cos(a) * rr);
        v.lookAt(0, 0, 0);
        v.rotateY(Math.PI);
        this.people.add(v);
        this.npcs.push({ id, mesh: v, name: r.name });
        this.colliders.push({ type: 'circle', x: v.position.x, z: v.position.z, r: 0.45, bottom: -1, topAt: () => 2.2, person: true });
        if (k === 0) this.stations.push({ kind: NIGHT_ROLES[id] ? NIGHT_ROLES[id].shop : 'talk', who: id, x: v.position.x, z: v.position.z, radius: 1.9, label: r.name, person: true });
      }
    }
    // безымянные жители — в гамаках вдоль стены
    const named = alive.length;
    const sleepers = Math.max(0, Math.min(8, pop - named));
    const colors = [0x4f6b6a, 0x6f5a46, 0x5d4a3f, 0x3f5560, 0x7a6a55];
    let placed = 0;
    for (let i = 0; i < 16 && placed < sleepers; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      const near = [...Object.values(PLACES), BED].some((p) => Math.abs(Math.atan2(Math.sin(a - p.a), Math.cos(a - p.a))) < 0.45 && p.r > 4.5 * K);
      if (near || Math.abs(Math.sin(a / 2)) < 0.25) continue;
      const h = hammock(this.hammockMat, colors[placed % colors.length]);
      h.position.set(Math.sin(a) * (ARK_R - 0.9), 0, Math.cos(a) * (ARK_R - 0.9));
      h.lookAt(0, 0, 0);
      h.rotateY(Math.PI / 2);
      this.people.add(h);
      placed++;
    }
    this.sleepers = placed;
  }

  // Ближайшая станция или житель в радиусе действия
  nearest(x, z) {
    let best = null;
    let bd = Infinity;
    for (const s of this.stations) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < s.radius && d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  update(dt, playerPos) {
    this.time += dt;
    const t = this.time;
    this.stoveLight.intensity = 34 + Math.sin(t * 13) * 4 + Math.sin(t * 7.3) * 3;
    this.fireMat.emissiveIntensity = 2.6 + Math.sin(t * 11) * 0.5;
    // что-то огромное проплывает за иллюминаторами
    const sweep = (t * 0.35) % (Math.PI * 2);
    for (const p of this.portMats) {
      const d = Math.abs(Math.atan2(Math.sin(p.a - sweep), Math.cos(p.a - sweep)));
      p.mat.emissiveIntensity = 0.6 + Math.max(0, 1 - d * 2.5) * 2.5;
    }
    // жители дышат и поворачивают голову к игроку
    for (const n of this.npcs || []) {
      const u = n.mesh.userData;
      u.phase += dt;
      n.mesh.scale.y = (LOOKS[n.id].scale || 1) * (1 + Math.sin(u.phase * 1.6) * 0.012);
      const d = Math.hypot(playerPos.x - n.mesh.position.x, playerPos.z - n.mesh.position.z);
      const local = n.mesh.worldToLocal(new THREE.Vector3(playerPos.x, 1.7, playerPos.z));
      const target = d < 5 ? Math.max(-0.9, Math.min(0.9, Math.atan2(-local.x, -local.z))) : 0;
      u.head.rotation.y += (target - u.head.rotation.y) * Math.min(1, dt * 4);
    }
  }
}
