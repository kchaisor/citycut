import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIND_SETTINGS,
  readStoredWindSettings,
  windSettingsForModelOpen,
  withDesignWind,
  withWindDaypart,
  withWindSeason,
  writeStoredWindSettings,
  WIND_DAYPART_KEY,
  WIND_DESIGN_WIND_KEY,
  WIND_ENABLED_KEY,
} from "./windState";

describe("windSettingsForModelOpen", () => {
  it("starts a new model with wind off even when a previous visit stored wind on, keeping the stored period", () => {
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
    expect(next.enabled).toBe(false);
    expect(next.period).toBe(DEFAULT_WIND_SETTINGS.period);
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

describe("wind daypart settings", () => {
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

  it("defaults to All day and only changes when Morning or Afternoon is stored", () => {
    const storage = memoryStorage();
    expect(readStoredWindSettings(storage).daypart).toBe("all");
    expect(DEFAULT_WIND_SETTINGS.daypart).toBe("all");
    writeStoredWindSettings(storage, withWindDaypart(DEFAULT_WIND_SETTINGS, "morning"));
    expect(readStoredWindSettings(storage).daypart).toBe("morning");
    expect(storage.getItem(WIND_DAYPART_KEY)).toBe("morning");
    storage.setItem(WIND_DAYPART_KEY, "night");
    expect(readStoredWindSettings(storage).daypart).toBe("all");
  });
});
