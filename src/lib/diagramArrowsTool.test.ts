// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DEFAULT_ARROW } from "./diagramArrows";
import {
  arrowKeyContext,
  arrowToolClickActions,
  isDoubleClick,
  arrowToolKeyAction,
  arrowToolReducer,
  initialArrowToolState,
  selectedArrow,
  type ArrowClick,
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
    const edited = run(made, { type: "patch", patch: { width: 2, heightM: 600 } });
    expect(selectedArrow(edited)).toMatchObject({ width: 2, heightM: 500, style: "double" });
    expect(edited.defaults.width).toBe(DEFAULT_ARROW.width);
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

  it("finishes the draft on the second click of a double-click without adding a point", () => {
    const drafting = run(ACTIVE, { type: "beginDraft" }, { type: "addPoint", point: [0, 0] }, { type: "addPoint", point: [9, 0] });
    expect(arrowToolClickActions(drafting, { ground: [9.1, 0], hit: null }, true)).toEqual([{ type: "finishDraft" }]);
    expect(arrowToolClickActions(ACTIVE, { ground: [9, 0], hit: null }, true)[0]).toEqual({ type: "beginDraft" });
  });

  it("recognises a double-click by time and distance", () => {
    expect(isDoubleClick(null, { t: 0, x: 0, y: 0 })).toBe(false);
    expect(isDoubleClick({ t: 0, x: 10, y: 10 }, { t: 200, x: 12, y: 11 })).toBe(true);
    expect(isDoubleClick({ t: 0, x: 10, y: 10 }, { t: 900, x: 10, y: 10 })).toBe(false);
    expect(isDoubleClick({ t: 0, x: 10, y: 10 }, { t: 100, x: 60, y: 10 })).toBe(false);
  });
});

describe("new-arrow defaults", () => {
  it("clears the selection on New arrow so panel edits set the defaults", () => {
    const made = withArrow();
    expect(made.selectedId).toBe("a");
    const fresh = run(made, { type: "beginDraft" });
    expect(fresh.selectedId).toBeNull();
    const edited = run(fresh, { type: "patch", patch: { colour: "red", speed: 2 } });
    expect(edited.defaults).toMatchObject({ colour: "red", speed: 2 });
    expect(edited.arrows[0]).toMatchObject({ colour: DEFAULT_ARROW.colour, speed: DEFAULT_ARROW.speed });
    const drawn = run(edited, { type: "addPoint", point: [0, 0] }, { type: "addPoint", point: [9, 0] }, { type: "finishDraft", id: "b" });
    expect(drawn.arrows[1]).toMatchObject({ id: "b", colour: "red", speed: 2 });
    expect(drawn.selectedId).toBe("b");
  });

  it("applies edits to the new arrow right after finishing, and to the defaults after New arrow again", () => {
    const made = run(withArrow(), { type: "patch", patch: { style: "bold" } });
    expect(made.arrows[0]!.style).toBe("bold");
    expect(made.defaults.style).toBe(DEFAULT_ARROW.style);
    const next = run(made, { type: "beginDraft" }, { type: "patch", patch: { style: "line" } });
    expect(next.arrows[0]!.style).toBe("bold");
    expect(next.defaults.style).toBe("line");
  });

  it("edits the defaults while placing even if a selection somehow remains", () => {
    const stray: ArrowToolState = { ...withArrow(), draft: [[0, 0]] };
    const edited = run(stray, { type: "patch", patch: { width: 1.65 } });
    expect(edited.defaults.width).toBe(1.65);
    expect(edited.arrows[0]!.width).toBe(DEFAULT_ARROW.width);
    expect(run(stray, { type: "addPoint", point: [1, 1] }).selectedId).toBeNull();
  });

  it("selecting an arrow loads it and abandons a half-placed draft", () => {
    const state = run(withArrow(), { type: "beginDraft" }, { type: "addPoint", point: [3, 3] }, { type: "select", id: "a" });
    expect(state.draft).toBeNull();
    expect(selectedArrow(state)?.id).toBe("a");
  });
});

describe("closing the tool", () => {
  it("clears selection, draft and point on Done and on the toolbar toggle", () => {
    const state = run(withArrow(), { type: "select", id: "a", point: 1 });
    const done = run(state, { type: "setActive", active: false });
    expect(done).toMatchObject({ active: false, draft: null, selectedId: null, selectedPoint: null });
    const placing = run(withArrow(), { type: "beginDraft" }, { type: "addPoint", point: [1, 1] }, { type: "setActive", active: false });
    expect(placing).toMatchObject({ active: false, draft: null, selectedId: null });
  });

  it("opening the tool turns arrows visible", () => {
    const hidden = run(initialArrowToolState(), { type: "setVisible", visible: false }, { type: "setActive", active: true });
    expect(hidden).toMatchObject({ active: true, visible: true });
  });
});

describe("keys from focused controls", () => {
  const drafting = run(ACTIVE, { type: "beginDraft" }, { type: "addPoint", point: [0, 0] }, { type: "addPoint", point: [5, 5] });
  const panel = (tag: string, props: Record<string, string> = {}) => {
    const card = document.createElement("div");
    card.className = "arrows-card";
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) el.setAttribute(key, value);
    card.append(el);
    return el;
  };

  it("finishes on Enter and cancels on Escape from panel buttons, selects and number inputs", () => {
    for (const el of [panel("button"), panel("select"), panel("input", { type: "number" })]) {
      const context = arrowKeyContext(el);
      expect(arrowToolKeyAction(drafting, "Enter", context)).toEqual({ type: "finishDraft" });
      expect(arrowToolKeyAction(drafting, "Escape", context)).toEqual({ type: "escape" });
    }
  });

  it("leaves Backspace and Delete to panel text editing", () => {
    const context = arrowKeyContext(panel("input", { type: "number" }));
    expect(arrowToolKeyAction(drafting, "Backspace", context)).toBeNull();
    expect(arrowToolKeyAction(drafting, "Delete", context)).toBeNull();
  });

  it("ignores Enter in text fields outside the Arrows panel", () => {
    const outside = document.createElement("input");
    expect(arrowToolKeyAction(drafting, "Enter", arrowKeyContext(outside))).toBeNull();
  });
});

describe("node and whole-arrow editing", () => {
  it("selects a node from a node hit and the whole arrow from a body hit", () => {
    const state = withArrow();
    expect(arrowToolClickActions(state, { ground: [0, 0], hit: { id: "a", point: 1 } })).toEqual([{ type: "select", id: "a", point: 1 }]);
    expect(arrowToolClickActions(state, { ground: [0, 0], hit: { id: "a", point: null } })).toEqual([{ type: "select", id: "a", point: null }]);
  });

  it("returns to whole-arrow mode on empty space before it deselects", () => {
    const node = run(withArrow(), { type: "select", id: "a", point: 1 });
    const click: ArrowClick = { ground: [90, 90], hit: null };
    expect(arrowToolClickActions(node, click)).toEqual([{ type: "select", id: "a", point: null }]);
    const whole = run(node, ...arrowToolClickActions(node, click));
    expect(whole).toMatchObject({ selectedId: "a", selectedPoint: null });
    expect(arrowToolClickActions(whole, click)).toEqual([{ type: "select", id: null }]);
  });

  it("moves a whole arrow, a point and a node height", () => {
    const base = withArrow();
    const moved = run(base, { type: "moveArrow", id: "a", dx: 5, dy: -2 });
    expect(moved.arrows[0]!.points).toEqual([[5, -2], [25, 8], [45, -2]]);
    const point = run(base, { type: "movePoint", id: "a", index: 1, point: [1, 2] });
    expect(point.arrows[0]!.points[1]).toEqual([1, 2]);
    expect(point.arrows[0]!.points[0]).toEqual([0, 0]);
    const raised = run(base, { type: "setPointHeight", id: "a", index: 1, height: 12.345, bases: [3, 4, 5] });
    expect(raised.arrows[0]!.pointHeights).toEqual([3, 12.35, 5]);
    const again = run(raised, { type: "setPointHeight", id: "a", index: 2, height: 9 });
    expect(again.arrows[0]!.pointHeights).toEqual([3, 12.35, 9]);
  });

  it("ignores node heights without bases and clamps them", () => {
    const base = withArrow();
    expect(run(base, { type: "setPointHeight", id: "a", index: 1, height: 3 }).arrows[0]!.pointHeights).toBeUndefined();
    const clamped = run(base, { type: "setPointHeight", id: "a", index: 0, height: 9999, bases: [0, 0, 0] });
    expect(clamped.arrows[0]!.pointHeights![0]! + clamped.arrows[0]!.heightM).toBe(2000);
    const low = run(base, { type: "setPointHeight", id: "a", index: 0, height: -9999, bases: [0, 0, 0] });
    expect(low.arrows[0]!.pointHeights![0]! + low.arrows[0]!.heightM).toBe(-100);
  });

  it("drops the node height with its node", () => {
    const state = run(
      withArrow(),
      { type: "setPointHeight", id: "a", index: 1, height: 7, bases: [1, 2, 3] },
      { type: "select", id: "a", point: 1 },
      { type: "deleteSelectedPoint" },
    );
    expect(state.arrows[0]!.points).toEqual([[0, 0], [40, 0]]);
    expect(state.arrows[0]!.pointHeights).toEqual([1, 3]);
  });

  it("flattens and smooths from the ground when no node heights exist", () => {
    const hilly = (east: number) => (east === 20 ? 30 : 0);
    const selected = run(withArrow(), { type: "select", id: "a" });
    const flat = run(selected, { type: "flatten", groundAt: hilly });
    expect(flat.arrows[0]!.pointHeights).toEqual([10, 10, 10]);
    const smooth = run(selected, { type: "smooth", groundAt: hilly });
    const heights = smooth.arrows[0]!.pointHeights!;
    expect(heights[0]).toBe(0);
    expect(heights[2]).toBe(0);
    expect(heights[1]).toBeLessThan(30);
    expect(smooth.arrows[0]!.points).toEqual(selected.arrows[0]!.points);
  });

  it("flattens at zero without a ground and does nothing with no selection", () => {
    const selected = run(withArrow(), { type: "select", id: "a" });
    expect(run(selected, { type: "flatten" }).arrows[0]!.pointHeights).toEqual([0, 0, 0]);
    const none = run(withArrow(), { type: "select", id: null });
    expect(run(none, { type: "flatten" })).toBe(none);
    expect(run(none, { type: "smooth" })).toBe(none);
  });

  it("flattens from the stored node heights once they exist", () => {
    const state = run(
      withArrow(),
      { type: "select", id: "a" },
      { type: "setPointHeight", id: "a", index: 0, height: 6, bases: [0, 0, 0] },
      { type: "flatten", groundAt: () => 100 },
    );
    expect(state.arrows[0]!.pointHeights).toEqual([2, 2, 2]);
  });
});

describe("undo", () => {
  it("steps back through discrete edits", () => {
    let state = withArrow();
    expect(state.past).toHaveLength(1);
    state = run(state, { type: "patch", patch: { width: 2 } });
    state = run(state, { type: "flatten" });
    expect(state.past).toHaveLength(3);
    state = run(state, { type: "undo" });
    expect(state.arrows[0]!.pointHeights).toBeUndefined();
    expect(state.arrows[0]!.width).toBe(2);
    state = run(state, { type: "undo" });
    expect(state.arrows[0]!.width).toBe(DEFAULT_ARROW.width);
    state = run(state, { type: "undo" });
    expect(state.arrows).toHaveLength(0);
    expect(state.selectedId).toBeNull();
    expect(run(state, { type: "undo" })).toBe(state);
  });

  it("restores deleted arrows and nodes", () => {
    const base = run(withArrow(), { type: "select", id: "a", point: 1 });
    const nodeGone = run(base, { type: "deleteSelectedPoint" });
    expect(run(nodeGone, { type: "undo" }).arrows[0]!.points).toHaveLength(3);
    const arrowGone = run(base, { type: "deleteArrow", id: "a" });
    const back = run(arrowGone, { type: "undo" });
    expect(back.arrows).toHaveLength(1);
  });

  it("keeps drags out of history until they are committed once", () => {
    const base = withArrow();
    const before = base.arrows;
    const dragged = run(
      base,
      { type: "moveArrow", id: "a", dx: 1, dy: 0 },
      { type: "moveArrow", id: "a", dx: 1, dy: 0 },
      { type: "patch", patch: { heightM: 40 }, record: false },
    );
    expect(dragged.past).toHaveLength(base.past.length);
    const committed = run(dragged, { type: "commitHistory", before });
    expect(committed.past).toHaveLength(base.past.length + 1);
    const undone = run(committed, { type: "undo" });
    expect(undone.arrows).toBe(before);
    expect(run(base, { type: "commitHistory", before: base.arrows }).past).toBe(base.past);
  });

  it("does not record default edits and bounds the stack", () => {
    const defaults = run(ACTIVE, { type: "patch", patch: { width: 2 } });
    expect(defaults.past).toHaveLength(0);
    let state = withArrow();
    for (let i = 0; i < 40; i += 1) state = run(state, { type: "patch", patch: { width: 0.5 + (i % 5) * 0.1 } });
    expect(state.past.length).toBe(30);
  });

  it("clears history when arrows are replaced and drops a stale node selection", () => {
    expect(run(withArrow(), { type: "replace", arrows: [] }).past).toEqual([]);
    const state = run(withArrow(), { type: "select", id: "a", point: 2 }, { type: "deleteSelectedPoint" }, { type: "select", id: "a", point: 1 });
    expect(run(state, { type: "undo" })).toMatchObject({ selectedId: "a", selectedPoint: 1 });
  });

  it("maps Ctrl+Z and Cmd+Z to undo, or to the last draft point while drawing", () => {
    const state = withArrow();
    expect(arrowToolKeyAction(state, "z", NO_FOCUS, true)).toEqual({ type: "undo" });
    expect(arrowToolKeyAction(state, "Z", NO_FOCUS, true)).toEqual({ type: "undo" });
    expect(arrowToolKeyAction(state, "z", NO_FOCUS, false)).toBeNull();
    expect(arrowToolKeyAction(ACTIVE, "z", NO_FOCUS, true)).toBeNull();
    const drafting = run(ACTIVE, { type: "beginDraft" }, { type: "addPoint", point: [0, 0] });
    expect(arrowToolKeyAction(drafting, "z", NO_FOCUS, true)).toEqual({ type: "undoPoint" });
    expect(arrowToolKeyAction({ ...state, active: false }, "z", NO_FOCUS, true)).toBeNull();
  });

  it("undoes from panel controls but not from text fields elsewhere", () => {
    const state = withArrow();
    expect(arrowToolKeyAction(state, "z", { editable: true, panel: true }, true)).toEqual({ type: "undo" });
    expect(arrowToolKeyAction(state, "z", { editable: true, panel: false }, true)).toBeNull();
  });
});

const NO_FOCUS = { editable: false, panel: false };
