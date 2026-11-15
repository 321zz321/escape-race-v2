/* Seeded, observation-driven demo contestants. Load engine.js before this file. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'));
  else root.EscapeMock = factory(root.EscapeEngine);
}(typeof window !== 'undefined' ? window : globalThis, function (Engine) {
  'use strict';

  const PERSONALITIES = Object.freeze([
    { id: 'careful', name: 'זהירון', color: '#5ba8ff' },
    { id: 'fast', name: 'בזק', color: '#ffbd45' },
    { id: 'chatty', name: 'פטפטן', color: '#bf8bfa' },
    { id: 'chaotic', name: 'כאוס', color: '#ff6c83' }
  ].map(Object.freeze));
  const PROFILES = {
    careful: { think: [1450, 2150], explore: [5, 4, 2, 3], skipKey: 0.05, skipClock: 0.08, brew: 0.06, scale: 0.08, decoy: 0.10, risk: 0.08 },
    fast: { think: [1075, 1725], explore: [1, 1, 1, 1], skipKey: 0.80, skipClock: 0.80, brew: 0.80, scale: 0.95, decoy: 0.75, risk: 0.90 },
    chatty: { think: [1325, 2050], explore: [3, 3, 2, 3], skipKey: 0.25, skipClock: 0.30, brew: 0.25, scale: 0.30, decoy: 0.45, risk: 0.30 },
    chaotic: { think: [1150, 1725], explore: [3, 2, 2, 2], skipKey: 0.65, skipClock: 0.60, brew: 0.75, scale: 0.80, decoy: 0.85, risk: 0.90 }
  };
  const DISTRACTORS = {
    lab: ['painting', 'calendar', 'barometer', 'old_map', 'chest_lab', 'rug', 'sink'],
    storage: ['barrel', 'anvil', 'toolbox', 'mirror', 'poster', 'shelf_storage', 'cardboard_boxes', 'wheelbarrow'],
    minefield: ['armor', 'banner', 'bones', 'torch_holder', 'cracked_shield', 'stone_bench', 'wall_niche'],
    vault: ['small_safe', 'portrait', 'chest', 'telescope', 'gold_pile', 'desk_vault', 'coat_rack', 'umbrella_stand']
  };
  const JUNK = new Set(['olive_oil', 'perfume', 'vinegar', 'glitter', 'apron', 'gloves', 'broom', 'stool',
    'cookbook', 'star_atlas', 'poetry_book', 'dictionary', 'diary_old', 'empty_folder', 'skull', 'cat_statue',
    'pencils', 'eraser', 'ink_pen', 'old_receipt', 'globe', 'candles', 'old_clothes', 'broken_spectacles',
    'trapdoor', 'herb_basket', 'paint_cans', 'rope', 'lantern', 'magnifier', 'hammer', 'nails', 'screwdriver',
    'empty_jars', 'newspapers', 'helmet', 'armor_lining', 'tooth', 'spent_torch', 'leather_straps', 'satchel',
    'cloth_scraps', 'buttons', 'pottery_shards', 'clay_bowl', 'smooth_stones', 'old_notice', 'wanted_poster',
    'menu', 'bank_hours', 'ledger', 'stamp', 'papers_pile', 'gold_coin', 'velvet_pouch', 'dusty_coat', 'bent_umbrella']);
  const COLORS = { red: 'אדום', yellow: 'צהוב', blue: 'כחול' };
  // Complete sentences avoid trying to inflect engine display labels in Hebrew.
  // Object-specific lines rotate with a personality line for the object's kind.
  const INSPECTIONS = {
    ice_door: ['אבדוק כמה קרח מכסה את הדלת.', 'אולי אפשר לפתוח את דלת הקרח בלי לשבור אותה?'],
    bookshelf: ['אעבור על הספרים שבכוננית.', 'מעניין מה בחרו לשים על המדף האמצעי.'],
    recipe_book: ['אפתח את הספר הכתוב ביד.', 'הכתב בספר הזה צפוף. אקרא כמה שורות.'],
    star_atlas: ['אדפדף באטלס הכוכבים, אולי אחת המפות תעזור.', 'אולי סימנו משהו בין קבוצות הכוכבים?'],
    poetry_book: ['אקרא כמה שורות מספר השירים.', 'נראה מה כתוב בשיר שבאמצע הספר.'],
    desk: ['אבדוק אם השאירו משהו על שולחן הכתיבה.', 'אולי יש מגירה בשולחן הזה?'],
    desk_drawer: ['אפתח את מגירת השולחן ואראה מה יש בתוכה.', 'המגירה הזאת עוד סגורה. בואו נציץ פנימה.'],
    wall_clock: ['אבדוק מה השעה בשעון שעל הקיר.', 'מעניין אם מחוגי השעון בכלל זזים.'],
    painting: ['אחפש בציור פרט שלא שייך לנוף.', 'אולי ציירו משהו קטן בין העצים?'],
    globe: ['אבדוק אם סימנו מקום כלשהו על הגלובוס.', 'מעניין אילו ארצות מצוירות כאן.'],
    skull: ['אסתכל מקרוב על הגולגולת. אולי חרוט עליה משהו.', 'למה שמו כאן גולגולת? אבדוק אם יש לה תפקיד.'],
    candles: ['אספור את הנרות ואבדוק איך הם מסודרים.', 'אולי נשאר סימן בשעווה של הנרות?'],
    cat_statue: ['אבדוק את הבסיס של פסל החתול.', 'החתול הזה שומר על משהו? בואו נסתכל.'],
    rug: ['אבדוק את שולי השטיח.', 'אולי הדוגמה שעל השטיח אומרת משהו?'],
    glitter: ['אבדוק מה יש בצנצנת הנצנצים.', 'כל הנצנצים האלה נועדו להסיח את דעתי? רק הצצה.'],
    empty_bottle: ['אנסה לקרוא את התווית שעל הבקבוק הריק.', 'אולי נשאר משהו בתחתית הבקבוק?'],
    gate_sign: ['אקרא את השלט שליד השער.', 'לפני שסוחבים ארגזים, נראה מה השלט מבקש.'],
    scale: ['אבדוק איזה מספר מופיע על המשקל.', 'נראה אם המשקל הגיע לסכום שצריך.'],
    sand_sack: ['אבדוק כמה שוקל שק החול.', 'יש תווית על השק. נראה מה כתוב בה.'],
    barrel: ['אבדוק אם החבית מכילה משהו.', 'אולי החביאו משהו מתחת למכסה החבית?'],
    anvil: ['אחפש סימון על הסדן.', 'הסדן הזה בטח כבד. מעניין אם הוא שימושי כאן.'],
    toolbox: ['אפתח את ארגז הכלים.', 'נרים את המכסה ונראה אילו כלים נשארו פה.'],
    mirror: ['אבדוק אם יש כתובת על המראה.', 'אולי רואים במראה משהו שפספסתי בחדר?'],
    poster: ['אסתכל מקרוב על הכרזה.', 'אולי האיור בכרזה קשור לארגזים?'],
    shelf: ['אעבור על מה שמונח במדף העץ.', 'אולי בין כלי החרס נשאר משהו שימושי?'],
    warning_sign: ['אקרא את ההוראות לפני הצעד הראשון.', 'מה בדיוק אומרים המספרים על הלוח? השלט אמור להסביר.'],
    armor: ['אבדוק אם יש משהו בתוך השריון.', 'מעניין אם השריון הזה יכול לעזור, או שהוא רק קישוט.'],
    banner: ['אסתכל על הרקמה שבשולי הדגל.', 'אולי הדוגמה שעל הדגל היא סימן?'],
    bones: ['אבדוק איך העצמות מסודרות.', 'העצמות האלה לא מעודדות אותי. אסתכל מקרוב.'],
    vault_door: ['אבדוק מה מחזיק את דלת הכספת סגורה.', 'הגענו לכספת. נראה מה צריך כדי לפתוח אותה.'],
    grandfather_clock: ['אבדוק איזו שעה מראה השעון העומד.', 'שעון ממש ליד הכספת? אולי יש קשר.'],
    cabinet: ['אבדוק אם הארונית נעולה.', 'אולי יש בארונית משהו שיעזור לפתוח את הכספת?'],
    note: ['אפתח את הפתק המקופל ואקרא אותו.', 'מישהו השאיר לנו פתק. נראה מה הוא רצה לומר.'],
    notice_board: ['אעבור על הניירות שבלוח המודעות.', 'יש הרבה ניירות על הלוח. אקרא אותם מקרוב.'],
    torn_page: ['אקרא את הדף התלוש, כולל השורות הקטנות.', 'מעניין מאיזה ספר הדף הזה נתלש.'],
    small_safe: ['אציץ לתוך הכספת הקטנה.', 'אולי השאירו משהו בכספת הצדדית?'],
    portrait: ['אחפש פרט מעניין בדיוקן.', 'מעניין מי האיש בציור ומה הוא עושה כאן.'],
    chest: ['אבדוק מה יש בתיבת העץ.', 'אולי התיבה הזאת מחזיקה משהו שימושי?'],
    telescope: ['אבדוק לאן הטלסקופ מכוון.', 'אפשר לראות מכאן משהו דרך הטלסקופ?'],
    gold_pile: ['אבדוק אם יש סימנים על מטבעות הזהב.', 'כל הזהב הזה מפתה. נראה מה יש בערמה.']
  };
  // Columns follow PERSONALITIES. These describe an action appropriate to a kind,
  // without attaching the same sentence to unrelated names or guessing gender.
  const KIND_INSPECTIONS = {
    book: ['צריך לקרוא גם את האותיות הקטנות.', 'נדפדף מהר. יש כאן הוראות?', 'מי שמשאיר פה ספר בטח רוצה שנקרא משהו. בואו נראה.', 'פותחים באמצע! אולי ניפול על העמוד הנכון!'],
    clock: ['ארשום את השעה, ליתר ביטחון.', 'רגע, מה השעה פה?', 'גם לשעון מגיע רגע של תשומת לב. מה הוא מראה?', 'שעון! אולי הספרות שלו פותחות משהו!'],
    sign: ['כדאי לקרוא את ההוראות עד הסוף.', 'מה כתוב פה? מהר.', 'טוב, נתנו לנו הוראות. הפעם באמת נקרא אותן.', 'יש שלט! אולי סוף סוף יגידו לנו מה לעשות!'],
    crate: ['אקרא את תווית המשקל של ארגז {n}.', 'ארגז {n}, כמה קילו?', 'נראה מה כתוב על ארגז {n}, הגב שלי ישמח לדעת מראש.', 'מה המשקל של ארגז {n}? בואו נראה!'],
    bottle: ['אבדוק את התכולה לפני שאחליט אם היא שימושית.', 'מה יש בפנים?', 'זה נראה כמו משהו שצריך לבדוק לפני שמוזגים לקדרה.', 'רגע, מה שמו פה בפנים?!'],
    door: ['אבדוק היטב את הידית ואת המסגרת.', 'מה עוצר את הדלת הזאת?', 'יש לנו דלת ויש לנו סבלנות. טוב, קצת סבלנות.', 'נו, איפה הדבר שפותח את הדלת?!']
  };
  const CRATE_INSPECTIONS = ['אבדוק כמה שוקל ארגז {n}.', 'נראה מה כתוב על התווית של ארגז {n}.'];
  const TAKES = {
    brass_key: ['אקח את מפתח הפליז ואשמור אותו להמשך.', 'לוקח את המפתח.', 'מפתח קטן, הבטחה גדולה. ניקח אותו איתנו.', 'מפתח! לכיס!'],
    flask_rack: ['אקח בקבוקון ריק מהמעמד.', 'צריך בקבוקון. לוקח אחד.', 'נבחר בקבוקון מהמעמד, עוד מעט יהיה מה למלא בו.', 'בקבוקון אחד אליי!'],
    dye: ['אקח את בקבוק הצבע ה{color}.', 'לוקח את הצבע ה{color}.', 'נצרף את בקבוק הצבע ה{color} לציוד הבישול שלנו.', 'צבע {color}! לוקחים!'],
    ink_black: ['אקח את בקבוק הדיו השחור.', 'לוקח את הדיו.', 'גם בקבוק הדיו בא איתנו. מקווה שלא אתחרט על זה.', 'דיו שחור! יש לי רעיון!'],
    sand_sack: ['ארים את שק החול בזהירות.', 'לוקח את השק.', 'שק החול מצטרף אלינו. הגב שלי פחות מתלהב.', 'מרימים את השק!'],
    crate: ['ארים את ארגז {n} בזהירות.', 'לוקח את ארגז {n}.', 'ארגז {n}, נעשה לך סיבוב קצר במחסן.', 'מרימים את ארגז {n}!']
  };
  const TAKE_VARIANTS = {
    crate: ['אתפוס את ארגז {n} משני הצדדים.', 'ניקח עכשיו את ארגז {n}.'],
    dye: ['צריך גם צבע {color}. אקח את הבקבוק.', 'אקח את הבקבוק עם הצבע ה{color}.'],
    flask_rack: ['צריך כלי לשיקוי. אקח בקבוקון.', 'אשלוף בקבוקון ריק מהמעמד.'],
    sand_sack: ['אקח את שק החול בשתי ידיים.', 'צריך להזיז את השק הזה.']
  };
  const MAX_STEPS = 320;
  const ROOMS = Engine.ROOMS_ORDER;
  const key = (r, c) => r * 7 + c;
  const tile = id => ({ row: Math.floor(id / 7), col: id % 7 });
  const adjacent = id => {
    const { row, col } = tile(id);
    const result = [];
    for (let r = Math.max(0, row - 1); r <= Math.min(8, row + 1); r++) {
      for (let c = Math.max(0, col - 1); c <= Math.min(6, col + 1); c++) {
        if (r !== row || c !== col) result.push(key(r, c));
      }
    }
    return result;
  };

  // Each bank rotates without immediate repetition. Values are spoken BEFORE the action.
  const SPEECH = {
    careful: {
      look: ['קודם אסתכל סביב ואבחר מאיפה להתחיל.', 'חדר חדש, נבדוק מה יש כאן.'],
      pour: ['{color}, מנה {n} מתוך {total}, לפי המתכון.', 'אמזוג בזהירות: מנה {n} מתוך {total} של {color}.'],
      fill: ['הכמויות בפנים, אמלא את הבקבוקון.', 'עכשיו נבדוק איזה נוזל התקבל.'],
      go: ['אעבור אל {name} ואמשיך משם.', 'הדרך אל {name} פתוחה, אפשר להתקדם.'],
      guess: ['אין כאן הוכחה מלאה, אנסה בזהירות את {pos}.', 'נשארה אי־ודאות ליד {pos}, נצטרך לנסות.'],
      safe: ['{reason}, לכן {pos} בטוחה.', '{pos} בטוחה לפי המספרים, אצעד לשם.'],
      boom: ['אוי! מוקש, אצטרך לבדוק שוב את המספרים.', 'ההערכה שלי הייתה שגויה, אסמן את המוקש הזה.'],
      muddy: ['יצא חום, כנראה טעיתי בכמות, ארוקן ואמדוד מחדש.', 'זו לא התוצאה שבמתכון, צריך להתחיל מחדש.'],
      wrongCode: ['הקוד נדחה, צריך לבדוק לאיזה שעון התכוונו.', 'השעה הזאת לא פתחה את המנעול, אבדוק עוד.']
    },
    fast: {
      look: ['מה יש פה, מהר.', 'מה עוד לא בדקתי כאן.'],
      pour: ['{color}, מנה {n} מתוך {total}.', 'עוד {color}, {n} מתוך {total}, קדימה.'],
      fill: ['נמלא ונמשיך.', 'יאללה, לבקבוקון.'],
      go: ['קדימה אל {name}.', 'זזים אל {name}.'],
      guess: ['לא בטוח, מנסה את {pos}.', '{pos} נראית אפשרית, הולך על זה.'],
      safe: ['{pos} בטוחה לפי המספרים, זזים.', '{reason}, קדימה אל {pos}.'],
      boom: ['אוי! מוקש, איזה בזבוז זמן.', 'בום, טוב, לפחות עכשיו יודעים.'],
      muddy: ['חום? פספסתי, מרוקנים ומנסים שוב.', 'זה בוץ, צריך לספור מחדש.'],
      wrongCode: ['לא הקוד, צריך שעון אחר.', 'לא עובד, מה פספסתי.']
    },
    chatty: {
      look: ['בואו נראה מה הכינו לנו פה הפעם.', 'טוב חברים, סיבוב היכרות קצר עם החדר.'],
      pour: ['מנה {n} מתוך {total} של {color}, כמו בתוכנית בישול.', '{color}, {n} מתוך {total}, הפעם אני סופר בקול.'],
      fill: ['רגע האמת, מה ייצא בבקבוקון שלנו?', 'נעביר לבקבוקון, נקווה שזה לא מרק.'],
      go: ['הסיור ממשיך אל {name}, כולם איתי?', 'נלך אל {name}, יש לנו עוד מה לגלות.'],
      guess: ['אין לי תשובה ודאית לגבי {pos}, תחזיקו אצבעות.', 'המספרים לא מספיקים, ננסה את {pos} ונקווה לטוב.'],
      safe: ['{reason}, אז אפשר לנשום ולצעוד אל {pos}.', '{pos} בטוחה לפי המספרים, סוף סוף חדשות טובות.'],
      boom: ['אוי! מוקש, הלב שלי עוד במשבצת הקודמת.', 'טוב, זה היה שיעור רועש במיוחד בחשבון.'],
      muddy: ['יצא בוץ, אפילו אני לא הייתי מגיש את זה לאורחים.', 'המתכון ביקש שיקוי ואני הכנתי שלולית, ננסה שוב.'],
      wrongCode: ['הכספת לא התרשמה, כנראה בחרתי בשעון הלא נכון.', 'טוב, בתור סיסמה זה לא הצליח, נמשיך לבדוק.']
    },
    chaotic: {
      look: ['יאללה, מה אפשר לנסות פה!', 'חדר חדש, בואו נזיז דברים!'],
      pour: ['{color}! מנה {n} מתוך {total}!', 'עוד מנה של {color}, {n} מתוך {total}!'],
      fill: ['לבקבוקון! נראה מה יצא!', 'ממלאים! יש לי הרגשה טובה!'],
      go: ['הלאה אל {name}!', 'רצים אל {name}!'],
      guess: ['אין הוכחה, אבל {pos} קוראת לי!', 'קופץ אל {pos}! נקווה שאין שם הפתעה!'],
      safe: ['{pos} בטוחה לפי המספרים! קדימה!', '{reason}, אז אל {pos}!'],
      boom: ['אוי! מוקש! טוב, לשם כבר לא אחזור!', 'בום! אולי הפעם כדאי לספור לפני שקופצים!'],
      muddy: ['מה זה החום הזה! שופכים ומתחילים מחדש!', 'הניסוי הסתבך! טוב, נחזור למתכון!'],
      wrongCode: ['לא עובד! יש פה עוד שעון?!', 'הקוד שגוי! צריך רעיון אחר!']
    }
  };

  class MockBot {
    constructor(game, playerIndex, personality = 'careful', seed = game.seed) {
      if (!game || !game.players || !game.players[playerIndex] || !Number.isInteger(playerIndex)) throw new RangeError('Invalid bot player index');
      if (!Object.prototype.hasOwnProperty.call(PROFILES, personality)) throw new RangeError('Unknown bot personality');
      this.game = game;
      this.playerIndex = playerIndex;
      this.personality = personality;
      this.profile = PROFILES[personality];
      this.rng = Engine.mulberry32(`${seed}:${playerIndex}:${personality}:actions`);
      this.speechRng = Engine.mulberry32(`${seed}:${playerIndex}:${personality}:speech`);
      const luckRng = Engine.mulberry32(`${seed}:${playerIndex}:${personality}:luck`);
      // A good or bad run affects decisions, not a preassigned winner or delay.
      // Shared form correlates the luck factors; each also has its own variation.
      const form = luckRng();
      this.luck = {
        mistakes: 0.1 + 1.8 * (0.8 * form + 0.2 * luckRng()),
        exploration: 0.35 + 1.3 * (0.8 * form + 0.2 * luckRng()),
        guesses: 0.1 + 1.8 * (0.8 * form + 0.2 * luckRng())
      };
      // Timing has its own stream: asking for a delay cannot change the decisions.
      this.timingRng = Engine.mulberry32(`${seed}:${playerIndex}:${personality}:timing`);
      this.tempo = this.timingRng();
      this.knowledge = { read: new Set(), seen: new Set(), recipes: {}, weights: {},
        target: null, clock: null, decoy: null, tiles: new Map(), mines: new Set(), safe: new Map() };
      this.skipKey = this._mistake('skipKey');
      this.skipClock = this._mistake('skipClock');
      this.tryDecoy = this._mistake('decoy');
      this.queue = [];
      this.stage = 'lab_intro';
      this.pending = null;
      this.steps = 0;
      this.strikes = 0;
      this.attempts = { fire: 0, acid: 0 };
      this.speechIndex = {};
      this.reaction = null;
    }

    get player() { return this.game.players[this.playerIndex]; }

    _mistake(kind) { return this.rng() < Math.min(0.98, this.profile[kind] * this.luck.mistakes); }

    thinkingMs() {
      const [min, max] = this.profile.think;
      // Extra inspections are already pauses. Usually read briskly, with an
      // occasional longer reflection, always within the personality's range.
      let fraction = 0.8 * this.tempo + 0.2 * this.timingRng();
      const reflection = this.timingRng() < 0.1;
      if (!reflection && this.personality === 'careful') fraction *= 0.15;
      if (!reflection && this.personality === 'chatty') fraction *= 0.55;
      return Math.round(min + (max - min) * fraction);
    }

    _say(kind, values = {}) {
      return this._phrase(kind, SPEECH[this.personality][kind], values);
    }

    _phrase(kind, bank, values = {}) {
      if (!(kind in this.speechIndex)) this.speechIndex[kind] = Math.floor(this.speechRng() * bank.length);
      const phrase = bank[this.speechIndex[kind]++ % bank.length];
      return phrase.replace(/\{(\w+)\}/g, (_, name) => values[name]);
    }

    _voice(careful, fast, chatty, chaotic) {
      return { careful, fast, chatty, chaotic }[this.personality];
    }

    _shuffle(items) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    _object(id) {
      for (const room of Object.values(this.game.rooms)) {
        const obj = room.objects.find(entry => entry.id === id);
        if (obj) return obj;
      }
    }

    _name(id) { return this._object(id)?.name || this.game.items[id]?.name || id; }

    _add(cmd, thought) { this.queue.push({ cmd, thought }); }
    _inspect(target, thought) {
      if (!thought) {
        const kind = this._object(target).kind;
        const bank = [...(kind === 'crate' ? CRATE_INSPECTIONS : INSPECTIONS[target] || [
          `אבדוק מקרוב את ${this._name(target)}.`, `ניגש אל ${this._name(target)} ונראה מה יש שם.`])];
        if (KIND_INSPECTIONS[kind]) bank.push(this._voice(...KIND_INSPECTIONS[kind]));
        thought = this._phrase(`inspect:${kind === 'crate' ? kind : target}`, bank, { n: target.split('_')[1] });
      }
      this._add({ op: 'inspect', target }, thought);
    }
    _take(target) {
      const type = target.startsWith('crate_') ? 'crate' : target.startsWith('dye_') ? 'dye' : target;
      const suffix = target.split('_')[1];
      const bank = [this._voice(...TAKES[type]), ...(TAKE_VARIANTS[type] || [])];
      this._add({ op: 'take', target }, this._phrase(`take:${type}`, bank, { n: suffix, color: COLORS[suffix] }));
    }
    _go(room, thought) { this._add({ op: 'go', room }, thought || this._say('go', { name: this.game.rooms[room].name })); }
    _look() { this._add({ op: 'look' }, this._say('look')); }

    _explore(room) {
      // Even a focused run checks one prop per room; curiosity varies by race.
      const n = Math.max(1, Math.round(this.profile.explore[ROOMS.indexOf(room)] * this.luck.exploration + this.rng() - 0.5));
      for (const id of this._shuffle(DISTRACTORS[room]).slice(0, n)) this._inspect(id);
    }

    _key(returning = false) {
      this._inspect('desk', returning ? 'קודם דילגתי על השולחן. הפעם אבדוק גם את המגירה.' : undefined);
      this._inspect('desk_drawer');
      this._take('brass_key');
    }

    // next() proposes only. The caller must act(), then observe(), before asking again.
    // Repeated next() before observe() is idempotent (useful for a viewer preview).
    next() {
      if (this.pending) return { cmd: { ...this.pending.cmd }, thought: this.pending.thought };
      if (this.player.escaped) return null;
      if (this.steps >= MAX_STEPS) throw new Error(`MockBot step cap (${MAX_STEPS}) reached: player ${this.playerIndex}, ${this.stage}`);
      for (let transitions = 0; !this.queue.length; transitions++) {
        if (transitions >= 20) throw new Error(`MockBot stalled in ${this.stage}`);
        this._plan();
      }
      const proposal = this.queue.shift();
      // Do not let even a future script edit inspect an unrevealed child object.
      if (['inspect', 'take'].includes(proposal.cmd.op) && !this.knowledge.seen.has(proposal.cmd.target)) {
        throw new Error(`Bot has not seen ${proposal.cmd.target}`);
      }
      if (this.reaction) {
        proposal.thought = this.reaction;
        this.reaction = null;
      }
      this.pending = proposal;
      this.steps++;
      return { cmd: { ...proposal.cmd }, thought: proposal.thought };
    }

    observe(result) {
      if (!this.pending) throw new Error('Call next() before observe()');
      if (!result || typeof result.ok !== 'boolean' || typeof result.text !== 'string' || !Array.isArray(result.ev)) throw new TypeError('Expected a game.act result');
      const { cmd } = this.pending;
      const k = this.knowledge;
      if (result.ok && cmd.op === 'look') {
        for (const match of result.text.matchAll(/\(([a-z][a-z0-9_]*)\)/g)) k.seen.add(match[1]);
      }
      for (const ev of result.ev) {
        if (ev.p !== this.playerIndex) continue;
        if (ev.t === 'reveal') k.seen.add(ev.obj);
        if (ev.t === 'tile') k.tiles.set(key(ev.r, ev.c), ev.n);
        if (ev.t === 'boom') {
          k.mines.add(key(ev.r, ev.c));
          this.strikes = ev.strikes;
          this.reaction = this._say('boom');
        }
        if (ev.t === 'brew' && ev.result === 'flask_muddy') this.reaction = this._say('muddy');
        if (ev.t === 'code' && !ev.ok) this.reaction = this._say('wrongCode');
      }
      if (result.ok && cmd.op === 'inspect') {
        k.read.add(cmd.target);
        const text = result.text;
        if (cmd.target === 'recipe_book' || cmd.target === 'torn_page') {
          const recipe = { red: 0, yellow: 0, blue: 0 };
          for (const [color, hebrew] of Object.entries(COLORS)) {
            const match = text.match(new RegExp(`(מנה אחת|\\d+ מנות) ${hebrew}`));
            if (match) recipe[color] = match[1] === 'מנה אחת' ? 1 : Number.parseInt(match[1], 10);
          }
          if (Object.values(recipe).filter(Boolean).length !== 2) throw new Error('Unrecognized recipe text');
          k.recipes[cmd.target === 'recipe_book' ? 'fire' : 'acid'] = recipe;
        }
        if (/^crate_\d$/.test(cmd.target)) k.weights[cmd.target] = Number(text.match(/: (\d+) ק/)[1]);
        if (cmd.target === 'gate_sign') k.target = Number(text.match(/בדיוק (\d+)/)[1]);
        if (cmd.target === 'wall_clock' || cmd.target === 'grandfather_clock') {
          const time = text.match(/\d{1,2}:\d{2}/)[0];
          k[cmd.target === 'wall_clock' ? 'clock' : 'decoy'] = time;
        }
        // Browse a newly opened container before resuming the route. Children come
        // only from reveal events, never from unseen room metadata. Some are nested.
        const junk = result.ev.filter(ev => ev.t === 'reveal' && JUNK.has(ev.obj)).map(ev => ev.obj);
        if (junk.length) {
          const selected = this._shuffle(junk).slice(0, this.personality === 'careful' && this.rng() < 0.35 ? 2 : 1);
          const rest = this.queue;
          this.queue = [];
          for (const id of selected) this._inspect(id);
          this.queue.push(...rest);
        } else if (JUNK.has(cmd.target) && !this.reaction) {
          this.reaction = this._voice(
            `${text.split('.')[0]}. ארשום מה ראיתי ואמשיך.`,
            `${text.split('.')[0]}. ממשיכים.`,
            `${text.split('.')[0]}. מישהו ממש אהב לאגור פה דברים.`,
            `${text.split('.')[0]}. טוב, מה עוד יש פה?`);
        }
      }
      this.pending = null;
      // Mistakes are expected only for uncertain mine guesses and the decoy code.
      // An illegal script action is a programming error, never a silent infinite retry.
      if (!result.ok && !result.ev.some(ev => ev.t === 'boom' || ev.t === 'code')) {
        throw new Error(`Unexpected bot action failure (${JSON.stringify(cmd)}): ${result.text}`);
      }
    }

    _brew(type) {
      const recipe = this.knowledge.recipes[type];
      if (!recipe) throw new Error(`Cannot brew ${type} before reading its recipe`);
      if (this.player.inventory.includes('flask_muddy')) {
        this._add({ op: 'use', item: 'flask_muddy', target: 'drain_valve' }, this._voice(
          'ארוקן את הבקבוקון ואכין שוב לפי הכמויות שרשמתי.', 'מרוקן, מתחיל מחדש.', 'נפרדים מהבוץ, הפעם נצמד למתכון.', 'החוצה בוץ! מתחילים מחדש!'));
        return;
      }
      const mistake = this.attempts[type]++ === 0 && this._mistake('brew') && this.steps < 180;
      if (!this.player.inventory.includes('flask')) this._take('flask_rack');
      for (const color of this._shuffle(Object.keys(recipe).filter(color => recipe[color]))) {
        const item = `dye_${color}`;
        if (!this.player.inventory.includes(item)) this._take(item);
        for (let n = 1; n <= recipe[color]; n++) {
          this._add({ op: 'use', item, target: 'cauldron' }, this._say('pour', { color: COLORS[color], n, total: recipe[color] }));
        }
      }
      if (mistake) {
        const item = this.rng() < 0.5 ? 'ink_black' : `dye_${Object.keys(recipe).find(color => !recipe[color])}`;
        if (!this.player.inventory.includes(item)) this._take(item);
        this._add({ op: 'use', item, target: 'cauldron' }, this._voice(
          'אולי צריך גם מעט מהבקבוק הזה, אנסה מנה אחת.', 'עוד קצת מזה, ננסה.', 'אולי תוספת קטנה תשפר את השיקוי שלנו?', 'עוד צבע! מה כבר יכול להשתבש!'));
      }
      this._add({ op: 'use', item: 'flask', target: 'cauldron' }, this._say('fill'));
    }

    _triples() {
      const ids = Object.keys(this.knowledge.weights);
      const triples = [];
      for (let a = 0; a < ids.length - 2; a++) for (let b = a + 1; b < ids.length - 1; b++) for (let c = b + 1; c < ids.length; c++) triples.push([ids[a], ids[b], ids[c]]);
      return triples;
    }
    _sum(ids) { return ids.reduce((sum, id) => sum + this.knowledge.weights[id], 0); }
    _placeCrate(id, thought) {
      this._take(id);
      this._add({ op: 'use', item: id, target: 'scale' }, thought || this._voice(
        `אניח את ${this._name(id)} על המשקל ואבדוק את התוצאה.`, `${this._name(id)}, למשקל.`,
        `${this._name(id)} עולה למשקל, מקווה שהוא לא נעלב.`, `${this._name(id)} על המשקל!`));
    }

    _weigh() {
      if (this.player.doors.gate) {
        this._go('minefield');
        this.stage = 'mine_intro';
        return;
      }
      if (!this.scaleTried) {
        this.scaleTried = true;
        if (this._mistake('scale')) {
          if (this.rng() < 0.5) {
            this._inspect('sand_sack');
            this._placeCrate('sand_sack', this._voice('אנסה קודם את שק החול.', 'שק חול, אולי יספיק.', 'יש פה שק חול, בואו ניתן לו תפקיד.', 'שק חול! בטח כבד מספיק!'));
          } else {
            // Avoid accidentally opening the permanent gate at a partial sum.
            const wrong = this._shuffle(this._triples().filter(ids =>
              this._sum(ids) !== this.knowledge.target && this._sum(ids.slice(0, 2)) !== this.knowledge.target))[0];
            for (const id of wrong) this._placeCrate(id);
          }
          this._inspect('scale', this._voice('אבדוק אם הניסיון הזה הגיע למשקל המבוקש.', 'כמה יצא?', 'בואו נראה מה המשקל חושב על הבחירה שלי.', 'נו, הגענו למספר?!'));
          return;
        }
      }
      const correct = this._triples().find(ids => this._sum(ids) === this.knowledge.target);
      if (!correct) throw new Error('No combination in observed crate labels');
      for (const id of this.player.scale.filter(id => !correct.includes(id))) {
        this._take(id);
        this._add({ op: 'drop', item: id }, this._voice('החפץ הזה לא מתאים לסכום, אניח אותו בצד.', 'זה לא מתאים, הצידה.', 'נפנה קצת מקום, החשבון שלי מבקש תיקון.', 'מורידים! ננסה חשבון הפעם!'));
      }
      const equation = `${correct.map(id => this.knowledge.weights[id]).join(' + ')} = ${this.knowledge.target}`;
      for (const id of correct.filter(id => !this.player.scale.includes(id))) this._placeCrate(id);
      if (this.queue.length) this.queue[0].thought = this._voice(
        `חיברתי את המשקלים שעל התוויות: ${equation}, אנסה את הצירוף הזה.`,
        `${equation}, זה הצירוף שצריך.`, `הנה חשבון שסוף סוף מסתדר: ${equation}, בואו ננסה.`, `${equation}! מצאתי צירוף שמתאים!`);
    }

    // Basic Minesweeper constraints plus subset subtraction, using observed numbers ONLY.
    // Each iteration proves at least one new safe tile or mine, so closure is bounded.
    _deduce() {
      const k = this.knowledge;
      let changed = true;
      while (changed) {
        changed = false;
        const constraints = [];
        const learn = (cells, count, reason) => {
          if (count !== 0 && count !== cells.length) return;
          for (const id of cells) {
            if (count === 0 && !k.safe.has(id)) { k.safe.set(id, reason); changed = true; }
            else if (count > 0 && !k.mines.has(id)) { k.mines.add(id); changed = true; }
          }
        };
        for (const [id, n] of k.tiles) {
          const neighbors = adjacent(id);
          const cells = neighbors.filter(next => !k.tiles.has(next) && !k.mines.has(next) && !k.safe.has(next));
          const count = n - neighbors.filter(next => k.mines.has(next)).length;
          if (cells.length) constraints.push({ cells, count });
        }
        for (const { cells, count } of constraints) learn(cells, count, 'כל המוקשים ליד המספר כבר זוהו');
        if (changed) continue;
        for (const a of constraints) for (const b of constraints) {
          if (a.cells.length < b.cells.length && a.cells.every(id => b.cells.includes(id))) {
            learn(b.cells.filter(id => !a.cells.includes(id)), b.count - a.count, 'השוואה בין שני מספרים שוללת כאן מוקש');
          }
        }
      }
    }

    _mine() {
      const k = this.knowledge;
      if (k.tiles.has(key(8, 3))) {
        // go() auto-walks through revealed tiles and opens the far door at the exit.
        this._go('vault', this._voice('יש דרך גלויה עד הדלת, אלך רק עליה.', 'היציאה גלויה, זזים.', 'מצאנו שביל עד הסוף, אפשר לנשום שוב.', 'יש דרך החוצה! רצים על המשבצות הגלויות!'));
        this.stage = 'vault_intro';
        return;
      }
      this._deduce();
      const frontier = [...new Set([...k.tiles.keys()].flatMap(adjacent))].filter(id => !k.tiles.has(id) && !k.mines.has(id));
      let candidates = frontier.filter(id => k.safe.has(id));
      const proven = candidates.length > 0;
      if (!proven) {
        candidates = frontier;
        // The one permitted peek: bias an uncertain guess toward safety. Never turn
        // this into knowledge, a claimed deduction, or a jump beyond the frontier.
        if (this.strikes >= 4 || this.steps >= 180 || this.rng() >= this.profile.risk * this.luck.guesses) {
          const mines = this.game.solution().mines;
          candidates = candidates.filter(id => { const { row, col } = tile(id); return !mines[row][col]; });
        }
      }
      if (!candidates.length) throw new Error('No reachable minefield frontier');
      const scores = candidates.map(id => {
        const { row, col } = tile(id);
        let risk = 0;
        if (!proven) for (const neighbor of adjacent(id)) {
          if (!k.tiles.has(neighbor)) continue;
          const around = adjacent(neighbor);
          const unknown = around.filter(n => !k.tiles.has(n) && !k.mines.has(n));
          const remaining = k.tiles.get(neighbor) - around.filter(n => k.mines.has(n)).length;
          risk = Math.max(risk, remaining / Math.max(1, unknown.length));
        }
        return { id, score: row * 1.2 - Math.abs(col - 3) * 0.4 - risk * 2 + this.rng() * this.luck.guesses * (this.personality === 'chaotic' ? 5 : 2) };
      });
      scores.sort((a, b) => b.score - a.score || a.id - b.id);
      const id = scores[0].id;
      const { row, col } = tile(id);
      this._add({ op: 'step', row, col }, this._say(proven ? 'safe' : 'guess', { pos: `(${row}, ${col})`, reason: k.safe.get(id) }));
    }

    _code() {
      if (!this.knowledge.clock) throw new Error('Cannot enter lab time before seeing its clock');
      this._add({ op: 'enter_code', code: this.knowledge.clock.replace(':', '') }, this.knowledge.read.has('note')
        ? this._voice('הפתק מפנה לשעון במעבדה, אזין את השעה שרשמתי בלי נקודתיים.', 'השעה מהמעבדה, בלי נקודתיים.', 'הפתק והשעון סוף סוף נפגשים, ננסה את השעה מהמעבדה.', 'הפתק אומר שעון במעבדה! מכניס את השעה!')
        : this._voice('השעון במעבדה נעצר, אולי השעה שלו היא הקוד.', 'אנסה את השעה מהמעבדה.', 'אולי דווקא השעון התקוע מהמעבדה שומר את הסיסמה?', 'ננסה את השעון מהמעבדה! אולי זה זה!'));
    }

    _plan() {
      switch (this.stage) {
        case 'lab_intro':
          this._look();
          this._inspect('ice_door');
          this._explore('lab');
          this._inspect('bookshelf', this.skipKey ? 'את השולחן אשאיר לאחר כך. קודם אעבור על הכוננית.' : undefined);
          this.stage = 'lab_clues';
          break;
        case 'lab_clues':
          if (this.personality === 'chatty' || (this.personality === 'careful' && this.rng() < 0.35)) this._inspect(this.rng() < 0.5 ? 'star_atlas' : 'poetry_book');
          this._inspect('recipe_book');
          if (!this.skipKey) this._key();
          if (!this.skipClock) this._inspect('wall_clock');
          this.stage = 'lab_supplies';
          break;
        case 'lab_supplies':
          for (const id of this._shuffle(['potion_cabinet', 'tall_cupboard', 'cauldron'])) this._inspect(id);
          this.stage = 'fire';
          break;
        case 'fire':
          if (!this.player.inventory.includes('flask_fire')) this._brew('fire');
          else {
            this._add({ op: 'use', item: 'flask_fire', target: 'ice_door' }, this._voice('שיקוי אש מול דלת קרח, אבדוק אם הוא ממיס אותה.', 'שיקוי אש על הקרח, קדימה.', 'ננסה את השיקוי על הקרח, אולי סוף סוף יהיה פה חם.', 'אש על הקרח! בואו נפתח את הדלת!'));
            this._go('storage');
            this.stage = 'storage_intro';
          }
          break;
        case 'storage_intro':
          this._look();
          this._inspect('gate_sign');
          this._explore('storage');
          this._inspect('tarp');
          for (const id of this._shuffle(Array.from({ length: 6 }, (_, i) => `crate_${i + 1}`))) this._inspect(id);
          this.stage = 'weigh';
          break;
        case 'weigh': this._weigh(); break;
        case 'mine_intro':
          this._look();
          this._inspect('warning_sign');
          this._explore('minefield');
          this.stage = 'mines';
          break;
        case 'mines': this._mine(); break;
        case 'vault_intro':
          this._look();
          this._inspect('vault_door');
          this._explore('vault');
          if (this.tryDecoy || this.skipKey) this._inspect('grandfather_clock');
          this.stage = 'vault_clues';
          break;
        case 'vault_clues':
          if (this.tryDecoy) {
            this._add({ op: 'enter_code', code: this.knowledge.decoy.replace(':', '') }, this.knowledge.clock
              ? 'רגע, השעון הזה מראה שעה אחרת, אולי דווקא היא הקוד?'
              : this._voice('אבדוק אם השעה בשעון הזה מתאימה למנעול.', 'שעון ליד הכספת, ננסה את השעה.', 'אולי השעון הזה גם מספר לנו את הסיסמה?', 'יש שעון! ננסה את הספרות שלו!'));
          }
          if (this.player.inventory.includes('brass_key')) {
            this._add({ op: 'use', item: 'brass_key', target: 'cabinet' }, this._voice('אנסה את המפתח שמצאתי במגירה.', 'המפתח, לארונית.', 'הנה ההזדמנות של המפתח שלנו להבריק.', 'יש לי מפתח! נפתח!'));
            this._inspect('note');
          } else this._inspect('cabinet');
          this._inspect('notice_board');
          this._inspect('torn_page');
          this.stage = 'return_lab';
          break;
        case 'return_lab':
          if (this.knowledge.clock) this._code();
          this._go('minefield', this._voice('בדף כתוב שיקוי חומצה. אחזור למעבדה לערבב אותו.', 'יש עוד תערובת לנסות, חוזרים למעבדה.', 'דווקא עכשיו מצאנו עוד מתכון, חוזרים לסיבוב נוסף במעבדה.', 'שיקוי חומצה! מסקרן! חוזרים לקדרה!'));
          this._go('storage', 'אחזור דרך המשבצות שכבר נחשפו.');
          this._go('lab');
          this.stage = 'lab_return';
          break;
        case 'lab_return':
          if (this.skipKey) this._key(true);
          if (!this.knowledge.clock) this._inspect('wall_clock', this._voice('פספסתי קודם את השעון, הפעם ארשום את השעה.', 'דילגתי על השעון, בודק עכשיו.', 'הנה השעון שלא נתתי לו תשומת לב, בואו נכיר.', 'רגע! את השעון הזה עוד לא בדקתי!'));
          this.stage = 'acid';
          break;
        case 'acid':
          if (!this.player.inventory.includes('flask_acid')) this._brew('acid');
          else {
            this._go('storage');
            this._go('minefield');
            this._go('vault', 'אעבור שוב בשביל שכבר חשפתי, הפעם עם השיקוי.');
            this.stage = 'finish';
          }
          break;
        case 'finish':
          if (!this.knowledge.read.has('note')) {
            this._add({ op: 'use', item: 'brass_key', target: 'cabinet' }, 'חזרתי עם המפתח מהמגירה. אנסה אותו בארונית.');
            this._inspect('note');
          }
          if (!this.player.locks.keypad) this._code();
          this._add({ op: 'use', item: 'flask_acid', target: 'rust_seal' }, this._voice('אנסה מעט מהשיקוי על החותם החלוד.', 'ננסה חומצה על החותם.', 'חזרנו עם בקבוקון חדש. נראה איך החותם יגיב אליו.', 'שיקוי על החותם! נראה מה קורה!'));
          break;
        default: throw new Error(`Unknown mock stage: ${this.stage}`);
      }
    }
  }

  MockBot.PERSONALITIES = PERSONALITIES;
  MockBot.MAX_STEPS = MAX_STEPS;

  /** Four independent bots, scheduled by their next ready time (rotating ties).
   * opts.personalities: four profile IDs, in player order (defaults to the catalog).
   * opts.maxSteps: total command safety cap, default 4 * MockBot.MAX_STEPS.
   * log.t is action START time in milliseconds; totalMs includes the final animation.
   * places is an array of player indices, first place first. No wall-clock waits.
   */
  function runRace(seed = 1, opts = {}) {
    const ids = opts.personalities || PERSONALITIES.map(p => p.id);
    if (!Array.isArray(ids) || ids.length !== 4) throw new RangeError('A mock race needs four personalities');
    const maxSteps = opts.maxSteps === undefined ? 4 * MAX_STEPS : opts.maxSteps;
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new RangeError('maxSteps must be a positive integer');
    const game = new Engine.Game(seed, 4);
    const bots = ids.map((id, i) => new MockBot(game, i, id, seed));
    const ready = bots.map(bot => bot.thinkingMs());
    const log = [];
    let cursor = 0;
    let totalMs = 0;
    while (!game.finished) {
      if (log.length >= maxSteps) throw new Error(`Mock race step cap (${maxSteps}) reached for seed ${seed}`);
      let p = -1;
      for (let offset = 0; offset < 4; offset++) {
        const candidate = (cursor + offset) % 4;
        if (!game.players[candidate].escaped && (p === -1 || ready[candidate] < ready[p])) p = candidate;
      }
      const t = ready[p];
      const { cmd, thought } = bots[p].next();
      const result = game.act(p, cmd);
      bots[p].observe(result);
      log.push({ p, cmd, thought, t });
      const end = t + Engine.durationMs(cmd, result);
      totalMs = Math.max(totalMs, end);
      ready[p] = end + (game.players[p].escaped ? 0 : bots[p].thinkingMs());
      cursor = (p + 1) % 4;
    }
    return { places: game.finishOrder.slice(), log, totalMs };
  }

  return { MockBot, runRace };
}));
