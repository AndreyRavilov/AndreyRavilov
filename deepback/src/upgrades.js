// Улучшения мастерской Ковчега. Покупаются ночью за обломки.
export const UPGRADES = [
  { key: 'pack', name: 'Большой короб', desc: '+3 к переносимому весу.', max: 3, cost: [3, 5, 8] },
  { key: 'tank', name: 'Медный баллон', desc: '+12 секунд воздуха под водой.', max: 3, cost: [2, 4, 6] },
  { key: 'fins', name: 'Ласты из плавника', desc: 'Плаваешь на 30% быстрее, глубинникам сложнее догнать.', max: 2, cost: [3, 6] },
  { key: 'boots', name: 'Шипованные сапоги', desc: 'Быстрее ходишь, тяжёлый груз меньше замедляет.', max: 2, cost: [3, 5] },
  { key: 'harpoon', name: 'Заточенный гарпун', desc: 'Гарпун бьёт дальше и перезаряжается быстрее.', max: 2, cost: [2, 4] },
  { key: 'still', name: 'Коптильня', desc: 'Ковчегу нужно на 1 рыбу меньше каждую ночь.', max: 1, cost: [7] },
];

export function upgradeCost(up, level) {
  return level >= up.max ? null : up.cost[level];
}
