import { describe, expect, it } from "vitest";
import { initialAnalyses, initialSolarSettings } from "./initialSolarSettings";
import { DEFAULT_WIND_SETTINGS, WIND_ENABLED_KEY, windSettingsForModelOpen } from "../../lib/windState";

const emptyStorage = { getItem: () => null, setItem: () => undefined };

function storageWith(values: Record<string, string>): Storage {
  return {
    length: Object.keys(values).length,
    clear: () => undefined,
    getItem: (key: string) => values[key] ?? null,
    key: () => null,
    removeItem: () => undefined,
    setItem: () => undefined,
  };
}

describe("initialSolarSettings", () => {
  it("opens with Sun hours, Shadows and the heatmap off", () => {
    const settings = initialSolarSettings("", emptyStorage);
    expect(settings.sunHours).toBe(false);
    expect(settings.castShadows).toBe(false);
  });

  it("opens on 22 Sep with the whole-day sun hours window and Colour only selected off", () => {
    const settings = initialSolarSettings("", emptyStorage);
    expect([settings.day, settings.month]).toEqual([22, 9]);
    expect(settings.sunHoursWindow).toBe("day");
    expect(settings.sunHoursPickedOnly).toBe(false);
  });

  it("opens with the 3D sun dome and the 9–3pm plan fan off", () => {
    const settings = initialSolarSettings("", emptyStorage);
    expect(settings.showPath).toBe(false);
    expect(Boolean(settings.sunStudy)).toBe(false);
  });
});

describe("analysis defaults for a new cut", () => {
  it("selects no analysis, so Solar Study, Wind Rose and Viewshed Walk all start off", () => {
    expect(initialAnalyses("")).toEqual({ solar: false, wind: false, view: false });
  });

  it("opens Solar Study only for the solar=path capture preset", () => {
    expect(initialAnalyses("?solar=path")).toEqual({ solar: true, wind: false, view: false });
  });

  it("keeps wind off for a new cut even after a visit that left wind on", () => {
    expect(windSettingsForModelOpen(storageWith({})).enabled).toBe(DEFAULT_WIND_SETTINGS.enabled);
    expect(windSettingsForModelOpen(storageWith({ [WIND_ENABLED_KEY]: "1" })).enabled).toBe(false);
  });
});
