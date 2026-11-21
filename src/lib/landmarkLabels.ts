import type { WikidataLandmark } from "../../shared/wikidataLandmarks.js";
import { closestCitedHeight, type WikidataMatch } from "./wikidataMatch";
import { pointInPolygon, interiorPoint } from "./useCascade";
import type { BuildingFeat, Pt, Ring } from "../types";

export const LANDMARK_LABELS_DEFAULT_ON = false;
export const LANDMARK_LABEL_SETTLE_MS = 100;
export const LANDMARK_LABEL_GAP_PX = 4;
export const LANDMARK_OBSTACLE_GAP_PX = 8;
export const LANDMARK_PILL_HEIGHT_PX = 20;
export const LANDMARK_PILL_PAD_X_PX = 6;
export const LANDMARK_PILL_MAX_WIDTH_PX = 160;
export const LANDMARK_FONT_PX = 11;
export const LANDMARK_HALO_PX = 2;

export type ScreenBox = { left: number; top: number; right: number; bottom: number };

export type LandmarkLabelSource = { buildingId: number; name: string; at: Pt; rank: number };

export type LabelCandidate = { id: number; name: string; rank: number; x: number; y: number; width: number; height: number };

export type PlaceLabelOptions = {
  labelGap?: number;
  obstacleGap?: number;
  hiddenId?: number | null;
  bounds?: ScreenBox | null;
};

function normaliseName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

export function sameLandmarkName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normaliseName(a);
  return left !== "" && left === normaliseName(b);
}

function sharedWords(a: string, b: string): number {
  const words = new Set(normaliseName(b).split(" ").filter(Boolean));
  return normaliseName(a)
    .split(" ")
    .filter((word) => word && words.has(word)).length;
}

function qidNumber(qid: string): number {
  const n = Number(qid.replace(/^Q/, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

export function pickLandmarkForBuilding<T extends Pick<WikidataLandmark, "qid" | "name" | "heightsM">>(
  items: readonly T[],
  buildingName: string | null | undefined,
): T | null {
  if (items.length === 0) return null;
  const exact = items.find((item) => sameLandmarkName(item.name, buildingName));
  if (exact) return exact;
  const score = (item: T) => {
    const name = normaliseName(item.name);
    const building = normaliseName(buildingName);
    const contained = building !== "" && (building.includes(name) || name.includes(building)) ? 1 : 0;
    return [contained, building ? sharedWords(item.name, buildingName ?? "") : 0, item.heightsM.length > 0 ? 1 : 0];
  };
  return [...items].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i]! - sa[i]!;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return qidNumber(a.qid) - qidNumber(b.qid);
  })[0]!;
}

export function landmarksByBuilding(
  matches: readonly WikidataMatch[],
  buildings: readonly Pick<BuildingFeat, "id" | "overtureName">[],
): Map<number, WikidataLandmark> {
  const grouped = new Map<number, WikidataLandmark[]>();
  for (const { buildingId, item } of matches) grouped.set(buildingId, [...(grouped.get(buildingId) ?? []), item]);
  const nameById = new Map(buildings.map((b) => [b.id, b.overtureName ?? null]));
  const out = new Map<number, WikidataLandmark>();
  for (const [buildingId, items] of grouped) {
    if (!nameById.has(buildingId)) continue;
    const pick = pickLandmarkForBuilding(items, nameById.get(buildingId));
    if (pick) out.set(buildingId, pick);
  }
  return out;
}

export function footprintCentroid(ring: Ring, holes: Ring[] = []): Pt {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j]!;
    const [x1, y1] = ring[i]!;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) > 1e-9) {
    const at: Pt = [cx / (3 * area), cy / (3 * area)];
    if (pointInPolygon(at, ring, holes)) return at;
  }
  return interiorPoint(ring, holes);
}

export function landmarkLabelSources(
  landmarks: ReadonlyMap<number, Pick<WikidataLandmark, "name">>,
  buildings: readonly Pick<BuildingFeat, "id" | "ring" | "holes" | "height">[],
): LandmarkLabelSource[] {
  const out: LandmarkLabelSource[] = [];
  for (const building of buildings) {
    const landmark = landmarks.get(building.id);
    if (!landmark) continue;
    out.push({ buildingId: building.id, name: landmark.name, at: footprintCentroid(building.ring, building.holes), rank: building.height });
  }
  return out;
}

export function estimateTextWidth(text: string, fontPx = LANDMARK_FONT_PX): number {
  return text.length * fontPx * 0.56;
}

export function pillWidth(textWidth: number): number {
  return Math.min(LANDMARK_PILL_MAX_WIDTH_PX, Math.ceil(textWidth) + LANDMARK_PILL_PAD_X_PX * 2 + 2);
}

export function candidateBox(candidate: Pick<LabelCandidate, "x" | "y" | "width" | "height">): ScreenBox {
  return {
    left: candidate.x - candidate.width / 2,
    right: candidate.x + candidate.width / 2,
    top: candidate.y - candidate.height / 2,
    bottom: candidate.y + candidate.height / 2,
  };
}

export function boxesOverlap(a: ScreenBox, b: ScreenBox, gap = 0): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
}

function insideBounds(box: ScreenBox, bounds: ScreenBox): boolean {
  return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
}

export function placeLandmarkLabels<T extends LabelCandidate>(
  candidates: readonly T[],
  obstacles: readonly ScreenBox[],
  options: PlaceLabelOptions = {},
): T[] {
  const labelGap = options.labelGap ?? LANDMARK_LABEL_GAP_PX;
  const obstacleGap = options.obstacleGap ?? LANDMARK_OBSTACLE_GAP_PX;
  const ranked = [...candidates].sort((a, b) => b.rank - a.rank || a.id - b.id);
  const placed: { candidate: T; box: ScreenBox }[] = [];
  for (const candidate of ranked) {
    if (options.hiddenId != null && candidate.id === options.hiddenId) continue;
    const box = candidateBox(candidate);
    if (options.bounds && !insideBounds(box, options.bounds)) continue;
    if (obstacles.some((obstacle) => boxesOverlap(box, obstacle, obstacleGap))) continue;
    if (placed.some((other) => boxesOverlap(box, other.box, labelGap))) continue;
    placed.push({ candidate, box });
  }
  return placed.map((entry) => entry.candidate);
}

export type RoofHit = { distance: number; buildingId: number | null };

export function roofPointVisible(
  firstHit: RoofHit | null,
  targetId: number,
  pointDistance: number,
  toleranceM = 1,
): boolean {
  if (!firstHit) return true;
  if (firstHit.buildingId === targetId) return true;
  return firstHit.distance >= pointDistance - toleranceM;
}

export type LandmarkRow = { label: string; value: string; numeric?: boolean };

function linkedNames(list: readonly { name: string | null }[]): string {
  return list
    .map((entry) => entry.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");
}

export function landmarkRows(
  item: WikidataLandmark,
  buildingName: string | null | undefined,
  modelHeightM: number,
): LandmarkRow[] {
  const rows: LandmarkRow[] = [];
  if (!sameLandmarkName(item.name, buildingName)) rows.push({ label: "Name", value: item.name });
  const cited = closestCitedHeight(item, modelHeightM);
  if (cited !== null) rows.push({ label: "Cited height", value: `${Math.round(cited * 10) / 10} m`, numeric: true });
  if (item.floorsAboveGround !== null) rows.push({ label: "Floors", value: String(item.floorsAboveGround), numeric: true });
  if (item.yearBuilt !== null) rows.push({ label: "Built", value: String(item.yearBuilt), numeric: true });
  if (item.yearOpened !== null && item.yearOpened !== item.yearBuilt) {
    rows.push({ label: "Opened", value: String(item.yearOpened), numeric: true });
  }
  const architects = linkedNames(item.architects);
  if (architects) rows.push({ label: item.architects.length > 1 ? "Architects" : "Architect", value: architects });
  const styles = linkedNames(item.styles);
  if (styles) rows.push({ label: "Style", value: styles });
  const heritage = linkedNames(item.heritage);
  if (heritage) rows.push({ label: "Heritage", value: heritage });
  return rows;
}

export function wikidataItemUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${encodeURIComponent(qid)}`;
}

export type SheetLabel = { buildingId: number; text: string; x: number; y: number };

export function placeSheetLabels(
  sources: readonly LandmarkLabelSource[],
  toSheet: (at: Pt) => [number, number],
  fontSize: number,
  bounds: ScreenBox | null,
): SheetLabel[] {
  const pxToUnit = fontSize / LANDMARK_FONT_PX;
  const candidates = sources.map((source) => {
    const [x, y] = toSheet(source.at);
    return {
      id: source.buildingId,
      name: source.name,
      rank: source.rank,
      x,
      y,
      width: estimateTextWidth(source.name, fontSize) + LANDMARK_HALO_PX * 2 * pxToUnit,
      height: fontSize * 1.3 + LANDMARK_HALO_PX * 2 * pxToUnit,
    };
  });
  return placeLandmarkLabels(candidates, [], {
    labelGap: LANDMARK_LABEL_GAP_PX * pxToUnit,
    obstacleGap: 0,
    bounds,
  }).map((c) => ({ buildingId: c.id, text: c.name, x: c.x, y: c.y }));
}
