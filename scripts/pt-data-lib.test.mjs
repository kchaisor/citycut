import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PT_FALLBACK,
  PT_PACKAGE_SHOW_URL,
  lookupPtResources,
  matchPtResources,
  ptCandidates,
  useFirstWorking,
} from "./pt-data-lib.mjs";

// Recorded package_show (2026-10-12), trimmed to the resource fields.
const recorded = JSON.parse(readFileSync(new URL("./fixtures/pt-package-show.json", import.meta.url), "utf8"));
const res = (o) => ({ success: true, result: { resources: o } });

describe("matchPtResources", () => {
  it("picks lines and stops from the recorded package_show", () => {
    const m = matchPtResources(recorded);
    expect(m.lines?.id).toBe("d8e5a974-98ba-4823-af5f-b0d2185263ac");
    expect(m.stops?.id).toBe("0b8332b8-ee9a-43a0-b83a-367693c0e74e");
    expect(m.lines?.url).toMatch(/public_transport_lines\.geojson$/);
    expect(m.stops?.url).toMatch(/public_transport_stops\.geojson$/);
  });

  it("matches by name and format, not by position", () => {
    const reversed = res([...recorded.result.resources].reverse());
    expect(matchPtResources(reversed)).toEqual(matchPtResources(recorded));
  });

  it("ignores non-GeoJSON, inactive and URL-less resources, and prefers the newest match", () => {
    const [lines, stops] = recorded.result.resources;
    const m = matchPtResources(
      res([
        { ...lines, id: "csv", format: "CSV", mimetype: "text/csv", url: "https://x/lines.csv" },
        { ...lines, id: "old", last_modified: "2024-01-01T00:00:00" },
        { ...lines, id: "deleted", state: "deleted", last_modified: "2030-01-01T00:00:00" },
        { ...lines, id: "nourl", url: "", last_modified: "2030-01-01T00:00:00" },
        lines,
        stops,
      ]),
    );
    expect(m.lines?.id).toBe(lines.id);
    expect(m.stops?.id).toBe(stops.id);
  });

  it("matches on the file name when the resource name is generic", () => {
    const [lines] = recorded.result.resources;
    expect(matchPtResources(res([{ ...lines, name: "GeoJSON" }])).lines?.id).toBe(lines.id);
  });

  it("returns nulls for a failed or empty response", () => {
    expect(matchPtResources({ success: false })).toEqual({ lines: null, stops: null });
    expect(matchPtResources(res([]))).toEqual({ lines: null, stops: null });
    expect(matchPtResources(null)).toEqual({ lines: null, stops: null });
  });
});

describe("lookup, candidates and fallback", () => {
  it("lookup reports an error instead of throwing when the API is down", async () => {
    const r = await lookupPtResources({ fetchImpl: async () => new Response("down", { status: 503 }) });
    expect(r.error).toMatch(/503/);
    expect(r.found).toEqual({ lines: null, stops: null });
    const t = await lookupPtResources({ fetchImpl: async () => { throw new Error("ENOTFOUND"); } });
    expect(t.error).toMatch(/ENOTFOUND/);
  });

  it("lookup hits package_show for the dataset id", async () => {
    let asked = "";
    const r = await lookupPtResources({ fetchImpl: async (u) => { asked = String(u); return Response.json(recorded); } });
    expect(asked).toBe(PT_PACKAGE_SHOW_URL);
    expect(r.error).toBeNull();
  });

  it("orders looked-up URL first, then the fallback, without duplicates", () => {
    const moved = res([{ ...recorded.result.resources[0], id: "new", url: "https://x/new/public_transport_lines.geojson" }]);
    const c = ptCandidates(matchPtResources(moved));
    expect(c.lines.map((x) => x.url)).toEqual(["https://x/new/public_transport_lines.geojson", PT_FALLBACK.lines.url]);
    expect(c.stops.map((x) => x.url)).toEqual([PT_FALLBACK.stops.url]);
    expect(ptCandidates(matchPtResources(recorded)).lines).toHaveLength(1);
  });

  it("falls back, logs the URL used, and fails loudly when every URL fails", async () => {
    const logs = [];
    const c = [{ url: "https://a", source: "api" }, { url: "https://b", source: "fallback" }];
    const used = await useFirstWorking("lines", c, async (u) => { if (u === "https://a") throw new Error("HTTP 404"); return 200; }, (m) => logs.push(m));
    expect(used.url).toBe("https://b");
    expect(logs.at(-1)).toBe("PT lines: using https://b [fallback]");
    await expect(useFirstWorking("stops", c, async () => { throw new Error("HTTP 404"); }, () => {})).rejects.toThrow(
      /PT stops: no working download URL[\s\S]*https:\/\/a[\s\S]*https:\/\/b/,
    );
  });
});
