// @vitest-environment happy-dom
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { arrowViewportLabels } from "./diagramArrowLabels";
import { ARROW_LABEL_LIFT_PX, markArrowEditor, projectArrowLabels, withArrowEditorHidden } from "./diagramArrows3d";

const flat = () => 0;
const arrow = { id: "a", label: "Flow", points: [[-20, 0], [20, 0]] as [number, number][], heightM: 10 };

function orthoAbove(halfWidth: number): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfWidth, -halfWidth, 0.1, 1000);
  camera.position.set(0, 100, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

describe("arrow labels in an export frame", () => {
  it("projects the label anchor into the given frame, lifted above the arrow", () => {
    const labels = projectArrowLabels(orthoAbove(50), [arrow], flat, 200, 200);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.text).toBe("Flow");
    expect(labels[0]!.x).toBeCloseTo(100, 3);
    expect(labels[0]!.y).toBeCloseTo(100 - ARROW_LABEL_LIFT_PX, 3);
  });

  it("recomputes positions for a different camera, so whole-site framing moves the label", () => {
    const off = { ...arrow, points: [[20, 20], [40, 20]] as [number, number][] };
    const near = projectArrowLabels(orthoAbove(50), [off], flat, 200, 200)[0]!;
    const far = projectArrowLabels(orthoAbove(100), [off], flat, 200, 200)[0]!;
    expect(near.x).toBeGreaterThan(far.x);
    expect(far.x).toBeGreaterThan(100);
  });

  it("drops empty labels and labels outside the frame", () => {
    expect(projectArrowLabels(orthoAbove(50), [{ ...arrow, label: "  " }], flat, 200, 200)).toEqual([]);
    expect(projectArrowLabels(orthoAbove(5), [{ ...arrow, points: [[40, 0], [60, 0]] }], flat, 200, 200)).toEqual([]);
  });

  it("offsets labels into the on-screen rect", () => {
    const [label] = projectArrowLabels(orthoAbove(50), [arrow], flat, 200, 200, 30, 40);
    expect(label!.x).toBeCloseTo(130, 3);
    expect(label!.y).toBeCloseTo(40 + 100 - ARROW_LABEL_LIFT_PX, 3);
  });

  it("turns screen labels into centred capture boxes for the viewport PNG", () => {
    const [box] = arrowViewportLabels([{ text: "Flow", x: 100, y: 80 }]);
    expect(box!.text).toBe("Flow");
    expect(box!.x + box!.width / 2).toBeCloseTo(100, 6);
    expect(box!.y + box!.height / 2).toBeCloseTo(80, 6);
  });
});

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
});
