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
      c.setHSL(0.58, 0.22, 0.09 + n * 0.035);
      if (scar) c.setHSL(0.55, 0.1, 0.3);
      if (n > 0.45) c.offsetHSL(0, -0.06, 0.05); // светлые пятна
    } else {
      const groove = Math.sin(x * 55) > 0.55;
      const t = Math.min(1, -y / 1.4);
      c.setHSL(0.56, 0.12, 0.3 + t * 0.25 + (groove ? -0.08 : 0));
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x7d8c94, roughness: 0.78, metalness: 0.05 });
  const body = new THREE.Mesh(geo, skin);
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

  // --- Ракушки-наросты ---
  const barnGeo = new THREE.ConeGeometry(0.45, 0.6, 6);
  const barnMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 1 });
  const count = 900;
  const barn = new THREE.InstancedMesh(barnGeo, barnMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let rs = 7;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const th = rnd() * Math.PI * 2;
    const u = 0.3 + rnd() * 0.69;
    const { x, z } = pointOnBack(u, th);
    p.set(x, backHeight(x, z) - 0.05, z);
    const s = 0.5 + rnd() * 1.4;
    sc.set(s, s * (0.6 + rnd()), s);
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4));
    m.compose(p, q, sc);
    barn.setMatrixAt(i, m);
  }
  barn.receiveShadow = true;
  g.add(barn);

  return g;
}
