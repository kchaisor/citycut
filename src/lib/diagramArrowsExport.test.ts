// @vitest-environment happy-dom
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { visibleIn3d, type DiagramArrow } from "./diagramArrows";
import { ARROW_EDITOR, markArrowEditor, withArrowEditorHidden } from "./diagramArrows3d";
import { markExportOnly } from "./screenOnly";

describe("arrow editor handles in exports", () => {
  it("hides editor objects only while the work runs", () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh();
    const handle = new THREE.Mesh();
    markArrowEditor(handle);
    root.add(body, handle);
    const seen = withArrowEditorHidden(root, () => [body.visible, handle.visible]);
    expect(seen).toEqual([true, false]);
    expect(handle.visible).toBe(true);
  });

  it("hides the height gumball and its parts while an export runs", () => {
    const root = new THREE.Group();
    const gumball = new THREE.Group();
    const part = new THREE.Mesh();
    gumball.add(part);
    markArrowEditor(gumball);
    root.add(gumball);
    expect(gumball.userData[ARROW_EDITOR]).toBe(true);
    const during = withArrowEditorHidden(root, () => [gumball.visible, part.visible, part.parent?.visible]);
    expect(during[0]).toBe(false);
    expect(gumball.visible).toBe(true);
  });

  it("reveals the frozen export mesh while the work runs", () => {
    const root = new THREE.Group();
    const still = new THREE.Mesh();
    still.visible = false;
    markExportOnly(still);
    root.add(still);
    expect(withArrowEditorHidden(root, () => still.visible)).toBe(true);
    expect(still.visible).toBe(false);
  });

  it("leaves arrows hidden in 3D out of the 3D and Plan PNG and the model export", () => {
    const arrow = (id: string, showIn3d: boolean): DiagramArrow => ({
      id,
      points: [[0, 0], [10, 0]],
      style: "bold",
      colour: "ink",
      width: 1,
      heightM: 20,
      animation: "none",
      speed: 1,
      showIn3d,
      showInDrawing: true,
    });
    expect(visibleIn3d([arrow("shown", true), arrow("hidden", false)]).map((item) => item.id)).toEqual(["shown"]);
  });
});
