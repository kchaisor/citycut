// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BuildingHeightPopover } from "./BuildingHeightPopover";
import { nextHideSelection } from "../lib/hideSelection";
import { attachSceneInspectPick } from "../lib/sceneInspectPick";
import { SHIFT_PICK_CLASS, attachShiftPickPass } from "../lib/shiftPickPass";
import type { BuildingFeat } from "../types";

vi.mock("../lib/buildingPopupLookup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/buildingPopupLookup")>();
  return {
    ...actual,
    loadBuildingPopupDetails: async (building: BuildingFeat) => actual.emptyBuildingPopupDetails(building),
  };
});

const A = 11;
const B = 22;
const AT_A = { clientX: 50, clientY: 100 };
const AT_B = { clientX: 150, clientY: 100 };

const buildingA: BuildingFeat = {
  id: A,
  ring: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
  holes: [],
  height: 24,
  use: "commercial",
  source: "osm_tag",
} as BuildingFeat;

function box(buildingId: number, x: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  mesh.position.x = x;
  mesh.userData.buildingId = buildingId;
  return mesh;
}

function press(target: Element, at: { clientX: number; clientY: number }, shiftKey: boolean) {
  for (const type of ["pointerdown", "pointerup"]) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, shiftKey, ...at }));
  }
}

function setup() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.add(box(A, -2.3), box(B, 2.3));
  root.updateMatrixWorld(true);

  let hideSelection: number[] = [];
  const onHideSelected = vi.fn();
  const onClose = vi.fn();
  const onClear = vi.fn();
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  const detachPick = attachSceneInspectPick(
    canvas,
    camera,
    root,
    { trees: [], sideM: 400 },
    {
      onPick: (selection) => {
        if (selection.kind !== "building") return;
        hideSelection = nextHideSelection(hideSelection, selection.buildingId, Boolean(selection.additive));
      },
      onClear,
    },
  );
  const detachPass = attachShiftPickPass();

  press(canvas, AT_A, false);
  render(
    <BuildingHeightPopover
      building={buildingA}
      center={{ lat: -37.8216, lon: 144.9645 }}
      onSave={() => undefined}
      onReset={() => undefined}
      onClose={onClose}
      selectedCount={1}
      onHideSelected={onHideSelected}
      onShowAll={() => undefined}
      floatingScreen={{ left: 100, top: 40 }}
    />,
  );
  const card = screen.getByRole("dialog", { name: "Building details" });
  const hint = screen.getByText(/Hold Shift and click/);
  const input = screen.getByRole("spinbutton") as HTMLInputElement;
  const hideButton = screen.getByRole("button", { name: /Hide selected/ });
  document.elementsFromPoint = (x: number, y: number) =>
    x >= 100 && y >= 40 ? [hint, card, canvas, document.body] : [canvas, document.body];

  return {
    canvas,
    card,
    hint,
    input,
    hideButton,
    onHideSelected,
    onClose,
    onClear,
    focus,
    selection: () => hideSelection,
    detach: () => {
      detachPick();
      detachPass();
    },
  };
}

let detach: (() => void) | null = null;

afterEach(() => {
  detach?.();
  detach = null;
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.classList.remove(SHIFT_PICK_CLASS);
});

describe("Shift-click with the floating building card in the way", () => {
  it("adds the building under the card while the height field is focused", () => {
    const ctx = setup();
    detach = ctx.detach;
    expect(ctx.selection()).toEqual([A]);
    expect(ctx.card.classList.contains("is-floating")).toBe(true);
    expect(document.activeElement).toBe(ctx.input);

    ctx.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, bubbles: true }));
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(true);
    press(ctx.hint, AT_B, true);

    expect(ctx.selection()).toEqual([A, B]);
    expect(document.activeElement).toBe(ctx.input);
  });

  it("still adds when no Shift keydown was seen before the press", () => {
    const ctx = setup();
    detach = ctx.detach;
    press(ctx.hint, AT_B, true);
    expect(ctx.selection()).toEqual([A, B]);
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(true);
  });

  it("adds the building even when the press lands on Hide selected or the height field", () => {
    const ctx = setup();
    detach = ctx.detach;
    press(ctx.hideButton, AT_B, true);
    expect(ctx.selection()).toEqual([A, B]);

    press(ctx.canvas, AT_A, false);
    expect(ctx.selection()).toEqual([A]);
    press(ctx.input, AT_B, true);
    expect(ctx.selection()).toEqual([A, B]);
  });

  it("still lets Hide selected work once Shift is released", () => {
    const ctx = setup();
    detach = ctx.detach;
    ctx.hideButton.click();
    expect(ctx.onHideSelected).toHaveBeenCalledTimes(1);
    expect(ctx.selection()).toEqual([A]);
  });

  it("does not retarget a plain press when nothing but the card is over a non-canvas panel", () => {
    const ctx = setup();
    detach = ctx.detach;
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    document.elementsFromPoint = () => [ctx.hint, ctx.card, panel];
    const onCard = vi.fn();
    ctx.card.addEventListener("pointerdown", onCard);
    press(ctx.hint, AT_B, false);
    expect(onCard).toHaveBeenCalledTimes(1);
    expect(ctx.selection()).toEqual([A]);
  });

  it("does not retarget when something other than the 3D canvas is under the card", () => {
    const ctx = setup();
    detach = ctx.detach;
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    document.elementsFromPoint = () => [ctx.hint, ctx.card, panel];
    press(ctx.hint, AT_B, true);
    expect(ctx.selection()).toEqual([A]);
  });
});

describe("plain click with the floating building card in the way", () => {
  it("replaces the selection with the building under the card without closing it", () => {
    const ctx = setup();
    detach = ctx.detach;
    expect(ctx.selection()).toEqual([A]);
    expect(document.activeElement).toBe(ctx.input);

    press(ctx.hint, AT_B, false);

    expect(ctx.selection()).toEqual([B]);
    expect(ctx.onClose).not.toHaveBeenCalled();
    expect(ctx.onClear).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(false);
  });

  it("replaces from the card body and header too", () => {
    const ctx = setup();
    detach = ctx.detach;
    press(ctx.card.querySelector(".building-detail-panel-body")!, AT_B, false);
    expect(ctx.selection()).toEqual([B]);
    press(ctx.canvas, AT_A, false);
    press(ctx.card.querySelector("header strong")!, AT_B, false);
    expect(ctx.selection()).toEqual([B]);
  });

  it("adds with Shift from the same spot on the card", () => {
    const ctx = setup();
    detach = ctx.detach;
    press(ctx.hint, AT_B, true);
    expect(ctx.selection()).toEqual([A, B]);
    expect(ctx.onClose).not.toHaveBeenCalled();
  });

  it("leaves presses on Hide selected, the height field and Close to those controls", () => {
    const ctx = setup();
    detach = ctx.detach;
    const onCanvas = vi.fn();
    ctx.canvas.addEventListener("pointerdown", onCanvas);
    const close = screen.getByRole("button", { name: "Close" });
    for (const control of [ctx.hideButton, ctx.input, close, close.querySelector("svg")!]) {
      const reached = vi.fn();
      control.addEventListener("pointerdown", reached);
      press(control, AT_B, false);
      expect(reached).toHaveBeenCalledTimes(1);
    }
    expect(onCanvas).not.toHaveBeenCalled();
    expect(ctx.selection()).toEqual([A]);
    ctx.hideButton.click();
    expect(ctx.onHideSelected).toHaveBeenCalledTimes(1);
  });

  it("never clears or closes when a press through the card finds no building", () => {
    const ctx = setup();
    detach = ctx.detach;
    const empty = { clientX: 110, clientY: 190 };
    press(ctx.hint, empty, false);
    press(ctx.hint, empty, true);
    expect(ctx.selection()).toEqual([A]);
    expect(ctx.onClear).not.toHaveBeenCalled();
    expect(ctx.onClose).not.toHaveBeenCalled();
    press(ctx.canvas, { clientX: 10, clientY: 190 }, false);
    expect(ctx.onClear).toHaveBeenCalledTimes(1);
  });
});

describe("the Shift hint on the building card", () => {
  it("shows the hint and Hide selected first in the body from the first selection", () => {
    const ctx = setup();
    detach = ctx.detach;
    const body = ctx.card.querySelector(".building-detail-panel-body")!;
    const block = body.firstElementChild!;
    expect(block.classList.contains("hide-buildings-block")).toBe(true);
    expect(block.contains(ctx.hint)).toBe(true);
    expect(block.contains(ctx.hideButton)).toBe(true);
    expect(ctx.hideButton.textContent).toBe("Hide selected (1)");
    expect(screen.getByRole("button", { name: "Show all" })).toBeTruthy();
  });

  it("focuses the height field without scrolling the hint away", () => {
    const ctx = setup();
    detach = ctx.detach;
    expect(document.activeElement).toBe(ctx.input);
    expect(ctx.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(ctx.focus.mock.calls.every(([options]) => options?.preventScroll === true)).toBe(true);
    expect((ctx.card.querySelector(".building-detail-panel-body") as HTMLElement).scrollTop).toBe(0);
  });

  it("pins the hide block to the top of the scrolling body", () => {
    const css = readFileSync("src/index.css", "utf8");
    const rule = /\n\.hide-buildings-block \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/top:\s*-8px/);
    expect(rule).toMatch(/margin:\s*-8px/);
    expect(rule).toMatch(/background:/);
    expect(rule).not.toMatch(/margin-top|border-top/);
  });
});
