import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANDMARK_LABEL_LAYER, figureGroundSvg, sitePlanChunks, sitePlanSvg } from "./aiPlan";
import { model } from "./aiExport.test";
import type { LandmarkLabelSource } from "./landmarkLabels";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));
const labels: LandmarkLabelSource[] = [{ buildingId: 1, name: "Eureka Tower", at: [0, 0], rank: 297 }];

describe("landmark labels in Drawing exports", () => {
  it("adds a halo-stroked text layer to the site-plan SVG only when labels are on", async () => {
    const on = await sitePlanSvg(model(), 1000, undefined, { castShadows: false, landmarkLabels: labels });
    expect(on).toContain(`inkscape:label="${LANDMARK_LABEL_LAYER}"`);
    expect(on).toMatch(/<text[^>]*paint-order="stroke"[^>]*>Eureka Tower<\/text>/);
    expect(on).toMatch(/<text[^>]*stroke="#ffffff"[^>]*>Eureka Tower/);
    expect(on).toMatch(/<text[^>]*font-weight="500"[^>]*text-anchor="middle"/);
    const off = await sitePlanSvg(model(), 1000, undefined, { castShadows: false, landmarkLabels: [] });
    expect(off).not.toContain("Eureka Tower");
    const none = await sitePlanSvg(model(), 1000, undefined, { castShadows: false });
    expect(none).not.toContain(LANDMARK_LABEL_LAYER);
  });

  it("adds the labels to the figure-ground SVG only when labels are on", async () => {
    expect(await figureGroundSvg(model(), 1000, undefined, null, labels)).toContain(">Eureka Tower</text>");
    expect(await figureGroundSvg(model(), 1000, undefined, null, null)).not.toContain("Eureka Tower");
  });

  it("keeps labels out of the Illustrator site-plan chunks", () => {
    const chunks = sitePlanChunks(model(), 1000, undefined, { castShadows: false, landmarkLabels: labels });
    expect(chunks.some((chunk) => chunk.name === LANDMARK_LABEL_LAYER)).toBe(false);
  });

  it("draws the Drawing halo as an SVG stroke, not in app CSS", () => {
    const drawing = readFileSync(`${srcRoot}/components/DrawingLandmarkLabels.tsx`, "utf8");
    expect(drawing).toMatch(/paintOrder="stroke"/);
    expect(drawing).toMatch(/stroke=\{halo\}/);
    const css = readFileSync(`${srcRoot}/floating.css`, "utf8");
    const rule = css.match(/\.plan-landmark-label\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).not.toMatch(/stroke|text-shadow|paint-order/);
  });

  it("passes the 3D PNG labels only from the projector, which clears them when the toggle is off", () => {
    const projector = readFileSync(`${srcRoot}/components/LandmarkLabelProjector.tsx`, "utf8");
    expect(projector).toMatch(/if \(!enabled \|\| sources\.length === 0\) \{\s*exportRef\.current = null;/);
    const scene = readFileSync(`${srcRoot}/components/Scene3D.tsx`, "utf8");
    expect(scene).toMatch(/captureViewPng\([\s\S]{0,200}landmarkLabelsRef\?\.current \?\? null\)/);
  });
});
