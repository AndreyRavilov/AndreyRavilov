// Жители Ковчега. У каждого — имя, просьба и короткая история.
// Когда жители гибнут, первыми в сводке называют именно их.
export const RESIDENTS = [
  {
    id: 'mira',
    name: 'Старая Мира',
    role: 'хранительница песен',
    keepsake: 'костяную флейту',
    story: 'Мира сыграла на флейте ту самую мелодию, что звучит в песне Матери. Пол Ковчега ответил ей тихим гулом.',
    fetch: 'food',
  },
  {
    id: 'tagir',
    name: 'Механик Тагир',
    role: 'чинит шлюз',
    keepsake: 'ящик с ключами',
    story: 'Тагир разобрал замок шлюза и нашёл внутри деталь, которую никто не ставил. Она похожа на кость.',
    fetch: 'scrap',
  },
  {
    id: 'yos',
    name: 'Маленький Ёсь',
    role: 'рисует на стенах',
    keepsake: 'деревянного кита',
    story: 'Ёсь нарисовал Мать улыбающейся. Взрослые смеялись, пока не заметили, что на рисунке у неё нет ни одной сваи.',
    fetch: 'food',
  },
  {
    id: 'agata',
    name: 'Агата-кочегар',
    role: 'держит огонь в Ковчеге',
    keepsake: 'медное огниво',
    story: 'Агата говорит, что ворвань горит хуже, чем раньше. «Мать стареет, и жир у неё становится горьким».',
    fetch: 'fuel',
  },
  {
    id: 'bran',
    name: 'Бран Молчун',
    role: 'бывший Ныряльщик',
    keepsake: 'старый шлем',
    story: 'Бран надел свой старый шлем и впервые за десять лет заговорил: «Я видел дно. Там стоят дома. Такие же, как наши».',
    fetch: 'scrap',
  },
  {
    id: 'lina',
    name: 'Лина-лекарка',
    role: 'лечит больных',
    keepsake: 'сумку с травами',
    story: 'Лина заварила траву, что растёт только на спине Матери. Больные уснули и видели во сне одно и то же — глубину.',
    fetch: 'food',
  },
  {
    id: 'osk',
    name: 'Советник Оск',
    role: 'член Совета',
    keepsake: 'печать Совета',
    story: 'Оск спрятал печать в кармане и попросил никому не говорить, где ты её нашёл. На обороте — знак шестого города.',
    fetch: 'fuel',
  },
  {
    id: 'vey',
    name: 'Близнецы Вей',
    role: 'чинят сети',
    keepsake: 'сеть из жил',
    story: 'Близнецы сплели новую сеть. Утром в неё попалась рыба без глаз — из тех, что живут только на дне.',
    fetch: 'food',
  },
];

export const ICON = { food: '🐟', fuel: '🛢️', scrap: '⚙️' };

// Выбрать задание на день
export function makeQuest(rng, alive, cycle) {
  if (!alive.length) return null;
  const id = alive[Math.floor(rng() * alive.length)];
  const r = RESIDENTS.find((x) => x.id === id);
  if (rng() < 0.5) {
    const n = r.fetch === 'fuel' ? 2 : r.fetch === 'scrap' ? 3 : 3 + Math.min(3, Math.floor(cycle / 2));
    return {
      kind: 'fetch',
      who: r.id,
      item: r.fetch,
      need: n,
      have: 0,
      reward: r.fetch === 'food' ? 2 : 3,
      done: false,
      text: `${r.name} просит принести ещё ${ICON[r.fetch]} ${n}.`,
    };
  }
  return {
    kind: 'keepsake',
    who: r.id,
    reward: 3,
    done: false,
    text: `${r.name} потерял(а) ${r.keepsake} во время прошлого погружения. Вещь светится розовым где-то на краю спины.`,
  };
}

export const WEATHER = {
  clear: { name: 'Ясно', icon: '☀️', note: 'Обычный день.' },
  calm: { name: 'Штиль', icon: '🌤️', note: 'Мать плывёт спокойно: вода поднимается медленнее.' },
  fog: { name: 'Туман', icon: '🌫️', note: 'Видно на несколько десятков метров. Следи за компасом.' },
  storm: { name: 'Шторм', icon: '⛈️', note: 'Высокие волны, ветер сносит с ног, день короче.' },
};

export function rollWeather(rng, cycle) {
  if (cycle === 1) return 'clear';
  const x = rng();
  if (x < 0.4) return 'clear';
  if (x < 0.58) return 'calm';
  if (x < 0.78) return 'fog';
  return 'storm';
}
