import { describe, expect, it } from "vitest";
import { wikidataSourceRow } from "./dataSources";
import type { WikidataLandmarksState } from "./wikidataLandmarks";

const ok = (over: Partial<Extract<WikidataLandmarksState, { status: "ok" }>> = {}): WikidataLandmarksState => ({
  status: "ok",
  source: "baked",
  generatedAt: "2026-11-20T23:12:43.074Z",
  matches: [],
  inCut: 0,
  noFootprint: 0,
  manyFootprints: 0,
  ...over,
});

describe("Wikidata sources row", () => {
  it("is absent when buildings are off", () => {
    expect(wikidataSourceRow({ status: "idle" })).toBeNull();
  });

  it("shows loading, then the match count with the bake date and CC0 credit", () => {
    expect(wikidataSourceRow({ status: "loading" })).toMatchObject({ label: "Wikidata landmarks", status: "loading" });
    const matches = Array.from({ length: 14 }, (_, k) => ({ buildingId: k, item: {} as never }));
    expect(wikidataSourceRow(ok({ matches, inCut: 14 }))).toEqual({
      id: "wikidata",
      label: "Wikidata landmarks",
      status: "ok",
      detail: "14 landmarks matched",
      notes: ["Baked Wikidata file queried 2026-11-20. Wikidata (CC0)."],
    });
  });

  it("says 0 landmarks, not an error, for a cut with none", () => {
    expect(wikidataSourceRow(ok())).toMatchObject({ status: "ok", detail: "0 landmarks matched" });
  });

  it("explains items it could not put on a building", () => {
    const row = wikidataSourceRow(ok({ source: "live", generatedAt: null, inCut: 5, noFootprint: 2, manyFootprints: 1 }))!;
    expect(row.notes).toEqual([
      "Live Wikidata query for this cut. Wikidata (CC0).",
      "5 Wikidata items in this cut; not matched: 2 items on no building footprint, 1 item on more than one footprint.",
    ]);
  });

  it("shows a clear note when Wikidata fails", () => {
    expect(wikidataSourceRow({ status: "failed", reason: "Baked Wikidata file not loaded (HTTP 404); live Wikidata query failed (timed out after 8 s)." })).toEqual({
      id: "wikidata",
      label: "Wikidata landmarks",
      status: "failed",
      detail: "Not available for this area",
      notes: ["Baked Wikidata file not loaded (HTTP 404); live Wikidata query failed (timed out after 8 s)."],
    });
  });
});
