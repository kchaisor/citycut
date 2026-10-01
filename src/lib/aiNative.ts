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

function aiRgb(color: Rgb): string {
  return `${psNum(color[0])} ${psNum(color[1])} ${psNum(color[2])}`;
}

function escapePs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function strokeState(path: PdfPath): string[] {
  const ops: string[] = [];
  if (path.stroke && (path.strokeMm ?? 0) > 0) {
    ops.push(`${aiRgb(path.stroke)} XA`);
    ops.push(`${psNum(pdfPt(path.strokeMm ?? 0.1))} w`);
    if (path.dashMm) ops.push(`[${psNum(pdfPt(path.dashMm[0]))} ${psNum(pdfPt(path.dashMm[1]))}] 0 d`);
    ops.push(path.cap === "round" ? "1 J" : "0 J");
    ops.push(path.join === "round" ? "1 j" : "0 j");
    ops.push("4 M");
  }
  return ops;
}

function ringOps(ring: number[][], close: boolean): string[] {
  if (ring.length < 2) return [];
  const ops: string[] = [`${psNum(pdfPt(ring[0][0]))} ${psNum(pdfPt(ring[0][1]))} m`];
  for (let i = 1; i < ring.length; i++) {
    ops.push(`${psNum(pdfPt(ring[i][0]))} ${psNum(pdfPt(ring[i][1]))} l`);
  }
  if (close && ring.length >= 3) ops.push(`${psNum(pdfPt(ring[0][0]))} ${psNum(pdfPt(ring[0][1]))} L`);
  return ops;
}

function paintPath(path: PdfPath): string[] {
  const rings = path.rings.filter((ring) => ring.length >= 2);
  if (rings.length === 0) return [];
  const hasFill = Boolean(path.fill);
  const hasStroke = Boolean(path.stroke) && (path.strokeMm ?? 0) > 0;
  if (!hasFill && !hasStroke) return [];

  const ops: string[] = [];
  if (hasFill && path.fill) ops.push(`${aiRgb(path.fill)} Xa`);
  if (hasStroke) ops.push(...strokeState(path));

  const close = path.close !== false;
  const compound = rings.length > 1 || path.evenOdd !== false;
  if (compound) ops.push("*u");
  for (const ring of rings) ops.push(...ringOps(ring, close));
  if (compound) ops.push("*U");

  if (hasFill && hasStroke) ops.push(close ? "b" : "B");
  else if (hasFill) ops.push(close ? "f" : "F");
  else ops.push(close ? "s" : "S");
  return ops;
}

function paintEllipse(ellipse: PdfEllipse): string[] {
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
  const ops: string[] = [];
  if (hasFill && ellipse.fill) ops.push(`${aiRgb(ellipse.fill)} Xa`);
  if (hasStroke && ellipse.stroke) {
    ops.push(`${aiRgb(ellipse.stroke)} XA`);
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
  ops.push(`${psNum(cx + rx)} ${psNum(cy)} L`);
  if (hasFill && hasStroke) ops.push("b");
  else if (hasFill) ops.push("f");
  else ops.push("s");
  return ops;
}

/** Point text (type 0): revisable block only; final-form Tx omitted. */
function pointTextOps(text: PdfText): string[] {
  if (!text.text) return [];
  const size = pdfPt(text.sizeMm);
  const x = psNum(pdfPt(text.x));
  const y = psNum(pdfPt(text.y));
  const label = escapePs(text.text);
  return [
    "0 To",
    "0 Ta",
    "0 Tw",
    "0 Tc",
    "100 Tz",
    "0 TL",
    "0 Ts",
    `${aiRgb(text.color)} Xa`,
    `/Helvetica 0 Tf`,
    `${size} 0 Tp`,
    `${x} ${y} Td`,
    `(${label}) TO`,
    "TO",
  ];
}

function chunkOps(chunk: PdfChunk): string[] {
  const ops: string[] = [];
  for (const path of chunk.paths ?? []) ops.push(...paintPath(path));
  for (const ellipse of chunk.ellipses ?? []) ops.push(...paintEllipse(ellipse));
  for (const text of chunk.texts ?? []) ops.push(...pointTextOps(text));
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

const AI8_PROLOG = [
  "%%BeginProlog",
  "%%IncludeResource: procset Adobe_level2_AI5 1.0 0",
  "%%AI5_BeginProcSet: 1 1 0",
  "%%AI5_EndProcSet",
  "%%EndProlog",
] as const;

/**
 * Illustrator 8 EPS with %AI5_BeginLayer blocks and AI paint operators (Xa/XA, m/l/c, *u/*U).
 * Coordinates on the chunks are millimetres, y up.
 *
 * Reference structure compared to Adobe Illustrator EPS conventions:
 * - Adobe Illustrator File Format Specification 3.0 (operators through AI8 EPS):
 *   https://www.moon-soft.com/program/format/graphics/ai30.pdf
 * - Operator summary (Xa, *u, layers): https://docs.aspose.com/page/net/what-is-ai-file/
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
    "%%Creator: Adobe Illustrator(R) 8.0",
    "%%AI8_CreatorVersion: 8.0",
    ...(title ? [`%%Title: ${title}`] : []),
    `%%BoundingBox: 0 0 ${Math.ceil(widthPt)} ${Math.ceil(heightPt)}`,
    `%%HiResBoundingBox: 0 0 ${psNum(widthPt)} ${psNum(heightPt)}`,
    "%%DocumentProcessColors: Cyan Magenta Yellow Black Red Green Blue",
    "%%DocumentNeededResources: procset Adobe_level2_AI5 1.0 0",
    "%%DocumentSuppliedResources: procset Adobe_level2_AI5 1.0 0",
    "%%DocumentProcSets: Adobe_level2_AI5 1.0 0",
    "%%EndComments",
    ...AI8_PROLOG,
    "%%BeginSetup",
    "%AI3_ColorUsage: Color",
    "%AI5_FileFormat 8.0",
    "%%EndSetup",
    "%%Page: 1 1",
  ];

  const script = [...header, ...body, "%%PageTrailer", "%%Trailer", "%%EOF"].join("\n");
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
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 64));
  return head.startsWith("%!PS-Adobe") && head.includes("Adobe Illustrator");
}

const PDF_ONLY_OP =
  /(^|\n)\s*(q|Q|rg|RG|re|h|B\*|f\*|moveto|show|findfont|scalefont|setfont)\s*($|\n)/m;

/** Body script must not use PDF graphics operators (Illustrator uses Xa/m/f and procsets). */
export function nativeAiBodyUsesPdfOperators(bytes: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(bytes);
  const prologEnd = text.indexOf("%%EndProlog");
  const setupEnd = text.indexOf("%%EndSetup");
  const bodyStart = Math.max(prologEnd, setupEnd);
  if (bodyStart < 0) return true;
  const body = text.slice(bodyStart);
  if (/(^|\n)\s*q\s/m.test(body) || /(^|\n)\s*Q\s/m.test(body)) return true;
  if (/(^|\n)[0-9. -]+ rg\s/m.test(body)) return true;
  if (/(^|\n)[0-9. -]+ RG\s/m.test(body)) return true;
  if (/(^|\n)\s*h\s/m.test(body)) return true;
  if (/(^|\n)[0-9. -]+ re\s/m.test(body)) return true;
  if (/(^|\n)\s*B\*\s/m.test(body)) return true;
  if (/(^|\n)\s*f\*\s/m.test(body)) return true;
  if (PDF_ONLY_OP.test(body)) return true;
  return false;
}

export function nativeAiHeaderExcerpt(bytes: Uint8Array, maxLines = 24): string {
  const text = new TextDecoder("latin1").decode(bytes);
  return text.split("\n").slice(0, maxLines).join("\n");
}
