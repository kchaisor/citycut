import { describe, expect, it } from "vitest";
import { sitePlanChunks, sitePlanPdf, sitePlanAi8 } from "./aiPlan";
import { model } from "./aiExport.test";
import {
  styleFromProperties,
  DEFAULT_LINE_STYLES,
  PATH_EDGE_VAR,
  footpathEdgeSvgAttrs,
  footpathEdgeStroke,
} from "./drawingStyle";
import { hexRgb, LINE_MM } from "./lineweights";
import { nativeAiLooksLikeEps } from "./aiNative";
import { PDFDocument, PDFName, PDFString, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream, PDFContentStream, PDFStream } from "pdf-lib";

async function footpathsPdfBody(): Promise<string> {
  const bytes = await sitePlanPdf(model(), 1000);
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[0];
  const propToLayer = new Map<string, string>();
  const resources = page.node.Resources();
  const properties = resources?.lookup(PDFName.of("Properties"), PDFDict);
  if (properties) {
    for (const [key, value] of properties.entries()) {
      const dict = doc.context.lookup(value, PDFDict);
      propToLayer.set(key.toString().replace(/^\//, ""), dict.lookup(PDFName.of("Name"), PDFString).decodeText());
    }
  }
  const contents = page.node.Contents();
  const parts: Uint8Array[] = [];
  const push = (value: unknown) => {
    const stream = value instanceof PDFStream ? value : doc.context.lookup(value as PDFRawStream);
    if (!(stream instanceof PDFStream)) return;
    if (stream instanceof PDFRawStream) parts.push(decodePDFRawStream(stream).decode());
    else parts.push((stream as PDFContentStream).getUnencodedContents());
  };
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) push(contents.lookup(i));
  } else if (contents) {
    push(contents);
  }
  const content = new TextDecoder("latin1").decode(
    parts.reduce((acc, part) => {
      const next = new Uint8Array(acc.length + part.length + 1);
      next.set(acc);
      next.set(part, acc.length);
      next[acc.length + part.length] = 10;
      return next;
    }, new Uint8Array()),
  );
  for (const block of content.split("EMC")) {
    const mark = block.match(/\/OC\s+\/(L\d+)\s+BDC/);
    if (!mark) continue;
    const name = propToLayer.get(mark[1]);
    if (name === "Footpaths") return block.slice(block.indexOf("BDC") + 3);
  }
  return "";
}

describe("footpath edge stroke", () => {
  it("treats the theme edge toggle and weight together", () => {
    const off = styleFromProperties((name) => (name === PATH_EDGE_VAR ? "off" : ""));
    expect(off.pathEdgeOn).toBe(false);
    expect(off.path.mm).toBe(0);
    expect(footpathEdgeStroke(off)).toBeNull();
    expect(footpathEdgeSvgAttrs(off)).toEqual({ stroke: "none" });

    const on = { ...DEFAULT_LINE_STYLES, pathEdgeOn: true, path: { ...DEFAULT_LINE_STYLES.path, mm: LINE_MM.secondary } };
    expect(footpathEdgeStroke(on)?.mm).toBe(LINE_MM.secondary);
  });

  it("omits stroke from site-plan path chunks when the theme edge is off", () => {
    const style = styleFromProperties((name) => (name === PATH_EDGE_VAR ? "off" : ""));
    const strip = sitePlanChunks(model(), 1000, style).find((chunk) => chunk.name === "Paths");
    expect(strip?.paths?.[0]?.stroke).toBeUndefined();
    expect(strip?.paths?.[0]?.strokeMm).toBeUndefined();
  });

  it("paints the PDF Footpaths layer fill-only with the theme edge off", async () => {
    const body = await footpathsPdfBody();
    expect(body).toMatch(/\bf\*?\b/);
    expect(body).not.toMatch(/\bB\b|\bB\*\b|\bS\b|\bs\b/);
    const edgeRgb = hexRgb(DEFAULT_LINE_STYLES.path.color);
    const strokeTriplet = `${edgeRgb[0]} ${edgeRgb[1]} ${edgeRgb[2]} RG`;
    expect(body).not.toContain(strokeTriplet);
    expect(body).not.toMatch(/\d+(\.\d+)?\s+w\b/);
  });

  it("writes no footpath stroke operators in the native Illustrator site plan", () => {
    const bytes = sitePlanAi8(model(), 1000);
    expect(nativeAiLooksLikeEps(bytes)).toBe(true);
    const text = new TextDecoder("latin1").decode(bytes);
    const footBlock = text.split("%AI5_BeginLayer").find((block) => block.includes("Footpaths"));
    expect(footBlock).toBeTruthy();
    const afterLn = footBlock!.slice(footBlock!.indexOf(") Ln") + 4);
    const body = afterLn.slice(0, afterLn.indexOf("LB"));
    expect(body).toMatch(/\bf\b|\bf\*/);
    expect(body).not.toMatch(/\b(?:B|S|s|b)\b/);
    expect(body).not.toMatch(/\sXA\s/);
  });
});
