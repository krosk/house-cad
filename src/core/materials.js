// Surface-finish catalog (design: docs/materials.md). A material is one product: its
// laying pattern, piece size, joint and pack drive BOTH the quantity takeoff
// (src/core/flooring.js) and, later, the 3D texture — so the count and the picture
// can never disagree. Built-ins live here and are never stored; the owner's own
// products live on `project.materials` (same shape, saved with the house).
//
//   pattern  stagger (planks: rows, offcut starts the next row) | grid | brick (rows
//            offset half a piece) | octagon (octagon + cabochon at each lattice corner)
//            | paint (area only)
//   w, h     piece size in metres (octagon: w = octagon width); joint in metres
//   surface  floor | wall | both
//   pack     { pieces } per box, or { area } m² per pack (paint)

export const BUILTIN_MATERIALS = [
  {
    id: 'oak_plank', surface: 'floor', pattern: 'stagger', w: 1.2, h: 0.19, joint: 0,
    color: 0xc8a26b, accent: 0x8a6a3b, pack: { pieces: 8 },
    name: { en: 'Oak planks 120×19', fr: 'Parquet chêne 120×19', zh: '橡木地板 120×19' },
  },
  {
    id: 'tile_600', surface: 'floor', pattern: 'grid', w: 0.6, h: 0.6, joint: 0.003,
    color: 0x9ca3af, accent: 0x6b7280, pack: { pieces: 4 },
    name: { en: 'Tile 60×60', fr: 'Carrelage 60×60', zh: '地砖 60×60' },
  },
  {
    id: 'tile_300', surface: 'floor', pattern: 'grid', w: 0.3, h: 0.3, joint: 0.003,
    color: 0xe5e7eb, accent: 0x9ca3af, pack: { pieces: 11 },
    name: { en: 'Tile 30×30', fr: 'Carrelage 30×30', zh: '地砖 30×30' },
  },
  {
    id: 'octagon_200', surface: 'floor', pattern: 'octagon', w: 0.2, h: 0.2, joint: 0.002,
    color: 0xf1f5f9, accent: 0x111827, pack: { pieces: 25 },
    name: { en: 'Octagon + cabochon 20', fr: 'Octogone + cabochon 20', zh: '八角砖 + 小方砖 20' },
  },
  {
    id: 'wall_tile_200', surface: 'wall', pattern: 'grid', w: 0.2, h: 0.2, joint: 0.002,
    color: 0xf8fafc, accent: 0x94a3b8, pack: { pieces: 25 },
    name: { en: 'Wall tile 20×20', fr: 'Faïence 20×20', zh: '墙砖 20×20' },
  },
  {
    id: 'metro_150', surface: 'wall', pattern: 'brick', w: 0.15, h: 0.075, joint: 0.002,
    color: 0xffffff, accent: 0x9ca3af, pack: { pieces: 44 },
    name: { en: 'Metro tile 15×7.5', fr: 'Carreau métro 15×7,5', zh: '地铁砖 15×7.5' },
  },
  {
    id: 'paint_white', surface: 'wall', pattern: 'paint', w: 0, h: 0, joint: 0,
    color: 0xfafaf9, accent: 0xd6d3d1, pack: { area: 12 },
    name: { en: 'White paint', fr: 'Peinture blanche', zh: '白色涂料' },
  },
];

export function allMaterials(project) {
  return [...BUILTIN_MATERIALS, ...(project?.materials || [])];
}

export function materialById(project, id) {
  if (!id) return null;
  return allMaterials(project).find((m) => m.id === id) || null;
}

// Materials offered for a surface ('floor' | 'wall'), catalog order.
export function materialsFor(project, surface) {
  return allMaterials(project).filter((m) => m.surface === surface || m.surface === 'both');
}

export function materialName(material, lang = 'en') {
  const n = material?.name;
  if (!n) return material?.id || '';
  return typeof n === 'string' ? n : (n[lang] || n.en || material.id);
}
