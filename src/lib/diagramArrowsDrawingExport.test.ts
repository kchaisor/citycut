import { describe, expect, it } from "vitest";
import { parseNativeAiLayers, aiLayerLabel } from "./aiNative";
import { sitePlanAi8, sitePlanChunks, sitePlanSvg } from "./aiPlan";
import { model } from "./aiExport.test";
import { getColour } from "./colours";
import { ARROW_COLOUR_TOKENS, buildArrowShape, type DiagramArrow } from "./diagramArrows";
import { DIAGRAM_ARROWS_LAYER } from "./diagramArrowsDrawingExport";
import { sitePlanRhinoLayerNames, sitePlanTo3dm } from "./planRhinoExport";
import { loadRhino } from "./rhinoExport";

const arrow = (over: Partial<DiagramArrow>): DiagramArrow => ({
  id: "a",
  points: [[-30, 0], [0, 10], [30, 0]],
  style: "bold",
  colour: "red",
  width: "m",
  heightM: 20,
  label: "",
  animation: "none",
  showIn3d: true,
  showInDrawing: true,
  ...over,
});

const SIDE = model().sideM;
const shapeCount = (a: DiagramArrow) => {
  const shape = buildArrowShape(a.points, a.style, a.width, SIDE);
  return shape.ribbons.length + shape.heads.length;
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
  it("writes one filled path per ribbon and head in the Diagram arrows layer, with colour and label", async () => {
    const bold = arrow({ label: "Ferry route" });
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
    expect(group.match(/<text /g)).toHaveLength(1);
    expect(group).toContain(">Ferry route</text>");
  });

  it("styles change the shape count: double has two heads, dashed has gaps", () => {
    expect(shapeCount(arrow({ style: "double" }))).toBe(3);
    expect(shapeCount(arrow({ style: "bold" }))).toBe(2);
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

  it("carries the arrow fill colour, shapes and label text in the layer chunk", () => {
    const chunk = sitePlanChunks(model(), 1000, undefined, { arrows: [arrow({ label: "Flow", colour: "green" })] }).find(
      (c) => c.name === DIAGRAM_ARROWS_LAYER,
    )!;
    expect(chunk.paths).toHaveLength(2);
    const [r, g, b] = chunk.paths![0]!.fill!;
    const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
    expect(`#${toHex(r)}${toHex(g)}${toHex(b)}`).toBe(hex(ARROW_COLOUR_TOKENS.green));
    expect(chunk.texts!.map((t) => t.text)).toEqual(["Flow"]);
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
