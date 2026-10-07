import { describe, expect, it, vi } from "vitest";
import { FLAT_NORTH_UP_MAP_OPTIONS, applyFlatNorthUpMapHandlers } from "./mapStageMapOptions";

describe("mapStageMapOptions", () => {
  it("locks pitch and bearing and disables rotate drag options", () => {
    expect(FLAT_NORTH_UP_MAP_OPTIONS.maxPitch).toBe(0);
    expect(FLAT_NORTH_UP_MAP_OPTIONS.pitch).toBe(0);
    expect(FLAT_NORTH_UP_MAP_OPTIONS.bearing).toBe(0);
    expect(FLAT_NORTH_UP_MAP_OPTIONS.dragRotate).toBe(false);
    expect(FLAT_NORTH_UP_MAP_OPTIONS.pitchWithRotate).toBe(false);
    expect(FLAT_NORTH_UP_MAP_OPTIONS.touchPitch).toBe(false);
    expect(FLAT_NORTH_UP_MAP_OPTIONS.touchZoomRotate).toBe(true);
  });

  it("disables handler rotation after the map is created", () => {
    const dragRotate = { disable: vi.fn() };
    const touchPitch = { disable: vi.fn() };
    const touchZoomRotate = { disableRotation: vi.fn() };
    const keyboard = { disableRotation: vi.fn() };
    const map = {
      dragRotate,
      touchPitch,
      touchZoomRotate,
      keyboard,
      on: vi.fn(),
      getPitch: () => 0,
      getBearing: () => 0,
      setPitch: vi.fn(),
      setBearing: vi.fn(),
    };

    applyFlatNorthUpMapHandlers(map as never);

    expect(dragRotate.disable).toHaveBeenCalledTimes(1);
    expect(touchPitch.disable).toHaveBeenCalledTimes(1);
    expect(touchZoomRotate.disableRotation).toHaveBeenCalledTimes(1);
    expect(keyboard.disableRotation).toHaveBeenCalledTimes(1);
    expect(map.on).toHaveBeenCalledWith("rotate", expect.any(Function));
    expect(map.on).toHaveBeenCalledWith("pitch", expect.any(Function));
    expect(map.on).toHaveBeenCalledWith("moveend", expect.any(Function));
  });
});
