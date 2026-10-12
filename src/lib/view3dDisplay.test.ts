import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW3D_DISPLAY,
  readStoredView3dDisplay,
  snapWhenTogglingView3dDisplay,
  writeStoredView3dDisplay,
} from "./view3dDisplay";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));

describe("view3d display persistence", () => {
  it("round-trips display toggles in storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const saved = {
      ...DEFAULT_VIEW3D_DISPLAY,
      whiteCard: true,
      showContours3d: true,
      hideTrees: true,
    };
    writeStoredView3dDisplay(storage, saved);
    expect(readStoredView3dDisplay(storage)).toEqual(saved);
  });
});

describe("view3d display toggles camera unchanged", () => {
  it("never snaps the camera when a display toggle changes", () => {
    expect(snapWhenTogglingView3dDisplay()).toBe(false);
  });

  it("does not call setSnapId from display toggle handlers", () => {
    const page = readFileSync(`${srcRoot}/components/ModelPage.tsx`, "utf8");
    const block = page.match(/commitView3dDisplay[\s\S]{0,2000}function commitView/)?.[0] ?? "";
    expect(block).not.toContain("setSnapId");
    expect(page.match(/commitView3dDisplay\(\{[\s\S]*?\}\)/g)?.join("\n") ?? "").not.toContain("setSnapId");
  });
});
