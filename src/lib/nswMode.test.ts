import { describe, expect, it } from "vitest";
import { detectRegion, insideCityOfSydney } from "./region";
import { esriGeometryToGeoJson, parseArcgisPage, queryArcgisLayer, type ArcgisFetch, type ArcgisLayerSpec } from "./arcgisQuery";
import { loadNswContoursForCut } from "./nswContours";
import { hobLabel, nswLayersFromResults, parseHob } from "./nswLayers";
import { NSW_LAYERS } from "./sources/nsw";
import { regionCredit, regionSources } from "./sources/registry";
import { nswZoneColourKey } from "./nswPlanStyle";
import { hatchSegments } from "./nswPlan";
import type { TerrainField } from "../types";

const KEW = { lon: 145.0347, lat: -37.8069 };
const PYRMONT = { lon: 151.194, lat: -33.87 };

describe("state detection", () => {
  it("puts Kew in Victoria and Pyrmont in NSW", () => {
    expect(detectRegion(KEW).region).toBe("vic");
    expect(detectRegion(PYRMONT)).toMatchObject({ region: "nsw", how: "inside" });
  });
  it("splits the Murray border towns correctly", () => {
    expect(detectRegion({ lon: 146.916, lat: -36.08 }).region).toBe("nsw");
    expect(detectRegion({ lon: 146.888, lat: -36.121 }).region).toBe("vic");
  });
  it("leaves Canberra without a state and says why", () => {
    const act = detectRegion({ lon: 149.13, lat: -35.28 });
    expect(act.region).toBeNull();
    expect(act.note).toMatch(/ACT/);
  });
  it("snaps harbour and coastal water to the nearest state; open ocean stays null", () => {
    const harbour = detectRegion({ lon: 151.26, lat: -33.85 });
    expect(harbour.region).toBe("nsw");
    expect(detectRegion({ lon: 160, lat: -30 }).region).toBeNull();
    expect(detectRegion({ lon: 115.86, lat: -31.95 }).region).toBeNull();
  });
  it("knows which cuts the City of Sydney 1 m contours cover", () => {
    expect(insideCityOfSydney(PYRMONT.lon, PYRMONT.lat)).toBe(true);
    expect(insideCityOfSydney(151.1, -33.8)).toBe(false);
  });
});

describe("Esri JSON to GeoJSON", () => {
  it("keeps clockwise outers and attaches counter-clockwise holes", () => {
    const outer = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
    const hole = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
    const other = [[20, 0], [20, 5], [25, 5], [25, 0], [20, 0]];
    expect(esriGeometryToGeoJson({ rings: [outer, hole] })).toEqual({ type: "Polygon", coordinates: [outer, hole] });
    const multi = esriGeometryToGeoJson({ rings: [outer, other, hole] });
    expect(multi).toEqual({ type: "MultiPolygon", coordinates: [[outer, hole], [other]] });
  });
  it("turns paths into lines and drops degenerate geometry", () => {
    expect(esriGeometryToGeoJson({ paths: [[[0, 0], [1, 1]]] })).toEqual({ type: "LineString", coordinates: [[0, 0], [1, 1]] });
    expect(esriGeometryToGeoJson({ paths: [[[0, 0]]] })).toBeNull();
    expect(esriGeometryToGeoJson(null)).toBeNull();
  });
  it("reads attributes and the transfer-limit flag, and surfaces server errors", () => {
    const page = parseArcgisPage({ exceededTransferLimit: true, features: [{ attributes: { a: 1 }, geometry: { x: 1, y: 2 } }] }, "esrijson");
    expect(page.exceeded).toBe(true);
    expect(page.features[0]).toEqual({ properties: { a: 1 }, geometry: { type: "Point", coordinates: [1, 2] } });
    expect(() => parseArcgisPage({ error: { code: 400, message: "Invalid field" } }, "esrijson")).toThrow(/400: Invalid field/);
  });
});

const spec: ArcgisLayerSpec = { id: "t", label: "Test layer", url: "https://example.test/FeatureServer/0", outFields: ["a"], format: "esrijson", pageSize: 2, maxPages: 3 };
const box = { west: 151.19, south: -33.875, east: 151.2, north: -33.865 };
const pt = (n: number) => ({ attributes: { a: n }, geometry: { x: n, y: n } });

function fakeFetch(handler: (url: URL, call: number) => { status: number; body?: unknown } | Promise<never>) {
  const urls: string[] = [];
  const impl: ArcgisFetch = async (url, signal) => {
    urls.push(url);
    const out = handler(new URL(url), urls.length);
    if (out instanceof Promise) {
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    return { status: out.status, json: async () => out.body };
  };
  return { impl, urls };
}

describe("ArcGIS paging", () => {
  it("follows resultOffset until the server stops flagging more", async () => {
    const { impl, urls } = fakeFetch((url) => {
      const offset = Number(url.searchParams.get("resultOffset"));
      return offset === 0 ? { status: 200, body: { exceededTransferLimit: true, features: [pt(1), pt(2)] } } : { status: 200, body: { features: [pt(3)] } };
    });
    const result = await queryArcgisLayer(spec, box, { fetchImpl: impl });
    expect(result).toMatchObject({ status: "ok", pages: 2, note: null });
    expect(result.features).toHaveLength(3);
    expect(urls.map((u) => new URL(u).searchParams.get("resultOffset"))).toEqual(["0", "2"]);
    expect(new URL(urls[0]!).searchParams.get("f")).toBe("json");
  });
  it("marks the result partial at the page cap", async () => {
    const { impl, urls } = fakeFetch(() => ({ status: 200, body: { exceededTransferLimit: true, features: [pt(1), pt(2)] } }));
    const result = await queryArcgisLayer(spec, box, { fetchImpl: impl });
    expect(result.status).toBe("partial");
    expect(result.note).toMatch(/stopped after 3 pages/);
    expect(urls).toHaveLength(3);
  });
  it("keeps what loaded and says so when the 20 s budget runs out", async () => {
    const { impl } = fakeFetch((_, call) => (call === 1 ? { status: 200, body: { exceededTransferLimit: true, features: [pt(1), pt(2)] } } : new Promise<never>(() => {})));
    const result = await queryArcgisLayer(spec, box, { fetchImpl: impl, timeoutMs: 30 });
    expect(result.status).toBe("partial");
    expect(result.features).toHaveLength(2);
    expect(result.note).toMatch(/no answer within/);
  });
  it.each([401, 403, 429])("stops on HTTP %i without retrying", async (code) => {
    const { impl, urls } = fakeFetch(() => ({ status: code }));
    const result = await queryArcgisLayer(spec, box, { fetchImpl: impl });
    expect(result.status).toBe("failed");
    expect(result.note).toMatch(/not retried/);
    expect(urls).toHaveLength(1);
  });
});

describe("HOB reduced levels", () => {
  it("reads m(RL) as a reduced level, never a height", () => {
    expect(parseHob(109, "m(RL)")).toEqual({ kind: "rl", rl: 109 });
    expect(parseHob("45", "m")).toEqual({ kind: "height", metres: 45 });
    expect(hobLabel(parseHob(109, "m(RL)"))).toBe("HOB RL 109 m AHD");
    expect(hobLabel(parseHob(45, "m"))).toBe("HOB 45 m");
    expect(parseHob(null, "m").kind).toBe("unknown");
  });
  it("keeps RL areas as labels only (nothing in the model carries a height from them)", () => {
    const ring = [[151.193, -33.871], [151.193, -33.869], [151.195, -33.869], [151.195, -33.871], [151.193, -33.871]].reverse();
    const results = Object.fromEntries(
      Object.entries(NSW_LAYERS)
      .filter(([, layer]) => layer.id !== "cos-contours" && layer.id !== "nsw-contours")
      .map(([key, layer]) => [key, {
        id: layer.id,
        status: "ok" as const,
        pages: 1,
        ms: 1,
        note: null,
        features: layer.id === "nsw-hob" ? [{ geometry: { type: "Polygon" as const, coordinates: [ring] }, properties: { MAX_B_H: 109, UNITS: "m(RL)" } }] : [],
      }]),
    ) as unknown as Parameters<typeof nswLayersFromResults>[0];
    const layers = nswLayersFromResults(results, PYRMONT, 1000, "square", 1);
    expect(layers.hob).toHaveLength(1);
    expect(layers.hob[0]!.hob).toEqual({ kind: "rl", rl: 109 });
    expect(JSON.stringify(layers.hob[0])).not.toMatch(/height/);
  });
});

function flatField(z: number): TerrainField {
  return { cols: 3, rows: 3, heights: new Float32Array(9).fill(z), min: z, max: z, spacingM: 500, zoom: 14, metresPerPixel: 4, source: "Mapterhorn" } as TerrainField;
}
const pyrmontBounds = { west: 151.1886, south: -33.8745, east: 151.1994, north: -33.8655 };
const line = (z: number) => ({ geometry: { type: "LineString", coordinates: [[151.19, -33.87], [151.198, -33.87]] }, properties: { Contour: z } });
const esriLine = (z: number) => ({ attributes: { elevation: z }, geometry: { paths: [[[151.19, -33.871], [151.198, -33.871]]] } });

describe("NSW contour fallback", () => {
  const route = (cos: () => { status: number; body?: unknown }, nsw: () => { status: number; body?: unknown }) =>
    fakeFetch((url) => (url.hostname === "services1.arcgis.com" ? cos() : nsw())).impl;
  const base = { center: PYRMONT, sideM: 1000, bounds: pyrmontBounds, terrain: () => flatField(5) };

  it("uses City of Sydney 1 m contours when they load", async () => {
    const layer = await loadNswContoursForCut({ ...base, fetchImpl: route(() => ({ status: 200, body: { features: [line(10), line(11)] } }), () => ({ status: 200, body: { features: [] } })) });
    expect(layer?.source).toMatch(/^cos-/);
    expect(layer?.interval).toBe(1);
    expect(layer?.attribution).toContain("City of Sydney CC BY 4.0");
  });
  it("falls back to NSW 2 m contours with a note when City of Sydney fails", async () => {
    const layer = await loadNswContoursForCut({ ...base, fetchImpl: route(() => ({ status: 503 }), () => ({ status: 200, body: { features: [esriLine(10), esriLine(12), esriLine(14)] } })) });
    expect(layer?.source).toBe("nsw-2m");
    expect(layer?.interval).toBe(2);
    expect(layer?.notes?.join(" ")).toMatch(/HTTP 503/);
    expect(layer?.attribution).toContain("© State of New South Wales (Spatial Services, DCS NSW)");
  });
  it("falls back to the Mapterhorn DEM and names both failures", async () => {
    const layer = await loadNswContoursForCut({ ...base, fetchImpl: route(() => ({ status: 503 }), () => ({ status: 429 })) });
    expect(layer?.source).toBe("dem");
    const notes = layer?.notes?.join(" ") ?? "";
    expect(notes).toMatch(/503/);
    expect(notes).toMatch(/429/);
    expect(notes).toMatch(/Mapterhorn DEM/);
  });
});

describe("registry and plan styling", () => {
  it("leaves Victoria without a region credit and spells out the NSW credits exactly", () => {
    expect(regionCredit(undefined)).toBeNull();
    expect(regionCredit("vic")).toBeNull();
    expect(regionCredit("nsw")).toBe(
      "© State of New South Wales (Spatial Services, DCS NSW) · © State Government of NSW and NSW Department of Planning, Housing and Infrastructure · City of Sydney CC BY 4.0",
    );
    expect(regionSources("nsw").length).toBeGreaterThan(0);
  });
  it("maps zone codes to colour groups (RU and RE before R)", () => {
    expect(nswZoneColourKey("R4")).toBe("--nsw-zone-r");
    expect(nswZoneColourKey("RU1")).toBe("--nsw-zone-ru");
    expect(nswZoneColourKey("RE1")).toBe("--nsw-zone-re");
    expect(nswZoneColourKey("MU1")).toBe("--nsw-zone-mu");
    expect(nswZoneColourKey("SP4")).toBe("--nsw-zone-sp");
    expect(nswZoneColourKey("XYZ")).toBe("--nsw-zone-other");
  });
  it("hatches a square at the requested spacing, clipped to the shape", () => {
    const square = { outer: [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]] as [number, number][], holes: [] };
    const segs = hatchSegments(square, 4, 45);
    expect(segs.length).toBeGreaterThan(5);
    for (const [a, b] of segs) for (const [x, y] of [a, b]) {
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x).toBeLessThanOrEqual(20 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(20 + 1e-6);
    }
  });
});

describe("NSW layers reach the site plan and the ground", async () => {
  const { sitePlanChunks, sitePlanLayerOrder } = await import("./aiPlan");
  const { DEFAULT_LINE_STYLES, cloneLineStyles } = await import("./drawingStyle");
  const { groundRoadPartition } = await import("./groundRoads");
  const ring = [[151.1934, -33.8705], [151.1934, -33.8695], [151.1946, -33.8695], [151.1946, -33.8705], [151.1934, -33.8705]];
  const poly = { type: "Polygon" as const, coordinates: [ring] };
  const results = Object.fromEntries(
    Object.entries(NSW_LAYERS)
      .filter(([, layer]) => layer.id !== "cos-contours" && layer.id !== "nsw-contours")
      .map(([key, layer]) => [
        key,
        {
          id: layer.id,
          status: "ok" as const,
          pages: 1,
          ms: 1,
          note: null,
          features:
            key === "lots" || key === "roadCorridors" || key === "zoning" || key === "hob"
              ? [{ geometry: poly, properties: { SYM_CODE: "MU1", MAX_B_H: 109, UNITS: "m(RL)" } }]
              : [],
        },
      ]),
  ) as unknown as Parameters<typeof nswLayersFromResults>[0];
  const nsw = nswLayersFromResults(results, PYRMONT, 400, "square", 1);
  const model = {
    placeLabel: "Pyrmont", center: PYRMONT, sideM: 400, region: "nsw", nsw,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [], roads: [{ id: 1, line: [[-200, 0], [200, 0]], width: 8, kind: "road", grade: "local" }], areas: [], trees: [],
    roadKm: 0.4, buildingCapHit: false, sourceNote: "test",
  } as unknown as import("../types").CityModel;

  it("adds NSW layers to the .ai site plan, with the RL label spelled out", () => {
    const chunks = sitePlanChunks(model, 1000, cloneLineStyles(DEFAULT_LINE_STYLES));
    const order = sitePlanLayerOrder(chunks);
    for (const name of ["NSW zoning", "NSW road corridors", "NSW lots", "NSW planning labels"]) expect(order).toContain(name);
    expect(order.indexOf("NSW zoning")).toBeGreaterThan(order.indexOf("Blocks"));
    expect(JSON.stringify(chunks)).toContain("HOB RL 109 m AHD");
  });
  it("builds Ground::Roads from NSW road corridors and reports the source split", () => {
    const split = groundRoadPartition(model);
    expect(split.sources?.nswCorridorM2).toBeGreaterThan(0);
    expect(Object.values(split.roads).some((m) => m.length > 0)).toBe(true);
  });
});
