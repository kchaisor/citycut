import { describe, expect, it } from "vitest";
import {
  envConsoleLanes,
  HUD_CLEARANCE_PX,
  RIGHT_HUD_GAP_PX,
  RIGHT_HUD_RIGHT_PX,
  RIGHT_HUD_TOP_PX,
  RIGHT_HUD_WIDTH_PX,
  rightHudMaxHeight,
  type HudBox,
} from "./rightHudLayout";

const stackAt = (vw: number, height = 600): HudBox => ({
  left: vw - RIGHT_HUD_RIGHT_PX - RIGHT_HUD_WIDTH_PX,
  right: vw - RIGHT_HUD_RIGHT_PX,
  top: RIGHT_HUD_TOP_PX,
  bottom: RIGHT_HUD_TOP_PX + height,
});
const rail: HudBox = { left: 14, right: 66, top: 68, bottom: 260 };
const outliner: HudBox = { left: 74, right: 322, top: 68, bottom: 820 };

describe("right HUD stack layout", () => {
  it("pins a 304px column 14px from the right and 68px from the top with a 12px gap", () => {
    expect(RIGHT_HUD_WIDTH_PX).toBe(304);
    expect(RIGHT_HUD_RIGHT_PX).toBe(14);
    expect(RIGHT_HUD_TOP_PX).toBe(68);
    expect(RIGHT_HUD_GAP_PX).toBe(12);
  });

  it("stops the column 8px above an Analysis console under it", () => {
    const stack = stackAt(1280);
    const consoleBar: HudBox = { left: 400, right: 1100, top: 700, bottom: 786 };
    expect(rightHudMaxHeight(800, stack, [consoleBar])).toBe(700 - HUD_CLEARANCE_PX - RIGHT_HUD_TOP_PX);
  });

  it("runs the column to 8px above the bottom when the console is clear of it", () => {
    const stack = stackAt(1440);
    const consoleBar: HudBox = { left: 330, right: 1110, top: 800, bottom: 886 };
    expect(rightHudMaxHeight(900, stack, [consoleBar, null])).toBe(900 - HUD_CLEARANCE_PX - RIGHT_HUD_TOP_PX);
  });

  it("ignores HUD above the column top, such as the top-bar compass", () => {
    const stack = stackAt(1440);
    const compass: HudBox = { left: 1300, right: 1342, top: 20, bottom: 62 };
    expect(rightHudMaxHeight(900, stack, [compass])).toBe(824);
  });

  for (const [vw, vh] of [
    [1280, 800],
    [1440, 900],
  ] as const) {
    it(`keeps the console 8px from the rail, outliner and right stack at ${vw}x${vh}`, () => {
      const stack = stackAt(vw);
      const consoleBar: HudBox = { left: 0, right: 720, top: vh - 14 - 86, bottom: vh - 14 };
      const lanes = envConsoleLanes(vw, consoleBar, [rail, outliner], stack);
      expect(lanes.left).toBe(outliner.right + HUD_CLEARANCE_PX);
      expect(lanes.right).toBe(RIGHT_HUD_RIGHT_PX + RIGHT_HUD_WIDTH_PX + HUD_CLEARANCE_PX);
      expect(vw - lanes.right).toBeLessThanOrEqual(stack.left - HUD_CLEARANCE_PX);

      const railOnly = envConsoleLanes(vw, consoleBar, [rail, null], stack);
      expect(railOnly.left).toBe(16);
      expect(vw - railOnly.left - railOnly.right).toBeGreaterThanOrEqual(720);
    });
  }

  it("centres the console on the full width when no right stack is open", () => {
    const consoleBar: HudBox = { left: 0, right: 720, top: 800, bottom: 886 };
    expect(envConsoleLanes(1440, consoleBar, [rail], null)).toEqual({ left: 16, right: 16 });
  });
});
