import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import { resolveLandmarkCut } from "./landmarkHeightPipeline";
import {
  assertLandmarkOsmGeometry,
  loadLandmarkOsmWays,
  pickLandmarkBuildingAtPoint,
} from "./landmarkOsmVerify";
import type { LandmarkRow } from "./landmarkHeights.test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function loadSnapshot() {
  const path = fileURLToPath(new URL("./fixtures/landmark-heights-snapshot.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as {
    cuts: { name: string; center: { lat: number; lon: number } }[];
  };
}

describe("landmarkOsmVerify", () => {
  it("fails when a row claims the wrong tower OSM way id", () => {
    const rows = landmarks as LandmarkRow[];
    const eureka = rows.find((row) => row.name === "Eureka Tower")!;
    const hwt = rows.find((row) => row.name === "HWT Tower (40 City Rd)")!;
    const spoofed: LandmarkRow = { ...eureka, osm: { ...eureka.osm, id: hwt.osm.id } };

    const snapshot = loadSnapshot();
    const cut = snapshot.cuts.find((c) => c.name === eureka.cut)!;
    const final = resolveLandmarkCut(cut as never);
    const pick = pickLandmarkBuildingAtPoint(final, eureka, cut.center, loadLandmarkOsmWays());
    expect(pick).not.toBeNull();

    const issue = assertLandmarkOsmGeometry(spoofed, pick!.building, cut.center, loadLandmarkOsmWays());
    expect(issue).toMatch(/covers .* of OSM way|outside OSM way|tag/i);
  });
});
