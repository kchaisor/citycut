import { polylineLength } from "./geo";
import { closestParameter, MIN_DECK_SPAN_M } from "./roadDrape";
import type { Pt } from "../types";

type FlagSpan = { from: number; to: number; values: string[] };

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseFlagSpans(raw: unknown): FlagSpan[] {
  const spans: FlagSpan[] = [];
  for (const entry of parseJsonArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { between?: unknown; values?: unknown };
    const values = Array.isArray(row.values) ? row.values.map((value) => String(value).toLowerCase()) : [];
    if (values.length === 0) continue;
    if (Array.isArray(row.between) && row.between.length === 2) {
      const from = Number(row.between[0]);
      const to = Number(row.between[1]);
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) spans.push({ from, to, values });
      continue;
    }
    spans.push({ from: 0, to: 1, values });
  }
  return spans;
}

function parseLevelSpans(raw: unknown): FlagSpan[] {
  const spans: FlagSpan[] = [];
  for (const entry of parseJsonArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { between?: unknown; value?: unknown };
    const level = Number(row.value);
    if (!Number.isFinite(level)) continue;
    if (Array.isArray(row.between) && row.between.length === 2) {
      const from = Number(row.between[0]);
      const to = Number(row.between[1]);
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
        spans.push({ from, to, values: [`level:${level}`] });
      }
      continue;
    }
    spans.push({ from: 0, to: 1, values: [`level:${level}`] });
  }
  return spans;
}

function hiddenAt(values: string[]): boolean {
  if (values.includes("is_tunnel") || values.includes("is_covered")) return true;
  for (const value of values) {
    if (value.startsWith("level:")) {
      const level = Number(value.slice("level:".length));
      if (Number.isFinite(level) && level < 0) return true;
    }
  }
  return false;
}

function bridgeAt(values: string[]): boolean {
  return values.includes("is_bridge");
}

function levelAboveGroundAt(values: string[]): boolean {
  for (const value of values) {
    if (value.startsWith("level:")) {
      const level = Number(value.slice("level:".length));
      if (Number.isFinite(level) && level > 0) return true;
    }
  }
  return false;
}

function elevatedAt(values: string[]): boolean {
  return bridgeAt(values) || levelAboveGroundAt(values);
}

function mergeIntervals(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const next = sorted[i];
    if (next[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], next[1]);
    else merged.push(next);
  }
  return merged;
}

function subtractHidden(from: number, to: number, hidden: Array<[number, number]>): Array<[number, number]> {
  let visible: Array<[number, number]> = [[from, to]];
  for (const [h0, h1] of hidden) {
    const next: Array<[number, number]> = [];
    for (const [v0, v1] of visible) {
      if (h1 <= v0 || h0 >= v1) {
        next.push([v0, v1]);
        continue;
      }
      if (v0 < h0) next.push([v0, Math.max(v0, h0)]);
      if (v1 > h1) next.push([Math.min(v1, h1), v1]);
    }
    visible = next;
  }
  return visible.filter(([a, b]) => b - a > 1e-6);
}

function flagSpansOf(props: Record<string, unknown>): FlagSpan[] {
  return [...parseFlagSpans(props.road_flags), ...parseFlagSpans(props.rail_flags), ...parseLevelSpans(props.level_rules)];
}

/** Normalised spans along the segment centreline that should not appear at ground level. */
export function hiddenSpansFromOvertureProps(props: Record<string, unknown>): Array<[number, number]> {
  return mergeIntervals(
    flagSpansOf(props)
      .filter((span) => hiddenAt(span.values))
      .map((span) => [Math.max(0, span.from), Math.min(1, span.to)] as [number, number]),
  );
}

function rawElevatedSpans(props: Record<string, unknown>): Array<[number, number]> {
  return mergeIntervals(
    flagSpansOf(props)
      .filter((span) => elevatedAt(span.values))
      .map((span) => [Math.max(0, span.from), Math.min(1, span.to)] as [number, number]),
  );
}

function rawBridgeSpans(props: Record<string, unknown>): Array<[number, number]> {
  return mergeIntervals(
    flagSpansOf(props)
      .filter((span) => bridgeAt(span.values))
      .map((span) => [Math.max(0, span.from), Math.min(1, span.to)] as [number, number]),
  );
}

function rawLevelElevatedSpans(props: Record<string, unknown>): Array<[number, number]> {
  return mergeIntervals(
    flagSpansOf(props)
      .filter((span) => levelAboveGroundAt(span.values))
      .map((span) => [Math.max(0, span.from), Math.min(1, span.to)] as [number, number]),
  );
}

export function bridgeSpansFromOvertureProps(props: Record<string, unknown>): Array<[number, number]> {
  return rawBridgeSpans(props);
}

/** Deck spans for a segment: paths only use explicit bridges; rail and carriageways keep level>0. */
export function deckElevatedSpansForSpec(
  props: Record<string, unknown>,
  kind: "road" | "rail",
  grade?: "arterial" | "local" | "path",
): Array<[number, number]> {
  const hidden = hiddenSpansFromOvertureProps(props);
  const raw =
    kind === "road" && grade === "path"
      ? rawBridgeSpans(props)
      : mergeIntervals([...rawBridgeSpans(props), ...rawLevelElevatedSpans(props)]);
  const parts: Array<[number, number]> = [];
  for (const [from, to] of raw) {
    parts.push(...subtractHidden(from, to, hidden));
  }
  return mergeIntervals(parts);
}

/** Tunnels plus bridge / elevated spans removed from the ground-draped centreline. */
export function groundHiddenSpansFromOvertureProps(props: Record<string, unknown>): Array<[number, number]> {
  return mergeIntervals([...hiddenSpansFromOvertureProps(props), ...rawElevatedSpans(props)]);
}

/** Elevated centreline pieces long enough to render as a deck. */
export function deckPiecesFromLine(
  line: Pt[],
  props: Record<string, unknown>,
  kind: "road" | "rail",
  grade?: "arterial" | "local" | "path",
): Pt[][] {
  return clipLineToVisibleSpans(line, deckElevatedSpansForSpec(props, kind, grade)).filter(
    (piece) => polylineLength(piece) >= MIN_DECK_SPAN_M,
  );
}

function deckHiddenSpansOnLine(
  line: Pt[],
  props: Record<string, unknown>,
  kind: "road" | "rail",
  grade?: "arterial" | "local" | "path",
): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const piece of deckPiecesFromLine(line, props, kind, grade)) {
    const from = closestParameter(line, piece[0]);
    const to = closestParameter(line, piece[piece.length - 1]);
    spans.push([Math.min(from, to), Math.max(from, to)]);
  }
  return mergeIntervals(spans);
}

/** Per-line hidden spans: tunnels plus deck spans that will actually be meshed. */
export function groundHiddenSpansForLine(
  line: Pt[],
  props: Record<string, unknown>,
  kind: "road" | "rail",
  grade?: "arterial" | "local" | "path",
): Array<[number, number]> {
  return mergeIntervals([
    ...hiddenSpansFromOvertureProps(props),
    ...deckHiddenSpansOnLine(line, props, kind, grade),
  ]);
}

/** Bridge and level>0 spans that should render as a deck. Tunnels stay hidden. */
export function elevatedSpansFromOvertureProps(props: Record<string, unknown>): Array<[number, number]> {
  const hidden = hiddenSpansFromOvertureProps(props);
  const parts: Array<[number, number]> = [];
  for (const [from, to] of rawElevatedSpans(props)) {
    parts.push(...subtractHidden(from, to, hidden));
  }
  return mergeIntervals(parts);
}

function pointAt(line: Pt[], t: number): Pt {
  const total = polylineLength(line);
  if (total < 1e-6) return [line[0][0], line[0][1]];
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg < 1e-9) continue;
    if (target <= seg) {
      const f = target / seg;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    target -= seg;
  }
  const last = line[line.length - 1];
  return [last[0], last[1]];
}

function clipLinePart(line: Pt[], from: number, to: number): Pt[] {
  const start = pointAt(line, from);
  const end = pointAt(line, to);
  const piece: Pt[] = [start];
  const total = polylineLength(line);
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg < 1e-9) continue;
    const segStart = from * total;
    const segEnd = to * total;
    let walked = 0;
    for (let j = 0; j <= i; j++) {
      if (j < i) walked += Math.hypot(line[j + 1][0] - line[j][0], line[j + 1][1] - line[j][1]);
    }
    const segStartDist = walked;
    const segEndDist = walked + seg;
    if (segEndDist <= segStart + 1e-6 || segStartDist >= segEnd - 1e-6) continue;
    if (segStartDist > segStart + 1e-6 && segStartDist < segEnd - 1e-6) piece.push([a[0], a[1]]);
    if (segEndDist > segStart + 1e-6 && segEndDist < segEnd - 1e-6) piece.push([b[0], b[1]]);
  }
  piece.push(end);
  const deduped: Pt[] = [];
  for (const point of piece) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.05) deduped.push(point);
  }
  if (deduped.length >= 2 && polylineLength(deduped) >= 0.5) return deduped;
  return [];
}

/** Keep centreline pieces that fall inside the given normalised spans. */
export function clipLineToVisibleSpans(line: Pt[], spans: Array<[number, number]>): Pt[][] {
  if (line.length < 2 || polylineLength(line) < 0.2 || spans.length === 0) return [];
  const parts: Pt[][] = [];
  for (const [from, to] of mergeIntervals(spans)) {
    if (to - from < 1e-4) continue;
    const piece = clipLinePart(line, from, to);
    if (piece.length >= 2) parts.push(piece);
  }
  return parts;
}

/** Keep the parts of a centreline that are not tunnel, covered, or underground level. */
export function clipLineToGroundVisible(line: Pt[], hidden: Array<[number, number]>): Pt[][] {
  if (line.length < 2 || polylineLength(line) < 0.2) return [];
  if (hidden.length === 0) return [line];
  return clipLineToVisibleSpans(line, subtractHidden(0, 1, hidden));
}
