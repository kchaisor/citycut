import { describe, expect, it } from "vitest";
import { emptyComfortFields } from "./windComfort";
import { comfortShareLabel, comfortShares } from "./windComfortShares";
import { emptyWindPlanFlow, type WindPlanComfort, type WindPlanGeometry } from "./windPlanField";

function comfortOf(p4: number[], solid: number[], water: number[]): WindPlanComfort {
  const cols = p4.length;
  const fields = emptyComfortFields(cols, 1);
  fields.p4.set(p4);
  const geometry = {
    cols,
    rows: 1,
    cellM: 2,
    originE: 0,
    originN: 0,
    solid: Uint8Array.from(solid),
    water: Uint8Array.from(water),
  } as unknown as WindPlanGeometry;
  return { key: "t", geometry, fields, unsafeAreas: [], flow: emptyWindPlanFlow(cols) };
}

const everywhere = [Float64Array.of(-100, -100, 100, -100, 100, 100, -100, 100)];

describe("comfort shares of the site", () => {
  it("counts land cells inside the site only, leaving out buildings and water", () => {
    const comfort = comfortOf([0, 0, 0.5, 0, 0.5], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]);
    const shares = comfortShares(comfort, everywhere)!;
    expect(shares.sitting).toBeCloseTo(2 / 3);
    expect(shares.standing).toBeCloseTo(1 / 3);
    const left = comfortShares(comfort, [Float64Array.of(-1, -1, 3, -1, 3, 3, -1, 3)])!;
    expect(left.sitting).toBe(1);
  });

  it("returns null when no land cell is in the site", () => {
    expect(comfortShares(comfortOf([0], [1], [0]), everywhere)).toBeNull();
  });

  it("labels shares as whole percentages with a floor for slivers", () => {
    expect(comfortShareLabel(0)).toBe("0%");
    expect(comfortShareLabel(0.003)).toBe("<1%");
    expect(comfortShareLabel(0.148)).toBe("15%");
  });
});
