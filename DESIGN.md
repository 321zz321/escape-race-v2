# משחקי הבינה — Escape Race v2 — design spec

A live-streamed race: 4 community-built AI agents escape a 4-room 3D escape room in parallel.
The audience watches a browser split screen (4 views, one per agent) with each agent's live
"thought" text. Show length 40-60 min with real agents; a mock-bot demo race is 4.5-7 minutes.

Audience: general Hebrew-speaking public (many are 50+ and not technical). Puzzles must be
understandable without science knowledge (no pH etc.). All agent-facing and audience-facing text
is Hebrew (RTL). Code identifiers in English.

## Files

- `public/engine.js` — pure deterministic game engine, UMD (works with `require()` in Node and as
  `window.EscapeEngine` in the browser). No DOM, no Math.random, no Date. Seeded RNG only.
- `public/mock.js` — scripted mock agents (UMD too, `window.EscapeMock` / require).
- `public/index.html` (+ `public/viewer.js`, `public/style.css` if useful) — Three.js viewer.
- `server/server.js` — Node HTTP server: static files, SSE, MCP, host page.
- `server/contestants.json` — contestant list.
- `test/*.js` — node tests (`npm test`).
- `README.md` — Hebrew.

## Engine API

```js
const g = new Game(seed, 4)            // seed: integer or string; 4 players
g.act(i, { op: 'look' })               // -> { ok, text, ev: [...] }
g.state                                // read-only-ish snapshot data
g.players[i] = { room, pos:{x,z}, inventory:[ids], escaped:false, place:null, carrying:null, ... }
g.rooms  // static layout: per room id: { name (Hebrew), objects: [{id, name, x, z, kind, hidden, parent}] , doors }
g.activity(i)   // Hebrew physical activity, derived from the last validated action/result
g.discoveries(i) // fresh array of short Hebrew labels for things actually found/read
g.objective(i)  // compatibility alias of activity(), not a plan or a puzzle hint
g.finished      // true when all players escaped (or caller decides)
```

- Same seed + same sequence of (player, command) = identical results everywhere (Node server and
  each browser viewer replay the same log with their own Game copy).
- Each player has their OWN copy of the world state (own items, own doors, own minefield reveals),
  same layout & solution for all (fair race). The players don't interact.
- `text` is Hebrew, written for the agent: describes what happened and what it sees. It must
  not give away solutions; it should describe objects neutrally so the agent must figure out
  what matters.
- `ev` is an array of events for the 3D viewer, e.g.
  `{t:'move', p, room, x, z}`, `{t:'inspect', p, obj}`, `{t:'reveal', p, obj}`, `{t:'take', p, obj}`,
  `{t:'pour', p, obj, color}`, `{t:'brew', p, result}`, `{t:'door', p, door, open:true}`,
  `{t:'tile', p, r, c, n}` (revealed number), `{t:'boom', p, r, c}`, `{t:'scale', p, kg}`,
  `{t:'code', p, ok}`, `{t:'escape', p, place}`, `{t:'fail', p, msg}`, `{t:'drop', p, obj}`.
  Each event should be self-contained enough for the viewer to animate it. Also add
  `durationMs(cmd, result)` helper (exported) giving animation time per action (walk ~1.2-2.5s,
  inspect ~1.2s, pour ~1.5s, explosion ~3s, etc.) used by mock pacing and server pacing.

### Commands (op)

`look`, `inspect {target}`, `take {target}`, `use {item, target?}`, `enter_code {code}`,
`go {room}`, `step {row, col}`, `inventory`, plus `drop {item}` (optional).
Invalid commands return `ok:false` with a helpful Hebrew text, never throw.
Escaped players: any command returns ok:false "already escaped".

Rooms in a row: `lab` -> `storage` -> `minefield` -> `vault` -> exit.
`go(room)` only to an adjacent room, only through an opened door. Doors once opened stay open.
Moving from storage to vault requires crossing the minefield: you are in the minefield room
at its start/end tile; `go` from minefield to vault requires having reached the exit tile
(or the far door already open AND standing on the far side). Going back from vault to minefield
puts you at the exit tile; to go to storage from the minefield you must walk back along revealed
tiles to the start tile (step works on any revealed tile reachable through revealed tiles —
auto-walk). Keep it simple: `go('storage')` from the minefield works if you are on the start
tile, or there is a revealed path from your tile to the start tile (auto-walk, no new reveals).
Same for `go('vault')` when the exit tile is revealed and connected.

### LAB (room 1)
Objects spread around a ~10x10 room; container layout is specified in "v3 hiding & distractors":
- `cauldron` (big pot). use(dye_x, cauldron) pours one measure of that dye into the cauldron
  (the bottle is not consumed - infinite dye; you must hold it: take it first). inspect cauldron
  shows the measures so far ("2 מנות אדום, 1 צהוב"). `drain_valve`: use/inspect drains
  the cauldron (empty it). The valve is revealed by inspecting the cauldron.
- `potion_cabinet` contains `dye_red`, `dye_yellow`, `dye_blue`, `ink_black` (pouring it ruins
  the mix = muddy), `olive_oil`, `vinegar`, `perfume`, and `glitter`.
- `tall_cupboard` reveals `flask_rack` among junk. Taking from the rack gives `flask`
  (empty glass flask). Can take again if you have none.
- use(flask, cauldron): if cauldron counts exactly match the FIRE recipe -> you get `flask_fire`
  (orange); if exactly match ACID recipe -> `flask_acid` (green); otherwise `flask_muddy`
  (brown, useless; can be emptied: use(flask_muddy, drain_valve) -> flask). Filling empties
  the cauldron.
- `bookshelf` -> inspect reveals seven books and two ornaments. `recipe_book` is named
  "ספר כתוב ביד"; neither the shelf nor `look` reveals its contents.
  recipe_book text: fire potion recipe, e.g. "שיקוי אש: 2 מנות אדום + 1 מנת צהוב = כתום. הדף הבא
  נתלש." Randomized per seed (counts 1-3 each of two primary colors, the color name matches the
  mix: red+yellow=orange, yellow+blue=green, red+blue=purple). Fire recipe and acid recipe use
  different color pairs; acid is always a mix producing green or purple, fire always orange.
  star_atlas and poetry_book: flavor text, irrelevant.
- `desk` -> inspect reveals `desk_drawer` -> inspect/open reveals `brass_key` among stationery.
- `wall_clock`: stopped at a random time per seed (e.g. "4:15"); inspect says "השעון עומד על
  4:15. המחוגים לא זזים." This time is the vault code later (digits without colon: "415").
- Many distractors and junk containers; small ornaments live on furniture. Inspecting `rug`
  reveals a nailed-shut `trapdoor`, which never opens.
- `ice_door` (exit to storage): blocked by thick ice. use(flask_fire, ice_door) melts it (flask is
  consumed, you keep nothing), door opens. Other uses fail with a hint-free description.

### STORAGE (room 2)
- `scale` (big platform scale) and `gate` (to the minefield) with `gate_sign`: "השער ייפתח
  כשעל המשקל יהיו בדיוק 23 ק"ג". target = sum of exactly 3 of the 6 crates (unique solution
  preferred; at least guarantee one).
- `tarp` hides 6 crates `crate_1..crate_6` and `sand_sack`. Inspecting the tarp reveals their
  identities, not their weights. Crate weights 2-12 kg are revealed only by inspecting each crate (it shows a
  label "ארגז 3: 7 ק"ג"). Carry ONE crate at a time: take(crate) (fails if already carrying);
  use(crate, scale) places it on the scale; take a crate from the scale back (take(crate_x)
  when it's on the scale removes it from the scale into your hands). inspect scale shows
  current total and which crates are on it. When total == target exactly, the gate opens
  (event door). Opening is permanent.
- distractors: stuck `barrel`, `sand_sack` (can be taken, 9 kg — putting it on the scale counts
  its weight), `anvil` (too heavy to lift), `toolbox` with four tools, `mirror`, `poster`,
  `shelf_storage`, `ladder`, `wheelbarrow`, `cardboard_boxes` with junk.

### MINEFIELD (room 3)
- 7 columns x 9 rows floor grid. Start: row 0 col 3. Exit: row 8 col 3. ~16 mines, seeded,
  never on start/exit or their neighbors, and guaranteed a safe path from start to exit.
  Zero-cascade: stepping on a 0 tile reveals its neighbors recursively (classic minesweeper).
- Start tile is revealed when you enter. `step(row,col)`: target must be adjacent (8-neighbour)
  to a revealed tile; the player auto-walks there along revealed tiles. Safe -> reveal number of
  adjacent mines (+cascade). Mine -> explosion event, player back to start tile, revealed tiles
  stay revealed, the mine tile becomes marked as known mine (`exploded`), counts as a strike
  (statistic only).
- `look` in the minefield returns an ASCII-ish grid in the text: rows 0..8, `?` unknown, digit for
  revealed, `*` exploded mine, `@` player position.
- `warning_sign`, named "שלט חרוט על הקיר": an old inscription explains adjacent mine
  counts, diagonal neighbors, auto-walking, zero cascades and returning after an explosion.
  Wall furniture, armor, a bench and a niche hold additional junk; the grid is unchanged.
- Reaching the exit tile opens `far_door` to the vault.

### VAULT (room 4)
- Inspecting `vault_door` reveals 2 small fixtures: `keypad` (enter_code(code) — correct = lab clock digits) and
  `rust_seal` (use(flask_acid, rust_seal) dissolves it). Both open = escaped; place recorded
  (1st, 2nd...). Wrong code: ok:false, "הקוד שגוי" (count attempts).
- `notice_board` -> reveals five papers, including `torn_page`. Only reading the page gives
  the acid recipe ("שיקוי חומצה: 1 צהוב + 1 כחול = ירוק."). It does not explain its application.
- `cabinet`: locked; use(brass_key, cabinet) opens it -> reveals `note`, `ledger`, `stamp`.
  The note reads "השעה שבה נעצר השעון במעבדה, בספרות בלי נקודתיים."
  Without the key the agent can still guess from the clock.
- `grandfather_clock` (decoy): shows a different time (e.g. "7:40"), ticking.
- `small_safe` (broken, empty), `portrait`, `chest` -> reveals `gold_coin` (takeable, useless),
  `velvet_pouch`; `telescope`, `gold_pile`, `desk_vault`, `coat_rack`, `umbrella_stand`.

## v3 hiding & distractors

The player arrives in a furnished room, not a list of puzzle ingredients. Initial `look`
lists only large furniture, containers, large wall items and exits. Small objects have a
`parent` and `hidden: true`. `inspect` opens ordinary containers and reveals **only their
direct children**. Discovered objects then appear in subsequent looks, unless held or moved
elsewhere. Revealing a book or paper never reads it. No unseen object can be inspected,
taken, used, or addressed as a use target; `enter_code` also requires a discovered keypad.
Discovery, reading, item locations and the last activity are per-player and replayable.

| Room | Total objects | Initial look |
| --- | ---: | ---: |
| Lab | 49 | 14 |
| Storage | 30 | 14 |
| Minefield | 25 | 12 |
| Vault | 28 | 13 |

The requested full lab inventory exceeds the approximate 25–32-object budget: its eight
bottles, seven books, stationery, cupboard contents and wall furnishings are retained as
49 objects while keeping the initial look at 14. The other rooms stay within that budget.
Generated inventory flasks and grid tiles are not counted as room objects.

- Lab: glass cupboard -> eight mixed bottles; tall cupboard -> rack, apron, gloves, broom,
  folded stool; bookshelf -> seven books, skull, cat; desk -> globe, candles, drawer -> key,
  pencils, eraser, pen, receipt. The wall has clock, calendar, barometer, map and painting.
  Clothes chest and sink basket offer ordinary clutter. Rug -> nailed trapdoor.
- Storage: tarp -> six crates and sand sack; shelf -> paint cans, rope, lantern;
  toolbox -> magnifier, hammer, nails, screwdriver; cardboard boxes -> jars, newspapers.
  The barrel is stuck. Scale and gate sign stay visible.
- Minefield: twelve large objects flank the unchanged grid. Armor, bones, torch holder,
  shield, weapons rack and niche reveal small debris. Bench -> satchel -> cloth/buttons
  is a second nested search. The stone chest is stuck.
- Vault: board -> five papers; locked cabinet -> note, ledger, stamp; desk -> papers;
  chest -> coin, pouch; coat/umbrella stands -> coat/umbrella. Inspecting the vault door
  exposes its keypad and seal. The standing clock and broken safe remain decoys.

Current maximum nesting is two parent links (support at most three). Repeated inspections
do not emit duplicate discoveries. Stuck containers remain stuck; repeated cabinet inspection
never bypasses the brass key. Inventory items and all puzzle-chain IDs remain compatible.

Descriptions report appearances, inscriptions and observed effects. They never assign an
object a purpose or label it a clue. Recipes are printed only when their respective texts are
read. The ice door describes ice without naming a treatment; the acid page gives quantities
and color without mentioning rust. MCP rules introduce exploration and IDs, not puzzle steps.
Tests ban `רמז`, `חשוב`, `מתכון יעזור`, `להמיס`, `תמיס`, `קוד הכספת`, `פתרון` from player-facing text.

`activity(i)` describes the most recent valid command and its actual outcome, including failed
attempts: inspecting furniture, pouring a color, walking a grid tile or entering digits.
It never derives a future plan from puzzle progress. `objective(i)` is its compatibility alias.
`discoveries(i)` returns a fresh list: recipes only after reading, key after uncovering the
drawer, clock time after inspection, gate weight after reading the sign, and so forth. No
undiscovered facts or information from another player appear in this audience list.

Mock bots inspect containers before touching children, browse newly revealed junk, comment on
what they just saw, and may defer the desk until returning from the locked cabinet. Choices,
speech and timing have independent seeded streams. The existing uncertain-mine-guess safety
bias is unchanged; recipes, weights and times come only from observations. Extra searches are
balanced by shorter reading pauses, with a 4.5–7 minute four-player race and 5–16 wins per
personality across seeds 1–40. Tests also cover 30 complete scripted solves, browser/Node
replay, independent worlds, no hidden-object access, no spoiler vocabulary, and fuzz commands.

## Story arc (what makes it watchable)
An agent that skims the lab misses the key or the clock and has to backtrack from the vault
to the lab (crossing the minefield back on revealed tiles), brews acid, and returns. Both
backtracking and wrong guesses are visible drama. Keep the text the agent gets rich but neutral.

## Viewer (public/index.html)
Three.js 0.160 via importmap from cdn.jsdelivr.net (`three@0.160.0/build/three.module.js` and
`three@0.160.0/examples/jsm/`). 4 views in a 2x2 grid (each view its own WebGLRenderer +
EffectComposer with UnrealBloomPass, ACES tone mapping, soft shadows). Procedural canvas textures
(wood floor, stone walls, metal), rooms densely filled with props at the engine's object
positions, candle/torch flicker lights, nice robot avatars in agent colors with name labels,
walk/inspect/pick-up/pour/explosion/confetti animations, inventory chips per agent. Hebrew RTL
broadcast UI: race bar with progress per agent (room 1-4 + escaped), show clock, LIVE event
ticker, per-view audience activity line (plain Hebrew, e.g. "בודק את כוננית הספרים"),
thought panel with typewriter + last command (in plain Hebrew). Cameras: auto director / follow /
room / overview. Click a view to focus it large with full thought log and the raw text the agent
received. Modes: `?mode=demo` (default; local mock bots, seed from `?seed=`) and `?mode=live`
(SSE `/api/events`: `init {seed, players:[{name,color}], log:[{p,cmd,thought}]}` then `action
{p,cmd,thought}` messages; the viewer replays through its own Game copy). Performance: 4 renderers
must run at a decent framerate on a normal laptop — keep shadow maps small, pixel ratio capped.

## Server (server/server.js)
Node (ESM or CJS), `npm start` -> http://localhost:3000.
- static `public/`.
- SSE `/api/events` as above, plus `status` messages (lobby/running/finished).
- MCP streamable HTTP at `/mcp` using `@modelcontextprotocol/sdk` (McpServer +
  StreamableHTTPServerTransport). One tool per command (`look`, `inspect`, `take`, `use`,
  `enter_code`, `go`, `step`, `inventory`), each with a required `thought` string (Hebrew, shown
  to the audience). Tool description in Hebrew+English explaining the game briefly.
- Auth: contestant key via `Authorization: Bearer <key>` header or `?key=` query.
  `server/contestants.json`: `[{name, color, key}]` up to 4.
- Host page `/host?admin=<ADMIN_KEY>` (ADMIN_KEY from env or default printed at startup):
  open lobby / start race / reset (new seed). Before start, tools reply "המרוץ עוד לא התחיל".
- Empty slots are filled with mock bots (from public/mock.js) when the race starts.
- Each tool call waits the action's animation time (durationMs) before replying, so pacing is
  fair and the viewer can show it.
