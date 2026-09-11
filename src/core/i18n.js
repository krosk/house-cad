// Localization for the AR survey UI (FR / EN / ZH). Only user-facing TEXT is
// translated — the model, ids, and functional tokens stay language-independent.
// Mirrors units.js: a current value + a change bus so views re-render on switch.
// The current language persists to localStorage so it survives an APK relaunch.

export const LANGS = {
  en: { label: 'English' },
  fr: { label: 'Français' },
  zh: { label: '中文' },
};
// Fixed order the LANG menu moves up/down through.
export const LANG_ORDER = ['en', 'fr', 'zh'];

const STORE_KEY = 'house-cad:lang:v1';

// key -> per-language string. Missing language falls back to en, then the key.
const STRINGS = {
  // --- mode labels (key = mode.<id>) ------------------------------------------
  'mode.floor':    { en: 'FLOOR',  fr: 'SOL',      zh: '地面' },
  'mode.level':    { en: 'LEVEL',  fr: 'NIVEAU',   zh: '楼层' },
  'mode.register': { en: 'ORIGIN', fr: 'ORIGINE',  zh: '原点' },
  'mode.drop':     { en: 'ROOM',   fr: 'PIÈCE',    zh: '房间' },
  'mode.wall':     { en: 'WALL',   fr: 'MUR',      zh: '墙' },
  'mode.edge':     { en: 'EDGE',   fr: 'BORD',     zh: '边' },
  'mode.edit':     { en: 'EDIT',   fr: 'MODIF',    zh: '编辑' },
  'mode.marker':   { en: 'OUTLET', fr: 'PRISE',    zh: '插座' },
  'mode.recal':    { en: 'RECAL',  fr: 'RECAL',    zh: '校准' },
  'mode.size':     { en: 'SIZE',   fr: 'COTE',     zh: '尺寸' },
  'mode.save':     { en: 'SAVE',   fr: 'ENREG.',   zh: '保存' },
  'mode.load':     { en: 'LOAD',   fr: 'CHARGER',  zh: '加载' },
  'mode.lang':     { en: 'LANG',   fr: 'LANGUE',   zh: '语言' },

  // --- per-mode help boxes (key = help.<id>) ----------------------------------
  'help.floor': {
    en: 'Touch the tip to the real ground to set the base level. Re-level only on the ground floor.',
    fr: 'Touchez le sol réel avec la pointe pour définir le niveau de base. Ne recalez qu’au rez-de-chaussée.',
    zh: '用笔尖触碰真实地面以设定基准标高。仅在首层重新校平。',
  },
  'help.level': {
    en: 'B/Y: switch to the next floor (Basement/Ground/Upper). Type a storey height and ENTER to set the active floor.',
    fr: 'B/Y : passe à l’étage suivant (Sous-sol/RdC/Étage). Tapez une hauteur d’étage et VALIDER pour la définir.',
    zh: 'B/Y：切换到下一楼层（地下室/首层/上层）。输入层高并按确定以设定当前楼层。',
  },
  'help.register': {
    en: 'Mark the origin. Touch 2 points along wall 1, then 1 point on wall 2. The corner is derived for you.',
    fr: 'Marquez l’origine. Touchez 2 points le long du mur 1, puis 1 point sur le mur 2. Le coin est calculé.',
    zh: '标记原点。沿墙1触碰2个点，再在墙2上触碰1个点。墙角会自动推算。',
  },
  'help.drop': {
    en: 'Trigger to drop a roomspace box where you stand. Push its edges out to the walls in EDGE.',
    fr: 'Gâchette pour poser une pièce là où vous êtes. Poussez ses bords vers les murs dans BORD.',
    zh: '扣动扳机在所站位置放置一个房间盒。到“边”模式将其边推向墙面。',
  },
  'help.wall': {
    en: 'Trigger to drop a wall (subtract) box where you stand. Snap its edges to the wall faces in EDGE.',
    fr: 'Gâchette pour poser un mur (soustraction) là où vous êtes. Alignez ses bords aux faces des murs dans BORD.',
    zh: '扣动扳机在所站位置放置一个墙体（减去）盒。到“边”模式将其边贴到墙面。',
  },
  'help.edge': {
    en: 'Aim at an edge and trigger to lock it, then touch the real wall to snap it there. Grip cancels a lock.',
    fr: 'Visez un bord et gâchette pour le verrouiller, puis touchez le mur réel pour l’y aligner. La poignée annule.',
    zh: '瞄准一条边并扣动扳机锁定，再触碰真实墙面将其贴合。握把取消锁定。',
  },
  'help.edit': {
    en: 'Aim at a zone and trigger to select it (trigger again cycles buried zones). Grip deletes; B/Y swaps room/wall. Aim at a marker to edit its height; grip deletes it.',
    fr: 'Visez une zone et gâchette pour la sélectionner (à nouveau : zones dessous). Poignée : supprime ; B/Y : pièce/mur. Visez une prise pour régler sa hauteur ; poignée : supprime.',
    zh: '瞄准一个区域并扣动扳机选择（再次扣动循环下层区域）。握把删除；B/Y 切换房间/墙。瞄准一个标记可调整其高度；握把删除它。',
  },
  'help.marker': {
    en: 'Trigger to drop an outlet at the tip; its height starts at the tip’s height above the floor. Pin X/Y to the walls in SIZE, edit the height in EDIT.',
    fr: 'Gâchette pour poser une prise à la pointe ; sa hauteur initiale = hauteur de la pointe au-dessus du sol. Fixez X/Y aux murs dans COTE, réglez la hauteur dans MODIF.',
    zh: '扣动扳机在笔尖处放置一个插座；初始高度为笔尖离地高度。在“尺寸”中把 X/Y 固定到墙面，在“编辑”中调整高度。',
  },
  'help.recal': {
    en: 'Fix drift. Aim so the reticle hugs wall 1 and trigger to pick a known corner, then touch 2 points on wall 1 and 1 on wall 2.',
    fr: 'Corrige la dérive. Visez pour que le réticule longe le mur 1, gâchette pour choisir un coin connu, puis 2 points sur le mur 1 et 1 sur le mur 2.',
    zh: '修正漂移。瞄准使准星贴住墙1并扣动扳机选择一个已知墙角，然后在墙1上触碰2个点、在墙2上触碰1个点。',
  },
  'help.size': {
    en: 'Pick two references — a rect edge or the plan origin — then type the exact distance on the numpad. B/Y flips the side. To pin a marker: pick it, then a wall edge (0 = on the wall).',
    fr: 'Choisissez deux références — un bord ou l’origine du plan — puis tapez la distance exacte sur le pavé. B/Y inverse le côté. Pour fixer une prise : choisissez-la, puis un bord de mur (0 = sur le mur).',
    zh: '选取两个参照——矩形的边或平面原点——然后在数字键盘上输入精确距离。B/Y 翻转方向。固定标记：先选标记，再选墙边（0 = 贴在墙上）。',
  },
  'help.save': {
    en: 'Aim the ray at a slot and trigger to save the whole project there (overwrites a filled slot).',
    fr: 'Visez un emplacement et gâchette pour y enregistrer tout le projet (écrase un emplacement occupé).',
    zh: '用射线瞄准一个槽位并扣动扳机，将整个项目保存到该处（会覆盖已占用的槽位）。',
  },
  'help.load': {
    en: 'Aim at a filled slot and trigger to load it into the frame you already registered. Empty slots do nothing.',
    fr: 'Visez un emplacement occupé et gâchette pour le charger dans le repère déjà enregistré. Les emplacements vides ne font rien.',
    zh: '瞄准一个已占用的槽位并扣动扳机，将其加载到已注册的坐标系中。空槽位无效。',
  },
  'help.lang': {
    en: 'Push the thumbstick up/down to change language. Applies everywhere at once.',
    fr: 'Poussez le joystick haut/bas pour changer de langue. S’applique partout aussitôt.',
    zh: '上下推动摇杆以切换语言。立即在各处生效。',
  },

  // --- transient mode labels --------------------------------------------------
  'lbl.wall2':   { en: 'WALL 2', fr: 'MUR 2', zh: '墙2' },
  'lbl.perp':    { en: 'PERP',   fr: 'PERP',  zh: '垂直墙' },
  'lbl.wall1p1': { en: 'WALL 1 · P1', fr: 'MUR 1 · P1', zh: '墙1 · P1' },
  'lbl.wall1p2': { en: 'WALL 1 · P2', fr: 'MUR 1 · P2', zh: '墙1 · P2' },
  'lbl.snap':    { en: 'SNAP TO WALL', fr: 'ALIGNER AU MUR', zh: '贴到墙面' },

  // --- numpad keys ------------------------------------------------------------
  'key.enter': { en: 'ENTER',   fr: 'VALIDER',   zh: '确定' },
  'key.del':   { en: '🗑 DEL',  fr: '🗑 SUPPR',  zh: '🗑 删除' },
  'key.flip':  { en: '⇄ FLIP',  fr: '⇄ INVERSER', zh: '⇄ 翻转' },

  // --- SIZE dimension title ---------------------------------------------------
  'dim.pick':     { en: 'pick edge / origin', fr: 'bord / origine', zh: '选择 边/原点' },
  'dim.edit':     { en: '(edit)', fr: '(modif.)', zh: '（编辑）' },
  'dim.conflict': { en: '!CONFLICT', fr: '!CONFLIT', zh: '！冲突' },
  'ref.origin':   { en: 'ORIGIN', fr: 'ORIGINE', zh: '原点' },
  'edge.left':    { en: 'LEFT',   fr: 'GAUCHE', zh: '左' },
  'edge.right':   { en: 'RIGHT',  fr: 'DROITE', zh: '右' },
  'edge.bottom':  { en: 'BOTTOM', fr: 'BAS',    zh: '下' },
  'edge.top':     { en: 'TOP',    fr: 'HAUT',   zh: '上' },

  // --- SAVE/LOAD slot menu ----------------------------------------------------
  'slot.saveTitle': { en: 'SAVE — pick slot', fr: 'ENREG. — choisir', zh: '保存 — 选择槽位' },
  'slot.loadTitle': { en: 'LOAD — pick slot', fr: 'CHARGER — choisir', zh: '加载 — 选择槽位' },
  'slot.slot':      { en: 'SLOT',  fr: 'EMPL.',  zh: '槽位' },
  'slot.empty':     { en: 'empty', fr: 'vide',   zh: '空' },
  'slot.rects':     { en: 'rects', fr: 'rect.',  zh: '个矩形' },
  'slot.saved':     { en: 'SAVED →',   fr: 'ENREGISTRÉ →', zh: '已保存 →' },
  'slot.loaded':    { en: 'LOADED',    fr: 'CHARGÉ',       zh: '已加载' },
  'slot.saveFailed': { en: 'SAVE FAILED', fr: 'ÉCHEC ENREG.', zh: '保存失败' },
  'slot.loadFailed': { en: 'LOAD FAILED', fr: 'ÉCHEC CHARG.', zh: '加载失败' },

  // --- LEVEL height pad title -------------------------------------------------
  'level.base':        { en: 'base', fr: 'base', zh: '标高' },
  'level.storeyHeight': { en: 'storey height', fr: 'hauteur d’étage', zh: '层高' },

  // --- LANG menu title --------------------------------------------------------
  'lang.title': { en: 'LANGUAGE', fr: 'LANGUE', zh: '语言' },

  // --- markers (wall-anchored annotations) ------------------------------------
  'marker.outlet': { en: 'outlet', fr: 'prise',   zh: '插座' },
  'marker.height': { en: 'height', fr: 'hauteur', zh: '高度' },
};

let current = 'en';
try {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved && LANGS[saved]) current = saved;
} catch { /* localStorage may be unavailable */ }

const listeners = new Set();

export function getLang() {
  return current;
}
export function langLabel(l = current) {
  return LANGS[l]?.label ?? l;
}
export function setLang(l) {
  if (LANGS[l] && l !== current) {
    current = l;
    try { localStorage.setItem(STORE_KEY, l); } catch { /* ignore */ }
    for (const fn of listeners) fn(current);
  }
}
// Move n steps through LANG_ORDER (wraps). Used by the LANG menu thumbstick.
export function cycleLang(dir) {
  const i = LANG_ORDER.indexOf(current);
  const n = LANG_ORDER.length;
  setLang(LANG_ORDER[(((i + dir) % n) + n) % n]);
}
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
// Translate a key to the current language (en fallback, then the raw key).
export function t(key) {
  const e = STRINGS[key];
  return (e && (e[current] ?? e.en)) ?? key;
}
