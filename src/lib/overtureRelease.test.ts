import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OVERTURE_RELEASE_FALLBACK,
  clearOvertureReleaseCache,
  releaseFromStacCatalog,
  resolveOvertureRelease,
  resolveOvertureReleaseWithMeta,
} from "./overtureRelease";

describe("releaseFromStacCatalog", () => {
  it("uses rel=latest when present", () => {
    expect(
      releaseFromStacCatalog({
        links: [{ rel: "latest", href: "https://stac.overturemaps.org/collections/buildings/2026-09-23.1" }],
      }),
    ).toBe("2026-09-23.1");
  });

  it("picks the newest child when there is no latest link (live catalog shape)", () => {
    expect(
      releaseFromStacCatalog({
        links: [
          { rel: "child", href: "https://stac.overturemaps.org/2026-08-19.0/catalog.json" },
          { rel: "child", href: "https://stac.overturemaps.org/2026-09-23.0/catalog.json" },
          { rel: "child", href: "https://stac.overturemaps.org/2026-09-23.1/catalog.json" },
        ],
      }),
    ).toBe("2026-09-23.1");
  });

  it("falls back to the pin when the catalog has no release links", () => {
    expect(releaseFromStacCatalog({ links: [{ rel: "self", href: "https://stac.overturemaps.org/catalog.json" }] })).toBe(
      OVERTURE_RELEASE_FALLBACK,
    );
  });
});

describe("resolveOvertureRelease", () => {
  afterEach(() => {
    clearOvertureReleaseCache();
    vi.unstubAllGlobals();
  });

  it("resolves from child links without a warning when the catalog loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          links: [
            { rel: "child", href: "https://stac.overturemaps.org/2026-09-23.0/catalog.json" },
            { rel: "child", href: "https://stac.overturemaps.org/2026-09-23.1/catalog.json" },
          ],
        }),
      })),
    );
    await expect(resolveOvertureRelease()).resolves.toBe("2026-09-23.1");
    await expect(resolveOvertureReleaseWithMeta()).resolves.toMatchObject({
      release: "2026-09-23.1",
      stacWarning: null,
    });
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
