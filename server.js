// שרת ממסר: מקבל שמע מהמחשב המשדר ומעביר אותו לכל המאזינים באותו חדר.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;
const ACCESS_KEY = process.env.ACCESS_KEY || '';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  if (file === '/send') file = '/send.html';
  if (file === '/listen') file = '/listen.html';
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('לא נמצא');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// rooms: name -> { sender, config, listeners:Set }
const rooms = new Map();
function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, { sender: null, config: null, listeners: new Set() });
  return rooms.get(name);
}
function cleanup(name) {
  const r = rooms.get(name);
  if (r && !r.sender && r.listeners.size === 0) rooms.delete(name);
}
function sendJson(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
function notifySender(room) {
  if (room.sender) sendJson(room.sender, { type: 'listeners', count: room.listeners.size });
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1 << 20 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const role = url.searchParams.get('role');
  const roomName = (url.searchParams.get('room') || 'main').slice(0, 64);
  const key = url.searchParams.get('key') || '';

  if (ACCESS_KEY && key !== ACCESS_KEY) {
    sendJson(ws, { type: 'error', message: 'קוד גישה שגוי' });
    return ws.close(4001, 'bad key');
  }
  if (role !== 'sender' && role !== 'listener') return ws.close(4000, 'bad role');

  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  const room = getRoom(roomName);

  if (role === 'sender') {
    if (room.sender) {
      sendJson(room.sender, { type: 'error', message: 'משדר אחר התחבר לחדר הזה' });
      room.sender.close(4002, 'replaced');
    }
    room.sender = ws;
    room.config = null;
    notifySender(room);

    ws.on('message', (data, isBinary) => {
      if (room.sender !== ws) return;
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'config') {
            room.config = { type: 'config', sampleRate: msg.sampleRate | 0, channels: msg.channels | 0 };
            for (const l of room.listeners) sendJson(l, room.config);
          }
        } catch {}
        return;
      }
      for (const l of room.listeners) {
        // מאזין איטי מדי מדלג על חבילות במקום לצבור עיכוב
        if (l.readyState === l.OPEN && l.bufferedAmount < 256 * 1024) l.send(data, { binary: true });
      }
    });
    ws.on('close', () => {
      if (room.sender === ws) {
        room.sender = null;
        room.config = null;
        for (const l of room.listeners) sendJson(l, { type: 'sender-gone' });
      }
      cleanup(roomName);
    });
  } else {
    room.listeners.add(ws);
    if (room.config) sendJson(ws, room.config);
    else sendJson(ws, { type: 'sender-gone' });
    notifySender(room);
    ws.on('close', () => {
      room.listeners.delete(ws);
      notifySender(room);
      cleanup(roomName);
    });
  }
});

// פינג קבוע שומר על החיבור פתוח וסוגר חיבורים מתים
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log(`kol listening on ${PORT}`));
