import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bboxCells,
  checkSparqlJson,
  finaliseItems,
  GREATER_MELBOURNE_BBOX,
  groupBindings,
  landmarkQuery,
  landmarkQueryUrl,
  landmarksDocument,
  landmarksManifest,
  isSlowQueryFailure,
  minimumItemsCheck,
  parseWktPoint,
  qidFromUri,
  queryCells,
  splitCell,
  yearFromWikidataDate,
} from "../shared/wikidataLandmarks.js";

const sample = JSON.parse(readFileSync(new URL("./fixtures/wikidata-sparql-sample.json", import.meta.url), "utf8"));
const bake = () => finaliseItems(groupBindings(checkSparqlJson(sample)), GREATER_MELBOURNE_BBOX);

describe("query cells", () => {
  it("tiles the box without gaps and clamps the last row and column", () => {
    const bbox = { west: 0, south: 0, east: 0.5, north: 0.3 };
    const cells = bboxCells(bbox, 0.2);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ west: 0, south: 0, east: 0.2, north: 0.2 });
    expect(cells.at(-1)).toEqual({ west: 0.4, south: 0.2, east: 0.5, north: 0.3 });
  });
  it("covers Greater Melbourne at 0.2 degrees in 8 by 7 cells", () => {
    expect(bboxCells(GREATER_MELBOURNE_BBOX, 0.2)).toHaveLength(56);
  });
  it("rejects a zero cell size", () => {
    expect(() => bboxCells(GREATER_MELBOURNE_BBOX, 0)).toThrow();
  });
});

describe("SPARQL query", () => {
  const cell = { west: 144.9, south: -37.9, east: 145.1, north: -37.7 };
  it("asks for structures in the cell with every property the spec lists", () => {
    const q = landmarkQuery(cell);
    expect(q).toContain('wikibase:cornerSouthWest "Point(144.9 -37.9)"^^geo:wktLiteral');
    expect(q).toContain('wikibase:cornerNorthEast "Point(145.1 -37.7)"^^geo:wktLiteral');
    expect(q).toContain("{ ?item wdt:P31/wdt:P279* wd:Q811979 . } UNION { ?item wdt:P31/wdt:P279* wd:Q55488 . }");
    for (const p of ["P625", "P2048", "P1101", "P571", "P1619", "P84", "P149", "P1435"]) expect(q).toContain(p);
    expect(q).toContain("<https://en.wikipedia.org/>");
  });
  it("reads heights normalised to metres from best-rank statements", () => {
    expect(landmarkQuery(cell)).toContain("wikibase:BestRank ; psn:P2048/wikibase:quantityAmount ?height");
  });
  it("builds a JSON GET URL on the public endpoint", () => {
    const url = new URL(landmarkQueryUrl(cell));
    expect(url.origin + url.pathname).toBe("https://query.wikidata.org/sparql");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("query")).toBe(landmarkQuery(cell));
  });
});

describe("value parsing", () => {
  it("takes QIDs only from Wikidata entity URIs", () => {
    expect(qidFromUri("http://www.wikidata.org/entity/Q42")).toBe("Q42");
    expect(qidFromUri("http://www.wikidata.org/entity/P31")).toBeNull();
    expect(qidFromUri("https://example.com/Q42")).toBeNull();
    expect(qidFromUri(undefined)).toBeNull();
  });
  it("reads WKT points as lon then lat", () => {
    expect(parseWktPoint("Point(144.96 -37.82)")).toEqual({ lon: 144.96, lat: -37.82 });
    expect(parseWktPoint("POLYGON((0 0))")).toBeNull();
    expect(parseWktPoint(null)).toBeNull();
  });
  it("takes the year from Wikidata dates", () => {
    expect(yearFromWikidataDate("2006-10-11T00:00:00Z")).toBe(2006);
    expect(yearFromWikidataDate("+1880-01-01T00:00:00Z")).toBe(1880);
    expect(yearFromWikidataDate("http://www.wikidata.org/.well-known/genid/abc")).toBeNull();
  });
  it("refuses an answer without bindings", () => {
    expect(() => checkSparqlJson({})).toThrow(/bindings/);
    expect(() => checkSparqlJson(null)).toThrow(/bindings/);
  });
});

describe("baking the sample answer", () => {
  it("merges repeated rows into one item with every architect", () => {
    const tower = bake().items.find((i) => i.qid === "Q900001");
    expect(tower).toEqual({
      qid: "Q900001",
      name: "Fixture Tower",
      lon: 144.9645305,
      lat: -37.8215766,
      heightsM: [297.3],
      floorsAboveGround: 91,
      yearBuilt: 2002,
      yearOpened: 2006,
      architects: [
        { qid: "Q900101", name: "Fixture Architects" },
        { qid: "Q900102", name: "Second Fixture Studio" },
      ],
      styles: [{ qid: "Q900201", name: "Fixture modernism" }],
      heritage: [],
      wikipedia: "https://en.wikipedia.org/wiki/Fixture_Tower",
    });
  });
  it("leaves missing facts empty instead of guessing", () => {
    const hall = bake().items.find((i) => i.qid === "Q900002");
    expect(hall.heightsM).toEqual([]);
    expect(hall.floorsAboveGround).toBeNull();
    expect(hall.yearOpened).toBeNull();
    expect(hall.wikipedia).toBeNull();
    expect(hall.heritage).toEqual([{ qid: "Q900301", name: "Fixture heritage register" }]);
  });
  it("drops and counts items without an English label or a point in the box", () => {
    const { items, dropped } = bake();
    expect(items.map((i) => i.qid)).toEqual(["Q900001", "Q900002"]);
    expect(dropped).toEqual({ noEnglishLabel: 1, noCoordinateInBbox: 1 });
  });
  it("dedupes items that come back from two neighbouring cells", () => {
    const rows = checkSparqlJson(sample);
    const grouped = groupBindings(rows, groupBindings(rows));
    expect(finaliseItems(grouped, GREATER_MELBOURNE_BBOX).items).toHaveLength(2);
  });
});

describe("output", () => {
  it("writes a document and a manifest with the query date, counts and Wikidata credit", () => {
    const { items, dropped } = bake();
    const generatedAt = "2026-11-20T00:00:00.000Z";
    const doc = landmarksDocument(items, { bbox: GREATER_MELBOURNE_BBOX, generatedAt });
    expect(doc).toMatchObject({ schemaVersion: 1, generatedAt, attribution: "Wikidata (CC0)" });
    const manifest = landmarksManifest({
      bbox: GREATER_MELBOURNE_BBOX,
      generatedAt,
      cellDeg: 0.2,
      cells: 56,
      queries: 60,
      splits: 1,
      rows: 5,
      items,
      dropped,
      sha256: "abc",
      bytes: 10,
    });
    expect(manifest).toMatchObject({
      file: "wikidata-landmarks.json",
      queryDate: generatedAt,
      itemCount: 2,
      withHeight: 1,
      withWikipedia: 1,
      dropped: { noEnglishLabel: 1, noCoordinateInBbox: 1 },
      attribution: "Wikidata (CC0)",
    });
  });
  it("refuses to publish a suspiciously small answer", () => {
    expect(() => minimumItemsCheck(3, 100)).toThrow(/not publishing/);
    expect(() => minimumItemsCheck(100, 100)).not.toThrow();
  });
});

describe("splitting slow cells", () => {
  const cell = { west: 0, south: 0, east: 0.2, north: 0.2 };
  it("splits a cell into four quarters that cover it exactly", () => {
    expect(splitCell(cell)).toEqual([
      { west: 0, south: 0, east: 0.1, north: 0.1 },
      { west: 0.1, south: 0, east: 0.2, north: 0.1 },
      { west: 0, south: 0.1, east: 0.1, north: 0.2 },
      { west: 0.1, south: 0.1, east: 0.2, north: 0.2 },
    ]);
  });
  it("treats Wikidata timeouts as slow, and refusals as fatal", () => {
    expect(isSlowQueryFailure(new Error("Wikidata cell failed after 2 attempts: answered HTTP 504."))).toBe(true);
    expect(isSlowQueryFailure(new Error("Wikidata cell failed after 2 attempts: answered HTTP 500."))).toBe(true);
    expect(isSlowQueryFailure(new Error("Wikidata cell timed out after 70000 ms"))).toBe(true);
    expect(isSlowQueryFailure(new Error("Wikidata cell answered HTTP 429; stopping without retry."))).toBe(false);
    expect(isSlowQueryFailure(new Error("Wikidata SPARQL answer had no results.bindings array."))).toBe(false);
  });
  it("queries the quarters of a cell that times out, keeping every other cell", async () => {
    const asked = [];
    const fetchCell = async (c) => {
      asked.push(c);
      if (c.east - c.west > 0.15) throw new Error("answered HTTP 504.");
      return [{ cell: c }];
    };
    const other = { west: 0.2, south: 0, east: 0.3, north: 0.1 };
    const { results, splits } = await queryCells([cell, other], fetchCell, { minCellDeg: 0.05 });
    expect(splits).toBe(1);
    expect(results.flat().map((r) => r.cell)).toEqual([...splitCell(cell), other]);
    expect(asked).toHaveLength(6);
  });
  it("stops the run when the smallest cell still times out", async () => {
    const fetchCell = async () => {
      throw new Error("answered HTTP 504.");
    };
    await expect(queryCells([cell], fetchCell, { minCellDeg: 0.05 })).rejects.toThrow(/504/);
  });
  it("stops at once on a failure that splitting cannot fix", async () => {
    let calls = 0;
    const fetchCell = async () => {
      calls += 1;
      throw new Error("answered HTTP 429; stopping without retry.");
    };
    await expect(queryCells([cell], fetchCell, { minCellDeg: 0.0125 })).rejects.toThrow(/429/);
    expect(calls).toBe(1);
  });
});
