import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import liveCatalog from "../../shared/fixtures/overture-stac-catalog-live.json";
import {
  OVERTURE_RELEASE_FALLBACK,
  clearOvertureReleaseCache,
  releaseFromStacCatalog,
  releaseIdFromStacHref,
  resolveOvertureRelease,
  resolveOvertureReleaseForApp,
  resolveOvertureReleaseWithMeta,
} from "./overtureRelease";

const LIVE_FIXTURE = fileURLToPath(
  new URL("../../shared/fixtures/overture-stac-catalog-live.json", import.meta.url),
);

describe("releaseIdFromStacHref", () => {
  it("reads release ids from catalog.json child hrefs", () => {
    expect(releaseIdFromStacHref("https://stac.overturemaps.org/2026-09-23.1/catalog.json")).toBe(
      "2026-09-23.1",
    );
    expect(releaseIdFromStacHref("https://stac.overturemaps.org/2026-09-23.1")).toBe("2026-09-23.1");
  });
});

describe("releaseFromStacCatalog", () => {
  it("matches the live catalog fixture (root latest + child catalog.json hrefs)", () => {
    const catalog = JSON.parse(readFileSync(LIVE_FIXTURE, "utf8"));
    expect(releaseFromStacCatalog(catalog)).toBe("2026-09-23.1");
    expect(releaseFromStacCatalog(liveCatalog)).toBe("2026-09-23.1");
  });

  it("picks a synthetic newer child over older releases", () => {
    const catalog = {
      stac_version: liveCatalog.stac_version,
      links: [
        ...(liveCatalog.links ?? [])
          .filter((link) => link.rel === "child")
          .map((link) => ({ ...link, latest: undefined })),
        {
          rel: "child",
          href: "https://stac.overturemaps.org/2026-10-21.0/catalog.json",
          title: "2026-10-21.0 Overture Release",
        },
      ],
    };
    expect(releaseFromStacCatalog(catalog)).toBe("2026-10-21.0");
  });

  it("prefers rel=latest when present with catalog.json href", () => {
    expect(
      releaseFromStacCatalog({
        links: [{ rel: "latest", href: "https://stac.overturemaps.org/2026-10-21.0/catalog.json" }],
      }),
    ).toBe("2026-10-21.0");
  });

  it("uses rel=latest when present", () => {
    expect(
      releaseFromStacCatalog({
        links: [{ rel: "latest", href: "https://stac.overturemaps.org/collections/buildings/2026-09-23.1" }],
      }),
    ).toBe("2026-09-23.1");
  });

  it("falls back to the pin when the catalog has no release links", () => {
    expect(releaseFromStacCatalog({ links: [{ rel: "self", href: "https://stac.overturemaps.org/catalog.json" }] })).toBe(
      OVERTURE_RELEASE_FALLBACK,
    );
  });
});

describe("resolveOvertureReleaseForApp", () => {
  afterEach(() => {
    clearOvertureReleaseCache();
    vi.unstubAllGlobals();
  });

  it("uses manifest.overtureRelease without calling STAC", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      resolveOvertureReleaseForApp({ overtureRelease: "2026-09-23.1" }),
    ).resolves.toMatchObject({ release: "2026-09-23.1", stacWarning: null });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("resolveOvertureRelease", () => {
  afterEach(() => {
    clearOvertureReleaseCache();
    vi.unstubAllGlobals();
  });

  it("resolves from live-shaped catalog without a warning when the catalog loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => liveCatalog,
      })),
    );
    await expect(resolveOvertureRelease()).resolves.toBe("2026-09-23.1");
    await expect(resolveOvertureReleaseWithMeta()).resolves.toMatchObject({
      release: "2026-09-23.1",
      stacWarning: null,
    });
  });

  it("resolves a newer child from STAC without a warning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          links: [
            { rel: "child", href: "https://stac.overturemaps.org/2026-09-23.1/catalog.json" },
            { rel: "child", href: "https://stac.overturemaps.org/2026-10-21.0/catalog.json" },
          ],
        }),
      })),
    );
    await expect(resolveOvertureReleaseWithMeta()).resolves.toMatchObject({
      release: "2026-10-21.0",
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
