import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStoredSiteFootprints } from "./footprints";
import { deckPlanStrokePaths, deckStrokeSegmentInsideDeck, ringChordCount } from "./structurePlan";

describe("Anzac bridge deck plan outline", () => {
  it("removes bowtie chords from the stored deck ring", () => {
    const footprints = JSON.parse(
      readFileSync(path.join(process.cwd(), "public/site-layers/sydney-rozelle/footprints.geojson"), "utf8"),
    );
    const { structures } = parseStoredSiteFootprints(
      footprints,
      { lon: 151.1832, lat: -33.8677 },
      1000,
      "square",
    );
    const deck = structures.find((s) => s.id.includes("deck"));
    expect(deck).toBeTruthy();
    const raw = ringChordCount(deck!.ring);
    const strokes = deckPlanStrokePaths(deck!.ring);
    const paths = strokes.map((stroke) => stroke.line);
    const maxEdge = Math.max(
      ...paths.flatMap((path) => {
        const out: number[] = [];
        for (let i = 0; i < path.length - 1; i++) {
          out.push(Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1]));
        }
        return out;
      }),
    );
    expect(raw).toBeGreaterThan(0);
    expect(strokes.length).toBeGreaterThanOrEqual(2);
    expect(maxEdge).toBeLessThan(120);
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        expect(deckStrokeSegmentInsideDeck(path[i]!, path[i + 1]!, deck!.ring, paths)).toBe(true);
      }
    }
  });
});
