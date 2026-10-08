import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OVERTURE_RELEASE_FALLBACK,
  clearOvertureReleaseCache,
  resolveOvertureRelease,
  resolveOvertureReleaseWithMeta,
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
        status: 503,
      })),
    );
    await expect(resolveOvertureRelease()).resolves.toBe(OVERTURE_RELEASE_FALLBACK);
    await expect(resolveOvertureReleaseWithMeta()).resolves.toMatchObject({
      release: OVERTURE_RELEASE_FALLBACK,
      stacWarning: expect.stringContaining("503"),
    });
  });

  it("surfaces HTTP 429 on the pinned fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
      })),
    );
    await expect(resolveOvertureReleaseWithMeta()).resolves.toMatchObject({
      release: OVERTURE_RELEASE_FALLBACK,
      stacWarning: expect.stringContaining("429"),
    });
  });
});
