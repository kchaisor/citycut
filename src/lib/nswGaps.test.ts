import { describe, expect, it } from "vitest";
import { gda94ToGda2020 } from "./gda";
import { queryArcgisLayer, queryArcgisTiled, splitBounds, type ArcgisFetch, type ArcgisLayerSpec } from "./arcgisQuery";
import { decodeField, decodeSubtype, humanise, UnknownCodes } from "./nswDomains";
import { nswComplexUse, nswLayersFromResults, type NswLayers } from "./nswLayers";
import { nswApplyBuildingUse, nswLightRailLines } from "./nswModel";
import { fetchOsmBusStops, TFNSW_KEY_NOTE, type OsmFetch } from "./nswTransport";
import { corridorGrade, groundRoadPartition, multiArea } from "./groundRoads";
import { NSW_LABEL_RULES, placeNswLabels } from "./nswPlan";
import { NSW_LAYERS } from "./sources/nsw";
import type { BuildingFeat, Pt } from "../types";

const PYRMONT = { lon: 151.194, lat: -33.87 };
const BOX = { west: 151.19, south: -33.874, east: 151.198, north: -33.866 };

describe("GDA94 → GDA2020 (EPSG:8048)", () => {
  it("matches PROJ to well under a millimetre", () => {
    const cases: [[number, number], [number, number]][] = [
      [[151.19350536000002, -33.87035351199995], [151.19351079185816, -33.87034082739581]],
      [[145.0347, -37.8069], [145.0347059249765, -37.8068868422723]],
      [[153, -28], [153.00000596974382, -27.999987446618036]],
    ];
    for (const [input, want] of cases) {
      const [lon, lat] = gda94ToGda2020(input[0], input[1]);
      expect(Math.abs(lon - want[0]) * 92_000).toBeLessThan(0.001);
      expect(Math.abs(lat - want[1]) * 111_000).toBeLessThan(0.001);
    }
  });
  it("moves Pyrmont about 1.5 m north-north-east", () => {
    const [lon, lat] = gda94ToGda2020(151.194, -33.87);
    const dx = (lon - 151.194) * 111_320 * Math.cos((33.87 * Math.PI) / 180);
    const dy = (lat + 33.87) * 110_950;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1.4);
    expect(Math.hypot(dx, dy)).toBeLessThan(1.6);
    expect(dy).toBeGreaterThan(dx);
  });
});

const spec = (extra: Partial<ArcgisLayerSpec> = {}): ArcgisLayerSpec => ({
  id: "t",
  label: "Test layer",
  url: "https://example.test/FeatureServer/0",
  outFields: ["OBJECTID"],
  format: "geojson",
  pageSize: 100,
  maxPages: 5,
  retry: { attempts: 3, backoffMs: [1, 1], attemptTimeoutMs: 200 },
  idField: "OBJECTID",
  ...extra,
});
const page = (ids: number[], at: [number, number] = [151.194, -33.87]) => ({
  status: 200,
  json: async () => ({ type: "FeatureCollection", features: ids.map((OBJECTID) => ({ geometry: { type: "Point", coordinates: at }, properties: { OBJECTID } })) }),
});

describe("ArcGIS retries and refusals", () => {
  it("retries 5xx and network errors with backoff, then succeeds", async () => {
    const calls: string[] = [];
    let n = 0;
    const fetchImpl: ArcgisFetch = async (url) => {
      calls.push(url);
      n += 1;
      if (n === 1) return { status: 503, json: async () => ({}) };
      if (n === 2) throw new TypeError("Failed to fetch");
      return page([1, 2]);
    };
    const r = await queryArcgisLayer(spec(), BOX, { fetchImpl });
    expect(r.status).toBe("ok");
    expect(r.retries).toBe(2);
    expect(calls).toHaveLength(3);
  });
  it("retries an attempt that times out", async () => {
    let n = 0;
    const fetchImpl: ArcgisFetch = (_url, signal) => {
      n += 1;
      if (n === 1) return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      return Promise.resolve(page([1]));
    };
    const r = await queryArcgisLayer(spec({ retry: { attempts: 2, backoffMs: [1], attemptTimeoutMs: 30 } }), BOX, { fetchImpl });
    expect(r.status).toBe("ok");
    expect(r.retries).toBe(1);
  });
  for (const code of [401, 403, 429, 498]) {
    it(`never retries HTTP ${code}`, async () => {
      let n = 0;
      const fetchImpl: ArcgisFetch = async () => {
        n += 1;
        return { status: code, json: async () => ({}) };
      };
      const r = await queryArcgisLayer(spec(), BOX, { fetchImpl });
      expect(n).toBe(1);
      expect(r.status).toBe("failed");
      expect(r.refused).toBe(true);
      expect(r.retries).toBe(0);
    });
  }
  it("never retries an ArcGIS error body with code 403", async () => {
    let n = 0;
    const fetchImpl: ArcgisFetch = async () => {
      n += 1;
      return { status: 200, json: async () => ({ error: { code: 403, message: "Token required" } }) };
    };
    const r = await queryArcgisLayer(spec(), BOX, { fetchImpl });
    expect(n).toBe(1);
    expect(r.refused).toBe(true);
    expect(r.note).toMatch(/not retried/);
  });
  it("gives up after the attempt budget and says how many retries", async () => {
    const fetchImpl: ArcgisFetch = async () => ({ status: 500, json: async () => ({}) });
    const r = await queryArcgisLayer(spec(), BOX, { fetchImpl });
    expect(r.status).toBe("failed");
    expect(r.retries).toBe(2);
    expect(r.note).toMatch(/2 retries/);
  });
  it("converts GDA94 features when the spec says so, and asks for the requested outSR", async () => {
    let seen = "";
    const fetchImpl: ArcgisFetch = async (url) => {
      seen = url;
      return page([1], [151.19350536000002, -33.87035351199995]);
    };
    const r = await queryArcgisLayer(spec({ outSR: 4283, datum: "gda94" }), BOX, { fetchImpl });
    expect(seen).toMatch(/outSR=4283/);
    const [lon, lat] = (r.features[0]!.geometry as { coordinates: number[] }).coordinates as [number, number];
    expect(lon).toBeCloseTo(151.19351079185816, 9);
    expect(lat).toBeCloseTo(-33.87034082739581, 9);
  });
});

describe("ArcGIS without a retry policy", () => {
  it("reports a network error as failed instead of throwing", async () => {
    const r = await queryArcgisLayer(spec({ retry: undefined }), BOX, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
    expect(r.status).toBe("failed");
    expect(r.note).toMatch(/Failed to fetch/);
  });
});

describe("tiled ArcGIS queries", () => {
  it("splits the box into n × n tiles that cover it", () => {
    const tiles = splitBounds(BOX, 3);
    expect(tiles).toHaveLength(9);
    expect(Math.min(...tiles.map((t) => t.west))).toBe(BOX.west);
    expect(Math.max(...tiles.map((t) => t.north))).toBeCloseTo(BOX.north, 12);
  });
  it("de-duplicates features that straddle tiles", async () => {
    let n = 0;
    const fetchImpl: ArcgisFetch = async () => page([1, 2, 100 + n++]);
    const r = await queryArcgisTiled(spec({ tiles: 2 }), BOX, { fetchImpl });
    expect(r.status).toBe("ok");
    expect(r.features).toHaveLength(2 + 4);
  });
  it("cancels the remaining tiles after a refusal and surfaces it", async () => {
    let n = 0;
    const fetchImpl: ArcgisFetch = (_url, signal) => {
      n += 1;
      if (n === 1) return Promise.resolve({ status: 429, json: async () => ({}) });
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    };
    const r = await queryArcgisTiled(spec({ tiles: 2 }), BOX, { fetchImpl });
    expect(r.refused).toBe(true);
    expect(r.status).toBe("failed");
    expect(r.note).toMatch(/429/);
    expect(r.note).toMatch(/Remaining tiles were cancelled/);
    expect(n).toBe(4);
  });
  it("keeps a partial notice naming incomplete tiles", async () => {
    let n = 0;
    const fetchImpl: ArcgisFetch = async () => (n++ === 0 ? { status: 404, json: async () => ({}) } : page([n]));
    const r = await queryArcgisTiled(spec({ tiles: 2 }), BOX, { fetchImpl });
    expect(r.status).toBe("partial");
    expect(r.note).toMatch(/3 of 4 tiles complete/);
  });
});

describe("NSW coded values", () => {
  it("decodes lot subtypes and title status from the published domains", () => {
    expect(decodeSubtype("lots", 3)).toMatchObject({ text: "Strata", known: true });
    expect(decodeField("lots", "itstitlestatus", 1)?.known).toBe(true);
    expect(decodeField("buildingComplexes", "buildingcomplextype", 2, 1)).toMatchObject({ text: "High school", known: true });
    expect(humanise("ShoppingCentre")).toBe("Shopping centre");
    expect(humanise("ITSTitle")).toBe("ITS title");
    expect(humanise("Easement for Access")).toBe("Easement for Access");
    expect(humanise("ITSTitle Pending")).toBe("ITS Title Pending");
  });
  it("shows an unknown code raw and flags it", () => {
    const d = decodeField("lots", "itstitlestatus", 77)!;
    expect(d).toMatchObject({ text: "code 77", known: false, raw: "77" });
    const codes = new UnknownCodes("NSW lots");
    codes.add("itstitlestatus", d);
    codes.add("itstitlestatus", d);
    codes.add("classsubtype", decodeSubtype("lots", 1));
    expect(codes.note()).toMatch(/^NSW lots: .*itstitlestatus 77 \(2\)/);
  });
});

describe("NSW building use, rail and transport", () => {
  it("maps building complex subtypes to CityCut uses", () => {
    expect(nswComplexUse(1, 2)).toBe("civic");
    expect(nswComplexUse(2, 21)).toBe("residential");
    expect(nswComplexUse(4, 10)).toBe("retail");
    expect(nswComplexUse(5, 3)).toBe("industrial");
    expect(nswComplexUse(6, 1)).toBe("recreation");
    expect(nswComplexUse(9, 1)).toBe("unclassified");
  });
  const square = (x: number, y: number, s = 10): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
  const building = (id: number, ring: Pt[]) => ({ id, ring, holes: [], heightM: 10, use: "unclassified" }) as unknown as BuildingFeat;
  const layers = (extra: Partial<NswLayers>) => ({ buildingComplexes: [], railways: [], stations: [], ...extra }) as unknown as NswLayers;
  it("gives a footprint the use of the NSW facility inside it, or the nearest within 8 m", () => {
    const buildings = [building(1, square(0, 0)), building(2, square(50, 0)), building(3, square(200, 0))];
    const nsw = layers({
      buildingComplexes: [
        { at: [5, 5], facility: "Education facility", type: "High school", name: "Pyrmont High", use: "civic" },
        { at: [64, 5], facility: "Utility facility", type: "Substation", name: "", use: "industrial" },
        { at: [120, 5], facility: "Medical facility", type: "Hospital", name: "Far", use: "civic" },
      ],
    });
    const out = nswApplyBuildingUse(buildings, nsw);
    expect(out.matched).toBe(2);
    expect(out.buildings[0]).toMatchObject({ use: "civic", nswFacility: "High school, Pyrmont High" });
    expect(out.buildings[1]).toMatchObject({ use: "industrial", nswFacility: "Substation" });
    expect(out.buildings[2]!.use).toBe("unclassified");
    expect(buildings[0]!.use).toBe("unclassified");
  });
  it("draws only operational surface light rail as tram lines", () => {
    const line: Pt[] = [[0, 0], [10, 0]];
    const nsw = layers({
      railways: [
        { line, kind: "light", operational: true, tunnel: false, name: "" },
        { line, kind: "light", operational: true, tunnel: true, name: "" },
        { line, kind: "heavy", operational: true, tunnel: false, name: "" },
        { line, kind: "light", operational: false, tunnel: false, name: "" },
      ],
    });
    expect(nswLightRailLines(nsw)).toHaveLength(1);
  });
  it("does not retry an Overpass 429 and says TfNSW needs a key", async () => {
    let n = 0;
    const fetchImpl: OsmFetch = async () => {
      n += 1;
      return { status: 429, json: async () => ({}) };
    };
    const r = await fetchOsmBusStops({ center: PYRMONT, sideM: 400 }, { fetchImpl });
    expect(n).toBe(1);
    expect(r.stops).toHaveLength(0);
    expect(r.note).toMatch(/429.*not retried/);
    expect(TFNSW_KEY_NOTE).toMatch(/API key/);
  });
  it("keeps OSM bus stops inside the frame", async () => {
    const fetchImpl: OsmFetch = async () => ({
      status: 200,
      json: async () => ({ elements: [{ id: 1, lat: -33.87, lon: 151.194 }, { id: 1, lat: -33.87, lon: 151.194 }, { id: 2, lat: -33.9, lon: 151.194 }] }),
    });
    const r = await fetchOsmBusStops({ center: PYRMONT, sideM: 400 }, { fetchImpl });
    expect(r.stops).toHaveLength(1);
    expect(r.note).toBeNull();
  });
});

describe("NSW road surfaces from corridors", () => {
  const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const corridor = (outer: Pt[], pathway = false) => ({ outer, holes: [], info: { title: "", rows: [] }, name: "", pathway });
  it("grades a corridor by the highest centreline inside it; pathways are paths", () => {
    const c = corridor(ring(-100, -10, 100, 10));
    expect(corridorGrade(c, [{ line: [[-50, 0], [50, 0]], grade: "arterial", name: "" }])).toBe("arterial");
    expect(corridorGrade(c, [])).toBe("local");
    expect(corridorGrade(corridor(ring(0, 0, 5, 5), true), [])).toBe("path");
  });
  it("uses NSW corridors for the surface and Overture only outside them", () => {
    const nsw = { roadCorridors: [corridor(ring(-200, -10, 200, 10))], roadCentrelines: [] } as unknown as NswLayers;
    const roads = [
      { id: 1, line: [[-200, 0], [200, 0]], width: 8, kind: "road", grade: "local" },
      { id: 2, line: [[0, 50], [0, 150]], width: 6, kind: "road", grade: "local" },
    ];
    const split = groundRoadPartition({ roads, sideM: 400, nsw } as unknown as Parameters<typeof groundRoadPartition>[0]);
    expect(split.sources!.nswCorridorM2).toBeCloseTo(400 * 20, -1);
    expect(split.sources!.overtureM2).toBeGreaterThan(400);
    expect(split.sources!.overtureM2).toBeLessThan(800);
    expect(multiArea(split.roads.local)).toBeCloseTo(split.sources!.nswCorridorM2 + split.sources!.overtureM2, -1);
  });
  it("leaves Victoria (no NSW layers) without a source split", () => {
    const split = groundRoadPartition({ roads: [{ id: 1, line: [[-200, 0], [200, 0]], width: 8, kind: "road", grade: "local" }], sideM: 400 } as unknown as Parameters<typeof groundRoadPartition>[0]);
    expect(split.sources).toBeUndefined();
  });
});

describe("planning label thinning", () => {
  const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
  const zone = (x: number, y: number, s: number, code: string) => ({ outer: sq(x, y, s), holes: [], code, epi: "", label: [x + s / 2, y + s / 2] as Pt });
  const hob = (x: number, y: number, s: number, m: number) => ({ outer: sq(x, y, s), holes: [], hob: { kind: "m", value: m }, epi: "", label: [x + s / 2, y + s / 2] as Pt });
  it("drops small polygons, repeats and overlaps; keeps zone codes first", () => {
    const size = 11.5;
    const zoning = [
      zone(-500, -500, 200, "MU1"),
      zone(-280, -500, 200, "MU1"), // same text within the repeat radius
      zone(200, 200, 40, "R1"), // under the minimum area
      zone(0, -200, 150, "SP2"),
    ];
    const nswLayers = { zoning, hob: [hob(0, -200, 150, 28), hob(5, -195, 140, 30)], fsr: [] } as unknown as NswLayers;
    const { labels, dropped } = placeNswLabels(nswLayers, size, 1000);
    expect(labels.filter((l) => l.text === "MU1")).toHaveLength(1);
    expect(labels.some((l) => l.text === "R1")).toBe(false);
    expect(labels[0]!.kind).toBe("zone");
    expect(dropped).toBeGreaterThanOrEqual(2);
    const w = (t: string) => t.length * NSW_LABEL_RULES.glyph * size;
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const a = labels[i]!;
        const b = labels[j]!;
        const apart = Math.abs(a.at[0] - b.at[0]) >= (w(a.text) + w(b.text)) / 2 || Math.abs(a.at[1] - b.at[1]) >= size * 1.2;
        expect(apart).toBe(true);
      }
    }
  });
});

describe("NSW layer specs", () => {
  it("reads Spatial Services in GDA2020 via the multiCRS services; every NSW layer retries transient errors", () => {
    for (const layer of Object.values(NSW_LAYERS) as ArcgisLayerSpec[]) {
      if (layer.url.includes("spatial.nsw.gov.au")) {
        expect(layer.url).toMatch(/_multiCRS\//);
        expect(layer.outSR).toBe(7844);
      } else {
        expect(layer.datum).toBe("gda94");
      }
      if (layer.id !== "cos-contours") expect(layer.retry?.attempts).toBeGreaterThan(1);
    }
    expect(NSW_LAYERS.lots.tiles).toBe(3);
    expect(NSW_LAYERS.lots.pageSize).toBe(100);
  });
  it("decodes lot records and collects unknown codes as a note", () => {
    const poly = { type: "Polygon" as const, coordinates: [[[151.1934, -33.8705], [151.1934, -33.8695], [151.1946, -33.8695], [151.1946, -33.8705], [151.1934, -33.8705]]] };
    const results = Object.fromEntries(
      Object.entries(NSW_LAYERS).map(([key, layer]) => [
        key,
        {
          id: layer.id, status: "ok", pages: 1, ms: 1, note: null,
          features: key === "lots" ? [{ geometry: poly, properties: { lotidstring: "1//SP123", classsubtype: 3, itstitlestatus: 42, hasstratum: 0 } }] : [],
        },
      ]),
    ) as unknown as Parameters<typeof nswLayersFromResults>[0];
    const nsw = nswLayersFromResults(results, PYRMONT, 400, "square", 1);
    expect(nsw.lots[0]!.info.title).toMatch(/1\/\/SP123/);
    expect(nsw.lots[0]!.info.rows).toContainEqual(["Kind", "Strata"]);
    expect(nsw.lots[0]!.info.rows).toContainEqual(["Title", "code 42"]);
    expect(nsw.codeNotes.join(" ")).toMatch(/NSW lots: .*itstitlestatus 42/);
  });
});
