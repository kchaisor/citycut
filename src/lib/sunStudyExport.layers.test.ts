import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFString, decodePDFRawStream } from "pdf-lib";
import { sitePlanPdf, sitePlanSvg, sunStudyLayerName } from "./aiPlan";
import { buildLayeredSvg } from "./svgDocument";
import { planShadowRings } from "./buildingShadows";
import { SUN_STUDY_HOURS } from "./sunStudyPlan";
import type { BuildingFeat, CityModel } from "../types";

const at = { lat: -37.8045, lon: 145.0215 };
const box = (id: number, e: number, n: number, h: number): BuildingFeat => ({
  id,
  ring: [[e - 10, n - 10], [e + 10, n - 10], [e + 10, n + 10], [e - 10, n + 10], [e - 10, n - 10]],
  holes: [],
  height: h,
  use: "unclassified",
  source: "none",
});
const model = {
  sideM: 300,
  center: at,
  placeLabel: "Kew VIC",
  buildings: [box(1, 0, 0, 25), box(2, 60, 40, 12)],
  roads: [],
  areas: [],
  trees: [],
  terrain: null,
} as unknown as CityModel;
const date = { ...at, year: 2026, month: 9, day: 22 };
const layers = SUN_STUDY_HOURS.map((hour) => ({ hour, rings: [...planShadowRings(model, { ...date, hour, minute: 0 }, true)] }));

async function pdfLayers(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const oc = doc.catalog.lookup(PDFName.of("OCProperties"), PDFDict);
  const order = oc.lookup(PDFName.of("D"), PDFDict).lookup(PDFName.of("Order"), PDFArray);
  const names: string[] = [];
  for (let i = 0; i < order.size(); i++) names.push(doc.context.lookup(order.get(i), PDFDict).lookup(PDFName.of("Name"), PDFString).decodeText());
  const page = doc.getPage(0);
  const states = page.node.Resources()?.lookup(PDFName.of("ExtGState"));
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  const ops = streams
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream as PDFRawStream).decode()))
    .join("\n");
  return { names, states: states as PDFDict | undefined, ops, doc };
}

describe("sun study .ai and .svg", () => {
  it("writes one .ai layer per hour with a 20% transparency ExtGState", async () => {
    const { names, states, ops, doc } = await pdfLayers(await sitePlanPdf(model, 1000, undefined, { sunStudy: { layers } }));
    const hourly = names.filter((name) => /Shadow \d\d:00/.test(name));
    expect(hourly.map((name) => name.replace(/^.*(Shadow \d\d:00).*$/, "$1"))).toEqual(SUN_STUDY_HOURS.map(sunStudyLayerName));
    expect(names.some((name) => /Shadows$/.test(name))).toBe(false);
    expect(states).toBeDefined();
    const gs = doc.context.lookup(states!.get(PDFName.of("GSa200")), PDFDict);
    expect(gs.lookup(PDFName.of("ca"), PDFNumber).asNumber()).toBe(0.2);
    expect(gs.lookup(PDFName.of("CA"), PDFNumber).asNumber()).toBe(0.2);
    expect((ops.match(/\/GSa200 gs/g) ?? []).length).toBe(layers.reduce((sum, layer) => sum + layer.rings.length, 0));
  });

  it("writes the plain .ai Shadows layer with the same 20% transparency ExtGState and no hourly layers", async () => {
    const { names, states, ops, doc } = await pdfLayers(
      await sitePlanPdf(model, 1000, undefined, { shadows: { ...date, hour: 12, minute: 0 }, castShadows: true }),
    );
    expect(states).toBeDefined();
    const gs = doc.context.lookup(states!.get(PDFName.of("GSa200")), PDFDict);
    expect(gs.lookup(PDFName.of("ca"), PDFNumber).asNumber()).toBe(0.2);
    expect(gs.lookup(PDFName.of("CA"), PDFNumber).asNumber()).toBe(0.2);
    expect(ops).toContain("/GSa200 gs");
    expect(names.some((name) => /Shadow \d\d:00/.test(name))).toBe(false);
    expect(names.some((name) => /Shadows/.test(name))).toBe(true);
  });

  it("writes the plain SVG Shadows layer with matching #4a5a70 fill and 0.2 opacity", async () => {
    const svg = await sitePlanSvg(model, 1000, undefined, {
      shadows: { ...date, hour: 12, minute: 0 },
      castShadows: true,
    });
    expect(svg).toContain('inkscape:label="Shadows"');
    expect(svg).toContain('fill="#4a5a70" fill-rule="evenodd" opacity="0.2"');
  });

  it("writes the same layers to a millimetre SVG with group per layer and opacity", async () => {
    const svg = await sitePlanSvg(model, 1000, undefined, { sunStudy: { layers } });
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toMatch(/<svg [^>]*width="[\d.]+mm" height="[\d.]+mm" viewBox="0 0 [\d.]+ [\d.]+"/);
    const groups = [...svg.matchAll(/inkscape:label="([^"]+)"/g)].map((m) => m[1]!);
    expect(groups.filter((name) => /Shadow \d\d:00/.test(name))).toHaveLength(7);
    expect(groups).toContain("Buildings");
    expect((svg.match(/opacity="0.2"/g) ?? []).length).toBe(layers.reduce((sum, layer) => sum + layer.rings.length, 0));
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it("flips y, escapes text and skips empty layers in the SVG writer", () => {
    const svg = buildLayeredSvg(
      100,
      50,
      [
        { name: "A", paths: [{ rings: [[[0, 0], [10, 0], [10, 10]]], fill: [1, 0, 0] }] },
        { name: "Empty", paths: [] },
        { name: "Annotation", texts: [{ x: 5, y: 40, sizeMm: 3, text: "Kew <VIC> & co", color: [0, 0, 0] }] },
      ],
      ["A", "Empty", "Annotation"],
    );
    expect(svg).toContain('d="M0 50L10 50L10 40Z"');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain("Kew &lt;VIC&gt; &amp; co");
    expect(svg).toContain('y="10"');
    expect(svg).not.toContain("Empty");
  });
});
