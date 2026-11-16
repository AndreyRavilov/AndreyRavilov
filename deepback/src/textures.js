// Процедурные текстуры: рисуются на canvas при запуске, без файлов-картинок.
// Каждая функция возвращает { map, bump } — цвет и карту рельефа.
import * as THREE from 'three';

// --- шум ---
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
// бесшовный value-noise с периодом p
function vnoise(x, y, p, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const w = (v) => ((v % p) + p) % p;
  const a = hash(w(xi), w(yi), seed);
  const b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed);
  const d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function fbm(x, y, period, octaves = 4, seed = 1) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    s += amp * vnoise(x * f, y * f, period * f, seed + i * 17);
    amp *= 0.5;
    f *= 2;
  }
  return s / (1 - Math.pow(0.5, octaves));
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Анизотропная фильтрация: без неё земля под косым взглядом камеры размывается в ровную кашу
let ANISO = 4;
const made = [];
export function setAnisotropy(n) {
  ANISO = n;
  for (const t of made) {
    t.anisotropy = n;
    t.needsUpdate = true;
  }
}

function finish(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = ANISO;
  made.push(t);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Заполнить canvas попиксельно: fn(u, v) -> [r, g, b] (0..255) или число (серое)
function paint(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = fn(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      if (typeof v === 'number') {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      } else {
        img.data[i] = v[0];
        img.data[i + 1] = v[1];
        img.data[i + 2] = v[2];
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const clamp = (v) => Math.max(0, Math.min(255, v));

// --- Доски: вертикальная обшивка с волокнами, щелями и гвоздями ---
export function planks(tint = [120, 95, 70], size = 256) {
  const N = 6; // досок на тайл
  const pick = (k) => hash(k, 3, 99);
  const col = paint(size, (u, v) => {
    const k = Math.floor(u * N);
    const lu = u * N - k;
    const grain = fbm(u * 6 + k * 3.1, v * 40, 40, 3, 7);
    const shade = 0.75 + pick(k) * 0.35;
    const knot = Math.max(0, 1 - Math.hypot(lu - 0.5, ((v * 3 + pick(k) * 3) % 1) - 0.5) * 6) * 0.35;
    let m = shade * (0.78 + grain * 0.35) - knot;
    if (lu < 0.04 || lu > 0.96) m *= 0.35; // щель между досками
    const nail = (Math.abs(lu - 0.5) < 0.05 && (Math.abs(v - 0.12) < 0.012 || Math.abs(v - 0.88) < 0.012)) ? 0.4 : 1;
    m *= nail;
    return [clamp(tint[0] * m), clamp(tint[1] * m), clamp(tint[2] * m)];
  });
  const bump = paint(size, (u, v) => {
    const k = Math.floor(u * N);
    const lu = u * N - k;
    const grain = fbm(u * 6 + k * 3.1, v * 40, 40, 3, 7);
    let h = 170 + grain * 60;
    if (lu < 0.04 || lu > 0.96) h = 30;
    return clamp(h);
  });
  return { map: finish(col), bump: finish(bump, 1, false) };
}

// --- Крашеные доски: облупившаяся краска, под ней серое дерево, потёки ---
export function paintedPlanks(paintRGB = [120, 140, 150], size = 256) {
  const N = 6;
  const pick = (k) => hash(k, 3, 99);
  const wood = [128, 112, 94];
  const peel = (u, v) => smoothstepJS(0.66, 0.7, fbm(u * 14, v * 7, 14, 4, 61) * 0.7 + fbm(u * 3, v * 3, 3, 3, 64) * 0.3 + (1 - v) * 0.05);
  const col = paint(size, (u, v) => {
    const k = Math.floor(u * N);
    const lu = u * N - k;
    const grain = fbm(u * 6 + k * 3.1, v * 40, 40, 3, 7);
    const pk = peel(u, v);
    const shade = 0.82 + pick(k) * 0.24;
    const fade = 0.88 + fbm(u * 3, v * 6, 3, 3, 62) * 0.18;
    const streak = fbm(u * 50, v * 2, 50, 2, 63);
    let r = paintRGB[0] * fade, g = paintRGB[1] * fade, b = paintRGB[2] * fade;
    // потёки ржавчины от гвоздей
    const drip = Math.max(0, (streak - 0.68) * 2.2) * (1 - v);
    r = r * (1 - drip) + 110 * drip; g = g * (1 - drip) + 70 * drip; b = b * (1 - drip) + 45 * drip;
    const wg = 0.75 + grain * 0.4;
    r = r * (1 - pk) + wood[0] * wg * pk;
    g = g * (1 - pk) + wood[1] * wg * pk;
    b = b * (1 - pk) + wood[2] * wg * pk;
    let m = shade * (0.94 + grain * 0.1 * (1 - pk));
    if (lu < 0.035 || lu > 0.965) m *= 0.4;
    const nail = (Math.abs(lu - 0.5) < 0.05 && (Math.abs(v - 0.12) < 0.012 || Math.abs(v - 0.88) < 0.012)) ? 0.45 : 1;
    m *= nail;
    return [clamp(r * m), clamp(g * m), clamp(b * m)];
  });
  const bump = paint(size, (u, v) => {
    const k = Math.floor(u * N);
    const lu = u * N - k;
    const grain = fbm(u * 6 + k * 3.1, v * 40, 40, 3, 7);
    const pk = peel(u, v);
    let h = 180 - pk * 35 + grain * 40 * pk;
    if (lu < 0.035 || lu > 0.965) h = 30;
    return clamp(h);
  });
  const rough = paint(size, (u, v) => clamp(160 + peel(u, v) * 80));
  return { map: finish(col), bump: finish(bump, 1, false), rough: finish(rough, 1, false) };
}

// --- Крашеные клёпаные панели (внутри Ковчега): краска, потёртости, немного ржавчины у швов ---
export function paintedPanels(paintRGB = [96, 128, 124], size = 256) {
  const col = paint(size, (u, v) => {
    const pu = (u * 4) % 1;
    const pv = (v * 2) % 1;
    const edge = Math.min(pu, 1 - pu, pv, 1 - pv);
    const wear = smoothstepJS(0.7, 0.76, fbm(u * 24, v * 12, 24, 4, 71));
    const rust = Math.max(0, 1 - edge * 30) * smoothstepJS(0.45, 0.6, fbm(u * 20, v * 20, 20, 3, 72)) * 0.8;
    const n = 0.9 + fbm(u * 30, v * 30, 30, 2, 73) * 0.15;
    let r = paintRGB[0] * n, g = paintRGB[1] * n, b = paintRGB[2] * n;
    r = r * (1 - wear) + 150 * wear; g = g * (1 - wear) + 150 * wear; b = b * (1 - wear) + 146 * wear;
    r = r * (1 - rust) + 120 * rust; g = g * (1 - rust) + 66 * rust; b = b * (1 - rust) + 38 * rust;
    let m = 1;
    if (edge < 0.012) m = 0.45;
    const rv = Math.abs(edge - 0.045) < 0.012 && Math.abs(((pu + pv) * 12) % 1 - 0.5) < 0.18 ? 1.3 : 1;
    return [clamp(r * m * rv), clamp(g * m * rv), clamp(b * m * rv)];
  });
  const bump = paint(size, (u, v) => {
    const pu = (u * 4) % 1;
    const pv = (v * 2) % 1;
    const edge = Math.min(pu, 1 - pu, pv, 1 - pv);
    const rv = Math.abs(edge - 0.045) < 0.012 && Math.abs(((pu + pv) * 12) % 1 - 0.5) < 0.18 ? 80 : 0;
    return clamp((edge < 0.012 ? 40 : 150) + rv);
  });
  const rough = paint(size, (u, v) => clamp(110 + smoothstepJS(0.7, 0.76, fbm(u * 24, v * 12, 24, 4, 71)) * 60));
  return { map: finish(col), bump: finish(bump, 1, false), rough: finish(rough, 1, false) };
}

// --- Брезент водолазного костюма: саржевое плетение, потёртости, грязные разводы ---
export function canvasCloth(size = 256) {
  const map = paint(size, (u, v) => {
    const wu = Math.sin((u * 96 + v * 96) * Math.PI) * 0.5 + 0.5; // диагональ саржи
    const wv = Math.sin(v * 192 * Math.PI) * 0.5 + 0.5;
    const weave = 0.9 + 0.1 * (wu * 0.6 + wv * 0.4);
    const dirt = fbm(u * 4, v * 4, 4, 4, 91);
    const wear = smoothstepJS(0.62, 0.75, fbm(u * 10, v * 10, 10, 3, 92));
    const k = weave * (0.88 + dirt * 0.2) * (1 - wear * 0.18);
    return [clamp(255 * k), clamp(240 * k - dirt * 25), clamp(225 * k - dirt * 40)];
  });
  const bump = paint(size, (u, v) => {
    const wu = Math.sin((u * 96 + v * 96) * Math.PI) * 0.5 + 0.5;
    const wv = Math.sin(v * 192 * Math.PI) * 0.5 + 0.5;
    return clamp(100 + wu * 90 + wv * 50);
  });
  return { map: finish(map), bump: finish(bump, 1, false) };
}

// --- Латунь с патиной: светлая на выпуклом, зелень окисла пятнами ---
export function brassPatina(size = 256) {
  const map = paint(size, (u, v) => {
    const n = fbm(u * 6, v * 6, 6, 4, 95);
    const verd = smoothstepJS(0.64, 0.78, fbm(u * 5, v * 5, 5, 4, 96));
    const r = 255 * (0.95 - n * 0.15);
    const g = 255 * (0.9 - n * 0.15);
    const b = 255 * (0.82 - n * 0.12);
    return [clamp(r * (1 - verd) + 110 * verd), clamp(g * (1 - verd) + 170 * verd), clamp(b * (1 - verd) + 140 * verd)];
  });
  const rough = paint(size, (u, v) => {
    const verd = smoothstepJS(0.64, 0.78, fbm(u * 5, v * 5, 5, 4, 96));
    const scratch = Math.max(0, fbm(u * 60, v * 3, 60, 2, 97) - 0.7) * 2;
    return clamp(70 + verd * 160 + fbm(u * 20, v * 20, 20, 3, 98) * 40 - scratch * 50);
  });
  return { map: finish(map), rough: finish(rough, 1, false) };
}

// --- Черепица / дранка: ряды со сдвигом ---
export function shingles(tint = [120, 60, 45], size = 256) {
  const R = 8;
  const col = paint(size, (u, v) => {
    const row = Math.floor(v * R);
    const lv = v * R - row;
    const off = row % 2 ? 0.5 / 5 : 0;
    const k = Math.floor((u + off) * 5);
    const lu = (u + off) * 5 - k;
    const t = 0.7 + hash(k, row, 5) * 0.4;
    const n = fbm(u * 16, v * 16, 16, 3, 3);
    let m = t * (0.8 + n * 0.3) * (0.65 + lv * 0.45);
    if (lu < 0.03) m *= 0.4;
    // мох и птичий помёт — пятнами
    const moss = smoothstepJS(0.6, 0.72, fbm(u * 4, v * 4, 4, 4, 81)) * (0.4 + (1 - lv) * 0.6);
    const lichen = Math.max(0, fbm(u * 24, v * 24, 24, 2, 82) - 0.72) * 3;
    const r = tint[0] * (1 - moss * 0.6) + 78 * moss * 0.6 + lichen * 60;
    const g = tint[1] * (1 - moss * 0.6) + 96 * moss * 0.6 + lichen * 60;
    const b = tint[2] * (1 - moss * 0.6) + 52 * moss * 0.6 + lichen * 52;
    return [clamp(r * m), clamp(g * m), clamp(b * m)];
  });
  const bump = paint(size, (u, v) => {
    const lv = v * R - Math.floor(v * R);
    return clamp(60 + lv * 190);
  });
  return { map: finish(col), bump: finish(bump, 1, false) };
}

// --- Ржавый металл с заклёпками: Ковчег, краны, бочки ---
export function rustyMetal(base = [92, 104, 110], size = 256) {
  const col = paint(size, (u, v) => {
    const rust = fbm(u * 6, v * 6, 6, 5, 11);
    const streak = fbm(u * 30, v * 3, 30, 3, 12);
    const r = Math.max(0, (rust - 0.48) * 3.2) + Math.max(0, (streak - 0.62) * 1.5) * (1 - v * 0.3);
    const k = Math.min(1, r);
    const n = 0.85 + fbm(u * 40, v * 40, 40, 2, 13) * 0.25;
    const rivet = (Math.abs(((u * 8) % 1) - 0.5) < 0.06 && Math.abs(((v * 4) % 1) - 0.08) < 0.03) ? 1.35 : 1;
    const seam = Math.abs(((v * 4) % 1)) < 0.015 ? 0.55 : 1;
    const c = [base[0] * (1 - k) + 128 * k, base[1] * (1 - k) + 62 * k, base[2] * (1 - k) + 34 * k];
    return c.map((x) => clamp(x * n * rivet * seam));
  });
  const bump = paint(size, (u, v) => {
    const rust = fbm(u * 6, v * 6, 6, 5, 11);
    const rivet = (Math.abs(((u * 8) % 1) - 0.5) < 0.06 && Math.abs(((v * 4) % 1) - 0.08) < 0.03) ? 90 : 0;
    const seam = Math.abs(((v * 4) % 1)) < 0.015 ? -80 : 0;
    return clamp(128 + (rust - 0.5) * 120 + rivet + seam);
  });
  const rough = paint(size, (u, v) => {
    const rust = fbm(u * 6, v * 6, 6, 5, 11);
    return clamp(rust > 0.5 ? 235 : 120 + rust * 60);
  });
  return { map: finish(col), bump: finish(bump, 1, false), rough: finish(rough, 1, false) };
}

// --- Кожа Матери: морщины, рубцы, пятна (серое — для bump и roughness) ---
export function whaleSkin(size = 512) {
  const bump = paint(size, (u, v) => {
    // редкие изогнутые складки, рвущиеся шумом
    const warp = fbm(u * 4, v * 4, 4, 3, 21) * 3.5;
    const fold = Math.abs(Math.sin((v * 22 + warp) * Math.PI));
    const breakup = fbm(u * 10, v * 10, 10, 3, 25);
    const wrinkle = Math.pow(fold, 6) * smoothstepJS(0.35, 0.75, breakup);
    const pores = fbm(u * 64, v * 64, 64, 2, 22);
    const blotch = fbm(u * 2, v * 2, 2, 4, 26);
    const scar = Math.max(0, 1 - Math.abs(fbm(u * 3, v * 3, 3, 4, 23) - 0.5) * 40);
    return clamp(120 - wrinkle * 38 + pores * 34 + blotch * 40 - scar * 40 + barnacle(u, v) * 70);
  });
  const rough = paint(size, (u, v) => {
    const wet = fbm(u * 5, v * 5, 5, 4, 24);
    const barn = barnacle(u, v);
    return clamp(175 + (wet - 0.5) * 140 + barn * 60);
  });
  // цвет шкуры: тёплый сланец с бурыми разводами, бледными шрамами,
  // зеленоватой тиной в складках и колониями белёсых ракушек
  const map = paint(size, (u, v) => {
    const blotch = fbm(u * 2, v * 2, 2, 5, 26);
    const mott = fbm(u * 9, v * 9, 9, 4, 27);
    const algae = smoothstepJS(0.55, 0.75, fbm(u * 3 + 7, v * 3, 3, 4, 28));
    const scar = Math.max(0, 1 - Math.abs(fbm(u * 3, v * 3, 3, 4, 23) - 0.5) * 40);
    const pores = fbm(u * 64, v * 64, 64, 2, 22);
    const barn = barnacle(u, v);
    let r = 112, g = 106, b = 100;
    const dk = 0.72 + blotch * 0.42 + (mott - 0.5) * 0.18 + (pores - 0.5) * 0.08;
    r *= dk; g *= dk; b *= dk * 0.98;
    // бурые пятна
    const brown = smoothstepJS(0.5, 0.7, mott) * 0.35;
    r += brown * 18; g += brown * 4; b -= brown * 10;
    // тина
    r = r * (1 - algae * 0.35) + 70 * algae * 0.35;
    g = g * (1 - algae * 0.35) + 92 * algae * 0.35;
    b = b * (1 - algae * 0.35) + 60 * algae * 0.35;
    // шрамы
    r += scar * 9; g += scar * 9; b += scar * 8;
    // ракушки
    const bk = barn * 0.32;
    r = r * (1 - bk) + 190 * bk; g = g * (1 - bk) + 184 * bk; b = b * (1 - bk) + 170 * bk;
    return [clamp(r), clamp(g), clamp(b)];
  });
  return { map: finish(map), bump: finish(bump, 1, false), rough: finish(rough, 1, false) };
}

// колонии ракушек: кольца, собранные в пятна
function barnacle(u, v) {
  const colony = smoothstepJS(0.68, 0.78, fbm(u * 4, v * 4, 4, 3, 29));
  if (colony <= 0) return 0;
  const N = 110;
  const cx = Math.floor(u * N);
  const cy = Math.floor(v * N);
  const ox = hash(cx, cy, 51) * 0.5 + 0.25;
  const oy = hash(cx, cy, 52) * 0.5 + 0.25;
  const d = Math.hypot(u * N - cx - ox, v * N - cy - oy);
  const r = 0.18 + hash(cx, cy, 53) * 0.14;
  const ring = d < r ? (d > r * 0.45 ? 1 : 0.35) : 0;
  return ring * colony * (hash(cx, cy, 54) < 0.75 ? 1 : 0);
}

function smoothstepJS(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// --- Мелкая волна для воды (карта высот, тайлится) ---
export function waveDetail(size = 256) {
  const c = paint(size, (u, v) => clamp(fbm(u * 8, v * 8, 8, 5, 31) * 255));
  const t = finish(c, 1, false);
  return t;
}

// --- Облака: мягкий тайлящийся шум с альфой ---
export function cloudNoise(size = 256) {
  const c = paint(size, (u, v) => clamp(fbm(u * 4, v * 4, 4, 6, 41) * 255));
  return finish(c, 1, false);
}

// Переписать UV по проекции «коробкой», чтобы текстура лежала в метрах,
// а не растягивалась на грань любой длины.
export function boxProjectUV(geo, metersPerTile = 3) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) { u = pos.getX(i); v = pos.getZ(i); }
    else if (ax >= az) { u = pos.getZ(i); v = pos.getY(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv.setXY(i, u / metersPerTile, v / metersPerTile);
  }
  uv.needsUpdate = true;
  return geo;
}

// Мягкое светящееся пятно для ореолов
export function glowDot(size = 64) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Сеть: ячейки для карты прозрачности
export function netTexture(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  const step = size / 8;
  for (let i = -8; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * step + size, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
