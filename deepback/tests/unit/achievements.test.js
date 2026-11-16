import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Achievements, ACHIEVEMENTS } from '../../src/achievements.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('достижение открывается один раз и переживает перезапуск', () => {
  const st = memory();
  const a = new Achievements(st);
  assert.ok(a.unlock('fisher'));
  assert.equal(a.unlock('fisher'), null);
  const b = new Achievements(st);
  assert.ok(b.has('fisher'));
  assert.equal(b.count, 1);
});

test('десятая пиявка и все моря открывают свои достижения', () => {
  const a = new Achievements(null);
  for (let i = 0; i < 9; i++) assert.equal(a.leechKilled(), null);
  assert.equal(a.leechKilled().id, 'leech10');
  assert.equal(a.seaVisited('open', 3), null);
  assert.equal(a.seaVisited('ice', 3), null);
  assert.equal(a.seaVisited('ice', 3), null);
  assert.equal(a.seaVisited('reef', 3).id, 'seas');
});

test('у всех достижений уникальные id, иконки и описания', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((x) => x.id)).size, ACHIEVEMENTS.length);
  for (const x of ACHIEVEMENTS) assert.ok(x.icon && x.title && x.desc);
  assert.equal(new Achievements(null).unlock('нет-такого'), null);
});
