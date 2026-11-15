'use strict';

const assert = require('node:assert/strict');
const { Game, mulberry32 } = require('../public/engine');
const { run, brew, toStorage, toMinefield, toVault } = require('./helpers');

module.exports = [
  ['Hidden discoveries are local, require their parent, and do not give away clues in look', () => {
    const game = new Game('hidden', 2);
    const look = run(game, 0, { op: 'look' }).text;
    assert.ok(!look.includes('recipe_book') && !look.includes('brass_key'));
    assert.ok(!look.includes(game.solution().clockTime));
    for (const target of ['recipe_book', 'desk_drawer', 'brass_key', 'note', 'torn_page']) {
      assert.equal(game.act(0, { op: 'inspect', target }).ok, false);
      assert.equal(game.act(0, { op: 'take', target }).ok, false);
    }
    run(game, 0, { op: 'inspect', target: 'bookshelf' });
    assert.equal(game.act(1, { op: 'inspect', target: 'recipe_book' }).ok, false);
    assert.match(run(game, 0, { op: 'inspect', target: 'recipe_book' }).text, /שיקוי אש/);
    run(game, 0, { op: 'inspect', target: 'desk' });
    assert.equal(game.act(0, { op: 'take', target: 'brass_key' }).ok, false);
    run(game, 0, { op: 'inspect', target: 'desk_drawer' });
    run(game, 0, { op: 'take', target: 'brass_key' });
    assert.equal(game.act(0, { op: 'take', target: 'brass_key' }).ok, false);
    assert.equal(game.players[1].discovered.length, 0);
  }],

  ['Potions require held dyes, exact measures and no ink; muddy flasks can be emptied', () => {
    const game = new Game('mixtures', 1);
    const act = cmd => run(game, 0, cmd);
    assert.equal(game.act(0, { op: 'use', item: 'dye_red', target: 'cauldron' }).ok, false);
    act({ op: 'take', target: 'flask_rack' });
    assert.equal(game.act(0, { op: 'take', target: 'flask_rack' }).ok, false);
    act({ op: 'use', item: 'flask', target: 'cauldron' });
    assert.ok(game.players[0].inventory.includes('flask_muddy'));
    const unchanged = { ...game.players[0].doors };
    assert.equal(game.act(0, { op: 'use', item: 'flask_muddy', target: 'ice_door' }).ok, false);
    assert.deepEqual(game.players[0].doors, unchanged);
    act({ op: 'use', item: 'flask_muddy', target: 'drain_valve' });
    assert.ok(game.players[0].inventory.includes('flask'));
    const recipe = game.solution().fireRecipe;
    for (const color of ['red', 'yellow']) {
      act({ op: 'take', target: `dye_${color}` });
      for (let n = 0; n < recipe[color]; n++) act({ op: 'use', item: `dye_${color}`, target: 'cauldron' });
    }
    assert.match(act({ op: 'inspect', target: 'cauldron' }).text, new RegExp(recipe.red === 1 ? "מנה אחת אדום" : `${recipe.red} מנות אדום`));
    act({ op: 'take', target: 'ink_black' });
    act({ op: 'use', item: 'ink_black', target: 'cauldron' });
    act({ op: 'use', item: 'flask', target: 'cauldron' });
    assert.ok(game.players[0].inventory.includes('flask_muddy'));
    assert.deepEqual(game.players[0].cauldron, { red: 0, yellow: 0, blue: 0, black: 0 });
    assert.ok(game.players[0].inventory.includes('dye_red') && game.players[0].inventory.includes('ink_black'));
    act({ op: 'use', item: 'flask_muddy', target: 'drain_valve' });
    brew(game, 0, { ...recipe, red: recipe.red + 1 });
    assert.ok(game.players[0].inventory.includes('flask_muddy'), 'Extra measures must not match');
    act({ op: 'use', item: 'flask_muddy', target: 'drain_valve' });
    act({ op: 'use', item: 'dye_red', target: 'cauldron' });
    act({ op: 'inspect', target: 'drain_valve' });
    assert.deepEqual(game.players[0].cauldron, { red: 0, yellow: 0, blue: 0, black: 0 });
    brew(game, 0, recipe);
    assert.ok(game.players[0].inventory.includes('flask_fire'));
    act({ op: 'use', item: 'flask_fire', target: 'ice_door' });
    assert.ok(!game.players[0].inventory.some(item => item.startsWith('flask')));
    act({ op: 'take', target: 'flask_rack' });
  }],

  ['Crate targets have a unique triple, one bulky item is carried, and sand weighs 9 kg', () => {
    for (let seed = 0; seed < 30; seed++) {
      const solution = new Game(seed, 1).solution();
      const values = Object.values(solution.crateWeights);
      assert.equal(values.length, 6);
      assert.ok(values.every(kg => kg >= 2 && kg <= 12));
      assert.equal(solution.crateTriple.length, 3);
      assert.equal(new Set(solution.crateTriple).size, 3);
      assert.equal(solution.crateTriple.reduce((sum, id) => sum + solution.crateWeights[id], 0), solution.target);
      let triples = 0;
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 5; b++) for (let c = b + 1; c < 6; c++) {
        if (values[a] + values[b] + values[c] === solution.target) triples++;
      }
      assert.equal(triples, 1);
    }
    const game = new Game('weights', 1);
    toStorage(game);
    const act = cmd => run(game, 0, cmd);
    act({ op: 'take', target: 'crate_1' });
    assert.equal(game.players[0].carrying, 'crate_1');
    assert.equal(game.act(0, { op: 'take', target: 'crate_2' }).ok, false);
    assert.equal(game.act(0, { op: 'take', target: 'sand_sack' }).ok, false);
    assert.equal(game.act(0, { op: 'use', item: 'crate_2', target: 'scale' }).ok, false);
    act({ op: 'use', item: 'crate_1', target: 'scale' });
    assert.equal(game.players[0].carrying, null);
    const sack = act({ op: 'take', target: 'sand_sack' });
    assert.equal(sack.ev[0].t, 'move');
    const scaled = act({ op: 'use', item: 'sand_sack', target: 'scale' });
    const kg = game.solution().crateWeights.crate_1 + 9;
    assert.equal(scaled.ev.find(event => event.t === 'scale').kg, kg);
    assert.ok(act({ op: 'inspect', target: 'scale' }).text.includes(String(kg)));
    const retrieve = act({ op: 'take', target: 'crate_1' });
    assert.deepEqual({ x: retrieve.ev[0].x, z: retrieve.ev[0].z }, { x: 2.8, z: 2.6 });
    assert.equal(retrieve.ev.find(event => event.t === 'scale').kg, 9);
    assert.equal(game.act(0, { op: 'take', target: 'anvil' }).ok, false);
    act({ op: 'drop', item: 'crate_1' });
    act({ op: 'take', target: 'sand_sack' });
    act({ op: 'drop', item: 'sand_sack' });
    assert.deepEqual(game.players[0].scale, []);
    for (const item of game.solution().crateTriple) {
      act({ op: 'take', target: item });
      act({ op: 'use', item, target: 'scale' });
    }
    assert.equal(game.players[0].doors.gate, true);
    act({ op: 'take', target: game.solution().crateTriple[0] });
    assert.equal(game.players[0].doors.gate, true, 'The gate must remain open after removing weight');
  }],

  ['Closed doors, skipped rooms and remote interactions fail; dropped items keep their location', () => {
    const game = new Game('doors', 1);
    for (const room of ['storage', 'minefield', 'vault', 'exit', 'lab']) assert.equal(game.act(0, { op: 'go', room }).ok, false);
    assert.equal(game.players[0].room, 'lab');
    assert.equal(game.act(0, { op: 'inspect', target: 'scale' }).ok, false);
    assert.equal(game.act(0, { op: 'step', row: 0, col: 3 }).ok, false);
    toStorage(game);
    assert.equal(game.act(0, { op: 'go', room: 'minefield' }).ok, false);
    assert.equal(game.act(0, { op: 'go', room: 'vault' }).ok, false);
    assert.equal(game.act(0, { op: 'use', item: 'dye_red', target: 'cauldron' }).ok, false);
    assert.equal(game.act(0, { op: 'use', item: 'drain_valve' }).ok, false);
    run(game, 0, { op: 'drop', item: 'brass_key' });
    const dropped = { ...game.players[0].pos };
    run(game, 0, { op: 'go', room: 'lab' });
    assert.equal(game.act(0, { op: 'take', target: 'brass_key' }).ok, false);
    run(game, 0, { op: 'go', room: 'storage' });
    const taken = run(game, 0, { op: 'take', target: 'brass_key' });
    assert.deepEqual({ x: taken.ev[0].x, z: taken.ev[0].z }, dropped);
    assert.ok(game.players[0].inventory.includes('brass_key'));
  }],

  ['Wrong code and decoy clock fail, cabinet requires a key, and keypad opening is permanent', () => {
    const game = new Game('locks', 2);
    toVault(game);
    const beforeOther = JSON.stringify(game.players[1]);
    const act = cmd => run(game, 0, cmd);
    assert.equal(game.act(0, { op: 'inspect', target: 'note' }).ok, false);
    assert.match(act({ op: 'inspect', target: 'cabinet' }).text, /נעולה/);
    const decoy = act({ op: 'inspect', target: 'grandfather_clock' });
    assert.ok(decoy.text.includes(game.solution().decoyTime));
    assert.match(decoy.text, /מתקתק/);
    for (const code of ['0000', game.solution().decoyTime.replace(':', '')]) {
      const failure = game.act(0, { op: 'enter_code', code });
      assert.equal(failure.ok, false);
      assert.match(failure.text, /הקוד שגוי/);
      assert.equal(failure.ev[0].t, 'move');
      assert.equal(failure.ev.find(event => event.t === 'code').ok, false);
    }
    assert.equal(game.players[0].codeAttempts, 2);
    assert.equal(game.players[0].locks.keypad, false);
    act({ op: 'use', item: 'brass_key', target: 'cabinet' });
    assert.match(act({ op: 'inspect', target: 'note' }).text, /השעון במעבדה/);
    act({ op: 'enter_code', code: Number(game.solution().clockCode) });
    assert.equal(game.players[0].locks.keypad, true);
    assert.equal(game.players[0].escaped, false);
    assert.equal(game.act(0, { op: 'enter_code', code: '0000' }).ok, false);
    assert.equal(game.players[0].locks.keypad, true);
    assert.equal(JSON.stringify(game.players[1]), beforeOther);
  }],

  ['2000 seeded garbage commands across rooms and player indices never throw and always fail', () => {
    const games = Array.from({ length: 8 }, (_, seed) => new Game(`fuzz-${seed}`, 2));
    games.forEach((game, i) => {
      if (i % 4 === 1) toStorage(game);
      if (i % 4 === 2) toMinefield(game);
      if (i % 4 === 3) toVault(game);
    });
    const rng = mulberry32('bad-inputs');
    const pick = array => array[Math.floor(rng() * array.length)];
    const values = [null, undefined, true, false, 9, -2, 1.2, NaN, Infinity, {}, [], ['x'], Symbol('bad'), 1n, () => {}];
    const makers = [
      () => pick(values),
      () => ({ op: pick(values) }),
      () => ({ op: pick(['__proto__', 'constructor', 'toString', 'teleport', '', 'LOOK']) }),
      () => ({ op: pick(['inspect', 'take']), target: pick(values) }),
      () => ({ op: pick(['inspect', 'take']), target: `unknown_${Math.floor(rng() * 10000)}` }),
      () => ({ op: 'use', item: pick(values), target: pick(values) }),
      () => ({ op: 'use', item: 'not_in_inventory', target: 'cauldron' }),
      () => ({ op: 'drop', item: pick(['__proto__', 'constructor', 'not_in_inventory']) }),
      () => ({ op: 'go', room: pick(['__proto__', 'constructor', 'nowhere', ...values]) }),
      () => ({ op: 'step', row: pick([-1, 9, 100, '0', 0.5, null]), col: 3 }),
      () => ({ op: 'step', row: 0, col: pick([-1, 7, 100, '3', 0.5, null]) }),
      () => ({ op: 'enter_code', code: pick([null, undefined, [], {}, true, false, '4:15', 'abcd', '12345', -1, 2.5, NaN, Infinity]) })
    ];
    for (let n = 0; n < 2000; n++) {
      const game = pick(games);
      const i = n % 11 === 0 ? pick([-1, 2, 100, '0', null, NaN, {}, Symbol('player')]) : 0;
      const cmd = pick(makers)();
      let result;
      assert.doesNotThrow(() => { result = game.act(i, cmd); });
      assert.equal(result.ok, false, `fuzz command ${n}`);
      assert.equal(typeof result.text, 'string');
      assert.match(result.text, /[א-ת]/);
      assert.ok(Array.isArray(result.ev));
      assert.doesNotThrow(() => JSON.stringify(result));
    }
    const accessor = Object.defineProperty({}, 'op', { get() { throw new Error('hostile getter'); } });
    const proxy = new Proxy({}, { get() { throw new Error('hostile proxy'); } });
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    const cyclic = {}; cyclic.op = cyclic;
    const game = games[0];
    const before = JSON.stringify(game.state);
    for (const cmd of [accessor, proxy, revoked.proxy, cyclic, Object.create(null)]) assert.equal(game.act(0, cmd).ok, false);
    assert.equal(JSON.stringify(game.state), before);
  }]
];
