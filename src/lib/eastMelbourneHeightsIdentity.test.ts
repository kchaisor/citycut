import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EAST_MELBOURNE_HEIGHT_CUT,
  applyEastMelbourneDisplayHeights,
  buildingHeightSignature,
  loadEastMelbourneHeightInputsFromFixture,
  refreshEastMelbourneHeightFixtures,
} from "./eastMelbourneHeightsPipeline";

const FIXTURE = fileURLToPath(new URL("./fixtures/east-melbourne-heights-main.json", import.meta.url));

type Snapshot = {
  cut: typeof EAST_MELBOURNE_HEIGHT_CUT;
  buildingCount: number;
  buildings: { id: number; heightM: number }[];
};

const DAM_RESTORED: { id: number; mainM: number; damM: number; mainTier: string }[] = [
  { id: 29225853, mainM: 12, damM: 9, mainTier: "zone_default" },
  { id: 2141905945, mainM: 7, damM: 12, mainTier: "real_source_unmatched" },
  { id: 2577531592, mainM: 7, damM: 21, mainTier: "real_source_unmatched" },
  { id: 2741926066, mainM: 8, damM: 30, mainTier: "zone_default" },
  { id: 2805387076, mainM: 7.747, damM: 54, mainTier: "overture_height" },
  { id: 3426932838, mainM: 8, damM: 30, mainTier: "real_source_unmatched" },
  { id: 4130275751, mainM: 12, damM: 21, mainTier: "real_source_unmatched" },
];

describe("East Melbourne height identity (main baseline)", () => {
  it(
    "matches committed main-height snapshot for every building",
    async () => {
      if (process.env.REFRESH_EAST_MELBOURNE_HEIGHTS === "1") {
        await refreshEastMelbourneHeightFixtures();
      }
      const display = applyEastMelbourneDisplayHeights(loadEastMelbourneHeightInputsFromFixture());
      const signature = buildingHeightSignature(display);
      const expected = JSON.parse(readFileSync(FIXTURE, "utf8")) as Snapshot;
      expect(signature.length).toBe(expected.buildingCount);
      expect(signature.length).toBe(496);
      const restored = new Map(DAM_RESTORED.map((row) => [row.id, row]));
      const byId = new Map(display.map((building) => [building.id, building]));
      const expectedNow = expected.buildings.map((row) => {
        const dam = restored.get(row.id);
        if (!dam) return row;
        expect(row.heightM).toBe(dam.mainM);
        expect(byId.get(row.id)?.heightTier).toBe("development_floors");
        return { id: row.id, heightM: dam.damM };
      });
      expect(signature).toEqual(expectedNow);
      for (const building of display) {
        if (building.heightTier === "com") expect(restored.has(building.id)).toBe(false);
      }
    },
    240_000,
  );
});
