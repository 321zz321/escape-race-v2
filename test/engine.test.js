'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Game, mulberry32, durationMs, ROOMS_ORDER, tilePos } = require('../public/engine');
const { run, solve, toStorage } = require('./helpers');

module.exports = [
  ['30 seeded complete escapes, including the acid return trip and both lock orders', () => {
    const acidColors = new Set();
    for (let seed = 0; seed < 30; seed++) {
      const game = new Game(seed, 1);
      const solution = game.solution();
      acidColors.add(solution.acidColor);
      assert.equal(solution.fireRecipe.blue, 0);
      assert.ok(solution.fireRecipe.red && solution.fireRecipe.yellow);
      assert.ok(solution.acidRecipe.blue);
      assert.equal(solution.acidRecipe.red > 0, solution.acidColor === 'purple');
      for (const recipe of [solution.fireRecipe, solution.acidRecipe]) {
        assert.equal(Object.values(recipe).filter(Boolean).length, 2);
        assert.ok(Object.values(recipe).every(n => Number.isInteger(n) && n >= 0 && n <= 3));
      }
      assert.notEqual(solution.clockTime, solution.decoyTime);
      assert.equal(solution.clockCode, solution.clockTime.replace(':', ''));
      solve(game, 0, undefined, seed % 2 === 1);
      assert.equal(game.players[0].place, 1, `seed ${seed}`);
      assert.equal(game.finished, true);
      assert.deepEqual(game.finishOrder, [0]);
      assert.equal(game.players[0].inventory.includes('flask_acid'), false);
      assert.equal(game.players[0].inventory.includes('flask_fire'), false);
      assert.match(game.objective(0), /סיים/);
      for (const cmd of [{ op: 'look' }, { op: 'go', room: 'lab' }, null, {}, { op: 'enter_code', code: solution.clockCode }]) {
        assert.equal(game.act(0, cmd).ok, false);
        assert.match(game.act(0, cmd).text, /כבר יצאת/);
      }
    }
    assert.deepEqual([...acidColors].sort(), ['green', 'purple']);
  }],

  ['Identical seeds and command logs produce JSON-identical outputs and snapshots', () => {
    for (const seed of [0, -25, 4294967295, 'מרוץ החדרים 🔑']) {
      const first = new Game(seed, 2);
      const second = new Game(seed, 2);
      const log = [];
      run(first, 1, { op: 'inspect', target: 'desk' }, log);
      run(first, 1, { op: 'inspect', target: 'desk_drawer' }, log);
      run(first, 1, { op: 'take', target: 'brass_key' }, log);
      solve(first, 0, log);
      for (const { i, cmd, result, state } of log) {
        assert.equal(JSON.stringify(second.act(i, cmd)), JSON.stringify(result));
        assert.equal(JSON.stringify(second.state), JSON.stringify(state));
      }
      for (const cmd of [{ op: 'go', room: 'vault' }, null, { op: 'use', item: 'flask_acid', target: 'ice_door' }]) {
        assert.equal(JSON.stringify(first.act(1, cmd)), JSON.stringify(second.act(1, cmd)));
      }
      assert.equal(JSON.stringify(first.state), JSON.stringify(second.state));
    }
  }],

  ['Browser UMD replay matches Node without reading a clock or unseeded randomness', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/engine.js'), 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext('Math.random = () => { throw new Error("unseeded RNG"); }; Date = class { constructor() { throw new Error("clock access"); } static now() { throw new Error("clock access"); } };', sandbox);
    vm.runInContext(source, sandbox);
    const browser = sandbox.window.EscapeEngine;
    assert.deepEqual(Object.keys(browser).sort(), ['Game', 'ROOMS_ORDER', 'durationMs', 'mulberry32', 'tilePos']);
    const node = new Game('דפדפן', 1);
    const web = new browser.Game('דפדפן', 1);
    const log = [];
    solve(node, 0, log);
    assert.equal(JSON.stringify(web.solution()), JSON.stringify(node.solution()));
    for (const entry of log) {
      assert.equal(JSON.stringify(web.act(entry.i, entry.cmd)), JSON.stringify(entry.result));
      assert.equal(JSON.stringify(web.state), JSON.stringify(entry.state));
    }
  }],

  ['RNG, seeded variation, room metadata, snapshots and tile coordinates', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    assert.equal(a(), 0.6270739405881613);
    assert.equal(b(), 0.6270739405881613);
    for (let i = 0; i < 100; i++) { const value = a(); assert.equal(value, b()); assert.ok(value >= 0 && value < 1); }
    const sa = mulberry32('שלום');
    const sb = mulberry32('שלום');
    for (let i = 0; i < 20; i++) assert.equal(sa(), sb());
    const game = new Game('layout');
    assert.notDeepEqual(game.solution(), new Game('another layout').solution());
    assert.deepEqual(ROOMS_ORDER, ['lab', 'storage', 'minefield', 'vault']);
    const kinds = new Set('cauldron bottle book shelf desk drawer key clock painting globe skull candles statue rug door crate scale barrel sack anvil toolbox mirror poster sign armor banner bones vault_door keypad seal board paper cabinet note safe portrait chest coin telescope gold flask rack valve magnifier'.split(' '));
    for (const [roomId, room] of Object.entries(game.rooms)) {
      assert.match(room.name, /[א-ת]/);
      const ids = new Set();
      for (const obj of room.objects) {
        assert.ok(!ids.has(obj.id)); ids.add(obj.id);
        assert.match(obj.name, /[א-ת]/);
        assert.match(obj.description, /[א-ת]/);
        assert.ok(kinds.has(obj.kind), obj.id);
        assert.ok(Number.isFinite(obj.x) && Math.abs(obj.x) <= 5);
        assert.ok(Number.isFinite(obj.z) && Math.abs(obj.z) <= 5);
        assert.equal(typeof obj.hidden, 'boolean');
        if (obj.hidden) assert.ok(room.objects.some(parent => parent.id === obj.parent));
        if (obj.kind === 'bottle') assert.equal(typeof obj.color, 'string');
      }
      for (const door of room.doors) {
        const obj = room.objects.find(entry => entry.id === door.id);
        assert.ok(obj);
        assert.equal(obj.x, door.x); assert.equal(obj.z, door.z);
        const next = door.to === 'exit' || ROOMS_ORDER.indexOf(door.to) > ROOMS_ORDER.indexOf(roomId);
        assert.ok(next ? door.z > 4.5 : door.z < -4.5);
      }
    }
    const coords = new Set();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 7; c++) {
      const pos = tilePos(r, c);
      assert.deepEqual(pos, game.tilePos(r, c));
      assert.ok(Math.abs(pos.x) < 5 && Math.abs(pos.z) < 5);
      coords.add(JSON.stringify(pos));
    }
    assert.equal(coords.size, 63);
    assert.equal(tilePos(-1, 0), null);
    assert.equal(tilePos(0, '3'), null);
    const before = JSON.stringify(game.state);
    const snapshot = game.state;
    snapshot.players[0].inventory.push('made_up');
    snapshot.players[0].minefield.revealed[0][3] = true;
    const solution = game.solution();
    solution.mines[0][3] = true;
    solution.fireRecipe.red = 99;
    assert.equal(JSON.stringify(game.state), before);
    assert.notEqual(game.solution().fireRecipe.red, 99);
    assert.equal(game.solution().mines[0][3], false);
    assert.ok(Object.isFrozen(game.rooms.lab.objects[0]));
  }],

  ['Independent player worlds, independent mutable containers, and finish places', () => {
    const game = new Game('four worlds', 4);
    const waiting = JSON.stringify(game.players.slice(1));
    for (let i = 1; i < 4; i++) {
      assert.notEqual(game.players[0].inventory, game.players[i].inventory);
      assert.notEqual(game.players[0].doors, game.players[i].doors);
      assert.notEqual(game.players[0].cauldron, game.players[i].cauldron);
      assert.notEqual(game.players[0].minefield.revealed[0], game.players[i].minefield.revealed[0]);
    }
    solve(game, 0);
    assert.equal(JSON.stringify(game.players.slice(1)), waiting);
    assert.equal(game.finished, false);
    const champion = JSON.stringify(game.players[0]);
    for (const i of [3, 1, 2]) solve(game, i);
    assert.equal(JSON.stringify(game.players[0]), champion);
    assert.deepEqual(game.finishOrder, [0, 3, 1, 2]);
    assert.deepEqual(game.players.map(p => p.place), [1, 3, 4, 2]);
    assert.equal(game.finished, true);
  }],

  ['Interactions move first, use actual object positions, and have usable pacing', () => {
    const game = new Game('animation', 1);
    const log = [];
    solve(game, 0, log);
    for (const { cmd, result, state } of log) {
      const ms = durationMs(cmd, result);
      assert.ok(Number.isFinite(ms) && ms > 0 && ms <= 10000);
      if (!['look', 'inventory'].includes(cmd.op)) {
        assert.equal(result.ev[0].t, 'move', JSON.stringify(cmd));
        assert.ok(result.ev.some(event => event.t !== 'move'));
        for (const event of result.ev) {
          assert.equal(event.p, 0);
          assert.ok(ROOMS_ORDER.includes(event.room));
          assert.ok(Number.isFinite(event.x) && Number.isFinite(event.z));
        }
        const lastMove = result.ev.filter(event => event.t === 'move').at(-1);
        assert.deepEqual(state.players[0].pos, { x: lastMove.x, z: lastMove.z });
      }
    }
    const small = new Game('position', 1);
    const inspect = run(small, 0, { op: 'inspect', target: 'painting' });
    const painting = small.rooms.lab.objects.find(obj => obj.id === 'painting');
    assert.deepEqual(small.players[0].pos, { x: painting.x, z: painting.z });
    assert.equal(inspect.ev[1].t, 'inspect');
    assert.equal(durationMs({ op: 'inspect' }, inspect), 1200);
    assert.equal(durationMs({}, { ev: [{ t: 'boom' }] }), 3000);
    assert.ok(durationMs(null, null) > 0);
  }],

  ['Audience objectives reflect puzzle milestones and the return trip', () => {
    const game = new Game('objectives', 1);
    assert.match(game.objective(0), /קרח/);
    const log = [];
    solve(game, 0, log);
    const replay = new Game('objectives', 1);
    const objectives = new Set([replay.objective(0)]);
    for (const { cmd } of log) { replay.act(0, cmd); objectives.add(replay.objective(0)); }
    for (const word of ['המשקל', 'המוקשים', 'שני המנעולים', 'חוזר למעבדה', 'מכין שיקוי', 'חוזר לכספת', 'החותם', 'סיים']) {
      assert.ok([...objectives].some(text => text.includes(word)), word);
    }
    assert.equal(game.progress(-1), 0);
    assert.equal(typeof game.objective('bad'), 'string');
    const storage = new Game(1, 1);
    toStorage(storage);
    assert.equal(storage.progress(0), 0.2);
  }]
];
