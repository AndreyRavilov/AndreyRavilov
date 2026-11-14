// Вступительный ролик на движке игры. Здесь только сценарий и математика
// таймлайна (без three.js) — main.js двигает по нему камеру, воду и свет.
//
// Ролик отвечает на три вопроса: что это за мир, кто ты и как здесь
// оказался, что тебе делать. И заканчивается вопросом, ради которого играют.
//
// Поля сцены:
//   dur        — длительность, с
//   cam        — [откуда, куда] позиция камеры (или ключ, который main.js
//                превращает в точки: 'player', 'relic')
//   look       — [откуда, куда] точка, куда смотрит камера
//   water      — [от, до] уровень воды
//   time       — [от, до] время суток 0 (утро) .. 1 (ночь)
//   sub        — субтитр
//   events     — [секунда от начала сцены, событие]

export const SHOTS = [
  {
    id: 'deep',
    dur: 6,
    cam: [[46, -62, 86], [26, -54, 22]],
    look: [[0, -16, 12], [0, -12, -24]],
    water: [6, 6],
    time: [0.05, 0.05],
    sub: 'Суши больше нет. Только океан — без дна и без берегов.',
    events: [[0.2, 'moan']],
  },
  {
    id: 'reveal',
    dur: 7,
    cam: [[70, -2, 175], [118, 48, 118]],
    look: [[0, 4, 40], [0, 6, 0]],
    water: [3, 3],
    time: [0.08, 0.15],
    sub: 'Последние люди живут на спине Матери — существа размером с гору. Их город зовут Ноа.',
  },
  {
    id: 'breath',
    dur: 6,
    cam: [[16, 22, -58], [9, 20, -66]],
    look: [[0, 18, -84], [0, 24, -84]],
    water: [3, 3],
    time: [0.2, 0.25],
    sub: 'Днём Мать дышит у поверхности.',
    events: [[0.6, 'blow']],
  },
  {
    id: 'dive',
    dur: 8,
    cam: [[-95, 42, 70], [-72, 28, 26]],
    look: [[0, 6, 0], [0, 10, 0]],
    water: [3, 23],
    time: [0.3, 1],
    sub: 'А каждую ночь — ныряет. И город уходит под воду.',
    events: [[0.3, 'moan'], [3.2, 'horn'], [5.5, 'horn']],
  },
  {
    id: 'night',
    dur: 7,
    cam: [[32, 20, 36], [20, 19, 27]],
    look: [[0, 17, 0], [0, 18, 0]],
    water: [32, 32],
    time: [1, 1],
    sub: 'Кто успел в Ковчег — доживёт до утра. Кто не успел — остаётся с теми, кто живёт внизу.',
    events: [[0.5, 'deepling'], [3, 'growl']],
  },
  {
    id: 'you',
    dur: 8,
    cam: ['player-back', 'player-face'],
    look: ['player-head', 'player-head'],
    water: [2.5, 2.5],
    time: [0.02, 0.04],
    sub: 'Вчера не вернулась последняя Ныряльщица — твоя сестра Ива. Утром Совет бросил жребий. Он выпал тебе.',
    events: [[0, 'player'], [0.4, 'hatch']],
  },
  {
    id: 'relic',
    dur: 6,
    cam: ['relic-far', 'relic-near'],
    look: ['relic', 'relic'],
    water: [2.5, 2.5],
    time: [0.05, 0.05],
    sub: 'Ива искала семь реликвий. Она верила: они расскажут, куда на самом деле плывёт Мать.',
    events: [[0.3, 'chime']],
  },
  {
    id: 'task',
    dur: 7,
    cam: [[0, 26, 40], [0, 40, 70]],
    look: [[0, 15, 10], [0, 10, -10]],
    water: [2.5, 6],
    time: [0.05, 0.12],
    sub: 'Принеси еду и ворвань для двенадцати жителей. И вернись к шлюзу до последнего гудка.',
    events: [[0.2, 'nav'], [5.2, 'horn']],
  },
  {
    id: 'title',
    dur: 5,
    cam: [[0, 50, 130], [0, 95, 210]],
    look: [[0, 6, 0], [0, 0, -20]],
    water: [2.5, 2.5],
    time: [0.05, 0.05],
    sub: '',
    title: true,
    events: [[0.2, 'moan']],
  },
];

export const TOTAL = SHOTS.reduce((s, x) => s + x.dur, 0);

// Какая сцена идёт в момент t и насколько она прошла (k: 0..1)
export function shotAt(t) {
  let acc = 0;
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (t < acc + s.dur) return { index: i, shot: s, local: t - acc, k: (t - acc) / s.dur };
    acc += s.dur;
  }
  const last = SHOTS.length - 1;
  return { index: last, shot: SHOTS[last], local: SHOTS[last].dur, k: 1, done: true };
}

// События, которые случились между t0 и t1 (для звука и действий)
export function eventsBetween(t0, t1) {
  const out = [];
  let acc = 0;
  for (const s of SHOTS) {
    for (const [at, name] of s.events || []) {
      const when = acc + at;
      if (when >= t0 && when < t1) out.push({ shot: s.id, name, at: when });
    }
    acc += s.dur;
  }
  return out;
}

export function ease(k) {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
}

export function lerp(a, b, k) {
  return a + (b - a) * k;
}

export function lerp3(a, b, k) {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
