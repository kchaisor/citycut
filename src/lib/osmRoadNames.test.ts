import { describe, expect, it } from "vitest";
import { applyOsmRoadNamesToRoads, applyOsmWayIdNamesToRoads, parseOsmWayNamesXml } from "./osmRoadNames";
import type { RoadFeat } from "../types";

describe("parseOsmWayNamesXml", () => {
  it("reads way name tags from OSM API XML", () => {
    const xml = `<?xml version="1.0"?><osm><way id="37625565"><tag k="highway" v="residential"/><tag k="name" v="Oxford Street"/></way></osm>`;
    const names = parseOsmWayNamesXml(xml);
    expect(names.get("w37625565")).toBe("Oxford Street");
  });
});

describe("applyOsmWayIdNamesToRoads", () => {
  it("copies a name onto the matching osmWayKey segment", () => {
    const roads: RoadFeat[] = [
      {
        id: 1,
        kind: "road",
        grade: "arterial",
        width: 12,
        osmWayKey: "w37625565",
        line: [
          [0, 0],
          [40, 0],
        ],
      },
    ];
    const names = new Map([["w37625565", "Station Street"]]);
    expect(applyOsmWayIdNamesToRoads(roads, names)[0]?.name).toBe("Station Street");
  });
});

describe("applyOsmRoadNamesToRoads", () => {
  it("copies an OSM name onto a nearby unnamed Overture segment", () => {
    const roads: RoadFeat[] = [
      {
        id: 1,
        kind: "road",
        grade: "arterial",
        width: 12,
        line: [
          [0, 0],
          [40, 0],
        ],
      },
    ];
    const named = applyOsmRoadNamesToRoads(roads, [
      {
        name: "Station Street",
        line: [
          [5, 2],
          [35, 2],
        ],
      },
    ]);
    expect(named[0]?.name).toBe("Station Street");
  });
});
