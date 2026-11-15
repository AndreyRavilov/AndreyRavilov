// Общие помощники для e2e-тестов: сервер статики + Chromium через Playwright.
import { createRequire } from 'node:module';
import { serve } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export async function setup() {
  const server = await serve(0);
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const launch = () => chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
      // совместная игра в тестах — две вкладки одного браузера; фоновая не должна засыпать
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const env = {
    url,
    launch, // отдельный браузер — для второго игрока в совместной игре
    browser: await launch(),
    opened: 0,
    // программный рендер копит память: каждые 8 игр браузер перезапускается
    async fresh(force = false) {
      if (++env.opened % 8 === 0 || force) {
        await env.browser.close().catch(() => {});
        env.browser = await launch();
      }
      return env.browser;
    },
    async close() {
      await env.browser.close();
      server.close();
    },
  };
  return env;
}

// Открыть игру на чистом профиле; ошибки страницы собираются в page.errors
export async function openGame(env, contextOptions = { viewport: { width: 1280, height: 720 } }) {
  const { quality, freshBrowser, ...ctxOptions } = contextOptions;
  const browser = env.fresh ? await env.fresh(freshBrowser) : env.browser;
  const context = await browser.newContext(ctxOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(90000);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(m.text());
  });
  // в тестах — низкое качество графики: программный рендер в CI медленный
  await page.goto(`${env.url}?quality=${quality || 'low'}`);
  await page.waitForFunction(() => window.__deepback && document.querySelector('canvas'));
  return page;
}

export async function startNewRun(page) {
  await page.click('#start');
  await waitFor(page, () => window.__deepback.S.mode === 'intro');
  await page.click('#skip'); // вступительный ролик
  await waitFor(page, () => window.__deepback.S.mode === 'day');
}

export function waitFor(page, fn, arg, timeout = 90000) {
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

// Ночь в Ковчеге: подойти к станции (по типу или к жителю по id) и нажать E
export async function goToStation(page, kindOrWho) {
  const st = await page.evaluate((k) => {
    const s = window.__deepback.ark.stations.find((x) => x.kind === k || x.who === k);
    return s && { x: s.x, z: s.z };
  }, kindOrWho);
  if (!st) throw new Error(`в Ковчеге нет: ${kindOrWho}`);
  await page.evaluate(({ x, z }) => {
    const d = window.__deepback;
    const L = Math.hypot(x, z) || 1;
    d.player.pos.set(x - (x / L) * 1.5, 0, z - (z / L) * 1.5);
    d.player.vel.set(0, 0, 0);
  }, st);
  await waitFor(page, () => document.getElementById('ark-prompt').textContent.length > 0);
  await page.keyboard.press('KeyE');
}

// После сводки ночи: войти в Ковчег, по желанию записать день, лечь спать
export async function sleepThroughNight(page, { save = false } = {}) {
  await clickModalButton(page, 'Войти в Ковчег');
  await waitFor(page, () => window.__deepback.S.mode === 'ark');
  if (save) {
    await goToStation(page, 'chronicle');
    await clickModalButton(page, 'Записать день');
    await waitFor(page, () => window.__deepback.S.savedToday && !window.__deepback.S.paused);
  }
  await goToStation(page, 'bed');
  if (!save) await clickModalButton(page, 'Лечь без записи');
  await waitFor(page, () => window.__deepback.S.mode === 'day');
}
