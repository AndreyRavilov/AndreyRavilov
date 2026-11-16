// Сквозные тесты: настоящий браузер, настоящая игра, ввод с клавиатуры.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, openGame, startNewRun, waitFor, game, teleport, toHatch, pickUp, clickModalButton, goToStation, sleepThroughNight } from './helpers.js';

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
  }, p0, 120000); // программный рендер в CI даёт 1–3 кадра в секунду
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

test('укрыться (R): ночь, Ковчег, мастерская Тагира, второй день', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => { window.__deepback.S.scrap = 5; });
  await toHatch(page);
  await page.keyboard.press('KeyR');
  await page.locator('#modal-title', { hasText: 'Ночь 1' }).waitFor();
  await clickModalButton(page, 'Войти в Ковчег');
  await waitFor(page, () => window.__deepback.S.mode === 'ark');
  assert.ok(await page.isVisible('#arkhud'));
  await goToStation(page, 'workshop');
  await page.locator('#modal-title', { hasText: 'Мастерская' }).waitFor();
  await page.locator('.up', { hasText: 'Большой короб' }).locator('button').click();
  const s = await game(page, () => ({ scrap: window.__deepback.S.scrap, pack: window.__deepback.S.up.pack }));
  assert.deepEqual(s, { scrap: 2, pack: 1 });
  await clickModalButton(page, 'Отойти');
  await goToStation(page, 'bed');
  await page.locator('#modal-title', { hasText: 'Лечь спать?' }).waitFor();
  await clickModalButton(page, 'Лечь без записи');
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
  // ждём именно укуса: воздух под водой тратится и сам по себе
  await waitFor(page, () => /Глубинник укусил/.test(document.getElementById('toasts').textContent));
  assert.ok(await game(page, () => window.__deepback.player.oxygen < 0.8));
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
  await waitFor(page, () => window.__deepback.S.launched, undefined, 40000);
  assert.ok(await game(page, () => window.__deepback.player.vel.y > 0 || window.__deepback.player.pos.y > 18));
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
  await sleepThroughNight(page, { save: true });
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

test('вступительный ролик: идёт до конца, отвечает на главные вопросы и запускает первый день', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await page.click('#start');
  await waitFor(page, () => window.__deepback.S.mode === 'intro');
  assert.ok(await page.isVisible('#cine'));
  assert.ok(await page.isVisible('#skip'));
  await waitFor(page, () => /Суши больше нет/.test(document.getElementById('cine-sub').textContent));
  await game(page, () => { window.__deepback.S.introSpeed = 60; });
  await waitFor(page, () => window.__deepback.S.mode === 'day', undefined, 60000);
  const subs = (await game(page, () => window.__deepback.intro.subs)).join(' ');
  assert.match(subs, /Матери/, 'что за мир');
  assert.match(subs, /ныряет/, 'что происходит ночью');
  assert.match(subs, /сестра Ива/, 'кто ты');
  assert.match(subs, /жребий/i, 'как ты здесь оказался');
  assert.match(subs, /реликвий/, 'тайна');
  assert.match(subs, /вернись к шлюзу/, 'что делать');
  assert.ok(!(await page.isVisible('#cine')));
  assert.ok(await page.isVisible('#hud'));
  assert.equal(await game(page, () => window.__deepback.S.cycle), 1);
  assert.deepEqual(page.errors, []);
});

test('озвучка: рассказчик говорит в ролике, громкость голоса настраивается', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await page.click('#start');
  await waitFor(page, () => window.__deepback.S.mode === 'intro');
  await waitFor(page, () => {
    const a = window.__deepback.voice.current;
    return a && /audio\/vo\/deep\.mp3$/.test(a.src) && a.readyState >= 2;
  });
  const ok = await game(page, () => {
    const a = window.__deepback.voice.current;
    return { paused: a.paused, duration: a.duration };
  });
  assert.equal(ok.paused, false, 'фраза должна играть');
  assert.ok(ok.duration > 4 && ok.duration < 6, `длительность ${ok.duration}`);
  // пропуск ролика глушит голос
  await page.click('#skip');
  await waitFor(page, () => window.__deepback.S.mode === 'day' && !window.__deepback.voice.current);
  // громкость голоса в паузе
  await page.keyboard.press('KeyP');
  await waitFor(page, () => window.__deepback.S.paused);
  await page.fill('#set-voice', '40');
  await page.dispatchEvent('#set-voice', 'input');
  assert.equal(await game(page, () => window.__deepback.voice.volume), 0.4);
});

test('ролик можно пропустить пробелом и пересмотреть из меню', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await page.click('#prologue-btn');
  await waitFor(page, () => window.__deepback.S.mode === 'intro');
  await page.keyboard.press('Space');
  await waitFor(page, () => window.__deepback.S.mode === 'menu');
  assert.ok(await page.isVisible('#menu'));
  assert.ok(!(await page.isVisible('#cine')));
  // из «Продолжить» ролик не показывается
  await page.click('#start');
  await waitFor(page, () => window.__deepback.S.mode === 'intro');
  await page.keyboard.press('Space');
  await waitFor(page, () => window.__deepback.S.mode === 'day');
  await toHatch(page);
  await page.keyboard.press('KeyR');
  await sleepThroughNight(page, { save: true });
  await waitFor(page, () => window.__deepback.S.cycle === 2 && window.__deepback.S.mode === 'day');
  await page.reload();
  await page.waitForFunction(() => window.__deepback);
  await page.click('#continue');
  await waitFor(page, () => window.__deepback.S.mode === 'day');
});

test('мини-карта нарисована, у неё есть легенда, M её прячет', async (t) => {
  // тяжёлый тест (чтение пикселей холста) — в свежем браузере
  const page = await openGame(env, { viewport: { width: 960, height: 540 }, freshBrowser: true }); t.after(() => page.context().close().catch(() => {}));
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

test('высокое качество графики: свечение, сглаживание и тени работают без ошибок', async (t) => {
  const page = await openGame(env, { viewport: { width: 960, height: 540 }, quality: 'high' });
  t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  assert.equal(await game(page, () => window.__deepback.post.level), 'high');
  assert.ok(await game(page, () => !!window.__deepback.post.composer));
  // переключение качества на лету
  await page.keyboard.press('KeyP');
  await waitFor(page, () => window.__deepback.S.paused);
  await page.selectOption('#set-quality', 'low');
  await waitFor(page, () => window.__deepback.post.level === 'low' && !window.__deepback.post.composer);
  await page.selectOption('#set-quality', 'medium');
  await waitFor(page, () => window.__deepback.post.level === 'medium');
  await page.click('#resume');
  await page.waitForTimeout(500);
  assert.deepEqual(page.errors, []);
});

test('ролик: показывает, что собирать и куда нести, камера не упирается в дома', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await page.click('#start');
  await waitFor(page, () => window.__deepback.S.mode === 'intro');
  const starts = await game(page, async () => {
    const { SHOTS } = await import('./src/cutscene.js');
    let acc = 0;
    const out = {};
    for (const s of SHOTS) { out[s.id] = acc; acc += s.dur; }
    return out;
  });
  for (const [id, expect] of [['task', /Рыба.*Ворвань|Ворвань.*Рыба/s], ['hatch', /Шлюз Ковчега/]]) {
    await game(page, (t0) => { const d = window.__deepback; d.S.introSpeed = 0.0001; d.intro.t = t0 + 1.5; }, starts[id]);
    await waitFor(page, (id) => window.__deepback.intro.shot >= 0 && document.getElementById('cine-sub').textContent.length > 0 && window.__deepback.intro.cams && Object.keys(window.__deepback.intro.cams).some((k) => k.startsWith(id === 'task' ? 'show' : 'hatch')), id);
    assert.match(await page.textContent('#cine-labels'), expect);
    // из выбранных точек камеры цель видна: ни одна постройка не стоит на линии взгляда
    const views = await game(page, (id) => {
      const d = window.__deepback;
      const target = d.introPoint(id === 'task' ? 'show' : 'hatch');
      return Object.entries(d.intro.cams).map(([k, c]) => [k, d.lineClear(c, target)]);
    }, id);
    assert.ok(views.length >= 2);
    for (const [k, clear] of views) assert.ok(clear, `ракурс ${k}: цель закрыта постройкой`);
  }
  // дыхало и ночной Ковчег: весь пролёт камеры не задевает дома и арки (регрессия: дом закрывал кадр)
  const flights = await page.evaluate(async () => {
    const d = window.__deepback;
    const CUT = await import('./src/cutscene.js');
    const res = [];
    for (const id of ['breath', 'night']) {
      const s = CUT.SHOTS.find((x) => x.id === id);
      d.planShot(s);
      for (let i = 0; i <= 10; i++) {
        const k = CUT.ease(i / 10);
        const c = CUT.lerp3(d.introPoint(s.cam[0]), d.introPoint(s.cam[1]), k);
        const l = CUT.lerp3(d.introPoint(s.look[0]), d.introPoint(s.look[1]), k);
        if (!d.lineClear(c, l) || !d.cameraRoomy(c, 1.2)) res.push(`${id}@${i / 10}`);
      }
    }
    return res;
  });
  assert.deepEqual(flights, [], 'камера ролика упирается в постройку');
  assert.deepEqual(page.errors, []);
});

test('ночь в Ковчеге: живые жители на местах, погибших нет, Агата знает погоду на завтра', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => { const d = window.__deepback; d.S.alive = d.S.alive.filter((id) => id !== 'mira'); d.S.food = 20; d.S.fuel = 20; d.endDay('safe'); });
  await clickModalButton(page, 'Войти в Ковчег');
  await waitFor(page, () => window.__deepback.S.mode === 'ark');
  const ids = await game(page, () => window.__deepback.ark.npcs.map((n) => n.id));
  assert.ok(!ids.includes('mira'), 'погибшая Мира не должна стоять в Ковчеге');
  for (const id of ['tagir', 'bran', 'osk', 'agata']) assert.ok(ids.includes(id), `нет ${id}`);
  assert.ok(await game(page, () => window.__deepback.ark.sleepers) > 0, 'безымянные жители спят в гамаках');
  await goToStation(page, 'agata');
  await page.locator('#modal-body', { hasText: 'завтра' }).waitFor();
  await clickModalButton(page, 'Отойти');
  // без записи в летопись игра переспрашивает перед сном
  await goToStation(page, 'bed');
  await page.locator('#modal-title', { hasText: 'Лечь спать?' }).waitFor();
  await clickModalButton(page, 'Вернуться');
  await waitFor(page, () => window.__deepback.S.mode === 'ark' && !window.__deepback.S.paused);
  assert.deepEqual(page.errors, []);
});

test('оружейная Брана: острога, солевые бомбы и ракетница против пиявок', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await game(page, () => { const d = window.__deepback; d.S.cycle = 3; d.S.scrap = 20; d.S.food = 20; d.S.fuel = 20; d.endDay('safe'); });
  await clickModalButton(page, 'Войти в Ковчег');
  await waitFor(page, () => window.__deepback.S.mode === 'ark');
  await goToStation(page, 'armory');
  await page.locator('#modal-title', { hasText: 'Оружейная' }).waitFor();
  for (const name of ['Костяная острога', 'Солевые бомбы', 'Ракетница']) {
    await page.locator('.up', { hasText: name }).locator('button').click();
  }
  // после покупки — подсказка у левого края, окно магазина её не перекрывает
  assert.ok(await page.isVisible('#arms-hint'));
  assert.match(await page.textContent('#arms-hint'), /убрать оружие/);
  const boxes = await page.evaluate(() => ['#arms-hint', '#modal .card'].map((s) => document.querySelector(s).getBoundingClientRect().toJSON()));
  assert.ok(boxes[0].right <= boxes[1].left, `подсказка (${boxes[0].right}) заходит на окно магазина (${boxes[1].left})`);
  const arms = await game(page, () => ({ ...window.__deepback.S.arms, scrap: window.__deepback.S.scrap }));
  assert.deepEqual(arms, { spear: true, bombs: 3, flare: true, flareReady: true, scrap: 20 - 4 - 2 - 5 });
  await clickModalButton(page, 'Отойти');
  await goToStation(page, 'bed');
  await clickModalButton(page, 'Лечь без записи');
  await waitFor(page, () => window.__deepback.S.mode === 'day' && window.__deepback.S.cycle === 4);
  await waitFor(page, () => /острога.*соль ×3.*ракетница/s.test(document.getElementById('weapons').textContent));

  // достать и убрать оружие
  await page.keyboard.press('Digit2');
  await waitFor(page, () => window.__deepback.S.held === 'bombs' && window.__deepback.player.handBomb.visible);
  await waitFor(page, () => /в руке: солевая бомба/.test(document.getElementById('weapons').textContent));
  await page.keyboard.press('Digit1');
  await waitFor(page, () => window.__deepback.S.held === 'spear' && window.__deepback.player.pole.visible);
  await page.keyboard.press('KeyX');
  await waitFor(page, () => window.__deepback.S.held === null && !window.__deepback.player.pole.visible);

  // бомба: пиявка прямо перед ныряльщиком
  const aim = async (i, dist) => game(page, ({ i, dist }) => {
    const d = window.__deepback;
    const l = d.city.leeches[i];
    l.cool = 30; // пока не кусает
    d.setYaw(0);
    d.player.pos.set(l.x, d.city.groundAt(l.x, l.z + dist) + 0.05, l.z + dist);
    d.player.vel.set(0, 0, 0);
  }, { i, dist });
  await aim(0, 6);
  await page.keyboard.press('KeyG');
  await waitFor(page, () => window.__deepback.city.leeches[0].dead);
  assert.equal(await game(page, () => window.__deepback.S.arms.bombs), 2);
  // острога: удар вплотную убивает
  await aim(1, 2);
  await page.keyboard.press('KeyF');
  await waitFor(page, () => window.__deepback.city.leeches[1].dead);
  // ракетница: раз в день, пиявки вокруг засыпают
  await game(page, () => {
    const d = window.__deepback;
    const l = d.city.leeches.find((x) => !x.dead);
    l.cool = 0;
    l.x = d.player.pos.x + 8;
    l.z = d.player.pos.z;
  });
  await page.keyboard.press('KeyQ');
  await waitFor(page, () => !window.__deepback.S.arms.flareReady);
  assert.ok(await game(page, () => window.__deepback.city.leeches.filter((l) => !l.dead).some((l) => l.cool > 10)));
  assert.deepEqual(page.errors, []);
});

test('совместная игра: двое в одной комнате видят друг друга, делят запасы и вместе переживают ночь', async (t) => {
  // два игрока — два отдельных браузера (два программных WebGL в одном не помещаются в память);
  // связь между ними — комнаты локального сервера игры
  const browsers = [await env.fresh(true), await env.launch()];
  t.after(() => browsers[1].close().catch(() => {}));
  const open = async (b) => {
    const page = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
    page.setDefaultNavigationTimeout(180000);
    page.setDefaultTimeout(90000);
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    await page.goto(`${env.url}?quality=low`);
    await page.waitForFunction(() => window.__deepback && document.querySelector('canvas'));
    return page;
  };
  const A = await open(browsers[0]);
  const B = await open(browsers[1]);
  const slow = 120000;

  // Аня создаёт комнату, Боря входит по коду
  await A.click('#coop-btn');
  await A.fill('#coop-name', 'Аня');
  await A.click('#coop-create');
  const code = (await A.textContent('.lobby-code b')).trim();
  assert.match(code, /^[A-Z0-9]{4}$/);
  await B.click('#coop-btn');
  await B.fill('#coop-name', 'Боря');
  await B.fill('#coop-code', code.toLowerCase());
  await B.click('#coop-join');
  await waitFor(A, () => document.querySelectorAll('.lobby-players li').length === 2, undefined, slow);
  assert.match(await A.textContent('.lobby-players'), /Боря/);

  // начали: у обоих один и тот же город
  await clickModalButton(A, 'Начать');
  await waitFor(A, () => window.__deepback.S.mode === 'day', undefined, slow);
  await waitFor(B, () => window.__deepback.S.mode === 'day', undefined, slow);
  const seeds = await Promise.all([A, B].map((p) => game(p, () => [window.__deepback.S.runSeed, window.__deepback.S.cycle, window.__deepback.city.pickups.length])));
  assert.deepEqual(seeds[0], seeds[1]);
  // Аня видит ныряльщика Бори с подписью
  await waitFor(A, () => [...document.querySelectorAll('.net-label')].some((el) => /Боря/.test(el.textContent)), undefined, slow);

  // Боря подбирает рыбу — у Ани она исчезает
  const idx = await game(B, () => { const d = window.__deepback; return d.city.pickups.findIndex((p) => p.active && p.type === 'food'); });
  await pickUp(B, 'food');
  await waitFor(A, (i) => !window.__deepback.city.pickups[i].active, idx, slow);
  // и сдаёт её — запасы Ковчега общие
  const food0 = await game(A, () => window.__deepback.S.food);
  await toHatch(B);
  await B.keyboard.press('KeyE');
  await waitFor(A, (f) => window.__deepback.S.food === f + 1, food0, slow);
  await waitFor(B, (f) => window.__deepback.S.food === f + 1, food0, slow);

  // Боря укрылся в Ковчеге, Аня тоже — день кончается у обоих
  await B.keyboard.press('KeyR');
  await waitFor(B, () => window.__deepback.S.mode === 'wait', undefined, slow);
  await waitFor(A, () => window.__deepback.coop.players().some((p) => p.presence.s === 'wait'), undefined, slow);
  await toHatch(A);
  await A.keyboard.press('KeyR');
  await waitFor(A, () => window.__deepback.S.mode === 'night', undefined, slow);
  await waitFor(B, () => window.__deepback.S.mode === 'night', undefined, slow);
  assert.match(await B.textContent('#modal-body'), /успел в Ковчег/);

  // ночь: Боря ложится, Аня ложится — у обоих наступает второй день
  await clickModalButton(B, 'Войти в Ковчег');
  await waitFor(B, () => window.__deepback.S.mode === 'ark', undefined, slow);
  await goToStation(B, 'bed');
  await sleepThroughNight(A);
  await waitFor(B, () => window.__deepback.S.mode === 'day' && window.__deepback.S.cycle === 2, undefined, slow);
  assert.equal(await game(A, () => window.__deepback.S.cycle), 2);
  assert.deepEqual(A.errors, []);
  assert.deepEqual(B.errors, []);
});

test('косяк рыб: нырнуть к косяку и поймать рыбу на E', async (t) => {
  const page = await openGame(env); t.after(() => page.context().close().catch(() => {}));
  await startNewRun(page);
  await waitFor(page, () => window.__deepback.schools.list.length >= 3);
  // ныряльщик прямо в косяке
  await game(page, () => {
    const d = window.__deepback;
    const sc = d.schools.list[0];
    d.S.t = d.S.T * 0.1;
    d.player.pos.set(sc.center.x, sc.center.y - 1, sc.center.z);
    d.player.vel.set(0, 0, 0);
  });
  await waitFor(page, () => /поймать рыбу из косяка/.test(document.getElementById('prompt').textContent) || (window.__deepback.player.pos.set(window.__deepback.schools.list[0].center.x, window.__deepback.schools.list[0].center.y - 1, window.__deepback.schools.list[0].center.z), false));
  await page.keyboard.press('KeyE');
  await waitFor(page, () => window.__deepback.player.carried.includes('food'));
  assert.equal(await game(page, () => window.__deepback.schools.list[0].left), 2);
  assert.deepEqual(page.errors, []);
});
