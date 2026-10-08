import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import type { LandmarkRow } from "./landmarkHeights.test";
import { insetFromCutEdgeM, landmarkCutBounds } from "./landmarkCutBounds";

function loadSnapshot() {
  const path = fileURLToPath(new URL("./fixtures/landmark-heights-snapshot.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as {
    cuts: { name: string; center: { lat: number; lon: number }; sideM: number }[];
  };
}

describe("landmark snapshot cut insets", () => {
  it("every fixture row is at least 50 m inside planned cut bounds", () => {
    const rows = landmarks as LandmarkRow[];
    const byCut = new Map<string, LandmarkRow[]>();
    for (const row of rows) {
      const list = byCut.get(row.cut) ?? [];
      list.push(row);
      byCut.set(row.cut, list);
    }
    for (const [cutName, cutRows] of byCut) {
      const { center, sideM } = landmarkCutBounds(cutRows);
      for (const row of cutRows) {
        const inset = insetFromCutEdgeM(row, center, sideM);
        expect(inset, `${row.name} in ${cutName} (side ${sideM} m)`).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it("every fixture row is at least 50 m inside its committed snapshot cut", () => {
    const rows = landmarks as LandmarkRow[];
    const snapshot = loadSnapshot();
    const byName = new Map(snapshot.cuts.map((cut) => [cut.name, cut]));
    for (const row of rows) {
      const cut = byName.get(row.cut);
      expect(cut, row.cut).toBeTruthy();
      const inset = insetFromCutEdgeM(row, cut!.center, cut!.sideM);
      expect(inset, `${row.name} in snapshot ${row.cut}`).toBeGreaterThanOrEqual(50);
    }
  });
});
