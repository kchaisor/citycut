import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import { pickBuildingAtPoint } from "./landmarkBuildingPick";
import { inferHeightTier, heightTierLabel } from "./buildingHeightResolve";
import {
  footprintMatchesExpectations,
  landmarkFootprintDescriptor,
} from "./landmarkFootprintDescriptor";
import { resolveLandmarkCut, type LandmarkCutSnapshot } from "./landmarkHeightPipeline";
import { snapshotCutName } from "./landmarkSnapshotAliases";

type Landmark = {
  name: string;
  lat: number;
  lon: number;
  heightM: number;
  toleranceM?: number;
  sourceUrl: string;
  compareMetric: string;
  sideM?: number;
  footprintMustContain: string[];
  /** Cited height was verified from text at sourceUrl, not from matching computed height. */
  independentEvidence?: boolean;
};

type SnapshotFile = {
  cuts: LandmarkCutSnapshot[];
};

function toleranceM(lm: Landmark): number {
  return Math.max(3, lm.heightM * 0.1, lm.toleranceM ?? 0);
}

function loadSnapshot(): SnapshotFile {
  const path = fileURLToPath(new URL("./fixtures/landmark-heights-snapshot.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as SnapshotFile;
}

function assertIndependentSource(lm: Landmark, computedM: number | null): string | null {
  if (/data\.melbourne\.vic\.gov\.au/i.test(lm.sourceUrl)) {
    return `${lm.name}: sourceUrl must not be CoM dataset (independent citation required)`;
  }
  if (/openstreetmap\.org/i.test(lm.sourceUrl)) {
    return `${lm.name}: sourceUrl must not be an OSM map link (independent citation required)`;
  }
  if (
    computedM != null &&
    Math.abs(computedM - lm.heightM) < 0.5 &&
    !lm.independentEvidence
  ) {
    return `${lm.name}: cited height matches computed (${computedM.toFixed(1)} m); independent source required`;
  }
  return null;
}

describe("Melbourne landmark height reference (CI)", () => {
  it("enforces tolerance from committed snapshot (no live network)", () => {
    const snapshot = loadSnapshot();
    const byName = new Map(snapshot.cuts.map((cut) => [cut.name, cut]));
    const rows: string[] = [];
    rows.push(
      "building | cited_m | metric | source | computed_m | tier | footprint | delta | pass",
    );
    const failures: string[] = [];

    for (const lm of landmarks as Landmark[]) {
      const cut = byName.get(snapshotCutName(lm.name));
      if (!cut) {
        failures.push(`${lm.name}: missing snapshot cut (run REFRESH_LANDMARK_SNAPSHOT=1)`);
        rows.push(`${lm.name} | ${lm.heightM} | ${lm.compareMetric} | ${lm.sourceUrl} | — | — | — | — | FAIL`);
        continue;
      }
      const final = resolveLandmarkCut(cut);
      const pick = pickBuildingAtPoint(final, lm.lat, lm.lon, cut.center);
      if (!pick) {
        failures.push(`${lm.name}: no footprint contains fixture lat/lon (fix coordinates)`);
        rows.push(`${lm.name} | ${lm.heightM} | ${lm.compareMetric} | ${lm.sourceUrl} | — | — | — | — | FAIL`);
        continue;
      }
      const footprint = landmarkFootprintDescriptor(pick.building, {
        lat: lm.lat,
        lon: lm.lon,
        center: cut.center,
        comFootprints: cut.comFootprints,
      });
      if (!footprintMatchesExpectations(footprint, lm.footprintMustContain)) {
        failures.push(
          `${lm.name}: footprint "${footprint}" must contain ${lm.footprintMustContain.join(", ")}`,
        );
      }
      const tier = inferHeightTier(pick.building);
      const computed = pick.heightM;
      const sourceIssue = assertIndependentSource(lm, computed);
      if (sourceIssue) failures.push(sourceIssue);
      const delta = Math.abs(computed - lm.heightM);
      const tol = toleranceM(lm);
      const pass = tier !== "zone_default" && delta <= tol;
      if (tier === "zone_default") {
        failures.push(`${lm.name}: zone_default (${lm.sourceUrl})`);
      } else if (delta > tol) {
        failures.push(
          `${lm.name}: Δ=${delta.toFixed(1)}m > tol ${tol.toFixed(1)}m (cited ${lm.heightM}m ${lm.compareMetric}, ${lm.sourceUrl})`,
        );
      }
      rows.push(
        `${lm.name} | ${lm.heightM} | ${lm.compareMetric} | ${lm.sourceUrl} | ${computed.toFixed(1)} | ${heightTierLabel(tier)} | ${footprint} | ${delta.toFixed(1)} | ${pass ? "PASS" : "FAIL"}`,
      );
    }

    console.info(rows.join("\n"));
    expect(failures, failures.join("\n")).toEqual([]);
  }, 120_000);
});
