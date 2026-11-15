'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Game, durationMs } = require('../public/engine');
const { MockBot, runRace } = require('../public/mock');

const ranges = [[2050, 3000], [1300, 2100], [1700, 2700], [1400, 2100]];
const distractors = new Set(['painting', 'globe', 'skull', 'candles', 'cat_statue', 'rug', 'glitter', 'empty_bottle',
  'barrel', 'anvil', 'toolbox', 'mirror', 'poster', 'shelf', 'armor', 'banner', 'bones',
  'small_safe', 'portrait', 'chest', 'telescope', 'gold_pile']);
const stat = () => ({ wins: 0, explosions: 0, wrongCodes: 0, muddyBrews: 0, sandTrials: 0, wrongScaleTrials: 0, scaleCorrections: 0, backtracks: 0, missedClocks: 0, props: 0, thinkingMs: 0, commands: 0 });

module.exports = [
  ['40 mock races finish with observed clues, bounded mistakes, varied winners and correct simulated pacing', () => {
    const stats = MockBot.PERSONALITIES.map(stat);
    const times = [];
    const explosionHistogram = [0, 0, 0, 0, 0];
    let maximumSteps = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const race = runRace(seed);
      const game = new Game(seed, 4);
      const end = [0, 0, 0, 0];
      const visits = [0, 0, 0, 0];
      const commands = [0, 0, 0, 0];
      const decoys = Array(4).fill(null);
      const clocks = Array(4).fill(null);
      const initialClocks = Array(4).fill(false);
      const seenProps = Array.from({ length: 4 }, () => Object.fromEntries(['lab', 'storage', 'minefield', 'vault'].map(room => [room, new Set()])));
      let lastT = 0;
      for (const entry of race.log) {
        const { p, cmd, thought, t } = entry;
        const player = game.players[p];
        assert.deepEqual(Object.keys(entry).sort(), ['cmd', 'p', 't', 'thought']);
        assert.ok(!player.escaped, 'No commands after escaping');
        assert.ok(Number.isInteger(t) && t >= lastT, 'Globally chronological log');
        lastT = t;
        const delay = t - end[p];
        assert.ok(delay >= ranges[p][0] && delay <= ranges[p][1], `Personality thinking range: ${delay}`);
        stats[p].thinkingMs += delay;
        stats[p].commands++;
        assert.match(thought, /[א-ת]/);
        assert.ok(thought.length < 190 && !/undefined|\[object Object\]|\{\w+\}/.test(thought), thought);
        commands[p]++;

        if (cmd.op === 'use' && cmd.target === 'cauldron') {
          assert.ok(player.read.includes('bookshelf') && player.read.includes('recipe_book'), 'Read the book before mixing');
          if (visits[p]) assert.ok(player.read.includes('torn_page'), 'Read the acid recipe before the second brew');
        }
        if (cmd.op === 'use' && cmd.target === 'scale') {
          assert.ok(player.read.includes('gate_sign'));
          assert.ok(player.read.includes(cmd.item), 'Read weight label before placing an item');
        }
        if (cmd.op === 'enter_code') {
          assert.ok([clocks[p], decoys[p]].filter(Boolean).some(time => time.replace(':', '') === cmd.code), 'Only enter a time actually inspected');
        }
        if (cmd.op === 'step') {
          assert.ok(player.read.includes('warning_sign'));
          assert.ok(!player.minefield.exploded[cmd.row][cmd.col], 'Never repeat an exploded tile');
          assert.ok(!player.minefield.revealed[cmd.row][cmd.col], 'Every step makes new progress');
        }
        if (cmd.op === 'inspect' && distractors.has(cmd.target)) seenProps[p][player.room].add(cmd.target);

        const result = game.act(p, cmd);
        assert.ok(result.ok || result.ev.some(ev => ev.t === 'boom' || (ev.t === 'code' && !ev.ok)), result.text);
        if (result.ok && cmd.op === 'inspect') {
          if (cmd.target === 'scale' && !player.doors.gate) stats[p].wrongScaleTrials++;
          if (cmd.target === 'grandfather_clock') decoys[p] = result.text.match(/\d+:\d+/)[0];
          if (cmd.target === 'wall_clock') {
            clocks[p] = result.text.match(/\d+:\d+/)[0];
            if (!visits[p]) initialClocks[p] = true;
            else if (!initialClocks[p]) stats[p].missedClocks++;
          }
        }
        for (const ev of result.ev) {
          if (ev.t === 'boom') {
            stats[p].explosions++;
            assert.ok(ev.strikes <= 4, 'At most four explosions per bot');
          }
          if (ev.t === 'code' && !ev.ok) stats[p].wrongCodes++;
          if (ev.t === 'brew') {
            if (ev.result === 'flask_muddy') stats[p].muddyBrews++;
            if (ev.result === 'flask_acid') assert.ok(player.read.includes('notice_board') && player.read.includes('torn_page'));
          }
          if (ev.t === 'drop' && ev.target === 'scale' && ev.obj === 'sand_sack') stats[p].sandTrials++;
          if (ev.t === 'take' && ev.from === 'scale') stats[p].scaleCorrections++;
          if (ev.t === 'go' && ev.to === 'vault') visits[p]++;
          if (ev.t === 'go' && ev.to === 'lab' && visits[p]) stats[p].backtracks++;
        }
        end[p] = t + durationMs(cmd, result);
      }
      assert.equal(game.finished, true, `seed ${seed}`);
      assert.deepEqual(race.places, game.finishOrder);
      assert.deepEqual(race.places.slice().sort(), [0, 1, 2, 3]);
      assert.deepEqual(race.places.map(p => game.players[p].place), [1, 2, 3, 4]);
      assert.equal(race.totalMs, Math.max(...end), 'Includes the last escape animation');
      for (let p = 0; p < 4; p++) {
        assert.ok(commands[p] < MockBot.MAX_STEPS);
        maximumSteps = Math.max(maximumSteps, commands[p]);
        explosionHistogram[game.players[p].minefield.strikes]++;
        assert.ok(game.players[p].codeAttempts <= 2);
        for (const props of Object.values(seenProps[p])) {
          assert.ok(props.size > 0, 'Explore distractors in every room');
          stats[p].props += props.size;
        }
      }
      stats[race.places[0]].wins++;
      times.push(race.totalMs / 60000);
    }
    times.sort((a, b) => a - b);
    const median = (times[19] + times[20]) / 2;
    assert.ok(times.every(t => t >= 4 && t <= 6.5), `Every fourth escape takes 4–6.5 minutes: ${times[0]}–${times[39]}`);
    assert.ok(median >= 5.2 && median <= 5.8, `Typical race is about 5.5 minutes: ${median}`);
    for (const [i, { wins }] of stats.entries()) {
      assert.ok(wins >= 5 && wins <= 16, `${MockBot.PERSONALITIES[i].id} must win 5–16 of 40 races, got ${wins}`);
    }
    assert.ok(stats[0].props > stats[1].props * 2, 'Careful explores more than fast');
    for (const p of [0, 2, 3]) {
      assert.ok(stats[1].thinkingMs / stats[1].commands < stats[p].thinkingMs / stats[p].commands, 'Fast has the shortest average thinking time');
    }
    for (const field of ['explosions', 'wrongCodes', 'muddyBrews', 'wrongScaleTrials']) {
      assert.ok(stats.slice(1).every(s => s[field] > stats[0][field]), `Careful makes fewer ${field} than every rival`);
    }
    assert.ok(stats[3].explosions > stats[0].explosions, 'Chaotic guesses are riskier');
    for (const field of ['explosions', 'wrongCodes', 'muddyBrews', 'sandTrials', 'scaleCorrections', 'missedClocks']) assert.ok(stats.some(s => s[field] > 0), field);
    assert.ok(stats.every(s => s.backtracks === 40), 'Every bot returns from the vault for acid');
    const round = n => Number(n.toFixed(2));
    console.log('Mock times (minutes, seeds 1–40):', JSON.stringify({ min: round(times[0]), p10: round(times[3]), median: round(median),
      mean: round(times.reduce((a, b) => a + b, 0) / 40), p90: round(times[35]), max: round(times[39]),
      within4to6_5: times.filter(t => t >= 4 && t <= 6.5).length, maximumSteps }));
    console.log('Mock results:', JSON.stringify(Object.fromEntries(MockBot.PERSONALITIES.map((p, i) => [p.id, stats[i]]))));
    console.log('Explosions per bot (0, 1, 2, 3, 4):', JSON.stringify(explosionHistogram));
  }],

  ['MockBot only proposes, learns successful observations and never reads hidden puzzle answers', () => {
    const game = new Game('רמזים בלבד', 1);
    const solution = game.solution();
    game.solution = () => new Proxy({}, { get(_, prop) {
      assert.equal(prop, 'mines', `Forbidden solution field ${String(prop)}`);
      return solution.mines;
    } });
    const bot = new MockBot(game, 0, 'chaotic', 'תצפיות');
    const state = game.state;
    const first = bot.next();
    assert.deepEqual(bot.next(), first, 'Previewing next does not advance the bot');
    first.cmd.op = 'inventory';
    assert.equal(bot.next().cmd.op, 'look', 'Caller cannot mutate a queued proposal');
    assert.deepEqual(game.state, state, 'next never calls act or mutates the world');
    assert.equal(bot.knowledge.read.size, 0);
    while (!game.finished) {
      const { cmd } = bot.next();
      const result = game.act(0, cmd);
      bot.observe(result);
      assert.deepEqual([...bot.knowledge.read].sort(), game.players[0].read.slice().sort());
    }
    assert.equal(bot.next(), null);
    assert.throws(() => bot.observe({ ok: true, text: '', ev: [] }), /next/);
  }],

  ['Mine reasoning prefers proven safe tiles and compares overlapping number constraints', () => {
    // These two revealed numbers have one mine in their shared unknown neighbors.
    // Subtracting their constraints proves the outer column safe. No oracle needed.
    const game = new Game(8, 1);
    game.solution = () => { throw new Error('A proof must not consult the mine layout'); };
    const bot = new MockBot(game, 0, 'careful', 8);
    const first = bot.next();
    assert.equal(first.cmd.op, 'look');
    bot.observe({ ok: true, text: '', ev: [{ t: 'tile', p: 0, r: 0, c: 0, n: 1 }, { t: 'tile', p: 0, r: 0, c: 1, n: 1 }] });
    bot.queue.length = 0;
    bot.stage = 'mines';
    const next = bot.next();
    assert.equal(next.cmd.op, 'step');
    assert.equal(next.cmd.col, 2, 'Subset subtraction proves column 2 safe');
    assert.ok([0, 1].includes(next.cmd.row));
    assert.match(next.thought, /בטוחה|שוללת/);
    assert.equal(bot.knowledge.mines.size, 0, 'Does not invent which shared tile is the mine');
  }],

  ['Node and browser UMD races replay identically without clocks or unseeded randomness', () => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext('Math.random = () => { throw new Error("unseeded RNG"); }; Date = class { constructor() { throw new Error("clock access"); } static now() { throw new Error("clock access"); } };', sandbox);
    for (const name of ['engine.js', 'mock.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', name), 'utf8'), sandbox);
    const browser = sandbox.window.EscapeMock;
    assert.deepEqual(Object.keys(browser).sort(), ['MockBot', 'runRace']);
    assert.equal(JSON.stringify(browser.MockBot.PERSONALITIES), JSON.stringify(MockBot.PERSONALITIES));
    assert.equal(new Set(MockBot.PERSONALITIES.map(p => p.color)).size, 4);
    for (const p of MockBot.PERSONALITIES) assert.match(p.name, /[א-ת]/);
    for (const seed of [0, -2147483648, 'מרוץ בעברית 🔑']) {
      const node = runRace(seed);
      assert.equal(JSON.stringify(node), JSON.stringify(runRace(seed)));
      assert.equal(JSON.stringify(node), JSON.stringify(browser.runRace(seed)));
    }
  }],

  ['Bot timing has an independent RNG, homogeneous races finish, and safety caps fail explicitly', () => {
    const a = new Game(19, 1);
    const b = new Game(19, 1);
    const botA = new MockBot(a, 0, 'fast', 23);
    const botB = new MockBot(b, 0, 'fast', 23);
    while (!a.finished) {
      for (let j = 0; j < 5; j++) botA.thinkingMs();
      const next = botA.next();
      assert.deepEqual(next, botB.next());
      botA.observe(a.act(0, next.cmd));
      botB.observe(b.act(0, next.cmd));
    }
    for (const { id } of MockBot.PERSONALITIES) {
      for (const seed of [0, 4294967295, `same-${id}`]) assert.equal(runRace(seed, { personalities: Array(4).fill(id) }).places.length, 4);
    }
    assert.throws(() => runRace(1, { maxSteps: 1 }), /step cap/);
    assert.throws(() => runRace(1, { maxSteps: 0 }), /positive/);
    assert.throws(() => runRace(1, { personalities: ['fast'] }), /four/);
    assert.throws(() => new MockBot(new Game(1), 4, 'fast'), /player/);
    assert.throws(() => new MockBot(new Game(1), 0, 'nope'), /personality/);
    const capped = new MockBot(new Game(1), 0, 'careful');
    capped.steps = MockBot.MAX_STEPS;
    assert.throws(() => capped.next(), /step cap/);
  }],

  ['Changing speech choices cannot change seeded decisions or pacing', () => {
    let differentThoughts = 0;
    for (const { id } of MockBot.PERSONALITIES) {
      const a = new Game('speech-independent', 1);
      const b = new Game('speech-independent', 1);
      const botA = new MockBot(a, 0, id);
      const botB = new MockBot(b, 0, id);
      botA.speechRng = () => 0;
      botB.speechRng = () => 0.999;
      while (!a.finished) {
        assert.equal(botA.thinkingMs(), botB.thinkingMs());
        const first = botA.next();
        const second = botB.next();
        assert.deepEqual(first.cmd, second.cmd, 'Wording must not influence decisions');
        if (first.thought !== second.thought) differentThoughts++;
        botA.observe(a.act(0, first.cmd));
        botB.observe(b.act(0, second.cmd));
      }
      assert.equal(b.finished, true);
    }
    assert.ok(differentThoughts > 0, 'Exercise different phrasings of the same actions');
  }]
];
