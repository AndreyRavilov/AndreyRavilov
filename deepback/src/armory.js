// Оружейная Брана Молчуна: снаряжение против пиявок и глубинников.
// Чистая логика без three.js — легко тестируется.

export const WEAPONS = [
  {
    key: 'spear',
    name: 'Костяная острога',
    desc: 'Гарпун (F) больше не отталкивает пиявок, а убивает их.',
    cost: 4,
    kind: 'once',
  },
  {
    key: 'bombs',
    name: 'Солевые бомбы ×3',
    desc: 'G — бросить. Соль убивает пиявок в радиусе 4,5 м и отпугивает глубинников.',
    cost: 2,
    kind: 'ammo',
    amount: 3,
    max: 9,
  },
  {
    key: 'flare',
    name: 'Ракетница',
    desc: 'Q — выстрел раз в день. Свет прогоняет глубинников и усыпляет пиявок вокруг.',
    cost: 5,
    kind: 'once',
  },
];

export const BOMB_RADIUS = 4.5;
export const BOMB_SCARE_RADIUS = 10;
export const FLARE_RADIUS = 32;

export function emptyArms() {
  return { spear: false, bombs: 0, flare: false, flareReady: true };
}

// Можно ли купить и почему нет. Возвращает null, если можно, иначе причину.
export function cannotBuy(arms, scrap, key) {
  const w = WEAPONS.find((x) => x.key === key);
  if (!w) return 'Такого у Брана нет.';
  if (w.kind === 'once' && arms[key]) return 'Уже есть.';
  if (w.kind === 'ammo' && arms[key] >= w.max) return `Больше ${w.max} не унести.`;
  if (scrap < w.cost) return `Нужно обломков: ${w.cost}.`;
  return null;
}

// Покупка: новые запасы и остаток обломков
export function buy(arms, scrap, key) {
  const reason = cannotBuy(arms, scrap, key);
  if (reason) return { ok: false, reason, arms, scrap };
  const w = WEAPONS.find((x) => x.key === key);
  const next = { ...arms };
  if (w.kind === 'once') next[key] = true;
  else next[key] = Math.min(w.max, (next[key] || 0) + w.amount);
  return { ok: true, arms: next, scrap: scrap - w.cost };
}

// Утро: ракетница снова заряжена
export function morning(arms) {
  return { ...arms, flareReady: true };
}

// Кого задевает взрыв: индексы пиявок в радиусе
export function inBlast(center, leeches, radius = BOMB_RADIUS) {
  const hit = [];
  leeches.forEach((l, i) => {
    if (!l.dead && Math.hypot(l.x - center.x, l.z - center.z) <= radius) hit.push(i);
  });
  return hit;
}
