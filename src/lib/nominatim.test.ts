import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOMINATIM_MIN_INTERVAL_MS,
  NOMINATIM_USER_AGENT,
  REVERSE_ZOOM,
  localityCacheKey,
  resetNominatimForTests,
  reverseLocality,
  searchPlaces,
} from "./nominatim";

const gertrude = {
  place_id: 1,
  lat: "-37.8052929",
  lon: "144.9746389",
  name: "",
  display_name: "1-9, Gertrude Street, Fitzroy, Melbourne, Victoria, 3065, Australia",
  address: {
    house_number: "1-9",
    road: "Gertrude Street",
    suburb: "Fitzroy",
    state: "Victoria",
    "ISO3166-2-lvl4": "AU-VIC",
    postcode: "3065",
  },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  resetNominatimForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("searchPlaces", () => {
  it("labels a ranged address from the geocoder address, not the first comma", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse([gertrude]));
    vi.stubGlobal("fetch", fetchMock);
    const hits = await searchPlaces("1-9 Gertrude Street Fitzroy");
    expect(hits[0]?.label).toBe("1–9 Gertrude St, Fitzroy VIC 3065");
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/search");
    expect(url).toContain("addressdetails=1");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("User-Agent")).toBe(NOMINATIM_USER_AGENT);
  });
});

describe("reverseLocality", () => {
  it("asks Nominatim reverse at zoom 14 and walks the locality chain", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toContain("/reverse");
      expect(url.searchParams.get("zoom")).toBe(String(REVERSE_ZOOM));
      expect(url.searchParams.get("addressdetails")).toBe("1");
      const suburb = url.searchParams.get("lat") === "-37.8" ? "Carlton" : "";
      return jsonResponse({
        address: suburb
          ? { suburb, city_district: "Inner", state: "Victoria" }
          : { city_district: "Docklands", town: "Ignored", state: "Victoria" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(reverseLocality(-37.8, 144.96)).resolves.toBe("Carlton VIC");
    await expect(reverseLocality(-37.82, 144.95)).resolves.toBe("Docklands VIC");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("User-Agent")).toBe(NOMINATIM_USER_AGENT);
  });

  it("caches by rounded lat/lon and does not send a second request", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ address: { suburb: "North Melbourne", state: "Victoria" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(reverseLocality(-37.80411, 144.94944)).resolves.toBe("North Melbourne VIC");
    await expect(reverseLocality(-37.80414, 144.94944)).resolves.toBe("North Melbourne VIC");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localityCacheKey(-37.80411, 144.94944)).toBe(localityCacheKey(-37.80414, 144.94944));
  });

  it("spaces requests at least one second apart", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    vi.stubGlobal("fetch", async () => {
      starts.push(Date.now());
      return jsonResponse({ address: { suburb: "Fitzroy", state: "Victoria" } });
    });
    const first = reverseLocality(-37.8, 144.97);
    const second = reverseLocality(-37.81, 144.98);
    await vi.advanceTimersByTimeAsync(0);
    await first;
    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_INTERVAL_MS);
    await second;
    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(NOMINATIM_MIN_INTERVAL_MS);
    vi.useRealTimers();
  });

  it("falls back when the lookup returns no locality", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ address: { city: "Melbourne", state: "Victoria" } }));
    await expect(reverseLocality(-37.81, 144.96)).resolves.toBe("-37.8100, 144.9600");
  });
});
