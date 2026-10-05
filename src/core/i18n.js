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
  'group.material': { en: 'MATERIAL', fr: 'MATÉRIAU', zh: '材料' },
  'group.heating': { en: 'HEATING', fr: 'CHAUFFAGE', zh: '供暖' },
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
  'mode.passage':  { en: 'PASSAGE', fr: 'PASSAGE', zh: '通道' },
  'mode.garage':   { en: 'GARAGE DOOR', fr: 'PORTE GARAGE', zh: '车库门' },
  'mode.halfwall': { en: 'HALF WALL', fr: 'DEMI-MUR', zh: '矮墙' },
  'mode.heater': { en: 'HEATER', fr: 'RADIATEUR', zh: '暖气' },
  'mode.sliding':  { en: 'SLIDING', fr: 'COULISSANT', zh: '推拉门' },
  'mode.window':   { en: 'WINDOW', fr: 'FENÊTRE',  zh: '窗' },
  'mode.recess':   { en: 'RECESS', fr: 'EMBRASURE', zh: '窗洞' },
  'mode.stairs_up':   { en: 'STAIRS UP', fr: 'ESCALIER MONTANT', zh: '上行楼梯' },
  'mode.stairs_down': { en: 'STAIRS DOWN', fr: 'ESCALIER DESCENDANT', zh: '下行楼梯' },
  'mode.cabinet':  { en: 'CABINET', fr: 'PLACARD', zh: '柜子' },
  'mode.furniture': { en: 'FURNITURE', fr: 'MOBILIER', zh: '家具' },
  'mode.edge':     { en: 'EDGE',   fr: 'BORD',     zh: '边' },
  'mode.edit':     { en: 'EDIT',   fr: 'MODIF.',   zh: '编辑' },
  'mode.translate': { en: 'TRANSLATE', fr: 'TRANSLATION', zh: '平移' },
  'mode.marker':   { en: 'EDIT',   fr: 'MODIF.',   zh: '编辑' },
  'mode.marker_link': { en: 'LINK', fr: 'LIER',     zh: '连接' },
  'mode.marker_wire': { en: 'WIRE', fr: 'CÂBLE',    zh: '布线' },
  'mode.circuit_check': { en: 'CHECK', fr: 'CONTRÔLE', zh: '检查' },
  'mode.marker_pipe': { en: 'PIPE', fr: 'TUYAU', zh: '水管' },
  'mode.marker_conduit': { en: 'CONDUIT', fr: 'GAINE', zh: '管路' },
  'mode.conduit_dims': { en: 'CONDUIT DIMS', fr: 'COTES GAINE', zh: '管路尺寸' },
  'mode.conduit_edit': { en: 'CONDUIT EDIT', fr: 'MODIF. GAINE', zh: '编辑管路' },
  'mode.mat_floor': { en: 'FLOOR', fr: 'SOL', zh: '地面' },
  'mode.mat_wall':  { en: 'WALL',  fr: 'MUR', zh: '墙面' },
  'mode.mat_door':  { en: 'DOOR',  fr: 'PORTE', zh: '门' },
  'mode.mat_window': { en: 'WINDOW', fr: 'FENÊTRE', zh: '窗' },
  'mode.mat_furniture': { en: 'FURNITURE', fr: 'MOBILIER', zh: '家具' },
  'mode.mat_switch': { en: 'SWITCH', fr: 'INTERRUPTEUR', zh: '开关' },
  'mode.mat_outlet': { en: 'OUTLET', fr: 'PRISE', zh: '插座' },
  'mode.mat_ethernet': { en: 'ETHERNET', fr: 'RÉSEAU', zh: '网口' },
  'mode.recal':    { en: 'RECAL',  fr: 'RECAL',    zh: '校准' },
  'mode.plan_dims':   { en: 'DIMS', fr: 'COTES', zh: '尺寸' },
  'mode.outlet_dims': { en: 'DIMS', fr: 'COTES', zh: '尺寸' },
  'mode.save':     { en: 'SAVE',   fr: 'ENREG.',   zh: '保存' },
  'mode.load':     { en: 'LOAD',   fr: 'CHARGER',  zh: '加载' },
  // Shown head-locked when the controllers are set down and the headset falls back
  // to hand tracking (unsupported — the survey UI is controller-only).
  'controllers.pickUp':   { en: 'Pick up your controllers', fr: 'Reprenez vos manettes', zh: '请拿起手柄' },
  'controllers.handMode': { en: 'Hand tracking is not supported', fr: 'Le suivi des mains n’est pas pris en charge', zh: '不支持手部追踪' },
  'mode.export':   { en: 'EXPORT', fr: 'EXPORT',    zh: '导出' },
  'mode.heat':     { en: 'HEAT LOSS', fr: 'DÉPERDITIONS', zh: '热损失' },
  'mode.heat_r':   { en: 'R / U', fr: 'R / U', zh: 'R / U 值' },
  'mode.copy_floor': { en: 'COPY FLOOR', fr: 'COPIER ÉTAGE', zh: '复制楼层' },
  'mode.paste_floor': { en: 'PASTE FLOOR', fr: 'COLLER ÉTAGE', zh: '粘贴楼层' },
  'mode.move_up':  { en: 'MOVE UP', fr: 'MONTER',   zh: '上移' },
  'mode.move_down': { en: 'MOVE DOWN', fr: 'DESCENDRE', zh: '下移' },
  'mode.unit':     { en: 'UNIT',   fr: 'UNITÉ',     zh: '单位' },
  'mode.lang':     { en: 'LANG',   fr: 'LANGUE',   zh: '语言' },
  'mode.perf':     { en: 'PERF',   fr: 'PERF',     zh: '性能' },
  'perf.on':       { en: 'ON',     fr: 'ACTIF',    zh: '开' },
  'perf.off':      { en: 'OFF',    fr: 'INACTIF',  zh: '关' },

  // --- plan sheet ------------------------------------------------------------
  'sheet.generated': { en: 'Generated', fr: 'Généré', zh: '生成日期' },
  'sheet.build': { en: 'Build', fr: 'Version', zh: '构建版本' },
  'sheet.revision': { en: 'Rev', fr: 'Rév', zh: '版本' },

  // --- change map (change clouds) — templates; {kind}/{name}/{from}/{to}/{value}/{unit}
  //     are interpolated by planSheet.js (which owns unit display).
  'rev.title':        { en: 'CHANGES', fr: 'CHANGEMENTS', zh: '变更' },
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
  'floor.ground': { en: 'Ground floor', fr: 'Rez-de-chaussée', zh: '底层' },
  'floor.upper': { en: 'Upper floor', fr: 'Étage', zh: '上层' },
  'floor.basement': { en: 'Basement', fr: 'Sous-sol', zh: '地下室' },
  'export.active': { en: 'Active', fr: 'Actif', zh: '当前楼层' },
  'export.format': { en: 'FORMAT', fr: 'FORMAT', zh: '格式' },
  'export.planDims': { en: 'PLAN DIMS', fr: 'COTES PLAN', zh: '平面尺寸' },
  'export.markerDims': { en: 'MARKER DIMS', fr: 'COTES MARQUEURS', zh: '标记尺寸' },
  'export.markerIcons': { en: 'MARKER ICONS', fr: 'ICÔNES MARQUEURS', zh: '标记图标' },
  'export.wiring': { en: 'CONDUIT / WIRE', fr: 'GAINE / CÂBLE', zh: '管路/布线' },
  'export.furniture': { en: 'FURNITURE', fr: 'MOBILIER', zh: '家具' },
  'export.furnitureDims': { en: 'FURNITURE DIMS', fr: 'COTES MOBILIER', zh: '家具尺寸' },
  'export.area': { en: 'AREA', fr: 'SURFACE', zh: '面积' },
  'export.action': { en: 'EXPORT', fr: 'EXPORTER', zh: '导出' },
  'export.compare': { en: 'COMPARE', fr: 'COMPARER', zh: '对比' },
  'export.language': { en: 'LANGUAGE', fr: 'LANGUE', zh: '语言' },
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
    en: 'Thumbstick up/down picks the plan type, including STAIRS UP and STAIRS DOWN. All except ROOM subtract for now. Trigger drops the box where you stand.',
    fr: 'Joystick haut/bas : choisissez le type du plan, dont ESCALIER MONTANT et DESCENDANT. Tous sauf PIÈCE soustraient pour l’instant. La gâchette pose le bloc.',
    zh: '摇杆上/下选择平面类型，包括上行楼梯和下行楼梯。除房间外目前均执行减去。扣动扳机放置该盒。',
  },
  'help.edge': {
    en: 'Aim at an edge and trigger to lock it, then touch the real wall to snap it there. Grip cancels a lock.',
    fr: 'Visez un bord et gâchette pour le verrouiller, puis touchez le mur réel pour l’y aligner. La poignée annule.',
    zh: '瞄准一条边并扣动扳机锁定，再触碰真实墙面将其贴合。握把取消锁定。',
  },
  'help.edit': {
    en: 'Edit the plan only. With nothing selected, grip cycles overlapping zones and trigger confirms the yellow target. B/Y deletes; thumbstick up/down changes type; trigger again deselects.',
    fr: 'Modifiez seulement le plan. Sans sélection, la poignée parcourt les zones superposées et la gâchette valide la cible jaune. B/Y supprime ; joystick haut/bas change le type ; une nouvelle gâchette désélectionne.',
    zh: '仅编辑平面。未选择时，握把循环重叠区域，扳机确认黄色目标。B/Y 删除；摇杆上/下更改类型；再次扣动取消选择。',
  },
  'help.translate': {
    en: 'Relocate the active floor rigidly. Pick an X edge and a Y edge, entering each desired distance from origin. FLIP changes side; the complete floor moves only after both are set.',
    fr: 'Déplacez rigidement l’étage actif. Choisissez un bord X et un bord Y, puis entrez pour chacun la distance voulue à l’origine. INVERSER change de côté ; tout l’étage bouge après les deux saisies.',
    zh: '整体平移当前楼层。选择一条 X 方向边和一条 Y 方向边，并分别输入其到原点的目标距离。“翻转”可改变所在侧；两项均设定后才移动整个楼层。',
  },
  'help.marker': {
    en: 'Edit markers only. With nothing selected, grip cycles overlapping markers and trigger confirms the yellow target. Only a selected marker can be grip-dragged. Thumbstick up/down changes type; ENTER saves height; B/Y deletes. A double switch over a single switch at the same height: A/X merges them (the single becomes the right rocker).',
    fr: 'Modifiez seulement les marqueurs. Sans sélection, la poignée parcourt les marqueurs superposés et la gâchette valide la cible jaune. Seul un marqueur sélectionné se déplace avec poignée-glisser. Joystick haut/bas change le type ; VALIDER enregistre la hauteur ; B/Y supprime. Double interrupteur sur un simple à la même hauteur : A/X les fusionne (le simple devient la touche droite).',
    zh: '仅编辑标记。未选择时，握把循环重叠标记，扳机确认黄色目标。只有选中的标记可用握把拖动。摇杆上/下更改类型；确定保存高度；B/Y 删除。双联开关与同高度的单开关重叠时：A/X 合并（单开关成为右键）。',
  },
  'help.marker_link': {
    en: 'Link electrical controls. Grip cycles eligible overlapping switches or lights; trigger confirms the yellow target. Choose a switch, then toggle its lights. Double switch: thumbstick up/down picks the left or right rocker. Grip on empty space clears the switch.',
    fr: 'Reliez les commandes électriques. La poignée parcourt les interrupteurs ou luminaires superposés ; la gâchette valide la cible jaune. Choisissez un interrupteur puis activez ses luminaires. Double interrupteur : joystick haut/bas choisit la touche gauche ou droite. Poignée dans le vide : effacer la sélection.',
    zh: '连接电气控制。握把循环符合条件的重叠开关或灯具；扳机确认黄色目标。先选择开关，再切换其灯具。双联开关：摇杆上/下选择左键或右键。在空处按握把可清除开关。',
  },
  'help.marker_wire': {
    en: 'Route a wire over the conduit network. Thumbstick up/down chooses electrical or Ethernet. Grip cycles overlapping endpoints or existing wires; trigger confirms the yellow target. For a selected wire, trigger nodes to add optional vias, grip removes the last via, and B/Y deletes it. A wire ending on a double switch: A/X picks the left or right rocker it lands on (each rocker may be on its own circuit).',
    fr: 'Faites cheminer un câble dans les gaines. Joystick haut/bas choisit électrique ou Ethernet. La poignée parcourt les extrémités ou câbles superposés ; la gâchette valide la cible jaune. Pour un câble sélectionné, les nœuds ajoutent des VIA, la poignée retire le dernier et B/Y le supprime. Câble aboutissant à un double interrupteur : A/X choisit la touche gauche ou droite (chaque touche peut être sur son propre circuit).',
    zh: '让线路沿管路网络走线。摇杆上/下选择电力或以太网。握把循环重叠端点或已有线路；扳机确认黄色目标。线路选中后，选择节点添加经由点，握把移除最后一个，B/Y 删除。线路接在双联开关上：A/X 选择左键或右键（每个键可属于不同回路）。',
  },
  'help.circuit_check': {
    en: 'Read-only circuit check. Rings flag devices: red = two breakers tied together, orange = wired but no breaker, white = outlet/switch/light with no wire. Thumbstick up/down filters one problem; aim at a ring to name it.',
    fr: 'Contrôle des circuits, lecture seule. Anneaux : rouge = deux disjoncteurs reliés, orange = câblé sans disjoncteur, blanc = prise/interrupteur/luminaire sans câble. Joystick haut/bas filtre un problème ; visez un anneau pour le nommer.',
    zh: '只读回路检查。圆环标记设备：红 = 两个断路器相连，橙 = 已布线但无断路器，白 = 未布线的插座/开关/灯。摇杆上/下筛选问题；瞄准圆环查看说明。',
  },
  'help.marker_pipe': {
    en: 'Author a plumbing node graph. Thumbstick up/down chooses cold, hot, heating supply, or return. Trigger a fixture, node, or empty space to run the pipe; grip cycles targets or lifts the pen. B/Y deletes a selected segment or the current free node.',
    fr: 'Tracez un réseau de plomberie à nœuds. Joystick haut/bas : eau froide, eau chaude, départ ou retour chauffage. Gâchette sur appareil, nœud ou espace vide pour prolonger ; poignée pour parcourir les cibles ou lever le tracé. B/Y supprime le segment sélectionné.',
    zh: '绘制节点式管道网络。摇杆上/下选择冷水、热水、供暖供水或回水。扣动设备、节点或空白处来延伸管道；握把循环目标或抬笔。B/Y 删除选中的管段。',
  },
  'help.marker_conduit': {
    en: 'Build the whole-house conduit network. In ALL FLOORS, every storey is pickable for risers. The nearest device or node under the reticle is highlighted; grip cycles overlaps without drawing, and trigger commits the highlighted target. Trigger empty space to drop a junction; trigger an existing run to branch from it (T-junction at the run\'s height). B/Y undoes the last step. Grip on empty space lifts the pen.',
    fr: 'Construisez le réseau de gaines. Dans TOUS LES ÉTAGES, chaque niveau est sélectionnable pour créer les colonnes. L’appareil ou nœud le plus proche sous le réticule est surligné ; la poignée parcourt les chevauchements sans tracer, puis la gâchette valide la cible. Gâchette dans le vide : poser une jonction ; gâchette sur une gaine existante : y brancher un T (à la hauteur de la gaine). B/Y annule la dernière étape. Poignée dans le vide : lever le tracé.',
    zh: '构建整屋管路网络。在“所有楼层”中，每层均可选取以创建立管。准星内最近的设备或节点会高亮；握把只循环选择重叠目标，扳机才确认目标。对空处扣动可放置接头；对已有管路扣动可从其分支（在该管路高度形成 T 形接头）。B/Y 撤销上一步。在空处按握把可抬笔。',
  },
  'help.conduit_dims': {
    en: 'Dimension a conduit junction to a wall so it tracks that wall on every edit. Trigger a bare junction to pick it, then trigger a wall edge; the numpad sets the distance (A/X flips the side, B/Y removes the pin). Grip cycles vertically stacked junctions before picking. Pin X and Y separately for a full lock. Marker-bound nodes are inert here — they follow their device.',
    fr: 'Cotez une jonction de gaine par rapport à un mur pour qu’elle le suive à chaque modification. Gâchette sur une jonction libre pour la choisir, puis gâchette sur un bord de mur ; le pavé numérique règle la distance (A/X inverse le côté, B/Y retire la cote). La saisie fait défiler les jonctions empilées verticalement avant le choix. Épinglez X et Y séparément pour un verrouillage complet. Les nœuds liés à un appareil sont inertes ici — ils suivent celui-ci.',
    zh: '将管路接头相对某面墙标注尺寸，使其在每次编辑时都跟随该墙。对自由接头扣动扳机以选取，再对墙边扣动扳机；数字键盘设定距离（A/X 翻转方向，B/Y 删除该尺寸）。选取前，握把可在垂直堆叠的接头间循环。分别锁定 X 和 Y 以完全固定。绑定到设备的节点在此为惰性——它们跟随该设备。',
  },
  'help.conduit_edit': {
    en: 'Edit the conduit network. With nothing selected, grip cycles overlapping nodes and conduit segments; trigger selects the yellow target. A selected free node can be grip-dragged (near = 3D, far = floor reticle) or deleted with B/Y. B/Y deletes a selected conduit segment. Trigger again deselects. Marker-bound nodes cannot move.',
    fr: 'Modifiez le réseau de gaines. Sans sélection, la poignée parcourt les nœuds et gaines superposés ; la gâchette sélectionne la cible jaune. Une jonction libre sélectionnée se déplace avec poignée-glisser (près = 3D, loin = réticule sol) ou se supprime avec B/Y. B/Y supprime une gaine sélectionnée. Une nouvelle gâchette désélectionne.',
    zh: '编辑管路网络。未选择时，握把循环选择重叠的节点和管段；扳机选择黄色目标。选中的自由节点可用握把拖动（近=三维，远=地面准星）或按 B/Y 删除。B/Y 删除选中的管段。再次扣动可取消选择。绑定设备的节点不可移动。',
  },
  'help.mat_floor': {
    en: 'Choose a floor finish. Trigger selects the room under the reticle; thumbstick up/down cycles its material (none first); B/Y clears it. Rooms with the same material through a doorway are laid as one. A/X near a corner starts the pattern at that corner (amber L); A/X on that corner again returns it to the plan origin. A/X away from the corners turns the pattern 90° (↻90°). The readout shows the pieces for this floor and the packs for the whole house.',
    fr: 'Choisissez un revêtement de sol. Gâchette : sélectionner la pièce visée ; joystick haut/bas : faire défiler le matériau (aucun d’abord) ; B/Y l’efface. Les pièces de même matériau reliées par une porte sont posées d’un seul tenant. A/X près d’un angle fait partir le calepinage de cet angle (L orange) ; A/X sur ce même angle le ramène à l’origine du plan. A/X loin des angles tourne le calepinage de 90° (↻90°). Le panneau affiche les pièces pour ce sol et les paquets pour toute la maison.',
    zh: '选择地面材料。扳机选择准星下的房间；摇杆上/下循环材料（首项为无）；B/Y 清除。通过门相连且材料相同的房间按一整块铺设。在墙角附近按 A/X 让铺贴从该墙角开始（橙色 L 形）；在同一墙角再按 A/X 则恢复为平面原点。远离墙角按 A/X 将铺贴旋转 90°（↻90°）。读数显示本地面的块数和全屋的包数。',
  },
  'help.mat_wall': {
    en: 'Choose a wall finish, one face at a time. Trigger selects the wall nearest the reticle; thumbstick up/down cycles its material; B/Y clears it. Door and window openings are deducted.',
    fr: 'Choisissez un revêtement mural, face par face. Gâchette : sélectionner le mur le plus proche du réticule ; joystick haut/bas : faire défiler le matériau ; B/Y l’efface. Les portes et fenêtres sont déduites.',
    zh: '逐面选择墙面材料。扳机选择离准星最近的墙；摇杆上/下循环材料；B/Y 清除。门窗洞口已扣除。',
  },
  'help.mat_door': {
    en: 'Choose a door product for a DOOR zone. Trigger selects the door under the reticle; thumbstick up/down cycles the product (none first); B/Y clears it. Made-to-measure: the door takes the zone\'s width and head height, hinge and swing. A SLIDING zone takes the rail-hung doors (fixed leaf size; the rail on the zone\'s swing face, sliding toward its hinge end). Shown in the 3D view (LEFT X).',
    fr: 'Choisissez un modèle de porte pour une zone PORTE. Gâchette : sélectionner la porte visée ; joystick haut/bas : faire défiler le modèle (aucun d’abord) ; B/Y l’efface. Sur mesure : la porte prend la largeur, la hauteur, les paumelles et le sens d’ouverture de la zone. Une zone COULISSANTE prend les portes sur rail (vantail de taille fixe ; rail sur la face d’ouverture de la zone, coulissant vers son côté paumelles). Visible dans la vue 3D (GAUCHE X).',
    zh: '为门区域选择门款。扳机选择准星下的门；摇杆上/下循环门款（首项为无）；B/Y 清除。按尺寸定制：门采用该区域的宽度、门头高度、铰链和开启方向。推拉门区域使用轨道吊门（门扇尺寸固定；轨道位于区域的开启面，向铰链端滑动）。在三维视图中显示（左 X）。',
  },
  'help.mat_window': {
    en: 'Choose a window product for a WINDOW zone. Trigger selects the window under the reticle; thumbstick up/down cycles the product (none first); B/Y clears it. Made-to-measure: the window takes the zone\'s width, sill and head; its hinge picks the leaves (both = two leaves). Shown in the 3D view (LEFT X).',
    fr: 'Choisissez un modèle de fenêtre pour une zone FENÊTRE. Gâchette : sélectionner la fenêtre visée ; joystick haut/bas : faire défiler le modèle (aucun d’abord) ; B/Y l’efface. Sur mesure : la fenêtre prend la largeur, l’allège et la hauteur de la zone ; ses paumelles choisissent les vantaux (des deux côtés = deux vantaux). Visible dans la vue 3D (GAUCHE X).',
    zh: '为窗区域选择窗款。扳机选择准星下的窗；摇杆上/下循环窗款（首项为无）；B/Y 清除。按尺寸定制：窗采用该区域的宽度、窗台和窗头高度；铰链决定扇数（两侧 = 双扇）。在三维视图中显示（左 X）。',
  },
  'help.mat_switch': {
    en: 'Choose a switch product for a switch. Trigger selects the switch under the reticle; where switches overlap (a double switch is two markers), grip cycles them first. Thumbstick up/down cycles the product (none first); B/Y clears it; grip deselects. Shown in the 3D view (LEFT X).',
    fr: 'Choisissez un modèle pour un interrupteur. Gâchette : sélectionner l’interrupteur visé ; s’ils se superposent (un double interrupteur = deux repères), grip les fait défiler d’abord. Joystick haut/bas : faire défiler le modèle (aucun d’abord) ; B/Y l’efface ; grip désélectionne. Visible dans la vue 3D (GAUCHE X).',
    zh: '为开关选择型号。扳机选择准星下的开关；开关重叠时（双联开关为两个标记），先用握把循环。摇杆上/下循环型号（首项为无）；B/Y 清除；握把取消选择。在三维视图中显示（左 X）。',
  },
  'help.mat_outlet': {
    en: 'Choose an outlet product for an outlet. Trigger selects the outlet under the reticle; where outlets overlap, grip cycles them first. Thumbstick up/down cycles the product (none first); B/Y clears it; grip deselects. Shown in the 3D view (LEFT X).',
    fr: 'Choisissez un modèle pour une prise. Gâchette : sélectionner la prise visée ; si elles se superposent, grip les fait défiler d’abord. Joystick haut/bas : faire défiler le modèle (aucun d’abord) ; B/Y l’efface ; grip désélectionne. Visible dans la vue 3D (GAUCHE X).',
    zh: '为插座选择型号。扳机选择准星下的插座；插座重叠时先用握把循环。摇杆上/下循环型号（首项为无）；B/Y 清除；握把取消选择。在三维视图中显示（左 X）。',
  },
  'help.mat_ethernet': {
    en: 'Choose a socket product for an Ethernet socket. Trigger selects the socket under the reticle; where sockets overlap, grip cycles them first. Thumbstick up/down cycles the product (none first); B/Y clears it; grip deselects. Shown in the 3D view (LEFT X).',
    fr: 'Choisissez un modèle pour une prise réseau. Gâchette : sélectionner la prise visée ; si elles se superposent, grip les fait défiler d’abord. Joystick haut/bas : faire défiler le modèle (aucun d’abord) ; B/Y l’efface ; grip désélectionne. Visible dans la vue 3D (GAUCHE X).',
    zh: '为网口选择型号。扳机选择准星下的网口；网口重叠时先用握把循环。摇杆上/下循环型号（首项为无）；B/Y 清除；握把取消选择。在三维视图中显示（左 X）。',
  },
  'help.mat_furniture': {
    en: 'Choose the product for a FURNITURE zone. Trigger selects the zone under the reticle; thumbstick up/down cycles the product (none first); A/X turns it 90°; B/Y clears it. The zone takes the product\'s size; a dimension that no longer fits is removed. Shown in the 3D view (LEFT X).',
    fr: 'Choisissez le produit d’une zone MOBILIER. Gâchette : sélectionner la zone visée ; joystick haut/bas : faire défiler le produit (aucun d’abord) ; A/X le tourne de 90° ; B/Y l’efface. La zone prend la taille du produit ; une cote qui ne tient plus est supprimée. Visible dans la vue 3D (GAUCHE X).',
    zh: '为家具区域选择产品。扳机选择准星下的区域；摇杆上/下循环产品（首项为无）；A/X 旋转 90°；B/Y 清除。区域采用产品尺寸；不再适配的尺寸会被删除。在三维视图中显示（左 X）。',
  },
  'help.recal': {
    en: 'Fix drift. Pick the corner and wall 1, then touch 1 farther away and 2 toward the corner on wall 1; touch 3 on wall 2.',
    fr: 'Corrige la dérive. Choisissez le coin et le mur 1, puis touchez 1 au plus loin et 2 vers le coin sur le mur 1 ; touchez 3 sur le mur 2.',
    zh: '修正漂移。选择墙角和墙1，然后在墙1上先触碰远处的点1，再向墙角触碰点2；最后在墙2上触碰点3。',
  },
  'help.plan_dims': {
    en: 'Plan dimensions only. Pick two compatible edges, or an edge and the origin, then type the distance. Marker icons are inert.',
    fr: 'Cotes du plan uniquement. Choisissez deux bords compatibles, ou un bord et l’origine, puis tapez la distance. Les icônes de marqueurs sont inertes.',
    zh: '仅编辑平面尺寸。选择两条兼容的边，或一条边与原点，再输入距离。标记图标在此模式下无效。',
  },
  'help.outlet_dims': {
    en: 'Marker dimensions only. Pick a marker floor icon first, then a plan edge and type the distance (0 = on wall). Grip cycles vertically stacked markers before picking. The wall marker highlights too.',
    fr: 'Cotes des marqueurs uniquement. Choisissez d’abord l’icône au sol, puis un bord du plan et tapez la distance (0 = au mur). La saisie fait défiler les marqueurs empilés verticalement avant le choix. Le marqueur mural est aussi surligné.',
    zh: '仅编辑标记尺寸。先选择标记地面图标，再选择平面边并输入距离（0 = 贴墙）。选取前，握把可在垂直堆叠的标记间循环。对应的墙上标记也会高亮。',
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
  'help.heat': {
    en: 'Each room of the active floor shows its heat loss in W at the design temperatures. Aim at a row and flick the thumbstick up/down to change it; trigger toggles HEATED or resets a value. Aim at a room for its breakdown. Each insulation zone\'s R and opening\'s U: HEATING · R / U.',
    fr: 'Chaque pièce de l’étage actif affiche ses déperditions en W aux températures de base. Visez une ligne et poussez le joystick haut/bas pour la modifier ; la gâchette bascule CHAUFFÉ ou rétablit une valeur. Visez une pièce pour son détail. R de chaque isolant et U de chaque ouverture : CHAUFFAGE · R / U.',
    zh: '当前楼层的每个房间显示设计温度下的热损失（W）。指向一行并上/下推摇杆修改；扳机切换“供暖”或恢复默认值。指向房间查看明细。各保温区 R 值与门窗 U 值：供暖 · R / U。',
  },
  'help.heat_r': {
    en: 'Each insulation zone of the active floor shows its R and each window/door its U (orange = typed from the label, grey ≈ default). Aim at one and trigger to type it (a window label gives Uw); CLEAR returns to the default. Draw exterior insulation as a zone outside the room.',
    fr: 'Chaque isolant de l’étage actif affiche son R, chaque fenêtre/porte son U (orange = saisi depuis l’étiquette, gris ≈ défaut). Visez-en un et appuyez sur la gâchette pour le saisir (une fenêtre indique son Uw) ; EFFACER revient au défaut. Dessinez l’isolation extérieure comme une zone hors de la pièce.',
    zh: '当前楼层的每个保温区显示其 R 值，每个门窗显示其 U 值（橙色 = 按标签输入，灰色 ≈ 默认）。指向一个并扣动扳机输入（窗户标签上为 Uw）；“清除”恢复默认。外保温请画在房间外侧。',
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
  'help.perf': {
    en: 'Trigger to start or stop the performance sweep. Hold a view about 20 s: the info panel lists what each overlay layer costs per frame, in ms. It keeps running in other modes.',
    fr: 'Gâchette pour lancer ou arrêter la mesure de performance. Gardez une vue environ 20 s : le panneau d’infos indique le coût de chaque calque par image, en ms. Elle continue dans les autres modes.',
    zh: '扣动扳机开始或停止性能测量。保持视角约 20 秒：信息面板列出每个叠加图层每帧的耗时（毫秒）。切换到其他模式时仍继续运行。',
  },
  'help.lang': {
    en: 'Push the thumbstick up/down to change language. Applies everywhere at once.',
    fr: 'Poussez le joystick haut/bas pour changer de langue. S’applique partout aussitôt.',
    zh: '上下推动摇杆以切换语言。立即在各处生效。',
  },

  // --- transient mode labels --------------------------------------------------
  'lbl.wall2':   { en: 'WALL 2', fr: 'MUR 2', zh: '墙2' },
  'lbl.perp':    { en: 'PERP',   fr: 'PERP',  zh: '垂直墙' },
  'lbl.recalP1': { en: '1 · FARTHER ON WALL 1', fr: '1 · PLUS LOIN SUR MUR 1', zh: '1 · 墙1远处' },
  'lbl.recalP2': { en: '2 · TOWARD CORNER', fr: '2 · VERS LE COIN', zh: '2 · 朝墙角' },
  'lbl.recalP3': { en: '3 · ON WALL 2', fr: '3 · SUR MUR 2', zh: '3 · 墙2上' },
  'lbl.snap':    { en: 'SNAP TO WALL', fr: 'ALIGNER AU MUR', zh: '贴到墙面' },

  // --- numpad keys ------------------------------------------------------------
  'key.enter': { en: 'ENTER',   fr: 'VALIDER',   zh: '确定' },
  'key.del':   { en: '🗑 DEL',  fr: '🗑 SUPPR',  zh: '🗑 删除' },
  'key.flip':  { en: '⇄ FLIP',  fr: '⇄ INVERSER', zh: '⇄ 翻转' },

  // --- aperture sill/head editor (PLAN EDIT) ----------------------------------
  'aperture.sill': { en: 'sill', fr: 'seuil',   zh: '下沿' },
  'aperture.head': { en: 'head', fr: 'linteau', zh: '上沿' },
  // --- furniture band (PLAN EDIT placeholder) + foot elevation (FURNISH) -------
  'furniture.foot': { en: 'foot', fr: 'pied',    zh: '底' },
  'furniture.top':  { en: 'top',  fr: 'sommet',  zh: '顶' },
  // --- vertical height pads (floor-referenced; free = undefined height) ---
  'z.floor':   { en: 'floor',   fr: 'sol',     zh: '地面' },
  'z.free':    { en: 'free',    fr: 'libre',   zh: '自由' },

  // --- DIMS dimension title ---------------------------------------------------
  'dim.pickPlan':   { en: 'pick edge / origin', fr: 'bord / origine', zh: '选择 边/原点' },
  'dim.pickOutlet': { en: 'pick marker floor icon', fr: 'icône de marqueur au sol', zh: '选择标记地面图标' },
  'dim.pickNode':   { en: 'pick conduit junction', fr: 'jonction de gaine', zh: '选择管路接头' },
  'dim.edit':     { en: '(edit)', fr: '(modif.)', zh: '（编辑）' },
  'dim.conflict': { en: '!CONFLICT', fr: '!CONFLIT', zh: '！冲突' },
  'translate.pickAny': { en: 'PICK X OR Y EDGE', fr: 'CHOISIR BORD X OU Y', zh: '选择 X 或 Y 边' },
  'translate.pickX': { en: 'PICK X EDGE', fr: 'CHOISIR BORD X', zh: '选择 X 边' },
  'translate.pickY': { en: 'PICK Y EDGE', fr: 'CHOISIR BORD Y', zh: '选择 Y 边' },
  'translate.setX': { en: 'DISTANCE FROM X ORIGIN', fr: 'DISTANCE DEPUIS ORIGINE X', zh: '距 X 原点距离' },
  'translate.setY': { en: 'DISTANCE FROM Y ORIGIN', fr: 'DISTANCE DEPUIS ORIGINE Y', zh: '距 Y 原点距离' },
  'ref.origin':   { en: 'ORIGIN', fr: 'ORIGINE', zh: '原点' },
  'ref.node':     { en: 'JUNCTION', fr: 'JONCTION', zh: '接头' },
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
  'level.slab':        { en: 'slab', fr: 'dalle', zh: '楼板' },
  'level.ceiling':     { en: 'ceiling', fr: 'plafond', zh: '净高' },
  'key.slab':          { en: '⇄ SLAB', fr: '⇄ DALLE', zh: '⇄ 楼板' },
  'key.storey':        { en: '⇄ STOREY', fr: '⇄ ÉTAGE', zh: '⇄ 层高' },

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
  'marker.breaker':  { en: 'breaker',  fr: 'disjoncteur',  zh: '断路器' },
  'marker.radiator': { en: 'radiator', fr: 'radiateur', zh: '散热器' },
  'marker.boiler': { en: 'boiler', fr: 'chaudière', zh: '锅炉' },
  'marker.sink': { en: 'sink', fr: 'évier', zh: '水槽' },
  'marker.washing_machine': { en: 'washing machine', fr: 'lave-linge', zh: '洗衣机' },
  'marker.switch':   { en: 'switch',   fr: 'interrupteur', zh: '开关' },
  'marker.switch_dual': { en: 'double switch', fr: 'double interrupteur', zh: '双联开关' },
  'marker.mergePair': { en: 'A/X: MERGE THE SWITCH BELOW', fr: 'A/X : FUSIONNER L’INTERRUPTEUR DESSOUS', zh: 'A/X：合并下方开关' },
  'marker.light':    { en: 'light',    fr: 'luminaire',    zh: '灯' },
  'marker.ethernet': { en: 'ethernet', fr: 'réseau',       zh: '网口' },
  'marker.ethernet_dual': { en: 'dual ethernet', fr: 'double réseau', zh: '双网口' },
  'marker.tv_antenna': { en: 'TV antenna', fr: 'prise antenne TV', zh: '电视天线插座' },
  'marker.camera_ethernet': { en: 'camera ethernet', fr: 'caméra ethernet', zh: '以太网摄像头' },
  'marker.patch_panel': { en: 'patch panel', fr: 'panneau de brassage', zh: '配线架' },
  'marker.height':   { en: 'height',   fr: 'hauteur',      zh: '高度' },
  'pipe.service.cold': { en: 'COLD', fr: 'EAU FROIDE', zh: '冷水' },
  'pipe.service.hot': { en: 'HOT', fr: 'EAU CHAUDE', zh: '热水' },
  'pipe.service.heating_supply': { en: 'HEATING SUPPLY', fr: 'DÉPART CHAUFFAGE', zh: '供暖供水' },
  'pipe.service.heating_return': { en: 'HEATING RETURN', fr: 'RETOUR CHAUFFAGE', zh: '供暖回水' },
  'pipe.pickStart': { en: 'PICK START', fr: 'CHOISIR DÉPART', zh: '选择起点' },
  'pipe.pickEnd': { en: 'PICK END', fr: 'CHOISIR ARRIVÉE', zh: '选择终点' },
  'pipe.confirmMerge': { en: 'CONFIRM MERGE', fr: 'CONFIRMER FUSION', zh: '确认合并' },
  'link.pickSwitch': { en: 'PICK SWITCH', fr: 'CHOISIR INTERRUPTEUR', zh: '选择开关' },
  'link.pickLight':  { en: 'PICK LIGHT',  fr: 'CHOISIR LUMINAIRE',    zh: '选择灯具' },
  'link.rocker':     { en: 'ROCKER',      fr: 'TOUCHE',               zh: '按键' },
  'rocker.1':        { en: 'LEFT',        fr: 'GAUCHE',               zh: '左' },
  'rocker.2':        { en: 'RIGHT',       fr: 'DROITE',               zh: '右' },
  'wire.pickStart':  { en: 'PICK START',  fr: 'CHOISIR DÉBUT',        zh: '选择起点' },
  'wire.pickEnd':    { en: 'PICK END',    fr: 'CHOISIR FIN',          zh: '选择终点' },
  'wire.override':   { en: 'VIA',         fr: 'VIA',                  zh: '经由' },
  'wire.circuit':    { en: 'CIRCUIT',     fr: 'CIRCUIT',              zh: '回路' },
  'wire.shared':     { en: 'SHARED',      fr: 'PARTAGÉ',              zh: '共管' },
  'mat.none':      { en: 'NO MATERIAL', fr: 'AUCUN MATÉRIAU', zh: '无材料' },
  'mat.pickRoom':  { en: 'PICK ROOM',   fr: 'CHOISIR PIÈCE',  zh: '选择房间' },
  'mat.pickWall':  { en: 'PICK WALL',   fr: 'CHOISIR MUR',    zh: '选择墙面' },
  'mat.pickDoor':  { en: 'PICK DOOR',   fr: 'CHOISIR PORTE',  zh: '选择门' },
  'mat.pickWindow': { en: 'PICK WINDOW', fr: 'CHOISIR FENÊTRE', zh: '选择窗' },
  'mat.pickFurniture': { en: 'PICK FURNITURE', fr: 'CHOISIR MOBILIER', zh: '选择家具' },
  'mat.leaf':      { en: 'LEAF', fr: 'VANTAIL', zh: '门扇' },
  'mat.groutKg':   { en: 'kg grout', fr: 'kg joint', zh: 'kg 填缝剂' },
  'mat.fromCorner': { en: '⌞ CORNER', fr: '⌞ ANGLE', zh: '⌞ 墙角起铺' },
  'mat.furnitureTurn': { en: 'A/X: TURN 90°', fr: 'A/X : TOURNER 90°', zh: 'A/X：旋转 90°' },
  'dims.removed':  { en: 'DIM REMOVED', fr: 'COTE SUPPRIMÉE', zh: '已删除尺寸' },
  'mat.pickSwitch': { en: 'PICK SWITCH', fr: 'CHOISIR INTERRUPTEUR', zh: '选择开关' },
  'mat.pickOutlet': { en: 'PICK OUTLET', fr: 'CHOISIR PRISE', zh: '选择插座' },
  'mat.pickEthernet': { en: 'PICK ETHERNET', fr: 'CHOISIR PRISE RÉSEAU', zh: '选择网口' },
  'mat.leaves1':   { en: '1 LEAF',      fr: '1 VANTAIL',      zh: '单扇' },
  'mat.leaves2':   { en: '2 LEAVES',    fr: '2 VANTAUX',      zh: '双扇' },
  'mat.toMeasure': { en: 'MADE TO MEASURE', fr: 'SUR MESURE', zh: '定制尺寸' },
  'mat.pcs':       { en: 'pcs',         fr: 'pcs',            zh: '片' },
  'mat.cut':       { en: 'cut',         fr: 'coupés',         zh: '切割' },
  'mat.packs':     { en: 'packs',       fr: 'paquets',        zh: '包' },
  'mat.house':     { en: 'HOUSE',       fr: 'MAISON',         zh: '全屋' },
  'check.all':        { en: 'ALL ISSUES',  fr: 'TOUS PROBLÈMES',       zh: '全部问题' },
  'check.cross_tie':  { en: 'CROSS-TIE',   fr: 'DISJ. RELIÉS',         zh: '断路器互连' },
  'check.no_breaker': { en: 'NO BREAKER',  fr: 'SANS DISJONCTEUR',     zh: '无断路器' },
  'check.unwired':    { en: 'UNWIRED',     fr: 'NON CÂBLÉ',            zh: '未布线' },
  'check.ok':         { en: 'NO ISSUES',   fr: 'AUCUN PROBLÈME',       zh: '无问题' },
  'wire.type.electrical': { en: 'ELECTRICAL', fr: 'ÉLECTRIQUE', zh: '电力' },
  'wire.type.ethernet': { en: 'ETHERNET', fr: 'ETHERNET', zh: '以太网' },
  'conduit.pickStart': { en: 'START PEN', fr: 'DÉBUT TRACÉ',        zh: '落笔' },
  'conduit.run':     { en: 'RUN CONDUIT', fr: 'TIRER GAINE',        zh: '布管' },
  'conduit.node':    { en: 'node',       fr: 'nœud',                zh: '节点' },
  'conduit.segment': { en: 'conduit',    fr: 'gaine',               zh: '管段' },
  'wire.label':      { en: 'wire',       fr: 'câble',               zh: '线路' },
  'conduit.pickNode': { en: 'PICK NODE', fr: 'CHOISIR NŒUD',       zh: '选择节点' },
  'conduit.pickTarget': { en: 'PICK NODE / CONDUIT', fr: 'CHOISIR NŒUD / GAINE', zh: '选择节点 / 管段' },
  'conduit.editNode': { en: 'EDIT NODE', fr: 'MODIF. NŒUD',        zh: '编辑节点' },
  'conduit.length':   { en: 'LENGTH', fr: 'LONGUEUR', zh: '长度' },
  'conduit.runLength': { en: 'RUN', fr: 'PARCOURS', zh: '全段' },
  // PROJECT · HEAT LOSS panel rows (docs/heat-loss.md).
  'heat.floor':    { en: 'THIS FLOOR', fr: 'CET ÉTAGE', zh: '本楼层' },
  'heat.project':  { en: 'WHOLE HOUSE', fr: 'TOUTE LA MAISON', zh: '整栋房屋' },
  'heat.total':    { en: 'TOTAL', fr: 'TOTAL', zh: '合计' },
  'heat.heated':   { en: 'Heated', fr: 'Chauffé', zh: '供暖' },
  'heat.yes':      { en: 'yes', fr: 'oui', zh: '是' },
  'heat.no':       { en: 'no', fr: 'non', zh: '否' },
  'heat.temp':     { en: 'Unheated temp.', fr: 'Temp. non chauffé', zh: '非供暖温度' },
  'heat.floorR':   { en: 'Floor insulation R', fr: 'R isolant plancher', zh: '地面保温 R' },
  'heat.ceilingR': { en: 'Attic insulation R', fr: 'R isolant combles', zh: '阁楼保温 R' },
  'heat.tOut':     { en: 'Outdoor (design)', fr: 'Extérieur (base)', zh: '室外设计温度' },
  'heat.tRoom':    { en: 'Indoor', fr: 'Intérieur', zh: '室内温度' },
  'heat.ach':      { en: 'Air changes /h', fr: 'Renouvellement /h', zh: '换气次数 /h' },
  'heat.wallDepth': { en: 'Undrawn wall depth', fr: 'Épaisseur mur non dessiné', zh: '未绘墙厚' },
  'heat.wallLambda': { en: 'Wall λ (no R)', fr: 'λ mur (sans R)', zh: '墙体 λ（无 R）' },
  'heat.earth':    { en: 'Earth level (vs ground fl.)', fr: 'Niveau terrain (/ RDC)', zh: '室外地坪（相对首层）' },
  'heat.inEarth':  { en: 'walls in earth', fr: 'murs enterrés', zh: '地下墙' },
  'conflict.off':  { en: 'off by', fr: 'écart', zh: '偏差' },
  'conflict.suspects': { en: 'to remeasure', fr: 'à re-mesurer', zh: '需复测' },
  'conflict.several': { en: '2+ dims wrong: no single fix', fr: '2+ cotes fausses', zh: '至少两个尺寸有误' },
  'heat.windowU':  { en: 'Window U', fr: 'U fenêtre', zh: '窗 U' },
  'heat.doorU':    { en: 'Door U', fr: 'U porte', zh: '门 U' },
  'heat.slabR':    { en: 'Bare slab R', fr: 'R dalle nue', zh: '楼板 R' },
  'heat.lambda':   { en: 'Insulation λ (no R)', fr: 'λ isolant (sans R)', zh: '保温 λ（无 R）' },
  'heat.aimRoom':  { en: 'Aim at a room for its breakdown', fr: 'Visez une pièce pour le détail', zh: '指向房间查看明细' },
  'heat.walls':    { en: 'walls', fr: 'murs', zh: '墙' },
  'heat.openings': { en: 'openings', fr: 'baies', zh: '门窗' },
  'heat.air':      { en: 'air', fr: 'air', zh: '通风' },
  'heat.floorPart': { en: 'floor', fr: 'plancher', zh: '地面' },
  'heat.ceilingPart': { en: 'ceiling', fr: 'plafond', zh: '顶棚' },
  'heat.extWall':  { en: 'ext. wall', fr: 'mur ext.', zh: '外墙' },
  'heat.insulated': { en: 'insul.', fr: 'isolé', zh: '保温' },
  'heat.rSet':     { en: 'from the label (set)', fr: 'saisi (étiquette)', zh: '已输入（标签值）' },
  'heat.rFromDepth': { en: 'default: depth', fr: 'défaut : épaisseur', zh: '默认：厚度' },
  'heat.rEdit':    { en: 'Trigger: type its R', fr: 'Gâchette : saisir son R', zh: '扳机：输入 R 值' },
  'heat.clear':    { en: 'CLEAR', fr: 'EFFACER', zh: '清除' },
  'heat.uValue':   { en: 'U (W/m²K)', fr: 'U (W/m²K)', zh: 'U (W/m²K)' },
  'heat.uDefaultWindow': { en: 'default: project Window U', fr: 'défaut : U fenêtre du projet', zh: '默认：项目窗 U' },
  'heat.uDefaultDoor': { en: 'default: project Door U', fr: 'défaut : U porte du projet', zh: '默认：项目门 U' },
  'heat.aimZone':  { en: 'Aim at a wall, insulation, window or door', fr: 'Visez un mur, un isolant, une fenêtre ou une porte', zh: '指向墙、保温区、窗或门' },
  'heat.rValue':   { en: 'R (m²K/W)', fr: 'R (m²K/W)', zh: 'R (m²K/W)' },
  'heat.lambda':   { en: 'λ (W/mK)', fr: 'λ (W/mK)', zh: 'λ (W/mK)' },
  'heat.map.wall':      { en: 'WALL', fr: 'MUR', zh: '墙' },
  'heat.map.wallBand':  { en: 'wall', fr: 'mur', zh: '墙体' },
  'heat.map.opening':   { en: 'opening', fr: 'ouverture', zh: '门窗' },
  'heat.map.earth':     { en: 'in earth', fr: 'enterré', zh: '埋地' },
  'heat.map.recess':    { en: 'behind recess', fr: 'derrière embrasure', zh: '窗洞后' },
  'heat.map.placeholder': { en: 'no wall drawn', fr: 'mur non dessiné', zh: '未画墙' },
  'heat.map.floor':     { en: 'FLOOR', fr: 'SOL', zh: '地面' },
  'heat.map.ceiling':   { en: 'CEILING', fr: 'PLAFOND', zh: '天花板' },
  'heat.map.walls':     { en: 'walls', fr: 'murs', zh: '墙' },
  'heat.map.openings':  { en: 'openings', fr: 'ouvertures', zh: '门窗' },
  'heat.map.air':       { en: 'air', fr: 'air', zh: '通风' },
  'heat.map.heated':    { en: 'heated room across: no loss', fr: 'pièce chauffée : pas de perte', zh: '对面为采暖房间：无损失' },
  'heat.map.unheated':  { en: 'unheated floor across', fr: 'niveau non chauffé', zh: '对面为非采暖楼层' },
  'heat.map.earth_':    { en: 'on earth', fr: 'sur terre-plein', zh: '地面接土' },
  'heat.map.air_':      { en: 'over outside air', fr: 'sur air extérieur', zh: '悬空（室外）' },
  'heat.map.attic':     { en: 'roof / attic (counted as outside)', fr: 'toit / combles (comme extérieur)', zh: '屋顶/阁楼（按室外计）' },
  'heat.map.legend':    { en: 'W/m²: blue 0 · yellow 50 · red 100+ · grey none', fr: 'W/m² : bleu 0 · jaune 50 · rouge 100+ · gris aucune', zh: 'W/m²：蓝 0 · 黄 50 · 红 100+ · 灰 无' },
  'heat.map.showingFloor':   { en: 'showing FLOOR · stick: CEILING', fr: 'affiche SOL · stick : PLAFOND', zh: '显示地面 · 摇杆：天花板' },
  'heat.map.showingCeiling': { en: 'showing CEILING · stick: FLOOR', fr: 'affiche PLAFOND · stick : SOL', zh: '显示天花板 · 摇杆：地面' },
  'heat.lSet':     { en: 'from the typed λ', fr: 'λ saisi', zh: '由输入的 λ' },
  'conduit.editSeg':  { en: 'CONDUIT SELECTED · B DELETE', fr: 'GAINE SÉLECTIONNÉE · B SUPPR', zh: '已选择管段 · B 删除' },
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
// Translate a key. Defaults to the current UI language; pass an explicit `lang`
// (e.g. for an export sheet whose language is chosen independently of the UI).
// Falls back to en, then the raw key.
export function t(key, lang = current) {
  const e = STRINGS[key];
  return (e && (e[lang] ?? e.en)) ?? key;
}

// The change-map legend/label templates for the current language, as a plain object
// the (i18n-agnostic) plan sheet interpolates. Pass as opts.revLabels so the diff
// text follows the UI language in Print/SVG/PNG and the AR preview alike.
export function revLabels(lang = current) {
  const keys = ['title', 'markerAdded', 'markerRemoved', 'markerMoved', 'markerRetyped',
    'dimChanged', 'dimAdded'];
  return Object.fromEntries(keys.map((k) => [k, t(`rev.${k}`, lang)]));
}

// Built-in floor names remain stable model data for save compatibility. Translate
// only their presentation; a user-renamed floor passes through verbatim.
export function localizedFloorName(name, lang = current) {
  const normalized = String(name || '').trim().toLowerCase();
  if (normalized === 'ground' || normalized === 'ground floor') return t('floor.ground', lang);
  if (normalized === 'upper' || normalized === 'upper floor') return t('floor.upper', lang);
  if (normalized === 'basement') return t('floor.basement', lang);
  return name;
}
