import { describe, expect, it } from "vitest";
import {
  fetchSiteParcelAtPoint,
  parseSiteParcelFeature,
  siteParcelQueryUrl,
} from "./vicmapSiteParcel";

const ORIGIN = { lon: 145.05, lat: -37.81 };
const POINT = { lon: 145.0512, lat: -37.8105 };

describe("siteParcelQueryUrl", () => {
  it("requests one feature at a point in WGS84", () => {
    const url = siteParcelQueryUrl(POINT);
    expect(url).toContain("Vicmap_Parcel/FeatureServer/0/query");
    expect(url).toContain("geometryType=esriGeometryEnvelope");
    expect(url).toContain("inSR=4326");
    expect(url).toContain("resultRecordCount=1");
    expect(url).toContain("outFields=parcel_pfi");
    expect(decodeURIComponent(url)).toContain('"wkid":4326');
  });
});

describe("parseSiteParcelFeature", () => {
  it("maps GeoJSON to local rings and drops empty features", () => {
    const json = {
      features: [
        {
          properties: { parcel_pfi: "1033626" },
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
    const parcel = parseSiteParcelFeature(json, ORIGIN, 500);
    expect(parcel?.parcelPfi).toBe("1033626");
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
    expect(parseSiteParcelFeature(json, ORIGIN, 500)?.parcelPfi).toBe("9");
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
