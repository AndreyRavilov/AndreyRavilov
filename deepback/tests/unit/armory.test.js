import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../../src/armory.js';
import { NIGHT_ROLES, nightLine, RESIDENTS } from '../../src/residents.js';

test('оружие: острога и ракетница покупаются один раз', () => {
  let arms = A.emptyArms();
  let r = A.buy(arms, 10, 'spear');
  assert.ok(r.ok);
  assert.equal(r.scrap, 6);
  assert.equal(r.arms.spear, true);
  const again = A.buy(r.arms, r.scrap, 'spear');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'Уже есть.');
});

test('солевые бомбы продаются пачками и не больше предела', () => {
  let arms = A.emptyArms();
  let scrap = 100;
  for (let i = 0; i < 3; i++) ({ arms, scrap } = A.buy(arms, scrap, 'bombs'));
  assert.equal(arms.bombs, 9);
  const r = A.buy(arms, scrap, 'bombs');
  assert.equal(r.ok, false);
  assert.match(r.reason, /Больше 9/);
});

test('без обломков не купить, покупка не меняет исходные запасы', () => {
  const arms = A.emptyArms();
  const r = A.buy(arms, 1, 'flare');
  assert.equal(r.ok, false);
  assert.match(r.reason, /Нужно обломков/);
  const ok = A.buy(arms, 10, 'flare');
  assert.equal(arms.flare, false, 'исходный объект не трогаем');
  assert.equal(ok.arms.flare, true);
});

test('ракетница перезаряжается утром', () => {
  const a = { ...A.emptyArms(), flare: true, flareReady: false };
  assert.equal(A.morning(a).flareReady, true);
});

test('взрыв задевает только живых пиявок в радиусе', () => {
  const leeches = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 6, z: 0 }, { x: 1, z: 1, dead: true }];
  assert.deepEqual(A.inBlast({ x: 0, z: 0 }, leeches), [0, 1]);
});

test('у каждой ночной роли есть живой житель и приветствие', () => {
  for (const [id, role] of Object.entries(NIGHT_ROLES)) {
    assert.ok(RESIDENTS.some((r) => r.id === id), id);
    assert.ok(['workshop', 'armory', 'chronicle'].includes(role.shop));
    assert.ok(role.greet.length > 20);
  }
});

test('Агата предсказывает погоду, остальные говорят своё', () => {
  const ctx = { weatherName: 'Туман', weatherNote: 'Видно на несколько десятков метров.', lore: 2, oxySeconds: 34, bombs: 0, pop: 9 };
  assert.match(nightLine('agata', ctx), /завтра туман/);
  assert.match(nightLine('yos', ctx), /2 из семи/);
  assert.match(nightLine('lina', ctx, () => 0), /34/);
  for (const id of ['mira', 'vey', 'unknown']) assert.ok(nightLine(id, ctx).length > 10);
});
