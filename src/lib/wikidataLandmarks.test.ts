import { afterEach, describe, expect, it } from "vitest";
import towers from "./fixtures/wikidata-landmark-towers.json";
import landmarkHeights from "./fixtures/landmark-heights.json";
import { toLocal } from "./geo";
import type { BuildingFeat, CityModel, Pt } from "../types";
import {
  bboxContains,
  cutBbox,
  matchLandmarks,
  parseLandmarksDocument,
  resetWikidataLandmarksCache,
  wikidataLandmarksFor,
  type WikidataLandmark,
} from "./wikidataLandmarks";

const center = { lon: 144.9645, lat: -37.8216 };

function square(id: number, at: Pt, half: number): BuildingFeat {
  const [x, y] = at;
  return {
    id,
    ring: [
      [x - half, y - half],
      [x + half, y - half],
      [x + half, y + half],
      [x - half, y + half],
    ],
    holes: [],
    height: 10,
    use: "commercial",
    source: "none",
  };
}

function item(qid: string, lon: number, lat: number): WikidataLandmark {
  return {
    qid,
    name: qid,
    lon,
    lat,
    heightsM: [],
    floorsAboveGround: null,
    yearBuilt: null,
    yearOpened: null,
    architects: [],
    styles: [],
    heritage: [],
    wikipedia: null,
  };
}

function model(buildings: BuildingFeat[], sideM = 1000): Pick<CityModel, "center" | "sideM" | "widthM" | "heightM" | "buildings"> {
  return { center, sideM, buildings };
}

const doc = (items: WikidataLandmark[], bbox = { west: 144, south: -38.5, east: 146, north: -37 }) => ({
  schemaVersion: 1,
  generatedAt: "2026-11-20T23:12:43.074Z",
  bbox,
  attribution: "Wikidata (CC0)",
  items,
});

function stubFetch(routes: { baked?: unknown | Error; live?: unknown | Error }) {
  const calls: string[] = [];
  const respond = (value: unknown | Error | undefined) => {
    if (value instanceof Error) return Promise.reject(value);
    if (value === undefined) return Promise.resolve(new Response("", { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(value), { status: 200 }));
  };
  const fetchImpl = (url: string) => {
    calls.push(url);
    return url.includes("query.wikidata.org") ? respond(routes.live) : respond(routes.baked);
  };
  return { fetchImpl, calls };
}

afterEach(resetWikidataLandmarksCache);

describe("Wikidata landmark matching", () => {
  it("matches an item to the one footprint it falls in and counts the rest", () => {
    const a = square(1, [0, 0], 20);
    const b1 = square(2, [200, 0], 20);
    const b2 = square(3, [205, 0], 20);
    const result = matchLandmarks(
      model([a, b1, b2]),
      [item("Q1", center.lon, center.lat), item("Q2", center.lon + 200 / 87900, center.lat), item("Q3", center.lon - 300 / 87900, center.lat), item("Q4", 150, -30)],
      "baked",
      null,
    );
    expect(result).toMatchObject({ status: "ok", inCut: 3, noFootprint: 1, manyFootprints: 1 });
    expect(result.status === "ok" && result.matches.map((m) => [m.buildingId, m.item.qid])).toEqual([[1, "Q1"]]);
  });

  it("matches through Wikidata's OSM way id when the point misses the footprint", () => {
    const tower = { ...square(1, [0, 0], 10), osmWayIds: [555] };
    const neighbour = square(2, [40, 0], 10);
    const onStreet = { ...item("Q1", center.lon + 20 / 87900, center.lat), osmWayIds: [555] };
    const result = matchLandmarks(model([tower, neighbour]), [onStreet], "baked", null);
    expect(result.status === "ok" && result.matches.map((m) => [m.buildingId, m.item.qid])).toEqual([[1, "Q1"]]);
  });

  it("prefers the OSM way over a different footprint the point falls in", () => {
    const tower = { ...square(1, [0, 0], 10), osmWayIds: [555] };
    const neighbour = square(2, [40, 0], 10);
    const onNeighbour = { ...item("Q1", center.lon + 40 / 87900, center.lat), osmWayIds: [555] };
    const result = matchLandmarks(model([tower, neighbour]), [onNeighbour], "baked", null);
    expect(result.status === "ok" && result.matches.map((m) => m.buildingId)).toEqual([1]);
  });

  it("falls back to the footprint among buildings that share the OSM way", () => {
    const partA = { ...square(1, [0, 0], 10), osmWayIds: [555] };
    const partB = { ...square(2, [30, 0], 10), osmWayIds: [555] };
    const inB = { ...item("Q1", center.lon + 30 / 87900, center.lat), osmWayIds: [555] };
    const result = matchLandmarks(model([partA, partB]), [inB], "baked", null);
    expect(result.status === "ok" && result.matches.map((m) => m.buildingId)).toEqual([2]);
  });

  it("reports zero landmarks, not an error, for a cut with none", () => {
    expect(matchLandmarks(model([square(1, [0, 0], 20)]), [], "baked", null)).toMatchObject({ status: "ok", matches: [], inCut: 0 });
  });

  it("uses the cut's own width and height for the box", () => {
    const box = cutBbox({ center, sideM: 1000, widthM: 2000, heightM: 500 });
    expect(box.east - box.west).toBeCloseTo(2000 / 87_960, 3);
    expect(box.north - box.south).toBeCloseTo(500 / 111_132, 6);
    expect(bboxContains({ west: 144, south: -38.5, east: 146, north: -37 }, box)).toBe(true);
    expect(bboxContains({ west: 151, south: -34, east: 152, north: -33 }, box)).toBe(false);
  });

  it("rejects a baked file with another schema or no items", () => {
    expect(parseLandmarksDocument(doc([]))).not.toBeNull();
    expect(parseLandmarksDocument({ ...doc([]), schemaVersion: 2 })).toBeNull();
    expect(parseLandmarksDocument({ ...doc([]), items: null })).toBeNull();
    expect(parseLandmarksDocument("nope")).toBeNull();
  });
});

describe("Wikidata landmark loading", () => {
  const cut = model([square(7, [0, 0], 20)]);

  it("uses the baked file inside its area without a live query", async () => {
    const { fetchImpl, calls } = stubFetch({ baked: doc([item("Q9", center.lon, center.lat)]) });
    const result = await wikidataLandmarksFor(cut, fetchImpl);
    expect(result).toMatchObject({ status: "ok", source: "baked", generatedAt: "2026-11-20T23:12:43.074Z" });
    expect(result.status === "ok" && result.matches[0]?.buildingId).toBe(7);
    expect(calls.some((url) => url.includes("query.wikidata.org"))).toBe(false);
  });

  it("queries Wikidata live outside the baked area", async () => {
    const live = {
      results: {
        bindings: [
          {
            item: { value: "http://www.wikidata.org/entity/Q42" },
            label: { value: "Live tower" },
            coord: { value: `Point(${center.lon} ${center.lat})` },
          },
        ],
      },
    };
    const { fetchImpl, calls } = stubFetch({ baked: doc([], { west: 151, south: -34, east: 152, north: -33 }), live });
    const result = await wikidataLandmarksFor(cut, fetchImpl);
    expect(result).toMatchObject({ status: "ok", source: "live" });
    expect(result.status === "ok" && result.matches.map((m) => m.item.name)).toEqual(["Live tower"]);
    expect(calls.at(-1)).toContain("query.wikidata.org/sparql");
  });

  it("fails with a reason, never invented data, when both sources fail", async () => {
    const { fetchImpl } = stubFetch({ live: new Error("network down") });
    const result = await wikidataLandmarksFor(cut, fetchImpl);
    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.reason).toMatch(/Baked Wikidata file not loaded \(HTTP 404\); live Wikidata query failed \(network down\)/);
  });

  it("loads the baked file once across cuts", async () => {
    const { fetchImpl, calls } = stubFetch({ baked: doc([]) });
    await wikidataLandmarksFor(cut, fetchImpl);
    await wikidataLandmarksFor(model([], 500), fetchImpl);
    expect(calls).toHaveLength(1);
  });
});

describe("existing landmark towers in Wikidata", () => {
  const byQid = new Map(towers.items.map((t) => [t.qid, t as WikidataLandmark]));
  const expected = towers.expected as Record<string, string>;

  it("accounts for every tower in landmark-heights.json", () => {
    const names = landmarkHeights.map((l) => l.name).sort();
    expect([...Object.keys(expected), ...towers.absent].sort()).toEqual(names);
  });

  it("puts each tower's Wikidata point on that tower, except Crown Towers", () => {
    const offTower = new Map<string, number>();
    for (const tower of landmarkHeights) {
      const qid = expected[tower.name];
      if (!qid) continue;
      const wd = byQid.get(qid);
      expect(wd, tower.name).toBeTruthy();
      const [dx, dy] = toLocal(wd!.lat, wd!.lon, { lon: tower.lon, lat: tower.lat });
      const metres = Math.hypot(dx, dy);
      if (metres > 80) offTower.set(tower.name, Math.round(metres));
      const footprint = square(1, toLocal(tower.lat, tower.lon, center), 80);
      const matched = matchLandmarks(model([footprint], 6000), [wd!], "baked", null);
      expect(matched.status === "ok" && matched.matches.length, tower.name).toBe(metres <= 80 ? 1 : 0);
    }
    expect([...offTower.keys()]).toEqual(["Crown Towers"]);
  });

  it("carries the cited heights Wikidata has for the tallest towers", () => {
    expect(byQid.get("Q270407")?.heightsM).toEqual([297.3]);
    expect(byQid.get("Q4823550")?.heightsM).toEqual([316.7]);
  });
});
