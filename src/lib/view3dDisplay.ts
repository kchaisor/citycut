export const VIEW3D_WHITE_CARD_KEY = "citycut.view3d.whiteCard";
export const VIEW3D_OUTLINES_KEY = "citycut.view3d.outlines";
export const VIEW3D_CONTOURS_KEY = "citycut.view3d.contours.v2";
export const VIEW3D_HIDE_TREES_KEY = "citycut.view3d.hideTrees";
export const VIEW3D_LAYERS_KEY = "citycut.view3d.layers";

export const LAYER_3D_IDS = [
  "buildings",
  "roads",
  "footpaths",
  "trees",
  "landscape",
  "water",
  "blocks",
  "rail",
  "contours",
] as const;

export type Layer3dId = (typeof LAYER_3D_IDS)[number];

export type View3dLayerVisibility = Record<Layer3dId, boolean>;

export const DEFAULT_VIEW3D_LAYERS_VISIBLE: View3dLayerVisibility = {
  buildings: true,
  roads: true,
  footpaths: true,
  trees: true,
  landscape: true,
  water: true,
  blocks: true,
  rail: true,
  contours: true,
};

export type View3dDisplaySettings = {
  whiteCard: boolean;
  showOutlines: boolean;
  showContours3d: boolean;
  hideTrees: boolean;
  layersVisible?: Partial<View3dLayerVisibility>;
};

export const DEFAULT_VIEW3D_DISPLAY: View3dDisplaySettings = {
  whiteCard: false,
  showOutlines: true,
  showContours3d: true,
  hideTrees: false,
  layersVisible: { ...DEFAULT_VIEW3D_LAYERS_VISIBLE },
};

export function isLayer3dVisible(display: View3dDisplaySettings, id: Layer3dId): boolean {
  if (id === "contours") return display.showContours3d;
  if (id === "trees") return !display.hideTrees;
  return display.layersVisible?.[id] ?? DEFAULT_VIEW3D_LAYERS_VISIBLE[id];
}

export function setLayer3dVisible(
  display: View3dDisplaySettings,
  id: Layer3dId,
  visible: boolean,
): View3dDisplaySettings {
  const nextLayers: View3dLayerVisibility = {
    ...DEFAULT_VIEW3D_LAYERS_VISIBLE,
    ...(display.layersVisible ?? {}),
    contours: display.showContours3d,
    trees: !display.hideTrees,
    [id]: visible,
  };
  return {
    ...display,
    showContours3d: id === "contours" ? visible : display.showContours3d,
    hideTrees: id === "trees" ? !visible : display.hideTrees,
    layersVisible: nextLayers,
  };
}

/**
 * Trees show in the 3D viewport (and so the PNG, which captures it) only when the Trees layer is on
 * AND "Hide trees" is off. The 3D-view .ai (aiView.ts) and the .3dm (rhinoExport.ts) use this too.
 */
export function treesVisibleIn3d(
  layers: { trees: boolean },
  display: Pick<View3dDisplaySettings, "hideTrees" | "layersVisible">,
): boolean {
  const layerToggleOn = display.layersVisible?.trees ?? !display.hideTrees;
  return layers.trees && !display.hideTrees && layerToggleOn;
}

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function readFlag(storage: KeyValueStore, key: string, fallback: boolean): boolean {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function readStoredLayers(
  storage: KeyValueStore,
  showContours3d: boolean,
  hideTrees: boolean,
): View3dLayerVisibility {
  const base: View3dLayerVisibility = {
    ...DEFAULT_VIEW3D_LAYERS_VISIBLE,
    contours: showContours3d,
    trees: !hideTrees,
  };
  try {
    const raw = storage.getItem(VIEW3D_LAYERS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const id of LAYER_3D_IDS) {
      if (id === "contours" || id === "trees") continue;
      if (typeof parsed[id] === "boolean") {
        base[id] = parsed[id];
      }
    }
    return base;
  } catch {
    return base;
  }
}

export function readStoredView3dDisplay(storage: KeyValueStore): View3dDisplaySettings {
  const showContours3d = readFlag(storage, VIEW3D_CONTOURS_KEY, DEFAULT_VIEW3D_DISPLAY.showContours3d);
  const hideTrees = readFlag(storage, VIEW3D_HIDE_TREES_KEY, DEFAULT_VIEW3D_DISPLAY.hideTrees);
  return {
    whiteCard: readFlag(storage, VIEW3D_WHITE_CARD_KEY, DEFAULT_VIEW3D_DISPLAY.whiteCard),
    showOutlines: readFlag(storage, VIEW3D_OUTLINES_KEY, DEFAULT_VIEW3D_DISPLAY.showOutlines),
    showContours3d,
    hideTrees,
    layersVisible: readStoredLayers(storage, showContours3d, hideTrees),
  };
}

/**
 * When a model opens, all 3D layers start turned ON.
 */
export function view3dDisplayForModelOpen(storage: KeyValueStore): View3dDisplaySettings {
  const stored = readStoredView3dDisplay(storage);
  return {
    ...stored,
    showContours3d: true,
    hideTrees: false,
    layersVisible: { ...DEFAULT_VIEW3D_LAYERS_VISIBLE },
  };
}

export function writeStoredView3dDisplay(storage: KeyValueStore, settings: View3dDisplaySettings): void {
  const mergedLayers: View3dLayerVisibility = {
    ...DEFAULT_VIEW3D_LAYERS_VISIBLE,
    ...(settings.layersVisible ?? {}),
    contours: settings.showContours3d,
    trees: !settings.hideTrees,
  };
  try {
    storage.setItem(VIEW3D_WHITE_CARD_KEY, settings.whiteCard ? "1" : "0");
    storage.setItem(VIEW3D_OUTLINES_KEY, settings.showOutlines ? "1" : "0");
    storage.setItem(VIEW3D_CONTOURS_KEY, settings.showContours3d ? "1" : "0");
    storage.setItem(VIEW3D_HIDE_TREES_KEY, settings.hideTrees ? "1" : "0");
    storage.setItem(VIEW3D_LAYERS_KEY, JSON.stringify(mergedLayers));
  } catch {
    // Private mode can reject localStorage.
  }
}

/** Display toggles must never refit the orbit camera. */
export function snapWhenTogglingView3dDisplay(): boolean {
  return false;
}
