import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  ISO_AZIMUTH_RAD,
  ISO_CAMERA_UP,
  ISO_CORNERS,
  ISO_ELEVATION_RAD,
  ISO_FIT_MARGIN,
  type Aabb,
  type Vec3,
  azimuthBetweenAxesRad,
  azimuthFromEastRad,
  bearingFromNorthRad,
  cornersOf,
  dot,
  elevationRad,
  eyeDistance,
  fitOrthoZoom,
  frameCentre,
  isoEye,
  isoOffset,
  length,
  normalize,
  orthoNearFar,
  projectedSize,
  scale,
  sub,
} from "./isoCamera";

const AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** A 1 km cut, 80 m of relief and towers, centred on the origin in plan. */
const CUT: Aabb = {
  min: [-500, 8, -500],
  max: [500, 280, 500],
};

describe("iso offsets", () => {
  it("uses elevation arctan(1/√2) and a 45° azimuth between the axes", () => {
    expect(ISO_ELEVATION_RAD).toBeCloseTo(Math.atan(1 / Math.SQRT2), 12);
    expect(ISO_AZIMUTH_RAD).toBeCloseTo(Math.PI / 4, 12);
    for (const corner of ISO_CORNERS) {
      const offset = isoOffset(corner);
      expect(length(offset)).toBeCloseTo(1, 12);
      expect(elevationRad(offset)).toBeCloseTo(ISO_ELEVATION_RAD, 12);
      expect(azimuthBetweenAxesRad(offset)).toBeCloseTo(ISO_AZIMUTH_RAD, 12);
      const view = scale(offset, -1);
      const foreshortening = AXES.map((axis) => Math.abs(dot(view, axis)));
      expect(foreshortening[0]).toBeCloseTo(foreshortening[1], 12);
      expect(foreshortening[1]).toBeCloseTo(foreshortening[2], 12);
      expect(foreshortening[0]).toBeCloseTo(1 / Math.sqrt(3), 12);
    }
  });

  it("points each corner at equal east, up, and north components", () => {
    const unit = 1 / Math.sqrt(3);
    expect(isoOffset("ne")).toEqual([expect.closeTo(unit, 12), expect.closeTo(unit, 12), expect.closeTo(-unit, 12)]);
    expect(isoOffset("nw")).toEqual([expect.closeTo(-unit, 12), expect.closeTo(unit, 12), expect.closeTo(-unit, 12)]);
    expect(isoOffset("se")).toEqual([expect.closeTo(unit, 12), expect.closeTo(unit, 12), expect.closeTo(unit, 12)]);
    expect(isoOffset("sw")).toEqual([expect.closeTo(-unit, 12), expect.closeTo(unit, 12), expect.closeTo(unit, 12)]);
  });

  it("puts SW south-west, looking north-east, and the other corners on the compass", () => {
    expect(bearingFromNorthRad(isoOffset("sw"))).toBeCloseTo(Math.PI * 1.25, 12);
    expect(bearingFromNorthRad(isoOffset("ne"))).toBeCloseTo(Math.PI * 0.25, 12);
    expect(bearingFromNorthRad(isoOffset("se"))).toBeCloseTo(Math.PI * 0.75, 12);
    expect(bearingFromNorthRad(isoOffset("nw"))).toBeCloseTo(Math.PI * 1.75, 12);
    const look = scale(isoOffset("sw"), -1);
    expect(look[0]).toBeGreaterThan(0);
    expect(look[2]).toBeLessThan(0);
    expect(azimuthFromEastRad(isoOffset("sw"))).toBeCloseTo((3 * Math.PI) / 4, 12);
    expect(azimuthFromEastRad(isoOffset("ne"))).toBeCloseTo(-Math.PI / 4, 12);
  });
});

function isoCamera(corner: (typeof ISO_CORNERS)[number], up: THREE.Vector3): THREE.OrthographicCamera {
  const centre = new THREE.Vector3(0, 40, 0);
  const eye = isoEye([centre.x, centre.y, centre.z], corner, eyeDistance(CUT));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
  camera.up.copy(up);
  camera.position.set(eye[0], eye[1], eye[2]);
  camera.lookAt(centre);
  return camera;
}

describe("iso camera orientation", () => {
  it("snaps isometric views to world Y-up", () => {
    expect(ISO_CAMERA_UP).toEqual([0, 1, 0]);
    for (const corner of ISO_CORNERS) {
      const camera = isoCamera(corner, new THREE.Vector3(...ISO_CAMERA_UP));
      expect(camera.up.x).toBeCloseTo(0, 10);
      expect(camera.up.y).toBeCloseTo(1, 10);
      expect(camera.up.z).toBeCloseTo(0, 10);
    }
  });

  it("tilts the iso view when plan north-up leaves Z as camera up", () => {
    const iso = isoCamera("sw", new THREE.Vector3(...ISO_CAMERA_UP));
    const skewed = isoCamera("sw", new THREE.Vector3(0, 0, -1));
    expect(iso.quaternion.angleTo(skewed.quaternion)).toBeGreaterThan(0.5);
  });
});

describe("ortho near and far", () => {
  it("brackets every corner of the bounds from each isometric eye", () => {
    const centre = frameCentre(CUT);
    expect(centre[0]).toBeCloseTo(0, 8);
    expect(centre[2]).toBeCloseTo(0, 8);
    const distance = eyeDistance(CUT);
    for (const corner of ISO_CORNERS) {
      const eye = isoEye(centre, corner, distance);
      const planes = orthoNearFar(CUT, eye, centre);
      const look = normalize(sub(centre, eye));
      for (const point of cornersOf(CUT)) {
        const depth = dot(sub(point, eye), look);
        expect(depth).toBeGreaterThan(planes.near);
        expect(depth).toBeLessThan(planes.far);
      }
      expect(planes.near).toBeGreaterThan(0);
      expect(planes.far - planes.near).toBeLessThan(distance);
      expect(planes.far).toBeLessThan(2000 * 40);
    }
  });

  it("still brackets the bounds when the eye is inside the box", () => {
    const centre = frameCentre(CUT);
    const eye = isoEye(centre, "ne", 10);
    const planes = orthoNearFar(CUT, eye, centre);
    const look = normalize(sub(centre, eye));
    expect(planes.near).toBeLessThan(0);
    for (const point of cornersOf(CUT)) {
      const depth = dot(sub(point, eye), look);
      expect(depth).toBeGreaterThan(planes.near);
      expect(depth).toBeLessThan(planes.far);
    }
  });

  it("fits the projected cut inside the viewport with the stated margin", () => {
    const offset = isoOffset("sw");
    const { width, height } = projectedSize(CUT, offset);
    const zoom = fitOrthoZoom(CUT, offset, 1440, 900);
    expect(1440 / zoom).toBeGreaterThanOrEqual(width * ISO_FIT_MARGIN - 1e-6);
    expect(900 / zoom).toBeGreaterThanOrEqual(height * ISO_FIT_MARGIN - 1e-6);
    expect(zoom).toBeGreaterThan(0);
  });
});
