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
  'mode.all_floors': { en: 'ALL FLOORS', fr: 'TOUS LES ÉTAGES', zh: '所有楼层' },
  'mode.register': { en: 'ORIGIN', fr: 'ORIGINE',  zh: '原点' },
  'mode.teleport': { en: 'TELEPORT', fr: 'TÉLÉPORT.', zh: '传送' },
  'mode.drop':     { en: 'ADD',    fr: 'AJOUT',    zh: '添加' },
  'mode.room':     { en: 'ROOM',   fr: 'PIÈCE',    zh: '房间' },
  'mode.wall':     { en: 'WALL',   fr: 'MUR',      zh: '墙' },
  'mode.insulation': { en: 'INSULATION', fr: 'ISOLATION', zh: '保温层' },
  'mode.door':     { en: 'DOOR',   fr: 'PORTE',    zh: '门' },
  'mode.window':   { en: 'WINDOW', fr: 'FENÊTRE',  zh: '窗' },
  'mode.stairs':   { en: 'STAIRS', fr: 'ESCALIER', zh: '楼梯' },
  'mode.cabinet':  { en: 'CABINET', fr: 'PLACARD', zh: '柜子' },
  'mode.furniture': { en: 'FURNITURE', fr: 'MOBILIER', zh: '家具' },
  'mode.edge':     { en: 'EDGE',   fr: 'BORD',     zh: '边' },
  'mode.edit':     { en: 'EDIT',   fr: 'MODIF.',   zh: '编辑' },
  'mode.translate': { en: 'TRANSLATE', fr: 'TRANSLATION', zh: '平移' },
  'mode.marker':   { en: 'EDIT',   fr: 'MODIF.',   zh: '编辑' },
  'mode.marker_link': { en: 'LINK', fr: 'LIER',     zh: '连接' },
  'mode.marker_wire': { en: 'WIRE', fr: 'CÂBLE',    zh: '布线' },
  'mode.marker_conduit': { en: 'CONDUIT', fr: 'GAINE', zh: '管路' },
  'mode.conduit_edit': { en: 'CONDUIT EDIT', fr: 'MODIF. GAINE', zh: '编辑管路' },
  'mode.recal':    { en: 'RECAL',  fr: 'RECAL',    zh: '校准' },
  'mode.plan_dims':   { en: 'DIMS', fr: 'COTES', zh: '尺寸' },
  'mode.outlet_dims': { en: 'DIMS', fr: 'COTES', zh: '尺寸' },
  'mode.save':     { en: 'SAVE',   fr: 'ENREG.',   zh: '保存' },
  'mode.load':     { en: 'LOAD',   fr: 'CHARGER',  zh: '加载' },
  'mode.export':   { en: 'EXPORT', fr: 'EXPORT',    zh: '导出' },
  'mode.copy_floor': { en: 'COPY FLOOR', fr: 'COPIER ÉTAGE', zh: '复制楼层' },
  'mode.paste_floor': { en: 'PASTE FLOOR', fr: 'COLLER ÉTAGE', zh: '粘贴楼层' },
  'mode.move_up':  { en: 'MOVE UP', fr: 'MONTER',   zh: '上移' },
  'mode.move_down': { en: 'MOVE DOWN', fr: 'DESCENDRE', zh: '下移' },
  'mode.unit':     { en: 'UNIT',   fr: 'UNITÉ',     zh: '单位' },
  'mode.lang':     { en: 'LANG',   fr: 'LANGUE',   zh: '语言' },

  // --- plan sheet ------------------------------------------------------------
  'sheet.generated': { en: 'Generated', fr: 'Généré', zh: '生成日期' },
  'sheet.build': { en: 'Build', fr: 'Version', zh: '构建版本' },

  // --- change map (revision clouds) — templates; {kind}/{name}/{from}/{to}/{value}/{unit}
  //     are interpolated by planSheet.js (which owns unit display).
  'rev.title':        { en: 'REV — CHANGES', fr: 'RÉV — CHANGEMENTS', zh: '修订 — 变更' },
  'rev.zoneAdded':    { en: 'Zone added ({kind})',   fr: 'Zone ajoutée ({kind})',   zh: '新增区域（{kind}）' },
  'rev.zoneRemoved':  { en: 'Zone removed ({kind})', fr: 'Zone supprimée ({kind})', zh: '删除区域（{kind}）' },
  'rev.zoneRetyped':  { en: 'Zone {from}→{to}',      fr: 'Zone {from}→{to}',        zh: '区域 {from}→{to}' },
  'rev.zoneResized':  { en: 'Zone resized',          fr: 'Zone redimensionnée',     zh: '区域尺寸变更' },
  'rev.zoneMoved':    { en: 'Zone moved',            fr: 'Zone déplacée',           zh: '区域移动' },
  'rev.zoneChanged':  { en: 'Zone changed',          fr: 'Zone modifiée',           zh: '区域变更' },
  'rev.markerAdded':  { en: '{name} added',          fr: '{name} ajouté',           zh: '新增{name}' },
  'rev.markerRemoved':{ en: '{name} removed',        fr: '{name} supprimé',         zh: '删除{name}' },
  'rev.markerMoved':  { en: '{name} moved',          fr: '{name} déplacé',          zh: '{name}移动' },
  'rev.markerRetyped':{ en: '{from}→{to}',           fr: '{from}→{to}',             zh: '{from}→{to}' },
  'rev.dimChanged':   { en: 'Dim {from}→{to} {unit}', fr: 'Cote {from}→{to} {unit}', zh: '尺寸 {from}→{to} {unit}' },
  'rev.dimAdded':     { en: 'Dim added {value} {unit}', fr: 'Cote ajoutée {value} {unit}', zh: '新增尺寸 {value} {unit}' },
  'rev.dimRemoved':   { en: 'Dim removed',           fr: 'Cote supprimée',          zh: '删除尺寸' },
  'floor.ground': { en: 'Ground floor', fr: 'Rez-de-chaussée', zh: '底层' },
  'floor.upper': { en: 'Upper floor', fr: 'Étage', zh: '上层' },
  'floor.basement': { en: 'Basement', fr: 'Sous-sol', zh: '地下室' },
  'export.active': { en: 'Active', fr: 'Actif', zh: '当前楼层' },
  'export.format': { en: 'FORMAT', fr: 'FORMAT', zh: '格式' },
  'export.planDims': { en: 'PLAN DIMS', fr: 'COTES PLAN', zh: '平面尺寸' },
  'export.markerDims': { en: 'MARKER DIMS', fr: 'COTES MARQUEURS', zh: '标记尺寸' },
  'export.markerIcons': { en: 'MARKER ICONS', fr: 'ICÔNES MARQUEURS', zh: '标记图标' },
  'export.furniture': { en: 'FURNITURE', fr: 'MOBILIER', zh: '家具' },
  'export.area': { en: 'AREA', fr: 'SURFACE', zh: '面积' },
  'export.action': { en: 'EXPORT', fr: 'EXPORTER', zh: '导出' },
  'export.compare': { en: 'COMPARE', fr: 'COMPARER', zh: '对比' },
  'export.baselineNone': { en: 'none', fr: 'aucun', zh: '无' },
  'export.slot': { en: 'Slot', fr: 'Empl.', zh: '槽位' },

  // --- per-mode help boxes (key = help.<id>) ----------------------------------
  'help.floor': {
    en: 'Touch the tip to the real floor of the selected storey. Its elevation is deducted automatically to set the shared ground datum.',
    fr: 'Touchez avec la pointe le sol réel de l’étage sélectionné. Son élévation est soustraite automatiquement pour définir le niveau de base commun.',
    zh: '用笔尖触碰所选楼层的真实地面。系统会自动减去该楼层标高，以设定共用的地面基准。',
  },
  'help.level': {
    en: 'Up/down: choose a floor or ALL FLOORS above the top. On a floor, type storey height + ENTER. ALL FLOORS is read-only; PLAN/MARKER are skipped.',
    fr: 'Haut/bas : choisissez un étage ou TOUS LES ÉTAGES au-dessus. Sur un étage, tapez sa hauteur + VALIDER. La vue globale est en lecture seule ; PLAN/MARQUEUR sont ignorés.',
    zh: '上/下：选择楼层或最上方的“所有楼层”。在单层中输入层高并确定。“所有楼层”为只读，并跳过平面/标记工具。',
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
    en: 'Thumbstick up/down picks ROOM, WALL, INSULATION, DOOR, WINDOW, STAIRS, CABINET, or FURNITURE. All except ROOM subtract for now. Trigger drops the box where you stand.',
    fr: 'Joystick haut/bas : PIÈCE, MUR, ISOLATION, PORTE, FENÊTRE, ESCALIER, PLACARD ou MOBILIER. Tous sauf PIÈCE soustraient pour l’instant. La gâchette pose le bloc.',
    zh: '摇杆上/下：选择房间、墙、保温层、门、窗、楼梯、柜子或家具。除房间外目前均执行减去。扣动扳机放置该盒。',
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
  'help.translate': {
    en: 'Relocate the active floor rigidly. Pick an X edge and a Y edge, entering each desired distance from origin. FLIP changes side; the complete floor moves only after both are set.',
    fr: 'Déplacez rigidement l’étage actif. Choisissez un bord X et un bord Y, puis entrez pour chacun la distance voulue à l’origine. INVERSER change de côté ; tout l’étage bouge après les deux saisies.',
    zh: '整体平移当前楼层。选择一条 X 方向边和一条 Y 方向边，并分别输入其到原点的目标距离。“翻转”可改变所在侧；两项均设定后才移动整个楼层。',
  },
  'help.marker': {
    en: 'Edit markers only. Trigger repeatedly to cycle markers stacked at one position. Thumbstick up/down picks or changes type. Trigger empty space to place; ENTER saves height. Grip-drag moves one, grip away deletes.',
    fr: 'Modifiez seulement les marqueurs. Répétez la gâchette pour parcourir ceux empilés au même point. Joystick haut/bas : type. Gâchette dans le vide : poser ; VALIDER enregistre la hauteur. Poignée-glisser : déplacer ; poignée ailleurs : supprimer.',
    zh: '仅编辑标记。在同一位置重复扣动扳机可循环选择堆叠标记。摇杆上/下选择或更改类型。对空处扣动扳机放置；按确定保存高度。按住握把拖动，移开后按握把删除。',
  },
  'help.marker_link': {
    en: 'Link electrical controls. Trigger a switch, then trigger lights to add or remove their connection. Grip clears the selected switch. Routes rise to the ceiling automatically.',
    fr: 'Reliez les commandes électriques. Gâchette sur un interrupteur, puis sur les luminaires pour ajouter ou retirer leur liaison. La poignée efface l’interrupteur choisi. Le chemin monte automatiquement au plafond.',
    zh: '连接电气控制。先扣动扳机选择开关，再选择灯具以添加或移除连接。按住手柄键可清除所选开关。线路会自动上升到天花板。',
  },
  'help.marker_wire': {
    en: 'Route a wire over the conduit network. Trigger two device markers to define it — its path is the automatic shortest route through the conduits, drawn at once. Trigger the wire to select it, then trigger conduit nodes to force the route through them (a via override); grip pops the last override, or (with none) deletes the selected wire. The wall/ceiling/floor of each segment is inferred.',
    fr: 'Faites cheminer un câble dans le réseau de gaines. Gâchette sur deux marqueurs d’appareil pour le définir — son trajet est la route la plus courte à travers les gaines, tracée aussitôt. Gâchette sur le câble pour le sélectionner, puis gâchette sur des nœuds de gaine pour l’y forcer (dérivation via) ; la poignée retire la dernière dérivation, ou (sans aucune) supprime le câble choisi. Le mur/plafond/sol de chaque segment est déduit.',
    zh: '让线路沿管路网络走线。对两个设备标记扣动扳机即可定义——其路径为经管路的最短路线，立即绘出。对线路扣动扳机选中它，再对管路节点扣动扳机可强制经由该节点（via 覆盖）；按握把撤销最后一个覆盖，或（在没有覆盖时）删除所选线路。每段所在的墙/天花板/地板会自动推断。',
  },
  'help.marker_conduit': {
    en: 'Build the conduit network. Trigger a device or an existing node to start the pen there, trigger empty space to drop a junction and run a conduit to it, or trigger another node to connect (branch/loop). Grip lifts the pen; lift then start elsewhere to branch. Wires route through these conduits later.',
    fr: 'Construisez le réseau de gaines. Gâchette sur un appareil ou un nœud existant pour démarrer le stylo, gâchette dans le vide pour poser une jonction et y tirer une gaine, ou gâchette sur un autre nœud pour relier (dérivation/boucle). La poignée lève le stylo ; levez puis repartez d’un autre nœud pour dériver. Les câbles emprunteront ces gaines ensuite.',
    zh: '构建管路网络。对设备或已有节点扣动扳机以在此落笔，对空处扣动扳机放置接头并连一段管路，或对另一节点扣动扳机进行连接（分支/环路）。握把抬笔；抬笔后从另一节点重新开始即可分支。之后线路将在这些管路中走线。',
  },
  'help.conduit_edit': {
    en: 'Edit the conduit network. Trigger a node to select it (free junctions open a height pad), grip-drag a node to move it (near = 3D carry, far = floor reticle + typed height), or grip away to delete the selected node and its segments. Trigger a segment (highlights yellow) to split it with a new junction, or grip it to delete just that segment. Marker-bound nodes follow their device.',
    fr: 'Modifiez le réseau de gaines. Gâchette sur un nœud pour le sélectionner (les jonctions libres ouvrent un pavé de hauteur), poignée-glisser pour le déplacer (près = 3D, loin = réticule sol + hauteur saisie), ou poignée à l’écart pour supprimer le nœud choisi et ses segments. Gâchette sur un segment (surligné en jaune) pour le scinder par une nouvelle jonction, ou poignée dessus pour supprimer ce seul segment. Les nœuds liés à un appareil suivent celui-ci.',
    zh: '编辑管路网络。扣动扳机选择节点（自由接头会打开高度键盘），按住握把拖动可移动节点（近=三维搬运，远=地面标线+输入高度），或将握把移开以删除所选节点及其段。对某段（高亮为黄色）扣动扳机可用新接头将其分割，或按住握把仅删除该段。绑定到设备的节点跟随该设备。',
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
  'help.export': {
    en: 'Exports the active LEVEL floor as SVG, PNG, detailed DXF, or simplified COOHOM DXF, or the complete raw project as JSON. Thumbstick up/down changes format; use the separate EXPORT button.',
    fr: 'Exporte l’étage actif en SVG, PNG, DXF détaillé ou DXF COOHOM simplifié, ou le projet brut complet en JSON. Joystick haut/bas : format ; utilisez le bouton EXPORTER.',
    zh: '将当前楼层导出为 SVG、PNG、详细 DXF 或简化的 COOHOM DXF，或将完整原始项目导出为 JSON。摇杆上/下切换格式；选择单独的“导出”按钮。',
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
  'translate.pickAny': { en: 'PICK X OR Y EDGE', fr: 'CHOISIR BORD X OU Y', zh: '选择 X 或 Y 边' },
  'translate.pickX': { en: 'PICK X EDGE', fr: 'CHOISIR BORD X', zh: '选择 X 边' },
  'translate.pickY': { en: 'PICK Y EDGE', fr: 'CHOISIR BORD Y', zh: '选择 Y 边' },
  'translate.setX': { en: 'DISTANCE FROM X ORIGIN', fr: 'DISTANCE DEPUIS ORIGINE X', zh: '距 X 原点距离' },
  'translate.setY': { en: 'DISTANCE FROM Y ORIGIN', fr: 'DISTANCE DEPUIS ORIGINE Y', zh: '距 Y 原点距离' },
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
  'marker.outlet_shutter': { en: 'shutter outlet', fr: 'prise volet', zh: '卷帘插座' },
  'marker.outlet_aircon': { en: 'aircon supply', fr: 'alimentation clim.', zh: '空调供应' },
  'marker.dedicatedCircuit': { en: 'dedicated circuit', fr: 'circuit dédié', zh: '专用回路' },
  'marker.outlet_cooktop': { en: 'cooktop', fr: 'plaque de cuisson', zh: '灶台' },
  'marker.outlet_oven': { en: 'oven', fr: 'four', zh: '烤箱' },
  'marker.outlet_water_heater': { en: 'water heater', fr: 'chauffe-eau', zh: '热水器' },
  'marker.outlet_appliance': { en: 'appliance outlet', fr: 'prise électroménager', zh: '家电专用插座' },
  'marker.intercom': { en: 'intercom', fr: 'interphone', zh: '对讲机' },
  'marker.panel':    { en: 'panel',    fr: 'tableau',      zh: '配电箱' },
  'marker.switch':   { en: 'switch',   fr: 'interrupteur', zh: '开关' },
  'marker.light':    { en: 'light',    fr: 'luminaire',    zh: '灯' },
  'marker.ethernet': { en: 'ethernet', fr: 'réseau',       zh: '网口' },
  'marker.ethernet_dual': { en: 'dual ethernet', fr: 'double réseau', zh: '双网口' },
  'marker.camera_ethernet': { en: 'camera ethernet', fr: 'caméra ethernet', zh: '以太网摄像头' },
  'marker.patch_panel': { en: 'patch panel', fr: 'panneau de brassage', zh: '配线架' },
  'marker.height':   { en: 'height',   fr: 'hauteur',      zh: '高度' },
  'link.pickSwitch': { en: 'PICK SWITCH', fr: 'CHOISIR INTERRUPTEUR', zh: '选择开关' },
  'link.pickLight':  { en: 'PICK LIGHT',  fr: 'CHOISIR LUMINAIRE',    zh: '选择灯具' },
  'wire.pickStart':  { en: 'PICK START',  fr: 'CHOISIR DÉBUT',        zh: '选择起点' },
  'wire.pickEnd':    { en: 'PICK END',    fr: 'CHOISIR FIN',          zh: '选择终点' },
  'wire.override':   { en: 'VIA',         fr: 'VIA',                  zh: '经由' },
  'conduit.pickStart': { en: 'START PEN', fr: 'DÉBUT TRACÉ',        zh: '落笔' },
  'conduit.run':     { en: 'RUN CONDUIT', fr: 'TIRER GAINE',        zh: '布管' },
  'conduit.node':    { en: 'node',       fr: 'nœud',                zh: '节点' },
  'conduit.pickNode': { en: 'PICK NODE', fr: 'CHOISIR NŒUD',       zh: '选择节点' },
  'conduit.editNode': { en: 'EDIT NODE', fr: 'MODIF. NŒUD',        zh: '编辑节点' },
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

// The change-map legend/label templates for the current language, as a plain object
// the (i18n-agnostic) plan sheet interpolates. Pass as opts.revLabels so the diff
// text follows the UI language in Print/SVG/PNG and the AR preview alike.
export function revLabels() {
  const keys = ['title', 'zoneAdded', 'zoneRemoved', 'zoneRetyped', 'zoneResized', 'zoneMoved',
    'zoneChanged', 'markerAdded', 'markerRemoved', 'markerMoved', 'markerRetyped',
    'dimChanged', 'dimAdded', 'dimRemoved'];
  return Object.fromEntries(keys.map((k) => [k, t(`rev.${k}`)]));
}

// Built-in floor names remain stable model data for save compatibility. Translate
// only their presentation; a user-renamed floor passes through verbatim.
export function localizedFloorName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (normalized === 'ground' || normalized === 'ground floor') return t('floor.ground');
  if (normalized === 'upper' || normalized === 'upper floor') return t('floor.upper');
  if (normalized === 'basement') return t('floor.basement');
  return name;
}
