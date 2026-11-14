import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as NAV from '../../src/nav.js';
import { City, HATCH, SPAWN } from '../../src/city.js';
import { backU } from '../../src/whale.js';

// маленькое поле 20×20 м со стеной посередине и проходом сверху
function wallGrid() {
  return NAV.buildGrid((x, z) => Math.abs(x) < 1.5 && z < 6, 10, 10);
}

test('по пустому полю путь прямой', () => {
  const grid = NAV.buildGrid(() => false, 10, 10);
  const path = NAV.findPath(grid, { x: -8, z: -8 }, { x: 8, z: 8 });
  assert.equal(path.length, 2);
  assert.ok(Math.abs(NAV.pathLength(path) - Math.hypot(16, 16)) < 0.01);
});

test('путь обходит стену и не пересекает её', () => {
  const grid = wallGrid();
  const path = NAV.findPath(grid, { x: -8, z: 0 }, { x: 8, z: 0 });
  assert.ok(path && path.length >= 3);
  assert.ok(NAV.pathLength(path) > 16, 'обход длиннее прямой');
  for (let i = 1; i < path.length; i++) {
    for (let k = 0; k <= 40; k++) {
      const x = path[i - 1].x + (path[i].x - path[i - 1].x) * (k / 40);
      const z = path[i - 1].z + (path[i].z - path[i - 1].z) * (k / 40);
      assert.ok(!(Math.abs(x) < 1.0 && z < 5), `путь идёт сквозь стену в (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
});

test('если цель замурована — пути нет', () => {
  const grid = NAV.buildGrid((x, z) => Math.abs(x) < 1.5, 10, 10);
  assert.equal(NAV.findPath(grid, { x: -8, z: 0 }, { x: 8, z: 0 }), null);
});

test('старт и цель внутри препятствия сдвигаются на ближайшую свободную клетку', () => {
  const grid = wallGrid();
  const c = NAV.nearestFree(grid, 0, 0);
  assert.ok(c >= 0 && !grid.blocked[c]);
  assert.ok(NAV.findPath(grid, { x: 0, z: 0 }, { x: 8, z: 8 }));
});

test('пунктир идёт через равные промежутки и не длиннее лимита', () => {
  const pts = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }];
  const dots = NAV.dotsAlong(pts, 2, 0);
  assert.equal(dots.length, 11);
  assert.deepEqual(dots[0], { x: 0, z: 0 });
  assert.ok(Math.abs(dots[6].x - 10) < 1e-9 && Math.abs(dots[6].z - 2) < 1e-9);
  assert.equal(NAV.dotsAlong(pts, 0.1, 0, 50).length, 50);
});

test('в настоящем городе есть дорога от шлюза к каждому припасу', () => {
  for (const seed of [1, 2, 3]) {
    const city = new City(new THREE.Scene());
    city.generate(seed, 3, 0, 7, { keepsake: true });
    const grid = NAV.buildGrid((x, z) => backU(x, z) >= 0.97 || city.overlaps(x, z, 0.8));
    for (const p of city.pickups) {
      const path = NAV.findPath(grid, { x: HATCH.x, z: HATCH.z + 6 }, p);
      assert.ok(path, `сид ${seed}: нет дороги к ${p.type} в (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
    }
  }
});

test('авто-режим: что выбирает навигатор', () => {
  const base = { p: 0.2, weight: 0, capacity: 8, food: 3, fuel: 2, needFood: 4, needFuel: 1, carried: [], questKeepsake: false };
  assert.equal(NAV.autoTarget(base), 'food', 'еды не хватает на ночь');
  assert.equal(NAV.autoTarget({ ...base, questKeepsake: true }), 'keepsake', 'сначала просьба жителя');
  assert.equal(NAV.autoTarget({ ...base, food: 9, fuel: 0 }), 'fuel', 'еды хватает, топлива нет');
  assert.equal(NAV.autoTarget({ ...base, food: 9 }), 'any', 'всего хватает — ближайшие припасы');
  assert.equal(NAV.autoTarget({ ...base, weight: 8, carried: ['fuel', 'fuel', 'scrap'] }), 'hatch', 'рюкзак полон');
  assert.equal(NAV.autoTarget({ ...base, p: 0.8 }), 'hatch', 'вечер — домой');
  assert.equal(NAV.autoTarget({ ...base, food: 2, carried: ['food', 'food'], weight: 2 }), 'any', 'несёшь достаточно рыбы');
});

test('утренняя площадка у шлюза свободна в любом городе (регрессия: дом на точке старта)', () => {
  // сид 776151274 раньше ставил дом прямо на ныряльщика
  for (const seed of [776151274, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const city = new City(new THREE.Scene());
    city.generate(seed, 1, 0, 7, { keepsake: true });
    assert.ok(!city.overlaps(SPAWN.x, SPAWN.z, 1.2), `сид ${seed}: на точке старта препятствие`);
  }
});
