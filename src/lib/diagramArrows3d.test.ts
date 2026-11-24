import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildArrowShape, emptyArrowShape } from "./diagramArrowsShape";
import {
  ARROW_GUMBALL,
  arrowGumball,
  arrowShapeGeometry,
  arrowWorldPoint,
  disposeGumball,
  groundAtFor,
  gumballHit,
  gumballPlane,
  gumballWorldY,
  intersectArrowPlane,
} from "./diagramArrows3d";

describe("arrow 3D geometry", () => {
  const flat = () => 0;

  it("lays triangles flat at the arrow height with north on -z", () => {
    const shape = buildArrowShape([[0, 0], [100, 50]], "bold", 1, 500);
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
    const geometry = arrowShapeGeometry(buildArrowShape([[0, 0], [100, 0]], "line", 1, 500), slope, 10)!;
    const position = geometry.getAttribute("position");
    const ys = Array.from({ length: position.count }, (_, i) => position.getY(i));
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys) + 5);
  });

  it("returns null for an empty shape and uses no ground without terrain", () => {
    expect(arrowShapeGeometry(emptyArrowShape(), flat, 0)).toBeNull();
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

  it("carries a per-vertex alpha that fades comets and leaves solid bodies opaque", () => {
    const alphaOf = (style: "streak" | "bold") => {
      const geometry = arrowShapeGeometry(buildArrowShape([[0, 0], [300, 0]], style, 1, 500), flat, 20)!;
      const colour = geometry.getAttribute("color");
      expect(colour.itemSize).toBe(4);
      return { geometry, values: Array.from({ length: colour.count }, (_, i) => colour.getW(i)) };
    };
    const comets = alphaOf("streak");
    expect(comets.geometry.userData.faded).toBe(true);
    expect(Math.min(...comets.values)).toBeLessThan(0.05);
    expect(Math.max(...comets.values)).toBeGreaterThan(0.5);
    const solid = alphaOf("bold");
    expect(solid.geometry.userData.faded).toBe(false);
    expect(new Set(solid.values)).toEqual(new Set([1]));
  });

  it("triangulates dots and chevrons", () => {
    const dots = arrowShapeGeometry(buildArrowShape([[0, 0], [300, 0]], "dotted", 1, 500), flat, 20)!;
    const chevrons = arrowShapeGeometry(buildArrowShape([[0, 0], [300, 0]], "chevron", 1, 500), flat, 20)!;
    expect(dots.getAttribute("position").count % 3).toBe(0);
    expect(chevrons.getAttribute("position").count % 6).toBe(0);
  });
});

describe("height gumball", () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 3000);
  camera.position.set(0, 120, 300);
  camera.lookAt(0, 20, 0);
  camera.updateMatrixWorld();
  const at = new THREE.Vector3(0, 40, 0);

  it("stands a stem from the ground to the arrow with a ring and up and down handles", () => {
    const gumball = arrowGumball(at, 0, 5, "#ffffff");
    expect(gumball.userData[ARROW_GUMBALL]).toBe(true);
    expect(gumball.position.toArray()).toEqual([0, 40, 0]);
    expect(gumball.children).toHaveLength(4);
    const stem = gumball.children[0] as THREE.Mesh;
    expect((stem.geometry as THREE.CylinderGeometry).parameters.height).toBeCloseTo(40);
    disposeGumball(gumball);
  });

  it("drops the stem when the arrow lies on the ground", () => {
    expect(arrowGumball(new THREE.Vector3(0, 0, 0), 0, 5, "#ffffff").children).toHaveLength(3);
  });

  it("turns a vertical pointer move into a height change on a camera-facing plane", () => {
    const plane = gumballPlane(at, camera)!;
    const ray = (y: number) => {
      const target = new THREE.Vector3(0, y, 0).project(camera);
      const origin = camera.position.clone();
      const through = new THREE.Vector3(target.x, target.y, 0.5).unproject(camera);
      return new THREE.Ray(origin, through.sub(origin).normalize());
    };
    const low = gumballWorldY(ray(40), plane)!;
    const high = gumballWorldY(ray(70), plane)!;
    expect(low).toBeCloseTo(40, 3);
    expect(high - low).toBeCloseTo(30, 3);
  });

  it("has no drag plane when looking straight down", () => {
    const top = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
    top.position.set(0, 100, 0);
    top.up.set(0, 0, -1);
    top.lookAt(0, 0, 0);
    top.updateMatrixWorld();
    expect(gumballPlane(at, top)).toBeNull();
  });

  it("hits near the stem axis through the arrow and misses elsewhere", () => {
    const rect = { width: 800, height: 800 };
    const centre = new THREE.Vector3(0, 40, 0).project(camera);
    const px: [number, number] = [(centre.x * 0.5 + 0.5) * 800, (-centre.y * 0.5 + 0.5) * 800];
    expect(gumballHit(camera, at, 5, px, rect, 12)).toBe(true);
    expect(gumballHit(camera, at, 5, [px[0] + 200, px[1]], rect, 12)).toBe(false);
  });
});
