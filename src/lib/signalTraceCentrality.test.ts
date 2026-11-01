import { describe, expect, it } from "vitest";
import { buildStreetCentrality, pulseRateHzFromCentrality } from "./signalTraceCentrality";
import type { RoadFeat } from "../types";

let roadId = 0;
function road(line: [number, number][], grade: RoadFeat["grade"] = "local"): RoadFeat {
  roadId += 1;
  return { id: roadId, kind: "road", line, width: 6, grade };
}

describe("signalTraceCentrality", () => {
  it("scores a hub edge above a leaf edge", () => {
    const roads: RoadFeat[] = [
      road([
        [0, 0],
        [10, 0],
      ]),
      road([
        [10, 0],
        [20, 0],
      ]),
      road([
        [20, 0],
        [40, 0],
      ]),
      road([
        [10, 0],
        [10, 10],
      ]),
    ];
    const built = buildStreetCentrality(roads);
    expect(built).not.toBeNull();
    const hubEdge = built!.edgeScore[1]!;
    const leafEdge = built!.edgeScore[2]!;
    expect(hubEdge).toBeGreaterThan(leafEdge);
    expect(pulseRateHzFromCentrality(hubEdge)).toBeGreaterThan(pulseRateHzFromCentrality(leafEdge));
  });
});
