import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, TOTAL, shotAt, eventsBetween, ease } from '../../src/cutscene.js';

test('ролик короткий: от 40 до 70 секунд', () => {
  assert.ok(TOTAL >= 40 && TOTAL <= 70, `длина ${TOTAL} с`);
});

test('у каждой сцены есть путь камеры, вода, время суток и текст (кроме титра)', () => {
  const ids = new Set();
  for (const s of SHOTS) {
    assert.ok(!ids.has(s.id), `сцена ${s.id} повторяется`);
    ids.add(s.id);
    assert.ok(s.dur > 0);
    assert.equal(s.cam.length, 2);
    assert.equal(s.look.length, 2);
    assert.equal(s.water.length, 2);
    assert.equal(s.time.length, 2);
    if (!s.title) assert.ok(s.sub.length > 10, `у ${s.id} нет субтитра`);
  }
  assert.ok(SHOTS[SHOTS.length - 1].title, 'ролик заканчивается титром');
});

test('ролик отвечает на вопросы: что за мир, кто я, как здесь оказался, что делать', () => {
  const all = SHOTS.map((s) => s.sub).join(' ');
  assert.match(all, /Суши больше нет/);
  assert.match(all, /Матери/);
  assert.match(all, /Ковчег/);
  assert.match(all, /сестра Ива/);
  assert.match(all, /жребий/);
  assert.match(all, /реликвий/);
  assert.match(all, /ворвань/);
  assert.match(all, /шлюзу/);
});

test('shotAt находит сцену по времени, на стыках переходит к следующей', () => {
  assert.equal(shotAt(0).index, 0);
  assert.equal(shotAt(SHOTS[0].dur - 0.001).index, 0);
  assert.equal(shotAt(SHOTS[0].dur).index, 1);
  const mid = shotAt(SHOTS[0].dur + SHOTS[1].dur / 2);
  assert.equal(mid.index, 1);
  assert.ok(Math.abs(mid.k - 0.5) < 1e-9);
  const end = shotAt(TOTAL + 1);
  assert.ok(end.done);
  assert.equal(end.index, SHOTS.length - 1);
});

test('события срабатывают ровно один раз за проход', () => {
  const all = eventsBetween(0, TOTAL + 1);
  let n = 0;
  for (let t = 0; t < TOTAL + 1; t += 0.37) n += eventsBetween(t, t + 0.37).length;
  assert.equal(n, all.length);
  for (const name of ['blow', 'horn', 'deepling', 'player', 'moan']) assert.ok(all.some((e) => e.name === name), `нет события ${name}`);
});

test('сглаживание движения камеры', () => {
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(ease(-1), 0);
  assert.equal(ease(2), 1);
  assert.ok(ease(0.25) < 0.25 && ease(0.75) > 0.75);
});

test('озвучка: файл есть для каждой объявленной строки и фраза помещается в сцену', async () => {
  const { VO, VO_LINES } = await import('../../src/voice.js');
  const fs = await import('node:fs');
  const ids = new Set(SHOTS.map((s) => s.id));
  const extra = (id) => /^relic[1-7]$/.test(id) || /^ending-(rafts|heal|deep)$/.test(id);
  for (const id of VO_LINES) {
    assert.ok(ids.has(id) || extra(id), `озвучка ${id} ни к чему не привязана`);
    const file = new URL(`../../audio/vo/${id}.mp3`, import.meta.url);
    assert.ok(fs.existsSync(file), `нет файла audio/vo/${id}.mp3`);
    assert.ok(fs.statSync(file).size > 10000, `файл ${id}.mp3 подозрительно маленький`);
  }
  // рассказчик говорит ~12 символов в секунду (замерено по готовым файлам) + запас на вход
  // фраза может продолжаться в следующих сценах без своей озвучки (так «вернись к шлюзу» звучит на кадре шлюза)
  const covered = new Set();
  SHOTS.forEach((s, i) => {
    if (!VO[s.id]) return;
    let avail = s.dur;
    for (let j = i + 1; j < SHOTS.length && !VO[SHOTS[j].id] && !SHOTS[j].title; j++) {
      avail += SHOTS[j].dur;
      covered.add(SHOTS[j].id);
    }
    assert.ok(VO[s.id] + 0.8 <= avail, `сцена ${s.id}: фраза ${VO[s.id]} с не помещается в ${avail} с`);
  });
  for (const s of SHOTS) if (s.sub && !VO[s.id] && !covered.has(s.id)) assert.ok(s.sub.length / 12 + 0.8 <= s.dur, `сцена ${s.id}: текст не успеет прозвучать`);
});
