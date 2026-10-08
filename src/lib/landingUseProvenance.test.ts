import { describe, expect, it } from "vitest";
import type { BuildingFeat } from "../types";
import { countLandingUseProvenance } from "./landingUseProvenance";

function bare(id: number, use: BuildingFeat["use"], source: BuildingFeat["source"], tier?: BuildingFeat["useSourceTier"]): BuildingFeat {
  return {
    id,
    ring: [[0, 0], [1, 0], [1, 1], [0, 0]],
    holes: [],
    height: 9,
    use,
    source,
    useSourceTier: tier,
  };
}

describe("countLandingUseProvenance", () => {
  it("counts live refine only when source was none", () => {
    const merged = [
      bare(1, "residential", "zone", "zone"),
      bare(2, "unclassified", "none"),
    ];
    const final = [
      bare(1, "residential", "zone", "zone"),
      bare(2, "residential", "zone"),
    ];
    expect(countLandingUseProvenance(merged, final)).toMatchObject({
      tileTierAfterMerge: 1,
      liveRefineNewlyClassified: 1,
      unclassifiedFinal: 0,
    });
  });
});
