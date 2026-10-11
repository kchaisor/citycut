import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_STYLE } from "../content/constants";
import { loadBasemapStyle } from "./loadMapStyle";

describe("loadBasemapStyle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns sanitized satellite style without network", async () => {
    const result = await loadBasemapStyle("satellite");
    expect(result.styleLoadFailed).toBe(false);
    expect(typeof result.style).toBe("object");
  });

  it("falls back to the style URL when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    const result = await loadBasemapStyle("map");
    expect(result.styleLoadFailed).toBe(true);
    expect(result.style).toBe(MAP_STYLE);
  });

  it("falls back to the style URL when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );
    const result = await loadBasemapStyle("map");
    expect(result.styleLoadFailed).toBe(true);
    expect(result.style).toBe(MAP_STYLE);
  });
});
