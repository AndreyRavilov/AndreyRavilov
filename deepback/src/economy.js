// Чистая логика экономики Ковчега и времени дня. Без three.js, поэтому
// легко тестируется в Node.

export const START = { pop: 12, food: 3, fuel: 2 };
export const WATER_START = 2.5; // уровень воды утром
export const WATER_END = 20; // уровень воды в момент погружения (спина целиком под водой)

export function dayLength(cycle, weather = 'clear') {
  const base = Math.max(100, 170 - (cycle - 1) * 10);
  return weather === 'storm' ? Math.round(base * 0.85) : base;
}

export function needFood(pop, still = 0) {
  return Math.max(1, Math.ceil(pop / 4) + 1 - still);
}

export function needFuel(cycle) {
  return Math.min(4, 1 + Math.floor(cycle / 2));
}

// Уровень воды в доле дня p (0..1). В штиль вода поднимается медленнее,
// но к самому погружению всё равно накрывает спину.
export function waterLevel(p, weather = 'clear') {
  const k = Math.pow(Math.min(1, Math.max(0, p)), 2.1);
  const calm = weather === 'calm' && p < 0.97 ? 0.88 : 1;
  return WATER_START + (WATER_END - WATER_START) * k * calm;
}

// Ночь: жители едят и жгут ворвань. Возвращает новый запас и потери.
// Нехватка еды убивает по одному жителю за рыбу, нехватка ворвани — по двое.
export function resolveNight({ pop, food, fuel, cycle, still = 0 }) {
  const nf = needFood(pop, still);
  const nu = needFuel(cycle);
  const eatF = Math.min(food, nf);
  const burn = Math.min(fuel, nu);
  const hunger = nf - eatF;
  const cold = nu - burn;
  const deaths = Math.min(pop, hunger + cold * 2);
  return {
    nf,
    nu,
    eatF,
    burn,
    hunger,
    cold,
    deaths,
    pop: pop - deaths,
    food: food - eatF,
    fuel: fuel - burn,
  };
}

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
