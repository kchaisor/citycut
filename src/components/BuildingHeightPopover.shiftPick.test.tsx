// @vitest-environment happy-dom
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
      onClose={() => undefined}
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

  it("keeps a press without Shift on the card", () => {
    const ctx = setup();
    detach = ctx.detach;
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
