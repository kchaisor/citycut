import type { PdfChunk, PdfEllipse, PdfPath, PdfText, Rgb } from "./aiDocument";
import { pdfPt } from "./lineweights";

const KAPPA = 0.5522847498;

/** Illustrator display names for CityCut chunk ids. */
export const AI_LAYER_LABELS: Record<string, string> = {
  Frame: "Frame/Sheet",
  Paths: "Footpaths",
  Buildings: "Buildings",
  "Contour labels": "Contour labels",
  Annotation: "Annotation",
};

export function aiLayerLabel(name: string): string {
  return AI_LAYER_LABELS[name] ?? name;
}

function psNum(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function psRgb(color: Rgb): string {
  return `${psNum(color[0])} ${psNum(color[1])} ${psNum(color[2])}`;
}

function pathOps(path: PdfPath): string[] {
  const rings = path.rings.filter((ring) => ring.length >= 2);
  if (rings.length === 0) return [];
  const hasFill = Boolean(path.fill);
  const hasStroke = Boolean(path.stroke) && (path.strokeMm ?? 0) > 0;
  if (!hasFill && !hasStroke) return [];
  const ops: string[] = ["q"];
  if (hasFill && path.fill) ops.push(`${psRgb(path.fill)} rg`);
  if (hasStroke && path.stroke) {
    ops.push(`${psRgb(path.stroke)} RG`);
    ops.push(`${psNum(pdfPt(path.strokeMm ?? 0.1))} w`);
    if (path.dashMm) ops.push(`[${psNum(pdfPt(path.dashMm[0]))} ${psNum(pdfPt(path.dashMm[1]))}] 0 d`);
    ops.push(path.cap === "round" ? "1 J" : "0 J");
    ops.push(path.join === "round" ? "1 j" : "0 j");
  }
  for (const ring of rings) {
    ops.push(`${psNum(pdfPt(ring[0][0]))} ${psNum(pdfPt(ring[0][1]))} m`);
    for (let i = 1; i < ring.length; i++) {
      ops.push(`${psNum(pdfPt(ring[i][0]))} ${psNum(pdfPt(ring[i][1]))} l`);
    }
    if (path.close !== false && ring.length >= 3) ops.push("h");
  }
  if (hasFill && hasStroke) ops.push(path.evenOdd !== false && hasFill ? "B*" : "B");
  else if (hasFill) ops.push(path.evenOdd !== false ? "f*" : "f");
  else ops.push("S");
  ops.push("Q");
  return ops;
}

function ellipseOps(ellipse: PdfEllipse): string[] {
  const hasFill = Boolean(ellipse.fill);
  const hasStroke = Boolean(ellipse.stroke) && (ellipse.strokeMm ?? 0) > 0;
  if (!hasFill && !hasStroke) return [];
  if (!(ellipse.rx > 0) || !(ellipse.ry > 0)) return [];
  const cx = pdfPt(ellipse.cx);
  const cy = pdfPt(ellipse.cy);
  const rx = pdfPt(ellipse.rx);
  const ry = pdfPt(ellipse.ry);
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const ops: string[] = ["q"];
  if (hasFill && ellipse.fill) ops.push(`${psRgb(ellipse.fill)} rg`);
  if (hasStroke && ellipse.stroke) {
    ops.push(`${psRgb(ellipse.stroke)} RG`);
    ops.push(`${psNum(pdfPt(ellipse.strokeMm ?? 0.1))} w`);
  }
  ops.push(`${psNum(cx + rx)} ${psNum(cy)} m`);
  ops.push(
    `${psNum(cx + rx)} ${psNum(cy + ky)} ${psNum(cx + kx)} ${psNum(cy + ry)} ${psNum(cx)} ${psNum(cy + ry)} c`,
  );
  ops.push(
    `${psNum(cx - kx)} ${psNum(cy + ry)} ${psNum(cx - rx)} ${psNum(cy + ky)} ${psNum(cx - rx)} ${psNum(cy)} c`,
  );
  ops.push(
    `${psNum(cx - rx)} ${psNum(cy - ky)} ${psNum(cx - kx)} ${psNum(cy - ry)} ${psNum(cx)} ${psNum(cy - ry)} c`,
  );
  ops.push(
    `${psNum(cx + kx)} ${psNum(cy - ry)} ${psNum(cx + rx)} ${psNum(cy - ky)} ${psNum(cx + rx)} ${psNum(cy)} c`,
  );
  ops.push("h");
  if (hasFill && hasStroke) ops.push("B");
  else if (hasFill) ops.push("f");
  else ops.push("S");
  ops.push("Q");
  return ops;
}

function textOps(text: PdfText): string[] {
  if (!text.text) return [];
  const size = pdfPt(text.sizeMm);
  return [
    "q",
    `${psRgb(text.color)} rg`,
    `/Helvetica findfont ${psNum(size)} scalefont setfont`,
    `${psNum(pdfPt(text.x))} ${psNum(pdfPt(text.y))} moveto`,
    `(${escapePs(text.text)}) show`,
    "Q",
  ];
}

function escapePs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function chunkOps(chunk: PdfChunk): string[] {
  const ops: string[] = [];
  for (const path of chunk.paths ?? []) ops.push(...pathOps(path));
  for (const ellipse of chunk.ellipses ?? []) ops.push(...ellipseOps(ellipse));
  for (const text of chunk.texts ?? []) ops.push(...textOps(text));
  return ops;
}

function layerBlock(label: string, ops: string[], layerIndex: number): string {
  if (ops.length === 0) return "";
  const id = layerIndex % 256;
  const header = [
    "%AI5_BeginLayer",
    `1 1 1 1 0 0 1 ${id} ${(layerIndex * 37) % 256} ${(layerIndex * 91) % 256} Lb`,
    `(${escapePs(label)}) Ln`,
    "0 A",
    "1 Ap",
    "0 O",
    "800 Ar",
    "0 J 0 j 1 w 4 M []0 d",
  ];
  return [...header, ...ops, "LB", "%AI5_EndLayer--"].join("\n");
}

/**
 * Illustrator 8–compatible EPS with %AI5_BeginLayer blocks.
 * Coordinates on the chunks are millimetres, y up. Illustrator opens these as named layers.
 */
export function buildLayeredNativeAi(
  widthMm: number,
  heightMm: number,
  chunks: PdfChunk[],
  order: readonly string[],
  title?: string,
): Uint8Array {
  const present = new Set(chunks.map((chunk) => chunk.name));
  const names = order.filter((name) => present.has(name));
  for (const chunk of chunks) if (!names.includes(chunk.name)) names.push(chunk.name);

  const widthPt = pdfPt(widthMm);
  const heightPt = pdfPt(heightMm);
  const byName = new Map<string, PdfChunk[]>();
  for (const chunk of chunks) {
    const list = byName.get(chunk.name);
    if (list) list.push(chunk);
    else byName.set(chunk.name, [chunk]);
  }

  const body: string[] = [];
  let layerIndex = 0;
  for (const name of names) {
    const group = byName.get(name);
    if (!group) continue;
    const ops = group.flatMap((chunk) => chunkOps(chunk));
    const block = layerBlock(aiLayerLabel(name), ops, layerIndex);
    if (block) {
      body.push(block);
      layerIndex += 1;
    }
  }

  const header = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%Creator: CityCut`,
    ...(title ? [`%%Title: ${title}`] : []),
    `%%BoundingBox: 0 0 ${Math.ceil(widthPt)} ${Math.ceil(heightPt)}`,
    `%%HiResBoundingBox: 0 0 ${psNum(widthPt)} ${psNum(heightPt)}`,
    "%%EndComments",
    "%%BeginProlog",
    "%%EndProlog",
    "%%BeginSetup",
    "%AI3_ColorUsage: Color",
    "%AI5_FileFormat 2.0",
    "%%EndSetup",
  ];

  const script = [
    ...header,
    ...body,
    "%%Trailer",
    "%%EOF",
  ].join("\n");

  return new TextEncoder().encode(script);
}

/** Layer names in paint order as written to the native Illustrator file. */
export function parseNativeAiLayers(bytes: Uint8Array): string[] {
  const text = new TextDecoder("latin1").decode(bytes);
  const layers: string[] = [];
  const re = /%AI5_BeginLayer[\s\S]*?\(([^)]*)\)\s+Ln/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) layers.push(match[1].replace(/\\([()\\])/g, "$1"));
  return layers;
}

export function nativeAiLooksLikeEps(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 32));
  return head.startsWith("%!PS-Adobe");
}
