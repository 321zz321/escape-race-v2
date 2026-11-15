'use strict';

const assert = require('node:assert/strict');
const { Game, tilePos } = require('../public/engine');
const { START, EXIT, neighbors, safePath, run, toMinefield, toVault } = require('./helpers');

module.exports = [
  ['Mine generation protects both endpoints and neighbors and always has a safe path', () => {
    for (let seed = 0; seed < 100; seed++) {
      const solution = new Game(seed, 1).solution();
      assert.equal(solution.mines.length, 9);
      assert.ok(solution.mines.every(row => row.length === 7 && row.every(cell => typeof cell === 'boolean')));
      assert.equal(solution.mines.flat().filter(Boolean).length, 16);
      for (const end of [START, EXIT]) for (const tile of [end, ...neighbors(end.row, end.col)]) {
        assert.equal(solution.mines[tile.row][tile.col], false, `seed ${seed}: ${JSON.stringify(tile)}`);
      }
      assert.ok(safePath(solution.mines), `seed ${seed}`);
    }
  }],

  ['Entering reveals the complete zero cascade, with accurate numbers and no mines', () => {
    for (const seed of [0, 5, 17, 'cascade']) {
      const game = new Game(seed, 1);
      const log = [];
      toMinefield(game, 0, log);
      const mines = game.solution().mines;
      const expected = Array.from({ length: 9 }, () => Array(7).fill(false));
      const pending = [START];
      while (pending.length) {
        const { row, col } = pending.pop();
        if (expected[row][col]) continue;
        assert.equal(mines[row][col], false);
        expected[row][col] = true;
        const nearby = neighbors(row, col);
        if (nearby.every(cell => !mines[cell.row][cell.col])) pending.push(...nearby);
      }
      assert.deepEqual(game.players[0].minefield.revealed, expected);
      assert.equal(game.players[0].doors.far_door, false);
      const tileEvents = log.at(-1).result.ev.filter(event => event.t === 'tile');
      assert.equal(tileEvents.length, expected.flat().filter(Boolean).length);
      for (const event of tileEvents) {
        assert.equal(event.n, neighbors(event.r, event.c).filter(tile => mines[tile.row][tile.col]).length);
        assert.deepEqual({ x: event.x, z: event.z }, tilePos(event.r, event.c));
      }
      const grid = run(game, 0, { op: 'look' }).text;
      for (let r = 0; r < 9; r++) assert.ok(grid.includes(`${r}: `));
      assert.ok(grid.includes('@') && grid.includes('?'));
    }
  }],

  ['Unknown unreachable steps and premature vault crossings fail', () => {
    const game = new Game('frontier', 1);
    toMinefield(game);
    const f = game.players[0].minefield;
    let unreachable;
    for (let row = 0; row < 9; row++) for (let col = 0; col < 7; col++) {
      if (!f.revealed[row][col] && neighbors(row, col).every(tile => !f.revealed[tile.row][tile.col])) unreachable = { row, col };
    }
    assert.ok(unreachable);
    const before = game.state.players[0];
    assert.equal(game.act(0, { op: 'step', ...unreachable }).ok, false);
    assert.deepEqual({ ...game.state.players[0], lastActivity: before.lastActivity }, before);
    assert.equal(f.revealed[8][3], false);
    assert.equal(game.act(0, { op: 'go', room: 'vault' }).ok, false);
    assert.equal(game.players[0].room, 'minefield');
  }],

  ['Mine explosion resets position, marks the mine, preserves reveals and other players', () => {
    const game = new Game('explosion', 2);
    const other = JSON.stringify(game.players[1]);
    toMinefield(game);
    const mines = game.solution().mines;
    let chosen;
    for (let row = 0; row < 9 && !chosen; row++) for (let col = 0; col < 7 && !chosen; col++) {
      if (!mines[row][col]) continue;
      for (const neighbor of neighbors(row, col)) {
        const path = safePath(mines, START, neighbor);
        if (path) { chosen = { row, col, path }; break; }
      }
    }
    assert.ok(chosen);
    for (const tile of chosen.path.slice(1)) run(game, 0, { op: 'step', ...tile });
    const reveals = JSON.stringify(game.players[0].minefield.revealed);
    const explosion = game.act(0, { op: 'step', row: chosen.row, col: chosen.col });
    assert.equal(explosion.ok, false);
    assert.equal(explosion.ev[0].t, 'move');
    const boom = explosion.ev.find(event => event.t === 'boom');
    assert.ok(boom);
    assert.equal(boom.r, chosen.row); assert.equal(boom.c, chosen.col);
    const f = game.players[0].minefield;
    assert.equal(f.row, 0); assert.equal(f.col, 3);
    assert.equal(f.strikes, 1);
    assert.equal(f.exploded[chosen.row][chosen.col], true);
    assert.equal(f.revealed[chosen.row][chosen.col], false);
    assert.equal(JSON.stringify(f.revealed), reveals);
    assert.deepEqual(game.players[0].pos, tilePos(0, 3));
    assert.equal(JSON.stringify(game.players[1]), other);
    assert.match(run(game, 0, { op: 'look' }).text, /\*/);
    for (const tile of safePath(mines).slice(1)) run(game, 0, { op: 'step', ...tile });
    run(game, 0, { op: 'go', room: 'vault' });
    assert.equal(f.strikes, 1, 'A strike is a statistic, not a permanent failure');
  }],

  ['Auto-walking and backtracking traverse only connected revealed safe tiles', () => {
    const game = new Game('walk-back', 1);
    toVault(game);
    const p = game.players[0];
    const revealed = JSON.stringify(p.minefield.revealed);
    const mines = game.solution().mines;
    run(game, 0, { op: 'go', room: 'minefield' });
    assert.deepEqual(p.pos, tilePos(8, 3));
    const direct = run(game, 0, { op: 'step', row: 0, col: 3 });
    const moves = direct.ev.filter(event => event.t === 'move');
    assert.ok(moves.length > 1, 'Auto-walking should expose the actual safe route');
    for (let i = 0; i < moves.length; i++) {
      const r = moves[i].z + 4;
      const c = moves[i].x + 3;
      assert.equal(p.minefield.revealed[r][c], true);
      assert.equal(mines[r][c], false);
      if (i) assert.ok(Math.max(Math.abs(moves[i].x - moves[i - 1].x), Math.abs(moves[i].z - moves[i - 1].z)) <= 1);
    }
    run(game, 0, { op: 'go', room: 'storage' });
    run(game, 0, { op: 'go', room: 'minefield' });
    assert.deepEqual(p.pos, tilePos(0, 3));
    run(game, 0, { op: 'go', room: 'vault' });
    assert.equal(JSON.stringify(p.minefield.revealed), revealed);
    assert.equal(game.progress(0), 0.6);
  }]
];
