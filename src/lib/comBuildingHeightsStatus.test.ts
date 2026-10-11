import { describe, expect, it } from "vitest";
import {
  LEGACY_COM_BUILDING_HEIGHTS_STORAGE_KEY,
  clearLegacyComBuildingHeightsPreference,
  comBuildingHeightsStatus,
  comBuildingHeightsStatusNote,
} from "./comBuildingHeightsStatus";

describe("CoM 2023 heights status (no toggle)", () => {
  it("is on whenever the cut is in the City of Melbourne and data loaded", () => {
    expect(
      comBuildingHeightsStatus({ buildingsLayer: true, inComCity: true, loading: false, loadFailed: false }),
    ).toBe("on");
    expect(comBuildingHeightsStatusNote("on")).toBeNull();
  });

  it("reports a failure with a visible note", () => {
    const status = comBuildingHeightsStatus({
      buildingsLayer: true,
      inComCity: true,
      loading: false,
      loadFailed: true,
    });
    expect(status).toBe("failed");
    expect(comBuildingHeightsStatusNote(status)).toMatch(/failed to load/);
  });

  it("is loading before the result, and outside the CoM extent there is nothing to load", () => {
    expect(
      comBuildingHeightsStatus({ buildingsLayer: true, inComCity: true, loading: true, loadFailed: false }),
    ).toBe("loading");
    expect(
      comBuildingHeightsStatus({ buildingsLayer: true, inComCity: false, loading: false, loadFailed: false }),
    ).toBe("outside");
  });

  it("drops a stale opt-out flag from older builds", () => {
    const data: Record<string, string> = { [LEGACY_COM_BUILDING_HEIGHTS_STORAGE_KEY]: "false" };
    clearLegacyComBuildingHeightsPreference({ removeItem: (key) => delete data[key] });
    expect(data[LEGACY_COM_BUILDING_HEIGHTS_STORAGE_KEY]).toBeUndefined();
  });
});
