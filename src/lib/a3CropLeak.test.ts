import { describe, expect, it } from "vitest";
import { comRecordsToTrees } from "./comTrees";
import { vicmapPointsToTrees } from "./vicmapTrees";
import { clipTransportLines } from "./dashedTransportLines";
import { cutSpecFromA3 } from "./cutSpec";
import { containsPoint, makeSiteFrame } from "./siteFrame";
import { toLocal } from "./geo";

const center = { lat: -37.8169, lon: 144.94297 };
const mPerDegLat = 111320;
const mPerDegLon = 111320 * Math.cos((center.lat * Math.PI) / 180);
const at = (e: number, n: number) => ({ lat: center.lat + n / mPerDegLat, lon: center.lon + e / mPerDegLon });

function a3Frame(orientation: "landscape" | "portrait") {
  const spec = cutSpecFromA3(3000, orientation);
  const sideM = Math.max(spec.widthM, spec.heightM);
  return {
    spec,
    sideM,
    frame: makeSiteFrame(sideM, "a3", { widthM: spec.widthM, heightM: spec.heightM }),
  };
}

function sampleGrid() {
  const grid: { lat: number; lon: number }[] = [];
  for (let e = -700; e <= 700; e += 50) for (let n = -700; n <= 700; n += 50) grid.push(at(e, n));
  return grid;
}

describe("A3 1:3000 cut crop", () => {
  for (const orientation of ["landscape", "portrait"] as const) {
    const { spec, sideM, frame } = a3Frame(orientation);
    const grid = sampleGrid();

    it(`${orientation}: CoM trees stay inside the A3 rectangle`, () => {
      const rows = grid.map((p, i) => ({
        ...p,
        id: String(i),
        genus: null,
        scientific: null,
        dbh_cm: null,
        age: null,
      })) as never;
      const trees = comRecordsToTrees(rows, center, frame);
      const out = trees.filter((t) => !containsPoint(frame, t.at));
      const inA3 = grid.filter((p) => containsPoint(frame, toLocal(p.lat, p.lon, center))).length;
      const missingInside = inA3 - (trees.length - out.length);
      expect(out.length).toBe(0);
      expect(missingInside).toBeLessThanOrEqual(0);
    });

    it(`${orientation}: Vicmap trees stay inside the A3 rectangle`, () => {
      const rows = grid.map((p) => ({ ...p, height_m: 8, crown_m: 6, dense: false })) as never;
      const trees = vicmapPointsToTrees(rows, center, frame);
      const out = trees.filter((t) => !containsPoint(frame, t.at));
      expect(out.length).toBe(0);
    });

    it(`${orientation}: 3D tram/rail dashes stay inside the A3 rectangle`, () => {
      const model = {
        center,
        sideM,
        widthM: spec.widthM,
        heightM: spec.heightM,
        frameShape: "a3",
        roads: [],
        tramLines: [[[0, -700], [0, 700]]],
      } as never;
      const { trams } = clipTransportLines(model);
      const halfH = spec.heightM / 2;
      const halfW = spec.widthM / 2;
      for (const line of trams) {
        for (const [e, n] of line) {
          expect(Math.abs(e)).toBeLessThanOrEqual(halfW + 0.01);
          expect(Math.abs(n)).toBeLessThanOrEqual(halfH + 0.01);
        }
      }
    });
  }
});