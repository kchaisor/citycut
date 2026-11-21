import { describe, expect, it } from "vitest";
import { closestCitedHeight, wikidataHeightGaps, type WikidataMatch } from "./wikidataMatch";
import type { WikidataLandmark } from "../../shared/wikidataLandmarks.js";

function item(qid: string, heightsM: number[]): WikidataLandmark {
  return {
    qid,
    name: `Tower ${qid}`,
    lon: 0,
    lat: 0,
    heightsM,
    floorsAboveGround: null,
    yearBuilt: null,
    yearOpened: null,
    architects: [],
    styles: [],
    heritage: [],
    wikipedia: null,
  };
}

describe("Wikidata height gaps", () => {
  const buildings = [
    { id: 1, height: 297.5 },
    { id: 2, height: 200 },
    { id: 3, height: 90 },
    { id: 4, height: 50 },
  ];
  const matches: WikidataMatch[] = [
    { buildingId: 1, item: item("Q1", [297.3]) },
    { buildingId: 2, item: item("Q2", [250]) },
    { buildingId: 3, item: item("Q3", [100, 150]) },
    { buildingId: 4, item: item("Q4", []) },
  ];

  it("flags matched buildings more than 10% off the cited height, and only those", () => {
    expect(wikidataHeightGaps(buildings, matches)).toEqual([
      { qid: "Q2", name: "Tower Q2", buildingId: 2, modelHeightM: 200, citedHeightM: 250, gapFraction: 0.2 },
    ]);
  });

  it("compares with the closest of several cited heights", () => {
    expect(closestCitedHeight(item("Q", [100, 150]), 90)).toBe(100);
    expect(closestCitedHeight(item("Q", []), 90)).toBeNull();
  });

  it("skips items with no cited height and buildings that are no longer in the cut", () => {
    expect(wikidataHeightGaps([{ id: 9, height: 10 }], matches)).toEqual([]);
  });
});
