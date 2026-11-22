import { describe, expect, it } from "vitest";
import { model as baseModel } from "./aiExport.test";
import {
  buildExplodedAxoLayers,
  defaultExplodedAxoSettings,
  type ExplodedAxoOverlayBundle,
  type ExplodedAxoSettings,
} from "./explodedAxo";
import { explodedAxoChunks } from "./explodedAxoExport";
import type { CityModel } from "../types";

function inside(point: number[], ring: number[][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > point[1]! !== yj! > point[1]! && point[0]! < ((xj! - xi!) * (point[1]! - yi!)) / (yj! - yi!) + xi!) hit = !hit;
  }
  return hit;
}

const NOTE = "Transport from Transport for NSW Open Data, CC BY 4.0";

function transportOn(m: CityModel): ExplodedAxoSettings {
  const s = defaultExplodedAxoSettings(m.sideM);
  return { ...s, layerVisible: { ...s.layerVisible, transport: true } };
}

const withNote: ExplodedAxoOverlayBundle = {
  transport: {
    rail: { lines: [], stations: [[0, 0]] },
    pt: { lines: [{ mode: "bus", line: [[-40, 15], [40, 15]] }], stops: [] },
    note: NOTE,
  },
};

describe("exploded axo transport legend", () => {
  it("keeps the transport note and the Train / Tram / Bus legend off the plate", () => {
    const m = baseModel();
    const transport = buildExplodedAxoLayers(m, transportOn(m), withNote).layers.find((l) => l.id === "transport")!;
    expect(transport.sourceNote).toBeUndefined();
    expect(transport.legend).toBeUndefined();
    expect(transport.unavailableNote).toBeUndefined();
    expect(transport.creditNote).toBe(NOTE);
    expect(transport.dockLegend).toEqual({
      title: "Transport",
      unavailable: false,
      swatches: [
        { label: "Train", paint: "pt-train" },
        { label: "Tram", paint: "pt-tram" },
        { label: "Bus", paint: "pt-bus" },
      ],
    });
  });

  it("reports unavailable transport in the legend card, not as a sentence on the plate", () => {
    const m = baseModel();
    const transport = buildExplodedAxoLayers(m, transportOn(m), { transport: "unavailable" }).layers.find(
      (l) => l.id === "transport",
    )!;
    expect(transport.unavailableNote).toBeUndefined();
    expect(transport.sourceNote).toBeUndefined();
    expect(transport.dockLegend?.unavailable).toBe(true);
  });

  it("puts the legend in the sheet margin and the source credit in the footer", () => {
    const m = baseModel();
    const settings = transportOn(m);
    const chunks = explodedAxoChunks(m, 1000, settings, null, withNote);
    const transportChunk = chunks.find((c) => c.name === "Transport");
    expect(transportChunk?.texts ?? []).toHaveLength(0);

    const annotation = chunks.find((c) => c.name === "Annotation")!;
    const texts = annotation.texts ?? [];
    for (const label of ["TRANSPORT", "Train", "Tram", "Bus"]) {
      expect(texts.some((t) => t.text === label)).toBe(true);
    }
    expect(annotation.paths).toHaveLength(3);

    const plates = chunks
      .filter((c) => !["Annotation", "Labels", "Guides"].includes(c.name))
      .map((c) => c.paths?.[0]?.rings[0])
      .filter((ring): ring is number[][] => Boolean(ring && ring.length >= 3));
    expect(plates.length).toBeGreaterThan(0);
    const legendPoints = [
      ...texts.filter((t) => ["TRANSPORT", "Train", "Tram", "Bus"].includes(t.text)).map((t) => [t.x, t.y]),
      ...(annotation.paths ?? []).flatMap((p) => p.rings[0]!),
    ];
    for (const point of legendPoints) {
      for (const plate of plates) expect(inside(point, plate)).toBe(false);
    }
    const footer = texts.find((t) => t.text.startsWith("CityCut."))!;
    expect(footer.text).toContain(NOTE);
    expect(chunks.flatMap((c) => c.texts ?? []).filter((t) => t.text.includes(NOTE))).toEqual([footer]);
  });

  it("puts an Unavailable line in the sheet legend when transport failed", () => {
    const m = baseModel();
    const annotation = explodedAxoChunks(m, 1000, transportOn(m), null, { transport: "unavailable" }).find(
      (c) => c.name === "Annotation",
    )!;
    expect((annotation.texts ?? []).map((t) => t.text)).toEqual(expect.arrayContaining(["TRANSPORT", "Unavailable"]));
    expect(annotation.paths ?? []).toHaveLength(0);
  });

  it("leaves the sheet without a transport legend when the layer is off", () => {
    const m = baseModel();
    const s = defaultExplodedAxoSettings(m.sideM);
    const off = { ...s, layerVisible: { ...s.layerVisible, transport: false } };
    const annotation = explodedAxoChunks(m, 1000, off, null, withNote).find((c) => c.name === "Annotation")!;
    expect((annotation.texts ?? []).some((t) => t.text === "TRANSPORT")).toBe(false);
  });
});
