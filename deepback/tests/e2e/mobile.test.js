// Телефон: сенсорный джойстик, кнопки и раскладка интерфейса.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, openGame, startNewRun, waitFor, game, devices } from './helpers.js';

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });

const phone = () => ({ ...devices['iPhone 13'] });

function touch(page, type, selector, dx, dy, id = 1) {
  return page.evaluate(({ type, selector, dx, dy, id }) => {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    const t = new Touch({ identifier: id, target: el, clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 + dy });
    const target = type === 'touchstart' ? el : window;
    target.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
  }, { type, selector, dx, dy, id });
}

test('на телефоне видно сенсорное управление и ничего не вылезает за экран', async (t) => {
  const page = await openGame(env, phone()); t.after(() => page.context().close().catch(() => {}));
  await page.tap('#start');
  await waitFor(page, () => window.__deepback.S.mode === 'day');
  assert.ok(await page.isVisible('#touch'));
  assert.ok(await page.isVisible('#stick'));
  assert.ok(await page.isVisible('#pausebtn'));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false);
  // панели интерфейса не перекрывают кнопки
  const boxes = await page.evaluate(() => ['#cargo', '#tbtns', '#stick', '#pausebtn', '#compass', '#ark'].map((s) => document.querySelector(s).getBoundingClientRect().toJSON()));
  const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  assert.ok(!overlap(boxes[0], boxes[1]) && !overlap(boxes[0], boxes[2]));
  assert.ok(!overlap(boxes[3], boxes[1]), 'кнопка паузы под сенсорными кнопками');
  assert.ok(!overlap(boxes[3], boxes[4]) && !overlap(boxes[3], boxes[5]), 'кнопка паузы перекрыта панелью');
  assert.ok(!overlap(boxes[4], boxes[5]), 'компас перекрывает панель Ковчега');
  assert.deepEqual(page.errors, []);
});

test('джойстик ведёт ныряльщика, кнопка «Прыжок» подбрасывает', async (t) => {
  const page = await openGame(env, phone()); t.after(() => page.context().close().catch(() => {}));
  await page.tap('#start');
  await waitFor(page, () => window.__deepback.S.mode === 'day');
  const p0 = await game(page, () => window.__deepback.player.pos.toArray());
  await touch(page, 'touchstart', '#stick', 0, -60);
  await waitFor(page, (p0) => {
    const p = window.__deepback.player.pos;
    return Math.hypot(p.x - p0[0], p.z - p0[2]) > 1.5;
  }, p0);
  await touch(page, 'touchend', '#stick', 0, -60);
  await waitFor(page, () => window.__deepback.player.onGround);
  await touch(page, 'touchstart', '#tbtns button:last-child', 0, 0, 2);
  await waitFor(page, () => window.__deepback.player.vel.y > 3);
  await touch(page, 'touchend', '#tbtns button:last-child', 0, 0, 2);
});

test('кнопка паузы на телефоне останавливает время', async (t) => {
  const page = await openGame(env, phone()); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await page.tap('#pausebtn');
  await waitFor(page, () => window.__deepback.S.paused);
  assert.ok(await page.isVisible('#pause'));
  await page.tap('#resume');
  await waitFor(page, () => !window.__deepback.S.paused);
});
