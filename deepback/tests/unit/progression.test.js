import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADES, upgradeCost } from '../../src/upgrades.js';
import { RESIDENTS, makeQuest, rollWeather, WEATHER, ICON } from '../../src/residents.js';
import { mulberry32 } from '../../src/city.js';
import { LORE, ENDINGS } from '../../src/lore.js';

test('у каждого улучшения есть цена на каждый уровень, цены растут', () => {
  const keys = new Set();
  for (const up of UPGRADES) {
    assert.ok(!keys.has(up.key), `ключ ${up.key} повторяется`);
    keys.add(up.key);
    assert.equal(up.cost.length, up.max);
    for (let i = 1; i < up.cost.length; i++) assert.ok(up.cost[i] > up.cost[i - 1]);
    assert.equal(upgradeCost(up, 0), up.cost[0]);
    assert.equal(upgradeCost(up, up.max), null, 'на максимуме купить нельзя');
  }
});

test('генератор случайных чисел детерминирован', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('у жителей уникальные id и все поля истории', () => {
  const ids = new Set(RESIDENTS.map((r) => r.id));
  assert.equal(ids.size, RESIDENTS.length);
  for (const r of RESIDENTS) {
    for (const k of ['name', 'role', 'keepsake', 'story']) assert.ok(r[k], `${r.id}.${k}`);
    assert.ok(ICON[r.fetch], `${r.id}: неизвестный ресурс ${r.fetch}`);
  }
});

test('задание дня детерминировано и выдаётся только живым', () => {
  const alive = ['mira', 'yos'];
  for (let seed = 0; seed < 50; seed++) {
    const q1 = makeQuest(mulberry32(seed), alive, 3);
    const q2 = makeQuest(mulberry32(seed), alive, 3);
    assert.deepEqual(q1, q2);
    assert.ok(alive.includes(q1.who));
    if (q1.kind === 'fetch') assert.ok(q1.need > 0 && q1.reward > 0);
    else assert.equal(q1.kind, 'keepsake');
  }
  assert.equal(makeQuest(mulberry32(1), [], 3), null, 'без живых жителей заданий нет');
});

test('бывают оба типа заданий', () => {
  const kinds = new Set();
  for (let seed = 0; seed < 100; seed++) kinds.add(makeQuest(mulberry32(seed), ['mira'], 2).kind);
  assert.deepEqual([...kinds].sort(), ['fetch', 'keepsake']);
});

test('первый день всегда ясный, дальше встречается любая погода', () => {
  assert.equal(rollWeather(mulberry32(5), 1), 'clear');
  const seen = new Set();
  for (let seed = 0; seed < 300; seed++) seen.add(rollWeather(mulberry32(seed), 3));
  assert.deepEqual([...seen].sort(), Object.keys(WEATHER).sort());
});

test('сюжет: 7 реликвий и 3 финала', () => {
  assert.equal(LORE.length, 7);
  assert.equal(ENDINGS.length, 3);
  for (const l of LORE) assert.ok(l.title && l.text);
  for (const e of ENDINGS) assert.ok(e.title && e.choice && e.text);
});
