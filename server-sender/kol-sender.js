// משדר צד-שרת: קולט את הקול של שולחן העבודה בשרת ושולח אותו לממסר.
// משתני סביבה:
//   KOL_URL      כתובת הממסר (ברירת מחדל: wss://kol-audio.onrender.com/ws)
//   KOL_KEY      קוד גישה
//   KOL_ROOM     שם חדר (ברירת מחדל: main)
//   KOL_RATE     קצב דגימה (ברירת מחדל: 24000)
//   KOL_CHANNELS מספר ערוצים (ברירת מחדל: 2)
//   KOL_CMD      פקודת קליטה חלופית שכותבת PCM s16le ל-stdout
const { spawn } = require('child_process');
const WebSocket = require('ws');

const URL_ = process.env.KOL_URL || 'wss://kol-audio.onrender.com/ws';
const KEY = process.env.KOL_KEY || '';
const ROOM = process.env.KOL_ROOM || 'main';
const RATE = +(process.env.KOL_RATE || 24000);
const CH = +(process.env.KOL_CHANNELS || 2);
const CMD = process.env.KOL_CMD ||
  `parec --raw --format=s16le --rate=${RATE} --channels=${CH} --latency-msec=20 -d @DEFAULT_MONITOR@`;

const CHUNK = Math.round(RATE * 0.02) * CH * 2; // חבילות של 20ms
let ws = null, pending = Buffer.alloc(0), listeners = 0;

function connect() {
  const q = new URLSearchParams({ role: 'sender', room: ROOM, key: KEY });
  ws = new WebSocket(`${URL_}?${q}`);
  ws.on('open', () => {
    console.log('connected to relay');
    ws.send(JSON.stringify({ type: 'config', sampleRate: RATE, channels: CH }));
  });
  ws.on('message', (d, bin) => {
    if (bin) return;
    try {
      const m = JSON.parse(d.toString());
      if (m.type === 'listeners' && m.count !== listeners) console.log(`listeners: ${(listeners = m.count)}`);
      if (m.type === 'error') console.error('relay error:', m.message);
    } catch {}
  });
  ws.on('close', (code) => {
    console.log(`relay closed (${code}), reconnecting in 3s`);
    setTimeout(connect, 3000);
  });
  ws.on('error', (e) => console.error('ws error:', e.message));
}

function startCapture() {
  console.log('capture:', CMD);
  const p = spawn('sh', ['-c', CMD], { stdio: ['ignore', 'pipe', 'inherit'] });
  p.stdout.on('data', (buf) => {
    pending = pending.length ? Buffer.concat([pending, buf]) : buf;
    while (pending.length >= CHUNK) {
      const out = pending.subarray(0, CHUNK);
      pending = pending.subarray(CHUNK);
      // שולחים רק כשיש מאזינים וכשהרשת לא עמוסה
      if (listeners && ws && ws.readyState === 1 && ws.bufferedAmount < 64 * 1024) ws.send(Buffer.from(out));
    }
  });
  p.on('exit', (code) => {
    console.error(`capture exited (${code}), restarting in 3s`);
    setTimeout(startCapture, 3000);
  });
}

connect();
startCapture();
