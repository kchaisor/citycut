import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { decodeEsriPbf } from "./esri-pbf.mjs";
import {
  ArcgisErrorBody,
  checkArcgisJson,
  checkVicmapPage,
  countCheck,
  decodeVicmapPbfResponse,
  FatalHttpError,
  fetchWithRetry,
  halfMetreUnits,
  osmSizeTags,
  shouldSkip,
  sizeCheck,
  sourceStamps,
  stableNumericId,
  vicmapOidPages,
  vicmapOidPageUrl,
  vicmapProps,
} from "./trees-prebake-lib.mjs";

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const enc = (obj) => new TextEncoder().encode(JSON.stringify(obj));
const response = (status, bytes, type = "application/x-protobuf") => ({
  status,
  ok: status >= 200 && status < 300,
  headers: new Headers({ "content-type": type }),
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

describe("Vicmap OBJECTID paging", () => {
  it("covers every id once in 10,000-id windows", () => {
    const pages = vicmapOidPages(25_001);
    expect(pages).toEqual([[1, 10_001], [10_001, 20_001], [20_001, 25_002]]);
  });
  it("asks for the whole window as pbf with maxRecordCountFactor 5", () => {
    const url = new URL(vicmapOidPageUrl(1, 10_001));
    expect(url.searchParams.get("where")).toBe("OBJECTID>=1 AND OBJECTID<10001");
    expect(url.searchParams.get("resultRecordCount")).toBe("10000");
    expect(url.searchParams.get("maxRecordCountFactor")).toBe("5");
    expect(url.searchParams.get("f")).toBe("pbf");
  });
  it("rejects a truncated page", () => {
    expect(() => checkVicmapPage({ exceededTransferLimit: true, points: [] }, 1, 10_001)).toThrow(ArcgisErrorBody);
  });
});

describe("esri pbf decoding", () => {
  it("matches the GeoJSON answer for the same three trees", () => {
    const decoded = decodeEsriPbf(fixture("vicmap-oid-5000001-3.pbf"));
    const geo = JSON.parse(new TextDecoder().decode(fixture("vicmap-oid-5000001-3.geojson"))).features;
    expect(decoded.points).toHaveLength(3);
    decoded.points.forEach((p, i) => {
      expect(p.lon).toBeCloseTo(geo[i].geometry.coordinates[0], 7);
      expect(p.lat).toBeCloseTo(geo[i].geometry.coordinates[1], 7);
      expect(p.attributes.OBJECTID).toBe(geo[i].properties.OBJECTID);
      expect(p.attributes.height_m).toBeCloseTo(geo[i].properties.height_m, 4);
      expect(p.attributes.dense_canopy).toBe(geo[i].properties.dense_canopy);
    });
  });
});

describe("ArcGIS error bodies", () => {
  const errorBody = { error: { code: 400, message: "", details: ["Unable to perform query. Please check your parameters."] } };
  it("treats HTTP 200 with an error body as a failure", () => {
    expect(() => checkArcgisJson(errorBody)).toThrow(/ArcGIS error 400: Unable to perform query/);
    expect(() => decodeVicmapPbfResponse(enc(errorBody), "application/json; charset=utf-8")).toThrow(ArcgisErrorBody);
    // Even when the content type claims pbf, a JSON body is an error.
    expect(() => decodeVicmapPbfResponse(enc(errorBody), "application/x-protobuf")).toThrow(ArcgisErrorBody);
  });
});

describe("fetchWithRetry", () => {
  const noSleep = async () => {};
  it("retries an error body, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(200, enc({ error: { code: 500, message: "busy" } }), "application/json"))
      .mockResolvedValueOnce(response(200, fixture("vicmap-oid-5000001-3.pbf")));
    const page = await fetchWithRetry("u", decodeVicmapPbfResponse, { fetchImpl, sleep: noSleep });
    expect(page.points).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("gives up after the bounded number of attempts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, enc({ error: { code: 400 } }), "application/json"));
    await expect(fetchWithRetry("u", decodeVicmapPbfResponse, { fetchImpl, sleep: noSleep, attempts: 3, label: "p" })).rejects.toThrow(
      /p failed after 3 attempts: ArcGIS error 400/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it.each([401, 403, 429])("stops at once on HTTP %i", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(status, new Uint8Array()));
    await expect(fetchWithRetry("u", decodeVicmapPbfResponse, { fetchImpl, sleep: noSleep })).rejects.toBeInstanceOf(FatalHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("treats a timeout as a failure and retries it", async () => {
    const fetchImpl = vi.fn((_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
    );
    await expect(
      fetchWithRetry("u", decodeVicmapPbfResponse, { fetchImpl, sleep: noSleep, attempts: 2, timeoutMs: 5, label: "slow" }),
    ).rejects.toThrow(/slow failed after 2 attempts: slow timed out after 5 ms/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("size check", () => {
  it("passes, warns at 90 MB, and fails at 100 MB", () => {
    expect(sizeCheck(89_999_999).level).toBe("ok");
    expect(sizeCheck(90_000_000).level).toBe("warn");
    const fail = sizeCheck(100_000_000);
    expect(fail.level).toBe("fail");
    expect(fail.message).toMatch(/100\.0 MB .* at or over the 100 MB limit\. Not publishing/);
  });
});

describe("count check", () => {
  it("is exact by default", () => {
    expect(() => countCheck("x", 10, 10)).not.toThrow();
    expect(() => countCheck("Vicmap rows", 11_344_005, 11_344_004)).toThrow(/got 11344004, source says 11344005/);
    expect(() => countCheck("x", 0, 0)).toThrow(/no source count/);
  });
});

describe("skip when unchanged", () => {
  const stamps = sourceStamps({
    vicmapDataLastEdit: "2025-06-04T06:35:29.633Z",
    vicmapCount: 11_344_005,
    comDataProcessed: "2025-09-22T01:33:55+00:00",
    comCount: 82_064,
    overtureRelease: "2026-09-23.1",
    zoom: 14,
  });
  it("skips only when every stamp matches", () => {
    expect(shouldSkip({ sourceStamps: { ...stamps } }, stamps).skip).toBe(true);
    expect(shouldSkip(null, stamps)).toEqual({ skip: false, reason: "no previous trees manifest" });
    const changed = shouldSkip({ sourceStamps: { ...stamps, overtureRelease: "2026-08-20.0" } }, stamps);
    expect(changed.skip).toBe(false);
    expect(changed.reason).toMatch(/overtureRelease changed/);
    expect(shouldSkip({ sourceStamps: stamps }, { ...stamps, comDataProcessed: null }).skip).toBe(false);
  });
});

describe("kept fields", () => {
  it("rounds height and crown diameter to half metres and never to zero", () => {
    expect(halfMetreUnits(10.26)).toBe(21);
    expect(halfMetreUnits(0.1)).toBe(1);
    expect(halfMetreUnits(0)).toBeNull();
    expect(vicmapProps({ lon: 145, lat: -37.8, attributes: { height_m: 7.92, canopy_radius_m: 3.85, dense_canopy: "N" } })).toEqual({ h2: 16, c2: 15 });
    expect(vicmapProps({ lon: 145, lat: -37.8, attributes: { height_m: 7, canopy_radius_m: 0, dense_canopy: "Y" } })).toEqual({ h2: 14, d: 1 });
    expect(vicmapProps({ lon: 145, lat: -37.8, attributes: { height_m: 0 } })).toBeNull();
  });
  it("keeps only the OSM tags treeSize reads", () => {
    expect(osmSizeTags('{"natural":"tree","leaf_type":"broadleaved"}')).toBeNull();
    expect(osmSizeTags('{"natural":"tree","height":"12 m","circumference":"1.2"}')).toBe('{"height":"12 m","circumference":"1.2"}');
  });
  it("hashes ids like the app", () => {
    expect(stableNumericId("abc")).toBe(440920331);
  });
});
