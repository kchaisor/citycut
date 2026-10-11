import type { CityModel, Pt, TreeFeat } from "../types";

function compareNum(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function comparePt(a: Pt, b: Pt): number {
  const east = compareNum(a[0], b[0]);
  if (east !== 0) return east;
  return compareNum(a[1], b[1]);
}

function treeSpeciesLabel(tree: TreeFeat): string {
  return tree.species ?? tree.genus ?? tree.taxon ?? "";
}

/** Trees are sorted by geometry and tags; API row ids are not stable. */
export function compareTreesForExport(a: TreeFeat, b: TreeFeat): number {
  const ax = Math.round(a.at[0] * 1000);
  const ay = Math.round(a.at[1] * 1000);
  const bx = Math.round(b.at[0] * 1000);
  const by = Math.round(b.at[1] * 1000);
  let c = compareNum(ax, bx);
  if (c !== 0) return c;
  c = compareNum(ay, by);
  if (c !== 0) return c;
  c = compareNum(a.height_m, b.height_m);
  if (c !== 0) return c;
  c = compareNum(a.crown_diameter_m, b.crown_diameter_m);
  if (c !== 0) return c;
  return treeSpeciesLabel(a).localeCompare(treeSpeciesLabel(b));
}

function comparePolyline(a: Pt[], b: Pt[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const c = comparePt(a[i], b[i]);
    if (c !== 0) return c;
  }
  return compareNum(a.length, b.length);
}

/** Stable feature order for byte-identical exports (same cut, same options). */
export function stableExportModel(model: CityModel): CityModel {
  return {
    ...model,
    roads: [...model.roads].sort((a, b) => compareNum(a.id, b.id)),
    areas: model.areas,
    trees: [...model.trees].sort(compareTreesForExport),
    tramLines: model.tramLines
      ? [...model.tramLines].sort(comparePolyline)
      : model.tramLines,
  };
}
