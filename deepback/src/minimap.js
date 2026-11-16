// Мини-карта: вид сверху на спину Матери. Голова — вверху.
import { WHALE, pointOnBack, BLOWHOLE } from './whale.js';
import { HATCH } from './city.js';

export const MAP_COLORS = {
  food: '#bfe9ff',
  fuel: '#ff9a4d',
  scrap: '#c9c2ff',
  relic: '#5ff0ff',
  keepsake: '#ff7fb8',
  leech: '#b04bd0',
  deepling: '#59ffb0',
  ark: '#c8643c',
  player: '#ffffff',
  path: '#58f0d8',
  trader: '#ffb347',
  castaway: '#ff5a4a',
  school: '#9fd8ff',
  jelly: '#d59cff',
};

export const LEGEND = [
  ['player', 'Ты'],
  ['ark', 'Ковчег и шлюз'],
  ['food', 'Рыба'],
  ['fuel', 'Ворвань'],
  ['scrap', 'Обломки'],
  ['relic', 'Реликвия'],
  ['keepsake', 'Вещь жителя'],
  ['leech', 'Пиявка'],
  ['deepling', 'Глубинник'],
  ['school', 'Косяк рыб'],
  ['jelly', 'Медуза'],
  ['trader', 'Торговец'],
  ['castaway', 'Выживший на плоту'],
];

const SCALE = 1.08; // пикселей на метр

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.w = canvas.clientWidth || 120;
    this.h = canvas.clientHeight || 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = this.w * dpr;
    canvas.height = this.h * dpr;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true }); // маленькая карта: рисуем на процессоре, не гоняя её через видеокарту
    this.ctx.scale(dpr, dpr);
    this.timer = 0;
  }

  px(x) { return this.w / 2 + x * SCALE; }
  py(z) { return this.h / 2 + z * SCALE; }

  outline(u) {
    const c = this.ctx;
    c.beginPath();
    for (let i = 0; i <= 72; i++) {
      const p = pointOnBack(u, (i / 72) * Math.PI * 2);
      if (i === 0) c.moveTo(this.px(p.x), this.py(p.z));
      else c.lineTo(this.px(p.x), this.py(p.z));
    }
    c.closePath();
  }

  dot(x, z, r, color) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.arc(this.px(x), this.py(z), r, 0, Math.PI * 2);
    c.fill();
  }

  // st: { dt, water, colliders, pickups, leeches, deeplings, player:{x,z}, yaw, path, time }
  draw(st) {
    this.timer -= st.dt;
    if (this.timer > 0) return;
    this.timer = 0.08;
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);

    // тело: сначала вода, сверху — ещё сухая часть спины
    this.outline(1);
    c.fillStyle = '#1b5568';
    c.fill();
    const k = Math.min(1, Math.max(0, st.water / WHALE.H));
    const dryU = 1 - k * k;
    if (dryU > 0.01) {
      this.outline(dryU);
      c.fillStyle = '#2c3a40';
      c.fill();
    }
    this.outline(1);
    c.strokeStyle = 'rgba(160,230,230,.45)';
    c.lineWidth = 1;
    c.stroke();

    // постройки
    c.fillStyle = '#6d5c4a';
    for (const b of st.colliders) {
      if (b.type !== 'box' || b.maxX - b.minX < 2) continue;
      c.fillRect(this.px(b.minX), this.py(b.minZ), (b.maxX - b.minX) * SCALE, (b.maxZ - b.minZ) * SCALE);
    }

    // дыхало
    this.dot(BLOWHOLE.x, BLOWHOLE.z, 3, '#0a1114');
    this.dot(BLOWHOLE.x, BLOWHOLE.z, 1, '#dff');

    // Ковчег и шлюз
    this.dot(0, 0, 8.5 * SCALE, MAP_COLORS.ark);
    c.strokeStyle = MAP_COLORS.path;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(this.px(HATCH.x), this.py(HATCH.z), 3, 0, Math.PI * 2);
    c.stroke();

    // маршрут навигатора
    if (st.path && st.path.length > 1) {
      c.strokeStyle = MAP_COLORS.path;
      c.lineWidth = 1.5;
      c.setLineDash([3, 3]);
      c.lineDashOffset = -st.time * 8;
      c.beginPath();
      c.moveTo(this.px(st.player.x), this.py(st.player.z));
      for (const p of st.path) c.lineTo(this.px(p.x), this.py(p.z));
      c.stroke();
      c.setLineDash([]);
    }

    // припасы
    for (const p of st.pickups) {
      if (!p.active) continue;
      if (p.type === 'relic' || p.type === 'keepsake') {
        const pulse = 3.2 + Math.sin(st.time * 5) * 0.8;
        c.save();
        c.translate(this.px(p.x), this.py(p.z));
        c.rotate(Math.PI / 4);
        c.fillStyle = MAP_COLORS[p.type];
        c.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
        c.restore();
      } else this.dot(p.x, p.z, 2, MAP_COLORS[p.type]);
    }

    // враги
    for (const l of st.leeches) if (!l.dead) this.dot(l.x, l.z, 2.4, MAP_COLORS.leech);
    for (const d of st.deeplings) {
      if (!d.active) continue;
      c.fillStyle = MAP_COLORS.deepling;
      c.beginPath();
      const x = this.px(d.pos.x);
      const y = this.py(d.pos.z);
      c.moveTo(x, y - 4);
      c.lineTo(x + 3.5, y + 3);
      c.lineTo(x - 3.5, y + 3);
      c.closePath();
      c.fill();
    }

    // косяки, торговец, плот
    for (const e of st.extras || []) {
      const x = this.px(e.x);
      const y = this.py(e.z);
      c.fillStyle = MAP_COLORS[e.kind];
      if (e.kind === 'jelly') {
        // медуза — маленький купол
        c.globalAlpha = 0.85;
        c.beginPath();
        c.arc(x, y, 2, Math.PI, 0);
        c.fill();
        c.globalAlpha = 1;
      } else if (e.kind === 'school') {
        c.globalAlpha = 0.7;
        for (const [dx, dy] of [[-2, 0], [2, 1], [0, -2]]) { c.beginPath(); c.arc(x + dx, y + dy, 1.2, 0, Math.PI * 2); c.fill(); }
        c.globalAlpha = 1;
      } else {
        const pulse = e.kind === 'castaway' ? 3.5 + Math.sin(st.time * 6) * 1 : 3.5;
        c.beginPath();
        c.arc(x, y, pulse, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#000';
        c.lineWidth = 1;
        c.stroke();
      }
    }

    // игрок: стрелка по направлению взгляда
    c.save();
    c.translate(this.px(st.player.x), this.py(st.player.z));
    c.rotate(-st.yaw);
    c.fillStyle = MAP_COLORS.player;
    c.strokeStyle = '#000';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4, 4);
    c.lineTo(0, 2);
    c.lineTo(-4, 4);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
