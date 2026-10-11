export const VIEW3D_WHITE_CARD_KEY = "citycut.view3d.whiteCard";
export const VIEW3D_OUTLINES_KEY = "citycut.view3d.outlines";
export const VIEW3D_CONTOURS_KEY = "citycut.view3d.contours";
export const VIEW3D_HIDE_TREES_KEY = "citycut.view3d.hideTrees";

export type View3dDisplaySettings = {
  whiteCard: boolean;
  showOutlines: boolean;
  showContours3d: boolean;
  hideTrees: boolean;
};

export const DEFAULT_VIEW3D_DISPLAY: View3dDisplaySettings = {
  whiteCard: false,
  showOutlines: true,
  showContours3d: false,
  hideTrees: false,
};

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

export function readStoredView3dDisplay(storage: KeyValueStore): View3dDisplaySettings {
  return {
    whiteCard: readFlag(storage, VIEW3D_WHITE_CARD_KEY, DEFAULT_VIEW3D_DISPLAY.whiteCard),
    showOutlines: readFlag(storage, VIEW3D_OUTLINES_KEY, DEFAULT_VIEW3D_DISPLAY.showOutlines),
    showContours3d: readFlag(storage, VIEW3D_CONTOURS_KEY, DEFAULT_VIEW3D_DISPLAY.showContours3d),
    hideTrees: readFlag(storage, VIEW3D_HIDE_TREES_KEY, DEFAULT_VIEW3D_DISPLAY.hideTrees),
  };
}

export function writeStoredView3dDisplay(storage: KeyValueStore, settings: View3dDisplaySettings): void {
  try {
    storage.setItem(VIEW3D_WHITE_CARD_KEY, settings.whiteCard ? "1" : "0");
    storage.setItem(VIEW3D_OUTLINES_KEY, settings.showOutlines ? "1" : "0");
    storage.setItem(VIEW3D_CONTOURS_KEY, settings.showContours3d ? "1" : "0");
    storage.setItem(VIEW3D_HIDE_TREES_KEY, settings.hideTrees ? "1" : "0");
  } catch {
    // Private mode can reject localStorage.
  }
}

/** Display toggles must never refit the orbit camera. */
export function snapWhenTogglingView3dDisplay(): boolean {
  return false;
}
