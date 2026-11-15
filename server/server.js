'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { Game, durationMs } = require('../public/engine');
const { MockBot } = require('../public/mock');

const PUBLIC = path.resolve(__dirname, '../public');
const WAITING = 'המרוץ עוד לא התחיל — חכו שהמנחה יתחיל';
const RESET = 'המרוץ אופס — הפעולה מהמרוץ הקודם בוטלה. בדקו שוב את מצב החדר.';
const RULES = 'אתם רובוט בחדר בריחה עם ארבעה חדרים ברצף. חקרו את החדרים ובדקו את החפצים; חפצים יכולים להסתיר חפצים אחרים. השתמשו במזהי החפצים שבסוגריים. חשבו בקול בעברית דרך thought — הקהל רואה אותו בשידור. You are a robot in an escape room with four rooms in a row. Explore and inspect objects; objects can hide other objects. Think out loud in Hebrew in thought.';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };

function problem(status, message) { return Object.assign(new Error(message), { status }); }
function matches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function bearer(req) { return /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1]; }
function factor(value, fallback, name) {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${name} must be between 0 and 100`);
  return n;
}
function validSeed(seed) {
  if (!(Number.isSafeInteger(seed) || (typeof seed === 'string' && seed.length > 0 && seed.length <= 256))) {
    throw problem(400, 'הזרע חייב להיות מספר שלם או טקסט באורך 1–256 תווים.');
  }
  return seed;
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let bytes = 0;
  const chunks = [];
  // Do not destroy the socket on an oversized body: the caller still needs its 413 response.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > 65536) { req.resume(); throw problem(413, 'הבקשה גדולה מדי.'); }
    chunks.push(chunk);
  }
  try { return bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; }
  catch (_) { throw problem(400, 'JSON לא תקין.'); }
}

function createRaceServer(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const contestants = JSON.parse(JSON.stringify(options.contestants ?? JSON.parse(fs.readFileSync(
    env.CONTESTANTS_FILE || (fs.existsSync(path.join(__dirname, 'contestants.json')) ? path.join(__dirname, 'contestants.json') : path.join(__dirname, 'contestants.example.json')), 'utf8').replace(/^\uFEFF/, ''))));
  if (!Array.isArray(contestants) || contestants.length > 4 || contestants.some(p => !p ||
      typeof p.name !== 'string' || !p.name.trim() || !/^#[0-9a-f]{6}$/i.test(p.color) ||
      typeof p.key !== 'string' || !p.key.trim()) || new Set(contestants.map(p => p.key)).size !== contestants.length) {
    throw new Error('contestants.json must contain up to 4 contestants with a name, #RRGGBB color and unique nonempty key');
  }
  const adminKey = env.ADMIN_KEY || randomBytes(24).toString('hex');
  const pace = factor(env.PACE, 1, 'PACE');
  // Both are duration multipliers: values below 1 make the demo faster.
  const botSpeed = factor(env.BOT_SPEED, 1, 'BOT_SPEED');
  const viewers = new Set(), connections = new Set(), mcpServers = new Set(), botTasks = new Set();
  let race, heartbeat, closed = false, closePromise;
  const newSeed = () => randomBytes(6).toString('hex');
  const players = Array.from({ length: 4 }, (_, i) => {
    const person = contestants[i] || MockBot.PERSONALITIES[i - contestants.length];
    return { name: person.name, color: person.color, bot: i >= contestants.length };
  });
  const status = () => ({ state: race.status, places: race.game.finishOrder.slice() });
  const init = () => ({ seed: race.seed, players, log: race.log, status: race.status });
  const snapshot = () => ({ ...init(), places: race.game.finishOrder.slice(), game: race.game.state,
    startedAt: race.startedAt, errors: race.errors });
  function writeEvent(res, type, value) {
    if (res.destroyed || res.writableEnded) { viewers.delete(res); return; }
    if (res.writableLength > 1024 * 1024) { viewers.delete(res); res.destroy(); return; }
    res.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
  }
  function broadcast(type, value) { for (const res of viewers) writeEvent(res, type, value); }
  function lobby(seed = newSeed()) {
    const nextSeed = validSeed(seed);
    race?.controller.abort();
    race = { seed: nextSeed, game: new Game(nextSeed, 4), status: 'lobby', log: [], errors: [],
      controller: new AbortController(), queues: Array.from({ length: 4 }, () => Promise.resolve()), startedAt: null };
    broadcast('init', init());
    broadcast('status', status());
    return snapshot();
  }
  function current(r) { return !closed && r === race && !r.controller.signal.aborted; }
  async function wait(r, ms) {
    try { await delay(ms, undefined, { signal: r.controller.signal }); return current(r); }
    catch (error) { if (error.name !== 'AbortError') throw error; return false; }
  }
  function statusLine(r, i) {
    const p = r.game.players[i];
    const name = id => r.game.items[id]?.name || Object.values(r.game.rooms)
      .flatMap(room => room.objects).find(obj => obj.id === id)?.name || id;
    const held = [...new Set([...p.inventory, ...(p.carrying ? [p.carrying] : [])])];
    return `חדר: ${r.game.rooms[p.room].name} (${p.room}) | מלאי: ${held.map(id => `${name(id)} (${id})`).join(', ') || 'ריק'}`;
  }
  function enqueue(r, i, cmd, thought, multiplier = 1) {
    const action = r.queues[i].then(async () => {
      if (!current(r)) return { text: RESET };
      const p = r.game.players[i];
      if (p.escaped) return { text: `כבר סיימתם את המרוץ במקום ${p.place}.\n${statusLine(r, i)}` };
      if (r.status !== 'running') return { text: `${WAITING}\n${statusLine(r, i)}` };
      const result = r.game.act(i, cmd);
      const entry = { p: i, cmd, thought, t: Math.max(0, Math.round(performance.now() - r.startTime)) };
      r.log.push(entry);
      broadcast('action', { p: i, cmd, thought });
      if (r.game.finished) r.status = 'finished';
      if (p.escaped || r.status === 'finished') broadcast('status', status());
      const text = `${result.text}${cmd.op === 'look' ? `\n\n${RULES}` : ''}\n\n${statusLine(r, i)}`;
      const active = await wait(r, durationMs(cmd, result) * pace * multiplier);
      return active ? { result, text } : { text: RESET };
    });
    // Recover the tail, while preserving the original error for this caller.
    r.queues[i] = action.catch(() => {});
    return action;
  }
  async function runBot(r, i, bot) {
    while (current(r) && r.status === 'running' && !r.game.players[i].escaped) {
      if (!await wait(r, bot.thinkingMs() * pace * botSpeed)) break;
      if (!current(r) || r.status !== 'running') break;
      const next = bot.next();
      if (!next) break;
      const outcome = await enqueue(r, i, next.cmd, next.thought, botSpeed);
      if (!outcome.result) break;
      bot.observe(outcome.result);
    }
  }
  function start() {
    if (race.status === 'running') return snapshot();
    if (race.status !== 'lobby') throw problem(409, 'פתחו לובי חדש לפני מרוץ נוסף.');
    const r = race;
    const bots = players.map((p, i) => p.bot ? new MockBot(r.game, i,
      MockBot.PERSONALITIES[i - contestants.length].id, r.seed) : null);
    r.status = 'running';
    r.startedAt = Date.now();
    r.startTime = performance.now();
    broadcast('status', status());
    bots.forEach((bot, i) => {
      if (!bot) return;
      const task = runBot(r, i, bot).catch(error => {
        if (current(r)) {
          r.errors.push({ p: i, message: 'הבוט נעצר בגלל שגיאה. ניתן לפתוח לובי חדש.' });
          logger.error(`Mock bot ${i} stopped: ${error.message}`);
        }
      }).finally(() => botTasks.delete(task));
      botTasks.add(task);
    });
    return snapshot();
  }

  function makeMcp(i) {
    const mcp = new McpServer({ name: 'escape-race', version: '1.0.0' }, { instructions: RULES });
    const id = () => z.string().min(1).max(128);
    const definitions = {
      look: ['הסתכלו סביב וקראו את כללי המשחק. Look around and read the game rules.', {}],
      inspect: ['בדקו חפץ מקרוב; ייתכן שהוא מסתיר חפצים. Inspect an object closely.', { target: id() }],
      take: ['קחו חפץ; ניתן לשאת ארגז אחד בכל פעם. Pick up an object.', { target: id() }],
      use: ['השתמשו בחפץ, עם יעד לפי הצורך. Use an item, optionally on a target.', { item: id(), target: id().optional() }],
      enter_code: ['הקלידו קוד בלוח המקשים בכספת. Enter a code at the vault keypad.', { code: z.string().min(1).max(32) }],
      go: ['עברו לחדר סמוך דרך דלת פתוחה. Go to an adjacent room through an open door.', { room: z.enum(['lab', 'storage', 'minefield', 'vault']) }],
      step: ['צעדו במשבצת בשדה המוקשים; המספור מתחיל ב־0. Step on a minefield tile; indices start at 0.', { row: z.number().int().min(0).max(8), col: z.number().int().min(0).max(6) }],
      inventory: ['בדקו אילו חפצים אתם מחזיקים. Check your inventory.', {}]
    };
    for (const [op, [description, shape]] of Object.entries(definitions)) {
      mcp.registerTool(op, { description: `${description}\n${RULES}`, inputSchema: {
        ...shape, thought: z.string().min(1).max(4000).describe('מה אתה חושב עכשיו — בעברית, יוצג לקהל בשידור')
      } }, async ({ thought, ...args }) => {
        const outcome = await enqueue(race, i, { op, ...args }, thought);
        return { content: [{ type: 'text', text: outcome.text }] };
      });
    }
    return mcp;
  }
  function admin(req, url) {
    if (!matches(req.headers['x-admin-key'] || bearer(req) || url.searchParams.get('admin'), adminKey)) {
      throw problem(401, 'מפתח מנחה חסר או שגוי.');
    }
  }
  async function staticFile(req, res, filename) {
    const data = await fsp.readFile(filename);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length, 'Cache-Control': res.getHeader('Cache-Control') || 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  }
  async function route(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/mcp') {
      // Inspector can run on another local origin. Every actual request still requires a key.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID');
      res.setHeader('Access-Control-Expose-Headers', 'MCP-Protocol-Version, Mcp-Session-Id');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const key = bearer(req) || url.searchParams.get('key');
      const i = contestants.findIndex(p => matches(key, p.key));
      if (i < 0) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="escape-race"');
        throw problem(401, 'מפתח מתמודד חסר או שגוי.');
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return json(res, 405, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Stateless MCP uses POST requests.' } });
      }
      const parsed = await body(req);
      const mcp = makeMcp(i);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      mcpServers.add(mcp);
      const cleanup = () => { if (mcpServers.delete(mcp)) mcp.close().catch(() => {}); };
      res.once('close', cleanup);
      try { await mcp.connect(transport); await transport.handleRequest(req, res, parsed); }
      catch (error) { cleanup(); throw error; }
      return;
    }
    if (url.pathname.startsWith('/api/host/')) {
      admin(req, url);
      const action = url.pathname.slice('/api/host/'.length);
      if (action === 'state' && req.method === 'GET') return json(res, 200, { ...snapshot(), contestants });
      if (!['lobby', 'start', 'reset'].includes(action)) throw problem(404, 'נתיב לא נמצא.');
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw problem(405, 'נדרשת בקשת POST.'); }
      const data = await body(req);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw problem(400, 'נדרש אובייקט JSON.');
      return json(res, 200, action === 'start' ? start() : lobby(data.seed === undefined ? newSeed() : data.seed));
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); throw problem(405, 'שיטה לא נתמכת.'); }
    if (url.pathname === '/api/events') {
      if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      viewers.add(res);
      res.once('close', () => viewers.delete(res));
      res.on('error', () => { viewers.delete(res); res.destroy(); });
      writeEvent(res, 'init', init());
      return;
    }
    if (url.pathname === '/api/state') return json(res, 200, snapshot());
    if (url.pathname === '/host') {
      admin(req, url);
      res.setHeader('Cache-Control', 'no-store');
      return staticFile(req, res, path.join(__dirname, 'host.html'));
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (_) { throw problem(400, 'כתובת לא תקינה.'); }
    if (pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.')) || pathname.includes('\0')) throw problem(404, 'קובץ לא נמצא.');
    const filename = await fsp.realpath(path.resolve(PUBLIC, '.' + (pathname === '/' ? '/index.html' : pathname)));
    const relative = path.relative(PUBLIC, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw problem(404, 'קובץ לא נמצא.');
    return staticFile(req, res, filename);
  }
  const server = http.createServer((req, res) => {
    route(req, res).catch(error => {
      const code = error.status || (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code) ? 404 : 500);
      if (code === 500) logger.error(`HTTP request failed: ${error.message}`);
      if (res.headersSent) { res.destroy(); return; }
      json(res, code, { error: code === 500 ? 'שגיאה פנימית. נסו שוב.' : code === 404 ? 'נתיב לא נמצא.' : error.message });
    });
  });
  server.on('connection', socket => { connections.add(socket); socket.once('close', () => connections.delete(socket)); });
  server.on('clientError', (_error, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); else socket.destroy(); });
  lobby(options.seed ?? env.SEED ?? newSeed());

  async function listen(port = env.PORT === undefined ? 3000 : Number(env.PORT), host = '0.0.0.0') {
    if (closed) throw new Error('Server is closed');
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
    });
    heartbeat = setInterval(() => {
      for (const res of viewers) {
        if (res.destroyed || res.writableLength > 1024 * 1024) { viewers.delete(res); res.destroy(); }
        else res.write(': heartbeat\n\n');
      }
    }, 15000);
    heartbeat.unref();
    if (env.AUTO_START === '1') start();
    return server.address();
  }
  function close() {
    if (closePromise) return closePromise;
    closed = true;
    race.controller.abort();
    clearInterval(heartbeat);
    for (const res of viewers) res.end();
    viewers.clear();
    closePromise = (async () => {
      await Promise.allSettled([...botTasks, ...race.queues, ...[...mcpServers].map(mcp => mcp.close())]);
      mcpServers.clear();
      const stopped = new Promise(resolve => server.listening ? server.close(resolve) : resolve());
      for (const socket of connections) socket.destroy();
      await stopped;
    })();
    return closePromise;
  }
  function banner() {
    const base = `http://localhost:${server.address().port}`;
    logger.log(`\nEscape Race — מרוץ חדרי הבריחה\nצפייה: ${base}/?mode=live\nמנחה: ${base}/host?admin=${encodeURIComponent(adminKey)}\nADMIN_KEY: ${adminKey}\nMCP: ${base}/mcp\nPACE=${pace}, BOT_SPEED=${botSpeed} (duration multipliers)`);
    contestants.forEach((p, i) => logger.log(`שחקן ${i + 1}: ${p.name}\n  Authorization: Bearer ${p.key}\n  ${base}/mcp?key=${encodeURIComponent(p.key)}`));
    logger.log(`בוטים: ${4 - contestants.length}\n`);
  }
  return { server, listen, close, banner };
}

if (require.main === module) {
  let app;
  (async () => {
    app = createRaceServer();
    await app.listen();
    app.banner();
    const stop = () => app.close().catch(error => { console.error(error.message); process.exitCode = 1; });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  })().catch(async error => {
    console.error(`Could not start Escape Race: ${error.message}`);
    if (app) await app.close();
    process.exitCode = 1;
  });
}

module.exports = { createRaceServer };
