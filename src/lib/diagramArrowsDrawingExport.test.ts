import { describe, expect, it } from "vitest";
import { parseNativeAiLayers, aiLayerLabel } from "./aiNative";
import { sitePlanAi8, sitePlanChunks, sitePlanSvg } from "./aiPlan";
import { model } from "./aiExport.test";
import { getColour } from "./colours";
import { ARROW_COLOUR_TOKENS, type DiagramArrow } from "./diagramArrows";
import { buildArrowShape, shapeFills } from "./diagramArrowsShape";
import { DIAGRAM_ARROWS_LAYER } from "./diagramArrowsDrawingExport";
import { sitePlanRhinoLayerNames, sitePlanTo3dm } from "./planRhinoExport";
import { loadRhino } from "./rhinoExport";

const arrow = (over: Partial<DiagramArrow>): DiagramArrow => ({
  id: "a",
  points: [[-30, 0], [0, 10], [30, 0]],
  style: "bold",
  colour: "red",
  width: 1,
  heightM: 20,
  animation: "none",
  speed: 1,
  showIn3d: true,
  showInDrawing: true,
  ...over,
});

const SIDE = model().sideM;
const shapeCount = (a: DiagramArrow) => {
  return shapeFills(buildArrowShape(a.points, a.style, a.width, SIDE), 8).length;
};

function layerGroup(svg: string, label: string): string | null {
  const match = svg.match(new RegExp(`<g id="[^"]*" inkscape:groupmode="layer" inkscape:label="${label}">([\\s\\S]*?)</g>`));
  return match ? match[1]! : null;
}

function hex(token: string): string {
  const value = getColour(token as never).trim().toLowerCase();
  return value.length === 4 ? `#${[...value.slice(1)].map((c) => c + c).join("")}` : value;
}

describe("arrows in the Drawing .svg", () => {
  it("writes one filled path per shape in the Diagram arrows layer, with colour and no label", async () => {
    const bold = arrow({ ...({ label: "Ferry route" } as object) });
    const dashed = arrow({ id: "b", style: "dashed", colour: "blue", points: [[-40, -20], [40, -20]] });
    const hidden = arrow({ id: "c", showInDrawing: false });
    const svg = await sitePlanSvg(model(), 1000, undefined, { arrows: [bold, dashed, hidden] });
    const group = layerGroup(svg, DIAGRAM_ARROWS_LAYER)!;
    expect(group).toBeTruthy();
    expect(group.match(/<path /g)).toHaveLength(shapeCount(bold) + shapeCount(dashed));
    expect(shapeCount(dashed)).toBeGreaterThan(2);
    expect(group).toContain(`fill="${hex("--arrow-red")}"`);
    expect(group).toContain(`fill="${hex("--arrow-blue")}"`);
    expect(group).not.toContain("stroke-dasharray");
    expect(group).not.toContain("<text");
    expect(group).not.toContain("Ferry route");
    expect(svg).not.toContain("Ferry route");
  });

  it("writes the streak style as faded comets with no solid body", async () => {
    const streak = arrow({ style: "streak", points: [[-200, 0], [200, 0]] });
    const group = layerGroup(await sitePlanSvg(model(), 1000, undefined, { arrows: [streak] }), DIAGRAM_ARROWS_LAYER)!;
    expect(group.match(/<path /g)).toHaveLength(shapeCount(streak));
    expect(group).toMatch(/opacity="0\.\d+/);
  });

  it("drops arrows with Show in Drawing off, whatever else is on", async () => {
    const shown = arrow({ id: "shown" });
    const off = arrow({ id: "off", showIn3d: true, showInDrawing: false, points: [[-40, -20], [40, -20]] });
    const group = layerGroup(await sitePlanSvg(model(), 1000, undefined, { arrows: [shown, off] }), DIAGRAM_ARROWS_LAYER)!;
    expect(group.match(/<path /g)).toHaveLength(shapeCount(shown));
    const only3d = arrow({ id: "three", showIn3d: true, showInDrawing: false });
    expect(sitePlanChunks(model(), 1000, undefined, { arrows: [only3d] }).some((c) => c.name === DIAGRAM_ARROWS_LAYER)).toBe(false);
  });

  it("keeps Show in Drawing arrows even when Show in 3D is off", async () => {
    const drawingOnly = arrow({ showIn3d: false });
    const group = layerGroup(await sitePlanSvg(model(), 1000, undefined, { arrows: [drawingOnly] }), DIAGRAM_ARROWS_LAYER)!;
    expect(group.match(/<path /g)).toHaveLength(shapeCount(drawingOnly));
  });

  it("styles change the shape count: double has two heads, dashed has gaps", () => {
    expect(shapeCount(arrow({ style: "double" }))).toBe(3);
    expect(shapeCount(arrow({ style: "bold" }))).toBe(2);
    expect(shapeCount(arrow({ style: "dotted", points: [[-40, 0], [40, 0]] }))).toBeGreaterThan(5);
    expect(shapeCount(arrow({ style: "chevron", points: [[-40, 0], [40, 0]] }))).toBeGreaterThan(2);
    expect(shapeCount(arrow({ style: "dashed", points: [[-40, 0], [40, 0]] }))).toBeGreaterThan(2);
  });

  it("adds no layer when there are no arrows, only hidden arrows, or the layer is off", async () => {
    for (const arrows of [undefined, null, [], [arrow({ showInDrawing: false })]]) {
      const svg = await sitePlanSvg(model(), 1000, undefined, { arrows });
      expect(layerGroup(svg, DIAGRAM_ARROWS_LAYER)).toBeNull();
      expect(sitePlanChunks(model(), 1000, undefined, { arrows }).some((c) => c.name === DIAGRAM_ARROWS_LAYER)).toBe(false);
    }
  });
});

describe("arrows in the Drawing .ai", () => {
  it("has the Diagram arrows layer only when arrows are shown", () => {
    const label = aiLayerLabel(DIAGRAM_ARROWS_LAYER);
    expect(parseNativeAiLayers(sitePlanAi8(model(), 1000, undefined, { arrows: [arrow({})] }))).toContain(label);
    expect(parseNativeAiLayers(sitePlanAi8(model(), 1000, undefined, { arrows: [] }))).not.toContain(label);
    expect(parseNativeAiLayers(sitePlanAi8(model(), 1000))).not.toContain(label);
  });

  it("carries the arrow fill colour and shapes, with no text, in the layer chunk", () => {
    const chunk = sitePlanChunks(model(), 1000, undefined, { arrows: [arrow({ colour: "green", ...({ label: "Flow" } as object) })] }).find(
      (c) => c.name === DIAGRAM_ARROWS_LAYER,
    )!;
    expect(chunk.paths).toHaveLength(2);
    const [r, g, b] = chunk.paths![0]!.fill!;
    const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
    expect(`#${toHex(r)}${toHex(g)}${toHex(b)}`).toBe(hex(ARROW_COLOUR_TOKENS.green));
    expect(chunk.texts ?? []).toEqual([]);
  });

  it("gives faded comet bands an opacity below one in the .ai layer", () => {
    const chunk = sitePlanChunks(model(), 1000, undefined, { arrows: [arrow({ style: "streak", points: [[-200, 0], [200, 0]] })] }).find(
      (c) => c.name === DIAGRAM_ARROWS_LAYER,
    )!;
    expect(chunk.paths!.some((path) => (path.opacity ?? 1) < 1)).toBe(true);
    expect(chunk.paths!.every((path) => (path.opacity ?? 1) >= 0 && (path.opacity ?? 1) <= 1)).toBe(true);
  });
});

describe("arrows in the Drawing .3dm", () => {
  it("writes a Diagram arrows layer of closed curves coloured per arrow, and no layer without arrows", async () => {
    const red = arrow({});
    const blue = arrow({ id: "b", colour: "blue", points: [[-40, -20], [40, -20]] });
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(await sitePlanTo3dm(model(), 1000, undefined, { arrows: [red, blue] }));
    try {
      const layerName = aiLayerLabel(DIAGRAM_ARROWS_LAYER);
      let curves = 0;
      const colours = new Set<string>();
      for (let i = 0; i < doc.objects().count; i += 1) {
        const object = doc.objects().get(i);
        if (doc.layers().get(object.attributes().layerIndex).fullPath !== layerName) continue;
        curves += 1;
        const c = object.attributes().objectColor as unknown as { r: number; g: number; b: number };
        colours.add(`#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
      }
      expect(curves).toBe(shapeCount(red) + shapeCount(blue));
      expect(colours).toEqual(new Set([hex("--arrow-red"), hex("--arrow-blue")]));
    } finally {
      doc.destroy();
    }
    expect(sitePlanRhinoLayerNames(model(), 1000, undefined, { arrows: [red] })).toContain(aiLayerLabel(DIAGRAM_ARROWS_LAYER));
    expect(sitePlanRhinoLayerNames(model(), 1000, undefined, { arrows: [] })).not.toContain(aiLayerLabel(DIAGRAM_ARROWS_LAYER));
    expect(sitePlanRhinoLayerNames(model(), 1000)).not.toContain(aiLayerLabel(DIAGRAM_ARROWS_LAYER));
  });
});
