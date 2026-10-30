import { describe, expect, it, vi } from "vitest";
import { CENSUS_FIELDS, type CensusSiteResult, type CensusValues, type SelectedSa1 } from "./censusPeople";
import { fromLocal } from "./geo";
import { PeopleStore } from "./peopleStore";
import {
  WALK_ATTRIBUTION,
  WALK_ENDPOINT,
  WalkIsochroneService,
  fetchWalkContours,
  isochroneUrl,
  parseIsochrone,
  walkRadiusM,
  type FetchLike,
} from "./walkIsochrone";
import type { LonLat, Pt } from "../types";

const origin: LonLat = { lat: -37.8, lon: 144.96 };

function lonLatRing(points: Pt[]): [number, number][] {
  const ring = points.map((p) => {
    const ll = fromLocal(p, origin);
    return [ll.lon, ll.lat] as [number, number];
  });
  return [...ring, ring[0]];
}

function squareLocal(r: number): Pt[] {
  return [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r],
  ];
}

function sample(): unknown {
  return {
    type: "FeatureCollection",
    features: [15, 10, 5].map((contour) => ({
      type: "Feature",
      properties: { contour, metric: "time" },
      geometry: { type: "Polygon", coordinates: [lonLatRing(squareLocal(contour * 20))] },
    })),
  };
}

function okFetch(body: unknown = sample()): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>(async () => ({ ok: true, status: 200, json: async () => body }));
}

function statusFetch(status: number): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>(async () => ({ ok: false, status, json: async () => ({}) }));
}

describe("walking isochrone request", () => {
  it("builds a keyless Valhalla pedestrian request for 5, 10 and 15 minutes", () => {
    const url = isochroneUrl(origin);
    expect(url.startsWith(`${WALK_ENDPOINT}?json=`)).toBe(true);
    const body = JSON.parse(decodeURIComponent(url.split("?json=")[1]));
    expect(body.costing).toBe("pedestrian");
    expect(body.polygons).toBe(true);
    expect(body.contours).toEqual([{ time: 5 }, { time: 10 }, { time: 15 }]);
    expect(body.locations[0]).toEqual({ lat: origin.lat, lon: origin.lon });
    expect(url).not.toMatch(/api_key|token/i);
  });

  it("names Valhalla and OpenStreetMap in the attribution", () => {
    expect(WALK_ATTRIBUTION).toContain("OpenStreetMap contributors");
    expect(WALK_ATTRIBUTION).toContain("Valhalla");
  });
});

describe("walking isochrone parsing", () => {
  it("turns lon/lat contours into local metre polygons keyed by minutes", () => {
    const parsed = parseIsochrone(sample(), origin);
    expect(parsed).not.toBeNull();
    const ring = parsed![10][0][0];
    expect(ring).toHaveLength(4);
    for (const [x, y] of ring) {
      expect(Math.abs(x)).toBeCloseTo(200, 3);
      expect(Math.abs(y)).toBeCloseTo(200, 3);
    }
  });

  it("keeps holes and multipolygon parts", () => {
    const body = {
      type: "FeatureCollection",
      features: [5, 10, 15].map((contour) => ({
        properties: { contour },
        geometry: {
          type: "MultiPolygon",
          coordinates: [[lonLatRing(squareLocal(300)), lonLatRing(squareLocal(100))], [lonLatRing(squareLocal(20).map(([x, y]) => [x + 800, y] as Pt))]],
        },
      })),
    };
    const parsed = parseIsochrone(body, origin)!;
    expect(parsed[5]).toHaveLength(2);
    expect(parsed[5][0]).toHaveLength(2);
  });

  it("rejects malformed responses", () => {
    expect(parseIsochrone(null, origin)).toBeNull();
    expect(parseIsochrone({ features: "x" }, origin)).toBeNull();
    expect(parseIsochrone({ features: [{ properties: { contour: 5 }, geometry: { type: "Polygon", coordinates: [[[1, 2]]] } }] }, origin)).toBeNull();
    const missing = sample() as { features: unknown[] };
    missing.features = missing.features.slice(0, 2);
    expect(parseIsochrone(missing, origin)).toBeNull();
  });
});

describe("walking isochrone fallback", () => {
  it("returns live contours on success", async () => {
    const fetch = okFetch();
    const result = await fetchWalkContours(origin, origin, { fetch });
    expect(result.status).toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back on a network error without retrying", async () => {
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await fetchWalkContours(origin, origin, { fetch });
    expect(result).toEqual({ status: "fallback", reason: "network", httpStatus: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back on a 500 without retrying", async () => {
    const fetch = statusFetch(500);
    const result = await fetchWalkContours(origin, origin, { fetch });
    expect(result).toEqual({ status: "fallback", reason: "http", httpStatus: 500 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back on a malformed body", async () => {
    const result = await fetchWalkContours(origin, origin, { fetch: okFetch({ hello: 1 }) });
    expect(result.status === "fallback" && result.reason).toBe("malformed");
  });

  it("times out and falls back", async () => {
    const fetch = vi.fn<FetchLike>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const result = await fetchWalkContours(origin, origin, { fetch, timeoutMs: 10 });
    expect(result.status === "fallback" && result.reason).toBe("timeout");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("marks the service unavailable for the session on 429 and never calls it again", async () => {
    const fetch = statusFetch(429);
    const service = new WalkIsochroneService(fetch);
    const first = await service.request(origin, origin);
    const second = await service.request({ lat: origin.lat + 0.01, lon: origin.lon }, origin);
    expect(first.status === "fallback" && first.reason).toBe("blocked");
    expect(second.status === "fallback" && second.reason).toBe("blocked");
    expect(service.unavailable).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])("backs off for the session on %i", async (status) => {
    const fetch = statusFetch(status);
    const service = new WalkIsochroneService(fetch);
    await service.request(origin, origin);
    await service.request(origin, origin);
    expect(service.unavailable).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caches by rounded centre", async () => {
    const fetch = okFetch();
    const service = new WalkIsochroneService(fetch);
    await service.request(origin, origin);
    await service.request({ lat: origin.lat + 0.00001, lon: origin.lon - 0.00001 }, origin);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

function vals(o: Partial<CensusValues>): CensusValues {
  const v = {} as CensusValues;
  for (const f of CENSUS_FIELDS) v[f] = o[f] ?? 0;
  return v;
}

function census(): CensusSiteResult {
  const ring: Pt[] = [
    [-500, -500],
    [500, -500],
    [500, 500],
    [-500, 500],
  ];
  const sa1: SelectedSa1 = { code: "A", sa2Code: "x", values: vals({ pop: 1000 }), fraction: 1, clippedKm2: 1, rings: [ring], clipped: [[ring]], containsCentre: true };
  return { status: "ok", sa1: [sa1] } as unknown as CensusSiteResult;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("people store walking lens", () => {
  it("shows a pending circle estimate, then the live polygon", async () => {
    let resolve: (() => void) | null = null;
    const fetch = vi.fn<FetchLike>(
      () =>
        new Promise((done) => {
          resolve = () => done({ ok: true, status: 200, json: async () => sample() });
        }),
    );
    const store = new PeopleStore(1000, "square", origin, new WalkIsochroneService(fetch), 0);
    store.setCensus(census());
    expect(store.get().walk.status).toBe("pending");
    const pendingRing = store.get().walk.polygons[0][0];
    expect(Math.hypot(pendingRing[0][0], pendingRing[0][1])).toBeCloseTo(walkRadiusM(5), 3);
    resolve!();
    await settle();
    await settle();
    expect(store.get().walk.status).toBe("live");
    expect(store.get().lens!.people).toBeCloseTo(1000 * ((200 * 200) / 1e6), -1);
    store.setMinutes(15);
    expect(store.get().walk.status).toBe("live");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("flags a failed fetch as a fallback circle and pins keep their polygon", async () => {
    const fetch = statusFetch(500);
    const store = new PeopleStore(1000, "square", origin, new WalkIsochroneService(fetch), 0);
    store.setCensus(census());
    await settle();
    await settle();
    const walk = store.get().walk;
    expect(walk.status).toBe("fallback");
    expect(walk.reason).toBe("http");
    store.pin();
    expect(store.get().pins[0].area.status).toBe("fallback");
    expect(store.get().pins[0].area.polygons).toBe(walk.polygons);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("debounces requests while dragging and fetches once on drag end", async () => {
    const fetch = okFetch();
    const store = new PeopleStore(1000, "square", origin, new WalkIsochroneService(fetch), 0);
    store.setDragging(true);
    store.setCensus(census());
    await settle();
    const before = fetch.mock.calls.length;
    for (let i = 1; i <= 10; i += 1) store.moveLens([i * 20, 0]);
    await settle();
    expect(fetch.mock.calls.length).toBe(before);
    expect(store.get().walk.status).not.toBe("live");
    store.setDragging(false);
    await settle();
    await settle();
    expect(fetch.mock.calls.length).toBe(before + 1);
    expect(store.get().walk.status).toBe("live");
  });

  it("uses the fallback without fetching when the service is unavailable", () => {
    const store = new PeopleStore(1000, "square", origin, new WalkIsochroneService(null), 0);
    store.setCensus(census());
    expect(store.get().walk.status).toBe("fallback");
    expect(store.get().lens!.people).toBeGreaterThan(0);
  });
});
