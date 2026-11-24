import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildArrowShape } from "./diagramArrows";
import { arrowLabelWorldPoint, arrowShapeGeometry, arrowWorldPoint, groundAtFor, intersectArrowPlane, projectArrowLabels } from "./diagramArrows3d";

describe("arrow 3D geometry", () => {
  const flat = () => 0;

  it("lays triangles flat at the arrow height with north on -z", () => {
    const shape = buildArrowShape([[0, 0], [100, 50]], "bold", "m", 500);
    const geometry = arrowShapeGeometry(shape, flat, 20)!;
    const position = geometry.getAttribute("position");
    expect(position.count % 3).toBe(0);
    for (let i = 0; i < position.count; i += 1) expect(position.getY(i)).toBeCloseTo(20.05);
    const tip = shape.heads[0]![0];
    const zs = Array.from({ length: position.count }, (_, i) => position.getZ(i));
    expect(zs).toContain(-tip[1]);
  });

  it("follows the ground under the arrow", () => {
    const slope = (east: number) => east * 0.1;
    const geometry = arrowShapeGeometry(buildArrowShape([[0, 0], [100, 0]], "line", "m", 500), slope, 10)!;
    const position = geometry.getAttribute("position");
    const ys = Array.from({ length: position.count }, (_, i) => position.getY(i));
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys) + 5);
  });

  it("returns null for an empty shape and uses no ground without terrain", () => {
    expect(arrowShapeGeometry({ ribbons: [], heads: [] }, flat, 0)).toBeNull();
    expect(groundAtFor({ terrain: undefined, sideM: 500 })(10, 10)).toBe(0);
    expect(arrowWorldPoint([3, 4], flat, 20).toArray()).toEqual([3, 20.05, -4]);
  });

  it("finds the east and north under a ray at the arrow height", () => {
    const ray = new THREE.Ray(new THREE.Vector3(40, 200, -30), new THREE.Vector3(0, -1, 0));
    const hit = intersectArrowPlane(ray, flat, 20)!;
    expect(hit[0]).toBeCloseTo(40);
    expect(hit[1]).toBeCloseTo(30);
    expect(intersectArrowPlane(new THREE.Ray(new THREE.Vector3(0, 30, 0), new THREE.Vector3(0, 1, 0)), flat, 20)).toBeNull();
  });

  describe("label anchor", () => {
    const arrow = { id: "a", label: "Flow", points: [[0, 0], [100, 0]] as [number, number][], heightM: 40 };

    it("floats at the arrow height in perspective and iso", () => {
      expect(arrowLabelWorldPoint(arrow, flat, false).y).toBeCloseTo(40.05);
    });

    it("sits on the flat plane in Plan, whatever the height or terrain", () => {
      const point = arrowLabelWorldPoint(arrow, (east) => east * 0.1, true);
      expect(point.y).toBeCloseTo(0.05);
      expect(point.x).toBeCloseTo(50, 0);
    });

    it("projects Plan labels to the flat arrow position under a tilted camera", () => {
      const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
      camera.position.set(50, 300, 200);
      camera.lookAt(50, 0, 0);
      const floating = projectArrowLabels(camera, [arrow], flat, 800, 800)[0]!;
      const onFlat = projectArrowLabels(camera, [arrow], flat, 800, 800, 0, 0, true)[0]!;
      expect(onFlat.y).not.toBeCloseTo(floating.y, 0);
    });
  });
});
