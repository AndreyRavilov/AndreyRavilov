// Связь для совместной игры.
// На странице игры в Claude — комнаты платформы (возможность room): все, кто
// открыл ссылку, видят друг друга. Вне Claude (локальный запуск, автотесты) —
// BroadcastChannel: игроки в соседних вкладках одного браузера.
// Оба варианта дают одинаковый интерфейс именованной комнаты:
// presence(patch), peers(), connected(), leave().

export async function openNet() {
  const c = typeof window !== 'undefined' ? window.claude : null;
  if (c && typeof c.use === 'function') {
    try {
      const room = await c.use('room');
      if (room) return { kind: 'claude', join: (name) => room.join(name) };
    } catch {
      /* нет связи — ниже вернём null */
    }
    return null;
  }
  // локальный сервер игры (npm start) держит комнаты сам — тогда играть можно из разных браузеров
  try {
    const r = await fetch('/__room/probe', { method: 'POST', body: '{}' });
    if (r.ok) return { kind: 'server', join: async (name) => serverRoom(name) };
  } catch {
    /* статический хостинг без комнат */
  }
  if (typeof BroadcastChannel === 'function') return { kind: 'local', join: async (name) => localRoom(name) };
  return null;
}

function snapshotOf(me, mine, others) {
  const now = Date.now();
  return Object.freeze([
    { peer: me, isMe: true, sameTab: true, kind: 'viewer', guest: false, by: null, presence: mine, updatedAt: now },
    ...others.map((o) => ({ peer: o.peer, isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null, presence: o.presence || {}, updatedAt: now })),
  ]);
}

// Комната через локальный сервер: опрос раз в 0,1 с
export function serverRoom(name) {
  const me = Math.random().toString(36).slice(2, 10);
  let mine = {};
  let snapshot = snapshotOf(me, mine, []);
  let alive = true;
  let busy = false;
  const post = (body) => fetch(`/__room/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const poll = setInterval(async () => {
    if (busy || !alive) return;
    busy = true;
    try {
      const r = await post({ peer: me, presence: mine });
      const j = await r.json();
      if (alive && Array.isArray(j.peers)) snapshot = snapshotOf(me, mine, j.peers.filter((p) => p.peer !== me));
    } catch {
      /* сервер на миг недоступен — попробуем в следующий раз */
    }
    busy = false;
  }, 100);
  return {
    name,
    async presence(patch) {
      mine = { ...mine };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete mine[k];
        else mine[k] = v;
      }
      snapshot = snapshotOf(me, mine, snapshot.filter((p) => !p.isMe));
    },
    peers: () => snapshot,
    connected: () => alive,
    async leave() {
      alive = false;
      clearInterval(poll);
      await post({ peer: me, bye: true }).catch(() => {});
    },
  };
}

// Комната между вкладками: каждый рассылает своё состояние, молчащих 4 с — забываем
export function localRoom(name) {
  const me = Math.random().toString(36).slice(2, 10);
  const ch = new BroadcastChannel(`deepback-${name}`);
  let mine = {};
  const others = new Map();
  let snapshot = [];
  const rebuild = () => {
    const now = Date.now();
    snapshot = Object.freeze([
      { peer: me, isMe: true, sameTab: true, kind: 'viewer', guest: false, by: null, presence: mine, updatedAt: now },
      ...[...others].map(([peer, o]) => ({ peer, isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null, presence: o.presence, updatedAt: o.seen })),
    ]);
  };
  const send = () => ch.postMessage({ t: 'p', peer: me, presence: mine });
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.peer === me) return;
    if (m.t === 'bye') others.delete(m.peer);
    else if (m.t === 'hello') send();
    else if (m.t === 'p') others.set(m.peer, { presence: m.presence, seen: Date.now() });
    rebuild();
  };
  let timer = null;
  const beat = setInterval(() => {
    send();
    const now = Date.now();
    for (const [p, o] of others) if (now - o.seen > 15000) others.delete(p);
    rebuild();
  }, 1000);
  rebuild();
  ch.postMessage({ t: 'hello', peer: me });
  return {
    name,
    async presence(patch) {
      mine = { ...mine };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete mine[k];
        else mine[k] = v;
      }
      rebuild();
      if (!timer) timer = setTimeout(() => { timer = null; send(); }, 33);
    },
    peers: () => snapshot,
    connected: () => true,
    async leave() {
      clearInterval(beat);
      ch.postMessage({ t: 'bye', peer: me });
      ch.close();
    },
  };
}

// Код комнаты: 4 знака без похожих друг на друга (0/o, 1/l)
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function roomCode(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  return s;
}
export function normalizeCode(text) {
  const s = String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return s.length === 4 && [...s].every((ch) => ALPHABET.includes(ch)) ? s : null;
}
