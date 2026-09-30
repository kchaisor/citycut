/** A one-page PDF of vector fills and Helvetica text. Coordinates are points, y up. */

export type PdfPoint = [number, number];

export type PdfOp =
  | { kind: "fill"; rings: PdfPoint[][] }
  | { kind: "rect"; x: number; y: number; w: number; h: number; mode: "fill" | "stroke"; width?: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: "polygon"; points: PdfPoint[] }
  | { kind: "text"; x: number; y: number; size: number; text: string };

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

function ptNum(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** WinAnsi literal. Characters outside Latin-1 become a question mark. */
function pdfEscape(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    if (code === 40 || code === 41 || code === 92) out += `\\${char}`;
    else if (code >= 32 && code <= 126) out += char;
    else if (code >= 160 && code <= 255) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return out;
}

function pathRing(ring: PdfPoint[]): string {
  if (ring.length < 2) return "";
  const open =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  if (open.length < 2) return "";
  const lines = [`${ptNum(open[0][0])} ${ptNum(open[0][1])} m`];
  for (let i = 1; i < open.length; i++) lines.push(`${ptNum(open[i][0])} ${ptNum(open[i][1])} l`);
  lines.push("h");
  return lines.join("\n");
}

function contentStream(ops: PdfOp[]): string {
  const lines = ["0 0 0 rg", "0 0 0 RG"];
  for (const op of ops) {
    if (op.kind === "fill") {
      const body = op.rings.map(pathRing).filter(Boolean).join("\n");
      if (body) lines.push(body, "f*");
    } else if (op.kind === "rect") {
      const draw = `${ptNum(op.x)} ${ptNum(op.y)} ${ptNum(op.w)} ${ptNum(op.h)} re`;
      if (op.mode === "fill") lines.push(`${draw} f`);
      else lines.push(`${ptNum(op.width ?? 0.6)} w`, `${draw} S`);
    } else if (op.kind === "line") {
      lines.push(
        `${ptNum(op.width)} w`,
        `${ptNum(op.x1)} ${ptNum(op.y1)} m`,
        `${ptNum(op.x2)} ${ptNum(op.y2)} l`,
        "S",
      );
    } else if (op.kind === "polygon") {
      const body = pathRing(op.points);
      if (body) lines.push(body, "f");
    } else {
      lines.push(`BT /F1 ${ptNum(op.size)} Tf ${ptNum(op.x)} ${ptNum(op.y)} Td (${pdfEscape(op.text)}) Tj ET`);
    }
  }
  return lines.join("\n");
}

function bytesOf(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

/** Single-page PDF. The page box is in points. */
export function buildPdf(widthPt: number, heightPt: number, ops: PdfOp[]): Uint8Array {
  const stream = `${contentStream(ops)}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptNum(widthPt)} ${ptNum(heightPt)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = output.length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  output += xref;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefStart}\n%%EOF\n`;
  return bytesOf(output);
}
