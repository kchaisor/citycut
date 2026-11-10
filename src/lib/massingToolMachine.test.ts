import { describe, expect, it } from "vitest";
import {
  INITIAL_MASSING_TOOL_STATE,
  massingToolOrbitLocked,
  reduceMassingTool,
} from "./massingToolMachine";

function enabled() {
  return reduceMassingTool(INITIAL_MASSING_TOOL_STATE, { type: "ENABLE_TOOL" });
}

function armed() {
  return reduceMassingTool(enabled(), { type: "ARM_DRAW" });
}

describe("massingToolMachine", () => {
  it("starts idle with tool off", () => {
    expect(INITIAL_MASSING_TOOL_STATE.phase).toBe("idle");
    expect(INITIAL_MASSING_TOOL_STATE.toolEnabled).toBe(false);
    expect(INITIAL_MASSING_TOOL_STATE.drawArmed).toBe(false);
  });

  it("does not enter drawing until draw is armed", () => {
    let state = enabled();
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 1, north: 2, hitBlockId: null });
    expect(state.phase).toBe("idle");
    state = reduceMassingTool(state, { type: "ARM_DRAW" });
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 1, north: 2, hitBlockId: null });
    expect(state.phase).toBe("drawing");
    expect(state.drawVertices).toEqual([[1, 2]]);
  });

  it("cancels drawing on Escape path", () => {
    let state = armed();
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: null });
    state = reduceMassingTool(state, { type: "CANCEL" });
    expect(state.phase).toBe("idle");
    expect(state.drawVertices).toBeNull();
  });

  it("selects block on hit without draw armed", () => {
    let state = enabled();
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: "b1" });
    expect(state.phase).toBe("selected");
    expect(state.selectedId).toBe("b1");
  });

  it("locks orbit only while draw armed and drawing or dragging height", () => {
    let state = enabled();
    expect(massingToolOrbitLocked(state)).toBe(false);
    state = armed();
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: null });
    expect(massingToolOrbitLocked(state)).toBe(true);
    state = reduceMassingTool(state, { type: "COMMIT_DRAW" });
    state = reduceMassingTool(state, { type: "SELECT", id: "x" });
    expect(massingToolOrbitLocked(state)).toBe(false);
    state = reduceMassingTool(state, { type: "START_HEIGHT_DRAG", floors: 4 });
    expect(massingToolOrbitLocked(state)).toBe(true);
  });

  it("disabling tool clears draw armed", () => {
    let state = armed();
    state = reduceMassingTool(state, { type: "DISABLE_TOOL" });
    expect(state.toolEnabled).toBe(false);
    expect(state.drawArmed).toBe(false);
  });

  it("clears drawing when leaving 3D view mid-draw", () => {
    let state = armed();
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: null });
    state = reduceMassingTool(state, { type: "LEAVE_3D_VIEW" });
    expect(state.phase).toBe("idle");
    expect(state.drawVertices).toBeNull();
  });

  it("click-release enters drawingPreview; hover moves end; adds vertices without commit", () => {
    let state = armed();
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: null });
    state = reduceMassingTool(state, { type: "POINTER_UP" });
    expect(state.phase).toBe("drawingPreview");
    expect(massingToolOrbitLocked(state)).toBe(true);
    state = reduceMassingTool(state, { type: "POINTER_MOVE", east: 20, north: 0 });
    expect(state.drawHover).toEqual([20, 0]);
    state = reduceMassingTool(state, { type: "ADD_VERTEX", east: 30, north: 1 });
    expect(state.phase).toBe("drawingPreview");
    expect(state.drawVertices).toEqual([
      [0, 0],
      [30, 1],
    ]);
    state = reduceMassingTool(state, { type: "ADD_VERTEX", east: 30, north: 20 });
    expect(state.drawVertices?.length).toBe(3);
    state = reduceMassingTool(state, { type: "COMMIT_DRAW" });
    expect(state.phase).toBe("idle");
    expect(state.drawVertices).toBeNull();
  });

  it("Escape cancels drawingPreview", () => {
    let state = armed();
    state = reduceMassingTool(state, { type: "POINTER_DOWN_GROUND", east: 0, north: 0, hitBlockId: null });
    state = reduceMassingTool(state, { type: "POINTER_UP" });
    state = reduceMassingTool(state, { type: "CANCEL" });
    expect(state.phase).toBe("idle");
    expect(state.drawVertices).toBeNull();
    expect(state.drawHover).toBeNull();
  });
});
