import { describe, expect, it } from "vitest";
import {
  fetchSiteParcelAtPoint,
  parseSiteParcelFeature,
  pickSiteParcelFeature,
  siteParcelQueryUrl,
} from "./vicmapSiteParcel";

const ORIGIN = { lon: 145.05, lat: -37.81 };
const POINT = { lon: 145.0512, lat: -37.8105 };

describe("siteParcelQueryUrl", () => {
  it("queries with a WGS84 point and no resultRecordCount", () => {
    const url = siteParcelQueryUrl(POINT);
    expect(url).toContain("Vicmap_Parcel/FeatureServer/0/query");
    expect(url).toContain("geometryType=esriGeometryPoint");
    expect(url).toContain("inSR=4326");
    expect(url).toContain("spatialRel=esriSpatialRelIntersects");
    expect(url).toContain("outFields=parcel_pfi%2Cparcel_spi%2Cparcel_road");
    expect(url).not.toContain("resultRecordCount");
    expect(decodeURIComponent(url)).toContain(`${POINT.lon},${POINT.lat}`);
  });
});

describe("pickSiteParcelFeature", () => {
  const roadLot = {
    properties: { parcel_pfi: "road", parcel_road: "Y" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [145.051, -37.81],
          [145.0515, -37.81],
          [145.0515, -37.8105],
          [145.051, -37.8105],
          [145.051, -37.81],
        ],
      ],
    },
  };
  const titleLot = {
    properties: { parcel_pfi: "title", parcel_spi: "1\\TP680035", parcel_road: "N" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [145.0508, -37.8102],
          [145.0514, -37.8102],
          [145.0514, -37.8108],
          [145.0508, -37.8108],
          [145.0508, -37.8102],
        ],
      ],
    },
  };

  it("prefers a non-road parcel that contains the geocoded point", () => {
    const json = { features: [roadLot, titleLot] };
    const picked = pickSiteParcelFeature(json, POINT, ORIGIN);
    expect(picked?.properties?.parcel_pfi).toBe("title");
  });
});

describe("parseSiteParcelFeature", () => {
  it("maps GeoJSON to local rings and drops empty features", () => {
    const json = {
      features: [
        {
          properties: { parcel_pfi: "1033626", parcel_spi: "29\\LP1132" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [145.051, -37.81],
                [145.0513, -37.81],
                [145.0513, -37.8103],
                [145.051, -37.8103],
                [145.051, -37.81],
              ],
            ],
          },
        },
      ],
    };
    const parcel = parseSiteParcelFeature(json, POINT, ORIGIN, 500);
    expect(parcel?.parcelPfi).toBe("1033626");
    expect(parcel?.parcelSpi).toBe("29\\LP1132");
    expect(parcel?.polygons).toHaveLength(1);
    expect(parcel?.boundaryLines.length).toBeGreaterThan(0);
  });

  it("reads MultiPolygon geometry", () => {
    const json = {
      features: [
        {
          properties: { prop_pfi: "9" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [145.051, -37.81],
                  [145.0511, -37.81],
                  [145.0511, -37.8101],
                  [145.051, -37.8101],
                  [145.051, -37.81],
                ],
              ],
            ],
          },
        },
      ],
    };
    expect(parseSiteParcelFeature(json, POINT, ORIGIN, 500)?.parcelPfi).toBe("9");
  });
});

describe("fetchSiteParcelAtPoint", () => {
  it("returns null on HTTP errors without retrying", async () => {
    const fetchImpl = async () => null;
    const parcel = await fetchSiteParcelAtPoint(POINT, ORIGIN, 500, { fetchImpl });
    expect(parcel).toBeNull();
  });

  it("returns null outside Victoria", async () => {
    const fetchImpl = async () => ({ features: [] });
    const parcel = await fetchSiteParcelAtPoint({ lon: 151, lat: -33.8 }, ORIGIN, 500, { fetchImpl });
    expect(parcel).toBeNull();
  });
});
