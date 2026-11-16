import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { buildWhale, dressWhale, backHeight, backU, BLOWHOLE, WHALE, KELP_TIME } from './whale.js';
import { Ocean } from './ocean.js';
import { City, HATCH, SPAWN, ITEM, MATERIALS, dressMaterials } from './city.js';
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
import { ArkInterior, ARK_R } from './ark.js';
import * as ARMS from './armory.js';
import { NIGHT_ROLES, nightLine } from './residents.js';
import { createCoop, RemoteDiver } from './coop.js';
import { REGIONS, regionFor, buildRegion, animateRegion } from './regions.js';
import { Schools } from './schools.js';
import { DistantGiant } from './giant.js';
import { ThiefGull } from './thief.js';
import * as COMBAT from './combat.js';
import { Castaway, castawayComes } from './castaway.js';
import { TraderBoat, OFFERS, trade, traderComes } from './trader.js';
import { Achievements, ACHIEVEMENTS } from './achievements.js';
import { REGION_KEYS } from './regions.js';

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
const DIVER_TEX = { cloth: TEX.canvasCloth(), patina: TEX.brassPatina() };
dressMaterials(TEX);
// каустика на коже Матери и на постройках
addCaustics(whale.userData.skin, { wet: true });
for (const k of ['steel', 'rust', 'arkWall', 'arkDome', 'bone', 'trim']) addCaustics(MATERIALS[k]);
for (const mtl of MATERIALS.walls || []) addCaustics(mtl);
for (const mtl of MATERIALS.roofs || []) addCaustics(mtl);
const city = new City(scene);
const player = new Player(scene);
const schools = new Schools(scene);
let achStore = null;
try { achStore = window.localStorage; } catch { /* нет хранилища */ }
const ach = new Achievements(achStore);
// всплывающее достижение
function achieve(a) {
  if (!a) return;
  toast(`${a.icon} Достижение: ${a.title} — ${a.desc}`, 'achv');
  audio.fanfare?.();
}
const traderBoat = new TraderBoat(scene);
const giant = new DistantGiant(scene);
const thief = new ThiefGull(scene);
const castaway = new Castaway(scene);
const schoolV = new THREE.Vector3();
player.dress(DIVER_TEX.cloth, DIVER_TEX.patina);
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
const blowMat = new THREE.PointsMaterial({ color: 0xe8f6ff, size: 1.6, map: TEX.glowDot(), transparent: true, opacity: 0.85, depthWrite: false, alphaTest: 0.01 });
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
// пунктир навигатора — плоские стрелки-«галочки» на земле, остриём к цели
const navArrowGeo = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.32);
  sh.lineTo(0.3, -0.06);
  sh.lineTo(0.17, -0.06);
  sh.lineTo(0, 0.15);
  sh.lineTo(-0.17, -0.06);
  sh.lineTo(-0.3, -0.06);
  sh.lineTo(0, 0.32);
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2); // лежит на земле, остриём к -z
  return g;
})();
navMat.side = THREE.DoubleSide;
const navDots = new THREE.InstancedMesh(navArrowGeo, navMat, NAV_DOTS);
const navQ = new THREE.Quaternion();
const navS = new THREE.Vector3();
const navP = new THREE.Vector3();
const navUp = new THREE.Vector3(0, 1, 0);
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
const regionC = new THREE.Color();
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
  // своё море: вода, туман и небо смещаются к его цветам (ночью — меньше)
  const RG = S.mode === 'intro' || S.mode === 'menu' ? null : REGIONS[S.region || 'open'];
  if (RG && RG.deep) {
    // к ночи подкраска моря гаснет: цвета региона темнеют вместе с палитрой суток
    const day = Math.pow(Math.max(0, 1 - p), 1.5);
    const k = 0.65 * day;
    ocean.mat.uniforms.uDeep.value.lerp(regionC.set(RG.deep), k);
    ocean.mat.uniforms.uShallow.value.lerp(regionC.set(RG.shallow), k);
    fogDay.lerp(regionC.set(RG.fog), 0.45 * day);
    skyMat.uniforms.horizon.value.lerp(regionC.set(RG.sky), 0.35 * day);
  }
  ocean.mat.uniforms.uGlow.value = RG && RG.glow ? Math.max(0, Math.min(1, (p - 0.35) / 0.4)) : 0;
  // сияние: в ледяном море — ярко, в светящемся — слабо; только ночью
  const nightK = Math.max(0, Math.min(1, (p - 0.6) / 0.3));
  skyMat.uniforms.uAurora.value = RG ? (S.region === 'ice' ? 1 : S.region === 'glow' ? 0.4 : 0) * nightK * (S.weather === 'storm' ? 0.2 : 1) : 0;
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
  MATERIALS.window.emissiveIntensity = 0.3 + p * 1.3;
  MATERIALS.lamp.emissiveIntensity = 1 + p * 3;
  MATERIALS.pool.opacity = Math.max(0, Math.min(1, (p - 0.45) / 0.3)) * 0.22;
  city.setHaloStrength(0.35 + Math.min(1, p * 1.3) * 0.65);
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
  arms: ARMS.emptyArms(),
  savedToday: false,
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
  hp: 100,
  hurtT: 99,
};
// Сложность: длина дня, ночной расход еды, лишние пиявки
const DIFF = {
  easy: { name: 'Спокойная', day: 1.3, still: 1, leeches: -2 },
  normal: { name: 'Обычная', day: 1, still: 0, leeches: 0 },
  hard: { name: 'Суровая', day: 0.85, still: -1, leeches: 3 },
};
const diff = () => DIFF[S.diff] || DIFF.normal;
const stillBonus = () => (S.up.still || 0) + diff().still;
const needFood = () => ECO.needFood(S.pop, stillBonus());
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
  // левая кнопка с захваченным курсором — использовать то, что в руке
  if (e.button === 0 && document.pointerLockElement === canvas && (S.mode === 'day' || S.mode === 'closing') && !S.paused && S.held) {
    useHeld();
    return;
  }
  // правая кнопка — метнуть гарпун на тросе
  if (e.button === 2 && document.pointerLockElement === canvas && (S.mode === 'day' || S.mode === 'closing') && !S.paused) {
    throwHarpoon();
    return;
  }
  if (S.mode === 'day' || S.mode === 'closing' || S.mode === 'ark') lockPointer();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
  else if (hadLock && (S.mode === 'day' || S.mode === 'closing' || S.mode === 'ark') && !S.paused) setPause(true);
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
  if ((e.code === 'Escape' || e.code === 'KeyP') && (S.mode === 'day' || S.mode === 'closing' || S.mode === 'ark') && $('modal').classList.contains('hidden')) {
    setPause(e.code === 'Escape' ? true : !S.paused);
  }
});

// ============ Автонастройка графики ============
let autoLevel = 'high';
let qualityChosen = false; // игрок сам выбрал качество в меню — это важнее параметра в адресе
const fpsMeter = { frames: 0, time: 0, low: 0 };
function autoQuality(dt) {
  if ((URL_QUALITY && !qualityChosen) || settings.quality !== 'auto' || S.mode === 'menu' || S.paused) return;
  fpsMeter.frames++;
  fpsMeter.time += dt;
  if (fpsMeter.time < 2) return;
  const fps = fpsMeter.frames / fpsMeter.time;
  fpsMeter.frames = 0;
  fpsMeter.time = 0;
  fpsMeter.low = fps < 25 ? fpsMeter.low + 1 : 0;
  if (fpsMeter.low >= 3 && autoLevel !== 'low') {
    autoLevel = autoLevel === 'high' ? 'medium' : 'low';
    fpsMeter.low = 0;
    post.setQuality(autoLevel, sun);
    whale.userData.setDetail?.(autoLevel);
    applyAniso(autoLevel);
    toast(`Графика снижена до «${autoLevel === 'medium' ? 'среднего' : 'низкого'}» качества для плавности. Изменить — в паузе.`);
  }
}

// ============ Настройки ============
const SETTINGS_KEY = 'deepback-settings-v1';
const settings = { volume: 0.7, voice: 1, music: 0.5, sens: 1, invert: false, quality: 'auto', diff: 'normal' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* без сохранения */ }
let anisoNow = 4;
function applyAniso(level) {
  const n = level === 'low' ? 4 : Math.min(level === 'high' ? 16 : 8, renderer.capabilities.getMaxAnisotropy());
  if (n !== anisoNow) { anisoNow = n; TEX.setAnisotropy(n); }
}
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
  // «Авто»: начинаем с высокого и снижаем, если кадров мало (см. autoQuality)
  const q = (!qualityChosen && URL_QUALITY) || (settings.quality === 'auto' ? autoLevel : settings.quality);
  $('set-quality').value = settings.quality;
  if (post.level !== q) post.setQuality(q, sun);
  whale.userData.setDetail?.(q);
  applyAniso(q);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}
$('set-volume').addEventListener('input', (e) => { settings.volume = e.target.value / 100; applySettings(); });
$('set-music').addEventListener('input', (e) => { settings.music = e.target.value / 100; applySettings(); });
$('set-voice').addEventListener('input', (e) => { settings.voice = e.target.value / 100; applySettings(); });
$('set-sens').addEventListener('input', (e) => { settings.sens = Number(e.target.value); applySettings(); });
$('set-quality').addEventListener('change', (e) => { settings.quality = e.target.value; qualityChosen = true; applySettings(); });
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
  const A = S.arms;
  const inHand = S.held ? ` · в руке: <b>${S.held === 'spear' ? (A.spear ? 'острога' : 'гарпун') : HELD_NAMES[S.held]}</b>` : '';
  $('weapons').innerHTML = `<span class="lbl">F</span> ${A.spear ? 'острога' : 'гарпун'}` +
    ` · <span class="lbl">T</span> <span style="opacity:${S.throwCd > 0 ? 0.4 : 1}">трос</span>` +
    (A.bombs ? ` · <span class="lbl">G</span> соль ×${A.bombs}` : '') +
    (A.flare ? ` · <span class="lbl">Q</span> ракетница ${A.flareReady ? '✓' : '—'}` : '') + inHand;
  $('cargo').innerHTML = `<span class="lbl">Груз ${w}/${player.capacity}</span> ` + (player.carried.map((t) => `<span class="it ${t}">${ITEM[t].icon}</span>`).join('') || '<span class="empty">пусто</span>');
  $('oxy').classList.toggle('hidden', player.oxygen > 0.995 && !player.headUnder);
  $('oxybar').style.width = Math.max(0, player.oxygen) * 100 + '%';
  $('oxybar').className = player.oxygen < 0.3 ? 'danger' : '';
  $('nav-target').textContent = S.navInfo.label;
  $('nav-dist').textContent = S.navInfo.dist ? `· ${Math.round(S.navInfo.dist)} м` : '';
  $('hud').classList.toggle('alarm', p > 0.85 && S.mode === 'day');
  const W = WEATHER[S.weather];
  const gusting = S.weather === 'storm' && S.gust && S.gust.k > 0.3;
  $('weather').textContent = `${W.icon} ${W.name}${S.region && S.region !== 'open' ? ` · ${REGIONS[S.region].name}` : ''}${gusting ? ' · порыв ветра!' : ''}`;
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
  S.diff = settings.diff || 'normal';
  S.cycle = 1;
  S.pop = ECO.START.pop;
  S.food = ECO.START.food;
  S.fuel = ECO.START.fuel;
  S.lore = 0;
  S.scrap = 0;
  S.up = {};
  S.alive = RESIDENTS.map((r) => r.id);
  S.arms = ARMS.emptyArms();
  S.runSeed = Math.floor(Math.random() * 1e9);
  if (withIntro) startIntro(startDay);
  else startDay();
}

// ============ Сохранение ============
const SAVE_KEY = 'deepback-save-v1';
const SAVE_FIELDS = ['cycle', 'pop', 'food', 'fuel', 'lore', 'scrap', 'up', 'alive', 'arms', 'runSeed', 'diff'];
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
  player.lampBoost = u.lamp ? 1.9 : 1;
  player.lamp.distance = u.lamp ? 48 : 30;
  player.lamp.angle = u.lamp ? 0.62 : 0.5;
  // в ледяном море под водой дыхания хватает ненадолго
  player.oxyTime *= REGIONS[S.region || 'open'].oxyMul || 1;
}

// Море дня: декорации вокруг Матери
let regionGroup = null;
function setRegion(key) {
  S.region = key;
  if (regionGroup) {
    scene.remove(regionGroup);
    regionGroup.traverse((m) => m.geometry && m.geometry.dispose());
    regionGroup = null;
  }
  if (key !== 'open') {
    regionGroup = buildRegion(key, S.runSeed + S.cycle * 31, W0);
    scene.add(regionGroup);
  }
}

function startDay() {
  // легенда мини-карты нужна в первые дни; потом только мешает обзору
  if (!S.mapChosen) $('hud').classList.toggle('nolegend', S.cycle > 2);
  S.t = 0;
  S.closing = 0;
  S.blowTimer = 10 + Math.random() * 6;
  S.blowing = 0;
  S.moanTimer = 4;
  S.alarms = {};
  S.stats = { food: 0, fuel: 0, scrap: 0, relics: [], deposits: 0 };
  S.harpoonCd = 0;
  applyUpgrades();
  S.arms = ARMS.morning(S.arms);
  S.held = null;
  player.held = null;
  S.bombsInAir = [];
  const drng = mulberry32(S.runSeed + S.cycle * 7919);
  S.weather = rollWeather(drng, S.cycle);
  setRegion(regionFor(S.runSeed, S.cycle));
  applyUpgrades();
  S.quest = makeQuest(drng, S.alive, S.cycle);
  S.T = Math.round(ECO.dayLength(S.cycle, S.weather) * diff().day);
  ocean.amp = S.weather === 'storm' ? 2.4 : S.weather === 'calm' ? 0.45 : 1;
  const wa = drng() * Math.PI * 2;
  S.wind = S.weather === 'storm' ? { x: Math.cos(wa) * 3.2, z: Math.sin(wa) * 3.2 } : null;
  S.gust = { t: 6, k: 0, on: false, warned: false };
  world.wind = null;
  rain.visible = S.weather === 'storm';
  S.thunderTimer = 5;
  const R = REGIONS[S.region];
  schools.reset(3 + (S.region === 'reef' ? 3 : 0), mulberry32(S.runSeed + S.cycle * 577));
  if (traderComes(S.runSeed, S.cycle) && !coop.isGuest) traderBoat.arrive(S.runSeed, S.cycle);
  else traderBoat.leave();
  thief.reset(S.cycle >= 3 && S.weather !== 'storm');
  S.hp = COMBAT.PLAYER_HP;
  S.hurtT = 99;
  if (castawayComes(S.runSeed, S.cycle) && !coop.isGuest) castaway.arrive(S.runSeed, S.cycle);
  else castaway.leave();
  city.generate(S.runSeed + S.cycle * 1013, S.cycle, S.lore, LORE.length, { keepsake: S.quest?.kind === 'keepsake', extraFood: R.extraFood, extraScrap: R.extraScrap, extraLeeches: Math.max(0, (R.extraLeeches || 0) + diff().leeches) });
  navGrid = NAV.buildGrid((x, z) => backU(x, z) >= 0.97 || city.overlaps(x, z, 0.8));
  S.navTimer = 0;
  S.navPath = null;
  const sp = SPAWN.clone();
  sp.y = city.groundAt(sp.x, sp.z) + 0.1;
  player.reset(sp);
  const nDeep = S.cycle >= 4 ? 2 : S.cycle >= 2 ? 1 : 0;
  deeplings.forEach((d, i) => d.setActive(i < nDeep, W0));
  yaw = Math.PI;
  pitch = 0.35;
  player.mesh.visible = true;
  coop.newDay();
  S.mode = 'day';
  S.paused = false;
  $('hud').classList.remove('hidden');
  tutorialStart();
  toast(`День ${S.cycle}. Мать всплыла. У тебя ${Math.round(S.T / 60 * 10) / 10} мин.`);
  if (S.cycle > 1 && S.up.trap && !coop.isGuest) {
    S.food += S.up.trap;
    toast(`Верши у шлюза принесли за ночь 🐟 ${S.up.trap}.`, 'ok');
  }
  if (S.cycle === 2) toast('На спине завелись пиявки, а под водой кто-то светится. F — гарпун!', 'warn');
  if (S.cycle === 4) toast('Глубинников стало двое.', 'danger');
  if (S.lore < LORE.length) toast('Где-то на опасном краю светится реликвия.', 'relic');
  const W = WEATHER[S.weather];
  if (S.cycle > 1) toast(`${W.icon} ${W.name}. ${W.note}`, S.weather === 'storm' ? 'danger' : '');
  if (S.region !== 'open') toast(`🧭 ${R.name}. ${R.note}`, 'relic');
  achieve(ach.seaVisited(S.region, REGION_KEYS.length));
  if (S.cycle >= 10) achieve(ach.unlock('day10'));
  if (castaway.active) setTimeout(() => audio.call(), 2500);
  if (traderBoat.active) setTimeout(() => audio.bell(), 1500);
  if (castaway.active) toast('🛟 В море дрейфует плот, на нём кто-то машет! Доплыви и забери выжившего в Ковчег.', 'quest');
  if (traderBoat.active) toast('⛵ К краю спины причалила лодка торговца — у него есть что обменять.', 'quest');
  if (S.quest) toast(S.quest.text, 'quest');
  lockPointer();
}

// Груз в запасы Ковчега; возвращает номера принесённых реликвий
function countDeposit(items) {
  const relics = [];
  for (const t of items) {
    if (t === 'food') { S.food++; S.stats.food++; }
    else if (t === 'fuel') { S.fuel++; S.stats.fuel++; }
    else if (t === 'scrap') { S.scrap++; S.stats.scrap++; }
    else if (t === 'keepsake' && S.quest?.kind === 'keepsake') S.quest.have = 1;
    if (S.quest?.kind === 'fetch' && S.quest.item === t) S.quest.have++;
    else if (t === 'relic' && S.lore < LORE.length) { relics.push(S.lore); S.lore++; S.stats.relics.push(S.lore - 1); }
  }
  return relics;
}

// хост: груз, сданный другим ныряльщиком
function applyDeposit(items, who) {
  const relics = countDeposit(items);
  toast(`${who} сдал груз в Ковчег.`, 'ok');
  for (const i of relics) toast(`${who} принёс реликвию: «${LORE[i].title}». Она в журнале (J).`, 'relic');
  checkQuest();
}

function deposit() {
  if (!player.carried.length) {
    toast('Нечего сдавать. Иди за припасами!');
    return;
  }
  let relics;
  if (coop.isGuest) {
    // запасы общие и живут у хоста: отправляем ему, реликвию читаем сразу
    const n = player.carried.filter((t) => t === 'relic').length;
    relics = [];
    for (let k = 0; k < n && S.lore + k < LORE.length; k++) relics.push(S.lore + k);
    coop.act({ k: 'dep', it: player.carried.slice() });
  } else relics = countDeposit(player.carried);
  if (player.weight >= player.capacity) achieve(ach.unlock('full-pack'));
  if (relics.length) achieve(ach.unlock('first-relic'));
  player.carried = [];
  player.refreshPack();
  tutorialMark('deposit');
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
  tutorialFinish();
  traderBoat.leave();
  castaway.leave();
  thief.reset(false);
  if (coop.isGuest) {
    // ночь считает хост; гость ждёт его сводку в Ковчеге
    if (outcome === 'drowned') {
      player.carried = [];
      player.refreshPack();
      toast('Тебя вытащили к шлюзу без сознания. Груз унесло течением.', 'danger');
      coopWait(true);
    } else coopWait();
    return;
  }
  coop.newDay();
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
    const why = S.wounded === 'deepling' ? 'Глубинник изранил тебя, ты потерял сознание в воде.' : S.wounded === 'leech' ? 'Пиявки изжалили тебя до беспамятства.' : 'Ты не успел к шлюзу.';
    S.wounded = null;
    lines.push(`${why} Утром тебя нашли без сознания на палубе.${lost ? ` Груз (${lost}) унесло течением.` : ''} Один из жителей погиб, пока искал тебя.`);
  } else {
    lines.push('Шлюз закрылся за твоей спиной. Мать уходит на глубину.');
  }
  const night = ECO.resolveNight({ pop: S.pop, food: S.food, fuel: S.fuel, cycle: S.cycle, still: stillBonus() });
  const { nf, nu, eatF, burn, hunger, cold, deaths } = night;
  const named = killResidents(deaths);
  if (outcome === 'safe' && S.weather === 'storm') achieve(ach.unlock('storm'));
  if (!deaths && outcome === 'safe') achieve(ach.unlock('nodeaths'));
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

  if (coop.isHost) coop.hostNight(lines, S.pop <= 0 || S.lore >= LORE.length);
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
        body: lines.join('\n\n'),
        buttons: [{ label: 'Войти в Ковчег', onClick: enterArk }],
      });
    }
  }, 900);
}

// Карточки магазина: items — [{ title, desc, pips, price, disabled, reason, onBuy }]
function shopGrid(intro, getItems) {
  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = intro;
  wrap.appendChild(p);
  const bal = document.createElement('p');
  wrap.appendChild(bal);
  const grid = document.createElement('div');
  grid.className = 'shop';
  wrap.appendChild(grid);
  const render = () => {
    bal.textContent = `Обломков: ⚙️ ${S.scrap}.`;
    grid.innerHTML = '';
    for (const it of getItems()) {
      const card = document.createElement('div');
      card.className = 'up';
      card.innerHTML = '<div class="up-h"><b></b><span class="pips"></span></div><small></small>';
      card.querySelector('b').textContent = it.title;
      card.querySelector('.pips').textContent = it.pips || '';
      card.querySelector('small').textContent = it.desc;
      const btn = document.createElement('button');
      btn.textContent = it.reason || `Купить · ⚙️ ${it.price}`;
      btn.disabled = !!it.disabled;
      btn.onclick = () => {
        if (btn.disabled) return;
        it.onBuy();
        audio.deposit();
        render();
      };
      card.appendChild(btn);
      grid.appendChild(card);
    }
  };
  render();
  return wrap;
}

function workshopItems() {
  return UPGRADES.map((up) => {
    const lvl = S.up[up.key] || 0;
    const cost = upgradeCost(up, lvl);
    return {
      title: up.name,
      desc: up.desc,
      pips: '●'.repeat(lvl) + '○'.repeat(up.max - lvl),
      price: cost,
      disabled: cost === null || S.scrap < cost,
      reason: cost === null ? 'Максимум' : null,
      onBuy: () => {
        S.scrap -= cost;
        S.up = { ...S.up, [up.key]: lvl + 1 };
        applyUpgrades();
        // в совместной игре улучшения Ковчега общие: хост запишет их для всех
        coop.act({ k: 'spend', n: cost, up: up.key, lv: lvl + 1 });
        coop.holdSpend();
      },
    };
  });
}

function armoryItems() {
  return ARMS.WEAPONS.map((w) => {
    const why = ARMS.cannotBuy(S.arms, S.scrap, w.key);
    const have = w.kind === 'ammo' ? `есть ${S.arms[w.key] || 0}` : S.arms[w.key] ? 'есть' : '';
    return {
      title: w.name,
      desc: w.desc,
      pips: have,
      price: w.cost,
      disabled: !!why,
      reason: why === 'Уже есть.' || (why && why.startsWith('Больше')) ? why : null,
      onBuy: () => {
        const r = ARMS.buy(S.arms, S.scrap, w.key);
        if (r.ok) {
          coop.act({ k: 'spend', n: S.scrap - r.scrap });
          coop.holdSpend();
          S.arms = r.arms;
          S.scrap = r.scrap;
          showArmsHint();
        }
      },
    };
  });
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
        achieve(ach.unlock('ending'));
        playOutro(e);
      },
    })),
  });
}


// Финальная заставка: камера поднимается над Матерью на рассвете,
// по абзацам идёт текст выбранного финала, в конце — титр и итоги
const outro = { t: 0, ending: null, parts: [], idx: -1 };
const OUTRO_PART = 7;
function playOutro(e) {
  S.mode = 'outro';
  S.paused = false;
  $('modal').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('arkhud').classList.add('hidden');
  if (post.scene !== scene) {
    scene.add(player.mesh);
    post.setScene(scene);
  }
  document.exitPointerLock?.();
  outro.t = 0;
  outro.idx = -1;
  outro.ending = e;
  outro.parts = e.text.split('\n\n');
  ocean.amp = 0.6;
  $('cine').classList.remove('hidden', 'titlecard');
  $('cine-labels').innerHTML = '';
  $('cine-title').querySelector('p').textContent = `Финал: ${e.title}`;
  voice.play(`ending-${e.key}`);
}
function updateOutro(dt) {
  outro.t += dt;
  const total = outro.parts.length * OUTRO_PART + 6;
  const k = Math.min(1, outro.t / total);
  // облёт: от шлюза вверх и в сторону хвоста, Мать целиком в кадре
  const a = 0.6 + k * 1.6;
  const r = 75 + k * 130;
  camera.position.set(Math.sin(a) * r, 34 + k * 55, Math.cos(a) * r);
  camera.lookAt(0, 8 - k * 4, -10 * k);
  const p = 0.12 - k * 0.1; // рассвет
  ocean.update(S.time, ECO.WATER_START, 0, 0);
  applyTime(Math.max(0.02, p));
  updateAmbient(dt, Math.max(0.02, p));
  cameraEnv(Math.max(0.02, p));
  const idx = Math.floor(outro.t / OUTRO_PART);
  if (idx !== outro.idx) {
    outro.idx = idx;
    const sub = $('cine-sub');
    sub.classList.remove('show');
    void sub.offsetWidth;
    sub.textContent = outro.parts[idx] || '';
    sub.style.animationDuration = `${OUTRO_PART}s`;
    if (outro.parts[idx]) sub.classList.add('show');
    $('cine').classList.toggle('titlecard', idx >= outro.parts.length);
  }
  if (outro.t >= total || pressed.has('Space') || pressed.has('Escape')) {
    $('cine').classList.add('hidden');
    $('cine').classList.remove('titlecard');
    S.mode = 'night';
    const e = outro.ending;
    showModal({
      title: `Финал: ${e.title}`,
      body: e.text + `\n\nДней прожито: ${S.cycle}. Выжило жителей: ${S.pop}. Достижений: ${ach.count}/${ACHIEVEMENTS.length}.`,
      buttons: [{ label: 'Сыграть снова', onClick: startRun }],
    });
  }
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
  const h = document.createElement('h3');
  h.textContent = `Достижения · ${ach.count}/${ACHIEVEMENTS.length}`;
  body.appendChild(h);
  const ul = document.createElement('ul');
  ul.className = 'achv-list';
  for (const a of ACHIEVEMENTS) {
    const li = document.createElement('li');
    li.className = ach.has(a.id) ? 'got' : '';
    li.textContent = `${ach.has(a.id) ? a.icon : '·'} ${a.title} — ${a.desc}`;
    ul.appendChild(li);
  }
  body.appendChild(ul);
  showModal({ title: 'Журнал Ныряльщика', body, buttons: [{ label: 'Закрыть', onClick: () => { S.paused = false; lockPointer(); } }] });
}

// ============ Обновление мира ============
const world = {
  get colliders() { return city.colliders; },
  ocean,
  current: 0,
  groundAt: (x, z, y) => city.groundAt(x, z, y),
};

function takePickup(pk) {
  pk.active = false;
  pk.mesh.visible = false;
}

// Торговец: меняет запасы Ковчега один на другой
function openTrader() {
  S.paused = true;
  const wrap = document.createElement('div');
  const intro = document.createElement('p');
  intro.textContent = '«Плыву от города к городу, пока они ещё есть. Меняю то, что у вас лишнее, на то, чего не хватает. Запасы — из вашего Ковчега».';
  wrap.appendChild(intro);
  const bal = document.createElement('p');
  wrap.appendChild(bal);
  const grid = document.createElement('div');
  grid.className = 'shop';
  wrap.appendChild(grid);
  const stock = () => ({ food: S.food, fuel: S.fuel, scrap: S.scrap, bombs: S.arms.bombs || 0 });
  const render = () => {
    bal.textContent = `В Ковчеге: 🐟 ${S.food} · 🛢️ ${S.fuel} · ⚙️ ${S.scrap} · бомб ${S.arms.bombs || 0}.`;
    grid.innerHTML = '';
    for (const o of OFFERS) {
      const card = document.createElement('div');
      card.className = 'up';
      card.innerHTML = '<div class="up-h"><b></b></div><small></small>';
      card.querySelector('b').textContent = o.title;
      card.querySelector('small').textContent = o.note;
      const r = trade(stock(), o.id);
      const btn = document.createElement('button');
      btn.textContent = r.ok ? 'Обменять' : r.why;
      btn.disabled = !r.ok;
      btn.onclick = () => {
        const t2 = trade(stock(), o.id);
        if (!t2.ok) return;
        S.food = t2.stock.food;
        S.fuel = t2.stock.fuel;
        S.scrap = t2.stock.scrap;
        S.arms = { ...S.arms, bombs: Math.min(9, t2.stock.bombs) };
        achieve(ach.unlock('trader'));
        audio.deposit();
        render();
      };
      card.appendChild(btn);
      grid.appendChild(card);
    }
  };
  render();
  showModal({ title: 'Лодка торговца', body: wrap, wide: true, buttons: [{ label: 'Отойти', onClick: () => { S.paused = false; lockPointer(); } }] });
}

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
  const r = S.up.winch ? 5.6 : 2.8;
  return Math.hypot(player.pos.x - HATCH.x, player.pos.z - HATCH.z) < r && Math.abs(player.pos.y - HATCH.y) < 3 + (S.up.winch ? 1.5 : 0);
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
  // косяк рыб рядом (только в воде)
  const school = !near && !hatch && player.swimming ? schools.near(schoolV.set(player.pos.x, player.pos.y + 1, player.pos.z)) : null;
  if (school) prompt = player.weight + ITEM.food.weight > player.capacity ? 'Косяк рядом, но груз полон' : '<b>E</b> — поймать рыбу из косяка';
  traderBoat.update(S.time, ocean.level, (x, z) => ocean.surfaceAt(x, z));
  const atTrader = !near && !hatch && !school && traderBoat.active && S.mode === 'day' && Math.hypot(player.pos.x - traderBoat.pos.x, player.pos.z - traderBoat.pos.z) < 5;
  if (atTrader) prompt = '<b>E</b> — поговорить с торговцем';
  castaway.update(dt, ocean.level, (x, z) => ocean.surfaceAt(x, z), p);
  const atRaft = !near && !hatch && !school && !atTrader && castaway.near(player.pos);
  if (atRaft) prompt = '<b>E</b> — забрать выжившего в Ковчег';
  $('prompt').innerHTML = prompt;
  $('prompt').classList.toggle('hidden', !prompt);
  if (pressed.has('KeyE')) {
    if (near) {
      const it = ITEM[near.type];
      if (player.weight + it.weight <= player.capacity) {
        takePickup(near);
        coop.act({ k: 'pick', i: city.pickups.indexOf(near) });
        player.carried.push(near.type);
        player.refreshPack();
        audio.pickup(near.type);
        if (near.type === 'relic') toast('Реликвия! Донеси её до Ковчега, чтобы прочитать.', 'relic');
      } else toast('Слишком тяжело. Сначала сдай груз в Ковчег.', 'warn');
    } else if (hatch) deposit();
    else if (atTrader) openTrader();
    else if (atRaft) {
      castaway.leave();
      S.pop++;
      audio.deposit();
      toast('Выживший держится за твой пояс — вы вместе доплывёте до Ковчега. Жителей стало на одного больше.', 'ok');
      achieve(ach.unlock('rescue'));
    }
    else if (school && player.weight + ITEM.food.weight <= player.capacity && schools.catchFrom(school)) {
      player.carried.push('food');
      player.refreshPack();
      audio.pickup('food');
      for (let i = 0; i < 10; i++) ambient.bubbles?.spawn?.(school.center.x + (Math.random() - 0.5) * 2, school.center.y, school.center.z + (Math.random() - 0.5) * 2, 0, 1 + Math.random(), 0, 1.5, 0.15);
      achieve(ach.unlock('fisher'));
      if (!S.caughtFish) { S.caughtFish = true; toast('Рыба из косяка! Косяк шарахнулся — он даёт ещё пару рыб, потом уплывёт.', 'ok'); }
    }
  }
  if (pressed.has('KeyR') && hatch) {
    if (coop.active && coop.players().length > 1) coopWait();
    else endDay('safe');
  }

  // анимация припасов
  for (const pk of city.pickups) {
    if (!pk.active) continue;
    pk.mesh.rotation.y += dt * 1.2;
    pk.mesh.position.y = pk.y + Math.sin(S.time * 2 + pk.phase) * 0.2;
    fadeBeam(pk);
  }

  schools.update(dt, S.time, ocean.level, ocean.amp);
  updateWakes(dt);
  updateDash(dt);
  tutorialTick();
  updateCombatUi(dt);
  const tev = S.mode === 'day' ? thief.update(dt, player, (x, z) => { const b = backHeight(x, z); return isFinite(b) ? city.groundAt(x, z, b + 0.4) : ocean.surfaceAt(x, z); }, S.time) : null;
  if (tev === 'warn') {
    audio.tone({ type: 'sawtooth', f0: 1400, f1: 900, dur: 0.35, vol: 0.06, lp: 3000 });
    setTimeout(() => audio.tone({ type: 'sawtooth', f0: 1500, f1: 1000, dur: 0.3, vol: 0.05, lp: 3000 }), 300);
    toast('Чайка пикирует на твою рыбу! Отгони её гарпуном — F!', 'warn');
  } else if (tev === 'steal') {
    toast('Чайка утащила рыбу из груза.', 'danger');
  }
  updateThreat();
  if (giant.update(dt, ocean.level, S.mode === 'day' && S.weather !== 'fog')) {
    audio.moan(0.35);
    if (!S.sawGiant) {
      S.sawGiant = true;
      toast('Вдали всплыл ещё один гигант. Мать отвечает ему долгим гулом — она не одна.', 'relic');
    }
  }
  updateNavigator(dt);
  updateHarpoon(dt);
  updateHolding();
  if (pressed.has('KeyG')) throwBomb();
  if (pressed.has('KeyQ')) fireFlare();
  updateBombs(dt);
  updateFlare(dt);
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
  player.lamp.intensity = p > 0.55 || player.headUnder ? 45 * (player.lampBoost || 1) : 0;
  city.hatchRing.material.opacity = 0.35 + Math.sin(S.time * 4) * 0.2 + (p > 0.75 ? 0.3 : 0);
  city.beaconLight.intensity = 40 + p * 160 + (p > 0.75 ? Math.sin(S.time * 8) * 60 : 0);
}

function updateLeeches(dt) {
  for (const L of city.leeches) {
    if (L.dead) continue;
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

    // замах перед укусом: пиявка встаёт на дыбы и наливается красным — можно отскочить или ударить
    const reach = (r) => d < r && Math.abs(player.pos.y - ly) < 1.8;
    let bite = false;
    if (!L.windup && !L.push && L.cool <= 0 && reach(2.0)) L.windup = 0.55;
    if (L.windup > 0) {
      L.windup -= dt;
      if (L.push) L.windup = 0; // удар гарпуном сбивает замах
      if (L.windup <= 0) {
        L.windup = 0;
        if (reach(1.7)) bite = true;
        else L.cool = 1.0; // промахнулась
      }
    }
    // цвет: вспышка от удара — белая, замах — красный
    if (L.mat) {
      const flash = Math.max(0, L.hitFlash || 0) * 4;
      const warn = L.windup > 0 ? 1 - L.windup / 0.55 : 0;
      L.mat.emissive.setRGB(0.16 + flash + warn * 0.5, 0.03 + flash * 0.9, 0.12 + flash * 0.9 - warn * 0.1);
      L.mat.emissiveIntensity = 0.35 + flash * 0.6 + warn * 0.9;
      // передние кольца поднимаются — пиявка встаёт на дыбы
      const rear = Math.sin(Math.min(1, warn * 1.4) * Math.PI * 0.5);
      if (L.segs[0]) L.segs[0].position.y = rear * 0.75;
      if (L.segs[1]) L.segs[1].position.y = rear * 0.35;
    }
    if (bite) {
      L.cool = 2.5;
      player.vel.x += (dx / (d || 1)) * 12;
      player.vel.z += (dz / (d || 1)) * 12;
      player.vel.y = 7;
      player.onGround = false;
      audio.hit();
      hurtPlayer(COMBAT.BITE.leech, 'leech');
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
    updateSplashes(dt);
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
      strikeBolt();
      audio.thunder();
    }
  } else if (S.weather === 'fog') {
    fogDay.lerp(FOG_COLOR, 0.6);
    skyMat.uniforms.top.value.lerp(fogDay, 0.8);
    skyMat.uniforms.horizon.value.copy(fogDay);
  } else if (S.weather === 'calm') {
    sun.intensity *= 1.1;
  }
  if (bolt) {
    // разряд мерцает и гаснет вместе со вспышкой
    const k = Math.max(0, S.flash) / 0.25;
    bolt.visible = k > 0.02 && Math.sin(S.time * 90) > -0.6;
    bolt.material.opacity = k;
  }
  if (S.flash > 0) {
    S.flash -= dt;
    hemi.intensity += 3 * Math.max(0, S.flash) / 0.25;
    skyMat.uniforms.horizon.value.lerp(new THREE.Color(0xdde8ff), Math.max(0, S.flash) * 2);
  }
}

// Брызги дождя: расходящиеся кольца на земле и воде вокруг игрока.
// Прозрачность — через цвет экземпляра при сложении цветов (чёрный = невидим)
const SPLASH_N = 90;
const splashes = new THREE.InstancedMesh(
  new THREE.RingGeometry(0.75, 1, 16).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }),
  SPLASH_N,
);
splashes.frustumCulled = false;
splashes.count = 0;
scene.add(splashes);
const splashLife = new Float32Array(SPLASH_N);
const splashPos = new Float32Array(SPLASH_N * 3);
const splashM = new THREE.Matrix4();
const splashC = new THREE.Color();
function updateSplashes(dt) {
  const show = rain.visible;
  splashes.count = show ? SPLASH_N : 0;
  if (!show) return;
  for (let i = 0; i < SPLASH_N; i++) {
    splashLife[i] -= dt * 2.2;
    if (splashLife[i] <= 0) {
      splashLife[i] = 0.6 + Math.random() * 0.4;
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.sqrt(Math.random()) * 16;
      const x = player.pos.x + Math.cos(a) * r;
      const z = player.pos.z + Math.sin(a) * r;
      const bh = backHeight(x, z);
      const water = ocean.surfaceAt(x, z);
      splashPos[i * 3] = x;
      splashPos[i * 3 + 1] = Math.max(isFinite(bh) ? city.groundAt(x, z, bh + 0.4) : -1e9, water) + 0.04;
      splashPos[i * 3 + 2] = z;
    }
    const k = splashLife[i];
    const size = 0.05 + (1 - k) * 0.35;
    splashM.makeScale(size, 1, size).setPosition(splashPos[i * 3], splashPos[i * 3 + 1], splashPos[i * 3 + 2]);
    splashes.setMatrixAt(i, splashM);
    splashes.setColorAt(i, splashC.setScalar(Math.max(0, k) * 0.55));
  }
  splashes.instanceMatrix.needsUpdate = true;
  if (splashes.instanceColor) splashes.instanceColor.needsUpdate = true;
}

// Стрелка угрозы у края экрана: охотящийся глубинник ближе 35 м
const threatV = new THREE.Vector3();
function updateThreat() {
  const el = $('threat');
  let best = null;
  let bd = 35;
  for (const d of deeplings) {
    if (!d.active || !d.hunting) continue;
    const dd = d.pos.distanceTo(player.pos);
    if (dd < bd) { bd = dd; best = d; }
  }
  if (!best || S.mode !== 'day' && S.mode !== 'closing') { el.classList.add('hidden'); return; }
  // направление в координатах камеры: вправо/вверх по экрану
  threatV.copy(best.pos).sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
  const onScreen = threatV.z < 0 && Math.abs(threatV.x / -threatV.z) < 0.9 && Math.abs(threatV.y / -threatV.z) < 0.5;
  if (onScreen) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const rx = innerWidth * 0.42;
  const ry = innerHeight * 0.38;
  const a2 = Math.atan2(threatV.y, threatV.x);
  el.style.transform = `translate(${Math.cos(a2) * rx}px, ${-Math.sin(a2) * ry}px)`;
  el.firstChild.style.transform = `rotate(${Math.PI / 2 - a2}rad) scale(${1.4 - bd / 50})`;
}

// Подсказки первого дня: чек-лист, отмечается по ходу игры
const TUTORIAL = [
  ['pick', 'Подбери рыбу или бочку ворвани — <b>E</b>'],
  ['hatch', 'Принеси груз к шлюзу Ковчега — светящееся кольцо, пунктир ведёт туда'],
  ['deposit', 'Сдай груз — <b>E</b> у шлюза'],
  ['more', 'Собери на ночь: еду и ворвань (справа вверху — сколько нужно)'],
  ['shelter', 'До последнего гудка укройся в Ковчеге — <b>R</b> у шлюза'],
];
const tut = { on: false, done: new Set() };
function tutorialStart() {
  tut.on = S.cycle === 1 && !settings.tutorialDone && !coop.isGuest;
  tut.done.clear();
  $('tutorial').classList.toggle('hidden', !tut.on);
  renderTutorial();
}
function tutorialMark(id) {
  if (!tut.on || tut.done.has(id)) return;
  tut.done.add(id);
  renderTutorial();
}
function renderTutorial() {
  if (!tut.on) return;
  const ol = $('tutorial').querySelector('ol');
  ol.innerHTML = '';
  let nowSet = false;
  for (const [id, text] of TUTORIAL) {
    const li = document.createElement('li');
    li.innerHTML = text;
    if (tut.done.has(id)) li.className = 'done';
    else if (!nowSet) { li.className = 'now'; nowSet = true; }
    ol.appendChild(li);
  }
}
function tutorialFinish() {
  if (!tut.on) return;
  tut.on = false;
  $('tutorial').classList.add('hidden');
  settings.tutorialDone = true;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* приватное окно */ }
}
function tutorialTick() {
  if (!tut.on) return;
  if (player.carried.length) tutorialMark('pick');
  if (inHatch() && player.carried.length) tutorialMark('hatch');
  if (S.food >= needFood() && S.fuel >= needFuel()) tutorialMark('more');
}

// Круги на воде от ныряльщика: бредёт по мелководью или плывёт у поверхности
const WAKE_N = 28;
const wakes = new THREE.InstancedMesh(
  new THREE.RingGeometry(0.82, 1, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  WAKE_N,
);
wakes.frustumCulled = false;
wakes.count = WAKE_N;
scene.add(wakes);
const wakeLife = new Float32Array(WAKE_N);
const wakePos = new Float32Array(WAKE_N * 3);
let wakeNext = 0;
let wakeT = 0;
function updateWakes(dt) {
  const surf = ocean.surfaceAt(player.pos.x, player.pos.z);
  const depth = surf - player.pos.y; // >0 — ноги в воде
  const speed = Math.hypot(player.vel.x, player.vel.z);
  const atSurface = depth > 0.15 && depth < 2.4; // бредёт или плывёт, голова над водой
  wakeT -= dt;
  if (atSurface && speed > 1 && wakeT <= 0) {
    wakeT = 0.16;
    const i = wakeNext++ % WAKE_N;
    wakeLife[i] = 1;
    wakePos[i * 3] = player.pos.x - player.vel.x * 0.05;
    wakePos[i * 3 + 1] = surf + 0.03;
    wakePos[i * 3 + 2] = player.pos.z - player.vel.z * 0.05;
    if (Math.random() < 0.5) ambient.spray.spawn(player.pos.x, surf + 0.1, player.pos.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.6, 0.12);
  }
  // освещение кругов: ночью тусклее
  const light = 0.25 + 0.75 * Math.max(0, Math.min(1, sunDir.y * 4 + 0.3));
  for (let i = 0; i < WAKE_N; i++) {
    if (wakeLife[i] > 0) wakeLife[i] -= dt * 0.8;
    const k = Math.max(0, wakeLife[i]);
    const size = 0.3 + (1 - k) * 1.6;
    splashM.makeScale(size, 1, size).setPosition(wakePos[i * 3], k > 0 ? ocean.surfaceAt(wakePos[i * 3], wakePos[i * 3 + 2]) + 0.03 : -9999, wakePos[i * 3 + 2]);
    wakes.setMatrixAt(i, splashM);
    wakes.setColorAt(i, splashC.setScalar(k * 0.45 * light));
  }
  wakes.instanceMatrix.needsUpdate = true;
  if (wakes.instanceColor) wakes.instanceColor.needsUpdate = true;
}

// Молния: ломаный канал с ответвлениями бьёт в море в 150–400 м от игрока
let bolt = null;
const boltMat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, fog: false, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
function boltPath(from, to, steps, jag) {
  const pts = [from.clone()];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = from.clone().lerp(to, t);
    p.x += (Math.random() - 0.5) * jag;
    p.z += (Math.random() - 0.5) * jag;
    pts.push(p);
  }
  pts.push(to.clone());
  return pts;
}
function strikeBolt() {
  if (bolt) {
    scene.remove(bolt);
    bolt.traverse((m) => m.geometry && m.geometry.dispose());
  }
  const a = Math.random() * Math.PI * 2;
  const d = 150 + Math.random() * 250;
  const ground = new THREE.Vector3(player.pos.x + Math.cos(a) * d, ocean.level, player.pos.z + Math.sin(a) * d);
  const top = ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, 160, (Math.random() - 0.5) * 60));
  const main = boltPath(top, ground, 18, 22);
  const geos = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(main, false, 'catmullrom', 0), 64, 0.9, 4)];
  for (let b = 0; b < 3; b++) {
    const i = 3 + Math.floor(Math.random() * 10);
    const start = main[i];
    const end = start.clone().add(new THREE.Vector3((Math.random() - 0.5) * 70, -30 - Math.random() * 40, (Math.random() - 0.5) * 70));
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(boltPath(start, end, 7, 12), false, 'catmullrom', 0), 24, 0.45, 4));
  }
  bolt = new THREE.Mesh(mergeGeos(geos), boltMat);
  bolt.frustumCulled = false;
  scene.add(bolt);
}
function mergeGeos(geos) {
  const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()));
  geos.forEach((g) => g.dispose());
  return merged;
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
  if (pressed.has('KeyM')) {
    // карта с легендой → только карта → ничего → снова с легендой
    const h = $('hud').classList;
    S.mapMode = ((S.mapMode ?? (h.contains('nolegend') ? 1 : 0)) + 1) % 3;
    S.mapChosen = true;
    h.toggle('nolegend', S.mapMode === 1);
    h.toggle('nomap', S.mapMode === 2);
  }
  // H — фото-режим: спрятать весь интерфейс
  if (pressed.has('KeyH')) {
    document.body.classList.toggle('photo');
    toast(document.body.classList.contains('photo') ? 'Фото-режим: интерфейс скрыт (H — вернуть).' : 'Интерфейс снова виден.');
  }
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
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const nx = dots[Math.min(i + 1, dots.length - 1)];
      const pv = dots[Math.max(i - 1, 0)];
      const bh = backHeight(d.x, d.z);
      const y = isFinite(bh) ? city.groundAt(d.x, d.z, bh + 0.4) + 0.07 : ocean.surfaceAt(d.x, d.z) + 0.15;
      // остриё — вдоль маршрута; у самой камеры стрелки мельче, чтобы не заслонять кадр
      navQ.setFromAxisAngle(navUp, Math.atan2(-(nx.x - pv.x), -(nx.z - pv.z)));
      const dc = Math.hypot(d.x - camera.position.x, y - camera.position.y, d.z - camera.position.z);
      navS.setScalar(Math.min(1.2, Math.max(0.35, (dc - 1) / 4)));
      navM.compose(navP.set(d.x, y, d.z), navQ, navS);
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
    extras: [
      ...(traderBoat.active ? [{ x: traderBoat.pos.x, z: traderBoat.pos.z, kind: 'trader' }] : []),
      ...(castaway.active ? [{ x: castaway.pos.x, z: castaway.pos.z, kind: 'castaway' }] : []),
      ...schools.list.filter((sc) => !sc.gone && sc.left > 0).map((sc) => ({ x: sc.center.x, z: sc.center.z, kind: 'school' })),
    ],
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
  setRegion('open');
  schools.reset(0, Math.random);
  traderBoat.leave();
  castaway.leave();
  city.generate(S.runSeed + 1013, 1, S.lore, LORE.length, { keepsake: q?.kind === 'keepsake' });
  navGrid = NAV.buildGrid((x, z) => backU(x, z) >= 0.97 || city.overlaps(x, z, 0.8));
  intro.cams = null;
  setupShowcase();
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
  player.walkMul = 1;
  $('cine-labels').innerHTML = '';
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
// ---- Камера ролика не упирается в дома ----
// Видно ли цель из точки a: отрезок не проходит сквозь постройки и спину Матери
// столб света над реликвией виден издалека, но вблизи гаснет — иначе он заливает полэкрана
function fadeBeam(pk) {
  const beam = pk.mesh.userData.beam;
  if (!beam) return;
  const d = Math.hypot(camera.position.x - pk.x, camera.position.z - pk.z);
  beam.material.opacity = 0.16 * Math.min(1, Math.max(0, (d - 3) / 14));
  beam.visible = beam.material.opacity > 0.003;
}
function lineClear(a, b) {
  // постройка, внутри которой стоит сама цель (Ковчег), — это и есть объект съёмки
  const own = city.colliders.filter((c) => (c.type === 'box'
    ? b[0] > c.minX && b[0] < c.maxX && b[2] > c.minZ && b[2] < c.maxZ
    : Math.hypot(b[0] - c.x, b[2] - c.z) < c.r));
  for (let i = 1; i < 28; i++) {
    const t = i / 28;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    if (t < 0.97 && y < backHeight(x, z) + 0.25) return false;
    for (const q of city.archPoints) {
      if (Math.abs(x - q[0]) < 1.2 && Math.abs(y - q[1]) < 1.2 && Math.abs(z - q[2]) < 1.2) return false;
    }
    for (const c of city.colliders) {
      if (own.includes(c)) continue;
      if (c.type === 'box') {
        if (x > c.minX - 0.4 && x < c.maxX + 0.4 && z > c.minZ - 0.4 && z < c.maxZ + 0.4 && y < c.top + 0.6) return false;
      } else if (Math.hypot(x - c.x, z - c.z) < c.r + 0.4 && y < c.topAt(x, z) + 0.6) return false;
    }
  }
  return true;
}
// Рядом с камерой не должно быть стен, столбов и верёвок, которые закроют край кадра
function cameraRoomy(c, r = 2.6) {
  for (const q of city.archPoints) {
    if (Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]) < r + 1.2) return false;
  }
  for (const k of city.colliders) {
    if (k.type !== 'box') continue;
    const dx = Math.max(k.minX - c[0], 0, c[0] - k.maxX);
    const dz = Math.max(k.minZ - c[2], 0, c[2] - k.maxZ);
    if (Math.hypot(dx, dz) < r && k.top > c[1] - 2) return false;
  }
  return true;
}
// Ищем ракурс вокруг цели: сначала в желаемую сторону, потом всё дальше от неё и выше.
// extra — дополнительные точки, которые тоже должны быть видны (например, оба предмета).
function clearShot(target, dist, height, pref, extra = []) {
  const T = [target.x, target.y, target.z];
  for (const h of [height, height * 1.6 + 1, height * 2.5 + 2]) {
    for (let k = 0; k < 16; k++) {
      const a = pref + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      const c = [target.x + Math.sin(a) * dist, target.y + h, target.z + Math.cos(a) * dist];
      if (c[1] < backHeight(c[0], c[2]) + 0.6) continue;
      if (!cameraRoomy(c, Math.min(2.6, dist * 0.45))) continue;
      if (lineClear(c, T) && extra.every((e) => lineClear(c, e))) return c;
    }
  }
  return [target.x + Math.sin(pref) * dist, target.y + height * 3 + 6, target.z + Math.cos(pref) * dist];
}
const angleOf = (c, t) => Math.atan2(c[0] - t.x, c[2] - t.z);
// пара точек «издалека → ближе», обе с чистым видом и с одной стороны
function shotPair(target, far, farH, near, nearH, pref, extra = []) {
  const a = clearShot(target, far, farH, pref, extra);
  const T = [target.x, target.y, target.z];
  // пролёт камеры от a к b должен быть чистым: ни стен на пути, ни арок у самого объектива
  const flightOk = (b) => {
    for (let i = 1; i <= 6; i++) {
      const m = CUT.lerp3(a, b, i / 6);
      if (!lineClear(m, T) || !cameraRoomy(m, 1.2)) return false;
    }
    return extra.every((e) => lineClear(b, e));
  };
  const b = clearShot(target, near, nearH, angleOf(a, target), extra);
  if (flightOk(b)) return [a, b];
  // иначе — наезд по уже проверенному лучу a→цель: сколько получится без помех
  const da = Math.hypot(a[0] - T[0], a[1] - T[1], a[2] - T[2]);
  const want = Math.max(0, 1 - Math.hypot(near, nearH) / da);
  for (const f of [want, want * 0.75, want * 0.5, want * 0.25, 0.08]) {
    const d = [a[0] + (T[0] - a[0]) * f, a[1] + (T[1] - a[1]) * f, a[2] + (T[2] - a[2]) * f];
    if (flightOk(d)) return [a, d];
  }
  return [a, a];
}

// Витрина для сцены «что собирать»: рыба и бочка на открытом месте рядом со шлюзом
function setupShowcase() {
  for (let r = 18; r < 50; r += 3) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.sin(a) * r * 0.6;
      const z = HATCH.z + Math.cos(a) * r;
      if (backU(x, z) > 0.55 || city.overlaps(x, z, 4.5)) continue;
      if (city.pickups.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue;
      if (city.archPoints.some((q) => Math.hypot(q[0] - x, q[2] - z) < 8)) continue; // арка заслонит кадр
      const before = city.pickups.length;
      city.addPickup('food', x - 1.4, z);
      city.addPickup('fuel', x + 1.4, z);
      intro.showFood = city.pickups[before];
      intro.showFuel = city.pickups[before + 1];
      intro.show = { x, y: city.groundAt(x, z) + 0.9, z };
      return;
    }
  }
  intro.show = { x: HATCH.x, y: HATCH.y + 1, z: HATCH.z + 6 };
}

function planShot(shot) {
  const cams = {};
  if (shot.id === 'you') {
    const g = city.groundAt(0, 14.5);
    const [far, near] = shotPair({ x: 0, y: g + 1.5, z: 14.5 }, 9, 2.2, 3.4, 0.35, 0.5);
    cams['player-back'] = far;
    cams['player-face'] = near;
  } else if (shot.id === 'relic') {
    const r = introRelic();
    const [far, near] = shotPair({ x: r.x, y: r.y, z: r.z }, 14, 6, 4.4, 1.4, Math.atan2(r.ox, r.oz));
    cams['relic-far'] = far;
    cams['relic-near'] = near;
  } else if (shot.id === 'task') {
    const s = intro.show;
    // предметы стоят вдоль оси X — снимаем поперёк, чтобы оба были видны рядом
    const t = { x: s.x, y: s.y, z: s.z };
    const items = [intro.showFood, intro.showFuel].filter(Boolean).map((p) => [p.x, p.y, p.z]);
    let [far, near] = shotPair(t, 10, 5, 5.2, 1.3, 0, items);
    if (Math.abs(Math.sin(angleOf(near, t))) > 0.6) [far, near] = shotPair(t, 10, 5, 5.2, 1.3, Math.PI, items);
    cams['show-far'] = far;
    cams['show-near'] = near;
  } else if (shot.id === 'breath') {
    const t = { x: BLOWHOLE.x, y: BLOWHOLE.y + 3, z: BLOWHOLE.z };
    const [far, near] = shotPair(t, 28, 11, 21, 8, 0.55);
    cams['breath-far'] = far;
    cams['breath-near'] = near;
  } else if (shot.id === 'night') {
    // Ковчег и глубинник, проплывающий перед ним
    const t = { x: 0, y: 17.5, z: 0 };
    const [far, near] = shotPair(t, 34, 4, 24, 3, 0.75, [[0, 21, 16]]);
    cams['night-far'] = far;
    cams['night-near'] = near;
  } else if (shot.id === 'hatch') {
    const t = { x: HATCH.x, y: HATCH.y + 1.2, z: HATCH.z };
    const [far, near] = shotPair(t, 18, 8, 7.5, 2.4, 0.25);
    cams['hatch-far'] = far;
    cams['hatch-near'] = near;
  }
  intro.cams = cams;
}

// Точка из сценария: готовые координаты или «ключ» (игрок, реликвия, витрина, шлюз)
function introPoint(spec) {
  if (Array.isArray(spec)) return spec;
  if (intro.cams && intro.cams[spec]) return intro.cams[spec];
  const p = player.pos;
  const r = introRelic();
  switch (spec) {
    case 'player-head': return [p.x, p.y + 1.55, p.z];
    case 'relic': return [r.x, r.y, r.z];
    case 'show': return intro.show ? [intro.show.x, intro.show.y, intro.show.z] : [0, 16, 20];
    case 'hatch': return [HATCH.x, HATCH.y + 1.2, HATCH.z];
    default: return [0, 0, 0];
  }
}

// Подписи поверх кадра: что за предмет или место сейчас показывают
const LABELS = {
  food: { text: '🐟 Рыба — еда для жителей', at: () => intro.showFood && [intro.showFood.x, intro.showFood.y + 2.1, intro.showFood.z] },
  fuel: { text: '🛢️ Ворвань — топливо на ночь', at: () => intro.showFuel && [intro.showFuel.x, intro.showFuel.y + 1.1, intro.showFuel.z] },
  hatch: { text: 'Шлюз Ковчега — сюда нести груз', at: () => [HATCH.x, HATCH.y + 2.6, HATCH.z] },
};
const labelV = new THREE.Vector3();
function showLabels(shot) {
  const box = $('cine-labels');
  box.innerHTML = '';
  for (const key of shot.labels || []) {
    const el = document.createElement('div');
    el.className = 'cine-label';
    el.dataset.key = key;
    el.textContent = LABELS[key].text;
    box.appendChild(el);
  }
}
function updateLabels(k) {
  for (const el of $('cine-labels').children) {
    const p = LABELS[el.dataset.key].at();
    if (!p) continue;
    labelV.set(p[0], p[1], p[2]).project(camera);
    const vis = labelV.z < 1 && Math.abs(labelV.x) < 1.1 && Math.abs(labelV.y) < 1.1;
    el.style.opacity = vis ? Math.min(1, Math.max(0, (k - 0.12) * 5)) : 0;
    el.style.left = `${((labelV.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - labelV.y) / 2) * window.innerHeight}px`;
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
  else if (voice.has(shot.id)) voice.play(shot.id); // сцена без своей фразы не обрывает предыдущую
  planShot(shot);
  showLabels(shot);
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
    player.walkMul = 0.3; // в ролике ныряльщик выходит из шлюза неспешно
    intro.walk = 2.4;
  }
  if (shot.id === 'hatch') S.navTimer = 0;
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
    fadeBeam(pk);
  }
  updateBlowhole(sdt, p);
  updateAmbient(sdt, p);
  if (s.id === 'night') {
    // глубинник проплывает мимо светящегося Ковчега
    introFake.pos.set(CUT.lerp(-26, 30, st.k), 21 + Math.sin(st.k * 6) * 1.5, CUT.lerp(18, 14, st.k));
    deeplings[0].update(sdt, introFake, ocean, true, 2.5);
  }
  updateLabels(st.k);
  if (s.id === 'hatch') updateNavigator(sdt);
  else navDots.count = 0;
  cameraEnv(s.id === 'night' ? 1 : p);
}

// ============ Ночь в Ковчеге ============
const ark = new ArkInterior(TEX);
const arkWorld = {
  get colliders() { return ark.colliders; },
  ocean: { surfaceAt: () => -1000, level: -1000 },
  current: 0,
  groundAt: () => 0,
  wind: null,
};
let arkPlayerCamPitch = 0.3;
let arkCamY = null;

function enterArk() {
  arkCamY = null;
  S.mode = 'ark';
  S.paused = false;
  S.savedToday = false;
  ark.setup(S.alive, S.pop);
  ark.scene.add(player.mesh);
  player.reset(new THREE.Vector3(0, 0, ARK_R * 0.7));
  player.facing = 0;
  player.mesh.rotation.set(0, 0, 0);
  yaw = 0;
  pitch = arkPlayerCamPitch;
  post.setScene(ark.scene);
  navDots.count = 0;
  rain.visible = false;
  $('hud').classList.add('hidden');
  $('arkhud').classList.remove('hidden');
  $('ark-title').textContent = `Ковчег · ночь ${S.cycle}`;
  audio.setUnderwater(false);
  lockPointer();
  arkToast(`Жители ждут тебя. Механик Тагир — улучшения, Бран — оружие, Оск — летопись (сохранение). Ложись спать в своём гамаке.`);
}

function arkToast(text) {
  const el = $('ark-hint');
  el.textContent = text;
  el.classList.remove('fade');
  void el.offsetWidth;
  el.classList.add('fade');
}

function leaveArk() {
  scene.add(player.mesh);
  post.setScene(scene);
  $('arkhud').classList.add('hidden');
  $('ark-labels').innerHTML = '';
  S.cycle++;
  startDay();
}

function sleep() {
  if (!S.savedToday) {
    S.paused = true;
    showModal({
      title: 'Лечь спать?',
      body: 'Этот день не записан в летопись Оска. Если закрыть игру утром, прогресс с прошлой записи будет потерян.',
      buttons: [
        { label: 'Лечь без записи', onClick: () => { S.paused = false; leaveArk(); } },
        { label: 'Вернуться', onClick: () => { S.paused = false; lockPointer(); } },
      ],
    });
    return;
  }
  leaveArk();
}

function resumeArk() {
  S.paused = false;
  lockPointer();
}

function openStation(st) {
  S.paused = true;
  const alive = st.who ? S.alive.includes(st.who) : true;
  if (st.kind === 'workshop' || st.kind === 'armory') {
    const ownerId = st.kind === 'workshop' ? 'tagir' : 'bran';
    const owner = RESIDENTS.find((r) => r.id === ownerId);
    const here = S.alive.includes(ownerId);
    const intro = here ? NIGHT_ROLES[ownerId].greet : `${owner.name} больше нет. Всё лежит так, как он оставил, — бери, что нужно, и клади обломки на место.`;
    showModal({
      title: st.kind === 'workshop' ? `Мастерская · ${here ? owner.name : 'верстак'}` : `Оружейная · ${here ? owner.name : 'стойка'}`,
      body: shopGrid(intro, st.kind === 'workshop' ? workshopItems : armoryItems),
      wide: true,
      buttons: [{ label: 'Отойти', onClick: resumeArk }],
    });
  } else if (st.kind === 'chronicle' && coop.isGuest) {
    showModal({ title: 'Летопись', body: 'Летопись этой комнаты ведёт хост: он записывает день за всех.', buttons: [{ label: 'Отойти', onClick: resumeArk }] });
  } else if (st.kind === 'bed' && coop.isGuest) {
    S.paused = false;
    coop.sleep();
    arkToast('Ты лёг в гамак. Утро начнётся, когда хост ляжет спать.');
  } else if (st.kind === 'chronicle') {
    const here = S.alive.includes('osk');
    showModal({
      title: here ? 'Летопись · Советник Оск' : 'Летопись',
      body: `${here ? NIGHT_ROLES.osk.greet : 'Книгу Совета теперь ведёт тот, кто остался. Перо ещё не высохло.'}\n\nДень ${S.cycle}. Жителей: ${S.pop}. Запасы: 🐟 ${S.food} · 🛢️ ${S.fuel}. Реликвий: ${S.lore}/${LORE.length}.${S.savedToday ? '\n\nЭтот день уже записан.' : ''}`,
      buttons: [
        { label: 'Записать день', onClick: () => {
          S.cycle++;
          saveGame(); // запись — это утро следующего дня
          S.cycle--;
          S.savedToday = true;
          audio.deposit();
          arkToast('День записан в летопись. Утром можно будет продолжить отсюда.');
          resumeArk();
        } },
        { label: 'Отойти', onClick: resumeArk },
      ],
    });
  } else if (st.kind === 'bed') {
    S.paused = false;
    sleep();
  } else {
    const W = WEATHER[rollWeather(mulberry32(S.runSeed + (S.cycle + 1) * 7919), S.cycle + 1)];
    const line = nightLine(st.who, { weatherName: W.name, weatherNote: W.note, lore: S.lore, oxySeconds: Math.round(player.oxyTime), bombs: S.arms.bombs, pop: S.pop });
    showModal({ title: st.label, body: alive ? line : '…', buttons: [{ label: 'Отойти', onClick: resumeArk }] });
  }
}

const arkLabelV = new THREE.Vector3();
function updateArk(dt) {
  if (keys.has('ArrowLeft')) yaw += dt * 2;
  if (keys.has('ArrowRight')) yaw -= dt * 2;
  player.update(dt, keys, yaw, arkWorld);
  // стены зала
  const r = Math.hypot(player.pos.x, player.pos.z);
  if (r > ARK_R - 0.7) {
    player.pos.x *= (ARK_R - 0.7) / r;
    player.pos.z *= (ARK_R - 0.7) / r;
    player.mesh.position.copy(player.pos);
  }
  ark.update(dt, player.pos);
  const st = ark.nearest(player.pos.x, player.pos.z);
  const verb = st && { workshop: 'улучшения', armory: 'оружие', chronicle: 'записать день', bed: 'лечь спать', talk: 'поговорить' }[st.kind];
  $('ark-prompt').innerHTML = st ? `<b>E</b> — ${st.label}: ${verb}` : '';
  $('ark-prompt').classList.toggle('hidden', !st);
  $('ark-stats').textContent = `👥 ${S.pop} · 🐟 ${S.food} · 🛢️ ${S.fuel} · ⚙️ ${S.scrap} · ◈ ${S.lore}/7`;
  if (pressed.has('KeyE') && st) openStation(st);
  if (pressed.has('KeyJ')) showJournal();

  // камера: внутри зала, под куполом
  // дальше и выше, чем на улице: видно и ныряльщика, и тех, с кем он говорит
  const dist = 6.2;
  const pit = Math.max(pitch, 0.32);
  camTarget.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
  let cx = camTarget.x + Math.sin(yaw) * Math.cos(pit) * dist;
  let cz = camTarget.z + Math.cos(yaw) * Math.cos(pit) * dist;
  let cy = Math.min(6.4, Math.max(0.6, camTarget.y + Math.sin(pit) * dist));
  const cr = Math.hypot(cx, cz);
  // у стены камера не прижимается к спине, а поднимается и смотрит сверху
  if (cr > ARK_R - 0.5) {
    const lost = cr - (ARK_R - 0.5);
    cx *= (ARK_R - 0.5) / cr;
    cz *= (ARK_R - 0.5) / cr;
    cy = Math.min(6.4, cy + lost * 0.9);
  }
  // если между ныряльщиком и камерой печь, житель или мебель — камера подъезжает ближе
  // сначала камера пробует подняться над помехой, и лишь потом подъезжает ближе
  const freeK = (hy) => {
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      const x = camTarget.x + (cx - camTarget.x) * t;
      const z = camTarget.z + (cz - camTarget.z) * t;
      const y = camTarget.y + (hy - camTarget.y) * t;
      if (ark.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.35 && y < c.topAt(x, z) + 0.4)) return Math.max(0.3, (i - 1) / 24);
    }
    return 1;
  };
  let k = 1;
  for (const hy of [cy, cy + 1.5, 6.4]) {
    k = freeK(Math.min(6.4, hy));
    if (k === 1) { cy = Math.min(6.4, hy); break; }
  }
  if (k < 1) cy = 6.4; // k посчитан для самой высокой точки
  // плавно, без рывков при переходе между высотами
  arkCamY = arkCamY == null ? cy : arkCamY + (cy - arkCamY) * Math.min(1, dt * 4);
  cy = arkCamY;
  camera.position.set(camTarget.x + (cx - camTarget.x) * k, camTarget.y + (cy - camTarget.y) * k, camTarget.z + (cz - camTarget.z) * k);
  camera.lookAt(camTarget);

  // имена над жителями
  const box = $('ark-labels');
  if (box.children.length !== ark.stations.length) {
    box.innerHTML = '';
    for (const s of ark.stations) {
      const el = document.createElement('div');
      el.className = 'ark-label' + (s.person ? ' person' : '');
      el.textContent = s.label;
      box.appendChild(el);
    }
  }
  ark.stations.forEach((s, i) => {
    const el = box.children[i];
    arkLabelV.set(s.x, s.person ? 2.35 : 2.1, s.z).project(camera);
    const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
    const vis = arkLabelV.z < 1 && d < 9;
    el.style.opacity = vis ? Math.max(0, Math.min(1, (9 - d) / 3)) : 0;
    el.style.left = `${((arkLabelV.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - arkLabelV.y) / 2) * window.innerHeight}px`;
  });
}

// ============ Оружие ============
// 1/2/3 — взять в руку, ЛКМ — использовать, X — убрать. F/G/Q — быстро, без доставания.
const HELD_NAMES = { spear: 'острога', harpoon: 'гарпун', bombs: 'солевая бомба', flare: 'ракетница' };
function hold(kind) {
  if (kind === 'bombs' && S.arms.bombs <= 0) { toast('Солевых бомб нет. Бран продаёт их ночью в Ковчеге.', 'warn'); return; }
  if (kind === 'flare' && !S.arms.flare) { toast('Ракетницы нет. Бран продаёт её ночью в Ковчеге.', 'warn'); return; }
  S.held = kind;
  player.held = kind;
  toast(`В руке: ${kind === 'spear' ? (S.arms.spear ? 'острога' : 'гарпун') : HELD_NAMES[kind]}. ЛКМ — использовать, X — убрать.`);
}
function holster() {
  if (!S.held) return;
  S.held = null;
  player.held = null;
  toast('Оружие убрано.');
}
function useHeld() {
  if (S.held === 'spear') strike();
  else if (S.held === 'bombs') {
    throwBomb();
    if (S.arms.bombs <= 0) holster();
  } else if (S.held === 'flare') fireFlare();
}
function updateHolding() {
  if (pressed.has('Digit1')) hold('spear');
  if (pressed.has('Digit2')) hold('bombs');
  if (pressed.has('Digit3')) hold('flare');
  if (pressed.has('KeyX')) holster();
}

// Подсказка после покупки оружия: 30 секунд у левого края, меню сдвигаются вправо
let armsHintTimer = null;
function showArmsHint() {
  const el = $('arms-hint');
  el.classList.remove('hidden');
  document.body.classList.add('has-arms-hint');
  const bar = $('arms-hint-bar');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
  clearTimeout(armsHintTimer);
  armsHintTimer = setTimeout(() => {
    el.classList.add('hidden');
    document.body.classList.remove('has-arms-hint');
  }, 30000);
}
const bombGeo = new THREE.SphereGeometry(0.2, 10, 8);
const bombMat = new THREE.MeshStandardMaterial({ color: 0xeeeadc, roughness: 1 });
function throwBomb() {
  if (S.arms.bombs <= 0) { toast('Солевых бомб нет. Бран продаёт их ночью в Ковчеге.', 'warn'); return; }
  S.arms.bombs--;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const mesh = new THREE.Mesh(bombGeo, bombMat);
  mesh.position.set(player.pos.x + fx * 0.6, player.pos.y + 1.6, player.pos.z + fz * 0.6);
  mesh.castShadow = true;
  scene.add(mesh);
  S.bombsInAir.push({ mesh, vel: new THREE.Vector3(fx * 8, 6, fz * 8), t: 0 }); // летит метров на шесть
  player.facing = yaw;
  audio.tone({ type: 'triangle', f0: 500, f1: 260, dur: 0.2, vol: 0.12 });
}

function explodeBomb(b) {
  const c = b.mesh.position;
  scene.remove(b.mesh);
  audio.tone({ type: 'sawtooth', f0: 140, f1: 40, dur: 0.6, vol: 0.25, lp: 900 });
  audio.blow();
  for (let i = 0; i < 40; i++) {
    ambient.spray.spawn(c.x, c.y + 0.3, c.z, (Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.5) * 7, 1.2, 0.5 + Math.random() * 0.5);
  }
  const hit = ARMS.inBlast({ x: c.x, z: c.z }, city.leeches);
  for (const i of hit) hitEnemy(city.leeches[i], 'leech', COMBAT.weaponDamage('bomb'));
  for (const D of deeplings) {
    if (!D.active || D.pos.distanceTo(c) >= ARMS.BOMB_SCARE_RADIUS) continue;
    if (D.pos.distanceTo(c) < ARMS.BOMB_RADIUS + 2) hitEnemy(D, 'deepling', COMBAT.weaponDamage('bomb'));
    else D.scare();
  }
  if (hit.length) toast(hit.length === 1 ? 'Соль сожгла пиявку!' : `Соль сожгла пиявок: ${hit.length}!`, 'ok');
}

function updateBombs(dt) {
  for (const b of S.bombsInAir) {
    b.t += dt;
    b.vel.y -= 20 * dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    b.mesh.rotation.x += dt * 8;
    const p = b.mesh.position;
    const g = city.groundAt(p.x, p.z, p.y + 0.5);
    if (p.y <= g + 0.15 || p.y <= ocean.surfaceAt(p.x, p.z) || b.t > 2.5) b.done = true;
  }
  for (const b of S.bombsInAir) if (b.done) explodeBomb(b);
  S.bombsInAir = S.bombsInAir.filter((b) => !b.done);
}

function fireFlare() {
  if (!S.arms.flare) { toast('Ракетницы нет. Бран продаёт её ночью в Ковчеге.', 'warn'); return; }
  if (!S.arms.flareReady) { toast('Ракетница перезарядится к утру.', 'warn'); return; }
  S.arms.flareReady = false;
  audio.tone({ type: 'sawtooth', f0: 220, f1: 1400, dur: 0.7, vol: 0.15, lp: 3000 });
  const light = new THREE.PointLight(0xff4a3a, 220, 70, 1.4);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb0a0 }));
  light.add(core);
  light.position.set(player.pos.x, player.pos.y + 2, player.pos.z);
  scene.add(light);
  S.flare = { light, t: 0 };
  for (const D of deeplings) if (D.active && D.pos.distanceTo(player.pos) < ARMS.FLARE_RADIUS * 1.5) { D.scare(); D.flee = 20; }
  let n = 0;
  for (const L of city.leeches) {
    if (!L.dead && Math.hypot(L.x - player.pos.x, L.z - player.pos.z) < ARMS.FLARE_RADIUS) { L.cool = 14; n++; }
  }
  toast(`Сигнальная ракета! Глубинники ушли на глубину${n ? `, пиявки уснули: ${n}` : ''}.`, 'ok');
}

function updateFlare(dt) {
  const f = S.flare;
  if (!f) return;
  f.t += dt;
  f.light.position.y += dt * (f.t < 1.5 ? 18 : -1.5);
  f.light.intensity = 220 * Math.max(0, 1 - f.t / 12) * (0.85 + Math.random() * 0.3);
  if (f.t > 12) {
    scene.remove(f.light);
    S.flare = null;
  }
}

function killLeech(L, remote = false) {
  if (L.dead) return;
  if (!remote) {
    coop.act({ k: 'kill', i: city.leeches.indexOf(L) });
    achieve(ach.leechKilled());
  }
  L.dead = true;
  city.group.remove(L.mesh);
  for (let i = 0; i < 14; i++) ambient.spray.spawn(L.x, L.mesh.position.y + 0.3, L.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.8, 0.3);
}

const HARPOON_CD = [1.6, 1.1, 0.7];
function updateHarpoon(dt) {
  S.harpoonCd -= dt;
  if (pressed.has('KeyF')) strike();
  if (pressed.has('KeyT')) throwHarpoon();
  updateThrow(dt);
}

// ---- Гарпун на тросе: летит к цели, бьёт, подтягивает пиявку и возвращается в руку ----
const thrown = (() => {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.8, roughness: 0.35 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), brass);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xdfe8ea, metalness: 0.9, roughness: 0.2 }));
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.95;
  g.add(tip);
  g.visible = false;
  scene.add(g);
  const ropeGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 12), 3));
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x8a7a5a }));
  rope.frustumCulled = false;
  rope.visible = false;
  scene.add(rope);
  return { g, rope, phase: null, pos: new THREE.Vector3(), aim: new THREE.Vector3(), tgt: null };
})();

function throwHarpoon() {
  if (thrown.phase || (S.throwCd || 0) > 0) return;
  const lvl = S.up.harpoon || 0;
  S.throwCd = COMBAT.THROW.cd[lvl];
  player.swing = 0.35;
  player.swingHit = false;
  const camDir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const enemies = [];
  for (const L of city.leeches) if (!L.dead) enemies.push({ x: L.x, y: L.mesh.position.y + 0.3, z: L.z, ref: L, kind: 'leech' });
  for (const D of deeplings) if (D.active) enemies.push({ x: D.pos.x, y: D.pos.y, z: D.pos.z, ref: D, kind: 'deepling' });
  const tgt = COMBAT.throwTarget(player.pos, camDir, enemies);
  thrown.tgt = tgt;
  thrown.pos.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
  if (tgt) thrown.aim.set(tgt.x, tgt.y + 0.3, tgt.z);
  else thrown.aim.set(player.pos.x + camDir.x * COMBAT.THROW.range, player.pos.y + 1.3 - Math.sin(pitch) * 4, player.pos.z + camDir.z * COMBAT.THROW.range);
  const face = Math.atan2(-(thrown.aim.x - player.pos.x), -(thrown.aim.z - player.pos.z));
  player.facing = face;
  player.mesh.rotation.y = face;
  thrown.phase = 'out';
  thrown.g.visible = thrown.rope.visible = true;
  audio.tone({ type: 'sawtooth', f0: 900, f1: 260, dur: 0.25, vol: 0.06, lp: 2400 });
}

function updateThrow(dt) {
  S.throwCd = Math.max(0, (S.throwCd || 0) - dt);
  if (!thrown.phase) return;
  const hand = new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z);
  // цель движется — гарпун доводится к ней
  const t = thrown.tgt;
  if (thrown.phase === 'out' && t) {
    if (t.kind === 'leech' && !t.ref.dead) thrown.aim.set(t.ref.x, t.ref.mesh.position.y + 0.4, t.ref.z);
    if (t.kind === 'deepling' && t.ref.active) thrown.aim.copy(t.ref.pos);
  }
  const goal = thrown.phase === 'out' ? thrown.aim : hand;
  const to = goal.clone().sub(thrown.pos);
  const d = to.length();
  const step = (thrown.phase === 'out' ? COMBAT.THROW.speed : COMBAT.THROW.back) * dt;
  if (d <= step + 0.05) {
    thrown.pos.copy(goal);
    if (thrown.phase === 'out') {
      thrown.phase = 'back';
      if (t && !(t.kind === 'leech' && t.ref.dead) && !(t.kind === 'deepling' && !t.ref.active)) {
        const dmg = COMBAT.weaponDamage('spear', { spear: S.arms.spear, harpoonLvl: S.up.harpoon || 0 });
        hitEnemy(t.ref, t.kind, dmg);
        audio.hit();
        S.hitStop = 0.05;
        // трос подтягивает пиявку к ныряльщику — добить её вблизи
        if (t.kind === 'leech' && !t.ref.dead) {
          achieve(ach.unlock('rope'));
          const dx = player.pos.x - t.ref.x;
          const dz = player.pos.z - t.ref.z;
          const dl = Math.hypot(dx, dz) || 1;
          t.ref.push = { x: dx / dl, z: dz / dl, t: 0.5 };
        }
      } else {
        for (let i = 0; i < 5; i++) ambient.spray.spawn(thrown.pos.x, thrown.pos.y, thrown.pos.z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.5, 0.15);
      }
    } else {
      thrown.phase = null;
      thrown.g.visible = thrown.rope.visible = false;
      return;
    }
  } else {
    thrown.pos.addScaledVector(to, step / d);
  }
  thrown.g.position.copy(thrown.pos);
  // остриё — вперёд по полёту; на обратном пути гарпун тянется за тросом остриём от руки
  thrown.g.lookAt(thrown.phase === 'out' ? goal : thrown.pos.clone().multiplyScalar(2).sub(hand));
  thrown.g.rotateY(Math.PI);
  // трос провисает между рукой и гарпуном
  const arr = thrown.rope.geometry.attributes.position;
  const len = hand.distanceTo(thrown.pos);
  for (let i = 0; i < 12; i++) {
    const k = i / 11;
    const sag = Math.sin(k * Math.PI) * Math.min(1.2, len * 0.06) * (thrown.phase === 'back' ? 1.6 : 1);
    arr.setXYZ(i, hand.x + (thrown.pos.x - hand.x) * k, hand.y + (thrown.pos.y - hand.y) * k - sag, hand.z + (thrown.pos.z - hand.z) * k);
  }
  arr.needsUpdate = true;
}

// Удар гарпуном / острогой
function strike() {
  if (S.harpoonCd > 0) return;
  const lvl = S.up.harpoon || 0;
  S.harpoonCd = HARPOON_CD[lvl];
  player.swing = 0.35;
  player.swingHit = false;
  audio.tone({ type: 'triangle', f0: 300, f1: 120, dur: 0.18, vol: 0.12 });
  const range = 3.8 + lvl * 0.8;
  // кандидаты: живые пиявки и глубинники рядом; цель — ближайшая перед ныряльщиком
  const enemies = [];
  for (const L of city.leeches) if (!L.dead) enemies.push({ x: L.x, y: L.mesh.position.y, z: L.z, ref: L, kind: 'leech' });
  for (const D of deeplings) if (D.active) enemies.push({ x: D.pos.x, y: D.pos.y, z: D.pos.z, ref: D, kind: 'deepling' });
  const camDir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const bodyDir = { x: -Math.sin(player.mesh.rotation.y), z: -Math.cos(player.mesh.rotation.y) };
  const tgt = COMBAT.pickTarget(player.pos, [camDir, bodyDir], enemies, range, { dy: player.swimming ? 4 : 2.6 });
  let hit = 0;
  if (tgt) {
    // разворачиваемся к цели — удар всегда в её сторону
    const face = Math.atan2(-(tgt.x - player.pos.x), -(tgt.z - player.pos.z));
    player.facing = face;
    player.mesh.rotation.y = face;
    const c = COMBAT.comboStep(S.combo || 0, S.time - (S.lastHitT ?? -99));
    S.combo = c.combo;
    S.lastHitT = S.time;
    const dmg = COMBAT.weaponDamage('spear', { spear: S.arms.spear, harpoonLvl: lvl }) + c.bonus;
    if (c.finisher) {
      achieve(ach.unlock('finisher'));
      floatNumber(tgt.x, tgt.y + 2.2, tgt.z, 'добивание!', 'combo');
      audio.tone({ type: 'square', f0: 520, f1: 180, dur: 0.22, vol: 0.1, lp: 1800 });
    }
    hitEnemy(tgt.ref, tgt.kind, dmg);
    // ощущение попадания: кадр на миг замирает, камеру встряхивает
    S.hitStop = c.finisher ? 0.11 : 0.06;
    S.shake = Math.max(S.shake || 0, c.finisher ? 0.35 : 0.18);
    if (c.finisher && tgt.kind === 'leech' && tgt.ref.push) tgt.ref.push.t = 0.6;
    hit++;
  } else {
    player.facing = yaw;
    player.mesh.rotation.y = yaw;
  }
  if (thief.scare(player.pos, range)) {
    toast('Чайка с криком уносится прочь — рыба цела.', 'ok');
    achieve(ach.unlock('gull'));
    hit++;
  }
  if (hit) audio.hit();
  player.swingHit = hit > 0;
}

// Попадание по врагу: урон, отдача, цифра урона, смерть
function hitEnemy(ref, kind, dmg) {
  const r = COMBAT.damage(ref.hp ?? ref.maxHp ?? 1, dmg);
  ref.hp = r.hp;
  ref.hitFlash = 0.25;
  if (kind === 'leech') {
    const dx = ref.x - player.pos.x;
    const dz = ref.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    floatNumber(ref.x, ref.mesh.position.y + 1, ref.z, `−${dmg}`);
    for (let i = 0; i < 8; i++) ambient.spray.spawn(ref.x, ref.mesh.position.y + 0.4, ref.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.6, 0.25);
    if (r.killed) {
      killLeech(ref);
      toast('Пиявка убита!', 'ok');
    } else {
      ref.push = { x: dx / d, z: dz / d, t: 0.35 };
      ref.cool = Math.max(ref.cool, 1.4);
    }
  } else {
    floatNumber(ref.pos.x, ref.pos.y + 1.5, ref.pos.z, `−${dmg}`);
    for (let i = 0; i < 10; i++) ambient.bubbles.spawn(ref.pos.x, ref.pos.y, ref.pos.z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 1.5, 0.2);
    if (r.killed) {
      ref.setActive(false);
      toast('Глубинник тяжело ранен и ушёл на глубину до утра!', 'ok');
      achieve(ach.unlock('deepling'));
    } else {
      ref.scare();
      toast(`Глубинник ранен (${ref.hp}/${ref.maxHp}) и отпрянул!`, 'ok');
    }
  }
}

// Рывок (V): короткий бросок туда, куда идёшь, — на долю секунды неуязвим
function updateDash(dt) {
  S.dashCd = Math.max(0, (S.dashCd || 0) - dt);
  S.dashInv = Math.max(0, (S.dashInv || 0) - dt);
  if (!pressed.has('KeyV') || S.dashCd > 0) return;
  let ix = 0;
  let iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA')) ix -= 1;
  if (keys.has('KeyD')) ix += 1;
  let dx;
  let dz;
  if (ix || iz) {
    dx = Math.cos(yaw) * ix + Math.sin(yaw) * iz;
    dz = -Math.sin(yaw) * ix + Math.cos(yaw) * iz;
  } else {
    // без направления — отскок назад от взгляда
    dx = Math.sin(yaw);
    dz = Math.cos(yaw);
  }
  const L = Math.hypot(dx, dz) || 1;
  const power = player.swimming ? 9 : 15;
  player.vel.x = (dx / L) * power;
  player.vel.z = (dz / L) * power;
  if (!player.swimming && player.onGround) { player.vel.y = 3; player.onGround = false; }
  S.dashCd = 1.4;
  S.dashInv = 0.4;
  audio.tone({ type: 'triangle', f0: 220, f1: 520, dur: 0.18, vol: 0.08 });
  for (let i = 0; i < 6; i++) ambient.spray.spawn(player.pos.x, player.pos.y + 0.3, player.pos.z, (Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2, 0.5, 0.2);
}

// Ранение ныряльщика
function hurtPlayer(amount, why) {
  if (S.mode !== 'day' && S.mode !== 'closing') return;
  if (S.dashInv > 0) { floatNumber(player.pos.x, player.pos.y + 2.4, player.pos.z, 'уклон!', 'dodge'); return; }
  S.hp = Math.max(0, S.hp - amount);
  S.hurtT = 0;
  document.body.classList.remove('hurt');
  void document.body.offsetWidth;
  document.body.classList.add('hurt');
  floatNumber(player.pos.x, player.pos.y + 2.4, player.pos.z, `−${amount}`, 'me');
  if (S.hp <= 0) {
    S.wounded = why;
    endDay('drowned');
  }
}

// Всплывающие цифры урона
const floatV = new THREE.Vector3();
const floats = [];
function floatNumber(x, y, z, text, cls = '') {
  const el = document.createElement('div');
  el.className = `dmg ${cls}`;
  el.textContent = text;
  $('enemy-bars').appendChild(el);
  floats.push({ el, x, y, z, t: 0 });
}
// Полоски здоровья над ранеными или близкими врагами
const bars = new Map();
function updateCombatUi(dt) {
  S.hurtT += dt;
  S.hp = COMBAT.regen(S.hp, S.hurtT, dt);
  $('hpbar').style.width = `${(S.hp / COMBAT.PLAYER_HP) * 100}%`;
  $('hpbar').className = S.hp < 35 ? 'danger' : '';
  const seen = new Set();
  const show = (ref, x, y, z) => {
    floatV.set(x, y, z).project(camera);
    if (floatV.z > 1 || Math.abs(floatV.x) > 1.1 || Math.abs(floatV.y) > 1.1) return;
    let el = bars.get(ref);
    if (!el) {
      el = document.createElement('div');
      el.className = 'ebar';
      el.innerHTML = '<i></i>';
      $('enemy-bars').appendChild(el);
      bars.set(ref, el);
    }
    seen.add(ref);
    el.style.left = `${(floatV.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-floatV.y * 0.5 + 0.5) * innerHeight}px`;
    el.firstChild.style.width = `${(ref.hp / ref.maxHp) * 100}%`;
    el.classList.toggle('flash', (ref.hitFlash || 0) > 0);
    el.classList.toggle('warn', (ref.windup || 0) > 0 || (ref.lunge || 0) > 0);
    ref.hitFlash = Math.max(0, (ref.hitFlash || 0) - dt);
  };
  if (S.mode === 'day' || S.mode === 'closing') {
    for (const L of city.leeches) {
      if (L.dead) continue;
      const d = Math.hypot(L.x - player.pos.x, L.z - player.pos.z);
      if (d < 14 || L.hp < L.maxHp) show(L, L.x, L.mesh.position.y + 1.2, L.z);
    }
    for (const D of deeplings) {
      if (!D.active) continue;
      if (D.pos.distanceTo(player.pos) < 30) show(D, D.pos.x, D.pos.y + 1.8, D.pos.z);
    }
  }
  for (const [ref, el] of bars) if (!seen.has(ref)) { el.remove(); bars.delete(ref); }
  for (const f of floats) {
    f.t += dt;
    floatV.set(f.x, f.y + f.t * 1.2, f.z).project(camera);
    f.el.style.left = `${(floatV.x * 0.5 + 0.5) * innerWidth}px`;
    f.el.style.top = `${(-floatV.y * 0.5 + 0.5) * innerHeight}px`;
    f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.1));
    if (f.t > 1.1 || floatV.z > 1) f.el.remove();
  }
  for (let i = floats.length - 1; i >= 0; i--) if (floats[i].t > 1.1) floats.splice(i, 1);
}

function updateDeeplings(dt) {
  for (const D of deeplings) {
    const r = D.update(dt, player, ocean, S.mode === 'closing', S.cycle * 0.15 - (S.up.fins || 0) * 0.2);
    // замах: низкий рык — пора уходить рывком (V) или бить первым
    if (D.windup > 0 && !D.warned) {
      D.warned = true;
      audio.tone({ type: 'sawtooth', f0: 55, f1: 95, dur: 0.55, vol: 0.2, attack: 0.15, lp: 420 });
      if (!S.lungeHinted) { S.lungeHinted = true; toast('Глубинник готовится к броску — рывок V уводит из-под зубов!', 'danger'); }
    }
    if (!D.windup) D.warned = false;
    if (r === 'miss') {
      floatNumber(D.pos.x, D.pos.y + 1.5, D.pos.z, 'мимо!', 'dodge');
      if (S.dashCd > 0) achieve(ach.unlock('dodge')); // промах сразу после рывка — увернулся сам
    }
    if (r === 'bite' && S.dashInv > 0) {
      achieve(ach.unlock('dodge'));
      floatNumber(player.pos.x, player.pos.y + 2.4, player.pos.z, 'уклон!', 'dodge');
      D.flee = 1.5;
    } else if (r === 'bite') {
      player.oxygen -= 0.12;
      hurtPlayer(COMBAT.BITE.deepling, 'deepling');
      const away = player.pos.clone().sub(D.pos).setY(0).normalize();
      player.vel.addScaledVector(away, 9);
      audio.tone({ type: 'sawtooth', f0: 90, f1: 40, dur: 0.6, vol: 0.25, lp: 600 });
      audio.hit();
      toast('Глубинник укусил! Отбивайся гарпуном (F) или плыви к поверхности!', 'danger');
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
  // дома и прочие постройки: если между ныряльщиком и камерой стена — камера подъезжает
  // к ней вплотную (быстро), а когда стена ушла — плавно отъезжает обратно
  let free = 1;
  for (let i = 1; i <= 30; i++) {
    const t = i / 30;
    const x = camTarget.x + (px - camTarget.x) * t;
    const z = camTarget.z + (pz - camTarget.z) * t;
    const y = camTarget.y + (cy - camTarget.y) * t;
    if (city.colliders.some((c) => c.type === 'box' && y < c.top + 0.4 && y > c.bottom && x > c.minX - 0.35 && x < c.maxX + 0.35 && z > c.minZ - 0.35 && z < c.maxZ + 0.35)) {
      free = Math.max(0.12, (i - 1.5) / 30);
      break;
    }
  }
  camFree = free < camFree ? free : camFree + (free - camFree) * Math.min(1, dt * 2.5);
  px = camTarget.x + (px - camTarget.x) * camFree;
  pz = camTarget.z + (pz - camTarget.z) * camFree;
  cy = camTarget.y + (cy - camTarget.y) * camFree;
  const bh = backHeight(px, pz);
  if (cy < bh + 0.6) cy = bh + 0.6;
  // камера не режет поверхность воды: голова над водой — камера над волной, под водой — под ней
  const surf = ocean.surfaceAt(px, pz);
  if (player.headUnder) cy = Math.min(cy, surf - 0.6);
  else cy = Math.max(cy, surf + 0.7);
  camera.position.set(px, cy, pz);
  camera.lookAt(camTarget);
  cameraEnv(Math.min(1, S.t / S.T));
}
let camFree = 1;

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

// Где солнце на экране — для лучей. Нет лучей ночью, под водой, в Ковчеге и если солнце за кадром.
const sunV = new THREE.Vector3();
function sunOnScreen() {
  if (S.mode === 'ark' || S.mode === 'night' || (S.underK || 0) > 0.3 || sunDir.y < -0.02) return null;
  if (S.weather === 'storm' || S.weather === 'fog') return null;
  sunV.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
  if (sunV.z > 1) return null;
  const x = (sunV.x + 1) / 2;
  const y = (sunV.y + 1) / 2;
  const off = Math.max(Math.abs(sunV.x), Math.abs(sunV.y));
  if (off > 1.05) return null; // солнце за кадром — лучей нет, иначе «лучи» тянутся от фонарей
  const k = Math.max(0, 1 - Math.max(0, off - 0.75) * 3) * (0.6 + (1 - Math.min(1, sunDir.y * 2)) * 0.8);
  return k > 0.02 ? { x, y, k, color: sun.color } : null;
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
// выбор сложности в меню
function renderDiff() {
  for (const b of document.querySelectorAll('#diff button')) b.classList.toggle('on', b.dataset.diff === (settings.diff || 'normal'));
}
for (const b of document.querySelectorAll('#diff button')) {
  b.addEventListener('click', () => {
    settings.diff = b.dataset.diff;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* приватное окно */ }
    renderDiff();
  });
}
renderDiff();

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
    S.arms = { ...ARMS.emptyArms(), ...(S.arms || {}) };
    startDay();
  });
}


// ============ Совместная игра ============
const netLabels = new Map();
const netLabelV = new THREE.Vector3();
function toMenu() {
  $('modal').classList.add('hidden');
  if (S.mode === 'ark') {
    scene.add(player.mesh);
    post.setScene(scene);
    $('arkhud').classList.add('hidden');
  }
  $('hud').classList.add('hidden');
  S.mode = 'menu';
  S.paused = false;
  $('menu').classList.remove('hidden');
}
// R у шлюза в совместной игре: груз сдан, ждём остальных внутри
function coopWait(drowned = false) {
  if (!drowned && player.carried.length) deposit();
  coop.wait(drowned);
  S.mode = 'wait';
  navDots.count = 0;
  document.exitPointerLock?.();
  const left = coop.players().filter((p) => !(p.isMe && p.sameTab) && p.presence.s !== 'wait').length;
  toast(left ? `Ты в Ковчеге. Ждём остальных: ещё ${left}. День закончится, когда войдут все или прозвучит последний гудок.` : 'Ты в Ковчеге.', 'ok');
}
const coop = createCoop({
  S,
  get city() { return city; },
  player,
  showModal,
  toMenu,
  savedName: () => { try { return localStorage.getItem('deepback-name'); } catch { return null; } },
  saveName: (n) => { try { localStorage.setItem('deepback-name', n); } catch { /* приватное окно */ } },
  startCoopRun: () => {
    leaveMenu();
    startRun(false);
  },
  endDay: (o) => endDay(o),
  takePickup,
  applyDeposit,
  killLeech,
  applyUpgrades,
  hidePlayer: () => { player.mesh.visible = false; },
  hostLeft: () => {
    showModal({ title: 'Хост вышел', body: 'Хозяин комнаты закрыл игру, и город ушёл под воду без него. Можно создать свою комнату или сыграть одному.', buttons: [{ label: 'В меню', onClick: toMenu }] });
  },
  // гость: тот же город и тот же день, что у хоста
  guestStartDay: (w) => {
    $('modal').classList.add('hidden');
    if (!$('menu').classList.contains('hidden')) leaveMenu();
    if (S.mode === 'ark') {
      scene.add(player.mesh);
      post.setScene(scene);
      $('arkhud').classList.add('hidden');
      $('ark-labels').innerHTML = '';
    }
    S.runSeed = w.seed;
    S.cycle = w.cyc;
    S.food = w.f;
    S.fuel = w.u;
    S.scrap = w.sc;
    S.pop = w.pop;
    S.lore = w.lo;
    S.up = { ...(w.up || {}) };
    S.alive = Array.isArray(w.al) ? w.al.slice() : RESIDENTS.map((r) => r.id);
    S.arms = S.arms && typeof S.arms === 'object' ? S.arms : ARMS.emptyArms();
    startDay();
    S.t = w.t;
    toast(`Ты в комнате ${coop.code.toUpperCase()}. Общий Ковчег, общие запасы.`, 'ok');
  },
  // гость: сводка ночи — та, что посчитал хост
  guestNight: (lines, { over, drowned, waited }) => {
    S.mode = 'night';
    S.paused = false;
    navDots.count = 0;
    document.exitPointerLock?.();
    $('hud').classList.add('hidden');
    const mine = drowned ? 'Тебя вытащили к шлюзу без сознания — груз унесло.' : waited ? 'Ты успел в Ковчег до погружения.' : 'Ты не успел к шлюзу: тебя втащили в последний момент, весь груз унесло.';
    const final = over || S.lore >= LORE.length;
    showModal({
      title: over && S.pop <= 0 ? 'Седьмой город пал' : `Ночь ${S.cycle}`,
      body: [mine, ...lines].join('\n\n') + (final ? '\n\nДальше решает хост комнаты.' : ''),
      buttons: final
        ? [{ label: 'Выйти в меню', onClick: () => { coop.leave(); toMenu(); } }]
        : [{ label: 'Войти в Ковчег', onClick: enterArk }],
    });
  },
  makeRemote: () => {
    const r = new RemoteDiver(Player, { day: scene, ark: ark.scene });
    r.body.dress(DIVER_TEX.cloth, DIVER_TEX.patina);
    return r;
  },
  label: (peer, pos, name, carried, where) => {
    let el = netLabels.get(peer);
    if (!pos) {
      if (el && name === undefined) { el.remove(); netLabels.delete(peer); }
      else if (el) el.style.display = 'none';
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'net-label';
      $('net-labels').appendChild(el);
      netLabels.set(peer, el);
    }
    netLabelV.copy(pos).project(camera);
    if (netLabelV.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = `${(netLabelV.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-netLabelV.y * 0.5 + 0.5) * innerHeight}px`;
    const text = `${name}${carried ? ` · груз ${carried}` : ''}${where === 'sleep' ? ' · спит' : ''}`;
    if (el.textContent !== text) el.textContent = text;
  },
  clearLabels: () => {
    for (const el of netLabels.values()) el.remove();
    netLabels.clear();
  },
});
// сетевой такт не зависит от частоты кадров: на слабом компьютере
// отрисовка может тормозить, а обмен с комнатой — нет
let netLast = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.5, (now - netLast) / 1000);
  netLast = now;
  coop.tick(dt);
}, 100);
$('coop-btn').addEventListener('click', () => {
  audio.init();
  audio.resume();
  coop.openLobby();
});

// для фона меню и для автотестов
window.__deepback = { throwHarpoon: () => throwHarpoon(), get thrown() { return thrown; }, coop, schools, updateDash: (dt) => updateDash(dt), hurtPlayer: (a, w) => hurtPlayer(a, w), COMBAT, thief, strike: () => strike(), castaway, ach, giant, playOutro: (e) => playOutro(e), get outro() { return outro; }, traderBoat, openTrader: () => openTrader(), strikeBolt: () => strikeBolt(), get bolt() { return bolt; }, showArmsHint, planShot: (s) => planShot(s), cameraRoomy: (c, r) => cameraRoomy(c, r), ark, enterArk, killLeech, lineClear: (...a) => lineClear(...a), introPoint: (s) => introPoint(s), S, sky, envScene, whale, ambient, scene, post, voice, intro, startIntro, endIntro, player, city, ocean, deeplings, rain, navDots, startRun, startDay, endDay, keys, pressed, setYaw: (v) => (yaw = v) };

// ============ Цикл ============
const clock = new THREE.Clock();
city.generate(S.runSeed, 1, 0, LORE.length);
player.reset(new THREE.Vector3(HATCH.x, city.groundAt(HATCH.x, HATCH.z + 3) + 0.1, HATCH.z + 3));
function frame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(0.05, rawDt);
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
    giant.update(dt, 4, true);
  } else if (S.mode === 'intro') {
    updateIntro(dt);
  } else if (S.mode === 'outro') {
    updateOutro(dt);
  } else if ((S.mode === 'day' || S.mode === 'closing') && !S.paused) {
    // остановка кадра при попадании: мир на мгновение почти замирает
    const gdt = S.hitStop > 0 ? dt * 0.1 : dt;
    S.hitStop = Math.max(0, (S.hitStop || 0) - dt);
    if (pressed.has('KeyJ')) showJournal();
    else updateGame(gdt);
    updateCamera(dt);
    if (S.shake > 0) {
      const a = S.shake * S.shake;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      S.shake = Math.max(0, S.shake - dt * 1.6);
    }
    updateHud();
  } else if (S.mode === 'ark' && !S.paused) {
    updateArk(dt);
  } else if (S.mode === 'night') {
    ocean.update(S.time, W1 + 6, player.pos.x, player.pos.z);
  } else if (S.mode === 'wait') {
    // в Ковчеге, пока остальные ещё снаружи: смотрим на город над шлюзом
    const pw = Math.min(1, S.t / S.T);
    ocean.update(S.time, ECO.waterLevel(pw, S.weather), player.pos.x, player.pos.z);
    applyTime(pw);
    updateCamera(dt);
    updateHud();
  }
  // Мать живая: хвост медленно поднимается из воды, плавники гребут
  KELP_TIME.value = S.time;
  animateRegion(regionGroup, S.time, (x, z) => ocean.surfaceAt(x, z));
  if (whale.userData.fluke) {
    const slow = Math.sin(S.time * 0.12);
    whale.userData.fluke.rotation.x = -0.12 - Math.max(0, slow) * 0.42 + Math.sin(S.time * 0.5) * 0.05;
  }
  for (const f of whale.userData.fins || []) f.rotation.z = f.userData.side * (0.12 + Math.sin(S.time * 0.25 + f.userData.side) * 0.16);
  if (S.debugCam) {
    camera.position.fromArray(S.debugCam[0]);
    camera.lookAt(...S.debugCam[1]);
  }
  coop.frame(dt);
  pressed.clear();
  autoQuality(rawDt);
  post.render(dt, { under: S.underK || 0, time: S.time, sun: sunOnScreen() });
  requestAnimationFrame(frame);
}
frame();

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post.resize();
});
