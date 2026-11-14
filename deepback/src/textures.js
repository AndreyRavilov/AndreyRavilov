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

function finish(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
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
    return [clamp(tint[0] * m), clamp(tint[1] * m), clamp(tint[2] * m)];
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
    return clamp(120 - wrinkle * 70 + pores * 30 + blotch * 40 - scar * 60);
  });
  const rough = paint(size, (u, v) => {
    const wet = fbm(u * 5, v * 5, 5, 4, 24);
    return clamp(120 + (wet - 0.5) * 200);
  });
  return { bump: finish(bump, 1, false), rough: finish(rough, 1, false) };
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
