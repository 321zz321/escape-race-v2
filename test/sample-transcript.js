'use strict';

// node test/sample-transcript.js [seed=1] [personality=chatty] [--full]
// This is a readable demo, deliberately not a *.test.js suite.
const { Game } = require('../public/engine');
const { MockBot, runRace } = require('../public/mock');
const args = process.argv.slice(2).filter(arg => arg !== '--full');
const seed = args[0] === undefined ? 1 : /^-?\d+$/.test(args[0]) ? Number(args[0]) : args[0];
const id = args[1] || 'chatty';
const p = MockBot.PERSONALITIES.findIndex(profile => profile.id === id);
if (p === -1) throw new Error('Choose careful, fast, chatty or chaotic');
const full = process.argv.includes('--full');
const race = runRace(seed);
const game = new Game(seed);
const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
let omitted = 0;
let showReaction = false;
console.log(`${MockBot.PERSONALITIES[p].name} — זרע ${seed}${full ? '' : ' — קטעים נבחרים'}\n`);
for (const entry of race.log) {
  const room = game.rooms[game.players[entry.p].room].name;
  const result = game.act(entry.p, entry.cmd);
  if (entry.p !== p) continue;
  const interesting = showReaction || entry.cmd.op === 'go' || result.ev.some(ev => ['brew', 'boom', 'code', 'escape'].includes(ev.t)) ||
    (entry.cmd.op === 'inspect' && ['recipe_book', 'torn_page', 'note', 'wall_clock', 'grandfather_clock'].includes(entry.cmd.target));
  showReaction = result.ev.some(ev => ev.t === 'boom' || (ev.t === 'code' && !ev.ok) || (ev.t === 'brew' && ev.result === 'flask_muddy'));
  if (!full && !interesting) { omitted++; continue; }
  if (omitted) console.log(`  … ${omitted === 1 ? 'פעולת חקירה והכנה אחת' : `${omitted} פעולות חקירה והכנה`} …`);
  omitted = 0;
  console.log(`[${clock(entry.t)} | ${room}] ${entry.thought}`);
  console.log(`  ← ${result.text.split('\n')[0]}\n`);
}
console.log(`מקום ${game.players[p].place}, ${game.players[p].minefield.strikes} פיצוצים; כל המרוץ: ${clock(race.totalMs)} דקות.`);
