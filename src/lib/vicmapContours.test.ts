import { describe, expect, it, beforeEach } from "vitest";
import { squareBBox } from "./geo";
import { planPaths } from "./svgPlan";
import { contourInterval } from "./terrain";
import {
  VICMAP_CONTOUR_PAGE,
  VICMAP_METRO_CONTOUR_URL,
  VICMAP_STATE_CONTOUR_URL,
  VICTORIA_BOUNDS,
  boundsIntersect,
  clearVicmapContourCache,
  clipContoursToFrame,
  contourIsIndex,
  contourQueryUrl,
  demContourLayer,
  drawContours,
  formatContourElevation,
  inferContourInterval,
  loadContoursForCut,
  nextContourOffset,
  parseContourPage,
  type ContourFetch,
} from "./vicmapContours";
import type { CityModel, TerrainField } from "../types";

beforeEach(() => {
  clearVicmapContourCache();
});

function feature(z: number, coordinates: number[][]) {
  return {
    type: "Feature",
    properties: { altitude: z, feature_type_code: "contour" },
    geometry: { type: "LineString", coordinates },
  };
}

function page(features: unknown[], exceeded = false) {
  return { type: "FeatureCollection", features, exceededTransferLimit: exceeded };
}

const melbourne = { lon: 144.9631, lat: -37.8136 };

function field(): TerrainField {
  return {
    cols: 3,
    rows: 3,
    heights: Float32Array.of(0, 10, 20, 0, 10, 20, 0, 10, 20),
    min: 0,
    max: 20,
    spacingM: 50,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

describe("Vicmap contour queries", () => {
  it("builds a paged bbox query in WGS84", () => {
    const bounds = { west: 144.94, south: -37.81, east: 144.96, north: -37.8 };
    const url = new URL(contourQueryUrl(VICMAP_METRO_CONTOUR_URL, bounds, VICMAP_CONTOUR_PAGE));
    expect(url.pathname.endsWith("/FeatureServer/1/query")).toBe(true);
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
    expect(url.searchParams.get("inSR")).toBe("4326");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("geojson");
    expect(url.searchParams.get("outFields")).toBe("altitude,feature_type_code");
    expect(url.searchParams.get("resultRecordCount")).toBe(String(VICMAP_CONTOUR_PAGE));
    expect(url.searchParams.get("resultOffset")).toBe(String(VICMAP_CONTOUR_PAGE));
    expect(url.searchParams.get("orderByFields")).toBe("OBJECTID");
    const geometry = JSON.parse(url.searchParams.get("geometry") ?? "{}") as {
      xmin: number;
      ymin: number;
      xmax: number;
      ymax: number;
    };
    expect(geometry).toMatchObject({ xmin: 144.94, ymin: -37.81, xmax: 144.96, ymax: -37.8 });
  });

  it("pages while a response is full or over the transfer limit", () => {
    expect(nextContourOffset(0, { count: 0, exceeded: false })).toBeNull();
    expect(nextContourOffset(0, { count: 12, exceeded: false })).toBeNull();
    expect(nextContourOffset(0, { count: VICMAP_CONTOUR_PAGE, exceeded: false })).toBe(VICMAP_CONTOUR_PAGE);
    expect(nextContourOffset(VICMAP_CONTOUR_PAGE, { count: 40, exceeded: true })).toBe(VICMAP_CONTOUR_PAGE * 2);
    const parsed = parseContourPage(
      page([
        feature(28, [
          [144.96, -37.81],
          [144.97, -37.81],
        ]),
        feature(Number.NaN, [
          [144.96, -37.81],
          [144.97, -37.81],
        ]),
        {
          type: "Feature",
          properties: { altitude: 30 },
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [144.96, -37.82],
                [144.97, -37.82],
              ],
              [[144.96, -37.83]],
            ],
          },
        },
      ]),
    );
    expect(parsed.count).toBe(3);
    expect(parsed.lines.map((line) => line.z)).toEqual([28, 30]);
  });

  it("clips service lines to the frame and drops lines that miss it", () => {
    const origin = { lon: 0, lat: 0 };
    const half = 100;
    const clipped = clipContoursToFrame(
      [
        {
          z: 12,
          coordinates: [
            [-0.002, 0],
            [0.002, 0],
          ],
        },
        {
          z: 14,
          coordinates: [
            [-0.0002, 0.01],
            [0.0002, 0.01],
          ],
        },
      ],
      origin,
      half,
    );
    expect(clipped).toHaveLength(1);
    expect(clipped[0].z).toBe(12);
    const east = clipped[0].points.map((point) => point[0]);
    expect(Math.min(...east)).toBeCloseTo(-half, 1);
    expect(Math.max(...east)).toBeCloseTo(half, 1);
    for (const point of clipped[0].points) {
      expect(Math.abs(point[0])).toBeLessThanOrEqual(half + 0.01);
      expect(Math.abs(point[1])).toBeLessThanOrEqual(half + 0.01);
    }
  });

  it("marks every fifth interval and labels only those", () => {
    expect(inferContourInterval([27, 28, 29, 31], 10)).toBe(1);
    expect(inferContourInterval([10, 20, 40], 1)).toBe(10);
    expect(inferContourInterval([40], 10)).toBe(10);
    expect(contourIsIndex(5, 1, 5)).toBe(true);
    expect(contourIsIndex(4, 1, 5)).toBe(false);
    expect(contourIsIndex(50, 10, 5)).toBe(true);
    expect(contourIsIndex(40, 10, 5)).toBe(false);
    expect(contourIsIndex(10, 2, 5)).toBe(true);
    expect(formatContourElevation(30)).toBe("30");
    expect(formatContourElevation(30.25)).toBe("30.3");
    const drawn = drawContours(
      [
        { points: [[-80, 0], [80, 0]], z: 4 },
        { points: [[-80, 0], [80, 0]], z: 5 },
        { points: [[-80, 90], [80, 90]], z: 10 },
      ],
      1,
      5,
    );
    expect(drawn.lines.map((line) => line.index)).toEqual([false, true, true]);
    expect(drawn.labels.map((label) => label.text).sort()).toEqual(["10", "5"]);
  });
});

describe("contour fallback", () => {
  it("uses the DEM outside Victoria and does not call the service", async () => {
    const center = { lon: 151.21, lat: -33.87 };
    const sideM = 500;
    let called = 0;
    const fetchImpl: ContourFetch = async () => {
      called += 1;
      return page([]);
    };
    const layer = await loadContoursForCut({
      center,
      sideM,
      bounds: squareBBox(center, sideM),
      fetchImpl,
      terrain: () => field(),
    });
    expect(boundsIntersect(squareBBox(center, sideM), VICTORIA_BOUNDS)).toBe(false);
    expect(called).toBe(0);
    expect(layer?.source).toBe("dem");
    expect(layer?.label).toBe("derived from terrain DEM");
    expect(layer?.lines.length).toBeGreaterThan(0);
    expect(layer?.interval).toBe(contourInterval(20));
  });

  it("keeps Vicmap lines when the metro service answers, including a second page", async () => {
    const center = melbourne;
    const sideM = 400;
    const bounds = squareBBox(center, sideM);
    const inside: number[][] = [
      [center.lon - 0.0004, center.lat],
      [center.lon + 0.0004, center.lat],
    ];
    const calls: string[] = [];
    const fetchImpl: ContourFetch = async (url) => {
      calls.push(url);
      const offset = Number(new URL(url).searchParams.get("resultOffset"));
      if (url.includes("METRO_1_to_5")) {
        if (offset === 0) {
          return page(
            Array.from({ length: VICMAP_CONTOUR_PAGE }, (_, index) => feature(27 + (index % 3), inside)),
            false,
          );
        }
        return page([feature(30, inside)]);
      }
      throw new Error("statewide should not be queried when metro has lines");
    };
    const layer = await loadContoursForCut({
      center,
      sideM,
      bounds,
      fetchImpl,
      terrain: () => field(),
    });
    expect(calls).toHaveLength(2);
    expect(layer?.source).toBe("vicmap-metro");
    expect(layer?.label).toBe("Vicmap Elevation 1 m");
    expect(layer?.featureCount).toBe(VICMAP_CONTOUR_PAGE + 1);
    expect(layer?.lines.length).toBe(VICMAP_CONTOUR_PAGE + 1);
    expect(layer?.attribution).toContain("Creative Commons Attribution 4.0 (CC-BY)");
    const again = await loadContoursForCut({
      center,
      sideM,
      bounds,
      fetchImpl: async () => {
        throw new Error("cache should answer");
      },
      terrain: () => null,
    });
    expect(again?.source).toBe("vicmap-metro");
    expect(again?.fetchMs).toBe(0);
    expect(again?.featureCount).toBe(VICMAP_CONTOUR_PAGE + 1);
  });

  it("uses statewide 10 m contours when the metro layer is empty", async () => {
    const center = melbourne;
    const sideM = 400;
    const inside: number[][] = [
      [center.lon - 0.0004, center.lat],
      [center.lon + 0.0004, center.lat],
    ];
    const fetchImpl: ContourFetch = async (url) => {
      if (url.startsWith(VICMAP_METRO_CONTOUR_URL)) return page([]);
      if (url.startsWith(VICMAP_STATE_CONTOUR_URL)) return page([feature(40, inside), feature(50, inside)]);
      throw new Error(url);
    };
    const layer = await loadContoursForCut({
      center,
      sideM,
      bounds: squareBBox(center, sideM),
      fetchImpl,
      terrain: () => field(),
    });
    expect(layer?.source).toBe("vicmap-state");
    expect(layer?.label).toBe("Vicmap Elevation 10 m");
    expect(layer?.interval).toBe(10);
    expect(layer?.lines).toHaveLength(2);
  });

  it("falls back to the DEM when Vicmap errors or times out", async () => {
    const center = melbourne;
    const sideM = 400;
    const bounds = squareBBox(center, sideM);
    const failed = await loadContoursForCut({
      center,
      sideM,
      bounds,
      fetchImpl: async () => {
        throw new Error("Vicmap contours answered 503.");
      },
      terrain: () => field(),
    });
    expect(failed?.source).toBe("dem");
    expect(failed?.attribution).toBeNull();

    const timedOut = await loadContoursForCut({
      center,
      sideM,
      bounds,
      timeoutMs: 30,
      fetchImpl: (_url, signal) =>
        new Promise((_resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("should have aborted")), 5000);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            const error = new Error("The operation was aborted.");
            error.name = "AbortError";
            reject(error);
          });
        }),
      terrain: () => field(),
    });
    expect(timedOut?.source).toBe("dem");
  });

  it("draws a stored Vicmap layer instead of marching the DEM", () => {
    const dem = demContourLayer(field(), 100);
    const model: CityModel = {
      placeLabel: "Test",
      center: melbourne,
      sideM: 100,
      layers: { buildings: false, roads: false, waterGreen: false, trees: false },
      buildings: [],
      roads: [],
      areas: [],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "test",
      terrain: field(),
      contours: true,
      contourLayer: {
        source: "vicmap-metro",
        label: "Vicmap Elevation 1 m",
        interval: 1,
        lines: [{ points: [[-40, -10], [40, 20]], z: 30 }],
        attribution: "Creative Commons Attribution 4.0 (CC-BY)",
        datasetUrl: null,
        featureCount: 1,
        fetchMs: 12,
      },
    };
    const plan = planPaths(model, 1.2, 5);
    expect(plan.contourSource).toBe("vicmap-metro");
    expect(plan.contourInterval).toBe(1);
    expect(plan.contours).toHaveLength(1);
    expect(plan.contourIndex).toEqual([true]);
    expect(plan.contourLabels.map((label) => label.text)).toEqual(["30"]);
    expect(plan.contours.length).not.toBe(dem.lines.length);
    expect(planPaths({ ...model, contours: false }).contours).toHaveLength(0);
  });
});
