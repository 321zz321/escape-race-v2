'use strict';

const assert = require('node:assert/strict');
const { Game, mulberry32 } = require('../public/engine');
const { run, solve, toVault } = require('./helpers');

const banned = ['רמז', 'חשוב', 'מתכון יעזור', 'להמיס', 'תמיס', 'קוד הכספת', 'פתרון'];
const idsIn = text => [...text.matchAll(/\(([a-z][a-z0-9_]*)\)/g)].map(match => match[1]);
const neutral = text => {
  for (const word of banned) assert.ok(!text.includes(word), `${word}: ${text}`);
};
const hiddenKeys = ['dye_red', 'dye_yellow', 'dye_blue', 'ink_black', 'flask_rack', 'drain_valve',
  'recipe_book', 'desk_drawer', 'brass_key', 'crate_1', 'crate_2', 'crate_3', 'crate_4', 'crate_5', 'crate_6',
  'sand_sack', 'magnifier', 'torn_page', 'note', 'keypad', 'rust_seal', 'gold_coin'];

module.exports = [
  ['Every room starts with 10–14 large objects, at least 25 total, and no hidden puzzle items', () => {
    const game = new Game('first looks', 2);
    for (const [id, room] of Object.entries(game.rooms)) {
      game.players[0].room = id; // Fresh-room fixture: no inspections or discoveries.
      const result = run(game, 0, { op: 'look' });
      const visible = idsIn(result.text);
      assert.ok(visible.length >= 10 && visible.length <= 14, `${id}: ${visible.length}`);
      assert.ok(room.objects.length >= 25, `${id}: ${room.objects.length}`);
      assert.deepEqual(visible, room.objects.filter(obj => !obj.hidden).map(obj => obj.id));
      for (const key of hiddenKeys) assert.ok(!visible.includes(key), `${id} leaks ${key}`);
      for (const obj of room.objects) {
        let cursor = obj, depth = 0;
        const path = new Set([cursor.id]);
        while (cursor.parent) {
          assert.ok(cursor.hidden, `${cursor.id} must be hidden`);
          cursor = room.objects.find(parent => parent.id === cursor.parent);
          assert.ok(cursor, `Missing parent of ${obj.id}`);
          assert.ok(!path.has(cursor.id), `Cycle at ${cursor.id}`);
          path.add(cursor.id);
          assert.ok(++depth <= 3, `${obj.id} is nested too deeply`);
        }
      }
    }
    assert.equal(game.rooms.lab.objects.filter(o => o.parent === 'potion_cabinet').length, 8);
    assert.equal(game.rooms.lab.objects.filter(o => o.parent === 'bookshelf' && o.kind === 'book').length, 7);
    assert.equal(game.rooms.lab.objects.find(o => o.id === 'recipe_book').name, 'ספר כתוב ביד');
  }],

  ['Hidden objects reject inspect, take and use until discovered, including guessed targets and keypad', () => {
    const game = new Game('hidden interactions', 2);
    for (const [roomId, room] of Object.entries(game.rooms)) {
      game.players[0].room = roomId;
      for (const obj of room.objects.filter(o => o.hidden)) {
        for (const cmd of [{ op: 'inspect', target: obj.id }, { op: 'take', target: obj.id },
          { op: 'use', item: obj.id, target: room.objects.find(o => !o.hidden).id }]) {
          const result = game.act(0, cmd);
          assert.equal(result.ok, false, JSON.stringify(cmd));
          assert.ok(!result.ev.some(e => e.t === 'reveal' || e.t === 'take' || e.t === 'pour'));
          assert.ok(!result.text.includes(obj.name), 'A guessed id must not disclose its identity');
        }
      }
      assert.deepEqual(game.players[0].discovered, []);
    }
    assert.equal(game.act(0, { op: 'enter_code', code: game.solution().clockCode }).ok, false);
    assert.equal(game.players[0].codeAttempts, 0);
    game.players[0].room = 'lab';
    run(game, 0, { op: 'inspect', target: 'potion_cabinet' });
    run(game, 0, { op: 'take', target: 'dye_red' });
    // A held object still cannot address a hidden target.
    assert.equal(game.act(0, { op: 'use', item: 'dye_red', target: 'drain_valve' }).ok, false);
    run(game, 0, { op: 'use', item: 'dye_red', target: 'cauldron' });
    assert.equal(game.act(1, { op: 'take', target: 'dye_red' }).ok, false);
  }],

  ['Containers reveal one level, junk stays inspectable, and cabinet/stuck containers resist repeated inspection', () => {
    const game = new Game('containers', 2);
    const act = cmd => run(game, 0, cmd);
    const desk = act({ op: 'inspect', target: 'desk' });
    assert.ok(idsIn(desk.text).includes('desk_drawer'));
    assert.ok(!idsIn(desk.text).includes('brass_key'));
    assert.deepEqual(game.discoveries(0), []);
    const drawer = act({ op: 'inspect', target: 'desk_drawer' });
    assert.deepEqual(new Set(idsIn(drawer.text)), new Set(['pencils', 'eraser', 'brass_key', 'ink_pen', 'old_receipt']));
    assert.deepEqual(game.discoveries(0), ['מפתח פליז']);
    const repeat = act({ op: 'inspect', target: 'desk_drawer' });
    assert.equal(repeat.ev.filter(e => e.t === 'reveal').length, 0);
    act({ op: 'inspect', target: 'old_receipt' });
    assert.ok(idsIn(act({ op: 'look' }).text).includes('old_receipt'));
    assert.ok(!idsIn(run(game, 1, { op: 'look' }).text).includes('old_receipt'));
    act({ op: 'inspect', target: 'rug' });
    for (let n = 0; n < 3; n++) {
      const stuck = act({ op: 'inspect', target: 'trapdoor' });
      assert.match(stuck.text, /ממוסמרים/);
      assert.ok(!stuck.ev.some(e => e.t === 'open' || e.t === 'door' || e.t === 'reveal'));
    }
    const vault = new Game('cabinet', 1);
    toVault(vault);
    for (let n = 0; n < 3; n++) {
      const locked = run(vault, 0, { op: 'inspect', target: 'cabinet' });
      assert.match(locked.text, /נעולה/);
      assert.equal(locked.ev.filter(e => e.t === 'reveal').length, 0);
      assert.ok(!idsIn(vault.act(0, { op: 'look' }).text).includes('note'));
    }
    const opened = run(vault, 0, { op: 'use', item: 'brass_key', target: 'cabinet' });
    assert.deepEqual(new Set(idsIn(opened.text)), new Set(['note', 'ledger', 'stamp']));
    assert.ok(!vault.discoveries(0).includes('פתק על השעון במעבדה'));
    run(vault, 0, { op: 'inspect', target: 'note' });
    assert.ok(vault.discoveries(0).includes('פתק על השעון במעבדה'));
  }],

  ['Crate labels and recipes appear only on reading the particular object', () => {
    const game = new Game('texts', 1);
    for (const [room, container, target, text] of [
      ['lab', 'bookshelf', 'recipe_book', 'שיקוי אש'],
      ['vault', 'notice_board', 'torn_page', 'שיקוי חומצה'],
      ['storage', 'tarp', 'crate_1', `${game.solution().crateWeights.crate_1} ק״ג`]
    ]) {
      game.players[0].room = room;
      assert.ok(!run(game, 0, { op: 'look' }).text.includes(text));
      assert.ok(!run(game, 0, { op: 'inspect', target: container }).text.includes(text));
      assert.ok(!run(game, 0, { op: 'look' }).text.includes(text));
      assert.ok(run(game, 0, { op: 'inspect', target }).text.includes(text));
    }
  }],

  ['Descriptions, every discoverable inspection and full solve responses have no spoiler vocabulary', () => {
    for (const seed of [0, 11, 29]) {
      const game = new Game(seed, 1);
      for (const [roomId, room] of Object.entries(game.rooms)) {
        game.players[0].room = roomId;
        for (const obj of room.objects) { neutral(obj.name); neutral(obj.description); }
        const checked = new Set();
        // Walk the actual visibility graph, including nested containers. The locked
        // cabinet is handled by the full solve below, without bypassing its lock.
        let found;
        do {
          found = idsIn(game.act(0, { op: 'look' }).text).filter(id => !checked.has(id));
          for (const target of found) {
            checked.add(target);
            neutral(run(game, 0, { op: 'inspect', target }).text);
            neutral(game.activity(0));
            game.discoveries(0).forEach(neutral);
          }
        } while (found.length);
        for (const obj of room.objects.filter(o => o.parent !== 'cabinet')) assert.ok(checked.has(obj.id), obj.id);
      }
      const solved = new Game(seed, 1), log = [];
      solve(solved, 0, log);
      for (const entry of log) neutral(entry.result.text);
    }
  }],

  ['1500 valid-shaped fuzz commands preserve hidden-item boundaries and deterministic audience state', () => {
    const a = new Game('visibility-fuzz', 2), b = new Game('visibility-fuzz', 2);
    const rng = mulberry32('visibility-commands');
    const pick = list => list[Math.floor(rng() * list.length)];
    for (let n = 0; n < 1500; n++) {
      const p = n % 2, room = pick(Object.keys(a.rooms));
      a.players[p].room = b.players[p].room = room;
      const obj = pick(a.rooms[room].objects);
      const cmd = pick([{ op: 'look' }, { op: 'inspect', target: obj.id }, { op: 'take', target: obj.id },
        { op: 'use', item: obj.id, target: pick(a.rooms[room].objects).id }, { op: 'drop', item: obj.id }]);
      const hiddenBefore = obj.hidden && !a.players[p].discovered.includes(obj.id);
      const result = a.act(p, cmd);
      assert.deepEqual(result, b.act(p, cmd));
      assert.deepEqual(a.state, b.state);
      assert.equal(a.activity(p), b.activity(p));
      assert.deepEqual(a.discoveries(p), b.discoveries(p));
      neutral(result.text);
      if (hiddenBefore && ['inspect', 'take', 'use'].includes(cmd.op)) assert.equal(result.ok, false, obj.id);
      for (const player of a.players) {
        for (const id of player.inventory) {
          const definition = Object.values(a.rooms).flatMap(r => r.objects).find(o => o.id === id);
          if (definition?.hidden) assert.ok(player.discovered.includes(id));
        }
      }
    }
  }]
];
