import { describe, expect, it } from "vitest";
import { countBuildingHeightTiers } from "./lidarTierStatus";
import { countBuildingsWithComHeightTier } from "./comBuildingHeightsCount";
import type { BuildingFeat } from "../types";

describe("CoM height legend count", () => {
  it("uses the same CoM tier count for legend and summary copy", () => {
    const buildings: BuildingFeat[] = [
      {
        id: 1,
        ring: [[0, 0], [1, 0], [1, 1], [0, 0]],
        holes: [],
        height: 12,
        heightTier: "com",
        use: "commercial",
        source: "none",
      },
      {
        id: 2,
        ring: [[0, 0], [1, 0], [1, 1], [0, 0]],
        holes: [],
        height: 9,
        heightTier: "zone_default",
        heightFromFallback: true,
        use: "residential",
        source: "none",
      },
    ];
    const tierCounts = countBuildingHeightTiers(buildings);
    const comCount = countBuildingsWithComHeightTier(buildings);
    expect(comCount).toBe(tierCounts.com);
    expect(comCount).toBe(1);
  });
});
