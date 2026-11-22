import { afterEach, describe, expect, it } from "vitest";
import { groundWindStreakCount } from "./groundWindStreaks";
import {
  clampWindStreakDensity,
  getWindStreakDensity,
  readStoredWindStreakDensity,
  resetWindStreakDensityCache,
  setWindStreakDensity,
  WIND_STREAK_DENSITY_DEFAULT,
  WIND_STREAK_DENSITY_KEY,
  windStreakDensityIsDefault,
  writeStoredWindStreakDensity,
} from "./windStreakDensity";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

afterEach(() => resetWindStreakDensityCache());

describe("Wind streaks density", () => {
  it("defaults to 1.0x and clamps to 0.5x–2.5x in 0.1 steps", () => {
    expect(WIND_STREAK_DENSITY_DEFAULT).toBe(1);
    expect(clampWindStreakDensity(0.1)).toBe(0.5);
    expect(clampWindStreakDensity(9)).toBe(2.5);
    expect(clampWindStreakDensity(1.34)).toBe(1.3);
    expect(clampWindStreakDensity(Number.NaN)).toBe(1);
    expect(windStreakDensityIsDefault(1)).toBe(true);
    expect(windStreakDensityIsDefault(1.2)).toBe(false);
  });

  it("persists the multiplier, not a particle count", () => {
    const storage = memoryStorage();
    expect(readStoredWindStreakDensity(storage)).toBe(1);
    writeStoredWindStreakDensity(storage, 1.8);
    expect(storage.getItem(WIND_STREAK_DENSITY_KEY)).toBe("1.8");
    expect(readStoredWindStreakDensity(storage)).toBe(1.8);
    writeStoredWindStreakDensity(storage, 1);
    expect(storage.getItem(WIND_STREAK_DENSITY_KEY)).toBeNull();
    storage.setItem(WIND_STREAK_DENSITY_KEY, "garbage");
    expect(readStoredWindStreakDensity(storage)).toBe(1);
  });

  it("feeds the shared density into the streak count", () => {
    setWindStreakDensity(2);
    expect(getWindStreakDensity()).toBe(2);
    expect(groundWindStreakCount({ sideM: 1000 }, getWindStreakDensity())).toBe(5000);
    setWindStreakDensity(1);
    expect(groundWindStreakCount({ sideM: 1000 }, getWindStreakDensity())).toBe(2500);
  });
});
