import type { CityModel } from "../types";

export function treeCanopyCoverPct(model: Pick<CityModel, "trees" | "sideM">): number {
  const cutM2 = model.sideM * model.sideM;
  if (cutM2 <= 0 || model.trees.length === 0) return 0;
  let canopyM2 = 0;
  for (const tree of model.trees) {
    const radius = Math.max(0, tree.crown_diameter_m / 2);
    canopyM2 += Math.PI * radius * radius;
  }
  return Math.min(100, Math.round((canopyM2 / cutM2) * 1000) / 10);
}
