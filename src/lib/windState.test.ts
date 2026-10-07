import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIND_SETTINGS,
  readStoredWindSettings,
  windSettingsForModelOpen,
  WIND_ENABLED_KEY,
} from "./windState";

describe("windSettingsForModelOpen", () => {
  it("forces wind off while keeping stored period and rose preference", () => {
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
    expect(next.showRose).toBe(true);
  });
});
