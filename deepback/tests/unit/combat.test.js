import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTarget, weaponDamage, damage, regen, ENEMY_HP, REGEN_DELAY } from '../../src/combat.js';

const fwd = [{ x: 0, z: -1 }];

test('цель выбирается впереди, даже если камера смотрит немного в сторону', () => {
  const e = [{ id: 'a', x: 1.2, y: 0, z: -2.5 }, { id: 'b', x: 0, y: 0, z: 3 }];
  assert.equal(pickTarget({ x: 0, y: 0, z: 0 }, fwd, e, 4).id, 'a');
});

test('враг вплотную сзади всё равно получает удар', () => {
  const e = [{ id: 'back', x: 0, y: 0, z: 1.2 }];
  assert.equal(pickTarget({ x: 0, y: 0, z: 0 }, fwd, e, 4).id, 'back');
});

test('дальний враг сзади не цель; враг выше досягаемости тоже', () => {
  assert.equal(pickTarget({ x: 0, y: 0, z: 0 }, fwd, [{ x: 0, y: 0, z: 3 }], 4), null);
  assert.equal(pickTarget({ x: 0, y: 0, z: 0 }, fwd, [{ x: 0, y: 5, z: -2 }], 4), null);
});

test('из двух впереди выбирается ближний и прямой', () => {
  const e = [{ id: 'far', x: 0, y: 0, z: -3.8 }, { id: 'near', x: 0.3, y: 0, z: -1.5 }];
  assert.equal(pickTarget({ x: 0, y: 0, z: 0 }, fwd, e, 4).id, 'near');
});

test('учитывается и направление ныряльщика, а не только камеры', () => {
  const e = [{ id: 'side', x: 3, y: 0, z: 0 }];
  assert.equal(pickTarget({ x: 0, y: 0, z: 0 }, [{ x: 0, z: -1 }, { x: 1, z: 0 }], e, 4).id, 'side');
});

test('гарпун убивает пиявку за 3 удара, острога за 2, бомба сразу', () => {
  let hp = ENEMY_HP.leech;
  let n = 0;
  while (hp > 0) { hp = damage(hp, weaponDamage('spear')).hp; n++; }
  assert.equal(n, 3);
  hp = ENEMY_HP.leech; n = 0;
  while (hp > 0) { hp = damage(hp, weaponDamage('spear', { spear: true })).hp; n++; }
  assert.equal(n, 2);
  assert.ok(damage(ENEMY_HP.leech, weaponDamage('bomb')).killed);
});

test('здоровье восстанавливается только после паузы', () => {
  assert.equal(regen(50, REGEN_DELAY - 1, 1), 50);
  assert.ok(regen(50, REGEN_DELAY + 1, 1) > 50);
  assert.equal(regen(100, 99, 1), 100);
});
