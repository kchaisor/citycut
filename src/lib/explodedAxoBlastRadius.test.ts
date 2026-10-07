import { describe, expect, it } from "vitest";
import type { PdfChunk } from "./aiDocument";
import { figureGroundChunks, sitePlanChunks } from "./aiPlan";
import { model } from "./aiExport.test";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import { explodedAxoChunks } from "./explodedAxoExport";
import { defaultExplodedAxoSettings } from "./explodedAxo";

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

describe("exploded axo blast radius", () => {
  const fixture = model();
  const siteDigest = chunkDigest(sitePlanChunks(fixture, 1000, DEFAULT_LINE_STYLES));
  const figureDigest = chunkDigest(figureGroundChunks(fixture, 1000, DEFAULT_LINE_STYLES));

  it("leaves site plan PDF chunks unchanged", () => {
    expect(chunkDigest(sitePlanChunks(fixture, 1000, DEFAULT_LINE_STYLES))).toBe(siteDigest);
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
});
