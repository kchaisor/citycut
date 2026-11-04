import { describe, expect, it } from "vitest";
import {
  INITIAL_MASSING_TOOL_STATE,
  massingToolOrbitLocked,
  reduceMassingTool,
} from "./massingToolMachine";

describe("massingToolMachine", () => {
  it("starts idle with tool off", () => {
    expect(INITIAL_MASSING_TOOL_STATE.phase).toBe("idle");
    expect(INITIAL_MASSING_TOOL_STATE.toolEnabled).toBe(false);
  });

  it("enters drawing on ground pointer down when tool enabled", () => {
    let state = reduceMassingTool(INITIAL_MASSING_TOOL_STATE, { type: "ENABLE_TOOL" });
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 1, north: 2, hitBlockId: null });
    expect(state.phase).toBe("drawing");
    expect(state.drawStart).toEqual([1, 2]);
  });

  it("cancels drawing on Escape path", () => {
    let state = reduceMassingTool(INITIAL_MASSING_TOOL_STATE, { type: "ENABLE_TOOL" });
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: null });
    state = reduceMassingTool(state, { type: "CANCEL" });
    expect(state.phase).toBe("idle");
    expect(state.drawStart).toBeNull();
  });

  it("selects block on hit", () => {
    let state = reduceMassingTool(INITIAL_MASSING_TOOL_STATE, { type: "ENABLE_TOOL" });
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: "b1" });
    expect(state.phase).toBe("selected");
    expect(state.selectedId).toBe("b1");
  });

  it("locks orbit while drawing or dragging height", () => {
    let state = reduceMassingTool(INITIAL_MASSING_TOOL_STATE, { type: "ENABLE_TOOL" });
    expect(massingToolOrbitLocked(state)).toBe(false);
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: null });
    expect(massingToolOrbitLocked(state)).toBe(true);
    state = reduceMassingTool(state, { type: "COMMIT_DRAW" });
    state = reduceMassingTool(state, { type: "SELECT", id: "x" });
    state = reduceMassingTool(state, { type: "START_HEIGHT_DRAG", floors: 4 });
    expect(massingToolOrbitLocked(state)).toBe(true);
  });

  it("clears drawing when leaving 3D view mid-draw", () => {
    let state = reduceMassingTool(INITIAL_MASSING_TOOL_STATE, { type: "ENABLE_TOOL" });
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: null });
    state = reduceMassingTool(state, { type: "LEAVE_3D_VIEW" });
    expect(state.phase).toBe("idle");
    expect(state.drawStart).toBeNull();
  });
});
