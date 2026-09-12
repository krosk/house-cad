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
  // --- master mode groups -----------------------------------------------------
  'group.setup':   { en: 'SETUP',   fr: 'CONFIG', zh: '设置' },
  'group.plan':    { en: 'PLAN',    fr: 'PLAN',   zh: '平面' },
  'group.marker':  { en: 'MARKER', fr: 'MARQUEUR', zh: '标记' },
  'group.project': { en: 'PROJECT', fr: 'PROJET', zh: '项目' },

  // --- mode labels (key = mode.<id>) ------------------------------------------
  'mode.floor':    { en: 'FLOOR',  fr: 'SOL',      zh: '地面' },
  'mode.level':    { en: 'LEVEL',  fr: 'NIVEAU',   zh: '楼层' },
  'mode.register': { en: 'ORIGIN', fr: 'ORIGINE',  zh: '原点' },
  'mode.teleport': { en: 'TELEPORT', fr: 'TÉLÉPORT.', zh: '传送' },
  'mode.drop':     { en: 'ROOM',   fr: 'PIÈCE',    zh: '房间' },
  'mode.wall':     { en: 'WALL',   fr: 'MUR',      zh: '墙' },
  'mode.door':     { en: 'DOOR',   fr: 'PORTE',    zh: '门' },
  'mode.stairs':   { en: 'STAIRS', fr: 'ESCALIER', zh: '楼梯' },
  'mode.cabinet':  { en: 'CABINET', fr: 'PLACARD', zh: '柜子' },
  'mode.edge':     { en: 'EDGE',   fr: 'BORD',     zh: '边' },
  'mode.edit':     { en: 'EDIT',   fr: 'MODIF.',   zh: '编辑' },
  'mode.marker':   { en: 'EDIT',   fr: 'MODIF.',   zh: '编辑' },
  'mode.recal':    { en: 'RECAL',  fr: 'RECAL',    zh: '校准' },
  'mode.plan_dims':   { en: 'DIMS', fr: 'COTES', zh: '尺寸' },
  'mode.outlet_dims': { en: 'DIMS', fr: 'COTES', zh: '尺寸' },
  'mode.save':     { en: 'SAVE',   fr: 'ENREG.',   zh: '保存' },
  'mode.load':     { en: 'LOAD',   fr: 'CHARGER',  zh: '加载' },
  'mode.sheet':    { en: 'SHEET',  fr: 'PLANCHE',  zh: '图纸' },
  'mode.copy_floor': { en: 'COPY FLOOR', fr: 'COPIER ÉTAGE', zh: '复制楼层' },
  'mode.paste_floor': { en: 'PASTE FLOOR', fr: 'COLLER ÉTAGE', zh: '粘贴楼层' },
  'mode.move_up':  { en: 'MOVE UP', fr: 'MONTER',   zh: '上移' },
  'mode.move_down': { en: 'MOVE DOWN', fr: 'DESCENDRE', zh: '下移' },
  'mode.unit':     { en: 'UNIT',   fr: 'UNITÉ',     zh: '单位' },
  'mode.lang':     { en: 'LANG',   fr: 'LANGUE',   zh: '语言' },

  // --- per-mode help boxes (key = help.<id>) ----------------------------------
  'help.floor': {
    en: 'Touch the tip to the real ground to set the base level. Re-level only on the ground floor.',
    fr: 'Touchez le sol réel avec la pointe pour définir le niveau de base. Ne recalez qu’au rez-de-chaussée.',
    zh: '用笔尖触碰真实地面以设定基准标高。仅在首层重新校平。',
  },
  'help.level': {
    en: 'Thumbstick up/down: previous/next floor. Type a storey height and ENTER to set the active floor.',
    fr: 'Joystick haut/bas : étage précédent/suivant. Tapez une hauteur d’étage et VALIDER pour la définir.',
    zh: '摇杆上/下：上一/下一楼层。输入层高并按确定以设定当前楼层。',
  },
  'help.register': {
    en: 'Mark the origin. Touch 2 points along wall 1, then 1 point on wall 2. The corner is derived for you.',
    fr: 'Marquez l’origine. Touchez 2 points le long du mur 1, puis 1 point sur le mur 2. Le coin est calculé.',
    zh: '标记原点。沿墙1触碰2个点，再在墙2上触碰1个点。墙角会自动推算。',
  },
  'help.teleport': {
    en: 'Aim the floor reticle and trigger to move your virtual position there. The surveyed origin stays unchanged.',
    fr: 'Visez le sol avec le réticule et appuyez sur la gâchette pour y déplacer votre position virtuelle. L’origine relevée reste inchangée.',
    zh: '用地面准星瞄准并扣动扳机，将虚拟位置移动到那里。测量原点保持不变。',
  },
  'help.drop': {
    en: 'Thumbstick up/down picks ROOM, WALL, DOOR, STAIRS, or CABINET. All except ROOM subtract for now. Trigger drops the box where you stand.',
    fr: 'Joystick haut/bas : PIÈCE, MUR, PORTE, ESCALIER ou PLACARD. Tous sauf PIÈCE soustraient pour l’instant. La gâchette pose le bloc.',
    zh: '摇杆上/下：选择房间、墙、门、楼梯或柜子。除房间外目前均执行减去。扣动扳机放置该盒。',
  },
  'help.edge': {
    en: 'Aim at an edge and trigger to lock it, then touch the real wall to snap it there. Grip cancels a lock.',
    fr: 'Visez un bord et gâchette pour le verrouiller, puis touchez le mur réel pour l’y aligner. La poignée annule.',
    zh: '瞄准一条边并扣动扳机锁定，再触碰真实墙面将其贴合。握把取消锁定。',
  },
  'help.edit': {
    en: 'Edit the plan only. Aim and trigger to select; trigger again cycles buried zones. Grip deletes; thumbstick up/down cycles the zone type.',
    fr: 'Modifiez seulement le plan. Visez et gâchette pour choisir ; répétez pour les zones dessous. Poignée : supprime ; joystick haut/bas : type de zone.',
    zh: '仅编辑平面。瞄准并扣动扳机选择；再次扣动可循环下层区域。握把删除；摇杆上/下切换区域类型。',
  },
  'help.marker': {
    en: 'Edit markers only. Thumbstick up/down picks the drop type — or retypes the selected marker. Trigger empty space to place at the tip. Aim a marker + trigger to edit height; ENTER saves. Grip-drag moves one, grip away deletes.',
    fr: 'Modifiez seulement les marqueurs. Joystick haut/bas : choisit le type à poser, ou change le type du marqueur sélectionné. Gâchette dans le vide : poser à la pointe. Visez un marqueur + gâchette : hauteur ; VALIDER enregistre. Poignée-glisser : déplacer ; poignée ailleurs : supprimer.',
    zh: '仅编辑标记。摇杆上/下：选择放置类型，或更改所选标记的类型。对空处扣动扳机在笔尖处放置。瞄准标记并扣动扳机编辑高度；按确定保存。按住握把拖动，移开后按握把删除。',
  },
  'help.recal': {
    en: 'Fix drift. Aim the pointer reticle so wall 1 highlights and trigger to pick its corner, then touch 2 points on wall 1 and 1 on wall 2.',
    fr: 'Corrige la dérive. Visez avec le réticule jusqu’à surligner le mur 1, gâchette pour choisir son coin, puis 2 points sur le mur 1 et 1 sur le mur 2.',
    zh: '修正漂移。用指针准星瞄准至墙1高亮，扣动扳机选择墙角，然后在墙1上触碰2个点、在墙2上触碰1个点。',
  },
  'help.plan_dims': {
    en: 'Plan dimensions only. Pick two compatible edges, or an edge and the origin, then type the distance. Marker icons are inert.',
    fr: 'Cotes du plan uniquement. Choisissez deux bords compatibles, ou un bord et l’origine, puis tapez la distance. Les icônes de marqueurs sont inertes.',
    zh: '仅编辑平面尺寸。选择两条兼容的边，或一条边与原点，再输入距离。标记图标在此模式下无效。',
  },
  'help.outlet_dims': {
    en: 'Marker dimensions only. Pick a marker floor icon first, then a plan edge and type the distance (0 = on wall). The wall marker highlights too.',
    fr: 'Cotes des marqueurs uniquement. Choisissez d’abord l’icône au sol, puis un bord du plan et tapez la distance (0 = au mur). Le marqueur mural est aussi surligné.',
    zh: '仅编辑标记尺寸。先选择标记地面图标，再选择平面边并输入距离（0 = 贴墙）。对应的墙上标记也会高亮。',
  },
  'help.save': {
    en: 'Aim at a slot and trigger to save. For an occupied slot, select the separate CONFIRM OVERWRITE button.',
    fr: 'Visez un emplacement et appuyez pour enregistrer. S’il est occupé, sélectionnez le bouton CONFIRMER L’ÉCRASEMENT.',
    zh: '瞄准槽位并扣动扳机保存。若槽位已有内容，请选择单独的“确认覆盖”按钮。',
  },
  'help.load': {
    en: 'Aim at a filled slot and trigger to load it into the frame you already registered. Empty slots do nothing.',
    fr: 'Visez un emplacement occupé et gâchette pour le charger dans le repère déjà enregistré. Les emplacements vides ne font rien.',
    zh: '瞄准一个已占用的槽位并扣动扳机，将其加载到已注册的坐标系中。空槽位无效。',
  },
  'help.sheet': {
    en: 'Preview the to-scale plan sheet. Thumbstick up/down: previous/next floor. Trigger downloads this floor as an SVG (saved to the headset).',
    fr: 'Aperçu de la planche à l’échelle. Joystick haut/bas : étage précédent/suivant. Gâchette : télécharge cet étage en SVG (enregistré sur le casque).',
    zh: '预览按比例的平面图纸。摇杆上/下：上一/下一楼层。扣动扳机将本层下载为 SVG（保存到头显）。',
  },
  'help.copy_floor': {
    en: 'Trigger to copy the active floor, including its dimensions and markers. It remains available after loading another save.',
    fr: 'Gâchette pour copier l’étage actif, avec ses cotes et marqueurs. Il reste disponible après le chargement d’une autre sauvegarde.',
    zh: '扣动扳机复制当前楼层，包括尺寸和标记。加载另一个存档后仍可粘贴。',
  },
  'help.paste_floor': {
    en: 'Trigger to replace the active floor’s plan from the clipboard. Its name and height stay. An occupied floor asks for a second trigger.',
    fr: 'Gâchette pour remplacer le plan de l’étage actif. Son nom et sa hauteur restent. Un étage occupé demande une seconde gâchette.',
    zh: '扣动扳机，用剪贴板替换当前楼层平面。名称和层高保持不变。非空楼层需再次扣动确认。',
  },
  'help.move_up': {
    en: 'Trigger to move the active floor’s complete plan to the empty floor immediately above. Occupied floors are never overwritten.',
    fr: 'Gâchette pour déplacer tout le plan de l’étage actif vers l’étage vide juste au-dessus. Un étage occupé n’est jamais écrasé.',
    zh: '扣动扳机，将当前楼层的完整平面移动到紧邻的空白上层。绝不会覆盖已有内容。',
  },
  'help.move_down': {
    en: 'Trigger to move the active floor’s complete plan to the empty floor immediately below. Occupied floors are never overwritten.',
    fr: 'Gâchette pour déplacer tout le plan de l’étage actif vers l’étage vide juste en dessous. Un étage occupé n’est jamais écrasé.',
    zh: '扣动扳机，将当前楼层的完整平面移动到紧邻的空白下层。绝不会覆盖已有内容。',
  },
  'help.unit': {
    en: 'Push the thumbstick up/down to change the display and input unit. Geometry stays unchanged.',
    fr: 'Poussez le joystick haut/bas pour changer l’unité d’affichage et de saisie. La géométrie reste inchangée.',
    zh: '上下推动摇杆以切换显示和输入单位。几何尺寸保持不变。',
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

  // --- DIMS dimension title ---------------------------------------------------
  'dim.pickPlan':   { en: 'pick edge / origin', fr: 'bord / origine', zh: '选择 边/原点' },
  'dim.pickOutlet': { en: 'pick marker floor icon', fr: 'icône de marqueur au sol', zh: '选择标记地面图标' },
  'dim.edit':     { en: '(edit)', fr: '(modif.)', zh: '（编辑）' },
  'dim.conflict': { en: '!CONFLICT', fr: '!CONFLIT', zh: '！冲突' },
  'ref.origin':   { en: 'ORIGIN', fr: 'ORIGINE', zh: '原点' },
  'edge.left':    { en: 'LEFT',   fr: 'GAUCHE', zh: '左' },
  'edge.right':   { en: 'RIGHT',  fr: 'DROITE', zh: '右' },
  'edge.bottom':  { en: 'BOTTOM', fr: 'BAS',    zh: '下' },
  'edge.top':     { en: 'TOP',    fr: 'HAUT',   zh: '上' },
  'zone.type':    { en: 'TYPE',   fr: 'TYPE',   zh: '类型' },

  // --- SAVE/LOAD slot menu ----------------------------------------------------
  'slot.saveTitle': { en: 'SAVE — pick slot', fr: 'ENREG. — choisir', zh: '保存 — 选择槽位' },
  'slot.loadTitle': { en: 'LOAD — pick slot', fr: 'CHARGER — choisir', zh: '加载 — 选择槽位' },
  'slot.slot':      { en: 'SLOT',  fr: 'EMPL.',  zh: '槽位' },
  'slot.empty':     { en: 'empty', fr: 'vide',   zh: '空' },
  'slot.rects':     { en: 'rects', fr: 'rect.',  zh: '个矩形' },
  'slot.saved':     { en: 'SAVED →',   fr: 'ENREGISTRÉ →', zh: '已保存 →' },
  'slot.overwrite': { en: 'OVERWRITE', fr: 'ÉCRASER', zh: '覆盖' },
  'slot.confirmOverwrite': { en: 'CONFIRM OVERWRITE', fr: 'CONFIRMER ÉCRASEMENT', zh: '确认覆盖' },
  'slot.cancel':    { en: 'CANCEL', fr: 'ANNULER', zh: '取消' },
  'slot.triggerAgain': { en: 'TRIGGER AGAIN', fr: 'GÂCHETTE ENCORE', zh: '再次扣动扳机' },
  'slot.loaded':    { en: 'LOADED',    fr: 'CHARGÉ',       zh: '已加载' },
  'slot.saveFailed': { en: 'SAVE FAILED', fr: 'ÉCHEC ENREG.', zh: '保存失败' },
  'slot.loadFailed': { en: 'LOAD FAILED', fr: 'ÉCHEC CHARG.', zh: '加载失败' },

  // --- MOVE UP result flashes -------------------------------------------------
  'moveFloor.moved':    { en: 'MOVED TO', fr: 'DÉPLACÉ VERS', zh: '已移动至' },
  'moveFloor.noUpper':  { en: 'NO FLOOR ABOVE', fr: 'AUCUN ÉTAGE AU-DESSUS', zh: '没有上层' },
  'moveFloor.noLower':  { en: 'NO FLOOR BELOW', fr: 'AUCUN ÉTAGE EN DESSOUS', zh: '没有下层' },
  'moveFloor.empty':    { en: 'ACTIVE FLOOR EMPTY', fr: 'ÉTAGE ACTIF VIDE', zh: '当前楼层为空' },
  'moveFloor.occupied': { en: 'DESTINATION NOT EMPTY', fr: 'DESTINATION NON VIDE', zh: '目标楼层不是空白楼层' },

  // --- COPY/PASTE FLOOR result flashes ---------------------------------------
  'floorCopy.copied': { en: 'COPIED', fr: 'COPIÉ', zh: '已复制' },
  'floorCopy.pasted': { en: 'PASTED', fr: 'COLLÉ', zh: '已粘贴' },
  'floorCopy.replace': { en: 'REPLACE', fr: 'REMPLACER', zh: '替换' },
  'floorCopy.empty':  { en: 'NOTHING COPIED', fr: 'RIEN À COLLER', zh: '没有可粘贴的楼层' },
  'floorCopy.failed': { en: 'PASTE FAILED', fr: 'ÉCHEC DU COLLAGE', zh: '粘贴失败' },

  // --- LEVEL height pad title -------------------------------------------------
  'level.base':        { en: 'base', fr: 'base', zh: '标高' },
  'level.storeyHeight': { en: 'storey height', fr: 'hauteur d’étage', zh: '层高' },

  // --- LANG menu title --------------------------------------------------------
  'lang.title': { en: 'LANGUAGE', fr: 'LANGUE', zh: '语言' },

  // --- UNIT menu title --------------------------------------------------------
  'unit.title': { en: 'UNIT', fr: 'UNITÉ', zh: '单位' },

  // --- markers (wall-anchored annotations) ------------------------------------
  'marker.outlet':   { en: 'outlet',   fr: 'prise',        zh: '插座' },
  'marker.switch':   { en: 'switch',   fr: 'interrupteur', zh: '开关' },
  'marker.light':    { en: 'light',    fr: 'luminaire',    zh: '灯' },
  'marker.ethernet': { en: 'ethernet', fr: 'réseau',       zh: '网口' },
  'marker.height':   { en: 'height',   fr: 'hauteur',      zh: '高度' },
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
