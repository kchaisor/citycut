import { describe, expect, it } from "vitest";
import {
  decodePDFRawStream,
  PDFArray,
  PDFContentStream,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
} from "pdf-lib";
import * as THREE from "three";
import { buildLayeredPdf } from "./aiDocument";
import { nativeAiLooksLikeEps, parseNativeAiLayers } from "./aiNative";
import { figureGroundChunks, figureGroundPdf, sitePlanChunks, sitePlanPdf } from "./aiPlan";
import { clipEdge, viewAi, VIEW_LAYER_ORDER, VIEW_OUTLINE_MM, type ScreenTri } from "./aiView";
import { shotFromCamera } from "./cameraShot";
import * as download from "./download";
import * as figureGround from "./figureGround";
import { DEFAULT_LINE_STYLES, cloneLineStyles } from "./drawingStyle";
import { paperMillimetres } from "./figureGround";
import { hexRgb, LINE_MM, PATH_FILL, PATH_WIDTH_M, pdfPt } from "./lineweights";
import * as svgPlan from "./svgPlan";
import type { CityModel, Pt, TerrainField } from "../types";

function square(minX: number, minY: number, maxX: number, maxY: number): Pt[] {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function terrain(): TerrainField {
  return {
    cols: 3,
    rows: 3,
    heights: Float32Array.of(0, 1, 2, 0.4, 1.2, 2.2, 0.2, 1.1, 2.4),
    min: 0,
    max: 2.4,
    spacingM: 50,
    zoom: 14,
    metresPerPixel: 8,
    source: "Mapterhorn",
  };
}

export function model(): CityModel {
  return {
    placeLabel: "Test Block",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      {
        id: 1,
        ring: square(-20, -20, 20, 20),
        holes: [square(-5, -5, 5, 5)],
        height: 12,
        use: "residential",
        source: "osm_tag",
      },
    ],
    roads: [
      { id: 2, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" },
      { id: 5, line: [[-30, -20], [30, -20]], width: 2, kind: "road", grade: "path" },
      { id: 6, line: [[10, -40], [10, 40]], width: 3.2, kind: "rail" },
    ],
    areas: [
      { id: 3, ring: square(-45, -45, -30, -30), holes: [], kind: "green" },
      { id: 7, ring: square(30, 25, 45, 40), holes: [], kind: "water" },
    ],
    trees: [{ id: 4, at: [20, 30], height_m: 10, crown_diameter_m: 8, trunk_diameter_m: 0.3, sizeSource: "osm" }],
    roadKm: 0.16,
    buildingCapHit: false,
    sourceNote: "© OpenStreetMap contributors, Overture Maps Foundation (ODbL)",
    terrain: terrain(),
    contours: true,
  };
}

function decodeText(bytes: Uint8Array): string {
  const source = new TextDecoder("latin1").decode(bytes);
  const parts: string[] = [];
  const hex = /<([0-9A-Fa-f]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = hex.exec(source))) {
    const raw = match[1];
    let text = "";
    for (let i = 0; i + 1 < raw.length; i += 2) text += String.fromCharCode(Number.parseInt(raw.slice(i, i + 2), 16));
    if (text.trim()) parts.push(text);
  }
  return parts.join("\n");
}

function streamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if (stream instanceof PDFContentStream) return stream.getUnencodedContents();
  return stream.getContents();
}

function pageBytes(doc: PDFDocument, page: ReturnType<PDFDocument["getPages"]>[number]): Uint8Array {
  const contents = page.node.Contents();
  if (!contents) throw new Error("The page has no content stream.");
  const parts: Uint8Array[] = [];
  const push = (value: unknown) => {
    const stream = value instanceof PDFStream ? value : doc.context.lookup(value as PDFRawStream);
    if (!(stream instanceof PDFStream)) {
      throw new Error(`Unexpected page contents (${(value as object)?.constructor?.name ?? typeof value}).`);
    }
    parts.push(streamBytes(stream));
  };
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) push(contents.lookup(i));
  } else {
    push(contents);
  }
  const total = parts.reduce((sum, part) => sum + part.length + 1, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
    joined[offset++] = 10;
  }
  return joined;
}

function nativeInspect(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes);
  const layers = parseNativeAiLayers(bytes);
  const bodies = new Map<string, string>();
  const counts = new Map<string, number>();
  const blocks = text.split("%AI5_BeginLayer").slice(1);
  for (const block of blocks) {
    const nameMatch = block.match(/\(([^)]*)\)\s+Ln/);
    if (!nameMatch) continue;
    const name = nameMatch[1].replace(/\\([()\\])/g, "$1");
    const end = block.indexOf("%AI5_EndLayer--");
    const body = block.slice(block.indexOf("Ln") + 2, end >= 0 ? end : undefined);
    bodies.set(name, body);
    counts.set(name, body.match(/\b(?:m|l|c|re|show)\b/g)?.length ?? 0);
  }
  const bbox = text.match(/%%BoundingBox:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  const widthPt = bbox ? Number(bbox[3]) : 0;
  const heightPt = bbox ? Number(bbox[4]) : 0;
  return {
    header: text.slice(0, 20),
    widthMm: (widthPt * 25.4) / 72,
    heightMm: (heightPt * 25.4) / 72,
    layers,
    counts,
    bodies,
    text: text,
    widthsMm: [...text.matchAll(/([\d.]+)\s+w\b/g)].map((item) => (Number(item[1]) * 25.4) / 72),
    xobject: null,
    font: text.includes("/Helvetica"),
    image: false,
    content: text,
  };
}

async function inspect(bytes: Uint8Array) {
  if (nativeAiLooksLikeEps(bytes)) return nativeInspect(bytes);
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[0];
  const oc = doc.catalog.lookup(PDFName.of("OCProperties"), PDFDict);
  const config = oc.lookup(PDFName.of("D"), PDFDict);
  const order = config.lookup(PDFName.of("Order"), PDFArray);
  const layers: string[] = [];
  for (let i = 0; i < order.size(); i++) {
    const dict = doc.context.lookup(order.get(i), PDFDict);
    layers.push(dict.lookup(PDFName.of("Name"), PDFString).decodeText());
  }
  const resources = page.node.Resources();
  const xobject = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  const properties = resources?.lookup(PDFName.of("Properties"), PDFDict);
  const propToLayer = new Map<string, string>();
  if (properties) {
    for (const [key, value] of properties.entries()) {
      const dict = doc.context.lookup(value, PDFDict);
      const token = key.toString().replace(/^\//, "");
      propToLayer.set(token, dict.lookup(PDFName.of("Name"), PDFString).decodeText());
    }
  }
  const raw = pageBytes(doc, page);
  const content = new TextDecoder("latin1").decode(raw);
  const counts = new Map<string, number>();
  const bodies = new Map<string, string>();
  const blocks = content.split("EMC");
  for (const block of blocks) {
    const mark = block.match(/\/OC\s+\/(L\d+)\s+BDC/);
    if (!mark) continue;
    const name = propToLayer.get(mark[1]);
    if (!name) continue;
    const body = block.slice(block.indexOf("BDC") + 3);
    const operators = body.match(/\b(?:m|l|c|re|Tj)\b/g)?.length ?? 0;
    counts.set(name, (counts.get(name) ?? 0) + operators);
    bodies.set(name, `${bodies.get(name) ?? ""}\n${body}`);
  }
  const widths = [...content.matchAll(/([\d.]+)\s+w\b/g)].map((item) => Number(item[1]));
  return {
    header: doc.context.header.toString(),
    widthMm: (page.getWidth() * 25.4) / 72,
    heightMm: (page.getHeight() * 25.4) / 72,
    layers,
    counts,
    bodies,
    text: decodeText(raw),
    widthsMm: widths.map((pt) => (pt * 25.4) / 72),
    xobject,
    font: new TextDecoder("latin1").decode(bytes).includes("/BaseFont /Helvetica"),
    image: new TextDecoder("latin1").decode(bytes).includes("/Subtype /Image"),
    content,
  };
}

describe("removed exports", () => {
  it("drops glTF, SVG, and figure-ground PDF from the download API", () => {
    expect(download.EXPORT_IDS).toEqual(["png", "3dm", "ai-view", "ai-site", "ai-figure"]);
    expect("downloadGlb" in download).toBe(false);
    expect("downloadSvg" in download).toBe(false);
    expect("downloadFigureGround" in download).toBe(false);
    expect("figureGroundSvg" in figureGround).toBe(false);
    expect("figureGroundPdf" in figureGround).toBe(false);
    expect("sitePlanSvg" in svgPlan).toBe(false);
    expect(typeof download.download3dm).toBe("function");
    expect(typeof download.downloadSiteAi).toBe("function");
  });
});

describe("Illustrator plans", () => {
  it("writes the site plan as layered PDF 1.6 with true pen weights and dashed contours", async () => {
    const info = await inspect(await sitePlanPdf(model(), 1000));
    expect(info.header.startsWith("%PDF-1.6")).toBe(true);
    expect(info.layers.length).toBeGreaterThan(0);
    expect(info.layers[0]).toBe("Frame/Sheet");
    expect(info.widthMm).toBeCloseTo(420, 0);
    expect(info.heightMm).toBeCloseTo(297, 0);
    expect(info.font).toBe(true);
    expect(info.image).toBe(false);
    expect(info.xobject?.keys().length ?? 0).toBe(0);
    expect(info.text).toContain("Test Block");
    expect(info.text).toContain("1:1000");
    expect(info.text).toContain("-37.81360, 144.96310");
    expect(info.text).toContain("OpenStreetMap");
    expect(info.text).toContain("N");
    for (const name of info.layers) expect(info.counts.get(name) ?? 0).toBeGreaterThan(0);
    const widths = info.widthsMm.map((mm) => Math.round(mm * 100) / 100);
    expect(widths).not.toContain(0);
    expect(widths).toContain(LINE_MM.propertyRoad);
    expect(widths).toContain(LINE_MM.secondary);
    expect(widths).toContain(LINE_MM.contour);
    expect(widths).toContain(LINE_MM.frame);
    expect(widths).toContain(LINE_MM.annotation);
    expect(info.layers).toContain("Contours");
    expect(info.bodies.get("Contours") ?? "").toMatch(/\d+(\.\d+)?\s+w/);
    expect(info.content).not.toMatch(/\/Image/);
    const roads = info.bodies.get("Roads") ?? "";
    const paints = roads.match(/(?:B\*|b\*|f\*|B|b|f|S|s)(?![A-Za-z*])/g) ?? [];
    expect(paints).toContain("B*");
  });

  it("draws the kerb only when the toggle is on, and reads an edited contour style", async () => {
    const off = cloneLineStyles(DEFAULT_LINE_STYLES);
    off.kerbOn = false;
    const bare = await inspect(await sitePlanPdf(model(), 1000, off));
    const bareRoads = bare.bodies.get("Roads") ?? "";
    expect(bareRoads.match(/(?:B\*|b\*|f\*|B|b|f|S|s)(?![A-Za-z*])/g)).toEqual(expect.arrayContaining(["f*"]));
    expect(bare.widthsMm.map((mm) => Math.round(mm * 100) / 100)).not.toContain(LINE_MM.propertyRoad);

    const dotted = cloneLineStyles(DEFAULT_LINE_STYLES);
    dotted.contour = { ...dotted.contour, color: "#FF0000", dash: "0 0.6" };
    const edited = await inspect(await sitePlanPdf(model(), 1000, dotted));
    expect(edited.content).toContain(`${pdfPt(0)} ${pdfPt(0.6)}`);
    expect(edited.content).toMatch(/1\s+0\s+0\s+RG/);
  });

  it("paints a zero weight as fill only, including buildings, green, and water", async () => {
    const paintsOf = (body: string) => body.match(/(?:B\*|b\*|f\*|B|b|f|S|s)(?![A-Za-z*])/g) ?? [];
    const info = await inspect(await sitePlanPdf(model(), 1000));
    expect(paintsOf(info.bodies.get("Buildings") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    expect(paintsOf(info.bodies.get("Green") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    expect(paintsOf(info.bodies.get("Water") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    expect(info.content).not.toMatch(/(?:^|[\s[])0(?:\.0+)? w/);

    const hidden = cloneLineStyles(DEFAULT_LINE_STYLES);
    for (const key of ["building", "kerb", "path", "rail", "green", "water", "contour", "frame", "annotation", "tree"] as const) {
      hidden[key] = { ...hidden[key], mm: 0 };
    }
    const bare = await inspect(await sitePlanPdf(model(), 1000, hidden));
    expect(bare.content).not.toMatch(/(?:^|[\s[])0(?:\.0+)? w/);
    expect(paintsOf(bare.bodies.get("Buildings") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    expect(paintsOf(bare.bodies.get("Green") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    expect(paintsOf(bare.bodies.get("Water") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    expect(paintsOf(bare.bodies.get("Roads") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    expect(paintsOf(bare.bodies.get("Footpaths") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    expect(bare.bodies.has("Rail")).toBe(false);
    expect(bare.bodies.has("Contours")).toBe(false);

    const restored = cloneLineStyles(DEFAULT_LINE_STYLES);
    restored.building = { ...restored.building, mm: 0.4 };
    const outlined = await inspect(await sitePlanPdf(model(), 1000, restored));
    expect(paintsOf(outlined.bodies.get("Buildings") ?? "")).toContain("B*");
    expect(outlined.widthsMm.map((mm) => Math.round(mm * 100) / 100)).toContain(0.4);
  });

  it("draws the footpath layer as one filled strip whose width is metres on the sheet", async () => {
    const paintsOf = (body: string) => body.match(/(?:B\*|b\*|f\*|B|b|f|S|s)(?![A-Za-z*])/g) ?? [];
    const info = await inspect(await sitePlanPdf(model(), 1000));
    expect(paintsOf(info.bodies.get("Footpaths") ?? "")).toEqual(expect.arrayContaining(["f*"]));
    const strip = sitePlanChunks(model(), 1000).find((chunk) => chunk.name === "Paths");
    expect(strip?.paths).toHaveLength(1);
    expect(strip?.paths?.[0]?.fill).toEqual(hexRgb(PATH_FILL));
    const widthMm = (scale: number) => {
      const rings = sitePlanChunks(model(), scale).find((chunk) => chunk.name === "Paths")?.paths?.[0]?.rings ?? [];
      let min = Infinity;
      let max = -Infinity;
      for (const ring of rings) {
        for (const point of ring) {
          min = Math.min(min, point[1]);
          max = Math.max(max, point[1]);
        }
      }
      return max - min;
    };
    expect(widthMm(1000)).toBeCloseTo(paperMillimetres(PATH_WIDTH_M, 1000), 1);
    expect(widthMm(500)).toBeCloseTo(paperMillimetres(PATH_WIDTH_M, 500), 1);
    const hidden = cloneLineStyles(DEFAULT_LINE_STYLES);
    hidden.pathWidthM = 0;
    const gone = await inspect(await sitePlanPdf(model(), 1000, hidden));
    expect(gone.bodies.has("Footpaths")).toBe(false);
    const edged = cloneLineStyles(DEFAULT_LINE_STYLES);
    edged.pathEdgeOn = true;
    edged.path = { ...edged.path, mm: LINE_MM.secondary };
    const withEdge = await inspect(await sitePlanPdf(model(), 1000, edged));
    expect(paintsOf(withEdge.bodies.get("Footpaths") ?? "")).toContain("B*");
    const figure = figureGroundChunks(model(), 1000).find((chunk) => chunk.name === "Paths");
    expect(figure?.paths).toHaveLength(1);
    expect(figure?.paths?.[0]?.fill).toEqual(hexRgb(PATH_FILL));
  });

  it("writes figure-ground with frame, footprints, and annotation only", async () => {
    const fitted = await inspect(await figureGroundPdf(model(), 1000));
    expect(fitted.layers[0]).toBe("Frame/Sheet");
    expect(fitted.layers).toContain("Buildings");
    expect(fitted.text).toContain("Test Block");
    expect(fitted.text).toContain("1:1000");
    expect(fitted.text).toContain("OpenStreetMap");
    expect(fitted.image).toBe(false);
    expect(fitted.widthsMm.map((mm) => Math.round(mm * 100) / 100)).toContain(LINE_MM.frame);
    const figureBuildings = fitted.bodies.get("Buildings") ?? "";
    expect(figureBuildings.match(/(?:B\*|b\*|f\*|B|b|f|S|s)(?![A-Za-z*])/g)).toEqual(expect.arrayContaining(["f*"]));
    expect(figureBuildings).not.toMatch(/\d+\s+(\d+\s+){2}\d+\s+RG/);
    const wide = await inspect(await figureGroundPdf({ ...model(), sideM: 1000, buildings: [] }, 2500));
    expect(wide.text).toContain("Does not fit on A3");
    expect(wide.text).toContain("1:2500");
    expect(wide.widthMm).toBeCloseTo(420, 0);
    expect(wide.heightMm).toBeCloseTo(428, 0);
    expect(wide.layers).toContain("Frame/Sheet");
    expect(wide.layers).toContain("Footpaths");
    const figurePaths = fitted.bodies.get("Footpaths") ?? "";
    expect(figurePaths.match(/(?:B\*|b\*|f\*|B|b|f|S|s)(?![A-Za-z*])/g)).toEqual(expect.arrayContaining(["f*"]));
  });
});

describe("Illustrator 3D view", () => {
  it("projects the camera into named layers and says it is not to scale", async () => {
    const camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.5, 4000);
    camera.position.set(-90, 80, 110);
    camera.lookAt(0, 6, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const shot = shotFromCamera(camera, 640, 400);
    const bytes = await viewAi(model(), shot, { uniformBuildings: false, colourBySource: false });
    const info = await inspect(bytes);
    expect(info.header.startsWith("%PDF-1.6")).toBe(true);
    expect(info.layers.length).toBe(VIEW_LAYER_ORDER.length);
    expect(info.widthMm / info.heightMm).toBeCloseTo(640 / 400, 2);
    expect(info.text).toContain("not to scale");
    expect(info.text).toContain("Test Block");
    expect(info.text).toContain("-37.81360, 144.96310");
    expect(info.image).toBe(false);
    expect(info.xobject?.keys().length ?? 0).toBe(0);
    expect(info.font).toBe(true);
    for (const name of info.layers) expect(info.counts.get(name) ?? 0).toBeGreaterThan(0);
    const widths = info.widthsMm.map((mm) => Math.round(mm * 1000) / 1000);
    expect(widths).toContain(VIEW_OUTLINE_MM);
  });

  it("writes a layer whose operator list is too long to spread in one call", async () => {
    const paths = Array.from({ length: 15000 }, (_, index) => ({
      rings: [[[index * 0.01, 0], [index * 0.01 + 0.2, 1]]],
      close: false as const,
      stroke: [0.1, 0.1, 0.1] as const,
      strokeMm: 0.18,
    }));
    const info = await inspect(await buildLayeredPdf(220, 80, [{ name: "Outlines", paths }], ["Outlines"]));
    expect(info.header.startsWith("%PDF-1.6")).toBe(true);
    expect(info.layers).toEqual(["Outlines"]);
    expect(info.counts.get("Outlines") ?? 0).toBeGreaterThan(15000);
    expect(info.image).toBe(false);
  });

  it("clips an edge where a nearer face covers it", () => {
    const cover: ScreenTri = {
      a: { x: 0, y: 0, z: 0.2 },
      b: { x: 10, y: 0, z: 0.2 },
      c: { x: 0, y: 10, z: 0.2 },
      id: 2,
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    };
    const parts = clipEdge({ x: -2, y: 2, z: 0.8 }, { x: 12, y: 2, z: 0.8 }, [cover], 1);
    expect(parts.length).toBe(2);
    const hidden = clipEdge({ x: -2, y: 2, z: 0.8 }, { x: 12, y: 2, z: 0.8 }, [{ ...cover, id: 1 }], 1);
    expect(hidden.length).toBe(1);
    const behind = clipEdge(
      { x: -2, y: 2, z: 0.1 },
      { x: 12, y: 2, z: 0.1 },
      [cover],
      1,
    );
    expect(behind).toHaveLength(1);
  });
});
