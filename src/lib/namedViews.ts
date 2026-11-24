import type { CameraPose } from "./cameraMemory";
import type { DrawingKind } from "../components/DrawingPlan";
import type { SolarViewSettings } from "../components/SolarHeliodon";
import type { Tab } from "../components/model/modelPageConstants";
import type { BuildingUse } from "../types";
import { parseDiagramArrows, type DiagramArrow } from "./diagramArrows";
import type { LineStyles } from "./drawingStyle";
import { isIsoCorner } from "./isoCamera";
import type { RenderQuality } from "./renderQuality";
import { NO_ANALYSES, SITE_ANALYSIS_KINDS, type ActiveAnalyses } from "./sidebarSections";
import type { View3dDisplaySettings } from "./view3dDisplay";
import type { ViewMemory } from "./viewMemory";
import { isDesignWindId } from "./windDesignWinds";
import { isWindDaypartId } from "./windDayparts";
import { DEFAULT_WIND_PLAN_VIEW, isWindPeriod, isWindPlanViewId, type WindPlanViewId, type WindViewSettings } from "./windState";
import type { WindPlanMode } from "./windPlanField";

export const NAMED_VIEWS_STORAGE_KEY = "citycut.namedViews.v1";
export const NAMED_VIEWS_VERSION = 1;

export type NamedViewWindPlan = { mode: WindPlanMode; vectorsOn: boolean; sector: number | null; view: WindPlanViewId };

export type NamedViewArrows = { visible: boolean; items: DiagramArrow[] };

export type NamedViewSnapshot = {
  view: ViewMemory;
  pose: CameraPose | null;
  tab: Tab;
  drawing: DrawingKind;
  analyses: ActiveAnalyses;
  solar: SolarViewSettings;
  wind: WindViewSettings;
  windStreaksOn: boolean;
  windPlan: NamedViewWindPlan;
  renderQuality: RenderQuality;
  sunDomeSizeM: number | null;
  viewshed: { eyeM: number; radiusM: number };
  sunStudySelected: number[];
  display: View3dDisplaySettings;
  colourByUse: boolean;
  showSource: boolean;
  hiddenUses: BuildingUse[];
  landmarkLabelsOn: boolean;
  lineStyles: LineStyles | null;
  exploded: boolean;
  explodeGapM: number | null;
  arrows: NamedViewArrows | null;
};

export type NamedView = {
  id: string;
  name: string;
  savedAt: number;
  snapshot: NamedViewSnapshot;
};

export type NamedViewsStore = {
  version: typeof NAMED_VIEWS_VERSION;
  byCut: Record<string, NamedView[]>;
};

export type NamedViewsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const TABS: readonly Tab[] = ["3d", "drawing", "satellite"];
const DRAWING_KINDS: readonly DrawingKind[] = ["site", "figure-ground", "isometric"];
const PROJECTIONS: readonly ViewMemory["projection"][] = ["perspective", "iso", "plan"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumbers(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePose(value: unknown): CameraPose | null {
  if (!isRecord(value)) return null;
  const { position, quaternion, up, target, zoom, near, far, fov } = value;
  if (!finiteNumbers(position, 3) || !finiteNumbers(quaternion, 4) || !finiteNumbers(up, 3) || !finiteNumbers(target, 3)) {
    return null;
  }
  if (!finite(zoom) || !finite(near) || !finite(far)) return null;
  const pose: CameraPose = {
    position: position as CameraPose["position"],
    quaternion: quaternion as CameraPose["quaternion"],
    up: up as CameraPose["up"],
    target: target as CameraPose["target"],
    zoom,
    near,
    far,
  };
  if (finite(fov)) pose.fov = fov;
  return pose;
}

function parseViewMemory(value: unknown): ViewMemory | null {
  if (!isRecord(value)) return null;
  const projection = PROJECTIONS.find((p) => p === value.projection);
  if (!projection || !isIsoCorner(value.corner)) return null;
  return { projection, corner: value.corner, freeRotate: value.freeRotate === true };
}

function parseAnalyses(value: unknown): ActiveAnalyses | null {
  if (!isRecord(value)) return null;
  return SITE_ANALYSIS_KINDS.reduce<ActiveAnalyses>((set, kind) => ({ ...set, [kind]: value[kind] === true }), NO_ANALYSES);
}

function parseWindPlan(value: unknown): NamedViewWindPlan {
  const plan = isRecord(value) ? value : {};
  return {
    mode: plan.mode === "comfort" ? "comfort" : "speed",
    vectorsOn: plan.vectorsOn !== false,
    sector: finite(plan.sector) && Number.isInteger(plan.sector) && plan.sector >= 0 ? plan.sector : null,
    view: isWindPlanViewId(plan.view) ? plan.view : DEFAULT_WIND_PLAN_VIEW,
  };
}

function parseWind(value: Record<string, unknown>): WindViewSettings {
  const text = (field: unknown): string | null => (typeof field === "string" ? field : null);
  const period = text(value.period);
  const designWind = text(value.designWind);
  const daypart = text(value.daypart);
  return {
    enabled: value.enabled === true,
    period: isWindPeriod(period) ? period : "annual",
    designWind: isDesignWindId(designWind) ? designWind : null,
    daypart: isWindDaypartId(daypart) ? daypart : "all",
  };
}

function parseArrows(value: unknown): NamedViewArrows | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  return { visible: value.visible !== false, items: parseDiagramArrows(value.items) };
}

function parseSnapshot(value: unknown): NamedViewSnapshot | null {
  if (!isRecord(value)) return null;
  const view = parseViewMemory(value.view);
  const analyses = parseAnalyses(value.analyses);
  const tab = TABS.find((t) => t === value.tab);
  if (!view || !analyses || !tab) return null;
  if (!isRecord(value.solar) || !isRecord(value.wind) || !isRecord(value.display)) return null;
  const viewshed = isRecord(value.viewshed) ? value.viewshed : {};
  const exploded = value.exploded === true && tab === "3d" && view.projection === "iso";
  return {
    view,
    pose: parsePose(value.pose),
    tab,
    drawing: DRAWING_KINDS.find((d) => d === value.drawing) ?? "site",
    analyses,
    solar: { ...value.solar } as SolarViewSettings,
    wind: parseWind(value.wind),
    windStreaksOn: value.windStreaksOn === true,
    windPlan: parseWindPlan(value.windPlan),
    renderQuality: value.renderQuality === "fast" ? "fast" : "high",
    sunDomeSizeM: finite(value.sunDomeSizeM) ? value.sunDomeSizeM : null,
    viewshed: {
      eyeM: finite(viewshed.eyeM) ? viewshed.eyeM : 0,
      radiusM: finite(viewshed.radiusM) ? viewshed.radiusM : 0,
    },
    sunStudySelected: Array.isArray(value.sunStudySelected) ? value.sunStudySelected.filter(finite) : [],
    display: { ...value.display } as View3dDisplaySettings,
    colourByUse: value.colourByUse === true,
    showSource: value.showSource === true,
    hiddenUses: Array.isArray(value.hiddenUses)
      ? (value.hiddenUses.filter((use) => typeof use === "string") as BuildingUse[])
      : [],
    landmarkLabelsOn: value.landmarkLabelsOn !== false,
    lineStyles: isRecord(value.lineStyles) ? ({ ...value.lineStyles } as LineStyles) : null,
    exploded,
    explodeGapM: exploded && finite(value.explodeGapM) && value.explodeGapM > 0 ? value.explodeGapM : null,
    arrows: parseArrows(value.arrows),
  };
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function parseNamedView(value: unknown): NamedView | null {
  if (!isRecord(value)) return null;
  const { id, name, savedAt } = value;
  if (typeof id !== "string" || !id || typeof name !== "string" || !cleanName(name) || !finite(savedAt)) return null;
  const snapshot = parseSnapshot(value.snapshot);
  return snapshot ? { id, name: cleanName(name), savedAt, snapshot } : null;
}

export function emptyNamedViewsStore(): NamedViewsStore {
  return { version: NAMED_VIEWS_VERSION, byCut: {} };
}

export function parseNamedViewsStore(raw: string | null): NamedViewsStore {
  if (!raw) return emptyNamedViewsStore();
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== NAMED_VIEWS_VERSION || !isRecord(data.byCut)) return emptyNamedViewsStore();
    const byCut: Record<string, NamedView[]> = {};
    for (const [cutId, list] of Object.entries(data.byCut)) {
      if (!Array.isArray(list)) continue;
      const views = list.map(parseNamedView).filter((view): view is NamedView => view !== null);
      if (views.length) byCut[cutId] = views;
    }
    return { version: NAMED_VIEWS_VERSION, byCut };
  } catch {
    return emptyNamedViewsStore();
  }
}

export function readNamedViewsStore(storage: NamedViewsStorage): NamedViewsStore {
  try {
    return parseNamedViewsStore(storage.getItem(NAMED_VIEWS_STORAGE_KEY));
  } catch {
    return emptyNamedViewsStore();
  }
}

export function writeNamedViewsStore(storage: NamedViewsStorage, store: NamedViewsStore): boolean {
  try {
    storage.setItem(NAMED_VIEWS_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

let idCounter = 0;

export function newNamedViewId(): string {
  idCounter += 1;
  return `view-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function captureNamedView(
  name: string,
  snapshot: NamedViewSnapshot,
  meta: { id?: string; savedAt?: number } = {},
): NamedView | null {
  const trimmed = cleanName(name);
  if (!trimmed) return null;
  const clean = parseSnapshot(JSON.parse(JSON.stringify(snapshot)));
  if (!clean) return null;
  return { id: meta.id ?? newNamedViewId(), name: trimmed, savedAt: meta.savedAt ?? Date.now(), snapshot: clean };
}

export function applyNamedView(view: NamedView): NamedViewSnapshot | null {
  return parseSnapshot(JSON.parse(JSON.stringify(view.snapshot)));
}

export function viewsForCut(store: NamedViewsStore, cutId: string): NamedView[] {
  return store.byCut[cutId] ?? [];
}

function withCutViews(store: NamedViewsStore, cutId: string, views: NamedView[]): NamedViewsStore {
  const byCut = { ...store.byCut };
  if (views.length) byCut[cutId] = views;
  else delete byCut[cutId];
  return { version: NAMED_VIEWS_VERSION, byCut };
}

export function saveView(store: NamedViewsStore, cutId: string, view: NamedView): NamedViewsStore {
  const rest = viewsForCut(store, cutId).filter((existing) => existing.id !== view.id);
  return withCutViews(store, cutId, [view, ...rest]);
}

export function renameView(store: NamedViewsStore, cutId: string, id: string, name: string): NamedViewsStore {
  const trimmed = cleanName(name);
  if (!trimmed) return store;
  const views = viewsForCut(store, cutId);
  if (!views.some((view) => view.id === id)) return store;
  return withCutViews(
    store,
    cutId,
    views.map((view) => (view.id === id ? { ...view, name: trimmed } : view)),
  );
}

export function deleteView(store: NamedViewsStore, cutId: string, id: string): NamedViewsStore {
  const views = viewsForCut(store, cutId);
  if (!views.some((view) => view.id === id)) return store;
  return withCutViews(
    store,
    cutId,
    views.filter((view) => view.id !== id),
  );
}

export function selectedViews(all: readonly NamedView[], ids: Iterable<string>): NamedView[] {
  const wanted = new Set(ids);
  return all.filter((view) => wanted.has(view.id));
}

export function allViews(all: readonly NamedView[]): NamedView[] {
  return [...all];
}

export function isPngExportable(view: NamedView): boolean {
  return view.snapshot.tab === "3d";
}

export function viewFileStem(name: string): string {
  const stem = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80)
    .replace(/[-.]+$/g, "");
  return stem || "view";
}

export function viewPngFilename(name: string): string {
  return `${viewFileStem(name)}.png`;
}

export function viewPngFilenames(views: readonly Pick<NamedView, "name">[]): string[] {
  const used = new Map<string, number>();
  return views.map((view) => {
    const stem = viewFileStem(view.name);
    const key = stem.toLowerCase();
    const seen = used.get(key) ?? 0;
    used.set(key, seen + 1);
    return seen === 0 ? `${stem}.png` : `${stem}-${seen + 1}.png`;
  });
}

export function viewsZipName(site: string): string {
  return `${viewFileStem(site)}-views.zip`;
}
