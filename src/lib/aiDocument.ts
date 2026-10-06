import { aiLayerLabel } from "./aiNative";
import {
  LineCapStyle,
  LineJoinStyle,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHeader,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  PDFRef,
  PDFString,
  StandardFonts,
  appendBezierCurve,
  beginText,
  closePath,
  endText,
  lineTo,
  moveText,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  showText,
  stroke,
} from "pdf-lib";
import { pdfPt } from "./lineweights";

export type Rgb = readonly [number, number, number];

export type PdfPath = {
  /** Rings in millimetres, origin at the bottom-left, y up. The first ring is the outer. */
  rings: number[][][];
  close?: boolean;
  fill?: Rgb;
  stroke?: Rgb;
  strokeMm?: number;
  evenOdd?: boolean;
  dashMm?: readonly number[];
  cap?: "butt" | "round";
  join?: "miter" | "round";
};

export type PdfEllipse = {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill?: Rgb;
  stroke?: Rgb;
  strokeMm?: number;
};

export type PdfText = {
  x: number;
  y: number;
  sizeMm: number;
  text: string;
  color: Rgb;
};

/** One marked-content block. The same layer name may appear more than once so paint order can interleave. */
export type PdfChunk = {
  name: string;
  paths?: PdfPath[];
  ellipses?: PdfEllipse[];
  texts?: PdfText[];
};

const KAPPA = 0.5522847498;

function fillEvenOdd() {
  return PDFOperator.of(PDFOperatorNames.FillEvenOdd);
}

function fillNonZero() {
  return PDFOperator.of(PDFOperatorNames.FillNonZero);
}

function fillEvenOddAndStroke() {
  return PDFOperator.of(PDFOperatorNames.FillEvenOddAndStroke);
}

function fillAndStroke() {
  return PDFOperator.of(PDFOperatorNames.FillNonZeroAndStroke);
}

function endMarked() {
  return PDFOperator.of(PDFOperatorNames.EndMarkedContent);
}

function beginOc(name: string) {
  return PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("OC"), PDFName.of(name)]);
}

function ringOps(ring: number[][], close: boolean) {
  const ops = [moveTo(pdfPt(ring[0][0]), pdfPt(ring[0][1]))];
  for (let i = 1; i < ring.length; i++) ops.push(lineTo(pdfPt(ring[i][0]), pdfPt(ring[i][1])));
  if (close) ops.push(closePath());
  return ops;
}

function ellipseOps(cx: number, cy: number, rx: number, ry: number) {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    moveTo(pdfPt(cx + rx), pdfPt(cy)),
    appendBezierCurve(pdfPt(cx + rx), pdfPt(cy + ky), pdfPt(cx + kx), pdfPt(cy + ry), pdfPt(cx), pdfPt(cy + ry)),
    appendBezierCurve(pdfPt(cx - kx), pdfPt(cy + ry), pdfPt(cx - rx), pdfPt(cy + ky), pdfPt(cx - rx), pdfPt(cy)),
    appendBezierCurve(pdfPt(cx - rx), pdfPt(cy - ky), pdfPt(cx - kx), pdfPt(cy - ry), pdfPt(cx), pdfPt(cy - ry)),
    appendBezierCurve(pdfPt(cx + kx), pdfPt(cy - ry), pdfPt(cx + rx), pdfPt(cy - ky), pdfPt(cx + rx), pdfPt(cy)),
    closePath(),
  ];
}

function paintOp(fill: boolean, strokeOn: boolean, evenOdd: boolean) {
  if (fill && strokeOn) return evenOdd ? fillEvenOddAndStroke() : fillAndStroke();
  if (fill) return evenOdd ? fillEvenOdd() : fillNonZero();
  return stroke();
}

function pathOperators(path: PdfPath) {
  const rings = path.rings.filter((ring) => ring.length >= 2);
  if (rings.length === 0) return [];
  const close = path.close !== false;
  const hasFill = Boolean(path.fill);
  const hasStroke = Boolean(path.stroke) && (path.strokeMm ?? 0) > 0;
  if (!hasFill && !hasStroke) return [];
  const ops = [pushGraphicsState()];
  if (path.fill) ops.push(setFillingRgbColor(path.fill[0], path.fill[1], path.fill[2]));
  if (hasStroke && path.stroke) {
    ops.push(setStrokingRgbColor(path.stroke[0], path.stroke[1], path.stroke[2]));
    ops.push(setLineWidth(pdfPt(path.strokeMm ?? 0.1)));
    ops.push(setLineCap(path.cap === "round" ? LineCapStyle.Round : LineCapStyle.Butt));
    ops.push(setLineJoin(path.join === "round" ? LineJoinStyle.Round : LineJoinStyle.Miter));
    if (path.dashMm && path.dashMm.length >= 2) {
      ops.push(setDashPattern(path.dashMm.map((segment) => pdfPt(segment)), 0));
    }
  }
  for (const ring of rings) ops.push(...ringOps(ring, close && ring.length >= 3));
  ops.push(paintOp(hasFill, hasStroke, path.evenOdd !== false && hasFill));
  ops.push(popGraphicsState());
  return ops;
}

function ellipseOperators(ellipse: PdfEllipse) {
  const hasFill = Boolean(ellipse.fill);
  const hasStroke = Boolean(ellipse.stroke) && (ellipse.strokeMm ?? 0) > 0;
  if (!hasFill && !hasStroke) return [];
  if (!(ellipse.rx > 0) || !(ellipse.ry > 0)) return [];
  const ops = [pushGraphicsState()];
  if (ellipse.fill) ops.push(setFillingRgbColor(ellipse.fill[0], ellipse.fill[1], ellipse.fill[2]));
  if (hasStroke && ellipse.stroke) {
    ops.push(setStrokingRgbColor(ellipse.stroke[0], ellipse.stroke[1], ellipse.stroke[2]));
    ops.push(setLineWidth(pdfPt(ellipse.strokeMm ?? 0.1)));
    ops.push(setLineCap(LineCapStyle.Butt));
  }
  ops.push(...ellipseOps(ellipse.cx, ellipse.cy, ellipse.rx, ellipse.ry));
  ops.push(paintOp(hasFill, hasStroke, false));
  ops.push(popGraphicsState());
  return ops;
}

/**
 * One-page PDF 1.6 with optional-content layers.
 * Coordinates on the chunks are millimetres, y up. Text stays Helvetica, not outlines.
 * There are no image XObjects.
 */
export async function buildLayeredPdf(
  widthMm: number,
  heightMm: number,
  chunks: PdfChunk[],
  order: readonly string[],
): Promise<Uint8Array> {
  const present = new Set(chunks.map((chunk) => chunk.name));
  const names = order.filter((name) => present.has(name));
  for (const chunk of chunks) if (!names.includes(chunk.name)) names.push(chunk.name);

  const doc = await PDFDocument.create();
  doc.context.header = PDFHeader.forVersion(1, 6);
  doc.setCreator("CityCut");
  doc.setProducer("CityCut");
  const title = chunks
    .find((chunk) => chunk.name === "Annotation")
    ?.texts?.find((text) => text.text.includes(" · "))?.text;
  if (title) doc.setTitle(title);
  const page = doc.addPage([pdfPt(widthMm), pdfPt(heightMm)]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  const context = doc.context;

  const props = PDFDict.withContext(context);
  const ocgRefs: PDFRef[] = [];
  const propName = new Map<string, string>();
  names.forEach((name, index) => {
    const key = `L${index}`;
    const label = aiLayerLabel(name);
    const ocg = context.obj({
      Type: "OCG",
      Name: PDFString.of(label),
      Intent: "View",
    });
    const ref = context.register(ocg);
    ocgRefs.push(ref);
    props.set(PDFName.of(key), ref);
    propName.set(label, key);
  });
  const resources = page.node.Resources();
  if (!resources) throw new Error("The PDF page has no resource dictionary.");
  resources.set(PDFName.of("Properties"), props);

  const orderArray = PDFArray.withContext(context);
  for (const ref of ocgRefs) orderArray.push(ref);
  const config = context.obj({
    Name: PDFString.of("CityCut layers"),
    BaseState: "ON",
    Order: orderArray,
    ON: orderArray,
    ListMode: "AllPages",
  });
  doc.catalog.set(
    PDFName.of("OCProperties"),
    context.obj({
      OCGs: orderArray,
      D: config,
    }),
  );

  for (const chunk of chunks) {
    const key = propName.get(aiLayerLabel(chunk.name));
    if (!key) continue;
    const ops = [beginOc(key)];
    for (const path of chunk.paths ?? []) ops.push(...pathOperators(path));
    for (const ellipse of chunk.ellipses ?? []) ops.push(...ellipseOperators(ellipse));
    for (const text of chunk.texts ?? []) {
      if (!text.text) continue;
      ops.push(
        beginText(),
        setFontAndSize(fontKey, pdfPt(text.sizeMm)),
        setFillingRgbColor(text.color[0], text.color[1], text.color[2]),
        moveText(pdfPt(text.x), pdfPt(text.y)),
        showText(font.encodeText(text.text)),
        endText(),
      );
    }
    ops.push(endMarked());
    if (ops.length <= 2) continue;
    // One layer can hold every visible edge. Spreading that list into a single
    // call blows the argument limit, so the stream is filled in batches.
    // Consecutive batches stay in one content stream and concatenate in order.
    const batch = 800;
    for (let i = 0; i < ops.length; i += batch) page.pushOperators(...ops.slice(i, i + batch));
  }

  const bytes = await doc.save({ useObjectStreams: false });
  // pdf-lib's writer always emits %PDF-1.7. The file uses only PDF 1.5
  // features (optional content groups, DeviceRGB, a standard font), so the
  // header is relabelled 1.6. Illustrator opens either version as a native file.
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d &&
    bytes[5] === 0x31 &&
    bytes[6] === 0x2e &&
    bytes[7] === 0x37
  ) {
    bytes[7] = 0x36;
  }
  return bytes;
}
