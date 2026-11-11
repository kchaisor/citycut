import { aiLayerLabel } from "./aiNative";
import type { PdfChunk, PdfEllipse, PdfPath, PdfText, Rgb } from "./aiDocument";

export function buildLayeredSvg(widthMm: number, heightMm: number, chunks: PdfChunk[], order: readonly string[]): string {
  const present = new Set(chunks.map((chunk) => chunk.name));
  const names = order.filter((name) => present.has(name));
  for (const chunk of chunks) if (!names.includes(chunk.name)) names.push(chunk.name);

  const n = (value: number) => {
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? "0" : String(rounded);
  };
  const y = (value: number) => n(heightMm - value);
  const colour = (rgb: Rgb) =>
    `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("")}`;
  const esc = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ids = new Map<string, string>();
  const idFor = (label: string) => {
    if (!ids.has(label)) {
      let id = label.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^([^A-Za-z_])/, "_$1") || "layer";
      while ([...ids.values()].includes(id)) id += "_";
      ids.set(label, id);
    }
    return ids.get(label)!;
  };

  const pathEl = (path: PdfPath) => {
    const rings = path.rings.filter((ring) => ring.length >= 2);
    const hasFill = Boolean(path.fill);
    const hasStroke = Boolean(path.stroke) && (path.strokeMm ?? 0) > 0;
    if (rings.length === 0 || (!hasFill && !hasStroke)) return "";
    const close = path.close !== false;
    const d = rings
      .map((ring) => {
        const body = ring.map((p, i) => `${i === 0 ? "M" : "L"}${n(p[0])} ${y(p[1])}`).join("");
        return close && ring.length >= 3 ? `${body}Z` : body;
      })
      .join("");
    const attrs = [`d="${d}"`, `fill="${hasFill ? colour(path.fill!) : "none"}"`];
    if (hasFill && path.evenOdd !== false) attrs.push(`fill-rule="evenodd"`);
    if (hasStroke) {
      attrs.push(`stroke="${colour(path.stroke!)}"`, `stroke-width="${n(path.strokeMm ?? 0.1)}"`);
      attrs.push(`stroke-linecap="${path.cap === "round" ? "round" : "butt"}"`);
      attrs.push(`stroke-linejoin="${path.join === "round" ? "round" : "miter"}"`);
      if (path.dashMm && path.dashMm.length >= 2) attrs.push(`stroke-dasharray="${path.dashMm.map(n).join(" ")}"`);
    }
    if (path.opacity !== undefined && path.opacity < 1) attrs.push(`opacity="${n(path.opacity)}"`);
    return `<path ${attrs.join(" ")}/>`;
  };
  const ellipseEl = (e: PdfEllipse) => {
    const hasFill = Boolean(e.fill);
    const hasStroke = Boolean(e.stroke) && (e.strokeMm ?? 0) > 0;
    if ((!hasFill && !hasStroke) || !(e.rx > 0) || !(e.ry > 0)) return "";
    const attrs = [`cx="${n(e.cx)}"`, `cy="${y(e.cy)}"`, `rx="${n(e.rx)}"`, `ry="${n(e.ry)}"`];
    attrs.push(`fill="${hasFill ? colour(e.fill!) : "none"}"`);
    if (hasStroke) attrs.push(`stroke="${colour(e.stroke!)}"`, `stroke-width="${n(e.strokeMm ?? 0.1)}"`);
    return `<ellipse ${attrs.join(" ")}/>`;
  };
  const textEl = (t: PdfText) => {
    if (!t.text) return "";
    const rotate = t.rotateDeg ? ` transform="rotate(${n(-t.rotateDeg)} ${n(t.x)} ${y(t.y)})"` : "";
    return `<text x="${n(t.x)}" y="${y(t.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${n(t.sizeMm)}" fill="${colour(t.color)}"${rotate}>${esc(t.text)}</text>`;
  };

  const groups = new Map<string, string[]>();
  for (const chunk of chunks) {
    const label = aiLayerLabel(chunk.name);
    const parts = groups.get(label) ?? [];
    for (const path of chunk.paths ?? []) parts.push(pathEl(path));
    for (const ellipse of chunk.ellipses ?? []) parts.push(ellipseEl(ellipse));
    for (const text of chunk.texts ?? []) parts.push(textEl(text));
    groups.set(label, parts);
  }

  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${n(widthMm)}mm" height="${n(heightMm)}mm" viewBox="0 0 ${n(widthMm)} ${n(heightMm)}">`,
  ];
  for (const name of names) {
    const label = aiLayerLabel(name);
    const parts = groups.get(label);
    if (!parts) continue;
    groups.delete(label);
    const body = parts.filter(Boolean);
    if (body.length === 0) continue;
    out.push(`<g id="${idFor(label)}" inkscape:groupmode="layer" inkscape:label="${esc(label)}">`, ...body, `</g>`);
  }
  out.push(`</svg>`);
  return out.join("\n");
}
