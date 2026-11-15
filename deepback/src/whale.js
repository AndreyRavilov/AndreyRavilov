// Мать — гигантское существо, на спине которого стоит город Ноа.
// Верх спины — точный эллипсоид, поэтому высоту поверхности можно считать
// аналитически (backHeight) и использовать для физики игрока.
import * as THREE from 'three';

export const WHALE = { a: 44, b: 128, H: 16 };

// Сужение к хвосту (z > 0 — хвост, z < 0 — голова)
export function taper(zn) {
  const t = Math.min(1, Math.max(0, (zn - 0.3) / 0.7));
  return 1 - 0.55 * t * t * (3 - 2 * t);
}

export function backU(x, z) {
  const zn = z / WHALE.b;
  return (x / (WHALE.a * taper(zn))) ** 2 + zn * zn;
}

// Точка на спине по «радиусу» u (0 — хребет в центре, 1 — край) и углу
export function pointOnBack(u, th) {
  const r = Math.sqrt(u);
  const z = WHALE.b * r * Math.sin(th);
  const x = WHALE.a * taper(z / WHALE.b) * r * Math.cos(th);
  return { x, z };
}

export function backHeight(x, z) {
  const u = backU(x, z);
  return u >= 1 ? -Infinity : WHALE.H * Math.sqrt(1 - u);
}

export const BLOWHOLE = new THREE.Vector3(0, backHeight(0, -84), -84);

function n3(x, y, z) {
  return (
    Math.sin(x * 1.7 + Math.sin(z * 0.9)) * Math.cos(z * 1.3 + Math.sin(x * 0.7)) * 0.5 +
    Math.sin((x + y) * 3.1 + z * 2.3) * 0.25
  );
}

export function buildWhale() {
  const g = new THREE.Group();

  // --- Тело ---
  const geo = new THREE.SphereGeometry(1, 160, 90);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    if (y < 0) y *= 2.4; // глубокое брюхо
    pos.setXYZ(i, x * WHALE.a * taper(z), y * WHALE.H, z * WHALE.b);

    if (y > -0.25) {
      const n = n3(x * 6, y * 6, z * 14);
      const scar = Math.abs(Math.sin(x * 23 + z * 41 + Math.sin(z * 9) * 3)) > 0.985;
      // цвет шкуры даёт текстура; вершины добавляют крупные пятна и тень к бокам
      c.setHSL(0.07, 0.08, 0.44 + n * 0.08 + Math.max(0, y) * 0.06);
      if (scar) c.setHSL(0.08, 0.06, 0.55);
      if (n > 0.45) c.offsetHSL(0, -0.03, 0.05);
      // светлые пятна, как у китовой акулы: ряды точек вдоль спины
      const sx = x * 38;
      const sz = z * 95 + Math.sin(x * 9) * 1.5;
      const spot = Math.max(0, 1 - Math.hypot(sx - Math.round(sx), sz - Math.round(sz)) * 3.2);
      if (y > 0.25 && spot > 0) c.offsetHSL(0, -0.04, spot * 0.14); // светлые пятна
    } else {
      const groove = Math.sin(x * 55) > 0.55;
      const t = Math.min(1, -y / 1.4);
      c.setHSL(0.08, 0.05, 0.24 + t * 0.12 + (groove ? -0.07 : 0)); // брюхо в тени: светлее спины, но не белое
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // UV — проекция сверху в метрах: текстура кожи лежит ровно, без стяжки у полюсов
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 16, pos.getZ(i) / 16 + (pos.getY(i) < 0 ? pos.getY(i) / 16 : 0));
  geo.computeVertexNormals();
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x7d8c94, roughness: 0.78, metalness: 0.05 });
  const body = new THREE.Mesh(geo, skin);
  g.userData.skin = skin;
  body.receiveShadow = true;
  g.add(body);

  // --- Хвостовые лопасти ---
  const finMat = new THREE.MeshStandardMaterial({ color: 0x223640, roughness: 0.8 });
  const fluke = new THREE.Group();
  fluke.position.set(0, -6, WHALE.b - 4);
  for (const s of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), finMat);
    lobe.scale.set(28, 1.6, 11);
    lobe.position.set(s * 17, 0, 10);
    lobe.rotation.y = s * 0.45;
    fluke.add(lobe);
  }
  g.add(fluke);
  g.userData.fluke = fluke;

  // --- Грудные плавники ---
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), finMat);
    fin.scale.set(24, 1.4, 8);
    fin.position.set(s * (WHALE.a + 8), -12, -WHALE.b * 0.38);
    fin.rotation.set(0, s * 0.5, s * 0.45);
    g.add(fin);
  }

  // --- Глаза ---
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.15, metalness: 0.4 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x9fe7ff, emissive: 0x3fb6d9, emissiveIntensity: 0.8 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 16), eyeMat);
    eye.position.set(s * 25.6, -4, -102);
    g.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.18, 8, 32), irisMat);
    ring.position.copy(eye.position);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
  }

  // --- Дыхало ---
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 32),
    new THREE.MeshBasicMaterial({ color: 0x04080a })
  );
  hole.rotation.x = -Math.PI / 2;
  hole.scale.set(1, 1.6, 1);
  hole.position.set(BLOWHOLE.x, BLOWHOLE.y + 0.12, BLOWHOLE.z);
  g.add(hole);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.5, 10, 40), finMat);
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(1, 1.6, 1);
  rim.position.set(BLOWHOLE.x, BLOWHOLE.y + 0.1, BLOWHOLE.z);
  g.add(rim);

  // --- Ракушки-наросты: «вулканчики» гроздьями ---
  // конус из шести известковых пластин: рёбра по кругу, рваный верхний край
  const barnGeo = new THREE.CylinderGeometry(0.17, 0.42, 0.38, 18, 3, true);
  {
    const ps = barnGeo.attributes.position;
    for (let k = 0; k < ps.count; k++) {
      const x = ps.getX(k);
      const y = ps.getY(k);
      const z = ps.getZ(k);
      const a = Math.atan2(z, x);
      const top = (y + 0.19) / 0.38; // 0 у основания, 1 сверху
      const plate = 1 + 0.13 * Math.pow(Math.abs(Math.cos(a * 3)), 3) - 0.05;
      const jag = top > 0.95 ? 1 - 0.18 * Math.abs(Math.sin(a * 6)) : 1;
      ps.setXYZ(k, x * plate, y * jag, z * plate);
    }
    barnGeo.computeVertexNormals();
  }
  barnGeo.translate(0, 0.17, 0);
  // отверстие утоплено внутрь и прикрыто створками, а не чёрная крышка поверх
  const capGeo = new THREE.ConeGeometry(0.15, 0.12, 9, 1, true);
  capGeo.rotateX(Math.PI);
  capGeo.translate(0, 0.31, 0);
  const barnMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide });
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1, side: THREE.DoubleSide });
  const count = 1400;
  const barn = new THREE.InstancedMesh(barnGeo, barnMat, count);
  const holes = new THREE.InstancedMesh(capGeo, holeMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const nrm = new THREE.Vector3();
  let rs = 7;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const barnColor = new THREE.Color();
  const algae = new THREE.Color(0x4f5c3a);
  let i = 0;
  while (i < count) {
    // центр грозди
    const cu = 0.25 + rnd() * 0.73;
    const cth = rnd() * Math.PI * 2;
    const c = pointOnBack(cu, cth);
    const n = 4 + Math.floor(rnd() * 10);
    for (let k = 0; k < n && i < count; k++) {
      const x = c.x + (rnd() - 0.5) * 3.2;
      const z = c.z + (rnd() - 0.5) * 3.2;
      const h = backHeight(x, z);
      if (!isFinite(h)) continue;
      // наклон по нормали спины
      const e = 0.2;
      nrm.set(backHeight(x - e, z) - backHeight(x + e, z), 2 * e, backHeight(x, z - e) - backHeight(x, z + e)).normalize();
      if (!isFinite(nrm.x)) nrm.copy(up);
      q.setFromUnitVectors(up, nrm);
      const s = 0.25 + rnd() * rnd() * 1.05;
      sc.set(s, s * (0.7 + rnd() * 0.6), s);
      p.set(x, h - 0.04, z);
      m.compose(p, q, sc);
      barn.setMatrixAt(i, m);
      holes.setMatrixAt(i, m);
      // известь разного возраста: от серо-бурой до зеленоватой, свежие светлее
      const tone = rnd();
      barnColor.setRGB(0.4 + tone * 0.22, 0.38 + tone * 0.2, 0.33 + tone * 0.16, THREE.SRGBColorSpace);
      if (rnd() < 0.25) barnColor.lerp(algae, 0.35 + rnd() * 0.3);
      barn.setColorAt(i, barnColor);
      i++;
    }
  }
  barn.receiveShadow = true;
  barn.castShadow = true;
  g.add(barn, holes);

  return g;
}

// Морщины, рубцы и влажный блеск кожи (только в браузере)
export function dressWhale(whale, TEX) {
  const t = TEX.whaleSkin();
  const skin = whale.userData.skin;
  skin.map = t.map;
  skin.bumpMap = t.bump;
  skin.bumpScale = 1.1;
  skin.roughnessMap = t.rough;
  skin.roughness = 1;
  skin.color.set(0xffffff);
  skin.needsUpdate = true;
}
