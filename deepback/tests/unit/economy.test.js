import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/economy.js';

test('потребность в рыбе растёт с населением, коптильня её снижает', () => {
  assert.equal(E.needFood(12), 4);
  assert.equal(E.needFood(4), 2);
  assert.equal(E.needFood(12, 1), 3);
  assert.equal(E.needFood(1, 5), 1, 'минимум одна рыба');
});

test('потребность в ворвани растёт с днями и упирается в 4', () => {
  assert.equal(E.needFuel(1), 1);
  assert.equal(E.needFuel(2), 2);
  assert.equal(E.needFuel(6), 4);
  assert.equal(E.needFuel(40), 4);
});

test('дни становятся короче, но не короче 100 секунд; шторм режет день', () => {
  assert.equal(E.dayLength(1), 170);
  assert.equal(E.dayLength(2), 160);
  assert.equal(E.dayLength(50), 100);
  assert.equal(E.dayLength(1, 'storm'), Math.round(170 * 0.85));
});

test('вода поднимается от утреннего уровня до полного затопления', () => {
  assert.equal(E.waterLevel(0), E.WATER_START);
  assert.equal(E.waterLevel(1), E.WATER_END);
  let prev = -Infinity;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const w = E.waterLevel(p);
    assert.ok(w >= prev);
    prev = w;
  }
  assert.ok(E.waterLevel(1.5) === E.WATER_END, 'значение ограничено сверху');
});

test('в штиль вода ниже днём, но к погружению всё равно накрывает', () => {
  assert.ok(E.waterLevel(0.6, 'calm') < E.waterLevel(0.6));
  assert.equal(E.waterLevel(1, 'calm'), E.WATER_END);
});

test('ночь с достатком: никто не умирает, запасы уменьшаются', () => {
  const r = E.resolveNight({ pop: 12, food: 10, fuel: 5, cycle: 1 });
  assert.equal(r.deaths, 0);
  assert.equal(r.pop, 12);
  assert.equal(r.food, 6);
  assert.equal(r.fuel, 4);
});

test('нехватка еды убивает по одному, нехватка ворвани — по двое', () => {
  const r = E.resolveNight({ pop: 12, food: 1, fuel: 0, cycle: 2 });
  assert.equal(r.hunger, 3);
  assert.equal(r.cold, 2);
  assert.equal(r.deaths, 3 + 2 * 2);
  assert.equal(r.pop, 5);
  assert.equal(r.food, 0);
  assert.equal(r.fuel, 0);
});

test('погибших не больше, чем жителей; запасы не уходят в минус', () => {
  const r = E.resolveNight({ pop: 2, food: 0, fuel: 0, cycle: 9 });
  assert.equal(r.pop, 0);
  assert.equal(r.deaths, 2);
  assert.ok(r.food >= 0 && r.fuel >= 0);
});

test('русские окончания', () => {
  const f = (n) => E.plural(n, 'житель', 'жителя', 'жителей');
  assert.equal(f(1), 'житель');
  assert.equal(f(3), 'жителя');
  assert.equal(f(5), 'жителей');
  assert.equal(f(11), 'жителей');
  assert.equal(f(21), 'житель');
  assert.equal(f(22), 'жителя');
  assert.equal(f(112), 'жителей');
});
