// Бой: здоровье, урон по оружию, выбор цели. Чистая логика без three.js.

export const PLAYER_HP = 100;
export const ENEMY_HP = { leech: 3, deepling: 8 };

// Урон по врагу: гарпун слабый, острога сильнее, заточка добавляет
export function weaponDamage(kind, { spear = false, harpoonLvl = 0 } = {}) {
  if (kind === 'bomb') return 3;
  const base = spear ? 2 : 1;
  return base + (harpoonLvl >= 2 ? 1 : 0);
}

// Урон по ныряльщику
export const BITE = { leech: 12, deepling: 28 };

// Восстановление здоровья: после паузы без ранений, понемногу
export const REGEN_DELAY = 6;
export const REGEN_PER_SEC = 4;

// Выбор цели удара: ближайший враг перед ныряльщиком.
// Перед — это внутри конуса вокруг направления взгляда камеры или того, куда смотрит сам ныряльщик.
// Если впереди никого нет, но враг совсем рядом (вплотную, сбоку или сзади) — бьём его.
// enemies: [{ x, y, z, ...}], from: { x, y, z }, dirs: [{ x, z }] — единичные направления
export function pickTarget(from, dirs, enemies, range, { cosCone = Math.cos((70 * Math.PI) / 180), close = 1.6, dy = 3 } = {}) {
  let best = null;
  let bestScore = Infinity;
  for (const e of enemies) {
    const dx = e.x - from.x;
    const dz = e.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > range || Math.abs(e.y - from.y) > dy) continue;
    let facing = d < 0.01 ? 1 : -1;
    for (const v of dirs) facing = Math.max(facing, (dx * v.x + dz * v.z) / (d || 1));
    if (facing < cosCone && d > close) continue;
    // ближе и прямее — лучше
    const score = d * (1.6 - facing);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// Нанести урон: возвращает { hp, killed }
export function damage(hp, amount) {
  const left = Math.max(0, hp - amount);
  return { hp: left, killed: left <= 0 };
}

// Здоровье игрока за кадр: восстановление после паузы
export function regen(hp, sinceHurt, dt, max = PLAYER_HP) {
  if (sinceHurt < REGEN_DELAY || hp >= max) return hp;
  return Math.min(max, hp + REGEN_PER_SEC * dt);
}

// Серия ударов: попадания чаще, чем раз в COMBO_WINDOW секунд, копятся;
// третье подряд — добивание: +1 к урону и отбрасывание сильнее
export const COMBO_WINDOW = 1.3;
export function comboStep(combo, sinceLast) {
  const n = sinceLast <= COMBO_WINDOW ? combo + 1 : 1;
  const finisher = n >= 3;
  return { combo: finisher ? 0 : n, finisher, bonus: finisher ? 1 : 0 };
}
