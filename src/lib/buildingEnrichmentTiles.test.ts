import { describe, expect, it } from "vitest";
import { isEnrichmentFetchAbort } from "./buildingEnrichmentTiles";
import { getPmtilesProtocol, sharedPmtilesForAbsoluteUrl } from "./registerPmtilesProtocol";

describe("isEnrichmentFetchAbort", () => {
  it("recognises AbortSignal and AbortError", () => {
    const controller = new AbortController();
    controller.abort();
    expect(isEnrichmentFetchAbort(new DOMException("Aborted", "AbortError"), controller.signal)).toBe(
      true,
    );
  });
});

describe("shared enrichment PMTiles", () => {
  it("reuses one PMTiles instance per URL for MapLibre and app reads", () => {
    const url = "https://example.test/building-enrichment.pmtiles";
    const a = sharedPmtilesForAbsoluteUrl(url);
    const b = sharedPmtilesForAbsoluteUrl(url);
    expect(a).toBe(b);
    expect(getPmtilesProtocol().tiles.get(url)).toBe(a);
  });
});

/** Minimal decode check for compact tile attributes (u/s) vs legacy strings. */
function decodeUseSource(props: Record<string, unknown>): { use: string; useSource: string } | null {
  const USE_FROM_CODE: Record<number, string> = {
    0: "unclassified",
    1: "residential",
    2: "commercial",
    3: "retail",
    4: "mixed_use",
    5: "industrial",
    6: "civic",
    7: "recreation",
    8: "outbuilding",
  };
  const SOURCE_FROM_CODE: Record<number, string> = {
    0: "unclassified",
    1: "overture",
    2: "clue",
    3: "bca",
    4: "zone",
  };
  const use =
    typeof props.use === "string"
      ? props.use
      : typeof props.u === "number"
        ? USE_FROM_CODE[props.u]
        : null;
  const useSource =
    typeof props.use_source === "string"
      ? props.use_source
      : typeof props.s === "number"
        ? SOURCE_FROM_CODE[props.s]
        : null;
  if (!use || !useSource) return null;
  return { use, useSource };
}

describe("building enrichment tile props", () => {
  it("accepts legacy string use_source", () => {
    expect(decodeUseSource({ use: "retail", use_source: "clue" })).toEqual({
      use: "retail",
      useSource: "clue",
    });
  });

  it("accepts compact u/s codes", () => {
    expect(decodeUseSource({ u: 3, s: 2, overture_id: "x" })).toEqual({
      use: "retail",
      useSource: "clue",
    });
  });
});
