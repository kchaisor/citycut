import { describe, expect, it, vi } from "vitest";
import { buildWindArchiveUrl, fetchWindRoseTable, resetWindFetchInflight } from "./windFetch";
import { windCacheKey } from "./windCache";

describe("wind fetch", () => {
  it("builds the Open-Meteo archive URL", () => {
    const url = buildWindArchiveUrl(-37.82, 145.1);
    expect(url).toContain("archive-api.open-meteo.com");
    expect(url).toContain("wind_speed_10m%2Cwind_direction_10m");
    expect(url).toContain("timezone=Australia%2FSydney");
  });

  it("does not retry after a failed response", async () => {
    resetWindFetchInflight();
    const storage = {
      getItem: () => null,
      setItem: () => {},
    } as unknown as Storage;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 429, statusText: "Too Many Requests" }));
    const result = await fetchWindRoseTable(-37.8, 145.1, storage, fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reads cached tables without fetch", async () => {
    const key = windCacheKey(-37.8, 145.1);
    const table = {
      version: 1,
      lat: -37.8,
      lon: 145.1,
      totalHours: 1,
      calmByMonth: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      counts: Array.from({ length: 12 }, () =>
        Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]),
      ),
    };
    const data: Record<string, string> = { [key]: JSON.stringify(table) };
    const storage = {
      getItem(k: string) {
        return data[k] ?? null;
      },
      setItem() {},
    } as unknown as Storage;
    const fetchImpl = vi.fn();
    const result = await fetchWindRoseTable(-37.8, 145.1, storage, fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fromCache).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
