import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import { pickBuildingAtPoint } from "./landmarkBuildingPick";
import { inferHeightTier, heightTierLabel } from "./buildingHeightResolve";
import { resolveLandmarkCut, type LandmarkCutSnapshot } from "./landmarkHeightPipeline";

type Landmark = {
  name: string;
  lat: number;
  lon: number;
  heightM: number;
  toleranceM?: number;
  sourceUrl: string;
  compareMetric: string;
  sideM?: number;
  /** At most a few rows: documented pipeline vs citation gap (never for missing footprint). */
  documentedMismatchReason?: string;
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

describe("Melbourne landmark height reference (CI)", () => {
  it("enforces tolerance from committed snapshot (no live network)", () => {
    const snapshot = loadSnapshot();
    const byName = new Map(snapshot.cuts.map((cut) => [cut.name, cut]));
    const rows: string[] = [];
    rows.push("building | cited_m | metric | source | computed_m | tier | delta | pass");
    const failures: string[] = [];

    for (const lm of landmarks as Landmark[]) {
      const cut = byName.get(lm.name);
      if (!cut) {
        failures.push(`${lm.name}: missing snapshot cut (run REFRESH_LANDMARK_SNAPSHOT=1)`);
        rows.push(`${lm.name} | ${lm.heightM} | ${lm.compareMetric} | ${lm.sourceUrl} | — | — | — | FAIL`);
        continue;
      }
      const final = resolveLandmarkCut(cut);
      const pick = pickBuildingAtPoint(final, lm.lat, lm.lon, cut.center);
      if (!pick) {
        failures.push(`${lm.name}: no footprint contains fixture lat/lon (fix coordinates)`);
        rows.push(`${lm.name} | ${lm.heightM} | ${lm.compareMetric} | ${lm.sourceUrl} | — | — | — | FAIL`);
        continue;
      }
      const tier = inferHeightTier(pick.building);
      const computed = pick.heightM;
      const delta = Math.abs(computed - lm.heightM);
      const tol = toleranceM(lm);
      const pass = tier !== "zone_default" && delta <= tol;
      const allowedGap = Boolean(lm.documentedMismatchReason) && delta > tol && tier !== "zone_default";
      if (tier === "zone_default") {
        failures.push(`${lm.name}: zone_default (${lm.sourceUrl})`);
      } else if (delta > tol && !allowedGap) {
        failures.push(
          `${lm.name}: Δ=${delta.toFixed(1)}m > tol ${tol.toFixed(1)}m (cited ${lm.heightM}m ${lm.compareMetric}, ${lm.sourceUrl})`,
        );
      }
      const passRow = pass || allowedGap;
      rows.push(
        `${lm.name} | ${lm.heightM} | ${lm.compareMetric} | ${lm.sourceUrl} | ${computed.toFixed(1)} | ${heightTierLabel(tier)} | ${delta.toFixed(1)} | ${passRow ? "PASS" : "FAIL"}${allowedGap ? " (documented)" : ""}`,
      );
      if (allowedGap) {
        console.info(`${lm.name}: documented mismatch — ${lm.documentedMismatchReason}`);
      }
    }

    console.info(rows.join("\n"));
    const documented = (landmarks as Landmark[]).filter((lm) => lm.documentedMismatchReason);
    expect(documented.length).toBeLessThanOrEqual(4);
    expect(failures, failures.join("\n")).toEqual([]);
  }, 120_000);
});
