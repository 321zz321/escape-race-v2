/* Pure game rules. Layout and solutions are shared; every mutable fact belongs to a player. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EscapeEngine = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const ROOMS_ORDER = Object.freeze(['lab', 'storage', 'minefield', 'vault']);
  const ROWS = 9;
  const COLS = 7;
  const START = Object.freeze({ row: 0, col: 3 });
  const EXIT = Object.freeze({ row: 8, col: 3 });
  const COLORS = Object.freeze({ red: 'אדום', yellow: 'צהוב', blue: 'כחול', black: 'שחור',
    orange: 'כתום', green: 'ירוק', purple: 'סגול', brown: 'חום' });
  const DYES = Object.freeze({ dye_red: 'red', dye_yellow: 'yellow', dye_blue: 'blue', ink_black: 'black' });
  const OPS = new Set(['look', 'inspect', 'take', 'use', 'enter_code', 'go', 'step', 'inventory', 'drop']);
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const clone = value => JSON.parse(JSON.stringify(value));
  const matrix = value => Array.from({ length: ROWS }, () => Array(COLS).fill(value));
  const emptyMix = () => ({ red: 0, yellow: 0, blue: 0, black: 0 });
  const inside = (r, c) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS;

  function freeze(value) {
    Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); });
    return Object.freeze(value);
  }

  // FNV-1a over UTF-16 code units: the same string produces the same seed in both runtimes.
  function seedNumber(seed) {
    if (typeof seed === 'number') return seed >>> 0;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let state = seedNumber(seed);
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let n = Math.imul(state ^ (state >>> 15), state | 1);
      n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Tile world positions, in the minefield room's local coordinate system.
  function tilePos(row, col) {
    return inside(row, col) ? { x: col - 3, z: row - 4 } : null;
  }

  function neighbors(row, col) {
    const result = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if ((dr || dc) && inside(row + dr, col + dc)) result.push({ row: row + dr, col: col + dc });
    }
    return result;
  }

  // BFS serves both generation and auto-walking; callers decide which tiles are traversable.
  function pathBetween(from, to, allowed) {
    if (!allowed(from.row, from.col) || !allowed(to.row, to.col)) return null;
    const queue = [from];
    const previous = new Map([[from.row * COLS + from.col, null]]);
    for (let head = 0; head < queue.length; head++) {
      const here = queue[head];
      if (here.row === to.row && here.col === to.col) {
        const path = [];
        let cursor = here;
        while (cursor) {
          path.push(cursor);
          cursor = previous.get(cursor.row * COLS + cursor.col);
        }
        return path.reverse();
      }
      for (const next of neighbors(here.row, here.col)) {
        const key = next.row * COLS + next.col;
        if (!previous.has(key) && allowed(next.row, next.col)) {
          previous.set(key, here);
          queue.push(next);
        }
      }
    }
    return null;
  }

  function shuffle(values, rng) {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function generateSolution(rng) {
    const roll = (min, max) => min + Math.floor(rng() * (max - min + 1));
    const fireRecipe = { red: roll(1, 3), yellow: roll(1, 3), blue: 0 };
    const acidColor = roll(0, 1) ? 'green' : 'purple';
    const acidRecipe = { red: 0, yellow: 0, blue: roll(1, 3) };
    acidRecipe[acidColor === 'green' ? 'yellow' : 'red'] = roll(1, 3);
    const time = value => `${Math.floor(value / 60) + 1}:${String(value % 60).padStart(2, '0')}`;
    const clock = roll(0, 719);
    const clockTime = time(clock);
    const decoyTime = time((clock + roll(1, 719)) % 720);

    // Target = sum of exactly 3 crates, and NO other subset (any size, with or without the
    // 9 kg sand sack) may reach it, so the only way to open the gate is the right triple.
    let weights, unique;
    do {
      weights = shuffle(Array.from({ length: 11 }, (_, i) => i + 2), rng).slice(0, 6);
      const all = [...weights, 9]; // index 6 = sand_sack
      const bySum = new Map();
      for (let mask = 1; mask < 128; mask++) {
        let sum = 0, size = 0;
        for (let k = 0; k < 7; k++) if (mask & (1 << k)) { sum += all[k]; size++; }
        if (!bySum.has(sum)) bySum.set(sum, []);
        bySum.get(sum).push(mask);
      }
      unique = [...bySum].filter(([sum, masks]) => sum > 12 && masks.length === 1 && !(masks[0] & 64)
        && [0, 1, 2, 3, 4, 5].filter(k => masks[0] & (1 << k)).length === 3)
        .map(([sum, masks]) => [sum, [[0, 1, 2, 3, 4, 5].filter(k => masks[0] & (1 << k)).map(k => `crate_${k + 1}`)]]);
    } while (!unique.length);
    const crateWeights = Object.fromEntries(weights.map((kg, i) => [`crate_${i + 1}`, kg]));
    const [target, choices] = unique[roll(0, unique.length - 1)];

    const candidates = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      if ([START, EXIT].every(end => Math.max(Math.abs(row - end.row), Math.abs(col - end.col)) > 1)) {
        candidates.push({ row, col });
      }
    }
    let mines;
    for (let attempt = 0; attempt <= 128; attempt++) {
      mines = matrix(false);
      // Bounded fallback reserves a straight safe corridor, while still placing all 16 mines.
      const pool = attempt === 128 ? candidates.filter(tile => tile.col !== 3) : candidates;
      shuffle(pool, rng).slice(0, 16).forEach(({ row, col }) => { mines[row][col] = true; });
      if (pathBetween(START, EXIT, (r, c) => !mines[r][c])) break;
    }
    return freeze({ fireRecipe, acidRecipe, fireColor: 'orange', acidColor, clockTime,
      clockCode: clockTime.replace(':', ''), decoyTime, crateWeights, target,
      crateTriple: choices[0], mines });
  }

  function object(id, name, kind, x, z, description, options = {}) {
    return { id, name, kind, x, z, description, hidden: false, parent: null, ...options };
  }

  function makeRooms() {
    const o = object;
    const portable = { takeable: true };
    const hidden = parent => ({ hidden: true, parent });
    const door = (id, name, z, description, kind = 'door') => o(id, name, kind, 0, z, description);
    // Children inherit their container's position below. Discovery opens only one level.
    const child = (parent, id, name, kind, description, options = {}) =>
      o(id, name, kind, 0, 0, description, { ...hidden(parent), ...options });
    const rooms = {
      lab: { name: 'המעבדה', objects: [
        o('cauldron', 'קדרה', 'cauldron', -2.8, -0.6, 'קדרת ברזל רחבה, עם ידיות עבות ושפה כהה.'),
        child('cauldron', 'drain_valve', 'ברז ניקוז', 'valve', 'ברז קטן מחובר לתחתית הקדרה.'),
        o('potion_cabinet', 'ארון זכוכית', 'cabinet', -4.2, -2.5, 'ארון עם דלתות זכוכית עכורות וידיות נחושת.'),
        child('potion_cabinet', 'olive_oil', 'בקבוק שמן זית', 'bottle', 'על התווית מצויר ענף זית. הנוזל בפנים צהבהב.', { ...portable, color: 'yellow' }),
        child('potion_cabinet', 'dye_blue', 'בקבוק צבע כחול', 'bottle', 'על התווית כתוב צבע כחול. משקע כחול מכסה את התחתית.', { ...portable, color: 'blue' }),
        child('potion_cabinet', 'perfume', 'בקבוק בושם', 'bottle', 'בקבוק קטן עם פקק פרחוני וריח מתקתק.', { ...portable, color: 'clear' }),
        child('potion_cabinet', 'ink_black', 'בקבוק דיו שחור', 'bottle', 'דיו כהה ממלא בקבוק צר. סביב הפקק כתם יבש.', { ...portable, color: 'black' }),
        child('potion_cabinet', 'dye_red', 'בקבוק צבע אדום', 'bottle', 'על התווית כתוב צבע אדום. טיפה אדומה יבשה על הפקק.', { ...portable, color: 'red' }),
        child('potion_cabinet', 'vinegar', 'בקבוק חומץ', 'bottle', 'בקבוק שקוף עם תווית חומץ וריח חד.', { ...portable, color: 'clear' }),
        child('potion_cabinet', 'glitter', 'צנצנת נצנצים', 'bottle', 'גרגרים כסופים נצמדים לדפנות הצנצנת.', { ...portable, color: 'silver' }),
        child('potion_cabinet', 'dye_yellow', 'בקבוק צבע צהוב', 'bottle', 'על התווית כתוב צבע צהוב. הזכוכית מוכתמת סביב הצוואר.', { ...portable, color: 'yellow' }),
        o('tall_cupboard', 'ארון גבוה', 'cabinet', -3.6, 3.2, 'ארון עץ גבוה עם שתי דלתות סגורות.'),
        child('tall_cupboard', 'apron', 'סינר', 'prop', 'סינר בד עם כיס קרוע וכתמי שעווה.'),
        child('tall_cupboard', 'flask_rack', 'מעמד בקבוקונים', 'rack', 'בקבוקוני זכוכית קטנים עומדים בשורות על מעמד עץ.'),
        child('tall_cupboard', 'gloves', 'כפפות', 'prop', 'זוג כפפות גומי יבשות ומקומטות.'),
        child('tall_cupboard', 'broom', 'מטאטא', 'prop', 'סיבי קש קשורים בקצה מקל עץ.'),
        o('bookshelf', 'כוננית ספרים', 'shelf', 4.3, -2.7, 'כוננית עץ גבוהה. כריכות וחפצים קטנים מצטופפים על מדפיה.'),
        child('bookshelf', 'cookbook', 'ספר בישול', 'book', 'עוגת תפוחים, מרק בצל ולחם שיפון. בשוליים כתמי קמח.'),
        child('bookshelf', 'star_atlas', 'אטלס כוכבים', 'book', 'מפות שמיים וציורים קטנים של קבוצות כוכבים ממלאים את הדפים.'),
        child('bookshelf', 'recipe_book', 'ספר כתוב ביד', 'book', 'ספר עבה עם כריכה מוכתמת ופינות מקופלות.'),
        child('bookshelf', 'poetry_book', 'ספר שירים', 'book', 'שירים קצרים על גשם, חלונות ודרכים רחוקות.'),
        child('bookshelf', 'dictionary', 'מילון', 'book', 'מילים מסודרות לפי האלפבית. כמה דפים דבוקים זה לזה.'),
        child('bookshelf', 'diary_old', 'יומן ישן', 'book', 'רשימות על מזג האוויר ועל ביקורים בשוק.'),
        child('bookshelf', 'empty_folder', 'תיקייה', 'book', 'שתי כנפי קרטון וגומייה רפויה. אין בפנים דפים.'),
        child('bookshelf', 'skull', 'גולגולת', 'skull', 'גולגולת בהירה מונחת על בד מקופל.'),
        child('bookshelf', 'cat_statue', 'פסל חתול', 'statue', 'חתול אבן קטן עם זנב כרוך סביב רגליו.'),
        o('desk', 'שולחן כתיבה', 'desk', 3.1, 0.1, 'שולחן עץ נמוך עם סימני כוסות על המשטח.'),
        child('desk', 'desk_drawer', 'מגירת השולחן', 'drawer', 'מגירה צרה עם ידית פליז עגולה.'),
        child('desk_drawer', 'pencils', 'עפרונות', 'prop', 'שלושה עפרונות קצרים עם קצוות קהים.'),
        child('desk_drawer', 'eraser', 'מחק', 'prop', 'מחק אפור שחוק משני צדדיו.'),
        child('desk_drawer', 'brass_key', 'מפתח פליז', 'key', 'מפתח קטן וכבד מעט עם ראש עגול.', portable),
        child('desk_drawer', 'ink_pen', 'עט דיו', 'prop', 'עט מתכת עם ציפורן עקומה.'),
        child('desk_drawer', 'old_receipt', 'קבלה ישנה', 'paper', 'תשלום עבור נרות, סבון ובד. הדיו דהוי.'),
        child('desk', 'globe', 'גלובוס', 'globe', 'גלובוס קטן על בסיס מתכת. שמות ארצות מודפסים באותיות צפופות.'),
        child('desk', 'candles', 'נרות', 'candles', 'שלושה נרות בגבהים שונים עם טיפות שעווה על התחתית.'),
        o('wall_clock', 'שעון קיר', 'clock', 1.7, -4.7, 'שעון עגול עם ספרות גדולות ומסגרת עץ.'),
        o('calendar', 'לוח שנה', 'poster', -0.5, -4.7, 'לוח שנה גדול. הדפים תלויים על מסמר חלוד.'),
        o('barometer', 'ברומטר', 'clock', 3.4, -4.7, 'מחוג דק ניצב בין המילים יבש וגשום.'),
        o('old_map', 'מפת קיר', 'painting', -4.7, 0.8, 'מפה גדולה של חוף מפורץ. קפל חוצה את הנייר.'),
        o('painting', 'ציור נוף', 'painting', -2.2, -4.7, 'שביל צר מתפתל בין עצים בציור במסגרת כהה.'),
        o('chest_lab', 'ארגז בגדים', 'chest', 3.7, 3.7, 'ארגז עץ רחב עם מכסה כבד וריח בד ישן.'),
        child('chest_lab', 'old_clothes', 'בגדים ישנים', 'prop', 'מעילים מקופלים עם כפתורים חסרים.'),
        child('chest_lab', 'broken_spectacles', 'משקפיים שבורים', 'prop', 'מסגרת דקה ובתוכה עדשה סדוקה אחת.'),
        o('rug', 'שטיח', 'rug', 0, 0.6, 'שטיח ארוג עם פסים רחבים ושוליים מעט פרומים.'),
        child('rug', 'trapdoor', 'דלת רצפה', 'door', 'לוחות עץ ממוסמרים למסגרת. המכסה אינו זז.', { stuck: true }),
        child('tall_cupboard', 'stool', 'שרפרף מתקפל', 'prop', 'שרפרף עץ מקופל עם מושב שחוק.'),
        o('sink', 'כיור', 'prop', -4.3, 2, 'כיור אבן עמוק עם מדף רחב וכתמים בהירים.'),
        child('sink', 'herb_basket', 'סל עשבים', 'prop', 'סל קטן על שפת הכיור, מלא עלים יבשים וגבעולים.'),
        door('ice_door', 'דלת מכוסה קרח', 4.8, 'שכבת קרח עבה מכסה את הדלת ואת הידית.')
      ], doors: [{ id: 'ice_door', to: 'storage', x: 0, z: 4.8 }] },
      storage: { name: 'המחסן', objects: [
        door('ice_door', 'הדלת למעבדה', -4.8, 'דלת עץ רחבה מובילה בחזרה למעבדה.'),
        o('scale', 'משקל רצפה', 'scale', 2.8, 2.6, 'משטח מתכת רחב מחובר ללוח תצוגה קטן.'),
        door('gate', 'שער ברזל', 4.8, 'שער עשוי מוטות ברזל עבים עומד בקצה המחסן.'),
        o('gate_sign', 'שלט ליד השער', 'sign', 1.4, 4.7, 'שלט מתכת מוברג לקיר לצד השער.'),
        o('tarp', 'יריעת בד', 'rug', -3.1, -1.1, 'יריעת בד גדולה מכסה ערמה בעלת פינות ישרות.'),
        ...Array.from({ length: 6 }, (_, i) => o(`crate_${i + 1}`, `ארגז ${i + 1}`, 'crate',
          -3.7 + (i % 2) * 1.5, -2.6 + Math.floor(i / 2) * 1.7,
          'ארגז עץ סגור עם חבל עבה ותווית על הצד.', { ...portable, ...hidden('tarp') })),
        child('tarp', 'sand_sack', 'שק חול', 'sack', 'שק בד קשור בחבל. על התווית כתוב: 9 ק״ג.', portable),
        o('shelf_storage', 'מדף עץ', 'shelf', -4.7, -1.6, 'מדף עץ רחב ועליו כלי עבודה וקופסאות.'),
        child('shelf_storage', 'paint_cans', 'פחיות צבע', 'prop', 'מכסי הפחיות מכוסים בצבע יבש.'),
        child('shelf_storage', 'rope', 'חבל', 'prop', 'חבל עבה מגולגל ומלא קשרים.'),
        child('shelf_storage', 'lantern', 'עששית', 'prop', 'עששית עם זכוכית מפויחת ופתיל קצר.'),
        o('toolbox', 'ארגז כלים', 'toolbox', -3.8, 3.2, 'ארגז מתכת עם ידית שחוקה ומכסה צבוע.'),
        child('toolbox', 'magnifier', 'זכוכית מגדלת', 'magnifier', 'עדשה עגולה עם ידית עץ קצרה.', portable),
        child('toolbox', 'hammer', 'פטיש', 'prop', 'ראש ברזל על ידית עץ מוכתמת.', portable),
        child('toolbox', 'nails', 'מסמרים', 'prop', 'מסמרים עקומים בקופסת פח קטנה.'),
        child('toolbox', 'screwdriver', 'מברג', 'prop', 'מברג עם קצה שחוק וידית אדומה.', portable),
        o('barrel', 'חבית', 'barrel', 4, -3.4, 'חבית עץ עם חישוקי מתכת. המכסה תקוע ואינו זז.', { stuck: true }),
        o('anvil', 'סדן', 'anvil', 4, -0.3, 'גוש ברזל גדול על בסיס עץ עבה.'),
        o('mirror', 'מראה', 'mirror', -4.7, 1, 'מראה צרה תלויה במסגרת ברזל דקה.'),
        o('poster', 'כרזה', 'poster', 2, -4.7, 'איור ישן של עגלה עמוסה תלוי על הקיר.'),
        o('ladder', 'סולם', 'prop', 4.6, 1.3, 'סולם עץ רחב נשען על הקיר.'),
        o('wheelbarrow', 'מריצה', 'prop', 2, -2.8, 'מריצת מתכת עם גלגל שטוח ושאריות טיח.'),
        o('cardboard_boxes', 'קופסאות קרטון', 'chest', -1.5, 3.1, 'קופסאות רחבות קשורות בחוט דק.'),
        child('cardboard_boxes', 'empty_jars', 'צנצנות ריקות', 'prop', 'צנצנות זכוכית עטופות בבד.'),
        child('cardboard_boxes', 'newspapers', 'עיתונים', 'paper', 'תוצאות מרוץ סוסים ופרסומות לסבון על נייר מצהיב.')
      ], doors: [{ id: 'ice_door', to: 'lab', x: 0, z: -4.8 }, { id: 'gate', to: 'minefield', x: 0, z: 4.8 }] },
      minefield: { name: 'שדה המוקשים', objects: [
        door('gate', 'השער למחסן', -4.8, 'שער ברזל רחב מפריד בין הלוח למחסן.'),
        door('far_door', 'הדלת הרחוקה', 4.8, 'דלת עץ כהה ניצבת מעבר לקצה הלוח.'),
        o('warning_sign', 'שלט חרוט על הקיר', 'sign', -4.4, -3.8, 'באבן חרוט: כל מספר מונה את המוקשים הנוגעים במשבצת, גם באלכסון. הצעד הבא סמוך לשטח שנחשף; הדרך בשטח הגלוי נדרכת מאליה. אפס חושף את סביבתו. פיצוץ משיב אל ההתחלה, אך הגלוי נשאר גלוי.'),
        o('armor', 'שריון', 'armor', 4.4, -2.8, 'שריון מתכת חלול ניצב על מעמד עץ.'),
        child('armor', 'helmet', 'קסדה', 'prop', 'קסדה מונחת בחלל השריון. רצועת הסנטר קרועה.'),
        child('armor', 'armor_lining', 'בטנת בד', 'prop', 'בד עבה ומרופט דבוק למתכת.'),
        o('banner', 'דגל בד', 'banner', -4.7, 1.5, 'דגל ארוך דהוי. בשוליו רקומים קווים זהובים.'),
        o('bones', 'ערמת עצמות', 'bones', 4.4, 3, 'ערמת עצמות גדולה מונחת ליד הקיר.'),
        child('bones', 'tooth', 'שן', 'prop', 'שן שטוחה וצהבהבה בין העצמות.'),
        o('torch_holder', 'מתקן לפידים', 'prop', -4.6, -1.6, 'מתקן ברזל גבוה מחובר לקיר בשלושה ברגים.'),
        child('torch_holder', 'spent_torch', 'לפיד כבוי', 'prop', 'קצה עץ שרוף עטוף ברצועת בד.'),
        o('cracked_shield', 'מגן סדוק', 'prop', 4.7, 0, 'מגן גדול ושסוע תלוי על וו.'),
        child('cracked_shield', 'leather_straps', 'רצועות עור', 'prop', 'רצועות עור קשיחות בצדו האחורי של המגן.'),
        o('stone_bench', 'ספסל אבן', 'prop', -4.5, 3.4, 'ספסל אבן ארוך וצמוד לקיר.'),
        child('stone_bench', 'satchel', 'תיק בד', 'chest', 'תיק מקופל מונח תחת הספסל.'),
        child('satchel', 'cloth_scraps', 'שאריות בד', 'prop', 'פיסות בד בשלושה גוונים של אפור.'),
        child('satchel', 'buttons', 'כפתורים', 'prop', 'כפתורי עץ עגולים ומחוררים.'),
        o('stone_chest', 'תיבת אבן', 'chest', 4.4, 4, 'תיבת אבן גדולה. המכסה תפוס תחת הקיר ואינו זז.', { stuck: true }),
        o('weapons_rack', 'מעמד נשק', 'rack', 4.5, -4, 'מעמד עץ גבוה עם חריצים ארוכים.'),
        child('weapons_rack', 'rusty_sword', 'חרב חלודה', 'prop', 'להב קהה עם כתמי חלודה.'),
        child('weapons_rack', 'broken_spear', 'חנית שבורה', 'prop', 'מוט קצר עם חוד אבן סדוק.'),
        o('wall_niche', 'גומחת קיר', 'shelf', -4.7, 0, 'גומחה רחבה ועמוקה חצובה באבן.'),
        child('wall_niche', 'pottery_shards', 'שברי חרס', 'prop', 'שברי חרס אדמדם עם זיגוג מתקלף.'),
        child('wall_niche', 'clay_bowl', 'קערת חרס', 'prop', 'קערה ריקה עם שפה עבה.'),
        child('wall_niche', 'smooth_stones', 'אבנים חלקות', 'prop', 'חלוקי נחל אפורים מאובקים.')
      ], doors: [{ id: 'gate', to: 'storage', x: 0, z: -4.8 }, { id: 'far_door', to: 'vault', x: 0, z: 4.8 }] },
      vault: { name: 'חדר הכספת', objects: [
        door('far_door', 'הדלת לשדה המוקשים', -4.8, 'דלת עץ כבדה מובילה בחזרה ללוח המשבצות.'),
        door('vault_door', 'דלת הכספת', 4.8, 'דלת מתכת עבה עם לוח מקשים וחותם חלוד.', 'vault_door'),
        child('vault_door', 'keypad', 'לוח מקשים', 'keypad', 'מקשי ספרות מסודרים מתחת לחלון תצוגה צר.'),
        child('vault_door', 'rust_seal', 'חותם חלוד', 'seal', 'חותם מתכת חום מחבר בין הדלת למסגרת.'),
        o('notice_board', 'לוח מודעות', 'board', -4.7, -2.1, 'לוח שעם עמוס בניירות נעוצים זה על גבי זה.'),
        child('notice_board', 'old_notice', 'מודעה ישנה', 'paper', 'ביום חמישי ייצבע חדר המדרגות. החתימה דהויה.'),
        child('notice_board', 'wanted_poster', 'כרזת מבוקש', 'paper', 'ציור של גבר בכובע ולצדו חותמת אדומה.'),
        child('notice_board', 'torn_page', 'דף תלוש', 'paper', 'דף עם קצה קרוע וכתמים עגולים.'),
        child('notice_board', 'menu', 'תפריט', 'paper', 'תה, לחם, זיתים ומרק היום.'),
        child('notice_board', 'bank_hours', 'שעות פתיחה', 'paper', 'קבלת קהל בבוקר בלבד. סגור בשבת.'),
        o('cabinet', 'ארונית', 'cabinet', 3.8, -2.4, 'ארונית עץ קטנה עם חור מפתח בידית.'),
        child('cabinet', 'ledger', 'פנקס חשבונות', 'book', 'טורים של תאריכים וסכומים, רובם מחוקים.'),
        child('cabinet', 'note', 'פתק מקופל', 'note', 'פתק בהיר מקופל לשניים.'),
        child('cabinet', 'stamp', 'חותמת', 'prop', 'חותמת עץ עם כרית דיו יבשה.'),
        o('desk_vault', 'שולחן משרדי', 'desk', 2.5, 0.8, 'שולחן רחב עם משטח ירוק ושוליים שרוטים.'),
        child('desk_vault', 'papers_pile', 'ערמת ניירות', 'paper', 'טפסים ריקים וגיליונות עם קווים צפופים.'),
        o('grandfather_clock', 'שעון עומד', 'clock', -3.8, 3.4, 'שעון גבוה בתוך ארון עץ עם מטוטלת מבריקה.'),
        o('small_safe', 'כספת קטנה', 'safe', 4, 0, 'הדלת הקטנה תלויה על ציר שבור. בפנים ריק.'),
        o('portrait', 'דיוקן', 'portrait', 2, -4.7, 'דיוקן של אדם במעיל כהה על רקע חלון פתוח.'),
        o('chest', 'תיבת עץ', 'chest', -3.8, 0.4, 'תיבה נמוכה עם רצועות מתכת על המכסה.'),
        child('chest', 'gold_coin', 'מטבע זהב', 'coin', 'מטבע עגול עם ציור של ציפור.', portable),
        child('chest', 'velvet_pouch', 'שקיק קטיפה', 'prop', 'שקיק רך וריק עם שרוך קצר.'),
        o('telescope', 'טלסקופ', 'telescope', 3.7, 3.5, 'צינור פליז ארוך נשען על חצובה.'),
        o('gold_pile', 'ערמת זהב', 'gold', -2.6, 2.2, 'ערמה גדולה של מטבעות וגושים על מגש.'),
        o('coat_rack', 'מתלה מעילים', 'prop', -2, -3.5, 'מתלה עץ גבוה עם ווים עקומים.'),
        child('coat_rack', 'dusty_coat', 'מעיל מאובק', 'prop', 'מעיל צמר כבד. הכיסים ריקים.'),
        o('umbrella_stand', 'מעמד מטריות', 'prop', 3.6, -4, 'מעמד מתכת רחב עם תחתית מחוררת.'),
        child('umbrella_stand', 'bent_umbrella', 'מטרייה עקומה', 'prop', 'מטרייה עם מוט כפוף ובד דהוי.')
      ], doors: [{ id: 'far_door', to: 'minefield', x: 0, z: -4.8 }, { id: 'vault_door', to: 'exit', x: 0, z: 4.8 }] }
    };
    for (const room of Object.values(rooms)) {
      for (const obj of room.objects) {
        if (obj.parent && obj.kind !== 'crate') {
          const parent = room.objects.find(entry => entry.id === obj.parent);
          obj.x = parent.x;
          obj.z = parent.z;
        }
      }
    }
    return freeze(rooms);
  }


  function recipeText(recipe, title, color) {
    return `${title}: ${Object.keys(recipe).filter(key => recipe[key]).map(key => (recipe[key] === 1 ? `מנה אחת ${COLORS[key]}` : `${recipe[key]} מנות ${COLORS[key]}`)).join(' + ')} = ${COLORS[color]}.`;
  }

  // Copy only recognized, validated fields. Even accessor/proxy inputs cannot escape this boundary.
  function command(raw) {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const op = raw.op;
      if (!OPS.has(op)) return null;
      const cmd = { op };
      const id = key => {
        const value = raw[key];
        if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(value)) return false;
        cmd[key] = value;
        return true;
      };
      if (['inspect', 'take'].includes(op) && !id('target')) return null;
      if (['use', 'drop'].includes(op) && !id('item')) return null;
      if (op === 'use' && raw.target !== undefined && !id('target')) return null;
      if (op === 'go' && !id('room')) return null;
      if (op === 'step') {
        const row = raw.row;
        const col = raw.col;
        if (!inside(row, col)) return null;
        Object.assign(cmd, { row, col });
      }
      if (op === 'enter_code') {
        const code = raw.code;
        if (typeof code === 'number' && Number.isSafeInteger(code) && code >= 0 && code <= 9999) cmd.code = String(code);
        else if (typeof code === 'string' && /^\d{1,4}$/.test(code)) cmd.code = code;
        else return null;
      }
      return cmd;
    } catch (_) { return null; }
  }

  class Game {
    constructor(seed = 1, playerCount = 4) {
      if (typeof seed !== 'string' && !Number.isSafeInteger(seed)) throw new TypeError('הזרע חייב להיות מספר שלם או טקסט.');
      if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 4) throw new RangeError('נדרשים שחקן אחד עד ארבעה.');
      this.seed = seed;
      this._solution = generateSolution(mulberry32(seed));
      this.rooms = makeRooms();
      this.items = freeze(Object.fromEntries(['flask', 'flask_fire', 'flask_acid', 'flask_muddy'].map((id, i) => {
        const color = ['clear', 'orange', this._solution.acidColor, 'brown'][i];
        return [id, object(id, i ? `בקבוקון ${COLORS[color]}` : 'בקבוקון ריק', 'flask', -3.6, 3.2,
          i ? `בקבוקון זכוכית קטן ובתוכו נוזל ${COLORS[color]}.` : 'בקבוקון זכוכית שקוף, עם צוואר צר.', { color, takeable: true })];
      })));
      this.finishOrder = [];
      this.players = Array.from({ length: playerCount }, () => ({
        room: 'lab', pos: { x: 0, z: -3.8 }, inventory: [], carrying: null, escaped: false, place: null,
        discovered: [], read: [], itemLocations: {}, scale: [], cauldron: emptyMix(), cabinetOpen: false,
        doors: { ice_door: false, gate: false, far_door: false, vault_door: false },
        locks: { keypad: false, seal: false }, codeAttempts: 0,
        minefield: { row: START.row, col: START.col, revealed: matrix(false), exploded: matrix(false), strikes: 0 }
      }));
    }

    get finished() { return this.players.every(player => player.escaped); }
    get state() { return clone({ seed: this.seed, players: this.players, finishOrder: this.finishOrder, finished: this.finished }); }
    solution() { return clone(this._solution); }
    tilePos(row, col) { return tilePos(row, col); }

    progress(i) {
      const p = this._player(i);
      return p ? [p.doors.ice_door, p.doors.gate, p.doors.far_door, p.locks.keypad, p.locks.seal].filter(Boolean).length / 5 : 0;
    }

    activity(i) {
      const p = this._player(i);
      if (!p) return 'ממתין לשחקן';
      return p.lastActivity || 'עומד במעבדה';
    }
    objective(i) { return this.activity(i); }

    discoveries(i) {
      const p = this._player(i);
      if (!p) return [];
      const found = [];
      if (p.read.includes('recipe_book')) found.push('מתכון שיקוי אש');
      if (p.discovered.includes('brass_key')) found.push('מפתח פליז');
      if (p.read.includes('wall_clock')) found.push(`שעה בשעון: ${this._solution.clockTime}`);
      if (p.read.includes('gate_sign')) found.push(`משקל בשלט: ${this._solution.target} ק״ג`);
      if (p.read.includes('warning_sign')) found.push('כתובת המשבצות');
      if (p.read.includes('torn_page')) found.push('מתכון חומצה');
      if (p.read.includes('note')) found.push('פתק על השעון במעבדה');
      return found;
    }

    _activity(cmd, result) {
      // Definite forms belong to the narration only; object names and rules are unchanged.
      // The legacy bookshelf phrase is contract-tested verbatim; the viewer polishes it.
      const definite = {
        cauldron:'הקדרה', drain_valve:'ברז הניקוז', potion_cabinet:'ארון הזכוכית', tall_cupboard:'הארון הגבוה',
        olive_oil:'בקבוק שמן הזית', dye_blue:'בקבוק הצבע הכחול', perfume:'בקבוק הבושם', ink_black:'בקבוק הדיו השחור', dye_red:'בקבוק הצבע האדום', vinegar:'בקבוק החומץ', glitter:'צנצנת הנצנצים', dye_yellow:'בקבוק הצבע הצהוב',
        apron:'הסינר', flask_rack:'מעמד הבקבוקונים', gloves:'הכפפות', broom:'המטאטא', bookshelf:'כוננית ספרים', cookbook:'ספר הבישול', star_atlas:'אטלס הכוכבים', recipe_book:'הספר הכתוב ביד', poetry_book:'ספר השירים', dictionary:'המילון', diary_old:'היומן הישן', empty_folder:'התיקייה', skull:'הגולגולת', cat_statue:'פסל החתול',
        desk:'שולחן הכתיבה', desk_drawer:'מגירת השולחן', pencils:'העפרונות', eraser:'המחק', brass_key:'מפתח הפליז', ink_pen:'עט הדיו', old_receipt:'הקבלה הישנה', globe:'הגלובוס', candles:'הנרות', wall_clock:'שעון הקיר', calendar:'לוח השנה', barometer:'הברומטר', old_map:'מפת הקיר', painting:'ציור הנוף', chest_lab:'ארגז הבגדים', old_clothes:'הבגדים הישנים', broken_spectacles:'המשקפיים השבורים', rug:'השטיח', trapdoor:'דלת הרצפה', stool:'השרפרף המתקפל', sink:'הכיור', herb_basket:'סל העשבים', ice_door:'הדלת המכוסה בקרח',
        scale:'משקל הרצפה', gate:'שער הברזל', gate_sign:'השלט ליד השער', tarp:'יריעת הבד', sand_sack:'שק החול', shelf_storage:'מדף העץ', paint_cans:'פחיות הצבע', rope:'החבל', lantern:'העששית', toolbox:'ארגז הכלים', magnifier:'הזכוכית המגדלת', hammer:'הפטיש', nails:'המסמרים', screwdriver:'המברג', barrel:'החבית', anvil:'הסדן', mirror:'המראה', poster:'הכרזה', ladder:'הסולם', wheelbarrow:'המריצה', cardboard_boxes:'קופסאות הקרטון', empty_jars:'הצנצנות הריקות', newspapers:'העיתונים',
        far_door:'הדלת הרחוקה', warning_sign:'השלט החרוט על הקיר', armor:'השריון', helmet:'הקסדה', armor_lining:'בטנת הבד', banner:'דגל הבד', bones:'ערמת העצמות', tooth:'השן', torch_holder:'מתקן הלפידים', spent_torch:'הלפיד הכבוי', cracked_shield:'המגן הסדוק', leather_straps:'רצועות העור', stone_bench:'ספסל האבן', satchel:'תיק הבד', cloth_scraps:'שאריות הבד', buttons:'הכפתורים', stone_chest:'תיבת האבן', weapons_rack:'מעמד הנשק', rusty_sword:'החרב החלודה', broken_spear:'החנית השבורה', wall_niche:'גומחת הקיר', pottery_shards:'שברי החרס', clay_bowl:'קערת החרס', smooth_stones:'האבנים החלקות',
        vault_door:'דלת הכספת', keypad:'לוח המקשים', rust_seal:'החותם החלוד', notice_board:'לוח המודעות', old_notice:'המודעה הישנה', wanted_poster:'כרזת המבוקש', torn_page:'הדף התלוש', menu:'התפריט', bank_hours:'שעות הפתיחה', cabinet:'הארונית', ledger:'פנקס החשבונות', note:'הפתק המקופל', stamp:'החותמת', desk_vault:'השולחן המשרדי', papers_pile:'ערמת הניירות', grandfather_clock:'השעון העומד', small_safe:'הכספת הקטנה', portrait:'הדיוקן', chest:'תיבת העץ', gold_coin:'מטבע הזהב', velvet_pouch:'שקיק הקטיפה', telescope:'הטלסקופ', gold_pile:'ערמת הזהב', coat_rack:'מתלה המעילים', dusty_coat:'המעיל המאובק', umbrella_stand:'מעמד המטריות', bent_umbrella:'המטרייה העקומה',
        flask:'הבקבוקון הריק', flask_fire:'הבקבוקון הכתום', flask_acid:`הבקבוקון ה${COLORS[this._solution.acidColor]}`, flask_muddy:'הבקבוקון העכור'
      };
      const name = id => definite[id] || `ה${this._name(id)}`;
      // Failed guesses must not disclose an unseen object's identity or imply success.
      if (result.ev.some(e => e.t === 'boom')) return 'חוזר לתחילת הלוח אחרי פיצוץ';
      if (!result.ok) return result.ev.some(e => e.t === 'code') ? 'מקליד קוד בלוח המקשים' : 'מנסה פעולה בחדר';
      if (cmd.op === 'look') return 'מסתכל סביב בחדר';
      if (cmd.op === 'inventory') return 'בודק את החפצים שבידיו';
      if (cmd.op === 'inspect') return `בודק את ${name(cmd.target)}`;
      if (cmd.op === 'take') return `לוקח ${cmd.target === 'flask_rack' ? 'בקבוקון מהמעמד' : `את ${name(cmd.target)}`}`;
      if (cmd.op === 'drop') return `מניח את ${name(cmd.item)} על הרצפה`;
      if (cmd.op === 'go') return `עובר אל ${this.rooms[cmd.room].name}`;
      if (cmd.op === 'step') return `צועד במשבצת ${cmd.row},${cmd.col}`;
      if (cmd.op === 'enter_code') return 'מקליד קוד בלוח המקשים';
      if (own(DYES, cmd.item) && cmd.target === 'cauldron') return `מוזג ${cmd.item === 'ink_black' ? 'דיו שחור' : `צבע ${COLORS[DYES[cmd.item]]}`} לקדרה`;
      if (cmd.item === 'flask' && cmd.target === 'cauldron') return 'ממלא בקבוקון מהקדרה';
      if (cmd.item === 'drain_valve') return 'מסובב את ברז הניקוז';
      if (cmd.item === 'brass_key' && cmd.target === 'cabinet') return 'מסובב מפתח בארונית';
      if (cmd.target === 'scale') return `מניח את ${name(cmd.item)} על המשקל`;
      if (cmd.item.startsWith('flask_')) return `שופך נוזל על ${name(cmd.target)}`;
      return `משתמש ב${name(cmd.item)}`;
    }

    _player(i) { return Number.isInteger(i) && i >= 0 && i < this.players.length ? this.players[i] : null; }
    _event(i, ev, t, data = {}) {
      const p = this._player(i);
      ev.push({ t, p: p ? i : null, ...(p ? { room: p.room, ...p.pos } : {}), ...data });
    }
    _move(i, ev, pos) {
      this.players[i].pos = { x: pos.x, z: pos.z };
      this._event(i, ev, 'move');
    }
    _fail(i, text, ev = []) { this._event(i, ev, 'fail', { msg: text }); return { ok: false, text, ev }; }
    _ok(text, ev = []) { return { ok: true, text, ev }; }
    _open(i, ev, door) {
      const p = this.players[i];
      if (!p.doors[door]) {
        p.doors[door] = true;
        this._event(i, ev, 'door', { door, open: true });
      }
    }
    _definition(id) {
      if (own(this.items, id)) return this.items[id];
      for (const room of ROOMS_ORDER) {
        const obj = this.rooms[room].objects.find(entry => entry.id === id);
        if (obj) return obj;
      }
      return null;
    }
    _name(id) { const obj = this._definition(id); return obj ? obj.name : 'חפץ'; }

    // Resolve per-player item locations without ever modifying the shared room definitions.
    _object(p, id, held = false) {
      if (p.inventory.includes(id)) return held ? { ...this._definition(id), ...p.pos } : null;
      if (p.scale.includes(id)) return p.room === 'storage' ? { ...this._definition(id), x: 2.8, z: 2.6 } : null;
      if (own(p.itemLocations, id)) {
        const loc = p.itemLocations[id];
        return loc && loc.room === p.room ? { ...this._definition(id), ...loc } : null;
      }
      const obj = this.rooms[p.room].objects.find(entry => entry.id === id);
      return obj && (!obj.hidden || p.discovered.includes(id)) ? obj : null;
    }
    _visible(p) {
      const ids = new Set(this.rooms[p.room].objects.map(obj => obj.id));
      Object.keys(p.itemLocations).forEach(id => ids.add(id));
      return [...ids].map(id => this._object(p, id)).filter(Boolean);
    }
    _reveal(i, ev, parent) {
      const p = this.players[i];
      const names = [];
      for (const obj of this.rooms[p.room].objects.filter(entry => entry.parent === parent)) {
        if (!p.discovered.includes(obj.id)) {
          p.discovered.push(obj.id);
          this._event(i, ev, 'reveal', { obj: obj.id, x: obj.x, z: obj.z });
        }
        if (this._object(p, obj.id)) names.push(`${obj.name} (${obj.id})`);
      }
      const where = { bookshelf:'על המדפים', shelf_storage:'על המדפים', wall_niche:'על המדפים', rug:'מתחתיו', tarp:'מתחתיו', notice_board:'תלויים עליו', desk:'בשולחן ועליו', desk_vault:'עליו', sink:'על שפת הכיור', coat_rack:'תלויים עליו', cauldron:'מחובר אליה', vault_door:'על הדלת', stone_bench:'מתחתיו' };
      return names.length ? ` ${where[parent] || 'בפנים'}: ${names.join(', ')}.` : '';
    }
    _weight(id) { return id === 'sand_sack' ? 9 : (this._solution.crateWeights[id] || 0); }
    _kg(p) { return p.scale.reduce((sum, id) => sum + this._weight(id), 0); }
    _scale(i, ev) {
      const kg = this._kg(this.players[i]);
      this._event(i, ev, 'scale', { kg, items: this.players[i].scale.slice() });
      if (kg === this._solution.target) this._open(i, ev, 'gate');
      return kg;
    }
    _consume(p, id) {
      p.inventory.splice(p.inventory.indexOf(id), 1);
      p.itemLocations[id] = null;
      if (p.carrying === id) p.carrying = null;
    }
    _escape(i, ev) {
      const p = this.players[i];
      if (p.locks.keypad && p.locks.seal && !p.escaped) {
        this._open(i, ev, 'vault_door');
        p.escaped = true;
        this.finishOrder.push(i);
        p.place = this.finishOrder.length;
        this._event(i, ev, 'escape', { place: p.place });
        return ` דלת הכספת נפתחה! יצאת במקום ${p.place}.`;
      }
      return '';
    }

    act(i, raw) {
      const p = this._player(i);
      if (!p) return this._fail(i, 'מספר השחקן אינו תקין.');
      if (p.escaped) return this._fail(i, 'כבר יצאת מהחדרים וסיימת את המרוץ.');
      const cmd = command(raw);
      if (!cmd) return this._fail(i, 'הפעולה אינה תקינה. יש לציין פעולה מוכרת ואת הפרטים שלה.');
      const result = this._act(i, cmd);
      p.lastActivity = this._activity(cmd, result);
      return result;
    }

    _act(i, cmd) {
      const p = this.players[i];
      const ev = [];
      switch (cmd.op) {
        case 'look': return this._look(i);
        case 'inventory': return this._ok(p.inventory.length ? `ברשותך: ${p.inventory.map(id => `${this._name(id)} (${id})`).join(', ')}.` : 'אין ברשותך חפצים.');
        case 'inspect': return this._inspect(i, cmd.target, ev);
        case 'take': return this._take(i, cmd.target, ev);
        case 'use': return this._use(i, cmd.item, cmd.target, ev);
        case 'drop': return this._drop(i, cmd.item, ev);
        case 'go': return this._go(i, cmd.room, ev);
        case 'step': return this._step(i, cmd.row, cmd.col, ev);
        case 'enter_code': return this._code(i, cmd.code, ev);
      }
    }

    _look(i) {
      const p = this.players[i];
      let text = `${this.rooms[p.room].name}.\nכאן נמצאים: ${this._visible(p).map(obj => `${obj.name} (${obj.id})`).join(', ')}.`;
      text += `\nדלתות: ${this.rooms[p.room].doors.map(door => `${this._name(door.id)} — ${p.doors[door.id] ? 'פתוחה' : 'סגורה'}`).join(', ')}.`;
      if (p.room === 'minefield') {
        const f = p.minefield;
        text += '\nעמודות: 0 1 2 3 4 5 6\n';
        text += f.revealed.map((line, r) => `${r}: ${line.map((seen, c) => {
          if (f.row === r && f.col === c) return '@';
          if (f.exploded[r][c]) return '*';
          return seen ? String(this._number(r, c)) : '?';
        }).join(' ')}`).join('\n');
        text += '\n@ המקום שלך, ? טרם נחשף, * מוקש שכבר התפוצץ.';
      }
      return this._ok(text);
    }

    _inspect(i, id, ev) {
      const p = this.players[i];
      const obj = this._object(p, id, true);
      if (!obj) return this._fail(i, 'החפץ הזה אינו גלוי כאן.', ev);
      this._move(i, ev, obj);
      this._event(i, ev, 'inspect', { obj: id });
      let text = obj.description;
      if (id === 'recipe_book') text = `${recipeText(this._solution.fireRecipe, 'שיקוי אש', 'orange')} הדף הבא נתלש.`;
      else if (id === 'torn_page') text = recipeText(this._solution.acidRecipe, 'שיקוי חומצה', this._solution.acidColor);
      else if (id === 'note') text = 'השעה שבה נעצר השעון במעבדה, בספרות בלי נקודתיים.';
      else if (id === 'wall_clock') text = `השעון עומד על ${this._solution.clockTime}. המחוגים לא זזים.`;
      else if (id === 'grandfather_clock') text = `השעון מראה ${this._solution.decoyTime}. המטוטלת נעה והשעון מתקתק.`;
      else if (id === 'gate_sign') text = `השער ייפתח כשעל המשקל יהיו בדיוק ${this._solution.target} ק״ג.`;
      else if (own(this._solution.crateWeights, id)) text = `${obj.name}: ${this._weight(id)} ק״ג. התווית מודבקת לצד הארגז.`;
      else if (id === 'scale') text = `על המשקל ${this._kg(p)} ק״ג. ${p.scale.length ? `עליו: ${p.scale.map(item => this._name(item)).join(', ')}.` : 'המשטח ריק.'}`;
      else if (id === 'cauldron') {
        const measures = Object.keys(p.cauldron).filter(color => p.cauldron[color]).map(color => (p.cauldron[color] === 1 ? `מנה אחת ${COLORS[color]}` : `${p.cauldron[color]} מנות ${COLORS[color]}`));
        text = measures.length ? `בקדרה: ${measures.join(', ')}.` : 'הקדרה ריקה.';
      } else if (id === 'drain_valve') {
        p.cauldron = emptyMix();
        this._event(i, ev, 'drain', { obj: 'cauldron' });
        text = 'הברז מסתובב והתכולה מתנקזת. הקדרה ריקה.';
      } else if (id === 'cabinet') text += p.cabinetOpen ? this._reveal(i, ev, id) : ' הדלת נעולה.';
      else if (id === 'vault_door') text += ` מנעול הקוד ${p.locks.keypad ? 'פתוח' : 'סגור'}, החותם ${p.locks.seal ? 'הוסר' : 'במקומו'}.`;
      else if (id === 'keypad') text += p.locks.keypad ? ' המנעול פתוח.' : ' המנעול סגור.';
      else if (id === 'rust_seal' && p.locks.seal) text = 'החותם הוסר. נשאר סימן כהה על המתכת.';
      else if (p.doors[id]) text += ' הדלת פתוחה.';
      if (id !== 'cabinet' && !obj.stuck) text += this._reveal(i, ev, id);
      if (!p.read.includes(id)) p.read.push(id);
      return this._ok(text, ev);
    }

    _take(i, id, ev) {
      const p = this.players[i];
      const obj = this._object(p, id);
      if (!obj) return this._fail(i, 'החפץ הזה אינו זמין כאן ללקיחה.', ev);
      this._move(i, ev, obj);
      if (id === 'flask_rack') {
        if (p.inventory.some(item => item === 'flask' || item.startsWith('flask_'))) return this._fail(i, 'כבר יש ברשותך בקבוקון.', ev);
        if (p.itemLocations.flask) return this._fail(i, 'הבקבוקון הריק שהנחת עדיין ממתין לך.', ev);
        p.inventory.push('flask');
        p.itemLocations.flask = null;
        this._event(i, ev, 'take', { obj: 'flask', source: id });
        return this._ok('לקחת בקבוקון זכוכית ריק מהמעמד.', ev);
      }
      if (!obj.takeable) return this._fail(i, id === 'anvil' ? 'הסדן כבד מדי להרמה.' : 'אי אפשר לקחת את החפץ הזה.', ev);
      if (this._weight(id) && p.carrying) return this._fail(i, 'הידיים כבר מלאות. צריך להניח את מה שנושאים קודם.', ev);
      const onScale = p.scale.indexOf(id);
      if (onScale !== -1) p.scale.splice(onScale, 1);
      p.inventory.push(id);
      p.itemLocations[id] = null;
      if (this._weight(id)) p.carrying = id;
      this._event(i, ev, 'take', { obj: id, from: onScale === -1 ? 'room' : 'scale' });
      if (onScale !== -1) this._scale(i, ev);
      return this._ok(`לקחת את ${obj.name}.`, ev);
    }

    _use(i, item, target, ev) {
      const p = this.players[i];
      if (item === 'drain_valve' && !target) {
        const valve = this._object(p, item);
        if (!valve) return this._fail(i, 'הברז אינו נמצא כאן.', ev);
        this._move(i, ev, valve);
        p.cauldron = emptyMix();
        this._event(i, ev, 'drain', { obj: 'cauldron' });
        return this._ok('פתחת את הברז. הקדרה התרוקנה.', ev);
      }
      if (!p.inventory.includes(item)) return this._fail(i, 'צריך להחזיק את החפץ לפני שמשתמשים בו.', ev);
      const obj = target && this._object(p, target);
      if (!obj) return this._fail(i, 'צריך לבחור חפץ גלוי בחדר שעליו משתמשים במה שבידך.', ev);
      this._move(i, ev, obj);
      if (own(DYES, item) && target === 'cauldron') {
        const color = DYES[item];
        p.cauldron[color]++;
        this._event(i, ev, 'pour', { obj: target, item, color, measures: { ...p.cauldron } });
        return this._ok(`מזגת מנה אחת של ${COLORS[color]} לקדרה.`, ev);
      }
      if (item === 'flask' && target === 'cauldron') {
        const matches = recipe => !p.cauldron.black && ['red', 'yellow', 'blue'].every(color => p.cauldron[color] === recipe[color]);
        const result = matches(this._solution.fireRecipe) ? 'flask_fire' : matches(this._solution.acidRecipe) ? 'flask_acid' : 'flask_muddy';
        // One logical flask per variant: recover a dropped one before making another of that kind.
        if (p.itemLocations[result]) return this._fail(i, 'כבר מונח בחדרים בקבוקון עם נוזל כזה.', ev);
        this._consume(p, item);
        p.inventory.push(result);
        p.itemLocations[result] = null;
        p.cauldron = emptyMix();
        this._event(i, ev, 'brew', { obj: 'cauldron', result, color: this.items[result].color });
        return this._ok(`מילאת את הבקבוקון בנוזל ${COLORS[this.items[result].color]}. הקדרה התרוקנה.`, ev);
      }
      if (['flask_fire', 'flask_acid', 'flask_muddy'].includes(item) && target === 'drain_valve') {
        if (p.inventory.includes('flask') || p.itemLocations.flask) return this._fail(i, 'כבר יש בקבוקון ריק שממתין לך.', ev);
        this._consume(p, item);
        p.inventory.push('flask');
        p.itemLocations.flask = null;
        this._event(i, ev, 'pour', { obj: target, item, color: this.items[item].color });
        this._event(i, ev, 'empty', { obj: item, result: 'flask' });
        return this._ok('שפכת את הנוזל. נשאר בידך בקבוקון ריק.', ev);
      }
      if (item === 'flask_fire' && target === 'ice_door' && !p.doors.ice_door) {
        this._consume(p, item);
        this._event(i, ev, 'pour', { obj: target, item, color: 'orange' });
        this._open(i, ev, 'ice_door');
        return this._ok('הקרח נמס ונוזל על הרצפה. הדלת נפתחה; הבקבוקון התרוקן ונשבר.', ev);
      }
      if (this._weight(item) && target === 'scale') {
        this._consume(p, item);
        p.scale.push(item);
        this._event(i, ev, 'drop', { obj: item, target });
        const kg = this._scale(i, ev);
        return this._ok(`הנחת את ${this._name(item)} על המשקל. כעת עליו ${kg} ק״ג.${kg === this._solution.target ? ' השער נפתח.' : ''}`, ev);
      }
      if (item === 'brass_key' && target === 'cabinet') {
        p.cabinetOpen = true;
        this._event(i, ev, 'open', { obj: target });
        return this._ok(`הארונית נפתחה.${this._reveal(i, ev, target)}`, ev);
      }
      if (item === 'flask_acid' && target === 'rust_seal' && !p.locks.seal) {
        this._consume(p, item);
        p.locks.seal = true;
        this._event(i, ev, 'pour', { obj: target, item, color: this._solution.acidColor });
        this._event(i, ev, 'seal', { obj: target, open: true });
        return this._ok(`החותם מתפורר ונופל. מנעול החותם פתוח.${this._escape(i, ev)}`, ev);
      }
      return this._fail(i, 'ניסית להשתמש בחפץ כאן, אבל דבר לא השתנה.', ev);
    }

    _drop(i, item, ev) {
      const p = this.players[i];
      if (!p.inventory.includes(item)) return this._fail(i, 'החפץ הזה אינו ברשותך.', ev);
      this._move(i, ev, p.pos);
      this._consume(p, item);
      p.itemLocations[item] = { room: p.room, ...p.pos };
      this._event(i, ev, 'drop', { obj: item });
      return this._ok(`הנחת את ${this._name(item)} על הרצפה.`, ev);
    }

    _code(i, code, ev) {
      const p = this.players[i];
      const keypad = this._object(p, 'keypad');
      if (!keypad) return this._fail(i, 'אין כאן לוח מקשים גלוי להזנת קוד.', ev);
      this._move(i, ev, keypad);
      p.codeAttempts++;
      const ok = code === this._solution.clockCode;
      this._event(i, ev, 'code', { obj: 'keypad', ok, attempts: p.codeAttempts });
      if (!ok) return this._fail(i, 'הקוד שגוי.', ev);
      p.locks.keypad = true;
      return this._ok(`מנעול הקוד נפתח.${this._escape(i, ev)}`, ev);
    }

    _number(row, col) { return neighbors(row, col).filter(next => this._solution.mines[next.row][next.col]).length; }
    _revealTiles(i, row, col, ev) {
      const f = this.players[i].minefield;
      const queue = [{ row, col }];
      for (let head = 0; head < queue.length; head++) {
        const tile = queue[head];
        if (f.revealed[tile.row][tile.col] || this._solution.mines[tile.row][tile.col]) continue;
        f.revealed[tile.row][tile.col] = true;
        const n = this._number(tile.row, tile.col);
        this._event(i, ev, 'tile', { r: tile.row, c: tile.col, n, ...tilePos(tile.row, tile.col) });
        if (n === 0) queue.push(...neighbors(tile.row, tile.col));
      }
    }
    _revealedPath(p, end) { return pathBetween(p.minefield, end, (r, c) => p.minefield.revealed[r][c]); }
    _walk(i, path, ev) {
      const f = this.players[i].minefield;
      for (const tile of path) {
        f.row = tile.row;
        f.col = tile.col;
        this._move(i, ev, tilePos(tile.row, tile.col));
        // Opening requires physically reaching the tile, not just cascading a reveal onto it.
        if (tile.row === EXIT.row && tile.col === EXIT.col) this._open(i, ev, 'far_door');
      }
    }

    _step(i, row, col, ev) {
      const p = this.players[i];
      if (p.room !== 'minefield') return this._fail(i, 'אפשר לבחור משבצת רק בשדה המוקשים.', ev);
      const f = p.minefield;
      let path = this._revealedPath(p, { row, col });
      if (!path) {
        for (const adjacent of neighbors(row, col)) {
          path = this._revealedPath(p, adjacent);
          if (path) break;
        }
        if (!path) return this._fail(i, 'צריך לבחור משבצת ליד שטח גלוי שאפשר להגיע אליו.', ev);
        path = path.concat({ row, col });
      }
      if (this._solution.mines[row][col]) {
        this._walk(i, path, ev);
        f.exploded[row][col] = true;
        f.strikes++;
        this._event(i, ev, 'boom', { r: row, c: col, strikes: f.strikes });
        f.row = START.row;
        f.col = START.col;
        this._move(i, ev, tilePos(START.row, START.col));
        return this._fail(i, 'מוקש התפוצץ! חזרת להתחלה. המשבצות שכבר נחשפו נשארו גלויות.', ev);
      }
      this._walk(i, path, ev);
      this._event(i, ev, 'step', { r: row, c: col });
      this._revealTiles(i, row, col, ev);
      return this._ok(`הגעת למשבצת ${row}, ${col}. סביבה ${this._number(row, col)} מוקשים.`, ev);
    }

    _go(i, room, ev) {
      const p = this.players[i];
      const door = this.rooms[p.room].doors.find(entry => entry.to === room);
      if (!door || room === 'exit') return this._fail(i, 'אפשר לעבור רק לחדר סמוך דרך דלת פתוחה.', ev);
      if (p.room === 'minefield') {
        const end = room === 'storage' ? START : EXIT;
        const path = this._revealedPath(p, end);
        if (!path) return this._fail(i, 'עדיין אין דרך גלויה אל הדלת בצד הזה.', ev);
        this._walk(i, path, ev);
      }
      this._move(i, ev, door);
      if (!p.doors[door.id]) return this._fail(i, 'הדלת סגורה ואי אפשר לעבור בה.', ev);
      const from = p.room;
      p.room = room;
      if (room === 'minefield') {
        const entry = from === 'vault' ? EXIT : START;
        p.minefield.row = entry.row;
        p.minefield.col = entry.col;
        p.pos = tilePos(entry.row, entry.col);
      } else p.pos = { x: 0, z: ROOMS_ORDER.indexOf(room) > ROOMS_ORDER.indexOf(from) ? -4 : 4 };
      this._event(i, ev, 'go', { from, to: room, door: door.id });
      this._move(i, ev, p.pos);
      if (room === 'minefield') this._revealTiles(i, p.minefield.row, p.minefield.col, ev);
      return this._ok(`עברת אל ${this.rooms[room].name}.`, ev);
    }
  }

  function durationMs(cmd, result) {
    const events = result && Array.isArray(result.ev) ? result.ev : [];
    const has = type => events.some(event => event && event.t === type);
    if (has('boom') || has('escape')) return 3000;
    if (has('brew')) return 1800;
    if (has('pour')) return 1500;
    if (cmd && (cmd.op === 'go' || cmd.op === 'step')) return has('move') ? Math.min(2500, 1200 + events.filter(event => event.t === 'move').length * 100) : 600;
    if (cmd && (cmd.op === 'inspect' || cmd.op === 'enter_code')) return 1200;
    if (has('move')) return 1200;
    return result && result.ok ? 400 : 600;
  }

  return { Game, durationMs, ROOMS_ORDER, mulberry32, tilePos };
}));
