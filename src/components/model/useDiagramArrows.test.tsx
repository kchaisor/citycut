// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ARROW, type DiagramArrow } from "../../lib/diagramArrows";
import { useDiagramArrows } from "./useDiagramArrows";

const model = { center: { lat: -37.8, lon: 144.9 }, sideM: 500 };
const arrow = (id: string): DiagramArrow => ({ id, points: [[0, 0], [10, 0]], ...DEFAULT_ARROW });

beforeEach(() => window.localStorage.clear());

describe("named-view arrow restore", () => {
  it("restores the saved arrow set and visibility, and clears selection", () => {
    const { result } = renderHook(() => useDiagramArrows(model));
    act(() => result.current.restore({ visible: false, items: [arrow("a"), arrow("b")] }));
    expect(result.current.state.arrows.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.current.state.visible).toBe(false);
    act(() => result.current.dispatch({ type: "setVisible", visible: true }));
    const saved = result.current.snapshot();
    act(() => result.current.restore({ visible: false, items: [] }));
    act(() => result.current.restore(saved));
    expect(result.current.state.arrows.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.current.state.visible).toBe(true);
    expect(result.current.state.selectedId).toBeNull();
  });

  it("leaves current arrows alone for a view saved before arrows existed", () => {
    const { result } = renderHook(() => useDiagramArrows(model));
    act(() => result.current.restore({ visible: true, items: [arrow("a")] }));
    act(() => result.current.restore(null));
    expect(result.current.state.arrows.map((a) => a.id)).toEqual(["a"]);
  });
});

describe("keyboard while placing", () => {
  function setup() {
    const hook = renderHook(() => useDiagramArrows(model));
    act(() => {
      hook.result.current.dispatch({ type: "beginDraft" });
      hook.result.current.dispatch({ type: "addPoint", point: [0, 0] });
      hook.result.current.dispatch({ type: "addPoint", point: [10, 0] });
    });
    const card = document.createElement("div");
    card.className = "arrows-card";
    document.body.append(card);
    return { hook, card };
  }
  const press = (target: Element, key: string) => act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));

  it("Enter on a panel button finishes the arrow", () => {
    const { hook, card } = setup();
    const button = document.createElement("button");
    card.append(button);
    press(button, "Enter");
    expect(hook.result.current.state.arrows).toHaveLength(1);
    expect(hook.result.current.state.draft).toBeNull();
  });
});
