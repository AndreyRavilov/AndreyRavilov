import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { REGIONS, REGION_KEYS, regionFor, buildRegion } from '../../src/regions.js';
import { City } from '../../src/city.js';

test('первый день — открытый океан, дальше моря меняются без повтора подряд', () => {
  for (const seed of [1, 42, 777, 123456]) {
    assert.equal(regionFor(seed, 1), 'open');
    let prev = 'open';
    for (let c = 2; c < 30; c++) {
      const r = regionFor(seed, c);
      assert.ok(REGION_KEYS.includes(r));
      assert.notEqual(r, prev, `сид ${seed}, день ${c}: то же море два дня подряд`);
      prev = r;
    }
  }
});

test('за месяц Мать побывает во всех морях', () => {
  const seen = new Set();
  for (let c = 1; c <= 30; c++) seen.add(regionFor(99, c));
  assert.equal(seen.size, REGION_KEYS.length);
});

test('у каждого моря есть название и описание, декорации строятся', () => {
  for (const k of REGION_KEYS) {
    assert.ok(REGIONS[k].name && REGIONS[k].note);
    const g = buildRegion(k, 5, 3);
    if (k !== 'open') assert.ok(g.children.length > 5, `${k}: пусто`);
  }
});

test('особенности моря добавляют припасы и не сдвигают раскладку города', () => {
  const a = new City(new THREE.Scene());
  a.generate(1234, 3, 0, 7, {});
  const base = a.pickups.map((p) => `${p.type}:${p.x.toFixed(2)}`);
  const b = new City(new THREE.Scene());
  b.generate(1234, 3, 0, 7, { extraFood: 6, extraScrap: 5 });
  const more = b.pickups.map((p) => `${p.type}:${p.x.toFixed(2)}`);
  assert.deepEqual(more.slice(0, base.length), base);
  assert.ok(more.filter((t) => t.startsWith('food')).length >= base.filter((t) => t.startsWith('food')).length + 4);
});
