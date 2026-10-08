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
      expect(signature).toEqual(expected.buildings);
    },
    240_000,
  );
});
