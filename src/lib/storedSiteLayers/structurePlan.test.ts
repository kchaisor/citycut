import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStoredSiteFootprints } from "./footprints";
import {
  deckPlanStrokePaths,
  deckStrokeMaxInteriorM,
  deckStrokeMidpointInteriorM,
  isConsecutiveRingEdge,
  isDeckBoundaryRailSegment,
  isDeckEndCapSegment,
  ringChordCount,
} from "./structurePlan";

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
    const paths = strokes.filter((stroke) => stroke.kind === "rail").map((stroke) => stroke.line);
    const capStrokes = strokes.filter((stroke) => stroke.kind === "cap");
    expect(capStrokes.length).toBeGreaterThan(0);
    const maxEdge = Math.max(
      ...paths.flatMap((rail) => {
        const out: number[] = [];
        for (let i = 0; i < rail.length - 1; i++) {
          out.push(Math.hypot(rail[i + 1]![0] - rail[i]![0], rail[i + 1]![1] - rail[i]![1]));
        }
        return out;
      }),
    );
    expect(raw).toBeGreaterThan(0);
    expect(strokes.length).toBeGreaterThanOrEqual(2);
    expect(maxEdge).toBeLessThan(120);
    const allChains = paths;
    for (const stroke of strokes) {
      for (let i = 0; i < stroke.line.length - 1; i++) {
        const a = stroke.line[i]!;
        const b = stroke.line[i + 1]!;
        expect(deckStrokeMidpointInteriorM(a, b, deck!.ring)).toBeLessThanOrEqual(0.5);
        expect(deckStrokeMaxInteriorM(a, b, deck!.ring)).toBeLessThanOrEqual(0.5);
        if (stroke.kind === "rail") {
          expect(isDeckBoundaryRailSegment(a, b, deck!.ring)).toBe(true);
          expect(isConsecutiveRingEdge(a, b, deck!.ring)).toBe(true);
          expect(isDeckEndCapSegment(a, b, allChains)).toBe(false);
        }
      }
    }
  });
});
