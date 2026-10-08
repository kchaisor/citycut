import { describe, expect, it } from "vitest";
import {
  comBuildingHeightsToggleKind,
  comBuildingHeightsToggleLabel,
  comBuildingHeightsTogglePressed,
  readStoredComBuildingHeights,
} from "./comBuildingHeightsToggle";

describe("comBuildingHeights toggle", () => {
  it("defaults CoM heights on unless localStorage is false", () => {
    const storage = { data: {} as Record<string, string>, getItem(k: string) { return this.data[k] ?? null; }, setItem(k: string, v: string) { this.data[k] = v; } };
    expect(readStoredComBuildingHeights(storage)).toBe(true);
    storage.setItem("citycut.comBuildingHeights", "false");
    expect(readStoredComBuildingHeights(storage)).toBe(false);
    storage.setItem("citycut.comBuildingHeights", "true");
    expect(readStoredComBuildingHeights(storage)).toBe(true);
  });

  it("labels failed load instead of measured heights on", () => {
    const kind = comBuildingHeightsToggleKind({
      userEnabled: true,
      inComCity: true,
      loadFailed: true,
      loading: false,
    });
    expect(kind).toBe("failed");
    expect(comBuildingHeightsToggleLabel(kind)).toBe("CoM 2023 heights: failed to load");
    expect(comBuildingHeightsTogglePressed(kind)).toBe(false);
  });

  it("shows measured on only when data loaded", () => {
    const kind = comBuildingHeightsToggleKind({
      userEnabled: true,
      inComCity: true,
      loadFailed: false,
      loading: false,
    });
    expect(comBuildingHeightsToggleLabel(kind)).toBe("CoM 2023 measured heights on · turn off");
    expect(comBuildingHeightsTogglePressed(kind)).toBe(true);
  });
});
