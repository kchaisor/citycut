import { describe, expect, it } from "vitest";
import { hoverPickBlocked } from "./buildingHoverPick";

describe("hoverPickBlocked", () => {
  it("blocks while pointer is down", () => {
    expect(
      hoverPickBlocked({ pointerDown: true, orbitActive: false, orbitCooldownUntil: 0 }, 1000),
    ).toBe(true);
  });

  it("blocks while orbit is active", () => {
    expect(
      hoverPickBlocked({ pointerDown: false, orbitActive: true, orbitCooldownUntil: 0 }, 1000),
    ).toBe(true);
  });

  it("blocks during post-orbit cooldown", () => {
    expect(
      hoverPickBlocked({ pointerDown: false, orbitActive: false, orbitCooldownUntil: 2000 }, 1000),
    ).toBe(true);
  });

  it("allows pick when idle", () => {
    expect(
      hoverPickBlocked({ pointerDown: false, orbitActive: false, orbitCooldownUntil: 0 }, 1000),
    ).toBe(false);
  });
});
