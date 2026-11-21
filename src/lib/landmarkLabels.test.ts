import { describe, expect, it } from "vitest";
import type { WikidataLandmark } from "../../shared/wikidataLandmarks.js";
import {
  LANDMARK_LABELS_DEFAULT_ON,
  footprintCentroid,
  landmarkLabelSources,
  landmarkRows,
  landmarksByBuilding,
  pickLandmarkForBuilding,
  placeLandmarkLabels,
  placeSheetLabels,
  roofPointVisible,
  wikidataItemUrl,
  type LabelCandidate,
} from "./landmarkLabels";

function item(qid: string, name: string, extra: Partial<WikidataLandmark> = {}): WikidataLandmark {
  return {
    qid,
    name,
    lon: 0,
    lat: 0,
    heightsM: [],
    floorsAboveGround: null,
    yearBuilt: null,
    yearOpened: null,
    architects: [],
    styles: [],
    heritage: [],
    wikipedia: null,
    ...extra,
  };
}

function label(id: number, x: number, y: number, rank: number, width = 80): LabelCandidate {
  return { id, name: `L${id}`, rank, x, y, width, height: 20 };
}

describe("landmark label toggle", () => {
  it("starts off", () => {
    expect(LANDMARK_LABELS_DEFAULT_ON).toBe(false);
  });
});

describe("pickLandmarkForBuilding", () => {
  const tower = item("Q1144478", "Eureka Tower", { heightsM: [297.3] });
  const skydeck = item("Q5410436", "Eureka Skydeck");

  it("picks the item named like the building (Eureka Tower, not Eureka Skydeck)", () => {
    expect(pickLandmarkForBuilding([skydeck, tower], "Eureka Tower")?.qid).toBe("Q1144478");
    expect(pickLandmarkForBuilding([tower, skydeck], "eureka  tower")?.qid).toBe("Q1144478");
  });

  it("prefers the building's own item when the building has no name", () => {
    expect(pickLandmarkForBuilding([skydeck, tower], undefined)?.qid).toBe("Q1144478");
  });

  it("prefers a name contained in the building name over a suffix item", () => {
    expect(pickLandmarkForBuilding([skydeck, tower], "Eureka Tower Apartments")?.qid).toBe("Q1144478");
  });

  it("returns the single item and null for none", () => {
    expect(pickLandmarkForBuilding([skydeck], "Eureka Tower")?.qid).toBe("Q5410436");
    expect(pickLandmarkForBuilding([], "Eureka Tower")).toBeNull();
  });

  it("groups matches per building and picks one item each", () => {
    const picked = landmarksByBuilding(
      [
        { buildingId: 7, item: skydeck },
        { buildingId: 7, item: tower },
        { buildingId: 9, item: item("Q2", "Flinders Street railway station") },
        { buildingId: 99, item: item("Q3", "Gone") },
      ],
      [
        { id: 7, overtureName: "Eureka Tower" },
        { id: 9, overtureName: undefined },
      ],
    );
    expect([...picked.entries()].map(([id, i]) => [id, i.name])).toEqual([
      [7, "Eureka Tower"],
      [9, "Flinders Street railway station"],
    ]);
  });
});

describe("label anchors", () => {
  it("uses the footprint centroid, ranked by model height", () => {
    const ring: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 20],
      [0, 20],
    ];
    expect(footprintCentroid(ring)).toEqual([5, 10]);
    const sources = landmarkLabelSources(new Map([[1, { name: "A" }]]), [
      { id: 1, ring, holes: [], height: 120 },
      { id: 2, ring, holes: [], height: 300 },
    ]);
    expect(sources).toEqual([{ buildingId: 1, name: "A", at: [5, 10], rank: 120 }]);
  });
});

describe("placeLandmarkLabels", () => {
  it("places tallest first and drops a label that overlaps a placed one", () => {
    const placed = placeLandmarkLabels([label(1, 100, 100, 50), label(2, 130, 105, 300)], []);
    expect(placed.map((c) => c.id)).toEqual([2]);
  });

  it("keeps a 4 px gap between labels", () => {
    const touching = placeLandmarkLabels([label(1, 100, 100, 50), label(2, 100 + 80 + 3, 100, 300)], []);
    expect(touching.map((c) => c.id)).toEqual([2]);
    const clear = placeLandmarkLabels([label(1, 100, 100, 50), label(2, 100 + 80 + 5, 100, 300)], []);
    expect(clear.map((c) => c.id)).toEqual([2, 1]);
  });

  it("hides labels within 8 px of a HUD island or the popover", () => {
    const popover = { left: 200, top: 0, right: 480, bottom: 320 };
    const near = placeLandmarkLabels([label(1, 200 - 40 - 7, 100, 10)], [popover]);
    expect(near).toEqual([]);
    const far = placeLandmarkLabels([label(1, 200 - 40 - 9, 100, 10)], [popover]);
    expect(far.map((c) => c.id)).toEqual([1]);
  });

  it("hides the selected building's own label while its popover is open", () => {
    const placed = placeLandmarkLabels([label(1, 100, 100, 10), label(2, 400, 100, 5)], [], { hiddenId: 1 });
    expect(placed.map((c) => c.id)).toEqual([2]);
  });

  it("reveals a dropped label once zooming in spreads the anchors apart", () => {
    const anchors = [
      { id: 1, e: 0, n: 0, rank: 300 },
      { id: 2, e: 30, n: 0, rank: 100 },
    ];
    const at = (pxPerM: number) => anchors.map((a) => label(a.id, 500 + a.e * pxPerM, 400 - a.n * pxPerM, a.rank));
    expect(placeLandmarkLabels(at(1), []).map((c) => c.id)).toEqual([1]);
    expect(placeLandmarkLabels(at(4), []).map((c) => c.id)).toEqual([1, 2]);
  });

  it("drops labels outside the viewport bounds", () => {
    const placed = placeLandmarkLabels([label(1, 10, 100, 10)], [], { bounds: { left: 0, top: 0, right: 800, bottom: 600 } });
    expect(placed).toEqual([]);
  });
});

describe("roofPointVisible", () => {
  it("shows the label when nothing or the building itself is hit first", () => {
    expect(roofPointVisible(null, 1, 500)).toBe(true);
    expect(roofPointVisible({ distance: 499.8, buildingId: 1 }, 1, 500)).toBe(true);
    expect(roofPointVisible({ distance: 300, buildingId: 1 }, 1, 500)).toBe(true);
  });

  it("hides the label when another building sits in front of the roof point", () => {
    expect(roofPointVisible({ distance: 300, buildingId: 2 }, 1, 500)).toBe(false);
    expect(roofPointVisible({ distance: 499.5, buildingId: 2 }, 1, 500)).toBe(true);
  });
});

describe("landmarkRows", () => {
  const eureka = item("Q1144478", "Eureka Tower", {
    heightsM: [297.3, 300],
    floorsAboveGround: 91,
    yearBuilt: 2006,
    architects: [{ qid: "Q1", name: "Fender Katsalidis" }],
  });

  it("omits the Name row when it equals the building name", () => {
    const rows = landmarkRows(eureka, "Eureka Tower", 297);
    expect(rows.map((r) => r.label)).toEqual(["Cited height", "Floors", "Built", "Architect"]);
    expect(rows[0]).toEqual({ label: "Cited height", value: "297.3 m", numeric: true });
  });

  it("keeps the Name row when it differs from the building name", () => {
    const rows = landmarkRows(eureka, "7 Riverside Quay", 297);
    expect(rows[0]).toEqual({ label: "Name", value: "Eureka Tower" });
  });

  it("links to the Wikidata Q-page", () => {
    expect(wikidataItemUrl("Q1144478")).toBe("https://www.wikidata.org/wiki/Q1144478");
  });
});

describe("placeSheetLabels", () => {
  it("returns nothing without sources and places the taller of two crowded labels", () => {
    expect(placeSheetLabels([], (at) => at, 3, null)).toEqual([]);
    const placed = placeSheetLabels(
      [
        { buildingId: 1, name: "Low", at: [10, 10], rank: 20 },
        { buildingId: 2, name: "High", at: [11, 10], rank: 200 },
      ],
      (at) => at,
      3,
      null,
    );
    expect(placed).toEqual([{ buildingId: 2, text: "High", x: 11, y: 10 }]);
  });
});
