import { BUILDING_USE_META } from "./buildingUse";
import { getColour } from "./colours";
import type { BuildingUse } from "../types";
import type {
  ImportedMassing,
  ImportedMassingBuilding,
  MassingBuildingUse,
  ParsedMassing,
  ParsedMassingBuilding,
} from "./massingImport";

export function normaliseMassingColour(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

export const LAYER_PATH_SEPARATOR = "::";
export const DEFAULT_LAYER_NAME = "Default";
export const FALLBACK_MODEL_NAME = "Imported model";

const USE_WORDS: { pattern: RegExp; use: MassingBuildingUse }[] = [
  { pattern: /\bmixed[\s_-]*use\b/i, use: "mixed_use" },
  { pattern: /\bresidential\b/i, use: "residential" },
  { pattern: /\bcommercial\b/i, use: "commercial" },
  { pattern: /\bretail\b/i, use: "retail" },
  { pattern: /\bindustrial\b/i, use: "industrial" },
  { pattern: /\bcivic\b/i, use: "civic" },
  { pattern: /\brecreation\b/i, use: "recreation" },
];

function firstUseWord(text: string): MassingBuildingUse | null {
  let best: { at: number; use: MassingBuildingUse } | null = null;
  for (const { pattern, use } of USE_WORDS) {
    const at = text.search(pattern);
    if (at >= 0 && (best == null || at < best.at)) best = { at, use };
  }
  return best?.use ?? null;
}

export function useFromUserText(value: string | null | undefined): MassingBuildingUse | null {
  if (value == null) return null;
  const normalised = value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (normalised === "mixed use") return "mixed_use";
  const match = USE_WORDS.find(({ use }) => use === normalised);
  return match?.use ?? null;
}

export function useFromLayerPath(layerPath: string | null): MassingBuildingUse | null {
  if (!layerPath) return null;
  const segments = splitLayerPath(layerPath);
  for (let i = segments.length - 1; i >= 0; i--) {
    const use = firstUseWord(segments[i]!);
    if (use) return use;
  }
  return null;
}

export function levelsFromUserText(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const levels = Number(trimmed);
  return Number.isSafeInteger(levels) && levels > 0 ? levels : null;
}

export function splitLayerPath(layerPath: string): string[] {
  return layerPath.split(LAYER_PATH_SEPARATOR);
}

export function layerLeafName(layerPath: string): string {
  const segments = splitLayerPath(layerPath);
  return segments[segments.length - 1]!;
}

export function layerScheme(layerPath: string | null): string | null {
  if (!layerPath) return null;
  const segments = splitLayerPath(layerPath);
  return segments.length > 1 ? segments.slice(0, -1).join(LAYER_PATH_SEPARATOR) : null;
}

export function isDefaultLayerPath(layerPath: string | null): boolean {
  return layerPath == null || layerPath === "" || layerPath === DEFAULT_LAYER_NAME;
}

export function modelNameFromFile(fileName: string | undefined): string {
  const base = (fileName ?? "").replace(/\.3dm$/i, "").trim();
  return base || FALLBACK_MODEL_NAME;
}

export function buildingGroupingNote(buildings: Pick<ParsedMassingBuilding, "groupedBy">[]): string {
  const fromLayers = buildings.some((building) => building.groupedBy === "layer");
  const fromText = buildings.some((building) => building.groupedBy === "userText");
  const count = `${buildings.length} building${buildings.length === 1 ? "" : "s"}`;
  if (fromLayers && fromText) return `${count} from layers and user text`;
  if (fromLayers) return `${count} from layers`;
  if (fromText) return `${count} from user text`;
  return `${count}: no layers or attributes`;
}

export const LEGACY_SINGLE_BUILDING_NOTE =
  "1 building: saved before layers were read. Import the file again to split it into buildings.";

export function wholeFileBuilding(
  massing: Pick<ParsedMassing, "positions" | "triangles">,
  name: string,
): ParsedMassingBuilding {
  let baseZ = Infinity;
  let topZ = -Infinity;
  for (let i = 2; i < massing.positions.length; i += 3) {
    baseZ = Math.min(baseZ, massing.positions[i]!);
    topZ = Math.max(topZ, massing.positions[i]!);
  }
  if (!Number.isFinite(baseZ)) baseZ = topZ = 0;
  return {
    id: "file",
    name,
    layerPath: null,
    scheme: null,
    use: null,
    levels: null,
    groupedBy: "file",
    triStart: 0,
    triEnd: massing.triangles,
    vertexStart: 0,
    vertexEnd: massing.positions.length / 3,
    baseZ,
    topZ,
    height: topZ - baseZ,
  };
}

export function wholeFileBuildings(
  massing: Pick<ParsedMassing, "positions" | "triangles">,
  name: string,
): ImportedMassingBuilding[] {
  return [{ ...wholeFileBuilding(massing, modelNameFromFile(name)), visible: true }];
}

export function visibleBuildings(buildings: ParsedMassingBuilding[]): ImportedMassingBuilding[] {
  return buildings.map((building) => ({ ...building, visible: true }));
}

export function massingBuildingColour(
  massing: Pick<ImportedMassing, "colour">,
  building: Pick<ImportedMassingBuilding, "colour" | "use">,
): string {
  if (building.colour) return building.colour;
  if (massing.colour) return massing.colour;
  const use: BuildingUse = building.use ?? "unclassified";
  return getColour(BUILDING_USE_META[use].key);
}
