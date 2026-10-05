import { describe, expect, it } from "vitest";
import { deckMultiPolygonGeometry } from "./buildCity";
import { BRIDGE_DECK_CLEARANCE_M } from "./roadDrape";
import type { MultiPolygon } from "polygon-clipping";

describe("deck road geometry", () => {
  it("places bridge fill on a flat deck above ground samples", () => {
    const multi: MultiPolygon = [
      [
        [
          [-10, -5],
          [10, -5],
          [10, 5],
          [-10, 5],
          [-10, -5],
        ],
      ],
    ];
    const sample = (east: number) => (east < 0 ? 2 : 8);
    const geometry = deckMultiPolygonGeometry(multi, sample, 0.2);
    expect(geometry).toBeTruthy();
    const position = geometry!.getAttribute("position");
    const yValues = new Set<number>();
    for (let i = 0; i < position.count; i++) yValues.add(position.getY(i));
    expect(yValues.size).toBe(1);
    expect([...yValues][0]).toBeCloseTo(8 + BRIDGE_DECK_CLEARANCE_M + 0.2, 4);
    geometry!.dispose();
  });
});
