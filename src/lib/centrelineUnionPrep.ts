import { polylineLength } from "./geo";
import type { Pt } from "../types";

const MAX_MERGE_POINTS = 512;
const MAX_MERGE_LENGTH_M = 4000;

export type CentrelineStrip = { line: Pt[]; width: number };

function pointsNear(a: Pt, b: Pt, toleranceM: number): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= toleranceM;
}

type EndpointRef = { si: number; end: "start" | "end"; pt: Pt };

function collectEndpoints(strips: CentrelineStrip[]): EndpointRef[] {
  const out: EndpointRef[] = [];
  for (let si = 0; si < strips.length; si++) {
    const line = strips[si]!.line;
    if (line.length < 2) continue;
    out.push({ si, end: "start", pt: line[0]! });
    out.push({ si, end: "end", pt: line[line.length - 1]! });
  }
  return out;
}

function endpointGroups(strips: CentrelineStrip[], snapM: number): Map<string, EndpointRef[]> {
  const endpoints = collectEndpoints(strips);
  const parent = endpoints.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    let c = i;
    while (parent[c] !== c) {
      const n = parent[c]!;
      parent[c] = r;
      c = n;
    }
    return r;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      if (pointsNear(endpoints[i]!.pt, endpoints[j]!.pt, snapM)) unite(i, j);
    }
  }
  const groups = new Map<string, EndpointRef[]>();
  for (let i = 0; i < endpoints.length; i++) {
    const root = find(i);
    const key = String(root);
    const list = groups.get(key);
    if (list) list.push(endpoints[i]!);
    else groups.set(key, [endpoints[i]!]);
  }
  return groups;
}

function junctionPoint(group: EndpointRef[]): Pt {
  let x = 0;
  let y = 0;
  for (const ep of group) {
    x += ep.pt[0];
    y += ep.pt[1];
  }
  return [x / group.length, y / group.length];
}

function mergePair(
  a: CentrelineStrip,
  aEnd: "start" | "end",
  b: CentrelineStrip,
  bEnd: "start" | "end",
  at: Pt,
): CentrelineStrip | null {
  const width = Math.max(a.width, b.width);
  const la = a.line.slice();
  const lb = b.line.slice();
  if (aEnd === "end") la[la.length - 1] = at;
  else la[0] = at;
  if (bEnd === "start") lb[0] = at;
  else lb[lb.length - 1] = at;

  let merged: Pt[];
  if (aEnd === "end" && bEnd === "start") merged = [...la, ...lb.slice(1)];
  else if (aEnd === "start" && bEnd === "end") merged = [...lb, ...la.slice(1)];
  else if (aEnd === "end" && bEnd === "end") merged = [...la, ...lb.slice(0, -1).reverse()];
  else merged = [...la.slice(0, -1).reverse(), ...lb];

  if (merged.length < 2 || merged.length > MAX_MERGE_POINTS) return null;
  if (polylineLength(merged) > MAX_MERGE_LENGTH_M) return null;
  return { line: dedupeAdjacent(merged), width };
}

function dedupeAdjacent(line: Pt[], eps = 0.02): Pt[] {
  const out: Pt[] = [];
  for (const p of line) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) out.push(p);
  }
  return out;
}

function outwardDir(strip: CentrelineStrip, end: "start" | "end", junction: Pt): number | null {
  const line = strip.line;
  if (line.length < 2) return null;
  if (end === "end") {
    const prev = line[line.length - 2]!;
    return Math.atan2(junction[1] - prev[1], junction[0] - prev[0]);
  }
  const next = line[1]!;
  return Math.atan2(next[1] - junction[1], next[0] - junction[0]);
}

function straightestThroughPair(group: EndpointRef[], strips: CentrelineStrip[], at: Pt): [EndpointRef, EndpointRef] | null {
  let throughA: EndpointRef | null = null;
  let throughB: EndpointRef | null = null;
  let bestStraight = -1;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const e0 = group[i]!;
      const e1 = group[j]!;
      if (e0.si === e1.si) continue;
      const d0 = outwardDir(strips[e0.si]!, e0.end, at);
      const d1 = outwardDir(strips[e1.si]!, e1.end, at);
      if (d0 === null || d1 === null) continue;
      let delta = d1 - d0;
      const tau = Math.PI * 2;
      delta = ((delta % tau) + tau) % tau;
      if (delta > Math.PI) delta = tau - delta;
      const straight = Math.abs(delta - Math.PI);
      if (straight > bestStraight) {
        bestStraight = straight;
        throughA = e0;
        throughB = e1;
      }
    }
  }
  if (!throughA || !throughB) return null;
  return [throughA, throughB];
}

function tryMergeGroupPair(
  current: CentrelineStrip[],
  e0: EndpointRef,
  e1: EndpointRef,
  at: Pt,
): { remove: Set<number>; addition: CentrelineStrip } | null {
  const s0 = current[e0.si]!;
  const s1 = current[e1.si]!;
  if (Math.abs(s0.width - s1.width) > 0.05) return null;
  const merged = mergePair(s0, e0.end, s1, e1.end, at);
  if (!merged || merged.line.length < 2) return null;
  return { remove: new Set([e0.si, e1.si]), addition: merged };
}

export function mergeThroughJunctions(strips: CentrelineStrip[], snapM: number): CentrelineStrip[] {
  let current = strips.map((s) => ({ line: s.line.slice(), width: s.width }));
  let changed = true;
  while (changed) {
    changed = false;
    const groups = endpointGroups(current, snapM);
    const remove = new Set<number>();
    const additions: CentrelineStrip[] = [];

    for (const group of groups.values()) {
      if (group.length === 2) {
        const [e0, e1] = group;
        if (e0.si === e1.si) continue;
        const at = junctionPoint(group);
        const merged = tryMergeGroupPair(current, e0, e1, at);
        if (!merged) continue;
        merged.remove.forEach((i) => remove.add(i));
        additions.push(merged.addition);
        changed = true;
        continue;
      }
      if (group.length >= 3) {
        const at = junctionPoint(group);
        const pair = straightestThroughPair(group, current, at);
        if (!pair) continue;
        const merged = tryMergeGroupPair(current, pair[0], pair[1], at);
        if (!merged) continue;
        merged.remove.forEach((i) => remove.add(i));
        additions.push(merged.addition);
        changed = true;
      }
    }
    if (!changed) break;
    current = current.filter((_, i) => !remove.has(i)).concat(additions);
  }
  return current;
}

export function trimBranchCentrelines(strips: CentrelineStrip[], snapM: number): CentrelineStrip[] {
  const groups = endpointGroups(strips, snapM);
  const out = strips.map((s) => ({ line: s.line.slice(), width: s.width }));

  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const at = junctionPoint(group);
    const pair = straightestThroughPair(group, out, at);
    if (!pair) continue;
    const throughA = pair[0].si;
    const throughB = pair[1].si;

    for (const ep of group) {
      if (ep.si === throughA || ep.si === throughB) continue;
      const strip = out[ep.si]!;
      strip.line = trimStripToJunction(strip.line, ep.end, at);
    }
  }
  return out;
}

function trimStripToJunction(line: Pt[], end: "start" | "end", junction: Pt): Pt[] {
  if (line.length < 2) return line.slice();
  if (end === "end") {
    const trimmed = line.slice();
    trimmed[trimmed.length - 1] = junction;
    while (trimmed.length >= 3) {
      const prev = trimmed[trimmed.length - 2]!;
      if (pointsNear(prev, junction, 0.05)) trimmed.pop();
      else break;
    }
    return trimmed;
  }
  const trimmed = line.slice();
  trimmed[0] = junction;
  while (trimmed.length >= 3) {
    const next = trimmed[1]!;
    if (pointsNear(next, junction, 0.05)) trimmed.shift();
    else break;
  }
  return trimmed;
}

export function clipOvershootingBranches(strips: CentrelineStrip[], snapM: number): CentrelineStrip[] {
  const out = strips.map((s) => ({ line: s.line.slice(), width: s.width }));
  const groups = endpointGroups(out, snapM);

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const at = junctionPoint(group);
    for (const ep of group) {
      const strip = out[ep.si]!;
      if (strip.line.length < 3) continue;
      if (ep.end === "end") {
        const last = strip.line[strip.line.length - 1]!;
        if (!pointsNear(last, at, snapM)) continue;
        let cut = strip.line.length - 1;
        for (let i = strip.line.length - 2; i >= 1; i--) {
          if (pointsNear(strip.line[i]!, at, snapM * 1.5)) cut = i;
          else break;
        }
        if (cut < strip.line.length - 1) {
          strip.line = strip.line.slice(0, cut + 1);
          strip.line[strip.line.length - 1] = at;
        }
      } else {
        const first = strip.line[0]!;
        if (!pointsNear(first, at, snapM)) continue;
        let cut = 0;
        for (let i = 1; i < strip.line.length - 1; i++) {
          if (pointsNear(strip.line[i]!, at, snapM * 1.5)) cut = i;
          else break;
        }
        if (cut > 0) {
          strip.line = strip.line.slice(cut);
          strip.line[0] = at;
        }
      }
    }
  }
  return out;
}

export function prepareStripsForUnion(strips: CentrelineStrip[], stitchM: number): CentrelineStrip[] {
  let out = strips.map((s) => ({ line: s.line.map((p): Pt => [p[0], p[1]]), width: s.width }));
  out = mergeThroughJunctions(out, stitchM);
  out = trimBranchCentrelines(out, stitchM);
  out = clipOvershootingBranches(out, stitchM);
  return out.filter((s) => s.line.length >= 2);
}
