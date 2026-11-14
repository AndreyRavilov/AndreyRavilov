// Общие помощники для e2e-тестов: сервер статики + Chromium через Playwright.
import { createRequire } from 'node:module';
import { serve } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

export { devices };

export async function setup() {
  const server = await serve(0);
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  return {
    url,
    browser,
    async close() {
      await browser.close();
      server.close();
    },
  };
}

// Открыть игру на чистом профиле; ошибки страницы собираются в page.errors
export async function openGame(env, contextOptions = { viewport: { width: 1280, height: 720 } }) {
  const context = await env.browser.newContext(contextOptions);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(m.text());
  });
  await page.goto(env.url);
  await page.waitForFunction(() => window.__deepback && document.querySelector('canvas'));
  return page;
}

export async function startNewRun(page) {
  await page.click('#start');
  await waitFor(page, () => window.__deepback.S.mode === 'day');
}

export function waitFor(page, fn, arg, timeout = 20000) {
  return page.waitForFunction(fn, arg, { timeout, polling: 50 });
}

export function game(page, fn, arg) {
  return page.evaluate(fn, arg);
}

// Поставить ныряльщика в точку (ноги на высоте y)
export function teleport(page, x, y, z) {
  return page.evaluate(([x, y, z]) => {
    const d = window.__deepback;
    d.player.pos.set(x, y, z);
    d.player.vel.set(0, 0, 0);
  }, [x, y, z]);
}

export async function toHatch(page) {
  const h = await page.evaluate(() => {
    const d = window.__deepback;
    return { x: 0, z: 13.5, y: d.city.groundAt(0, 13.5) + 0.05 };
  });
  await teleport(page, h.x, h.y, h.z);
  await waitFor(page, () => /сдать груз/.test(document.getElementById('prompt').textContent));
}

export async function pickUp(page, type) {
  const pk = await page.evaluate((type) => {
    const d = window.__deepback;
    const p = d.city.pickups.find((x) => x.active && x.type === type);
    return p && { x: p.x, y: p.y - 0.9, z: p.z };
  }, type);
  if (!pk) throw new Error(`на карте нет ${type}`);
  await teleport(page, pk.x, pk.y, pk.z);
  await waitFor(page, () => /подобрать/.test(document.getElementById('prompt').textContent));
  const before = await page.evaluate(() => window.__deepback.player.carried.length);
  await page.keyboard.press('KeyE');
  await waitFor(page, (n) => window.__deepback.player.carried.length > n, before);
}

export async function clickModalButton(page, text) {
  const btn = page.locator('#modal-buttons button', { hasText: text });
  await btn.first().waitFor({ state: 'visible', timeout: 15000 });
  await btn.first().click();
}
