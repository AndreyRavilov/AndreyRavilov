import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFERS, trade, traderComes } from '../../src/trader.js';

test('обмен списывает отданное и добавляет полученное', () => {
  const r = trade({ food: 5, fuel: 1, scrap: 0, bombs: 0 }, 'fish4scrap');
  assert.ok(r.ok);
  assert.deepEqual(r.stock, { food: 3, fuel: 1, scrap: 3, bombs: 0 });
});

test('без нужных запасов обмен невозможен и ничего не меняет', () => {
  const st = { food: 1, fuel: 0, scrap: 0, bombs: 0 };
  const r = trade(st, 'fish4scrap');
  assert.equal(r.ok, false);
  assert.deepEqual(st, { food: 1, fuel: 0, scrap: 0, bombs: 0 });
});

test('торговец не приходит в первый день, но приходит хоть иногда', () => {
  for (const seed of [1, 2, 3]) assert.equal(traderComes(seed, 1), false);
  let n = 0;
  for (let c = 2; c < 32; c++) if (traderComes(77, c)) n++;
  assert.ok(n >= 4 && n <= 20, `за месяц приходов: ${n}`);
  assert.ok(OFFERS.length >= 3);
});

import { castawayComes } from '../../src/castaway.js';
test('плот с выжившим: не раньше третьего дня, но приходит', () => {
  for (const s of [1, 2, 3]) { assert.equal(castawayComes(s, 1), false); assert.equal(castawayComes(s, 2), false); }
  let n = 0;
  for (let c = 3; c < 43; c++) if (castawayComes(5, c)) n++;
  assert.ok(n >= 4 && n <= 20, `за 40 дней плотов: ${n}`);
});
