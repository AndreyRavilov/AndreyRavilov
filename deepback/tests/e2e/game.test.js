// Сквозные тесты: настоящий браузер, настоящая игра, ввод с клавиатуры.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, openGame, startNewRun, waitFor, game, teleport, toHatch, pickUp, clickModalButton } from './helpers.js';

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });

test('главное меню открывается без ошибок', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  assert.equal(await page.title(), 'DEEPBACK');
  assert.ok(await page.isVisible('#menu'));
  assert.match(await page.textContent('#intro'), /Мать/);
  assert.ok(await page.isVisible('#start'));
  assert.ok(!(await page.isVisible('#continue')), 'на чистом профиле продолжать нечего');
  await page.waitForTimeout(500);
  assert.deepEqual(page.errors, []);
});

test('первый день: интерфейс, таймер, ясная погода, задание жителя', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  assert.ok(await page.isVisible('#hud'));
  assert.equal(await page.textContent('#cycle'), '1');
  assert.match(await page.textContent('#weather'), /Ясно/);
  assert.match(await page.textContent('#timetxt'), /До погружения/);
  assert.ok(await page.isVisible('#quest'));
  const t0 = await game(page, () => window.__deepback.S.t);
  await waitFor(page, (t0) => window.__deepback.S.t > t0 + 0.3, t0);
  const s = await game(page, () => ({ pop: window.__deepback.S.pop, food: window.__deepback.S.food, fuel: window.__deepback.S.fuel }));
  assert.deepEqual(s, { pop: 12, food: 3, fuel: 2 });
  assert.deepEqual(page.errors, []);
});

test('ходьба клавишей W двигает ныряльщика', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  const p0 = await game(page, () => window.__deepback.player.pos.toArray());
  await page.keyboard.down('KeyW');
  await waitFor(page, (p0) => {
    const p = window.__deepback.player.pos;
    return Math.hypot(p.x - p0[0], p.z - p0[2]) > 1.5;
  }, p0);
  await page.keyboard.up('KeyW');
});

test('подобрать рыбу и обломки, сдать в Ковчег', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await pickUp(page, 'food');
  await pickUp(page, 'scrap');
  assert.match(await page.textContent('#cargo'), /Груз 3\/8/);
  await toHatch(page);
  await page.keyboard.press('KeyE');
  await waitFor(page, () => window.__deepback.player.carried.length === 0);
  const s = await game(page, () => ({ food: window.__deepback.S.food, scrap: window.__deepback.S.scrap }));
  assert.equal(s.food, 4);
  assert.ok(s.scrap >= 1);
});

test('перегруз: тяжёлое не поднять сверх вместимости', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => { const d = window.__deepback; d.player.carried = ['fuel', 'fuel']; d.player.refreshPack(); });
  const pk = await game(page, () => {
    const p = window.__deepback.city.pickups.find((x) => x.active && x.type === 'fuel');
    return { x: p.x, y: p.y - 0.9, z: p.z };
  });
  await teleport(page, pk.x, pk.y, pk.z);
  await waitFor(page, () => /слишком тяжело/.test(document.getElementById('prompt').textContent));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  assert.equal(await game(page, () => window.__deepback.player.carried.length), 2);
});

test('реликвия: сдача открывает запись, журнал её хранит', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await pickUp(page, 'relic');
  await toHatch(page);
  await page.keyboard.press('KeyE');
  await page.locator('#modal-title', { hasText: 'Реликвия I' }).waitFor();
  assert.equal(await game(page, () => window.__deepback.S.lore), 1);
  await clickModalButton(page, 'Спрятать в журнал');
  await waitFor(page, () => !window.__deepback.S.paused);
  await page.keyboard.press('KeyJ');
  await page.locator('#modal-title', { hasText: 'Журнал' }).waitFor();
  assert.match(await page.textContent('#modal-body'), /Табличка основателей/);
  await clickModalButton(page, 'Закрыть');
});

test('укрыться (R): ночь, мастерская, покупка улучшения, второй день', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => { window.__deepback.S.scrap = 5; });
  await toHatch(page);
  await page.keyboard.press('KeyR');
  await page.locator('#modal-title', { hasText: 'Ночь 1' }).waitFor();
  assert.match(await page.textContent('#modal-body'), /Мастерская Ковчега/);
  await page.locator('.up', { hasText: 'Большой короб' }).locator('button').click();
  const s = await game(page, () => ({ scrap: window.__deepback.S.scrap, pack: window.__deepback.S.up.pack }));
  assert.deepEqual(s, { scrap: 2, pack: 1 });
  await clickModalButton(page, 'Встретить утро');
  await waitFor(page, () => window.__deepback.S.mode === 'day' && window.__deepback.S.cycle === 2);
  assert.equal(await game(page, () => window.__deepback.player.capacity), 11);
  assert.equal(await game(page, () => window.__deepback.deeplings.filter((d) => d.active).length), 1);
  assert.ok(await game(page, () => window.__deepback.city.leeches.length) > 0);
});

test('не успел к шлюзу: шлюз закрывается, ныряльщик тонет, груз потерян', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await pickUp(page, 'food');
  await game(page, () => { const d = window.__deepback; d.S.t = d.S.T - 0.05; });
  await waitFor(page, () => window.__deepback.S.mode === 'closing');
  assert.match(await page.textContent('#timetxt'), /ШЛЮЗ ЗАКРЫТ/);
  await game(page, () => { window.__deepback.player.oxygen = 0.02; window.__deepback.player.pos.y = 0; });
  await page.locator('#modal-title', { hasText: 'Ночь 1' }).waitFor({ timeout: 30000 });
  assert.match(await page.textContent('#modal-body'), /не успел к шлюзу/);
  const s = await game(page, () => ({ pop: window.__deepback.S.pop, carried: window.__deepback.player.carried.length }));
  assert.equal(s.carried, 0);
  assert.ok(s.pop < 12);
});

test('пиявка срывает груз, гарпун (F) отбрасывает её', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => { const d = window.__deepback; d.S.cycle = 3; d.startDay(); });
  await waitFor(page, () => window.__deepback.city.leeches.length > 0);
  // гарпун: пиявка прямо перед камерой
  await game(page, () => {
    const d = window.__deepback;
    const l = d.city.leeches[0];
    d.setYaw(0);
    d.player.pos.set(l.x, l.mesh.position.y, l.z + 2.2);
    d.player.vel.set(0, 0, 0);
    l.cool = 5; // пусть пока не кусает
  });
  await page.keyboard.press('KeyF');
  await waitFor(page, () => !!window.__deepback.city.leeches[0].push);
  // укус: пиявка рядом, на спине груз
  await game(page, () => {
    const d = window.__deepback;
    const l = d.city.leeches[1] || d.city.leeches[0];
    l.cool = 0;
    l.push = null;
    d.player.carried = ['food'];
    d.player.refreshPack();
    d.player.pos.set(l.x + 0.6, l.mesh.position.y, l.z);
  });
  await waitFor(page, () => window.__deepback.player.carried.length === 0);
});

test('глубинник кусает под водой и отнимает воздух', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => { const d = window.__deepback; d.S.cycle = 2; d.startDay(); });
  await game(page, () => {
    const d = window.__deepback;
    const D = d.deeplings[0];
    d.player.pos.set(D.pos.x, D.pos.y - 1, D.pos.z + 0.5);
    d.player.vel.set(0, 0, 0);
  });
  await waitFor(page, () => window.__deepback.player.oxygen < 0.8);
  assert.match(await page.textContent('#toasts'), /Глубинник укусил/);
});

test('дыхало подбрасывает ныряльщика', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => {
    const d = window.__deepback;
    d.player.pos.set(0, d.city.groundAt(0, -84) + 0.05, -84);
    d.player.vel.set(0, 0, 0);
    d.S.blowTimer = 0;
  });
  await waitFor(page, () => window.__deepback.player.vel.y > 15 || window.__deepback.player.pos.y > 25);
});

test('потерянная вещь жителя: найти, сдать, прочитать историю', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  // ищем день с заданием «найти вещь»
  await game(page, () => {
    const d = window.__deepback;
    for (let c = 2; c < 60; c++) {
      d.S.cycle = c;
      d.startDay();
      if (d.S.quest && d.S.quest.kind === 'keepsake') return;
    }
    throw new Error('нет дня с потерянной вещью');
  });
  await pickUp(page, 'keepsake');
  const scrap0 = await game(page, () => window.__deepback.S.scrap);
  await toHatch(page);
  await page.keyboard.press('KeyE');
  await page.locator('#modal-body', { hasText: 'Ты вернул' }).waitFor();
  assert.equal(await game(page, () => window.__deepback.S.scrap), scrap0 + 3);
  assert.equal(await game(page, () => window.__deepback.S.quest.done), true);
  await clickModalButton(page, 'Вернуться к работе');
  assert.match(await page.textContent('#quest'), /выполнена/);
});

test('шторм: дождь, ветер и пометка в интерфейсе', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => {
    const d = window.__deepback;
    for (let c = 2; c < 80; c++) {
      d.S.cycle = c;
      d.startDay();
      if (d.S.weather === 'storm') return;
    }
    throw new Error('шторм не выпал');
  });
  await waitFor(page, () => /Шторм/.test(document.getElementById('weather').textContent));
  assert.ok(await game(page, () => !!window.__deepback.S.wind));
  await waitFor(page, () => window.__deepback.rain.visible);
  // под водой дождя не видно
  await game(page, () => { const d = window.__deepback; d.player.pos.set(150, -12, 0); d.player.vel.set(0, 0, 0); });
  await waitFor(page, () => !window.__deepback.rain.visible);
});

test('сохранение: после перезагрузки можно продолжить с того же дня', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await toHatch(page);
  await page.keyboard.press('KeyR');
  await clickModalButton(page, 'Встретить утро');
  await waitFor(page, () => window.__deepback.S.cycle === 2 && window.__deepback.S.mode === 'day');
  await page.reload();
  await page.waitForFunction(() => window.__deepback);
  assert.ok(await page.isVisible('#continue'));
  assert.match(await page.textContent('#continue'), /ДЕНЬ 2/);
  await page.click('#continue');
  await waitFor(page, () => window.__deepback.S.mode === 'day');
  assert.equal(await game(page, () => window.__deepback.S.cycle), 2);
});

test('пауза и настройки сохраняются', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await page.keyboard.press('KeyP');
  await waitFor(page, () => window.__deepback.S.paused);
  assert.ok(await page.isVisible('#pause'));
  const t0 = await game(page, () => window.__deepback.S.t);
  await page.waitForTimeout(400);
  assert.equal(await game(page, () => window.__deepback.S.t), t0, 'на паузе время стоит');
  await page.fill('#set-volume', '30');
  await page.dispatchEvent('#set-volume', 'input');
  await page.click('#resume');
  await waitFor(page, () => !window.__deepback.S.paused);
  await page.reload();
  await page.waitForFunction(() => window.__deepback);
  assert.equal(await page.inputValue('#set-volume'), '30');
});

test('все жители погибли: седьмой город пал, сохранение стёрто', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => { const d = window.__deepback; d.S.pop = 2; d.S.food = 0; d.S.fuel = 0; d.endDay('safe'); });
  await page.locator('#modal-title', { hasText: 'Седьмой город пал' }).waitFor();
  assert.match(await page.textContent('#modal-body'), /Среди погибших|Ковчег всплыл пустым/);
  await page.reload();
  await page.waitForFunction(() => window.__deepback);
  assert.ok(!(await page.isVisible('#continue')));
});

test('семь реликвий: выбор и каждый из трёх финалов', async (t) => {
  for (const ending of ['Плоты', 'Исцеление', 'В глубину']) {
    const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
    await startNewRun(page);
    await game(page, () => { const d = window.__deepback; d.S.lore = 7; d.S.food = 50; d.S.fuel = 50; d.endDay('safe'); });
    await clickModalButton(page, 'Дальше');
    await page.locator('#modal-title', { hasText: 'Выбор' }).waitFor();
    await clickModalButton(page, ending);
    await page.locator('#modal-title', { hasText: `Финал: ${ending}` }).waitFor();
    await clickModalButton(page, 'Сыграть снова');
    await waitFor(page, () => window.__deepback.S.mode === 'day' && window.__deepback.S.cycle === 1 && window.__deepback.S.lore === 0);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test('предыстория: пять слайдов перед первым днём, из меню её можно перечитать', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await page.click('#prologue-btn');
  await page.locator('#modal-title', { hasText: 'Мир без берегов' }).waitFor();
  await clickModalButton(page, 'Пропустить');
  assert.ok(await page.isVisible('#menu'), 'после просмотра возвращаемся в меню');
  await page.click('#start');
  const titles = ['Мир без берегов', 'Ноа', 'Жребий', 'Что тебе предстоит', 'О чём молчит Совет'];
  for (let i = 0; i < titles.length; i++) {
    await page.locator('#modal-title', { hasText: titles[i] }).waitFor();
    assert.equal(await game(page, () => window.__deepback.S.mode), 'menu', 'игра не идёт, пока читаем');
    await clickModalButton(page, i === titles.length - 1 ? 'Выйти из шлюза' : 'Дальше');
  }
  await waitFor(page, () => window.__deepback.S.mode === 'day');
  assert.deepEqual(page.errors, []);
});

test('мини-карта нарисована, у неё есть легенда, M её прячет', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  assert.ok(await page.isVisible('#minimap'));
  const legend = await page.textContent('#legend');
  for (const word of ['Ты', 'Ковчег', 'Рыба', 'Ворвань', 'Обломки', 'Реликвия', 'Пиявка', 'Глубинник']) assert.match(legend, new RegExp(word));
  // на холсте есть и спина, и отметки припасов, и стрелка игрока
  // (waitForFunction здесь не подходит: в его опросе getImageData видит пустой холст)
  let colors = 0;
  for (let i = 0; i < 40 && colors < 6; i++) {
    colors = await game(page, () => {
      const c = document.getElementById('minimap');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) seen.add(`${d[i] >> 5},${d[i + 1] >> 5},${d[i + 2] >> 5}`);
      return seen.size;
    });
    if (colors < 6) await page.waitForTimeout(250);
  }
  assert.ok(colors >= 6, `на мини-карте слишком мало цветов: ${colors}`);
  await page.keyboard.press('KeyM');
  await waitFor(page, () => getComputedStyle(document.getElementById('map')).display === 'none');
  await page.keyboard.press('KeyM');
  await waitFor(page, () => getComputedStyle(document.getElementById('map')).display !== 'none');
});

test('навигатор: пунктир ведёт к цели, Tab меняет цель, к вечеру зовёт в Ковчег', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  // авто: еды мало — ведёт к рыбе
  await waitFor(page, () => window.__deepback.navDots.count > 3);
  assert.match(await page.textContent('#nav-target'), /Авто → (Рыба|Вещь жителя)/);
  assert.match(await page.textContent('#nav-dist'), /\d+ м/);
  // маршрут заканчивается на цели и не проходит сквозь дома
  const ok = await game(page, () => {
    const d = window.__deepback;
    const path = d.S.navPath;
    const end = path[path.length - 1];
    const onPickup = d.city.pickups.some((p) => p.active && Math.hypot(p.x - end.x, p.z - end.z) < 0.01);
    let through = false;
    for (let i = 1; i < path.length; i++) {
      for (let k = 0; k <= 20; k++) {
        const x = path[i - 1].x + (path[i].x - path[i - 1].x) * (k / 20);
        const z = path[i - 1].z + (path[i].z - path[i - 1].z) * (k / 20);
        for (const c of d.city.colliders) {
          if (c.type === 'box' && c.maxX - c.minX > 3 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) through = true;
        }
      }
    }
    return { onPickup, through };
  });
  assert.deepEqual(ok, { onPickup: true, through: false });
  // Tab: следующая цель — Ковчег
  await page.keyboard.press('Tab');
  await waitFor(page, () => document.getElementById('nav-target').textContent === 'Ковчег');
  // ... и дальше по кругу до «Выключен»: пунктир исчезает
  for (let mode = 2; mode <= 7; mode++) {
    await page.keyboard.press('Tab');
    await waitFor(page, (m) => window.__deepback.S.navMode === m, mode);
  }
  await waitFor(page, () => document.getElementById('nav-target').textContent === 'Выключен' && window.__deepback.navDots.count === 0);
  await page.keyboard.press('Tab'); // снова «Авто»
  await waitFor(page, () => window.__deepback.S.navMode === 0);
  // вечером авто-режим ведёт домой
  await game(page, () => { const d = window.__deepback; d.S.t = d.S.T * 0.8; });
  await waitFor(page, () => /Авто → Ковчег/.test(document.getElementById('nav-target').textContent));
});
