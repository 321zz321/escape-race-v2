'use strict';

const assert = require('node:assert/strict');
const START = { row: 0, col: 3 };
const EXIT = { row: 8, col: 3 };

function neighbors(row, col) {
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = row + dr;
    const c = col + dc;
    if ((dr || dc) && r >= 0 && r < 9 && c >= 0 && c < 7) cells.push({ row: r, col: c });
  }
  return cells;
}

// An independent test-side BFS. The solver never asks the engine to step onto a mine.
function safePath(mines, from = START, to = EXIT) {
  const queue = [[from]];
  const visited = new Set([`${from.row},${from.col}`]);
  if (mines[from.row][from.col] || mines[to.row][to.col]) return null;
  for (let head = 0; head < queue.length; head++) {
    const path = queue[head];
    const last = path[path.length - 1];
    if (last.row === to.row && last.col === to.col) return path;
    for (const next of neighbors(last.row, last.col)) {
      const key = `${next.row},${next.col}`;
      if (!visited.has(key) && !mines[next.row][next.col]) {
        visited.add(key);
        queue.push(path.concat(next));
      }
    }
  }
  return null;
}

function run(game, i, cmd, log) {
  const before = game.progress(i);
  const result = game.act(i, cmd);
  assert.equal(result.ok, true, `${JSON.stringify(cmd)}: ${result.text}`);
  assert.equal(typeof result.text, 'string');
  assert.ok(Array.isArray(result.ev));
  assert.ok(game.progress(i) >= before, 'Milestone progress must never go backwards');
  if (log) log.push({ i, cmd, result, state: game.state });
  return result;
}

function brew(game, i, recipe, log) {
  const act = cmd => run(game, i, cmd, log);
  for (const target of ['potion_cabinet', 'tall_cupboard', 'cauldron']) {
    if (!game.players[i].read.includes(target)) act({ op: 'inspect', target });
  }
  act({ op: 'use', item: 'drain_valve' });
  if (!game.players[i].inventory.includes('flask')) act({ op: 'take', target: 'flask_rack' });
  for (const [color, amount] of Object.entries(recipe)) {
    if (!amount) continue;
    const item = `dye_${color}`;
    if (!game.players[i].inventory.includes(item)) act({ op: 'take', target: item });
    for (let n = 0; n < amount; n++) act({ op: 'use', item, target: 'cauldron' });
  }
  return act({ op: 'use', item: 'flask', target: 'cauldron' });
}

function toStorage(game, i = 0, log) {
  const act = cmd => run(game, i, cmd, log);
  act({ op: 'look' });
  act({ op: 'inspect', target: 'bookshelf' });
  act({ op: 'inspect', target: 'recipe_book' });
  act({ op: 'inspect', target: 'desk' });
  act({ op: 'inspect', target: 'desk_drawer' });
  act({ op: 'take', target: 'brass_key' });
  act({ op: 'inspect', target: 'wall_clock' });
  brew(game, i, game.solution().fireRecipe, log);
  act({ op: 'use', item: 'flask_fire', target: 'ice_door' });
  assert.equal(game.progress(i), 0.2);
  act({ op: 'go', room: 'storage' });
}

function toMinefield(game, i = 0, log) {
  toStorage(game, i, log);
  const act = cmd => run(game, i, cmd, log);
  act({ op: 'inspect', target: 'gate_sign' });
  act({ op: 'inspect', target: 'tarp' });
  for (const target of Object.keys(game.solution().crateWeights)) act({ op: 'inspect', target });
  for (const item of game.solution().crateTriple) {
    act({ op: 'take', target: item });
    act({ op: 'use', item, target: 'scale' });
  }
  assert.equal(game.progress(i), 0.4);
  act({ op: 'go', room: 'minefield' });
}

function toVault(game, i = 0, log) {
  toMinefield(game, i, log);
  const act = cmd => run(game, i, cmd, log);
  act({ op: 'inspect', target: 'warning_sign' });
  const mines = game.solution().mines;
  const path = safePath(mines);
  assert.ok(path, 'Seed must have a safe path');
  for (const { row, col } of path.slice(1)) {
    assert.equal(mines[row][col], false);
    act({ op: 'step', row, col });
  }
  assert.equal(game.progress(i), 0.6);
  act({ op: 'go', room: 'vault' });
  act({ op: 'inspect', target: 'vault_door' });
}

function solve(game, i = 0, log, sealFirst = false) {
  toVault(game, i, log);
  const act = cmd => run(game, i, cmd, log);
  act({ op: 'inspect', target: 'notice_board' });
  const page = act({ op: 'inspect', target: 'torn_page' });
  assert.match(page.text, /שיקוי חומצה/);
  act({ op: 'use', item: 'brass_key', target: 'cabinet' });
  act({ op: 'inspect', target: 'note' });
  const reveals = JSON.stringify(game.players[i].minefield.revealed);
  act({ op: 'go', room: 'minefield' });
  assert.equal(game.players[i].minefield.row, EXIT.row);
  assert.equal(game.players[i].minefield.col, EXIT.col);
  act({ op: 'go', room: 'storage' });
  act({ op: 'go', room: 'lab' });
  brew(game, i, game.solution().acidRecipe, log);
  act({ op: 'go', room: 'storage' });
  act({ op: 'go', room: 'minefield' });
  act({ op: 'go', room: 'vault' });
  assert.equal(JSON.stringify(game.players[i].minefield.revealed), reveals, 'Return trip uses only revealed tiles');
  assert.equal(game.players[i].minefield.strikes, 0);
  const code = { op: 'enter_code', code: game.solution().clockCode };
  const seal = { op: 'use', item: 'flask_acid', target: 'rust_seal' };
  act(sealFirst ? seal : code);
  assert.equal(game.progress(i), 0.8);
  assert.equal(game.players[i].escaped, false, 'One lock is not enough');
  const end = act(sealFirst ? code : seal);
  assert.equal(game.players[i].escaped, true);
  assert.equal(game.progress(i), 1);
  assert.ok(end.ev.some(event => event.t === 'escape'));
  return end;
}

module.exports = { START, EXIT, neighbors, safePath, run, brew, toStorage, toMinefield, toVault, solve };
