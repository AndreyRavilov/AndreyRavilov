import * as THREE from 'three';
import { buildWhale, dressWhale, backHeight, backU, BLOWHOLE, WHALE } from './whale.js';
import { Ocean } from './ocean.js';
import { City, HATCH, ITEM, MATERIALS, dressMaterials } from './city.js';
import { Player, CAPACITY } from './player.js';
import { Audio } from './audio.js';
import { INTRO, LORE, ENDINGS, NIGHT_LINES } from './lore.js';
import * as CUT from './cutscene.js';
import { Voice } from './voice.js';
import * as NAV from './nav.js';
import { Minimap, MAP_COLORS, LEGEND } from './minimap.js';
import { Deepling } from './creatures.js';
import { UPGRADES, upgradeCost } from './upgrades.js';
import { RESIDENTS, ICON, makeQuest, WEATHER, rollWeather } from './residents.js';
import { mulberry32 } from './city.js';
import * as ECO from './economy.js';
import * as TEX from './textures.js';
import { createSkyMaterial, sunDirection, Post, addCaustics, CAUSTICS } from './graphics.js';
import { Ambient } from './ambient.js';

// ============ Рендер и сцена ============
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2500);
scene.fog = new THREE.Fog(0xa9c8d0, 90, 700);

const skyMat = createSkyMaterial(TEX.cloudNoise());
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);

// Освещение от неба: небо рендерится в карту окружения, и все материалы
// получают мягкий цветной свет и отражения. Пересчитывается по мере смены времени суток.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
let envRT = null;
let envKey = '';
function updateEnvironment(p) {
  if (S.noEnv) return;
  S.envUpdates = (S.envUpdates || 0) + 1;
  const key = `${Math.round(p * 20)}|${S.weather}|${S.underK > 0.5 ? 'u' : 'a'}`;
  if (key === envKey) return;
  envKey = key;
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
}
scene.environmentIntensity = 0.75;
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

const hemi = new THREE.HemisphereLight(0xbfd8e6, 0x2a3a40, 0.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const whale = buildWhale();
scene.add(whale);
const ocean = new Ocean(scene, { detail: TEX.waveDetail() });
dressWhale(whale, TEX);
dressMaterials(TEX);
// каустика на коже Матери и на постройках
addCaustics(whale.userData.skin);
for (const k of ['steel', 'rust', 'arkWall', 'arkDome', 'bone', 'trim']) addCaustics(MATERIALS[k]);
for (const mtl of MATERIALS.walls || []) addCaustics(mtl);
for (const mtl of MATERIALS.roofs || []) addCaustics(mtl);
const city = new City(scene);
const player = new Player(scene);
const audio = new Audio();
const voice = new Voice();
const deeplings = [new Deepling(scene, 0.5), new Deepling(scene, 3.6)];
const post = new Post(renderer, scene, camera);
const ambient = new Ambient(scene);
const sunDir = new THREE.Vector3();
const URL_QUALITY = new URLSearchParams(location.search).get('quality');

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

// пунктир навигатора на земле
const NAV_DOTS = 160;
const navMat = new THREE.MeshBasicMaterial({ color: 0x58f0d8, transparent: true, opacity: 0.9, depthWrite: false });
const navDots = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2, 0), navMat, NAV_DOTS);
navDots.frustumCulled = false;
navDots.count = 0;
navDots.renderOrder = 3;
scene.add(navDots);

// дождь для шторма
const RAIN_N = 2500;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 6); // каждая капля — короткая черта
function resetDrop(i, top) {
  const x = (Math.random() - 0.5) * 80;
  const y = top ? 30 + Math.random() * 10 : Math.random() * 40;
  const z = (Math.random() - 0.5) * 80;
  rainPos.set([x, y, z, x, y - 0.7, z], i * 6);
}
for (let i = 0; i < RAIN_N; i++) resetDrop(i, false);
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaac4d0, transparent: true, opacity: 0.45, depthWrite: false }));
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);

// ============ Палитры времени суток ============
const PAL = {
  day: { top: 0x3f86b8, hor: 0xd8e8ea, fog: 0xa9c8d0, sun: 0xfff0d8, sunI: 2.6, hemi: 0.85, water: 0x0f4a5c, shallow: 0x2f9a90 },
  dusk: { top: 0x2b3566, hor: 0xf3a06a, fog: 0x9a6f6a, sun: 0xff9050, sunI: 1.6, hemi: 0.55, water: 0x1c3e58, shallow: 0x3f7f86 },
  night: { top: 0x03050c, hor: 0x16263a, fog: 0x0c1620, sun: 0x8090ff, sunI: 0.3, hemi: 0.2, water: 0x07202c, shallow: 0x123c46 },
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
  mixHex(a.water, b.water, t, ocean.mat.uniforms.uDeep.value);
  mixHex(a.shallow, b.shallow, t, ocean.mat.uniforms.uShallow.value);
  sunDirection(p, sunDir);
  skyMat.uniforms.uSunDir.value.copy(sunDir);
  skyMat.uniforms.uSunColor.value.copy(sun.color);
  skyMat.uniforms.uTime.value = S.time;
  ocean.mat.uniforms.uSunDir.value.copy(sunDir);
  CAUSTICS.uLevel.value = ocean.level;
  CAUSTICS.uCTime.value = S.time;
  CAUSTICS.uCStrength.value = Math.max(0, 1 - p * 1.25) * 0.7;
  ocean.mat.uniforms.uSunColor.value.copy(sun.color).multiplyScalar(Math.max(0, Math.min(1, sunDir.y * 6 + 0.2)));
  ocean.mat.uniforms.uSky.value.copy(skyMat.uniforms.horizon.value).lerp(skyMat.uniforms.top.value, 0.35);
  const W = S.weather;
  skyMat.uniforms.uCover.value = W === 'storm' ? 0.9 : W === 'fog' ? 0.75 : W === 'calm' ? 0.22 : 0.42;
  skyMat.uniforms.uCloudDark.value = W === 'storm' ? 0.75 : W === 'fog' ? 0.2 : 0;
  sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
  hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, t);
  starMat.opacity = Math.max(0, (p - 0.6) / 0.4);
  hemi.intensity *= 0.55;
  MATERIALS.window.emissiveIntensity = 0.3 + p * 2.2;
  MATERIALS.lamp.emissiveIntensity = 1 + p * 3;
}

// ============ Состояние игры ============
const W0 = ECO.WATER_START;
const W1 = ECO.WATER_END;
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
  scrap: 0,
  up: {},
  alive: [],
  quest: null,
  weather: 'clear',
  navMode: 0,
  navTimer: 0,
  navPath: null,
  navInfo: { label: 'Авто', dist: 0 },
  wind: null,
  flash: 0,
  thunderTimer: 8,
  harpoonCd: 0,
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
const needFood = () => ECO.needFood(S.pop, S.up.still || 0);
const needFuel = () => ECO.needFuel(S.cycle);
const plural = ECO.plural;

// ============ Ввод ============
const keys = new Set();
const pressed = new Set();
let yaw = 0;
let pitch = 0.35;
let dragging = false;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const canvas = renderer.domElement;
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  audio.resume();
  if (S.mode === 'day' || S.mode === 'closing') lockPointer();
});
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || dragging) {
    const k = 0.0026 * settings.sens;
    yaw -= e.movementX * k;
    pitch = Math.max(-0.45, Math.min(1.25, pitch + e.movementY * k * (settings.invert ? -1 : 1)));
  }
});
// Захват курсора возможен только сразу после клика или нажатия клавиши.
// Без этого браузер отказывает (например, когда ролик доиграл до конца сам).
function lockPointer() {
  if (!canvas.requestPointerLock) return;
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    if (S.mode === 'day') toast('Кликни по экрану, чтобы управлять камерой мышью.');
    return;
  }
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* без захвата камера крутится перетаскиванием */ }
}
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
  keys.clear(); // иначе клавиша, отпущенная за окном, «залипает» и персонаж идёт сам
  const m = $('modal');
  m.classList.remove('hidden');
  m.querySelector('.card').classList.toggle('wide', wide);
  delete m.querySelector('.card').dataset.step;
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
      if (S.mode !== 'intro') voice.stop(); // закрыл запись — рассказчик замолкает
      b.onClick();
    };
    bb.appendChild(el);
  }
  document.exitPointerLock?.();
}
function setPause(on) {
  S.paused = on;
  $('pause').classList.toggle('hidden', !on);
  if (on) document.exitPointerLock?.();
}
$('resume').addEventListener('click', () => {
  setPause(false);
  lockPointer();
});
$('journal-btn').addEventListener('click', () => {
  $('pause').classList.add('hidden');
  showJournal();
});
$('to-menu').addEventListener('click', () => {
  setPause(false);
  S.mode = 'menu';
  $('hud').classList.add('hidden');
  location.reload(); // сохранение уже записано утром — меню предложит продолжить
});
addEventListener('keydown', (e) => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && (S.mode === 'day' || S.mode === 'closing') && $('modal').classList.contains('hidden')) {
    setPause(e.code === 'Escape' ? true : !S.paused);
  }
});

// ============ Настройки ============
const SETTINGS_KEY = 'deepback-settings-v1';
const settings = { volume: 0.7, voice: 1, music: 0.5, sens: 1, invert: false, quality: 'high' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* без сохранения */ }
function applySettings() {
  audio.setVolume(settings.volume);
  voice.setVolume(settings.voice);
  audio.setMusicVolume(settings.music);
  $('set-music').value = Math.round(settings.music * 100);
  $('music-out').textContent = Math.round(settings.music * 100);
  $('set-voice').value = Math.round(settings.voice * 100);
  $('voice-out').textContent = Math.round(settings.voice * 100);
  $('set-volume').value = Math.round(settings.volume * 100);
  $('vol-out').textContent = Math.round(settings.volume * 100);
  $('set-sens').value = settings.sens;
  $('sens-out').textContent = Number(settings.sens).toFixed(1);
  $('set-invert').checked = settings.invert;
  const q = URL_QUALITY || settings.quality;
  $('set-quality').value = settings.quality;
  if (post.level !== q) post.setQuality(q, sun);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}
$('set-volume').addEventListener('input', (e) => { settings.volume = e.target.value / 100; applySettings(); });
$('set-music').addEventListener('input', (e) => { settings.music = e.target.value / 100; applySettings(); });
$('set-voice').addEventListener('input', (e) => { settings.voice = e.target.value / 100; applySettings(); });
$('set-sens').addEventListener('input', (e) => { settings.sens = Number(e.target.value); applySettings(); });
$('set-quality').addEventListener('change', (e) => { settings.quality = e.target.value; applySettings(); });
$('set-invert').addEventListener('change', (e) => { settings.invert = e.target.checked; applySettings(); });
applySettings();

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
  $('scrap').textContent = S.scrap;
  $('need').textContent = `На ночь нужно: 🐟 ${needFood()} · 🛢️ ${needFuel()}`;
  const w = player.weight;
  $('cargo').innerHTML = `<span class="lbl">Груз ${w}/${player.capacity}</span> ` + (player.carried.map((t) => `<span class="it ${t}">${ITEM[t].icon}</span>`).join('') || '<span class="empty">пусто</span>');
  $('oxy').classList.toggle('hidden', player.oxygen > 0.995 && !player.headUnder);
  $('oxybar').style.width = Math.max(0, player.oxygen) * 100 + '%';
  $('oxybar').className = player.oxygen < 0.3 ? 'danger' : '';
  $('nav-target').textContent = S.navInfo.label;
  $('nav-dist').textContent = S.navInfo.dist ? `· ${Math.round(S.navInfo.dist)} м` : '';
  $('hud').classList.toggle('alarm', p > 0.85 && S.mode === 'day');
  const W = WEATHER[S.weather];
  const gusting = S.weather === 'storm' && S.gust && S.gust.k > 0.3;
  $('weather').textContent = `${W.icon} ${W.name}${gusting ? ' · порыв ветра!' : ''}`;
  const q = S.quest;
  if (q) {
    const r = resident(q.who);
    const prog = q.kind === 'fetch' ? `${ICON[q.item]} ${Math.min(q.have, q.need)}/${q.need}` : (q.have ? 'вещь найдена' : '🎁 найти вещь');
    $('quest').textContent = q.done ? `✓ ${r.name}: просьба выполнена` : `${r.name}: ${prog}`;
    $('quest').classList.toggle('done', q.done);
  }
  $('quest').classList.toggle('hidden', !q);
}

// ============ Ход игры ============
function startRun(withIntro = false) {
  S.cycle = 1;
  S.pop = ECO.START.pop;
  S.food = ECO.START.food;
  S.fuel = ECO.START.fuel;
  S.lore = 0;
  S.scrap = 0;
  S.up = {};
  S.alive = RESIDENTS.map((r) => r.id);
  S.runSeed = Math.floor(Math.random() * 1e9);
  if (withIntro) startIntro(startDay);
  else startDay();
}

// ============ Сохранение ============
const SAVE_KEY = 'deepback-save-v1';
const SAVE_FIELDS = ['cycle', 'pop', 'food', 'fuel', 'lore', 'scrap', 'up', 'alive', 'runSeed'];
function saveGame() {
  try {
    const data = {};
    for (const k of SAVE_FIELDS) data[k] = S[k];
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* хранилище недоступно — играем без сохранений */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

function applyUpgrades() {
  const u = S.up;
  player.capacity = CAPACITY + 3 * (u.pack || 0);
  player.oxyTime = 22 + 12 * (u.tank || 0);
  player.swimMul = 1 + 0.3 * (u.fins || 0);
  player.walkMul = 1 + 0.1 * (u.boots || 0);
  player.loadMul = 0.07 - 0.02 * (u.boots || 0);
}

function startDay() {
  S.t = 0;
  S.closing = 0;
  S.blowTimer = 10 + Math.random() * 6;
  S.blowing = 0;
  S.moanTimer = 4;
  S.alarms = {};
  S.stats = { food: 0, fuel: 0, scrap: 0, relics: [], deposits: 0 };
  S.harpoonCd = 0;
  applyUpgrades();
  saveGame();
  const drng = mulberry32(S.runSeed + S.cycle * 7919);
  S.weather = rollWeather(drng, S.cycle);
  S.quest = makeQuest(drng, S.alive, S.cycle);
  S.T = ECO.dayLength(S.cycle, S.weather);
  ocean.amp = S.weather === 'storm' ? 2.4 : S.weather === 'calm' ? 0.45 : 1;
  const wa = drng() * Math.PI * 2;
  S.wind = S.weather === 'storm' ? { x: Math.cos(wa) * 3.2, z: Math.sin(wa) * 3.2 } : null;
  S.gust = { t: 6, k: 0, on: false, warned: false };
  world.wind = null;
  rain.visible = S.weather === 'storm';
  S.thunderTimer = 5;
  city.generate(S.runSeed + S.cycle * 1013, S.cycle, S.lore, LORE.length, { keepsake: S.quest?.kind === 'keepsake' });
  navGrid = NAV.buildGrid((x, z) => backU(x, z) >= 0.97 || city.overlaps(x, z, 0.8));
  S.navTimer = 0;
  S.navPath = null;
  const sp = new THREE.Vector3(HATCH.x, 0, HATCH.z + 6);
  sp.y = city.groundAt(sp.x, sp.z) + 0.1;
  player.reset(sp);
  const nDeep = S.cycle >= 4 ? 2 : S.cycle >= 2 ? 1 : 0;
  deeplings.forEach((d, i) => d.setActive(i < nDeep, W0));
  yaw = Math.PI;
  pitch = 0.35;
  S.mode = 'day';
  S.paused = false;
  $('hud').classList.remove('hidden');
  toast(`День ${S.cycle}. Мать всплыла. У тебя ${Math.round(S.T / 60 * 10) / 10} мин.`);
  if (S.cycle === 2) toast('На спине завелись пиявки, а под водой кто-то светится. F — гарпун!', 'warn');
  if (S.cycle === 4) toast('Глубинников стало двое.', 'danger');
  if (S.lore < LORE.length) toast('Где-то на опасном краю светится реликвия.', 'relic');
  const W = WEATHER[S.weather];
  if (S.cycle > 1) toast(`${W.icon} ${W.name}. ${W.note}`, S.weather === 'storm' ? 'danger' : '');
  if (S.quest) toast(S.quest.text, 'quest');
  lockPointer();
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
    else if (t === 'scrap') { S.scrap++; S.stats.scrap++; }
    else if (t === 'keepsake' && S.quest?.kind === 'keepsake') S.quest.have = 1;
    if (S.quest?.kind === 'fetch' && S.quest.item === t) S.quest.have++;
    else if (t === 'relic') { relics.push(S.lore); S.lore++; S.stats.relics.push(S.lore - 1); }
  }
  player.carried = [];
  player.refreshPack();
  audio.deposit();
  toast('Груз сдан в Ковчег.', 'ok');
  checkQuest();
  for (const i of relics) {
    S.paused = true;
    showModal({ title: LORE[i].title, body: LORE[i].text, buttons: [{ label: 'Спрятать в журнал', onClick: () => { S.paused = false; lockPointer(); } }] });
    voice.play(`relic${i + 1}`);
  }
}

function resident(id) {
  return RESIDENTS.find((r) => r.id === id);
}

function checkQuest() {
  const q = S.quest;
  if (!q || q.done) return;
  const ok = q.kind === 'fetch' ? q.have >= q.need : q.have >= 1;
  if (!ok) return;
  q.done = true;
  S.scrap += q.reward;
  const r = resident(q.who);
  if (!S.alive.includes(q.who)) return;
  if (q.kind === 'keepsake') {
    S.paused = true;
    showModal({
      title: `${r.name} · ${r.role}`,
      body: `Ты вернул ${r.keepsake}.\n\n${r.story}\n\nВ благодарность: ⚙️ ${q.reward}.`,
      buttons: [{ label: 'Вернуться к работе', onClick: () => { S.paused = false; lockPointer(); } }],
    });
  } else {
    toast(`${r.name} благодарит тебя: +⚙️ ${q.reward}`, 'quest');
  }
}

// Часть погибших — жители с именами
function killResidents(n) {
  const names = [];
  for (let i = 0; i < n; i++) {
    const popBefore = S.pop - i;
    if (S.alive.length && Math.random() < S.alive.length / Math.max(1, popBefore)) {
      const idx = Math.floor(Math.random() * S.alive.length);
      names.push(resident(S.alive[idx]).name);
      S.alive.splice(idx, 1);
    }
  }
  return names;
}

function endDay(outcome) {
  if (S.mode === 'night') return;
  if (outcome === 'safe' && player.carried.length) deposit();
  S.mode = 'night';
  S.paused = false;
  navDots.count = 0;
  document.exitPointerLock?.();
  $('hud').classList.add('hidden');
  const lines = [];
  if (outcome === 'drowned') {
    const lost = player.carried.length;
    player.carried = [];
    player.refreshPack();
    const lostNames = killResidents(1);
    S.pop = Math.max(0, S.pop - 1);
    if (lostNames.length) lines.push(`${lostNames[0]} ушёл искать тебя в воду и не вернулся.`);
    lines.push(`Ты не успел к шлюзу. Утром тебя нашли без сознания на палубе.${lost ? ` Груз (${lost}) унесло течением.` : ''} Один из жителей погиб, пока искал тебя.`);
  } else {
    lines.push('Шлюз закрылся за твоей спиной. Мать уходит на глубину.');
  }
  const night = ECO.resolveNight({ pop: S.pop, food: S.food, fuel: S.fuel, cycle: S.cycle, still: S.up.still || 0 });
  const { nf, nu, eatF, burn, hunger, cold, deaths } = night;
  const named = killResidents(deaths);
  S.pop = night.pop;
  S.food = night.food;
  S.fuel = night.fuel;
  lines.push(`Принесено за день: 🐟 ${S.stats.food} · 🛢️ ${S.stats.fuel} · ⚙️ ${S.stats.scrap}${S.stats.relics.length ? ' · ◈ реликвия' : ''}.`);
  lines.push(`Ночью съедено 🐟 ${eatF}/${nf}, сожжено 🛢️ ${burn}/${nu}.`);
  if (hunger) lines.push(`Не хватило еды: ${hunger} ${plural(hunger, 'житель умер', 'жителя умерли', 'жителей умерли')} от голода.`);
  if (cold) lines.push(`Не хватило ворвани: в Ковчеге погас свет, ${cold * 2} ${plural(cold * 2, 'человек замёрз', 'человека замёрзли', 'человек замёрзли')}.`);
  if (named.length) lines.push(`Среди погибших: ${named.join(', ')}.`);
  if (!hunger && !cold) lines.push('Все пережили эту ночь.');
  if (S.quest && !S.quest.done && S.alive.includes(S.quest.who)) lines.push(`${resident(S.quest.who).name} так и не дождался помощи.`);
  lines.push(NIGHT_LINES[(S.cycle - 1) % NIGHT_LINES.length]);
  lines.push(`Осталось жителей: ${S.pop}. Запасы: 🐟 ${S.food} · 🛢️ ${S.fuel}. Реликвий: ${S.lore}/${LORE.length}.`);

  setTimeout(() => {
    if (S.pop <= 0) {
      showModal({
        title: 'Седьмой город пал',
        body: lines.join('\n\n') + `\n\nКовчег всплыл пустым. Когда-нибудь новые люди найдут спящую Мать — и на детском рисунке станет на один зачёркнутый круг больше.\n\nДней прожито: ${S.cycle}.`,
        buttons: [{ label: 'Начать заново', onClick: startRun }],
      });
      clearSave();
    } else if (S.lore >= LORE.length) {
      showModal({ title: `Ночь ${S.cycle}`, body: lines.join('\n\n'), buttons: [{ label: 'Дальше', onClick: showEndingChoice }] });
    } else {
      showModal({
        title: `Ночь ${S.cycle}`,
        body: nightBody(lines),
        wide: true,
        buttons: [{ label: 'Встретить утро', onClick: () => { S.cycle++; startDay(); } }],
      });
      S.cycle++;
      saveGame(); // если закрыть вкладку ночью, утро начнётся с этого места
      S.cycle--;
    }
  }, 900);
}

function nightBody(lines) {
  const wrap = document.createElement('div');
  for (const l of lines) {
    const p = document.createElement('p');
    p.textContent = l;
    wrap.appendChild(p);
  }
  const h = document.createElement('h3');
  h.textContent = 'Мастерская Ковчега';
  wrap.appendChild(h);
  const bal = document.createElement('p');
  wrap.appendChild(bal);
  const grid = document.createElement('div');
  grid.className = 'shop';
  wrap.appendChild(grid);
  const render = () => {
    bal.textContent = `Обломков: ⚙️ ${S.scrap}. Улучшения остаются до конца забега.`;
    grid.innerHTML = '';
    for (const up of UPGRADES) {
      const lvl = S.up[up.key] || 0;
      const cost = upgradeCost(up, lvl);
      const card = document.createElement('div');
      card.className = 'up';
      const pips = '●'.repeat(lvl) + '○'.repeat(up.max - lvl);
      card.innerHTML = `<div class="up-h"><b></b><span class="pips">${pips}</span></div><small></small>`;
      card.querySelector('b').textContent = up.name;
      card.querySelector('small').textContent = up.desc;
      const btn = document.createElement('button');
      if (cost === null) {
        btn.textContent = 'Максимум';
        btn.disabled = true;
      } else {
        btn.textContent = `Купить · ⚙️ ${cost}`;
        btn.disabled = S.scrap < cost;
        btn.onclick = () => {
          if (S.scrap < cost) return;
          S.scrap -= cost;
          S.up[up.key] = lvl + 1;
          audio.deposit();
          S.cycle++;
          saveGame();
          S.cycle--;
          render();
        };
      }
      card.appendChild(btn);
      grid.appendChild(card);
    }
  };
  render();
  return wrap;
}

function showEndingChoice() {
  showModal({
    title: 'Выбор',
    body: 'Все семь реликвий собраны. Ты знаешь правду о Матери и о шести погибших городах. Совет Ноа ждёт твоего решения.',
    wide: true,
    buttons: ENDINGS.map((e) => ({
      label: e.title,
      sub: e.choice,
      onClick: () => {
        clearSave();
        showModal({
          title: `Финал: ${e.title}`,
          body: e.text + `\n\nДней прожито: ${S.cycle}. Выжило жителей: ${S.pop}.`,
          buttons: [{ label: 'Сыграть снова', onClick: startRun }],
        });
        voice.play(`ending-${e.key}`);
      },
    })),
  });
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
  showModal({ title: 'Журнал Ныряльщика', body, buttons: [{ label: 'Закрыть', onClick: () => { S.paused = false; lockPointer(); } }] });
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
  const level = S.mode === 'day' ? ECO.waterLevel(p, S.weather) : W1 + S.closing * 1.2;
  ocean.update(S.time, level, player.pos.x, player.pos.z);

  player.update(dt, keys, yaw, world);

  // подбор и сдача
  const near = nearestPickup();
  const hatch = inHatch() && S.mode === 'day';
  let prompt = '';
  if (near) {
    const it = ITEM[near.type];
    prompt = player.weight + it.weight > player.capacity ? `${it.name}: слишком тяжело (груз ${player.weight}/${player.capacity})` : `<b>E</b> — подобрать: ${it.name}`;
  } else if (hatch) {
    prompt = `<b>E</b> — сдать груз · <b>R</b> — укрыться в Ковчеге и закончить день`;
  }
  $('prompt').innerHTML = prompt;
  $('prompt').classList.toggle('hidden', !prompt);
  if (pressed.has('KeyE')) {
    if (near) {
      const it = ITEM[near.type];
      if (player.weight + it.weight <= player.capacity) {
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

  updateNavigator(dt);
  updateHarpoon(dt);
  updateLeeches(dt);
  updateDeeplings(dt);
  updateBlowhole(dt, p);
  updateAmbient(dt, S.mode === 'day' ? p : 1);

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
  updateWeather(dt);
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
    if (L.push) {
      L.push.t -= dt;
      const nx = L.x + L.push.x * 14 * dt;
      const nz = L.z + L.push.z * 14 * dt;
      if (backU(nx, nz) < 0.97 && !city.overlaps(nx, nz, 0.3)) { L.x = nx; L.z = nz; }
      if (L.push.t <= 0) L.push = null;
    }
    let speed = 1.2;
    if (L.push) speed = 0;
    else if (d < 26 && Math.abs(player.pos.y - ly) < 6 && L.cool <= 0) {
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

const STORM_SKY = new THREE.Color(0x39444c);
const STORM_FOG = new THREE.Color(0x4a5860);
const FOG_COLOR = new THREE.Color(0x9fb2b8);
function updateWeather(dt) {
  if (S.weather === 'storm') {
    skyMat.uniforms.top.value.lerp(STORM_SKY, 0.75);
    skyMat.uniforms.horizon.value.lerp(STORM_FOG, 0.75);
    fogDay.lerp(STORM_FOG, 0.7);
    sun.intensity *= 0.35;
    // дождь вокруг камеры
    const wx = (S.wind?.x || 0) * dt * 2;
    const wz = (S.wind?.z || 0) * dt * 2;
    for (let i = 0; i < RAIN_N * 2; i++) {
      rainPos[i * 3] += wx;
      rainPos[i * 3 + 1] -= 32 * dt;
      rainPos[i * 3 + 2] += wz;
    }
    for (let i = 0; i < RAIN_N; i++) if (rainPos[i * 6 + 4] < -10) resetDrop(i, true);
    rainGeo.attributes.position.needsUpdate = true;
    rain.position.set(camera.position.x, camera.position.y - 10, camera.position.z);
    // молнии
    // порывы ветра: затишье 6–10 с, порыв ~3 с с плавным нарастанием
    const G = S.gust;
    G.t -= dt;
    if (G.t <= 0) {
      G.on = !G.on;
      G.t = G.on ? 2.6 + Math.random() : 6 + Math.random() * 4;
      if (G.on) {
        audio.wind?.();
        if (!G.warned) { toast('Порыв ветра! Пригнись: стоящего на месте почти не сносит.', 'warn'); G.warned = true; }
      }
    }
    G.k += ((G.on ? 1 : 0) - G.k) * Math.min(1, dt * 2.5);
    world.wind = G.k > 0.02 ? { x: S.wind.x * G.k, z: S.wind.z * G.k } : null;
    S.thunderTimer -= dt;
    if (S.thunderTimer <= 0) {
      S.thunderTimer = 7 + Math.random() * 9;
      S.flash = 0.25;
      audio.thunder();
    }
  } else if (S.weather === 'fog') {
    fogDay.lerp(FOG_COLOR, 0.6);
    skyMat.uniforms.top.value.lerp(fogDay, 0.8);
    skyMat.uniforms.horizon.value.copy(fogDay);
  } else if (S.weather === 'calm') {
    sun.intensity *= 1.1;
  }
  if (S.flash > 0) {
    S.flash -= dt;
    hemi.intensity += 3 * Math.max(0, S.flash) / 0.25;
    skyMat.uniforms.horizon.value.lerp(new THREE.Color(0xdde8ff), Math.max(0, S.flash) * 2);
  }
}

// ============ Навигатор и мини-карта ============
let navGrid = null;
const NAV_MODES = [
  ['auto', 'Авто'],
  ['hatch', 'Ковчег'],
  ['food', 'Рыба'],
  ['fuel', 'Ворвань'],
  ['scrap', 'Обломки'],
  ['relic', 'Реликвия'],
  ['quest', 'Просьба жителя'],
  ['off', 'Выключен'],
];
const NAV_NAMES = { hatch: 'Ковчег', food: 'Рыба', fuel: 'Ворвань', scrap: 'Обломки', relic: 'Реликвия', keepsake: 'Вещь жителя', any: 'Припасы' };

function nearestOf(types, fits = false) {
  let best = null;
  let bd = Infinity;
  for (const p of city.pickups) {
    if (!p.active || !types.includes(p.type)) continue;
    if (fits && player.weight + ITEM[p.type].weight > player.capacity) continue;
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Куда ведёт навигатор: { kind, x, z } или null
function navTarget() {
  let kind = NAV_MODES[S.navMode][0];
  if (kind === 'off' || S.mode === 'closing') return null;
  if (kind === 'auto') {
    const q = S.quest;
    kind = NAV.autoTarget({
      p: S.t / S.T,
      weight: player.weight,
      capacity: player.capacity,
      food: S.food,
      fuel: S.fuel,
      needFood: needFood(),
      needFuel: needFuel(),
      carried: player.carried,
      questKeepsake: !!(q && q.kind === 'keepsake' && !q.done && !q.have && !player.carried.includes('keepsake') && nearestOf(['keepsake'])),
    });
  } else if (kind === 'quest') {
    const q = S.quest;
    if (!q || q.done) kind = 'hatch';
    else if (q.kind === 'keepsake') kind = player.carried.includes('keepsake') ? 'hatch' : 'keepsake';
    else kind = q.have + player.carried.filter((t) => t === q.item).length >= q.need ? 'hatch' : q.item;
  }
  if (kind === 'hatch') return { kind, x: HATCH.x, z: HATCH.z };
  const pk = kind === 'any' ? nearestOf(['food', 'fuel', 'scrap'], true) : nearestOf([kind]);
  if (pk) return { kind, x: pk.x, z: pk.z };
  // нужного нет на карте — в режиме «Авто» ведём домой
  return NAV_MODES[S.navMode][0] === 'auto' ? { kind: 'hatch', x: HATCH.x, z: HATCH.z } : { kind, none: true };
}

const navM = new THREE.Matrix4();
function updateNavigator(dt) {
  if (pressed.has('Tab')) {
    S.navMode = (S.navMode + 1) % NAV_MODES.length;
    S.navTimer = 0;
    toast(`Навигатор: ${NAV_MODES[S.navMode][1]}`);
  }
  if (pressed.has('KeyM')) $('hud').classList.toggle('nomap');
  S.navTimer -= dt;
  if (S.navTimer <= 0) {
    S.navTimer = 0.4;
    const tgt = navTarget();
    const modeName = NAV_MODES[S.navMode][1];
    if (!tgt) {
      S.navPath = null;
      S.navInfo = { label: S.mode === 'closing' ? '—' : modeName, dist: 0 };
    } else if (tgt.none) {
      S.navPath = null;
      S.navInfo = { label: `${NAV_NAMES[tgt.kind]}: нет на карте`, dist: 0 };
    } else {
      const path = navGrid ? NAV.findPath(navGrid, { x: player.pos.x, z: player.pos.z }, tgt) : null;
      if (path) {
        path[path.length - 1] = { x: tgt.x, z: tgt.z };
        path[0] = { x: player.pos.x, z: player.pos.z };
      }
      S.navPath = path || [{ x: player.pos.x, z: player.pos.z }, { x: tgt.x, z: tgt.z }];
      const auto = NAV_MODES[S.navMode][0] === 'auto' || NAV_MODES[S.navMode][0] === 'quest';
      S.navInfo = { label: auto ? `${modeName} → ${NAV_NAMES[tgt.kind]}` : NAV_NAMES[tgt.kind], dist: NAV.pathLength(S.navPath), kind: tgt.kind };
      navMat.color.set(tgt.kind === 'hatch' ? 0x58f0d8 : MAP_COLORS[tgt.kind] || '#ffe9a8');
    }
  }
  // пунктир «бежит» от игрока к цели
  let n = 0;
  if (S.navPath) {
    const pts = S.navPath.slice();
    pts[0] = { x: player.pos.x, z: player.pos.z };
    const dots = NAV.dotsAlong(pts, 1.4, 1.2 + ((S.time * 2.2) % 1.4), NAV_DOTS);
    for (const d of dots) {
      const bh = backHeight(d.x, d.z);
      const y = isFinite(bh) ? city.groundAt(d.x, d.z, bh + 0.4) + 0.45 : ocean.surfaceAt(d.x, d.z) + 0.3;
      navM.makeTranslation(d.x, y, d.z);
      navDots.setMatrixAt(n++, navM);
    }
  }
  navDots.count = n;
  navDots.instanceMatrix.needsUpdate = true;

  minimap.draw({
    dt,
    time: S.time,
    water: ocean.level,
    colliders: city.colliders,
    pickups: city.pickups,
    leeches: city.leeches,
    deeplings,
    player: { x: player.pos.x, z: player.pos.z },
    yaw,
    path: S.navPath,
  });
}

// ============ Вступительный ролик ============
const intro = { t: 0, shot: -1, onDone: null, walk: 0, subs: [] };
const introFake = { pos: new THREE.Vector3(), headUnder: true, swimming: false };
const WALK = new Set(['KeyW']);
const NONE = new Set();

function startIntro(onDone) {
  S.mode = 'intro';
  S.paused = false;
  intro.t = 0;
  intro.shot = -1;
  intro.onDone = onDone;
  intro.subs = [];
  // город — тот же, что будет в первый день
  S.cycle = 1;
  const drng = mulberry32(S.runSeed + 7919);
  rollWeather(drng, 1);
  const q = makeQuest(drng, S.alive, 1);
  city.generate(S.runSeed + 1013, 1, S.lore, LORE.length, { keepsake: q?.kind === 'keepsake' });
  navGrid = NAV.buildGrid((x, z) => backU(x, z) >= 0.97 || city.overlaps(x, z, 0.8));
  S.weather = 'clear';
  S.wind = null;
  world.wind = null;
  ocean.amp = 1;
  S.t = 0;
  S.T = ECO.dayLength(1);
  S.navMode = 0;
  S.navTimer = 0;
  S.navPath = null;
  S.blowTimer = 999;
  S.blowing = 0;
  deeplings.forEach((d) => d.setActive(false));
  player.reset(new THREE.Vector3(HATCH.x, city.groundAt(HATCH.x, HATCH.z) + 0.05, HATCH.z));
  player.mesh.visible = false;
  navDots.count = 0;
  $('hud').classList.add('hidden');
  $('cine').classList.remove('hidden', 'titlecard');
  $('cine-sub').textContent = '';
  document.exitPointerLock?.();
}

function endIntro() {
  if (S.mode !== 'intro') return;
  voice.stop();
  $('cine').classList.add('hidden');
  deeplings.forEach((d) => d.setActive(false));
  player.mesh.visible = true;
  navDots.count = 0;
  S.mode = 'menu';
  const done = intro.onDone;
  intro.onDone = null;
  done?.();
}

function introRelic() {
  const r = city.pickups.find((p) => p.type === 'relic') || { x: BLOWHOLE.x, y: BLOWHOLE.y + 1, z: BLOWHOLE.z };
  const len = Math.hypot(r.x, r.z) || 1;
  return { x: r.x, y: r.y, z: r.z, ox: r.x / len, oz: r.z / len };
}

// Точка из сценария: готовые координаты или «ключ» (игрок, реликвия)
function introPoint(spec) {
  if (Array.isArray(spec)) return spec;
  const p = player.pos;
  const r = introRelic();
  switch (spec) {
    case 'player-back': return [p.x + 7, p.y + 3.5, p.z + 10];
    case 'player-face': return [p.x + 1.1, p.y + 1.9, p.z + 3.1];
    case 'player-head': return [p.x, p.y + 1.55, p.z];
    case 'relic-far': return [r.x + r.ox * 14, r.y + 6, r.z + r.oz * 14];
    case 'relic-near': return [r.x + r.ox * 4 + r.oz * 1.5, r.y + 1.4, r.z + r.oz * 4 - r.ox * 1.5];
    case 'relic': return [r.x, r.y, r.z];
    default: return [0, 0, 0];
  }
}

function introEvent(name) {
  switch (name) {
    case 'moan': audio.moan(1.3); break;
    case 'horn': audio.horn(); break;
    case 'blow': S.blowTimer = 0; break;
    case 'deepling': {
      const D = deeplings[0];
      D.setActive(true, 32);
      D.pos.set(-30, 21, 20);
      D.segPos.forEach((sp, i) => sp.set(-30 - i, 21, 20));
      break;
    }
    case 'growl': audio.tone({ type: 'sawtooth', f0: 75, f1: 38, dur: 1.6, vol: 0.22, attack: 0.3, lp: 500 }); break;
    case 'hatch': audio.tone({ type: 'square', f0: 60, f1: 40, dur: 0.8, vol: 0.12, lp: 300 }); break;
    case 'chime': audio.pickup('relic'); break;
    default: break;
  }
}

function onIntroShot(shot) {
  const sub = $('cine-sub');
  sub.classList.remove('show');
  void sub.offsetWidth; // перезапуск анимации появления
  sub.textContent = shot.sub;
  sub.style.animationDuration = `${shot.dur / (S.introSpeed || 1)}s`;
  if (S.introSpeed && S.introSpeed > 1) voice.stop();
  else voice.play(shot.id);
  if (shot.sub) {
    sub.classList.add('show');
    intro.subs.push(shot.sub);
  }
  $('cine').classList.toggle('titlecard', !!shot.title);
  if (shot.id === 'you') {
    player.reset(new THREE.Vector3(HATCH.x, city.groundAt(HATCH.x, 10.6) + 0.05, 10.6));
    player.facing = Math.PI;
    player.mesh.rotation.y = Math.PI;
    player.mesh.visible = true;
    intro.walk = 2.6;
  }
  if (shot.id === 'task') S.navTimer = 0;
  if (shot.id !== 'night') deeplings[0].setActive(false);
}

function updateIntro(dt) {
  if (pressed.has('Space') || pressed.has('Escape') || pressed.has('Enter')) {
    endIntro();
    return;
  }
  const t0 = intro.t;
  intro.t += dt * (S.introSpeed || 1);
  const st = CUT.shotAt(intro.t);
  if (st.index !== intro.shot) {
    intro.shot = st.index;
    onIntroShot(st.shot);
  }
  for (const e of CUT.eventsBetween(t0, intro.t)) introEvent(e.name);
  if (st.done) {
    endIntro();
    return;
  }
  const s = st.shot;
  const k = CUT.ease(st.k);
  const sdt = dt * (S.introSpeed || 1);

  if (s.id === 'you') {
    player.update(sdt, intro.walk > 0 ? WALK : NONE, Math.PI, world);
    intro.walk -= sdt;
  }
  camera.position.fromArray(CUT.lerp3(introPoint(s.cam[0]), introPoint(s.cam[1]), k));
  camera.lookAt(...CUT.lerp3(introPoint(s.look[0]), introPoint(s.look[1]), k));

  const water = CUT.lerp(s.water[0], s.water[1], s.id === 'dive' ? Math.pow(st.k, 1.5) : k);
  const p = CUT.lerp(s.time[0], s.time[1], st.k);
  ocean.update(S.time, water, camera.position.x, camera.position.z);
  applyTime(p);
  city.beaconLight.intensity = 40 + p * 160;
  city.hatchRing.material.opacity = 0.35 + Math.sin(S.time * 4) * 0.2;
  for (const pk of city.pickups) {
    pk.mesh.rotation.y += sdt * 1.2;
    pk.mesh.position.y = pk.y + Math.sin(S.time * 2 + pk.phase) * 0.2;
  }
  updateBlowhole(sdt, p);
  updateAmbient(sdt, p);
  if (s.id === 'night') {
    // глубинник проплывает мимо светящегося Ковчега
    introFake.pos.set(CUT.lerp(-26, 30, st.k), 21 + Math.sin(st.k * 6) * 1.5, CUT.lerp(18, 14, st.k));
    deeplings[0].update(sdt, introFake, ocean, true, 2.5);
  }
  if (s.id === 'task') updateNavigator(sdt);
  else navDots.count = 0;
  cameraEnv(s.id === 'night' ? 1 : p);
}

const HARPOON_CD = [1.6, 1.1, 0.7];
function updateHarpoon(dt) {
  S.harpoonCd -= dt;
  if (!pressed.has('KeyF') || S.harpoonCd > 0) return;
  const lvl = S.up.harpoon || 0;
  S.harpoonCd = HARPOON_CD[lvl];
  player.swing = 0.35;
  audio.tone({ type: 'triangle', f0: 300, f1: 120, dur: 0.18, vol: 0.12 });
  const range = 3.6 + lvl * 0.8;
  // бьём туда, куда смотрит камера, и разворачиваем ныряльщика
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  player.facing = yaw;
  player.mesh.rotation.y = yaw;
  let hit = 0;
  for (const L of city.leeches) {
    const dx = L.x - player.pos.x;
    const dz = L.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range || Math.abs(L.mesh.position.y - player.pos.y) > 2.5) continue;
    if (d > 1 && (dx * fx + dz * fz) / d < 0.2) continue;
    L.push = { x: dx / (d || 1), z: dz / (d || 1), t: 0.45 };
    L.cool = 3;
    hit++;
  }
  for (const D of deeplings) {
    if (!D.active) continue;
    if (D.pos.distanceTo(player.pos) < range + 2.5) {
      D.scare();
      toast('Глубинник получил гарпуном и уплыл!', 'ok');
      hit++;
    }
  }
  if (hit) audio.hit();
}

function updateDeeplings(dt) {
  for (const D of deeplings) {
    const r = D.update(dt, player, ocean, S.mode === 'closing', S.cycle * 0.15 - (S.up.fins || 0) * 0.2);
    if (r === 'bite') {
      player.oxygen -= 0.3;
      const away = player.pos.clone().sub(D.pos).setY(0).normalize();
      player.vel.addScaledVector(away, 9);
      audio.tone({ type: 'sawtooth', f0: 90, f1: 40, dur: 0.6, vol: 0.25, lp: 600 });
      audio.hit();
      toast('Глубинник укусил! Кислород утекает — плыви к поверхности!', 'danger');
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
  cameraEnv(Math.min(1, S.t / S.T));
}

// Чайки, дым, пузыри, брызги, луч маяка — общий для игры, ролика и меню
function shorePoint() {
  const L = ocean.level;
  const u = L <= 0 ? 0.999 : 1 - Math.pow(Math.min(0.999, L / WHALE.H), 2);
  const th = Math.random() * Math.PI * 2;
  const r = Math.sqrt(u);
  const z = WHALE.b * r * Math.sin(th);
  const x = WHALE.a * (1 - 0.55 * (() => { const t = Math.min(1, Math.max(0, (z / WHALE.b - 0.3) / 0.7)); return t * t * (3 - 2 * t); })()) * r * Math.cos(th);
  if (Math.hypot(x - camera.position.x, z - camera.position.z) > 90) return null;
  return { x, y: L + 0.2, z };
}
function updateAmbient(dt, p) {
  ambient.update(dt, {
    time: S.time,
    p,
    camera,
    player: S.mode === 'day' || S.mode === 'closing' ? player : null,
    underK: S.underK || 0,
    chimneys: city.chimneys,
    weather: S.weather,
    wind: world.wind,
    surface: (x, z) => ocean.surfaceAt(x, z),
    shore: shorePoint,
  });
  city.beam.rotation.y += dt * 0.5;
  city.beamMat.uniforms.opacity.value = Math.max(0, Math.min(1, (p - 0.45) / 0.3)) * 0.5 * (S.underK > 0.5 ? 0 : 1);
}

// Небо, солнце, туман и «подводность» вокруг текущей камеры
function cameraEnv(dark) {
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  // тени считаются вокруг игрока, а в ролике — вокруг того, куда смотрит камера
  const focus = S.mode === 'intro' ? camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(35).add(camera.position) : player.pos;
  const sd = sunDir.y > 0.08 ? sunDir : new THREE.Vector3(sunDir.x, 0.35, sunDir.z).normalize();
  sun.position.copy(focus).addScaledVector(sd, 160);
  sun.target.position.copy(focus);
  S.underK = Math.max(0, Math.min(1, (ocean.surfaceAt(camera.position.x, camera.position.z) - camera.position.y) * 2));

  // под водой
  const under = camera.position.y < ocean.surfaceAt(camera.position.x, camera.position.z);
  if (under) {
    scene.fog.color.set(0x0b3340).lerp(new THREE.Color(0x02080c), dark);
    scene.fog.near = 1;
    scene.fog.far = 55;
    if (S.mode === 'intro') {
      // в ролике под водой видно дальше: силуэт Матери и огни Ковчега
      scene.fog.color.set(0x17566a).lerp(new THREE.Color(0x04141c), dark);
      scene.fog.far = 170;
    }
  } else {
    scene.fog.color.copy(fogDay);
    scene.fog.near = S.weather === 'fog' && S.mode !== 'menu' ? 2 : S.weather === 'storm' && S.mode !== 'menu' ? 30 : 90;
    scene.fog.far = S.weather === 'fog' && S.mode !== 'menu' ? 55 : S.weather === 'storm' && S.mode !== 'menu' ? 260 : 700;
  }
  if (under) {
    // из-под воды неба не видно — только толща воды
    skyMat.uniforms.top.value.copy(scene.fog.color);
    skyMat.uniforms.horizon.value.copy(scene.fog.color);
    starMat.opacity = 0;
  }
  document.body.classList.toggle('underwater', under);
  updateEnvironment(dark);
  rain.visible = S.weather === 'storm' && !under && (S.mode === 'day' || S.mode === 'closing');
  audio.setUnderwater(under);
  audio.setMood(dark, under);
}

// ============ Меню ============
$('intro').textContent = INTRO;
function leaveMenu() {
  voice.preload();
  audio.init();
  audio.resume();
  audio.setMusicVolume(settings.music);
  audio.startMusic();
  $('menu').classList.add('hidden');
}
$('start').addEventListener('click', () => {
  leaveMenu();
  startRun(true);
});
$('prologue-btn').addEventListener('click', () => {
  leaveMenu();
  if (!S.alive.length) S.alive = RESIDENTS.map((r) => r.id);
  startIntro(() => {
    S.mode = 'menu';
    $('menu').classList.remove('hidden');
  });
});
$('skip').addEventListener('click', () => endIntro());

// мини-карта и её легенда
const minimap = new Minimap($('minimap'));
for (const [key, label] of LEGEND) {
  const li = document.createElement('li');
  const i = document.createElement('i');
  if (key === 'relic' || key === 'keepsake') i.className = 'diamond';
  if (key === 'deepling') i.className = 'tri';
  i.style.background = MAP_COLORS[key];
  i.style.setProperty('--c', MAP_COLORS[key]);
  li.append(i, label);
  $('legend').appendChild(li);
}
const saved = loadGame();
if (saved && saved.pop > 0) {
  $('continue').classList.remove('hidden');
  $('continue').textContent = `ПРОДОЛЖИТЬ · ДЕНЬ ${saved.cycle}`;
  $('start').textContent = 'НОВЫЙ ЗАБЕГ';
  $('start').classList.add('secondary');
  $('continue').addEventListener('click', () => {
    leaveMenu();
    for (const k of SAVE_FIELDS) if (k in saved) S[k] = saved[k];
    S.up = S.up || {};
    S.alive = S.alive || RESIDENTS.map((r) => r.id);
    startDay();
  });
}


// для фона меню и для автотестов
window.__deepback = { S, sky, envScene, whale, ambient, scene, post, voice, intro, startIntro, endIntro, player, city, ocean, deeplings, rain, navDots, startRun, startDay, endDay, keys, pressed, setYaw: (v) => (yaw = v) };

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
    updateAmbient(dt, 0.3);
  } else if (S.mode === 'intro') {
    updateIntro(dt);
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
  post.render(dt, { under: S.underK || 0, time: S.time });
  requestAnimationFrame(frame);
}
frame();

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post.resize();
});
