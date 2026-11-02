import { getColour } from "./colours";

export const TREE_CROWN_VARIANT_KEYS = [
  "--tree-crown-a",
  "--tree-crown-b",
  "--tree-crown-c",
  "--tree-crown-d",
] as const;

export type TreeCrownVariantKey = (typeof TREE_CROWN_VARIANT_KEYS)[number];

export function treeCrownVariantIndex(treeId: number): number {
  const seed = Math.imul(treeId | 0, 2654435761) >>> 0;
  return seed % TREE_CROWN_VARIANT_KEYS.length;
}

export function treeCrownColourForId(treeId: number): string {
  return getColour(TREE_CROWN_VARIANT_KEYS[treeCrownVariantIndex(treeId)]!);
}

export function treeCrownVariantCount(): number {
  return TREE_CROWN_VARIANT_KEYS.length;
}
