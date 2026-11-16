// Совместная игра: 2–4 ныряльщика в одном городе.
//
// Хост ведёт мир: сид, таймер дня, запасы Ковчега, что уже подобрано и кто из
// пиявок убит — всё это лежит в его presence (поле w). Гости играют у себя,
// а свои действия (подобрал, сдал, убил, потратил обломки) складывают в
// список a своей presence; хост применяет каждое один раз по номеру.
// Всё, что видно другим, — позиция и поза ныряльщика — тоже presence.
import * as THREE from 'three';
import { openNet, roomCode, normalizeCode } from './net.js';

export const MAX_PLAYERS = 4;
export const COLORS = [0xc9772c, 0x2f8fbf, 0x7fae3a, 0xb3478f];
const SEND_EVERY = 0.1; // с — как часто отправлять позицию
const HOST_LOST = 20; // с без хоста — комната распалась (вкладку могли свернуть на пару секунд)

export function createCoop(ctx) {
  const C = {
    net: null,
    room: null,
    role: null, // 'host' | 'guest'
    code: '',
    name: '',
    color: 0,
    seq: 0,
    acts: [],
    done: new Map(), // хост: peer -> последний применённый номер действия
    remotes: new Map(), // peer -> удалённый ныряльщик
    hostEp: null,
    nightEp: null,
    ep: 0,
    sendT: 0,
    hostSeen: 0,
    spendHold: 0,
    upKey: '',
    waiting: false,
    sleeping: false,
    lobby: null,
  };

  const coop = {
    get active() { return !!C.room; },
    get isHost() { return C.role === 'host' && !!C.room; },
    get isGuest() { return C.role === 'guest' && !!C.room; },
    get code() { return C.code; },
    get waiting() { return C.waiting; },
    players,
    openLobby,
    leave,
    act,
    tick,
    frame,
    wait,
    sleep,
    newDay,
    holdSpend,
    hostNight,
    lobbyState: () => C.lobby && { code: C.code, role: C.role, players: players().length },
  };

  // ---------- лобби ----------
  async function openLobby() {
    if (!C.net) C.net = await openNet();
    if (!C.net) {
      ctx.showModal({
        title: 'Совместная игра',
        body: 'Совместная игра работает на странице игры в Claude. Открой игру по ссылке и поделись ею с друзьями: каждый, кому открыт доступ, сможет войти в твою комнату по коду.',
        buttons: [{ label: 'Понятно', onClick: ctx.toMenu }],
      });
      return;
    }
    const body = document.createElement('div');
    body.className = 'lobby';
    body.innerHTML = `
      <p>До ${MAX_PLAYERS} ныряльщиков в одном городе: общий Ковчег, общие запасы, один день на всех.
      Хост создаёт комнату и называет друзьям код.</p>
      <label class="lobby-row">Твоё имя <input id="coop-name" maxlength="16" autocomplete="off"></label>
      <div class="lobby-row"><button id="coop-create">Создать комнату</button></div>
      <div class="lobby-row"><input id="coop-code" maxlength="4" placeholder="код" autocomplete="off"><button id="coop-join" class="secondary">Войти по коду</button></div>
      <p id="coop-err" class="lobby-err"></p>`;
    const nameEl = body.querySelector('#coop-name');
    nameEl.value = ctx.savedName() || `Ныряльщик ${1 + Math.floor(Math.random() * 90)}`;
    const err = body.querySelector('#coop-err');
    body.querySelector('#coop-create').onclick = async () => {
      if (!(await enter(roomCode(), 'host', nameEl.value))) err.textContent = 'Не удалось открыть комнату. Попробуй ещё раз.';
    };
    body.querySelector('#coop-join').onclick = async () => {
      const code = normalizeCode(body.querySelector('#coop-code').value);
      if (!code) { err.textContent = 'Код — четыре знака, например k7mq.'; return; }
      if (!(await enter(code, 'guest', nameEl.value))) err.textContent = 'Не удалось войти. Проверь код.';
    };
    ctx.showModal({ title: 'Играть вместе', body, buttons: [{ label: 'Назад', onClick: ctx.toMenu }] });
  }

  async function enter(code, role, name) {
    try {
      C.room = await C.net.join(`deepback-${code}`);
    } catch {
      C.room = null;
      return false;
    }
    C.code = code;
    C.role = role;
    C.name = String(name || '').trim().slice(0, 16) || 'Ныряльщик';
    ctx.saveName(C.name);
    C.seq = 0;
    C.acts = [];
    C.done.clear();
    C.hostEp = null;
    C.nightEp = null;
    C.hostSeen = performance.now();
    C.lobby = true;
    C.color = 0;
    await C.room.presence({ v: 1, n: C.name, r: role === 'host' ? 'h' : 'g', s: 'menu', c: 0, a: [] });
    showLobby();
    return true;
  }

  function showLobby() {
    const body = document.createElement('div');
    body.className = 'lobby';
    body.innerHTML = `<p class="lobby-code">Код комнаты: <b></b></p><p class="lobby-note"></p><ul class="lobby-players"></ul>`;
    body.querySelector('b').textContent = C.code.toUpperCase();
    body.querySelector('.lobby-note').textContent = C.role === 'host'
      ? 'Назови код друзьям. Когда все соберутся — начинай.'
      : 'Ты в комнате. День начнётся, когда хост нажмёт «Начать».';
    C.lobbyEl = body;
    const buttons = [];
    if (C.role === 'host') buttons.push({ label: 'Начать', onClick: () => { C.lobby = null; ctx.startCoopRun(); } });
    buttons.push({ label: 'Выйти из комнаты', onClick: () => { leave(); ctx.toMenu(); } });
    ctx.showModal({ title: C.role === 'host' ? 'Твоя комната' : 'Комната друга', body, buttons });
    renderLobby();
  }

  function renderLobby() {
    if (!C.lobbyEl) return;
    const ul = C.lobbyEl.querySelector('.lobby-players');
    const list = players();
    const sig = list.map((p) => `${p.peer}:${p.presence.n}:${p.presence.c}`).join('|');
    if (ul.dataset.sig === sig) return;
    ul.dataset.sig = sig;
    ul.innerHTML = '';
    for (const p of list) {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.style.background = `#${COLORS[p.presence.c || 0].toString(16).padStart(6, '0')}`;
      li.append(dot, `${p.presence.n || 'Ныряльщик'}${p.presence.r === 'h' ? ' · хост' : ''}${p.isMe && p.sameTab ? ' (ты)' : ''}`);
      ul.appendChild(li);
    }
  }

  function leave() {
    for (const r of C.remotes.values()) r.dispose();
    C.remotes.clear();
    C.room?.leave().catch(() => {});
    C.room = null;
    C.role = null;
    C.lobby = null;
    C.lobbyEl = null;
    C.waiting = false;
    C.sleeping = false;
    C.color = 0;
    ctx.player.suitColor = COLORS[0];
    ctx.player.suitMat.color.setHex(COLORS[0]);
    ctx.clearLabels();
  }

  // Участники комнаты: только те, кто играет в DEEPBACK (у них есть имя), не больше четырёх
  function players() {
    if (!C.room) return [];
    return C.room.peers().filter((p) => p.presence && p.presence.v === 1).slice(0, MAX_PLAYERS);
  }
  const hostPeer = () => players().find((p) => p.presence.r === 'h' && !(p.isMe && p.sameTab));

  // ---------- действия гостя ----------
  function act(a) {
    if (!coop.isGuest) return;
    C.seq++;
    C.acts.push({ ...a, s: C.seq });
    if (C.acts.length > 16) C.acts.shift();
    C.room.presence({ a: C.acts });
  }
  // гость потратил обломки: пару секунд не верим старому числу от хоста
  function holdSpend() {
    C.spendHold = 2.5;
  }

  // ---------- конец дня ----------
  // R у шлюза: ждать остальных в Ковчеге
  function wait(drowned = false) {
    C.waiting = true;
    C.drowned = drowned;
    ctx.hidePlayer();
  }
  function sleep() {
    C.sleeping = true;
  }
  function newDay() {
    C.waiting = false;
    C.drowned = false;
    C.sleeping = false;
  }
  // хост закончил день: строки сводки уходят гостям
  function hostNight(lines, over = false) {
    C.night = { lines: trimLines(lines), over };
    C.ep++;
  }
  function trimLines(lines) {
    const out = [];
    let size = 0;
    for (const l of lines) {
      const s = String(l).slice(0, 400);
      size += s.length * 2;
      if (size > 1800) break;
      out.push(s);
    }
    return out;
  }

  // ---------- такт ----------
  function tick(dt) {
    if (!C.room) return;
    C.sendT -= dt;
    if (C.lobby) renderLobby();
    // цвет — по месту в списке, чтобы не совпадал
    const list = players();
    const meIdx = list.findIndex((p) => p.isMe && p.sameTab);
    const want = meIdx >= 0 ? meIdx % COLORS.length : 0;
    if (want !== C.color) {
      C.color = want;
      ctx.player.suitColor = COLORS[want];
      ctx.player.suitMat.color.setHex(COLORS[want]);
    }
    if (C.role === 'host') hostTick(dt);
    else guestTick(dt);
    if (C.sendT <= 0) {
      C.sendT = SEND_EVERY;
      sendSelf();
    }
  }

  // каждый кадр: плавное движение чужих ныряльщиков и подписи над ними
  function frame(dt) {
    if (C.room) updateRemotes(dt);
  }

  function sendSelf() {
    const S = ctx.S;
    const p = ctx.player;
    const scn = C.waiting ? 'wait' : S.mode === 'ark' ? (C.sleeping ? 'sleep' : 'ark') : S.mode === 'day' || S.mode === 'closing' ? 'day' : 'menu';
    const patch = {
      s: scn,
      c: C.color,
      p: [round(p.pos.x), round(p.pos.y), round(p.pos.z), round(p.mesh.rotation.y)],
      sw: p.swimming ? 1 : 0,
      h: p.held || null,
      k: p.carried.length,
    };
    if (C.role === 'host') patch.w = world();
    C.room.presence(patch).catch(() => {});
  }

  // мир глазами хоста
  function world() {
    const S = ctx.S;
    const city = ctx.city;
    const w = {
      ep: C.ep,
      seed: S.runSeed,
      cyc: S.cycle,
      m: S.mode === 'wait' ? 'day' : S.mode,
      t: round(S.t),
      f: S.food,
      u: S.fuel,
      sc: S.scrap,
      pop: S.pop,
      lo: S.lore,
      up: S.up,
      al: S.alive,
      tk: city.pickups.map((pk, i) => (pk.active ? -1 : i)).filter((i) => i >= 0),
      dl: city.leeches.map((L, i) => (L.dead ? i : -1)).filter((i) => i >= 0),
    };
    if (C.night && (S.mode === 'night' || S.mode === 'ark' || S.mode === 'over')) {
      w.nl = C.night.lines;
      w.over = C.night.over ? 1 : 0;
    }
    return w;
  }

  function hostTick(dt) {
    const S = ctx.S;
    for (const p of players()) {
      if (p.isMe) continue;
      const acts = Array.isArray(p.presence.a) ? p.presence.a : [];
      let last = C.done.get(p.peer) || 0;
      for (const a of acts) {
        if (!a || typeof a.s !== 'number' || a.s <= last) continue;
        last = a.s;
        applyAct(a, p.presence.n || 'Ныряльщик');
      }
      C.done.set(p.peer, last);
    }
    // хост ждёт в Ковчеге: время идёт, а когда все внутри — день кончается
    if (C.waiting && S.mode === 'wait') {
      S.t += dt;
      const guests = players().filter((p) => !p.isMe);
      const allIn = guests.every((p) => p.presence.s === 'wait');
      if (allIn || S.t >= S.T) ctx.endDay('safe');
    }
  }

  function applyAct(a, who) {
    const S = ctx.S;
    const city = ctx.city;
    if (a.k === 'pick' && Number.isInteger(a.i)) {
      const pk = city.pickups[a.i];
      if (pk && pk.active) ctx.takePickup(pk);
    } else if (a.k === 'dep' && Array.isArray(a.it)) {
      ctx.applyDeposit(a.it.filter((t) => typeof t === 'string').slice(0, 16), who);
    } else if (a.k === 'kill' && Number.isInteger(a.i)) {
      const L = city.leeches[a.i];
      if (L && !L.dead) ctx.killLeech(L, true);
    } else if (a.k === 'spend' && Number.isFinite(a.n) && a.n > 0) {
      S.scrap = Math.max(0, S.scrap - Math.floor(a.n));
      if (typeof a.up === 'string' && Number.isInteger(a.lv)) {
        S.up = { ...S.up, [a.up]: Math.max(S.up[a.up] || 0, Math.min(a.lv, 5)) };
        ctx.applyUpgrades();
      }
    }
  }

  function guestTick(dt) {
    const S = ctx.S;
    const host = hostPeer();
    const now = performance.now();
    if (!host) {
      if (now - C.hostSeen > HOST_LOST * 1000) {
        leave();
        ctx.hostLeft();
      }
      return;
    }
    C.hostSeen = now;
    const w = host.presence.w;
    if (!w || typeof w.seed !== 'number') return;
    C.spendHold -= dt;
    // новый день (или первый): строим тот же город
    const dayKey = `${w.seed}:${w.cyc}`;
    if ((w.m === 'day' || w.m === 'closing') && C.hostEp !== dayKey) {
      C.hostEp = dayKey;
      C.lobby = null;
      C.lobbyEl = null;
      newDay();
      ctx.guestStartDay(w);
      return;
    }
    // общие запасы — у хоста
    if (C.spendHold <= 0) {
      S.scrap = w.sc;
      const upKey = JSON.stringify(w.up || {});
      if (upKey !== C.upKey) {
        C.upKey = upKey;
        S.up = { ...(w.up || {}) };
        ctx.applyUpgrades();
      }
    }
    S.food = w.f;
    S.fuel = w.u;
    S.pop = w.pop;
    S.lore = w.lo;
    if (Array.isArray(w.al)) S.alive = w.al.slice();
    if (S.mode === 'day' || S.mode === 'closing' || S.mode === 'wait') {
      if (Math.abs(S.t - w.t) > 1.5) S.t = w.t;
      if (Array.isArray(w.tk)) for (const i of w.tk) { const pk = ctx.city.pickups[i]; if (pk && pk.active) ctx.takePickup(pk); }
      if (Array.isArray(w.dl)) for (const i of w.dl) { const L = ctx.city.leeches[i]; if (L && !L.dead) ctx.killLeech(L, true); }
    }
    // ночь у хоста — сводка и гостям
    if ((w.m === 'night' || w.m === 'ark' || w.m === 'over') && C.hostEp === dayKey && Array.isArray(w.nl) && C.nightEp !== `${dayKey}:${w.ep}` && S.mode !== 'ark') {
      C.nightEp = `${dayKey}:${w.ep}`;
      ctx.guestNight(w.nl.filter((l) => typeof l === 'string'), { over: !!w.over, drowned: !!C.drowned, waited: C.waiting });
    }
  }

  // ---------- чужие ныряльщики ----------
  function updateRemotes(dt) {
    const S = ctx.S;
    const myScene = S.mode === 'ark' ? 'ark' : 'day';
    const seen = new Set();
    for (const p of players()) {
      if (p.isMe) continue;
      const pr = p.presence;
      if (!Array.isArray(pr.p) || pr.p.length < 4) continue;
      seen.add(p.peer);
      let r = C.remotes.get(p.peer);
      if (!r) {
        r = ctx.makeRemote();
        C.remotes.set(p.peer, r);
      }
      r.setColor(COLORS[pr.c || 0] || COLORS[0]);
      const visible = pr.s === myScene && S.mode !== 'menu' && S.mode !== 'intro';
      r.update(dt, pr, visible, myScene);
      ctx.label(p.peer, visible ? r.head() : null, pr.n || 'Ныряльщик', pr.k || 0, pr.s);
    }
    for (const [peer, r] of C.remotes) {
      if (!seen.has(peer)) {
        r.dispose();
        C.remotes.delete(peer);
        ctx.label(peer, null);
      }
    }
  }

  return coop;
}

const round = (v) => Math.round(v * 100) / 100;

// Чужой ныряльщик: та же модель, что у игрока, но движется по сетевым точкам
export class RemoteDiver {
  constructor(PlayerClass, scenes) {
    this.scenes = scenes;
    const holder = new THREE.Group();
    this.body = new PlayerClass(holder);
    this.mesh = this.body.mesh;
    holder.remove(this.mesh);
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.first = true;
    this.phase = 0;
    this.color = null;
    this.where = null;
  }

  setColor(hex) {
    if (this.color === hex) return;
    this.color = hex;
    this.body.suitMat.color.setHex(hex);
  }

  update(dt, pr, visible, sceneKey) {
    const [x, y, z, ry] = pr.p;
    this.target.set(x, y, z);
    if (this.first) {
      this.pos.copy(this.target);
      this.first = false;
    }
    const before = this.pos.clone();
    // догоняем последнюю точку: плавно, но без отставания на рывках
    const d = this.pos.distanceTo(this.target);
    if (d > 8) this.pos.copy(this.target);
    else this.pos.lerp(this.target, Math.min(1, dt * 10));
    const speed = before.distanceTo(this.pos) / Math.max(dt, 1e-3);
    this.phase += dt * speed * (pr.sw ? 0.8 : 1.6);
    const sw = Math.sin(this.phase) * Math.min(1, speed / 5) * 0.6;
    const b = this.body;
    b.legs[0].rotation.x = sw;
    b.legs[1].rotation.x = -sw;
    b.arms[0].rotation.x = -sw * 0.8;
    b.arms[1].rotation.x = pr.h ? -0.6 : sw * 0.8;
    b.pole.visible = pr.h === 'spear';
    b.handBomb.visible = pr.h === 'bombs';
    b.flareGun.visible = pr.h === 'flare';
    this.mesh.position.copy(this.pos);
    let diff = ry - this.mesh.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.mesh.rotation.y += diff * Math.min(1, dt * 10);
    this.mesh.rotation.x = pr.sw ? -0.9 * Math.min(1, speed / 3) : 0;
    // в своей сцене (город или зал Ковчега)
    const want = visible ? this.scenes[sceneKey] : null;
    if (this.where !== want) {
      this.where?.remove(this.mesh);
      want?.add(this.mesh);
      this.where = want;
    }
  }

  head() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 2.4, this.pos.z);
  }

  dispose() {
    this.where?.remove(this.mesh);
    this.where = null;
  }
}
