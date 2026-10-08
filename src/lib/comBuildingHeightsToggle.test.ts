import { describe, expect, it } from "vitest";
import { readStoredComBuildingHeights } from "./comBuildingHeightsToggle";

describe("comBuildingHeights toggle", () => {
  it("defaults CoM heights on unless localStorage is false", () => {
    const storage = { data: {} as Record<string, string>, getItem(k: string) { return this.data[k] ?? null; }, setItem(k: string, v: string) { this.data[k] = v; } };
    expect(readStoredComBuildingHeights(storage)).toBe(true);
    storage.setItem("citycut.comBuildingHeights", "false");
    expect(readStoredComBuildingHeights(storage)).toBe(false);
    storage.setItem("citycut.comBuildingHeights", "true");
    expect(readStoredComBuildingHeights(storage)).toBe(true);
  });
});
