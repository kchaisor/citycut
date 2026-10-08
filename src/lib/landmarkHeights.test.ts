import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import { pickBuildingForLandmark } from "./landmarkBuildingPick";
import { inferHeightTier, heightTierLabel } from "./buildingHeightResolve";
import { landmarkFootprintDescriptor } from "./landmarkFootprintDescriptor";
import { resolveLandmarkCut, type LandmarkCutSnapshot } from "./landmarkHeightPipeline";
import type { BuildingFeat } from "../types";

type LandmarkOsm = {
  type: "way";
  id: number;
  tag: string;
  value: string;
  tower_part_way: number | null;
};

export type LandmarkRow = {
  name: string;
  /** Snapshot cut key (area bbox in landmark-heights-snapshot.json). */
  cut: string;
  osm: LandmarkOsm;
  lat: number;
  lon: number;
  cited_m: number;
  metric: string;
  source_url: string;
  source_quote: string;
  computed_m_main: number;
};

type SnapshotFile = {
  cuts: LandmarkCutSnapshot[];
};

/** Genuine pipeline vs independent citation gaps at main's CoM matcher (do not “fix” in CI). */
export const REAL_DISAGREEMENTS: {
  name: string;
  evidence: string;
}[] = [
  {
    name: "Crown Towers",
    evidence:
      "Overture has only one 46,233 m² complex outline. CoM tower structure 816936 (97.5–131 m, ~1,600 m²) covers 3.3% of it, so main's sliver rule applies only the 19.5 m podium.",
  },
  {
    name: "ANZ Tower, Collins Place (55 Collins St)",
    evidence:
      "CoM's tallest band, 160.5 m, covers only 407 of 1,215 m²; the rest is podium 23.5 m.",
  },
  {
    name: "1 Spring Street (Shell House)",
    evidence:
      "Stepped top: the point is on the 108.5 m band, and the tallest CoM band is 119.5 m.",
  },
];

const REAL_DISAGREEMENT_NAMES = new Set(REAL_DISAGREEMENTS.map((row) => row.name));

function toleranceM(citedM: number): number {
  return Math.max(3, citedM * 0.1);
}

function loadSnapshot(): SnapshotFile {
  const path = fileURLToPath(new URL("./fixtures/landmark-heights-snapshot.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as SnapshotFile;
}

function citedNumberAppearsInQuote(citedM: number, quote: string): boolean {
  const normalized = quote.replace(/,/g, "");
  const candidates = new Set<string>();
  candidates.add(String(citedM));
  candidates.add(citedM.toFixed(1));
  candidates.add(citedM.toFixed(2));
  candidates.add(citedM.toFixed(3));
  if (Number.isInteger(citedM)) candidates.add(String(Math.trunc(citedM)));
  for (const token of candidates) {
    if (token && normalized.includes(token)) return true;
  }
  return false;
}

function assertSourceGuard(lm: LandmarkRow): string | null {
  if (/data\.melbourne\.vic\.gov\.au/i.test(lm.source_url)) {
    return `${lm.name}: source_url must not be CoM dataset`;
  }
  if (/openstreetmap\.org/i.test(lm.source_url)) {
    return `${lm.name}: source_url must not be an OSM map link`;
  }
  if (!citedNumberAppearsInQuote(lm.cited_m, lm.source_quote)) {
    return `${lm.name}: source_quote must contain cited height ${lm.cited_m}`;
  }
  return null;
}

function assertOsmPick(lm: LandmarkRow, building: BuildingFeat): string | null {
  if (!building.osmWayIds?.includes(lm.osm.id)) {
    return `${lm.name}: picked building osmWayIds ${building.osmWayIds?.join(",") ?? "—"} must include osm way ${lm.osm.id}`;
  }
  if (lm.osm.tag === "name") {
    const label = building.overtureName?.trim();
    if (label && label.localeCompare(lm.osm.value, undefined, { sensitivity: "accent" }) !== 0) {
      return `${lm.name}: OSM name "${lm.osm.value}" != Overture name "${label}"`;
    }
  }
  return null;
}

function failsTolerance(lm: LandmarkRow, computed: number, tier: ReturnType<typeof inferHeightTier>): boolean {
  const delta = Math.abs(computed - lm.cited_m);
  const tol = toleranceM(lm.cited_m);
  return tier === "zone_default" || delta > tol;
}

describe("Melbourne landmark height reference (CI)", () => {
  it("enforces tolerance from committed snapshot (no live network)", () => {
    const snapshot = loadSnapshot();
    const byCut = new Map(snapshot.cuts.map((cut) => [cut.name, cut]));
    const rows: string[] = [];
    rows.push(
      "name | cited_m | metric | computed_m | Δ | tol | osm_way | tier | status | source",
    );
    const wiringFailures: string[] = [];
    const toleranceFailureNames: string[] = [];

    for (const lm of landmarks as LandmarkRow[]) {
      const sourceIssue = assertSourceGuard(lm);
      if (sourceIssue) wiringFailures.push(sourceIssue);

      const cut = byCut.get(lm.cut);
      if (!cut) {
        wiringFailures.push(`${lm.name}: missing snapshot cut "${lm.cut}"`);
        rows.push(`${lm.name} | ${lm.cited_m} | ${lm.metric} | — | — | — | ${lm.osm.id} | — | FAIL | ${lm.source_url}`);
        continue;
      }
      const final = resolveLandmarkCut(cut);
      const pick = pickBuildingForLandmark(final, lm.lat, lm.lon, cut.center, lm.osm.id);
      if (!pick) {
        wiringFailures.push(`${lm.name}: no footprint contains fixture lat/lon`);
        rows.push(`${lm.name} | ${lm.cited_m} | ${lm.metric} | — | — | — | ${lm.osm.id} | — | FAIL | ${lm.source_url}`);
        continue;
      }

      const osmIssue = assertOsmPick(lm, pick.building);
      if (osmIssue) wiringFailures.push(osmIssue);

      const tier = inferHeightTier(pick.building);
      const computed = pick.heightM;
      if (Math.abs(computed - lm.computed_m_main) > 0.15) {
        wiringFailures.push(
          `${lm.name}: computed ${computed.toFixed(1)} m != fixture computed_m_main ${lm.computed_m_main} m (snapshot pipeline drift)`,
        );
      }

      const delta = Math.abs(computed - lm.cited_m);
      const tol = toleranceM(lm.cited_m);
      const fails = failsTolerance(lm, computed, tier);
      const isReal = REAL_DISAGREEMENT_NAMES.has(lm.name);

      let status: string;
      if (fails) {
        toleranceFailureNames.push(lm.name);
        status = isReal ? "REAL_DISAGREEMENT" : "FAIL_TOLERANCE";
      } else if (isReal) {
        wiringFailures.push(`${lm.name}: expected REAL_DISAGREEMENT but now within tolerance`);
        status = "UNEXPECTED_PASS";
      } else {
        status = "PASS";
      }

      const footprint = landmarkFootprintDescriptor(pick.building, {
        lat: lm.lat,
        lon: lm.lon,
        center: cut.center,
        comFootprints: cut.comFootprints,
      });

      rows.push(
        `${lm.name} | ${lm.cited_m} | ${lm.metric} | ${computed.toFixed(1)} | ${delta.toFixed(1)} | ${tol.toFixed(1)} | ${lm.osm.id} | ${heightTierLabel(tier)} | ${status} | ${lm.source_url} | ${footprint}`,
      );
    }

    console.info(rows.join("\n"));
    console.info("\n--- REAL_DISAGREEMENTS (expected tolerance failures) ---");
    for (const row of REAL_DISAGREEMENTS) {
      console.info(`${row.name}: ${row.evidence}`);
    }

    const expectedFailures = [...REAL_DISAGREEMENT_NAMES].sort();
    const actualFailures = [...new Set(toleranceFailureNames)].sort();
    const unexpected = actualFailures.filter((name) => !REAL_DISAGREEMENT_NAMES.has(name));

    expect(wiringFailures, wiringFailures.join("\n")).toEqual([]);
    expect(unexpected, `unexpected tolerance failures: ${unexpected.join(", ")}`).toEqual([]);
    expect(actualFailures).toEqual(expectedFailures);
  }, 120_000);
});
