import { describe, expect, it } from "vitest";
import {
  clearWalkRippleAmenityCacheForTests,
  fetchWalkRippleAmenities,
  WALK_RIPPLE_OVERPASS_ENDPOINTS,
} from "./walkRippleAmenityOsm";

describe("fetchWalkRippleAmenities", () => {
  it("tries the next mirror after HTTP 429 without retrying the same endpoint", async () => {
    clearWalkRippleAmenityCacheForTests();
    const model = { center: { lat: -37.82, lon: 145.12 }, sideM: 800, frameShape: "square" as const };
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url === WALK_RIPPLE_OVERPASS_ENDPOINTS[0]) {
        return { status: 429, json: async () => ({}) };
      }
      return {
        status: 200,
        json: async () => ({
          elements: [
            {
              id: 1,
              lat: -37.82,
              lon: 145.12,
              tags: { amenity: "cafe", name: "Test Café" },
            },
          ],
        }),
      };
    };
    const first = await fetchWalkRippleAmenities(model, { fetchImpl, skipCache: true });
    expect(first.status).toBe("ready");
    expect(first.status === "ready" && first.amenities.length).toBeGreaterThan(0);
    expect(calls).toEqual([WALK_RIPPLE_OVERPASS_ENDPOINTS[0], WALK_RIPPLE_OVERPASS_ENDPOINTS[1]]);
    const second = await fetchWalkRippleAmenities(model, { fetchImpl });
    expect(second.status).toBe("ready");
    expect(calls.length).toBe(2);
  });

  it("caches unavailable when every endpoint fails", async () => {
    clearWalkRippleAmenityCacheForTests();
    let calls = 0;
    const model = { center: { lat: -37.82, lon: 145.12 }, sideM: 800, frameShape: "square" as const };
    const fetchImpl = async () => {
      calls += 1;
      return { status: 503, json: async () => ({}) };
    };
    const first = await fetchWalkRippleAmenities(model, { fetchImpl, skipCache: true });
    expect(first.status).toBe("unavailable");
    expect(calls).toBe(WALK_RIPPLE_OVERPASS_ENDPOINTS.length);
    const second = await fetchWalkRippleAmenities(model, { fetchImpl });
    expect(second.status).toBe("unavailable");
    expect(calls).toBe(WALK_RIPPLE_OVERPASS_ENDPOINTS.length);
  });
});
