import { describe, expect, it } from "vitest";
import {
  readWindAnimateAnyway,
  writeWindAnimateAnyway,
  WIND_ANIMATE_ANYWAY_KEY,
} from "./windStreakMotion";

describe("windStreakMotion storage", () => {
  it("persists animate-anyway override", () => {
    const bag: Record<string, string> = {};
    const storage: Storage = {
      get length() {
        return Object.keys(bag).length;
      },
      clear() {
        for (const key of Object.keys(bag)) delete bag[key];
      },
      getItem(key: string) {
        return bag[key] ?? null;
      },
      key(index: number) {
        return Object.keys(bag)[index] ?? null;
      },
      removeItem(key: string) {
        delete bag[key];
      },
      setItem(key: string, value: string) {
        bag[key] = value;
      },
    };

    expect(readWindAnimateAnyway(storage)).toBe(false);
    writeWindAnimateAnyway(storage, true);
    expect(storage.getItem(WIND_ANIMATE_ANYWAY_KEY)).toBe("1");
    expect(readWindAnimateAnyway(storage)).toBe(true);
  });
});
