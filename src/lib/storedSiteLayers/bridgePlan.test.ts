import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildBridgePlanFromGlbBuffer, deckRoadOutlines, parseStoredSiteBridgePlan } from "./bridgePlan";
import { parseStoredSiteFootprints } from "./footprints";

describe("Anzac bridge plan", () => {
  it("parses the shipped bridge plan asset", () => {
    const raw = JSON.parse(
      readFileSync(path.join(process.cwd(), "public/site-layers/sydney-rozelle/bridge-plan.json"), "utf8"),
    );
    const plan = parseStoredSiteBridgePlan(raw);
    expect(plan).toBeTruthy();
    expect(plan!.pylonFootprints.length).toBeGreaterThan(0);
    expect(plan!.cableLines.length).toBeGreaterThan(0);
  });

  it("draws deck road-width outlines from the stored deck ring", () => {
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
    const outlines = deckRoadOutlines(deck!.ring);
    expect(outlines.length).toBeGreaterThanOrEqual(1);
    for (const line of outlines) {
      expect(line.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("builds a plan from the bridge glb buffer", async () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "public/site-layers/sydney-rozelle/manifest.json"), "utf8"),
    );
    const buffer = readFileSync(path.join(process.cwd(), "public/site-layers/sydney-rozelle/anzac-bridge.glb"));
    const plan = await buildBridgePlanFromGlbBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      manifest,
      { lon: manifest.origin.lonLat[0], lat: manifest.origin.lonLat[1] },
      56,
      1000,
      "square",
    );
    expect(plan.cablePartIds.length).toBeGreaterThan(0);
    expect(plan.stayPartIds.length).toBeGreaterThan(0);
    expect(plan.pylonPartIds.length).toBeGreaterThan(0);
    expect(plan.stayLines3d.length).toBeGreaterThan(0);
    for (const line of [...plan.cableLines, ...plan.stayLines3d]) {
      for (const [e, n] of line) {
        expect(Math.abs(e)).toBeLessThanOrEqual(500.5);
        expect(Math.abs(n)).toBeLessThanOrEqual(500.5);
      }
    }
  });
});