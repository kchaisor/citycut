import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildArrowShape, emptyArrowShape } from "./diagramArrowsShape";
import {
  ARROW_GUMBALL,
  ARROW_LIFT_EPSILON_M,
  GUMBALL_DIRECTIONS,
  arrowBaseAt,
  arrowGumball,
  arrowGumballOrigin,
  arrowNodeBases,
  arrowShapeGeometry,
  arrowWorldPoint,
  disposeGumball,
  groundAtFor,
  gumballAxisDelta,
  gumballAxisHit,
  gumballAxisPlane,
  gumballLengthM,
  gumballPlaneHit,
  intersectArrowPlane,
} from "./diagramArrows3d";
import { parseDiagramArrow, type DiagramArrow } from "./diagramArrows";

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

describe("per-node vertical profile", () => {
  const bumpy = (east: number) => (east > 40 && east < 60 ? 30 : 0);
  const heightsOf = (geometry: THREE.BufferGeometry) => {
    const position = geometry.getAttribute("position");
    return Array.from({ length: position.count }, (_, i) => position.getY(i));
  };
  const arrow = (pointHeights?: number[]): DiagramArrow =>
    parseDiagramArrow({ id: "a", points: [[0, 0], [50, 10], [100, 0]], heightM: 10, pointHeights })!;

  it("follows the terrain bumps when no node heights are set", () => {
    const shape = buildArrowShape(arrow().points, "line", 1, 500);
    const ys = heightsOf(arrowShapeGeometry(shape, arrowBaseAt(arrow(), bumpy), 10)!);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(25);
  });

  it("lays a flattened arrow at one height over a bump", () => {
    const flattened = arrow([5, 5, 5]);
    const shape = buildArrowShape(flattened.points, "bold", 1, 500);
    const ys = heightsOf(arrowShapeGeometry(shape, arrowBaseAt(flattened, bumpy), flattened.heightM)!);
    for (const y of ys) expect(y).toBeCloseTo(5 + 10 + ARROW_LIFT_EPSILON_M, 4);
  });

  it("passes through each node height and never overshoots between them", () => {
    const profile = arrowBaseAt(arrow([0, 20, 4]), flat0);
    expect(profile(0, 0)).toBeCloseTo(0);
    expect(profile(50, 10)).toBeCloseTo(20);
    expect(profile(100, 0)).toBeCloseTo(4);
    for (let east = 0; east <= 100; east += 5) {
      const y = profile(east, east <= 50 ? (east / 50) * 10 : ((100 - east) / 50) * 10);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(20 + 1e-6);
    }
  });

  it("reads node bases from the heights or from the ground", () => {
    expect(arrowNodeBases(arrow([1, 2, 3]), bumpy)).toEqual([1, 2, 3]);
    expect(arrowNodeBases(arrow(), bumpy)).toEqual([0, 30, 0]);
  });
});

function flat0(): number {
  return 0;
}

describe("3-axis gumball", () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 3000);
  camera.position.set(0, 120, 300);
  camera.lookAt(0, 20, 0);
  camera.updateMatrixWorld();
  const at = new THREE.Vector3(0, 40, 0);
  const colours = { origin: "black", x: "red", y: "lime", z: "blue" };
  const rect = { width: 800, height: 800 };
  const rayThrough = (world: THREE.Vector3) => {
    const ndc = world.clone().project(camera);
    const through = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera);
    return new THREE.Ray(camera.position.clone(), through.sub(camera.position).normalize());
  };

  it("is an origin marker with a thin shaft and tip per axis, coloured red, green and blue", () => {
    const gumball = arrowGumball(at, colours);
    expect(gumball.userData[ARROW_GUMBALL]).toBe(true);
    expect(gumball.position.toArray()).toEqual([0, 40, 0]);
    const colourOf = (name: string) => ((gumball.getObjectByName(name) as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHexString();
    expect(colourOf("x-shaft")).toBe("ff0000");
    expect(colourOf("x-tip")).toBe("ff0000");
    expect(colourOf("y-shaft")).toBe("00ff00");
    expect(colourOf("z-shaft")).toBe("0000ff");
    expect(colourOf("origin")).toBe("000000");
    const shaft = (gumball.getObjectByName("z-shaft") as THREE.Mesh).geometry as THREE.CylinderGeometry;
    expect(shaft.parameters.radiusTop).toBeLessThan(0.03);
    disposeGumball(gumball);
  });

  it("points x east, y north on -z and z up", () => {
    expect(GUMBALL_DIRECTIONS.x.toArray()).toEqual([1, 0, 0]);
    expect(GUMBALL_DIRECTIONS.y.toArray()).toEqual([0, 0, -1]);
    expect(GUMBALL_DIRECTIONS.z.toArray()).toEqual([0, 1, 0]);
    const gumball = arrowGumball(at, colours);
    const tip = (axis: string) => gumball.getObjectByName(`${axis}-tip`)!.position;
    expect(tip("x").x).toBeGreaterThan(0.8);
    expect(tip("y").z).toBeLessThan(-0.8);
    expect(tip("z").y).toBeGreaterThan(0.8);
  });

  it("leaves out axes it is not given", () => {
    const gumball = arrowGumball(at, colours, ["x", "y"]);
    expect(gumball.getObjectByName("z-shaft")).toBeUndefined();
    expect(gumball.getObjectByName("x-shaft")).toBeDefined();
  });

  it("holds a constant length on screen at any distance", () => {
    const near = gumballLengthM(camera, new THREE.Vector3(0, 40, 200), 800, 60);
    const far = gumballLengthM(camera, new THREE.Vector3(0, 40, -600), 800, 60);
    expect(far).toBeGreaterThan(near * 2);
  });

  it("hits the axis under the pointer and misses empty space and the origin dead zone", () => {
    const oblique = new THREE.PerspectiveCamera(50, 1, 1, 3000);
    oblique.position.set(220, 140, 220);
    oblique.lookAt(0, 40, 0);
    oblique.updateMatrixWorld();
    const project = (world: THREE.Vector3): [number, number] => {
      const ndc = world.clone().project(oblique);
      return [(ndc.x * 0.5 + 0.5) * rect.width, (-ndc.y * 0.5 + 0.5) * rect.height];
    };
    const length = 30;
    const along = (axis: "x" | "y" | "z") => at.clone().addScaledVector(GUMBALL_DIRECTIONS[axis], length * 0.6);
    expect(gumballAxisHit(oblique, at, length, project(along("x")), rect, 8)).toBe("x");
    expect(gumballAxisHit(oblique, at, length, project(along("y")), rect, 8)).toBe("y");
    expect(gumballAxisHit(oblique, at, length, project(along("z")), rect, 8)).toBe("z");
    const [ox, oy] = project(at);
    expect(gumballAxisHit(oblique, at, length, [ox, oy], rect, 8)).toBeNull();
    expect(gumballAxisHit(oblique, at, length, [ox + 300, oy + 300], rect, 8)).toBeNull();
    expect(gumballAxisHit(oblique, at, length, project(along("z")), rect, 8, ["x", "y"])).toBeNull();
  });

  it("measures a drag along an axis on a camera-facing plane containing the axis", () => {
    for (const axis of ["x", "y", "z"] as const) {
      const plane = gumballAxisPlane(at, axis, camera)!;
      expect(Math.abs(plane.normal.dot(GUMBALL_DIRECTIONS[axis]))).toBeLessThan(1e-9);
      const start = gumballPlaneHit(rayThrough(at), plane)!;
      const moved = gumballPlaneHit(rayThrough(at.clone().addScaledVector(GUMBALL_DIRECTIONS[axis], 12)), plane)!;
      expect(gumballAxisDelta(moved, start, axis)).toBeCloseTo(12, 3);
    }
  });

  it("has no drag plane when looking along the axis", () => {
    const top = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
    top.position.set(0, 100, 0);
    top.up.set(0, 0, -1);
    top.lookAt(0, 0, 0);
    top.updateMatrixWorld();
    expect(gumballAxisPlane(at, "z", top)).toBeNull();
    expect(gumballAxisPlane(at, "x", top)).not.toBeNull();
  });

  it("sits at the arrow midpoint, or at the selected node", () => {
    const arrow = parseDiagramArrow({ id: "a", points: [[0, 0], [100, 0]], heightM: 10, pointHeights: [2, 8] })!;
    const mid = arrowGumballOrigin(arrow, null, flat0);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(5 + 10 + ARROW_LIFT_EPSILON_M, 1);
    expect(arrowGumballOrigin(arrow, 1, flat0).toArray()).toEqual([100, 18.05, -0]);
    const terrain = parseDiagramArrow({ id: "b", points: [[0, 0], [100, 0]], heightM: 10 })!;
    expect(arrowGumballOrigin(terrain, 0, () => 7).y).toBeCloseTo(17.05);
  });
});
