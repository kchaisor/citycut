import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILDING_COLOUR_STYLE,
  readStoredBuildingColourStyle,
  writeStoredBuildingColourStyle,
} from "./buildingColourStyle";

describe("buildingColourStyle", () => {
  it("defaults to uniform and migrates legacy white-card storage to uniform", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    expect(readStoredBuildingColourStyle(storage)).toBe(DEFAULT_BUILDING_COLOUR_STYLE);
    storage.setItem("citycut.view3d.whiteCard", "1");
    expect(readStoredBuildingColourStyle(storage)).toBe("uniform");
    writeStoredBuildingColourStyle(storage, "use");
    expect(readStoredBuildingColourStyle(storage)).toBe("use");
    expect(storage.getItem("citycut.view3d.whiteCard")).toBeNull();
  });
});
