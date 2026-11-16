import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTarget, weaponDamage, damage, regen, ENEMY_HP, REGEN_DELAY, comboStep, COMBO_WINDOW, throwTarget, THROW } from '../../src/combat.js';

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

test('серия: третье попадание подряд — добивание с бонусом, пауза сбрасывает счёт', () => {
  let c = comboStep(0, 99);
  assert.equal(c.combo, 1);
  c = comboStep(c.combo, 0.5);
  assert.equal(c.combo, 2);
  assert.equal(c.finisher, false);
  c = comboStep(c.combo, 0.5);
  assert.equal(c.finisher, true);
  assert.equal(c.bonus, 1);
  assert.equal(c.combo, 0);
  assert.equal(comboStep(2, COMBO_WINDOW + 0.1).finisher, false);
});

test('гарпун на тросе: достаёт врага далеко впереди, но не сбоку', () => {
  const from = { x: 0, y: 0, z: 0 };
  const dir = { x: 0, z: -1 };
  assert.equal(throwTarget(from, dir, [{ id: 'far', x: 1, y: 0, z: -11 }]).id, 'far');
  assert.equal(throwTarget(from, dir, [{ id: 'side', x: 3, y: 0, z: 0 }]), null);
  assert.equal(throwTarget(from, dir, [{ id: 'toofar', x: 0, y: 0, z: -THROW.range - 1 }]), null);
});
