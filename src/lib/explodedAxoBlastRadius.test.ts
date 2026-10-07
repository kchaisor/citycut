import { describe, expect, it } from "vitest";
import type { PdfChunk } from "./aiDocument";
import { figureGroundChunks, sitePlanChunks } from "./aiPlan";
import { model } from "./aiExport.test";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import { explodedAxoChunks } from "./explodedAxoExport";
import { buildExplodedAxoLayers, defaultExplodedAxoSettings } from "./explodedAxo";

function digest(value: unknown): string {
  return JSON.stringify(value);
}

function chunkDigest(chunks: PdfChunk[]): string {
  return digest(
    chunks.map((chunk) => ({
      name: chunk.name,
      paths: chunk.paths?.map((path) => ({
        rings: path.rings?.length ?? 0,
        fill: path.fill,
        stroke: path.stroke,
        strokeMm: path.strokeMm,
      })),
      texts: chunk.texts?.length ?? 0,
    })),
  );
}

function axoLayerDigest(): string {
  const fixture = model();
  const settings = defaultExplodedAxoSettings(fixture.sideM);
  const { layers } = buildExplodedAxoLayers(fixture, settings);
  return digest(
    layers.map((layer) => ({
      id: layer.id,
      fills: layer.fills.length,
      strokes: layer.strokes.length,
      liftM: layer.liftM,
    })),
  );
}

describe("exploded axo blast radius", () => {
  const fixture = model();
  const siteDigest = chunkDigest(sitePlanChunks(fixture, 1000, DEFAULT_LINE_STYLES));
  const figureDigest = chunkDigest(figureGroundChunks(fixture, 1000, DEFAULT_LINE_STYLES));
  const defaultAxoDigest = axoLayerDigest();

  it("keeps site plan layer names stable aside from optional tram routes", () => {
    const names = sitePlanChunks(fixture, 1000, DEFAULT_LINE_STYLES).map((chunk) => chunk.name);
    const baseline = chunkDigest(sitePlanChunks(fixture, 1000, DEFAULT_LINE_STYLES));
    expect(names).toContain("Buildings");
    expect(names).toContain("Green");
    expect(baseline).toBe(siteDigest);
  });

  it("leaves figure-ground PDF chunks unchanged", () => {
    expect(chunkDigest(figureGroundChunks(fixture, 1000, DEFAULT_LINE_STYLES))).toBe(figureDigest);
  });

  it("does not add exploded axo layers to the default Rhino export", async () => {
    const bytes = await cityModelTo3dm(fixture);
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      const layers: string[] = [];
      for (let i = 0; i < doc.layers().count; i++) {
        layers.push(doc.layers().get(i).name);
      }
      expect(layers.some((name) => name.startsWith("ExplodedAxo"))).toBe(false);
      expect(doc.objects().count).toBeGreaterThan(3);
    } finally {
      doc.destroy();
    }
  });

  it("writes exploded axo as its own layered export", () => {
    const chunks = explodedAxoChunks(fixture, 1000, defaultExplodedAxoSettings(fixture.sideM));
    expect(chunks.some((chunk) => chunk.name === "Guides")).toBe(true);
    expect(chunks.some((chunk) => chunk.name === "Water")).toBe(true);
  });

  it("keeps default exploded axo layer geometry unchanged", () => {
    expect(axoLayerDigest()).toBe(defaultAxoDigest);
  });

  it("does not change 3D water areas on the fixture model", () => {
    const waterRings = fixture.areas.filter((area) => area.kind === "water").length;
    expect(waterRings).toBeGreaterThan(0);
    expect(JSON.stringify(fixture.areas.filter((area) => area.kind === "water"))).toBe(
      JSON.stringify(model().areas.filter((area) => area.kind === "water")),
    );
  });
});
