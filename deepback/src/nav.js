// Навигатор: поиск пути по спине Матери в обход построек.
// Чистая логика без three.js — сетка 2×2 м и A*.

export const CELL = 2;

// isBlocked(x, z) -> true, если в точке нельзя пройти
export function buildGrid(isBlocked, halfX = 46, halfZ = 130) {
  const nx = Math.floor((halfX * 2) / CELL) + 1;
  const nz = Math.floor((halfZ * 2) / CELL) + 1;
  const blocked = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = -halfX + ix * CELL;
      const z = -halfZ + iz * CELL;
      blocked[iz * nx + ix] = isBlocked(x, z) ? 1 : 0;
    }
  }
  return { nx, nz, halfX, halfZ, blocked };
}

export function cellOf(grid, x, z) {
  const ix = Math.min(grid.nx - 1, Math.max(0, Math.round((x + grid.halfX) / CELL)));
  const iz = Math.min(grid.nz - 1, Math.max(0, Math.round((z + grid.halfZ) / CELL)));
  return iz * grid.nx + ix;
}

export function posOf(grid, c) {
  return { x: -grid.halfX + (c % grid.nx) * CELL, z: -grid.halfZ + Math.floor(c / grid.nx) * CELL };
}

// Ближайшая свободная клетка (если точка внутри дома или за краем спины)
export function nearestFree(grid, x, z, maxR = 12) {
  const c0 = cellOf(grid, x, z);
  if (!grid.blocked[c0]) return c0;
  const ix0 = c0 % grid.nx;
  const iz0 = Math.floor(c0 / grid.nx);
  let best = -1;
  let bd = Infinity;
  for (let r = 1; r <= maxR && best < 0; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = ix0 + dx;
        const iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= grid.nx || iz >= grid.nz) continue;
        const c = iz * grid.nx + ix;
        if (grid.blocked[c]) continue;
        const p = posOf(grid, c);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = c; }
      }
    }
  }
  return best;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// A*. Возвращает массив точек {x, z} от старта до цели или null.
export function findPath(grid, from, to) {
  const start = nearestFree(grid, from.x, from.z);
  const goal = nearestFree(grid, to.x, to.z);
  if (start < 0 || goal < 0) return null;
  const { nx, nz, blocked } = grid;
  const n = nx * nz;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gx = goal % nx;
  const gz = Math.floor(goal / nx);
  const h = (c) => {
    const dx = Math.abs((c % nx) - gx);
    const dz = Math.abs(Math.floor(c / nx) - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  // простая бинарная куча
  const heap = [];
  const push = (c, f) => {
    heap.push([f, c]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top[1];
  };

  g[start] = 0;
  push(start, h(start));
  while (heap.length) {
    const c = pop();
    if (c === goal) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const cx = c % nx;
    const cz = Math.floor(c / nx);
    for (const [dx, dz, cost] of DIRS) {
      const ix = cx + dx;
      const iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
      const nc = iz * nx + ix;
      if (blocked[nc] || closed[nc]) continue;
      // не срезаем углы домов
      if (dx && dz && (blocked[cz * nx + ix] || blocked[iz * nx + cx])) continue;
      const ng = g[c] + cost;
      if (ng < g[nc]) {
        g[nc] = ng;
        came[nc] = c;
        push(nc, ng + h(nc));
      }
    }
  }
  if (goal !== start && came[goal] < 0) return null;
  const cells = [];
  for (let c = goal; c >= 0; c = came[c]) {
    cells.push(c);
    if (c === start) break;
  }
  cells.reverse();
  return smooth(grid, cells.map((c) => posOf(grid, c)));
}

function clear(grid, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(d / (CELL * 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    // проверяем точку и соседей, чтобы линия не чиркала по стенам
    for (const [ox, oz] of [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
      if (grid.blocked[cellOf(grid, x + ox, z + oz)]) return false;
    }
  }
  return true;
}

// Спрямляем «лесенку» клеток там, где есть прямая видимость
export function smooth(grid, pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(grid, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

export function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return d;
}

// Точки пунктира через равные промежутки вдоль пути
export function dotsAlong(pts, spacing, offset = 0, max = 200) {
  const out = [];
  let need = offset;
  for (let i = 1; i < pts.length && out.length < max; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    while (need <= len && out.length < max) {
      const t = len ? need / len : 0;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      need += spacing;
    }
    need -= len;
  }
  return out;
}

// Что показывать навигатору в режиме «Авто».
// s: { p, weight, capacity, lightest, food, fuel, needFood, needFuel, carried, questKeepsake }
export function autoTarget(s) {
  if (s.p > 0.72) return 'hatch';
  if (s.weight + 1 > s.capacity) return 'hatch';
  if (s.questKeepsake) return 'keepsake';
  const carriedFood = s.carried.filter((t) => t === 'food').length;
  const carriedFuel = s.carried.filter((t) => t === 'fuel').length;
  if (s.food + carriedFood < s.needFood) return 'food';
  if (s.fuel + carriedFuel < s.needFuel && s.weight + 3 <= s.capacity) return 'fuel';
  if (s.weight > 0 && s.weight + 2 > s.capacity) return 'hatch';
  return 'any';
}
