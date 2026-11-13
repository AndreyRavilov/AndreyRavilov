import * as THREE from 'three';
import { buildWhale, backHeight, backU, BLOWHOLE, WHALE } from './whale.js';
import { Ocean } from './ocean.js';
import { City, HATCH, ITEM, MATERIALS } from './city.js';
import { Player, CAPACITY } from './player.js';
import { Audio } from './audio.js';
import { INTRO, LORE, ENDINGS, NIGHT_LINES } from './lore.js';

// ============ Рендер и сцена ============
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2500);
scene.fog = new THREE.Fog(0xa9c8d0, 90, 700);

const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    top: { value: new THREE.Color(0x4a90b8) },
    horizon: { value: new THREE.Color(0xcfe3e8) },
    under: { value: new THREE.Color(0x0b2a35) },
  },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 under; varying vec3 vP;
    void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, under, min(1.0, -h * 5.0));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
    }`,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);

// звёзды
const starGeo = new THREE.BufferGeometry();
const starPos = [];
for (let i = 0; i < 1500; i++) {
  const v = new THREE.Vector3().randomDirection();
  if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05;
  v.normalize().multiplyScalar(1400);
  starPos.push(v.x, v.y, v.z);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

const hemi = new THREE.HemisphereLight(0xbfd8e6, 0x2a3a40, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const whale = buildWhale();
scene.add(whale);
const ocean = new Ocean(scene);
const city = new City(scene);
const player = new Player(scene);
const audio = new Audio();

// фонтан из дыхала
const BLOW_N = 400;
const blowGeo = new THREE.BufferGeometry();
const blowPos = new Float32Array(BLOW_N * 3);
const blowVel = new Float32Array(BLOW_N * 3);
blowGeo.setAttribute('position', new THREE.BufferAttribute(blowPos, 3));
const blowMat = new THREE.PointsMaterial({ color: 0xe8f6ff, size: 0.55, transparent: true, opacity: 0.85, depthWrite: false });
const blowPts = new THREE.Points(blowGeo, blowMat);
blowPts.frustumCulled = false;
blowPts.visible = false;
scene.add(blowPts);
function resetBlowParticle(i) {
  blowPos[i * 3] = BLOWHOLE.x + (Math.random() - 0.5) * 2;
  blowPos[i * 3 + 1] = BLOWHOLE.y + Math.random() * 2;
  blowPos[i * 3 + 2] = BLOWHOLE.z + (Math.random() - 0.5) * 3;
  blowVel[i * 3] = (Math.random() - 0.5) * 4;
  blowVel[i * 3 + 1] = 18 + Math.random() * 14;
  blowVel[i * 3 + 2] = (Math.random() - 0.5) * 4;
}
for (let i = 0; i < BLOW_N; i++) resetBlowParticle(i);

// ============ Палитры времени суток ============
const PAL = {
  day: { top: 0x4a90b8, hor: 0xd4e6ea, fog: 0xa9c8d0, sun: 0xfff0d8, sunI: 2.4, hemi: 0.95, water: 0x1d6275 },
  dusk: { top: 0x2b3566, hor: 0xf09060, fog: 0x9a6f6a, sun: 0xff9a60, sunI: 1.4, hemi: 0.6, water: 0x284b66 },
  night: { top: 0x04060e, hor: 0x18283a, fog: 0x0c1620, sun: 0x8090ff, sunI: 0.35, hemi: 0.22, water: 0x0d2533 },
};
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function mixHex(a, b, t, out) {
  tmpA.set(a);
  tmpB.set(b);
  return out.copy(tmpA).lerp(tmpB, t);
}
const fogDay = new THREE.Color();
function applyTime(p) {
  let a, b, t;
  if (p < 0.55) { a = PAL.day; b = PAL.dusk; t = p / 0.55; }
  else { a = PAL.dusk; b = PAL.night; t = Math.min(1, (p - 0.55) / 0.45); }
  mixHex(a.top, b.top, t, skyMat.uniforms.top.value);
  mixHex(a.hor, b.hor, t, skyMat.uniforms.horizon.value);
  mixHex(a.fog, b.fog, t, fogDay);
  mixHex(a.sun, b.sun, t, sun.color);
  mixHex(a.water, b.water, t, ocean.mat.color);
  sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
  hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, t);
  starMat.opacity = Math.max(0, (p - 0.6) / 0.4);
  MATERIALS.window.emissiveIntensity = 0.3 + p * 2.2;
  MATERIALS.lamp.emissiveIntensity = 1 + p * 3;
}

// ============ Состояние игры ============
const W0 = 2.5;
const W1 = WHALE.H + 4;
const S = {
  mode: 'menu',
  paused: false,
  cycle: 1,
  t: 0,
  T: 160,
  pop: 12,
  food: 3,
  fuel: 2,
  lore: 0,
  runSeed: Math.floor(Math.random() * 1e9),
  closing: 0,
  blowTimer: 12,
  blowing: 0,
  launched: false,
  moanTimer: 5,
  alarms: {},
  stats: null,
  time: 0,
};
const dayLength = (c) => Math.max(100, 170 - (c - 1) * 10);
const needFood = () => Math.ceil(S.pop / 4) + 1;
const needFuel = () => Math.min(4, 1 + Math.floor(S.cycle / 2));

// ============ Ввод ============
const keys = new Set();
const pressed = new Set();
let yaw = 0;
let pitch = 0.35;
let dragging = false;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const canvas = renderer.domElement;
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  audio.resume();
  if (S.mode === 'day' || S.mode === 'closing') canvas.requestPointerLock?.();
});
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || dragging) {
    yaw -= e.movementX * 0.0026;
    pitch = Math.max(-0.45, Math.min(1.25, pitch + e.movementY * 0.0026));
  }
});
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) hadLock = true;
  else if (hadLock && (S.mode === 'day' || S.mode === 'closing') && !S.paused) setPause(true);
});

// ============ UI ============
const $ = (id) => document.getElementById(id);
function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4500);
}
function showModal({ title, body, buttons, wide = false }) {
  const m = $('modal');
  m.classList.remove('hidden');
  m.querySelector('.card').classList.toggle('wide', wide);
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = '';
  if (typeof body === 'string') {
    for (const para of body.split('\n\n')) {
      const p = document.createElement('p');
      p.textContent = para;
      $('modal-body').appendChild(p);
    }
  } else $('modal-body').appendChild(body);
  const bb = $('modal-buttons');
  bb.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.sub) {
      const s = document.createElement('small');
      s.textContent = b.sub;
      el.appendChild(s);
      el.classList.add('choice');
    }
    el.onclick = () => {
      m.classList.add('hidden');
      b.onClick();
    };
    bb.appendChild(el);
  }
  document.exitPointerLock?.();
}
function setPause(on) {
  S.paused = on;
  $('pause').classList.toggle('hidden', !on);
}
$('pause').addEventListener('click', () => {
  setPause(false);
  canvas.requestPointerLock?.();
});

function updateHud() {
  $('cycle').textContent = S.cycle;
  const left = Math.max(0, S.T - S.t);
  const p = Math.min(1, S.t / S.T);
  $('timebar').style.width = (1 - p) * 100 + '%';
  $('timebar').className = p > 0.8 ? 'danger' : p > 0.55 ? 'warn' : '';
  $('timetxt').textContent = S.mode === 'closing' ? 'ШЛЮЗ ЗАКРЫТ' : `До погружения ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  $('pop').textContent = S.pop;
  $('food').textContent = S.food;
  $('fuel').textContent = S.fuel;
  $('lore').textContent = S.lore;
  $('need').textContent = `На ночь нужно: 🐟 ${needFood()} · 🛢️ ${needFuel()}`;
  const w = player.weight;
  $('cargo').innerHTML = `<span class="lbl">Груз ${w}/${CAPACITY}</span> ` + (player.carried.map((t) => `<span class="it ${t}">${ITEM[t].icon}</span>`).join('') || '<span class="empty">пусто</span>');
  $('oxy').classList.toggle('hidden', player.oxygen > 0.995 && !player.headUnder);
  $('oxybar').style.width = Math.max(0, player.oxygen) * 100 + '%';
  $('oxybar').className = player.oxygen < 0.3 ? 'danger' : '';
  // компас к шлюзу
  const dx = HATCH.x - player.pos.x;
  const dz = HATCH.z - player.pos.z;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  $('arrow').style.transform = `rotate(${ang}rad)`;
  $('dist').textContent = Math.round(Math.hypot(dx, dz)) + ' м';
  $('hud').classList.toggle('alarm', p > 0.85 && S.mode === 'day');
}

// ============ Ход игры ============
function startRun() {
  S.cycle = 1;
  S.pop = 12;
  S.food = 3;
  S.fuel = 2;
  S.lore = 0;
  S.runSeed = Math.floor(Math.random() * 1e9);
  startDay();
}

function startDay() {
  S.t = 0;
  S.T = dayLength(S.cycle);
  S.closing = 0;
  S.blowTimer = 10 + Math.random() * 6;
  S.blowing = 0;
  S.moanTimer = 4;
  S.alarms = {};
  S.stats = { food: 0, fuel: 0, relics: [], deposits: 0 };
  city.generate(S.runSeed + S.cycle * 1013, S.cycle, S.lore, LORE.length);
  const sp = new THREE.Vector3(HATCH.x, 0, HATCH.z + 6);
  sp.y = city.groundAt(sp.x, sp.z) + 0.1;
  player.reset(sp);
  yaw = Math.PI;
  pitch = 0.35;
  S.mode = 'day';
  S.paused = false;
  $('hud').classList.remove('hidden');
  toast(`День ${S.cycle}. Мать всплыла. У тебя ${Math.round(S.T / 60 * 10) / 10} мин.`);
  if (S.cycle === 2) toast('На спине завелись пиявки. Они срывают груз!', 'warn');
  if (S.lore < LORE.length) toast('Где-то на опасном краю светится реликвия.', 'relic');
  canvas.requestPointerLock?.();
}

function deposit() {
  if (!player.carried.length) {
    toast('Нечего сдавать. Иди за припасами!');
    return;
  }
  const relics = [];
  for (const t of player.carried) {
    if (t === 'food') { S.food++; S.stats.food++; }
    else if (t === 'fuel') { S.fuel++; S.stats.fuel++; }
    else if (t === 'relic') { relics.push(S.lore); S.lore++; S.stats.relics.push(S.lore - 1); }
  }
  player.carried = [];
  player.refreshPack();
  audio.deposit();
  toast('Груз сдан в Ковчег.', 'ok');
  for (const i of relics) {
    S.paused = true;
    showModal({ title: LORE[i].title, body: LORE[i].text, buttons: [{ label: 'Спрятать в журнал', onClick: () => { S.paused = false; canvas.requestPointerLock?.(); } }] });
  }
}

function endDay(outcome) {
  if (S.mode === 'night') return;
  if (outcome === 'safe' && player.carried.length) deposit();
  S.mode = 'night';
  S.paused = false;
  document.exitPointerLock?.();
  $('hud').classList.add('hidden');
  const lines = [];
  if (outcome === 'drowned') {
    const lost = player.carried.length;
    player.carried = [];
    player.refreshPack();
    S.pop = Math.max(0, S.pop - 1);
    lines.push(`Ты не успел к шлюзу. Утром тебя нашли без сознания на палубе.${lost ? ` Груз (${lost}) унесло течением.` : ''} Один из жителей погиб, пока искал тебя.`);
  } else {
    lines.push('Шлюз закрылся за твоей спиной. Мать уходит на глубину.');
  }
  const nf = needFood();
  const nu = needFuel();
  const eatF = Math.min(S.food, nf);
  const burn = Math.min(S.fuel, nu);
  const hunger = nf - eatF;
  const cold = nu - burn;
  S.food -= eatF;
  S.fuel -= burn;
  const deaths = Math.min(S.pop, hunger + cold * 2);
  S.pop -= deaths;
  lines.push(`Принесено за день: 🐟 ${S.stats.food} · 🛢️ ${S.stats.fuel}${S.stats.relics.length ? ' · ◈ реликвия' : ''}.`);
  lines.push(`Ночью съедено 🐟 ${eatF}/${nf}, сожжено 🛢️ ${burn}/${nu}.`);
  if (hunger) lines.push(`Не хватило еды: ${hunger} ${plural(hunger, 'житель умер', 'жителя умерли', 'жителей умерли')} от голода.`);
  if (cold) lines.push(`Не хватило ворвани: в Ковчеге погас свет, ${cold * 2} ${plural(cold * 2, 'человек замёрз', 'человека замёрзли', 'человек замёрзли')}.`);
  if (!hunger && !cold) lines.push('Все пережили эту ночь.');
  lines.push(NIGHT_LINES[(S.cycle - 1) % NIGHT_LINES.length]);
  lines.push(`Осталось жителей: ${S.pop}. Запасы: 🐟 ${S.food} · 🛢️ ${S.fuel}. Реликвий: ${S.lore}/${LORE.length}.`);

  setTimeout(() => {
    if (S.pop <= 0) {
      showModal({
        title: 'Седьмой город пал',
        body: lines.join('\n\n') + `\n\nКовчег всплыл пустым. Когда-нибудь новые люди найдут спящую Мать — и на детском рисунке станет на один зачёркнутый круг больше.\n\nДней прожито: ${S.cycle}.`,
        buttons: [{ label: 'Начать заново', onClick: startRun }],
      });
    } else if (S.lore >= LORE.length) {
      showModal({ title: `Ночь ${S.cycle}`, body: lines.join('\n\n'), buttons: [{ label: 'Дальше', onClick: showEndingChoice }] });
    } else {
      showModal({
        title: `Ночь ${S.cycle}`,
        body: lines.join('\n\n'),
        buttons: [{ label: 'Встретить утро', onClick: () => { S.cycle++; startDay(); } }],
      });
    }
  }, 900);
}

function showEndingChoice() {
  showModal({
    title: 'Выбор',
    body: 'Все семь реликвий собраны. Ты знаешь правду о Матери и о шести погибших городах. Совет Ноа ждёт твоего решения.',
    wide: true,
    buttons: ENDINGS.map((e) => ({
      label: e.title,
      sub: e.choice,
      onClick: () =>
        showModal({
          title: `Финал: ${e.title}`,
          body: e.text + `\n\nДней прожито: ${S.cycle}. Выжило жителей: ${S.pop}.`,
          buttons: [{ label: 'Сыграть снова', onClick: startRun }],
        }),
    })),
  });
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function showJournal() {
  const body = document.createElement('div');
  if (!S.lore) body.innerHTML = '<p>Пока пусто. Реликвии светятся голубым на самых опасных краях спины.</p>';
  for (let i = 0; i < S.lore; i++) {
    const h = document.createElement('h3');
    h.textContent = LORE[i].title;
    body.appendChild(h);
    for (const para of LORE[i].text.split('\n\n')) {
      const p = document.createElement('p');
      p.textContent = para;
      body.appendChild(p);
    }
  }
  S.paused = true;
  showModal({ title: 'Журнал Ныряльщика', body, buttons: [{ label: 'Закрыть', onClick: () => { S.paused = false; canvas.requestPointerLock?.(); } }] });
}

// ============ Обновление мира ============
const world = {
  get colliders() { return city.colliders; },
  ocean,
  current: 0,
  groundAt: (x, z, y) => city.groundAt(x, z, y),
};

function nearestPickup() {
  let best = null;
  let bd = 2.8;
  for (const p of city.pickups) {
    if (!p.active) continue;
    const d = Math.hypot(p.x - player.pos.x, p.y - 0.9 - player.pos.y, p.z - player.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function inHatch() {
  return Math.hypot(player.pos.x - HATCH.x, player.pos.z - HATCH.z) < 2.8 && Math.abs(player.pos.y - HATCH.y) < 3;
}

function updateGame(dt) {
  const p = Math.min(1, S.t / S.T);
  if (S.mode === 'day') {
    S.t += dt;
    world.current = 0;
  } else {
    S.closing += dt;
    world.current = 6;
    player.oxygen -= dt / 14;
  }
  const level = S.mode === 'day' ? W0 + (W1 - W0) * Math.pow(p, 2.1) : W1 + S.closing * 1.2;
  ocean.update(S.time, level, player.pos.x, player.pos.z);

  player.update(dt, keys, yaw, world);

  // подбор и сдача
  const near = nearestPickup();
  const hatch = inHatch() && S.mode === 'day';
  let prompt = '';
  if (near) {
    const it = ITEM[near.type];
    prompt = player.weight + it.weight > CAPACITY ? `${it.name}: слишком тяжело (груз ${player.weight}/${CAPACITY})` : `<b>E</b> — подобрать: ${it.name}`;
  } else if (hatch) {
    prompt = `<b>E</b> — сдать груз · <b>R</b> — укрыться в Ковчеге и закончить день`;
  }
  $('prompt').innerHTML = prompt;
  $('prompt').classList.toggle('hidden', !prompt);
  if (pressed.has('KeyE')) {
    if (near) {
      const it = ITEM[near.type];
      if (player.weight + it.weight <= CAPACITY) {
        near.active = false;
        near.mesh.visible = false;
        player.carried.push(near.type);
        player.refreshPack();
        audio.pickup(near.type);
        if (near.type === 'relic') toast('Реликвия! Донеси её до Ковчега, чтобы прочитать.', 'relic');
      } else toast('Слишком тяжело. Сначала сдай груз в Ковчег.', 'warn');
    } else if (hatch) deposit();
  }
  if (pressed.has('KeyR') && hatch) endDay('safe');

  // анимация припасов
  for (const pk of city.pickups) {
    if (!pk.active) continue;
    pk.mesh.rotation.y += dt * 1.2;
    pk.mesh.position.y = pk.y + Math.sin(S.time * 2 + pk.phase) * 0.2;
  }

  updateLeeches(dt);
  updateBlowhole(dt, p);

  // тревоги
  const A = S.alarms;
  if (S.mode === 'day') {
    if (p > 0.45 && !A.a) { A.a = 1; audio.moan(1.2); toast('Мать тяжело вздыхает. Вода поднимается.', 'warn'); }
    if (p > 0.75 && !A.b) { A.b = 1; audio.horn(); toast('Гудок Ковчега! Скоро погружение — возвращайся к шлюзу!', 'danger'); }
    if (p > 0.92 && !A.c) { A.c = 1; audio.horn(); setTimeout(() => audio.horn(), 600); toast('ПОСЛЕДНИЙ ГУДОК!', 'danger'); }
  }
  S.moanTimer -= dt;
  if (S.moanTimer <= 0) { audio.moan(0.5 + p); S.moanTimer = 12 + Math.random() * 10; }

  // конец дня
  if (S.mode === 'day' && S.t >= S.T) {
    if (inHatch()) endDay('safe');
    else {
      S.mode = 'closing';
      audio.horn();
      toast('Шлюз закрыт! Течение тянет на глубину…', 'danger');
    }
  }
  if (S.mode !== 'night' && player.oxygen <= 0) endDay('drowned');
  if (S.mode === 'closing' && S.closing > 30) endDay('drowned');

  // свет
  applyTime(S.mode === 'day' ? p : 1);
  player.lamp.intensity = p > 0.55 || player.headUnder ? 45 : 0;
  city.hatchRing.material.opacity = 0.35 + Math.sin(S.time * 4) * 0.2 + (p > 0.75 ? 0.3 : 0);
  city.beaconLight.intensity = 40 + p * 160 + (p > 0.75 ? Math.sin(S.time * 8) * 60 : 0);
}

function updateLeeches(dt) {
  for (const L of city.leeches) {
    L.cool -= dt;
    L.phase += dt * 6;
    const ly = backHeight(L.x, L.z);
    const dx = player.pos.x - L.x;
    const dz = player.pos.z - L.z;
    const d = Math.hypot(dx, dz);
    let speed = 1.2;
    if (d < 26 && Math.abs(player.pos.y - ly) < 6 && L.cool <= 0) {
      L.dir = Math.atan2(dx, dz);
      speed = 2.6 + S.cycle * 0.3;
    } else {
      L.dir += (Math.random() - 0.5) * dt * 2;
    }
    const nx = L.x + Math.sin(L.dir) * speed * dt;
    const nz = L.z + Math.cos(L.dir) * speed * dt;
    const bh = backHeight(nx, nz);
    if (backU(nx, nz) > 0.97 || city.groundAt(nx, nz, bh + 0.2) > bh + 0.5 || city.overlaps(nx, nz, 0.3)) {
      L.dir += Math.PI * (0.5 + Math.random());
    } else {
      L.x = nx;
      L.z = nz;
    }
    L.mesh.position.set(L.x, backHeight(L.x, L.z) + 0.25, L.z);
    L.mesh.rotation.y = L.dir + Math.PI;
    L.segs.forEach((s, i) => (s.position.x = Math.sin(L.phase + i * 1.2) * 0.18));

    if (d < 1.4 && Math.abs(player.pos.y - ly) < 1.8 && L.cool <= 0) {
      L.cool = 2.5;
      player.vel.x += (dx / (d || 1)) * 12;
      player.vel.z += (dz / (d || 1)) * 12;
      player.vel.y = 7;
      player.onGround = false;
      audio.hit();
      if (player.carried.length) {
        const t = player.carried.pop();
        player.refreshPack();
        const a = Math.random() * Math.PI * 2;
        const px = player.pos.x + Math.cos(a) * 3;
        const pz = player.pos.z + Math.sin(a) * 3;
        city.addPickup(t, px, pz, -1, city.groundAt(px, pz, player.pos.y + 2));
        toast(`Пиявка сорвала с тебя: ${ITEM[t].name}!`, 'warn');
      } else toast('Пиявка! Держись от них подальше.', 'warn');
    }
  }
}

function updateBlowhole(dt, p) {
  S.blowTimer -= dt;
  if (S.blowTimer <= 0 && S.blowing <= 0) {
    S.blowing = 3.2;
    S.launched = false;
    S.blowTimer = 16 + Math.random() * 10;
    for (let i = 0; i < BLOW_N; i++) resetBlowParticle(i);
    blowPts.visible = true;
    const dd = player.pos.distanceTo(BLOWHOLE);
    if (dd < 90) audio.blow();
  }
  if (S.blowing > 0) {
    S.blowing -= dt;
    for (let i = 0; i < BLOW_N; i++) {
      blowVel[i * 3 + 1] -= 22 * dt;
      blowPos[i * 3] += blowVel[i * 3] * dt;
      blowPos[i * 3 + 1] += blowVel[i * 3 + 1] * dt;
      blowPos[i * 3 + 2] += blowVel[i * 3 + 2] * dt;
      if (blowPos[i * 3 + 1] < BLOWHOLE.y && S.blowing > 0.8) resetBlowParticle(i);
    }
    blowGeo.attributes.position.needsUpdate = true;
    blowMat.opacity = Math.min(0.85, S.blowing);
    const hd = Math.hypot(player.pos.x - BLOWHOLE.x, player.pos.z - BLOWHOLE.z);
    if (!S.launched && S.blowing > 1 && hd < 3.6 && player.pos.y < BLOWHOLE.y + 3) {
      S.launched = true;
      player.vel.y = 30;
      player.vel.x += (Math.random() - 0.5) * 10;
      player.vel.z += 6 + Math.random() * 6;
      player.onGround = false;
      toast('Мать выдохнула — тебя подбросило в небо!', 'relic');
    }
    if (S.blowing <= 0) blowPts.visible = false;
  }
}

// ============ Камера ============
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (keys.has('ArrowLeft')) yaw += dt * 2;
  if (keys.has('ArrowRight')) yaw -= dt * 2;
  const dist = player.swimming ? 6 : 7.5;
  camTarget.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
  const cx = camTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = camTarget.z + Math.cos(yaw) * Math.cos(pitch) * dist;
  let cy = camTarget.y + Math.sin(pitch) * dist;
  let px = cx, pz = cz;
  // камера не залезает внутрь Ковчега
  const ark = city.staticColliders[0];
  const ad = Math.hypot(px - ark.x, pz - ark.z);
  if (ad < ark.r + 1 && cy < ark.topAt(px, pz) + 1) {
    const k = (ark.r + 1) / (ad || 1);
    px = ark.x + (px - ark.x) * k;
    pz = ark.z + (pz - ark.z) * k;
  }
  const bh = backHeight(px, pz);
  if (cy < bh + 0.6) cy = bh + 0.6;
  camera.position.set(px, cy, pz);
  camera.lookAt(camTarget);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  sun.position.set(player.pos.x + 60, player.pos.y + 90, player.pos.z + 40);
  sun.target.position.copy(player.pos);

  // под водой
  const under = camera.position.y < ocean.surfaceAt(camera.position.x, camera.position.z);
  if (under) {
    scene.fog.color.set(0x0b3340).lerp(new THREE.Color(0x02080c), Math.min(1, S.t / S.T));
    scene.fog.near = 1;
    scene.fog.far = 55;
  } else {
    scene.fog.color.copy(fogDay);
    scene.fog.near = 90;
    scene.fog.far = 700;
  }
  document.body.classList.toggle('underwater', under);
  audio.setUnderwater(under);
}

// ============ Меню ============
$('intro').textContent = INTRO;
$('start').addEventListener('click', () => {
  audio.init();
  audio.resume();
  $('menu').classList.add('hidden');
  startRun();
});

// для фона меню и для автотестов
window.__deepback = { S, player, city, ocean, startRun, endDay, keys, setYaw: (v) => (yaw = v) };

// ============ Цикл ============
const clock = new THREE.Clock();
city.generate(S.runSeed, 1, 0, LORE.length);
player.reset(new THREE.Vector3(HATCH.x, city.groundAt(HATCH.x, HATCH.z + 3) + 0.1, HATCH.z + 3));
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  S.time += dt;
  if (S.mode === 'menu') {
    yaw += dt * 0.05;
    pitch = 0.32;
    ocean.update(S.time, 4, player.pos.x, player.pos.z);
    applyTime(0.3);
    updateCamera(dt);
    camera.position.lerp(new THREE.Vector3(Math.sin(yaw) * 140, 55, Math.cos(yaw) * 140), 1);
    camera.lookAt(0, 6, 0);
  } else if ((S.mode === 'day' || S.mode === 'closing') && !S.paused) {
    if (pressed.has('KeyJ')) showJournal();
    else updateGame(dt);
    updateCamera(dt);
    updateHud();
  } else if (S.mode === 'night') {
    ocean.update(S.time, W1 + 6, player.pos.x, player.pos.z);
  }
  if (whale.userData.fluke) whale.userData.fluke.rotation.x = Math.sin(S.time * 0.4) * 0.08;
  if (S.debugCam) {
    camera.position.fromArray(S.debugCam[0]);
    camera.lookAt(...S.debugCam[1]);
  }
  pressed.clear();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
