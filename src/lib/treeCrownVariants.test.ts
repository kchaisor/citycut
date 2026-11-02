import { describe, expect, it } from "vitest";
import { treeCrownColourForId, treeCrownVariantIndex, TREE_CROWN_VARIANT_KEYS } from "./treeCrownVariants";

describe("treeCrownVariants", () => {
  it("maps tree ids to four stable variant indices", () => {
    const indices = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(treeCrownVariantIndex));
    expect(indices.size).toBe(TREE_CROWN_VARIANT_KEYS.length);
    expect(treeCrownVariantIndex(42)).toBe(treeCrownVariantIndex(42));
    expect(treeCrownColourForId(100)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
