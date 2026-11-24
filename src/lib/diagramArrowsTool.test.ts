import { describe, expect, it } from "vitest";
import { DEFAULT_ARROW } from "./diagramArrows";
import {
  arrowToolClickActions,
  arrowToolKeyAction,
  arrowToolReducer,
  initialArrowToolState,
  selectedArrow,
  type ArrowToolAction,
  type ArrowToolState,
} from "./diagramArrowsTool";

function run(state: ArrowToolState, ...actions: ArrowToolAction[]): ArrowToolState {
  return actions.reduce(arrowToolReducer, state);
}

const ACTIVE = run(initialArrowToolState(), { type: "setActive", active: true });

function withArrow(): ArrowToolState {
  return run(
    ACTIVE,
    { type: "beginDraft" },
    { type: "addPoint", point: [0, 0] },
    { type: "addPoint", point: [20, 10] },
    { type: "addPoint", point: [40, 0] },
    { type: "finishDraft", id: "a" },
  );
}

describe("arrow tool reducer", () => {
  it("adds points to a draft and finishes with at least two", () => {
    const one = run(ACTIVE, { type: "beginDraft" }, { type: "addPoint", point: [0, 0] }, { type: "finishDraft" });
    expect(one.arrows).toHaveLength(0);
    expect(one.draft).toEqual([[0, 0]]);
    const two = run(one, { type: "addPoint", point: [10, 0] }, { type: "finishDraft", id: "a" });
    expect(two.arrows).toHaveLength(1);
    expect(two.arrows[0]).toMatchObject({ id: "a", ...DEFAULT_ARROW });
    expect(two.draft).toBeNull();
    expect(two.selectedId).toBe("a");
  });

  it("drops the duplicate point a double-click leaves behind", () => {
    const state = run(
      ACTIVE,
      { type: "beginDraft" },
      { type: "addPoint", point: [0, 0] },
      { type: "addPoint", point: [10, 0] },
      { type: "addPoint", point: [10, 0] },
      { type: "finishDraft", id: "a" },
    );
    expect(state.arrows[0]!.points).toEqual([[0, 0], [10, 0]]);
  });

  it("removes the last placed point on Backspace and cancels on Escape", () => {
    const drafting = run(ACTIVE, { type: "beginDraft" }, { type: "addPoint", point: [0, 0] }, { type: "addPoint", point: [5, 5] });
    expect(arrowToolKeyAction(drafting, "Backspace")).toEqual({ type: "undoPoint" });
    expect(run(drafting, { type: "undoPoint" }).draft).toEqual([[0, 0]]);
    expect(run(drafting, { type: "escape" }).draft).toBeNull();
    expect(arrowToolKeyAction(drafting, "Enter")).toEqual({ type: "finishDraft" });
  });

  it("uses the defaults for new arrows and edits the selection otherwise", () => {
    const styled = run(ACTIVE, { type: "patch", patch: { style: "double", colour: "blue" } });
    expect(styled.defaults).toMatchObject({ style: "double", colour: "blue" });
    const made = run(styled, { type: "beginDraft" }, { type: "addPoint", point: [0, 0] }, { type: "addPoint", point: [9, 9] }, { type: "finishDraft", id: "a" });
    expect(made.arrows[0]).toMatchObject({ style: "double", colour: "blue" });
    const edited = run(made, { type: "patch", patch: { label: "Flow", heightM: 600 } });
    expect(selectedArrow(edited)).toMatchObject({ label: "Flow", heightM: 500, style: "double" });
    expect(edited.defaults.label).toBe("");
  });

  it("moves and deletes points but keeps at least two", () => {
    let state = withArrow();
    state = run(state, { type: "movePoint", id: "a", index: 1, point: [22, 12] });
    expect(state.arrows[0]!.points[1]).toEqual([22, 12]);
    state = run(state, { type: "select", id: "a", point: 1 }, { type: "deleteSelectedPoint" });
    expect(state.arrows[0]!.points).toEqual([[0, 0], [40, 0]]);
    expect(state.selectedPoint).toBeNull();
    const stuck = run(state, { type: "select", id: "a", point: 0 }, { type: "deleteSelectedPoint" });
    expect(stuck.arrows[0]!.points).toHaveLength(2);
  });

  it("deletes the whole arrow with Delete and the action", () => {
    const state = withArrow();
    expect(arrowToolKeyAction(state, "Delete")).toEqual({ type: "deleteSelected" });
    expect(run(state, { type: "deleteSelected" }).arrows).toHaveLength(0);
    expect(run(state, { type: "deleteArrow", id: "a" }).selectedId).toBeNull();
    const pointSelected = run(state, { type: "select", id: "a", point: 2 });
    expect(arrowToolKeyAction(pointSelected, "Delete")).toEqual({ type: "deleteSelectedPoint" });
    expect(arrowToolKeyAction(state, "Backspace")).toBeNull();
  });

  it("ignores keys when the tool is off", () => {
    expect(arrowToolKeyAction(initialArrowToolState(), "Delete")).toBeNull();
  });

  it("walks Escape back from point to arrow to nothing", () => {
    const state = run(withArrow(), { type: "select", id: "a", point: 1 });
    const one = run(state, { type: "escape" });
    expect(one).toMatchObject({ selectedId: "a", selectedPoint: null });
    expect(run(one, { type: "escape" }).selectedId).toBeNull();
  });

  it("clears the draft and selection when the tool closes or arrows are hidden", () => {
    const state = run(withArrow(), { type: "setActive", active: false });
    expect(state).toMatchObject({ active: false, selectedId: null, draft: null });
    expect(state.arrows).toHaveLength(1);
    const hidden = run(withArrow(), { type: "setVisible", visible: false });
    expect(hidden).toMatchObject({ visible: false, active: false });
  });

  it("replaces the arrow set and visibility for a restored view", () => {
    const state = run(withArrow(), { type: "replace", arrows: [], visible: false });
    expect(state).toMatchObject({ arrows: [], visible: false, selectedId: null });
    expect(run(withArrow(), { type: "replace", arrows: [] }).visible).toBe(true);
  });
});

describe("arrow tool clicks", () => {
  it("starts a draft on empty ground when nothing is selected", () => {
    expect(arrowToolClickActions(ACTIVE, { ground: [5, 5], hit: null })).toEqual([{ type: "beginDraft" }, { type: "addPoint", point: [5, 5] }]);
  });

  it("adds a point while drafting even over another arrow", () => {
    const drafting = run(ACTIVE, { type: "beginDraft" });
    expect(arrowToolClickActions(drafting, { ground: [1, 2], hit: { id: "x", point: null } })).toEqual([{ type: "addPoint", point: [1, 2] }]);
  });

  it("selects a hit arrow and deselects on empty space", () => {
    const state = withArrow();
    expect(arrowToolClickActions(state, { ground: [0, 0], hit: { id: "a", point: 2 } })).toEqual([{ type: "select", id: "a", point: 2 }]);
    expect(arrowToolClickActions(state, { ground: [90, 90], hit: null })).toEqual([{ type: "select", id: null }]);
  });

  it("does nothing when the tool is off", () => {
    expect(arrowToolClickActions(initialArrowToolState(), { ground: [0, 0], hit: null })).toEqual([]);
  });
});
