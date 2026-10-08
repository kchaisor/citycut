import { describe, expect, it } from "vitest";
import fixtures from "../../shared/cascade-parity-fixtures.json";
import { cascadeUse, classify } from "./buildingUse";
import { resolveUseSourceTier, withResolvedUseSourceTier } from "./useSourceTier";
import type { BuildingUse, TypologySource } from "../types";

type FixtureCase = {
  id: string;
  props: Record<string, string>;
  zoneCode: string;
  heightM: number;
};

function tagsFromOvertureProps(props: Record<string, string>): Record<string, string> {
  const tags: Record<string, string> = {};
  if (props.class) tags.building = props.class;
  if (props.subtype) tags["building:use"] = props.subtype;
  if (props.use) tags["building:use"] = props.use;
  return tags;
}

function liveCascade(caseRow: FixtureCase): { use: BuildingUse; source: TypologySource; tier: string } {
  const tags = tagsFromOvertureProps(caseRow.props);
  const tagged = tags && Object.keys(tags).length > 0 ? classify(tags) : null;
  if (tagged) {
    const building = withResolvedUseSourceTier({
      id: 0,
      ring: [[0, 0], [1, 0], [1, 1], [0, 0]],
      holes: [],
      height: caseRow.heightM,
      use: tagged,
      source: "osm_tag",
    });
    return {
      use: building.use,
      source: building.source,
      tier: resolveUseSourceTier(building),
    };
  }
  const fromCascade = cascadeUse({
    tags: null,
    zoneCode: caseRow.zoneCode,
    heightM: caseRow.heightM,
  });
  const building = withResolvedUseSourceTier({
    id: 0,
    ring: [[0, 0], [1, 0], [1, 1], [0, 0]],
    holes: [],
    height: caseRow.heightM,
    use: fromCascade.use,
    source: fromCascade.source,
  });
  return {
    use: building.use,
    source: building.source,
    tier: resolveUseSourceTier(building),
  };
}

describe("cascade parity fixtures (live path)", () => {
  for (const caseRow of fixtures.cases as FixtureCase[]) {
    it(`classifies ${caseRow.id}`, () => {
      const live = liveCascade(caseRow);
      expect(live.use).not.toBe("unclassified");
      expect(live.tier).not.toBe("unclassified");
      if (caseRow.props.class === "pavilion") {
        expect(live.use).toBe("recreation");
        expect(live.tier).toBe("overture");
      }
      if (caseRow.zoneCode.startsWith("HCTZ") || caseRow.zoneCode.startsWith("R1Z")) {
        if (!caseRow.props.class) {
          expect(live.use).toBe("residential");
          expect(live.tier).toBe("zone");
        }
      }
    });
  }
});
