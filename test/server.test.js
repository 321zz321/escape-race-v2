'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { createRaceServer } = require('../server/server');
const { Game, durationMs } = require('../public/engine');
const { solve } = require('./helpers');

async function until(predicate, description, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await predicate();
    if (result) return result;
    await delay(5);
  }
  throw new Error(`Timed out: ${description}`);
}

function sse(url) {
  const events = [];
  let response, failure, buffer = '';
  const request = http.get(url, res => {
    response = res;
    if (res.statusCode !== 200) failure = new Error(`SSE status ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('error', error => { failure = error; });
    res.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const message = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const type = /^event: (.+)$/m.exec(message)?.[1];
        const data = /^data: (.+)$/m.exec(message)?.[1];
        if (type && data) events.push({ type, data: JSON.parse(data) });
      }
    });
  });
  request.on('error', error => { failure = error; });
  return { events, close() { request.destroy(); response?.destroy(); },
    wait(predicate) { return until(() => { if (failure) throw failure; return events.find(predicate); }, 'SSE event'); } };
}

async function integration() {
  const errors = [];
  const contestants = [{ name: 'עידן', color: '#ff7a45', key: 'server-test-key' }];
  const env = { ADMIN_KEY: 'server-test-admin', AUTO_START: '', PACE: '0.05', BOT_SPEED: '0.05' };
  const app = createRaceServer({ env, contestants, seed: 'initial-lobby',
    logger: { log() {}, error(message) { errors.push(message); } } });
  const clients = [];
  const streams = [];
  try {
    const address = await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    const state = async () => (await fetch(`${base}/api/state`)).json();
    const host = async (action, payload = {}) => {
      const response = await fetch(`${base}/api/host/${action}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': env.ADMIN_KEY }, body: JSON.stringify(payload) });
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const connect = async query => {
      const client = new Client({ name: 'escape-race-integration', version: '1.0.0' });
      clients.push(client);
      const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp${query ? '?key=server-test-key' : ''}`),
        query ? {} : { requestInit: { headers: { Authorization: 'Bearer server-test-key' } } });
      await client.connect(transport);
      return client;
    };
    assert.equal((await state()).status, 'lobby');
    for (const url of ['/mcp', '/mcp?key=wrong', '/host', '/host?admin=wrong', '/api/host/state']) {
      assert.equal((await fetch(base + url)).status, 401, url);
    }
    const rejected = new Client({ name: 'wrong-key', version: '1.0.0' });
    clients.push(rejected);
    await assert.rejects(rejected.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp?key=wrong`))));
    assert.equal((await fetch(`${base}/api/host/start`, { method: 'POST' })).status, 401);
    const hostPage = await fetch(`${base}/host?admin=${env.ADMIN_KEY}`);
    assert.equal(hostPage.status, 200);
    assert.equal(hostPage.headers.get('cache-control'), 'no-store');
    assert.match(await hostPage.text(), /lang="he" dir="rtl"/);
    for (const [url, type] of [['/engine.js', 'text/javascript'], ['/', 'text/html']]) {
      const response = await fetch(base + url);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith(type));
    }
    for (const url of ['/server/contestants.json', '/%2e%2e%5cserver%5ccontestants.json', '/.git/config', '/bad%ZZ']) {
      assert.ok([400, 404].includes((await fetch(base + url)).status), url);
    }
    const events = sse(`${base}/api/events`); streams.push(events);
    const first = await events.wait(event => event.type === 'init');
    assert.equal(first.data.seed, 'initial-lobby');
    assert.equal(first.data.status, 'lobby');
    assert.deepEqual(first.data.log, []);
    assert.equal(first.data.players.filter(p => p.bot).length, 3);
    assert.ok(first.data.players.every(p => !('key' in p)));

    const client = await connect(false);
    const queryClient = await connect(true);
    assert.match(client.getInstructions(), /four rooms in a row/);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['look', 'inspect', 'take', 'use', 'enter_code', 'go', 'step', 'inventory'].sort());
    for (const tool of tools) {
      assert.ok(tool.inputSchema.required.includes('thought'), tool.name);
      assert.equal(tool.inputSchema.properties.thought.type, 'string');
      assert.match(tool.inputSchema.properties.thought.description, /מה אתה חושב עכשיו/);
      assert.match(tool.description, /four rooms in a row/);
      assert.match(tool.description, /חפצים יכולים להסתיר/);
      for (const word of ['רמז', 'חשוב', 'מתכון יעזור', 'להמיס', 'תמיס', 'קוד הכספת', 'פתרון']) {
        assert.ok(!tool.description.includes(word), word);
        assert.ok(!client.getInstructions().includes(word), word);
      }
    }
    const call = (name, args = {}, target = client) => target.callTool({ name, arguments: { ...args, thought: args.thought || 'אני בודק את הרמזים וממשיך לחקור.' } });
    const waiting = await call('look');
    assert.ok(!waiting.isError);
    assert.match(waiting.content[0].text, /המרוץ עוד לא התחיל — חכו שהמנחה יתחיל/);
    assert.equal((await state()).log.length, 0);
    assert.equal((await client.callTool({ name: 'look', arguments: {} })).isError, true);

    const lobby = await host('lobby', { seed: 'server-complete-game' });
    await events.wait(e => e.type === 'init' && e.data.seed === lobby.seed);
    assert.equal(lobby.status, 'lobby');
    assert.equal((await host('start')).status, 'running');
    await events.wait(e => e.type === 'status' && e.data.state === 'running');
    const originalStart = (await state()).startedAt;
    assert.equal((await host('start')).startedAt, originalStart, 'start is idempotent');

    let answered = false;
    const firstCall = call('inspect', { target: 'wall_clock', thought: 'תור ראשון' }).then(result => { answered = true; return result; });
    await events.wait(e => e.type === 'action' && e.data.thought === 'תור ראשון');
    assert.equal(answered, false, 'SSE action is emitted before the paced reply');
    const secondCall = call('inventory', { thought: 'תור שני' }, queryClient);
    const [one, two] = await Promise.all([firstCall, secondCall]);
    assert.ok(!one.isError && !two.isError);
    const queueLog = (await state()).log.filter(e => e.p === 0);
    assert.deepEqual(queueLog.map(e => e.thought), ['תור ראשון', 'תור שני']);
    const expectedDelay = durationMs({ op: 'inspect' }, { ok: true, ev: [] }) * Number(env.PACE);
    assert.ok(queueLog[1].t - queueLog[0].t >= expectedDelay - 5, 'separate MCP connections share the slot pacing queue');

    const bad = await call('step', { row: -1, col: 99 });
    assert.equal(bad.isError, true);
    const invalidGameAction = await call('take', { target: 'unknown_object' });
    assert.ok(!invalidGameAction.isError);
    assert.match(invalidGameAction.content[0].text, /חדר:.*מלאי:/s);

    // The independent solver uses Game.solution() for recipes, weights, code and a safe mine path.
    // Execute that COMPLETE journey through a real MCP client, including the return to the lab.
    const seed = (await state()).seed;
    const expectedGame = new Game(seed, 4);
    const solutionLog = [];
    solve(expectedGame, 0, solutionLog);
    for (const { cmd, result } of solutionLog) {
      const { op, ...args } = cmd;
      const reply = await call(op, args);
      assert.ok(!reply.isError, JSON.stringify(reply));
      // The final place can differ because bots race concurrently.
      assert.ok(reply.content[0].text.includes(result.text.split(' דלת הכספת נפתחה!')[0]), `${op}: ${reply.content[0].text}`);
      assert.match(reply.content[0].text, /חדר:.*מלאי:/s);
      if (op === 'look') assert.match(reply.content[0].text, /four rooms in a row/);
    }
    const finished = await until(async () => { const s = await state(); return s.status === 'finished' && s; }, 'all three mock bots finish');
    assert.equal(finished.game.players.filter(p => p.escaped).length, 4);
    assert.deepEqual([...finished.game.players.map(p => p.place)].sort(), [1, 2, 3, 4]);
    assert.deepEqual(finished.errors, []);
    assert.deepEqual(errors, []);
    assert.equal(finished.places.length, 4);
    const ended = await events.wait(e => e.type === 'status' && e.data.state === 'finished');
    assert.deepEqual(ended.data.places, finished.places);
    const escaped = await call('look');
    assert.ok(!escaped.isError);
    assert.ok(escaped.content[0].text.includes(`במקום ${finished.game.players[0].place}`));
    assert.equal((await state()).log.length, finished.log.length, 'escaped tools do not add actions');
    assert.ok(!JSON.stringify(finished).includes('server-test-key'));
    assert.ok(finished.log.every(e => Number.isFinite(e.t) && typeof e.thought === 'string'));
    const replay = new Game(seed, 4);
    for (const entry of finished.log) replay.act(entry.p, entry.cmd);
    assert.deepEqual(replay.state, finished.game, 'SSE log fully reconstructs the authoritative game');
    const actionEvents = events.events.filter(e => e.type === 'action').map(e => e.data);
    assert.deepEqual(actionEvents, finished.log.map(({ p, cmd, thought }) => ({ p, cmd, thought })));
    const reconnect = sse(`${base}/api/events`); streams.push(reconnect);
    const caughtUp = await reconnect.wait(e => e.type === 'init');
    assert.deepEqual(caughtUp.data.log, finished.log);
    assert.equal(caughtUp.data.status, 'finished');

    const badJson = await fetch(`${base}/api/host/lobby?admin=${env.ADMIN_KEY}`, { method: 'POST', body: '{' });
    assert.equal(badJson.status, 400);
    const badSeed = await fetch(`${base}/api/host/lobby?admin=${env.ADMIN_KEY}`, { method: 'POST', body: '{"seed":{}}' });
    assert.equal(badSeed.status, 400);
    const large = await fetch(`${base}/api/host/lobby?admin=${env.ADMIN_KEY}`, { method: 'POST', body: 'x'.repeat(70000) });
    assert.equal(large.status, 413);
    assert.equal((await state()).status, 'finished', 'bad host input must not reset the game');

    await host('lobby', { seed: 'before-reset' });
    await host('start');
    const old1 = call('inspect', { target: 'desk', thought: 'פעולה ישנה ראשונה' });
    await events.wait(e => e.type === 'action' && e.data.thought === 'פעולה ישנה ראשונה');
    const old2 = call('take', { target: 'dye_red', thought: 'פעולה ישנה שנייה' }, queryClient);
    await delay(10);
    const reset = await host('reset');
    assert.equal(reset.status, 'lobby');
    assert.notEqual(reset.seed, 'before-reset');
    assert.deepEqual(reset.log, []);
    assert.deepEqual(reset.places, []);
    await host('start');
    for (const response of await Promise.all([old1, old2])) assert.match(response.content[0].text, /המרוץ אופס/);
    await delay(80);
    const afterReset = await state();
    assert.ok(!afterReset.log.some(e => e.thought.startsWith('פעולה ישנה')));
    assert.deepEqual(afterReset.game.players[0].inventory, []);
    // Leave a paced action and bot loops alive: close() must cancel/drain them and all sockets.
    const pending = call('inspect', { target: 'wall_clock', thought: 'סגירת השרת' }).catch(() => null);
    await events.wait(e => e.type === 'action' && e.data.thought === 'סגירת השרת');
    await app.close();
    await pending;
    assert.equal(app.server.listening, false);
  } finally {
    streams.forEach(stream => stream.close());
    await Promise.allSettled(clients.map(client => client.close()));
    await app.close();
  }

  // The shipped two-contestant configuration maps different keys to separate worlds.
  const seats = createRaceServer({ env: { ADMIN_KEY: 'seats-admin', PACE: '0.01' } });
  const seatedClients = [];
  try {
    const address = await seats.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    const config = await (await fetch(`${base}/api/host/state?admin=seats-admin`)).json();
    assert.equal(config.contestants.length, 2);
    assert.deepEqual(config.players.map(p => p.bot), [false, false, true, true]);
    for (const person of config.contestants) {
      const client = new Client({ name: 'slot-test', version: '1.0.0' });
      seatedClients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp?key=${encodeURIComponent(person.key)}`)));
    }
    const started = await fetch(`${base}/api/host/start?admin=seats-admin`, { method: 'POST' });
    assert.equal(started.status, 200);
    await Promise.all(seatedClients.map(client => client.callTool({ name: 'inspect',
      arguments: { target: 'potion_cabinet', thought: 'אני פותח את ארון הזכוכית.' } })));
    await Promise.all(seatedClients.map((client, i) => client.callTool({ name: 'take',
      arguments: { target: i ? 'dye_blue' : 'dye_red', thought: 'אני אוסף חפץ במסלול שלי.' } })));
    const data = await (await fetch(`${base}/api/state`)).json();
    assert.deepEqual(data.game.players[0].inventory, ['dye_red']);
    assert.deepEqual(data.game.players[1].inventory, ['dye_blue']);
    const humans = data.log.filter(entry => entry.p < 2 && entry.cmd.op === 'take').sort((a, b) => a.p - b.p);
    assert.deepEqual(humans.map(entry => [entry.p, entry.cmd.target]), [[0, 'dye_red'], [1, 'dye_blue']]);
  } finally {
    await Promise.allSettled(seatedClients.map(client => client.close()));
    await seats.close();
  }

  // AUTO_START works without credentials too: four bots can run a headless demo.
  const auto = createRaceServer({ env: { AUTO_START: '1', PACE: '0', BOT_SPEED: '0' }, contestants: [], seed: 77 });
  try {
    const address = await auto.listen(0, '127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/state`);
    const data = await response.json();
    assert.equal(data.status, 'running');
    assert.ok(data.players.every(p => p.bot));
    await until(async () => (await (await fetch(`http://127.0.0.1:${address.port}/api/state`)).json()).status === 'finished', 'AUTO_START demo');
  } finally { await auto.close(); }
}

// Keep the existing synchronous test runner unchanged. A child also proves that teardown
// leaves no listener, SSE heartbeat, bot loop, SDK transport or pacing timer holding Node open.
module.exports = [['HTTP server: real MCP complete escape, three bots, SSE, auth, pacing and reset', () => {
  const child = spawnSync(process.execPath, [__filename, '--integration'], {
    encoding: 'utf8', timeout: 45000, windowsHide: true,
    env: { ...process.env, AUTO_START: '', PACE: '0.05', BOT_SPEED: '0.05' }
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout, /Server integration passed/);
}]];

if (require.main === module) {
  integration().then(() => console.log('Server integration passed')).catch(error => {
    console.error(error.stack); process.exitCode = 1;
  });
}
