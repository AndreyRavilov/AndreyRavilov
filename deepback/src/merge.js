// Склейка неподвижных деталей в одну сетку на материал: меньше вызовов отрисовки.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

// Прямых детей-мешей группы (кроме тех, что в keep) склеить по материалам.
// Подгруппы (руки, ноги, голова) не трогаются — их можно обработать отдельно.
export function mergeChildren(group, keep = new Set()) {
  const buckets = new Map();
  for (const m of group.children) {
    if (!m.isMesh || m.isInstancedMesh || keep.has(m) || m.children.length) continue;
    if (Array.isArray(m.material)) continue;
    m.updateMatrix();
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const key = `${m.material.uuid}|${geo.attributes.color ? 'c' : ''}`;
    if (!buckets.has(key)) buckets.set(key, { mat: m.material, geos: [], meshes: [], cast: m.castShadow, recv: m.receiveShadow });
    buckets.get(key).geos.push(geo);
    buckets.get(key).meshes.push(m);
  }
  for (const b of buckets.values()) {
    if (b.geos.length < 2) {
      b.geos.forEach((g) => g.dispose());
      continue; // одиночку смысла клеить нет — оставляем как есть
    }
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    group.add(mesh);
    for (const v of b.meshes) group.remove(v);
  }
  return group;
}

// Склеить группу целиком, рекурсивно (для неподвижных декораций)
export function mergeDeep(group, keep = new Set()) {
  for (const c of [...group.children]) if (c.isGroup || (c.type === 'Object3D' && c.children.length)) mergeDeep(c, keep);
  mergeChildren(group, keep);
  return group;
}
