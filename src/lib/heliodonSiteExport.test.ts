import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { sitePlanAi, sitePlanChunks, sitePlanSvg } from "./aiPlan";
import { model } from "./aiExport.test";

const at = { lat: -37.8045, lon: 145.0215 };
const jun21 = { ...at, year: 2026, month: 6, day: 21 };

async function pdfLayerNames(bytes: Uint8Array): Promise<string[]> {
  const pdfDoc = await PDFDocument.load(bytes);
  const oc = pdfDoc.catalog.lookup(PDFName.of("OCProperties"), PDFDict);
  const config = oc.lookup(PDFName.of("D"), PDFDict);
  const order = config.lookup(PDFName.of("Order"), PDFArray);
  const names: string[] = [];
  for (let index = 0; index < order.size(); index++) {
    const dict = pdfDoc.context.lookup(order.get(index), PDFDict);
    names.push(dict.lookup(PDFName.of("Name"), PDFString).decodeText());
  }
  return names;
}

describe("heliodon site export", () => {
  it("builds a non-empty Sun path chunk for a sun-study date without 3D Sun Dome", () => {
    const options = {
      heliodon: { ...jun21, hour: 15, minute: 0, sideM: model().sideM, radiusFactor: 1.75 },
      sunStudyDate: jun21,
    };
    const chunks = sitePlanChunks(model(), 1000, undefined, options);
    const sunPath = chunks.find((chunk) => chunk.name === "Sun path");
    expect(sunPath).toBeTruthy();
    expect((sunPath?.paths?.length ?? 0)).toBeGreaterThanOrEqual(15);
    expect((sunPath?.ellipses?.length ?? 0)).toBeGreaterThanOrEqual(7);
    expect(sunPath?.texts?.some((text) => text.text.includes("Jun"))).toBe(true);
  });

  it("writes the Sun path layer to PDF .ai and SVG when heliodon comes from sun study only", async () => {
    const options = {
      heliodon: { ...jun21, hour: 15, minute: 0, sideM: model().sideM, radiusFactor: 1.75 },
      sunStudyDate: jun21,
    };
    const ai = await sitePlanAi(model(), 1000, undefined, options);
    const layers = await pdfLayerNames(ai);
    expect(layers.some((name) => name.replace(/^CityCut /, "") === "Sun path")).toBe(true);
    const svg = await sitePlanSvg(model(), 1000, undefined, options);
    expect(svg).toContain('inkscape:label="Sun path"');
    expect((svg.match(/<ellipse /g) ?? []).length).toBeGreaterThanOrEqual(7);
  });
});
