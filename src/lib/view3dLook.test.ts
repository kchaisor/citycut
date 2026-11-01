import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW3D_LOOK,
  readStoredView3dLook,
  signalTraceLookActive,
  writeStoredView3dLook,
} from "./view3dLook";

function memoryStore(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: () => null,
    length: map.size,
  } as Storage;
}

describe("view3dLook", () => {
  it("defaults to standard look", () => {
    expect(readStoredView3dLook(memoryStore())).toBe(DEFAULT_VIEW3D_LOOK);
    expect(signalTraceLookActive("default")).toBe(false);
  });

  it("persists signal trace selection", () => {
    const store = memoryStore();
    writeStoredView3dLook(store, "signalTrace");
    expect(readStoredView3dLook(store)).toBe("signalTrace");
    expect(signalTraceLookActive("signalTrace")).toBe(true);
  });
});
