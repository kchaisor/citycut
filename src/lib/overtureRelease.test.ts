import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OVERTURE_RELEASE_FALLBACK,
  clearOvertureReleaseCache,
  resolveOvertureRelease,
} from "./overtureRelease";

describe("resolveOvertureRelease", () => {
  afterEach(() => {
    clearOvertureReleaseCache();
    vi.unstubAllGlobals();
  });

  it("uses the STAC latest link when the catalog loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          links: [{ rel: "latest", href: "https://stac.overturemaps.org/collections/buildings/2026-09-23.1" }],
        }),
      })),
    );
    await expect(resolveOvertureRelease()).resolves.toBe("2026-09-23.1");
  });

  it("falls back to the pinned release when the catalog fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
      })),
    );
    await expect(resolveOvertureRelease()).resolves.toBe(OVERTURE_RELEASE_FALLBACK);
  });
});
