// Маршрут Матери: каждый день она приплывает в новое море.
// У моря — свой цвет воды и тумана, свои декорации вокруг и свои правила.
// Данные и выбор моря — чистые функции (тестируются под Node);
// декорации строятся из three.js без холста, тоже работают в тестах.
import * as THREE from 'three';
import { WHALE } from './whale.js';
import { mergeChildren } from './merge.js';

export const REGIONS = {
  open: {
    name: 'Открытый океан',
    note: 'Вода спокойная, до горизонта никого.',
    tint: null,
  },
  ice: {
    name: 'Ледяное поле',
    note: 'Вокруг айсберги. Вода ледяная — под ней дыхания хватит ненадолго.',
    deep: 0x173f52, shallow: 0x6fb9cc, fog: 0xc9dde6, sky: 0xbcd3de,
    oxyMul: 0.75,
  },
  wrecks: {
    name: 'Кладбище кораблей',
    note: 'Из воды торчат мачты чужих судов. На спине — больше обломков.',
    deep: 0x203a3a, shallow: 0x4f7a6a, fog: 0x9aa59c, sky: 0xa9b3ac,
    extraScrap: 5,
  },
  reef: {
    name: 'Тёплое мелководье',
    note: 'Под водой цветут рифы, рыбы много — но и пиявок тоже.',
    deep: 0x0c5b6a, shallow: 0x3fd0c0, fog: 0xd3ebe6, sky: 0xbfe3ee,
    extraFood: 6,
    extraLeeches: 2,
  },
  glow: {
    name: 'Светящееся море',
    note: 'Ночью волны светятся. Глубинники здесь заметнее — и голоднее.',
    deep: 0x0d2f4a, shallow: 0x2a8fa8, fog: 0xaebfd0, sky: 0xb4c6d8,
    glow: 1,
  },
};

export const REGION_KEYS = Object.keys(REGIONS);

// Море на день: первый день — открытый океан (знакомство),
// дальше по сиду, без повтора вчерашнего моря.
export function regionFor(seed, cycle) {
  if (cycle <= 1) return 'open';
  const pick = (c) => {
    let h = (seed ^ Math.imul(c, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return REGION_KEYS[h % REGION_KEYS.length];
  };
  let prev = 'open';
  for (let c = 2; c <= cycle; c++) {
    let r = pick(c);
    if (r === prev) r = REGION_KEYS[(REGION_KEYS.indexOf(r) + 1) % REGION_KEYS.length];
    prev = r;
  }
  return prev;
}

// ---------- Декорации вокруг Матери ----------
function rng32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// точка в кольце вокруг кита: dMin..dMax метров от края эллипса
function around(r, dMin, dMax) {
  const a = r() * Math.PI * 2;
  const d = dMin + r() * (dMax - dMin);
  return { x: Math.sin(a) * (WHALE.a + d), z: Math.cos(a) * (WHALE.b + d) };
}

const MAT = {
  ice: new THREE.MeshStandardMaterial({ color: 0xe8f4f8, roughness: 0.35, metalness: 0.05, emissive: 0x1a3640, emissiveIntensity: 0.25, flatShading: true }),
  iceDeep: new THREE.MeshStandardMaterial({ color: 0x7fc4d8, roughness: 0.2, transparent: true, opacity: 0.75, flatShading: true }),
  hull: new THREE.MeshStandardMaterial({ color: 0x3a2e26, roughness: 0.9 }),
  hullRust: new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.85, metalness: 0.3 }),
  mast: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 }),
  sail: new THREE.MeshStandardMaterial({ color: 0x9a9284, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
  coral: [0xff7a6a, 0xffb347, 0xc86bd8, 0xf2e3a8, 0x5fd0b0].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, emissive: c, emissiveIntensity: 0.12, side: THREE.DoubleSide })),
  glowWisp: new THREE.MeshBasicMaterial({ color: 0x6ff6ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
};

// Айсберг: искажённый многогранник, над водой — меньшая часть
function iceberg(r) {
  // смещение — функция координат вершины: общие вершины соседних граней сдвигаются одинаково
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const ph = [r() * 10, r() * 10, r() * 10];
  const sx = 1 + r() * 0.8;
  const sz = 0.8 + r() * 0.6;
  const cap = 0.25 + r() * 0.3; // высота плоской макушки
  const ps = geo.attributes.position;
  for (let i = 0; i < ps.count; i++) {
    let x = ps.getX(i);
    let y = ps.getY(i);
    let z = ps.getZ(i);
    const n = 1 + 0.18 * Math.sin(x * 3.1 + ph[0]) * Math.sin(y * 2.7 + ph[1]) + 0.12 * Math.sin(z * 4.3 + ph[2] + x * 2);
    x *= n * sx;
    z *= n * sz;
    y *= n;
    if (y > cap) y = cap + (y - cap) * 0.15; // столовая вершина
    ps.setXYZ(i, x, y * 1.3, z);
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const top = new THREE.Mesh(geo, MAT.ice);
  g.add(top);
  const under = new THREE.Mesh(geo, MAT.iceDeep);
  under.scale.set(1.25, 1.1, 1.25);
  under.position.y = -1.2;
  g.add(under);
  return g;
}

// Затонувший корабль: корма или нос над водой, сломанные мачты, клочья парусов
function wreck(r) {
  const g = new THREE.Group();
  const len = 14 + r() * 12;
  const hullGeo = new THREE.CylinderGeometry(2.6, 1.2, len, 10, 1, false, 0, Math.PI);
  hullGeo.rotateZ(Math.PI / 2);
  hullGeo.rotateX(Math.PI);
  const hull = new THREE.Mesh(hullGeo, r() < 0.5 ? MAT.hull : MAT.hullRust);
  g.add(hull);
  const masts = 1 + Math.floor(r() * 3);
  for (let i = 0; i < masts; i++) {
    const h = 6 + r() * 10;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, h, 6), MAT.mast);
    mast.position.set((i - (masts - 1) / 2) * (len / (masts + 1)), h / 2, 0);
    mast.rotation.z = (r() - 0.5) * 0.4;
    g.add(mast);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4 + r() * 3, 5), MAT.mast);
    yard.rotation.x = Math.PI / 2;
    yard.rotation.y = (r() - 0.5) * 0.8;
    yard.position.set(mast.position.x, h * 0.75, 0);
    g.add(yard);
    if (r() < 0.7) {
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(3 + r() * 2, 2.5 + r() * 2, 4, 3), MAT.sail);
      const sp = sail.geometry.attributes.position;
      for (let k = 0; k < sp.count; k++) sp.setZ(k, Math.sin(sp.getX(k) * 1.3) * 0.3 + (r() - 0.5) * 0.15);
      sail.geometry.computeVertexNormals();
      sail.position.set(mast.position.x, h * 0.55, 0.2);
      sail.rotation.y = yard.rotation.y;
      g.add(sail);
    }
  }
  // корабль накренён и ушёл одним концом под воду
  g.rotation.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.35));
  return g;
}

// Риф: кораллы-«деревца», кораллы-«мозги» и веера на склоне под водой
function reef(r) {
  const g = new THREE.Group();
  const n = 6 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const mat = MAT.coral[Math.floor(r() * MAT.coral.length)];
    const kind = r();
    let m;
    if (kind < 0.4) {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.6 + r() * 0.8, 10, 8), mat);
      m.scale.y = 0.6;
    } else if (kind < 0.75) {
      m = new THREE.Group();
      const branches = 4 + Math.floor(r() * 4);
      for (let b = 0; b < branches; b++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1 + r() * 1.5, 5), mat);
        br.position.y = 0.6;
        br.rotation.set((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2);
        m.add(br);
      }
    } else {
      m = new THREE.Mesh(new THREE.CircleGeometry(0.7 + r() * 0.6, 12, 0, Math.PI), mat);
      m.rotation.y = r() * Math.PI;
    }
    m.position.set((r() - 0.5) * 6, 0, (r() - 0.5) * 6);
    g.add(m);
  }
  return g;
}

// Строит декорации моря. level — уровень воды утром.
export function buildRegion(key, seed, level) {
  const g = new THREE.Group();
  g.name = `region-${key}`;
  const r = rng32(seed ^ 0x51ed);
  if (key === 'ice') {
    for (let i = 0; i < 30; i++) {
      const p = around(r, 12, 120);
      const b = iceberg(r);
      const s = 5 + r() * r() * 16;
      b.scale.setScalar(s);
      b.position.set(p.x, level - s * 0.25, p.z);
      b.rotation.y = r() * Math.PI;
      g.add(b);
    }
    // мелкое крошево льдин у самых боков — один инстансированный объект на волне
    const n = 60;
    const floes = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.2, 0.4, 6), MAT.ice, n);
    floes.userData.items = [];
    for (let i = 0; i < n; i++) {
      const p = around(r, 2, 26);
      floes.userData.items.push({ x: p.x, z: p.z, s: 0.6 + r() * 1.4, ry: r() * Math.PI });
    }
    floes.userData.floes = true;
    floes.frustumCulled = false;
    g.add(floes);
  } else if (key === 'wrecks') {
    for (let i = 0; i < 11; i++) {
      const p = around(r, 12, 90);
      const w = wreck(r);
      w.scale.setScalar(1.6 + r() * 0.8);
      w.position.set(p.x, level - 0.6, p.z);
      g.add(w);
    }
  } else if (key === 'reef') {
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2;
      // склон бока Матери чуть ниже воды
      const k = 0.98 + r() * 0.05;
      const rf = reef(r);
      rf.position.set(Math.sin(a) * WHALE.a * k * (Math.abs(Math.cos(a)) > 0.6 ? 0.7 : 1), level - 2.5 - r() * 3, Math.cos(a) * WHALE.b * k);
      g.add(rf);
    }
  } else if (key === 'glow') {
    // огоньки-медузы под поверхностью вокруг кита — один инстансированный объект
    const n = 70;
    const wisps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), MAT.glowWisp, n);
    const m4 = new THREE.Matrix4();
    wisps.userData.items = [];
    for (let i = 0; i < n; i++) {
      const p = around(r, -6, 60);
      const it = { x: p.x, y: level - 1 - r() * 6, z: p.z, s: 0.25 + r() * 0.35, ph: r() * Math.PI * 2 };
      wisps.userData.items.push(it);
      wisps.setMatrixAt(i, m4.makeScale(it.s, it.s, it.s).setPosition(it.x, it.y, it.z));
    }
    wisps.userData.bobWisps = true;
    wisps.frustumCulled = false;
    g.add(wisps);
  }
  // неподвижные декорации склеиваем; льдины и огоньки двигаются — их не трогаем
  const moving = new Set(g.children.filter((c) => c.userData.floes || c.userData.bobWisps));
  g.updateMatrixWorld(true);
  for (const c of [...g.children]) {
    if (moving.has(c) || !c.isGroup) continue;
    c.traverse((m) => {
      if (!m.isMesh) return;
      const flat = new THREE.Mesh(m.geometry.clone().applyMatrix4(m.matrixWorld), m.material);
      flat.castShadow = m.castShadow;
      g.add(flat);
    });
    g.remove(c);
  }
  mergeChildren(g, moving);
  return g;
}

const WISP_M = new THREE.Matrix4();
const FLOE_Q = new THREE.Quaternion();
const FLOE_UP = new THREE.Vector3(0, 1, 0);
const FLOE_P = new THREE.Vector3();
const FLOE_S = new THREE.Vector3();

// Покачивание: льдины на волне, огоньки поднимаются и опускаются
export function animateRegion(g, t, surfaceAt) {
  if (!g) return;
  for (const c of g.children) {
    if (c.userData.floes) {
      const q = FLOE_Q;
      c.userData.items.forEach((it, i) => {
        q.setFromAxisAngle(FLOE_UP, it.ry + t * 0.02);
        WISP_M.compose(FLOE_P.set(it.x, surfaceAt(it.x, it.z) + 0.05, it.z), q, FLOE_S.set(it.s, 1, it.s));
        c.setMatrixAt(i, WISP_M);
      });
      c.instanceMatrix.needsUpdate = true;
    }
    else if (c.userData.bobWisps) {
      const m4 = WISP_M;
      c.userData.items.forEach((it, i) => c.setMatrixAt(i, m4.makeScale(it.s, it.s, it.s).setPosition(it.x, it.y + Math.sin(t * 0.8 + it.ph) * 0.6, it.z)));
      c.instanceMatrix.needsUpdate = true;
    }
  }
}
