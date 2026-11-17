import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIND_SETTINGS,
  readStoredWindSettings,
  windSettingsForModelOpen,
  withDesignWind,
  withWindSeason,
  writeStoredWindSettings,
  WIND_DESIGN_WIND_KEY,
  WIND_ENABLED_KEY,
} from "./windState";

describe("windSettingsForModelOpen", () => {
  it("turns wind on for a new model while keeping stored period and rose preference", () => {
    const data: Record<string, string> = { [WIND_ENABLED_KEY]: "1" };
    const storage: Storage = {
      get length() {
        return Object.keys(data).length;
      },
      clear() {
        for (const key of Object.keys(data)) delete data[key];
      },
      getItem(key: string) {
        return data[key] ?? null;
      },
      key(index: number) {
        return Object.keys(data)[index] ?? null;
      },
      removeItem(key: string) {
        delete data[key];
      },
      setItem(key: string, value: string) {
        data[key] = value;
      },
    };
    expect(readStoredWindSettings(storage).enabled).toBe(true);
    const next = windSettingsForModelOpen(storage);
    expect(next.enabled).toBe(true);
    expect(next.period).toBe(DEFAULT_WIND_SETTINGS.period);
    expect(next.showRose).toBe(true);
  });
});

describe("design wind settings", () => {
  function memoryStorage(): Storage {
    const data: Record<string, string> = {};
    return {
      get length() {
        return Object.keys(data).length;
      },
      clear() {
        for (const key of Object.keys(data)) delete data[key];
      },
      getItem: (key: string) => data[key] ?? null,
      key: (index: number) => Object.keys(data)[index] ?? null,
      removeItem(key: string) {
        delete data[key];
      },
      setItem(key: string, value: string) {
        data[key] = value;
      },
    };
  }

  it("round-trips a chosen design wind and clears it when a season is picked", () => {
    const storage = memoryStorage();
    const design = withDesignWind(DEFAULT_WIND_SETTINGS, "design-ne");
    writeStoredWindSettings(storage, design);
    expect(readStoredWindSettings(storage)).toEqual({ ...design, enabled: true, period: "annual", designWind: "design-ne" });
    const winter = withWindSeason(design, "winter");
    writeStoredWindSettings(storage, winter);
    expect(readStoredWindSettings(storage).designWind).toBeNull();
    expect(readStoredWindSettings(storage).period).toBe("winter");
  });

  it("ignores a stored design wind id that is not one", () => {
    const storage = memoryStorage();
    storage.setItem(WIND_DESIGN_WIND_KEY, "north-east");
    expect(readStoredWindSettings(storage).designWind).toBeNull();
  });
});
