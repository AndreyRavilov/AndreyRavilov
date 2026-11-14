import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHALE, backHeight, backU, taper, pointOnBack, BLOWHOLE, buildWhale } from '../../src/whale.js';

test('хребет в центре спины на высоте H', () => {
  assert.equal(backHeight(0, 0), WHALE.H);
});

test('за краем спины поверхности нет', () => {
  assert.equal(backHeight(WHALE.a + 1, 0), -Infinity);
  assert.equal(backHeight(0, WHALE.b + 1), -Infinity);
  assert.equal(backHeight(0, -WHALE.b - 1), -Infinity);
});

test('спина симметрична слева и справа', () => {
  for (const [x, z] of [[5, 10], [20, -40], [12, 70]]) {
    assert.equal(backHeight(x, z), backHeight(-x, z));
  }
});

test('спина понижается от хребта к краю', () => {
  let prev = Infinity;
  for (let x = 0; x < WHALE.a; x += 4) {
    const h = backHeight(x, 0);
    assert.ok(h < prev, `высота в x=${x} должна быть ниже предыдущей`);
    prev = h;
  }
});

test('хвост уже головы', () => {
  assert.equal(taper(-0.8), 1);
  assert.ok(taper(0.9) < 0.6);
  // та же точка по ширине ближе к краю у хвоста, чем у головы
  assert.ok(backU(20, WHALE.b * 0.8) > backU(20, -WHALE.b * 0.8));
});

test('pointOnBack возвращает точку на заданном «радиусе» u', () => {
  for (const u of [0, 0.2, 0.5, 0.9, 0.99]) {
    for (const th of [0, 1, 2.5, 4, 5.9]) {
      const { x, z } = pointOnBack(u, th);
      assert.ok(Math.abs(backU(x, z) - u) < 1e-9, `u=${u}, th=${th}`);
    }
  }
});

test('дыхало лежит на поверхности спины', () => {
  assert.ok(Math.abs(BLOWHOLE.y - backHeight(BLOWHOLE.x, BLOWHOLE.z)) < 1e-9);
});

test('меш тела совпадает с аналитической высотой (физика не «парит»)', () => {
  const g = buildWhale();
  const body = g.children[0];
  const pos = body.geometry.attributes.position;
  let checked = 0;
  for (let i = 0; i < pos.count; i += 37) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y <= 0.01) continue;
    const h = backHeight(x, z);
    if (!isFinite(h)) continue;
    assert.ok(Math.abs(h - y) < 1e-3, `вершина ${i}: меш ${y}, функция ${h}`);
    checked++;
  }
  assert.ok(checked > 100);
});
