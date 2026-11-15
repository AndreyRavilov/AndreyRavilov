// Мини-сервер статики для игры и e2e-тестов: node tools/serve.mjs [порт]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

// Комнаты совместной игры для локального запуска: каждый игрок раз в 0,1 с
// присылает своё состояние и получает состояния остальных. В Claude вместо
// этого работают комнаты платформы (см. src/net.js).
const rooms = new Map();
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
function relay(name, msg) {
  if (!rooms.has(name)) {
    if (rooms.size >= 100) return null;
    rooms.set(name, new Map());
  }
  const room = rooms.get(name);
  const now = Date.now();
  for (const [peer, o] of room) if (now - o.seen > 15000) room.delete(peer);
  if (typeof msg.peer === 'string' && msg.peer.length <= 16) {
    if (msg.bye) room.delete(msg.peer);
    else if (room.has(msg.peer) || room.size < 8) room.set(msg.peer, { presence: msg.presence || {}, seen: now });
  }
  if (!room.size) rooms.delete(name);
  return [...room].map(([peer, o]) => ({ peer, presence: o.presence }));
}

export function serve(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__room/') && req.method === 'POST') {
      const name = url.pathname.slice(8);
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8192) break;
      }
      let msg = null;
      try { msg = JSON.parse(body); } catch { /* ниже — 400 */ }
      const peers = ROOM_RE.test(name) && msg && typeof msg === 'object' ? relay(name, msg) : null;
      res.writeHead(peers ? 200 : 400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(peers ? { peers } : { error: 'bad request' }));
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT) || file.includes('node_modules')) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 8000);
  serve(port).then(() => console.log(`DEEPBACK: http://localhost:${port}`));
}
