import { polylineLength } from "./geo";
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

/** Normalised spans along the segment centreline that should not appear at ground level. */
export function hiddenSpansFromOvertureProps(props: Record<string, unknown>): Array<[number, number]> {
  const spans = [...parseFlagSpans(props.road_flags), ...parseFlagSpans(props.rail_flags), ...parseLevelSpans(props.level_rules)];
  return mergeIntervals(
    spans
      .filter((span) => hiddenAt(span.values))
      .map((span) => [Math.max(0, span.from), Math.min(1, span.to)] as [number, number]),
  );
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

/** Keep the parts of a centreline that are not tunnel, covered, or underground level. */
export function clipLineToGroundVisible(line: Pt[], hidden: Array<[number, number]>): Pt[][] {
  if (line.length < 2 || polylineLength(line) < 0.2) return [];
  if (hidden.length === 0) return [line];
  const visible = subtractHidden(0, 1, hidden);
  const parts: Pt[][] = [];
  for (const [from, to] of visible) {
    if (to - from < 1e-4) continue;
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
    if (deduped.length >= 2 && polylineLength(deduped) >= 0.5) parts.push(deduped);
  }
  return parts;
}
