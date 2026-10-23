// The electrical panel (docs/electrical-workflow.md "The panel", owner 2026-10-22): a `panel`
// marker carrying a panel product (`surface: 'panel'`, src/core/materials.js) is drawn as that
// enclosure, its DIN rows filled from the house. Each row starts with its RCD switch (the
// product's `rows[i].rcd`, `rcdModules` wide); a breaker marker sits in a slot when it names the
// panel (`breaker.panel` = the panel marker's id, `row` 1..rows, `slot` 1..modules, the module
// its left edge is on). The breaker markers themselves stay where they were surveyed (the head of
// each circuit line); the slot is where that breaker is in the panel. Membership is stored on the
// breaker only; the fill is derived, never stored.

// A breaker's width in modules: a DNX³ phase + neutral breaker is one module (the kit's
// breakers). Hypothesis for anything else: no 2-module breaker is surveyed yet.
export const breakerModules = () => 1;

// The panel's rows, each { rcd, modules: [{ slot, width, kind: 'rcd' | 'breaker', breakerId? }] }
// in slot order, plus `misplaced`: breakers naming this panel whose slot is off the rail or
// overlaps another module (not drawn; the first come keeps the slot, by marker order).
export function panelFill(project, panel, def) {
  const rowsN = def?.rows?.length || 0, modulesN = def?.modulesPerRow || 0;
  const rcdW = def?.rcdModules ?? 2;
  const rows = (def?.rows || []).map((r) => ({
    rcd: r.rcd || null,
    modules: r.rcd ? [{ slot: 1, width: rcdW, kind: 'rcd' }] : [],
  }));
  const misplaced = [];
  const breakers = (project?.floors || []).flatMap((f) => f.markers || [])
    .filter((m) => m.type === 'breaker' && m.panel === panel?.id);
  for (const b of breakers) {
    const row = Number(b.row), slot = Number(b.slot), width = breakerModules(b);
    const r = Number.isInteger(row) && row >= 1 && row <= rowsN ? rows[row - 1] : null;
    const fits = r && Number.isInteger(slot) && slot >= 1 && slot + width - 1 <= modulesN
      && !r.modules.some((m) => slot < m.slot + m.width && m.slot < slot + width);
    if (!fits) { misplaced.push(b.id); continue; }
    r.modules.push({ slot, width, kind: 'breaker', breakerId: b.id, rating: b.rating ?? null });
  }
  for (const r of rows) r.modules.sort((a, b) => a.slot - b.slot);
  return { rows, misplaced };
}

// A module's centre on the panel's face, metres from the panel's centre (x right, y up):
// rows `railPitchMm` apart, centred on the enclosure; modules `moduleMm` wide, the row centred.
export function slotCentre(def, row, slot, width = 1) {
  const pitch = def.railPitchMm / 1000, mod = def.moduleMm / 1000, n = def.rows.length;
  const y = ((n - 1) / 2 - (row - 1)) * pitch;
  const x = -(def.modulesPerRow * mod) / 2 + (slot - 1 + width / 2) * mod;
  return { x, y };
}
