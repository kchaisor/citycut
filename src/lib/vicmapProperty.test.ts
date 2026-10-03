import { describe, expect, it } from "vitest";
import {
  clearVicmapPropertyCache,
  clipPropertyLines,
  fetchVicmapPropertyLayer,
  nextPropertyOffset,
  parsePropertyPage,
  propertyCacheKey,
  propertyQueryUrl,
  viewBoundsLonLat,
} from "./vicmapProperty";

const ORIGIN = { lon: 144.978, lat: -37.799 };

describe("propertyQueryUrl", () => {
  it("requests prop_pfi and the envelope in WGS84", () => {
    const url = propertyQueryUrl(
      { west: 144.97, south: -37.81, north: -37.799, east: 144.98 },
      0,
    );
    expect(url).toContain("Vicmap_Property/FeatureServer/0/query");
    expect(url).toContain("outFields=prop_pfi");
    expect(url).toContain("inSR=4326");
    expect(url).toContain("outSR=4326");
    expect(url).toContain("resultRecordCount=2000");
    expect(url).toContain("resultOffset=0");
    expect(decodeURIComponent(url)).toContain('"xmin":144.97');
  });
});

describe("parsePropertyPage", () => {
  it("maps GeoJSON rings to local metres and drops features without a parcel id", () => {
    const json = {
      features: [
        {
          properties: { prop_pfi: "1033626" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [144.978, -37.799],
                [144.9782, -37.799],
                [144.9782, -37.7992],
                [144.978, -37.7992],
                [144.978, -37.799],
              ],
            ],
          },
        },
        {
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[144.977, -37.799], [144.9771, -37.799], [144.977, -37.7991], [144.977, -37.799]]],
          },
        },
      ],
    };
    const page = parsePropertyPage(json, ORIGIN);
    expect(page.count).toBe(2);
    expect(page.lines).toHaveLength(1);
    expect(page.lines[0][0][0]).toBeCloseTo(0, 0);
    expect(page.lines[0][0][1]).toBeCloseTo(0, 0);
  });

  it("reads MultiPolygon geometry", () => {
    const json = {
      features: [
        {
          properties: { prop_pfi: "1" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [144.978, -37.799],
                  [144.9781, -37.799],
                  [144.9781, -37.7991],
                  [144.978, -37.7991],
                  [144.978, -37.799],
                ],
              ],
            ],
          },
        },
      ],
    };
    expect(parsePropertyPage(json, ORIGIN).lines).toHaveLength(1);
  });
});

describe("viewBoundsLonLat", () => {
  it("converts a plan view box to geographic bounds", () => {
    const bounds = viewBoundsLonLat({ x: -100, y: -100, w: 200, h: 200 }, ORIGIN);
    expect(bounds.west).toBeLessThan(bounds.east);
    expect(bounds.south).toBeLessThan(bounds.north);
    expect(bounds.west).toBeCloseTo(ORIGIN.lon - 100 / 111_320 / Math.cos((ORIGIN.lat * Math.PI) / 180), 3);
  });
});

describe("paging and cache", () => {
  it("steps offsets while the service reports a cap", () => {
    expect(nextPropertyOffset(0, { count: 2000, exceeded: true })).toBe(2000);
    expect(nextPropertyOffset(0, { count: 2000, exceeded: false })).toBe(2000);
    expect(nextPropertyOffset(0, { count: 12, exceeded: false })).toBeNull();
  });

  it("clips rings to the cut square", () => {
    const ring: [number, number][] = [
      [-600, 0],
      [600, 0],
    ];
    const clipped = clipPropertyLines([ring], 500);
    expect(clipped).toHaveLength(1);
    expect(clipped[0][0][0]).toBeCloseTo(-500, 0);
    expect(clipped[0][1][0]).toBeCloseTo(500, 0);
  });

  it("reuses a cached bbox response", async () => {
    clearVicmapPropertyCache();
    const bounds = { west: 144.97, south: -37.81, north: -37.799, east: 144.98 };
    const key = propertyCacheKey(bounds);
    expect(key).toBeTruthy();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        features: [
          {
            properties: { prop_pfi: "1" },
            geometry: {
              type: "Polygon",
              coordinates: [[[144.978, -37.799], [144.9781, -37.799], [144.9781, -37.7991], [144.978, -37.7991], [144.978, -37.799]]],
            },
          },
        ],
      };
    };
    const first = await fetchVicmapPropertyLayer(bounds, ORIGIN, 500, { fetchImpl });
    const second = await fetchVicmapPropertyLayer(bounds, ORIGIN, 500, { fetchImpl });
    expect(first?.lines.length).toBeGreaterThan(0);
    expect(second?.lines).toEqual(first?.lines);
    expect(calls).toBe(1);
  });
});
