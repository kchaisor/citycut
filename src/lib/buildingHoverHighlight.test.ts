import { describe, expect, it } from "vitest";
import {
  applyHoverHighlightPick,
  mixBuildingHoverFill,
  resolveHoverHighlightBuildingId,
} from "./buildingHoverHighlight";

describe("resolveHoverHighlightBuildingId", () => {
  const idleGate = { pointerDown: false, orbitActive: false, orbitCooldownUntil: 0 };

  it("sets highlight from a building pick when idle", () => {
    expect(resolveHoverHighlightBuildingId(42, idleGate, 1000)).toBe(42);
  });

  it("switches directly from building A to B", () => {
    const a = applyHoverHighlightPick({ highlightedBuildingId: null }, 10, idleGate, 1000);
    const b = applyHoverHighlightPick(a, 20, idleGate, 1000);
    expect(b.highlightedBuildingId).toBe(20);
  });

  it("clears highlight on leave", () => {
    const hovered = applyHoverHighlightPick({ highlightedBuildingId: null }, 10, idleGate, 1000);
    const cleared = applyHoverHighlightPick(hovered, null, idleGate, 1000);
    expect(cleared.highlightedBuildingId).toBeNull();
  });

  it("suppresses highlight while orbiting", () => {
    const orbiting = { pointerDown: false, orbitActive: true, orbitCooldownUntil: 0 };
    expect(resolveHoverHighlightBuildingId(10, orbiting, 1000)).toBeNull();
    const afterOrbit = applyHoverHighlightPick({ highlightedBuildingId: 10 }, 10, orbiting, 1000);
    expect(afterOrbit.highlightedBuildingId).toBeNull();
  });

  it("suppresses highlight during post-orbit cooldown", () => {
    const cooling = { pointerDown: false, orbitActive: false, orbitCooldownUntil: 2000 };
    expect(resolveHoverHighlightBuildingId(10, cooling, 1000)).toBeNull();
  });
});

describe("mixBuildingHoverFill", () => {
  it("lightens the building fill toward the accent", () => {
    const mixed = mixBuildingHoverFill("#808080", "#ffffff");
    expect(mixed.toLowerCase()).not.toBe("#808080");
    expect(mixed.toLowerCase()).not.toBe("#ffffff");
  });
});
