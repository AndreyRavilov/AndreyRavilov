// Город, физика ныряльщика и глубинники — без браузера, на настоящих модулях игры.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { City, HATCH, inside, ITEM } from '../../src/city.js';
import { backHeight, backU } from '../../src/whale.js';
import { Ocean } from '../../src/ocean.js';
import { Player, CAPACITY } from '../../src/player.js';
import { Deepling } from '../../src/creatures.js';

function makeCity(seed = 123, cycle = 1, relic = 0, opts = {}) {
  const city = new City(new THREE.Scene());
  city.generate(seed, cycle, relic, 7, opts);
  return city;
}

function makeWorld(city, level = 2.5) {
  const ocean = new Ocean(new THREE.Scene());
  ocean.amp = 0; // ровная вода — проще проверять
  ocean.update(0, level, 0, 0);
  return {
    get colliders() { return city.colliders; },
    ocean,
    current: 0,
    groundAt: (x, z, y) => city.groundAt(x, z, y),
    wind: null,
  };
}

// Свободный от построек участок спины: коридор 8 м по +X и по +Z
function openSpot(city) {
  for (let z = 20; z < 100; z += 1) {
    for (let x = -20; x < 20; x += 1) {
      if (backU(x + 8, z + 8) > 0.6) continue;
      let free = true;
      for (let d = 0; d <= 8 && free; d += 0.5) {
        if (city.overlaps(x + d, z, 1.2) || city.overlaps(x, z + d, 1.2)) free = false;
      }
      if (free) return { x, z };
    }
  }
  throw new Error('нет свободного места');
}

function step(player, world, input, seconds, yaw = 0) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) player.update(dt, input, yaw, world);
}

// ---------- Город ----------

test('город с одинаковым сидом строится одинаково', () => {
  const a = makeCity(77);
  const b = makeCity(77);
  assert.deepEqual(a.pickups.map((p) => [p.type, p.x, p.z]), b.pickups.map((p) => [p.type, p.x, p.z]));
  assert.equal(a.colliders.length, b.colliders.length);
  const c = makeCity(78);
  assert.notDeepEqual(a.pickups.map((p) => p.x), c.pickups.map((p) => p.x));
});

test('постройки склеены в несколько сеток, припасы и пиявки остаются отдельными', () => {
  const city = makeCity(8, 3);
  const baked = city.group.children.filter((c) => c.userData.baked);
  const loose = city.group.children.filter((c) => !c.userData.baked && !c.userData.dynamic && !c.isInstancedMesh);
  assert.ok(baked.length > 3 && baked.length < 40, `склеенных сеток: ${baked.length}`);
  assert.equal(loose.length, 0, 'неподвижные постройки должны быть склеены');
  // мелочь под ногами — инстансами, не больше четырёх отрисовок
  assert.ok(city.group.children.filter((c) => c.isInstancedMesh).length <= 4);
  assert.equal(city.group.children.filter((c) => c.userData.dynamic).length, city.pickups.length + city.leeches.length);
});

test('у всех склеенных сеток с цветами вершин есть цвет (иначе они чёрные)', () => {
  const city = makeCity(13, 2);
  for (const m of city.group.children.filter((c) => c.userData.baked)) {
    if (m.material.vertexColors) assert.ok(m.geometry.attributes.color, 'нет цвета вершин');
  }
});

test('в городе есть все виды припасов', () => {
  const city = makeCity(5);
  const types = new Set(city.pickups.map((p) => p.type));
  for (const t of ['food', 'fuel', 'scrap', 'relic']) assert.ok(types.has(t), `нет ${t}`);
  for (const p of city.pickups) assert.ok(ITEM[p.type], `у ${p.type} нет описания`);
});

test('припасы лежат на спине и не внутри построек', () => {
  for (const seed of [1, 2, 3, 4]) {
    const city = makeCity(seed);
    for (const p of city.pickups) {
      assert.ok(backU(p.x, p.z) < 1, 'припас за краем спины');
      for (const c of city.colliders) {
        if (c.type === 'box') assert.ok(!inside(c, p.x, p.z, 0), `припас ${p.type} внутри постройки`);
      }
    }
  }
});

test('реликвия появляется, только пока не собраны все 7', () => {
  assert.equal(makeCity(9, 1, 0).pickups.filter((p) => p.type === 'relic').length, 1);
  assert.equal(makeCity(9, 1, 7).pickups.filter((p) => p.type === 'relic').length, 0);
});

test('потерянная вещь жителя кладётся только по заданию', () => {
  assert.equal(makeCity(9).pickups.filter((p) => p.type === 'keepsake').length, 0);
  assert.equal(makeCity(9, 1, 0, { keepsake: true }).pickups.filter((p) => p.type === 'keepsake').length, 1);
});

test('пиявок нет в первый день, дальше их больше, но не больше 12', () => {
  assert.equal(makeCity(3, 1).leeches.length, 0);
  const d2 = makeCity(3, 2).leeches.length;
  const d4 = makeCity(3, 4).leeches.length;
  assert.ok(d2 > 0 && d2 <= 2);
  assert.ok(d4 > d2);
  assert.ok(makeCity(3, 30).leeches.length <= 12);
});

test('шлюз Ковчега всегда свободен от построек', () => {
  for (const seed of [10, 20, 30, 40, 50]) {
    const city = makeCity(seed);
    for (const c of city.colliders) {
      if (c.type === 'box') assert.ok(!inside(c, HATCH.x, HATCH.z, 1.5), `сид ${seed}: шлюз загорожен`);
    }
  }
});

test('земля в городе не ниже спины кита', () => {
  const city = makeCity(11);
  for (let i = 0; i < 200; i++) {
    const x = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 240;
    const bh = backHeight(x, z);
    if (!isFinite(bh)) continue;
    assert.ok(city.groundAt(x, z) >= bh);
  }
});

// ---------- Ныряльщик ----------

test('ныряльщик падает и встаёт на спину', () => {
  const city = makeCity(1);
  const world = makeWorld(city);
  const p = new Player(new THREE.Scene());
  p.reset(new THREE.Vector3(HATCH.x, HATCH.y + 5, HATCH.z + 6));
  step(p, world, new Set(), 2);
  assert.ok(p.onGround);
  assert.ok(Math.abs(p.pos.y - city.groundAt(p.pos.x, p.pos.z, p.pos.y)) < 0.05);
});

test('сквозь стену дома пройти нельзя', () => {
  const city = makeCity(2);
  const world = makeWorld(city);
  const house = city.colliders.find((c) => c.type === 'box' && c.maxX - c.minX > 4 && c.top - c.bottom > 6);
  assert.ok(house, 'нужен дом для проверки');
  const cz = (house.minZ + house.maxZ) / 2;
  const startX = house.minX - 3;
  const p = new Player(new THREE.Scene());
  p.reset(new THREE.Vector3(startX, city.groundAt(startX, cz) + 0.05, cz));
  // yaw = -PI/2: «вперёд» — это +X, прямо в стену
  step(p, world, new Set(['KeyW']), 3, -Math.PI / 2);
  assert.ok(p.pos.x <= house.minX, `ныряльщик внутри дома: x=${p.pos.x}, стена ${house.minX}`);
});

test('под водой кончается воздух, улучшенный баллон держит дольше', () => {
  const city = makeCity(1);
  const world = makeWorld(city, 2.5);
  const run = (oxyTime) => {
    const p = new Player(new THREE.Scene());
    p.oxyTime = oxyTime;
    p.reset(new THREE.Vector3(150, -6, 0)); // открытый океан
    step(p, world, new Set(['KeyC']), 3); // держим «вниз»
    return p;
  };
  const base = run(22);
  const tank = run(46);
  assert.ok(base.headUnder);
  assert.ok(base.oxygen < 0.95);
  assert.ok(tank.oxygen > base.oxygen);
});

test('в воде ныряльщик всплывает к поверхности', () => {
  const city = makeCity(1);
  const world = makeWorld(city, 2.5);
  const p = new Player(new THREE.Scene());
  p.reset(new THREE.Vector3(150, -8, 0));
  step(p, world, new Set(), 8);
  assert.ok(!p.headUnder, 'голова должна быть над водой');
  assert.ok(p.oxygen > 0.9);
});

test('ночное течение утягивает на глубину', () => {
  const city = makeCity(1);
  const world = makeWorld(city, 2.5);
  world.current = 6;
  const p = new Player(new THREE.Scene());
  p.reset(new THREE.Vector3(150, 0.5, 0));
  step(p, world, new Set(['Space']), 4);
  assert.ok(p.headUnder);
});

test('вес груза считается по предметам, базовая вместимость 8', () => {
  const p = new Player(new THREE.Scene());
  assert.equal(p.capacity, CAPACITY);
  assert.equal(CAPACITY, 8);
  p.carried = ['food', 'fuel', 'scrap', 'relic'];
  assert.equal(p.weight, 1 + 3 + 2 + 1);
});

test('тяжёлый груз замедляет', () => {
  const city = makeCity(4);
  const world = makeWorld(city);
  const dist = (carried) => {
    const p = new Player(new THREE.Scene());
    const o = openSpot(city);
    p.reset(new THREE.Vector3(o.x, 30, o.z));
    p.carried = carried;
    step(p, world, new Set(), 1.5);
    const z0 = p.pos.z;
    step(p, world, new Set(['KeyS']), 1); // yaw=0, «назад» = +Z, от Ковчега
    return Math.abs(p.pos.z - z0);
  };
  assert.ok(dist(['fuel', 'fuel']) < dist([]));
});

test('регрессия: в шторм стоящий персонаж не уходит сам (баг четвёртого дня)', () => {
  const city = makeCity(4);
  const world = makeWorld(city);
  world.wind = { x: 3.2, z: 0 }; // самый сильный порыв
  const p = new Player(new THREE.Scene());
  const o = openSpot(city);
  p.reset(new THREE.Vector3(o.x, 30, o.z));
  step(p, world, new Set(), 1.5);
  const x0 = p.pos.x;
  step(p, world, new Set(), 3); // весь порыв стоим, ничего не нажимая
  assert.ok(Math.abs(p.pos.x - x0) < 1.6, `за порыв снесло на ${(p.pos.x - x0).toFixed(2)} м`);
  world.wind = null; // затишье
  const x1 = p.pos.x;
  step(p, world, new Set(), 2);
  assert.ok(Math.abs(p.pos.x - x1) < 0.05, 'между порывами персонаж стоит');
});

test('шторм сносит ветром, пока ныряльщик на поверхности', () => {
  const city = makeCity(4);
  const world = makeWorld(city);
  world.wind = { x: 2.6, z: 0 };
  const p = new Player(new THREE.Scene());
  const o = openSpot(city);
  p.reset(new THREE.Vector3(o.x, 30, o.z));
  step(p, world, new Set(), 1.5);
  const x0 = p.pos.x;
  step(p, world, new Set(['Space']), 1.2); // в прыжке порыв сносит
  assert.ok(p.pos.x > x0 + 0.5);
});

// ---------- Глубинник ----------

test('глубинник всегда под водой и охотится на нырнувшего', () => {
  const city = makeCity(1);
  const world = makeWorld(city, 6);
  const scene = new THREE.Scene();
  const d = new Deepling(scene, 0.5);
  d.setActive(true, 6);
  const p = new Player(scene);
  p.reset(new THREE.Vector3(d.pos.x + 10, d.pos.y, d.pos.z));
  p.swimming = true;
  p.headUnder = true;
  for (let i = 0; i < 120; i++) {
    d.update(1 / 60, p, world.ocean, false, 0);
    assert.ok(d.pos.y <= world.ocean.level - 1.4 + 1e-9, 'глубинник вынырнул');
  }
  assert.ok(d.hunting);
});

test('глубинник кусает вплотную, потом отплывает и не кусает сразу снова', () => {
  const world = makeWorld(makeCity(1), 6);
  const scene = new THREE.Scene();
  const d = new Deepling(scene, 0.5);
  d.setActive(true, 6);
  const p = new Player(scene);
  p.reset(new THREE.Vector3(d.pos.x, d.pos.y - 1, d.pos.z + 0.5));
  p.swimming = true;
  p.headUnder = true;
  // сначала замах: укуса нет, пасть распахивается
  assert.equal(d.update(1 / 60, p, world.ocean, false, 0), null);
  assert.ok(d.windup > 0, 'глубинник замахивается');
  let r = null;
  for (let i = 0; i < 80 && r !== 'bite'; i++) {
    p.pos.set(d.pos.x, d.pos.y - 1, d.pos.z + 0.5);
    r = d.update(1 / 60, p, world.ocean, false, 0);
  }
  assert.equal(r, 'bite');
  assert.equal(d.update(1 / 60, p, world.ocean, false, 0), null);
  assert.ok(d.flee > 0);
});

test('от броска глубинника можно уйти: если ныряльщик отплыл, бросок мимо', () => {
  const world = makeWorld(makeCity(1), 6);
  const scene = new THREE.Scene();
  const d = new Deepling(scene, 0.5);
  d.setActive(true, 6);
  const p = new Player(scene);
  p.reset(new THREE.Vector3(d.pos.x, d.pos.y - 1, d.pos.z + 3));
  p.swimming = true;
  p.headUnder = true;
  d.update(1 / 60, p, world.ocean, false, 0);
  assert.ok(d.windup > 0);
  // ныряльщик ушёл рывком далеко в сторону
  p.pos.x += 30;
  const seen = [];
  for (let i = 0; i < 80; i++) seen.push(d.update(1 / 60, p, world.ocean, false, 0));
  assert.ok(!seen.includes('bite'));
  assert.ok(seen.includes('miss'));
});

test('удар во время замаха сбивает бросок', () => {
  const d = new Deepling(new THREE.Scene(), 1);
  d.setActive(true, 4);
  d.windup = 0.4;
  d.scare();
  assert.equal(d.windup, 0);
  assert.equal(d.lunge, 0);
});

test('гарпун отпугивает глубинника', () => {
  const d = new Deepling(new THREE.Scene(), 1);
  d.setActive(true, 4);
  d.scare();
  assert.ok(d.flee >= 7);
});

test('дома из перевёрнутых лодок стоят на спине и не перекрывают площадку у шлюза', async () => {
  const THREE = await import('three');
  const { City, SPAWN } = await import('../../src/city.js');
  for (const seed of [1, 2, 3, 4, 5]) {
    const city = new City(new THREE.Scene());
    city.generate(seed, 2, 0, 7, {});
    assert.ok(!city.overlaps(SPAWN.x, SPAWN.z, 1.2), `сид ${seed}: площадка занята`);
  }
});
